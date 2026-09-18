#!/usr/bin/env python3
"""Generate sharp package icons + Microsoft Store listing rasters (no blur upscales)."""
from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "build"
APPX = BUILD / "appx"
STORE = ROOT / "store-assets"

TEAL = (43, 176, 166, 255)
TEAL_DIM = (43, 176, 166, 180)
BG = (15, 23, 32, 255)
BG_SOFT = (20, 30, 42, 255)
WHITE = (232, 238, 246, 255)
MUTED = (143, 163, 184, 255)
AMBER = (212, 160, 23, 255)
RED = (212, 83, 75, 255)
NAVY = (11, 18, 26, 255)


def draw_mark(draw: ImageDraw.ImageDraw, cx: float, cy: float, size: float, color=TEAL) -> None:
    s = size
    lw = max(2, int(s * 0.12))
    left = [
        (cx - s * 0.08, cy),
        (cx - s * 0.42, cy - s * 0.32),
        (cx - s * 0.42 + lw * 1.2, cy - s * 0.32),
        (cx - s * 0.08 + lw * 0.4, cy),
        (cx - s * 0.42 + lw * 1.2, cy + s * 0.32),
        (cx - s * 0.42, cy + s * 0.32),
    ]
    draw.polygon(left, fill=color)
    mid = [
        (cx + s * 0.02, cy - s * 0.38),
        (cx + s * 0.02 + lw, cy - s * 0.38),
        (cx - s * 0.06 + lw, cy + s * 0.38),
        (cx - s * 0.06, cy + s * 0.38),
    ]
    draw.polygon(mid, fill=color)
    pts = [
        (cx + s * 0.05, cy + s * 0.05),
        (cx + s * 0.22, cy + s * 0.28),
        (cx + s * 0.48, cy - s * 0.28),
        (cx + s * 0.48 - lw * 0.9, cy - s * 0.28 - lw * 0.2),
        (cx + s * 0.22, cy + s * 0.12),
        (cx + s * 0.12, cy + s * 0.0),
    ]
    draw.polygon(pts, fill=color)


def make_app_icon(size: int, radius_ratio: float = 0.22, pad_ratio: float = 0.18) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(size * radius_ratio)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=r, fill=BG)
    inset = int(size * 0.06)
    d.rounded_rectangle(
        (inset, inset, size - 1 - inset, size - 1 - inset),
        radius=max(4, r - inset),
        fill=BG_SOFT,
    )
    mark = size * (1 - 2 * pad_ratio) * 0.55
    draw_mark(d, size / 2, size / 2, mark)
    return img


