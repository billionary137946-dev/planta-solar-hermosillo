/* ============================================================
   Planta Solar Híbrida — render de construcción interactivo
   Three.js (local) · sin dependencias externas
   ============================================================ */
(() => {
'use strict';

if (!window.THREE) {
  document.body.innerHTML = '<div class="fatal">No se pudo cargar <b>three.min.js</b>.<br>Verifica que el archivo esté junto a index.html.</div>';
  return;
}

const $ = s => document.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const range = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
const ease = t => t * t * (3 - 2 * t);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const nf = new Intl.NumberFormat('es-MX');

/* ---------------- estado ---------------- */
const state = {
  phase: 1,
  progress: 0,
  shown: 0,
  hour: 18,
  playing: false,
  dragging: false,
  started: false,
  camAuto: true
};

/* ---------------- renderer / escena ---------------- */
const canvas = $('#scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x9fb6cf, 700, 2400);

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 1, 5000);
const orbit = {
  theta: -0.62, phi: 1.06, radius: 700,
  tTheta: -0.62, tPhi: 1.06, tRadius: 700,
  target: new THREE.Vector3(10, 20, 70),
  tTarget: new THREE.Vector3(10, 20, 70)
};

/* ---------------- cielo ---------------- */
const skyUniforms = {
  top: { value: new THREE.Color('#1b4d8f') },
  bottom: { value: new THREE.Color('#c9dff4') }
};
const sky = new THREE.Mesh(
  new THREE.SphereGeometry(2200, 32, 18),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyUniforms,
    vertexShader: `varying vec3 vW; void main(){ vW = (modelMatrix * vec4(position,1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vW;
      void main(){ float h = normalize(vW).y; float k = smoothstep(-0.04, 0.62, h);
      gl_FragColor = vec4(mix(bottom, top, pow(k, 0.85)), 1.0); }`
  })
);
sky.renderOrder = -10;
scene.add(sky);

/* ---------------- luces ---------------- */
const hemi = new THREE.HemisphereLight(0xbcd6ff, 0x4b4331, 0.55);
scene.add(hemi);
const ambient = new THREE.AmbientLight(0x3b4a63, 0.28);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffe7c4, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -430;
sun.shadow.camera.right = 430;
sun.shadow.camera.top = 380;
sun.shadow.camera.bottom = -340;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 1600;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.8;
sun.target.position.set(0, 0, 0);
scene.add(sun);
scene.add(sun.target);

/* ---------------- texturas procedurales ---------------- */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return t;
}

const groundTex = canvasTex(1024, 1024, (g, w, h) => {
  g.fillStyle = '#9a9070'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2400; i++) {
    const x = Math.random() * w, y = Math.random() * h, r = 4 + Math.random() * 46;
    const a = 0.03 + Math.random() * 0.07;
    const cols = ['#7d8a5d', '#b3a37d', '#8f8567', '#6f7c52', '#c0b08a'];
    g.fillStyle = cols[(Math.random() * cols.length) | 0];
    g.globalAlpha = a;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  g.globalAlpha = 0.08;
  for (let i = 0; i < 90; i++) {
    g.strokeStyle = '#6b7452'; g.lineWidth = 1 + Math.random() * 2;
    const y = Math.random() * h;
    g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * .3, y + 30, w * .7, y - 30, w, y + 10); g.stroke();
  }
  g.globalAlpha = 1;
});
groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
groundTex.repeat.set(4, 3);

const panelTex = canvasTex(256, 128, (g, w, h) => {
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, '#12294d'); grd.addColorStop(.5, '#0d2140'); grd.addColorStop(1, '#16335c');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(120,170,230,.35)'; g.lineWidth = 1;
  for (let x = 0; x <= w; x += 21) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let y = 0; y <= h; y += 21) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  g.strokeStyle = 'rgba(150,200,255,.55)'; g.lineWidth = 3;
  g.strokeRect(1.5, 1.5, w - 3, h - 3);
  const sheen = g.createLinearGradient(0, 0, w, 0);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(.42, 'rgba(200,225,255,.10)');
  sheen.addColorStop(.5, 'rgba(230,245,255,.20)');
  sheen.addColorStop(.58, 'rgba(200,225,255,.10)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sheen; g.fillRect(0, 0, w, h);
});

const roadTex = canvasTex(512, 64, (g, w, h) => {
  g.fillStyle = '#3b4046'; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,.05)';
  for (let i = 0; i < 700; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  g.fillStyle = 'rgba(255,255,255,.32)';
  g.fillRect(0, 6, w, 2); g.fillRect(0, h - 8, w, 2);
  g.fillStyle = 'rgba(255,205,110,.5)';
  for (let x = 10; x < w; x += 56) g.fillRect(x, h / 2 - 2, 26, 4);
});
roadTex.wrapS = THREE.RepeatWrapping;

const glowTex = canvasTex(128, 128, (g, w, h) => {
  const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  grd.addColorStop(0, 'rgba(255,240,210,1)');
  grd.addColorStop(.18, 'rgba(255,205,130,.85)');
  grd.addColorStop(.45, 'rgba(255,150,60,.32)');
  grd.addColorStop(1, 'rgba(255,120,40,0)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
});

const latticeTex = canvasTex(64, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(190,205,225,.9)'; g.lineWidth = 2.5;
  g.beginPath();
  g.moveTo(6, h); g.lineTo(w / 2, 0); g.moveTo(w - 6, h); g.lineTo(w / 2, 0);
  g.stroke();
  g.lineWidth = 1.6;
  for (let y = 10; y < h; y += 26) {
    g.beginPath(); g.moveTo(4, y); g.lineTo(w - 4, y + 22); g.stroke();
    g.beginPath(); g.moveTo(w - 4, y); g.lineTo(4, y + 22); g.stroke();
  }
});
latticeTex.encoding = THREE.sRGBEncoding;

/* ---------------- materiales ---------------- */
const M = {
  ground: new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0 }),
  road: new THREE.MeshStandardMaterial({ color: 0x8f959c, roughness: .95, metalness: .05 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0xd3cfc3, roughness: .82, metalness: .04 }),
  concreteDark: new THREE.MeshStandardMaterial({ color: 0x9c9a92, roughness: .85 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xb9c3cf, roughness: .35, metalness: .85 }),
  steelDark: new THREE.MeshStandardMaterial({ color: 0x6d7885, roughness: .45, metalness: .75 }),
  panel: new THREE.MeshStandardMaterial({
    map: panelTex, color: 0xffffff, roughness: .3, metalness: .62,
    emissive: 0x0a1c36, emissiveIntensity: .1
  }),
  mirror: new THREE.MeshStandardMaterial({ color: 0xd7e2ee, roughness: .12, metalness: .95 }),
  white: new THREE.MeshStandardMaterial({ color: 0xe9eef6, roughness: .6 }),
  warm: new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb547, emissiveIntensity: 1 }),
  red: new THREE.MeshStandardMaterial({ color: 0xc4573f, roughness: .6 }),
  crane: new THREE.MeshStandardMaterial({ color: 0xe8a93b, roughness: .5, metalness: .3 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2c323a, roughness: .7, metalness: .2 })
};

/* ---------------- suelo ---------------- */
const ground = new THREE.Mesh(new THREE.PlaneGeometry(1750, 1350), M.ground);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, -0.35, -10);
ground.receiveShadow = true;
scene.add(ground);

/* ---------------- carreteras ---------------- */
const roadGroup = new THREE.Group();
scene.add(roadGroup);
function addRoad(x, z, length, width, rot) {
  const tex = roadTex.clone();
  tex.needsUpdate = true;
  tex.repeat.set(Math.max(1, length / 46), 1);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: .95, metalness: .04 });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(length, width), mat);
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = rot;
  m.position.set(x, 0.04, z);
  m.receiveShadow = true;
  roadGroup.add(m);
  return m;
}
const roadMain = addRoad(0, 198, 940, 16, 0);
const roadVert = addRoad(38, 40, 340, 12, Math.PI / 2);
const roadPower = addRoad(128, 176, 250, 11, 0);
const roadTower = addRoad(150, 92, 210, 10, Math.PI / 2);

