import { createResource, createSignal, For, Match, Show, Switch, type Component } from 'solid-js';

import { apiErrorMessage } from '@/shared/api/client';
import {
  getSalesReport,
  getWasteReport,
  type ProductSalesDto,
  type SalesReportDto,
  type WasteReportDto,
} from '@/shared/api/reports';
import { QUICK_RANGE_LABELS, quickRange, type QuickRange } from '@/shared/lib/date-ranges';
import { formatKg, formatSoles } from '@/shared/lib/money';
import tabla from '@/shared/ui/tabla.module.css';
import styles from './ReportsView.module.css';

type ReportsTab = 'resumen' | 'productos' | 'categorias' | 'horas' | 'mermas';

const TABS: Array<{ key: ReportsTab; label: string }> = [
  { key: 'resumen', label: 'Resumen' },
  { key: 'productos', label: 'Más vendidos' },
  { key: 'categorias', label: 'Por categoría' },
  { key: 'horas', label: 'Por hora' },
  { key: 'mermas', label: 'Mermas' },
];

const QUICK: QuickRange[] = ['hoy', 'ayer', 'semana', 'mes'];

const WASTE_LABELS = { waste: 'Merma', expiry: 'Vencido', theft: 'Robo / pérdida' } as const;

function quantityLabel(row: { saleType: 'unit' | 'weight'; quantitySold?: number; quantity?: number }): string {
  const value = row.quantitySold ?? row.quantity ?? 0;
  return row.saleType === 'weight' ? formatKg(value) : `${value} unid.`;
}

function marginPercent(revenueCents: number, marginCents: number): string {
  if (revenueCents === 0) return '—';
  return `${Math.round((marginCents / revenueCents) * 100)} %`;
}

function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, date ?? 1).toLocaleDateString('es-PE', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });
}

// Celda con barra proporcional detrás del número: una serie, un tono.
const BarCell: Component<{ value: number; max: number; label: string }> = (props) => (
  <td class={`${tabla.num} ${styles.barraCelda}`}>
    <span
      class={styles.barra}
      style={{ width: `${props.max === 0 ? 0 : Math.round((props.value / props.max) * 100)}%` }}
    />
    <span class={styles.barraTexto}>{props.label}</span>
  </td>
);

