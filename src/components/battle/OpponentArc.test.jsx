import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { OpponentArc } from './OpponentArc';

it('keeps seat order and raises only the presentation current turn over selectable seats', () => {
  const markup = renderToStaticMarkup(
    <OpponentArc currentTurn={2}>
      {[1, 2, 3, 4, 5, 6, 7].map(pid => <div key={pid} data-pid={pid} style={{ zIndex: 101 }}>{pid}</div>)}
    </OpponentArc>,
  );
  expect([...markup.matchAll(/data-pid="(\d)"/g)].map(match => Number(match[1]))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(markup.match(/data-current-turn="true"/g)).toHaveLength(1);
  expect(markup).toMatch(/data-pid="2"[^>]+--toe-opponent-z:200/);
  expect(markup.match(/--toe-opponent-z:101/g)).toHaveLength(6);
});
