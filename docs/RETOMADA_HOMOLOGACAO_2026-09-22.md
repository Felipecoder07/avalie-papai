# Como continuar o item 5 — homologação

## Resultado confirmado até 22/09/2026, 19:38 BRT

O item 5 **não está concluído**. Não confundir teste de integração com aprovação
para produção. Domínio/hospedagem continuam adiados.

Já executado:

- Ambiente separado, com código copiado, banco novo e chave própria dentro de
  `.local-security/homologacao/instance`. Sem copiar registros reais nem SMTP.
- Mercado Pago aceitou a credencial TEST e a conexão manual da arena de teste.
  A credencial da arena foi armazenada cifrada no banco isolado.
- Pix de teste **1328247564**, valor **R$ 100**, moeda BRL, `live_mode=false`,
  recebedor correto. Banco: intenção e transação com **10000 centavos**.
- Repetir a criação devolveu a mesma cobrança: 1 transação e 1 intenção.
- Pagamento ainda `pending`, total creditado **zero**.
- Login local, logout e rejeição de webhook sem assinatura passaram.
- Portal abriu no Chrome, sem overlay Vite nem erros JavaScript. O erro bg-cream
  foi corrigido no launcher da homologação, sem alterar o CSS do produto.
- Assinatura de webhook salva em `backend/.env.homologacao` e instalada cifrada
  no banco isolado. Não é necessário copiar a assinatura novamente.
- **Uma notificação pública registrada com HTTP 200**, às 19:34:44 BRT. O log
  antigo registra somente horário/rota/status: não demonstra por si só qual ID
  foi enviado nem liquidação. Não foi observada consulta ao pagamento nesse evento.
  A nova versão do relay registra ID/action sem assinatura ou dados pessoais;
  entra em uso no próximo início do relay.
- Banco habitual conferido somente leitura: íntegro, sem pendências financeiras
  apontadas; 4 segredos legíveis e nenhuma migração de segredo pendente.

Não houve pagamento real nem estorno real. A suíte integral não foi repetida.

## Iniciar os serviços

Use quatro terminais PowerShell, um para cada serviço. Em **cada terminal**,
primeiro execute:

```powershell
Set-Location 'C:\Users\Mateus\Downloads\Volei System'
```

Terminal 1 — API isolada:

```powershell
node backend/scripts/run_homologacao.js
```

Terminal 2 — painel e portal do atleta:

```powershell
node backend/scripts/serve_homologacao_ui.mjs
```

Terminal 3 — entrada restrita de webhooks:

```powershell
node backend/scripts/relay_homologacao_webhooks.js
```

Terminal 4 — endereço HTTPS temporário:

```powershell
.\cloudflared.exe tunnel --url http://127.0.0.1:3110 --no-autoupdate
```

Deixe os quatro terminais abertos. Se já estiverem funcionando, não inicie cópias:
erro de porta ocupada geralmente indica que um serviço já está aberto. Para
encerrar um deles, use Ctrl+C **no terminal correspondente**. Não encerre os
serviços habituais nas portas 3000/5173/5176.

O comando de preparação `prepare_homologacao.js` já foi executado e recusa
sobrescrever a instância: **não precisa rodá-lo novamente**. Não apague a pasta
privada para tentar resolver erro de inicialização.

Endereços locais:

- Painel: `http://localhost:5183`.
- Atleta: `http://localhost:5186/arena/homologacao-1`.
- Saúde da API: `http://127.0.0.1:3100/api/health`.

Use janela anônima para não misturar cookies com o sistema habitual. As
credenciais do administrador fictício estão em
`.local-security/homologacao/instance/login.json`. Esse arquivo é privado; não
enviar seu conteúdo para a conversa. Login Google usa sua conta no próprio Google.

## Conferir o Google

1. No Google Cloud, abra o cliente OAuth utilizado pelo sistema.
2. Em origens JavaScript autorizadas, inclua `http://localhost:5186`.
3. Abra o portal do atleta acima e tente entrar pelo Google.
4. Registre se entrou, se o perfil é o correto e se o logout funciona. Informe
   somente mensagens de erro, nunca o token retornado pelo Google.

Esse teste ainda está pendente. Na última consulta, ExternalIdentities tinha
zero registros no banco isolado. Se o botão não abrir a autenticação, investigar
o uso de Google One Tap (`identity.prompt`) e as restrições do navegador/origem;
não declarar login aprovado apenas porque a página abre.

## Conferir o webhook no Mercado Pago

O terminal 4 mostra um endereço `https://...trycloudflare.com`. Ele pode mudar a
cada início. O endereço da sessão anterior era:

```text
https://taking-animal-discrimination-doe.trycloudflare.com
```

1. No painel de desenvolvedor MP, abra sua aplicação → Webhooks → modo de teste.
2. Use o endereço **atual** do terminal 4, acrescentando:
   `/api/pagamentos/gateway/webhook`.
