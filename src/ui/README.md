# 界面构图接口

`UiAppearanceProvider` 在 `main.jsx` 包裹整个应用。视听设置中的「界面构图」可在当前对局内切换「弧形桌台」「经典布局」与「3号 · 遗迹海岸」，偏好单独保存为 `localStorage.toe_ui_appearance`。该接口不修改拓展包、规则主题或游戏状态。

```jsx
import { useUiAppearance } from './UiAppearance';

const { appearance, appearances, setAppearance } = useUiAppearance();
setAppearance('classic');
```

默认方案仍是 `arcane-table`。3 号布局的独立 ID 是 `coastal`；可调用 `setAppearance('coastal')`，也可用 `?ui-appearance=coastal` 预览。`classic` 与 `arcane-table` 同样支持 URL 预览；URL 只决定首次加载，不写入偏好。页面内切换仍即时生效，刷新后带参数的 URL 再次优先。非法 ID 和不可用存储安全回退默认方案。

2026-09-14：3 号布局已接入。它直接复用现有环境图、普通卡背、紫色检定卡背和卡面组件，四种 DLC 的资源映射仍由 `src/constants/theme.js` 决定。3 号布局的对局菜单包含亮度、音乐、音效、界面构图和退出入口；单机另有暂停按钮。打开菜单不会暂停对局。所有构图的退出入口共用二次确认，暂停时取消确认或按 Esc 只关闭确认，仍保持暂停。详见[本轮实现记录](../../docs/layout-3-dlc-proposals-2026-09-14/implementation.md)。

## 加入新构图

在 `appearances.js` 的 `UI_APPEARANCES` 数组加入一个条目，设置 `id`、`label`、`battleLayout`、`assets`、`cssVariables`。它会自动出现在设置列表中。

- `battleLayout`：现有布局类型，`arch` 为拱形桌台，`grid` 为经典网格，`coastal` 为海岸构图。Provider 会设置根节点 `data-ui-layout`；同属 `arch` 的新方案会直接复用拱形布局样式。
- `assets`：`handTable`、`reliefLeft`、`reliefRight` 为手牌桌台；`panelSurface`、`panelFrame` 为共用面板；`skill`、`rest`、`multiply`、`end` 为动作按钮。路径使用 `/img/...`，消费图片时用 `buildPublicUrl` 兼容 H5 相对路径。
- `cssVariables`：全局 CSS 自定义属性，覆盖现有 `--toe-ui-*` 等令牌。Provider 把属性、`data-ui-appearance="方案 ID"` 和 `data-ui-layout="布局类型"` 放在 `document.documentElement`，因此 body portal 中的弹窗、动画也适用。切换时清理上一方案独有变量并恢复属性。
- `BattleLayout`（可选）：直接导入的 React 组件，用来替换战斗区整体构图。组件收到已绑定原有规则、回调和动画引用的 `{ opponents, middle, prompt, hand }` React 节点，以及 `{ turn, turnLabel, counts, compact }` 展示参数；`counts` 含 `inspection`、`deck`、`discard`。将每个节点渲染一次。原有缩放容器包裹此布局；`arch` / `grid` 保留外部顶栏，`coastal` 使用自己的回合面板与对局菜单。不提供组件时按 `battleLayout` 使用现有默认组合。可独立渲染 `prompt`，或用 React 的 `cloneElement(hand, { phasePrompt: prompt })` 将提示并入手牌操作区；并入后不要再单独渲染同一提示。

现有 [CoastalBattleLayout](../components/battle/CoastalBattleLayout.jsx) 将 `middle` 的三个现有子组件（自己、牌堆、日志）分别放入海岸构图，保留各组件的 refs 和回调；其他角色由 `CoastalOpponents` 排列。若要继续实验完整构图，复用这些节点，避免复制规则渲染或建立第二份对局状态。

