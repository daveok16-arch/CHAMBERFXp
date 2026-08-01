import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  // Default allowed hosts for deployment
  const defaultHosts = ['chamberfxp.onrender.com'];
  
  // Allow additional hosts from environment variable
  const additionalHosts = process.env.ALLOWED_HOSTS?.split(',').filter(Boolean) || [];
  
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      allowedHosts: [...defaultHosts, ...additionalHosts],
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
