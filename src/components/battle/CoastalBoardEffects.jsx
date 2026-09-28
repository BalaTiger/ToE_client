import { HoundsTimerBadge, PetrifyingFormulaDie } from '../board';
import { ApophisNightBadge } from '../anim/ApophisOverlays';

const unscaled = value => value;

export function CoastalBoardEffects({ formula, night, houndsActive, secondsLeft }) {
  const formulaActive = formula?.active && Number.isFinite(formula.progress);
  const houndsVisible = houndsActive && secondsLeft != null;
  if (!formulaActive && !night?.active && !houndsVisible) return null;
  return <section className="toe-board-effects" aria-label="场上持续效果">
    {formulaActive && <PetrifyingFormulaDie state={formula} fontSize={unscaled} inline />}
    {night?.active && <div className="toe-board-effect" aria-label={`长夜进度 ${night.count || 0}/${night.limit || 12}`}>
      <div className="toe-board-effect-orb"><ApophisNightBadge night={night} /></div>
      <div className="toe-board-effect-copy"><span>长夜</span><strong>{night.count || 0} / {night.limit || 12}</strong></div>
    </div>}
    {houndsVisible && <div className="toe-board-effect" aria-label={`廷达罗斯猎犬，剩余 ${secondsLeft} 秒`}>
      <div className="toe-board-effect-orb"><HoundsTimerBadge active secondsLeft={secondsLeft} /></div>
      <div className="toe-board-effect-copy"><span>猎犬时限</span><strong>{secondsLeft} 秒</strong></div>
    </div>}
  </section>;
}
