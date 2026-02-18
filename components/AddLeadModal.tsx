import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import LeadFollowups from './LeadFollowups';

interface Estado {
    id: number;
    nome: string;
    sigla: string;
}

interface Cidade {
    id: number;
    nome: string;
    estado_id: number;
}

export interface LeadFormData {
    name: string;
    partner_name: string;
    email: string;
    phone: string;
    instagram: string;
    status: string;
    event_date: string;
    services: string[];
    source: string;
    cidade_id: number | null;
    location: string;
    notes: string;
}

export interface EditingLead extends LeadFormData {
    id: string;
    _estado_id?: number | null;
}

interface LeadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (lead: LeadFormData) => Promise<void>;
    editingLead?: EditingLead | null;
}

export const PIPELINE_STAGES = [
    'Novo Lead',
    'Proposta Enviada',
    'Em Negociação',
    'Fechado',
    'Perdido'
];

export const LEAD_SOURCES = [
    'Meta Ads',
    'Google Ads',
    'Indicação',
    'Outros'
];

export const SERVICES = [
    'Árvore de Digitais',
    'Aquarela dos Convidados',
    'Pintura dos Noivos',
    'Convites Personalizados',
    'Outro'
];

const AddLeadModal = ({ isOpen, onClose, onSave, editingLead }: LeadModalProps) => {
    // Form State
    const [name, setName] = useState('');
    const [partnerName, setPartnerName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [instagram, setInstagram] = useState('');
    const [status, setStatus] = useState('Novo Lead');
    const [eventDate, setEventDate] = useState('');
    const [services, setServices] = useState<string[]>([]);
    const [source, setSource] = useState('');
    const [location, setLocation] = useState('');
    const [notes, setNotes] = useState('');

    // Location State
    const [estados, setEstados] = useState<Estado[]>([]);
    const [cidades, setCidades] = useState<Cidade[]>([]);
    const [selectedEstadoId, setSelectedEstadoId] = useState<number | null>(null);
    const [selectedCidadeId, setSelectedCidadeId] = useState<number | null>(null);
    const [newCidadeNome, setNewCidadeNome] = useState('');
    const [addingCidade, setAddingCidade] = useState(false);

    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        supabase.from('estados').select('*').order('nome').then(({ data }) => {
            if (data) setEstados(data);
        });
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && editingLead) {
            setName(editingLead.name || '');
            setPartnerName(editingLead.partner_name || '');
            setEmail(editingLead.email || '');
            setPhone(editingLead.phone || '');
            setInstagram(editingLead.instagram || '');
            setStatus(editingLead.status || 'Novo Lead');
            setEventDate(editingLead.event_date || '');
            setServices(editingLead.services || []);
            setSource(editingLead.source || '');
            setLocation(editingLead.location || '');
            setNotes(editingLead.notes || '');
            setSelectedCidadeId(editingLead.cidade_id);
            if (editingLead._estado_id) setSelectedEstadoId(editingLead._estado_id);
        } else if (isOpen && !editingLead) {
            // Reset
            setName(''); setPartnerName(''); setEmail(''); setPhone('');
            setInstagram(''); setStatus('Novo Lead'); setEventDate('');
            setServices([]); setSource(''); setLocation(''); setNotes('');
            setSelectedEstadoId(null); setSelectedCidadeId(null);
        }
    }, [isOpen, editingLead]);

    useEffect(() => {
        if (selectedEstadoId) {
            supabase.from('cidades').select('*').eq('estado_id', selectedEstadoId).order('nome')
                .then(({ data }) => setCidades(data || []));
        } else {
            setCidades([]);
        }
    }, [selectedEstadoId]);

    const handleServiceToggle = (service: string) => {
        setServices(prev =>
            prev.includes(service) ? prev.filter(s => s !== service) : [...prev, service]
        );
    };

    const handleAddCidade = async () => {
        if (!newCidadeNome.trim() || !selectedEstadoId) return;
        setAddingCidade(true);
        try {
            const { data, error } = await supabase.from('cidades').insert({
                nome: newCidadeNome.trim(),
                estado_id: selectedEstadoId
            }).select().single();

            if (error) throw error;

            if (data) {
                setCidades(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)));
                setSelectedCidadeId(data.id);
                setNewCidadeNome('');
            }
        } catch (error: any) {
            console.error('Erro ao adicionar cidade:', error);
            setError('Erro ao adicionar cidade: ' + error.message);
        } finally {
            setAddingCidade(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!name.trim()) { setError('Nome é obrigatório'); return; }

        setSaving(true);
        try {
            await onSave({
                name, partner_name: partnerName, email, phone, instagram,
                status, event_date: eventDate, services, source,
                cidade_id: selectedCidadeId, location, notes
            });
            onClose();
        } catch (err: any) {
            setError(err.message || 'Erro ao salvar lead');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-secondary flex flex-col">
                <header className="bg-secondary p-6 flex justify-between items-center sticky top-0 z-10">
                    <h2 className="text-2xl font-display font-bold text-white uppercase tracking-wider">
                        {editingLead ? 'Editar Lead' : 'Novo Lead'}
                    </h2>
                    <button onClick={onClose} className="text-white hover:text-primary transition-colors">
                        <span className="material-symbols-outlined text-3xl">close</span>
                    </button>
                </header>

                <form onSubmit={handleSubmit} className="p-8 flex flex-col gap-8">
                    {error && (
                        <div className="bg-red-50 border-l-4 border-accent-error p-4 text-accent-error font-bold text-sm">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Column 1: Contact Info */}
                        <div className="flex flex-col gap-6">
                            <h3 className="text-lg font-display font-bold uppercase border-b-2 border-primary w-fit pb-1 text-secondary">Dados de Contato</h3>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Nome do Lead *</label>
                                <input className="w-full bg-surface border-2 border-secondary p-3 font-mono text-sm focus:border-primary outline-none"
                                    value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Ana Silva" />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Nome do Casal</label>
                                <input className="w-full bg-surface border-2 border-secondary p-3 font-mono text-sm focus:border-primary outline-none"
                                    value={partnerName} onChange={e => setPartnerName(e.target.value)} placeholder="Ex: Ana & João" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Email</label>
                                    <input className="w-full bg-surface border-2 border-secondary p-3 font-mono text-sm focus:border-primary outline-none"
                                        value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Instagram</label>
                                    <input className="w-full bg-surface border-2 border-secondary p-3 font-mono text-sm focus:border-primary outline-none"
                                        value={instagram} onChange={e => setInstagram(e.target.value)} placeholder="@usuario" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Telefone / WhatsApp</label>
                                <input className="w-full bg-surface border-2 border-secondary p-3 font-mono text-sm focus:border-primary outline-none"
                                    value={phone} onChange={e => setPhone(e.target.value)} placeholder="(00) 00000-0000" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Estado</label>
                                    <select className="w-full bg-surface border-2 border-secondary p-3 font-mono text-sm focus:border-primary outline-none appearance-none"
                                        value={selectedEstadoId || ''} onChange={e => setSelectedEstadoId(Number(e.target.value) || null)}>
                                        <option value="">Selecione</option>
                                        {estados.map(e => <option key={e.id} value={e.id}>{e.sigla} - {e.nome}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Cidade</label>
                                    <select className="w-full bg-surface border-2 border-secondary p-3 font-mono text-sm focus:border-primary outline-none appearance-none"
                                        value={selectedCidadeId || ''} onChange={e => setSelectedCidadeId(Number(e.target.value) || null)} disabled={!selectedEstadoId}>
                                        <option value="">Selecione</option>
                                        {cidades.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                    </select>
                                </div>
                            </div>

                            {selectedEstadoId && (
                                <div className="flex gap-2 items-end mt-2">
                                    <div className="flex-1">
                                        <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Não achou? Adicione:</label>
                                        <input
                                            className="w-full bg-white border-2 border-dashed border-secondary/40 p-2 text-xs placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-0 transition-colors"
                                            type="text"
                                            placeholder="Nome da nova cidade..."
                                            value={newCidadeNome}
                                            onChange={(e) => setNewCidadeNome(e.target.value)}
                                            disabled={addingCidade || saving}
                                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCidade(); } }}
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={handleAddCidade}
                                        disabled={addingCidade || !newCidadeNome.trim() || saving}
                                        className="h-[38px] px-3 border-2 border-secondary bg-primary text-white text-xs font-bold uppercase flex items-center gap-1 shadow-sm hover:translate-y-[-1px] transition-all disabled:opacity-50"
                                    >
                                        {addingCidade ? (
                                            <span className="animate-spin material-symbols-outlined text-[16px]">progress_activity</span>
                                        ) : (
                                            <span className="material-symbols-outlined text-[16px]">add</span>
                                        )}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Column 2: Deal Info */}
                        <div className="flex flex-col gap-6">
                            <h3 className="text-lg font-display font-bold uppercase border-b-2 border-primary w-fit pb-1 text-secondary">Detalhes da Oportunidade</h3>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Status do Pipeline</label>
                                    <select className="w-full bg-surface border-2 border-secondary p-3 font-mono text-sm focus:border-primary outline-none appearance-none font-bold"
                                        value={status} onChange={e => setStatus(e.target.value)}>
                                        {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Data do Evento</label>
                                    <input type="date" className="w-full bg-surface border-2 border-secondary p-3 font-mono text-sm focus:border-primary outline-none"
                                        value={eventDate} onChange={e => setEventDate(e.target.value)} />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Local do Evento</label>
                                <input className="w-full bg-surface border-2 border-secondary p-3 font-mono text-sm focus:border-primary outline-none"
                                    value={location} onChange={e => setLocation(e.target.value)} placeholder="Hotel, Salão, Praia, etc." />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Origem do Lead</label>
                                <select className="w-full bg-surface border-2 border-secondary p-3 font-mono text-sm focus:border-primary outline-none appearance-none"
                                    value={source} onChange={e => setSource(e.target.value)}>
                                    <option value="">Selecione</option>
                                    {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Serviços de Interesse</label>
                                <div className="flex flex-wrap gap-2">
                                    {SERVICES.map(svc => (
                                        <button key={svc} type="button"
                                            onClick={() => handleServiceToggle(svc)}
                                            className={`px-3 py-1 text-xs font-bold uppercase border rounded-full transition-colors ${services.includes(svc)
                                                ? 'bg-primary text-white border-primary'
                                                : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                                                }`}
                                        >
                                            {svc}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Observações</label>
                                <textarea className="w-full bg-surface border-2 border-secondary p-3 font-mono text-sm focus:border-primary outline-none resize-none h-24"
                                    value={notes} onChange={e => setNotes(e.target.value)} placeholder="Anotações internas..." />
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 mt-4 pt-4 border-t border-gray-200">
                        <button type="button" onClick={onClose}
                            className="px-6 py-3 font-display font-bold uppercase tracking-wider text-secondary hover:bg-gray-100 transition-colors">
                            Cancelar
                        </button>
                        <button type="submit" disabled={saving}
                            className="px-8 py-3 bg-primary text-white font-display font-bold uppercase tracking-wider shadow-hard border-2 border-secondary hover:shadow-hard-hover hover:-translate-y-0.5 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                            {saving ? <span className="animate-spin material-symbols-outlined text-[20px]">progress_activity</span> : <span className="material-symbols-outlined text-[20px]">save</span>}
                            Salvar Lead
                        </button>
                    </div>
                </form>

                {editingLead?.id && (
                    <div className="px-8 pb-8">
                        <LeadFollowups leadId={editingLead.id} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default AddLeadModal;
