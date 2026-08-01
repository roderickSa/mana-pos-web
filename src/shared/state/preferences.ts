import { createSignal } from 'solid-js';

// Preferencias de accesibilidad por usuario (la pantalla se mira a ~80 cm;
// cada cajera decide si necesita texto más grande).
const STORAGE_PREFIX = 'mana-pos-texto-grande:';

const [bigText, setBigText] = createSignal(false);

function apply(enabled: boolean): void {
  document.documentElement.classList.toggle('texto-grande', enabled);
  setBigText(enabled);
}

export function bigTextEnabled(): boolean {
  return bigText();
}

export function loadPreferencesFor(userId: string): void {
  apply(localStorage.getItem(STORAGE_PREFIX + userId) === '1');
}

export function toggleBigText(userId: string): void {
  const enabled = !bigText();
  localStorage.setItem(STORAGE_PREFIX + userId, enabled ? '1' : '0');
  apply(enabled);
}

export function clearPreferences(): void {
  apply(false);
}
