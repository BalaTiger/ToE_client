import React, { useState, useEffect } from 'react';
import {
  GOD_DEFS,
  ROLE_CULTIST,
  CS,
  GOD_CS
} from '../../constants/card';
import { DDCard, DDCardBack, GodCardDisplay } from '../cards';

const buildPublicUrl = path => {
  const base = ((window.__PUBLIC_BASE__) || '/').replace(/\/?$/, '/');
  return `${base}${String(path).replace(/^\/+/, '')}`;
};

// ── God Choice Modal (player encounters a god card) ────────────
function GodChoiceModal({ godCard, player, onWorship, onKeepHand, onDiscard, isConvert, forcedConvert }) {
  if (!godCard) return null;
  const def = GOD_DEFS[godCard.godKey];
  const isCultist = player.role === ROLE_CULTIST;
  const alreadyWorship = player.godName === godCard.godKey;
  const canUpgrade = alreadyWorship && (player.godLevel || 0) < 3;
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 400, paddingTop: '10vh' }}>
      <div style={{
        background: '#150e07dd',
        border: `2px solid ${def.col}`,
        boxShadow: `0 0 60px ${def.col}44, 0 0 120px #000a`,
        borderRadius: 4, padding: '20px 28px', maxWidth: 320, width: '90%', textAlign: 'center',
        animation: 'animPop 0.22s ease-out',
        display: 'flex',
        flexDirection: 'column',
        gap: 12
      }}>
        <div style={{ fontFamily: "'Cinzel',serif", color: '#e8cc88', fontSize: 19.5, letterSpacing: 2, marginBottom: 4 }}>
          {forcedConvert ? '邪祀者强制改信——' : '邪神降临——'}
          <span style={{ color: def.col, filter: `drop-shadow(0 0 6px ${def.col}88)` }}>{godCard.name}</span>
        </div>
        <div style={{ fontSize: 16.5, color: '#c89058', fontStyle: 'italic', fontFamily: "'IM Fell English',serif", marginBottom: 4 }}>
          {'💀'.repeat(player.godEncounters)} 第{player.godEncounters}次遭遇，失去{player.godEncounters}SAN
          {isConvert && !forcedConvert && <span style={{ color: '#e08888', marginLeft: 8 }}>（改信将失去1SAN）</span>}
        </div>
        {/* Power gain preview */}
        {!forcedConvert && (
          <div style={{
            fontSize: 11, color: def.col, fontFamily: "'Cinzel',serif", letterSpacing: 1,
            marginBottom: 8, opacity: 0.9,
            background: def.bgCol, border: `1px solid ${def.col}55`,
            borderRadius: 3, padding: '4px 12px', display: 'inline-block',
            alignSelf: 'center'
          }}>
            {canUpgrade
              ? `⬆ 升级后你将获得：${def.power} Lv.${(player.godLevel || 0) + 1}`
              : `⛧ 信仰后你将获得邪神之力：${def.power} Lv.1`}
          </div>
        )}
        <GodCardDisplay card={godCard} level={alreadyWorship ? (player.godLevel + 1) : 1} />
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8 }}>
          {!forcedConvert && (
            <button onClick={onWorship} style={{ padding: '9px 22px', background: def.bgCol, border: `1.5px solid ${def.col}`, color: def.col, fontFamily: "'Cinzel',serif", fontSize: 16.5, borderRadius: 3, cursor: 'pointer', letterSpacing: 1, filter: `drop-shadow(0 0 4px ${def.col}66)` }}>
              {canUpgrade ? '⬆ 升级邪神之力' : isConvert ? '⛧ 改信新神' : '⛧ 信仰邪神'}
            </button>
          )}
          {!alreadyWorship && !forcedConvert && isCultist && (
            <button onClick={onKeepHand} style={{ padding: '9px 22px', background: '#180830', border: `1.5px solid #b080ee`, color: '#b080ee', fontFamily: "'Cinzel',serif", fontSize: 16.5, borderRadius: 3, cursor: 'pointer', letterSpacing: 1, filter: 'drop-shadow(0 0 4px #9060cc66)' }}>
              ☽ 秘密收入手牌
            </button>
          )}
          {!forcedConvert && (
            <button onClick={onDiscard} style={{ padding: '9px 22px', background: '#120a08', border: '1.5px solid #6a4828', color: '#d4a858', fontFamily: "'Cinzel',serif", fontSize: 16.5, borderRadius: 3, cursor: 'pointer', letterSpacing: 1 }}>
              放弃
            </button>
          )}
          {forcedConvert && (
            <button onClick={onWorship} style={{ padding: '9px 22px', background: def.bgCol, border: `1.5px solid ${def.col}`, color: def.col, fontFamily: "'Cinzel',serif", fontSize: 16.5, borderRadius: 3, cursor: 'pointer', letterSpacing: 1, filter: `drop-shadow(0 0 4px ${def.col}66)` }}>
              ⛧ 接受改信
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── NYA Borrow Modal ──────────────────────────────────────────
function NyaBorrowModal({ deadPlayers, godLevel, onBorrow, onSkip }) {
  const penalty = GOD_DEFS.NYA.levels[Math.max(0, (godLevel || 1) - 1)].handPenalty;
  const s = GOD_DEFS.NYA;
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 400, paddingTop: '10vh' }}>
      <div style={{
        background: '#150e07dd',
        border: `2px solid ${s.col}`,
        boxShadow: `0 0 60px ${s.col}44, 0 0 120px #000a`,
        borderRadius: 4, padding: '20px 28px', maxWidth: 320, width: '90%', textAlign: 'center',
        animation: 'animPop 0.22s ease-out',
      }}>
        <div style={{ fontFamily: "'Cinzel',serif", color: '#b03030', fontSize: 15, letterSpacing: 3, marginBottom: 16, textTransform: 'uppercase' }}>── 千人千貌 Lv.{godLevel} ──</div>

        <div style={{ fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic', color: '#8a5050', fontSize: 14, marginBottom: 20, lineHeight: 1.4 }}>
          借用已死角色的身份直至回合结束{penalty > 0 ? `（手牌上限-${penalty}）` : ''}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
          {deadPlayers.map((p, i) => (
            <button key={i} onClick={() => onBorrow(p)} style={{
              padding: '10px 18px', background: '#1a0808', border: '1.5px solid #882020',
              color: '#cc6060', fontFamily: "'Cinzel',serif", fontSize: 12, borderRadius: 3, cursor: 'pointer',
              opacity: 0.85, transition: 'all .15s',
              boxShadow: '0 0 16px #88202044',
              ':hover': {
                opacity: 1,
                boxShadow: '0 0 20px #88202066',
              }
            }}>
              ☠ {p.role}（{p.name}）
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button onClick={onSkip} style={{
            padding: '10px 22px', background: '#120a08', border: '1.5px solid #883030',
            color: '#e08888', fontFamily: "'Cinzel',serif", fontWeight: 700, fontSize: 14,
            borderRadius: 2, cursor: 'pointer', letterSpacing: 1, transition: 'all .15s',
          }}>
            不借用，直接摸牌
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Draw Reveal Modal ─────────────────────────────────────────
function DrawRevealModal({ drawReveal, onKeep, onDiscard, canChoose, thinkingText }) {
  if (!drawReveal?.card) return null;
  const { card } = drawReveal;
  const s = CS[card.letter] || GOD_CS;
  const isBystander = !canChoose && thinkingText;
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 300, paddingTop: '10vh' }}>
      <div style={{
        background: '#150e07dd',
        border: `2px solid ${s.border}`,
        boxShadow: `0 0 60px ${s.glow}44, 0 0 120px #000a`,
        borderRadius: 4, padding: '20px 28px', maxWidth: 280, width: '90%', textAlign: 'center',
        animation: 'animPop 0.22s ease-out',
      }}>
        <div style={{ fontFamily: "'Cinzel',serif", color: '#a07838', fontSize: 15, letterSpacing: 3, marginBottom: 16, textTransform: 'uppercase' }}>── 区域探寻 ──</div>
        {/* Big card */}
        <div style={{
          background: s.bg, border: `2px solid ${s.borderBright}`,
          borderRadius: 4, padding: '18px 22px', display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
          minWidth: 120, marginBottom: 16, boxShadow: `0 0 30px ${s.glow}55`,
        }}>
          <div style={{ fontFamily: "'Cinzel',serif", fontWeight: 700, color: s.text, fontSize: 51, lineHeight: 1 }}>{card.key}</div>
          <div style={{ fontFamily: "'Cinzel',serif", color: '#e8cc88', fontSize: 19.5, fontWeight: 600, marginTop: 6 }}>{card.name}</div>
          <div style={{ fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic', color: '#d4b468', fontSize: 16.5, marginTop: 8, lineHeight: 1.4, maxWidth: 200 }}>{card.desc}</div>
        </div>

        {isBystander ? (
          <div style={{ fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic', color: '#c8a96e', fontSize: 15, marginTop: 16 }}>
            {thinkingText}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16 }}>
            <button onClick={onKeep} style={{
              padding: '10px 22px', background: '#1c1008', border: '1.5px solid #c8a96e',
              color: '#e8c87a', fontFamily: "'Cinzel',serif", fontWeight: 700, fontSize: 14,
              borderRadius: 2, cursor: 'pointer', letterSpacing: 1,
              boxShadow: '0 0 16px #c8a96e44', transition: 'all .15s',
            }}>
              收入手牌
              <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4, fontWeight: 400, fontFamily: "'IM Fell English',serif" }}>
                (触发效果)
              </div>
            </button>
            <button onClick={onDiscard} style={{
              padding: '10px 22px', background: '#120a08', border: '1.5px solid #883030',
              color: '#e08888', fontFamily: "'Cinzel',serif", fontWeight: 700, fontSize: 14,
              borderRadius: 2, cursor: 'pointer', letterSpacing: 1, transition: 'all .15s',
            }}>
              弃置此牌
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Treasure Hunter Dodge Modal ─────────────────────────────
function TreasureDodgeModal({ drawReveal, onRoll, onSkip, thinkingText }) {
  if (!drawReveal?.card) return null;
  const { card } = drawReveal;
  const s = CS[card.letter] || GOD_CS;
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 300, paddingTop: '10vh' }}>
      <div style={{
        background: '#150e07dd',
        border: `2px solid ${s.border}`,
        boxShadow: `0 0 60px ${s.glow}44, 0 0 120px #000a`,
        borderRadius: 4, padding: '20px 28px', maxWidth: 280, width: '90%', textAlign: 'center',
        animation: 'animPop 0.22s ease-out',
      }}>
        <div style={{ fontFamily: "'Cinzel',serif", color: '#a07838', fontSize: 15, letterSpacing: 3, marginBottom: 16, textTransform: 'uppercase' }}>── 寻宝者能力 ──</div>
        {/* Big card */}
        <div style={{
          background: s.bg, border: `2px solid ${s.borderBright}`,
          borderRadius: 4, padding: '18px 22px', display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
          minWidth: 120, marginBottom: 16, boxShadow: `0 0 30px ${s.glow}55`,
        }}>
          <div style={{ fontFamily: "'Cinzel',serif", fontWeight: 700, color: s.text, fontSize: 51, lineHeight: 1 }}>{card.key}</div>
          <div style={{ fontFamily: "'Cinzel',serif", color: '#e8cc88', fontSize: 19.5, fontWeight: 600, marginTop: 6 }}>{card.name}</div>
          <div style={{ fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic', color: '#d4b468', fontSize: 16.5, marginTop: 8, lineHeight: 1.4, maxWidth: 200 }}>{card.desc}</div>
        </div>

        <div style={{ fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic', color: '#c8a96e', fontSize: 14, marginTop: 12, lineHeight: 1.6 }}>
          这张牌带有负面效果！作为寻宝者，你可以掷骰子尝试规避。
        </div>
        <div style={{ fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic', color: '#a08060', fontSize: 13, marginTop: 8 }}>
          掷出 4、5、6 点可成功规避负面效果。
        </div>

        {thinkingText && (
          <div style={{ fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic', color: '#e8c87a', fontSize: 14, marginTop: 12, lineHeight: 1.6 }}>
            {thinkingText}
          </div>
        )}

        {!thinkingText && (
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 20 }}>
            <button onClick={onRoll} style={{
              padding: '10px 22px', background: '#1c1008', border: '1.5px solid #c8a96e',
              color: '#e8c87a', fontFamily: "'Cinzel',serif", fontWeight: 700, fontSize: 14,
              borderRadius: 2, cursor: 'pointer', letterSpacing: 1,
              boxShadow: '0 0 16px #c8a96e44', transition: 'all .15s',
            }}>
              掷骰子
              <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4, fontWeight: 400, fontFamily: "'IM Fell English',serif" }}>
                (尝试规避)
              </div>
            </button>
            <button onClick={onSkip} style={{
              padding: '10px 22px', background: '#120a08', border: '1.5px solid #883030',
              color: '#e08888', fontFamily: "'Cinzel',serif", fontWeight: 700, fontSize: 14,
              borderRadius: 2, cursor: 'pointer', letterSpacing: 1, transition: 'all .15s',
            }}>
              直接触发
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PeekHandModal({ card, targetName, onClose }) {
  if (!card) return null;
  const col = card.isGod ? GOD_CS : (CS[card.letter] || '#c8a96e');
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1200,
      background: 'rgba(3,2,6,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20
    }} onClick={onClose}>
      <div data-modal style={{
        width: 360, maxWidth: 'calc(100vw - 24px)',
        background: 'linear-gradient(180deg,#1a120d 0%,#0f0a07 100%)',
        border: '1.5px solid #b48a52',
        boxShadow: '0 18px 60px rgba(0,0,0,0.6)',
        borderRadius: 10, padding: '18px 18px 16px',
        color: '#e8d8b8'
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 22, letterSpacing: 2, textAlign: 'center', color: '#d9b172', marginBottom: 8 }}>血之窥探</div>
        <div style={{ textAlign: 'center', fontSize: 13, color: '#c8a96e', marginBottom: 16 }}>
          你偷看了 {targetName} 的一张手牌
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{
            width: 120, minHeight: 164, borderRadius: 8, padding: '10px 10px 12px',
            background: 'linear-gradient(180deg,#1b120b,#0d0906)',
            border: `1.5px solid ${col}`,
            boxShadow: `0 0 18px ${col}33, inset 0 0 18px #00000044`
          }}>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 24, lineHeight: 1, color: col, marginBottom: 6 }}>{card.key}</div>
            <div style={{ fontFamily: "'Noto Serif SC','Songti SC',serif", fontWeight: 700, fontSize: 16, color: '#f1dfbf', marginBottom: 8 }}>{card.name}</div>
            <div style={{ fontSize: 11, lineHeight: 1.6, color: '#cfbd99', whiteSpace: 'pre-wrap' }}>
              {card.desc || ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button onClick={onClose} style={{
            padding: '8px 20px',
            background: '#2a1a08',
            border: '1.5px solid #8a6030',
            color: '#d8b078',
            borderRadius: 6,
            cursor: 'pointer',
            fontFamily: "'Cinzel',serif"
          }}>确认</button>
        </div>
      </div>
    </div>
  );
}

function TortoiseOracleModal({ abilityData, onSelect, myTurn }) {
  const revealedCards = abilityData?.revealedCards || [];
  const selectableKeys = abilityData?.selectableKeys || [];
  const [revealedCount, setRevealedCount] = useState(0);
  const canPick = !!myTurn;

  useEffect(() => {
    setRevealedCount(0);
  }, [revealedCards.map(c => c.id ?? c.key).join('|')]);

  useEffect(() => {
    if (!revealedCards.length) return;
    if (revealedCount >= revealedCards.length) return;
    const t = setTimeout(() => setRevealedCount(v => Math.min(v + 1, revealedCards.length)), 220);
    return () => clearTimeout(t);
  }, [revealedCount, revealedCards]);

  if (!abilityData) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
      <div style={{ background: '#150e07dd', border: '2px solid #a78bfa', boxShadow: '0 0 60px #a78bfa44, 0 0 120px #000a', borderRadius: 4, padding: '20px 28px', maxWidth: 520, width: '92%', textAlign: 'center' }}>
        <div style={{ fontFamily: "'Cinzel',serif", color: '#a78bfa', fontSize: 16, letterSpacing: 2, marginBottom: 16 }}>── 灵龟卜祝 ──</div>
        <div style={{ fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic', color: '#b09090', fontSize: 14, marginBottom: 16, lineHeight: 1.4 }}>
          {canPick ? '展示牌堆顶的牌，再选择你手中最多的一个字母或数字编号' : '灵龟卜祝翻开了牌堆顶的牌'}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 18, minHeight: 120 }}>
          {revealedCards.map((card, index) => (
            <div key={card.id ?? `${card.key}-${index}`} style={{ opacity: index < revealedCount ? 1 : 0.28, transform: index < revealedCount ? 'scale(1)' : 'scale(0.95)', transition: 'all .18s' }}>
              {index < revealedCount ? <DDCard card={card} compact /> : <DDCardBack />}
            </div>
          ))}
        </div>
        {canPick && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 8 }}>
            {selectableKeys.map((key, i) => (
              <button key={i} onClick={() => onSelect(key)} style={{
                padding: '10px 18px', background: '#1a0808', border: '1.5px solid #a78bfa',
                color: '#a78bfa', fontFamily: "'Cinzel',serif", fontSize: 12, borderRadius: 3, cursor: 'pointer',
                opacity: 0.9, transition: 'all .15s',
              }}>{key}</button>
            ))}
          </div>
        )}
        {!canPick && (
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 12, color: '#a07838', letterSpacing: 1 }}>
            触发者选择中…
          </div>
        )}
      </div>
    </div>
  );
}

// ── About Modal ──────────────────────────────────────────────
function AboutModal({ onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#12090a', border: '1.5px solid #5a3a10', borderRadius: 6,
        width: 340, maxWidth: '92vw', boxShadow: '0 0 40px #00000099',
        fontFamily: "'IM Fell English','Georgia',serif", position: 'relative', overflow: 'hidden',
      }}>
        {/* Close */}
        <button onClick={onClose} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: '#b07828', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        {/* Top half */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', padding: '22px 20px 16px' }}>
          {/* Avatar */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <div style={{
              width: 56, height: 56, borderRadius: '50%',
              background: 'linear-gradient(135deg,#2a1a08,#1a0f04)',
              border: '2px solid #5a3a10',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, color: '#b07828',
            }}>🧙</div>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 11, color: '#c8a96e', letterSpacing: 1 }}>Sam</div>
          </div>
          {/* Bio */}
          <div style={{ flex: 1, paddingTop: 4 }}>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: '#b07828', letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>— 关于作者 —</div>
            <div style={{ color: '#c8a96e', fontSize: 12, lineHeight: 1.8, fontStyle: 'italic' }}>
              猫奴，上班党，不回就是在上班，会尽量努力更新。
            </div>
            <div style={{ color: '#9a7a42', fontSize: 11, lineHeight: 1.8, marginTop: 8, fontStyle: 'italic' }}>
              如果你遇到与游戏规则有关的bug，记得在游戏结束后点击"显示游戏日志"并复制内容。
            </div>
          </div>
        </div>
        {/* Divider */}
        <div style={{ width: '80%', height: 1, background: 'linear-gradient(90deg,transparent,#5a3a10,transparent)', margin: '0 auto' }} />
        {/* Bottom half */}
        <div style={{ padding: '16px 20px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: '#b07828', letterSpacing: 2, textTransform: 'uppercase' }}>— 意见与反馈 —</div>
          <div style={{ color: '#c8a96e', fontSize: 12, letterSpacing: 1, fontStyle: 'italic' }}>QQ催更群：787317460</div>
          <div style={{ color: '#c8a96e', fontSize: 12, letterSpacing: 1, fontStyle: 'italic' }}>微信催更群二维码</div>
          <img
            src={buildPublicUrl('img/QRCode.jpg')}
            alt="微信催更群二维码"
            style={{
              display: 'block',
              width: 'min(76vw,240px)',
              maxWidth: '100%',
              height: 'auto',
              borderRadius: 6,
              border: '1px solid #5a3a10',
              boxShadow: '0 0 18px #00000066',
              imageRendering: 'auto',
              background: '#1a1208',
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Roadmap Modal ─────────────────────────────────────────────
function FullLogModal({ log, onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)', zIndex: 1800, display: 'flex', alignItems: 'stretch', justifyContent: 'center', padding: '20px 12px' }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 'min(980px,100%)', height: '100%',
        background: '#0d0806', border: '1.5px solid #5a3a10', borderRadius: 6,
        boxShadow: '0 0 50px #000000aa', display: 'flex', flexDirection: 'column',
        overflow: 'hidden', fontFamily: "'IM Fell English','Georgia',serif",
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', borderBottom: '1px solid #3a2410' }}>
          <div>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 11, color: '#b07828', letterSpacing: 2, textTransform: 'uppercase' }}>完整游戏日志</div>
            <div style={{ fontSize: 11, color: '#8f6d3c', marginTop: 4 }}>可滚动查看并直接复制全部内容</div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: '1px solid #5a3a10', color: '#c8a96e',
            borderRadius: 3, padding: '6px 12px', cursor: 'pointer',
            fontFamily: "'Cinzel',serif", fontSize: 12, letterSpacing: 1,
          }}>关闭</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px 20px' }}>
          <pre style={{
            margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            color: '#d8c39a', fontSize: 13, lineHeight: 1.75,
            fontFamily: "'Consolas','Courier New',monospace",
          }}>{(log && log.length ? log : ['当前没有可显示的日志。']).join('\n')}</pre>
        </div>
      </div>
    </div>
  );
}

