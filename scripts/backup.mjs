// Salva uma copia dos dados e contratos do sistema na pasta do OneDrive.
// Uso: npm run backup
// Pede e-mail e senha de uma conta admin. A senha nao e salva em lugar nenhum.
// Guarda os dados das tabelas, nao a estrutura do banco nem as contas de login.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { createClient } from '@supabase/supabase-js';
import { perguntarOculto } from './senha-oculta.mjs';

const TABELAS = [
  'user_profiles', 'estados', 'cidades', 'categorias', 'clients', 'eventos',
  'transacoes', 'leads', 'lead_followups', 'propostas', 'proposta_itens',
];
const POR_PAGINA = 1000;

// Pasta sincronizada com a nuvem. BACKUP_DIR permite usar outra, como a do Google Drive.
function pastaDestino() {
  if (process.env.BACKUP_DIR) return { base: process.env.BACKUP_DIR, nuvem: true };
  const oneDrive = process.env.OneDriveConsumer || process.env.OneDrive;
  if (oneDrive && existsSync(oneDrive)) return { base: oneDrive, nuvem: true };
  return { base: homedir(), nuvem: false };
}

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

async function perguntarCredenciais() {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const email = (await rl.question('E-mail do admin: ')).trim();
  rl.close();
  const senha = await perguntarOculto('Senha (nada aparece enquanto voce digita): ');
  return { email, senha };
}

async function exportarTabela(supabase, tabela) {
  const linhas = [];
  let total = null;
  for (let inicio = 0; ; inicio += POR_PAGINA) {
    const { data, error, count } = await supabase
      .from(tabela)
      .select('*', { count: 'exact' })
      .order('id')
      .range(inicio, inicio + POR_PAGINA - 1);
    if (error) throw new Error(`${tabela}: ${error.message}`);
    total = count;
    linhas.push(...data);
    if (data.length < POR_PAGINA) break;
  }
  if (linhas.length !== total) {
    throw new Error(`${tabela}: baixou ${linhas.length} de ${total} linhas`);
  }
  return linhas;
}

async function exportarContratos(supabase, eventos, pasta) {
  const urls = eventos.map(e => e.contrato_url).filter(Boolean);
  const falhas = [];
  for (const url of urls) {
    const caminho = url.includes('/contratos/') ? decodeURIComponent(url.split('/contratos/')[1]) : url;
    const { data, error } = caminho
      ? await supabase.storage.from('contratos').download(caminho)
      : { data: null, error: new Error('link invalido') };
    if (error) {
      falhas.push(caminho || url);
      continue;
    }
    writeFileSync(join(pasta, basename(caminho)), Buffer.from(await data.arrayBuffer()));
  }
  return { total: urls.length, falhas };
}

async function main() {
  const env = lerEnv();
  const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { email, senha } = await perguntarCredenciais();
  const { error: erroLogin } = await supabase.auth.signInWithPassword({ email, password: senha });
  if (erroLogin) throw new Error('Login falhou: ' + erroLogin.message);

  const carimbo = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
  const destino = pastaDestino();
  const pasta = join(destino.base, 'Backups', 'AtelieThaiLago', carimbo);
  const pastaContratos = join(pasta, 'contratos');
  mkdirSync(pastaContratos, { recursive: true });

  const resumo = { criado_em: new Date().toISOString(), tabelas: {} };
  let eventos = [];
  for (const tabela of TABELAS) {
    const linhas = await exportarTabela(supabase, tabela);
    if (tabela === 'eventos') eventos = linhas;
    writeFileSync(join(pasta, `${tabela}.json`), JSON.stringify(linhas, null, 2));
    resumo.tabelas[tabela] = linhas.length;
    console.log(`${tabela}: ${linhas.length}`);
  }

  const contratos = await exportarContratos(supabase, eventos, pastaContratos);
  resumo.contratos = { total: contratos.total, salvos: contratos.total - contratos.falhas.length, falhas: contratos.falhas };
  console.log(`contratos: ${resumo.contratos.salvos} de ${contratos.total}`);
  writeFileSync(join(pasta, 'resumo.json'), JSON.stringify(resumo, null, 2));

  await supabase.auth.signOut({ scope: 'local' });
  console.log(`\nBackup salvo em: ${pasta}`);
  console.log(destino.nuvem
    ? 'Confira no aplicativo de sincronização se o envio para a nuvem terminou.'
    : 'ATENCAO: esta cópia ficou só neste computador. Nenhuma pasta do OneDrive foi encontrada.');

  if (contratos.falhas.length > 0) {
    console.error('ATENCAO: alguns contratos nao foram baixados. Entre com a conta que os enviou ou baixe pelo painel do Supabase.');
    process.exitCode = 1;
  }
}

main().catch(erro => {
  console.error('\nBackup NAO concluido: ' + erro.message);
  process.exitCode = 1;
});
