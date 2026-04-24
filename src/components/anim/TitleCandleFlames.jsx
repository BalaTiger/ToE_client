import React, { useState, useEffect } from 'react';

// 确保将此组件定义在所有其他组件的【外部】，防止重新渲染时被销毁重置
export function TitleCandleFlames() {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    let animationFrameId;
    let lastTime = performance.now();
    const fps = 12; // 火焰动画帧率，可以根据需要调整 (10-15比较自然)
    const interval = 1000 / fps;

    const animate = (time) => {
      if (time - lastTime >= interval) {
        // 【修复1：必须使用函数式更新 prev => prev + 1，破解闭包陷阱】
        setFrame(prev => (prev + 1) % 16);
        lastTime = time;
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);

    // 组件卸载时清理动画帧
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // 4x4 序列帧，计算当前所在的列和行
  const col = frame % 4;
  const row = Math.floor(frame / 4);

  // 生成随机烛火位置
  const candlePositions = React.useMemo(() => {
    const positions = [];
    // 左侧烛火
    for (let i = 0; i < 7; i++) {
      const distance = Math.random(); // 0-1，0表示最近，1表示最远
      positions.push({
        side: 'left',
        x: -120 - Math.random() * 120,
        y: 60 - distance * 120, // 近处的烛火更低（位置偏下）
        scale: 0.5 + (1 - distance) * 0.6, // 近处的烛火更大
        distance: distance,
        delay: Math.random() * 2 // 随机初始延迟，错开动画
      });
    }
    // 右侧烛火
    for (let i = 0; i < 7; i++) {
      const distance = Math.random(); // 0-1，0表示最近，1表示最远
      positions.push({
        side: 'right',
        x: 120 + Math.random() * 120,
        y: 60 - distance * 120, // 近处的烛火更低（位置偏下）
        scale: 0.5 + (1 - distance) * 0.6, // 近处的烛火更大
        distance: distance,
        delay: Math.random() * 2 // 随机初始延迟，错开动画
      });
    }
    // 按距离排序，近处的烛火排在后面，显示层级更高
    return positions.sort((a, b) => a.distance - b.distance);
  }, []);

  // 为每个烛火生成随机的初始帧偏移
  const getFrameOffset = (delay) => {
    return Math.floor((delay / 2) * 16) % 16; // 2秒周期，16帧
  };

  const flameStyle = {
    position: 'absolute',
    width: '48px',  // 火焰的实际显示宽度
    height: '48px', // 火焰的实际显示高度（128*128每帧，缩小到48*48）
    backgroundImage: `url('/img/title_candle.png')`,

    // 4x4的图，背景尺寸必须是容器的 400%
    backgroundSize: '400% 400%',

    pointerEvents: 'none',
    maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0) 75%)',
    WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0) 75%)',
  };

  const glowStyle = {
    position: 'absolute',
    width: '32px', // 缩小到70%
    height: '32px', // 缩小到70%
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255,190,90,0.03) 0%, rgba(255,145,40,0.01) 40%, rgba(0,0,0,0) 76%)', // 透明度减半
    filter: 'blur(4px)', // 模糊效果也相应缩小
    pointerEvents: 'none',
  };

  return (
    <>
      {/* 主烛火和光晕 */}
      {/* 左侧主烛火 */}
      <div style={{
        ...glowStyle,
        top: '50%',
        left: 'calc(50% - 120px)',
        transform: 'translate(-50%, -40%)', // 光晕中心点在烛火中心点略偏下
        zIndex: 0
      }} />
      <div style={{
        ...flameStyle,
        top: '50%',
        left: 'calc(50% - 120px)',
        transform: 'translate(-50%, -50%)',
        backgroundPosition: `${(col / 3) * 100}% ${(row / 3) * 100}%`,
        zIndex: 1,
        opacity: 0.85
      }} />
      {/* 右侧主烛火 */}
      <div style={{
        ...glowStyle,
        top: '50%',
        right: 'calc(50% - 120px)',
        transform: 'translate(50%, -40%)', // 光晕中心点在烛火中心点略偏下
        zIndex: 0
      }} />
      <div style={{
        ...flameStyle,
        top: '50%',
        right: 'calc(50% - 120px)',
        transform: 'translate(50%, -50%)',
        backgroundPosition: `${(col / 3) * 100}% ${(row / 3) * 100}%`,
        zIndex: 1,
        opacity: 0.85
      }} />

      {/* 随机散布的烛火 */}
      {candlePositions.map((pos, index) => {
        // 为每个烛火计算独立的帧位置
        const frameOffset = getFrameOffset(pos.delay);
        const offsetCol = (frame + frameOffset) % 4;
        const offsetRow = Math.floor((frame + frameOffset) / 4);

        return (
          <React.Fragment key={index}>
            <div style={{
              ...glowStyle,
              top: `calc(50% + ${pos.y}px)`,
              left: pos.side === 'left' ? `calc(50% + ${pos.x}px)` : `calc(50% + ${pos.x}px)`,
              transform: `translate(-50%, -40%) scale(${pos.scale})`, // 光晕中心点在烛火中心点略偏下
              opacity: 0.3 + (1 - pos.distance) * 0.5, // 近处的光晕更亮
              zIndex: Math.floor((1 - pos.distance) * 5), // 近处的光晕层级更高
              animation: `titleFlameGlow 3.5s ease-in-out ${pos.delay}s infinite` // 错开呼吸动画
            }} />
            <div style={{
              ...flameStyle,
              top: `calc(50% + ${pos.y}px)`,
              left: pos.side === 'left' ? `calc(50% + ${pos.x}px)` : `calc(50% + ${pos.x}px)`,
              transform: `translate(-50%, -50%) scale(${pos.scale})`,
              backgroundPosition: `${(offsetCol / 3) * 100}% ${(offsetRow / 3) * 100}%`, // 错开序列帧
              opacity: 0.5 + (1 - pos.distance) * 0.4, // 近处的烛火更亮
              zIndex: Math.floor((1 - pos.distance) * 5) + 1, // 近处的烛火层级更高
              animation: `titleFlameFlicker 3.5s linear ${pos.delay}s infinite` // 错开呼吸动画
            }} />
          </React.Fragment>
        );
      })}
    </>
  );
}
