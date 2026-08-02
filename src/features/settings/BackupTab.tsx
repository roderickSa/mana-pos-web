import { createResource, createSignal, Show, type Component } from 'solid-js';

import {
  backupExportUrl,
  getBackupStatus,
  runBackupNow,
  setBackupExternalDir,
} from '@/shared/api/backups';
import { apiErrorMessage, downloadFile } from '@/shared/api/client';
import { showNotice } from '@/shared/state/notices';
import tabs from '@/shared/ui/tabla.module.css';
import forms from '@/shared/ui/forms.module.css';

const DAY_MS = 26 * 60 * 60 * 1000; // 26h de gracia sobre el respaldo diario

function formatMoment(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Respaldo: lo único que separa «se malogró la PC» de «se perdió el negocio».
export const BackupTab: Component = () => {
  const [status, { refetch }] = createResource(getBackupStatus);
  const [dirDraft, setDirDraft] = createSignal<string | null>(null);
  const [busy, setBusy] = createSignal(false);

  const externalDir = () => {
    const external = status()?.external;
    return external !== undefined && external.kind !== 'none' ? external.dir : '';
  };
  const externalError = () => {
    const external = status()?.external;
    return external !== undefined && external.kind === 'error' ? external : null;
  };
  const dirValue = () => dirDraft() ?? externalDir();

  const stale = () => {
    const last = status()?.lastBackupAt;
    if (last === undefined) return false;
    if (last === null) return true;
    return Date.now() - new Date(last).getTime() > DAY_MS;
  };

  async function backupNow(): Promise<void> {
    if (busy()) return;
    setBusy(true);
    try {
      const result = await runBackupNow();
      showNotice(`Respaldo creado: ${result.file}`);
      void refetch();
    } catch (cause) {
      showNotice(apiErrorMessage(cause, 'El respaldo falló — revisa espacio en disco.'));
    } finally {
      setBusy(false);
    }
  }

  async function saveDir(): Promise<void> {
    if (busy()) return;
    setBusy(true);
    try {
      const trimmed = dirValue().trim();
      await setBackupExternalDir(trimmed === '' ? null : trimmed);
      showNotice(
        trimmed === ''
          ? 'Carpeta externa quitada: solo queda la copia local.'
          : 'Carpeta externa guardada — primera copia creada.',
      );
      setDirDraft(null);
      void refetch();
    } catch (cause) {
      showNotice(apiErrorMessage(cause, 'No se pudo guardar la carpeta externa.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class={tabs.vista}>
      <div class={forms.form} style={{ 'max-width': '640px' }}>
        <Show when={status()}>
          {(current) => (
            <>
              <div class={forms.campo}>
                <span class={forms.etiqueta}>Último respaldo</span>
                <p style={{ margin: '0', 'font-weight': '600' }}>
                  <Show when={current().lastBackupAt} fallback="Nunca — respalda ahora mismo.">
                    {(at) => formatMoment(at())}
                  </Show>{' '}
                  <Show when={stale()}>
                    <span class={forms.error} style={{ display: 'inline' }}>
                      · lleva más de un día sin respaldar
                    </span>
                  </Show>
                </p>
                <p class={forms.nota} style={{ margin: '4px 0 0' }}>
                  {current().copies} copias locales en {current().localDir} (se guardan las
                  últimas 14). El respaldo corre solo una vez al día; aquí puedes forzarlo.
                </p>
              </div>

              <div class={forms.campo}>
                <span class={forms.etiqueta}>
                  Carpeta externa (disco USB o carpeta sincronizada)
                </span>
                <input
                  class={forms.input}
                  value={dirValue()}
                  placeholder="p. ej. E:\respaldos-mana o D:\Dropbox\mana"
                  onInput={(event) => setDirDraft(event.currentTarget.value)}
                />
                <Show when={externalError()}>
                  {(failure) => (
                    <p class={forms.error}>
                      La copia externa está fallando: {failure().reason}. ¿El disco está
                      conectado?
                    </p>
                  )}
                </Show>
                <p class={forms.nota}>
                  Cada respaldo se replica ahí automáticamente. Si esta PC se malogra o se la
                  roban, esa carpeta es lo que salva el negocio.
                </p>
              </div>

              <div class={forms.acciones}>
                <button
                  type="button"
                  class={forms.secundario}
                  onClick={() =>
                    void downloadFile(backupExportUrl, 'mana-respaldo.sqlite').catch(() =>
                      showNotice('No se pudo descargar la copia.'),
                    )
                  }
                >
                  Descargar copia
                </button>
                <button
                  type="button"
                  class={forms.secundario}
                  disabled={busy()}
                  onClick={() => void saveDir()}
                >
                  Guardar carpeta
                </button>
                <button
                  type="button"
                  class={forms.primario}
                  disabled={busy()}
                  onClick={() => void backupNow()}
                >
                  Respaldar ahora
                </button>
              </div>

              <p class={forms.nota}>
                Para restaurar en una PC nueva: instalar el sistema, copiar el archivo
                mana-AAAA-MM-DD.sqlite más reciente como base de datos y la carpeta de imágenes.
                Guía completa: mana-pos-api/docs/restauracion.md.
              </p>
            </>
          )}
        </Show>
      </div>
    </section>
  );
};
