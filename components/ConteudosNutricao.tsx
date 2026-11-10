import React, { useEffect, useState } from 'react';
import { SERVICES } from './AddLeadModal';
import { Conteudo, ConteudoForm, apagarConteudo, carregarConteudos, conteudos, salvarConteudo, textoNutricao, validarConteudo } from '../nutricao';

const VAZIO: ConteudoForm = { titulo: '', link: '', servico: null, texto: null, ativo: true, ordem: 0 };
const NOME_EXEMPLO = 'Ana & João';

// Biblioteca de fotos e videos (links) que vao nos contatos de nutricao.
const ConteudosNutricao = () => {
    const [lista, setLista] = useState<Conteudo[]>(conteudos());
    const [form, setForm] = useState<ConteudoForm>(VAZIO);
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [aberto, setAberto] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState('');
    const [aviso, setAviso] = useState('');

    useEffect(() => { carregarConteudos().then(setLista); }, []);

    const abrirNovo = () => {
        setForm({ ...VAZIO, ordem: (lista.at(-1)?.ordem ?? 0) + 1 });
        setEditandoId(null);
        setAberto(true);
        setErro('');
        setAviso('');
    };

    const abrirEdicao = (c: Conteudo) => {
        setForm({ titulo: c.titulo, link: c.link, servico: c.servico, texto: c.texto, ativo: c.ativo, ordem: c.ordem });
        setEditandoId(c.id);
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
            setLista([...conteudos()]);
            setAviso(sucesso);
        } catch (falha: any) {
            setErro(falha.message);
        } finally {
            setOcupado(false);
        }
    };

    const salvar = (e: React.FormEvent) => {
        e.preventDefault();
        const problema = validarConteudo(form);
        if (problema) { setErro(problema); return; }
        executar(async () => {
            await salvarConteudo(form, editandoId ?? undefined);
            setAberto(false);
        }, editandoId ? 'Conteúdo atualizado.' : 'Conteúdo adicionado.');
    };

    const alternarAtivo = (c: Conteudo) =>
        executar(() => salvarConteudo({ ...c, ativo: !c.ativo }, c.id), c.ativo ? 'Conteúdo pausado.' : 'Conteúdo reativado.');

    const apagar = (c: Conteudo) => {
        if (!window.confirm(`Apagar "${c.titulo}" da biblioteca? Os registros de quem já recebeu continuam, sem o nome do conteúdo.`)) return;
        executar(() => apagarConteudo(c.id), 'Conteúdo apagado.');
    };

    const campo = 'w-full bg-surface border-2 border-secondary p-2.5 text-sm focus:border-primary outline-none';
    const rotulo = 'block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1';

    return (
        <section className="bg-white border-2 border-secondary p-4 md:p-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="font-display text-lg font-bold text-secondary">Conteúdos para nutrir leads</h2>
                    <p className="text-sm text-gray-600 mt-1">
                        Fotos e vídeos do ateliê (links do Instagram, Reels ou Drive) enviados aos leads com casamento longe, um a cada 45 dias.
                        O sistema escolhe o próximo que o lead ainda não recebeu, primeiro os do serviço que ele pediu.
                    </p>
                </div>
                <button type="button" onClick={abrirNovo}
                    className="h-11 px-4 bg-primary text-white border-2 border-secondary rounded-sm text-xs font-bold uppercase flex items-center gap-1 shrink-0">
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    Novo conteúdo
                </button>
            </div>

            {erro && <p className="text-sm font-bold text-accent-error">{erro}</p>}
            {aviso && <p className="text-sm font-bold text-accent-success">{aviso}</p>}

            {aberto && (
                <form onSubmit={salvar} className="flex flex-col gap-3 p-3 md:p-4 bg-secondary/5 border-2 border-secondary/20">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="conteudo-titulo" className={rotulo}>Nome (só para vocês)</label>
                            <input id="conteudo-titulo" className={campo} maxLength={120} value={form.titulo}
                                placeholder="Ex.: Reels pintura ao vivo na praia" onChange={e => setForm({ ...form, titulo: e.target.value })} />
                        </div>
                        <div>
                            <label htmlFor="conteudo-link" className={rotulo}>Link</label>
                            <input id="conteudo-link" className={campo} type="url" inputMode="url" value={form.link}
                                placeholder="https://www.instagram.com/reel/..." onChange={e => setForm({ ...form, link: e.target.value })} />
                        </div>
                        <div>
                            <label htmlFor="conteudo-servico" className={rotulo}>Serviço</label>
                            <select id="conteudo-servico" className={`${campo} appearance-none`} value={form.servico || ''}
                                onChange={e => setForm({ ...form, servico: e.target.value || null })}>
                                <option value="">Serve para todos</option>
                                {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer md:self-end md:pb-3">
                            <input type="checkbox" className="accent-primary" checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} />
                            Ativo (entra no rodízio)
                        </label>
                    </div>
                    <div>
                        <label htmlFor="conteudo-texto" className={rotulo}>Texto próprio (opcional)</label>
                        <textarea id="conteudo-texto" rows={4} maxLength={2000} className={`${campo} resize-y`} value={form.texto || ''}
                            placeholder="Vazio = usa a mensagem de Nutrição desta tela. Use {nome} e {link}."
                            onChange={e => setForm({ ...form, texto: e.target.value || null })} />
                    </div>
                    <div>
                        <p className={rotulo}>Como fica no WhatsApp</p>
                        <div className="bg-green-50 border-2 border-green-200 p-3 text-sm text-secondary whitespace-pre-wrap break-words">
                            {textoNutricao({ name: NOME_EXEMPLO }, { id: '', ...form, link: form.link || 'https://…' } as Conteudo)}
                        </div>
                    </div>
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

            {lista.length === 0 ? (
                <p className="text-sm text-gray-500">
                    Nenhum conteúdo ainda. Enquanto a lista estiver vazia, a mensagem de nutrição vai sem link.
                </p>
            ) : (
                <ul className="flex flex-col divide-y divide-secondary/10 border-2 border-secondary/10">
                    {lista.map(c => (
                        <li key={c.id} className={`p-3 flex flex-col sm:flex-row sm:items-center gap-2 ${c.ativo ? '' : 'opacity-60'}`}>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-secondary break-words">
                                    {c.titulo}
                                    {!c.ativo && <span className="ml-2 text-[10px] font-mono uppercase text-gray-500">pausado</span>}
                                </p>
                                <p className="text-xs text-gray-500 flex flex-wrap gap-x-3">
                                    <span>{c.servico || 'Todos os serviços'}</span>
                                    <a href={c.link} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate max-w-[260px]">{c.link}</a>
                                </p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                                <button type="button" disabled={ocupado} onClick={() => abrirEdicao(c)} title="Editar"
                                    className="p-2 text-gray-500 hover:text-blue-600"><span className="material-symbols-outlined text-[20px]">edit</span></button>
                                <button type="button" disabled={ocupado} onClick={() => alternarAtivo(c)} title={c.ativo ? 'Pausar' : 'Reativar'}
                                    className="p-2 text-gray-500 hover:text-secondary"><span className="material-symbols-outlined text-[20px]">{c.ativo ? 'pause_circle' : 'play_circle'}</span></button>
                                <button type="button" disabled={ocupado} onClick={() => apagar(c)} title="Apagar"
                                    className="p-2 text-gray-500 hover:text-accent-error"><span className="material-symbols-outlined text-[20px]">delete</span></button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export default ConteudosNutricao;
