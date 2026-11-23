import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
// https://vitejs.dev/config/
export default defineConfig(function (_a) {
    var mode = _a.mode;
    var env = loadEnv(mode, '.', '');
    var rawTarget = env.BACKEND_URL || env.VITE_BACKEND_URL || 'http://localhost:3000';
    var backendTarget = rawTarget.replace(/\/+$/, '');
    return {
        plugins: [react()],
        server: {
            port: 5173,
            host: true,
            proxy: {
                '/api': {
                    target: backendTarget,
                    changeOrigin: true,
                },
                '/ws': {
                    target: backendTarget,
                    ws: true,
                    changeOrigin: true,
                },
            },
        },
    };
});
