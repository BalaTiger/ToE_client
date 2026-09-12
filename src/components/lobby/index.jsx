import React, { useEffect, useState } from 'react';
import {
  GOD_DEFS,
  LETTERS,
  NUMS,
} from '../../constants/card';
import { LoadingPentagramSpinner } from '../LoadingPentagramSpinner';
import { NARRATOR_AVATAR } from '../tutorial/InGameTutorialOverlay';
import {
  decodeDebugCardValue,
  DEBUG_ROLE_COMPOSITION_OPTIONS,
  encodeDebugGodCardValue,
  encodeDebugZoneCardValue,
  getDebugCardSelection,
  getDebugExpansionSelection,
  getExpansionDefaults,
  getFirstZoneCardForSlot,
} from './debugSettingsModel';

const smallBtnStyle = {
  padding: '4px 12px',
  fontSize: 10,
  cursor: 'pointer',
  letterSpacing: 1,
};

// ── Room Modal ────────────────────────────────────────────────
function RoomModal({ roomModal, playerUUID, cdType, cdSecondsLeft, onClose, onTogglePrivacy, onSetReady, onCopyRoomId }) {
  if (!roomModal) return null;
  const myPlayerRec = roomModal.players.find(p => p.uuid === playerUUID);
  const myReady = myPlayerRec?.ready || false;
  return (
    <div className="toe-dialog-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="toe-dialog" data-ui-dialog="room" role="dialog" aria-label="联机房间" onClick={e => e.stopPropagation()} style={{ padding: '32px clamp(20px, 4vw, 36px)', maxWidth: 560, width: '92%', maxHeight: '92dvh', overflowY: 'auto', position: 'relative' }}>
        <button className="toe-dialog-close" type="button" aria-label="关闭房间" onClick={onClose} style={{ position: 'absolute', top: 12, right: 14 }}>✕</button>
        <div className="toe-dialog-header" style={{ textAlign: 'center', marginBottom: 24 }}>
          <div className="toe-title" style={{ fontSize: 28, letterSpacing: 4, marginBottom: 10 }}>等待旅者</div>
          <div className="toe-subtitle" style={{ fontSize: 13 }}>分享房间号，等待其他旅者加入并准备。</div>
        </div>
        <div className="toe-panel" style={{ padding: '18px 16px', marginBottom: 18 }}>
          <div className="toe-subtitle" style={{ fontSize: 12, letterSpacing: 2, marginBottom: 10 }}>房间号</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <strong className="toe-title" style={{ fontSize: 'clamp(24px, 5vw, 36px)', letterSpacing: 5, overflowWrap: 'anywhere' }}>{roomModal.roomId}</strong>
            <button className="toe-button" type="button" onClick={onCopyRoomId} title="复制房间号" style={{ padding: '8px 18px', flexShrink: 0 }}>复制</button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
            <span className="toe-subtitle" style={{ fontSize: 12 }}>房间人数：{roomModal.count || roomModal.players.length}/{roomModal.max || 12}</span>
            {roomModal.owner === playerUUID ? (
              <button className="toe-button" type="button" aria-pressed={!roomModal.isPrivate} onClick={() => onTogglePrivacy(!roomModal.isPrivate)} title={roomModal.isPrivate ? '切换为公开' : '切换为私密'} style={{ padding: '5px 12px', fontSize: 12 }}>
                {roomModal.isPrivate ? '私密房间' : '公开房间'} · 切换
              </button>
            ) : <span className="toe-subtitle" style={{ fontSize: 12 }}>{roomModal.isPrivate ? '私密房间' : '公开房间'}</span>}
          </div>
        </div>
        <div style={{ marginBottom: 20 }}>
          <div className="toe-subtitle" style={{ fontSize: 12, letterSpacing: 2, marginBottom: 10 }}>当前旅者</div>
          {roomModal.players.map(p => (
            <div className="toe-panel" key={p.uuid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', marginBottom: 6 }}>
              <span aria-hidden="true" style={{ color: 'var(--toe-ui-accent)', fontSize: 17 }}>{p.uuid === roomModal.owner ? '♛' : '♟'}</span>
              <span style={{ color: p.isSpecialName ? '#d8b35c' : 'var(--toe-ui-text)', fontSize: 14, flex: 1, overflowWrap: 'anywhere' }}>
                {p.username}{p.uuid === playerUUID ? '（你）' : ''}{p.isAI ? ' [AI]' : ''}
              </span>
              <span style={{ fontSize: 12, whiteSpace: 'nowrap', color: p.ready ? '#92b579' : 'var(--toe-ui-muted)' }}><span aria-hidden="true">● </span>{p.ready ? '已准备' : '未准备'}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
          <button className="toe-button toe-button-danger" type="button" onClick={onClose} style={{ flex: 1, padding: '12px', fontSize: 16 }}>离开房间</button>
          <button className="toe-button toe-button-primary" type="button" aria-pressed={myReady} onClick={() => onSetReady(!myReady)} style={{ flex: 1, padding: '12px', fontSize: 16 }}>{myReady ? '取消准备' : '准备'}</button>
        </div>
        {cdType && cdSecondsLeft !== null && cdSecondsLeft > 0 && (
          <div role="status" style={{ textAlign: 'center', padding: '10px 12px', color: cdType === 'start' ? '#92b579' : '#d18d6e', fontSize: 13 }}>
            {cdType === 'start' ? '全员准备！' + cdSecondsLeft + 's 后开始游戏…' : cdSecondsLeft + 's 后将踢出未准备的玩家'}
          </div>
        )}
        {myReady && !roomModal.players.every(p => p.ready) && <div className="toe-subtitle" role="status" style={{ textAlign: 'center', fontSize: 13 }}>等待其他玩家就绪…</div>}
      </div>
    </div>
  );
}

// ── Game Lobby Modal ──────────────────────────────────────────
function LobbyModal({ lobbyModal, lobbyLoading, lobbyRooms, onClose, onRefresh, onJoinRoom }) {
  if (!lobbyModal) return null;
  return (
    <div className="toe-dialog-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 1500, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onClose}>
      <div className="toe-dialog" data-ui-dialog="lobby" role="dialog" aria-label="游戏大厅" onClick={e => e.stopPropagation()} style={{ padding: '32px clamp(20px, 4vw, 36px)', maxWidth: 640, width: '92%', maxHeight: '92dvh', overflowY: 'auto', position: 'relative' }}>
        <button className="toe-dialog-close" type="button" aria-label="关闭大厅" onClick={onClose} style={{ position: 'absolute', top: 12, right: 14 }}>✕</button>
        <div className="toe-dialog-header" style={{ textAlign: 'center', marginBottom: 24 }}>
          <div className="toe-title" style={{ fontSize: 28, letterSpacing: 4, marginBottom: 10 }}>游戏大厅</div>
          <div className="toe-subtitle" style={{ fontSize: 13 }}>选择一个房间，加入其他旅者的冒险。</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span className="toe-subtitle" style={{ fontSize: 12, letterSpacing: 2 }}>公开房间</span>
          <button className="toe-button" type="button" onClick={onRefresh} disabled={lobbyLoading} style={{ padding: '7px 16px', fontSize: 13 }}>↻ 刷新</button>
        </div>
        <div className="toe-panel" style={{ minHeight: 220, maxHeight: '48dvh', overflowY: 'auto', marginBottom: 22 }}>
          <div className="toe-subtitle" style={{ display: 'grid', gridTemplateColumns: '1fr 72px 72px', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--toe-ui-accent)', fontSize: 12 }}><span>房间号</span><span>人数</span><span>探索</span></div>
          {lobbyLoading ? <div className="toe-subtitle" role="status" style={{ textAlign: 'center', padding: '56px 16px' }}>正在寻找旅者…</div> : lobbyRooms.length === 0 ? (
            <div className="toe-subtitle" style={{ textAlign: 'center', padding: '56px 16px', fontSize: 14 }}>暂无公开房间<br /><span style={{ display: 'block', marginTop: 10, fontSize: 12 }}>返回创建房间，邀请朋友一起探索。</span></div>
          ) : lobbyRooms.map(room => (
            <div key={room.roomId} style={{ display: 'grid', gridTemplateColumns: '1fr 72px 72px', gap: 10, alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid rgba(159, 129, 80, .22)' }}>
              <span className="toe-title" style={{ fontSize: 20, letterSpacing: 2, overflowWrap: 'anywhere' }}>{room.roomId}</span>
              <span className="toe-subtitle" style={{ fontSize: 13 }}>{room.count}/{room.max}</span>
              <button className="toe-button toe-button-primary" type="button" onClick={() => onJoinRoom(room.roomId)} style={{ padding: '8px 12px', fontSize: 13 }}>加入</button>
            </div>
          ))}
        </div>
        <button className="toe-button" type="button" onClick={onClose} style={{ display: 'block', minWidth: 220, margin: '0 auto', padding: '12px 24px', fontSize: 16 }}>返回</button>
      </div>
    </div>
  );
}

// ── Privacy Toggle Confirm Modal ──────────────────────────────
function PrivacyToggleModal({ show, dontShowAgain, onChangeDontShow, onConfirm, onCancel }) {
  if (!show) return null;
  return (
    <div className="toe-dialog-backdrop" style={{ position: 'fixed', inset: 0,  zIndex: 1600, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={onCancel}>
      <div className="toe-dialog" data-ui-dialog="privacy" role="dialog" onClick={e => e.stopPropagation()} style={{
        padding: '28px 32px', maxWidth: 400, width: '90%',
         animation: 'animPop 0.25s ease-out',
        position: 'relative',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 24, marginBottom: 12, filter: 'drop-shadow(0 0 12px #a080d088)' }}>🔓</div>
          <div className="toe-title" style={{  fontSize: 20,  letterSpacing: 2, marginBottom: 10 }}>确认公开房间</div>
          <div style={{ width: 100, height: 1, background: 'linear-gradient(90deg,transparent,#7a50b0,transparent)', margin: '0 auto', marginBottom: 16 }} />
          <div className="toe-subtitle" style={{ fontSize: 14, lineHeight: 1.8, textAlign: 'center' }}>
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
                transform: 'scale(1.2)',
              }}
            />
            <label className="toe-subtitle" htmlFor="dontShowAgain" style={{
               fontSize: 12,  letterSpacing: 1,
              cursor: 'pointer',
            }}>
              下次不再提示
            </label>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button className="toe-button toe-button-primary" type="button" onClick={onConfirm} style={{
            flex: 1, padding: '10px',
            fontSize: 12, letterSpacing: 2, cursor: 'pointer',
            transition: 'all .2s',
          }}>
            公开
          </button>
          <button className="toe-button" type="button" onClick={onCancel} style={{
            flex: 1, padding: '10px',
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
    <div className="toe-dialog-backdrop" style={{ position: 'fixed', inset: 0,  zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* ── Step 1: Greeting ── */}
      {step === 1 && (
        <div className="toe-dialog" data-ui-dialog="tutorial-intro" role="dialog" style={{    padding: '36px 40px', maxWidth: 380, width: '90%', textAlign: 'center',  position: 'relative', animation: 'animPop 0.25s ease-out' }}>
          <img
            src={NARRATOR_AVATAR}
            alt="narrator"
            style={{
              width: 72,
              height: 72,
              borderRadius: 4,
              objectFit: 'cover',
              objectPosition: 'top',
              border: '2px solid #5a3a10',
              boxShadow: '0 0 16px #7a502066',
              margin: '0 auto 16px',
              display: 'block',
            }}
          />
          <p style={{ color: '#e8c87a', fontSize: 15, lineHeight: 2, fontStyle: 'italic', marginBottom: 10, }}>
            哈，又是一个不怕死的人！
          </p>
          <p style={{ color: '#c8a96e', fontSize: 14, lineHeight: 2, fontStyle: 'italic', marginBottom: 32, opacity: 0.75, }}>
            等等——我们是不是见过…
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="toe-button" type="button"
              onClick={onComplete}
              style={{ padding: '9px 24px',     fontWeight: 700, fontSize: 12,  cursor: 'pointer', letterSpacing: 1.5, textTransform: 'uppercase', transition: 'all .2s' }}
            >
              我是老手（跳过引导）
            </button>
            <button className="toe-button toe-button-primary" type="button"
              onClick={onStart}
              style={{ padding: '10px 24px',     fontWeight: 700, fontSize: 12,  cursor: 'pointer', letterSpacing: 1.5, textTransform: 'uppercase',  transition: 'all .2s' }}
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
    <div className="toe-dialog-backdrop" onClick={onClose} style={{ position: 'fixed', inset: 0,  zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
      <div className="toe-dialog" data-ui-dialog="connection-error" role="dialog" onClick={e => e.stopPropagation()} style={{    padding: '32px 36px', maxWidth: 360, width: '90%', textAlign: 'center',  animation: 'animPop 0.25s ease-out', cursor: 'default' }}>
        <div className="toe-title" style={{ fontSize: 24, marginBottom: 12 }}>连接暂时中断</div>
        <p style={{ color: "var(--toe-ui-text, #d7ccb2)",  fontStyle: 'italic', fontSize: 14, lineHeight: 1.9, marginBottom: 24 }}>
          无法连接服务器，<br />先试试单人玩法吧
        </p>
        <button className="toe-button toe-button-primary" type="button" onClick={onClose} style={{ padding: '10px 28px', fontSize: 14 }}>返回</button>
      </div>
    </div>
  );
}

// ── Debug Settings Panel ──────────────────────────────────────
function DebugSettingsPanel({
  show,
  onToggleShowSettings,
  debugForceCard, setDebugForceCard,
  debugForceCardTarget, setDebugForceCardTarget,
  debugForceCardKeep, setDebugForceCardKeep,
  debugForceCardType, setDebugForceCardType,
  debugForceZoneCardKey, setDebugForceZoneCardKey,
  debugForceZoneCardName, setDebugForceZoneCardName,
  debugForceGodCardKey, setDebugForceGodCardKey,
  debugTutorialPromptMode, setDebugTutorialPromptMode,
  debugExpansionKey, setDebugExpansionKey,
  debugRoleCompositionKey, setDebugRoleCompositionKey,
}) {
  const [zoneLetterTab, setZoneLetterTab] = useState('A');
  const [zoneNumTab, setZoneNumTab] = useState('1');
  const { expansionOptions, selectedExpansionKey, selectedDeckExpansionKey } = getDebugExpansionSelection(debugExpansionKey);
  const {
    zoneCards,
    selectedZoneKey,
    selectedZoneName,
    godKeys,
    selectedGodKey,
  } = getDebugCardSelection({
    selectedExpansionKey,
    selectedDeckExpansionKey,
    debugForceZoneCardKey,
    debugForceZoneCardName,
    debugForceGodCardKey,
  });
  const selectStyle = {
    width: '100%',
    padding: 6,
  };
  const sectionStyle = {
    padding: 10,
    marginBottom: 12,
  };
  const sectionTitleStyle = {
    margin: '0 0 10px',
    fontSize: 15,
    letterSpacing: 1,
  };
  const fieldStyle = { marginBottom: 10 };
  const labelStyle = { display: 'block', marginBottom: 4, fontSize: 12, color: '#a98a55' };
  const forceCardEnabled = !!debugForceCard;
  const handleExpansionChange = (nextKey) => {
    setDebugExpansionKey(nextKey);
    const defaults = getExpansionDefaults(nextKey);
    if (defaults.zoneCard) {
      setDebugForceZoneCardKey(defaults.zoneCard.key);
      setDebugForceZoneCardName(defaults.zoneCard.name);
    }
    if (defaults.godKey) setDebugForceGodCardKey(defaults.godKey);
  };
  const handlePickCard = (value) => {
    const { kind, key, name } = decodeDebugCardValue(value);
    if (kind === 'god') {
      setDebugForceCardType('god');
      setDebugForceGodCardKey(key);
      return;
    }
    setDebugForceCardType('zone');
    setDebugForceZoneCardKey(key);
    setDebugForceZoneCardName(name);
  };
  useEffect(() => {
    if (selectedExpansionKey !== debugExpansionKey) {
      setDebugExpansionKey(selectedExpansionKey);
      return;
    }
    if (selectedZoneKey && selectedZoneName && (selectedZoneKey !== debugForceZoneCardKey || selectedZoneName !== debugForceZoneCardName)) {
      setDebugForceZoneCardKey(selectedZoneKey);
      setDebugForceZoneCardName(selectedZoneName);
    }
    if (selectedGodKey && selectedGodKey !== debugForceGodCardKey) {
      setDebugForceGodCardKey(selectedGodKey);
    }
  }, [
    selectedExpansionKey,
    debugExpansionKey,
    selectedZoneKey,
    selectedZoneName,
    debugForceZoneCardKey,
    debugForceZoneCardName,
    selectedGodKey,
    debugForceGodCardKey,
    setDebugExpansionKey,
    setDebugForceZoneCardKey,
    setDebugForceZoneCardName,
    setDebugForceGodCardKey,
  ]);
  if (!show) return null;
  return (
    <div className="toe-dialog" data-ui-dialog="debug" role="dialog" style={{
      position: 'fixed',
      top: 50,
      left: 14,
      zIndex: 120,
      padding: 16,
      minWidth: 300,
      maxWidth: 360,
      maxHeight: 'calc(100dvh - 64px)',
      overflowY: 'auto',
    }}>
      <h3 className="toe-title" style={{ marginTop: 0, marginBottom: 16, }}>Debug设置</h3>
      <div className="toe-panel" style={sectionStyle}>
        <h4 className="toe-title" style={sectionTitleStyle}>下局拓展包</h4>
        <select className="toe-field"
          value={selectedExpansionKey}
          onChange={(e) => handleExpansionChange(e.target.value)}
          style={selectStyle}
        >
          {expansionOptions.map(option => (
            <option key={option.key} value={option.key}>{option.label}</option>
          ))}
        </select>
      </div>

      <div className="toe-panel" style={sectionStyle}>
        <h4 className="toe-title" style={sectionTitleStyle}>下局身份配比（5人单机）</h4>
        <select className="toe-field"
          value={debugRoleCompositionKey}
          onChange={(e) => setDebugRoleCompositionKey(e.target.value)}
          style={selectStyle}
        >
          {DEBUG_ROLE_COMPOSITION_OPTIONS.map(option => (
            <option key={option.key} value={option.key}>{option.label}</option>
          ))}
        </select>
        <div className="toe-subtitle" style={{ marginTop: 6,  fontSize: 12, lineHeight: 1.45 }}>
          固定配比会随机打乱座次；开局选择身份时与一名 AI 对调身份，配比保持不变。
        </div>
      </div>

      <div className="toe-panel" style={sectionStyle}>
        <h4 className="toe-title" style={sectionTitleStyle}>新手引导与软引导</h4>
        <select className="toe-field"
          value={debugTutorialPromptMode}
          onChange={(e) => setDebugTutorialPromptMode(e.target.value)}
          style={selectStyle}
        >
          <option value="default">下次单人对战：按设备首次逻辑</option>
          <option value="show">下次单人对战：全部重新显示</option>
          <option value="hide">下次单人对战：全部不显示</option>
        </select>
      </div>

      <div className="toe-panel" style={sectionStyle}>
        <h4 className="toe-title" style={sectionTitleStyle}>预加载旋转星</h4>
        <div className="toe-subtitle" style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          minHeight: 30,
          fontSize: 12,
          fontStyle: 'italic',
        }}>
          <LoadingPentagramSpinner />
          <span>与预加载界面同款渲染</span>
        </div>
      </div>

      <div className="toe-panel" style={sectionStyle}>
        <h4 className="toe-title" style={sectionTitleStyle}>强制摸牌设置</h4>
        <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={forceCardEnabled}
            onChange={(e) => setDebugForceCard(e.target.checked ? '1' : null)}
          />
          下局强制摸牌
        </label>
        <div style={fieldStyle}>
          <label style={labelStyle}>目标</label>
          <select className="toe-field"
            value={debugForceCardTarget}
            onChange={(e) => setDebugForceCardTarget(e.target.value)}
            disabled={!forceCardEnabled}
            style={{ ...selectStyle, opacity: forceCardEnabled ? 1 : 0.55 }}
          >
            <option value="player">玩家</option>
            <option value="ai1">1号位AI</option>
            <option value="ai2">2号位AI</option>
            <option value="ai3">3号位AI</option>
            <option value="ai4">4号位AI</option>
          </select>
        </div>
        <div style={fieldStyle}>
          <label style={labelStyle}>是否收入</label>
          <select className="toe-field"
            value={debugForceCardKeep}
            onChange={(e) => setDebugForceCardKeep(e.target.value)}
            disabled={!forceCardEnabled}
            style={{ ...selectStyle, opacity: forceCardEnabled ? 1 : 0.55 }}
          >
            <option value="auto">自动判断</option>
            <option value="keep">强制收入</option>
            <option value="discard">强制弃置</option>
          </select>
        </div>
        <label style={labelStyle}>选牌器</label>
        {/* ── 顶部页签：区域牌 / 神牌 ── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
          {['zone', 'god'].map((tab) => (
            <button className="toe-button toe-option" aria-pressed={debugForceCardType === tab}
              key={tab}
              type="button"
              onClick={() => {
                if (!forceCardEnabled) return;
                setDebugForceCardType(tab);
                if (tab === 'zone') {
                  const card = getFirstZoneCardForSlot(zoneCards, zoneLetterTab);
                  if (card) handlePickCard(encodeDebugZoneCardValue(card));
                } else {
                  if (godKeys.length) handlePickCard(encodeDebugGodCardValue(godKeys[0]));
                }
              }}
              style={{
                flex: 1,
                padding: '5px 0',
                fontSize: 12,
                cursor: forceCardEnabled ? 'pointer' : 'default',
                opacity: forceCardEnabled ? 1 : 0.55,
              }}
            >
              {tab === 'zone' ? '区域牌' : '神牌'}
            </button>
          ))}
        </div>

        {/* ── 区域牌：字母页签 + 数字页签 + 牌按钮 ── */}
        {debugForceCardType === 'zone' && (
          <div style={{ display: 'flex', gap: 6, minHeight: 160 }}>
            {/* 左侧字母页签 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 32 }}>
              {LETTERS.map(L => (
                <button className="toe-button toe-option" aria-pressed={zoneLetterTab === L}
                  key={L}
                  type="button"
                  onClick={() => {
                    if (!forceCardEnabled) return;
                    setZoneLetterTab(L);
                    const card = getFirstZoneCardForSlot(zoneCards, `${L}${zoneNumTab}`);
                    if (card) handlePickCard(encodeDebugZoneCardValue(card));
                  }}
                  style={{
                    padding: '5px 0',
                    fontSize: 12,
                    cursor: forceCardEnabled ? 'pointer' : 'default',
                    opacity: forceCardEnabled ? 1 : 0.55,
                    fontWeight: zoneLetterTab === L ? 'bold' : 'normal',
                  }}
                >
                  {L}
                </button>
              ))}
            </div>
            {/* 中间数字页签 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 32 }}>
              {NUMS.map(N => (
                <button className="toe-button toe-option" aria-pressed={zoneNumTab === N}
                  key={N}
                  type="button"
                  onClick={() => {
                    if (!forceCardEnabled) return;
                    setZoneNumTab(N);
                    const card = getFirstZoneCardForSlot(zoneCards, `${zoneLetterTab}${N}`);
                    if (card) handlePickCard(encodeDebugZoneCardValue(card));
                  }}
                  style={{
                    padding: '5px 0',
                    fontSize: 12,
                    cursor: forceCardEnabled ? 'pointer' : 'default',
                    opacity: forceCardEnabled ? 1 : 0.55,
                    fontWeight: zoneNumTab === N ? 'bold' : 'normal',
                  }}
                >
                  {N}
                </button>
              ))}
            </div>
            {/* 右侧牌按钮 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', maxHeight: 160 }}>
              {zoneCards
                .filter(card => card.key === `${zoneLetterTab}${zoneNumTab}`)
                .map(card => {
                  const isSelected = selectedZoneKey === card.key && selectedZoneName === card.name;
                  return (
                    <button className="toe-button toe-option" aria-pressed={isSelected}
                      key={`zone:${card.key}:${card.name}`}
                      type="button"
                      onClick={() => {
                        if (!forceCardEnabled) return;
                        handlePickCard(encodeDebugZoneCardValue(card));
                      }}
                      style={{
                        padding: '5px 8px',
                        textAlign: 'left',
                        fontSize: 12,
                        cursor: forceCardEnabled ? 'pointer' : 'default',
                        opacity: forceCardEnabled ? 1 : 0.55,
                      }}
                    >
                      {card.key} · {card.name}
                    </button>
                  );
                })}
            </div>
          </div>
        )}

        {/* ── 神牌：直接显示所有选项 ── */}
        {debugForceCardType === 'god' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto', maxHeight: 160 }}>
            {godKeys.map(godKey => {
              const isSelected = selectedGodKey === godKey;
              return (
                <button className="toe-button toe-option" aria-pressed={isSelected}
                  key={`god:${godKey}`}
                  type="button"
                  onClick={() => {
                    if (!forceCardEnabled) return;
                    handlePickCard(encodeDebugGodCardValue(godKey));
                  }}
                  style={{
                    padding: '5px 8px',
                    textAlign: 'left',
                    fontSize: 12,
                    cursor: forceCardEnabled ? 'pointer' : 'default',
                    opacity: forceCardEnabled ? 1 : 0.55,
                  }}
                >
                  {godKey} · {GOD_DEFS[godKey]?.name || godKey}
                </button>
              );
            })}
          </div>
        )}
      </div>
      <button className="toe-button toe-option"
        type="button"
        onClick={onToggleShowSettings}
        style={{
          ...smallBtnStyle,
          width: '100%',
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
  debugForceCard, setDebugForceCard,
  debugForceCardTarget, setDebugForceCardTarget,
  debugForceCardKeep, setDebugForceCardKeep,
  debugForceCardType, setDebugForceCardType,
  debugForceZoneCardKey, setDebugForceZoneCardKey,
  debugForceZoneCardName, setDebugForceZoneCardName,
  debugForceGodCardKey, setDebugForceGodCardKey,
  debugTutorialPromptMode, setDebugTutorialPromptMode,
  debugExpansionKey, setDebugExpansionKey,
  debugRoleCompositionKey, setDebugRoleCompositionKey,
}) {
  if (!isLocalTestMode) return null;
  return (
    <>
      <button className="toe-button" aria-pressed={localDebugMode}
        type="button"
        onClick={onToggleDebugMode}
        style={{
          ...smallBtnStyle,
          position: 'fixed',
          top: 14,
          left: 14,
          zIndex: 120,
          fontSize: 12,
          padding: '6px 10px',
        }}
      >
        {localDebugMode ? 'Debug: 开' : 'Debug: 关'}
      </button>
      <button className="toe-button" aria-pressed={showSettings}
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleShowSettings(); }}
        style={{
          ...smallBtnStyle,
          position: 'fixed',
          top: 14,
          left: 100,
          zIndex: 120,
          fontSize: 12,
          padding: '6px 10px',
        }}
      >
        Debug设置
      </button>
      <DebugSettingsPanel
        show={showSettings}
        localDebugMode={localDebugMode}
        onToggleDebugMode={onToggleDebugMode}
        onToggleShowSettings={onToggleShowSettings}
        debugForceCard={debugForceCard} setDebugForceCard={setDebugForceCard}
        debugForceCardTarget={debugForceCardTarget} setDebugForceCardTarget={setDebugForceCardTarget}
        debugForceCardKeep={debugForceCardKeep} setDebugForceCardKeep={setDebugForceCardKeep}
        debugForceCardType={debugForceCardType} setDebugForceCardType={setDebugForceCardType}
        debugForceZoneCardKey={debugForceZoneCardKey} setDebugForceZoneCardKey={setDebugForceZoneCardKey}
        debugForceZoneCardName={debugForceZoneCardName} setDebugForceZoneCardName={setDebugForceZoneCardName}
        debugForceGodCardKey={debugForceGodCardKey} setDebugForceGodCardKey={setDebugForceGodCardKey}
        debugTutorialPromptMode={debugTutorialPromptMode} setDebugTutorialPromptMode={setDebugTutorialPromptMode}
        debugExpansionKey={debugExpansionKey} setDebugExpansionKey={setDebugExpansionKey}
        debugRoleCompositionKey={debugRoleCompositionKey} setDebugRoleCompositionKey={setDebugRoleCompositionKey}
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
