// Scenes 03-04: the CONAS group structure as a 3D network.
// CONAS HOLDINGS is the largest, brightest panel at the top of the hierarchy; affiliates
// get smaller per tier. Edges are thin blue light tubes that grow parent -> child, with
// small pulses travelling along them. No ownership figures are shown.
import * as THREE from 'three';
import { rng, prog, ease, clamp, lerp } from './util.js';
import { COLORS, glowTexture } from './materials.js';
import { createSymbol } from './symbol.js';

export const NODES = [
  { id: 'H', name: 'CONAS HOLDINGS', tier: 0, pos: [0, 3.4, 0], size: [6.4, 3.5], appear: 6.3 },
  { id: 'INV', name: 'CONAS INVESTMENT', parent: 'H', tier: 1, pos: [-10.8, -1.1, 0.4], size: [5.4, 2.0], appear: 7.0 },
  { id: 'CEL', name: 'CELLEXIS', parent: 'H', tier: 1, pos: [0.2, -1.6, 6.2], size: [5.0, 2.0], appear: 7.15 },
  { id: 'ALX', name: 'ALLX ACADEMY', parent: 'H', tier: 1, pos: [10.8, -1.1, 0.6], size: [5.4, 2.0], appear: 7.3 },
  { id: 'PRE', name: 'PRECISEON CHAIN', parent: 'CEL', tier: 2, pos: [-1.6, -6.2, 10.6], size: [4.6, 1.7], appear: 7.95 },
  { id: 'SH', name: '서현학원', parent: 'ALX', tier: 2, pos: [11.6, -5.5, 5.4], size: [4.0, 1.7], appear: 8.15 },
  { id: 'OR', name: '오름스터디카페', parent: 'SH', tier: 3, pos: [12.0, -9.2, 9.6], size: [4.2, 1.5], appear: 8.6 },
];
const EDGE_GROW = 0.5;

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

function pointsMaterial(map) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uMap: { value: map }, uScale: { value: 500 } },
    vertexShader: `
      attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
      uniform float uScale; varying float vA; varying vec3 vC;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, aSize * uScale / -mv.z);
        vA = aAlpha * clamp(gl_PointSize / 1.5, 0.0, 1.0); vC = aColor;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform sampler2D uMap; varying float vA; varying vec3 vC;
      void main(){ float a = texture2D(uMap, gl_PointCoord).a * vA; if (a < 0.003) discard; gl_FragColor = vec4(vC * a, a); }`,
  });
}

