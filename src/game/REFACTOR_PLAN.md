# App.jsx 拆分计划

## 已完成

### 第1步：initGame + INSPECTION_DECK
- `initGame` 和 `INSPECTION_DECK` 已迁移到 `src/game/setup.js`
- `initGame` 接收 `startNextTurn` 作为参数（因为 `startNextTurn` 仍在 App.jsx）
- App.jsx 减少约 80 行

---

## 第2步：startNextTurn + 抽牌逻辑链（中风险）

**目标**：将回合流转和抽牌逻辑从 App.jsx 迁移到 `src/game/turnEngine.js`。

### 需要迁移的函数

| 函数 | 位置 | 说明 |
|------|------|------|
| `startNextTurn` | App.jsx | 回合流转核心，~340 行 |
| `checkWin` | App.jsx | 胜利条件检查，~40 行 |
| `playerDrawCard` | App.jsx | 玩家抽牌包装，~10 行 |
| `aiDrawAndApply` | App.jsx | AI 抽牌包装，~10 行 |
| `handleCardDraw` | App.jsx | 抽牌核心逻辑，~110 行 |
| `aiHandleGodCard` | App.jsx | AI 处理神牌，~25 行 |
| `resolveGodEncounterForAI` | App.jsx | AI 邪神遭遇结算，~50 行 |
| `shouldTriggerGodResurrection` | App.jsx | 邪神复活判定，~10 行 |

### 依赖分析

```
startNextTurn
  -> playerDrawCard / aiDrawAndApply
       -> handleCardDraw
            -> aiHandleGodCard
                 -> resolveGodEncounterForAI
                      -> shouldTriggerGodResurrection
```

### 外部依赖（可直接从 game/ 导入）
- `copyPlayers`, `clamp`, `cardLogText`, `isWinHand`, `isZoneCard`, `isBlankZoneCard`
- `shuffle`
- `applyHpDamageWithLink`, `applyFx`, `applyInspectionForSanLoss`
- `makeInspectionMeta`
- `splitAnimBoundLogs` (game/animLogs)
- `localDisplayName` (game/rotateState)
- `withClearedTurnAnimFields` (game/turnAnimState)
- `GOD_DEFS`, `ROLE_*` (constants/card)

### 特殊处理
- `isLocalDebugEnabled` / `isLocalTestHost`：依赖 `window.location`，属于浏览器环境。
  **方案 A**：留在 App.jsx，作为参数 `isDebugMode` 传入 `aiDrawAndApply`。
  **方案 B**：在 `turnEngine.js` 中安全封装（检测 `typeof window !== 'undefined'`）。
  **推荐方案 A**，保持 game/ 模块纯逻辑。

### 测试策略
1. 迁移后先运行现有测试（105 个），确保无回归。
2. 补充 `startNextTurn` 的单元测试：
   - 正常回合流转
   - 休息角色跳过回合
   - CTH 翻面抽牌
   - NYA 千人千貌
   - skipNextDraw 处理
   - 两人一绳过期清理
   - 全局掉包效果过期

---

## 第3步：aiStep + AI 回合依赖链（高风险）

**目标**：将 AI 回合主控制器从 App.jsx 迁移到 `src/game/aiTurn.js`。

### 需要迁移的函数

| 函数 | 位置 | 说明 |
|------|------|------|
| `aiStep` | App.jsx | AI 回合主控制器，~683 行 |
| `discardAiHandToLimit` | App.jsx | AI 弃牌到上限，~10 行 |
| `moveEligibleBlankZones` | App.jsx | 空白区域牌移动，~20 行 |
| `cardsHuntMatch` | App.jsx | 追捕匹配规则，~8 行 |
| `clearPlayerGodZone` | App.jsx | 清理神牌区域，~10 行 |
| `applySanLossToPlayerWithInspection` | App.jsx | SAN 损失+检定，~15 行 |
| `abandonGodFollower` | App.jsx | 邪神抛弃信徒，~15 行 |
| `convertGodFollower` | App.jsx | 信徒改信，~15 行 |

### 依赖分析

```
aiStep
  -> checkWin, startNextTurn (第2步已迁移)
  -> discardAiHandToLimit
  -> moveEligibleBlankZones
  -> cardsHuntMatch
  -> aiHandleGodCard, resolveGodEncounterForAI (第2步已迁移)
  -> abandonGodFollower / convertGodFollower
       -> applySanLossToPlayerWithInspection
            -> applyInspectionForSanLoss (effectEngine.js)
       -> clearPlayerGodZone
```

### 外部依赖（可直接导入）
- `copyPlayers`, `cardLogText`, `isWinHand`, `isZoneCard`
- `applyHpDamageWithLink`, `applyFx`, `applyInspectionForSanLoss`
- `removeCardsFromDiscard`, `makeInspectionMeta`
- `shuffle`
- AI 决策函数（全部已在 `src/game/ai.js`）：
  `aiChooseRevealCard`, `aiChooseHunterLootCards`, `chooseAiRoseThornTarget`,
  `chooseAiCultistBewitchPlan`, `decideAiSkillUsage`, `getHunterChaseTargets`,
  `canCultistWinByBewitch`, `canCultistEmptyHandByBewitch`,
  `isCultistEndingTurnUnreasonable`, `aiShouldNotRest`
- `withClearedTurnAnimFields` (game/turnAnimState)
- `ROLE_*`, `GOD_DEFS` (constants/card)

### 风险点
1. **状态机复杂度**：`aiStep` 涉及 10+ 个 phase 分支（`FIRST_COME_PICK`, `PEEK_HAND`, `DAMAGE_LINK`, `ROSE_THORN`, `CAVE_DUEL`, `HUNTER_CHASE` 等），每个分支返回不同的 gs patch。
2. **动画字段**：`aiStep` 设置了大量 `_animXxx`、`_preSkillXxx`、`_aiHuntEvents` 等动画系统字段，与 App.jsx 的动画队列紧密耦合。
3. **循环追捕**：追猎者可以在同一回合内连续追捕多个目标，涉及 `huntContinue` 状态循环。

### 推荐执行顺序
1. 先完成第2步，确保 `startNextTurn` 和 `checkWin` 已在外部模块中稳定运行。
2. 将 `aiStep` 的**辅助函数**先迁移（`discardAiHandToLimit`, `moveEligibleBlankZones`, `cardsHuntMatch`, `clearPlayerGodZone`, `applySanLossToPlayerWithInspection`, `abandonGodFollower`, `convertGodFollower`）。
3. 最后迁移 `aiStep` 本体，此时所有依赖都已在外部模块中。

### 测试策略
1. 运行完整测试套件（105+ 个）。
2. 建议用 `sim_scripts/simulate_claude.js` 跑多轮完整游戏模拟，验证 AI 行为无回归。
3. 关键路径人工测试：
   - 追猎者 AI 连续追捕多个目标
   - 邪祀者 AI 蛊惑后触发 firstComePick / peekHand / damageLink
   - 穴居人战争 AI vs AI
   - 玫瑰倒刺 + 手牌上限弃牌触发伤害
   - AI 从手牌信仰神牌 + 改信/抛弃逻辑

---

## 预估收益

| 步骤 | 预计减少 App.jsx 行数 | 风险等级 |
|------|----------------------|----------|
| 第1步（已完成） | ~80 行 | 低 |
| 第2步 | ~550 行 | 中 |
| 第3步 | ~800 行 | 高 |
| **合计** | **~1430 行** | - |

当前 App.jsx 约 13000 行，三步完成后可降至约 11500 行。
