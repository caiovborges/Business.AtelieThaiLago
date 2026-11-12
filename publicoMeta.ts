// Listas de clientes e leads para publicos personalizados da Meta (trafego pago).
// O arquivo segue o modelo de "lista de clientes" do Gerenciador de Anuncios: a Meta
// criptografa os dados no navegador antes de enviar e cruza com as contas.

import { supabase } from './supabaseClient';
import { telefoneWhatsApp } from './leadContato';
import { ETAPA, ETAPAS_ATIVAS } from './etapas';

export interface Pessoa {
    chave: string; // 'lead:<id>' ou 'cliente:<id>'
    tipo: 'lead' | 'cliente';
    nome: string;
    telefone: string | null;
    email: string | null;
    cidade: string | null;
    uf: string | null;
    status: string | null;
    dataEvento: string | null;
    servicos: string[];
    origem: string | null;
    motivoPerda: string | null;
    valor: number;
    altoPadrao: boolean;
}

export interface Publico {
    id: string;
    nome: string;
    uso: string;
    comValor?: boolean;
    filtrar: (p: Pessoa, hoje: string) => boolean;
}

const futuroOuSemData = (p: Pessoa, hoje: string) => !p.dataEvento || p.dataEvento >= hoje;

// Fechado e a unica etapa que se exclui dos anuncios: o resto ainda pode fechar.
export const PUBLICOS: Publico[] = [
    {
        id: 'fechados',
        nome: 'Leads fechados',
        uso: 'EXCLUIR de todas as campanhas: já contrataram. Também é a melhor base para um público SEMELHANTE, porque leva o valor do contrato e a Meta procura pessoas parecidas com quem fechou.',
        comValor: true,
        filtrar: p => p.status === ETAPA.fechado,
    },
    {
        id: 'alto-padrao',
        nome: 'Alto padrão',
        uso: 'Base para um público SEMELHANTE de alto padrão: os leads com a etiqueta Alto padrão (fechados ou não). A Meta precisa reconhecer pelo menos 100 pessoas, então junte uns 150 a 200 marcados antes de criar o semelhante.',
        filtrar: p => p.altoPadrao,
    },
    {
        id: 'todos',
        nome: 'Todos os leads (sem os fechados)',
        uso: 'REMARKETING para voltar a fechar e base para um SEMELHANTE mais amplo (pessoas parecidas com quem procura o ateliê). Não entram os fechados.',
        filtrar: p => p.status !== ETAPA.fechado,
    },
    {
        id: 'atendimento',
        nome: 'Em atendimento',
        uso: 'REMARKETING de quem está conversando com a Thai agora (Novo Lead até Aguardando Sinal): reforço com fotos de eventos enquanto decidem.',
        filtrar: p => !!p.status && ETAPAS_ATIVAS.includes(p.status),
    },
    {
        id: 'quentes',
        nome: 'Receberam orçamento',
        uso: 'REMARKETING: viram o orçamento e ainda vão casar. Bom para anúncios com depoimentos e fotos de eventos.',
        filtrar: (p, hoje) => [ETAPA.orcamento, ETAPA.negociando, ETAPA.sinal].includes(p.status as any) && futuroOuSemData(p, hoje),
    },
    {
        id: 'recuperar',
        nome: 'Para recuperar',
        uso: 'REMARKETING: sumiram ou não fecharam, mas o casamento ainda não aconteceu. Fica de fora quem fechou com outro fornecedor.',
        filtrar: (p, hoje) => [ETAPA.semResposta, ETAPA.perdido].includes(p.status as any)
            && futuroOuSemData(p, hoje) && p.motivoPerda !== 'Fechou com outro fornecedor',
    },
    {
        id: 'passou',
        nome: 'Casamento já passou',
        uso: 'Opcional: leads que não fecharam e já casaram. Dá para excluir se a campanha for só de casamento.',
        filtrar: (p, hoje) => p.status !== ETAPA.fechado && !!p.dataEvento && p.dataEvento < hoje,
    },
];

// ---------- Normalizacao no formato da Meta ----------

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export function normalizarEmail(email: string | null | undefined): string | null {
    let e = (email || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!e) return null;
    e = e.replace(/\.con$/, '.com').replace(/\.com\.$/, '.com');
    return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(e) ? e : null;
}

// Celular com DDI e DDD, so numeros: 5571999998888
export function normalizarTelefone(telefone: string | null | undefined): string | null {
    return telefoneWhatsApp(telefone);
}

const so = (s: string) => semAcento(s).toLowerCase().replace(/[^a-z]/g, '');

// "Ana Beatriz Santos e Pedro" -> fn ana, ln santos (so a primeira pessoa do casal)
export function separarNome(nome: string): { fn: string; ln: string } {
    const primeiraPessoa = (nome || '').split(/\s+(?:e|&)\s+|\s*&\s*|\|/i)[0];
    const partes = primeiraPessoa.split(/\s+/).map(so).filter(p => p.length > 1 || /^[a-z]$/.test(p)).filter(Boolean);
    if (!partes.length) return { fn: '', ln: '' };
    return { fn: partes[0], ln: partes.length > 1 ? partes[partes.length - 1] : '' };
}

export const normalizarCidade = (c: string | null) => (c ? so(c) : '');
export const normalizarUf = (uf: string | null) => (uf && /^[a-z]{2}$/i.test(uf.trim()) ? uf.trim().toLowerCase() : '');

