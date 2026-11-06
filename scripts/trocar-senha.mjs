// Troca a senha de uma conta do sistema.
// Uso: npm run trocar-senha
import { readFileSync } from 'node:fs';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { perguntarOculto } from './senha-oculta.mjs';

function lerEnv() {
  const env = {};
  for (const linha of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/);
    if (m) env[m[1]] = m[2];
  }
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    throw new Error('Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no .env.local. Rode na pasta do projeto.');
  }
  return env;
}

async function main() {
  const env = lerEnv();
  const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const email = (await rl.question('E-mail da conta: ')).trim();
  rl.close();

  console.log('Nada deve aparecer enquanto voce digita as senhas. Se aparecer, aperte Ctrl+C.');
  const atual = await perguntarOculto('Senha atual: ');
  const { error: erroLogin } = await supabase.auth.signInWithPassword({ email, password: atual });
  if (erroLogin) throw new Error('Login falhou: ' + erroLogin.message);

  const nova = await perguntarOculto('Nova senha (minimo 12 caracteres): ');
  if (nova.length < 12) throw new Error('A nova senha precisa ter pelo menos 12 caracteres.');
  if (nova === atual) throw new Error('A nova senha precisa ser diferente da atual.');
  const confirmacao = await perguntarOculto('Repita a nova senha: ');
  if (nova !== confirmacao) throw new Error('As senhas nao coincidem.');

  const { error } = await supabase.auth.updateUser({ password: nova });
  if (error) throw new Error('Nao foi possivel trocar a senha: ' + error.message);

  // Encerra as outras sessoes, inclusive em outros aparelhos.
  await supabase.auth.signOut({ scope: 'others' });
  await supabase.auth.signOut({ scope: 'local' });
  console.log('Senha trocada. Entre de novo no sistema com a nova senha.');
}

main().catch(erro => {
  console.error('\nSenha NAO trocada: ' + erro.message);
  process.exitCode = 1;
});
