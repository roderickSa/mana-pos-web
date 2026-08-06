import { endSession, sessionToken } from '@/shared/state/session';
import { showNotice } from '@/shared/state/notices';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  // Mensaje en humano que manda la API (si lo hay), listo para mostrar.
  readonly serverMessage: string | null;

  constructor(status: number, code: string, serverMessage: string | null = null) {
    super(`API ${status}: ${code}`);
    this.status = status;
    this.code = code;
    this.serverMessage = serverMessage;
  }
}

// Adjunta el Bearer de la sesión; el API rechaza con 401 lo que no lo traiga.
function authHeaders(token: string | null, extra: Record<string, string> = {}): Record<string, string> {
  return token === null ? extra : { ...extra, authorization: `Bearer ${token}` };
}

async function parseError(
  response: Response,
  url: string,
  tokenUsed: string | null,
): Promise<never> {
  let code = 'UNKNOWN';
  let message: string | null = null;
  try {
    const body = await response.json();
    if (typeof body === 'object' && body !== null) {
      if (typeof body.code === 'string') code = body.code;
      if (typeof body.message === 'string') message = body.message;
    }
  } catch {
    // sin cuerpo JSON
  }
  // Sesión muerta (expiró o fue revocada): de vuelta al login. Solo si el 401
  // es del token VIGENTE: un 401 rezagado de un fetch que salió con el token
  // de ayer no debe tumbar la sesión que acaba de empezar (pasaba al primer
  // login tras levantar el server). El login mismo responde 401 con PIN malo
  // — ese caso lo maneja su pantalla.
  if (response.status === 401 && !url.startsWith('/users/login') && tokenUsed === sessionToken()) {
    endSession();
    showNotice('Tu sesión expiró — vuelve a entrar con tu PIN.');
  }
  throw new ApiError(response.status, code, message);
}

export async function getJson<T>(url: string): Promise<T> {
  const token = sessionToken();
  const response = await fetch(url, { headers: authHeaders(token) });
  if (!response.ok) return parseError(response, url, token);
  return response.json();
}

// Devuelve null en 404 (para lookups donde "no existe" es un resultado esperado).
export async function getJsonOrNull<T>(url: string): Promise<T | null> {
  const token = sessionToken();
  const response = await fetch(url, { headers: authHeaders(token) });
  if (response.status === 404) return null;
  if (!response.ok) return parseError(response, url, token);
  return response.json();
}

export async function sendJson<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
): Promise<T> {
  const token = sessionToken();
  const response = await fetch(url, {
    method,
    headers:
      body === undefined
        ? authHeaders(token)
        : authHeaders(token, { 'content-type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) return parseError(response, url, token);
  // 204 / cuerpo vacío (asociar proveedor, deletes): no hay JSON que parsear
  // — response.json() lanzaría "Unexpected end of JSON input".
  const text = await response.text();
  return JSON.parse(text === '' ? 'null' : text);
}

// Mensaje para mostrar al usuario: el del servidor si existe, si no el fallback.
export function apiErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof ApiError && cause.serverMessage !== null ? cause.serverMessage : fallback;
}

// Descargas autenticadas: un <a href> no manda el Bearer — se baja como blob
// con el header puesto y se dispara la descarga desde memoria.
export async function downloadFile(url: string, filename: string): Promise<void> {
  const token = sessionToken();
  const response = await fetch(url, { headers: authHeaders(token) });
  if (!response.ok) return parseError(response, url, token);
  const blob = await response.blob();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
