# Plano de implementação de segurança — Arenix

Data do plano: 14/09/2026. Atualização de status: 18/09/2026. Status: bloco 0 concluído localmente; demais blocos parciais; publicação e homologação em produção não confirmadas.

Base: [auditoria](security-review-2026-09-13.md) e [evidências locais](security-audit-evidence.json). O objetivo é eliminar as falhas demonstradas, tratar os riscos adicionais e estabelecer critérios verificáveis para publicação. Concluir este plano não equivale a garantir ausência absoluta de vulnerabilidades.

Marcação: `[x]` indica implementação conferida no código local; `[ ]` indica item pendente, parcialmente implementado ou sem comprovação suficiente. Tarefas com vários requisitos permanecem abertas enquanto houver parte não concluída. A remediação anterior está no commit `a5d8963`; a execução do bloco 0 partiu do working tree limpo na revisão `ce9f8b50c5bf347b449c21874198292705eecd56`. Evidências e limites estão no [registro do bloco 0](security-block-0-2026-09-18.md).

Validação do bloco 0: `npm.cmd run test:security`, executado em `backend`, passou com **100 testes em 6 arquivos**, incluindo SQLite `:memory:`, rotas de `app.js`, webhook HTTP concorrente com assinatura e testes em navegador headless. A execução geral do backend ainda apresenta falhas nas demais suítes, registradas no relatório do bloco; estes resultados não substituem homologação completa ou validação no provedor/deploy.

## Evidências e pendências da atualização

| Área | Evidência local e limite da conclusão |
| --- | --- |
| Rotas e permissões | `app.js`, `server.js`, `permissions.js`, `usuariosController.js` e rotas administrativas restringem perfis e centralizam a montagem da API. A matriz do bloco 0 cobre atores, arenas e contas ativas/bloqueadas/excluídas. A política completa e o fluxo dedicado de troca de titular permanecem abertos. |
| Google | `LoginScreen.tsx` envia ID token; `athleteAuthController.js` usa `verifyIdToken` e vincula pelo subject, exigindo senha para uma conta existente. O caminho antigo sem prova foi substituído; a interface informa indisponibilidade quando não configurado. Login real Google ainda requer homologação. |
| Sessões e recuperação | `sessionService.js`, `recoveryService.js` e os clientes `apiFetch.ts` implementam cookies, CSRF, hashes, expiração e revogação. O snapshot de senha/perfil/tenant invalida sessões após mudanças. Topologia publicada e consolidação dos marcadores de interface ainda precisam de conclusão. |
| Clientes e visitantes | `clientAccessService.js` e `securitySchema.js` criam vínculos explícitos e credenciais limitadas de visitante. A associação automática por e-mail continua em `membership` e na migração v2: a prova de identidade para vincular cadastros permanece pendente. |
| Reservas | `bookingService.js` valida arena/quadra, horários, funcionamento, bloqueios e conflitos, inclusive em transação. Validação de esporte, unidade de preço e todos os requisitos de desconto ainda não têm encerramento comprovado. |
| Financeiro | `paymentLedgerService.js`, `securitySchema.js` e `transactions.js` implementam crédito único, alocação e recálculo transacional. O bloco 0 valida cinco webhooks HTTP simultâneos e pagamento parcial no grupo. Conta/moeda, reconciliação periódica e todos os cenários de falha/eventos fora de ordem ainda exigem conclusão. |
| Arquivos e navegador | `arenasController.js` recodifica imagens com `sharp`; `app.js` restringe arquivos servidos e aplica `helmet`. O bloco 0 testa XSS no cadastro renderizado, rejeição de upload HTML e bloqueio de HTML existente em `/uploads`, usando navegador real. CSP, limites, demais destinos de HTML e infraestrutura ainda precisam de validação completa. |
| QR Pix | O backend gera QR localmente, mas `AdminAssinatura.tsx` ainda tem fallback para `api.qrserver.com`; a tarefa permanece aberta. |
| Migração e entrega | `securitySchema.js` ainda contém tratamento por ID fixo e associação por e-mail na migração v2. Auditoria de dependências, conciliação histórica, backup/restauração, homologação e publicação não foram comprovados. |

## Ordem e entregas

