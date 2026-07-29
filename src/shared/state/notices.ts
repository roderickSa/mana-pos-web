import { createSignal } from 'solid-js';

const [notice, setNotice] = createSignal('');
let timer: ReturnType<typeof setTimeout> | undefined;

export function currentNotice(): string {
  return notice();
}

export function showNotice(message: string): void {
  setNotice(message);
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => setNotice(''), 3500);
}
