# Roteiro executável de homologação externa

Estado: execução parcial em ambiente isolado (22/09, atualização abaixo). Não publicar nem criar pagamentos reais com base
neste roteiro. Domínio/hospedagem foram adiados pelo responsável. Os testes locais
usam respostas simuladas e o banco em memória; não suprem estas evidências.

## Início da homologação — 22/09/2026

**Atualização 19:38 BRT:** assinatura recebida e instalada cifrada no banco
isolado. Um recebimento público HTTP 200 registrado às 19:34:44, sem consulta ao
pagamento observada; conferir ID/action da simulação. Segunda notificação e
liquidação não comprovadas. Guia operacional completo em
[RETOMADA_HOMOLOGACAO_2026-09-22.md](RETOMADA_HOMOLOGACAO_2026-09-22.md), incluindo
comandos de início e estado do ensaio de cartão ainda não executado com sucesso.

### Evidências da execução isolada — 22/09, 19:31 BRT

Esta atualização prevalece sobre a inspeção inicial registrada abaixo.

- Criada cópia do código em `.local-security/homologacao/instance/backend/src`,
  com manifesto SHA-256 por arquivo. Banco novo em `instance/backend/data`, sem
  cópia de dados reais, chave de cifragem própria, SMTP sem credenciais e sem cron.
  NODE_ENV=development: não foram liberadas as rotas de simulação NODE_ENV=test.
- API local na porta 3100; painel 5183; atleta 5186. Serviços anteriores nas
  portas 3000/5173/5176 preservados. Cookies têm o mesmo nome; usar janela anônima
  para separar a sessão da aplicação habitual.
- `GET /users/me` com credencial TEST retornou HTTP 200. A conta não tem tag
  test_user; isso não invalida o uso de credenciais TEST do usuário de produção
  previsto na documentação de Checkout API. O pagamento foi conferido à parte.
- Conexão **manual** da arena de teste via rota `/maquineta`: HTTP 200, token
  armazenado cifrado e conta recebedora conferida. Isso **não aprova O01/OAuth**.
- **P01, criação Pix:** POST autenticado pela aplicação gerou pagamento fictício;
  GET posterior confirmou live_mode=false, BRL, transaction_amount=100,
  amount_cents=10000 na intenção e valor=10000 na transação. Recebedor corresponde
  à arena. Pagamento ainda pending; nenhum crédito lançado.
- Repetição da solicitação de criação retornou a cobrança existente, mantendo
  1 transação/1 intenção. Isso verifica repetição da criação, **não P03**, que exige
  repetição de webhook com liquidação.
- Login local, rejeição de webhook sem assinatura (403) e sessão rejeitada após
  logout (401) passaram. SQLite isolado: integridade ok, zero violações FK.
- O primeiro ensaio Pix foi recusado por e-mail fictício com domínio `.test`;
  corrigido para `comprador@example.com` somente na fixture isolada. Provedor
  aceitou a repetição. Não foi necessário alterar o código de cobrança.
- O launcher Vite inicialmente não resolvia o Tailwind do projeto correto e
  produzia erro bg-cream. Corrigido **no launcher de homologação** com configuração
  explícita por projeto. Chrome headless confirmou arena visível, zero overlay Vite
  e zero pageerrors; CSS dos dois portais retornou HTTP 200.
- Criado relay na porta 3110 que publica somente POST nas duas rotas de webhook.
  Túnel temporário atual: `https://taking-animal-discrimination-doe.trycloudflare.com`.
  Não é infraestrutura de produção e pode mudar quando reiniciado.
- Solicitado ao responsável: origem Google `http://localhost:5186`, tentativa de
  login no portal e configuração do webhook de teste no MP. Resultado Google e
  assinatura secreta de webhook ainda aguardados. Nenhum webhook autenticado do
  provedor foi confirmado; P02/P03, falhas, estorno e SaaS ainda pendentes.
- Conferência somente leitura do banco habitual: integridade ok, nenhum achado
  financeiro pendente, 4 segredos legíveis e zero a migrar. Nenhuma alteração foi
  feita nesse banco por estes scripts de homologação.

