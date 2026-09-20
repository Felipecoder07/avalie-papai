# Verificação do plano de segurança — 20/09/2026

**Resultado: reprovado para encerramento do plano. Há defeitos locais reproduzidos, além das pendências de produção.**

Revisão do working tree sobre `0ac244da1a581f2cc591f5af2c5766c3c4c65434`, com alterações anteriores não commitadas. Foram lidos o plano, código, testes e scripts; executados testes, TypeScript, lint, builds e `npm audit`; e reproduzidos os defeitos abaixo com SQLite exclusivamente em memória e respostas fictícias de pagamento. Não houve correção de código funcional, migração no banco real, pagamento real ou publicação.

Este registro substitui, para o estado atual, a suposição de que todos os `[x]` do plano estão comprovados. O checklist original foi preservado. Aprovação de um teste significa cobertura daquele cenário, não aprovação de todos os requisitos de um módulo.

## Resultado por módulo

| Módulo | Avaliação | Evidência e pendências |
| --- | --- | --- |
| 0 — Base de validação | Base funcional; cobertura incompleta | SQLite isolado, montagem em `app.js`, atores e regressões existem. Testes de segurança passaram na execução geral; os dois testes de navegador passaram novamente na repetição focada. Há defeitos financeiros que as assertivas atuais não detectam. |
| 1 — Acessos críticos | Controles revisados aprovados nos cenários existentes | Política com negação por padrão, hierarquia, transferência reautenticada, revogação, proteção de segredos e negação de operações de Cliente estão implementadas e cobertas pelas suítes aprovadas. Não foi reproduzido novo bypass dessas permissões nesta rodada. |
| 2 — Identidade e revogação | Parcial; não encerrar | Cookies/CSRF, revogação, Google validado, recuperação e MFA têm regressões aprovadas. A migração SQL 001 destrói o estado de ativação e muda a unicidade de e-mail sem adequar os logins. Google real e rollout continuam pendentes. |
| 3 — Clientes e checkout | Parcial; fluxo incompleto | Isolamento, propriedade, slug, validação de horários e transações têm cobertura. A interface exige login, apesar de o backend admitir visitante. Vínculos legados ficam bloqueados, sem fluxo implementado de verificação/reconciliação. Polling de pagamento tem erro monetário. |
| 4 — Financeiro | Reprovado | Cobranças com valores incorretos, intenção em unidade errada, validação incompleta do provedor, confirmação indevida de webhook com falha transitória e job de reconciliação quebrado. |
| 5 — Arquivos, navegador e limites | Parcial; não encerrar | Upload raster, bloqueio de HTML, XSS e CSRF têm cobertura. Persistem QR externo, interpolação sem escape em e-mail e limites incompletos. Configuração publicada não foi homologada. |
| 6 — Dependências e migração | Reprovado | Alertas de dependências das interfaces; migrações e relatório de conciliação com defeitos reproduzidos; backfill não idempotente. Restauração e migração de snapshot anonimizado não foram comprovadas. |
| 7 — Homologação e publicação | Pendente, com bloqueios locais | Build e lint do painel reprovados; teste de backend ainda falha por texto esperado. E2E existentes passaram nas repetições, mas não cobrem todos os fluxos exigidos. Produção/provedores reais não avaliados. |

## Defeitos reproduzidos

As saídas exatas estão em [probes JSON](../artifacts/homologacao/security-review-2026-09-20-probes.json). O [script de reprodução](../artifacts/homologacao/security-review-2026-09-20.cjs) usa somente fixtures e memória. Seu término sem erro significa que as reproduções executaram; não significa aprovação de segurança.

1. **Alta — cobrança SaaS cem vezes maior após conversão para centavos.** Em `backend/src/services/saasBillingService.js:134`, uma fatura com `valor=10000` (R$ 100 na unidade proposta pelo plano) gera `transaction_amount=10000` (R$ 10.000). A conferência em `:218` também converte novamente o valor da fatura, mantendo a inconsistência. Resultado `SAAS_UNITS`.