export function createNetwork(lib, labelsEl) {
  const group = new THREE.Group();
  group.name = 'network';
  const glow = glowTexture(128, 2.4);
  const byId = {};

  // ---------- node panels ----------
  for (const n of NODES) {
    const [w, h] = n.size;
    const node = { ...n, w, h, home: new THREE.Vector3(...n.pos) };
    const g = new THREE.Group();
    g.position.copy(node.home);
    group.add(g);
    node.group = g;
    node.inner = new THREE.Group();
    g.add(node.inner);

    const r = Math.min(w, h) * 0.12;
    const glassMat = lib.smokedGlass(n.tier === 0 ? 0.78 : 0.7);
    const glassGeo = new THREE.ExtrudeGeometry(roundedRect(w, h, r), { depth: 0.08, bevelEnabled: false, curveSegments: 6 });
    glassGeo.translate(0, 0, -0.04);
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.renderOrder = 2;
    node.inner.add(glass);

    // Frame: brushed metal ring around the glass.
    const frameShape = roundedRect(w + 0.14, h + 0.14, r + 0.07);
    frameShape.holes.push(roundedRect(w - 0.02, h - 0.02, r));
    const frameGeo = new THREE.ExtrudeGeometry(frameShape, { depth: 0.14, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6 });
    frameGeo.translate(0, 0, -0.07);
    const frameMat = n.tier === 0 ? lib.titanium() : lib.brushedFrame();
    frameMat.transparent = true;
    const frame = new THREE.Mesh(frameGeo, frameMat);
    node.inner.add(frame);

    // Accent hairline along the top edge (blue for the holding company, silver for affiliates).
    const acc = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.86, n.tier === 0 ? 0.035 : 0.022), new THREE.MeshBasicMaterial({
      color: (n.tier === 0 ? COLORS.blue.clone().multiplyScalar(2.2) : COLORS.silver.clone().multiplyScalar(0.9)),
      transparent: true, toneMapped: false, depthWrite: false,
    }));
    acc.position.set(0, h / 2 - 0.16, 0.09);
    node.inner.add(acc);

    // Soft halo behind the panel; the holding company's is larger and brighter.
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glow, color: COLORS.blue, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
    }));
    halo.scale.set(w * (n.tier === 0 ? 3.0 : 2.0), h * (n.tier === 0 ? 3.4 : 2.4), 1);
    halo.position.z = -0.4;
    g.add(halo);

    // Ripple ring emitted when the node appears.
    const ripple = new THREE.Mesh(new THREE.RingGeometry(0.985, 1.0, 128), new THREE.MeshBasicMaterial({
      color: COLORS.blue.clone().multiplyScalar(1.3), transparent: true, opacity: 0, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    }));
    ripple.position.z = -0.1;
    g.add(ripple);

    if (n.tier === 0) {
      const sym = createSymbol(lib);
      sym.setAssembly(1);
      sym.group.scale.setScalar(0.62);
      sym.group.position.set(0, 0.5, 0.22);
      node.inner.add(sym.group);
      node.symbol = sym;
    }

    // HTML label (projected each frame).
    const el = document.createElement('div');
    el.className = 'nlabel' + (n.tier === 0 ? ' root' : '') + (/[가-힣]/.test(n.name) ? ' ko' : '');
    el.innerHTML = `<span class="nm"></span>`;
    el.querySelector('.nm').textContent = n.name;
    labelsEl.appendChild(el);

    Object.assign(node, { glass, frame, acc, halo, ripple, el, glassMat, frameMat, baseGlassOpacity: glassMat.opacity });
    byId[n.id] = node;
  }
  const nodes = NODES.map((n) => byId[n.id]);

  // ---------- edges ----------
  const edgeMat = () => new THREE.MeshBasicMaterial({
    color: COLORS.blue.clone().multiplyScalar(1.5), transparent: true, opacity: 0.85,
    depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  });
  const edges = [];
  for (const n of nodes) {
    if (!n.parent) continue;
    const p = byId[n.parent];
    const a = p.home.clone().add(new THREE.Vector3(0, -p.h / 2 - 0.05, 0));
    const b = n.home.clone().add(new THREE.Vector3(0, n.h / 2 + 0.05, 0));
    const dy = Math.max(1.2, (a.y - b.y) * 0.55);
    const curve = new THREE.CubicBezierCurve3(a, a.clone().add(new THREE.Vector3(0, -dy, 0)), b.clone().add(new THREE.Vector3(0, dy, 0)), b);
    const geo = new THREE.TubeGeometry(curve, 120, n.tier === 1 ? 0.03 : 0.024, 6, false);
    const mesh = new THREE.Mesh(geo, edgeMat());
    group.add(mesh);
    edges.push({ child: n, parent: p, curve, mesh, total: geo.index.count, start: n.appear - EDGE_GROW, end: n.appear });
  }

  // ---------- expansion lines (scene 04): long arcs reaching out from the structure ----------
  const R = rng(9090);
  const expansions = [];
  for (let i = 0; i < 14; i++) {
    const from = nodes[Math.floor(R() * nodes.length)];
    const a = from.home.clone();
    const dir = new THREE.Vector3(R() - 0.5, (R() - 0.5) * 0.5, R() - 0.5).normalize();
    const len = 30 + R() * 70;
    const b = a.clone().add(dir.clone().multiplyScalar(len));
    const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, len * (0.12 + R() * 0.18), 0));
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const geo = new THREE.TubeGeometry(curve, 100, 0.018 + R() * 0.016, 4, false);
    const mat = edgeMat();
    mat.opacity = 0.5;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    group.add(mesh);
    expansions.push({ curve, mesh, total: geo.index.count, start: 10.05 + R() * 0.9, dur: 0.9 + R() * 0.7, seed: R() });
  }

  // ---------- data pulses travelling on edges ----------
  const PULSES_PER_EDGE = 3;
  const PULSES_PER_EXP = 2;
  const nPulse = edges.length * PULSES_PER_EDGE + expansions.length * PULSES_PER_EXP + 32;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(nPulse * 3), 3));
  pGeo.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(nPulse), 1));
  pGeo.setAttribute('aAlpha', new THREE.BufferAttribute(new Float32Array(nPulse), 1));
  pGeo.setAttribute('aColor', new THREE.BufferAttribute(new Float32Array(nPulse * 3), 3));
  const pMat = pointsMaterial(glow);
  const pulses = new THREE.Points(pGeo, pMat);
  pulses.frustumCulled = false;
  group.add(pulses);

  // ---------- ambient dust for depth/parallax ----------
  const DUST = 1400;
  const dGeo = new THREE.BufferGeometry();
  const dPos = new Float32Array(DUST * 3), dSize = new Float32Array(DUST), dAlpha = new Float32Array(DUST), dCol = new Float32Array(DUST * 3);
  const RD = rng(31337);
  const dBase = [];
  for (let i = 0; i < DUST; i++) {
    const p = [(RD() - 0.5) * 90, (RD() - 0.5) * 44 - 2, (RD() - 0.5) * 90];
    dBase.push(p, RD() * Math.PI * 2);
    dSize[i] = 0.05 + RD() * 0.09;
    dAlpha[i] = 0.15 + RD() * 0.45;
    const blue = RD() < 0.25;
    dCol[i * 3] = blue ? 0.45 : 0.75; dCol[i * 3 + 1] = blue ? 0.65 : 0.8; dCol[i * 3 + 2] = blue ? 1.0 : 0.88;
  }
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  dGeo.setAttribute('aSize', new THREE.BufferAttribute(dSize, 1));
  dGeo.setAttribute('aAlpha', new THREE.BufferAttribute(dAlpha.slice(), 1));
  dGeo.setAttribute('aColor', new THREE.BufferAttribute(dCol, 3));
  const dust = new THREE.Points(dGeo, pointsMaterial(glow));
  dust.frustumCulled = false;
  group.add(dust);

  // ---------- data floor: fine grid fading with distance ----------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uOpacity: { value: 0 }, uColor: { value: COLORS.blue.clone() }, uReveal: { value: 0 } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec2 vP; uniform float uOpacity, uReveal; uniform vec3 uColor;
      float grid(vec2 p, float s, float w){ vec2 g = abs(fract(p/s - 0.5) - 0.5) / fwidth(p/s); return 1.0 - min(min(g.x, g.y) / w, 1.0); }
      void main(){
        float d = length(vP);
        float fine = grid(vP, 2.0, 1.0) * 0.35;
        float major = grid(vP, 10.0, 1.2) * 0.9;
        float fade = exp(-d * 0.028);
        float reveal = 1.0 - smoothstep(uReveal - 12.0, uReveal, d);
        float a = (fine + major) * fade * reveal * uOpacity;
        gl_FragColor = vec4(uColor * a, a);
      }`,
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -11;
  group.add(floor);

  // Core glow used for the final convergence.
  const core = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glow, color: new THREE.Color('#cfe0ff'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0,
  }));
  core.position.copy(byId.H.home);
  group.add(core);

  // label width cache at 100px
  const widthAt100 = new Map();
  function measure(n) {
    if (!widthAt100.has(n.id)) {
      const s = n.el.querySelector('.nm');
      s.style.fontSize = '100px';
      widthAt100.set(n.id, s.getBoundingClientRect().width / 100);
    }
    return widthAt100.get(n.id);
  }

  const v = new THREE.Vector3(), v2 = new THREE.Vector3();
  const camLocal = new THREE.Vector3();

  /**
   * t: film time. camera: active camera. state: { labelAlpha, converge (0..1), expand (0..1), visible }.
   */
  function update(t, camera, renderer, state) {
    group.visible = state.visible;
    nodes.forEach((n) => { n.el.style.opacity = '0'; });
    if (!state.visible) return;

    const H = renderer.getDrawingBufferSize(new THREE.Vector2()).y;
    const scale = H * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    pMat.uniforms.uScale.value = scale;
    dust.material.uniforms.uScale.value = scale;

    group.updateMatrixWorld(true);
    camLocal.copy(camera.position);
    group.worldToLocal(camLocal);

    const conv = state.converge; // 0..1, everything collapses into H
    const convE = ease.inCubic(conv);
    const Hpos = byId.H.home;

    // nodes
    for (const n of nodes) {
      const a = ease.outCubic(prog(t, n.appear, n.appear + 0.55));
      const pos = n.home.clone().lerp(Hpos, n.tier === 0 ? 0 : convE);
      n.group.position.copy(pos);
      const s = lerp(0.82, 1, a) * (n.tier === 0 ? lerp(1, 0.35, convE) : lerp(1, 0.1, convE));
      n.group.scale.setScalar(Math.max(0.001, s));
      const vis = a * (1 - (n.tier === 0 ? prog(conv, 0.6, 1) : prog(conv, 0.2, 0.85)));
      n.group.visible = vis > 0.001;

      // Face the camera: full yaw, partial pitch.
      v.copy(camLocal).sub(pos);
      const yaw = Math.atan2(v.x, v.z);
      const pitch = Math.atan2(v.y, Math.hypot(v.x, v.z)) * 0.55;
      n.inner.rotation.set(-pitch, yaw, 0, 'YXZ');

      n.glassMat.opacity = n.baseGlassOpacity * vis;
      n.frameMat.opacity = vis;
      n.acc.material.opacity = vis;
      const haloBase = n.tier === 0 ? 0.24 : 0.08;
      n.halo.material.opacity = haloBase * vis * (n.tier === 0 ? 1 + 0.25 * Math.sin(t * 2.4) * prog(t, 9.8, 10.2) : 1);

      // Ripple: expands once on appearance; holding company also pulses during scene 04.
      let rk = prog(t, n.appear, n.appear + 1.0);
      if (n.tier === 0 && t > 10) rk = ((t - 10.0) % 0.6) / 0.6 * (t < 12.4 ? 1 : 0);
      const rScale = Math.max(n.w, n.h) * lerp(0.56, n.tier === 0 ? 1.25 : 0.95, ease.outCubic(rk));
      n.ripple.scale.setScalar(rScale);
      n.ripple.rotation.copy(n.inner.rotation);
      n.ripple.material.opacity = (rk > 0 && rk < 1 ? Math.pow(1 - rk, 1.6) * 0.34 : 0) * (1 - conv);

      if (n.symbol) {
        n.symbol.sweep.uSwOrigin.value.copy(n.symbol.group.getWorldPosition(v2));
        n.symbol.sweep.uSwPos.value = lerp(-4, 4, prog(t, 6.6, 7.4));
        n.symbol.sweep.uSwAmt.value = 1;
        n.symbol.sweep.uSwWidth.value = 0.05;
      }

      // Label: project panel center (+offset) and fit text to panel width.
      const la = clamp(prog(t, n.appear + 0.12, n.appear + 0.5) * state.labelAlpha * (1 - prog(conv, 0, 0.25)));
      if (la > 0.002 && n.group.visible) {
        const yOff = n.tier === 0 ? -0.95 : -0.05;
        const left = new THREE.Vector3(-n.w / 2, yOff, 0.1), right = new THREE.Vector3(n.w / 2, yOff, 0.1);
        const ctr = new THREE.Vector3(0, yOff, 0.1);
        [left, right, ctr].forEach((p) => { n.inner.localToWorld(p); p.project(camera); });
        if (ctr.z < 1) {
          const px = (p) => [(p.x * 0.5 + 0.5) * 1920, (-p.y * 0.5 + 0.5) * 1080];
          const [lx, ly] = px(left), [rx, ry] = px(right), [cx, cy] = px(ctr);
          const panelPx = Math.hypot(rx - lx, ry - ly);
          const fit = n.tier === 0 ? 0.78 : 0.88;
          const maxF = [40, 30, 26, 24][n.tier];
          const fs = Math.min(maxF, (panelPx * fit) / measure(n));
          const nm = n.el.querySelector('.nm');
          nm.style.fontSize = `${fs.toFixed(2)}px`;
          const wpx = measure(n) * fs;
          n.el.style.transform = `translate(${(cx - wpx / 2).toFixed(2)}px, ${(cy - fs * 0.5).toFixed(2)}px)`;
          n.el.style.opacity = String(la);
          n.el.style.filter = la < 0.98 ? `blur(${((1 - la) * 4).toFixed(2)}px)` : 'none';
        }
      }
    }

    // edges
    for (const e of edges) {
      const k = ease.inOutCubic(prog(t, e.start, e.end));
      const kk = k * (1 - prog(conv, 0, 0.6));
      e.mesh.visible = kk > 0.001;
      e.mesh.geometry.setDrawRange(0, Math.floor((e.total / 6) * kk) * 6);
      e.mesh.material.opacity = 0.85 * (1 - prog(conv, 0.3, 0.7));
      // follow convergence by scaling the edge toward H
      e.mesh.position.copy(Hpos).multiplyScalar(convE);
      e.mesh.scale.setScalar(1 - convE);
    }
    for (const x of expansions) {
      const k = ease.inOutCubic(prog(t, x.start, x.start + x.dur)) * state.expand;
      x.mesh.visible = k > 0.001 && conv < 0.7;
      x.mesh.geometry.setDrawRange(0, Math.floor((x.total / 6) * k) * 6);
      x.mesh.material.opacity = 0.32 * (1 - prog(conv, 0, 0.5));
      x.mesh.position.copy(Hpos).multiplyScalar(convE);
      x.mesh.scale.setScalar(1 - convE);
    }

    // pulses
    const P = pGeo.attributes.position.array, S = pGeo.attributes.aSize.array, A = pGeo.attributes.aAlpha.array, C = pGeo.attributes.aColor.array;
    let pi = 0;
    const put = (p, size, alpha, col) => {
      P[pi * 3] = p.x; P[pi * 3 + 1] = p.y; P[pi * 3 + 2] = p.z;
      S[pi] = size; A[pi] = alpha; C[pi * 3] = col.r; C[pi * 3 + 1] = col.g; C[pi * 3 + 2] = col.b;
      pi++;
    };
    const cyan = COLORS.cyan, white = new THREE.Color(0.85, 0.92, 1.0);
    for (const e of edges) {
      const grow = prog(t, e.start, e.end);
      // growing head
      if (grow > 0 && grow < 1) put(e.curve.getPoint(ease.inOutCubic(grow)), 0.55, 1.0, white);
      else put(v.set(0, 0, 0), 0, 0, white);
      for (let j = 0; j < PULSES_PER_EDGE - 1; j++) {
        const live = prog(t, e.end, e.end + 0.3) * (1 - prog(conv, 0, 0.4));
        const u = ((t - e.end) * 0.55 + j / (PULSES_PER_EDGE - 1)) % 1;
        const fadeEnds = Math.sin(Math.PI * clamp(u));
        put(e.curve.getPoint(clamp(u)).lerp(Hpos, convE), 0.32, live * fadeEnds, cyan);
      }
    }
    for (const x of expansions) {
      const k = prog(t, x.start, x.start + x.dur) * state.expand;
      for (let j = 0; j < PULSES_PER_EXP; j++) {
        const u = ((t - x.start) * 0.35 + j * 0.5 + x.seed) % 1;
        const vis = (k > u ? 1 : 0) * Math.sin(Math.PI * u) * (1 - prog(conv, 0, 0.4));
        put(x.curve.getPoint(u).lerp(Hpos, convE), 0.45, vis * 0.9, cyan);
      }
    }
    while (pi < nPulse) put(v.set(0, 0, 0), 0, 0, white);
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.aSize.needsUpdate = true;
    pGeo.attributes.aAlpha.needsUpdate = true;
    pGeo.attributes.aColor.needsUpdate = true;

    // dust (slow deterministic drift; pulled into the core when converging)
    const DP = dGeo.attributes.position.array, DA = dGeo.attributes.aAlpha.array;
    const dustIn = prog(t, 6.2, 7.2);
    for (let i = 0; i < DUST; i++) {
      const b = dBase[i * 2], ph = dBase[i * 2 + 1];
      const x = b[0] + Math.sin(t * 0.25 + ph) * 0.6, y = b[1] + Math.cos(t * 0.21 + ph * 1.3) * 0.4, z = b[2] + Math.sin(t * 0.18 + ph * 0.7) * 0.6;
      DP[i * 3] = lerp(x, Hpos.x, convE); DP[i * 3 + 1] = lerp(y, Hpos.y, convE); DP[i * 3 + 2] = lerp(z, Hpos.z, convE);
      DA[i] = dAlpha[i] * dustIn * (1 - prog(conv, 0.5, 1));
    }
    dGeo.attributes.position.needsUpdate = true;
    dGeo.attributes.aAlpha.needsUpdate = true;

    floor.material.uniforms.uOpacity.value = 0.55 * prog(t, 6.4, 7.0) * (1 - prog(t, 10.6, 11.8)) * (1 - conv);
    floor.material.uniforms.uReveal.value = lerp(0, 160, ease.outCubic(prog(t, 6.4, 8.0)));

    core.material.opacity = state.core;
    core.scale.setScalar(lerp(2, 9, state.core));
  }

  return { group, nodes, byId, update, edges, expansions };
}
