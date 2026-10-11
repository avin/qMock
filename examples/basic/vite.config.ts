import { defineConfig } from 'vite';
import { apiMockPlugin } from '@avinlab/qmock';

export default defineConfig({
  plugins: [apiMockPlugin()],
});
