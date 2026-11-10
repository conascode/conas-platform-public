// Scene 02: the CONAS headquarters tower.
// Realistic, symmetric glass tower: dark curtain wall with floor spandrels and a few lit
// offices, brushed-metal vertical fins, a black-marble podium and a dim surrounding city.
// One shared shader hook adds the light sweep, base uplight and the "glass becomes data"
// dissolve used for the transition into Scene 03.
import * as THREE from 'three';
import { rng } from './util.js';
import { COLORS } from './materials.js';
import { createSymbol } from './symbol.js';
import { lightBeam, columnGeometry, flatRing } from './machinery.js';

export const TOWER = {
  half: 16,          // half width of the shaft footprint
  chamfer: 3.2,
  base: 11.5,        // top of podium
  shaftTop: 232,
  crownTop: 252,
  logoY: 242,
};

export function createBuilding(lib) {
  const group = new THREE.Group();
  group.name = 'hq';

  const U = {
    uDissolve: { value: 0 },
    uDataGlow: { value: 0 },
    uDataCenter: { value: new THREE.Vector3(0, TOWER.logoY, TOWER.half) },
    uDataRadius: { value: 0 },
    uSweepY: { value: -100 },
    uSweepAmt: { value: 0 },
    uUplight: { value: 1 },
    uBlue: { value: COLORS.blue.clone().multiplyScalar(1.6) },
  };

  function arch(material, { windows = false, cellW = 3.2, floorH = 4.0, spandrel = '#11161d', lit = 0.9 } = {}) {
    material.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.defines = sh.defines || {};
      sh.defines.CELLW = cellW.toFixed(3);
      sh.defines.FLOORH = floorH.toFixed(3);
      sh.defines.LITCUT = lit.toFixed(3);
      if (windows) sh.defines.AR_WINDOWS = '';
      sh.uniforms.uSpandrel = { value: new THREE.Color(spandrel) };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vArPos; varying vec3 vArNrm;')
        .replace('#include <project_vertex>', `#include <project_vertex>
          vec4 arp = vec4(transformed, 1.0);
          mat3 arn = mat3(modelMatrix);
          #ifdef USE_INSTANCING
            arp = instanceMatrix * arp;
            arn = arn * mat3(instanceMatrix);
          #endif
          vArPos = (modelMatrix * arp).xyz;
          vArNrm = normalize(arn * objectNormal);`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vArPos; varying vec3 vArNrm;
          uniform float uDissolve, uDataGlow, uDataRadius, uSweepY, uSweepAmt, uUplight;
          uniform vec3 uDataCenter, uBlue, uSpandrel;
          float arHash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453); }
          vec2 arCell(){
            float hc = abs(vArNrm.x) > 0.5 ? vArPos.z : vArPos.x;
            return vec2(hc / CELLW, vArPos.y / FLOORH);
          }
          float arDissolveValue(){
            vec3 c = floor(vArPos / vec3(CELLW, FLOORH, CELLW));
            float dd = length(vArPos - uDataCenter);
            return arHash(c) * 0.32 + clamp(dd / 230.0, 0.0, 1.0) * 0.64;
          }`)
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          float arDV = arDissolveValue();
          if (arDV < uDissolve) discard;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          #ifdef AR_WINDOWS
            float arSp = step(fract(arCell().y), 0.17);
            diffuseColor.rgb = mix(diffuseColor.rgb, uSpandrel, arSp);
          #endif`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          #ifdef AR_WINDOWS
            roughnessFactor = mix(roughnessFactor, 0.38, step(fract(arCell().y), 0.17));
          #endif`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          vec2 arC = arCell();
          vec2 arI = floor(arC); vec2 arF = fract(arC);
          float arGx = min(arF.x, 1.0 - arF.x) * CELLW;
          float arGy = min(arF.y, 1.0 - arF.y) * FLOORH;
          float arLine = 1.0 - smoothstep(0.0, 0.05, min(arGx, arGy));
          #ifdef AR_WINDOWS
            float arFace = abs(vArNrm.x) > 0.5 ? sign(vArNrm.x) * 3.0 : sign(vArNrm.z) * 7.0;
            float arH = arHash(vec3(arI, arFace));
            float arLit = step(LITCUT, arH) * (1.0 - step(arF.y, 0.17)) * (0.25 + 0.75 * arHash(vec3(arI + 7.0, arFace)));
            // soft edges so a lit office is not a flat tile
            arLit *= smoothstep(0.0, 0.18, arF.x) * smoothstep(1.0, 0.82, arF.x) * smoothstep(0.17, 0.4, arF.y);
            float arWarm = arHash(vec3(arI + 3.0, arFace));
            vec3 arLc = mix(vec3(0.62, 0.70, 0.84), vec3(0.92, 0.86, 0.74), step(0.75, arWarm));
            // interior falloff: brighter toward the ceiling of each floor
            arLit *= 0.55 + 0.45 * smoothstep(0.2, 1.0, arF.y);
            totalEmissiveRadiance += arLc * arLit * 0.11 * (1.0 - uDataGlow);
          #endif
          float arDD = length(vArPos - uDataCenter);
          float arFront = 1.0 - smoothstep(uDataRadius - 30.0, uDataRadius, arDD);
          totalEmissiveRadiance += uBlue * arLine * arFront * uDataGlow * 0.85;
          totalEmissiveRadiance += uBlue * 0.012 * arFront * uDataGlow;
          float arEdge = 1.0 - smoothstep(0.0, 0.012, arDV - uDissolve);
          totalEmissiveRadiance += uBlue * arEdge * arLine * step(0.001, uDissolve) * 1.4;
          float arScan = abs(vArPos.y - (uSweepY + 18.0));
          totalEmissiveRadiance += uBlue * (1.0 - smoothstep(0.0, 0.35, arScan)) * uSweepAmt * 1.6;
          float arSw = (vArPos.y - uSweepY);
          totalEmissiveRadiance += vec3(0.70, 0.78, 0.90) * exp(-arSw * arSw / 40.0) * uSweepAmt * (0.12 + arLine * 0.45);
          totalEmissiveRadiance += vec3(0.50, 0.58, 0.72) * exp(-max(vArPos.y, 0.0) / 16.0) * uUplight * 0.22;`);
    };
    material.customProgramCacheKey = () => `arch-${windows}-${cellW}-${floorH}-${lit}`;
    return material;
  }

  // ---------- materials ----------
  const glass = arch(new THREE.MeshPhysicalMaterial({
    color: '#0b1321', metalness: 0.9, roughness: 0.06, envMapIntensity: 1.35, clearcoat: 0.4, clearcoatRoughness: 0.05,
  }), { windows: true, cellW: 3.2, floorH: 4.0, lit: 0.955 });
  const finBase = lib.brushedFrame();
  finBase.roughness = 0.5;
  finBase.envMapIntensity = 0.75;
  const finMat = arch(finBase, { cellW: 3.2, floorH: 4.0 });
  const marble = arch(lib.marble(), { cellW: 4, floorH: 4 });
  const graphite = arch(lib.graphite(), { cellW: 4, floorH: 4 });
  const lobby = arch(new THREE.MeshPhysicalMaterial({
    color: '#0e1622', metalness: 0.6, roughness: 0.08, envMapIntensity: 1.2, emissive: '#9fb2c9', emissiveIntensity: 0.16,
  }), { windows: true, cellW: 2.4, floorH: 9.0, lit: 2.0 });
  const cityGlass = arch(new THREE.MeshPhysicalMaterial({
    color: '#0a1019', metalness: 0.75, roughness: 0.18, envMapIntensity: 0.9,
  }), { windows: true, cellW: 3.0, floorH: 3.8, lit: 0.975 });

  const m = lib.textures.marble;
  m.repeat.set(4, 4);

  // ---------- tower shaft (chamfered square, extruded upward) ----------
  const chamferRect = (h, c) => {
    const s = new THREE.Shape();
    s.moveTo(-h + c, -h); s.lineTo(h - c, -h); s.lineTo(h, -h + c); s.lineTo(h, h - c);
    s.lineTo(h - c, h); s.lineTo(-h + c, h); s.lineTo(-h, h - c); s.lineTo(-h, -h + c); s.closePath();
    return s;
  };
  const prism = (half, chamfer, y0, y1, mat) => {
    const g = new THREE.ExtrudeGeometry(chamferRect(half, chamfer), { depth: y1 - y0, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, y0, 0);
    const mesh = new THREE.Mesh(g, mat);
    group.add(mesh);
    return mesh;
  };
  prism(TOWER.half, TOWER.chamfer, TOWER.base, TOWER.shaftTop, glass);
  // Crown: slight setback, same glass, capped by graphite roof.
  // Crown glass carries the signage, so no lit offices behind the letters.
  const crownGlass = arch(new THREE.MeshPhysicalMaterial({
    color: '#0b1321', metalness: 0.9, roughness: 0.06, envMapIntensity: 1.35, clearcoat: 0.4, clearcoatRoughness: 0.05,
  }), { windows: true, cellW: 3.2, floorH: 4.0, lit: 2.0 });
  prism(TOWER.half - 1.2, TOWER.chamfer, TOWER.shaftTop, TOWER.crownTop, crownGlass);
  prism(TOWER.half - 1.6, TOWER.chamfer, TOWER.crownTop, TOWER.crownTop + 0.8, graphite);
  // Thin metal reveal between shaft and crown.
  prism(TOWER.half + 0.25, TOWER.chamfer, TOWER.shaftTop - 0.4, TOWER.shaftTop + 0.5, finMat);

  // ---------- vertical fins on the four flat faces ----------
  const finGeo = new THREE.BoxGeometry(0.34, 1, 0.9);
  finGeo.translate(0, 0.5, 0);
  const finsPerFace = Math.floor(((TOWER.half - TOWER.chamfer) * 2) / 3.2) + 1;
  const crownFins = Math.floor(((TOWER.half - 1.2 - TOWER.chamfer) * 2) / 3.2) + 1;
  const fins = new THREE.InstancedMesh(finGeo, finMat, (finsPerFace + crownFins) * 4);
  const tmp = new THREE.Object3D();
  let fi = 0;
  const placeFins = (half, n, y0, y1) => {
    const span = (half - TOWER.chamfer) * 2;
    for (let face = 0; face < 4; face++) {
      for (let i = 0; i < n; i++) {
        const u = -span / 2 + (i * span) / (n - 1);
        const off = half + 0.45;
        const a = (face * Math.PI) / 2;
        tmp.position.set(Math.sin(a) * off + Math.cos(a) * u, y0, Math.cos(a) * off - Math.sin(a) * u);
        tmp.rotation.set(0, a, 0);
        tmp.scale.set(1, y1 - y0, 1);
        tmp.updateMatrix();
        fins.setMatrixAt(fi++, tmp.matrix);
      }
    }
  };
  placeFins(TOWER.half, finsPerFace, TOWER.base, TOWER.shaftTop);
  placeFins(TOWER.half - 1.2, crownFins, TOWER.shaftTop + 0.5, TOWER.crownTop);
  fins.count = fi;
  group.add(fins);

  // ---------- podium: glass lobby under a marble canopy, on a marble plinth ----------
  const box = (w, h, d, x, y, z, mat) => {
    const g = new THREE.BoxGeometry(w, h, d);
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(x, y + h / 2, z);
    group.add(mesh);
    return mesh;
  };
  box(74, 0.8, 74, 0, 0, 0, marble);               // plinth
  box(44, 8.2, 44, 0, 0.8, 0, lobby);              // lobby glass
  box(60, 2.5, 60, 0, 9.0, 0, marble);             // canopy slab
  box(60.4, 0.25, 60.4, 0, 8.95, 0, finMat);       // metal reveal under canopy
  // Entrance columns.
  for (let i = -2; i <= 2; i++) box(0.7, 8.2, 0.7, i * 8.5, 0.8, 28.5, finMat);

  // ---------- monumental colonnade ring around the plaza (the crane passes through it) ----------
  const COL_R = 66, COL_N = 28, COL_H = 34;
  const colMat = arch(lib.brushedFrame(), { cellW: 4, floorH: 4 });
  const columns = new THREE.InstancedMesh(columnGeometry(1.5, COL_H, 16), colMat, COL_N);
  const bases = new THREE.InstancedMesh(new THREE.BoxGeometry(4.2, 1.6, 4.2), marble, COL_N);
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(4.0, 1.2, 4.0), colMat, COL_N);
  const colLights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, COL_H - 6, 0.12), new THREE.MeshBasicMaterial({ color: new THREE.Color('#a9bdd8').multiplyScalar(1.3), toneMapped: false }), COL_N);
  for (let i = 0; i < COL_N; i++) {
    const a = ((i + 0.5) / COL_N) * Math.PI * 2;
    const x = Math.sin(a) * COL_R, z = Math.cos(a) * COL_R;
    tmp.rotation.set(0, a, 0); tmp.scale.set(1, 1, 1);
    tmp.position.set(x, 0.8, z); tmp.updateMatrix(); columns.setMatrixAt(i, tmp.matrix);
    tmp.position.set(x, 0.8, z); tmp.updateMatrix(); bases.setMatrixAt(i, tmp.matrix);
    tmp.position.set(x, COL_H + 0.8 + 0.6, z); tmp.updateMatrix(); caps.setMatrixAt(i, tmp.matrix);
    tmp.position.set(Math.sin(a) * (COL_R - 1.55), 0.8 + COL_H / 2, Math.cos(a) * (COL_R - 1.55)); tmp.updateMatrix(); colLights.setMatrixAt(i, tmp.matrix);
  }
  [columns, bases, caps].forEach((m) => { m.castShadow = true; m.receiveShadow = true; });
  group.add(columns, bases, caps, colLights);
  // architrave ring on top of the columns
  const architrave = new THREE.Mesh(flatRing(COL_R + 2.6, COL_R - 2.6, 2.4, { segments: 192, bevel: 0.15 }), colMat);
  architrave.rotation.x = -Math.PI / 2;
  architrave.position.y = COL_H + 0.8 + 1.2 + 1.2;
  architrave.castShadow = true;
  group.add(architrave);
  const archLine = new THREE.Mesh(flatRing(COL_R - 2.4, COL_R - 2.55, 0.1, { segments: 192, bevel: 0 }), new THREE.MeshBasicMaterial({ color: new THREE.Color('#4A8DFF').multiplyScalar(1.6), toneMapped: false }));
  archLine.rotation.x = -Math.PI / 2;
  archLine.position.y = COL_H + 0.7;
  group.add(archLine);

  // ---------- searchlights from the podium corners, grazing the tower ----------
  const beams = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const b = lightBeam(320, 0.6, 14, '#bfd0ea', 0.11);
    b.position.set(Math.sin(a) * 27, 11.5, Math.cos(a) * 27);
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(Math.sin(a) * 0.08, 1, Math.cos(a) * 0.08).normalize());
    group.add(b);
    beams.push(b);
  }

  // ---------- ground ----------
  const groundTex = lib.textures.marble.clone();
  groundTex.needsUpdate = true;
  groundTex.repeat.set(40, 40);
  const groundMat = arch(new THREE.MeshPhysicalMaterial({
    map: groundTex, color: '#7f8a99', metalness: 0.1, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 0.6,
  }), { cellW: 6, floorH: 6 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), groundMat);
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  // ---------- surrounding city (dim, lower than the HQ) ----------
  const R = rng(4242);
  const cityGeo = new THREE.BoxGeometry(1, 1, 1);
  cityGeo.translate(0, 0.5, 0);
  const city = new THREE.InstancedMesh(cityGeo, cityGlass, 420);
  let ci = 0;
  for (let gx = -13; gx <= 13; gx++) {
    for (let gz = -13; gz <= 13; gz++) {
      const x = gx * 44 + (R() - 0.5) * 14, z = gz * 44 + (R() - 0.5) * 14;
      const d = Math.hypot(x, z);
      if (d < 100 || d > 620 || ci >= 420) continue;
      if (R() < 0.18) continue;
      const near = 1 - Math.min(1, (d - 95) / 360);
      const h = 30 + R() * 90 + near * 40 + (d < 280 && R() < 0.45 ? 70 + R() * 90 : 0);
      tmp.position.set(x, 0, z);
      tmp.rotation.set(0, 0, 0);
      tmp.scale.set(16 + R() * 16, h, 16 + R() * 16);
      tmp.updateMatrix();
      city.setMatrixAt(ci++, tmp.matrix);
    }
  }
  city.count = ci;
  group.add(city);

  // ---------- rooftop signage on the crown (front face) ----------
  const logo = new THREE.Group();
  logo.position.set(0, TOWER.logoY, TOWER.half - 1.2 + 0.95);
  const sym = createSymbol(lib);
  sym.setAssembly(1);
  sym.group.scale.setScalar(3.7);
  sym.group.position.set(-9.6, 0, 0.3);
  logo.add(sym.group);

  const c = document.createElement('canvas');
  c.width = 2048; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.font = '300 300px "Inter Display", "Inter", sans-serif';
  g.letterSpacing = '70px';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText('CONAS', 30, 270);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const textMat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, color: new THREE.Color(1.15, 1.18, 1.22),
  });
  const textPlane = new THREE.Mesh(new THREE.PlaneGeometry(19, 4.75), textMat);
  textPlane.position.set(5.6, 0, 0.35);
  logo.add(textPlane);
  // Backing panel so the sign reads against the glass.
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(31, 10.5), new THREE.MeshPhysicalMaterial({
    color: '#05080d', metalness: 0.7, roughness: 0.35, transparent: true, opacity: 0.9,
  }));
  plate.position.z = 0.05;
  plate.visible = false; // signage sits directly on the crown glass
  group.add(logo);

  // ---------- haze layers the crane rises through (soft cloud cards, seeded fbm) ----------
  const cloudTex = (() => {
    const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
    const g = c.getContext('2d'); const img = g.createImageData(S, S); const RC = rng(77);
    const G = 32, grid = new Float32Array(G * G); for (let i = 0; i < grid.length; i++) grid[i] = RC();
    const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const sm = (a) => a * a * (3 - 2 * a);
      const at = (i, j) => grid[((j % G) + G) % G * G + ((i % G) + G) % G];
      const a = at(xi, yi), b = at(xi + 1, yi), cc = at(xi, yi + 1), d = at(xi + 1, yi + 1);
      return a + (b - a) * sm(xf) + (cc - a) * sm(yf) + (a - b - cc + d) * sm(xf) * sm(yf); };
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      let n = 0, amp = 0.5, f = 4 / S; for (let o = 0; o < 5; o++) { n += vn(x * f * 8, y * f * 8) * amp; amp *= 0.5; f *= 2; }
      const dx = x / S - 0.5, dy = y / S - 0.5; const fall = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) * 2);
      const a = Math.max(0, n - 0.35) * 2.2 * fall * fall;
      const i = (y * S + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = Math.min(255, a * 255);
    }
    g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const clouds = new THREE.Group();
  const RCl = rng(1234);
  for (let i = 0; i < 46; i++) {
    const a = RCl() * Math.PI * 2, rad = 30 + RCl() * 240;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: new THREE.Color('#6f7f96'), transparent: true, opacity: 0.16 + RCl() * 0.14, depthWrite: false, fog: true }));
    sp.position.set(Math.sin(a) * rad, 95 + RCl() * 110, Math.cos(a) * rad);
    sp.scale.set(70 + RCl() * 90, 26 + RCl() * 20, 1);
    sp.material.rotation = (RCl() - 0.5) * 0.3;
    clouds.add(sp);
  }
  group.add(clouds);

  // ---------- crown mast with aircraft warning lights ----------
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.9, 34, 12), finMat);
  mast.position.set(0, TOWER.crownTop + 17, 0);
  mast.castShadow = true;
  group.add(mast);
  const mastLights = [];
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#dfe9ff').multiplyScalar(3), toneMapped: false }));
    l.position.set(0, TOWER.crownTop + 8 + i * 12, 0.5);
    group.add(l);
    mastLights.push(l);
  }

  // ---------- night sky dome ----------
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uOpacity: { value: 1 } },
    vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vD; uniform float uOpacity;
      void main(){
        float y = max(vD.y, 0.0);
        vec3 c = mix(vec3(0.045,0.065,0.10), vec3(0.008,0.012,0.022), pow(y, 0.45));
        c += vec3(0.05,0.08,0.13) * exp(-y*16.0);
        gl_FragColor = vec4(c * uOpacity, 1.0);
      }`,
  }));
  group.add(sky);

  return { group, uniforms: U, logo, logoSymbol: sym, textMat, plate, sky, ground, city, beams, plaza: [columns, bases, caps, colLights, architrave, archLine], clouds, mastLights };
}
