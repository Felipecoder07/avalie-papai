# Análise do SonarCloud — 10/09/2026

Consulta realizada diretamente pela API pública do SonarCloud, sem autenticação. Foram consultados os projetos, análises, alertas não resolvidos (com paginação), hotspots, métricas e Quality Gates. Nenhuma configuração remota foi alterada e nenhuma nova análise foi executada.

## Projeto correspondente ao código atual

O `sonar-project.properties` aponta para **Felipecoder07_avalie-papai**. Sua última análise, em **09/09/2026 às 15:36:32 (Brasília)**, corresponde ao commit `5465bbe62b50fe44f5fd85c2ab450f13cae01b46`, também presente no HEAD local. Não havia alterações locais rastreadas durante a consulta.

[Painel atual](https://sonarcloud.io/dashboard?id=Felipecoder07_avalie-papai)

| Indicador | Resultado |
| --- | ---: |
| Vulnerabilidades abertas | 0 |
| Bugs abertos | 0 |
| Security hotspots | 0 |
| Code smells abertos | 584 |
| Segurança / confiabilidade / manutenibilidade | A / A / A |
| Duplicação geral | 1,1% |
| Duplicação em código novo | 6,7% |
| Quality Gate | Reprovado por duplicação em código novo |

O limite de duplicação em código novo é 3%. As demais condições do Quality Gate passaram. A API não retornou valor de cobertura para a consulta realizada; isso não permite atribuir uma porcentagem de cobertura.

## Duplicação que afeta o Quality Gate

| Arquivo | Linhas novas duplicadas |
| --- | ---: |
| `frontend/src/App.tsx` | 10 |
| `frontend/src/components/AdminSidebar.tsx` | 4 |
| `frontend/src/components/Sidebar.tsx` | 4 |

As barras laterais possuem marca, navegação e apresentação semelhantes, confirmadas por leitura local. Extrair componentes compartilhados e revisar a lógica repetida em App.tsx são os próximos passos para reduzir duplicação. Uma análise posterior do SonarCloud deve confirmar o efeito sobre o Gate.

## Alertas restantes

Todos os 584 alertas abertos são classificados como CODE_SMELL: 19 CRITICAL, 250 MAJOR, 314 MINOR e 1 INFO. Os 19 críticos são da regra S3776, complexidade cognitiva (8 JavaScript e 11 TypeScript); não são classificados como vulnerabilidades.

Exemplos prioritários de complexidade:

- `frontend/src/screens/admin/AdminAssinatura.tsx:324`: complexidade 71; limite 15.
- `frontend/src/screens/admin/AdminAssinatura.tsx:114`: complexidade 27; limite 15.
- `backend/src/controllers/publicController.js:479`: complexidade 24; limite 15.

Arquivos com maior concentração de alertas: publicController.js (53), AdminReservas.tsx (44), AdminConfiguracoes.tsx (40), saasController.js (37) e AdminAssinatura.tsx (29).

As regras mais frequentes incluem ternários aninhados (typescript:S3358, 83), optional chaining (javascript:S6582, 63) e métodos estáticos de Number (javascript:S7773, 52; typescript:S7773, 38).

## Problema funcional encontrado na revisão local

**Prioridade alta: leitura incompatível dos dados de sessão.**

`frontend/src/utils/safeStorage.ts:9` salva valores usando `encodeURIComponent`. Há gravações de `courtmanager_user` por esse helper em `frontend/src/App.tsx`, mas os seguintes leitores usam localStorage diretamente e aplicam JSON.parse sem decodificar:

- `frontend/src/components/AdminSidebar.tsx:25`: JSON.parse sem tratamento de erro pode interromper a renderização quando o usuário foi salvo pelo helper.
- `frontend/src/App.tsx:337`: RoleRoute captura o erro de JSON.parse e mantém hasAccess como false, redirecionando mesmo um usuário com perfil permitido.

Validação: uma reprodução isolada em Node, com um usuário fictício, confirmou que `JSON.parse(encodeURIComponent(JSON.stringify(usuario)))` lança SyntaxError e que a leitura com decodeURIComponent funciona. O fluxo completo no navegador não foi executado nesta análise.

A correção deve padronizar a leitura e escrita da sessão, mantendo compatibilidade com dados já persistidos. Codificação URI por si só não valida o conteúdo do usuário nem substitui autorização no servidor.

## Projeto antigo e relatórios locais

[Painel Arenix](https://sonarcloud.io/dashboard?id=Felipecoder07_Arenix)

O projeto **Felipecoder07_Arenix** tem última análise em **04/09/2026 às 00:19:59 (Brasília)**, no commit `b3f0f89d7a19af9e817bda6bb806822b4502ced2`. Ele contém 30 vulnerabilidades, 42 bugs e 607 code smells abertos. Esses números pertencem a uma revisão anterior e não descrevem o HEAD atual.

`scripts/fetch_sonar_issues.js` ainda consulta Arenix. Os scripts de resumo e geração de relatório também usam essa chave. Além disso, a consulta antiga inclui alertas resolvidos: o JSON local tem 757 registros e 34 entradas do tipo VULNERABILITY, das quais 4 estão fechadas. Por isso, o relatório local pode apresentar números maiores e desatualizados.

## Ordem sugerida para o próximo trabalho

1. Corrigir a incompatibilidade na sessão e verificar login, menu administrativo e permissões de rotas.
2. Reduzir a duplicação nos três arquivos apontados pelo SonarCloud.
3. Unificar a chave de projeto usada pelos scripts de relatório e contabilizar separadamente alertas abertos e resolvidos.
4. Refatorar as funções mais complexas em alterações pequenas, com validação dos respectivos fluxos.

Esta consulta não alterou código de aplicação. Zero vulnerabilidades no scanner descreve o resultado da análise estática; o problema funcional identificado acima mostra a necessidade de conferir também o comportamento do sistema.

## Correções locais após a consulta

Nesta primeira rodada foram corrigidas a sessão e as repetições apontadas pelo Quality Gate do avalie-papai:

- Criado `frontend/src/utils/session.ts` para ler usuários salvos tanto em JSON antigo quanto no formato codificado. Dados inválidos retornam uma sessão ausente, preservando a renderização e impedindo a concessão de permissões por fallback.
- Padronizados os consumidores da sessão no menu administrativo, permissões de rotas, portal do cliente e edição do próprio usuário. Cadastro e dados da arena na barra superior usam o mesmo helper de armazenamento.
- Extraída a validação repetida de Master e Cliente para `SessionGuard.tsx`, mantendo consulta a `/api/auth/me`, validação de perfil, logout de sessões inválidas e redirecionamentos. A troca de perfil reinicia a validação; respostas após desmontagem não alteram a sessão.
- Extraída a estrutura repetida dos menus para `SidebarShell.tsx`, preservando rotas, filtros por perfil, larguras e identidades dos painéis. O controle de expansão usa um botão nativo, operável por teclado.
- Adicionado `npm run test:frontend` na raiz e incluída a suíte do frontend no comando geral de testes. As novas dependências são ferramentas de desenvolvimento/teste; versões de dependências de produção existentes não foram alteradas.

Validação: **50 testes de regressão passaram**, incluindo sessões antigas/codificadas/corrompidas, autorização por perfil, login remoto validado no servidor, troca entre Cliente e Master, respostas tardias, logout, menus por perfil, teclado, nome da arena e renderização do portal. TypeScript, lint dos arquivos novos e build de produção passaram. O build informou avisos de tamanho de bundle e base Browserslist desatualizada. Os testes de interface usam jsdom; não houve teste manual em navegador com contas reais.

Os blocos duplicados originais de App.tsx foram conferidos pela API de duplicações exclusivamente no avalie-papai. Nenhuma nova análise foi enviada ao SonarCloud, portanto a nova porcentagem e a aprovação do Quality Gate ainda dependem da execução do scanner sobre estas alterações. Os demais alertas de manutenção permanecem para lotes posteriores; não se deve interpretar esta rodada como a correção dos 584 alertas.
