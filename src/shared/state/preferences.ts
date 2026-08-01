import { createSignal } from 'solid-js';

// Preferencias de accesibilidad por usuario (la pantalla se mira a ~80 cm;
// cada cajera decide si necesita texto más grande o modo noche).
const BIG_TEXT_PREFIX = 'mana-pos-texto-grande:';
const NIGHT_PREFIX = 'mana-pos-modo-noche:';

// Tres pasos de tamaño: 100% / 115% / 130% (el valor guardado '1' de la
// versión toggle anterior se lee como nivel 1).
export type TextLevel = 0 | 1 | 2;

const [textLevel, setTextLevel] = createSignal<TextLevel>(0);
const [night, setNight] = createSignal(false);

function applyTextLevel(level: TextLevel): void {
  document.documentElement.classList.toggle('texto-grande', level === 1);
  document.documentElement.classList.toggle('texto-grande-xl', level === 2);
  setTextLevel(level);
}

function applyNight(enabled: boolean): void {
  document.documentElement.classList.toggle('noche', enabled);
  setNight(enabled);
}

export function bigTextLevel(): TextLevel {
  return textLevel();
}

export function bigTextEnabled(): boolean {
  return textLevel() > 0;
}

export function nightModeEnabled(): boolean {
  return night();
}

export function loadPreferencesFor(userId: string): void {
  const stored = localStorage.getItem(BIG_TEXT_PREFIX + userId);
  applyTextLevel(stored === '2' ? 2 : stored === '1' ? 1 : 0);
  applyNight(localStorage.getItem(NIGHT_PREFIX + userId) === '1');
}

// A+ cicla 100% → 115% → 130% → 100%.
export function toggleBigText(userId: string): void {
  const next: TextLevel = textLevel() === 0 ? 1 : textLevel() === 1 ? 2 : 0;
  localStorage.setItem(BIG_TEXT_PREFIX + userId, String(next));
  applyTextLevel(next);
}

export function toggleNightMode(userId: string): void {
  const enabled = !night();
  localStorage.setItem(NIGHT_PREFIX + userId, enabled ? '1' : '0');
  applyNight(enabled);
}

export function clearPreferences(): void {
  applyTextLevel(0);
  applyNight(false);
}
