import { createResource, createSignal, For, Show, type Component } from 'solid-js';
import { focusOnMount } from '@/shared/lib/focus';
import { Keypad } from '@/shared/ui/Keypad';

import {
  createCustomer,
  getStatement,
  listCustomersPage,
  registerAbono,
  updateCustomer,
  type CustomerAccountDto,
} from '@/shared/api/customers';
import { apiErrorMessage } from '@/shared/api/client';
import { DIME_MESSAGE, formatSoles, isDimeCents, solesInputToCents } from '@/shared/lib/money';
import { formatDateOnly, formatDateTime } from '@/shared/lib/dates';
import { showNotice } from '@/shared/state/notices';
import { beepError, beepSuccess } from '@/shared/lib/sounds';
import { bumpCashRefresh } from '@/shared/state/cash-refresh';
import { Modal } from '@/shared/ui/Modal';
import tabla from '@/shared/ui/tabla.module.css';
import forms from '@/shared/ui/forms.module.css';

type ModalState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; account: CustomerAccountDto }
  | { kind: 'abono'; account: CustomerAccountDto }
  | { kind: 'statement'; account: CustomerAccountDto };

// "debe desde hace N días" legible, sin que la cajera calcule fechas.
function debtSinceLabel(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  const fecha = formatDateOnly(iso);
  if (days <= 0) return `hoy (${fecha})`;
  if (days === 1) return `ayer (${fecha})`;
  return `hace ${days} días (${fecha})`;
}

