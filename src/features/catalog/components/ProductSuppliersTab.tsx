import { createResource, createSignal, For, Show, type Component } from 'solid-js';

import { apiErrorMessage } from '@/shared/api/client';
import {
  listProductSupplies,
  unlinkProductSupplier,
  type ProductSupplyDto,
} from '@/shared/api/products';
import { listSuppliers } from '@/shared/api/suppliers';
import { formatKg, formatSoles } from '@/shared/lib/money';
import { beepError, beepOk } from '@/shared/lib/sounds';
import { showNotice } from '@/shared/state/notices';
import { Chip } from '@/shared/ui/Chip';
import { ConfirmModal } from '@/shared/ui/ConfirmModal';
import forms from '@/shared/ui/forms.module.css';
import styles from './ProductSuppliersTab.module.css';
import { SupplyTermsModal } from './SupplyTermsModal';

// A quién se le compra ESTE producto y en qué condiciones cada uno. Vive dentro
// del producto porque es un dato suyo, no una pantalla aparte.
export const ProductSuppliersTab: Component<{
  productId: string;
  productName: string;
  saleType: 'unit' | 'weight';
  priceCents: number;
}> = (props) => {
  const [version, setVersion] = createSignal(0);
  const [supplies, { refetch }] = createResource(version, () =>
    listProductSupplies(props.productId),
  );
  const [allSuppliers] = createResource(listSuppliers);
  const [editing, setEditing] = createSignal<ProductSupplyDto | null>(null);
  const [adding, setAdding] = createSignal('');
  const [removing, setRemoving] = createSignal<ProductSupplyDto | null>(null);

  const isWeight = (): boolean => props.saleType === 'weight';
  const mine = (): ProductSupplyDto[] => supplies() ?? [];
  const nameOf = (supplierId: string): string =>
    (allSuppliers() ?? []).find((item) => item.id === supplierId)?.name ?? supplierId;

  // Los que todavía no surten este producto.
  const disponibles = () =>
    (allSuppliers() ?? [])
      .filter((item) => item.active)
      .filter((item) => !mine().some((supply) => supply.supplierId === item.id));

  const cheapest = (): string | null => {
    const conPrecio = mine().filter((supply) => supply.unitCostCents !== null);
    if (conPrecio.length < 2) return null;
    return conPrecio.reduce((best, supply) =>
      (supply.unitCostCents ?? 0) < (best.unitCostCents ?? 0) ? supply : best,
    ).supplierId;
  };

  function costLabel(supply: ProductSupplyDto): string {
    if (supply.unitCostCents === null) return 'sin costo cargado';
    return `${formatSoles(supply.unitCostCents)} ${isWeight() ? 'el kilo' : 'c/u'}`;
  }

  function presentationLabel(supply: ProductSupplyDto): string {
    if (supply.packSize === null || supply.packCostCents === null) {
      return isWeight() ? 'te lo vende al kilo suelto' : 'te lo vende por unidad suelta';
    }
    const cuanto = isWeight() ? formatKg(supply.packSize) : `${supply.packSize} und`;
    return `${supply.presentationName ?? 'caja'} de ${cuanto} a ${formatSoles(supply.packCostCents)}`;
  }

  function blankSupply(supplierId: string): ProductSupplyDto {
    return {
      productId: props.productId,
      supplierId,
      unitCostCents: null,
      presentationName: null,
      packSize: null,
      packCostCents: null,
      supplierSku: null,
      preferred: mine().length === 0,
      updatedAt: null,
    };
  }

  async function remove(supply: ProductSupplyDto): Promise<void> {
    try {
      await unlinkProductSupplier(props.productId, supply.supplierId);
      beepOk();
      showNotice(`${nameOf(supply.supplierId)} ya no surte este producto`);
      setRemoving(null);
      void refetch();
    } catch (cause) {
      beepError();
      setRemoving(null);
      showNotice(apiErrorMessage(cause, 'No se pudo quitar el proveedor.'));
    }
  }

  return (
    <div class={forms.form}>
      <p class={forms.nota}>
        A quién le compras este producto y en qué condiciones. Cada proveedor tiene su costo y su
        presentación: uno te vende la caja de 12 y otro la de 24.
      </p>

      <Show
        when={mine().length > 0}
        fallback={
          <p class={styles.vacio}>
            Todavía no le compras este producto a nadie. Sin proveedor se puede vender igual, pero
            no entra en las órdenes de compra.
          </p>
        }
      >
        <div class={styles.lista}>
          <For each={mine()}>
            {(supply) => (
              <div class={styles.fila}>
                <div class={styles.datos}>
                  <div class={styles.nombre}>
                    {nameOf(supply.supplierId)}
                    <Show when={supply.preferred}>
                      <Chip tone="info">de cabecera</Chip>
                    </Show>
                    <Show when={supply.supplierId === cheapest()}>
                      <Chip tone="exito">el más barato</Chip>
                    </Show>
                  </div>
                  <div class={styles.detalle}>
                    {costLabel(supply)} · {presentationLabel(supply)}
                    <Show when={supply.supplierSku !== null}>
                      {' '}
                      · su código: {supply.supplierSku}
                    </Show>
                  </div>
                </div>
                <div class={styles.acciones}>
                  <button type="button" class={forms.secundario} onClick={() => setEditing(supply)}>
                    Condiciones
                  </button>
                  <button type="button" class={forms.secundario} onClick={() => setRemoving(supply)}>
                    Quitar
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>
      </Show>

      <Show when={disponibles().length > 0}>
        <div class={forms.campo}>
          <span class={forms.etiqueta}>Agregar proveedor</span>
          <div style={{ display: 'flex', gap: '8px', 'flex-wrap': 'wrap' }}>
            <select
              id="agregar-proveedor"
              class={forms.select}
              style={{ flex: '1', 'min-width': '180px' }}
              value={adding()}
              onChange={(event) => setAdding(event.currentTarget.value)}
            >
              <option value="">— Elige proveedor —</option>
              <For each={disponibles()}>
                {(item) => <option value={item.id}>{item.name}</option>}
              </For>
            </select>
            <button
              type="button"
              class={forms.secundario}
              disabled={adding() === ''}
              onClick={() => {
                setEditing(blankSupply(adding()));
                setAdding('');
              }}
            >
              Cargar condiciones
            </button>
          </div>
        </div>
      </Show>

      <Show when={editing()}>
        {(supply) => (
          <SupplyTermsModal
            supply={supply()}
            supplierName={nameOf(supply().supplierId)}
            productName={props.productName}
            saleType={props.saleType}
            priceCents={props.priceCents}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              setVersion((value) => value + 1);
              void refetch();
            }}
          />
        )}
      </Show>

      <Show when={removing()}>
        {(supply) => (
          <ConfirmModal
            title={`Quitar a ${nameOf(supply().supplierId)}`}
            confirmLabel="Quitar proveedor"
            onConfirm={() => void remove(supply())}
            onClose={() => setRemoving(null)}
          >
            <p class={forms.nota}>
              Se borran sus condiciones para «{props.productName}». Las compras que ya le hiciste no
              se tocan.
            </p>
          </ConfirmModal>
        )}
      </Show>
    </div>
  );
};
