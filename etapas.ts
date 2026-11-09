// Etapas do funil de leads. Os mesmos nomes estao no banco (registrar_contato e
// classificar_sem_resposta) e na funcao agenda: mude nos tres lugares.

export const ETAPA = {
    novo: 'Novo Lead',
    conversa: 'Em Conversa',
    orcamento: 'Orçamento Enviado',
    negociando: 'Negociando',
    sinal: 'Aguardando Sinal',
    fechado: 'Fechado',
    semResposta: 'Sem Resposta',
    perdido: 'Perdido',
} as const;

// Ordem do funil, do primeiro contato ao fechamento.
export const ETAPAS_FUNIL: string[] = [ETAPA.novo, ETAPA.conversa, ETAPA.orcamento, ETAPA.negociando, ETAPA.sinal, ETAPA.fechado];

// Leads em atendimento: aparecem no Falar Hoje e no Funil Ativo.
export const ETAPAS_ATIVAS: string[] = [ETAPA.novo, ETAPA.conversa, ETAPA.orcamento, ETAPA.negociando, ETAPA.sinal];

// Leads encerrados sem venda.
export const ETAPAS_ENCERRADAS: string[] = [ETAPA.semResposta, ETAPA.perdido];

// Todas, na ordem dos seletores.
export const PIPELINE_STAGES: string[] = [...ETAPAS_FUNIL, ...ETAPAS_ENCERRADAS];

// Ja recebeu orcamento: muda os prazos do follow-up e as mensagens.
export const ETAPAS_COM_ORCAMENTO: string[] = [ETAPA.orcamento, ETAPA.negociando, ETAPA.sinal];

export const encerrado = (status: string) => ETAPAS_ENCERRADAS.includes(status);

// So avanca: nunca devolve o lead para uma etapa anterior do funil.
export function avancar(atual: string, proxima: string): string | null {
    const de = ETAPAS_FUNIL.indexOf(atual);
    const para = ETAPAS_FUNIL.indexOf(proxima);
    if (de === -1 || para === -1 || para <= de) return null;
    return proxima;
}

export const DESCRICAO_ETAPA: Record<string, string> = {
    [ETAPA.novo]: 'Chegou e ainda não recebeu mensagem.',
    [ETAPA.conversa]: 'Já recebeu mensagem; falta mandar o orçamento.',
    [ETAPA.orcamento]: 'Orçamento enviado, esperando retorno.',
    [ETAPA.negociando]: 'Respondeu ao orçamento: preço, reunião ou ajustes.',
    [ETAPA.sinal]: 'Quer fechar; falta contrato ou sinal.',
    [ETAPA.fechado]: 'Sinal pago, evento criado.',
    [ETAPA.semResposta]: 'Sumiu depois de todas as tentativas. Dá para chamar de novo.',
    [ETAPA.perdido]: 'Recusou, fechou com outro ou a data passou.',
};

// Cores: borda/fundo das colunas e selos.
export const COR_ETAPA: Record<string, string> = {
    [ETAPA.novo]: 'bg-blue-50 text-blue-700 border-blue-300',
    [ETAPA.conversa]: 'bg-cyan-50 text-cyan-700 border-cyan-300',
    [ETAPA.orcamento]: 'bg-purple-50 text-purple-700 border-purple-300',
    [ETAPA.negociando]: 'bg-pink-50 text-pink-700 border-pink-300',
    [ETAPA.sinal]: 'bg-amber-50 text-amber-700 border-amber-300',
    [ETAPA.fechado]: 'bg-green-50 text-green-700 border-green-300',
    [ETAPA.semResposta]: 'bg-slate-100 text-slate-600 border-slate-300',
    [ETAPA.perdido]: 'bg-gray-100 text-gray-600 border-gray-300',
};
