# Retomada das correções de segurança — 21/09/2026

## Estado vigente — retomada de 22/09/2026

**Última atualização do item 5, 19:38 BRT:** ver o
[guia de execução e retomada](RETOMADA_HOMOLOGACAO_2026-09-22.md). Assinatura de
webhook instalada cifrada; 1 notificação pública com HTTP 200 observada, ainda
sem evidência de consulta/liquidação desse evento ou segunda notificação.
Pix fictício permanece pending, 1 transação/1 intenção, zero créditos.
Google não confirmado. Script de cartão sintético preparado, não validado:
execução parou por rede antes de tokenizar, deixando só reserva fictícia 20001.
Nenhum pagamento real. Não declarar o item 5 concluído.

Esta seção prevalece sobre os resultados históricos abaixo. Domínio, hospedagem,
proxy e HTTPS continuam adiados pelo responsável; não houve publicação nem criação
de pagamentos reais ou envio de mensagens nesta passagem.

### Correções locais desta retomada

- **Falha de autorização corrigida:** `POST /api/quadras/bloqueios` usava um
  controlador que não verificava a arena da quadra e aceitava recepcionista.
  Agora usa o mesmo controlador da rota de reservas e a permissão `blocks.manage`.
  Mantidos os campos `id` e `bloqueio_id` na resposta para compatibilidade.
- Oito testes HTTP cobrem ambas as URLs: acesso cruzado negado sem escrita,
  recepcionista negada, gerente autorizado e conflito com reserva rejeitado.
- **Monitor de sessões corrigido:** consulta AuthSessions, exclui revogadas,
  expiradas e contas/senhas/perfis/vínculos alterados, contando cada usuário uma vez.
  A interface diz "sessões válidas", sem alegar presença online em tempo real.
- Filtro de plano Master usa os planos carregados da API e seu ID. Filtro de arena
  da auditoria foi conectado aos nomes dos logs, substituindo opções fictícias.
- Novo `npm.cmd run check:local`: consulta SQLite somente leitura, verifica
  integridade/inconsistências/cifragem e resume filas/configuração sem revelar
  credenciais. Não inicia aplicação/jobs, não acessa rede e não aprova produção.
- Conferência local: integridade ok; zero referências órfãs, duplicidades de usuários,
  vínculos cruzados, pagamentos sem reserva ou grupos com pagamento excedente;
  3 segredos legíveis, 0 a migrar; apenas 1 estorno histórico concluído, sem
  intenções de pagamento ou eventos outbox pendentes.

### Entregas para continuar

Validação integrada desta retomada: **354 testes backend, 62 painel e 31 atleta
aprovados**, além de TypeScript, builds, lint sem avisos e inspeção pública.
Evidência: `artifacts/homologacao/2026-09-22T16-03-34-278Z/summary.json`.
Após a adição compatível do campo `id` na resposta de bloqueio, os 9 testes
direcionados de bloqueios/sessões foram repetidos e passaram (13:10, horário local).
`local-readiness.json` na mesma pasta registra a conferência somente leitura do
banco. A execução anterior desta data também passou, antes dos novos ajustes,
em `2026-09-22T15-33-57-948Z` (345 testes backend).

- [Inventário funcional dos três painéis e 128 rotas](INVENTARIO_FUNCIONAL_2026-09-22.md).
- [Roteiro de homologação externa e do servidor](HOMOLOGACAO_EXTERNA_2026-09-22.md).
- `docs/HOMOLOGACAO.md` recebeu aviso explícito de que seus resultados de 11/09
  são históricos (banco de teste em arquivo/ausência de testes browser/lint antigo).

### Pendências distintas

**Item 5 em execução parcial (22/09, 19:31):** ambiente isolado criado com banco
novo, chave própria e portas 3100/5183/5186. Credencial TEST validada por GET;
conexão manual da arena passou. Criado Pix fictício de R$ 100, confirmado no MP
como live_mode=false/BRL, recebedor correto e 10000 centavos no banco. Repetir a
criação não duplicou transação/intenção. Ainda pending, sem crédito. Não confundir
conexão manual com OAuth nem repetição de criação com repetição de webhook.
Portal validado no Chrome após corrigir o Tailwind do launcher. Aguardados teste
Google pelo responsável e cadastro do webhook/assinatura secreta. Webhook real,
aprovação, falhas, estorno, OAuth e SaaS ainda não homologados. Roteiro externo
contém comandos, limitações e localização das evidências privadas. Suíte integral
não repetida nesta etapa; banco habitual conferido somente leitura, íntegro.

