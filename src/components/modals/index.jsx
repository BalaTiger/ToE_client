import React, { useState, useEffect, useMemo } from 'react';
import {
  GOD_DEFS,
  getCardDisplayKey,
} from '../../constants/card';
import { ROLE_CULTIST, isRevealedCultist, shouldHideBlindZoneIdentity } from '../../game';
import { formatGodEncounterProgress, getLatestGodEncounterProgress } from '../../game/balancePatches';
import { DDCard, DDCardBack, CardFaceImage, GodCardDisplay } from '../cards';
import { CARD_FACE_RATIO } from '../cards/CardFaceAssets';

import { buildPublicUrl } from '../../utils/url';

function getDecisionModalMetrics(scaleRatio = 1) {
  const vw = typeof window === 'undefined' ? 1200 : window.innerWidth || 1200;
  const vh = typeof window === 'undefined' ? 720 : window.innerHeight || 720;
  const viewportFit = Math.min((vw - 24) / 380, (vh - 24) / 620);
  const uiScale = Math.min(1.38, Math.max(0.58, Math.min(Math.max(1, scaleRatio || 1), viewportFit)));
  return {
    uiScale,
    overlay: {
      position: 'fixed',
      inset: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 400,
      padding: `${12 * uiScale}px`,
      boxSizing: 'border-box',
      overflowY: 'auto',
    },
    panel: {
      maxHeight: `calc(100dvh - ${24 * uiScale}px)`,
      overflowY: 'auto',
    },
    cardScale: Math.min(1.28, Math.max(0.58, uiScale)),
  };
}

