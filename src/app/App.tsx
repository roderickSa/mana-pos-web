import { createSignal, Match, Show, Switch, type Component } from 'solid-js';

import { InventoryView } from '@/features/inventory/InventoryView';
import { PurchasesView } from '@/features/purchases/PurchasesView';
import { SaleView } from '@/features/sale/SaleView';
import { SalesHistoryView } from '@/features/sales-history/SalesHistoryView';
import { CreditView } from '@/features/credit/CreditView';
import { CashView } from '@/features/cash/CashView';
import { LoginView } from '@/features/login/LoginView';
import { SettingsView } from '@/features/settings/SettingsView';
import { currentUser, endSession } from '@/shared/state/session';
import { clearPreferences, loadPreferencesFor } from '@/shared/state/preferences';
import { showNotice } from '@/shared/state/notices';
import { createEffect, createResource, onCleanup, onMount } from 'solid-js';
import { StaleShiftBanner } from './components/StaleShiftBanner';
import { StatusBar } from './components/StatusBar';
import { TopBar, type View } from './components/TopBar';
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

const App: Component = () => {
  const [view, setView] = createSignal<View>('venta');
  const [training] = createResource(isTraining);

  // Las preferencias (texto grande) siguen al usuario que inició sesión.
  createEffect(() => {
    const user = currentUser();
    if (user === null) {
      clearPreferences();
    } else {
      loadPreferencesFor(user.id);
    }
  });

  // F10 = bloquear pantalla: vuelve al login sin perder el ticket en curso
  // (queda guardado en el navegador hasta que alguien entre con su PIN).
  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'F10' && currentUser() !== null) {
      event.preventDefault();
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
        <TopBar view={view()} onNavigate={setView} />
        <StaleShiftBanner onGoToCash={() => setView('caja')} />

      <Switch>
        <Match when={view() === 'venta'}>
          <SaleView onGoToCash={() => setView('caja')} />
        </Match>
        <Match when={view() === 'caja'}>
          <CashView />
        </Match>
        <Match when={view() === 'ventas'}>
          <SalesHistoryView />
        </Match>
        <Match when={view() === 'fiado'}>
          <CreditView />
        </Match>
        <Match when={view() === 'inventario'}>
          <InventoryView />
        </Match>
        <Match when={view() === 'compras'}>
          <PurchasesView />
        </Match>
        <Match when={view() === 'ajustes'}>
          <SettingsView />
        </Match>
      </Switch>

      <StatusBar />
      </div>
    </Show>
  );
};

export default App;
