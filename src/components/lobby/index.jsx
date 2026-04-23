import React from 'react';
import {
  FIXED_ZONE_CARD_VARIANTS_BY_KEY,
  LETTERS,
  NUMS,
  ROLE_TREASURE,
  ROLE_HUNTER,
  ROLE_CULTIST,
} from '../../constants/card';

const ZONE_CARD_KEYS = LETTERS.flatMap(L => NUMS.map(N => `${L}${N}`));

const smallBtnStyle = {
  padding: '4px 12px',
  background: '#180e08',
  border: '1px solid #3a2510',
  color: '#a07838',
  fontFamily: "'Cinzel',serif",
  fontSize: 10,
  borderRadius: 2,
  cursor: 'pointer',
  letterSpacing: 1,
};

// ── Room Modal ────────────────────────────────────────────────
function RoomModal({
  roomModal,
  playerUUID,
  playerUUIDRef,
  cdType,
  cdSecondsLeft,
  onClose,
  onTogglePrivacy,
  onSetReady,
  onCopyRoomId,
}) {
  if (!roomModal) return null;
  const myPlayerRec = roomModal.players.find(p => p.uuid === playerUUID);
  const myReady = myPlayerRec?.ready || false;

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0e0a14', border: '2px solid #7a50b0', borderRadius: 6,
        padding: '32px 36px', maxWidth: 420, width: '90%',
        boxShadow: '0 0 60px #5a3a8066', animation: 'animPop 0.25s ease-out',
        position: 'relative',
      }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', color: '#5a4070', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '2px 6px' }}>✕</button>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 28, marginBottom: 10, filter: 'drop-shadow(0 0 12px #a080d088)' }}>🔮</div>
          <div style={{ fontFamily: "'Cinzel Decorative','Cinzel',serif", fontSize: 16, color: '#c8a0e8', letterSpacing: 2, marginBottom: 6 }}>联机房间</div>
          <div style={{ width: 120, height: 1, background: 'linear-gradient(90deg,transparent,#7a50b0,transparent)', margin: '0 auto' }} />
        </div>
        <div style={{ background: '#160d22', border: '1px solid #5a3a80', borderRadius: 4, padding: '16px', textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: "'Cinzel',serif", color: '#8060a0', fontSize: 10, letterSpacing: 3, marginBottom: 8, textTransform: 'uppercase' }}>— 房间号 —</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
            <div style={{ fontFamily: "'Cinzel Decorative','Cinzel',serif", fontSize: 28, color: '#e0c0f8', letterSpacing: 6, textShadow: '0 0 20px #a080d066' }}>{roomModal.roomId}</div>
            <button onClick={onCopyRoomId} title="复制房间号" style={{
              background: '#1a0d2e', border: '1px solid #7a50b0', borderRadius: 4,
              padding: '5px 10px', cursor: 'pointer', color: '#c8a0e8',
              fontFamily: "'Cinzel',serif", fontSize: 11, letterSpacing: 1,
              display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0,
              boxShadow: '0 0 8px #5a3a8044',
            }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c8a0e8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              复制
            </button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <div style={{ color: '#6a5080', fontSize: 10, fontStyle: 'italic' }}>将此房间号分享给其他玩家</div>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: '#8060a0', letterSpacing: 1 }}>房间人数：<span style={{ color: '#c8a0e8' }}>{roomModal.count || roomModal.players.length}</span>/{roomModal.max || 12}</div>
          </div>
          {/* 房间隐私状态 */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: '#8060a0', letterSpacing: 1 }}>房间状态：</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {roomModal.owner === (playerUUIDRef?.current || playerUUID) ? (
                <button
                  onClick={() => onTogglePrivacy(!roomModal.isPrivate)}
                  title={roomModal.isPrivate ? '切换为公开' : '切换为私密'}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    borderRadius: 4,
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(122, 80, 176, 0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'none'}
                >
                  <span style={{ fontSize: 12 }}>{roomModal.isPrivate ? '🔒' : '🔓'}</span>
                  <span style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: roomModal.isPrivate ? '#e0c0f8' : '#90d090', letterSpacing: 1 }}>{roomModal.isPrivate ? '私密' : '公开'}</span>
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 12 }}>{roomModal.isPrivate ? '🔒' : '🔓'}</span>
                  <span style={{ fontFamily: "'Cinzel',serif", fontSize: 10, color: roomModal.isPrivate ? '#e0c0f8' : '#90d090', letterSpacing: 1 }}>{roomModal.isPrivate ? '私密' : '公开'}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* 玩家列表 + 准备状态 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontFamily: "'Cinzel',serif", color: '#6a5080', fontSize: 9, letterSpacing: 3, marginBottom: 10, textTransform: 'uppercase' }}>— 当前玩家 —</div>
          {roomModal.players.map((p) => (
            <div key={p.uuid} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', marginBottom: 6, background: '#1a1028', border: `1px solid ${p.ready ? '#3a6a3a' : '#3a2560'}`, borderRadius: 3, transition: 'border-color .3s' }}>
              <span style={{ fontSize: 12 }}>{p.ready ? '✅' : '⬜'}</span>
              <span style={{ fontFamily: "'Cinzel',serif", fontSize: 13, color: p.isSpecialName ? '#d8b35c' : (p.ready ? '#90d090' : '#c8a0e8'), letterSpacing: 0.5, textShadow: p.isSpecialName ? '0 0 10px rgba(216,179,92,.22)' : 'none' }}>{p.username}</span>
              {p.uuid === playerUUID && <span style={{ marginLeft: 'auto', color: '#7060a0', fontSize: 9, fontStyle: 'italic' }}>（你）</span>}
              {p.isAI && <span style={{ marginLeft: 'auto', color: '#a060a0', fontSize: 9, fontStyle: 'italic' }}>[AI]</span>}
            </div>
          ))}
        </div>
        {/* 准备按钮 */}
        <button onClick={() => onSetReady(!myReady)} style={{
          width: '100%', padding: '11px', marginBottom: 14,
          background: myReady ? '#0a2a0a' : '#1a0a2e',
          border: `1.5px solid ${myReady ? '#3a8a3a' : '#7a50b0'}`,
          borderRadius: 4, color: myReady ? '#80e080' : '#c8a0e8',
          fontFamily: "'Cinzel Decorative','Cinzel',serif", fontSize: 12, letterSpacing: 2, cursor: 'pointer',
          transition: 'all .25s',
        }}>{myReady ? '✅ 已准备（点击取消）' : '⬜ 点击准备'}</button>
        {/* 倒计时显示 */}
        {cdType && cdSecondsLeft !== null && cdSecondsLeft > 0 && (
          <div style={{
            textAlign: 'center', padding: '8px 12px', marginBottom: 10, borderRadius: 4,
            background: cdType === 'start' ? '#0a1a0a' : '#1a0a08',
            border: `1px solid ${cdType === 'start' ? '#2a6a2a' : '#7a3010'}`,
            color: cdType === 'start' ? '#80e080' : '#e08060',
            fontFamily: "'Cinzel',serif", fontSize: 11, letterSpacing: 1,
          }}>
            {cdType === 'start'
              ? `🎮 全员准备！${cdSecondsLeft}s 后开始游戏…`
              : `⏳ ${cdSecondsLeft}s 后将踢出未准备的玩家`}
          </div>
        )}
        {myReady && !roomModal.players.every(p => p.ready) && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#6a5080', fontSize: 11, fontStyle: 'italic', fontFamily: "'IM Fell English','Georgia',serif" }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, border: '1.5px solid #5a3a80', borderTopColor: '#a080d0', borderRadius: '50%', animation: 'spinLoader 0.9s linear infinite' }} />
            等待其他玩家就绪…
          </div>
        )}
      </div>
    </div>
  );
}

