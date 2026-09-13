import { describe, expect, it } from 'vitest';

import { decodeCountDraft, isEmptyCountDraft } from './count-draft';

describe('decodeCountDraft', () => {
  it('reads what was typed', () => {
    expect(decodeCountDraft({ quantities: { 'p-1': '7' }, closeNote: 'faltó el pasillo 3' })).toEqual({
      quantities: { 'p-1': '7' },
      closeNote: 'faltó el pasillo 3',
    });
  });

  // Un borrador de una versión anterior de la app no debe romper la pantalla.
  it('rejects anything that is not the shape it saves', () => {
    expect(decodeCountDraft(null)).toBeUndefined();
    expect(decodeCountDraft({ quantities: { 'p-1': 7 }, closeNote: '' })).toBeUndefined();
    expect(decodeCountDraft({ quantities: {} })).toBeUndefined();
    expect(decodeCountDraft({ closeNote: '' })).toBeUndefined();
  });
});

describe('isEmptyCountDraft', () => {
  it('is empty with nothing typed and no note', () => {
    expect(isEmptyCountDraft({ quantities: {}, closeNote: '' })).toBe(true);
  });

  it('is not empty with one quantity or a note', () => {
    expect(isEmptyCountDraft({ quantities: { 'p-1': '2' }, closeNote: '' })).toBe(false);
    expect(isEmptyCountDraft({ quantities: {}, closeNote: 'ojo' })).toBe(false);
  });
});
