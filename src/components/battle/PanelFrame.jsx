import './arc-panels.css';

// The same hardware is reused for every seat and for both closed side panels.
// The decorative layer alone is cut; content, effects and hover targets stay unclipped.
export function PanelFrame({ closed = false }) {
  const outline = closed
    ? 'M2 1 H98 L99 3 V88 L90 99 H10 L1 88 V3 Z'
    : 'M2 1 H98 L99 3 V97 L98 99 H2 L1 97 V3 Z';
  return (
    <div className="toe-panel-frame" data-closed={closed} aria-hidden="true">
      <svg className="toe-panel-frame-body" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d={outline} fill="#071313" stroke="var(--toe-panel-frame-color, #8e7446)" strokeWidth="1.15" vectorEffect="non-scaling-stroke" />
        <path d={outline} fill="none" stroke="#c1a774" strokeOpacity=".22" strokeWidth="4" vectorEffect="non-scaling-stroke" />
      </svg>
      {['tl', 'tr', 'bl', 'br'].map(corner => <i key={corner} className={`toe-panel-frame-corner toe-panel-frame-${corner}`} />)}
      {!closed && <svg className="toe-panel-frame-crown" viewBox="0 0 24 18"><path d="M12 1 19 9 12 17 5 9Z" fill="#31281c" stroke="#ae945e" /><path d="m12 4 4 5-4 5-4-5Z" fill="#b79b61" /><path d="m12 4 4 5-4-1Z" fill="#ecd2a0" /></svg>}
      {closed && <svg className="toe-panel-frame-base" viewBox="0 0 240 27" preserveAspectRatio="none">
        <path d="M2 1 18 23H222L238 1V9L222 26H18L2 9Z" fill="#181a14" stroke="#927749" />
        <path d="M15 8H225M20 19H220" stroke="#b0955d" strokeWidth="1" />
        <path d="m26 10 10 7m-3-7 10 7m-3-7 10 7m-3-7 10 7m-3-7 10 7m-3-7 10 7m-3-7 10 7m-3-7 10 7m-3-7 10 7m-3-7 10 7m24 0 10-7m-3 7 10-7m-3 7 10-7m-3 7 10-7m-3 7 10-7m-3 7 10-7m-3 7 10-7m-3 7 10-7m-3 7 10-7m-3 7 10-7" stroke="#8f794d" strokeOpacity=".6" />
        <path d="m120 2 11 11-11 11-11-11Z" fill="#18201b" stroke="#c1a66b" strokeWidth="1.6" />
        <path d="m120 6 6 7-6 7-6-7Z" fill="#8c7041" /><path d="m120 6 6 7-6-2Z" fill="#dec28a" />
      </svg>}
    </div>
  );
}
