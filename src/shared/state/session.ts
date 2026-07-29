import { createSignal } from 'solid-js';

export interface SessionUser {
  id: string;
  name: string;
  role: 'manager' | 'cashier';
}

const STORAGE_KEY = 'mana-pos-usuario';

function loadInitial(): SessionUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.id === 'string' &&
      typeof parsed.name === 'string' &&
      (parsed.role === 'manager' || parsed.role === 'cashier')
    ) {
      return { id: parsed.id, name: parsed.name, role: parsed.role };
    }
    return null;
  } catch {
    return null;
  }
}

const [user, setUser] = createSignal<SessionUser | null>(loadInitial());

export function currentUser(): SessionUser | null {
  return user();
}

export function currentUserName(): string {
  return user()?.name ?? 'cajera';
}

export function isManager(): boolean {
  return user()?.role === 'manager';
}

export function startSession(sessionUser: SessionUser): void {
  setUser(sessionUser);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionUser));
}

// Cambio de turno rápido: salir y que la siguiente persona teclee su PIN.
export function endSession(): void {
  setUser(null);
  localStorage.removeItem(STORAGE_KEY);
}
