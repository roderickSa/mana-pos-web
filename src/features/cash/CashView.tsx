import { createResource, createSignal, For, Match, Show, Switch, type Component } from 'solid-js';
import { Keypad } from '@/shared/ui/Keypad';

import {
  closeCash,
  getCashStatus,
  openCash,
  registerCashMovement,
  type CashSessionDto,
  type CloseResultDto, getCashHistory, printLastCloseSummary,
} from '@/shared/api/cash';
import { ApiError, apiErrorMessage } from '@/shared/api/client';
import { DIME_MESSAGE, formatSoles, isDimeCents, solesInputToCents } from '@/shared/lib/money';
import { METHOD_LABELS } from '@/shared/lib/labels';
import { formatDateTime, formatTime } from '@/shared/lib/dates';
import { bumpCashRefresh, cashRefreshVersion } from '@/shared/state/cash-refresh';
import { showNotice } from '@/shared/state/notices';
import { beepError, beepSuccess } from '@/shared/lib/sounds';
import { currentUserName } from '@/shared/state/session';
import { Modal } from '@/shared/ui/Modal';
import forms from '@/shared/ui/forms.module.css';
import tablaCss from '@/shared/ui/tabla.module.css';
import styles from './CashView.module.css';

const MOVEMENT_LABELS: Record<'withdrawal' | 'expense' | 'deposit' | 'refund', string> = {
  withdrawal: 'Retiro',
  expense: 'Gasto',
  deposit: 'Ingreso',
  refund: 'Devolución',
};

type ModalState =
  | { kind: 'none' }
  | { kind: 'movement'; movementKind: 'withdrawal' | 'expense' | 'deposit' }
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
    if (!isDimeCents(cents)) {
      beepError();
      showNotice(DIME_MESSAGE);
      return;
    }
    try {
      await openCash(shift(), cents, currentUserName());
      beepSuccess();
      showNotice(`Caja abierta (${shift() === 'morning' ? 'turno mañana' : 'turno tarde'}) con ${formatSoles(cents)} de fondo`);
      bumpCashRefresh();
      void refetch();
    } catch (cause) {
      beepError();
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
const ClosingsHistory: Component<{ version: number }> = (props) => {
  const [history] = createResource(
    () => props.version,
    () => getCashHistory().catch((): CashSessionDto[] => []),
  );

  const difference = (session: CashSessionDto) =>
    (session.countedCashCents ?? 0) - (session.expectedCashCents ?? 0);

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
                    {session.closedAt === null ? '—' : formatDateTime(session.closedAt)}
                  </td>
                  <td class={tablaCss.sub}>{session.shift === 'morning' ? 'mañana' : 'tarde'}</td>
                  <td class={tablaCss.num}>{formatSoles(session.expectedCashCents ?? 0)}</td>
                  <td class={tablaCss.num}>{formatSoles(session.countedCashCents ?? 0)}</td>
                  <td
                    class={tablaCss.num}
                    style={{
                      color: difference(session) === 0 ? 'var(--exito)' : 'var(--peligro)',
                      'font-weight': '700',
                    }}
                  >
                    {difference(session) === 0
                      ? 'cuadró'
                      : `${difference(session) > 0 ? '+' : ''}${formatSoles(difference(session))}`}
                  </td>
                  <td class={tablaCss.sub}>{session.closedBy ?? '—'}</td>
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

const MovementModal: Component<{
  movementKind: 'withdrawal' | 'expense' | 'deposit';
  onDone: () => void;
  onClose: () => void;
}> = (props) => {
  const [amount, setAmount] = createSignal('');
  const [concept, setConcept] = createSignal('');
  const [error, setError] = createSignal('');

  async function save(): Promise<void> {
    const cents = solesInputToCents(amount());
    if (cents === null || cents <= 0 || concept().trim() === '') return;
    if (!isDimeCents(cents)) {
      setError(DIME_MESSAGE);
      return;
    }
    try {
      const result = await registerCashMovement(props.movementKind, cents, concept().trim(), currentUserName());
      beepSuccess();
      showNotice(
        `${MOVEMENT_LABELS[props.movementKind]} de ${formatSoles(cents)} registrado — quedan ${formatSoles(result.currentCashCents)} en caja`,
      );
      props.onDone();
    } catch (cause) {
      beepError();
      setError(apiErrorMessage(cause, 'No se pudo registrar.'));
    }
  }

  return (
    <Modal
      title={
        props.movementKind === 'withdrawal'
          ? 'Retiro de efectivo'
          : props.movementKind === 'expense'
            ? 'Gasto desde caja'
            : 'Ingreso de efectivo (refuerzo de fondo)'
      }
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
              placeholder={
                props.movementKind === 'withdrawal'
                  ? 'p. ej. a la bóveda'
                  : props.movementKind === 'expense'
                    ? 'p. ej. hielo, flete'
                    : 'p. ej. sencillo para vuelto'
              }
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
  const [saving, setSaving] = createSignal(false);
  const [note, setNote] = createSignal('');
  // El corte sigue siendo ciego: la nota solo aparece cuando el API detecta
  // descuadre (409 NOTE_REQUIRED) y recién ahí se revela la diferencia.
  const [noteRequired, setNoteRequired] = createSignal(false);

  async function save(): Promise<void> {
    const cents = solesInputToCents(counted());
    // El guard evita el doble-Enter que duplicaba cierres (visto el 31-jul).
    if (cents === null || saving()) return;
    if (!isDimeCents(cents)) {
      beepError();
      showNotice(DIME_MESSAGE);
      return;
    }
    setSaving(true);
    try {
      const result = await closeCash(
        cents,
        currentUserName(),
        note().trim() === '' ? null : note().trim(),
      );
      beepSuccess();
      props.onClosed(result);
    } catch (cause) {
      beepError();
      if (cause instanceof ApiError && cause.code === 'NOTE_REQUIRED') {
        setNoteRequired(true);
      }
      setError(apiErrorMessage(cause, 'No se pudo cerrar la caja.'));
    } finally {
      setSaving(false);
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
          <Keypad value={counted()} onChange={setCounted} allowDecimal />
        </div>
        <Show when={noteRequired()}>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>Motivo del descuadre (obligatorio)</span>
            <input
              class={forms.input}
              value={note()}
              placeholder="p. ej. faltó sencillo del vuelto"
              onInput={(event) => setNote(event.currentTarget.value)}
              onKeyDown={(event) => event.key === 'Enter' && void save()}
            />
          </div>
        </Show>
        <Show when={error() !== ''}>
          <p class={forms.error}>{error()}</p>
        </Show>
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button
            type="button"
            class={forms.primario}
            disabled={saving()}
            onClick={() => void save()}
          >
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
        <button
          type="button"
          class={forms.secundario}
          onClick={() =>
            void printLastCloseSummary()
              .then((result) => showNotice(result.message))
              .catch((cause) => {
                beepError();
                showNotice(apiErrorMessage(cause, 'No se pudo imprimir el resumen.'));
              })
          }
        >
          🖨 Imprimir resumen
        </button>
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
