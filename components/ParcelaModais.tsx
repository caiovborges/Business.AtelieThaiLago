import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import EditorParcelas from './EditorParcelas';
import { CategoriaLancamento, dataLocal } from '../lancamentos';
import { LinhaParcela, Parcela, categoriaDoServico, erroDasLinhas, formatarDia, receberParcela, salvarLinhas } from '../parcelas';
import { formatarReais, parseValor } from '../valores';

const estiloInput = 'w-full bg-surface border-2 border-secondary p-2.5 font-mono text-sm focus:border-primary outline-none';
const estiloRotulo = 'block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1';
const estiloEnviar = 'h-12 bg-primary text-white font-display font-bold uppercase tracking-wider border-2 border-secondary shadow-hard flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';
const valorParaCampo = (valor: number) => valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const Janela = ({ titulo, subtitulo, largura = 'max-w-lg', onClose, children }: { titulo: string; subtitulo?: string; largura?: string; onClose: () => void; children: React.ReactNode }) => (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
        <div className={`bg-white w-full ${largura} max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-secondary`} onClick={e => e.stopPropagation()}>
            <header className="bg-secondary p-4 flex justify-between items-center sticky top-0 z-10 gap-4">
                <div className="min-w-0">
                    <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider">{titulo}</h2>
                    {subtitulo && <p className="text-sm text-white/70 truncate">{subtitulo}</p>}
                </div>
                <button type="button" onClick={onClose} aria-label="Fechar janela" className="text-white hover:text-primary transition-colors">
                    <span className="material-symbols-outlined text-2xl">close</span>
                </button>
            </header>
            {children}
        </div>
    </div>
);

const Erro = ({ texto }: { texto: string }) =>
    texto ? <div className="bg-red-50 border-l-4 border-accent-error p-3 text-accent-error font-bold text-sm">{texto}</div> : null;

interface ReceberProps {
    parcela: Parcela | null;
    nomeEvento?: string;
    categorias: CategoriaLancamento[];
    onClose: () => void;
    onSalvo: (mensagem: string) => void;
}

