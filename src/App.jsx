import React, { useState, useEffect, useRef, useMemo, useCallback, Fragment } from "react";
import "./App.css";

// ══════════════════════════════════════════════════════════════
//  1. 音频管理 (使用自定义 Hook)
// ══════════════════════════════════════════════════════════════

function useGameAudio() {
  const battleMusicRef = useRef(new Audio('sounds/battle.mp3'));
  const mainMusicRef = useRef(new Audio('sounds/mainTheme.mp3'));
  const openSoundRef = useRef(new Audio('sounds/open.mp3'));
  const closeSoundRef = useRef(new Audio('sounds/close.mp3'));

  const baseMusicVolume = 0.4;
  const baseSoundVolume = 0.7;

  useEffect(() => {
    // 设置循环播放
    battleMusicRef.current.loop = true;
    mainMusicRef.current.loop = true;
    battleMusicRef.current.volume = baseMusicVolume;
    mainMusicRef.current.volume = baseMusicVolume;
    openSoundRef.current.volume = baseSoundVolume;
    closeSoundRef.current.volume = baseSoundVolume;

    // 预加载
    battleMusicRef.current.preload = 'auto';
    mainMusicRef.current.preload = 'auto';
  }, []);

  const fadeOutIn = useCallback((fromAudio, toAudio) => {
    if (!fromAudio || !toAudio) return;
    toAudio.volume = 0;
    toAudio.play().catch(e => console.log('Audio play blocked:', e));

    let fadeOutInterval = setInterval(() => {
      if (fromAudio.volume > 0.05) {
        fromAudio.volume -= 0.05;
      } else {
        fromAudio.volume = 0;
        fromAudio.pause();
        clearInterval(fadeOutInterval);
      }
    }, 50);

    let fadeInInterval = setInterval(() => {
      if (toAudio.volume < baseMusicVolume - 0.05) {
        toAudio.volume += 0.05;
      } else {
        toAudio.volume = baseMusicVolume;
        clearInterval(fadeInInterval);
      }
    }, 50);
  }, [baseMusicVolume]);

  const playOpenSound = useCallback(() => {
    openSoundRef.current.currentTime = 0;
    openSoundRef.current.play().catch(e => console.log('SFX blocked:', e));
  }, []);

  const playCloseSound = useCallback(() => {
    closeSoundRef.current.currentTime = 0;
    closeSoundRef.current.play().catch(e => console.log('SFX blocked:', e));
  }, []);

  const switchMusic = useCallback((isInGame) => {
    if (isInGame) {
      fadeOutIn(mainMusicRef.current, battleMusicRef.current);
    } else {
      fadeOutIn(battleMusicRef.current, mainMusicRef.current);
    }
  }, [fadeOutIn]);

  return { switchMusic, playOpenSound, playCloseSound };
}

// ══════════════════════════════════════════════════════════════
//  2. 特效组件 (HP破碎、邪祀胜利)
// ══════════════════════════════════════════════════════════════

// 新的死亡破碎炸裂特效
function CharacterBreakingAnim({ playerBoxRef }) {
  const [shards, setShards] = useState([]);

  useEffect(() => {
    if (playerBoxRef.current) {
      const rect = playerBoxRef.current.getBoundingClientRect();
      const numShards = 25;
      const shardSize = 20;

      const newShards = Array.from({ length: numShards }).map((_, i) => ({
        id: i,
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        vx: (Math.random() - 0.5) * 15,
        vy: (Math.random() - 0.5) * 15 - 5,
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 10,
        opacity: 1,
        color: i % 2 === 0 ? '#301010' : '#442020',
        borderColor: i % 3 === 0 ? '#990000' : '#660000',
      }));
      setShards(newShards);

      const animationInterval = setInterval(() => {
        setShards(prevShards => prevShards.map(s => ({
          ...s,
          x: s.x + s.vx,
          y: s.y + s.vy,
          vy: s.vy + 0.3,
          rotation: s.rotation + s.vr,
          opacity: Math.max(0, s.opacity - 0.02),
        })).filter(s => s.opacity > 0));
      }, 30);

      const finishTimeout = setTimeout(() => {
        clearInterval(animationInterval);
        playerBoxRef.current.style.visibility = 'hidden';
      }, 1500);

      return () => {
        clearInterval(animationInterval);
        clearTimeout(finishTimeout);
      };
    }
  }, [playerBoxRef]);

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 1000 }}>
      {shards.map(s => (
        <div key={s.id} style={{
          position: 'absolute', left: `${s.x}px`, top: `${s.y}px`,
          width: '18px', height: '18px', background: s.color,
          border: `1px solid ${s.borderColor}`,
          borderRadius: '2px', transform: `rotate(${s.rotation}deg)`,
          opacity: s.opacity, transition: 'opacity 0.1s',
          boxShadow: `0 0 5px ${s.borderColor}`,
        }} />
      ))}
    </div>
  );
}

