import { Show, type Component, type JSX } from 'solid-js';

import styles from '@/shared/ui/TableFooter.module.css';

// Pie de tabla: siempre dice cuántas filas hay y, si hay más de una página,
// además pagina. Que el pie exista aunque no haya paginación es lo que quita
// la duda de «¿esto es todo o falta algo abajo?».
export const TableFooter: Component<{
  total: number;
  singular: string;
  plural: string;
  // Paginación: las tres van juntas o ninguna.
  page?: number;
  lastPage?: number;
  onPage?: (page: number) => void;
  // Dato extra a la derecha (un total en soles, por ejemplo).
  detail?: JSX.Element;
}> = (props) => {
  const paginado = (): boolean =>
    props.page !== undefined && props.lastPage !== undefined && props.onPage !== undefined;
  const page = (): number => props.page ?? 1;
  const lastPage = (): number => props.lastPage ?? 1;
  const conteo = (): string =>
    `${props.total} ${props.total === 1 ? props.singular : props.plural}`;

  return (
    // Tabla vacía: no hay nada que contar y el estado vacío ya lo explica. Va
    // con Show, no con un return temprano: el cuerpo del componente corre una
    // sola vez y no volvería a aparecer al llegar la primera fila.
    <Show when={props.total > 0}>
      <div class={styles.pie}>
        <Show when={paginado() && lastPage() > 1}>
          <button
            type="button"
            class={styles.paso}
            disabled={page() <= 1}
            onClick={() => props.onPage?.(page() - 1)}
          >
            ‹ Anterior
          </button>
        </Show>

        <span class={styles.conteo}>
          <Show when={paginado() && lastPage() > 1} fallback={conteo()}>
            Página {page()} de {lastPage()} · {conteo()}
          </Show>
        </span>

        <Show when={paginado() && lastPage() > 1}>
          <button
            type="button"
            class={styles.paso}
            disabled={page() >= lastPage()}
            onClick={() => props.onPage?.(page() + 1)}
          >
            Siguiente ›
          </button>
        </Show>

        <Show when={props.detail}>{(detail) => <span class={styles.detalle}>{detail()}</span>}</Show>
      </div>
    </Show>
  );
};
