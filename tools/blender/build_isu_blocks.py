"""ISU 로그인 블록 모델을 만든다.

블렌더 5.2.1에서 화면 없이 실행한다.
  blender -b --factory-startup --python tools/blender/build_isu_blocks.py -- \
    --layout tools/blender/isu-layout.json \
    --out apps/web/public/models/isu-blocks.glb \
    --preview output/blender/isu-blocks-preview.png \
    --closeup output/blender/isu-blocks-closeup.png

좌표: three (x, y, z)를 블렌더 (x, -z, y)로 둔다. glTF 내보내기의 export_yup이 되돌린다.
정점 색 isu: R=AO, G=모서리 마모, B=블록별 색조 편차.

고해상도 조각과 굽기: 내보내는 저해상도 블록(sculpt() 완료본)을 복제해 VOXEL_HI로 다시
리메시하고, 끌 자국/공동/서리 결 세 겹을 법선 방향으로 더한 뒤 저해상도 블록의 공유 UV
아틀라스에 normal/AO/볼록도를 구워 담는다. 조각본은 내보내지 않는다.
"""

import argparse
import json
import math
import os
import random
import sys
import time

import bmesh
import bpy
import numpy as np
from mathutils import Vector, noise

VOXEL = 0.028  # 리메시 해상도(월드 단위)
VOXEL_HI = 0.008  # 고해상도 조각본 리메시 해상도(월드 단위)
BEVEL_MIN = 0.025  # 블록별 모서리 깎기 범위(최소)
BEVEL_MAX = 0.05  # 블록별 모서리 깎기 범위(최대), 손으로 깎은 듯 블록마다 다르게
LUMP_LOW = 0.028  # 저주파 굴곡(큰 완만한 융기/패임)
LUMP_HIGH = 0.01  # 고주파 굴곡(작은 곰보 자국)
CHIP_MIN = 1  # 블록당 코너 이 빠진 자국 최소 개수
CHIP_MAX = 3  # 블록당 코너 이 빠진 자국 최대 개수
WEAR_GAIN = 6.0  # 곡률을 마모 값으로 바꾸는 배율
CORNER_SIGN = {"tl": (-1, 1), "tr": (1, 1), "bl": (-1, -1), "br": (1, -1)}

CHISEL_HI_MIN = 4  # 고해상도 끌 자국 블록당 최소 개수
CHISEL_HI_MAX = 7  # 고해상도 끌 자국 블록당 최대 개수
CAVITY_CELL = 0.06  # 공동 보로노이 셀 크기(월드 단위)
FROST_AMPLITUDE = 0.0015  # 서리 결 진폭
EDGE_PRESERVE_BAND = 0.02  # 윤곽 모서리에서 이 거리 안은 변위를 절반으로 줄인다
ATLAS_SIZE = 2048  # 질감 아틀라스 해상도(데스크톱)
MOBILE_ATLAS_SIZE = ATLAS_SIZE // 2  # 모바일 축소본 해상도
BAKE_CAGE_EXTRUSION = 0.015
BAKE_MAX_RAY_DISTANCE = 0.03


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--layout", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--preview")
    parser.add_argument("--closeup")
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="고해상도 조각+굽기를 앞쪽 N개 블록에만 적용한다(시간 측정용 테스트 전용).",
    )
    return parser.parse_args(argv)


def smoothstep(edge0, edge1, x):
    t = max(0.0, min(1.0, (x - edge0) / (edge1 - edge0)))
    return t * t * (3 - 2 * t)


def activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def chip_corners(bm, width, height, depth, seed, corner):
    # 저해상도 상태에서 2~3개 코너를 평면으로 실제로 잘라내고 새 단면을 채운다.
    # 로고 둥근 모서리(corner)와 같은 코너는 건너뛰어 둥근 윤곽을 지킨다. 모서리(edge) 이 자국은 만들지 않는다.
    rng = random.Random(seed)
    skip_xz = CORNER_SIGN.get(corner)
    half = Vector((width / 2, depth / 2, height / 2))
    target = rng.randint(CHIP_MIN, CHIP_MAX)
    tried = set()
    cut = 0
    attempts = 0
    while cut < target and attempts < 12:
        attempts += 1
        sx = 1.0 if rng.random() < 0.5 else -1.0
        sy = -1.0 if rng.random() < 0.75 else 1.0
        sz = 1.0 if rng.random() < 0.5 else -1.0
        key = (sx, sy, sz)
        if key in tried:
            continue
        tried.add(key)
        if skip_xz is not None and (sx, sz) == (float(skip_xz[0]), float(skip_xz[1])):
            continue
        normal = Vector((sx, sy, sz)).normalized()
        tilt = Vector(
            (rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25))
        )
        normal = (normal + tilt).normalized()
        chip_depth = rng.uniform(0.06, 0.13)
        corner_point = Vector((sx * half.x, sy * half.y, sz * half.z))
        plane_co = corner_point - normal * chip_depth
        result = bmesh.ops.bisect_plane(
            bm,
            geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
            plane_co=plane_co,
            plane_no=normal,
            clear_outer=True,
        )
        new_edges = [edge for edge in result["geom_cut"] if isinstance(edge, bmesh.types.BMEdge)]
        if new_edges:
            bmesh.ops.edgeloop_fill(bm, edges=new_edges)
        cut += 1