// 邪祀者胜利特效
function CultistVictoryAnim({ winner }) {
  return (
    <div className="cultist-victory-overlay">
      <div className="resurrection-effects">
        <div className="dark-pulsing-sigil"></div>
        <div className="dark-energy-particles"></div>
      </div>
      <div className="cultist-win-text">
        <div className="sub-text">深渊的意志终将降临</div>
        <div className="main-title">邪祀者 {winner.name} 复活了邪神</div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  3. 核心数据定义 (区域牌生成、效果映射)
// ══════════════════════════════════════════════════════════════

const LETTERS = ['A', 'B', 'C', 'D'];
const NUMS = [1, 2, 3, 4];
const GOD_CS = { bg: '#1a1a1a', border: '#444', borderBright: '#f1c40f', glow: '#f1c40f', text: '#f1c40f' };

const FIXED_ZONE_EFFECTS = {
  "A1": {
    pos: { name: '古代秘药', desc: '你回复2HP', type: 'selfHealHP', val: 2 },
    negS: { name: '坠落', desc: '你失去2HP，随机弃一张手牌', type: 'selfDamageDiscardHP', val: 2 },
    negA: { name: '坠落AOE', desc: '全场玩家受2HP伤害', type: 'allDamageHP', val: 2 }
  },
  "A2": {
    pos: { name: '强心剂', desc: '你回复3HP', type: 'selfHealHP', val: 3 },
    negS: { name: '毒刺陷阱', desc: '指定一名目标受3HP伤害', type: 'damage', val: 3 },
    negA: { name: '黑暗风暴', desc: '全场受3HP伤害', type: 'allDamageHP', val: 3 }
  },
  "A3": {
    pos: { name: '宁神香薰', desc: '你回复2SAN', type: 'selfHealSAN', val: 2 },
    negS: { name: '精神侵蚀', desc: '触发者失去2SAN', type: 'selfSANDamage', val: 2 },
    negA: { name: '集体净化', desc: '全场回复1SAN', type: 'allHealSAN', val: 1 }
  },
  "A4": {
    pos: { name: '理智护符', desc: '你回复3SAN', type: 'selfHealSAN', val: 3 },
    negS: { name: '恐惧幻象', desc: '指定目标失去2SAN', type: 'sanDamage', val: 2 },
    negA: { name: '群体恐慌', desc: '全场失去1SAN', type: 'allSANDamage', val: 1 }
  },
  "B1": {
    pos: { name: '预言碎片', desc: '你摸1牌', type: 'draw', val: 0 },
    negS: { name: '遭遇塌方', desc: '失去2HP且状态反转(休息)', type: 'selfDamageRestHP', val: 2 },
    negA: { name: '强风刮过', desc: '全体存活角色各随机弃1张手牌', type: 'allDiscard', val: 1 }
  },
  "B2": {
    pos: { name: '吃下荧光苔藓', desc: '你的HP回满，手牌全局公开', type: 'selfRevealHandHP', val: 10 },
    negS: { name: '遭遇塌方', desc: '失去2HP且状态反转(休息)', type: 'selfDamageRestHP', val: 2 },
    negA: { name: '地刺陷阱', desc: '你与相邻存活角色失去2HP', type: 'adjDamageHP', val: 2 }
  },
  "B3": {
    pos: { name: '营地篝火', desc: '你与相邻存活角色回复1HP', type: 'adjHealHP', val: 1 },
    negS: { name: '迷失低语', desc: '触发者失去1SAN', type: 'selfSANDamage', val: 1 },
    negA: { name: '混乱气流', desc: '你与相邻角色各随机弃1张手牌', type: 'adjDiscard', val: 1 }
  },
  "B4": {
    pos: { name: '舒缓之歌', desc: '你与相邻存活角色回复1SAN', type: 'adjHealSAN', val: 1 },
    negS: { name: '忏悔惩罚', desc: '若信仰邪神则必须改信受罚', type: 'selfRenounceGod', val: 1 },
    negA: { name: '邪恶低语', desc: '你与相邻存活角色失去1SAN', type: 'adjDamageSAN', val: 1 }
  },
  "C1": {
    pos: { name: '献祭治愈', desc: '你失去1SAN，全体回复2HP', type: 'sacHealHP', val: 2 },
    negS: { name: '穿刺', desc: '指定目标受2HP伤害，你摸1牌', type: 'damageDraw', val: 2 },
    negA: { name: '绝望回声', desc: '你与相邻存活角色失去2SAN', type: 'adjDamageSAN', val: 2 }
  },
  "C2": {
    pos: { name: '启示光辉', desc: '你失去1HP，全体回复2SAN', type: 'sacHealSAN', val: 2 },
    negS: { name: '精神侵蚀', desc: '指定目标失去1SAN并弃1牌', type: 'sanDamageDiscard', val: 1 },
    negA: { name: '瘟疫蔓延', desc: '你与相邻存活角色失去1HP和1SAN', type: 'adjDamageBoth', val: 1 }
  },
  "C3": {
    pos: { name: '理智重生', desc: '指定目标受4HP伤害', type: 'damage', val: 4 },
    negS: { name: '混乱气流', desc: '你与相邻角色各随机弃1张手牌', type: 'adjDiscard', val: 1 },
    negA: { name: '集体净化', desc: '全场回复1SAN', type: 'allHealSAN', val: 1 }
  },
  "C4": {
    pos: { name: '群体治愈', desc: '全体存活角色回复1HP', type: 'allHealHP', val: 1 },
    negS: { name: '忏悔独白', desc: '信仰邪神则背离并接受惩罚', type: 'selfRenounceGod', val: 1 },
    negA: { name: '地刺陷阱', desc: '你与相邻存活角色失去2HP', type: 'adjDamageHP', val: 2 }
  },
  "D1": {
    pos: { name: '强风刮过', desc: '全场受2HP伤害', type: 'allDamageHP', val: 2 },
    negS: { name: '惊慌失措', desc: '你失去2SAN并弃一张牌', type: 'selfDamageDiscardSAN', val: 2 },
    negA: { name: '瘟疫蔓延', desc: '你与相邻存活角色失去1HP和1SAN', type: 'adjDamageBoth', val: 1 }
  },
  "D2": {
    pos: { name: '营地篝火', desc: '全体存活角色各随机弃1张手牌', type: 'allDiscard', val: 1 },
    negS: { name: '遗忘咒语', desc: '失去1SAN，随机弃2张牌', type: 'selfDamageDiscardSAN2', val: 1 },
    negA: { name: '毒气喷涌', desc: '你与相邻存活角色失去1HP', type: 'adjDamageHP', val: 1 }
  },
  "D3": {
    pos: { name: '绮丽诗篇', desc: '直到你的下回合，所有人技能变为掉包', type: 'globalOnlySwap', val: 0 },
    negS: { name: '落石砸击', desc: '你失去3HP', type: 'selfDamageHP', val: 3 },
    negA: { name: '绝望回声', desc: '全体存活角色失去1SAN', type: 'allDamageSAN', val: 1 }
  },
  "D4": {
    pos: { name: '沉睡魔咒', desc: '指定目标失去3SAN', type: 'sanDamage', val: 3 },
    negS: { name: '地刺陷阱', desc: '触发者失去2HP', type: 'selfDamageHP', val: 2 },
    negA: { name: '混乱气流', desc: '全体失去1HP和1SAN', type: 'allDamageBoth', val: 1 }
  }
};

const GOD_DEFS = {
  NYA: { name: '奈亚拉托提普', color: '#8e44ad', desc: '【借用】本回合你可以使用另一职业的技能', needsTarget: false },
  CTH: { name: '克苏鲁', color: '#1abc9c', desc: '【沉睡】使1名目标状态反转(休息)', needsTarget: true }
};

// ══════════════════════════════════════════════════════════════
//  4. 辅助函数
// ══════════════════════════════════════════════════════════════

const clamp = (v) => Math.max(0, Math.min(10, v));
const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
const copyPlayers = (ps) => ps.map(p => ({ ...p, hand: [...p.hand], godZone: [...(p.godZone || [])], isDamaging: false, isHealing: false }));

function isWinHand(hand) {
  const letters = new Set(hand.filter(c => !c.isGod).map(c => c.letter));
  const numbers = new Set(hand.filter(c => !c.isGod).map(c => c.number));
  return letters.size === 4 && numbers.size === 4;
}

function generateFixedDeck() {
  let id = 0;
  const zoneCards = [];
  LETTERS.forEach(L => {
    NUMS.forEach(N => {
      const key = `${L}${N}`;
      const def = FIXED_ZONE_EFFECTS[key];
      if (def) {
        zoneCards.push({ id: id++, key, letter: L, number: N, typeIdx: 0, needsTarget: false, ...def.pos });
        zoneCards.push({ id: id++, key, letter: L, number: N, typeIdx: 1, needsTarget: true, ...def.negS });
        zoneCards.push({ id: id++, key, letter: L, number: N, typeIdx: 2, needsTarget: true, ...def.negA });
      }
    });
  });
  const godCards = [
    ...Array(4).fill(0).map(() => ({ id: id++, isGod: true, godKey: 'NYA', key: 'NYA', ...GOD_DEFS.NYA })),
    ...Array(4).fill(0).map(() => ({ id: id++, isGod: true, godKey: 'CTH', key: 'CTH', ...GOD_DEFS.CTH })),
  ];
  return shuffle([...zoneCards, ...godCards]);
}

// 核心效果引擎
function applyCardFx(card, ci, ti, ps, deck, disc) {
  let P = copyPlayers(ps), D = [...deck], Disc = [...disc], msgs = [], globalRule = null;
  const subjectIdx = ti != null ? ti : ci;
  const sn = P[subjectIdx]?.name;

  const healHP = (i, v) => { if (i != null && P[i] && !P[i].isDead) { P[i].hp = clamp(P[i].hp + v); P[i].isHealing = true; } };
  const healSAN = (i, v) => { if (i != null && P[i] && !P[i].isDead) P[i].san = clamp(P[i].san + v); };
  const hurtHP = (i, v) => {
    if (i != null && P[i] && !P[i].isDead) {
      P[i].hp = clamp(P[i].hp - v); P[i].isDamaging = true;
      if (P[i].hp <= 0) {
        P[i].isDead = true; P[i].roleRevealed = true;
        msgs.push(`☠ ${P[i].name}（${P[i].role}）倒下了！`);
        Disc.push(...P[i].hand); P[i].hand = [];
        if (P[i].godZone?.length) { Disc.push(...P[i].godZone); P[i].godZone = []; P[i].godName = null; }
      }
    }
  };
  const hurtSAN = (i, v) => { if (i != null && P[i] && !P[i].isDead) P[i].san = clamp(P[i].san - v); };
  const drawCard = (i, n) => { if (i != null && P[i] && !P[i].isDead) { P[i].hand.push(...D.splice(0, n)); msgs.push(`${P[i].name} 摸了 ${n} 张牌`); } };
  const randDiscard = (i, n) => { if (i != null && P[i] && !P[i].isDead) { for (let k = 0; k < n; k++) { if (P[i].hand.length) Disc.push(P[i].hand.splice(0 | Math.random() * P[i].hand.length, 1)[0]); } msgs.push(`${P[i].name} 失去了 ${n} 张手牌`); } };
  const toggleRest = i => { if (i != null && P[i] && !P[i].isDead) { P[i].isResting = !P[i].isResting; msgs.push(`${P[i].name} 状态反转：${P[i].isResting ? '休息' : '苏醒'}`); } };

  const living = P.map((p, i) => ({ p, i })).filter(x => !x.p.isDead);
  const getAdj = (tgtIdx) => {
    const lIdx = living.findIndex(x => x.i === tgtIdx);
    if (lIdx < 0) return [tgtIdx];
    const adj = [tgtIdx];
    if (living.length > 1) adj.push(living[(lIdx - 1 + living.length) % living.length].i);
    if (living.length > 1) adj.push(living[(lIdx + 1) % living.length].i);
    return [...new Set(adj)];
  };

  switch (card.type) {
    case 'selfHealHP': healHP(subjectIdx, card.val); msgs.push(`${sn} 回复 ${card.val}HP`); break;
    case 'selfHealSAN': healSAN(subjectIdx, card.val); msgs.push(`${sn} 回复 ${card.val}SAN`); break;
    case 'allHealHP': living.forEach(x => healHP(x.i, card.val)); msgs.push(`全体回复 ${card.val}HP`); break;
    case 'allHealSAN': living.forEach(x => healSAN(x.i, card.val)); msgs.push(`全体回复 ${card.val}SAN`); break;
    case 'selfRevealHandHP': P[subjectIdx].handRevealed = true; healHP(subjectIdx, 10); msgs.push(`${sn} 暴露了行囊，HP回满`); break;
    case 'adjHealHP': getAdj(subjectIdx).forEach(i => healHP(i, 1)); msgs.push(`${sn} 及其相邻回复1HP`); break;
    case 'adjHealSAN': getAdj(subjectIdx).forEach(i => healSAN(i, 1)); msgs.push(`${sn} 及其相邻回复1SAN`); break;
    case 'sacHealHP': hurtSAN(subjectIdx, 1); living.forEach(x => healHP(x.i, 2)); msgs.push(`${sn} 祭出1SAN，全场回复2HP`); break;
    case 'sacHealSAN': hurtHP(subjectIdx, 1); living.forEach(x => healSAN(x.i, 2)); msgs.push(`${sn} 祭出1HP，全场回复2SAN`); break;
    case 'sacHealSelfHP': hurtSAN(subjectIdx, 1); healHP(subjectIdx, 4); msgs.push(`${sn} 祭出1SAN，回复4HP`); break;
    case 'selfDamageHP': hurtHP(subjectIdx, card.val); msgs.push(`${sn} 受到 ${card.val}HP 伤害`); break;
    case 'allDamageHP': living.forEach(x => hurtHP(x.i, card.val)); msgs.push(`全场爆发，全体受到 ${card.val}HP 伤害`); break;
    case 'damage': hurtHP(subjectIdx, card.val); msgs.push(`${sn} 受到 ${card.val}HP 伤害`); break;
    case 'selfDamageDiscardHP': hurtHP(subjectIdx, 2); randDiscard(subjectIdx, 1); break;
    case 'selfSANDamage': hurtSAN(subjectIdx, card.val); msgs.push(`${sn} 失去了 ${card.val}SAN`); break;
    case 'sanDamage': hurtSAN(subjectIdx, card.val); msgs.push(`${sn} 失去了 ${card.val}SAN`); break;
    case 'allSANDamage': living.forEach(x => hurtSAN(x.i, card.val)); msgs.push(`全体失去 ${card.val}SAN`); break;
    case 'draw': drawCard(subjectIdx, 1); break;
    case 'allDiscard': living.forEach(x => randDiscard(x.i, 1)); break;
    case 'selfDamageRestHP': hurtHP(subjectIdx, 2); toggleRest(subjectIdx); break;
    case 'adjDamageHP': getAdj(subjectIdx).forEach(i => hurtHP(i, card.val)); msgs.push(`${sn} 及其相邻失去 ${card.val}HP`); break;
    case 'adjDiscard': getAdj(subjectIdx).forEach(i => randDiscard(i, 1)); break;
    case 'selfRenounceGod':
      if (P[subjectIdx].godName) {
        hurtSAN(subjectIdx, 2); Disc.push(...P[subjectIdx].godZone);
        P[subjectIdx].godZone = []; P[subjectIdx].godName = null; msgs.push(`${sn} 背离了邪神并接受处罚！`);
      } else { hurtSAN(subjectIdx, 1); }
      break;
    case 'damageDraw': hurtHP(subjectIdx, 2); drawCard(ci, 1); msgs.push(`${sn} 受到2HP伤害`); break;
    case 'sanDamageDiscard': hurtSAN(subjectIdx, 1); randDiscard(subjectIdx, 1); break;
    case 'adjDamageBoth': getAdj(subjectIdx).forEach(i => { hurtHP(i, 1); hurtSAN(i, 1); }); msgs.push(`${sn} 及其相邻各失去1HP和1SAN`); break;
    case 'allHealSAN': living.forEach(x => healSAN(x.i, card.val)); msgs.push(`全体回复1SAN`); break;
    case 'globalOnlySwap': globalRule = { type: 'ONLY_SWAP', expireTurn: subjectIdx }; msgs.push(`绮丽诗篇响起：技能全部变为掉包`); break;
    case 'sacAllHealHP': hurtHP(subjectIdx, 2); living.forEach(x => { if (x.i !== subjectIdx) healHP(x.i, 1); }); msgs.push(`${sn} 牺牲2HP，祭出群体回复`); break;
    case 'allDiscardSAN': living.forEach(x => hurtSAN(x.i, 2)); msgs.push(`全体失去2SAN`); break;
    default: break;
  }
  return { P, D, Disc, msgs, globalRule };
}

// ══════════════════════════════════════════════════════════════
//  5. UI 核心组件
// ══════════════════════════════════════════════════════════════

// 意见与反馈 Modal
function OpinionsFeedbackModal({ onClose, WeChatQRCodeSrc }) {
  return (
    <div className="feedback-overlay">
      <div className="feedback-modal">
        <h3>意见与反馈</h3>
        <p>感谢您的支持！我们的游戏还在Beta 0.2.1开发阶段。</p>
        <p>如果您遇到 Bug 或有好的建议，欢迎反馈：</p>
        <div className="contact-methods">
          <p><strong>QQ催更群：</strong> 12345678</p>
          <p><strong>微信催更群：</strong></p>
          {WeChatQRCodeSrc && (
            <img src={WeChatQRCodeSrc} alt="WeChat Group QR Code" className="wechat-qr-code" />
          )}
        </div>
        <button onClick={onClose}>关闭</button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  6. 主游戏应用
// ══════════════════════════════════════════════════════════════

function DungeonDraw() {
  const { switchMusic, playOpenSound, playCloseSound } = useGameAudio();
  const [page, setPage] = useState('start');
  const [isSimpleMode, setIsSimpleMode] = useState(false);
  const [matchStatus, setMatchStatus] = useState(null);
  const [gs, setGs] = useState(null);
  const [currentMode, setCurrentMode] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const playerBoxRef = useRef(null); // 用于死亡破碎特效

  // 邪祀者胜利特效状态
  const [showCultistVictoryAnim, setShowCultistVictoryAnim] = useState(false);
  const [victoryCultist, setVictoryCultist] = useState(null);

  // 初始化音乐
  useEffect(() => {
    switchMusic(page !== 'start');
  }, [page, switchMusic]);

  // 寻找玩家
  const findMatch = () => {
    playOpenSound();
    setMatchStatus('searching');
    setTimeout(() => {
      setMatchStatus('found');
      setTimeout(() => {
        const roles = ['寻宝者', '寻宝者', '追猎者', '邪祀者'].sort(() => Math.random() - 0.5);
        const players = Array.from({ length: 4 }).map((_, i) => ({
          id: i, name: i === 0 ? "你 (调查员)" : `探险者 ${i}`,
          hp: 6, san: 6, role: roles[i], hand: [],
          isDead: false, roleRevealed: false, isAI: i !== 0,
          handRevealed: false
        }));
        setGs({
          players, deck: generateFixedDeck(), discard: [], log: ['探索开始...'],
          currentTurn: 0, phase: 'ACTION', drawReveal: null, settlement: null, globalEffect: null
        });
        setPage('game');
        setMatchStatus(null);
      }, 1000);
    }, 2000);
  };

  // 核心回合逻辑
  const handleDraw = () => {
    playOpenSound();
    if (gs.phase !== 'ACTION') return;
    let D = [...gs.deck], Disc = [...gs.discard];
    if (!D.length) { D = shuffle(Disc); Disc = []; }
    const drawn = D.shift();
    setGs({ ...gs, deck: D, discard: Disc, drawReveal: { card: drawn }, phase: 'ZONE_CHOICE' });
  };

  // 代价抉择
  const handleZoneAccept = (withGodFromHand = false) => {
    playOpenSound();
    const ci = gs.currentTurn;
    const drawn = gs.drawReveal.card;
    let P = copyPlayers(gs.players), D = [...gs.deck], Disc = [...gs.discard];
    let L = [...gs.log, `${P[ci].name} 收下了 [${drawn.key}] · ${drawn.name}`];
    
    // 如果是克苏鲁信仰，且手里有神牌，则强制接受效果
    const forceAccept = isSimpleMode && P[ci].godName === 'CTH' && P[ci].hand.some(c => c.isGod && c.godKey === 'CTH');
    
    if (drawn.isGod) {
       P[ci].godZone.push(drawn); P[ci].godName = drawn.godKey;
       setGs({ ...gs, players: P, deck: D, discard: Disc, log: L, phase: 'ACTION', drawReveal: null });
    } else {
       const res = applyCardFx(drawn, ci, null, P, D, Disc);
       P = res.P; Disc = res.Disc; L = [...L, ...res.msgs];
       P[ci].hand.push(drawn);
       if (isWinHand(P[ci].hand)) {
          completeGame({ ...gs, players: P, log: L, settlement: { winner: P[ci], reason: `${P[ci].name} 集齐了全部编号和字母！` }, phase: 'SETTLEMENT', drawReveal: null });
          return;
       }
       nextTurn({ ...gs, players: P, deck: D, discard: Disc, log: L, phase: 'ACTION', drawReveal: null, globalEffect: res.globalRule || gs.globalEffect });
    }
  };

  const handleZoneDiscard = () => {
    playCloseSound();
    const card = gs.drawReveal.card;
    setGs({ ...gs, discard: [...gs.discard, card], log: [...gs.log, `${gs.players[gs.currentTurn].name} 弃置了 [${card.key}]`], phase: 'ACTION', drawReveal: null });
    nextTurn({ ...gs });
  };

  const nextTurn = (newGs) => {
    let nt = (newGs.currentTurn + 1) % 4;
    while (newGs.players[nt].isDead) nt = (nt + 1) % 4;
    
    const living = newGs.players.filter(p => !p.isDead);
    if (living.length === 1 && living[0].role !== '邪祀者') {
       completeGame({ ...newGs, settlement: { winner: living[0], reason: `其他玩家全灭，寻宝者 ${living[0].name} 获胜！` }, phase: 'SETTLEMENT' });
       return;
    }

    setGs({ ...newGs, currentTurn: nt, isMP: currentMode === 'online' });
  };

  const completeGame = (newGs) => {
    const winner = newGs.settlement.winner;
    if (winner.role === '邪祀者') {
      setVictoryCultist(winner);
      setShowCultistVictoryAnim(true);
      setTimeout(() => {
        setShowCultistVictoryAnim(false);
        setGs(newGs);
      }, 5000); // 展示邪祀胜利特效5秒
    } else {
      setGs(newGs);
    }
  };

  // AI & 超时逻辑
  useEffect(() => {
    if (!gs || gs.phase === 'SETTLEMENT' || showCultistVictoryAnim) return;
    const curr = gs.players[gs.currentTurn];
    const timer = setTimeout(() => {
      if (gs.phase === 'ACTION' && curr.isAI) {
        handleDraw();
      } else if (gs.phase === 'ZONE_CHOICE') {
        if (!curr.hand.some(c => !c.isGod)) handleZoneDiscard(); // 手牌全无则被迫弃置
        else handleZoneAccept();
      }
    }, 1300);
    return () => clearTimeout(timer);
  }, [gs?.currentTurn, gs?.phase, isSimpleMode, showCultistVictoryAnim]);

  // ══════════════════════════════════════════════════════════════
  //  7. 渲染
  // ══════════════════════════════════════════════════════════════

  if (page === 'start') {
    return (
      <div className="start-page">
        <h1>Dungeon Draw: 深渊探险</h1>
        <div className="main-options">
          <button onClick={findMatch} style={matchStatus ? { opacity: 0.5 } : {}}>{matchStatus === 'searching' ? "正在深渊排队..." : "单人探索"}</button>
          <button onClick={() => { playOpenSound(); setCurrentMode('online'); setPage('matchmaking'); }}>线上排队 (Beta)</button>
        </div>
        <div className="main-bottom">
          <label><input type="checkbox" checked={isSimpleMode} onChange={() => setIsSimpleMode(!isSimpleMode)} /> 简化克苏鲁信仰体系</label>
          <button onClick={() => { playOpenSound(); setShowFeedback(true); }}>意见与反馈</button>
        </div>
        {matchStatus === 'found' && <div className="match-found-overlay">找到调查员！正在进入深渊...</div>}
        {showFeedback && <OpinionsFeedbackModal onClose={() => { playCloseSound(); setShowFeedback(false); }} WeChatQRCodeSrc="QRCode.jpg" />}
      </div>
    );
  }

  if (page === 'matchmaking') { /* 线上排队 UI */ return <div>线上排队中... <button onClick={() => setPage('start')}>取消</button></div>; }

  // 结算画面
  if (gs?.settlement) {
    const winner = gs.settlement.winner;
    return (
      <div className="settlement-overlay">
        <div className="settlement-modal">
          <h1>游戏结束</h1>
          <p className="win-reason">{gs.settlement.reason}</p>
          <div className="winner-announcement">
             获胜阵营: {winner.role} - 调查员: {winner.name}
          </div>
          <div className="all-hands">
            {gs.players.map(p => (
              <div key={p.id} className="player-final">
                <p><strong>{p.name}</strong> ({p.role}, {p.isDead ? "☠️倒下" : "HP:" + p.hp}):</p>
                <div className="final-hand">
                   {p.hand.map(c => <span key={c.id} style={{ color: GOD_DEFS[c.godKey]?.color || CS[c.letter]?.border }}>[{c.key}]</span>)}
                </div>
              </div>
            ))}
          </div>
          <button onClick={() => { playOpenSound(); setGs(null); setPage('start'); }}>回到开始页面</button>
        </div>
      </div>
    );
  }

  // 主游戏画面渲染 (Codex 修改版本)
  return (
    <div className={`game-page ${isSimpleMode ? 'cthulhu-theme' : ''}`}>
      <div className="player-area-top">
        {gs.players.filter(p => p.id !== 0).map(p => (
          <div key={p.id} className={`player-box ${p.id === gs.currentTurn ? 'active-turn' : ''} ${p.isDead ? 'player-dead' : ''}`}>
             <div className="hp-san-bar">
                <span style={{ color: '#ff4d4d' }}>HP: {p.hp}</span>
                <span style={{ color: '#7adef9' }}>SAN: {p.san}</span>
                {p.godName && <span style={{ color: GOD_DEFS[p.godName].color, textShadow: `0 0 5px ${GOD_DEFS[p.godName].color}` }}>★</span>}
                {p.id !== 0 && (p.isDead || p.roleRevealed) && <span className="dead-role-reveal">（{p.role}）</span>}
             </div>
             <p className="ai-name">{p.name} {p.isAI ? '(AI)' : ''}</p>
          </div>
        ))}
      </div>

      <div className="central-log">
        {gs.log.slice(-6).map((l, i) => <div key={i}>{l}</div>)}
      </div>

      {/* 你的区域（Codex修正UI布局） */}
      <div className="your-area">
        <div ref={playerBoxRef} className={`your-box ${gs.currentTurn === 0 ? 'active-turn' : ''} ${gs.players[0].isDead ? 'player-dead' : ''}`}>
          <p className="your-name">{gs.players[0].name}</p>
          <p className="your-role">你是：{gs.players[0].role}</p>
          <div className="your-hp-san">HP: {gs.players[0].hp} | SAN: {gs.players[0].san}</div>
        </div>
        <div className="your-hand-display">
          <p style={{ fontSize: 12, color: '#ccc', marginBottom: 5 }}>你的深渊手牌 (凑齐A/B/C/D和1/2/3/4获胜):</p>
          <div className="hand-items">
             {gs.players[0].hand.map(c => (
              <span key={c.id} className="hand-card" style={{ color: GOD_DEFS[c.godKey]?.color || CS[c.letter]?.border }}>
                 [{c.key}] {gs.players[0].roleRevealed ? `· ${c.name}` : ''}
              </span>
             ))}
          </div>
        </div>
      </div>

      {/* 摸牌与技能面板 */}
      {gs.currentTurn === 0 && gs.phase === 'ACTION' && !gs.players[0].isDead && (
        <div className="actions-overlay">
          <button onClick={handleDraw} className="action-btn-draw">区域探寻 (摸牌)</button>
          <button className="action-btn-ability">使用技能</button>
        </div>
      )}

      {/* 区域牌代价抉择提示弹窗 */}
      {gs.phase === 'ZONE_CHOICE' && gs.drawReveal && (
        <div className="modal-overlay">
          <div className="modal-content">
             <h2>探索发现: {gs.drawReveal.card.key} · {gs.drawReveal.card.name}</h2>
             <p>{gs.drawReveal.card.desc}</p>
             {gs.currentTurn === 0 ? (
               <div className="actions-overlay">
                 <button onClick={handleZoneAccept} className="action-btn-draw">收下，承受代价</button>
                 <button onClick={handleZoneDiscard} className="action-btn-ability">弃置牌 (无代价)</button>
               </div>
             ) : (
               <div style={{ fontStyle: 'italic', color: '#666' }}>探险者 {gs.currentTurn} 正在抉择深渊的力量...</div>
             )}
          </div>
        </div>
      )}

      {/* 死亡破碎炸裂特效 */}
      {gs.players.filter(p => p.hp <= 0 && !p.deathAnimationTriggered).map(p => {
         p.deathAnimationTriggered = true; // 标记防止重复触发
         return <CharacterBreakingAnim key={p.id} playerBoxRef={p.id === 0 ? playerBoxRef : { current: null }} />
      })}

      {/* 邪祀者胜利特效 */}
      {showCultistVictoryAnim && <CultistVictoryAnim winner={victoryCultist} />}
    </div>
  );
}

export default DungeonDraw;