// Mensaje pre-armado: la función de fiado que más se usa en la práctica.
function whatsappReminderUrl(account: CustomerAccountDto): string {
  const phone = (account.phone ?? '').replace(/\D/g, '');
  const withCountry = phone.length === 9 ? `51${phone}` : phone;
  const message = `Hola ${account.name}, te saludamos del minimarket Maná. Te recordamos que tienes un saldo pendiente de ${formatSoles(account.balanceCents)}. ¡Gracias!`;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

type CustomerFormMode = { kind: 'create' } | { kind: 'edit'; account: CustomerAccountDto };

const CustomerFormModal: Component<{
  mode: CustomerFormMode;
  onDone: (message: string) => void;
  onClose: () => void;
}> = (props) => {
  const editing = props.mode.kind === 'edit' ? props.mode.account : null;
  const [name, setName] = createSignal(editing?.name ?? '');
  const [phone, setPhone] = createSignal(editing?.phone ?? '');
  const [document, setDocument] = createSignal(editing?.document ?? '');
  const [limit, setLimit] = createSignal(
    editing === null ? '50.00' : (editing.creditLimitCents / 100).toFixed(2),
  );
  const [error, setError] = createSignal('');

  async function save(): Promise<void> {
    const limitCents = solesInputToCents(limit());
    if (name().trim() === '' || limitCents === null) return;
    const payload = {
      name: name().trim(),
      phone: phone().trim() === '' ? null : phone().trim(),
      document: document().trim() === '' ? null : document().trim(),
      creditLimitCents: limitCents,
    };
    try {
      if (editing === null) {
        await createCustomer(payload);
        props.onDone(`Cliente «${payload.name}» creado`);
      } else {
        await updateCustomer(editing.id, payload);
        props.onDone(`Cliente «${payload.name}» actualizado`);
      }
    } catch {
      setError('No se pudo guardar el cliente.');
    }
  }

  return (
    <Modal title={editing === null ? 'Nuevo cliente' : 'Editar cliente'} onClose={props.onClose}>
      <div class={forms.form}>
        <div class={forms.campo}>
          <span class={forms.etiqueta}>Nombre</span>
          <input class={forms.input} value={name()} onInput={(event) => setName(event.currentTarget.value)} autofocus />
        </div>
        <div class={forms.fila}>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>Teléfono (opcional)</span>
            <input class={forms.input} value={phone()} onInput={(event) => setPhone(event.currentTarget.value)} />
          </div>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>DNI (opcional)</span>
            <input class={forms.input} value={document()} onInput={(event) => setDocument(event.currentTarget.value)} />
          </div>
        </div>
        <div class={forms.campo}>
          <span class={forms.etiqueta}>Límite de crédito S/</span>
          <input
            class={forms.input}
            type="number"
            step="1"
            min="0"
            value={limit()}
            onInput={(event) => setLimit(event.currentTarget.value)}
          />
        </div>
        <Show when={error() !== ''}>
          <p class={forms.error}>{error()}</p>
        </Show>
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" class={forms.primario} onClick={save}>
            {editing === null ? 'Crear cliente' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const AbonoModal: Component<{
  account: CustomerAccountDto;
  onDone: (message: string) => void;
  onClose: () => void;
}> = (props) => {
  const [amount, setAmount] = createSignal('');
  const [method, setMethod] = createSignal<'cash' | 'yape'>('cash');
  const [error, setError] = createSignal('');
  const [saving, setSaving] = createSignal(false);

  async function save(): Promise<void> {
    if (saving()) return;
    const cents = solesInputToCents(amount());
    if (cents === null || cents <= 0) return;
    if (!isDimeCents(cents)) {
      setError(DIME_MESSAGE);
      return;
    }
    setSaving(true);
    try {
      const result = await registerAbono(props.account.id, cents, method());
      beepSuccess();
      bumpCashRefresh();
      props.onDone(
        `Abono de ${formatSoles(cents)} registrado — deuda restante: ${formatSoles(result.newBalanceCents)}`,
      );
    } catch (cause) {
      beepError();
      setError(apiErrorMessage(cause, 'No se pudo registrar el abono.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Abonar — ${props.account.name}`} onClose={props.onClose}>
      <div class={forms.form}>
        <p class={forms.nota}>
          Deuda actual: <b>{formatSoles(props.account.balanceCents)}</b>
        </p>
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
              onKeyDown={(event) => event.key === 'Enter' && save()}
              autofocus
            />
          </div>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>Método</span>
            <select
              class={forms.select}
              value={method()}
              onChange={(event) => setMethod(event.currentTarget.value === 'yape' ? 'yape' : 'cash')}
            >
              <option value="cash">Efectivo</option>
              <option value="yape">Yape</option>
            </select>
          </div>
        </div>
        <Keypad value={amount()} onChange={setAmount} allowDecimal />
        <Show when={error() !== ''}>
          <p class={forms.error}>{error()}</p>
        </Show>
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" class={forms.primario} onClick={save}>
            Registrar abono
          </button>
        </div>
      </div>
    </Modal>
  );
};

const StatementModal: Component<{ account: CustomerAccountDto; onClose: () => void }> = (props) => {
  const [data] = createResource(() => getStatement(props.account.id));

  return (
    <Modal title={`Estado de cuenta — ${props.account.name}`} onClose={props.onClose}>
      <Show when={data()} fallback={<p class={forms.nota}>Cargando…</p>}>
        {(statement) => (
          <div class={forms.form}>
            <p class={forms.nota}>
              Deuda: <b>{formatSoles(statement().account.balanceCents)}</b> · Límite:{' '}
              {formatSoles(statement().account.creditLimitCents)} · Disponible:{' '}
              {formatSoles(statement().account.availableCents)}
            </p>
            <div>
              <For each={statement().entries}>
                {(entry) => (
                  <p class={forms.nota} style={{ 'border-bottom': '1px dashed var(--linea)', padding: '6px 0' }}>
                    {formatDateTime(entry.createdAt)}{' '}
                    ·{' '}
                    {entry.kind === 'charge'
                      ? 'Fiado'
                      : entry.kind === 'reversal'
                        ? 'Anulación de la venta'
                        : entry.kind === 'refund'
                          ? 'Devolución'
                          : `Abono (${entry.paymentMethod === 'cash' ? 'efectivo' : 'Yape'})`}
                    {' · '}
                    <b style={{ color: entry.kind === 'charge' ? 'var(--peligro)' : 'var(--mana-verde)' }}>
                      {entry.kind === 'charge' ? '+' : '−'}
                      {formatSoles(entry.amountCents)}
                    </b>
                  </p>
                )}
              </For>
              <Show when={statement().entries.length === 0}>
                <p class={forms.nota}>Sin movimientos todavía.</p>
              </Show>
            </div>
          </div>
        )}
      </Show>
    </Modal>
  );
};

// Clientes es el módulo; el fiado es una de sus caras. Directorio = la
// libreta completa (crear, editar, contacto); Fiado = solo la cobranza.
const PER_PAGE = 25;

export const ClientesView: Component = () => {
  const [tab, setTab] = createSignal<'directorio' | 'fiado'>('directorio');
  const [query, setQuery] = createSignal('');
  const [onlyDebtors, setOnlyDebtors] = createSignal(true);
  const [page, setPage] = createSignal(1);
  const [modal, setModal] = createSignal<ModalState>({ kind: 'none' });

  const [result, { refetch }] = createResource(
    () => ({ query: query(), onlyDebtors: tab() === 'fiado' && onlyDebtors(), page: page() }),
    (params) => listCustomersPage(params.query, params.onlyDebtors, params.page, PER_PAGE),
  );

  const accounts = () => result()?.items ?? [];
  const total = () => result()?.total ?? 0;
  const totalPages = () => Math.max(1, Math.ceil(total() / PER_PAGE));

  function closeAndRefresh(message: string): void {
    setModal({ kind: 'none' });
    showNotice(message);
    void refetch();
  }

  // Deuda real = solo saldos positivos; lo "a favor" se informa aparte y en
  // verde (un negativo dentro de un chip de alerta se lee como problema).
  // Vienen del API sobre TODO el resultado, no solo la página visible.
  const totalDebt = () => result()?.totalDebtCents ?? 0;
  const totalInFavor = () => result()?.totalInFavorCents ?? 0;

  return (
    <div class={tabla.contenedorTabs}>
      <nav class={tabla.subnav} aria-label="Secciones de clientes">
        <button
          type="button"
          class={tabla.subtab}
          classList={{ [tabla.subtabActiva]: tab() === 'directorio' }}
          onClick={() => { setTab('directorio'); setPage(1); }}
        >
          Directorio
        </button>
        <button
          type="button"
          class={tabla.subtab}
          classList={{ [tabla.subtabActiva]: tab() === 'fiado' }}
          onClick={() => { setTab('fiado'); setPage(1); }}
        >
          Fiado
        </button>
      </nav>

      <section class={tabla.vista}>
        <div class={tabla.encabezado}>
          <input
            ref={focusOnMount}
            class={tabla.buscador}
            type="text"
            placeholder="Buscar cliente…"
            value={query()}
            onInput={(event) => { setQuery(event.currentTarget.value); setPage(1); }}
          />
          <Show when={tab() === 'fiado'}>
            <label class={forms.check} style={{ 'white-space': 'nowrap' }}>
              <input
                type="checkbox"
                checked={onlyDebtors()}
                onChange={(event) => { setOnlyDebtors(event.currentTarget.checked); setPage(1); }}
              />
              Solo deudores
            </label>
            <span class={tabla.alertaBajo}>Deuda total: {formatSoles(totalDebt())}</span>
            <Show when={totalInFavor() > 0}>
              <span class={tabla.positivo}>{formatSoles(totalInFavor())} a favor de clientes</span>
            </Show>
          </Show>
          <button type="button" class={tabla.nuevo} onClick={() => setModal({ kind: 'create' })}>
            + Nuevo cliente
          </button>
        </div>

        <div class={tabla.tablaContenedor}>
          <table class={tabla.tabla}>
            <thead>
              <Show
                when={tab() === 'fiado'}
                fallback={
                  <tr>
                    <th>Cliente</th>
                    <th>Teléfono</th>
                    <th>Documento</th>
                    <th class={tabla.num}>Límite de fiado</th>
                    <th class={tabla.num}>Deuda</th>
                    <th>Acciones</th>
                  </tr>
                }
              >
                <tr>
                  <th>Cliente</th>
                  <th>Teléfono</th>
                  <th class={tabla.num}>Deuda</th>
                  <th>Debe desde</th>
                  <th class={tabla.num}>Disponible</th>
                  <th>Acciones</th>
                </tr>
              </Show>
            </thead>
            <tbody>
              <For each={accounts()}>
                {(account) => (
                  <tr>
                    <td>
                      <div class={tabla.nombre}>{account.name}</div>
                      <Show when={tab() === 'fiado'}>
                        <div class={tabla.sub}>{account.document ?? ''}</div>
                      </Show>
                    </td>
                    <td class={tabla.sub}>{account.phone ?? '—'}</td>
                    <Show when={tab() === 'directorio'}>
                      <td class={tabla.sub}>{account.document ?? '—'}</td>
                      <td class={tabla.num}>{formatSoles(account.creditLimitCents)}</td>
                    </Show>
                    <td class={tabla.num}>
                      <span
                        class={tabla.stock}
                        classList={{
                          [tabla.stockCero]: account.balanceCents > 0,
                          [tabla.positivo]: account.balanceCents < 0,
                        }}
                      >
                        {account.balanceCents < 0
                          ? `${formatSoles(-account.balanceCents)} a favor`
                          : formatSoles(account.balanceCents)}
                      </span>
                    </td>
                    <Show when={tab() === 'fiado'}>
                      <td class={tabla.sub}>
                        {account.debtSince === null || account.balanceCents <= 0
                          ? '—'
                          : debtSinceLabel(account.debtSince)}
                      </td>
                      <td class={`${tabla.num} ${tabla.sub}`}>{formatSoles(account.availableCents)}</td>
                    </Show>
                    <td class={tabla.acciones}>
                      {/* Abonar vive en ambas pestañas: el cajero busca al
                          cliente en Directorio y no debe cambiar de pestaña
                          para cobrarle. */}
                      <Show when={tab() === 'fiado' || account.balanceCents > 0}>
                        <button
                          type="button"
                          disabled={account.balanceCents <= 0}
                          onClick={() => setModal({ kind: 'abono', account })}
                        >
                          Abonar
                        </button>
                      </Show>
                      <Show when={tab() === 'fiado'}>
                        <Show when={account.phone !== null && account.balanceCents > 0}>
                          <a
                            class={tabla.sub}
                            style={{ 'margin-right': '6px' }}
                            href={whatsappReminderUrl(account)}
                            target="_blank"
                            rel="noreferrer"
                            title="Recordatorio de deuda por WhatsApp con mensaje pre-armado"
                          >
                            WhatsApp
                          </a>
                        </Show>
                      </Show>
                      <button type="button" onClick={() => setModal({ kind: 'statement', account })}>
                        Estado de cuenta
                      </button>
                      <button type="button" onClick={() => setModal({ kind: 'edit', account })}>
                        Editar
                      </button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
          <Show when={!result.loading && accounts().length === 0}>
            <div class={tabla.vacio}>
              <Show
                when={!(tab() === 'fiado' && onlyDebtors())}
                fallback={<p>Nadie debe nada. 🎉</p>}
              >
                <p>Aún no hay clientes registrados.</p>
                <button type="button" class={tabla.nuevo} onClick={() => setModal({ kind: 'create' })}>
                  + Crear el primer cliente
                </button>
              </Show>
            </div>
          </Show>
        </div>

        <Show when={totalPages() > 1}>
          <div class={tabla.paginacion}>
            <button type="button" disabled={page() <= 1} onClick={() => setPage(page() - 1)}>
              ‹ Anterior
            </button>
            <span>
              Página {page()} de {totalPages()} · {total()} clientes
            </span>
            <button type="button" disabled={page() >= totalPages()} onClick={() => setPage(page() + 1)}>
              Siguiente ›
            </button>
          </div>
        </Show>

        {renderModal(modal(), closeAndRefresh, () => setModal({ kind: 'none' }))}
      </section>
    </div>
  );
};

function renderModal(state: ModalState, onDone: (message: string) => void, onClose: () => void) {
  switch (state.kind) {
    case 'none':
      return null;
    case 'create':
      return <CustomerFormModal mode={{ kind: 'create' }} onDone={onDone} onClose={onClose} />;
    case 'edit':
      return <CustomerFormModal mode={state} onDone={onDone} onClose={onClose} />;
    case 'abono':
      return <AbonoModal account={state.account} onDone={onDone} onClose={onClose} />;
    case 'statement':
      return <StatementModal account={state.account} onClose={onClose} />;
  }
}
