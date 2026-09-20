# Testes E2E funcionais

Execute em `backend`:

```powershell
npm.cmd run test:e2e
```

A suíte usa Playwright com Edge invisível no Windows. Em outros ambientes,
é necessário ter o Chromium do Playwright instalado. A variável
`SECURITY_BROWSER_CHANNEL` permite selecionar outro canal instalado.

Os dois portais são servidos pelo Vite em portas locais aleatórias, com a API
Express real e SQLite em memória. O teste não abre o banco de desenvolvimento,
não carrega `.env` e bloqueia tráfego externo do navegador. E-mails são
substituídos por uma implementação de teste. A confirmação de Pix usa respostas
simuladas do provedor, passando pelo webhook assinado e pelo processamento real
da aplicação; nenhum dinheiro é movimentado.

## Cenários

- Gestor: rejeição de senha incorreta, login pela tela, clientes da própria
  arena e logout com rejeição da credencial anterior.
- Atleta: login pela tela, escolha de data e horário, checkout de R$ 100,
  geração de Pix e correspondência com os 10.000 centavos no banco.
- Bloqueio de consulta da compra por outro navegador sem autenticação.
- Desistência pelo modal: registra cancelamento de reserva sem cobrança em
  processamento no provedor.
- Desistência com cobrança pendente no provedor: mantém a reserva retida para
  conciliação, sem criar crédito de pagamento.
- Pix aprovado: webhook assinado, atualização automática da tela e crédito
  único mesmo com entrega duplicada do webhook.
- Segurança de navegador já existente: conteúdo de cliente renderizado como
  texto, cookie HttpOnly, exigência de CSRF e bloqueio de upload ativo.

## Limites e lacunas

Esta cobertura não representa todas as funcionalidades do sistema. Google real,
e-mail real, Mercado Pago real, outros navegadores e topologia de produção
continuam exigindo validação específica.

A interface do atleta atualmente abre o login ao avançar para o checkout sem
uma conta autenticada (`handleProceedCheckout` em `tela cliente/src/App.tsx`).
Não há opção de continuar como visitante nessa tela. Portanto, o suporte a
visitante da API não equivale a um fluxo de visitante completo validado no
navegador. Essa lacuna precisa ser resolvida antes de declarar esse aceite
concluído.

## Correção encontrada pela suíte

O checkout público convertia o total em centavos para reais antes de chamar
`criarCobrancaPix`, cujo contrato recebe centavos. Isso produzia uma cobrança
de R$ 1 para uma reserva de R$ 100. A chamada agora passa o total original
em centavos, mantendo a resposta HTTP em reais. O cenário de provedor simulado
verifica o valor enviado ao Mercado Pago e o crédito registrado no banco.