Registro anterior (superado pela execução parcial acima):

Atualização da preparação externa: credenciais MP com prefixo `TEST-` fornecidas
pelo responsável foram salvas em `backend/.env.homologacao`, ignorado pelo Git.
O `.env` atual foi preservado. Isso não valida as credenciais nem conclui a
homologação: instalação/banco isolados e cenários externos continuam pendentes.
Não houve cobrança, chamada ao provedor ou rotação do token nesta configuração.

1. **Configuração adiada:** domínio/hospedagem/HTTPS/proxy, origens Google e callback MP.
   O ambiente local não foi convertido para produção. JWT_SECRET, FRONTEND_URL,
   CORS_ALLOWED_ORIGINS e TRUST_PROXY ainda não estão definidos para o destino.
2. **Validação externa não executada:** Google, OAuth MP, cobrança e webhook atuais,
   falhas/repetição/estorno, cartão/Point se ofertados e SMTP em destinatário de teste.
3. **Operação no destino não validada:** permissões/chaves próprias, restauração,
   reinício, portas/arquivos públicos e entrega de alertas de monitoramento.
4. **Ajustes funcionais/comerciais encerrados por definição do responsável:** não
   haverá mensalistas recorrentes; removidas as promessas comerciais. WhatsApp é
   manual com mensagem pronta; removida a opção que sugeria envio automático.
   Contato Enterprise corrigido no site e painel para o número informado, em
   `frontend/src/utils/commercialContact.ts`. Filtro Trial usa expiração no fuso
   da arena e identifica "Em teste", sem alterar cobrança/status. Não considerar
   esses quatro pontos pendentes na próxima retomada.

O inventário é um mapeamento do código, não certificação de cada função. Nenhum
percentual de conclusão ou resultado de testes substitui essas evidências.

Validação dos ajustes posteriores de escopo/Enterprise/Trial (22/09): dois testes
direcionados de Trial e sessões aprovados; Trial cobre vigência, expiração, último
dia, ausência de data, fuso e bloqueio. TypeScript, lint sem avisos e build do
painel aprovados; inspeção dos arquivos públicos aprovada. O build mantém aviso
de bundle JavaScript grande. A suíte integral não foi repetida para esses ajustes;
os resultados integrais acima pertencem à etapa anterior.

---

## Histórico de 21/09/2026

Pedido vigente: corrigir todas as pendências locais. O usuário confirmou que ainda
não há domínio. Não publicar nem tratar callbacks externos como homologados.
Não imprimir valores dos `.env`, não chamar provedores reais para testar pagamentos.

**Atualização final local: chave provisionada e 3 segredos cifrados no banco desta
máquina, com backup e ensaio. Corrigidos também os motivos globais do SaaS e a
coluna legada que impedia o uso de NULL. Nesta etapa: 76 testes direcionados
aprovados; integridade SQLite e inspeção dos builds aprovadas. Produção e
integrações externas continuam sem aprovação.**

## Última etapa — concluída em 21/09/2026, horário local

- `.env` do backend atualizado somente com `SECRETS_KEYRING_FILE` e
  `SECRETS_ACTIVE_KEY_ID`; credenciais existentes preservadas.
- Chave aleatória local em `.local-security/secret-keys.json`, fora do Git.
  ACL Windows restrita ao usuário atual, SYSTEM e Administradores, sem outros
  participantes. Não apagar a chave: o banco cifrado depende dela. Guardar uma
  cópia protegida separada dos backups antes de transferir/reinstalar a máquina.
- Backup SQLite consistente, restauração em cópia, ensaio de cifragem e aplicação
  transacional concluídos. Comparação lógica das 39 tabelas confirmou preservação
  de todos os dados durante a cifragem. Nova simulação: 3 segredos atuais, 0 a migrar.
- VACUUM e checkpoint executados após cifragem. Backups anteriores à cifragem
  ainda podem conter texto claro e devem permanecer protegidos.
- Detectadas 6 violações de chave estrangeira pré-existentes. Quatro eram motivos
  globais com `tenant_id=0`: migrados para NULL preservando IDs, textos e referências.
  O banco legado tinha NOT NULL nessa coluna; a migração removeu essa restrição.
