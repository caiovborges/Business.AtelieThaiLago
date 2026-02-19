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

const PLAN_OPTIONS = ['Herança', 'Memorias', 'Lembranças', 'Encontros'];
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

        let currentItens = (itensRes.data || []) as PropostaItem[];

        // Ensure all 4 plans exist
        const missingPlans = PLAN_OPTIONS.filter(plan => !currentItens.some(i => i.descricao === plan));
        if (missingPlans.length > 0) {
            const newItems = missingPlans.map(plan => ({
                id: `temp-${plan}`, // Temp ID until saved
                descricao: plan,
                quantidade: 1,
                valor_unitario: 0
            }));
            currentItens = [...currentItens, ...newItems];
        }

        // Sort by predefined order
        currentItens.sort((a, b) => PLAN_OPTIONS.indexOf(a.descricao) - PLAN_OPTIONS.indexOf(b.descricao));

        setItens(currentItens);
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

        // 1. Save Proposal Details
        const { error: propError } = await supabase.from('propostas').update({
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

        if (propError) {
            alert('Erro ao salvar proposta: ' + propError.message);
            setSaving(false);
            return;
        }

        // 2. Save Items (Plans)
        for (const item of itens) {
            if (item.id.startsWith('temp-')) {
                // Insert new
                await supabase.from('proposta_itens').insert({
                    proposta_id: id,
                    descricao: item.descricao,
                    quantidade: 1,
                    valor_unitario: Number(item.valor_unitario),
                });
            } else {
                // Update existing
                await supabase.from('proposta_itens').update({
                    valor_unitario: Number(item.valor_unitario),
                }).eq('id', item.id);
            }
        }

        // Refresh to get real IDs
        const { data: refreshedItems } = await supabase.from('proposta_itens').select('*').eq('proposta_id', id);
        if (refreshedItems) {
            const sorted = (refreshedItems as PropostaItem[]).sort((a, b) => PLAN_OPTIONS.indexOf(a.descricao) - PLAN_OPTIONS.indexOf(b.descricao));
            setItens(sorted);
        }

        setLastSaved(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
        setShowToast(true);
        setTimeout(() => setShowToast(false), 2500);
        setSaving(false);
    };

    const handleUpdateItemValue = (index: number, val: string) => {
        const newItens = [...itens];
        newItens[index].valor_unitario = val as any; // Allow string temporarily for input
        setItens(newItens);
    };

    const handleBlurItemValue = (index: number) => {
        const newItens = [...itens];
        const val = newItens[index].valor_unitario;
        if (typeof val === 'string') {
            newItens[index].valor_unitario = parseAmount(val);
        }
        setItens(newItens);
        // Note: We don't auto-save on blur here to avoid too many requests, user should click Save
    };

    const deslocamentoVal = incluirDeslocamento ? parseAmount(custoDeslocamento) : 0;

    // const subtotalItens = itens.reduce((s, i) => s + (Number(i.valor_unitario) * Number(i.quantidade)), 0);
    // const totalGeral = subtotalItens + deslocamentoVal;

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

        // Clone the preview node to modify it for print without affecting UI
        const printContent = previewRef.current.cloneNode(true) as HTMLElement;

        // Ensure all styles are computed or included
        const printWindow = window.open('', '_blank');
        if (!printWindow) return;

        printWindow.document.write(`
            <html>
            <head>
                <title>${titulo || 'Proposta'}</title>
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: 'Inter', sans-serif; color: #1A1A1A; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    @page { size: A4; margin: 0; }
                    .page { width: 210mm; min-height: 297mm; padding: 40px; display: flex; flex-direction: column; }
                    .header { display: flex; justify-content: space-between; margin-bottom: 40px; border-bottom: 2px solid #1A1A1A; padding-bottom: 20px; }
                    .logo-text { font-family: 'Space Grotesk', sans-serif; font-size: 32px; font-weight: 800; letter-spacing: -1px; text-transform: uppercase; }
                    .sub-logo { font-family: 'Space Grotesk', sans-serif; font-size: 12px; font-weight: 600; letter-spacing: 2px; color: #e0067e; text-transform: uppercase; margin-top: 4px; }
                    
                    .client-info { margin-bottom: 40px; }
                    .client-name { font-family: 'Space Grotesk', sans-serif; font-size: 24px; font-weight: 700; margin-bottom: 4px; }
                    .proposal-meta { font-size: 14px; color: #666; font-family: 'Space Mono', monospace; }
                    
                    .options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 40px; }
                    .option-card { border: 1px solid #ddd; padding: 20px; break-inside: avoid; }
                    .option-title { font-family: 'Space Grotesk', sans-serif; font-size: 18px; font-weight: 700; color: #e0067e; text-transform: uppercase; margin-bottom: 15px; border-bottom: 1px solid #eee; padding-bottom: 10px; }
                    .option-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
                    .option-total { display: flex; justify-content: space-between; margin-top: 15px; padding-top: 15px; border-top: 2px solid #1A1A1A; font-weight: 700; font-size: 16px; font-family: 'Space Grotesk', sans-serif; }
                    
                    .footer { margin-top: auto; padding-top: 20px; border-top: 1px solid #eee; font-size: 10px; color: #888; text-align: center; }
                    
                    .obs-box { margin-top: 20px; background: #f9f9f9; padding: 15px; border-radius: 4px; font-size: 12px; color: #555; }
                </style>
            </head>
            <body>
                <div class="page">
                    <div class="header">
                        <div>
                            <div class="logo-text">Ateliê Thai Lago</div>
                            <div class="sub-logo">Pinturas em Casamento</div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-weight: bold; font-family: 'Space Grotesk'; font-size: 18px;">PROPOSTA</div>
                             <div style="font-size: 12px; color: #666; margin-top: 4px;">${dataEvento ? formatPreviewDate(dataEvento) : ''}</div>
                        </div>
                    </div>

                    <div class="client-info">
                        <div style="font-size: 10px; text-transform: uppercase; color: #888; margin-bottom: 5px; font-weight: 600;">Preparado especialmente para</div>
                        <div class="client-name">${leadName || 'Nome do Cliente'}</div>
                        <div class="proposal-meta">${titulo}</div>
                    </div>

                    <div class="options-grid">
                        ${itens.map(item => {
            const val = typeof item.valor_unitario === 'string' ? parseAmount(item.valor_unitario as any) : item.valor_unitario;
            const total = val + deslocamentoVal;
            return `
                                <div class="option-card">
                                    <div class="option-title">${item.descricao}</div>
                                    <div class="option-row">
                                        <span style="color: #666;">Valor do Serviço</span>
                                        <span>R$ ${formatAmount(val)}</span>
                                    </div>
                                    ${incluirDeslocamento ? `
                                    <div class="option-row">
                                        <span style="color: #666;">Deslocamento (${distanciaKm}km)</span>
                                        <span>R$ ${formatAmount(deslocamentoVal)}</span>
                                    </div>
                                    ` : ''}
                                    <div class="option-total">
                                        <span>TOTAL</span>
                                        <span>R$ ${formatAmount(total)}</span>
                                    </div>
                                </div>
                            `;
        }).join('')}
                    </div>

                    ${observacoes ? `
                    <div class="obs-box">
                        <strong>Observações:</strong><br>
                        ${observacoes.replace(/\n/g, '<br>')}
                    </div>
                    ` : ''}

                    <div class="footer">
                        <p>Validade da proposta: 60 dias. | Reserva mediante sinal.</p>
                        <p style="margin-top: 5px;">Ateliê Thai Lago | contato@ateliethai.com</p>
                    </div>
                </div>
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

                        {/* Plans (Fixed) */}
                        <div className="flex flex-col gap-4">
                            <h3 className="text-lg font-display font-bold uppercase border-b-2 border-primary w-fit pb-1">Planos & Valores</h3>

                            <div className="flex flex-col gap-3">
                                {itens.map((item, index) => {
                                    const val = typeof item.valor_unitario === 'string' ? parseAmount(item.valor_unitario as any) : item.valor_unitario;
                                    const totalPlan = val + deslocamentoVal;

                                    return (
                                        <div key={item.id} className="bg-surface border-2 border-secondary p-4 shadow-[2px_2px_0px_0px_#1A1A1A]">
                                            <div className="flex justify-between items-center mb-2">
                                                <h4 className="font-display font-bold text-lg text-secondary uppercase">{item.descricao}</h4>
                                                <div className="flex flex-col items-end">
                                                    <span className="text-[10px] font-bold uppercase text-gray-400">Total com Deslocamento</span>
                                                    <span className="font-mono font-bold text-primary">R$ {formatAmount(totalPlan)}</span>
                                                </div>
                                            </div>

                                            <div className="flex gap-4 items-end">
                                                <div className="flex-1">
                                                    <label className="text-[10px] font-bold uppercase text-gray-400">Valor do Plano (R$)</label>
                                                    <input
                                                        className="w-full border-b border-gray-300 focus:border-primary outline-none py-1 text-sm font-mono bg-transparent"
                                                        type="text"
                                                        value={item.valor_unitario}
                                                        onChange={(e) => handleUpdateItemValue(index, e.target.value)}
                                                        onBlur={() => handleBlurItemValue(index)}
                                                        placeholder="0,00"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
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
                            {/* Options Preview */}
                            <div className="grid grid-cols-2 gap-4 mb-8">
                                {itens.map(item => {
                                    const val = Number(item.valor_unitario);
                                    const total = val + deslocamentoVal;
                                    return (
                                        <div key={item.id} className="border border-gray-200 p-4 rounded-sm">
                                            <h4 className="font-display font-bold text-sm text-primary uppercase mb-3 border-b border-gray-100 pb-2">{item.descricao}</h4>

                                            <div className="flex justify-between items-center text-xs mb-1">
                                                <span className="text-gray-500">Valor</span>
                                                <span className="font-mono">R$ {formatAmount(val)}</span>
                                            </div>

                                            {incluirDeslocamento && (
                                                <div className="flex justify-between items-center text-xs mb-1">
                                                    <span className="text-gray-500">Desloc.</span>
                                                    <span className="font-mono">R$ {formatAmount(deslocamentoVal)}</span>
                                                </div>
                                            )}

                                            <div className="flex justify-between items-center text-sm font-bold mt-3 border-t border-gray-100 pt-2">
                                                <span>TOTAL</span>
                                                <span className="font-mono text-primary">R$ {formatAmount(total)}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            {/* Totals */}
                            {/* Totals Section Removed - Showing Separate Options */}
                            <div className="flex justify-center mb-8">
                                <span className="text-xs font-mono text-gray-400 uppercase tracking-widest">Opções Disponíveis</span>
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
