import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from "vite-tsconfig-paths";
import { APP_BASE_PATH } from './src/lib/appPaths';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageJson = require('./package.json') as { version: string };

// https://vite.dev/config/
export default defineConfig({
  base: APP_BASE_PATH,
  plugins: [
    react({
      babel: {
        plugins: [
          'react-dev-locator',
        ],
      },
    }),
    tsconfigPaths(),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __GIT_COMMIT__: JSON.stringify(process.env.APP_GIT_COMMIT || 'development'),
    __BUILD_TIME__: JSON.stringify(process.env.APP_BUILD_TIME || new Date().toISOString()),
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
