import { createSignal, For, Show, type Component } from 'solid-js';

import { importProducts, type ImportReportDto } from '@/shared/api/products';
import { downloadFile } from '@/shared/api/client';
import { beepError } from '@/shared/lib/sounds';
import { Modal } from '@/shared/ui/Modal';
import styles from '@/shared/ui/forms.module.css';

export const ImportModal: Component<{
  onDone: (message: string) => void;
  onClose: () => void;
}> = (props) => {
  const [fileBase64, setFileBase64] = createSignal<string | null>(null);
  const [fileName, setFileName] = createSignal('');
  const [report, setReport] = createSignal<ImportReportDto | null>(null);
  const [importing, setImporting] = createSignal(false);
  const [error, setError] = createSignal('');

  function onFileChange(input: HTMLInputElement): void {
    const file = input.files?.[0];
    if (file === undefined) return;
    setFileName(file.name);
    setReport(null);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFileBase64(reader.result.split(',')[1] ?? null);
      }
    };
    reader.readAsDataURL(file);
  }

  async function run(): Promise<void> {
    const data = fileBase64();
    if (data === null || importing()) return;
    setImporting(true);
    setError('');
    try {
      const result = await importProducts(data);
      setReport(result);
      if (result.rejected.length === 0) {
        props.onDone(`${result.createdCount} productos importados sin errores`);
      }
    } catch {
      beepError();
      setError('No se pudo importar. Verifica que el archivo siga la plantilla.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <Modal title="Importar productos desde Excel" onClose={props.onClose}>
      <div class={styles.form}>
        <p class={styles.nota}>
          1. Descarga la{' '}
          <button
            type="button"
            style={{
              border: 'none',
              background: 'none',
              color: 'var(--mana-verde)',
              'text-decoration': 'underline',
              cursor: 'pointer',
              padding: '0',
              font: 'inherit',
            }}
            onClick={() =>
              void downloadFile('/catalog/products/import/template', 'plantilla-productos.xlsx')
            }
          >
            plantilla Excel
          </button>{' '}
          y llénala
          (una fila por producto). 2. Súbela aquí. Las filas con errores se rechazan una por una y
          te decimos por qué — las demás sí entran.
        </p>
        <div class={styles.campo}>
          <span class={styles.etiqueta}>Archivo (.xlsx o .csv)</span>
          <input
            class={styles.input}
            type="file"
            accept=".xlsx,.csv"
            onChange={(event) => onFileChange(event.currentTarget)}
          />
        </div>

        <Show when={report()}>
          {(data) => (
            <div>
              <p class={styles.nota}>
                <b>{data().createdCount}</b> de {data().totalRows} productos importados.
                <Show when={data().rejected.length > 0}>
                  {' '}
                  <b>{data().rejected.length}</b> filas rechazadas:
                </Show>
              </p>
              <For each={data().rejected}>
                {(row) => (
                  <p class={styles.error}>
                    Fila {row.row} ({row.name === '' ? 'sin nombre' : row.name}): {row.reason}
                  </p>
                )}
              </For>
            </div>
          )}
        </Show>
        <Show when={error() !== ''}>
          <p class={styles.error}>{error()}</p>
        </Show>

        <div class={styles.acciones}>
          <button type="button" class={styles.secundario} onClick={props.onClose}>
            {report() === null ? 'Cancelar' : 'Cerrar'}
          </button>
          <button
            type="button"
            class={styles.primario}
            disabled={fileBase64() === null || importing()}
            onClick={run}
          >
            {importing() ? 'Importando…' : `Importar ${fileName()}`}
          </button>
        </div>
      </div>
    </Modal>
  );
};
