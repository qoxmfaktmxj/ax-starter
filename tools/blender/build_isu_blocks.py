"""ISU 로그인 블록 모델을 만든다.

블렌더 5.2.1에서 화면 없이 실행한다.
  blender -b --factory-startup --python tools/blender/build_isu_blocks.py -- \
    --layout tools/blender/isu-layout.json \
    --out apps/web/public/models/isu-blocks.glb \
    --preview output/blender/isu-blocks-preview.png \
    --closeup output/blender/isu-blocks-closeup.png

좌표: three (x, y, z)를 블렌더 (x, -z, y)로 둔다. glTF 내보내기의 export_yup이 되돌린다.
정점 색 isu: R=AO, G=모서리 마모, B=블록별 색조 편차.

말끔한 둥근 블록: 저해상도 블록은 코너 칩/끌 면/저주파 요철/모서리 부스러기 없이 모든
모서리를 크게 둥글리고 앞면 가운데만 살짝 부풀린 매끈한 상자(또는 S의 비스듬한 각기둥)다.

고해상도 조각과 굽기: 내보내는 저해상도 블록(sculpt() 완료본)을 복제해 VOXEL_HI로 다시
리메시하고, 고운 눈 결과 결 방향이 있는 서리 줄무늬 두 겹만 법선 방향으로 더한 뒤 저해상도
블록의 공유 UV 아틀라스에 normal/AO/볼록도를 구워 담는다. 조각본은 내보내지 않는다.
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

VOXEL = 0.024  # 리메시 해상도(월드 단위)
VOXEL_HI = 0.008  # 고해상도 조각본 리메시 해상도(월드 단위)
BEVEL_RADIUS_RATIO = 0.13  # 모서리 둥글기 반경: 블록의 가장 짧은 변의 이 비율
BEVEL_RADIUS_DEPTH_CAP = 0.30  # 반경이 두께(depth)의 이 비율을 넘지 않게 한다
BEVEL_SEGMENTS = 6
FRONT_BULGE_MAX = 0.015  # 앞면 가운데가 부풀어 오르는 최대 깊이(월드 단위)
WEAR_GAIN = 6.0  # 곡률을 마모 값으로 바꾸는 배율
CORNER_SIGN = {"tl": (-1, 1), "tr": (1, 1), "bl": (-1, -1), "br": (1, -1)}

FROST_AMPLITUDE = 0.0012  # 고운 눈 결 진폭
FROST_STREAK_AMPLITUDE = 0.002  # 결 방향이 있는 서리 줄무늬 진폭
EDGE_PRESERVE_BAND = 0.02  # 윤곽 모서리에서 이 거리 안은 변위를 절반으로 줄인다
DETAIL_DISPLACEMENT_LIMIT = 0.005  # 두 겹을 합친 변위의 절대값 한도(자기 접힘 방지)
ATLAS_SIZE = 2048  # 질감 아틀라스 해상도(데스크톱)
MOBILE_ATLAS_SIZE = ATLAS_SIZE // 2  # 모바일 축소본 해상도
BAKE_CAGE_EXTRUSION = 0.015
BAKE_MAX_RAY_DISTANCE = 0.03
DETAIL_AO_DISTANCE = 0.25  # 디테일 AO 세계 조명 거리(이웃 블록/바닥 접촉 그늘을 담는다)
DETAIL_AO_FLOOR = 0.3  # 정점 AO와 같은 바닥값(완전한 검은 구멍을 막는다)


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
    if outline:
        prism_mesh(bm, outline, depth)
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
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    return mesh


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


def bulge_at(p, half, amplitude=FRONT_BULGE_MAX):
    # 앞면(-Y) 가운데만 카메라 쪽으로 살짝 부풀린다(랜딩 blockGeometry()의 bulge와 같은 모양).
    nx = max(-1.0, min(1.0, p.x / half.x)) if half.x > 1e-6 else 0.0
    nz = max(-1.0, min(1.0, p.z / half.z)) if half.z > 1e-6 else 0.0
    face_center = max(0.0, 1.0 - nx * nx) * max(0.0, 1.0 - nz * nz)
    depth_t = max(0.0, min(1.0, -p.y / half.y)) if half.y > 1e-6 else 0.0
    return face_center * depth_t**3 * amplitude


def sculpt(obj, spec, seed):
    width, height, depth = spec["size"]
    half = Vector((width / 2, depth / 2, height / 2))
    bevel = obj.modifiers.new("bevel", "BEVEL")
    # 모든 모서리를 크게, 손으로 깎은 자국 없이 매끈하게 둥글린다. 반경은 가장 짧은 변의
    # 13%(두께의 30%를 넘지 않게), 원형 단면 6분할.
    radius = min(width, height, depth) * BEVEL_RADIUS_RATIO
    radius = min(radius, depth * BEVEL_RADIUS_DEPTH_CAP)
    bevel.width = radius
    bevel.segments = BEVEL_SEGMENTS
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(40)
    remesh = obj.modifiers.new("remesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = VOXEL
    apply_modifiers(obj)

    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()

    moves = [(vert, vert.normal.copy() * bulge_at(vert.co, half)) for vert in bm.verts]
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
    obj.data.set_sharp_from_angle(angle=math.radians(75))
    return inward, degenerate


def edge_factor_absolute(p, half, band=EDGE_PRESERVE_BAND):
    # half.x/y/z 경계에서 band 거리 안, 그것도 두 축 이상이 동시에 경계에 가까운 곳(=모서리)만 1에 가깝다.
    nx = smoothstep(half.x - band, half.x, abs(p.x))
    ny = smoothstep(half.y - band, half.y, abs(p.y))
    nz = smoothstep(half.z - band, half.z, abs(p.z))
    return max(0.0, min(1.0, nx + ny + nz - 1.0))


def frost_streak_at(p, offset):
    # 결 방향(세로, 블렌더 z)으로는 천천히, 가로/두께 방향으로는 빠르게 바뀌어 넓고 옅은
    # 세로 줄무늬로 보인다(실제 서리가 중력 방향으로 흘러내리며 앉는 결을 흉내낸다).
    stretched = Vector((p.x * 6.0, p.y * 6.0, p.z * 0.65)) + offset
    return noise.fractal(stretched, 0.6, 2.0, 2) * FROST_STREAK_AMPLITUDE


def build_hires_duplicate(obj, spec, seed):
    # 지금의 sculpt()까지 끝난 저해상도 블록을 복제해 VOXEL_HI로 다시 리메시하고
    # 고운 눈 결과 서리 줄무늬 두 겹만 법선 방향으로 더한다. 윤곽 모서리 근처는 변위를 절반으로 줄인다.
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

    frost_offset = Vector((seed * 3.1, seed * 1.7, seed * 5.3))
    streak_offset = Vector((seed * 7.3 + 11.0, seed * 11.9 + 5.0, seed * 4.1 + 2.0))
    # 윤곽(outline) 블록은 가장 짧은 변이 훨씬 얇아(S 비스듬한 단) 같은 진폭도 자기 자신과
    # 더 쉽게 접힌다(실측: block-09, 0.5배에서도 hires_inward=2가 남았다). 1/4 진폭만 쓴다.
    detail_scale = 0.25 if spec.get("outline") else 1.0

    bm = bmesh.new()
    bm.from_mesh(hires.data)
    bm.normal_update()

    moves = []
    for vert in bm.verts:
        p = vert.co
        frost = noise.fractal(p * 40.0 + frost_offset, 0.9, 2.0, 3) * FROST_AMPLITUDE
        streak = frost_streak_at(p, streak_offset)
        total = (frost + streak) * detail_scale
        total *= 1.0 - edge_factor_absolute(p, half) * 0.5
        total = max(-DETAIL_DISPLACEMENT_LIMIT, min(DETAIL_DISPLACEMENT_LIMIT, total))
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
    hires.data.set_sharp_from_angle(angle=math.radians(75))
    return hires, triangle_count, inward, degenerate


def unwrap_atlas(blocks):
    # 내보내는 저해상도 블록 전부를 하나의 아틀라스(0~1)로 겹치지 않게 모은다.
    bpy.ops.object.select_all(action="DESELECT")
    for obj in blocks:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = blocks[0]
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66))
    bpy.ops.uv.pack_islands(margin=0.008)
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
    # AO는 바닥면을 둔 채로, 다른 블록도 숨기지 않고 구워 이웃 블록/바닥 접촉 그늘이
    # 담기게 한다(정점 색 R과 같은 0.3 바닥값으로 완전한 검은 구멍은 막는다).
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.render.bake.margin = 4

    normal_image = new_atlas_image("isu-blocks-normal", size)
    ao_image = new_atlas_image("isu-blocks-ao-detail", size)
    convexity_image = new_atlas_image("isu-blocks-convexity", size)
    material, normal_node, ao_node, convexity_node = bake_material_for_targets(blocks)
    normal_node.image = normal_image
    ao_node.image = ao_image
    convexity_node.image = convexity_image
    convexity_src_material = convexity_material()

    detail_world = bpy.data.worlds.new("detail-ao")
    detail_world.light_settings.distance = DETAIL_AO_DISTANCE
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    ground = bpy.context.active_object

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

    bpy.data.objects.remove(ground, do_unlink=True)
    pixels = np.empty(size * size * 4, dtype=np.float32)
    normal_image.pixels.foreach_get(pixels)
    normals = pixels.reshape(-1, 4)
    unused = np.all(normals[:, :3] < 1e-5, axis=1)
    normals[unused, :3] = (0.5, 0.5, 1.0)
    normal_image.pixels.foreach_set(pixels)
    normal_image.update()
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
    # 이웃 블록/바닥 접촉 그늘까지 담아 완전히 검게 구워질 수 있는 자리가 있어, 정점 AO가
    # 쓰는 바닥값(0.3)과 맞춰 완전한 검은 구멍으로 보이지 않게 한다.
    out[:, 0] = np.maximum(ao[:, 0], DETAIL_AO_FLOOR)
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


def assign_glass_materials(blocks, layout):
    def make_material(name, color, transmission):
        material = bpy.data.materials.new(name)
        material.use_nodes = True
        nodes = material.node_tree.nodes
        bsdf = nodes.get("Principled BSDF") or nodes.new("ShaderNodeBsdfPrincipled")
        output = next((node for node in nodes if node.type == "OUTPUT_MATERIAL"), None)
        if output is None:
            output = nodes.new("ShaderNodeOutputMaterial")
        material.node_tree.links.new(bsdf.outputs["BSDF"], output.inputs["Surface"])
        bsdf.inputs["Base Color"].default_value = (*color, 1)
        bsdf.inputs["Metallic"].default_value = 0
        bsdf.inputs["Roughness"].default_value = 0.11
        bsdf.inputs["IOR"].default_value = 1.46
        bsdf.inputs["Transmission Weight"].default_value = transmission
        bsdf.inputs["Subsurface Weight"].default_value = 0.06
        bsdf.inputs["Subsurface Scale"].default_value = 0.10
        bsdf.inputs["Coat Weight"].default_value = 0.50
        bsdf.inputs["Coat Roughness"].default_value = 0.08
        return material

    blue = make_material("ISU Blue tinted glass", (0.0, 0.275, 0.658), 0.60)
    green = make_material("ISU Green tinted glass", (0.319, 0.591, 0.045), 0.45)
    for obj, spec in zip(blocks, layout):
        obj.data.materials.clear()
        obj.data.materials.append(green if spec["dot"] else blue)


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
        export_materials="EXPORT",
        export_vertex_color="ACTIVE",
        export_active_vertex_color_when_no_material=False,
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
    for index, spec in enumerate(layout):
        name = f"block-{index:02d}"
        seed = index + 1
        mesh = base_mesh(name, spec, seed)
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

    assign_glass_materials(blocks, layout)
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
