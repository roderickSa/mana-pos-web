import { createResource, createSignal, For, Match, Show, Switch, type Component } from 'solid-js';

import {
  closeCash,
  getCashStatus,
  openCash,
  registerCashMovement,
  type CloseResultDto,
} from '@/shared/api/cash';
import { apiErrorMessage } from '@/shared/api/client';
import { formatSoles, solesInputToCents } from '@/shared/lib/money';
import { METHOD_LABELS } from '@/shared/lib/labels';
import { formatDateTime, formatTime } from '@/shared/lib/dates';
import { bumpCashRefresh, cashRefreshVersion } from '@/shared/state/cash-refresh';
import { showNotice } from '@/shared/state/notices';
import { currentUserName } from '@/shared/state/session';
import { Modal } from '@/shared/ui/Modal';
import forms from '@/shared/ui/forms.module.css';
import styles from './CashView.module.css';

type ModalState =
  | { kind: 'none' }
  | { kind: 'movement'; movementKind: 'withdrawal' | 'expense' }
  | { kind: 'close' }
  | { kind: 'closed'; result: CloseResultDto };

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

  async function doOpen(): Promise<void> {
    const cents = solesInputToCents(opening() === '' ? '0' : opening());
    if (cents === null) return;
    try {
      await openCash(shift(), cents, currentUserName());
      showNotice(`Caja abierta (${shift() === 'morning' ? 'turno mañana' : 'turno tarde'}) con ${formatSoles(cents)} de fondo`);
      bumpCashRefresh();
      void refetch();
    } catch (cause) {
      showNotice(apiErrorMessage(cause, 'No se pudo abrir la caja.'));
    }
  }

  return (
    <section class={styles.vista}>
      <Switch>
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
            <button type="button" class={styles.abrirBoton} onClick={() => void doOpen()}>
              Abrir caja
            </button>
            <Show when={closedInfo()?.lastClosed}>
              {(last) => (
                <p class={forms.nota}>
                  Último cierre:{' '}
                  {last().closedAt === null
                    ? '—'
                    : formatDateTime(last().closedAt ?? '')}{' '}
                  · contado {formatSoles(last().countedCashCents ?? 0)}
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
                        <div><span>Retiros</span><b>−{formatSoles(open().breakdown.withdrawalsCents)}</b></div>
                        <div><span>Gastos</span><b>−{formatSoles(open().breakdown.expensesCents)}</b></div>
                      </div>
                    </div>

                    <div class={styles.acciones}>
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
                            {movement.kind === 'withdrawal' ? 'Retiro' : 'Gasto'} · {movement.concept} ·{' '}
                            <b style={{ color: 'var(--peligro)' }}>−{formatSoles(movement.amountCents)}</b>
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

      {renderModal(modal(), setModal, () => {
        bumpCashRefresh();
        void refetch();
      })}
    </section>
  );
};

const MovementModal: Component<{
  movementKind: 'withdrawal' | 'expense';
  onDone: () => void;
  onClose: () => void;
}> = (props) => {
  const [amount, setAmount] = createSignal('');
  const [concept, setConcept] = createSignal('');
  const [error, setError] = createSignal('');

  async function save(): Promise<void> {
    const cents = solesInputToCents(amount());
    if (cents === null || cents <= 0 || concept().trim() === '') return;
    try {
      const result = await registerCashMovement(props.movementKind, cents, concept().trim(), currentUserName());
      showNotice(
        `${props.movementKind === 'withdrawal' ? 'Retiro' : 'Gasto'} de ${formatSoles(cents)} registrado — quedan ${formatSoles(result.currentCashCents)} en caja`,
      );
      props.onDone();
    } catch (cause) {
      setError(apiErrorMessage(cause, 'No se pudo registrar.'));
    }
  }

  return (
    <Modal
      title={props.movementKind === 'withdrawal' ? 'Retiro de efectivo' : 'Gasto desde caja'}
      onClose={props.onClose}
    >
      <div class={forms.form}>
        <div class={forms.fila}>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>Monto S/</span>
            <input
              class={forms.input}
              type="number"
              step="0.10"
              min="0"
              value={amount()}
              onInput={(event) => setAmount(event.currentTarget.value)}
              autofocus
            />
          </div>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>Concepto</span>
            <input
              class={forms.input}
              value={concept()}
              onInput={(event) => setConcept(event.currentTarget.value)}
              placeholder={props.movementKind === 'withdrawal' ? 'p. ej. a la bóveda' : 'p. ej. hielo, flete'}
              onKeyDown={(event) => event.key === 'Enter' && void save()}
            />
          </div>
        </div>
        <Show when={error() !== ''}>
          <p class={forms.error}>{error()}</p>
        </Show>
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" class={forms.primario} onClick={() => void save()}>
            Registrar
          </button>
        </div>
      </div>
    </Modal>
  );
};

const CloseModal: Component<{
  onClosed: (result: CloseResultDto) => void;
  onClose: () => void;
}> = (props) => {
  const [counted, setCounted] = createSignal('');
  const [error, setError] = createSignal('');

  async function save(): Promise<void> {
    const cents = solesInputToCents(counted());
    if (cents === null) return;
    try {
      const result = await closeCash(cents, currentUserName());
      props.onClosed(result);
    } catch (cause) {
      setError(apiErrorMessage(cause, 'No se pudo cerrar la caja.'));
    }
  }

  return (
    <Modal title="Cerrar caja — arqueo" onClose={props.onClose}>
      <div class={forms.form}>
        <p class={forms.nota}>
          Cuenta el efectivo del cajón y escríbelo. El sistema compara contra lo esperado y registra
          la diferencia (corte ciego: no te mostramos el esperado hasta después).
        </p>
        <div class={forms.campo}>
          <span class={forms.etiqueta}>Efectivo contado S/</span>
          <input
            class={forms.input}
            type="number"
            step="0.10"
            min="0"
            value={counted()}
            onInput={(event) => setCounted(event.currentTarget.value)}
            onKeyDown={(event) => event.key === 'Enter' && void save()}
            autofocus
          />
        </div>
        <Show when={error() !== ''}>
          <p class={forms.error}>{error()}</p>
        </Show>
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" class={forms.primario} onClick={() => void save()}>
            Cerrar caja
          </button>
        </div>
      </div>
    </Modal>
  );
};

const ClosedSummaryModal: Component<{ result: CloseResultDto; onClose: () => void }> = (props) => (
  <Modal title="Corte de caja" onClose={props.onClose}>
    <div class={forms.form}>
      <div class={styles.corteResumen}>
        <div><span>Esperado</span><b>{formatSoles(props.result.session.expectedCashCents ?? 0)}</b></div>
        <div><span>Contado</span><b>{formatSoles(props.result.session.countedCashCents ?? 0)}</b></div>
        <div
          classList={{
            [styles.diferenciaMala]: props.result.differenceCents !== 0,
            [styles.diferenciaOk]: props.result.differenceCents === 0,
          }}
        >
          <span>Diferencia</span>
          <b>
            {props.result.differenceCents === 0
              ? 'Cuadró ✓'
              : `${props.result.differenceCents > 0 ? '+' : ''}${formatSoles(props.result.differenceCents)}`}
          </b>
        </div>
      </div>
      <p class={forms.nota}>
        Fondo {formatSoles(props.result.breakdown.openingCents)} · ventas efectivo{' '}
        {formatSoles(props.result.breakdown.cashSalesCents)} · abonos{' '}
        {formatSoles(props.result.breakdown.cashAbonosCents)} · retiros −
        {formatSoles(props.result.breakdown.withdrawalsCents)} · gastos −
        {formatSoles(props.result.breakdown.expensesCents)}
      </p>
      <p class={forms.nota}>
        Ventas del turno por método:{' '}
        {props.result.salesByMethod
          .map((entry) => `${METHOD_LABELS[entry.method] ?? entry.method} ${formatSoles(entry.amountCents)}`)
          .join(' · ') || 'sin ventas'}
      </p>
      <div class={forms.acciones}>
        <button type="button" class={forms.primario} onClick={props.onClose} autofocus>
          Listo
        </button>
      </div>
    </div>
  </Modal>
);

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
