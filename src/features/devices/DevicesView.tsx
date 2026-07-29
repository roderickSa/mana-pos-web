import { createResource, createSignal, onCleanup, Show, type Component } from 'solid-js';

import {
  getDevicesStatus,
  openDrawer,
  printTestPage,
  type DeviceActionResultDto,
} from '@/shared/api/devices';
import { formatKg } from '@/shared/lib/money';
import { showNotice } from '@/shared/state/notices';
import styles from './DevicesView.module.css';

export const DevicesView: Component = () => {
  const [tick, setTick] = createSignal(0);
  const [status] = createResource(tick, () => getDevicesStatus().catch(() => null));
  const [busy, setBusy] = createSignal(false);

  // Estado en vivo mientras la pantalla está abierta (la balanza cambia rápido).
  const interval = setInterval(() => setTick((value) => value + 1), 1000);
  onCleanup(() => clearInterval(interval));

  async function run(action: () => Promise<DeviceActionResultDto>): Promise<void> {
    if (busy()) return;
    setBusy(true);
    try {
      const result = await action();
      showNotice(result.message);
    } catch {
      showNotice('No se pudo hablar con el sistema local. Revisa que esté activo.');
    } finally {
      setBusy(false);
    }
  }

  const mode = () => status()?.mode;

  return (
    <section class={styles.vista}>
      <Show when={mode() === 'simulated'}>
        <p class={styles.banner}>
          Modo desarrollo: los equipos están simulados. En la PC de la tienda se activa el modo real
          con <code>MANA_DEVICES_MODE=real</code> y estas mismas tarjetas controlan el hardware.
        </p>
      </Show>

      <div class={styles.grilla}>
        <article class={styles.tarjeta}>
          <header>
            <span class={styles.icono}>🖨</span>
            <h3>Impresora de vouchers</h3>
          </header>
          <p class={styles.detalle}>{status()?.printer.message ?? 'Consultando…'}</p>
          <span
            class={styles.estadoChip}
            classList={{ [styles.estadoOk]: mode() === 'real', [styles.estadoDev]: mode() === 'simulated' }}
          >
            {mode() === 'real' ? 'configurada' : 'simulada'}
          </span>
          <button type="button" disabled={busy()} onClick={() => void run(printTestPage)}>
            Imprimir página de prueba
          </button>
        </article>

        <article class={styles.tarjeta}>
          <header>
            <span class={styles.icono}>💵</span>
            <h3>Cajón de dinero</h3>
          </header>
          <p class={styles.detalle}>
            Se abre solo al cobrar en efectivo, con el pulso que envía la impresora. También puedes
            abrirlo desde aquí.
          </p>
          <span
            class={styles.estadoChip}
            classList={{ [styles.estadoOk]: mode() === 'real', [styles.estadoDev]: mode() === 'simulated' }}
          >
            {mode() === 'real' ? 'conectado vía impresora' : 'simulado'}
          </span>
          <button type="button" disabled={busy()} onClick={() => void run(openDrawer)}>
            Abrir cajón
          </button>
        </article>

        <article class={styles.tarjeta}>
          <header>
            <span class={styles.icono}>⚖</span>
            <h3>Balanza</h3>
          </header>
          <Show
            when={status()?.scale.connected === true}
            fallback={<p class={styles.detalle}>{status()?.scale.message ?? 'Consultando…'}</p>}
          >
            <p class={styles.pesoVivo}>{formatKg(status()?.scale.grams ?? 0)}</p>
            <p class={styles.detalle}>Lectura en vivo — así se captura el peso al vender granel.</p>
          </Show>
          <span
            class={styles.estadoChip}
            classList={{
              [styles.estadoOk]: status()?.scale.connected === true,
              [styles.estadoDev]: status()?.scale.connected !== true,
            }}
          >
            {status()?.scale.connected === true ? 'conectada' : mode() === 'simulated' ? 'simulada' : 'desconectada'}
          </span>
        </article>

        <article class={styles.tarjeta}>
          <header>
            <span class={styles.icono}>▮▮</span>
            <h3>Lector de códigos</h3>
          </header>
          <p class={styles.detalle}>
            Funciona como un teclado USB: no necesita configuración. Para probarlo, ve a Caja y
            escanea cualquier producto — el código cae en el buscador y se agrega solo.
          </p>
          <span class={`${styles.estadoChip} ${styles.estadoOk}`}>plug & play</span>
        </article>
      </div>
    </section>
  );
};