def chisel_facets(bm, width, height, depth, seed, corner):
    # 저해상도 상태에서 면 하나에 걸쳐 크게 기운 평면 절단면(끌로 깎은 자국) 1~2개를 낸다.
    # 앞면(-Y)을 우선하고(0.6), 위(+Z)나 옆(±X)도 고른다. 코너 이 자국(chip_corners)과는
    # 독립된 시드 스트림을 써서 같은 첫 난수가 겹치지 않게 한다.
    rng = random.Random(seed * 97 + 13)
    skip_xz = CORNER_SIGN.get(corner)
    half = Vector((width / 2, depth / 2, height / 2))
    target = rng.randint(1, 2)
    tried = set()
    cut = 0
    attempts = 0
    while cut < target and attempts < 12:
        attempts += 1
        pick = rng.random()
        if pick < 0.6:
            face_axis = "front"
            normal = Vector((0.0, -1.0, 0.0))
            face_center = Vector((0.0, -half.y, 0.0))
            in_plane, in_plane_size = rng.choice((("x", width), ("z", height)))
        elif pick < 0.8:
            face_axis = "top"
            normal = Vector((0.0, 0.0, 1.0))
            face_center = Vector((0.0, 0.0, half.z))
            in_plane, in_plane_size = rng.choice((("x", width), ("y", depth)))
        else:
            face_axis = "side"
            side_sign = 1.0 if rng.random() < 0.5 else -1.0
            normal = Vector((side_sign, 0.0, 0.0))
            face_center = Vector((side_sign * half.x, 0.0, 0.0))
            in_plane, in_plane_size = rng.choice((("y", depth), ("z", height)))
        shift_sign = 1.0 if rng.random() < 0.5 else -1.0
        key = (face_axis, in_plane, shift_sign)
        if key in tried:
            continue
        tried.add(key)
        if (
            face_axis == "front"
            and skip_xz is not None
            and (
                (in_plane == "x" and shift_sign == float(skip_xz[0]))
                or (in_plane == "z" and shift_sign == float(skip_xz[1]))
            )
        ):
            # 로고 둥근 모서리 쪽으로 향하는 앞면 절단은 건너뛴다.
            continue
        axis_index = {"x": 0, "y": 1, "z": 2}[in_plane]
        tilt_dir = Vector((0.0, 0.0, 0.0))
        tilt_dir[axis_index] = shift_sign
        theta = math.radians(rng.uniform(5.0, 10.0))
        tilted_normal = (normal * math.cos(theta) + tilt_dir * math.sin(theta)).normalized()
        chisel_depth = rng.uniform(0.035, 0.045)
        edge_frac = rng.uniform(0.15, 0.35)
        plane_co = face_center - normal * chisel_depth + tilt_dir * (edge_frac * in_plane_size)
        result = bmesh.ops.bisect_plane(
            bm,
            geom=bm.verts[:] + bm.edges[:] + bm.faces[:],
            plane_co=plane_co,
            plane_no=tilted_normal,
            clear_outer=True,
        )
        new_edges = [edge for edge in result["geom_cut"] if isinstance(edge, bmesh.types.BMEdge)]
        if new_edges:
            bmesh.ops.edgeloop_fill(bm, edges=new_edges)
        cut += 1


def prism_mesh(bm, outline, depth):
    # 로고 윤곽을 앞뒤로 depth만큼 세운 각기둥. 블렌더 x = 윤곽 x, z = 윤곽 y, y = 두께 방향.
    front = [bm.verts.new((x, -depth / 2, y)) for x, y in outline]
    back = [bm.verts.new((x, depth / 2, y)) for x, y in outline]
    bm.faces.new(front)
    bm.faces.new(back)
    count = len(outline)
    for i in range(count):
        j = (i + 1) % count
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bm.normal_update()
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])


def base_mesh(name, spec, seed):
    width, height, depth = spec["size"]
    corner = spec["corner"]
    outline = spec.get("outline")
    bm = bmesh.new()
    chip_ratio = None
    if outline:
        prism_mesh(bm, outline, depth)
        raw_volume = bm.calc_volume(signed=False)
        chip_corners(bm, width, height, depth, seed, corner)
        chisel_facets(bm, width, height, depth, seed, corner)
        cut_volume = bm.calc_volume(signed=False)
        chip_ratio = cut_volume / raw_volume if raw_volume > 0 else 1.0
    else:
        bmesh.ops.create_cube(bm, size=1.0)
        for vert in bm.verts:
            vert.co.x *= width
            vert.co.y *= depth
            vert.co.z *= height
        if corner != "none":
            # 로고에서 둥근 바깥 모서리: 두께 방향 모서리 하나를 블록 크기만큼 크게 깎는다.
            # (outline 블록은 항상 corner가 none이라 이 처리를 받지 않는다.)
            sx, sz = CORNER_SIGN[corner]
            edges = [
                edge
                for edge in bm.edges
                if all(
                    abs(vert.co.x - sx * width / 2) < 1e-5
                    and abs(vert.co.z - sz * height / 2) < 1e-5
                    for vert in edge.verts
                )
            ]
            bmesh.ops.bevel(
                bm,
                geom=edges,
                offset=min(width, height) * 0.9,
                offset_type="OFFSET",
                segments=16,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=False,
            )
        chip_corners(bm, width, height, depth, seed, corner)
        chisel_facets(bm, width, height, depth, seed, corner)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return mesh, chip_ratio


