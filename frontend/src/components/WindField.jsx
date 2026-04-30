// WindField — renders animated wind arrows at each 36×72 grid point
import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const ROWS = 36, COLS = 72
const COUNT = ROWS * COLS

// Convert grid lat/lon to 3D position on sphere surface
function latLonToVec3(lat, lon, r) {
  const latR = (lat * Math.PI) / 180
  const lonR = ((lon + 180) * Math.PI) / 180
  return new THREE.Vector3(
    -r * Math.cos(latR) * Math.cos(lonR),
     r * Math.sin(latR),
     r * Math.cos(latR) * Math.sin(lonR)
  )
}

// Arrow geometry: thin box shaft + cone head, pointing in +Y at rest
function makeArrowGeometry() {
  const shaftGeo  = new THREE.CylinderGeometry(0.003, 0.003, 0.06, 4)
  shaftGeo.translate(0, 0.01, 0)
  const headGeo   = new THREE.ConeGeometry(0.008, 0.03, 4)
  headGeo.translate(0, 0.055, 0)

  const merged = new THREE.BufferGeometry()
  const positions = []
  const addGeo = (geo) => {
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) {
      positions.push(pos.getX(i), pos.getY(i), pos.getZ(i))
    }
  }
  addGeo(shaftGeo)
  addGeo(headGeo)

  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  merged.computeVertexNormals()
  return merged
}

export default function WindField({ gridData }) {
  const meshRef = useRef()

  const geometry = useMemo(() => makeArrowGeometry(), [])
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.55,
  }), [])

  // Reusable objects for per-frame matrix updates
  const dummy    = useMemo(() => new THREE.Object3D(), [])
  const up       = useMemo(() => new THREE.Vector3(0, 1, 0), [])
  const quat     = useMemo(() => new THREE.Quaternion(), [])
  const axis     = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    if (!gridData || !meshRef.current) return
    const { U, V } = gridData
    const R = 2.06   // slightly above globe

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c
        const lat = -87.5 + r * 5
        const lon = -177.5 + c * 5

        const pos  = latLonToVec3(lat, lon, R)
        const u    = U[i], v = V[i]
        const spd  = Math.sqrt(u * u + v * v)

        // Scale: visible at 1 m/s, max at ~30 m/s
        const scale = Math.min(1.0, spd / 20) + 0.05

        dummy.position.copy(pos)
        dummy.scale.setScalar(scale)

        // Orient: point radially outward first, then rotate for wind direction
        const radial = pos.clone().normalize()
        dummy.quaternion.setFromUnitVectors(up, radial)

        if (spd > 0.5) {
          // Wind direction in local tangent plane
          // U = eastward, V = northward  → rotate around radial axis
          const angle = Math.atan2(u, v)  // bearing from north
          quat.setFromAxisAngle(radial, angle)
          dummy.quaternion.premultiply(quat)
        }

        dummy.updateMatrix()
        meshRef.current.setMatrixAt(i, dummy.matrix)
      }
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [gridData, dummy, up, quat])

  if (!gridData) return null

  return (
    <instancedMesh ref={meshRef} args={[geometry, material, COUNT]} />
  )
}
