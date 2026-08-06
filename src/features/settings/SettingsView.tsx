import { createResource, createSignal, Match, Show, Switch, type Component } from 'solid-js';

import { getIgvConfig, getReceiptConfig, updateIgvConfig, updateReceiptConfig } from '@/shared/api/settings';
import { getPrinterConfig } from '@/shared/api/devices';
import { showNotice } from '@/shared/state/notices';
import { isOwner } from '@/shared/state/session';
import { UsersView } from '@/features/users/UsersView';
import { DevicesView } from '@/features/devices/DevicesView';
import { CategoriesTab } from '@/features/inventory/components/CategoriesTab';
import { SuppliersTab } from '@/features/inventory/components/SuppliersTab';
import { BackupTab } from '@/features/settings/BackupTab';
import tabs from '@/shared/ui/tabla.module.css';
import forms from '@/shared/ui/forms.module.css';
import styles from './SettingsView.module.css';

const VoucherTab: Component = () => {
  const [config] = createResource(getReceiptConfig);
  const [storeName, setStoreName] = createSignal<string | null>(null);
  const [headerExtra, setHeaderExtra] = createSignal<string | null>(null);
  const [footerMessage, setFooterMessage] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);

  const nameValue = () => storeName() ?? config()?.storeName ?? '';
  const extraValue = () => headerExtra() ?? config()?.headerExtra ?? '';
  const footerValue = () => footerMessage() ?? config()?.footerMessage ?? '';

  // El preview respeta el ancho REAL del papel configurado (58 mm = 32
  // columnas, 80 mm = 48) y corta las líneas igual que la térmica: lo que
  // aquí se desborda, en el papel también.
  const [printerCfg] = createResource(() => getPrinterConfig().catch(() => null));
  const cols = () => (printerCfg()?.paperWidthMm === 80 ? 48 : 32);
  const dashes = () => '-'.repeat(cols());
  // Corte duro cada N columnas, como el driver.
  const wrap = (text: string): string[] => {
    const width = cols();
    const lines: string[] = [];
    for (let i = 0; i < text.length; i += width) lines.push(text.slice(i, i + width));
    return lines.length === 0 ? [''] : lines;
  };
  // «concepto……monto» a ancho exacto, con el nombre recortado si no entra.
  const amountLine = (left: string, right: string): string => {
    const width = cols();
    const maxLeft = width - right.length - 1;
    const cutLeft = left.length > maxLeft ? left.slice(0, maxLeft) : left;
    return cutLeft + ' '.repeat(width - cutLeft.length - right.length) + right;
  };

  async function save(): Promise<void> {
    if (nameValue().trim() === '' || footerValue().trim() === '' || saving()) return;
    setSaving(true);
    try {
      await updateReceiptConfig({
        storeName: nameValue().trim(),
        headerExtra: extraValue().trim() === '' ? null : extraValue().trim(),
        footerMessage: footerValue().trim(),
      });
      showNotice('Voucher actualizado — así saldrá en la próxima impresión');
    } catch {
      showNotice('No se pudo guardar la configuración del voucher.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section class={tabs.vista}>
      <div class={styles.panel}>
        <div class={forms.form}>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>Nombre de la tienda (cabecera del voucher)</span>
            <input
              class={forms.input}
              value={nameValue()}
              onInput={(event) => setStoreName(event.currentTarget.value)}
              maxLength={40}
            />
          </div>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>Línea adicional (dirección, RUC, teléfono — opcional)</span>
            <input
              class={forms.input}
              value={extraValue()}
              onInput={(event) => setHeaderExtra(event.currentTarget.value)}
              maxLength={60}
              placeholder="p. ej. Av. Los Próceres 123 · RUC 10456789012"
            />
          </div>
          <div class={forms.campo}>
            <span class={forms.etiqueta}>Mensaje final</span>
            <input
              class={forms.input}
              value={footerValue()}
              onInput={(event) => setFooterMessage(event.currentTarget.value)}
              maxLength={80}
            />
          </div>
          <div class={forms.acciones}>
            <button type="button" class={forms.primario} disabled={saving()} onClick={() => void save()}>
              Guardar
            </button>
          </div>
        </div>

        {/* Vista previa al ancho REAL configurado (32 o 48 columnas). */}
        <div class={styles.preview} style={{ width: `calc(${cols()}ch + 34px)` }}>
          {wrap(nameValue() || 'Nombre de la tienda').map((line) => (
            <p class={styles.previewNombre}>{line}</p>
          ))}
          <Show when={extraValue().trim() !== ''}>
            {wrap(extraValue()).map((line) => (
              <p>{line}</p>
            ))}
          </Show>
          <p class={styles.previewLinea}>{dashes()}</p>
          <p>Ticket #123 29/07/26 18:30</p>
          <p>{amountLine('Inca Kola 600 ml', 'S/ 3.50')}</p>
          <p class={styles.previewLinea}>{dashes()}</p>
          <p class={styles.previewTotal}>{amountLine('TOTAL', 'S/ 3.50')}</p>
          <p>{amountLine('Efectivo', 'S/ 2.00')}</p>
          <p>{amountLine('Yape', 'S/ 1.50')}</p>
          <p>{amountLine('Recibido', 'S/ 5.00')}</p>
          <p>{amountLine('Vuelto', 'S/ 3.00')}</p>
          {wrap(footerValue() || 'Mensaje final').map((line) => (
            <p>{line}</p>
          ))}
          <p class={styles.previewLegal}>Comprobante interno - no valido</p>
          <p class={styles.previewLegal}>como comprobante de pago</p>
          <p class={styles.previewLegal}>
            {cols()} columnas · papel de {printerCfg()?.paperWidthMm ?? 58} mm
          </p>
        </div>
      </div>
    </section>
  );
};

const IgvTab: Component = () => {
  const [config] = createResource(getIgvConfig);
  const [rate, setRate] = createSignal<string | null>(null);
  const [saving, setSaving] = createSignal(false);

  const rateValue = () => rate() ?? String(config()?.ratePercent ?? 18);
  const parsedRate = () => Number.parseInt(rateValue(), 10);
  const valid = () => !Number.isNaN(parsedRate()) && parsedRate() >= 0 && parsedRate() <= 25;

  async function save(): Promise<void> {
    if (!valid() || saving()) return;
    setSaving(true);
    try {
      const updated = await updateIgvConfig(parsedRate());
      setRate(String(updated.ratePercent));
      showNotice(`IGV configurado en ${updated.ratePercent}%`);
    } catch {
      showNotice('No se pudo guardar la tasa de IGV.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section class={tabs.vista}>
      <div class={forms.form} style={{ 'max-width': '520px' }}>
        <div class={forms.campo}>
          <span class={forms.etiqueta}>Tasa de IGV (%)</span>
          <input
            class={forms.input}
            type="number"
            min="0"
            max="25"
            step="1"
            value={rateValue()}
            onInput={(event) => setRate(event.currentTarget.value)}
          />
        </div>
        <p class={forms.nota}>
          El precio al público ya incluye el IGV: esta tasa solo se usa para el desglose
          informativo de base imponible e IGV en Ventas y en el detalle de cada ticket. No cambia
          ningún cobro. Usa 0 si la venta está exonerada.
        </p>
        <div class={forms.acciones}>
          <button
            type="button"
            class={forms.primario}
            disabled={!valid() || saving()}
            onClick={() => void save()}
          >
            Guardar
          </button>
        </div>
      </div>
    </section>
  );
};

// Todo lo que se configura una vez y se toca poco vive aquí: usuarios,
// equipos, voucher, IGV y los catálogos maestros (categorías, proveedores).
type SettingsTab =
  | 'usuarios'
  | 'equipos'
  | 'voucher'
  | 'igv'
  | 'categorias'
  | 'proveedores'
  | 'respaldo';

// Espejo de la política del API (route-policy.ts): encargado y dueño ven lo
// mismo; lo técnico/sensible (Respaldo) es solo del dueño.
const TABS: Array<{ key: SettingsTab; label: string; ownerOnly: boolean }> = [
  { key: 'usuarios', label: 'Usuarios', ownerOnly: false },
  { key: 'equipos', label: 'Equipos', ownerOnly: false },
  { key: 'voucher', label: 'Voucher', ownerOnly: false },
  { key: 'igv', label: 'IGV', ownerOnly: false },
  { key: 'categorias', label: 'Categorías', ownerOnly: false },
  { key: 'proveedores', label: 'Proveedores', ownerOnly: false },
  { key: 'respaldo', label: 'Respaldo', ownerOnly: true },
];

export const SettingsView: Component = () => {
  const visibleTabs = () => TABS.filter((item) => !item.ownerOnly || isOwner());
  const [tab, setTab] = createSignal<SettingsTab>('usuarios');

  return (
    <section class={tabs.contenedorTabs}>
      <nav class={tabs.subnav} aria-label="Ajustes">
        {visibleTabs().map((item) => (
          <button
            type="button"
            class={tabs.subtab}
            classList={{ [tabs.subtabActiva]: tab() === item.key }}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <Switch>
        <Match when={tab() === 'usuarios'}>
          <UsersView />
        </Match>
        <Match when={tab() === 'equipos'}>
          <DevicesView />
        </Match>
        <Match when={tab() === 'voucher'}>
          <VoucherTab />
        </Match>
        <Match when={tab() === 'igv'}>
          <IgvTab />
        </Match>
        <Match when={tab() === 'categorias'}>
          <CategoriesTab />
        </Match>
        <Match when={tab() === 'proveedores'}>
          <SuppliersTab />
        </Match>
        <Match when={tab() === 'respaldo' && isOwner()}>
          <BackupTab />
        </Match>
      </Switch>
    </section>
  );
};
