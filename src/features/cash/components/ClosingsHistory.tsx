import {createResource, For, Show, type Component } from 'solid-js';

import { type ClosedCashSessionDto, getCashHistory } from '@/shared/api/cash';
import {formatSoles } from '@/shared/lib/money';
import {formatDateTime } from '@/shared/lib/dates';
import tablaCss from '@/shared/ui/tabla.module.css';
import styles from '../CashView.module.css';

export const ClosingsHistory: Component<{ version: number }> = (props) => {
  const [history] = createResource(
    () => props.version,
    () => getCashHistory().catch((): ClosedCashSessionDto[] => []),
  );

  const difference = (session: ClosedCashSessionDto) =>
    session.countedCashCents - session.expectedCashCents;

  return (
    <Show when={(history() ?? []).length > 0}>
      <div class={styles.movimientos}>
        <h3>Cierres anteriores</h3>
        {/* Información tabular en tabla real: la diferencia es columna propia. */}
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
            <For each={history() ?? []}>
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
    </Show>
  );
};
