import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';

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

interface ClientOption {
    id: string;
    name: string;
}

export interface EventFormData {
    nome: string;
    client_id: string | null;
    data_evento: string;
    servico: string | string[];
    status: string;
    cidade_id: number | null;
    local: string;
    observacoes: string;
}

export interface EditingEvent extends EventFormData {
    id: string;
    contrato_url: string | null;
    _estado_id?: number | null;
}

interface EventModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (event: EventFormData, contratoFile: File | null) => Promise<void>;
    editingEvent?: EditingEvent | null;
}

const SERVICOS = [
    'Árvore de Digitais',
    'Aquarela dos Convidados',
    'Pintura dos Noivos',
    'Identidade Visual',
    'Outros',
];

const STATUS_COLORS: Record<string, string> = {
    'Confirmado': 'bg-blue-100 text-blue-800 border-blue-300',
    'Concluído': 'bg-green-100 text-green-800 border-green-300',
    'Cancelado': 'bg-red-100 text-red-800 border-red-300',
};

const STATUS_OPTIONS = ['Confirmado', 'Concluído', 'Cancelado'];

const EventModal = ({ isOpen, onClose, onSave, editingEvent }: EventModalProps) => {
    const { user } = useAuth();
    const [nome, setNome] = useState('');
    const [clientId, setClientId] = useState<string>('');
    const [dataEvento, setDataEvento] = useState('');
    const [servicos, setServicos] = useState<string[]>([]);
    const [status, setStatus] = useState('Confirmado');
    const [local, setLocal] = useState('');
    const [observacoes, setObservacoes] = useState('');
    const [contratoFile, setContratoFile] = useState<File | null>(null);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const [clients, setClients] = useState<ClientOption[]>([]);
    const [estados, setEstados] = useState<Estado[]>([]);
    const [cidades, setCidades] = useState<Cidade[]>([]);
    const [selectedEstadoId, setSelectedEstadoId] = useState<number | null>(null);
    const [selectedCidadeId, setSelectedCidadeId] = useState<number | null>(null);
    const [newCidadeNome, setNewCidadeNome] = useState('');
    const [addingCidade, setAddingCidade] = useState(false);
    const [initializedEdit, setInitializedEdit] = useState(false);

    // Fetch clients and estados on open
    useEffect(() => {
        if (!isOpen) return;
        supabase.from('clients').select('id, name').order('name').then(({ data }) => {
            if (data) setClients(data);
        });
        supabase.from('estados').select('*').order('nome').then(({ data }) => {
            if (data) setEstados(data);
        });
    }, [isOpen]);

    // Pre-fill when editing
    useEffect(() => {
        if (!isOpen) {
            setInitializedEdit(false);
            return;
        }
        if (editingEvent && !initializedEdit) {
            setNome(editingEvent.nome || '');
            setClientId(editingEvent.client_id || '');
            setDataEvento(editingEvent.data_evento || '');

            const existingServicos = editingEvent.servico
                ? (Array.isArray(editingEvent.servico) ? editingEvent.servico : [editingEvent.servico])
                : [];
            setServicos(existingServicos);

            setStatus(editingEvent.status === 'Pendente' ? 'Confirmado' : (editingEvent.status || 'Confirmado'));
            setLocal(editingEvent.local || '');
            setObservacoes(editingEvent.observacoes || '');
            setSelectedCidadeId(editingEvent.cidade_id);
            if (editingEvent._estado_id) {
                setSelectedEstadoId(editingEvent._estado_id);
            }
            setContratoFile(null);
            setInitializedEdit(true);
        } else if (!editingEvent && !initializedEdit) {
            setNome('');
            setClientId('');
            setDataEvento('');
            setClientId('');
            setDataEvento('');
            setServicos([]);
            setStatus('Confirmado');
            setLocal('');
            setObservacoes('');
            setSelectedEstadoId(null);
            setSelectedCidadeId(null);
            setContratoFile(null);
            setInitializedEdit(true);
        }
    }, [isOpen, editingEvent, initializedEdit]);

    // Fetch cidades when estado changes
    useEffect(() => {
        if (!selectedEstadoId) {
            setCidades([]);
            return;
        }
        supabase.from('cidades').select('*').eq('estado_id', selectedEstadoId).order('nome')
            .then(({ data }) => { if (data) setCidades(data); });
    }, [selectedEstadoId]);

    if (!isOpen) return null;

    const isEditing = !!editingEvent;

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
                nome,
                client_id: clientId || null,
                data_evento: dataEvento,
                servico: servicos,
                status,
                cidade_id: selectedCidadeId,
                local,
                observacoes,
            }, contratoFile);
            // Reset
            setNome('');
            setClientId('');
            setDataEvento('');
            setServicos([]);
            setStatus('Confirmado');
            setLocal('');
            setObservacoes('');
            setSelectedEstadoId(null);
            setSelectedCidadeId(null);
            setContratoFile(null);
            setInitializedEdit(false);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Erro ao salvar evento.');
        } finally {
            setSaving(false);
        }
    };

    const existingContratoUrl = editingEvent?.contrato_url;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div
                className="relative w-full max-w-2xl bg-white border-2 border-secondary shadow-hard-hover max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b-2 border-secondary sticky top-0 bg-white z-10">
                    <h2 className="font-display text-xl font-bold uppercase tracking-tight text-secondary">
                        {isEditing ? 'Editar Evento' : 'Novo Evento'}
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

                    {/* Nome do Evento */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Nome do Evento *</label>
                        <input
                            className="w-full bg-surface border-2 border-secondary p-3 text-sm placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none"
                            type="text"
                            placeholder="Ex: Casamento Ana & Pedro"
                            value={nome}
                            onChange={(e) => setNome(e.target.value)}
                            required
                            disabled={saving}
                        />
                    </div>

                    {/* Cliente + Data */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Cliente Relacionado</label>
                            <select
                                className="w-full bg-surface border-2 border-secondary p-3 text-sm focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none appearance-none"
                                value={clientId}
                                onChange={(e) => setClientId(e.target.value)}
                                disabled={saving}
                            >
                                <option value="">Selecionar cliente...</option>
                                {clients.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Data do Evento</label>
                            <input
                                className="w-full bg-surface border-2 border-secondary p-3 text-sm focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none"
                                type="date"
                                value={dataEvento}
                                onChange={(e) => setDataEvento(e.target.value)}
                                disabled={saving}
                            />
                        </div>
                    </div>

                    {/* Serviço + Status */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Serviços</label>
                            <div className="flex flex-col gap-2 p-3 bg-surface border-2 border-secondary h-48 overflow-y-auto">
                                {SERVICOS.map(s => (
                                    <label key={s} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 -mx-1 rounded">
                                        <input
                                            type="checkbox"
                                            className="w-4 h-4 text-primary border-2 border-secondary rounded-sm focus:ring-0 focus:ring-offset-0"
                                            checked={servicos.includes(s)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setServicos(prev => [...prev, s]);
                                                } else {
                                                    setServicos(prev => prev.filter(item => item !== s));
                                                }
                                            }}
                                            disabled={saving}
                                        />
                                        <span className="text-sm text-secondary">{s}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Status</label>
                            <div className="flex flex-wrap gap-2">
                                {STATUS_OPTIONS.map(s => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => setStatus(s)}
                                        disabled={saving}
                                        className={`px-3 py-1.5 text-xs font-bold uppercase tracking-wider border transition-all ${status === s
                                            ? STATUS_COLORS[s] + ' border-2 shadow-hard-sm'
                                            : 'bg-white border-gray-200 text-gray-500 hover:border-secondary'
                                            }`}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Localização */}
                    <div className="space-y-3 p-4 bg-background-light border-2 border-secondary/20">
                        <p className="text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1">
                            <span className="material-symbols-outlined text-base">location_on</span>
                            Localização
                        </p>

                        <div className="grid grid-cols-2 gap-3">
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

                        {/* Local / Venue */}
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Local / Espaço</label>
                            <input
                                className="w-full bg-white border-2 border-secondary p-3 text-sm placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none"
                                type="text"
                                placeholder="Ex: Espaço Singular, Fazenda Santa Maria..."
                                value={local}
                                onChange={(e) => setLocal(e.target.value)}
                                disabled={saving}
                            />
                        </div>
                    </div>

                    {/* Observações */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-secondary mb-1">Observações</label>
                        <textarea
                            className="w-full bg-surface border-2 border-secondary p-3 text-sm placeholder-gray-400 focus:outline-none focus:border-primary focus:ring-0 transition-colors rounded-none resize-none"
                            rows={3}
                            placeholder="Detalhes adicionais sobre o evento..."
                            value={observacoes}
                            onChange={(e) => setObservacoes(e.target.value)}
                            disabled={saving}
                        />
                    </div>

                    {/* Contrato / File Upload */}
                    <div className="space-y-2 p-4 bg-background-light border-2 border-secondary/20">
                        <p className="text-xs font-bold uppercase tracking-wider text-secondary flex items-center gap-1">
                            <span className="material-symbols-outlined text-base">description</span>
                            Contrato
                        </p>

                        {existingContratoUrl && !contratoFile && (
                            <div className="flex items-center gap-2 p-2 bg-white border border-secondary/40">
                                <span className="material-symbols-outlined text-primary text-lg">attach_file</span>
                                <a
                                    href={existingContratoUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm font-mono text-primary hover:underline truncate"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    Contrato anexado
                                </a>
                            </div>
                        )}

                        <label className={`flex items-center justify-center gap-2 p-3 border-2 border-dashed border-secondary/40 bg-white cursor-pointer hover:border-primary transition-colors ${saving ? 'opacity-60 pointer-events-none' : ''}`}>
                            <span className="material-symbols-outlined text-gray-400">upload_file</span>
                            <span className="text-sm text-gray-500">{contratoFile ? contratoFile.name : (existingContratoUrl ? 'Substituir contrato...' : 'Anexar contrato (PDF, imagem)...')}</span>
                            <input
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                className="sr-only"
                                onChange={(e) => setContratoFile(e.target.files?.[0] || null)}
                                disabled={saving}
                            />
                        </label>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
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

export default EventModal;
