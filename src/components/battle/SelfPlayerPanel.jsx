import { GOD_DEFS } from '../../constants/card';
import { _getZoomCompensatedRect } from '../../utils/dom';
import { DDCard } from '../cards';
import { HealCrossEffect, StatBar } from '../board';
import { GodHighlightBurst } from '../anim/GodHighlightBurst';
import { ThemeCornerOrnament } from '../theme/ThemeOrnaments';
import { LocalGodPowerTag } from './LocalGodPowerTag';
import { PlayerStatusTags } from '../playerStatus/PlayerStatusTags';

export function SelfPlayerPanel({
  selfPanelRef,
  roleTextRef,
  emojiButtonRef,
  me,
  visualMe,
  displayStats,
  ri,
  phase,
  isBlocked,
  canLocalTargetSelect,
  suppressAnim,
  tutorialStep,
  isMobile,
  isMobileLandscape,
  boardCssPx,
  middleRowHeight,
  fontSizes,
  boardScaleRatio,
  vw,
  expansionKey,
  hitIndices,
  sanHitIndices,
  hpHealIndices,
  sanHealIndices,
  guillotinedPids,
  godHighlightPanelBursts,
  isSelfDeadPanelDimmed,
  isMultiplayer,
  showEmojiPicker,
  setShowEmojiPicker,
  setEmojiButtonPos,
  handleAIClick,
}) {
  return (
    <div
      ref={selfPanelRef}
      data-pid={0}
      data-death-panel={0}
      onClick={phase === 'SHU_SELECT_TARGET' && !isBlocked && canLocalTargetSelect ? () => handleAIClick(0) : undefined}
      style={{
        background: 'var(--toe-panel-active,#180f07)',
        border: `1.5px solid ${
          hitIndices.includes(0)
            ? '#cc2222'
            : sanHitIndices.includes(0)
            ? '#8840cc'
            : phase === 'SHU_SELECT_TARGET' && canLocalTargetSelect
            ? '#4ade80'
            : suppressAnim && tutorialStep >= 2 && tutorialStep <= 4
            ? 'var(--toe-strong,#c8a96e)'
            : 'var(--toe-line,#3a2510)'
        }`,
        borderRadius: 3,
        padding: isMobile
          ? `${boardCssPx(8)}px ${boardCssPx(9)}px`
          : isMobileLandscape
          ? `${boardCssPx(6)}px ${boardCssPx(7)}px`
          : '12px 13px',
        width: isMobile ? boardCssPx(258) : isMobileLandscape ? boardCssPx(190) : 214,
        minWidth: isMobile ? boardCssPx(258) : isMobileLandscape ? boardCssPx(190) : 214,
        flexBasis: isMobile ? boardCssPx(258) : isMobileLandscape ? boardCssPx(190) : 214,
        flexGrow: 0,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: isMobile || isMobileLandscape ? boardCssPx(8) : 9,
        minHeight: middleRowHeight,
        position: 'relative',
        overflow: 'visible',
        boxShadow:
          phase === 'SHU_SELECT_TARGET' && canLocalTargetSelect
            ? '0 0 14px #4ade8088,inset 0 0 12px #4ade8022'
            : suppressAnim && tutorialStep >= 2 && tutorialStep <= 4
            ? '0 0 0 2px var(--toe-glow,#c8a96e),0 0 20px var(--toe-glow,#c8a96e)'
            : undefined,
        opacity: guillotinedPids.has(0) ? 0 : 1,
        cursor: phase === 'SHU_SELECT_TARGET' && !isBlocked && canLocalTargetSelect ? 'pointer' : 'default',
      }}
    >
      <ThemeCornerOrnament
        expansionKey={expansionKey}
        corner="tr"
        size={206}
        opacity={0.3}
        inset={-6}
        useCssVars
        layerOpacity={{
          // A screen-blended relief must not retain the dark offset layer.
          // Its shifted edge was also the pale arc visible at the lower left.
          shadow: 0,
          glow: 0.16,
          line: 0.72,
        }}
        style={{ top: -6, right: -6, mixBlendMode: 'screen' }}
      />

      {(hpHealIndices.includes(0) || sanHealIndices.includes(0)) && (
        <HealCrossEffect color={sanHealIndices.includes(0) ? '#a78bfa' : '#4ade80'} />
      )}
      {godHighlightPanelBursts[0]?.godKey && (
        <GodHighlightBurst
          key={godHighlightPanelBursts[0].key}
          godKey={godHighlightPanelBursts[0].godKey}
          fit="contain"
          panel
          delayMs={0}
          durationMs={920}
          intensity={1.08}
          style={{ inset: -3 }}
        />
      )}
      <div
        style={{
          opacity: isSelfDeadPanelDimmed ? 0.32 : 1,
          filter: isSelfDeadPanelDimmed ? 'grayscale(0.85) brightness(0.6)' : 'none',
          transition: 'all .2s',
        }}
      >
        <div>
          <div
            ref={roleTextRef}
            style={{
              fontFamily: "'Cinzel',serif",
              color: 'var(--toe-muted,#7a5a2a)',
              fontSize: fontSizes.small,
              letterSpacing: 2,
              marginBottom: 3,
              textTransform: 'uppercase',
            }}
          >
            你的身份
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                fontFamily: "'Cinzel',serif",
                fontWeight: 700,
                fontSize: fontSizes.body,
                color: ri.col,
                textShadow: `0 0 12px ${ri.col}66`,
                letterSpacing: 1,
              }}
            >
              {ri.icon} {me.role}
            </div>
            {me.isDead && <span style={{ fontSize: fontSizes.body, color: '#882020', marginLeft: 'auto' }}>☠</span>}
          </div>
          <div
            style={{
              fontFamily: "'Microsoft YaHei','SimHei',sans-serif",
              fontStyle: 'italic',
              color: 'var(--toe-muted,#a07838)',
              fontSize: fontSizes.small,
              marginTop: 4,
              lineHeight: 1.6,
              whiteSpace: 'nowrap',
            }}
          >
            {ri.goal}
          </div>
          {me.isResting && (
            <div
              data-resting-marker="0"
              style={{
                marginTop: 4,
                fontSize: fontSizes.small,
                color: '#4ade80',
                fontFamily: "'Cinzel',serif",
                letterSpacing: 1,
                filter: 'drop-shadow(0 0 4px #4ade80)',
              }}
            >
              ♥ 翻面中 — 下回合跳过
            </div>
          )}
          <PlayerStatusTags
            player={me}
            visualPlayer={visualMe}
            playerIndex={0}
            variant="stack"
            fontSizes={fontSizes}
            renderGodPower={() => (
              <LocalGodPowerTag def={GOD_DEFS[me.godName]} godLevel={me.godLevel}>
                <div
                  style={{
                    fontSize: fontSizes.small,
                    color: GOD_DEFS[me.godName]?.col,
                    fontFamily: "'Cinzel',serif",
                    letterSpacing: 0.5,
                    fontWeight: 700,
                    textShadow: `0 0 6px ${GOD_DEFS[me.godName]?.col}66`,
                  }}
                >
                  {GOD_DEFS[me.godName]?.name}
                </div>
                <div style={{ fontSize: fontSizes.small, color: '#d4b0b0', fontFamily: "'IM Fell English',serif", fontStyle: 'italic' }}>
                  {GOD_DEFS[me.godName]?.power} Lv.{me.godLevel}
                </div>
                <div style={{ fontSize: fontSizes.tiny, color: '#a07878', fontStyle: 'italic', marginTop: 1, lineHeight: 1.4 }}>
                  {GOD_DEFS[me.godName]?.levels[(me.godLevel || 1) - 1]?.desc}
                </div>
              </LocalGodPowerTag>
            )}
          />
          {!!me.zoneCards?.length && (
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {me.zoneCards.map((c, ci) => (
                <DDCard key={c.id || `self-zone-${ci}`} card={c} small holderId={0} />
              ))}
            </div>
          )}
        </div>
        <div style={{ borderTop: '1px solid var(--toe-line-dim,#2a1a08)', paddingTop: 8 }}>
          <StatBar
            label="HP"
            val={displayStats[0]?.hp ?? me.hp}
            color="#7a1515"
            trackColor="#1a0808"
            scaleRatio={boardScaleRatio}
            viewportWidth={vw}
            labelColor="var(--toe-muted,#a07838)"
            valueColor="var(--toe-text,#c8a96e)"
            lineColor="var(--toe-line-dim,#2a1a08)"
          />
          <StatBar
            label="SAN"
            val={displayStats[0]?.san ?? me.san}
            color="#3a1078"
            trackColor="#120820"
            scaleRatio={boardScaleRatio}
            viewportWidth={vw}
            labelColor="var(--toe-muted,#a07838)"
            valueColor="var(--toe-text,#c8a96e)"
            lineColor="var(--toe-line-dim,#2a1a08)"
          />
        </div>
      </div>

      {isMultiplayer && (
        <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 50 }}>
          <button
            ref={emojiButtonRef}
            onClick={() => {
              const rect = _getZoomCompensatedRect(emojiButtonRef.current);
              if (rect) {
                setEmojiButtonPos({
                  top: rect.bottom + 8,
                  right: window.innerWidth - rect.right,
                });
              }
              setShowEmojiPicker(v => !v);
            }}
            style={{
              background: 'var(--toe-panel,#1a1008)',
              border: '1px solid var(--toe-line,#4a3010)',
              borderRadius: 3,
              fontSize: 14,
              cursor: 'pointer',
              padding: '2px 5px',
              lineHeight: 1.2,
              color: 'var(--toe-strong,#c8a96e)',
              opacity: showEmojiPicker ? 1 : 0.7,
            }}
          >
            😊
          </button>
        </div>
      )}
    </div>
  );
}
