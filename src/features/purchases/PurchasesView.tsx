import {createEffect, createResource, createSignal, Match, Show, Switch, type Component } from 'solid-js';
import { useLocation, useNavigate } from '@solidjs/router';

import { activeTabPath, SubTabs, type SubTab } from '@/shared/ui/SubTabs';

import tabsCss from '@/shared/ui/tabla.module.css';
import { SuppliersTab } from './components/SuppliersTab';

import {
  discardDraftOrder,
  getPurchaseOrder,
  listPurchaseOrders,
  type PurchaseOrderSummaryDto,
} from '@/shared/api/purchases';
import {beepError, beepOk } from '@/shared/lib/sounds';
import tabla from '@/shared/ui/tabla.module.css';
import { createUrlBoolean, createUrlNumber } from '@/shared/lib/url-state';
import { subPath, withSearch } from '@/shared/lib/modal-route';
import { listSuppliers } from '@/shared/api/suppliers';
import { showNotice } from '@/shared/state/notices';
import {OrdersList } from './components/OrdersList';
import { OrderDraftForm } from './components/OrderDraftForm';
import {OrderDetailModal } from './components/OrderDetailModal';

// Las órdenes se acumulan: una tienda que compra dos veces por semana llega a
// cientos en el año. Se piden de a página, como ventas y productos.
const PER_PAGE = 25;

// Armar una orden es una ruta, no un modo: es el formulario más largo de la
// app y tiene que poder recargarse sin perderlo.
const OrdersSection: Component = () => {
  const location = useLocation();
  const navigate = useNavigate();
  // Dos rutas, un mismo formulario: `/nueva` hasta que la orden nace en el
  // servidor, y `/<id>/editar` desde ahí.
  const armando = () => location.pathname === '/compras/ordenes/nueva';
  const editandoBorrador = (): string | undefined => {
    const cola = subPath('/compras/ordenes', location.pathname);
    return cola.length === 2 && cola[1] === 'editar' ? cola[0] : undefined;
  };
  const [refresh, setRefresh] = createSignal(0);
  const [page, setPage] = createUrlNumber('pagina', 1);
  // El filtro va en la URL como los demás: se recarga y se comparte.
  const [soloBorradores, setSoloBorradores] = createUrlBoolean('borradores', false);
  const [orders] = createResource(
    () => ({ refresh: refresh(), page: page(), borradores: soloBorradores() }),
    (params) =>
      listPurchaseOrders(params.page, PER_PAGE, params.borradores ? { status: 'draft' } : {}),
  );
  const total = () => orders()?.total ?? 0;
  const lastPage = () => Math.max(1, Math.ceil(total() / PER_PAGE));
  // La orden abierta es una ruta: `/compras/ordenes/<id>` se recarga y se
  // comparte. 'nueva' es el formulario, no un id.
  const ORDENES_PATH = '/compras/ordenes';
  const detalleId = (): string | undefined => {
    const cola = subPath(ORDENES_PATH, location.pathname);
    if (cola.length !== 1) return undefined;
    const id = cola[0];
    return id === 'nueva' ? undefined : id;
  };
  const [detail, { mutate: setDetail }] = createResource(detalleId, (id) =>
    getPurchaseOrder(id).catch(() => {
      beepError();
      return undefined;
    }),
  );
  // El nombre del proveedor no viene en la orden; la lista de proveedores sí
  // viene entera, y hace falta igual al entrar por la URL.
  const [suppliers] = createResource(listSuppliers);
  const supplierName = (supplierId: string): string =>
    (suppliers() ?? []).find((supplier) => supplier.id === supplierId)?.name ?? '…';

  // Gatillado por la RUTA y por el id: al cerrar, un recurso de Solid conserva
  // su último valor (el modal se quedaba abierto), y al abrir otra orden
  // devuelve la anterior mientras carga.
  const ordenDeLaRuta = () => {
    const cargada = detail();
    return cargada !== undefined && cargada.id === detalleId() ? cargada : undefined;
  };

  // Tirar un borrador lo borra de verdad: nunca salió al proveedor. Una orden
  // ya enviada se cancela desde su detalle y queda en la historia.
  async function tirarBorrador(orden: PurchaseOrderSummaryDto): Promise<void> {
    try {
      await discardDraftOrder(orden.id);
      beepOk();
      showNotice(`Borrador #${orden.number} descartado`);
      setRefresh((value) => value + 1);
    } catch {
      beepError();
      showNotice('No se pudo descartar ese borrador.');
    }
  }

  const abrirDetalle = (summary: PurchaseOrderSummaryDto): void =>
    navigate(withSearch(`${ORDENES_PATH}/${summary.id}`, location.search));
  const cerrarDetalle = (): void => navigate(withSearch(ORDENES_PATH, location.search));

  createEffect(() => {
    if (detalleId() === undefined || detail.loading) return;
    if (detail() !== undefined) return;
    showNotice('Esa orden ya no está');
    navigate(withSearch(ORDENES_PATH, location.search), { replace: true });
  });

  return (
    <div class={tabla.vista}>
      <Show
        when={armando() || editandoBorrador() !== undefined}
        fallback={
          <OrdersList
            orders={orders()?.items ?? []}
            total={total()}
            page={page()}
            lastPage={lastPage()}
            onPage={setPage}
            loading={orders.loading}
            soloBorradores={soloBorradores()}
            onSoloBorradores={(valor) => {
              setSoloBorradores(valor);
              setPage(1);
            }}
            onNew={() => navigate('/compras/ordenes/nueva')}
            onOpen={abrirDetalle}
            onDiscard={(orden) => void tirarBorrador(orden)}
          />
        }
      >
        <OrderDraftForm
          draftId={editandoBorrador()}
          onDone={() => {
            setPage(1);
            setRefresh((value) => value + 1);
            navigate('/compras/ordenes');
          }}
          onCancel={() => navigate('/compras/ordenes')}
        />
      </Show>

      {/* Gatillado por la RUTA, no solo por el recurso: al cerrar, un recurso
          de Solid conserva su último valor y el modal se quedaba abierto. */}
      <Show when={ordenDeLaRuta()}>
        {(current) => (
          <OrderDetailModal
            order={current()}
            supplierName={supplierName(current().supplierId)}
            onClose={cerrarDetalle}
            onChanged={(updated) => {
              setDetail(updated);
              setRefresh((value) => value + 1);
            }}
          />
        )}
      </Show>
    </div>
  );
};


const TABS: readonly SubTab[] = [
  { path: '/compras/ordenes', label: 'Órdenes' },
  { path: '/compras/proveedores', label: 'Proveedores' },
];

export const PurchasesView: Component = () => {
  const location = useLocation();
  const tab = () => activeTabPath(TABS, location.pathname);
  return (
    <section class={tabsCss.contenedorTabs}>
      <SubTabs tabs={TABS} label="Secciones de compras" />
      <Switch>
        <Match when={tab() === '/compras/ordenes'}>
          <OrdersSection />
        </Match>
        <Match when={tab() === '/compras/proveedores'}>
          <SuppliersTab />
        </Match>
      </Switch>
    </section>
  );
};
