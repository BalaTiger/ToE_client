# 界面构图接口

当前仅提供 **遗迹航路**，内部 ID 与样式类型均为 `coastal`。`UiAppearanceProvider` 在 `main.jsx` 包裹整个应用；视听设置仍保留「界面构图」入口，注册、即时切换和偏好存储机制不变，偏好单独保存为 `localStorage.toe_ui_appearance`。布局不修改拓展包、规则主题或游戏状态。

```jsx
import { useUiAppearance } from './UiAppearance';

const { appearance, appearances, setAppearance } = useUiAppearance();
setAppearance('coastal');
```

`?ui-appearance=coastal` 可预览当前构图。URL 只决定首次加载，不写入偏好；页面内切换即时生效，刷新后带参数的 URL 再次优先。已退役的 `classic`、`arcane-table`、其他未知 ID，以及缺失或不可用的存储，均安全回退 `coastal`；调用 `setAppearance` 时只保存解析后的有效 ID。旧布局代码及其专用桌台、浮雕和按钮素材已删除，不能依靠旧 ID 恢复它们。

扩展包环境图、普通卡背、检定卡背、颜色与探索运镜仍由 `src/constants/theme.js` 按 `expansionKey` 决定。保留地神步行与群星行船的不同配置；不得因只剩一种构图而合并主题或统一运镜。对局菜单包含亮度、音乐、音效、界面构图和退出入口；单机另有暂停按钮。打开菜单不会暂停对局。退出仍需二次确认，暂停时取消确认或按 Esc 只关闭确认，仍保持暂停。初版布局的历史实现见[实现记录](../../docs/layout-3-dlc-proposals-2026-09-14/implementation.md)。

## 加入新构图

在 `appearances.js` 的 `UI_APPEARANCES` 数组加入一个条目，设置 `id`、`label`、`battleLayout`、`assets`、`cssVariables`。条目会自动出现在设置列表中；保留该机制用于后续构图试验，不重新引入已退役布局。

- `battleLayout`：Provider 写入根节点的 `data-ui-layout`。当前实现使用 `coastal`；沿用角色、手牌及系统控件样式的变体可保留此值，独立样式用 `data-ui-appearance` 区分。全新类型须提供自己的样式和 `BattleLayout` 组件。
- `assets`：`panelSurface`、`panelFrame` 为共用面板；`skill`、`rest`、`multiply`、`end` 为动作按钮。路径使用 `/img/...`，消费图片时用 `buildPublicUrl` 兼容 H5 相对路径。旧桌台专用的 `handTable`、`reliefLeft`、`reliefRight` 已退出资源接口。
- `cssVariables`：全局 CSS 自定义属性，覆盖现有 `--toe-ui-*` 等令牌。Provider 把属性、`data-ui-appearance="方案 ID"` 和 `data-ui-layout="布局类型"` 放在 `document.documentElement`，因此 body portal 中的弹窗、动画也适用。切换时清理上一方案独有变量并恢复属性。
- `BattleLayout`（可选）：直接导入的 React 组件，用来替换战斗区整体构图；未提供时使用 `CoastalBattleLayout`。组件收到已绑定原有规则、回调和动画引用的 `{ opponents, middle, prompt, hand, effects }` React 节点，以及 `{ turn, turnLabel, counts, compact, width, height, paused, sceneShake, sailingEnabled, sailingActive }` 展示参数；`counts` 含 `inspection`、`deck`、`discard`。每个节点只渲染一次。布局外保留安全视口、统一棋盘缩放、系统控件及遮罩宿主；不要在替换组件内再渲染这些控件。可独立渲染 `prompt`，或用 `cloneElement(hand, { phasePrompt: prompt })` 将提示并入手牌操作区，不能重复渲染。

[CoastalBattleLayout](../components/battle/CoastalBattleLayout.jsx) 将 `middle` 的三个现有子组件（自己、牌堆、日志）分别放入遗迹航路，保留各组件的 refs 和回调。其他角色不足5名时使用 `CoastalOpponents`，达到5名时使用 `OpponentRoster` 的简化／展开面板。完整构图试验复用这些节点，避免复制规则渲染或建立第二份对局状态。