function RoadmapModal({ onClose }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', zIndex: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#12090a', border: '1.5px solid #5a3a10', borderRadius: 6,
        width: 320, maxWidth: '92vw', padding: '22px 22px 24px',
        boxShadow: '0 0 40px #00000099',
        fontFamily: "'IM Fell English','Georgia',serif", position: 'relative',
      }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: '#b07828', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        <div style={{ fontFamily: "'Cinzel',serif", fontSize: 11, color: '#b07828', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16, textAlign: 'center' }}>— 版本更新计划 —</div>
        {/* Current version */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 11, color: '#c8a96e', letterSpacing: 1, marginBottom: 4 }}>当前版本：0.1.2</div>
          {[
            '联机对战已开放！欢迎测试',
            '根据实战表现，不甘落后的追猎者决定擦亮自己的武器',
            '添加检定牌机制！具体规则请在遗迹内自行探索',
            '停服更新规范化，未来闪断更新/停服更新时会在游戏内广播',
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 7 }}>
              <span style={{ color: '#b07828', flexShrink: 0, fontSize: 12 }}>·</span>
              <span style={{ color: '#a08060', fontSize: 12, lineHeight: 1.7, fontStyle: 'italic', textAlign: 'left' }}>{t}</span>
            </div>
          ))}
        </div>
        <div style={{ width: '100%', height: 1, background: 'linear-gradient(90deg,transparent,#5a3a1066,transparent)', margin: '0 0 12px' }} />
        {/* Next version block */}
        <div>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: 11, color: '#c8a96e', letterSpacing: 1, marginBottom: 10 }}>下一个版本：0.2.1</div>
          {[
            '新扩展包《析骨为柴》锐意制作中！',
          ].map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 7 }}>
              <span style={{ color: '#b07828', flexShrink: 0, fontSize: 12 }}>·</span>
              <span style={{ color: '#a08060', fontSize: 12, lineHeight: 1.7, fontStyle: 'italic', textAlign: 'left' }}>{t}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export {
  GodChoiceModal,
  NyaBorrowModal,
  DrawRevealModal,
  TreasureDodgeModal,
  PeekHandModal,
  TortoiseOracleModal,
  AboutModal,
  FullLogModal,
  RoadmapModal
};