| Etapa | Entrega | Dependência | Critério principal |
| --- | --- | --- | --- |
| 0 | Regressões e montagem única das rotas | Nenhuma | Testes exercitam as mesmas rotas da produção |
| 1 | Contenção das falhas críticas e proteção de segredos | 0 | Cliente não lança pagamentos; tenant não cria SuperAdmin; dados não saem anonimamente |
| 2 | Autenticação, Google, sessões, senha e 2FA | 1 | Identidade verificada e acesso revogado imediatamente |
| 3 | Clientes, checkout e reservas isolados por arena | 1–2 | IDs, telefone e e-mail não permitem acessar/alterar terceiros |
| 4 | Cobranças, liquidação, grupos e estornos consistentes | 0–3 | Cada evento financeiro produz um único efeito correto |
| 5 | Uploads, navegador, limites e configuração | 1–4 | Conteúdo ativo e abuso dos endpoints são bloqueados |
| 6 | Dependências e migração dos dados existentes | Migrações preparadas em 2–4 | Atualizações verificadas e inconsistências tratadas sem apagar histórico |
| 7 | Homologação, publicação e acompanhamento | Todas | Cenários adversariais e fluxos legítimos aprovados |

As etapas são entregas pequenas e revisáveis, preferencialmente commits separados. As proteções da etapa 1 devem poder ser publicadas antes das mudanças maiores. Nenhuma tarefa exige trocar React, Express ou SQLite.

## 0. Preparar uma base de validação confiável

- [x] Preservar o working tree existente e registrar a revisão exata avaliada; separar os commits da remediação das alterações já presentes.
- [x] Centralizar todas as rotas em `app.js` ou em um registrador único usado pelo app. `server.js` deve inicializar infraestrutura/jobs e escutar a porta, sem registrar outra versão das rotas.
- [x] Transformar as reproduções da auditoria em testes de regressão com expectativas seguras: rejeição de ações indevidas, ausência de dados sensíveis e conferência das alterações no banco.
- [x] Manter as evidências originais como histórico. O script de auditoria atual registra vulnerabilidades; sua execução sem erro não será critério de aprovação.
- [x] Usar banco isolado por suíte; concorrência com SQLite real. Nunca executar fixtures de auditoria no banco de produção.
- [x] Criar matriz de atores: anônimo, Cliente proprietário, Cliente terceiro, Recepcionista, Gerente, Administrador e SuperAdmin; arena A e B; conta ativa, bloqueada e excluída.
- [x] Incluir login real nas suítes de autorização, evitando depender exclusivamente de JWTs fabricados pelos testes.

**Arquivos:** `backend/src/app.js`, `backend/src/server.js`, `backend/tests/security_concurrency.test.js`, `backend/tests/gateway.test.js` e novas suítes de autorização, identidade e pagamentos.

**Aceite:** uma rota ausente gera falha de montagem, não aprovação de isolamento. Um teste de concorrência verifica número e soma de registros; o de logout reutiliza a credencial; XSS é testado em navegador.

**Resultado em 18/09/2026:** concluído localmente, com 100 testes aprovados. [Registro, matriz e correspondência com a auditoria](security-block-0-2026-09-18.md). Os arquivos históricos da auditoria permanecem intactos. A suíte geral não está aprovada: sua atualização e as correções dos demais blocos continuam pendentes.

## 1. Fechar imediatamente os acessos críticos

### Perfis e permissões

- [ ] Criar política central de permissões, negando ações não previstas.
- [x] Impedir atribuição de `SuperAdmin` por qualquer endpoint de tenant, tanto na criação quanto na edição de usuários.
- [ ] Proibir autopromoção. Administrador pode gerenciar Gerente e Recepcionista da própria arena; Gerente pode gerenciar apenas Recepcionista. Mudança de titular/Administrador fica em fluxo dedicado, com reautenticação e auditoria.
- [x] Impedir modificar e-mail/senha/perfil de conta de hierarquia superior por uma rota menos protegida.
- [x] Usar os perfis efetivamente suportados pelo esquema; remover permissões residuais para nomes de perfil inexistentes.
- [x] Restringir CRUD administrativo de clientes, grade identificada e criação de reservas de balcão à equipe permitida.
- [x] Restringir lançamento manual a Administrador, Gerente e Recepcionista; descontos a Administrador/Gerente, com limite do Gerente; estorno a Administrador. Não permitir atribuição de métodos online confirmados pelo lançamento manual.
- [ ] Clientes acessam somente operações de atleta e objetos comprovadamente vinculados à sua conta. SuperAdmin usa rotas master explícitas, sem bypass genérico em helpers de reservas.

### Dados e credenciais

