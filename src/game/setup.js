import {
  FIXED_ZONE_CARD_VARIANTS_BY_KEY,
  LETTERS,
  NUMS,
  GOD_DEFS,
  ROLE_TREASURE,
  ROLE_HUNTER,
  ROLE_CULTIST,
} from '../constants/card';
import { shuffle } from './coreUtils';

export function mkDeck() {
  let id = 0;
  const zoneCards = LETTERS.flatMap(letter => NUMS.flatMap(number => {
    const key = `${letter}${number}`;
    return (FIXED_ZONE_CARD_VARIANTS_BY_KEY[key] || []).map(cardDef => ({
      ...cardDef,
      id: id++,
      key,
      letter,
      number,
      isZone: true,
    }));
  }));

  const godCards = [
    ...Array(4).fill(0).map(() => ({
      id: id++,
      isGod: true,
      godKey: 'NYA',
      key: 'NYA',
      type: 'god',
      needsTarget: false,
      ...GOD_DEFS.NYA,
    })),
    ...Array(4).fill(0).map(() => ({
      id: id++,
      isGod: true,
      godKey: 'CTH',
      key: 'CTH',
      type: 'god',
      needsTarget: false,
      ...GOD_DEFS.CTH,
    })),
  ];

  return shuffle([...zoneCards, ...godCards]);
}

export function mkRoles(N = 5, isSinglePlayer = false, forcedPlayerRole = null) {
  if (N < 2) throw new Error('游戏人数不能少于2人');

  if (N === 2) {
    const baseRoles = [ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST];
    if (isSinglePlayer && forcedPlayerRole && baseRoles.includes(forcedPlayerRole)) {
      const remaining = shuffle(baseRoles.filter(role => role !== forcedPlayerRole));
      return [forcedPlayerRole, remaining[0]];
    }
    return shuffle(baseRoles).slice(0, 2);
  }

  const roles = [ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST];
  const counts = { [ROLE_TREASURE]: 1, [ROLE_HUNTER]: 1, [ROLE_CULTIST]: 1 };
  const limit = Math.floor(N / 2);

  let playerRoleProbabilities = { [ROLE_TREASURE]: 1, [ROLE_HUNTER]: 1, [ROLE_CULTIST]: 1 };
  let playerRole = null;

  if (isSinglePlayer) {
    try {
      const storedData = localStorage.getItem('cthulhu_role_streaks');
      if (storedData) {
        const streaks = JSON.parse(storedData);
        Object.keys(streaks).forEach(role => {
          playerRoleProbabilities[role] = Math.max(0, 1 - (streaks[role] * 0.1));
        });
      }
    } catch {
      // Ignore localStorage issues and fall back to default weights.
    }
  }

  for (let i = 3; i < N; i++) {
    const available = [ROLE_TREASURE];
    if (counts[ROLE_HUNTER] < limit) available.push(ROLE_HUNTER);
    if (counts[ROLE_CULTIST] < limit) available.push(ROLE_CULTIST);

    let pick;
    if (isSinglePlayer && i === 3) {
      const weights = available.map(role => playerRoleProbabilities[role]);
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

      if (totalWeight > 0) {
        let random = Math.random() * totalWeight;
        for (let j = 0; j < available.length; j++) {
          random -= weights[j];
          if (random <= 0) {
            pick = available[j];
            break;
          }
        }
      } else {
        pick = available[Math.floor(Math.random() * available.length)];
      }

      playerRole = pick;
    } else {
      pick = available[Math.floor(Math.random() * available.length)];
    }

    roles.push(pick);
    counts[pick]++;
  }

  if (isSinglePlayer && playerRole) {
    try {
      const storedData = localStorage.getItem('cthulhu_role_streaks');
      const streaks = storedData
        ? JSON.parse(storedData)
        : { [ROLE_TREASURE]: 0, [ROLE_HUNTER]: 0, [ROLE_CULTIST]: 0 };

      Object.keys(streaks).forEach(role => {
        streaks[role] = 0;
      });
      streaks[playerRole] = (streaks[playerRole] || 0) + 1;

      localStorage.setItem('cthulhu_role_streaks', JSON.stringify(streaks));
    } catch {
      // Ignore localStorage issues.
    }
  }

  return shuffle(roles);
}
