// Status do evento. Orcamento de quem ainda nao fechou fica no funil de leads (etapas.ts).
// Os mesmos nomes estao no banco (fechar_lead cria o evento como Confirmado).

export const STATUS = {
    confirmado: 'Confirmado',
    concluido: 'Concluído',
    cancelado: 'Cancelado',
} as const;

// Ordem dos seletores e filtros.
export const STATUS_EVENTO: string[] = [STATUS.confirmado, STATUS.concluido, STATUS.cancelado];

const COR_STATUS: Record<string, string> = {
    [STATUS.confirmado]: 'bg-blue-100 text-blue-800 border-blue-300',
    [STATUS.concluido]: 'bg-green-100 text-green-800 border-green-300',
    [STATUS.cancelado]: 'bg-red-100 text-red-800 border-red-300',
};

const SEM_COR = 'bg-gray-100 text-gray-600 border-gray-300';

// Fundo, texto e borda do selo.
export const corStatus = (status: string) => COR_STATUS[status] || SEM_COR;

// So fundo e texto, para quem usa a propria borda.
export const fundoStatus = (status: string) =>
    corStatus(status).split(' ').filter(classe => !classe.startsWith('border-')).join(' ');
