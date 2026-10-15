"""Makes the app icons in public/icons from public/logo-large.png (run by hand, needs Pillow; the PNGs are committed).

The logo has a wordmark under the mark, which is unreadable at icon size, so the icons carry the mark only
(the stethoscope "D" and the book) on white. Maskable icons keep the mark inside the central safe zone, because
Android crops them to a circle or a rounded square.

    python3 scripts/make-pwa-icons.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'public' / 'logo-large.png'
OUT = ROOT / 'public' / 'icons'
OUT.mkdir(parents=True, exist_ok=True)

logo = Image.open(SOURCE).convert('RGB')

# The mark is everything above the wordmark that is not paper white.
WORDMARK_TOP = 665
dark = logo.crop((0, 0, logo.width, WORDMARK_TOP)).convert('L').point(lambda v: 255 if v < 200 else 0)
left, top, right, bottom = dark.getbbox()
# The source's "white" is 253; brighten so the mark does not sit in a faint box on the pure white of the icon.
mark = logo.crop((left, top, right, bottom)).point(lambda v: min(255, round(v * 255 / 245)))


def icon(size: int, height_share: float) -> Image.Image:
    canvas = Image.new('RGB', (size, size), (255, 255, 255))
    height = round(size * height_share)
    width = round(mark.width * height / mark.height)
    scaled = mark.resize((width, height), Image.LANCZOS)
    canvas.paste(scaled, ((size - width) // 2, (size - height) // 2))
    return canvas


icon(192, 0.74).save(OUT / 'icon-192.png', optimize=True)
icon(512, 0.74).save(OUT / 'icon-512.png', optimize=True)
icon(512, 0.54).save(OUT / 'icon-maskable-512.png', optimize=True)
icon(180, 0.72).save(OUT / 'apple-touch-icon.png', optimize=True)
print('mark', (left, top, right, bottom), 'icons written to', OUT)
