import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlayerPanel } from './index';

const appearance = vi.hoisted(() => ({ battleLayout: 'coastal' }));
vi.mock('../../ui/UiAppearance', () => ({ useUiAppearance: () => ({ appearance }) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const props = {
  player: {
    role: '邪祀者', roleRevealed: true, name: '旅者', hp: 10, san: 10,
    hand: [{ id: 'public-goat', isBlackGoatYoung: true, type: 'blackGoatYoung', name: '黑山羊幼仔' }, { id: 'secret' }],
    godName: 'CTH', godLevel: 2, godEncounters: 2, poisonStacks: 3,
    zoneCards: [{ id: 'visible-zone', type: 'blankZone', name: '空白区域牌', isZone: true }],
  },
  playerIndex: 1, displayStats: [null, { hp: 7, san: 5 }], scaleRatio: 1, viewportWidth: 1280,
};

describe('compact opponent panel', () => {
  it('keeps one visible flight anchor and animation-owned bars', () => {
    vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
    const markup = renderToStaticMarkup(<PlayerPanel {...props} simplified />);
    expect(markup).toContain('data-opponent-simplified="true"');
    expect(markup).toContain('data-death-panel="1"');
    expect(markup).toContain('portrait-1-gray.webp');
    expect(markup).toContain('hand-count.webp');
    expect(markup).toContain('aria-label="手牌 2 张"');
    expect(markup).toContain('aria-label="生命 HP 7/10，理智 SAN 5/10"');
    expect(markup.match(/data-player-hand-strip=/g)).toHaveLength(1);
    expect(markup).toContain('data-hand-card-width="28"');
    expect(markup).not.toContain('data-player-hand-card');
    expect(markup).not.toContain('toe-panel-frame"');
    expect(markup).not.toContain('data-theme-ornament');
    expect(markup).not.toContain('toe-opponent-heading');
    expect(markup).not.toContain('邪祀者');
    expect(markup).not.toContain('data-player-god-status');
    expect(markup).toContain('data-skull-layout="portrait-arc"');
    expect(markup.match(/src="[^"]*encounter-skull.webp"/g)).toHaveLength(2);
    expect(markup).not.toContain('visible-zone');
    const hp = markup.slice(markup.indexOf('data-stat-label="HP"'), markup.indexOf('data-stat-label="SAN"'));
    const san = markup.slice(markup.indexOf('data-stat-label="SAN"'));
    expect(hp).toContain('>7</span>');
    expect(san).toContain('>5</span>');
    expect(san).toContain('left:60%');
  });

  it('preserves the same death root when guillotined or dead, and restores real cards when expanded', () => {
    appearance.battleLayout = 'coastal';
    vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
    const guillotined = renderToStaticMarkup(<PlayerPanel {...props} simplified isBeingGuillotined />);
    expect(guillotined).toMatch(/data-death-panel="1"[^>]*opacity:0;/);
    const dead = renderToStaticMarkup(<PlayerPanel {...props} simplified player={{ ...props.player, isDead: true }} />);
    expect(dead).toContain('opacity:0.32;filter:grayscale(0.85) brightness(0.6)');
    const full = renderToStaticMarkup(<PlayerPanel {...props} simplified={false} />);
    expect(full).toContain('data-opponent-simplified="false"');
    expect(full.match(/data-player-hand-strip=/g)).toHaveLength(1);
    expect(full).not.toContain('data-hand-card-width');
    expect(full).toContain('data-player-hand-card-id="public-goat"');
    expect(full).toContain('data-player-hand-card-id="back-1-1"');
    expect(full).toContain('data-player-god-status="1"');
    expect(full).toContain('data-rendered-card-id="visible-zone"');
  });
});