- [ ] Retirar token master, client secret, webhook secret, segredos de 2FA e tokens de recuperação de todas as respostas de leitura e logs.
- [x] Retornar indicadores como `has_master_token`, `has_client_secret` e `gateway_connected`; aceitar segredo apenas na operação de substituição.
- [ ] Preservar credencial anterior se uma atualização não trouxer nova credencial. Remoção exige ação explícita e reautenticação adequada.
- [x] Desativar o caminho Google que aceita identidade sem prova até concluir a etapa 2; indicar indisponibilidade desse método na interface e manter login por senha.
- [x] Remover de imediato o fallback público que revela histórico por telefone. Suspender cancelamento/recuperação de Pix sem prova de propriedade até o contrato seguro da etapa 3.
- [x] Bloquear simulação em produção em gateway, assinatura SaaS e serviços auxiliares para todos os perfis. Simulação de desenvolvimento exige habilitação explícita, em vez de ocorrer por falta de token ou `NODE_ENV`.

**Arquivos:** `usuariosRoutes.js`, `usuariosController.js`, `clientesRoutes.js`, `pagamentosRoutes.js`, `pagamentosController.js`, `reservasRoutes.js`, `gatewayAuthorization.js`, `saasController.js`, `publicController.js`, `tenantAssinaturaRoutes.js`, `saasBillingService.js`; telas de configurações e gestão nas duas interfaces.

**Aceite:** tentativas de promoção e pagamentos por Cliente são rejeitadas sem alterar banco ou chamar provedor. Conta Administrador recém-criada pelo cadastro público não consegue acessar nenhuma rota master. Respostas e logs de sucesso/erro não contêm os segredos das fixtures.

## 2. Unificar identidade e revogação de acesso

### Google

- [x] Trocar o fluxo em `tela cliente/src/components/LoginScreen.tsx`: atualmente consulta userinfo no navegador e envia apenas e-mail/nome. Passar a obter um ID token pelo fluxo de identidade Google e enviá-lo ao backend.
- [x] Validar no servidor assinatura, emissor, audiência configurada, expiração e requisitos de e-mail verificado. Usar biblioteca mantida do provedor, com configuração explícita.
- [x] Vincular identidade por `(provedor, subject)` e usuário interno. E-mail não será, sozinho, autorização para vincular conta existente; exigir autenticação existente ou procedimento de recuperação/vinculação verificado.
- [ ] Remover credenciais fictícias e fallback por e-mail dos fluxos publicados. Simuladores ficam restritos aos testes.
- [ ] Inventariar o uso real de Supabase nas interfaces. Se houver fluxo de identidade Supabase necessário, criar um validador separado para seu emissor e audiência; nunca aceitar tokens de emissores diferentes pelo mesmo decoder permissivo.

### Sessões

- [x] Extrair autenticação para serviço/middleware único, utilizado também por todas as funções públicas que hoje fazem `jwt.verify` diretamente.
- [x] Criar sessão de servidor com identificador aleatório, expiração numérica UTC, revogação, usuário e versão de autenticação. Guardar hash da credencial, não seu valor reutilizável.
- [x] Validar usuário ativo, sessão vigente e permissões atuais em cada requisição; falha de consulta ao banco deve negar acesso, sem continuar silenciosamente.
- [x] Logout revoga a sessão atual. Redefinição de senha, bloqueio e mudança de perfil revogam as sessões afetadas; exclusão desabilita todas.
- [x] Eliminar credenciais duradouras do `localStorage`. Contrato final recomendado para as SPAs: cookie de sessão `HttpOnly`, `Secure`, host-only e `SameSite=Lax`, com proteção CSRF nas escritas e validação de origem.
- [ ] Usar proxy para manter API e interface sob o mesmo site na produção. Confirmar a topologia de cada portal antes do rollout; se sites distintos forem indispensáveis, definir solução de sessão/proxy específica e testar o comportamento dos navegadores, sem liberar CORS/cookies indiscriminadamente.
- [ ] Durante a transição, primeiro introduzir revogação efetiva para as credenciais novas; depois publicar clientes com cookies e retirar o suporte a bearer legado. Revogar todas as credenciais antigas na mudança, exigindo novo login.
- [ ] Centralizar chamadas HTTP nas duas interfaces (`credentials`, CSRF, erro 401/403 e logout) e remover os múltiplos nomes de token armazenado.

### Senhas, recuperação e 2FA

