import { Switch, Match, type Component } from 'solid-js';

// Íconos minimalistas por categoría: trazo simple, color heredado (currentColor).
// Default cuando el producto no tiene imagen propia.
export const CategoryIcon: Component<{ category: string }> = (props) => (
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
      <Match when={props.category === 'frutas-verduras'}>
        {/* manzana */}
        <path d="M12 8c-3.5-2-7 .5-7 4.5S8 20 12 20s7-3.5 7-7.5-3.5-6.5-7-4.5z" />
        <path d="M12 8c0-2 1-3.5 3-4" />
      </Match>
      <Match when={props.category === 'bebidas'}>
        {/* botella */}
        <path d="M10 3h4v3l1.5 3v10a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 8.5 19V9L10 6V3z" />
        <path d="M8.5 13h7" />
      </Match>
      <Match when={props.category === 'limpieza'}>
        {/* atomizador */}
        <path d="M9 9h6l1 11H8L9 9z" />
        <path d="M11 9V6h4V3h-5a2 2 0 0 0-2 2v1" />
        <path d="M18 4h2M18 6.5l1.7 1" />
      </Match>
      <Match when={props.category === 'pan'}>
        {/* pan */}
        <path d="M4 13c0-3.5 3.5-6 8-6s8 2.5 8 6c0 1.5-1 2.5-2 2.5V19H6v-3.5c-1 0-2-1-2-2.5z" />
        <path d="M9.5 10.5l-1 2M14.5 10.5l-1 2" />
      </Match>
    </Switch>
  </svg>
);
