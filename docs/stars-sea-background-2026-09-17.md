# 群星呼唤：海面与星空背景

使用内置 imagegen，以替换前的 `public/img/bg/battle/stars_call.webp` 作为画风与色调参考。2026-09-17 将该主题的环境改为海面、星空与远方岛屿上的残垣遗迹。

- 首版：`public/img/bg/battle/stars_call_sea.webp`，1597×985，保持生成图比例，仅编码为 WebP（quality 90）。使用新文件名避免已安装页面的 cache-first Service Worker 继续返回旧背景。
- 生成原图：`E:/Codex/codex-home/generated_images/01a094e6-b663-7ab2-ac74-ac53e4bb49c0/exec-d7d9dd68-3658-45a7-b70f-5a200c6404fb.png`。
- 所有布局继续通过 `BATTLE_BACKGROUND_BY_EXPANSION` 共用该主题背景；沿用原有 Gamma，后续构图与铺放调整见下文。
- 根据实机反馈，仅降低群星背景渐变遮色的不透明度：上方 0.66 → 0.58，下方 0.84 → 0.68，让海面波纹与反光更清晰，同时保留暗色夜景。该调整不作用于卡牌、UI 或其他主题。

## 首版生成提示词

```text
Use case: style-transfer.
Asset type: production environment background for the Cthulhu card game Treasures of Evils, expansion theme “群星呼唤”. One full-bleed landscape background, approximately 2400 by 1480 pixels, same landscape aspect ratio as the reference, no interface.

Input image: the existing stars_call background is the STYLE AND PALETTE reference. Replace its setting with OPEN SEA UNDER A STAR-FILLED NIGHT SKY. Preserve its somber hand-painted dark fantasy illustration, etched weathered textures, near-black silhouettes, deep desaturated blue-green/teal shadows and selective pale cyan highlights. Same game, same artist. Not photographic, not cartoon, no plastic 3D appearance.

Composition: view looking across the sea from low above water. Upper half is a vast starry sky with subtle faint cyan star clouds, atmospheric dark clouds and many restrained small stars, not a neon galaxy. Horizon near the vertical middle, clearly readable. Lower half is the dark open ocean, small layered waves and a restrained broken trail of starlight, receding into atmospheric distance. On the distant sea and low rocky islands, show ruined ancient stone walls, broken arches and crumbling temple silhouettes. Place a few ruins around the distant mid-left and mid-right horizon, readable but small enough to unmistakably be far away; the main central space is open water and sky for game cards. Natural scale, layered haze, ancient and eerie. No intact modern buildings, people, ships, giant creatures, close foreground ruins, stone arena floor, giant celestial rings, diagrams, typography, borders, UI or watermarks.

Lighting: retain the reference's dramatic chiaroscuro and ominous darkness, desaturated midnight teal, detailed but quiet dark water. Keep midground forms and star highlights identifiable; do not crush the entire scene into flat black. Darker edges blend with the game's existing ornate UI. Full image to the edges, no white line or frame. Deliver only the finished background.
```

## 可见海面与残柱修订

- 最终运行素材：`public/img/bg/battle/stars_call_sea_ruins.webp`，1597×985，264428 bytes，WebP quality 90；使用内置 imagegen 编辑，不额外拉伸或裁切图片。
- 原图：`E:/Codex/codex-home/generated_images/01a094e6-b663-7ab2-ac74-ac53e4bb49c0/exec-68cd2535-85a8-45cb-acab-ac243e5ed052.png`。
- 海天线从约 55% 上移到 32%，波纹与反光分布在中部；两侧残柱向中央海天线收拢，为探索方向提供透视参照。游戏采用居中 `cover`，移除原群星背景的横向重复。
- 保持上一版海面提亮参数。运镜按主题绑定，群星只缩小缩放幅度并将焦点移到海天线，保留现有晃动；行船式运镜按用户要求暂缓，具体接口见 `src/ui/README.md` 的主题探索运镜章节。

### 验收

- 实际对局确认已加载残柱背景，海面纹理在牌堆周围及手牌上方可见，控制台无错误。
- `battle-camera` 在 1280×800、1520×800 检查海景构图和活动运镜，根节点与页面高度均保持 800，没有由背景缩放产生滚动增长。
- 群星实际使用 `toeDrawBackgroundSea`／32% 焦点，地神仍使用 `toeDrawBackgroundWalk`／48% 焦点；gallery 197 项测试、ESLint、生产构建通过。

