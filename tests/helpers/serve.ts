import { spawn, type ChildProcess } from 'node:child_process';
import { localEnv } from './db';

/**
 * Sobe a Edge Function de verdade (`supabase functions serve`) para os testes
 * de HTTP. Testar o RPC não basta: o que o Agent Builder chama é a URL, e já
 * aconteceu de um helper ficar verde com a rota real quebrada.
 */
let proc: ChildProcess | undefined;

export async function setup() {
  const { url } = localEnv();

  proc = spawn('npx', ['--yes', 'supabase@latest', 'functions', 'serve', '--no-verify-jwt'], {
    cwd: new URL('../..', import.meta.url).pathname,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      // Sem chave a função responde 401: isso já prova que ela está de pé.
      const res = await fetch(`${url}/functions/v1/api/v1/professionals`);
      if (res.status === 401) {
        await res.body?.cancel();
        return;
      }
      await res.body?.cancel();
    } catch {
      // ainda subindo
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  throw new Error('supabase functions serve não respondeu em 120s');
}

export async function teardown() {
  if (proc?.pid) {
    try {
      process.kill(-proc.pid, 'SIGTERM');
    } catch {
      proc.kill('SIGTERM');
    }
  }
}
