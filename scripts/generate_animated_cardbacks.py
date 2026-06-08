from __future__ import annotations

import json
import math
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
FRAME_COUNT = 24
FPS = 12
SIZE = (392, 590)


THEMES = {
    "earth_shadow": {
        "source": ROOT / "public/img/card/cardback_earth_shadow.png",
        "out": ROOT / "public/img/card/animated/earth_shadow",
        "comfy_detail": ROOT / "public/img/card/animated/earth_shadow_comfy_try/earth_cardback_comfy_comp_02.png",
        "prompt": (
            "Use case: stylized-concept. Asset type: looping game card back animation frames. "
            "Primary request: preserve the provided underground Cthulhu card back exactly in composition, "
            "then add subtle seamless motion: faint golden dust drifting in cave darkness, slow mineral glow, "
            "barely moving shadow veins and ancient stone texture breathing. Constraints: 392x590, no text, "
            "no logo, no border changes, preserve readability and silhouette, first and last frames must loop seamlessly."
        ),
        "glow": (210, 155, 72),
        "accent": (120, 84, 38),
        "mode": "earth",
    },
    "stars_call": {
        "source": ROOT / "public/img/card/cardback_stars_call.png",
        "out": ROOT / "public/img/card/animated/stars_call",
        "prompt": (
            "Use case: stylized-concept. Asset type: looping game card back animation frames. "
            "Primary request: preserve the provided ocean-and-stars Cthulhu card back exactly in composition, "
            "then add subtle seamless motion: slow underwater caustics, drifting starlight, dim abyssal blue shimmer, "
            "tiny cosmic motes orbiting in a loop. Constraints: 392x590, no text, no logo, no border changes, "
            "preserve readability and silhouette, first and last frames must loop seamlessly."
        ),
        "glow": (95, 210, 255),
        "accent": (70, 100, 180),
        "mode": "stars",
    },
}


def ensure_rgba(img: Image.Image) -> Image.Image:
    if img.mode != "RGBA":
        return img.convert("RGBA")
    return img


def make_soft_noise(width: int, height: int, seed: int, color: tuple[int, int, int]) -> Image.Image:
    # Small deterministic texture scaled up. No random module needed: the hash formula is stable.
    small_w, small_h = 24, 36
    img = Image.new("RGBA", (small_w, small_h), (0, 0, 0, 0))
    px = img.load()
    for y in range(small_h):
        for x in range(small_w):
            v = (math.sin((x * 12.9898 + y * 78.233 + seed * 37.719)) * 43758.5453) % 1
            a = int(max(0, v - 0.44) * 118)
            px[x, y] = (*color, a)
    img = img.resize((width, height), Image.Resampling.BICUBIC)
    return img.filter(ImageFilter.GaussianBlur(5.0))


