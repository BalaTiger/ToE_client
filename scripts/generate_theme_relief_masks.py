from __future__ import annotations

import io
import json
import time
import uuid
from pathlib import Path
from urllib import error, parse, request

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
COMFY = "http://127.0.0.1:8188"
OUT_DIR = ROOT / "public/img/ui/theme_relief"

SPECS = [
    {
        "key": "panel_corner_earth",
        "size": (512, 512),
        "seed": 618301,
        "alpha_factor": 1.65,
        "prompt": (
            "monochrome black background, intricate single-color line art only, UI corner ornament, "
            "engraved bas-relief cave strata, underground fissures, stone-carved glyphs, contour lines, "
            "dense but elegant linework, upper-right triangular corner composition, all linework grows from the top and right edges, "
            "lower-left half must stay nearly empty black, no centered composition, no text, no letters, no filled shapes, "
            "no frame, no border, transparent-ready mask design"
        ),
    },
    {
        "key": "panel_corner_stars",
        "size": (512, 512),
        "seed": 618302,
        "alpha_factor": 2.8,
        "prompt": (
            "monochrome black background, intricate single-color line art only, UI corner ornament, "
            "engraved bas-relief star map, ocean wave arcs, bubbles, constellations, celestial compass curves, "
            "dense but elegant linework, upper-right triangular corner composition, all linework grows from the top and right edges, "
            "lower-left half must stay nearly empty black, no centered composition, no text, no letters, no filled shapes, "
            "no frame, no border, transparent-ready mask design"
        ),
    },
    {
        "key": "log_relief_earth",
        "size": (768, 1024),
        "seed": 618303,
        "alpha_factor": 0.62,
        "prompt": (
            "monochrome black background, intricate single-color line art only, vertical panel background ornament, "
            "engraved underground relief pattern, cave strata, cracked stone, ancient glyph nodes, contour lines, "
            "low contrast decorative linework, no text, no letters, no border, no frame, tile-friendly"
        ),
    },
    {
        "key": "log_relief_stars",
        "size": (768, 1024),
        "seed": 618304,
        "alpha_factor": 0.58,
        "prompt": (
            "monochrome black background, intricate single-color line art only, vertical panel background ornament, "
            "engraved ocean-and-stars relief pattern, star map arcs, rippling water lines, bubbles, constellation nodes, "
            "low contrast decorative linework, no text, no letters, no border, no frame, tile-friendly"
        ),
    },
    {
        "key": "hand_edge_stars",
        "size": (320, 768),
        "seed": 618305,
        "alpha_factor": 2.25,
        "prompt": (
            "monochrome black background, intricate single-color line art only, UI hand panel ornament, "
            "engraved ocean-and-stars bas-relief, star compass arcs, tide curves, bubbles, constellation nodes, "
            "bottom-right corner composition, all linework grows from the bottom and right edges, "
            "upper-left half must stay nearly empty black, no centered composition, no text, no letters, "
            "no filled shapes, no frame, no border, transparent-ready mask design"
        ),
    },
]

HAND_EDGE_SOURCES = [
    ("hand_edge_earth", "log_relief_earth"),
]


def http_json(method, path, data=None, timeout=20):
    body = None
    headers = {}
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = request.Request(f"{COMFY}{path}", data=body, headers=headers, method=method)
    with request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def http_bytes(path, timeout=30):
    with request.urlopen(f"{COMFY}{path}", timeout=timeout) as resp:
        return resp.read()


def wait_for_output(prompt_id, timeout=420):
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
                    return http_bytes(f"/view?{qs}", timeout=30)
        time.sleep(1)
    raise TimeoutError(prompt_id)


def make_workflow(spec):
    width, height = spec["size"]
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "z_image_turbo_fp8_e4m3fn.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "VAELoader", "inputs": {"vae_name": "flux_vae.safetensors"}},
        "3": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3}},
        "4": {"class_type": "CLIPLoaderGGUF", "inputs": {"clip_name": "Qwen3-4B-Q4_K_M.gguf", "type": "lumina2"}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["4", 0], "text": spec["prompt"]}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["4", 0], "text": "colorful, painted, realistic, text, letters, logo, filled icon, thick block shapes, noisy photograph, border frame"}},
        "7": {"class_type": "EmptySD3LatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "8": {"class_type": "KSampler", "inputs": {"model": ["3", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["7", 0], "seed": spec["seed"], "steps": 8, "cfg": 1.0, "sampler_name": "res_multistep", "scheduler": "simple", "denoise": 1.0}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["2", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": f"theme_relief_{spec['key']}"}},
    }


