import React from 'react';
import { createPortal } from 'react-dom';
import { _getZoomCompensatedRect } from '../../utils/dom';

function buildActiveDamageLinks(visualPlayers = []) {
  return visualPlayers.flatMap((player, playerIndex) => {
    if (!player.damageLink || !player.damageLink.active) return [];
    const partnerIndex = player.damageLink.partner;
    if (partnerIndex == null || partnerIndex <= playerIndex) return [];
    const partner = visualPlayers[partnerIndex];
    if (!partner?.damageLink?.active || partner.damageLink.partner !== playerIndex) return [];
    return [{ id: `active-${playerIndex}-${partnerIndex}`, a: playerIndex, b: partnerIndex, mode: 'active' }];
  });
}

function makeBindStrands(rect, anchorX, anchorY, keyPrefix, side) {
  const bindSpacing = 13;
  const ringRx = 6.2;
  const ringRy = 2.8;
  const strandGap = ringRy * 3.0;
  const strandOffsets = [-strandGap, 0, strandGap];
  const strandTilts = [8, 1, -7];
  const strandAnchorShifts = [-14, 3, 16];
  const strandHalf = Math.max(22, rect.width * 0.48);
  const minY = rect.top + rect.height * 0.56;
  const maxY = rect.bottom - ringRy - 8;
  return strandOffsets.flatMap((offset, rowIdx) => {
    const strandY = Math.max(minY, Math.min(maxY, anchorY + offset));
    const startX = anchorX - strandHalf;
    const endX = anchorX + strandHalf;
    const span = Math.max(1, endX - startX);
    const count = Math.max(2, Math.floor(span / bindSpacing) + 1);
    const tilt = strandTilts[rowIdx] ?? 0;
    const localAnchorX = anchorX + (strandAnchorShifts[rowIdx] ?? 0);
    const slope = Math.tan(tilt * Math.PI / 180);
    return [...Array(count)].map((_, i) => {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const cx = startX + span * t;
      const cy = Math.max(minY, Math.min(maxY, strandY + (cx - localAnchorX) * slope));
      return {
        cx,
        cy,
        rx: ringRx,
        ry: ringRy,
        rot: tilt,
        opacity: 0.9 - rowIdx * 0.12,
        side,
        order: i + rowIdx * count,
        key: `${keyPrefix}-${rowIdx}-${i}`,
      };
    });
  });
}

