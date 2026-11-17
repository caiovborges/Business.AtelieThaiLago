// Planejamento do evento: custos previstos, valor do contrato e despesas lancadas.
// A conta (resumir) nao toca no banco; carregar e salvar sao o unico caminho ate ele.
// Termos em GLOSSARY.md.
import { supabase } from './supabaseClient';

export interface CustoPrevisto {
    categoria_id: number | null;
    descricao: string;
    valor: number;
}

export interface Despesa {
    categoria_id: number | null;
    valor: number;
}

export interface Categoria {
    id: number;
    nome: string;
}

export interface LinhaCategoria {
    categoriaId: number | null;
    nome: string;
    previsto: number;
    realizado: number;
    // realizado - previsto: positivo quer dizer que gastou mais que o previsto
    diferenca: number;
}

export interface Resumo {
    contrato: number;
    // Base das margens: o maior entre contrato e recebido (ver GLOSSARY.md)
    receita: number;
    previsto: number;
    realizado: number;
    recebido: number;
    equipe: number;
    margemPrevista: number;
    margemReal: number;
    // Em % da receita; null sem receita
    percentualPrevisto: number | null;
    percentualReal: number | null;
    porCategoria: LinhaCategoria[];
}

interface Entrada {
    contrato: number;
    custos: CustoPrevisto[];
    despesas: Despesa[];
    recebido: number;
    categorias: Categoria[];
}

// Nomes das categorias de despesa usadas pelo planejamento (os mesmos da migracao).
export const CATEGORIA_EQUIPE = 'Assistentes';
export const SEM_CATEGORIA = 'Sem categoria';

// A conta e feita em centavos para a soma fechar exata.
const centavos = (valor: number) => Math.round((Number(valor) || 0) * 100);
const reais = (c: number) => c / 100;
const percentual = (parte: number, total: number) =>
    total > 0 ? Math.round((parte / total) * 1000) / 10 : null;

export function resumir({ contrato, custos, despesas, recebido, categorias }: Entrada): Resumo {
    const nomes = new Map(categorias.map(c => [c.id, c.nome]));
    const nomeDe = (id: number | null) => (id !== null && nomes.get(id)) || SEM_CATEGORIA;

    // Junta pelo nome: categoria apagada ou sem categoria caem na mesma linha
    const linhas = new Map<string, { categoriaId: number | null; previsto: number; realizado: number }>();
    const linha = (id: number | null) => {
        const nome = nomeDe(id);
        if (!linhas.has(nome)) linhas.set(nome, { categoriaId: nome === SEM_CATEGORIA ? null : id, previsto: 0, realizado: 0 });
        return linhas.get(nome)!;
    };
    custos.forEach(c => { linha(c.categoria_id).previsto += centavos(c.valor); });
    despesas.forEach(d => { linha(d.categoria_id).realizado += centavos(d.valor); });

    const porCategoria: LinhaCategoria[] = [...linhas.entries()]
        .map(([nome, l]) => ({
            categoriaId: l.categoriaId,
            nome,
            previsto: reais(l.previsto),
            realizado: reais(l.realizado),
            diferenca: reais(l.realizado - l.previsto),
        }))
        .sort((a, b) => (a.nome === SEM_CATEGORIA ? 1 : b.nome === SEM_CATEGORIA ? -1 : a.nome.localeCompare(b.nome, 'pt-BR')));

    const contratoC = centavos(contrato);
    const recebidoC = centavos(recebido);
    // Evento sem contrato preenchido, ou que recebeu extras, usa o que entrou de fato
    const receitaC = Math.max(contratoC, recebidoC);
    const previstoC = custos.reduce((s, c) => s + centavos(c.valor), 0);
    const realizadoC = despesas.reduce((s, d) => s + centavos(d.valor), 0);
    const equipeC = custos.filter(c => nomeDe(c.categoria_id) === CATEGORIA_EQUIPE).reduce((s, c) => s + centavos(c.valor), 0);

    return {
        contrato: reais(contratoC),
        receita: reais(receitaC),
        previsto: reais(previstoC),
        realizado: reais(realizadoC),
        recebido: reais(recebidoC),
        equipe: reais(equipeC),
        margemPrevista: reais(receitaC - previstoC),
        margemReal: reais(receitaC - realizadoC),
        percentualPrevisto: percentual(receitaC - previstoC, receitaC),
        percentualReal: percentual(receitaC - realizadoC, receitaC),
        porCategoria,
    };
}

// Nomes ja usados na equipe, para sugerir ao digitar e nao criar a mesma pessoa duas vezes.
export function nomesDaEquipe(custos: CustoPrevisto[], categorias: Categoria[]): string[] {
    const equipe = categorias.find(c => c.nome === CATEGORIA_EQUIPE);
    if (!equipe) return [];
    const vistos = new Map<string, string>();
    custos
        .filter(c => c.categoria_id === equipe.id)
        .forEach(c => {
            const nome = c.descricao.trim();
            const chave = nome.toLocaleLowerCase('pt-BR');
            if (nome && !vistos.has(chave)) vistos.set(chave, nome);
        });
    return [...vistos.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

export interface Plano {
    evento: { id: string; nome: string; status: string; data_evento: string | null; valor_previsto: number | null };
    custos: CustoPrevisto[];
    despesas: Despesa[];
    recebido: number;
    categorias: Categoria[];
}

export async function carregarPlano(eventoId: string): Promise<Plano> {
    const [evento, custos, transacoes, categorias] = await Promise.all([
        supabase.from('eventos').select('id, nome, status, data_evento, valor_previsto').eq('id', eventoId).single(),
        supabase.from('custos_previstos').select('categoria_id, descricao, valor').eq('evento_id', eventoId).order('created_at'),
        supabase.from('transacoes').select('tipo, categoria_id, valor').eq('evento_id', eventoId),
        supabase.from('categorias').select('id, nome').eq('tipo', 'despesa').order('nome'),
    ]);
    const falha = evento.error || custos.error || transacoes.error || categorias.error;
    if (falha) throw new Error('Não foi possível carregar o planejamento: ' + falha.message);

    const lista = (transacoes.data || []) as { tipo: string; categoria_id: number | null; valor: number }[];
    return {
        evento: evento.data,
        custos: (custos.data || []).map(c => ({ ...c, valor: Number(c.valor) })),
        despesas: lista.filter(t => t.tipo === 'despesa').map(t => ({ categoria_id: t.categoria_id, valor: Number(t.valor) })),
        recebido: lista.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0),
        categorias: (categorias.data || []) as Categoria[],
    };
}

// Troca todos os custos previstos do evento de uma vez (funcao salvar_custos_previstos no banco).
export async function salvarCustos(eventoId: string, custos: CustoPrevisto[]): Promise<void> {
    const { error } = await supabase.rpc('salvar_custos_previstos', {
        p_evento_id: eventoId,
        p_custos: custos.map(c => ({ categoria_id: c.categoria_id, descricao: c.descricao.trim(), valor: c.valor })),
    });
    if (error) throw new Error('Não foi possível salvar o planejamento: ' + error.message);
}
