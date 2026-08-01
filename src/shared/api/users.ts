import { getJson, sendJson } from '@/shared/api/client';

export interface UserDto {
  id: string;
  name: string;
  role: 'manager' | 'cashier';
  active: boolean;
  lastLoginAt: string | null;
}

export async function loginWithPin(pin: string): Promise<UserDto> {
  return sendJson('POST', '/users/login', { pin });
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
  role: 'manager' | 'cashier',
): Promise<UserDto> {
  return sendJson('POST', '/users', { name, pin, role });
}

export async function updateUser(
  id: string,
  payload: { name: string; role: 'manager' | 'cashier'; active: boolean; newPin: string | null },
): Promise<UserDto> {
  return sendJson('PUT', `/users/${id}`, payload);
}
