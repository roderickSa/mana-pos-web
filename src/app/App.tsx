import { createSignal, Match, Show, Switch, type Component } from 'solid-js';

import { InventoryView } from '@/features/inventory/InventoryView';
import { SaleView } from '@/features/sale/SaleView';
import { SalesHistoryView } from '@/features/sales-history/SalesHistoryView';
import { DevicesView } from '@/features/devices/DevicesView';
import { CreditView } from '@/features/credit/CreditView';
import { CashView } from '@/features/cash/CashView';
import { LoginView } from '@/features/login/LoginView';
import { SettingsView } from '@/features/settings/SettingsView';
import { currentUser } from '@/shared/state/session';
import { createResource } from 'solid-js';
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

  return (
    <Show when={currentUser() !== null} fallback={<LoginView />}>
      <div class={styles.app}>
        <Show when={training() === true}>
          <div class={styles.entrenamiento}>
            MODO ENTRENAMIENTO — práctica con datos falsos, nada de esto es real
          </div>
        </Show>
        <TopBar view={view()} onNavigate={setView} />

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
        <Match when={view() === 'equipos'}>
          <DevicesView />
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
