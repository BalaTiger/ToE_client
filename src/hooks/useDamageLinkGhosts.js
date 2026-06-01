import { useEffect, useRef, useState } from 'react';

function extractDamageLinkPairs(players = []) {
  return players.flatMap((p, i) => {
    if (!p?.damageLink?.active) return [];
    const j = p.damageLink.partner;
    if (j == null || j <= i || !players[j]?.damageLink?.active || players[j].damageLink.partner !== i) return [];
    return [{ a: i, b: j }];
  });
}

export function useDamageLinkGhosts({ players, log }) {
  const prevDamageLinksRef = useRef([]);
  const prevLogLenRef = useRef(0);
  const ghostTimersRef = useRef(new Map());
  const deferredTimersRef = useRef(new Set());
  const [damageLinkGhosts, setDamageLinkGhosts] = useState([]);

  useEffect(() => () => {
    ghostTimersRef.current.forEach(timer => clearTimeout(timer));
    ghostTimersRef.current.clear();
    deferredTimersRef.current.forEach(timer => clearTimeout(timer));
    deferredTimersRef.current.clear();
  }, []);

  useEffect(() => {
    const ghostTimers = ghostTimersRef.current;
    const deferredTimers = deferredTimersRef.current;
    const defer = (fn) => {
      const timer = setTimeout(() => {
        deferredTimers.delete(timer);
        fn();
      }, 0);
      deferredTimers.add(timer);
      return timer;
    };

    if (!players) {
      prevDamageLinksRef.current = [];
      prevLogLenRef.current = Array.isArray(log) ? log.length : 0;
      ghostTimers.forEach(timer => clearTimeout(timer));
      ghostTimers.clear();
      defer(() => setDamageLinkGhosts([]));
      return undefined;
    }

    const prevPairs = prevDamageLinksRef.current;
    const currentPairs = extractDamageLinkPairs(players);
    const currentKeys = new Set(currentPairs.map(p => `${p.a}-${p.b}`));
    const newLogs = (Array.isArray(log) ? log : []).slice(prevLogLenRef.current);

    prevPairs.forEach(pair => {
      const key = `${pair.a}-${pair.b}`;
      if (currentKeys.has(key)) return;
      const aName = players[pair.a]?.name;
      const bName = players[pair.b]?.name;
      const breakMsg = `【两人一绳】绳索断裂！${aName} 和 ${bName}`;
      const expireMsg = `【两人一绳】绳索未断裂！${aName} 和 ${bName}`;
      const mode = newLogs.some(m => typeof m === 'string' && m.includes(breakMsg))
        ? 'break'
        : newLogs.some(m => typeof m === 'string' && m.includes(expireMsg))
          ? 'fade'
          : 'fade';
      const ghostId = `${key}-${Date.now()}-${mode}`;
      defer(() => setDamageLinkGhosts(prev => [...prev.filter(g => g.key !== key), { id: ghostId, key, a: pair.a, b: pair.b, mode }]));
      if (ghostTimers.has(key)) clearTimeout(ghostTimers.get(key));
      const timeoutMs = mode === 'break' ? 560 : 720;
      const timer = setTimeout(() => {
        setDamageLinkGhosts(prev => prev.filter(g => g.id !== ghostId));
        ghostTimers.delete(key);
      }, timeoutMs);
      ghostTimers.set(key, timer);
    });

    prevDamageLinksRef.current = currentPairs;
    prevLogLenRef.current = Array.isArray(log) ? log.length : 0;
    return undefined;
  }, [players, log]);

  return damageLinkGhosts;
}
