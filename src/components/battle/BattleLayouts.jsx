import { cloneElement } from 'react';

// Layouts receive the same live regions and callbacks; appearance never owns game state.
export function ArchBattleLayout({ opponents, middle, prompt, hand }) {
  return <div className="toe-board-composition toe-board-composition-arch">
    {opponents}
    {middle}
    {cloneElement(hand, { phasePrompt: prompt })}
  </div>;
}

export function ClassicBattleLayout({ opponents, middle, prompt, hand }) {
  return <div className="toe-board-composition toe-board-composition-classic">
    {opponents}
    {middle}
    {prompt}
    {hand}
  </div>;
}
