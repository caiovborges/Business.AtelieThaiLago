import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { PIPELINE_STAGES, ETAPA } from '../etapas';
import {
    Envio, LIMITE_TEXTO, LeadLista, ListaForm, ListaMensagem, arquivarLista, carregarEnvios, carregarLeadsParaListas, carregarListas,
    leadsDaLista, salvarLista, textoDoLead, validarLista,
} from '../listasMensagem';

const VAZIO: ListaForm = { titulo: '', texto: '', origem: null, etapas: [ETAPA.novo] };
const NOME_EXEMPLO = 'Ana & João';
const QUALQUER = '__qualquer';

// Mensagens prontas para um grupo de leads (ex.: as noivas de uma feira).
const ListasMensagem = () => {
    const [listas, setListas] = useState<ListaMensagem[]>([]);
    const [leads, setLeads] = useState<LeadLista[]>([]);
    const [envios, setEnvios] = useState<Envio[]>([]);
    const [form, setForm] = useState<ListaForm>(VAZIO);
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [aberto, setAberto] = useState(false);
    const [verArquivadas, setVerArquivadas] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState('');
    const [aviso, setAviso] = useState('');

    const carregar = async () => {
        const [l, ld, e] = await Promise.all([carregarListas(), carregarLeadsParaListas(), carregarEnvios()]);
        setListas(l);
        setLeads(ld);
        setEnvios(e);
    };

    useEffect(() => { carregar().catch(e => setErro(e.message)); }, []);

    const origens = useMemo(
        () => [...new Set(leads.map(l => (l.source || '').trim()).filter(Boolean))].sort(),
        [leads],
    );

    const contagem = (lista: Pick<ListaMensagem, 'id' | 'origem' | 'etapas'>) => {
        const enviados = new Set(envios.filter(e => e.lista_id === lista.id).map(e => e.lead_id));
        const pendentes = leadsDaLista(lista, leads).filter(l => !enviados.has(l.id)).length;
        return { pendentes, enviados: enviados.size };
    };

    const abrirNovo = () => {
        setForm(VAZIO);
        setEditandoId(null);
        setAberto(true);
        setErro('');
        setAviso('');
    };

    const abrirEdicao = (l: ListaMensagem) => {
        setForm({ titulo: l.titulo, texto: l.texto, origem: l.origem, etapas: l.etapas });
        setEditandoId(l.id);
        setAberto(true);
        setErro('');
        setAviso('');
    };

    const executar = async (acao: () => Promise<void>, sucesso: string) => {
        setOcupado(true);
        setErro('');
        setAviso('');
        try {
            await acao();
            await carregar();
            setAviso(sucesso);
        } catch (falha: any) {
            setErro(falha.message);
        } finally {
            setOcupado(false);
        }
    };

    const salvar = (e: React.FormEvent) => {
        e.preventDefault();
        const problema = validarLista(form);
        if (problema) { setErro(problema); return; }
        executar(async () => {
            await salvarLista(form, editandoId ?? undefined);
            setAberto(false);
        }, editandoId ? 'Lista atualizada.' : 'Lista criada. Clique em Enviar para começar.');
    };

    const alternarEtapa = (etapa: string) =>
        setForm(f => ({ ...f, etapas: f.etapas.includes(etapa) ? f.etapas.filter(x => x !== etapa) : [...f.etapas, etapa] }));

    const alcance = contagem({ id: editandoId || '', origem: form.origem, etapas: form.etapas });
    const visiveis = listas.filter(l => verArquivadas || !l.arquivada);
    const arquivadas = listas.filter(l => l.arquivada).length;

    const campo = 'w-full bg-surface border-2 border-secondary p-2.5 text-sm focus:border-primary outline-none';
    const rotulo = 'block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1';

    return (
        <section className="bg-white border-2 border-secondary p-4 md:p-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg font-bold text-secondary">Mensagens para listas</h2>
                    <p className="text-sm text-gray-600 mt-1">
                        Uma mensagem pronta para um grupo, como as noivas de uma feira. Na hora de enviar, cada lead tem o botão do WhatsApp já com o texto e o nome dela.
                        Ao marcar "Enviei", ela entra no follow-up normal: se não responder em 3 dias, volta no Falar hoje.
                    </p>
                </div>
                <button type="button" onClick={abrirNovo}
                    className="h-11 px-4 bg-primary text-white border-2 border-secondary rounded-sm text-xs font-bold uppercase flex items-center gap-1 shrink-0">
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    Nova lista
                </button>
            </div>

            {erro && <p className="text-sm font-bold text-accent-error">{erro}</p>}
            {aviso && <p className="text-sm font-bold text-accent-success">{aviso}</p>}

            {aberto && (
                <form onSubmit={salvar} className="flex flex-col gap-3 p-3 md:p-4 bg-secondary/5 border-2 border-secondary/20">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="lista-titulo" className={rotulo}>Nome da lista (só para vocês)</label>
                            <input id="lista-titulo" className={campo} maxLength={80} value={form.titulo}
                                placeholder="Ex.: Feira de Noivas nov/2026" onChange={e => setForm({ ...form, titulo: e.target.value })} />
                        </div>
                        <div>
                            <label htmlFor="lista-origem" className={rotulo}>Para quem vai: origem do lead</label>
                            <select id="lista-origem" className={`${campo} appearance-none`} value={form.origem ?? QUALQUER}
                                onChange={e => setForm({ ...form, origem: e.target.value === QUALQUER ? null : e.target.value })}>
                                <option value={QUALQUER}>Qualquer origem</option>
                                {form.origem && !origens.includes(form.origem) && <option value={form.origem}>{form.origem}</option>}
                                {origens.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </div>
                    </div>
                    <fieldset>
                        <legend className={rotulo}>Etapas (nenhuma marcada = todas)</legend>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                            {PIPELINE_STAGES.map(etapa => (
                                <label key={etapa} className="flex items-center gap-1.5 text-sm text-secondary cursor-pointer">
                                    <input type="checkbox" className="accent-primary" checked={form.etapas.includes(etapa)} onChange={() => alternarEtapa(etapa)} />
                                    {etapa}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                    <p className="text-sm font-medium text-secondary">
                        Hoje essa lista alcança <strong>{alcance.pendentes}</strong> lead{alcance.pendentes === 1 ? '' : 's'}
                        {alcance.enviados > 0 && <> que ainda não receberam ({alcance.enviados} já receberam)</>}.
                    </p>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="lista-texto" className={rotulo}>Mensagem</label>
                            <textarea id="lista-texto" rows={8} className={`${campo} resize-y`} value={form.texto}
                                placeholder={'Oi {nome}! Aqui é a Thai, do ateliê Thai Lago. A gente se conheceu na feira de noivas...'}
                                onChange={e => setForm({ ...form, texto: e.target.value })} />
                            <p className={`mt-1 text-xs font-mono ${form.texto.length > LIMITE_TEXTO ? 'text-accent-error font-bold' : 'text-gray-500'}`}>
                                {form.texto.length} de {LIMITE_TEXTO} caracteres. Escreva {'{nome}'} onde vai o nome.
                            </p>
                        </div>
                        <div>
                            <p className={rotulo}>Como fica no WhatsApp</p>
                            <div className="min-h-[11rem] bg-green-50 border-2 border-green-200 p-3 text-sm text-secondary whitespace-pre-wrap break-words">
                                {form.texto ? textoDoLead(form, { name: NOME_EXEMPLO }) : <span className="text-gray-400">A prévia aparece aqui.</span>}
                            </div>
                        </div>
                    </div>
                    {form.texto.trim() && !form.texto.includes('{nome}') && (
                        <p className="text-sm font-medium text-amber-700">Este texto não tem {'{nome}'}, então a mensagem vai sem o nome.</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                        <button type="submit" disabled={ocupado}
                            className="h-11 px-4 bg-primary text-white border-2 border-secondary rounded-sm text-xs font-bold uppercase disabled:opacity-50">
                            Salvar
                        </button>
                        <button type="button" disabled={ocupado} onClick={() => setAberto(false)}
                            className="h-11 px-4 bg-white text-gray-600 border-2 border-gray-300 rounded-sm text-xs font-bold uppercase">
                            Cancelar
                        </button>
                    </div>
                </form>
            )}

            {visiveis.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhuma lista ainda.</p>
            ) : (
                <ul className="flex flex-col divide-y divide-secondary/10 border-2 border-secondary/10">
                    {visiveis.map(l => {
                        const c = contagem(l);
                        return (
                            <li key={l.id} className={`p-3 flex flex-col sm:flex-row sm:items-center gap-2 ${l.arquivada ? 'opacity-60' : ''}`}>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-secondary break-words">
                                        {l.titulo}
                                        {l.arquivada && <span className="ml-2 text-[10px] font-mono uppercase text-gray-500">arquivada</span>}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {l.origem || 'Qualquer origem'} · {l.etapas.length ? l.etapas.join(', ') : 'todas as etapas'}
                                    </p>
                                    <p className="text-xs font-mono text-gray-600 mt-0.5">{c.enviados} enviada{c.enviados === 1 ? '' : 's'} · {c.pendentes} pendente{c.pendentes === 1 ? '' : 's'}</p>
                                </div>
                                <div className="flex gap-1 shrink-0 items-center">
                                    {!l.arquivada && (
                                        <Link to={`/mensagens/listas/${l.id}`}
                                            className="h-10 px-3 bg-green-600 text-white border-2 border-secondary rounded-sm text-xs font-bold uppercase flex items-center gap-1 hover:bg-green-700">
                                            <span className="material-symbols-outlined text-[18px]">send</span>
                                            Enviar
                                        </Link>
                                    )}
                                    <button type="button" disabled={ocupado} onClick={() => abrirEdicao(l)} title="Editar"
                                        className="p-2 text-gray-500 hover:text-blue-600"><span className="material-symbols-outlined text-[20px]">edit</span></button>
                                    <button type="button" disabled={ocupado} title={l.arquivada ? 'Reativar' : 'Arquivar'}
                                        onClick={() => executar(() => arquivarLista(l.id, !l.arquivada), l.arquivada ? 'Lista reativada.' : 'Lista arquivada.')}
                                        className="p-2 text-gray-500 hover:text-secondary">
                                        <span className="material-symbols-outlined text-[20px]">{l.arquivada ? 'unarchive' : 'archive'}</span>
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
            {arquivadas > 0 && (
                <button type="button" onClick={() => setVerArquivadas(v => !v)} className="self-start text-xs font-bold text-gray-500 hover:text-primary">
                    {verArquivadas ? 'Esconder arquivadas' : `Ver arquivadas (${arquivadas})`}
                </button>
            )}
        </section>
    );
};

export default ListasMensagem;
