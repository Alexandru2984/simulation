// Loading / fallback screen. Mirrors the static markup in index.html so the
// hand-off from the server-rendered splash to React is seamless.
export default function Splash({ hidden = false, title = 'Weather Simulation', message, action }) {
  return (
    <div className={`splash${hidden ? ' is-hidden' : ''}`} aria-hidden={hidden} role={hidden ? undefined : 'status'}>
      <div className="splash__inner">
        <div className="splash__orb" aria-hidden="true" />
        <h1>{title}</h1>
        <p>A live 3D model of Earth’s atmosphere — temperature, pressure, wind, humidity, rain and storms — shared in real time by everyone watching.</p>
        <p className="splash__status">{message ?? 'Loading the live 3D globe…'}</p>
        {action}
      </div>
    </div>
  )
}
