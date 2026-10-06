import { Children } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HandArea } from './HandArea';

vi.mock('react', async importOriginal => ({
  ...await importOriginal(),
  useRef: initial => ({ current: initial }),
  useState: initial => [initial, vi.fn()],
  useLayoutEffect: vi.fn(),
}));

const mutualReason = '掉包与休息每回合只能选择一项';

beforeEach(() => vi.stubGlobal('window', {}));
afterEach(() => vi.unstubAllGlobals());

function descendants(node) {
  return [node, ...Children.toArray(node?.props?.children).flatMap(descendants)];
}

function textOf(node) {
  return descendants(node).filter(item => typeof item === 'string' || typeof item === 'number').join('');
}

function makeProps({ state = {}, player = {}, ...overrides } = {}) {
  const me = { hand: [], role: '寻宝者', disableSkill: false, disableRest: false, ...player };
  return {
    gs: { players: [me], abilityData: {}, skillUsed: false, restUsed: false, multiplyUsed: false, ...state },
    me,
    visualMe: me,
    ri: { icon: '✦' },
    skillRi: { icon: '✦' },
    effectiveSkillName: '掉包',
    phase: 'ACTION',
    myTurn: true,
    isVisualPlayerTurn: true,
    isActionControlsHidden: false,
    isBlocked: false,
    isSpectating: false,
    isScriptedTutorial: false,
    isTutorialActionAllowed: () => true,
    skillLimited: false,
    canShowEndTurnButton: true,
    isLocalCurrentTurn: () => true,
    effectiveHandLimit: 4,
    mobileCssPx: value => value,
    selfHandCardScale: 1,
    scaleRatio: 1,
    isMyCardClickable: () => false,
    canPlayerRespondWithAnyHandCard: () => false,
    canPlayerRespondWithFireHandCard: () => false,
    mobileGodCardRefs: { current: new Map() },
    skillButtonRef: { current: null },
    restButtonRef: { current: null },
    useAbility: vi.fn(),
    doRest: vi.fn(),
    endTurn: vi.fn(),
    setGs: vi.fn(),
    ...overrides,
  };
}

function render(props) {
  const nodes = descendants(HandArea(props));
  const action = className => nodes.find(node => node?.type === 'button' && node.props.className?.split(' ').includes(className));
  return {
    nodes,
    skill: action('toe-turn-skill'),
    rest: action('toe-turn-rest'),
    hints: nodes.filter(node => node?.props?.className === 'toe-action-reason'),
  };
}

function expectNativeButton(button, handler, ref) {
  expect(button.type).toBe('button');
  expect(button.props.disabled).toBe(true);
  expect(button.props.onClick).toBe(handler);
  expect(button.props.ref).toBe(ref);
}

function expectAccessibleMutualHint(view, button, label) {
  expect(view.hints).toHaveLength(1);
  const hint = view.hints[0];
  expect(hint.type).toBe('span');
  expect(hint.props.role).toBe('group');
  expect(hint.props.tabIndex).toBe(0);
  expect(hint.props['aria-label']).toBe(`${label}：本回合不可用。${mutualReason}`);
  expect(hint.props.title).toBeUndefined();
  expect(hint.props.onClick).toBeUndefined();
  expect(hint.props.onKeyDown).toBeUndefined();
  // Children.toArray clones element keys on each traversal; compare the native
  // button contract instead of React element object identity.
  const wrappedButtons = descendants(hint).filter(node => node?.type === 'button');
  expect(wrappedButtons).toHaveLength(1);
  expect(wrappedButtons[0].props.className).toBe(button.props.className);
  expect(wrappedButtons[0].props.disabled).toBe(true);
  expect(wrappedButtons[0].props.onClick).toBe(button.props.onClick);
  expect(wrappedButtons[0].props.ref).toBe(button.props.ref);
  const tooltip = descendants(hint).find(node => node?.props?.role === 'tooltip');
  expect(tooltip).toBeDefined();
  expect(tooltip.props.className).toBe('toe-action-reason-tooltip');
  expect(textOf(tooltip)).toBe(mutualReason);
}

