/* @refresh reload */
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

render(() => <App />, root!)
