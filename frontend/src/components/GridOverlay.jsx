// GridOverlay — paints the selected simulation field into a DataTexture
// draped over the globe just above the Earth surface. Colours come from the
// same lookup tables as the on-screen legend.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { paintOverlay } from '../utils/overlayTexture'

const TEX_W = 360
const TEX_H = 180

export default function GridOverlay({ gridData, mode = 'temp' }) {
  const { data, texture } = useMemo(() => {
    const pixels = new Uint8Array(TEX_W * TEX_H * 4)
    const tex = new THREE.DataTexture(pixels, TEX_W, TEX_H, THREE.RGBAFormat)
    tex.minFilter = tex.magFilter = THREE.LinearFilter
    tex.wrapS = THREE.RepeatWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    // The LUT holds sRGB colours, exactly like the CSS legend gradient.
    tex.colorSpace = THREE.SRGBColorSpace
    return { data: pixels, texture: tex }
  }, [])

  useEffect(() => {
    paintOverlay(data, TEX_W, TEX_H, gridData, mode)
    texture.needsUpdate = true
  }, [gridData, mode, data, texture])

  useEffect(() => () => texture.dispose(), [texture])

  if (!gridData) return null

  return (
    <mesh renderOrder={1}>
      <sphereGeometry args={[2.02, 96, 48]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}
