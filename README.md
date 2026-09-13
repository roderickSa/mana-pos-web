# Maná POS — Frontend

SolidJS + Vite + TypeScript. UI táctil del minimarket Maná.

## Arquitectura: feature-based (Feature-Sliced simplificado)

Regla de oro: **el código se agrupa por pantalla/feature, no por tipo de archivo.**
Lo que solo usa una feature vive dentro de ella; lo que usan dos o más vive en `shared/`.

```
src/
  index.tsx              → entry point
  app/                   → shell de la aplicación
    App.tsx              → navegación entre vistas (Venta / Inventario)
    index.css, theme.css → tokens de diseño (colores, tipografías, radios) — tocar SOLO theme.css para reestilizar
    components/          → piezas del shell: TopBar, StatusBar
  features/
    login/               → pantalla de PIN
    sale/                → pantalla de venta (POS)
      SaleView.tsx
      components/        → SearchBox, CategoryTabs, ProductGrid, TicketPanel, PaymentPicker,
                           WeightModal, ChargeModal (cobro/vuelto/dividido), CreditChargeModal,
                           DiscountModal, LineActionsModal, QuantityModal, CustomerPickModal,
                           PriceCheckModal, ShortcutsHelp
      state/ticket.ts    → estado de la venta en curso (store de Solid)
    sales-history/       → historial de ventas, detalle voucher, anular, devolver
    cash/                → caja por turnos, movimientos, cierre a ciegas, cierres anteriores
    credit/              → módulo Clientes (Directorio + Fiado, abonos, WhatsApp)
    catalog/               → productos: alta/edición, precios masivos, import/export Excel, fusión,
                             categorías (un modal por operación)
    inventory/             → inventario: entradas y mermas, por vencer, kardex
    purchases/             → órdenes de compra, recepción y proveedores
    reports/               → reportes de gestión (resumen, más vendidos, categoría, hora, mermas)
    devices/             → estado de equipos, impresora configurable, pruebas
    settings/            → Ajustes (voucher, IGV, respaldo) — compone tabs de otras features
    users/               → gestión de usuarios y PINs
    home/                → panel de inicio del dueño
  shared/
    api/                 → un archivo por recurso: client (errores/helpers/auth), products,
                           inventory, sales, cash, customers, purchases, categories, prices,
                           devices, settings, suppliers, users
    ui/                  → componentes genéricos: Modal (focus trap, velo opcional), ConfirmModal,
                           CountModal, Keypad, DateField, ProductPicker, CategoryIcon,
                           Chip (estados), RowMenu (menú ⋯ de fila), EmptyState (tabla sin datos),
                           StatTile/StatTiles (fila de cifras), TableFooter (pie de tabla)
                           + CSS compartido: forms.module.css (formularios/modales)
                           y tabla.module.css (vistas con tabla, subtabs, paginación)
    lib/                 → utilidades puras: money (redondeo a S/0.10), dates, labels, sounds, focus,
                             scanner (ráfagas del lector, en fase de captura) e image (resize antes de subir)
    state/                 → estado transversal: session, notices, categories, cash-status y
                             devices-status (un solo resource compartido), cash-refresh, preferences
    types.ts             → DTOs de la API
```

### Reglas de dependencia

- `features/*` puede importar de `shared/` y de sí misma. **Nunca de otra feature.**
- `shared/` no importa de `features/` ni de `app/`.
- `app/` compone features; no contiene lógica de negocio.
- Imports siempre con alias `@/` (configurado en `vite.config.ts` y `tsconfig.app.json`).
- Estilos: CSS Modules por componente + tokens globales en `app/theme.css`.

### Convenciones UI

- Tres alturas de control, todas desde `app/theme.css`: `--alto-control` (48px, la normal y el
  piso táctil), `--alto-compacto` (36px, solo filas densas) y `--alto-grande` (56px, acción
  principal y keypad). Un único `@media (any-pointer: coarse)` sube la escala entera; ningún
  archivo declara px propios. `any-pointer`, no `pointer`: la PC de tienda tiene mouse Y touch.
- Colores SOLO desde tokens de `app/theme.css` («un color, un trabajo»); modo noche incluido.
- Tipografía IBM Plex self-hosted; pesos usados = pesos cargados (sin bold sintético).
- Una operación = un modal; los modales con formulario largo no se cierran por clic en el velo.
- Todo modal declara `size` (sm/md/lg/xl) y `footer`: los botones van en el pie fijo, nunca en el
  cuerpo que rueda.
- Toda tabla de listado termina en `TableFooter`: dice cuántas filas hay y, si hay más de una
  página, pagina. Va FUERA del contenedor que rueda, si no se va con el scroll. Con la tabla
  vacía no se dibuja: ahí habla el `EmptyState` y un «0 productos» sería ruido. Nunca se
  condiciona a mano (un `Show when={totalPages() > 1}` alrededor esconde el conteo).
- `npm run revisar:ui` verifica pies de modal y de tabla, alturas y componentes compartidos.
- La barra de búsqueda solo busca (nombre o código de barras); las acciones viven en el menú «Acciones» de cada fila.
- Dinero en el front: `shared/lib/money.ts` (`roundToDimeCents`, `isDimeCents`); el server es autoritativo.
- Sonidos (`shared/lib/sounds.ts`): bip = acción, doble bip = operación completada, grave = error.

## Comandos

- `npx vite --port 5173 --strictPort` — dev server con proxy a la API (localhost:3210)
- `npx tsc -b` — typecheck (SIEMPRE desde la raíz del repo)
- `npm run build` — build de producción (el api la sirve en :3210 modo kiosko)
