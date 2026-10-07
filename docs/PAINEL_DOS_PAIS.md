# Área dos pais — revisão de 7 de outubro de 2026

## Referência analisada

Foi lido `components/ParentDashboard.tsx` no repositório original `aslcorreia/Linguar-` (blob 405e020b178bb8f0ee852ab5f2fff666c4138da8). Era um protótipo React com dados fixos, dentro de uma moldura de telemóvel. Contactos, documentos, agenda e plano terapêutico estavam previstos; muitos botões não executavam operações reais. A implementação desta entrega mantém a finalidade clínica e usa a persistência e as permissões da subapp profissional.

| No original | Nesta implementação |
| --- | --- |
| Ficha da criança e terapeuta | Acompanhamento autorizado, identificação mínima e terapeuta responsável |
| Sessões futuras | Marcações reais com pedidos de confirmação, alteração ou ausência |
| Plano e notas da terapeuta | Versões revistas e publicadas de planos, objetivos, medições e sumários |
| Documentos e contacto | Anexos selecionados explicitamente, mensagens persistentes e pedidos respondidos pela clínica |
| Notificações | Conteúdos por ler e confirmação de leitura; avisos internos à clínica/terapeuta |
| Perfil | Conta autenticada e responsável registado; pedidos de atualização por mensagem |
| Missões, jogar agora, mundos, XP, níveis, estrelas, streaks, conquistas, prémios, avatares desbloqueáveis, gráficos de atividade de jogo | Excluídos do painel e da resposta da API dos pais |
| Subscrição Familiar e contadores de uso do jogo | Excluídos; não representam pagamentos clínicos |
| Valores fixos de desempenho e evolução | Excluídos; só informação clínica revista e partilhada |

## Percursos ligados

- `/pais`: portal autenticado. Uma família com vários acompanhamentos autorizados pode alternar entre eles.
- `/pais?demo=1`: demonstração explicitamente fictícia, sem gravação.
- Clínica / terapeuta → **Área dos pais**, também disponível na ficha do paciente.
- Direção: confirmar email e autorização na ficha, ativar/revogar acesso. O email fica ligado ao paciente e à clínica. A autorização é verificada novamente em cada acesso; mudar email, retirar autorização, arquivar paciente ou revogar o acesso bloqueia os dados.
- Terapeuta: escolher sumário concluído / plano aprovado / relatório / documento, rever texto e anexo, publicar. Pode também escrever orientações. A publicação guarda uma versão imutável e o destinatário; alterações nos registos clínicos não modificam retroativamente a versão partilhada. Pode retirar uma publicação.
- O diálogo de partilha do sumário inclui **Publicar no painel dos pais**, além dos canais de email já existentes. Publicar no painel é uma ação explícita distinta de preparar/enviar email.
- Família: ler conteúdos, confirmar leitura, descarregar anexos publicados, enviar mensagens e pedidos sobre sessões. A clínica é informada por avisos persistentes.
- Equipa: responder a mensagens e pedidos. Responder a um pedido de mudança não altera a marcação automaticamente: existe botão para abrir a marcação e tratar o ajuste antes da resposta.
- Mensagens recebidas dos pais entram na preparação da sessão seguinte, juntamente com a informação da família já existente.

## Autorização e persistência

Nova migração aditiva `drizzle/0001_loving_nicolaos.sql` cria `family_access`. Registos `familyPublication`, `familyMessage`, `familyRequest` e `familyRead` ficam na tabela `records`, com clínica, paciente, autoria e auditoria.

`/api/parents` devolve uma projeção explícita e mínima, nunca os registos clínicos completos. Não inclui notas internas, diagnóstico, hipóteses clínicas, dados de outros pacientes, faturação interna, ficheiros não publicados nem dados dos jogos. Só o conteúdo revisto de uma publicação e o seu anexo explicitamente selecionado são partilhados. `/api/files` continua reservado à equipa; o download dos pais revalida publicação, destinatário, autorização, paciente e clínica.

`/api/family` gere publicação, acessos e respostas profissionais. As contas dos pais não conseguem usar as APIs profissionais. A revogação mantém a identidade como conta de família, impedindo a promoção involuntária para direção. Não se envia convite nem email ao ativar o registo local de acesso.

## Ativação para famílias reais

O Site permanece privado, com a audiência anterior. Além da autorização dentro da aplicação, cada responsável precisa de acesso ao Site nas suas definições de partilha e de iniciar sessão com o email autorizado. Não foram convidados responsáveis, importados dados clínicos nem enviados emails nesta entrega.

Esta primeira implementação usa o único email de responsável já existente em cada ficha. A mesma conta pode ter vários pacientes e clínicas, mas o acesso simultâneo de vários responsáveis com emails diferentes ao mesmo paciente requer ampliar o modelo de responsáveis e autorizações. Não há integração com o painel da criança, jogos ou teleconsulta.

Os avisos são internos. Email automático, notificações push e execução da preparação com a aplicação fechada continuam dependentes das integrações descritas em IMPLEMENTACAO.md. Não foram ligadas subscrições de jogo nem cobrança clínica. Não se fazem alterações clínicas autónomas com base nas mensagens dos pais.

## Verificação

`tests/family.test.mjs` executa as rotas reais de família e de pais e os auxiliares reais de autorização sobre SQLite com adaptador D1 e identidade simulada. Verifica: destinatário/autorização, sessão não concluída, origem desatualizada, anexos de outro paciente, rejeição de publicação duplicada, omissão de dados privados, bloqueio das APIs profissionais, pedidos sem alteração automática de agenda, ligação das mensagens à preparação, confirmação de leitura, retirada de publicação, revogação e mudança de email. Testes anteriores continuam a validar os fluxos profissionais.

Não equivale a ensaio ponta a ponta com contas reais de pais, D1/R2 de produção ou emails reais. O programador deve repetir esses percursos com contas de teste autorizadas antes de abrir o acesso às famílias.
