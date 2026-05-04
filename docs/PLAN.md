# Event Planning Area - Implementation Plan

## Goal Description
Adicionar uma área dedicada ao **Planejamento de Eventos**. O objetivo é permitir que você preveja os custos (deslocamento, materiais, equipe/pintoras) e visualize a margem de lucro estimada *antes* de registrar as despesas reais, garantindo a lucratividade. O planejamento ficará em uma página separada para não misturar com o financeiro real.

## User Review Required
> [!IMPORTANT]
> O plano foi atualizado para criar uma **Página Dedicada** ao invés de abas no Financeiro.

## Proposed Changes

### Database (Supabase)
Criar uma migration para adicionar os seguintes campos à tabela `eventos`:
- `valor_previsto` (numeric): O valor total cobrado do cliente (Receita Prevista).
- `pintoras` (text[]): Lista de nomes das pintoras escaladas.
- `custo_prev_materiais` (numeric): Custo estimado com materiais.
- `custo_prev_deslocamento` (numeric): Custo estimado de transporte/hospedagem.
- `custo_prev_equipe` (numeric): Custo estimado com o pagamento das pintoras.
- `custo_prev_outros` (numeric): Margem para imprevistos ou outros custos.

### Frontend UI

#### [NEW] `pages/EventPlannerBoard.tsx` (ou similar)
- Uma nova página acessível pelo menu lateral (Sidebar) chamada "Planejamento".
- Mostrará a lista de eventos futuros.
- Ao clicar em um evento, abrirá o painel de planejamento daquele evento específico.

#### [NEW] Painel de Planejamento do Evento
Pode ser um Modal ou uma tela expansível dentro da nova página de Planejamento. Conterá:
- Formulário para definir o **Valor Fechado (Receita Prevista)**.
- Campos dinâmicos/tags para adicionar **Nomes das Pintoras**.
- Campos numéricos para estimar os custos de **Materiais**, **Deslocamento**, **Equipe** e **Outros**.
- Um Dashboard mostrando a **Margem de Lucro Estimada** (Valor Previsto - Soma dos Custos Previstos) e o percentual de margem.

#### [MODIFY] `App.tsx` & `components/Sidebar.tsx`
- Adicionar a nova rota `/planejamento`.
- Adicionar o item "Planejamento" no menu de navegação.

## Verification Plan

### Automated Tests
- N/A para esta alteração.

### Manual Verification
1. Navegar até a nova página "Planejamento" pelo menu.
2. Selecionar um evento pendente/confirmado.
3. Preencher os valores previstos e adicionar pintoras.
4. Salvar e verificar se o cálculo de margem reflete a realidade e salva no banco de dados.
