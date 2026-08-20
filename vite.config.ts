import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from https://<user>.github.io/floorplanner/ — dev server honours it too.
export default defineConfig({ plugins: [react()], base: '/floorplanner/' })
