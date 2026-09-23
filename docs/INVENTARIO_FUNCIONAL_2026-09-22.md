# Inventário funcional do Arenix — 22/09/2026

Mapeamento dos módulos das telas, endpoints e principais regras de negócio do
repositório. Não é uma certificação de cada interação nem um teste de invasão.
Uma rota existente não prova homologação do provedor. O apêndice de rotas permite
conferir a abrangência; as observações abaixo distinguem implementação e limites.

## Perfis e acesso

Fonte: `backend/src/utils/permissions.js`, rotas e `sessionService.js`.

| Perfil | Capacidades e limites principais |
|---|---|
| SuperAdmin/Master | Administração SaaS global protegida por MFA; não herda automaticamente as permissões internas das arenas. |
| Administrador da arena | Operação da própria arena, equipe, configurações, descontos, estornos, auditoria e transferência de administração com reautenticação. |
| Gerente | Operação, relatórios, assinatura e configurações; gerencia recepcionistas. Sem autorização de administrador para estornar ou transferir administração. |
| Recepcionista | Agenda, clientes, consulta financeira e recebimentos manuais. Sem gestão de bloqueios, descontos, estornos ou configuração de gateway. |
| Cliente/atleta | Acesso às próprias reservas e perfil, com vínculos por arena; não recebe permissões de funcionário. |
| Visitante | Checkout público e acesso restrito ao pedido por credencial de visitante; não ganha acesso geral às reservas. |

## Painel da arena

Fontes: `frontend/src/screens/admin/`, `reservasController.js`,
`quadrasController.js`, `clientesController.js`, `pagamentosController.js`,
`relatoriosController.js`, `bookingService.js`, `bookingPrice.js` e rotas correspondentes.

| Área | Funcionalidades encontradas | Regras/limites relevantes |
|---|---|---|
| Dashboard | Resumo diário, grade do dia, próximas reservas, faturamento, inadimplência, situação das quadras e avisos. | Dados limitados à arena autenticada. |
| Agenda | Visualização diária e semanal, filtros, seleção de horários, detalhes de reserva e situação de pagamento. | Visualização semanal não significa contrato recorrente. |
| Reservas | Criação interna e em lote, vínculo com cliente, esporte e agrupamento dos horários. | Lote limitado a 24 horários; preço calculado no servidor. |
| Disponibilidade | Validação de data, horário, funcionamento, quadra ativa, conflitos e duplicação no pedido. | Validações e inserções de reservas usam transação. |
| Preços | Preço por modalidade e cálculo proporcional à duração. | Não foi identificado motor de preço dinâmico por demanda. |
| Descontos | Ajuste autorizado com justificativa na criação e operação específica de desconto. | Administrador/gerente; recepcionista não pode conceder desconto. |
| Cancelamento | Cancelar reserva, registrar motivo e coordenar reserva paga com estorno/conciliação. | Pagamento ambíguo não deve liberar a obrigação sem resolução. |
| Bloqueios | Criar bloqueio de quadra; remover integralmente ou abrir intervalo/horário. | URLs de quadras e reservas unificadas nesta revisão; pertencimento e perfil verificados. |
| Recebimentos | Consulta de saldo, histórico, registros manuais e pagamentos parciais. | Valores em centavos no banco; prevenção de cobrança acima do saldo. |
| Gateway | Cobrança Pix, caminhos de cartão e maquineta, consulta de situação, estorno e conexão OAuth da arena. | Integrações completas ainda dependem da homologação externa. |
| Pix direto | Configuração de chave, titular e cidade; geração de QR estático quando aplicável. | Não confundir QR estático com confirmação automática pelo provedor. |
| Clientes | Cadastro, edição, pesquisa, detalhes/histórico, arquivamento e desarquivamento. | Vínculo limitado à arena. |
| Identidade do cliente | Aprovar/rejeitar associações pendentes entre conta e cadastro de cliente. | Associação não é concedida automaticamente por coincidência de dados. |
| Quadras | Cadastro, edição, status, modalidades, preços e horários de funcionamento. | Limite do plano; exclusão pode preservar histórico por arquivamento. |
| Equipe | Criar/editar/remover acessos conforme hierarquia e limites. | Convite/recuperação individual; sem senha padrão compartilhada. |
| Arena | Dados, slug, fuso, horários, foto de capa e aparência. | Upload com processamento de imagem; publicação final ainda precisa ser verificada. |
| Notificações | Preferências de e-mail para reserva, cancelamento e pagamento; orientação de compartilhamento manual por WhatsApp. | WhatsApp usa mensagem pronta no compartilhamento do portal, com envio confirmado pelo usuário. |
| Auditoria | Listagem e filtros de eventos, detalhes e exportação na interface. | Acesso de administrador; registro de eventos não equivale a armazenamento inviolável. |

