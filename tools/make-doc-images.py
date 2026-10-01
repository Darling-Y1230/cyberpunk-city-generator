"""
tools/make-doc-images.py — turns the raw verification screenshots into the
curated, web-sized media the repository ships with.

The raw PNGs are ~1 MB each (11 MB total); the README only needs them legible.
Also produces the 1280x640 GitHub social preview.
"""
from PIL import Image, ImageEnhance
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "dist", "shots")
OUT = os.path.join(ROOT, "docs", "img")
os.makedirs(OUT, exist_ok=True)

# The HUD shots are deliberately kept in the gallery — the console, minimap and
# the Agent-9 validation panel are features, so showing them is informative.
# Only the hero and the social preview need to be chrome-free.
PICKS = [
    # hero: HUD-free street level, wet asphalt and neon canyons
    ("clean-street.png",     "hero",           1920, 86),
    ("clean-plan.png",       "01-plan",        1600, 84),
    ("04-skylines.png",      "02-skyline",     1600, 84),
    ("03-street-rain.png",   "03-street",      1600, 84),
    ("07-nightlife.png",     "04-nightlife",   1600, 82),
    ("02-aerial-fly.png",    "05-aerial",      1600, 84),
    ("06-daylight.png",      "06-daylight",    1600, 82),
    ("08-panorama.png",      "07-storm",       1600, 82),
    ("09-underground.png",   "08-underground", 1600, 82),
    ("06-50k-agents.png",    "09-crowd-50k",   1600, 82),
]

# panels live on the left and right edges of the 1600x900 captures
def crop_hud(im, src=""):
    if src.startswith("clean-"):
        return im                      # already chrome-free
    w, h = im.size
    return im.crop((int(w * 0.03), 0, w, h))


total = 0
for src, name, width, quality in PICKS:
    p = os.path.join(SRC, src)
    if not os.path.exists(p):
        print("  missing:", src)
        continue
    im = Image.open(p).convert("RGB")
    im = crop_hud(im, src)
    if im.width > width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    im = ImageEnhance.Contrast(im).enhance(1.04)
    dst = os.path.join(OUT, name + ".jpg")
    im.save(dst, "JPEG", quality=quality, optimize=True, progressive=True)
    kb = os.path.getsize(dst) // 1024
    total += kb
    print(f"  {src:22s} -> docs/img/{name}.jpg  {im.width}x{im.height}  {kb} KB")

# ---- GitHub social preview: 1280x640, <= 1 MB -------------------------------
hero = Image.open(os.path.join(SRC, "clean-hero-2x1.png")).convert("RGB")
w, h = hero.size
target_ratio = 1280 / 640
crop_h = int(w / target_ratio)
if crop_h <= h:
    top = int((h - crop_h) * 0.5)
    hero = hero.crop((0, top, w, top + crop_h))
else:
    crop_w = int(h * target_ratio)
    left = (w - crop_w) // 2
    hero = hero.crop((left, 0, left + crop_w, h))
hero = hero.resize((1280, 640), Image.LANCZOS)
hero = ImageEnhance.Brightness(hero).enhance(1.10)
hero = ImageEnhance.Contrast(hero).enhance(1.07)
sp = os.path.join(OUT, "social-preview.png")
hero.save(sp, "PNG", optimize=True)
print(f"  social preview -> docs/img/social-preview.png 1280x640 "
      f"{os.path.getsize(sp) // 1024} KB")
print(f"\ntotal README media: {total} KB")
