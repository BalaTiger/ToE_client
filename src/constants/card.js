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
      "effectScope": "self"
    },
    {
      "name": "坠落",
      "desc": "你失去3HP，随机弃1张牌（强制触发）",
      "type": "selfDamageDiscardHP",
      "val": 3,
      "forced": true,
      "slotKey": "A1",
      "polarity": "negative",
      "effectScope": "self"
    },
    {
      "name": "惊扰蝙蝠",
      "desc": "你与相邻角色失去1HP",
      "type": "adjDamageHP",
      "val": 1,
      "slotKey": "A1",
      "polarity": "negative",
      "effectScope": "adjacent"
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
      "effectScope": "self"
    },
    {
      "name": "遭遇塌方",
      "desc": "你失去3HP并翻面（切换休息状态）",
      "type": "selfDamageRestHP",
      "val": 3,
      "slotKey": "A2",
      "polarity": "negative",
      "effectScope": "self"
    },
    {
      "name": "地刺陷阱",
      "desc": "你与相邻角色失去3HP",
      "type": "adjDamageHP",
      "val": 3,
      "slotKey": "A2",
      "polarity": "negative",
      "effectScope": "adjacent"
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
      "effectScope": "self"
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
      "effectScope": "self"
    },
    {
      "name": "磷火",
      "desc": "你与相邻角色失去1SAN",
      "type": "adjDamageSAN",
      "val": 1,
      "slotKey": "A3",
      "polarity": "negative",
      "effectScope": "adjacent"
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
      "effectScope": "target"
    },
    {
      "name": "邪恶壁画",
      "desc": "你失去3SAN",
      "type": "selfDamageSAN",
      "val": 3,
      "slotKey": "A4",
      "polarity": "negative",
      "effectScope": "self"
    },
    {
      "name": "空谷传音",
      "desc": "全体角色失去1SAN",
      "type": "allDamageSAN",
      "val": 1,
      "slotKey": "A4",
      "polarity": "negative",
      "effectScope": "all"
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
      "effectScope": "self"
    },
    {
      "name": "忏悔独白",
      "desc": "若信仰邪神则放弃信仰",
      "type": "selfRenounceGod",
      "val": 1,
      "slotKey": "B1",
      "polarity": "negative",
      "effectScope": "self"
    },
    {
      "name": "幽闭恐惧",
      "desc": "你与相邻角色失去2SAN",
      "type": "adjDamageSAN",
      "val": 2,
      "slotKey": "B1",
      "polarity": "negative",
      "effectScope": "adjacent"
    }
  ],
  "B2": [
    {
      "name": "强心剂",
      "desc": "你回复2HP",
      "type": "selfHealHP",
      "val": 2,
      "slotKey": "B2",
      "polarity": "positive",
      "effectScope": "self"
    },
    {
      "name": "深陷沼泽",
      "desc": "你失去2SAN并翻面（切换休息状态）",
      "type": "selfDamageRestSAN",
      "val": 2,
      "slotKey": "B2",
      "polarity": "negative",
      "effectScope": "self"
    },
    {
      "name": "地动山摇",
      "desc": "全体角色各随机弃1张牌（强制触发）",
      "type": "allDiscard",
      "val": 1,
      "forced": true,
      "slotKey": "B2",
      "polarity": "negative",
      "effectScope": "all"
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
      "effectScope": "self"
    },
    {
      "name": "黑暗侵蚀",
      "desc": "你失去2HP与1SAN",
      "type": "selfDamageHPSAN",
      "hpVal": 2,
      "sanVal": 1,
      "slotKey": "B3",
      "polarity": "negative",
      "effectScope": "self"
    },
    {
      "name": "窒息矿坑",
      "desc": "你与相邻角色翻面（切换休息状态）",
      "type": "adjRest",
      "val": 0,
      "slotKey": "B3",
      "polarity": "negative",
      "effectScope": "adjacent"
    }
  ],
  "B4": [
    {
      "name": "腐蚀之雾",
      "desc": "你失去2HP，相邻角色各失去1HP",
      "type": "selfDamageAdjDamageHP",
      "val": 2,
      "slotKey": "B4",
      "polarity": "negative",
      "effectScope": "self"
    },
    {
      "name": "落石砸击",
      "desc": "你失去2HP，若你当前HP≤5则额外失去2HP",
      "type": "selfDamageHPCond",
      "val": 2,
      "bonus": 2,
      "condType": "hpLow",
      "condVal": 5,
      "slotKey": "B4",
      "polarity": "negative",
      "effectScope": "self"
    },
    {
      "name": "两人一绳",
      "desc": "你和另一名角色间拉起救生索，任意一方受伤时绳索断裂，双方各失去3HP。如果到你的下个回合绳索未断裂，各回复4HP",
      "type": "damageLink",
      "val": 1,
      "polarity": "neutral",
      "effectScope": "target",
      "slotKey": "B4",
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
      "effectScope": "self"
    },
    {
      "name": "行囊破裂",
      "desc": "你失去2HP与2SAN",
      "type": "selfDamageHPSAN",
      "hpVal": 2,
      "sanVal": 2,
      "slotKey": "C1",
      "polarity": "negative",
      "effectScope": "self"
    },
    {
      "name": "毁灭风暴",
      "desc": "全体角色失去3HP",
      "type": "allDamageHP",
      "val": 3,
      "slotKey": "C1",
      "polarity": "negative",
      "effectScope": "all"
    }
  ],
  "C2": [
    {
      "name": "急救药包",
      "desc": "你回复3HP",
      "type": "selfHealHP",
      "val": 3,
      "slotKey": "C2",
      "polarity": "positive",
      "effectScope": "self"
    },
    {
      "name": "毒液飞溅",
      "desc": "你失去3HP与1SAN",
      "type": "selfDamageHPSAN",
      "hpVal": 3,
      "sanVal": 1,
      "slotKey": "C2",
      "polarity": "negative",
      "effectScope": "self"
    },
    {
      "name": "混乱气流",
      "desc": "你与相邻角色各失去2HP",
      "type": "adjDamageHP",
      "val": 2,
      "slotKey": "C2",
      "polarity": "negative",
      "effectScope": "adjacent"
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
      "effectScope": "self"
    },
    {
      "name": "惊慌失措",
      "desc": "你失去2SAN，随机弃1张牌（强制触发）",
      "type": "selfDamageDiscardSAN",
      "val": 2,
      "forced": true,
      "slotKey": "C3",
      "polarity": "negative",
      "effectScope": "self"
    },
    {
      "name": "瘟疫蔓延",
      "desc": "你与相邻角色失去2HP和1SAN",
      "type": "adjDamageBoth",
      "hpVal": 2,
      "sanVal": 1,
      "slotKey": "C3",
      "polarity": "negative",
      "effectScope": "adjacent"
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
      "effectScope": "target"
    },
    {
      "name": "恶毒诅咒",
      "desc": "你失去2HP与2SAN",
      "type": "selfDamageHPSAN",
      "hpVal": 2,
      "sanVal": 2,
      "slotKey": "C4",
      "polarity": "negative",
      "effectScope": "self"
    },
    {
      "name": "末日预兆",
      "desc": "全体角色失去1HP和1SAN",
      "type": "allDamageBoth",
      "val": 1,
      "slotKey": "C4",
      "polarity": "negative",
      "effectScope": "all"
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
      "effectScope": "self"
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
      "effectScope": "self"
    },
    {
      "name": "钻地魔虫",
      "desc": "全体角色失去1HP，随机一名角色再失去1HP",
      "type": "allDamageHPRandomExtra",
      "val": 1,
      "slotKey": "D1",
      "polarity": "negative",
      "effectScope": "all"
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
      "effectScope": "target"
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
      "effectScope": "self"
    },
    {
      "name": "目击食人者",
      "desc": "你失去3HP，选一名角色偷看其一张手牌",
      "type": "selfDamageHPPeek",
      "val": 3,
      "slotKey": "D2",
      "polarity": "negative",
      "effectScope": "all"
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
      "effectScope": "self"
    },
    {
      "name": "先到先得",
      "desc": "从牌堆翻开等同于存活人数的牌，从你开始每人挑一张收入手牌（不触发效果）",
      "type": "firstComePick",
      "val": 0,
      "slotKey": "D3",
      "polarity": "positive",
      "effectScope": "self"
    },
    {
      "name": "玫瑰倒刺",
      "desc": "将你的所有手牌送给另一名角色并标记。此角色失去其中任意一张牌时HP-2",
      "type": "roseThornGiftAllHand",
      "val": 0,
      "slotKey": "D3",
      "polarity": "neutral",
      "effectScope": "target"
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
      "effectScope": "self"
    },
    {
      "name": "扭伤",
      "desc": "你失去1HP，下回合开始时你不能摸牌（强制触发）",
      "type": "selfDamageSkipDraw",
      "val": 1,
      "forced": true,
      "slotKey": "D4",
      "polarity": "negative",
      "effectScope": "self"
    },
    {
      "name": "同归深渊",
      "desc": "你失去2HP与2SAN，相邻角色各失去1HP与1SAN",
      "type": "selfDamageAdjDamageBoth",
      "hpVal": 2,
      "sanVal": 2,
      "adjHpVal": 1,
      "adjSanVal": 1,
      "slotKey": "D4",
      "polarity": "negative",
      "effectScope": "all"
    }
  ]
};
const LETTERS=['A','B','C','D'], NUMS=[1,2,3,4];
const AI_NAMES=['艾伦','贝拉','卡洛斯','黛安娜'];
const RINFO={
  '寻宝者':{icon:'✦',col:'#7ecfd4',dim:'#2a6068',goal:'集齐宝藏',skillName:'掉包',skillLimited:true},
  '追猎者':{icon:'☩',col:'#cc4444',dim:'#6a1a1a',goal:'消灭所有非追猎者',skillName:'追捕',skillLimited:false},
  '邪祀者':{icon:'☽',col:'#9060cc',dim:'#3a1060',goal:'复活邪神',skillName:'蛊惑',skillLimited:true},
};
const [ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST] = Object.keys(RINFO);
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
};

export {
  FIXED_ZONE_CARD_VARIANTS_BY_KEY,
  LETTERS,
  NUMS,
  AI_NAMES,
  RINFO,
  ROLE_TREASURE, // 直接写名字，不要带方括号
  ROLE_HUNTER,   // 直接写名字
  ROLE_CULTIST,  // 直接写名字
  CS,
  GOD_CS,
  GOD_DEFS
};
