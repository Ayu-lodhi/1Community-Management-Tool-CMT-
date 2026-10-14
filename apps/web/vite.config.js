import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export function validateNoDemoEnvInProduction(mode, envDir = process.cwd()) {
  if (mode === 'production' || process.env.NODE_ENV === 'production') {
    const env = loadEnv(mode || 'production', envDir, '');
    const allEnv = { ...process.env, ...env };
    const demoKeys = Object.keys(allEnv).filter(
      (k) => k.startsWith('VITE_DEMO_') && Boolean(allEnv[k]?.trim())
    );
    if (demoKeys.length > 0) {
      throw new Error(
        `[SECURITY FATAL] VITE_DEMO_* variables (${demoKeys.join(', ')}) must NOT be set in production builds! Never expose demo credentials in production bundles.`
      );
    }
  }
}

export default defineConfig(({ mode }) => {
  validateNoDemoEnvInProduction(mode);

  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://localhost:5000',
          changeOrigin: true,
        },
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-charts': ['recharts'],
            'vendor-icons': ['lucide-react'],
            'vendor-socket': ['socket.io-client'],
          },
        },
      },
    },
  };
});