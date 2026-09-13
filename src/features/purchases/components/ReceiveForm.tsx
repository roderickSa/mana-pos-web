import {createEffect, createSignal, For, onCleanup, Show, type Component } from 'solid-js';


import {receivePurchaseOrder, type PurchaseOrderDto, type PurchaseOrderLineDto, type ReceiveOrderLinePayload } from '@/shared/api/purchases';
import {centsToSolesInput, solesInputToCents } from '@/shared/lib/money';
import {beepError, beepSuccess } from '@/shared/lib/sounds';
import {showNotice } from '@/shared/state/notices';
import {DateField } from '@/shared/ui/DateField';
import formStyles from '@/shared/ui/forms.module.css';
import styles from '../PurchasesView.module.css';
import { readStored, removeStored, writeStored } from '@/shared/lib/storage';
import {quantityText, type ReceiveDraft } from './purchase-lines';
import {
  decodeReceptionDraft,
  linesOfReceptionDraft,
  receptionDraftOf,
} from './reception-draft';

export const ReceiveForm: Component<{
  order: PurchaseOrderDto;
  onCancel: () => void;
  onReceived: (order: PurchaseOrderDto) => void;
}> = (props) => {
  const pendingLines = props.order.lines.filter((line) => line.pendingQuantity > 0);
  const initialDrafts = new Map<string, ReceiveDraft>(
    pendingLines.map((line) => [
      line.id,
      {
        quantity:
          line.saleType === 'weight'
            ? (line.pendingQuantity / 1000).toFixed(3)
            : String(line.pendingQuantity),
        cost: centsToSolesInput(line.unitCostCents),
        expiry: '',
      },
    ]),
  );
  // Lo tecleado sobrevive a una recarga, y con ello el `receptionId`: es lo
  // que hace que reintentar no meta la mercadería dos veces. Ver
  // reception-draft.ts.
  const clave = (): `mana-pos:recepcion:${string}` => `mana-pos:recepcion:${props.order.id}`;
  const guardado = readStored(clave(), decodeReceptionDraft);

  // Fijo mientras dure la recepción, incluso entre recargas.
  const receptionId = guardado?.receptionId ?? crypto.randomUUID();
  const [drafts, setDrafts] = createSignal(
    guardado === undefined ? initialDrafts : linesOfReceptionDraft(guardado),
  );
  const [error, setError] = createSignal('');
  const [saving, setSaving] = createSignal(false);
  const [documentNumber, setDocumentNumber] = createSignal(guardado?.documentNumber ?? '');
  const [paymentTerms, setPaymentTerms] = createSignal(guardado?.paymentTerms ?? '');

  // El id se guarda ya, antes de que nadie teclee nada: si la recarga pasa en
  // el medio, el reintento tiene que salir con este mismo id.
  let timer: ReturnType<typeof setTimeout> | undefined;
  createEffect(() => {
    const actual = receptionDraftOf(receptionId, documentNumber(), paymentTerms(), drafts());
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      writeStored(clave(), actual);
    }, 300);
  });
  onCleanup(() => {
    if (timer !== undefined) clearTimeout(timer);
  });

  function olvidarBorrador(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    removeStored(clave());
  }

  function draftOf(line: PurchaseOrderLineDto): ReceiveDraft {
    return drafts().get(line.id) ?? { quantity: '', cost: '', expiry: '' };
  }

  function updateDraft(lineId: string, patch: Partial<ReceiveDraft>): void {
    const next = new Map(drafts());
    const current = next.get(lineId);
    if (current === undefined) return;
    next.set(lineId, { ...current, ...patch });
    setDrafts(next);
  }

  function receivedUnits(line: PurchaseOrderLineDto): number {
    const draft = draftOf(line);
    if (line.saleType === 'weight') {
      const kg = Number.parseFloat(draft.quantity);
      return Number.isNaN(kg) ? 0 : Math.round(kg * 1000);
    }
    return Number.parseInt(draft.quantity, 10) || 0;
  }

  function differenceLabel(line: PurchaseOrderLineDto): string {
    const units = receivedUnits(line);
    if (units === 0 || units === line.pendingQuantity) return '';
    const diff = Math.abs(units - line.pendingQuantity);
    const amount = line.saleType === 'weight' ? `${(diff / 1000).toFixed(3)} kg` : `${diff} und`;
    return units < line.pendingQuantity ? `faltan ${amount}` : `sobran ${amount}`;
  }

  const anyToReceive = () => pendingLines.some((line) => receivedUnits(line) > 0);

  async function confirm(): Promise<void> {
    if (!anyToReceive() || saving()) return;
    setSaving(true);
    setError('');
    const payload: ReceiveOrderLinePayload[] = [];
    for (const line of pendingLines) {
      const units = receivedUnits(line);
      if (units <= 0) continue;
      const draft = draftOf(line);
      const costCents = solesInputToCents(draft.cost);
      payload.push({
        lineId: line.id,
        quantity: units,
        unitCostCents: costCents === null || costCents <= 0 ? null : costCents,
        expiryDate: draft.expiry.trim() === '' ? null : draft.expiry,
      });
    }
    try {
      const updated = await receivePurchaseOrder(
        props.order.id,
        receptionId,
        payload,
        documentNumber().trim() === '' ? null : documentNumber().trim(),
        paymentTerms().trim() === '' ? null : paymentTerms().trim(),
      );
      olvidarBorrador();
      beepSuccess();
      showNotice(
        updated.status === 'received' ? 'Orden recibida completa' : 'Recepción parcial registrada',
      );
      props.onReceived(updated);
    } catch {
      beepError();
      setError('No se pudo registrar la recepción.');
      setSaving(false);
    }
  }

  return (
    <div class={formStyles.form}>
      <div class={formStyles.fila}>
        <div class={formStyles.campo}>
          <span class={formStyles.etiqueta}>Factura o guía (opcional)</span>
          <input
            id="recepcion-documento"
            class={formStyles.input}
            placeholder="p. ej. F001-4821"
            value={documentNumber()}
            onInput={(event) => setDocumentNumber(event.currentTarget.value)}
          />
        </div>
        <div class={formStyles.campo}>
          <span class={formStyles.etiqueta}>Cómo se pagó (opcional)</span>
          <input
            id="recepcion-pago"
            class={formStyles.input}
            list="condiciones-pago"
            placeholder="contado, crédito 15 días…"
            value={paymentTerms()}
            onInput={(event) => setPaymentTerms(event.currentTarget.value)}
          />
          <datalist id="condiciones-pago">
            <option value="contado" />
            <option value="crédito 7 días" />
            <option value="crédito 15 días" />
            <option value="crédito 30 días" />
          </datalist>
        </div>
      </div>

      <p class={formStyles.nota}>
        Ajusta lo que llegó de verdad. Lo que dejes en 0 queda pendiente para otra recepción. El
        costo real actualiza el costo del producto y el kardex.
      </p>
      <div class={styles.lineas}>
        <For each={pendingLines}>
          {(line) => (
            <div class={styles.linea}>
              <div>
                <div class={styles.lineaNombre}>{line.description}</div>
                <div class={styles.lineaSub}>
                  pendiente:{' '}
                  {quantityText({
                    saleType: line.saleType,
                    quantity: line.pendingQuantity,
                    packSize: line.packSize,
                  })}
                  <Show when={differenceLabel(line) !== ''}>
                    {' · '}
                    <b>{differenceLabel(line)}</b>
                  </Show>
                </div>
              </div>
              <div class={formStyles.campo}>
                <span class={formStyles.etiqueta}>
                  {line.saleType === 'weight' ? 'Llegó (kg)' : 'Llegó (und)'}
                </span>
                <input
                  class={formStyles.input}
                  type="number"
                  min="0"
                  step={line.saleType === 'weight' ? '0.1' : '1'}
                  value={draftOf(line).quantity}
                  onInput={(event) => updateDraft(line.id, { quantity: event.currentTarget.value })}
                />
              </div>
              <div class={formStyles.campo}>
                <span class={formStyles.etiqueta}>
                  {line.saleType === 'weight' ? 'Costo real /kg' : 'Costo real /und'}
                </span>
                <input
                  class={formStyles.input}
                  type="number"
                  min="0"
                  step="0.10"
                  value={draftOf(line).cost}
                  onInput={(event) => updateDraft(line.id, { cost: event.currentTarget.value })}
                />
              </div>
              <div class={formStyles.campo}>
                <span class={formStyles.etiqueta}>Vence</span>
                <DateField
                  value={draftOf(line).expiry}
                  onChange={(iso) => updateDraft(line.id, { expiry: iso })}
                />
              </div>
              <span />
            </div>
          )}
        </For>
      </div>
      <Show when={error() !== ''}>
        <p class={formStyles.error}>{error()}</p>
      </Show>
      <div class={formStyles.acciones}>
        <button type="button" class={formStyles.secundario} onClick={props.onCancel}>
          Volver
        </button>
        <button
          type="button"
          class={formStyles.primario}
          disabled={!anyToReceive() || saving()}
          onClick={confirm}
        >
          Confirmar recepción
        </button>
      </div>
    </div>
  );
};

// Proveedores viven aquí y no en Ajustes: se consultan al pedir y al recibir.
