// Renders the film frame-by-frame in headless Chromium and encodes it with ffmpeg.
//
//   node scripts/render.mjs                 -> output/CONAS_Corporate_Brand_Film_2026.mp4 (1920x1080)
//   node scripts/render.mjs --preview       -> output/preview/CONAS_preview_540p.mp4 (960x540)
//   node scripts/render.mjs --stills=0,90   -> output/stills/frame_0000.png ... (checks single frames)
//
// Options: --workers=N  --frames=A-B  --scale=0.5
// Every frame is a pure function of its frame number, so workers can render chunks in parallel.
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';

// Playwright is pre-installed globally; ESM imports ignore global paths, so use require.
const { chromium } = createRequire(import.meta.url)('playwright');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'output');
const FPS = 30;
const TOTAL = 450;

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));
const preview = !!args.preview;
const scale = Number(args.scale || (preview ? 0.5 : 1));
const workers = Number(args.workers || 3);
const [f0, f1] = (args.frames || `0-${TOTAL - 1}`).split('-').map(Number);
const stills = args.stills ? String(args.stills).split(',').map(Number) : null;

const W = 1920, H = 1080;

function run(cmd, argv, opts = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: ['pipe', 'inherit', 'inherit'], ...opts });
    p.on('error', reject);
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
    if (opts.onSpawn) opts.onSpawn(p);
  });
}

async function openPage(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  page.setDefaultTimeout(0); // heavy frames (5 motion-blur sub-frames at 1080p) can take minutes
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('[page]', m.text()); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.FILM && window.FILM.isReady === true, null, { timeout: 600000 });
  return page;
}

async function renderFrame(page, f) {
  await page.evaluate((n) => window.FILM.renderFrame(n), f);
  return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H }, timeout: 0 });
}

const server = await startServer();
const url = `http://127.0.0.1:${server.address().port}/src/index.html`;
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-gpu-vsync'],
});

try {
  if (stills) {
    const dir = path.join(OUT, 'stills');
    fs.mkdirSync(dir, { recursive: true });
    const page = await openPage(browser, url);
    for (const f of stills) {
      const t0 = Date.now();
      const png = await renderFrame(page, f);
      const file = path.join(dir, `frame_${String(f).padStart(4, '0')}.png`);
      fs.writeFileSync(file, png);
      console.log(`still ${f} (${(f / FPS).toFixed(2)}s) -> ${file}  ${Date.now() - t0}ms`);
    }
  } else {
    const segDir = path.join(OUT, preview ? 'preview/segments' : 'segments');
    fs.rmSync(segDir, { recursive: true, force: true });
    fs.mkdirSync(segDir, { recursive: true });
    const count = f1 - f0 + 1;
    const per = Math.ceil(count / workers);
    const started = Date.now();
    let done = 0;

    // Each worker renders a contiguous chunk into a lossless intermediate segment.
    const jobs = [];
    for (let w = 0; w < workers; w++) {
      const a = f0 + w * per;
      const b = Math.min(f1, a + per - 1);
      if (a > b) break;
      const seg = path.join(segDir, `seg_${String(w).padStart(2, '0')}.mkv`);
      jobs.push((async () => {
        const page = await openPage(browser, url);
        let ff;
        const ffDone = run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
          '-c:v', 'libx264rgb', '-qp', '0', '-preset', 'ultrafast', seg], { onSpawn: (p) => { ff = p; } });
        for (let f = a; f <= b; f++) {
          const png = await renderFrame(page, f);
          if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
          done++;
          if (done % 15 === 0 || done === count) {
            const el = (Date.now() - started) / 1000;
            console.log(`${done}/${count} frames  ${el.toFixed(0)}s elapsed  ~${((el / done) * (count - done)).toFixed(0)}s left`);
          }
        }
        ff.stdin.end();
        await ffDone;
        return seg;
      })());
    }
    const segs = await Promise.all(jobs);

    const list = path.join(segDir, 'list.txt');
    fs.writeFileSync(list, segs.map((s) => `file '${s}'`).join('\n'));
    const audio = path.join(OUT, 'CONAS_audio.wav');
    const outFile = preview
      ? path.join(OUT, 'preview', 'CONAS_preview_540p.mp4')
      : path.join(OUT, 'CONAS_Corporate_Brand_Film_2026.mp4');
    const hasAudio = fs.existsSync(audio);
    const ffArgs = ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list];
    if (hasAudio) ffArgs.push('-i', audio);
    ffArgs.push('-map', '0:v:0');
    if (hasAudio) ffArgs.push('-map', '1:a:0', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000');
    ffArgs.push(
      '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
      '-preset', preview ? 'medium' : 'slow', '-crf', preview ? '20' : '14',
      '-tune', 'film', '-r', String(FPS), '-frames:v', String(count),
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
      '-vf', 'scale=out_color_matrix=bt709',
      '-movflags', '+faststart', '-t', String(count / FPS), outFile);
    await run('ffmpeg', ffArgs);
    if (!preview) fs.rmSync(segDir, { recursive: true, force: true });
    console.log(`done in ${((Date.now() - started) / 1000).toFixed(0)}s -> ${outFile}`);
  }
} finally {
  await browser.close();
  server.close();
}
