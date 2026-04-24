import React from "react";
import { AnimOverlay } from "../anim/AnimOverlay";

export function StartScreen({
  vw,
  handleUiSfxCapture,
  anim,
  animExiting,
  startNewGame,
  handleMultiplayer,
  multiLoading,
  onOpenAbout,
  onOpenRoadmap,
  isDisconnected,
  onDisconnectedReset,
  toasts,
  onlineOptionsModal,
  closeOnlineOptions,
  handleCreateRoom,
  handleOpenLobby,
  joinRoomInput,
  setJoinRoomInput,
  handleJoinRoom,
  renameInputVisible,
  renameInput,
  setRenameInput,
  handleRename,
  handleRandomUsername,
  setRenameInputVisible,
  renameCdActive,
  playerUsername,
  playerUsernameSpecial,
}) {
  const lerp = (a, b, t) => a + (b - a) * t;
  const startRules = [
    '身份随机分配，HP / SAN 初始 10，上限 10',
    '每回合投 1 张牌，区域牌可选择收入手牌或弃置',
    '技能与休息每回合限用其一',
    '手牌上限 4 张，超出须弃牌',
  ];
  const startRoles = [
    { key: '寻宝者', goal: '集齐宝藏', icon: '/img/logo/logo_tr-no-bg.png', panel: '/img/btn/btn_dark_green.png', accent: '#8fd0ca' },
    { key: '追猎者', goal: '消灭所有非追猎者', icon: '/img/logo/logo_hu-no-bg.png', panel: '/img/btn/btn_dark_red.png', accent: '#d26458' },
    { key: '邪祀者', goal: '复活邪神', icon: '/img/logo/logo_cu-no-bg.png', panel: '/img/btn/btn_dark_purple.png', accent: '#a781cf' },
  ];
  const startWideProgress = Math.max(0, Math.min(1, (vw - 900) / 260));
  const frameWidth = `min(100%, ${Math.round(lerp(440, 860, startWideProgress))}px)`;
  const startShellPadding = Math.round(lerp(12, 24, startWideProgress));
  const startFramePaddingX = Math.round(lerp(4, 10, startWideProgress));
  const roleCardsBaseWidth = Math.round(lerp(420, 720, startWideProgress));
  const roleCardsBaseGap = Math.round(lerp(10, 12, startWideProgress));
  const roleCardBaseHeight = ((roleCardsBaseWidth - roleCardsBaseGap * 2) / 3) / (301 / 221);
  const roleCardsAvailableWidth = Math.max(0, vw - startShellPadding * 2 - startFramePaddingX * 2 - 8);
  const roleCardsScale = Math.min(1, roleCardsAvailableWidth / roleCardsBaseWidth);
  const roleCardsStageHeight = roleCardBaseHeight * roleCardsScale;
  const footerButtonsBaseWidth = Math.round(lerp(420, 720, startWideProgress));
  const footerButtonsBaseGap = Math.round(lerp(10, 16, startWideProgress));
  const footerButtonsAvailableWidth = Math.max(0, vw - startShellPadding * 2 - startFramePaddingX * 2 - 8);
  const footerButtonsScale = Math.min(1, footerButtonsAvailableWidth / footerButtonsBaseWidth);
  const footerButtonsStageHeight = lerp(52, 60, startWideProgress) * footerButtonsScale;

  return (
    <div
      onClickCapture={handleUiSfxCapture}
      style={{
        minHeight: '100vh',
        background: '#060707',
        color: '#c8a96e',
        fontFamily: "'IM Fell English','Georgia',serif",
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: Math.round(lerp(12, 24, startWideProgress)),
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'fixed',
          inset: 0,
          backgroundImage: "url('/img/bg/bg_main.png')",
          backgroundSize: 'cover',
          backgroundPosition: 'center top',
          backgroundRepeat: 'no-repeat',
          filter: `brightness(${lerp(0.92, 0.94, startWideProgress)}) saturate(${lerp(0.92, 1, startWideProgress)})`,
        }}
      />
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(ellipse at center,rgba(0,0,0,0.06) 28%,rgba(0,0,0,0.52) 100%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', inset: 0, background: 'linear-gradient(180deg,rgba(0,0,0,0.42) 0%,rgba(0,0,0,0.12) 24%,rgba(0,0,0,0.34) 100%)', pointerEvents: 'none' }} />
      <AnimOverlay anim={anim} exiting={animExiting} />
      <div style={{ position: 'relative', zIndex: 1, width: '100%', display: 'flex', justifyContent: 'center' }}>
        <div style={{ width: frameWidth, maxWidth: '100%', padding: `${Math.round(lerp(8, 18, startWideProgress))}px ${Math.round(lerp(4, 10, startWideProgress))}px ${Math.round(lerp(14, 18, startWideProgress))}px` }}>
          <div style={{ position: 'relative', margin: '0 auto', paddingTop: Math.round(lerp(28, 54, startWideProgress)) }}>
            <div
              style={{
                position: 'relative',
                margin: '0 auto 4px',
                width: `${lerp(100, 92, startWideProgress)}%`,
                minHeight: Math.round(lerp(240, 340, startWideProgress)),
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingBottom: Math.round(lerp(4, 10, startWideProgress)),
              }}
            >
              <div style={{ position: 'relative', display: 'inline-block', marginBottom: Math.round(lerp(8, 14, startWideProgress)) }}>
                <img
                  src="/img/title/texture_toehp.png"
                  alt="邪神的宝藏"
                  style={{
                    display: 'block',
                    width: Math.round(lerp(300, 442, startWideProgress)),
                    maxWidth: '100%',
                    height: 'auto',
                    filter: 'drop-shadow(0 2px 0 rgba(20,14,10,0.75)) drop-shadow(0 0 24px rgba(228,214,191,0.18))',
                  }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: Math.round(lerp(8, 14, startWideProgress)), width: '100%', marginBottom: Math.round(lerp(10, 12, startWideProgress)) }}>
                <img src="/img/line/line_titleguard-no-bg.png" alt="" style={{ width: Math.round(lerp(78, 128, startWideProgress)), opacity: 0.75 }} />
                <div style={{ fontFamily: "'Noto Serif SC','SimSun',serif", fontSize: Math.round(lerp(18, 28, startWideProgress)), letterSpacing: Math.round(lerp(4, 8, startWideProgress)), color: '#cbb293', textShadow: '0 0 12px rgba(0,0,0,0.35)', whiteSpace: 'nowrap' }}>克苏鲁卡牌对战</div>
                <img src="/img/line/line_titleguard-no-bg.png" alt="" style={{ width: Math.round(lerp(78, 128, startWideProgress)), opacity: 0.75, transform: 'scaleX(-1)' }} />
              </div>
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: Math.round(lerp(11, 17, startWideProgress)), letterSpacing: Math.round(lerp(6, 10, startWideProgress)), color: '#cbb293', textTransform: 'uppercase', marginBottom: Math.round(lerp(2, 4, startWideProgress)), opacity: 0.92 }}>Treasures Of Evils</div>
              <img src="/img/line/line_split-no-bg.png" alt="" style={{ width: `${lerp(82, 72, startWideProgress)}%`, maxWidth: 540, marginBottom: Math.round(lerp(8, 10, startWideProgress)), opacity: 0.82 }} />
              <p
                style={{
                  maxWidth: Math.round(lerp(360, 620, startWideProgress)),
                  margin: '0 auto',
                  padding: '0 12px',
                  fontFamily: "'Noto Serif SC','SimSun',serif",
                  color: '#c5a983',
                  fontSize: Math.round(lerp(14, 16, startWideProgress)),
                  lineHeight: 1.62,
                  letterSpacing: 1,
                  textShadow: '0 1px 8px rgba(0,0,0,0.4)',
                }}
              >
                “古神沉眠之时，旅者聚于此地。寻宝者寻觅遗物，追猎者猎杀异类，
                邪祀者企图唤醒邪神。各怀秘密，命运共织。”
              </p>
            </div>

            <div
              style={{
                position: 'relative',
                width: '100%',
                margin: '0 auto 4px',
                height: roleCardsStageHeight,
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '50%',
                  width: roleCardsBaseWidth,
                  marginLeft: -(roleCardsBaseWidth / 2),
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, minmax(0,1fr))',
                  gap: roleCardsBaseGap,
                  transform: `scale(${roleCardsScale})`,
                  transformOrigin: 'top center',
                }}
              >
                {startRoles.map((role) => (
                  <div
                    key={role.key}
                    style={{
                      position: 'relative',
                      width: '100%',
                      aspectRatio: '301 / 221',
                      boxSizing: 'border-box',
                      padding: `${Math.round(lerp(18, 22, startWideProgress))}px ${Math.round(lerp(12, 20, startWideProgress))}px ${Math.round(lerp(16, 18, startWideProgress))}px`,
                      backgroundImage: `url('${role.panel}')`,
                      backgroundSize: '100% 100%',
                      backgroundRepeat: 'no-repeat',
                      backgroundPosition: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    <img src={role.icon} alt="" style={{ width: Math.round(lerp(32, 42, startWideProgress)), height: Math.round(lerp(32, 42, startWideProgress)), objectFit: 'contain', marginBottom: Math.round(lerp(6, 8, startWideProgress)), filter: 'drop-shadow(0 0 8px rgba(0,0,0,0.28))' }} />
                    <div style={{ transform: `scale(${lerp(0.85, 1, startWideProgress)})`, transformOrigin: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                      <div style={{ fontFamily: "'Noto Serif SC','SimSun',serif", fontSize: Math.round(lerp(15, 18, startWideProgress)), color: role.accent, letterSpacing: Math.round(lerp(2, 3, startWideProgress)), marginBottom: 4, fontWeight: 700, whiteSpace: 'nowrap' }}>{role.key}</div>
                      <div style={{ fontFamily: "'Noto Serif SC','SimSun',serif", fontSize: Math.round(lerp(12, 13, startWideProgress)), color: '#ceb083', letterSpacing: Math.round(lerp(1, 2, startWideProgress)), lineHeight: 1.35, whiteSpace: 'nowrap' }}>{role.goal}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                position: 'relative',
                width: '100%',
                margin: '0 auto 8px',
                padding: `${Math.round(lerp(14, 16, startWideProgress))}px ${Math.round(lerp(20, 28, startWideProgress))}px ${Math.round(lerp(12, 14, startWideProgress))}px`,
                background: 'linear-gradient(180deg,rgba(6,12,14,0.72) 0%,rgba(8,12,13,0.8) 100%)',
                border: '1px solid rgba(118,93,58,0.52)',
                boxShadow: 'inset 0 0 0 1px rgba(32,24,16,0.72), 0 10px 40px rgba(0,0,0,0.2)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, rgba(255,255,255,0.03) 0%, transparent 62%)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: Math.round(lerp(8, 12, startWideProgress)), marginBottom: Math.round(lerp(6, 8, startWideProgress)) }}>
                <img src="/img/title/title_rule.png" alt="" style={{ width: Math.round(lerp(64, 96, startWideProgress)), opacity: 0.78 }} />
                <div style={{ fontFamily: "'Noto Serif SC','SimSun',serif", fontSize: Math.round(lerp(14, 18, startWideProgress)), color: '#c8b08b', letterSpacing: Math.round(lerp(3, 6, startWideProgress)), fontWeight: 700 }}>规则要点</div>
                <img src="/img/title/title_rule.png" alt="" style={{ width: Math.round(lerp(64, 96, startWideProgress)), opacity: 0.78, transform: 'scaleX(-1)' }} />
              </div>
              <div style={{ display: 'grid', gap: Math.round(lerp(4, 5, startWideProgress)), textAlign: 'left', position: 'relative' }}>
                {startRules.map((rule, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: Math.round(lerp(8, 12, startWideProgress)) }}>
                    <span style={{ color: '#b8996a', fontSize: Math.round(lerp(11, 13, startWideProgress)), lineHeight: 1.5 }}>✦</span>
                    <span style={{ fontFamily: "'Noto Serif SC','SimSun',serif", color: '#d0b28a', fontSize: Math.round(lerp(11, 13, startWideProgress)), lineHeight: 1.46, letterSpacing: lerp(0.3, 0.7, startWideProgress) }}>{rule}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: Math.round(lerp(8, 12, startWideProgress)), alignItems: 'center', margin: '0 auto 8px', width: '100%' }}>
              <button
                onClick={startNewGame}
                style={{
                  width: '100%',
                  aspectRatio: '397 / 133',
                  padding: `0 ${Math.round(lerp(18, 30, startWideProgress))}px`,
                  background: 'transparent',
                  backgroundImage: "url('/img/btn/btn_bright_green.png')",
                  backgroundSize: '100% 100%',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center',
                  border: 'none',
                  color: '#b5a68e',
                  fontFamily: "'Noto Serif SC','SimSun',serif",
                  fontSize: Math.round(lerp(18, 26, startWideProgress)),
                  fontWeight: 700,
                  letterSpacing: Math.round(lerp(1, 2, startWideProgress)),
                  cursor: 'pointer',
                  textShadow: '0 2px 6px rgba(0,0,0,0.45)',
                }}
              >
                踏入黑暗
              </button>
              <img src="/img/deco/deco_cth-no-bg.png" alt="" style={{ width: Math.round(lerp(46, 62, startWideProgress)), opacity: 0.9, filter: 'drop-shadow(0 2px 10px rgba(0,0,0,0.35))' }} />
              <button
                onClick={handleMultiplayer}
                disabled={multiLoading}
                style={{
                  width: '100%',
                  aspectRatio: '397 / 133',
                  padding: `0 ${Math.round(lerp(18, 30, startWideProgress))}px`,
                  background: 'transparent',
                  backgroundImage: "url('/img/btn/btn_bright_purple.png')",
                  backgroundSize: '100% 100%',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'center',
                  border: 'none',
                  color: multiLoading ? '#6a5a70' : '#b0a0aa',
                  fontFamily: "'Noto Serif SC','SimSun',serif",
                  fontSize: Math.round(lerp(18, 26, startWideProgress)),
                  fontWeight: 700,
                  letterSpacing: Math.round(lerp(1, 2, startWideProgress)),
                  cursor: multiLoading ? 'not-allowed' : 'pointer',
                  textShadow: '0 2px 6px rgba(0,0,0,0.45)',
                  opacity: multiLoading ? 0.82 : 1,
                }}
              >
                {multiLoading ? '联机中…' : '联机对战'}
              </button>
            </div>

            <div style={{ position: 'relative', width: '100%', margin: `${Math.round(lerp(-18, 0, startWideProgress))}px auto 0`, height: footerButtonsStageHeight }}>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '50%',
                  width: footerButtonsBaseWidth,
                  marginLeft: -(footerButtonsBaseWidth / 2),
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
                  gap: footerButtonsBaseGap,
                  transform: `scale(${footerButtonsScale})`,
                  transformOrigin: 'top center',
                }}
              >
                <button
                  onClick={onOpenAbout}
                  style={{
                    width: '100%',
                    aspectRatio: '426 / 94',
                    padding: `${Math.round(lerp(8, 10, startWideProgress))}px ${Math.round(lerp(8, 10, startWideProgress))}px ${Math.round(lerp(8, 10, startWideProgress))}px 25%`,
                    background: 'transparent',
                    backgroundImage: "url('/img/btn/btn_author.png')",
                    backgroundSize: '100% 100%',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    border: 'none',
                    color: '#a79171',
                    fontFamily: "'Noto Serif SC','SimSun',serif",
                    fontSize: Math.round(lerp(12, 15, startWideProgress)),
                    letterSpacing: Math.round(lerp(1, 2, startWideProgress)),
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                >
                  关于作者 & 意见与反馈
                </button>
                <button
                  onClick={onOpenRoadmap}
                  style={{
                    width: '100%',
                    aspectRatio: '426 / 94',
                    padding: `${Math.round(lerp(8, 10, startWideProgress))}px ${Math.round(lerp(8, 10, startWideProgress))}px ${Math.round(lerp(8, 10, startWideProgress))}px 25%`,
                    background: 'transparent',
                    backgroundImage: "url('/img/btn/btn_roadmap.png')",
                    backgroundSize: '100% 100%',
                    backgroundRepeat: 'no-repeat',
                    backgroundPosition: 'center',
                    border: 'none',
                    color: '#a79171',
                    fontFamily: "'Noto Serif SC','SimSun',serif",
                    fontSize: Math.round(lerp(12, 15, startWideProgress)),
                    letterSpacing: Math.round(lerp(1, 2, startWideProgress)),
                    cursor: 'pointer',
                    textAlign: 'left',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-start',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                >
                  版本更新计划
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isDisconnected && (
        <div
          onClick={onDisconnectedReset}
          style={{ position: 'fixed', inset: 0, background: '#000000dd', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <div
            style={{
              textAlign: 'center',
              color: '#c8a0e8',
              fontFamily: "'Cinzel Decorative','Cinzel',serif",
              padding: '36px 48px',
              background: '#0e0a14',
              border: '2px solid #7a50b0',
              borderRadius: 6,
              boxShadow: '0 0 60px #5a3a8066',
              animation: 'animPop 0.25s ease-out',
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontSize: 48, marginBottom: 16, filter: 'drop-shadow(0 0 20px #a080d0)' }}>📡</div>
            <div style={{ fontSize: 16, letterSpacing: 2, marginBottom: 8 }}>连接已断开</div>
            <div style={{ fontSize: 12, color: '#8060a0', letterSpacing: 1, fontFamily: "'Cinzel',serif", fontStyle: 'italic' }}>您已断线，点击任意位置返回主界面</div>
          </div>
        </div>
      )}

      <div style={{ position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center', pointerEvents: 'none' }}>
        {toasts.map((t) => (
          <div
            key={t.id}
            style={{
              background: '#1a1028',
              border: '1.5px solid #7a50b0',
              borderRadius: 4,
              color: '#c8a0e8',
              fontFamily: "'Cinzel',serif",
              fontSize: 11,
              letterSpacing: 0.5,
              padding: '10px 20px',
              boxShadow: '0 4px 24px #00000088',
              animation: 'toastIn 0.3s ease-out',
              maxWidth: 'calc(100vw - 32px)',
              textAlign: 'center',
            }}
          >
            {t.text}
          </div>
        ))}
      </div>

      {onlineOptionsModal && (
        <div style={{ position: 'fixed', inset: 0, background: '#000000cc', zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={closeOnlineOptions}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0e0a14',
              border: '2px solid #7a50b0',
              borderRadius: 6,
              padding: '28px 32px',
              maxWidth: 400,
              width: '90%',
              boxShadow: '0 0 60px #5a3a8066',
              animation: 'animPop 0.25s ease-out',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <button onClick={closeOnlineOptions} style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', color: '#5a4070', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: '2px 6px' }}>✕</button>

            <div style={{ textAlign: 'center', marginBottom: 4 }}>
              <div style={{ fontSize: 26, marginBottom: 8, filter: 'drop-shadow(0 0 12px #a080d088)' }}>🌐</div>
              <div style={{ fontFamily: "'Cinzel Decorative','Cinzel',serif", fontSize: 15, color: '#c8a0e8', letterSpacing: 2, marginBottom: 6 }}>联机对战</div>
              <div style={{ width: 100, height: 1, background: 'linear-gradient(90deg,transparent,#7a50b0,transparent)', margin: '0 auto' }} />
            </div>

            <div style={{ background: '#120920', border: '1px solid #4a3070', borderRadius: 4, padding: '16px 18px' }}>
              <button onClick={handleCreateRoom} disabled={multiLoading} style={{ width: '100%', padding: '12px', background: '#1e0d36', border: '1.5px solid #7a50b0', borderRadius: 4, color: '#c8a0e8', fontFamily: "'Cinzel Decorative','Cinzel',serif", fontSize: 13, letterSpacing: 2, cursor: multiLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .2s' }}>
                {multiLoading && <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #5a3a80', borderTopColor: '#a080d0', borderRadius: '50%', animation: 'spinLoader 0.7s linear infinite' }} />}
                创建房间
              </button>
            </div>

            <div style={{ background: '#120920', border: '1px solid #4a3070', borderRadius: 4, padding: '16px 18px' }}>
              <button onClick={handleOpenLobby} disabled={multiLoading} style={{ width: '100%', padding: '12px', background: '#1e0d36', border: '1.5px solid #7a50b0', borderRadius: 4, color: '#c8a0e8', fontFamily: "'Cinzel Decorative','Cinzel',serif", fontSize: 13, letterSpacing: 2, cursor: multiLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .2s' }}>
                {multiLoading && <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #5a3a80', borderTopColor: '#a080d0', borderRadius: '50%', animation: 'spinLoader 0.7s linear infinite' }} />}
                游戏大厅
              </button>
            </div>

            <div style={{ background: '#120920', border: '1px solid #4a3070', borderRadius: 4, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontFamily: "'Cinzel',serif", color: '#6a5080', fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' }}>— 或者输入房间号加入房间 —</div>
              <input
                value={joinRoomInput}
                onChange={(e) => setJoinRoomInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                placeholder="房间号"
                maxLength={6}
                style={{ background: '#160d22', border: '1px solid #5a3a80', borderRadius: 3, color: '#e0c0f8', fontFamily: "'Cinzel',serif", fontSize: 14, padding: '8px 12px', outline: 'none', letterSpacing: 3, textTransform: 'uppercase', width: '100%', boxSizing: 'border-box' }}
              />
              <button onClick={handleJoinRoom} disabled={multiLoading} style={{ width: '100%', padding: '12px', background: '#1a1030', border: '1.5px solid #5a3a80', borderRadius: 4, color: '#b090d8', fontFamily: "'Cinzel Decorative','Cinzel',serif", fontSize: 13, letterSpacing: 2, cursor: multiLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'all .2s' }}>
                {multiLoading && <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #5a3a80', borderTopColor: '#a080d0', borderRadius: '50%', animation: 'spinLoader 0.7s linear infinite' }} />}
                加入房间
              </button>
            </div>

            <div style={{ background: '#120920', border: '1px solid #4a3070', borderRadius: 4, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontFamily: "'Cinzel',serif", color: '#6a5080', fontSize: 9, letterSpacing: 2, textTransform: 'uppercase' }}>— 你的联机用户名 —</div>
              {renameInputVisible ? (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
                    <input
                      autoFocus
                      value={renameInput}
                      onChange={(e) => setRenameInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleRename();
                          setRenameInputVisible(false);
                        } else if (e.key === 'Escape') {
                          setRenameInputVisible(false);
                        }
                      }}
                      maxLength={10}
                      style={{ flex: 1, background: '#160d22', border: '1px solid #5a3a80', borderRadius: 3, color: '#e0c0f8', fontFamily: "'Cinzel',serif", fontSize: 13, padding: '6px 34px 6px 10px', outline: 'none', letterSpacing: 1 }}
                    />
                    <button onClick={handleRandomUsername} title="随机用户名" style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', padding: 0, color: '#cda85a', fontSize: 14, cursor: 'pointer', lineHeight: 1 }}>
                      🎲
                    </button>
                  </div>
                  <button onClick={() => { handleRename(); setRenameInputVisible(false); }} disabled={renameCdActive} style={{ padding: '6px 12px', background: renameCdActive ? '#1e1430' : '#2e1450', border: `1px solid ${renameCdActive ? '#3a2560' : '#7a50b0'}`, borderRadius: 3, color: renameCdActive ? '#5a4070' : '#c8a0e8', fontFamily: "'Cinzel',serif", fontSize: 11, cursor: renameCdActive ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                    {renameCdActive ? '冷却中…' : '确认'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontFamily: "'Cinzel',serif", fontSize: 14, color: playerUsernameSpecial ? '#d8b35c' : '#e0c0f8', letterSpacing: 1, flex: 1, textShadow: playerUsernameSpecial ? '0 0 10px rgba(216,179,92,.22)' : 'none' }}>{playerUsername || '—'}</span>
                  <button onClick={() => { setRenameInput(playerUsername); setRenameInputVisible(true); }} style={{ padding: '4px 10px', background: 'none', border: '1px solid #5a3a80', borderRadius: 3, color: '#a080c8', fontFamily: "'Cinzel',serif", fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    修改
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