/* ---------------- cerca perimetral ---------------- */
const fenceGroup = new THREE.Group();
scene.add(fenceGroup);
(() => {
  const x0 = -300, x1 = 300, z0 = -235, z1 = 242;
  const pts = [];
  const posts = [];
  const seg = 30;
  for (let x = x0; x <= x1; x += seg) { posts.push([x, z0], [x, z1]); }
  for (let z = z0; z <= z1; z += seg) { posts.push([x0, z], [x1, z]); }
  const geo = new THREE.BoxGeometry(.55, 4, .55);
  const mesh = new THREE.InstancedMesh(geo, M.steelDark, posts.length);
  const d = new THREE.Object3D();
  posts.forEach(([x, z], i) => {
    d.position.set(x, 2, z); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1);
    d.updateMatrix(); mesh.setMatrixAt(i, d.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  fenceGroup.add(mesh);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x8d9aad, transparent: true, opacity: .55 });
  [1.5, 3.6].forEach(y => {
    const corners = [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [x0, y, z0]];
    const g = new THREE.BufferGeometry().setFromPoints(corners.map(c => new THREE.Vector3(...c)));
    fenceGroup.add(new THREE.Line(g, lineMat));
  });
})();

/* ---------------- campo fotovoltaico ---------------- */
const COLS = 30, ROWS = 22, DX = 8.4, DZ = 10.5, SX0 = -230, SZ0 = -105;
const pvGroup = new THREE.Group();
pvGroup.userData.key = 'pv';
scene.add(pvGroup);

const pvMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(7.8, .26, 4.4), M.panel, COLS * ROWS
);
pvMesh.castShadow = true;
pvMesh.receiveShadow = true;
pvMesh.userData.key = 'pv';
pvGroup.add(pvMesh);

const legMesh = new THREE.InstancedMesh(
  new THREE.CylinderGeometry(.16, .2, 3, 6), M.steelDark, COLS * ROWS * 2
);
legMesh.castShadow = true;
pvGroup.add(legMesh);

/* ---------------- helióstatos ---------------- */
const TOWER = new THREE.Vector3(150, 0, -75);
const helioPos = [];
for (let x = 34; x <= 278; x += 13) {
  for (let z = -208; z <= 42; z += 13) {
    const d = Math.hypot(x - TOWER.x, z - TOWER.z);
    if (d < 58 || d > 146) continue;
    if (Math.abs(x - 150) < 9 && z > -12) continue;
    helioPos.push({ x, z, d });
  }
}
const helioMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(5.4, .22, 4.4), M.mirror, helioPos.length
);
helioMesh.castShadow = true;
helioMesh.receiveShadow = true;
helioMesh.userData.key = 'tower';
scene.add(helioMesh);

/* ---------------- torre termosolar ---------------- */
const towerGroup = new THREE.Group();
towerGroup.position.copy(TOWER);
towerGroup.userData.key = 'tower';
scene.add(towerGroup);

const receiverMat = new THREE.MeshStandardMaterial({
  color: 0x3a2a1c, emissive: 0xffb547, emissiveIntensity: .8, roughness: .55, metalness: .5
});
{
  const base = new THREE.Mesh(new THREE.CylinderGeometry(9.5, 10.5, 2.4, 28), M.concreteDark);
  base.position.y = 1.2; base.castShadow = base.receiveShadow = true; towerGroup.add(base);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 7, 92, 22), M.concrete);
  shaft.position.y = 47.5; shaft.castShadow = shaft.receiveShadow = true; towerGroup.add(shaft);
  const rec = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 6.6, 11, 26), receiverMat);
  rec.position.y = 96; rec.castShadow = true; towerGroup.add(rec);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(7.1, .5, 8, 26), M.steel);
  ring.rotation.x = Math.PI / 2; ring.position.y = 102; towerGroup.add(ring);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 6.8, 1.6, 26), M.steel);
  cap.position.y = 103.2; towerGroup.add(cap);

  const glowMat = new THREE.SpriteMaterial({
    map: glowTex, color: 0xffc27a, transparent: true, opacity: .55,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const glow = new THREE.Sprite(glowMat);
  glow.position.y = 96; glow.scale.set(46, 46, 1);
  towerGroup.add(glow);
  towerGroup.userData.glow = glow;
  towerGroup.userData.receiver = rec;

  const recLight = new THREE.PointLight(0xffb066, 0, 360, 2);
  recLight.position.y = 96;
  towerGroup.add(recLight);
  towerGroup.userData.light = recLight;
}

/* ---------------- almacenamiento térmico ---------------- */
const storeGroup = new THREE.Group();
storeGroup.position.set(112, 0, 116);
storeGroup.userData.key = 'store';
scene.add(storeGroup);
{
  [-18, 0, 18].forEach(x => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 16, 22), M.steel);
    t.position.set(x, 8, 0); t.castShadow = t.receiveShadow = true; storeGroup.add(t);
    const top = new THREE.Mesh(new THREE.SphereGeometry(7, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.steel);
    top.position.set(x, 16, 0); storeGroup.add(top);
    const band = new THREE.Mesh(new THREE.TorusGeometry(7.05, .35, 6, 24), M.steelDark);
    band.rotation.x = Math.PI / 2; band.position.set(x, 8, 0); storeGroup.add(band);
  });
  const pipe = new THREE.Mesh(new THREE.BoxGeometry(42, .9, .9), M.steelDark);
  pipe.position.set(0, 2.5, 7.2); storeGroup.add(pipe);
}

/* ---------------- bloque eléctrico ---------------- */
const powerGroup = new THREE.Group();
powerGroup.position.set(45, 0, 158);
powerGroup.userData.key = 'power';
scene.add(powerGroup);
{
  const bld = new THREE.Mesh(new THREE.BoxGeometry(24, 9, 14), M.white);
  bld.position.set(-6, 4.5, 0); bld.castShadow = bld.receiveShadow = true; powerGroup.add(bld);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(25, .5, 15), M.steelDark);
  roof.position.set(-6, 9.2, 0); powerGroup.add(roof);
  [-34, -27, -20, -13].forEach(x => {
    const inv = new THREE.Mesh(new THREE.BoxGeometry(5, 2.8, 3.6), M.white);
    inv.position.set(x, 1.4, 13); inv.castShadow = true; powerGroup.add(inv);
    const top = new THREE.Mesh(new THREE.BoxGeometry(5.2, .25, 3.8), M.steelDark);
    top.position.set(x, 2.95, 13); powerGroup.add(top);
  });
  [18, 26, 34].forEach(x => {
    const tr = new THREE.Mesh(new THREE.BoxGeometry(7, 4.5, 5.5), M.steelDark);
    tr.position.set(x, 2.25, 4); tr.castShadow = true; powerGroup.add(tr);
    for (let i = -2; i <= 2; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(.3, 3.6, 5.8), M.steel);
      fin.position.set(x + i * 1.2, 2.25, 4); powerGroup.add(fin);
    }
  });
}

/* ---------------- subestación ---------------- */
const subGroup = new THREE.Group();
subGroup.position.set(212, 0, 128);
subGroup.userData.key = 'sub';
scene.add(subGroup);
{
  [-16, 0, 16].forEach(x => {
    const tr = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 6), M.steelDark);
    tr.position.set(x, 2.5, 0); tr.castShadow = true; subGroup.add(tr);
    const bush = new THREE.Mesh(new THREE.CylinderGeometry(.7, .9, 3.4, 8), M.white);
    bush.position.set(x, 6.7, 0); subGroup.add(bush);
  });
  [-13, 13].forEach(x => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(.7, 16, .7), M.steel);
    post.position.set(x, 8, -8); post.castShadow = true; subGroup.add(post);
  });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(28, .8, .8), M.steel);
  beam.position.set(0, 16, -8); subGroup.add(beam);
  const beam2 = new THREE.Mesh(new THREE.BoxGeometry(22, .6, .6), M.steel);
  beam2.position.set(0, 12.5, -8); subGroup.add(beam2);
}

/* ---------------- torres de transmisión ---------------- */
function makePylon(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const mat = new THREE.MeshStandardMaterial({
    map: latticeTex, transparent: true, alphaTest: .25, side: THREE.DoubleSide,
    color: 0xb9c6d8, roughness: .6, metalness: .5
  });
  const p1 = new THREE.Mesh(new THREE.PlaneGeometry(9, 38), mat);
  p1.position.y = 19;
  const p2 = p1.clone(); p2.rotation.y = Math.PI / 2;
  g.add(p1, p2);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(16, .5, .5), M.steelDark);
  arm.position.y = 36; g.add(arm);
  const arm2 = arm.clone(); arm2.position.y = 33; arm2.scale.x = .8; g.add(arm2);
  scene.add(g);
  return g;
}
const pylonPositions = [[272, 150], [348, 162], [424, 174], [500, 186]];
const pylonGroups = pylonPositions.map(([x, z]) => makePylon(x, z));

