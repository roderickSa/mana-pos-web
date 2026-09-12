import { createResource, createSignal, For, Show, type Component } from 'solid-js';

import {
  applyBulkPrices,
  applyPriceList,
  getLowMarginSuggestions,
  previewBulkPrices,
  type BulkPricesParams,
  type PriceChangeDto,
} from '@/shared/api/prices';
import { listCategories } from '@/shared/api/categories';
import { listSuppliers } from '@/shared/api/suppliers';
import { apiErrorMessage } from '@/shared/api/client';
import { beepError, beepSuccess } from '@/shared/lib/sounds';
import { formatSoles, solesInputToCents, centsToSolesInput } from '@/shared/lib/money';
import { showNotice } from '@/shared/state/notices';
import { Modal } from '@/shared/ui/Modal';
import forms from '@/shared/ui/forms.module.css';
import tabla from '@/shared/ui/tabla.module.css';
import styles from './BulkPricesModal.module.css';

function marginLabel(percent: number | null): string {
  return percent === null ? 'sin costo' : `${percent.toFixed(1)}%`;
}

interface ImpactChange {
  name: string;
  oldPriceCents: number;
  newPriceCents: number;
}

// Cambiar cientos de precios de un clic es la acción más riesgosa del sistema:
// antes de aplicar se muestra el impacto (cuántos, promedio y mayor subida)
// y se pide una confirmación explícita.
const ConfirmImpact: Component<{
  changes: ImpactChange[];
  busy: boolean;
  onConfirm: () => void;
  onBack: () => void;
}> = (props) => {
  const avgPercent = () => {
    const withOld = props.changes.filter((change) => change.oldPriceCents > 0);
    if (withOld.length === 0) return 0;
    const sum = withOld.reduce(
      (total, change) => total + ((change.newPriceCents - change.oldPriceCents) / change.oldPriceCents) * 100,
      0,
    );
    return sum / withOld.length;
  };
  const biggest = () =>
    props.changes.reduce((max, change) =>
      change.newPriceCents - change.oldPriceCents > max.newPriceCents - max.oldPriceCents ? change : max,
    );
  return (
    <div class={styles.confirmar}>
      <p class={styles.confirmarTitulo}>
        Vas a cambiar el precio de <b>{props.changes.length} productos</b>.
      </p>
      <p class={forms.nota}>
        Cambio promedio: <b>{avgPercent() >= 0 ? '+' : ''}{avgPercent().toFixed(1)}%</b>
        {' · '}Mayor subida: {biggest().name} ({formatSoles(biggest().oldPriceCents)} →{' '}
        {formatSoles(biggest().newPriceCents)}). Las ventas ya cobradas no cambian.
      </p>
      <div class={forms.acciones}>
        <button type="button" class={forms.secundario} disabled={props.busy} onClick={props.onBack}>
          Volver
        </button>
        <button type="button" class={forms.primario} disabled={props.busy} onClick={props.onConfirm}>
          {props.busy ? 'Aplicando…' : `Sí, aplicar ${props.changes.length} cambios`}
        </button>
      </div>
    </div>
  );
};

// Cambio masivo de precios (por categoría/proveedor, % o soles, con vista
// previa de margen) + sugerencias para productos con margen bajo el umbral.
export const BulkPricesModal: Component<{ onClose: () => void; onApplied: () => void }> = (
  props,
) => {
  const [tab, setTab] = createSignal<'masivo' | 'margen'>('masivo');

  return (
    <Modal size="xl" title="Precios" onClose={props.onClose}>
      <div class={styles.tabs}>
        <button
          type="button"
          classList={{ [styles.tabActiva]: tab() === 'masivo' }}
          onClick={() => setTab('masivo')}
        >
          Cambio masivo
        </button>
        <button
          type="button"
          classList={{ [styles.tabActiva]: tab() === 'margen' }}
          onClick={() => setTab('margen')}
        >
          Margen bajo
        </button>
      </div>
      <Show when={tab() === 'masivo'} fallback={<LowMarginTab onApplied={props.onApplied} />}>
        <BulkTab onApplied={props.onApplied} />
      </Show>
    </Modal>
  );
};

