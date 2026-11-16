"""Exporta el campo a public/models/campo.glb para la web.
Ejecutar: blender -b campo_futbol.blend -P exportar_glb.py

El cesped usa nodos procedurales que glTF no entiende, asi que se hornea
a una textura JPG antes de exportar.
"""
import bpy, os

HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = os.path.join(HERE, "..", "public", "models")
os.makedirs(MODELS, exist_ok=True)

scene = bpy.context.scene
grass = bpy.data.objects["Cesped"]
me = grass.data

# UVs a partir de la posicion (el plano mide 126 x 88 m)
xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]
x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
uv = me.uv_layers.new(name="UV")
for loop in me.loops:
    co = me.vertices[loop.vertex_index].co
    uv.data[loop.index].uv = ((co.x - x0) / (x1 - x0), (co.y - y0) / (y1 - y0))

# horneado del color del cesped
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 1
W = 4096
img = bpy.data.images.new("cesped_color", W, int(W * (y1 - y0) / (x1 - x0)))
old = grass.active_material
tex = old.node_tree.nodes.new("ShaderNodeTexImage")
tex.image = img
old.node_tree.nodes.active = tex
for o in bpy.data.objects:
    o.select_set(False)
grass.select_set(True)
bpy.context.view_layer.objects.active = grass
bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=4)
img.filepath_raw = os.path.join(HERE, "cesped_color.jpg")
img.file_format = 'JPEG'
scene.render.image_settings.quality = 88
img.save()

# material simple con la textura horneada
m = bpy.data.materials.new("Cesped")
m.use_nodes = True
bsdf = m.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Roughness"].default_value = 0.9
t = m.node_tree.nodes.new("ShaderNodeTexImage")
t.image = img
m.node_tree.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
grass.data.materials.clear()
grass.data.materials.append(m)

# exportar todo menos el suelo exterior, luces y camaras
for o in bpy.data.objects:
    o.select_set(o.type == 'MESH' and o.name != "Exterior")
bpy.ops.export_scene.gltf(
    filepath=os.path.join(MODELS, "campo.glb"),
    export_format='GLB',
    use_selection=True,
    export_apply=True,
    export_cameras=False,
    export_lights=False,
    export_image_format='AUTO',
)
print("EXPORTADO")