/* corredor de exportación hacia EE. UU. */
const exportPositions = [[505, 110], [515, 30], [525, -50], [535, -130], [545, -210], [555, -290]];
const exportGroups = exportPositions.map(([x, z]) => makePylon(x, z));
const usaGroup = new THREE.Group();
usaGroup.position.set(585, 0, -372);
scene.add(usaGroup);
{
  [-15, 0, 15].forEach(x => {
    const tr = new THREE.Mesh(new THREE.BoxGeometry(8, 5, 6), M.steelDark);
    tr.position.set(x, 2.5, 0); tr.castShadow = true; usaGroup.add(tr);
    const bush = new THREE.Mesh(new THREE.CylinderGeometry(.7, .9, 3.4, 8), M.white);
    bush.position.set(x, 6.7, 0); usaGroup.add(bush);
  });
  [-12, 12].forEach(x => {
    const post = new THREE.Mesh(new THREE.BoxGeometry(.7, 15, .7), M.steel);
    post.position.set(x, 7.5, -7); usaGroup.add(post);
  });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(26, .8, .8), M.steel);
  beam.position.set(0, 15, -7); usaGroup.add(beam);
  const bld = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 9), M.white);
  bld.position.set(-22, 3, 10); bld.castShadow = true; usaGroup.add(bld);
}

const wireGroup = new THREE.Group();
const exportWireGroup = new THREE.Group();
scene.add(wireGroup, exportWireGroup);
function addWires(points, group) {
  const mat = new THREE.LineBasicMaterial({ color: 0x7f8ca3, transparent: true, opacity: .5 });
  for (let i = 0; i < points.length - 1; i++) {
    const a = new THREE.Vector3(points[i][0], 36, points[i][1]);
    const b = new THREE.Vector3(points[i + 1][0], 36, points[i + 1][1]);
    [-6, 0, 6].forEach(off => {
      const pts = [];
      for (let k = 0; k <= 14; k++) {
        const t = k / 14;
        const p = a.clone().lerp(b, t);
        p.x += off;
        p.y -= Math.sin(t * Math.PI) * 5.5;
        pts.push(p);
      }
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    });
  }
}
addWires(pylonPositions, wireGroup);
addWires([[500, 186], ...exportPositions, [585, -365]], exportWireGroup);

/* ---------------- frontera / interconexión ---------------- */
const borderGroup = new THREE.Group();
scene.add(borderGroup);
{
  const z = -300, x0 = -320, x1 = 720;
  const posts = [];
  for (let x = x0; x <= x1; x += 24) {
    if (x > 496 && x < 574) continue;
    posts.push(x);
  }
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(.55, 5, .55), M.steelDark, posts.length);
  const d = new THREE.Object3D();
  posts.forEach((x, i) => {
    d.position.set(x, 2.5, z); d.updateMatrix(); inst.setMatrixAt(i, d.matrix);
  });
  inst.instanceMatrix.needsUpdate = true;
  borderGroup.add(inst);
  const lineMat = new THREE.LineBasicMaterial({ color: 0x9aa7ba, transparent: true, opacity: .5 });
  [1.8, 4.4].forEach(y => {
    [[x0, 496], [574, x1]].forEach(([a, b]) => {
      borderGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(a, y, z), new THREE.Vector3(b, y, z)]),
        lineMat
      ));
    });
  });
  [[500, 0], [570, 0]].forEach(([x]) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(2.2, 11, 2.2), M.steel);
    p.position.set(x, 5.5, z); borderGroup.add(p);
  });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(72, 1.8, 2.4), M.steel);
  beam.position.set(535, 11, z); borderGroup.add(beam);
  const sign = new THREE.Mesh(new THREE.BoxGeometry(26, 5, .5),
    new THREE.MeshStandardMaterial({ color: 0x1b4d8f, emissive: 0x0a1f3a, emissiveIntensity: .3, roughness: .5 }));
  sign.position.set(535, 16, z); borderGroup.add(sign);
}

/* ---------------- comunidad ---------------- */
const villageGroup = new THREE.Group();
villageGroup.position.set(-190, 0, 312);
scene.add(villageGroup);
const villageHouses = [];
const windowMat = new THREE.MeshStandardMaterial({ color: 0x2b3b52, emissive: 0xffc46b, emissiveIntensity: 0 });
{
  const wallMat = new THREE.MeshStandardMaterial({ color: 0xd9cdb8, roughness: .92 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a5a44, roughness: .85 });
  const street = new THREE.Mesh(new THREE.PlaneGeometry(120, 9),
    new THREE.MeshStandardMaterial({ color: 0x77726a, roughness: 1 }));
  street.rotation.x = -Math.PI / 2; street.position.set(0, .06, 0);
  street.receiveShadow = true;
  villageGroup.add(street);
  for (let r = -1; r <= 1; r++) {
    for (let c = -2; c <= 2; c++) {
      const h = new THREE.Group();
      h.position.set(c * 22 + (r === 0 ? 11 : 0), 0, r * 21 + (r === 0 ? 14 : 0));
      const body = new THREE.Mesh(new THREE.BoxGeometry(8, 3.6, 6.5), wallMat);
      body.position.y = 1.8; body.castShadow = body.receiveShadow = true; h.add(body);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 2.6, 4), roofMat);
      roof.position.y = 4.9; roof.rotation.y = Math.PI / 4; roof.castShadow = true; h.add(roof);
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.5, .22), windowMat);
      win.position.set(0, 2.1, 3.3); h.add(win);
      const win2 = win.clone(); win2.position.set(2.4, 2.1, 3.3); win2.scale.set(.7, .7, 1); h.add(win2);
      villageGroup.add(h);
      villageHouses.push(h);
    }
  }
}

/* ---------------- grúas ---------------- */
function makeCrane(x, z, rotY) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  const base = new THREE.Mesh(new THREE.BoxGeometry(7, 2, 7), M.dark);
  base.position.y = 1; base.castShadow = true; g.add(base);
  const mast = new THREE.Mesh(new THREE.BoxGeometry(1.7, 58, 1.7), M.crane);
  mast.position.y = 30; mast.castShadow = true; g.add(mast);
  const jib = new THREE.Mesh(new THREE.BoxGeometry(38, 1.3, 1.3), M.crane);
  jib.position.set(11, 58, 0); jib.castShadow = true; g.add(jib);
  const cjib = new THREE.Mesh(new THREE.BoxGeometry(13, 1.1, 1.1), M.crane);
  cjib.position.set(-10, 57, 0); g.add(cjib);
  const cw = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 3.4), M.dark);
  cw.position.set(-14, 54, 0); g.add(cw);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3, 2.6, 3), M.white);
  cab.position.set(2, 56, 0); g.add(cab);
  const cable = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(28, 58, 0), new THREE.Vector3(28, 33, 0)
    ]),
    new THREE.LineBasicMaterial({ color: 0x8b95a5 })
  );
  g.add(cable);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.6, 2.2), M.crane);
  hook.position.set(28, 32, 0); g.add(hook);
  scene.add(g);
  return g;
}
const craneA = makeCrane(-105, 148, .6);
const craneB = makeCrane(186, -18, 2.1);

/* ---------------- camiones ---------------- */
function makeTruck(color) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: .55, metalness: .25 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(9.5, 2.9, 4), bodyMat);
  body.position.y = 2.7; body.castShadow = true; g.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.5, 3.8), M.white);
  cab.position.set(-6.2, 2.4, 0); cab.castShadow = true; g.add(cab);
  const wheelGeo = new THREE.CylinderGeometry(1.1, 1.1, .8, 10);
  [[-5.6, 1.9], [-5.6, -1.9], [3.4, 1.9], [3.4, -1.9]].forEach(([x, z]) => {
    const w = new THREE.Mesh(wheelGeo, M.dark);
    w.rotation.x = Math.PI / 2;
    w.position.set(x, 1.1, z); g.add(w);
  });
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff2cc, emissive: 0xffe3a0, emissiveIntensity: 0 });
  [-1.1, 1.1].forEach(z => {
    const l = new THREE.Mesh(new THREE.BoxGeometry(.25, .5, .8), lightMat);
    l.position.set(-7.9, 2, z); g.add(l);
  });
  g.userData.lights = lightMat;
  scene.add(g);
  return g;
}
const truckA = makeTruck(0xe8eef7);
const truckB = makeTruck(0xd95f4c);

