from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "asset_sources" / "card_illustration_png"
OUTPUT_DIR = ROOT / "public" / "img" / "card" / "illustration"
QUALITY = 86
ALPHA_QUALITY = 92


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    total_in = 0
    total_out = 0

    for source in sorted(SOURCE_DIR.glob("*.png")):
        target = OUTPUT_DIR / f"{source.stem}.webp"
        with Image.open(source) as image:
            output_image = image.convert("RGBA") if image.mode in ("P", "LA") else image
            output_image.save(
                target,
                "WEBP",
                quality=QUALITY,
                method=6,
                alpha_quality=ALPHA_QUALITY,
            )

        source_size = source.stat().st_size
        target_size = target.stat().st_size
        total_in += source_size
        total_out += target_size
        print(
            f"{source.name}: {source_size / 1024 / 1024:.2f}MB -> "
            f"{target_size / 1024 / 1024:.2f}MB"
        )

    if total_in:
        print(
            f"TOTAL: {total_in / 1024 / 1024:.2f}MB -> "
            f"{total_out / 1024 / 1024:.2f}MB ({total_out / total_in * 100:.1f}%)"
        )


if __name__ == "__main__":
    main()
