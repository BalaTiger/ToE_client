# 非主界面功能样板清单

共 167 个可直接定位的功能界面 / 可见状态：对局 18、系统 7、联机 15、决策 33、目标 15、信息 8、教学 55、演出 6、结算 9、开发 1。

此表与 `src/dev/VisualGallery.jsx` 的实际场景一致。入口仅在开发模式启用：`?ui-gallery=1&scene=role`；截图入口附加 `&clean=1`。导航下拉列表按功能分类。可通过 `&expansion=群星呼唤` 选择扩展主题；默认地神的潜影。

## 样板与素材边界

卡牌维持 **392:590** 原始比例。所有样板复用真实功能组件，游戏规则流程、音频编排与 Socket 会话不启动；按钮仅切换样板、修改本地展示值或给出确认反馈。页面加载正常读取公共图片和字体资源。

- 身份选择、暂停、断线、退出、阶段/目标、技能/区域决策：实际 `BattleScreen` / `BattleDecisionModals`。
- 联机入口、改名：实际 `OnlineOptionsDialog`；大厅、房间、隐私确认：实际 lobby 组件。
- 胜利、失败、共同获胜、联机返回：实际 `GameResultScreen`。
- 关于、版本计划、完整日志、弃牌浏览、卡牌详情：实际生产组件。
- 教学使用真实脚本文案和当前 DOM 高亮矩形；只有可见步骤列为功能界面，自动过渡不重复列为屏幕。
- 演出复用实际动画并保留生命周期；重新选择场景会从头播放，截图需等待对应画面时刻。
- `settings` 可直接展开视听设置；亮度、音乐、音效只写该样板组件状态。
- `card-clarity` 对照同一张长说明区域牌【C1 石化配方】的 82 / 124 / 196 / 300 px 实际宽度，另含邪神与衍生牌。全部使用真实 `DDCard`，保留手牌外置编号 / 牌名；手机换行或横向滚动，不压缩和拉伸卡面。
- 数值是固定 fixture。`displayStats` 与展示快照在无动画的样板中一致，不改写生产动画数值所有权。

AI 美术生成板用于造型、纹理和切图；此目录对应的可点击样板用于确认真实文本、控件、卡牌比例、布局、等待态和响应式行为。两者不得混称。

## 场景索引

