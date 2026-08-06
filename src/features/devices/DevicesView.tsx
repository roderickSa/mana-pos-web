import { createResource, createSignal, For, onCleanup, Show, type Component } from 'solid-js';

import {
  getDevicesStatus,
  getPrinterConfig,
  getSystemPrinters,
  openDrawer,
  printTestPage,
  updatePrinterConfig,
  type DeviceActionResultDto,
} from '@/shared/api/devices';
import { apiErrorMessage } from '@/shared/api/client';
import { formatKg } from '@/shared/lib/money';
import { showNotice } from '@/shared/state/notices';
import { isManager } from '@/shared/state/session';
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
          <Show when={isManager()}>
            <PrinterConfigForm />
          </Show>
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

// Elegir la impresora del sistema y el ancho del papel. Se guarda en la BD y
// aplica desde el siguiente voucher, sin reiniciar. En la PC de la tienda
// (Windows) la lista sale de las impresoras instaladas.
const PrinterConfigForm: Component = () => {
  const [config, { refetch: refetchConfig }] = createResource(() =>
    getPrinterConfig().catch(() => null),
  );
  const [printers, { refetch: refetchPrinters }] = createResource(() =>
    getSystemPrinters().catch(() => ({ items: [] })),
  );
  const [nameDraft, setNameDraft] = createSignal<string | null>(null);
  const [widthDraft, setWidthDraft] = createSignal<58 | 80 | null>(null);
  const [saving, setSaving] = createSignal(false);

  const nameValue = () => nameDraft() ?? config()?.printerName ?? '';
  const widthValue = () => widthDraft() ?? config()?.paperWidthMm ?? 80;
  // La impresora guardada puede no estar en la lista (p. ej. otra PC): se
  // muestra igual como opción para no "perderla" al abrir la pantalla.
  const options = () => {
    const items = printers()?.items ?? [];
    const saved = config()?.printerName ?? null;
    return saved !== null && !items.includes(saved) ? [saved, ...items] : items;
  };

  async function save(): Promise<void> {
    if (saving()) return;
    setSaving(true);
    try {
      const updated = await updatePrinterConfig({
        printerName: nameValue() === '' ? null : nameValue(),
        paperWidthMm: widthValue(),
      });
      setNameDraft(null);
      setWidthDraft(null);
      void refetchConfig();
      showNotice(
        updated.printerName === null
          ? `Impresora por defecto · papel de ${updated.paperWidthMm} mm`
          : `Impresora «${updated.printerName}» · papel de ${updated.paperWidthMm} mm — imprime la página de prueba para verificar`,
      );
    } catch (cause) {
      showNotice(apiErrorMessage(cause, 'No se pudo guardar la configuración de impresora.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div class={styles.configImpresora}>
      <div class={styles.configFila}>
        <label class={styles.configEtiqueta} for="impresora-nombre">
          Impresora del sistema
        </label>
        <select
          id="impresora-nombre"
          class={styles.configSelect}
          value={nameValue()}
          onChange={(event) => setNameDraft(event.currentTarget.value)}
        >
          <option value="">Por defecto (auto)</option>
          <For each={options()}>{(name) => <option value={name}>{name}</option>}</For>
        </select>
        <button
          type="button"
          class={styles.configRefrescar}
          title="Volver a buscar impresoras instaladas"
          aria-label="Refrescar lista de impresoras"
          onClick={() => void refetchPrinters()}
        >
          ⟳
        </button>
      </div>

      <div class={styles.configFila}>
        <span class={styles.configEtiqueta}>Ancho del papel</span>
        <div class={styles.configAnchos} role="radiogroup" aria-label="Ancho del papel">
          <button
            type="button"
            role="radio"
            aria-checked={widthValue() === 58}
            classList={{ [styles.anchoActivo]: widthValue() === 58 }}
            onClick={() => setWidthDraft(58)}
          >
            58 mm
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={widthValue() === 80}
            classList={{ [styles.anchoActivo]: widthValue() === 80 }}
            onClick={() => setWidthDraft(80)}
          >
            80 mm
          </button>
        </div>
      </div>

      <div class={styles.configFila}>
        <button type="button" class={styles.configGuardar} disabled={saving()} onClick={() => void save()}>
          {saving() ? 'Guardando…' : 'Guardar impresora'}
        </button>
      </div>
      <p class={styles.configNota}>
        Tras guardar, usa «Imprimir página de prueba» para confirmar que salió por la impresora
        elegida.
      </p>
    </div>
  );
};
