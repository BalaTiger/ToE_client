"""Offline CC0 JangaFX VDB rendering. Run with Blender --background --python."""
import bpy
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
VDB = ROOT / 'source/smallCampfire/smallCampfireVDB'
OUT = ROOT / 'frames'
OUT.mkdir(exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 256
scene.cycles.use_denoising = True
scene.render.resolution_x = 256
scene.render.resolution_y = 512
scene.render.resolution_percentage = 100
scene.render.film_transparent = True
scene.render.image_settings.file_format = 'OPEN_EXR'
scene.render.image_settings.color_mode = 'RGBA'
scene.render.image_settings.color_depth = '16'
scene.world.color = (0, 0, 0)
scene.view_settings.view_transform = 'Standard'

bpy.ops.object.volume_import(filepath=str(VDB / 'smallCampfire_0050.vdb'))
vol = bpy.context.object
vol.data.grids.load()
vol.scale.x = 0.5
material = bpy.data.materials.new('Flame emission')
material.use_nodes = True
vol.data.materials.append(material)
nodes = material.node_tree.nodes
nodes.clear()
links = material.node_tree.links
output = nodes.new('ShaderNodeOutputMaterial')
volume = nodes.new('ShaderNodeVolumePrincipled')
volume.inputs['Density'].default_value = 0
volume.inputs['Density Attribute'].default_value = ''
flames = nodes.new('ShaderNodeAttribute')
flames.attribute_name = 'flames'
strength = nodes.new('ShaderNodeMath')
strength.operation = 'MULTIPLY'
strength.inputs[1].default_value = 0.2
links.new(flames.outputs['Fac'], strength.inputs[0])
links.new(strength.outputs[0], volume.inputs['Emission Strength'])
temperature = nodes.new('ShaderNodeMath')
temperature.operation = 'MULTIPLY_ADD'
temperature.inputs[1].default_value = 9000
temperature.inputs[2].default_value = 1450
links.new(flames.outputs['Fac'], temperature.inputs[0])
blackbody = nodes.new('ShaderNodeBlackbody')
links.new(temperature.outputs[0], blackbody.inputs[0])
links.new(blackbody.outputs[0], volume.inputs['Emission Color'])
links.new(volume.outputs[0], output.inputs['Volume'])

bpy.ops.object.camera_add(location=(-2, -250, -109))
camera = bpy.context.object
camera.rotation_euler = (Vector((-2, 155, -109)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 145
scene.camera = camera
for frame in range(60):
    vol.data.filepath = str(VDB / f'smallCampfire_{40 + frame:04d}.vdb')
    vol.data.grids.load()
    scene.render.filepath = str(OUT / f'fire_{frame:03d}.exr')
    bpy.ops.render.render(write_still=True)
    # Preserve scene-linear emission for deterministic atlas packing outside Blender.
    image = bpy.data.images.load(scene.render.filepath, check_existing=False)
    pixels = np.asarray(image.pixels[:], dtype=np.float32).reshape((512, 256, 4))
    np.save(OUT / f'fire_{frame:03d}.npy', np.flipud(pixels[:, :, :3]))
    bpy.data.images.remove(image)
