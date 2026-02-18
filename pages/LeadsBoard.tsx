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

const LeadsBoard = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [leads, setLeads] = useState<EditingLead[]>([]);
    const [leadsWithProposals, setLeadsWithProposals] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

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

        // 2. Update Lead Status? Or Delete? Lets keep history but maybe mark as converted?
        // User asked to "passar informações". Usually we keep the lead as 'Fechado' or specific 'Convertido'.
        // Let's just notify for now.
        alert(`Cliente ${lead.name} criado com sucesso!`);
        navigate('/clients');
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
    const filteredLeads = leads.filter(l =>
        l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (l.email || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Group by status
    const leadsByStatus = PIPELINE_STAGES.reduce((acc, stage) => {
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

                {/* Search */}
                <div className="relative max-w-md">
                    <span className="absolute inset-y-0 left-3 flex items-center material-symbols-outlined text-gray-400">search</span>
                    <input
                        className="w-full pl-10 pr-4 py-2 border-2 border-secondary rounded-sm font-mono text-sm focus:border-primary outline-none focus:shadow-hard-sm transition-all"
                        placeholder="Buscar lead por nome ou email..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>
            </header>

            {/* Kanban Board */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden p-8 z-10 w-full">
                <div className="flex gap-6 h-full w-max">
                    {PIPELINE_STAGES.map(stage => (
                        <div
                            key={stage}
                            className="w-80 flex flex-col h-full bg-white/50 border-2 border-secondary/20 rounded-sm"
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, stage)}
                        >
                            {/* Column Header */}
                            <div className={`p-4 border-b-2 border-secondary/10 font-display font-bold uppercase tracking-wider flex justify-between items-center ${STATUS_COLORS[stage] || 'bg-gray-100'}`}>
                                <span>{stage}</span>
                                <span className="bg-white/50 px-2 py-0.5 rounded text-xs border border-secondary/20">
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
                                        className="bg-white border-2 border-secondary p-4 shadow-sm hover:shadow-hard-sm transition-all cursor-pointer group relative active:cursor-grabbing"
                                        onClick={() => { setEditingLead(lead); setModalOpen(true); }}
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-secondary font-display text-lg">{lead.name}</h4>
                                            {lead.source && (
                                                <span className="text-[10px] uppercase font-mono text-gray-400 border border-gray-200 px-1 rounded">
                                                    {lead.source}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {leadsWithProposals.has(lead.id) && (
                                                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold uppercase tracking-wider border border-purple-200 rounded-sm">
                                                    Proposta Gerada
                                                </span>
                                            )}
                                        </div>

                                        {lead.partner_name && (
                                            <div className="flex items-center gap-1 text-xs text-gray-500 mb-2 font-mono">
                                                <span className="material-symbols-outlined text-[14px]">favorite</span>
                                                {lead.partner_name}
                                            </div>
                                        )}

                                        <div className="space-y-1">
                                            {lead.event_date && (
                                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                                    <span className="material-symbols-outlined text-[14px]">event</span>
                                                    {new Date(lead.event_date).toLocaleDateString()}
                                                </div>
                                            )}
                                            {lead.location && (
                                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                                    <span className="material-symbols-outlined text-[14px]">location_on</span>
                                                    {lead.location}
                                                </div>
                                            )}
                                        </div>




                                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-white border border-secondary p-0.5 rounded shadow-sm">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleDeleteLead(lead.id); }}
                                                className="p-1 hover:bg-gray-100 text-accent-error rounded"
                                                title="Excluir"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">delete</span>
                                            </button>
                                        </div>

                                        {/* Convert Button (visible if Fechado) */}
                                        {stage === 'Fechado' && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleConvertToClient(lead); }}
                                                className="w-full mt-3 py-1.5 bg-accent-success/10 text-accent-success border border-accent-success/30 font-bold text-xs uppercase hover:bg-accent-success hover:text-white transition-colors flex items-center justify-center gap-1"
                                            >
                                                <span className="material-symbols-outlined text-[14px]">person_add</span>
                                                Virar Cliente
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
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
