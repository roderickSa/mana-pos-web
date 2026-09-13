import { createSignal } from 'solid-js';

import { readRawStored, removeStored, writeRawStored } from '@/shared/lib/storage';

export interface SessionUser {
  id: string;
  name: string;
  role: 'owner' | 'manager' | 'cashier';
}

const STORAGE_KEY = 'mana-pos-usuario';
const TOKEN_KEY = 'mana-pos-token';

function loadInitial(): SessionUser | null {
  try {
    const raw = readRawStored(STORAGE_KEY);
    if (raw === undefined) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'id' in parsed &&
      'name' in parsed &&
      'role' in parsed &&
      typeof parsed.id === 'string' &&
      typeof parsed.name === 'string' &&
      (parsed.role === 'owner' || parsed.role === 'manager' || parsed.role === 'cashier')
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

// Jerarquía: dueño ⊇ encargado ⊇ cajera. Los gates de UI usan estas dos
// funciones, nunca comparación directa de strings.
export function isManager(): boolean {
  const role = user()?.role;
  return role === 'manager' || role === 'owner';
}

export function isOwner(): boolean {
  return user()?.role === 'owner';
}

// Token opaco de la sesión del API: viaja como Bearer en cada request.
export function sessionToken(): string | null {
  return readRawStored(TOKEN_KEY) ?? null;
}

export function startSession(sessionUser: SessionUser, token: string): void {
  // El token va a storage ANTES de anunciar el usuario: Solid propaga la
  // señal sincrónicamente y la app dispara sus primeros fetch en ese mismo
  // instante — si el token aún no está, salen sin Bearer y el 401 expulsa.
  writeRawStored(STORAGE_KEY, JSON.stringify(sessionUser));
  writeRawStored(TOKEN_KEY, token);
  setUser(sessionUser);
}

// Cambio de turno rápido: salir y que la siguiente persona teclee su PIN.
// La revocación en el API la dispara quien llama (TopBar) — aquí solo estado.
export function endSession(): void {
  setUser(null);
  removeStored(STORAGE_KEY);
  removeStored(TOKEN_KEY);
}
