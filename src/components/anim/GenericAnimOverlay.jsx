import React from 'react';
import { ANIM_CFG, DICE_FACES } from './data';
import { CS, GOD_CS } from '../../constants/card';
import { MiniCardFace } from '../cards';
import { getPileAnchorCenter, getPlayerHandAnchorCenter } from '../../utils/dom';

const EARTHQUAKE_PEBBLES = [
  { top: '22%', left: '16%', size: 16, dx: 128, midDx: 58, lift: 28, drop: 58, rot: 210, delay: 0.08 },
  { top: '31%', left: '72%', size: 12, dx: 104, midDx: 44, lift: 22, drop: 46, rot: 170, delay: 0.12 },
  { top: '44%', left: '35%', size: 18, dx: -138, midDx: -62, lift: 30, drop: 64, rot: -230, delay: 0.20 },
  { top: '56%', left: '84%', size: 14, dx: -116, midDx: -50, lift: 24, drop: 52, rot: -190, delay: 0.28 },
  { top: '68%', left: '20%', size: 20, dx: 148, midDx: 66, lift: 34, drop: 72, rot: 260, delay: 0.46 },
  { top: '73%', left: '56%', size: 13, dx: 112, midDx: 48, lift: 24, drop: 54, rot: 190, delay: 0.53 },
  { top: '28%', left: '46%', size: 17, dx: -132, midDx: -60, lift: 31, drop: 66, rot: -240, delay: 0.68 },
  { top: '62%', left: '10%', size: 11, dx: -96, midDx: -42, lift: 20, drop: 44, rot: -165, delay: 0.76 },
  { top: '38%', left: '64%', size: 19, dx: 142, midDx: 64, lift: 32, drop: 70, rot: 250, delay: 0.92 },
  { top: '78%', left: '31%', size: 15, dx: 122, midDx: 54, lift: 26, drop: 60, rot: 205, delay: 1.02 },
  { top: '24%', left: '82%', size: 14, dx: -118, midDx: -52, lift: 25, drop: 56, rot: -200, delay: 1.15 },
  { top: '52%', left: '48%', size: 21, dx: -152, midDx: -68, lift: 36, drop: 76, rot: -270, delay: 1.24 },
];

function EarthquakeDiscardCard({ event }) {
  const [style, setStyle] = React.useState(null);

  React.useEffect(() => {
    if (!event?.card) return;
    const start = getPlayerHandAnchorCenter(event.playerIndex ?? 0);
    const discard = getPileAnchorCenter(
      '[data-discard-pile]',
      { x: window.innerWidth * 0.35, y: window.innerHeight * 0.50 }
    );
    const tx = discard.x - start.x;
    const ty = discard.y - start.y;
    setStyle({
      left: start.x,
      top: start.y,
      '--tx': `${tx}px`,
      '--ty': `${ty}px`,
      '--mid-tx': `${tx * 0.72}px`,
      '--mid-ty': `${ty * 0.44 - 22}px`,
      '--delay': `${(event.delayMs || 0) / 1000}s`,
      '--duration': `${(event.durationMs || 620) / 1000}s`,
    });
  }, [event]);

  if (!event?.card || !style) return null;
  const card = event.card;
  const s = card.isGod ? GOD_CS : (CS[card.letter] || null);

  return (
    <div style={{
      position: 'absolute',
      left: style.left,
      top: style.top,
      width: 70,
      height: 94,
      marginLeft: -35,
      marginTop: -47,
      borderRadius: 4,
      background: s ? s.bg : '#100c08',
      border: s ? `1.5px solid ${s.borderBright}` : '1.5px solid #4a3010',
      boxShadow: '0 8px 28px rgba(0,0,0,0.68), 0 0 18px rgba(212,180,104,0.22)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      '--tx': style['--tx'],
      '--ty': style['--ty'],
      '--mid-tx': style['--mid-tx'],
      '--mid-ty': style['--mid-ty'],
      opacity: 0,
      transform: 'translate(0,0) rotate(-4deg) scale(0.96)',
      animationName: 'earthquakeDiscardFly',
      animationDuration: style['--duration'],
      animationTimingFunction: 'cubic-bezier(0.26,0,0.2,1)',
      animationDelay: style['--delay'],
      animationFillMode: 'both',
    }}>
      {s && <MiniCardFace card={card} width={70} height={94} ambient={false} frameStyle={{ boxShadow: 'none', border: 'none', background: 'transparent' }} />}
    </div>
  );
}

function EarthquakeOverlay({ anim, exiting }) {
  const discardEvents = Array.isArray(anim?.discardEvents) ? anim.discardEvents : [];
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 999,
      pointerEvents: 'none',
      overflow: 'hidden',
      animation: `earthquakeSceneShake 1.25s linear 2${exiting ? ', animFadeOut 0.18s ease-in forwards' : ''}`,
    }}>
      <div style={{ position: 'absolute', inset: 0, animation: 'earthquakeBlackout 2.5s linear both' }} />
      <div style={{ position: 'absolute', inset: 0, animation: 'earthquakeWhiteFlash 2.5s linear both' }} />
      <div style={{
        position: 'absolute',
        inset: 0,
        boxShadow: 'inset 0 0 110px rgba(0,0,0,0.58), inset 0 0 180px rgba(150,120,72,0.16)',
        opacity: 0.8,
      }} />
      {EARTHQUAKE_PEBBLES.map((p, i) => (
        <div key={i} style={{
          position: 'absolute',
          top: p.top,
          left: p.left,
          width: p.size,
          height: Math.max(3, Math.round(p.size * 0.72)),
          borderRadius: Math.max(1, Math.round(p.size * 0.25)),
          background: 'linear-gradient(135deg,#a68455,#4b3826)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.55)',
          '--pebble-dx': `${p.dx}px`,
          '--pebble-mid-dx': `${p.midDx}px`,
          '--pebble-lift': `${p.lift}px`,
          '--pebble-drop': `${p.drop}px`,
          '--pebble-rot': `${p.rot}deg`,
          animation: `earthquakePebble 0.58s cubic-bezier(0.12,0.58,0.38,1) ${p.delay}s both`,
        }} />
      ))}
      {discardEvents.map((event, i) => (
        <EarthquakeDiscardCard key={`${event.playerIndex}-${event.card?.id || i}`} event={event} />
      ))}
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
