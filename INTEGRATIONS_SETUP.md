# Bem Crescer — ativação de Gmail, calendário e teleconsulta

## Publicado no código

- Login por link Supabase; autorização de contas ligada aos perfis profissionais e responsáveis.
- Gmail da clínica: remetente autorizado `centro.bemcrescer@gmail.com`, sem necessidade de domínio próprio. A direção autoriza o envio através do Google; não é pedido acesso à caixa de entrada.
- Envio do sumário revisto mediante pedido explícito da terapeuta, com responsável autorizado e aviso à direção. Gmail e Resend são opções de serviço de email; um envio iniciado com um serviço não é repetido automaticamente pelo outro.
- Gmail regista a aceitação do envio pelo serviço. Não confirma entrega ao destinatário nem leitura. O acompanhamento de entrega por eventos assinados aplica-se apenas ao Resend.
- Preparação interna diária às 18:05 de Lisboa. Email à terapeuta requer serviço ativo, preferência Sim, acesso autorizado e primeiro login confirmado.
- Exportação ICS autenticada e limitada ao perfil; compatível com importação de calendários Google/Apple/Outlook. Importar novamente para obter alterações; não é subscrição automática.
- OAuth Google com PKCE, estado cifrado, verificação da conta Bem Crescer e tokens cifrados fora dos registos clínicos. A autorização do Gmail da clínica é separada da autorização de calendário de cada profissional.
- Criação/atualização/remoção de eventos no calendário principal e criação Meet para marcações Online, por ação explícita em Avisos e partilhas.
- Calendário Google mostra título genérico, sem nomes de crianças, contactos dos responsáveis ou notas clínicas. Não envia convites a participantes.
- Ligação Meet/Zoom/Teams/Whereby pode ser guardada manualmente numa marcação Online e aparece à família com acesso autorizado. A videochamada abre no serviço respetivo, não embutida na Bem Crescer.

## 1. Gmail da clínica para sumários e avisos

Criar/usar um projeto Google Cloud da clínica, ativar **Gmail API** e **Calendar API**, configurar o consentimento OAuth e criar um cliente Web. Registar exatamente a URI de retorno:

https://gest-o-clinica.as-lcorreia.workers.dev/api/integrations/google/callback

Adicionar `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` aos segredos do Worker `gest-o-clinica`. O mesmo cliente serve as duas autorizações, mas os tokens e permissões ficam separados. O remetente esperado é a configuração `GMAIL_SENDER_EMAIL=centro.bemcrescer@gmail.com`, já definida no código. Nenhum segredo pode ser publicado no GitHub nem enviado pelo chat.

A direção inicia sessão na Bem Crescer e escolhe **Avisos e partilhas > Ligar o Gmail da clínica**. Na autorização Google, selecionar especificamente `centro.bemcrescer@gmail.com`. A aplicação confirma que o email está verificado e corresponde ao remetente configurado antes de guardar a ligação. Uma conta diferente não ativa o envio.

Os pedidos de autorização são `openid`, `email` e `https://www.googleapis.com/auth/gmail.send`: identificação da conta e envio de mensagens. A aplicação não pede permissões para ler ou gerir a caixa de entrada. As terapeutas consultam o estado e enviam os sumários pelo fluxo autorizado da aplicação; não gerem a ligação Gmail da clínica.

O envio Gmail usa a conta da clínica com credenciais cifradas e guardadas apenas no servidor. **Aceite pelo Gmail não equivale a Entregue ou Lido.** Não há webhook de entrega Gmail configurado. Se um resultado de envio ficar desconhecido, confirmar no serviço antes de repetir para evitar duplicados.

A variável `CARE_TEAM_EMAIL_ENABLED=true` permite os avisos externos da véspera, mas só tem efeito com um serviço de email disponível. Cada terapeuta escolhe Sim em **Receber aviso da preparação por email**; só contas profissionais autorizadas que já entraram são elegíveis. O email contém uma ligação à preparação, sem conteúdo clínico. A autorização de Gmail não altera preferências individuais nem desencadeia o envio de sumários sem pedido.

O Google classifica `gmail.send` como permissão sensível. Aplicações externas em modo de teste têm limitações de utilizadores e, com estas permissões, a autorização expira após sete dias. Confirmar consentimento, eventuais requisitos de verificação e modo de publicação Google antes de uso diário. Enquanto faltarem as credenciais do cliente ou a autorização da conta, a aplicação mostra a ligação por configurar e não anuncia o serviço como ativo.

## 2. Emails de entrada: SMTP Supabase separado

Ligar o Gmail na Bem Crescer não configura o serviço Supabase Auth. Os links de entrada continuam a ser enviados pelo Supabase, que precisa de SMTP próprio para destinatários fora das restrições do serviço predefinido.

