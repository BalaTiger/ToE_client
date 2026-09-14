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
- `cssVariables`：全局 CSS 自定义属性，覆盖现有 `--toe-ui-*` 等令牌。Provider 把属性、`data-ui-appearance="方案 ID"` 和 `data-ui-layout="布局类型"` 放在 `document.documentElement`，因此 body portal 中的设置、弹窗也适用。切换时清理上一方案独有变量并恢复属性。
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
