# 3A 布局 · 四个现有 DLC 主题
日期：2026-09-14。每个现有主题一张效果图。使用内置 image_gen，逐组输入游戏已存在的环境底图、普通卡背及当前选定的 3A 构图。

**最新状态（2026-09-14）：已应用到本地游戏。** 3 号布局注册为独立 `coastal` 外观，可在「界面构图」选择，默认仍保留原 `arcane-table`。群星主题采用第二版 [stars_call.png](stars_call.png)；运行时继续直接使用原环境、卡背与卡面。实现、素材提取和验证记录见 [implementation.md](implementation.md)。本轮未部署、未提交 Git。

后续修正已接入：统一字体比例、手牌与牌堆共同自适应锚点、两枚专用系统图标。最新实机截图及验证见 [refinement-2026-09-14.md](refinement-2026-09-14.md)。

最新构图调整：玩家框、顶部角色面板与星盘已强化出框及贴边效果，见[边缘融合记录与实机图](edge-anchoring-2026-09-14.md)。

| 主题 | 效果图 | 环境源文件 | 普通卡背源文件 |
| --- | --- | --- | --- |
| 地神的潜影 | [earth_shadow.png](earth_shadow.png) | [earth_shadow.webp](../../public/img/bg/battle/earth_shadow.webp) | [cardback_earth_shadow.webp](../../public/img/card/cardback_earth_shadow.webp) |
| 先贤的馈赠 | [sage_gift.png](sage_gift.png) | [sage_gift.webp](../../public/img/bg/battle/sage_gift.webp) | [cardback_sage_gift.webp](../../public/img/card/cardback_sage_gift.webp) |
| 群星呼唤 | [stars_call.png](stars_call.png) | [stars_call.webp](../../public/img/bg/battle/stars_call.webp) | [cardback_stars_call.webp](../../public/img/card/cardback_stars_call.webp) |
| 析骨为柴 | [bone_fuel.png](bone_fuel.png) | [bone_fuel.webp](../../public/img/bg/battle/bone_fuel.webp) | [cardback_bone_fuel.webp](../../public/img/card/cardback_bone_fuel.webp) |

全部背景源文件均为 795×490，普通卡背均为 392×590。四组映射来自 src/constants/theme.js 的 BATTLE_BACKGROUND_BY_EXPANSION 与 CARD_BACK_IMAGE_BY_EXPANSION。部分主题尚未在游戏内完整开放，但其已有图片均纳入本轮设计。

## 沿用标准
- 构图基准：[最新 3A 主画面](../layout-3-proposals-2026-09-14/layout-3A-piles-controls-no-captions.png)。
- 普通暗手牌、右侧主牌堆及弃牌堆露出的背面使用同组主题卡背。
- 左侧检定牌堆保留独立的紫色 cardback_sancheck.png，不跟 DLC 替换。
- 弃牌顶牌与公开衍生牌保留正面，玩家手牌保持游戏既有深色设计及 392:590 比例。
- 左下保留计数；三牌堆和暂停/菜单图标下方不再加文字。
- SAN=6 只保留刻度线，不加独立数字；当前 SAN 数值正常显示。
- 保留右侧四按钮的内部区分色及压低后的边框、文字亮度。主题环境不将四个按钮染成同色。
- 菜单关闭，暂停/菜单仅显示图标，3A 构图与 DLC 主题仍是两个独立维度。
- 5 张装饰头像按固定展示席位分配，不跟随或暗示玩家隐藏身份。

## 设计阶段交付边界（历史记录）
效果图交付阶段只新增效果图和设计记录，没有修改运行代码、资源映射或游戏默认设置；当时用户已同意补充退出确认，并要求待效果图完成后再应用。随后用户授权实装，现已完成上述本地接入，所有布局共用退出确认。

图像生成对输入素材有细节复现和重绘，以上是主题构图样板，不替代源文件。实装已直接调用表中原始环境图、卡背与现有卡面组件，没有从生成图中重新切出卡背或动态卡牌。各图使用同一示例对局状态以便比较，不代表四个 DLC 的完整牌表均已实现。

## 生成记录
- [prompts.json](prompts.json)：四主题完整提示词与实际输入路径。
- [stars-discard-correction-prompt.json](stars-discard-correction-prompt.json)：群星弃牌顶牌正面局部校正。
- iterations/stars_call-initial.png 为修正前中间图，不作为最终交付。
- [production-prompts.json](production-prompts.json)：内置图像生成制作三张无字生产素材图的完整提示词。
- [production-assets.json](production-assets.json)：13 项透明 WebP 素材、原图、切片坐标、处理参数及校验值。
- [extract-coastal-assets.mjs](../../scripts/extract-coastal-assets.mjs)：使用现有 sharp 运行时去除棋盘底、切片并导出 WebP，不重绘素材。
- [production-assets-dark-preview.png](production-assets-dark-preview.png)：素材导出后的深底检查图。
- [production-portraits-master.png](production-portraits-master.png)：第四张无字生成母图，用于提取 5 张固定席位头像。
- [production-portraits-prompt.json](production-portraits-prompt.json)：头像完整提示词与参考输入。
- [production-portraits.json](production-portraits.json)：头像切片清单、尺寸与校验值。
- [extract-coastal-portraits.mjs](../../scripts/extract-coastal-portraits.mjs)：头像 RGB 切片及 WebP 导出脚本。

实装合计使用四张生成母图导出的 18 项 WebP：13 项透明 UI 素材与 5 张 RGB 头像。头像只按展示席位选择，不读取隐藏身份。

`runtime-*.png` 是浏览器中真实游戏页面的截图，与上表生成效果图区分：[地神](runtime-earth_shadow.png)、[先贤](runtime-sage_gift.png)、[群星](runtime-stars_call.png)、[析骨](runtime-bone_fuel.png)、[菜单](runtime-coastal-menu.png)、[手机](runtime-coastal-mobile.png)。`runtime-coastal-initial.png` 留存接入初版，不作为最终验收图。
