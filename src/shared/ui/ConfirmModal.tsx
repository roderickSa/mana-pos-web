import type { JSX, Component } from 'solid-js';

import { Modal } from './Modal';
import styles from './ConfirmModal.module.css';
import forms from './forms.module.css';

// Confirmación destructiva: título que nombra la consecuencia, explicación de
// qué se revierte, y botón ROJO con el verbo exacto — nunca "Aceptar".
export const ConfirmModal: Component<{
  title: string;
  confirmLabel: string;
  confirmDisabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children: JSX.Element;
}> = (props) => (
  <Modal
    size="sm"
    title={props.title}
    onClose={props.onClose}
    footer={
      <div class={forms.acciones}>
        <button type="button" class={forms.secundario} onClick={props.onClose}>
          Volver
        </button>
        <button
          type="button"
          class={styles.destructivo}
          disabled={props.confirmDisabled === true}
          onClick={props.onConfirm}
        >
          {props.confirmLabel}
        </button>
      </div>
    }
  >
    <div class={forms.form}>{props.children}</div>
  </Modal>
);