- [ ] Unificar mudança de senha para equipe, master e atleta. Exigir senha atual ou reautenticação verificada; operações master também exigem o segundo fator configurado. Rota de perfil de atleta deve rejeitar conta de gestão.
- [ ] Remover senhas fixas de criação/reset. Criar convite aleatório, de uso único e validade curta, com conta indisponível até ativação.
- [x] Armazenar recuperação por hash, finalidade, usuário, expiração UTC numérica, contador de tentativas e consumo atômico. Invalidar pedidos anteriores ao emitir novo pedido.
- [x] Trocar geração de códigos baseada em aleatoriedade inadequada por gerador criptográfico, se presente; limitar tentativas por desafio e por conta.
- [ ] Aplicar política consistente de senha e limites compatíveis com o algoritmo de hash, inclusive o limite em bytes do bcrypt, evitando truncamento silencioso.
- [ ] Remover segredo TOTP compartilhado e migração que o atribui automaticamente. Provisionar segredo individual, confirmação do cadastro e recuperação segura; contas com segredo padrão precisam de novo provisionamento.
- [ ] Usar respostas genéricas na recuperação para não revelar se o e-mail existe. Logs não devem conter código/token.

**Novos componentes propostos:** serviço de sessões, política de autorização, validador de identidade externa, serviço de credenciais/recuperação e cliente HTTP em cada frontend. Ajustar os nomes à organização do repositório na implementação.

**Aceite:** token Google falso, expirado ou de outro app é rejeitado; identidade legítima entra. Credencial revogada falha imediatamente em rotas administrativas e públicas. Token expirado no mesmo dia UTC falha; duas redefinições simultâneas com o mesmo token produzem um único sucesso. Mudança de senha master não pode ocorrer pela rota de atleta.

## 3. Isolar clientes e tornar o checkout seguro

### Vínculo entre conta, arena e cliente

- [x] Modelar explicitamente vínculo entre `usuario_id`, `tenant_id` e `cliente_id`; manter conta universal com cadastros separados por arena.
- [x] Filtrar todas as buscas de cadastro por arena. Retirar busca global por e-mail/CPF dos helpers de checkout e recuperação de colisão.
- [ ] Não inferir vínculo pela coincidência entre `Usuarios.id` e `Clientes.id`, telefone informado ou e-mail não verificado.
- [ ] Contatos fornecidos no checkout anônimo pertencem àquela reserva; não sobrescrevem cadastro de terceiro. Associação posterior à conta exige prova verificada.
- [ ] Revisar consultas de perfil, minhas reservas, Pix, status, cancelamento, exclusão de conta, recibos e grade usando a mesma política de propriedade.
- [ ] Conferir o slug contra o tenant real em todas as rotas que o recebem. A rota de status sem slug exige a mesma prova de acesso.
- [ ] Definir respostas explícitas por finalidade, sem `SELECT *` repassado diretamente à API; limitar CPF, telefone, e-mail e referências internas ao mínimo necessário.

### Checkout sem login

- [x] Preservar checkout de visitante mediante um segredo aleatório específico da reserva/grupo, emitido na criação e armazenado no servidor por hash.
- [x] Limitar o segredo ao tenant, objeto, ações e expiração; transmitir por cookie restrito ou cabeçalho, sem query string, logs, ferramentas de analytics ou URL de QR externo.
- [x] O segredo permite consultar apenas aquela compra, recuperar sua cobrança e desistir enquanto permitido; não concede histórico, alteração de cadastro, exclusão de conta ou acesso financeiro administrativo.
- [ ] Recuperação de reserva fora dessa sessão exige login/vinculação ou verificação de posse do contato. Conhecer telefone e ID não basta.
- [ ] Desistência deve verificar saldo, estado de cobrança e possíveis pagamentos em processamento. Resolver a corrida com aprovação tardia por reconciliação/reembolso, sem disponibilizar silenciosamente uma reserva já paga.

### Preço e disponibilidade

- [ ] Serviço único de criação/validação para portal, balcão e APIs: quadra existente, ativa e do tenant, cliente autorizado, data/hora válida, duração positiva, funcionamento, bloqueios, conflitos, esporte permitido e limite de itens.
- [ ] Calcular preço no servidor a partir da tarifa vigente, duração/unidade de venda e regras de desconto. Fixar a unidade de cobrança já usada pelo produto e cobri-la com testes para não alterar preços inadvertidamente.
- [ ] Cliente/visitante não define `valor_total`, status, cliente de terceiro ou pagamento de balcão. Descontos administrativos usam regra e justificativa, nunca um valor livre sem autorização.
- [ ] Validar todo o lote antes de escrever e impedir sobreposição sob concorrência em transação. Remover o preço padrão quando a quadra não existe.