function DamageLinkSvg({ link }) {
  const playerIndex = link.a;
  const partnerIndex = link.b;
  const ghostMode = link.mode === 'active' ? null : link.mode;
  const sourceEl = document.querySelector(`[data-pid="${playerIndex}"]`);
  const partnerEl = document.querySelector(`[data-pid="${partnerIndex}"]`);
  const sourceRect = _getZoomCompensatedRect(sourceEl);
  const partnerRect = _getZoomCompensatedRect(partnerEl);
  if (!sourceRect || !partnerRect) return null;

  const x1 = sourceRect.left + sourceRect.width / 2;
  const y1 = sourceRect.top + sourceRect.height * 0.68;
  const x2 = partnerRect.left + partnerRect.width / 2;
  const y2 = partnerRect.top + partnerRect.height * 0.68;
  const bindRings = [
    ...makeBindStrands(sourceRect, x1, y1, `bind-${playerIndex}`, 'source'),
    ...makeBindStrands(partnerRect, x2, y2, `bind-${partnerIndex}`, 'target'),
  ];

  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 8) return null;

  const ux = dx / length;
  const uy = dy / length;
  const perpX = -uy;
  const perpY = ux;
  const curveBend = Math.max(-90, Math.min(90, (x1 < x2 ? 1 : -1) * Math.min(68, length * 0.16)));
  const sag = Math.max(-42, Math.min(58, Math.abs(dy) * 0.16 + 24));
  const cxMid = (x1 + x2) / 2 + perpX * curveBend;
  const cyMid = (y1 + y2) / 2 + perpY * curveBend + sag;
  const chainPath = `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cxMid.toFixed(1)} ${cyMid.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
  const curvePoint = (t) => {
    const mt = 1 - t;
    return {
      x: mt * mt * x1 + 2 * mt * t * cxMid + t * t * x2,
      y: mt * mt * y1 + 2 * mt * t * cyMid + t * t * y2,
    };
  };
  const curveTangent = (t) => ({
    x: 2 * (1 - t) * (cxMid - x1) + 2 * t * (x2 - cxMid),
    y: 2 * (1 - t) * (cyMid - y1) + 2 * t * (y2 - cyMid),
  });
  const ringCount = Math.max(5, Math.floor(length / 14));
  const wrapStyle = ghostMode === 'break'
    ? { animation: 'chainBreakFade 560ms ease-out forwards' }
    : ghostMode === 'fade'
      ? { animation: 'chainExpireFade 720ms ease-out forwards' }
      : null;
  const bindAnimStyle = ghostMode === 'break'
    ? { animation: 'chainBindSnap 560ms ease-out forwards' }
    : ghostMode === 'fade'
      ? { animation: 'chainExpireFade 720ms ease-out forwards' }
      : null;
  const isEstablishing = ghostMode === 'establish';

  return createPortal(
    <div
      key={`link-${link.id}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        pointerEvents: 'none',
        ...(wrapStyle || {}),
      }}
    >
      <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}>
        <defs>
          <linearGradient id={`chainGrad-${link.id}`} x1={x1} y1={y1} x2={x2} y2={y2} gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="rgba(130,96,54,0.25)" />
            <stop offset="45%" stopColor="rgba(237,210,150,0.55)" />
            <stop offset="100%" stopColor="rgba(130,96,54,0.25)" />
          </linearGradient>
          <filter id={`chainGlow-${link.id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="1.4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {bindRings.map(ring => (
          <g key={ring.key} transform={`translate(${ring.cx} ${ring.cy}) rotate(${ring.rot})`}>
            <g style={isEstablishing ? {
              opacity: 0,
              animation: `chainBindGrow 520ms cubic-bezier(0.22,1,0.36,1) ${ring.side === 'source' ? Math.min(0.32, ring.order * 0.018) : 1.16 + Math.min(0.32, ring.order * 0.018)}s forwards`,
              transformOrigin: '0px 0px',
            } : (bindAnimStyle || undefined)}>
              <ellipse cx="0" cy="0" rx={ring.rx} ry={ring.ry} fill="rgba(42,26,8,0.02)" stroke={`rgba(200,169,110,${0.18 * ring.opacity})`} strokeWidth="1" />
              <ellipse cx="0" cy="0" rx={Math.max(6, ring.rx - 2.4)} ry={Math.max(3, ring.ry - 1.5)} fill="none" stroke={`rgba(255,233,186,${0.10 * ring.opacity})`} strokeWidth="0.45" />
            </g>
          </g>
        ))}
        <path
          d={chainPath}
          fill="none"
          stroke="rgba(16,10,4,0.48)"
          strokeWidth="4.2"
          strokeLinecap="round"
          style={{
            filter: `url(#chainGlow-${link.id})`,
            opacity: isEstablishing ? 0 : 1,
            animation: isEstablishing ? 'chainPathShadowIn 1.1s ease-out 0.38s forwards' : undefined,
          }}
        />
        <path
          d={chainPath}
          fill="none"
          stroke={`url(#chainGrad-${link.id})`}
          strokeWidth="1.35"
          strokeLinecap="round"
          pathLength="100"
          strokeDasharray={isEstablishing ? '100 100' : '6 8'}
          strokeDashoffset={isEstablishing ? 100 : 0}
          style={{
            animation: isEstablishing
              ? 'chainPathEstablish 1.15s cubic-bezier(0.22,1,0.36,1) 0.38s forwards'
              : ghostMode === 'break'
                ? 'chainMainSnap 560ms ease-out forwards'
                : ghostMode === 'fade'
                  ? 'chainExpireFade 720ms ease-out forwards'
                  : 'chainMove 1.8s linear infinite',
          }}
        />
        {[...Array(ringCount)].map((_, ringIdx) => {
          const t = ringCount === 1 ? 0.5 : ringIdx / (ringCount - 1);
          const p = curvePoint(t);
          const tangent = curveTangent(t);
          const tangentLen = Math.max(1, Math.hypot(tangent.x, tangent.y));
          const localPerpX = -tangent.y / tangentLen;
          const localPerpY = tangent.x / tangentLen;
          const offset = ringIdx % 2 === 0 ? -0.55 : 0.55;
          const cx = p.x + localPerpX * offset;
          const cy = p.y + localPerpY * offset;
          const angle = Math.atan2(tangent.y, tangent.x) * 180 / Math.PI;
          const shouldDrift = ringIdx > 0 && ringIdx < ringCount - 1;
          return (
            <g key={`ring-${playerIndex}-${partnerIndex}-${ringIdx}`} transform={`translate(${cx} ${cy}) rotate(${angle})`}>
              <g
                style={{
                  opacity: isEstablishing ? 0 : 1,
                  animation: isEstablishing
                    ? `chainLinkArrive 560ms cubic-bezier(0.22,1,0.36,1) ${0.44 + t * 0.78}s forwards`
                    : ghostMode === 'break'
                      ? 'chainMainSnap 560ms ease-out forwards'
                      : ghostMode === 'fade'
                        ? 'chainExpireFade 720ms ease-out forwards'
                        : shouldDrift
                          ? `chainLinkDrift 1.6s ease-in-out ${ringIdx * 0.05}s infinite alternate`
                          : 'none',
                  transformOrigin: '0px 0px',
                  transformBox: 'fill-box',
                }}
              >
                <ellipse cx="0" cy="0" rx="6.4" ry="2.9" fill="rgba(42,26,8,0.02)" stroke="rgba(208,178,116,0.34)" strokeWidth="0.95" />
                <ellipse cx="0" cy="0" rx="4.5" ry="1.85" fill="none" stroke="rgba(255,233,186,0.16)" strokeWidth="0.38" />
              </g>
            </g>
          );
        })}
      </svg>
    </div>,
    document.body
  );
}

export function DamageLinkOverlay({ visualPlayers, damageLinkGhosts, damageLinkEstablishAnims }) {
  const links = [
    ...buildActiveDamageLinks(visualPlayers),
    ...(damageLinkEstablishAnims || []),
    ...(damageLinkGhosts || []),
  ];
  return links.map(link => <DamageLinkSvg key={`link-${link.id}`} link={link} />);
}
