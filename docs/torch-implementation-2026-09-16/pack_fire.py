"""Pack scene-linear Blender emission into a small transparent mobile atlas.

Needs numpy and Pillow. No synthetic reverse motion: the loop seam blends two
forward-moving 12-frame segments in linear light.
"""
from pathlib import Path
import hashlib
import json
import shutil
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = Path(__file__).resolve().parent
DEST = ROOT.parents[1] / 'public/img/effects/torch'
DEST.mkdir(parents=True, exist_ok=True)
raw = [np.load(ROOT / 'frames' / f'fire_{i:03d}.npy') for i in range(60)]
loop = raw[12:48]
for i in range(12):
    t = i / 11
    weight = t * t * (3 - 2 * t)
    loop.append(raw[48 + i] * (1 - weight) + raw[i] * weight)


def display_rgba(linear):
    source = np.maximum(linear, 0)
    glow_seed = Image.fromarray(np.uint8(np.clip(source.max(2) * .2, 0, 1) * 255))
    glow = (np.asarray(glow_seed.filter(ImageFilter.GaussianBlur(3)), dtype=float) * .06
            + np.asarray(glow_seed.filter(ImageFilter.GaussianBlur(9)), dtype=float) * .035) / 255
    source = source + glow[:, :, None] * np.array([1, .3, .045])
    v = source * .85
    mapped = np.clip((v * (2.51 * v + .03)) / (v * (2.43 * v + .59) + .14), 0, 1)
    encoded = np.where(mapped <= .0031308, mapped * 12.92, 1.055 * mapped ** (1 / 2.4) - .055)
    alpha = np.clip(encoded.max(2), 0, 1)
    straight = encoded / np.maximum(alpha[:, :, None], 1e-8)
    rgba = np.dstack((straight, alpha))
    rgba[alpha < 1/255] = 0
    return Image.fromarray(np.uint8(np.clip(rgba, 0, 1) * 255 + .5), 'RGBA')


frames = [display_rgba(frame) for frame in loop]
atlas = Image.new('RGBA', (2048, 3072))
for i, frame in enumerate(frames):
    atlas.paste(frame, ((i % 8) * 256, (i // 8) * 512))
atlas.save(DEST / 'flame-atlas.webp', quality=92, method=6, exact=True)
frames[0].save(DEST / 'flame-still.webp', quality=94, method=6, exact=True)
contact = Image.new('RGB', (1024, 280), '#11171b')
draw = ImageDraw.Draw(contact)
for i in range(8):
    thumb = frames[i * 6].resize((128, 256), Image.Resampling.LANCZOS)
    contact.paste(thumb, (i * 128, 20), thumb)
    draw.text((i * 128 + 8, 4), f'{i * 6:02d} / 48', fill='#d8c5a0')
contact.save(ROOT / 'flame-contact-sheet.png')
preview = []
for frame in frames:
    small = frame.resize((256, 512), Image.Resampling.LANCZOS)
    bg = Image.new('RGBA', small.size, '#11171b')
    preview.append(Image.alpha_composite(bg, small).convert('RGB'))
preview[0].save(ROOT / 'flame-loop-preview.webp', save_all=True, append_images=preview[1:], duration=42, loop=0, quality=90, method=6)
bounds = np.asarray(atlas)[:, :, 3]
frame_bounds = [f.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox() for f in frames]
differences = [float(np.abs(loop[(i+1) % 48] - loop[i]).mean()) for i in range(48)]
metadata = {
    'atlas': '/img/effects/torch/flame-atlas.webp', 'still': '/img/effects/torch/flame-still.webp',
    'columns': 8, 'rows': 6, 'frames': 48, 'frameWidth': 256, 'frameHeight': 512, 'fps': 24,
    'baseAnchor': {'x': .5, 'y': .80},
    'colorSpace': 'srgb', 'alpha': 'straight', 'emissionGain': 3,
    'hdrEncoding': 'SDR tone-mapped emission; runtime linear gain is artistic, not original radiance reconstruction',
    'source': 'JangaFX Small Camp Fire CC0 VDB',
    'sourceUrl': 'https://jangafx.com/software/embergen/download/free-vdb-animations',
    'sourceFrames': [40, 99], 'loop': '48 forward frames with a 12-frame smooth linear-light overlap',
    'master': 'Cycles blackbody flame emission, 256 samples, linear half-float EXR',
    'atlasBytes': (DEST / 'flame-atlas.webp').stat().st_size,
    'decodedRgbaBytes': 2048 * 3072 * 4,
    'frameBoundsAlphaOver8': frame_bounds,
    'loopSeamLinearMeanDifference': differences[-1],
    'medianAdjacentLinearMeanDifference': float(np.median(differences)),
    'sourceSha256': hashlib.sha256((ROOT / 'source/SmallCampfireVDB.zip').read_bytes()).hexdigest(),
}
(DEST / 'flame-atlas.json').write_text(json.dumps(metadata, indent=2) + '\n', encoding='utf-8')
shutil.copyfile(ROOT / 'source/LICENSE.txt', ROOT / 'JangaFX-CC0.txt')
assert len(frames) == 48 and atlas.size == (2048, 3072)
assert 0 < np.count_nonzero(bounds) < bounds.size / 2, 'Expected localized transparent fire, no full black rectangle'
for frame in frames:
    alpha = np.asarray(frame)[:, :, 3]
    assert max(alpha[0].max(), alpha[-1].max(), alpha[:, 0].max(), alpha[:, -1].max()) < 4, 'Flame/glow must not clip any tile edge'
assert differences[-1] < max(differences[:-1]) * 1.5, 'Loop seam should not jump more than natural frame changes'
print(json.dumps({key: metadata[key] for key in ['atlasBytes', 'decodedRgbaBytes', 'loopSeamLinearMeanDifference', 'medianAdjacentLinearMeanDifference']}))
