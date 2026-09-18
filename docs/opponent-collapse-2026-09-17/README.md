# 多角色简化面板（第一步）

日期：2026-09-17。

## 效果图与来源

先以当前完整对局截图 [before.png](before.png) 调用内置 `image_gen.imagegen` 编辑模式生成效果图，再进行组件实现。生成模式为 built-in；没有外部服务、CLI 或新增依赖。

- 初版：[mockup-v1.png](mockup-v1.png)，原始输出 `E:/Codex/codex-home/generated_images/01a094e6-b663-7ab2-ac74-ac53e4bb49c0/exec-f05a41a5-db5f-4e05-b9c8-a63d8bb19d73.png`。
- 补充头像侧弧骷髅：[mockup.png](mockup.png)，原始输出 `E:/Codex/codex-home/generated_images/01a094e6-b663-7ab2-ac74-ac53e4bb49c0/exec-186cf0a4-c50c-40af-903e-105435a27c9d.png`。
- 后续用户明确：所有骷髅只占同一侧一条弧线，放不下就统一缩小，不能绕到另一侧或续成另一圈；素材略压暗。实装以这条修正为准。

生产界面复用已有灰色头像、等比圆框和透明骷髅素材；手牌标识是小型 SVG 手牌扇形。效果图只作构图依据，不把生成的文字或完整截图切进生产界面。

## 行为与边界

- 其他角色少于 5 名时保持原布局；达到 5 名时，正在执行回合的角色完整显示，其余简化。玩家自己始终完整。
- 采用动画展示状态 `visualCurrentTurn / visualPlayers / displayStats`，不提前显示服务端最终结算状态。
- 简化形态保留圆头像、手牌图标与计数、连续 HP/SAN 条及 SAN=6 刻线。HP/SAN 仅用红色/青色区分，不显示标签和数值；辅助技术仍可读取实时数值。
- 骷髅始终位于头像左侧的同一条 130° 弧线。5 枚以内设计尺寸 10px，更多按圆弧相邻弦长等比缩小；10 枚约 5px。亮度为原素材的 80%，数量不截断，不增加可见数字。
- 悬停区域包括展开后的手牌、状态和邪神标签。离开完整子树才收起。键盘焦点可展开，Escape 收起；触屏第一次点按展开，后续点按仍触发原目标/卡牌交互，点外部收起。
- 仅简化面板之间允许交叠：简化相邻间距最多 6px，空间不足时均匀压缩为负间距；完整面板任意一侧保留 16px，包含外移头像所需空间。当前回合与悬停展开均占完整宽度，当前回合在普通席位上方，悬停区域置于最上方。原弧形布局保留纵向拱形。
- 悬停展开只触发横向重新分配，不改变整排高度，不推移牌堆与玩家手牌。鼠标从原简化区域进入重新定位的完整面板前，临时保留入口命中区域，进入完整面板后立即移除；避免重排导致反复收起。只有当前回合的常驻完整面板按其真实内容保留高度。
- 简化面板保留唯一 `data-death-panel` 和可见 `data-player-hand-strip` 锚点；真实手牌节点在收起时卸载。黏液消失动画找不到实际卡片时回退到计数徽章。
- 死亡截图在首次异步加载截图工具后重新测量同一面板，避免悬停期间切换形态产生尺寸与截图不一致。

## 验证

- 浏览器中检查 4、5、11 名对手；本人回合全部简化，切换到其他角色后对应角色恢复完整。
- 实际指针进入展开角色的邪神标签、亮明手牌，原有大图说明正常出现，面板保持展开；点击空白后收起。
- 记录展开前后牌堆边界相同，未产生布局跳动。
- 3号布局检查 1280×720、1280×800、1520×800、900×600；原经典与弧形布局也检查了完整角色与牌堆间距。
- 简化石化与断头台均通过正式 `useDamageAnimationEffects` 获取截图，运行时 `data-snapshot-count=1`，已截取播放帧；另有队列 readiness 和新尺寸竞态回归测试。
- 2077 项 Vitest 全通过，ESLint、生产构建通过；构建仍有既有大 chunk 提示。

可复现入口：`?ui-gallery=1&scene=battle-opponents-11&ui-appearance=coastal`。开发场景可切换当前回合、播放断头台/石化；11号角色带10枚骷髅用于缩小验收。添加 `&clean=1` 隐藏验收控件。