**Arquivos:** `publicController.js`, `publicRoutes.js`, `clientesController.js`, `reservasController.js`, `bookingPrice.js`, `gatewayAuthorization.js`, telas de checkout, reservas, perfil e Pix das duas interfaces.

**Aceite:** conhecer CPF, telefone, e-mail, ID ou slug não permite acessar/alterar terceiro. Cadastro na arena A não altera a B. Duas tentativas simultâneas de reservar o mesmo horário resultam em uma reserva. Quadra inválida/inativa/bloqueada é rejeitada. Fluxo de visitante legítimo continua funcionando com seu segredo limitado.

## 4. Corrigir a consistência financeira

### Contrato e armazenamento

- [ ] Definir valores monetários em centavos inteiros e validar finitude, sinal, limites e moeda. Rejeitar `NaN`, infinito, textos parciais e valores com precisão indevida.
- [ ] Criar intenção de cobrança contendo tenant, reserva/grupo, valor esperado, moeda, conta recebedora, chave de idempotência e estado.
- [ ] Associar pagamento ao identificador do provedor com unicidade no escopo correto de provedor/conta; eventos de pagamento, reembolso e disputa têm identidades e estados próprios.
- [x] Modelar alocação do pagamento às reservas do grupo. A soma alocada não excede o crédito real; uma reserva só fica paga quando sua obrigação estiver coberta.

### Criação e repetição

- [ ] A mesma tentativa de checkout usa a mesma intenção/chave, inclusive após timeout, duplo clique e retry. Uma intenção não pode ser reutilizada com valor/tenant/corpo diferente.
- [ ] Recuperar Pix reutiliza a cobrança válida e o saldo do escopo correto. Nova tentativa fica explicitamente associada à anterior, incluindo tratamento de aprovação tardia.
- [ ] Reservar intenção local antes de chamar o provedor; manter a chamada de rede fora da transação SQLite; finalizar/reconciliar usando a mesma chave persistida.
- [ ] Aplicar a regra também a cartão, maquineta e faturas SaaS. Pagamentos confirmados pela resposta imediata e por webhook usam a mesma rotina de liquidação.

### Webhook e liquidação

- [ ] Validar autenticidade conforme o contrato vigente do Mercado Pago para cada tipo de integração, com configuração obrigatória em produção. Verificar conta/evento/valor/moeda e correspondência com a intenção consultando o provedor.
- [ ] Não confiar em `approved` ou valores recebidos do cliente. Rejeitar referências desconhecidas sem iniciar trabalho ilimitado.
- [x] Executar mudança de estado, criação do lançamento, alocação e saldo em uma transação com aquisição atômica e restrição única. Inserção duplicada conhecida é tratada como evento já processado.
- [x] Em SQLite, garantir que operações de outras requisições não entrem acidentalmente na mesma transação da conexão compartilhada: usar executor que possua a conexão durante a unidade de trabalho ou conexão dedicada. Um mutex apenas no processo não substitui unicidade e transação no banco.
- [ ] Implementar rollback e recuperação de falha após cada ponto de escrita. E-mails/auditoria externa são disparados após commit, por fila/outbox com deduplicação.
- [ ] Persistir evento validado antes de confirmar recebimento, ou responder conforme a política de retry documentada do provedor. Não responder sucesso a falha transitória sem mecanismo de recuperação.

### Grupos, cancelamento, estorno e SaaS

- [x] Remover o UPDATE que marca todo grupo como Pago após qualquer crédito. Recalcular cada reserva pela sua alocação e o grupo pela soma das obrigações.
- [ ] Preservar a política de sinal/pagamento parcial, caso exista, diferenciando autorização para confirmar a reserva de quitação financeira.
- [ ] Diferenciar lançamento manual de estorno e devolução de pagamento online. Online só é exibido como reembolsado após confirmação do provedor; enquanto isso, estado pendente com retry/reconciliação.
- [ ] Impedir estorno acima do saldo realmente recebido e ainda estornável, inclusive em duas requisições simultâneas. Persistir chave idempotente da devolução.
- [ ] Tratar aprovação tardia após expiração/cancelamento, refund parcial/total, chargeback e eventos fora de ordem. Não reabrir vaga já ocupada nem ressuscitar cobrança estornada por repetição de evento antigo.
- [ ] Reconciliar regularmente intenções pendentes/ambíguas com o provedor; detectar duplicidades sem creditar novamente.
- [ ] Em SaaS, validar a fatura, valor, plano e conta master, aplicar liquidação uma vez e recalcular inadimplência global antes de reativar arena; pagar uma fatura não deve apagar outras pendências.

