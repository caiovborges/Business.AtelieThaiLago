import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';

interface FollowUp {
    id: string;
    type: string;
    scheduled_at: string;
    notes: string;
    done: boolean;
}

interface LeadFollowupsProps {
    leadId: string;
}

const FOLLOWUP_TYPES = [
    { value: 'WhatsApp', icon: 'chat' },
    { value: 'Email', icon: 'mail' },
    { value: 'Telefone', icon: 'call' },
    { value: 'Outro', icon: 'event_note' }
];

const LeadFollowups = ({ leadId }: LeadFollowupsProps) => {
    const { user } = useAuth();
    const [followups, setFollowups] = useState<FollowUp[]>([]);
    const [loading, setLoading] = useState(true);

    // New Followup State
    const [type, setType] = useState('WhatsApp');
    const [date, setDate] = useState('');
    const [time, setTime] = useState('09:00');
    const [notes, setNotes] = useState('');
    const [adding, setAdding] = useState(false);

    const fetchFollowups = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('lead_followups')
            .select('*')
            .eq('lead_id', leadId)
            .order('scheduled_at', { ascending: true }); // Oldest first (upcoming)

        if (data) setFollowups(data);
        setLoading(false);
    };

    useEffect(() => {
        if (leadId) fetchFollowups();
    }, [leadId]);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!date || !user) return;

        setAdding(true);
        const scheduledAt = new Date(`${date}T${time}`).toISOString();

        const { error } = await supabase.from('lead_followups').insert({
            user_id: user.id,
            lead_id: leadId,
            type,
            scheduled_at: scheduledAt,
            notes,
            done: false
        });

        if (!error) {
            setNotes('');
            setDate('');
            fetchFollowups();
        } else {
            alert('Erro ao agendar follow-up');
        }
        setAdding(false);
    };

    const toggleDone = async (id: string, currentStatus: boolean) => {
        // Optimistic update
        setFollowups(prev => prev.map(f => f.id === id ? { ...f, done: !currentStatus } : f));

        await supabase.from('lead_followups').update({ done: !currentStatus }).eq('id', id);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Excluir este agendamento?')) return;
        setFollowups(prev => prev.filter(f => f.id !== id));
        await supabase.from('lead_followups').delete().eq('id', id);
    };

    // Group by status
    const pending = followups.filter(f => !f.done);
    const completed = followups.filter(f => f.done);

    return (
        <div className="flex flex-col gap-6 mt-8 border-t-2 border-secondary/20 pt-8">
            <h3 className="text-xl font-display font-bold uppercase text-secondary flex items-center gap-2">
                <span className="material-symbols-outlined">schedule</span>
                Agendar Follow-up
            </h3>

            {/* Add Form */}
            <form onSubmit={handleAdd} className="bg-background-light p-4 border-2 border-secondary/20 rounded-sm grid gap-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Tipo</label>
                        <select
                            className="w-full bg-white border-2 border-secondary p-2.5 font-mono text-sm focus:border-primary outline-none"
                            value={type} onChange={e => setType(e.target.value)}
                        >
                            {FOLLOWUP_TYPES.map(t => <option key={t.value} value={t.value}>{t.value}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Data</label>
                        <input
                            type="date"
                            className="w-full bg-white border-2 border-secondary p-2.5 font-mono text-sm focus:border-primary outline-none"
                            value={date} onChange={e => setDate(e.target.value)}
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Hora</label>
                        <input
                            type="time"
                            className="w-full bg-white border-2 border-secondary p-2.5 font-mono text-sm focus:border-primary outline-none"
                            value={time} onChange={e => setTime(e.target.value)}
                            required
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Ação / Observação</label>
                    <input
                        type="text"
                        className="w-full bg-white border-2 border-secondary p-2.5 font-mono text-sm focus:border-primary outline-none"
                        placeholder="Ex: Ligar para confirmar recebimento..."
                        value={notes} onChange={e => setNotes(e.target.value)}
                        required
                    />
                </div>

                <div className="flex justify-end">
                    <button
                        type="submit"
                        disabled={adding}
                        className="bg-primary text-white px-4 py-2 font-display font-bold uppercase text-xs tracking-wider shadow-hard border-2 border-secondary hover:translate-y-[-1px] transition-all flex items-center gap-2"
                    >
                        {adding ? <span className="animate-spin material-symbols-outlined text-[14px]">progress_activity</span> : <span className="material-symbols-outlined text-[14px]">add_task</span>}
                        Agendar
                    </button>
                </div>
            </form>

            {/* List */}
            <div className="space-y-4">
                {pending.length > 0 && (
                    <div className="space-y-2">
                        <h4 className="text-xs font-bold uppercase text-gray-400 tracking-wider">Pendentes</h4>
                        {pending.map(f => (
                            <FollowUpItem key={f.id} item={f} onToggle={() => toggleDone(f.id, f.done)} onDelete={() => handleDelete(f.id)} />
                        ))}
                    </div>
                )}

                {completed.length > 0 && (
                    <div className="space-y-2 opacity-60">
                        <h4 className="text-xs font-bold uppercase text-gray-400 tracking-wider">Concluídos</h4>
                        {completed.map(f => (
                            <FollowUpItem key={f.id} item={f} onToggle={() => toggleDone(f.id, f.done)} onDelete={() => handleDelete(f.id)} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

const FollowUpItem = ({ item, onToggle, onDelete }: { item: FollowUp, onToggle: () => void, onDelete: () => void }) => {
    const icon = FOLLOWUP_TYPES.find(t => t.value === item.type)?.icon || 'event';
    const isLate = new Date(item.scheduled_at) < new Date() && !item.done;

    return (
        <div className={`flex items-center gap-3 p-3 border-2 ${isLate ? 'border-red-200 bg-red-50' : item.done ? 'border-gray-200 bg-gray-50' : 'border-secondary/20 bg-white'} transition-all`}>
            <button
                onClick={onToggle}
                className={`h-6 w-6 border-2 flex items-center justify-center transition-colors ${item.done ? 'bg-primary border-primary' : 'bg-white border-secondary hover:border-primary'}`}
            >
                {item.done && <span className="material-symbols-outlined text-white text-[16px]">check</span>}
            </button>

            <div className="h-8 w-8 rounded-full bg-surface border border-secondary/20 flex items-center justify-center text-gray-500">
                <span className="material-symbols-outlined text-[18px]">{icon}</span>
            </div>

            <div className="flex-1">
                <div className="flex items-center gap-2">
                    <span className={`font-bold font-display text-sm ${item.done ? 'line-through text-gray-400' : 'text-secondary'}`}>
                        {item.type}
                    </span>
                    <span className={`text-xs font-mono font-bold ${isLate ? 'text-red-500' : 'text-gray-500'}`}>
                        {new Date(item.scheduled_at).toLocaleDateString()} às {new Date(item.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {isLate && <span className="text-[10px] bg-red-100 text-red-600 px-1 rounded font-bold uppercase">Atrasado</span>}
                </div>
                {item.notes && <p className={`text-sm ${item.done ? 'text-gray-400' : 'text-gray-600'}`}>{item.notes}</p>}
            </div>

            <button onClick={onDelete} className="text-gray-300 hover:text-red-500 transition-colors">
                <span className="material-symbols-outlined">delete</span>
            </button>
        </div>
    );
};

export default LeadFollowups;
