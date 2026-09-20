import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Testes de contrato falam com um Postgres de verdade: sem paralelismo,
    // para duas suítes não disputarem as mesmas linhas de fixture.
    fileParallelism: false,
    testTimeout: 15_000,
    // Sobe a Edge Function uma vez para os testes de HTTP (tests/api-http.test.ts).
    globalSetup: ['./tests/helpers/serve.ts'],
    hookTimeout: 150_000,
  },
});
