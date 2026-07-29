/* @refresh reload */
import { render } from 'solid-js/web'
import './app/index.css'
import App from './app/App.tsx'

const root = document.getElementById('root')

render(() => <App />, root!)
