"""로그인 수면의 이어 붙일 수 있는 잔물결 법선 지도를 굽는다.

블렌더 5.2.1에서 화면 없이 실행한다. --python-exit-code 1이 있어야 오류가 종료 코드로 드러난다.
  blender -b --factory-startup --python-exit-code 1 --python tools/blender/bake_water_normals.py -- \
    --cache output/daylight-water-20260927/ocean-cache \
    --out apps/web/public/images/login/water-normal.webp \
    --mobile apps/web/public/images/login/mobile/water-normal.webp \
    --preview output/daylight-water-20260927/water-normal-tiled.png

Ocean 모디파이어(Phillips 스펙트럼)의 높이 변위를 한 프레임 굽고, 주기 경계를 감싼 중앙 차분으로
접선 공간 법선(OpenGL +Y)을 계산한다. 굽는 범위가 스펙트럼의 공간 주기와 같아 결과가 이어 붙는다.
"""

import argparse
import os
import sys
import time

import bpy
import numpy as np


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :]
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--mobile", required=True)
    parser.add_argument("--preview", required=True)
    return parser.parse_args(argv)


def wait_for_file(path):
    # ocean_bake는 백그라운드 작업이다. 파일 크기가 1초 동안 그대로일 때까지 기다린다.
    last, stable = -1, 0
    for _ in range(240):
        size = os.path.getsize(path) if os.path.exists(path) else -1
        stable = stable + 1 if size > 0 and size == last else 0
        if stable >= 2:
            return
        last = size
        time.sleep(0.5)
    raise RuntimeError(f"ocean bake did not finish: {path}")


def bake_height(cache):
    # Ocean 캐시는 상대 경로를 주면 파일을 쓰지 않는다. 절대 경로로 바꾼다.
    cache = os.path.abspath(cache)
    os.makedirs(cache, exist_ok=True)
    for name in os.listdir(cache):
        os.remove(os.path.join(cache, name))
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.mesh.primitive_plane_add(size=2)
    plane = bpy.context.active_object
    ocean = plane.modifiers.new("ocean", "OCEAN")
    ocean.geometry_mode = "GENERATE"
    ocean.resolution = 32  # 32 x 32 = 1024px
    ocean.spatial_size = 24  # 공간 주기(m). 셰이더가 세 배율로 다시 나눈다.
    ocean.wind_velocity = 7.0  # 잔잔한 바다. 기본 30m/s는 너울이 너무 크다.
    # 가장 작은 물결을 약 4텍셀로 둔다. 손실 WebP의 색차 2x2 압축에 뭉개지지 않는다.
    ocean.wave_scale_min = 0.1
    ocean.wave_alignment = 0.35  # 물마루가 한 방향으로 조금 정렬된다.
    ocean.wave_direction = 0.0
    ocean.choppiness = 0.0  # 수평 변위 없이 높이만 쓴다.
    ocean.random_seed = 7
    ocean.use_normals = False
    ocean.filepath = cache
    ocean.frame_start = 1
    ocean.frame_end = 1
    with bpy.context.temp_override(object=plane, active_object=plane):
        bpy.ops.object.ocean_bake(modifier="ocean")
    path = os.path.join(cache, "disp_0001.exr")
    wait_for_file(path)
    image = bpy.data.images.load(path)
    image.colorspace_settings.name = "Non-Color"
    width, height = image.size
    pixels = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)
    channel = int(np.argmax([pixels[..., index].std() for index in range(3)]))
    print(f"HEIGHT {width}x{height} channel={channel} std={pixels[..., channel].std():.4f}")
    if width != height or width < 512:
        raise RuntimeError(f"unexpected bake size {width}x{height}")
    return pixels[..., channel].astype(np.float64), ocean.spatial_size


def normals_from_height(heights, texel):
    dx = (np.roll(heights, -1, axis=1) - np.roll(heights, 1, axis=1)) / (2 * texel)
    dy = (np.roll(heights, -1, axis=0) - np.roll(heights, 1, axis=0)) / (2 * texel)
    # 기울기 99번째 백분위수를 0.9로 맞춘다. 셰이더가 겹별 세기를 다시 곱한다.
    scale = 0.9 / np.percentile(np.hypot(dx, dy), 99.0)
    normals = np.stack([-dx * scale, -dy * scale, np.ones_like(heights)], axis=-1)
    normals /= np.linalg.norm(normals, axis=-1, keepdims=True)
    return normals, scale


def save(path, rgb, quality):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    height, width, _ = rgb.shape
    image = bpy.data.images.new(os.path.basename(path), width, height, alpha=False)
    image.colorspace_settings.name = "Non-Color"
    rgba = np.concatenate([rgb, np.ones((height, width, 1))], axis=-1)
    image.pixels.foreach_set(rgba.astype(np.float32).ravel())
    image.file_format = "WEBP" if path.endswith(".webp") else "PNG"
    image.save(filepath=os.path.abspath(path), quality=quality)
    reloaded = bpy.data.images.load(os.path.abspath(path))
    reloaded.colorspace_settings.name = "Non-Color"
    back = np.array(reloaded.pixels[:], dtype=np.float32).reshape(height, width, 4)[..., :3]
    error = float(np.abs(back - rgb).mean())
    print(f"SAVED {path} {width}x{height} {os.path.getsize(path)} bytes mean_error={error:.4f}")
    # 손실 WebP 오차는 허용하되, 채널 순서나 색 공간이 틀린 큰 오차는 막는다.
    if error > 0.03:
        raise RuntimeError(f"saved image differs from source: {path}")


def main():
    args = parse_args()
    heights, spatial = bake_height(args.cache)
    size = heights.shape[0]
    normals, scale = normals_from_height(heights, spatial / size)
    rgb = normals * 0.5 + 0.5
    seam = float(np.abs(rgb[:, 0] - rgb[:, -1]).mean())
    neighbor = float(np.abs(rgb[:, 1] - rgb[:, 0]).mean())
    print(f"NORMAL {size}px slope_scale={scale:.4f} seam={seam:.4f} neighbor={neighbor:.4f}")
    if seam > neighbor * 1.5:
        raise RuntimeError("normal map does not tile")
    save(args.out, rgb, 92)
    small = normals.reshape(size // 2, 2, size // 2, 2, 3).mean(axis=(1, 3))
    small /= np.linalg.norm(small, axis=-1, keepdims=True)
    save(args.mobile, small * 0.5 + 0.5, 92)
    save(args.preview, np.tile(rgb, (2, 2, 1)), 100)


main()
