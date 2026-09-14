import { Children, cloneElement, useLayoutEffect, useRef, useState } from 'react';
import { buildPublicUrl } from '../../utils/url';
import { getCoastalGeometry } from './coastalGeometry';
import './coastal-layout.css';

export function CoastalOpponents({ children, currentTurn, compact, ref }) {
  const panels = Children.toArray(children);
  return <div ref={ref} className="toe-coastal-opponents" data-compact={compact} data-crowded={panels.length > 5}
    role="region" aria-label="其他角色" tabIndex={compact ? 0 : undefined}
    style={{ '--coastal-opponent-count': panels.length }}>
    {panels.map((panel, index) => cloneElement(panel, {
      className: 'toe-coastal-opponent-seat',
      'data-current-turn': panel.props['data-pid'] === currentTurn,
      style: { ...panel.props.style, zIndex: panel.props['data-pid'] === currentTurn ? 200 : panel.props.style?.zIndex ?? index + 1 },
    }))}
  </div>;
}

// The existing regions keep their refs and game callbacks when their positions change.
export function CoastalBattleLayout({ opponents, middle, prompt, hand, turn, turnLabel, counts, compact, width = 1200, height = 620 }) {
  const [self, piles, log] = Children.toArray(middle.props.children);
  const boardRef = useRef(null);
  const rolesRef = useRef(null);
  const handRef = useRef(null);
  const [measured, setMeasured] = useState({ width, rolesBottom: 190, controlsHeight: 0, controlsBottom: 24 });
  useLayoutEffect(() => {
    if (compact || !boardRef.current || !rolesRef.current) return;
    const board = boardRef.current, roles = rolesRef.current;
    const controls = handRef.current?.querySelector('.toe-hand-heading');
    const measure = () => {
      const next = { width: board.clientWidth, rolesBottom: roles.offsetTop + roles.offsetHeight,
        controlsHeight: controls?.offsetHeight || 0,
        controlsBottom: controls ? parseFloat(getComputedStyle(controls).marginBottom) || 0 : 24 };
      setMeasured(previous => Object.keys(next).every(key => Math.abs(previous[key] - next[key]) < .5) ? previous : next);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    [board, roles, controls].filter(Boolean).forEach(element => observer?.observe(element));
    return () => observer?.disconnect();
  }, [compact, width, height]);
  const geometry = compact ? null : getCoastalGeometry({ ...measured, height, handCount: hand.props.visualMe?.hand.length ?? 5 });
  return <div ref={boardRef} className="toe-board-composition toe-board-composition-coastal" data-compact={compact}
    style={geometry ? {
      '--toe-coastal-height': `${geometry.height}px`,
      '--toe-coastal-hand-start': `${geometry.hand.left}px`,
      '--toe-coastal-hand-gap': `${geometry.actions.gap}px`,
      '--toe-coastal-actions-width': `${geometry.actions.width}px`,
      '--toe-coastal-inset-end': `${geometry.actions.rightInset}px`,
      '--toe-coastal-hand-top-inset': `${geometry.hand.paddingTop}px`,
      '--toe-coastal-hand-bottom-inset': `${geometry.hand.paddingBottom}px`,
      '--toe-coastal-count-left': `${geometry.hand.countLeft}px`,
      '--toe-coastal-hand-bottom': `${geometry.bottomInset}px`,
      '--toe-coastal-piles-left': `${geometry.piles.left}px`,
      '--toe-coastal-piles-top': `${geometry.piles.top}px`,
      '--toe-coastal-piles-width': `${geometry.piles.width}px`,
      '--toe-coastal-piles-height': `${geometry.piles.height}px`,
      '--toe-coastal-log-top': `${geometry.log.top}px`,
      '--toe-coastal-log-height': `${geometry.log.height}px`,
    } : undefined}>
    <div className="toe-coastal-drapery" aria-hidden="true">
      <img className="toe-coastal-faith-drape" src={buildPublicUrl('/img/ui/coastal/faith-banner.webp')} alt="" />
      <img className="toe-coastal-log-drape" src={buildPublicUrl('/img/ui/coastal/log-banner.webp')} alt="" />
    </div>
    <img className="toe-coastal-foreground" src={buildPublicUrl('/img/ui/coastal/foreground.webp')} alt="" aria-hidden="true" />
    <div className="toe-coastal-self">{self}</div>
    <div ref={rolesRef} className="toe-coastal-roles">{opponents}</div>
    <div className="toe-coastal-turn" style={{ backgroundImage: `url('${buildPublicUrl('/img/ui/coastal/turn-dial.webp')}')` }}>
      <div><strong>回合 {turn}</strong><span>{turnLabel}</span></div>
    </div>
    <div className="toe-coastal-log">{log}</div>
    <div className="toe-coastal-piles">{geometry ? cloneElement(piles, { baseHeight: geometry.piles.height }) : piles}</div>
    <div className="toe-coastal-counts" aria-label="牌堆计数" style={{ '--toe-coastal-counter-image': `url('${buildPublicUrl('/img/ui/coastal/counter.webp')}')` }}>
      <div><span aria-hidden="true">✧</span><span>检定</span><strong>{counts.inspection}</strong></div>
      <div><span aria-hidden="true">▱</span><span>牌堆</span><strong>{counts.deck}</strong></div>
      <div><span aria-hidden="true">♜</span><span>弃牌</span><strong>{counts.discard}</strong></div>
    </div>
    <div ref={handRef} className="toe-coastal-hand">{cloneElement(hand, { phasePrompt: prompt, coastalGeometry: geometry })}</div>
  </div>;
}
