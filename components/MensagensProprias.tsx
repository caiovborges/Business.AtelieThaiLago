import React, { useEffect, useState } from 'react';
import { montarTexto } from '../leadContato';
import { LIMITE_PROPRIA, MensagemPropria, apagarPropria, carregarProprias, mensagensProprias, salvarPropria, validarPropria } from '../mensagensProprias';

const NOME_EXEMPLO = 'Ana & João';

// Mensagens criadas pela Thai, para escolher no campo "Mensagem do botão WhatsApp" do lead.
const MensagensProprias = () => {
    const [lista, setLista] = useState<MensagemPropria[]>(mensagensProprias());
    const [titulo, setTitulo] = useState('');
    const [texto, setTexto] = useState('');
    const [editandoId, setEditandoId] = useState<string | null>(null);
    const [aberto, setAberto] = useState(false);
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState('');
    const [aviso, setAviso] = useState('');

    useEffect(() => { carregarProprias().then(l => setLista([...l])); }, []);

    const abrir = (m?: MensagemPropria) => {
        setTitulo(m?.titulo ?? '');
        setTexto(m?.texto ?? '');
        setEditandoId(m?.id ?? null);
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
            setLista([...mensagensProprias()]);
            setAviso(sucesso);
        } catch (falha: any) {
            setErro(falha.message);
        } finally {
            setOcupado(false);
        }
    };

    const salvar = (e: React.FormEvent) => {
        e.preventDefault();
        const problema = validarPropria(titulo, texto);
        if (problema) { setErro(problema); return; }
        executar(async () => {
            await salvarPropria(titulo, texto, editandoId ?? undefined);
            setAberto(false);
        }, editandoId ? 'Mensagem atualizada.' : 'Mensagem criada. Ela já aparece no campo "Mensagem do botão WhatsApp" do lead.');
    };

    const apagar = (m: MensagemPropria) => {
        if (!window.confirm(`Apagar a mensagem "${m.titulo}"?`)) return;
        executar(() => apagarPropria(m.id), 'Mensagem apagada.');
    };

    const campo = 'w-full bg-surface border-2 border-secondary p-2.5 text-sm focus:border-primary outline-none';
    const rotulo = 'block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1';

    return (
        <section className="bg-white border-2 border-secondary p-4 md:p-6 flex flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <h2 className="font-display text-lg font-bold text-secondary">Minhas mensagens</h2>
                    <p className="text-sm text-gray-600 mt-1">
                        Mensagens suas, para qualquer ocasião (ex.: um recado para as noivas da feira). No perfil do lead, escolha a mensagem no campo
                        "Mensagem do botão WhatsApp" e clique em WhatsApp: ela abre pronta, com o nome.
                    </p>
                </div>
                <button type="button" onClick={() => abrir()}
                    className="h-11 px-4 bg-primary text-white border-2 border-secondary rounded-sm text-xs font-bold uppercase flex items-center gap-1 shrink-0">
                    <span className="material-symbols-outlined text-[18px]">add</span>
                    Nova mensagem
                </button>
            </div>

            {erro && <p className="text-sm font-bold text-accent-error">{erro}</p>}
            {aviso && <p className="text-sm font-bold text-accent-success">{aviso}</p>}

            {aberto && (
                <form onSubmit={salvar} className="flex flex-col gap-3 p-3 md:p-4 bg-secondary/5 border-2 border-secondary/20">
                    <div>
                        <label htmlFor="propria-titulo" className={rotulo}>Nome (aparece na lista de mensagens)</label>
                        <input id="propria-titulo" className={campo} maxLength={80} value={titulo}
                            placeholder="Ex.: Feira de noivas" onChange={e => setTitulo(e.target.value)} />
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="propria-texto" className={rotulo}>Mensagem</label>
                            <textarea id="propria-texto" rows={7} className={`${campo} resize-y`} value={texto}
                                placeholder={'Oi {nome}! Aqui é a Thai, do ateliê Thai Lago. A gente se conheceu na feira de noivas...'}
                                onChange={e => setTexto(e.target.value)} />
                            <p className={`mt-1 text-xs font-mono ${texto.length > LIMITE_PROPRIA ? 'text-accent-error font-bold' : 'text-gray-500'}`}>
                                {texto.length} de {LIMITE_PROPRIA} caracteres. Escreva {'{nome}'} onde vai o nome.
                            </p>
                        </div>
                        <div>
                            <p className={rotulo}>Como fica no WhatsApp</p>
                            <div className="min-h-[10rem] bg-green-50 border-2 border-green-200 p-3 text-sm text-secondary whitespace-pre-wrap break-words">
                                {texto ? montarTexto(texto, NOME_EXEMPLO) : <span className="text-gray-400">A prévia aparece aqui.</span>}
                            </div>
                        </div>
                    </div>
                    {texto.trim() && !texto.includes('{nome}') && (
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

            {lista.length === 0 ? (
                <p className="text-sm text-gray-500">Nenhuma mensagem sua ainda.</p>
            ) : (
                <ul className="flex flex-col divide-y divide-secondary/10 border-2 border-secondary/10">
                    {lista.map(m => (
                        <li key={m.id} className="p-3 flex flex-col sm:flex-row sm:items-start gap-2">
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-secondary break-words">{m.titulo}</p>
                                <p className="text-xs text-gray-500 whitespace-pre-wrap break-words line-clamp-2">{m.texto}</p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                                <button type="button" disabled={ocupado} onClick={() => abrir(m)} title="Editar"
                                    className="p-2 text-gray-500 hover:text-blue-600"><span className="material-symbols-outlined text-[20px]">edit</span></button>
                                <button type="button" disabled={ocupado} onClick={() => apagar(m)} title="Apagar"
                                    className="p-2 text-gray-500 hover:text-accent-error"><span className="material-symbols-outlined text-[20px]">delete</span></button>
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
};

export default MensagensProprias;
