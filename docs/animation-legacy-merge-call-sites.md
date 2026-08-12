# legacyMerge 调用名单

更新时间：2026-08-12

## 口径

- `triggerAnimQueue` 现为 App 侧迁移适配器，所有调用必须显式传入 `authority`；缺失会在事务准备阶段直接抛错。
- 本名单只统计生产代码，不包含测试中对 `mergeAnimationTransactionQueue` 的直接调用。
- `App.jsx` 正式对局、教学及调试调用点已全部显式声明动画权威。联机动画执行器已不再回退。
- 当前没有“纯 events 状态”直接进入播放器的生产调用：这类远端输入会先在回放规划阶段编译一次，再以成品 `queue` 进入播放器。
- 行号对应本次迁移完成后的工作树。

## 特殊保留

- `resolveActionQueueMeta` 对真正未覆盖事件的精确 ID 补编译仍暂时保留；不会重新编译已由成品队列覆盖的事件。
- 旧合并器和枚举保留到实测完成后的最终删除阶段，但播放器已不再直接调用它们。

## 优先级定义

| 优先级 | 含义 |
| --- | --- |
| **P0** | 同一结算中同时存在技能、邪神状态、属性变化、弃牌或后续决策，最容易发生跨阶段重排、状态回退或后续动画抢跑，应优先迁移。 |
| **P1** | 高频主流程或多段强制结算。当前没有已知故障，但二次编译可能重复、补漏或改变顺序。 |
| **P2** | 单张卡牌/单个技能的局部流程，影响面较小，适合按机制成批迁移。 |
| **P3** | 教学、开发调试或单步展示。几乎不携带并行规则事件，可最后处理。 |

## P0：先消除双权威风险

| 游戏机制 | 玩家看到的过程 | 调用位置 | 风险说明 |
| --- | --- | --- | --- |
| AI 完整行动结算 | AI 摸牌后执行信仰、技能、追捕、伤害、弃牌，再进入下一回合 | `executeAiTurn` | **已迁出**：行动段的掉包、追捕、蛊惑、繁衍、斯芬克斯、休息及回合末梦境重播均由成品队列排序。覆盖校验同时识别直接绑定的视觉事件和队列已携带的属性事件，避免休息/地下泉被误判为未覆盖后触发全量 legacy 合并；真正未知的事件只按其精确 ID 补编译。 |
| 被追捕玩家亮牌及追捕结果 | 亮出手牌、弃牌/掠夺、伤害、决定是否继续追捕、衔接下回合 | `playerRevealForHunt`：8198、8287、8291、8301；`huntSelectCardFromPublic`：8134；`executeAiTurn`：2347 | **已迁出**：所有追捕相关 `triggerAnimQueue` 改为 `resolveActionQueueMeta` 动态选择权威。覆盖检查会排除前一追捕阶段已经消费的事件；队列覆盖全部未消费 action 事件时使用 `queue` 权威并消费精确事件 ID，只有真正未覆盖的新事件才会 dev 告警并安全回退到 `legacyMerge action-scope`。 |
| 邪神遭遇后的玩家选择 | 信仰/升级/收入手牌/弃置、旧邪神牌离场、SAN 变化、检定与胜负 | `godResolvePlayer`：8739、8773 | ~~与本次蛊惑问题属于同类：邪神 tag、弃牌、SAN 和检定必须共享一套阶段顺序。~~ **第一阶段已迁出**：`8739` 弃置分支、`8773` 信仰/升级/收入分支已显式传入 `queue` 权威，并手动补入 `GOD_POWER_BLOCKED` 步骤。 |
| AI 邪神选择 | AI 信仰、转信或放弃邪神馈赠，随后检定/弃牌/继续行动 | 顶层回调：1676、2114、2125、2143 | ~~当前显式补过“放弃邪神牌弃牌动画”，说明 diff 队列本身并不完整，适合优先改为单一事务。~~ **已迁出**：`playPendingAiGodEncounterInspection`、`resolvePendingAiGodChoice` 及其 continuation 均通过 `resolveActionQueueMeta` 校验，覆盖完整时以 `queue` 权威提交，未覆盖时安全回退。 |
| 检定牌结算 | SAN 损失后翻检定牌，再应用检定牌伤害、死亡或后续选择 | 顶层检定监听：1912 | ~~检定经常夹在邪神/卡牌结算中；默认合并可能将属性步骤移到翻牌前后错误位置。~~ **已迁出**：`buildInspectionEventFlow` 队列已覆盖检定链；通过 `resolveActionQueueMeta` 校验，完整时以 `queue` 权威提交。若同包仍有其他未迁移事件，仅通过 `compileEventIds` 请求补编译，只有编译成功的事务事件才会被消费。 |
| 连锁目标结算 | 一张牌依次作用多个目标，期间可能暂停等待规避、伤害分摊、虚化或黏液平衡 | `finishTargetContinuation`：6259、6264、6269、6274、6278 | ~~一个机制拆成多次队列与回调，后续目标可能在前一目标状态动画完成前开始。~~ **已迁出**：`finishTargetContinuation` 所有分支统一通过 `resolveActionQueueMeta` 选择权威；覆盖完整时以 `queue` 权威提交，`nextGs=null` 的回调续算分支也会通过只读 `compileState` 补编译真正缺失的事件。 |
| 撒托古亚黏液平衡决定 | 伤害后选择消耗/分配黏液，再继续原始伤害或摸牌流程 | `resolveTsathogguaSlimeBalance`：6342、6367、6394、6474 | ~~同时修改手牌、属性和阶段，且会恢复被暂停的原始结算，存在状态快照回退风险。~~ **已迁出**：所有黏液平衡分支通过 `resolveActionQueueMeta` 校验，覆盖完整时以 `queue` 权威提交。 |

