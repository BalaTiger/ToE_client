import colorsys
import json
import time
import uuid
from pathlib import Path
from urllib import error, parse, request

from PIL import Image, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW_PATH = Path(r"C:\Users\zhuzi\AppData\Roaming\krita\ai_diffusion\logs\workflow.json")
OUT_DIR = ROOT / "public" / "img" / "effects"
COMFY = "http://127.0.0.1:8188"


POSES = [
    "frame 1 of 6, contact pose: front legs extended forward, rear legs pushing back, body low and stretched, running left to right",
    "frame 2 of 6, passing pose: front legs under chest, rear legs crossing forward, head slightly lowered, running left to right",
    "frame 3 of 6, airborne pose: all four hooves lifted, body arched upward, smoky trail behind, running left to right",
    "frame 4 of 6, landing pose: front hooves touching down, rear legs tucked, horns tilted forward, running left to right",
    "frame 5 of 6, compression pose: legs gathered beneath body, shoulders high, spectral mane flaring, running left to right",
    "frame 6 of 6, push-off pose: rear legs extended powerfully, front legs reaching, long green spirit trail, running left to right",
]


BASE_PROMPT = (
    "A green glowing phantom goat spirit for a dark fantasy video game VFX asset, "
    "evil spectral goat with curved horns, translucent soul body, smoky ragged edges, "
    "readable four-footed goat silhouette, side view, no text, no watermark, no border. "
    "Pure flat red background #ff0000 only, no shadows on background, no gradients, no floor. "
    "Do not use red in the goat. "
)


def http_json(method, path, data=None, timeout=10):
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


def queue_prompt(workflow, client_id):
    return http_json("POST", "/prompt", {"prompt": workflow, "client_id": client_id}, timeout=15)["prompt_id"]


def wait_for_output(prompt_id, timeout=300):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            history = http_json("GET", f"/history/{prompt_id}", timeout=10)
        except (error.URLError, TimeoutError):
            time.sleep(1)
            continue
        item = history.get(prompt_id)
        if item:
            status = item.get("status", {}).get("status_str")
            if status == "error":
                raise RuntimeError(json.dumps(item.get("status"), ensure_ascii=False))
            outputs = item.get("outputs", {})
            for output in outputs.values():
                for img in output.get("images", []):
                    image_id = img.get("id")
                    if image_id:
                        return image_id
                    filename = img.get("filename")
                    if filename:
                        qs = parse.urlencode({
                            "filename": filename,
                            "subfolder": img.get("subfolder", ""),
                            "type": img.get("type", "output"),
                        })
                        return ("view", qs)
        time.sleep(1)
    raise TimeoutError(f"Timed out waiting for ComfyUI prompt {prompt_id}")


def download_image(output_ref):
    if isinstance(output_ref, tuple) and output_ref[0] == "view":
        return http_bytes(f"/view?{output_ref[1]}", timeout=30)
    return http_bytes(f"/api/etn/image/{output_ref}", timeout=30)


def red_to_alpha(img):
    img = img.convert("RGBA")
    px = img.load()
    w, h = img.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            h0, s0, v0 = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            hue = h0 * 360
            greenish = 55 <= hue <= 175 and s0 > 0.18 and v0 > 0.12
            mint_highlight = g >= r * 0.88 and g >= b * 1.05 and v0 > 0.35
            yellow_green_glow = 38 <= hue < 55 and g > b * 1.35 and v0 > 0.35
            subject = greenish or mint_highlight or yellow_green_glow
            if subject:
                color_strength = max(g - max(r, b) * 0.55, g - 42, min(r, g) - b * 0.8)
                alpha = max(0, min(255, int(color_strength * 1.65)))
                alpha = max(alpha, 110 if v0 > 0.28 else 0)
                px[x, y] = (r, g, b, min(a, alpha))
            else:
                px[x, y] = (r, g, b, 0)
    alpha = img.getchannel("A").filter(ImageFilter.GaussianBlur(0.35))
    img.putalpha(alpha)
    return img


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    workflow = json.loads(WORKFLOW_PATH.read_text(encoding="utf-8"))
    workflow["4"]["inputs"]["width"] = 256
    workflow["4"]["inputs"]["height"] = 256
    workflow["4"]["inputs"]["batch_size"] = 1
    workflow["7"]["inputs"]["steps"] = 8
    workflow["7"]["inputs"]["width"] = 256
    workflow["7"]["inputs"]["height"] = 256

    client_id = str(uuid.uuid4())
    frames = []
    for i, pose in enumerate(POSES):
        wf = json.loads(json.dumps(workflow))
        wf["5"]["inputs"]["text"] = BASE_PROMPT + pose
        wf["8"]["inputs"]["noise_seed"] = 812340 + i * 137
        prompt_id = queue_prompt(wf, client_id)
        output_ref = wait_for_output(prompt_id)
        source_path = OUT_DIR / f"evil_goat_spirit_run_{i + 1:02d}_red.png"
        source_path.write_bytes(download_image(output_ref))
        alpha_img = red_to_alpha(Image.open(source_path))
        frame_path = OUT_DIR / f"evil_goat_spirit_run_{i + 1:02d}.png"
        alpha_img.save(frame_path)
        frames.append(alpha_img)
        print(f"frame {i + 1}: {frame_path}")

    sheet = Image.new("RGBA", (256 * 3, 256 * 2), (0, 0, 0, 0))
    for i, frame in enumerate(frames):
        sheet.alpha_composite(frame, ((i % 3) * 256, (i // 3) * 256))
    sheet_path = OUT_DIR / "evil_goat_spirit_run_spritesheet.png"
    sheet.save(sheet_path)
    print(f"spritesheet: {sheet_path}")


if __name__ == "__main__":
    main()
