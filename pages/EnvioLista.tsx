import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { COR_ETAPA } from '../etapas';
import { dataBR } from '../components/TodosLeads';
import {
    Envio, LeadLista, ListaMensagem, carregarEnvios, carregarLeadsParaListas, carregarLista, leadsDaLista, registrarEnvio, textoDoLead, whatsappDoLead,
} from '../listasMensagem';

// Envio de uma mensagem para lista: um lead por vez, com o texto pronto no WhatsApp.
const EnvioLista = () => {
    const { id } = useParams();
    const [lista, setLista] = useState<ListaMensagem | null>(null);
    const [leads, setLeads] = useState<LeadLista[]>([]);
    const [envios, setEnvios] = useState<Envio[]>([]);
    const [aba, setAba] = useState<'pendentes' | 'enviadas'>('pendentes');
    const [abertos, setAbertos] = useState<Set<string>>(new Set());
    const [ocupado, setOcupado] = useState<string | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState('');
    const [aviso, setAviso] = useState('');

    const carregar = async () => {
        const [l, ld, e] = await Promise.all([carregarLista(id!), carregarLeadsParaListas(), carregarEnvios(id!)]);
        setLista(l);
        setLeads(ld);
        setEnvios(e);
    };

    useEffect(() => {
        carregar().catch(e => setErro(e.message)).finally(() => setCarregando(false));
    }, [id]);

    if (carregando) {
        return (
            <div className="flex-1 flex items-center justify-center bg-background-light">
                <span className="animate-spin material-symbols-outlined text-4xl text-primary">progress_activity</span>
            </div>
        );
    }

    const voltar = (
        <Link to="/mensagens" className="self-start flex items-center gap-1 text-sm font-bold text-gray-500 hover:text-primary transition-colors">
            <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            Mensagens
        </Link>
    );

    if (!lista) {
        return (
            <div className="flex-1 overflow-y-auto bg-background-light p-4 md:p-8">
                <div className="max-w-5xl mx-auto flex flex-col gap-4">
                    {voltar}
                    <p className="text-sm text-gray-600">{erro || 'Lista não encontrada.'}</p>
                </div>
            </div>
        );
    }

    const enviadoEm = new Map(envios.map(e => [e.lead_id, e.enviado_em]));
    const pendentes = leadsDaLista(lista, leads)
        .filter(l => !enviadoEm.has(l.id))
        .sort((a, b) => (a.event_date || '9999').localeCompare(b.event_date || '9999') || a.name.localeCompare(b.name));
    const enviadas = leads
        .filter(l => enviadoEm.has(l.id))
        .sort((a, b) => enviadoEm.get(b.id)!.localeCompare(enviadoEm.get(a.id)!));
    const total = pendentes.length + enviadas.length;
    const hoje = new Date().toLocaleDateString('sv-SE');

    const enviei = async (lead: LeadLista) => {
        setOcupado(lead.id);
        setErro('');
        setAviso('');
        try {
            setAviso(await registrarEnvio(lista, lead));
            await carregar();
        } catch (falha: any) {
            setErro(falha.message);
        } finally {
            setOcupado(null);
        }
    };

    const selo = (st: string) => `inline-block whitespace-nowrap px-2 py-0.5 border text-[10px] font-bold uppercase tracking-wider ${COR_ETAPA[st] || 'bg-gray-100 text-gray-600 border-gray-300'}`;
    const linhas = aba === 'pendentes' ? pendentes : enviadas;

    return (
        <div className="flex-1 overflow-y-auto bg-background-light p-4 md:p-8">
            <div className="max-w-5xl mx-auto flex flex-col gap-4 md:gap-6">
                {voltar}
                <header className="flex flex-col gap-2">
                    <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight text-secondary break-words">{lista.titulo}</h1>
                    <p className="text-sm text-gray-600">
                        {lista.origem || 'Qualquer origem'} · {lista.etapas.length ? lista.etapas.join(', ') : 'todas as etapas'}
                        {lista.arquivada && ' · arquivada'}
                    </p>
                    <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-secondary/10 rounded-full overflow-hidden" aria-hidden>
                            <div className="h-full bg-green-600" style={{ width: `${total ? (enviadas.length / total) * 100 : 0}%` }} />
                        </div>
                        <span className="text-sm font-mono font-bold text-secondary whitespace-nowrap">{enviadas.length} de {total} enviadas</span>
                    </div>
                </header>

                <details className="bg-white border-2 border-secondary/20 p-3">
                    <summary className="cursor-pointer text-xs font-bold uppercase tracking-wider text-gray-500">Ver a mensagem</summary>
                    <div className="mt-2 bg-green-50 border-2 border-green-200 p-3 text-sm text-secondary whitespace-pre-wrap break-words">
                        {textoDoLead(lista, { name: 'Ana & João' })}
                    </div>
                    <p className="mt-2 text-xs text-gray-500">Para mudar o texto, edite a lista na página Mensagens.</p>
                </details>

                {erro && <p className="text-sm font-bold text-accent-error">{erro}</p>}
                {aviso && <p className="text-sm font-bold text-accent-success">{aviso}</p>}

                <div className="flex gap-2">
                    {(['pendentes', 'enviadas'] as const).map(a => (
                        <button key={a} type="button" onClick={() => setAba(a)}
                            className={`h-10 px-4 border-2 border-secondary rounded-sm text-xs font-bold uppercase ${aba === a ? 'bg-secondary text-white' : 'bg-white text-secondary hover:bg-gray-50'}`}>
                            {a === 'pendentes' ? `Pendentes (${pendentes.length})` : `Enviadas (${enviadas.length})`}
                        </button>
                    ))}
                </div>

                {linhas.length === 0 ? (
                    <p className="p-8 text-center text-gray-400 font-mono italic bg-white border-2 border-secondary/10">
                        {aba === 'pendentes' ? (total ? 'Todas já receberam a mensagem. 🎉' : 'Nenhum lead nesta lista. Confira a origem e as etapas.') : 'Ninguém marcado como enviado ainda.'}
                    </p>
                ) : (
                    <ul className="flex flex-col divide-y divide-secondary/10 bg-white border-2 border-secondary/20">
                        {linhas.map(lead => {
                            const whats = whatsappDoLead(lista, lead);
                            const passou = !!lead.event_date && lead.event_date < hoje;
                            const abriu = abertos.has(lead.id);
                            return (
                                <li key={lead.id} className={`p-3 flex flex-col sm:flex-row sm:items-center gap-2 ${abriu && aba === 'pendentes' ? 'bg-green-50/60' : ''}`}>
                                    <div className="flex-1 min-w-0">
                                        <p className="flex flex-wrap items-center gap-2">
                                            <Link to={`/leads/${lead.id}`} className="font-bold text-secondary hover:text-primary break-words">{lead.name}</Link>
                                            <span className={selo(lead.status)}>{lead.status}</span>
                                        </p>
                                        <p className={`text-xs font-mono ${passou ? 'text-gray-400' : 'text-gray-600'}`}>
                                            {dataBR(lead.event_date) || 'Sem data'} · {lead.phone || 'sem telefone'}
                                            {aba === 'enviadas' && ` · enviada em ${new Date(enviadoEm.get(lead.id)!).toLocaleDateString('pt-BR')}`}
                                        </p>
                                    </div>
                                    {aba === 'pendentes' && (
                                        <div className="grid grid-cols-2 sm:flex gap-2 shrink-0">
                                            {whats ? (
                                                <a href={whats} target="_blank" rel="noopener noreferrer"
                                                    onClick={() => setAbertos(s => new Set(s).add(lead.id))}
                                                    className="h-11 px-4 bg-green-600 text-white border-2 border-secondary rounded-sm text-xs font-bold uppercase flex items-center justify-center gap-1 hover:bg-green-700">
                                                    <span className="material-symbols-outlined text-[18px]">chat</span>
                                                    WhatsApp
                                                </a>
                                            ) : (
                                                <Link to={`/leads/${lead.id}`}
                                                    className="h-11 px-4 bg-white text-gray-500 border-2 border-gray-300 rounded-sm text-xs font-bold uppercase flex items-center justify-center">
                                                    Corrigir telefone
                                                </Link>
                                            )}
                                            <button type="button" disabled={!!ocupado} onClick={() => enviei(lead)}
                                                className={`h-11 px-4 border-2 border-secondary rounded-sm text-xs font-bold uppercase flex items-center justify-center gap-1 disabled:opacity-50 ${abriu ? 'bg-primary text-white' : 'bg-white text-secondary hover:bg-gray-50'}`}>
                                                <span className="material-symbols-outlined text-[18px]">{ocupado === lead.id ? 'progress_activity' : 'done'}</span>
                                                Enviei
                                            </button>
                                        </div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default EnvioLista;
