import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';

interface Categoria {
    id: number;
    nome: string;
    tipo: 'receita' | 'despesa';
}

interface Transacao {
    id: string;
    tipo: 'receita' | 'despesa';
    descricao: string;
    valor: number;
    data: string | null;
    evento_id: string | null;
    categoria_id: number | null;
    created_at: string;
    categorias?: { nome: string } | null;
    eventos?: { nome: string } | null;
}

type SortField = 'data' | 'descricao' | 'tipo' | 'categoria' | 'valor' | 'evento';
type SortDir = 'asc' | 'desc';

const Financeiro = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [transacoes, setTransacoes] = useState<Transacao[]>([]);
    const [categorias, setCategorias] = useState<Categoria[]>([]);
    const [loading, setLoading] = useState(true);

    // Filters
    const [filterTipo, setFilterTipo] = useState<'' | 'receita' | 'despesa'>('');
    const [filterCatId, setFilterCatId] = useState('');
    const [filterSearch, setFilterSearch] = useState('');
    const [filterVinculo, setFilterVinculo] = useState<'' | 'evento' | 'geral'>('');

    // Sort
    const [sortField, setSortField] = useState<SortField>('data');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    const fetchData = async () => {
        setLoading(true);
        const [transRes, catRes] = await Promise.all([
            supabase
                .from('transacoes')
                .select('*, categorias(nome), eventos(nome)')
                .order('data', { ascending: false, nullsFirst: true }),
            supabase.from('categorias').select('*').order('nome'),
        ]);
        if (transRes.data) setTransacoes(transRes.data as any);
        if (catRes.data) setCategorias(catRes.data as any);
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, []);

    const handleDelete = async (id: string) => {
        if (!confirm('Excluir esta transação?')) return;
        await supabase.from('transacoes').delete().eq('id', id);
        await fetchData();
    };

    // Filter
    const filtered = transacoes.filter(t => {
        if (filterTipo && t.tipo !== filterTipo) return false;
        if (filterCatId && String(t.categoria_id) !== filterCatId) return false;
        if (filterVinculo === 'evento' && !t.evento_id) return false;
        if (filterVinculo === 'geral' && t.evento_id) return false;
        if (filterSearch) {
            const s = filterSearch.toLowerCase();
            const matchDesc = t.descricao.toLowerCase().includes(s);
            const matchCat = (t.categorias?.nome || '').toLowerCase().includes(s);
            const matchEvt = (t.eventos?.nome || '').toLowerCase().includes(s);
            if (!matchDesc && !matchCat && !matchEvt) return false;
        }
        return true;
    });

    // Sort
    const sorted = [...filtered].sort((a, b) => {
        let cmp = 0;
        switch (sortField) {
            case 'data':
                cmp = (a.data || '').localeCompare(b.data || '');
                break;
            case 'descricao':
                cmp = a.descricao.localeCompare(b.descricao);
                break;
            case 'tipo':
                cmp = a.tipo.localeCompare(b.tipo);
                break;
            case 'categoria':
                cmp = (a.categorias?.nome || '').localeCompare(b.categorias?.nome || '');
                break;
            case 'valor':
                cmp = Number(a.valor) - Number(b.valor);
                break;
            case 'evento':
                cmp = (a.eventos?.nome || 'zzz').localeCompare(b.eventos?.nome || 'zzz');
                break;
        }
        return sortDir === 'asc' ? cmp : -cmp;
    });

    const toggleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('asc');
        }
    };

    const totalReceita = filtered.filter(t => t.tipo === 'receita').reduce((s, t) => s + Number(t.valor), 0);
    const totalDespesa = filtered.filter(t => t.tipo === 'despesa').reduce((s, t) => s + Number(t.valor), 0);
    const saldo = totalReceita - totalDespesa;

    const formatDate = (dateStr: string | null): string => {
        if (!dateStr) return '\u2014';
        const d = new Date(dateStr + 'T12:00:00');
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const SortIcon = ({ field }: { field: SortField }) => (
        <span className={`material-symbols-outlined text-[14px] ml-1 transition-transform ${sortField === field ? 'text-primary' : 'text-gray-300'} ${sortField === field && sortDir === 'desc' ? 'rotate-180' : ''}`}>
            arrow_upward
        </span>
    );

    const clearFilters = () => {
        setFilterTipo('');
        setFilterCatId('');
        setFilterSearch('');
        setFilterVinculo('');
    };
    const hasFilters = filterTipo || filterCatId || filterSearch || filterVinculo;

    return (
        <div className="flex-1 flex flex-col h-screen overflow-hidden bg-background-light">
            <header className="px-8 py-8 md:py-10 flex flex-col md:flex-row md:items-center justify-between gap-6 border-b-2 border-secondary/5 bg-background-light/50 backdrop-blur-sm sticky top-0 z-20">
                <div className="flex flex-col gap-1">
                    <h2 className="text-4xl font-black text-secondary tracking-tight font-display">Financeiro</h2>
                    <p className="text-gray-500 font-medium max-w-lg">Visão completa de todas as entradas e saídas do ateliê.</p>
                </div>
            </header>

            {/* Summary Cards */}
            <div className="px-8 pt-6 grid grid-cols-3 gap-4">
                <div className="bg-white border-2 border-secondary p-4 shadow-hard-sm">
                    <p className="font-mono text-xs text-gray-400 uppercase tracking-wider">Receita</p>
                    <p className="font-mono text-2xl font-bold text-accent-success mt-1">
                        R$ {totalReceita.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="font-mono text-xs text-gray-400 mt-1">{filtered.filter(t => t.tipo === 'receita').length} itens</p>
                </div>
                <div className="bg-white border-2 border-secondary p-4 shadow-hard-sm">
                    <p className="font-mono text-xs text-gray-400 uppercase tracking-wider">Despesa</p>
                    <p className="font-mono text-2xl font-bold text-accent-error mt-1">
                        R$ {totalDespesa.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="font-mono text-xs text-gray-400 mt-1">{filtered.filter(t => t.tipo === 'despesa').length} itens</p>
                </div>
                <div className="bg-white border-2 border-secondary p-4 shadow-hard-sm">
                    <p className="font-mono text-xs text-gray-400 uppercase tracking-wider">Saldo</p>
                    <p className={`font-mono text-2xl font-bold mt-1 ${saldo >= 0 ? 'text-accent-success' : 'text-accent-error'}`}>
                        R$ {saldo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                    <p className="font-mono text-xs text-gray-400 mt-1">{filtered.length} total</p>
                </div>
            </div>

            {/* Filters */}
            <div className="px-8 pt-4 flex flex-wrap items-center gap-3">
                <div className="relative grow md:grow-0">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-[18px]">search</span>
                    <input
                        className="w-full md:w-56 pl-9 pr-4 py-2 bg-white border-2 border-secondary focus:border-primary focus:ring-0 rounded-sm font-mono text-sm placeholder-gray-400"
                        placeholder="Buscar..."
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                    />
                </div>

                <select
                    className="bg-white border-2 border-secondary px-3 py-2 font-mono text-sm focus:border-primary focus:ring-0 rounded-sm appearance-none cursor-pointer"
                    value={filterTipo}
                    onChange={(e) => setFilterTipo(e.target.value as '' | 'receita' | 'despesa')}
                >
                    <option value="">Todos os Tipos</option>
                    <option value="receita">Receita</option>
                    <option value="despesa">Despesa</option>
                </select>

                <select
                    className="bg-white border-2 border-secondary px-3 py-2 font-mono text-sm focus:border-primary focus:ring-0 rounded-sm appearance-none cursor-pointer"
                    value={filterCatId}
                    onChange={(e) => setFilterCatId(e.target.value)}
                >
                    <option value="">Todas Categorias</option>
                    {categorias.map(c => (
                        <option key={c.id} value={c.id}>{c.nome} ({c.tipo})</option>
                    ))}
                </select>

                <select
                    className="bg-white border-2 border-secondary px-3 py-2 font-mono text-sm focus:border-primary focus:ring-0 rounded-sm appearance-none cursor-pointer"
                    value={filterVinculo}
                    onChange={(e) => setFilterVinculo(e.target.value as '' | 'evento' | 'geral')}
                >
                    <option value="">Todos os Vínculos</option>
                    <option value="evento">Com Evento</option>
                    <option value="geral">Sem Evento (Geral)</option>
                </select>

                {hasFilters && (
                    <button
                        onClick={clearFilters}
                        className="flex items-center gap-1 text-xs font-mono text-gray-500 hover:text-primary transition-colors"
                    >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                        Limpar filtros
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto px-8 pt-4 pb-8">
                {loading ? (
                    <div className="flex items-center justify-center py-20">
                        <span className="animate-spin material-symbols-outlined text-4xl text-primary">progress_activity</span>
                    </div>
                ) : sorted.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-400">
                        <span className="material-symbols-outlined text-5xl mb-3">receipt_long</span>
                        <p className="font-display text-lg font-bold text-secondary">Nenhuma transação encontrada</p>
                        <p className="font-mono text-sm mt-1">Tente ajustar os filtros ou adicione novas transações.</p>
                    </div>
                ) : (
                    <table className="w-full border-collapse">
                        <thead className="sticky top-0 z-10 bg-background-light">
                            <tr className="border-b-2 border-secondary">
                                <th className="text-left p-3 cursor-pointer select-none" onClick={() => toggleSort('data')}>
                                    <span className="font-display text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center">
                                        Data <SortIcon field="data" />
                                    </span>
                                </th>
                                <th className="text-left p-3 cursor-pointer select-none" onClick={() => toggleSort('tipo')}>
                                    <span className="font-display text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center">
                                        Tipo <SortIcon field="tipo" />
                                    </span>
                                </th>
                                <th className="text-left p-3 cursor-pointer select-none" onClick={() => toggleSort('descricao')}>
                                    <span className="font-display text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center">
                                        Descrição <SortIcon field="descricao" />
                                    </span>
                                </th>
                                <th className="text-left p-3 cursor-pointer select-none" onClick={() => toggleSort('categoria')}>
                                    <span className="font-display text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center">
                                        Categoria <SortIcon field="categoria" />
                                    </span>
                                </th>
                                <th className="text-left p-3 cursor-pointer select-none" onClick={() => toggleSort('evento')}>
                                    <span className="font-display text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center">
                                        Evento <SortIcon field="evento" />
                                    </span>
                                </th>
                                <th className="text-right p-3 cursor-pointer select-none" onClick={() => toggleSort('valor')}>
                                    <span className="font-display text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center justify-end">
                                        Valor <SortIcon field="valor" />
                                    </span>
                                </th>
                                <th className="w-12 p-3"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map((t, i) => (
                                <tr
                                    key={t.id}
                                    className={`group border-b border-gray-200 hover:bg-white transition-colors ${i % 2 === 0 ? 'bg-gray-50/50' : ''}`}
                                >
                                    <td className="p-3 font-mono text-sm text-gray-600 whitespace-nowrap">{formatDate(t.data)}</td>
                                    <td className="p-3">
                                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-bold uppercase tracking-wider border rounded-sm ${t.tipo === 'receita'
                                            ? 'bg-accent-success/10 text-accent-success border-accent-success/30'
                                            : 'bg-accent-error/10 text-accent-error border-accent-error/30'
                                            }`}>
                                            <span className="material-symbols-outlined text-[12px]">{t.tipo === 'receita' ? 'arrow_upward' : 'arrow_downward'}</span>
                                            {t.tipo === 'receita' ? 'Entrada' : 'Saída'}
                                        </span>
                                    </td>
                                    <td className="p-3 font-body text-sm text-secondary max-w-[200px] truncate">{t.descricao}</td>
                                    <td className="p-3">
                                        {t.categorias ? (
                                            <span className="font-mono text-xs text-gray-500 flex items-center gap-1">
                                                <span className="material-symbols-outlined text-[12px]">label</span>
                                                {t.categorias.nome}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-gray-300">&mdash;</span>
                                        )}
                                    </td>
                                    <td className="p-3">
                                        {t.eventos ? (
                                            <button
                                                onClick={() => navigate(`/events/${t.evento_id}`)}
                                                className="font-mono text-xs text-primary hover:underline flex items-center gap-1"
                                            >
                                                <span className="material-symbols-outlined text-[12px]">event</span>
                                                {t.eventos.nome}
                                            </button>
                                        ) : (
                                            <span className="font-mono text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">GERAL</span>
                                        )}
                                    </td>
                                    <td className="p-3 text-right">
                                        <span className={`font-mono font-bold text-sm ${t.tipo === 'receita' ? 'text-accent-success' : 'text-accent-error'}`}>
                                            {t.tipo === 'receita' ? '+' : '-'} R$ {Number(t.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    </td>
                                    <td className="p-3">
                                        <button
                                            onClick={() => handleDelete(t.id)}
                                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-accent-error transition-all"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">delete</span>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default Financeiro;
