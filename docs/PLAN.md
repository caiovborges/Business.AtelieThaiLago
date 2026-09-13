# Event Planning Area - Implementation Plan

## Goal Description
Criar uma página de Calendário interativa para visualização fácil de compromissos e eventos. O calendário deve seguir a identidade visual da marca (usando cores como Rosa `#E6007E`, Escuro `#1A1A1A` e Fundo Claro `#F9F7F2`) e deve "conversar" com o calendário do iPhone (Apple Calendar).

## User Review Required
> [!IMPORTANT]
> Sincronização entre sistemas (2-way sync com Apple) pode ser complexa. A abordagem recomendada (mais estável e rápida) é usar o padrão **iCal (.ics)**:
> 1. **Web -> iPhone**: O sistema gera um link (feed) que você adiciona no seu iPhone. Assim, todos os eventos do sistema aparecem no seu celular automaticamente.
> 2. **iPhone -> Web**: Você pode exportar o link público do seu iCloud Calendar e colocar no sistema, permitindo que o calendário do sistema exiba também seus compromissos pessoais do iPhone.
> 
> Você aprova esta abordagem de "Assinatura de Calendário (iCal)", ou prefere tentar uma conexão direta via API de terceiros?

## Proposed Changes

### Frontend UI

#### [NEW] `pages/CalendarPage.tsx`
- Uma nova página acessível pelo menu lateral chamada "Calendário".
- Utilização de uma interface de calendário (mensal/semanal), construída com componentes React e TailwindCSS.
- Eventos serão exibidos em blocos com as cores da identidade visual (`#E6007E` para eventos principais).
- Clicar em um evento abrirá seus detalhes (integrado aos `Eventos` existentes no `types.ts`).

#### [MODIFY] `App.tsx` & `components/Sidebar.tsx`
- Adicionar a nova rota `/calendario`.
- Adicionar o item "Calendário" no menu principal.

### Backend / Integração (Fase Seguinte)
#### [NEW] Sincronização iCal (App -> iPhone)
- Criação de uma rota API (ex: Serverless function na Vercel ou Supabase Edge Function) `/api/calendar/feed` que converta a lista de `Event` do banco de dados em formato `.ics`.
- Você copiará o link dessa rota e "assinará" no seu iPhone.

#### [NEW] Leitura iCal (iPhone -> App) *opcional*
- Adição de um campo em Configurações para colar a URL pública do seu iCloud Calendar.
- O Frontend fará o parse desse `.ics` e mesclará na visualização do seu calendário no web app.

## Verification Plan

### Automated Tests
- Testar a geração do feed `.ics` para garantir que o formato é válido e reconhecido por clientes de calendário (Apple, Google, Outlook).

### Manual Verification
1. Acessar a página de Calendário e verificar o design responsivo.
2. Assinar o feed de teste gerado no iPhone e verificar se um evento de teste é exibido.
