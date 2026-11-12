import React, { useMemo, useState } from 'react';
import { EditingLead } from './AddLeadModal';
import { COR_ETAPA, PIPELINE_STAGES, encerrado } from '../etapas';
import ExportarPublicoModal from './ExportarPublicoModal';

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
    onAltoPadrao: (lead: EditingLead, marcar: boolean) => void;
}

const TodosLeads = ({ leads, busca, loading, erro, onAbrir, onEditar, onAltoPadrao }: Props) => {
    const [status, setStatus] = useState('');
    const [origem, setOrigem] = useState('');
    const [quando, setQuando] = useState<'' | 'futuro' | 'passado' | 'sem'>('');
    const [servico, setServico] = useState('');
    const [semPerdidos, setSemPerdidos] = useState(true);
    const [soAltoPadrao, setSoAltoPadrao] = useState(false);
    const [coluna, setColuna] = useState<Coluna>('created_at');
    const [asc, setAsc] = useState(false);
    const [exportando, setExportando] = useState(false);

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
        .filter(l => status || soAltoPadrao ? !status || l.status === status : !(semPerdidos && encerrado(l.status)))
        .filter(l => !soAltoPadrao || l.alto_padrao)
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

    const seletor = 'w-full md:w-auto appearance-none px-3 py-2 md:py-1.5 border-2 border-secondary/40 rounded-sm font-mono text-xs bg-white focus:border-primary outline-none cursor-pointer';
    const selo = (st: string) => `inline-block whitespace-nowrap px-2 py-0.5 border text-[10px] font-bold uppercase tracking-wider ${STATUS_BADGE[st] || 'bg-gray-100 text-gray-600 border-gray-300'}`;
    const ORDENS: { valor: string; rotulo: string }[] = [
        { valor: 'created_at:desc', rotulo: 'Chegaram por último' },
        { valor: 'created_at:asc', rotulo: 'Chegaram primeiro' },
        { valor: 'event_date:asc', rotulo: 'Casamento mais próximo' },
        { valor: 'event_date:desc', rotulo: 'Casamento mais distante' },
        { valor: 'name:asc', rotulo: 'Nome (A-Z)' },
        { valor: 'status:asc', rotulo: 'Etapa' },
    ];

    const mensagemVazia = erro
        ? <p className="p-6 text-center text-red-600 text-sm">Erro ao carregar leads: {erro}</p>
        : loading && leads.length === 0
            ? <p className="p-12 text-center text-gray-400 font-mono">Carregando...</p>
            : lista.length === 0
                ? <p className="p-12 text-center text-gray-400 font-mono italic">Nenhum lead encontrado com esses filtros.</p>
                : null;

    return (
        <div className="bg-white/50 backdrop-blur-sm border-2 border-secondary/20 rounded-lg overflow-hidden h-full flex flex-col shadow-sm">
            <div className="flex flex-col gap-2 p-2 md:p-3 border-b border-secondary/10 bg-white/60">
                <div className="grid grid-cols-2 md:flex md:flex-wrap gap-2">
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
                    <select aria-label="Ordenar" className={`${seletor} col-span-2 md:hidden`} value={`${coluna}:${asc ? 'asc' : 'desc'}`}
                        onChange={e => { const [c, d] = e.target.value.split(':'); setColuna(c as Coluna); setAsc(d === 'asc'); }}>
                        {ORDENS.map(o => <option key={o.valor} value={o.valor}>Ordem: {o.rotulo}</option>)}
                    </select>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <label className={`flex items-center gap-1.5 text-xs font-mono select-none ${status || soAltoPadrao ? 'text-gray-300' : 'text-gray-600 cursor-pointer'}`}
                        title={status || soAltoPadrao ? 'Desligado enquanto uma etapa ou o alto padrão está escolhido' : undefined}>
                        <input
                            type="checkbox"
                            className="accent-primary"
                            checked={semPerdidos}
                            disabled={!!status || soAltoPadrao}
                            onChange={e => setSemPerdidos(e.target.checked)}
                        />
                        Esconder perdidos e sem resposta
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-mono select-none text-gray-600 cursor-pointer"
                        title="Mostra só os leads marcados com a estrela (inclusive perdidos)">
                        <input
                            type="checkbox"
                            className="accent-amber-500"
                            checked={soAltoPadrao}
                            onChange={e => setSoAltoPadrao(e.target.checked)}
                        />
                        Só alto padrão ({leads.filter(l => l.alto_padrao).length})
                    </label>
                    <span className="ml-auto text-xs font-mono text-gray-500 whitespace-nowrap">
                        {lista.length} de {leads.length} leads
                    </span>
                    <button
                        type="button"
                        onClick={() => setExportando(true)}
                        className="w-full sm:w-auto justify-center flex items-center gap-1 px-3 py-2 md:py-1.5 border-2 border-secondary rounded-sm bg-white text-secondary text-xs font-bold uppercase hover:bg-secondary hover:text-white transition-colors"
                        title="Baixar lista para público personalizado, semelhante ou exclusão na Meta"
                    >
                        <span className="material-symbols-outlined text-[16px]">campaign</span>
                        Exportar para Meta
                    </button>
                </div>
            </div>

            <ExportarPublicoModal aberto={exportando} onClose={() => setExportando(false)} idsFiltrados={lista.map(l => l.id)} />

            {/* Celular: cartoes */}
            <ul className="md:hidden overflow-y-auto flex-1 divide-y divide-secondary/10">
                {mensagemVazia && <li>{mensagemVazia}</li>}
                {lista.map(lead => {
                    const passou = lead.event_date && lead.event_date < hoje;
                    return (
                        <li key={lead.id} className="p-3 flex gap-2 items-start bg-white/40">
                            <button type="button" onClick={() => onAbrir(lead)} className="flex-1 min-w-0 text-left flex flex-col gap-1">
                                <span className="flex items-start justify-between gap-2">
                                    <span className="font-bold text-secondary leading-tight break-words">{lead.name}</span>
                                    <span className={`shrink-0 ${selo(lead.status)}`}>{lead.status}</span>
                                </span>
                                <span className={`text-xs font-mono flex items-center gap-1 ${passou ? 'text-gray-400' : 'text-gray-700'}`}>
                                    <span className="material-symbols-outlined text-[14px]">event</span>
                                    {dataBR(lead.event_date) || 'Sem data'}
                                    {lead.location && <span className="truncate text-gray-500">· {lead.location}</span>}
                                </span>
                                {lead.phone && <span className="text-xs font-mono text-gray-600">{lead.phone}</span>}
                                {(lead.services || []).length > 0 && <span className="text-xs text-gray-600">{lead.services.join(', ')}</span>}
                                <span className="text-[11px] text-gray-400">{[lead.source, dataBR(lead.created_at) && `chegou em ${dataBR(lead.created_at)}`].filter(Boolean).join(' · ')}</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => onAltoPadrao(lead, !lead.alto_padrao)}
                                className={`p-2 rounded-full transition-colors ${lead.alto_padrao ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 hover:text-amber-500'}`}
                                aria-pressed={!!lead.alto_padrao}
                                aria-label={`${lead.alto_padrao ? 'Tirar' : 'Marcar'} ${lead.name} como alto padrão`}
                                title={lead.alto_padrao ? 'Alto padrão (clique para tirar)' : 'Marcar como alto padrão'}
                            >
                                <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: `'FILL' ${lead.alto_padrao ? 1 : 0}` }}>star</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => onEditar(lead)}
                                className="p-2 -mr-1 text-gray-400 hover:text-blue-600 rounded-full"
                                aria-label={`Editar ${lead.name}`}
                            >
                                <span className="material-symbols-outlined text-[20px]">edit</span>
                            </button>
                        </li>
                    );
                })}
            </ul>

            {/* Tablet e computador: tabela; colunas extras aparecem conforme a largura */}
            <div className="hidden md:block overflow-auto flex-1">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-secondary/5 text-secondary font-display font-bold text-xs sticky top-0 z-10 border-b border-secondary/10">
                        <tr>
                            <Cabecalho c="name" className="pl-4 lg:pl-5">Lead</Cabecalho>
                            <Cabecalho c="status">Etapa</Cabecalho>
                            <Cabecalho c="event_date">Casamento</Cabecalho>
                            <th className="p-3 uppercase">Contato</th>
                            <th className="p-3 uppercase hidden xl:table-cell">Serviços</th>
                            <Cabecalho c="source" className="hidden lg:table-cell">Origem</Cabecalho>
                            <Cabecalho c="created_at" className="hidden lg:table-cell">Chegou em</Cabecalho>
                            <th className="p-3 pr-4 lg:pr-5"><span className="sr-only">Ações</span></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-secondary/10 bg-white/30">
                        {mensagemVazia && <tr><td colSpan={8}>{mensagemVazia}</td></tr>}
                        {lista.map(lead => {
                            const passou = lead.event_date && lead.event_date < hoje;
                            return (
                                <tr key={lead.id} className="hover:bg-white/80 transition-colors align-top">
                                    <td className="p-3 pl-4 lg:pl-5 min-w-[160px] max-w-[260px]">
                                        <button type="button" onClick={() => onAbrir(lead)} className="font-bold text-secondary text-left hover:text-primary transition-colors break-words">
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
                                        {(lead.services || []).length > 0 && (
                                            <div className="xl:hidden text-xs text-gray-500 mt-0.5">{lead.services.join(', ')}</div>
                                        )}
                                    </td>
                                    <td className="p-3">
                                        <span className={selo(lead.status)}>{lead.status}</span>
                                    </td>
                                    <td className={`p-3 text-sm font-mono whitespace-nowrap ${passou ? 'text-gray-400' : 'text-gray-700'}`}>
                                        {dataBR(lead.event_date) || '-'}
                                    </td>
                                    <td className="p-3 text-xs font-mono text-gray-600">
                                        <div className="whitespace-nowrap">{lead.phone || '-'}</div>
                                        {lead.email && <div className="truncate max-w-[180px] lg:max-w-[220px]" title={lead.email}>{lead.email}</div>}
                                    </td>
                                    <td className="p-3 text-xs text-gray-600 max-w-[200px] hidden xl:table-cell">
                                        {(lead.services || []).join(', ') || '-'}
                                    </td>
                                    <td className="p-3 text-xs text-gray-600 max-w-[170px] hidden lg:table-cell">{lead.source || '-'}</td>
                                    <td className="p-3 text-xs font-mono text-gray-500 whitespace-nowrap hidden lg:table-cell">{dataBR(lead.created_at)}</td>
                                    <td className="p-3 pr-4 lg:pr-5 text-right whitespace-nowrap">
                                        <button
                                type="button"
                                onClick={() => onAltoPadrao(lead, !lead.alto_padrao)}
                                className={`p-1.5 rounded-full transition-colors ${lead.alto_padrao ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 hover:text-amber-500'}`}
                                aria-pressed={!!lead.alto_padrao}
                                aria-label={`${lead.alto_padrao ? 'Tirar' : 'Marcar'} ${lead.name} como alto padrão`}
                                title={lead.alto_padrao ? 'Alto padrão (clique para tirar)' : 'Marcar como alto padrão'}
                            >
                                <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: `'FILL' ${lead.alto_padrao ? 1 : 0}` }}>star</span>
                            </button>
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
