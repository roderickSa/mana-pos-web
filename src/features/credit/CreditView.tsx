import { createResource, createSignal, For, Show, type Component } from 'solid-js';

import {
  createCustomer,
  getStatement,
  listCustomers,
  registerAbono,
  updateCustomer,
  type CustomerAccountDto,
} from '@/shared/api/customers';
import { apiErrorMessage } from '@/shared/api/client';
import { formatSoles, solesInputToCents } from '@/shared/lib/money';
import { formatDateTime } from '@/shared/lib/dates';
import { showNotice } from '@/shared/state/notices';
import { beepError, beepSuccess } from '@/shared/lib/sounds';
import { bumpCashRefresh } from '@/shared/state/cash-refresh';
import { currentUserName } from '@/shared/state/session';
import { Modal } from '@/shared/ui/Modal';
import tabla from '@/shared/ui/tabla.module.css';
import forms from '@/shared/ui/forms.module.css';

type ModalState =
  | { kind: 'none' }
  | { kind: 'create' }
  | { kind: 'edit'; account: CustomerAccountDto }
  | { kind: 'abono'; account: CustomerAccountDto }
  | { kind: 'statement'; account: CustomerAccountDto };

const CustomerFormModal: Component<{
  account: CustomerAccountDto | null;
  onDone: (message: string) => void;
  onClose: () => void;
}> = (props) => {
  const editing = props.account;
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

  async function save(): Promise<void> {
    const cents = solesInputToCents(amount());
    if (cents === null || cents <= 0) return;
    try {
      const result = await registerAbono(props.account.id, cents, method(), currentUserName());
      beepSuccess();
      bumpCashRefresh();
      props.onDone(
        `Abono de ${formatSoles(cents)} registrado — deuda restante: ${formatSoles(result.newBalanceCents)}`,
      );
    } catch (cause) {
      beepError();
      setError(apiErrorMessage(cause, 'No se pudo registrar el abono.'));
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
                      : entry.paymentMethod === null
                        ? 'Reversa por anulación'
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

export const CreditView: Component = () => {
  const [query, setQuery] = createSignal('');
  const [onlyDebtors, setOnlyDebtors] = createSignal(false);
  const [modal, setModal] = createSignal<ModalState>({ kind: 'none' });

  const [accounts, { refetch }] = createResource(
    () => ({ query: query(), onlyDebtors: onlyDebtors() }),
    (params) => listCustomers(params.query, params.onlyDebtors),
  );

  function closeAndRefresh(message: string): void {
    setModal({ kind: 'none' });
    showNotice(message);
    void refetch();
  }

  const totalDebt = () => (accounts() ?? []).reduce((sum, account) => sum + account.balanceCents, 0);

  return (
    <section class={tabla.vista}>
      <div class={tabla.encabezado}>
        <input
          class={tabla.buscador}
          type="text"
          placeholder="Buscar cliente…"
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
        />
        <label class={forms.check} style={{ 'white-space': 'nowrap' }}>
          <input
            type="checkbox"
            checked={onlyDebtors()}
            onChange={(event) => setOnlyDebtors(event.currentTarget.checked)}
          />
          Solo deudores
        </label>
        <span class={tabla.alertaBajo}>Deuda total: {formatSoles(totalDebt())}</span>
        <button type="button" class={tabla.nuevo} onClick={() => setModal({ kind: 'create' })}>
          + Nuevo cliente
        </button>
      </div>

      <div class={tabla.tablaContenedor}>
        <table class={tabla.tabla}>
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Teléfono</th>
              <th class={tabla.num}>Límite</th>
              <th class={tabla.num}>Deuda</th>
              <th class={tabla.num}>Disponible</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <For each={accounts() ?? []}>
              {(account) => (
                <tr>
                  <td>
                    <div class={tabla.nombre}>{account.name}</div>
                    <div class={tabla.sub}>{account.document ?? ''}</div>
                  </td>
                  <td class={tabla.sub}>{account.phone ?? '—'}</td>
                  <td class={tabla.num}>{formatSoles(account.creditLimitCents)}</td>
                  <td class={tabla.num}>
                    <span
                      class={tabla.stock}
                      classList={{
                        [tabla.stockCero]: account.balanceCents > 0,
                        [tabla.stockBajo]: account.balanceCents < 0,
                      }}
                    >
                      {account.balanceCents < 0
                        ? `${formatSoles(-account.balanceCents)} a favor`
                        : formatSoles(account.balanceCents)}
                    </span>
                  </td>
                  <td class={`${tabla.num} ${tabla.sub}`}>{formatSoles(account.availableCents)}</td>
                  <td class={tabla.acciones}>
                    <button
                      type="button"
                      disabled={account.balanceCents <= 0}
                      onClick={() => setModal({ kind: 'abono', account })}
                    >
                      Abonar
                    </button>
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
        <Show when={!accounts.loading && (accounts() ?? []).length === 0}>
          <p class={tabla.vacio}>
            {onlyDebtors() ? 'Nadie debe nada. 🎉' : 'Aún no hay clientes. Crea el primero.'}
          </p>
        </Show>
      </div>

      {renderModal(modal(), closeAndRefresh, () => setModal({ kind: 'none' }))}
    </section>
  );
};

function renderModal(state: ModalState, onDone: (message: string) => void, onClose: () => void) {
  switch (state.kind) {
    case 'none':
      return null;
    case 'create':
      return <CustomerFormModal account={null} onDone={onDone} onClose={onClose} />;
    case 'edit':
      return <CustomerFormModal account={state.account} onDone={onDone} onClose={onClose} />;
    case 'abono':
      return <AbonoModal account={state.account} onDone={onDone} onClose={onClose} />;
    case 'statement':
      return <StatementModal account={state.account} onClose={onClose} />;
  }
}
