import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Long-lived vendor chunks: an app deploy only invalidates our own code,
// not the ~1 MB of three.js visitors already have cached.
const vendor = name => new RegExp(`node_modules[\\\\/](${name})[\\\\/]`)

export default defineConfig({
  plugins: [react()],
  base: '/',
  build: {
    outDir: 'dist',
    target: 'es2022',
    // three.js alone is ~700 KB minified; it is lazy-loaded behind the HUD.
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'react', test: vendor('react|react-dom|scheduler'), priority: 30 },
            { name: 'three', test: vendor('three'), priority: 20 },
            {
              name: 'r3f',
              test: vendor('@react-three|three-stdlib|zustand|its-fine|suspend-react|react-use-measure|@monogrid|troika-[^\\\\/]+|maath|meshline|camera-controls|stats-gl|detect-gpu|@use-gesture|tunnel-rat|hls\\.js|stats\\.js'),
              priority: 10,
            },
            { name: 'geo', test: vendor('topojson-client|world-atlas'), priority: 10 },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8094',
      '/ws': { target: 'ws://127.0.0.1:8094', ws: true },
    },
  },
})