/* ---------------- luminarias ---------------- */
const lampMats = [];
function makeLamp(x, z) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.22, .3, 8.5, 6), M.steelDark);
  pole.position.y = 4.25; g.add(pole);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffe6b8, emissive: 0xffd28a, emissiveIntensity: .2 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.65, 10, 8), mat);
  bulb.position.y = 8.7; g.add(bulb);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffd9a0, transparent: true, opacity: .25,
    blending: THREE.AdditiveBlending, depthWrite: false
  }));
  glow.position.y = 8.7; glow.scale.set(7, 7, 1); g.add(glow);
  g.userData.glow = glow;
  lampMats.push(mat);
  scene.add(g);
  return g;
}
[[24, 182], [242, 182], [30, 60], [150, 4]].forEach(p => makeLamp(p[0], p[1]));
[[-218, 322], [-160, 300], [585, -348]].forEach(p => makeLamp(p[0], p[1]));

/* ---------------- estrellas ---------------- */
const starGeo = new THREE.BufferGeometry();
{
  const arr = [];
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2;
    const y = Math.random() * .85 + .12;
    const r = Math.sqrt(1 - y * y);
    arr.push(Math.cos(a) * r * 1900, y * 1900, Math.sin(a) * r * 1900);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
}
const starMat = new THREE.PointsMaterial({
  color: 0xdce9ff, size: 2.4, sizeAttenuation: true,
  transparent: true, opacity: 0, depthWrite: false
});
scene.add(new THREE.Points(starGeo, starMat));

/* ---------------- sol / luna (sprite) ---------------- */
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTex, color: 0xffe3b0, transparent: true, opacity: 1,
  blending: THREE.AdditiveBlending, depthWrite: false
}));
sunSprite.scale.set(150, 150, 1);
scene.add(sunSprite);

/* ---------------- sierra al horizonte ---------------- */
function makeRidge(radius, segs, hMin, hMax, color, seed) {
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const a = i / segs * Math.PI * 2;
    const x = Math.cos(a) * radius, z = Math.sin(a) * radius;
    const n = Math.sin(i * 1.73 + seed) * .5 + Math.sin(i * .41 + seed * 2.1) * .35 + Math.sin(i * .13 + seed) * .3;
    const h = hMin + (hMax - hMin) * clamp(.5 + n * .55, 0, 1);
    pos.push(x, -8, z, x, h, z);
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
    color, roughness: 1, metalness: 0, side: THREE.DoubleSide, flatShading: true
  }));
  scene.add(m);
  return m;
}
makeRidge(1480, 90, 70, 250, 0x5d5360, 1.7);
makeRidge(1160, 110, 40, 150, 0x6f5b50, 4.3);

/* ---------------- vegetación y rocas del desierto ---------------- */
(() => {
  const bushes = [], rocks = [];
  for (let i = 0; i < 620; i++) {
    const x = (Math.random() - .5) * 1500;
    const z = (Math.random() - .5) * 1250 - 10;
    if (Math.abs(x) < 315 && z > -250 && z < 255) continue;
    (Math.random() < .62 ? bushes : rocks).push([x, z]);
  }
  const bMesh = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1.5, 0),
    new THREE.MeshStandardMaterial({ color: 0x5d6a45, roughness: 1, flatShading: true }),
    bushes.length
  );
  const d = new THREE.Object3D();
  bushes.forEach(([x, z], i) => {
    const s = .5 + Math.random() * 1.3;
    d.position.set(x, s * .35, z);
    d.rotation.set(0, Math.random() * 7, 0);
    d.scale.set(s, s * .55, s);
    d.updateMatrix(); bMesh.setMatrixAt(i, d.matrix);
  });
  bMesh.instanceMatrix.needsUpdate = true;
  bMesh.receiveShadow = true;
  scene.add(bMesh);

  const rMesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(.85, 0),
    new THREE.MeshStandardMaterial({ color: 0x8b8069, roughness: 1, flatShading: true }),
    rocks.length
  );
  rocks.forEach(([x, z], i) => {
    const s = .5 + Math.random() * 1.4;
    d.position.set(x, s * .3, z);
    d.rotation.set(Math.random() * 3, Math.random() * 7, Math.random() * 3);
    d.scale.set(s, s * .7, s);
    d.updateMatrix(); rMesh.setMatrixAt(i, d.matrix);
  });
  rMesh.instanceMatrix.needsUpdate = true;
  rMesh.receiveShadow = true;
  scene.add(rMesh);
})();

/* ---------------- almacenamiento en baterías (BESS) ---------------- */
const bessGroup = new THREE.Group();
bessGroup.position.set(168, 0, 60);
scene.add(bessGroup);
{
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0x9fdcff, emissive: 0x4fc3ff, emissiveIntensity: .7 });
  for (let i = 0; i < 9; i++) {
    const x = -48 + i * 12;
    const box = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3, 2.8), M.white);
    box.position.set(x, 1.5, 0); box.castShadow = box.receiveShadow = true; bessGroup.add(box);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(7.4, .18, 3), M.steelDark);
    roof.position.set(x, 3.05, 0); bessGroup.add(roof);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.4, .28, .06), stripeMat);
    stripe.position.set(x, 1.9, 1.44); bessGroup.add(stripe);
  }
}

/* ---------------- tanques de hidrógeno ---------------- */
const h2Group = new THREE.Group();
h2Group.position.set(258, 0, 64);
scene.add(h2Group);
{
  const railMat = new THREE.MeshStandardMaterial({ color: 0xd9a53a, roughness: .55, metalness: .3 });
  [-4.4, 4.4].forEach(z => {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 17, 20), M.white);
    tank.rotation.z = Math.PI / 2;
    tank.position.set(0, 4.2, z); tank.castShadow = true; h2Group.add(tank);
    [-8.5, 8.5].forEach(x => {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(3.4, 18, 10), M.white);
      cap.position.set(x, 4.2, z); h2Group.add(cap);
    });
  });
  const railY = 1.6;
  [[-11, 0], [11, 0], [0, -8.6], [0, 8.6]].forEach(([x, z], i) => {
    const r = new THREE.Mesh(new THREE.BoxGeometry(i < 2 ? .16 : 22, .16, i < 2 ? 17.5 : .16), railMat);
    r.position.set(x, railY, z); h2Group.add(r);
  });
  for (let x = -10; x <= 10; x += 2.5) {
    [-8.4, 8.4].forEach(z => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(.14, 1.6, .14), railMat);
      p.position.set(x, .8, z); h2Group.add(p);
    });
  }
}

/* ---------------- acceso / caseta de vigilancia ---------------- */
const gateGroup = new THREE.Group();
gateGroup.position.set(-42, 0, 218);
scene.add(gateGroup);
{
  const bld = new THREE.Mesh(new THREE.BoxGeometry(17, 5.5, 10), M.white);
  bld.position.set(0, 2.75, 0); bld.castShadow = bld.receiveShadow = true; gateGroup.add(bld);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(19, .45, 12), M.steelDark);
  roof.position.set(0, 5.7, 0); gateGroup.add(roof);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(10, 2.2, .2),
    new THREE.MeshStandardMaterial({ color: 0x1d3a55, roughness: .15, metalness: .8 }));
  glass.position.set(0, 3.1, 5.1); gateGroup.add(glass);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(22, .5, 12), M.white);
  canopy.position.set(6, 6.4, -7); canopy.castShadow = true; gateGroup.add(canopy);
  [[-3, -12], [15, -12], [-3, -2], [15, -2]].forEach(([x, z]) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, 6.4, 6), M.steel);
    c.position.set(x, 3.2, z); gateGroup.add(c);
  });
}

/* ---------------- excavadora (solo construcción) ---------------- */
const excavator = new THREE.Group();
excavator.position.set(-258, 0, 168);
excavator.rotation.y = -.7;
scene.add(excavator);
{
  const trackMat = new THREE.MeshStandardMaterial({ color: 0x2f3338, roughness: .9 });
  [-2.4, 2.4].forEach(z => {
    const track = new THREE.Mesh(new THREE.BoxGeometry(9, 1.4, 1.8), trackMat);
    track.position.set(0, .8, z); excavator.add(track);
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 5), M.crane);
  body.position.set(-.5, 3.4, 0); body.castShadow = true; excavator.add(body);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 2.8),
    new THREE.MeshStandardMaterial({ color: 0x25384d, roughness: .2, metalness: .6 }));
  cab.position.set(-2, 4.2, 0); excavator.add(cab);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(9, .9, .9), M.crane);
  boom.position.set(5, 5.6, 0); boom.rotation.z = .55; excavator.add(boom);
  const stick = new THREE.Mesh(new THREE.BoxGeometry(7, .7, .7), M.crane);
  stick.position.set(9.6, 3.9, 0); stick.rotation.z = -1.1; excavator.add(stick);
  const bucket = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2, 2.2), M.dark);
  bucket.position.set(10.8, 1.6, 0); excavator.add(bucket);
}

