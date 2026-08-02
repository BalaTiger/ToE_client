import { describe, expect, it } from 'vitest';
import { cardIdentity } from '../cardIdentity';

describe('cardIdentity', () => {
  it('uses persistent ids first and a shared semantic fallback', () => {
    expect(cardIdentity({ id: 'id-1', uid: 'uid-1', name: '牌' })).toBe('id-1');
    expect(cardIdentity({ uid: 'uid-1', name: '牌' })).toBe('uid-1');
    expect(cardIdentity({ key: 'A1', name: '牌', type: 'zone' })).toBe('A1:牌:zone');
    expect(cardIdentity({})).toBeNull();
    expect(cardIdentity(null)).toBeNull();
  });
});
