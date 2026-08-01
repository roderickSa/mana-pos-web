// Foco al montar: `ref={focusOnMount}` en el input principal de cada módulo.
// (El atributo autofocus solo dispara en la carga inicial del documento; en
// montajes dinámicos hay que pedirlo a mano.)
export function focusOnMount(element: HTMLElement): void {
  setTimeout(() => element.focus(), 60);
}
