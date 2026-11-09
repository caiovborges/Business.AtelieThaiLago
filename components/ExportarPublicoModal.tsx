import React, { useEffect, useMemo, useState } from 'react';
import {
    Exportacao, PUBLICOS, Pessoa, Publico, carregarHistorico, carregarPessoas, gerarCsv, montarLista, nomeArquivo, registrarExportacao,
} from '../publicoMeta';

interface Props {
    aberto: boolean;
    onClose: () => void;
    // Leads da lista da aba Todos, com os filtros da tela aplicados
    idsFiltrados: string[];
}

const MINIMO_META = 100;
const FILTRO = 'filtro';

const hojeISO = () => new Date().toLocaleDateString('sv-SE');
const dataHora = (iso: string) => {
    const d = new Date(iso);
    return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

const ExportarPublicoModal = ({ aberto, onClose, idsFiltrados }: Props) => {
    const [pessoas, setPessoas] = useState<Pessoa[]>([]);
    const [historico, setHistorico] = useState<Exportacao[]>([]);
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState('');
    const [aviso, setAviso] = useState('');
    const [publicoId, setPublicoId] = useState(PUBLICOS[0].id);
    const [nomePublico, setNomePublico] = useState(PUBLICOS[0].nome);
    const [servico, setServico] = useState('');
    const [uf, setUf] = useState('');
    const [somenteNovos, setSomenteNovos] = useState(true);
    const [baixando, setBaixando] = useState(false);

    const carregar = async () => {
        setCarregando(true);
        setErro('');
        try {
            const [p, h] = await Promise.all([carregarPessoas(), carregarHistorico()]);
            setPessoas(p);
            setHistorico(h);
        } catch (e: any) {
            setErro(e.message);
        }
        setCarregando(false);
    };

    useEffect(() => {
        if (aberto) { setAviso(''); carregar(); }
    }, [aberto]);

    const publicos: Publico[] = useMemo(() => {
        const ids = new Set(idsFiltrados.map(id => `lead:${id}`));
        return [
            ...PUBLICOS,
            {
                id: FILTRO,
                nome: 'Lista filtrada da tela',
                uso: `Os ${idsFiltrados.length} leads que estão na aba Todos agora, com os filtros que você escolheu lá. Use para montar um público sob medida.`,
                filtrar: p => ids.has(p.chave),
            },
        ];
    }, [idsFiltrados]);

    const publico = publicos.find(p => p.id === publicoId) || publicos[0];

    const escolherPublico = (id: string) => {
        const novo = publicos.find(p => p.id === id)!;
        setPublicoId(id);
        setNomePublico(novo.nome);
    };

    const servicos = useMemo(() => [...new Set(pessoas.flatMap(p => p.servicos))].filter(Boolean).sort(), [pessoas]);
    const ufs = useMemo(() => [...new Set(pessoas.map(p => p.uf).filter(Boolean) as string[])].sort(), [pessoas]);

    const nomeFinal = nomePublico.trim() || publico.nome;
    const jaEnviadas = useMemo(() => {
        if (!somenteNovos) return new Set<string>();
        return new Set(historico.filter(h => h.publico.trim().toLowerCase() === nomeFinal.toLowerCase()).flatMap(h => h.pessoas));
    }, [historico, nomeFinal, somenteNovos]);
    const vezesEnviado = historico.filter(h => h.publico.trim().toLowerCase() === nomeFinal.toLowerCase()).length;

    const resultado = useMemo(() => {
        const hoje = hojeISO();
        const escolhidas = pessoas
            .filter(p => publico.filtrar(p, hoje))
            .filter(p => !servico || p.servicos.includes(servico))
            .filter(p => !uf || p.uf === uf);
        return montarLista(escolhidas, jaEnviadas);
    }, [pessoas, publico, servico, uf, jaEnviadas]);

    const baixar = async () => {
        setErro('');
        setAviso('');
        if (!resultado.linhas.length) return;
        setBaixando(true);
        const csv = gerarCsv(resultado.linhas, !!publico.comValor);
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = nomeArquivo(nomeFinal, hojeISO());
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        try {
            await registrarExportacao(nomeFinal, resultado.linhas);
            setAviso(`Arquivo baixado com ${resultado.linhas.length} pessoas e registrado no histórico de "${nomeFinal}".`);
            setHistorico(await carregarHistorico());
        } catch (e: any) {
            setErro(e.message);
        }
        setBaixando(false);
    };

    if (!aberto) return null;

    const rotulo = 'block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1';
    const campo = 'w-full bg-white border-2 border-secondary p-2 font-mono text-sm focus:border-primary outline-none';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl border-2 border-secondary" onClick={e => e.stopPropagation()}>
                <header className="bg-secondary p-4 flex justify-between items-center sticky top-0 z-10 gap-4">
                    <div className="min-w-0">
                        <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider">Exportar para a Meta</h2>
                        <p className="text-sm text-white/70">Lista de clientes para público personalizado, semelhante ou exclusão</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Fechar janela" className="text-white hover:text-primary transition-colors">
                        <span className="material-symbols-outlined text-2xl">close</span>
                    </button>
                </header>

                <div className="p-4 md:p-6 flex flex-col gap-4">
                    {erro && <div className="bg-red-50 border-l-4 border-accent-error p-3 text-accent-error font-bold text-sm">{erro}</div>}
                    {aviso && <div className="bg-green-50 border-l-4 border-accent-success p-3 text-accent-success font-bold text-sm">{aviso}</div>}

                    <div>
                        <label htmlFor="exp-publico" className={rotulo}>Público</label>
                        <select id="exp-publico" className={`${campo} appearance-none`} value={publicoId} onChange={e => escolherPublico(e.target.value)}>
                            {publicos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                        </select>
                        <p className="mt-2 text-sm text-gray-600">{publico.uso}</p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="exp-servico" className={rotulo}>Serviço de interesse</label>
                            <select id="exp-servico" className={`${campo} appearance-none`} value={servico} onChange={e => setServico(e.target.value)}>
                                <option value="">Todos os serviços</option>
                                {servicos.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="exp-uf" className={rotulo}>Estado</label>
                            <select id="exp-uf" className={`${campo} appearance-none`} value={uf} onChange={e => setUf(e.target.value)}>
                                <option value="">Todos os estados</option>
                                {ufs.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <p className="mt-1 text-xs text-gray-400">Só os contatos com cidade cadastrada têm estado.</p>
                        </div>
                    </div>

                    <div>
                        <label htmlFor="exp-nome" className={rotulo}>Nome do público (igual ao da Meta)</label>
                        <input id="exp-nome" className={campo} value={nomePublico} maxLength={60} onChange={e => setNomePublico(e.target.value)} />
                        <p className="mt-1 text-xs text-gray-400">
                            {vezesEnviado
                                ? `Já exportado ${vezesEnviado}x com este nome.`
                                : 'Ainda não exportado com este nome.'} O histórico usa este nome para saber quem já subiu.
                        </p>
                    </div>

                    <label className="flex items-start gap-2 text-sm text-secondary cursor-pointer">
                        <input type="checkbox" className="mt-0.5 accent-primary" checked={somenteNovos} onChange={e => setSomenteNovos(e.target.checked)} />
                        <span>
                            <strong>Só quem ainda não foi exportado para este público.</strong>{' '}
                            Na Meta, use "Adicionar clientes" no público que já existe. Desmarque para baixar a lista completa e substituir.
                        </span>
                    </label>

                    <section className="bg-secondary/5 border-2 border-secondary/20 p-3">
                        {carregando ? (
                            <p className="text-sm font-mono text-gray-500">Carregando contatos...</p>
                        ) : (
                            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                                <div><dt className="text-xs text-gray-500 uppercase">No público</dt><dd className="font-bold text-secondary">{resultado.total}</dd></div>
                                <div><dt className="text-xs text-gray-500 uppercase">Já exportados</dt><dd className="font-bold text-secondary">{resultado.jaEnviados}</dd></div>
                                <div><dt className="text-xs text-gray-500 uppercase">Sem telefone/e-mail</dt><dd className="font-bold text-secondary">{resultado.semContato}</dd></div>
                                <div><dt className="text-xs text-gray-500 uppercase">Repetidos juntados</dt><dd className="font-bold text-secondary">{resultado.juntados}</dd></div>
                                <div className="col-span-2"><dt className="text-xs text-gray-500 uppercase">Vão no arquivo</dt><dd className="text-2xl font-black text-primary">{resultado.linhas.length}</dd></div>
                            </dl>
                        )}
                        {!carregando && resultado.linhas.length > 0 && resultado.linhas.length < MINIMO_META && !somenteNovos && (
                            <p className="mt-2 text-xs font-bold text-amber-700">
                                A Meta só usa públicos com pelo menos {MINIMO_META} pessoas encontradas. Para semelhante, use "Todos os leads" como base enquanto houver poucos fechados.
                            </p>
                        )}
                    </section>

                    <button type="button" disabled={carregando || baixando || !resultado.linhas.length} onClick={baixar}
                        className="h-12 bg-primary text-white font-display font-bold uppercase tracking-wider border-2 border-secondary shadow-hard flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        <span className="material-symbols-outlined text-[20px]">download</span>
                        Baixar arquivo para a Meta
                    </button>

                    <details className="text-sm text-gray-600">
                        <summary className="cursor-pointer font-bold text-secondary">Como subir na Meta</summary>
                        <ol className="mt-2 ml-5 list-decimal flex flex-col gap-1">
                            <li>Gerenciador de Anúncios → Públicos → Criar público → Público personalizado → Lista de clientes.</li>
                            <li>Envie o arquivo. As colunas já vêm com os nomes que a Meta reconhece (e-mail, telefone, nome, sobrenome, cidade, estado, país).</li>
                            <li>No público "Leads fechados", a coluna value é o valor do contrato: quando a Meta perguntar, indique que a lista tem valor do cliente e use-a como origem de um semelhante baseado em valor.</li>
                            <li>Para não repetir: nas próximas vezes, deixe marcado "só quem ainda não foi exportado" e, na Meta, abra o público e use "Adicionar clientes".</li>
                            <li>Exclusão: na campanha, em Público → Excluir, escolha só "Leads fechados". Os outros leads continuam vendo os anúncios, porque ainda podem fechar.</li>
                        </ol>
                        <p className="mt-2">A Meta criptografa os dados no seu navegador antes de enviar. Mesmo assim, apague o arquivo do computador depois de subir.</p>
                    </details>

                    {historico.length > 0 && (
                        <section>
                            <h3 className={rotulo}>Últimas exportações</h3>
                            <ul className="divide-y divide-secondary/10 border-2 border-secondary/10">
                                {historico.slice(0, 8).map(h => (
                                    <li key={h.id} className="flex justify-between gap-2 p-2 text-sm">
                                        <span className="font-bold text-secondary truncate">{h.publico}</span>
                                        <span className="font-mono text-gray-500 whitespace-nowrap">{h.quantidade} · {dataHora(h.criado_em)}</span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ExportarPublicoModal;