def make_corner_fade(size):
    width, height = size
    mask = Image.new("L", size, 0)
    px = mask.load()
    for y in range(height):
        for x in range(width):
            nx = x / max(1, width - 1)
            ny = y / max(1, height - 1)
            # Strong in the upper-right; naturally fades into the panel.
            v = max(0.0, (nx * 0.86 + (1 - ny) * 0.86) - 0.34)
            px[x, y] = int(min(1.0, v) ** 1.35 * 255)
    return mask.filter(ImageFilter.GaussianBlur(18))


def concentrate_corner_mask(alpha: Image.Image) -> Image.Image:
    width, height = alpha.size
    bbox = alpha.getbbox()
    if not bbox:
        return alpha
    source = alpha.crop(bbox)
    target_w = int(width * 0.78)
    target_h = int(height * 0.78)
    source.thumbnail((target_w, target_h), Image.Resampling.LANCZOS)
    arranged = Image.new("L", alpha.size, 0)
    arranged.paste(source, (width - source.width, 0))

    fade = Image.new("L", alpha.size, 0)
    fpx = fade.load()
    for y in range(height):
        ny = y / max(1, height - 1)
        for x in range(width):
            nx = x / max(1, width - 1)
            from_top = max(0.0, 1.0 - ny)
            from_right = max(0.0, nx)
            diagonal = max(0.0, (from_right * 1.35 + from_top * 1.35) - 0.92)
            edge_anchor = max(from_right ** 2.15, from_top ** 2.15)
            fpx[x, y] = int(min(1.0, diagonal * 0.78 + edge_anchor * 0.42) ** 1.65 * 255)
    return ImageChops.multiply(arranged, fade.filter(ImageFilter.GaussianBlur(20)))


def remove_corner_frame_artifacts(alpha: Image.Image) -> Image.Image:
    width, height = alpha.size
    original = alpha.copy()
    opx = original.load()
    px = alpha.load()
    for y in range(height):
        xs = [x for x in range(width) if px[x, y] > 1]
        active = len(xs)
        if not active:
            continue
        span = max(xs) - min(xs) + 1
        if y > height * 0.50 and (active > width * 0.44 or span > width * 0.46):
            for x in range(width):
                vertical_support = 0
                for yy in range(max(0, y - 6), min(height, y + 7)):
                    if yy != y and opx[x, yy] > 1:
                        vertical_support += 1
                if vertical_support < 3:
                    px[x, y] = 0
    for x in range(width):
        ys = [y for y in range(height) if px[x, y] > 1]
        active = len(ys)
        if not active:
            continue
        span = max(ys) - min(ys) + 1
        if x < width * 0.55 and (active > height * 0.44 or span > height * 0.46):
            for y in range(height):
                horizontal_support = 0
                for xx in range(max(0, x - 6), min(width, x + 7)):
                    if xx != x and opx[xx, y] > 1:
                        horizontal_support += 1
                if horizontal_support < 3:
                    px[x, y] = 0
    return alpha


def make_hand_corner_fade(size):
    width, height = size
    mask = Image.new("L", size, 0)
    px = mask.load()
    for y in range(height):
        ny = y / max(1, height - 1)
        for x in range(width):
            nx = x / max(1, width - 1)
            from_bottom = max(0.0, ny)
            from_right = max(0.0, nx)
            diagonal = max(0.0, (from_right * 1.24 + from_bottom * 1.78) - 1.18)
            corner_anchor = (from_right ** 1.25) * (from_bottom ** 2.55)
            px[x, y] = int(min(1.0, diagonal * 0.42 + corner_anchor * 0.86) ** 1.28 * 255)
    return mask.filter(ImageFilter.GaussianBlur(18))


def concentrate_hand_corner_mask(alpha: Image.Image) -> Image.Image:
    width, height = alpha.size
    bbox = alpha.getbbox()
    if not bbox:
        return alpha
    source = alpha.crop(bbox)
    target_w = int(width * 0.94)
    target_h = int(height * 0.70)
    source.thumbnail((target_w, target_h), Image.Resampling.LANCZOS)
    arranged = Image.new("L", alpha.size, 0)
    arranged.paste(source, (width - source.width, height - source.height))
    return ImageChops.multiply(arranged, make_hand_corner_fade(alpha.size))


def fill_right_alpha_edge(alpha: Image.Image, columns=8) -> Image.Image:
    width, height = alpha.size
    bbox = alpha.getbbox()
    if not bbox:
        return alpha
    _, _, right, _ = bbox
    if right >= width:
        return alpha
    shift = min(columns, width - right)
    canvas = Image.new("L", alpha.size, 0)
    canvas.paste(alpha.crop((0, 0, width - shift, height)), (shift, 0))
    return canvas


