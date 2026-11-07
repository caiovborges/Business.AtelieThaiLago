// Regras do atendimento: mensagens, tentativas, proximo contato e prioridade.

export interface FollowupResumo {
    id: string;
    scheduled_at: string;
    done: boolean;
    type: string;
    notes?: string | null;
    resultado?: string | null;
    feito_em?: string | null;
    enviada_em?: string | null;
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

export type ChaveMensagem =
    | 'primeiro' | 'continuidade' | 'retomar' | 'encerramento'
    | 'posOrcamento' | 'caro' | 'lembrete' | 'reuniao' | 'confirmarReuniao';

export interface ItemContato<L extends LeadContato = LeadContato> {
    lead: L;
    followup: FollowupResumo | null;
    contatosFeitos: number;
    tentativas: number;
    ultimoResultado: string | null;
    temOrcamento: boolean;
    mensagem: ChaveMensagem;
    aguardando: boolean;
}

export const ETAPAS_ATIVAS = ['Novo Lead', 'Proposta Enviada', 'Em Negociação'];

// Depois de 3 tentativas seguidas sem resposta, o 4o contato e o de encerramento.
export const LIMITE_TENTATIVAS = 3;

export const ROTULO_RESULTADO: Record<string, string> = {
    sem_resposta: 'Sem resposta',
    avaliando: 'Respondeu, vai avaliar',
    caro: 'Ficou caro',
    reuniao: 'Quer reunião',
    retornar: 'Pediu para retornar depois',
    quer_fechar: 'Quer fechar',
    desistiu: 'Desistiu ou fechou com outro',
    orcamento_enviado: 'Orçamento enviado',
};

export const MOTIVOS_PERDA = [
    'Ficou caro, fora do orçamento',
    'Fechou com outro fornecedor',
    'Desistiu do serviço',
    'Data indisponível',
    'Outro',
];
export const MOTIVO_SEM_RESPOSTA = 'Sem resposta';

// Textos com as palavras da Thai, tirados das conversas com clientes.
export const MENSAGENS: Record<ChaveMensagem, { titulo: string; texto: string }> = {
    primeiro: {
        titulo: 'Primeiro contato',
        texto: 'Olá {nome}, aqui é a Thai, do ateliê Thai Lago. Recebi teu contato no formulário do nosso site. É um prazer falar contigo!\n\nPara orientar melhor teu atendimento, pode compartilhar comigo por favor:\n\nCidade do casamento:\nEspaço do casamento:\nHorário de início e final:\nQuantidade de convidados:',
    },
    continuidade: {
        titulo: 'Sem resposta',
        texto: 'Olá {nome}, tudo bem? Gostaria de dar continuidade ao teu atendimento?',
    },
    retomar: {
        titulo: 'Segunda tentativa',
        texto: 'Oie {nome}! Tudo bem? Vi que nosso atendimento ficou pendente por aqui, estou enviando mensagem para saber se você gostaria de retomar. 🤍',
    },
    encerramento: {
        titulo: 'Encerramento',
        texto: 'Olá {nome}! Como vai? Como já passou algum tempo do nosso último contato, passando apenas para lembrar que, caso ainda deseje a experiência para o seu casamento, estou por aqui à disposição. 💖 Espero que todos os preparativos estejam indo bem!',
    },
    posOrcamento: {
        titulo: 'Depois do orçamento',
        texto: 'Olá {nome}, tudo bem? Espero que os preparativos estejam indo bem. ✨ Gostaria muito de saber se conseguiram dar uma olhada na proposta. Fez sentido pra vocês? Tem algum ajuste que eu posso fazer?',
    },
    caro: {
        titulo: 'Ficou caro',
        texto: 'Entendo querida, o casamento tem muitas demandas financeiras mesmo. Dentro das propostas que te mandei, qual valor total estaria dentro do orçamento de vocês? Posso tentar um desconto que alcance ou chegue próximo do seu planejamento.',
    },
    lembrete: {
        titulo: 'Lembrete com fotos',
        texto: 'Olá {nome}! Tudo bem? Estamos fazendo um acompanhamento aqui, vi que fiquei sem seu retorno. Aproveitando pra te enviar algumas fotos de últimos eventos.',
    },
    reuniao: {
        titulo: 'Convite para reunião',
        texto: 'Olá {nome}! Pensei em combinarmos uma reunião de 10/15 minutinhos para conversar mais sobre e explicar melhor alguns detalhes, principalmente caso tenha ficado algum receio ou dúvida. Estou à sua disposição. ✨',
    },
    confirmarReuniao: {
        titulo: 'Confirmar reunião',
        texto: 'Olá {nome}! Tudo bem? Tudo certinho com a nossa reunião?',
    },
};

export function nomeSaudacao(nome: string): string {
    const limpo = (nome || '').trim();
    if (/\s(e|&)\s/i.test(limpo)) return limpo;
    return limpo.split(/\s+/)[0] || limpo;
}

// Textos editados na tela de Mensagens; sem edicao, vale o texto padrao acima.
let personalizados: Partial<Record<ChaveMensagem, string>> = {};

export function definirTextosPersonalizados(textos: Partial<Record<ChaveMensagem, string>>): void {
    personalizados = textos;
}

export function textosPersonalizados(): Partial<Record<ChaveMensagem, string>> {
    return personalizados;
}

export function textoMensagem(chave: ChaveMensagem): string {
    return personalizados[chave] ?? MENSAGENS[chave].texto;
}

export function montarTexto(texto: string, nome: string): string {
    return texto.split('{nome}').join(nomeSaudacao(nome));
}

export function montarMensagem(chave: ChaveMensagem, lead: { name: string }): string {
    return montarTexto(textoMensagem(chave), lead.name);
}

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

// Abre a conversa sem texto pronto, para conferir se o casal respondeu.
export function linkConversa(telefone: string | null | undefined): string | null {
    const numero = telefoneWhatsApp(telefone);
    return numero ? `https://wa.me/${numero}` : null;
}

export function temOrcamentoLead(status: string, temProposta: boolean): boolean {
    return temProposta || status === 'Proposta Enviada' || status === 'Em Negociação';
}

// Vale a data em que o contato foi feito: ele pode ser marcado antes ou depois do agendado.
export const dataDoContato = (f: FollowupResumo) => f.feito_em || f.scheduled_at;

export const feitosEmOrdem = (followups: FollowupResumo[]) =>
    followups
        .filter(f => f.done)
        .sort((a, b) => new Date(dataDoContato(a)).getTime() - new Date(dataDoContato(b)).getTime());

// So conta os "sem resposta" seguidos: qualquer outro resultado zera a contagem.
export function tentativasSemResposta(followups: FollowupResumo[]): number {
    let tentativas = 0;
    for (const f of feitosEmOrdem(followups).reverse()) {
        if (f.resultado !== 'sem_resposta') break;
        tentativas++;
    }
    return tentativas;
}

export function mensagemSugerida(
    contatosFeitos: number,
    tentativas: number,
    temOrcamento: boolean,
    ultimoResultado: string | null,
): ChaveMensagem {
    if (ultimoResultado === 'reuniao') return 'confirmarReuniao';
    if (tentativas >= LIMITE_TENTATIVAS) return 'encerramento';
    if (temOrcamento) {
        if (tentativas === 2) return 'reuniao';
        if (tentativas === 1) return 'lembrete';
        return 'posOrcamento';
    }
    if (contatosFeitos === 0) return 'primeiro';
    if (tentativas === 2) return 'retomar';
    return 'continuidade';
}

export function resumoContato<L extends LeadContato>(lead: L, temOrcamento: boolean): ItemContato<L> {
    const followups = lead.lead_followups || [];
    const feitos = feitosEmOrdem(followups);
    const tentativas = tentativasSemResposta(followups);
    const ultimoResultado = feitos[feitos.length - 1]?.resultado ?? null;
    const proximo = followups
        .filter(f => !f.done)
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0] ?? null;
    return {
        lead,
        followup: proximo,
        contatosFeitos: feitos.length,
        tentativas,
        ultimoResultado,
        temOrcamento,
        mensagem: mensagemSugerida(feitos.length, tentativas, temOrcamento, ultimoResultado),
        aguardando: !!proximo?.enviada_em,
    };
}

