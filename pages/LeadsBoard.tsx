import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';
import AddLeadModal, { LeadFormData, EditingLead, PIPELINE_STAGES } from '../components/AddLeadModal';
import FalarHoje from '../components/FalarHoje';
import TodosLeads from '../components/TodosLeads';
import OrcamentoModal from '../components/OrcamentoModal';
import FecharLeadModal from '../components/FecharLeadModal';
import ResultadoContatoModal, { AlvoResultado } from '../components/ResultadoContatoModal';
import { linkConversa, organizarContatos, resumoContato, temOrcamentoLead } from '../leadContato';
import { conteudoEnviado, mensagemEnviada, naoRespondeu } from '../leadAcoes';
import { whatsappDoItem } from '../nutricao';
import { COR_ETAPA, DESCRICAO_ETAPA, ETAPA, ETAPAS_ATIVAS, ETAPAS_ENCERRADAS } from '../etapas';

const STATUS_COLORS = COR_ETAPA;
const ACTIVE_STAGES = ETAPAS_ATIVAS;

const LeadsBoard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [leads, setLeads] = useState<EditingLead[]>([]);
    const [leadsWithProposals, setLeadsWithProposals] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOption, setSortOption] = useState<string>('prioridade');
    const [viewMode, setViewMode] = useState<'hoje' | 'aguardando' | 'funnel' | 'lost' | 'closed' | 'todos'>('hoje');
    const [erroLeads, setErroLeads] = useState('');
    const [alvoResultado, setAlvoResultado] = useState<AlvoResultado<EditingLead> | null>(null);
    const [aviso, setAviso] = useState('');
    const [leadOrcamento, setLeadOrcamento] = useState<EditingLead | null>(null);
    const [leadFechar, setLeadFechar] = useState<EditingLead | null>(null);

    // Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [editingLead, setEditingLead] = useState<EditingLead | null>(null);
    const [ocupadoContato, setOcupadoContato] = useState(false);

    // Initial Fetch
    const fetchLeads = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('leads')
            .select('*, lead_followups(id, scheduled_at, done, type, notes, resultado, feito_em, enviada_em, nutricao, conteudo_id)')
            .order('created_at', { ascending: false });

        const { data: propsData } = await supabase
            .from('propostas')
            .select('lead_id');

        if (propsData) {
            const leadIds = new Set(propsData.map((p: any) => p.lead_id).filter(Boolean));
            setLeadsWithProposals(leadIds as Set<string>);
        }

        setErroLeads(error ? error.message : '');
        if (data) {
            setLeads(data as EditingLead[]);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchLeads();
    }, []);

    const getNextFollowUp = (lead: EditingLead) => {
        if (!lead.lead_followups || lead.lead_followups.length === 0) return null;

        const pending = lead.lead_followups
            .filter(f => !f.done)
            .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

        return pending.length > 0 ? pending[0] : null;
    };

    // Handlers
    const handleSaveLead = async (formData: LeadFormData) => {
        if (!user) return;
        const dados = { ...formData, event_date: formData.event_date || null };

        if (editingLead) {
            // Update
            const { error } = await supabase
                .from('leads')
                .update(dados)
                .eq('id', editingLead.id);
            if (error) throw error;
        } else {
            // Insert
            const { data: novoLead, error } = await supabase
                .from('leads')
                .insert([{ ...dados, user_id: user.id }])
                .select('id')
                .single();
            if (error) throw error;

            // O primeiro contato ja entra na lista "Falar hoje"
            const { error: erroContato } = await supabase.from('lead_followups').insert({
                user_id: user.id,
                lead_id: novoLead.id,
                type: 'WhatsApp',
                scheduled_at: new Date().toISOString(),
                notes: 'Primeiro contato',
                done: false,
            });
            if (erroContato) alert('Lead salvo, mas o primeiro contato não foi agendado: ' + erroContato.message);
        }
        fetchLeads();
    };

    const handleDeleteLead = async (id: string) => {
        if (window.confirm('Tem certeza que deseja excluir este lead?')) {
            const { error } = await supabase.from('leads').delete().eq('id', id);
            if (error) {
                alert(error.code === '23503'
                    ? 'Este lead tem proposta vinculada e não pode ser excluído. Marque-o como Perdido.'
                    : 'Erro ao excluir lead: ' + error.message);
                return;
            }
            fetchLeads();
        }
    };

    const temOrcamento = (lead: EditingLead) => temOrcamentoLead(lead.status, leadsWithProposals.has(lead.id));

    const acaoContato = async (acao: () => Promise<string>) => {
        setOcupadoContato(true);
        setAviso('');
        try {
            setAviso(await acao());
            await fetchLeads();
        } catch (falha: any) {
            alert(falha.message);
        } finally {
            setOcupadoContato(false);
        }
    };

    const handleDragStart = (e: React.DragEvent, leadId: string) => {
        e.dataTransfer.setData('leadId', leadId);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = async (e: React.DragEvent, newStatus: string) => {
        e.preventDefault();
        const leadId = e.dataTransfer.getData('leadId');
        if (!leadId) return;

        // Optimistic update
        setLeads(prev => prev.map(l =>
            l.id === leadId ? { ...l, status: newStatus } : l
        ));

        // Supabase update
        const { error } = await supabase
            .from('leads')
            .update({ status: newStatus })
            .eq('id', leadId);

        if (error) {
            console.error('Error updating status:', error);
            fetchLeads(); // Revert on error
        }
    };

    // Filter logic
    const filteredLeads = leads
        .filter(l => {
            const matchesSearch = l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (l.email || '').toLowerCase().includes(searchTerm.toLowerCase());

            if (!matchesSearch) return false;

            if (viewMode === 'funnel') {
                return ACTIVE_STAGES.includes(l.status);
            } else if (viewMode === 'lost') {
                return ETAPAS_ENCERRADAS.includes(l.status);
            } else { // closed
                return l.status === ETAPA.fechado;
            }
        })
        .sort((a, b) => {
            if (sortOption === 'created_at_desc') {
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
            }
            if (sortOption === 'event_date_desc') {
                const dateA = a.event_date ? new Date(a.event_date).getTime() : 0;
                const dateB = b.event_date ? new Date(b.event_date).getTime() : 0;
                return dateB - dateA;
            }
            if (sortOption === 'event_date_asc') {
                const dateA = a.event_date ? new Date(a.event_date).getTime() : 9999999999999;
                const dateB = b.event_date ? new Date(b.event_date).getTime() : 9999999999999;
                return dateA - dateB;
            }
            if (sortOption === 'followup_desc') {
                const nextA = getNextFollowUp(a);
                const nextB = getNextFollowUp(b);
                if (nextA && nextB) {
                    return new Date(nextB.scheduled_at).getTime() - new Date(nextA.scheduled_at).getTime();
                }
                if (nextA) return -1;
                if (nextB) return 1;
                return 0;
            }
            if (sortOption === 'followup_asc') {
                const nextA = getNextFollowUp(a);
                const nextB = getNextFollowUp(b);

                // If both have follow-ups, compare dates (earlier/overdue first)
                if (nextA && nextB) {
                    return new Date(nextA.scheduled_at).getTime() - new Date(nextB.scheduled_at).getTime();
                }
                // Lead with follow-up comes first
                if (nextA) return -1;
                if (nextB) return 1;

                return 0;
            }
            return 0;
        });

    // Group by status (Dynamic based on viewMode)
    const stagesToShow = viewMode === 'funnel' ? ACTIVE_STAGES : (viewMode === 'lost' ? ETAPAS_ENCERRADAS : [ETAPA.fechado]);

    // Quick helper to group
    const leadsByStatus = stagesToShow.reduce((acc, stage) => {
        acc[stage] = filteredLeads.filter(l => l.status === stage);
        return acc;
    }, {} as Record<string, EditingLead[]>);

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden relative bg-background-light">
            <div className="absolute inset-0 z-0 pointer-events-none bg-noise opacity-50 mix-blend-multiply"></div>

            {/* Header */}
            <header className="relative z-20 px-4 md:px-8 py-3 md:py-6 flex flex-col gap-3 md:gap-5 bg-white/50 border-b-2 border-secondary/10">
                <div className="flex flex-row justify-between items-center sm:items-end gap-3">
                    <div>
                        <h2 className="font-display text-2xl md:text-3xl font-bold text-secondary">Funil de Vendas</h2>
                        <p className="hidden sm:block font-body text-gray-600 mt-1 text-sm md:text-base">Gerencie seus leads desde o primeiro contato até o fechamento.</p>
                    </div>
                    <button
                        onClick={() => { setEditingLead(null); setModalOpen(true); }}
                        className="shrink-0 justify-center px-3 sm:px-6 py-2 sm:py-3 bg-primary text-white font-display font-bold uppercase tracking-wider shadow-hard border-2 border-secondary hover:shadow-hard-hover hover:-translate-y-0.5 transition-all flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined">add</span>
                        <span className="hidden sm:inline">Novo Lead</span>
                        <span className="sm:hidden">Novo</span>
                    </button>
                </div>

                {/* Filters Row */}
                <div className="flex flex-col gap-3 bg-secondary/5 p-2 md:p-3 rounded-lg border border-secondary/10">
                    <div className="flex flex-wrap gap-1.5 md:gap-2 w-full">
                        <button
                            onClick={() => setViewMode('hoje')}
                            className={`shrink-0 px-2.5 py-1.5 md:px-4 md:py-2 rounded-sm font-bold text-xs md:text-sm uppercase transition-all flex items-center gap-1.5 md:gap-2 ${viewMode === 'hoje' ? 'bg-primary text-white shadow-md' : 'bg-white text-primary hover:bg-primary/10'}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">today</span>
                            Falar Hoje
                        </button>
                        <button
                            onClick={() => setViewMode('aguardando')}
                            className={`shrink-0 px-2.5 py-1.5 md:px-4 md:py-2 rounded-sm font-bold text-xs md:text-sm uppercase transition-all flex items-center gap-1.5 md:gap-2 ${viewMode === 'aguardando' ? 'bg-orange-600 text-white shadow-md' : 'bg-white text-orange-600 hover:bg-orange-50'}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">hourglass_top</span>
                            Aguardando ({organizarContatos(leads, new Date(), temOrcamento).aguardando.length})
                        </button>
                        <button
                            onClick={() => setViewMode('funnel')}
                            className={`shrink-0 px-2.5 py-1.5 md:px-4 md:py-2 rounded-sm font-bold text-xs md:text-sm uppercase transition-all flex items-center gap-1.5 md:gap-2 ${viewMode === 'funnel' ? 'bg-secondary text-white shadow-md' : 'bg-white text-secondary hover:bg-secondary/10'}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">view_column</span>
                            Funil Ativo
                        </button>
                        <button
                            onClick={() => setViewMode('lost')}
                            className={`shrink-0 px-2.5 py-1.5 md:px-4 md:py-2 rounded-sm font-bold text-xs md:text-sm uppercase transition-all flex items-center gap-1.5 md:gap-2 ${viewMode === 'lost' ? 'bg-gray-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">list</span>
                            Perdidos / Sem resposta
                        </button>
                        <button
                            onClick={() => setViewMode('closed')}
                            className={`shrink-0 px-2.5 py-1.5 md:px-4 md:py-2 rounded-sm font-bold text-xs md:text-sm uppercase transition-all flex items-center gap-1.5 md:gap-2 ${viewMode === 'closed' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-green-600 hover:bg-green-50'}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">check_circle</span>
                            Fechados
                        </button>
                        <button
                            onClick={() => setViewMode('todos')}
                            className={`shrink-0 px-2.5 py-1.5 md:px-4 md:py-2 rounded-sm font-bold text-xs md:text-sm uppercase transition-all flex items-center gap-1.5 md:gap-2 ${viewMode === 'todos' ? 'bg-secondary text-white shadow-md' : 'bg-white text-secondary hover:bg-secondary/10'}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">table_rows</span>
                            Todos ({leads.length})
                        </button>
                    </div>

                    {/* Controls */}
                    <div className="flex flex-row gap-2 md:gap-3 w-full items-stretch">
                        {/* Search */}
                        <div className="relative flex-1 min-w-0 lg:max-w-xl">
                            <span className="absolute inset-y-0 left-3 flex items-center material-symbols-outlined text-gray-400">search</span>
                            <input
                                className="w-full pl-10 pr-4 py-2 border-2 border-secondary rounded-sm font-mono text-sm focus:border-primary outline-none focus:shadow-hard-sm transition-all"
                                placeholder={viewMode === 'todos' ? 'Buscar por nome, e-mail, telefone ou local...' : 'Buscar lead...'}
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {/* Sort */}
                        <div className={`relative shrink-0 w-36 sm:w-auto ${viewMode === 'todos' ? 'hidden' : ''}`}>
                            <select
                                aria-label="Ordenar"
                                value={sortOption}
                                onChange={(e) => setSortOption(e.target.value)}
                                className="w-full appearance-none pl-4 pr-10 py-2 border-2 border-secondary rounded-sm font-mono text-sm bg-white focus:border-primary outline-none focus:shadow-hard-sm transition-all cursor-pointer"
                            >
                                <option value="prioridade">Prioridade</option>
                                <option value="created_at_desc">Criado em (Recentes)</option>
                                <option value="event_date_asc">Data do Evento (Próximos)</option>
                                <option value="event_date_desc">Data do Evento (Distantes)</option>
                                <option value="followup_desc">Follow-up (Mais recentes)</option>
                                <option value="followup_asc">Follow-up (Mais antigos)</option>
                            </select>
                            <span className="absolute inset-y-0 right-3 flex items-center pointer-events-none material-symbols-outlined text-gray-500 text-sm">
                                sort
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden p-4 md:p-8 z-10 w-full relative">
                {aviso && (viewMode === 'hoje' || viewMode === 'aguardando' || viewMode === 'funnel') && (
                    <div className="mb-4 p-3 bg-accent-success/10 border-2 border-accent-success text-accent-success text-sm font-medium flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg">check_circle</span>
                        {aviso}
                    </div>
                )}
                {viewMode === 'todos' ? (
                    <TodosLeads
                        leads={leads}
                        busca={searchTerm}
                        loading={loading}
                        erro={erroLeads}
                        onAbrir={(lead) => navigate(`/leads/${lead.id}`)}
                        onEditar={(lead) => { setEditingLead(lead); setModalOpen(true); }}
                    />
                ) : (viewMode === 'hoje' || viewMode === 'aguardando') ? (
                    <FalarHoje<EditingLead>
                        visao={viewMode}
                        leads={leads.filter(l =>
                            l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            (l.email || '').toLowerCase().includes(searchTerm.toLowerCase()))}
                        ordem={sortOption}
                        loading={loading}
                        erro={erroLeads}
                        ocupado={ocupadoContato}
                        temOrcamento={temOrcamento}
                        onAbrir={(lead) => navigate(`/leads/${lead.id}`)}
                        onOrcamento={setLeadOrcamento}
                        onFeito={(item) => setAlvoResultado({ item })}
                        onEnviada={(item) => acaoContato(() => mensagemEnviada(item, user!.id))}
                        onNaoRespondeu={(item) => acaoContato(() => naoRespondeu(item))}
                        onConteudoEnviado={(item, conteudoId) => acaoContato(() => conteudoEnviado(item, conteudoId))}
                        onNutrir={(item) => setAlvoResultado({ item, inicial: 'retomar_perto' })}
                        onPerdido={(item) => setAlvoResultado({ item, inicial: 'desistiu' })}
                    />
                ) : (viewMode === 'lost' || viewMode === 'closed') ? (
                    /* LIST/TABLE VIEW (Combined logic for Lost and Closed) */
                    <div className="bg-white/50 backdrop-blur-sm border-2 border-secondary/20 rounded-lg overflow-hidden h-full flex flex-col shadow-sm">
                        <div className="overflow-x-auto overflow-y-auto flex-1 p-0">
                            <table className="w-full text-left border-collapse min-w-[600px]">
                                <thead className="bg-secondary/5 text-secondary font-display font-bold uppercase text-xs sticky top-0 z-10 border-b border-secondary/10">
                                    <tr>
                                        <th className="p-4 pl-6">Nome / Local</th>
                                        <th className="p-4">Contato</th>
                                        <th className="p-4">Data Evento</th>
                                        <th className="p-4 text-right pr-6">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-secondary/10 bg-white/30">
                                    {filteredLeads.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="p-12 text-center text-gray-400 font-mono italic">
                                                {viewMode === 'lost' ? 'Nenhum lead perdido ou sem resposta.' : 'Nenhum lead fechado encontrado.'}
                                            </td>
                                        </tr>
                                    )}
                                    {filteredLeads.map(lead => (
                                        <tr key={lead.id} className="hover:bg-white/80 transition-colors group">
                                            <td className="p-4 pl-6">
                                                <button type="button" onClick={() => navigate(`/leads/${lead.id}`)} className="font-bold text-secondary text-base text-left hover:text-primary transition-colors">{lead.name}</button>
                                                {lead.location && (
                                                    <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                                        <span className="material-symbols-outlined text-[14px]">location_on</span>
                                                        {lead.location}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4 text-sm font-mono text-gray-600">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="material-symbols-outlined text-[14px]">mail</span>
                                                    {lead.email || '-'}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-[14px]">call</span>
                                                    {lead.phone || '-'}
                                                </div>
                                            </td>
                                            <td className="p-4 text-sm text-gray-600 font-mono">
                                                {lead.event_date ? new Date(lead.event_date + 'T12:00:00').toLocaleDateString() : '-'}
                                            </td>
                                            <td className="p-4 pr-6 text-right">
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setEditingLead(lead); setModalOpen(true); }}
                                                        className="p-2 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded-full transition-colors"
                                                        title="Editar Lead"
                                                    >
                                                        <span className="material-symbols-outlined text-[20px]">edit</span>
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteLead(lead.id); }}
                                                        className="p-2 hover:bg-red-50 text-gray-400 hover:text-red-600 rounded-full transition-colors"
                                                        title="Excluir Permanentemente"
                                                    >
                                                        <span className="material-symbols-outlined text-[20px]">delete</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ) : (
                    /* FUNNEL VIEW - KANBAN */
                    <div className="flex gap-4 md:gap-6 h-full w-full overflow-x-auto pb-4 snap-x snap-mandatory hide-scrollbar">
                        {ACTIVE_STAGES.map(stage => (
                            <div
                                key={stage}
                                className="w-[85vw] sm:w-80 shrink-0 snap-center flex flex-col h-full bg-white/50 border-2 border-secondary/20 rounded-sm"
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, stage)}
                            >
                                {/* Column Header */}
                                <div className={`p-4 border-b-2 border-secondary/10 font-display font-bold uppercase tracking-wider flex justify-between items-center ${STATUS_COLORS[stage] || 'bg-gray-100'}`}>
                                    <span title={DESCRICAO_ETAPA[stage]}>{stage}</span>
                                    <span className="bg-white/50 px-2 py-0.5 rounded text-xs border border-secondary/20 shadow-sm font-mono text-gray-600">
                                        {leadsByStatus[stage]?.length || 0}
                                    </span>
                                </div>

                                {/* Cards Container */}
                                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
                                    {leadsByStatus[stage]?.map(lead => (
                                        <div
                                            key={lead.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, lead.id)}
                                            className="bg-white border-2 border-secondary p-3 shadow-sm hover:shadow-hard-sm transition-all cursor-pointer group relative active:cursor-grabbing flex flex-col gap-3 rounded-sm"
                                            onClick={() => navigate(`/leads/${lead.id}`)}
                                        >
                                            {/* Top: Info */}
                                            <div>
                                                <div className="flex justify-between items-start mb-1">
                                                    <h4 className="font-bold text-secondary font-display text-lg leading-tight">{lead.name}</h4>
                                                    {lead.source && (
                                                        <span className="text-[9px] uppercase font-mono text-gray-400 border border-gray-100 px-1 rounded bg-gray-50">
                                                            {lead.source}
                                                        </span>
                                                    )}
                                                </div>

                                                {lead.partner_name && (
                                                    <div className="flex items-center gap-1 text-xs text-pink-500 mb-1 font-mono font-bold">
                                                        <span className="material-symbols-outlined text-[12px]">favorite</span>
                                                        {lead.partner_name}
                                                    </div>
                                                )}

                                                <div className="flex flex-wrap gap-1 mb-2">
                                                    {leadsWithProposals.has(lead.id) && (
                                                        <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 text-[9px] font-bold uppercase tracking-wider border border-purple-100 rounded-sm">
                                                            Proposta
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="space-y-1 text-xs text-gray-600 pb-1">
                                                    {lead.event_date && (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="material-symbols-outlined text-[14px] text-gray-400">event</span>
                                                            {new Date(lead.event_date + 'T12:00:00').toLocaleDateString()}
                                                        </div>
                                                    )}
                                                    {lead.location && (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="material-symbols-outlined text-[14px]">location_on</span>
                                                            <span className="truncate max-w-[200px]">{lead.location}</span>
                                                        </div>
                                                    )}
                                                    {/* Next Follow Up Display */}
                                                    {(() => {
                                                        const nextFu = getNextFollowUp(lead);
                                                        if (nextFu) {
                                                            const isLate = new Date(nextFu.scheduled_at) < new Date();
                                                            return (
                                                                <div className={`flex items-center gap-1.5 font-bold ${isLate ? 'text-red-500' : 'text-orange-500'}`}>
                                                                    <span className="material-symbols-outlined text-[14px]">
                                                                        {isLate ? 'warning' : 'schedule'}
                                                                    </span>
                                                                    <span>
                                                                        {new Date(nextFu.scheduled_at).toLocaleDateString()}
                                                                        {isLate && ' (Atrasado)'}
                                                                    </span>
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    })()}
                                                </div>
                                            </div>

                                            {/* Bottom: Actions (Always Visible) */}
                                            <div className="flex gap-2 pt-2 border-t border-gray-100 group-hover:border-gray-200 transition-colors">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setLeadOrcamento(lead); }}
                                                    className="px-2 py-1.5 bg-white text-secondary border border-secondary/30 rounded-sm flex items-center justify-center hover:bg-gray-50 transition-all"
                                                    title="Orçamento"
                                                    aria-label="Orçamento"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">request_quote</span>
                                                </button>
                                                {(() => {
                                                    const resumo = resumoContato(lead, temOrcamento(lead));
                                                    const whatsapp = resumo.aguardando ? linkConversa(lead.phone) : whatsappDoItem(resumo);
                                                    return whatsapp && (
                                                        <a
                                                            href={whatsapp}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(e) => e.stopPropagation()}
                                                            className="px-2 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-sm flex items-center justify-center hover:bg-green-100 transition-all"
                                                            title="Abrir WhatsApp"
                                                        >
                                                            <span className="material-symbols-outlined text-[16px]">chat</span>
                                                        </a>
                                                    );
                                                })()}
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setLeadFechar(lead); }}
                                                    className="flex-1 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-sm flex items-center justify-center gap-1 hover:bg-green-100 hover:shadow-sm transition-all"
                                                    title="Fechar: cria o cliente e o evento"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                                    <span className="text-[10px] font-bold uppercase tracking-wide">Fechar</span>
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setAlvoResultado({ item: resumoContato(lead, temOrcamento(lead)), inicial: 'desistiu' }); }}
                                                    className="flex-1 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-sm flex items-center justify-center gap-1 hover:bg-red-100 hover:shadow-sm transition-all"
                                                    title="Marcar como Perdido"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">cancel</span>
                                                    <span className="text-[10px] font-bold uppercase tracking-wide">Perder</span>
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteLead(lead.id); }}
                                                    className="px-2 py-1.5 hover:bg-gray-100 text-gray-400 hover:text-red-600 rounded-sm transition-colors border border-transparent hover:border-gray-200"
                                                    title="Excluir Permanentemente"
                                                >
                                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <ResultadoContatoModal<EditingLead>
                alvo={alvoResultado}
                onClose={() => setAlvoResultado(null)}
                onSalvo={(mensagem) => { setAviso(mensagem); fetchLeads(); }}
                onQuerFechar={setLeadFechar}
            />

            <FecharLeadModal
                lead={leadFechar}
                onClose={() => setLeadFechar(null)}
                onFechado={(eventoId) => navigate(`/planejamento?evento=${eventoId}`)}
            />

            <OrcamentoModal
                lead={leadOrcamento}
                onClose={() => setLeadOrcamento(null)}
                onSalvo={(mensagem) => { setAviso(mensagem); fetchLeads(); }}
            />

            <AddLeadModal
                isOpen={modalOpen}
                onClose={() => { setModalOpen(false); fetchLeads(); }}
                onSave={handleSaveLead}
                editingLead={editingLead}
            />
        </div>
    );
};

export default LeadsBoard;
