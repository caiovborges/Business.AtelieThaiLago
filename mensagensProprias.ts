// Mensagens proprias: textos que a Thai cria na tela Mensagens (ex.: recado para as noivas da feira).
// Aparecem como opcao no campo "Mensagem do botao WhatsApp" do lead.
import { supabase } from './supabaseClient';

export interface MensagemPropria {
    id: string;
    titulo: string;
    texto: string;
}

export const LIMITE_PROPRIA = 2000;

// Valor usado no seletor de mensagem para diferenciar das mensagens do follow-up.
export const PREFIXO_PROPRIA = 'propria:';
export const ehPropria = (valor: string) => valor.startsWith(PREFIXO_PROPRIA);

let lista: MensagemPropria[] = [];

export const mensagensProprias = () => lista;

export const textoPropria = (valor: string): string | null =>
    lista.find(m => PREFIXO_PROPRIA + m.id === valor)?.texto ?? null;

export function validarPropria(titulo: string, texto: string): string | null {
    if (!titulo.trim()) return 'Dê um nome para a mensagem.';
    if (titulo.trim().length > 80) return 'O nome pode ter até 80 caracteres.';
    if (!texto.trim()) return 'Escreva a mensagem.';
    if (texto.length > LIMITE_PROPRIA) return `A mensagem pode ter até ${LIMITE_PROPRIA} caracteres.`;
    return null;
}

// Se a leitura falhar, o app continua so com as mensagens do follow-up.
export async function carregarProprias(): Promise<MensagemPropria[]> {
    const { data, error } = await supabase.from('mensagens_proprias').select('id, titulo, texto').order('created_at');
    if (error) {
        console.warn('Não foi possível carregar as mensagens próprias.');
        return lista;
    }
    lista = (data || []) as MensagemPropria[];
    return lista;
}

export async function salvarPropria(titulo: string, texto: string, id?: string): Promise<void> {
    const dados = { titulo: titulo.trim(), texto };
    const { error } = id
        ? await supabase.from('mensagens_proprias').update(dados).eq('id', id)
        : await supabase.from('mensagens_proprias').insert(dados);
    if (error) throw new Error('Não foi possível salvar a mensagem: ' + error.message);
    await carregarProprias();
}

export async function apagarPropria(id: string): Promise<void> {
    const { error } = await supabase.from('mensagens_proprias').delete().eq('id', id);
    if (error) throw new Error('Não foi possível apagar a mensagem: ' + error.message);
    lista = lista.filter(m => m.id !== id);
}