遗迹航路素材位于 `public/img/ui/coastal/`。初版无字母图、切片及头像的历史记录见[生产提示词](../../docs/layout-3-dlc-proposals-2026-09-14/production-prompts.json)、[素材清单](../../docs/layout-3-dlc-proposals-2026-09-14/production-assets.json)、[提取脚本](../../scripts/extract-coastal-assets.mjs)；头像记录见[母图](../../docs/layout-3-dlc-proposals-2026-09-14/production-portraits-master.png)、[提示词](../../docs/layout-3-dlc-proposals-2026-09-14/production-portraits-prompt.json)、[切片清单](../../docs/layout-3-dlc-proposals-2026-09-14/production-portraits.json)、[提取脚本](../../scripts/extract-coastal-portraits.mjs)。当前侧栏、按钮和日志使用下文记录的更新素材。头像按固定展示席位分配，其他席位循环使用四张人物图；不读取或跟随隐藏身份，身份公开也不改变头像。

复用现有组件样式的示例条目（追加到注册数组）：

```jsx
import { AlternateBattleLayout } from './AlternateBattleLayout';
import './alternate.css';

{
  id: 'alternate',
  label: '试验构图',
  battleLayout: 'coastal',
  assets: {
    panelSurface: '/img/ui/interface/panel-surface.webp',
    panelFrame: '/img/ui/interface/panel-frame.webp',
    skill: '/img/ui/coastal/action-skill-b.webp',
    rest: '/img/ui/coastal/action-rest-b.webp',
    multiply: '/img/ui/coastal/action-multiply-b.webp',
    end: '/img/ui/coastal/action-end-b.webp',
  },
  cssVariables: { '--toe-ui-accent': '#c4b7a0' },
  BattleLayout: AlternateBattleLayout,
}
```

布局组件保持动画定位引用和交互回调；不要复制游戏状态、重新计算 HP/SAN 或改写 `expansionKey`。共用样式使用 `[data-ui-layout='coastal']`，方案独有样式使用 `[data-ui-appearance='alternate']`。方案切换可能重建装饰／布局节点，不能给顶层 `App` 加 appearance key，否则会重置对局。主题运镜与浪花是否启用由 `BattleScreen` 根据 `expansionKey` 传入，替换布局不能自行根据布局 ID 推导主题。

## UI 素材比例与验收

**带有圆形设计的 UI 不改长宽比。** 此规则适用于所有构图，包括带圆形头像框的玩家面板、星盘、圆环、徽章和圆形按钮。面板整体虽为长方形，只要圆形装饰已画在同一张素材内，就必须保留整张素材的原始宽高比。

- 以素材实际像素尺寸确定比例；优先只设定一个缩放轴并配合原始 `aspect-ratio`，或使用保持自然比例的 `img`。外层容器需要独立宽高时，图片使用 `object-fit: contain`，背景使用 `background-size: contain`，并明确锚点。
- 禁止独立计算不符合素材比例的宽高、使用不同的 `scaleX` / `scaleY`，或用 `object-fit: fill`、`background-size: 100% 100%` 拉伸这类素材。媒体查询、全局缩放与布局切换也必须遵守同一比例。
- 装饰层与内容层分别定位。需要贴边或超出画面时，使用位移和裁切保留既定构图；容器比例不匹配时允许留空。不得通过拉伸圆形消除空隙。姓名、HP/SAN 条、SAN 刻度和可操作控件须保留安全边距，不能随装饰一起被裁掉。
- 修改相关素材、尺寸或断点后，至少检查宽桌面和窄屏各一档实际游戏画面。核对渲染图片的横纵缩放倍率一致、圆形仍为圆形，以及内容可读且按钮可操作；同时检查超框位置，不能仅凭组件容器的尺寸判定通过。

遗迹航路其他角色面板的 `toe-opponent-core` 与外框固定为素材原始 458:390，头像圆环复用 `hand-count.webp`（439:448），头像单独保持 1:1。框下挂签与区域牌参与正常流测量，不能撑长框图；`data-player-god-status` 等供教程和动画定位的节点须保留非零矩形。

### 遗迹航路布局右上角 B 方案