// ---------- Montagem da lista ----------

export interface Linha {
    chaves: string[];
    email: string;
    phone: string;
    fn: string;
    ln: string;
    ct: string;
    st: string;
    country: string;
    value: number;
}

export interface ResultadoLista {
    linhas: Linha[];
    total: number;           // pessoas no publico
    semContato: number;      // sem telefone nem e-mail validos (ficam de fora)
    juntados: number;        // repetidos que viraram uma linha so
    jaEnviados: number;      // ja estavam numa exportacao anterior deste publico
}

export function montarLista(pessoas: Pessoa[], jaEnviadas: Set<string> = new Set()): ResultadoLista {
    const linhas: Linha[] = [];
    const porTelefone = new Map<string, Linha>();
    const porEmail = new Map<string, Linha>();
    let semContato = 0;
    let juntados = 0;
    let jaEnviados = 0;

    for (const p of pessoas) {
        if (jaEnviadas.has(p.chave)) { jaEnviados++; continue; }
        const phone = normalizarTelefone(p.telefone);
        const email = normalizarEmail(p.email);
        if (!phone && !email) { semContato++; continue; }

        const existente = (phone && porTelefone.get(phone)) || (email && porEmail.get(email));
        if (existente) {
            juntados++;
            existente.chaves.push(p.chave);
            if (!existente.phone && phone) { existente.phone = phone; porTelefone.set(phone, existente); }
            if (!existente.email && email) { existente.email = email; porEmail.set(email, existente); }
            existente.value = Math.max(existente.value, p.valor);
            continue;
        }

        const { fn, ln } = separarNome(p.nome);
        const linha: Linha = {
            chaves: [p.chave],
            email: email || '',
            phone: phone || '',
            fn,
            ln,
            ct: normalizarCidade(p.cidade),
            st: normalizarUf(p.uf),
            country: 'br',
            value: p.valor,
        };
        linhas.push(linha);
        if (phone) porTelefone.set(phone, linha);
        if (email) porEmail.set(email, linha);
    }

    return { linhas, total: pessoas.length, semContato, juntados, jaEnviados };
}

const celula = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function gerarCsv(linhas: Linha[], comValor: boolean): string {
    const cabecalho = ['email', 'phone', 'fn', 'ln', 'ct', 'st', 'country', ...(comValor ? ['value'] : [])];
    const corpo = linhas.map(l => [
        l.email, l.phone, l.fn, l.ln, l.ct, l.st, l.country, ...(comValor ? [l.value.toFixed(2)] : []),
    ].map(celula).join(','));
    return [cabecalho.join(','), ...corpo].join('\n') + '\n';
}

export function nomeArquivo(publico: string, hoje: string): string {
    const base = semAcento(publico).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `meta-${base || 'publico'}-${hoje}.csv`;
}

// ---------- Leitura do banco ----------

const cidadeDe = (c: any) => ({
    cidade: c?.nome ?? null,
    uf: c?.estados?.sigla ?? null,
});

export async function carregarPessoas(): Promise<Pessoa[]> {
    // So leads: a lista de clientes esta desatualizada. Quem fechou e o lead em Fechado.
    const [leads, eventos] = await Promise.all([
        supabase.from('leads').select('id, name, phone, email, status, event_date, services, source, motivo_perda, alto_padrao, cidades(nome, estados(sigla))'),
        supabase.from('eventos').select('lead_id, valor_previsto, status').not('lead_id', 'is', null),
    ]);
    const erro = leads.error || eventos.error;
    if (erro) throw new Error('Não foi possível carregar os leads: ' + erro.message);

    // Valor do contrato: soma dos eventos nao cancelados do lead
    const valorLead = new Map<string, number>();
    for (const e of (eventos.data || []) as any[]) {
        if (e.status === 'Cancelado') continue;
        valorLead.set(e.lead_id, (valorLead.get(e.lead_id) || 0) + (Number(e.valor_previsto) || 0));
    }

    return ((leads.data || []) as any[]).map(l => ({
        chave: `lead:${l.id}`,
        tipo: 'lead',
        nome: l.name || '',
        telefone: l.phone,
        email: l.email,
        ...cidadeDe(l.cidades),
        status: l.status,
        dataEvento: l.event_date,
        servicos: l.services || [],
        origem: l.source,
        motivoPerda: l.motivo_perda,
        valor: valorLead.get(l.id) || 0,
        altoPadrao: !!l.alto_padrao,
    }));
}

export interface Exportacao {
    id: string;
    publico: string;
    quantidade: number;
    pessoas: string[];
    criado_em: string;
}

export async function carregarHistorico(): Promise<Exportacao[]> {
    const { data, error } = await supabase
        .from('exportacoes_publico')
        .select('id, publico, quantidade, pessoas, criado_em')
        .order('criado_em', { ascending: false })
        .limit(200);
    if (error) throw new Error('Não foi possível carregar o histórico: ' + error.message);
    return (data || []) as Exportacao[];
}

export async function registrarExportacao(publico: string, linhas: Linha[]): Promise<void> {
    const { error } = await supabase.from('exportacoes_publico').insert({
        publico,
        quantidade: linhas.length,
        pessoas: linhas.flatMap(l => l.chaves),
    });
    if (error) throw new Error('O arquivo foi baixado, mas o histórico não foi salvo: ' + error.message);
}
