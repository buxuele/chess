import sys, importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('bs', Path(__file__).parent / 'build_slides.py')
bs = importlib.util.module_from_spec(spec)
sys.modules['bs'] = bs
spec.loader.exec_module(bs)

SRC = Path('/Users/fanchuang/code/2026_apps/chess/效果图')
OUT = Path(__file__).parent

files = sorted([p for p in SRC.iterdir() if p.suffix.lower() in ('.png', '.jpeg', '.jpg')])
numbered = sorted([p for p in files if not p.stem.startswith('desktop')], key=lambda p: int(p.stem.split('-')[0]))
desktops = sorted([p for p in files if p.stem.startswith('desktop')])
ordered = numbered + desktops

def ts(sec):
    h = int(sec // 3600); m = int(sec % 3600 // 60); s = int(sec % 60); ms = int((sec - int(sec)) * 1000)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'

lines, rows, t = [], [], 0.0
lines.append((0.0, 4.5, '国际象棋 界面演进记录'))
t = 4.5
for p in ordered:
    cap = bs.caption_for(p.stem)
    lines.append((t, t + 3.0, cap))
    rows.append((p.name, cap, t))
    t += 3.0
import subprocess
real = float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0','开发过程.mp4']).decode().strip())
lines.append((t, real, '在线试玩 buxuele.github.io/chess'))

with open(OUT / '开发过程.srt', 'w', encoding='utf-8') as f:
    for i, (a, b, text) in enumerate(lines, 1):
        f.write(f'{i}\n{ts(a)} --> {ts(b)}\n{text}\n\n')

with open(OUT / '文案对照.txt', 'w', encoding='utf-8') as f:
    f.write('序号\t原文件\t起始秒\t字幕\n')
    for i, (name, cap, start) in enumerate(rows, 1):
        f.write(f'{i}\t{name}\t{start:.1f}\t{cap}\n')

print('SRT 条数', len(lines), '对照条数', len(rows), '总时长', round(t + 5, 1), '秒')