### 构图调整提示词

```text
Use case: precise-object-edit.
Asset type: production landscape background for the dark fantasy card game “群星呼唤”. Edit the FIRST reference image, keep its same landscape aspect ratio (approximately 1.62:1), output only the full-bleed environmental background.

Image 1 is the edit target and exact style/color reference. Image 2 is ONLY a composition/occlusion guide showing the existing in-game UI: DO NOT paint any of its cards, characters, hands, torch, UI, lettering, frames or buttons into the background output.

Primary correction: currently almost all readable ocean is behind the player's large hand of cards. Recompose image 1 so the sea horizon is at 32% of the image height from the top, not at 55%. Keep star-filled sky in the upper third, with the same subdued cyan star-cloud and cloud shapes adapted to this space. Put the distant rocky islands and ancient ruined arches/temples on that higher horizon. They must remain small, distant and hazy, not become foreground objects.

The open ocean must occupy the lower two thirds. In particular the band between y=34% and y=58% must contain clearly readable silver-teal wave crests, layered ripples, restrained broken starlight reflections and water depth. These are the visible areas around and between the three card piles and above the player's cards. Spread the water texture across the width instead of concentrating all highlights into a narrow central strip or below y=65%. Use moderately brighter midtone blue-teal water here, enough to survive the game's dark overlay, while preserving the ominous night lighting and avoiding an overexposed stripe. Calm rolling sea, not giant breaking surf.

Preserve the original hand-painted dark fantasy / etched painterly style, high chiaroscuro, dark desaturated midnight blue and teal palette, atmospheric distance, side islands with worn ruins and the starry night identity. This is the same scene, reframed with a modestly more elevated viewpoint, not a new art style. Keep darkest foreground water toward the bottom where cards cover it; important wave detail must be higher up. No glowing magic ocean, no bright daylight, no moon, no added creatures, no people, no ships, no furniture, no text, no UI, no card decks, no watermarks, no border. Deliver only the finished usable background.
```

### 最终残柱提示词

```text
Use case: precise-object-edit.
Asset type: final production environment background, dark fantasy Cthulhu card game “群星呼唤”. Landscape, same aspect ratio as Image 1, approximately 1.62:1.

Image 1 is the EDIT TARGET. Preserve its sea, starry sky, distant island ruins, horizon at y=32%, light, colors and painterly style. Image 2 is ONLY an OCCLUSION GUIDE for the in-game interface. Do not copy any UI, torch, hand, cards, lettering, portraits, frames or objects from image 2.

Add a few broken ancient stone columns standing out of the sea in the near and middle distance, flanking the direction of forward exploration on BOTH sides. Arrange them with a convincing perspective convergence toward the central distant ruins / horizon (vanishing point about x=50%, y=32%). Use about 3 damaged columns or stumps per side, staggered naturally, not perfectly symmetric identical copies. The nearest broken shafts should sit near x=24–29% and x=72–77%, their bases around y=64–73% and broken tops around y=35–43%. Smaller further remnants around x=35–40% and x=60–65%, bases y=42–49%, lead the gaze toward the horizon. This provides visible vertical stone landmarks above the hand cards, rather than confining the new columns to the hidden bottom corners. Leave a broad uninterrupted central water corridor. They emerge directly from the sea, without adding a dry floor or causeway.

Material: massive time-worn dark rough stone, broken capitals, irregular eroded edges, faint ancient carving, wet teal rim-light and subtle foam around the bases. Do not make them glossy, white, Greek tourist columns, intact architecture, or enormously tall. Keep them subordinate to the whole scene but readable against the sea under a dark game overlay.

Invariants: horizon remains at the upper third, ocean ripple detail and silver-teal starlight reflections remain readable across y=34–58%, lower foreground stays darker. Keep the original somber high-chiaroscuro hand-painted / etched fantasy illustration, desaturated blue-black teal palette, celestial clouds, wide sea and distant ruins. No bright daylight, magic beams, characters, creatures, boats, UI, typography, watermarks or border. Output only the finished full-bleed background with these columns added.
```
