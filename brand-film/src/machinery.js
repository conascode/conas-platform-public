// Procedural mechanical, optical and digital parts shared by every scene.
// Everything is generated from parameters and seeds — no external models.
import * as THREE from 'three';
import { rng } from './util.js';
import { COLORS } from './materials.js';

// ------------------------------------------------------------------ gears
/** Spur gear outline. module m, teeth T. Pitch radius = m*T/2. */
export function gearGeometry(T, m, { thickness = 0.1, hole = 0.2, windows = 0, bevel = 0.012, hubR = null } = {}) {
  const rp = (m * T) / 2, ra = rp + m, rf = rp - 1.25 * m;
  const P = (Math.PI * 2) / T;
  const s = new THREE.Shape();
  for (let i = 0; i < T; i++) {
    const b = i * P;
    const pts = [[rf, b - 0.3 * P], [ra, b - 0.16 * P], [ra, b + 0.16 * P], [rf, b + 0.3 * P]];
    pts.forEach(([r, a], k) => {
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0 && k === 0) s.moveTo(x, y); else s.lineTo(x, y);
    });
  }
  s.closePath();
  if (hole > 0) {
    const h = new THREE.Path();
    h.absarc(0, 0, hole, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  if (windows > 0) {
    const hub = hubR ?? hole * 1.9 + m;
    const rim = rf - m * 1.6;
    if (rim - hub > m * 2) {
      const mid = (hub + rim) / 2;
      const wr = Math.min((rim - hub) / 2 * 0.86, Math.sin(Math.PI / windows) * mid * 0.72);
      for (let k = 0; k < windows; k++) {
        const a = (k / windows) * Math.PI * 2 + 0.3;
        const h = new THREE.Path();
        h.absarc(Math.cos(a) * mid, Math.sin(a) * mid, wr, 0, Math.PI * 2, true);
        s.holes.push(h);
      }
    }
  }
  const g = new THREE.ExtrudeGeometry(s, {
    depth: thickness, curveSegments: 10, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 1,
  });
  g.translate(0, 0, -thickness / 2);
  g.userData = { rp, T };
  return g;
}

/**
 * A meshing gear train. Each gear spec: { T, parent (index) , angle (rad, direction from parent),
 * m, z, thickness, mat }. Returns { group, update(theta0) } with correct ratios and tooth phase.
 */
export function gearTrain(specs, materials) {
  const group = new THREE.Group();
  const gears = [];
  const geoCache = new Map();
  for (const sp of specs) {
    const key = `${sp.T}-${sp.m}-${sp.thickness}-${sp.windows}-${sp.hole}`;
    if (!geoCache.has(key)) geoCache.set(key, gearGeometry(sp.T, sp.m, { thickness: sp.thickness ?? 0.12, hole: sp.hole ?? sp.m * 3, windows: sp.windows ?? 0 }));
    const geo = geoCache.get(key);
    const mesh = new THREE.Mesh(geo, materials[sp.mat ?? 0]);
    mesh.castShadow = mesh.receiveShadow = true;
    const g = { ...sp, mesh, rp: (sp.m * sp.T) / 2, pos: new THREE.Vector2() };
    if (sp.parent === undefined || sp.parent === null) {
      g.pos.set(sp.x ?? 0, sp.y ?? 0);
    } else {
      const p = gears[sp.parent];
      const d = p.rp + g.rp;
      g.pos.set(p.pos.x + Math.cos(sp.angle) * d, p.pos.y + Math.sin(sp.angle) * d);
    }
    mesh.position.set(g.pos.x, g.pos.y, sp.z ?? 0);
    group.add(mesh);
    gears.push(g);
  }
  function update(theta0) {
    gears.forEach((g, i) => {
      if (g.parent === undefined || g.parent === null) { g.theta = theta0 * (g.speed ?? 1) + (g.phase ?? 0); }
      else {
        const p = gears[g.parent];
        const a = g.angle;
        g.theta = a + Math.PI - (p.T / g.T) * (p.theta - a) + Math.PI / g.T;
      }
      g.mesh.rotation.z = g.theta;
    });
  }
  return { group, gears, update };
}

// ------------------------------------------------------------------ rings / bearings / pistons
export function flatRing(rOuter, rInner, depth, { segments = 128, bevel = 0.01 } = {}) {
  const s = new THREE.Shape();
  s.absarc(0, 0, rOuter, 0, Math.PI * 2, false);
  const h = new THREE.Path();
  h.absarc(0, 0, rInner, 0, Math.PI * 2, true);
  s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth, curveSegments: segments, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 2 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Engraved tick marks around a ring, as one instanced mesh. */
export function ringTicks(radius, count, size, mat, { major = 8, depthZ = 0 } = {}) {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const im = new THREE.InstancedMesh(geo, mat, count);
  const o = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const big = i % major === 0;
    o.position.set(Math.cos(a) * radius, Math.sin(a) * radius, depthZ);
    o.rotation.set(0, 0, a);
    o.scale.set(size * (big ? 2.2 : 1), size * 0.22, size * 0.5);
    o.updateMatrix();
    im.setMatrixAt(i, o.matrix);
  }
  return im;
}

export function bearing(r, w, mats) {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(flatRing(r, r * 0.8, w, { segments: 64 }), mats.outer);
  const inner = new THREE.Mesh(flatRing(r * 0.52, r * 0.32, w * 1.1, { segments: 48 }), mats.inner);
  const n = 12;
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(r * 0.13, 16, 12), mats.ball, n);
  const cage = new THREE.Group();
  const o = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    o.position.set(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66, 0);
    o.updateMatrix();
    balls.setMatrixAt(i, o.matrix);
  }
  cage.add(balls);
  [outer, inner, balls].forEach((m) => { m.castShadow = m.receiveShadow = true; });
  g.add(outer, inner, cage);
  return { group: g, update: (a) => { inner.rotation.z = a; cage.rotation.z = a * 0.42; } };
}

