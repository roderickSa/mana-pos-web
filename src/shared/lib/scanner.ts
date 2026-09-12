// Lectores de código de barras HID: teclean el código a menos de ~35 ms por
// tecla y rematan con Enter. Ninguna persona escribe 8 dígitos así de rápido,
// por eso una ráfaga se reconoce por el ritmo y se desvía a quien la escucha,
// esté donde esté el foco (un modal, el campo del vuelto, una cantidad).
const MAX_GAP_MS = 35;
const MIN_LENGTH = 8;

type ScanListener = (code: string) => void;

let listener: ScanListener | null = null;
let buffer = '';
let lastKeyAt = 0;
// Cuántos caracteres de la ráfaga cayeron en el input con foco (para sacarlos).
let typedInto: HTMLInputElement | HTMLTextAreaElement | null = null;
let typedCount = 0;

function resetBurst(): void {
  buffer = '';
  typedInto = null;
  typedCount = 0;
}

function stripBurstFromInput(): void {
  if (typedInto === null || typedCount === 0) return;
  const value = typedInto.value;
  if (value.endsWith(buffer.slice(-typedCount))) {
    typedInto.value = value.slice(0, value.length - typedCount);
    typedInto.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (listener === null) return;
  const now = performance.now();
  const gap = now - lastKeyAt;
  lastKeyAt = now;

  if (event.key === 'Enter') {
    if (buffer.length >= MIN_LENGTH && gap <= MAX_GAP_MS && /^\d+$/.test(buffer)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const code = buffer;
      stripBurstFromInput();
      resetBurst();
      listener(code);
      return;
    }
    resetBurst();
    return;
  }
  if (event.key.length !== 1 || event.ctrlKey || event.altKey || event.metaKey) {
    return;
  }
  if (gap > MAX_GAP_MS) resetBurst();
  buffer += event.key;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    typedInto = target;
    typedCount += 1;
  }
}

// Se instala en fase de captura para adelantarse a cualquier input o modal.
// Devuelve la función para desinstalarlo.
export function listenToScanner(onScan: ScanListener): () => void {
  listener = onScan;
  document.addEventListener('keydown', onKeyDown, true);
  return () => {
    document.removeEventListener('keydown', onKeyDown, true);
    listener = null;
    resetBurst();
  };
}
