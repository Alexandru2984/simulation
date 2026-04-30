import { useMemo, useRef } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { latLonToVec3, GLOBE_RADIUS } from '../utils/geoUtils'

const STORM_ICONS = ['🌀', '🌪️', '⛈️']
const INTENSITY_LABEL = (anom) => {
  if (anom < -20) return 'Cat 4+'
  if (anom < -15) return 'Cat 3'
  if (anom < -12) return 'Cat 2'
  if (anom < -9)  return 'Cat 1'
  return 'TD'
}

export default function StormLabels({ storms = [], camera }) {
  if (!storms || storms.length === 0) return null

  return (
    <>
      {storms.slice(0, 8).map((storm, i) => {
        const pos = latLonToVec3(storm.lat, storm.lon, GLOBE_RADIUS + 0.05)
        const key = `${storm.lat.toFixed(1)}_${storm.lon.toFixed(1)}`

        return (
          <Html
            key={key}
            position={[pos.x, pos.y, pos.z]}
            distanceFactor={5}
            occlude
            style={{ pointerEvents: 'none' }}
          >
            <div style={{
              background: '#0f172add',
              border: '1px solid #a855f7',
              borderRadius: 8,
              padding: '4px 8px',
              color: '#e2e8f0',
              fontSize: '0.68rem',
              whiteSpace: 'nowrap',
              backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', gap: 4,
              boxShadow: '0 2px 12px #a855f744',
            }}>
              <span style={{ fontSize: '0.9rem' }}>🌀</span>
              <div>
                <div style={{ fontWeight: 700, color: '#a855f7', lineHeight: 1.2 }}>
                  {INTENSITY_LABEL(storm.anom)}
                </div>
                <div style={{ color: '#475569' }}>
                  {storm.P?.toFixed(0)} hPa · {storm.wind?.toFixed(0)} m/s
                </div>
              </div>
            </div>
          </Html>
        )
      })}
    </>
  )
}
