// ══════════════════════════════════════════════════════════════
//  DATA
// ══════════════════════════════════════════════════════════════
// ── DECK BALANCE ──────────────────────────────────────────────────────────────
// Copy counts: 3× every card → 48 total. Perfect letter+number symmetry.

// Math: E[HP per HP-affecting card drawn] = −68/32 ≈ −2  (target: −2)
//   Heal contribution: 2×(+2+1+5+3) = +22
//   Damage contribution: 6×(−2−1−8−4) = −90   [C2 hits 4 others = −8; D2 hits 1 = −4]
// ──────────────────────────────────────────────────────────────────────────────
const FIXED_ZONE_CARD_VARIANTS_BY_KEY = {
  "A1": [
    {
      "name": "偷吃龙蛋",
      "desc": "你回复2HP，相邻角色各失去2HP",
      "type": "selfHealAdjDamageHP",
      "val": 2,
      "slotKey": "A1",
      "polarity": "positive",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "坠落",
      "desc": "你失去3HP，随机弃1张牌（强制触发）",
      "type": "selfDamageDiscardHP",
      "val": 3,
      "forced": true,
      "slotKey": "A1",
      "polarity": "negative",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "斯芬克斯",
      "desc": "猜测牌堆顶的牌是否是区域牌。若猜对，则收入这张牌。若猜错，失去3HP",
      "type": "sphinxGuess",
      "slotKey": "A1",
      "polarity": "positive",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "腐臭",
      "desc": "你与相邻角色失去1HP",
      "type": "adjDamageHP",
      "val": 1,
      "slotKey": "A1",
      "polarity": "negative",
      "effectScope": "adjacent",
      "expansion": "析骨为柴"
    }
  ],
  "A2": [
    {
      "name": "蚂蚁虽小",
      "desc": "你回复1HP",
      "type": "selfHealHP",
      "val": 1,
      "slotKey": "A2",
      "polarity": "positive",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "遭遇塌方",
      "desc": "你失去3HP并翻面（切换休息状态）",
      "type": "selfDamageRestHP",
      "val": 3,
      "slotKey": "A2",
      "polarity": "negative",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "亡者军团",
      "desc": "你与相邻角色失去3HP",
      "type": "adjDamageHP",
      "val": 3,
      "slotKey": "A2",
      "polarity": "negative",
      "effectScope": "adjacent",
      "expansion": "地神的潜影"
    }
  ],
  "A3": [
    {
      "name": "吃下荧光苔藓",
      "desc": "HP回满，手牌全局公开，盲抽变挑选",
      "type": "selfRevealHandHP",
      "val": 10,
      "slotKey": "A3",
      "polarity": "positive",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "目击尸体",
      "desc": "你失去1SAN，若你当前SAN≥8则额外失去2SAN",
      "type": "selfDamageSANCond",
      "val": 1,
      "bonus": 2,
      "condType": "sanHigh",
      "condVal": 8,
      "slotKey": "A3",
      "polarity": "negative",
      "effectScope": "self",
      "expansion": "析骨为柴"
    },
    {
      "name": "磷火",
      "desc": "你与相邻角色失去1SAN",
      "type": "adjDamageSAN",
      "val": 1,
      "slotKey": "A3",
      "polarity": "negative",
      "effectScope": "adjacent",
      "expansion": "析骨为柴"
    }
  ],
  "A4": [
    {
      "name": "绮丽诗篇",
      "desc": "直到下回合，所有人技能变为“掉包”",
      "type": "globalOnlySwap",
      "val": 0,
      "slotKey": "A4",
      "polarity": "neutral",
      "effectScope": "target",
      "expansion": "先贤的馈赠"
    },
    {
      "name": "邪恶壁画",
      "desc": "你失去3SAN",
      "type": "selfDamageSAN",
      "val": 3,
      "slotKey": "A4",
      "polarity": "negative",
      "effectScope": "self",
      "expansion": "先贤的馈赠"
    },
    {
      "name": "空谷传音",
      "desc": "全体角色失去1SAN",
      "type": "allDamageSAN",
      "val": 1,
      "slotKey": "A4",
      "polarity": "negative",
      "effectScope": "all",
      "expansion": "地神的潜影"
    }
  ],
  "B1": [
    {
      "name": "圣甲虫",
      "desc": "你回复1SAN",
      "type": "selfHealSAN",
      "val": 1,
      "slotKey": "B1",
      "polarity": "positive",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "忏悔独白",
      "desc": "若信仰邪神则放弃信仰",
      "type": "selfRenounceGod",
      "val": 1,
      "slotKey": "B1",
      "polarity": "negative",
      "effectScope": "self",
      "expansion": "先贤的馈赠"
    },
    {
      "name": "幽闭恐惧",
      "desc": "你与相邻角色失去2SAN",
      "type": "adjDamageSAN",
      "val": 2,
      "slotKey": "B1",
      "polarity": "negative",
      "effectScope": "adjacent",
      "expansion": "地神的潜影"
    }
  ],
  "B2": [
    {
      "name": "新鲜空气",
      "desc": "你回复2HP",
      "type": "selfHealHP",
      "val": 2,
      "slotKey": "B2",
      "polarity": "positive",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "黑泥沼",
      "desc": "你失去2SAN并翻面（切换休息状态）",
      "type": "selfDamageRestSAN",
      "val": 2,
      "slotKey": "B2",
      "polarity": "negative",
      "effectScope": "self",
      "expansion": "群星呼唤"
    },
    {
      "name": "地动山摇",
      "desc": "全体角色各随机弃1张牌（强制触发）",
      "type": "allDiscard",
      "val": 1,
      "forced": true,
      "slotKey": "B2",
      "polarity": "negative",
      "effectScope": "all",
      "expansion": "地神的潜影"
    },
    {
      "name": "逆流",
      "desc": "本回合结束时，若回合轮换方向是顺时针，则改为逆时针，反之亦然",
      "type": "reverseTurnOrder",
      "val": 0,
      "slotKey": "B2",
      "polarity": "neutral",
      "effectScope": "self",
      "expansion": "群星呼唤"
    }
  ],
  "B3": [
    {
      "name": "猎获穴兽",
      "desc": "你恢复3HP，相邻角色各恢复1HP",
      "type": "selfHealAdjHealHP",
      "val": 3,
      "adjVal": 1,
      "slotKey": "B3",
      "polarity": "positive",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "石棺",
      "desc": "你失去2HP与1SAN",
      "type": "selfDamageHPSAN",
      "hpVal": 2,
      "sanVal": 1,
      "slotKey": "B3",
      "polarity": "negative",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "窒息矿坑",
      "desc": "你与相邻角色翻面（切换休息状态）",
      "type": "adjRest",
      "val": 0,
      "slotKey": "B3",
      "polarity": "negative",
      "effectScope": "adjacent",
      "expansion": "地神的潜影"
    }
  ],
  "B4": [
    {
      "name": "地刺陷阱",
      "desc": "你失去2HP，相邻角色各失去1HP",
      "type": "selfDamageAdjDamageHP",
      "val": 2,
      "slotKey": "B4",
      "polarity": "negative",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "落井下石",
      "desc": "你失去2HP，若你当前HP≤5则额外失去2HP",
      "type": "selfDamageHPCond",
      "val": 2,
      "bonus": 2,
      "condType": "hpLow",
      "condVal": 5,
      "slotKey": "B4",
      "polarity": "negative",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "两人一绳",
      "desc": "你和另一名角色间拉起救生索，任意一方受伤时绳索断裂，双方各失去3HP。如果到你的下个回合绳索未断裂，各回复4HP",
      "type": "damageLink",
      "val": 1,
      "polarity": "neutral",
      "effectScope": "target",
      "slotKey": "B4",
      "expansion": "地神的潜影"
    }
  ],
  "C1": [
    {
      "name": "关键拼图",
      "desc": "你的角色上放一张空白区域牌，手牌不大于3张时将它收入手牌",
      "type": "placeBlankZone",
      "val": 1,
      "slotKey": "C1",
      "polarity": "positive",
      "effectScope": "self",
      "expansion": "先贤的馈赠"
    },
    {
      "name": "宝箱怪",
      "desc": "你失去2HP与2SAN",
      "type": "selfDamageHPSAN",
      "hpVal": 2,
      "sanVal": 2,
      "slotKey": "C1",
      "polarity": "negative",
      "effectScope": "self",
      "expansion": "先贤的馈赠"
    },
    {
      "name": "活火山",
      "desc": "全体角色失去3HP",
      "type": "allDamageHP",
      "val": 3,
      "slotKey": "C1",
      "polarity": "negative",
      "effectScope": "all",
      "expansion": "地神的潜影"
    }
  ],
  "C2": [
    {
      "name": "地下泉",
      "desc": "你回复3HP",
      "type": "selfHealHP",
      "val": 3,
      "slotKey": "C2",
      "polarity": "positive",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "目击食人族",
      "desc": "你失去3HP与1SAN",
      "type": "selfDamageHPSAN",
      "hpVal": 3,
      "sanVal": 1,
      "slotKey": "C2",
      "polarity": "negative",
      "effectScope": "self",
      "expansion": "析骨为柴"
    },
    {
      "name": "惊扰蝙蝠",
      "desc": "你与相邻角色各失去2HP",
      "type": "adjDamageHP",
      "val": 2,
      "slotKey": "C2",
      "polarity": "negative",
      "effectScope": "adjacent",
      "expansion": "地神的潜影"
    }
  ],
  "C3": [
    {
      "name": "龙之心",
      "desc": "你回复1HP与1SAN",
      "type": "selfHealBoth",
      "val": 1,
      "slotKey": "C3",
      "polarity": "positive",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "行囊破裂",
      "desc": "你失去2SAN，随机弃1张牌（强制触发）",
      "type": "selfDamageDiscardSAN",
      "val": 2,
      "forced": true,
      "slotKey": "C3",
      "polarity": "negative",
      "effectScope": "self",
      "expansion": "temporary"
    },
    {
      "name": "瘟疫蔓延",
      "desc": "你与相邻角色失去2HP和1SAN",
      "type": "adjDamageBoth",
      "hpVal": 2,
      "sanVal": 1,
      "slotKey": "C3",
      "polarity": "negative",
      "effectScope": "adjacent",
      "expansion": "temporary"
    }
  ],
  "C4": [
    {
      "name": "触底反弹",
      "desc": "选择一名角色，与其交换全部手牌",
      "type": "swapAllHands",
      "val": 0,
      "slotKey": "C4",
      "polarity": "neutral",
      "effectScope": "target",
      "expansion": "地神的潜影"
    },
    {
      "name": "恶毒诅咒",
      "desc": "你失去2HP与2SAN",
      "type": "selfDamageHPSAN",
      "hpVal": 2,
      "sanVal": 2,
      "slotKey": "C4",
      "polarity": "negative",
      "effectScope": "self",
      "expansion": "temporary"
    },
    {
      "name": "末日预兆",
      "desc": "全体角色失去1HP和1SAN",
      "type": "allDamageBoth",
      "val": 1,
      "slotKey": "C4",
      "polarity": "negative",
      "effectScope": "all",
      "expansion": "temporary"
    }
  ],
  "D1": [
    {
      "name": "秤心仪式",
      "desc": "你失去3HP，回复2SAN（若你本局未信仰过邪神，只执行后半句效果）",
      "type": "sacHealSelfSANCultist",
      "val": 2,
      "slotKey": "D1",
      "polarity": "neutral",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "致命尖刺",
      "desc": "你失去2HP，若你手牌数≥4则额外失去2HP",
      "type": "selfDamageHPCond",
      "val": 2,
      "bonus": 2,
      "condType": "handHigh",
      "condVal": 4,
      "slotKey": "D1",
      "polarity": "negative",
      "effectScope": "self",
      "expansion": "temporary"
    },
    {
      "name": "钻地魔虫",
      "desc": "全体角色失去1HP，随机一名角色再失去1HP",
      "type": "allDamageHPRandomExtra",
      "val": 1,
      "slotKey": "D1",
      "polarity": "negative",
      "effectScope": "all",
      "expansion": "地神的潜影"
    }
  ],
  "D2": [
    {
      "name": "穴居人战争",
      "desc": "你与另一名角色各亮一张手牌，数字编号更大的一方收下这两张牌",
      "type": "caveDuel",
      "val": 0,
      "slotKey": "D2",
      "polarity": "neutral",
      "effectScope": "target",
      "expansion": "地神的潜影"
    },
    {
      "name": "恐怖直视",
      "desc": "你失去1SAN，若你手牌数≤2则额外失去2SAN",
      "type": "selfDamageSANCond",
      "val": 1,
      "bonus": 2,
      "condType": "handLow",
      "condVal": 2,
      "slotKey": "D2",
      "polarity": "negative",
      "effectScope": "self",
      "expansion": "temporary"
    },
    {
      "name": "火中取栗",
      "desc": "你失去3HP，选一名角色偷看其一张手牌",
      "type": "selfDamageHPPeek",
      "val": 3,
      "slotKey": "D2",
      "polarity": "negative",
      "effectScope": "all",
      "expansion": "析骨为柴"
    }
  ],
  "D3": [
    {
      "name": "灵龟卜祝",
      "desc": "展示牌堆顶的4张牌，然后选择你手中最多的一个字母或数字编号，将这4张牌中该编号的牌收入手牌（不触发效果）",
      "type": "revealTopCards",
      "val": 4,
      "slotKey": "D3",
      "polarity": "positive",
      "effectScope": "self",
      "expansion": "析骨为柴"
    },
    {
      "name": "先到先得",
      "desc": "从牌堆翻开等同于存活人数的牌，从你开始每人挑一张收入手牌（不触发效果）",
      "type": "firstComePick",
      "val": 0,
      "slotKey": "D3",
      "polarity": "positive",
      "effectScope": "self",
      "expansion": "先贤的馈赠"
    },
    {
      "name": "玫瑰倒刺",
      "desc": "将你的所有手牌送给另一名角色并标记。此角色失去其中任意一张牌时HP-2",
      "type": "roseThornGiftAllHand",
      "val": 0,
      "slotKey": "D3",
      "polarity": "neutral",
      "effectScope": "target",
      "expansion": "先贤的馈赠"
    }
  ],
  "D4": [
    {
      "name": "狂化",
      "desc": "你失去1SAN，直到回合结束，你造成的伤害+1",
      "type": "selfBerserk",
      "val": 1,
      "slotKey": "D4",
      "polarity": "neutral",
      "effectScope": "self",
      "expansion": "析骨为柴"
    },
    {
      "name": "扭伤",
      "desc": "你失去1HP，下回合开始时你不能摸牌（强制触发）",
      "type": "selfDamageSkipDraw",
      "val": 1,
      "forced": true,
      "slotKey": "D4",
      "polarity": "negative",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "同归深渊",
      "desc": "你失去2HP，场上手牌最多的一位角色须选择：将手牌弃至与你数量相等，或者失去4HP",
      "type": "sameAbyssChoice",
      "hpVal": 2,
      "slotKey": "D4",
      "polarity": "negative",
      "effectScope": "all",
      "expansion": "地神的潜影"
    },
    {
      "name": "鲜红夜宴",
      "desc": "所有人回复2HP，失去2SAN",
      "type": "allHealHPDamageSAN",
      "hpVal": 2,
      "sanVal": 2,
      "slotKey": "D4",
      "polarity": "neutral",
      "effectScope": "all",
      "expansion": "析骨为柴"
    }
  ]
};
const LETTERS=['A','B','C','D'], NUMS=[1,2,3,4];
// Aged-manuscript card style per letter
const CS={
  A:{bg:'#100d1a',border:'#3a2a6a',borderBright:'#6050a0',text:'#b0a0e8',glow:'#3a2a6a'},
  B:{bg:'#0a120a',border:'#1e4a1e',borderBright:'#3a7a3a',text:'#80d080',glow:'#1e4a1e'},
  C:{bg:'#18120a',border:'#5a3a10',borderBright:'#8a6020',text:'#d4a840',glow:'#5a3a10'},
  D:{bg:'#160a0a',border:'#6a1818',borderBright:'#a02828',text:'#e07070',glow:'#6a1818'},
};
const GOD_CS={bg:'#080818',border:'#3a1a5a',borderBright:'#7040aa',text:'#cc99ff',glow:'#4a1a8a'};
// ── GOD CARD DATA ─────────────────────────────────────────────
const GOD_DEFS={
  NYA:{
    godKey:'NYA',name:'伏行之混沌',subtitle:'奈亚拉托提普之化身',power:'千人千貌',
    col:'#b03030',bgCol:'#200808',
    levels:[
      {handPenalty:2,desc:'借用已死角色身份，本回合技能与胜利条件均变为该身份（手牌上限-2）'},
      {handPenalty:1,desc:'借用已死角色身份，本回合技能与胜利条件均变为该身份（手牌上限-1）'},
      {handPenalty:0,desc:'借用已死角色身份，本回合技能与胜利条件均变为该身份'},
    ],
  },
  CTH:{
    godKey:'CTH',name:'拉莱耶之主',subtitle:'克苏鲁之化身',power:'梦访拉莱耶',
    col:'#2060c0',bgCol:'#080820',
    levels:[
      {extraDraws:1,desc:'在角色翻面状态下结束或跳过回合时，立即摸1张牌'},
      {extraDraws:2,desc:'在角色翻面状态下结束或跳过回合时，立即摸2张牌'},
      {extraDraws:3,desc:'在角色翻面状态下结束或跳过回合时，立即摸3张牌'},
    ],
  },
  SHU:{
    godKey:'SHU',name:'森之领主',subtitle:'莎布·尼古拉丝之化身',power:'黑暗子嗣',
    col:'#2a5a20',bgCol:'#081008',
    levels:[
      {offspringCount:1,desc:'获得此邪神之力时，指定一名角色（可以为自己），立即在其手牌中加入1张"黑山羊幼仔"'},
      {offspringCount:2,desc:'获得此邪神之力时，指定一名角色（可以为自己），立即在其手牌中加入2张"黑山羊幼仔"'},
      {offspringCount:3,desc:'获得此邪神之力时，指定一名角色（可以为自己），立即在其手牌中加入3张"黑山羊幼仔"'},
    ],
  },
  ZHU:{
    godKey:'ZHU',name:'烛九阴',subtitle:'钟山之神',power:'衔烛照幽',
    col:'#c0a020',bgCol:'#181008',
    levels:[
      {desc:'效果待设计'},
      {desc:'效果待设计'},
      {desc:'效果待设计'},
    ],
  },
  FUL:{
    godKey:'FUL',name:'弗栗多',subtitle:'阿修罗之龙',power:'禁锢甘霖',
    col:'#2080a0',bgCol:'#081018',
    levels:[
      {desc:'效果待设计'},
      {desc:'效果待设计'},
      {desc:'效果待设计'},
    ],
  },
  APO:{
    godKey:'APO',name:'阿波菲斯',subtitle:'混沌巨蛇',power:'噬日灭世',
    col:'#8020a0',bgCol:'#100818',
    levels:[
      {desc:'效果待设计'},
      {desc:'效果待设计'},
      {desc:'效果待设计'},
    ],
  },
  GEE:{
    godKey:'GEE',name:'戈耳工',subtitle:'石化之视',power:'美杜莎之瞳',
    col:'#608020',bgCol:'#0a1008',
    levels:[
      {desc:'效果待设计'},
      {desc:'效果待设计'},
      {desc:'效果待设计'},
    ],
  },
  XUA:{
    godKey:'XUA',name:'轩辕坟三妖',subtitle:'女娲座下',power:'惑乱殷商',
    col:'#a04080',bgCol:'#180810',
    levels:[
      {desc:'效果待设计'},
      {desc:'效果待设计'},
      {desc:'效果待设计'},
    ],
  },
  BAQ:{
    godKey:'BAQ',name:'八岐大蛇',subtitle:'祸津日神',power:'八山八海',
    col:'#a06020',bgCol:'#181008',
    levels:[
      {desc:'效果待设计'},
      {desc:'效果待设计'},
      {desc:'效果待设计'},
    ],
  },
  HAS:{
    godKey:'HAS',name:'无可名状者',subtitle:'哈斯塔之化身',power:'黄衣之印',
    col:'#d0c020',bgCol:'#181808',
    levels:[
      {desc:'效果待设计'},
      {desc:'效果待设计'},
      {desc:'效果待设计'},
    ],
  },
  KTH:{
    godKey:'KTH',name:'爆燃者',subtitle:'克图格亚之化身',power:'炎之精',
    col:'#e05010',bgCol:'#180808',
    levels:[
      {desc:'效果待设计'},
      {desc:'效果待设计'},
      {desc:'效果待设计'},
    ],
  },
  TRA:{
    godKey:'TRA',name:'荣冠亡者特拉维科利',subtitle:'不死君王',power:'亡者军团',
    col:'#4060a0',bgCol:'#080818',
    levels:[
      {desc:'效果待设计'},
      {desc:'效果待设计'},
      {desc:'效果待设计'},
    ],
  },
  FAN:{
    godKey:'FAN',name:'堕落的范·海辛',subtitle:'吸血鬼猎手',power:'血之诅咒',
    col:'#801020',bgCol:'#180808',
    levels:[
      {desc:'效果待设计'},
      {desc:'效果待设计'},
      {desc:'效果待设计'},
    ],
  },
  VRITRA:{
    godKey:'VRITRA',name:'弗栗多',subtitle:'巨龙之化身',power:'不灭之躯',
    col:'#c04020',bgCol:'#1a0808',
    levels:[
      {immortalCount:6,desc:'当你在回合外受到致命伤害，展示牌堆顶部的6张牌，若没有邪神牌和圣物牌，将HP恢复至1，然后弃置这些牌'},
      {immortalCount:4,desc:'当你在回合外受到致命伤害，展示牌堆顶部的4张牌，若没有邪神牌和圣物牌，将HP恢复至1，然后弃置这些牌'},
      {immortalCount:2,desc:'当你在回合外受到致命伤害，展示牌堆顶部的2张牌，若没有邪神牌和圣物牌，将HP恢复至1，然后弃置这些牌'},
    ],
  },
  DIX:{
    godKey:'DIX',name:'尸林魔君帝辛',subtitle:'商纣王',power:'酒池肉林',
    col:'#604020',bgCol:'#100808',
    levels:[
      {desc:'效果待设计'},
      {desc:'效果待设计'},
      {desc:'效果待设计'},
    ],
  },
};

