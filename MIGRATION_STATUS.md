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

TypeScript e build de produção passaram. Suites de regras e integração passaram para clínica, terapeutas, responsáveis, irmãos, consentimentos, sessões, planos, ponto e autenticação. Todas as instruções do catálogo foram analisadas pelo PostgreSQL real. As verificações de transações passaram no projeto Supabase e reverteram os dados fictícios. O verificador de segurança devolveu zero avisos após aplicação das políticas de servidor.

## Por executar

1. Ligar a branch `main` ao Worker `gest-o-clinica` na Cloudflare.
2. Instalar `SUPABASE_SECRET_KEY` como segredo do Worker, obtido do projeto Linguar.
3. Definir os URLs reais de entrada no Supabase Auth.
4. Testar login real da direção, SMTP para equipa/famílias, upload e publicação seletiva de um sumário.

Não existe URL publicada da versão independente. A versão anterior do Site continua separada e não recebeu esta migração. Não foram transferidos pacientes entre projetos.