2026-09-16：用户选定的 B 方案已实装，使用 `corner-b-header.webp`、`corner-b-journal.webp`、`corner-b-control.webp`，不复用被否决版本的素材。生成、切片与实装验收见[B版记录](../../docs/coastal-corner-b-2026-09-16/README.md)。

[`COASTAL_CORNER`](../components/battle/coastalGeometry.js) 同时定义回合栏和视口固定按钮的逻辑坐标：栏宽292、top −3、right −22；按钮54×54、间距8，各自的独立 SVG 图标30×30。两个按钮共用圆底图，不能以字符替代图标或分别缩放。外框按2144:590自然比例显示，按钮保持1:1；固定按钮位置由安全视口与相同构图倍率换算，不能另用窗口百分比估算。

日志宽224、top92、right −12；完整底图保持975:1407，书高 `bookHeight = 224 / (975 / 1407)`。内容容器高为 `min(bookHeight, controlsTop - logTop - 4)`，棋盘高度预算保证至少160。增加繁衍等操作只缩短可滚动内容区，不挤窄书页、不缩小文字、不拉伸中段扣带的圆铆钉。padding 顶部为 `bookHeight × .12`，左右分别为书宽的27%和11.8%，底部为 `max(16, logHeight - bookHeight × .78)`。

书页装饰层为 `-2`，既有触手与持火把前景为 `-1`，日志内容层为 `10`；只裁掉书页超过 `logHeight + 18` 的底部，使其隐入提示栏及触手后面。纸页在运行时统一 `brightness(.78) saturate(.7)`，不改素材颜色。日志标题17、正文13.5，使用深褐色文字；标题位于滚动区外，`logRef` 必须继续绑定真正滚动的 `[data-log-panel]`。修改时验收1920×1080、1520×800含繁衍操作及1600×1000联机状态，并遵守下方系统控件的动效与遮罩边界。

## 卡牌纵深与飞行定位

卡面、静态卡背和动态卡背帧均保持 `392:590`。卡背背景和帧图使用 `contain`；不能用旧飞牌 `82:108`、`70:94` 等容器比例裁切或拉伸素材。飞行只允许统一的 `scale`，不分别改变横纵倍率。

其他角色手牌为远景，牌堆为中景，玩家手牌为近景。玩家手牌继续以可读性和现有扇形空间为准；牌堆优先利用包装留白放大，遗迹航路布局在空间足够时以手牌宽度的约68%为目标，高度不足时先保证牌堆与悬停手牌间距。不得放大牌堆外包装冒充卡面放大。

`utils/dom.js` 的 `getPlayerHandCardAnchor`、`getPileCardAnchor` 和 `getCardElementAnchor` 返回视口中的中心、原比例宽高和旋转角。牌堆锚点必须落在真实顶牌（含空堆占位），手牌尽量按卡牌ID定位；测量时排除标签、堆叠留白，并消除扇形旋转造成的包围盒增宽。弹窗退出前保留该张决策卡的本地锚点，不能用旧屏幕百分比估算。

所有牌堆／手牌间移动使用 `getCardFlightStyle`，按起终点宽度插值并在末帧抵达实际目标。洗牌、对决等额外阶段也要衔接这些端点，保持原有队列提交和时长。`?ui-gallery=1&scene=flight-self-discard` 等四个飞行样板支持重播与0～100%定格，可跨布局、主题检查首尾中心、宽高比和远近变化。

### 卡牌的伪 3D 平面

三个牌堆共用一个 `data-pile-camera`，透视距离为 `max(600px, 容器宽 × 1.6)`、透视中心为容器正中；内部唯一的 `data-pile-table` 整体 `rotateX(45deg)`。不得给各个牌堆独立设置 perspective，否则它们无法形成同一桌面。单牌仅按实际堆高 `translateZ` 并保留原平面旋转，前侧及左右侧纸边随牌数形成真实厚度。中间祖先保持 `preserve-3d`；计数、石化等效果与装饰在相机外保持正面。

普通牌堆和检定牌堆的所有牌层使用相同XY位置、0°平面旋转，按Z高度堆成方柱；只有弃牌堆保留错位及旋转。遗迹航路布局的相机中心固定为 `width * .5125 - 12`（1200逻辑宽时603），保留玩家侧栏迁移前的棋盘轴线。顶部角色行已向左扩展，不能再以新的角色行中心移动牌堆。窗口变化和安全比例留边仍通过统一棋盘缩放处理。

