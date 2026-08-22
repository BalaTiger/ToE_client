import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PlayerStatusTags } from './PlayerStatusTags';

describe('PlayerStatusTags presentation state', () => {
  it('passes the presentation player to the god-power renderer', () => {
    const presentationPlayer = {
      godName: 'CTH',
      godLevel: 2,
      godEncounters: 1,
      etherealizeStacks: 1,
      poisonStacks: 1,
    };
    const renderGodPower = vi.fn(player => (
      <span>{player.godName} Lv.{player.godLevel}</span>
    ));

    const markup = renderToStaticMarkup(
      <PlayerStatusTags
        player={presentationPlayer}
        playerIndex={0}
        renderGodPower={renderGodPower}
      />,
    );

    expect(renderGodPower).toHaveBeenCalledWith(presentationPlayer);
    expect(markup).toContain('CTH Lv.2');
    expect(markup).toContain('虚化 1');
    expect(markup).toContain('中毒 1');
  });
});
