import { For, type Component } from 'solid-js';

import { Modal } from '@/shared/ui/Modal';
import styles from './ShortcutsHelp.module.css';

const SHORTCUTS: Array<{ keys: string; action: string }> = [
  { keys: 'F2', action: 'Ir al buscador para escanear o teclear' },
  { keys: 'Enter', action: 'Buscador vacío: cobrar · Sin foco: cobro exacto en efectivo' },
  { keys: 'F4', action: 'Cobrar con el método de pago elegido' },
  { keys: 'F8', action: 'Consulta de precio: escanea y muestra el precio sin tocar el ticket' },
  { keys: 'F9', action: 'Quitar la línea seleccionada del ticket' },
  { keys: '↑ ↓', action: 'Moverse entre las líneas del ticket' },
  { keys: '+ −', action: 'Subir o bajar la cantidad de la línea seleccionada' },
  { keys: 'Ctrl+Z', action: 'Recuperar la última línea quitada' },
  { keys: '3*', action: 'Multiplicador: el siguiente producto entra ×3 (sirve 3*15 y Enter)' },
  { keys: 'F10', action: 'Bloquear la pantalla (el ticket en curso se conserva)' },
  { keys: 'Esc', action: 'Cerrar cualquier ventana' },
  { keys: 'F1', action: 'Mostrar u ocultar esta ayuda' },
];

export const ShortcutsHelp: Component<{ onClose: () => void }> = (props) => (
  <Modal title="Atajos de teclado" onClose={props.onClose}>
    <div class={styles.lista}>
      <For each={SHORTCUTS}>
        {(item) => (
          <div class={styles.fila}>
            <kbd class={styles.tecla}>{item.keys}</kbd>
            <span class={styles.accion}>{item.action}</span>
          </div>
        )}
      </For>
      <p class={styles.nota}>
        Además: teclear en cualquier momento escribe directo en el buscador — el lector de códigos
        nunca se queda sin foco.
      </p>
    </div>
  </Modal>
);