3 号资源位于 `public/img/ui/coastal/`，由四张无字生成母图切片得到 18 项 WebP，包含 13 项透明 UI 素材与 5 张 RGB 头像。UI 记录见[生产提示词](../../docs/layout-3-dlc-proposals-2026-09-14/production-prompts.json)、[素材清单](../../docs/layout-3-dlc-proposals-2026-09-14/production-assets.json)、[提取脚本](../../scripts/extract-coastal-assets.mjs)；头像记录见[母图](../../docs/layout-3-dlc-proposals-2026-09-14/production-portraits-master.png)、[提示词](../../docs/layout-3-dlc-proposals-2026-09-14/production-portraits-prompt.json)、[切片清单](../../docs/layout-3-dlc-proposals-2026-09-14/production-portraits.json)、[提取脚本](../../scripts/extract-coastal-portraits.mjs)。头像按固定展示席位分配，其他席位循环使用四张人物图；不读取或跟随隐藏身份，身份公开也不改变头像。

示例条目：

```jsx
import { AlternateBattleLayout } from './AlternateBattleLayout';
import './alternate.css';

{
  id: 'alternate',
  label: '试验构图',
  battleLayout: 'arch',
  assets: { ...sharedAssets, handTable: '/img/ui/alternate/table.webp' },
  cssVariables: { '--toe-ui-accent': '#c4b7a0' },
  BattleLayout: AlternateBattleLayout,
}
```

布局组件使用现有节点，保持动画定位引用和交互回调；不要在布局中复制游戏状态、重新计算 HP/SAN 或改写 `expansionKey`。跨方案共享布局样式使用 `[data-ui-layout='arch']`，方案独有样式使用 `[data-ui-appearance='alternate']`。方案切换可能重建装饰/布局节点，不能给顶层 `App` 加 appearance key，否则会重置对局。

## UI 素材比例与验收

**带有圆形设计的 UI 不改长宽比。** 此规则适用于所有构图，包括带圆形头像框的玩家面板、星盘、圆环、徽章和圆形按钮。面板整体虽为长方形，只要圆形装饰已画在同一张素材内，就必须保留整张素材的原始宽高比。

- 以素材实际像素尺寸确定比例；优先只设定一个缩放轴并配合原始 `aspect-ratio`，或使用保持自然比例的 `img`。外层容器需要独立宽高时，图片使用 `object-fit: contain`，背景使用 `background-size: contain`，并明确锚点。
- 禁止独立计算不符合素材比例的宽高、使用不同的 `scaleX` / `scaleY`，或用 `object-fit: fill`、`background-size: 100% 100%` 拉伸这类素材。媒体查询、全局缩放与布局切换也必须遵守同一比例。
- 装饰层与内容层分别定位。需要贴边或超出画面时，使用位移和裁切保留既定构图；容器比例不匹配时允许留空。不得通过拉伸圆形消除空隙。姓名、HP/SAN 条、SAN 刻度和可操作控件须保留安全边距，不能随装饰一起被裁掉。
- 修改相关素材、尺寸或断点后，至少检查宽桌面和窄屏各一档实际游戏画面。核对渲染图片的横纵缩放倍率一致、圆形仍为圆形，以及内容可读且按钮可操作；同时检查超框位置，不能仅凭组件容器的尺寸判定通过。

3 号其他角色面板的 `toe-opponent-core` 与外框固定为素材原始 458:390，头像圆环复用 `hand-count.webp`（439:448），头像单独保持 1:1。框下挂签与区域牌参与正常流测量，不能撑长框图；`data-player-god-status` 等供教程和动画定位的节点须保留非零矩形。

### 3号布局右上角 B 方案

2026-09-16：用户选定的 B 方案已实装，使用 `corner-b-header.webp`、`corner-b-journal.webp`、`corner-b-control.webp`，不复用被否决版本的素材。生成、切片与实装验收见[B版记录](../../docs/coastal-corner-b-2026-09-16/README.md)。

[`COASTAL_CORNER`](../components/battle/coastalGeometry.js) 同时定义回合栏和视口固定按钮的逻辑坐标：栏宽292、top −3、right −22；按钮54×54、间距8，各自的独立 SVG 图标30×30。两个按钮共用圆底图，不能以字符替代图标或分别缩放。外框按2144:590自然比例显示，按钮保持1:1；固定按钮位置由安全视口与相同构图倍率换算，不能另用窗口百分比估算。

