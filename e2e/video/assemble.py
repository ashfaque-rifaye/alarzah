"""Intro + demo body + outro with crossfades, score mixed in. Output stays under the 3-minute cap.
Run after: render.mjs (intro/outro) and SCALE=1.1 OUT=parts/core_fit.mp4 python cut.py. Calls score.py with the final timings."""
import subprocess

def dur(f):
    return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).decode())

I, C, O = 'parts/intro.mp4', 'parts/core_fit.mp4', 'parts/outro.mp4'
X1, X2 = 0.6, 0.8
HEAD = 2.0  # the body's first 2 s are the stage still loading
di, dc, do = dur(I), dur(C) - HEAD, dur(O)
off1 = di - X1; off2 = off1 + dc - X2; total = off2 + do
print(f'intro {di}  body {dc}  outro {do}  -> total {total:.2f}s  (outro at {off2:.3f})')
assert total < 179.5, 'over the 3-minute cap'
subprocess.run(['python', 'score.py', f'{total:.3f}', f'{off2:.3f}'], check=True)
norm = 'fps=30,settb=AVTB,format=yuv420p,setsar=1'
vf = (f'[0:v]{norm}[a];[1:v]trim=start={HEAD},setpts=PTS-STARTPTS,{norm}[b];[2:v]{norm}[c];'
      f'[a][b]xfade=transition=fade:duration={X1}:offset={off1:.3f}[ab];'
      f'[ab][c]xfade=transition=fade:duration={X2}:offset={off2:.3f}[v]')
for wav, out in (('parts/score_full.wav', 'Alarzah_Demo.mp4'), ('parts/score_titles.wav', 'Alarzah_Demo_titles_only_sound.mp4')):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', I, '-i', C, '-i', O, '-i', wav, '-filter_complex',
                    vf + f';[3:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,atrim=0:{total:.3f}[au]',
                    '-map', '[v]', '-map', '[au]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-c:a', 'aac', '-b:a', '192k',
                    '-movflags', '+faststart', '-t', f'{total:.3f}', out], check=True)
    print('wrote', out, round(dur(out), 2))