## P1：高频主流程与多段强制结算

| 游戏机制 | 玩家看到的过程 | 调用位置 | 迁移理由 |
| --- | --- | --- | --- |
| 增殖之 Z 连续摸牌 | 公共牌进入触发队列，持有者连续摸牌并逐张结算 | `continueProliferatingZDraws` | **已迁出**：每段成品队列使用 `queue` 权威并精确消费已覆盖事件，跨抽回调不再二次编译。 |
| 撒托古亚额外摸牌 | 黏液消失、额外摸牌、强制牌/邪神牌结算，再检查是否继续 | `_tsgContinueTurnStartDraw` | **已迁出**：黏液消失、邪神选择、强制收入/弃置和亮牌等待队列均显式使用成品队列。 |
| 拉莱耶之梦休息摸牌 | 梦境动画、连续摸牌、邪神遭遇、检定及回合交接 | `_cthContinueRestDraws` | **已迁出**：梦境、连续摸牌、邪神/检定及强制牌续算均使用 `queue` 权威。 |
| 无尽通道/回合结束重播 | 回合末逐张打出手牌、掷骰、结算效果，最后进入下一回合 | `beginEndTurnReplay`、`continueEndTurnReplay` | **已迁出**：展开、邪神遭遇、强制牌、普通决策牌及胜负分支均以 `queue` 为唯一权威；手工队列覆盖的属性事件会精确映射并消费对应 visual event ID，旧事件不再在通道动画前二次编译。 |
| 回合结束调度器 | 反转顺序、黄液发放、无尽通道、状态提交 | `dispatchEndTurnEvent`；`kickoffEndTurnSeq`；`runTsgSlimeGrantEvent` | **已迁出**：调度种子、方向反转和黄液发放队列均显式使用成品队列。 |
| 摸牌后选择收入 | 普通牌/邪神牌收入、效果结算、检定、胜负或进入目标选择 | `handleDrawKeep` | **已迁出**：收入、效果、检定、胜负及连续摸牌分支统一通过 `resolveActionQueueMeta` 校验；完整队列使用 `queue` 权威，避免残留 `_inspectionEvents` 在后续投掷石块结算中被 legacy 提升并重播。无尽通道分支继续使用其专用覆盖元数据。 |
| 摸牌后选择弃置 | 弃置翻开的牌、继续休息/黏液/无尽通道或进入行动阶段 | `handleDrawDiscard`：5819、5823、5827、5834 | 弃牌动画必须先于后续连续摸牌或回合推进。 |
| 寻宝者规避 | 对单体或群体负面效果掷骰/跳过，成功则收入，失败则结算效果 | `handleTreasureDodgeRollMode`；`handleTreasureDodgeSkipMode` | **已迁出**：普通、休息、黏液、待胜利和无尽通道分支均显式选择对应队列权威。 |
| 斯芬克斯猜牌后的规避 | 猜测结果、可能的规避骰、卡牌效果和属性变化 | `settleSphinxDodge` | **已迁出**：结算队列使用 `queue` 权威。 |
| 全手牌交换 | 选择目标后交换双方全部手牌，处理公共牌触发与后续状态 | `zoneSwapSelectTarget` | **已迁出**：胜利、休息、黏液及普通续算共用同一权威队列元数据。 |
| 虚化连锁 | 将效果重定向给相邻目标，逐段结算链式损失 | `continueOrSettleEtherealizeChain` | **已迁出**：逐段消费与状态提交队列使用 `queue` 权威。 |
| 阿波菲斯目标前奏 | 黑夜骰/目标锁定先于原技能或卡牌效果播放 | `setGsWithApophisTargetAnim`：6190 | 这是公共队列包装器；迁移后可一次覆盖多种目标技能。 |
| 玫瑰倒刺反应伤害 | 标记手牌离开后自动造成 HP 伤害，可能触发死亡/分摊 | 顶层监听 | **已迁出**：自动监听生成的完整伤害队列使用 `queue` 权威。 |
| 联机摸牌弃置超时 | 超时自动弃置翻开的牌，再判定胜负、手牌上限或推进回合 | 顶层超时处理：3804、3809、3850 | 涉及联机同步和回合推进，弃牌动画不能被新状态覆盖。 |
| 联机回合末自动弃牌 | 从右侧自动弃到手牌上限，再执行回合末事件 | `autoDiscardFromRight`：9508 | 是进入回合结束调度器之前的最后一段动画，应明确事务边界。 |