// Confirmar uma reuniao nao abre espera: o resultado e registrado na hora.
export const esperaResposta = (item: ItemContato) => item.mensagem !== 'confirmarReuniao';

// Depois desta espera, o banco classifica sozinho como sem resposta.
export const DIAS_AGUARDANDO_RESPOSTA = 3;

export function fimDaEspera(agora: Date = new Date()): Date {
    return new Date(agora.getTime() + DIAS_AGUARDANDO_RESPOSTA * 86400000);
}

// O banco roda a cada 15 minutos; passou da hora e continuou aqui, algo atrasou.
export function esperaVencida(followup: FollowupResumo | null, agora: Date = new Date()): boolean {
    return !!followup && new Date(followup.scheduled_at) <= agora;
}

export const notaTentativa = (tentativas: number) => `Tentativa ${tentativas + 2} de ${LIMITE_TENTATIVAS + 1}`;

// O contato de encerramento e o que vem depois das 3 tentativas sem resposta.
export function contatoEncerra(tentativas: number): boolean {
    return tentativas >= LIMITE_TENTATIVAS;
}

// Os mesmos prazos estao em classificar_sem_resposta, no banco: mude nos dois.
const PRAZOS_SEM_ORCAMENTO = [2, 25, 30];
const PRAZOS_COM_ORCAMENTO = [7, 14, 30];
export const DIAS_APOS_ORCAMENTO = 7;

