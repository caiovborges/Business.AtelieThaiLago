// Mensagens para listas: um texto pronto para um grupo de leads (ex.: as noivas de uma feira).
import { supabase } from './supabaseClient';
import { fimDaEspera, linkWhatsApp, montarTexto } from './leadContato';

export interface ListaMensagem {
    id: string;
    titulo: string;
    texto: string;
    origem: string | null; // null = qualquer origem
    etapas: string[];      // vazio = todas as etapas
    arquivada: boolean;
    created_at: string;
}

export type ListaForm = Pick<ListaMensagem, 'titulo' | 'texto' | 'origem' | 'etapas'>;

export interface LeadLista {
    id: string;
    name: string;
    phone: string | null;
    status: string;
    source: string | null;
    event_date: string | null;
}

export interface Envio {
    lista_id: string;
    lead_id: string;
    enviado_em: string;
}

export const LIMITE_TEXTO = 2000;

export function validarLista(f: ListaForm): string | null {
    if (!f.titulo.trim()) return 'Dê um nome para a lista.';
    if (f.titulo.trim().length > 80) return 'O nome pode ter até 80 caracteres.';
    if (!f.texto.trim()) return 'Escreva a mensagem.';
    if (f.texto.length > LIMITE_TEXTO) return `A mensagem pode ter até ${LIMITE_TEXTO} caracteres.`;
    return null;
}

const mesmaOrigem = (a: string | null, b: string | null) => (a || '').trim() === (b || '').trim();

// Quem a lista alcanca hoje (origem e etapas). Quem ja recebeu fica de fora dos pendentes na tela.
export function leadsDaLista(lista: Pick<ListaMensagem, 'origem' | 'etapas'>, leads: LeadLista[]): LeadLista[] {
    return leads.filter(l =>
        (lista.origem == null || mesmaOrigem(l.source, lista.origem)) &&
        (!lista.etapas.length || lista.etapas.includes(l.status)));
}

export const textoDoLead = (lista: Pick<ListaMensagem, 'texto'>, lead: { name: string }) => montarTexto(lista.texto, lead.name);

export const whatsappDoLead = (lista: Pick<ListaMensagem, 'texto'>, lead: LeadLista) => linkWhatsApp(lead.phone, textoDoLead(lista, lead));

// ---------- Banco ----------

export async function carregarListas(): Promise<ListaMensagem[]> {
    const { data, error } = await supabase
        .from('listas_mensagem')
        .select('id, titulo, texto, origem, etapas, arquivada, created_at')
        .order('created_at', { ascending: false });
    if (error) throw new Error('Não foi possível carregar as listas: ' + error.message);
    return (data || []) as ListaMensagem[];
}

export async function carregarLista(id: string): Promise<ListaMensagem | null> {
    const { data, error } = await supabase
        .from('listas_mensagem')
        .select('id, titulo, texto, origem, etapas, arquivada, created_at')
        .eq('id', id)
        .maybeSingle();
    if (error) throw new Error('Não foi possível carregar a lista: ' + error.message);
    return data as ListaMensagem | null;
}

export async function salvarLista(form: ListaForm, id?: string): Promise<string> {
    const dados = { titulo: form.titulo.trim(), texto: form.texto, origem: form.origem || null, etapas: form.etapas };
    const { data, error } = id
        ? await supabase.from('listas_mensagem').update(dados).eq('id', id).select('id').single()
        : await supabase.from('listas_mensagem').insert(dados).select('id').single();
    if (error) throw new Error('Não foi possível salvar a lista: ' + error.message);
    return data.id;
}

export async function arquivarLista(id: string, arquivada: boolean): Promise<void> {
    const { error } = await supabase.from('listas_mensagem').update({ arquivada }).eq('id', id);
    if (error) throw new Error('Não foi possível ' + (arquivada ? 'arquivar' : 'reativar') + ' a lista: ' + error.message);
}

export async function carregarLeadsParaListas(): Promise<LeadLista[]> {
    const { data, error } = await supabase
        .from('leads')
        .select('id, name, phone, status, source, event_date')
        .order('name');
    if (error) throw new Error('Não foi possível carregar os leads: ' + error.message);
    return (data || []) as LeadLista[];
}

export async function carregarEnvios(listaId?: string): Promise<Envio[]> {
    let consulta = supabase.from('envios_lista').select('lista_id, lead_id, enviado_em');
    if (listaId) consulta = consulta.eq('lista_id', listaId);
    const { data, error } = await consulta;
    if (error) throw new Error('Não foi possível carregar os envios: ' + error.message);
    return (data || []) as Envio[];
}

// Grava o envio e, se o lead esta em atendimento, ele passa a aguardar resposta (como "Mensagem enviada").
export async function registrarEnvio(lista: ListaMensagem, lead: LeadLista): Promise<string> {
    const limite = fimDaEspera();
    const { data, error } = await supabase.rpc('registrar_envio_lista', {
        p_lista_id: lista.id,
        p_lead_id: lead.id,
        p_espera_ate: limite.toISOString(),
    });
    if (error) throw new Error(`Não foi possível registrar o envio para ${lead.name}. Nada foi alterado: ` + error.message);
    return data === 'followup'
        ? `${lead.name}: envio registrado. Aguardando resposta até ${limite.toLocaleDateString('pt-BR')}; sem resposta, volta no Falar hoje.`
        : `${lead.name}: envio registrado (fora do atendimento ou em nutrição, o follow-up não mudou).`;
}
