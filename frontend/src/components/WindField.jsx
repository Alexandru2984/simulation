// WindField — one arrow per grid cell, lying in the local tangent plane and
// pointing downwind. Arrow length and colour grow with wind speed; columns are
// thinned towards the poles so the arrows don't pile up there.
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { eastVec, latLonToVec3, northVec } from '../utils/geoUtils'

const RADIUS = 2.06
const SLOW = new THREE.Color('#38bdf8')
const FAST = new THREE.Color('#fde047')

// Shaft + head pointing along +Y, centred near the cell centre.
function makeArrowGeometry() {
  const shaft = new THREE.CylinderGeometry(0.004, 0.004, 0.06, 4)
  shaft.translate(0, -0.005, 0)
  const head = new THREE.ConeGeometry(0.012, 0.03, 4)
  head.translate(0, 0.04, 0)
  const positions = []
  for (const part of [shaft, head]) {
    const geo = part.toNonIndexed()
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
    geo.dispose()
    part.dispose()
  }
  const merged = new THREE.BufferGeometry()
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  return merged
}

export default function WindField({ gridData }) {
  const meshRef = useRef()
  const rows = gridData?.rows || 36
  const cols = gridData?.cols || 72
  const count = rows * cols

  const geometry = useMemo(() => makeArrowGeometry(), [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.8, toneMapped: false,
  }), [])
  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])

  const scratch = useMemo(() => ({
    dummy: new THREE.Object3D(),
    up: new THREE.Vector3(0, 1, 0),
    dir: new THREE.Vector3(),
    color: new THREE.Color(),
  }), [])

  useEffect(() => {
    const mesh = meshRef.current
    const U = gridData?.U
    const V = gridData?.V
    if (!mesh || !U || !V) return
    const { dummy, up, dir, color } = scratch

    for (let r = 0; r < rows; r++) {
      const lat = -90 + (r + 0.5) * (180 / rows)
      const stride = Math.max(1, Math.round(1 / Math.cos(lat * Math.PI / 180)))
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c
        const lon = -180 + (c + 0.5) * (360 / cols)
        const u = U[i] || 0
        const v = V[i] || 0
        const speed = Math.hypot(u, v)

        if (c % stride !== 0 || speed < 0.3) {
          dummy.scale.setScalar(0)
        } else {
          const e = eastVec(lon)
          const n = northVec(lat, lon)
          dir.set(e.x * u + n.x * v, e.y * u + n.y * v, e.z * u + n.z * v).normalize()
          dummy.quaternion.setFromUnitVectors(up, dir)
          dummy.scale.setScalar(0.45 + Math.min(1, speed / 20) * 0.85)
        }
        const p = latLonToVec3(lat, lon, RADIUS)
        dummy.position.set(p.x, p.y, p.z)
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
        mesh.setColorAt(i, color.copy(SLOW).lerp(FAST, Math.min(1, speed / 25)))
      }
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [gridData, rows, cols, scratch])

  if (!gridData) return null
  return <instancedMesh key={count} ref={meshRef} args={[geometry, material, count]} frustumCulled={false} />
}
