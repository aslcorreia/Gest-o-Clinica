# Bem Crescer

Aplicação independente para direção clínica, terapeutas e famílias. Crianças e responsáveis, agenda, check-in, planos e objetivos, sumários de sessões, preparação da sessão seguinte, documentos privados e partilha seletiva com os pais. Sem integração com o jogo Linguar ou Cidade dos Sons.

## Estado

O projeto Supabase `Linguar` (`mwbtdncxfsixxlivwlzz`, Frankfurt) tem as tabelas, permissões, operações transacionais e armazenamento privado instalados e verificados. O código usa Supabase Auth, PostgreSQL e Storage. A aplicação está publicada em https://gest-o-clinica.as-lcorreia.workers.dev e a direção já iniciou sessão. Os acessos individuais da equipa e das famílias dependem de emails associados, responsáveis e autorizações registadas.

## Publicar na Cloudflare

Criar um Worker ligado ao GitHub:

| Campo | Valor |
| --- | --- |
| Nome do Worker | `gest-o-clinica` |
| Repositório | `aslcorreia/Gest-o-Clinica` |
| Branch | `main` |
| Diretório raiz | `/` (raiz do repositório) |
| Build | `pnpm run build` |
| Deploy | `npx wrangler deploy --config dist/server/wrangler.json` |
| Node | 24.19.0, versão validada localmente |

A configuração pública do Supabase está em `wrangler.jsonc`. Adicionar **no Worker, Settings → Variables and Secrets**, o segredo `SUPABASE_SECRET_KEY` do projeto Linguar. Não usar a chave da Casa em Dia nem colocar a chave secreta no GitHub ou num campo público.

O endereço escolhido na Cloudflare é `https://gest-o-clinica.as-lcorreia.workers.dev`. Em Supabase **Authentication → URL Configuration**:

- Site URL: `https://gest-o-clinica.as-lcorreia.workers.dev`.
- Redirect URLs: `https://gest-o-clinica.as-lcorreia.workers.dev/auth/confirm`.

A entrada usa o link enviado pelo Supabase. Não exige alterar o modelo de email. O campo de código funciona se o email incluir um código. A entrada por palavra-passe destina-se a contas que já tenham uma palavra-passe no Supabase.

Para enviar links a terapeutas e famílias que não sejam membros da organização Supabase, configurar SMTP próprio. O serviço de email predefinido tem restrições de destinatários. Sumários no painel dos pais funcionam através de publicações revistas; email externo dos sumários depende separadamente de `RESEND_API_KEY` e `MAIL_FROM`.

## Primeira utilização

Entrar com `as.lcorreia@gmail.com`. A primeira entrada cria a clínica e o perfil da direção, sem crianças fictícias. Adicionar a terapeuta com email próprio, definir o horário, criar a criança e responsáveis, criar o plano e agendar a sessão. A terapeuta regista o sumário e as observações dos objetivos. A direção aprova revisões dos planos.

Na ficha da criança, registar os responsáveis e autorizações. A direção ativa cada email em Área dos pais. Cada responsável vê apenas as publicações e marcações dos acompanhamentos autorizados. `afonsobm@gmail.com` só tem acesso depois desta associação explícita a uma criança.

## Desenvolvimento e verificação

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm run typecheck
pnpm run build
pnpm run dev
```

Para desenvolvimento com a base real, definir `SUPABASE_SECRET_KEY` num ficheiro local `.dev.vars`, ignorado pelo Git. Não há identidade simulada no backend.

`scripts/generate-query-catalog.mjs` regista apenas instruções SQL do servidor presentes no código. `supabase/clinic-schema.sql` e `supabase/query-catalog.sql` reproduzem a instalação num projeto vazio. O schema já foi instalado no projeto acima: não o repetir sobre as tabelas existentes. Alterações futuras ao catálogo devem ser instaladas no Supabase antes de publicar o novo código.

`supabase/verify-transactions.sql` verifica sessões, versões desatualizadas, revisões dos planos, revogação e rollback, com dados fictícios revertidos no final. O diretório `drizzle` serve apenas as fixtures SQLite dos testes de regras; não é o schema de produção.

## Limites atuais

Falta validar a primeira entrada das terapeutas e famílias, SMTP, email externo dos sumários e reposição de cópias de segurança. A preparação atualiza-se enquanto a aplicação está aberta. O Worker inclui preparação diária às 18:05 de Lisboa, com ajuste de verão/inverno, deduplicação e estado de execução em Avisos e partilhas. A primeira execução automática em produção ainda deve ser confirmada. O email à equipa exige `CARE_TEAM_EMAIL_ENABLED=true`, serviço configurado, preferência explícita e primeiro acesso profissional confirmado; está desativado por defeito. Teleconsulta abre uma ligação Meet/Zoom/Teams/Whereby; criação de Meet e calendário Google requerem ativação OAuth. Emissão fiscal não está integrada. Não foram importados pacientes da versão alojada no ChatGPT.

Referências: [Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/), [Supabase login por email](https://supabase.com/docs/guides/auth/auth-email-passwordless), [SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## Emails, calendário e teleconsulta

A configuração e os limites da ligação estão em [INTEGRATIONS_SETUP.md](INTEGRATIONS_SETUP.md). A exportação ICS pode ser usada com uma conta profissional autenticada. A ligação Google e os envios externos requerem as contas e credenciais aí indicadas.
