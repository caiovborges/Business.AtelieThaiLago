// Link de assinatura da agenda. O calendario do celular nao envia login, entao o
// acesso e pelo token privado de cada conta, conferido a cada leitura.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { ContatoAgenda, EventoAgenda, FonteAgenda, responderAgenda } from './calendario.ts';

function chaveServidor(): string {
  const chaves = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (chaves) {
    const padrao = JSON.parse(chaves)['default'];
    if (padrao) return padrao;
  }
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
}

const banco = createClient(Deno.env.get('SUPABASE_URL') ?? '', chaveServidor(), {
  auth: { persistSession: false, autoRefreshToken: false },
});

const ETAPAS_ATIVAS = ['Novo Lead', 'Proposta Enviada', 'Em Negociação'];

const fonte: FonteAgenda = {
  async contaDoToken(token) {
    const { data, error } = await banco.from('agenda_assinaturas').select('user_id').eq('token', token).maybeSingle();
    if (error) throw error;
    return data?.user_id ?? null;
  },
  async contaAprovada(usuarioId) {
    const { data, error } = await banco.from('user_profiles').select('role').eq('user_id', usuarioId).maybeSingle();
    if (error) throw error;
    return data?.role === 'admin' || data?.role === 'member';
  },
  async dados(desde) {
    const [eventos, contatos] = await Promise.all([
      banco
        .from('eventos')
        .select('id, nome, data_evento, status, local, servico')
        .neq('status', 'Cancelado')
        .not('data_evento', 'is', null)
        .gte('data_evento', desde.toISOString().slice(0, 10)),
      banco
        .from('lead_followups')
        .select('id, lead_id, scheduled_at, notes, leads!inner(name, status)')
        .eq('done', false)
        .is('enviada_em', null)
        .in('leads.status', ETAPAS_ATIVAS)
        .gte('scheduled_at', new Date(Date.now() - 86400000).toISOString()),
    ]);
    if (eventos.error) throw eventos.error;
    if (contatos.error) throw contatos.error;
    return {
      eventos: (eventos.data ?? []) as EventoAgenda[],
      contatos: (contatos.data ?? []).map((c: any): ContatoAgenda => ({
        id: c.id,
        lead_id: c.lead_id,
        scheduled_at: c.scheduled_at,
        notes: c.notes,
        lead_nome: c.leads?.name ?? 'Lead',
      })),
    };
  },
};

Deno.serve((req: Request) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Método não permitido', { status: 405, headers: { Allow: 'GET, HEAD' } });
  }
  return responderAgenda(new URL(req.url).searchParams.get('token'), fonte);
});
