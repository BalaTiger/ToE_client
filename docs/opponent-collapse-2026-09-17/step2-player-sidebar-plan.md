# 第二步：玩家信息区迁至火把左侧（效果图与实施规划）

日期：2026-09-17。状态：已实现；实际尺寸、素材与验收见 [实施记录](step2-implementation.md)。下文保留原设计依据。

## 效果图

[最新效果图：左侧独立挂靠、加大顶部间隙](step2-player-sidebar-gap.png)

[上一版座次校正版](step2-player-sidebar.png)

最新用户修正：玩家面板与顶部其他角色行拉开距离，强调挂靠画面左侧而非从顶部延伸。最新效果图原始输出：`E:/Codex/codex-home/generated_images/01a094e6-b663-7ab2-ac74-ac53e4bb49c0/exec-0bc82361-a17e-48f9-9443-74707acab4ee.png`。生成图中的贝拉下挂标签被模型漏画；实际实现保留原标签及悬停交互，不以这处重绘作为删除依据。

编辑底稿：[双完整面板实装截图](two-full-overlap-fixed.png)。这是正式 React 组件的 12 人验收场景，黛安娜执行回合、贝拉悬停展开。使用内置 image_gen.imagegen 编辑模式；没有使用外部 API 或 CLI。

校正版原始输出：
`E:/Codex/codex-home/generated_images/01a094e6-b663-7ab2-ac74-ac53e4bb49c0/exec-6620daf2-a543-4fe0-bb17-25e14efe6634.png`。

前一草稿：
`E:/Codex/codex-home/generated_images/01a094e6-b663-7ab2-ac74-ac53e4bb49c0/exec-2c0a8d38-9a39-468d-bd15-3ba9b38218fa.png`。

以校正版的左侧纵向人物区为构图依据。生成图里的中文、数值、卡面、环境存在重绘差异；实际实现只制作玩家面板美术并修改角色区域布局，其他既有画面不采用生成图重绘的内容。顶部简化面板沿用既有头像、手牌图标与计数、双色状态条、骷髅；图中的新增简化姓名行不作为本次必需改动。

## 构图与信息层级

- 玩家整体信息区移至火把左边，设计宽约170px，正文右边界控制在178px以内，避开火焰范围。
- 顶部不与其他角色行相接，以左侧边为独立锚点。以1200px逻辑棋盘为基准，玩家面板顶部约175～185px，保留明显连续背景留白；同时验收顶部完整面板的下挂tag，不能让tag重新连接两组面板。外框左缘可裁出画面约4～7px，但头像圆框、文字与交互内容必须完整。
- 底部止于原左下牌堆计数框上方，至少留12～16px空隙。在16:10～19:10安全比例内计算可用高度，较矮时压缩无信息的内部留白；头像至多等比缩小约10%，不缩小正文来迁就高度，神力及tag区域按需内部滚动。
- 顶部为独立等比圆形头像，其次为一行姓名＋职业、HP/SAN连续条和数值。职业颜色使用现有映射；SAN保留60%无数字刻线。
- 骷髅压在人物核心区下边框上，不混入神力/tag区域。
- 下方共用同一纵向底板容纳当前信仰、神力名称/等级、实际完整说明及其他tag。保持功能、悬停说明和选择交互。
- 头像与状态条优先固定可读尺寸；窗口较矮或说明/tag较多时，仅下部内容内部滚动。不能靠无限缩小字体容纳内容，也不能遮挡计数框。
- 材质采用暗色做旧底板和克制铜边，与角色区现有风格一致；圆框与伸缩底板分离。

## 顶部空间验证

沿用当前布局函数，逻辑棋盘宽1200时：

- 原角色区：x=288～918，宽630。
- 新角色区：x=14～918，宽904，增加274（约43.5%）。
- 右上回合区从x=930开始，保持原尺寸与位置。
- 完整角色面板仍宽154，简化席位仍宽64。与完整面板相邻处仍保留16px。

| 11名其他角色的状态 | 原布局 | 新布局 |
| --- | --- | --- |
| 玩家自己回合，全部简化 | 简化席位重叠7.4px | 简化席位间隔6px |
| 一名位于队列中间的角色执行回合 | 简化席位重叠24.5px | 简化席位间隔6px |
| 队列中间两名不同角色分别执行回合、悬停展开 | 简化席位最多重叠53px | 简化席位最多重叠约7.33px |

