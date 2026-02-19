import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';
import AddLeadModal, { LeadFormData, EditingLead, PIPELINE_STAGES } from '../components/AddLeadModal';

// Status colors mapping
const STATUS_COLORS: Record<string, string> = {
    'Novo Lead': 'border-blue-400 bg-blue-50',
    'Proposta Enviada': 'border-purple-400 bg-purple-50',
    'Em Negociação': 'border-pink-400 bg-pink-50',
    'Fechado': 'border-green-400 bg-green-50',
    'Perdido': 'border-gray-400 bg-gray-50',
};

const ACTIVE_STAGES = ['Novo Lead', 'Proposta Enviada', 'Em Negociação'];

const LeadsBoard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [leads, setLeads] = useState<EditingLead[]>([]);
    const [leadsWithProposals, setLeadsWithProposals] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [sortOption, setSortOption] = useState<string>('created_at_desc'); // Default sort
    const [viewMode, setViewMode] = useState<'funnel' | 'lost' | 'closed'>('funnel');

    // Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [editingLead, setEditingLead] = useState<EditingLead | null>(null);

    // Initial Fetch
    const fetchLeads = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('leads')
            .select('*')
            .order('created_at', { ascending: false });

        const { data: propsData } = await supabase
            .from('propostas')
            .select('lead_id');

        if (propsData) {
            const leadIds = new Set(propsData.map((p: any) => p.lead_id).filter(Boolean));
            setLeadsWithProposals(leadIds as Set<string>);
        }

        if (data) {
            setLeads(data as EditingLead[]);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchLeads();
    }, []);

    // Handlers
    const handleSaveLead = async (formData: LeadFormData) => {
        if (!user) return;

        if (editingLead) {
            // Update
            const { error } = await supabase
                .from('leads')
                .update({ ...formData })
                .eq('id', editingLead.id);
            if (error) throw error;
        } else {
            // Insert
            const { error } = await supabase
                .from('leads')
                .insert([{ ...formData, user_id: user.id }]);
            if (error) throw error;
        }
        fetchLeads();
    };

    const handleDeleteLead = async (id: string) => {
        if (window.confirm('Tem certeza que deseja excluir este lead?')) {
            const { error } = await supabase.from('leads').delete().eq('id', id);
            if (!error) fetchLeads();
        }
    };

    const handleConvertToClient = async (lead: EditingLead) => {
        if (!window.confirm(`Converter ${lead.name} em cliente? Isso criará um novo registro em Clientes.`)) return;

        // 1. Create Client
        const { data: clientData, error: clientError } = await supabase.from('clients').insert({
            user_id: user?.id,
            name: lead.name,
            email: lead.email,
            phone: lead.phone,
            instagram: lead.instagram,
            interesse: lead.services, // Map services to interesse
            cidade_id: lead.cidade_id,
        }).select().single();

        if (clientError) {
            alert('Erro ao criar cliente: ' + clientError.message);
            return;
        }

        // 2. Update Lead Status
        const { error: updateError } = await supabase
            .from('leads')
            .update({ status: 'Fechado' })
            .eq('id', lead.id);

        if (updateError) {
            console.error('Error updating status:', updateError);
        }

        alert(`Cliente ${lead.name} criado com sucesso!`);
        fetchLeads(); // Refresh to remove from board
    };

    const handleMarkAsLost = async (lead: EditingLead) => {
        if (!window.confirm(`Marcar ${lead.name} como Perdido?`)) return;

        const { error } = await supabase
            .from('leads')
            .update({ status: 'Perdido' })
            .eq('id', lead.id);

        if (error) {
            alert('Erro ao atualizar status');
        } else {
            fetchLeads();
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
                return l.status === 'Perdido';
            } else { // closed
                return l.status === 'Fechado';
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
            return 0;
        });

    // Group by status (Dynamic based on viewMode)
    const stagesToShow = viewMode === 'funnel' ? ACTIVE_STAGES : (viewMode === 'lost' ? ['Perdido'] : ['Fechado']);

    // Quick helper to group
    const leadsByStatus = stagesToShow.reduce((acc, stage) => {
        acc[stage] = filteredLeads.filter(l => l.status === stage);
        return acc;
    }, {} as Record<string, EditingLead[]>);

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden relative bg-background-light">
            <div className="absolute inset-0 z-0 pointer-events-none bg-noise opacity-50 mix-blend-multiply"></div>

            {/* Header */}
            <header className="relative z-20 px-8 py-6 flex flex-col gap-6 bg-white/50 border-b-2 border-secondary/10">
                <div className="flex justify-between items-end">
                    <div>
                        <h2 className="font-display text-3xl font-bold text-secondary">Funil de Vendas</h2>
                        <p className="font-body text-gray-600 mt-1">Gerencie seus leads desde o primeiro contato até o fechamento.</p>
                    </div>
                    <button
                        onClick={() => { setEditingLead(null); setModalOpen(true); }}
                        className="px-6 py-3 bg-primary text-white font-display font-bold uppercase tracking-wider shadow-hard border-2 border-secondary hover:shadow-hard-hover hover:-translate-y-0.5 transition-all flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined">add</span>
                        Novo Lead
                    </button>
                </div>

                {/* Filters Row */}
                <div className="flex justify-between items-center bg-secondary/5 p-3 rounded-lg border border-secondary/10">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setViewMode('funnel')}
                            className={`px-4 py-2 rounded-sm font-bold text-sm uppercase transition-all flex items-center gap-2 ${viewMode === 'funnel' ? 'bg-secondary text-white shadow-md' : 'bg-white text-secondary hover:bg-secondary/10'}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">view_column</span>
                            Funil Ativo
                        </button>
                        <button
                            onClick={() => setViewMode('lost')}
                            className={`px-4 py-2 rounded-sm font-bold text-sm uppercase transition-all flex items-center gap-2 ${viewMode === 'lost' ? 'bg-gray-600 text-white shadow-md' : 'bg-white text-gray-500 hover:bg-gray-100'}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">list</span>
                            Perdidos
                        </button>
                        <button
                            onClick={() => setViewMode('closed')}
                            className={`px-4 py-2 rounded-sm font-bold text-sm uppercase transition-all flex items-center gap-2 ${viewMode === 'closed' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-green-600 hover:bg-green-50'}`}
                        >
                            <span className="material-symbols-outlined text-[18px]">check_circle</span>
                            Fechados
                        </button>
                    </div>

                    {/* Controls */}
                    <div className="flex gap-4 items-center">
                        {/* Search */}
                        <div className="relative flex-1 max-w-md">
                            <span className="absolute inset-y-0 left-3 flex items-center material-symbols-outlined text-gray-400">search</span>
                            <input
                                className="w-full pl-10 pr-4 py-2 border-2 border-secondary rounded-sm font-mono text-sm focus:border-primary outline-none focus:shadow-hard-sm transition-all"
                                placeholder="Buscar lead por nome ou email..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                            />
                        </div>

                        {/* Sort */}
                        <div className="relative">
                            <select
                                value={sortOption}
                                onChange={(e) => setSortOption(e.target.value)}
                                className="appearance-none pl-4 pr-10 py-2 border-2 border-secondary rounded-sm font-mono text-sm bg-white focus:border-primary outline-none focus:shadow-hard-sm transition-all cursor-pointer"
                            >
                                <option value="created_at_desc">Criado em (Recentes)</option>
                                <option value="event_date_asc">Data do Evento (Próximos)</option>
                                <option value="event_date_desc">Data do Evento (Distantes)</option>
                            </select>
                            <span className="absolute inset-y-0 right-3 flex items-center pointer-events-none material-symbols-outlined text-gray-500 text-sm">
                                sort
                            </span>
                        </div>
                    </div>
                </div>
            </header>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden p-8 z-10 w-full relative">
                {(viewMode === 'lost' || viewMode === 'closed') ? (
                    /* LIST/TABLE VIEW (Combined logic for Lost and Closed) */
                    <div className="bg-white/50 backdrop-blur-sm border-2 border-secondary/20 rounded-lg overflow-hidden h-full flex flex-col shadow-sm">
                        <div className="overflow-y-auto flex-1 p-0">
                            <table className="w-full text-left border-collapse">
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
                                                {viewMode === 'lost' ? 'Nenhum lead marcado como perdido.' : 'Nenhum lead fechado encontrado.'}
                                            </td>
                                        </tr>
                                    )}
                                    {filteredLeads.map(lead => (
                                        <tr key={lead.id} className="hover:bg-white/80 transition-colors group">
                                            <td className="p-4 pl-6">
                                                <div className="font-bold text-secondary text-base">{lead.name}</div>
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
                                                {lead.event_date ? new Date(lead.event_date).toLocaleDateString() : '-'}
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
                                                    {viewMode === 'closed' && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleConvertToClient(lead); }}
                                                            className="p-2 hover:bg-green-50 text-gray-400 hover:text-green-600 rounded-full transition-colors"
                                                            title="Virar Cliente / Reativar"
                                                        >
                                                            <span className="material-symbols-outlined text-[20px]">check_circle</span>
                                                        </button>
                                                    )}
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
                    <div className="flex gap-6 h-full w-max overflow-x-auto pb-4">
                        {ACTIVE_STAGES.map(stage => (
                            <div
                                key={stage}
                                className="w-80 flex flex-col h-full bg-white/50 border-2 border-secondary/20 rounded-sm"
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, stage)}
                            >
                                {/* Column Header */}
                                <div className={`p-4 border-b-2 border-secondary/10 font-display font-bold uppercase tracking-wider flex justify-between items-center ${STATUS_COLORS[stage] || 'bg-gray-100'}`}>
                                    <span>{stage}</span>
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
                                            onClick={() => { setEditingLead(lead); setModalOpen(true); }}
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
                                                            {new Date(lead.event_date).toLocaleDateString()}
                                                        </div>
                                                    )}
                                                    {lead.location && (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="material-symbols-outlined text-[14px]">location_on</span>
                                                            <span className="truncate max-w-[200px]">{lead.location}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Bottom: Actions (Always Visible) */}
                                            <div className="flex gap-2 pt-2 border-t border-gray-100 group-hover:border-gray-200 transition-colors">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleConvertToClient(lead); }}
                                                    className="flex-1 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-sm flex items-center justify-center gap-1 hover:bg-green-100 hover:shadow-sm transition-all"
                                                    title="Fechar Venda (Virar Cliente)"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                                                    <span className="text-[10px] font-bold uppercase tracking-wide">Fechar</span>
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleMarkAsLost(lead); }}
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

            <AddLeadModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSave={handleSaveLead}
                editingLead={editingLead}
            />
        </div>
    );
};

export default LeadsBoard;
