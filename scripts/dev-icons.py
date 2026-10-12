"""Render the development-only extension icon from typography and vector shapes."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
font_file = root / 'vendor' / 'NotoSansTC.ttf'
(root / 'icons' / 'dev').mkdir(exist_ok=True)
for size in (16, 32, 48, 128):
    scale = 4
    canvas = Image.new('RGBA', (128 * scale, 128 * scale))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((0, 0, 128 * scale - 1, 128 * scale - 1), radius=25 * scale, fill='#7437C8')
    font = ImageFont.truetype(str(font_file), 84 * scale)
    draw.text((64 * scale, 40 * scale), '印', font=font, anchor='mm', fill='white')
    draw.rounded_rectangle((11 * scale, 89 * scale, 117 * scale, 121 * scale), radius=9 * scale, fill='#FFD34D')
    badge = 'D' if size == 16 else 'DEV'
    font = ImageFont.truetype(str(font_file), (29 if size == 16 else 26) * scale)
    draw.text((64 * scale, 103 * scale), badge, font=font, anchor='mm', fill='#32134F', stroke_width=scale // 2)
    canvas.resize((size, size), Image.Resampling.LANCZOS).save(root / 'icons' / 'dev' / f'icon{size}.png')
