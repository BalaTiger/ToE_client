左手持火把：截图效果图与动画制作评估（2026-09-16）

本次完成截图编辑效果图与制作方案评估。尚未替换游戏素材、实现火焰动画或验证实机 HDR。

推荐组合：生图制作左手和火把实体，CC0 火焰体积序列在 Blender 中离线渲染，游戏用局部画布播放；支持的设备走真正 HDR，其余设备显示同一火焰的 SDR 版本。

本次文件：`battle-before.png` 为新截取的完整对局样板，`torch-concept.png` 为内置 image_gen 编辑结果，`imagegen-prompt.txt` 保存完整提示词。效果图用于确定构图和材质；图中被模型重绘的小字和牌面不作为生产素材。

构图采用第一人称左手从左下伸入，木柄斜向右上，火舌主要向上。火把头占棋盘左侧空白，保持与检定牌堆和手牌的间隔；计数面板在袖口前方。角色面板下的小骷髅是游戏标记，不在本次替换范围内。

| 路线 | 可用性与限制 | 建议 |
| --- | --- | --- |
| CC0 VDB 序列＋Blender 渲染 | 连续体积运动、视角与发光可调；需筛选火焰形状、检查体积通道并处理循环接缝 | 首选 |
| Blender 自制 Fire 流体 | 可针对倾斜火把头设置燃烧源，最容易保持着火位置与方向；需模拟和渲染时间 | 现成序列不合适时采用 |
| 生图逐帧生成／图生视频 | 生图适合定手、木柄和单帧火焰质感；独立生成多帧容易不连续。图生视频还需锁定木柄、扣透明、处理循环，并另外建立高动态发光数据 | 不作为首选动画来源；当前工具只完成了静态效果图 |
| 现有游戏火焰精灵 | 32 帧手牌上扫火带，非固定火把的持续燃烧形态 | 只参考播放与加载方式 |

可立即进入筛选的开放素材：JangaFX 官方 Free VDB 页面将这些体积序列标为 CC0，允许用于自己的项目；`Simple Fire` 为 64.7 MB／101 帧，`Small Camp Fire` 为 59 MB／200 帧。这里的容量是离线母版，不是游戏需下载的容量。页面未承诺这两项无缝循环，也未列出各体积网格的具体内容，下一步需实测。资产使用 CC0 不代表 EmberGen 软件本身开源；渲染可以使用 Blender。[官方素材与许可](https://jangafx.com/software/embergen/download/free-vdb-animations)

OpenGameArt 的 Animated Fire 是 CC0，但只有 64×64 的像素风序列，不符合本次写实目标。[素材页](https://opengameart.org/content/animated-fire)

建议制作约 3 秒、24～30 fps 的循环作为首轮样片，火焰母版使用较高分辨率，游戏初始测试 256×512 的局部帧。火舌、轻烟、少量火星与照亮手背／木柄的遮罩分开制作。选取稳定燃烧段，再检查循环接缝；不要直接倒放火焰，因为浮升运动会反向。上述数值是待验证的制作起点，并非已完成素材规格。

保留线性浮点 EXR 母版与独立发光数据，再转换为网页运行纹理。浏览器只播放预渲染帧，避免实时计算体积流体。不能将普通 8 位生图简单另存为 EXR 就视为获得原始 HDR 高光。Blender 支持浮点 OpenEXR；其渲染输出不因为 Blender 使用 GPL 就要求游戏采用 GPL。[格式文档](https://docs.blender.org/manual/en/5.0/files/media/image_formats.html)、[作品许可说明](https://www.blender.org/about/license/)

HDR 输出建议使用小范围 WebGPU Canvas，配置 `rgba16float` 与 `toneMapping: { mode: 'extended' }`，在线性空间合成火焰发光和泛光。这个配置允许输出高于 SDR 白色的亮度；CSS 模糊／阴影本身不等于真正 HDR。普通纹理也可以在 shader 中人为提升发光，但这属于艺术调校，不能宣称恢复了原始拍摄的高光信息。[Chrome 官方 HDR Canvas 说明](https://developer.chrome.com/blog/new-in-webgpu-129)

HDR 必须做浏览器、显卡、操作系统和显示器的联合验收。`dynamic-range: high` 只表示设备能力，不证明 HDR 模式已启用；透明画布、页面合成和 Gamma 调整也要实测。API 初始化成功同样不等于已证明屏幕输出 HDR。失败时回退到 SDR 色调映射，保留写实运动和适度泛光。本次 PNG 效果图仅展示 SDR 构图与光感。[W3C 能力查询定义](https://www.w3.org/TR/mediaqueries-5/#dynamic-range)

本地工程接入点：

- `public/img/ui/coastal/foreground.webp` 把左下骷髅／台座、右侧触手和底边烘焙在同一张图内。需要清除左侧旧装饰、补好原处底图，再提供独立透明的左手＋无火焰火把素材，保留右侧和底沿。
- `src/components/battle/CoastalBattleLayout.jsx`、`coastal-layout.css` 负责挂载与层级。手与火把按左下锚点等比缩放；火焰单独锚在火把头，使用相同构图倍率，`pointer-events: none`。计数、手牌、牌堆与提示等功能元素优先保持可见。
- `src/hooks/useGamePreferences.js` 当前在 `document.body` 使用 brightness／contrast 滤镜。HDR 接入前需拆分 SDR 场景的 Gamma 处理与 HDR 层的曝光控制，并复查原先依赖 body 滤镜的固定定位。不能只把画布 portal 到 body 就认为已绕过该滤镜。
- 项目没有现成 WebGPU／WebGL 渲染器；只为局部火焰增加最小播放能力即可。游戏暂停、隐藏标签页、低性能设备的帧率与加载策略应一并处理。不要把整套高精度离线 VDB 或全部 float16 大图集直接加载进网页。
- 现有 `ignite_torch_flame_sweep_spritesheet.webp` 用于 760 ms 手牌上扫效果，不能直接充当此火把。已有火声文件可供之后按需使用，本次不新增声音。

后续制作顺序：定稿构图 → 清理前景并拆出静态手／火把 → 筛选两个 CC0 VDB 候选并制作循环样片 → 输出透明色彩、发光与照明素材 → 局部 SDR／HDR 播放 → 在四主题、1.6～1.9 安全比例、长手牌及持续效果场景验收遮挡和亮度。
