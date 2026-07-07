import { buildPublicUrl } from '../../utils/url';
import { getCardFlavorText } from '../../constants/cardFlavorText';

// Canonical card-face box used by card backs, flip animation, and hit-testing.
// High-resolution face-frame art may use a different pixel size, but it is
// fitted into this logical box so front/back faces stay the same size.
export const CARD_FACE_WIDTH = 392;
export const CARD_FACE_HEIGHT = 590;
export const CARD_FACE_RATIO = CARD_FACE_HEIGHT / CARD_FACE_WIDTH;

export const CARD_FACE_BACKGROUND_FILES = [
  '/img/card/cardbg_zone.webp',
  '/img/card/cardbg_god.webp',
];

const ZONE_ILLUSTRATION_FILE_BY_NAME = {
  '坠落': 'fall',
  '解读石刻': 'decipher_stone_carving',
  '霉变食物': 'moldy_food',
  '腐臭': 'stench',
  '神圣菇肉': 'teonanácatl',
  '蚂蚁虽小': 'though_ants_are_small',
  '遭遇塌方': 'collapse',
  '亡者军团': 'legion_of_the_dead',
  '吃下荧光苔藓': 'swallow_fluorescent_mosses',
  '目击尸体': 'witness_corpse',
  '磷火': 'will_o_wisp',
  '无尽通道': 'endless_corridor',
  '可生食木乃伊': 'raw_mummy',
  '绮丽诗篇': 'gorgeous_poem',
  '邪恶壁画': 'evil_mural',
  '空谷传音': 'echoing_valley',
  '掘墓': 'grave_digging',
  '活埋': 'buried_alive',
  '圣甲虫': 'scarab',
  '忏悔独白': 'confessional_monologue',
  '生命天平': 'life_balance',
  '幽闭恐惧': 'claustrophobia',
  '增殖的Z': 'proliferating_z',
  '新鲜空气': 'fresh_air',
  '黑泥沼': 'black_mire',
  '地动山摇': 'earthquake',
  '投掷石块': 'throw_stone',
  '逆流': 'reverse_current',
  '猎获穴兽': 'hunted_cave_beast',
  '封入石棺': 'sealed_sarcophagus',
  '窒息矿坑': 'suffocating_mine',
  '地刺陷阱': 'spike_trap',
  '落井下石': 'kicking_down_the_well',
  '两人一绳': 'two_on_one_rope',
  '关键拼图': 'key_puzzle',
  '宝箱怪': 'mimic_chest',
  '灵魂天平': 'soul_balance',
  '活火山': 'active_volcano',
  '烤盲鱼': 'grilled_blind_fish',
  '石化配方': 'petrifying_formula',
  '地下泉': 'underground_spring',
  '目击食人族': 'witness_cannibals',
  '惊扰蝙蝠': 'startled_bats',
  '地磁反转': 'geomagnetic_reversal',
  '反转复原': 'geomagnetic_reversal',
  '龙之心': 'dragon_heart',
  '引燃火把': 'ignite_torch',
  '地底天空': 'underground_sky',
  '触底反弹': 'bottom_bounce',
  '半物质化': 'semimaterialization',
  '夜风呼啸': 'night_wind',
  '秤心仪式': 'weighing_of_heart',
  '活死人哨兵': 'undead_sentinel',
  '钻地魔虫': 'burrowing_worm',
  '穴居人战争': 'cave_dweller_war',
  '荆棘山路': 'thorny_mountain_road',
  '群蛇陷阱': 'snake_trap',
  '火中取栗': 'chestnut_from_fire',
  '灵龟卜祝': 'turtle_divination',
  '先到先得': 'first_come_first_served',
  '玫瑰倒刺': 'rose_thorns',
  '鼠群': 'rat_swarm',
  '偷吃龙蛋': 'stealing_dragon_egg',
  '白化生物': 'albino_creature',
  '狂化': 'berserk',
  '扭伤': 'sprain',
  '同归深渊': 'same_abyss',
  '鲜红夜宴': 'crimson_night_banquet',
  '斯芬克斯': 'sphinx',
};

const CARD_FACE_META_BY_ID = {
  zone: Object.fromEntries(
    Object.entries(ZONE_ILLUSTRATION_FILE_BY_NAME).map(([name, file]) => [
      name,
      {
        match: card => card?.name === name,
        illustration: `/img/card/illustration/${file}.webp`,
      },
    ])
  ),
  god: Object.fromEntries(
    [
      'APO',
      'CTH',
      'DIX',
      'GOR',
      'HAS',
      'KTH',
      'NYA',
      'ORO',
      'SHU',
      'TRA',
      'TSG',
      'VAN',
      'VRI',
      'XUA',
      'ZHU',
    ].map(godKey => [
      godKey,
      {
        illustration: `/img/card/illustration/${godKey.toLowerCase()}.webp`,
      },
    ])
  ),
};

export const CARD_FACE_ILLUSTRATION_FILES = [
  ...Object.values(CARD_FACE_META_BY_ID.zone).map(meta => meta.illustration),
  ...Object.values(CARD_FACE_META_BY_ID.god).map(meta => meta.illustration),
].filter(Boolean);

const decodedIllustrations = new Set();
const pendingIllustrations = new Map();
let idleDownloadScheduled = false;

function runWhenIdle(task) {
  if (typeof window === 'undefined') return;
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(task, { timeout: 3000 });
    return;
  }
  window.setTimeout(task, 0);
}

export function getCardFaceMeta(card) {
  const flavor = getCardFlavorText(card);
  if (card?.isGod) {
    const meta = CARD_FACE_META_BY_ID.god[card?.godKey] || null;
    if (!meta && !flavor) return null;
    return { ...(meta || {}), flavor };
  }
  const meta = Object.values(CARD_FACE_META_BY_ID.zone).find(item => item.match(card)) || null;
  if (!meta && !flavor) return null;
  return { ...(meta || {}), flavor };
}

export function isCardIllustrationReady(path) {
  return !!path && typeof window !== 'undefined' && decodedIllustrations.has(buildPublicUrl(path));
}

export function loadCardIllustration(path) {
  if (!path || typeof window === 'undefined') return Promise.resolve(false);
  const url = buildPublicUrl(path);
  if (decodedIllustrations.has(url)) return Promise.resolve(true);
  if (pendingIllustrations.has(url)) return pendingIllustrations.get(url);
  const promise = new Promise(resolve => {
    const img = new Image();
    img.onload = async () => {
      try {
        if (img.decode) await img.decode();
      } catch {
        // The image can still be painted if decode rejects after load.
      }
      decodedIllustrations.add(url);
      pendingIllustrations.delete(url);
      resolve(true);
    };
    img.onerror = () => {
      pendingIllustrations.delete(url);
      resolve(false);
    };
    img.src = url;
  });
  pendingIllustrations.set(url, promise);
  return promise;
}

export function scheduleCardIllustrationIdleDownload(paths = CARD_FACE_ILLUSTRATION_FILES) {
  if (idleDownloadScheduled || typeof window === 'undefined') return;
  idleDownloadScheduled = true;
  runWhenIdle(async () => {
    for (const path of paths) {
      await loadCardIllustration(path);
    }
  });
}
