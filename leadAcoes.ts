// Acoes do atendimento usadas na lista "Falar hoje", no perfil e no orcamento.
import { supabase } from './supabaseClient';

interface RegistroContato {
    leadId: string;
    followupId: string | null;
    resultado: string;
    proximo: Date | null;
    nota?: string | null;
    status?: string | null;
    motivo?: string | null;
}

// Resultado, proximo contato e etapa sao gravados juntos pelo banco.
export async function registrarContato({ leadId, followupId, resultado, proximo, nota, status, motivo }: RegistroContato): Promise<void> {
    const { error } = await supabase.rpc('registrar_contato', {
        p_lead_id: leadId,
        p_followup_id: followupId,
        p_resultado: resultado,
        p_proximo: proximo ? proximo.toISOString() : null,
        p_nota: nota || null,
        p_status: status || null,
        p_motivo: motivo || null,
    });
    if (error) throw new Error('Não foi possível registrar o contato. Nada foi alterado: ' + error.message);
}