/* ---------------- animación de construcción ---------------- */
const dummy = new THREE.Object3D();
dummy.rotation.order = 'YXZ';
let celebrated = false;

function applyBuild(p) {
  /* vialidades */
  const rt = ease(range(p, .02, .15));
  roadMain.scale.x = Math.max(.001, ease(range(p, .02, .14)));
  roadVert.scale.x = Math.max(.001, ease(range(p, .04, .18)));
  roadPower.scale.x = Math.max(.001, ease(range(p, .08, .2)));
  roadTower.scale.x = Math.max(.001, ease(range(p, .06, .18)));
  roadGroup.visible = p > .01;

  /* cerca y acceso */
  fenceGroup.visible = p > .045;
  const gt = ease(range(p, .1, .2));
  gateGroup.visible = gt > .002;
  gateGroup.scale.y = Math.max(.001, gt);

  /* excavadora */
  const et = ease(range(p, .08, .16)) * (1 - range(p, .44, .52));
  excavator.visible = et > .01;
  excavator.scale.setScalar(Math.max(.001, et));

  /* bloque eléctrico y subestación */
  const pt = ease(range(p, .17, .3));
  powerGroup.visible = pt > .002;
  powerGroup.scale.y = Math.max(.001, pt);
  const st = ease(range(p, .21, .33));
  subGroup.visible = st > .002;
  subGroup.scale.y = Math.max(.001, st);

  /* almacenamiento térmico */
  const tht = ease(range(p, .46, .6));
  storeGroup.visible = tht > .002;
  storeGroup.scale.y = Math.max(.001, tht);

  /* baterías e hidrógeno */
  const bt = ease(range(p, .34, .46));
  bessGroup.visible = bt > .002;
  bessGroup.scale.y = Math.max(.001, bt);
  const ht = ease(range(p, .55, .68));
  h2Group.visible = ht > .002;
  h2Group.scale.y = Math.max(.001, ht);

  /* torre */
  const tw = ease(range(p, .52, .7));
  towerGroup.visible = tw > .002;
  towerGroup.scale.y = Math.max(.001, tw);

  /* torres de transmisión */
  pylonGroups.forEach((g, i) => {
    const t = ease(range(p, .72 + i * .018, .82 + i * .018));
    g.visible = t > .002;
    g.scale.y = Math.max(.001, t);
  });
  wireGroup.visible = p > .85;

  /* corredor de exportación, frontera y comunidad */
  borderGroup.visible = p > .74;
  exportGroups.forEach((g, i) => {
    const t = ease(range(p, .78 + i * .012, .86 + i * .012));
    g.visible = t > .002;
    g.scale.y = Math.max(.001, t);
  });
  exportWireGroup.visible = p > .86;
  const ut = ease(range(p, .82, .88));
  usaGroup.visible = ut > .002;
  usaGroup.scale.y = Math.max(.001, ut);
  villageGroup.visible = p > .82;
  villageHouses.forEach((h, i) => {
    const t = ease(range(p, .84 + i * .0028, .88 + i * .0028));
    h.visible = t > .002;
    h.scale.y = Math.max(.001, t);
  });

  /* grúas */
  const ct = ease(range(p, .12, .2)) * (1 - range(p, .86, .93));
  craneA.visible = craneB.visible = ct > .01;
  craneA.scale.setScalar(Math.max(.001, ct));
  craneB.scale.setScalar(Math.max(.001, ct));

  /* campo fotovoltaico */
  const activeRows = state.phase === 2 ? ROWS : 14;
  let i = 0, l = 0;
  for (let r = 0; r < ROWS; r++) {
    const start = r < 14 ? .3 + (r / 14) * .24 : .62 + ((r - 14) / 8) * .18;
    const t = ease(range(p, start, start + .05));
    for (let c = 0; c < COLS; c++) {
      const x = SX0 + c * DX, z = SZ0 + r * DZ;
      if (r >= activeRows || t <= .001) {
        dummy.position.set(0, -120, 0);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(.0001);
        dummy.updateMatrix();
        pvMesh.setMatrixAt(i, dummy.matrix);
        legMesh.setMatrixAt(l++, dummy.matrix);
        legMesh.setMatrixAt(l++, dummy.matrix);
      } else {
        dummy.position.set(x, 3.15 + (1 - t) * 16, z);
        dummy.rotation.set(-.38, 0, 0);
        dummy.scale.set(.3 + .7 * t, .4 + .6 * t, .3 + .7 * t);
        dummy.updateMatrix();
        pvMesh.setMatrixAt(i, dummy.matrix);
        for (let k = 0; k < 2; k++) {
          dummy.position.set(x, 1.5 * t, z + (k ? 1.35 : -1.35));
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(1, Math.max(.01, t), 1);
          dummy.updateMatrix();
          legMesh.setMatrixAt(l++, dummy.matrix);
        }
      }
      i++;
    }
  }
  pvMesh.instanceMatrix.needsUpdate = true;
  legMesh.instanceMatrix.needsUpdate = true;

  /* helióstatos */
  helioPos.forEach((h, k) => {
    const dn = clamp((h.d - 58) / 88, 0, 1);
    const start = .54 + (1 - dn) * .06;
    const t = ease(range(p, start, start + .05));
    if (t <= .001) {
      dummy.position.set(0, -120, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(.0001);
    } else {
      dummy.position.set(h.x, 1.4 + (1 - t) * 9, h.z);
      dummy.rotation.y = Math.atan2(TOWER.x - h.x, TOWER.z - h.z);
      dummy.rotation.x = -.55;
      dummy.scale.setScalar(.3 + .7 * t);
    }
    dummy.updateMatrix();
    helioMesh.setMatrixAt(k, dummy.matrix);
  });
  helioMesh.instanceMatrix.needsUpdate = true;

  /* receptor */
  const rec = towerGroup.userData.receiver;
  if (rec) rec.material.emissiveIntensity = .5 + p * 1.4;

  if (p > .985 && !celebrated) {
    celebrated = true;
    showToast();
  }
  if (p < .9) celebrated = false;
}

/* ---------------- cielo / hora ---------------- */
const C = {
  nightTop: new THREE.Color('#04060e'), nightBot: new THREE.Color('#0a1322'),
  duskTop: new THREE.Color('#251d40'), duskBot: new THREE.Color('#ff9a5c'),
  dayTop: new THREE.Color('#1b4d8f'), dayBot: new THREE.Color('#c9dff4')
};
const tmpA = new THREE.Color(), tmpB = new THREE.Color();

function updateSky() {
  const t = (state.hour - 5.5) / 15;
  const elev = Math.max(.055, Math.sin(t * Math.PI) * 1.12);
  const azim = -1.15 + t * 2.3;
  const dir = new THREE.Vector3(
    Math.cos(elev) * Math.sin(azim),
    Math.sin(elev),
    Math.cos(elev) * Math.cos(azim)
  ).normalize();
  const e = Math.max(0, Math.sin(elev));

  sun.position.copy(dir).multiplyScalar(780);
  sun.target.position.set(0, 0, 0);

  const dayK = clamp((e - .3) / .5, 0, 1);
  const duskK = clamp(e / .3, 0, 1);
  if (e < .3) {
    tmpA.copy(C.nightTop).lerp(C.duskTop, duskK);
    tmpB.copy(C.nightBot).lerp(C.duskBot, duskK);
  } else {
    tmpA.copy(C.duskTop).lerp(C.dayTop, dayK);
    tmpB.copy(C.duskBot).lerp(C.dayBot, dayK);
  }
  skyUniforms.top.value.copy(tmpA);
  skyUniforms.bottom.value.copy(tmpB);
  scene.fog.color.copy(tmpB).multiplyScalar(.92);

  const warm = new THREE.Color('#ff7a3a').lerp(new THREE.Color('#fff3d8'), dayK);
  sun.color.copy(warm);
  sun.intensity = .12 + Math.pow(clamp(e / .9, 0, 1), .7) * 2.55;
  hemi.intensity = .16 + dayK * .5;
  ambient.intensity = .18 + dayK * .12;

  const night = 1 - clamp((e - .04) / .3, 0, 1);

  sunSprite.position.copy(dir).multiplyScalar(1650);
  sunSprite.material.color.copy(warm);
  sunSprite.material.opacity = clamp(e / .08, 0, 1);
  sunSprite.scale.setScalar(150 + dayK * 40);

  starMat.opacity = night * .95;
  lampMats.forEach(m => { m.emissiveIntensity = .15 + night * 2.2; });
  scene.traverse(o => {
    if (o.userData && o.userData.glow && o.userData.glow.material) {
      o.userData.glow.material.opacity = .12 + night * .55;
    }
  });
  truckA.userData.lights.emissiveIntensity = night * 1.8;
  truckB.userData.lights.emissiveIntensity = night * 1.8;
  windowMat.emissiveIntensity = state.shown > .9 ? .2 + night * 2.2 : .02;

  if (towerGroup.userData.glow) {
    towerGroup.userData.glow.material.opacity = .25 + night * .5 + state.shown * .15;
  }
}

/* ---------------- pines ---------------- */
const pinDefs = [
  { el: $('#pin-pv'), pos: new THREE.Vector3(-105, 14, 20), min: .34 },
  { el: $('#pin-tower'), pos: new THREE.Vector3(150, 112, -75), min: .6 },
  { el: $('#pin-store'), pos: new THREE.Vector3(112, 26, 116), min: .5 },
  { el: $('#pin-sub'), pos: new THREE.Vector3(212, 22, 128), min: .28 },
  { el: $('#pin-community'), pos: new THREE.Vector3(-190, 16, 312), min: .86 },
  { el: $('#pin-usa'), pos: new THREE.Vector3(585, 22, -300), min: .84 }
];
const projV = new THREE.Vector3();

function updatePins() {
  pinDefs.forEach(pin => {
    if (state.shown < pin.min) { pin.el.classList.add('hidden'); return; }
    projV.copy(pin.pos).project(camera);
    if (projV.z > 1 || projV.z < -1) { pin.el.classList.add('hidden'); return; }
    const x = (projV.x * .5 + .5) * innerWidth;
    const y = (-projV.y * .5 + .5) * innerHeight;
    if (x < -40 || x > innerWidth + 40 || y < -40 || y > innerHeight + 40) {
      pin.el.classList.add('hidden'); return;
    }
    pin.el.classList.remove('hidden');
    pin.el.style.left = x + 'px';
    pin.el.style.top = y + 'px';
  });
}

/* ---------------- interfaz ---------------- */
const progressSlider = $('#slider');
const timeSlider = $('#time');
const playBtn = $('#play');
const playIcon = $('#playIcon');
const stageName = $('#stageName');
const pctEl = $('#pct');
const clockEl = $('#clock');
const infoCard = $('#infoCard');
const summary = $('#summary');
const toastEl = $('#toast');

const STAGES = [
  { p: 0, name: 'Preparación del terreno y accesos', short: 'Terreno' },
  { p: .1, name: 'Movimiento de tierras y cimentación', short: 'Cimentación' },
  { p: .17, name: 'Bloque eléctrico · inversores', short: 'Inversores' },
  { p: .21, name: 'Subestación e interconexión', short: 'Subestación' },
  { p: .3, name: 'Campo fotovoltaico · Fase 1', short: 'Campo FV' },
  { p: .34, name: 'Almacenamiento en baterías (BESS)', short: 'BESS' },
  { p: .46, name: 'Almacenamiento térmico', short: 'Sales' },
  { p: .52, name: 'Torre termosolar y helióstatos', short: 'Torre' },
  { p: .55, name: 'Hidrógeno verde', short: 'H₂' },
  { p: .62, name: 'Expansión · Fase 2', short: 'Fase 2' },
  { p: .74, name: 'Línea de transmisión nacional', short: 'Transmisión' },
  { p: .78, name: 'Corredor de exportación a EE. UU.', short: 'EE. UU.' },
  { p: .84, name: 'Electrificación de comunidades', short: 'Comunidades' },
  { p: .9, name: 'Energización, venta y exportación', short: 'Energía' }
];
const stagesEl = $('#stages');
STAGES.forEach((s, i) => {
  const b = document.createElement('button');
  b.className = 'stage-chip';
  b.innerHTML = '<b>' + String(i + 1).padStart(2, '0') + '</b>' + s.short;
  b.title = s.name;
  b.addEventListener('click', () => {
    state.started = true;
    setPlaying(false);
    state.camAuto = true;
    setCamToggle();
    state.progress = Math.min(1, s.p + .004);
    state.shown = state.progress;
    applyBuild(state.shown);
    updateHUD(1);
  });
  stagesEl.appendChild(b);
});

/* ---------------- zonas y director de cámara ---------------- */
let camFit = 1;
const ZONES = {
  overview: { target: new THREE.Vector3(10, 20, 70), radius: 700, theta: -.62, phi: 1.06, min: 0 },
  pv: { target: new THREE.Vector3(-105, 14, 28), radius: 290, theta: -.48, phi: 1.02, min: .34 },
  tower: { target: new THREE.Vector3(150, 48, -75), radius: 280, theta: -.15, phi: 1.0, min: .6 },
  store: { target: new THREE.Vector3(112, 10, 116), radius: 210, theta: -.7, phi: 1.04, min: .5 },
  sub: { target: new THREE.Vector3(212, 12, 128), radius: 240, theta: -.95, phi: 1.02, min: .28 },
  bess: { target: new THREE.Vector3(168, 8, 60), radius: 220, theta: -.5, phi: 1.04, min: .4 },
  h2: { target: new THREE.Vector3(258, 8, 64), radius: 205, theta: -.35, phi: 1.04, min: .62 },
  line: { target: new THREE.Vector3(400, 18, 160), radius: 380, theta: -1.0, phi: 1.04, min: .76 },
  usa: { target: new THREE.Vector3(585, 18, -330), radius: 430, theta: -.25, phi: 1.02, min: .84 },
  community: { target: new THREE.Vector3(-190, 8, 312), radius: 300, theta: .35, phi: 1.04, min: .86 }
};
const SHOT_KEYS = [
  { p: 0, k: 'overview' }, { p: .12, k: 'overview' },
  { p: .18, k: 'power' }, { p: .25, k: 'sub' },
  { p: .31, k: 'wideA' }, { p: .39, k: 'pv' }, { p: .45, k: 'pv' },
  { p: .49, k: 'store' }, { p: .55, k: 'tower' }, { p: .6, k: 'tower' },
  { p: .63, k: 'wideB' }, { p: .7, k: 'pv2' }, { p: .77, k: 'line' },
  { p: .81, k: 'usa' }, { p: .86, k: 'community' },
  { p: .93, k: 'overview' }, { p: 1, k: 'final' }
];
const SHOTS = {
  overview: ZONES.overview,
  overview2: { target: new THREE.Vector3(20, 24, 60), radius: 740, theta: -.9, phi: 1.08 },
  final: { target: new THREE.Vector3(20, 28, 55), radius: 780, theta: -.55, phi: 1.06 },
  power: { target: new THREE.Vector3(55, 10, 152), radius: 230, theta: -.8, phi: 1.02 },
  sub: ZONES.sub,
  pv: ZONES.pv,
  pv2: { target: new THREE.Vector3(-115, 12, 80), radius: 320, theta: -.5, phi: 1.02 },
  store: ZONES.store,
  tower: ZONES.tower,
  line: ZONES.line,
  usa: ZONES.usa,
  community: ZONES.community,
  line2: { target: new THREE.Vector3(390, 18, 172), radius: 340, theta: -1.1, phi: 1.03 },
  wideA: { target: new THREE.Vector3(40, 18, 90), radius: 620, theta: -.7, phi: 1.06 },
  wideB: { target: new THREE.Vector3(60, 18, 70), radius: 640, theta: -.5, phi: 1.06 }
};
function directCamera(p) {
  let a = SHOT_KEYS[0], b = SHOT_KEYS[SHOT_KEYS.length - 1];
  for (let i = 0; i < SHOT_KEYS.length - 1; i++) {
    if (p >= SHOT_KEYS[i].p && p <= SHOT_KEYS[i + 1].p) { a = SHOT_KEYS[i]; b = SHOT_KEYS[i + 1]; break; }
  }
  const t = ease(clamp((p - a.p) / Math.max(.0001, b.p - a.p), 0, 1));
  const A = SHOTS[a.k], B = SHOTS[b.k];
  orbit.tTarget.lerpVectors(A.target, B.target, t);
  orbit.tRadius = lerp(A.radius, B.radius, t) * camFit;
  orbit.tTheta = lerp(A.theta, B.theta, t);
  orbit.tPhi = lerp(A.phi, B.phi, t);
}
function goZone(key) {
  const z = ZONES[key];
  if (!z) return;
  state.camAuto = false;
  setCamToggle();
  if (key !== 'overview' && state.progress < z.min) {
    state.progress = z.min;
    state.shown = z.min;
    applyBuild(z.min);
  }
  orbit.tTarget.copy(z.target);
  orbit.tRadius = z.radius * camFit;
  orbit.tTheta = z.theta;
  orbit.tPhi = z.phi;
  if (key === 'overview') closeInfo(); else openInfo(key);
}
document.querySelectorAll('.zonerail button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.zonerail button').forEach(x => x.classList.toggle('on', x === b));
    goZone(b.dataset.zone);
  });
});

