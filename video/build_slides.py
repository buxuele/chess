from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
import subprocess, shutil

SRC = Path('/Users/fanchuang/code/2026_apps/chess/效果图')
OUT = Path('/Users/fanchuang/code/2026_apps/chess/video')
SLIDES = OUT / 'slides'
W, H = 1920, 1080
FONT_PATH = '/System/Library/Fonts/STHeiti Medium.ttc'
TITLE_FONT = ImageFont.truetype(FONT_PATH, 96)
SUB_FONT = ImageFont.truetype(FONT_PATH, 40)
CAPTION_FONT = ImageFont.truetype(FONT_PATH, 46)
BADGE_FONT = ImageFont.truetype(FONT_PATH, 30)

CAPTIONS = {
    '05': '修复棋盘格尺寸不一致',
    '06': '移动端首次全链路审查',
    '07': '评审问题集中整改',
    '08': '换新棋子与紧凑布局',
    '09': '兵到底线的升变选择',
    '10': '新棋子下的完整对局',
    '11': '新棋子在移动端的样子',
    '12': '被将军时棋盘整格淡红',
    '13': '设置项收进一个面板',
    '14': '480 宽窄屏复查',
    '15': '1280 桌面复查',
    '16': '移动端只保留一个入口',
    '17': '棋谱改成分页查看',
    '18': '设置项改为左对齐',
    '19': '界面精简后的桌面版',
    '20': '界面精简后的移动端',
    '21': '棋谱收进抽屉',
    '22': '将军提示降噪',
    '23': '设置面板精简',
    '24': '终局结算卡',
    '25': '上线 GitHub Pages',
    '26': '去掉棋盘外框',
    '27': '设置改为右侧抽屉',
    '28': '结算时不糊棋盘',
    '29': '移动端去边框',
    '30': '主界面整体复查',
    '31': '移动端整体复查',
    '32': '结算条样式复查',
    '33': '移动端设置复查',
    '34': '1280 宽结算复查',
    '35': '易位走法复查',
    '36': '修复翻转后的拖拽吃子',
    '37': '第二轮界面精简',
    '38': '右上角按钮收敛',
    '39': '落子滑动动画',
    '40': '去掉坐标标注',
    '41': '收尾扫荡遗留问题',
    '42': '审查后整改主界面',
    '43': '西瓜红主题结算',
    '44': '选中态保持到落子',
    '45': '移动端整改结果',
    '46': '结算去掉条带',
    '47': '棋子放大占满格子',
    '48': '移动端棋子同样占满',
    '49': '深灰底配大棋盘',
    '50': '深灰底结算',
    '51': '深灰设置面板',
    '52': '去掉顶栏满屏棋盘',
    '53': '无顶栏的结算',
    '54': '浅灰背景满屏',
    '55': '浅灰设置面板',
    '56': '自动升变之后',
    '57': 'React 重写主界面',
    '58': 'React 版结算',
    '59': 'React 版西瓜红设置',
    '60': 'React 版移动端',
    '61': 'React 生产构建',
    '62': '结算卡移到右侧',
    '63': '设置里加历史与链接',
    '64': '1281 宽结算复查',
    '65': '浅灰方案再次确认',
    '66': '浅灰结算',
    '67': '设置里加联系方式',
    '68': '新增背景选择器',
    '69': '结算文案加调侃',
    '70': '深色背景结算',
    '71': '放大结算卡并删文案',
}

def caption_for(stem):
    if stem.startswith('desktop'):
        return {'desktop-主界面': '桌面版主界面', 'desktop-设置面板': '桌面版设置面板', 'desktop-棋谱抽屉': '桌面版棋谱抽屉'}.get(stem, stem)
    num = stem.split('-')[0]
    return CAPTIONS.get(num, stem)

def slide(src_path, text, index, total):
    src = Image.open(src_path).convert('RGB')
    bg = src.resize((W, H), Image.LANCZOS).filter(ImageFilter.GaussianBlur(40))
    bg = Image.blend(bg, Image.new('RGB', (W, H), (10, 12, 11)), 0.55)

    ratio = min(1560 / src.width, 850 / src.height)
    fg = src.resize((int(src.width * ratio), int(src.height * ratio)), Image.LANCZOS)

    canvas = bg.copy()
    canvas.paste(fg, ((W - fg.width) // 2, (H - fg.height) // 2 - 45))

    d = ImageDraw.Draw(canvas)
    d.rectangle([0, H - 150, W, H], fill=(0, 0, 0))
    bbox = d.textbbox((0, 0), text, font=CAPTION_FONT)
    d.text(((W - (bbox[2] - bbox[0])) // 2, H - 105), text, font=CAPTION_FONT, fill=(238, 240, 232))

    badge = f'{index:02d} / {total:02d}'
    d.text((60, 46), badge, font=BADGE_FONT, fill=(154, 219, 55))
    d.rectangle([0, H - 150, 8, H], fill=(154, 219, 55))
    return canvas

def card(lines, big, accent=False):
    canvas = Image.new('RGB', (W, H), (11, 13, 12))
    d = ImageDraw.Draw(canvas)
    d.rectangle([0, 0, 10, H], fill=(252, 3, 119) if accent else (154, 219, 55))
    y = H // 2 - len(lines) * 45
    for i, (text, font, color) in enumerate(lines):
        bbox = d.textbbox((0, 0), text, font=font)
        d.text(((W - (bbox[2] - bbox[0])) // 2, y), text, font=font, fill=color)
        y += bbox[3] - bbox[1] + 42
    return canvas

def main():
    if SLIDES.exists():
        shutil.rmtree(SLIDES)
    SLIDES.mkdir(parents=True)

    files = sorted([p for p in SRC.iterdir() if p.suffix.lower() in ('.png', '.jpeg', '.jpg')])
    numbered, desktops = [], []
    for p in files:
        (desktops if p.stem.startswith('desktop') else numbered).append(p)
    numbered.sort(key=lambda p: int(p.stem.split('-')[0]))
    ordered = numbered + desktops

    entries = []
    cover = card([
        ('国际象棋', TITLE_FONT, (238, 240, 232)),
        ('界面演进记录', SUB_FONT, (154, 219, 55)),
        (f'2026-10-18 至 10-31，共 {len(ordered)} 张截图', BADGE_FONT, (154, 160, 152)),
    ], True)
    cover.save(SLIDES / '000-cover.png')
    entries.append(('000-cover.png', 4.5))

    for i, path in enumerate(ordered, start=1):
        img = slide(path, caption_for(path.stem), i, len(ordered))
        name = f'{i:03d}.png'
        img.save(SLIDES / name)
        entries.append((name, 3.0))
        if i % 10 == 0:
            print(f'已生成 {i}/{len(ordered)}')

    end = card([
        ('在线试玩', SUB_FONT, (154, 219, 55)),
        ('buxuele.github.io/chess', TITLE_FONT, (238, 240, 232)),
        ('源码 github.com/buxuele/chess', BADGE_FONT, (154, 160, 152)),
    ], False, accent=True)
    end.save(SLIDES / '999-end.png')
    entries.append(('999-end.png', 5.0))

    with open(OUT / 'list.txt', 'w') as f:
        for name, dur in entries:
            f.write(f"file '{SLIDES / name}'\n")
            f.write(f'duration {dur}\n')
        f.write(f"file '{SLIDES / entries[-1][0]}'\n")

    print('幻灯片完成', len(entries))

if __name__ == '__main__':
    main()
