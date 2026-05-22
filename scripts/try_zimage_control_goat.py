import json
import shutil
import time
import uuid
from pathlib import Path
from urllib import request


COMFY = "http://127.0.0.1:8188"
COMFY_INPUT = Path(r"C:\Users\zhuzi\AppData\Roaming\krita\ai_diffusion\server\ComfyUI\input")
SKETCH = Path(r"C:\Users\zhuzi\Pictures\dark_young_figure\0.png")


def api(method, path, data=None, timeout=15):
    body = None
    headers = {}
    if data is not None:
        body = json.dumps(data).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = request.Request(f"{COMFY}{path}", data=body, headers=headers, method=method)
    with request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main():
    COMFY_INPUT.mkdir(parents=True, exist_ok=True)
    shutil.copy2(SKETCH, COMFY_INPUT / "goat_control_0.png")
    prompt = {
        "1": {"class_type": "NunchakuZImageDiTLoader", "inputs": {"model_name": "z_image_turbo_fp8_e4m3fn.safetensors"}},
        "2": {"class_type": "ModelPatchLoader", "inputs": {"name": "Z-Image-Turbo-Fun-Controlnet-Union-2.1-lite-2601-8steps.safetensors"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "flux_vae.safetensors"}},
        "4": {"class_type": "LoadImage", "inputs": {"image": "goat_control_0.png"}},
        "5": {"class_type": "ImageScaleToMaxDimension", "inputs": {"image": ["4", 0], "upscale_method": "lanczos", "largest_size": 512}},
        "6": {"class_type": "Canny", "inputs": {"image": ["5", 0], "low_threshold": 0.1, "high_threshold": 0.32}},
        "7": {"class_type": "QwenImageDiffsynthControlnet", "inputs": {"model": ["1", 0], "model_patch": ["2", 0], "vae": ["3", 0], "image": ["6", 0], "strength": 0.95}},
        "8": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["7", 0], "shift": 3}},
        "9": {"class_type": "CLIPLoaderGGUF", "inputs": {"clip_name": "Qwen3-4B-Q4_K_M.gguf", "type": "lumina2"}},
        "10": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["9", 0], "text": "green glowing spectral evil goat spirit, side view, same silhouette as control image, dark fantasy game VFX sprite, translucent soul body, smoky edges, pure flat red background, no text, no watermark"}},
        "11": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["10", 0]}},
        "12": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 512, "height": 512, "batch_size": 1}},
        "13": {"class_type": "KSampler", "inputs": {"model": ["8", 0], "positive": ["10", 0], "negative": ["11", 0], "latent_image": ["12", 0], "seed": 900001, "steps": 8, "cfg": 1, "sampler_name": "res_multistep", "scheduler": "simple", "denoise": 1}},
        "14": {"class_type": "VAEDecode", "inputs": {"samples": ["13", 0], "vae": ["3", 0]}},
        "15": {"class_type": "SaveImage", "inputs": {"images": ["14", 0], "filename_prefix": "goat_z_control_test"}},
    }
    cid = str(uuid.uuid4())
    prompt_id = api("POST", "/prompt", {"prompt": prompt, "client_id": cid})["prompt_id"]
    print("prompt_id", prompt_id)
    for _ in range(240):
        h = api("GET", f"/history/{prompt_id}", timeout=10)
        item = h.get(prompt_id)
        if item:
            print(json.dumps(item.get("status"), ensure_ascii=False))
            print(json.dumps(item.get("outputs"), ensure_ascii=False))
            return
        time.sleep(1)
    raise TimeoutError(prompt_id)


if __name__ == "__main__":
    main()