def postprocess(raw: Image.Image, spec):
    raw = raw.convert("RGB").resize(spec["size"], Image.Resampling.LANCZOS)
    gray = ImageOps.grayscale(raw)
    gray = ImageOps.autocontrast(gray, cutoff=2)
    edges = gray.filter(ImageFilter.FIND_EDGES)
    if spec["key"].startswith("panel_corner") or spec["key"].startswith("hand_edge"):
        lines = ImageEnhance.Contrast(edges).enhance(2.8)
        alpha = lines.point(lambda v: 0 if v < 18 else min(210, int((v - 18) * 4.2)))
    else:
        lines = ImageChops.lighter(gray, edges)
        lines = ImageEnhance.Contrast(lines).enhance(1.9)
        alpha = lines.point(lambda v: 0 if v < 104 else min(210, int((v - 104) * 1.95)))
    alpha = alpha.filter(ImageFilter.GaussianBlur(0.35))

    if spec["key"].startswith("panel_corner"):
        alpha = concentrate_corner_mask(alpha)
        alpha = remove_corner_frame_artifacts(alpha)
        alpha = ImageChops.multiply(alpha, make_corner_fade(spec["size"]))
    elif spec["key"].startswith("hand_edge"):
        alpha = concentrate_hand_corner_mask(alpha)
    else:
        panel_fade = Image.new("L", spec["size"], 255)
        draw = ImageDraw.Draw(panel_fade)
        draw.rectangle([0, 0, spec["size"][0], 42], fill=96)
        alpha = ImageChops.multiply(alpha, panel_fade.filter(ImageFilter.GaussianBlur(18)))
        alpha = fill_right_alpha_edge(alpha)
    alpha_factor = spec.get("alpha_factor", 1)
    if alpha_factor != 1:
        alpha = alpha.point(lambda v: max(0, min(255, int(round(v * alpha_factor)))))

    out = Image.new("RGBA", spec["size"], (255, 255, 255, 0))
    out.putalpha(alpha)
    return out


def make_hand_edge_mask(source: Image.Image) -> Image.Image:
    source = source.convert("RGBA")
    width, height = source.size
    alpha = source.getchannel("A")
    crop_w = max(1, int(width * 0.42))
    # Use the right side of the richer log relief as a separate vertical edge motif.
    edge = alpha.crop((width - crop_w, 0, width, height)).resize((320, 768), Image.Resampling.LANCZOS)
    fade = Image.new("L", edge.size, 0)
    fpx = fade.load()
    ew, eh = edge.size
    for y in range(eh):
        ny = y / max(1, eh - 1)
        for x in range(ew):
            nx = x / max(1, ew - 1)
            right_weight = min(1.0, max(0.0, (nx - 0.05) / 0.70))
            top_soften = min(1.0, max(0.0, (ny - 0.02) / 0.22))
            bottom_soften = min(1.0, max(0.0, (1.0 - ny - 0.02) / 0.18))
            # Strong on the right edge, fading toward the left and softly at top/bottom.
            fpx[x, y] = int(255 * right_weight * max(0.32, min(top_soften, bottom_soften)))
    edge = ImageChops.multiply(edge, fade.filter(ImageFilter.GaussianBlur(8)))
    out = Image.new("RGBA", edge.size, (255, 255, 255, 0))
    out.putalpha(edge)
    return out


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    client_id = str(uuid.uuid4())
    manifest = []
    for spec in SPECS:
        workflow = make_workflow(spec)
        prompt_id = http_json("POST", "/prompt", {"prompt": workflow, "client_id": client_id}, timeout=20)["prompt_id"]
        raw = Image.open(io.BytesIO(wait_for_output(prompt_id))).convert("RGBA")
        raw_path = OUT_DIR / f"{spec['key']}_raw.png"
        mask_path = OUT_DIR / f"{spec['key']}.png"
        raw.save(raw_path)
        postprocess(raw, spec).save(mask_path)
        manifest.append({
            "key": spec["key"],
            "mask": str(mask_path.relative_to(ROOT)).replace("\\", "/"),
            "raw": str(raw_path.relative_to(ROOT)).replace("\\", "/"),
            "prompt": spec["prompt"],
        })
        print(mask_path)
    for key, source_key in HAND_EDGE_SOURCES:
        source_path = OUT_DIR / f"{source_key}.png"
        if not source_path.exists():
            continue
        mask_path = OUT_DIR / f"{key}.png"
        edge_mask = make_hand_edge_mask(Image.open(source_path))
        if key == "hand_edge_earth":
            alpha = edge_mask.getchannel("A").point(lambda v: max(0, min(255, int(round(v * 1.25)))))
            edge_mask.putalpha(alpha)
        edge_mask.save(mask_path)
        manifest.append({
            "key": key,
            "mask": str(mask_path.relative_to(ROOT)).replace("\\", "/"),
            "source": str(source_path.relative_to(ROOT)).replace("\\", "/"),
            "prompt": "Derived vertical hand-area edge relief mask from the corresponding log relief mask.",
        })
        print(mask_path)
    (OUT_DIR / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
