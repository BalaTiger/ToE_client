import colorsys
import io
import json
import time
import uuid
from pathlib import Path
from urllib import error, parse, request

from PIL import Image, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "public" / "img" / "effects"
COMFY = "http://127.0.0.1:8188"
SKETCH_DIR = Path(r"C:\Users\zhuzi\Pictures\dark_young_figure")

PROMPT = (
    "green glowing spectral evil goat spirit, side view, running right to left, "
    "dark fantasy game VFX sprite, translucent soul body, smoky ragged edges, "
    "curved horns, four legs, matches the control outline pose, centered full body, "
    "pure flat red background #ff0000, no floor, no shadows, no text, no watermark"
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


def upload_image(path, name):
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


def make_workflow(image_name, seed):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "z_image_turbo_fp8_e4m3fn.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "ModelPatchLoader", "inputs": {"name": "Z-Image-Turbo-Fun-Controlnet-Union-2.1-lite-2601-8steps.safetensors"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "flux_vae.safetensors"}},
        "4": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "5": {"class_type": "ImageScaleToMaxDimension", "inputs": {"image": ["4", 0], "upscale_method": "lanczos", "largest_size": 512}},
        "6": {"class_type": "Canny", "inputs": {"image": ["5", 0], "low_threshold": 0.1, "high_threshold": 0.32}},
        "7": {"class_type": "QwenImageDiffsynthControlnet", "inputs": {"model": ["1", 0], "model_patch": ["2", 0], "vae": ["3", 0], "image": ["6", 0], "strength": 1.0}},
        "8": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["7", 0], "shift": 3}},
        "9": {"class_type": "CLIPLoaderGGUF", "inputs": {"clip_name": "Qwen3-4B-Q4_K_M.gguf", "type": "lumina2"}},
        "10": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["9", 0], "text": PROMPT}},
        "11": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["10", 0]}},
        "12": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 512, "height": 512, "batch_size": 1}},
        "13": {"class_type": "KSampler", "inputs": {"model": ["8", 0], "positive": ["10", 0], "negative": ["11", 0], "latent_image": ["12", 0], "seed": seed, "steps": 8, "cfg": 1, "sampler_name": "res_multistep", "scheduler": "simple", "denoise": 1}},
        "14": {"class_type": "VAEDecode", "inputs": {"samples": ["13", 0], "vae": ["3", 0]}},
        "15": {"class_type": "SaveImage", "inputs": {"images": ["14", 0], "filename_prefix": "goat_control_frame"}},
    }


def red_to_alpha(img):
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            h0, s0, v0 = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            hue = h0 * 360
            greenish = 55 <= hue <= 175 and s0 > 0.12 and v0 > 0.10
            spectral_white = v0 > 0.55 and abs(r - g) < 34 and g >= b * 0.85
            if greenish or spectral_white:
                alpha = min(255, max(90 if v0 > 0.25 else 0, int((g + v0 * 120 - max(r, b) * 0.45) * 1.2)))
                px[x, y] = (r, g, b, min(a, max(0, alpha)))
            else:
                px[x, y] = (r, g, b, 0)
    img.putalpha(img.getchannel("A").filter(ImageFilter.GaussianBlur(0.35)))
    return ImageOps.contain(img, (256, 256), Image.Resampling.LANCZOS)


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    client_id = str(uuid.uuid4())
    frames = []
    for i in range(7):
        sketch = SKETCH_DIR / f"{i}.png"
        image_name = upload_image(sketch, f"dark_young_control_{i}.png")
        workflow = make_workflow(image_name, 920000 + i)
        prompt_id = http_json("POST", "/prompt", {"prompt": workflow, "client_id": client_id}, timeout=20)["prompt_id"]
        source_bytes = wait_for_output(prompt_id)
        red_path = OUT_DIR / f"evil_goat_spirit_run_{i:02d}_red.png"
        red_path.write_bytes(source_bytes)
        frame = red_to_alpha(Image.open(red_path))
        frame_path = OUT_DIR / f"evil_goat_spirit_run_{i:02d}.png"
        frame.save(frame_path)
        frames.append(frame)
        print(f"frame {i}: {frame_path}")

    sheet = Image.new("RGBA", (256 * 7, 256), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        sheet.alpha_composite(frame, (i * 256, 0))
    sheet_path = OUT_DIR / "evil_goat_spirit_run_spritesheet.png"
    sheet.save(sheet_path)
    print(f"spritesheet: {sheet_path}")


if __name__ == "__main__":
    main()
