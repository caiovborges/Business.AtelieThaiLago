import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';

interface Lead {
    id: string;
    name: string;
}

interface PropostaItem {
    id: string;
    descricao: string;
    quantidade: number;
    valor_unitario: number;
}

interface Proposta {
    id: string;
    titulo: string;
    status: string;
    data_evento: string | null;
    incluir_deslocamento: boolean;
    distancia_km: number;
    custo_deslocamento: number;
    observacoes: string | null;
    lead_id: string | null;
    leads?: { name: string } | null;
}

const STATUS_OPTIONS = ['Rascunho', 'Enviada', 'Aprovada', 'Recusada'];

const ProposalEditor = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();

    const [proposta, setProposta] = useState<Proposta | null>(null);
    const [itens, setItens] = useState<PropostaItem[]>([]);
    const [leads, setLeads] = useState<Lead[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [lastSaved, setLastSaved] = useState<string | null>(null);
    const [showToast, setShowToast] = useState(false);
    const previewRef = useRef<HTMLDivElement>(null);

    const [titulo, setTitulo] = useState('');
    const [leadId, setLeadId] = useState('');
    const [dataEvento, setDataEvento] = useState('');
    const [status, setStatus] = useState('Rascunho');
    const [incluirDeslocamento, setIncluirDeslocamento] = useState(false);
    const [distanciaKm, setDistanciaKm] = useState('');
    const [custoDeslocamento, setCustoDeslocamento] = useState('');
    const [observacoes, setObservacoes] = useState('');

    const fetchData = async () => {
        if (!id) return;
        setLoading(true);
        const [propostaRes, itensRes, leadsRes] = await Promise.all([
            supabase.from('propostas').select('*, leads(name)').eq('id', id).single(),
            supabase.from('proposta_itens').select('*').eq('proposta_id', id).order('created_at'),
            supabase.from('leads').select('id, name').order('name'),
        ]);

        if (propostaRes.data) {
            const p = propostaRes.data as any;
            setProposta(p);
            setTitulo(p.titulo);
            setLeadId(p.lead_id || '');
            setDataEvento(p.data_evento || '');
            setStatus(p.status);
            setIncluirDeslocamento(p.incluir_deslocamento);
            setDistanciaKm(String(p.distancia_km || ''));
            setCustoDeslocamento(String(p.custo_deslocamento || ''));
            setObservacoes(p.observacoes || '');
        }
        if (itensRes.data) setItens(itensRes.data as PropostaItem[]);
        if (leadsRes.data) setLeads(leadsRes.data as Lead[]);
        setLoading(false);
    };

    useEffect(() => { fetchData(); }, [id]);

    const parseAmount = (val: string): number => {
        const cleaned = val.replace(/\./g, '').replace(',', '.');
        return parseFloat(cleaned) || 0;
    };

    const handleSave = async () => {
        if (!id) return;
        setSaving(true);
        const { error } = await supabase.from('propostas').update({
            titulo,
            lead_id: leadId || null,
            data_evento: dataEvento || null,
            status,
            incluir_deslocamento: incluirDeslocamento,
            distancia_km: parseAmount(distanciaKm),
            custo_deslocamento: parseAmount(custoDeslocamento),
            observacoes: observacoes || null,
            updated_at: new Date().toISOString(),
        }).eq('id', id);

        if (error) {
            alert('Erro ao salvar: ' + error.message);
        } else {
            setLastSaved(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
            setShowToast(true);
            setTimeout(() => setShowToast(false), 2500);
        }
        setSaving(false);
    };

    const handleAddItem = async () => {
        if (!id) return;
        const { data, error } = await supabase.from('proposta_itens').insert({
            proposta_id: id,
            descricao: 'Novo item',
            quantidade: 1,
            valor_unitario: 0,
        }).select().single();
        if (data) setItens(prev => [...prev, data as PropostaItem]);
        if (error) alert('Erro: ' + error.message);
    };

    const handleUpdateItem = async (itemId: string, field: string, value: any) => {
        setItens(prev => prev.map(i => i.id === itemId ? { ...i, [field]: value } : i));
    };

    const handleSaveItem = async (itemId: string) => {
        const item = itens.find(i => i.id === itemId);
        if (!item) return;
        await supabase.from('proposta_itens').update({
            descricao: item.descricao,
            quantidade: Number(item.quantidade),
            valor_unitario: typeof item.valor_unitario === 'string' ? parseAmount(item.valor_unitario as any) : item.valor_unitario,
        }).eq('id', itemId);
    };

    const handleDeleteItem = async (itemId: string) => {
        await supabase.from('proposta_itens').delete().eq('id', itemId);
        setItens(prev => prev.filter(i => i.id !== itemId));
    };

    const subtotalItens = itens.reduce((s, i) => s + (Number(i.valor_unitario) * Number(i.quantidade)), 0);
    const deslocamentoVal = incluirDeslocamento ? parseAmount(custoDeslocamento) : 0;
    const totalGeral = subtotalItens + deslocamentoVal;

    const leadName = leads.find(l => l.id === leadId)?.name || '';

    const formatAmount = (val: number): string => {
        return val.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    };

    const formatPreviewDate = (dateStr: string): string => {
        if (!dateStr) return '';
        const d = new Date(dateStr + 'T12:00:00');
        return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    };

    const handleExportPDF = () => {
        if (!previewRef.current) return;
        const printContents = previewRef.current.innerHTML;
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;
        printWindow.document.write(`
            <html>
            <head>
                <title>${titulo || 'Proposta'}</title>
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Inter', sans-serif; color: #1A1A1A; }
                    @page { size: A4; margin: 0; }
                    .page { width: 210mm; min-height: 297mm; padding: 48px; display: flex; flex-direction: column; justify-content: space-between; }
                    h1, h3, .font-display { font-family: 'Space Grotesk', sans-serif; }
                    .font-mono { font-family: 'Space Mono', 'Courier New', monospace; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { padding: 12px 0; text-align: left; }
                    .text-right { text-align: right; }
                    .text-center { text-align: center; }
                    .border-b { border-bottom: 1px solid #eee; }
                    .border-b-2 { border-bottom: 2px solid #1A1A1A; }
                    .text-primary { color: #e0067e; }
                    .text-gray-400 { color: #9ca3af; }
                    .text-gray-500 { color: #6b7280; }
                    .text-gray-600 { color: #4b5563; }
                    .font-bold { font-weight: 700; }
                    .font-black { font-weight: 900; }
                    .text-xs { font-size: 10px; }
                    .text-sm { font-size: 14px; }
                    .text-lg { font-size: 18px; }
                    .text-xl { font-size: 20px; }
                    .text-2xl { font-size: 24px; }
                    .text-4xl { font-size: 36px; }
                    .uppercase { text-transform: uppercase; }
                    .tracking-tighter { letter-spacing: -0.05em; }
                    .tracking-wider { letter-spacing: 0.05em; }
                    .tracking-widest { letter-spacing: 0.1em; }
                    .italic { font-style: italic; }
                    .mb-1 { margin-bottom: 4px; } .mb-3 { margin-bottom: 12px; } .mb-4 { margin-bottom: 16px; } .mb-8 { margin-bottom: 32px; } .mb-12 { margin-bottom: 48px; }
                    .mt-1 { margin-top: 4px; } .mt-8 { margin-top: 32px; }
                    .py-2 { padding-top: 8px; padding-bottom: 8px; } .py-4 { padding-top: 16px; padding-bottom: 16px; }
                    .pt-4 { padding-top: 16px; } .pb-6 { padding-bottom: 24px; }
                    .flex { display: flex; } .flex-col { flex-direction: column; } .gap-1 { gap: 4px; }
                    .justify-between { justify-content: space-between; } .justify-end { justify-content: flex-end; } .items-start { align-items: flex-start; } .items-center { align-items: center; }
                    .w-1\\/2 { width: 50%; } .w-32 { width: 128px; }
                    .h-px { height: 1px; } .bg-gray-300 { background: #d1d5db; } .text-gray-200 { color: #e5e7eb; }
                    .border-t-2 { border-top: 2px solid #1A1A1A; }
                    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
                </style>
            </head>
            <body>
                <div class="page">${printContents}</div>
            </body>
            </html>
        `);
        printWindow.document.close();
        setTimeout(() => { printWindow.print(); }, 500);
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-background-light">
                <span className="animate-spin material-symbols-outlined text-4xl text-primary">progress_activity</span>
            </div>
        );
    }

    if (!proposta) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-background-light">
                <span className="material-symbols-outlined text-6xl text-gray-300 mb-4">error</span>
                <p className="font-display text-xl font-bold text-secondary mb-2">Proposta não encontrada</p>
                <button onClick={() => navigate('/proposals')} className="text-primary font-bold hover:underline">
                    Voltar para propostas
                </button>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-background-light relative">
            {/* Save Toast */}
            <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 bg-secondary text-white px-5 py-3 shadow-hard border-2 border-secondary transition-all duration-300 ${showToast ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0 pointer-events-none'}`}>
                <span className="material-symbols-outlined text-accent-success text-[20px]">check_circle</span>
                <span className="font-mono text-sm font-bold">Proposta salva com sucesso!</span>
            </div>

            {/* Header */}
            <header className="h-16 border-b-2 border-secondary bg-surface flex items-center justify-between px-6 shrink-0 z-10">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/proposals')} className="p-1.5 hover:bg-gray-100 border border-transparent hover:border-secondary transition-all">
                        <span className="material-symbols-outlined text-[20px]">arrow_back</span>
                    </button>
                    <h2 className="text-2xl font-display font-black tracking-tighter text-secondary">ESTÚDIO DE PROPOSTAS</h2>
                </div>
                <div className="flex items-center gap-3">
                    {saving && <span className="animate-spin material-symbols-outlined text-primary text-[20px]">progress_activity</span>}
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                {/* Controls Panel */}
                <div className="w-full lg:w-[450px] xl:w-[500px] bg-background-light border-r-2 border-secondary flex flex-col h-full overflow-y-auto">
                    <div className="p-6 flex flex-col gap-8 pb-32">
                        {/* Proposal Title */}
                        <div className="flex flex-col gap-1">
                            <label className="text-xs font-bold uppercase tracking-wider text-secondary">Título da Proposta</label>
                            <input
                                className="w-full h-12 bg-surface border-2 border-secondary px-4 font-display text-lg font-bold focus:ring-0 focus:border-primary shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] outline-none rounded-none"
                                value={titulo}
                                onChange={(e) => setTitulo(e.target.value)}
                                onBlur={handleSave}
                            />
                        </div>

                        {/* Lead Details */}
                        <div className="flex flex-col gap-4 bg-surface border-2 border-secondary p-5 shadow-[4px_4px_0px_0px_#1A1A1A]">
                            <div className="flex items-center justify-between border-b-2 border-secondary pb-2 mb-2">
                                <h3 className="text-sm font-bold uppercase tracking-wider text-secondary">Detalhes do Lead</h3>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold uppercase tracking-wider text-secondary">Selecionar Lead</label>
                                <div className="relative">
                                    <select
                                        className="w-full h-12 bg-surface border-2 border-secondary px-4 font-mono text-sm focus:ring-0 focus:border-primary shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] outline-none appearance-none rounded-none"
                                        value={leadId}
                                        onChange={(e) => {
                                            const newLeadId = e.target.value;
                                            setLeadId(newLeadId);
                                            const lead = leads.find(l => l.id === newLeadId);
                                            if (lead && (titulo === 'Nova Proposta' || !titulo.trim())) {
                                                setTitulo(`Proposta - ${lead.name}`);
                                            }
                                        }}
                                        onBlur={handleSave}
                                    >
                                        <option value="">Sem lead vinculado</option>
                                        {leads.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                    </select>
                                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                                        <span className="material-symbols-outlined text-secondary">expand_more</span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col gap-1">
                                <label className="text-xs font-bold uppercase tracking-wider text-secondary">Data da Proposta</label>
                                <input
                                    className="w-full h-12 bg-surface border-2 border-secondary px-4 font-mono text-sm focus:ring-0 focus:border-primary shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] outline-none rounded-none"
                                    type="date"
                                    value={dataEvento}
                                    onChange={(e) => setDataEvento(e.target.value)}
                                    onBlur={handleSave}
                                />
                            </div>
                        </div>

                        {/* Services & Products */}
                        <div className="flex flex-col gap-4">
                            <h3 className="text-lg font-display font-bold uppercase border-b-2 border-primary w-fit pb-1">Serviços & Produtos</h3>
                            {itens.map((item) => (
                                <div key={item.id} className="bg-surface border-2 border-secondary p-3 shadow-[2px_2px_0px_0px_#1A1A1A]">
                                    <div className="flex justify-between mb-2">
                                        <label className="text-[10px] font-bold uppercase text-gray-400">Descrição</label>
                                        <button onClick={() => handleDeleteItem(item.id)} className="text-accent-error hover:bg-red-50 rounded p-0.5">
                                            <span className="material-symbols-outlined text-[16px]">close</span>
                                        </button>
                                    </div>
                                    <input
                                        className="w-full border-b border-gray-300 focus:border-primary outline-none py-1 text-sm font-medium mb-3 bg-transparent"
                                        type="text"
                                        value={item.descricao}
                                        onChange={(e) => handleUpdateItem(item.id, 'descricao', e.target.value)}
                                        onBlur={() => handleSaveItem(item.id)}
                                    />
                                    <div className="flex gap-3">
                                        <div className="w-20">
                                            <label className="text-[10px] font-bold uppercase text-gray-400">Qtd</label>
                                            <input
                                                className="w-full border-b border-gray-300 focus:border-primary outline-none py-1 text-sm font-mono bg-transparent"
                                                type="number"
                                                min="1"
                                                value={item.quantidade}
                                                onChange={(e) => handleUpdateItem(item.id, 'quantidade', parseInt(e.target.value) || 1)}
                                                onBlur={() => handleSaveItem(item.id)}
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="text-[10px] font-bold uppercase text-gray-400">Valor Unitário (R$)</label>
                                            <input
                                                className="w-full border-b border-gray-300 focus:border-primary outline-none py-1 text-sm font-mono bg-transparent text-right"
                                                type="text"
                                                value={item.valor_unitario}
                                                onChange={(e) => handleUpdateItem(item.id, 'valor_unitario', e.target.value)}
                                                onBlur={() => {
                                                    const parsed = typeof item.valor_unitario === 'string' ? parseAmount(item.valor_unitario as any) : item.valor_unitario;
                                                    handleUpdateItem(item.id, 'valor_unitario', parsed);
                                                    handleSaveItem(item.id);
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <button
                                onClick={handleAddItem}
                                className="w-full py-2 border-2 border-dashed border-gray-400 text-gray-500 font-bold text-sm uppercase hover:border-primary hover:text-primary transition-colors flex items-center justify-center gap-2 rounded-none"
                            >
                                <span className="material-symbols-outlined text-sm">add</span>
                                Adicionar Item
                            </button>
                        </div>

                        {/* Logistics */}
                        <div className="flex flex-col gap-4">
                            <h3 className="text-lg font-display font-bold uppercase border-b-2 border-primary w-fit pb-1">Logística</h3>
                            <div className="flex items-center justify-between bg-surface border-2 border-secondary p-3">
                                <span className="font-bold text-sm">Incluir Deslocamento?</span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={incluirDeslocamento}
                                        onChange={(e) => setIncluirDeslocamento(e.target.checked)}
                                        onBlur={handleSave}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                </label>
                            </div>
                            {incluirDeslocamento && (
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-wider text-secondary">Distância (km)</label>
                                        <input
                                            className="w-full h-10 bg-surface border-2 border-secondary px-3 font-mono text-sm focus:ring-0 focus:border-primary outline-none rounded-none"
                                            type="number"
                                            value={distanciaKm}
                                            onChange={(e) => setDistanciaKm(e.target.value)}
                                            onBlur={handleSave}
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase tracking-wider text-secondary">Custo (R$)</label>
                                        <input
                                            className="w-full h-10 bg-surface border-2 border-secondary px-3 font-mono text-sm focus:ring-0 focus:border-primary outline-none rounded-none text-right"
                                            type="text"
                                            value={custoDeslocamento}
                                            onChange={(e) => setCustoDeslocamento(e.target.value)}
                                            onBlur={handleSave}
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Notes */}
                        <div className="flex flex-col gap-2">
                            <h3 className="text-lg font-display font-bold uppercase border-b-2 border-primary w-fit pb-1">Observações</h3>
                            <textarea
                                className="w-full bg-surface border-2 border-secondary p-3 font-mono text-sm focus:ring-0 focus:border-primary outline-none rounded-none resize-none min-h-[80px]"
                                placeholder="Anotações internas, condições de pagamento, etc..."
                                value={observacoes}
                                onChange={(e) => setObservacoes(e.target.value)}
                                onBlur={handleSave}
                            />
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="sticky bottom-0 bg-surface border-t-2 border-secondary p-4 flex gap-3 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex-1 h-12 border-2 border-secondary bg-background-light font-bold uppercase tracking-wider hover:bg-gray-100 transition-colors text-sm rounded-none disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {saving ? <span className="animate-spin material-symbols-outlined text-[18px]">progress_activity</span> : <span className="material-symbols-outlined text-[18px]">save</span>}
                            Salvar
                        </button>
                        <button
                            onClick={handleExportPDF}
                            className="flex-1 h-12 border-2 border-secondary bg-background-light font-bold uppercase tracking-wider hover:bg-gray-100 transition-colors text-sm rounded-none flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span>
                            Exportar PDF
                        </button>
                        <button
                            onClick={() => navigate('/proposals')}
                            className="flex-1 h-12 bg-primary text-white font-bold uppercase tracking-wider border-2 border-secondary shadow-hard-dark hover:translate-y-[2px] hover:shadow-none transition-all text-sm rounded-none flex items-center justify-center gap-2"
                        >
                            <span className="material-symbols-outlined text-[18px]">check</span>
                            Concluir
                        </button>
                    </div>
                </div>

                {/* Preview Panel */}
                <div className="hidden lg:flex flex-1 bg-gray-200/50 items-center justify-center p-8 overflow-y-auto relative">
                    <div className="absolute inset-0 z-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#1A1A1A 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>

                    {/* Paper */}
                    <div ref={previewRef} className="bg-white w-full max-w-[595px] aspect-[210/297] shadow-2xl relative z-10 p-12 flex flex-col justify-between text-secondary">
                        <div>
                            {/* Header */}
                            <div className="flex justify-between items-start mb-12 border-b-2 border-secondary pb-6">
                                <div className="flex flex-col gap-1">
                                    <h1 className="font-display font-black text-4xl uppercase tracking-tighter">Ateliê Thai Lago</h1>
                                    <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Pinturas em Casamento</p>
                                </div>
                                <div className="text-right">
                                    <p className="font-display font-bold text-xl text-secondary">PROPOSTA</p>
                                    {dataEvento && (
                                        <p className="font-mono text-xs text-gray-500 mt-1">{formatPreviewDate(dataEvento)}</p>
                                    )}
                                </div>
                            </div>

                            {/* Lead Info */}
                            <div className="flex justify-between mb-12">
                                <div className="mb-8">
                                    <p className="font-mono text-xs uppercase text-gray-400 mb-1">Preparado para</p>
                                    <h2 className="font-display text-2xl font-bold text-secondary">{leadName || 'Nome do Lead'}</h2>
                                    <p className="font-mono text-sm text-gray-500">{titulo}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-bold uppercase text-gray-400 mb-1">Artista</p>
                                    <p className="font-bold text-sm">Thai Lago</p>
                                    <p className="text-sm text-gray-600">contato@ateliethai.com</p>
                                </div>
                            </div>

                            {/* Items Table */}
                            {itens.length > 0 && (
                                <table className="w-full mb-8">
                                    <thead>
                                        <tr className="border-b-2 border-black">
                                            <th className="text-left py-2 font-mono text-xs uppercase font-bold w-1/2">Descrição</th>
                                            <th className="text-center py-2 font-mono text-xs uppercase font-bold">Qtd</th>
                                            <th className="text-right py-2 font-mono text-xs uppercase font-bold">Unitário</th>
                                            <th className="text-right py-2 font-mono text-xs uppercase font-bold">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-sm">
                                        {itens.map(item => (
                                            <tr key={item.id} className="border-b border-gray-100">
                                                <td className="py-4 font-medium">{item.descricao}</td>
                                                <td className="py-4 text-center font-mono text-gray-500">{item.quantidade}</td>
                                                <td className="py-4 text-right font-mono text-gray-500">{formatAmount(Number(item.valor_unitario))}</td>
                                                <td className="py-4 text-right font-mono font-bold">{formatAmount(Number(item.valor_unitario) * Number(item.quantidade))}</td>
                                            </tr>
                                        ))}
                                        {incluirDeslocamento && deslocamentoVal > 0 && (
                                            <tr className="border-b border-gray-100">
                                                <td className="py-4 font-medium text-gray-600 italic">Deslocamento ({distanciaKm}km)</td>
                                                <td className="py-4 text-center font-mono text-gray-500">1</td>
                                                <td className="py-4 text-right font-mono text-gray-500">{formatAmount(deslocamentoVal)}</td>
                                                <td className="py-4 text-right font-mono font-bold">{formatAmount(deslocamentoVal)}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div>
                            {/* Totals */}
                            <div className="flex justify-end mb-12">
                                <div className="w-1/2">
                                    {incluirDeslocamento && deslocamentoVal > 0 && (
                                        <div className="flex justify-between py-2 border-b border-gray-200">
                                            <span className="text-xs font-bold uppercase text-gray-500">Subtotal Serviços</span>
                                            <span className="font-mono text-sm">R$ {formatAmount(subtotalItens)}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between py-4">
                                        <span className="text-lg font-display font-bold text-secondary">Total Estimado</span>
                                        <span className="text-2xl font-display font-black text-primary">R$ {formatAmount(totalGeral)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="border-t-2 border-secondary pt-4">
                                {observacoes && (
                                    <p className="text-xs text-gray-500 leading-relaxed font-mono mb-4">
                                        * {observacoes}
                                    </p>
                                )}
                                <p className="text-xs text-gray-500 leading-relaxed font-mono">
                                    * Este orçamento é válido por 60 dias. É necessário apresentar um sinal para reservar a data.
                                </p>
                                <div className="mt-8 flex justify-between items-center">
                                    <div className="h-px bg-gray-300 w-32"></div>
                                    <span className="font-display font-bold text-lg tracking-widest text-gray-200">ATELIÊ THAI LAGO</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProposalEditor;
