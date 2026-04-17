# Phase 2 渲染组件拆分方案

为了安全、干净地将 `App.jsx` 中超过 3000-4000 行的 UI 组件迁移至 `src/components/`，我建议将本次重构分为四块独立子目标，以便随时阻断并验证，防止引用的意外丢失或样式破坏。

## 子模块分类与迁移计划

### 🎯 阶段 2.1: 基础部件与卡牌渲染 (Cards Layer)
这一层拥有全应用最高频的原件复用，最独立，最适合首发拆离。
- **拆出组件**：`DDCard`, `GodDDCard`, `DDCardBack`, `GodCardDisplay`, `GodTooltip`, `AreaTooltip`
- **目标路径**：`src/components/cards/` (加粗封装导出)
- **依赖说明**：需从底层注入 `EFFECT_DESC`、`getCardImageUrl` 等核心映射，或者通过 context/props 传递。

### 🎯 阶段 2.2: 交互模态框与面板 (Modals & Modifiers)
游戏进程中涉及临时拦截与弹窗反馈的 UI 层，这使得 `App.jsx` 主干看起来极其臃肿。
- **拆出组件**：`GodChoiceModal`, `NyaBorrowModal`, `DrawRevealModal`, `TreasureDodgeModal`, `PeekHandModal`, `TortoiseOracleModal`, `AboutModal`, `FullLogModal`, `RoadmapModal`
- **目标路径**：`src/components/modals/`
- **依赖说明**：主要暴露 `onDone`, `onSelect`, `onSkip`, `onClose` 回调直接交还给 `App.jsx` 即可。

### 🎯 阶段 2.3: 玩家面板及桌面布局 (Board Layer)
占据整个桌面排版的几个重型卡牌容器。
- **拆出组件**：`PlayerPanel`, `PileDisplay`, `DiscardPile`, `DeckPile`, `InspectionPile`, `HoundsTimerBadge`, `StatBar`
- **目标路径**：`src/components/board/`

### 🎯 阶段 2.4: 复杂动画节点 (Animations & Overlays)
这是目前代码树里最为魔幻和“辣眼”的视觉动效群，有大量行内函数和 requestAnimationFrame。
- **拆出组件**：从 `FlowerBloom`, `CardFlipAnim`, `KnifeEffect`, `DiscardMoveOverlay` 到各类浮窗动画（`SanMistOverlay`, `CaveDuelAnim`, `HealCrossEffect`）共计近二十个函数组件。
- **目标路径**：`src/components/anim/`

## User Review Required
> [!IMPORTANT]  
> 全部 4 个阶段若一并操作，涉及的文件新建与改写行数极多，由于我们在通过 AI Agent 进行非人工审查的代码搬运，如果一下子搬空所有的组件，可能会发生少数 import 的漏接导致您直接跑不通（白屏）。
> 
> **请决定执行策略：**
> 1. 您希望我**一次性大刀阔斧**干完这 4 个拆分然后让你验收？
> 2. 还是采取**稳妥推进**，我们先做第一步（例如 `Cards`），确认游戏渲染依旧完好，再继续进行。
