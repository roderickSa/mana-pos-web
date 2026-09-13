import type { Component } from 'solid-js';

import { ConfirmModal } from './ConfirmModal';
import forms from './forms.module.css';

// Lo tecleado y no guardado se pierde sin aviso en toda la app: cerrar con ✕,
// con Esc o tocando fuera del cuadro. Este es el único aviso, para que diga lo
// mismo en los seis formularios y en la orden de compra.
//
// El botón por defecto es «Seguir editando»: la acción destructiva nunca es la
// fácil de tocar sin querer.
export const UnsavedChanges: Component<{
  // Qué se pierde, en las palabras de la pantalla: «el producto», «la orden».
  what: string;
  onDiscard: () => void;
  onKeepEditing: () => void;
}> = (props) => (
  <ConfirmModal
    title="Tenés cambios sin guardar"
    confirmLabel="Descartar"
    onConfirm={props.onDiscard}
    onClose={props.onKeepEditing}
  >
    <p class={forms.nota}>
      Si salís ahora se pierde lo que escribiste en {props.what}. Nada de esto quedó guardado
      todavía.
    </p>
  </ConfirmModal>
);
