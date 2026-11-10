import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { entrarNutricao, registrarContato } from '../leadAcoes';
import {
    ItemContato, LIMITE_TENTATIVAS, LeadContato, MENSAGENS, MOTIVOS_PERDA, ROTULO_RESULTADO,
    DIAS_ENTRE_NUTRICAO, MESES_ANTES_RETOMAR, dataProximoContato, diasAteProximo, esperaResposta, linkWhatsApp, montarMensagem,
    notaTentativa, sugestaoRetomar,
} from '../leadContato';
import { ETAPA, avancar } from '../etapas';

export interface AlvoResultado<L extends LeadContato = LeadContato> {
    item: ItemContato<L>;
    inicial?: string;
}

interface ResultadoContatoModalProps<L extends LeadContato> {
    alvo: AlvoResultado<L> | null;
    onClose: () => void;
    onSalvo: (mensagem: string) => void;
    onQuerFechar: (lead: L) => void;
}

const OPCOES = ['sem_resposta', 'avaliando', 'caro', 'reuniao', 'retornar', 'quer_fechar', 'retomar_perto', 'desistiu'];

const hoje = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function ResultadoContatoModal<L extends LeadContato>({ alvo, onClose, onSalvo, onQuerFechar }: ResultadoContatoModalProps<L>) {
    const [resultado, setResultado] = useState('');
    const [data, setData] = useState('');
    const [hora, setHora] = useState('09:00');
    const [motivo, setMotivo] = useState(MOTIVOS_PERDA[0]);
    const [nota, setNota] = useState('');
    const [sinalPago, setSinalPago] = useState(false);
    const [retomarEm, setRetomarEm] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState('');

    const leadId = alvo?.item.lead.id;

    useEffect(() => {
        if (!leadId) return;
        setResultado(alvo?.inicial || '');
        setData('');
        setHora('09:00');
        setMotivo(MOTIVOS_PERDA[0]);
        setNota('');
        setSinalPago(false);
        setRetomarEm(sugestaoRetomar(alvo?.item.lead.event_date) || '');
        setErro('');
    }, [leadId, alvo?.inicial]);

    if (!alvo) return null;
    const { item } = alvo;
    const { lead, followup, tentativas, temOrcamento } = item;

    // "Sem resposta" so e opcao aqui ao confirmar reuniao; nos demais contatos vem depois da espera.
    const sugestao = sugestaoRetomar(lead.event_date);
    const opcoes = OPCOES
        .filter(o => o !== 'sem_resposta' || (!esperaResposta(item) && !item.nutricao))
        // Retomar perto da data so aparece quando o casamento esta longe
        .filter(o => o !== 'retomar_perto' || !!sugestao);
    const pedeData = resultado === 'reuniao' || resultado === 'retornar';
    const fecharAgora = resultado === 'quer_fechar' && sinalPago;
    const dias = resultado && !fecharAgora ? diasAteProximo(resultado, tentativas, temOrcamento) : null;
    const dataAutomatica = dias !== null ? dataProximoContato(dias) : null;
    const linkCaro = resultado === 'caro' ? linkWhatsApp(lead.phone, montarMensagem('caro', lead)) : null;

    const notaPadrao = () => {
        if (resultado === 'sem_resposta') return notaTentativa(tentativas);
        if (resultado === 'reuniao') return 'Reunião';
        if (resultado === 'retornar') return 'Retorno combinado';
        if (resultado === 'quer_fechar') return 'Cobrar contrato e sinal';
        return ROTULO_RESULTADO[resultado];
    };

    // Para onde o lead vai com este resultado. So avanca no funil, nunca volta.
    const proximaEtapa = (): string | null => {
        if (resultado === 'desistiu') return ETAPA.perdido;
        if (resultado === 'quer_fechar') return avancar(lead.status, ETAPA.sinal);
        if (resultado === 'caro' || resultado === 'reuniao') return avancar(lead.status, ETAPA.negociando);
        if (resultado === 'avaliando' || resultado === 'retornar') return avancar(lead.status, ETAPA.conversa);
        return null;
    };

    const salvar = async (e: React.FormEvent) => {
        e.preventDefault();
        setErro('');
        if (!resultado) {
            setErro('Escolha o que aconteceu neste contato.');
            return;
        }
        if (resultado === 'retomar_perto') {
            if (!retomarEm || retomarEm <= hoje()) {
                setErro('Escolha uma data de retomar no futuro.');
                return;
            }
            if (lead.event_date && retomarEm >= lead.event_date) {
                setErro('A data de retomar precisa ser antes do casamento.');
                return;
            }
        }
        if (pedeData && !data) {
            setErro(resultado === 'reuniao' ? 'Informe a data da reunião.' : 'Informe a data do retorno.');
            return;
        }

        setSalvando(true);
        try {
            if (resultado === 'retomar_perto') {
                onSalvo(await entrarNutricao(item, retomarEm));
                onClose();
                return;
            }

            if (fecharAgora) {
                if (followup) {
                    const { error } = await supabase.from('lead_followups').update({ resultado }).eq('id', followup.id);
                    if (error) throw new Error('Não foi possível registrar o contato: ' + error.message);
                }
                onClose();
                onQuerFechar(lead);
                return;
            }

            const perdido = resultado === 'desistiu';
            const etapa = proximaEtapa();
            let proximo: Date | null = null;
            if (pedeData) {
                proximo = new Date(`${data}T${resultado === 'reuniao' ? hora : '09:00'}`);
            } else if (dataAutomatica) {
                proximo = dataAutomatica;
            }

            await registrarContato({
                leadId: lead.id,
                followupId: followup?.id ?? null,
                resultado,
                proximo: perdido ? null : proximo,
                nota: perdido ? null : (nota.trim() || notaPadrao()),
                status: etapa,
                motivo: perdido ? motivo : null,
            });

            onSalvo(perdido
                ? `${lead.name} marcado como Perdido.`
                : `${lead.name}${etapa ? ` foi para ${etapa}` : ''}: próximo contato em ${proximo?.toLocaleDateString('pt-BR')}.`);
            onClose();
        } catch (falha: any) {
            setErro(falha.message);
        } finally {
            setSalvando(false);
        }
    };

    const estiloInput = 'w-full bg-surface border-2 border-secondary p-2.5 font-mono text-sm focus:border-primary outline-none';
    const estiloRotulo = 'block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl border-2 border-secondary" onClick={e => e.stopPropagation()}>
                <header className="bg-secondary p-4 flex justify-between items-center sticky top-0 z-10 gap-4">
                    <div className="min-w-0">
                        <h2 className="text-xl font-display font-bold text-white uppercase tracking-wider">O que aconteceu?</h2>
                        <p className="text-sm text-white/70 truncate">{lead.name}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Fechar janela" className="text-white hover:text-primary transition-colors">
                        <span className="material-symbols-outlined text-2xl">close</span>
                    </button>
                </header>

                <form onSubmit={salvar} className="p-4 md:p-6 flex flex-col gap-4">
                    {erro && <div className="bg-red-50 border-l-4 border-accent-error p-3 text-accent-error font-bold text-sm">{erro}</div>}

                    <fieldset className="flex flex-col gap-2">
                        <legend className="sr-only">Resultado do contato</legend>
                        {opcoes.map(opcao => (
                            <label key={opcao} className={`flex items-center gap-2 p-3 border-2 cursor-pointer ${resultado === opcao ? 'border-primary bg-primary/5' : 'border-gray-200'}`}>
                                <input type="radio" name="resultado" checked={resultado === opcao} onChange={() => setResultado(opcao)} className="shrink-0" />
                                <span className="text-sm text-secondary">{ROTULO_RESULTADO[opcao]}</span>
                            </label>
                        ))}
                    </fieldset>

                    {resultado === 'sem_resposta' && (
                        <p className="text-sm font-medium text-gray-600">Tentativa {tentativas + 1} de {LIMITE_TENTATIVAS} sem resposta.</p>
                    )}

                    {resultado === 'quer_fechar' && (
                        <fieldset className="flex flex-col gap-2 p-3 bg-amber-50 border-2 border-amber-200">
                            <legend className="sr-only">O sinal já foi pago?</legend>
                            <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
                                <input type="radio" name="sinal" checked={!sinalPago} onChange={() => setSinalPago(false)} />
                                Ainda falta o contrato ou o sinal: vai para {ETAPA.sinal}
                            </label>
                            <label className="flex items-center gap-2 text-sm text-secondary cursor-pointer">
                                <input type="radio" name="sinal" checked={sinalPago} onChange={() => setSinalPago(true)} />
                                O sinal já foi pago: fechar agora
                            </label>
                        </fieldset>
                    )}

                    {resultado === 'retomar_perto' && (
                        <div className="flex flex-col gap-2 p-3 bg-emerald-50 border-2 border-emerald-200">
                            <p className="text-sm text-secondary">
                                O lead recebe um conteúdo do ateliê a cada {DIAS_ENTRE_NUTRICAO} dias e volta para o follow-up normal na data abaixo
                                ({MESES_ANTES_RETOMAR} meses antes do casamento). A etapa não muda.
                            </p>
                            <div>
                                <label htmlFor="resultado-retomar" className={estiloRotulo}>Retomar em</label>
                                <input id="resultado-retomar" type="date" min={hoje()} max={lead.event_date || undefined}
                                    className={estiloInput} value={retomarEm} onChange={e => setRetomarEm(e.target.value)} />
                            </div>
                        </div>
                    )}

                    {dataAutomatica && resultado !== 'retomar_perto' && (
                        <p className="text-sm font-mono text-gray-600">Próximo contato em {dataAutomatica.toLocaleDateString('pt-BR')}.</p>
                    )}

                    {resultado === 'caro' && (
                        linkCaro ? (
                            <a href={linkCaro} target="_blank" rel="noopener noreferrer"
                                className="h-11 px-3 bg-green-600 text-white border-2 border-secondary rounded-sm flex items-center justify-center gap-1 text-xs font-bold uppercase hover:bg-green-700 transition-colors">
                                <span className="material-symbols-outlined text-[18px]">chat</span>
                                Enviar mensagem: {MENSAGENS.caro.titulo}
                            </a>
                        ) : <p className="text-sm text-gray-500">Corrija o telefone para abrir o WhatsApp.</p>
                    )}

                    {pedeData && (
                        <div className="grid grid-cols-2 gap-3">
                            <div className={resultado === 'reuniao' ? '' : 'col-span-2'}>
                                <label htmlFor="resultado-data" className={estiloRotulo}>{resultado === 'reuniao' ? 'Data da reunião' : 'Retornar em'}</label>
                                <input id="resultado-data" type="date" min={hoje()} className={estiloInput} value={data} onChange={e => setData(e.target.value)} />
                            </div>
                            {resultado === 'reuniao' && (
                                <div>
                                    <label htmlFor="resultado-hora" className={estiloRotulo}>Horário</label>
                                    <input id="resultado-hora" type="time" className={estiloInput} value={hora} onChange={e => setHora(e.target.value)} />
                                </div>
                            )}
                        </div>
                    )}

                    {resultado === 'desistiu' && (
                        <div>
                            <label htmlFor="resultado-motivo" className={estiloRotulo}>Motivo</label>
                            <select id="resultado-motivo" className={`${estiloInput} appearance-none`} value={motivo} onChange={e => setMotivo(e.target.value)}>
                                {MOTIVOS_PERDA.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    )}

                    {resultado && !fecharAgora && resultado !== 'desistiu' && resultado !== 'retomar_perto' && (
                        <div>
                            <label htmlFor="resultado-nota" className={estiloRotulo}>Anotação para o próximo contato</label>
                            <input id="resultado-nota" className={estiloInput} value={nota} onChange={e => setNota(e.target.value)} placeholder="Opcional" />
                        </div>
                    )}

                    <button type="submit" disabled={salvando}
                        className="h-12 bg-primary text-white font-display font-bold uppercase tracking-wider border-2 border-secondary shadow-hard flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        <span className={`material-symbols-outlined text-[20px] ${salvando ? 'animate-spin' : ''}`}>{salvando ? 'progress_activity' : 'check'}</span>
                        {fecharAgora ? 'Continuar para fechar' : 'Registrar'}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default ResultadoContatoModal;
