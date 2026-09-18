import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SelfPlayerPanel } from './SelfPlayerPanel';

describe('SelfPlayerPanel presentation player', () => {
  it.each([113, 180])('keeps presentation stats and god power at %ipx panel height', middleRowHeight => {
    vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
    const player = {
      role: '邪祀者',
      hp: 10,
      san: 8,
      isDead: false,
      isResting: true,
      godName: 'CTH',
      godLevel: 2,
      godEncounters: 1,
      zoneCards: [],
    };

    const markup = renderToStaticMarkup(
      <SelfPlayerPanel
        player={player}
        displayStats={[{ hp: 7, san: 5 }]}
        ri={{ icon: '⛧', col: '#fff', goal: '测试目标' }}
        phase="ACTION"
        isBlocked={false}
        canLocalTargetSelect={false}
        tutorialStep={0}
        isMobile={false}
        isMobileLandscape={false}
        boardCssPx={value => value}
        middleRowHeight={middleRowHeight}
        fontSizes={{ tiny: 9, small: 10, body: 12 }}
        boardScaleRatio={1}
        vw={1280}
        expansionKey="群星呼唤"
        hitIndices={[]}
        sanHitIndices={[]}
        hpHealIndices={[]}
        sanHealIndices={[]}
        guillotinedPids={new Set()}
        godHighlightPanelBursts={{}}
        isSelfDeadPanelDimmed={false}
        isMultiplayer={false}
        showEmojiPicker={false}
        setShowEmojiPicker={() => {}}
        setEmojiButtonPos={() => {}}
        handleAIClick={() => {}}
      />,
    );

    expect(markup).toContain('梦访拉莱耶 Lv.2');
    expect(markup).toContain('摸2张牌');
    expect(markup).not.toContain('梦访拉莱耶 Lv.1');
    const hpMarkup = markup.slice(markup.indexOf('data-stat-label="HP"'), markup.indexOf('data-stat-label="SAN"'));
    expect(hpMarkup).toContain('>7</span>');
    expect(markup.slice(markup.indexOf('data-stat-label="SAN"'))).toContain('>5</span>');
    expect(markup).toContain('翻面中 — 下回合跳过');
  });
});
