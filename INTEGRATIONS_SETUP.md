# Bem Crescer — ativação de emails, calendário e teleconsulta

## Publicado no código

- Login por link Supabase; autorização de contas ligada aos perfis profissionais e responsáveis.
- Envio Resend do sumário revisto, pedido explícito da terapeuta e aviso à direção.
- Endpoint de eventos Resend assinados, deduplicação e estados Entregue/Devolvido/Falhou/Entrega atrasada/Queixa de spam, sem publicar conteúdo do email nos avisos.
- Preparação interna diária às 18:05 de Lisboa. Email à terapeuta requer serviço ativo, preferência Sim, acesso autorizado e primeiro login confirmado.
- Exportação ICS autenticada e limitada ao perfil; compatível com importação de calendários Google/Apple/Outlook. Importar novamente para obter alterações; não é subscrição automática.
- OAuth Google individual com PKCE, estado cifrado, verificação da conta Bem Crescer e tokens cifrados fora dos registos clínicos.
- Criação/atualização/remoção de eventos no calendário principal e criação Meet para marcações Online, por ação explícita nos Avisos e partilhas.
- Calendário Google mostra título genérico, sem nomes de crianças, contactos dos responsáveis ou notas clínicas. Não envia convites a participantes.
- Ligação Meet/Zoom/Teams/Whereby pode ser guardada manualmente numa marcação Online e aparece à família com acesso autorizado. A videochamada abre no serviço respetivo, não embutida na Bem Crescer.

## 1. Serviço de email

Validar um domínio pertencente à clínica no Resend. Um Gmail pode receber emails e ser usado para entrar; não pode ser o domínio remetente Resend.

No Worker gest-o-clinica, configurar segredos RESEND_API_KEY e MAIL_FROM. Para eventos de entrega, criar no Resend um webhook para:

https://gest-o-clinica.as-lcorreia.workers.dev/api/integrations/email/webhook

Escolher email.sent, email.delivered, email.delivery_delayed, email.bounced, email.failed e email.complained. Guardar o segredo de assinatura em RESEND_WEBHOOK_SECRET. Nenhum destes segredos pode ser publicado no GitHub.

Para emails de entrada, configurar SMTP no Supabase Linguar, separado dos segredos do Worker. Com Resend, obter host/porta/utilizador e credencial nas instruções oficiais de SMTP. Confirmar remetente do domínio validado e URLs já existentes da aplicação. Não alterar a configuração do projeto Casa em Dia.

A variável CARE_TEAM_EMAIL_ENABLED deve ser true para ativar os avisos externos da véspera. Cada terapeuta escolhe Sim em Receber aviso da preparação por email; só contas profissionais autorizadas que já entraram são elegíveis. O email contém uma ligação à preparação, sem conteúdo clínico.

Testar entrada de uma terapeuta autorizada; depois envio de um sumário fictício a destinatário autorizado e confirmação de entrega. Envio Aceite pelo serviço não equivale a Entregue. Resultados desconhecidos sem providerId requerem conferência no serviço antes de reenviar.

## 2. Google Calendar e Meet

Criar/usar um projeto Google Cloud da clínica, ativar Calendar API, configurar o consentimento OAuth e criar cliente Web. Registar exatamente a URI de retorno:

https://gest-o-clinica.as-lcorreia.workers.dev/api/integrations/google/callback

Adicionar GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET aos segredos do Worker. A aplicação pede apenas calendar.events.owned. Cada profissional autoriza a sua conta em Avisos e partilhas > Ligar a minha conta Google. Aplicações em teste podem ter restrições e expiração de refresh tokens; validar o modo de publicação Google antes de uso diário.

A sincronização é Bem Crescer → Google e ocorre quando o profissional escolhe Atualizar no calendário Google. A agenda clínica continua a ser a fonte das marcações. Alterações feitas no Google não são importadas. Alterações de data/hora/estado na Bem Crescer marcam o evento Por atualizar.

Criar / atualizar ligação Meet só se aplica a marcações Online ainda não concluídas. O Google pode demorar a preparar a sala: sincronizar novamente quando aparecer A preparar ligação. Disponibilidade Meet depende das permissões da conta Google. A ligação é visível à família através do seu painel autorizado.

Tokens guardados cifrados em integration_connections, acessível apenas ao servidor. Pode definir INTEGRATIONS_ENCRYPTION_KEY próprio no Worker; na ausência é derivada da credencial privada Supabase. Definir ou trocar a chave após ligação de contas exige voltar a ligá-las. Desligar conta remove a credencial local e tenta revogar no Google; não apaga eventos do calendário externo.

## 3. Validação e limites

Executar pnpm test, pnpm typecheck e pnpm build. Aplicar supabase/integration-connections.sql e catálogo atualizado antes da publicação. A tabela de tokens tem RLS e nenhuma permissão anon/authenticated; o browser nunca recebe tokens Google.

Não há sincronização bidirecional, assinatura ICS pública, gravação de vídeo nem gravação/transcrição automática. Estas funcionalidades não foram ativadas. Nenhum serviço de email ou OAuth é anunciado como ativo enquanto faltarem as respetivas credenciais e autorizações.
