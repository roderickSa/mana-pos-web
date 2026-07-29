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

async function parseError(response: Response): Promise<never> {
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
  throw new ApiError(response.status, code, message);
}

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) return parseError(response);
  return response.json();
}

// Devuelve null en 404 (para lookups donde "no existe" es un resultado esperado).
export async function getJsonOrNull<T>(url: string): Promise<T | null> {
  const response = await fetch(url);
  if (response.status === 404) return null;
  if (!response.ok) return parseError(response);
  return response.json();
}

export async function sendJson<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  url: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) return parseError(response);
  return response.json();
}

// Mensaje para mostrar al usuario: el del servidor si existe, si no el fallback.
export function apiErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof ApiError && cause.serverMessage !== null ? cause.serverMessage : fallback;
}
