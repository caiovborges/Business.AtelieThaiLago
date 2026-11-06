import React from 'react';
import { ItemContato, LeadContato, linkWhatsApp, mensagemContato, organizarContatos } from '../leadContato';

interface FalarHojeProps<L extends LeadContato> {
    leads: L[];
    loading: boolean;
    erro: string;
    ocupado: string | null;
    onAbrir: (lead: L) => void;
    onOrcamento: (lead: L) => void;
    onFeito: (item: ItemContato<L>) => void;
    onPerdido: (lead: L) => void;
}

const formatarData = (valor: string) =>
    new Date(valor).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

function FalarHoje<L extends LeadContato>({ leads, loading, erro, ocupado, onAbrir, onOrcamento, onFeito, onPerdido }: FalarHojeProps<L>) {
    const { hoje, atrasados, semContato, agendadosDepois, casamentoPassado } = organizarContatos(leads);

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
        const { lead, followup, contatosFeitos } = item;
        const whatsapp = linkWhatsApp(lead.phone, mensagemContato(lead, contatosFeitos));
        const emAndamento = ocupado === lead.id;
        const dataEvento = lead.event_date
            ? new Date(lead.event_date + 'T12:00:00').toLocaleDateString('pt-BR')
            : 'Data a definir';

        return (
            <div key={lead.id} className="bg-white border-2 border-secondary p-4 flex flex-col lg:flex-row lg:items-center gap-3 rounded-sm">
                <button type="button" onClick={() => onAbrir(lead)} className="flex-1 min-w-0 text-left">
                    <p className="font-display text-lg font-bold text-secondary truncate">{lead.name}</p>
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
                        {followup && (
                            <span className="font-mono font-bold text-orange-600">Agendado para {formatarData(followup.scheduled_at)}</span>
                        )}
                    </p>
                    {followup?.notes && <p className="text-xs text-gray-500 mt-1 truncate">{followup.notes}</p>}
                </button>

                <div className="grid grid-cols-2 lg:flex gap-2 shrink-0">
                    {whatsapp ? (
                        <a
                            href={whatsapp}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="h-11 px-3 bg-green-600 text-white border-2 border-secondary rounded-sm flex items-center justify-center gap-1 text-xs font-bold uppercase hover:bg-green-700 transition-colors"
                        >
                            <span className="material-symbols-outlined text-[18px]">chat</span>
                            WhatsApp
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
                    <button
                        type="button"
                        onClick={() => onFeito(item)}
                        disabled={emAndamento}
                        className="h-11 px-3 bg-primary text-white border-2 border-secondary rounded-sm flex items-center justify-center gap-1 text-xs font-bold uppercase disabled:opacity-50"
                    >
                        <span className="material-symbols-outlined text-[18px]">check</span>
                        Feito
                    </button>
                    <button
                        type="button"
                        onClick={() => onPerdido(lead)}
                        disabled={emAndamento}
                        className="h-11 px-3 bg-white text-gray-600 border-2 border-gray-300 rounded-sm text-xs font-bold uppercase hover:border-accent-error hover:text-accent-error transition-colors disabled:opacity-50"
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
                {itens.map(renderItem)}
            </section>
        );

    const semPendencias = hoje.length + atrasados.length + semContato.length === 0;

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
            {(agendadosDepois > 0 || casamentoPassado > 0) && (
                <p className="text-xs text-gray-500 font-mono">
                    {agendadosDepois > 0 && `${agendadosDepois} agendado${agendadosDepois > 1 ? 's' : ''} para os próximos dias. `}
                    {casamentoPassado > 0 && `${casamentoPassado} fora da lista porque a data do casamento já passou; veja em Funil Ativo.`}
                </p>
            )}
        </div>
    );
}

export default FalarHoje;
