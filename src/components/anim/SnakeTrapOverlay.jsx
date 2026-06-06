import React from 'react';

const SNAKE_COUNT = 12;
const SNAKE_COLORS = [
  '#4a7c59', '#5a8c69', '#3d6b4a', '#6a9c79',
  '#2d5b3a', '#7aac89', '#4d8a5c', '#3a7a4a',
  '#5a9a6a', '#2a6a3a', '#6aba7a', '#3a5a4a',
];

function SnakeRay({ angle, color, delay, duration }) {
  const rad = (angle * Math.PI) / 180;
  const distance = 360;
  const tx = Math.cos(rad) * distance;
  const ty = Math.sin(rad) * distance;
  const midTx = Math.cos(rad) * (distance * 0.55);
  const midTy = Math.sin(rad) * (distance * 0.55);
  const wiggleOffset = Math.sin(angle * 3) * 18;

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 4,
        height: 4,
        marginLeft: -2,
        marginTop: -2,
        transformOrigin: '50% 50%',
        '--snake-tx': `${tx}px`,
        '--snake-ty': `${ty}px`,
        '--snake-mid-tx': `${midTx + wiggleOffset}px`,
        '--snake-mid-ty': `${midTy + wiggleOffset * 0.6}px`,
        opacity: 0,
        animation: `snakeCrawl ${duration}s cubic-bezier(0.22, 0.61, 0.36, 1) ${delay}s both`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: -6,
          top: -6,
          width: 14,
          height: 14,
          borderRadius: '50% 50% 40% 40%',
          background: `radial-gradient(circle at 35% 30%, ${color}, #1a2a1a)`,
          boxShadow: `0 0 6px ${color}88, 0 0 12px ${color}44`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: -4,
          top: -10,
          width: 8,
          height: 4,
          borderRadius: '50%',
          background: '#e8c87a',
          opacity: 0.7,
        }}
      />
    </div>
  );
}

function BiteParticle({ angle, distance, delay }) {
  const rad = (angle * Math.PI) / 180;
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: 5,
        height: 5,
        marginLeft: -2.5,
        marginTop: -2.5,
        borderRadius: '50%',
        background: 'radial-gradient(circle, #c8e8a0, #4a8c5a)',
        boxShadow: '0 0 6px #6aba7a88',
        '--bite-tx': `${Math.cos(rad) * distance}px`,
        '--bite-ty': `${Math.sin(rad) * distance}px`,
        opacity: 0,
        animation: `biteParticle 0.55s ease-out ${delay}s both`,
      }}
    />
  );
}

function FangFlash({ x, y, delay }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 24,
        height: 24,
        marginLeft: -12,
        marginTop: -12,
        opacity: 0,
        animation: `fangFlash 0.38s ease ${delay}s both`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 6,
          top: 0,
          width: 0,
          height: 0,
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderTop: '14px solid #e8e8e8',
          opacity: 0.85,
          filter: 'drop-shadow(0 0 4px #a0c8a0)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 6,
          bottom: 0,
          width: 0,
          height: 0,
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderBottom: '14px solid #e8e8e8',
          opacity: 0.85,
          filter: 'drop-shadow(0 0 4px #a0c8a0)',
        }}
      />
    </div>
  );
}

