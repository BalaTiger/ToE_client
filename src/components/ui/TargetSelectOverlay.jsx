import { CS, GOD_CS } from '../../constants/card';

function getBewitchEffectDesc(card) {
  if (!card) return '';
  if (card.isGod) {
    return `你将把「${card.name}」送给目标角色，使该角色遭遇邪神并失去SAN值（第N次遭遇失去N点），该角色可能被迫信仰${card.name}`;
  }
  return `你将把【${card.key} ${card.name}】送给目标角色，并强制其收入手牌后立刻结算：“你”与相邻角色都以该目标为基准计算`;
}

export function TargetSelectOverlay({ drawReveal, phase, bewitchCard }) {
  const isActive = ['DRAW_SELECT_TARGET', 'SWAP_SELECT_TARGET', 'HUNT_SELECT_TARGET', 'BEWITCH_SELECT_TARGET', 'ROSE_THORN_SELECT_TARGET'].includes(phase);
  if (!isActive) return null;
  const isBewitch = phase === 'BEWITCH_SELECT_TARGET';
  const showCard = phase !== 'HUNT_SELECT_TARGET';
  const card = showCard ? (isBewitch ? bewitchCard : (drawReveal?.card)) : null;
  const s = card ? (card.isGod ? GOD_CS : (CS[card.letter] || GOD_CS)) : null;
  const bewitchDesc = isBewitch ? getBewitchEffectDesc(card) : null;
  const phaseHint = {
    DRAW_SELECT_TARGET: '请点击目标角色以施加牌效',
    SWAP_SELECT_TARGET: '请点击目标角色以发动【掉包】',
    PEEK_HAND_SELECT_TARGET: '请点击目标角色以偷看其一张手牌',
    HUNT_SELECT_TARGET: '请点击目标角色以发动【追捕】',
    BEWITCH_SELECT_TARGET: '请选择蛊惑目标',
    CAVE_DUEL_SELECT_TARGET: '请选择一名有手牌的角色进行【穴居人战争】',
    DAMAGE_LINK_SELECT_TARGET: '请选择一名角色建立【两人一绳】链条',
    ROSE_THORN_SELECT_TARGET: '请选择承受【玫瑰倒刺】的目标',
    FIRST_COME_PICK_SELECT: '请从翻开的牌中选择一张收入手牌',
  }[phase] || '请选择目标';
  if (phase === 'SWAP_SELECT_TARGET_CARD') return null;
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.38)', zIndex: 100, pointerEvents: 'none' }} />
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 102, pointerEvents: 'none',
      }}>
        <div style={{
          background: 'rgba(10,6,2,0.93)',
          border: `1.5px solid ${s ? s.borderBright : '#5a3010'}`,
          borderRadius: 4, padding: '18px 28px',
          boxShadow: `0 0 40px ${s ? s.glow + '66' : '#3a201044'}, 0 0 80px #000a`,
          textAlign: 'center', minWidth: 260, maxWidth: 340,
        }}>
          {card && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, justifyContent: 'center' }}>
              <div style={{
                background: s.bg, border: `1.5px solid ${s.borderBright}`, borderRadius: 3,
                padding: '5px 9px', minWidth: 48, textAlign: 'center',
              }}>
                {card.isGod
                  ? <div style={{ fontFamily: "'Cinzel',serif", fontWeight: 700, color: s.text, fontSize: 20, lineHeight: 1.2 }}>⛧</div>
                  : <div style={{ fontFamily: "'Cinzel',serif", fontWeight: 700, color: s.text, fontSize: 27, lineHeight: 1 }}>{card.key}</div>
                }
                <div style={{ fontFamily: "'Cinzel',serif", color: '#e8cc88', fontSize: card.isGod ? 10 : 14.25, marginTop: 2 }}>{card.name}</div>
              </div>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic', color: '#d4b468', fontSize: 15, maxWidth: 180, lineHeight: 1.4 }}>{card.isGod ? card.subtitle : card.desc}</div>
              </div>
            </div>
          )}
          {isBewitch && bewitchDesc && (
            <div style={{
              background: 'rgba(80,20,100,0.22)',
              border: '1px solid #7040aa55',
              borderRadius: 3, padding: '7px 10px',
              marginBottom: 10, textAlign: 'left',
            }}>
              <div style={{ fontFamily: "'Cinzel',serif", color: '#9060cc', fontSize: 9, letterSpacing: 2, marginBottom: 4, textTransform: 'uppercase' }}>☽ 蛊惑效果预览</div>
              <div style={{ fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic', color: '#d4b0e8', fontSize: 13, lineHeight: 1.6 }}>
                {bewitchDesc}
              </div>
            </div>
          )}
          <div style={{
            fontFamily: "'Cinzel',serif", fontWeight: 700, fontSize: 18,
            color: '#e8cc88', letterSpacing: 2, textTransform: 'uppercase',
          }}>{phaseHint}</div>
          <div style={{ fontFamily: "'Cinzel',serif", color: '#c8a055', fontSize: 13.5, letterSpacing: 1, marginTop: 6 }}>↑ 点击上方高亮角色</div>
        </div>
      </div>
    </>
  );
}
