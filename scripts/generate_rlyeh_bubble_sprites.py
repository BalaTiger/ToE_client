from __future__ import annotations

import io
import json
import math
import random
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib import error, parse, request

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageStat


ROOT = Path(__file__).resolve().parents[1]
COMFY = "http://127.0.0.1:8188"
SOURCE_DIR = ROOT / "asset_sources" / "effects" / "rlyeh_bubbles"
OUT_DIR = ROOT / "public" / "img" / "effects" / "rlyeh_bubbles"
SPRITESHEET = OUT_DIR / "rlyeh_bubble_spritesheet.webp"
METADATA = SOURCE_DIR / "rlyeh_bubble_spritesheet.json"

FRAME_SIZE = 128
FRAME_COUNT = 8

NEGATIVE_PROMPT = (
    "soap bubble, rainbow colors, colorful oil film, perfect circle, glass marble, crystal ball, "
    "foam, many bubbles, bubble cluster, water drop, jellyfish, creature, face, eye, text, logo, "
    "caption, watermark, frame, border, white background, green background, gradient background, "
    "bright studio light, cute, cartoon, anime, vector icon"
)


@dataclass(frozen=True)
class BubbleSpec:
    slug: str
    seed: int
    prompt: str
    tint: tuple[int, int, int]
    stretch_x: float
    stretch_y: float


BUBBLE_SPECS = [
    BubbleSpec(
        "thin_oval",
        691120,
        "one single deep underwater air bubble, isolated on absolute pitch black background, asymmetrical tall oval membrane, faint milky interior refraction, ragged incomplete pale rim, abyssal green-blue light, realistic diving footage still",
        (176, 230, 220),
        0.86,
        1.16,
    ),
    BubbleSpec(
        "pinched",
        691137,
        "one single deep-water air bubble being squeezed by pressure, isolated on absolute pitch black background, pinched irregular membrane, uneven white rim highlights, smoky translucent body, no rainbow, no soap-film colors",
        (190, 236, 216),
        0.98,
        1.04,
    ),
    BubbleSpec(
        "wide_folded",
        691154,
        "one single underwater air bubble deformation, isolated on absolute pitch black background, wider flattened organic oval, folded membrane edge, subtle internal caustic refraction, cold green abyss light, realistic",
        (160, 222, 226),
        1.12,
        0.94,
    ),
    BubbleSpec(
        "large_rippled",
        691171,
        "one single large rising underwater air bubble, isolated on absolute pitch black background, rippled uneven silhouette, thick lower rim and thin upper rim, faint transparent core, cold horror underwater mood",
        (184, 238, 224),
        1.04,
        1.1,
    ),
]


def http_json(method: str, path: str, data=None, timeout=20):
    body = None
    headers = {}
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = request.Request(f"{COMFY}{path}", data=body, headers=headers, method=method)
    with request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_bytes(path: str, timeout=30):
    with request.urlopen(f"{COMFY}{path}", timeout=timeout) as resp:
        return resp.read()


def wait_for_output(prompt_id: str, timeout=420) -> bytes:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            history = http_json("GET", f"/history/{prompt_id}", timeout=10)
        except (error.URLError, TimeoutError):
            time.sleep(1)
            continue
        item = history.get(prompt_id)
        if item:
            status = item.get("status", {})
            if status.get("status_str") == "error":
                raise RuntimeError(json.dumps(status, ensure_ascii=False))
            for output in item.get("outputs", {}).values():
                for img in output.get("images", []):
                    qs = parse.urlencode({
                        "filename": img["filename"],
                        "subfolder": img.get("subfolder", ""),
                        "type": img.get("type", "output"),
                    })
                    return http_bytes(f"/view?{qs}", timeout=60)
        time.sleep(1)
    raise TimeoutError(prompt_id)


