import { getJson, sendJson } from '@/shared/api/client';

export interface UserDto {
  id: string;
  name: string;
  role: 'owner' | 'manager' | 'cashier';
  active: boolean;
  lastLoginAt: string | null;
}

export async function loginWithPin(pin: string): Promise<UserDto & { token: string }> {
  return sendJson('POST', '/users/login', { pin });
}

// Revoca la sesión actual en el API (el Bearer viaja solo desde el client).
export async function logoutSession(): Promise<null> {
  return sendJson('POST', '/users/logout');
}

export async function verifyManagerPin(pin: string): Promise<{ ok: boolean; managerName: string }> {
  return sendJson('POST', '/users/verify-manager', { pin });
}

export async function listUsers(): Promise<UserDto[]> {
  return getJson('/users');
}

export async function createUser(
  name: string,
  pin: string,
  role: 'owner' | 'manager' | 'cashier',
): Promise<UserDto> {
  return sendJson('POST', '/users', { name, pin, role });
}

export async function updateUser(
  id: string,
  payload: { name: string; role: 'owner' | 'manager' | 'cashier'; active: boolean; newPin: string | null },
): Promise<UserDto> {
  return sendJson('PUT', `/users/${id}`, payload);
}
