import { describe, expect, it } from 'vitest';
import { normalizeLogForViewer, revealLocalSwapTakenCards, revealSwapTakenCardLine } from '../logPerspective';

describe('multiplayer log perspective', () => {
  it('uses 你 only for the local player in both turn headings and actions', () => {
    const log = [
      '── 艾伦 的回合开始 ──',
      '你 遭遇邪神 弗栗多！（第1次）失去 1 SAN',
      '你放弃了邪神的馈赠',
      '你（追猎者）追捕 安娜，等待对方亮出一张手牌…',
      '安娜 亮出 [B1] 增殖的Z',
      '── 安娜 的回合开始 ──',
      '安娜 摸到 [C3] 地底天空',
      '你 收入了 [C3] 地底天空',
      '你（寻宝者）对 艾伦 【掉包】，请选择要抽取的牌',
      '【黑夜】安娜 选择【掉包】目标掷出 2，目标未偏移',
    ];

    expect(normalizeLogForViewer(log, { isMultiplayer: true, myName: '安娜' })).toEqual([
      '── 艾伦 的回合开始 ──',
      '艾伦 遭遇邪神 弗栗多！（第1次）失去 1 SAN',
      '艾伦放弃了邪神的馈赠',
      '艾伦（追猎者）追捕 你，等待对方亮出一张手牌…',
      '你 亮出 [B1] 增殖的Z',
      '── 你 的回合开始 ──',
      '你 摸到 [C3] 地底天空',
      '你 收入了 [C3] 地底天空',
      '你（寻宝者）对 艾伦 【掉包】，请选择要抽取的牌',
      '【黑夜】你 选择【掉包】目标掷出 2，目标未偏移',
    ]);
  });

  it('does not alter single-player logs', () => {
    const log = ['── 艾伦 的回合开始 ──', '你放弃了邪神的馈赠'];
    expect(normalizeLogForViewer(log, { isMultiplayer: false, myName: '安娜' })).toEqual(log);
  });

  it('normalizes hand faith action wording while preserving target wording', () => {
    const log = [
      '── 林恩 的回合开始 ──',
      '你 从手牌信仰 阿波菲斯，获得噬日灭世(Lv.1)（骷髅头不计）',
      '你 从手牌升级邪神之力至 Lv.2（骷髅头不计）',
      '你的手牌[B2] 旧牌被暗抽',
      '你 失去 1 SAN',
    ];
    expect(normalizeLogForViewer(log, { isMultiplayer: true, myName: '米娅' })).toEqual([
      log[0],
      log[1].replace(/^你/, '林恩'),
      log[2].replace(/^你/, '林恩'),
      log[3],
      log[4],
    ]);
  });

  it('keeps viewer-relative target text during a remote turn', () => {
    const log = [
      '── 艾伦 的回合开始 ──',
      '艾伦（寻宝者）对 安娜 【掉包】',
      '你的手牌[B2] 旧牌被暗抽',
      '你的邪神之力被触发',
    ];
    expect(normalizeLogForViewer(log, { isMultiplayer: true, myName: '安娜' })).toEqual([
      '── 艾伦 的回合开始 ──',
      '艾伦（寻宝者）对 你 【掉包】',
      '你的手牌[B2] 旧牌被暗抽',
      '艾伦的邪神之力被触发',
    ]);
  });
});

describe('swap taken-card reveal for the local swap initiator', () => {
  const zoneCard = (letter, number, name) => ({ isZone: true, letter, number, name });

  it('reveals the taken card only in placeholder lines', () => {
    const taken = zoneCard('B', 2, '旧牌');
    expect(revealSwapTakenCardLine('拿走 暗抽牌，还给 贝拉 [C3] 新牌', taken))
      .toBe('拿走 [B2] 旧牌，还给 贝拉 [C3] 新牌');
    // 目标手牌公开时日志本来就带牌面，不改动
    expect(revealSwapTakenCardLine('拿走 [A1] 明牌，还给 贝拉 [C3] 新牌', taken))
      .toBe('拿走 [A1] 明牌，还给 贝拉 [C3] 新牌');
    expect(revealSwapTakenCardLine('你暗抽了1张牌', taken)).toBe('你暗抽了1张牌');
  });

  it('enriches only the lines authored by the local swap source', () => {
    const state = {
      players: [{ name: '你' }, { name: '艾伦' }, { name: '贝拉' }],
      _visualEvents: [
        // 远端玩家发起的掉包：日志行保持“暗抽牌”占位
        { type: 'swapCards', sourceIdx: 1, targetIdx: 2, takenCard: zoneCard('D', 1, '远方'), givenCard: zoneCard('A', 1, '甲') },
        // 本地玩家（座位 0）发起的掉包：日志行显示拿走的暗抽牌
        { type: 'swapCards', sourceIdx: 0, targetIdx: 1, takenCard: zoneCard('B', 2, '旧牌'), givenCard: zoneCard('C', 3, '新牌') },
      ],
    };
    const log = [
      '拿走 暗抽牌，还给 贝拉 [A1] 甲',
      '拿走 暗抽牌，还给 艾伦 [C3] 新牌',
    ];
    expect(revealLocalSwapTakenCards(log, state)).toEqual([
      '拿走 暗抽牌，还给 贝拉 [A1] 甲',
      '拿走 [B2] 旧牌，还给 艾伦 [C3] 新牌',
    ]);
  });

  it('returns the log unchanged without swap events', () => {
    const log = ['拿走 暗抽牌，还给 艾伦 [C3] 新牌'];
    expect(revealLocalSwapTakenCards(log, { players: [{ name: '你' }] })).toEqual(log);
  });
});
