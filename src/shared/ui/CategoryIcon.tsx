import { Switch, Match, type Component } from 'solid-js';

// Llaves de ícono elegibles por categoría (Ajustes → Categorías).
export const CATEGORY_ICON_KEYS = [
  'bolsa',
  'manzana',
  'botella',
  'limpieza',
  'pan',
  'carne',
  'lacteo',
  'dulce',
  'mascota',
  'nieve',
] as const;

// Categorías creadas antes de que el ícono fuera elegible: se mapean por slug.
const LEGACY_SLUG_ICON: Record<string, string> = {
  'frutas-verduras': 'manzana',
  bebidas: 'botella',
  limpieza: 'limpieza',
  pan: 'pan',
};

// Íconos minimalistas: trazo simple, color heredado (currentColor).
// Default cuando el producto no tiene imagen propia.
export const CategoryIcon: Component<{ category: string; icon?: string | null }> = (props) => {
  const key = () => props.icon ?? LEGACY_SLUG_ICON[props.category] ?? 'bolsa';
  return (
    <svg
      viewBox="0 0 24 24"
      width="100%"
      height="100%"
      fill="none"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <Switch
        fallback={
          <>
            {/* bolsa de abarrotes */}
            <path d="M6 8h12l-1 12H7L6 8z" />
            <path d="M9 8V6a3 3 0 0 1 6 0v2" />
          </>
        }
      >
        <Match when={key() === 'manzana'}>
          <path d="M12 8c-3.5-2-7 .5-7 4.5S8 20 12 20s7-3.5 7-7.5-3.5-6.5-7-4.5z" />
          <path d="M12 8c0-2 1-3.5 3-4" />
        </Match>
        <Match when={key() === 'botella'}>
          <path d="M10 3h4v3l1.5 3v10a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 8.5 19V9L10 6V3z" />
          <path d="M8.5 13h7" />
        </Match>
        <Match when={key() === 'limpieza'}>
          <path d="M9 9h6l1 11H8L9 9z" />
          <path d="M11 9V6h4V3h-5a2 2 0 0 0-2 2v1" />
          <path d="M18 4h2M18 6.5l1.7 1" />
        </Match>
        <Match when={key() === 'pan'}>
          <path d="M4 13c0-3.5 3.5-6 8-6s8 2.5 8 6c0 1.5-1 2.5-2 2.5V19H6v-3.5c-1 0-2-1-2-2.5z" />
          <path d="M9.5 10.5l-1 2M14.5 10.5l-1 2" />
        </Match>
        <Match when={key() === 'carne'}>
          {/* muslo */}
          <path d="M15 4a5 5 0 0 1 0 10c-1.2 0-2.2-.3-3-.9L8 17l-1.5-1.5L10.9 12c-.6-.8-.9-1.8-.9-3a5 5 0 0 1 5-5z" />
          <path d="M6.5 15.5l-2 2a1.4 1.4 0 1 0 2 2l2-2" />
        </Match>
        <Match when={key() === 'lacteo'}>
          {/* caja de leche */}
          <path d="M8 3h8v3l1.5 3v11H6.5V9L8 6V3z" />
          <path d="M8 6h8M6.5 9h11" />
        </Match>
        <Match when={key() === 'dulce'}>
          {/* caramelo */}
          <circle cx="12" cy="12" r="4" />
          <path d="M8.5 9.5L4 6l1 5M15.5 9.5L20 6l-1 5M8.5 14.5L4 18l1-5M15.5 14.5L20 18l-1-5" />
        </Match>
        <Match when={key() === 'mascota'}>
          {/* huella */}
          <circle cx="12" cy="14.5" r="3.4" />
          <circle cx="6.5" cy="10" r="1.7" />
          <circle cx="10" cy="6.5" r="1.7" />
          <circle cx="14" cy="6.5" r="1.7" />
          <circle cx="17.5" cy="10" r="1.7" />
        </Match>
        <Match when={key() === 'nieve'}>
          {/* copo (congelados) */}
          <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
          <path d="M12 3l-2 2m2-2l2 2M12 21l-2-2m2 2l2-2" />
        </Match>
      </Switch>
    </svg>
  );
};