// Dias ate o proximo contato; vazio quando a Thai escolhe a data ou o lead encerra.
export function diasAteProximo(resultado: string, tentativas: number, temOrcamento: boolean): number | null {
    if (resultado === 'avaliando') return 7;
    if (resultado === 'caro') return 2;
    if (resultado === 'orcamento_enviado') return DIAS_APOS_ORCAMENTO;
    if (resultado !== 'sem_resposta' || contatoEncerra(tentativas)) return null;
    return (temOrcamento ? PRAZOS_COM_ORCAMENTO : PRAZOS_SEM_ORCAMENTO)[tentativas];
}

export function dataProximoContato(dias: number, agora: Date = new Date()): Date {
    const data = new Date(agora);
    data.setDate(data.getDate() + dias);
    data.setHours(9, 0, 0, 0);
    return data;
}

const INTERESSE = ['reuniao', 'quer_fechar', 'retornar', 'caro', 'avaliando'];
const DIAS_CASAMENTO_PROXIMO = 90;

export function prioridadeContato(item: ItemContato, agora: Date = new Date()): { nivel: number; motivo: string } {
    if (item.contatosFeitos === 0 && !item.temOrcamento) return { nivel: 0, motivo: 'Lead novo' };
    if (item.ultimoResultado && INTERESSE.includes(item.ultimoResultado)) {
        return { nivel: 1, motivo: ROTULO_RESULTADO[item.ultimoResultado] };
    }
    if (item.temOrcamento && item.lead.event_date) {
        const dias = Math.ceil((new Date(item.lead.event_date + 'T12:00:00').getTime() - agora.getTime()) / 86400000);
        if (dias >= 0 && dias <= DIAS_CASAMENTO_PROXIMO) return { nivel: 2, motivo: `Casamento em ${dias} dias` };
    }
    return { nivel: 3, motivo: '' };
}

// Mesmas opcoes do seletor de ordem. Quem nao tem o dado usado na ordem fica por ultimo.
export function ordenarContatos<L extends LeadContato>(itens: ItemContato<L>[], ordem: string, agora: Date = new Date()): ItemContato<L>[] {
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
            case 'prioridade':
                return (prioridadeContato(a, agora).nivel - prioridadeContato(b, agora).nivel)
                    || comparar(dataEvento(a), dataEvento(b), 1);
            case 'event_date_asc': return comparar(dataEvento(a), dataEvento(b), 1);
            case 'event_date_desc': return comparar(dataEvento(a), dataEvento(b), -1);
            case 'followup_asc': return comparar(contato(a), contato(b), 1);
            case 'followup_desc': return comparar(contato(a), contato(b), -1);
            case 'created_at_desc': return comparar(criado(a), criado(b), -1);
            default: return 0;
        }
    });
}

export function organizarContatos<L extends LeadContato>(
    leads: L[],
    agora: Date = new Date(),
    temOrcamento: (lead: L) => boolean = () => false,
) {
    const inicioHoje = new Date(agora);
    inicioHoje.setHours(0, 0, 0, 0);
    const fimHoje = new Date(inicioHoje);
    fimHoje.setDate(fimHoje.getDate() + 1);

    const hoje: ItemContato<L>[] = [];
    const atrasados: ItemContato<L>[] = [];
    const semContato: ItemContato<L>[] = [];
    const aguardando: ItemContato<L>[] = [];
    const agendados: ItemContato<L>[] = [];
    let casamentoPassado = 0;

    for (const lead of leads) {
        if (!ETAPAS_ATIVAS.includes(lead.status)) continue;
        if (lead.event_date && new Date(lead.event_date + 'T23:59:59') < inicioHoje) {
            casamentoPassado++;
            continue;
        }
        const item = resumoContato(lead, temOrcamento(lead));
        if (!item.followup) {
            semContato.push(item);
            continue;
        }
        const quando = new Date(item.followup.scheduled_at);
        if (item.aguardando) aguardando.push(item);
        else if (quando >= fimHoje) agendados.push(item);
        else if (quando >= inicioHoje) hoje.push(item);
        else atrasados.push(item);
    }

    return { hoje, atrasados, semContato, aguardando, agendados, casamentoPassado };
}