def make_vignette(width: int, height: int) -> Image.Image:
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    for i in range(70):
        alpha = int(130 * (i / 70) ** 1.8)
        draw.rounded_rectangle(
            [i, i, width - i - 1, height - i - 1],
            radius=max(1, 18 - i // 5),
            outline=255 - alpha,
            width=2,
        )
    mask = ImageChops.invert(mask).filter(ImageFilter.GaussianBlur(18))
    return Image.new("RGBA", (width, height), (0, 0, 0, 0))


def make_inner_card_mask(width: int, height: int) -> Image.Image:
    mask = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle([30, 46, width - 30, height - 46], radius=18, fill=190)
    draw.rounded_rectangle([48, 72, width - 48, height - 72], radius=14, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(4))


def strata_warp(img: Image.Image, phase: float, strength: int = 3) -> Image.Image:
    width, height = img.size
    out = Image.new("RGBA", img.size, (0, 0, 0, 0))
    # Shift horizontal rock bands instead of the whole card. This reads as strata motion
    # at small card sizes while keeping the border and global composition anchored.
    band_h = 10
    for y in range(0, height, band_h):
        band = img.crop((0, y, width, min(height, y + band_h)))
        dy = y / max(1, height)
        dx = int(round(math.sin(dy * math.tau * 3.2 + phase * math.tau) * strength))
        out.alpha_composite(ImageChops.offset(band, dx, 0), (0, y))
    return out


def make_strata_motion_overlay(base: Image.Image, detail: Image.Image, mask: Image.Image, phase: float) -> Image.Image:
    width, height = base.size
    detail = detail.resize(base.size, Image.Resampling.LANCZOS).convert("RGBA")
    # The model output contributes fixed-position strata texture only. No spatial
    # offsets are used here; otherwise the small in-game card reads as sliding.
    detail_mix = Image.blend(base, detail, 0.62)
    detail_mix = ImageEnhance.Contrast(detail_mix).enhance(1.18)
    detail_mix = ImageEnhance.Color(detail_mix).enhance(1.10)

    # A stationary traveling mask: different rock regions brighten in sequence,
    # but no pixels are spatially shifted. This should read as strata activity
    # without card or texture displacement.
    travel = Image.new("L", (width, height), 0)
    tpx = travel.load()
    mpx = mask.load()
    for y in range(height):
        yy = y / max(1, height)
        for x in range(width):
            mv = mpx[x, y]
            if mv <= 0:
                continue
            xx = x / max(1, width)
            band = 0.5 + 0.5 * math.sin((xx * 1.8 + yy * 4.6 - phase) * math.tau)
            ripple = 0.5 + 0.5 * math.sin((xx * 5.2 - yy * 2.1 + phase * 2.0) * math.tau)
            amount = 0.20 + 0.58 * max(band, ripple * 0.72)
            tpx[x, y] = int(mv * amount)
    pulse_mask = travel.filter(ImageFilter.GaussianBlur(2.0))
    overlay = Image.composite(detail_mix, base, pulse_mask)

    edges = detail.convert("L").filter(ImageFilter.FIND_EDGES).filter(ImageFilter.GaussianBlur(1.4))
    edge_phase = Image.new("L", (width, height), 0)
    epx = edge_phase.load()
    for y in range(height):
        yy = y / max(1, height)
        for x in range(width):
            xx = x / max(1, width)
            epx[x, y] = int(255 * (0.35 + 0.65 * (0.5 + 0.5 * math.sin((xx * 2.8 + yy * 5.8 - phase) * math.tau))))
    edge_alpha = ImageChops.multiply(ImageChops.multiply(edges, mask), edge_phase).point(lambda v: int(v * 0.50 / 255))
    vein = Image.new("RGBA", (width, height), (214, 166, 92, 0))
    vein.putalpha(edge_alpha)

    return Image.alpha_composite(overlay, vein)


def make_orbital_particles(width: int, height: int, phase: float, color: tuple[int, int, int], mode: str) -> Image.Image:
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = width * 0.5, height * 0.5
    count = 12 if mode == "stars" else 9
    for i in range(count):
        angle = phase * math.tau + i * math.tau / count
        radius_x = width * (0.18 + 0.22 * ((i * 37) % 100) / 100)
        radius_y = height * (0.16 + 0.24 * ((i * 53) % 100) / 100)
        wobble = math.sin(angle * 2.0 + i) * 0.08
        x = cx + math.cos(angle + wobble) * radius_x
        y = cy + math.sin(angle + wobble) * radius_y
        size = 5.0 + 7.0 * (((i * 19) % 100) / 100)
        alpha = int(40 + 88 * (0.5 + 0.5 * math.sin(angle + i * 0.7)))
        if mode == "earth":
            y += 35 * math.sin(phase * math.tau + i * 0.3)
            size *= 0.9
            alpha = int(alpha * 0.75)
        draw.ellipse([x - size, y - size, x + size, y + size], fill=(*color, alpha))
    return img.filter(ImageFilter.GaussianBlur(1.2))


def make_wave_light(width: int, height: int, phase: float, color: tuple[int, int, int], mode: str) -> Image.Image:
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if mode == "stars":
        for i in range(-3, 9):
            y = i * 72 + math.sin(phase * math.tau + i) * 26
            xoff = math.sin(phase * math.tau + i * 0.5) * 58
            points = []
            for x in range(-60, width + 65, 28):
                yy = y + math.sin((x * 0.022) + phase * math.tau + i) * 16
                points.append((x + xoff, yy))
            draw.line(points, fill=(*color, 58), width=5)
    else:
        for i in range(5):
            x = width * (0.18 + i * 0.16) + math.sin(phase * math.tau + i) * 12
            alpha = int(36 + 36 * (0.5 + 0.5 * math.sin(phase * math.tau + i)))
            draw.line([(x, 34), (x + math.sin(i) * 48, height - 34)], fill=(*color, alpha), width=8)
    return img.filter(ImageFilter.GaussianBlur(7.0))


def shifted_layer(img: Image.Image, dx: int, dy: int) -> Image.Image:
    return ImageChops.offset(img, dx, dy)


def build_frame(base: Image.Image, index: int, theme: dict, noise_a: Image.Image, noise_b: Image.Image, detail_img: Image.Image | None = None, inner_mask: Image.Image | None = None) -> Image.Image:
    width, height = base.size
    # Include the loop-closing pose in the final frame so frame_23 -> frame_00
    # is mathematically seamless when the sequence is played in a loop.
    phase = index / max(1, FRAME_COUNT - 1)
    glow = theme["glow"]
    accent = theme["accent"]
    mode = theme["mode"]

    # Keep the card back itself pixel-anchored. Only internal light/noise layers move;
    # otherwise the entire texture jitters when the frames are played at card size.
    frame = base.copy()

    pulse = 1.0 + 0.07 * math.sin(phase * math.tau)
    frame = ImageEnhance.Brightness(frame).enhance(pulse)
    frame = ImageEnhance.Color(frame).enhance(1.0 + 0.055 * math.cos(phase * math.tau))

    if mode == "earth" and detail_img is not None and inner_mask is not None:
        frame = make_strata_motion_overlay(frame, detail_img, inner_mask, phase)
        return frame.resize(SIZE, Image.Resampling.LANCZOS)

    noise = Image.blend(
        shifted_layer(noise_a, int(phase * width), int(math.sin(phase * math.tau) * 10)),
        shifted_layer(noise_b, -int(phase * width), int(math.cos(phase * math.tau) * 8)),
        0.42,
    )

    wave = make_wave_light(width, height, phase, glow, mode)
    particles = make_orbital_particles(width, height, phase, glow, mode)

    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    overlay.alpha_composite(noise)
    overlay.alpha_composite(wave)
    overlay.alpha_composite(particles)

    if mode == "stars":
        halo = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        draw = ImageDraw.Draw(halo)
        r = 138 + 22 * math.sin(phase * math.tau)
        draw.ellipse(
            [width / 2 - r, height / 2 - r, width / 2 + r, height / 2 + r],
            outline=(*glow, 72),
            width=8,
        )
        overlay.alpha_composite(halo.filter(ImageFilter.GaussianBlur(14)))
    else:
        draw = ImageDraw.Draw(overlay)
        for i in range(4):
            y = height * (0.24 + i * 0.13) + math.sin(phase * math.tau + i) * 5
            draw.arc([34, y - 34, width - 34, y + 34], 190, 340, fill=(*glow, 52), width=6)

    frame = Image.alpha_composite(frame, overlay)
    # Restore exact crop/size after parallax.
    return frame.resize(SIZE, Image.Resampling.LANCZOS)


def write_manifest(entries: list[dict]) -> None:
    manifest = {
        "frameCount": FRAME_COUNT,
        "fps": FPS,
        "width": SIZE[0],
        "height": SIZE[1],
        "loop": True,
        "source": "Static card back driven by deterministic looping image transforms. ComfyUI was reachable; local text encoder lists were empty, so prompts are recorded for future model pass.",
        "themes": entries,
    }
    out = ROOT / "public/img/card/animated/manifest.json"
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


def write_spritesheet(frames: list[Image.Image], out_dir: Path) -> None:
    if not frames:
        return
    width, height = frames[0].size
    sheet = Image.new("RGBA", (width * len(frames), height), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        sheet.alpha_composite(frame, (index * width, 0))
    sheet.save(out_dir / "spritesheet.png")


def main() -> None:
    entries = []
    for key, theme in THEMES.items():
        src = theme["source"]
        out_dir = theme["out"]
        out_dir.mkdir(parents=True, exist_ok=True)
        base = ensure_rgba(Image.open(src)).resize(SIZE, Image.Resampling.LANCZOS)
        frames = []
        noise_a = make_soft_noise(*SIZE, 11, theme["glow"])
        noise_b = make_soft_noise(*SIZE, 29, theme["accent"])
        detail_img = None
        inner_mask = None
        detail_path = theme.get("comfy_detail")
        if detail_path and detail_path.exists():
            detail_img = ensure_rgba(Image.open(detail_path)).resize(SIZE, Image.Resampling.LANCZOS)
            inner_mask = make_inner_card_mask(*SIZE)
        for i in range(FRAME_COUNT):
            frame = build_frame(base, i, theme, noise_a, noise_b, detail_img=detail_img, inner_mask=inner_mask)
            path = out_dir / f"frame_{i:02d}.png"
            frame.save(path)
            frames.append(frame)
        write_spritesheet(frames, out_dir)
        entries.append({
            "key": key,
            "frameDir": f"/img/card/animated/{key}",
            "sprite": f"/img/card/animated/{key}/spritesheet.png",
            "frames": [f"frame_{i:02d}.png" for i in range(FRAME_COUNT)],
            "sourceImage": str(src.relative_to(ROOT)).replace("\\", "/"),
            "comfyPrompt": theme["prompt"],
        })
    write_manifest(entries)


if __name__ == "__main__":
    main()
