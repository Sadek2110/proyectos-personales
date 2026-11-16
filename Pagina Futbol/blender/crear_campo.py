"""Campo de futbol reglamentario (105 x 68 m) con dos porterias y balon.
Ejecutar: blender -b -P crear_campo.py
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

OUT = os.path.dirname(os.path.abspath(__file__))

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# --------------------------------------------------------------- utilidades
def link(name, me):
    o = bpy.data.objects.new(name, me)
    scene.collection.objects.link(o)
    return o

def mat(name, color, rough=0.5, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metallic
    return m

def bm_to_obj(bm, name, mats, smooth=False):
    if smooth:
        for f in bm.faces:
            f.smooth = True
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for m in mats:
        me.materials.append(m)
    return link(name, me)

def cyl(bm, p1, p2, r, segs=24):
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    rot = Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4()
    M = Matrix.Translation((p1 + p2) / 2) @ rot
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segs, radius1=r, radius2=r,
                          depth=d.length, matrix=M)

def sphere(bm, p, r):
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=r,
                              matrix=Matrix.Translation(Vector(p)))

# --------------------------------------------------------------- materiales
def grass_mat(name, c_dark, c_light, stripe_w):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    N, L = nt.nodes, nt.links
    bsdf = N["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.85
    try:
        bsdf.inputs["Specular IOR Level"].default_value = 0.25
    except KeyError:
        pass
    tc = N.new("ShaderNodeTexCoord")
    sep = N.new("ShaderNodeSeparateXYZ")
    L.new(tc.outputs["Object"], sep.inputs[0])
    div = N.new("ShaderNodeMath"); div.operation = 'DIVIDE'
    div.inputs[1].default_value = stripe_w
    L.new(sep.outputs["X"], div.inputs[0])
    fl = N.new("ShaderNodeMath"); fl.operation = 'FLOOR'
    L.new(div.outputs[0], fl.inputs[0])
    md = N.new("ShaderNodeMath"); md.operation = 'FLOORED_MODULO'
    md.inputs[1].default_value = 2
    L.new(fl.outputs[0], md.inputs[0])
    half = N.new("ShaderNodeMath"); half.operation = 'MULTIPLY'
    half.inputs[1].default_value = 0.5
    L.new(md.outputs[0], half.inputs[0])
    # manchas grandes de variacion del cesped
    noise = N.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 0.35
    noise.inputs["Detail"].default_value = 6
    L.new(tc.outputs["Object"], noise.inputs["Vector"])
    madd = N.new("ShaderNodeMath"); madd.operation = 'MULTIPLY_ADD'
    madd.inputs[1].default_value = 0.4
    L.new(noise.outputs["Fac"], madd.inputs[0])
    L.new(half.outputs[0], madd.inputs[2])
    ramp = N.new("ShaderNodeValToRGB")
    cr = ramp.color_ramp
    cr.elements[0].position = 0.10; cr.elements[0].color = (*[c * 0.8 for c in c_dark], 1)
    cr.elements[1].position = 0.85; cr.elements[1].color = (*c_light, 1)
    e = cr.elements.new(0.30); e.color = (*c_dark, 1)
    e = cr.elements.new(0.60); e.color = (*[c * 0.9 for c in c_light], 1)
    L.new(madd.outputs[0], ramp.inputs["Fac"])
    L.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    # relieve fino de las briznas
    fine = N.new("ShaderNodeTexNoise")
    fine.inputs["Scale"].default_value = 80
    fine.inputs["Detail"].default_value = 10
    L.new(tc.outputs["Object"], fine.inputs["Vector"])
    bump = N.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.2
    L.new(fine.outputs["Fac"], bump.inputs["Height"])
    L.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    return m

M_GRASS = grass_mat("Cesped", (0.045, 0.19, 0.035), (0.085, 0.31, 0.055), 105 / 20)
M_GROUND = mat("Exterior", (0.04, 0.13, 0.03), 0.95)
M_LINE = mat("Lineas", (0.92, 0.92, 0.9), 0.75)
M_POST = mat("Postes", (0.95, 0.95, 0.95), 0.25)
M_FRAME = mat("Soportes", (0.6, 0.62, 0.65), 0.35, 0.8)
M_NET = mat("Red", (0.9, 0.9, 0.9), 0.8)
M_FLAG = mat("Banderin", (0.95, 0.35, 0.02), 0.6)
M_BALL_W = mat("Balon blanco", (0.9, 0.9, 0.88), 0.35)
M_BALL_B = mat("Balon negro", (0.02, 0.02, 0.02), 0.35)
M_BALL_S = mat("Balon costuras", (0.25, 0.25, 0.25), 0.6)

# --------------------------------------------------------------- terreno
LEN, WID = 105.0, 68.0
HX, HY = LEN / 2, WID / 2

bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1,
                      matrix=Matrix.Diagonal((63.0, 44.0, 1, 1)))
bm_to_obj(bm, "Cesped", [M_GRASS])

bm = bmesh.new()
bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=1,
                      matrix=Matrix.Translation((0, 0, -0.02)) @ Matrix.Diagonal((300, 300, 1, 1)))
bm_to_obj(bm, "Exterior", [M_GROUND])

# --------------------------------------------------------------- lineas
LW, ZL = 0.12, 0.005
lb = bmesh.new()

def poly(pts):
    lb.faces.new([lb.verts.new((p[0], p[1], ZL)) for p in pts])

def strip(p1, p2, w=LW, ext=0.0):
    a, b = Vector(p1), Vector(p2)
    d = (b - a).normalized()
    a, b = a - d * ext, b + d * ext
    n = Vector((-d.y, d.x)) * w / 2
    poly([a - n, b - n, b + n, a + n])

def arc(c, r, a0, a1, w=LW, segs=64):
    c = Vector(c)
    for i in range(segs):
        t0 = math.radians(a0 + (a1 - a0) * i / segs)
        t1 = math.radians(a0 + (a1 - a0) * (i + 1) / segs)
        u0, u1 = Vector((math.cos(t0), math.sin(t0))), Vector((math.cos(t1), math.sin(t1)))
        poly([c + u0 * (r - w / 2), c + u1 * (r - w / 2), c + u1 * (r + w / 2), c + u0 * (r + w / 2)])

def disk(c, r, segs=32):
    poly([(c[0] + r * math.cos(2 * math.pi * i / segs), c[1] + r * math.sin(2 * math.pi * i / segs))
          for i in range(segs)])

# perimetro, linea media, circulo central y punto central
strip((-HX, -HY), (HX, -HY), ext=LW / 2)
strip((-HX, HY), (HX, HY), ext=LW / 2)
strip((0, -HY), (0, HY))
arc((0, 0), 9.15, 0, 360, segs=128)
disk((0, 0), 0.15)

T0 = math.degrees(math.acos(5.5 / 9.15))  # angulo donde la media luna corta el area
for s in (-1, 1):
    gx = s * HX
    strip((gx, -HY), (gx, HY), ext=LW / 2)                    # linea de meta
    # area grande (16,5 m)
    px = s * (HX - 16.5)
    strip((gx, -20.16), (px, -20.16)); strip((gx, 20.16), (px, 20.16))
    strip((px, -20.16), (px, 20.16), ext=LW / 2)
    # area pequena (5,5 m)
    sx = s * (HX - 5.5)
    strip((gx, -9.16), (sx, -9.16)); strip((gx, 9.16), (sx, 9.16))
    strip((sx, -9.16), (sx, 9.16), ext=LW / 2)
    # punto de penalti y media luna
    spot = (s * (HX - 11), 0)
    disk(spot, 0.11)
    if s < 0:
        arc(spot, 9.15, -T0, T0, segs=48)
    else:
        arc(spot, 9.15, 180 - T0, 180 + T0, segs=48)
    # arcos de esquina y marcas de 9,15 m fuera del campo
    for sy in (-1, 1):
        ang = math.degrees(math.atan2(-sy, -s))
        arc((gx, sy * HY), 1.0, ang - 45, ang + 45, segs=24)
        strip((gx, sy * (HY - 9.15)), (gx + s * 0.6, sy * (HY - 9.15)))
        strip((s * (HX - 9.15), sy * HY), (s * (HX - 9.15), sy * (HY + 0.6)))

bm_to_obj(lb, "Lineas", [M_LINE])

# --------------------------------------------------------------- porterias
PR = 0.06                 # radio de postes (12 cm)
YP = 3.66 + PR            # 7,32 m libres entre postes
ZT = 2.44 + PR            # 2,44 m libres bajo el larguero
RS = 0.025                # radio de soportes
D_TOP, Z_TOP, D_BOT = 1.0, 2.3, 2.0   # perfil de la red

def grid_quad(bm, A, B, C, D, nu, nv, sag=0.0):
    rows = []
    for j in range(nv + 1):
        v = j / nv
        row = []
        for i in range(nu + 1):
            u = i / nu
            p = (A * (1 - u) + B * u) * (1 - v) + (D * (1 - u) + C * u) * v
            p.z -= sag * math.sin(math.pi * u) * math.sin(math.pi * v)
            row.append(bm.verts.new(p))
        rows.append(row)
    for j in range(nv):
        for i in range(nu):
            bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))

def build_goal(s, tag):
    X = s * HX
    # postes y larguero
    b = bmesh.new()
    for y in (-YP, YP):
        cyl(b, (X, y, 0), (X, y, ZT), PR)
        sphere(b, (X, y, ZT), PR)
    cyl(b, (X, -YP, ZT), (X, YP, ZT), PR)
    bm_to_obj(b, f"Porteria {tag} - postes", [M_POST], smooth=True)
    # estructura trasera
    b = bmesh.new()
    xt, xb = X + s * D_TOP, X + s * D_BOT
    for y in (-YP, YP):
        cyl(b, (X, y, RS), (xb, y, RS), RS, 12)       # base lateral
        cyl(b, (X, y, ZT), (xt, y, Z_TOP), RS, 12)    # brazo superior
        cyl(b, (xt, y, Z_TOP), (xb, y, RS), RS, 12)   # poste trasero
        sphere(b, (xt, y, Z_TOP), RS)
    cyl(b, (xb, -YP, RS), (xb, YP, RS), RS, 12)       # base trasera
    cyl(b, (xt, -YP, Z_TOP), (xt, YP, Z_TOP), RS, 12)  # barra superior trasera
    bm_to_obj(b, f"Porteria {tag} - soportes", [M_FRAME], smooth=True)
    # red
    b = bmesh.new()
    V = lambda d, y, z: Vector((X + s * d, y, z))
    nu = int(2 * YP / 0.14)
    grid_quad(b, V(0, -YP, ZT), V(0, YP, ZT), V(D_TOP, YP, Z_TOP), V(D_TOP, -YP, Z_TOP), nu, 8, sag=0.12)
    grid_quad(b, V(D_TOP, -YP, Z_TOP), V(D_TOP, YP, Z_TOP), V(D_BOT, YP, 0), V(D_BOT, -YP, 0), nu, 18)
    for y in (-YP, YP):
        grid_quad(b, V(0, y, 0), V(D_BOT, y, 0), V(D_TOP, y, Z_TOP), V(0, y, ZT), 14, 18)
    net = bm_to_obj(b, f"Porteria {tag} - red", [M_NET])
    w = net.modifiers.new("Malla", 'WIREFRAME')
    w.thickness = 0.012

build_goal(-1, "izquierda")
build_goal(1, "derecha")

# --------------------------------------------------------------- banderines
b = bmesh.new()
fb = bmesh.new()
for sx in (-1, 1):
    for sy in (-1, 1):
        x, y = sx * HX, sy * HY
        cyl(b, (x, y, 0), (x, y, 1.5), 0.02, 12)
        out = Vector((sx, sy, 0)).normalized() * 0.45
        fb.faces.new([fb.verts.new(p) for p in (
            (x, y, 1.5), (x + out.x, y + out.y, 1.47), (x + out.x, y + out.y, 1.17), (x, y, 1.15))])
bm_to_obj(b, "Banderines - palos", [M_POST], smooth=True)
bm_to_obj(fb, "Banderines - telas", [M_FLAG])

# --------------------------------------------------------------- balon
R_BALL = 0.11
# icosaedro truncado de referencia: 12 pentagonos y 20 hexagonos (planos n, h)
ref = bmesh.new()
bmesh.ops.create_icosphere(ref, subdivisions=1, radius=1.0)
bmesh.ops.bevel(ref, geom=list(ref.verts), offset=33.333, offset_type='PERCENT',
                affect='VERTICES', segments=1)
panels = []
for f in ref.faces:
    n = f.normal.copy()
    panels.append((n, n.dot(f.verts[0].co), len(f.verts) == 5))
ref.free()

def panel_at(d):
    """Panel que atraviesa el rayo d y margen respecto al segundo mas cercano."""
    sc = sorted(((n.dot(d) / h, pent) for n, h, pent in panels), reverse=True)
    return sc[0][1], sc[0][0] - sc[1][0]

SEAM = 0.022
b = bmesh.new()
# Cuatro subdivisiones conservan una silueta perfectamente redonda en pantalla
# y evitan decenas de miles de triangulos invisibles en un balon de 22 cm.
bmesh.ops.create_icosphere(b, subdivisions=4, radius=1.0)
for v in b.verts:                       # costuras hundidas y paneles abombados
    d = v.co.normalized()
    _, gap = panel_at(d)
    v.co = d * R_BALL * (1.0 - 0.012 * max(0.0, 1.0 - gap / (SEAM * 1.6)))
for f in b.faces:
    pent, gap = panel_at(f.calc_center_median().normalized())
    f.material_index = 2 if gap < SEAM else (1 if pent else 0)
ball = bm_to_obj(b, "Balon", [M_BALL_W, M_BALL_B, M_BALL_S], smooth=True)
ball.location = (0, 0, R_BALL)
ball.rotation_euler = (0.4, 0.2, 0.7)

# --------------------------------------------------------------- luz y mundo
world = bpy.data.worlds.new("Cielo")
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs["Color"].default_value = (0.45, 0.62, 0.9, 1)
bg.inputs["Strength"].default_value = 0.9

sun_d = bpy.data.lights.new("Sol", 'SUN')
sun_d.energy = 4.0
sun_d.angle = math.radians(1.0)
sun = link("Sol", sun_d)
sun.rotation_euler = (math.radians(40), 0, math.radians(35))

# --------------------------------------------------------------- camaras
def add_cam(name, loc, target, lens=35, ortho=None):
    cd = bpy.data.cameras.new(name)
    cd.lens = lens
    cd.clip_start, cd.clip_end = 0.05, 2000
    if ortho:
        cd.type, cd.ortho_scale = 'ORTHO', ortho
    o = link(name, cd)
    o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return o

cams = {
    "vista_general": add_cam("Cam general", (0, -72, 48), (0, 2, 0), lens=24),
    "vista_aerea": add_cam("Cam aerea", (0, 0, 120), (0, 0, 0), ortho=125),
    "vista_porteria": add_cam("Cam porteria", (35, -13, 3.2), (52.5, 0, 1.3), lens=30),
    "vista_balon": add_cam("Cam balon", (0.75, -0.95, 0.32), (0, 0, 0.12), lens=60),
}

# --------------------------------------------------------------- render
for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'CYCLES'):
    try:
        scene.render.engine = eng
        break
    except TypeError:
        pass
scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
for look in ('AgX - Punchy', 'Punchy'):
    try:
        scene.view_settings.look = look
        break
    except TypeError:
        pass
try:
    scene.eevee.taa_render_samples = 64
except AttributeError:
    pass

if os.environ.get("CAMPO_SKIP_RENDERS") != "1":
    for name, cam in cams.items():
        scene.camera = cam
        scene.render.filepath = os.path.join(OUT, f"{name}.png")
        bpy.ops.render.render(write_still=True)

scene.camera = cams["vista_general"]

# que el archivo se vea con color al abrirlo (no en gris del modo Solid)
for m in bpy.data.materials:
    bsdf = m.node_tree.nodes.get("Principled BSDF") if m.node_tree else None
    if bsdf and not bsdf.inputs["Base Color"].is_linked:
        m.diffuse_color = bsdf.inputs["Base Color"].default_value
M_GRASS.diffuse_color = (0.06, 0.25, 0.045, 1)
for screen in bpy.data.screens:
    for area in screen.areas:
        for sp in area.spaces:
            if sp.type == 'VIEW_3D':
                sp.shading.type = 'MATERIAL'
                sp.shading.color_type = 'MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "campo_futbol.blend"))
print("LISTO")
