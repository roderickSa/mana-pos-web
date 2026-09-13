import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  readRawStored,
  readStored,
  removeExpiredDrafts,
  removeStored,
  removeStoredWhere,
  savedAtOf,
  writeRawStored,
  writeStored,
} from './storage';

const decodeText = (data: unknown): string | undefined =>
  typeof data === 'string' ? data : undefined;

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('reads back what it wrote', () => {
    writeStored('mana-pos:ultimo-usuario', 'u-1');

    expect(readStored('mana-pos:ultimo-usuario', decodeText)).toBe('u-1');
  });

  it('keeps the legacy keys as raw strings, with no envelope', () => {
    writeRawStored('mana-pos-token', 'abc123');

    expect(localStorage.getItem('mana-pos-token')).toBe('abc123');
    expect(readRawStored('mana-pos-token')).toBe('abc123');
  });

  // A saved value whose shape no longer matches is dead weight: it is dropped
  // so it cannot come back on the next read.
  it('drops a value the decoder rejects', () => {
    writeStored('mana-pos:ultimo-usuario', { wrong: 'shape' });

    expect(readStored('mana-pos:ultimo-usuario', decodeText)).toBeUndefined();
    expect(localStorage.getItem('mana-pos:ultimo-usuario')).toBeNull();
  });

  it('drops a value that is not valid JSON', () => {
    localStorage.setItem('mana-pos:ultimo-usuario', '{ half written');

    expect(readStored('mana-pos:ultimo-usuario', decodeText)).toBeUndefined();
    expect(localStorage.getItem('mana-pos:ultimo-usuario')).toBeNull();
  });

  it('drops a value saved without the envelope', () => {
    localStorage.setItem('mana-pos:ultimo-usuario', '"plain"');

    expect(readStored('mana-pos:ultimo-usuario', decodeText)).toBeUndefined();
  });

  it('returns undefined for a key that was never written', () => {
    expect(readStored('mana-pos:ultimo-usuario', decodeText)).toBeUndefined();
    expect(readRawStored('mana-pos-token')).toBeUndefined();
    expect(savedAtOf('mana-pos:ultimo-usuario')).toBeUndefined();
  });

  // Private windows and a full disk make localStorage throw. Losing the
  // persistence is acceptable; losing the sale is not.
  it('does not propagate a storage that throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => writeStored('mana-pos:ultimo-usuario', 'u-1')).not.toThrow();
    expect(readStored('mana-pos:ultimo-usuario', decodeText)).toBeUndefined();
  });

  it('records when the value was saved', () => {
    vi.setSystemTime(new Date('2026-09-13T10:00:00'));
    writeStored('mana-pos:borrador:producto:p1:u1', { name: 'a medias' });

    expect(savedAtOf('mana-pos:borrador:producto:p1:u1')).toBe(
      new Date('2026-09-13T10:00:00').getTime(),
    );
  });

  it('removes only the keys the caller does not keep', () => {
    writeStored('mana-pos:conteo:s1', { drafts: {} });
    writeStored('mana-pos:conteo:s2', { drafts: {} });
    writeRawStored('mana-pos-token', 'abc');

    removeStoredWhere('mana-pos:conteo:', (key) => key.endsWith('s2'));

    expect(localStorage.getItem('mana-pos:conteo:s1')).toBeNull();
    expect(localStorage.getItem('mana-pos:conteo:s2')).not.toBeNull();
    expect(localStorage.getItem('mana-pos-token')).toBe('abc');
  });

  it('throws away drafts older than a week and keeps the rest', () => {
    const now = new Date('2026-09-13T10:00:00').getTime();
    vi.setSystemTime(now - 8 * 24 * 60 * 60 * 1000);
    writeStored('mana-pos:borrador:producto:viejo:u1', { name: 'de la semana pasada' });
    vi.setSystemTime(now - 60 * 60 * 1000);
    writeStored('mana-pos:borrador:producto:reciente:u1', { name: 'de hace un rato' });

    removeExpiredDrafts(now);

    expect(localStorage.getItem('mana-pos:borrador:producto:viejo:u1')).toBeNull();
    expect(localStorage.getItem('mana-pos:borrador:producto:reciente:u1')).not.toBeNull();
  });

  it('never touches the session or the ticket when cleaning drafts', () => {
    writeRawStored('mana-pos-venta', '{"lines":[]}');
    writeRawStored('mana-pos-usuario', '{"id":"u1"}');

    removeExpiredDrafts(Date.now());

    expect(localStorage.getItem('mana-pos-venta')).not.toBeNull();
    expect(localStorage.getItem('mana-pos-usuario')).not.toBeNull();
  });

  it('removes a key on demand', () => {
    writeStored('mana-pos:ruta:u1', '/vender');

    removeStored('mana-pos:ruta:u1');

    expect(localStorage.getItem('mana-pos:ruta:u1')).toBeNull();
  });
});
