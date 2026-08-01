import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';

import type { TicketLine, UnitProductDto, WeightProductDto } from '@/shared/types';

// La venta en curso se persiste en localStorage: si la PC se reinicia,
// el ticket abierto (y los que están en espera) siguen ahí.
const STORAGE_KEY = 'mana-pos-venta';

interface HeldTicket {
  ticketId: string;
  lines: TicketLine[];
}

interface TicketState {
  ticketId: string;
  lines: TicketLine[];
  holds: HeldTicket[];
}

function newTicketId(): string {
  return crypto.randomUUID();
}

function freshState(): TicketState {
  return { ticketId: newTicketId(), lines: [], holds: [] };
}

function loadInitialState(): TicketState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return freshState();
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.ticketId === 'string' &&
      Array.isArray(parsed.lines) &&
      Array.isArray(parsed.holds)
    ) {
      return { ticketId: parsed.ticketId, lines: parsed.lines, holds: parsed.holds };
    }
    return freshState();
  } catch {
    return freshState();
  }
}

const [ticket, setTicket] = createStore<TicketState>(loadInitialState());

// Estado de UI, no persistido: línea seleccionada y última línea quitada.
const [selectedIndex, setSelectedIndex] = createSignal(-1);
const [lastRemoved, setLastRemoved] = createSignal<{ line: TicketLine; index: number } | null>(
  null,
);

function persist(): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ticketId: ticket.ticketId, lines: ticket.lines, holds: ticket.holds }),
  );
}

export function ticketId(): string {
  return ticket.ticketId;
}

export function ticketLines(): TicketLine[] {
  return ticket.lines;
}

export function ticketTotalCents(): number {
  return ticket.lines.reduce((sum, line) => sum + line.totalCents, 0);
}

export function heldTicketsCount(): number {
  return ticket.holds.length;
}

export function selectedLineIndex(): number {
  return selectedIndex();
}

export function selectLine(index: number): void {
  setSelectedIndex(index >= 0 && index < ticket.lines.length ? index : -1);
}

export function moveSelection(delta: number): void {
  const count = ticket.lines.length;
  if (count === 0) {
    setSelectedIndex(-1);
    return;
  }
  const current = selectedIndex();
  const base = current < 0 ? (delta > 0 ? -1 : count) : current;
  setSelectedIndex(Math.min(count - 1, Math.max(0, base + delta)));
}

export function addUnitProduct(product: UnitProductDto, quantity = 1): void {
  const amount = Math.max(1, Math.round(quantity));
  const index = ticket.lines.findIndex(
    (line) => line.product.id === product.id && line.weightGrams === null,
  );
  if (index >= 0) {
    const line = ticket.lines[index];
    if (line === undefined) return;
    setTicket('lines', index, {
      quantity: line.quantity + amount,
      totalCents: (line.quantity + amount) * product.priceCents,
    });
    setSelectedIndex(index);
    persist();
    return;
  }
  setTicket('lines', (lines) => [
    ...lines,
    {
      lineId: crypto.randomUUID(),
      product,
      quantity: amount,
      weightGrams: null,
      weightSource: null,
      totalCents: amount * product.priceCents,
    },
  ]);
  setSelectedIndex(ticket.lines.length - 1);
  persist();
}

export function addWeightProduct(
  product: WeightProductDto,
  grams: number,
  weightSource: 'scale' | 'manual',
): void {
  setTicket('lines', (lines) => [
    ...lines,
    {
      lineId: crypto.randomUUID(),
      product,
      quantity: 1,
      weightGrams: grams,
      weightSource,
      totalCents: Math.round((grams / 1000) * product.pricePerKgCents),
    },
  ]);
  setSelectedIndex(ticket.lines.length - 1);
  persist();
}

