import { createSignal } from 'solid-js';
import { createStore } from 'solid-js/store';

import { roundToDimeCents } from '@/shared/lib/money';
import type { TicketLine, UnitProductDto, WeightProductDto } from '@/shared/types';

// La venta en curso se persiste en localStorage: si la PC se reinicia,
// el ticket abierto (y los que están en espera) siguen ahí.
const STORAGE_KEY = 'mana-pos-venta';

export interface TicketCustomer {
  id: string;
  name: string;
}

interface HeldTicket {
  ticketId: string;
  lines: TicketLine[];
  ticketDiscountCents: number;
  discountAuthorizedBy: string | null;
  customer: TicketCustomer | null;
}

interface TicketState {
  ticketId: string;
  lines: TicketLine[];
  // Descuento al ticket completo, aparte de los descuentos por línea.
  ticketDiscountCents: number;
  // Encargado que autorizó descuentos con su PIN (null = no hizo falta).
  discountAuthorizedBy: string | null;
  // Cliente opcional: la venta puede quedar a nombre de alguien (no solo fiado).
  customer: TicketCustomer | null;
  holds: HeldTicket[];
}

function newTicketId(): string {
  return crypto.randomUUID();
}

function freshState(): TicketState {
  return {
    ticketId: newTicketId(),
    lines: [],
    ticketDiscountCents: 0,
    discountAuthorizedBy: null,
    customer: null,
    holds: [],
  };
}

// La línea pesable se calcula EXACTA al céntimo; el redondeo a 10 céntimos se
// aplica UNA sola vez sobre el total del ticket (redondear por línea pierde
// plata). Espejo de la regla del servidor.
function weightGrossCents(grams: number, pricePerKgCents: number): number {
  return Math.round((grams / 1000) * pricePerKgCents);
}

// Tickets guardados por versiones anteriores: descuentos a 0 y totales de
// pesables recalculados con el redondeo de balanza.
function normalizeLines(lines: TicketLine[]): TicketLine[] {
  return lines.map((line) => {
    const discountCents = line.discountCents ?? 0;
    if (line.weightGrams !== null && line.product.saleType === 'weight') {
      const gross = weightGrossCents(line.weightGrams, line.product.pricePerKgCents);
      const clamped = Math.min(discountCents, gross);
      return { ...line, discountCents: clamped, totalCents: gross - clamped };
    }
    return { ...line, discountCents };
  });
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
      return {
        ticketId: parsed.ticketId,
        lines: normalizeLines(parsed.lines),
        ticketDiscountCents:
          typeof parsed.ticketDiscountCents === 'number' ? parsed.ticketDiscountCents : 0,
        discountAuthorizedBy:
          typeof parsed.discountAuthorizedBy === 'string' ? parsed.discountAuthorizedBy : null,
        customer: parsed.customer ?? null,
        holds: parsed.holds.map((held: HeldTicket) => ({
          ticketId: held.ticketId,
          lines: normalizeLines(held.lines),
          ticketDiscountCents:
            typeof held.ticketDiscountCents === 'number' ? held.ticketDiscountCents : 0,
          discountAuthorizedBy:
            typeof held.discountAuthorizedBy === 'string' ? held.discountAuthorizedBy : null,
          customer: held.customer ?? null,
        })),
      };
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
    JSON.stringify({
      ticketId: ticket.ticketId,
      lines: ticket.lines,
      ticketDiscountCents: ticket.ticketDiscountCents,
      discountAuthorizedBy: ticket.discountAuthorizedBy,
      customer: ticket.customer,
      holds: ticket.holds,
    }),
  );
}

export function ticketId(): string {
  return ticket.ticketId;
}

export function ticketLines(): TicketLine[] {
  return ticket.lines;
}

export function ticketLinesTotalCents(): number {
  return ticket.lines.reduce((sum, line) => sum + line.totalCents, 0);
}

// El descuento guardado se recorta si el ticket se achicó (quitar líneas).
export function ticketDiscountCents(): number {
  return Math.min(ticket.ticketDiscountCents, ticketLinesTotalCents());
}

export function discountAuthorizedBy(): string | null {
  return ticket.discountAuthorizedBy;
}

// Suma exacta al céntimo, antes del redondeo de caja.
export function ticketSubtotalCents(): number {
  return ticketLinesTotalCents() - ticketDiscountCents();
}

// Lo que el cliente paga: el redondeo a S/0.10 se aplica UNA vez, aquí.
export function ticketTotalCents(): number {
  return roundToDimeCents(ticketSubtotalCents());
}

