import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../AuthContext';
import { CAMPOS_ORCAMENTO, OrcamentoSalvo, itensComValor } from './OrcamentoModal';
import { enviarContrato, removerContrato } from '../contratos';
import { formatarReais, parseValor } from '../valores';
import EditorParcelas from './EditorParcelas';
import { CategoriaLancamento } from '../lancamentos';
import { LinhaParcela, categoriaDoServico, erroDasLinhas, salvarLinhas } from '../parcelas';

interface LeadFechar {
    id: string;
    name: string;
    event_date: string | null;
    services?: string[] | null;
}

interface FecharLeadModalProps {
    lead: LeadFechar | null;
    onClose: () => void;
    onFechado: (eventoId: string) => void;
}

const paraTexto = (valor: number) => String(valor).replace('.', ',');
const OUTRO = 'outro';

const FecharLeadModal = ({ lead, onClose, onFechado }: FecharLeadModalProps) => {
    const { user } = useAuth();
    const [orcamentos, setOrcamentos] = useState<OrcamentoSalvo[]>([]);
    const [eventosNaData, setEventosNaData] = useState<string[]>([]);
    const [escolha, setEscolha] = useState(OUTRO);
    const [plano, setPlano] = useState('');
    const [valor, setValor] = useState('');
    const [deslocamento, setDeslocamento] = useState('');
    const [contrato, setContrato] = useState<File | null>(null);
    const [categorias, setCategorias] = useState<CategoriaLancamento[]>([]);
    const [parcelar, setParcelar] = useState(false);
    const [linhas, setLinhas] = useState<LinhaParcela[]>([]);
    const [categoriaId, setCategoriaId] = useState('');
    const [carregando, setCarregando] = useState(false);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    const leadId = lead?.id;
    const dataLead = lead?.event_date;

    useEffect(() => {
        if (!leadId) return;
        let atual = true;
        setErro('');
        setOrcamentos([]);
        setEscolha(OUTRO);
        setPlano('');
        setValor('');
        setDeslocamento('');
        setContrato(null);
        setParcelar(false);
        setLinhas([]);
        setCategoriaId('');
        setEventosNaData([]);
        setCarregando(true);

        Promise.all([
            supabase.from('propostas').select(CAMPOS_ORCAMENTO).eq('lead_id', leadId).order('created_at', { ascending: false }),
            dataLead
                ? supabase.from('eventos').select('nome').eq('data_evento', dataLead).neq('status', 'Cancelado')
                : Promise.resolve({ data: [] as { nome: string }[], error: null }),
            supabase.from('categorias').select('*').order('nome'),
        ]).then(([orcamentos, eventos, listaCategorias]) => {
            if (!atual) return;
            setCarregando(false);
            setCategorias((listaCategorias.data || []) as CategoriaLancamento[]);
            if (orcamentos.error) {
                setErro('Não foi possível carregar o orçamento: ' + orcamentos.error.message);
                return;
            }
            // Vale o orcamento mais recente de cada servico
            const lista = ((orcamentos.data || []) as unknown as OrcamentoSalvo[]).filter(o => itensComValor(o).length > 0);
            const vistos = new Set<string>();
            setOrcamentos(lista.filter(o => {
                const chave = o.tipo_servico || o.id;
                if (vistos.has(chave)) return false;
                vistos.add(chave);
                return true;
            }));
            setEventosNaData(((eventos.data || []) as { nome: string }[]).map(e => e.nome));
        });
        return () => { atual = false; };
    }, [leadId, dataLead]);

    if (!lead) return null;

    const opcoes = orcamentos.flatMap(o => itensComValor(o).map(item => ({ ...item, orcamento: o })));
    const escolhida = opcoes.find(o => o.id === escolha) || null;
    const custoDe = (o: OrcamentoSalvo) => (o.incluir_deslocamento ? Number(o.custo_deslocamento) || 0 : 0);
    const deslocamentoOrcamento = escolhida ? custoDe(escolhida.orcamento) : 0;
    const servico = escolhida?.orcamento.tipo_servico || orcamentos[0]?.tipo_servico || (lead.services || [])[0] || '';

    const escolher = (id: string) => {
        setEscolha(id);
        const opcao = opcoes.find(o => o.id === id);
        if (opcao) {
            const custo = custoDe(opcao.orcamento);
            setPlano(opcao.descricao);
            setValor(paraTexto(Number(opcao.valor_unitario) + custo));
            setDeslocamento(custo > 0 ? paraTexto(custo) : '');
        } else {
            setPlano('');
            setValor('');
            setDeslocamento('');
        }
    };

    const salvar = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;
        setErro('');
        const total = parseValor(valor);
        if (total <= 0) {
            setErro('Informe o valor fechado.');
            return;
        }
        if (parcelar) {
            const invalido = erroDasLinhas(linhas);
            if (invalido) {
                setErro(invalido);
                return;
            }
        }

        setSalvando(true);
        let caminho: string | null = null;
        try {
            if (contrato) caminho = await enviarContrato(contrato, user.id);
        } catch (falha: any) {
            setErro(falha.message);
            setSalvando(false);
            return;
        }

        const { data, error } = await supabase.rpc('fechar_lead', {
            p_lead_id: lead.id,
            p_valor: total,
            p_plano: plano.trim() || null,
            p_servico: servico || null,
            p_custo_deslocamento: parseValor(deslocamento),
            p_proposta_id: escolhida?.orcamento.id ?? null,
            p_contrato: caminho,
        });

        if (error || !data) {
            if (caminho) await removerContrato(caminho);
            setErro(error?.code === '23505'
                ? 'Este lead já foi fechado e tem um evento.'
                : 'Não foi possível fechar o lead. Nada foi criado: ' + (error?.message || 'sem resposta'));
            setSalvando(false);
            return;
        }

        if (parcelar) {
            try {
                await salvarLinhas(data as string, linhas, categoriaId ? Number(categoriaId) : null);
            } catch (falha: any) {
                // O lead ja foi fechado; as parcelas podem ser criadas depois no evento.
                alert(`O lead foi fechado, mas as parcelas não foram salvas. Crie-as no financeiro do evento. ${falha.message}`);
            }
        }

        setSalvando(false);
        onFechado(data as string);
    };

    const estiloInput = 'w-full bg-surface border-2 border-secondary p-2.5 font-mono text-sm focus:border-primary outline-none';
    const estiloRotulo = 'block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-secondary" onClick={e => e.stopPropagation()}>
                <header className="bg-secondary p-4 flex justify-between items-center sticky top-0 z-10 gap-4">
                    <div className="min-w-0">
                        <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider">Fechar lead</h2>
                        <p className="text-sm text-white/70 truncate">{lead.name}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Fechar janela" className="text-white hover:text-primary transition-colors">
                        <span className="material-symbols-outlined text-2xl">close</span>
                    </button>
                </header>

                <form onSubmit={salvar} className="p-4 md:p-6 flex flex-col gap-4">
                    {erro && <div className="bg-red-50 border-l-4 border-accent-error p-3 text-accent-error font-bold text-sm">{erro}</div>}

                    {eventosNaData.length > 0 && (
                        <div className="p-3 bg-amber-50 border-2 border-amber-400 text-amber-800 text-sm font-medium flex items-start gap-2">
                            <span className="material-symbols-outlined text-lg">event_busy</span>
                            <span>Já existe evento nesta data: {eventosNaData.join(', ')}.</span>
                        </div>
                    )}

                    {opcoes.length > 0 && (
                        <fieldset className="flex flex-col gap-2">
                            <legend className={estiloRotulo}>Opção fechada</legend>
                            {opcoes.map(o => (
                                <label key={o.id} className={`flex items-center justify-between gap-3 p-3 border-2 cursor-pointer ${escolha === o.id ? 'border-primary bg-primary/5' : 'border-gray-200'}`}>
                                    <span className="flex items-center gap-2 min-w-0">
                                        <input type="radio" name="opcao" checked={escolha === o.id} onChange={() => escolher(o.id)} className="shrink-0" />
                                        <span className="text-sm text-secondary break-words">
                                            {o.descricao}
                                            {orcamentos.length > 1 && <span className="block text-xs text-gray-500">{o.orcamento.tipo_servico}</span>}
                                        </span>
                                    </span>
                                    <span className="font-mono text-sm font-bold shrink-0">{formatarReais(Number(o.valor_unitario))}</span>
                                </label>
                            ))}
                            <label className={`flex items-center gap-2 p-3 border-2 cursor-pointer ${escolha === OUTRO ? 'border-primary bg-primary/5' : 'border-gray-200'}`}>
                                <input type="radio" name="opcao" checked={escolha === OUTRO} onChange={() => escolher(OUTRO)} />
                                <span className="text-sm text-secondary">Outro valor</span>
                            </label>
                        </fieldset>
                    )}

                    {escolha === OUTRO && (
                        <div>
                            <label htmlFor="fechar-plano" className={estiloRotulo}>Plano fechado</label>
                            <input id="fechar-plano" className={estiloInput} value={plano} onChange={e => setPlano(e.target.value)} placeholder="Opcional" />
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label htmlFor="fechar-valor" className={estiloRotulo}>Valor total (R$) *</label>
                            <input id="fechar-valor" inputMode="decimal" className={`${estiloInput} text-right`} value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
                        </div>
                        <div>
                            <label htmlFor="fechar-deslocamento" className={estiloRotulo}>Custo de deslocamento</label>
                            <input id="fechar-deslocamento" inputMode="decimal" className={`${estiloInput} text-right`} value={deslocamento} onChange={e => setDeslocamento(e.target.value)} placeholder="0,00" />
                        </div>
                    </div>
                    {deslocamentoOrcamento > 0 && escolha !== OUTRO && (
                        <p className="text-xs text-gray-500 font-mono -mt-2">O valor total já inclui {formatarReais(deslocamentoOrcamento)} de deslocamento.</p>
                    )}

                    <div className="flex flex-col gap-3">
                        <label className="flex items-center gap-2 text-sm font-bold text-secondary cursor-pointer">
                            <input
                                type="checkbox"
                                checked={parcelar}
                                onChange={e => {
                                    setParcelar(e.target.checked);
                                    if (e.target.checked && !categoriaId) {
                                        const sugerida = categoriaDoServico(categorias, servico);
                                        if (sugerida) setCategoriaId(String(sugerida));
                                    }
                                }}
                            />
                            Definir as parcelas agora
                        </label>
                        {parcelar && (
                            <EditorParcelas total={parseValor(valor)} linhas={linhas} onLinhas={setLinhas} categorias={categorias} categoriaId={categoriaId} onCategoria={setCategoriaId} />
                        )}
                    </div>

                    <div>
                        <label htmlFor="fechar-contrato" className={estiloRotulo}>Contrato</label>
                        <input id="fechar-contrato" type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" className="w-full text-sm"
                            onChange={e => setContrato(e.target.files?.[0] || null)} />
                        <p className="mt-1 text-xs text-gray-500">Opcional. Você pode anexar depois, no perfil do lead.</p>
                    </div>

                    <p className="text-xs text-gray-500">Vai criar o cliente, se ainda não existir, e o evento como Confirmado.</p>

                    <button type="submit" disabled={salvando || carregando}
                        className="h-12 bg-primary text-white font-display font-bold uppercase tracking-wider border-2 border-secondary shadow-hard flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        <span className={`material-symbols-outlined text-[20px] ${salvando ? 'animate-spin' : ''}`}>{salvando ? 'progress_activity' : 'check_circle'}</span>
                        Fechar e abrir planejamento
                    </button>
                </form>
            </div>
        </div>
    );
};

export default FecharLeadModal;