以上为运行现有 `getOpponentRosterLayout` 得到的逻辑尺寸，不以生成图作为精确测量依据。圆形素材不拉伸，当前回合和悬停完整面板不缩小。

## 素材计划

只新增玩家纵向信息区所需素材：

1. 无字、透明边缘的做旧人物面板底板。直线边框与内部纹理可用九宫格；上下装饰端帽保持原比例，避免纵向拉伸花饰。
2. 独立圆形头像框：优先复用已有圆框；若风格适配不足，再生成专用圆框，始终等比。
3. 分隔线与状态标签优先复用现有图形/CSS；头像、骷髅、HP/SAN条沿用现有资源。文字和数值实时渲染，不烘焙进图片。

现有横向玩家底框及独立信仰旗帜在该布局中停止使用。其他布局保留其原有素材。无需新做背景、火把、手牌、牌堆、日志、回合面板、功能按钮。

## 实施顺序与边界

1. **固定非角色区域坐标。** 当前 `CoastalBattleLayout.jsx` 用角色行中心计算牌堆中心。扩宽后会使牌堆左移约137px，必须先解耦：保留旧棋盘中心公式 `width * 0.5125 - 12`（1200时603），同时保留现有牌堆/手牌/日志/持续效果的尺寸与纵向规则。保存改前DOM边界作为回归基线。
2. **重排玩家区。** 调整 `SelfPlayerPanel.jsx` 的 coastal 分支，以及 `coastal-panels.css`、`coastal-layout.css`。将头像、身份、数值、神力、tag放入同一左侧容器；替换 `CoastalBattleLayout.jsx` 的独立旗帜层。字体优先使用项目已有窄体衬线字体。
3. **扩大其他角色行。** 仅修改 `.toe-coastal-roles` 左锚点与可用宽度，复用现有完整面板预留、简化邻接交叠和悬停保持逻辑。仍保持当前回合与悬停角色同时完整显示。
4. **保留动画锚点。** `selfPanelRef`、`data-pid=0`、`data-death-panel=0`、HP/SAN和神力badge标识随真实DOM移动，继续使用动画展示状态；手牌动画锚点不动。验证伤害、回复、神力提示、选中目标、石化、断头台以及表情入口。
5. **验收。** 在16:10、16:9、19:10及手机横屏检查5/12人、己方回合、单完整和双完整状态。特别检查最左两名其他角色展开后的下挂tag与玩家面板顶缘间距，以及多神力/多tag/长说明。核对火把、背景、牌堆、手牌、计数、日志、回合区、提示和按钮的边界与原版一致，无新增页面滚动条。角色范围之外的截图差异仅允许动画时相变化。

## 生成提示词

### 最新间隙与左侧挂靠修正

```text
Use case: precise-object-edit. The supplied full-screen game UI image is the EDIT TARGET. Make ONE narrowly scoped revision only to the own-player information panel on the far left below the other-character row.

USER CORRECTION: The own-player panel currently visually descends from the top character row. It must read as an independent panel ATTACHED TO THE LEFT SCREEN EDGE, clearly separated from the top row by visible open background.

At the supplied 1672x941 image scale:
- The own-player panel currently begins near y174 and ends near y670, x0..190. Lower its upper edge to about y238 (about64px farther down). Keep its lower edge near y670, above the unchanged bottom-left deck-count panel beginning near y713.
- Fill the vacated band with the same underlying dark ocean/sky scene. There must be a CLEAR uninterrupted background gap of approximately60–75px between the leftmost compact-character bars/top-row bottom and the new player panel. No chains, hanging strips, vertical frame extensions or connective decorations descending from the top row.
- Attach the panel's left edge into the screen border: clip only 6–10px of the outermost LEFT METAL TRIM into the viewport edge, with small lateral bronze mounting joints at its upper-left and lower-left. Keep all actual text, portrait face and circular frame fully visible. Its visual anchoring must be from the LEFT, not from ABOVE.
- Preserve the existing player's dark bronze/leather design, name/role, stats, faith and status content. To fit the slightly shorter panel, trim excessive internal vertical margins and reduce the portrait diameter by no more than about10%, always uniformly to remain perfectly circular. Do not shrink the text. Keep continuous HP/SAN bars, SAN60% tick, and the two bone skulls at the divider.
- The player panel remains entirely to the left of the torch, without touching or moving the torch or its hand. Keep it above the existing bottom-left count plate with an open gap.
- This is a repositioning/refinement of ONE panel, not a whole new layout.

LOCK THE REST OF THE IMAGE: absolutely unchanged other-character top row including all eleven character panels and the two full panels; unchanged right turn/pause/settings region, journal, all background outside the vacated small panel area, torch/flame/hand, card piles, all four bottom player cards, hand-count medallion, bottom-left counter, tentacles and bottom-right turn prompt. No global color/brightness change, no zoom, no crop. Do not add labels/arrows/comparison graphics. Output the same complete16:9 screen, only the far-left own-player panel adjusted.
```