describe('TOE001 swap/rest action status copy', () => {
  it('marks the consumed swap as used and rest as unavailable through mutual exclusion', () => {
    const props = makeProps({ state: { skillUsed: true } });
    const view = render(props);
    expect(textOf(view.skill)).toBe('掉包已用');
    expect(textOf(view.rest)).toBe('休息本回合不可用');
    expectNativeButton(view.skill, props.useAbility, props.skillButtonRef);
    expectNativeButton(view.rest, props.doRest, props.restButtonRef);
    expectAccessibleMutualHint(view, view.rest, '休息');
  });

  it('marks real rest as used even though resting also consumes the skill flag', () => {
    const props = makeProps({ state: { restUsed: true, skillUsed: true } });
    const view = render(props);
    expect(textOf(view.skill)).toBe('掉包本回合不可用');
    expect(textOf(view.rest)).toBe('休息已用');
    expectNativeButton(view.skill, props.useAbility, props.skillButtonRef);
    expectNativeButton(view.rest, props.doRest, props.restButtonRef);
    expectAccessibleMutualHint(view, view.skill, '掉包');
  });

  it('recognizes real rest when skillUsed remains false in a restored snapshot', () => {
    const props = makeProps({ state: { restUsed: true, skillUsed: false } });
    const view = render(props);
    expect(textOf(view.skill)).toBe('掉包本回合不可用');
    expect(textOf(view.rest)).toBe('休息已用');
    expectAccessibleMutualHint(view, view.skill, '掉包');
  });

  it('keeps initial actions available with no used label or residual hint', () => {
    const props = makeProps();
    const view = render(props);
    expect(textOf(view.skill)).toBe('掉包');
    expect(textOf(view.rest)).toBe('休息');
    expect(view.skill.props.disabled).toBe(false);
    expect(view.rest.props.disabled).toBe(false);
    expect(view.hints).toHaveLength(0);
    expect(view.skill.props.ref).toBe(props.skillButtonRef);
    expect(view.rest.props.ref).toBe(props.restButtonRef);
    view.skill.props.onClick();
    view.rest.props.onClick();
    expect(props.useAbility).toHaveBeenCalledOnce();
    expect(props.doRest).toHaveBeenCalledOnce();
  });

  it.each([false, true])('does not describe multiplication as swap/rest mutual exclusion (skillUsed=%s)', skillUsed => {
    const view = render(makeProps({ state: { multiplyUsed: true, skillUsed } }));
    expect(view.skill.props.disabled).toBe(true);
    expect(view.rest.props.disabled).toBe(true);
    expect(textOf(view.skill)).toBe('掉包已用');
    expect(textOf(view.rest)).toBe('休息已用');
    expect(view.hints).toHaveLength(0);
  });

  it('retains the skill restriction instead of replacing it with a rest mutual-exclusion hint', () => {
    const view = render(makeProps({ player: { disableSkill: true }, state: { restUsed: true, skillUsed: true } }));
    expect(view.skill.props.disabled).toBe(true);
    expect(textOf(view.skill)).toBe('掉包技能受限');
    expect(textOf(view.rest)).toBe('休息已用');
    expect(view.hints).toHaveLength(0);
  });

  it('retains insomnia when neither action has been consumed', () => {
    const view = render(makeProps({ player: { disableRest: true } }));
    expect(view.skill.props.disabled).toBe(false);
    expect(view.rest.props.disabled).toBe(true);
    expect(textOf(view.rest)).toBe('休息失眠');
    expect(view.hints).toHaveLength(0);
  });

  it('does not claim mutual exclusion when insomnia is also present after a swap', () => {
    const view = render(makeProps({ player: { disableRest: true }, state: { skillUsed: true } }));
    expect(view.rest.props.disabled).toBe(true);
    expect(view.hints).toHaveLength(0);
  });

  it.each([
    { skillUsed: true, restUsed: false },
    { skillUsed: true, restUsed: true },
  ])('keeps a pending blocked interaction separate from mutual-exclusion hints (%j)', state => {
    const view = render(makeProps({ state, isBlocked: true }));
    expect(view.rest.props.disabled).toBe(true);
    expect(view.hints).toHaveLength(0);
    expect(textOf(view.rest)).not.toContain('本回合不可用');
  });

  it.each(['DRAW_REVEAL', 'GOD_CHOICE', 'SWAP_GIVE_CARD'])('keeps main action buttons hidden during %s decisions', phase => {
    const view = render(makeProps({ phase, state: { skillUsed: true } }));
    expect(view.skill).toBeUndefined();
    expect(view.rest).toBeUndefined();
    expect(view.hints).toHaveLength(0);
  });

  it('keeps main actions hidden outside the local visual turn', () => {
    const view = render(makeProps({ myTurn: false, isVisualPlayerTurn: false, state: { skillUsed: true, restUsed: true } }));
    expect(view.skill).toBeUndefined();
    expect(view.rest).toBeUndefined();
    expect(view.hints).toHaveLength(0);
  });

  it('does not label mutual exclusion from another turn during a presentation mismatch', () => {
    const view = render(makeProps({ myTurn: false, isVisualPlayerTurn: true, state: { skillUsed: true, restUsed: true } }));
    expect(view.hints).toHaveLength(0);
    expect(textOf(view.skill)).not.toContain('本回合不可用');
    expect(textOf(view.rest)).not.toContain('本回合不可用');
  });

  it.each([
    ['追猎者', '追捕', '☩'],
    ['邪祀者', '蛊惑', '☽'],
  ])('preserves %s rest copy and original skill availability after a skill', (role, name, icon) => {
    const view = render(makeProps({ player: { role }, effectiveSkillName: name, skillRi: { icon }, state: { skillUsed: true } }));
    expect(view.skill.props.disabled).toBe(role !== '追猎者');
    expect(view.rest.props.disabled).toBe(true);
    expect(textOf(view.rest)).toBe('休息已用');
    expect(view.hints).toHaveLength(0);
  });

  it.each([
    ['追猎者', '追捕', '☩'],
    ['邪祀者', '蛊惑', '☽'],
  ])('preserves %s skill/rest labels after real rest', (role, name, icon) => {
    const view = render(makeProps({ player: { role }, effectiveSkillName: name, skillRi: { icon }, state: { restUsed: true, skillUsed: true } }));
    expect(view.skill.props.disabled).toBe(true);
    expect(textOf(view.skill)).toBe(`${name}已休息`);
    expect(textOf(view.rest)).toBe('休息已用');
    expect(view.hints).toHaveLength(0);
  });

  it.each([
    ['global-only swap', { globalOnlySwapOwner: 0 }],
    ['borrowed effective swap', {}],
  ])('uses effective swap copy for %s without replacing the stored role', (_name, state) => {
    const props = makeProps({ player: { role: '邪祀者' }, effectiveSkillName: '掉包', skillRi: { icon: '✦' }, state: { ...state, skillUsed: true } });
    const view = render(props);
    expect(props.me.role).toBe('邪祀者');
    expect(textOf(view.skill)).toBe('掉包已用');
    expect(textOf(view.rest)).toBe('休息本回合不可用');
    expectAccessibleMutualHint(view, view.rest, '休息');
  });
});
