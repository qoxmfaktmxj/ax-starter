"""ISU 로그인 블록 모델을 만든다.

블렌더 5.2.1에서 화면 없이 실행한다.
  blender -b --factory-startup --python tools/blender/build_isu_blocks.py -- \
    --layout tools/blender/isu-layout.json \
    --out apps/web/public/models/isu-blocks.glb \
    --preview output/blender/isu-blocks-preview.png

좌표: three (x, y, z)를 블렌더 (x, -z, y)로 둔다. glTF 내보내기의 export_yup이 되돌린다.
정점 색 isu: R=AO, G=모서리 마모, B=블록별 색조 편차.
"""

import argparse
import json
import math
import os
import random
import sys

import bmesh
import bpy
from mathutils import Vector, noise

VOXEL = 0.028  # 리메시 해상도(월드 단위)
BEVEL_MIN = 0.025  # 블록별 모서리 깎기 범위(최소)
BEVEL_MAX = 0.05  # 블록별 모서리 깎기 범위(최대), 손으로 깎은 듯 블록마다 다르게
LUMP_LOW = 0.028  # 저주파 굴곡(큰 완만한 융기/패임)
LUMP_HIGH = 0.01  # 고주파 굴곡(작은 곰보 자국)
CHIP_MIN = 1  # 블록당 코너 이 빠진 자국 최소 개수
CHIP_MAX = 3  # 블록당 코너 이 빠진 자국 최대 개수
WEAR_GAIN = 6.0  # 곡률을 마모 값으로 바꾸는 배율
CORNER_SIGN = {"tl": (-1, 1), "tr": (1, 1), "bl": (-1, -1), "br": (1, -1)}


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--layout", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--preview")
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


def unwrap(obj):
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
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


def render_preview(blocks, path):
    scene = bpy.context.scene
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
    links.new(next(o for o in shade.outputs if o.identifier == "Result_Color"), bsdf.inputs["Base Color"])
    for obj in blocks:
        obj.data.materials.clear()
        obj.data.materials.append(material)
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    camera_data = bpy.data.cameras.new("preview")
    camera = bpy.data.objects.new("preview", camera_data)
    scene.collection.objects.link(camera)
    camera.location = (-1.6, -8.5, 1.9)
    camera.rotation_euler = (Vector((0.2, 0.0, 1.6)) - camera.location).to_track_quat("-Z", "Y").to_euler()
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
    scene.render.filepath = os.path.abspath(path)
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.render.render(write_still=True)


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
        unwrap(obj)
        place(obj, spec)
        prepare_colors(obj)
        blocks.append(obj)
    bake_ambient_occlusion(blocks)
    for index, obj in enumerate(blocks):
        finalize_colors(obj, index + 1)
    triangles = sum(sum(len(p.vertices) - 2 for p in obj.data.polygons) for obj in blocks)
    print(f"ISU_BLOCKS blocks={len(blocks)} triangles={triangles}")
    print(f"ISU_BLOCKS inward={total_inward} degenerate={total_degenerate}")
    if chip_ratios:
        print(f"ISU_BLOCKS chip_ratio_min={min(chip_ratios):.3f}")
    export(blocks, args.out)
    print(f"ISU_BLOCKS glb={os.path.getsize(args.out)} bytes")
    if args.preview:
        render_preview(blocks, args.preview)
        print(f"ISU_BLOCKS preview={args.preview}")


main()
