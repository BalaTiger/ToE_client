import { Children } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DrawRevealActions, GodChoiceActions } from './RevealDecisionActions';

function descendants(node) {
  if (typeof node?.type === 'function') return descendants(node.type(node.props));
  return [node, ...Children.toArray(node?.props?.children).flatMap(descendants)];
}

function textOf(node) {
  return descendants(node).filter(value => typeof value === 'string' || typeof value === 'number').join('');
}

const card = { name: '幽闭恐惧', desc: '你与相邻角色失去2SAN', slotKey: 'B1' };
const godCard = { name: '拉莱耶之主', godKey: 'CTH', isGod: true };
const godProps = overrides => ({
  godCard,
  player: { role: '邪祀者', godName: null, godLevel: 0 },
  onWorship: vi.fn(), onKeepHand: vi.fn(), onDiscard: vi.fn(),
  ...overrides,
});

beforeEach(() => vi.stubGlobal('window', {}));
afterEach(() => vi.unstubAllGlobals());

describe('reveal card decisions', () => {
  it('retains keep/discard callbacks and tutorial ref without a second card or dialog', () => {
    const keepButtonRef = { current: null };
    const onKeep = vi.fn();
    const onDiscard = vi.fn();
    const tree = DrawRevealActions({ drawReveal: { card }, canChoose: true, onKeep, onDiscard, keepButtonRef });
    const nodes = descendants(tree);
    const buttons = nodes.filter(node => node?.type === 'button');
    expect(buttons.map(textOf)).toEqual(['收入手牌', '弃置此牌']);
    expect(buttons[0].props.ref).toBe(keepButtonRef);
    buttons[0].props.onClick();
    buttons[1].props.onClick();
    expect(onKeep).toHaveBeenCalledOnce();
    expect(onDiscard).toHaveBeenCalledOnce();
    expect(nodes.some(node => node?.type === 'img' || node?.props?.role === 'dialog')).toBe(false);
    expect(textOf(tree)).not.toContain(card.name);
  });

  it('keeps tutorial-disabled buttons inert and exposes retry errors', () => {
    const tree = DrawRevealActions({ drawReveal: { card }, canChoose: true, canKeep: false, canDiscard: false, decisionError: new Error('failure') });
    const nodes = descendants(tree);
    nodes.filter(node => node?.type === 'button').forEach(button => {
      expect(button.props.disabled).toBe(true);
      expect(button.props.onClick).toBeUndefined();
    });
    expect(textOf(nodes.find(node => node?.props?.role === 'alert'))).toBe('结算准备失败，请重试。');
  });

  it.each(['', '对方正在思考…'])('never reveals controls to a bystander with thinkingText=%s', thinkingText => {
    for (const tree of [
      DrawRevealActions({ drawReveal: { card, blindIdentity: true }, canChoose: false, thinkingText }),
      GodChoiceActions(godProps({ canChoose: false, thinkingText })),
    ]) {
      const nodes = descendants(tree);
      expect(nodes.filter(node => node?.type === 'button')).toHaveLength(0);
      expect(textOf(nodes.find(node => node?.props?.role === 'status'))).toBeTruthy();
      expect(textOf(tree)).not.toContain(card.name);
      expect(textOf(tree)).not.toContain(godCard.name);
    }
  });

  it('offers god keep only to a cultist who does not already worship this god', () => {
    const props = godProps({ keepButtonRef: { current: null } });
    const buttons = descendants(GodChoiceActions(props)).filter(node => node?.type === 'button');
    expect(buttons.map(textOf)).toEqual(['信仰邪神', '收入手牌', '放弃']);
    expect(buttons[1].props.ref).toBe(props.keepButtonRef);
    buttons.forEach(button => button.props.onClick());
    expect(props.onWorship).toHaveBeenCalledOnce();
    expect(props.onKeepHand).toHaveBeenCalledOnce();
    expect(props.onDiscard).toHaveBeenCalledOnce();
    for (const overrides of [{ player: { role: '寻宝者' } }, { player: { role: '邪祀者', godName: 'CTH', godLevel: 1 } }, { allowKeepHand: false }]) {
      expect(textOf(GodChoiceActions(godProps(overrides)))).not.toContain('收入手牌');
    }
  });

  it('shows upgrade and conversion consequences without duplicate card text or skull counts', () => {
    const upgrade = GodChoiceActions(godProps({ player: { role: '邪祀者', godName: 'CTH', godLevel: 2, godEncounters: 4 } }));
    expect(textOf(upgrade)).toContain('升级邪神之力');
    expect(textOf(upgrade)).toContain('升级后：梦访拉莱耶 Lv.3');
    expect(renderToStaticMarkup(upgrade)).not.toContain('💀');
    expect(textOf(GodChoiceActions(godProps({ isConvert: true })))).toContain('改信失去 1 SAN');
    expect(textOf(GodChoiceActions(godProps({ player: { role: '邪祀者', godName: 'CTH', godLevel: 3 } })))).toContain('梦访拉莱耶已达 Lv.3');
  });

  it('forced conversion offers only its guarded accept callback', () => {
    const props = godProps({ forcedConvert: true, isConvert: true, allowWorship: false });
    const tree = GodChoiceActions(props);
    const buttons = descendants(tree).filter(node => node?.type === 'button');
    expect(buttons.map(textOf)).toEqual(['接受改信']);
    expect(buttons[0].props.disabled).toBe(true);
    expect(buttons[0].props.onClick).toBeUndefined();
    expect(textOf(tree)).not.toContain('失去 1 SAN');
  });

  it('preserves actual encounter costs and revealed cultist immunity without encounter counters', () => {
    const paid = GodChoiceActions(godProps({ player: { role: '寻宝者', godEncounters: 2, lastGodEncounterSanLoss: 2 } }));
    expect(textOf(paid)).toContain('遭遇 −2 SAN');
    const immune = GodChoiceActions(godProps({ player: { role: '邪祀者', roleRevealed: true, godEncounters: 2, lastGodEncounterSanLoss: 2 } }));
    expect(textOf(immune)).toContain('遭遇伤害免疫');
    expect(textOf(immune)).not.toContain('−2 SAN');
  });

  it('keeps all god tutorial restrictions and suppresses absent decisions', () => {
    const buttons = descendants(GodChoiceActions(godProps({ allowWorship: false, allowDiscard: false }))).filter(node => node?.type === 'button');
    expect(buttons.map(button => button.props.disabled)).toEqual([true, false, true]);
    expect(DrawRevealActions({ drawReveal: null })).toBeNull();
    expect(GodChoiceActions({ godCard: null })).toBeNull();
  });
});
