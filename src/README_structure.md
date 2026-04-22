# 邪神的宝藏 - 前端结构说明

本文档用于说明 `src/` 目录当前的职责划分。后续每次拆分 `App.jsx` 时，都应同步更新这里，避免代码边界和文档描述脱节。

## 当前目标

当前前端的拆分方向是：

- `App.jsx` 只保留：
  - React 组件与页面结构
  - 全局状态机与回合推进
  - 动画播放与实时日志桥接
  - 联机同步入口与本地交互桥接
- 其余独立性较强的逻辑逐步拆到：
  - 静态卡牌数据
  - 规则纯函数
  - AI 决策
  - 开局生成
  - 多人视角旋转
  - 日志编排辅助

## 目录结构

```text
src/
├─ App.jsx              # 游戏主入口，维护全局状态、动画队列、UI渲染
├─ App.css              # 游戏界面样式
├─ index.css            # 全局基础样式
├─ main.jsx             # React挂载入口
├─ README_structure.md  # 本文档
├─ assets/              # 静态资源目录
├─ components/
│  └─ cards/            # 阶段2.1：卡牌渲染组件
│     └─ index.jsx      # DDCard, GodDDCard, DDCardBack, GodCardDisplay, Tooltip, OctopusSVG
├─ constants/
│  └─ card.js           # 卡牌静态数据、身份常量、颜色配置
├─ game/                # 游戏逻辑纯函数（无React依赖）
│  ├─ index.js          # 桶文件，统一导出game下所有模块
│  ├─ ai.js            # AI决策策略、评分器、目标选择
│  ├─ animLogs.js      # 动画日志编排辅助函数
│  ├─ animQueueHelpers.js  # 动画队列外围辅助函数
│  ├─ coreUtils.js     # 洗牌、拷贝、区域牌判断等规则工具
│  ├─ rotateState.js   # 联机视角旋转、seat语义判断
│  └─ setup.js         # 开局生成：mkDeck, mkRoles
├─ styles/              # 样式目录
└─ utils/               # 工具函数目录
```

## 模块职责

### `App.jsx`

当前仍然是前端主文件，但职责已经收缩到以下几类：

- React UI 与弹窗渲染
- 游戏状态 `gs` 的维护与推进
- 动画队列与视觉特效
- 实时日志与完整日志的同步桥接
- 单机与联机的主流程调度

不应该继续往这里堆纯数据、纯规则工具或纯 AI 策略。

### `constants/card.js`

负责卡牌静态数据与常量定义，例如：

- 区域牌主数据
- 邪神牌定义
- 身份常量
- 文案、颜色、基础配置

当前区域牌主数据已经以“按编号分组的变体列表”为主，不再依赖旧的 `face/tag` 作为运行时主结构。

### `game/coreUtils.js`

负责纯函数型规则工具，不依赖 React 状态，也不应依赖 DOM。

当前包括：

- 洗牌、裁剪、玩家拷贝等基础工具
- 区域牌正负中性 / 作用域判断
- 手牌胜利条件判断
- 日志中的卡牌文本格式化
- 相邻存活角色索引等规则辅助

适合放这里的函数特征是：

- 输入明确
- 输出明确
- 无副作用
- 与 UI 无直接关系

### `game/ai.js`

负责 AI 的纯策略与选择逻辑。

当前包括：

- 是否收入区域牌
- 亮牌选择
- 猎人夺牌选择
- `先到先得` 选牌
- `玫瑰倒刺` 目标选择
- 区域牌评分器

这里应只放“AI 怎么判断”的逻辑，不放动画、日志、状态落地。

### `game/setup.js`

负责开局生成相关的纯逻辑。

当前包括：

- `mkDeck()`：生成初始牌堆
- `mkRoles()`：生成初始身份顺序

后续如果继续收缩 `App.jsx`，与"构建初始对局状态"强相关、但又不依赖 UI 的逻辑，也可以继续往这里移动。

### `game/index.js`

游戏逻辑模块的统一导出入口（桶文件）。

当前导出：

- `coreUtils` 的所有导出
- `ai` 的所有导出
- `setup` 的所有导出

App.jsx 通过 `import { xxx } from './game'` 统一导入，便于扩展和维护。

负责联机视角旋转与“本地 seat 语义”相关 helper。

当前包括：

- `rotateGsForViewer(...)`
- `derotateGs(...)`
- 本地 seat / AI seat 判断
- 本地行动者 / 本地响应者 / 本地目标判断
- 本地显示名 helper

这部分的目标是把：

- `0/非0` 的硬编码
- 本地玩家/联机玩家的视角映射

从 `App.jsx` 中逐步抽离出来。

### `game/animLogs.js`

负责动画日志编排的纯辅助函数。

当前包括：

- 日志类型判断
- 日志切片与分桶
- 显式日志片段绑定
- 回合切换日志切分
- `prepareAnimQueueLogs(...)`