### 第一版

```text
Use case: precise-object-edit / ui-mockup.
Input image 1 is the EDIT TARGET: an actual complete 1280x720 screenshot of a Chinese Cthulhu card game. Produce ONE polished production UI mockup of this same COMPLETE SCREEN, same 16:9 crop. This is a surgical CHARACTER UI redesign, not new game concept art.

CHANGE ONLY TWO AREAS:
(A) Remove the player's old wide horizontal portrait/status frame from the upper-left corner, and remove the old long black faith flag hanging below it. Rebuild all of the player's identity, HP/SAN, faith/power description, skull ornaments and status tags as one cohesive NARROW VERTICAL character information panel in the now-empty space to the LEFT of the existing handheld torch. Approximate screenshot coordinates: x=4..170, y=162..518. This panel must be entirely left of the torch flame and shaft, and above the EXISTING bottom-left pile-count panel at y=548. No overlap with the count panel. Do NOT place any part of the player panel back into the top row.
(B) Reflow the OTHER characters' top row into the newly freed upper-left area: use x=18..978, y=0..150. EXACTLY ELEVEN OTHER CHARACTERS TOTAL, in the same left-to-right order as the reference. NINE compact circular portrait panels plus TWO full panels. The second character 贝拉 is hovered and remains FULL with her revealed hand cards and hanging power tag. The fourth character 黛安娜 is the active turn and remains FULL with face-down hand cards. Each full panel is the SAME visual width/height and artwork as in the reference (about164px wide on this screenshot), do not shrink it. Distribute the nine compact portraits across the remaining space: all nine circular faces must be individually visible, at most a SLIGHT overlap, not a single bunched stack. Compact portrait frames stay circular, about60px diameter. Below each compact portrait retain a hand-card logo+count and two plain thin bars: red HP, cyan SAN; NO HP/SAN words and NO numeric stat values on compact panels. Retain small dim bone skulls along the left arc where present. Full other-character panels keep original names, HP/SAN text, cards and skulls. Total count is 9 compact + 2 full = 11; the own player at left is separate. The row must stop before the unchanged right-hand turn/controls area.

NEW PLAYER PANEL DESIGN:
Freely redesign this panel's backdrop, silhouette and typography. A mature restrained dark-fantasy gothic game HUD: tarnished narrow bronze trim, charcoal textured leather/stone inset, tiny worn ornamental joints, soft local warm reflection from nearby torch. Integrate its left edge into the screen edge. NOT a cloth banner, NOT bright parchment, NOT a cartoon beveled widget. One visual grouping with a rounded portrait medallion at its top and thin divider rules, slightly irregular elegant lower contour. Keep circular portrait EXACTLY circular and undistorted. Reuse the player's hat-wearing investigator identity from the reference.
Order top-to-bottom: portrait medallion; a single row '你 · 寻宝者' (role muted cyan); HP 7 and SAN 8 continuous horizontal bars with restrained bone-white labels and values, one unnumbered SAN tick at 60%, no segmented grids; a divider with TWO small dim realistic skull ornaments resting on the edge; '当前信仰'; '烛九阴'; '衔烛照幽 · Lv.2'; a short readable multi-line power description '点亮牌堆顶第2～4张牌。可查看正面，并在翻开前藏至牌堆底。'; then one compact status tag '手牌公开'. Use these as example player states for this mockup. Elegant narrow readable Chinese serif font, restrained ivory and desaturated gold, no tiny decorative filler or neon. Allocate enough breathing room inside the frame. The image must clearly demonstrate usable content, not a blank decorative panel.

LOCK EVERYTHING ELSE TO THE SOURCE:
Preserve the ocean-and-ruin background, its brightness, horizon, pillars and crop. Preserve the entire left hand and torch, exact position/scale/flame. Preserve all three central card piles, their exact positions/perspective. Preserve all four large bottom player cards, their exact printed artwork/text, geometry, fan, count medallion and position. Preserve the bottom-left pile-count panel and numbers. Preserve the entire right-hand turn heading, pause/settings round buttons, parchment adventure log, tentacle relief, bottom-right turn prompt and any action area. Do not resize the right-hand turn panel or controls to fake extra space. Do not move the board/decks/hand toward the new top-row center. No extra objects, no altered gameplay areas. Restore only the small background area vacated by the old player frame/flag. No arrows, no bounding boxes, no annotations, no 'A/B' labels. Show the complete finished screen.
```

