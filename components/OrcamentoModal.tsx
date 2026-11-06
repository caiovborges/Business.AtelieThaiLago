import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';
import { formatarReais, parseValor } from '../valores';

interface LeadOrcamento {
    id: string;
    name: string;
    status: string;
    event_date: string | null;
    services?: string[] | null;
}

interface OrcamentoModalProps {
    lead: LeadOrcamento | null;
    editarId?: string | null;
    onClose: () => void;
    onSalvo: (mensagem: string) => void;
}

export interface ItemSalvo {
    id: string;
    descricao: string;
    quantidade: number;
    valor_unitario: number;
}

export interface OrcamentoSalvo {
    id: string;
    status: string;
    created_at: string;
    tipo_servico: string | null;
    distancia_km: number | null;
    custo_deslocamento: number | null;
    incluir_deslocamento: boolean | null;
    observacoes: string | null;
    proposta_itens: ItemSalvo[];
}

interface OpcaoForm {
    chave: string;
    nome: string;
    valor: string;
}

const SERVICOS = ['Aquarela dos Convidados', 'Pintura dos Noivos', 'Árvore de Digitais', 'Identidade Visual', 'Outros'];

// Nomes iniciais das opcoes; a Thai pode trocar, tirar ou acrescentar em cada orcamento.
const OPCOES_INICIAIS: Record<string, string[]> = {
    'Aquarela dos Convidados': ['Memórias - família A4 (21x29)', 'Memórias - família 15x21', 'Lembranças - família 10x15'],
    'Árvore de Digitais': ['Com moldura', 'Sem moldura'],
};

export const CAMPOS_ORCAMENTO = 'id, status, created_at, tipo_servico, distancia_km, custo_deslocamento, incluir_deslocamento, observacoes, proposta_itens(id, descricao, quantidade, valor_unitario)';

const paraTexto = (valor: number | null | undefined) => (valor ? String(valor).replace('.', ',') : '');
export const itensComValor = (o: OrcamentoSalvo) => o.proposta_itens.filter(i => Number(i.valor_unitario) > 0);
const formatarData = (valor: string) => new Date(valor).toLocaleDateString('pt-BR');

let contador = 0;
const novaOpcao = (nome = '', valor = ''): OpcaoForm => ({ chave: `opcao-${++contador}`, nome, valor });

function opcoesDe(servico: string, base: OrcamentoSalvo | null): OpcaoForm[] {
    const itens = base ? itensComValor(base) : [];
    if (itens.length > 0) return itens.map(i => novaOpcao(i.descricao, paraTexto(i.valor_unitario)));
    const nomes = OPCOES_INICIAIS[servico] || [''];
    return nomes.map(nome => novaOpcao(nome));
}

