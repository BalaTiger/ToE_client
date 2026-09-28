import React from "react";
import { OnlineOptionsDialog } from "./OnlineOptionsDialog";
import { buildPublicUrl } from "../../utils/url";
import { START_SCREEN_WIDTH, START_SCREEN_HEIGHT, getStartScreenScale, getStartScreenControlScale } from './startScreenGeometry';
import './start-screen.css';

export function StartScreen({
  vw,
  vh,
  handleUiSfxCapture,
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
  const scale = getStartScreenScale(vw, vh);
  const startRules = [
    '身份随机分配，HP / SAN 初始 10，上限 10',
    '每回合抽 1 张牌，区域牌可选择收入手牌或弃置',
    '技能与休息每回合限用其一',
    '手牌上限 4 张，超出须弃牌',
  ];
  const startRoles = [
    { key: '寻宝者', goal: '集齐宝藏', icon: 'tr', art: 'treasure', accent: '#a2d4cc' },
    { key: '追猎者', goal: '消灭所有非追猎者', icon: 'hu', art: 'hunter', accent: '#d6816a' },
    { key: '邪祀者', goal: '复活邪神', icon: 'cu', art: 'cultist', accent: '#baa0d2' },
  ];
  const sceneArt = name => ({ '--toe-start-scene': `image-set(url('${buildPublicUrl('/img/ui/start/' + name + '-v3-1x.webp')}') 1x, url('${buildPublicUrl('/img/ui/start/' + name + '-v3-2x.webp')}') 2x)` });

  return (
    <div className="toe-start-screen" style={{ '--toe-start-control-scale': getStartScreenControlScale(vw, vh) }} onClickCapture={handleUiSfxCapture}>
      <div className="toe-start-background" style={{ backgroundImage: "url('" + buildPublicUrl('/img/bg/bg_main.webp') + "')" }} />
      <div className="toe-start-shade" />
      <div className="toe-start-stage" data-start-scale={scale} style={{
        width: START_SCREEN_WIDTH, height: START_SCREEN_HEIGHT,
        transform: 'translate(-50%, -50%) scale(' + scale + ')',
        ...Object.fromEntries(['tl', 'tr', 'bl', 'br', 'top', 'bottom', 'left', 'right'].map(edge => [
          '--toe-start-frame-' + edge, "url('" + buildPublicUrl('/img/ui/start/frame-' + edge + '.webp') + "')",
        ])),
      }}>
        <header className="toe-start-hero">
          <img className="toe-start-title" src={buildPublicUrl('/img/title/texture_toehp.webp')} alt="邪神的宝藏" />
          <div className="toe-start-subtitle">
            <img src={buildPublicUrl('/img/line/line_titleguard-no-bg.webp')} alt="" />
            <span>克苏鲁卡牌对战</span>
            <img src={buildPublicUrl('/img/line/line_titleguard-no-bg.webp')} alt="" />
          </div>
          <div className="toe-start-english">Treasures Of Evils</div>
          <img className="toe-start-divider" src={buildPublicUrl('/img/line/line_split-no-bg.webp')} alt="" />
          <p className="toe-start-intro">
            <span>“古神沉眠之时，旅者聚于此地。寻宝者寻觅遗物，追猎者猎杀异类，</span>
            <span>邪祀者企图唤醒邪神。各怀秘密，命运共织。”</span>
          </p>
        </header>

        <div className="toe-start-overview">
          <div className="toe-start-roles">
            {startRoles.map(role => (
              <div key={role.key} className="toe-start-role toe-start-art-panel" style={{ ...sceneArt('role-' + role.art), '--toe-role-accent': role.accent }}>
                <img className="toe-start-role-icon" src={buildPublicUrl('/img/logo/logo_' + role.icon + '-no-bg.webp')} alt="" />
                <div className="toe-start-role-copy">
                  <div className="toe-start-role-name">{role.key}</div>
                  <div className="toe-start-role-goal">{role.goal}</div>
                </div>
              </div>
            ))}
          </div>
          <section className="toe-start-rules toe-start-art-panel" style={sceneArt('rules-table')} aria-labelledby="toe-start-rules-title">
            <div className="toe-start-rules-heading">
              <i aria-hidden="true" />
              <h2 id="toe-start-rules-title">规则要点</h2>
              <i aria-hidden="true" />
            </div>
            <ul>{startRules.map(rule => <li key={rule}><span aria-hidden="true">✦</span><span>{rule}</span></li>)}</ul>
          </section>
        </div>

        <div className="toe-start-actions">
          <button className="toe-start-primary toe-start-art-panel" style={sceneArt('action-solo')} onClick={startNewGame}>踏入黑暗</button>
          <img className="toe-start-action-seal" src={buildPublicUrl('/img/deco/deco_cth-no-bg.webp')} alt="" />
          <button className="toe-start-primary toe-start-art-panel toe-start-online" style={sceneArt('action-online')} onClick={handleMultiplayer} disabled={multiLoading}>{multiLoading ? '联机中…' : '联机对战'}</button>
        </div>

      </div>

      <footer className="toe-start-footer">
        <button className="toe-start-secondary" onClick={onOpenAbout} style={{ backgroundImage: "url('" + buildPublicUrl('/img/btn/btn_author.webp') + "')" }}>关于作者 &amp; 意见与反馈</button>
        <button className="toe-start-secondary" onClick={onOpenRoadmap} style={{ backgroundImage: "url('" + buildPublicUrl('/img/btn/btn_roadmap.webp') + "')" }}>版本更新计划</button>
      </footer>

      {isDisconnected && (
        <div
          onClick={onDisconnectedReset}
          style={{ position: 'fixed', inset: 0, background: '#000000dd', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
        >
          <div className="toe-dialog"
            style={{
              textAlign: 'center',
              color: '#c8a0e8',
              fontFamily: "'Cinzel Decorative','Cinzel',serif",
              padding: '36px 48px',


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
            className="toe-panel"
            style={{


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

      <OnlineOptionsDialog open={onlineOptionsModal} onClose={closeOnlineOptions}
        multiLoading={multiLoading} handleCreateRoom={handleCreateRoom} handleOpenLobby={handleOpenLobby} joinRoomInput={joinRoomInput} setJoinRoomInput={setJoinRoomInput} handleJoinRoom={handleJoinRoom} renameInputVisible={renameInputVisible} renameInput={renameInput} setRenameInput={setRenameInput} handleRename={handleRename} handleRandomUsername={handleRandomUsername} setRenameInputVisible={setRenameInputVisible} renameCdActive={renameCdActive} playerUsername={playerUsername} playerUsernameSpecial={playerUsernameSpecial} />
    </div>
  );
}
