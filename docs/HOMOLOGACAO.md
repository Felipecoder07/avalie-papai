# Validação antes de produção

A aprovação exige evidências em três etapas: automação local, fluxos completos em homologação e operação no ambiente de destino. Nenhuma suíte isolada certifica o sistema inteiro. Cenário sem evidência permanece pendente.

## 1. Executar a automação local

Na raiz do repositório, com as dependências dos três projetos instaladas:

```powershell
npm.cmd run validate
```

Em outros terminais, use `npm run validate`. O comando executa testes das três aplicações, TypeScript, builds e lint das duas interfaces. Ele força `NODE_ENV=test` e desabilita credenciais SMTP nos processos de teste. Ele continua após uma falha para reunir todos os resultados e termina com código 1 se alguma etapa reprovar.

Os arquivos `artifacts/homologacao/<data>/summary.json` e os logs de cada etapa registram commit, existência de alterações locais, versão de Node, duração e resultado. A pasta é ignorada pelo Git. Revise os logs antes de compartilhar; testes antigos podem imprimir dados do ambiente. O relatório nunca aprova produção automaticamente.

Para repetir apenas os contratos do gateway:

```powershell
npm.cmd run validate:gateway
```

Essa suíte usa o banco `backend/data/courtmanager_test.sqlite`, dados fictícios e respostas simuladas para Mercado Pago e e-mail. Executa as rotas, autorização e serviço reais. Não faz cobranças nem envia mensagens externas. Não rode duas suítes de backend ao mesmo tempo: elas compartilham o banco de testes.

### Critérios dos contratos

- Cobrança bem-sucedida exige HTTP 200, QR code/referência, valor correto e transação persistida.
- Recusa do provedor exige erro explícito e nenhum pagamento ou transação nova. Um HTTP 500 só é esperado no cenário que provoca a falha do provedor.
- Outro cliente ou outra arena deve receber HTTP 403, sem obter dados ou executar cobrança.
- Cliente não pode ler a credencial privada do gateway.
- Administrador e gerente recebem apenas a indicação de conexão, a chave pública e o serial; a credencial privada não é retornada nas consultas de configuração.
- Salvar sem uma nova chave preserva a credencial existente. Desconectar é uma ação explícita, restrita ao administrador ou gerente da arena.
- O simulador é bloqueado em produção para todos os perfis, incluindo SuperAdmin; webhooks legítimos continuam processados.
- Confirmação deve atualizar a reserva e lançar o valor correto; repetição sequencial do webhook não pode duplicar o pagamento.
- Valor ou dispositivo divergente deve preservar o saldo pendente.
- Estorno deve mudar a transação apenas se o provedor confirmar sucesso. A baixa financeira e o cancelamento completos ainda precisam de validação própria.

### Bloqueios encontrados na primeira execução (11/09/2026)

Os contratos reproduziram quatro falhas, retornando HTTP 200 onde se exige HTTP 403:

| Cenário | Comportamento observado | Local a corrigir |
| --- | --- | --- |
| Administrador da arena B cobra reserva da arena A | Cobrança aceita | `gatewayRoutes.js`, `validarReservaECalcularValorCobrar` |
| Administrador da arena B consulta reserva da arena A | Status retornado | `GET /status/:reserva_id` |
| Cliente consulta configuração do gateway | Resposta inclui `gateway_access_token` | `GET /maquineta` |
| Administrador da arena B simula liquidação da arena A | Liquidação aceita em `NODE_ENV=test` | `POST /simular-pagamento` |

O último caso foi reproduzido no simulador em ambiente de teste; não demonstrava que um administrador comum pudesse usá-lo em produção. Esta tabela registra o diagnóstico anterior à correção.

### Correções de autorização e compatibilidade

As quatro falhas acima foram corrigidas. Cobrança, consulta e simulador compartilham a validação de arena e proprietário. Perfis desconhecidos e vínculos ausentes são negados; administradores, gerentes, recepcionistas e colaboradores mantêm as operações da própria arena. O acesso global explícito do SuperAdmin à consulta/cobrança é preservado. A exceção de SuperAdmin no simulador em produção foi removida.

