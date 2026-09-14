"""Cut generated button frames and export the selected hand-table artwork."""
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
design = root / 'docs/hand-table-redesign-2026-09-14'
runtime = root / 'public/img/ui/hand-table'
runtime.mkdir(parents=True, exist_ok=True)
records = []
with Image.open(design / 'button-master.png') as master:
    width, height = master.size
    for index, name in enumerate(('skill', 'rest', 'multiply', 'end')):
        x, y = index % 2, index // 2
        box = (x * width // 2, y * height // 2, (x + 1) * width // 2, (y + 1) * height // 2)
        tile = master.crop(box).convert('RGBA')
        # Remove only the white matte connected to the outside of each frame.
        ImageDraw.floodfill(tile, (0, 0), (0, 0, 0, 0), thresh=125)
        bounds = tile.getchannel('A').getbbox()
        assert bounds and bounds[0] > 0 and bounds[1] > 0, 'Exterior matte must be fully removed'
        tile = tile.crop(bounds).resize((396, 132), Image.Resampling.LANCZOS)
        output = runtime / f'{name}.webp'
        tile.save(output, quality=88, method=6)
        assert tile.getpixel((0, 0))[3] == 0 and tile.getpixel((198, 66))[3] == 255
        records.append({'path': str(output.relative_to(root)).replace('\\', '/'),
                        'sourceCell': box, 'trim': bounds, 'size': tile.size,
                        'bytes': output.stat().st_size,
                        'sha256': hashlib.sha256(output.read_bytes()).hexdigest()})

with Image.open(design / 'table-master.png') as master:
    # Export only bare stone; the raised side props are separate alpha layers.
    master = master.crop((600, 210, 1570, 700))
    master.thumbnail((1200, 600), Image.Resampling.LANCZOS)
    output = runtime / 'table.webp'
    master.convert('RGB').save(output, quality=84, method=6)
    records.append({'path': str(output.relative_to(root)).replace('\\', '/'),
                    'size': master.size, 'bytes': output.stat().st_size,
                    'sha256': hashlib.sha256(output.read_bytes()).hexdigest()})

for name in ('relief-left', 'relief-right'):
    with Image.open(design / f'{name}-master.png') as master:
        tile = master.convert('RGBA')
        ImageDraw.floodfill(tile, (0, 0), (0, 0, 0, 0), thresh=125)
        bounds = tile.getchannel('A').getbbox()
        assert bounds and tile.getpixel((0, 0))[3] == 0
        tile = tile.crop(bounds)
        tile.thumbnail((640, 640), Image.Resampling.LANCZOS)
        output = runtime / f'{name}.webp'
        tile.save(output, quality=88, method=6)
        records.append({'path': str(output.relative_to(root)).replace('\\', '/'),
                        'trim': bounds, 'size': tile.size, 'bytes': output.stat().st_size,
                        'sha256': hashlib.sha256(output.read_bytes()).hexdigest()})

weathered_master = root / 'docs/board-arch-proposals-2026-09-14/table-weathered-master.png'
if weathered_master.exists():
    with Image.open(weathered_master) as master:
        output = runtime / 'table-weathered.webp'
        master.convert('RGB').save(output, quality=86, method=6)
        records.append({'path': str(output.relative_to(root)).replace('\\', '/'),
                        'source': str(weathered_master.relative_to(root)).replace('\\', '/'),
                        'size': master.size, 'bytes': output.stat().st_size,
                        'sha256': hashlib.sha256(output.read_bytes()).hexdigest()})

(design / 'asset-slices.json').write_text(json.dumps({'runtime': records}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'assets': len(records), 'runtimeBytes': sum(item['bytes'] for item in records)}))
