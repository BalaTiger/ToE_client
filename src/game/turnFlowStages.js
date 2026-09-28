export const TURN_FLOW_STAGE = Object.freeze({
  // Non-interactive rule handoff between the outgoing turn and TURN_START.
  // The animation layer has a same-named presentation segment, but does not
  // own the cleanup or next-player selection performed in this stage.
  TURN_BOUNDARY: 'turnBoundary',
  TURN_START: 'turnStart',
  DRAW: 'draw',
  ACTION: 'action',
  DISCARD: 'discard',
  END_TURN: 'endTurn',
});

export const TURN_RULE_PHASES = Object.freeze([
  TURN_FLOW_STAGE.TURN_START,
  TURN_FLOW_STAGE.DRAW,
  TURN_FLOW_STAGE.ACTION,
  TURN_FLOW_STAGE.DISCARD,
  TURN_FLOW_STAGE.END_TURN,
]);
