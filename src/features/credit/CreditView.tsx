import { createEffect, createResource, createSignal, For, Show, type Component } from 'solid-js';
import { useLocation, useNavigate } from '@solidjs/router';

import { activeTabPath, SubTabs, type SubTab } from '@/shared/ui/SubTabs';
import { focusOnMount } from '@/shared/lib/focus';
import { StatTile, StatTiles } from '@/shared/ui/StatTile';
import { TableFooter } from '@/shared/ui/TableFooter';
import { Keypad } from '@/shared/ui/Keypad';

import {
  createCustomer,
  getCustomer,
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
import { EmptyState } from '@/shared/ui/EmptyState';
import forms from '@/shared/ui/forms.module.css';
import { createUrlBoolean, createUrlNumber, createUrlText } from '@/shared/lib/url-state';
import { entityAction, subPath, withSearch } from '@/shared/lib/modal-route';

// Los modales cuelgan de la subpestaña, no de `/clientes`: así abrir un abono
// desde Fiado no deja Directorio detrás al cerrarlo.
const ACCIONES = ['editar', 'abonar', 'estado-de-cuenta'] as const;

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
    <Modal
      size="sm"
      title={editing === null ? 'Nuevo cliente' : 'Editar cliente'}
      onClose={props.onClose}
      footer={
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" class={forms.primario} onClick={save}>
            {editing === null ? 'Crear cliente' : 'Guardar cambios'}
          </button>
        </div>
      }
    >
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
    <Modal
      size="sm"
      title={`Abonar — ${props.account.name}`}
      onClose={props.onClose}
      footer={
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" class={forms.primario} onClick={save}>
            Registrar abono
          </button>
        </div>
      }
    >
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
      </div>
    </Modal>
  );
};

// El fiado suma a la deuda; lo demás la baja. El nombre lo dice, no el signo.
function entryLabel(entry: { kind: string; paymentMethod: string | null }): string {
  if (entry.kind === 'charge') return 'Fiado';
  if (entry.kind === 'reversal') return 'Anulación de la venta';
  if (entry.kind === 'refund') return 'Devolución';
  return `Abono (${entry.paymentMethod === 'cash' ? 'efectivo' : 'Yape'})`;
}

const StatementModal: Component<{ account: CustomerAccountDto; onClose: () => void }> = (props) => {
  const [data] = createResource(() => getStatement(props.account.id));

  return (
    <Modal
      size="lg"
      title={`Estado de cuenta — ${props.account.name}`}
      onClose={props.onClose}
      footer={
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cerrar
          </button>
        </div>
      }
    >
      <Show when={data()} fallback={<p class={forms.nota}>Cargando…</p>}>
        {(statement) => (
          <div class={forms.form}>
            <StatTiles dense>
              <StatTile
                label="Deuda"
                value={formatSoles(statement().account.balanceCents)}
                tone={statement().account.balanceCents > 0 ? 'malo' : 'normal'}
              />
              <StatTile label="Límite" value={formatSoles(statement().account.creditLimitCents)} />
              <StatTile
                label="Disponible"
                value={formatSoles(statement().account.availableCents)}
              />
            </StatTiles>

            <Show
              when={statement().entries.length > 0}
              fallback={<EmptyState message="Sin movimientos todavía." />}
            >
              <div class={tabla.tablaContenedor} style={{ 'max-height': '40vh' }}>
                <table class={tabla.tabla}>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Concepto</th>
                      <th class={tabla.num}>Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    <For each={statement().entries}>
                      {(entry) => (
                        <tr>
                          <td class={tabla.sub}>{formatDateTime(entry.createdAt)}</td>
                          <td>{entryLabel(entry)}</td>
                          <td class={tabla.num}>
                            <span
                              class={tabla.stock}
                              classList={{
                                [tabla.stockCero]: entry.kind === 'charge',
                                [tabla.positivo]: entry.kind !== 'charge',
                              }}
                            >
                              {entry.kind === 'charge' ? '+' : '−'}
                              {formatSoles(entry.amountCents)}
                            </span>
                          </td>
                        </tr>
                      )}
                    </For>
                  </tbody>
                </table>
              </div>
            </Show>
            <TableFooter
              total={statement().entries.length}
              singular="movimiento"
              plural="movimientos"
            />
          </div>
        )}
      </Show>
    </Modal>
  );
};

// Clientes es el módulo; el fiado es una de sus caras. Directorio = la
// libreta completa (crear, editar, contacto); Fiado = solo la cobranza.
const PER_PAGE = 25;

const TABS: readonly SubTab[] = [
  { path: '/clientes/directorio', label: 'Directorio' },
  { path: '/clientes/fiado', label: 'Fiado' },
];

