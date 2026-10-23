import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const serverDirectory = process.env.TOE_AUTHORITY_SERVER_DIR?.trim();
if (!serverDirectory) {
  throw new Error('TOE_AUTHORITY_SERVER_DIR is required for the cross-repository timing tests.');
}
const timingModule = path.resolve(serverDirectory, 'authority/presentationTiming.js');
try {
  if (!statSync(timingModule).isFile()) throw new Error('Not a file');
} catch {
  throw new Error(`TOE_AUTHORITY_SERVER_DIR must contain authority/presentationTiming.js: ${timingModule}`);
}

export default defineConfig({
  root: fileURLToPath(new URL('../', import.meta.url)),
  resolve: {
    alias: { '@toe-authority/presentationTiming': timingModule },
  },
  test: {
    environment: 'node',
    include: ['integration/presentationBudgetParity.test.js'],
  },
});
