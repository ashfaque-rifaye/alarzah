"""Cut the raw screen recording into the demo: per-scene speed-ups, one jump cut, H.264 1080p."""
import json, subprocess
marks = json.load(open('marks.json'))
K = 243.12 / 209.9  # the screencast timeline runs this much slower than wall-clock
end_total = 209.9
bounds = {m['scene']: m['at'] for m in marks}
names = [m['scene'] for m in marks]
speed = {'site': 1.3, 'onboard': 1.2, 'checkin': 1.7, 'clip': 1.2, 'care': 1.0, 'review': 1.1, 'book': 1.0, 'pod': 1.35, 'arabic': 1.0, 'vault': 1.2, 'redflag': 1.15, 'bench': 1.15}
segs = []
for i, n in enumerate(names):
    a = bounds[n]; b = bounds[names[i + 1]] if i + 1 < len(names) else end_total
    if n == 'redflag':  # skip the second onboarding: caption, then straight to the red flag
        segs += [(a, a + 1.7, 1.0), (a + 8.6, b, speed[n])]
    else:
        segs.append((a, b, speed[n]))
parts, labels = [], []
for k, (a, b, sp) in enumerate(segs):
    parts.append(f'[0:v]trim=start={a*K:.2f}:end={min(b*K, 243.0):.2f},setpts=(PTS-STARTPTS)/{sp*K:.4f},fps=30[v{k}]'); labels.append(f'[v{k}]')
fc = ';'.join(parts) + ';' + ''.join(labels) + f'concat=n={len(labels)}:v=1:a=0[out]'
est = sum((b - a) / sp for a, b, sp in segs)
print('segments', len(segs), 'estimated', round(est, 1), 's')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', 'raw.webm', '-filter_complex', fc, '-map', '[out]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19',
                '-pix_fmt', 'yuv420p', '-movflags', '+faststart', 'Alarzah_Demo_core.mp4'], check=True)
print('ok')