export const ReportsView: Component = () => {
  const initial = quickRange('semana');
  const [from, setFrom] = createSignal(initial.from);
  const [to, setTo] = createSignal(initial.to);
  const [tab, setTab] = createSignal<ReportsTab>('resumen');

  const [sales] = createResource(
    () => ({ from: from(), to: to() }),
    (range) => getSalesReport(range.from, range.to),
  );
  const [waste] = createResource(
    () => (tab() === 'mermas' ? { from: from(), to: to() } : null),
    (range) => getWasteReport(range.from, range.to),
  );

  const isQuick = (kind: QuickRange) => {
    const range = quickRange(kind);
    return from() === range.from && to() === range.to;
  };

  const maxDayRevenue = () => Math.max(0, ...(sales()?.byDay.map((row) => row.revenueCents) ?? []));
  const maxProductRevenue = () => Math.max(0, ...(sales()?.byProduct.map((row) => row.revenueCents) ?? []));
  const maxCategoryRevenue = () => Math.max(0, ...(sales()?.byCategory.map((row) => row.revenueCents) ?? []));
  const maxHour = () => Math.max(0, ...(sales()?.byHour.map((row) => row.revenueCents) ?? []));
  const peakHour = () => {
    const rows = sales()?.byHour ?? [];
    return rows.reduce<number | null>(
      (best, row) => (row.revenueCents > 0 && (best === null || row.revenueCents > (rows[best]?.revenueCents ?? 0)) ? row.hour : best),
      null,
    );
  };

  return (
    <section class={tabla.contenedorTabs}>
      <nav class={tabla.subnav} aria-label="Reportes">
        {TABS.map((item) => (
          <button
            type="button"
            class={tabla.subtab}
            classList={{ [tabla.subtabActiva]: tab() === item.key }}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div class={styles.vista}>
        <div class={styles.filtros}>
          <div class={styles.rapidos}>
            <For each={QUICK}>
              {(kind) => (
                <button
                  type="button"
                  class={styles.rapido}
                  classList={{ [styles.rapidoActivo]: isQuick(kind) }}
                  onClick={() => {
                    const range = quickRange(kind);
                    setFrom(range.from);
                    setTo(range.to);
                  }}
                >
                  {QUICK_RANGE_LABELS[kind]}
                </button>
              )}
            </For>
          </div>
          <label class={styles.fecha}>
            Desde
            <input type="date" value={from()} max={to()} onChange={(event) => setFrom(event.currentTarget.value)} />
          </label>
          <label class={styles.fecha}>
            Hasta
            <input type="date" value={to()} min={from()} onChange={(event) => setTo(event.currentTarget.value)} />
          </label>
        </div>

        <Show when={sales.error}>
          <p class={styles.vacio}>{apiErrorMessage(sales.error, 'No se pudo cargar el reporte.')}</p>
        </Show>
        <Show when={sales.loading && sales() === undefined}>
          <p class={styles.cargando}>Calculando…</p>
        </Show>

        <Show when={sales()}>
          {(report) => (
            <Switch>
              <Match when={tab() === 'resumen'}>
                <Summary report={report()} maxDay={maxDayRevenue()} />
              </Match>
              <Match when={tab() === 'productos'}>
                <ProductsTable rows={report().byProduct} max={maxProductRevenue()} />
              </Match>
              <Match when={tab() === 'categorias'}>
                <div class={styles.panel}>
                  <h3 class={styles.panelTitulo}>Vendido por categoría</h3>
                  <Show when={report().byCategory.length > 0} fallback={<p class={styles.vacio}>Sin ventas en el período.</p>}>
                    <div class={tabla.tablaContenedor}>
                      <table class={tabla.tabla}>
                        <thead>
                          <tr>
                            <th>Categoría</th>
                            <th class={tabla.num}>Líneas</th>
                            <th class={tabla.num}>Vendido</th>
                            <th class={tabla.num}>Costo</th>
                            <th class={tabla.num}>Utilidad</th>
                            <th class={tabla.num}>Margen</th>
                          </tr>
                        </thead>
                        <tbody>
                          <For each={report().byCategory}>
                            {(row) => (
                              <tr>
                                <td>{row.category}</td>
                                <td class={tabla.num}>{row.linesCount}</td>
                                <BarCell value={row.revenueCents} max={maxCategoryRevenue()} label={formatSoles(row.revenueCents)} />
                                <td class={tabla.num}>{formatSoles(row.costCents)}</td>
                                <td class={tabla.num} classList={{ [styles.negativo]: row.marginCents < 0 }}>
                                  {formatSoles(row.marginCents)}
                                </td>
                                <td class={tabla.num}>{marginPercent(row.revenueCents, row.marginCents)}</td>
                              </tr>
                            )}
                          </For>
                        </tbody>
                      </table>
                    </div>
                  </Show>
                </div>
              </Match>
              <Match when={tab() === 'horas'}>
                <div class={styles.panel}>
                  <h3 class={styles.panelTitulo}>Vendido por hora del día</h3>
                  <Show when={maxHour() > 0} fallback={<p class={styles.vacio}>Sin ventas en el período.</p>}>
                    <div class={styles.horas} role="img" aria-label="Ventas por hora del día">
                      <For each={report().byHour}>
                        {(row) => (
                          <div class={styles.hora} title={`${row.hour}:00 · ${row.tickets} tickets · ${formatSoles(row.revenueCents)}`}>
                            <Show when={peakHour() === row.hour}>
                              <span class={styles.horaPico}>{formatSoles(row.revenueCents)}</span>
                            </Show>
                            <span
                              class={styles.horaBarra}
                              classList={{ [styles.horaBarraVacia]: row.revenueCents === 0 }}
                              style={{ height: `${Math.max(2, Math.round((row.revenueCents / maxHour()) * 110))}px` }}
                            />
                            <span class={styles.horaEtiqueta}>{row.hour % 3 === 0 ? String(row.hour).padStart(2, '0') : ''}</span>
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>
                </div>
              </Match>
              <Match when={tab() === 'mermas'}>
                <WasteTable report={waste()} loading={waste.loading} error={waste.error} />
              </Match>
            </Switch>
          )}
        </Show>
      </div>
    </section>
  );
};

const Summary: Component<{ report: SalesReportDto; maxDay: number }> = (props) => {
  const totals = () => props.report.totals;
  return (
    <>
      <div class={styles.tiles}>
        <div class={styles.tile}>
          <span class={styles.tileEtiqueta}>Vendido</span>
          <span class={styles.tileCifra}>{formatSoles(totals().revenueCents)}</span>
          <span class={styles.tileDetalle}>{totals().tickets} tickets cobrados</span>
        </div>
        <div class={styles.tile}>
          <span class={styles.tileEtiqueta}>Costo de lo vendido</span>
          <span class={styles.tileCifra}>{formatSoles(totals().costCents)}</span>
          <span class={styles.tileDetalle}>al costo actual de cada producto</span>
        </div>
        <div class={`${styles.tile} ${styles.tileUtilidad}`}>
          <span class={styles.tileEtiqueta}>Utilidad bruta</span>
          <span class={styles.tileCifra} classList={{ [styles.negativo]: totals().marginCents < 0 }}>
            {formatSoles(totals().marginCents)}
          </span>
          <span class={styles.tileDetalle}>margen {marginPercent(totals().revenueCents, totals().marginCents)}</span>
        </div>
        <div class={styles.tile}>
          <span class={styles.tileEtiqueta}>Ticket promedio</span>
          <span class={styles.tileCifra}>{formatSoles(totals().averageTicketCents)}</span>
          <span class={styles.tileDetalle}>descuentos {formatSoles(totals().discountCents)}</span>
        </div>
        <div class={styles.tile}>
          <span class={styles.tileEtiqueta}>Devoluciones</span>
          <span class={styles.tileCifra}>{formatSoles(totals().refundsCents)}</span>
          <span class={styles.tileDetalle}>pagadas en el período</span>
        </div>
      </div>

      <div class={styles.panel}>
        <h3 class={styles.panelTitulo}>Por día</h3>
        <Show when={props.report.byDay.length > 0} fallback={<p class={styles.vacio}>Sin ventas en el período.</p>}>
          <div class={tabla.tablaContenedor}>
            <table class={tabla.tabla}>
              <thead>
                <tr>
                  <th>Día</th>
                  <th class={tabla.num}>Tickets</th>
                  <th class={tabla.num}>Vendido</th>
                  <th class={tabla.num}>Costo</th>
                  <th class={tabla.num}>Utilidad</th>
                </tr>
              </thead>
              <tbody>
                <For each={props.report.byDay}>
                  {(row) => (
                    <tr>
                      <td>{formatDay(row.day)}</td>
                      <td class={tabla.num}>{row.tickets}</td>
                      <BarCell value={row.revenueCents} max={props.maxDay} label={formatSoles(row.revenueCents)} />
                      <td class={tabla.num}>{formatSoles(row.costCents)}</td>
                      <td class={tabla.num} classList={{ [styles.negativo]: row.revenueCents - row.costCents < 0 }}>
                        {formatSoles(row.revenueCents - row.costCents)}
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      </div>
    </>
  );
};

const ProductsTable: Component<{ rows: ProductSalesDto[]; max: number }> = (props) => (
  <div class={styles.panel}>
    <h3 class={styles.panelTitulo}>Los 30 productos que más venden</h3>
    <Show when={props.rows.length > 0} fallback={<p class={styles.vacio}>Sin ventas en el período.</p>}>
      <div class={tabla.tablaContenedor}>
        <table class={tabla.tabla}>
          <thead>
            <tr>
              <th>Producto</th>
              <th>Categoría</th>
              <th class={tabla.num}>Cantidad</th>
              <th class={tabla.num}>Vendido</th>
              <th class={tabla.num}>Utilidad</th>
              <th class={tabla.num}>Margen</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.rows}>
              {(row) => (
                <tr>
                  <td>{row.name}</td>
                  <td>{row.category}</td>
                  <td class={tabla.num}>{quantityLabel(row)}</td>
                  <BarCell value={row.revenueCents} max={props.max} label={formatSoles(row.revenueCents)} />
                  <td class={tabla.num} classList={{ [styles.negativo]: row.marginCents < 0 }}>
                    {formatSoles(row.marginCents)}
                  </td>
                  <td class={tabla.num}>{marginPercent(row.revenueCents, row.marginCents)}</td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </Show>
  </div>
);

const WasteTable: Component<{ report: WasteReportDto | undefined; loading: boolean; error: unknown }> = (props) => (
  <div class={styles.panel}>
    <h3 class={styles.panelTitulo}>
      Mermas, vencidos y pérdidas
      <Show when={props.report}>{(report) => <> · {formatSoles(report().totalCents)} al costo</>}</Show>
    </h3>
    <Show when={props.error}>
      <p class={styles.vacio}>{apiErrorMessage(props.error, 'No se pudo cargar el reporte de mermas.')}</p>
    </Show>
    <Show when={props.loading && props.report === undefined}>
      <p class={styles.cargando}>Calculando…</p>
    </Show>
    <Show when={props.report}>
      {(report) => (
        <Show when={report().rows.length > 0} fallback={<p class={styles.vacio}>Sin mermas registradas en el período.</p>}>
          <div class={tabla.tablaContenedor}>
            <table class={tabla.tabla}>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Motivo</th>
                  <th class={tabla.num}>Cantidad</th>
                  <th class={tabla.num}>Valor al costo</th>
                </tr>
              </thead>
              <tbody>
                <For each={report().rows}>
                  {(row) => (
                    <tr>
                      <td>{row.name}</td>
                      <td>{WASTE_LABELS[row.kind]}</td>
                      <td class={tabla.num}>{quantityLabel(row)}</td>
                      <td class={tabla.num}>{formatSoles(row.valueCents)}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Show>
      )}
    </Show>
  </div>
);
