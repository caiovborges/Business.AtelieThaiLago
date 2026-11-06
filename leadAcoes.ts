// Acoes do atendimento usadas na lista "Falar hoje" e no perfil do lead.
import { supabase } from './supabaseClient';
import { DIAS_APOS_LIMITE, ItemContato, dataProximoContato, diasAteProximoContato } from './leadContato';

export async function marcarPerdido(lead: { id: string; name: string }, followupId: string | null): Promise<string> {
    const { error } = await supabase.from('leads').update({ status: 'Perdido' }).eq('id', lead.id);
    if (error) throw new Error('Erro ao atualizar status: ' + error.message);
    if (followupId) await supabase.from('lead_followups').update({ done: true }).eq('id', followupId);
    return `${lead.name} marcado como Perdido.`;
}

export async function registrarContatoFeito(userId: string, { lead, followup, contatosFeitos }: ItemContato): Promise<string> {
    const feitos = contatosFeitos + 1;
    let dias = diasAteProximoContato(feitos);
    if (dias === null) {
        if (window.confirm(`Já foram ${feitos} contatos com ${lead.name}. Marcar como Perdido? Se cancelar, agendo outro contato em ${DIAS_APOS_LIMITE} dias.`)) {
            return marcarPerdido(lead, followup?.id ?? null);
        }
        dias = DIAS_APOS_LIMITE;
    }

    if (followup) {
        const { error } = await supabase.from('lead_followups').update({ done: true }).eq('id', followup.id);
        if (error) throw new Error('Erro ao marcar o contato como feito: ' + error.message);
    }

    const proximo = dataProximoContato(dias);
    const { error } = await supabase.from('lead_followups').insert({
        user_id: userId,
        lead_id: lead.id,
        type: 'WhatsApp',
        scheduled_at: proximo.toISOString(),
        notes: `Contato ${feitos + 1}`,
        done: false,
    });
    if (error) throw new Error('Contato marcado como feito, mas o próximo não foi agendado: ' + error.message);
    return `${lead.name}: próximo contato em ${proximo.toLocaleDateString('pt-BR')}.`;
}