### Relatórios

Oito endpoints em `relatoriosRoutes.js`: **faturamento, ocupação, reservas,
inadimplência, cancelamentos, formas de pagamento, horários de pico e top clientes**.
Há filtros por período e paginação, período máximo de 366 dias e limite de 100
registros por página no controlador. A interface exporta CSV da página para cinco
visões: faturamento, ocupação, reservas, inadimplência e cancelamentos. Não anunciar
exportação integral de todos os relatórios como se já existisse.

### Assinatura da arena

Fontes: `AdminAssinatura.tsx`, `tenantAssinaturaRoutes.js`, `saasBillingService.js`.

- Plano contratado, limites/uso de quadras e usuários, trial e dias restantes.
- Ciclo mensal/anual, vigência, cobertura, próximo vencimento e competências.
- Histórico de faturas, geração de Pix e consulta do pagamento.
- Planos disponíveis, solicitação de upgrade e adiantamento de faturas.
- Recibo de fatura; caminhos de simulação condicionados ao ambiente.
- Cobrança da assinatura da **arena** é distinta da cobrança recorrente de atletas.

## Portal do atleta e páginas públicas

Fontes: `tela cliente/src/App.tsx`, seus componentes, `publicController.js`,
`publicRoutes.js` e `frontend/src/screens/public/`.

| Área | Funcionalidades encontradas | Observação |
|---|---|---|
| Página da arena | Identidade, capa, informações e contato da arena por slug. | Há links manuais para WhatsApp. |
| Reserva | Seleção de esporte, quadra, data e múltiplos horários; agrupamento manhã/tarde/noite e resumo de preço. | Servidor recalcula preço e valida disponibilidade. |
| Checkout | Dados do contato, confirmação do pedido e criação de reserva. | Há tratamento de visitante e de cliente autenticado. |
| Pix | QR/copia e cola, acompanhamento do estado e retomada de reserva pendente. | Confirmação externa ainda não homologada para o fluxo atual. |
| Conta | Cadastro, login por senha e Google, recuperação/redefinição de senha e logout. | Google precisa de origem/client ID válidos no ambiente publicado. |
| Minhas reservas | Histórico, situação, pagamento pendente, cancelamento e contato com a arena. | Acesso restrito ao titular; acesso de visitante tem escopo próprio. |
| Perfil | Alteração dos dados pessoais e senha, solicitação de exclusão da conta. | A existência da tela de privacidade não certifica conformidade jurídica. |
| Site comercial | Landing page, preços mensal/anual, cadastro de arena e checkout de plano. | Algumas promessas e contatos precisam de revisão, abaixo. |

Existem duas superfícies públicas: as telas em `frontend` e o aplicativo separado
`tela cliente`. O template de publicação prevê o aplicativo em `/athlete/` e acesso
por `/arena/`; ambos precisam de teste de URLs diretas e assets na hospedagem.

## Painel Master

Fontes: oito entradas de navegação em `navigation.ts`, telas `Master*.tsx`,
`saasRoutes.js`, `saasController.js` e serviços de credenciais/recuperação.

| Módulo | Funcionalidades encontradas |
|---|---|
| Autenticação | Login Master, configuração/confirmação de MFA e troca de senha com verificação adicional. |
| Dashboard | Métricas globais de arenas, clientes, reservas, faturamento/receita recorrente e indicadores. |
| Arenas | Listar, pesquisar, filtrar, cadastrar, editar, bloquear/desbloquear, excluir e consultar detalhes. |
| Detalhe da arena | Dados, administrador, plano e faturas; alteração de plano e situação conforme rotas. |
| Planos | Editar preço mensal/anual e limites de quadras/usuários. |
| Financeiro | Faturas globais/por arena, filtros, indicadores e registro de pagamento autorizado. |
| Usuários | Listagem global, filtros, ativar/desativar, solicitar recuperação e consultar acessos. |
| Comunicação | Mensagem individual ou geral, banner/comunicado com expiração, remoção e caminho de envio de e-mail. |
| Auditoria | Eventos globais e inspeção por arena; filtros conectados aos dados dos logs nesta revisão. |
| Sessões | Resumo de usuários com sessões válidas por arena/contas sem arena; migrado de SessoesAtivas para AuthSessions nesta revisão. Não mede presença online em tempo real. |
| Configurações | Trial, manutenção, mensagem global, motivos de cancelamento e credenciais Mercado Pago. |
| Credenciais | Indicação de presença, gravação cifrada e remoção com reautenticação; não expor valor privado à interface. |
| Operação SaaS | Acionar verificação de inadimplência; tarefas de cobrança e reconciliação no backend. |