- API SaaS passou a ler motivos globais NULL/0 e gravar NULL; razões inválidas
  retornam 400 e a atualização inteira é revertida. Motivos das arenas preservados.
- Relatório de inconsistências agora inclui `PRAGMA foreign_key_check` e exige
  revisão também para referências órfãs, duplicidades e segredos padrão detectados.
- PaymentIntents, RefundIntents e SecurityOutbox estavam vazios na inspeção local.
- Testes desta etapa: 12 de rotação/migração/motivos/backfill e 64 de SaaS/gateway/
  ambiente, todos aprovados. Não foi repetida a suíte integral das interfaces;
  o resultado integral anterior permanece registrado abaixo.
- Evidências privadas e backups:
  `.local-security/2026-09-22T02-26-20-870Z/` (data UTC; noite de 21/09 no Brasil).
  `report.json` registra a etapa de cifragem, antes da correção dos motivos;
  `inconsistencies-after.json` registra o estado final com 2 referências órfãs.

## Item 1 concluído — conciliação com evidência do provedor

Em 21/09/2026 (horário local), consultas GET autenticadas ao Mercado Pago
confirmaram os IDs, a moeda BRL, os valores e a conta recebedora (comparada com
`/users/me`). As três operações têm `live_mode=true`: não eram sandbox.

- Transações locais 35 e 45: cobranças de R$ 60,00 canceladas no provedor.
  Arquivadas integralmente em `LegacyGatewayArchive`, com estado original,
  evidência do provedor e identificador da conciliação. Removidas apenas da tabela
  operacional em que apontavam para reservas inexistentes. Nenhuma reserva fictícia
  foi criada e nenhum pagamento foi gerado.
- Transação 74/reserva 110: pagamento de R$ 0,01 integralmente estornado no provedor.
  Preservados os pagamentos originais 49–51. Acrescentados ajuste de duplicidade
  de -2 centavos e lançamento do estorno histórico de -1 centavo; saldo líquido zero.
  Registrados crédito histórico de 1 centavo, alocação restante zero e estorno
  concluído no ledger, para impedir novo débito em notificações repetidas.
- Auditoria `ConciliacaoLegadaVerificada` e marcador idempotente em
  `LegacyFinancialReconciliation`. Nenhuma cobrança ou devolução nova foi solicitada
  ao provedor: todas as chamadas externas foram GET.
- Backup antes da aplicação, ensaio em cópia, teste de rollback deliberado e
  reaplicação idempotente aprovados. Repetir liquidação/estorno com os serviços reais
  sobre a cópia não alterou os lançamentos.
- Banco ativo após aplicação: `integrity_check=ok`, zero violações de chave
  estrangeira, zero grupos com pagamento excedente e relatório sem revisão pendente.
- Corrigido acesso ao keyring: ACL permite explicitamente Mateus, a conta isolada
  CodexSandboxOffline, SYSTEM e Administradores. A consulta externa executada como
  Mateus comprovou a leitura/descriptografia da credencial sem revelar seu valor.
- Evidências e backup privados: `.local-security/payment-investigation.json`,
  `.local-security/reconciliation-active-backup.sqlite` e seu `.result.json`.
  Procedimento aplicado: `.local-security/reconcile-confirmed.cjs`.

## Pendências atuais, em ordem

1. **Conciliação de dados antigos: concluída**, conforme evidências acima.
2. **Domínio/hospedagem/proxy/HTTPS:** explicitamente adiado pelo usuário até a
   preparação da produção. Não solicitar essa definição agora.
3. **Homologação externa:** Google, Mercado Pago e webhooks reais continuam sem
   evidência externa. Credenciais presentes não comprovam ambiente de teste; o
   token MP configurado não foi tratado como sandbox nem usado para criar cobrança.
4. **Preparação do ambiente de produção:** provisionar suas próprias chaves,
   permissões, backups e variáveis no destino; repetir ensaio/migração e validação
   operacional lá. A conclusão local não migrou uma hospedagem externa.

Os itens abaixo são o histórico da passagem anterior, anterior à migração local.

## Concluído nesta passagem

- Corrigida a inicialização da regra ESLint `no-unused-expressions`, mantendo-a ativa.
- Removidos `any` explícitos do painel; criados tipos de respostas em `frontend/src/types`.
- Corrigidos efeitos React e navegação compartilhada; `useEventCallback` preserva
  gatilhos explícitos de busca/paginação sem capturar filtros antigos.
