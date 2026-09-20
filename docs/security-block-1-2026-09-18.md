# Bloco 1 — contenção dos acessos críticos

Data: 18/09/2026. Base: working tree limpo na revisão `0ac244da1a581f2cc591f5af2c5766c3c4c65434`. Implementação local, sem commit ou publicação neste trabalho. Os artefatos históricos da auditoria foram preservados.

## Permissões e operações sensíveis

`backend/src/utils/permissions.js` concentra as ações permitidas. Ação desconhecida, perfil inexistente e perfil não listado são negados. Leituras internas de quadras, motivos e comunicados exigem equipe; Cliente conserva operações de atleta e pagamentos online próprios. Cliente não pode iniciar cobrança de maquineta, lançar pagamento manual, aplicar desconto, estornar ou simular liquidação. SuperAdmin não herda permissões de tenant nem acesso genérico a reservas.

Administrador gerencia apenas Gerente/Recepcionista da sua arena; Gerente gerencia somente Recepcionista. Criação, edição e exclusão revalidam ator e alvo dentro da transação em `userManagementService.js`, impedindo que uma transferência concorrente deixe uma edição atingir conta superior.

`POST /api/usuarios/transferir-administracao` recebe `usuario_id`, `senha_atual` e `codigo_2fa` quando houver segundo fator configurado. Somente o Administrador atual pode transferir sua função para Gerente/Recepcionista ativo da mesma arena. A operação promove o destino, passa o solicitante a Gerente, revoga sessões de ambos e grava auditoria com IDs na mesma transação. Falha da auditoria desfaz a transferência. Requisições concorrentes não criam dois novos administradores.

## Dados e credenciais

- A leitura de arena usa colunas explícitas, sem repassar `SELECT *`. Leituras administrativas e master mantêm indicadores de configuração, sem devolver credenciais, segredos de 2FA ou tokens de recuperação.
- Configurações omitidas, nulas ou vazias preservam os segredos anteriores. Substituições continuam possíveis pelos endpoints de configuração autorizados.
- `POST /api/pagamentos/gateway/oauth/desconectar` exige Administrador, senha atual e segundo fator se configurado. Remoção da credencial e auditoria são atômicas.
- `DELETE /api/saas/credenciais/:key` aceita somente `mp_master_access_token`, `mp_client_secret` ou `mp_webhook_secret`. Exige sessão master com MFA, senha atual e novo código TOTP. Uma remoção explícita grava valor vazio no banco, que também impede reutilizar silenciosamente uma credencial do ambiente. Nova substituição reabilita a integração.
- `credentialService.js` centraliza essa precedência para leitura de token master, OAuth e assinatura de webhook.
- Logs operacionais e scripts usam `safeLogger.js`: módulo, nível e códigos de erro permitidos, sem serializar mensagens arbitrárias, erros completos, headers, payloads SMTP/HTTP ou URLs. A redução de detalhes nos logs é deliberada. Auditorias mantêm contexto de negócio, sem provas de reautenticação.
- `publicError` só expõe mensagens de erros criados deliberadamente pela aplicação. Falhas de banco/transporte e detalhes de erro devolvidos pelo provedor recebem mensagens controladas. Provisionamento de MFA e envio de recuperação por e-mail continuam operações específicas de escrita; não são endpoints de leitura de segredos.

## Vínculos de atleta e impacto da migração

`ClientMemberships.verified` diferencia vínculos comprovados. Um cadastro novo criado no contexto de uma conta autenticada recebe vínculo verificado. E-mail, telefone e `Usuarios.cliente_id` legado não associam a conta a um cadastro existente.

A inicialização adiciona `verified INTEGER NOT NULL DEFAULT 0` às tabelas existentes e registra a versão 3. Os vínculos anteriores, inclusive os inferidos pela versão 2, permanecem no banco com `verified=0`; deixam de autorizar leitura, pagamentos, cancelamento ou alteração de dados do cliente. A exclusão da conta também ignora cadastros com vínculo não verificado. Não há exclusão automática de clientes por ID fixo.

**Impacto operacional:** atletas com vínculos antigos sem prova precisarão passar pela futura verificação/reconciliação dos blocos 3 e 6. Esta entrega contém o acesso indevido, mas não oferece ainda esse fluxo de verificação. Não marcar todos os vínculos antigos como verificados para contornar o bloqueio. Cadastros e histórico financeiro são preservados.

## Interfaces

Configurações da arena obtêm o perfil atual do servidor, desabilitam edição de contas fora da hierarquia e retiram Administrador do seletor comum. A transferência tem ação própria. Desconexão da arena e remoção master têm campos de senha/TOTP, que são limpos após sucesso ou erro.

O portal antigo de nova reserva encaminha para o portal público da arena, eliminando o fluxo com criação administrativa e token fictício de cartão. A tela antiga de reservas do atleta deixa de oferecer simulação. O endereço em desenvolvimento usa a porta 5176; em produção conserva o contrato existente de `/arena/:slug` no mesmo domínio. A topologia publicada permanece pendente de homologação.

## Validação

Todas as regressões HTTP usam `app.js`, login real e SQLite `:memory:`. Os transportes de pagamento e SMTP são substituídos por fixtures; não houve chamada real ao provedor.

| Verificação | Resultado |
| --- | --- |
| Segurança do backend, incluindo o bloco 1 | 132 testes em 7 arquivos |
| Novos cenários em `security_block1.test.js` | 32 testes |
| Testes da interface administrativa | 57 aprovados em 6 arquivos |
| Testes da interface do atleta | 26 aprovados em 5 arquivos |
| TypeScript das duas interfaces | Aprovado |
| Builds de produção das duas interfaces | Aprovados; execução fora do sandbox após bloqueio de leitura do Vite |
| ESLint do componente novo e da tela substituída | Aprovado |

Os novos casos verificam negação sem alteração no banco/chamada ao provedor, hierarquia legítima, todas as operações master montadas contra administrador recém-cadastrado, transferência concorrente, rollback de auditoria, preservação/remoção de credenciais, ausência dos segredos das fixtures em leituras e erros de banco/provedor, quarentena de vínculo legado, cancelamento legítimo e exclusão sem atingir cadastro não comprovado.

As expectativas antigas de Bearer dos testes administrativos foram atualizadas para exigir `credentials: include` e ausência de Authorization, preservando o contrato de cookies já implementado. Os testes de desconexão agora fornecem a prova exigida; não foram relaxados para aceitar remoção sem senha.

**A suíte geral do backend continua reprovada:** as 79 falhas anteriores permanecem fora da suíte de segurança, principalmente contratos antigos de JWT, ativação, recuperação e associação por e-mail. A comparação dos nomes dos casos falhos com o relatório do bloco 0 não adicionou nem retirou falhas. A execução geral tem relatório local em `artifacts/homologacao/security-block1-full.json` e log correspondente, ignorados pelo Git. Não houve skips novos para ocultar falhas.

Avisos de Browserslist desatualizado e bundle administrativo grande permanecem. O lint integral do legado, a reconciliação de dados, os demais blocos, testes reais do provedor, backup/restauração e homologação/publicação continuam fora da conclusão deste bloco.
