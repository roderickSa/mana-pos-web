import { createResource, createSignal, Match, Show, Switch, type Component } from 'solid-js';

import { getReceiptConfig, updateReceiptConfig } from '@/shared/api/settings';
import { showNotice } from '@/shared/state/notices';
import { UsersView } from '@/features/users/UsersView';
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
          <p>{footerValue() || 'Mensaje final'}</p>
          <p class={styles.previewLegal}>Comprobante interno - no valido</p>
          <p class={styles.previewLegal}>como comprobante de pago</p>
        </div>
      </div>
    </section>
  );
};

export const SettingsView: Component = () => {
  const [tab, setTab] = createSignal<'usuarios' | 'voucher'>('usuarios');

  return (
    <section class={tabs.contenedorTabs}>
      <nav class={tabs.subnav} aria-label="Ajustes">
        <button
          type="button"
          class={tabs.subtab}
          classList={{ [tabs.subtabActiva]: tab() === 'usuarios' }}
          onClick={() => setTab('usuarios')}
        >
          Usuarios
        </button>
        <button
          type="button"
          class={tabs.subtab}
          classList={{ [tabs.subtabActiva]: tab() === 'voucher' }}
          onClick={() => setTab('voucher')}
        >
          Voucher
        </button>
      </nav>

      <Switch>
        <Match when={tab() === 'usuarios'}>
          <UsersView />
        </Match>
        <Match when={tab() === 'voucher'}>
          <VoucherTab />
        </Match>
      </Switch>
    </section>
  );
};
