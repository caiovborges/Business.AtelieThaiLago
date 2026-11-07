// Contas fixas: o que falta confirmar em cada mes e sugestoes tiradas do historico.
import { supabase } from './supabaseClient';
import { dataLocal } from './lancamentos';
import { somarMeses } from './parcelas';

export interface ContaFixa {
    id: string;
    descricao: string;
    valor: number;
    dia_vencimento: number;
    categoria_id: number | null;
    inicio: string;
    ativa: boolean;
}

export interface MesResolvido {
    conta_id: string;
    mes: string;
    transacao_id: string | null;
    transacoes?: { valor: number; data: string | null } | null;
}

export interface Pendencia {
    conta: ContaFixa;
    mes: string;
    vencimento: string;
}

export interface SugestaoConta {
    descricao: string;
    valor: number;
    dia_vencimento: number;
    categoria_id: number | null;
    meses: number;
    inicio: string;
}

export const primeiroDoMes = (data: string) => `${data.slice(0, 7)}-01`;

// O dia de vencimento nao passa do ultimo dia do mes.
export function vencimentoNoMes(mes: string, dia: number): string {
    const [a, m] = mes.split('-').map(Number);
    const ultimo = new Date(a, m, 0).getDate();
    return `${mes.slice(0, 8)}${String(Math.min(dia, ultimo)).padStart(2, '0')}`;
}

export function mesesAte(inicio: string, fim: string): string[] {
    const meses: string[] = [];
    for (let mes = primeiroDoMes(inicio); mes <= fim; mes = somarMeses(mes, 1)) meses.push(mes);
    return meses;
}

// Do inicio da conta ate o mes atual, tudo que ainda nao foi resolvido. Mais antigo primeiro.
export function pendenciasDasContas(contas: ContaFixa[], resolvidos: MesResolvido[], hoje: string = dataLocal()): Pendencia[] {
    const feitos = new Set(resolvidos.map(r => `${r.conta_id}|${r.mes}`));
    const mesAtual = primeiroDoMes(hoje);
    return contas
        .filter(c => c.ativa)
        .flatMap(conta => mesesAte(conta.inicio, mesAtual)
            .filter(mes => !feitos.has(`${conta.id}|${mes}`))
            .map(mes => ({ conta, mes, vencimento: vencimentoNoMes(mes, conta.dia_vencimento) })))
        .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.conta.descricao.localeCompare(b.conta.descricao));
}

// Mes passado usa o vencimento; o mes atual usa o dia em que a Thai confirmou.
export function dataDoPagamento(p: Pick<Pendencia, 'mes' | 'vencimento'>, hoje: string = dataLocal()): string {
    return p.mes < primeiroDoMes(hoje) ? p.vencimento : hoje;
}

const normalizar = (texto: string) => texto.trim().toLowerCase();

export const MESES_PARA_SUGERIR = 3;
const JANELA_DE_MESES = 6;

// Despesas gerais com a mesma descricao em pelo menos 3 dos ultimos 6 meses.
export function sugerirContas(
    lancamentos: { descricao: string; valor: number; data: string | null; categoria_id: number | null }[],
    contas: { descricao: string }[],
    hoje: string = dataLocal(),
): SugestaoConta[] {
    const mesAtual = primeiroDoMes(hoje);
    const desde = somarMeses(mesAtual, -JANELA_DE_MESES);
    const cadastradas = new Set(contas.map(c => normalizar(c.descricao)));
    const grupos = new Map<string, typeof lancamentos>();
    for (const l of lancamentos) {
        if (!l.data || l.data < desde || l.data > hoje) continue;
        const chave = normalizar(l.descricao);
        if (cadastradas.has(chave)) continue;
        grupos.set(chave, [...(grupos.get(chave) || []), l]);
    }
    return [...grupos.values()].flatMap(lista => {
        const meses = new Set(lista.map(l => l.data!.slice(0, 7)));
        if (meses.size < MESES_PARA_SUGERIR) return [];
        const ultimo = [...lista].sort((a, b) => b.data!.localeCompare(a.data!))[0];
        return [{
            descricao: ultimo.descricao.trim(),
            valor: Number(ultimo.valor),
            dia_vencimento: Number(ultimo.data!.slice(8, 10)),
            categoria_id: ultimo.categoria_id,
            meses: meses.size,
            // Se ja foi lancada neste mes, a conta comeca no seguinte para nao duplicar
            inicio: meses.has(mesAtual.slice(0, 7)) ? somarMeses(mesAtual, 1) : mesAtual,
        }];
    }).sort((a, b) => b.meses - a.meses || a.descricao.localeCompare(b.descricao));
}

export async function pagarConta(p: Pendencia, valor: number, data: string): Promise<void> {
    const { error } = await supabase.rpc('pagar_conta_fixa', {
        p_conta_id: p.conta.id,
        p_mes: p.mes,
        p_data: data,
        p_valor: valor,
    });
    if (error) {
        throw new Error(error.code === '23505'
            ? 'Este mês já foi resolvido.'
            : 'Não foi possível confirmar o pagamento. Nada foi alterado: ' + error.message);
    }
}

export async function marcarSemConta(p: Pendencia): Promise<void> {
    const { error } = await supabase.from('contas_fixas_meses').insert({ conta_id: p.conta.id, mes: p.mes, transacao_id: null });
    if (error) {
        throw new Error(error.code === '23505'
            ? 'Este mês já foi resolvido.'
            : 'Não foi possível marcar o mês. Nada foi alterado: ' + error.message);
    }
}

export function erroDaConta(dados: { descricao: string; valor: number; dia: number }): string {
    if (!dados.descricao.trim()) return 'Informe a descrição.';
    if (!(dados.valor > 0)) return 'Informe um valor maior que zero.';
    if (!Number.isInteger(dados.dia) || dados.dia < 1 || dados.dia > 31) return 'Informe um dia de 1 a 31.';
    return '';
}
