# Revisão de segurança — Arenix / Volei System

**Conclusão: o código atual contém vulnerabilidades críticas reproduzidas. Não está pronto para ser considerado seguro para dados e pagamentos reais.**

Data de referência da revisão: 13/09/2026. Avaliação do working tree, incluindo alterações ainda não commitadas. As correções anteriores do gateway/OAuth não cobrem todas as rotas equivalentes do sistema.

## Escopo e evidências

- Revisão das rotas e dos fluxos de autenticação, usuários, clientes, reservas, pagamentos, gateway, assinatura SaaS e exposição de dados nas interfaces.
- Reproduções por HTTP com Supertest, Express e SQLite reais, usando exclusivamente SQLite `:memory:`, identidades fictícias e `NODE_ENV=production`. Mercado Pago e envio de e-mails foram substituídos por simuladores locais; nenhum pagamento, e-mail ou dado real foi utilizado.
- Script: [security_audit_review.cjs](../backend/tests/security_audit_review.cjs). Executar em `backend`: `node tests/security_audit_review.cjs`.
- Resultado: [security-audit-evidence.json](security-audit-evidence.json), com 17 observações. São evidências de falhas, não 17 vulnerabilidades independentes nem uma suíte que certifica segurança ao passar.
- Consulta ao registro npm: `npm.cmd audit --omit=dev --json` em backend, frontend e tela cliente, sem alterar dependências.
- Não houve avaliação do servidor publicado, TLS, proxy/WAF, firewall, backups, permissões de arquivos em produção, políticas do Supabase ou histórico de incidentes. Não se pode concluir se alguém já explorou essas falhas.
- Não foram aplicadas correções funcionais nesta revisão. Foram adicionados apenas o script e os documentos de auditoria.

## Falhas confirmadas, em ordem de prioridade

### 1. Crítica — Administrador de arena consegue tornar-se SuperAdmin e obter segredos de pagamento

**Código:** `backend/src/routes/usuariosRoutes.js:8`, `backend/src/controllers/usuariosController.js:126`, `backend/src/controllers/saasController.js:984`.

As rotas de usuários aceitam Administrador e Gerente, mas os controladores de criação/edição gravam `perfil` recebido do cliente sem limitar os perfis que esses atores podem atribuir. O banco aceita `SuperAdmin`.

**Reprodução:** um administrador editou a própria conta; a resposta foi HTTP 200. O login seguinte emitiu um JWT com `perfil=SuperAdmin`. A consulta master retornou HTTP 200 e dados da outra arena. A consulta de configurações retornou os segredos fictícios `mp_master_access_token` e `mp_client_secret`.

**Impacto:** quebra do isolamento entre empresas, acesso à administração global e exfiltração das credenciais da plataforma. O cadastro público de novas arenas torna a obtenção de uma conta Administrador uma pré-condição especialmente fraca. Não foi testada movimentação de dinheiro com essas credenciais; o alcance fora do sistema depende das permissões concedidas pelo provedor.

**Correção:** permitir explicitamente apenas perfis de equipe adequados a cada ator; proibir criar/atribuir SuperAdmin pelas rotas de tenant; restringir edição de contas de hierarquia superior e autopromoção. Remover segredos das respostas de leitura do master, usando indicadores de configuração. Após corrigir, revisar contas SuperAdmin e avaliar rotação de segredos expostos.

### 2. Crítica — Login Google aceita identidade falsificada

**Código:** `backend/src/controllers/publicController.js:1892`, especialmente `jwt.decode` na linha 1898; emissão da sessão na linha 890.

O backend apenas decodifica a credencial. Não verifica assinatura Google, emissor, destinatário ou validade. O bloqueio do fallback de e-mail em produção não protege o caminho `credential`.

**Reprodução:** em modo produção, uma credencial assinada com uma chave fictícia sem relação com o Google, expirada e com emissor/destinatário incorretos, gerou HTTP 200 e sessão da vítima. Essa sessão permitiu ler o CPF fictício no perfil.

