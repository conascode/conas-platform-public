# CONAS HOLDINGS — Corporate Brand Film

15-second brand film for CONAS HOLDINGS. 1920×1080, 30 fps (450 frames), H.264 + AAC.

**Final file:** `output/CONAS_Corporate_Brand_Film_2026.mp4`

## Structure

```
brand-film/
  src/            film source (Three.js, runs in a browser page)
    film.js       single timeline: camera, scene states, text, post (FILM.renderFrame(n))
    symbol.js     CONAS mark (segmented titanium C, chrome inner arc, silver core)
    building.js   headquarters tower, podium, city, rooftop signage, glass-to-data dissolve
    network.js    group structure network (panels, edges, data pulses, labels)
    globe.js      abstract globe for scene 04 (no real geography or place names)
    materials.js  environment lighting + material library
    post.js       bloom, tone mapping, grade, motion-blur accumulation
    util.js       timing, easing, seeded random
  audio/sound.py  sound design, synthesised with numpy (no samples)
  scripts/        render pipeline (Playwright + ffmpeg)
  output/         rendered files (final MP4 + audio)
```

## Timeline

| Time | Scene | Content |
|---|---|---|
| 0.0–3.2 | 01 The Emergence | light point, metal particles, the mark assembles, CONAS / HOLDINGS |
| 3.2–6.3 | 02 The Headquarters | crane up the tower, rooftop sign, "A FOUNDATION FOR THE FUTURE." |
| 6.0–10.0 | 03 The Ecosystem | façade dissolves into data space; CONAS HOLDINGS → CONAS INVESTMENT, CELLEXIS → PRECISEON CHAIN, ALLX ACADEMY → 서현학원 → 오름스터디카페 |
| 10.0–12.5 | 04 The Network | pull back, abstract globe, "CONNECTED BY VISION. / DRIVEN BY INNOVATION." |
| 12.5–15.0 | 05 The Signature | convergence, final impact, CONAS / HOLDINGS / BUILDING WHAT COMES NEXT., fade |

## Rendering

Requires Node 18+, Python 3 with numpy, ffmpeg, and Playwright's Chromium.

```bash
npm install
npm run audio                 # output/CONAS_audio.wav
npm run preview               # 960x540 preview -> output/preview/
npm run render                # final 1920x1080 MP4
node scripts/render.mjs --stills=0,90,300   # single frames -> output/stills/
```

Every frame is a pure function of its frame number (no clock, all randomness seeded),
so frames can be rendered in any order or in parallel (`--workers=N`) with identical results.