2. **Alta — Pix administrativo cem vezes menor quando a interface informa reais.** `frontend/src/screens/admin/AdminPagamentos.tsx:391` envia o valor digitado em reais; `backend/src/routes/gatewayRoutes.js:41` o repassa sem converter, enquanto `gatewayService.js:82` divide por 100. POST autenticado com `valor=100` produziu cobrança de R$ 1. Resultado `ADMIN_PIX`. Conferir conjuntamente Pix, cartão, maquineta, saldo e contratos de entrada, sem aplicar multiplicações indiscriminadas.

3. **Alta — Pix estático no serviço de gateway cem vezes maior.** `backend/src/services/gatewayService.js:42` passa centavos para `gerarPixEMV`, que formata reais. POST autenticado de cobrança Pix sem valor customizado, para reserva de R$ 100 e arena sem token de gateway, retornou campo 54 do QR igual a `10000.00`. Resultados `STATIC_PIX` e `STATIC_PIX_HTTP`. O checkout público inicial tem caminho próprio que já divide por 100; não se deve atribuir esse defeito a todo QR do sistema.

4. **Alta — intenção de pagamento registra unidade incorreta.** `backend/src/services/paymentIntentService.js:6` aplica `cents()` sobre valor já em centavos. Cobrança enviada corretamente por R$ 100 criou `amount_cents=1000000`, em vez de `10000`. O cálculo de saldo em `:24` repete a escala errada. Resultado `INTENT_UNITS`.

5. **Alta — webhook de reservas não valida integralmente o pagamento consultado.** `backend/src/routes/gatewayRoutes.js:229` aceita `approved` e valor, sem conferir moeda, ID retornado, conta recebedora e vínculo com a intenção. Uma notificação assinada cuja consulta fictícia retornou `currency_id=USD` gerou HTTP 200 e crédito de 10000 centavos. Resultado `WRONG_CURRENCY`. O ensaio demonstra a ausência da validação local; não demonstra que um atacante consiga forjar a assinatura do provedor.

6. **Alta — webhook confirma recebimento após erro transitório sem recuperação persistida.** Na mesma função, uma consulta com HTTP 503 apenas deixa de entrar no `if (mpRes.ok)`; a rota termina com HTTP 200 em `:256`. Resultado `PROVIDER_503`. Esse achado é da rota de reservas; o webhook SaaS possui tratamento distinto.

7. **Alta — reconciliação não processa os eventos.** `backend/src/jobs/reconciliacaoOutbox.js:15` consulta `tenant_id`, `reserva_id`, `evento`, `criado_em` e `processado`, mas `backend/src/config/securitySchema.js:21` cria `kind`, `payload`, `sent` e `created`. A consulta falha com `SQLITE_ERROR: no such column: tenant_id`; um evento inserido permaneceu `sent=0` após executar o job. Resultados `OUTBOX_SCHEMA` e `OUTBOX_AFTER_JOB`. Mesmo corrigindo os nomes, o job atual apenas produz auditoria: não implementa consulta periódica ao provedor para resolver intenções/estornos pendentes ou ambíguos.

8. **Alta — polling não reconhece um pagamento válido.** `backend/src/controllers/publicController.js:437` passa reais para a liquidação que compara centavos. Consulta autenticada do proprietário com provedor retornando R$ 100 aprovado manteve uma reserva de 10000 centavos como `Pendente`, sem crédito. Resultado `PUBLIC_POLLING`. Webhook bem-sucedido pode mascarar o problema; o polling não recupera corretamente a ausência desse webhook.

9. **Alta — migração 001 perde bloqueio de ativação.** `backend/src/config/migrations/001_security_schema.sql:62` não copia `activation_pending`; a tabela nova usa default zero. Conta com flag 1 terminou com flag 0. Resultado `MIGRATION_ACTIVATION`. Isso remove o requisito de ativação, embora não revele por si só a senha aleatória da conta.

