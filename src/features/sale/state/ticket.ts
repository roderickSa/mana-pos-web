import { createStore } from 'solid-js/store';

import type { ProductDto, TicketLine, UnitProductDto, WeightProductDto } from '@/shared/types';

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

export function addUnitProduct(product: UnitProductDto): void {
  const index = ticket.lines.findIndex(
    (line) => line.product.id === product.id && line.weightGrams === null,
  );
  if (index >= 0) {
    const line = ticket.lines[index];
    if (line === undefined) return;
    setTicket('lines', index, {
      quantity: line.quantity + 1,
      totalCents: (line.quantity + 1) * product.priceCents,
    });
    persist();
    return;
  }
  setTicket('lines', (lines) => [
    ...lines,
    {
      lineId: crypto.randomUUID(),
      product,
      quantity: 1,
      weightGrams: null,
      weightSource: null,
      totalCents: product.priceCents,
    },
  ]);
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
  persist();
}

// Lo que ya está en la cesta para un producto (unidades o gramos según el tipo).
export function reservedQuantity(productId: string): number {
  return ticket.lines
    .filter((line) => line.product.id === productId)
    .reduce((sum, line) => sum + (line.weightGrams ?? line.quantity), 0);
}

export function removeLine(lineId: string): void {
  setTicket('lines', (lines) => lines.filter((line) => line.lineId !== lineId));
  persist();
}

// Undo de la última línea agregada (F9): deshace lo último, no toda la venta.
export function removeLastLine(): void {
  setTicket('lines', (lines) => lines.slice(0, -1));
  persist();
}

// Tras cobrar: ticket nuevo con id nuevo (el id viejo queda usado en la venta).
export function startNewTicket(): void {
  setTicket({ ticketId: newTicketId(), lines: [] });
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
  persist();
}

export type { ProductDto };