A configuração de gateway exige administrador ou gerente. A resposta usa `gateway_connected` em vez da chave privada; a consulta geral da própria arena também omite essa chave. O formulário carrega a rota correta, mostra a conexão sem preencher a senha e não envia uma chave vazia ao salvar. O backend também preserva chaves ausentes ou vazias e permite a desconexão pela ação específica. Se a leitura da configuração falhar, o formulário impede sua sobrescrita.

A troca OAuth feita pelo frontend envia autenticação, confere a arena da sessão e recebe somente a indicação de conexão e a chave pública. A geração da URL e a desconexão também exigem perfil de configuração. O fluxo externo completo do provedor e o callback ainda precisam da homologação e revisão própria; os contratos locais usam respostas simuladas.

Os contratos abrangem permissões por perfil, isolamento, preservação/substituição de chave, desconexão, configuração sem vazamento, produção sem simulador, Pix direto e confirmação de webhook. Testes de interface verificam a gravação sem chave, substituição, desconexão, falha de carregamento e retorno OAuth sem expor a credencial. Esses testes usam jsdom, não um navegador com contas reais.

Validação completa após a correção, em 11/09/2026: **264 testes aprovados** (183 backend, 55 painel, 26 tela do cliente), TypeScript e builds aprovados nas duas interfaces. Relatório local: `artifacts/homologacao/2026-09-11T17-19-15-773Z/summary.json`. A rotina terminou com código 1 pelas pendências de lint; as quatro falhas de autorização não reapareceram. Não houve execução com contas reais do provedor nem deploy.

O lint também apresenta pendências anteriores: 187 erros no painel e 12 na tela do cliente na revisão inicial. A rotina completa deve reprovar enquanto essas pendências existirem. Outros testes antigos ainda aceitam resultados amplos ou usam verificações condicionais; substituí-los por contratos verificáveis continua pendente.

## 2. Validar os fluxos completos em homologação

Use uma instalação separada, com duas arenas fictícias, usuários de cada perfil, banco próprio e credenciais de teste dos provedores. Registre o commit e a configuração usados. Execute desktop e celular, incluindo recarga direta de URLs internas. Para cada cenário, registre data, executor, esperado, observado e uma evidência sem senhas ou tokens.

| ID | Execução | Critério de aprovação | Estado inicial |
| --- | --- | --- | --- |
| UI-01 | Cadastrar, entrar, sair e recuperar senha | Perfil correto; link de recuperação funciona uma única vez; sessão encerrada perde acesso | Pendente |
| UI-02 | Entrar como Master, administrador, gerente, recepcionista e cliente | Menus e API respeitam o perfil, inclusive ao abrir URL diretamente | Pendente |
| UI-03 | Selecionar esporte, quadra, data e horário e finalizar reserva | Preço mostrado igual ao cobrado; reserva aparece para cliente e gestor | Pendente |
| UI-04 | Dois clientes reservam simultaneamente o mesmo horário | Exatamente uma reserva ativa; outra tentativa recebe conflito explicado | Pendente |
| UI-05 | Cancelar reserva paga e não paga | Disponibilidade, situação financeira e política de estorno consistentes | Pendente |
| UI-06 | Contratar plano, trocar plano, adiantar fatura e simular vencimento | Valor e vencimento corretos; bloqueio e desbloqueio conforme regra | Pendente |
| SEC-01 | Repetir consultas e alterações trocando IDs entre arenas | API nega acesso cruzado, sem leitura nem alteração de dados | Parcial: contratos de gateway corrigidos; demais módulos pendentes |
| SEC-02 | Invalidar token, encerrar sessão, trocar senha e desativar usuário | Tokens/sessões que devem perder acesso são rejeitados no servidor | Pendente |
| SEC-03 | Enviar credencial Google adulterada | Servidor rejeita credencial sem autenticidade verificada | Pendente |
| PAY-01 | Pagar Pix com contas de teste do provedor e receber webhook | Conta destinatária correta; valor conferido; confirmação no painel sem ação manual | Pendente |
| PAY-02 | Repetir o mesmo webhook e enviá-lo simultaneamente | Um único lançamento financeiro, também sob concorrência | Parcial: repetição sequencial simulada coberta |
| PAY-03 | Simular recusa, desconexão e atraso do provedor | Não marcar como pago; informar estado correto e permitir recuperação | Parcial: recusa simulada coberta |
| PAY-04 | Pagar com cartão/maquineta e pedir estorno | Confirmações correspondem ao provedor; saldo e extrato corretos | Parcial: serviço simulado coberto |
| MAIL-01 | Recuperação de senha e comprovante em caixa de teste | E-mail recebido, links acessíveis e dados corretos | Pendente |

