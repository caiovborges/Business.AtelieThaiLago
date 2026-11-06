import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';
import AddLeadModal, { EditingLead, LeadFormData, PIPELINE_STAGES } from '../components/AddLeadModal';
import LeadFollowups from '../components/LeadFollowups';
import OrcamentoModal, { CAMPOS_ORCAMENTO, OrcamentoSalvo, itensComValor, rotuloQuantidade } from '../components/OrcamentoModal';
import ResultadoContatoModal, { AlvoResultado } from '../components/ResultadoContatoModal';
import { ChaveMensagem, FollowupResumo, LIMITE_TENTATIVAS, MENSAGENS, ROTULO_RESULTADO, dataDoContato, feitosEmOrdem, linkWhatsApp, montarMensagem, resumoContato, temOrcamentoLead } from '../leadContato';
import FecharLeadModal from '../components/FecharLeadModal';
import { abrirContrato, enviarContrato, removerContrato } from '../contratos';
import { formatarReais } from '../valores';

interface LeadCompleto extends EditingLead {
    cidades?: { nome: string; estado_id: number; estados?: { sigla: string } | null } | null;
}

interface EventoFechado {
    id: string;
    status: string;
    contrato_url: string | null;
    plano_fechado: string | null;
    valor_previsto: number | null;
}

const ETAPAS = ['Novo Lead', 'Proposta Enviada', 'Em Negociação', 'Fechado'];

const dataCurta = (valor: string) => new Date(valor).toLocaleDateString('pt-BR');
const dataEvento = (valor: string | null) => (valor ? new Date(valor + 'T12:00:00').toLocaleDateString('pt-BR') : 'A definir');

const Secao = ({ titulo, acao, children }: { titulo: string; acao?: React.ReactNode; children: React.ReactNode }) => (
    <section className="bg-white border-2 border-secondary p-4 md:p-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-lg font-bold uppercase tracking-tight text-secondary">{titulo}</h2>
            {acao}
        </div>
        {children}
    </section>
);

const Dado = ({ rotulo, children }: { rotulo: string; children: React.ReactNode }) => (
    <div className="min-w-0">
        <dt className="text-xs font-bold uppercase tracking-wider text-gray-400">{rotulo}</dt>
        <dd className="mt-0.5 text-sm text-secondary break-words">{children || <span className="text-gray-400">Não informado</span>}</dd>
    </div>
);

const CartaoOrcamento = ({ orcamento }: { orcamento: OrcamentoSalvo }) => {
    const itens = itensComValor(orcamento);
    const telas = itens[0]?.quantidade || 1;
    const deslocamento = orcamento.incluir_deslocamento ? Number(orcamento.custo_deslocamento) : 0;
    return (
        <div className="flex flex-col gap-2">
            <p className="text-sm font-bold text-secondary flex flex-wrap justify-between gap-2">
                <span>{orcamento.tipo_servico || 'Serviço não informado'}{orcamento.tipo_servico !== 'Outros' && telas > 1 ? ` · ${rotuloQuantidade(orcamento.tipo_servico, telas)}` : ''}</span>
                <span className="font-mono font-normal text-xs text-gray-500">{dataCurta(orcamento.created_at)}</span>
            </p>
            <ul className="flex flex-col divide-y divide-gray-100">
                {itens.map(i => (
                    <li key={i.id} className="flex justify-between gap-3 py-1.5 text-sm text-gray-700">
                        <span className="min-w-0 break-words">{i.descricao}</span>
                        <span className="font-mono font-bold shrink-0">{formatarReais(Number(i.valor_unitario))}</span>
                    </li>
                ))}
            </ul>
            {itens.length === 0 && <p className="text-sm text-gray-500">Sem valores registrados.</p>}
            {deslocamento > 0 && (
                <p className="flex justify-between gap-3 text-xs text-gray-500">
                    <span>Deslocamento{Number(orcamento.distancia_km) > 0 ? ` · ${orcamento.distancia_km} km` : ''}</span>
                    <span className="font-mono shrink-0">{formatarReais(deslocamento)}</span>
                </p>
            )}
            {orcamento.observacoes && <p className="text-xs text-gray-500 whitespace-pre-line">{orcamento.observacoes}</p>}
        </div>
    );
};

