

import {type PurchaseOrderStatus } from '@/shared/api/purchases';
import {solesInputToCents } from '@/shared/lib/money';
import type { ChipTone } from '@/shared/ui/Chip';
import type {ProductDto } from '@/shared/types';

export const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  draft: 'borrador',
  open: 'abierta',
  partial: 'parcial',
  received: 'recibida',
  cancelled: 'cancelada',
  closed: 'cerrada incompleta',
};

// Qué significa cada estado en la tienda. Va como tooltip del chip: son seis
// palabras que nadie tiene por qué adivinar.
export const STATUS_HINT: Record<PurchaseOrderStatus, string> = {
  draft: 'Se está armando; el proveedor todavía no la vio',
  open: 'Pedida al proveedor, esperando que llegue',
  partial: 'Llegó una parte; falta el resto',
  received: 'Llegó todo lo que se pidió',
  cancelled: 'Se anuló sin recibir nada',
  closed: 'Se recibió lo que llegó y el resto ya no viene',
};

export function statusTone(status: PurchaseOrderStatus): ChipTone {
  const byStatus: Record<PurchaseOrderStatus, ChipTone> = {
    draft: 'neutro',
    open: 'info',
    partial: 'alerta',
    received: 'exito',
    // Rojo solo para lo que salió mal: una orden cancelada nunca trajo nada.
    cancelled: 'peligro',
    // Cerrar incompleta no es un fracaso: la mercadería entró. Pero algo quedó
    // sin traer y eso se mira. Amarillo de «ojo con esto», no rojo de alarma.
    closed: 'alerta',
  };
  return byStatus[status];
}


// Línea en edición: para productos con caja se pide en cajas; para el resto
// en unidades; para pesables en kilos. Todo se convierte al crear la orden.
export interface DraftLine {
  product: ProductDto;
  quantity: string;
  cost: string;
  // Empaque de ESTE proveedor: uno vende cajas de 12 y otro de 24. Null cuando
  // el proveedor no tiene empaque cargado y se compra por unidad.
  packSize: number | null;
}

// El empaque de la línea manda sobre el del producto: el producto guarda uno
// solo y con dos proveedores sería el del equivocado.
export function packSizeOf(line: DraftLine): number | null {
  return line.product.saleType === 'unit' ? line.packSize : null;
}

export function quantityUnits(line: DraftLine): number {
  const packSize = packSizeOf(line);
  if (packSize !== null) {
    return (Number.parseInt(line.quantity, 10) || 0) * packSize;
  }
  if (line.product.saleType === 'weight') {
    const kg = Number.parseFloat(line.quantity);
    return Number.isNaN(kg) ? 0 : Math.round(kg * 1000);
  }
  return Number.parseInt(line.quantity, 10) || 0;
}

// Costo pactado por unidad o por kg; para cajas se deriva del costo por caja.
export function unitCostCents(line: DraftLine): number | null {
  const cents = solesInputToCents(line.cost);
  if (cents === null || cents <= 0) return null;
  const packSize = packSizeOf(line);
  return packSize === null ? cents : Math.round(cents / packSize);
}

export function lineTotalCents(line: DraftLine): number {
  const cost = unitCostCents(line) ?? 0;
  const units = quantityUnits(line);
  return line.product.saleType === 'weight'
    ? Math.round((cost * units) / 1000)
    : cost * units;
}

export function quantityText(line: { saleType: 'unit' | 'weight'; quantity: number; packSize: number | null }): string {
  if (line.saleType === 'weight') return `${(line.quantity / 1000).toFixed(3)} kg`;
  if (line.packSize !== null && line.quantity > 0 && line.quantity % line.packSize === 0) {
    return `${line.quantity} unid. (${line.quantity / line.packSize} cajas)`;
  }
  return `${line.quantity} unid.`;
}

export interface ReceiveDraft {
  quantity: string;
  cost: string;
  expiry: string;
}