Essa tabela é um roteiro manual inicial. Testes de navegador automatizados ainda não foram implementados. Ao automatizá-los, mantenha os mesmos critérios e use contas de homologação; não substitua a validação do provedor por mocks nessa etapa.

## 3. Validar a operação antes da liberação

| ID | Execução | Critério de aprovação | Estado inicial |
| --- | --- | --- | --- |
| OPS-01 | Conferir configuração realmente lida pelo código | `NODE_ENV=production`, segredo JWT próprio, origens autorizadas e credenciais do ambiente correto | Pendente |
| OPS-02 | Reiniciar e atualizar a instalação de homologação | Banco e uploads preservados; rotas `/api` e URLs internas continuam funcionando | Pendente |
| OPS-03 | Criar backup consistente e restaurar em instalação descartável | Integridade do SQLite, contagens, reservas, pagamentos e uploads conferidos; tempo de restauração registrado | Pendente |
| OPS-04 | Induzir erro controlado e indisponibilidade em homologação | Logs permitem diagnóstico; alerta chega ao responsável; sem exposição de credenciais | Pendente |
| OPS-05 | Executar carga representativa e concorrência | Sem duplicidade, corrupção ou erros inesperados; latência dentro do limite definido antes do ensaio | Pendente |
| OPS-06 | Reverter uma versão em homologação | Aplicação volta a operar e permanece compatível com o banco | Pendente |

Verificações específicas deste repositório:

- O backend lê `CORS_ALLOWED_ORIGINS`; conferir esse nome, pois o guia antigo cita `CORS_ORIGIN`.
- O SQLite atual está em `backend/data/courtmanager.sqlite`. O disco persistente e o backup precisam cobrir esse arquivo e `backend/uploads`; apenas definir `DATABASE_URL` não muda o driver atual.
- O frontend faz chamadas relativas a `/api`. Confirmar o encaminhamento no ambiente de destino; não presumir que uma variável de URL configure todas as chamadas.
- Os testes importam `app.js`, mas algumas rotas são adicionadas apenas em `server.js`. Conferir a instalação real e unificar essa composição antes de considerar completa a cobertura de rotas.
- Revisar documentos e histórico para credenciais publicadas; qualquer segredo real exposto deve ser substituído no provedor e removido da documentação. Não copiar valores de exemplo antigos para produção.

## Registro de aprovação

Copie este bloco para o registro da versão e anexe os resultados. Não marque um item com base apenas no nome de um teste.

```text
Versão/commit e alterações locais:
Ambiente e data:
Responsável:
Relatório automatizado:
Cenários aprovados e evidências:
Cenários pendentes/reprovados:
Backup restaurado e tempo medido:
Resultado: REPROVADO / APROVADO
```

Qualquer falha de autorização, cobrança, integridade ou restauração impede a liberação. A correção dos quatro bloqueios de gateway não aprova produção por si só: as pendências de lint, os cenários externos e os ensaios operacionais ainda precisam ser resolvidos e registrados.
