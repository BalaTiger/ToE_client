import React from 'react';

const PLAYER_STATUS_TAG_ORDER = [
  'godPower',
  'godEncounters',
  'etherealize',
  'poison',
];

function hasPlayerStatusTags(player, visualPlayer = player) {
  return !!(
    player?.godName ||
    (player?.godEncounters || 0) > 0 ||
    (visualPlayer?.etherealizeStacks || 0) > 0 ||
    (visualPlayer?.poisonStacks || 0) > 0
  );
}

function GodEncountersTag({ count, variant, fontSize }) {
  if ((count || 0) <= 0) return null;
  const maxSkulls = variant === 'stack' ? 5 : 6;
  const label = variant === 'stack' ? ' 邪神遭遇' : '';
  const Tag = variant === 'stack' ? 'div' : 'span';
  return (
    <Tag style={{
      ...(variant === 'stack' ? { marginTop: 4 } : null),
      fontSize,
      color: '#8b6060',
      letterSpacing: 1,
      fontFamily: "'Cinzel',serif",
    }}>
      {'💀'.repeat(Math.min(count, maxSkulls))}{count > maxSkulls ? `×${count}` : ''}{label}
    </Tag>
  );
}

function EtherealizeTag({ playerIndex, count, variant, fontSize }) {
  if ((count || 0) <= 0) return null;
  const Tag = variant === 'stack' ? 'div' : 'span';
  return (
    <Tag
      data-etherealize-badge={playerIndex}
      title="虚化：回合外即将失去 HP/SAN 时，可消耗 1 层令相邻角色失去"
      style={{
        ...(variant === 'stack' ? { marginTop: 4, display: 'inline-flex', alignSelf: 'flex-start' } : null),
        position: 'relative',
        overflow: 'hidden',
        fontSize,
        color: '#b9d8f0',
        background: '#0c1118',
        border: '1px solid #87a9c866',
        borderRadius: 3,
        padding: '2px 6px',
        fontFamily: "'Cinzel',serif",
        letterSpacing: 0.5,
        lineHeight: variant === 'stack' ? undefined : 1.2,
        boxShadow: '0 0 8px #87a9c822',
        '--god-power-col': '#87a9c8',
        '--god-power-chevron-scale': variant === 'stack' ? 5.2 : 5.4,
      }}
    >
      虚化 {count}
      <span
        key={`etherealize-${playerIndex}-${count}`}
        className="god-power-chevron-layer etherealize-chevron-layer"
        aria-hidden
      >
        {[0, 1, 2, 3].map(r => (
          <span key={r} className="god-power-chevron-row">
            <span className="god-power-chevron-glyph" />
          </span>
        ))}
      </span>
    </Tag>
  );
}

function PoisonTag({ count, variant, fontSize }) {
  if ((count || 0) <= 0) return null;
  const Tag = variant === 'stack' ? 'div' : 'span';
  return (
    <Tag
      title="中毒：回合开始时失去等同层数的 HP，并消耗 1 层"
      style={{
        ...(variant === 'stack' ? { marginTop: 4, display: 'inline-flex', alignSelf: 'flex-start' } : null),
        fontSize,
        color: '#b7f5a8',
        background: '#0d160a',
        border: '1px solid #74c36566',
        borderRadius: 3,
        padding: '2px 6px',
        fontFamily: "'Cinzel',serif",
        letterSpacing: 0.5,
        lineHeight: variant === 'stack' ? undefined : 1.2,
        boxShadow: '0 0 8px #74c36522',
      }}
    >
      中毒 {count}
    </Tag>
  );
}

export function PlayerStatusTags({
  player,
  visualPlayer = player,
  playerIndex,
  variant = 'compact',
  fontSizes = {},
  renderGodPower,
}) {
  if (!hasPlayerStatusTags(player, visualPlayer)) return null;
  const isStack = variant === 'stack';
  const tagFontSize = isStack ? fontSizes.small : 10;
  const encounterFontSize = isStack ? fontSizes.small : 9;
  const tags = PLAYER_STATUS_TAG_ORDER.map(type => {
    if (type === 'godPower' && player?.godName && renderGodPower) {
      return <React.Fragment key={type}>{renderGodPower()}</React.Fragment>;
    }
    if (type === 'godEncounters') {
      return <GodEncountersTag key={type} count={player?.godEncounters || 0} variant={variant} fontSize={encounterFontSize} />;
    }
    if (type === 'etherealize') {
      return <EtherealizeTag key={type} playerIndex={playerIndex} count={visualPlayer?.etherealizeStacks || 0} variant={variant} fontSize={tagFontSize} />;
    }
    if (type === 'poison') {
      return <PoisonTag key={type} count={visualPlayer?.poisonStacks || 0} variant={variant} fontSize={tagFontSize} />;
    }
    return null;
  }).filter(Boolean);

  if (!tags.length) return null;
  if (isStack) return <>{tags}</>;
  return (
    <div data-player-god-status={playerIndex} style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
      {tags}
    </div>
  );
}