日志宽224、top92、right −12；完整底图保持975:1407，书高 `bookHeight = 224 / (975 / 1407)`。内容容器高为 `min(bookHeight, controlsTop - logTop - 4)`，棋盘高度预算保证至少160。增加繁衍等操作只缩短可滚动内容区，不挤窄书页、不缩小文字、不拉伸中段扣带的圆铆钉。padding 顶部为 `bookHeight × .12`，左右分别为书宽的27%和11.8%，底部为 `max(16, logHeight - bookHeight × .78)`。

书页装饰层为 `-2`，既有触手/骷髅前景为 `-1`，日志内容层为 `10`；只裁掉书页超过 `logHeight + 18` 的底部，使其隐入提示栏及触手后面。纸页在运行时统一 `brightness(.78) saturate(.7)`，不改素材颜色。日志标题17、正文13.5，使用深褐色文字；标题位于滚动区外，`logRef` 必须继续绑定真正滚动的 `[data-log-panel]`。修改时验收1920×1080、1520×800含繁衍操作及1600×1000联机状态，并遵守下方系统控件的动效与遮罩边界。

## 卡牌纵深与飞行定位

卡面、静态卡背和动态卡背帧均保持 `392:590`。卡背背景和帧图使用 `contain`；不能用旧飞牌 `82:108`、`70:94` 等容器比例裁切或拉伸素材。飞行只允许统一的 `scale`，不分别改变横纵倍率。

其他角色手牌为远景，牌堆为中景，玩家手牌为近景。玩家手牌继续以可读性和现有扇形空间为准；牌堆优先利用包装留白放大，3号布局在空间足够时以手牌宽度的约68%为目标，高度不足时先保证牌堆与悬停手牌间距。不得放大牌堆外包装冒充卡面放大。

`utils/dom.js` 的 `getPlayerHandCardAnchor`、`getPileCardAnchor` 和 `getCardElementAnchor` 返回视口中的中心、原比例宽高和旋转角。牌堆锚点必须落在真实顶牌（含空堆占位），手牌尽量按卡牌ID定位；测量时排除标签、堆叠留白，并消除扇形旋转造成的包围盒增宽。弹窗退出前保留该张决策卡的本地锚点，不能用旧屏幕百分比估算。

所有牌堆／手牌间移动使用 `getCardFlightStyle`，按起终点宽度插值并在末帧抵达实际目标。洗牌、对决等额外阶段也要衔接这些端点，保持原有队列提交和时长。`?ui-gallery=1&scene=flight-self-discard` 等四个飞行样板支持重播与0～100%定格，可跨布局、主题检查首尾中心、宽高比和远近变化。

### 卡牌的伪 3D 平面

三种布局的三个牌堆共用一个 `data-pile-camera`，透视距离为 `max(600px, 容器宽 × 1.6)`、透视中心为容器正中；内部唯一的 `data-pile-table` 整体 `rotateX(45deg)`。不得给各个牌堆独立设置 perspective，否则它们无法形成同一桌面。单牌仅按实际堆高 `translateZ` 并保留原平面旋转，前侧及左右侧纸边随牌数形成真实厚度。中间祖先保持 `preserve-3d`；计数、石化等效果与装饰在相机外保持正面。

普通牌堆和检定牌堆的所有牌层使用相同XY位置、0°平面旋转，按Z高度堆成方柱；只有弃牌堆保留错位及旋转。3号布局的相机中心直接采用其他角色面板组的实际中心（测量时排除共同缩放），不再分别用两套窗口百分比定位。窗口变化、超出安全宽高比后的留边同样要保持这条共同中心线。

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

手牌可读性：3号布局计数徽章保持原比例，内圈预留18px，数字17px、标签10px。信仰/升级提示使用独立字号，抵消棋盘缩放及移动横屏 iframe 的 `--toe-mobile-screen-scale`，使提示的屏幕字号至少约12px；提示宽度不越过卡牌，极窄牌允许换行。该变量由横屏宿主在 iframe 加载和窗口变化时同步，不能按逻辑画布字号直接判断手机可读性。

