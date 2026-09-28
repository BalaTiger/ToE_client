# 写实火把火焰素材

本素材由 JangaFX 官方 CC0 `Small Camp Fire` 体积序列在 Blender 5.0.1 中重新渲染，具有连续流体运动，不是单张图片扭曲或逐帧生图。官方下载页及授权说明：
https://jangafx.com/software/embergen/download/free-vdb-animations

官方源文件：
https://www.mediafire.com/file/9xx9icyomy2txv7/SmallCampfireVDB.zip/file

完整 CC0 授权副本见 `JangaFX-CC0.txt`。源 ZIP 的 SHA-256 保存在运行素材的 `flame-atlas.json` 中。EmberGen 是源素材的制作工具，不作为游戏依赖；无需购买或安装它即可使用该 CC0 素材。

## 运行规格

- `public/img/effects/torch/flame-atlas.webp`：2048×3072，8 列×6 行，48 帧，每帧 256×512，24 fps，2 秒循环。
- 透明 RGBA8、straight alpha、sRGB；下载约 1.05 MB，完整解码像素 24 MiB。
- `flame-still.webp`：静态回退及加载占位。
- 火焰底部锚点为帧的 `(0.5, 0.8)`，不在图片最底边。保留外围透明区域以容纳火舌高度变化及有限泛光。
- 建议首轮火焰整帧显示为约 150×300 逻辑像素，再按火把头和实际窗口构图调整；固定底部锚点，避免随帧包围盒抖动。

## 制作与复现

1. 从上面的官方链接下载 ZIP，放到本目录 `source/SmallCampfireVDB.zip`，解压到 `source/`。预期 VDB 路径为 `source/smallCampfire/smallCampfireVDB/smallCampfire_0000.vdb`。
2. 运行 `blender --background --factory-startup --python render_fire.py`。脚本渲染原序列第 40～99 帧，Cycles 256 samples；以 `flames` 网格驱动黑体温度和发光强度。为火把构图收窄火源并锁定正交相机，排除灰烟，保存场景线性半浮点 EXR 及 numpy 像素缓存。
3. 使用装有 numpy 与 Pillow 的 Python 运行 `pack_fire.py`。最后 12 帧与开头 12 帧在场景线性空间平滑交叠，形成 48 帧正向循环。没有倒放火焰。
4. 打包脚本生成运行图集、静态帧、元数据、联系表和动画预览，并检查帧数、透明区域、循环接缝的变化量。

源文件和离线 EXR/numpy 缓存通过本目录 `.gitignore` 排除，不进入网页包。运行环境没有 Blender、numpy 或 Pillow 依赖。

## 色彩与验收

EXR 母版保存的是基于体积和黑体模型渲染的线性发光，而非拍摄得到的 HDR。运行图集经过适合 SDR 的色调映射和少量局部泛光，再转成透明 straight alpha。浏览器 HDR 分支以场景线性增益增强这套纹理；`emissionGain: 3` 为艺术参数，不能称作恢复原始辐射亮度。没有把普通 PNG 另存 EXR 冒充 HDR 母版。

`flame-contact-sheet.png` 展示每隔 6 帧的外形；`flame-loop-preview.webp` 为循环预览。测试得到循环末帧到首帧的线性像素平均差为 0.02119，普通相邻帧的中位数为 0.02121，没有额外的接缝跳变。相机已为最高火舌补足上方余量；第 19 帧可见火焰上缘距图片顶边 28 px，所有 48 帧四边的 alpha 最大值为 2/255，仅剩不可察觉的泛光尾端。打包脚本包含四边裁切断言。已检查明亮金白色火芯、较暗橙色火舌、透明边缘和微弱局部泛光；显示屏真实 HDR 和手机持续功耗由游戏集成阶段另行验证。
