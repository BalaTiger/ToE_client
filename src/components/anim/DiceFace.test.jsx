import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DiceFace } from './DiceFace';
import { DiceRollAnim } from './GenericAnimOverlay';

describe('engraved dice presentation', () => {
  it('draws exactly the declared number of pips for all six results', () => {
    for (let value = 1; value <= 6; value++) {
      const markup = renderToStaticMarkup(<DiceFace value={value} />);
      expect(markup.match(/data-dice-pip="true"/g)).toHaveLength(value);
      expect(markup).toContain(`aria-label="骰子 ${value} 点"`);
      expect(markup).not.toMatch(/[⚀-⚅]/u);
    }
  });

  it('keeps the single-die sentinel out of the rendered roll', () => {
    const single = renderToStaticMarkup(<DiceRollAnim anim={{ d1: 4, d2: 0, rollerName: '你' }} />);
    const double = renderToStaticMarkup(<DiceRollAnim anim={{ d1: 4, d2: 6, rollerName: '你' }} />);
    expect(single.match(/data-dice-value=/g)).toHaveLength(1);
    expect(double.match(/data-dice-value=/g)).toHaveLength(2);
  });
});
