# 黏液额外摸邪神牌的遭遇动画：事件归属机制

更新时间：2026-08-15

## 背景

AI 回合开始时，撒托古亚的赐福黏液带来的额外摸牌是**同步结算**的（不进入
`AI_GOD_CHOICE`）。额外摸到邪神牌时，「遭遇邪神」的 SAN 扣减、SAN 检定、
放弃/信仰在同一调用栈内完成，而动画只能事后从状态里回放。

曾出现的 bug：邪神翻牌动画播完后直接跳到下一次摸牌（如解读石刻），
SAN 扣减、检定翻牌、弃牌动画全部丢失。

## 设计原则

规则层在结算时就知道这次遭遇产出了哪些事件。归属信息必须由规则层**显式
记录**，呈现层只按 id 归队，禁止：

- 按步骤类型 / 队列位置在扁平效果队列里猜测切块（已删除的
  `splitSlimeGodEncounterDrawEffects` / `interleaveSlimeGodEncounterBlock`）；
- 扫描「放弃了邪神的馈赠」等日志文本推断结算结果（呈现层或规则层都不行）；
- 由呈现层补造规则层没有发出的步骤（已删除的 `slimeGodDiscardStep`）。

这与 `src/README_structure.md` 的原则一致：规则结算拥有 canonical
`_visualEvents`，任何入口不得从事后快照重建回合开始/摸牌/检定/属性事件。

## 数据流

```
handleCardDrawCore（邪神牌、AI、同步路径）
  └─ 返回 godEncounter = {
       statSeqs,        // 本次遭遇产出的 _statEvents 序号（水位差，结算当场记录）
       inspectionSeqs,  // 本次遭遇产出的 _inspectionEvents 序号
       discardedGod,    // 结构化弃牌结果（resolveGodEncounterForAI 返回，非日志推断）
     }
resolveNextTurnState 黏液循环
  └─ 生成 canonical DRAW_CARD 事件并挂到 event.godEncounter
startNextTurn
  ├─ 把遭遇的 SAN 扣减从打包的 STAT_EVENTS 事件里按序号拆成独立事件
  ├─ 弃牌结果发 canonical 事件 VISUAL_EVENT.GOD_GIFT_DISCARD
  │    （编译器 case → DISCARD 步骤，见 visualEventTransactionCompiler.js）
  └─ 把这些事件的 id 写回 DRAW_CARD.godEncounter.visualEventIds
buildTurnStartDrawReplayQueue（turnAnimState.js）
  └─ 按 visualEventId ∈ godEncounter.visualEventIds 从扁平效果队列精确归队，
     插到对应 DRAW_CARD（翻牌步骤带 visualEventId）之后、下一张摸牌之前
```

播放顺序：邪神翻牌 → SAN 扣减 → 检定翻牌（含翻面等检定流程步骤）→ 弃牌 →
下一张摸牌。新状态只广播 `_visualEvents`；`_turnDrawEvents` 仅作为旧存档/旧 peer
兼容输入。联机远程回放
走同一个 `buildTurnStartDrawReplayQueue`，行为一致。

## 事件消费与去重

- 遭遇块步骤都携带 `visualEventId`，经
  `getVisualEventIdsCoveredByAnimationQueue` 进入消费集，多人广播/重播不会重复播放。
- `startNextTurn` 里原有的 legacySeq 去重（同步路径下 canonical 检定事件与
  `_inspectionEvents` 提升的去重）仍然保留，与本机制正交。

## 边界情况

- SAN 充足无检定（`inspectionSeqs` 为空）：归属只含 SAN 扣减 + 弃牌。
- 邪祀者免疫 SAN 损耗（无属性/检定事件）：归属只含弃牌事件。
- 信仰/升级/收入手牌（`discardedGod` 为空）：不发 `GOD_GIFT_DISCARD`，
  不补弃牌动画。
- 归属 id 在呈现层匹配不到步骤（如远程已消费）：效果块留在原扁平队列位置，
  不会静默丢失也不会重复。

## 回归测试

`src/game/__tests__/aiSlimeGodDrawAnim.test.js` 覆盖：

- 完整场景（黏液摸到伏行之混沌并放弃 → 固定摸解读石刻）：元数据不丢失、
  归属 id 结构化存在、播放顺序、SAN/检定/弃牌各只出现一次、弃牌步骤携带
  来源事件 id；
- SAN 充足无检定场景：SAN 扣减与弃牌仍紧随邪神翻牌。
