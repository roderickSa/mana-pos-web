import { createRoot } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createFormDraft, timeAgo } from './form-draft';
import { readStored, writeStored } from './storage';

interface Form {
  name: string;
  price: string;
}

const KEY = 'mana-pos:borrador:producto:p-1:u-1';
const INITIAL: Form = { name: 'Arroz', price: '4.50' };

const decode = (data: unknown): Form | undefined => {
  if (typeof data !== 'object' || data === null) return undefined;
  if (!('name' in data) || !('price' in data)) return undefined;
  const { name, price } = data;
  if (typeof name !== 'string' || typeof price !== 'string') return undefined;
  return { name, price };
};

const isPristine = (value: Form): boolean =>
  value.name === INITIAL.name && value.price === INITIAL.price;

function build() {
  return createRoot((dispose) => ({
    draft: createFormDraft(KEY, decode, isPristine),
    dispose,
  }));
}

describe('createFormDraft', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  it('saves what was typed once the person stops typing', () => {
    const { draft, dispose } = build();

    draft.track({ name: 'Arroz Costeño', price: '4.50' });
    vi.advanceTimersByTime(400);

    expect(readStored(KEY, decode)).toEqual({ name: 'Arroz Costeño', price: '4.50' });
    dispose();
  });

  // Without this, opening and closing a product would leave a "draft"
  // identical to the product and the notice would show every time.
  it('saves nothing while the form is as it was opened', () => {
    const { draft, dispose } = build();

    draft.track({ ...INITIAL });
    vi.advanceTimersByTime(400);

    expect(localStorage.getItem(KEY)).toBeNull();
    dispose();
  });

  it('throws the draft away when the form goes back to how it was', () => {
    const { draft, dispose } = build();
    draft.track({ name: 'Otra cosa', price: '4.50' });
    vi.advanceTimersByTime(400);

    draft.track({ ...INITIAL });
    vi.advanceTimersByTime(400);

    expect(localStorage.getItem(KEY)).toBeNull();
    dispose();
  });

  // The form is pristine the instant it opens, so the effect that tracks it
  // fires once with the initial values. That must not wipe the very draft the
  // screen is about to offer to recover.
  it('keeps the saved draft when the form opens untouched', () => {
    writeStored(KEY, { name: 'A medio escribir', price: '9.90' });
    const { draft, dispose } = build();

    draft.track({ ...INITIAL });
    vi.advanceTimersByTime(400);

    expect(readStored(KEY, decode)).toEqual({ name: 'A medio escribir', price: '9.90' });
    expect(draft.saved()).toEqual({ name: 'A medio escribir', price: '9.90' });
    dispose();
  });

  it('writes once for a burst of keystrokes', () => {
    const { draft, dispose } = build();
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    for (const name of ['A', 'Ar', 'Arr', 'Arro']) draft.track({ name, price: '4.50' });
    vi.advanceTimersByTime(400);

    expect(setItem).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('offers what was saved before, with its time', () => {
    vi.setSystemTime(new Date('2026-09-13T10:00:00'));
    writeStored(KEY, { name: 'A medias', price: '9.90' });

    const { draft, dispose } = build();

    expect(draft.saved()).toEqual({ name: 'A medias', price: '9.90' });
    expect(draft.savedAt()).toBe(new Date('2026-09-13T10:00:00').getTime());
    dispose();
  });

  it('ignores a saved draft whose shape no longer fits', () => {
    writeStored(KEY, { name: 'A medias' });

    const { draft, dispose } = build();

    expect(draft.saved()).toBeUndefined();
    dispose();
  });

  it('discards on demand and stops any pending write', () => {
    const { draft, dispose } = build();
    draft.track({ name: 'A medias', price: '1.00' });

    draft.discard();
    vi.advanceTimersByTime(400);

    expect(localStorage.getItem(KEY)).toBeNull();
    expect(draft.saved()).toBeUndefined();
    dispose();
  });

  // Closing the modal must not fire a write that was still pending.
  it('does not write after the form is gone', () => {
    const { draft, dispose } = build();
    draft.track({ name: 'A medias', price: '1.00' });

    dispose();
    vi.advanceTimersByTime(400);

    expect(localStorage.getItem(KEY)).toBeNull();
  });
});

describe('timeAgo', () => {
  const now = new Date('2026-09-13T12:00:00').getTime();
  const ago = (ms: number) => timeAgo(now - ms, now);

  it('says it in the words of the shop', () => {
    expect(ago(10_000)).toBe('de recién');
    expect(ago(60_000)).toBe('de hace un minuto');
    expect(ago(12 * 60_000)).toBe('de hace 12 minutos');
    expect(ago(60 * 60_000)).toBe('de hace una hora');
    expect(ago(5 * 60 * 60_000)).toBe('de hace 5 horas');
    expect(ago(25 * 60 * 60_000)).toBe('de ayer');
    expect(ago(3 * 24 * 60 * 60_000)).toBe('de hace 3 días');
  });
});