def make_wide(w: int, h: int) -> Image.Image:
    img = Image.new("RGBA", (w, h), BG)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, w, max(3, h // 28)), fill=TEAL)
    draw_mark(d, w * 0.28, h / 2, h * 0.48)
    x0 = int(w * 0.48)
    for i, alpha in enumerate([220, 160, 120]):
        y = int(h * 0.28) + i * int(h * 0.18)
        d.rounded_rectangle((x0, y, w - int(w * 0.08), y + int(h * 0.1)), radius=4, fill=(43, 176, 166, alpha))
    return img


def make_splash(w: int, h: int) -> Image.Image:
    img = Image.new("RGBA", (w, h), NAVY)
    d = ImageDraw.Draw(img)
    d.ellipse((-w * 0.2, -h * 0.4, w * 0.6, h * 0.8), fill=(18, 32, 44, 255))
    draw_mark(d, w / 2, h / 2, h * 0.35)
    return img


def make_feature_graphic(w: int = 1920, h: int = 1080) -> Image.Image:
    """16:9 Super hero art — no text (Microsoft Store requirement)."""
    img = Image.new("RGBA", (w, h), NAVY)
    d = ImageDraw.Draw(img)
    for x in range(0, w, 48):
        d.line((x, 0, x, h), fill=(30, 42, 58, 255))
    for y in range(0, h, 48):
        d.line((0, y, w, y), fill=(30, 42, 58, 255))
    panel = (int(w * 0.07), int(h * 0.12), int(w * 0.38), int(h * 0.78))
    d.rounded_rectangle(panel, radius=18, fill=(20, 30, 42, 255), outline=(44, 59, 79, 255), width=2)
    rows = [
        (0.10, 0.18, 0.22, TEAL),
        (0.14, 0.26, 0.20, MUTED),
        (0.14, 0.34, 0.18, MUTED),
        (0.10, 0.44, 0.24, TEAL_DIM),
        (0.14, 0.52, 0.16, MUTED),
        (0.14, 0.60, 0.19, MUTED),
    ]
    for xr, yr, wr, col in rows:
        x1, y1 = int(w * xr), int(h * yr)
        x2, y2 = int(w * (xr + wr)), y1 + int(h * 0.045)
        d.rounded_rectangle((x1, y1, x2, y2), radius=6, fill=col)
        d.rounded_rectangle((x1 - int(w * 0.025), y1 + 2, x1 - 6, y2 - 2), radius=3, outline=TEAL, width=2)
    cards = [
        (0.44, 0.16, 0.48, 0.28, RED),
        (0.44, 0.38, 0.48, 0.22, AMBER),
        (0.44, 0.55, 0.48, 0.18, TEAL),
    ]
    for x, y, ww, hh, accent in cards:
        x1, y1 = int(w * x), int(h * y)
        x2, y2 = int(w * (x + ww)), int(h * (y + hh))
        d.rounded_rectangle((x1, y1, x2, y2), radius=14, fill=(20, 30, 42, 255), outline=(44, 59, 79, 255), width=2)
        d.ellipse((x1 + 18, y1 + 18, x1 + 34, y1 + 34), fill=accent)
        for i in range(3):
            ly = y1 + 28 + i * 22
            d.rounded_rectangle((x1 + 48, ly, x2 - 24, ly + 10), radius=4, fill=(55, 72, 92, 255))
    bx, by, badge_r = int(w * 0.5), int(h * 0.48), 70
    d.ellipse((bx - badge_r, by - badge_r, bx + badge_r, by + badge_r), fill=BG, outline=TEAL, width=3)
    draw_mark(d, bx, by, 55)
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    band = int(h * 0.28)
    for i in range(band):
        a = int(90 * (i / band))
        od.line((0, h - band + i, w, h - band + i), fill=(11, 18, 26, a))
    return Image.alpha_composite(img, overlay).convert("RGB")


def make_poster(w: int = 720, h: int = 1080) -> Image.Image:
    img = Image.new("RGBA", (w, h), NAVY)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, w, 8), fill=TEAL)
    draw_mark(d, w / 2, h * 0.32, w * 0.22)
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 36)
        font_sm = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 20)
    except OSError:
        font = font_sm = ImageFont.load_default()
    title = "Code Review Assistant"
    bbox = d.textbbox((0, 0), title, font=font)
    d.text(((w - (bbox[2] - bbox[0])) / 2, h * 0.52), title, fill=WHITE, font=font)
    sub = "PocketMind"
    bbox = d.textbbox((0, 0), sub, font=font_sm)
    d.text(((w - (bbox[2] - bbox[0])) / 2, h * 0.58), sub, fill=MUTED, font=font_sm)
    d.rectangle((0, int(h * 0.78), w, h), fill=(8, 14, 20, 255))
    return img.convert("RGB")


def main() -> None:
    APPX.mkdir(parents=True, exist_ok=True)
    STORE.mkdir(parents=True, exist_ok=True)

    master = make_app_icon(1024)
    master.save(BUILD / "icon.png")
    master.save(STORE / "logo-1024.png")
    master.resize((512, 512), Image.Resampling.LANCZOS).save(STORE / "logo-512.png")
    master.resize((256, 256), Image.Resampling.LANCZOS).save(STORE / "logo-256.png")
    master.resize((300, 300), Image.Resampling.LANCZOS).save(STORE / "store-tile-icon-300.png")

    # Base AppX assets only (scale/targetsize variants can break electron-builder makepri)
    for name, size in {
        "StoreLogo.png": (50, 50),
        "Square44x44Logo.png": (44, 44),
        "Square150x150Logo.png": (150, 150),
        "SmallTile.png": (71, 71),
        "LargeTile.png": (310, 310),
        "BadgeLogo.png": (24, 24),
    }.items():
        make_app_icon(max(size)).resize(size, Image.Resampling.LANCZOS).save(APPX / name)

    make_wide(310, 150).save(APPX / "Wide310x150Logo.png")
    make_splash(620, 300).save(APPX / "SplashScreen.png")

    make_feature_graphic(1920, 1080).save(STORE / "feature-graphic-1920x1080.png")
    make_feature_graphic(3840, 2160).save(STORE / "feature-graphic-3840x2160.png")
    make_poster(720, 1080).save(STORE / "poster-art-720x1080.png")
    make_poster(1440, 2160).save(STORE / "poster-art-1440x2160.png")
    box = make_app_icon(1080)
    ImageDraw.Draw(box).rectangle((0, 1072, 1080, 1080), fill=TEAL)
    box.convert("RGB").save(STORE / "box-art-1080.png")

    sizes = [256, 128, 64, 48, 32, 24, 16]
    imgs = [make_app_icon(s) for s in sizes]
    imgs[0].save(BUILD / "icon.ico", format="ICO", sizes=[(s, s) for s in sizes], append_images=imgs[1:])
    print("Generated icons in build/ and store-assets/")


if __name__ == "__main__":
    main()