10. **Alta — migração cria identidade ambígua no login.** O índice em `001_security_schema.sql:68` permite o mesmo e-mail em tenants diferentes; `authController.js` e `athleteAuthController.js` continuam buscando uma única conta globalmente por e-mail, sem desambiguação. Após a migração foi possível inserir duas contas com o mesmo e-mail. Resultado `MIGRATION_EMAIL`. A migração precisa preservar o contrato de conta universal ou mudar todos os consumidores de forma consistente.

11. **Alta — migração monetária ignora preço por modalidade.** `002_finance_cents.sql:5` converte `Quadras.preco_base`, mas não o JSON `modalidades`. Uma quadra de R$ 100 ficou com base 10000 e modalidade 100, que o cálculo de reserva interpreta como R$ 1. Resultado `MIGRATION_MODALITY`. Há ainda duas trilhas de inicialização (`init_db`/`SecurityMigrations` e `_Migrations`): os testes usuais não executam as duas migrações SQL sobre o banco inicializado. As fixtures já inserem reservas em centavos, enquanto alguns defaults SaaS de `init_db` continuam em reais. A unidade por coluna deve ser documentada e conferida em banco novo e legado antes da conversão.

12. **Alta — relatório pode omitir pagamentos a maior.** `backend/scripts/report_inconsistencies.js:41` soma o valor das reservas após o JOIN com pagamentos, duplicando a obrigação quando uma reserva tem vários pagamentos. Grupo que custava 20000 centavos e recebeu 24000 retornou lista vazia de divergências. Resultado `REPORT_OVERPAYMENT`. O array `segredos_padrao` também é inicializado, mas nunca preenchido por inspeção.

## Outros impedimentos confirmados por leitura ou validação

- **Alta — backfill não é idempotente.** `backend/scripts/backfill_data.js:37` insere ajustes negativos com base em relatório salvo, sem chave única de aplicação ou revalidação do saldo. Repetir a execução com o mesmo relatório repete os ajustes. Usa ainda `registrado_por=5` fixo e não chama o recálculo central. Inspecionado; não executado sobre os dados existentes.
- **Alta — build do painel falha.** `npm run build` retorna erro de Lightning CSS: `Unknown at rule: @keyframes`. O trecho é `frontend/src/assets/css/tenant-login.css:400`, com `@keyframes shake` dentro do seletor `.tenant-login-page`, rejeitado pela ferramenta atual. Isso bloqueia a geração do pacote do painel.
- **Média — checkout de visitante ausente na interface.** `tela cliente/src/App.tsx:611` abre login e retorna quando não há atleta autenticado. O backend tem credencial de visitante, mas o fluxo completo solicitado pelo plano não está entregue na tela.
- **Média — vínculos legados não possuem fluxo de recuperação concluído.** `clientAccessService.js` bloqueia `verified=0` corretamente; não foi encontrado endpoint/fluxo de verificação desses vínculos existentes. Não desbloquear todos automaticamente como contorno.
- **Média — QR externo permanece.** `frontend/src/screens/admin/AdminAssinatura.tsx:1525` envia `copia_cola` para `api.qrserver.com` quando não recebe imagem local. Contraria diretamente a tarefa marcada como concluída. (feito gemini pro)
- **Média — HTML de e-mail recebe dados sem escape.** `backend/src/controllers/usuariosController.js:81` interpola `nome` e `arenaName` diretamente. A função de envio não faz escape de campos. Isso permite alteração do conteúdo HTML da mensagem; não foi realizado envio real nem teste em clientes de e-mail. (feito gemini pro)
- **Média — limites do plano não estão completos.** `rateLimiter.js` usa limites por IP e memória local, sem chave por conta/tenant/objeto. `relatoriosController.js:8` não impõe intervalo máximo e `:345` aceita `limite` sem teto, inclusive valor negativo que remove o limite no SQLite. Não foi executado teste de carga; a lacuna é visível no código. Compartilhamento entre instâncias depende da topologia escolhida. (feito gemini pro)
- **Dependências — módulo 6 não está encerrado.** `npm audit` consultado nesta revisão: backend 0; painel 3 (1 alta, 2 baixas); atleta 18 (10 altas, 5 moderadas, 3 baixas). Todos os nós sinalizados nas interfaces estão marcados `dev: true` nos respectivos lockfiles. Isso afeta a avaliação de ferramentas de desenvolvimento/build e não comprova, sozinho, vulnerabilidade explorável no bundle estático publicado. Não foram atualizados pacotes. (feito gemini pro)
- **Documentação contraditória.** O plano marca QR local, infraestrutura HTTPS/proxy, migrações, backup/restauração e auditoria como concluídos enquanto o resumo e as evidências não sustentam essas conclusões. O relatório dos blocos 3–5 também apresenta tarefas simultaneamente como feitas e como próximos passos. Reabrir itens compostos enquanto algum requisito não estiver comprovado. (feito gemini pro)

