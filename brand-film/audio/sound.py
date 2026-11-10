"""CONAS brand film sound design, synthesised from scratch with numpy (no samples, no
third-party audio). Seeded, so every run produces the same file.

    python3 audio/sound.py output/CONAS_audio.wav

Cue sheet (seconds), matched to the picture timeline in src/film.js:
  0.0   low spatial ambience (sub drone + dark air)
  1.0   metallic particles gathering (granular metal grains), riser into the cut
  2.2   small metallic lock as the mark assembles
  3.2   heavy impact: through the core into the headquarters
  3.3   low rising swell while the tower is revealed (peaks ~5.8)
  5.9   mechanical transition: glass turning into data
  6.3   network connection tones on each company node (6.3 .. 8.6)
  10.0  expanding space + digital pulse every 0.6s
  12.55 reverse swell pulling everything into the centre
  13.07 final cinematic impact, reverb tail to 15.0
"""
import sys
import wave
import numpy as np

SR = 48000
DUR = 15.0
N = int(SR * DUR)
t = np.arange(N) / SR
rng = np.random.default_rng(20261110)


# ---------------------------------------------------------------- helpers
def env_adsr(start, attack, decay_tau, length=None):
    """Envelope: linear attack from `start`, then exponential decay."""
    e = np.zeros(N)
    i0 = int(start * SR)
    if i0 >= N:
        return e
    n = N - i0 if length is None else min(N - i0, int(length * SR))
    tt = np.arange(n) / SR
    a = np.clip(tt / max(attack, 1e-4), 0, 1)
    d = np.exp(-np.maximum(tt - attack, 0) / decay_tau)
    e[i0:i0 + n] = a * d
    return e


def ramp(a, b, t0, t1, shape=1.0):
    """0 before t0, 1 after t1, smooth in between (raised to `shape`)."""
    x = np.clip((t - t0) / (t1 - t0), 0, 1)
    x = x * x * (3 - 2 * x)
    return x ** shape * (b - a) + a


def onepole_lp(x, fc):
    """One-pole low-pass; fc may be a scalar or a per-sample array."""
    fc = np.broadcast_to(np.asarray(fc, dtype=float), x.shape)
    a = np.exp(-2 * np.pi * fc / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc = (1 - a[i]) * x[i] + a[i] * acc
        y[i] = acc
    return y


def fft_filter(x, lo=None, hi=None):
    """Zero-phase brick-ish band filter with soft edges, done in the frequency domain."""
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    g = np.ones_like(f)
    if lo:
        g *= 1 / (1 + (lo / np.maximum(f, 1e-3)) ** 4)
    if hi:
        g *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * g, n=len(x))


def pan(mono, p):
    """Equal-power pan, p in [-1, 1] (scalar or array)."""
    p = np.asarray(p)
    a = (p + 1) * np.pi / 4
    return np.stack([mono * np.cos(a), mono * np.sin(a)])


def noise(n=N):
    return rng.standard_normal(n)


def reverb_ir(seconds, decay, seed, bright=6000):
    r = np.random.default_rng(seed)
    n = int(seconds * SR)
    tt = np.arange(n) / SR
    ir = np.stack([r.standard_normal(n), r.standard_normal(n)]) * np.exp(-tt / decay)
    ir[0] = fft_filter(ir[0], lo=120, hi=bright)
    ir[1] = fft_filter(ir[1], lo=120, hi=bright)
    ir[:, : int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))  # pre-delay softening
    return ir / np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))


def convolve(x, ir):
    n = len(x) + len(ir) - 1
    size = 1 << (n - 1).bit_length()
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[:n]
    return y[: len(x)]


def metal_hit(t0, base, amp, decay=0.6, partials=(1.0, 2.76, 5.40, 8.93, 13.34), seed=0):
    """Inharmonic struck-metal tone."""
    r = np.random.default_rng(seed)
    out = np.zeros(N)
    for k, p in enumerate(partials):
        f = base * p * (1 + (r.random() - 0.5) * 0.01)
        e = env_adsr(t0, 0.002, decay / (1 + k * 0.6))
        out += np.sin(2 * np.pi * f * t + r.random() * 6.28) * e / (1 + k * 0.7)
    return out * amp


def boom(t0, amp, f0=72, f1=32, decay=1.6):
    """Sub impact: pitch-dropping sine + low noise thump."""
    tt = np.maximum(t - t0, 0)
    f = f1 + (f0 - f1) * np.exp(-tt / 0.18)
    ph = 2 * np.pi * np.cumsum(f) / SR
    e = env_adsr(t0, 0.004, decay)
    sub = np.sin(ph) * e
    thump = fft_filter(noise(), hi=180) * env_adsr(t0, 0.002, 0.12) * 0.9
    return (sub + thump) * amp


