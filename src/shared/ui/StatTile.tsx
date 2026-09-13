import { Show, type Component, type JSX } from 'solid-js';

import styles from '@/shared/ui/StatTile.module.css';

export type TileTone = 'normal' | 'destacado' | 'atencion' | 'malo';

// Fila de cifras: se usa en Caja, Reportes, Historial y Conteo. «densa» es
// para cuando comparten la fila con otra cosa y no entran a ancho normal.
export const StatTiles: Component<{ dense?: boolean; children: JSX.Element }> = (props) => (
  <div class={`${styles.tiles} ${props.dense === true ? styles.densa : ''}`}>{props.children}</div>
);

export const StatTile: Component<{
  label: string;
  value: JSX.Element;
  detail?: JSX.Element;
  tone?: TileTone;
}> = (props) => (
  <div class={`${styles.tile} ${props.tone === undefined ? '' : styles[props.tone]}`}>
    <span class={styles.etiqueta}>{props.label}</span>
    <span class={styles.cifra}>{props.value}</span>
    <Show when={props.detail}>{(detail) => <span class={styles.detalle}>{detail()}</span>}</Show>
  </div>
);
