import { useId } from 'react';

const PIPS = {
  1: [[50, 50]],
  2: [[30, 30], [70, 70]],
  3: [[30, 30], [50, 50], [70, 70]],
  4: [[30, 30], [70, 30], [30, 70], [70, 70]],
  5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
  6: [[30, 27], [70, 27], [30, 50], [70, 50], [30, 73], [70, 73]],
};

// Numeric faces keep roll results independent of platform emoji fonts.
export function DiceFace({ value, size = 88 }) {
  const gradientId = useId();
  const pips = PIPS[value] || [];
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`骰子 ${value} 点`} data-dice-value={value} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d1c2a0" />
          <stop offset="0.42" stopColor="#a89774" />
          <stop offset="1" stopColor="#665b46" />
        </linearGradient>
      </defs>
      <path d="M12 4H86L96 14V88L88 97H14L4 87V13Z" fill="#161613" stroke="#796b4e" strokeWidth="1.5" />
      <path d="M12 5H85L92 12V83L84 91H12L5 84V13Z" fill={`url(#${gradientId})`} stroke="#d9caa7" strokeWidth="1" />
      <path d="M15 10H81L87 16V79L80 86H16L10 79V17Z" fill="none" stroke="#4d4735" strokeWidth="0.8" opacity="0.65" />
      <path d="M92 12L96 15V88L88 96L84 91L92 83Z" fill="#3d3a2d" opacity="0.7" />
      {pips.map(([cx, cy], index) => (
        <g key={index} data-dice-pip>
          <circle cx={cx} cy={cy + 0.9} r="6.4" fill="#e2d3b1" opacity="0.65" />
          <circle cx={cx} cy={cy} r="6" fill="#191d1a" />
          <circle cx={cx - 1} cy={cy - 1} r="3.5" fill="#090e0c" opacity="0.65" />
        </g>
      ))}
    </svg>
  );
}