实装截图：[完整画面](implemented-11.png)、[标签悬停](expanded-tag.png)、[亮牌悬停](expanded-card.png)、[石化](petrify.png)、[断头台](guillotine.png)。

### 重叠与纯色状态条修正

- 原先完整面板也参与负间距分配，且简化头像内侧留白抵消了大部分重叠；现在完整面板保留独立宽度，负间距仅分配给简化相邻面板，圆头像从50px等比放大至56px。
- 修正截图：[一名当前回合角色](overlap-fixed.png)、[黛安娜回合且贝拉展开](two-full-overlap-fixed.png)。后者右侧简化面板高度重叠，未缩小回合面板；这是当前顶部可用宽度下的最拥挤情况。
- [真实12人对局截图](real-12-two-full.png)：芬恩执行回合，指针停留在贝拉区域，两个完整面板同时显示。通过临时开发初始化创建12人单人对局，沿正常身份选择、探索、结束回合和AI流程进入；截图后已移除临时初始化，生产默认人数不变。
- 浏览器确认简化条的标签与数值均为 `display:none`，色条底部仍在死亡截图根边界内；进入展开标签后保持展开，离开完整区域后收起。单元测试222项、ESLint及生产构建通过。

## 原始生成提示词

### 初版

Use case: ui-mockup.
Edit target: the provided screenshot of an actual dark Cthulhu card game. Produce ONE polished full-screen implementation reference, same 16:9 landscape composition. Change ONLY the opponent row along the top between the player's panel at left and round/pause/settings panel at right. Keep all other game UI, cards, sea background, torch, logbook, fonts, subdued weathered gold/teal art style unchanged.

Redesign that top row to fit ELEVEN other characters. One active-turn character near the middle stays a complete, normal rectangular panel with original proportions: round portrait medallion, one-line name and profession, HP and SAN continuous bars, real card backs and face-up cards in its hand, small hanging status tags. The remaining TEN characters collapse into very slim portrait badges, each with the EXISTING dark bronze circular portrait ring, a small fan-of-cards ICON with a clear hand count (such as 3,4,5) attached below the portrait, followed by two short horizontal HP and SAN bars directly beneath. Preserve circular portrait aspect ratios. Collapsed badges do not show their full cards, names, professions or tags. The badges have subtle solid dark weathered backing below the ring, not rectangular big panels. The bars and counts remain crisp and can be recognized at game scale. The narrow badges may slightly overlap adjacent badge outer ornaments from left to right so all eleven seats fit. The active complete panel takes about twice a collapsed badge width.

Show a second inactive character hovered: its complete original panel expands down and sideways above adjacent badges, without shifting the row, attached to the same portrait position. It displays its name, HP/SAN, hand cards and hanging status tags. Place a small mouse cursor on one hanging tag as a visual demonstration that this expanded panel stays open while browsing its contents. Its top edge is aligned with the row and its lower tags must remain above the card piles. Use warm restrained outline emphasis, no neon.

Player's own full panel at upper left MUST remain unchanged. The other eleven portraits are neutral people in existing dark portrait style (repeat existing portraits is okay). Same normal frame artwork proportions, same discreet antique serif letters. No modern flat UI, no cartoon, no new bottom controls, no additional big text/callouts, no re-layout anywhere outside the top opponent strip. This is an implementable screenshot edit, not a concept painting.

### 骷髅修订

Use case: precise-object-edit.
Edit only the top row of slim opponent portrait badges in this game UI mockup. Keep the entire existing full-screen image, composition, dark realistic weathered metal art style, sea background, full-size active player panel and all other UI unchanged.
Correction: the collapsed portrait badges MUST retain the character's skull markers. Add small realistic bone skull ornaments pressed ONTO THE LEFT SIDE of each circular portrait frame, following its circular arc. Show varied counts: a few portraits with no skulls, others with one, two, three or four small skulls. These are physical bone skull graphics, not emoji and not numerals. They straddle the left arc of the bronze ring and do not replace the lower hand-count badge or the two horizontal HP/SAN bars. Keep them small but distinguishable. For one badge show 7 skulls arranged in two close arcs along that same left side, without a number. Keep circular rings truly round. The player's own full panel at top left and the expanded full normal panel retain their existing bottom-edge skull decoration. Change nothing else. Output the finished complete game screenshot mockup.