// ── EXPANSION PACK CONFIG ─────────────────────────────────────
const EXPANSIONS = {
  temporary: {
    name: '临时拓展包',
    description: '当前牌组，包含所有现有卡牌',
    // 临时包包含 FIXED_ZONE_CARD_VARIANTS_BY_KEY 中所有卡牌
    godCardKeys: ['NYA', 'CTH', 'SHU', 'VRITRA'],
    godCopies: 4,
  },
  '地神的潜影': {
    name: '地神的潜影',
    description: '来自地底深处的低语……',
    godCardKeys: ['NYA', 'SHU', 'ZHU', 'FUL', 'APO'],
    godCopies: 4,
  },
  '先贤的馈赠': {
    name: '先贤的馈赠',
    description: '古老文明遗留的神秘礼物',
    godCardKeys: ['GEE', 'XUA', 'BAQ'],
    godCopies: 4,
  },
  '群星呼唤': {
    name: '群星呼唤',
    description: '当星辰归位之时……',
    godCardKeys: ['CTH', 'HAS', 'KTH'],
    godCopies: 4,
  },
  '析骨为柴': {
    name: '析骨为柴',
    description: '以骨为柴，以血为火',
    godCardKeys: ['TRA', 'FAN', 'DIX'],
    godCopies: 4,
  },
};

