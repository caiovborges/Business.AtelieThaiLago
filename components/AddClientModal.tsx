import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

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

export interface ClientFormData {
    name: string;
    interesse: string[];
    email: string;
    phone: string;
    instagram: string;
    cidade_id: number | null;
}

export interface EditingClient extends ClientFormData {
    id: string;
    _estado_id?: number | null;
}

interface ClientModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (client: ClientFormData) => Promise<void>;
    editingClient?: EditingClient | null;
}

export const INTERESSES = [
    'Árvore de Digitais',
    'Aquarela dos Convidados',
    'Pintura dos Noivos',
];

export const INTERESSE_ICONS: Record<string, string> = {
    'Árvore de Digitais': 'nature',
    'Aquarela dos Convidados': 'palette',
    'Pintura dos Noivos': 'brush',
};

const ClientModal = ({ isOpen, onClose, onSave, editingClient }: ClientModalProps) => {
    const [name, setName] = useState('');
    const [interesse, setInteresse] = useState<string[]>([]);
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [instagram, setInstagram] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const [estados, setEstados] = useState<Estado[]>([]);
    const [cidades, setCidades] = useState<Cidade[]>([]);
    const [selectedEstadoId, setSelectedEstadoId] = useState<number | null>(null);
    const [selectedCidadeId, setSelectedCidadeId] = useState<number | null>(null);
    const [newCidadeNome, setNewCidadeNome] = useState('');
    const [addingCidade, setAddingCidade] = useState(false);
    const [initializedEdit, setInitializedEdit] = useState(false);

    useEffect(() => {
        if (!isOpen) return;
        supabase.from('estados').select('*').order('nome').then(({ data }) => {
            if (data) setEstados(data);
        });
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            setInitializedEdit(false);
            return;
        }
        if (editingClient && !initializedEdit) {
            setName(editingClient.name || '');
            setInteresse(editingClient.interesse || []);
            setEmail(editingClient.email || '');
            setPhone(editingClient.phone || '');
            setInstagram(editingClient.instagram || '');
            setSelectedCidadeId(editingClient.cidade_id);
            if (editingClient._estado_id) {
                setSelectedEstadoId(editingClient._estado_id);
            }
            setInitializedEdit(true);
        } else if (!editingClient && !initializedEdit) {
            setName('');
            setInteresse([]);
            setEmail('');
            setPhone('');
            setInstagram('');
            setSelectedEstadoId(null);
            setSelectedCidadeId(null);
            setInitializedEdit(true);
        }
    }, [isOpen, editingClient, initializedEdit]);

    useEffect(() => {
        if (!selectedEstadoId) {
            setCidades([]);
            return;
        }
        supabase.from('cidades').select('*').eq('estado_id', selectedEstadoId).order('nome')
            .then(({ data }) => { if (data) setCidades(data); });
    }, [selectedEstadoId]);

    if (!isOpen) return null;

    const isEditing = !!editingClient;

    const toggleInteresse = (item: string) => {
        setInteresse(prev =>
            prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]
        );
    };

    const handleAddCidade = async () => {
        if (!newCidadeNome.trim() || !selectedEstadoId) return;
        setAddingCidade(true);
        const { data, error } = await supabase
            .from('cidades')
            .insert({ nome: newCidadeNome.trim(), estado_id: selectedEstadoId })
            .select()
            .single();

        if (!error && data) {
            setCidades(prev => [...prev, data].sort((a, b) => a.nome.localeCompare(b.nome)));
            setSelectedCidadeId(data.id);
            setNewCidadeNome('');
        }
        setAddingCidade(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSaving(true);

        try {
            await onSave({
                name,
                interesse,
                email,
                phone,
                instagram,
                cidade_id: selectedCidadeId,
            });
            setName('');
            setInteresse([]);
            setEmail('');
            setPhone('');
            setInstagram('');
            setSelectedEstadoId(null);
            setSelectedCidadeId(null);
            setNewCidadeNome('');
            setInitializedEdit(false);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Erro ao salvar cliente.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div
                className="relative w-full max-w-lg bg-white border-2 border-secondary shadow-hard-hover max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b-2 border-secondary sticky top-0 bg-white z-10">
                    <h2 className="font-display text-lg md:text-xl font-bold uppercase tracking-tight text-secondary">
                        {isEditing ? 'Editar Cliente' : 'Novo Cliente'}
                    </h2>
                    <button onClick={onClose} className="flex items-center justify-center h-8 w-8 hover:bg-gray-100 transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    {error && (
                        <div className="p-3 bg-accent-error/10 border border-accent-error text-accent-error text-sm font-medium flex items-center gap-2">
                            <span className="material-symbols-outlined text-base">error</span>
                            {error}
                        </div>
                    )}

                    {/* Nome */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Nome *</label>
                        <input
                            className="w-full bg-surface border-2 border-secondary p-3 text-sm placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none"
                            type="text"
                            placeholder="Ex: Ana & Pedro"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            disabled={saving}
                        />
                    </div>

                    {/* Interesse — Multi-select checkboxes */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-2">Interesse</label>
                        <div className="space-y-2">
                            {INTERESSES.map(item => {
                                const checked = interesse.includes(item);
                                return (
                                    <label
                                        key={item}
                                        className={`flex items-center gap-3 p-3 border-2 cursor-pointer transition-all ${checked
                                            ? 'border-primary bg-primary/5 shadow-hard-sm'
                                            : 'border-secondary/30 bg-surface hover:border-secondary/60'
                                            } ${saving ? 'opacity-60 pointer-events-none' : ''}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleInteresse(item)}
                                            disabled={saving}
                                            className="sr-only"
                                        />
                                        <span className={`flex items-center justify-center h-5 w-5 border-2 transition-colors ${checked ? 'bg-primary border-primary' : 'border-secondary bg-white'
                                            }`}>
                                            {checked && <span className="material-symbols-outlined text-white text-[14px]">check</span>}
                                        </span>
                                        <span className={`material-symbols-outlined text-lg ${checked ? 'text-primary' : 'text-gray-400'}`}>
                                            {INTERESSE_ICONS[item] || 'brush'}
                                        </span>
                                        <span className={`text-sm font-medium ${checked ? 'text-primary' : 'text-secondary'}`}>{item}</span>
                                    </label>
                                );
                            })}
                        </div>
                    </div>

                    {/* Estado & Cidade */}
                    <div className="space-y-3 p-4 bg-background-light border-2 border-secondary/20">
                        <p className="text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1">
                            <span className="material-symbols-outlined text-base">location_on</span>
                            Localização
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Estado</label>
                                <select
                                    className="w-full bg-white border-2 border-secondary p-3 text-sm focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none appearance-none"
                                    value={selectedEstadoId ?? ''}
                                    onChange={(e) => {
                                        setSelectedEstadoId(e.target.value ? Number(e.target.value) : null);
                                        setSelectedCidadeId(null);
                                    }}
                                    disabled={saving}
                                >
                                    <option value="">Selecionar...</option>
                                    {estados.map(e => (
                                        <option key={e.id} value={e.id}>{e.sigla} - {e.nome}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Cidade</label>
                                <select
                                    className="w-full bg-white border-2 border-secondary p-3 text-sm focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none appearance-none"
                                    value={selectedCidadeId ?? ''}
                                    onChange={(e) => setSelectedCidadeId(e.target.value ? Number(e.target.value) : null)}
                                    disabled={saving || !selectedEstadoId}
                                >
                                    <option value="">{selectedEstadoId ? 'Selecionar...' : 'Selecione o estado'}</option>
                                    {cidades.map(c => (
                                        <option key={c.id} value={c.id}>{c.nome}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {selectedEstadoId && (
                            <div className="flex gap-2 items-end">
                                <div className="flex-1">
                                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">Adicionar Cidade</label>
                                    <input
                                        className="w-full bg-white border-2 border-dashed border-secondary/40 p-2.5 text-sm placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none"
                                        type="text"
                                        placeholder="Nome da cidade..."
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
                                    className="h-[42px] px-3 border-2 border-secondary bg-primary text-white text-xs font-bold uppercase flex items-center gap-1 shadow-hard-sm hover:shadow-hard-hover hover:-translate-y-0.5 active:translate-y-0 active:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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

                    {/* Contato */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Email</label>
                            <input
                                className="w-full bg-surface border-2 border-secondary p-3 text-sm placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none"
                                type="email"
                                placeholder="email@exemplo.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                disabled={saving}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Telefone</label>
                            <input
                                className="w-full bg-surface border-2 border-secondary p-3 text-sm placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none font-mono"
                                type="text"
                                placeholder="(11) 99999-1234"
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                disabled={saving}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Instagram</label>
                        <input
                            className="w-full bg-surface border-2 border-secondary p-3 text-sm placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none"
                            type="text"
                            placeholder="@usuario"
                            value={instagram}
                            onChange={(e) => setInstagram(e.target.value)}
                            disabled={saving}
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={saving}
                            className="flex-1 h-12 border-2 border-secondary bg-white font-display font-bold text-sm uppercase tracking-wider hover:bg-gray-50 transition-colors"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className={`flex-1 h-12 bg-primary text-white font-display font-bold text-sm uppercase tracking-wider border-2 border-secondary shadow-hard hover:shadow-hard-hover hover:-translate-y-0.5 active:translate-y-0 active:shadow-none transition-all flex items-center justify-center gap-2 ${saving ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                            {saving ? (
                                <>
                                    <span className="animate-spin material-symbols-outlined text-[18px]">progress_activity</span>
                                    Salvando...
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-[18px]">{isEditing ? 'check' : 'save'}</span>
                                    {isEditing ? 'Atualizar' : 'Salvar'}
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ClientModal;