export function SnakeTrapOverlay({ anim, exiting }) {
  const rayAngles = Array.isArray(anim?.rayAngles) ? anim.rayAngles : [];
  const assignmentList = Array.isArray(anim?.assignmentList) ? anim.assignmentList : [];
  const msgs = (anim?.msgs || []).slice(-3);
  const totalLayers = anim?.totalLayers || assignmentList.length;

  const particles = React.useMemo(() => {
    const list = [];
    for (let i = 0; i < 20; i++) {
      const angle = (i * 18) + (Math.random() * 8 - 4);
      const distance = 80 + Math.random() * 200;
      list.push({ angle, distance, delay: 0.9 + Math.random() * 1.2 });
    }
    return list;
  }, []);

  const fangFlashes = React.useMemo(() => {
    return assignmentList.map((a, i) => ({
      x: `${30 + (a.idx % 4) * 20}%`,
      y: `${25 + Math.floor(a.idx / 4) * 30}%`,
      delay: 0.85 + i * 0.18,
    }));
  }, [assignmentList]);

  return (
    <div
      className="snake-trap-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        pointerEvents: 'none',
        overflow: 'hidden',
        animation: exiting ? 'snakeTrapFadeOut 0.22s ease-in forwards' : 'none',
      }}
    >
      {/* 暗绿背景暗角 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 50% 50%, rgba(15,35,18,0.55) 0%, rgba(3,8,4,0.88) 65%, rgba(0,0,0,0.96) 100%)',
          animation: 'snakeTrapBgIn 0.35s ease both',
        }}
      />

      {/* 中央牌堆发光 */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 80,
          height: 80,
          marginLeft: -40,
          marginTop: -40,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(74,140,90,0.28), rgba(30,70,40,0.12) 52%, transparent 72%)',
          animation: 'snakeTrapCenterPulse 1.8s ease-in-out both',
        }}
      />

      {/* 放射状蛇 */}
      {rayAngles.map((angle, i) => (
        <SnakeRay
          key={i}
          angle={angle}
          color={SNAKE_COLORS[i % SNAKE_COLORS.length]}
          delay={0.1 + i * 0.04}
          duration={0.72}
        />
      ))}

      {/* 蛇身拖尾 */}
      {rayAngles.map((angle, i) => (
        <div
          key={`trail-${i}`}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 3,
            height: 28,
            marginLeft: -1.5,
            marginTop: -14,
            background: `linear-gradient(to bottom, ${SNAKE_COLORS[i % SNAKE_COLORS.length]}66, transparent)`,
            borderRadius: 2,
            transformOrigin: '50% 0%',
            transform: `rotate(${angle}deg)`,
            opacity: 0,
            animation: `snakeTrail 0.55s ease-out ${0.1 + i * 0.04}s both`,
          }}
        />
      ))}

      {/* 咬击粒子 */}
      {particles.map((p, i) => (
        <BiteParticle key={`p-${i}`} {...p} />
      ))}

      {/* 毒牙闪烁 */}
      {fangFlashes.map((f, i) => (
        <FangFlash key={`f-${i}`} {...f} />
      ))}

      {/* 闪白 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#e8f0e0',
          opacity: 0,
          animation: 'snakeTrapWhiteFlash 2.6s linear both',
        }}
      />

      {/* 闪黑 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: '#000',
          opacity: 0,
          animation: 'snakeTrapBlackFlash 2.6s linear both',
        }}
      />

      {/* 震屏层 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          animation: 'snakeTrapQuake 2.6s linear both',
        }}
      />

      {/* 中毒层数标记 */}
      {assignmentList.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            animation: 'snakeTrapCountIn 0.55s ease 1.6s both',
          }}
        >
          <div
            style={{
              fontFamily: "'Cinzel Decorative', 'Cinzel', serif",
              fontSize: 38,
              fontWeight: 700,
              color: '#8ae0a0',
              textShadow: '0 0 20px #4a8c5a88, 0 0 40px #2a5a3a44',
              letterSpacing: 2,
            }}
          >
            群蛇陷阱
          </div>
          <div
            style={{
              fontFamily: "'Cinzel', serif",
              fontSize: 14,
              color: '#6aba7a',
              letterSpacing: 3,
            }}
          >
            {totalLayers} 层中毒已分配
          </div>
        </div>
      )}

      {/* 消息 */}
      {msgs.length > 0 && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '18%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            animation: 'snakeTrapMsgsIn 0.45s ease 1.8s both',
          }}
        >
          {msgs.map((msg, i) => (
            <div
              key={i}
              style={{
                fontFamily: "'IM Fell English', 'Georgia', serif",
                fontStyle: 'italic',
                fontSize: 12.5,
                color: '#a8d8b0',
                opacity: 0.92,
                textAlign: 'center',
                maxWidth: 420,
                lineHeight: 1.7,
                textShadow: '0 0 8px rgba(74,140,90,0.35)',
              }}
            >
              {msg}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
