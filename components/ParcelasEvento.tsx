import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { EditarParcelaModal, GerarParcelasModal, ReceberParcelaModal } from './ParcelaModais';
import { CategoriaLancamento, dataLocal, excluirLancamento } from '../lancamentos';
import { CAMPOS_PARCELA, Parcela, formatarDia, situacaoDoEvento, somaParcelas } from '../parcelas';
import { formatarReais, parseValor } from '../valores';

interface ParcelasEventoProps {
    eventoId: string;
    eventoNome: string;
    servico?: string | string[] | null;
    recebido: number;
    categorias: CategoriaLancamento[];
    // Avisa a tela do evento quando uma receita foi criada ou excluida
    onReceitasMudaram: () => void;
}

const botao = 'h-10 px-3 border-2 border-secondary rounded-sm flex items-center justify-center gap-1 text-xs font-bold uppercase disabled:opacity-50';

const ParcelasEvento = ({ eventoId, eventoNome, servico, recebido, categorias, onReceitasMudaram }: ParcelasEventoProps) => {
    const [parcelas, setParcelas] = useState<Parcela[]>([]);
    const [contrato, setContrato] = useState(0);
    const [editandoContrato, setEditandoContrato] = useState(false);
    const [textoContrato, setTextoContrato] = useState('');
    const [carregando, setCarregando] = useState(true);
    const [salvandoContrato, setSalvandoContrato] = useState(false);
    const [erro, setErro] = useState('');
    const [aviso, setAviso] = useState('');
    const [gerando, setGerando] = useState(false);
    const [recebendo, setRecebendo] = useState<Parcela | null>(null);
    const [edicao, setEdicao] = useState<{ parcela: Parcela | null } | null>(null);

    const carregar = async () => {
        const [lista, evento] = await Promise.all([
            supabase.from('parcelas').select(CAMPOS_PARCELA).eq('evento_id', eventoId).order('vencimento', { ascending: true }),
            supabase.from('eventos').select('valor_previsto').eq('id', eventoId).maybeSingle(),
        ]);
        const falha = lista.error || evento.error;
        if (falha) setErro('Não foi possível carregar as parcelas: ' + falha.message);
        if (lista.data) setParcelas(lista.data as unknown as Parcela[]);
        if (evento.data) setContrato(Number(evento.data.valor_previsto) || 0);
        setCarregando(false);
    };

    useEffect(() => { carregar(); }, [eventoId, recebido]);

    const abertas = parcelas.filter(p => !p.transacao_id);
    const recebidas = parcelas.filter(p => p.transacao_id);
    const { falta, semParcela } = situacaoDoEvento(contrato, recebido, somaParcelas(abertas));
    const hoje = dataLocal();

    const salvarContrato = async (e: React.FormEvent) => {
        e.preventDefault();
        setErro('');
        setSalvandoContrato(true);
        const valor = parseValor(textoContrato);
        const { data, error } = await supabase.from('eventos').update({ valor_previsto: valor }).eq('id', eventoId).select('id');
        setSalvandoContrato(false);
        if (error || !data || data.length === 0) {
            setErro('Não foi possível salvar o valor do contrato. ' + (error?.message ?? ''));
            return;
        }
        setContrato(valor);
        setEditandoContrato(false);
    };

    const excluir = async (parcela: Parcela) => {
        if (!window.confirm(`Excluir "${parcela.descricao}" de ${formatarReais(Number(parcela.valor))}? Esta ação não pode ser desfeita.`)) return;
        setErro('');
        setAviso('');
        const { data, error } = await supabase.from('parcelas').delete().eq('id', parcela.id).select('id');
        if (error || !data || data.length === 0) {
            setErro('Não foi possível excluir a parcela. ' + (error?.message ?? ''));
            return;
        }
        setAviso('Parcela excluída.');
        carregar();
    };

    const desfazer = async (parcela: Parcela) => {
        setErro('');
        setAviso('');
        try {
            const excluida = await excluirLancamento({
                id: parcela.transacao_id!,
                descricao: `recebimento de ${parcela.descricao}`,
                valor: Number(parcela.transacoes?.valor ?? parcela.valor),
            });
            if (excluida) onReceitasMudaram();
        } catch (falha: any) {
            setErro(falha.message);
        }
    };

    const concluir = (mensagem: string) => {
        setAviso(mensagem);
        setErro('');
        carregar();
    };

    if (carregando) {
        return <div className="flex justify-center py-4"><span className="animate-spin material-symbols-outlined text-3xl text-primary">progress_activity</span></div>;
    }

    return (
        <section className="bg-white border-2 border-secondary p-4 flex flex-col gap-3" aria-label="Contrato e parcelas">
            <h3 className="font-display font-bold uppercase tracking-wide text-secondary">Contrato e parcelas</h3>

            {erro && <p className="p-2 bg-red-50 border-l-4 border-accent-error text-accent-error font-bold text-sm">{erro}</p>}
            {aviso && <p className="p-2 bg-accent-success/10 border-l-4 border-accent-success text-accent-success font-bold text-sm">{aviso}</p>}

            <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                    <dt className="text-xs font-bold uppercase tracking-wider text-gray-500">Contrato</dt>
                    <dd className="mt-0.5 font-mono font-bold text-secondary">
                        {editandoContrato ? (
                            <form onSubmit={salvarContrato} className="flex items-center gap-1">
                                <input aria-label="Valor do contrato" autoFocus inputMode="decimal" className="w-24 border-2 border-secondary p-1 text-sm text-right" value={textoContrato} onChange={e => setTextoContrato(e.target.value)} />
                                <button type="submit" disabled={salvandoContrato} aria-label="Salvar valor do contrato" className="p-1 text-accent-success"><span className="material-symbols-outlined text-[18px]">check</span></button>
                                <button type="button" onClick={() => setEditandoContrato(false)} aria-label="Cancelar" className="p-1 text-gray-500"><span className="material-symbols-outlined text-[18px]">close</span></button>
                            </form>
                        ) : (
                            <button
                                type="button"
                                onClick={() => { setTextoContrato(contrato > 0 ? contrato.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''); setEditandoContrato(true); }}
                                className="flex items-center gap-1 hover:text-primary"
                                aria-label="Editar valor do contrato"
                            >
                                {contrato > 0 ? formatarReais(contrato) : <span className="text-amber-700">Informar valor</span>}
                                <span className="material-symbols-outlined text-[16px] text-gray-500">edit</span>
                            </button>
                        )}
                    </dd>
                </div>
                <div>
                    <dt className="text-xs font-bold uppercase tracking-wider text-gray-500">Recebido</dt>
                    <dd className="mt-0.5 font-mono font-bold text-accent-success">{formatarReais(recebido)}</dd>
                </div>
                <div>
                    <dt className="text-xs font-bold uppercase tracking-wider text-gray-500">Falta receber</dt>
                    <dd className="mt-0.5 font-mono font-bold text-secondary">{contrato > 0 ? formatarReais(falta) : 'Sem contrato'}</dd>
                </div>
            </dl>

            {semParcela > 0 && (
                <p className="text-sm font-medium text-amber-700">{formatarReais(semParcela)} ainda sem parcela combinada.</p>
            )}

            {abertas.length > 0 && (
                <ul className="flex flex-col divide-y divide-gray-200 border-t border-gray-200">
                    {abertas.map(p => (
                        <li key={p.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-secondary break-words">{p.descricao}</p>
                                <p className={`text-xs font-mono ${p.vencimento < hoje ? 'font-bold text-accent-error' : 'text-gray-500'}`}>
                                    {p.vencimento < hoje ? 'Atrasada desde' : 'Vence em'} {formatarDia(p.vencimento)}
                                </p>
                            </div>
                            <div className="flex items-center gap-1">
                                <span className="font-mono font-bold text-sm mr-1">{formatarReais(Number(p.valor))}</span>
                                <button type="button" onClick={() => { setAviso(''); setRecebendo(p); }} className={`${botao} bg-primary text-white`}>
                                    <span className="material-symbols-outlined text-[16px]">payments</span>
                                    Recebi
                                </button>
                                <button type="button" onClick={() => { setAviso(''); setEdicao({ parcela: p }); }} aria-label={`Editar ${p.descricao}`} title="Editar" className="p-1 text-gray-500 hover:text-primary">
                                    <span className="material-symbols-outlined text-[18px]">edit</span>
                                </button>
                                <button type="button" onClick={() => excluir(p)} aria-label={`Excluir ${p.descricao}`} title="Excluir" className="p-1 text-gray-500 hover:text-accent-error">
                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {recebidas.length > 0 && (
                <details>
                    <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-gray-500">Parcelas recebidas ({recebidas.length})</summary>
                    <ul className="mt-2 flex flex-col divide-y divide-gray-200">
                        {recebidas.map(p => (
                            <li key={p.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-sm text-secondary break-words">{p.descricao}</p>
                                    <p className="text-xs font-mono text-gray-500">Recebida em {formatarDia(p.transacoes?.data)}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold text-sm text-accent-success">{formatarReais(Number(p.transacoes?.valor ?? p.valor))}</span>
                                    <button type="button" onClick={() => desfazer(p)} className="text-xs font-bold uppercase text-gray-500 hover:text-accent-error">Desfazer</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </details>
            )}

            <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { setAviso(''); setGerando(true); }} className={`${botao} bg-white text-secondary hover:bg-gray-50`}>
                    <span className="material-symbols-outlined text-[16px]">calculate</span>
                    Gerar parcelas
                </button>
                <button type="button" onClick={() => { setAviso(''); setEdicao({ parcela: null }); }} className={`${botao} bg-white text-secondary hover:bg-gray-50`}>
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    Adicionar parcela
                </button>
            </div>

            <GerarParcelasModal aberto={gerando} eventoId={eventoId} falta={semParcela} servico={servico} categorias={categorias} onClose={() => setGerando(false)} onSalvo={concluir} />
            <EditarParcelaModal aberto={!!edicao} parcela={edicao?.parcela ?? null} eventoId={eventoId} categorias={categorias} onClose={() => setEdicao(null)} onSalvo={concluir} />
            <ReceberParcelaModal parcela={recebendo} nomeEvento={eventoNome} categorias={categorias} onClose={() => setRecebendo(null)} onSalvo={() => onReceitasMudaram()} />
        </section>
    );
};

export default ParcelasEvento;
