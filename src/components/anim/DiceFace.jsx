import { buildPublicUrl } from '../../utils/url';

const PIPS = {
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
  3: [[30, 30], [50, 50], [70, 70]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
  6: [[30, 27], [70, 27], [30, 50], [70, 50], [30, 73], [70, 73]],
};

// The physical die is shared art; exact pips remain deterministic for every roll.
export function DiceFace({ value, size = 88 }) {
  const pips = PIPS[value] || [];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`骰子 ${value} 点`} data-dice-value={value} style={{ display: 'block', overflow: 'visible' }}>
      <image href={buildPublicUrl('/img/ui/coastal/die-resin.webp')} width="100" height="100" preserveAspectRatio="xMidYMid meet" />
      <g transform="translate(-1 3)">
      {pips.map(([cx, cy], index) => (
        <g key={index} data-dice-pip>
          <circle cx={cx} cy={cy} r="6.1" fill="#070f0f" />
          <circle cx={cx} cy={cy + .65} r="5.1" fill="#c9bea0" />
          <circle cx={cx - .4} cy={cy + 1} r="4.1" fill="#ded3b6" />
        </g>
      ))}
      </g>
    </svg>
  );
}