## P2：局部卡牌与角色技能

| 游戏机制 | 玩家看到的过程 | 调用位置 | 说明 |
| --- | --- | --- | --- |
| 玫瑰倒刺主动选目标 | 将标记牌送给目标或结算相关伤害 | `roseThornSelectTarget` | **已迁出**：含待胜利分支的转牌队列使用 `queue` 权威。 |
| 先到先得 | 目标从公开牌中选择并收入一张牌 | `firstComePickSelectCard` | **已迁出**：选牌转移及待胜利队列使用 `queue` 权威。 |
| 活埋 | 多名目标各选一张手牌放到牌堆底 | 顶层 AI 自动选择；`buryAliveSelectCard` | **已迁出**：AI 与玩家逐目标埋牌队列均使用 `queue` 权威。 |
| 解读石刻 | 展示石刻结果并应用对应效果 | `decipherStoneCarvingConfirm` | **已迁出**：确认结算队列使用 `queue` 权威。 |
| 龟甲神谕 | 从公开牌中按编号选择并移动卡牌 | `tortoiseOracleSelect` | **已迁出**：公开牌移动队列使用 `queue` 权威。 |
| 同坠深渊 | 选择目标并处理双方卡牌/属性变化 | `sameAbyssSelect` | **已迁出**：虚化暂停与最终伤害/弃牌结算均使用 `queue` 权威。 |
| 奈亚借牌结束 | 完成借牌摸取并恢复正常行动阶段 | `finishNyaBorrowDraw` | **已迁出**：摸牌与属性结算使用同一成品队列。 |
| 手牌上限手动弃牌 | 玩家确认弃牌后播放逐张弃置并进入回合结束 | `confirmDiscard` | **已迁出**：弃牌及下一回合阶段队列使用 `queue` 权威。 |
| 休息 | 休息骰、回血/回 SAN、邪神能力和后续强制摸牌 | `doRest` | **已迁出**：弃牌等待和直接推进下一回合分支均使用成品队列。 |

## P3：教学与开发调试

| 游戏机制 | 调用位置 | 说明 |
| --- | --- | --- |
| 教学行动通用收尾 | `finishTutorialActionWithState` | **已迁出**：未传专用元数据时根据成品队列生成 queue-authoritative 元数据。 |
| 教学脚本自动回合/摸牌 | 顶层教学回调 | **已迁出**：统一使用回合开始队列权威。 |
| 开发调试动画入口 | 顶层调试回调：7215、7266、7307、7367、7411、7453、7495 | 分别用于检定翻牌、盲鱼牌、邪神能力无效、黏液消失、不灭之躯、断头台、石化死亡等单步预览；不参与正式规则结算。 |

## 已移出 legacyMerge 的入口

- `triggerSyncedAnimTransaction`：本地与广播使用同一成品队列，`queue` 权威。
- 蛊惑后置阶段队列：`queue` 权威。
- `applyNextTurnGs` 与 `_onRoleRevealDone` 产生的回合边界、回合横幅、回合开始、摸牌阶段队列：`queue` 权威，并显式携带该阶段事件 ID。
- AI 行动段及其后单独播放的下一回合阶段队列：分别通过行动事件覆盖校验和阶段事件 ID，以 `queue` 权威提交。
- 联机 `DICE_ROLL` / `ANIM_QUEUE` / `START_ANIM`：视觉事件在远端回放规划阶段编译一次，播放器统一按 `queue` 权威执行。

## 第一阶段迁出计划（已执行，2026-08-06）

目标：先把**调用队列已经完整、且无需依赖规则事件二次编译**的调用点迁出 `legacyMerge`，并把仍必须保留的 `visualEventScope:'action'` 合并改为显式声明，同时增加开发期警告以便后续逐批清理。