export const ClientesView: Component = () => {
  const location = useLocation();
  const tab = (): 'directorio' | 'fiado' =>
    activeTabPath(TABS, location.pathname) === '/clientes/fiado' ? 'fiado' : 'directorio';
  const [query, setQuery] = createUrlText('q');
  const [onlyDebtors, setOnlyDebtors] = createUrlBoolean('solo-deudores', true);
  const [page, setPage] = createUrlNumber('pagina', 1);
  const navigate = useNavigate();
  const base = (): string => activeTabPath(TABS, location.pathname);
  const cola = () => subPath(base(), location.pathname);
  const creando = (): boolean => cola()[0] === 'nuevo' && cola().length === 1;
  const abierto = () => entityAction(cola(), ACCIONES);
  const abrir = (path: string): void => navigate(withSearch(path, location.search));
  const cerrar = (): void => navigate(withSearch(base(), location.search));

  const [result, { refetch }] = createResource(
    () => ({ query: query(), onlyDebtors: tab() === 'fiado' && onlyDebtors(), page: page() }),
    (params) => listCustomersPage(params.query, params.onlyDebtors, params.page, PER_PAGE),
  );

  const accounts = () => result()?.items ?? [];

  // La cuenta sale de la página cargada, o del servidor si se entró por la URL.
  const enLista = (id: string): CustomerAccountDto | undefined =>
    accounts().find((account) => account.id === id);
  const [buscada] = createResource(
    () => {
      const modal = abierto();
      return modal === undefined || enLista(modal.id) !== undefined ? undefined : modal.id;
    },
    (id) => getCustomer(id),
  );
  const cuenta = (): CustomerAccountDto | undefined => {
    const modal = abierto();
    if (modal === undefined) return undefined;
    // El id tiene que calzar: mientras se busca el siguiente cliente, el
    // recurso sigue devolviendo el anterior.
    const encontrada = enLista(modal.id) ?? buscada();
    return encontrada?.id === modal.id ? encontrada : undefined;
  };

  createEffect(() => {
    if (abierto() === undefined) return;
    if (result.loading || buscada.loading) return;
    if (cuenta() !== undefined) return;
    showNotice('Ese cliente ya no está');
    navigate(withSearch(base(), location.search), { replace: true });
  });
  const total = () => result()?.total ?? 0;
  const totalPages = () => Math.max(1, Math.ceil(total() / PER_PAGE));

  function closeAndRefresh(message: string): void {
    cerrar();
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
      <SubTabs tabs={TABS} label="Secciones de clientes" />

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
          <button type="button" class={tabla.nuevo} onClick={() => abrir(`${base()}/nuevo`)}>
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
                          onClick={() => abrir(`${base()}/${account.id}/abonar`)}
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
                      <button type="button" onClick={() => abrir(`${base()}/${account.id}/estado-de-cuenta`)}>
                        Estado de cuenta
                      </button>
                      <button type="button" onClick={() => abrir(`${base()}/${account.id}/editar`)}>
                        Editar
                      </button>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
          <Show when={!result.loading && accounts().length === 0}>
            <Show
              when={!(tab() === 'fiado' && onlyDebtors())}
              fallback={<EmptyState message="Nadie debe nada. 🎉" />}
            >
              <EmptyState
                message="Aún no hay clientes registrados."
                action={
                  <button
                    type="button"
                    class={tabla.nuevo}
                    onClick={() => abrir(`${base()}/nuevo`)}
                  >
                    + Crear el primer cliente
                  </button>
                }
              />
            </Show>
          </Show>
        </div>

        <TableFooter
          total={total()}
          singular="cliente"
          plural="clientes"
          page={page()}
          lastPage={totalPages()}
          onPage={setPage}
        />

        {renderModal(creando(), abierto()?.action, cuenta(), closeAndRefresh, cerrar)}
      </section>
    </div>
  );
};

// `account` llega sin resolver mientras se busca por id: ahí no hay nada que
// dibujar todavía.
function renderModal(
  creando: boolean,
  accion: (typeof ACCIONES)[number] | undefined,
  account: CustomerAccountDto | undefined,
  onDone: (message: string) => void,
  onClose: () => void,
) {
  if (creando) return <CustomerFormModal mode={{ kind: 'create' }} onDone={onDone} onClose={onClose} />;
  if (accion === undefined || account === undefined) return null;
  switch (accion) {
    case 'editar':
      return <CustomerFormModal mode={{ kind: 'edit', account }} onDone={onDone} onClose={onClose} />;
    case 'abonar':
      return <AbonoModal account={account} onDone={onDone} onClose={onClose} />;
    case 'estado-de-cuenta':
      return <StatementModal account={account} onClose={onClose} />;
  }
}
