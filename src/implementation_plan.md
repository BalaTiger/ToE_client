# 前端拆分记录

这个文件只保留当前仍有参考价值的拆分方向，避免旧计划误导后续维护。

## 已完成

- 游戏初始化、检定牌堆与回合推进逻辑已迁入 `src/game/`。
- 动画队列核心逻辑已拆入 `src/game/animQueueCore.js`、`src/game/animQueueHelpers.js` 和 `src/hooks/useAnimationQueue.js`。
- 常用动画组件已迁入 `src/components/anim/`。
- 房间倒计时、联机弃牌倒计时、克苏鲁抉择倒计时和视觉弃牌堆同步已迁入 `src/hooks/`。

## 下一步建议

1. 继续按低风险优先拆分 `App.jsx` 中的联机同步与计时逻辑。
2. 再拆用户界面组件，例如神牌选择、摸牌确认、弃牌确认等弹窗。
3. 每次拆分后运行 `npm.cmd run lint`、`npm.cmd run test:run` 和 `npm.cmd run build`。

## 注意

- `App.jsx` 中部分 hook 警告是有意读取 ref 的设计，处理前必须确认依赖语义。
- 涉及动画顺序的修改应优先补充 `src/game/__tests__/animQueueHelpers.test.js` 或相邻纯函数测试。
