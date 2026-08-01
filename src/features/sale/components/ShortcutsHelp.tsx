import { For, type Component } from 'solid-js';

import { Modal } from '@/shared/ui/Modal';
import styles from './ShortcutsHelp.module.css';

const SHORTCUTS: Array<{ keys: string; action: string; touch: string }> = [
  { keys: 'F2', action: 'Ir al buscador para escanear o teclear', touch: 'Toca el buscador' },
  { keys: 'Enter', action: 'Buscador vacío: cobrar · Sin foco: cobro exacto en efectivo', touch: 'Botón Cobrar' },
  { keys: 'F4', action: 'Cobrar con el método de pago elegido', touch: 'Botón Cobrar' },
  { keys: 'F8', action: 'Consulta de precio sin tocar el ticket', touch: '— (escanea y cancela)' },
  { keys: 'F9', action: 'Quitar la línea seleccionada del ticket', touch: 'Botón ✕ de la línea' },
  { keys: '↑ ↓', action: 'Moverse entre las líneas del ticket', touch: 'Toca la línea' },
  { keys: '+ −', action: 'Subir o bajar la cantidad de la línea seleccionada', touch: 'Botones − 1 +' },
  { keys: 'Ctrl+Z', action: 'Recuperar la última línea quitada', touch: 'Botón Deshacer' },
  { keys: '3*', action: 'Multiplicador: el siguiente producto entra ×3', touch: 'Toca el producto 3 veces' },
  { keys: 'F10', action: 'Bloquear la pantalla (el ticket se conserva)', touch: 'Botón Salir' },
  { keys: 'Esc', action: 'Cerrar cualquier ventana', touch: 'Botón ✕' },
  { keys: 'F1', action: 'Mostrar u ocultar esta ayuda', touch: 'Botón ⌨ Ayuda' },
];

export const ShortcutsHelp: Component<{ onClose: () => void }> = (props) => (
  <Modal title="Atajos de teclado" onClose={props.onClose}>
    <div class={styles.lista}>
      <For each={SHORTCUTS}>
        {(item) => (
          <div class={styles.fila}>
            <kbd class={styles.tecla}>{item.keys}</kbd>
            <span class={styles.accion}>
              {item.action}
              <small style={{ display: 'block', opacity: '0.75' }}>En táctil: {item.touch}</small>
            </span>
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