def make_workflow(spec: BubbleSpec):
    positive = (
        f"{spec.prompt}. "
        "The canvas must contain exactly one bubble with generous empty padding. "
        "Use an absolute pure black matte background, RGB 0 0 0, with no floor, no shadow, no glow outside the bubble. "
        "The bubble is translucent but visible as an uneven membrane and dim body, suitable for alpha extraction and game VFX sprites."
    )
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "z_image_turbo_fp8_e4m3fn.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "VAELoader", "inputs": {"vae_name": "flux_vae.safetensors"}},
        "3": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3}},
        "4": {"class_type": "CLIPLoaderGGUF", "inputs": {"clip_name": "Qwen3-4B-Q4_K_M.gguf", "type": "lumina2"}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["4", 0], "text": positive}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["4", 0], "text": NEGATIVE_PROMPT}},
        "7": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 512, "height": 512, "batch_size": 1}},
        "8": {"class_type": "KSampler", "inputs": {"model": ["3", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["7", 0], "seed": spec.seed, "steps": 10, "cfg": 2.4, "sampler_name": "res_multistep", "scheduler": "simple", "denoise": 1.0}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["2", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": f"rlyeh_bubble/{spec.slug}"}},
    }


def bbox_from_alpha(alpha: Image.Image) -> tuple[int, int, int, int] | None:
    mask = alpha.point(lambda v: 255 if v > 24 else 0)
    width, height = mask.size
    px = mask.load()
    seen = bytearray(width * height)
    center_x = width / 2
    center_y = height / 2
    best = None
    best_score = -1.0

    for start_y in range(height):
        for start_x in range(width):
            index = start_y * width + start_x
            if seen[index] or px[start_x, start_y] == 0:
                continue
            stack = [(start_x, start_y)]
            seen[index] = 1
            count = 0
            left = right = start_x
            top = bottom = start_y
            sum_x = 0
            sum_y = 0
            touches_edge = False
            while stack:
                x, y = stack.pop()
                count += 1
                sum_x += x
                sum_y += y
                left = min(left, x)
                right = max(right, x)
                top = min(top, y)
                bottom = max(bottom, y)
                if x <= 2 or y <= 2 or x >= width - 3 or y >= height - 3:
                    touches_edge = True
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    ni = ny * width + nx
                    if not seen[ni] and px[nx, ny] != 0:
                        seen[ni] = 1
                        stack.append((nx, ny))

            if count < 120 or touches_edge:
                continue
            cx = sum_x / count
            cy = sum_y / count
            dist = math.hypot((cx - center_x) / width, (cy - center_y) / height)
            component_width = max(1, right - left + 1)
            component_height = max(1, bottom - top + 1)
            shape_bonus = min(component_width, component_height) / max(component_width, component_height)
            score = count * (1.35 - min(1.1, dist * 2.4)) * (0.72 + shape_bonus * 0.28)
            if score > best_score:
                best_score = score
                best = (left, top, right + 1, bottom + 1)

    if best:
        return best
    return mask.getbbox()


def make_fallback_source(spec: BubbleSpec) -> Image.Image:
    img = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img, "RGBA")
    cx = FRAME_SIZE / 2
    cy = FRAME_SIZE / 2
    rx = 33 * spec.stretch_x
    ry = 39 * spec.stretch_y
    draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(*spec.tint, 20), outline=(*spec.tint, 72), width=3)
    draw.arc([cx - rx * 0.86, cy - ry * 0.88, cx + rx * 0.88, cy + ry * 0.9], 116, 236, fill=(238, 255, 240, 150), width=5)
    draw.arc([cx - rx * 0.62, cy - ry * 0.62, cx + rx * 0.62, cy + ry * 0.62], 213, 260, fill=(244, 255, 244, 92), width=3)
    return img.filter(ImageFilter.GaussianBlur(0.35))


def extract_bubble_source(raw: Image.Image, spec: BubbleSpec) -> Image.Image:
    rgb = raw.convert("RGB")
    bands = rgb.split()
    luma = ImageChops.lighter(ImageChops.lighter(bands[0], bands[1]), bands[2])
    luma = ImageEnhance.Contrast(luma).enhance(1.18)
    alpha = luma.point(lambda v: 0 if v < 11 else min(255, int((v - 11) * 1.32)))
    bbox = bbox_from_alpha(alpha)
    if not bbox:
        return make_fallback_source(spec)

    left, top, right, bottom = bbox
    pad = max(18, int(max(right - left, bottom - top) * 0.16))
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(raw.width, right + pad)
    bottom = min(raw.height, bottom + pad)

    crop_rgb = rgb.crop((left, top, right, bottom))
    crop_alpha = alpha.crop((left, top, right, bottom)).filter(ImageFilter.GaussianBlur(0.35))
    max_side = max(crop_rgb.size)
    if max_side <= 4:
        return make_fallback_source(spec)

    target_side = 92
    scale = target_side / max_side
    new_size = (max(1, round(crop_rgb.width * scale)), max(1, round(crop_rgb.height * scale)))
    crop_rgb = crop_rgb.resize(new_size, Image.Resampling.LANCZOS)
    crop_alpha = crop_alpha.resize(new_size, Image.Resampling.LANCZOS)

    frame = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    x = (FRAME_SIZE - new_size[0]) // 2
    y = (FRAME_SIZE - new_size[1]) // 2

    tint = Image.new("RGBA", new_size, (*spec.tint, 0))
    source_rgba = Image.merge("RGBA", (*crop_rgb.split(), crop_alpha))
    source_rgba = Image.blend(tint, source_rgba, 0.45)
    source_rgba.putalpha(crop_alpha)
    frame.alpha_composite(source_rgba, (x, y))

    body = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    body_draw = ImageDraw.Draw(body, "RGBA")
    cx = FRAME_SIZE / 2
    cy = FRAME_SIZE / 2
    rx = max(22, new_size[0] * 0.38 * spec.stretch_x)
    ry = max(24, new_size[1] * 0.42 * spec.stretch_y)
    body_draw.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(*spec.tint, 18), outline=(*spec.tint, 42), width=2)
    body = body.filter(ImageFilter.GaussianBlur(1.0))
    return Image.alpha_composite(body, frame)