// ── Game Lobby Modal ──────────────────────────────────────────
function LobbyModal({ lobbyModal, lobbyLoading, lobbyRooms, onClose, onRefresh, onJoinRoom }) {
  if (!lobbyModal) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0e0a14', border: '2px solid #7a50b0', borderRadius: 6,
        padding: '32px 36px', maxWidth: 500, width: '90%',
        boxShadow: '0 0 60px #5a3a8066', animation: 'animPop 0.25s ease-out',
        position: 'relative',
      }}>
        <button onClick={onClose} style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', color: '#5a4070', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '2px 6px' }}>✕</button>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 28, marginBottom: 10, filter: 'drop-shadow(0 0 12px #a080d088)' }}>🏛️</div>
          <div style={{ fontFamily: "'Cinzel Decorative','Cinzel',serif", fontSize: 16, color: '#c8a0e8', letterSpacing: 2, marginBottom: 6 }}>游戏大厅</div>
          <div style={{ width: 120, height: 1, background: 'linear-gradient(90deg,transparent,#7a50b0,transparent)', margin: '0 auto' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: "'Cinzel',serif", color: '#8060a0', fontSize: 10, letterSpacing: 3, textTransform: 'uppercase' }}>— 公开房间 —</div>
          <button onClick={onRefresh} style={{
            background: '#1a0d2e', border: '1px solid #7a50b0', borderRadius: 4,
            padding: '4px 8px', cursor: 'pointer', color: '#c8a0e8',
            fontFamily: "'Cinzel',serif", fontSize: 9, letterSpacing: 1,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#c8a0e8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.5 2v6h-6M2.5 22v-6h6" />
              <path d="M2 12A10 10 0 0 1 22 12" />
            </svg>
            刷新
          </button>
        </div>
        <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 20 }}>
          {lobbyLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
              <span style={{ display: 'inline-block', width: 16, height: 16, border: '2px solid #5a3a80', borderTopColor: '#a080d0', borderRadius: '50%', animation: 'spinLoader 0.7s linear infinite' }} />
            </div>
          ) : lobbyRooms.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#6a5080', fontFamily: "'IM Fell English','Georgia',serif", fontSize: 12, fontStyle: 'italic' }}>
              暂无公开房间
            </div>
          ) : (
            lobbyRooms.map((room) => (
              <div key={room.roomId} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 16px', marginBottom: 8,
                background: '#1a1028', border: '1px solid #4a3070', borderRadius: 4,
                transition: 'all .2s',
              }}>
                <div>
                  <div style={{ fontFamily: "'Cinzel Decorative','Cinzel',serif", fontSize: 14, color: '#e0c0f8', letterSpacing: 2 }}>{room.roomId}</div>
                  <div style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: '#8060a0', letterSpacing: 1, marginTop: 2 }}>
                    人数：{room.count}/{room.max}
                  </div>
                </div>
                <button onClick={() => onJoinRoom(room.roomId)} style={{
                  background: '#1e0d36', border: '1px solid #7a50b0', borderRadius: 3,
                  padding: '6px 12px', cursor: 'pointer', color: '#c8a0e8',
                  fontFamily: "'Cinzel',serif", fontSize: 10, letterSpacing: 1,
                  transition: 'all .2s',
                }}>
                  加入
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Privacy Toggle Confirm Modal ──────────────────────────────
function PrivacyToggleModal({ show, dontShowAgain, onChangeDontShow, onConfirm, onCancel }) {
  if (!show) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 1600, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{
        background: '#0e0a14', border: '2px solid #7a50b0', borderRadius: 6,
        padding: '28px 32px', maxWidth: 400, width: '90%',
        boxShadow: '0 0 60px #5a3a8066', animation: 'animPop 0.25s ease-out',
        position: 'relative',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 24, marginBottom: 12, filter: 'drop-shadow(0 0 12px #a080d088)' }}>🔓</div>
          <div style={{ fontFamily: "'Cinzel Decorative','Cinzel',serif", fontSize: 14, color: '#c8a0e8', letterSpacing: 2, marginBottom: 10 }}>确认公开房间</div>
          <div style={{ width: 100, height: 1, background: 'linear-gradient(90deg,transparent,#7a50b0,transparent)', margin: '0 auto', marginBottom: 16 }} />
          <div style={{ color: '#e0c0f8', fontSize: 12, lineHeight: 1.6, fontFamily: "'IM Fell English','Georgia',serif", textAlign: 'center' }}>
            该房间将在游戏大厅对所有用户公开，是否继续？
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              id="dontShowAgain"
              checked={dontShowAgain}
              onChange={e => onChangeDontShow(e.target.checked)}
              style={{
                accentColor: '#7a50b0',
                transform: 'scale(1.2)',
              }}
            />
            <label htmlFor="dontShowAgain" style={{
              color: '#8060a0', fontSize: 11, fontFamily: "'Cinzel',serif", letterSpacing: 1,
              cursor: 'pointer',
            }}>
              下次不再提示
            </label>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onConfirm} style={{
            flex: 1, padding: '10px', background: '#1e0d36',
            border: '1.5px solid #7a50b0', borderRadius: 4,
            color: '#c8a0e8', fontFamily: "'Cinzel Decorative','Cinzel',serif",
            fontSize: 12, letterSpacing: 2, cursor: 'pointer',
            transition: 'all .2s',
          }}>
            公开
          </button>
          <button onClick={onCancel} style={{
            flex: 1, padding: '10px', background: '#1a1030',
            border: '1.5px solid #5a3a80', borderRadius: 4,
            color: '#b090d8', fontFamily: "'Cinzel Decorative','Cinzel',serif",
            fontSize: 12, letterSpacing: 2, cursor: 'pointer',
            transition: 'all .2s',
          }}>
            不公开
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tutorial Overlay ──────────────────────────────────────────
function TutorialOverlay({ show, step, onComplete, onStart }) {
  if (!show) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* ── Step 1: Greeting ── */}
      {step === 1 && (
        <div style={{ background: '#120d06', border: '2px solid #7a5020', borderRadius: 4, padding: '36px 40px', maxWidth: 380, width: '90%', textAlign: 'center', boxShadow: '0 0 60px #7a502066', position: 'relative', animation: 'animPop 0.25s ease-out' }}>
          <div style={{ fontSize: 30, marginBottom: 16, filter: 'drop-shadow(0 0 14px #c8a96e66)' }}>👁</div>
          <p style={{ color: '#e8c87a', fontSize: 15, lineHeight: 2, fontStyle: 'italic', marginBottom: 10, fontFamily: "'IM Fell English','Georgia',serif" }}>
            哈，又是一个不怕死的人！
          </p>
          <p style={{ color: '#c8a96e', fontSize: 14, lineHeight: 2, fontStyle: 'italic', marginBottom: 32, opacity: 0.75, fontFamily: "'IM Fell English','Georgia',serif" }}>
            等等——我们是不是见过…
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button
              onClick={onComplete}
              style={{ padding: '9px 24px', background: 'transparent', border: '1.5px solid #3a2510', color: '#b89858', fontFamily: "'Cinzel',serif", fontWeight: 700, fontSize: 11, borderRadius: 2, cursor: 'pointer', letterSpacing: 1.5, textTransform: 'uppercase', transition: 'all .2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = '#7a5020'; e.currentTarget.style.color = '#c8a96e'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = '#3a2510'; e.currentTarget.style.color = '#7a6040'; }}
            >
              我是老手（跳过引导）
            </button>
            <button
              onClick={onStart}
              style={{ padding: '10px 24px', background: '#1c1008', border: '2px solid #c8a96e', color: '#e8c87a', fontFamily: "'Cinzel',serif", fontWeight: 700, fontSize: 11, borderRadius: 2, cursor: 'pointer', letterSpacing: 1.5, textTransform: 'uppercase', boxShadow: '0 0 18px #c8a96e33', transition: 'all .2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#2a1a08'; e.currentTarget.style.boxShadow = '0 0 30px #c8a96e66'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#1c1008'; e.currentTarget.style.boxShadow = '0 0 18px #c8a96e33'; }}
            >
              ✦ 告诉我如何探索
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Connection Error Modal ────────────────────────────────────
function ConnectionErrorModal({ show, onClose }) {
  if (!show) return null;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: '#000000bb', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#0e0a14', border: '2px solid #5a3a80', borderRadius: 6, padding: '32px 36px', maxWidth: 360, width: '90%', textAlign: 'center', boxShadow: '0 0 60px #5a3a8066', animation: 'animPop 0.25s ease-out', cursor: 'default' }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>🔌</div>
        <p style={{ color: '#c8a0e8', fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic', fontSize: 14, lineHeight: 1.9, marginBottom: 24 }}>
          无法连接服务器，<br />先试试单人玩法吧
        </p>
        <div style={{ color: '#5a4070', fontSize: 10, fontFamily: "'Cinzel',serif", letterSpacing: 1 }}>点击任意位置关闭</div>
      </div>
    </div>
  );
}

// ── Debug Settings Panel ──────────────────────────────────────
function DebugSettingsPanel({
  show,
  localDebugMode,
  onToggleDebugMode,
  onToggleShowSettings,
  debugForceCardTarget, setDebugForceCardTarget,
  debugForceCardKeep, setDebugForceCardKeep,
  debugForceCardType, setDebugForceCardType,
  debugForceZoneCardKey, setDebugForceZoneCardKey,
  debugForceZoneCardName, setDebugForceZoneCardName,
  debugForceGodCardKey, setDebugForceGodCardKey,
  debugPlayerRole, setDebugPlayerRole,
}) {
  if (!show) return null;
  return (
    <div style={{
      position: 'fixed',
      top: 50,
      left: 14,
      zIndex: 120,
      background: '#1a120a',
      border: '1px solid #3a2510',
      borderRadius: 4,
      padding: 16,
      boxShadow: '0 0 20px rgba(0,0,0,0.8)',
      color: '#c8a96e',
      minWidth: 300,
    }}>
      <h3 style={{ marginTop: 0, marginBottom: 16, color: '#f0cb7a' }}>Debug设置</h3>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>强制摸牌目标</label>
        <select
          value={debugForceCardTarget}
          onChange={(e) => setDebugForceCardTarget(e.target.value)}
          style={{
            width: '100%',
            padding: 6,
            background: '#2a1608',
            color: '#c8a96e',
            border: '1px solid #3a2510',
            borderRadius: 4,
          }}
        >
          <option value="player">玩家</option>
          <option value="ai1">1号位角色</option>
        </select>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>1号位角色是否收入这张牌</label>
        <select
          value={debugForceCardKeep}
          onChange={(e) => setDebugForceCardKeep(e.target.value)}
          style={{
            width: '100%',
            padding: 6,
            background: '#2a1608',
            color: '#c8a96e',
            border: '1px solid #3a2510',
            borderRadius: 4,
          }}
        >
          <option value="auto">自动判断</option>
          <option value="keep">强制收入</option>
          <option value="discard">强制弃置</option>
        </select>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>牌类型</label>
        <select
          value={debugForceCardType}
          onChange={(e) => setDebugForceCardType(e.target.value)}
          style={{
            width: '100%',
            padding: 6,
            background: '#2a1608',
            color: '#c8a96e',
            border: '1px solid #3a2510',
            borderRadius: 4,
          }}
        >
          <option value="zone">区域牌</option>
          <option value="god">神牌</option>
        </select>
      </div>
      {debugForceCardType === 'zone' && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>区域牌编号</label>
            <select
              value={debugForceZoneCardKey}
              onChange={(e) => {
                const newKey = e.target.value;
                setDebugForceZoneCardKey(newKey);
                const cards = FIXED_ZONE_CARD_VARIANTS_BY_KEY[newKey] || [];
                if (cards.length) {
                  setDebugForceZoneCardName(cards[0].name);
                }
              }}
              style={{
                width: '100%',
                padding: 6,
                background: '#2a1608',
                color: '#c8a96e',
                border: '1px solid #3a2510',
                borderRadius: 4,
              }}
            >
              {ZONE_CARD_KEYS.map(key => (
                <option key={key} value={key}>{key}</option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>区域牌</label>
            <select
              value={debugForceZoneCardName}
              onChange={(e) => setDebugForceZoneCardName(e.target.value)}
              style={{
                width: '100%',
                padding: 6,
                background: '#2a1608',
                color: '#c8a96e',
                border: '1px solid #3a2510',
                borderRadius: 4,
              }}
            >
              {FIXED_ZONE_CARD_VARIANTS_BY_KEY[debugForceZoneCardKey] && FIXED_ZONE_CARD_VARIANTS_BY_KEY[debugForceZoneCardKey].map((card) => (
                <option key={card.name} value={card.name}>{card.name}</option>
              ))}
            </select>
          </div>
        </>
      )}
      {debugForceCardType === 'god' && (
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>神牌类型</label>
          <select
            value={debugForceGodCardKey}
            onChange={(e) => setDebugForceGodCardKey(e.target.value)}
            style={{
              width: '100%',
              padding: 6,
              background: '#2a1608',
              color: '#c8a96e',
              border: '1px solid #3a2510',
              borderRadius: 4,
            }}
          >
            <option value="CTH">克苏鲁</option>
            <option value="NYA">Nyarlathotep</option>
          </select>
        </div>
      )}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>当前设置</label>
        <div style={{ fontSize: 11, color: '#f0cb7a', padding: 6, background: '#2a1608', border: '1px solid #3a2510', borderRadius: 4 }}>
          {debugForceCardType === 'zone'
            ? `区域牌: ${debugForceZoneCardKey} - ${debugForceZoneCardName || ''}`
            : `神牌: ${debugForceGodCardKey === 'CTH' ? '克苏鲁' : 'Nyarlathotep'}`
          }
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>玩家身份（下局生效）</label>
        <select
          value={debugPlayerRole}
          onChange={(e) => setDebugPlayerRole(e.target.value)}
          style={{
            width: '100%',
            padding: 6,
            background: '#2a1608',
            color: '#c8a96e',
            border: '1px solid #3a2510',
            borderRadius: 4,
          }}
        >
          <option value="auto">自动</option>
          <option value={ROLE_TREASURE}>{ROLE_TREASURE}</option>
          <option value={ROLE_HUNTER}>{ROLE_HUNTER}</option>
          <option value={ROLE_CULTIST}>{ROLE_CULTIST}</option>
        </select>
      </div>
      <button
        type="button"
        onClick={onToggleShowSettings}
        style={{
          ...smallBtnStyle,
          width: '100%',
          background: '#2a1608',
          color: '#c8a96e',
          borderColor: '#3a2510',
        }}
      >
        关闭
      </button>
    </div>
  );
}

// ── Debug Controls (buttons + panel) ──────────────────────────
function DebugControls({
  isLocalTestMode,
  localDebugMode,
  onToggleDebugMode,
  showSettings,
  onToggleShowSettings,
  debugForceCardTarget, setDebugForceCardTarget,
  debugForceCardKeep, setDebugForceCardKeep,
  debugForceCardType, setDebugForceCardType,
  debugForceZoneCardKey, setDebugForceZoneCardKey,
  debugForceZoneCardName, setDebugForceZoneCardName,
  debugForceGodCardKey, setDebugForceGodCardKey,
  debugPlayerRole, setDebugPlayerRole,
}) {
  if (!isLocalTestMode) return null;
  return (
    <>
      <button
        type="button"
        onClick={onToggleDebugMode}
        style={{
          ...smallBtnStyle,
          position: 'fixed',
          top: 14,
          left: 14,
          zIndex: 120,
          fontSize: 11,
          padding: '6px 10px',
          background: localDebugMode ? '#2a1608' : '#140e08',
          color: localDebugMode ? '#f0cb7a' : '#9b7641',
          borderColor: localDebugMode ? '#7a5324' : '#3a2510',
          boxShadow: localDebugMode ? '0 0 14px #7a532455' : 'none',
        }}
      >
        {localDebugMode ? 'Debug: 开' : 'Debug: 关'}
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleShowSettings(); }}
        style={{
          ...smallBtnStyle,
          position: 'fixed',
          top: 14,
          left: 100,
          zIndex: 120,
          fontSize: 11,
          padding: '6px 10px',
          background: showSettings ? '#2a1608' : '#140e08',
          color: showSettings ? '#f0cb7a' : '#9b7641',
          borderColor: showSettings ? '#7a5324' : '#3a2510',
          boxShadow: showSettings ? '0 0 14px #7a532455' : 'none',
        }}
      >
        Debug设置
      </button>
      <DebugSettingsPanel
        show={showSettings}
        localDebugMode={localDebugMode}
        onToggleDebugMode={onToggleDebugMode}
        onToggleShowSettings={onToggleShowSettings}
        debugForceCardTarget={debugForceCardTarget} setDebugForceCardTarget={setDebugForceCardTarget}
        debugForceCardKeep={debugForceCardKeep} setDebugForceCardKeep={setDebugForceCardKeep}
        debugForceCardType={debugForceCardType} setDebugForceCardType={setDebugForceCardType}
        debugForceZoneCardKey={debugForceZoneCardKey} setDebugForceZoneCardKey={setDebugForceZoneCardKey}
        debugForceZoneCardName={debugForceZoneCardName} setDebugForceZoneCardName={setDebugForceZoneCardName}
        debugForceGodCardKey={debugForceGodCardKey} setDebugForceGodCardKey={setDebugForceGodCardKey}
        debugPlayerRole={debugPlayerRole} setDebugPlayerRole={setDebugPlayerRole}
      />
    </>
  );
}

export {
  RoomModal,
  LobbyModal,
  PrivacyToggleModal,
  TutorialOverlay,
  ConnectionErrorModal,
  DebugControls,
};