// ── God Choice Modal (player encounters a god card) ────────────
function GodChoiceModal({
  godCard,
  player,
  onWorship,
  onKeepHand,
  onDiscard,
  isConvert,
  forcedConvert,
  canChoose = true,
  thinkingText = '',
  allowWorship = true,
  allowKeepHand = true,
  allowDiscard = true,
  keepButtonRef = null,
  scaleRatio = 1,
}) {
  if (!godCard) return null;
  const def = GOD_DEFS[godCard.godKey];
  const isCultist = player.role === ROLE_CULTIST;
  const alreadyWorship = player.godName === godCard.godKey;
  const canUpgrade = alreadyWorship && (player.godLevel || 0) < 3;
  const isBystander = !canChoose && thinkingText;
  const immuneEncounter = isRevealedCultist(player);
  const encounterProgress = getLatestGodEncounterProgress(player);
  const tm = getDecisionModalMetrics(scaleRatio);
  const ui = tm.uiScale;
  return (
    <div className="toe-dialog-backdrop" style={tm.overlay}>
      <div className="toe-dialog toe-dialog--decision" data-ui-dialog="god-choice" role="dialog" style={{
         padding: `${20*ui}px ${28*ui}px`, maxWidth: 660*ui, width: 'min(94vw, 100%)', textAlign: 'center',
        animation: 'animPop 0.22s ease-out',
        display: 'flex',
        flexDirection: 'column',
        gap: 12*ui,
        ...tm.panel,
      }}>
        <div className="toe-title" style={{   fontSize: 19.5*ui, letterSpacing: 2, marginBottom: 4*ui }}>
          {forcedConvert ? '邪祀者强制改信——' : '邪神降临——'}
          <span style={{ color: def.col, filter: `drop-shadow(0 0 6px ${def.col}88)` }}>{godCard.name}</span>
        </div>
        <div style={{ fontSize: 16.5*ui, color: '#c89058', fontStyle: 'italic',  marginBottom: 4*ui }}>
          {'💀'.repeat(player.godEncounters)} {formatGodEncounterProgress(encounterProgress).replace(/次(?=，|$)/, '次遭遇邪神')}
          {immuneEncounter ? '（邪祀者免疫伤害）' : `，失去 ${encounterProgress.sanLoss} SAN`}
          {isConvert && !forcedConvert && <span style={{ color: '#e08888', marginLeft: 8*ui }}>（改信将失去 1 SAN）</span>}
        </div>
        {/* Power gain preview */}
        {!forcedConvert && (
          <div style={{
            fontSize: 12*ui, color: def.col,  letterSpacing: 1,
            marginBottom: 8*ui, opacity: 0.94,
            background: def.bgCol, border: `1px solid ${def.col}55`,
            borderRadius: 3, padding: `${4*ui}px ${12*ui}px`, display: 'inline-block',
            alignSelf: 'center'
          }}>
            {canUpgrade
              ? `⬆ 升级后你将获得：${def.power} Lv.${(player.godLevel || 0) + 1}`
              : `⛧ 信仰后你将获得邪神之力：${def.power} Lv.1`}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24*ui, flexWrap: 'wrap' }}>
          <CardFaceImage card={godCard} godLevel={alreadyWorship ? (player.godLevel + 1) : 1} width={176*tm.cardScale} />
          <div style={{ flex: '1 1 210px', maxWidth: 320*ui }}>
            <GodCardDisplay card={godCard} level={alreadyWorship ? (player.godLevel + 1) : 1} scale={tm.cardScale} />
          </div>
        </div>
        {isBystander ? (
          <div style={{  fontStyle: 'italic', color: '#c8a96e', fontSize: 15*ui, marginTop: 8*ui }}>
            {thinkingText}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 12*ui, flexWrap: 'wrap', justifyContent: 'center', marginTop: 8*ui }}>
            {!forcedConvert && (
              <button className="toe-button toe-button-primary" type="button" disabled={!allowWorship} onClick={allowWorship ? onWorship : undefined} style={{ padding: `${9*ui}px ${22*ui}px`,     fontSize: 16.5*ui,  cursor: allowWorship ? 'pointer' : 'not-allowed', letterSpacing: 1,  opacity: allowWorship ? 1 : 0.45 }}>
                {canUpgrade ? '⬆ 升级邪神之力' : isConvert ? '⛧ 改信新神' : '⛧ 信仰邪神'}
              </button>
            )}
            {!alreadyWorship && !forcedConvert && isCultist && allowKeepHand && (
              <button className="toe-button toe-button-primary" type="button" ref={keepButtonRef} onClick={onKeepHand} style={{ padding: `${9*ui}px ${22*ui}px`,     fontSize: 16.5*ui,  cursor: 'pointer', letterSpacing: 1, }}>
                ☽ 收入手牌
              </button>
            )}
            {!forcedConvert && (
              <button className="toe-button toe-button-danger" type="button" disabled={!allowDiscard} onClick={allowDiscard ? onDiscard : undefined} style={{ padding: `${9*ui}px ${22*ui}px`,     fontSize: 16.5*ui,  cursor: allowDiscard ? 'pointer' : 'not-allowed', letterSpacing: 1, opacity: allowDiscard ? 1 : 0.45 }}>
                放弃
              </button>
            )}
            {forcedConvert && (
              <button className="toe-button toe-button-primary" type="button" disabled={!allowWorship} onClick={allowWorship ? onWorship : undefined} style={{ padding: `${9*ui}px ${22*ui}px`,     fontSize: 16.5*ui,  cursor: allowWorship ? 'pointer' : 'not-allowed', letterSpacing: 1,  opacity: allowWorship ? 1 : 0.45 }}>
                ⛧ 接受改信
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── NYA Borrow Modal ──────────────────────────────────────────
function NyaBorrowModal({ deadPlayers, godLevel, onBorrow, onSkip }) {
  const penalty = GOD_DEFS.NYA.levels[Math.max(0, (godLevel || 1) - 1)].handPenalty;
  return (
    <div className="toe-dialog-backdrop" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 400, paddingTop: '10vh' }}>
      <div className="toe-dialog toe-dialog--decision" data-ui-dialog="nya-borrow" role="dialog" style={{
         padding: '20px 28px', maxWidth: 320, width: '90%', textAlign: 'center',
        animation: 'animPop 0.22s ease-out',
      }}>
        <div className="toe-title" style={{   fontSize: 20, letterSpacing: 3, marginBottom: 16, textTransform: 'uppercase' }}>── 千人千貌 Lv.{godLevel} ──</div>

        <div style={{  fontStyle: 'italic', color: "var(--toe-ui-muted, #a99b81)", fontSize: 14, marginBottom: 20, lineHeight: 1.4 }}>
          借用已死角色的身份直至回合结束{penalty > 0 ? `（手牌上限-${penalty}）` : ''}
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
          {deadPlayers.map((p, i) => (
            <button className="toe-button toe-option" type="button" key={i} onClick={() => onBorrow(p)} style={{
              padding: '10px 18px',
                fontSize: 12,  cursor: 'pointer',
              opacity: 0.85, transition: 'all .15s',
              }}>
              ☠ {p.role}（{p.name}）
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button className="toe-button" type="button" onClick={onSkip} style={{
            padding: '10px 22px',
              fontWeight: 700, fontSize: 14,
             cursor: 'pointer', letterSpacing: 1, transition: 'all .15s',
          }}>
            不借用，直接摸牌
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Draw Reveal Modal ─────────────────────────────────────────
function DrawRevealModal({ drawReveal, onKeep, onDiscard, canChoose, thinkingText, decisionError = null, canKeep = true, canDiscard = true, keepButtonRef, scaleRatio = 1 }) {
  if (!drawReveal?.card) return null;
  const { card } = drawReveal;
  const isBystander = !canChoose && thinkingText;
  const hideIdentity = shouldHideBlindZoneIdentity(drawReveal, canChoose);
  const tm = getDecisionModalMetrics(scaleRatio);
  const ui = tm.uiScale;
  return (
    <div className="toe-dialog-backdrop" style={{ ...tm.overlay, zIndex: 300 }}>
      <div className="toe-dialog toe-dialog--decision" data-ui-dialog="draw-reveal" role="dialog" style={{
         padding: `${20*ui}px ${28*ui}px`, maxWidth: 600*ui, width: 'min(94vw, 100%)', textAlign: 'center',
        animation: 'animPop 0.22s ease-out',
        ...tm.panel,
      }}>
        <div className="toe-title" style={{   fontSize: 15*ui, letterSpacing: 3, marginBottom: 16*ui, textTransform: 'uppercase' }}>── 区域探寻 ──</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24*ui, flexWrap: 'wrap' }}>
          {hideIdentity ? (
            <div style={{ flexShrink: 0 }}>
              <DDCardBack expansionKey={card.expansion} frameStyle={{ width: 176*tm.cardScale, height: 176*tm.cardScale*CARD_FACE_RATIO }} />
              <div className="toe-title" style={{ fontSize: 20*ui, marginTop: 10*ui }}>{getCardDisplayKey(card)}</div>
            </div>
          ) : <CardFaceImage card={card} width={176*tm.cardScale} />}
          <div className="toe-panel" style={{ flex: '1 1 190px', maxWidth: 280*ui, padding: 20*ui, textAlign: 'left', alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="toe-title" style={{ fontSize: 19*ui, marginBottom: 14*ui }}>{hideIdentity ? '未知区域' : card.name}</div>
            <div className="toe-subtitle" style={{ fontSize: 14*ui, lineHeight: 1.9 }}>{hideIdentity ? '此区域的身份暂时隐藏，等待探索者作出决定。' : card.desc}</div>
          </div>
        </div>

        {isBystander ? (
          <div style={{  fontStyle: 'italic', color: '#c8a96e', fontSize: 15*ui, marginTop: 16*ui }}>
            {thinkingText}
          </div>
        ) : (
          <>
          {decisionError && (
            <div role="alert" style={{ color: '#e08888', fontSize: 12*ui, lineHeight: 1.5, marginTop: 12*ui, marginBottom: 4*ui }}>
              结算准备失败，请重试。
            </div>
          )}
          <div style={{ display: 'flex', gap: 12*ui, justifyContent: 'center', flexWrap: 'wrap', marginTop: 16*ui }}>
            <button className="toe-button toe-button-primary" type="button" ref={keepButtonRef} disabled={!canKeep} onClick={canKeep ? onKeep : undefined} style={{
              padding: `${10*ui}px ${22*ui}px`,
                fontWeight: 700, fontSize: 14*ui,
               cursor: canKeep ? 'pointer' : 'not-allowed', letterSpacing: 1,
              opacity: canKeep ? 1 : 0.45,
               transition: 'all .15s',
            }}>
              收入手牌
              <div style={{ fontSize: 10.5*ui, opacity: 0.78, marginTop: 4*ui, fontWeight: 400, }}>
                (触发效果)
              </div>
            </button>
            <button className="toe-button toe-button-danger" type="button" disabled={!canDiscard} onClick={canDiscard ? onDiscard : undefined} style={{
              padding: `${10*ui}px ${22*ui}px`,
                fontWeight: 700, fontSize: 14*ui,
               cursor: canDiscard ? 'pointer' : 'not-allowed', letterSpacing: 1,
              opacity: canDiscard ? 1 : 0.45,
              transition: 'all .15s',
            }}>
              弃置此牌
            </button>
          </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Treasure Hunter Dodge Modal ─────────────────────────────
function TreasureDodgeModal({ drawReveal, onRoll, onSkip, thinkingText, rollButtonRef, canSkip = true, scaleRatio = 1 }) {
  if (!drawReveal?.card) return null;
  const { card } = drawReveal;
  const tm = getDecisionModalMetrics(scaleRatio);
  const ui = tm.uiScale;
  return (
    <div className="toe-dialog-backdrop" style={{ ...tm.overlay, zIndex: 300 }}>
      <div className="toe-dialog toe-dialog--decision" data-ui-dialog="treasure-dodge" role="dialog" style={{
         padding: `${20*ui}px ${28*ui}px`, maxWidth: 280*ui, width: 'min(90vw, 100%)', textAlign: 'center',
        animation: 'animPop 0.22s ease-out',
        ...tm.panel,
      }}>
        <div className="toe-title" style={{   fontSize: 15*ui, letterSpacing: 3, marginBottom: 16*ui, textTransform: 'uppercase' }}>── 寻宝者能力 ──</div>
        <div style={{ display: 'flex', justifyContent: 'center' }}><CardFaceImage card={card} width={148*tm.cardScale} /></div>

        <div style={{  fontStyle: 'italic', color: '#c8a96e', fontSize: 14*ui, marginTop: 12*ui, lineHeight: 1.6 }}>
          你即将承受这张牌的负面效果！作为寻宝者，你可以掷骰子尝试规避。
        </div>
        <div style={{  fontStyle: 'italic', color: '#a08060', fontSize: 13*ui, marginTop: 8*ui }}>
          掷出 4、5、6 点可成功规避负面效果。
        </div>

        {thinkingText && (
          <div style={{  fontStyle: 'italic', color: '#e8c87a', fontSize: 14*ui, marginTop: 12*ui, lineHeight: 1.6 }}>
            {thinkingText}
          </div>
        )}

        {!thinkingText && (
          <div style={{ display: 'flex', gap: 12*ui, justifyContent: 'center', flexWrap: 'wrap', marginTop: 20*ui }}>
            <button className="toe-button toe-button-primary" type="button" ref={rollButtonRef} onClick={onRoll} style={{
              padding: `${10*ui}px ${22*ui}px`,
                fontWeight: 700, fontSize: 14*ui,
               cursor: 'pointer', letterSpacing: 1,
               transition: 'all .15s',
            }}>
              掷骰子
              <div style={{ fontSize: 10*ui, opacity: 0.7, marginTop: 4*ui, fontWeight: 400, }}>
                (尝试规避)
              </div>
            </button>
            {canSkip && (
            <button className="toe-button toe-button-danger" type="button" onClick={onSkip} style={{
              padding: `${10*ui}px ${22*ui}px`,
                fontWeight: 700, fontSize: 14*ui,
               cursor: 'pointer', letterSpacing: 1, transition: 'all .15s',
            }}>
              直接触发
            </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PeekHandModal({ card, targetName, onClose }) {
  if (!card) return null;
  return (
    <div className="toe-dialog-backdrop" style={{
      position: 'fixed', inset: 0, zIndex: 1200,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20
    }} onClick={onClose}>
      <div className="toe-dialog toe-dialog--decision" data-ui-dialog="peek-hand" role="dialog" data-modal style={{
        width: 360, maxWidth: 'calc(100vw - 24px)',
        maxHeight: 'calc(100dvh - 40px)', overflowY: 'auto',
         padding: '18px 18px 16px',
        }} onClick={e => e.stopPropagation()}>
        <div className="toe-title" style={{  fontSize: 22, letterSpacing: 2, textAlign: 'center',  marginBottom: 8 }}>血之窥探</div>
        <div style={{ textAlign: 'center', fontSize: 13, color: '#c8a96e', marginBottom: 16 }}>
          你偷看了 {targetName} 的一张手牌
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <CardFaceImage card={card} width={196} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button className="toe-button" type="button" onClick={onClose} style={{
            padding: '8px 20px',
            cursor: 'pointer',
            }}>确认</button>
        </div>
      </div>
    </div>
  );
}

function TortoiseOracleModal({ abilityData, onSelect, canPick = false, expansionKey = '地神的潜影' }) {
  const revealedCards = useMemo(() => abilityData?.revealedCards || [], [abilityData?.revealedCards]);
  const selectableKeys = abilityData?.selectableKeys || [];
  const [revealedCount, setRevealedCount] = useState(0);
  const revealedCardsKey = useMemo(() => revealedCards.map(c => c.id ?? c.key).join('|'), [revealedCards]);

  useEffect(() => {
    const t = setTimeout(() => setRevealedCount(0), 0);
    return () => clearTimeout(t);
  }, [revealedCardsKey]);

  useEffect(() => {
    if (!revealedCards.length) return;
    if (revealedCount >= revealedCards.length) return;
    const t = setTimeout(() => setRevealedCount(v => Math.min(v + 1, revealedCards.length)), 220);
    return () => clearTimeout(t);
  }, [revealedCount, revealedCards]);

  if (!abilityData) return null;
  return (
    <div className="toe-dialog-backdrop" style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}>
      <div className="toe-dialog toe-dialog--decision" data-ui-dialog="tortoise-oracle" role="dialog" style={{     padding: '20px 28px', maxWidth: 520, width: '92%', textAlign: 'center' }}>
        <div className="toe-title" style={{   fontSize: 20, letterSpacing: 2, marginBottom: 16 }}>── 灵龟卜祝 ──</div>
        <div style={{  fontStyle: 'italic', color: "var(--toe-ui-muted, #a99b81)", fontSize: 14, marginBottom: 16, lineHeight: 1.4 }}>
          {canPick ? '展示牌堆顶的牌，再选择你手中最多的一个字母或数字编号' : '灵龟卜祝翻开了牌堆顶的牌'}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 18, minHeight: 120 }}>
          {revealedCards.map((card, index) => (
            <div key={card.id ?? `${card.key}-${index}`} style={{ opacity: index < revealedCount ? 1 : 0.28, transform: index < revealedCount ? 'scale(1)' : 'scale(0.95)', transition: 'all .18s' }}>
              {index < revealedCount ? <DDCard card={card} compact /> : <DDCardBack expansionKey={expansionKey} />}
            </div>
          ))}
        </div>
        {canPick && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 8 }}>
            {selectableKeys.map((key, i) => (
              <button className="toe-button toe-option" type="button" key={i} onClick={() => onSelect(key)} style={{
                padding: '10px 18px',
                  fontSize: 12,  cursor: 'pointer',
                opacity: 0.9, transition: 'all .15s',
              }}>{key}</button>
            ))}
          </div>
        )}
        {!canPick && (
          <div className="toe-subtitle" style={{  fontSize: 12,  letterSpacing: 1 }}>
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
    <div className="toe-dialog-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0,  zIndex: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="toe-dialog" data-ui-dialog="about" role="dialog" onClick={e => e.stopPropagation()} style={{
        width: 440, maxWidth: '92vw', maxHeight: '92dvh',
         position: 'relative', overflowY: 'auto',
      }}>
        {/* Close */}
        <button className="toe-dialog-close" aria-label="关闭" type="button" onClick={onClose} style={{ position: 'absolute', top: 8, right: 10,    fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
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
            <div className="toe-subtitle" style={{  fontSize: 11,  letterSpacing: 1 }}>Sam</div>
          </div>
          {/* Bio */}
          <div style={{ flex: 1, paddingTop: 4 }}>
            <div className="toe-title" style={{  fontSize: 20,  letterSpacing: 2, marginBottom: 8, textTransform: 'uppercase' }}>— 关于作者 —</div>
            <div className="toe-subtitle" style={{  fontSize: 12, lineHeight: 1.8, fontStyle: 'italic' }}>
              猫奴，社畜，不回就是在上班，会尽量努力更新。
            </div>
            <div className="toe-subtitle" style={{  fontSize: 11, lineHeight: 1.8, marginTop: 8, fontStyle: 'italic' }}>
              如果你遇到与游戏规则有关的bug，记得在游戏结束后点击"显示游戏日志"并复制内容。
            </div>
          </div>
        </div>
        {/* Divider */}
        <div style={{ width: '80%', height: 1, background: 'linear-gradient(90deg,transparent,#5a3a10,transparent)', margin: '0 auto' }} />
        {/* Bottom half */}
        <div style={{ padding: '16px 20px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div className="toe-title" style={{  fontSize: 20,  letterSpacing: 2, textTransform: 'uppercase' }}>— 意见与反馈 —</div>
          <a
            href="https://v.wjx.cn/vm/mGJYO4f.aspx"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#d8b868', fontSize: 12, letterSpacing: 1, fontStyle: 'italic', textDecoration: 'underline', textUnderlineOffset: 3 }}
          >
            问卷链接
          </a>
          <div className="toe-subtitle" style={{  fontSize: 12, letterSpacing: 1, fontStyle: 'italic' }}>QQ催更群：787317460</div>
          <div className="toe-subtitle" style={{  fontSize: 12, letterSpacing: 1, fontStyle: 'italic' }}>微信催更群二维码</div>
          <img
            src={buildPublicUrl('img/QRCode.webp')}
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
    <div className="toe-dialog-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0,  zIndex: 1800, display: 'flex', alignItems: 'stretch', justifyContent: 'center', padding: '20px 12px' }}>
      <div className="toe-dialog" data-ui-dialog="full-log" role="dialog" onClick={e => e.stopPropagation()} style={{
        width: 'min(980px,100%)', height: '100%',
         display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px 12px', borderBottom: '1px solid #3a2410' }}>
          <div>
            <div className="toe-title" style={{  fontSize: 20,  letterSpacing: 2, textTransform: 'uppercase' }}>完整游戏日志</div>
            <div className="toe-subtitle" style={{ fontSize: 11,  marginTop: 4 }}>可滚动查看并直接复制全部内容</div>
          </div>
          <button className="toe-button" type="button" onClick={onClose} style={{
             padding: '6px 12px', cursor: 'pointer',
             fontSize: 12, letterSpacing: 1,
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
    <div className="toe-dialog-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0,  zIndex: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="toe-dialog" data-ui-dialog="roadmap" role="dialog" onClick={e => e.stopPropagation()} style={{
        width: 460, maxWidth: '92vw', maxHeight: '92dvh', overflowY: 'auto', padding: '28px 28px 30px',
         position: 'relative',
      }}>
        <button className="toe-dialog-close" aria-label="关闭" type="button" onClick={onClose} style={{ position: 'absolute', top: 8, right: 10,    fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>✕</button>
        <div className="toe-title" style={{  fontSize: 20,  letterSpacing: 2, textTransform: 'uppercase', marginBottom: 16, textAlign: 'center' }}>— 版本更新计划 —</div>
        {/* Current version */}
        <div style={{ marginBottom: 12 }}>
          <div className="toe-subtitle" style={{  fontSize: 11,  letterSpacing: 1, marginBottom: 4 }}>当前版本：0.1.5</div>
          {[
            '新增卡面和音效！',
            '感谢九艺夏日游艺节现场的试玩反馈！新手教程全面翻新，已加入技能讲解',
            '追猎者追捕技能调整为：放弃追捕后，本回合禁用。现在追猎者必须更谨慎挑选攻击目标，AI追猎者也不会再一直说书了',
            '联机ID池新增神秘金色ID',
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
          <div className="toe-subtitle" style={{  fontSize: 11,  letterSpacing: 1, marginBottom: 10 }}>下一个版本：0.2.1</div>
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
