from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "img" / "effects" / "burrowing_worm"
SCALE = 3


def rgba(color):
    return tuple(color)


def jittered_ellipse_points(cx, cy, rx, ry, count, rand, jitter_x=0.08, jitter_y=0.1):
    points = []
    for i in range(count):
        a = math.tau * i / count
        ripple = 1 + math.sin(a * 5.0 + rand.random() * 0.2) * 0.035
        jx = 1 + rand.uniform(-jitter_x, jitter_x)
        jy = 1 + rand.uniform(-jitter_y, jitter_y)
        points.append((cx + math.cos(a) * rx * ripple * jx, cy + math.sin(a) * ry * ripple * jy))
    return points


def draw_soft_ellipse(layer, bbox, fill, blur=0):
    tmp = Image.new("RGBA", layer.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(tmp)
    draw.ellipse(bbox, fill=fill)
    if blur:
        tmp = tmp.filter(ImageFilter.GaussianBlur(blur))
    layer.alpha_composite(tmp)


def clean_alpha(image):
    image = image.convert("RGBA")
    pixels = image.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = pixels[x, y]
            if a < 10:
                pixels[x, y] = (0, 0, 0, 0)
            elif a < 35:
                pixels[x, y] = (r, g, b, int(a * 0.62))
    return image


def make_hole_variant(seed, warmth):
    rand = random.Random(seed)
    w, h = 512 * SCALE, 320 * SCALE
    cx, cy = 256 * SCALE, 155 * SCALE
    rx, ry = 207 * SCALE, 89 * SCALE
    outer = jittered_ellipse_points(cx, cy, rx, ry, 92, rand, 0.09, 0.13)
    inner = jittered_ellipse_points(cx, cy + 5 * SCALE, rx * 0.71, ry * 0.61, 92, rand, 0.07, 0.1)

    base = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(base)
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.polygon(outer, fill=(17, 10, 5, 88))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18 * SCALE))
    base.alpha_composite(shadow)

    draw.polygon(outer, fill=(119 + warmth, 82 + warmth // 2, 42, 192))
    for inset, alpha, color in [
        (0.82, 130, (75, 49, 25)),
        (0.7, 160, (43, 26, 13)),
        (0.55, 225, (9, 5, 3)),
    ]:
        pts = jittered_ellipse_points(cx, cy + 6 * SCALE, rx * inset, ry * inset * 0.9, 86, rand, 0.035, 0.05)
        draw.polygon(pts, fill=(*color, alpha))

    draw.polygon(inner, fill=(4, 3, 2, 242))
    draw_soft_ellipse(base, (cx - rx * 0.44, cy - ry * 0.28, cx + rx * 0.47, cy + ry * 0.32), (0, 0, 0, 110), 10 * SCALE)

    for _ in range(42):
        a = rand.random() * math.tau
        band = rand.uniform(0.72, 1.06)
        x = cx + math.cos(a) * rx * band
        y = cy + math.sin(a) * ry * band
        size = rand.uniform(4.5, 14) * SCALE
        color = (99 + rand.randrange(42) + warmth, 65 + rand.randrange(30), 35 + rand.randrange(22), 170)
        draw.ellipse((x - size, y - size * 0.45, x + size, y + size * 0.45), fill=color)

    lip = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    lip_draw = ImageDraw.Draw(lip)
    lower_outer = []
    lower_inner = []
    for i in range(49):
        a = math.pi * i / 48
        noise = 1 + math.sin(a * 7 + seed) * 0.05 + rand.uniform(-0.025, 0.025)
        lower_outer.append((cx + math.cos(a) * rx * noise, cy + math.sin(a) * ry * (1.03 + rand.uniform(-0.02, 0.06))))
        inner_a = math.pi - a
        inner_noise = 1 + math.sin(inner_a * 8.5 + seed * 0.17) * 0.075 + rand.uniform(-0.035, 0.035)
        lower_inner.append((
            cx + math.cos(inner_a) * rx * 0.67 * inner_noise,
            cy + 4 * SCALE + math.sin(inner_a) * ry * (0.49 + rand.uniform(-0.04, 0.04)),
        ))
    lip_poly = lower_outer + lower_inner
    lip_draw.polygon(lip_poly, fill=(151 + warmth, 103 + warmth // 2, 55, 226))
    for i in range(34):
        a = math.pi * (i / 33)
        edge = 0.84 + rand.random() * 0.24
        x = cx + math.cos(a) * rx * edge
        y = cy + math.sin(a) * ry * (0.78 + rand.random() * 0.32)
        sx = rand.uniform(5, 18) * SCALE
        sy = rand.uniform(2.5, 8) * SCALE
        color = rand.choice([
            (176 + warmth, 126, 70, 218),
            (101 + warmth, 68, 39, 224),
            (66, 43, 27, 210),
        ])
        lip_draw.ellipse((x - sx, y - sy, x + sx, y + sy), fill=color)
    lip_shadow = Image.new("RGBA", lip.size, (0, 0, 0, 0))
    lip_shadow_draw = ImageDraw.Draw(lip_shadow)
    lip_shadow_draw.line(lower_inner, fill=(9, 5, 2, 150), width=10 * SCALE, joint="curve")
    lip_shadow = lip_shadow.filter(ImageFilter.GaussianBlur(5 * SCALE))
    lip.alpha_composite(lip_shadow)

    return (
        clean_alpha(base.resize((512, 320), Image.Resampling.LANCZOS)),
        clean_alpha(lip.resize((512, 320), Image.Resampling.LANCZOS)),
    )


def make_worm_segment():
    w, h = 220 * SCALE, 132 * SCALE
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = w / 2, h / 2
    draw_soft_ellipse(img, (cx - 96 * SCALE, cy - 45 * SCALE, cx + 96 * SCALE, cy + 45 * SCALE), (5, 3, 2, 95), 5 * SCALE)
    body = Image.new("RGBA", img.size, (0, 0, 0, 0))
    body_draw = ImageDraw.Draw(body)
    body_draw.ellipse((cx - 88 * SCALE, cy - 38 * SCALE, cx + 88 * SCALE, cy + 38 * SCALE), fill=(43, 29, 20, 244))
    body_draw.ellipse((cx - 70 * SCALE, cy - 29 * SCALE, cx + 75 * SCALE, cy + 19 * SCALE), fill=(76, 51, 34, 170))
    for x in range(-74, 82, 17):
        shade = 108 + int(32 * math.sin(x * 0.16))
        body_draw.arc(
            (cx + (x - 22) * SCALE, cy - 39 * SCALE, cx + (x + 22) * SCALE, cy + 39 * SCALE),
            83,
            277,
            fill=(shade, 78, 50, 190),
            width=max(1, 3 * SCALE),
        )
    body_draw.ellipse((cx - 26 * SCALE, cy - 25 * SCALE, cx + 66 * SCALE, cy - 3 * SCALE), fill=(168, 125, 82, 62))
    body = body.filter(ImageFilter.GaussianBlur(0.35 * SCALE))
    img.alpha_composite(body)
    return clean_alpha(img.resize((220, 132), Image.Resampling.LANCZOS))


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for idx, seed in enumerate((2231, 7819), start=1):
        base, lip = make_hole_variant(seed, 8 if idx == 1 else -4)
        base.save(OUT_DIR / f"burrow-hole-base-{idx}.png", "PNG", optimize=True)
        lip.save(OUT_DIR / f"burrow-hole-lip-{idx}.png", "PNG", optimize=True)
    make_worm_segment().save(OUT_DIR / "worm-segment.png", "PNG", optimize=True)
    print(f"wrote assets to {OUT_DIR}")


if __name__ == "__main__":
    main()
