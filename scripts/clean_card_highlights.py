from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SRC_DIR = ROOT / "public" / "img" / "card" / "highlight"
OUT_DIR = ROOT / "public" / "img" / "card" / "highlight_clean"

# Use max-channel brightness rather than luminance so saturated red/purple lines do
# not disappear just because their perceived luminance is low.
ALPHA_FLOOR = 18
ALPHA_FULL = 118


def smooth_alpha(value: int) -> int:
    if value <= ALPHA_FLOOR:
        return 0
    if value >= ALPHA_FULL:
        return 255
    t = (value - ALPHA_FLOOR) / (ALPHA_FULL - ALPHA_FLOOR)
    t = t * t * (3 - 2 * t)
    return round(t * 255)


def clean_image(src: Path, dest: Path) -> None:
    img = Image.open(src).convert("RGBA")
    pixels = img.load()
    width, height = img.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            bright = max(r, g, b)
            next_alpha = min(a, smooth_alpha(bright))
            pixels[x, y] = (r, g, b, next_alpha)
    dest.parent.mkdir(parents=True, exist_ok=True)
    img.save(dest, optimize=True)


def main() -> None:
    for src in sorted(SRC_DIR.glob("*.png")):
        clean_image(src, OUT_DIR / src.name)
        print(f"cleaned {src.name}")


if __name__ == "__main__":
    main()