// Ajuste por redondeo (positivo o negativo), para mostrarlo en el totalizador.
export function ticketRoundingCents(): number {
  return ticketTotalCents() - ticketSubtotalCents();
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

function unitLineTotal(quantity: number, priceCents: number, discountCents: number): number {
  return Math.max(0, quantity * priceCents - discountCents);
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
      totalCents: unitLineTotal(line.quantity + amount, product.priceCents, line.discountCents),
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
      discountCents: 0,
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
      discountCents: 0,
      totalCents: weightGrossCents(grams, product.pricePerKgCents),
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
  const grossCents = weightGrossCents(grams, line.product.pricePerKgCents);
  // Si el nuevo peso deja la línea más barata que el descuento, este se recorta.
  const discountCents = Math.min(line.discountCents, grossCents);
  setTicket('lines', index, {
    weightGrams: grams,
    weightSource,
    discountCents,
    totalCents: grossCents - discountCents,
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
  const grossCents = quantity * line.product.priceCents;
  const discountCents = Math.min(line.discountCents, grossCents);
  setTicket('lines', index, { quantity, discountCents, totalCents: grossCents - discountCents });
  setSelectedIndex(index);
  persist();
}

export function adjustSelectedQuantity(delta: number): void {
  const index = selectedIndex() >= 0 ? selectedIndex() : ticket.lines.length - 1;
  adjustLineQuantity(index, delta);
}

// Fija la cantidad exacta de una línea por unidades (keypad táctil).
export function setLineQuantity(lineId: string, quantity: number): boolean {
  const index = ticket.lines.findIndex((line) => line.lineId === lineId);
  const line = ticket.lines[index];
  if (line === undefined || line.product.saleType !== 'unit' || line.weightGrams !== null) {
    return false;
  }
  const amount = Math.round(quantity);
  if (amount < 1) return false;
  const grossCents = amount * line.product.priceCents;
  const discountCents = Math.min(line.discountCents, grossCents);
  setTicket('lines', index, { quantity: amount, discountCents, totalCents: grossCents - discountCents });
  setSelectedIndex(index);
  persist();
  return true;
}

// Rebaja de una línea. El bruto de la línea es el tope; devuelve false si no aplica.
export function applyLineDiscount(lineId: string, discountCents: number): boolean {
  const index = ticket.lines.findIndex((line) => line.lineId === lineId);
  const line = ticket.lines[index];
  if (line === undefined) return false;
  const grossCents = line.totalCents + line.discountCents;
  if (discountCents < 0 || discountCents > grossCents) return false;
  setTicket('lines', index, { discountCents, totalCents: grossCents - discountCents });
  persist();
  return true;
}

export function setTicketDiscount(discountCents: number): boolean {
  if (discountCents < 0 || discountCents > ticketLinesTotalCents()) return false;
  setTicket({ ticketDiscountCents: discountCents });
  persist();
  return true;
}

// Queda registrado quién autorizó (verificado por PIN) para mandarlo al cobrar.
export function markDiscountAuthorizedBy(name: string): void {
  setTicket({ discountAuthorizedBy: name });
  persist();
}

export function ticketCustomer(): TicketCustomer | null {
  return ticket.customer;
}

export function setTicketCustomer(customer: TicketCustomer | null): void {
  setTicket({ customer });
  persist();
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
  setTicket({ ticketId: newTicketId(), lines: [], ticketDiscountCents: 0, discountAuthorizedBy: null, customer: null });
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
    ticketDiscountCents: 0,
    discountAuthorizedBy: null,
    customer: null,
    holds: [
      ...ticket.holds,
      {
        ticketId: ticket.ticketId,
        lines: ticket.lines,
        ticketDiscountCents: ticket.ticketDiscountCents,
        discountAuthorizedBy: ticket.discountAuthorizedBy,
        customer: ticket.customer,
      },
    ],
  });
  setSelectedIndex(-1);
  persist();
}

// Retoma el último ticket en espera; si había venta en curso, esa pasa a espera.
export function resumeHeldTicket(): void {
  const held = ticket.holds[ticket.holds.length - 1];
  if (held === undefined) return;
  const remaining = ticket.holds.slice(0, -1);
  const current: HeldTicket = {
    ticketId: ticket.ticketId,
    lines: ticket.lines,
    ticketDiscountCents: ticket.ticketDiscountCents,
    discountAuthorizedBy: ticket.discountAuthorizedBy,
    customer: ticket.customer,
  };
  setTicket({
    ticketId: held.ticketId,
    lines: held.lines,
    ticketDiscountCents: held.ticketDiscountCents,
    discountAuthorizedBy: held.discountAuthorizedBy,
    customer: held.customer,
    holds: current.lines.length > 0 ? [...remaining, current] : remaining,
  });
  setSelectedIndex(-1);
  persist();
}
