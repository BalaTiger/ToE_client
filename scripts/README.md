# Asset Generation Scripts

This folder has two kinds of scripts:

- `generate_animated_cardbacks.py`: official generator for animated card-back frame sequences.
- `generate_theme_relief_masks.py`: official generator for UI relief mask PNGs.
- `generate_goat_sprites_control.py`: official generator for the black goat movement sprite sheet.
- `experiments/`: one-off ComfyUI exploration scripts. They are not part of the runtime asset pipeline.

## Runtime Outputs

Animated card backs are loaded as individual frame files:

- `public/img/card/animated/earth_shadow/frame_00.png` through `frame_23.png`
- `public/img/card/animated/stars_call/frame_00.png` through `frame_23.png`

The frontend does not use `spritesheet.png` for card backs. Do not reintroduce card-back spritesheets unless `AnimatedCardBack.jsx` and resource preloading are changed together.

## Working Rules

- Treat `generate_animated_cardbacks.py` and `generate_theme_relief_masks.py` as the maintained pipeline.
- Treat `experiments/` as disposable research code: useful for prompt iteration, not for direct runtime dependency.
- If you replace generated assets, also check:
  - `src/constants/theme.js`
  - `src/constants/card.js`
  - `src/hooks/useResourcePreload.js`
  - `src/components/cards/AnimatedCardBack.jsx`

This keeps asset paths, cache-busting versions, preload lists, and playback behavior aligned.

UI relief masks live in:

- `public/img/ui/theme_relief/panel_corner_*.png`
- `public/img/ui/theme_relief/hand_edge_*.png`
- `public/img/ui/theme_relief/log_relief_*.png`

## Source References

`public/img/card/animated/source_refs/` stores selected ComfyUI reference composites used by `generate_animated_cardbacks.py`.

Keep these files if you want deterministic regeneration of the current animated card backs:

- `earth_shadow_detail.png`
- `stars_call_detail.png`

The old ComfyUI trial output folders are intentionally not runtime resources.
