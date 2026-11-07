import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { CategoriaLancamento, dataLocal, excluirLancamento, nomeDoMes } from '../lancamentos';
import { formatarDia, somarMeses } from '../parcelas';
import {
    ContaFixa, MesResolvido, Pendencia, SugestaoConta, dataDoPagamento, erroDaConta, marcarSemConta,
    pagarConta, pendenciasDasContas, primeiroDoMes, sugerirContas,
} from '../contasFixas';
import { formatarReais, parseValor } from '../valores';

interface Rascunho {
    id: string | null;
    descricao: string;
    valor: string;
    dia: string;
    categoriaId: string;
    inicio: string;
}

const paraCampo = (valor: number) => Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const chaveDe = (p: { conta: { id: string }; mes: string }) => `${p.conta.id}|${p.mes}`;

const estiloInput = 'w-full bg-surface border-2 border-secondary p-2.5 font-mono text-sm focus:border-primary outline-none';
const estiloRotulo = 'block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1';
const botaoSecundario = 'h-11 px-3 bg-white text-secondary border-2 border-secondary rounded-sm flex items-center justify-center gap-1 text-xs font-bold uppercase hover:bg-gray-50 disabled:opacity-50';

const ContasFixas = () => {
    const [contas, setContas] = useState<ContaFixa[]>([]);
    const [resolvidos, setResolvidos] = useState<MesResolvido[]>([]);
    const [categorias, setCategorias] = useState<CategoriaLancamento[]>([]);
    const [sugestoes, setSugestoes] = useState<SugestaoConta[]>([]);
    const [valores, setValores] = useState<Record<string, string>>({});
    const [rascunho, setRascunho] = useState<Rascunho | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState('');
    const [erroJanela, setErroJanela] = useState('');
    const [aviso, setAviso] = useState('');

    const carregar = async () => {
        const [contasRes, mesesRes, categoriasRes, lancamentosRes] = await Promise.all([
            supabase.from('contas_fixas').select('*').order('descricao'),
            supabase.from('contas_fixas_meses').select('conta_id, mes, transacao_id, transacoes(valor, data)'),
            supabase.from('categorias').select('*').order('nome'),
            supabase.from('transacoes').select('descricao, valor, data, categoria_id').eq('tipo', 'despesa').is('evento_id', null),
        ]);
        const falha = contasRes.error || mesesRes.error || categoriasRes.error || lancamentosRes.error;
        setErro(falha ? 'Não foi possível carregar as contas fixas: ' + falha.message : '');
        const listaContas = (contasRes.data || []) as ContaFixa[];
        if (contasRes.data) setContas(listaContas);
        if (mesesRes.data) setResolvidos(mesesRes.data as unknown as MesResolvido[]);
        if (categoriasRes.data) setCategorias(categoriasRes.data as CategoriaLancamento[]);
        if (lancamentosRes.data && contasRes.data) setSugestoes(sugerirContas(lancamentosRes.data as any, listaContas));
        setValores({});
        setCarregando(false);
    };

    useEffect(() => { carregar(); }, []);

    if (carregando) {
        return (
            <div className="flex-1 flex items-center justify-center bg-background-light">
                <span className="animate-spin material-symbols-outlined text-4xl text-primary">progress_activity</span>
            </div>
        );
    }

    const hoje = dataLocal();
    const mesAtual = primeiroDoMes(hoje);
    const pendencias = pendenciasDasContas(contas, resolvidos, hoje);
    const doMes = resolvidos.filter(r => r.mes === mesAtual);
    const nomeDaConta = (id: string) => contas.find(c => c.id === id)?.descricao ?? 'Conta';
    const textoValor = (p: Pendencia) => valores[chaveDe(p)] ?? paraCampo(p.conta.valor);
    const totalPendente = pendencias.reduce((soma, p) => soma + parseValor(textoValor(p)), 0);
    const totalPago = doMes.reduce((soma, r) => soma + Number(r.transacoes?.valor ?? 0), 0);
    const totalMensal = contas.filter(c => c.ativa).reduce((soma, c) => soma + Number(c.valor), 0);

    const executar = async (acao: () => Promise<string>) => {
        setOcupado(true);
        setErro('');
        setAviso('');
        try {
            const mensagem = await acao();
            if (mensagem) {
                setAviso(mensagem);
                await carregar();
            }
        } catch (falha: any) {
            setErro(falha.message);
        } finally {
            setOcupado(false);
        }
    };

    const confirmar = (p: Pendencia) => executar(async () => {
        const valor = parseValor(textoValor(p));
        if (!(valor > 0)) throw new Error(`${p.conta.descricao}: informe um valor maior que zero.`);
        await pagarConta(p, valor, dataDoPagamento(p, hoje));
        return `${p.conta.descricao}: ${formatarReais(valor)} lançado no financeiro.`;
    });

    const semConta = (p: Pendencia) => executar(async () => {
        await marcarSemConta(p);
        return `${p.conta.descricao}: ${nomeDoMes(p.mes.slice(0, 7))} marcado sem conta.`;
    });

    const desfazer = (r: MesResolvido) => executar(async () => {
        if (r.transacao_id) {
            const excluida = await excluirLancamento({
                id: r.transacao_id,
                descricao: nomeDaConta(r.conta_id),
                valor: Number(r.transacoes?.valor ?? 0),
            });
            return excluida ? 'Pagamento desfeito. A conta voltou para a lista.' : '';
        }
        const { data, error } = await supabase.from('contas_fixas_meses').delete().eq('conta_id', r.conta_id).eq('mes', r.mes).select('mes');
        if (error || !data || data.length === 0) throw new Error('Não foi possível desfazer. ' + (error?.message ?? ''));
        return 'A conta voltou para a lista.';
    });

    const alternarAtiva = (conta: ContaFixa) => executar(async () => {
        // Ao reativar, os meses em que ficou pausada nao viram pendencia
        const campos = conta.ativa ? { ativa: false } : { ativa: true, inicio: mesAtual };
        const { data, error } = await supabase.from('contas_fixas').update(campos).eq('id', conta.id).select('id');
        if (error || !data || data.length === 0) throw new Error('Não foi possível alterar a conta. ' + (error?.message ?? ''));
        return conta.ativa ? `${conta.descricao} pausada.` : `${conta.descricao} reativada a partir deste mês.`;
    });

    const excluirConta = (conta: ContaFixa) => executar(async () => {
        if (!window.confirm(`Excluir a conta "${conta.descricao}"? Ela para de aparecer todo mês. O que já foi lançado continua no financeiro.`)) return '';
        const { data, error } = await supabase.from('contas_fixas').delete().eq('id', conta.id).select('id');
        if (error || !data || data.length === 0) throw new Error('Não foi possível excluir a conta. ' + (error?.message ?? ''));
        return `${conta.descricao} excluída.`;
    });

    const abrirNova = () => {
        setErroJanela('');
        setRascunho({ id: null, descricao: '', valor: '', dia: '', categoriaId: '', inicio: mesAtual });
    };

    const abrirEdicao = (conta: ContaFixa) => {
        setErroJanela('');
        setRascunho({
            id: conta.id,
            descricao: conta.descricao,
            valor: paraCampo(conta.valor),
            dia: String(conta.dia_vencimento),
            categoriaId: conta.categoria_id ? String(conta.categoria_id) : '',
            inicio: conta.inicio,
        });
    };

    const abrirSugestao = (s: SugestaoConta) => {
        setErroJanela('');
        setRascunho({
            id: null,
            descricao: s.descricao,
            valor: paraCampo(s.valor),
            dia: String(s.dia_vencimento),
            categoriaId: s.categoria_id ? String(s.categoria_id) : '',
            inicio: s.inicio,
        });
    };

    const salvarConta = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!rascunho) return;
        const valor = parseValor(rascunho.valor);
        const dia = Number(rascunho.dia);
        const invalido = erroDaConta({ descricao: rascunho.descricao, valor, dia });
        if (invalido) {
            setErroJanela(invalido);
            return;
        }
        setErroJanela('');
        setOcupado(true);
        const campos = {
            descricao: rascunho.descricao.trim(),
            valor,
            dia_vencimento: dia,
            categoria_id: rascunho.categoriaId ? Number(rascunho.categoriaId) : null,
            inicio: rascunho.inicio,
        };
        const { data, error } = rascunho.id
            ? await supabase.from('contas_fixas').update(campos).eq('id', rascunho.id).select('id')
            : await supabase.from('contas_fixas').insert(campos).select('id');
        setOcupado(false);
        if (error || !data || data.length === 0) {
            setErroJanela('Não foi possível salvar a conta. Nada foi alterado. ' + (error?.message ?? ''));
            return;
        }
        setAviso(rascunho.id ? 'Conta atualizada.' : 'Conta cadastrada.');
        setRascunho(null);
        carregar();
    };

    const opcoesInicio = rascunho
        ? [...new Set([rascunho.inicio, ...[-3, -2, -1, 0, 1, 2].map(n => somarMeses(mesAtual, n))])].sort()
        : [];

    const Cartao = ({ titulo, valor, cor }: { titulo: string; valor: number; cor: string }) => (
        <div className="bg-white border-2 border-secondary p-4 shadow-hard-sm">
            <p className="font-mono text-xs text-gray-500 uppercase tracking-wider">{titulo}</p>
            <p className={`font-mono text-2xl font-bold mt-1 ${cor}`}>{formatarReais(valor)}</p>
        </div>
    );

    return (
        <div className="flex-1 overflow-y-auto bg-background-light p-4 md:p-8">
            <div className="max-w-5xl mx-auto flex flex-col gap-4 md:gap-6">
                <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <h1 className="font-display text-3xl md:text-4xl font-black tracking-tight text-secondary">Contas Fixas</h1>
                        <p className="mt-2 text-sm text-gray-600">Despesas que se repetem. Confirme cada mês e a despesa entra sozinha no financeiro.</p>
                    </div>
                    <button type="button" onClick={abrirNova} className="h-12 px-4 shrink-0 bg-primary text-white border-2 border-secondary shadow-hard flex items-center justify-center gap-2 font-display font-bold text-sm uppercase tracking-wider">
                        <span className="material-symbols-outlined text-[20px]">add</span>
                        Nova conta
                    </button>
                </header>

                {erro && <p className="p-3 bg-accent-error/10 border-2 border-accent-error text-accent-error text-sm font-medium">{erro}</p>}
                {aviso && <p className="p-3 bg-accent-success/10 border-2 border-accent-success text-accent-success text-sm font-medium">{aviso}</p>}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Cartao titulo="A confirmar" valor={totalPendente} cor={pendencias.length > 0 ? 'text-accent-error' : 'text-secondary'} />
                    <Cartao titulo="Pago este mês" valor={totalPago} cor="text-secondary" />
                    <Cartao titulo="Total mensal" valor={totalMensal} cor="text-secondary" />
                </div>

                {contas.length > 0 && pendencias.length === 0 && !erro && (
                    <p className="p-4 text-center text-sm text-gray-500 bg-white border-2 border-secondary/20">Nenhuma conta para confirmar.</p>
                )}

                {pendencias.length > 0 && (
                    <section className="flex flex-col gap-2">
                        <h2 className="font-display font-bold uppercase tracking-wider text-sm text-primary">Para confirmar ({pendencias.length})</h2>
                        {pendencias.map(p => {
                            const atrasada = p.vencimento < hoje;
                            return (
                                <div key={chaveDe(p)} className="bg-white border-2 border-secondary p-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-display font-bold text-secondary break-words">{p.conta.descricao}</p>
                                        <p className={`text-xs font-mono ${atrasada ? 'font-bold text-accent-error' : 'text-gray-500'}`}>
                                            {nomeDoMes(p.mes.slice(0, 7))} · {atrasada ? 'Venceu em' : 'Vence em'} {formatarDia(p.vencimento)}
                                        </p>
                                    </div>
                                    <div className="grid grid-cols-2 sm:flex sm:items-center gap-2 shrink-0">
                                        <input
                                            aria-label={`Valor de ${p.conta.descricao} em ${nomeDoMes(p.mes.slice(0, 7))}`}
                                            inputMode="decimal"
                                            className="col-span-2 sm:w-28 h-11 bg-surface border-2 border-secondary px-2 font-mono text-sm text-right focus:border-primary outline-none"
                                            value={textoValor(p)}
                                            onChange={e => setValores(v => ({ ...v, [chaveDe(p)]: e.target.value }))}
                                        />
                                        <button type="button" disabled={ocupado} onClick={() => confirmar(p)} className="h-11 px-3 bg-primary text-white border-2 border-secondary rounded-sm flex items-center justify-center gap-1 text-xs font-bold uppercase disabled:opacity-50">
                                            <span className="material-symbols-outlined text-[18px]">check</span>
                                            Confirmar
                                        </button>
                                        <button type="button" disabled={ocupado} onClick={() => semConta(p)} className={botaoSecundario}>Não teve</button>
                                    </div>
                                </div>
                            );
                        })}
                    </section>
                )}

                {doMes.length > 0 && (
                    <section className="flex flex-col gap-2">
                        <h2 className="font-display font-bold uppercase tracking-wider text-sm text-accent-success">Resolvidas em {nomeDoMes(mesAtual.slice(0, 7))} ({doMes.length})</h2>
                        {doMes.map(r => (
                            <div key={`${r.conta_id}|${r.mes}`} className="bg-white border-2 border-secondary/30 p-3 flex flex-wrap items-center justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="font-medium text-secondary break-words">{nomeDaConta(r.conta_id)}</p>
                                    <p className="text-xs font-mono text-gray-500">{r.transacao_id ? `Pago em ${formatarDia(r.transacoes?.data)}` : 'Não teve este mês'}</p>
                                </div>
                                <div className="flex items-center gap-3">
                                    {r.transacao_id && <span className="font-mono font-bold text-sm">{formatarReais(Number(r.transacoes?.valor ?? 0))}</span>}
                                    <button type="button" disabled={ocupado} onClick={() => desfazer(r)} className="text-xs font-bold uppercase text-gray-500 hover:text-accent-error disabled:opacity-50">Desfazer</button>
                                </div>
                            </div>
                        ))}
                    </section>
                )}

                {sugestoes.length > 0 && (
                    <details open={contas.length === 0} className="bg-white border-2 border-secondary/30 p-3">
                        <summary className="cursor-pointer font-display font-bold uppercase tracking-wider text-sm text-gray-600">Sugestões do histórico ({sugestoes.length})</summary>
                        <p className="mt-2 text-xs text-gray-500">Despesas gerais que apareceram em pelo menos 3 dos últimos 6 meses. Confira antes de cadastrar: algumas podem variar de valor.</p>
                        <ul className="mt-2 flex flex-col divide-y divide-gray-200">
                            {sugestoes.map(s => (
                                <li key={s.descricao} className="py-2 flex flex-wrap items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className="font-medium text-secondary break-words">{s.descricao}</p>
                                        <p className="text-xs font-mono text-gray-500">{s.meses} meses · último valor {formatarReais(s.valor)}</p>
                                    </div>
                                    <button type="button" onClick={() => abrirSugestao(s)} className={botaoSecundario}>
                                        <span className="material-symbols-outlined text-[18px]">add</span>
                                        Cadastrar
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </details>
                )}

                <section className="flex flex-col gap-2">
                    <h2 className="font-display font-bold uppercase tracking-wider text-sm text-gray-600">Contas cadastradas ({contas.length})</h2>
                    {contas.length === 0 && <p className="p-4 text-center text-sm text-gray-500 bg-white border-2 border-secondary/20">Nenhuma conta cadastrada ainda.</p>}
                    {contas.map(conta => (
                        <div key={conta.id} className={`bg-white border-2 p-3 flex flex-wrap items-center justify-between gap-2 ${conta.ativa ? 'border-secondary/30' : 'border-gray-200 opacity-70'}`}>
                            <div className="min-w-0">
                                <p className="font-medium text-secondary break-words">{conta.descricao}{!conta.ativa && ' (pausada)'}</p>
                                <p className="text-xs font-mono text-gray-500">{formatarReais(Number(conta.valor))} · todo dia {conta.dia_vencimento}</p>
                            </div>
                            <div className="flex items-center gap-1">
                                <button type="button" disabled={ocupado} onClick={() => alternarAtiva(conta)} className="px-2 py-1 text-xs font-bold uppercase text-gray-500 hover:text-primary disabled:opacity-50">
                                    {conta.ativa ? 'Pausar' : 'Reativar'}
                                </button>
                                <button type="button" onClick={() => abrirEdicao(conta)} aria-label={`Editar ${conta.descricao}`} title="Editar" className="p-1 text-gray-500 hover:text-primary">
                                    <span className="material-symbols-outlined text-[18px]">edit</span>
                                </button>
                                <button type="button" disabled={ocupado} onClick={() => excluirConta(conta)} aria-label={`Excluir ${conta.descricao}`} title="Excluir" className="p-1 text-gray-500 hover:text-accent-error disabled:opacity-50">
                                    <span className="material-symbols-outlined text-[18px]">delete</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </section>
            </div>

            {rascunho && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setRascunho(null)}>
                    <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-secondary" onClick={e => e.stopPropagation()}>
                        <header className="bg-secondary p-4 flex justify-between items-center sticky top-0 z-10 gap-4">
                            <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider">{rascunho.id ? 'Editar conta' : 'Nova conta'}</h2>
                            <button type="button" onClick={() => setRascunho(null)} aria-label="Fechar janela" className="text-white hover:text-primary transition-colors">
                                <span className="material-symbols-outlined text-2xl">close</span>
                            </button>
                        </header>
                        <form onSubmit={salvarConta} className="p-4 md:p-6 flex flex-col gap-4">
                            {erroJanela && <div className="bg-red-50 border-l-4 border-accent-error p-3 text-accent-error font-bold text-sm">{erroJanela}</div>}
                            <div>
                                <label htmlFor="conta-descricao" className={estiloRotulo}>Descrição</label>
                                <input id="conta-descricao" className={estiloInput} value={rascunho.descricao} onChange={e => setRascunho({ ...rascunho, descricao: e.target.value })} placeholder="Ex: Hospedagem do site" />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label htmlFor="conta-valor" className={estiloRotulo}>Valor (R$)</label>
                                    <input id="conta-valor" inputMode="decimal" placeholder="0,00" className={`${estiloInput} text-right`} value={rascunho.valor} onChange={e => setRascunho({ ...rascunho, valor: e.target.value })} />
                                </div>
                                <div>
                                    <label htmlFor="conta-dia" className={estiloRotulo}>Dia do vencimento</label>
                                    <input id="conta-dia" type="number" min={1} max={31} className={`${estiloInput} text-right`} value={rascunho.dia} onChange={e => setRascunho({ ...rascunho, dia: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="conta-categoria" className={estiloRotulo}>Categoria</label>
                                <select id="conta-categoria" className={estiloInput} value={rascunho.categoriaId} onChange={e => setRascunho({ ...rascunho, categoriaId: e.target.value })}>
                                    <option value="">Sem categoria</option>
                                    {categorias.filter(c => c.tipo === 'despesa' || String(c.id) === rascunho.categoriaId).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                                </select>
                            </div>
                            <div>
                                <label htmlFor="conta-inicio" className={estiloRotulo}>Primeiro mês</label>
                                <select id="conta-inicio" className={estiloInput} value={rascunho.inicio} onChange={e => setRascunho({ ...rascunho, inicio: e.target.value })}>
                                    {opcoesInicio.map(m => <option key={m} value={m}>{nomeDoMes(m.slice(0, 7))}</option>)}
                                </select>
                                <p className="mt-1 text-xs text-gray-500">Meses já lançados à mão ficam de fora se você escolher o mês seguinte a eles.</p>
                            </div>
                            <button type="submit" disabled={ocupado} className="h-12 bg-primary text-white font-display font-bold uppercase tracking-wider border-2 border-secondary shadow-hard flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                                <span className="material-symbols-outlined text-[20px]">check</span>
                                Salvar
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ContasFixas;