**Impacto:** tomar a sessão de um atleta conhecendo seu e-mail, consultar seus dados e utilizar funções disponíveis a essa conta. Contas de gestão são rejeitadas por esse endpoint, portanto a reprodução não demonstra login Google direto como administrador. A atualização de perfil também permite trocar senha sem a senha atual, ampliando o impacto de uma sessão tomada.

**Correção:** validar ID token com biblioteca apropriada, assinatura e chaves do emissor, `aud`, `iss`, `exp` e política de identidade verificada; vincular a conta à identidade estável do provedor. Se o frontend entrega token Supabase, validar o token e emissor Supabase correspondentes, sem tratá-lo automaticamente como ID token Google.

A documentação oficial exige essas verificações: [Google — verificar ID token no servidor](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

### 3. Crítica — Cliente pode registrar pagamento sem pagar e consultar dados administrativos

**Código:** `backend/src/routes/pagamentosRoutes.js:8`, `:11`, `:14`, `:29`; `backend/src/controllers/pagamentosController.js:28`; `backend/src/routes/clientesRoutes.js:6`.

Várias rotas usam apenas `verifyToken`. Em clientes e pagamentos, o filtro por tenant não impede um Cliente de acessar outros clientes da mesma arena. O registro manual não exige perfil de funcionário nem valida propriedade da reserva.

**Reprodução:** login real de uma fixture Cliente pelo `/api/auth/login`; consulta à lista de clientes e reservas financeiras retornou os dados de outro cliente. `POST /api/pagamentos` registrou R$ 100 como Pix Online, retornou HTTP 201 e marcou a reserva alheia como `Pago`, com zero consultas ao provedor.

**Pré-condição:** JWT Cliente com tenant, como o emitido pelo login genérico para conta vinculada a uma arena. O JWT universal do portal pode não conter tenant; isso não protege a rota quando existe um JWT válido com tenant.

**Correção:** exigir perfis de equipe no caixa e cadastro administrativo; aplicar propriedade do cliente nas consultas permitidas ao atleta; separar lançamento manual de confirmação de gateway e rejeitar métodos online no lançamento manual. A autorização precisa ocorrer em cada requisição: [OWASP — Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

### 4. Alta — Cliente cria reserva gratuita e associa cliente de outra arena

**Código:** `backend/src/routes/reservasRoutes.js:16`; `backend/src/controllers/reservasController.js:42`, `:127`, `:196`.

`POST /api/reservas` só exige token. O cálculo aceita `valor_total` recebido, incluindo zero, e o controlador não valida se `cliente_id` pertence à arena ou ao usuário. Também aceita dados de pagamento de balcão.

**Reprodução:** Cliente criou reserva com valor zero, confirmada e paga, associada a um cliente de outro tenant, HTTP 201.

**Correção:** separar criação administrativa e criação pelo atleta; calcular preço no backend para atletas; validar a combinação cliente/quadra/arena e limitar quem pode conceder desconto ou registrar pagamento.

### 5. Alta — Consulta pública por telefone expõe CPF, e-mail e histórico

**Código:** `backend/src/controllers/publicController.js:1174`, `:1220`, `:1266`.

`GET /api/public/tenant/:slug/minhas-reservas` aceita telefone informado na query mesmo sem sessão. O resultado inclui nome, e-mail, telefone, CPF, horários, valores, estados de pagamento e referências de transações.

**Reprodução:** requisição sem Authorization, apenas com telefone fictício, retornou HTTP 200 com CPF e e-mail da vítima.

**Impacto:** extração de dados pessoais e rotina dos atletas. Rate limiting reduz volume, mas não concede legitimidade a quem conhece um telefone. Um token inválido também não elimina o fallback por telefone.

**Correção:** identidade autenticada e vínculo real com o cliente; para checkout sem conta, usar capacidade aleatória limitada à reserva ou verificação de posse do telefone. Não aceitar telefone como prova de identidade. Retornar apenas campos necessários.

### 6. Alta — Checkout público altera cadastro de outra arena

**Código:** `backend/src/controllers/publicController.js:392`, `:412`, `:473`.

A busca de cliente por e-mail/CPF não inclui tenant, e o checkout público atualiza nome, telefone, e-mail e CPF do cadastro encontrado sem comprovar identidade.

**Reprodução:** uma reserva anônima na arena A, informando e-mail de cliente da arena B, retornou HTTP 201 e sobrescreveu nome, telefone e CPF desse cliente na arena B.

**Impacto:** corrupção de dados entre empresas e risco aos fluxos que usam e-mail/telefone para relacionar identidade, reservas e cancelamentos.

**Correção:** buscar sempre no tenant correto; impedir alteração de cadastro existente por checkout anônimo; distinguir contato informado para uma reserva de atualização autenticada do cadastro.

### 7. Alta — Cancelamento anônimo e enumeração de reservas

**Código:** `backend/src/controllers/publicController.js:1140`, `:1107`, `:1493`.

`POST /api/public/tenant/:slug/cancelar-pendente` altera reservas por ID sem verificar proprietário. A consulta pública de status obtém a reserva pelo ID e sequer utiliza o slug para conferir a arena. A recuperação de Pix por ID também não exige propriedade e pode gerar nova cobrança.

**Reprodução:** uma requisição anônima cancelou uma reserva de terceiro; consultar status usando o slug de B retornou a reserva de A.

**Impacto:** sabotagem de agendamentos, exposição de situação financeira e geração indevida/repetida de cobranças pendentes.

**Correção:** aplicar vínculo autenticado ou capacidade secreta específica da reserva em todos os caminhos, inclusive desistência de modal, status e recuperação de Pix. IDs sequenciais não são credenciais.

### 8. Alta — Notificações simultâneas duplicam pagamento

**Código:** `backend/src/services/gatewayService.js:100`, especialmente leitura de status, UPDATE e INSERT separados nas linhas 101–119.

O controle de repetição faz uma leitura antes de escrever e não reserva atomicamente o processamento. Duas requisições podem encontrar o mesmo estado Pendente.

**Reprodução:** cinco requisições HTTP simultâneas ao webhook consultaram um provedor simulado que confirmava um único pagamento de R$ 100. O banco terminou com cinco lançamentos, somando R$ 500.

**Impacto:** duplicação contábil, saldo incorreto e limites de estorno inconsistentes. A prova não demonstra cinco transferências bancárias: demonstra cinco créditos internos para uma transferência confirmada.

**Correção:** processamento transacional com aquisição atômica do evento e unicidade do pagamento por transação do provedor; recomputar saldo dentro da unidade de consistência. Incluir testes concorrentes reais e recuperação de falhas entre UPDATE e INSERT.

### 9. Alta — Pagamento parcial quita indevidamente outros horários do grupo

**Código:** `backend/src/services/gatewayService.js:49`; `backend/src/routes/gatewayRoutes.js:32`; recuperação de Pix em `backend/src/controllers/publicController.js:1452`.

A liquidação marca todo o `grupo_id` como confirmado/pago antes de recalcular apenas a reserva principal, independentemente do valor total do grupo.

**Reprodução HTTP:** grupo com duas reservas de R$ 100. O proprietário gerou cobrança de R$ 1; o webhook confirmou esse valor via provedor simulado. A primeira reserva ficou Parcial, a segunda ficou Pago; o total registrado foi apenas R$ 1.

**Correção:** modelar cobrança do grupo e rateio/saldo de todas as reservas. Confirmar quitação somente quando o valor devido estiver integralmente coberto. Recuperar Pix deve considerar saldo e escopo da cobrança original, não gerar cobrança por uma parcela e quitar o grupo.

### 10. Alta — Logout e desativação não revogam o acesso

**Código:** `backend/src/middlewares/auth.js:48`; `backend/src/controllers/authController.js:87`; verificações JWT diretas no controlador público.

`verifyToken` verifica assinatura e usa as permissões do JWT, mas não exige sessão ativa nem verifica o estado atual do usuário. A tabela SessoesAtivas serve como registro de atividade, não como condição de acesso.

**Reprodução:** após logout HTTP 200, o mesmo token continuou retornando dados HTTP 200. Após marcar o usuário inativo, o token continuou funcionando.

**Impacto:** token roubado continua utilizável até expirar; alteração de senha/perfil não é suficiente para retirar permissões já emitidas. Login administrativo emite token de 8 horas; fluxos públicos emitem tokens de 30 dias.

**Correção:** revogação efetiva via sessão validada ou versão de autenticação, verificação do usuário ativo e das permissões atuais; revogar sessões após redefinição de senha, bloqueio e mudanças de perfil; uniformizar validação entre rotas administrativas e públicas.

### 11. Média — Token de redefinição pode funcionar após expirar

**Código:** `backend/src/controllers/authController.js:261`, `:324`.

A expiração é gravada em ISO com `T` e `Z`, mas comparada como texto com `datetime('now')`, cujo separador é espaço. Dentro da mesma data UTC, a ordenação lexical pode aceitar um horário expirado.

**Reprodução:** token fictício expirado havia duas horas foi aceito pelo endpoint e alterou a senha, HTTP 200. O erro depende da data/hora; não significa validade
## Outros problemas identificados por inspeção ou dependentes do ambiente

- **Segredo JWT padrão no código:** sem `JWT_SECRET` forte em produção, o fallback conhecido permite fabricar JWTs inclusive de SuperAdmin. O servidor não exige a variável ao iniciar. Não foi lido ou validado o segredo do servidor publicado.
- **Upload permite conteúdo ativo:** `arenasController.js:88` confia no subtipo `image/...` e usa-o como extensão sem lista de formatos ou verificação dos bytes. `image/html` produz `.html`, servido por `/uploads` na mesma origem. É um caminho potencial para XSS persistente ao abrir o arquivo; não foi executado teste de navegador. Validar e recodificar imagens raster e servir mídia em origem separada sem credenciais.
- **Tokens no localStorage:** as interfaces armazenam JWTs acessíveis por JavaScript. Isso amplia impacto de XSS; codificar com `encodeURIComponent` não protege segredos. Não é, isoladamente, prova de vazamento.
- **Senhas/2FA previsíveis:** criação administrativa de arena possui senha padrão quando omitida; reset master usa senha fixa; `init_db.js:68` e `saasController.js:761` contêm fallback compartilhado de 2FA. Além disso, a rota de perfil de atleta aceita um JWT de gestão e permite trocar senha sem aplicar a verificação reforçada da rota master. Remover defaults compartilhados e centralizar a política de mudança de senha.
- **Abuso e negação de serviço:** `/api/auth/register`, `/forgot-password` e `/reset-password` não têm rate limiter de rota. O servidor aceita corpos de 10 MB e não aplica limite global; cobranças e webhooks fazem chamadas externas sem timeout explícito. `trust proxy=1` depende da topologia do deploy para que limite por IP seja confiável. Não foram realizados testes de carga nem ataques ao servidor real.
- **Assinatura de webhook:** o webhook de arena não valida assinatura; o SaaS só valida se houver secret. Ambos consultam o provedor antes de aceitar aprovação, portanto a falta de assinatura, sozinha, não demonstrou pagamento fictício. Ainda permite trabalho externo por notificações arbitrárias e não resolve repetição concorrente. Exigir configuração correta em produção e validar o evento e sua correspondência com a cobrança.
- **Repetição na criação de cobrança:** o gateway gera chave de idempotência aleatória por requisição. Repetir a intenção de pagamento pode criar cobranças distintas; a recuperação pública de Pix também cria novamente. Reutilizar a mesma intenção pendente e reconciliar cobranças excedentes.
- **Estornos e eventos posteriores:** `registrarEstorno` registra saída no livro interno sem chamar reembolso no provedor; o caminho de cancelamento do atleta usa outra função de reembolso. O webhook do gateway trata aprovação, mas não reconcilia estados de refund/chargeback. Diferenciar estorno contábil de devolução efetiva e implementar reconciliação.
- **Validação de agenda pública:** os itens não passam pelas mesmas validações administrativas de quadra ativa, funcionamento, bloqueios e duração; uma quadra não encontrada recebe preço padrão pelo helper. Validar cada item e o lote inteiro antes de qualquer escrita, com proteção contra concorrência.
- **HTTPS, CSP e proteção de enquadramento:** não configurados no Express examinado; podem existir no proxy. A presença e adequação no servidor publicado não foram verificadas. CORS não impede chamadas por clientes HTTP fora do navegador.

## Dependências

Resultados de `npm audit --omit=dev` no momento da análise:

| Projeto | Pacotes sinalizados | Severidade reportada |
| --- | --- | --- |
| Backend | `ip-address`, `nodemailer`, `qs`, `tar`, `undici` | 3 altos e 2 moderados |
| Frontend administrativo | `react-router`, `react-router-dom`, `ws` | 3 altos |
| Tela cliente | `ws` | 1 alto |

Esses totais são pacotes apontados pelo npm, com sobreposição entre avisos/dependências. Não equivalem a nove explorações demonstradas da aplicação. O aviso de React Router refere-se a RSC; as interfaces examinadas são SPAs, sem comprovação desse caminho vulnerável. Bibliotecas transitivas usadas na instalação e bibliotecas Node presentes no lockfile do frontend podem não executar no servidor/navegador publicado. Todos os avisos retornaram `fixAvailable: true`, mas atualização precisa de validação, não `audit fix --force` indiscriminado.

Exemplos de avisos retornados: [Nodemailer — consumo excessivo no parser](https://github.com/advisories/GHSA-2x7j-588g-ccc2), [React Router — RSC CSRF](https://github.com/advisories/GHSA-qwww-vcr4-c8h2), [ws — exaustão de memória](https://github.com/advisories/GHSA-96hv-2xvq-fx4p).

## Por que testes anteriores passaram

Os testes do gateway cobrem proteções reais, mas não certificam as rotas públicas e administrativas equivalentes. Em `backend/tests/security_concurrency.test.js` há verificações que podem passar sem demonstrar a propriedade de segurança anunciada:

- SEC-05 apaga sessões diretamente no banco; não verifica se o token continua aceito após logout.
- RACE-01 aceita sucesso em ambas as reservas concorrentes, sem exigir uma única reserva no banco.
- RACE-02 envia apenas um pagamento, apesar do objetivo de concorrência.
- RACE-03 envia formato de webhook que não entra no processamento de evento de pagamento e testa apenas o HTTP.
- SEC-04 aceita 404 em relatório que não está montado no `app.js` usado pelo teste; a rota é adicionada em `server.js`.
- O teste de XSS apenas observa resposta da API; não renderiza conteúdo em navegador.

Esses testes devem verificar o efeito persistido e os caminhos realmente publicados, incluindo matriz anônimo/Cliente/equipe/admin/SuperAdmin, arena A/B e proprietário/terceiro.

## O que já ajuda e o que fazer primeiro

O gateway corrigido verifica arena/proprietário em cobrança, status e simulação; configuração da maquineta e OAuth têm controle de perfil; tokens privados da arena foram retirados dessas respostas. OAuth state é aleatório, expira e tem consumo atômico. As consultas examinadas utilizam predominantemente parâmetros SQL e as senhas usam bcrypt. Não foi demonstrada injeção SQL nem execução remota de comandos nesta revisão. Isso não neutraliza as falhas de autorização reproduzidas.

Prioridade de remediação:

1. Bloquear escalada a SuperAdmin, identidade Google falsificada, acesso público indevido e lançamentos financeiros por Cliente.
2. Corrigir isolamento do cadastro público e autorização em todas as rotas alternativas de reservas/pagamentos.
3. Tornar liquidação e criação de cobranças consistentes sob concorrência; corrigir saldo de grupos, estorno e reconciliação.
4. Implementar revogação efetiva, expiração correta e política única de senhas/2FA; exigir segredos e ambiente de produção na inicialização.
5. Corrigir upload e dependências; validar deploy e executar regressões adversariais após as mudanças.

Se esta versão estiver publicada, os endpoints críticos devem ser restringidos até a correção. Revisar registros de novos SuperAdmins, acesso às configurações master e lançamentos financeiros inconsistentes. A revisão não estabelece que houve incidente; estabelece caminhos concretos para que ele ocorra.