3. Selecione eventos de Pagamentos. A assinatura já foi instalada. Se o MP gerar
   outra assinatura, atualize somente `MERCADO_PAGO_WEBHOOK_SECRET` em
   `backend/.env.homologacao` e execute:

```powershell
node backend/scripts/configure_homologacao_webhook.js
```

4. Em Simular notificação, envie o pagamento **1328247564** duas vezes. Confira
   o conteúdo da simulação: o campo `data.id` precisa ser esse pagamento e a
   ação deve ser `payment.updated` ou `payment.created`.
5. Confira as evidências em um quinto terminal:

```powershell
Get-Content .local-security/homologacao/webhook-receipts.jsonl -Tail 10
Get-Content .local-security/homologacao/instance/provider-checks.jsonl -Tail 10
node backend/scripts/check_homologacao_payment.js
```

Esperado: dois recebimentos 200; consultas GET ao pagamento nas evidências do
provedor; status ainda pending e zero créditos. Se houver 200 sem consulta,
verificar ID e tipo de evento: aceite HTTP isolado não comprova processamento.
403 indica assinatura inválida/ausente; 503 exige investigar acesso ao provedor
ou processamento. Não remover a validação de assinatura para fazer o teste passar.

Essas notificações **não aprovam o Pix**. Não pagar esse QR com banco/cartão real.
O relay público expõe somente POST nas duas rotas de webhook, sem painel ou login.

## Verificações repetíveis

Com API isolada aberta:

```powershell
# GET somente; verifica a credencial, sem criar pagamentos.
node backend/scripts/check_homologacao_credentials.js
# Login, conexão manual, repetição da cobrança Pix fictícia, logout e assinatura.
node backend/scripts/check_homologacao_flow.js --pix
# GET somente e leitura do banco isolado; confere pagamento, valor e recebedor.
node backend/scripts/check_homologacao_payment.js
# Banco habitual, somente leitura; não executa homologação externa.
npm.cmd run check:local
```

O script `check_homologacao_payment.js` atualmente espera somente a transação Pix.
Antes de acrescentar cenários de cartão, adaptar a contagem global para a nova
fixture; não tratar novas transações fictícias autorizadas como duplicidade do Pix.

## O que falta, na ordem de continuidade

1. Confirmar login Google de verdade e logout; página aberta não basta.
2. Confirmar segundo recebimento e processamento do webhook do Pix pendente,
   verificando `data.id`, action e consulta real ao pagamento.
3. Testar pagamento aprovado e recusado, liquidação e repetição com saldo correto.
   Foi preparado `check_homologacao_card.js APRO|OTHE`, usando apenas dados públicos
   de cartão fictício da documentação do MP. **Ainda não validado nem executado
   com sucesso:** tentativa APRO parou no bloqueio de rede antes da tokenização;
   existe apenas a reserva fictícia 20001, sem pagamento de cartão. Revisar e
   executar acompanhadamente. Esse script testa API, não o formulário do navegador.
4. Ensaiar falha temporária e recuperação por outbox, cancelamento e estorno de
   pagamento fictício aprovado, incluindo repetição sem duplicar baixas. Cron
   está desligado neste harness e precisa ser testado separadamente.
5. Homologar OAuth da arena. A conexão manual não substitui OAuth; o harness
   atual bloqueia credenciais diferentes do TEST fornecido e não habilita a troca
   OAuth. Preparar contas/callback apropriados antes dessa etapa.
6. Homologar cobrança SaaS, planos/ciclos e fluxo de cartão pelo navegador; Point
   somente se ofertado e com terminal de teste disponível. SMTP exige destinatário
   de teste explicitamente autorizado. Não usar credenciais reais para contornar
   limitações do sandbox.
7. Registrar resultados finais no roteiro e no documento de pendências.

Infraestrutura de produção (domínio/HTTPS/proxy/servidor, backup/restauração,
reinício e monitoramento no destino) continua separada e pendente.

## Texto para enviar na próxima conversa

> Continue o item 5 de homologação do Arenix em
> C:\Users\Mateus\Downloads\Volei System. Leia primeiro
> docs/RETOMADA_HOMOLOGACAO_2026-09-22.md,
> docs/HOMOLOGACAO_EXTERNA_2026-09-22.md e
> docs/PENDENCIAS_SEGURANCA_2026-09-21.md. Preserve todas as alterações do Git e
> não revele valores do .env. A instância isolada já existe em
> .local-security/homologacao/instance; não recriar nem apagar. Pix fictício
> 1328247564, R$ 100, live_mode=false, pending; repetição da criação não duplicou.
> A assinatura de webhook já está instalada cifrada. Uma notificação chegou com
> HTTP 200, mas ID/action e consulta ao pagamento ainda precisam ser comprovados;
> confirmar segunda notificação. Google ainda não aprovado. Há roteiro de cartão
> sintético preparado, não validado. Avance nos cenários restantes sem criar
> pagamentos ou estornos reais. Atualize evidências e documentos e diferencie
> integração parcial de aprovação para produção.