export function piston(r, len, mats) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 40, 1), mats.body);
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.42, r * 0.42, len * 0.9, 24, 1), mats.rod);
  const cap1 = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.22, r * 1.22, len * 0.08, 40), mats.cap);
  const cap2 = cap1.clone();
  cap1.position.y = len / 2; cap2.position.y = -len / 2;
  const collars = new THREE.InstancedMesh(new THREE.CylinderGeometry(r * 1.05, r * 1.05, len * 0.02, 40), mats.cap, 4);
  const o = new THREE.Object3D();
  for (let i = 0; i < 4; i++) { o.position.y = -len * 0.3 + i * len * 0.2; o.updateMatrix(); collars.setMatrixAt(i, o.matrix); }
  [body, rod, cap1, cap2, collars].forEach((m) => { m.castShadow = m.receiveShadow = true; });
  g.add(body, rod, cap1, cap2, collars);
  return { group: g, rod, update: (k) => { rod.position.y = len * 0.5 + k * len * 0.35; } };
}

// ------------------------------------------------------------------ optics
export function glassMaterial(opts = {}) {
  return new THREE.MeshPhysicalMaterial({
    color: '#eef3fa', metalness: 0, roughness: 0.03, transmission: 1, thickness: 1.2, ior: 1.52,
    envMapIntensity: 1.4, specularIntensity: 1, clearcoat: 1, clearcoatRoughness: 0.02,
    attenuationColor: new THREE.Color('#a9bedc'), attenuationDistance: 2.4, dispersion: 0.35, ...opts,
  });
}

export function lensGeometry(r, thick, segs = 48) {
  const pts = [];
  const n = 20;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI / 2;
    pts.push(new THREE.Vector2(Math.sin(a) * r, Math.cos(a) * thick / 2));
  }
  for (let i = n; i >= 0; i--) {
    const a = (i / n) * Math.PI / 2;
    pts.push(new THREE.Vector2(Math.sin(a) * r, -Math.cos(a) * thick / 2));
  }
  const g = new THREE.LatheGeometry(pts, segs);
  g.rotateX(Math.PI / 2);
  return g;
}

export function prismGeometry(side, length) {
  const s = new THREE.Shape();
  const h = (side * Math.sqrt(3)) / 2;
  s.moveTo(-side / 2, -h / 3); s.lineTo(side / 2, -h / 3); s.lineTo(0, (2 * h) / 3); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: length, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2 });
  g.translate(0, 0, -length / 2);
  return g;
}

