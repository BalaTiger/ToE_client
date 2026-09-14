# 3 号布局本地实现记录

日期：2026-09-14。状态：已接入本地游戏；未部署、未提交 Git。

## 选定设计与实际素材

采用已确认的 3A 海岸构图和四 DLC 主题样板；群星使用第二版 [stars_call.png](stars_call.png)，第一版仍保留在 `iterations/`。按钮放在玩家手牌右侧，保留四色内部底图，边框和文字控制亮度；SAN=6 仅保留刻度线，当前 SAN 值仍显示。

运行时背景与普通卡背直接调用 [theme.js](../../src/constants/theme.js) 中原有映射，不用生成图替代游戏图片：

| DLC | 环境 | 普通卡背 |
| --- | --- | --- |
| 地神的潜影 | [earth_shadow.webp](../../public/img/bg/battle/earth_shadow.webp) | [cardback_earth_shadow.webp](../../public/img/card/cardback_earth_shadow.webp) |
| 先贤的馈赠 | [sage_gift.webp](../../public/img/bg/battle/sage_gift.webp) | [cardback_sage_gift.webp](../../public/img/card/cardback_sage_gift.webp) |
| 群星呼唤 | [stars_call.webp](../../public/img/bg/battle/stars_call.webp) | [cardback_stars_call.webp](../../public/img/card/cardback_stars_call.webp) |
| 析骨为柴 | [bone_fuel.webp](../../public/img/bg/battle/bone_fuel.webp) | [cardback_bone_fuel.webp](../../public/img/card/cardback_bone_fuel.webp) |

普通暗手牌及普通牌堆使用对应 DLC 卡背。检定牌堆独立使用紫色 [cardback_sancheck.png](../../public/img/card/cardback_sancheck.png)。弃牌顶牌、公开衍生牌继续正面显示；玩家卡面复用原组件与 392:590 比例。这次接入不新增 DLC 规则或解锁尚未开放的牌表。

内置图像生成制作四张 1536×1024 无字素材母图：[面板原图](production-panels-master.png)、[控件原图](production-controls-master.png)、[前景原图](production-foreground-master.png)、[头像原图](production-portraits-master.png)。前三张生成结果是 RGB 棋盘底，使用本地已有 sharp 确定性提取：清除外部中性亮底与棋盘空洞、保留主体连通区域，并对一圈边缘去污染。未安装依赖，提取过程中没有再次绘画。前景保持 1536×1024，其他透明素材裁去余边并保留约 2px 边距；头像保留原深色 RGB 底，切片后输出为 500×500。

共 18 项 WebP 位于 [public/img/ui/coastal](../../public/img/ui/coastal/)，包含 13 项带 alpha 的 UI 素材和 5 张固定席位头像：

- 面板：`self-frame`、`opponent-frame`、`faith-banner`、`log-banner`。
- 动作：`action-skill`、`action-rest`、`action-multiply`、`action-end`。
- 其他：`prompt`、`counter`、`turn-dial`、`hand-count`、`foreground`。
- 头像：`portrait-self`、`portrait-1`、`portrait-2`、`portrait-3`、`portrait-4`。

头像只按展示席位分配：自己固定使用 `portrait-self`，其他角色依席位循环使用 1–4 号。头像选择不读取、跟随或暗示隐藏身份，也不因身份公开而变化。

完整记录：[UI 生产提示词](production-prompts.json)、[UI 切片清单与 SHA-256](production-assets.json)、[UI 提取脚本](../../scripts/extract-coastal-assets.mjs)、[深底检查图](production-assets-dark-preview.png)；头像另见[头像提示词](production-portraits-prompt.json)、[头像切片清单与 SHA-256](production-portraits.json)、[头像提取脚本](../../scripts/extract-coastal-portraits.mjs)。

## 构图与游戏组件接入

[appearances.js](../../src/ui/appearances.js) 新增独立 `id: 'coastal'`，显示名「3号 · 遗迹海岸」。设置中的「界面构图」可即时选择；偏好保存为 `localStorage.toe_ui_appearance`。默认仍为 `arcane-table`，`classic` 继续保留。预览参数 `?ui-appearance=coastal` 不写偏好。UI 构图与 DLC 的 `expansionKey` 分开，切换构图不重置对局。

[CoastalBattleLayout.jsx](../../src/components/battle/CoastalBattleLayout.jsx) 重新摆放原有自己面板、牌堆、日志、其他角色和手牌节点，保留 refs、回调以及动画持有的展示状态。左侧布旗放信仰效果与状态 tag；上方其他角色面板仍显示 HP/SAN、公开衍生牌和暗手牌。角色超过 5 名时仍完整保留，桌面允许重叠，当前回合角色置顶；紧凑屏幕保留横向滚动。

中央保留现有检定、弃牌、普通牌堆图像与交互，原牌堆下方标题在 3 号布局隐藏，但可访问名称与数量保留，计数单独放在左下。提示节点进入手牌操作区。牌面悬停的局部抬起与其他区域原有查看方式继续分开处理。

右侧保持回合面板向左突出、日志右收、动作按钮再次向左伸出的轮廓。暂停与菜单以小图标收在右上侧；菜单直接显示亮度、音乐、音效、界面构图和退出，无需再进入多层设置。打开菜单不暂停对局，单机暂停仍需单独触发；联机不出现暂停入口，教学限制继续保留。

## 所有布局的退出确认

`App.jsx` 的 `requestExitMatch` 与 `confirmExitMatch` 统一覆盖单机头部、暂停面板、3 号菜单、联机、观战以及游戏内放弃重连。确认后才调用原有清理函数；取消不清空对局。联机及观战继续沿用原退出文案与房间清理行为。

确认层高于暂停层。暂停时打开退出确认，取消或按 Esc 只关闭确认，仍保持暂停；只有确认层不存在时，Esc 才恢复单机游戏。正常设置面板打开不会触发暂停或恢复。

## 已完成验证与截图分类

最终检查：全套 Vitest **141 个文件、1736 项测试通过**；`npm run lint` 和 `npm run build` 均以 0 退出。构建仍提示现有单 chunk 超过 500KB，未新增打包依赖。生成的[资源清单](../../public/resource-manifest.json)版本为 `ee37911650d14350`。

聚焦检查覆盖组件与 refs/回调保留、提示并入手牌、零牌堆与动态计数、牌堆标签隐藏后的语义、8 名对手完整排列及当前回合层级、构图选择持久化与 DLC 独立，以及退出确认/取消/Esc/排队动画清理。13 项 UI 素材已验证 alpha，并在深底检查图中人工检查边缘、蜡烛、金属及布料；5 张头像保留 RGB，不含透明通道。

本目录的 `runtime-*.png` 来自浏览器中实际运行的游戏页面，不是图像生成结果：[地神](runtime-earth_shadow.png)、[先贤](runtime-sage_gift.png)、[群星](runtime-stars_call.png)、[析骨](runtime-bone_fuel.png)、[对局菜单](runtime-coastal-menu.png)、[手机布局](runtime-coastal-mobile.png)。`runtime-coastal-initial.png` 是接入初版存档，不作为最终验收图。主题 `.png` 样板与四张 `production-*-master.png` 才是内置图像生成结果。
