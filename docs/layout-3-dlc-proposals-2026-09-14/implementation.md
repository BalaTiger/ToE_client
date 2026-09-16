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

## 布料与场景边缘融合修正

桌面 tag 与日志的布料改为 `CoastalBattleLayout` 内独立、不可交互的装饰层，保持素材自然比例，上端藏入玩家角色框／回合星盘后方，外侧出屏。层级为布料 `-2`、骷髅触手前景 `-1`、原有交互区域；不能通过抬高整张前景来遮挡布料，以免覆盖手牌。角色受击、死亡等内容层效果不再改变场景布料的叠放顺序。最初的窄屏 Grid 方案已由下述安全画布替代，当前所有窗口都保留独立布料与同一构图。

tag 的可读区域止于骷髅上方，长信仰描述、状态和累积区域牌在同一可键盘操作的区域内滚动，子项不压缩。`battle-coastal-many` 样板增加四张累积区域牌，用于检查滚动末尾与底部边界。

本轮验证：41 项相关测试通过；移动区域牌后复查 5 项面板测试，lint、生产构建通过。浏览器检查 1600×900、2548×1303 和 390×844；[桌面截图](drapery-desktop.png)、[区域牌滚动检查](drapery-tags-scroll.png)、[层级与尺寸记录](drapery-measurements.json)为本轮实装结果。

## 安全窗口比例

3 号布局的画布宽高比限制在 **16:10～19:10（1.6～1.9）**，范围定义于 [coastalViewport.js](../../src/components/battle/coastalViewport.js)。范围内填满窗口；过宽时停在 19:10 并左右留 HTML 深色边，过高时停在 16:10 并上下留边。游戏画布始终居中，内部使用 1200px 逻辑宽度和同一个等比缩放系数，窄屏不再切换为纵向 Grid。其他布局继续沿用原响应式行为。

背景与出框装饰裁在画布边缘，背景伪元素不扩大可滚动范围。暂停／菜单图标跟随画布右上锚点；设置面板与暂停、退出确认层仍使用真实窗口尺寸，保持可操作。卡牌动画的 DOM 坐标补偿改为读取当前画布的实际 zoom，并保留居中留边偏移。

验证：全套 **144 个测试文件、1778 项测试通过**，lint 与生产构建通过；资源清单内容版本保持 `5c4c9d55f6e9fe1d`。浏览器检查 1600×900、2560×720、900×1200、390×844、844×390，画布均满足范围、双轴等比且普通对局无额外滚动。实装截图：[标准窗口](safe-viewport-desktop.png)、[超宽窗口](safe-viewport-wide.png)、[竖长窗口](safe-viewport-tall.png)、[手机竖屏](safe-viewport-mobile.png)。

## 其他角色紧凑面板（2026-09-15）

其他角色外框恢复素材原始 **458:390**，使用独立固定比例的 `toe-opponent-core`；姓名、HP/SAN 同行条和手牌排列在框内。四名对手时逻辑高度约 126px，1600×900 窗口显示约 168px。手牌移到数值条下方，保留公开衍生牌、暗手牌与选牌交互。

圆形头像框直接复用现有 `hand-count.webp` 的旧铜圆环，外层按素材 **439:448** 等比显示，内层头像保持 **1:1**。不新增图片，不通过拉伸素材匹配内容。匿名头像仍按席位分配。

神力、遭遇次数、虚化、中毒与休息标记在外框下方正常流排列；神力压为「能力名 · 等级」，遭遇改成单个骷髅加次数，保留原详情及动画锚点。区域牌仍用可预览的卡牌组件放在下栏。挂签高度计入其他角色区域，供牌堆避让；教程测量的状态容器保留真实盒尺寸。

全套 **144 个文件、1781 项测试通过**，lint、生产构建通过。实际浏览器检查四人面板、满状态与区域牌、十一人重叠、窄屏和神力详情。[实装全图](opponents-compact-desktop.png)、[满状态](opponents-compact-tags.png)、[满员窄屏](opponents-compact-crowded.png)。

## 圆框融合、灰底头像与窄体数字（2026-09-15）

其他角色圆环移至面板左缘外侧，略微出框并与上缘装饰衔接；姓名下增加细旧铜分割线。环框继续保留 439:448、内层头像 1:1、面板核心 458:390，手牌与下挂状态沿用紧凑布局。

四张匿名头像用图像生成保留原人物并改成灰色旧纸／灰泥纹理背景，以 500×500 WebP 独立接入。原图保留，来源记录见 [gray-portraits.json](gray-portraits.json)。

3 号布局 UI 拉丁字母与数字使用本地 Roboto Serif 原生窄体（wdth 50、光学尺寸 12、字重 350）；数字 1 保留斜旗形笔头，不与 I 混同。中文延续思源宋体／Noto Serif SC 的常规字重回退，卡牌图不变。字体不做横向 CSS 拉伸；[SIL OFL 许可](../../public/fonts/RobotoSerif-OFL.txt)随资产一并保留。

