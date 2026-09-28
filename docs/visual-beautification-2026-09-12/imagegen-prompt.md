# 风格样板生成记录

- 日期：2026-09-12。
- 模式：内置 image_gen；一次生成一张六格概念样板。
- 用途：方案评审，未作为运行时素材接入游戏；样板不是透明素材图集。
- 输入 1：`baseline-main.png`，当前主界面，仅作风格参照。
- 输入 2：`../../public/img/btn/btn_dark_green.webp`，既有按钮，仅作材质参照。
- 输出：`style-studies-v1.png`。
- 复用约束：正式界面继续使用现有三身份徽章、卡背与牌面；样板里的骰子、牌背、徽记只表达材质，不是替换设计。SAN 数值条保持现有紫色语义；青绿雾是可选环境辅层。

## 完整提示词

```text
Use case: stylized-concept
Asset type: a single art-direction moodboard for a Cthulhu multiplayer card game's visual-effects beautification plan. This is concept art for review, not a playable UI and not a production spritesheet.
Input images: Image 1 is a reference screenshot of the game's CURRENT main screen, used solely as the visual style authority. Image 2 is an existing dark teal antique-bronze framed button, used as a reference for patina, border thinness and restrained ornament. Do not edit either input.
Primary request: Create ONE beautiful 1536x1024 landscape concept sheet with six equal, clearly separated rectangular studies in a precise 3-column by 2-row grid on near-black charcoal. Fill most of the canvas, even margins. The visual world must feel continuous with the provided actual game: weathered archaeological relics, old bronze engraving, soot-black stone, controlled eldritch light, solemn atmospheric Lovecraftian tabletop fantasy, not modern neon.
Top left: a quiet blackened-stone decision-panel surface with thin tarnished brass double border and understated engraved corners, broad clean center for future live text.
Top center: antique ivory and black-stone dice on a dark ceremonial surface, tiny realistic crimson impact dust and dim old-gold etched circle.
Top right: a damaged stone talisman with a crisp restrained crimson fissure, a few debris flecks and readable center silhouette; represents HP impact.
Bottom left: a cold teal spirit mist passing through a weathered circular ritual seal, very restrained spectral glow, SAN disturbance.
Bottom center: warm dim golden dust and a fine etched ring swirling around a mysterious old card seen from its back, representing card acquisition; preserve game-reference material language.
Bottom right: deep violet fog and an indistinct tentacled silhouette behind an antique bronze cult sigil, representing a god appearance; dark edges, controlled focal light.
Color palette: background #060707; antique bronze #c8a96e and parchment #cbb293; muted teal #8fd0ca, blood-red #d26458, ritual violet #a781cf as small local accents. Use real tonal separation so texture is visible without brightening everything. About 75% dark neutral, 20% aged material, 5% emitted color.
Materials/textures: believable fine stone cracks, oxidation, rubbed brass edge highlights; same physical scale and finish across studies.
Constraints: no letters, no words, no numeric UI, no logos, no watermark, no copied screenshot text; no extra panels; no cartoon emoji, no oversaturated neon, no rainbow, no plastic, no gold filigree overload. Entire design flat-on composition, no browser or device mockup. This sheet communicates asset / effect art direction; final typography, HP numbers, dice results and geometry will remain code-rendered.
```
