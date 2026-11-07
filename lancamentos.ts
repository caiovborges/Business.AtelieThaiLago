// Lancamentos do financeiro: salvar, excluir e filtrar por periodo.
import { supabase } from './supabaseClient';
import { formatarReais } from './valores';

export type TipoLancamento = 'receita' | 'despesa';

export interface CategoriaLancamento {
    id: number;
    nome: string;
    tipo: TipoLancamento;
}

export interface Lancamento {
    id: string;
    tipo: TipoLancamento;
    descricao: string;
    valor: number;
    data: string | null;
    evento_id?: string | null;
    categoria_id: number | null;
}

export interface DadosLancamento {
    tipo: TipoLancamento;
    descricao: string;
    valor: number;
    data: string;
    evento_id: string | null;
    categoria_id: number | null;
}

export function dataLocal(data: Date = new Date()): string {
    const mes = String(data.getMonth() + 1).padStart(2, '0');
    const dia = String(data.getDate()).padStart(2, '0');
    return `${data.getFullYear()}-${mes}-${dia}`;
}

export function erroDoLancamento(dados: DadosLancamento): string {
    if (!dados.data) return 'Informe a data.';
    if (!dados.descricao.trim()) return 'Informe a descrição.';
    if (!(dados.valor > 0)) return 'Informe um valor maior que zero.';
    return '';
}

// Sem permissao o banco nao devolve erro, so nao altera nada: por isso confere a linha.
export async function salvarLancamento(id: string | null, dados: DadosLancamento, usuarioId: string): Promise<void> {
    const campos = { ...dados, descricao: dados.descricao.trim() };
    const { data, error } = id
        ? await supabase.from('transacoes').update(campos).eq('id', id).select('id')
        : await supabase.from('transacoes').insert({ ...campos, user_id: usuarioId }).select('id');
    if (error) throw new Error('Não foi possível salvar o lançamento. Nada foi alterado: ' + error.message);
    if (!data || data.length === 0) throw new Error('Não foi possível salvar o lançamento. Ele pode ter sido excluído ou sua conta não tem permissão.');
}

// Devolve false se a pessoa desistiu de excluir.
export async function excluirLancamento(lancamento: Pick<Lancamento, 'id' | 'descricao' | 'valor'>): Promise<boolean> {
    const texto = `Excluir "${lancamento.descricao}" de ${formatarReais(Number(lancamento.valor))}? Esta ação não pode ser desfeita.`;
    if (!window.confirm(texto)) return false;
    const { data, error } = await supabase.from('transacoes').delete().eq('id', lancamento.id).select('id');
    if (error) throw new Error('Não foi possível excluir o lançamento. Nada foi alterado: ' + error.message);
    if (!data || data.length === 0) throw new Error('Não foi possível excluir o lançamento. Ele pode já ter sido excluído ou sua conta não tem permissão.');
    return true;
}

export interface Intervalo {
    de: string;
    ate: string;
}

export const PERIODO_TODOS = 'todos';
export const PERIODO_DATAS = 'datas';

const ultimoDia = (ano: number, mes: number) => dataLocal(new Date(ano, mes + 1, 0));
const intervaloDoMes = (ano: number, mes: number): Intervalo => ({ de: dataLocal(new Date(ano, mes, 1)), ate: ultimoDia(ano, mes) });

// Periodo: "todos", "este_mes", "mes_passado", "este_ano", "datas" ou um mes "AAAA-MM".
export function intervaloDoPeriodo(periodo: string, de: string, ate: string, agora: Date = new Date()): Intervalo | null {
    const ano = agora.getFullYear();
    const mes = agora.getMonth();
    if (periodo === 'este_mes') return intervaloDoMes(ano, mes);
    if (periodo === 'mes_passado') return intervaloDoMes(mes === 0 ? ano - 1 : ano, mes === 0 ? 11 : mes - 1);
    if (periodo === 'este_ano') return { de: `${ano}-01-01`, ate: `${ano}-12-31` };
    if (periodo === PERIODO_DATAS) {
        if (!de && !ate) return null;
        // Datas invertidas valem como o mesmo intervalo
        if (de && ate && de > ate) return { de: ate, ate: de };
        return { de, ate };
    }
    if (/^\d{4}-\d{2}$/.test(periodo)) {
        const [a, m] = periodo.split('-').map(Number);
        return intervaloDoMes(a, m - 1);
    }
    return null;
}

export function dentroDoIntervalo(data: string | null | undefined, intervalo: Intervalo | null): boolean {
    if (!intervalo) return true;
    if (!data) return false;
    if (intervalo.de && data < intervalo.de) return false;
    if (intervalo.ate && data > intervalo.ate) return false;
    return true;
}

export function mesesComLancamento(lancamentos: { data: string | null }[]): string[] {
    const meses = new Set<string>();
    for (const l of lancamentos) {
        if (l.data) meses.add(l.data.slice(0, 7));
    }
    return [...meses].sort().reverse();
}

export function nomeDoMes(mes: string): string {
    const [a, m] = mes.split('-').map(Number);
    const nome = new Date(a, m - 1, 15).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return nome.charAt(0).toUpperCase() + nome.slice(1);
}
