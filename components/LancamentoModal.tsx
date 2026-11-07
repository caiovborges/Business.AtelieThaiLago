import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';
import { parseValor } from '../valores';
import { CategoriaLancamento, Lancamento, TipoLancamento, dataLocal, erroDoLancamento, salvarLancamento } from '../lancamentos';

interface EventoOpcao {
    id: string;
    nome: string;
    data_evento: string | null;
}

interface LancamentoModalProps {
    aberto: boolean;
    // Sem lancamento, a janela cria um novo
    lancamento: Lancamento | null;
    categorias: CategoriaLancamento[];
    // Na tela de um evento o vinculo e fixo e o seletor nao aparece
    eventoFixoId?: string;
    onClose: () => void;
    onSalvo: (mensagem: string) => void;
}

const valorParaCampo = (valor: number) =>
    Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const LancamentoModal = ({ aberto, lancamento, categorias, eventoFixoId, onClose, onSalvo }: LancamentoModalProps) => {
    const { user } = useAuth();
    const [tipo, setTipo] = useState<TipoLancamento>('receita');
    const [data, setData] = useState('');
    const [descricao, setDescricao] = useState('');
    const [categoriaId, setCategoriaId] = useState('');
    const [valor, setValor] = useState('');
    const [eventoId, setEventoId] = useState('');
    const [eventos, setEventos] = useState<EventoOpcao[]>([]);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    useEffect(() => {
        if (!aberto) return;
        setTipo(lancamento?.tipo ?? 'receita');
        setData(lancamento?.data ?? dataLocal());
        setDescricao(lancamento?.descricao ?? '');
        setCategoriaId(lancamento?.categoria_id ? String(lancamento.categoria_id) : '');
        setValor(lancamento ? valorParaCampo(lancamento.valor) : '');
        setEventoId(eventoFixoId ?? lancamento?.evento_id ?? '');
        setErro('');
    }, [aberto, lancamento?.id, eventoFixoId]);

    useEffect(() => {
        if (!aberto || eventoFixoId) return;
        let atual = true;
        supabase
            .from('eventos')
            .select('id, nome, data_evento')
            .order('data_evento', { ascending: false, nullsFirst: false })
            .then(({ data: lista, error }) => {
                if (!atual) return;
                if (error) setErro('Não foi possível carregar os eventos: ' + error.message);
                else setEventos((lista ?? []) as EventoOpcao[]);
            });
        return () => { atual = false; };
    }, [aberto, eventoFixoId]);

    if (!aberto) return null;

    const trocarTipo = (novo: TipoLancamento) => {
        if (novo === tipo) return;
        setTipo(novo);
        // A categoria de um tipo nao vale para o outro
        setCategoriaId('');
    };

    const opcoesCategoria = categorias.filter(c => c.tipo === tipo || String(c.id) === categoriaId);

    const salvar = async (e: React.FormEvent) => {
        e.preventDefault();
        const dados = {
            tipo,
            data,
            descricao,
            valor: parseValor(valor),
            categoria_id: categoriaId ? Number(categoriaId) : null,
            evento_id: eventoId || null,
        };
        const invalido = erroDoLancamento(dados);
        if (invalido) {
            setErro(invalido);
            return;
        }
        setErro('');
        setSalvando(true);
        try {
            await salvarLancamento(lancamento?.id ?? null, dados, user!.id);
            onSalvo(lancamento ? 'Lançamento atualizado.' : 'Lançamento criado.');
            onClose();
        } catch (falha: any) {
            setErro(falha.message);
        } finally {
            setSalvando(false);
        }
    };

    const estiloInput = 'w-full bg-surface border-2 border-secondary p-2.5 font-mono text-sm focus:border-primary outline-none';
    const estiloRotulo = 'block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1';
    const estiloTipo = (opcao: TipoLancamento) => {
        if (opcao !== tipo) return 'bg-white text-gray-500 border-gray-200';
        return opcao === 'receita'
            ? 'bg-accent-success/10 text-accent-success border-accent-success'
            : 'bg-accent-error/10 text-accent-error border-accent-error';
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-secondary" onClick={e => e.stopPropagation()}>
                <header className="bg-secondary p-4 flex justify-between items-center sticky top-0 z-10 gap-4">
                    <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider">
                        {lancamento ? 'Editar lançamento' : 'Novo lançamento'}
                    </h2>
                    <button type="button" onClick={onClose} aria-label="Fechar janela" className="text-white hover:text-primary transition-colors">
                        <span className="material-symbols-outlined text-2xl">close</span>
                    </button>
                </header>

                <form onSubmit={salvar} className="p-4 md:p-6 flex flex-col gap-4">
                    {erro && <div className="bg-red-50 border-l-4 border-accent-error p-3 text-accent-error font-bold text-sm">{erro}</div>}

                    <fieldset className="grid grid-cols-2 gap-2">
                        <legend className="sr-only">Tipo de lançamento</legend>
                        {(['receita', 'despesa'] as TipoLancamento[]).map(opcao => (
                            <label key={opcao} className={`h-11 flex items-center justify-center gap-1 border-2 cursor-pointer text-sm font-bold uppercase tracking-wider ${estiloTipo(opcao)}`}>
                                <input type="radio" name="lancamento-tipo" className="sr-only" checked={tipo === opcao} onChange={() => trocarTipo(opcao)} />
                                <span className="material-symbols-outlined text-[18px]">{opcao === 'receita' ? 'arrow_upward' : 'arrow_downward'}</span>
                                {opcao === 'receita' ? 'Receita' : 'Despesa'}
                            </label>
                        ))}
                    </fieldset>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="lancamento-data" className={estiloRotulo}>Data</label>
                            <input id="lancamento-data" type="date" className={estiloInput} value={data} onChange={e => setData(e.target.value)} />
                        </div>
                        <div>
                            <label htmlFor="lancamento-valor" className={estiloRotulo}>Valor (R$)</label>
                            <input id="lancamento-valor" type="text" inputMode="decimal" placeholder="0,00" className={`${estiloInput} text-right`} value={valor} onChange={e => setValor(e.target.value)} />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="lancamento-descricao" className={estiloRotulo}>Descrição</label>
                        <input id="lancamento-descricao" type="text" className={estiloInput} value={descricao} onChange={e => setDescricao(e.target.value)} />
                    </div>

                    <div>
                        <label htmlFor="lancamento-categoria" className={estiloRotulo}>Categoria</label>
                        <select id="lancamento-categoria" className={estiloInput} value={categoriaId} onChange={e => setCategoriaId(e.target.value)}>
                            <option value="">Sem categoria</option>
                            {opcoesCategoria.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                    </div>

                    {!eventoFixoId && (
                        <div>
                            <label htmlFor="lancamento-evento" className={estiloRotulo}>Evento</label>
                            <select id="lancamento-evento" className={estiloInput} value={eventoId} onChange={e => setEventoId(e.target.value)}>
                                <option value="">Geral, sem evento</option>
                                {eventoId && !eventos.some(ev => ev.id === eventoId) && <option value={eventoId}>Evento atual</option>}
                                {eventos.map(ev => (
                                    <option key={ev.id} value={ev.id}>
                                        {ev.nome}{ev.data_evento ? ` (${new Date(ev.data_evento + 'T12:00:00').toLocaleDateString('pt-BR')})` : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <button type="submit" disabled={salvando}
                        className="h-12 bg-primary text-white font-display font-bold uppercase tracking-wider border-2 border-secondary shadow-hard flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        <span className={`material-symbols-outlined text-[20px] ${salvando ? 'animate-spin' : ''}`}>{salvando ? 'progress_activity' : 'check'}</span>
                        Salvar
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LancamentoModal;
