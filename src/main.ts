import './style.css'
import { Game } from './game.ts'

const root = document.querySelector('#app')
if (!root) throw new Error('missing #app')
new Game(root as HTMLElement)
