// Scene 04: an abstract dark globe. Surface dots form clusters from seeded noise
// (deliberately not real geography, no countries, no named cities) and thin light
// arcs connect points on it, symbolising reach rather than claiming locations.
import * as THREE from 'three';
import { rng, prog, ease } from './util.js';
import { COLORS, glowTexture } from './materials.js';

function valueNoise3(seed) {
  const R = rng(seed);
  const N = 32;
  const g = new Float32Array(N * N * N);
  for (let i = 0; i < g.length; i++) g[i] = R();
  const at = (x, y, z) => g[(((z % N) + N) % N) * N * N + (((y % N) + N) % N) * N + (((x % N) + N) % N)];
  const s = (a) => a * a * (3 - 2 * a);
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = s(x - xi), yf = s(y - yi), zf = s(z - zi);
    const l = (a, b, k) => a + (b - a) * k;
    return l(
      l(l(at(xi, yi, zi), at(xi + 1, yi, zi), xf), l(at(xi, yi + 1, zi), at(xi + 1, yi + 1, zi), xf), yf),
      l(l(at(xi, yi, zi + 1), at(xi + 1, yi, zi + 1), xf), l(at(xi, yi + 1, zi + 1), at(xi + 1, yi + 1, zi + 1), xf), yf),
      zf,
    );
  };
}

export function createGlobe(lib, radius = 46) {
  const group = new THREE.Group();
  group.name = 'globe';
  const spin = new THREE.Group();
  group.add(spin);

  // Body: dark graphite sphere.
  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), new THREE.MeshPhysicalMaterial({
    color: '#070b12', metalness: 0.5, roughness: 0.55, envMapIntensity: 0.35, transparent: true, opacity: 0,
  }));
  spin.add(body);

  // Atmosphere rim (fresnel, very subtle).
  const rim = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.015, 96, 64), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide, toneMapped: false,
    uniforms: { uOpacity: { value: 0 }, uColor: { value: COLORS.blue.clone() } },
    vertexShader: `varying vec3 vN; varying vec3 vV;
      void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; uniform float uOpacity; uniform vec3 uColor;
      void main(){ float f = pow(clamp(1.0 - dot(vN, vV), 0.0, 1.0), 3.5); gl_FragColor = vec4(uColor * f * uOpacity, f * uOpacity); }`,
  }));
  group.add(rim);

  // Surface dots (Fibonacci sphere, masked by noise).
  const noise = valueNoise3(808);
  const N = 26000;
  const pts = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = ga * i;
    const x = Math.cos(th) * r, z = Math.sin(th) * r;
    const n = noise(x * 2.2 + 5, y * 2.2 + 5, z * 2.2 + 5) * 0.65 + noise(x * 5 + 9, y * 5 + 9, z * 5 + 9) * 0.35;
    if (n > 0.53 && Math.abs(y) < 0.93) pts.push(x * radius * 1.002, y * radius * 1.002, z * radius * 1.002);
  }
  const dGeo = new THREE.BufferGeometry();
  dGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const dMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uOpacity: { value: 0 }, uScale: { value: 500 }, uSize: { value: 0.32 } },
    vertexShader: `uniform float uScale, uSize; varying float vF;
      void main(){
        vec4 mv = modelViewMatrix*vec4(position,1.);
        vec3 n = normalize(normalMatrix*normalize(position));
        vF = smoothstep(-0.05, 0.45, dot(n, normalize(-mv.xyz)));
        gl_PointSize = max(1.0, uSize * uScale / -mv.z);
        gl_Position = projectionMatrix*mv;
      }`,
    fragmentShader: `uniform float uOpacity; varying float vF;
      void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.2, length(c)) * vF * uOpacity; if (a < 0.003) discard;
        gl_FragColor = vec4(vec3(0.62,0.72,0.86) * a, a); }`,
  });
  const dots = new THREE.Points(dGeo, dMat);
  spin.add(dots);

  // Faint graticule.
  const gratMat = new THREE.LineBasicMaterial({ color: COLORS.silver, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  for (let k = -4; k <= 4; k++) {
    const lat = (k / 5) * (Math.PI / 2);
    const g = new THREE.BufferGeometry().setFromPoints(
      Array.from({ length: 129 }, (_, i) => {
        const a = (i / 128) * Math.PI * 2;
        return new THREE.Vector3(Math.cos(a) * Math.cos(lat), Math.sin(lat), Math.sin(a) * Math.cos(lat)).multiplyScalar(radius * 1.004);
      }),
    );
    spin.add(new THREE.Line(g, gratMat));
  }

  // Arcs between seeded surface points.
  const R = rng(2026);
  const arcs = [];
  const randDir = () => {
    for (;;) {
      const v = new THREE.Vector3(R() * 2 - 1, (R() * 2 - 1) * 0.7, R() * 2 - 1);
      if (v.lengthSq() > 0.05 && v.lengthSq() < 1) return v.normalize();
    }
  };
  const glow = glowTexture(64, 2);
  for (let i = 0; i < 22; i++) {
    const a = randDir(), b0 = randDir();
    const b = a.clone().lerp(b0, 0.35 + R() * 0.4).normalize();
    const ang = a.angleTo(b);
    const lift = 1 + ang * 0.28;
    const ptsA = [];
    for (let j = 0; j <= 64; j++) {
      const s = j / 64;
      const d = new THREE.Vector3().copy(a).lerp(b, s).normalize();
      const h = 1 + (lift - 1) * Math.sin(Math.PI * s);
      ptsA.push(d.multiplyScalar(radius * h));
    }
    const curve = new THREE.CatmullRomCurve3(ptsA);
    const geo = new THREE.TubeGeometry(curve, 64, 0.11, 4, false);
    const mat = new THREE.MeshBasicMaterial({
      color: (R() < 0.35 ? COLORS.cyan : COLORS.blue).clone().multiplyScalar(1.4),
      transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    spin.add(mesh);
    const ends = [a, b].map((d) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: COLORS.cyan, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.position.copy(d).multiplyScalar(radius * 1.004);
      s.scale.setScalar(1.6);
      spin.add(s);
      return s;
    });
    arcs.push({ mesh, total: geo.index.count, start: 10.35 + R() * 1.2, dur: 0.7 + R() * 0.6, ends });
  }

  function update(t, state) {
    group.visible = state.opacity > 0.001;
    if (!group.visible) return;
    spin.rotation.y = 0.6 + t * 0.05;
    spin.rotation.x = 0.32;
    const o = state.opacity;
    body.material.opacity = o;
    rim.material.uniforms.uOpacity.value = 0.55 * o;
    dMat.uniforms.uOpacity.value = 0.9 * o;
    dMat.uniforms.uScale.value = state.scale;
    gratMat.opacity = 0.05 * o;
    for (const a of arcs) {
      const k = ease.inOutCubic(prog(t, a.start, a.start + a.dur));
      a.mesh.geometry.setDrawRange(0, Math.floor((a.total / 6) * k) * 6);
      a.mesh.material.opacity = 0.75 * o;
      a.ends[0].material.opacity = (k > 0 ? 0.8 : 0) * o;
      a.ends[1].material.opacity = (k >= 1 ? 0.8 : 0) * o;
    }
  }

  return { group, update };
}
