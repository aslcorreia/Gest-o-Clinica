# Implementação atual

Esta revisão porta a aplicação clínica para Supabase + Cloudflare. Estado atual, comandos, segredos necessários e verificações: `../README.md` e `../MIGRATION_STATUS.md`.

Preserva o modelo clínico: planos com objetivos e critérios, propostas aprovadas pela direção, sumários concluídos imutáveis com adendas, observações por objetivo, preparação da próxima sessão, ponto, responsáveis e acessos por criança.

As operações SQLite/D1 foram compiladas para um catálogo de operações PostgreSQL autorizadas no servidor. Um pedido ao RPC `linguar_batch` corresponde a uma transação; falhas não deixam alterações parciais. Um bloqueio transacional serializa alterações desta aplicação, adequado ao uso inicial de uma clínica; deverá ser revisto se crescer para muitas clínicas independentes.

Tabelas com RLS e políticas exclusivamente para `service_role`; anon/authenticated sem permissões diretas. Cada API verifica a identidade e aplica filtros de terapeuta ou família. A chave secreta só pertence ao Worker. Ficheiros passam pelas APIs clínicas e pelo Storage privado.

Não houve importação da base anterior. A primeira entrada cria a clínica vazia e o perfil da proprietária. Os dados reais são registados pela aplicação depois de publicar e validar os acessos.
