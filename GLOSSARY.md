# Glossário

Nomes usados no código e nas telas. Ao criar algo novo, use estes termos.

## Evento

**Evento**: um trabalho fechado (casamento, festa, encomenda). Nasce quando um lead é fechado (`fechar_lead`) ou é criado à mão na tela Eventos.

**Status do evento**: `Confirmado`, `Concluído` ou `Cancelado`. A lista e as cores ficam em `statusEvento.ts`. A mudança é manual. O orçamento de quem ainda não fechou fica no funil de leads (`etapas.ts`), não no evento.

**Valor do contrato**: quanto o cliente vai pagar pelo evento (coluna `eventos.valor_previsto`). Só é alterado no fechamento do lead e nas Parcelas da tela do evento. O Planejamento só lê.

**Parcela**: parte do valor do contrato com vencimento. Ao ser recebida, vira uma receita lançada (`parcelas.ts`).

## Planejamento

**Planejamento**: o módulo `planejamento.ts`. Junta custos previstos, valor do contrato e despesas lançadas e devolve as margens e a diferença por categoria.

**Custo previsto**: uma linha de custo que se espera ter no evento, com categoria, descrição e valor (tabela `custos_previstos`). As pintoras entram aqui, na categoria Assistentes, com o cachê.

**Equipe**: os custos previstos da categoria Assistentes. O custo de equipe é a soma deles.

**Realizado**: as despesas lançadas no evento (tabela `transacoes`, tipo `despesa`), somadas por categoria. Despesa sem categoria aparece como "Sem categoria".

**Receita do evento**: o maior entre o valor do contrato e o que já foi recebido. Cobre evento antigo sem contrato preenchido e evento que recebeu extras. Recebido menor que o contrato não reduz a receita: parcela ainda não vencida não é prejuízo.

**Margem prevista**: receita do evento − custos previstos.

**Margem real**: receita do evento − realizado.

**Diferença**: por categoria, realizado − previsto. Positiva quer dizer que gastou mais que o previsto.

## Funil de leads

**Etapa**: posição do lead no funil (`etapas.ts`): Novo Lead → Em Conversa → Orçamento Enviado → Negociando → Aguardando Sinal → Fechado.

**Orçamento**: proposta enviada a um lead (tabela `propostas`). Ao fechar o lead, a opção escolhida vira o valor do contrato do evento.
