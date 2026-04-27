import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      {
        find: 'nova-design-engine/react',
        replacement: path.resolve(__dirname, '../../src/react.ts'),
      },
      {
        find: 'nova-design-engine',
        replacement: path.resolve(__dirname, '../../src/index.ts'),
      },
    ],
  },
});