const INFO = {
  pv: {
    tag: 'Generación · Fase 1–2', title: 'Campo fotovoltaico',
    body: 'Seguidores de un eje con módulos bifaciales. La Fase 1 instala 300 MW; la Fase 2 añade 200 MW hasta alcanzar 500 MW.',
    meta: '<b>300 → 500 MW</b> · 300,000 hogares'
  },
  tower: {
    tag: 'Tecnología termosolar', title: 'Torre de receptor central',
    body: 'Concentra la radiación de los helióstatos para aportar energía despachable y complementar la generación fotovoltaica del complejo híbrido.',
    meta: '<b>Primera en América</b> · operando solo en 2 países europeos'
  },
  store: {
    tag: 'Energía despachable', title: 'Almacenamiento térmico',
    body: 'Tanques de sales que conservan el calor para desplazar la entrega de energía hacia las horas de mayor demanda.',
    meta: '<b>Respaldo térmico</b> · complementa la operación'
  },
  sub: {
    tag: 'Interconexión · Fase 1', title: 'Subestación eléctrica',
    body: 'Subestación elevadora y línea de transmisión que conectan el complejo con la red nacional. Forma parte del alcance de la Fase 1.',
    meta: '<b>USD 300 M</b> · tecnología, terreno e interconexión'
  },
  power: {
    tag: 'Bloque eléctrico', title: 'Inversores y transformadores',
    body: 'Convierte y eleva la energía del campo fotovoltaico antes de entregarla a la subestación.',
    meta: '<b>Fase 1</b> · parte del alcance inicial'
  },
  bess: {
    tag: 'Almacenamiento', title: 'Baterías (BESS)',
    body: 'Contenedores de almacenamiento en baterías para estabilizar la entrega y mejorar la calidad de la energía.',
    meta: '<b>Servicios de red</b> · complemento del complejo'
  },
  h2: {
    tag: 'Vector energético', title: 'Hidrógeno verde',
    body: 'Área de tanques para hidrógeno producido con energía limpia del complejo, con potencial para uso industrial y exportación.',
    meta: '<b>Oportunidad industrial</b> · visión conceptual'
  },
  line: {
    tag: 'Transmisión nacional', title: 'Línea de transmisión',
    body: 'Corredor de alta tensión que conecta la subestación del complejo con la red nacional y los centros de consumo.',
    meta: '<b>Fase 1</b> · parte del alcance de interconexión'
  },
  usa: {
    tag: 'Exportación · EE. UU.', title: 'Interconexión transfronteriza',
    body: 'Corredor de exportación que lleva energía limpia y firme al mercado de Estados Unidos, con subestación receptora del otro lado de la frontera.',
    meta: '<b>Mercado de exportación</b> · energía despachable'
  },
  community: {
    tag: 'Impacto social', title: 'Electrificación de comunidades',
    body: 'La energía del complejo abastece a comunidades locales: alumbrado, servicios y actividad productiva, con impacto directo en la calidad de vida.',
    meta: '<b>300,000 hogares</b> · 1.2 M de personas'
  }
};