卡牌模型仍为392:590。透视产生近端较宽、远端较窄及左右汇聚的轮廓，这是平面的投影，不是素材拉伸；不能拿投影后的包围盒宽高比反过来重做卡背。该效果仅用于卡牌，角色圆框、星象盘等正面UI继续保持原比例和圆形轮廓。统一倾角位于 `utils/cardPlane.js`。

`data-pile-table` 的 `--toe-table-tilt` 以及单牌的 `--toe-card-depth`、`--toe-card-rotation` 与实际变换同步。`getCardElementAnchor` 根据相机、原卡宽及四角投影反求平面中心，`projectTableCard` 返回精确的投影矩阵参数。锚点携带 `projection`，必须随 `paths` 等动画参数完整传递，不能只拷贝位置和倾角，也不能把包围盒中心当作卡面中心。

`CARD_FLIGHT_POSE` 的首尾先等比缩放再应用该端点的投影矩阵，使飞牌与共享桌面上的真实顶牌完全吻合。中段使用独立透视和Z位移：由远至近向屏幕外抬起，由近至远向内收；X倾角限制在-16°至32°、侧倾不超过6°，保证卡面可辨认。对决中央阅读阶段恢复正面。需要放大公共飞牌容器时使用 `getCardFlightStyle(from, to, minimumWidth)`，不得事后单独覆盖宽高或缩放变量而破坏矩阵基准。动画不改队列时长或提交时点。

## 主界面固定构图

2026-09-15：主界面主体保持 **1490×1056** 设计舞台，标题、副标题、职业与规则区、主操作均使用固定设计坐标和统一等比缩放。PC 竖屏按实际可见主体的 **960px** 宽度适配，忽略舞台左右各265px空白；[`getStartScreenScale`](../components/start/startScreenGeometry.js) 同时限制主体宽度、原舞台高度比例和底部辅助按钮安全区。宽度受限时主体左右各留16px，底部边界按设计坐标 `y=935` 计算，不能覆盖页脚。无按宽高比重新排列主体的断点；不得分别调整标题、职业图标、按钮底图或内部文字的缩放倍率。

“古神沉眠之时”介绍完整保留为两个固定行，每行禁止自动换行；主界面显式设置 `text-size-adjust: 100%`，避免移动浏览器单独放大文字。宽高比变化只通过统一舞台缩放与外围背景展示范围适配，不把介绍重新排成三行。背景独立使用现有 `bg_main.webp`，以 `cover`、`center top` 铺满窗口，不随舞台一起缩放。

辅助控件不随主体舞台定位或缩放：Debug 按钮组固定网页左上，距左、上各14px；视听设置触发器固定正上居中、上距0；关于作者和版本更新计划按钮分别固定左下、右下，距边缘各14px。它们由 `getStartScreenControlScale` 使用独立缓变曲线，常规倍率为 `clamp(0.92, 0.9 + min(vw, vh) / 10000, 1.12)`；极窄窗口额外按 `(vw - 40) / 520` 限制两只页脚按钮总宽度。Debug 可在左上区域折行，不得侵入正中的设置按钮。辅助按钮自己的底图和文字仍使用同一倍率，不能单独缩字。

设置、关于作者、版本计划、联机选项、断线遮罩及 toast 保持视口坐标，不进入缩放舞台；设置弹窗最大高度扣除触发器的高度和底部留白。移动端继续使用下述固定横屏 iframe，菜单按 iframe 内部逻辑尺寸计算，翻转不重建应用。新增缩放验收须包含617×1009竖屏、400px窄窗和900×474低矮窗口，检查主体比例、两行介绍、四角锚点及按钮之间无交叠；不能再以空白舞台四角全部位于视口内作为通过条件。

职业与主按钮复用三张无字环境底图，规则面板使用第四张底图，均由内置 imagegen 生成。既有边框真实裁为四角和四条窄边，避免原九宫格边条带入内侧黑色填充。素材提示词、裁切坐标与首版验收见[主界面实现记录](../../docs/start-screen-fixed-2026-09-15/README.md)，后续缩放和锚点调整见[竖屏适配记录](../../docs/start-screen-portrait-2026-09-15/README.md)。主界面固定构图不改变 `UiAppearanceProvider` 的对局布局切换接口；界面构图仍独立于 DLC 主题和规则状态。

