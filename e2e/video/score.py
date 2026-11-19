"""Original score + sound design for the Alarzah demo, synthesised from scratch (no samples, no licensed music).
Timeline: intro 0–14 s, body from 13.4 s, outro from OUT_AT. Writes score_full.wav (bed under the demo) and score_titles.wav (titles only)."""
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
TOTAL = float(sys.argv[1]) if len(sys.argv) > 1 else 175.333
OUT_AT = float(sys.argv[2]) if len(sys.argv) > 2 else 165.333   # outro start on the master timeline
BODY = (13.4, OUT_AT + 0.8)
rng = np.random.default_rng(11)
N = int(TOTAL * SR) + SR
mix = {k: np.zeros((N, 2)) for k in ('pad', 'fx', 'bed')}


def hz(n):  # note name → Hz, e.g. 'F#3'
    names = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}
    return 440 * 2 ** ((names[n[:-1]] + 12 * (int(n[-1]) + 1) - 69) / 12)


def lp(x, fc, order=2): return sosfilt(butter(order, fc, 'low', fs=SR, output='sos'), x, axis=0)
def hp(x, fc, order=2): return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x, axis=0)
def bp(x, lo, hi): return sosfilt(butter(2, [lo, hi], 'band', fs=SR, output='sos'), x, axis=0)


def put(bus, at, sig, gain=1.0):
    i = int(at * SR)
    if sig.ndim == 1: sig = np.stack([sig, sig], 1)
    j = min(N, i + len(sig)); mix[bus][i:j] += sig[:j - i] * gain


def adsr(n, a, r, sus=1.0):
    e = np.ones(n) * sus; ai = max(1, int(a * SR)); ri = max(1, int(r * SR))
    e[:ai] = np.linspace(0, 1, ai) ** 2 * sus; e[-ri:] *= np.linspace(1, 0, ri) ** 2; return e


def saw(f, n, det=0.0, phase=0.0):
    t = np.arange(n) / SR; out = np.zeros(n); k = 1
    while k * f < 7000 and k < 40:
        out += np.sin(2 * np.pi * k * f * (1 + det) * t + phase * k) / k; k += 1
    return out


def pad(notes, dur, a=1.2, r=1.5, cutoff=1400, bright=0.0):
    n = int(dur * SR); L = np.zeros(n); R = np.zeros(n); t = np.arange(n) / SR
    for nm in notes:
        f = hz(nm)
        for d, side in ((-0.004, 0), (0.0, 2), (0.004, 1)):
            s = saw(f, n, d, rng.uniform(0, 6))
            if side in (0, 2): L += s
            if side in (1, 2): R += s
    sig = np.stack([L, R], 1) / (len(notes) * 3)
    sig = lp(sig, cutoff + bright * 2500)
    lfo = 1 + 0.12 * np.sin(2 * np.pi * 0.18 * t)
    return sig * (adsr(n, a, r) * lfo)[:, None]


def sub_hit(f0=96, f1=42, dur=1.3, click=0.3):
    n = int(dur * SR); t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 9); ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-t * 3.2)
    s[:240] += rng.normal(0, 1, 240) * click * np.linspace(1, 0, 240)
    return np.tanh(s * 1.4)


def tick(f=2400, dur=0.22, g=1.0):
    n = int(dur * SR); t = np.arange(n) / SR
    noise = bp(rng.normal(0, 1, n), 2500, 9000) * np.exp(-t * 90)
    ping = np.sin(2 * np.pi * f * t) * np.exp(-t * 22) * 0.35
    return (noise * 0.5 + ping) * g


def whoosh(dur=0.7, lo=300, hi=6000, rev=False, g=1.0):
    n = int(dur * SR); x = rng.normal(0, 1, (n, 2)); out = np.zeros((n, 2))
    blocks = 40; bl = n // blocks
    for b in range(blocks):  # time-varying band-pass, block-wise
        p = b / (blocks - 1); p = 1 - p if rev else p
        fc = lo * (hi / lo) ** p
        seg = x[b * bl:(b + 1) * bl + 400]
        y = bp(seg, fc * 0.6, min(fc * 1.6, SR / 2 - 100))
        out[b * bl:b * bl + len(y)] += y * np.hanning(len(y))[:, None]
    env = np.sin(np.linspace(0, np.pi, n)) ** 1.5
    if rev: env = np.linspace(0, 1, n) ** 2.5
    return out * env[:, None] * g


