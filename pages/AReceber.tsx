import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { ReceberParcelaModal } from '../components/ParcelaModais';
import { CategoriaLancamento, dataLocal } from '../lancamentos';
import { CAMPOS_PARCELA, Parcela, formatarDia, organizarAbertas, situacaoDoEvento, somaParcelas } from '../parcelas';
import { formatarReais } from '../valores';

interface EventoResumo {
    id: string;
    nome: string;
    data_evento: string | null;
    status: string;
    valor_previsto: number | null;
}

interface Pendencia {
    evento: EventoResumo;
    texto: string;
}

const AReceber = () => {
    const [parcelas, setParcelas] = useState<Parcela[]>([]);
    const [eventos, setEventos] = useState<EventoResumo[]>([]);
    const [recebidoPorEvento, setRecebidoPorEvento] = useState<Record<string, number>>({});
    const [categorias, setCategorias] = useState<CategoriaLancamento[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState('');
    const [aviso, setAviso] = useState('');
    const [recebendo, setRecebendo] = useState<Parcela | null>(null);

    const carregar = async () => {
        const [parcelasRes, eventosRes, receitasRes, categoriasRes] = await Promise.all([
            supabase.from('parcelas').select(CAMPOS_PARCELA).is('transacao_id', null).order('vencimento', { ascending: true }),
            supabase.from('eventos').select('id, nome, data_evento, status, valor_previsto').neq('status', 'Cancelado'),
            supabase.from('transacoes').select('evento_id, valor').eq('tipo', 'receita').not('evento_id', 'is', null),
            supabase.from('categorias').select('*').order('nome'),
        ]);
        const falha = parcelasRes.error || eventosRes.error || receitasRes.error || categoriasRes.error;
        setErro(falha ? 'Não foi possível carregar os valores a receber: ' + falha.message : '');
        if (parcelasRes.data) setParcelas(parcelasRes.data as unknown as Parcela[]);
        if (eventosRes.data) setEventos(eventosRes.data as EventoResumo[]);
        if (categoriasRes.data) setCategorias(categoriasRes.data as CategoriaLancamento[]);
        if (receitasRes.data) {
            const somas: Record<string, number> = {};
            for (const r of receitasRes.data as { evento_id: string; valor: number }[]) {
                somas[r.evento_id] = (somas[r.evento_id] || 0) + Number(r.valor);
            }
            setRecebidoPorEvento(somas);
        }
        setCarregando(false);
    };

    useEffect(() => { carregar(); }, []);

    if (carregando) {
        return (
            <div className="flex-1 flex items-center justify-center bg-background-light">
                <span className="animate-spin material-symbols-outlined text-4xl text-primary">progress_activity</span>
            </div>
        );
    }

    const hoje = dataLocal();
    const eventoDe = (id: string) => eventos.find(e => e.id === id);
    // Parcela de evento cancelado nao conta mais como valor a receber
    const abertas = parcelas.filter(p => eventoDe(p.evento_id));
    const { atrasadas, esteMes, depois } = organizarAbertas(abertas, hoje);

    const pendencias: Pendencia[] = eventos.flatMap(evento => {
        const contrato = Number(evento.valor_previsto) || 0;
        const recebido = recebidoPorEvento[evento.id] || 0;
        const aberto = somaParcelas(abertas.filter(p => p.evento_id === evento.id));
        const futuro = !!evento.data_evento && evento.data_evento >= hoje;
        if (contrato <= 0) return futuro ? [{ evento, texto: 'Sem valor de contrato' }] : [];
        const { semParcela } = situacaoDoEvento(contrato, recebido, aberto);
        return semParcela > 0 ? [{ evento, texto: `${formatarReais(semParcela)} sem parcela combinada` }] : [];
    }).sort((a, b) => (a.evento.data_evento || '').localeCompare(b.evento.data_evento || ''));

    const Cartao = ({ titulo, valor, cor }: { titulo: string; valor: number; cor: string }) => (
        <div className="bg-white border-2 border-secondary p-4 shadow-hard-sm">
            <p className="font-mono text-xs text-gray-500 uppercase tracking-wider">{titulo}</p>
            <p className={`font-mono text-2xl font-bold mt-1 ${cor}`}>{formatarReais(valor)}</p>
        </div>
    );

    const grupo = (titulo: string, lista: Parcela[], cor: string) => lista.length > 0 && (
        <section className="flex flex-col gap-2">
            <h2 className={`font-display font-bold uppercase tracking-wider text-sm ${cor}`}>{titulo} ({lista.length})</h2>
            {lista.map(p => {
                const evento = eventoDe(p.evento_id);
                return (
                    <div key={p.id} className="bg-white border-2 border-secondary p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                            <Link to={`/events/${p.evento_id}`} className="font-display font-bold text-secondary hover:text-primary break-words">{evento?.nome}</Link>
                            <p className="text-sm text-gray-600 break-words">{p.descricao}</p>
                            <p className={`text-xs font-mono ${p.vencimento < hoje ? 'font-bold text-accent-error' : 'text-gray-500'}`}>
                                {p.vencimento < hoje ? 'Atrasada desde' : 'Vence em'} {formatarDia(p.vencimento)}
                            </p>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                            <span className="font-mono font-bold">{formatarReais(Number(p.valor))}</span>
                            <button
                                type="button"
                                onClick={() => { setAviso(''); setRecebendo(p); }}
                                className="h-11 px-4 bg-primary text-white border-2 border-secondary rounded-sm flex items-center gap-1 text-xs font-bold uppercase"
                            >
                                <span className="material-symbols-outlined text-[18px]">payments</span>
                                Recebi
                            </button>
                        </div>
                    </div>
                );
            })}
        </section>
    );

    return (
        <div className="flex-1 overflow-y-auto bg-background-light p-4 md:p-8">
            <div className="max-w-5xl mx-auto flex flex-col gap-4 md:gap-6">
                <header>
                    <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight text-secondary">A Receber</h1>
                    <p className="mt-2 text-sm text-gray-600">Parcelas combinadas com os casais. Ao clicar em Recebi, a receita entra sozinha no financeiro.</p>
                </header>

                {erro && <p className="p-3 bg-accent-error/10 border-2 border-accent-error text-accent-error text-sm font-medium">{erro}</p>}
                {aviso && <p className="p-3 bg-accent-success/10 border-2 border-accent-success text-accent-success text-sm font-medium">{aviso}</p>}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Cartao titulo="Atrasado" valor={somaParcelas(atrasadas)} cor={atrasadas.length > 0 ? 'text-accent-error' : 'text-secondary'} />
                    <Cartao titulo="Vence este mês" valor={somaParcelas(esteMes)} cor="text-secondary" />
                    <Cartao titulo="Total a receber" valor={somaParcelas(abertas)} cor="text-accent-success" />
                </div>

                {abertas.length === 0 && !erro && (
                    <p className="p-6 text-center text-sm text-gray-500 bg-white border-2 border-secondary/20">Nenhuma parcela em aberto.</p>
                )}

                {grupo('Atrasadas', atrasadas, 'text-accent-error')}
                {grupo('Este mês', esteMes, 'text-primary')}
                {grupo('Próximos meses', depois, 'text-gray-600')}

                {pendencias.length > 0 && (
                    <section className="flex flex-col gap-2">
                        <h2 className="font-display font-bold uppercase tracking-wider text-sm text-amber-700">Falta definir ({pendencias.length})</h2>
                        {pendencias.map(({ evento, texto }) => (
                            <Link key={evento.id} to={`/events/${evento.id}`} className="bg-white border-2 border-secondary/30 hover:border-secondary p-3 flex flex-wrap items-center justify-between gap-2">
                                <span className="min-w-0">
                                    <span className="font-display font-bold text-secondary break-words">{evento.nome}</span>
                                    {evento.data_evento && <span className="ml-2 text-xs font-mono text-gray-500">{formatarDia(evento.data_evento)}</span>}
                                </span>
                                <span className="text-sm font-medium text-amber-700">{texto}</span>
                            </Link>
                        ))}
                    </section>
                )}
            </div>

            <ReceberParcelaModal
                parcela={recebendo}
                nomeEvento={recebendo ? eventoDe(recebendo.evento_id)?.nome : undefined}
                categorias={categorias}
                onClose={() => setRecebendo(null)}
                onSalvo={(mensagem) => { setAviso(mensagem); carregar(); }}
            />
        </div>
    );
};

export default AReceber;
