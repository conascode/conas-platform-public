// The CONAS mark: a segmented outer "C" (brushed titanium), a segmented inner arc
// (dark chrome) and a polished silver core. The core is the holding company; the
// arcs around it are the businesses it connects. Each segment is its own mesh so the
// mark can assemble from scattered pieces.
import * as THREE from 'three';
import { rng, ease, clamp, lerp } from './util.js';
import { COLORS } from './materials.js';

const DEG = Math.PI / 180;

function arcShape(ro, ri, a0, a1) {
  const s = new THREE.Shape();
  s.absarc(0, 0, ro, a0, a1, false);
  s.lineTo(Math.cos(a1) * ri, Math.sin(a1) * ri);
  s.absarc(0, 0, ri, a1, a0, true);
  s.closePath();
  return s;
}

function diamondShape(r) {
  const s = new THREE.Shape();
  s.moveTo(0, r); s.lineTo(r, 0); s.lineTo(0, -r); s.lineTo(-r, 0); s.closePath();
  return s;
}

/** Adds a travelling hairline of blue light across a material (world-space band). */
export function addSweep(material, uniforms) {
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSwPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 swp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          swp = instanceMatrix * swp;
        #endif
        vSwPos = (modelMatrix * swp).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vSwPos;
        uniform vec3 uSwOrigin; uniform vec3 uSwDir; uniform float uSwPos; uniform float uSwWidth; uniform float uSwAmt; uniform vec3 uSwColor;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float swd = dot(vSwPos - uSwOrigin, uSwDir) - uSwPos;
        totalEmissiveRadiance += uSwColor * uSwAmt * exp(-swd*swd/(uSwWidth*uSwWidth));`);
  };
  material.customProgramCacheKey = () => 'sweep';
}

export function createSymbol(lib) {
  const group = new THREE.Group();
  group.name = 'conas-symbol';

  const sweep = {
    uSwOrigin: { value: new THREE.Vector3() },
    uSwDir: { value: new THREE.Vector3(0.92, 0.39, 0).normalize() },
    uSwPos: { value: -10 },
    uSwWidth: { value: 0.035 },
    uSwAmt: { value: 0 },
    uSwColor: { value: COLORS.blue.clone().multiplyScalar(2.2) },
  };

  const titanium = lib.titanium();
  const chrome = lib.darkChrome();
  const silver = lib.silver();
  [titanium, chrome, silver].forEach((m) => addSweep(m, sweep));
  const materials = { titanium, chrome, silver };

  const pieces = [];
  const R = rng(1977);

  const addPiece = (shape, depth, mat, zOff, bevel) => {
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth, curveSegments: 48, steps: 1,
      bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel * 0.8, bevelSegments: 4,
    });
    geo.translate(0, 0, -depth / 2 + zOff);
    geo.computeBoundingBox();
    const c = new THREE.Vector3();
    geo.boundingBox.getCenter(c);
    geo.translate(-c.x, -c.y, -c.z);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(c);
    group.add(mesh);

    // Scattered start state for the assembly (seeded).
    const dir = c.clone().setZ(0).normalize();
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
    const start = new THREE.Vector3(
      c.x + dir.x * (1.6 + R() * 2.2) + (R() - 0.5) * 1.4,
      c.y + dir.y * (1.6 + R() * 2.2) + (R() - 0.5) * 1.4,
      c.z + (R() - 0.5) * 5 - 1.5,
    );
    const startQ = new THREE.Quaternion().setFromEuler(new THREE.Euler((R() - 0.5) * 2.6, (R() - 0.5) * 2.6, (R() - 0.5) * 1.8));
    pieces.push({ mesh, home: c.clone(), start, startQ, delay: 0, radial: dir });
    return mesh;
  };

  // Outer C: 5 segments, opening to the right.
  const outer = { ro: 1.0, ri: 0.8, a0: 40 * DEG, a1: 320 * DEG, n: 5, gap: 2.4 * DEG };
  const outerSpan = (outer.a1 - outer.a0 - outer.gap * (outer.n - 1)) / outer.n;
  for (let i = 0; i < outer.n; i++) {
    const a = outer.a0 + i * (outerSpan + outer.gap);
    addPiece(arcShape(outer.ro, outer.ri, a, a + outerSpan), 0.16, titanium, 0, 0.018);
  }
  // Inner arc: 3 segments, sits slightly forward.
  const inner = { ro: 0.64, ri: 0.545, a0: 64 * DEG, a1: 296 * DEG, n: 3, gap: 2.8 * DEG };
  const innerSpan = (inner.a1 - inner.a0 - inner.gap * (inner.n - 1)) / inner.n;
  for (let i = 0; i < inner.n; i++) {
    const a = inner.a0 + i * (innerSpan + inner.gap);
    addPiece(arcShape(inner.ro, inner.ri, a, a + innerSpan), 0.2, chrome, 0.05, 0.014);
  }
  // Core: faceted diamond.
  const core = addPiece(diamondShape(0.17), 0.12, silver, 0.1, 0.06);

  // Assembly order: core first, then inner arc, then outer arc segments.
  pieces.forEach((p, i) => {
    const isCore = p.mesh === core;
    const isInner = p.mesh.material === chrome;
    p.delay = isCore ? 0 : isInner ? 0.12 + (i - outer.n) * 0.06 : 0.22 + i * 0.07;
  });

  /**
   * k: 0 = scattered, 1 = assembled. spread scales the scatter distance
   * (1 = full scatter for the opening, smaller for the closing re-form).
   */
  function setAssembly(k, spread = 1) {
    for (const p of pieces) {
      const local = ease.outCubic(clamp((k - p.delay) / (1 - p.delay)));
      const a = local;
      const start = p.home.clone().lerp(p.start, spread);
      p.mesh.position.lerpVectors(start, p.home, a);
      p.mesh.quaternion.copy(new THREE.Quaternion().slerpQuaternions(
        new THREE.Quaternion().slerp(p.startQ, spread), new THREE.Quaternion(), a));
    }
  }

  /** Random points on the front faces of the mark (particle targets). */
  function samplePoints(n, seed = 5) {
    const r = rng(seed);
    const pts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const pick = r();
      let x, y, z;
      if (pick < 0.62) {
        const a = lerp(outer.a0, outer.a1, r());
        const rad = lerp(outer.ri, outer.ro, r());
        x = Math.cos(a) * rad; y = Math.sin(a) * rad; z = (r() - 0.5) * 0.16;
      } else if (pick < 0.9) {
        const a = lerp(inner.a0, inner.a1, r());
        const rad = lerp(inner.ri, inner.ro, r());
        x = Math.cos(a) * rad; y = Math.sin(a) * rad; z = 0.05 + (r() - 0.5) * 0.2;
      } else {
        const u = r() * 2 - 1, v = (r() * 2 - 1) * (1 - Math.abs(u));
        x = u * 0.17; y = v * 0.17; z = 0.1;
      }
      pts[i * 3] = x; pts[i * 3 + 1] = y; pts[i * 3 + 2] = z;
    }
    return pts;
  }

  return { group, pieces, setAssembly, samplePoints, sweep, materials };
}
