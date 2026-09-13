import type { Component, JSX } from 'solid-js';

import styles from '@/shared/ui/Chip.module.css';

// El tono dice qué significa el estado, no de qué color se pinta: así una
// misma idea (algo va mal) se ve igual en Compras, Historial y Equipos.
export type ChipTone = 'neutro' | 'info' | 'exito' | 'alerta' | 'peligro';

export const Chip: Component<{
  tone?: ChipTone;
  title?: string;
  children: JSX.Element;
}> = (props) => (
  <span class={`${styles.chip} ${styles[props.tone ?? 'neutro']}`} title={props.title}>
    {props.children}
  </span>
);
