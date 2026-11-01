import Dialog from './Dialog'
import { LAYERS } from '../constants'

const SHORTCUTS = [
  [['1', '–', '7'], 'Switch map layer'],
  [['/'], 'Search for a city'],
  [['E'], 'Open the event injector'],
  [['T'], 'Start or stop the storm tour'],
  [['R'], 'Reset the camera'],
  [['+', '−'], 'Zoom in / out'],
  [['F'], 'Toggle fullscreen'],
  [['S'], 'Save a screenshot'],
  [['L'], 'Return to the live simulation'],
  [['Esc'], 'Close panels or cancel placement'],
  [['?'], 'Show this help'],
]

export default function HelpDialog({ onClose }) {
  return (
    <Dialog title="About this simulation" onClose={onClose}>
      <p>
        A shared, real-time model of Earth&apos;s atmosphere. A C++ engine integrates
        temperature, pressure, wind and humidity on a 36 × 72 global grid (5° cells)
        ten times per second, and every visitor sees — and can change — the same world.
      </p>

      <h3>What drives it</h3>
      <ul>
        <li><strong>Sunlight</strong> heats the day side using the real UTC day/night terminator.</li>
        <li><strong>Pressure gradients and the Coriolis force</strong> set the winds.</li>
        <li><strong>Advection, diffusion and latent heat</strong> move and release energy.</li>
        <li><strong>Live observations</strong> from 20 cities nudge the model every 5 minutes.</li>
        <li><strong>Storms</strong> are detected as deep local pressure minima with strong winds.</li>
      </ul>

      <h3>Things to try</h3>
      <ul>
        <li>Click anywhere on the globe to compare live observed weather with the simulation.</li>
        <li>Inject a cyclone or heat dome and watch the grid respond.</li>
        <li>Run a forecast, or replay recent history from the Time Navigator.</li>
        <li>Share the current view — the link keeps the location and layer.</li>
      </ul>

      <h3>Keyboard shortcuts</h3>
      <div className="shortcuts">
        {SHORTCUTS.map(([keys, label]) => (
          <div key={label} style={{ display: 'contents' }}>
            <span>{keys.map(k => k === '–' ? ' – ' : <kbd key={k} className="kbd">{k}</kbd>)}</span>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <p className="muted" style={{ marginTop: 14 }}>
        Layers: {LAYERS.map(l => `${l.key} ${l.label}`).join(' · ')}
      </p>

      <h3>Fine print</h3>
      <p>
        This is an educational simulation, not a forecast — use an official weather
        service for real-world decisions. Observations by OpenWeatherMap; Earth imagery
        and borders from public-domain datasets.
      </p>
      <p>
        No accounts, ads or tracking cookies. Read the <a href="/privacy">privacy notice</a>.
      </p>
    </Dialog>
  )
}
