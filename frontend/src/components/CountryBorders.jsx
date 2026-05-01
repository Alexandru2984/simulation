// CountryBorders — renders world country boundaries as thin line segments on the globe.
// Uses world-atlas (110m simplified topojson) + topojson-client.
import { useMemo } from 'react'
import * as THREE from 'three'
import * as topojson from 'topojson-client'
import world from 'world-atlas/countries-110m.json'
import { GLOBE_RADIUS } from '../utils/geoUtils'

const R = GLOBE_RADIUS + 0.023  // above GridOverlay, below isobars

function project(lat, lon) {
  const latR = lat * Math.PI / 180
  const lonR = (lon + 180) * Math.PI / 180
  return [
    -R * Math.cos(latR) * Math.cos(lonR),
     R * Math.sin(latR),
     R * Math.cos(latR) * Math.sin(lonR),
  ]
}

export default function CountryBorders() {
  const geometry = useMemo(() => {
    // topojson.mesh returns a GeoJSON MultiLineString of all border arcs
    const borders = topojson.mesh(world, world.objects.countries)
    const positions = []

    borders.coordinates.forEach(line => {
      for (let i = 0; i < line.length - 1; i++) {
        const [lon1, lat1] = line[i]
        const [lon2, lat2] = line[i + 1]
        // Skip segments that cross the antimeridian (lon jump > 180°)
        if (Math.abs(lon1 - lon2) > 180) continue
        const v1 = project(lat1, lon1)
        const v2 = project(lat2, lon2)
        positions.push(...v1, ...v2)
      }
    })

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    return geo
  }, [])

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#e2e8f0" transparent opacity={0.22} depthWrite={false} />
    </lineSegments>
  )
}