const OrcamentoModal = ({ lead, editarId = null, onClose, onSalvo }: OrcamentoModalProps) => {
    const { user } = useAuth();
    const [historico, setHistorico] = useState<OrcamentoSalvo[]>([]);
    const [carregando, setCarregando] = useState(false);
    const [servico, setServico] = useState(SERVICOS[0]);
    const [opcoes, setOpcoes] = useState<OpcaoForm[]>([]);
    const [telas, setTelas] = useState('');
    const [distancia, setDistancia] = useState('');
    const [deslocamento, setDeslocamento] = useState('');
    const [observacoes, setObservacoes] = useState('');
    const [origem, setOrigem] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    const leadId = lead?.id;

    const carregarParaEditar = (o: OrcamentoSalvo) => {
        setServico(o.tipo_servico && SERVICOS.includes(o.tipo_servico) ? o.tipo_servico : 'Outros');
        setDistancia(paraTexto(o.distancia_km));
        setDeslocamento(paraTexto(o.custo_deslocamento));
        setObservacoes(o.observacoes || '');
        const qtd = itensComValor(o)[0]?.quantidade || 1;
        setTelas(qtd > 1 ? String(qtd) : '');
        setOpcoes(opcoesDe(o.tipo_servico || 'Outros', o));
        setOrigem(`Editando o orçamento de ${formatarData(o.created_at)}.`);
    };

    const preencher = async (novoServico: string, doLead: OrcamentoSalvo[]) => {
        setServico(novoServico);
        const proprio = doLead.find(o => o.tipo_servico === novoServico && itensComValor(o).length > 0) || null;
        setDistancia(proprio ? paraTexto(proprio.distancia_km) : '');
        setDeslocamento(proprio ? paraTexto(proprio.custo_deslocamento) : '');
        setObservacoes(proprio?.observacoes || '');
        const qtd = proprio ? itensComValor(proprio)[0]?.quantidade : 0;
        setTelas(qtd && qtd > 1 ? String(qtd) : '');
        setOpcoes(opcoesDe(novoServico, proprio));
        if (proprio) {
            setOrigem(`Valores do último orçamento deste lead, de ${formatarData(proprio.created_at)}. Ajuste o que mudou.`);
            return;
        }
        setOrigem('');
        // So sugere orcamentos registrados neste fluxo: os rascunhos antigos tem precos desatualizados
        const { data } = await supabase
            .from('propostas')
            .select(CAMPOS_ORCAMENTO)
            .eq('tipo_servico', novoServico)
            .eq('status', 'Enviada')
            .order('created_at', { ascending: false })
            .limit(5);
        const referencia = ((data || []) as unknown as OrcamentoSalvo[]).find(o => itensComValor(o).length > 0);
        if (referencia) {
            setOpcoes(atuais => (atuais.every(o => !o.valor) ? opcoesDe(novoServico, referencia) : atuais));
            setOrigem(`Valores sugeridos do orçamento mais recente deste serviço, de ${formatarData(referencia.created_at)}. Confira antes de salvar.`);
        }
    };

    useEffect(() => {
        if (!leadId || !lead) return;
        let atual = true;
        setErro('');
        setCarregando(true);
        supabase
            .from('propostas')
            .select(CAMPOS_ORCAMENTO)
            .eq('lead_id', leadId)
            .order('created_at', { ascending: false })
            .then(({ data, error }) => {
                if (!atual) return;
                setCarregando(false);
                if (error) {
                    setErro('Não foi possível carregar os orçamentos: ' + error.message);
                    return;
                }
                const lista = (data || []) as unknown as OrcamentoSalvo[];
                setHistorico(lista);
                const paraEditar = editarId ? lista.find(o => o.id === editarId) : null;
                if (paraEditar) {
                    carregarParaEditar(paraEditar);
                    return;
                }
                const inicial = lista.find(o => o.tipo_servico && itensComValor(o).length > 0)?.tipo_servico
                    || (lead.services || []).find(s => SERVICOS.includes(s))
                    || SERVICOS[0];
                preencher(inicial, lista);
            });
        return () => { atual = false; };
    }, [leadId, editarId]);

    if (!lead) return null;

    const valorDeslocamento = parseValor(deslocamento);

    const alterarOpcao = (chave: string, campo: 'nome' | 'valor', valor: string) => {
        setOpcoes(atuais => atuais.map(o => (o.chave === chave ? { ...o, [campo]: valor } : o)));
    };

    const salvar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setErro('');

        const quantidade = servico === 'Outros' ? 1 : Math.max(parseInt(telas, 10) || 1, 1);
        const preenchidas = opcoes
            .map(o => ({ descricao: o.nome.trim(), quantidade, valor_unitario: parseValor(o.valor) }))
            .filter(o => o.valor_unitario > 0);

        if (preenchidas.length === 0) {
            setErro('Informe o valor de pelo menos uma opção.');
            return;
        }
        if (preenchidas.some(o => !o.descricao)) {
            setErro('Informe o nome de todas as opções com valor.');
            return;
        }

        setSalvando(true);

        const dadosOrcamento = {
            titulo: `Orçamento - ${lead.name} - ${servico}`,
            status: 'Enviada',
            data_evento: lead.event_date || null,
            tipo_servico: servico,
            incluir_deslocamento: valorDeslocamento > 0,
            distancia_km: parseValor(distancia),
            custo_deslocamento: valorDeslocamento,
            observacoes: observacoes.trim() || null,
        };

        const emEdicao = editarId ? historico.find(o => o.id === editarId) : null;
        if (emEdicao) {
            // Grava os itens novos antes de remover os antigos, para nunca ficar sem valores
            const { data: novos, error: erroNovos } = await supabase
                .from('proposta_itens')
                .insert(preenchidas.map(o => ({ ...o, proposta_id: emEdicao.id })))
                .select('id');
            if (erroNovos || !novos) {
                setErro('Erro ao salvar os valores. Nada foi alterado: ' + (erroNovos?.message || 'sem resposta'));
                setSalvando(false);
                return;
            }
            const desfazer = async () => {
                const { error } = await supabase.from('proposta_itens').delete().in('id', novos.map(n => n.id));
                return !error;
            };
            const { error: erroAtualizar } = await supabase
                .from('propostas')
                .update({ ...dadosOrcamento, updated_at: new Date().toISOString() })
                .eq('id', emEdicao.id);
            if (erroAtualizar) {
                const desfeito = await desfazer();
                setErro(desfeito
                    ? 'Erro ao salvar o orçamento. Nada foi alterado: ' + erroAtualizar.message
                    : 'Erro ao salvar o orçamento e os valores podem ter ficado duplicados. Confira antes de salvar de novo: ' + erroAtualizar.message);
                setSalvando(false);
                return;
            }
            if (emEdicao.proposta_itens.length > 0) {
                const { error: erroAntigos } = await supabase
                    .from('proposta_itens')
                    .delete()
                    .in('id', emEdicao.proposta_itens.map(i => i.id));
                if (erroAntigos) {
                    const desfeito = await desfazer();
                    setErro(desfeito
                        ? 'Erro ao atualizar os valores. Os valores anteriores foram mantidos: ' + erroAntigos.message
                        : 'Erro ao atualizar os valores e eles podem ter ficado duplicados. Confira antes de salvar de novo: ' + erroAntigos.message);
                    setSalvando(false);
                    return;
                }
            }
            setSalvando(false);
            onSalvo('Orçamento atualizado.');
            onClose();
            return;
        }

        const { data: proposta, error: erroProposta } = await supabase
            .from('propostas')
            .insert({
                user_id: user.id,
                lead_id: lead.id,
                ...dadosOrcamento,
            })
            .select('id')
            .single();

        if (erroProposta || !proposta) {
            setErro('Erro ao salvar o orçamento: ' + (erroProposta?.message || 'sem resposta'));
            setSalvando(false);
            return;
        }

        const { error: erroItens } = await supabase
            .from('proposta_itens')
            .insert(preenchidas.map(o => ({ ...o, proposta_id: proposta.id })));

        if (erroItens) {
            // Nao deixa um orcamento sem valores no historico
            await supabase.from('propostas').delete().eq('id', proposta.id);
            setErro('Erro ao salvar os valores. Nada foi salvo: ' + erroItens.message);
            setSalvando(false);
            return;
        }

        let mensagem = `Orçamento de ${lead.name} salvo.`;
        if (lead.status === 'Novo Lead') {
            const { error } = await supabase.from('leads').update({ status: 'Proposta Enviada' }).eq('id', lead.id);
            mensagem = error
                ? `Orçamento salvo, mas a etapa do lead não mudou: ${error.message}`
                : `Orçamento de ${lead.name} salvo. Lead movido para Proposta Enviada.`;
        }
        setSalvando(false);
        onSalvo(mensagem);
        onClose();
    };

    const estiloInput = 'w-full bg-surface border-2 border-secondary p-2.5 font-mono text-sm focus:border-primary outline-none';
    const estiloRotulo = 'block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-secondary" onClick={e => e.stopPropagation()}>
                <header className="bg-secondary p-4 flex justify-between items-center sticky top-0 z-10 gap-4">
                    <div className="min-w-0">
                        <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider">{editarId ? 'Editar orçamento' : 'Orçamento'}</h2>
                        <p className="text-sm text-white/70 truncate">{lead.name}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Fechar" className="text-white hover:text-primary transition-colors">
                        <span className="material-symbols-outlined text-2xl">close</span>
                    </button>
                </header>

                <form onSubmit={salvar} className="p-4 md:p-6 flex flex-col gap-4">
                    {erro && (
                        <div className="bg-red-50 border-l-4 border-accent-error p-3 text-accent-error font-bold text-sm">{erro}</div>
                    )}

                    <div>
                        <label htmlFor="orcamento-servico" className={estiloRotulo}>Serviço</label>
                        <select id="orcamento-servico" className={`${estiloInput} appearance-none`} value={servico}
                            onChange={e => preencher(e.target.value, historico)} disabled={carregando}>
                            {SERVICOS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    {origem && <p className="text-xs text-gray-500 font-mono">{origem}</p>}

                    <div className="flex flex-col gap-2">
                        <div className="grid grid-cols-[1fr_112px_32px] sm:grid-cols-[1fr_140px_32px] gap-2 text-xs font-bold uppercase tracking-wider text-gray-500">
                            <span>Opção do orçamento</span>
                            <span>Valor (R$)</span>
                        </div>
                        {opcoes.map(o => (
                            <div key={o.chave} className="grid grid-cols-[1fr_112px_32px] sm:grid-cols-[1fr_140px_32px] gap-2 items-center">
                                <input aria-label="Nome da opção" className={estiloInput} value={o.nome}
                                    onChange={e => alterarOpcao(o.chave, 'nome', e.target.value)} placeholder="Nome da opção" />
                                <input aria-label={`Valor de ${o.nome || 'opção'}`} inputMode="decimal" className={`${estiloInput} text-right`} value={o.valor}
                                    onChange={e => alterarOpcao(o.chave, 'valor', e.target.value)} placeholder="0,00" />
                                <button type="button" aria-label={`Remover ${o.nome || 'opção'}`} title="Remover opção"
                                    onClick={() => setOpcoes(a => a.filter(x => x.chave !== o.chave))}
                                    className="h-8 w-8 flex items-center justify-center text-gray-400 hover:text-accent-error transition-colors">
                                    <span className="material-symbols-outlined text-[18px]">close</span>
                                </button>
                                {valorDeslocamento > 0 && parseValor(o.valor) > 0 && (
                                    <p className="col-span-3 text-[11px] font-mono text-gray-500">
                                        Com deslocamento: {formatarReais(parseValor(o.valor) + valorDeslocamento)}
                                    </p>
                                )}
                            </div>
                        ))}
                        <button type="button" onClick={() => setOpcoes(a => [...a, novaOpcao()])}
                            className="self-start text-xs font-bold uppercase tracking-wider text-primary flex items-center gap-1">
                            <span className="material-symbols-outlined text-[16px]">add</span>
                            Adicionar opção
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {servico !== 'Outros' && (
                            <div>
                                <label htmlFor="orcamento-telas" className={estiloRotulo}>Qtd. de telas</label>
                                <input id="orcamento-telas" type="number" min="1" className={estiloInput} value={telas} onChange={e => setTelas(e.target.value)} />
                            </div>
                        )}
                        <div>
                            <label htmlFor="orcamento-distancia" className={estiloRotulo}>Distância (km)</label>
                            <input id="orcamento-distancia" inputMode="decimal" className={estiloInput} value={distancia} onChange={e => setDistancia(e.target.value)} placeholder="0" />
                        </div>
                        <div>
                            <label htmlFor="orcamento-deslocamento" className={estiloRotulo}>Deslocamento (R$)</label>
                            <input id="orcamento-deslocamento" inputMode="decimal" className={`${estiloInput} text-right`} value={deslocamento} onChange={e => setDeslocamento(e.target.value)} placeholder="0,00" />
                        </div>
                    </div>

                    <div>
                        <label htmlFor="orcamento-observacoes" className={estiloRotulo}>Observação</label>
                        <textarea id="orcamento-observacoes" className={`${estiloInput} resize-none h-20`} value={observacoes} onChange={e => setObservacoes(e.target.value)} />
                    </div>

                    <button type="submit" disabled={salvando || carregando}
                        className="h-12 bg-primary text-white font-display font-bold uppercase tracking-wider border-2 border-secondary shadow-hard flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        <span className="material-symbols-outlined text-[20px]">{salvando ? 'progress_activity' : 'save'}</span>
                        {editarId ? 'Salvar alterações' : 'Salvar orçamento'}
                    </button>
                </form>

                {!editarId && (
                <section className="px-4 md:px-6 pb-6 flex flex-col gap-3">
                    <h3 className="font-display font-bold uppercase tracking-wider text-sm text-secondary border-t-2 border-secondary/20 pt-4">
                        Histórico ({historico.length})
                    </h3>
                    {!carregando && historico.length === 0 && (
                        <p className="text-sm text-gray-500">Nenhum orçamento registrado para este lead.</p>
                    )}
                    {historico.map(o => {
                        const itens = itensComValor(o);
                        const qtd = itens[0]?.quantidade || 1;
                        return (
                            <div key={o.id} className="border-2 border-secondary/20 p-3 text-sm">
                                <p className="font-bold text-secondary flex flex-wrap justify-between gap-2">
                                    <span>{o.tipo_servico || 'Serviço não informado'}{o.tipo_servico !== 'Outros' && qtd > 1 ? ` · ${qtd} telas` : ''}</span>
                                    <span className="font-mono font-normal text-xs text-gray-500">{formatarData(o.created_at)}</span>
                                </p>
                                <ul className="mt-2 flex flex-col gap-1">
                                    {itens.map(i => (
                                        <li key={i.id} className="flex justify-between gap-3 text-xs text-gray-600">
                                            <span>{i.descricao}</span>
                                            <span className="font-mono shrink-0">{formatarReais(Number(i.valor_unitario))}</span>
                                        </li>
                                    ))}
                                </ul>
                                {o.incluir_deslocamento && Number(o.custo_deslocamento) > 0 && (
                                    <p className="mt-1 flex justify-between gap-3 text-xs text-gray-500">
                                        <span>Deslocamento{Number(o.distancia_km) > 0 ? ` · ${o.distancia_km} km` : ''}</span>
                                        <span className="font-mono shrink-0">{formatarReais(Number(o.custo_deslocamento))}</span>
                                    </p>
                                )}
                                {o.observacoes && <p className="mt-2 text-xs text-gray-500 whitespace-pre-line">{o.observacoes}</p>}
                            </div>
                        );
                    })}
                </section>
                )}
            </div>
        </div>
    );
};

export default OrcamentoModal;