def shimmer(notes, dur=3.5, g=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; L = np.zeros(n); R = np.zeros(n)
    for i, nm in enumerate(notes):
        f = hz(nm); vib = 1 + 0.002 * np.sin(2 * np.pi * (4.5 + i) * t)
        s = np.sin(2 * np.pi * f * vib * t) * np.exp(-t * (1.1 + i * .25)) * (1 - np.exp(-t * 60))
        if i % 2: L += s * .7; R += s
        else: L += s; R += s * .7
    return np.stack([L, R], 1) / len(notes) * g


def pluck(nm, dur=1.6, g=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; f = hz(nm)
    s = sum(np.sin(2 * np.pi * f * k * t) * np.exp(-t * (2.5 + k * 2.2)) / k ** 1.3 for k in range(1, 7))
    return s * (1 - np.exp(-t * 400)) * g


def reverb(x, secs=3.2, wet=0.3):
    n = int(secs * SR); t = np.arange(n) / SR
    ir = rng.normal(0, 1, (n, 2)) * np.exp(-t * 3.0 / secs * 2.2)[:, None]
    ir = lp(ir, 6000); ir /= np.sqrt((ir ** 2).sum(0))
    w = np.stack([fftconvolve(x[:, c], ir[:, c])[:len(x)] for c in range(2)], 1)
    return x * (1 - wet) + w * wet * 1.6


# ---------------- INTRO ----------------
put('pad', 0.0, pad(['B1', 'F#2', 'D3', 'C#4'], 4.9, a=1.4, r=0.9, cutoff=700), 0.9)          # dark, under the photos
put('pad', 4.5, pad(['G1', 'D3', 'F#3', 'B3'], 3.6, a=0.4, r=0.8, cutoff=900), 0.85)           # the statistic
put('pad', 7.8, pad(['A1', 'E3', 'B3', 'D4'], 3.0, a=0.3, r=0.6, cutoff=1100, bright=.3), 0.85)  # the product
put('fx', 0.15, shimmer(['F#5', 'C#6'], 2.5, 0.35))                                               # first ring
for at in (1.45, 2.47, 3.52):                                                                     # the three lines
    put('fx', at, sub_hit(80, 40, 1.0, 0.15), 0.55); put('fx', at + 0.02, tick(1760, g=0.5))
put('fx', 4.6, sub_hit(110, 38, 1.6, 0.4), 0.85)                                                  # +1 °C
for k in range(14):                                                                               # counter rattle 0 → 40 %
    at = 5.3 + 0.75 * (1 - (1 - k / 13) ** 2.2); put('fx', at, tick(2900 + k * 60, 0.08, 0.32))
put('fx', 6.05, tick(3520, 0.5, 0.7)); put('fx', 6.05, shimmer(['D6', 'A6'], 1.5, 0.25))
put('fx', 6.65, sub_hit(70, 36, 1.2, 0.1), 0.6)                                                   # "assessed late."
for at in (7.85, 8.75, 9.65):                                                                     # cards fly in
    put('fx', at - 0.25, whoosh(0.75, 400, 7000, g=0.18)); put('fx', at + 0.25, sub_hit(70, 45, 0.6, 0.05), 0.35)
put('fx', 10.2, whoosh(0.6, 300, 5000, rev=True, g=0.2))                                           # exit
r = whoosh(1.15, 200, 9000, rev=False, g=0.32); r *= np.linspace(0.2, 1, len(r))[:, None] ** 2; put('fx', 10.2, r)  # riser
put('fx', 10.55, pad(['D4', 'A4', 'E5'], 0.8, a=0.75, r=0.05, cutoff=3000)[::-1], 0.6)             # reverse swell
put('fx', 11.35, sub_hit(120, 34, 2.4, 0.5), 1.0)                                                 # IMPACT
put('fx', 11.35, lp(rng.normal(0, 1, (int(0.8 * SR), 2)), 1800) * np.exp(-np.arange(int(0.8 * SR)) / SR * 7)[:, None], 0.25)
put('pad', 11.35, pad(['D2', 'A2', 'F#3', 'C#4', 'E4'], 3.6, a=0.02, r=1.6, cutoff=1800, bright=.4), 1.0)
put('fx', 11.4, shimmer(['A5', 'C#6', 'E6', 'F#6', 'A6'], 4.0, 0.5))
for i in range(7): put('fx', 11.75 + i * .045, tick(3000 + i * 180, 0.12, 0.18))                  # wordmark letters
put('fx', 12.25, pluck('F#5', 2.0, 0.22)); put('fx', 12.45, pluck('A5', 2.0, 0.18))

# ---------------- BODY BED ----------------
prog = [['D2', 'A2', 'F#3', 'C#4', 'E4'], ['B1', 'F#2', 'D3', 'A3', 'C#4'], ['G1', 'D2', 'B2', 'F#3', 'A3'], ['A1', 'E2', 'B2', 'D3', 'E4']]
arps = [['A4', 'D5', 'F#5', 'E5'], ['F#4', 'B4', 'D5', 'C#5'], ['D4', 'G4', 'B4', 'A4'], ['E4', 'A4', 'B4', 'D5']]
bar = 6.4; t0, t1 = BODY
k = 0; t = t0 - 0.6
while t < t1:
    put('bed', t, pad(prog[k % 4], bar + 1.4, a=1.6, r=1.6, cutoff=950), 0.55)
    if t > t0 + 2:
        for j, nm in enumerate(arps[k % 4]):
            if (k + j) % 3 != 2: put('bed', t + j * 1.6 + (0.8 if j % 2 else 0), pluck(nm, 1.8, 0.12))
    t += bar; k += 1
fade = np.ones(N); a, b = int(t0 * SR), int((t0 + 2.5) * SR); fade[:a] = 0; fade[a:b] = np.linspace(0, 1, b - a)
c, d = int((t1 - 2.2) * SR), int(t1 * SR); fade[c:d] = np.linspace(1, 0, d - c); fade[d:] = 0
mix['bed'] *= fade[:, None]

# ---------------- OUTRO ----------------
O = OUT_AT
put('pad', O - 0.4, pad(['D2', 'A2', 'E3', 'F#3', 'C#4'], 10.6, a=1.0, r=4.0, cutoff=1300), 0.8)
put('fx', O + 0.5, whoosh(0.5, 300, 6000, rev=True, g=0.15))
put('fx', O + 0.95, sub_hit(100, 36, 2.2, 0.3), 0.8)
put('fx', O + 0.95, shimmer(['D6', 'F#6', 'A6', 'C#7'], 4.5, 0.42))
for i in range(6): put('fx', O + 1.85 + i * .09, tick(2600 + i * 220, 0.1, 0.22))
for i in range(5): put('fx', O + 2.6 + i * .12, tick(2200 + i * 150, 0.1, 0.12))
put('fx', O + 3.4, pluck('D5', 2.4, 0.25)); put('fx', O + 3.7, pluck('A5', 2.4, 0.2)); put('fx', O + 4.0, pluck('E6', 3.0, 0.16))
put('fx', O + 7.2, pluck('F#5', 3.0, 0.14)); put('fx', O + 7.5, pluck('D5', 3.5, 0.14))


def master(include_bed):
    x = mix['pad'] * 0.55 + mix['fx'] * 0.8 + (mix['bed'] * 0.42 if include_bed else 0)
    x = hp(x, 28)
    x = reverb(x, 3.4, 0.32)
    end = int(TOTAL * SR); x = x[:end]
    tail = int(1.2 * SR); x[-tail:] *= np.linspace(1, 0, tail)[:, None]
    x = np.tanh(x * 1.2) / np.tanh(1.2)
    return (x / (np.abs(x).max() + 1e-9) * 0.89).astype(np.float32)


wavfile.write('parts/score_full.wav', SR, master(True))
wavfile.write('parts/score_titles.wav', SR, master(False))
print('ok', TOTAL)
