/* @refresh reload */
import { ErrorBoundary } from 'solid-js'
import { render } from 'solid-js/web'
// IBM Plex self-hosted (@fontsource): la tienda opera sin internet, nada de
// CDNs. Sans = UI · Mono = dinero/cantidades/etiquetas · Condensed = títulos.
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource/ibm-plex-sans/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/ibm-plex-sans-condensed/600.css'
import '@fontsource/ibm-plex-sans-condensed/700.css'
import './app/index.css'
import App from './app/App.tsx'

const root = document.getElementById('root')

// Un error de render no deja la pantalla en blanco: se explica y se recarga.
render(
  () => (
    <ErrorBoundary
      fallback={(error) => (
        <div style={{ padding: '2rem', 'font-family': 'system-ui, sans-serif', 'max-width': '40rem' }}>
          <h1 style={{ 'font-size': '1.3rem' }}>Algo falló en la pantalla</h1>
          <p>La venta en curso está guardada. Recarga para seguir; si vuelve a pasar, avisa al encargado.</p>
          <p style={{ 'font-family': 'monospace', 'font-size': '0.8rem', opacity: 0.7 }}>
            {error instanceof Error ? error.message : String(error)}
          </p>
          <button type="button" onClick={() => location.reload()} style={{ 'min-height': '48px', padding: '0 1.5rem' }}>
            Recargar
          </button>
        </div>
      )}
    >
      <App />
    </ErrorBoundary>
  ),
  root!,
)
