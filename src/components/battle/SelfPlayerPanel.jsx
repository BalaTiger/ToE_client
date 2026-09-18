import { GOD_DEFS } from '../../constants/card';
import { _getZoomCompensatedRect } from '../../utils/dom';
import { DDCard } from '../cards';
import { HealCrossEffect, StatBar, CoastalPortrait } from '../board';
import { GodHighlightBurst } from '../anim/GodHighlightBurst';
import { ThemeCornerOrnament } from '../theme/ThemeOrnaments';
import { LocalGodPowerTag } from './LocalGodPowerTag';
import { FaithScrollRegion } from './FaithScrollRegion';
import { SailingWetSurface } from '../effects/SailingWetSurface';
import { PlayerStatusTags } from '../playerStatus/PlayerStatusTags';
import { EncounterSkulls } from '../playerStatus/EncounterSkulls';
import { buildPublicUrl } from '../../utils/url';
import './coastal-panels.css';
import './coastal-self-sidebar.css';

export function SelfPlayerPanel({
  selfPanelRef,
  roleTextRef,
  emojiButtonRef,
  player,
  displayStats,
  ri,
  phase,
  isBlocked,
  canLocalTargetSelect,
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
  sailingEnabled = false,
  sailingActive = false,
  sailingPaused = false,
}) {
  const isShortDesktop = !isMobile && !isMobileLandscape && middleRowHeight < 150;
  const presentationStyle = {
    opacity: isSelfDeadPanelDimmed ? 0.32 : 1,
    filter: isSelfDeadPanelDimmed ? 'grayscale(0.85) brightness(0.6)' : 'none',
    transition: 'all .2s',
  };
  const borderColor = hitIndices.includes(0)
    ? '#cc2222'
    : sanHitIndices.includes(0)
    ? '#8840cc'
    : phase === 'SHU_SELECT_TARGET' && canLocalTargetSelect
    ? '#4ade80'
    : 'var(--toe-line,#3a2510)';

  const godPower = player.godName && (
    <LocalGodPowerTag def={GOD_DEFS[player.godName]} godLevel={player.godLevel}>
      <div
        className="toe-faith-god-name"
        style={{
          fontSize: fontSizes.small,
          color: GOD_DEFS[player.godName]?.col,
          fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",
          letterSpacing: 0.5,
          fontWeight: 700,
          textShadow: `0 0 6px ${GOD_DEFS[player.godName]?.col}66`,
        }}
      >
        {GOD_DEFS[player.godName]?.name}
      </div>
      <div className="toe-faith-power-name" style={{ fontSize: fontSizes.small, color: '#d4b0b0', fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontStyle: 'normal' }}>
        {GOD_DEFS[player.godName]?.power} Lv.{player.godLevel}
      </div>
      <div className="toe-faith-power-description" style={{ fontSize: fontSizes.tiny, color: '#a07878', fontStyle: 'normal', marginTop: 1, lineHeight: 1.4 }}>
        {GOD_DEFS[player.godName]?.levels[(player.godLevel || 1) - 1]?.desc}
      </div>
    </LocalGodPowerTag>
  );
  const statusTags = <>
    {player.isResting && (
      <div
        data-resting-marker="0"
        title="翻面中 — 下回合跳过"
        style={{
          marginTop: 4,
          fontSize: fontSizes.small,
          color: '#4ade80',
          fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",
          letterSpacing: 1,
          filter: 'drop-shadow(0 0 4px #4ade80)',
        }}
      >
        翻面中
      </div>
    )}
    <PlayerStatusTags
      player={player}
      playerIndex={0}
      variant="stack"
      fontSizes={fontSizes}
    />
    {!!player.zoneCards?.length && (
      <div className="toe-self-zone-tags" style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {player.zoneCards.map((c, ci) => (
          <DDCard key={c.id || `self-zone-${ci}`} card={c} small holderId={0} />
        ))}
      </div>
    )}
  </>;
  const hasSideTags = player.isResting || player.etherealizeStacks > 0 || player.poisonStacks > 0 || !!player.zoneCards?.length;
  return (
    <div
      ref={selfPanelRef}
      className="toe-battle-panel toe-player-panel toe-closed-panel toe-self-player-panel"
      data-pid={0}
      data-death-panel={0}
      onClick={phase === 'SHU_SELECT_TARGET' && !isBlocked && canLocalTargetSelect ? () => handleAIClick(0) : undefined}
      style={{
        backgroundColor: 'var(--toe-panel-active,#180f07)',
        border: `1.5px solid ${borderColor}`,
        '--toe-panel-frame-color': borderColor === 'var(--toe-line,#3a2510)' ? '#8e7446' : borderColor,
        '--toe-coastal-self-frame': `url('${buildPublicUrl('/img/ui/coastal/self-frame.webp')}')`,
        '--toe-coastal-faith-banner': `url('${buildPublicUrl('/img/ui/coastal/faith-banner.webp')}')`,
        '--toe-coastal-body-font': `${Math.max(12, fontSizes.body)}px`,
        '--toe-sidebar-divider': `url('${buildPublicUrl('/img/ui/coastal/self-sidebar-divider.webp')}')`,
        '--toe-encounter-skull-rows': Math.ceil((player.godEncounters || 0) / 8),
        borderRadius: 3,
        padding: isMobile
          ? `${boardCssPx(8)}px ${boardCssPx(9)}px`
          : isMobileLandscape
          ? `${boardCssPx(6)}px ${boardCssPx(7)}px`
          : isShortDesktop ? '7px 13px' : '12px 13px',
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
            : undefined,
        opacity: guillotinedPids.has(0) ? 0 : 1,
        cursor: phase === 'SHU_SELECT_TARGET' && !isBlocked && canLocalTargetSelect ? 'pointer' : 'default',
      }}
    >
      <div className="toe-self-sidebar-skin" aria-hidden="true" style={presentationStyle}>
        <img src={buildPublicUrl('/img/ui/coastal/self-sidebar-neutral-top.webp')} alt="" />
        <div style={{ backgroundImage: `url('${buildPublicUrl('/img/ui/coastal/self-sidebar-neutral-rail.webp')}')` }} />
        <img src={buildPublicUrl('/img/ui/coastal/self-sidebar-neutral-bottom.webp')} alt="" />
      </div>
      <div className="toe-self-sidebar-skin toe-self-sidebar-firelight" aria-hidden="true" style={{ ...presentationStyle, opacity: presentationStyle.opacity * .78 }}>
        <img src={buildPublicUrl('/img/ui/coastal/self-sidebar-warm-light.webp')} alt="" />
      </div>
      {sailingEnabled && <SailingWetSurface surface="panel" active={sailingActive} paused={sailingPaused}
        style={{ filter: presentationStyle.filter, '--toe-wet-intensity': presentationStyle.opacity }} />}
      <ThemeCornerOrnament
        expansionKey={expansionKey}
        corner="tr"
        size={206}
        opacity={0.14}
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
        className="toe-self-content"
        style={presentationStyle}
      >
        <CoastalPortrait framed />
        <div className="toe-self-skull-anchor">
          <EncounterSkulls count={player.godEncounters} playerIndex={0} />
        </div>
        <div className="toe-self-details">
          <div className="toe-self-title" title={ri.goal} style={isShortDesktop ? { display: 'flex', alignItems: 'center', gap: 8 } : undefined}>
            <div
              ref={roleTextRef}
              className="toe-self-name"
              style={{
                fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",
                color: 'var(--toe-muted,#7a5a2a)',
                fontSize: fontSizes.small,
                letterSpacing: 2,
                marginBottom: isShortDesktop ? 0 : 3,
                textTransform: 'uppercase',
              }}
            >
              {player.name || '你'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div
                className="toe-self-role"
                style={{
                  fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",
                  fontWeight: 700,
                  fontSize: fontSizes.body,
                  color: ri.col,
                  '--toe-role-color': player.role === '邪祀者' ? '#BA9BCB' : ri.col,
                  textShadow: '0 1px 3px #000',
                  letterSpacing: 1,
                }}
              >
                {ri.icon} {player.role}
              </div>
              {player.isDead && <span style={{ fontSize: fontSizes.body, color: '#882020', marginLeft: 'auto' }}>☠</span>}
            </div>
          </div>
          <div
            className="toe-self-goal"
            style={{
              fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",
              fontStyle: 'normal',
              color: 'var(--toe-muted,#a07838)',
              fontSize: fontSizes.small,
              marginTop: isShortDesktop ? 2 : 4,
              lineHeight: 1.6,
              whiteSpace: 'nowrap',
            }}
          >
            {ri.goal}
          </div>
          <div className="toe-self-faith">
            <FaithScrollRegion enabled resetKey={`${player.godName}:${player.godLevel}`}>
              {!player.godName && <div className="toe-faith-empty">尚未信仰邪神</div>}
              {godPower}
            </FaithScrollRegion>
          </div>
        </div>
        <div className="toe-self-stats" style={{ borderTop: '1px solid var(--toe-line-dim,#2a1a08)', paddingTop: isShortDesktop ? 4 : 8 }}>
          <StatBar
            label="HP"
            val={displayStats[0]?.hp ?? player.hp}
            color="#a54138"
            trackColor="#1a0808"
            scaleRatio={boardScaleRatio}
            viewportWidth={vw}
            labelColor="var(--toe-muted,#a07838)"
            valueColor="var(--toe-text,#c8a96e)"
            lineColor="var(--toe-line-dim,#2a1a08)"
          />
          <StatBar
            label="SAN"
            val={displayStats[0]?.san ?? player.san}
            color="#76609b"
            trackColor="#120820"
            scaleRatio={boardScaleRatio}
            viewportWidth={vw}
            labelColor="var(--toe-muted,#a07838)"
            valueColor="var(--toe-text,#c8a96e)"
            lineColor="var(--toe-line-dim,#2a1a08)"
          />
        </div>
        {hasSideTags && <div className="toe-self-side-tags" aria-label="角色状态">{statusTags}</div>}
      </div>

      {isMultiplayer && (
        <div style={{ position: 'absolute', top: 6, right: 6, zIndex: 50 }}>
          <button className="toe-button" aria-label="发送表情"
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
              fontSize: 14,
              cursor: 'pointer',
              padding: '2px 5px',
              lineHeight: 1.2,
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
