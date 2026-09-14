import { useId } from 'react';
import { buildPublicUrl } from '../../utils/url';
import { useUiAppearance } from '../../ui/UiAppearance';

// Decoration lives outside the card scroller so its silhouette can cross the table edge.
export function HandTableSurface({ fan }) {
  const { appearance } = useUiAppearance();
  const weathered = appearance.battleLayout === 'arch';
  const id = useId();
  const width = fan ? fan.width : 1200;
  const height = fan ? fan.height : 320;
  const centerY = fan ? fan.top - fan.lift + 10 : 70;
  const rise = fan ? (width / 2) ** 2 / (2 * fan.radius) : 76;
  const edge = `M0 ${centerY + rise} Q${width / 2} ${centerY - rise} ${width} ${centerY + rise}`;
  const tableShape = `${edge} L${width} ${height} H0 Z`;
  return (
      <svg className="toe-hand-table" aria-hidden="true" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" focusable="false">
        <defs>
          <clipPath id={`${id}-shape`}><path d={tableShape} /></clipPath>
          <linearGradient id={`${id}-shade`} x2="0" y2="1">
            <stop stopColor="#142423" stopOpacity={weathered ? '.06' : '.18'} />
            <stop offset="1" stopColor="#020807" stopOpacity={weathered ? '.24' : '.85'} />
          </linearGradient>
        </defs>
        <g clipPath={`url(#${id}-shape)`}>
          <path d={tableShape} fill="#091716" />
          <image href={buildPublicUrl(appearance.assets.handTable)} width={width} height={height} preserveAspectRatio="xMidYMid slice" opacity={weathered ? '.94' : '.75'} />
          <path d={tableShape} fill={`url(#${id}-shade)`} />
        </g>
        <path d={edge} fill="none" stroke="#020504" strokeWidth="16" />
        <path d={edge} fill="none" stroke="#594d36" strokeWidth="9" />
        <path d={edge} fill="none" stroke="#192723" strokeWidth="5" />
        <path d={edge} fill="none" stroke="#b39b6a" strokeWidth="1.5" transform="translate(0 -4)" />
        <path d={edge} fill="none" stroke="#a78c58" strokeWidth="1" strokeDasharray="2 15" transform="translate(0 3)" opacity=".7" />
      </svg>
  );
}

export function HandTableDecor({ hideSurface, leftRef, rightRef }) {
  const { appearance } = useUiAppearance();
  return (
    <div className="toe-hand-scenery" aria-hidden="true">
      {!hideSurface && <HandTableSurface />}
      <img ref={leftRef} className="toe-hand-relief toe-hand-relief-left" src={buildPublicUrl(appearance.assets.reliefLeft)} alt="" draggable="false" />
      <img ref={rightRef} className="toe-hand-relief toe-hand-relief-right" src={buildPublicUrl(appearance.assets.reliefRight)} alt="" draggable="false" />
    </div>
  );
}
