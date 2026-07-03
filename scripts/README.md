# Asset Generation Scripts

This folder contains maintained asset-generation scripts and one-off experiments.

## Maintained Scripts

- `generate-resource-manifest.mjs` - scans runtime assets and writes `public/resource-manifest.json`
- `generate-card-flavor-template.mjs` - generates the card flavor TSV template
- `convert_card_illustrations_to_webp.py` - converts source card illustrations to runtime WebP files
- `generate_animated_cardbacks.py` - generates animated card-back frame sequences
- `generate_theme_relief_masks.py` - generates UI relief mask images
- `generate_goat_sprites_control.py` - generates the black goat movement sprite sheet
- `generate_zone_illustrations_comfy.py` - ComfyUI-driven zone illustration generation helper

`experiments/` contains one-off ComfyUI exploration scripts. Treat them as prompt/research references, not runtime pipeline dependencies.

## Runtime Outputs

Animated card backs are loaded as individual WebP frame files:

- `public/img/card/animated/earth_shadow/frame_00.webp` through `frame_23.webp`
- `public/img/card/animated/stars_call/frame_00.webp` through `frame_23.webp`

The frontend does not use a card-back spritesheet. Do not reintroduce card-back spritesheets unless `src/components/cards/AnimatedCardBack.jsx` and resource preloading are changed together.

UI relief masks live in:

- `public/img/ui/theme_relief/panel_corner_*.webp`
- `public/img/ui/theme_relief/hand_edge_*.webp`
- `public/img/ui/theme_relief/log_relief_*.webp`

## Source References

`public/img/card/animated/source_refs/` stores selected reference composites used by card-back generation:

- `earth_shadow_detail.webp`
- `stars_call_detail.webp`

## Working Rules

- If generated runtime assets change, run `npm run build` so `public/resource-manifest.json` is refreshed.
- If only `generatedAt` changes in the manifest during unrelated work, do not keep that diff.
- When replacing generated assets, also check:
  - `src/constants/theme.js`
  - `src/constants/card.js`
  - `src/hooks/useResourcePreload.js`
  - `src/components/cards/AnimatedCardBack.jsx`
