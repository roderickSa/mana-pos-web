import { createResource, For, Show, type Component } from 'solid-js';

import { type CashHistoryPageDto, type ClosedCashSessionDto, getCashHistory } from '@/shared/api/cash';
import {formatSoles } from '@/shared/lib/money';
import {formatDateTime } from '@/shared/lib/dates';
import { EmptyState } from '@/shared/ui/EmptyState';
import { TableFooter } from '@/shared/ui/TableFooter';
import tablaCss from '@/shared/ui/tabla.module.css';
import { createUrlNumber } from '@/shared/lib/url-state';
import styles from '../CashView.module.css';

// Dos turnos por día son ~700 cierres al año: se piden de a página.
const PER_PAGE = 20;

const VACIO: CashHistoryPageDto = { items: [], total: 0, page: 1, perPage: PER_PAGE };

export const ClosingsHistory: Component<{ version: number }> = (props) => {
  const [page, setPage] = createUrlNumber('cierres', 1);
  const [history] = createResource(
    () => ({ version: props.version, page: page() }),
    (params) => getCashHistory(params.page, PER_PAGE).catch(() => VACIO),
  );
  const items = () => history()?.items ?? [];
  const total = () => history()?.total ?? 0;
  const lastPage = () => Math.max(1, Math.ceil(total() / PER_PAGE));

  const difference = (session: ClosedCashSessionDto) =>
    session.countedCashCents - session.expectedCashCents;

  return (
    <div class={`${styles.movimientos} ${styles.historial}`}>
      <h3>Cierres anteriores</h3>
      <Show
        when={items().length > 0}
        fallback={
          <EmptyState message="Aún no cerraste ninguna caja. Al cerrar el turno, el arqueo queda aquí." />
        }
      >
        {/* Información tabular en tabla real: la diferencia es columna propia. */}
        <div class={styles.historialTabla}>
          <table class={tablaCss.tabla}>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Turno</th>
                <th class={tablaCss.num}>Esperado</th>
                <th class={tablaCss.num}>Contado</th>
                <th class={tablaCss.num}>Diferencia</th>
                <th>Contó</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              <For each={items()}>
                {(session) => (
                  <tr>
                    <td class={tablaCss.sub}>
                      {formatDateTime(session.closedAt)}
                    </td>
                    <td class={tablaCss.sub}>{session.shift === 'morning' ? 'mañana' : 'tarde'}</td>
                    <td class={tablaCss.num}>{formatSoles(session.expectedCashCents)}</td>
                    <td class={tablaCss.num}>{formatSoles(session.countedCashCents)}</td>
                    {/* Sobrante (ámbar) y faltante (rojo) no son lo mismo:
                        faltante = plata que no está; sobrante = error de cobro. */}
                    <td
                      class={tablaCss.num}
                      style={{
                        color:
                          difference(session) === 0
                            ? 'var(--exito)'
                            : difference(session) > 0
                              ? 'var(--alerta)'
                              : 'var(--peligro)',
                        'font-weight': '700',
                      }}
                    >
                      {difference(session) === 0
                        ? 'cuadró'
                        : difference(session) > 0
                          ? `+${formatSoles(difference(session))} sobró`
                          : `${formatSoles(difference(session))} faltó`}
                    </td>
                    <td class={tablaCss.sub}>{session.closedBy}</td>
                    <td class={tablaCss.sub}>{session.closingNote ?? '—'}</td>
                  </tr>
                )}
              </For>
              </tbody>
          </table>
        </div>
        <TableFooter
          total={total()}
          singular="cierre"
          plural="cierres"
          page={page()}
          lastPage={lastPage()}
          onPage={setPage}
        />
      </Show>
    </div>
  );
};