Evidências privadas, sem versionamento: `.local-security/homologacao/credential-check.json`,
`flow-check.json`, `payment-check.json`, `portal.png` e
`instance/provider-checks.jsonl`. Não copiar tokens, cookies ou dados dos arquivos
`instance/config.json` e `instance/login.json` para relatórios públicos.

Comandos de retomada (raiz do projeto):

```powershell
# Preparação já executada; o comando recusa sobrescrever a instância existente.
node backend/scripts/prepare_homologacao.js
# Terminais separados; não iniciar duplicados nas mesmas portas.
node backend/scripts/run_homologacao.js
node backend/scripts/serve_homologacao_ui.mjs
node backend/scripts/relay_homologacao_webhooks.js
.\cloudflared.exe tunnel --url http://127.0.0.1:3110 --no-autoupdate
# Após salvar MERCADO_PAGO_WEBHOOK_SECRET em backend/.env.homologacao:
node backend/scripts/configure_homologacao_webhook.js
# Repetíveis; --pix usa exclusivamente a reserva fictícia 1 da instância isolada.
node backend/scripts/check_homologacao_flow.js --pix
node backend/scripts/check_homologacao_payment.js
```

O acesso externo pode exigir liberação de rede do executor. O backend isolado
bloqueia chamadas fetch que não usem exatamente a credencial TEST configurada.
Essa proteção também bloqueia a troca OAuth atual; OAuth exige preparação própria
antes de O01/O02. Jobs/outbox automáticos e SMTP estão desativados no harness e
precisam de ensaio separado. Não confundir esse ambiente com teste de produção.
Não foi repetida a suíte integral nesta etapa; estas evidências são direcionadas.

### Registro anterior de preparação

Atualização: após esclarecer que inicialmente só tinha credenciais reais, o
responsável forneceu Public Key e Access Token com prefixo `TEST-` e autorizou
salvá-los. Criado `backend/.env.homologacao`, ignorado pelo Git, sem substituir
o `.env` atual. Valores não registrados neste documento. Credenciais ainda não
validadas com o provedor; nenhum pagamento criado. Foi recomendada a renovação
do Access Token por ter sido compartilhado na conversa; não foi realizada rotação.
O arquivo contém apenas credenciais, não uma instalação isolada pronta: o backend
ainda usa caminho fixo `backend/data/courtmanager.sqlite` fora de NODE_ENV=test.
Não iniciar o backend atual carregando esse arquivo para testar pagamentos.
A localização das credenciais está resolvida; isolamento e execução dos casos
abaixo continuam pendentes. Os parágrafos seguintes registram a inspeção inicial.

O responsável confirmou que já possui contas e credenciais de teste configuradas.
Foi solicitado apenas o caminho do arquivo/ambiente onde elas estão, sem pedir
valores secretos na conversa. Não presumir que o `.env` atual seja esse ambiente:
as credenciais anteriores consultaram pagamentos com `live_mode=true`.

Na inspeção, foram encontrados os `.env` normais do backend e das duas interfaces,
sem arquivo separado de sandbox identificado. Há serviços locais nas portas
3000, 5173 e 5176; não foram interrompidos nem usados para criar dados de teste.
Próximo passo dependente: localizar a configuração de teste e preparar instalação
isolada antes de realizar autenticação ou pagamentos. Nenhum caso G/O/P/S/M foi
aprovado nesta inspeção de pré-requisitos.

O Google permite cadastrar origens localhost para testes; isso não confirma que
as origens da aplicação estejam cadastradas no console. O recebimento de webhooks
exige URL acessível ao provedor, podendo ser de homologação sem definir o domínio
de produção agora. Referências:
[configuração Google](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid?hl=en),
[compra de teste MP](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-test/make-test-purchase?scope=prod).

## Antes de iniciar

- Definir instalação isolada do banco real e duas arenas de teste (A e B), com
  administrador, gerente, recepcionista e atleta de cada uma.
- Usar contas/credenciais do ambiente de teste permitido pelo provedor. Presença
  de token no `.env` e seu prefixo, isoladamente, não comprovam sandbox.
- Registrar URL, commit, horário, método de pagamento testado e resultado esperado.
  Guardar evidências privadas sem tokens, senhas, cookies, CPF ou dados de cartão.