**Arquivos:** `gatewayService.js`, `gatewayRoutes.js`, `pagamentosController.js`, `publicController.js`, `saasBillingService.js`, `saasController.js`, `tenantAssinaturaRoutes.js`, jobs e telas financeiras.

**Aceite:** cinco ou mais webhooks simultâneos de R$ 100 geram um único crédito de R$ 100. R$ 1 num grupo de R$ 200 não quita outro horário. Retry após timeout não cria segunda intenção. Estorno/chargeback ajusta o saldo uma vez; falha no provedor não produz recibo de devolução concluída. Validar esses casos com fixtures e depois com a conta sandbox do provedor.

## 5. Proteger arquivos, navegador e recursos do servidor

- [x] Upload com lista fechada de formatos raster, verificação dos bytes, limite de tamanho/dimensões e recodificação. Gerar extensão e nome no servidor. Rejeitar HTML/SVG ativo e formato declarado que não corresponde ao conteúdo.
- [ ] Inventariar uploads antigos e colocar arquivos incompatíveis em quarentena antes de bloquear os formatos; preservar associação das capas válidas.
- [x] Servir mídia em origem sem sessão, com tipo correto, `nosniff` e política restritiva; impedir execução de conteúdo ativo. Enquanto origem separada não estiver pronta, aplicar os mesmos bloqueios no servidor de arquivos.
- [ ] Aplicar CSP e proteção de enquadramento adequadas às integrações necessárias; usar nonce/hash quando necessário. Homologar Google e pagamentos para evitar liberação ampla de scripts.
- [ ] Remover segredos do frontend e do armazenamento JavaScript; evitar interpolação de dados não escapados em HTML de e-mails/recibos. Revisar URLs, protocolo e destinos de links fornecidos por usuário.
- [ ] Gerar QR Pix localmente em biblioteca/código controlado, evitando enviar payload financeiro a um serviço externo de QR desnecessário.
- [ ] Limites globais e por operação: login, cadastro, recuperação, desafios, checkout, upload, cobranças e webhook; combinar IP com conta/tenant/objeto e usar armazenamento compartilhado se houver várias instâncias.
- [ ] Limitar corpo JSON por rota, quantidade de itens, páginas e intervalos de relatórios; impor timeout e limite de concorrência nas chamadas externas. Retry de operação financeira exige idempotência persistida.
- [ ] Configurar `trust proxy` conforme os proxies reais; bloquear acesso direto ao processo quando depender do proxy e testar IP forjado.
- [ ] Configuração central validada na inicialização: segredo forte sem fallback, modo produção explícito, URLs canônicas HTTPS de frontend/API/OAuth, origens permitidas e credenciais necessárias aos recursos habilitados.
- [ ] OAuth permanece com callback público, mas state opaco aleatório, de uso único e expiração curta, vinculado ao usuário/tenant. Revalidar usuário ativo e permissão ao consumir; exigir URL de retorno configurada em produção e nenhum segredo na URL/resposta. Não trocar state opaco por tenant em query.
- [ ] Armazenar segredos de integração e 2FA com criptografia autenticada e chave versionada fora do banco, ou serviço de segredos do deploy. Definir rotação e acesso mínimo; nunca incluir a chave de cifragem no mesmo backup de dados.
- [ ] HTTPS e redirecionamento no proxy, HSTS depois de confirmar HTTPS em todos os domínios, acesso mínimo ao SQLite/backups e ausência de `.env`, banco e sourcemaps sensíveis nas pastas públicas.
- [ ] Verificar uso/políticas do Supabase: nunca entregar service role ao navegador; se houver tabelas/buckets acessíveis, validar permissões e isolamento por identidade/tenant com credencial anônima e de usuário.

**Aceite:** arquivo com HTML disfarçado é rejeitado; payload de XSS não executa no navegador; escrita sem CSRF/origem válida falha no contrato por cookies; limites são exercitados com modo de produção; inicialização insegura falha com erro sem expor segredo. O callback OAuth legítimo continua funcionando.