# ---------------------------------------------------------------- layers
L = np.zeros((2, N))   # dry bus
FX = np.zeros((2, N))  # reverb send

# 1. Ambience: sub drone + dark air (whole film, shaped per scene)
drone_amp = (ramp(0, 1, 0.0, 1.6) * (1 - 0.45 * ramp(0, 1, 3.0, 3.4))
             + 0.35 * ramp(0, 1, 3.3, 5.9) * (1 - ramp(0, 1, 6.0, 6.8))
             + 0.15 * ramp(0, 1, 6.5, 8.0)) * (1 - ramp(0, 1, 12.6, 13.0) * 0.8) + 0.25 * ramp(0, 1, 13.1, 13.6) * (1 - ramp(0, 1, 14.3, 15.0))
drone = (np.sin(2 * np.pi * 36.7 * t) * 0.6 + np.sin(2 * np.pi * 55.0 * t + 1.0) * 0.25 + np.sin(2 * np.pi * 73.4 * t) * 0.12)
drone *= 1 + 0.15 * np.sin(2 * np.pi * 0.23 * t)
L += pan(drone * drone_amp * 0.22, 0)
air = fft_filter(noise(), lo=80, hi=900)
air_amp = 0.06 * ramp(0, 1, 0.0, 1.2) * (1 - 0.5 * ramp(0, 1, 6, 7)) * (1 - ramp(0, 1, 14.3, 15.0))
L += np.stack([air, np.roll(air, 2400)]) * air_amp

# 2. Atmospheric synth pad: slow chord changes (D minor -> Bb -> F -> C -> D sus)
def pad_voice(freqs, a, b, gain):
    out = np.zeros(N)
    for f in freqs:
        for det in (-0.12, 0.0, 0.11):
            ff = f * (1 + det / 100)
            for h, w in ((1, 1.0), (2, 0.35), (3, 0.15)):
                out += np.sin(2 * np.pi * ff * h * t + rng.random() * 6.28) * w
    win = ramp(0, 1, a - 0.6, a + 0.6) * (1 - ramp(0, 1, b - 0.6, b + 0.6))
    return out * win * gain

pad = (pad_voice([146.8, 174.6, 220.0], 0.4, 3.3, 1.0)      # Dm
       + pad_voice([116.5, 174.6, 233.1], 3.2, 6.3, 1.0)     # Bb
       + pad_voice([174.6, 220.0, 261.6], 6.2, 10.1, 0.9)    # F
       + pad_voice([130.8, 196.0, 261.6, 329.6], 10.0, 12.8, 0.9)  # C(add)
       + pad_voice([146.8, 220.0, 293.7, 329.6], 13.0, 15.6, 1.0))  # Dsus2
pad = onepole_lp(pad, 700 + 900 * ramp(0, 1, 3.5, 6.0) - 500 * ramp(0, 1, 6.0, 7.0) + 1200 * ramp(0, 1, 10.0, 12.3))
pad_g = 0.012 * (1 - ramp(0, 1, 14.2, 15.0))
pad_st = np.stack([pad, np.roll(pad, 1100)]) * pad_g
L += pad_st
FX += pad_st * 0.8

# 3. Metallic particles gathering (1.0 .. 2.3): granular metal grains, density rising
grains = np.zeros((2, N))
for i in range(260):
    u = rng.random() ** 0.6
    tg = 0.7 + u * 1.6
    f = rng.uniform(2400, 7200)
    d = rng.uniform(0.02, 0.07)
    n0 = int(tg * SR)
    n = int(d * 6 * SR)
    tt = np.arange(n) / SR
    g = (np.sin(2 * np.pi * f * tt) + 0.5 * np.sin(2 * np.pi * f * 1.47 * tt)) * np.exp(-tt / d)
    amp = 0.035 * (0.4 + 0.6 * u) * rng.uniform(0.4, 1.0)
    p = rng.uniform(-0.9, 0.9)
    seg = pan(g * amp, p)
    end = min(N, n0 + n)
    grains[:, n0:end] += seg[:, : end - n0]
L += grains
FX += grains * 1.2

# riser into the first cut
riser_env = ramp(0, 1, 1.6, 3.15, 2.0) * (1 - ramp(0, 1, 3.17, 3.2))
riser = onepole_lp(noise(), 300 + 5000 * ramp(0, 1, 1.6, 3.15, 2.0)) * riser_env * 0.08
rise_tone = np.sin(2 * np.pi * np.cumsum(110 + 330 * ramp(0, 1, 1.8, 3.15, 2.0)) / SR) * riser_env * 0.03
L += pan(riser + rise_tone, 0)
FX += pan(riser, 0) * 0.5

