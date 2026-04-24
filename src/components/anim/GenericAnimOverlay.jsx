import React from 'react';
import { ANIM_CFG, DICE_FACES } from './data';

// ── Generic Overlay Anim ──────────────────────────────────────
export function GenericAnimOverlay({ anim, exiting }) {
  if (!anim) return null;
  if (['HP_DAMAGE', 'HP_HEAL', 'SAN_HEAL', 'SAN_DAMAGE'].includes(anim.type)) return null;
  const cfg = ANIM_CFG[anim.type];
  if (!cfg) return null;
  const msgs = (anim.msgs || []).slice(-4);

  // 地动山摇专属效果
  const isEarthquake = anim.type === 'EARTHQUAKE';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      background: cfg.overlay,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      animation: exiting ? 'animFadeOut 0.18s ease-in forwards' : 'animFadeIn 0.12s ease-out forwards',
      ...(isEarthquake && {
        animation: 'earthquakeShake 1.2s ease-in-out, earthquakeFlash 0.15s ease-in-out 3',
        filter: isEarthquake ? 'grayscale(0%)' : 'none',
      }),
    }}>
      {cfg.vig && <div style={{ position: 'absolute', inset: 0, boxShadow: `inset 0 0 120px ${cfg.accent}55`, animation: 'animVig 0.6s ease-in-out', pointerEvents: 'none' }} />}

      {/* 地动山摇石块效果 */}
      {isEarthquake && Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          width: 10 + Math.random() * 20,
          height: 10 + Math.random() * 20,
          background: '#8a6a40',
          borderRadius: Math.random() * 5,
          left: Math.random() * 100 + '%',
          top: -30,
          animation: `rockFall ${0.8 + Math.random() * 0.4}s ease-in forwards`,
          animationDelay: Math.random() * 0.5 + 's',
          zIndex: 1000,
        }} />
      ))}

      <div style={{
        fontSize: 80, lineHeight: 1, marginBottom: 12,
        textShadow: `0 0 40px ${cfg.accent}, 0 0 80px ${cfg.accent}66`,
        animation: cfg.shake ? 'animShake 0.45s ease-in-out' : 'animPop 0.4s ease-out',
        filter: `drop-shadow(0 0 20px ${cfg.accent})`,
      }}>{cfg.icon}</div>
      <div style={{
        fontFamily: "'Cinzel',serif", fontWeight: 700, letterSpacing: 5, fontSize: 20,
        color: cfg.accent, textShadow: `0 0 24px ${cfg.accent}`,
        marginBottom: 18, textTransform: 'uppercase',
      }}>{cfg.title}</div>
      {msgs.length > 0 && (
        <div style={{
          background: 'rgba(0,0,0,0.6)', border: `1px solid ${cfg.accent}44`, borderRadius: 4,
          padding: '10px 24px', maxWidth: 380, textAlign: 'center',
        }}>
          {msgs.map((m, i) => (
            <div key={i} style={{
              fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic',
              color: '#c8a96e', fontSize: 12.5, lineHeight: 1.8, opacity: 0.9,
            }}>{m}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Dice Roll Animation ───────────────────────────────────────
export function DiceRollAnim({ anim, exiting }) {
  const { d1, d2, rollerName, dodgeSuccess } = anim;
  const [, setFrame] = React.useState(0);
  const [settled, setSettled] = React.useState(false);
  React.useEffect(() => {
    const FRAMES = 12; let i = 0;
    const iv = setInterval(() => {
      i++;
      setFrame(f => f + 1);
      if (i >= FRAMES) { clearInterval(iv); setSettled(true); }
    }, 100);
    return () => clearInterval(iv);
  }, []);
  const face1 = settled ? DICE_FACES[d1 - 1] : DICE_FACES[Math.floor(Math.random() * 6)];
  const face2 = settled ? DICE_FACES[d2 - 1] : DICE_FACES[Math.floor(Math.random() * 6)];
  const winner = Math.max(d1, d2);
  const isDodgeRoll = d2 === 0;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(4,2,0,0.94)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      animation: exiting ? 'animFadeOut 0.18s ease-in forwards' : 'animFadeIn 0.12s ease-out forwards',
    }}>
      <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 120px #c8a96e22', pointerEvents: 'none' }} />
      <div style={{ fontFamily: "'Cinzel',serif", color: '#b89858', fontSize: 11, letterSpacing: 4, marginBottom: 18, textTransform: 'uppercase' }}>
        {rollerName || '？'} {isDodgeRoll ? '掷骰子' : '选择休息'}
      </div>
      <div style={{ display: 'flex', gap: 36, marginBottom: 20 }}>
        {[{ face: face1, val: d1 }, ...(!isDodgeRoll ? [{ face: face2, val: d2 }] : [])].map(({ face }, i) => (
          <div key={i} style={{
            fontSize: 88, lineHeight: 1,
            color: '#c8a96e',
            textShadow: settled ? '0 0 30px #c8a96e88, 0 0 60px #8a6030' : '0 0 10px #c8a96e44',
            filter: settled ? 'drop-shadow(0 0 12px #c8a96e88)' : 'none',
            animation: settled ? 'animPop 0.3s ease-out' : '',
            transition: 'text-shadow 0.3s, filter 0.3s',
          }}>{face}</div>
        ))}
      </div>
      {settled && (
        <div style={{ animation: 'animFadeIn 0.3s ease-out' }}>
          {isDodgeRoll ? (
            <>
              <div style={{
                fontFamily: "'Cinzel',serif", fontSize: 13, color: dodgeSuccess ? '#4ade80' : '#e08888', letterSpacing: 3,
                textAlign: 'center', marginBottom: 6,
              }}>
                {dodgeSuccess ? '成功规避负面效果！' : '未能规避，触发负面效果！'}
              </div>
              <div style={{ fontFamily: "'IM Fell English',serif", fontStyle: 'italic', color: '#6a9a6a', fontSize: 12, textAlign: 'center', letterSpacing: 1 }}>
                掷出 {d1} 点，{d1 >= 4 ? '规避成功' : '规避失败'}
              </div>
            </>
          ) : (
            <>
              <div style={{
                fontFamily: "'Cinzel',serif", fontSize: 13, color: '#c8a96e', letterSpacing: 3,
                textAlign: 'center', marginBottom: 6,
              }}>
                取最大值 <span style={{ color: '#4ade80', fontSize: 18, fontWeight: 700 }}>{winner}</span>
              </div>
              <div style={{ fontFamily: "'IM Fell English',serif", fontStyle: 'italic', color: '#6a9a6a', fontSize: 12, textAlign: 'center', letterSpacing: 1 }}>
                回复 {winner} HP，翻面休息中…
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function YourTurnAnim({ name }) {
  const text = name ? `${name}的回合` : '你的回合';
  const col = name ? '#c8a0e8' : '#e8c87a';
  const glow = name ? '#a080d099' : '#c8a96e99';
  const glow2 = name ? '#a080d044' : '#c8a96e44';
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2500, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{
        fontFamily: "'Cinzel Decorative','Cinzel',serif",
        fontSize: 32, fontWeight: 700, letterSpacing: 8,
        color: col,
        textShadow: `0 0 40px ${glow}, 0 0 80px ${glow2}`,
        animation: 'yourTurnFade 2.0s ease-in-out forwards',
        whiteSpace: 'nowrap',
      }}>{text}</div>
    </div>
  );
}
