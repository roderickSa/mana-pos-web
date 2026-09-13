import type { ProductAction } from './ActionsMenu';

// Qué modal del catálogo está abierto, leído de la URL. El listado es la ruta
// padre y sigue montado detrás; el modal existe porque la ruta trae su id.
export type ProductModalRoute =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'import' }
  | { kind: 'bulk-prices' }
  | { kind: ProductAction; id: string };

// Nombres de ruta en español, como el resto de la app.
const SEGMENT_OF: Record<ProductAction, string> = {
  edit: 'editar',
  price: 'precio',
  stock: 'stock',
  merge: 'fusionar',
};

const ACTION_OF = new Map<string, ProductAction>(
  Object.entries(SEGMENT_OF).map(([action, segment]) => [segment, action as ProductAction]),
);

export const PRODUCTS_PATH = '/productos';

export function productActionPath(id: string, action: ProductAction): string {
  return `${PRODUCTS_PATH}/${id}/${SEGMENT_OF[action]}`;
}

export function parseProductModal(segments: readonly string[]): ProductModalRoute {
  const [first, second] = segments;
  if (first === undefined) return { kind: 'none' };
  if (segments.length === 1) {
    if (first === 'nuevo') return { kind: 'create' };
    if (first === 'importar') return { kind: 'import' };
    if (first === 'precios') return { kind: 'bulk-prices' };
    return { kind: 'none' };
  }
  if (segments.length === 2 && second !== undefined) {
    const action = ACTION_OF.get(second);
    if (action !== undefined) return { kind: action, id: first };
  }
  return { kind: 'none' };
}

// El producto del modal solo hace falta cuando la ruta trae un id.
export function openProductId(route: ProductModalRoute): string | undefined {
  return 'id' in route ? route.id : undefined;
}
