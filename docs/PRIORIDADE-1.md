# Prioridade 1: passo a passo

Faça nesta ordem. Cada etapa funciona sozinha, então não há problema em parar entre elas.

## 1. Fazer o backup

No terminal, na pasta do projeto:

```bash
npm run backup
```

- Entre com a conta admin que enviou os contratos. A senha não fica salva.
- A cópia vai para `OneDrive\Backups\AtelieThaiLago\<data>`, fora do Git, e o OneDrive envia para a nuvem.
- Confira no ícone do OneDrive se a sincronização terminou. Só então a cópia está na nuvem.
- O arquivo `resumo.json` mostra quantos registros e contratos foram salvos.
- Repita toda semana. Coloque um lembrete na agenda.

Para usar o Google Drive, instale o Google Drive para computador e indique a pasta dele antes de rodar (troque `G:\Meu Drive` pelo caminho real):

```powershell
$env:BACKUP_DIR = "G:\Meu Drive"; npm run backup
```

**Limites:** o script salva os dados e os contratos, não a estrutura do banco nem as contas de login.

**Cuidados:** a cópia tem dados de clientes, contratos e o financeiro, sem criptografia. Ative a verificação em duas etapas na conta e não compartilhe a pasta `Backups`.

## 2. Desligar o cadastro público

No painel do Supabase, abra o projeto `FinancasAtelieThaiLago` e vá em **Authentication → Sign In / Providers**. Desative a opção **Allow new users to sign up** e salve.

Para dar acesso a alguém depois disso, use **Authentication → Users → Invite user** e aprove a conta em Configurações, no app.

## 3. Aplicar a migração no banco

O arquivo é `supabase/migrations/20261106132647_fechar_acesso_aprovados.sql`.

- Só contas `admin` e `member` passam a acessar os dados.
- Evento com lançamentos não pode mais ser excluído.
- Nenhum registro é alterado.
- A migração tem um autoteste: se ele falhar, tudo é desfeito.

Em emergência, `supabase/rollback/20261106132647_fechar_acesso_aprovados.sql` desfaz a mudança, mas reabre o problema de segurança.

## 4. Publicar o app

Publique a nova versão, que:

- mostra uma tela de bloqueio para contas pendentes ou negadas;
- remove o formulário de cadastro do login;
- explica quando a exclusão de um evento é bloqueada.

## 5. Remover a conta negada

Em **Authentication → Users**, localize a conta criada em 13/09/2026, que aparece como `denied` em Configurações no app. Ela não criou nenhum registro, então a remoção não apaga dados. Se você reconhecer a pessoa e quiser mantê-la negada, não precisa remover.

## 6. Conferir

- [ ] Entrar com a sua conta: Dashboard, Eventos e Financeiro mostram os dados normalmente.
- [ ] A segunda conta admin também entra e vê os dados.
- [ ] Tentar excluir um evento com lançamentos: aparece o aviso e nada é apagado.
- [ ] A tela de login não oferece mais "Solicitar Convite".