function openInfo(key) {
  const d = INFO[key];
  if (!d) return;
  $('#icTag').textContent = d.tag;
  $('#icTitle').textContent = d.title;
  $('#icBody').textContent = d.body;
  $('#icMeta').innerHTML = d.meta;
  infoCard.hidden = false;
  $('#zonerail').classList.add('dim');
}
function closeInfo() {
  infoCard.hidden = true;
  $('#zonerail').classList.remove('dim');
}

$('#infoClose').addEventListener('click', closeInfo);
document.querySelectorAll('.pin').forEach(pin => {
  pin.addEventListener('click', e => { e.stopPropagation(); goZone(pin.dataset.key); });
});

$('#openSummary').addEventListener('click', () => { summary.hidden = false; });
$('#closeSummary').addEventListener('click', () => { summary.hidden = true; });
summary.addEventListener('click', e => { if (e.target === summary) summary.hidden = true; });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { summary.hidden = true; closeInfo(); }
});

/* ---------------- indicadores ---------------- */
const disp = { cap: 0, inv: 0, hog: 0, per: 0 };
function updateHUD(dt) {
  const p = state.shown;
  let cap, inv;
  if (state.phase === 1) {
    cap = 300 * ease(range(p, 0, .85));
    inv = 300 * ease(range(p, 0, .9));
  } else {
    cap = 300 * ease(range(p, 0, .55)) + 200 * ease(range(p, .55, 1));
    inv = 300 * ease(range(p, 0, .55)) + 500 * ease(range(p, .55, 1));
  }
  const hog = 300000 * cap / 500;
  const per = 1.2 * cap / 500;
  const k = Math.min(1, dt * 7);
  disp.cap = lerp(disp.cap, cap, k);
  disp.inv = lerp(disp.inv, inv, k);
  disp.hog = lerp(disp.hog, hog, k);
  disp.per = lerp(disp.per, per, k);
  $('#kCap').textContent = Math.round(disp.cap);
  $('#kInv').textContent = Math.round(disp.inv);
  $('#kHog').textContent = nf.format(Math.round(disp.hog / 100) * 100);
  $('#kPer').textContent = disp.per.toFixed(1);

  const pc = Math.round(p * 100);
  pctEl.textContent = pc;
  progressSlider.style.setProperty('--fill', (p * 100) + '%');
  if (document.activeElement !== progressSlider) {
    progressSlider.value = Math.round(p * 1000);
  }

  let stage = STAGES[0], si = 0;
  for (let i = 0; i < STAGES.length; i++) {
    if (p >= STAGES[i].p - .001) { stage = STAGES[i]; si = i; }
  }
  stageName.innerHTML = '<i>Fase ' + state.phase + '</i> · ' + stage.name;

  for (let i = 0; i < stagesEl.children.length; i++) {
    stagesEl.children[i].classList.toggle('on', i === si);
  }
}

/* ---------------- reproducción ---------------- */
const camToggle = $('#camToggle');
function setCamToggle() {
  camToggle.classList.toggle('on', state.camAuto);
  camToggle.textContent = state.camAuto ? 'AUTO' : 'LIBRE';
}
camToggle.addEventListener('click', () => {
  state.camAuto = !state.camAuto;
  if (state.camAuto) directCamera(state.shown);
  setCamToggle();
});

function updatePlayIcon() {
  playIcon.innerHTML = state.playing
    ? '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>'
    : '<path d="M8 5v14l11-7z"/>';
  playBtn.setAttribute('aria-label', state.playing ? 'Pausar construcción' : 'Reproducir construcción');
}
function setPlaying(v) {
  state.playing = v;
  updatePlayIcon();
}
playBtn.addEventListener('click', () => {
  state.started = true;
  state.camAuto = true;
  setCamToggle();
  if (state.progress >= .999) {
    state.progress = 0;
    state.shown = 0;
    celebrated = false;
    applyBuild(0);
  }
  setPlaying(!state.playing);
});

progressSlider.addEventListener('input', () => {
  state.started = true;
  state.camAuto = true;
  setCamToggle();
  setPlaying(false);
  state.progress = +progressSlider.value / 1000;
  state.shown = state.progress;
  applyBuild(state.shown);
  updateHUD(1);
});

/* ---------------- hora ---------------- */
function setHour(h, fromSlider) {
  state.hour = h;
  updateSky();
  const hh = Math.floor(h) % 24;
  const mm = Math.round((h - Math.floor(h)) * 60) % 60;
  clockEl.textContent = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  if (!fromSlider) timeSlider.value = h;
}
timeSlider.addEventListener('input', () => setHour(+timeSlider.value, true));

