import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { DecipherStoneCarvingOverlay } from './DecipherStoneCarvingOverlay';
import { captureRevealCardAnchor } from '../../utils/dom';

const harness = vi.hoisted(() => ({ zones: null, elements: [] }));
vi.mock('react', async importOriginal => ({ ...await importOriginal(),
  useState: initial => [initial?.top ? harness.zones : initial, () => {}],
  useRef: () => ({ current: { querySelectorAll: () => harness.elements } }),
  useEffect: () => {}, useCallback: callback => callback,
}));
vi.mock('../../utils/dom', async importOriginal => ({ ...await importOriginal(), captureRevealCardAnchor: vi.fn() }));
afterEach(() => vi.clearAllMocks());
function find(root, predicate) {
  if (!root || typeof root !== 'object') return null;
  if (predicate(root)) return root;
  return React.Children.toArray(root.props?.children).map(child => find(child, predicate)).find(Boolean);
}

it('captures each authorized dragged card locally before submitting the original arrangement', () => {
  const cards = ['kept', 'top', 'bottom'].map(id => ({ id }));
  harness.zones = { hand: [cards[0]], top: [cards[1]], bottom: [cards[2]] };
  harness.elements = cards.map(card => ({ dataset: { cardId: card.id } }));
  const onConfirm = vi.fn(() => expect(captureRevealCardAnchor).toHaveBeenCalledTimes(3));
  const tree = DecipherStoneCarvingOverlay({ revealedCards: cards, onConfirm });
  find(tree, node => node.type === 'button').props.onClick();
  cards.forEach((card, index) => expect(captureRevealCardAnchor).toHaveBeenNthCalledWith(index + 1, harness.elements[index], card));
  expect(onConfirm).toHaveBeenCalledExactlyOnceWith({ handCard: cards[0], deckTopCards: [cards[1]], deckBottomCards: [cards[2]] });
});