def apply_modifiers(obj):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(depsgraph))
    old = obj.data
    obj.modifiers.clear()
    obj.data = mesh
    bpy.data.meshes.remove(old)


def quality_check(bm, half):
    # 블록 중심에서 먼 면 중 법선이 안쪽을 향하는 면과, 면적이 0에 가까운 퇴화 면을 센다. 둘 다 0이어야 한다.
    threshold = min(half.x, half.y, half.z) * 0.5
    inward = 0
    degenerate = 0
    for face in bm.faces:
        area = face.calc_area()
        if area < 1e-8:
            degenerate += 1
            continue
        center = face.calc_center_median()
        if center.length > threshold and center.dot(face.normal) < 0:
            inward += 1
    return inward, degenerate


def sculpt(obj, spec, seed):
    width, height, depth = spec["size"]
    bevel = obj.modifiers.new("bevel", "BEVEL")
    # 블록마다 손으로 깎은 듯 모서리 깎기 폭을 다르게 한다(시드로 결정론적).
    bevel.width = random.Random(seed).uniform(BEVEL_MIN, BEVEL_MAX)
    bevel.segments = 3
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(40)
    remesh = obj.modifiers.new("remesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = VOXEL
    apply_modifiers(obj)

    half = Vector((width / 2, depth / 2, height / 2))
    lump_scale = 0.35 if spec.get("outline") else 1.0
    offset = Vector((seed * 3.1, seed * 1.7, seed * 5.3))
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()

    moves = []
    for vert in bm.verts:
        p = vert.co
        # 두 축 이상이 끝에 가까운 곳을 모서리로 본다.
        edge = max(
            0.0,
            min(
                1.0,
                smoothstep(0.72, 1.0, abs(p.x) / half.x)
                + smoothstep(0.72, 1.0, abs(p.y) / half.y)
                + smoothstep(0.72, 1.0, abs(p.z) / half.z)
                - 1.0,
            ),
        )
        # 두 겹 굴곡: 저주파(큰 완만한 융기/패임)와 고주파(작은 곰보 자국)를 더한다.
        # outline 블록은 비스듬한 면 절단으로 국소적으로 얇아진 곳이 있어 절반 진폭만 쓴다.
        lump_low = (
            max(-1.5, min(1.5, noise.fractal(p * 1.0 + offset, 0.9, 2.0, 3)))
            * LUMP_LOW
            * lump_scale
        )
        lump_high = (
            max(-1.5, min(1.5, noise.fractal(p * 5.0 + offset * 1.7, 0.7, 2.1, 3)))
            * LUMP_HIGH
            * lump_scale
        )
        # 모서리 근처에만 고주파 잔부스러기를 더한다.
        crumble = noise.noise(p * 18.0 + offset) * 0.006 * edge
        moves.append((vert, vert.normal.copy() * (lump_low + lump_high + crumble)))
    for vert, move in moves:
        vert.co += move
    bm.normal_update()

    # 정점 이동으로 생길 수 있는 겹친 정점/퇴화 지오메트리를 정리하고 법선을 다시 계산한다.
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.001)
    bmesh.ops.dissolve_degenerate(bm, dist=0.001, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()

    inward, degenerate = quality_check(bm, half)
    print(f"ISU_BLOCKS block={obj.name} inward={inward} degenerate={degenerate}")

    bm.to_mesh(obj.data)
    bm.free()
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    # 이 빠진 평평한 면과 몸통 경계를 날카롭게, 나머지는 부드럽게 유지한다.
    obj.data.set_sharp_from_angle(angle=math.radians(32))
    return inward, degenerate


def edge_factor_absolute(p, half, band=EDGE_PRESERVE_BAND):
    # half.x/y/z 경계에서 band 거리 안, 그것도 두 축 이상이 동시에 경계에 가까운 곳(=모서리)만 1에 가깝다.
    nx = smoothstep(half.x - band, half.x, abs(p.x))
    ny = smoothstep(half.y - band, half.y, abs(p.y))
    nz = smoothstep(half.z - band, half.z, abs(p.z))
    return max(0.0, min(1.0, nx + ny + nz - 1.0))


def build_chisel_marks(half, seed):
    # 블록당 4~7개의 얕은 홈 선분을 만든다. 앞면(-Y)을 우선(0.6), 위/옆은 고르게.
    rng = random.Random(seed * 131 + 7)
    count = rng.randint(CHISEL_HI_MIN, CHISEL_HI_MAX)
    marks = []
    for _ in range(count):
        pick = rng.random()
        if pick < 0.6:
            normal = Vector((0.0, -1.0, 0.0))
            u_axis, v_axis = Vector((1.0, 0.0, 0.0)), Vector((0.0, 0.0, 1.0))
            u_extent, v_extent = half.x, half.z
            plane_pos = Vector((0.0, -half.y, 0.0))
        elif pick < 0.8:
            normal = Vector((0.0, 0.0, 1.0))
            u_axis, v_axis = Vector((1.0, 0.0, 0.0)), Vector((0.0, 1.0, 0.0))
            u_extent, v_extent = half.x, half.y
            plane_pos = Vector((0.0, 0.0, half.z))
        else:
            side = 1.0 if rng.random() < 0.5 else -1.0
            normal = Vector((side, 0.0, 0.0))
            u_axis, v_axis = Vector((0.0, 1.0, 0.0)), Vector((0.0, 0.0, 1.0))
            u_extent, v_extent = half.y, half.z
            plane_pos = Vector((side * half.x, 0.0, 0.0))
        span = 0.7  # 홈 양 끝을 실루엣 모서리에서 조금 안쪽으로 둔다.
        u0 = rng.uniform(-u_extent * span, u_extent * span)
        v0 = rng.uniform(-v_extent * span, v_extent * span)
        angle = rng.uniform(0.0, math.pi)
        length = rng.uniform(0.3, 0.8) * min(u_extent, v_extent) * 2.0
        u1 = max(-u_extent * span, min(u_extent * span, u0 + math.cos(angle) * length))
        v1 = max(-v_extent * span, min(v_extent * span, v0 + math.sin(angle) * length))
        marks.append(
            {
                "normal": normal,
                "p0": plane_pos + u_axis * u0 + v_axis * v0,
                "p1": plane_pos + u_axis * u1 + v_axis * v1,
                "width": rng.uniform(0.04, 0.09),
                "depth": rng.uniform(0.006, 0.014),
            }
        )
    return marks


def chisel_depth_at(marks, p, vertex_normal):
    # 겹치는 홈은 깊이를 더하지 않고 가장 깊은 홈만 반영한다(실제 끌 자국도 겹쳐 판다고
    # 두 배로 깊어지지 않는다). 더하면 여러 홈이 겹치는 자리에서 국소적으로 너무 깊어져
    # 얇은 벽(윤곽 블록, 코너 칩 자국)이 자기 자신과 겹치는 접힘을 만든다.
    deepest = 0.0
    for mark in marks:
        along = mark["p1"] - mark["p0"]
        length_sq = along.length_squared
        if length_sq < 1e-9:
            continue
        t = max(0.0, min(1.0, (p - mark["p0"]).dot(along) / length_sq))
        closest = mark["p0"] + along * t
        d = (p - closest).length
        if d >= mark["width"]:
            continue
        cross_section = mark["depth"] * (1.0 - (d / mark["width"]) ** 2)
        # 선분 양 끝 20%는 깊이를 줄여 자연스럽게 끝나게 한다.
        taper = min(smoothstep(0.0, 0.2, t), 1.0 - smoothstep(0.8, 1.0, t))
        # 그 면을 바라보는 정점에만 적용한다(다른 면으로 새지 않게).
        facing = max(0.0, vertex_normal.dot(mark["normal"])) ** 2
        deepest = max(deepest, cross_section * taper * facing)
    return deepest


def cavity_depth_at(p, offset, cell):
    sample = (p + offset) / cell
    distances, _points = noise.voronoi(sample.to_tuple())
    d0 = distances[0] * cell
    threshold = cell * 0.5 * 0.35
    if d0 >= threshold:
        return 0.0
    t = d0 / threshold
    depth = 0.008 * (1.0 - t) + 0.004 * t
    # 경계(t=1)에서 깊이가 0.004에서 0으로 뚝 끊기면 그 자리 기울기가 복셀 크기보다
    # 커져 표면이 접힌다. 마지막 30%(t 0.7~1.0) 구간에서 0으로 부드럽게 뺀다.
    taper = smoothstep(1.0, 0.7, t)
    return depth * taper


def build_hires_duplicate(obj, spec, seed):
    # 지금의 sculpt()까지 끝난 저해상도 블록을 복제해 VOXEL_HI로 다시 리메시하고
    # 끌 자국/공동/서리 결 세 겹을 법선 방향으로 더한다. 윤곽 모서리 근처는 변위를 절반으로 줄인다.
    width, height, depth = spec["size"]
    half = Vector((width / 2, depth / 2, height / 2))
    hires = obj.copy()
    hires.data = obj.data.copy()
    hires.name = f"{obj.name}-hires"
    bpy.context.collection.objects.link(hires)

    remesh = hires.modifiers.new("remesh_hi", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = VOXEL_HI
    apply_modifiers(hires)

    marks = build_chisel_marks(half, seed)
    cavity_offset = Vector((seed * 7.3 + 11.0, seed * 11.9 + 5.0, seed * 4.1 + 2.0))
    frost_offset = Vector((seed * 3.1, seed * 1.7, seed * 5.3))
    # 브리프의 홈/공동 깊이 범위를 그대로 정점 변위로 옮기면 VOXEL_HI(0.008) 한 걸음
    # 사이의 기울기가 너무 가팔라 27블록 전체에서 표면이 자기 자신과 접혔다(quality_check
    # inward>0). 윤곽(outline) 블록은 옆면이 비스듬히 깎여 더 얇아 배율을 더 줄인다.
    # 실측(check_hires_quality 반복): 두 배율과 절대값 한도를 함께 낮춰야 27블록 전체
    # inward=0 degenerate=0에 도달했다(자세한 값은 task-blender-detail-report.md 참고).
    detail_scale = 0.12 if spec.get("outline") else 0.32
    depth_limit = 0.0065

    bm = bmesh.new()
    bm.from_mesh(hires.data)
    bm.normal_update()

    moves = []
    for vert in bm.verts:
        p = vert.co
        chisel = -chisel_depth_at(marks, p, vert.normal)
        cavity = -cavity_depth_at(p, cavity_offset, CAVITY_CELL)
        frost = noise.fractal(p * 40.0 + frost_offset, 0.9, 2.0, 3) * FROST_AMPLITUDE
        total = (chisel + cavity + frost) * detail_scale
        total *= 1.0 - edge_factor_absolute(p, half) * 0.5
        total = max(-depth_limit, min(depth_limit, total))
        moves.append((vert, vert.normal.copy() * total))
    for vert, move in moves:
        vert.co += move
    bm.normal_update()

    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
    bmesh.ops.dissolve_degenerate(bm, dist=0.0005, edges=bm.edges)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()

    inward, degenerate = quality_check(bm, half)
    print(f"ISU_BLOCKS hires block={hires.name} inward={inward} degenerate={degenerate}")

    bm.to_mesh(hires.data)
    triangle_count = sum(len(face.verts) - 2 for face in bm.faces)
    bm.free()
    for polygon in hires.data.polygons:
        polygon.use_smooth = True
    hires.data.set_sharp_from_angle(angle=math.radians(32))
    return hires, triangle_count, inward, degenerate


def unwrap_atlas(blocks):
    # 내보내는 저해상도 블록 전부를 하나의 아틀라스(0~1)로 겹치지 않게 모은다.
    # 기존 블록별 unwrap()을 대체한다.
    bpy.ops.object.select_all(action="DESELECT")
    for obj in blocks:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = blocks[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66))
    bpy.ops.uv.pack_islands(margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")


def place(obj, spec):
    x, y, z = spec["center"]
    obj.location = (x, -z, y)


def prepare_colors(obj):
    mesh = obj.data
    attribute = mesh.color_attributes.new(name="isu", type="FLOAT_COLOR", domain="POINT")
    index = list(mesh.color_attributes).index(attribute)
    mesh.color_attributes.active_color_index = index
    mesh.color_attributes.render_color_index = index


def bake_ambient_occlusion(blocks):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 64
    scene.world = bpy.data.worlds.new("ao")
    scene.world.light_settings.distance = 0.8
    # 바닥 접촉 그림자를 위해 바닥면을 잠시 둔다.
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    ground = bpy.context.active_object
    for obj in blocks:
        activate(obj)
        bpy.ops.object.bake(type="AO", target="VERTEX_COLORS")
    bpy.data.objects.remove(ground, do_unlink=True)


def new_atlas_image(name, size):
    image = bpy.data.images.new(name, size, size, alpha=False, float_buffer=True)
    image.colorspace_settings.name = "Non-Color"
    return image


def bake_material_for_targets(blocks):
    # 저해상도 블록 전부가 공유하는 굽기용 재질. 이미지 텍스처 노드 3개를 두고
    # 굽는 대상(법선/디테일 AO/볼록도)에 따라 활성 노드를 바꾼다. 노드를 셰이더 출력에
    # 연결할 필요는 없다(굽기는 활성 이미지 노드와 활성 UV만 본다).
    material = bpy.data.materials.new("bake-target")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    normal_node = nodes.new("ShaderNodeTexImage")
    ao_node = nodes.new("ShaderNodeTexImage")
    convexity_node = nodes.new("ShaderNodeTexImage")
    for obj in blocks:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    return material, normal_node, ao_node, convexity_node


def set_active_node(material, node):
    for other in material.node_tree.nodes:
        other.select = False
    node.select = True
    material.node_tree.nodes.active = node


def convexity_material():
    # Geometry의 Pointiness를 (p-0.5)*4+0.5로 펴서 Emission으로 내보낸다.
    material = bpy.data.materials.new("bake-convexity")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    emission = nodes.new("ShaderNodeEmission")
    map_range = nodes.new("ShaderNodeMapRange")
    map_range.inputs["From Min"].default_value = 0.375
    map_range.inputs["From Max"].default_value = 0.625
    map_range.inputs["To Min"].default_value = 0.0
    map_range.inputs["To Max"].default_value = 1.0
    map_range.clamp = True
    geometry = nodes.new("ShaderNodeNewGeometry")
    links.new(geometry.outputs["Pointiness"], map_range.inputs["Value"])
    links.new(map_range.outputs["Result"], emission.inputs["Color"])
    links.new(emission.outputs["Emission"], output.inputs["Surface"])
    return material


def bake_detail_atlas(blocks, layout, size, limit=None):
    # 조각본 선택, 저해상도 활성으로 블록마다 같은 이미지에 이어서 굽는다(첫 블록 뒤에는
    # 이미지를 지우지 않는다). 메모리를 아끼려고 블록 하나씩 조각본을 만들고 굽고 지운다.
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"

    normal_image = new_atlas_image("isu-blocks-normal", size)
    ao_image = new_atlas_image("isu-blocks-ao-detail", size)
    convexity_image = new_atlas_image("isu-blocks-convexity", size)
    material, normal_node, ao_node, convexity_node = bake_material_for_targets(blocks)
    normal_node.image = normal_image
    ao_node.image = ao_image
    convexity_node.image = convexity_image
    convexity_src_material = convexity_material()

    detail_world = bpy.data.worlds.new("detail-ao")
    detail_world.light_settings.distance = 0.05

    targets = blocks if limit is None else blocks[:limit]
    hires_stats = []
    for index, obj in enumerate(targets):
        spec = layout[index]
        seed = index + 1
        start = time.time()
        hires_obj, tri_count, hires_inward, hires_degenerate = build_hires_duplicate(
            obj, spec, seed
        )
        hires_obj.data.materials.clear()
        hires_obj.data.materials.append(convexity_src_material)

        bpy.ops.object.select_all(action="DESELECT")
        hires_obj.select_set(True)
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj

        first = index == 0
        set_active_node(material, normal_node)
        scene.cycles.samples = 8
        bpy.ops.object.bake(
            type="NORMAL",
            use_selected_to_active=True,
            cage_extrusion=BAKE_CAGE_EXTRUSION,
            max_ray_distance=BAKE_MAX_RAY_DISTANCE,
            use_clear=first,
        )

        # AO 굽기는 use_selected_to_active로 목표 표면을 고르지만, 가려짐 자체는
        # 장면 전체를 본다. 다른 26개 블록이 그대로 있으면 이웃 블록의 접촉 그늘까지
        # 이 디테일 AO에 함께 구워져(브리프가 정점 색 R에 맡긴 몫과 겹쳐) 넓은 면이
        # 검게 죽는다. 이 굽기 동안만 다른 블록을 렌더링에서 숨긴다.
        others = [block for block in blocks if block is not obj]
        for other in others:
            other.hide_render = True
        set_active_node(material, ao_node)
        scene.world = detail_world
        scene.cycles.samples = 32
        bpy.ops.object.bake(
            type="AO",
            use_selected_to_active=True,
            cage_extrusion=BAKE_CAGE_EXTRUSION,
            max_ray_distance=BAKE_MAX_RAY_DISTANCE,
            use_clear=first,
        )
        for other in others:
            other.hide_render = False

        set_active_node(material, convexity_node)
        scene.cycles.samples = 8
        bpy.ops.object.bake(
            type="EMIT",
            use_selected_to_active=True,
            cage_extrusion=BAKE_CAGE_EXTRUSION,
            max_ray_distance=BAKE_MAX_RAY_DISTANCE,
            use_clear=first,
        )

        bpy.data.objects.remove(hires_obj, do_unlink=True)
        elapsed = time.time() - start
        hires_stats.append((obj.name, tri_count, elapsed, hires_inward, hires_degenerate))
        print(
            f"ISU_BLOCKS hires block={obj.name} triangles={tri_count} bake_time={elapsed:.1f}s"
        )

    return normal_image, ao_image, convexity_image, hires_stats


def combine_detail_image(ao_image, convexity_image, size):
    # 디테일 AO와 볼록도 두 흑백 결과를 합쳐 detail 질감(R=AO, G=볼록도, B=0)을 만든다.
    count = size * size * 4
    ao = np.empty(count, dtype=np.float32)
    convexity = np.empty(count, dtype=np.float32)
    ao_image.pixels.foreach_get(ao)
    convexity_image.pixels.foreach_get(convexity)
    ao = ao.reshape(-1, 4)
    convexity = convexity.reshape(-1, 4)
    detail_image = new_atlas_image("isu-blocks-detail", size)
    out = np.zeros_like(ao)
    # 작은 세계 조명 거리(0.05)로도 코너 칩/끌 절단면처럼 이미 저해상도 단계에서 깊게
    # 파낸 자리는 완전히 검게(AO~0) 구워진다. 그 몫은 정점 색 R(접촉 그늘)이 이미 맡고
    # 있으므로, 이 디테일 AO가 완전한 검은 구멍으로 보이지 않게 아래로 한도를 둔다(기존
    # 정점 AO가 쓰는 0.3 바닥과 맞춘다). 얕은 새 끌 자국/공동은 이 바닥까지 내려가지 않아
    # 대비가 줄지 않는다.
    out[:, 0] = np.maximum(ao[:, 0], 0.3)
    out[:, 1] = convexity[:, 0]
    out[:, 2] = 0.0
    out[:, 3] = 1.0
    detail_image.pixels.foreach_set(out.reshape(-1))
    detail_image.update()
    return detail_image


def configure_raw_image_settings(scene):
    # 법선/디테일은 데이터 텍스처라 뷰 변환 없이 원본 값 그대로 저장한다.
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.render.image_settings.color_mode = "RGB"


def save_webp_pair(image, desktop_path, mobile_path, quality):
    scene = bpy.context.scene
    scene.render.image_settings.file_format = "WEBP"
    scene.render.image_settings.quality = quality
    os.makedirs(os.path.dirname(os.path.abspath(desktop_path)), exist_ok=True)
    image.save_render(os.path.abspath(desktop_path), scene=scene)
    mobile_size = image.size[0] // 2
    image.scale(mobile_size, mobile_size)
    os.makedirs(os.path.dirname(os.path.abspath(mobile_path)), exist_ok=True)
    image.save_render(os.path.abspath(mobile_path), scene=scene)
    return os.path.getsize(desktop_path), os.path.getsize(mobile_path)


def edge_wear(mesh):
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.normal_update()
    wear = [0.0] * len(bm.verts)
    for vert in bm.verts:
        total = 0.0
        for edge in vert.link_edges:
            direction = (edge.other_vert(vert).co - vert.co).normalized()
            # 볼록한 곳은 이웃이 법선 반대편에 있어 값이 커진다.
            total -= direction.dot(vert.normal)
        count = max(len(vert.link_edges), 1)
        wear[vert.index] = max(0.0, min(1.0, total / count * WEAR_GAIN))
    bm.free()
    return wear


def finalize_colors(obj, seed):
    mesh = obj.data
    wear = edge_wear(mesh)
    tint = random.Random(seed).random()
    for index, value in enumerate(mesh.color_attributes["isu"].data):
        value.color = (value.color[0], wear[index], tint, 1.0)


def export(blocks, path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in blocks:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_normals=True,
        export_texcoords=True,
        export_materials="NONE",
        export_vertex_color="ACTIVE",
        export_active_vertex_color_when_no_material=True,
        export_all_vertex_colors=False,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
        export_draco_color_quantization=10,
    )


def letter_bounds(layout, letter):
    xs, ys = [], []
    for spec in layout:
        if spec["letter"] != letter or spec.get("dot"):
            continue
        cx, cy, _ = spec["center"]
        w, h, _ = spec["size"]
        xs += [cx - w / 2, cx + w / 2]
        ys += [cy - h / 2, cy + h / 2]
    return min(xs), max(xs), min(ys), max(ys)


def build_preview_material(normal_image, detail_image):
    material = bpy.data.materials.new("preview")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    bsdf = nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.6

    attribute = nodes.new("ShaderNodeVertexColor")
    attribute.layer_name = "isu"
    separate = nodes.new("ShaderNodeSeparateColor")
    shade = nodes.new("ShaderNodeMix")
    shade.data_type = "RGBA"
    shade.blend_type = "MULTIPLY"
    shade.inputs["Factor"].default_value = 1.0
    color_a = next(i for i in shade.inputs if i.identifier == "A_Color")
    color_b = next(i for i in shade.inputs if i.identifier == "B_Color")
    color_a.default_value = (0.0, 0.33, 0.62, 1.0)
    links.new(attribute.outputs["Color"], separate.inputs["Color"])
    links.new(separate.outputs["Red"], color_b)

    normal_tex = nodes.new("ShaderNodeTexImage")
    normal_tex.image = normal_image
    normal_tex.interpolation = "Linear"
    normal_map = nodes.new("ShaderNodeNormalMap")
    links.new(normal_tex.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], bsdf.inputs["Normal"])

    detail_tex = nodes.new("ShaderNodeTexImage")
    detail_tex.image = detail_image
    detail_separate = nodes.new("ShaderNodeSeparateColor")
    links.new(detail_tex.outputs["Color"], detail_separate.inputs["Color"])
    darken_range = nodes.new("ShaderNodeMapRange")
    darken_range.inputs["To Min"].default_value = 0.55
    darken_range.inputs["To Max"].default_value = 1.0
    links.new(detail_separate.outputs["Red"], darken_range.inputs["Value"])

    darken_mix = nodes.new("ShaderNodeMix")
    darken_mix.data_type = "RGBA"
    darken_mix.blend_type = "MULTIPLY"
    darken_mix.inputs["Factor"].default_value = 1.0
    shade_result = next(o for o in shade.outputs if o.identifier == "Result_Color")
    darken_a = next(i for i in darken_mix.inputs if i.identifier == "A_Color")
    darken_b = next(i for i in darken_mix.inputs if i.identifier == "B_Color")
    links.new(shade_result, darken_a)
    links.new(darken_range.outputs["Result"], darken_b)
    darken_result = next(o for o in darken_mix.outputs if o.identifier == "Result_Color")
    links.new(darken_result, bsdf.inputs["Base Color"])
    return material


def render_preview(blocks, layout, preview_path, closeup_path, normal_image, detail_image):
    scene = bpy.context.scene
    # 질감 저장 단계에서 원본 값 그대로 쓰려고 뷰 변환을 껐다. 미리보기는 보통 눈에 보이는
    # 렌더라 원래 뷰 변환(AgX)과 PNG로 되돌린다.
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    scene.render.image_settings.file_format = "PNG"
    material = build_preview_material(normal_image, detail_image)
    for obj in blocks:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    camera_data = bpy.data.cameras.new("preview")
    camera = bpy.data.objects.new("preview", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 3.0
    sun = bpy.data.objects.new("sun", sun_data)
    sun.rotation_euler = (math.radians(50), 0.0, math.radians(-30))
    scene.collection.objects.link(sun)
    scene.world.color = (0.05, 0.08, 0.14)
    scene.cycles.samples = 48
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720

    def shoot(path, location, target):
        camera.location = location
        camera.rotation_euler = (
            (Vector(target) - Vector(location)).to_track_quat("-Z", "Y").to_euler()
        )
        scene.render.filepath = os.path.abspath(path)
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        bpy.ops.render.render(write_still=True)

    shoot(preview_path, (-1.6, -8.5, 1.9), (0.2, 0.0, 1.6))

    # S와 I 일부가 화면을 채우는 가까운 구도. 실제 레이아웃에서 두 글자의 이음매를 찾는다.
    # 이음매 한가운데를 겨누면 빈 틈만 보이므로, S 쪽으로 62% 치우친 지점을 겨눈다.
    i_min_x, i_max_x, i_min_y, i_max_y = letter_bounds(layout, "i")
    s_min_x, s_max_x, s_min_y, s_max_y = letter_bounds(layout, "s")
    target_x = i_max_x + (s_min_x - i_max_x) * 0.62
    target_z = (max(i_min_y, s_min_y) + min(i_max_y, s_max_y)) / 2
    shoot(closeup_path, (target_x, -6.0, target_z + 0.05), (target_x, 0.0, target_z))


def main():
    args = parse_args()
    with open(args.layout, encoding="utf-8") as file:
        layout = json.load(file)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    blocks = []
    total_inward = 0
    total_degenerate = 0
    chip_ratios = []
    for index, spec in enumerate(layout):
        name = f"block-{index:02d}"
        seed = index + 1
        mesh, chip_ratio = base_mesh(name, spec, seed)
        if chip_ratio is not None:
            print(f"ISU_BLOCKS block={name} chip_ratio={chip_ratio:.3f}")
            chip_ratios.append(chip_ratio)
        obj = bpy.data.objects.new(name, mesh)
        bpy.context.collection.objects.link(obj)
        inward, degenerate = sculpt(obj, spec, seed)
        total_inward += inward
        total_degenerate += degenerate
        place(obj, spec)
        prepare_colors(obj)
        blocks.append(obj)
    bake_ambient_occlusion(blocks)
    unwrap_atlas(blocks)

    normal_image, ao_image, convexity_image, hires_stats = bake_detail_atlas(
        blocks, layout, ATLAS_SIZE, limit=args.limit
    )
    detail_image = combine_detail_image(ao_image, convexity_image, ATLAS_SIZE)

    for index, obj in enumerate(blocks):
        finalize_colors(obj, index + 1)
    triangles = sum(sum(len(p.vertices) - 2 for p in obj.data.polygons) for obj in blocks)
    print(f"ISU_BLOCKS blocks={len(blocks)} triangles={triangles}")
    print(f"ISU_BLOCKS inward={total_inward} degenerate={total_degenerate}")
    if chip_ratios:
        print(f"ISU_BLOCKS chip_ratio_min={min(chip_ratios):.3f}")

    configure_raw_image_settings(bpy.context.scene)
    models_dir = os.path.dirname(os.path.abspath(args.out))
    mobile_dir = os.path.join(models_dir, "mobile")
    normal_sizes = save_webp_pair(
        normal_image,
        os.path.join(models_dir, "isu-blocks-normal.webp"),
        os.path.join(mobile_dir, "isu-blocks-normal.webp"),
        90,
    )
    detail_sizes = save_webp_pair(
        detail_image,
        os.path.join(models_dir, "isu-blocks-detail.webp"),
        os.path.join(mobile_dir, "isu-blocks-detail.webp"),
        85,
    )
    print(f"ISU_BLOCKS normal_webp desktop={normal_sizes[0]} mobile={normal_sizes[1]}")
    print(f"ISU_BLOCKS detail_webp desktop={detail_sizes[0]} mobile={detail_sizes[1]}")

    export(blocks, args.out)
    print(f"ISU_BLOCKS glb={os.path.getsize(args.out)} bytes")

    if hires_stats:
        tri_values = [t for _, t, _, _, _ in hires_stats]
        bake_times = [e for _, _, e, _, _ in hires_stats]
        hires_total_inward = sum(i for _, _, _, i, _ in hires_stats)
        hires_total_degenerate = sum(d for _, _, _, _, d in hires_stats)
        print(
            f"ISU_BLOCKS hires_triangles_min={min(tri_values)} max={max(tri_values)} "
            f"total={sum(tri_values)}"
        )
        print(f"ISU_BLOCKS bake_time_total={sum(bake_times):.1f}s")
        print(
            f"ISU_BLOCKS hires_inward={hires_total_inward} "
            f"hires_degenerate={hires_total_degenerate}"
        )

    if args.preview and args.closeup:
        render_preview(blocks, layout, args.preview, args.closeup, normal_image, detail_image)
        print(f"ISU_BLOCKS preview={args.preview}")
        print(f"ISU_BLOCKS closeup={args.closeup}")


main()