- Conferir origens/client ID Google e callback OAuth Mercado Pago no console de
  cada provedor. Não supor que a URL antiga configurada pertence ao responsável.
- Confirmar quais métodos o ambiente de teste suporta. Se um cenário exigir dinheiro
  real, parar esse cenário e obter autorização específica de valor/conta/operação.

## Casos e evidência mínima

| Caso | Execução | Evidência exigida |
|---|---|---|
| G01 | Entrar com Google em ambas as superfícies públicas. | Conta correta, sessão em cookie, acesso ao próprio perfil e reservas. |
| G02 | Conta existente e novo usuário Google. | Vínculos por arena corretos, sem associar automaticamente cadastro alheio. |
| G03 | Logout, nova aba e recuperação por e-mail de teste. | Sessão encerrada; link de recuperação acessível e de uso único. |
| O01 | Administrador conecta sua arena ao MP. | Callback/state válidos; credencial armazenada cifrada; recebedor correto. |
| O02 | Reutilizar callback e trocar arena/usuário da sessão. | Rejeição sem trocar conexão da arena. |
| P01 | Reserva de R$ 100 no meio de teste permitido. | Provedor recebe 100 reais; banco/intenção registram 10000 centavos; moeda BRL. |
| P02 | Confirmar pelo webhook real do provedor. | Reserva, pagamento e intenção atualizados uma única vez; sem intervenção manual. |
| P03 | Repetir notificação e consultar estado. | Nenhum crédito duplicado e nenhuma cobrança adicional. |
| P04 | Falha temporária de consulta no ambiente isolado. | Evento/intenção recuperável; retry conclui após restabelecimento. Não induzir falha em produção. |
| P05 | Recusa/cancelamento e tentativa subsequente. | Sem crédito falso; saldo e disponibilidade coerentes. |
| P06 | Pagamento parcial e concorrência pelo mesmo horário. | Saldo correto; somente uma reserva ocupa o intervalo. |
| P07 | Cancelar reserva paga e executar estorno de teste autorizado. | Provedor confirma estorno; baixa única; repetição não desconta novamente. |
| P08 | Cartão/Point, caso sejam oferecidos no lançamento. | Tokenização/terminal e liquidação comprovados no produto e equipamento reais de teste. |
| S01 | Pagar fatura SaaS e testar upgrade/adiantamento. | Valor/ciclo/competência corretos; evento não quita outra arena/fatura. |
| M01 | Mensagem para caixa de e-mail de teste autorizada. | Entrega, links corretos e falha tratada; não enviar a clientes reais. |

Situação inicial de todos os casos: **pendente**. Só mudar para aprovado com
evidência da execução. Marcar não aplicável apenas se o recurso não for oferecido
no lançamento e sua indisponibilidade estiver refletida na interface/oferta.

## Quando o servidor for escolhido

1. Provisionar configuração e chaves próprias do ambiente; planejar migração dos
   segredos sem perder a chave que descriptografa os dados importados.
2. Testar TLS, proxy, porta Node fechada externamente, cookies/CSRF, headers, uploads
   e bloqueio de banco, backups, `.env` e sourcemaps pela URL pública.
3. Testar recarga direta de URLs do painel e `/arena/`, com assets do atleta em
   `/athlete/`. Templates atuais não foram instalados nem validados com Nginx.
4. Fazer backup e restaurar em instalação isolada; conferir integridade, saldos,
   leitura dos segredos, imagens/uploads e disponibilidade da chave.
5. Reiniciar serviço e máquina; verificar persistência, jobs e ausência de criação
   duplicada de faturas. Não iniciar dois workers sem modelar a concorrência.
6. Configurar monitor de disponibilidade e alertas para falhas e filas antigas;
   testar a entrega ao destinatário autorizado. Auditoria local não prova alerta externo.
7. Registrar aprovação por cenário e problemas restantes. Sem aprovação automática
   por percentual, presença de credenciais ou quantidade de testes aprovados.

Verificação local repetível: `npm.cmd run validate` e `npm.cmd run check:local`.
O segundo comando não faz chamadas externas nem inicia jobs; seu sucesso indica
apenas integridade/cifragem/relatório local, não valida as configurações de produção.
