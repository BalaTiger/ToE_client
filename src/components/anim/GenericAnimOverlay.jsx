import React from 'react';
import { ANIM_CFG, DICE_FACES } from './data';
import { EarthquakeOverlay } from './EarthquakeOverlay';
import { CardFaceImage } from '../cards';

export function TorchWardOverlay({ anim, exiting }) {
  const targetPid = anim?.targetPid ?? 0;
  const [rect, setRect] = React.useState(null);
  React.useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector(`[data-pid="${targetPid}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const pad = Math.max(16, Math.min(40, Math.max(r.width, r.height) * 0.08));
      setRect({
        left: r.left - pad,
        top: r.top - pad,
        width: r.width + pad * 2,
        height: r.height + pad * 2,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [targetPid]);

  if (!rect) return null;
  const embers = [
    { left: '18%', top: '72%', delay: '0s', scale: 0.9 },
    { left: '34%', top: '14%', delay: '0.08s', scale: 0.65 },
    { left: '62%', top: '10%', delay: '0.16s', scale: 0.8 },
    { left: '78%', top: '66%', delay: '0.24s', scale: 0.7 },
    { left: '50%', top: '88%', delay: '0.32s', scale: 0.55 },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1800, pointerEvents: 'none' }}>
      <style>{`
        @keyframes torchWardIgnite {
          0% { opacity: 0; transform: scale(0.86); filter: blur(8px) brightness(0.8); }
          18% { opacity: 1; transform: scale(1.03); filter: blur(0) brightness(1.15); }
          72% { opacity: 0.9; transform: scale(1); filter: blur(0) brightness(1); }
          100% { opacity: 0; transform: scale(1.08); filter: blur(5px) brightness(0.9); }
        }
        @keyframes torchWardFlame {
          0%, 100% { transform: translateY(0) scaleY(1); opacity: 0.82; }
          40% { transform: translateY(-5%) scaleY(1.08); opacity: 1; }
          70% { transform: translateY(3%) scaleY(0.96); opacity: 0.72; }
        }
        @keyframes torchWardEmber {
          0% { transform: translate3d(0, 8px, 0) scale(0.5); opacity: 0; }
          18% { opacity: 1; }
          100% { transform: translate3d(0, -34px, 0) scale(1.2); opacity: 0; }
        }
      `}</style>
      <div style={{
        position: 'absolute',
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        animation: exiting ? 'animFadeOut 0.16s ease-in forwards' : 'torchWardIgnite 1.08s ease-out forwards',
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '48% 48% 44% 44% / 38% 38% 54% 54%',
          background: 'radial-gradient(ellipse at center, rgba(255,216,132,0.2) 0%, rgba(255,144,42,0.11) 46%, rgba(255,88,28,0.05) 66%, transparent 74%)',
          boxShadow: '0 0 22px rgba(255,184,72,0.78), inset 0 0 30px rgba(255,216,132,0.3), inset 0 -18px 28px rgba(255,86,18,0.16)',
        }} />
        <div style={{
          position: 'absolute',
          inset: '-2%',
          borderRadius: '50% 50% 46% 46% / 40% 40% 56% 56%',
          border: '2px solid rgba(255,196,86,0.82)',
          boxShadow: '0 0 18px rgba(255,142,36,0.85), inset 0 0 16px rgba(255,222,140,0.24)',
        }} />
        <div style={{
          position: 'absolute',
          left: '9%',
          right: '9%',
          bottom: '3%',
          height: '38%',
          borderRadius: '50%',
          background: 'linear-gradient(0deg, rgba(255,92,24,0.42), rgba(255,194,86,0.16) 48%, transparent 78%)',
          filter: 'blur(5px)',
          animation: 'torchWardFlame 0.46s ease-in-out infinite',
        }} />
        {embers.map((ember, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: ember.left,
            top: ember.top,
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#ffd27a',
            boxShadow: '0 0 10px #ff8a24',
            transform: `scale(${ember.scale})`,
            animation: `torchWardEmber 0.86s ease-out ${ember.delay} forwards`,
          }} />
        ))}
      </div>
    </div>
  );
}

export function VritraImmortalRevealOverlay({ anim, exiting }) {
  const cards = Array.isArray(anim?.cards) ? anim.cards.filter(Boolean) : [];
  const success = !!anim?.success;
  const titleColor = success ? '#f2c36b' : '#e0755f';
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1850,
      pointerEvents: 'none',
      background: 'radial-gradient(circle at center, rgba(90,24,14,0.38) 0%, rgba(12,4,2,0.94) 58%, rgba(4,1,0,0.98) 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      animation: exiting ? 'animFadeOut 0.18s ease-in forwards' : 'animFadeIn 0.14s ease-out forwards',
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        boxShadow: `inset 0 0 150px ${success ? '#c0402055' : '#80180866'}`,
      }} />
      <div style={{
        position: 'relative',
        width: 'min(880px, 92vw)',
        padding: '26px 28px 24px',
        border: '1.5px solid rgba(192,64,32,0.62)',
        borderRadius: 6,
        background: 'linear-gradient(180deg, rgba(28,8,5,0.94), rgba(10,4,2,0.92))',
        boxShadow: '0 0 34px rgba(192,64,32,0.35), inset 0 0 26px rgba(192,64,32,0.12)',
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: "'Cinzel',serif",
          fontWeight: 800,
          color: titleColor,
          fontSize: 19,
          letterSpacing: 5,
          textShadow: `0 0 18px ${titleColor}88`,
          textTransform: 'uppercase',
          marginBottom: 7,
        }}>弗栗多翻牌公示</div>
        <div style={{
          fontFamily: "'IM Fell English','Georgia',serif",
          color: '#d9b06f',
          fontSize: 13,
          fontStyle: 'italic',
          letterSpacing: 1,
          marginBottom: 18,
        }}>
          {anim?.playerName || '目标'} 的「不灭之躯」翻开牌堆顶牌
        </div>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: 12,
          minHeight: 112,
          marginBottom: 18,
        }}>
          {cards.length ? cards.map((card, idx) => (
            <div key={card?.id || card?.uid || `${card?.name || 'card'}-${idx}`} style={{
              animation: `animPop 0.34s ease-out ${idx * 0.07}s both`,
              filter: card?.isGod ? 'drop-shadow(0 0 12px rgba(192,64,32,0.65))' : 'drop-shadow(0 0 8px rgba(200,169,110,0.24))',
            }}>
              <CardFaceImage
                card={card}
                width={92}
                style={{
                  pointerEvents: 'none',
                  boxShadow: '0 10px 24px rgba(0,0,0,0.62), 0 0 18px rgba(200,169,110,0.16)',
                }}
              />
            </div>
          )) : (
            <div style={{ color: '#8a6040', fontFamily: "'Cinzel',serif", fontSize: 13, alignSelf: 'center' }}>牌堆没有可翻开的牌</div>
          )}
        </div>
        <div style={{
          display: 'inline-flex',
          padding: '7px 16px',
          borderRadius: 4,
          border: `1px solid ${success ? '#c8a96e66' : '#d05a4066'}`,
          background: success ? 'rgba(64,38,12,0.5)' : 'rgba(62,12,8,0.54)',
          color: success ? '#f0d28a' : '#ff9a82',
          fontFamily: "'Cinzel',serif",
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: 2,
          boxShadow: `0 0 14px ${success ? '#c8a96e33' : '#d05a4033'}`,
        }}>
          {success ? '未见邪神牌，HP恢复至1' : '出现邪神牌，力量消散'}
        </div>
      </div>
    </div>
  );
}

// ── Generic Overlay Anim ──────────────────────────────────────
export function GenericAnimOverlay({ anim, exiting }) {
  if (!anim) return null;
  if (['HP_DAMAGE', 'HP_HEAL', 'SAN_HEAL', 'SAN_DAMAGE'].includes(anim.type)) return null;
  const cfg = ANIM_CFG[anim.type];
  if (!cfg) return null;
  if (anim.type === 'EARTHQUAKE') return <EarthquakeOverlay anim={anim} exiting={exiting} />;
  const msgs = (anim.msgs || []).slice(-4);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999,
      background: cfg.overlay,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      animation: exiting ? 'animFadeOut 0.18s ease-in forwards' : 'animFadeIn 0.12s ease-out forwards',
    }}>
      {cfg.vig && <div style={{ position: 'absolute', inset: 0, boxShadow: `inset 0 0 120px ${cfg.accent}55`, animation: 'animVig 0.6s ease-in-out', pointerEvents: 'none' }} />}

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
  const rollSignature = [
    anim?.type,
    anim?.diceMode || '',
    anim?.d1 ?? '',
    anim?.d2 ?? '',
    anim?.rollerName || '',
    anim?.dodgeSuccess ?? '',
    anim?.negativeAvoided ?? '',
    anim?._apophisTargetSeq ?? '',
    anim?.moldySeq ?? '',
  ].join('|');
  React.useEffect(() => {
    setSettled(false);
    setFrame(0);
    const FRAMES = 12; let i = 0;
    const iv = setInterval(() => {
      i++;
      setFrame(f => f + 1);
      if (i >= FRAMES) { clearInterval(iv); setSettled(true); }
    }, 100);
    return () => clearInterval(iv);
  }, [rollSignature]);
  React.useEffect(() => {
    if (settled && anim.onSettled) anim.onSettled();
  }, [settled, anim]);
  const face1 = settled ? DICE_FACES[d1 - 1] : DICE_FACES[Math.floor(Math.random() * 6)];
  const face2 = settled ? DICE_FACES[d2 - 1] : DICE_FACES[Math.floor(Math.random() * 6)];
  const winner = Math.max(d1, d2);
  const isDodgeRoll = d2 === 0;
  const isApophisRoll = anim.diceMode === 'apophisNight';
  const isThrowStoneRoll = anim.diceMode === 'throwStone';
  const isMoldyFoodRoll = anim.diceMode === 'moldyFood';
  const apophisSuccess = isApophisRoll && !anim.apophisChanged;
  const moldyEven = isMoldyFoodRoll && (d1 % 2 === 0);
  const moldyNegativeAvoided = isMoldyFoodRoll && !moldyEven && !!anim.negativeAvoided;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(4,2,0,0.94)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      animation: exiting ? 'animFadeOut 0.18s ease-in forwards' : 'animFadeIn 0.12s ease-out forwards',
    }}>
      <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 120px #c8a96e22', pointerEvents: 'none' }} />
      <div style={{ fontFamily: "'Cinzel',serif", color: '#b89858', fontSize: 11, letterSpacing: 4, marginBottom: 18, textTransform: 'uppercase' }}>
        {rollerName || '？'} {isApophisRoll ? '在黑夜中掷骰' : isThrowStoneRoll ? '投掷石块' : isMoldyFoodRoll ? '品尝霉变食物' : isDodgeRoll ? '掷骰子' : '选择休息'}
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
          {isApophisRoll ? (
            <>
              <div style={{
                fontFamily: "'Cinzel',serif", fontSize: 13, color: apophisSuccess ? '#c8a96e' : '#e08888', letterSpacing: 3,
                textAlign: 'center', marginBottom: 6,
              }}>
                {apophisSuccess ? '成功命中目标' : `${rollerName || '你'}在一片黑暗中丢失了目标……`}
              </div>
              <div style={{ fontFamily: "'IM Fell English',serif", fontStyle: 'italic', color: '#8a6a9a', fontSize: 12, textAlign: 'center', letterSpacing: 1 }}>
                掷出 {d1} 点，{apophisSuccess ? '目标未偏移' : '目标偏移'}
              </div>
            </>
          ) : isThrowStoneRoll ? (
            <>
              <div style={{
                fontFamily: "'Cinzel',serif", fontSize: 13, color: '#c8a96e', letterSpacing: 3,
                textAlign: 'center', marginBottom: 6,
              }}>
                掷出 <span style={{ color: '#e8c87a', fontSize: 18, fontWeight: 700 }}>{d1}</span> 点
              </div>
              <div style={{ fontFamily: "'IM Fell English',serif", fontStyle: 'italic', color: '#b89858', fontSize: 12, textAlign: 'center', letterSpacing: 1 }}>
                石块飞向未知方向…
              </div>
            </>
          ) : isMoldyFoodRoll ? (
            <>
              <div style={{
                fontFamily: "'Cinzel',serif", fontSize: 13, color: moldyEven ? '#4ade80' : '#e08888', letterSpacing: 3,
                textAlign: 'center', marginBottom: 6,
              }}>
                {moldyEven ? '双数！食物尚可食用' : moldyNegativeAvoided ? '单数！负面效果已规避' : '单数！食物已经腐坏'}
              </div>
              <div style={{ fontFamily: "'IM Fell English',serif", fontStyle: 'italic', color: '#b89858', fontSize: 12, textAlign: 'center', letterSpacing: 1 }}>
                掷出 {d1} 点，{moldyEven ? '恢复 2 HP' : moldyNegativeAvoided ? '没有负面效果发生' : '失去 1 HP 且下回合不能摸牌'}
              </div>
            </>
          ) : isDodgeRoll ? (
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

export function YourTurnAnim({ name, local = false }) {
  const isLocal = local || !name || name === '你';
  const text = isLocal ? '你的回合' : `${name}的回合`;
  const col = isLocal ? '#e8c87a' : '#c8a0e8';
  const glow = isLocal ? '#c8a96e99' : '#a080d099';
  const glow2 = isLocal ? '#c8a96e44' : '#a080d044';
  const veil = isLocal ? 'rgba(42, 30, 12, 0.42)' : 'rgba(32, 18, 48, 0.42)';
  const veilCore = isLocal ? 'rgba(200, 169, 110, 0.16)' : 'rgba(160, 128, 208, 0.16)';
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2500, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute',
        width: 'min(76vw, 1040px)',
        height: 'clamp(72px, 8.8vh, 152px)',
        background: `radial-gradient(ellipse at center, ${veilCore} 0%, ${veil} 38%, rgba(0,0,0,0.18) 58%, transparent 78%)`,
        WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, #000 18%, #000 82%, transparent 100%)',
        maskImage: 'linear-gradient(90deg, transparent 0%, #000 18%, #000 82%, transparent 100%)',
        filter: 'blur(10px)',
        animation: 'yourTurnFade 2.0s ease-in-out forwards',
      }} />
      <div style={{
        position: 'relative',
        maxWidth: '90vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'yourTurnFade 2.0s ease-in-out forwards',
      }}>
        <span style={{
          display: 'block',
          fontFamily: "'Cinzel Decorative','Cinzel',serif",
          fontSize: 'clamp(32px, min(4.6vh, 11vw), 72px)',
          fontWeight: 700,
          letterSpacing: 'clamp(1px, 0.12em, 7px)',
          color: col,
          textShadow: '0 2px 10px rgba(0,0,0,0.86)',
          filter: `drop-shadow(0 0 18px ${glow}) drop-shadow(0 0 44px ${glow2})`,
          whiteSpace: 'nowrap',
        }}>{text}</span>
      </div>
    </div>
  );
}
