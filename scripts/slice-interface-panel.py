"""Slice the approved UI master without painting or changing the artwork."""
import hashlib
import json
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1]
design = root / 'docs/ui-redesign-2026-09-12'
runtime = root / 'public/img/ui/interface'
runtime.mkdir(parents=True, exist_ok=True)
slices = design / 'slices'
slices.mkdir(exist_ok=True)
source = design / 'panel-master.png'
with Image.open(source) as original:
    assert original.width == original.height, 'Panel master must remain square'
    panel = original.convert('RGB').resize((512, 512), Image.Resampling.LANCZOS)
    panel.save(runtime / 'panel-frame.webp', quality=85)
    panel.crop((96, 96, 416, 416)).save(runtime / 'panel-surface.webp', quality=80)
    cuts = (0, 48, 464, 512)
    names = ('top', 'middle', 'bottom')
    columns = ('left', 'center', 'right')
    regions = []
    for row in range(3):
        for col in range(3):
            box = (cuts[col], cuts[row], cuts[col+1], cuts[row+1])
            name = f'{names[row]}-{columns[col]}.png'
            panel.crop(box).save(slices / name)
            regions.append({'file': f'slices/{name}', 'normalizedBox': box,
                            'sourceBox': [round(v * original.width / 512) for v in box]})
    manifest = {'source': source.name, 'sourceSize': original.size,
                'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                'normalizedSize': [512, 512], 'borderImageSlice': 48,
                'cardAspect': {'width': 392, 'height': 590}, 'regions': regions,
                'runtime': [{'path': str(p.relative_to(root)).replace('\\', '/'),
                             'bytes': p.stat().st_size,
                             'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
                            for p in sorted(runtime.glob('*.webp'))]}
    (design / 'asset-slices.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'runtimeBytes': sum(x['bytes'] for x in manifest['runtime']), 'slices': len(regions)}))
