import React from 'react';
import {
    DIAS_AGUARDANDO_RESPOSTA, ItemContato, LIMITE_TENTATIVAS, LeadContato, MENSAGENS, contatoEncerra, esperaResposta, linkConversa, linkWhatsApp, montarMensagem,
    esperaVencida, ordenarContatos, organizarContatos, prioridadeContato,
} from '../leadContato';

interface FalarHojeProps<L extends LeadContato> {
    leads: L[];
    // Na aba Aguardando, a lista mostra so quem espera resposta
    visao?: 'hoje' | 'aguardando';
    ordem: string;
    loading: boolean;
    erro: string;
    ocupado: boolean;
    temOrcamento: (lead: L) => boolean;
    onAbrir: (lead: L) => void;
    onOrcamento: (lead: L) => void;
    onFeito: (item: ItemContato<L>) => void;
    onEnviada: (item: ItemContato<L>) => void;
    onNaoRespondeu: (item: ItemContato<L>) => void;
    onPerdido: (item: ItemContato<L>) => void;
}

const formatarData = (valor: string) =>
    new Date(valor).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

function FalarHoje<L extends LeadContato>({ leads, visao = 'hoje', ordem, loading, erro, ocupado, temOrcamento, onAbrir, onOrcamento, onFeito, onEnviada, onNaoRespondeu, onPerdido }: FalarHojeProps<L>) {
    const { hoje, atrasados, semContato, aguardando, agendados, casamentoPassado } = organizarContatos(leads, new Date(), temOrcamento);

    if (erro) {
        return (
            <div className="p-4 bg-accent-error/10 border-2 border-accent-error text-accent-error text-sm font-medium flex items-center gap-2">
                <span className="material-symbols-outlined">error</span>
                Não foi possível carregar os leads: {erro}
            </div>
        );
    }

    if (loading && leads.length === 0) {
        return (
            <div className="flex items-center justify-center py-20">
                <span className="animate-spin material-symbols-outlined text-4xl text-primary">progress_activity</span>
            </div>
        );
    }

    const renderItem = (item: ItemContato<L>) => {
        const { lead, followup, contatosFeitos, tentativas, mensagem, aguardando: emEspera } = item;
        const whatsapp = emEspera ? linkConversa(lead.phone) : linkWhatsApp(lead.phone, montarMensagem(mensagem, lead));
        const botaoPrincipal = 'h-11 px-3 bg-primary text-white border-2 border-secondary rounded-sm flex items-center justify-center gap-1 text-xs font-bold uppercase disabled:opacity-50';
        const botaoSecundario = 'h-11 px-3 bg-white text-secondary border-2 border-secondary rounded-sm flex items-center justify-center gap-1 text-xs font-bold uppercase hover:bg-gray-50 transition-colors disabled:opacity-50';
        const { motivo } = prioridadeContato(item);
        const dataEvento = lead.event_date
            ? new Date(lead.event_date + 'T12:00:00').toLocaleDateString('pt-BR')
            : 'Data a definir';

        return (
            <div key={lead.id} className="bg-white border-2 border-secondary p-4 flex flex-col xl:flex-row xl:items-center gap-3 rounded-sm">
                <button type="button" onClick={() => onAbrir(lead)} className="flex-1 min-w-0 text-left">
                    <p className="font-display text-lg font-bold text-secondary truncate">
                        {lead.name}
                        {motivo && (
                            <span className="ml-2 align-middle px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/30 text-[10px] font-mono font-bold uppercase">{motivo}</span>
                        )}
                    </p>
                    <p className="text-xs text-gray-600 flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                        <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-[14px] text-gray-400">event</span>
                            {dataEvento}
                        </span>
                        {lead.location && (
                            <span className="flex items-center gap-1 min-w-0">
                                <span className="material-symbols-outlined text-[14px] text-gray-400">location_on</span>
                                <span className="truncate max-w-[220px]">{lead.location}</span>
                            </span>
                        )}
                        <span className="font-mono text-gray-500">{lead.status}</span>
                        <span className="font-mono text-gray-500">
                            {contatosFeitos === 0 ? 'Nenhum contato feito' : `${contatosFeitos} contato${contatosFeitos > 1 ? 's' : ''} feito${contatosFeitos > 1 ? 's' : ''}`}
                        </span>
                        {tentativas > 0 && (
                            <span className={`font-mono font-bold ${contatoEncerra(tentativas) ? 'text-accent-error' : 'text-gray-700'}`}>
                                {tentativas} de {LIMITE_TENTATIVAS} sem resposta
                            </span>
                        )}
                        {followup && !emEspera && (
                            <span className="font-mono font-bold text-orange-600">Agendado para {formatarData(followup.scheduled_at)}</span>
                        )}
                        {followup && emEspera && (
                            <span className="font-mono font-bold text-orange-600">Sem resposta automático em {formatarData(followup.scheduled_at)}</span>
                        )}
                    </p>
                    {emEspera ? (
                        <p className="text-xs text-secondary mt-1">
                            <span className="font-bold">Mensagem enviada em</span> {formatarData(followup!.enviada_em!)}. Aguardando resposta.
                        </p>
                    ) : (
                        <p className="text-xs text-secondary mt-1">
                            <span className="font-bold">Mensagem:</span> {MENSAGENS[mensagem].titulo}
                        </p>
                    )}
                    {followup?.notes && <p className="text-xs text-gray-500 mt-1 truncate">{followup.notes}</p>}
                </button>

                <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 shrink-0">
                    {whatsapp ? (
                        <a
                            href={whatsapp}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-11 px-3 bg-green-600 text-white border-2 border-secondary rounded-sm flex items-center justify-center gap-1 text-xs font-bold uppercase hover:bg-green-700 transition-colors"
                        >
                            <span className="material-symbols-outlined text-[18px]">chat</span>
                            {emEspera ? 'Ver conversa' : 'WhatsApp'}
                        </a>
                    ) : (
                        <button
                            type="button"
                            onClick={() => onAbrir(lead)}
                            className="h-11 px-3 bg-white text-gray-500 border-2 border-gray-300 rounded-sm text-xs font-bold uppercase"
                        >
                            Abrir perfil
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => onOrcamento(lead)}
                        className="h-11 px-3 bg-white text-secondary border-2 border-secondary rounded-sm flex items-center justify-center gap-1 text-xs font-bold uppercase hover:bg-gray-50 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[18px]">request_quote</span>
                        Orçamento
                    </button>
                    {emEspera ? (
                        <>
                            <button type="button" disabled={ocupado} onClick={() => onFeito(item)} className={botaoPrincipal}>
                                <span className="material-symbols-outlined text-[18px]">forum</span>
                                Respondeu
                            </button>
                            {esperaVencida(followup) && (
                                <button type="button" disabled={ocupado} onClick={() => onNaoRespondeu(item)} className={botaoSecundario}>
                                    <span className="material-symbols-outlined text-[18px]">schedule</span>
                                    Não respondeu
                                </button>
                            )}
                        </>
                    ) : esperaResposta(item) ? (
                        <>
                            <button type="button" disabled={ocupado} onClick={() => onEnviada(item)} className={botaoPrincipal}>
                                <span className="material-symbols-outlined text-[18px]">send</span>
                                Mensagem enviada
                            </button>
                            <button type="button" disabled={ocupado} onClick={() => onFeito(item)} className={botaoSecundario}>
                                <span className="material-symbols-outlined text-[18px]">forum</span>
                                Já respondeu
                            </button>
                        </>
                    ) : (
                        <button type="button" disabled={ocupado} onClick={() => onFeito(item)} className={botaoPrincipal}>
                            <span className="material-symbols-outlined text-[18px]">check</span>
                            Contato feito
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => onPerdido(item)}
                        className="h-11 px-3 bg-white text-gray-600 border-2 border-gray-300 rounded-sm text-xs font-bold uppercase hover:border-accent-error hover:text-accent-error transition-colors"
                    >
                        Perdido
                    </button>
                </div>
            </div>
        );
    };

    const grupo = (titulo: string, itens: ItemContato<L>[], cor: string) =>
        itens.length > 0 && (
            <section className="flex flex-col gap-3">
                <h3 className={`font-display font-bold uppercase tracking-wider text-sm ${cor}`}>
                    {titulo} ({itens.length})
                </h3>
                {ordenarContatos(itens, ordem).map(renderItem)}
            </section>
        );

    const semPendencias = hoje.length + atrasados.length + semContato.length === 0;

    if (visao === 'aguardando') {
        return (
            <div className="h-full overflow-y-auto flex flex-col gap-4 pb-8">
                <p className="text-sm text-gray-600">
                    Mensagem enviada, esperando o retorno. Quando responderem, clique em Respondeu. Sem resposta em {DIAS_AGUARDANDO_RESPOSTA} dias, o lead é classificado sozinho e o próximo follow-up fica agendado.
                </p>
                {aguardando.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                        <span className="material-symbols-outlined text-6xl text-gray-300 mb-4">hourglass_empty</span>
                        <h3 className="font-display text-xl font-bold text-secondary">Nenhum lead aguardando resposta</h3>
                    </div>
                ) : (
                    ordenarContatos(aguardando, ordem).map(renderItem)
                )}
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto flex flex-col gap-6 pb-8">
            {semPendencias && (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                    <span className="material-symbols-outlined text-6xl text-gray-300 mb-4">task_alt</span>
                    <h3 className="font-display text-xl font-bold text-secondary">Nenhum contato para hoje</h3>
                </div>
            )}
            {grupo('Para hoje', hoje, 'text-primary')}
            {grupo('Atrasados', atrasados, 'text-red-600')}
            {grupo('Sem próximo contato', semContato, 'text-gray-600')}
            {agendados.length > 0 && (
                <details>
                    <summary className="cursor-pointer font-display font-bold uppercase tracking-wider text-sm text-gray-600">
                        Próximos follow-ups ({agendados.length})
                    </summary>
                    <div className="mt-3 flex flex-col gap-3">
                        {ordenarContatos(agendados, ordem).map(renderItem)}
                    </div>
                </details>
            )}
            {casamentoPassado > 0 && (
                <p className="text-xs text-gray-500 font-mono">
                    {casamentoPassado} fora da lista porque a data do casamento já passou; veja em Funil Ativo.
                </p>
            )}
        </div>
    );
}

export default FalarHoje;