## 6. Atualizar dependências e migrar com preservação do histórico

### Dependências

- [ ] Mapear os caminhos que introduzem `ip-address`, `nodemailer`, `qs`, `tar`, `undici`, `react-router`, `react-router-dom` e `ws`.
- [ ] Selecionar versões corrigidas compatíveis consultando avisos e changelogs no momento da implementação; atualizar manifests/lockfiles de forma controlada. Evitar `audit fix --force` sem avaliação.
- [ ] Auditar também ferramentas de build/desenvolvimento e impedir publicação de dev servers. Registrar o que é executável em produção e o que só existe no processo de instalação.
- [ ] Remover dependências desnecessárias, incluindo integrações não usadas. Rodar auditoria novamente e documentar avisos remanescentes com alcance técnico e tratamento, sem esconder severidade no CI.

### Migrações propostas

| Estrutura | Alteração |
| --- | --- |
| Usuários/sessões | Sessão revogável por hash, versão de autenticação, expiração UTC e flags de ativação/reautenticação |
| Identidades externas | Provedor + subject único, usuário vinculado e evidência de verificação |
| Vínculos multiarena | Relação explícita usuário/tenant/cliente, com unicidade da relação e integridade de arena |
| Recuperação/convites | Hash, finalidade, expiração, tentativas e consumo atômico |
| Acesso de visitante | Hash da capacidade, tenant, reserva/grupo, escopo, expiração e revogação |
| Cobranças/eventos | Intenção, chave idempotente, conta/provedor, referência, estado, valor em centavos e eventos deduplicados |
| Pagamentos/alocações | Referência única ao crédito online, alocação por reserva, estornos ligados ao original e valores em centavos |
| Integrações | Segredos cifrados ou referências ao gerenciador de segredos, com versão da chave |

- [ ] Implementar migrações versionadas e verificáveis. Remover de `init_db.js` correções monetárias ad hoc por ID e atribuição de segredos/senhas padrão.
- [ ] Antes de constraints novas, gerar relatório de duplicidades, vínculos entre arenas, pagamentos sem referência, grupos com saldo inconsistente, contas SuperAdmin e segredos padrão.
- [ ] Preparar backfill determinístico e modo de simulação que apenas reporte mudanças; nunca fundir contas por e-mail/CPF sem prova.
- [ ] Preservar histórico financeiro. Duplicidades e divergências não são apagadas silenciosamente nem geram devolução automática; produzir propostas de ajustes rastreáveis após conciliação.
- [ ] Ativar integridade referencial em cada conexão após tratar os dados existentes; quando possível, usar referências/constraints que validem também tenant, não apenas existência do ID.
- [ ] Testar migração com snapshot anonimizado, execução repetida, interrupção e restauração. Verificar contagens e somas antes/depois, inclusive conversão para centavos.
- [ ] Criar backup consistente e testar restauração antes da migração real. Tratar eventos recebidos durante manutenção por persistência/retry e reconciliação posterior.

**Aceite:** dados válidos mantêm seus vínculos e saldos; inconsistências geram relatório explícito. Nenhuma migração depende de IDs fixos de demonstração. Todas as estruturas são criadas tanto em banco novo quanto em atualização de banco antigo.

## 7. Homologar e publicar com critérios de saída

- [ ] Executar regressões de segurança e suítes funcionais do backend e das duas interfaces; TypeScript, lint e build de produção nas interfaces.
- [ ] E2E de conta/ativação, Google, senha/2FA, sessão revogada, troca de arena, reserva de visitante, Pix, cartão/maquineta disponíveis, pagamento parcial, estorno e assinatura SaaS.
- [ ] Usar as rotas registradas para produção nos testes. Simular assinatura/eventos do provedor de forma fiel; validar integração real apenas em sandbox de pagamento.
- [ ] Testar falha de rede, banco ocupado, processo interrompido, eventos duplicados/fora de ordem e recuperação de jobs.
- [ ] Validar infraestrutura publicada: TLS, headers, CORS, CSRF, IP/proxy, armazenamento de sessão, uploads, portas, arquivos públicos, backups e Supabase quando usado.
- [ ] Revisar usuários privilegiados e eventos suspeitos. Preparar rotação de JWT/sessões, segredos OAuth, webhook e token master potencialmente expostos, com sequência que permita reconectar integrações e processar pagamentos pendentes.
- [ ] Publicar backend e interfaces em sequência compatível; revogar sessões legadas e comunicar novo login. Não manter rotas inseguras como compatibilidade para clientes antigos.
- [ ] Monitorar promoção de perfis, leitura/alteração de integração, falhas de identidade, acesso negado, duplicação de eventos, saldos e reembolsos pendentes, sem registrar PII/credenciais desnecessárias.
- [ ] Plano de contingência: interromper escritas afetadas, manter captura/retry de notificações e corrigir adiante. Restaurar snapshot financeiro antigo só após conciliar eventos novos; nunca fazer rollback que reabra endpoints vulneráveis ou apague transferências posteriores.

