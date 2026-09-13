import { useSearchParams } from '@solidjs/router';

// Filtros, búsquedas y páginas viven en la URL: así la pantalla se puede
// recargar, compartir y volver atrás. Estos helpers dan la misma forma que
// `createSignal` para que las vistas cambien lo mínimo.
//
// Dos reglas en todos:
//   · Se escribe con `replace`, no `push`: tecleando en un buscador si no cada
//     letra sería una entrada del historial y el botón Atrás quedaría inútil.
//   · El valor por defecto NO se escribe. Una vista sin tocar tiene la URL
//     limpia, y `?pagina=1` nunca aparece.

// Un parámetro de la URL puede venir repetido (`?q=a&q=b`); el router lo
// entrega como arreglo. Se toma el primero, que es lo que un humano escribió.
function firstValue(raw: string | string[] | undefined): string | undefined {
  if (raw === undefined) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

export function parseNumberParam(raw: string | string[] | undefined, fallback: number): number {
  const value = firstValue(raw);
  if (value === undefined || value.trim() === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 1 ? fallback : parsed;
}

export function parseBooleanParam(raw: string | string[] | undefined, fallback: boolean): boolean {
  const value = firstValue(raw);
  if (value === undefined) return fallback;
  return value === 'true' || value === '1';
}

export function parseTextParam(raw: string | string[] | undefined, fallback: string): string {
  return firstValue(raw) ?? fallback;
}

export type UrlSignal<T> = [() => T, (value: T) => void];

export function createUrlText(name: string, fallback = ''): UrlSignal<string> {
  const [params, setParams] = useSearchParams();
  const read = (): string => parseTextParam(params[name], fallback);
  const write = (value: string): void => {
    setParams({ [name]: value === fallback ? undefined : value }, { replace: true });
  };
  return [read, write];
}

export function createUrlNumber(name: string, fallback: number): UrlSignal<number> {
  const [params, setParams] = useSearchParams();
  const read = (): number => parseNumberParam(params[name], fallback);
  const write = (value: number): void => {
    setParams({ [name]: value === fallback ? undefined : String(value) }, { replace: true });
  };
  return [read, write];
}

export function createUrlBoolean(name: string, fallback: boolean): UrlSignal<boolean> {
  const [params, setParams] = useSearchParams();
  const read = (): boolean => parseBooleanParam(params[name], fallback);
  const write = (value: boolean): void => {
    setParams({ [name]: value === fallback ? undefined : String(value) }, { replace: true });
  };
  return [read, write];
}

// Un filtro que solo acepta ciertos valores: lo que no esté en la lista se
// trata como ausente. Sin esto, `?estado=loquesea` llegaría al servidor.
export function createUrlOption<T extends string>(
  name: string,
  options: readonly T[],
  fallback: T,
): UrlSignal<T> {
  const [params, setParams] = useSearchParams();
  const read = (): T => {
    const value = firstValue(params[name]);
    return options.find((option) => option === value) ?? fallback;
  };
  const write = (value: T): void => {
    setParams({ [name]: value === fallback ? undefined : value }, { replace: true });
  };
  return [read, write];
}
