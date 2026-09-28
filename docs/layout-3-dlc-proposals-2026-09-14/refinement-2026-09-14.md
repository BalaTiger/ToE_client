# 3 号布局比例与间距调整

日期：2026-09-14。状态：已完成本地实现、浏览器复检和构建检查；未发布线上。

本轮按用户要求继续调整字体与组件比例，增加玩家手牌和中央牌堆之间的安全空隙，同时让手牌靠近右侧按钮，并用专门制作的图片替换暂停、设置入口的临时字符图标。沿用已确认的 3A 构图、右侧按钮排列和四色内部底图，不重画游戏卡面。

## 字体、比例与手牌空间

桌面布局以 1200px 设计宽度统一缩放；面板、提示和按钮采用该构图的字号，避免继承其他布局的字体补偿后比例失衡。信仰旗帜和日志允许文本换行，HP/SAN 继续使用条状显示，SAN=6 仅保留刻度线。

纯计算集中在 [coastalGeometry.js](../../src/components/battle/coastalGeometry.js)，由 [CoastalBattleLayout.jsx](../../src/components/battle/CoastalBattleLayout.jsx) 测量其他角色区域的实际下缘，并向手牌和牌堆传入同一组尺寸。计算计入扇形卡牌旋转后的上下角边界，为悬停抬起预留 **22px**、选中再抬起 **5px**，再留 **20px** 净空；手牌区与右侧按钮列之间保留 **16px** 间距。上述数字均为设计坐标，随桌面构图同比例缩放。日志下缘依据操作栏实际顶部保留12px空隙，内容在布旗内部滚动，避免文字被提示框盖住。

牌面沿用 **392:590** 比例，相邻卡牌保持 **20%** 重叠。卡宽同时受横向空间和牌堆下方高度约束；其他角色内容过高时允许画布增高，避免挤压实时牌面。空手牌与少量手牌保留各自尺寸上限。小屏继续使用可滚动的完整手牌与可达按钮。

相关样式：[coastal-layout.css](../../src/components/battle/coastal-layout.css)、[coastal-panels.css](../../src/components/battle/coastal-panels.css)、[coastal-hand.css](../../src/components/battle/coastal-hand.css)。卡面与悬停分别由 [HandArea.jsx](../../src/components/battle/HandArea.jsx) 和 [battle.css](../../src/components/battle/battle.css) 保留原行为；牌堆继续调用游戏现有组件和主题资源。

## 暂停与设置专用图标

使用 **内置 image_gen 工具**生成两枚旧铜、暗青绿底的圆形按钮，随后通过现有 Sharp 去除生成结果的外部棋盘底，保留原画主体，不安装依赖或重新绘制。

| 用途 | 运行素材 | 母图 | 导出体积 |
| --- | --- | --- | --- |
| 暂停 | [system-pause.webp](../../public/img/ui/coastal/system-pause.webp) | [production-system-pause-master.png](production-system-pause-master.png) | 32,084 字节 |
| 设置 | [system-settings.webp](../../public/img/ui/coastal/system-settings.webp) | [production-system-settings-master.png](production-system-settings-master.png) | 31,210 字节 |

两张 1254×1254 RGB 母图均裁去余边，以 `contain` 缩至 **256×256** 透明 WebP；不把大母图交给运行时。压缩参数为质量 94、alpha 质量 100，按钮在产品中以 44px 尺寸显示，保留焦点轮廓和可访问名称。图标下方不增加文字。

生产记录：[提示词](production-system-icons-prompts.json)、[提取参数与 SHA-256 清单](production-system-icons.json)、[独立提取脚本](../../scripts/extract-coastal-system-icons.mjs)、[深底 256px / 48px 检查图](system-icons-dark-preview.png)。提取脚本包含尺寸、透明四角和不透明中心检查；原 13 项 UI 素材与原清单未被本次提取覆盖。

## 最终验证与截图

9个聚焦测试文件共 **242项通过**，覆盖共同几何、实际组件、卡面与所有功能界面渲染。`npm run lint`、`npm run build`通过；构建保留原有大chunk提示，资源清单版本为 `5c4c9d55f6e9fe1d`。

浏览器实测覆盖1280×720、1600×900、2548×1303、1920×800，以及390×844。桌面手牌与按钮图像约18–38px间距；手牌与牌堆未抬升时约66–105px净空。1280×720的引燃选牌场景中，已选中卡牌获得焦点后，与悬停使用同一22px抬升规则，实测仍留26.8px净空。窗口较矮时允许纵向滚动，优先保留控件尺寸及卡牌间隔。手机按钮180×44px、专用系统图标44×44px，无横向页面溢出或缺失图片。专用暂停与设置图标的点击行为均实测通过。

最终实机图：[1600桌面](refined-1600-desktop.png)、[用户原始窗口尺寸](refined-2548-desktop.png)、[两张手牌](refined-two-cards.png)、[八张手牌](refined-eight-cards.png)、[宽矮窗口](refined-wide-short.png)、[选中且抬升](refined-selected-raised.png)、[手机](refined-mobile.png)。[实际DOM测量记录](refined-runtime-measurements.json)保留边界数值；截图均来自真实组件，不是生成效果图。
