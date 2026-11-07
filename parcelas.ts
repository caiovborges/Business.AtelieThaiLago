// Parcelas a receber: montar o combinado, salvar, receber e somar.
import { supabase } from './supabaseClient';
import { parseValor } from './valores';

export interface Parcela {
    id: string;
    evento_id: string;
    descricao: string;
    valor: number;
    vencimento: string;
    categoria_id: number | null;
    transacao_id: string | null;
    transacoes?: { valor: number; data: string | null } | null;
    eventos?: { nome: string; status: string } | null;
}

export interface ParcelaMontada {
    descricao: string;
    valor: number;
    vencimento: string;
}

// Linha da tela: o valor fica como texto enquanto a pessoa digita.
export interface LinhaParcela {
    descricao: string;
    valor: string;
    vencimento: string;
}

export const MAX_PARCELAS = 36;
export const CAMPOS_PARCELA = 'id, evento_id, descricao, valor, vencimento, categoria_id, transacao_id, transacoes(valor, data)';

// Soma meses mantendo o dia; se o mes for mais curto, usa o ultimo dia dele.
export function somarMeses(data: string, meses: number): string {
    const [a, m, d] = data.split('-').map(Number);
    const ultimo = new Date(a, m - 1 + meses + 1, 0);
    const dia = Math.min(d, ultimo.getDate());
    return `${ultimo.getFullYear()}-${String(ultimo.getMonth() + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

interface Combinado {
    total: number;
    entrada: number;
    dataEntrada: string;
    quantidade: number;
    primeiroVencimento: string;
}

// Divide em centavos e deixa a diferenca na ultima parcela, para a soma fechar exata.
export function montarParcelas({ total, entrada, dataEntrada, quantidade, primeiroVencimento }: Combinado): ParcelaMontada[] {
    const parcelas: ParcelaMontada[] = [];
    const centavosEntrada = Math.round(Math.max(entrada, 0) * 100);
    if (centavosEntrada > 0) {
        parcelas.push({ descricao: 'Entrada', valor: centavosEntrada / 100, vencimento: dataEntrada });
    }
    const resto = Math.round(total * 100) - centavosEntrada;
    if (resto <= 0 || quantidade < 1) return parcelas;
    const base = Math.floor(resto / quantidade);
    for (let i = 0; i < quantidade; i++) {
        const centavos = i === quantidade - 1 ? resto - base * (quantidade - 1) : base;
        parcelas.push({
            descricao: quantidade === 1 ? 'Parcela única' : `Parcela ${i + 1} de ${quantidade}`,
            valor: centavos / 100,
            vencimento: somarMeses(primeiroVencimento, i),
        });
    }
    return parcelas;
}

export const paraLinha = (p: ParcelaMontada): LinhaParcela => ({
    descricao: p.descricao,
    valor: p.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    vencimento: p.vencimento,
});

export function somaDasLinhas(linhas: LinhaParcela[]): number {
    return Math.round(linhas.reduce((soma, l) => soma + parseValor(l.valor) * 100, 0)) / 100;
}

export function erroDasLinhas(linhas: LinhaParcela[]): string {
    if (linhas.length === 0) return 'Monte as parcelas antes de salvar.';
    if (linhas.length > MAX_PARCELAS + 1) return `Use no máximo ${MAX_PARCELAS} parcelas.`;
    for (const [i, l] of linhas.entries()) {
        const nome = l.descricao.trim() || `Linha ${i + 1}`;
        if (!l.descricao.trim()) return `Linha ${i + 1}: informe a descrição.`;
        if (!(parseValor(l.valor) > 0)) return `${nome}: informe um valor maior que zero.`;
        if (!l.vencimento) return `${nome}: informe o vencimento.`;
    }
    return '';
}

export async function salvarLinhas(eventoId: string, linhas: LinhaParcela[], categoriaId: number | null): Promise<void> {
    const { error } = await supabase.from('parcelas').insert(linhas.map(l => ({
        evento_id: eventoId,
        descricao: l.descricao.trim(),
        valor: parseValor(l.valor),
        vencimento: l.vencimento,
        categoria_id: categoriaId,
    })));
    if (error) throw new Error('Não foi possível salvar as parcelas. Nenhuma foi criada: ' + error.message);
}

export async function receberParcela(parcelaId: string, data: string, valor: number, categoriaId: number | null): Promise<void> {
    const { error } = await supabase.rpc('receber_parcela', {
        p_parcela_id: parcelaId,
        p_data: data,
        p_valor: valor,
        p_categoria_id: categoriaId,
    });
    if (error) {
        throw new Error(error.code === '23505'
            ? 'Esta parcela já foi recebida.'
            : 'Não foi possível registrar o recebimento. Nada foi alterado: ' + error.message);
    }
}

// Ligacao sugerida entre o servico do evento e a categoria de receita de mesmo nome.
export function categoriaDoServico<C extends { id: number; nome: string; tipo: string }>(
    categorias: C[],
    servico: string | string[] | null | undefined,
): number | null {
    const normalizar = (texto: string) => texto.trim().toLowerCase();
    const primeiro = (Array.isArray(servico) ? servico[0] : servico) || '';
    if (!primeiro) return null;
    return categorias.find(c => c.tipo === 'receita' && normalizar(c.nome) === normalizar(primeiro))?.id ?? null;
}

export interface SituacaoEvento {
    falta: number;
    aberto: number;
    semParcela: number;
}

// Falta: contrato menos o recebido. Sem parcela: a parte da falta que ainda nao tem data.
export function situacaoDoEvento(contrato: number, recebido: number, aberto: number): SituacaoEvento {
    const falta = Math.max(Math.round((contrato - recebido) * 100) / 100, 0);
    return { falta, aberto, semParcela: Math.max(Math.round((falta - aberto) * 100) / 100, 0) };
}

export function organizarAbertas<P extends { vencimento: string }>(parcelas: P[], hoje: string) {
    const fimDoMes = somarMeses(`${hoje.slice(0, 7)}-01`, 1);
    const ordenadas = [...parcelas].sort((a, b) => a.vencimento.localeCompare(b.vencimento));
    return {
        atrasadas: ordenadas.filter(p => p.vencimento < hoje),
        esteMes: ordenadas.filter(p => p.vencimento >= hoje && p.vencimento < fimDoMes),
        depois: ordenadas.filter(p => p.vencimento >= fimDoMes),
    };
}

export const somaParcelas = (parcelas: { valor: number }[]) =>
    Math.round(parcelas.reduce((soma, p) => soma + Number(p.valor) * 100, 0)) / 100;

export const formatarDia = (data: string | null | undefined) =>
    data ? new Date(data + 'T12:00:00').toLocaleDateString('pt-BR') : '';
