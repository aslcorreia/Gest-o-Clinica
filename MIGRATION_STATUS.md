# Versão independente — Supabase e Cloudflare

## Concluído

- Supabase Linguar ativo, Frankfurt, com clínicas, profissionais, registos, auditoria e acessos das famílias.
- Armazenamento de documentos privado, limite de 10 MB.
- Login próprio por link/código e palavra-passe de contas existentes; cookies HTTPOnly, Secure e SameSite Lax.
- Utilizador verificado no serviço de autenticação e sessão ativa verificada na base em cada acesso autenticado.
- Direção limitada ao email configurado; terapeutas ligados aos seus perfis; pais ligados a consentimentos por criança.
- Gravações em transações PostgreSQL reais, com versões, dependências e proteção de concorrência.
- Apenas operações SQL registadas no servidor; RPC e tabelas inacessíveis pelos papéis anon/authenticated.
- Build para Cloudflare, com código na raiz de `aslcorreia/Gest-o-Clinica`, branch `main`.

## Verificado

TypeScript e build de produção passaram. Suites de regras e integração passaram para clínica, terapeutas, responsáveis, irmãos, consentimentos, sessões, planos, ponto e autenticação. Todas as instruções do catálogo foram analisadas pelo PostgreSQL real. As verificações de transações passaram no projeto Supabase e reverteram os dados fictícios. A última auditoria não encontrou avisos de exposição das tabelas; mantém-se o aviso de proteção de palavras-passe comprometidas desativada.

## Publicação e utilização

- Publicado em https://gest-o-clinica.as-lcorreia.workers.dev, com o nome Bem Crescer.
- Branch `main` ligada à Cloudflare; entrada real da direção confirmada.
- Dados existentes preservados no Supabase; importações clínicas não são incluídas no repositório.
- Correções operacionais devem passar os testes de regressão e a compilação. O catálogo SQL atualizado deve ser instalado antes de publicar código que utilize novas consultas.

## Por validar / completar

1. Completar emails profissionais e ativar os acessos individuais.
2. Completar responsáveis e autorizações reais por criança; ativar o painel dos pais.
3. Confirmar SMTP e remetente de email; testar partilha com destinatário autorizado.
4. Rever os objetivos documentados, criar/aprovar os planos terapêuticos e preencher a agenda real.
5. Verificar a primeira execução do agendamento diário e a reposição de cópias de segurança.
6. Integrar teleconsulta por vídeo, séries recorrentes e faturação/cobranças quando forem definidos os serviços necessários.

Não alterar cookies, identificadores internos ou permissões para mudar a marca. A versão anterior do Site continua separada.