const BulkTab: Component<{ onApplied: () => void }> = (props) => {
  const [category, setCategory] = createSignal('');
  const [supplierId, setSupplierId] = createSignal('');
  const [mode, setMode] = createSignal<'percent' | 'amount'>('percent');
  const [value, setValue] = createSignal('');
  const [changes, setChanges] = createSignal<PriceChangeDto[] | null>(null);
  const [confirming, setConfirming] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  const [categories] = createResource(() => listCategories());
  const [suppliers] = createResource(() => listSuppliers());

  const params = (): BulkPricesParams | null => {
    const raw = value().trim().replace(',', '.');
    if (raw === '') return null;
    if (mode() === 'percent') {
      const percent = Number.parseFloat(raw);
      if (Number.isNaN(percent) || percent === 0) return null;
      return {
        category: category() === '' ? null : category(),
        supplierId: supplierId() === '' ? null : supplierId(),
        mode: 'percent',
        value: percent,
      };
    }
    const cents = solesInputToCents(raw.replace('-', ''));
    if (cents === null || cents === 0) return null;
    return {
      category: category() === '' ? null : category(),
      supplierId: supplierId() === '' ? null : supplierId(),
      mode: 'amount',
      value: raw.startsWith('-') ? -cents : cents,
    };
  };

  async function preview(): Promise<void> {
    const body = params();
    if (body === null || busy()) return;
    setBusy(true);
    try {
      const result = await previewBulkPrices(body);
      setChanges(result.changes);
      if (result.changes.length === 0) showNotice('Ningún producto cambia con ese ajuste.');
    } catch (cause) {
      showNotice(apiErrorMessage(cause, 'No se pudo calcular la vista previa.'));
    } finally {
      setBusy(false);
    }
  }

  async function apply(): Promise<void> {
    const body = params();
    if (body === null || busy()) return;
    setBusy(true);
    try {
      const result = await applyBulkPrices(body);
      beepSuccess();
      showNotice(`Se actualizaron ${result.changes.length} precios.`);
      props.onApplied();
    } catch (cause) {
      beepError();
      showNotice(apiErrorMessage(cause, 'No se pudieron aplicar los precios.'));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div class={forms.form}>
      <div class={styles.filtros}>
        <div class={forms.campo}>
          <label class={forms.etiqueta} for="precios-categoria">Categoría</label>
          <select
            id="precios-categoria"
            class={forms.input}
            value={category()}
            onChange={(event) => {
              setCategory(event.currentTarget.value);
              setChanges(null);
            }}
          >
            <option value="">Todas</option>
            <For each={categories() ?? []}>
              {(item) => <option value={item.slug}>{item.name}</option>}
            </For>
          </select>
        </div>
        <div class={forms.campo}>
          <label class={forms.etiqueta} for="precios-proveedor">Proveedor</label>
          <select
            id="precios-proveedor"
            class={forms.input}
            value={supplierId()}
            onChange={(event) => {
              setSupplierId(event.currentTarget.value);
              setChanges(null);
            }}
          >
            <option value="">Todos</option>
            <For each={suppliers() ?? []}>
              {(item) => <option value={item.id}>{item.name}</option>}
            </For>
          </select>
        </div>
        <div class={forms.campo}>
          <label class={forms.etiqueta} for="precios-modo">Ajuste</label>
          <select
            id="precios-modo"
            class={forms.input}
            value={mode()}
            onChange={(event) => {
              setMode(event.currentTarget.value === 'amount' ? 'amount' : 'percent');
              setChanges(null);
            }}
          >
            <option value="percent">Porcentaje (%)</option>
            <option value="amount">Monto (S/)</option>
          </select>
        </div>
        <div class={forms.campo}>
          <label class={forms.etiqueta} for="precios-valor">
            {mode() === 'percent' ? '% de cambio (− baja)' : 'S/ de cambio (− baja)'}
          </label>
          <input
            id="precios-valor"
            class={forms.input}
            type="text"
            inputmode="decimal"
            placeholder={mode() === 'percent' ? 'p. ej. 5 o -3' : 'p. ej. 0.20 o -0.10'}
            value={value()}
            onInput={(event) => {
              setValue(event.currentTarget.value);
              setChanges(null);
            }}
          />
        </div>
      </div>

      <p class={forms.nota}>Todo precio resultante se redondea a 10 céntimos (S/ 0.10 es la moneda mínima).</p>

      <Show when={changes()}>
        {(list) => (
          <div class={tabla.tablaContenedor} style={{ 'max-height': '40vh', 'overflow-y': 'auto' }}>
            <table class={tabla.tabla}>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Costo</th>
                  <th>Precio</th>
                  <th>Nuevo</th>
                  <th>Margen</th>
                </tr>
              </thead>
              <tbody>
                <For each={list()}>
                  {(change) => (
                    <tr>
                      <td>{change.name}{change.saleType === 'weight' ? ' (por kg)' : ''}</td>
                      <td>{change.costCents > 0 ? formatSoles(change.costCents) : '—'}</td>
                      <td>{formatSoles(change.oldPriceCents)}</td>
                      <td><b>{formatSoles(change.newPriceCents)}</b></td>
                      <td>
                        {marginLabel(change.oldMarginPercent)} → <b>{marginLabel(change.newMarginPercent)}</b>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        )}
      </Show>

      <Show
        when={!confirming()}
        fallback={
          <ConfirmImpact
            changes={changes() ?? []}
            busy={busy()}
            onConfirm={() => void apply()}
            onBack={() => setConfirming(false)}
          />
        }
      >
        <div class={forms.acciones}>
          <button
            type="button"
            class={forms.secundario}
            disabled={params() === null || busy()}
            onClick={() => void preview()}
          >
            Ver cambios
          </button>
          <button
            type="button"
            class={forms.primario}
            disabled={changes() === null || (changes() ?? []).length === 0 || busy()}
            onClick={() => setConfirming(true)}
          >
            {`Aplicar a ${(changes() ?? []).length} productos`}
          </button>
        </div>
      </Show>
    </div>
  );
};

const LowMarginTab: Component<{ onApplied: () => void }> = (props) => {
  const [threshold, setThreshold] = createSignal(20);
  const [excluded, setExcluded] = createSignal<Record<string, boolean>>({});
  const [priceDrafts, setPriceDrafts] = createSignal<Record<string, string>>({});
  const [confirming, setConfirming] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  const [suggestions, { refetch }] = createResource(threshold, (value) =>
    getLowMarginSuggestions(value),
  );

  const items = () => suggestions()?.items ?? [];
  const priceOf = (productId: string, suggested: number): number | null => {
    const draft = priceDrafts()[productId];
    if (draft === undefined || draft.trim() === '') return suggested;
    return solesInputToCents(draft.replace(',', '.'));
  };
  const selected = () =>
    items()
      .filter((item) => !excluded()[item.productId])
      .map((item) => ({
        productId: item.productId,
        priceCents: priceOf(item.productId, item.suggestedPriceCents),
      }));
  const validSelection = () =>
    selected().filter((item): item is { productId: string; priceCents: number } =>
      item.priceCents !== null && item.priceCents >= 10,
    );
  // Resumen de impacto para la confirmación: precio actual → precio elegido.
  const impactChanges = (): ImpactChange[] => {
    const byId = new Map(items().map((item) => [item.productId, item]));
    return validSelection().flatMap((update) => {
      const item = byId.get(update.productId);
      if (item === undefined) return [];
      return [{ name: item.name, oldPriceCents: item.priceCents, newPriceCents: update.priceCents }];
    });
  };

  async function apply(): Promise<void> {
    const updates = validSelection();
    if (updates.length === 0 || busy()) return;
    setBusy(true);
    try {
      const result = await applyPriceList(updates);
      beepSuccess();
      showNotice(`Se actualizaron ${result.applied} precios.`);
      setExcluded({});
      setPriceDrafts({});
      void refetch();
      props.onApplied();
    } catch (cause) {
      beepError();
      showNotice(apiErrorMessage(cause, 'No se pudieron aplicar los precios sugeridos.'));
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return (
    <div class={forms.form}>
      <div class={forms.campo} style={{ 'max-width': '220px' }}>
        <label class={forms.etiqueta} for="margen-umbral">Margen mínimo deseado (%)</label>
        <input
          id="margen-umbral"
          class={forms.input}
          type="number"
          min="1"
          max="90"
          value={threshold()}
          onChange={(event) => {
            const parsed = Number(event.currentTarget.value);
            if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 90) setThreshold(parsed);
          }}
        />
      </div>

      <Show
        when={items().length > 0}
        fallback={
          <p class={forms.nota}>
            {suggestions.loading
              ? 'Buscando productos con margen bajo…'
              : `Ningún producto activo con costo está por debajo del ${threshold()}% de margen. 👍`}
          </p>
        }
      >
        <p class={forms.nota}>
          Estos productos dejan menos del {threshold()}%. El precio sugerido recupera el margen
          (redondeado hacia arriba a 10 céntimos); puedes ajustarlo antes de aplicar.
        </p>
        <div class={tabla.tablaContenedor} style={{ 'max-height': '40vh', 'overflow-y': 'auto' }}>
          <table class={tabla.tabla}>
            <thead>
              <tr>
                <th />
                <th>Producto</th>
                <th>Costo</th>
                <th>Precio · margen</th>
                <th>Sugerido</th>
              </tr>
            </thead>
            <tbody>
              <For each={items()}>
                {(item) => (
                  <tr classList={{ [styles.excluida]: excluded()[item.productId] === true }}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Incluir ${item.name}`}
                        checked={excluded()[item.productId] !== true}
                        onChange={(event) =>
                          setExcluded({ ...excluded(), [item.productId]: !event.currentTarget.checked })
                        }
                      />
                    </td>
                    <td>{item.name}{item.saleType === 'weight' ? ' (por kg)' : ''}</td>
                    <td>{formatSoles(item.costCents)}</td>
                    <td>
                      {formatSoles(item.priceCents)} · {marginLabel(item.marginPercent)}
                    </td>
                    <td>
                      <input
                        class={forms.input}
                        style={{ width: '6.5rem' }}
                        type="text"
                        inputmode="decimal"
                        aria-label={`Nuevo precio de ${item.name}`}
                        value={
                          priceDrafts()[item.productId] ?? centsToSolesInput(item.suggestedPriceCents)
                        }
                        onInput={(event) =>
                          setPriceDrafts({ ...priceDrafts(), [item.productId]: event.currentTarget.value })
                        }
                      />{' '}
                      <span class={forms.nota} style={{ display: 'inline' }}>
                        → {marginLabel(item.suggestedMarginPercent)}
                      </span>
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </div>
      </Show>

      <Show
        when={!confirming()}
        fallback={
          <ConfirmImpact
            changes={impactChanges()}
            busy={busy()}
            onConfirm={() => void apply()}
            onBack={() => setConfirming(false)}
          />
        }
      >
        <div class={forms.acciones}>
          <button
            type="button"
            class={forms.primario}
            disabled={validSelection().length === 0 || busy()}
            onClick={() => setConfirming(true)}
          >
            {`Aplicar ${validSelection().length} sugeridos`}
          </button>
        </div>
      </Show>
    </div>
  );
};