## Rotinas e sustentação técnica

- Geração de faturas SaaS, aviso de vencimento, bloqueio por inadimplência e limpeza
  de cadastros abandonados (`backend/src/jobs/`).
- Intenções de pagamento e estorno, conciliação de resultados ambíguos, busca de
  pagamento sem referência e outbox de revisão/auditoria.
- Sessões em cookies, CSRF, hierarquia por perfil, isolamento por arena e MFA Master.
- Identidade Google, vínculo de cliente, convite/ativação e recuperação de senha.
- Cifragem de segredos, rotação transacional, backup SQLite, bloqueio de arquivos
  privados e verificação dos builds.
- Scripts de testes e validação; novo `npm run check:local` somente leitura, sem rede,
  para conferir integridade, inconsistências, cifragem e contagem de filas.

## Pontos parciais e limites que a comparação comercial deve respeitar

1. **WhatsApp — escopo confirmado pelo responsável:** envio manual, com modelo
   pronto no botão de compartilhar o portal. A opção que sugeria confirmação
   automática foi retirada da tela; links manuais foram preservados. O campo legado
   do banco não foi apagado. Envio automático não é pendência de implementação.
2. **Mensalistas de quadra — retirado do escopo pelo responsável:** removidas as
   promessas de mensalistas e recorrência de atletas da landing, checkout e login.
   Agenda semanal, reservas avulsas/em lote e assinatura recorrente SaaS permanecem.
3. **Enterprise — corrigido:** site e painel usam o contato comercial informado
   pelo responsável, centralizado em `frontend/src/utils/commercialContact.ts`.
   O WhatsApp abre com mensagem pronta; nada é enviado automaticamente.
4. **Filtro Trial — corrigido:** API retorna `em_trial` usando expiração e fuso da
   arena, inclusive o último dia, apenas para arenas ativas. Lista identifica
   "Em teste"; filtro Trial seleciona essas arenas. Ativas continua incluindo as
   ativas em teste. Cobrança e status persistidos não são alterados pelo filtro.
5. **Integrações:** presença de código Google, Pix/cartão/Point e SMTP não demonstra
   funcionamento de ponta a ponta no endereço final. Provedores não foram chamados
   nesta passagem para criar cobranças, estornos ou enviar mensagens.
6. **Monitoramento:** auditoria e jobs existem; não foi configurado monitor externo
   de disponibilidade, entrega de alertas ou procedimento validado na hospedagem.
7. **Módulos não identificados nesta revisão:** torneios/chaves esportivas, ranking
   esportivo, turmas/aulas com matrícula, PDV/comanda/cozinha/estoque, cupons e
   marketplace de descoberta de arenas. Top clientes financeiro não é ranking esportivo.

Os pontos 1–4 foram encaminhados conforme definição explícita do responsável;
não continuam como pendências. A falha de autorização de bloqueios também foi
corrigida com testes nesta passagem.
O inventário permite uma comparação comercial mais completa, mas preços e vantagem
competitiva ainda precisam de pesquisa específica e validação com donos de arenas.

## Apendice: rotas declaradas

Caminhos relativos ao router; prefixos de montagem em `backend/src/app.js`.
Listagem extraida do codigo, nao evidencia de autorizacao individual.

### arenasRoutes.js

- `GET /minha`
- `PUT /minha`
- `POST /upload-capa`

### auditoriaRoutes.js

- `GET /`

### authRoutes.js

- `POST /login`
- `POST /register`
- `POST /alterar-senha`
- `POST /logout`
- `POST /forgot-password`
- `POST /reset-password`
- `GET /planos`
- `GET /manutencao`
- `GET /me`
- `GET /comunicados/ativos`
- `POST /mfa/setup`
- `POST /mfa/confirm`

### clientesRoutes.js

