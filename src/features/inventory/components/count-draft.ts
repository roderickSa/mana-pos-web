// Lo tecleado en un conteo y todavía sin anotar. Vive en el navegador de quien
// está contando, por sesión de conteo: es un apunte a medio camino, no un dato
// del negocio. Lo anotado sí está en el servidor desde el toque «Anotar».
//
// Una tienda cuenta caminando el anaquel con mil productos o más; que se le
// vaya la luz o se recargue la página no puede borrarle lo que ya tecleó.
export interface CountDraft {
  // productId → lo tecleado, tal cual, sin convertir a número todavía.
  quantities: Record<string, string>;
  closeNote: string;
}

export function decodeCountDraft(data: unknown): CountDraft | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const raw: Record<string, unknown> = { ...data };
  if (typeof raw.closeNote !== 'string') return undefined;
  const quantities = raw.quantities;
  if (typeof quantities !== 'object' || quantities === null) return undefined;
  const entries = Object.entries(quantities);
  const textos: Record<string, string> = {};
  for (const [productId, value] of entries) {
    if (typeof value !== 'string') return undefined;
    textos[productId] = value;
  }
  return { quantities: textos, closeNote: raw.closeNote };
}

// Un conteo sin nada tecleado no deja rastro en el navegador.
export function isEmptyCountDraft(draft: CountDraft): boolean {
  return Object.keys(draft.quantities).length === 0 && draft.closeNote === '';
}
