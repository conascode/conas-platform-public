// Scenes 03-04: the data space around the group network (network-local coordinates).
//  - circuit-board floor with chips and pins (traces/pulses are drawn by the floor shader in network.js)
//  - fibre-optic bundles rising from the floor into every company node, light travelling upward
//  - a lattice of floating data cubes in three depth layers
//  - server towers in the background
//  - scene 04: square frames forming a tunnel along the camera's pull-back, armillary rings
//    and satellites around the globe
import * as THREE from 'three';
import { rng, prog, ease, clamp, lerp } from './util.js';
import { COLORS } from './materials.js';
import { cubeField, edgeBoxMaterial, flatRing } from './machinery.js';

const FLOOR_Y = -11;

function rackTexture() {
  const W = 128, H = 512, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const R = rng(64);
  for (let y = 8; y < H - 8; y += 10) {
    for (let x = 10; x < W - 10; x += 14) {
      if (R() < 0.45) continue;
      const blue = R() < 0.35;
      const v = 0.35 + R() * 0.65;
      g.fillStyle = blue ? `rgba(74,141,255,${v})` : `rgba(190,205,225,${v * 0.7})`;
      g.fillRect(x, y, 6, 2);
    }
  }
  g.fillStyle = 'rgba(120,150,200,0.5)';
  g.fillRect(2, 0, 1, H); g.fillRect(W - 3, 0, 1, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function createDatascape(lib, nodes, { avoidPath = [], cameraPathFn = null, globeCenter, globeRadius }) {
  const group = new THREE.Group();     // converges into H
  group.name = 'datascape';
  const H = nodes[0].home.clone();

  // ---------- chips on the circuit floor ----------
  const R = rng(4711);
  const chipMat = edgeBoxMaterial(new THREE.MeshPhysicalMaterial({ color: '#0e1116', metalness: 0.6, roughness: 0.42, envMapIntensity: 0.8 }), COLORS.silver, 0.03);
  const chipGeo = new THREE.BoxGeometry(1, 1, 1);
  const CH = 44;
  const chipGlow = new Float32Array(CH);
  chipGeo.setAttribute('aGlow', new THREE.InstancedBufferAttribute(chipGlow, 1));
  const chips = new THREE.InstancedMesh(chipGeo, chipMat, CH);
  const pinGeo = new THREE.BoxGeometry(0.12, 0.08, 0.5);
  const PIN_PER = 16;
  const pins = new THREE.InstancedMesh(pinGeo, lib.silver(), CH * PIN_PER);
  const o = new THREE.Object3D();
  let ci = 0, pi = 0;
  while (ci < CH) {
    const x = Math.round((R() - 0.5) * 110 / 4) * 4, z = Math.round((R() - 0.5) * 100 / 4) * 4 - 6;
    if (Math.hypot(x - 2, z - 4) < 9) continue;
    const w = 2 + Math.round(R() * 3), d = 2 + Math.round(R() * 3);
    o.position.set(x, FLOOR_Y + 0.18, z); o.rotation.set(0, 0, 0); o.scale.set(w, 0.36, d); o.updateMatrix();
    chips.setMatrixAt(ci, o.matrix);
    chipGlow[ci] = 0.35;
    for (let k = 0; k < PIN_PER; k++) {
      const side = k < PIN_PER / 2 ? -1 : 1;
      const j = k % (PIN_PER / 2);
      o.position.set(x - w / 2 + (j + 0.5) * (w / (PIN_PER / 2)), FLOOR_Y + 0.05, z + side * (d / 2 + 0.25));
      o.scale.set(1, 1, 1); o.updateMatrix();
      pins.setMatrixAt(pi++, o.matrix);
    }
    ci++;
  }
  chips.receiveShadow = pins.receiveShadow = true;
  group.add(chips, pins);

  // ---------- fibre-optic bundles into the nodes ----------
  const fibreMat = (seed) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uT: { value: 0 }, uSeed: { value: seed }, uOpacity: { value: 0 }, uColor: { value: COLORS.blue.clone() }, uHead: { value: COLORS.cyan.clone() } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec2 vUv; uniform float uT, uSeed, uOpacity; uniform vec3 uColor, uHead;
      void main(){
        float p = fract(vUv.x * 1.6 - uT * 0.55 + uSeed);
        float pulse = smoothstep(0.92, 1.0, p) * 1.0 + smoothstep(0.6, 1.0, p) * 0.15;
        vec3 c = uColor * 0.22 + uHead * pulse * 1.6;
        float a = (0.22 + pulse) * uOpacity;
        gl_FragColor = vec4(c * uOpacity, a);
      }`,
  });
  const fibres = [];
  nodes.forEach((n, ni) => {
    const count = n.tier === 0 ? 7 : n.tier === 1 ? 4 : 3;
    for (let k = 0; k < count; k++) {
      const spread = n.tier === 0 ? 7 : 4;
      const a = (k / count) * Math.PI * 2 + ni;
      const start = new THREE.Vector3(n.home.x + Math.cos(a) * spread, FLOOR_Y, n.home.z + Math.sin(a) * spread * 0.8);
      const end = new THREE.Vector3(n.home.x + (k / (count - 1) - 0.5) * n.w * 0.6, n.home.y - n.h / 2 - 0.1, n.home.z - 0.15);
      const curve = new THREE.CubicBezierCurve3(start, start.clone().add(new THREE.Vector3(0, 4, 0)), end.clone().add(new THREE.Vector3(0, -3.5, 0)), end);
      const geo = new THREE.TubeGeometry(curve, 64, 0.035, 5, false);
      const mesh = new THREE.Mesh(geo, fibreMat(R()));
      group.add(mesh);
      fibres.push({ mesh, total: geo.index.count, node: n, delay: k * 0.05 });
    }
  });

  // ---------- data cubes (three depth layers on a lattice) ----------
  const cubeMat = edgeBoxMaterial(new THREE.MeshPhysicalMaterial({ color: '#141a22', metalness: 0.85, roughness: 0.22, envMapIntensity: 1.1, clearcoat: 0.6 }), COLORS.blue, 0.06);
  const nearNode = (p) => nodes.some((n) => p.distanceTo(n.home) < Math.max(n.w, 3) * 0.95);
  const nearPath = (p) => avoidPath.some((q) => p.distanceTo(q) < 3.2);
  const cubes = cubeField(560, { min: new THREE.Vector3(-70, -9, -60), max: new THREE.Vector3(70, 30, 46) }, {
    seed: 99, lattice: 3, sizeMin: 0.25, sizeMax: 1.1, glowFrac: 0.2, material: cubeMat,
    avoid: (p) => nearNode(p) || nearPath(p) || (p.y < -6 && Math.abs(p.x) < 16 && p.z > -6 && p.z < 16),
  });
  // faint silver edges on the non-glowing cubes too
  const ga = cubes.mesh.geometry.attributes.aGlow;
  for (let i = 0; i < ga.count; i++) if (ga.array[i] === 0) ga.array[i] = 0.08;
  ga.needsUpdate = true;
  group.add(cubes.mesh);

  // ---------- server towers in the background ----------
  const rackTex = rackTexture();
  const rackMat = new THREE.MeshStandardMaterial({ color: '#0d1117', metalness: 0.7, roughness: 0.4, emissive: '#ffffff', emissiveMap: rackTex, emissiveIntensity: 0.9 });
  const rackGeo = new THREE.BoxGeometry(1, 1, 1);
  rackGeo.translate(0, 0.5, 0);
  const RACKS = 70;
  const racks = new THREE.InstancedMesh(rackGeo, rackMat, RACKS);
  for (let i = 0; i < RACKS; i++) {
    const row = i % 2;
    const a = -1.9 + (Math.floor(i / 2) / (RACKS / 2)) * 3.8;
    const rad = 95 + row * 22 + R() * 6;
    o.position.set(Math.sin(a) * rad, FLOOR_Y, -Math.cos(a) * rad + 10);
    o.rotation.set(0, -a, 0);
    o.scale.set(5 + R() * 3, 22 + R() * 46, 5);
    o.updateMatrix();
    racks.setMatrixAt(i, o.matrix);
  }
  group.add(racks);

  // ---------- rings around the holding company node ----------
  const hRings = [6.1, 6.7].map((r, i) => {
    const m = new THREE.Mesh(flatRing(r, r - (i ? 0.08 : 0.14), 0.08, { segments: 160 }), i ? lib.darkChrome() : lib.titanium());
    m.position.copy(H);
    group.add(m);
    return m;
  });

  // ---------- scene 04: frame tunnel along the camera pull-back ----------
  const tunnel = new THREE.Group();
  const frameGeo = (() => {
    const s = new THREE.Shape();
    const a = 10, b = 9.6;
    s.moveTo(-a, -a); s.lineTo(a, -a); s.lineTo(a, a); s.lineTo(-a, a); s.closePath();
    const h = new THREE.Path();
    h.moveTo(-b, -b); h.lineTo(-b, b); h.lineTo(b, b); h.lineTo(b, -b); h.closePath();
    s.holes.push(h);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 });
    g.translate(0, 0, -0.4);
    return g;
  })();
  const frameMat = lib.brushedFrame();
  const frameLine = new THREE.MeshBasicMaterial({ color: COLORS.blue.clone().multiplyScalar(0.75), toneMapped: false, transparent: true, opacity: 0.7 });
  const frames = [];
  if (cameraPathFn) {
    // Frames sit on the axis from the final pulled-back camera position to the network centre,
    // so the pull-back ends looking straight down a receding, ordered tunnel.
    const N = 8;
    const camEnd = cameraPathFn(12.3);
    const centre = new THREE.Vector3(1.5, -3, 4);
    const dir = centre.clone().sub(camEnd).normalize();
    for (let i = 0; i < N; i++) {
      const p = camEnd.clone().addScaledVector(dir, 16 + i * 11);
      const holder = new THREE.Group();
      holder.position.copy(p);
      holder.lookAt(p.clone().add(dir));
      const spin = new THREE.Group();
      const fm = new THREE.Mesh(frameGeo, frameMat);
      const line = new THREE.Mesh(flatRing(9.55, 9.5, 0.05, { segments: 4, bevel: 0 }), frameLine);
      line.rotation.z = Math.PI / 4;
      spin.add(fm, line);
      holder.add(spin);
      tunnel.add(holder);
      frames.push({ holder, spin, dir: i % 2 ? 1 : -1, base: i * 0.11 });
    }
  }
  group.add(tunnel);

  // ---------- scene 04: armillary rings + satellites around the globe ----------
  const armillary = new THREE.Group();
  armillary.position.copy(globeCenter);
  const armRings = [1.16, 1.26, 1.36].map((k, i) => {
    const holder = new THREE.Group();
    const m = new THREE.Mesh(flatRing(globeRadius * k, globeRadius * k - 0.9, 0.7, { segments: 256 }), i === 1 ? lib.darkChrome() : lib.titanium());
    holder.add(m);
    holder.rotation.set([1.2, 0.35, -0.6][i], [0, 0.8, -0.4][i], [0.2, -0.3, 0.9][i]);
    armillary.add(holder);
    return { holder, m, r: globeRadius * k - 0.45 };
  });
  const satGeo = new THREE.OctahedronGeometry(1.1, 0);
  const sats = new THREE.InstancedMesh(satGeo, lib.silver(), 12);
  armillary.add(sats);
  group.add(armillary);

  const tmpM = new THREE.Matrix4();
  function update(t, state) {
    group.visible = state.visible;
    if (!state.visible) return;
    const c = ease.inCubic(state.converge);
    group.position.copy(H).multiplyScalar(c);
    group.scale.setScalar(Math.max(1e-3, 1 - c));

    const sceneIn = prog(t, 6.3, 7.2);
    chips.visible = pins.visible = sceneIn > 0 && state.floor > 0.01;
    fibres.forEach((f) => {
      const k = ease.inOutCubic(prog(t, f.node.appear - 0.45 + f.delay, f.node.appear + 0.1 + f.delay));
      f.mesh.geometry.setDrawRange(0, Math.floor((f.total / 6) * k) * 6);
      f.mesh.visible = k > 0.001;
      f.mesh.material.uniforms.uT.value = t;
      f.mesh.material.uniforms.uOpacity.value = state.floor;
    });
    cubes.update(t, { visible: ease.outCubic(sceneIn) });
    racks.visible = sceneIn > 0;
    rackMat.emissiveIntensity = 0.9 * sceneIn;
    hRings.forEach((m, i) => {
      const k = ease.outCubic(prog(t, 6.55 + i * 0.12, 7.2 + i * 0.12));
      m.visible = k > 0.001;
      m.scale.setScalar(Math.max(1e-3, k));
      m.rotation.set(i ? 1.1 + t * 0.35 : 0.25 + Math.sin(t * 0.4) * 0.2, i ? -t * 0.5 : t * 0.3, t * (i ? -0.2 : 0.25));
    });
    frames.forEach((f, i) => {
      const k = ease.outCubic(prog(t, 10.0 + i * 0.08, 10.7 + i * 0.08));
      f.holder.visible = k > 0.001;
      f.spin.rotation.z = f.base + f.dir * (t - 10) * 0.06;
      f.spin.scale.setScalar(Math.max(1e-3, lerp(0.6, 1, k)));
    });
    const ak = ease.outCubic(prog(t, 10.2, 11.3));
    armillary.visible = ak > 0.001;
    armRings.forEach((r, i) => {
      r.m.rotation.z = t * (i % 2 ? -0.22 : 0.18);
      r.m.scale.setScalar(Math.max(1e-3, lerp(0.85, 1, ak)));
    });
    for (let i = 0; i < 12; i++) {
      const ring = armRings[i % 3];
      const a = (i / 12) * Math.PI * 2 + t * 0.3 * (i % 2 ? 1 : -1);
      o.position.set(Math.cos(a) * ring.r, Math.sin(a) * ring.r, 0);
      o.rotation.set(t, t * 0.7, 0);
      o.scale.setScalar(ak);
      o.updateMatrix();
      ring.holder.updateMatrix();
      tmpM.multiplyMatrices(ring.holder.matrix, o.matrix);
      sats.setMatrixAt(i, tmpM);
    }
    sats.instanceMatrix.needsUpdate = true;
  }

  return { group, update };
}