这里主要承接“日志如何跟动画步骤对齐”的纯逻辑。真正依赖 React ref、组件状态的那层仍保留在 `App.jsx`。

### `game/animQueueHelpers.js`

负责动画队列外围的纯辅助函数。

当前包括：

- 回合高亮的队列步骤解析
- 蛊惑后被赠牌角色的后续队列构造
- SAN 检定牌翻牌队列构造
- 检定前后状态之间的动画流拼装

这部分和动画系统关系很近，但本身不依赖 React state、ref 或 DOM，因此适合从 `App.jsx` 中独立出来。

## 当前已完成的拆分

截至目前，已经从 `App.jsx` 拆出的主要内容有：

- 区域牌/邪神牌静态数据 -> `constants/card.js`
- 规则纯函数 -> `game/coreUtils.js`
- AI 策略与评分器 -> `game/ai.js`
- 开局生成 -> `game/setup.js`
- 联机视角旋转与 seat helper -> `game/rotateState.js`
- 动画日志辅助 -> `game/animLogs.js`
- 动画队列外围辅助 -> `game/animQueueHelpers.js`
- 卡牌渲染组件 -> `components/cards/` (阶段 2.1)
- 桌面布局组件（已开始） -> `components/board/`：`HoundsTimerBadge`、`StatBar`、`DiscardPile`

### `components/cards/index.jsx`

负责基础卡牌 UI 渲染，是全应用最高频复用的组件层。

当前包括：

- `DDCard`：区域牌卡片组件（支持普通牌、空白牌、玫瑰倒刺标记）
- `GodDDCard`：邪神牌卡片组件
- `DDCardBack`：牌背面组件
- `GodCardDisplay`：邪神牌展示组件
- `GodTooltip`：邪神牌悬浮提示
- `AreaTooltip`：区域牌悬浮提示
- `OctopusSVG`：八爪鱼装饰 SVG
- `useCardHoverTooltip`：卡牌悬浮提示 Hook

特点：
- 完全独立，无 React 状态依赖
- 通过 props 接收数据和回调
- 可直接复用或替换样式

## 当前仍留在 `App.jsx`、后续可继续拆分的重点

### 阶段 2.2：交互模态框与面板 (Modals & Modifiers)

待拆分组件：
- `GodChoiceModal`、`NyaBorrowModal`、`DrawRevealModal`
- `TreasureDodgeModal`、`PeekHandModal`、`TortoiseOracleModal`
- `AboutModal`、`FullLogModal`、`RoadmapModal`

目标路径：`components/modals/`

### 阶段 2.3：玩家面板及桌面布局 (Board Layer)

待拆分组件：
- `PlayerPanel`、`PileDisplay`、`DiscardPile`、`DeckPile`
- `InspectionPile`、`HoundsTimerBadge`、`StatBar`

目标路径：`components/board/`

### 阶段 2.4：复杂动画节点 (Animations & Overlays)

待拆分组件：
- `FlowerBloom`、`CardFlipAnim`、`KnifeEffect`、`DiscardMoveOverlay`
- `CardTransferOverlay`、`GenericAnimOverlay`、`DiceRollAnim`、`YourTurnAnim`
- `GuillotineAnim`、`SanMistOverlay`、`HealCrossEffect`、`CaveDuelAnim`
- `BewitchEyeOverlay`、`HuntScopeOverlay`、`SwapCupOverlay` 等

目标路径：`components/anim/`

### 效果结算主链（长期）

- `applyFx(...)`
- 邪神结算相关主链

长期更适合拆成独立的 effect engine。

### 实时日志与动画的最终桥接层

虽然纯 helper 已经拆到 `animLogs.js`，但：

- `visibleLogRef`
- `revealAnimLogs(...)`
- `advanceQueue(...)`

仍在 `App.jsx`，这是合理的中间状态。

## 后续拆分原则

后续继续拆分时，建议遵循这些规则：

1. 纯数据放 `constants/`
2. 纯规则函数放 `game/coreUtils.js`
3. 纯 AI 决策放 `game/ai.js`
4. 开局构建放 `game/setup.js`
5. 联机 seat / 视角映射放 `game/rotateState.js`
6. 动画日志纯辅助放 `game/animLogs.js`
7. UI 组件按层级拆分到 `components/cards/`、`components/modals/`、`components/board/`、`components/anim/`
8. 只有真正依赖 React 状态、组件上下文或 DOM 的逻辑，才继续留在 `App.jsx`

## 维护要求

每次发生以下情况时，都要同步更新本文档：

- 新增一个拆分模块
- 某类职责从 `App.jsx` 移出
- 某个模块边界发生调整
- 原有模块职责出现扩展或收缩

这样可以确保：

- 后续拆分有连续性
- 回看历史时能快速理解模块边界
- 不会出现“代码已经拆了，但文档还是旧结构”的情况
