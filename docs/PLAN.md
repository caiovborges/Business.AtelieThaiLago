# Planejamento de Cotações - Implementation Plan

## Goal Description
Atualmente o sistema apenas permite criar planejamento (custos, equipe, margem) para eventos que estão com status `Confirmado`. A necessidade é poder realizar todo o planejamento financeiro e de equipe para eventos que ainda são apenas "cotação" (orçamento não confirmado).

Para resolver isso, vamos reintroduzir/adicionar o status `Orçamento` no fluxo de criação de eventos, e permitir que o Planejador carregue eventos com este status.

## User Review Required
> [!IMPORTANT]
> Vamos criar o status **Orçamento** para representar essa fase de "Cotação" de um casamento não confirmado. 
> Assim você poderá criar um evento na tela de Eventos marcando-o como "Orçamento" e, em seguida, ir na tela de Planejamento e adicionar os custos previstos para simular a margem.
> Você está de acordo com usar o nome de status "Orçamento"? 

## Proposed Changes

### Frontend UI

#### [MODIFY] `components/EventModal.tsx`
- Adicionar `Orçamento` na lista `STATUS_OPTIONS`.
- Definir uma cor específica para `Orçamento` no objeto `STATUS_COLORS` (ex: roxo ou amarelo).
- Remover ou ajustar a regra que atualmente força o status para `Confirmado` quando editado.

#### [MODIFY] `pages/EventCanvas.tsx`
- Adicionar o filtro `Orçamento` no topo da tela (`ALL_STATUSES`).
- Definir a cor para `Orçamento` em `STATUS_COLORS`.

#### [MODIFY] `pages/EventPlanner.tsx`
- Atualizar a busca no Supabase para buscar eventos com status `Orçamento` além de `Pendente` e `Confirmado`: `.in('status', ['Pendente', 'Confirmado', 'Orçamento'])`.
- Definir a cor em `STATUS_COLORS`.
- Atualizar os textos e ícones que indicam que apenas eventos confirmados aparecem (para incluir orçamentos).

#### [MODIFY] `pages/EventLedger.tsx`
- Definir a cor para `Orçamento` em `STATUS_COLORS` para manter a consistência visual quando for ver as finanças (caso aplicável).

## Verification Plan

### Manual Verification
1. Ir na aba Eventos, clicar em "Novo Evento" e verificar se é possível salvar como "Orçamento".
2. Ir na aba Planejamento e verificar se o evento "Orçamento" aparece na listagem.
3. Clicar no evento de orçamento e verificar se é possível simular os custos e equipe normalmente.
4. Mudar o status do evento para "Confirmado" e garantir que o planejamento salvo não se perdeu.
