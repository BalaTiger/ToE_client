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
      "name": "解读石刻",
      "desc": "从牌堆顶翻开3张牌，选1张收入手牌，其余牌以任意顺序放回牌堆顶部或底部。若选择邪神牌，你失去1SAN",
      "type": "decipherStoneCarving",
      "val": 3,
      "slotKey": "A1",
      "polarity": "neutral",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "霉变食物",
      "desc": "掷一枚骰子：若为双数，你恢复2HP；否则失去1HP，下回合开始时不能摸牌",
      "type": "moldyFood",
      "slotKey": "A1",
      "polarity": "neutral",
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
    },
    {
      "name": "神圣菇肉",
      "desc": "你回复5HP，失去2SAN",
      "type": "selfHealHPSelfDamageSAN",
      "hpVal": 5,
      "sanVal": 2,
      "slotKey": "A1",
      "polarity": "neutral",
      "effectScope": "self",
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
      "desc": "你与相邻角色失去4HP",
      "type": "adjDamageHP",
      "val": 4,
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
    },
    {
      "name": "无尽通道",
      "desc": "回合结束时，若此牌在手中，展示所有手牌，使所有“无尽通道”左边的牌视为被重新摸到并依次结算",
      "type": "endTurnReplayHand",
      "val": 0,
      "slotKey": "A3",
      "polarity": "neutral",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "可生食木乃伊",
      "desc": "你回复2HP，失去1SAN",
      "type": "selfHealHPSelfDamageSAN",
      "hpVal": 2,
      "sanVal": 1,
      "slotKey": "A3",
      "polarity": "neutral",
      "effectScope": "self",
      "expansion": "地神的潜影"
    }
  ],
  "A4": [
    {
      "name": "绮丽诗篇",
      "desc": "直到下回合，所有角色技能变为“掉包”",
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
      "desc": "所有角色失去1SAN",
      "type": "allDamageSAN",
      "val": 1,
      "slotKey": "A4",
      "polarity": "negative",
      "effectScope": "all",
      "expansion": "地神的潜影"
    },
    {
      "name": "掘墓",
      "desc": "从弃牌堆中选一张邪神牌放入你的手牌",
      "type": "graveDigGod",
      "val": 1,
      "slotKey": "A4",
      "polarity": "positive",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "活埋",
      "desc": "你与相邻角色从手牌中选择一张牌放到牌堆底",
      "type": "buryAlive",
      "val": 1,
      "slotKey": "A4",
      "polarity": "negative",
      "effectScope": "adjacent",
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
      "name": "生命天平",
      "desc": "你回复3HP。此牌从你的手牌进入弃牌堆时，你失去3HP",
      "type": "lifeBalance",
      "val": 3,
      "slotKey": "B1",
      "polarity": "neutral",
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
    },
    {
      "name": "增殖的Z",
      "desc": "本回合每有角色获得邪神牌或其衍生牌，其他角色各摸一张牌",
      "type": "proliferatingZ",
      "val": 0,
      "slotKey": "B1",
      "polarity": "positive",
      "effectScope": "all",
      "expansion": "地神的潜影"
    }
  ],
  "B2": [
    {
      "name": "新鲜空气",
      "desc": "所有角色回复1HP",
      "type": "allHealHP",
      "val": 1,
      "slotKey": "B2",
      "polarity": "positive",
      "effectScope": "all",
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
      "desc": "所有角色各随机弃1张牌（强制触发）",
      "type": "allDiscard",
      "val": 1,
      "forced": true,
      "slotKey": "B2",
      "polarity": "negative",
      "effectScope": "all",
      "expansion": "地神的潜影"
    },
    {
      "name": "投掷石块",
      "desc": "掷一枚骰子，另一名随机角色失去HP：数值等于骰子点数-你与该角色的距离，最小为0",
      "type": "throwStone",
      "val": 0,
      "slotKey": "B2",
      "polarity": "neutral",
      "effectScope": "target",
      "expansion": "地神的潜影"
    },
    {
      "name": "逆流",
      "desc": "本回合结束时，若回合轮转方向是顺时针，则改为逆时针，反之亦然",
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
      "desc": "你回复3HP，相邻角色各回复2HP",
      "type": "selfHealAdjHealHP",
      "val": 3,
      "adjVal": 2,
      "slotKey": "B3",
      "polarity": "positive",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "封入石棺",
      "desc": "你失去1HP与1SAN",
      "type": "selfDamageHPSAN",
      "hpVal": 1,
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
      "desc": "你与相邻角色失去3HP",
      "type": "adjDamageHP",
      "val": 3,
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
      "name": "灵魂天平",
      "desc": "你回复3SAN。此牌从你的手牌进入弃牌堆时，你失去3SAN",
      "type": "soulBalance",
      "val": 3,
      "slotKey": "C1",
      "polarity": "neutral",
      "effectScope": "self",
      "expansion": "先贤的馈赠"
    },
    {
      "name": "活火山",
      "desc": "所有角色失去4HP",
      "type": "allDamageHP",
      "val": 4,
      "slotKey": "C1",
      "polarity": "negative",
      "effectScope": "all",
      "expansion": "地神的潜影"
    },
    {
      "name": "烤盲鱼",
      "desc": "你回复3HP，且摸到下张区域牌时，须在只能看见编号的条件下决定是否收入",
      "type": "blindFish",
      "val": 3,
      "slotKey": "C1",
      "polarity": "positive",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "石化配方",
      "desc": "收入这张牌视为协助调配药水，调配进度从3开始倒数。进度为1时，场上HP最低的角色立即死亡并石化，所有共犯失去1SAN",
      "type": "petrifyingFormula",
      "val": 1,
      "slotKey": "C1",
      "polarity": "neutral",
      "effectScope": "all",
      "expansion": "地神的潜影"
    }
  ],
  "C2": [
    {
      "name": "地下泉",
      "desc": "所有角色回复2HP",
      "type": "allHealHP",
      "val": 2,
      "slotKey": "C2",
      "polarity": "positive",
      "effectScope": "all",
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
    },
    {
      "name": "地磁反转",
      "desc": "将一张\"反转复原\"洗入弃牌堆。角色即将摸牌时，改为重洗弃牌堆并暗抽一张",
      "type": "geomagneticReversal",
      "slotKey": "C2",
      "polarity": "negative",
      "effectScope": "all",
      "expansion": "地神的潜影"
    }
  ],
  "C3": [
    {
      "name": "龙之心",
      "desc": "你回复4HP与1SAN",
      "type": "selfHealHPSAN",
      "hpVal": 4,
      "sanVal": 1,
      "slotKey": "C3",
      "polarity": "positive",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "引燃火把",
      "desc": "弃一张牌，本回合你不受邪神之力影响",
      "type": "igniteTorch",
      "slotKey": "C3",
      "polarity": "neutral",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "地底天空",
      "desc": "交换牌堆和弃牌堆",
      "type": "swapDeckDiscard",
      "slotKey": "C3",
      "polarity": "neutral",
      "effectScope": "all",
      "expansion": "地神的潜影"
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
      "name": "半物质化",
      "desc": "根据手牌数获得同层数的「虚化」：自己回合外即将失去HP/SAN时，可消耗1层「虚化」改为令相邻角色失去",
      "type": "etherealize",
      "slotKey": "C4",
      "polarity": "neutral",
      "effectScope": "target",
      "expansion": "地神的潜影"
    },
    {
      "name": "夜风呼啸",
      "desc": "所有角色失去1HP和1SAN",
      "type": "allDamageBoth",
      "val": 1,
      "slotKey": "C4",
      "polarity": "negative",
      "effectScope": "all",
      "expansion": "地神的潜影"
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
      "name": "活死人哨兵",
      "desc": "所有与死亡角色相邻的角色下回合开始时不能摸牌",
      "type": "deadNeighborSkipDraw",
      "slotKey": "D1",
      "polarity": "neutral",
      "effectScope": "all",
      "expansion": "地神的潜影"
    },
    {
      "name": "钻地魔虫",
      "desc": "所有角色失去2HP，随机一名角色再失去2HP",
      "type": "allDamageHPRandomExtra",
      "val": 2,
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
      "name": "荆棘山路",
      "desc": "你失去1HP",
      "type": "selfDamageHP",
      "val": 1,
      "slotKey": "D2",
      "polarity": "negative",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "群蛇陷阱",
      "desc": "将等同于存活人数的“中毒”层数随机分配给存活角色。中毒角色回合开始时失去等同层数的HP，并消耗1层中毒",
      "type": "snakePoisonTrap",
      "val": 1,
      "slotKey": "D2",
      "polarity": "negative",
      "effectScope": "all",
      "expansion": "地神的潜影"
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
    },
    {
      "name": "鼠群",
      "desc": "所有角色失去1SAN",
      "type": "allDamageSAN",
      "val": 1,
      "slotKey": "D3",
      "polarity": "negative",
      "effectScope": "all",
      "expansion": "地神的潜影"
    },
    {
      "name": "偷吃龙蛋",
      "desc": "你回复3HP，相邻角色各失去2HP",
      "type": "selfHealAdjDamageHP",
      "val": 3,
      "adjVal": 2,
      "slotKey": "D3",
      "polarity": "positive",
      "effectScope": "self",
      "expansion": "地神的潜影"
    },
    {
      "name": "白化生物",
      "desc": "亮出带有\"火\"字的一张手牌，随机角色失去2HP和2SAN，否则你失去2HP和2SAN",
      "type": "albinoCreature",
      "slotKey": "D3",
      "polarity": "negative",
      "effectScope": "self",
      "expansion": "地神的潜影"
    }
  ],
  "D4": [
    {
      "name": "狂化",
      "desc": "你失去1SAN，直到当前回合结束，你造成的伤害+1",
      "type": "selfBerserk",
      "val": 1,
      "slotKey": "D4",
      "polarity": "neutral",
      "effectScope": "self",
      "expansion": "析骨为柴"
    },
    {
      "name": "扭伤",
      "desc": "你失去1HP，下回合开始时不能摸牌（强制触发）",
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
      "desc": "所有角色回复2HP，失去1SAN",
      "type": "allHealHPDamageSAN",
      "hpVal": 2,
      "sanVal": 1,
      "slotKey": "D4",
      "polarity": "neutral",
      "effectScope": "all",
      "expansion": "析骨为柴"
    },
    {
      "name": "斯芬克斯",
      "desc": "猜测牌堆顶的牌是否是区域牌。若猜对，则收入这张牌（不触发效果）。若猜错，失去3HP",
      "type": "sphinxGuess",
      "slotKey": "D4",
      "polarity": "positive",
      "effectScope": "self",
      "expansion": "地神的潜影"
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
      {handPenalty:2,desc:'你的回合开始时，可借用已死角色身份，本回合技能与胜利条件均变为该身份（手牌上限-2）'},
      {handPenalty:1,desc:'你的回合开始时，可借用已死角色身份，本回合技能与胜利条件均变为该身份（手牌上限-1）'},
      {handPenalty:0,desc:'你的回合开始时，可借用已死角色身份，本回合技能与胜利条件均变为该身份'},
    ],
  },
  CTH:{
    godKey:'CTH',name:'拉莱耶之主',subtitle:'克苏鲁之化身',power:'梦访拉莱耶',
    col:'#2060c0',bgCol:'#080820',
    levels:[
      {extraDraws:1,desc:'在角色翻面状态下结束或跳过回合时，摸1张牌'},
      {extraDraws:2,desc:'在角色翻面状态下结束或跳过回合时，摸2张牌'},
      {extraDraws:3,desc:'在角色翻面状态下结束或跳过回合时，摸3张牌'},
    ],
  },
  SHU:{
    godKey:'SHU',name:'森之领主',subtitle:'莎布·尼古拉丝之化身',power:'黑暗子嗣',
    col:'#2a5a20',bgCol:'#081008',
    levels:[
      {offspringCount:1,desc:'立即指定一名角色（可以为自己），在其手牌中加入1张"黑山羊幼仔"'},
      {offspringCount:2,desc:'立即指定一名角色（可以为自己），在其手牌中加入2张"黑山羊幼仔"'},
      {offspringCount:3,desc:'立即指定一名角色（可以为自己），在其手牌中加入3张"黑山羊幼仔"'},
    ],
  },
  ZHU:{
    godKey:'ZHU',name:'烛九阴',subtitle:'钟山之神',power:'衔烛照幽',
    col:'#c0a020',bgCol:'#181008',
    levels:[
      {zhuLightOffsets:[2],desc:'立即点亮牌库顶部第3张牌。你可以查看被点亮牌的正面；当其即将被翻开时，可将其藏到牌堆底。你的回合开始时也如此做'},
      {zhuLightOffsets:[1,2,3],desc:'“第3张牌”改为“第2~4张牌”'},
      {zhuLightOffsets:[0,1,2,3,4],desc:'改为点亮牌库顶部前5张牌'},
    ],
  },
  APO:{
    godKey:'APO',name:'阿波菲斯',subtitle:'混沌巨蛇',power:'噬日灭世',
    col:'#8020a0',bgCol:'#100818',
    levels:[
      {nightThreshold:2,desc:'立即让场地进入黑夜：所有角色选中目标时掷骰子，若小于等于2则改为错误目标并失去1SAN。选中目标累计12次后黑夜结束'},
      {nightThreshold:4,desc:'“若小于等于2”改为“若小于等于4”，其余不变'},
      {nightThreshold:6,desc:'“若小于等于4”改为“若小于等于6”，其余不变'},
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
  VRI:{
    godKey:'VRI',name:'弗栗多',subtitle:'巨龙之化身',power:'不灭之躯',
    col:'#c04020',bgCol:'#1a0808',
    levels:[
      {immortalCount:6,desc:'当你在回合外受到致命伤害，展示牌堆顶部的6张牌，若没有邪神牌和圣物牌，将HP回复至1，然后弃置这些牌'},
      {immortalCount:4,desc:'当你在回合外受到致命伤害，展示牌堆顶部的4张牌，若没有邪神牌和圣物牌，将HP回复至1，然后弃置这些牌'},
      {immortalCount:2,desc:'当你在回合外受到致命伤害，展示牌堆顶部的2张牌，若没有邪神牌和圣物牌，将HP回复至1，然后弃置这些牌'},
    ],
  },
  TSG:{
    godKey:'TSG',name:'蟾蜍之神',subtitle:'撒托古亚之化身',power:'无定形体',
    col:'#5f8f4a',bgCol:'#081208',
    levels:[
      {slimeCount:1,desc:'回合结束时，你获得1张“撒托古亚的赐福黏液”；摸牌阶段，手中每张黏液使你多摸1张牌，随后黏液消失'},
      {slimeCount:2,desc:'回合结束时，你获得2张“撒托古亚的赐福黏液”；摸牌阶段，手中每张黏液使你多摸1张牌，随后黏液消失'},
      {slimeCount:3,desc:'回合结束时，你获得3张“撒托古亚的赐福黏液”；摸牌阶段，手中每张黏液使你多摸1张牌，随后黏液消失'},
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
  '地神的潜影': {
    name: '地神的潜影',
    description: '来自地底深处的低语……',
    zoneSlotCount: 16,
    zoneCardsPerSlot: 3,
    godCardKeys: ['NYA', 'SHU', 'ZHU', 'VRI', 'APO', 'TSG'],
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

const CARD_BACK_IMAGE_BY_EXPANSION = {
  '地神的潜影': '/img/card/cardback_earth_shadow.png',
  '先贤的馈赠': '/img/card/cardback_sage_gift.png',
  '群星呼唤': '/img/card/cardback_stars_call.png',
  '析骨为柴': '/img/card/cardback_bone_fuel.png',
};

const ANIMATED_CARD_BACK_BY_EXPANSION = {
  '地神的潜影': {
    frameDir: '/img/card/animated/earth_shadow',
    sprite: '/img/card/animated/earth_shadow/spritesheet.png',
    version: 'earth-strata-loop-20260608',
    frameCount: 24,
    fps: 12,
    width: 392,
    height: 590,
  },
  '群星呼唤': {
    frameDir: '/img/card/animated/stars_call',
    sprite: '/img/card/animated/stars_call/spritesheet.png',
    version: 'stars-symbol-refraction-20260608',
    frameCount: 24,
    fps: 12,
    width: 392,
    height: 590,
  },
};

function getCardBackImage(expansionKey = '地神的潜影') {
  return CARD_BACK_IMAGE_BY_EXPANSION[expansionKey] || CARD_BACK_IMAGE_BY_EXPANSION['地神的潜影'];
}

function getAnimatedCardBack(expansionKey = '地神的潜影') {
  return ANIMATED_CARD_BACK_BY_EXPANSION[expansionKey] || null;
}

function getVersionedAssetPath(path, version) {
  if (!path || !version) return path;
  return `${path}${path.includes('?') ? '&' : '?'}v=${encodeURIComponent(version)}`;
}

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
    desc: '这张牌在手牌中始终亮明。你获得行动选项"繁衍"：指定另一名角色，立即在其手牌中加入1张"黑山羊幼仔"。你的回合开始时，若你持有此牌，你失去1HP和1SAN',
    type: 'blackGoatYoung',
    isBlackGoatYoung: true,
    polarity: 'neutral',
    effectScope: 'self',
    letter: 'B',
    number: 0,
    key: 'BGY',
  };
}

let _tsgSlimeId = 0;
export function createTsathogguaSlimeCard() {
  return {
    id: `tsg-slime-${_tsgSlimeId++}`,
    name: '撒托古亚的赐福黏液',
    desc: '当你失去HP/SAN后，你可选择牺牲这张牌平分HP和SAN。若你仍信仰蟾蜍之神，摸牌阶段每张黏液使你多摸1张牌，随后黏液消失',
    type: 'tsathogguaSlime',
    isTsathogguaSlime: true,
    polarity: 'neutral',
    effectScope: 'self',
    letter: 'T',
    number: 0,
    key: 'SLM',
  };
}

let _gmRestoreId = 0;
export function createGeomagneticRestoreCard() {
  return {
    id: `gmr-${_gmRestoreId++}`,
    name: '反转复原',
    desc: '这张牌消失并消除当前"地磁反转"效果',
    type: 'geomagneticRestore',
    isGeomagneticRestore: true,
    polarity: 'neutral',
    effectScope: 'self',
    letter: 'R',
    number: 0,
    key: 'GMR',
  };
}

function getGodShortKey(godKey) {
  return GOD_DEFS[godKey]?.shortKey || godKey || 'GOD';
}

function getCardDisplayKey(card) {
  if (!card) return '?';
  if (card.isGod) return getGodShortKey(card.godKey);
  return card.key || '?';
}

export {
  FIXED_ZONE_CARD_VARIANTS_BY_KEY,
  LETTERS,
  NUMS,
  CS,
  GOD_CS,
  GOD_DEFS,
  EXPANSIONS,
  CARD_BACK_IMAGE_BY_EXPANSION,
  ANIMATED_CARD_BACK_BY_EXPANSION,
  getCardBackImage,
  getAnimatedCardBack,
  getVersionedAssetPath,
  getGodShortKey,
  getCardDisplayKey,
};
