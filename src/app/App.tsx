import {
  createEffect,
  createResource,
  onCleanup,
  onMount,
  Show,
  type Component,
  type ParentProps,
} from 'solid-js';
import { Navigate, Route, Router, useLocation, useNavigate } from '@solidjs/router';

import { CatalogView } from '@/features/catalog/CatalogView';
import { InventoryView } from '@/features/inventory/InventoryView';
import { PurchasesView } from '@/features/purchases/PurchasesView';
import { ReportsView } from '@/features/reports/ReportsView';
import { SaleView } from '@/features/sale/SaleView';
import { SalesHistoryView } from '@/features/sales-history/SalesHistoryView';
import { ClientesView } from '@/features/credit/CreditView';
import { CashView } from '@/features/cash/CashView';
import { LoginView } from '@/features/login/LoginView';
import { SettingsView } from '@/features/settings/SettingsView';
import { HomeView } from '@/features/home/HomeView';
import { currentUser, endSession } from '@/shared/state/session';
import { logoutSession } from '@/shared/api/users';
import { clearPreferences, loadPreferencesFor } from '@/shared/state/preferences';
import { showNotice } from '@/shared/state/notices';
import { removeExpiredDrafts, readStored, writeStored } from '@/shared/lib/storage';
import { canAccess, homeFor } from './routes';
import { StaleShiftBanner } from './components/StaleShiftBanner';
import { NoticeToast } from './components/NoticeToast';
import { StatusBar } from './components/StatusBar';
import { TopBar } from './components/TopBar';
import styles from './App.module.css';

async function isTraining(): Promise<boolean> {
  try {
    const response = await fetch('/health');
    const body = await response.json();
    return body.training === true;
  } catch {
    return false;
  }
}

const decodeText = (data: unknown): string | undefined =>
  typeof data === 'string' && data !== '' ? data : undefined;

// La ruta donde quedó cada persona. Es un respaldo de la URL, no su reemplazo:
// sirve para el arranque en frío (la PC de la tienda se apaga y el navegador no
// siempre restaura la pestaña).
function rememberRoute(userId: string, path: string): void {
  writeStored(`mana-pos:ruta:${userId}`, path);
}

function rememberedRoute(userId: string): string | undefined {
  return readStored(`mana-pos:ruta:${userId}`, decodeText);
}

// El login NO es una ruta: es una compuerta delante de todo. La URL no cambia
// al bloquear, así que al volver a entrar la app muestra lo que había. Eso es
// lo que hace que F10 devuelva a la pantalla donde estabas.
const AppShell: Component<ParentProps> = (props) => {
  const [training] = createResource(isTraining);
  const location = useLocation();
  const navigate = useNavigate();

  // Al cambiar de persona (no al desbloquear), la pantalla vuelve al inicio de
  // SU rol: la cajera no hereda los Ajustes del dueño.
  createEffect(() => {
    const user = currentUser();
    if (user === null) {
      clearPreferences();
      return;
    }
    loadPreferencesFor(user.id);
    removeExpiredDrafts();
    const previous = readStored('mana-pos:ultimo-usuario', decodeText);
    writeStored('mana-pos:ultimo-usuario', user.id);
    if (previous !== user.id || !canAccess(location.pathname, user.role)) {
      navigate(homeFor(user.role), { replace: true });
    }
  });

  // Cada movimiento queda anotado para el arranque en frío.
  createEffect(() => {
    const user = currentUser();
    if (user === null) return;
    rememberRoute(user.id, `${location.pathname}${location.search}`);
  });

  // F10 = bloquear pantalla: vuelve al login sin perder el ticket en curso ni
  // la ruta (queda guardado en el navegador hasta que alguien entre con su PIN).
  function onKeyDown(event: KeyboardEvent): void {
    // F5 es "Yape" en Vender y "recargar" en el navegador: nunca recargar.
    if (event.key === 'F5') event.preventDefault();
    if (event.key === 'F10' && currentUser() !== null) {
      event.preventDefault();
      void logoutSession().catch(() => undefined);
      endSession();
      showNotice('Pantalla bloqueada — el ticket en curso sigue guardado');
    }
  }
  onMount(() => document.addEventListener('keydown', onKeyDown));
  onCleanup(() => document.removeEventListener('keydown', onKeyDown));

  return (
    <Show when={currentUser() !== null} fallback={<LoginView />}>
      <div class={styles.app}>
        <Show when={training() === true}>
          <div class={styles.entrenamiento}>
            MODO ENTRENAMIENTO — práctica con datos falsos, nada de esto es real
          </div>
        </Show>
        <TopBar />
        <NoticeToast />
        <StaleShiftBanner />

        <main class={styles.contenido}>{props.children}</main>

        <StatusBar />
      </div>
    </Show>
  );
};

// Doble candado: el API además rechaza los datos. Sin permiso se redirige, no
// se deja la pantalla en blanco.
const RequireRole: Component<ParentProps> = (props) => {
  const location = useLocation();
  const navigate = useNavigate();

  createEffect(() => {
    const user = currentUser();
    if (user === null) return;
    if (canAccess(location.pathname, user.role)) return;
    showNotice('Esa pantalla es del encargado');
    navigate(homeFor(user.role), { replace: true });
  });

  return <>{props.children}</>;
};

// La raíz resuelve adónde entrar: la última ruta si sigue valiendo, si no el
// inicio del rol.
const Redirector: Component = () => {
  const user = currentUser();
  if (user === null) return null;
  const remembered = rememberedRoute(user.id);
  const target =
    remembered !== undefined && canAccess(remembered.split('?')[0] ?? '', user.role)
      ? remembered
      : homeFor(user.role);
  return <Navigate href={target} />;
};

const App: Component = () => (
  <Router root={AppShell}>
    <Route path="/" component={Redirector} />
    <Route path="/vender" component={SaleView} />
    <Route path="/caja/*" component={CashView} />
    <Route path="/historial/*" component={SalesHistoryView} />
    <Route path="/clientes/*" component={ClientesView} />

    <Route path="/inicio" component={() => <RequireRole><HomeView /></RequireRole>} />
    <Route path="/productos/*" component={() => <RequireRole><CatalogView /></RequireRole>} />
    <Route path="/inventario/*" component={() => <RequireRole><InventoryView /></RequireRole>} />
    <Route path="/compras/*" component={() => <RequireRole><PurchasesView /></RequireRole>} />
    <Route path="/reportes/*" component={() => <RequireRole><ReportsView /></RequireRole>} />
    <Route path="/ajustes/*" component={() => <RequireRole><SettingsView /></RequireRole>} />

    <Route path="*" component={() => <Navigate href="/" />} />
  </Router>
);

export default App;