const LeadProfile = () => {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const navigate = useNavigate();
    const [lead, setLead] = useState<LeadCompleto | null>(null);
    const [followups, setFollowups] = useState<FollowupResumo[]>([]);
    const [orcamentos, setOrcamentos] = useState<OrcamentoSalvo[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState('');
    const [aviso, setAviso] = useState('');
    const [ocupado, setOcupado] = useState(false);
    const [editando, setEditando] = useState(false);
    const [modalOrcamento, setModalOrcamento] = useState<{ editarId: string | null } | null>(null);
    const [versaoFollowups, setVersaoFollowups] = useState(0);
    const [evento, setEvento] = useState<EventoFechado | null>(null);
    const [fechando, setFechando] = useState(false);
    const [alvoResultado, setAlvoResultado] = useState<AlvoResultado<LeadCompleto> | null>(null);
    const [mensagemEscolhida, setMensagemEscolhida] = useState<ChaveMensagem | ''>('');

    const carregar = async () => {
        if (!id) return;
        const [leadRes, followupsRes, orcamentosRes, eventoRes] = await Promise.all([
            supabase.from('leads').select('*, cidades(nome, estado_id, estados(sigla))').eq('id', id).maybeSingle(),
            supabase.from('lead_followups').select('id, scheduled_at, done, type, notes, resultado, feito_em').eq('lead_id', id).order('scheduled_at', { ascending: true }),
            supabase.from('propostas').select(CAMPOS_ORCAMENTO).eq('lead_id', id).order('created_at', { ascending: false }),
            supabase.from('eventos').select('id, status, contrato_url, plano_fechado, valor_previsto').eq('lead_id', id).maybeSingle(),
        ]);
        const falha = leadRes.error || followupsRes.error || orcamentosRes.error || eventoRes.error;
        setErro(falha ? falha.message : '');
        if (leadRes.data) {
            const dados = leadRes.data as LeadCompleto;
            setLead({ ...dados, _estado_id: dados.cidades?.estado_id ?? null });
        } else if (!falha) {
            setLead(null);
        }
        if (!eventoRes.error) setEvento(eventoRes.data as EventoFechado | null);
        if (followupsRes.data) setFollowups(followupsRes.data as FollowupResumo[]);
        if (orcamentosRes.data) setOrcamentos(orcamentosRes.data as unknown as OrcamentoSalvo[]);
        setCarregando(false);
    };

    useEffect(() => {
        setCarregando(true);
        carregar();
    }, [id]);

    if (carregando) {
        return (
            <div className="flex-1 flex items-center justify-center bg-background-light">
                <span className="animate-spin material-symbols-outlined text-4xl text-primary">progress_activity</span>
            </div>
        );
    }

    if (!lead) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center bg-background-light">
                <span className="material-symbols-outlined text-6xl text-gray-300">person_off</span>
                <h1 className="font-display text-xl font-bold text-secondary">{erro ? 'Não foi possível carregar o lead' : 'Lead não encontrado'}</h1>
                {erro && <p className="text-sm text-gray-500">{erro}</p>}
                <Link to="/leads" className="px-4 py-2 border-2 border-secondary bg-white text-sm font-bold uppercase">Voltar para Leads</Link>
            </div>
        );
    }

    const pendentes = followups.filter(f => !f.done);
    const proximo = pendentes[0] ?? null;
    const feitos = feitosEmOrdem(followups);
    const ultimoContato = feitos[feitos.length - 1] ?? null;
    const atrasado = !!proximo && new Date(proximo.scheduled_at).getTime() < new Date().setHours(0, 0, 0, 0);
    const perdido = lead.status === 'Perdido';
    const indiceEtapa = ETAPAS.indexOf(lead.status);
    const comValores = orcamentos.filter(o => itensComValor(o).length > 0);
    // Vale o mais recente de cada servico: um casal pode receber orcamentos em paralelo
    const servicosVistos = new Set<string>();
    const atuais = comValores.filter(o => {
        const chave = o.tipo_servico || o.id;
        if (servicosVistos.has(chave)) return false;
        servicosVistos.add(chave);
        return true;
    });
    const anteriores = comValores.filter(o => !atuais.includes(o));
    const resumo = resumoContato({ ...lead, lead_followups: followups }, temOrcamentoLead(lead.status, comValores.length > 0));
    const chaveMensagem = mensagemEscolhida || resumo.mensagem;
    const whatsapp = linkWhatsApp(lead.phone, montarMensagem(chaveMensagem, lead));
    const cidade = lead.cidades ? `${lead.cidades.nome}${lead.cidades.estados ? ` - ${lead.cidades.estados.sigla}` : ''}` : '';

    const executar = async (acao: () => Promise<string>) => {
        setOcupado(true);
        setAviso('');
        try {
            setAviso(await acao());
        } catch (e: any) {
            setErro(e.message);
        }
        await carregar();
        setVersaoFollowups(v => v + 1);
        setOcupado(false);
    };

    const alterarEtapa = (status: string) =>
        executar(async () => {
            const { error } = await supabase.from('leads').update({ status }).eq('id', lead.id);
            if (error) throw new Error('Erro ao mudar a etapa: ' + error.message);
            return `Etapa alterada para ${status}.`;
        });

    const anexarContrato = (arquivo: File, eventoId: string) =>
        executar(async () => {
            const caminho = await enviarContrato(arquivo, user!.id);
            const { error } = await supabase.from('eventos').update({ contrato_url: caminho }).eq('id', eventoId);
            if (error) {
                await removerContrato(caminho);
                throw new Error('Erro ao salvar o contrato: ' + error.message);
            }
            return 'Contrato anexado.';
        });

    const salvarDados = async (dados: LeadFormData) => {
        const { error } = await supabase.from('leads').update({ ...dados, event_date: dados.event_date || null }).eq('id', lead.id);
        if (error) throw error;
        setAviso('Dados do lead salvos.');
        await carregar();
    };

    const botao = 'h-11 px-4 border-2 border-secondary rounded-sm flex items-center justify-center gap-1 text-xs font-bold uppercase transition-colors disabled:opacity-50';

    return (
        <div className="flex-1 overflow-y-auto bg-background-light p-4 md:p-8">
            <div className="max-w-5xl mx-auto flex flex-col gap-4 md:gap-6">
                <Link to="/leads" className="self-start flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-primary transition-colors">
                    <span className="material-symbols-outlined text-[18px]">arrow_back</span>
                    Leads
                </Link>

                <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                    <div className="min-w-0">
                        <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight text-secondary break-words">{lead.name}</h1>
                        <p className="mt-1 text-sm text-gray-600">Casamento: {dataEvento(lead.event_date)}{lead.location ? ` · ${lead.location}` : ''}</p>
                    </div>
                    <div className="grid grid-cols-2 sm:flex gap-2 shrink-0">
                        {whatsapp ? (
                            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={`${botao} bg-green-600 text-white hover:bg-green-700`}>
                                <span className="material-symbols-outlined text-[18px]">chat</span>
                                WhatsApp
                            </a>
                        ) : (
                            <button type="button" onClick={() => setEditando(true)} className={`${botao} bg-white text-gray-500`}>Corrigir telefone</button>
                        )}
                        {!evento && !perdido && (
                            <button type="button" disabled={ocupado} onClick={() => setFechando(true)} className={`${botao} bg-accent-success text-white`}>
                                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                                Fechar
                            </button>
                        )}
                        <button
                            type="button"
                            disabled={ocupado || perdido || lead.status === 'Fechado'}
                            onClick={() => setAlvoResultado({ item: resumo })}
                            className={`${botao} bg-primary text-white`}
                        >
                            <span className="material-symbols-outlined text-[18px]">check</span>
                            Contato feito
                        </button>
                    </div>
                </header>

                {evento && (
                    <Secao titulo="Casamento fechado">
                        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <Dado rotulo="Plano">{evento.plano_fechado}</Dado>
                            <Dado rotulo="Valor total">{formatarReais(Number(evento.valor_previsto) || 0)}</Dado>
                            <Dado rotulo="Status do evento">{evento.status}</Dado>
                        </dl>
                        <div className="flex flex-wrap gap-2">
                            <Link to={`/planejamento?evento=${evento.id}`} className={`${botao} bg-primary text-white`}>
                                <span className="material-symbols-outlined text-[18px]">checklist</span>
                                Planejamento
                            </Link>
                            <Link to={`/events/${evento.id}`} className={`${botao} bg-white text-secondary hover:bg-gray-50`}>
                                <span className="material-symbols-outlined text-[18px]">payments</span>
                                Financeiro
                            </Link>
                            {evento.contrato_url && (
                                <button type="button" onClick={() => abrirContrato(evento.contrato_url!).catch(falha => setErro(falha.message))} className={`${botao} bg-white text-secondary hover:bg-gray-50`}>
                                    <span className="material-symbols-outlined text-[18px]">description</span>
                                    Abrir contrato
                                </button>
                            )}
                            <label className={`${botao} bg-white text-secondary hover:bg-gray-50 cursor-pointer ${ocupado ? 'opacity-50 pointer-events-none' : ''}`}>
                                <span className="material-symbols-outlined text-[18px]">upload_file</span>
                                {evento.contrato_url ? 'Substituir contrato' : 'Anexar contrato'}
                                <input
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                    className="sr-only"
                                    onChange={e => {
                                        const arquivo = e.target.files?.[0];
                                        e.target.value = '';
                                        if (arquivo) anexarContrato(arquivo, evento.id);
                                    }}
                                />
                            </label>
                        </div>
                    </Secao>
                )}

                {aviso && (
                    <div className="p-3 bg-accent-success/10 border-2 border-accent-success text-accent-success text-sm font-medium flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg">check_circle</span>
                        {aviso}
                    </div>
                )}
                {erro && (
                    <div className="p-3 bg-accent-error/10 border-2 border-accent-error text-accent-error text-sm font-medium flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg">error</span>
                        {erro}
                    </div>
                )}

                <Secao
                    titulo="Onde está no follow-up"
                    acao={
                        <label className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                            Etapa
                            <select
                                className="bg-white border-2 border-secondary p-2 font-mono text-sm text-secondary normal-case tracking-normal focus:border-primary outline-none"
                                value={lead.status}
                                disabled={ocupado || !!evento}
                                onChange={e => alterarEtapa(e.target.value)}
                            >
                                {PIPELINE_STAGES.filter(s => s !== 'Fechado' || lead.status === 'Fechado').map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </label>
                    }
                >
                    {perdido ? (
                        <p className="p-3 bg-gray-100 border-2 border-gray-300 text-sm font-bold text-gray-600">Lead marcado como Perdido.</p>
                    ) : (
                        <ol className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {ETAPAS.map((etapa, i) => {
                                const estado = i < indiceEtapa ? 'bg-primary/10 text-primary border-primary/30' : i === indiceEtapa ? 'bg-primary text-white border-secondary' : 'bg-white text-gray-400 border-gray-200';
                                return (
                                    <li key={etapa} aria-current={i === indiceEtapa ? 'step' : undefined} className={`p-2 border-2 text-xs font-bold uppercase text-center ${estado}`}>{etapa}</li>
                                );
                            })}
                        </ol>
                    )}

                    <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Dado rotulo="Próximo contato">
                            {proximo ? (
                                <span className={atrasado ? 'font-bold text-red-600' : 'font-bold'}>
                                    {dataCurta(proximo.scheduled_at)}{atrasado ? ' (atrasado)' : ''}
                                </span>
                            ) : 'Nenhum agendado'}
                        </Dado>
                        <Dado rotulo="Contatos feitos">{String(feitos.length)}</Dado>
                        <Dado rotulo="Último contato">{ultimoContato ? dataCurta(dataDoContato(ultimoContato)) : 'Nenhum'}</Dado>
                        <Dado rotulo="Último resultado">{resumo.ultimoResultado ? ROTULO_RESULTADO[resumo.ultimoResultado] : 'Não registrado'}</Dado>
                        <Dado rotulo="Tentativas sem resposta">{`${resumo.tentativas} de ${LIMITE_TENTATIVAS}`}</Dado>
                        {perdido && <Dado rotulo="Motivo da perda">{lead.motivo_perda}</Dado>}
                    </dl>

                    {!perdido && !evento && (
                        <div>
                            <label htmlFor="perfil-mensagem" className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Mensagem do botão WhatsApp</label>
                            <select
                                id="perfil-mensagem"
                                className="w-full sm:w-auto bg-white border-2 border-secondary p-2 font-mono text-sm focus:border-primary outline-none"
                                value={chaveMensagem}
                                onChange={e => setMensagemEscolhida(e.target.value as ChaveMensagem)}
                            >
                                {(Object.keys(MENSAGENS) as ChaveMensagem[]).map(chave => (
                                    <option key={chave} value={chave}>{MENSAGENS[chave].titulo}{chave === resumo.mensagem ? ' (sugerida)' : ''}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    {!perdido && (
                        <button
                            type="button"
                            disabled={ocupado}
                            onClick={() => setAlvoResultado({ item: resumo, inicial: 'desistiu' })}
                            className="self-start text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-accent-error transition-colors disabled:opacity-50"
                        >
                            Marcar como perdido
                        </button>
                    )}

                    <LeadFollowups key={versaoFollowups} leadId={lead.id} onChange={carregar} />
                </Secao>

                <Secao
                    titulo="Orçamento enviado"
                    acao={
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => setModalOrcamento({ editarId: null })} className={`${botao} bg-white text-secondary hover:bg-gray-50`}>
                                <span className="material-symbols-outlined text-[18px]">add</span>
                                Novo orçamento
                            </button>
                        </div>
                    }
                >
                    {atuais.length === 0 && <p className="text-sm text-gray-500">Nenhum orçamento registrado.</p>}
                    {atuais.map(o => (
                        <div key={o.id} className="flex flex-col gap-2 border-t-2 border-secondary/10 pt-3 first:border-t-0 first:pt-0">
                            <CartaoOrcamento orcamento={o} />
                            <button type="button" onClick={() => setModalOrcamento({ editarId: o.id })} className={`${botao} self-start bg-primary text-white`}>
                                <span className="material-symbols-outlined text-[18px]">edit</span>
                                Editar
                            </button>
                        </div>
                    ))}
                    {anteriores.length > 0 && (
                        <details className="border-t-2 border-secondary/10 pt-3">
                            <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-gray-500">
                                Orçamentos anteriores ({anteriores.length})
                            </summary>
                            <div className="mt-3 flex flex-col gap-4">
                                {anteriores.map(o => <CartaoOrcamento key={o.id} orcamento={o} />)}
                            </div>
                        </details>
                    )}
                </Secao>

                <Secao
                    titulo="Dados do lead"
                    acao={
                        <button type="button" onClick={() => setEditando(true)} className={`${botao} bg-white text-secondary hover:bg-gray-50`}>
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                            Editar
                        </button>
                    }
                >
                    <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <Dado rotulo="Telefone">{lead.phone}</Dado>
                        <Dado rotulo="E-mail">{lead.email}</Dado>
                        <Dado rotulo="Data do casamento">{dataEvento(lead.event_date)}</Dado>
                        <Dado rotulo="Local">{lead.location}</Dado>
                        <Dado rotulo="Convidados">{lead.convidados ? String(lead.convidados) : ''}</Dado>
                        <Dado rotulo="Horário">{lead.horario}</Dado>
                        <Dado rotulo="Cidade">{cidade}</Dado>
                        <Dado rotulo="Origem">{lead.source}</Dado>
                        <Dado rotulo="Serviços de interesse">{(lead.services || []).join(', ')}</Dado>
                        <Dado rotulo="Instagram">{lead.instagram}</Dado>
                        <Dado rotulo="Outro nome">{lead.partner_name}</Dado>
                    </dl>
                    {lead.notes && (
                        <div>
                            <p className="text-xs font-bold uppercase tracking-wider text-gray-400">Observação</p>
                            <p className="mt-0.5 text-sm text-secondary whitespace-pre-line">{lead.notes}</p>
                        </div>
                    )}
                </Secao>
            </div>

            <AddLeadModal
                isOpen={editando}
                onClose={() => setEditando(false)}
                onSave={salvarDados}
                editingLead={lead}
                ocultarFollowups
            />
            <ResultadoContatoModal<LeadCompleto>
                alvo={alvoResultado}
                onClose={() => setAlvoResultado(null)}
                onSalvo={(mensagem) => { setAviso(mensagem); setErro(''); setMensagemEscolhida(''); carregar(); setVersaoFollowups(v => v + 1); }}
                onQuerFechar={() => setFechando(true)}
            />
            <FecharLeadModal
                lead={fechando ? lead : null}
                onClose={() => setFechando(false)}
                onFechado={(eventoId) => navigate(`/planejamento?evento=${eventoId}`)}
            />
            <OrcamentoModal
                lead={modalOrcamento ? lead : null}
                editarId={modalOrcamento?.editarId ?? null}
                onClose={() => setModalOrcamento(null)}
                onSalvo={(mensagem) => { setAviso(mensagem); carregar(); setVersaoFollowups(v => v + 1); }}
            />
        </div>
    );
};

export default LeadProfile;