/* ---------------- fases ---------------- */
document.querySelectorAll('.tabs button').forEach(btn => {
  btn.addEventListener('click', () => {
    const ph = +btn.dataset.phase;
    if (ph === state.phase) return;
    state.phase = ph;
    document.querySelectorAll('.tabs button').forEach(b => {
      const on = b === btn;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (ph === 2 && state.progress < .56) {
      state.progress = .58;
      state.shown = .58;
      celebrated = false;
      applyBuild(.58);
      setPlaying(true);
    }
    updateHUD(1);
  });
});

/* ---------------- cámara ---------------- */
const pointers = new Map();
let moved = 0, pinchDist = 0;
canvas.style.cursor = 'grab';

canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  moved = 0;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
  }
  canvas.style.cursor = 'grabbing';
});
canvas.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  moved += Math.abs(dx) + Math.abs(dy);
  if (moved > 6 && state.camAuto) { state.camAuto = false; setCamToggle(); }
  if (pointers.size === 1) {
    orbit.tTheta -= dx * .0045;
    orbit.tPhi = clamp(orbit.tPhi - dy * .0038, .3, 1.42);
  } else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchDist > 0 && d > 0) orbit.tRadius = clamp(orbit.tRadius * (pinchDist / d), 190, 920);
    pinchDist = d;
  }
});
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  const wasSingle = pointers.size === 1;
  pointers.delete(e.pointerId);
  canvas.style.cursor = 'grab';
  if (wasSingle && moved < 8) pick(e.clientX, e.clientY);
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', e => pointers.delete(e.pointerId));
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (state.camAuto) { state.camAuto = false; setCamToggle(); }
  orbit.tRadius = clamp(orbit.tRadius * (1 + Math.sign(e.deltaY) * .085), 190, 920);
}, { passive: false });

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const pickables = [pvMesh, helioMesh, towerGroup, storeGroup, powerGroup, subGroup, bessGroup, h2Group];
function pick(cx, cy) {
  ndc.set((cx / innerWidth) * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(pickables, true);
  if (!hits.length) { closeInfo(); return; }
  let o = hits[0].object, key = null;
  while (o && !key) {
    if (o.userData && o.userData.key) key = o.userData.key;
    o = o.parent;
  }
  if (key) openInfo(key); else closeInfo();
}

/* ---------------- aviso ---------------- */
let toastTimer = null;
function showToast() {
  toastEl.textContent = state.phase === 2
    ? 'Planta energizada · 500 MW · comunidades + exportación a EE. UU.'
    : 'Fase 1 energizada · 300 MW · venta a comunidades y red nacional';
  const stacked = innerWidth <= 980 || innerHeight < 720;
  const dockH = dockEl.getBoundingClientRect().height;
  const railH = stacked && getComputedStyle(railEl).display !== 'none'
    ? railEl.getBoundingClientRect().height + 8 : 0;
  toastEl.style.bottom = (dockH + railH + 18) + 'px';
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), 4600);
}

/* ---------------- bucle ---------------- */
const clock3 = new THREE.Clock();
let lastP = -1;

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock3.getDelta(), .05);
  const tt = clock3.elapsedTime;

  if (state.playing) {
    state.progress = Math.min(1, state.progress + dt * .031);
    if (state.progress >= 1) { setPlaying(false); }
  }

  state.shown += (state.progress - state.shown) * Math.min(1, dt * 8);
  if (Math.abs(state.shown - lastP) > .0006) {
    applyBuild(state.shown);
    lastP = state.shown;
  }

  updateHUD(dt);

  if (state.camAuto) directCamera(state.shown);
  const k = Math.min(1, dt * (state.camAuto ? 2.2 : 9));
  orbit.theta = lerp(orbit.theta, orbit.tTheta, k);
  orbit.phi = lerp(orbit.phi, orbit.tPhi, k);
  orbit.radius = lerp(orbit.radius, orbit.tRadius, k);
  orbit.target.lerp(orbit.tTarget, k);

  const sp = Math.sin(orbit.phi), cp = Math.cos(orbit.phi);
  camera.position.set(
    orbit.target.x + orbit.radius * sp * Math.sin(orbit.theta),
    orbit.target.y + orbit.radius * cp,
    orbit.target.z + orbit.radius * sp * Math.cos(orbit.theta)
  );
  camera.lookAt(orbit.target);

  if (craneA.visible) craneA.rotation.y += dt * .07;
  if (craneB.visible) craneB.rotation.y -= dt * .05;

  truckA.position.set(460 - ((tt * 24) % 960), 0, 194);
  truckA.rotation.y = 0;
  truckB.position.set(-460 + ((tt * 18 + 320) % 960), 0, 202);
  truckB.rotation.y = Math.PI;

  updatePins();
  renderer.render(scene, camera);
}

/* ---------------- arranque ---------------- */
const topEl = document.querySelector('.top');
const kpisEl = document.querySelector('.kpis');
const dockEl = document.querySelector('.dock');
const railEl = document.getElementById('zonerail');

/* Apila los bloques según la altura real de la cabecera.
   Evita que la tira de KPIs se monte encima del título o de las pestañas
   cuando la pantalla es baja o estrecha. */
function layoutChrome() {
  const stacked = innerWidth <= 980 || innerHeight < 720;
  const topBottom = topEl.getBoundingClientRect().bottom;
  const dockH = dockEl.getBoundingClientRect().height;
  const dockTop = innerHeight - dockH;

  /* KPIs: tira horizontal en modo compacto, columna centrada en escritorio */
  if (stacked) {
    kpisEl.style.top = Math.round(topBottom + 6) + 'px';
  } else {
    const avail = dockTop - (topBottom + 10) - 10;
    const h = kpisEl.offsetHeight;
    kpisEl.style.top = Math.round(topBottom + 10 + Math.max(0, (avail - h) / 2)) + 'px';
  }
  kpisEl.style.transform = 'none';

  /* riel de zonas: vertical a la derecha o fila sobre el dock */
  const lift = Math.round(dockH) + 8;
  railEl.style.bottom = stacked ? lift + 'px' : '';
  const railVisible = getComputedStyle(railEl).display !== 'none';
  const railH = stacked && railVisible ? Math.round(railEl.getBoundingClientRect().height) : 0;

  /* ficha de zona: encima del dock (o del riel) en compacto, bajo la cabecera en escritorio */
  if (stacked) {
    infoCard.style.top = '';
    infoCard.style.bottom = (lift + railH + 2) + 'px';
  } else {
    infoCard.style.bottom = '';
    infoCard.style.top = Math.round(topBottom + 12) + 'px';
  }
  return { topBottom, dockH, dockTop, railH, stacked };
}

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(innerWidth, innerHeight);

  const { topBottom, dockH, railH, stacked } = layoutChrome();
  const kpisRect = kpisEl.getBoundingClientRect();
  const kpisVisible = getComputedStyle(kpisEl).display !== 'none';
  const bandTop = (stacked && kpisVisible ? Math.max(topBottom, kpisRect.bottom) : topBottom) + 6;
  const bandBottom = innerHeight - dockH - 6;
  const bandCenter = (bandTop + bandBottom) / 2;
  const offset = clamp(innerHeight / 2 - bandCenter, 0, innerHeight * .22);
  camera.setViewOffset(innerWidth, innerHeight, 0, offset, innerWidth, innerHeight);

  const ar = innerWidth / innerHeight;
  camFit = ar < 1.25 ? 1.3 : ar < 1.65 ? 1.12 : 1;
  if (state.camAuto) directCamera(state.shown);

  const hint = document.querySelector('.hint');
  if (hint) hint.style.bottom = (dockH + railH + 14) + 'px';
  const toast = document.querySelector('.toast');
  if (toast) toast.style.bottom = (dockH + railH + 18) + 'px';
}
addEventListener('resize', onResize);

/* la cabecera cambia de alto al cargar las fuentes o al girar el equipo */
if ('ResizeObserver' in window) {
  let pending = false;
  new ResizeObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; onResize(); });
  }).observe(topEl);
}

setHour(18, false);
setCamToggle();
updateHUD(1);
applyBuild(0);
onResize();
window.__dbg = { state, orbit, setHour, updateSky, applyBuild, camera, apply: p => { state.progress = p; state.shown = p; applyBuild(p); } };
frame();

if (!reduceMotion) {
  setTimeout(() => {
    if (!state.started) { state.started = true; setPlaying(true); }
  }, 800);
}
})();
