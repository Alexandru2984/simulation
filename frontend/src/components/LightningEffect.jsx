// LightningEffect — renders random lightning bolt flashes at active storm locations.
// Bolts are imperatively-managed THREE.Line objects to avoid React re-render overhead.
import { useMemo, useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { GLOBE_RADIUS } from '../utils/geoUtils'

function stormKey(storm) {
  // Stable key rounded to 1° so minor grid drift doesn't remount the component
  return `${Math.round(storm.lat)}_${Math.round(storm.lon)}`
}

function latLonToVec3(lat, lon, r = GLOBE_RADIUS) {
  const latR = lat * Math.PI / 180
  const lonR = (lon + 180) * Math.PI / 180
  return new THREE.Vector3(
    -r * Math.cos(latR) * Math.cos(lonR),
     r * Math.sin(latR),
     r * Math.cos(latR) * Math.sin(lonR),
  )
}

// Generate a 13-point zigzag bolt starting at `origin`, going radially outward.
function makeBoltPoints(origin, perpA, perpB) {
  const radial = origin.clone().normalize()
  const pts    = [origin.clone()]
  let pos      = origin.clone()

  for (let i = 0; i < 12; i++) {
    const jitter  = (Math.random() - 0.5) * 0.65
    const sideVec = (Math.random() < 0.5 ? perpA : perpB)
    const dir     = radial.clone().addScaledVector(sideVec, jitter).normalize()
    const segLen  = 0.016 * (1 - i * 0.04)
    pos = pos.clone().addScaledVector(dir, segLen)
    pts.push(pos.clone())
  }
  return pts
}

// A single bolt object associated with one storm.
function LightningBolt({ storm }) {
  const stateRef = useRef({
    nextFlash: 1.5 + Math.random() * 4,
    endTime:   0,
    flashing:  false,
  })

  const line = useMemo(() => {
    const geo = new THREE.BufferGeometry()
    // Pre-allocate buffer for 13 points
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(13 * 3), 3))
    geo.setDrawRange(0, 0)

    const mat = new THREE.LineBasicMaterial({
      color:       new THREE.Color(0xfff8b0),
      transparent: true,
      opacity:     0.95,
      depthWrite:  false,
      blending:    THREE.AdditiveBlending,
    })

    const obj     = new THREE.Line(geo, mat)
    obj.visible   = false
    obj.renderOrder = 10
    return obj
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Dispose geometry/material when the component unmounts
  useEffect(() => {
    return () => {
      line.geometry.dispose()
      line.material.dispose()
    }
  }, [line])

  useFrame((_, delta) => {
    const s = stateRef.current
    s.nextFlash -= delta

    if (s.flashing) {
      if (performance.now() > s.endTime) {
        s.flashing   = false
        line.visible = false
      }
    } else if (s.nextFlash <= 0) {
      // Trigger a new flash
      s.flashing   = true
      s.endTime    = performance.now() + 160 + Math.random() * 100
      s.nextFlash  = 2.5 + Math.random() * 6

      // Build bolt geometry at storm position
      const origin  = latLonToVec3(storm.lat, storm.lon)
      const radial  = origin.clone().normalize()
      const up      = new THREE.Vector3(0, 1, 0)
      let east      = new THREE.Vector3().crossVectors(radial, up)
      if (east.length() < 0.3) east.set(1, 0, 0)
      east.normalize()
      const north   = new THREE.Vector3().crossVectors(east, radial).normalize()

      const pts     = makeBoltPoints(origin, east, north)
      const buf     = line.geometry.attributes.position.array
      pts.forEach((p, i) => {
        buf[i * 3]     = p.x
        buf[i * 3 + 1] = p.y
        buf[i * 3 + 2] = p.z
      })
      line.geometry.attributes.position.needsUpdate = true
      line.geometry.setDrawRange(0, pts.length)
      line.visible  = true
    }
  })

  return <primitive object={line} />
}

export default function LightningEffect({ storms }) {
  if (!storms?.length) return null
  return (
    <>
      {storms.map(storm => (
        <LightningBolt key={stormKey(storm)} storm={storm} />
      ))}
    </>
  )
}
