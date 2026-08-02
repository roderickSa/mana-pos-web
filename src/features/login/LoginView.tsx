import { createSignal, For, Show, type Component } from 'solid-js';

import { ApiError } from '@/shared/api/client';
import { loginWithPin } from '@/shared/api/users';
import { beepError } from '@/shared/lib/sounds';
import { startSession } from '@/shared/state/session';
import styles from './LoginView.module.css';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'borrar', '0', 'entrar'];

export const LoginView: Component = () => {
  const [pin, setPin] = createSignal('');
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);

  async function submit(): Promise<void> {
    if (pin().length < 4 || busy()) return;
    setBusy(true);
    setError('');
    try {
      const user = await loginWithPin(pin());
      startSession({ id: user.id, name: user.name, role: user.role }, user.token);
    } catch (cause) {
      beepError();
      setPin('');
      setError(
        cause instanceof ApiError && cause.serverMessage !== null
          ? cause.serverMessage
          : 'No se pudo entrar. Revisa que el sistema local esté activo.',
      );
    } finally {
      setBusy(false);
    }
  }

  function press(key: string): void {
    setError('');
    if (key === 'borrar') {
      setPin((value) => value.slice(0, -1));
      return;
    }
    if (key === 'entrar') {
      void submit();
      return;
    }
    if (pin().length < 6) {
      setPin((value) => value + key);
      if (pin().length === 6) void submit();
    }
  }

  return (
    <div
      class={styles.pantalla}
      onKeyDown={(event) => {
        if (/^\d$/.test(event.key)) press(event.key);
        if (event.key === 'Backspace') press('borrar');
        if (event.key === 'Enter') press('entrar');
      }}
      tabIndex={0}
      ref={(element) => setTimeout(() => element.focus())}
    >
      <div class={styles.tarjeta} classList={{ [styles.tarjetaError]: error() !== '' }}>
        <span class={styles.marca}>
          man<span class={styles.acento}>á</span>
        </span>
        <p class={styles.saludo}>Teclea tu PIN para empezar el turno</p>

        {/* Un punto por dígito tecleado (el PIN puede tener 4, 5 o 6):
            mostrar 6 fijos hacía creer que siempre faltaban dígitos. */}
        <div class={styles.puntos} aria-label="PIN">
          <Show
            when={pin().length > 0}
            fallback={<span class={styles.puntosGuia}>· · · ·</span>}
          >
            <For each={[...pin()]}>{() => <span class={styles.puntoLleno} />}</For>
          </Show>
        </div>

        <Show when={error() !== ''}>
          <p class={styles.error}>{error()}</p>
        </Show>

        <div class={styles.teclado}>
          <For each={KEYS}>
            {(key) => (
              <button
                type="button"
                class={styles.tecla}
                classList={{
                  [styles.teclaAccion]: key === 'borrar' || key === 'entrar',
                  [styles.teclaEntrar]: key === 'entrar',
                }}
                disabled={busy()}
                onClick={() => press(key)}
              >
                {key === 'borrar' ? '⌫' : key === 'entrar' ? '✓' : key}
              </button>
            )}
          </For>
        </div>

        <p class={styles.pista}>El teclado físico también sirve: dígitos y Enter</p>
      </div>
    </div>
  );
};