卡面标题及规则文字使用 `zoom` 按显示尺寸排版，避免先栅格化再通过 `transform: scale` 缩小。邪神效果区保持完整规则文案，长文优先收紧行高（1.24），再适度调整字号；弗栗多、阿波菲斯、烛九阴当前均为19px设计字号。卡图保留原稿，以原图及256/512px显示版组成 `srcset`，避免大图细节直接缩小旋转产生闪烁颗粒。添加或替换插图后执行 `node scripts/build-card-display-images.mjs`（复用现有 Sharp 工具，可用 `SHARP_MODULE` 指定路径），更新尺寸索引及显示素材，再执行构建更新资源清单。验收场景为 `battle-coastal-clarity` 与 `card-clarity`，检查手牌和放大详情、完整规则、原始比例及手机缩放；不能为提升清晰度截断规则或恢复玩家手牌的悬停大图。

`main.jsx` 通过 `mobileLandscape.js` 为手机／触屏平板建立一次同源游戏 iframe，内部保留完整 React 应用、弹窗 portal 和动画坐标系。逻辑视口至少900×600，小屏只使用统一缩放倍率；竖持时旋转90度，反向竖持使用-90度，横持由浏览器处理左右朝向。不得在 resize／orientation change 时替换 iframe、修改 src 或重建 App，否则会清空对局。固定 frame name 防止内页重复包裹，也兼容不能读取父页面元素的环境。

原生 `screen.orientation.lock('landscape')` 在首次点击或进入全屏后尝试，允许两个横屏方向；不支持或拒绝时继续使用页面横屏，不自动请求全屏。开发环境可用 `?mobile-landscape` 在桌面检查手机画布，生产环境根据设备能力启用。新增界面应检查内部横屏视口，不能拿宿主竖屏的坐标定位游戏动画。

验收覆盖390×844↔844×390、375×667↔667×375，翻转前后内页宽高不变、没有嵌套递归或滚屏；关于作者弹窗、区域牌选择在旋转后继续保留，旋转后的实际坐标点击可正常触发寻宝者能力。浏览器模拟验证不等同于各手机系统的原生方向锁真机验收。

## 系统控件与全屏遮罩层级

探索运镜背景由 `.toe-battle-background` 单独承载并用 `overflow: clip` 裁切；运镜伪元素不能直接挂在可滚动的 `.toe-battle-root` 上，否则 `scale` 和位移会不断扩大其 `scrollHeight`。背景裁切层不包裹棋盘内容、系统控件或遮罩，也不改变根节点的 fixed 定位基准。回归检查可打开样板场景 `battle-camera`（仅该开发场景循环播放运镜），核对动画期间根节点的 `scrollHeight` 不随背景变换增长。

暂停、设置及其展开面板属于页面普通 UI，不能通过 body portal 或抬高 `z-index` 越过全屏遮罩。`GammaSlider` 直接渲染；对局中为 `.toe-battle-root` 直系子节点，使用固定定位和 `z-index: 4`，位于棋盘层之上、目标选择与决策遮罩之下。身份选择、身份揭示期间继续不渲染入口。判断层级必须检查祖先层叠上下文，不能只比较组件的 `z-index` 数字。

系统控件的 fixed 根节点和展开菜单不得进入棋盘 `zoom`、震屏 `transform` 或背景滤镜容器；`.toe-battle-root` 自身不加会重设 fixed 包含块的效果，保证移动横屏 iframe 内的坐标仍以逻辑视口为准。B版仅在触发按钮组外设置未 `zoom` 的 `BattleSceneContent` 动效外壳，同步棋盘的 shake 与暂停状态；内层按钮组再按同一构图倍率缩放。允许这个局部外壳应用震动 transform，但固定根和菜单不随之变换，不能把震动套在已 zoom 的按钮组上而重复放大位移。

目标选择和教学操作步骤保留点击透传，暂停面板使用自身“继续游戏”按钮；不要为覆盖入口改坏这些交互。保留确有全屏用途的动画、教学和弃牌堆 portal。修改时核对设置展开状态也被遮罩覆盖，并在按钮坐标处检查实际命中元素。完整清单见[系统控件层级审计](../../docs/system-controls-layers-2026-09-15/README.md)，B版局部动效边界以上述规则为准。
