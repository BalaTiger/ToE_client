import { describe, expect, it } from 'vitest';
import { INSPECTION_DECK } from '../../constants/card';
import {
  BALANCE_PATCH_KEYS,
  DEFAULT_BALANCE_PATCHES,
  advanceGodEncounter,
  formatGodEncounterProgress,
} from '../balancePatches';
import { playerDrawCard } from '../turnEngine';
import { makeGodCard, makeGs, makePlayer } from './factory';

describe('balance patches', () => {
  it('uses six 2-damage copies of both HP inspection cards', () => {
    const scratch = INSPECTION_DECK.filter(card => card.name === '乱抓');
    const selfHarm = INSPECTION_DECK.filter(card => card.name === '自残');

    expect(scratch).toHaveLength(6);
    expect(selfHarm).toHaveLength(6);
    expect(scratch.every(card => card.value === 2)).toBe(true);
    expect(selfHarm.every(card => card.value === 2)).toBe(true);
    expect(INSPECTION_DECK).toHaveLength(30);
  });

  it('keeps the two-encounters-per-skull patch disabled by default', () => {
    expect(DEFAULT_BALANCE_PATCHES[BALANCE_PATCH_KEYS.TWO_GOD_ENCOUNTERS_PER_SKULL]).toBe(false);
  });

  it('preserves the current one-skull-per-encounter rule while disabled', () => {
    const player = { godEncounters: 0, godEncounterCount: 0 };
    const state = { balancePatches: { [BALANCE_PATCH_KEYS.TWO_GOD_ENCOUNTERS_PER_SKULL]: false } };

    expect(advanceGodEncounter(player, state)).toMatchObject({
      encounterCount: 1,
      skullCount: 1,
      sanLoss: 1,
      createdSkull: true,
      patchEnabled: false,
    });
    expect(advanceGodEncounter(player, state)).toMatchObject({
      encounterCount: 2,
      skullCount: 2,
      sanLoss: 2,
    });
  });

  it('creates a skull and SAN loss only on every second encounter when enabled', () => {
    const player = { godEncounters: 0, godEncounterCount: 0 };
    const state = { balancePatches: { [BALANCE_PATCH_KEYS.TWO_GOD_ENCOUNTERS_PER_SKULL]: true } };
    const results = Array.from({ length: 4 }, () => advanceGodEncounter(player, state));

    expect(results.map(({ skullCount, sanLoss, createdSkull }) => (
      [skullCount, sanLoss, createdSkull]
    ))).toEqual([
      [0, 0, false],
      [1, 1, true],
      [1, 0, false],
      [2, 2, true],
    ]);
    expect(formatGodEncounterProgress(results[2])).toContain('尚未产生骷髅头');
    expect(formatGodEncounterProgress(results[3])).toContain('产生第2个骷髅头');
  });

  it('applies the enabled patch through the real god-card draw flow', () => {
    const patchState = {
      [BALANCE_PATCH_KEYS.TWO_GOD_ENCOUNTERS_PER_SKULL]: true,
    };
    const firstGod = makeGodCard('NYA');
    const firstPlayers = [makePlayer({
      san: 10,
      godEncounters: 0,
      godEncounterCount: 0,
    })];
    const firstGs = makeGs({
      players: firstPlayers,
      deck: [firstGod],
      balancePatches: patchState,
      log: [],
    });

    const first = playerDrawCard(firstPlayers, [firstGod], [], 0, firstGs);

    expect(first.P[0]).toMatchObject({
      san: 10,
      godEncounters: 0,
      godEncounterCount: 1,
      lastGodEncounterSanLoss: 0,
    });
    expect(first.effectMsgs.join(' ')).toContain('尚未产生骷髅头');
    expect(first.statePatch._inspectionEvents || []).toEqual([]);

    const secondGod = makeGodCard('VRI');
    const secondGs = makeGs({
      players: first.P,
      deck: [secondGod],
      balancePatches: patchState,
      log: first.effectMsgs,
    });
    const second = playerDrawCard(first.P, [secondGod], [], 0, secondGs);

    expect(second.P[0]).toMatchObject({
      san: 9,
      godEncounters: 1,
      godEncounterCount: 2,
      lastGodEncounterSanLoss: 1,
    });
    expect(second.effectMsgs.join(' ')).toContain('产生第1个骷髅头');
  });
});