**Ações externas:** publicação, mudanças no proxy/contas do provedor e rotação real continuam como entregas operacionais pendentes de comprovação. Esta atualização registra o código e a validação local; não confirma execução dessas ações.

## Matriz de cobertura da auditoria

| Problema citado | Etapa | Prova de encerramento |
| --- | --- | --- |
| 1. Escalada SuperAdmin e segredos master | 1, 2, 7 | Promoção negada; master inacessível; nenhum segredo retornado |
| 2. Credencial Google falsa | 2 | Assinatura/iss/aud/exp errados rejeitados e login legítimo aprovado |
| 3. Cliente lança pagamento/lê administração | 1, 3 | Sem efeitos financeiros/dados de terceiros pela mesma requisição da auditoria |
| 4. Reserva gratuita e cliente de outra arena | 1, 3 | Preço calculado e vínculo validado no servidor |
| 5. Histórico/CPF por telefone | 1, 3 | Consulta anônima e identidade de terceiro não obtêm dados |
| 6. Checkout altera cadastro de outra arena | 3, 6 | Fixture de outra arena permanece idêntica |
| 7. Cancelamento/status/Pix sem propriedade | 1, 3 | Capacidade/sessão exigida em todos os caminhos e slug validado |
| 8. Duplicação por webhook concorrente | 4 | Um crédito de R$ 100 após vários eventos simultâneos |
| 9. Pagamento parcial quita grupo | 4 | R$ 1 não quita reserva de R$ 100 sem alocação suficiente |
| 10. Sessão continua após revogação | 2 | Mesma credencial falha após logout/bloqueio/reset/rebaixamento |
| 11. Reset expirado | 2 | Expiração no mesmo dia e replay concorrente rejeitados |
| JWT padrão, senhas/2FA compartilhados | 1, 2, 5, 6 | Startup sem segredo rejeitado; nenhum default utilizável |
| Upload ativo e localStorage | 2, 5 | Conteúdo rejeitado, sessão fora de JS e proteção CSRF testada |
| Abuso, proxy e timeout | 5, 7 | Limites efetivos sem IP forjável no deploy; falhas externas limitadas |
| Assinatura webhook e simulação | 1, 4, 5 | Evento inválido rejeitado; nenhuma simulação em produção |
| Cobrança repetida e estorno/chargeback | 4 | Mesma intenção única e reconciliação de eventos posteriores |
| Agenda inválida e concorrência | 3, 4 | Quadra/horário inválidos rejeitados e reserva concorrente única |
| HTTPS/CSP/arquivos/Supabase | 5, 7 | Verificação de infraestrutura e acesso com credenciais de menor privilégio |
| Dependências sinalizadas | 6 | Avisos corrigidos ou alcance/remediação documentados, com regressões |
| Testes que passavam sem comprovar segurança | 0, 7 | Assertivas sobre autorização, banco, navegador e rotas reais |
| Dados históricos possivelmente afetados | 6, 7 | Relatório conciliado, ajustes rastreáveis e restauração testada |

## Definição de concluído

1. Todas as reproduções da auditoria deixam de produzir o efeito indevido e passam nas expectativas seguras, com testes positivos equivalentes.
2. Nenhuma falha crítica/alta confirmada permanece aberta; riscos adicionais são corrigidos ou verificados como não aplicáveis com evidência específica do deploy.
3. Saldos e estados financeiros são consistentes sob concorrência e após falhas/repetições; dados legados são conciliados.
4. Fluxos legítimos das duas interfaces e integração sandbox funcionam; testes, TypeScript, lint e builds requeridos passam.
5. Migrações, credenciais, infraestrutura e monitoramento foram validados. O relatório final identifica revisão publicada, testes executados e limites da avaliação.

O estado "corrigido localmente" deve ser distinguido de "publicado e validado em produção" durante toda a execução.