## 移动端固定横屏

2026-09-16：遗迹航路布局行动按钮采用 B 方案的 `action-*-b.webp`（1140×242），用 `contain` 保留原生比例，点击框仍保留原有纵向节奏。文字和 SVG 图标分层渲染，固定图标列及文字起点，不能再让角色面板的轻字重规则覆盖行动按钮。完整效果图、素材提示词及实装截图见[按钮 B 与骷髅装饰记录](../../docs/coastal-action-proposals-2026-09-16/README.md)。

骷髅标记由独立 `EncounterSkulls` 渲染，读取动画展示玩家的 `godEncounters`，一枚标记对应一张透明图像，无可见数字，也不属于 `PlayerStatusTags`。第一行压角色框下边，超过8枚时续排并为状态标签留位。遗迹航路玩家角色现压在新侧栏的独立铜质分隔框上，不挂到神力区底边；对手框不因骷髅数量伸长。骷髅保持等比，零枚时不渲染（分隔框仍保留）。

2026-09-17：其他角色达到5名时，`OpponentRoster` 将非当前展示回合的角色简化为圆头像、手牌徽章及HP/SAN条；玩家自己始终完整。简化骷髅使用 `portrait-arc`：固定头像左侧单弧，数量增加时按弦长等比缩小，不换边、不续圈，亮度80%。悬停展开包含手牌和tag的完整子树，完全离开才收起；触屏第一次点按展开，点击外部收起。简化 HP/SAN 条只以红/青色区分，隐藏可见标签与数值，保留 SAN=6 刻线和辅助技术可读数值。整排只为当前回合常驻面板保留真实高度；悬停完整面板也预留完整占宽，仅重新分配横向空间，牌堆位置不变。只允许相邻简化面板交叠，完整面板两侧保留16px（含外移头像空间）。悬停重排时短暂保留旧入口命中区域，指针进入完整面板后移除。当前回合高于普通席位，悬停高于当前回合。收起时卸载实际手牌节点，以计数徽章作为唯一可见手牌动画锚点；`data-death-panel`保留整个简化形态供断头台和石化截图。效果图、实现与验收入口见[多角色简化面板](../../docs/opponent-collapse-2026-09-17/README.md)。

手牌可读性：遗迹航路布局计数徽章保持原比例，内圈预留18px，数字17px、标签10px。信仰/升级提示使用独立字号，抵消棋盘缩放及移动横屏 iframe 的 `--toe-mobile-screen-scale`，使提示的屏幕字号至少约12px；提示宽度不越过卡牌，极窄牌允许换行。该变量由横屏宿主在 iframe 加载和窗口变化时同步，不能按逻辑画布字号直接判断手机可读性。

卡面标题及规则文字使用 `zoom` 按显示尺寸排版，避免先栅格化再通过 `transform: scale` 缩小。邪神效果区保持完整规则文案，长文优先收紧行高（1.24），再适度调整字号；弗栗多、阿波菲斯、烛九阴当前均为19px设计字号。卡图保留原稿，以原图及256/512px显示版组成 `srcset`，避免大图细节直接缩小旋转产生闪烁颗粒。添加或替换插图后执行 `node scripts/build-card-display-images.mjs`（复用现有 Sharp 工具，可用 `SHARP_MODULE` 指定路径），更新尺寸索引及显示素材，再执行构建更新资源清单。验收场景为 `battle-coastal-clarity` 与 `card-clarity`，检查手牌和放大详情、完整规则、原始比例及手机缩放；不能为提升清晰度截断规则或恢复玩家手牌的悬停大图。

`main.jsx` 通过 `mobileLandscape.js` 为手机／触屏平板建立一次同源游戏 iframe，内部保留完整 React 应用、弹窗 portal 和动画坐标系。逻辑视口至少900×600，小屏只使用统一缩放倍率；竖持时旋转90度，反向竖持使用-90度，横持由浏览器处理左右朝向。不得在 resize／orientation change 时替换 iframe、修改 src 或重建 App，否则会清空对局。固定 frame name 防止内页重复包裹，也兼容不能读取父页面元素的环境。