### 座次、计数与保留范围校正

```text
Use case: precise-object-edit. Produce one refined full-screen UI mockup, same 16:9 composition.
INPUT 1 is the original game screenshot and the authoritative locked edit target for every NON-CHARACTER area.
INPUT 2 is the new CHARACTER PANEL DESIGN REFERENCE. Retain its successful left-side vertical player portrait/HP/SAN/faith/status panel, but refine the roster arrangement and restore non-character image fidelity.

Keep the new narrow vertical own-player panel to the LEFT of the unchanged torch, above the unchanged bottom-left pile counter, beginning immediately below the top row. Use the design from input 2: round portrait, single-row player name+role, continuous HP/SAN bars, two bone skulls on the divider, readable faith/power area and a status tag. Keep its bronze trim restrained and slightly darker, not shiny yellow. Do not put an own-player panel at the top-left anymore.

IMPORTANT CORRECTION TO THE TOP ROW:
There must be exactly 11 other characters in the ORIGINAL seat order. Input 2 duplicated/misordered the full-panel characters; fix that. Exact sequence from left to right:
1 compact 艾伦,
2 FULL 贝拉 (hovered, public hand and hanging power tag),
3 compact 卡洛斯,
4 FULL 黛安娜 (current turn, cardbacks),
5 compact 伊芙,
6 compact 芬恩,
7 compact 乔安,
8 compact 赫伯特,
9 compact 伊莎,
10 compact 杰克,
11 compact 凯伦.
The full panels take their original source size. Do NOT show a compact duplicate of 贝拉 or 黛安娜. Each compact portrait must show a small hand-card symbol AND an actual readable count numeral, e.g. '▱ 4' (draw the hand symbol graphically), below its circular face. Then two thin continuous red/cyan bars with NO HP/SAN text or stat numerals. Small skulls remain on the left arc.
The following exact design coordinates are measured against a 1200-wide canvas and should scale uniformly with output size:
panel1 x14 width64; panel2 x94 width154; panel3 x264 width64; panel4 x344 width154; panel5 x514 width64; panel6 x570.7 width64; panel7 x627.3 width64; panel8 x684 width64; panel9 x740.7 width64; panel10 x797.3 width64; panel11 x854 width64.
Top row stays at screen top. This gives nine distinct readable compact circles with only mild overlap, and two separate full panels. Right end x918, leaving unchanged right-hand round/menu area.

CRITICAL NON-CHARACTER LOCK:
All areas OTHER THAN the player information panel and other-character row must match INPUT 1, including the exact dark ocean luminance/contrast, starry sky, horizon, ruins, left handheld torch/flame/hand, three piles and cardbacks, all four bottom hand cards and their PRINTED ART, count medallion, bottom-left pile counts, right round-controls header, right parchment journal, tentacles, and bottom-right prompt. Do not globally brighten or repaint them as input2 did. Preserve their pixel-relative geometry, proportions, positions and colors. Do not modify the round-control header to gain space. This is only a character UI relocation/redesign.
No added captions, no arrows, no annotations. Complete game screen.
```
