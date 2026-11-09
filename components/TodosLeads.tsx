import React, { useMemo, useState } from 'react';
import { EditingLead } from './AddLeadModal';
import { COR_ETAPA, PIPELINE_STAGES, encerrado } from '../etapas';

const STATUS_BADGE = COR_ETAPA;

type Coluna = 'name' | 'status' | 'event_date' | 'source' | 'created_at';

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Datas sempre no formato brasileiro dd/mm/aaaa, sem passar por fuso horário
export const dataBR = (iso?: string | null) => {
    if (!iso) return '';
    const [a, m, d] = iso.slice(0, 10).split('-');
    return d && m && a ? `${d}/${m}/${a}` : '';
};

export const buscaLead = (lead: EditingLead, termo: string) => {
    const t = semAcento(termo.trim());
    if (!t) return true;
    const digitos = t.replace(/\D/g, '');
    const texto = semAcento([lead.name, lead.partner_name, lead.email, lead.location, lead.source].filter(Boolean).join(' '));
    if (texto.includes(t)) return true;
    return digitos.length >= 4 && (lead.phone || '').replace(/\D/g, '').includes(digitos);
};

interface Props {
    leads: EditingLead[];
    busca: string;
    loading: boolean;
    erro: string;
    onAbrir: (lead: EditingLead) => void;
    onEditar: (lead: EditingLead) => void;
}

