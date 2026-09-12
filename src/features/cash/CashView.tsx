import { createResource, createSignal, For, Match, Show, Switch, type Component } from 'solid-js';

import {getCashStatus, openCash } from '@/shared/api/cash';
import {apiErrorMessage } from '@/shared/api/client';
import { DIME_MESSAGE, formatSoles, isDimeCents, solesInputToCents } from '@/shared/lib/money';
import { formatDateTime, formatTime } from '@/shared/lib/dates';
import {bumpCashRefresh, cashRefreshVersion } from '@/shared/state/cash-refresh';
import {showNotice } from '@/shared/state/notices';
import {beepError, beepSuccess } from '@/shared/lib/sounds';
import forms from '@/shared/ui/forms.module.css';
import styles from './CashView.module.css';
import { MOVEMENT_LABELS, type ModalState } from './components/cash.helpers';
import { ClosingsHistory } from './components/ClosingsHistory';
import { MovementModal } from './components/MovementModal';
import { CloseModal } from './components/CloseModal';
import { ClosedSummaryModal } from './components/ClosedSummaryModal';
export const CashView: Component = () => {
  const [status, { refetch }] = createResource(
    () => cashRefreshVersion(),
    () => getCashStatus(),
  );
  const [modal, setModal] = createSignal<ModalState>({ kind: 'none' });

  // Apertura
  const closedInfo = () => {
    const value = status();
    return value !== undefined && value.open === false ? value : null;
  };

  const currentHour = new Date().getHours();
  const [shift, setShift] = createSignal<'morning' | 'afternoon'>(currentHour < 14 ? 'morning' : 'afternoon');
  const [opening, setOpening] = createSignal('');

  const [openingCash, setOpeningCash] = createSignal(false);

  async function doOpen(): Promise<void> {
    if (openingCash()) return;
    const cents = solesInputToCents(opening() === '' ? '0' : opening());
    if (cents === null) return;
    if (!isDimeCents(cents)) {
      beepError();
      showNotice(DIME_MESSAGE);
      return;
    }
    setOpeningCash(true);
    try {
      await openCash(shift(), cents);
      beepSuccess();
      showNotice(`Caja abierta (${shift() === 'morning' ? 'turno mañana' : 'turno tarde'}) con ${formatSoles(cents)} de fondo`);
      bumpCashRefresh();
      void refetch();
    } catch (cause) {
      beepError();
      showNotice(apiErrorMessage(cause, 'No se pudo abrir la caja.'));
    } finally {
      setOpeningCash(false);
    }
  }

  return (
    <section class={styles.vista}>
      <Switch>
        <Match when={status.error !== undefined}>
          <div class={styles.abrirCard}>
            <h2>No se pudo cargar la caja</h2>
            <p class={forms.nota}>{apiErrorMessage(status.error, 'Revisa que el sistema local esté activo.')}</p>
            <button type="button" class={styles.abrirBoton} onClick={() => void refetch()}>
              Reintentar
            </button>
          </div>
        </Match>
        <Match when={status()?.open === false}>
          <div class={styles.abrirCard}>
            <h2>La caja está cerrada</h2>
            <p class={forms.nota}>
              Abre la caja con el fondo inicial (sencillo para el vuelto) para empezar a vender.
            </p>
            <div class={forms.fila}>
              <div class={forms.campo}>
                <span class={forms.etiqueta}>Turno</span>
                <select
                  class={forms.select}
                  value={shift()}
                  onChange={(event) => setShift(event.currentTarget.value === 'afternoon' ? 'afternoon' : 'morning')}
                >
                  <option value="morning">Mañana</option>
                  <option value="afternoon">Tarde</option>
                </select>
              </div>
              <div class={forms.campo}>
                <span class={forms.etiqueta}>Fondo inicial S/</span>
                <input
                  class={forms.input}
                  type="number"
                  step="0.10"
                  min="0"
                  placeholder="0.00"
                  value={opening()}
                  onInput={(event) => setOpening(event.currentTarget.value)}
                  onKeyDown={(event) => event.key === 'Enter' && void doOpen()}
                  autofocus
                />
              </div>
            </div>
            <button type="button" class={styles.abrirBoton} disabled={openingCash()} onClick={() => void doOpen()}>
              Abrir caja
            </button>
            <Show when={closedInfo()?.lastClosed}>
              {(last) => (
                <p class={forms.nota}>
                  Último cierre:{' '}
                  {formatDateTime(last().closedAt)} · contado {formatSoles(last().countedCashCents)}
                </p>
              )}
            </Show>
          </div>
        </Match>

        <Match when={status()?.open === true}>
          {(_) => {
            const data = () => {
              const value = status();
              return value?.open === true ? value : null;
            };
            return (
              <Show when={data()}>
                {(open) => (
                  <>
                    <div class={styles.encabezado}>
                      <div class={styles.efectivoCard}>
                        <span>Efectivo en caja</span>
                        <b>{formatSoles(open().breakdown.currentCashCents)}</b>
                        <span class={styles.sub}>
                          {open().session.shift === 'morning' ? 'Turno mañana' : 'Turno tarde'} · abierta{' '}
                          {formatTime(open().session.openedAt)}{' '}
                          por {open().session.openedBy}
                        </span>
                      </div>

                      <div class={styles.desglose}>
                        <div><span>Fondo inicial</span><b>{formatSoles(open().breakdown.openingCents)}</b></div>
                        <div><span>Ventas en efectivo</span><b>{formatSoles(open().breakdown.cashSalesCents)}</b></div>
                        <div><span>Abonos de fiado</span><b>{formatSoles(open().breakdown.cashAbonosCents)}</b></div>
                        <div><span>Ingresos de efectivo</span><b>{formatSoles(open().breakdown.depositsCents)}</b></div>
                        <div><span>Retiros</span><b>−{formatSoles(open().breakdown.withdrawalsCents)}</b></div>
                        <div><span>Gastos</span><b>−{formatSoles(open().breakdown.expensesCents)}</b></div>
                        <Show when={open().breakdown.refundsCents > 0}>
                          <div><span>Devoluciones</span><b>−{formatSoles(open().breakdown.refundsCents)}</b></div>
                        </Show>
                      </div>
                    </div>

                    <div class={styles.acciones}>
                      <button type="button" onClick={() => setModal({ kind: 'movement', movementKind: 'deposit' })}>
                        Ingreso de efectivo
                      </button>
                      <button type="button" onClick={() => setModal({ kind: 'movement', movementKind: 'withdrawal' })}>
                        Retiro de efectivo
                      </button>
                      <button type="button" onClick={() => setModal({ kind: 'movement', movementKind: 'expense' })}>
                        Gasto desde caja
                      </button>
                      <button type="button" class={styles.cerrar} onClick={() => setModal({ kind: 'close' })}>
                        Cerrar caja (corte)
                      </button>
                    </div>

                    <div class={styles.movimientos}>
                      <h3>Movimientos del turno</h3>
                      <For each={open().movements}>
                        {(movement) => (
                          <p class={forms.nota} style={{ 'border-bottom': '1px dashed var(--linea)', padding: '6px 0' }}>
                            {formatTime(movement.createdAt)}
                            {' · '}
                            {MOVEMENT_LABELS[movement.kind]} · {movement.concept} ·{' '}
                            <b style={{ color: movement.kind === 'deposit' ? 'var(--exito)' : 'var(--peligro)' }}>
                              {movement.kind === 'deposit' ? '+' : '−'}
                              {formatSoles(movement.amountCents)}
                            </b>
                          </p>
                        )}
                      </For>
                      <Show when={open().movements.length === 0}>
                        <p class={forms.nota}>Sin retiros ni gastos en este turno.</p>
                      </Show>
                    </div>
                  </>
                )}
              </Show>
            );
          }}
        </Match>
      </Switch>

      <ClosingsHistory version={cashRefreshVersion()} />

      {renderModal(modal(), setModal, () => {
        bumpCashRefresh();
        void refetch();
      })}
    </section>
  );
};

// Cortes anteriores: hoy sí se puede ver el cierre de ayer sin reimprimirlo.
function renderModal(
  state: ModalState,
  setModal: (state: ModalState) => void,
  refresh: () => void,
) {
  switch (state.kind) {
    case 'none':
      return null;
    case 'movement':
      return (
        <MovementModal
          movementKind={state.movementKind}
          onDone={() => {
            setModal({ kind: 'none' });
            refresh();
          }}
          onClose={() => setModal({ kind: 'none' })}
        />
      );
    case 'close':
      return (
        <CloseModal
          onClosed={(result) => {
            setModal({ kind: 'closed', result });
            refresh();
          }}
          onClose={() => setModal({ kind: 'none' })}
        />
      );
    case 'closed':
      return <ClosedSummaryModal result={state.result} onClose={() => setModal({ kind: 'none' })} />;
  }
}
