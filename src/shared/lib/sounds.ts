// Feedback sonoro de caja: la cajera atiende al cliente, no a la pantalla.
// Un bip confirma sin mirar; el tono grave doble avisa que hay que mirar.

let context: AudioContext | null = null;

function audioContext(): AudioContext | null {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') void context.resume();
    return context;
  } catch {
    return null;
  }
}

function tone(frequency: number, durationMs: number, delayMs = 0): void {
  const ctx = audioContext();
  if (ctx === null) return;
  const start = ctx.currentTime + delayMs / 1000;
  const end = start + durationMs / 1000;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.06, start);
  gain.gain.exponentialRampToValueAtTime(0.001, end);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(end);
}

// Producto agregado al ticket.
export function beepOk(): void {
  tone(880, 70);
}

// Operación completada (venta cobrada, caja abierta, abono registrado…).
export function beepSuccess(): void {
  tone(660, 80);
  tone(990, 110, 90);
}

// Algo falló: hay que mirar la pantalla.
export function beepError(): void {
  tone(240, 150);
  tone(180, 150, 160);
}