本轮 42 项相关测试、lint 和生产构建通过；资源清单版本 `7f67a2f1538b76fe`。浏览器检查 1600×900 与 844×390、十一名其他角色重叠及当前回合置顶；头像尺寸实测保持 1:1，无页面错误。[最终实装图](opponents-gray-frame-desktop.png)、[窄窗口满员检查](opponents-gray-frame-narrow.png)。

## 标题与数值区留白校准（2026-09-15）

圆框外移后，其他角色框内改为左右 8cqw 留白，标题与 HP/SAN 共用右侧起点；顶部留白 14cqw，数值行各 10cqw、行间 1.5cqw。保持外框原比例，并将手牌槽适配新的内边距。玩家姓名／职业并排，标题下补细铜色分割线；其他角色已公开职业恢复完整文字。职业颜色由 RINFO.col 提供，不再被 3 号布局的统一墨色覆盖；隐藏职业继续不渲染。长姓名在同行剩余空间内省略。

37 项相关测试、lint、生产构建通过；桌面与窄窗口检查姓名／职业同排、主题色、数值条留白及圆形比例。[实装截图](opponents-title-spacing.png)。

## 玩家面板收窄与条文间距（2026-09-15）

玩家容器由 284px 收至 260px，底图整体由 340px 等比缩到 316px，保留 806:364；头像缩到 60px 正圆并重新对齐，姓名／职业和分割线、HP/SAN 行同步内收。原底图可直接复用。其他角色区域左移 24px、宽度由 606px 增至 630px，右边缘不动。

其他角色 HP/SAN 的文字槽与条间 gap 从 1.5cqw 增为 3cqw，标签／数值槽分别为 13cqw／8cqw，防止双位数字贴边。1600×900 实测最小槽间距约 6.1px，轨道使用已有 border-box；窄窗口与十一名其他角色检查通过。37 项相关测试、lint、构建通过。[实装图](panel-width-and-stat-gaps.png)。

## 面板边缘安全留白（2026-09-15）

按用户澄清处理内容贴框问题，保持原有行距。玩家底图及对应圆形头像整体下移 6px、标题稍向内移，SAN 下方留出安全余量；底图依然 806:364 等比。其他角色内边距改为上 16cqw／下 8cqw，手牌条居中缩窄 8cqw，保留卡牌原比例，避免牌底贴框。既有横向尺寸、条文水平间距、隐藏职业规则均保留。

37 项相关测试、lint、构建通过；桌面与窄窗口验收。[最新实装图](panel-edge-insets.png)。

## 姓名职业上沿定位修正（2026-09-15）

玩家标题改为 60px 网格行内底对齐、下留 4px，显式覆盖短桌面模式的行内 alignItems:center；数值行区 40px，总高度不变。其他角色标题区上内边距由 16cqw 增至 20cqw，数值行各 8cqw，保持原底框和手牌位置。实际桌面检查标题行下移、分割线与 HP 无重叠，窄窗口同样生效。37 项相关测试、lint、生产构建通过。[当前截图](panel-heading-inset.png)。

## 持续场上效果与桌游骰子（2026-09-15）

3 号布局将石化配方进度、长夜进度、廷达罗斯猎犬时限集中到其他角色下方、牌堆左侧的窄列。效果逐项纵向排列，只在生效时占位；上端跟随角色区实际下缘，下端高度计入手牌缩放预算，预留悬停抬牌距离。石化使用骰面配合「石化配方／进度 N」，其他效果以圆形标记、短标题和数值呈现。旧布局的位置不变，3 号布局移除旧位置，避免重复显示。

仍保留长夜动画快照、教程与日蚀演出的显示条件。衔烛照幽的点亮牌继续挂在牌堆，检定／牌堆／弃牌锚点及首个图像子节点保持原结构，抽牌和弃牌动画继续使用同一锚点。

共享 DiceFace 改用内置 image_gen 生成的透明深青树脂骰体，已保存为 [die-resin.webp](../../public/img/ui/coastal/die-resin.webp)。原始图、完整提示词和转换参数记录在 [die-resin-generation.json](die-resin-generation.json)。骰体等比显示，象牙色凹刻点数由代码叠加；仍为 D6，不修改随机结果、单／双骰规则、结算或动画时序。石化进度与所有掷骰演出复用同一骰面。

全套 **145 个测试文件、1792 项测试通过**，lint、生产构建通过；资源清单版本 `861732056c2ae9c5`。浏览器检查三效果与七张点亮牌同时存在、1600×900 桌面及 844×390 窄窗口，无页面溢出；窄窗口效果列与未悬停手牌的最小间距约 29px。双骰显示 4／6 点并正确结算取 6，浏览器无错误。新增图库场景 `battle-coastal-effects`、`dice-rest`、`dice-single` 供后续复核。

[场上效果实装](board-effects-desktop.png) · [窄窗口](board-effects-narrow.png) · [桌游骰子演出](tabletop-dice.png)
