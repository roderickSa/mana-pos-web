import { createEffect, createSignal, For, Show, type Component } from 'solid-js';

import { apiErrorMessage } from '@/shared/api/client';
import { saveProductSupply, type ProductSupplyDto } from '@/shared/api/products';
import { createFormDraft } from '@/shared/lib/form-draft';
import { centsToSolesInput, formatKg, formatSoles, solesInputToCents } from '@/shared/lib/money';
import { beepError, beepOk } from '@/shared/lib/sounds';
import { showNotice } from '@/shared/state/notices';
import { currentUser } from '@/shared/state/session';
import { DraftBanner } from '@/shared/ui/DraftBanner';
import { Modal } from '@/shared/ui/Modal';
import forms from '@/shared/ui/forms.module.css';
import { decodeSupplyDraft, sameSupplyDraft, type SupplyFormDraft } from './supply-draft';

// Presentaciones típicas de un proveedor de bodega. El campo igual es libre.
const PRESENTACIONES = ['caja', 'paquete', 'saco', 'docena', 'plancha', 'fardo', 'bolsa'];

export const SupplyTermsModal: Component<{
  supply: ProductSupplyDto;
  supplierName: string;
  productName: string;
  saleType: 'unit' | 'weight';
  priceCents: number;
  onSaved: () => void;
  onClose: () => void;
}> = (props) => {
  const isWeight = (): boolean => props.saleType === 'weight';
  // Lo que había al abrir, para saber si la persona tocó algo.
  const inicial: SupplyFormDraft = {
    cost: props.supply.unitCostCents === null ? '' : centsToSolesInput(props.supply.unitCostCents),
    presentation: props.supply.presentationName ?? '',
    packQuantity:
      props.supply.packSize === null
        ? ''
        : props.saleType === 'weight'
          ? String(props.supply.packSize / 1000)
          : String(props.supply.packSize),
    packCost: props.supply.packCostCents === null ? '' : centsToSolesInput(props.supply.packCostCents),
    sku: props.supply.supplierSku ?? '',
    preferred: props.supply.preferred,
  };
  const [cost, setCost] = createSignal(inicial.cost);
  const [presentation, setPresentation] = createSignal(inicial.presentation);
  // Para pesables se teclea en kilos; adentro todo va en gramos.
  const [packQuantity, setPackQuantity] = createSignal(inicial.packQuantity);
  const [packCost, setPackCost] = createSignal(inicial.packCost);
  const [sku, setSku] = createSignal(inicial.sku);
  const [preferred, setPreferred] = createSignal(inicial.preferred);
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal('');

  const actual = (): SupplyFormDraft => ({
    cost: cost(),
    presentation: presentation(),
    packQuantity: packQuantity(),
    packCost: packCost(),
    sku: sku(),
    preferred: preferred(),
  });
  // Seis campos de condiciones no se pierden por un toque fuera del cuadro.
  const sinGuardar = (): boolean => !sameSupplyDraft(actual(), inicial);

  // Las condiciones se copian de una lista de precios en papel: si el
  // navegador se cierra a mitad, lo tecleado espera acá.
  const draft = createFormDraft<SupplyFormDraft>(
    `mana-pos:borrador:condiciones:${props.supply.productId}-${props.supply.supplierId}:${currentUser()?.id ?? 'anonimo'}`,
    decodeSupplyDraft,
    (value) => sameSupplyDraft(value, inicial),
  );
  createEffect(() => draft.track(actual()));

  function aplicarBorrador(value: SupplyFormDraft): void {
    setCost(value.cost);
    setPresentation(value.presentation);
    setPackQuantity(value.packQuantity);
    setPackCost(value.packCost);
    setSku(value.sku);
    setPreferred(value.preferred);
  }

  const costLabel = (): string => (isWeight() ? 'Costo por kilo S/' : 'Costo por unidad S/');
  const quantityLabel = (): string =>
    isWeight() ? `Kilos por ${presentation() || 'presentación'}` : `Unidades por ${presentation() || 'presentación'}`;

  const packUnits = (): number | null => {
    const typed = packQuantity().trim();
    if (typed === '') return null;
    const value = Number.parseFloat(typed);
    if (Number.isNaN(value) || value <= 0) return null;
    return isWeight() ? Math.round(value * 1000) : Math.round(value);
  };

  // Lo que sale cada unidad nuestra comprando en esa presentación: es el número
  // con el que de verdad se compara a un proveedor con otro.
  const derivedUnitCost = (): number | null => {
    const units = packUnits();
    const total = solesInputToCents(packCost());
    if (units === null || total === null || total <= 0) return null;
    const perUnit = total / units;
    return Math.round(isWeight() ? perUnit * 1000 : perUnit);
  };

  const hasPresentation = (): boolean =>
    packQuantity().trim() !== '' || packCost().trim() !== '' || presentation().trim() !== '';

  async function save(): Promise<void> {
    if (saving()) return;
    const unitCostCents = derivedUnitCost() ?? solesInputToCents(cost());
    const units = packUnits();
    const packCostCents = solesInputToCents(packCost());

    if (hasPresentation() && (units === null || packCostCents === null || presentation().trim() === '')) {
      setError('La presentación va completa: cómo se llama, cuánto trae y cuánto cuesta.');
      return;
    }
    if (unitCostCents === null || unitCostCents <= 0) {
      setError('Falta el costo. Búscalo en la lista de precios del proveedor.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      await saveProductSupply(props.supply.productId, props.supply.supplierId, {
        unitCostCents,
        presentationName: hasPresentation() ? presentation().trim() : null,
        packSize: hasPresentation() ? units : null,
        packCostCents: hasPresentation() ? packCostCents : null,
        supplierSku: sku().trim() === '' ? null : sku().trim(),
        preferred: preferred(),
      });
      beepOk();
      draft.discard();
      showNotice(`Condiciones de ${props.supplierName} guardadas`);
      props.onSaved();
    } catch (cause) {
      beepError();
      setError(apiErrorMessage(cause, 'No se pudieron guardar las condiciones.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      size="md"
      title={`${props.supplierName} — ${props.productName}`}
      subtitle={`Se vende a ${formatSoles(props.priceCents)}${isWeight() ? ' el kilo' : ''}`}
      dirty={sinGuardar}
      dirtyLabel="las condiciones"
      onDiscard={draft.discard}
      onClose={props.onClose}
      footer={
        <div class={forms.acciones}>
          <button type="button" class={forms.secundario} onClick={props.onClose}>
            Cancelar
          </button>
          <button type="button" class={forms.primario} disabled={saving()} onClick={save}>
            Guardar condiciones
          </button>
        </div>
      }
    >
      <div class={forms.form}>
        <DraftBanner
          savedAt={draft.savedAt()}
          onRecover={() => {
            const value = draft.saved();
            if (value !== undefined) aplicarBorrador(value);
            draft.discard();
          }}
          onDiscard={draft.discard}
        />
        <p class={forms.nota}>
          Cada proveedor tiene su propio costo y su propia presentación. Si cargas la
          presentación, el costo por {isWeight() ? 'kilo' : 'unidad'} se calcula solo.
        </p>

        <div class={forms.campo}>
          <span class={forms.etiqueta}>{costLabel()}</span>
          <input
            id="condiciones-costo"
            class={forms.input}
            type="number"
            step="0.01"
            min="0"
            value={derivedUnitCost() === null ? cost() : centsToSolesInput(derivedUnitCost() ?? 0)}
            disabled={derivedUnitCost() !== null}
            onInput={(event) => setCost(event.currentTarget.value)}
          />
          <Show when={derivedUnitCost() !== null}>
            <span class={forms.etiqueta}>Sale de la presentación</span>
          </Show>
        </div>

        <p class={forms.nota} style={{ 'margin-bottom': '0' }}>
          <b>Presentación</b> — cómo te lo entrega y cuánto de lo tuyo trae. Déjalo vacío si te
          lo vende {isWeight() ? 'al kilo suelto' : 'por unidad suelta'}.
        </p>
        <div class={forms.fila}>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>Se vende por</span>
            <input
              id="condiciones-presentacion"
              class={forms.input}
              list="presentaciones-comunes"
              placeholder="caja, saco, docena…"
              value={presentation()}
              onInput={(event) => setPresentation(event.currentTarget.value)}
            />
            <datalist id="presentaciones-comunes">
              <For each={PRESENTACIONES}>{(item) => <option value={item} />}</For>
            </datalist>
          </div>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>{quantityLabel()}</span>
            <input
              id="condiciones-cantidad"
              class={forms.input}
              type="number"
              step={isWeight() ? '0.1' : '1'}
              min="0"
              value={packQuantity()}
              onInput={(event) => setPackQuantity(event.currentTarget.value)}
            />
          </div>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>Costo de la presentación S/</span>
            <input
              id="condiciones-costo-presentacion"
              class={forms.input}
              type="number"
              step="0.10"
              min="0"
              value={packCost()}
              onInput={(event) => setPackCost(event.currentTarget.value)}
            />
          </div>
        </div>

        <Show when={derivedUnitCost() !== null}>
          <p class={forms.nota}>
            {presentation() || 'La presentación'} de{' '}
            {isWeight() ? formatKg(packUnits() ?? 0) : `${packUnits() ?? 0} unidades`} a{' '}
            {formatSoles(solesInputToCents(packCost()) ?? 0)} ={' '}
            <b>
              {formatSoles(derivedUnitCost() ?? 0)} por {isWeight() ? 'kilo' : 'unidad'}
            </b>
          </p>
        </Show>

        <div class={forms.campo}>
          <span class={forms.etiqueta}>Código del proveedor (opcional)</span>
          <input
            id="condiciones-sku"
            class={forms.input}
            placeholder="cómo lo llama él en su lista"
            value={sku()}
            onInput={(event) => setSku(event.currentTarget.value)}
          />
        </div>

        <label class={forms.check}>
          <input
            type="checkbox"
            checked={preferred()}
            onChange={(event) => setPreferred(event.currentTarget.checked)}
          />
          Comprarle a este por defecto
        </label>

        <Show when={error() !== ''}>
          <p class={forms.error}>{error()}</p>
        </Show>
      </div>
    </Modal>
  );
};
