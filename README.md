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
    sale/                → pantalla de venta (POS)
      SaleView.tsx
      components/        → SearchBox, CategoryTabs, ProductGrid, TicketPanel, PaymentPicker, WeightModal
      state/ticket.ts    → estado de la venta en curso (store de Solid)
    inventory/           → pantalla de inventario
      InventoryView.tsx
      components/        → un modal por operación: PriceModal, CountModal, EntryModal,
                           AdjustmentModal, KardexModal, ProductFormModal + ActionsMenu
  shared/
    api/                 → un archivo por recurso: client (errores/helpers), products, inventory, suppliers
    ui/                  → componentes genéricos: Modal, CategoryIcon
                           + CSS compartido: forms.module.css (formularios/modales)
                           y tabla.module.css (vistas con tabla, subtabs, paginación)
    lib/                 → utilidades puras: money, dates, labels, categories
    state/               → estado transversal: notices (toasts)
    types.ts             → DTOs de la API
```

### Reglas de dependencia

- `features/*` puede importar de `shared/` y de sí misma. **Nunca de otra feature.**
- `shared/` no importa de `features/` ni de `app/`.
- `app/` compone features; no contiene lógica de negocio.
- Imports siempre con alias `@/` (configurado en `vite.config.ts` y `tsconfig.app.json`).
- Estilos: CSS Modules por componente + tokens globales en `app/theme.css`.

### Convenciones UI

- Botones táctiles ≥ 44px; una operación = un modal (precio y stock se actualizan por separado).
- La barra de búsqueda solo busca (nombre o código de barras); las acciones viven en el menú «Acciones» de cada fila.

## Comandos

- `npm run dev` — dev server con proxy a la API (localhost:3210)
- `npx tsc --noEmit -p tsconfig.app.json` — typecheck
- `npm run build` — build de producción
