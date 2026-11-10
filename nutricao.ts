// Biblioteca de conteudos do atelie (links do Instagram/Drive) para nutrir leads com
// casamento longe, e o texto do WhatsApp de cada contato de nutricao.
import { supabase } from './supabaseClient';
import { FollowupResumo, ItemContato, LeadContato, linkWhatsApp, montarMensagem, montarTexto, textoMensagem } from './leadContato';

export interface Conteudo {
    id: string;
    titulo: string;
    link: string;
    servico: string | null;
    texto: string | null;
    ativo: boolean;
    ordem: number;
}

let biblioteca: Conteudo[] = [];
export const conteudos = () => biblioteca;

// Se a leitura falhar, a nutricao continua funcionando, so sem sugerir conteudo.
export async function carregarConteudos(): Promise<Conteudo[]> {
    const { data, error } = await supabase
        .from('conteudos_nutricao')
        .select('id, titulo, link, servico, texto, ativo, ordem')
        .order('ordem', { ascending: true })
        .order('created_at', { ascending: true });
    if (error) {
        console.error('Conteúdos de nutrição não carregados:', error.message);
        return biblioteca;
    }
    biblioteca = (data || []) as Conteudo[];
    return biblioteca;
}

export type ConteudoForm = Pick<Conteudo, 'titulo' | 'link' | 'servico' | 'texto' | 'ativo' | 'ordem'>;

export function validarConteudo(c: ConteudoForm): string | null {
    if (!c.titulo.trim()) return 'Dê um nome ao conteúdo.';
    if (c.titulo.trim().length > 120) return 'O nome pode ter até 120 caracteres.';
    if (!/^https?:\/\/\S+$/i.test(c.link.trim())) return 'Cole o link completo, começando com https://';
    if (c.texto && c.texto.length > 2000) return 'O texto pode ter até 2000 caracteres.';
    return null;
}

const limpar = (c: ConteudoForm) => ({
    titulo: c.titulo.trim(),
    link: c.link.trim(),
    servico: c.servico?.trim() || null,
    texto: c.texto?.trim() || null,
    ativo: c.ativo,
    ordem: c.ordem,
});

export async function salvarConteudo(c: ConteudoForm, id?: string): Promise<void> {
    const erro = validarConteudo(c);
    if (erro) throw new Error(erro);
    const { error } = id
        ? await supabase.from('conteudos_nutricao').update(limpar(c)).eq('id', id)
        : await supabase.from('conteudos_nutricao').insert(limpar(c));
    if (error) throw new Error('Não foi possível salvar o conteúdo: ' + error.message);
    await carregarConteudos();
}

export async function apagarConteudo(id: string): Promise<void> {
    const { error } = await supabase.from('conteudos_nutricao').delete().eq('id', id);
    if (error) throw new Error('Não foi possível apagar o conteúdo: ' + error.message);
    await carregarConteudos();
}

// Conteudo da vez para o lead: primeiro os do servico dele que ainda nao recebeu,
// depois os gerais que ainda nao recebeu; se ja recebeu todos, o mais antigo enviado.
export function escolherConteudo(
    lead: Pick<LeadContato, 'services'>,
    followups: FollowupResumo[],
    lista: Conteudo[] = biblioteca,
): Conteudo | null {
    const ativos = lista.filter(c => c.ativo);
    if (!ativos.length) return null;
    const servicos = lead.services || [];
    const serve = (c: Conteudo) => !c.servico || servicos.includes(c.servico);
    const candidatos = ativos.filter(serve).length ? ativos.filter(serve) : ativos;

    const ultimoEnvio = new Map<string, number>();
    for (const f of followups) {
        if (!f.done || !f.conteudo_id) continue;
        const quando = new Date(f.feito_em || f.scheduled_at).getTime();
        ultimoEnvio.set(f.conteudo_id, Math.max(ultimoEnvio.get(f.conteudo_id) || 0, quando));
    }
    const nuncaEnviados = candidatos.filter(c => !ultimoEnvio.has(c.id));
    if (nuncaEnviados.length) {
        const doServico = nuncaEnviados.filter(c => c.servico && servicos.includes(c.servico));
        return (doServico.length ? doServico : nuncaEnviados)[0];
    }
    return [...candidatos].sort((a, b) => (ultimoEnvio.get(a.id) || 0) - (ultimoEnvio.get(b.id) || 0))[0];
}

// Texto da nutricao: o texto proprio do conteudo ou a mensagem padrao, com o link.
export function textoNutricao(lead: { name: string }, conteudo: Conteudo | null): string {
    const base = conteudo?.texto || textoMensagem('nutricao');
    const link = conteudo?.link || '';
    const comLink = base.includes('{link}') ? base.split('{link}').join(link) : (link ? `${base}\n\n${link}` : base);
    return montarTexto(comLink, lead.name).trim();
}

// Link do WhatsApp do contato: na nutricao leva o conteudo da vez.
export function whatsappDoItem(item: ItemContato, chave = item.mensagem): string | null {
    const { lead } = item;
    if (chave === 'nutricao') {
        const conteudo = escolherConteudo(lead, lead.lead_followups || []);
        return linkWhatsApp(lead.phone, textoNutricao(lead, conteudo));
    }
    return linkWhatsApp(lead.phone, montarMensagem(chave, lead));
}
