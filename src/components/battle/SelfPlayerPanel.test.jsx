import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SelfPlayerPanel } from './SelfPlayerPanel';
import { RINFO } from '../../game/setup';

describe('SelfPlayerPanel presentation player', () => {
  it.each(Object.entries(RINFO).flatMap(([role, ri]) => [113, 180].map(height => [role, ri, height])))('keeps %s goal help and presentation stats (%j, %ipx)', (role, ri, middleRowHeight) => {
    vi.stubGlobal('window', { __PUBLIC_BASE__: '/' });
    const player = {
      role,
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
        ri={ri}
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

    const goalMarkup = markup.slice(markup.indexOf('class="toe-self-goal"'), markup.indexOf('class="toe-self-faith"'));
    expect(goalMarkup).toContain(`游戏目标：${ri.goal}`);
    expect(goalMarkup).toContain(`title="${ri.goalDetails}"`);
    expect(goalMarkup).toContain('tabindex="0"');
    expect(goalMarkup).toContain(`aria-label="游戏目标：${ri.goal}。${ri.goalDetails}"`);
    expect(ri.goalDetails).toContain(ri.skillName);
    expect(markup).toContain('梦访拉莱耶 Lv.2');
    expect(markup).toContain('摸2张牌');
    expect(markup).not.toContain('梦访拉莱耶 Lv.1');
    const hpMarkup = markup.slice(markup.indexOf('data-stat-label="HP"'), markup.indexOf('data-stat-label="SAN"'));
    expect(hpMarkup).toContain('>7</span>');
    expect(markup.slice(markup.indexOf('data-stat-label="SAN"'))).toContain('>5</span>');
    expect(markup).toContain('翻面中 — 下回合跳过');
  });
});