Configurar SMTP exclusivamente no projeto Supabase `Linguar` (`mwbtdncxfsixxlivwlzz`), mantendo o remetente e as URLs da aplicação corretos. **Não alterar o projeto Casa em Dia.** Se for usado Gmail SMTP, confirmar os requisitos e a forma de autenticação suportada pela conta nas instruções oficiais do Google. As palavras-passe de aplicação exigem verificação em duas etapas e podem não estar disponíveis em todas as contas. Uma eventual palavra-passe de aplicação deve ser criada e introduzida por um processo seguro, apenas no serviço de configuração; não se pede a palavra-passe da conta nem se envia a credencial pelo chat ou GitHub.

Confirmar a primeira entrada de uma terapeuta autorizada e de um responsável autorizado antes de considerar o login por email operacional. A aceitação de um envio de sumário pelo Gmail não valida os emails de autenticação.

## 3. Google Calendar e Meet de cada profissional

Usar o cliente Google configurado no passo 1. A ligação de calendário pede apenas `https://www.googleapis.com/auth/calendar.events.owned`. Cada profissional autoriza a sua conta em **Avisos e partilhas > Ligar a minha conta Google**. Não é preciso ligar o seu Gmail para enviar emails da clínica.

A sincronização é Bem Crescer → Google e ocorre quando o profissional escolhe **Atualizar no calendário Google**. A agenda clínica continua a ser a fonte das marcações. Alterações feitas no Google não são importadas. Alterações de data/hora/estado na Bem Crescer marcam o evento **Por atualizar**.

**Criar / atualizar ligação Meet** só se aplica a marcações Online ainda não concluídas. O Google pode demorar a preparar a sala: sincronizar novamente quando aparecer **A preparar ligação**. Disponibilidade Meet depende das permissões da conta Google. A ligação é visível à família através do seu painel autorizado.

Tokens guardados cifrados em `integration_connections`, acessível apenas ao servidor. Pode definir `INTEGRATIONS_ENCRYPTION_KEY` próprio no Worker; na ausência é derivada da credencial privada Supabase. Definir ou trocar a chave após ligação de contas exige voltar a ligá-las. Desligar uma conta remove a credencial local e tenta revogar no Google; não apaga eventos do calendário externo. As autorizações Google de Gmail e calendário são guardadas separadamente, mas a revogação no Google pode afetar outras permissões concedidas ao mesmo cliente pela mesma conta; verificar e voltar a ligar quando necessário.

## 4. Resend como opção de email

Resend não é necessário para o envio Gmail. Caso a clínica passe a ter um domínio próprio e queira usar Resend, validar esse domínio e configurar os segredos `RESEND_API_KEY` e `MAIL_FROM` no Worker. Um endereço Gmail pode receber emails e ser usado para entrar; não é um domínio remetente validável no Resend.

Para eventos de entrega Resend, criar um webhook para:

https://gest-o-clinica.as-lcorreia.workers.dev/api/integrations/email/webhook

Escolher `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.failed` e `email.complained`. Guardar o segredo de assinatura em `RESEND_WEBHOOK_SECRET`. O endpoint verifica assinaturas, deduplica eventos e regista estados Entregue/Devolvido/Falhou/Entrega atrasada/Queixa de spam sem publicar conteúdo do email nos avisos. Estes eventos não acompanham envios Gmail.

## 5. Validação e limites

Executar `pnpm test`, `pnpm typecheck` e `pnpm build`. Aplicar `supabase/integration-connections.sql` e catálogo atualizado antes da publicação. A tabela de tokens tem RLS e nenhuma permissão anon/authenticated; o browser nunca recebe tokens Google.

Validar primeiro as credenciais e autorizações externas. Depois testar login de conta autorizada, envio de um sumário fictício solicitado para destinatário autorizado, aviso interno à direção, preparação da véspera para terapeuta com preferência Sim e sincronização de uma marcação Online no calendário. Não usar dados clínicos reais nos testes de serviços externos.

Não há sincronização bidirecional, assinatura ICS pública, gravação de vídeo nem gravação/transcrição automática. Nenhum serviço de email ou OAuth é anunciado como ativo enquanto faltarem as respetivas credenciais e autorizações.

## Instruções oficiais

- [Permissões da Gmail API](https://developers.google.com/workspace/gmail/api/auth/scopes)
- [Limites de aplicações OAuth em teste](https://support.google.com/cloud/answer/15549945?hl=en)
- [Palavras-passe de aplicação Google](https://support.google.com/accounts/answer/185833)
- [SMTP no Supabase Auth](https://supabase.com/docs/guides/auth/auth-smtp)