# 4. Metallic lock as the mark assembles
lock = metal_hit(2.2, 520, 0.11, decay=0.5, seed=3)
L += pan(lock, -0.1)
FX += pan(lock, 0) * 0.8

# 5. Heavy impact at the cut into the HQ
L += pan(boom(3.18, 0.75, f0=80, f1=34, decay=1.4), 0)
hit = metal_hit(3.18, 180, 0.12, decay=1.1, seed=7)
L += pan(hit, 0)
FX += pan(hit + boom(3.18, 0.2), 0) * 1.0

# 6. HQ low rising swell (3.3 .. 6.0)
sw_env = ramp(0, 1, 3.4, 5.8, 1.5) * (1 - ramp(0, 1, 5.85, 6.3))
sw_f = 41 + 14 * ramp(0, 1, 3.4, 5.9)
swell = (np.sin(2 * np.pi * np.cumsum(sw_f) / SR) + 0.4 * np.sin(2 * np.pi * np.cumsum(sw_f * 2) / SR)) * sw_env * 0.22
brass = onepole_lp(np.sign(np.sin(2 * np.pi * np.cumsum(sw_f * 2) / SR)) * 0.5, 120 + 380 * sw_env) * sw_env * 0.08
L += pan(swell + brass, 0)
FX += pan(brass, 0) * 0.6

# 7. Mechanical transition (glass -> data), 5.85 .. 6.45
whoosh_env = ramp(0, 1, 5.8, 6.25, 1.6) * (1 - ramp(0, 1, 6.25, 6.6))
whoosh = onepole_lp(noise(), 400 + 6000 * ramp(0, 1, 5.8, 6.3)) * whoosh_env * 0.08
L += pan(whoosh, np.sin(2 * np.pi * 0.8 * t) * 0.6)
for i in range(14):  # digital ticks as the façade cells dissolve
    tk = 6.1 + i * 0.05 + rng.random() * 0.02
    tick = np.sin(2 * np.pi * rng.uniform(2500, 5000) * t) * env_adsr(tk, 0.0005, 0.012)
    L += pan(tick * 0.04, rng.uniform(-0.8, 0.8))
L += pan(metal_hit(6.12, 260, 0.05, decay=0.4, seed=11), 0.2)

# 8. Network connection tones on node appearance (synced to NODES in network.js)
node_times = [(6.30, 587.3, 0.0), (7.00, 880.0, -0.5), (7.15, 784.0, 0.0), (7.30, 987.8, 0.5),
              (7.95, 1174.7, -0.2), (8.15, 1318.5, 0.5), (8.60, 1568.0, 0.6)]
for tn, f, p in node_times:
    e = env_adsr(tn, 0.003, 0.22)
    tone = (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * f * 2 * t) + 0.15 * np.sin(2 * np.pi * f * 3.01 * t)) * e
    click = fft_filter(noise(), lo=3000) * env_adsr(tn, 0.0005, 0.006) * 0.3
    s = pan((tone * 0.08 + click * 0.06), p)
    L += s
    FX += s * 1.4
    # quiet echo (data travelling down the line)
    L += pan(np.roll(tone, int(0.18 * SR)) * 0.015, -p)
# subtle data hum while the structure holds
hum_env = ramp(0, 1, 6.6, 7.6) * (1 - ramp(0, 1, 9.8, 10.2))
hum = np.sin(2 * np.pi * 220 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 5.0 * t)) * hum_env * 0.006
L += pan(hum, 0)

# 9. Expanding space + digital pulse (10.0 .. 12.4), pulse every 0.6s with the node ripples
for k in range(5):
    tp = 10.0 + k * 0.6
    th = boom(tp, 0.22, f0=95, f1=48, decay=0.25)
    blip = np.sin(2 * np.pi * 1760 * t) * env_adsr(tp, 0.001, 0.05) * 0.03
    L += pan(th, 0) + pan(blip, (-1) ** k * 0.4)
    FX += pan(blip, 0) * 1.5
space_env = ramp(0, 1, 9.9, 11.0) * (1 - ramp(0, 1, 12.3, 12.7))
space = fft_filter(noise(), lo=1500, hi=9000) * space_env * 0.02
L += np.stack([space, np.roll(space, 3000)])
FX += np.stack([space, space]) * 0.6

