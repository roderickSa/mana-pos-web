import { createResource, createSignal, For, Show, type Component } from 'solid-js';
import { DateField } from '@/shared/ui/DateField';

import {
  getExpiring,
  getExpiryAlertDays,
  setExpiryAlertDays,
  setProductExpiry,
} from '@/shared/api/inventory';
import { apiErrorMessage } from '@/shared/api/client';
import { formatKg } from '@/shared/lib/money';
import { beepError, beepSuccess } from '@/shared/lib/sounds';
import { showNotice } from '@/shared/state/notices';
import tabla from '@/shared/ui/tabla.module.css';
import forms from '@/shared/ui/forms.module.css';
import styles from './ExpiringTab.module.css';

function formatDay(value: string): string {
  return new Date(value).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export const ExpiringTab: Component = () => {
  const [list, { refetch }] = createResource(getExpiring);
  const [alertDays] = createResource(getExpiryAlertDays);
  const [days, setDays] = createSignal('');
  const [editing, setEditing] = createSignal<string | null>(null);
  const [newDate, setNewDate] = createSignal('');

  const daysValue = () => (days() !== '' ? days() : String(alertDays()?.days ?? 7));

  async function saveDays(): Promise<void> {
    const value = Number.parseInt(daysValue(), 10);
    if (Number.isNaN(value) || value < 1) return;
    try {
      const saved = await setExpiryAlertDays(value);
      beepSuccess();
      showNotice(`Avisaremos los vencimientos con ${saved.days} días de anticipación`);
      void refetch();
    } catch (cause) {
      beepError();
      showNotice(apiErrorMessage(cause, 'No se pudo guardar la configuración.'));
    }
  }

  async function updateExpiry(productId: string, expiryDate: string | null): Promise<void> {
    try {
      await setProductExpiry(productId, expiryDate);
      beepSuccess();
      showNotice(expiryDate === null ? 'Fecha de vencimiento quitada' : 'Fecha actualizada');
      setEditing(null);
      setNewDate('');
      void refetch();
    } catch (cause) {
      beepError();
      showNotice(apiErrorMessage(cause, 'No se pudo actualizar la fecha.'));
    }
  }

  return (
    <section class={tabla.vista}>
      <div class={tabla.encabezado}>
        <p class={styles.explicacion}>
          Productos vencidos o por vencer. La fecha se captura en la <b>entrada de mercancía</b>;
          al registrar la merma o reponer, actualízala o quítala aquí.
        </p>
        <span style={{ flex: '1' }} />
        <label class={styles.alerta}>
          Avisar con
          <input
            class={forms.input}
            style={{ 'max-width': '70px', 'text-align': 'center' }}
            type="number"
            min="1"
            max="90"
            value={daysValue()}
            onInput={(event) => setDays(event.currentTarget.value)}
            onKeyDown={(event) => event.key === 'Enter' && void saveDays()}
            onBlur={() => days() !== '' && void saveDays()}
          />
          días (se guarda solo)
        </label>
      </div>

      <div class={tabla.tablaContenedor}>
        <table class={tabla.tabla}>
          <thead>
            <tr>
              <th>Producto</th>
              <th class={tabla.num}>Stock</th>
              <th>Vence</th>
              <th>Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            <For each={list()?.items ?? []}>
              {(item) => (
                <tr>
                  <td class={tabla.nombre}>{item.name}</td>
                  <td class={tabla.num}>
                    {item.saleType === 'unit'
                      ? `${item.stockQuantity} unid.`
                      : formatKg(item.stockQuantity)}
                  </td>
                  <td class={tabla.sub}>{formatDay(item.expiryDate)}</td>
                  <td>
                    <span
                      class={styles.chip}
                      classList={{ [styles.chipVencido]: item.daysLeft <= 0 }}
                    >
                      {item.daysLeft <= 0
                        ? item.daysLeft === 0
                          ? 'vence hoy'
                          : `vencido hace ${-item.daysLeft} d`
                        : `vence en ${item.daysLeft} d`}
                    </span>
                  </td>
                  <td class={tabla.acciones}>
                    <Show
                      when={editing() === item.productId}
                      fallback={
                        <>
                          <button type="button" onClick={() => setEditing(item.productId)}>
                            Cambiar fecha
                          </button>
                          <button
                            type="button"
                            onClick={() => void updateExpiry(item.productId, null)}
                          >
                            Quitar
                          </button>
                        </>
                      }
                    >
                      <DateField
                        inputClass={forms.input}
                        style={{ 'max-width': '210px', display: 'inline-flex' }}
                        value={newDate()}
                        onChange={setNewDate}
                      />
                      <button
                        type="button"
                        disabled={newDate() === ''}
                        onClick={() => void updateExpiry(item.productId, newDate())}
                      >
                        OK
                      </button>
                      <button type="button" onClick={() => setEditing(null)}>
                        ✕
                      </button>
                    </Show>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
        <Show when={!list.loading && (list()?.items.length ?? 0) === 0}>
          <p class={tabla.vacio}>
            Nada por vencer en los próximos {list()?.alertDays ?? 7} días. Captura fechas de
            vencimiento en las entradas de mercancía para verlas aquí.
          </p>
        </Show>
      </div>
    </section>
  );
};
