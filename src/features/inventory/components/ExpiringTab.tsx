import { createResource, createSignal, For, Show, type Component } from 'solid-js';
import { DateField } from '@/shared/ui/DateField';
import { Modal } from '@/shared/ui/Modal';

import {
  deleteLot,
  getExpiring,
  getExpiryAlertDays,
  registerLotWaste,
  setExpiryAlertDays,
  updateLotExpiry,
  type ExpiringItemDto,
} from '@/shared/api/inventory';
import { apiErrorMessage } from '@/shared/api/client';
import { formatKg } from '@/shared/lib/money';
import { beepError, beepSuccess } from '@/shared/lib/sounds';
import { showNotice } from '@/shared/state/notices';
import tabla from '@/shared/ui/tabla.module.css';
import forms from '@/shared/ui/forms.module.css';
import { formatDateOnly } from '@/shared/lib/dates';
import styles from './ExpiringTab.module.css';


export const ExpiringTab: Component = () => {
  const [list, { refetch }] = createResource(getExpiring);
  const [alertDays] = createResource(getExpiryAlertDays);
  const [days, setDays] = createSignal('');
  const [editing, setEditing] = createSignal<string | null>(null);
  const [newDate, setNewDate] = createSignal('');
  const [merma, setMerma] = createSignal<ExpiringItemDto | null>(null);
  const [mermaQty, setMermaQty] = createSignal('');

  // La alerta lleva directo a la acción que la resuelve: merma del LOTE en
  // 2 toques — descuenta stock, queda en el kardex y consume el lote (si se
  // da de baja completo, deja de alertar solo).
  async function saveMerma(): Promise<void> {
    const item = merma();
    if (item === null) return;
    const parsed = Number.parseFloat(mermaQty());
    const quantity = item.saleType === 'weight' ? Math.round(parsed * 1000) : Math.round(parsed);
    if (Number.isNaN(quantity) || quantity <= 0) return;
    try {
      await registerLotWaste(item.lotId, quantity);
      beepSuccess();
      showNotice('Merma registrada — quedó en el kardex');
      setMerma(null);
      setMermaQty('');
      void refetch();
    } catch (cause) {
      beepError();
      showNotice(apiErrorMessage(cause, 'No se pudo registrar la merma.'));
    }
  }

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

  async function changeLotDate(lotId: string, expiryDate: string): Promise<void> {
    try {
      await updateLotExpiry(lotId, expiryDate);
      beepSuccess();
      showNotice('Fecha del lote actualizada');
      setEditing(null);
      setNewDate('');
      void refetch();
    } catch (cause) {
      beepError();
      showNotice(apiErrorMessage(cause, 'No se pudo actualizar la fecha.'));
    }
  }

  async function removeLotAlert(lotId: string): Promise<void> {
    try {
      await deleteLot(lotId);
      beepSuccess();
      showNotice('Lote quitado de la alerta (el stock no cambia)');
      void refetch();
    } catch (cause) {
      beepError();
      showNotice(apiErrorMessage(cause, 'No se pudo quitar el lote.'));
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
              <th class={tabla.num}>Del lote quedan</th>
              <th>Llegó</th>
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
                    {item.saleType === 'unit' ? `${item.quantity} unid.` : formatKg(item.quantity)}
                  </td>
                  <td class={tabla.sub}>{formatDateOnly(item.receivedAt)}</td>
                  <td class={tabla.sub}>{formatDateOnly(item.expiryDate)}</td>
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
                      when={editing() === item.lotId}
                      fallback={
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setMermaQty('');
                              setMerma(item);
                            }}
                          >
                            Registrar merma
                          </button>
                          <button type="button" onClick={() => setEditing(item.lotId)}>
                            Cambiar fecha
                          </button>
                          <button
                            type="button"
                            onClick={() => void removeLotAlert(item.lotId)}
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
                        onClick={() => void changeLotDate(item.lotId, newDate())}
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

      <Show when={merma()}>
        {(item) => (
          <Modal
            size="sm"
            title={`Merma de ${item().name}`}
            onClose={() => setMerma(null)}
            footer={
              <div class={forms.acciones}>
                <button type="button" class={forms.secundario} onClick={() => setMerma(null)}>
                  Volver
                </button>
                <button
                  type="button"
                  class={forms.primario}
                  disabled={mermaQty() === '' || Number.parseFloat(mermaQty()) <= 0}
                  onClick={() => void saveMerma()}
                >
                  Registrar merma
                </button>
              </div>
            }
          >
            <div class={forms.form}>
              <div class={forms.campo}>
                <span class={forms.etiqueta}>
                  {item().saleType === 'weight' ? 'Kilos a dar de baja' : 'Unidades a dar de baja'}
                </span>
                <input
                  class={forms.input}
                  type="number"
                  min="0"
                  step={item().saleType === 'weight' ? '0.1' : '1'}
                  value={mermaQty()}
                  onInput={(event) => setMermaQty(event.currentTarget.value)}
                  onKeyDown={(event) => event.key === 'Enter' && void saveMerma()}
                  autofocus
                />
              </div>
              <p class={forms.nota}>
                De este lote quedan:{' '}
                {item().saleType === 'unit'
                  ? `${item().quantity} unid.`
                  : formatKg(item().quantity)}
                . Descuenta stock y queda en el kardex como vencimiento. Si das de baja el lote
                completo, deja de alertar solo.
              </p>
            </div>
          </Modal>
        )}
      </Show>
    </section>
  );
};