# 10. Reverse swell pulling everything to the centre (12.55 .. 13.06)
rs_env = ramp(0, 1, 12.45, 13.05, 2.6) * (1 - ramp(0, 1, 13.05, 13.075))
rs = onepole_lp(noise(), 200 + 7000 * ramp(0, 1, 12.5, 13.05, 2.0)) * rs_env * 0.16
rs_tone = np.sin(2 * np.pi * np.cumsum(90 + 600 * ramp(0, 1, 12.5, 13.05, 2.2)) / SR) * rs_env * 0.05
L += pan(rs + rs_tone, 0)
FX += pan(rs, 0) * 0.4

# 11. Final cinematic impact (13.067) + shimmer
T_END = 392 / 30
L += pan(boom(T_END, 0.95, f0=90, f1=30, decay=1.9), 0)
fin_hit = metal_hit(T_END, 146.8, 0.16, decay=2.2, seed=21) + metal_hit(T_END, 293.7, 0.07, decay=1.6, seed=22)
L += pan(fin_hit, 0)
FX += pan(fin_hit, 0) * 1.3
shimmer = np.zeros(N)
for f in (1174.7, 1760.0, 2349.3, 2637.0):
    shimmer += np.sin(2 * np.pi * f * t + rng.random() * 6.28)
shimmer *= env_adsr(T_END + 0.05, 0.25, 0.9) * 0.012
FX += np.stack([shimmer, np.roll(shimmer, 900)]) * 1.6
L += np.stack([shimmer, np.roll(shimmer, 900)])

# 12. Mechanical layer for the denser picture
# gear escapement ticks while the chamber lights up and the camera tracks through it (0.3 .. 2.9)
for i in range(30):
    tk = 0.32 + i * 0.087 + (0.012 if i % 2 else 0)
    amp = 0.022 * min(1, i / 6) * (0.6 if i % 2 else 1.0)
    click = fft_filter(noise(), lo=1800, hi=9000) * env_adsr(tk, 0.0004, 0.004)
    ring_ = metal_hit(tk, 1900 + (i % 3) * 230, 1.0, decay=0.05, partials=(1.0, 2.31, 3.97), seed=100 + i)
    L += pan(click * amp * 3 + ring_ * amp * 0.6, 0.35 if i % 2 else -0.35)
# low mechanical hum of the gear train
mech = (np.sin(2 * np.pi * 61.0 * t) * 0.5 + np.sin(2 * np.pi * 122.5 * t) * 0.25) * (0.5 + 0.5 * np.sin(2 * np.pi * 11.5 * t))
L += pan(mech * 0.02 * ramp(0, 1, 0.2, 1.2) * (1 - ramp(0, 1, 2.9, 3.2)), 0)
L += pan(mech * 0.012 * ramp(0, 1, 13.2, 13.8) * (1 - ramp(0, 1, 14.4, 15.0)), 0)
# passing whooshes: colonnade (3.45 .. 3.95) and frame tunnel (10.4 .. 11.6)
def pass_by(tc, width, amp, pan_from):
    e = np.exp(-((t - tc) / width) ** 2)
    w = onepole_lp(noise(), 300 + 3500 * e) * e * amp
    return pan(w, np.clip((t - tc) / (width * 2), -1, 1) * pan_from)
L += pass_by(3.55, 0.09, 0.07, -0.8) + pass_by(3.78, 0.08, 0.06, 0.8)
for i, tc in enumerate([10.55, 10.8, 11.02, 11.22, 11.4, 11.56]):
    L += pass_by(tc, 0.06, 0.035, 0.7 if i % 2 else -0.7)

# ---------------------------------------------------------------- mix
ir = reverb_ir(3.2, 0.85, seed=99)
wet = np.stack([convolve(FX[0], ir[0]), convolve(FX[1], ir[1])])
mix = L + wet * 0.55

# gentle high-pass to remove DC/rumble below 25 Hz, soft saturation, fade tail
mix = np.stack([fft_filter(mix[0], lo=25), fft_filter(mix[1], lo=25)])
mix *= 1 - ramp(0, 1, 14.55, 14.995)
peak = np.max(np.abs(mix))
mix = np.tanh(mix / peak * 1.25) / np.tanh(1.25) * 0.89  # peak about -1 dBFS
mix[:, : int(0.002 * SR)] *= np.linspace(0, 1, int(0.002 * SR))
mix[:, -int(0.01 * SR):] *= np.linspace(1, 0, int(0.01 * SR))

out = sys.argv[1] if len(sys.argv) > 1 else 'CONAS_audio.wav'
pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
rms = np.sqrt(np.mean(mix ** 2))
print(f'wrote {out}: {N / SR:.3f}s, {SR} Hz stereo, peak {20*np.log10(np.max(np.abs(mix))):.1f} dBFS, rms {20*np.log10(rms):.1f} dBFS')