原生 `screen.orientation.lock('landscape')` 在首次点击或进入全屏后尝试，允许两个横屏方向；不支持或拒绝时继续使用页面横屏，不自动请求全屏。开发环境可用 `?mobile-landscape` 在桌面检查手机画布，生产环境根据设备能力启用。新增界面应检查内部横屏视口，不能拿宿主竖屏的坐标定位游戏动画。

验收覆盖390×844↔844×390、375×667↔667×375，翻转前后内页宽高不变、没有嵌套递归或滚屏；关于作者弹窗、区域牌选择在旋转后继续保留，旋转后的实际坐标点击可正常触发寻宝者能力。浏览器模拟验证不等同于各手机系统的原生方向锁真机验收。

## 主题探索运镜

探索运镜由 `src/constants/theme.js` 的 `BATTLE_CAMERA_BY_EXPANSION` 绑定拓展包主题，独立于界面构图。`BattleScreen` 通过 `getBattleCamera(gs.expansionKey, { width, height })` 将 `animation` 和 `origin` 注入背景的 CSS 变量，实际对局与 gallery 共用入口；没有专用配置的主题回退到地神的原步行运镜。

群星海景使用 `toeDrawBackgroundSea` 行船推进，缩放由 1 增至 1.24，仍为 0.92 秒×3，不增加探索队列阶段或等待时间。主题元数据记录1597×985素材和32%海天线，按居中 `cover` 裁切后的实际海天线计算缩放中心；背景层使用视口尺寸、scroll attachment且不做纵向位移，保证推进时海天线固定。地神原运镜仍为 `50% 48%`、1 → 1.16。新增主题运镜时，在映射中指定配置并在 `GlobalStyles.js` 定义对应关键帧，不在动画队列中按主题分叉。

遗迹航路布局的群星探索同时启用 `SailingSpray`：从前景底图约87%高的接缝中轴向两侧斜上扬起，根部沿船沿移动、浪扇向上抬起，末段仅轻微回落，路径按前景alpha轮廓描出左右独立曲线，并使用同一棋盘逻辑宽高缩放。主浪与前景同为z=-1，但DOM在前景之前，由原始底图和火把自然遮挡；两小簇泡沫独立位于z=16，仅在手牌下缘窄带露出，不能把两层再包进同一层叠容器。火把容器内另放3粒3～5px飞沫，仍受手牌遮挡。合计7张精灵，原生CSS路径/transform/opacity动画，不引入视频、全屏canvas或常驻粒子循环。浪花素材、授权与生图提示见[行船素材与验收记录](../../docs/sailing-exploration-2026-09-18/README.md)。

`SailingWetSurface` 用确认后的湿版底图与原干图混合，遮罩只控制覆盖范围和时序，不再绘制噪波暗膜或高光描线。面板仅覆盖光滑内板，原框/头像/文字保持原样；端盖622:137等比，中间平整湿面伸缩但不重复。火把与手使用原768×1152轮廓逐像素alpha，湿图反光顺应木纹和皮革。材质由4张静态WebP提供，共约310KiB；没有运行时噪波/滤波。`SAILING_WET_ARTWORK`在theme.js统一带内容版本的渲染与预解码URL。湿润前沿从右下向左上在184ms内展开（298°，mask-position从0% 0%至100% 100%）（60Hz约11帧），面板比火把晚18.4ms，同为0.92秒×3。退出探索后逐区保留已湿范围与剩余干燥时间（详见下方局部时序）；暂停冻结原动画，减少动态效果时只保留轻微静态湿润。湿层属于scene，低于文字、HDR火焰与全屏遮罩，保留死亡滤镜与原交互。html2canvas死亡快照忽略动态湿层，防止CSS mask不受支持时出现整块湿图。确认图、素材提取与复现提示见[干湿底图方案](../../docs/sailing-wet-lookdev-2026-09-18/README.md)。

