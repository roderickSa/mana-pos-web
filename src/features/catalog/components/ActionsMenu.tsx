import { type Component } from 'solid-js';

import { RowMenu } from '@/shared/ui/RowMenu';

// Solo lo del producto en sí: entradas/mermas/conteos viven en el tab Ajustes,
// y el histórico en el tab Kardex.
export type ProductAction = 'price' | 'stock' | 'edit' | 'merge';

const ACTIONS: Array<{ key: ProductAction; label: string }> = [
  { key: 'price', label: 'Actualizar precio' },
  { key: 'stock', label: 'Actualizar stock' },
  { key: 'edit', label: 'Editar producto' },
  { key: 'merge', label: 'Fusionar duplicado…' },
];

export const ActionsMenu: Component<{ onSelect: (action: ProductAction) => void }> = (props) => (
  <RowMenu
    label="Acciones ▾"
    ariaLabel="Acciones del producto"
    items={ACTIONS}
    onSelect={(key) => {
      const action = ACTIONS.find((item) => item.key === key);
      if (action !== undefined) props.onSelect(action.key);
    }}
  />
);