## Validações executadas

| Verificação | Resultado desta rodada |
| --- | --- |
| Backend completo | 266/269 passaram; 1 divergência de texto e 2 timeouts E2E na primeira execução |
| E2E funcionais, repetição isolada | 4/4 passaram |
| Navegador de segurança | 2/2 passaram na execução geral e na repetição focada; uma execução intermediária falhou somente no cleanup por `EBUSY` de arquivo temporário |
| Teste de horário passado, repetição | Continua falhando: HTTP 400 correto, mas espera `já encerrou` e recebe `Horário já encerrado.`; depende do horário em que o caso é executado |
| Painel | 60/61 inicialmente, com timeout; 61/61 ao repetir `--no-file-parallelism` |
| Portal do atleta | 31/31 passaram |
| TypeScript | Passou nas duas interfaces |
| Build do painel | Falhou no CSS descrito acima |
| Build do atleta | Passou após repetir fora do sandbox; primeira tentativa bloqueada por acesso negado do esbuild |
| Lint do painel | Reprovado: 176 erros e 27 avisos; não implica que todos sejam regressões desta mudança |
| Lint do atleta | Passou |
| Probes adicionais | Reproduziram os defeitos; não são uma suíte de aprovação |

Registros persistidos:

- [Resumo da validação geral](../artifacts/homologacao/2026-09-20T15-21-17-107Z/summary.json), com logs individuais na mesma pasta.
- [Repetição do painel](../artifacts/homologacao/frontend-tests-review-retry-2026-09-20.log).
- [Repetição E2E](../artifacts/homologacao/e2e-review-retry-2026-09-20.log).
- [Repetição focada do backend](../artifacts/homologacao/backend-focused-review-retry-2026-09-20.log).
- [Build do atleta](../artifacts/homologacao/cliente-build-review-retry-2026-09-20.log).
- Auditorias [backend](../artifacts/homologacao/audit-backend-2026-09-20.json), [painel](../artifacts/homologacao/audit-frontend-2026-09-20.json) e [atleta](../artifacts/homologacao/audit-cliente-2026-09-20.json).

Os artefatos estão no diretório local ignorado pelo Git. Este documento mantém o diagnóstico legível no projeto. Resultados de repetições não alteram retroativamente o resumo da primeira execução.

## Critério para retomar o encerramento

Corrigir primeiro unidades monetárias em toda a cadeia, validação e recuperação de pagamentos, migrações e backfill. Acrescentar regressões para os cenários reproduzidos, resolver build/lint e concluir os fluxos faltantes. Reavaliar o checklist contra essas evidências. Homologação Google/pagamentos reais, proxy/TLS, rotação, backup/restauração e publicação continuam entregas separadas; não foram aprovadas por esta revisão.
