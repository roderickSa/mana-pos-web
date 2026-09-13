import { describe, expect, it } from 'vitest';

import { parseBooleanParam, parseNumberParam, parseTextParam } from './url-state';

describe('url params', () => {
  it('falls back when the parameter is missing', () => {
    expect(parseNumberParam(undefined, 1)).toBe(1);
    expect(parseBooleanParam(undefined, true)).toBe(true);
    expect(parseTextParam(undefined, '')).toBe('');
  });

  it('reads a number the user could have typed', () => {
    expect(parseNumberParam('4', 1)).toBe(4);
  });

  // Someone editing the URL by hand should not break the screen.
  it('falls back on a number that makes no sense', () => {
    expect(parseNumberParam('cero', 1)).toBe(1);
    expect(parseNumberParam('0', 1)).toBe(1);
    expect(parseNumberParam('-3', 1)).toBe(1);
    expect(parseNumberParam('', 1)).toBe(1);
  });

  it('accepts both spellings of true and treats the rest as false', () => {
    expect(parseBooleanParam('true', false)).toBe(true);
    expect(parseBooleanParam('1', false)).toBe(true);
    expect(parseBooleanParam('false', true)).toBe(false);
    expect(parseBooleanParam('loquesea', true)).toBe(false);
  });

  // The router hands a repeated parameter over as an array.
  it('takes the first value when the parameter comes repeated', () => {
    expect(parseTextParam(['arroz', 'azúcar'], '')).toBe('arroz');
    expect(parseNumberParam(['2', '9'], 1)).toBe(2);
  });

  it('keeps an empty text as a real value, not as absent', () => {
    expect(parseTextParam('', 'x')).toBe('');
  });
});