// Corrige el peso de una línea pesable (re-pesaje sin quitar la línea).
export function updateWeightLine(
  lineId: string,
  grams: number,
  weightSource: 'scale' | 'manual',
): void {
  const index = ticket.lines.findIndex((line) => line.lineId === lineId);
  const line = ticket.lines[index];
  if (line === undefined || line.product.saleType !== 'weight') return;
  setTicket('lines', index, {
    weightGrams: grams,
    weightSource,
    totalCents: Math.round((grams / 1000) * line.product.pricePerKgCents),
  });
  setSelectedIndex(index);
  persist();
}

// Ajusta la cantidad de una línea por unidades; no aplica a líneas pesadas.
export function adjustLineQuantity(index: number, delta: number): void {
  const line = ticket.lines[index];
  if (line === undefined || line.product.saleType !== 'unit' || line.weightGrams !== null) return;
  const quantity = line.quantity + delta;
  if (quantity < 1) return;
  setTicket('lines', index, { quantity, totalCents: quantity * line.product.priceCents });
  setSelectedIndex(index);
  persist();
}

export function adjustSelectedQuantity(delta: number): void {
  const index = selectedIndex() >= 0 ? selectedIndex() : ticket.lines.length - 1;
  adjustLineQuantity(index, delta);
}

// Lo que ya está en la cesta para un producto (unidades o gramos según el tipo).
export function reservedQuantity(productId: string): number {
  return ticket.lines
    .filter((line) => line.product.id === productId)
    .reduce((sum, line) => sum + (line.weightGrams ?? line.quantity), 0);
}

// Quitar es siempre reversible: la línea queda en memoria para Deshacer.
export function removeLine(lineId: string): TicketLine | null {
  const index = ticket.lines.findIndex((line) => line.lineId === lineId);
  const line = ticket.lines[index];
  if (line === undefined) return null;
  setLastRemoved({ line, index });
  setTicket('lines', (lines) => lines.filter((item) => item.lineId !== lineId));
  if (selectedIndex() >= ticket.lines.length) setSelectedIndex(ticket.lines.length - 1);
  persist();
  return line;
}

// F9: quita la línea seleccionada; si no hay selección, la última.
export function removeSelectedLine(): TicketLine | null {
  const index = selectedIndex() >= 0 ? selectedIndex() : ticket.lines.length - 1;
  const line = ticket.lines[index];
  if (line === undefined) return null;
  return removeLine(line.lineId);
}

export function removedLineAvailable(): boolean {
  return lastRemoved() !== null;
}

export function undoRemoveLine(): TicketLine | null {
  const memo = lastRemoved();
  if (memo === null) return null;
  setLastRemoved(null);
  const at = Math.min(memo.index, ticket.lines.length);
  setTicket('lines', (lines) => [...lines.slice(0, at), memo.line, ...lines.slice(at)]);
  setSelectedIndex(at);
  persist();
  return memo.line;
}

// Tras cobrar: ticket nuevo con id nuevo (el id viejo queda usado en la venta).
export function startNewTicket(): void {
  setTicket({ ticketId: newTicketId(), lines: [] });
  setSelectedIndex(-1);
  setLastRemoved(null);
  persist();
}

// Cliente que "ya vuelve": la venta actual pasa a espera y se abre una nueva.
export function holdCurrentTicket(): void {
  if (ticket.lines.length === 0) return;
  setTicket({
    ticketId: newTicketId(),
    lines: [],
    holds: [...ticket.holds, { ticketId: ticket.ticketId, lines: ticket.lines }],
  });
  setSelectedIndex(-1);
  persist();
}

// Retoma el último ticket en espera; si había venta en curso, esa pasa a espera.
export function resumeHeldTicket(): void {
  const held = ticket.holds[ticket.holds.length - 1];
  if (held === undefined) return;
  const remaining = ticket.holds.slice(0, -1);
  const current = ticket.lines;
  const currentId = ticket.ticketId;
  setTicket({
    ticketId: held.ticketId,
    lines: held.lines,
    holds: current.length > 0 ? [...remaining, { ticketId: currentId, lines: current }] : remaining,
  });
  setSelectedIndex(-1);
  persist();
}

