import {type Component } from 'solid-js';

import {type CloseResultDto, printLastCloseSummary } from '@/shared/api/cash';
import {apiErrorMessage } from '@/shared/api/client';
import {formatSoles } from '@/shared/lib/money';
import {METHOD_LABELS } from '@/shared/lib/labels';
import {showNotice } from '@/shared/state/notices';
import {beepError } from '@/shared/lib/sounds';
import { Modal } from '@/shared/ui/Modal';
import forms from '@/shared/ui/forms.module.css';
import styles from '../CashView.module.css';

export const ClosedSummaryModal: Component<{ result: CloseResultDto; onClose: () => void }> = (props) => (
  <Modal title="Corte de caja" onClose={props.onClose}>
    <div class={forms.form}>
      <div class={styles.corteResumen}>
        <div><span>Esperado</span><b>{formatSoles(props.result.session.expectedCashCents)}</b></div>
        <div><span>Contado</span><b>{formatSoles(props.result.session.countedCashCents)}</b></div>
        <div
          classList={{
            [styles.diferenciaMala]: props.result.differenceCents !== 0,
            [styles.diferenciaOk]: props.result.differenceCents === 0,
          }}
        >
          <span>Diferencia</span>
          <b>
            {props.result.differenceCents === 0
              ? 'Cuadró ✓'
              : `${props.result.differenceCents > 0 ? '+' : ''}${formatSoles(props.result.differenceCents)}`}
          </b>
        </div>
      </div>
      <p class={forms.nota}>
        Fondo {formatSoles(props.result.breakdown.openingCents)} · ventas efectivo{' '}
        {formatSoles(props.result.breakdown.cashSalesCents)} · abonos{' '}
        {formatSoles(props.result.breakdown.cashAbonosCents)} · retiros −
        {formatSoles(props.result.breakdown.withdrawalsCents)} · gastos −
        {formatSoles(props.result.breakdown.expensesCents)}
      </p>
      <p class={forms.nota}>
        Ventas del turno por método:{' '}
        {props.result.salesByMethod
          .map((entry) => `${METHOD_LABELS[entry.method] ?? entry.method} ${formatSoles(entry.amountCents)}`)
          .join(' · ') || 'sin ventas'}
      </p>
      <div class={forms.acciones}>
        <button
          type="button"
          class={forms.secundario}
          onClick={() =>
            void printLastCloseSummary()
              .then((result) => showNotice(result.message))
              .catch((cause) => {
                beepError();
                showNotice(apiErrorMessage(cause, 'No se pudo imprimir el resumen.'));
              })
          }
        >
          🖨 Imprimir resumen
        </button>
        <button type="button" class={forms.primario} onClick={props.onClose} autofocus>
          Listo
        </button>
      </div>
    </div>
  </Modal>
);