| 分类 | scene ID | 界面 / 状态 | 实际分支 |
|---|---|---|---|
| 对局 | `battle` | 行动阶段 | 固定展示分支 |
| 对局 | `role` | 选择本局身份 | 固定展示分支 |
| 对局 | `battle-mp` | 联机行动与倒计时 | 固定展示分支 |
| 对局 | `battle-spectate` | 死亡旁观 | 固定展示分支 |
| 对局 | `battle-status` | 信仰、翻面与状态标记 | 固定展示分支 |
| 对局 | `battle-ai` | 等待其他旅者行动 | AI_TURN |
| 对局 | `battle-empty` | 空手牌 | 固定展示分支 |
| 对局 | `discard` | 超出手牌上限 · 选择弃牌 | DISCARD_PHASE |
| 对局 | `hunt-reveal` | 追捕 · 亮出手牌 | PLAYER_REVEAL_FOR_HUNT |
| 对局 | `hunt-wait` | 追捕 · 等待亮牌 | HUNT_WAIT_REVEAL |
| 对局 | `hunt-confirm` | 追捕 · 匹配与放弃 | HUNT_CONFIRM |
| 对局 | `bury-alive` | 活埋 · 手牌选择 | BURY_ALIVE_SELECT |
| 对局 | `ignite-torch` | 引燃火炬 · 手牌选择 | IGNITE_TORCH_DISCARD |
| 对局 | `albino-creature` | 白化生物 · 火焰牌响应 | ALBINO_CREATURE_SELECT_CARD |
| 对局 | `cave-duel-card` | 穴居人战争 · 手牌选择 | CAVE_DUEL_SELECT_CARD |
| 对局 | `cave-duel-wait` | 穴居人战争 · 等待亮牌 | CAVE_DUEL_WAIT_REVEAL |
| 对局 | `swap-give` | 掉包 · 交回一张牌 | SWAP_GIVE_CARD |
| 对局 | `bewitch-card` | 蛊惑 · 选择手牌 | BEWITCH_SELECT_CARD |
| 系统 | `pause` | 单人暂停 | 固定展示分支 |
| 系统 | `exit` | 退出对局确认 | 固定展示分支 |
| 系统 | `reconnect` | 恢复当前对局连接 | 固定展示分支 |
| 系统 | `connection-error` | 连接失败 | 固定展示分支 |
| 系统 | `settings` | 视听设置 | 固定展示分支 |
| 系统 | `emoji` | 联机表情选择 | 固定展示分支 |
| 系统 | `announcement` | 服务器公告 | 固定展示分支 |
| 联机 | `online` | 联机入口 · 创建与加入 | 固定展示分支 |
| 联机 | `online-loading` | 联机入口 · 连接中 | 固定展示分支 |
| 联机 | `online-rename` | 联机用户名编辑 | 固定展示分支 |
| 联机 | `online-rename-cooldown` | 联机改名 · 冷却中 | 固定展示分支 |
| 联机 | `online-special-name` | 联机用户名 · 特殊名字 | 固定展示分支 |
| 联机 | `lobby` | 游戏大厅 · 房间列表 | 固定展示分支 |
| 联机 | `lobby-empty` | 游戏大厅 · 暂无房间 | 固定展示分支 |
| 联机 | `lobby-loading` | 游戏大厅 · 加载中 | 固定展示分支 |
| 联机 | `room` | 联机房间 · 房主未准备 | 固定展示分支 |
| 联机 | `room-ready` | 联机房间 · 已准备 | 固定展示分支 |
| 联机 | `room-member` | 联机房间 · 成员视角 | 固定展示分支 |
| 联机 | `room-private` | 联机房间 · 私密 | 固定展示分支 |
| 联机 | `room-start` | 联机房间 · 开始倒计时 | 固定展示分支 |
| 联机 | `room-kick` | 联机房间 · 准备截止倒计时 | 固定展示分支 |
| 联机 | `privacy` | 公开房间确认 | 固定展示分支 |
| 决策 | `draw` | 区域探寻 · 取舍 | DRAW_REVEAL |
| 决策 | `draw-wait` | 区域探寻 · 等待他人 | DRAW_REVEAL |
| 决策 | `draw-error` | 区域探寻 · 可重试错误 | DRAW_REVEAL |
| 决策 | `god` | 邪神降临 · 信仰 | GOD_CHOICE |
| 决策 | `god-keep` | 邪祀者 · 邪神收入手牌 | GOD_CHOICE |
| 决策 | `god-upgrade` | 邪神之力升级 | GOD_CHOICE |
| 决策 | `god-convert` | 改信新神 | GOD_CHOICE |
| 决策 | `god-forced` | 被迫改信 | GOD_CHOICE |
| 决策 | `god-wait` | 邪神降临 · 等待他人 | GOD_CHOICE |
| 决策 | `dodge` | 寻宝者闪避选择 | TREASURE_DODGE_DECISION |
| 决策 | `dodge-aoe` | 群体效果闪避 | TREASURE_AOE_DODGE_DECISION |
| 决策 | `dodge-wait` | 群体效果 · 等待闪避 | TREASURE_AOE_DODGE_DECISION |
| 决策 | `nya-borrow` | 千人千貌 · 借用身份 | NYA_BORROW |
| 决策 | `zhu-hide` | 衔烛照幽 · 藏到牌底 | 固定展示分支 |
| 决策 | `zhu-wait` | 衔烛照幽 · 等待他人 | 固定展示分支 |
| 决策 | `slime` | 赐福黏液 · HP/SAN 平分 | TSG_SLIME_BALANCE |
| 决策 | `slime-wait` | 赐福黏液 · 等待他人 | TSG_SLIME_BALANCE |
| 决策 | `etherealize` | 半物质化 · 转移伤害 | ETHEREALIZE_DECISION |
| 决策 | `etherealize-chain` | 半物质化 · 连续转移 | ETHEREALIZE_DECISION |
| 决策 | `etherealize-wait` | 半物质化 · 等待他人 | ETHEREALIZE_DECISION |
| 决策 | `tortoise` | 灵龟卜祝 · 选择编号 | TORTOISE_ORACLE_SELECT |
| 决策 | `tortoise-wait` | 灵龟卜祝 · 等待他人 | TORTOISE_ORACLE_SELECT |
| 决策 | `peek` | 血之窥探 | 固定展示分支 |
| 决策 | `first-come` | 先到先得 · 选牌 | FIRST_COME_PICK_SELECT |
| 决策 | `first-come-wait` | 先到先得 · 等待他人 | FIRST_COME_PICK_SELECT |
| 决策 | `grave-dig` | 掘墓 · 选邪神牌 | GRAVE_DIG_SELECT |
| 决策 | `grave-dig-wait` | 掘墓 · 等待他人 | GRAVE_DIG_SELECT |
| 决策 | `same-abyss` | 同归深渊 · 手牌或 HP | SAME_ABYSS_SELECT |
| 决策 | `same-abyss-wait` | 同归深渊 · 等待他人 | SAME_ABYSS_SELECT |
| 决策 | `sphinx` | 斯芬克斯 · 猜测牌堆 | SPHINX_GUESS |
| 决策 | `sphinx-wait` | 斯芬克斯 · 等待他人 | SPHINX_GUESS |
| 决策 | `decipher` | 解读石刻 · 卡牌分配 | DECIPHER_STONE_CARVING |
| 决策 | `decipher-wait` | 解读石刻 · 等待他人 | DECIPHER_STONE_CARVING |
| 目标 | `swap-blind` | 掉包 · 暗抽选择 | 固定展示分支 |
| 目标 | `swap-shuffle` | 掉包 · 洗牌 | 固定展示分支 |
| 目标 | `swap-public` | 掉包 · 公开手牌选择 | SWAP_SELECT_TARGET_CARD |
| 目标 | `hunt-public` | 追捕 · 死者手牌选择 | HUNT_SELECT_CARD_FROM_PUBLIC |
| 目标 | `target-swap` | 掉包 · 目标选择 | SWAP_SELECT_TARGET |
| 目标 | `target-hunt` | 追捕 · 目标选择 | HUNT_SELECT_TARGET |
| 目标 | `target-bewitch` | 蛊惑 · 目标选择 | BEWITCH_SELECT_TARGET |
| 目标 | `target-zone-swap` | 交换手牌 · 目标选择 | ZONE_SWAP_SELECT_TARGET |
| 目标 | `target-peek` | 血之窥探 · 目标选择 | PEEK_HAND_SELECT_TARGET |
| 目标 | `target-cave-duel` | 穴居人战争 · 目标选择 | CAVE_DUEL_SELECT_TARGET |
| 目标 | `target-damage-link` | 两人一绳 · 目标选择 | DAMAGE_LINK_SELECT_TARGET |
| 目标 | `target-rose-thorn` | 玫瑰倒刺 · 目标选择 | ROSE_THORN_SELECT_TARGET |
| 目标 | `target-multiply` | 繁衍 · 目标选择 | MULTIPLY_SELECT_TARGET |
| 目标 | `target-shu` | 黑山羊幼仔 · 目标选择 | SHU_SELECT_TARGET |
| 目标 | `target-etherealize` | 半物质化 · 目标选择 | ETHEREALIZE_SELECT_TARGET |
| 信息 | `about` | 关于游戏与规则 | 固定展示分支 |
| 信息 | `roadmap` | 版本更新计划 | 固定展示分支 |
| 信息 | `full-log` | 完整游戏日志 | 固定展示分支 |
| 信息 | `full-log-empty` | 完整游戏日志 · 空状态 | 固定展示分支 |
| 信息 | `discard-pile` | 弃牌堆浏览 | 固定展示分支 |
| 信息 | `card-zone-detail` | 区域牌详情 | 固定展示分支 |
| 信息 | `card-god-detail` | 邪神牌详情与等级 | 固定展示分支 |
| 信息 | `card-clarity` | 卡牌清晰度 · 82 / 124 / 196 / 300 px | 真实 DDCard 尺寸对照 |
| 教学 | `tutorial-welcome` | 教学欢迎 | 固定展示分支 |
| 教学 | `soft-rest` | 休息提示 | 固定展示分支 |
| 教学 | `soft-flip` | 翻面提示 | 固定展示分支 |
| 教学 | `tutorial-intro` | 遗迹入口 | 教学脚本 intro |
| 教学 | `tutorial-boardSelf` | 心智 | 教学脚本 boardSelf |
| 教学 | `tutorial-boardStats` | 丧失心智 | 教学脚本 boardStats |
| 教学 | `tutorial-boardRole` | 身份 | 教学脚本 boardRole |
| 教学 | `tutorial-boardHand` | 寻宝者 | 教学脚本 boardHand |
| 教学 | `tutorial-boardDecks` | 宝藏 | 教学脚本 boardDecks |
| 教学 | `tutorial-cardTypes` | 追猎者 | 教学脚本 cardTypes |
| 教学 | `tutorial-hunterGoal` | 肃清 | 教学脚本 hunterGoal |
| 教学 | `tutorial-cultistIntroRules` | 邪祀者 | 教学脚本 cultistIntroRules |
| 教学 | `tutorial-cultistGoalRules` | 复苏 | 教学脚本 cultistGoalRules |
| 教学 | `tutorial-drawZoneCard` | 探索 | 教学脚本 drawZoneCard |
| 教学 | `tutorial-drawGodCard` | 邪神化身 | 教学脚本 drawGodCard |
| 教学 | `tutorial-bagLimit` | 行囊有限 | 教学脚本 bagLimit |
| 教学 | `tutorial-treasureIntro` | 寻宝者：只差一步 | 教学脚本 treasureIntro |
| 教学 | `tutorial-treasureStartTurn` | 回合开始 | 教学脚本 treasureStartTurn |
| 教学 | `tutorial-treasureDrawReveal` | 收入手牌 | 教学脚本 treasureDrawReveal |
| 教学 | `tutorial-treasureDodgePrompt` | 求生技能 | 教学脚本 treasureDodgePrompt |
| 教学 | `tutorial-treasureDodgeResult` | 求生成功 | 教学脚本 treasureDodgeResult |
| 教学 | `tutorial-treasureUseSkill` | 发动掉包 | 教学脚本 treasureUseSkill |
| 教学 | `tutorial-treasureSelectTarget` | 选择目标 | 教学脚本 treasureSelectTarget |
| 教学 | `tutorial-treasureStealCard` | 抽取对手手牌 | 教学脚本 treasureStealCard |
| 教学 | `tutorial-treasureGiveCard` | 交还一张牌 | 教学脚本 treasureGiveCard |
| 教学 | `tutorial-treasureResult` | 宝藏完成 | 教学脚本 treasureResult |
| 教学 | `tutorial-hunterIntro` | 追猎者：连续进攻 | 教学脚本 hunterIntro |
| 教学 | `tutorial-hunterUseSkill` | 发动追捕 | 教学脚本 hunterUseSkill |
| 教学 | `tutorial-hunterSelectTarget` | 选择猎物 | 教学脚本 hunterSelectTarget |
| 教学 | `tutorial-hunterReveal` | 对手亮牌 | 教学脚本 hunterReveal |
| 教学 | `tutorial-hunterConfirmCard` | 弃牌造成伤害 | 教学脚本 hunterConfirmCard |
| 教学 | `tutorial-hunterSecondHuntIntro` | 继续追捕 | 教学脚本 hunterSecondHuntIntro |
| 教学 | `tutorial-hunterUseSkill2` | 再次发动追捕 | 教学脚本 hunterUseSkill2 |
| 教学 | `tutorial-hunterSelectTarget2` | 选择猎物 | 教学脚本 hunterSelectTarget2 |
| 教学 | `tutorial-hunterReveal2` | 对手亮牌 | 教学脚本 hunterReveal2 |
| 教学 | `tutorial-hunterConfirmCard2` | 完成击杀 | 教学脚本 hunterConfirmCard2 |
| 教学 | `tutorial-hunterResult` | 猎物倒下 | 教学脚本 hunterResult |
| 教学 | `tutorial-cultistZoneIntro` | 邪祀者：蛊惑区域牌 | 教学脚本 cultistZoneIntro |
| 教学 | `tutorial-cultistZoneUseSkill` | 发动蛊惑 | 教学脚本 cultistZoneUseSkill |
| 教学 | `tutorial-cultistZoneSelectCard` | 选择蛊惑牌 | 教学脚本 cultistZoneSelectCard |
| 教学 | `tutorial-cultistZoneSelectTarget` | 选择目标 | 教学脚本 cultistZoneSelectTarget |
| 教学 | `tutorial-cultistZoneResult` | SAN 归零 | 教学脚本 cultistZoneResult |
| 教学 | `tutorial-cultistGodIntro` | 邪神牌、骷髅头与改信 | 教学脚本 cultistGodIntro |
| 教学 | `tutorial-cultistGodStatusMarkers` | 骷髅与邪神之力 | 教学脚本 cultistGodStatusMarkers |
| 教学 | `tutorial-cultistGodOpponentDraw` | 遭遇邪神 | 教学脚本 cultistGodOpponentDraw |
| 教学 | `tutorial-cultistGodCheckIntro` | 检定牌 | 教学脚本 cultistGodCheckIntro |
| 教学 | `tutorial-cultistGodConvertCheck` | 改信代价 | 教学脚本 cultistGodConvertCheck |
| 教学 | `tutorial-cultistGodPlayerDraw` | 轮到你 | 教学脚本 cultistGodPlayerDraw |
| 教学 | `tutorial-cultistGodKeepHand` | 收入邪神牌 | 教学脚本 cultistGodKeepHand |
| 教学 | `tutorial-cultistGodSelectCard` | 蛊惑邪神牌 | 教学脚本 cultistGodSelectCard |
| 教学 | `tutorial-cultistGodChooseCard` | 选择邪神牌 | 教学脚本 cultistGodChooseCard |
| 教学 | `tutorial-cultistGodSelectTarget` | 强迫改信 | 教学脚本 cultistGodSelectTarget |
| 教学 | `tutorial-cultistGodResult` | 邪神复苏 | 教学脚本 cultistGodResult |
| 教学 | `tutorial-finalAdvice` | 最后忠告 | 教学脚本 finalAdvice |
| 教学 | `tutorial-complete` | 开始探索 | 教学脚本 complete |
| 演出 | `treasure-win` | 寻宝者 · 藏宝图揭示 | 固定展示分支 |
| 演出 | `treasure-wait` | 藏宝图 · 等待获胜者 | 固定展示分支 |
| 演出 | `resurrection` | 邪神复活 | 固定展示分支 |
| 演出 | `role-reveal-0` | 身份揭示 · 寻宝者 | 固定展示分支 |
| 演出 | `role-reveal-1` | 身份揭示 · 追猎者 | 固定展示分支 |
| 演出 | `role-reveal-2` | 身份揭示 · 邪祀者 | 固定展示分支 |
| 结算 | `result-treasure` | 结算 · 寻宝者获胜 | 固定展示分支 |
| 结算 | `result-treasure-other` | 结算 · 其他寻宝者获胜 | 固定展示分支 |
| 结算 | `result-treasure-joint` | 结算 · 两名寻宝者共同获胜 | 固定展示分支 |
| 结算 | `result-hunter` | 结算 · 追猎者获胜 | 固定展示分支 |
| 结算 | `result-cultist` | 结算 · 邪祀者获胜 | 固定展示分支 |
| 结算 | `result-other-team` | 结算 · 其他阵营获胜 | 固定展示分支 |
| 结算 | `result-defeat` | 结算 · 英魂殒落 | 固定展示分支 |
| 结算 | `result-all-dead` | 结算 · 全员覆灭 | 固定展示分支 |
| 结算 | `result-mp` | 结算 · 返回联机房间 | 固定展示分支 |
| 开发 | `debug-settings` | 本地调试设置 | 固定展示分支 |

## 自动检查

`npm exec vitest -- run src/dev/VisualGallery.test.jsx` 检查 scene ID 唯一性，并逐一渲染全部样板以发现 fixture 漏参 / 未导出组件。此检查不代替桌面、手机横屏、手机竖屏的实际浏览器截图验收。
