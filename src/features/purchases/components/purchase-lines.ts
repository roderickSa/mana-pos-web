

import {type PurchaseOrderStatus } from '@/shared/api/purchases';
import {solesInputToCents } from '@/shared/lib/money';
import type {ProductDto } from '@/shared/types';
import styles from '../PurchasesView.module.css';

export const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  open: 'abierta',
  partial: 'parcial',
  received: 'recibida',
  cancelled: 'cancelada',
};

export function statusClass(status: PurchaseOrderStatus): string {
  const byStatus: Record<PurchaseOrderStatus, string> = {
    open: styles.estadoAbierta,
    partial: styles.estadoParcial,
    received: styles.estadoRecibida,
    cancelled: styles.estadoCancelada,
  };
  return `${styles.estado} ${byStatus[status]}`;
}


// Línea en edición: para productos con caja se pide en cajas; para el resto
// en unidades; para pesables en kilos. Todo se convierte al crear la orden.
export interface DraftLine {
  product: ProductDto;
  quantity: string;
  cost: string;
}

export function packSizeOf(product: ProductDto): number | null {
  return product.saleType === 'unit' ? product.packSize : null;
}

export function quantityUnits(line: DraftLine): number {
  const packSize = packSizeOf(line.product);
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
  const packSize = packSizeOf(line.product);
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
