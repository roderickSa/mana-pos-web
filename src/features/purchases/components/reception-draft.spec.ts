import { beforeEach, describe, expect, it } from 'vitest';

import { readStored, writeStored } from '@/shared/lib/storage';
import {
  decodeReceptionDraft,
  linesOfReceptionDraft,
  receptionDraftOf,
} from './reception-draft';

const KEY = 'mana-pos:recepcion:orden-1';

describe('reception draft', () => {
  beforeEach(() => localStorage.clear());

  it('keeps what was typed on each line', () => {
    const draft = receptionDraftOf(
      'recepcion-1',
      'F001-234',
      'contado',
      new Map([['linea-1', { quantity: '12', cost: '9.90', expiry: '2026-12-01' }]]),
    );

    writeStored(KEY, draft);

    expect(readStored(KEY, decodeReceptionDraft)).toEqual(draft);
  });

  // Esto es lo que evita meter la mercadería dos veces: al volver tras una
  // recarga el reintento sale con el MISMO id, y el servidor lo trata como
  // repetición y no como una segunda entrega.
  it('brings back the same reception id after a reload', () => {
    writeStored(
      KEY,
      receptionDraftOf('recepcion-1', '', '', new Map([['linea-1', { quantity: '5', cost: '', expiry: '' }]])),
    );

    const alVolver = readStored(KEY, decodeReceptionDraft);

    expect(alVolver?.receptionId).toBe('recepcion-1');
    expect(linesOfReceptionDraft(alVolver ?? { receptionId: '', documentNumber: '', paymentTerms: '', lines: {} }).get('linea-1')).toEqual({
      quantity: '5',
      cost: '',
      expiry: '',
    });
  });

  it('ignores a saved draft whose shape no longer fits', () => {
    expect(decodeReceptionDraft(null)).toBeUndefined();
    expect(decodeReceptionDraft({ receptionId: 'r-1' })).toBeUndefined();
    expect(
      decodeReceptionDraft({ receptionId: 'r-1', documentNumber: '', paymentTerms: '', lines: { 'l-1': { quantity: 5 } } }),
    ).toBeUndefined();
  });
});