### 已迁出

| 文件 | 原调用位置 | 迁移后 | 说明 |
| --- | --- | --- | --- |
| `src/App.jsx` | `3804`、`3809`、`3854` | 传入 `AUTHORITATIVE_QUEUE_META` | 联机摸牌弃置超时分支：`nextGs` 已显式清空 `_visualEvents`，队列 hand-built 完整，不再依赖合并 |
| `src/App.jsx` | `7215`、`7266`、`7307`、`7367`、`7411`、`7453`、`7495` | 传入 `AUTHORITATIVE_QUEUE_META` | 开发调试动画入口（仅 `import.meta.env.DEV`），队列自包含 |
| `src/App.jsx` | `executeAiTurn` 行动结束两分支 | 覆盖完整时传入带精确 `eventIds` 的 `AUTHORITATIVE_QUEUE_META` | 手工队列步骤绑定规则事件 ID，并在提交前证明当前行动事件已全部覆盖；未覆盖时告警并安全回退，不会把未知事件静默标记为已消费 |
| `src/App.jsx` | 追捕相关调用（`2347`、`8134`、`8198`、`8287`、`8301` 及 `8299` 结果段） | `resolveActionQueueMeta` 动态选择权威 | 与 `executeAiTurn` 同一套覆盖校验：先排除已由上一阶段消费的事件，再验证追捕亮牌、伤害/掠夺、继续追捕/回合交接队列；完整时用 `queue` 权威，真正缺失时才回退 action-scope 合并 |
| `src/App.jsx` | 顶层检定监听 `1912` | `resolveActionQueueMeta` 动态选择权威 | 检定链队列已覆盖 `_visualEvents` 中对应事件；完整时切 `queue` 权威，未覆盖时用 `compileEventIds` 限定 action-scope 补编译，空编译或未知事件不会被误消费 |
| `src/App.jsx` | AI 邪神选择（`1676`、`2114`、`2125`、`2143`） | `resolveActionQueueMeta` 动态选择权威 | AI 信仰/转信/放弃馈赠的检定与弃牌队列已接入覆盖校验 |
| `src/App.jsx` | `finishTargetContinuation` 所有分支 | `resolveActionQueueMeta` 动态选择权威 | 连锁目标结算的续算队列统一校验覆盖；`nextGs=null` 时以 `compileState` 提供规则事件状态源，但不把该状态作为 pending state 提交 |
| `src/App.jsx` | `resolveTsathogguaSlimeBalance` 所有分支 | `resolveActionQueueMeta` 动态选择权威 | 黏液平衡、伤害反应、续算队列统一校验覆盖，完整时以 `queue` 权威提交 |

### 已显式化（仍在用 `legacyMerge`，但不再依赖隐式回退）

| 文件 | 位置 | 说明 |
| --- | --- | --- |
| `src/App.jsx` | `resolveActionQueueMeta` 覆盖失败分支 | 仅作为未知或尚未接入事件的安全回退；`compileEventIds` 只限定编译输入，`compileState` 只提供只读规则状态，两者都不会直接确认消费或提交游戏状态 |

### 暂不删除

- `resolveActionQueueMeta` 的精确 ID 兼容补编译。
- `ANIMATION_QUEUE_AUTHORITY.LEGACY_MERGE` 与旧合并器实现；待实测无问题后删除。

### 开发期治理

- `prepareAnimationTransaction` 在缺少 `authority` 时直接抛错并累计诊断计数。
- ESLint 自定义规则禁止 `triggerAnimQueue` 缺少第四个事务参数。
- `scripts/check-animation-transactions.mjs` 锁定当前兼容引用基线，禁止任何生产文件新增 `legacyMerge`。
- `pretest:run` 和 `prebuild` 均自动执行静态门禁。
- 开发环境可通过 `window.__toeDebug.getAnimationTransactionDiagnostics()` 查看隐式权威、未覆盖事件与重编译计数。

### 验证

- `npm run lint`：仅存在与本次改动无关的既有错误/警告。
- `npm run test:run`：68 个测试文件、960 个测试全部通过。
- `npm run build`：生产构建成功。
- `npm run sim:headless`：100 局随机 AI 对战全部完成，无失败。

## 当前事务边界

- `src/game/animationTransaction.js`：播放前准备事务；兼容补编译只允许发生在这里。
- `src/hooks/useAnimationQueue.js`：只接受 `authority: 'queue'` 的完整事务，不读取或编译规则事件。
- `src/game/visualEventTransactionCompiler.js`：旧合并器暂时保留，最终删除阶段移除。
