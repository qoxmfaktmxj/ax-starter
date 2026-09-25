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
BEVEL = 0.035  # 작은 모서리 깎기(날카롭지만 부드럽게)
LUMP = 0.012  # 면의 미세한 굴곡(평평함을 유지)
CHIP_MIN = 2  # 블록당 평평한 이가 빠진 자국 최소 개수
CHIP_MAX = 4  # 블록당 평평한 이가 빠진 자국 최대 개수
CHIP_RADIUS = 0.28  # 이 빠진 자국이 영향을 주는 반경
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


def base_mesh(name, spec):
    width, height, depth = spec["size"]
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for vert in bm.verts:
        vert.co.x *= width
        vert.co.y *= depth
        vert.co.z *= height
    corner = spec["corner"]
    if corner != "none":
        # 로고에서 둥근 바깥 모서리: 두께 방향 모서리 하나를 블록 크기만큼 크게 깎는다.
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


def chip_block(bm, half, seed):
    # 블록당 2~4개의 평평한 이 빠진 자국. 앞면(-Y, 카메라 방향)을 우선한다.
    rng = random.Random(seed)
    count = rng.randint(CHIP_MIN, CHIP_MAX)
    for _ in range(count):
        sign = Vector(
            (
                1.0 if rng.random() < 0.5 else -1.0,
                -1.0 if rng.random() < 0.75 else 1.0,
                1.0 if rng.random() < 0.5 else -1.0,
            )
        )
        center = Vector((sign.x * half.x, sign.y * half.y, sign.z * half.z))
        normal = Vector((sign.x, sign.y, sign.z))
        if rng.random() < 0.6:
            # 모서리를 따라 도는 이 자국: 한 축은 코너가 아니라 임의 위치로 옮기고 그 축의 법선을 없앤다.
            axis = rng.choice((0, 1, 2))
            center[axis] = rng.uniform(-0.6, 0.6) * half[axis]
            normal[axis] = 0.0
        normal.normalize()
        tilt = Vector(
            (rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25))
        )
        normal = (normal + tilt).normalized()
        chip_depth = rng.uniform(0.05, 0.12)
        plane_point = center - normal * chip_depth
        for vert in bm.verts:
            p = vert.co
            dist = (p - center).length
            if dist < CHIP_RADIUS:
                d = (p - plane_point).dot(normal)
                if d > 0:
                    w = 1.0 - smoothstep(CHIP_RADIUS * 0.6, CHIP_RADIUS, dist)
                    vert.co -= normal * d * w


def sculpt(obj, spec, seed):
    width, height, depth = spec["size"]
    bevel = obj.modifiers.new("bevel", "BEVEL")
    bevel.width = BEVEL
    bevel.segments = 3
    bevel.limit_method = "ANGLE"
    bevel.angle_limit = math.radians(40)
    remesh = obj.modifiers.new("remesh", "REMESH")
    remesh.mode = "VOXEL"
    remesh.voxel_size = VOXEL
    apply_modifiers(obj)

    half = Vector((width / 2, depth / 2, height / 2))
    offset = Vector((seed * 3.1, seed * 1.7, seed * 5.3))
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bm.normal_update()

    chip_block(bm, half, seed)
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
        # 낮은 주파수로 살짝만 굴곡을 준다. 평평함을 유지한다.
        lump = max(-1.5, min(1.5, noise.fractal(p * 1.6 + offset, 0.9, 2.0, 4))) * LUMP
        # 모서리 근처에만 고주파 잔부스러기를 더한다.
        crumble = noise.noise(p * 18.0 + offset) * 0.006 * edge
        moves.append((vert, vert.normal.copy() * (lump + crumble)))
    for vert, move in moves:
        vert.co += move
    bm.normal_update()
    bm.to_mesh(obj.data)
    bm.free()
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    # 이 빠진 평평한 면과 몸통 경계를 날카롭게, 나머지는 부드럽게 유지한다.
    obj.data.set_sharp_from_angle(angle=math.radians(32))


def unwrap(obj):
    activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")


def place(obj, spec):
    x, y, z = spec["center"]
    obj.location = (x, -z, y)
    obj.rotation_euler = (0.0, -spec["rotation"], 0.0)


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
    for index, spec in enumerate(layout):
        name = f"block-{index:02d}"
        obj = bpy.data.objects.new(name, base_mesh(name, spec))
        bpy.context.collection.objects.link(obj)
        sculpt(obj, spec, index + 1)
        unwrap(obj)
        place(obj, spec)
        prepare_colors(obj)
        blocks.append(obj)
    bake_ambient_occlusion(blocks)
    for index, obj in enumerate(blocks):
        finalize_colors(obj, index + 1)
    triangles = sum(sum(len(p.vertices) - 2 for p in obj.data.polygons) for obj in blocks)
    print(f"ISU_BLOCKS blocks={len(blocks)} triangles={triangles}")
    export(blocks, args.out)
    print(f"ISU_BLOCKS glb={os.path.getsize(args.out)} bytes")
    if args.preview:
        render_preview(blocks, args.preview)
        print(f"ISU_BLOCKS preview={args.preview}")


main()