export const ReceberParcelaModal = ({ parcela, nomeEvento, categorias, onClose, onSalvo }: ReceberProps) => {
    const [data, setData] = useState('');
    const [valor, setValor] = useState('');
    const [categoriaId, setCategoriaId] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    useEffect(() => {
        if (!parcela) return;
        setData(dataLocal());
        setValor(valorParaCampo(Number(parcela.valor)));
        setCategoriaId(parcela.categoria_id ? String(parcela.categoria_id) : '');
        setErro('');
    }, [parcela?.id]);

    if (!parcela) return null;

    const salvar = async (e: React.FormEvent) => {
        e.preventDefault();
        const total = parseValor(valor);
        if (!data || !(total > 0)) {
            setErro('Informe a data e um valor maior que zero.');
            return;
        }
        setErro('');
        setSalvando(true);
        try {
            await receberParcela(parcela.id, data, total, categoriaId ? Number(categoriaId) : null);
            onSalvo(`${parcela.descricao}: ${formatarReais(total)} registrado no financeiro.`);
            onClose();
        } catch (falha: any) {
            setErro(falha.message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Janela titulo="Recebi" subtitulo={[parcela.descricao, nomeEvento].filter(Boolean).join(' - ')} onClose={onClose}>
            <form onSubmit={salvar} className="p-4 md:p-6 flex flex-col gap-4">
                <Erro texto={erro} />
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label htmlFor="receber-data" className={estiloRotulo}>Recebido em</label>
                        <input id="receber-data" type="date" className={estiloInput} value={data} onChange={e => setData(e.target.value)} />
                    </div>
                    <div>
                        <label htmlFor="receber-valor" className={estiloRotulo}>Valor (R$)</label>
                        <input id="receber-valor" inputMode="decimal" className={`${estiloInput} text-right`} value={valor} onChange={e => setValor(e.target.value)} />
                    </div>
                </div>
                <div>
                    <label htmlFor="receber-categoria" className={estiloRotulo}>Categoria</label>
                    <select id="receber-categoria" className={estiloInput} value={categoriaId} onChange={e => setCategoriaId(e.target.value)}>
                        <option value="">Sem categoria</option>
                        {categorias.filter(c => c.tipo === 'receita').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                </div>
                <p className="text-xs text-gray-500">Vencimento em {formatarDia(parcela.vencimento)}. A receita entra no financeiro deste evento.</p>
                <button type="submit" disabled={salvando} className={estiloEnviar}>
                    <span className={`material-symbols-outlined text-[20px] ${salvando ? 'animate-spin' : ''}`}>{salvando ? 'progress_activity' : 'check'}</span>
                    Confirmar recebimento
                </button>
            </form>
        </Janela>
    );
};

interface GerarProps {
    aberto: boolean;
    eventoId: string;
    falta: number;
    servico?: string | string[] | null;
    categorias: CategoriaLancamento[];
    onClose: () => void;
    onSalvo: (mensagem: string) => void;
}

export const GerarParcelasModal = ({ aberto, eventoId, falta, servico, categorias, onClose, onSalvo }: GerarProps) => {
    const [total, setTotal] = useState('');
    const [linhas, setLinhas] = useState<LinhaParcela[]>([]);
    const [categoriaId, setCategoriaId] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    useEffect(() => {
        if (!aberto) return;
        setTotal(falta > 0 ? valorParaCampo(falta) : '');
        setLinhas([]);
        const sugerida = categoriaDoServico(categorias, servico);
        setCategoriaId(sugerida ? String(sugerida) : '');
        setErro('');
    }, [aberto]);

    if (!aberto) return null;

    const salvar = async (e: React.FormEvent) => {
        e.preventDefault();
        const invalido = erroDasLinhas(linhas);
        if (invalido) {
            setErro(invalido);
            return;
        }
        setErro('');
        setSalvando(true);
        try {
            await salvarLinhas(eventoId, linhas, categoriaId ? Number(categoriaId) : null);
            onSalvo(linhas.length === 1 ? '1 parcela criada.' : `${linhas.length} parcelas criadas.`);
            onClose();
        } catch (falha: any) {
            setErro(falha.message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Janela titulo="Gerar parcelas" largura="max-w-2xl" onClose={onClose}>
            <form onSubmit={salvar} className="p-4 md:p-6 flex flex-col gap-4">
                <Erro texto={erro} />
                <div>
                    <label htmlFor="parcelas-total" className={estiloRotulo}>Valor a parcelar (R$)</label>
                    <input id="parcelas-total" inputMode="decimal" className={`${estiloInput} text-right`} value={total} onChange={e => setTotal(e.target.value)} placeholder="0,00" />
                </div>
                <EditorParcelas total={parseValor(total)} linhas={linhas} onLinhas={setLinhas} categorias={categorias} categoriaId={categoriaId} onCategoria={setCategoriaId} />
                <button type="submit" disabled={salvando || linhas.length === 0} className={estiloEnviar}>
                    <span className={`material-symbols-outlined text-[20px] ${salvando ? 'animate-spin' : ''}`}>{salvando ? 'progress_activity' : 'check'}</span>
                    Salvar parcelas
                </button>
            </form>
        </Janela>
    );
};

interface EditarProps {
    aberto: boolean;
    // Sem parcela, a janela adiciona uma nova ao evento
    parcela: Parcela | null;
    eventoId: string;
    categorias: CategoriaLancamento[];
    onClose: () => void;
    onSalvo: (mensagem: string) => void;
}

export const EditarParcelaModal = ({ aberto, parcela, eventoId, categorias, onClose, onSalvo }: EditarProps) => {
    const [descricao, setDescricao] = useState('');
    const [valor, setValor] = useState('');
    const [vencimento, setVencimento] = useState('');
    const [categoriaId, setCategoriaId] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    useEffect(() => {
        if (!aberto) return;
        setDescricao(parcela?.descricao ?? '');
        setValor(parcela ? valorParaCampo(Number(parcela.valor)) : '');
        setVencimento(parcela?.vencimento ?? '');
        setCategoriaId(parcela?.categoria_id ? String(parcela.categoria_id) : '');
        setErro('');
    }, [aberto, parcela?.id]);

    if (!aberto) return null;

    const salvar = async (e: React.FormEvent) => {
        e.preventDefault();
        const invalido = erroDasLinhas([{ descricao, valor, vencimento }]);
        if (invalido) {
            setErro(invalido);
            return;
        }
        setErro('');
        setSalvando(true);
        const categoria = categoriaId ? Number(categoriaId) : null;
        try {
            if (parcela) {
                const { data, error } = await supabase
                    .from('parcelas')
                    .update({ descricao: descricao.trim(), valor: parseValor(valor), vencimento, categoria_id: categoria })
                    .eq('id', parcela.id)
                    .select('id');
                if (error) throw new Error('Não foi possível salvar a parcela. Nada foi alterado: ' + error.message);
                if (!data || data.length === 0) throw new Error('Não foi possível salvar a parcela. Ela pode ter sido excluída.');
            } else {
                await salvarLinhas(eventoId, [{ descricao, valor, vencimento }], categoria);
            }
            onSalvo(parcela ? 'Parcela atualizada.' : 'Parcela adicionada.');
            onClose();
        } catch (falha: any) {
            setErro(falha.message);
        } finally {
            setSalvando(false);
        }
    };

    return (
        <Janela titulo={parcela ? 'Editar parcela' : 'Adicionar parcela'} onClose={onClose}>
            <form onSubmit={salvar} className="p-4 md:p-6 flex flex-col gap-4">
                <Erro texto={erro} />
                <div>
                    <label htmlFor="parcela-descricao" className={estiloRotulo}>Descrição</label>
                    <input id="parcela-descricao" className={estiloInput} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: Parcela 2" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label htmlFor="parcela-valor" className={estiloRotulo}>Valor (R$)</label>
                        <input id="parcela-valor" inputMode="decimal" className={`${estiloInput} text-right`} value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
                    </div>
                    <div>
                        <label htmlFor="parcela-vencimento" className={estiloRotulo}>Vencimento</label>
                        <input id="parcela-vencimento" type="date" className={estiloInput} value={vencimento} onChange={e => setVencimento(e.target.value)} />
                    </div>
                </div>
                <div>
                    <label htmlFor="parcela-categoria" className={estiloRotulo}>Categoria da receita</label>
                    <select id="parcela-categoria" className={estiloInput} value={categoriaId} onChange={e => setCategoriaId(e.target.value)}>
                        <option value="">Sem categoria</option>
                        {categorias.filter(c => c.tipo === 'receita').map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                </div>
                <button type="submit" disabled={salvando} className={estiloEnviar}>
                    <span className={`material-symbols-outlined text-[20px] ${salvando ? 'animate-spin' : ''}`}>{salvando ? 'progress_activity' : 'check'}</span>
                    Salvar
                </button>
            </form>
        </Janela>
    );
};
