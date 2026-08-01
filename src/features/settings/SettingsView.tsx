import { createResource, createSignal, Match, Show, Switch, type Component } from 'solid-js';

import { getIgvConfig, getReceiptConfig, updateIgvConfig, updateReceiptConfig } from '@/shared/api/settings';
import { showNotice } from '@/shared/state/notices';
import { UsersView } from '@/features/users/UsersView';
import { DevicesView } from '@/features/devices/DevicesView';
import { CategoriesTab } from '@/features/inventory/components/CategoriesTab';
import { SuppliersTab } from '@/features/inventory/components/SuppliersTab';
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

        {/* Vista previa del voucher tal como saldrá de la térmica. */}
        <div class={styles.preview}>
          <p class={styles.previewNombre}>{nameValue() || 'Nombre de la tienda'}</p>
          <Show when={extraValue().trim() !== ''}>
            <p>{extraValue()}</p>
          </Show>
          <p class={styles.previewLinea}>--------------------------------</p>
          <p>Ticket #123 29/07/26 18:30</p>
          <p>Inca Kola 600 ml{'          '}S/ 3.50</p>
          <p class={styles.previewLinea}>--------------------------------</p>
          <p class={styles.previewTotal}>TOTAL{'              '}S/ 3.50</p>
          <p>Efectivo{'           '}S/ 2.00</p>
          <p>Yape{'               '}S/ 1.50</p>
          <p>Recibido{'           '}S/ 5.00</p>
          <p>Vuelto{'             '}S/ 3.00</p>
          <p>{footerValue() || 'Mensaje final'}</p>
          <p class={styles.previewLegal}>Comprobante interno - no valido</p>
          <p class={styles.previewLegal}>como comprobante de pago</p>
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
type SettingsTab = 'usuarios' | 'equipos' | 'voucher' | 'igv' | 'categorias' | 'proveedores';

const TABS: Array<{ key: SettingsTab; label: string }> = [
  { key: 'usuarios', label: 'Usuarios' },
  { key: 'equipos', label: 'Equipos' },
  { key: 'voucher', label: 'Voucher' },
  { key: 'igv', label: 'IGV' },
  { key: 'categorias', label: 'Categorías' },
  { key: 'proveedores', label: 'Proveedores' },
];

export const SettingsView: Component = () => {
  const [tab, setTab] = createSignal<SettingsTab>('usuarios');

  return (
    <section class={tabs.contenedorTabs}>
      <nav class={tabs.subnav} aria-label="Ajustes">
        {TABS.map((item) => (
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
      </Switch>
    </section>
  );
};