局部打湿使用`SAILING_WET_COVERAGE`的静态alpha遮罩与上述方向前沿取交集，终态也不能铺满面板。整体轮廓是宽撞击区连接三条不等长渐窄分支，噪声只扰动边缘；面板三片共享整张遮罩，火把单独定位。`scripts/generate-sailing-wet-coverage.mjs`离线生成6组位置、方向和分支尺寸不同的轮廓（12张WebP约51.8KiB，全解码约6.34MiB），按有效材质alpha检查至少45%干区和各变体可辨差异。不得用全表面低透明度或云状噪声代替局部飞溅范围。

每次探索随机抽3个不重复形状，并排除实际上一张（包括中途退出时的形状）。每个表面固定3个完整坐标的局部层，共享当波轮廓：主区按浪向推进，中部飞沫区可提前命中，末端另行到达。到达、停留、干燥时间各自随机，clip-path在原坐标内收缩湿区，不移动材质。三个区域所有权为`(1-E)(1-L)`、`E(1-L)`、`L`，总权重1，避免重复叠图增亮。锚点从每张轮廓生成到`sailingWetRegions.json`，运行时仅轻微抖动；仍保留足够干区。

前两波920ms内各自干透，所有局部透明后才能更换共同轮廓；第三波提前区较早干透，主区独立保留1.4～2.2秒渐干。两表面共6个原生WAAPI，没有逐帧JS、运行时噪声或新增水膜纹理。退出时逐区保留当前maskImage、maskPosition、clipPath、opacity及剩余干燥时间，已干/未命中的区域不能重新变湿，暂停/静态对照不可重抽或跳形。预解码数组需展平并使用与渲染一致的内容版本URL。

海景背景以 `cover` 居中等比铺满，不横向重复。海天线约在素材上方 32%，主要浪纹与反光放在中部，避免被手牌遮住。减少动态效果时也关闭群星背景推进。主题切换验收使用 `battle-camera` 场景，并核对实际对局、16:10／19:10裁切及运镜期间页面没有新增滚动条。

## 系统控件与全屏遮罩层级

探索运镜背景由 `.toe-battle-background` 单独承载并用 `overflow: clip` 裁切；运镜伪元素不能直接挂在可滚动的 `.toe-battle-root` 上，否则 `scale` 和位移会不断扩大其 `scrollHeight`。背景裁切层不包裹棋盘内容、系统控件或遮罩，也不改变根节点的 fixed 定位基准。回归检查可打开样板场景 `battle-camera`（仅该开发场景循环播放运镜），核对动画期间根节点的 `scrollHeight` 不随背景变换增长。

暂停、设置入口属于页面普通 UI，不能通过 body portal 或抬高 `z-index` 越过全屏遮罩。`GammaSlider` 的入口直接渲染；对局中为 `.toe-battle-root` 直系子节点，使用固定定位和 `z-index: 4`。遗迹航路布局仅将展开的设置面板挂到 overlay 宿主，仍用低层级 `4`，使其盖住独立火焰、同时位于目标选择与决策遮罩之下。身份选择、身份揭示期间继续不渲染入口。判断层级必须检查祖先层叠上下文，不能只比较组件的 `z-index` 数字。

系统控件的 fixed 根节点和展开菜单不得进入棋盘 `zoom`、震屏 `transform` 或背景滤镜容器；`.toe-battle-root` 自身不加会重设 fixed 包含块的效果，保证移动横屏 iframe 内的坐标仍以逻辑视口为准。B版仅在触发按钮组外设置未 `zoom` 的 `BattleSceneContent` 动效外壳，同步棋盘的 shake 与暂停状态；内层按钮组再按同一构图倍率缩放。允许这个局部外壳应用震动 transform，但固定根和菜单不随之变换，不能把震动套在已 zoom 的按钮组上而重复放大位移。

目标选择和教学操作步骤保留点击透传，暂停面板使用自身“继续游戏”按钮；不要为覆盖入口改坏这些交互。保留确有全屏用途的动画、教学和弃牌堆 portal。修改时核对设置展开状态也被遮罩覆盖，并在按钮坐标处检查实际命中元素。完整清单见[系统控件层级审计](../../docs/system-controls-layers-2026-09-15/README.md)，B版局部动效边界以上述规则为准。

### 局部发光与 Gamma 隔离

