import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        // Replace this URL with your actual backend URL
        target: 'https://your-backend-url.com', 
        changeOrigin: true,
        // This allows the frontend to talk to a backend with a weak/self-signed SSL cert
        secure: false, 
        // Optional: Uncomment the line below if your backend DOES NOT have /api in its routes
        // rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
})