- Corrigidos campos `criado_em` e nome de administrador retornados pela API.
- Corrigida mensagem de recuperação que ainda anunciava a senha antiga `arena123`.
- Removidos headers Bearer legados de AdminAssinatura (usa cookies e CSRF via apiFetch).
- Removido polling redundante de reservas do gestor pela rota pública.
- TypeScript, lint sem avisos e builds das duas interfaces passaram na validação integrada.
- Testes das interfaces: painel 62/62 e tela do cliente 31/31. Ambos agora exigem zero avisos no comando `lint`.
- Removidos espaços finais apontados nos arquivos Sonar; não apagar resultados anteriores.

## Backend implementado nesta passagem

- `backend/src/utils/secretEncryption.js`: AES-256-GCM v2 com ID da chave,
  leitura v1, keyring externo/ambiente, bloqueio de segredo em texto claro em produção.
- `backend/src/services/secretRotationService.js` e `backend/scripts/rotate_secrets.js`:
  simulação somente leitura e aplicação transacional. Testados; não aplicados ao banco real.
- `backend/src/config/proxy.js`: validação de proxies explícitos e bloqueio de
  conexões diretas em produção; bind padrão de produção passa a ser localhost.
- Corrigido `ipKeyGenerator(req, res)` para `ipKeyGenerator(req.ip)` e removido
  `x-tenant-slug` fornecido pelo cliente da chave do limite de requisições.
- Validação de ambiente unificada; testes atualizados para exigir configuração completa.
- Fixtures dos testes de webhook cifram segredos antes de alternar para produção.
- Suítes direcionadas de criptografia/rotação/proxy/ambiente/gateway/MFA: 79/79 aprovados.
- Proteção HTTP de arquivos privados e inspeção dos builds adicionadas.
- `npm run check:public` passou: sem arquivos proibidos nem credenciais literais
  do backend `.env` nos builds. Nenhuma chamada real aos provedores foi feita.

## Ordem registrada antes da última etapa (histórico)

1. Provisionar chaves no ambiente alvo e executar migração de segredos primeiro
   sobre cópia, depois no banco ativo. Não executado no banco real desta máquina.
2. Escolher domínio/hospedagem; configurar proxy, TLS, origens Google e callback MP.
3. Homologar provedores em sandbox, implantar e verificar infraestrutura/monitoramento.
4. Conciliar a divergência de 2 centavos da reserva 110 com o comprovante real,
   preservando histórico. Não é falha remanescente comprovada da conversão monetária.

Já preparados: `.env.example`, `deploy/nginx.conf.template`,
`deploy/arenix.service.example` e [roteiro operacional](security-operations-2026-09-21.md).
Nginx não está instalado neste Windows: sintaxe e implantação do template ainda
precisam de validação na hospedagem. Supabase não aparece no código/dependências
executáveis atuais. Scripts temporários de correção de lint já foram removidos.

## Ambiente inspecionado sem revelar segredos

O backend `.env` tem SMTP, Mercado Pago e Google presentes. Não contém
`NODE_ENV`, `JWT_SECRET`, origens CORS, `FRONTEND_URL`, proxy nem chave de cifragem.
O callback Mercado Pago aponta para a origem `https://arenix.com.br`, mas o usuário
confirmou que não há domínio disponível. Presença de credenciais não comprova sandbox.
Nenhum valor secreto foi modificado nem houve migração do banco real nesta passagem.

## Evidências

Execução integrada desta passagem: `artifacts/homologacao/2026-09-21T19-26-45-016Z/summary.json`.
O primeiro backend teve um timeout de navegação do E2E (340/341). Foi corrigido o
limite específico de navegação para 45 s durante compilação Vite, mantendo as ações
e assertivas em 15 s. A repetição completa passou: 341 testes em 34 arquivos,
registrados em `backend-recheck.log` na mesma pasta.
`final-verification.json` consolida os dez passos aprovados, preservando o relatório
original e sua falha. O script raiz `npm.cmd run validate` executa tudo sequencialmente.

Existe ainda uma divergência financeira já documentada da reserva 110:
obrigação de 1 centavo e pagamento de 3 centavos. Não alterar saldo, apagar registros
ou devolver valores automaticamente; depende de conciliação do dado real.
