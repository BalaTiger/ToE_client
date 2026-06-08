from __future__ import annotations

import io
import json
import time
import uuid
from pathlib import Path
from urllib import error, parse, request

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
COMFY = "http://127.0.0.1:8188"
SRC = ROOT / "public/img/card/cardback_earth_shadow.png"
OUT_DIR = ROOT / "public/img/card/animated/earth_shadow_comfy_try"
SIZE = (392, 590)

PROMPT = (
    "preserve the exact game card back composition, border, silhouette and crop. "
    "Only reinterpret the internal underground rock strata texture inside the card back: "
    "layered sediment stone, subtle mineral veins, ancient cave wall strata, dark cthulhu underworld mood, "
    "large readable strata shapes, no text, no logo, no extra symbols, no border change, no camera movement"
)


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


def upload_image(path: Path, name: str):
    boundary = f"----codex{uuid.uuid4().hex}".encode("ascii")
    data = path.read_bytes()
    fields = [
        (
            b"image",
            (
                f'Content-Disposition: form-data; name="image"; filename="{name}"\r\n'
                "Content-Type: image/png\r\n\r\n"
            ).encode("utf-8")
            + data
            + b"\r\n",
        ),
        (
            b"type",
            b'Content-Disposition: form-data; name="type"\r\n\r\ninput\r\n',
        ),
        (
            b"overwrite",
            b'Content-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n',
        ),
    ]
    body = io.BytesIO()
    for _, payload in fields:
        body.write(b"--" + boundary + b"\r\n")
        body.write(payload)
    body.write(b"--" + boundary + b"--\r\n")
    req = request.Request(
        f"{COMFY}/upload/image",
        data=body.getvalue(),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary.decode('ascii')}"},
        method="POST",
    )
    with request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))["name"]


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


def make_inner_mask(size=SIZE):
    w, h = size
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    # Keep the border and corner ornaments from the original card back.
    draw.rounded_rectangle([32, 48, w - 32, h - 48], radius=18, fill=255)
    draw.rounded_rectangle([48, 74, w - 48, h - 74], radius=14, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(5))


def make_workflow(image_name, seed):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "z_image_turbo_fp8_e4m3fn.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "ModelPatchLoader", "inputs": {"name": "Z-Image-Turbo-Fun-Controlnet-Union-2.1-lite-2601-8steps.safetensors"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "flux_vae.safetensors"}},
        "4": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "5": {"class_type": "ImageScale", "inputs": {"image": ["4", 0], "upscale_method": "lanczos", "width": 512, "height": 768, "crop": "disabled"}},
        "6": {"class_type": "Canny", "inputs": {"image": ["5", 0], "low_threshold": 0.04, "high_threshold": 0.20}},
        "7": {"class_type": "QwenImageDiffsynthControlnet", "inputs": {"model": ["1", 0], "model_patch": ["2", 0], "vae": ["3", 0], "image": ["6", 0], "strength": 0.72}},
        "8": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["7", 0], "shift": 3}},
        "9": {"class_type": "CLIPLoaderGGUF", "inputs": {"clip_name": "Qwen3-4B-Q4_K_M.gguf", "type": "lumina2"}},
        "10": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["9", 0], "text": PROMPT}},
        "11": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["10", 0]}},
        "12": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 512, "height": 768, "batch_size": 1}},
        "13": {"class_type": "KSampler", "inputs": {"model": ["8", 0], "positive": ["10", 0], "negative": ["11", 0], "latent_image": ["12", 0], "seed": seed, "steps": 8, "cfg": 1.0, "sampler_name": "res_multistep", "scheduler": "simple", "denoise": 1.0}},
        "14": {"class_type": "VAEDecode", "inputs": {"samples": ["13", 0], "vae": ["3", 0]}},
        "15": {"class_type": "ImageScale", "inputs": {"image": ["14", 0], "upscale_method": "lanczos", "width": SIZE[0], "height": SIZE[1], "crop": "disabled"}},
        "16": {"class_type": "SaveImage", "inputs": {"images": ["15", 0], "filename_prefix": "earth_cardback_try"}},
    }


def composite_candidate(candidate: Image.Image, base: Image.Image, mask: Image.Image):
    candidate = candidate.convert("RGBA").resize(SIZE, Image.Resampling.LANCZOS)
    base = base.convert("RGBA").resize(SIZE, Image.Resampling.LANCZOS)
    # Keep the original value range close; the model only contributes internal strata texture.
    mixed = Image.blend(base, candidate, 0.42)
    return Image.composite(mixed, base, mask)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    base = Image.open(SRC).resize(SIZE, Image.Resampling.LANCZOS).convert("RGBA")
    input_path = OUT_DIR / "earth_cardback_input.png"
    base.save(input_path)
    mask = make_inner_mask()
    mask.save(OUT_DIR / "earth_cardback_inner_mask.png")
    image_name = upload_image(input_path, "earth_cardback_input.png")
    client_id = str(uuid.uuid4())
    outputs = []
    for i, seed in enumerate([421700, 421701, 421702]):
        workflow = make_workflow(image_name, seed)
        prompt_id = http_json("POST", "/prompt", {"prompt": workflow, "client_id": client_id}, timeout=20)["prompt_id"]
        raw = Image.open(io.BytesIO(wait_for_output(prompt_id))).convert("RGBA")
        raw_path = OUT_DIR / f"earth_cardback_comfy_raw_{i:02d}.png"
        raw.save(raw_path)
        comp = composite_candidate(raw, base, mask)
        comp_path = OUT_DIR / f"earth_cardback_comfy_comp_{i:02d}.png"
        comp.save(comp_path)
        outputs.append(str(comp_path.relative_to(ROOT)).replace("\\", "/"))
        print(f"candidate {i}: {comp_path}")
    (OUT_DIR / "result.json").write_text(json.dumps({"outputs": outputs}, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