const TodosLeads = ({ leads, busca, loading, erro, onAbrir, onEditar }: Props) => {
    const [status, setStatus] = useState('');
    const [origem, setOrigem] = useState('');
    const [quando, setQuando] = useState<'' | 'futuro' | 'passado' | 'sem'>('');
    const [servico, setServico] = useState('');
    const [semPerdidos, setSemPerdidos] = useState(true);
    const [coluna, setColuna] = useState<Coluna>('created_at');
    const [asc, setAsc] = useState(false);

    const origens = useMemo(
        () => [...new Set(leads.map(l => (l.source || '').trim()).filter(Boolean))].sort(),
        [leads],
    );

    const servicos = useMemo(
        () => [...new Set(leads.flatMap(l => (l.services || []).map(s => s.trim())).filter(Boolean))].sort(),
        [leads],
    );

    const hoje = new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD no fuso local

    const lista = leads
        .filter(l => buscaLead(l, busca))
        .filter(l => status ? l.status === status : !(semPerdidos && encerrado(l.status)))
        .filter(l => !servico || (servico === '__vazio'
            ? !(l.services || []).length
            : (l.services || []).some(s => s.trim() === servico)))
        .filter(l => !origem || (origem === '__vazio' ? !(l.source || '').trim() : (l.source || '').trim() === origem))
        .filter(l => {
            if (!quando) return true;
            if (quando === 'sem') return !l.event_date;
            if (!l.event_date) return false;
            return quando === 'futuro' ? l.event_date >= hoje : l.event_date < hoje;
        })
        .sort((a, b) => {
            const va = String((a as any)[coluna] || '');
            const vb = String((b as any)[coluna] || '');
            if (!va && vb) return 1; // vazios sempre no fim
            if (va && !vb) return -1;
            const r = coluna === 'name' ? semAcento(va).localeCompare(semAcento(vb)) : va.localeCompare(vb);
            return asc ? r : -r;
        });

    const ordenar = (c: Coluna) => {
        if (c === coluna) setAsc(!asc);
        else { setColuna(c); setAsc(c === 'name' || c === 'status' || c === 'source'); }
    };

    const Cabecalho = ({ c, children, className = '' }: { c: Coluna; children: React.ReactNode; className?: string }) => (
        <th className={`p-3 ${className}`}>
            <button type="button" onClick={() => ordenar(c)} className="flex items-center gap-1 uppercase hover:text-primary">
                {children}
                <span className="material-symbols-outlined text-[14px]">
                    {coluna === c ? (asc ? 'arrow_upward' : 'arrow_downward') : 'unfold_more'}
                </span>
            </button>
        </th>
    );

    const seletor = 'appearance-none px-3 py-1.5 border-2 border-secondary/40 rounded-sm font-mono text-xs bg-white focus:border-primary outline-none cursor-pointer';

    return (
        <div className="bg-white/50 backdrop-blur-sm border-2 border-secondary/20 rounded-lg overflow-hidden h-full flex flex-col shadow-sm">
            <div className="flex flex-wrap items-center gap-2 p-3 border-b border-secondary/10 bg-white/60">
                <select aria-label="Filtrar por etapa" className={seletor} value={status} onChange={e => setStatus(e.target.value)}>
                    <option value="">Todas as etapas</option>
                    {PIPELINE_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select aria-label="Filtrar por serviço" className={seletor} value={servico} onChange={e => setServico(e.target.value)}>
                    <option value="">Todos os serviços</option>
                    {servicos.map(s => <option key={s} value={s}>{s}</option>)}
                    <option value="__vazio">Sem serviço informado</option>
                </select>
                <select aria-label="Filtrar por origem" className={seletor} value={origem} onChange={e => setOrigem(e.target.value)}>
                    <option value="">Todas as origens</option>
                    {origens.map(o => <option key={o} value={o}>{o}</option>)}
                    <option value="__vazio">Sem origem</option>
                </select>
                <select aria-label="Filtrar por data do casamento" className={seletor} value={quando} onChange={e => setQuando(e.target.value as any)}>
                    <option value="">Qualquer data</option>
                    <option value="futuro">Casamento ainda vai acontecer</option>
                    <option value="passado">Casamento já passou</option>
                    <option value="sem">Sem data</option>
                </select>
                <label className={`flex items-center gap-1.5 text-xs font-mono select-none ${status ? 'text-gray-300' : 'text-gray-600 cursor-pointer'}`}
                    title={status ? 'Desligado enquanto uma etapa está escolhida' : undefined}>
                    <input
                        type="checkbox"
                        className="accent-primary"
                        checked={semPerdidos}
                        disabled={!!status}
                        onChange={e => setSemPerdidos(e.target.checked)}
                    />
                    Esconder perdidos e sem resposta
                </label>
                <span className="ml-auto text-xs font-mono text-gray-500">
                    {lista.length} de {leads.length} leads
                </span>
            </div>

            <div className="overflow-auto flex-1">
                <table className="w-full text-left border-collapse min-w-[860px]">
                    <thead className="bg-secondary/5 text-secondary font-display font-bold text-xs sticky top-0 z-10 border-b border-secondary/10">
                        <tr>
                            <Cabecalho c="name" className="pl-5">Lead</Cabecalho>
                            <Cabecalho c="status">Etapa</Cabecalho>
                            <Cabecalho c="event_date">Casamento</Cabecalho>
                            <th className="p-3 uppercase">Contato</th>
                            <th className="p-3 uppercase">Serviços</th>
                            <Cabecalho c="source">Origem</Cabecalho>
                            <Cabecalho c="created_at">Chegou em</Cabecalho>
                            <th className="p-3 pr-5"><span className="sr-only">Ações</span></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-secondary/10 bg-white/30">
                        {erro && (
                            <tr><td colSpan={8} className="p-6 text-center text-red-600 text-sm">Erro ao carregar leads: {erro}</td></tr>
                        )}
                        {loading && leads.length === 0 && (
                            <tr><td colSpan={8} className="p-12 text-center text-gray-400 font-mono">Carregando...</td></tr>
                        )}
                        {!loading && !erro && lista.length === 0 && (
                            <tr><td colSpan={8} className="p-12 text-center text-gray-400 font-mono italic">Nenhum lead encontrado com esses filtros.</td></tr>
                        )}
                        {lista.map(lead => {
                            const passou = lead.event_date && lead.event_date < hoje;
                            return (
                                <tr key={lead.id} className="hover:bg-white/80 transition-colors align-top">
                                    <td className="p-3 pl-5 max-w-[220px]">
                                        <button type="button" onClick={() => onAbrir(lead)} className="font-bold text-secondary text-left hover:text-primary transition-colors">
                                            {lead.name}
                                        </button>
                                        {lead.partner_name && lead.partner_name.trim() !== lead.name.trim() && (
                                            <div className="text-xs text-gray-500">{lead.partner_name}</div>
                                        )}
                                        {lead.location && (
                                            <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                                <span className="material-symbols-outlined text-[14px]">location_on</span>
                                                {lead.location}
                                            </div>
                                        )}
                                    </td>
                                    <td className="p-3">
                                        <span className={`inline-block whitespace-nowrap px-2 py-0.5 border text-[10px] font-bold uppercase tracking-wider ${STATUS_BADGE[lead.status] || 'bg-gray-100 text-gray-600 border-gray-300'}`}>
                                            {lead.status}
                                        </span>
                                    </td>
                                    <td className={`p-3 text-sm font-mono whitespace-nowrap ${passou ? 'text-gray-400' : 'text-gray-700'}`}>
                                        {dataBR(lead.event_date) || '-'}
                                    </td>
                                    <td className="p-3 text-xs font-mono text-gray-600">
                                        <div className="whitespace-nowrap">{lead.phone || '-'}</div>
                                        {lead.email && <div className="truncate max-w-[200px]" title={lead.email}>{lead.email}</div>}
                                    </td>
                                    <td className="p-3 text-xs text-gray-600 max-w-[180px]">
                                        {(lead.services || []).join(', ') || '-'}
                                    </td>
                                    <td className="p-3 text-xs text-gray-600 max-w-[160px]">{lead.source || '-'}</td>
                                    <td className="p-3 text-xs font-mono text-gray-500 whitespace-nowrap">{dataBR(lead.created_at)}</td>
                                    <td className="p-3 pr-5 text-right">
                                        <button
                                            type="button"
                                            onClick={() => onEditar(lead)}
                                            className="p-1.5 hover:bg-blue-50 text-gray-400 hover:text-blue-600 rounded-full transition-colors"
                                            title="Editar lead"
                                        >
                                            <span className="material-symbols-outlined text-[18px]">edit</span>
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default TodosLeads;