export const INSPECTION_DECK = [
  ...Array(4).fill({ name: '乱抓', effect: 'adjacentDamageHP', value: 1, type: 'negative' }),
  ...Array(4).fill({ name: '自残', effect: 'selfDamageHP', value: 1, type: 'negative' }),
  ...Array(4).fill({ name: '失眠', effect: 'disableRest', value: 1, type: 'negative' }),
  ...Array(2).fill({ name: '暂时的平静', effect: 'nothing', value: 0, type: 'neutral' }),
  ...Array(2).fill({ name: '昏睡', effect: 'flip', value: 1, type: 'negative' }),
  ...Array(2).fill({ name: '迫害妄想', effect: 'discardRandom', value: 1, type: 'negative' }),
  ...Array(2).fill({ name: '失忆', effect: 'disableSkill', value: 1, type: 'negative' }),
  ...Array(2).fill({ name: '乏力', effect: 'handLimitDecrease', value: 1, type: 'negative' }),
  { name: '超人意志', effect: 'healSAN', value: 1, type: 'positive' },
  { name: '揭开真相', effect: 'drawCard', value: 1, type: 'positive' },
  { name: '封印松动', effect: 'sealLoosening', value: 1, type: 'negative' },
  { name: '廷达罗斯猎犬', effect: 'houndsOfTindalos', value: 1, type: 'negative' }
];

let _bgyId = 0;
export function createBlackGoatYoungCard() {
  return {
    id: `bgy-${_bgyId++}`,
    name: '黑山羊幼仔',
    desc: '这张牌在手牌中始终亮明。你获得行动选项"繁衍"：指定另一名角色，立即在其手牌中加入1张"黑山羊幼仔"。回合开始时，若你持有此牌，你失去1HP和1SAN',
    type: 'blackGoatYoung',
    isBlackGoatYoung: true,
    polarity: 'neutral',
    effectScope: 'self',
    letter: 'B',
    number: 0,
    key: 'BGY',
  };
}

export {
  FIXED_ZONE_CARD_VARIANTS_BY_KEY,
  LETTERS,
  NUMS,
  CS,
  GOD_CS,
  GOD_DEFS,
  EXPANSIONS,
};