// ------------------------------------------------------------------ digital
/** Instanced boxes with emissive edge lines (data cubes, chips, server racks). */
export function edgeBoxMaterial(base, edgeColor = COLORS.blue, edgeWidth = 0.05) {
  const m = base;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uEdgeColor = { value: edgeColor.clone() };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aGlow; varying float vGlow; varying vec2 vEdge;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow; vEdge = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uEdgeColor; varying float vGlow; varying vec2 vEdge;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec2 ee = min(vEdge, 1.0 - vEdge);
        float edge = 1.0 - smoothstep(0.0, ${edgeWidth.toFixed(3)}, min(ee.x, ee.y));
        totalEmissiveRadiance += uEdgeColor * edge * vGlow;`);
  };
  m.customProgramCacheKey = () => `edgebox-${edgeWidth}`;
  return m;
}

/**
 * A field of floating data cubes on lattice positions. Returns { mesh, update(t, converge, target) }.
 * count, region: { min: Vector3, max: Vector3 }, avoid: (pos) => bool to skip positions.
 */
export function cubeField(count, region, { seed = 1, lattice = 2.0, sizeMin = 0.2, sizeMax = 0.8, glowFrac = 0.18, avoid = null, material } = {}) {
  const R = rng(seed);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const glow = new Float32Array(count);
  geo.setAttribute('aGlow', new THREE.InstancedBufferAttribute(glow, 1));
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.castShadow = true;
  const items = [];
  let tries = 0;
  while (items.length < count && tries < count * 50) {
    tries++;
    const p = new THREE.Vector3(
      Math.round((region.min.x + R() * (region.max.x - region.min.x)) / lattice) * lattice,
      Math.round((region.min.y + R() * (region.max.y - region.min.y)) / lattice) * lattice,
      Math.round((region.min.z + R() * (region.max.z - region.min.z)) / lattice) * lattice,
    );
    if (avoid && avoid(p)) continue;
    const s = sizeMin + Math.pow(R(), 1.8) * (sizeMax - sizeMin);
    const axis = new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
    items.push({ p, s, axis, spin: (R() - 0.5) * 0.9, phase: R() * 6.28, bob: R() * 6.28, g: R() < glowFrac ? 0.6 + R() * 1.4 : 0 });
  }
  items.forEach((it, i) => { glow[i] = it.g; });
  mesh.count = items.length;
  const o = new THREE.Object3D();
  const q = new THREE.Quaternion();
  function update(t, { converge = 0, target = null, visible = 1, appear = null } = {}) {
    items.forEach((it, i) => {
      o.position.copy(it.p);
      o.position.y += Math.sin(t * 0.6 + it.bob) * 0.12 * lattice;
      if (target && converge > 0) o.position.lerp(target, converge);
      q.setFromAxisAngle(it.axis, it.phase + t * it.spin);
      o.quaternion.copy(q);
      let s = it.s * visible * (1 - converge * 0.85);
      if (appear) s *= appear(it.p, i);
      o.scale.setScalar(Math.max(1e-4, s));
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }
  return { mesh, items, update };
}

// ------------------------------------------------------------------ light
/** Fake volumetric beam: open cone, brighter at the source, softened at the silhouette. */
export function lightBeam(length, r0, r1, color, intensity = 0.25) {
  const geo = new THREE.CylinderGeometry(r0, r1, length, 48, 24, true);
  geo.translate(0, -length / 2, 0); // apex at origin, points down -Y
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uI: { value: intensity }, uLen: { value: length }, uT: { value: 0 } },
    vertexShader: `varying float vY; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vY = -position.y; vP = position; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uI, uLen, uT; varying float vY; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){
        float along = clamp(vY / uLen, 0.0, 1.0);
        float edge = pow(abs(dot(vN, vV)), 1.6);
        float fall = (1.0 - along) * (1.0 - along) * smoothstep(0.0, 0.04, along);
        float dust = 0.85 + 0.15 * sin(vP.y * 3.1 + uT * 0.7 + sin(vP.x * 5.0));
        float a = edge * fall * uI * dust;
        gl_FragColor = vec4(uColor * a, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5;
  return mesh;
}

/** Faceted architectural column (n-sided) with base and capital. */
export function columnGeometry(r, h, sides = 16) {
  const shaft = new THREE.CylinderGeometry(r, r * 1.04, h, sides, 1);
  shaft.translate(0, h / 2, 0);
  return shaft;
}