- `GET /vinculos-pendentes`
- `POST /vinculos-pendentes/:usuario_id/:cliente_id/aprovar`
- `POST /vinculos-pendentes/:usuario_id/:cliente_id/rejeitar`
- `GET /`
- `POST /`
- `GET /:id`
- `PUT /:id`
- `DELETE /:id`
- `PATCH /:id/arquivar`
- `PATCH /:id/desarquivar`

### dashboardRoutes.js

- `GET /resumo`

### gatewayRoutes.js

- `POST /cobranca`
- `GET /status/:reserva_id`
- `POST /simular-pagamento`
- `GET /maquineta`
- `POST /maquineta`
- `POST /webhook`
- `GET /oauth/url`
- `GET /oauth/callback`
- `POST /oauth/exchange`
- `POST /oauth/desconectar`

### motivosRoutes.js

- `GET /`
- `POST /`
- `DELETE /:id`

### pagamentosRoutes.js

- `GET /resumo`
- `GET /reservas`
- `GET /reserva/:reserva_id`
- `POST /`
- `POST /desconto`
- `POST /estorno`

### publicRoutes.js

- `GET /tenant/:slug`
- `GET /tenant/:slug/quadras`
- `GET /tenant/:slug/disponibilidade`
- `GET /tenant/:slug/minhas-reservas`
- `GET /tenant/:slug/status-reserva/:reserva_id`
- `GET /status-reserva/:reserva_id`
- `GET /tenant/:slug/reserva-pix/:reserva_id`
- `POST /tenant/:slug/login`
- `POST /tenant/:slug/cadastro`
- `POST /tenant/:slug/google`
- `POST /tenant/:slug/esqueci-senha`
- `POST /tenant/:slug/redefinir-senha`
- `POST /tenant/:slug/cancelar-reserva/:id`
- `POST /tenant/:slug/excluir-conta`
- `POST /tenant/:slug/agendar`
- `POST /tenant/:slug/cancelar-pendente`
- `GET /tenant/:slug/meu-perfil`
- `PUT /tenant/:slug/meu-perfil`

### quadrasRoutes.js

- `GET /`
- `POST /`
- `PUT /:id`
- `PATCH /:id/status`
- `DELETE /:id`
- `POST /bloqueios`

### relatoriosRoutes.js

- `GET /faturamento`
- `GET /ocupacao`
- `GET /reservas`
- `GET /inadimplencia`
- `GET /cancelamentos`
- `GET /formas-pagamento`
- `GET /horarios-pico`
- `GET /top-clientes`

### reservasRoutes.js

- `GET /grade`
- `POST /`
- `POST /bloqueios`
- `DELETE /bloqueios/:id`
- `DELETE /bloqueios/:id/horario`
- `PATCH /bloqueios/:id/desbloquear-hora`
- `GET /minhas`
- `PATCH /:id/cancelar`

### saasRoutes.js

- `POST /webhook-pagamento`
- `GET /arenas`
- `POST /arenas`
- `GET /arenas/:id`
- `PUT /arenas/:id`
- `DELETE /arenas/:id`
- `PATCH /arenas/:id/status`
- `GET /planos`
- `PUT /planos/:id`
- `PATCH /arenas/:id/plano`
- `GET /arenas/:id/faturas`
- `POST /faturas/:id/pagar`
- `GET /metrics`
- `GET /faturas`
- `GET /auditoria`
- `GET /sessoes`
- `POST /alterar-senha`
- `GET /usuarios`
- `PATCH /usuarios/:id/status`
- `POST /usuarios/:id/reset-senha`
- `GET /usuarios/:id/acessos`
- `GET /comunicados`
- `POST /comunicados`
- `DELETE /comunicados/:id`
- `GET /configuracoes`
- `PUT /configuracoes`
- `DELETE /credenciais/:key`
- `POST /executar-bloqueio-inadimplencia`

### tenantAssinaturaRoutes.js

- `GET /plano`
- `GET /faturas`
- `POST /faturas/:id/gerar-pix`
- `POST /faturas/:id/simular-pagamento`
- `GET /status-pagamento/:gateway_ref`
- `GET /planos-disponiveis`
- `POST /solicitar-upgrade`
- `POST /adiantar-fatura`
- `GET /faturas/:id/recibo`

### usuariosRoutes.js

- `POST /transferir-administracao`
- `GET /`
- `POST /`
- `PUT /:id`
- `DELETE /:id`
