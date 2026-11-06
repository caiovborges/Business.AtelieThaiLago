// Regras do atendimento: WhatsApp, proximo contato e lista "Falar hoje".

export interface FollowupResumo {
    id: string;
    scheduled_at: string;
    done: boolean;
    type: string;
    notes?: string | null;
}

export interface LeadContato {
    id: string;
    name: string;
    phone: string;
    status: string;
    event_date: string | null;
    location: string | null;
    created_at?: string;
    lead_followups?: FollowupResumo[];
}

export interface ItemContato<L extends LeadContato = LeadContato> {
    lead: L;
    followup: FollowupResumo | null;
    contatosFeitos: number;
}

export const ETAPAS_ATIVAS = ['Novo Lead', 'Proposta Enviada', 'Em Negociação'];

// Dias ate o proximo contato, depois do 1o, 2o e 3o contatos feitos.
export const INTERVALOS_CONTATO = [2, 5, 7];
export const DIAS_APOS_LIMITE = 7;

export function telefoneWhatsApp(telefone: string | null | undefined): string | null {
    const digitos = (telefone || '').replace(/\D/g, '').replace(/^0+/, '');
    if (digitos.length === 10 || digitos.length === 11) return '55' + digitos;
    if ((digitos.length === 12 || digitos.length === 13) && digitos.startsWith('55')) return digitos;
    return null;
}

export function linkWhatsApp(telefone: string | null | undefined, mensagem: string): string | null {
    const numero = telefoneWhatsApp(telefone);
    return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}` : null;
}

const dataPorExtenso = (data: string) =>
    new Date(data + 'T12:00:00').toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

export function mensagemContato(lead: LeadContato, contatosFeitos: number): string {
    const casamento = lead.event_date ? ` em ${dataPorExtenso(lead.event_date)}` : '';
    const local = lead.location ? `, em ${lead.location}` : '';
    if (contatosFeitos === 0) {
        return `Olá, ${lead.name}! Aqui é a Thai, do Ateliê Thai Lago. Recebi o contato de vocês pelo site sobre o casamento${casamento}${local}. Vou adorar conversar sobre as pinturas para esse dia!`;
    }
    return `Olá, ${lead.name}! Aqui é a Thai, do Ateliê Thai Lago. Passando para saber se vocês conseguiram ver o orçamento do casamento${casamento}. Posso ajudar com alguma dúvida?`;
}

export function diasAteProximoContato(contatosFeitos: number): number | null {
    return INTERVALOS_CONTATO[contatosFeitos - 1] ?? null;
}

export function dataProximoContato(dias: number, agora: Date = new Date()): Date {
    const data = new Date(agora);
    data.setDate(data.getDate() + dias);
    data.setHours(9, 0, 0, 0);
    return data;
}

// Mesmas opcoes do seletor de ordem. Quem nao tem o dado usado na ordem fica por ultimo.
export function ordenarContatos<L extends LeadContato>(itens: ItemContato<L>[], ordem: string): ItemContato<L>[] {
    const tempo = (valor: string | null | undefined) => (valor ? new Date(valor).getTime() : null);
    const comparar = (a: number | null, b: number | null, sentido: 1 | -1) => {
        if (a === null && b === null) return 0;
        if (a === null) return 1;
        if (b === null) return -1;
        return (a - b) * sentido;
    };
    const dataEvento = (i: ItemContato<L>) => tempo(i.lead.event_date ? i.lead.event_date + 'T12:00:00' : null);
    const contato = (i: ItemContato<L>) => tempo(i.followup?.scheduled_at);
    const criado = (i: ItemContato<L>) => tempo(i.lead.created_at);

    return [...itens].sort((a, b) => {
        switch (ordem) {
            case 'event_date_asc': return comparar(dataEvento(a), dataEvento(b), 1);
            case 'event_date_desc': return comparar(dataEvento(a), dataEvento(b), -1);
            case 'followup_asc': return comparar(contato(a), contato(b), 1);
            case 'followup_desc': return comparar(contato(a), contato(b), -1);
            case 'created_at_desc': return comparar(criado(a), criado(b), -1);
            default: return 0;
        }
    });
}

export function organizarContatos<L extends LeadContato>(leads: L[], agora: Date = new Date()) {
    const inicioHoje = new Date(agora);
    inicioHoje.setHours(0, 0, 0, 0);
    const fimHoje = new Date(inicioHoje);
    fimHoje.setDate(fimHoje.getDate() + 1);

    const hoje: ItemContato<L>[] = [];
    const atrasados: ItemContato<L>[] = [];
    const semContato: ItemContato<L>[] = [];
    let agendadosDepois = 0;
    let casamentoPassado = 0;

    for (const lead of leads) {
        if (!ETAPAS_ATIVAS.includes(lead.status)) continue;
        if (lead.event_date && new Date(lead.event_date + 'T23:59:59') < inicioHoje) {
            casamentoPassado++;
            continue;
        }
        const followups = lead.lead_followups || [];
        const contatosFeitos = followups.filter(f => f.done).length;
        const proximo = followups
            .filter(f => !f.done)
            .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] ?? null;

        const item = { lead, followup: proximo, contatosFeitos };
        if (!proximo) {
            semContato.push(item);
            continue;
        }
        const quando = new Date(proximo.scheduled_at);
        if (quando >= fimHoje) agendadosDepois++;
        else if (quando >= inicioHoje) hoje.push(item);
        else atrasados.push(item);
    }

    const momento = (i: ItemContato<L>) => new Date(i.followup!.scheduled_at).getTime();
    hoje.sort((a, b) => momento(a) - momento(b));
    atrasados.sort((a, b) => momento(b) - momento(a)); // os mais recentes ainda tem mais chance

    return { hoje, atrasados, semContato, agendadosDepois, casamentoPassado };
}
