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

### Rutas

La app usa `@solidjs/router`. La URL dice DÓNDE estás; lo tecleado a medias se
guarda aparte (ver `PLAN-RUTAS.md` en la raíz del proyecto).

```
/                     redirige a la última ruta del usuario, o a su inicio por rol
/inicio               solo dueño
/vender · /caja · /historial
/clientes/directorio · /clientes/fiado
/productos · /productos/categorias
/inventario/entradas · /inventario/conteo · /inventario/por-vencer · /inventario/kardex
/compras/ordenes · /compras/ordenes/nueva · /compras/proveedores
/reportes/{resumen,mas-vendidos,por-categoria,por-hora,mermas}
/ajustes/{usuarios,equipos,voucher,igv,respaldo}
```

- **En la URL van**: la sección, la subpestaña, los filtros y la página
  (`?q=`, `?pagina=`, `?desde=`, `?hasta=`, `?categoria=`, `?bajo=`…). Se
  escriben con `replace` para que tipear no llene el historial, y un valor
  igual al por defecto NO se escribe: una pantalla sin tocar tiene la URL
  limpia. Helpers en `shared/lib/url-state.ts`.
- **La tabla de rutas y los permisos** viven en `app/routes.ts`, no en los
  componentes. `RequireRole` redirige al inicio del rol en vez de dejar la
  pantalla en blanco; el API además rechaza los datos (candado doble).
- **El login NO es una ruta**: es una compuerta delante de todo (`AppShell`).
  Al bloquear con F10 la URL no cambia, así que al volver a entrar la misma
  persona cae donde estaba. Otra persona va al inicio de su rol.
- Las subpestañas son rutas hijas, con la barra compartida `shared/ui/SubTabs`.
- **Un modal con entidad también es una ruta**: `/productos/<id>/editar`,
  `/clientes/fiado/<id>/abonar`, `/compras/ordenes/<id>`, `/caja/gasto`. El
  listado es la ruta padre y sigue montado detrás; el modal existe porque la
  URL trae su id, y al cerrarlo se vuelve al listado **con sus filtros**
  (`shared/lib/modal-route.ts`: `subPath`, `entityAction`, `withSearch`). La
  entidad sale de la página ya cargada si está ahí, y se pide por id si se
  entró por la URL de frente; un id que ya no existe avisa y vuelve al listado.
- **Qué NO va a la URL**, a propósito: las confirmaciones (anular, borrar,
  descartar), los resultados de una operación (el vuelto, el resumen de cierre
  de caja, el de un conteo, el reporte de importación), los pasos internos de
  un modal y todo lo de la pantalla de vender, que es una operación en curso.
  Regla corta: si al recargar esa URL la pantalla puede volver a armarse con
  solo un id, va a la ruta; si necesita algo que ya no existe, no.
- **Dos borradores distintos en compras, cada uno con su dueño.** Lo que estás tecleando
  es UNO y vive en este navegador; se guarda solo y vuelve al reabrir. Un **borrador de
  compra** es una orden que ya existe en la base con estado `draft`, se edita desde el
  listado y se tira con «Descartar». «Crear orden» la pasa a abierta, y ahí ya no se edita:
  salió al proveedor. Editando un borrador de la base no se escribe el local, para no tener
  dos copias de lo mismo.
- **Un modal que carga por id se dibuja solo si el id de lo cargado calza con el de la
  URL.** Un recurso de Solid conserva su último valor: sin esa comparación el modal no
  cerraba, o mostraba el registro anterior mientras cargaba el siguiente.
- `npm run probar:compras` recorre Compras entero como una persona: armar una orden a
  medias, cambiarla, dejarla, retomarla, confirmarla, recibir en dos tandas, cancelar y
  descartar borradores. Después de cada paso le pregunta al servidor cómo quedó la orden:
  los bugs que dolieron (líneas duplicadas, borradores fantasma, cantidades perdidas) no se
  ven en la pantalla, se ven en los datos.
- `npm run probar:rutas` abre las ~54 rutas de la app de frente, una por una, y
  falla si alguna no deja la pantalla donde debe o tira un error de consola.

### Guardado en el navegador

Todo `localStorage` pasa por `shared/lib/storage.ts` — `npm run revisar:ui`
falla si alguien lo usa fuera de ahí. Las claves viejas (sesión, ticket,
preferencias) guardan su valor crudo y no se migran; las nuevas van en un sobre
`{ v, savedAt, data }` para poder cambiar de forma y para saber de cuándo es un
borrador. Los borradores de más de 7 días se borran al iniciar sesión.

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
- El aviso de «cambios sin guardar» (`dirty` del `Modal`) va SOLO en los formularios largos:
  producto, condiciones de proveedor y proveedor. Un formulario de tres o cuatro campos —
  cliente, abono, categoría, usuario, PIN — se cierra derecho: preguntar ahí molesta más de lo
  que salva, y un aviso que sale en todos lados deja de leerse.
- Borrador guardado en el navegador (`createFormDraft` + `DraftBanner`): solo producto y
  condiciones de proveedor. El de usuario NUNCA, porque ahí se teclea el PIN.
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
- `npm run test:unit` — tests de lógica pura (rutas, guardado, parámetros de URL)
- `npm run probar:recarga` — prueba en el navegador que recargar deje al usuario donde estaba (necesita la app compilada y el API corriendo)