def vertical_wave_warp(image: Image.Image, phase: float, amplitude: float, stretch_x: float, stretch_y: float) -> Image.Image:
    w, h = image.size
    scaled = image.resize((round(w * stretch_x), round(h * stretch_y)), Image.Resampling.BICUBIC)
    base = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    base.alpha_composite(scaled, ((w - scaled.width) // 2, (h - scaled.height) // 2))

    warped = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    src = base.load()
    dst = warped.load()
    for y in range(h):
        yn = y / max(1, h - 1)
        offset = (
            math.sin(yn * math.tau * 1.55 + phase) * amplitude
            + math.sin(yn * math.tau * 3.1 - phase * 0.7) * amplitude * 0.36
        )
        for x in range(w):
            sx = x + offset
            x0 = int(math.floor(sx))
            frac = sx - x0
            if 0 <= x0 < w - 1:
                a = src[x0, y]
                b = src[x0 + 1, y]
                dst[x, y] = tuple(round(a[i] * (1 - frac) + b[i] * frac) for i in range(4))
    return warped


def make_sequence(source: Image.Image, spec: BubbleSpec, variant_index: int) -> list[Image.Image]:
    frames = []
    rng = random.Random(spec.seed)
    for frame_index in range(FRAME_COUNT):
        t = frame_index / FRAME_COUNT
        phase = t * math.tau + rng.random() * 0.18
        amp = 2.0 + variant_index * 0.45 + math.sin(phase * 1.4) * 0.55
        sx = spec.stretch_x * (1 + math.sin(phase + 0.4) * 0.075)
        sy = spec.stretch_y * (1 + math.sin(phase * 1.12 - 0.8) * 0.062)
        frame = vertical_wave_warp(source, phase, amp, sx, sy)
        frame = frame.rotate(math.sin(phase * 0.8) * (3.0 + variant_index * 0.4), resample=Image.Resampling.BICUBIC)

        glow = frame.split()[-1].filter(ImageFilter.GaussianBlur(1.7)).point(lambda v: int(v * 0.34))
        glow_img = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (*spec.tint, 0))
        glow_img.putalpha(glow)
        frame = Image.alpha_composite(glow_img, frame)

        stat = ImageStat.Stat(frame.split()[-1])
        if stat.mean[0] < 3.0:
            frame = make_fallback_source(spec)
        frames.append(frame)
    return frames


def generate_sources(overwrite: bool) -> list[Image.Image]:
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    try:
        http_json("GET", "/system_stats", timeout=5)
    except Exception as exc:
        raise SystemExit(f"ComfyUI is not reachable at {COMFY}: {exc}") from exc

    client_id = str(uuid.uuid4())
    sources = []
    for spec in BUBBLE_SPECS:
        raw_path = SOURCE_DIR / f"{spec.slug}_comfy_raw.png"
        source_path = SOURCE_DIR / f"{spec.slug}_source.png"
        if overwrite or not raw_path.exists():
            prompt_id = http_json("POST", "/prompt", {"prompt": make_workflow(spec), "client_id": client_id}, timeout=20)["prompt_id"]
            raw = Image.open(io.BytesIO(wait_for_output(prompt_id))).convert("RGB")
            raw.save(raw_path)
        else:
            raw = Image.open(raw_path).convert("RGB")
        source = extract_bubble_source(raw, spec)
        source.save(source_path)
        sources.append(source)
        print(f"source: {spec.slug} -> {source_path.relative_to(ROOT)}")
    return sources


def pack_spritesheet(sources: list[Image.Image]) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGBA", (FRAME_SIZE * FRAME_COUNT, FRAME_SIZE * len(BUBBLE_SPECS)), (0, 0, 0, 0))
    for row, (spec, source) in enumerate(zip(BUBBLE_SPECS, sources)):
        for col, frame in enumerate(make_sequence(source, spec, row)):
            sheet.alpha_composite(frame, (col * FRAME_SIZE, row * FRAME_SIZE))
    sheet.save(SPRITESHEET, "WEBP", lossless=True, quality=92, method=6)
    METADATA.write_text(json.dumps({
        "frameWidth": FRAME_SIZE,
        "frameHeight": FRAME_SIZE,
        "frameCount": FRAME_COUNT,
        "variants": [spec.slug for spec in BUBBLE_SPECS],
        "source": "ComfyUI generated source bubbles with local coherent deformation frames",
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"spritesheet: {SPRITESHEET.relative_to(ROOT)} ({sheet.width}x{sheet.height})")


def main() -> None:
    overwrite = "--overwrite" in set(__import__("sys").argv[1:])
    sources = generate_sources(overwrite)
    pack_spritesheet(sources)


if __name__ == "__main__":
    main()
