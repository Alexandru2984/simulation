// Loading / fallback screen. Mirrors the static markup in index.html so the
// hand-off from the server-rendered splash to React is seamless.
export default function Splash({ hidden = false, title = 'Weather Simulation', message, action }) {
  return (
    <div className={`splash${hidden ? ' is-hidden' : ''}`} aria-hidden={hidden} role={hidden ? undefined : 'status'}>
      <div className="splash__inner">
        <div className="splash__orb" aria-hidden="true" />
        <h1>{title}</h1>
        <p>{message ?? 'Loading the live 3D globe…'}</p>
        {action}
      </div>
    </div>
  )
}
