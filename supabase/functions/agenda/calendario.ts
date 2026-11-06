// Monta a agenda no formato de calendario assinado pelo iPhone e pelo Google Agenda.

export interface EventoAgenda {
  id: string;
  nome: string;
  data_evento: string;
  status: string;
  local: string | null;
  servico: string[] | null;
}

export interface ContatoAgenda {
  id: string;
  lead_id: string;
  scheduled_at: string;
  notes: string | null;
  lead_nome: string;
}

export interface DadosAgenda {
  eventos: EventoAgenda[];
  contatos: ContatoAgenda[];
}

export interface FonteAgenda {
  contaDoToken(token: string): Promise<string | null>;
  contaAprovada(usuarioId: string): Promise<boolean>;
  dados(desde: Date): Promise<DadosAgenda>;
}

const SITE = 'https://businessateliethailago.com.br';
const DOMINIO_UID = 'ateliethailago.com.br';
const DURACAO_CONTATO_MIN = 30;
const DIAS_PASSADOS_EVENTOS = 180;
const TOKEN_VALIDO = /^[a-f0-9]{64}$/;

export function escaparTexto(valor: string): string {
  return valor
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// O formato limita cada linha a 75 bytes, sem partir um caractere acentuado.
export function dobrarLinha(linha: string): string[] {
  const codificador = new TextEncoder();
  const partes: string[] = [];
  let atual = '';
  let bytes = 0;
  for (const caractere of linha) {
    const tamanho = codificador.encode(caractere).length;
    const limite = partes.length === 0 ? 75 : 74; // a continuacao comeca com um espaco
    if (bytes + tamanho > limite) {
      partes.push(atual);
      atual = '';
      bytes = 0;
    }
    atual += caractere;
    bytes += tamanho;
  }
  partes.push(atual);
  return partes.map((parte, i) => (i === 0 ? parte : ' ' + parte));
}

const doisDigitos = (n: number) => String(n).padStart(2, '0');

function dataHoraUtc(data: Date): string {
  return `${data.getUTCFullYear()}${doisDigitos(data.getUTCMonth() + 1)}${doisDigitos(data.getUTCDate())}`
    + `T${doisDigitos(data.getUTCHours())}${doisDigitos(data.getUTCMinutes())}${doisDigitos(data.getUTCSeconds())}Z`;
}

function diaSeguinte(dia: string): string {
  const [ano, mes, data] = dia.split('-').map(Number);
  const d = new Date(Date.UTC(ano, mes - 1, data + 1));
  return `${d.getUTCFullYear()}${doisDigitos(d.getUTCMonth() + 1)}${doisDigitos(d.getUTCDate())}`;
}

export function tituloContato(contato: ContatoAgenda): string {
  const nome = contato.lead_nome.trim();
  return contato.notes?.trim() === 'Reunião' ? `Reunião: ${nome}` : `Follow-up: ${nome}`;
}

export function montarCalendario({ eventos, contatos }: DadosAgenda, agora: Date = new Date()): string {
  const carimbo = dataHoraUtc(agora);
  const linhas: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Atelie Thai Lago//Agenda//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Ateliê Thai Lago',
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const evento of eventos) {
    const dia = evento.data_evento.replace(/-/g, '');
    const detalhes = [
      (evento.servico || []).join(', '),
      `Status: ${evento.status}`,
      `${SITE}/events/${evento.id}`,
    ].filter(Boolean).join('\n');
    linhas.push(
      'BEGIN:VEVENT',
      `UID:evento-${evento.id}@${DOMINIO_UID}`,
      `DTSTAMP:${carimbo}`,
      `DTSTART;VALUE=DATE:${dia}`,
      `DTEND;VALUE=DATE:${diaSeguinte(evento.data_evento)}`,
      `SUMMARY:${escaparTexto(evento.nome.trim())}`,
    );
    if (evento.local?.trim()) linhas.push(`LOCATION:${escaparTexto(evento.local.trim())}`);
    linhas.push(`DESCRIPTION:${escaparTexto(detalhes)}`, 'TRANSP:OPAQUE', 'END:VEVENT');
  }

  for (const contato of contatos) {
    const inicio = new Date(contato.scheduled_at);
    const fim = new Date(inicio.getTime() + DURACAO_CONTATO_MIN * 60000);
    const detalhes = [contato.notes?.trim(), `${SITE}/leads/${contato.lead_id}`].filter(Boolean).join('\n');
    linhas.push(
      'BEGIN:VEVENT',
      `UID:contato-${contato.id}@${DOMINIO_UID}`,
      `DTSTAMP:${carimbo}`,
      `DTSTART:${dataHoraUtc(inicio)}`,
      `DTEND:${dataHoraUtc(fim)}`,
      `SUMMARY:${escaparTexto(tituloContato(contato))}`,
      `DESCRIPTION:${escaparTexto(detalhes)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }

  linhas.push('END:VCALENDAR');
  return linhas.flatMap(dobrarLinha).join('\r\n') + '\r\n';
}

// Token invalido, desconhecido ou de conta sem acesso recebem a mesma resposta.
export async function responderAgenda(token: string | null, fonte: FonteAgenda, agora: Date = new Date()): Promise<Response> {
  const naoEncontrado = () => new Response('Agenda não encontrada', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });

  if (!token || !TOKEN_VALIDO.test(token)) return naoEncontrado();

  try {
    const usuarioId = await fonte.contaDoToken(token);
    if (!usuarioId || !(await fonte.contaAprovada(usuarioId))) return naoEncontrado();

    const desde = new Date(agora.getTime() - DIAS_PASSADOS_EVENTOS * 86400000);
    const corpo = montarCalendario(await fonte.dados(desde), agora);
    return new Response(corpo, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="atelie-thai-lago.ics"',
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    // Nao expor detalhes nem guardar o token em logs
    console.error('Falha ao montar a agenda');
    return new Response('Agenda indisponível no momento', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '3600' },
    });
  }
}
