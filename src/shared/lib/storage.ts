// El ÚNICO archivo que habla con localStorage. Antes había cuatro escribiendo
// claves sueltas a mano; con los borradores de formulario iban a ser diez, y
// nadie sabría cuál se puede borrar. `npm run revisar:ui` verifica que nadie
// más lo use.
//
// Dos formas conviven a propósito:
//   · Las claves VIEJAS (sesión, ticket, preferencias) guardan su valor crudo,
//     tal como lo escribían antes. No se migran: un cambio de forma obligaría a
//     que la tienda pierda su sesión y su venta en curso al actualizar.
//   · Las claves NUEVAS guardan un sobre { v, savedAt, data }: la versión deja
//     migrar la forma sin romper, y savedAt sostiene el «tenías cambios sin
//     guardar de hace 12 min» y la limpieza de lo viejo.

// Todas las claves que la app guarda en el navegador. Agregar una acá es la
// única forma de persistir algo, y obliga a decidir su alcance (global, por
// usuario, por entidad).
export type StoredKey =
  // Crudas, de antes. No tocar su forma.
  | 'mana-pos-usuario'
  | 'mana-pos-token'
  | 'mana-pos-venta'
  | 'mana-pos-leyenda-codigo-oculta'
  | `mana-pos-texto-grande:${string}`
  | `mana-pos-modo-noche:${string}`
  // Nuevas, con sobre.
  | 'mana-pos:ultimo-usuario'
  | `mana-pos:ruta:${string}`
  | `mana-pos:borrador-orden:${string}`
  | `mana-pos:recepcion:${string}`
  | `mana-pos:conteo:${string}`
  | `mana-pos:borrador:${string}:${string}:${string}`;

// Prefijos de las claves que se limpian solas. El de borradores de formulario
// incluye el de orden porque `borrador-orden` empieza igual que `borrador`.
export const DRAFT_PREFIXES = [
  'mana-pos:borrador:',
  'mana-pos:borrador-orden:',
  'mana-pos:recepcion:',
  'mana-pos:conteo:',
] as const;

const ENVELOPE_VERSION = 1;

interface Envelope {
  v: number;
  savedAt: number;
  data: unknown;
}

function isEnvelope(value: unknown): value is Envelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    'v' in value &&
    'savedAt' in value &&
    'data' in value &&
    typeof (value as { v: unknown }).v === 'number' &&
    typeof (value as { savedAt: unknown }).savedAt === 'number'
  );
}

// En modo privado, con el disco lleno o con el storage bloqueado por política,
// localStorage LANZA. La app tiene que seguir vendiendo: se pierde la
// persistencia, no la venta.
function safely<T>(action: () => T, fallback: T): T {
  try {
    return action();
  } catch {
    return fallback;
  }
}

export function removeStored(key: StoredKey): void {
  safely(() => localStorage.removeItem(key), undefined);
}

// --- Claves crudas (las de antes) ---------------------------------------

export function readRawStored(key: StoredKey): string | undefined {
  return safely(() => localStorage.getItem(key) ?? undefined, undefined);
}

export function writeRawStored(key: StoredKey, value: string): void {
  safely(() => localStorage.setItem(key, value), undefined);
}

// --- Claves con sobre (las nuevas) --------------------------------------

// `decode` valida la forma y devuelve undefined si el valor guardado ya no
// sirve (versión vieja, campo que cambió de tipo, JSON a medias). Cuando eso
// pasa la clave se borra: dejarla ahí sería arrastrar basura para siempre.
export function readStored<T>(key: StoredKey, decode: (data: unknown) => T | undefined): T | undefined {
  const raw = readRawStored(key);
  if (raw === undefined) return undefined;
  const parsed = safely<unknown>(() => JSON.parse(raw), undefined);
  if (!isEnvelope(parsed) || parsed.v !== ENVELOPE_VERSION) {
    removeStored(key);
    return undefined;
  }
  const value = safely(() => decode(parsed.data), undefined);
  if (value === undefined) {
    removeStored(key);
    return undefined;
  }
  return value;
}

export function writeStored(key: StoredKey, data: unknown): void {
  const envelope: Envelope = { v: ENVELOPE_VERSION, savedAt: Date.now(), data };
  safely(() => localStorage.setItem(key, JSON.stringify(envelope)), undefined);
}

// Cuándo se guardó, para el aviso «tenías cambios sin guardar de hace N min».
export function savedAtOf(key: StoredKey): number | undefined {
  const raw = readRawStored(key);
  if (raw === undefined) return undefined;
  const parsed = safely<unknown>(() => JSON.parse(raw), undefined);
  return isEnvelope(parsed) ? parsed.savedAt : undefined;
}

// --- Limpieza -----------------------------------------------------------

// Borra las claves con ese prefijo que `keep` no quiera conservar. Se usa al
// iniciar sesión para tirar los borradores viejos.
export function removeStoredWhere(prefix: string, keep: (key: string, savedAt: number) => boolean): void {
  const keys = safely(() => Object.keys(localStorage), []);
  for (const key of keys) {
    if (!key.startsWith(prefix)) continue;
    const savedAt = savedAtOf(key as StoredKey) ?? 0;
    if (!keep(key, savedAt)) removeStored(key as StoredKey);
  }
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Un borrador de hace una semana ya no es de nadie: quien lo dejó no vuelve a
// ese formulario y su contenido está viejo. Se corre al iniciar sesión.
export function removeExpiredDrafts(now: number = Date.now()): void {
  for (const prefix of DRAFT_PREFIXES) {
    removeStoredWhere(prefix, (_key, savedAt) => now - savedAt < SEVEN_DAYS_MS);
  }
}
