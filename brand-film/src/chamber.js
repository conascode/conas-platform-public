// Scenes 01 + 05: the "core chamber" around the CONAS mark.
// Layers (back -> front): brushed back plate, large graphite gear train, titanium gear
// train meshing around the mark, gyroscope rings that assemble around the mark, glass
// optics (refracting spheres, lenses, prism), foreground bearings and pistons, a ring of
// monumental columns around the camera and soft volumetric beams from above.
import * as THREE from 'three';
import { rng, ease, clamp, prog, lerp } from './util.js';
import { COLORS } from './materials.js';
import {
  gearTrain, flatRing, ringTicks, bearing, piston, glassMaterial, lensGeometry, prismGeometry, lightBeam, columnGeometry,
} from './machinery.js';

const DEG = Math.PI / 180;

export function createChamber(lib) {
  const group = new THREE.Group();
  group.name = 'chamber';

  // ---------- materials ----------
  const titan = lib.titanium();
  const titanDark = lib.titanium(); titanDark.color.set('#6c7682'); titanDark.roughness = 0.5; titanDark.envMapIntensity = 1.0;
  const chrome = lib.darkChrome();
  const graphite = lib.graphite(); graphite.color.set('#111419');
  const graphiteLight = lib.graphite(); graphiteLight.color.set('#1e232a'); graphiteLight.roughness = 0.55; graphiteLight.metalness = 0.75;
  const frame = lib.brushedFrame();

  // ---------- back plate with machined grooves ----------
  const plateGeo = new THREE.CircleGeometry(16, 128);
  const plateMat = lib.graphite();
  plateMat.color.set('#14181e');
  plateMat.roughnessMap = lib.textures.spun;
  const plate = new THREE.Mesh(plateGeo, plateMat);
  plate.position.z = -6.8;
  plate.receiveShadow = true;
  group.add(plate);
  const grooves = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const r = 3.2 + i * 1.35;
    const ring = new THREE.Mesh(flatRing(r + 0.05, r, 0.06, { segments: 128, bevel: 0 }), frame);
    ring.position.z = -6.75;
    ring.receiveShadow = true;
    grooves.add(ring);
  }
  group.add(grooves);

  // ---------- back gear train (large, graphite) ----------
  const back = gearTrain([
    { T: 84, m: 0.15, x: -7.6, y: 2.6, z: -5.2, thickness: 0.3, windows: 7, mat: 0, speed: -0.22 },
    { T: 40, m: 0.15, parent: 0, angle: -32 * DEG, z: -5.2, thickness: 0.3, windows: 5, mat: 1 },
    { T: 64, m: 0.15, parent: 1, angle: -70 * DEG, z: -5.2, thickness: 0.3, windows: 6, mat: 0 },
    { T: 30, m: 0.15, parent: 2, angle: -10 * DEG, z: -5.2, thickness: 0.3, windows: 0, mat: 1 },
    { T: 96, m: 0.15, parent: 3, angle: 18 * DEG, z: -5.2, thickness: 0.3, windows: 8, mat: 0 },
    { T: 36, m: 0.15, parent: 4, angle: 95 * DEG, z: -5.2, thickness: 0.3, windows: 5, mat: 1 },
    { T: 52, m: 0.15, parent: 0, angle: 118 * DEG, z: -5.2, thickness: 0.3, windows: 6, mat: 1 },
  ], [graphite, graphiteLight]);
  group.add(back.group);

  // ---------- front gear train (titanium) meshing around the mark ----------
  const fz = -2.4;
  const sunT = 72, m = 0.07;
  const front = [
    { T: sunT, m, x: 0, y: 0, z: fz, thickness: 0.16, windows: 6, hole: 0.5, mat: 0, speed: 0.32 },
  ];
  const satAngles = [22, 78, 142, 198, 256, 318];
  satAngles.forEach((a, i) => front.push({ T: i % 2 ? 22 : 30, m, parent: 0, angle: a * DEG, z: fz + 0.02, thickness: 0.18, windows: i % 2 ? 0 : 5, mat: 1 }));
  // outer stage: larger gears driven by the satellites, alternating
  front.push({ T: 48, m, parent: 1, angle: 28 * DEG, z: fz - 0.02, thickness: 0.14, windows: 6, mat: 2 });
  front.push({ T: 40, m, parent: 3, angle: 150 * DEG, z: fz - 0.02, thickness: 0.14, windows: 5, mat: 2 });
  front.push({ T: 56, m, parent: 5, angle: 250 * DEG, z: fz - 0.02, thickness: 0.14, windows: 6, mat: 2 });
  front.push({ T: 18, m, parent: 2, angle: 85 * DEG, z: fz + 0.03, thickness: 0.2, windows: 0, mat: 1 });
  front.push({ T: 18, m, parent: 6, angle: 320 * DEG, z: fz + 0.03, thickness: 0.2, windows: 0, mat: 1 });
  front.push({ T: 34, m, parent: 4, angle: 200 * DEG, z: fz - 0.02, thickness: 0.14, windows: 5, mat: 2 });
  const frontTrain = gearTrain(front, [titanDark, chrome, titan]);
  group.add(frontTrain.group);
  // hub caps on every front gear (small bearings)
  const hubGeo = new THREE.CylinderGeometry(1, 1, 1, 32);
  hubGeo.rotateX(Math.PI / 2);
  const hubs = new THREE.InstancedMesh(hubGeo, chrome, frontTrain.gears.length);
  {
    const o = new THREE.Object3D();
    frontTrain.gears.forEach((g, i) => {
      o.position.set(g.pos.x, g.pos.y, fz + 0.14);
      const r = Math.max(0.08, g.rp * 0.16);
      o.scale.set(r, r, 0.16);
      o.updateMatrix();
      hubs.setMatrixAt(i, o.matrix);
    });
    hubs.castShadow = true;
  }
  group.add(hubs);

  // ---------- gyroscope rings around the mark ----------
  const ringSpecs = [
    { r: 0.99, w: 0.04, d: 0.06, mat: chrome, ticks: 0 },
    { r: 1.1, w: 0.075, d: 0.07, mat: titan, ticks: 96 },
    { r: 1.19, w: 0.03, d: 0.05, mat: chrome, ticks: 0 },
    { r: 1.32, w: 0.095, d: 0.09, mat: titan, ticks: 120 },
  ];
  // Black glass dial behind the mark so the mark always reads against the machinery.
  const dial = new THREE.Mesh(new THREE.CylinderGeometry(0.97, 0.97, 0.05, 128), new THREE.MeshPhysicalMaterial({
    color: '#04060a', metalness: 0.3, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 0.9,
  }));
  dial.rotation.x = Math.PI / 2;
  dial.position.z = -0.32;
  dial.receiveShadow = true;
  group.add(dial);
  const R = rng(5150);
  const rings = ringSpecs.map((s, i) => {
    const holder = new THREE.Group();
    const spin = new THREE.Group();
    const mesh = new THREE.Mesh(flatRing(s.r, s.r - s.w, s.d, { segments: 160, bevel: 0.008 }), s.mat);
    mesh.castShadow = mesh.receiveShadow = true;
    spin.add(mesh);
    if (s.ticks) {
      const tk = ringTicks(s.r - s.w * 0.5, s.ticks, s.w * 0.28, chrome, { major: 8, depthZ: s.d / 2 + 0.006 });
      spin.add(tk);
    }
    holder.add(spin);
    group.add(holder);
    const finalQ = new THREE.Quaternion();
    const finalZ = -0.26 - i * 0.05;
    const startQ = new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 3.2, (R() - 0.5) * 3.2, (R() - 0.5) * 3.2));
    const startPos = new THREE.Vector3((R() - 0.5) * 3, (R() - 0.5) * 2.4, -1.5 - R() * 2);
    return { holder, spin, finalQ, finalZ, startQ, startPos, dir: i % 2 ? 1 : -1, speed: 0.12 + i * 0.04 };
  });

  // ---------- optics ----------
  const glass = glassMaterial();
  const glassBlue = glassMaterial({ attenuationColor: new THREE.Color('#7fa6e6'), attenuationDistance: 1.6 });
  const spheres = [0.3, 0.38, 0.26].map((r, i) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 64, 48), i === 1 ? glassBlue : glass);
    mesh.castShadow = true;
    group.add(mesh);
    return { mesh, r, phase: [1.7, 3.5, 5.0][i] };
  });
  const lensMeshes = [[-2.95, 0.75, 0.4], [3.05, -0.55, 0.2]].map((p, i) => {
    const mesh = new THREE.Mesh(lensGeometry(0.62, 0.22), glass);
    mesh.position.set(...p);
    const rim = new THREE.Mesh(flatRing(0.68, 0.6, 0.12, { segments: 96 }), titan);
    mesh.add(rim);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  });
  const prism = new THREE.Mesh(prismGeometry(0.62, 1.5), glassBlue);
  prism.position.set(-3.4, -1.25, 0.7);
  group.add(prism);

  // ---------- foreground: bearings and pistons ----------
  const bear = [
    { p: [1.85, 1.2, 0.55], r: 0.42, rot: [0.2, -0.7, 0] },
    { p: [-2.3, 1.65, -0.6], r: 0.34, rot: [-0.3, 0.6, 0] },
    { p: [2.7, -1.55, -0.3], r: 0.3, rot: [0.4, -0.3, 0] },
  ].map((b) => {
    const x = bearing(b.r, b.r * 0.32, { outer: titan, inner: chrome, ball: lib.silver() });
    x.group.position.set(...b.p);
    x.group.rotation.set(...b.rot);
    group.add(x.group);
    return x;
  });
  const pistons = [
    { p: [3.25, -0.2, 0.15], r: 0.13, l: 2.4, rot: [0, 0, 0.12] },
    { p: [-3.7, 0.4, -0.2], r: 0.15, l: 2.8, rot: [0, 0, -0.1] },
    { p: [3.9, 1.1, -1.3], r: 0.11, l: 2.0, rot: [0.3, 0, 0.5] },
  ].map((s) => {
    const x = piston(s.r, s.l, { body: graphiteLight, rod: lib.silver(), cap: titan });
    x.group.position.set(...s.p);
    x.group.rotation.set(...s.rot);
    group.add(x.group);
    return x;
  });

  // ---------- monumental columns around the chamber (camera is inside the ring) ----------
  const colCount = 18;
  const cols = new THREE.InstancedMesh(columnGeometry(0.55, 18, 12), lib.brushedFrame(), colCount);
  const strips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 15, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color('#9fb3cc').multiplyScalar(1.1), toneMapped: false }), colCount);
  {
    const o = new THREE.Object3D();
    for (let i = 0; i < colCount; i++) {
      const a = ((i + 0.5) / colCount) * Math.PI * 2;
      o.position.set(Math.sin(a) * 11.5, -9, Math.cos(a) * 11.5 - 1.5);
      o.rotation.set(0, a, 0);
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      cols.setMatrixAt(i, o.matrix);
      o.position.set(Math.sin(a) * 10.9, 0, Math.cos(a) * 10.9 - 1.5);
      o.updateMatrix();
      strips.setMatrixAt(i, o.matrix);
    }
    cols.receiveShadow = true;
  }
  group.add(cols, strips);

  // ---------- volumetric beams ----------
  const beams = [
    { src: [-3.5, 8, 3], dst: [0, 0, 0], r: [0.25, 2.2], c: '#cfdcef', i: 0.16 },
    { src: [4.2, 8.5, 1.5], dst: [0.3, -0.5, -1.0], r: [0.2, 1.8], c: '#b9cbe4', i: 0.12 },
    { src: [0, 9, -4.5], dst: [0, -1, -2.2], r: [0.3, 2.8], c: '#6f98e8', i: 0.1 },
  ].map((b) => {
    const src = new THREE.Vector3(...b.src), dst = new THREE.Vector3(...b.dst);
    const len = src.distanceTo(dst) * 1.4;
    const beam = lightBeam(len, b.r[0], b.r[1] * 1.4, b.c, b.i);
    beam.position.copy(src);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dst.clone().sub(src).normalize());
    group.add(beam);
    return { beam, base: b.i };
  });

  // ---------- update ----------
  const tmpQ = new THREE.Quaternion();
  /**
   * t: film time. state.assemble 0..1 (rings lock), state.spread (scatter amount),
   * state.light 0..1 (chamber lights up), state.dim (final: background dimming).
   */
  function update(t, state) {
    group.visible = state.visible;
    if (!state.visible) return;
    const lt = state.light;
    const dk = ease.outCubic(clamp(state.assemble * 1.4));
    dial.scale.set(Math.max(1e-3, dk), 1, Math.max(1e-3, dk));
    frontTrain.update(t * 1.0 + 0.4);
    back.update(t * 1.0);
    rings.forEach((r, i) => {
      const k = ease.inOutCubic(clamp((state.assemble - i * 0.06) / (1 - 0.18)));
      const sp = state.spread;
      tmpQ.copy(r.finalQ).slerp(r.startQ, sp);
      r.holder.quaternion.slerpQuaternions(tmpQ, r.finalQ, k);
      r.holder.position.copy(r.startPos).multiplyScalar(sp).lerp(new THREE.Vector3(0, 0, r.finalZ), k);
      // before locking the rings tumble; after locking they turn in alternating directions
      r.spin.rotation.z = r.dir * t * r.speed + (1 - k) * t * 1.4 * r.dir;
    });
    spheres.forEach((s, i) => {
      const a = t * 0.42 + s.phase;
      const rad = 2.35 + i * 0.25;
      s.mesh.position.set(Math.cos(a) * rad, Math.sin(a) * rad * 0.35 + 0.2 * Math.sin(t + i), Math.sin(a) * 1.4 - 0.4);
    });
    lensMeshes.forEach((l, i) => { l.rotation.set(0.3, t * 0.35 * (i ? -1 : 1) + 0.6, 0.1); });
    prism.rotation.set(t * 0.25, 0.6 + t * 0.4, 0.35);
    bear.forEach((b, i) => b.update(t * (1.2 + i * 0.4)));
    pistons.forEach((p, i) => p.update(0.5 + 0.5 * Math.sin(t * 2.2 + i * 1.7)));
    beams.forEach((b) => { b.beam.material.uniforms.uI.value = b.base * lt * (1 - state.dim * 0.35); b.beam.material.uniforms.uT.value = t; });
    strips.material.color.setScalar(1.1 * lt);
  }

  return { group, update, rings };
}
