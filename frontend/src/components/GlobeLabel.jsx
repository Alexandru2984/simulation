import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { facesCamera, GLOBE_RADIUS, latLonToVec3 } from '../utils/geoUtils'

// Labels pinned to the globe are ordinary DOM nodes rendered next to the
// canvas; one projector inside the canvas moves them every frame. This
// replaces drei's <Html>, which mounted a separate React root per label (its
// content never committed under React 19 here) and, with `occlude`,
// raycast the whole scene per label per frame.

// Inside <Canvas>: projects every registered label to screen space.
export function LabelProjector({ registry }) {
  const { camera, size } = useThree()
  const v = useMemo(() => new THREE.Vector3(), [])
  useFrame(() => {
    registry.forEach(entry => {
      const { el, pos } = entry
      if (!el) return
      const visible = facesCamera(pos, camera.position)
      if (visible !== entry.shown) {
        entry.shown = visible
        el.style.visibility = visible ? 'visible' : 'hidden'
      }
      if (!visible) return
      v.set(pos.x, pos.y, pos.z).project(camera)
      const x = ((v.x + 1) / 2) * size.width
      const y = ((1 - v.y) / 2) * size.height
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`
    })
  })
  return null
}

// Outside <Canvas>, inside .globe-labels.
export default function GlobeLabel({ registry, id, lat, lon, altitude = 0.05, className, children }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const pos = latLonToVec3(lat, lon, GLOBE_RADIUS + altitude)
    registry.set(id, { el: ref.current, pos, shown: undefined })
    return () => registry.delete(id)
  }, [registry, id, lat, lon, altitude])
  return (
    <div ref={ref} className="globe-label" style={{ visibility: 'hidden' }}>
      <div className={className}>{children}</div>
    </div>
  )
}
