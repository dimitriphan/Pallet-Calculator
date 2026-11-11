import { describe, expect, it } from 'vitest';
import { fieldText, originText, typedOrigin, writtenOrigin } from './unitFields';

describe('unitFields', () => {
  it('writes stored values as their exact text in the canonical unit', () => {
    expect(writtenOrigin(0.125)).toEqual({ text: '0.125', unit: 'in', canonical: 0.125 });
    expect(writtenOrigin(12.345)).toEqual({
      text: '12.345',
      unit: 'in',
      canonical: 12.345,
    });
  });

  it('writes a value with more than 4 decimals rounded to 4, keeping the exact value', () => {
    expect(writtenOrigin(0.0625).text).toBe('0.0625');
    expect(writtenOrigin(48).text).toBe('48');
    expect(writtenOrigin(120 / 2.54)).toEqual({
      text: '47.2441',
      unit: 'in',
      canonical: 47.24409448818898,
    });
    expect(writtenOrigin(1763.69809744).text).toBe('1763.6981');
    expect(writtenOrigin(1e-7).text).toBe('0');
    // Shown in its own unit the short text stands for the exact value; elsewhere it converts.
    expect(originText('length', writtenOrigin(120 / 2.54), 'cm')).toBe('120');
  });

  it('shows a written origin exactly in inches and rounded elsewhere', () => {
    const o = writtenOrigin(48.125);
    expect(originText('length', o, 'in')).toBe('48.125');
    expect(originText('length', o, 'cm')).toBe('122.2');
    expect(originText('length', o, 'mm')).toBe('1222');
  });

  it('shows weights in pounds exactly with inches and in kilograms to 1 decimal otherwise', () => {
    const o = writtenOrigin(10);
    expect(originText('weight', o, 'in')).toBe('10');
    expect(originText('weight', o, 'cm')).toBe('4.5');
    expect(fieldText('weight', 10, 'in')).toBe('10');
  });

  it('keeps typed text in its own unit and converts it to the canonical value', () => {
    const o = typedOrigin('length', '30.5', 'cm');
    expect(o.canonical).toBeCloseTo(12.00787, 5);
    expect(originText('length', o, 'cm')).toBe('30.5');
    expect(originText('length', o, 'in')).toBe('12.01');
    expect(typedOrigin('length', 'abc', 'mm')).toEqual({
      text: 'abc',
      unit: 'mm',
      canonical: null,
    });
  });
});
