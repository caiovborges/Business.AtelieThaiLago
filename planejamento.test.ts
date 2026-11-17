import { describe, expect, it, vi } from 'vitest';

// A conta nao usa o banco; o cliente do Supabase fica de fora do teste.
vi.mock('./supabaseClient', () => ({ supabase: {} }));

import { Categoria, CustoPrevisto, Despesa, SEM_CATEGORIA, nomesDaEquipe, resumir } from './planejamento';

const ASSISTENTES = 1, MATERIAIS = 2, DESLOCAMENTO = 3, OPERACIONAIS = 4;
const categorias: Categoria[] = [
    { id: ASSISTENTES, nome: 'Assistentes' },
    { id: MATERIAIS, nome: 'Custos materiais' },
    { id: DESLOCAMENTO, nome: 'Deslocamento' },
    { id: OPERACIONAIS, nome: 'Custos operacionais' },
];

const custos: CustoPrevisto[] = [
    { categoria_id: ASSISTENTES, descricao: 'Ana', valor: 300 },
    { categoria_id: ASSISTENTES, descricao: 'Bia', valor: 300 },
    { categoria_id: MATERIAIS, descricao: 'Tintas', valor: 150.1 },
    { categoria_id: DESLOCAMENTO, descricao: 'Uber', valor: 80 },
];

const base = { contrato: 5000, custos, despesas: [] as Despesa[], recebido: 0, categorias };

describe('resumir', () => {
    it('calcula a margem prevista a partir do contrato e dos custos', () => {
        const r = resumir(base);
        expect(r.previsto).toBe(830.1);
        expect(r.margemPrevista).toBe(4169.9);
        expect(r.percentualPrevisto).toBe(83.4);
        expect(r.equipe).toBe(600);
    });

    it('sem despesas lancadas, a margem real e o contrato inteiro', () => {
        const r = resumir(base);
        expect(r.realizado).toBe(0);
        expect(r.margemReal).toBe(5000);
    });

    it('compara previsto e realizado por categoria', () => {
        const r = resumir({
            ...base,
            despesas: [
                { categoria_id: ASSISTENTES, valor: 700 },
                { categoria_id: MATERIAIS, valor: 100 },
            ],
        });
        const linha = (nome: string) => r.porCategoria.find(l => l.nome === nome)!;
        expect(linha('Assistentes')).toMatchObject({ previsto: 600, realizado: 700, diferenca: 100 });
        expect(linha('Custos materiais')).toMatchObject({ previsto: 150.1, realizado: 100, diferenca: -50.1 });
        expect(linha('Deslocamento')).toMatchObject({ previsto: 80, realizado: 0, diferenca: -80 });
        expect(r.margemReal).toBe(4200);
    });

    it('mostra a categoria que so tem gasto, sem previsto', () => {
        const r = resumir({ ...base, despesas: [{ categoria_id: OPERACIONAIS, valor: 45.9 }] });
        expect(r.porCategoria.find(l => l.nome === 'Custos operacionais')).toMatchObject({ previsto: 0, realizado: 45.9, diferenca: 45.9 });
    });

    it('junta despesa sem categoria e de categoria apagada em "Sem categoria", por ultimo', () => {
        const r = resumir({
            ...base,
            despesas: [{ categoria_id: null, valor: 10 }, { categoria_id: 999, valor: 5 }],
        });
        const ultima = r.porCategoria[r.porCategoria.length - 1];
        expect(ultima).toMatchObject({ nome: SEM_CATEGORIA, categoriaId: null, realizado: 15 });
        expect(r.realizado).toBe(15);
    });

    it('nao perde centavos ao somar muitos valores quebrados', () => {
        const r = resumir({
            ...base,
            custos: Array.from({ length: 10 }, () => ({ categoria_id: MATERIAIS, descricao: 'x', valor: 0.1 })),
        });
        expect(r.previsto).toBe(1);
    });

    it('sem contrato e sem recebido, nao calcula percentual', () => {
        const r = resumir({ ...base, contrato: 0 });
        expect(r.percentualPrevisto).toBeNull();
        expect(r.margemPrevista).toBe(-830.1);
    });

    it('recebido menor que o contrato aparece a parte e nao muda a margem', () => {
        const r = resumir({ ...base, recebido: 2500 });
        expect(r.recebido).toBe(2500);
        expect(r.receita).toBe(5000);
        expect(r.margemReal).toBe(5000);
    });

    it('evento sem contrato usa o que foi recebido (caso Mariana e Marcos)', () => {
        const r = resumir({
            ...base,
            contrato: 0,
            custos: [],
            recebido: 8082.9,
            despesas: [{ categoria_id: MATERIAIS, valor: 5495.9 }],
        });
        expect(r.receita).toBe(8082.9);
        expect(r.margemReal).toBe(2587);
        expect(r.percentualReal).toBe(32);
    });

    it('recebido acima do contrato (extras) entra na margem', () => {
        const r = resumir({ ...base, contrato: 3500, custos: [], recebido: 3550, despesas: [{ categoria_id: null, valor: 309.39 }] });
        expect(r.contrato).toBe(3500);
        expect(r.receita).toBe(3550);
        expect(r.margemReal).toBe(3240.61);
    });
});

describe('nomesDaEquipe', () => {
    it('sugere cada pessoa uma vez, ignorando maiusculas e espacos', () => {
        const lista: CustoPrevisto[] = [
            { categoria_id: ASSISTENTES, descricao: 'Bia', valor: 1 },
            { categoria_id: ASSISTENTES, descricao: ' ana ', valor: 1 },
            { categoria_id: ASSISTENTES, descricao: 'Ana', valor: 1 },
            { categoria_id: MATERIAIS, descricao: 'Tintas', valor: 1 },
        ];
        expect(nomesDaEquipe(lista, categorias)).toEqual(['ana', 'Bia']);
    });
});