`main.jsx` 在实际游戏文档中建立三个同级、固定视口的宿主：`scene`（普通画面与 `#root`）、`flame`（独立发光）、`overlay`（全屏遮罩、揭示、决策与弹窗）。手机仍在既有横屏 iframe 内建立这三个宿主，不挂到外层竖屏页面。Gamma 通过 `--toe-scene-gamma` 只过滤 scene 与 overlay；body、flame 及其祖先不得添加 Gamma 滤镜，也不能用子节点的反向滤镜抵消。

新增内容使用 `GameLayerPortal` 或 `renderGameLayer` 明确归属，不靠提高 `z-index` 跨越场景。普通飞牌、伤害连线和系统控件入口留在 scene；翻牌仅在结束飞行、进入全屏揭示时进入 overlay，停帧决策沿用同一层；教学、身份、暂停、退出确认、弃牌图库和全屏光效均归 overlay。悬停卡图沿用来源卡牌的宿主，避免弹窗中的悬停图落回 scene。空的 overlay 宿主不接管输入；目标选择与教学的透传规则由原组件保留。

火焰不接收指针事件。`subscribeOverlayPresence` 根据实际渲染的 overlay 内容通知播放器，仅用于遮罩期间降低帧率，不再额外降低火焰亮度；遮暗由上方真实遮罩统一合成，避免回合横幅出现时火焰独自变暗，或全屏遮罩造成二次压暗。这与 Gamma 设置独立。宿主不参与棋盘缩放和运镜，scene 在 遗迹航路布局关闭外部滚动，避免重现运镜滚动条。验收需检查 Gamma=1 和非1、普通摸/弃牌与揭示阶段、暂停/设置、弃牌图库、目标选择、教学透传和手机横屏坐标。

## 遗迹航路布局玩家侧栏

玩家区固定挂靠左侧（1200逻辑宽：x=-5、y=180、宽150），底缘按实际计数框高度留14px。左下三牌堆计数框以左下角为锚点等比缩至80%，包含底图和文字；侧栏读取缩放后的实际高度，相应向下延伸。顶部角色行扩至x=14～918。上下端帽、头像圆框和暖光贴图保持原比例，中间仅重复无花饰直轨。骷髅压在独立铜质分隔框上。允许少量遮住握持手背，但火把本体和火焰必须完整可见。暖光范围烘焙在RGBA素材中，避免CSS mask在死亡快照中丢失；底板与内容同步死亡变暗。详见[侧栏实施记录](../../docs/opponent-collapse-2026-09-17/step2-implementation.md)。

信仰区不显示“当前信仰”通用标题，直接以神名、神力名与等级起头。正文使用10px逻辑字号、1.45行高，同时抵消棋盘及移动横屏 iframe 的缩放，保证屏幕字号至少约11px；不得为塞满长文突破该下限。神名与神力名分别使用13px、11.5px逻辑字号，屏幕字号分别保底13px、12px，神名字重500，避免小屏补偿后标题与正文同大。`FaithScrollRegion` 保留原生滚动与键盘操作，只有对应方向还有内容时才显示SVG箭头，点击可翻动约65%的可视高度。箭头覆盖在右侧留白，不挤占文字或改变滚动容器高度；容器及内容大小变化时重新测量。神名或等级变化回到顶部，普通tag更新保留阅读位置。45段等级文案与手机横屏验收见[信仰区扩容记录](../../docs/faith-sidebar-2026-09-17/README.md)。

非神力内容（翻面、虚化、中毒、附着区域牌）由 `.toe-self-side-tags` 挂靠侧栏右边框，顶部14px起单列排列，宽68px，标签字号同样保底约11px实际屏幕像素。它不进入信仰滚动区，仍位于玩家面板及死亡表现子树内，保留唯一的状态动画锚点和卡牌悬停。翻面标签简写，完整含义保留在提示中。死亡截图将可见侧挂区域计入包围范围，不加宽真实面板或移动普通伤害中心。

伪3D行船的屏幕坐标约定：向下接近镜头不等于水花向下撞击。海面/船沿低于左侧面板和火把，撞击阶段应斜上飞溅；左侧材质的飞溅轮廓主轴与渐显前沿均为右下→左上。根部仍按前景alpha接缝走，不能整体抬离船沿，也不能把主浪提升到手牌/火焰之上。水滴末段可受重力轻微回落，局部提前命中仍可随机。
