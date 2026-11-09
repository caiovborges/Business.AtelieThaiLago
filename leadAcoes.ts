// Acoes do atendimento usadas na lista "Falar hoje", no perfil e no orcamento.
import { supabase } from './supabaseClient';
import {
    ItemContato, MOTIVO_SEM_RESPOSTA, contatoEncerra, dataProximoContato, diasAteProximo, fimDaEspera, notaTentativa,
} from './leadContato';
import { ETAPA } from './etapas';

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

// A Thai enviou a mensagem: o lead aguarda a resposta. Sem resposta na espera, o banco classifica sozinho.
// O encerramento e o ultimo contato, entao encerra o lead em vez de aguardar.
// Devolve o aviso para a tela, ou vazio se ela desistiu de encerrar.
export async function mensagemEnviada(item: ItemContato, usuarioId: string): Promise<string> {
    const { lead, followup, tentativas } = item;

    if (contatoEncerra(tentativas)) {
        if (!window.confirm(`Esta é a mensagem de encerramento. ${lead.name} vai para ${ETAPA.semResposta}. Continuar?`)) return '';
        await registrarContato({
            leadId: lead.id,
            followupId: followup?.id ?? null,
            resultado: 'sem_resposta',
            proximo: null,
            status: ETAPA.semResposta,
            motivo: MOTIVO_SEM_RESPOSTA,
        });
        return `${lead.name} foi para ${ETAPA.semResposta}.`;
    }

    const limite = fimDaEspera();
    const envio = { enviada_em: new Date().toISOString(), scheduled_at: limite.toISOString() };
    const { error } = followup
        ? await supabase.from('lead_followups').update(envio).eq('id', followup.id)
        : await supabase.from('lead_followups').insert({ ...envio, user_id: usuarioId, lead_id: lead.id, type: 'WhatsApp', done: false });
    if (error) throw new Error('Não foi possível registrar o envio. Nada foi alterado: ' + error.message);

    // Primeira mensagem: o lead sai de Novo Lead.
    if (lead.status === ETAPA.novo) {
        const { error: erroEtapa } = await supabase.from('leads').update({ status: ETAPA.conversa }).eq('id', lead.id).eq('status', ETAPA.novo);
        if (erroEtapa) throw new Error(`Mensagem registrada, mas a etapa não mudou para ${ETAPA.conversa}: ` + erroEtapa.message);
    }
    return `Mensagem registrada. Sem resposta até ${limite.toLocaleDateString('pt-BR')}, ${lead.name} é classificado sozinho e o próximo follow-up fica agendado.`;
}

// Reserva caso a classificacao automatica atrase: faz o mesmo que ela.
export async function naoRespondeu(item: ItemContato): Promise<string> {
    const { lead, followup, tentativas, temOrcamento } = item;
    const proximo = dataProximoContato(diasAteProximo('sem_resposta', tentativas, temOrcamento)!);
    await registrarContato({
        leadId: lead.id,
        followupId: followup?.id ?? null,
        resultado: 'sem_resposta',
        proximo,
        nota: notaTentativa(tentativas),
    });
    return `${lead.name}: sem resposta registrado. Próximo follow-up em ${proximo.toLocaleDateString('pt-BR')}.`;
}
