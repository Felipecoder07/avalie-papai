# Bloco 0 — base de validação de segurança

Data: 18/09/2026. Revisão inicial exata: `ce9f8b50c5bf347b449c21874198292705eecd56` (`docs(security): atualizar checklist de implementacao e entregas concluidas`). `git status --short` estava vazio antes da implementação: não havia alterações locais a incorporar ou sobrescrever. As mudanças deste bloco constituem uma entrega separada da remediação anterior, no commit `a5d8963`.

Resultado final: **100 testes aprovados em 6 arquivos**, sem testes pulados, em `npm run test:security` (26,28 s). Inclui os dois testes em Edge headless. Critérios do bloco 0 concluídos localmente; os demais blocos e a suíte geral permanecem pendentes.

## Execução

Em `backend`, após instalar as dependências do backend e do frontend:

```sh
npm run test:security
npm run test:security:browser
```

O comando completo inclui o navegador; falha de inicialização, ausência do navegador ou timeout não são tratados como sucesso nem como teste opcional. No Windows, usa o Edge instalado em modo headless. Em outros sistemas, instalar Chromium com `npx playwright install chromium`. `SECURITY_BROWSER_CHANNEL` permite selecionar outro canal instalado. Nenhum teste chama provedores reais ou envia e-mail; o navegador acessa apenas o servidor local de teste.

Para gerar um relatório JSON:

```sh
npm run test:security -- --reporter=default --reporter=json --outputFile=../artifacts/homologacao/security-block0.json
```

O relatório local fica em diretório já ignorado pelo Git. O código e este registro são a base reproduzível da entrega, não um JSON histórico sobrescrito.

## Isolamento e montagem

- `vitest.config.mjs` aplica a preparação a todas as suítes do backend, com workers isolados. `database.js` usa SQLite real `:memory:` em teste e rejeita `TEST_DB_PATH` persistente antes de abrir o banco. O caminho de produção não foi alterado.
- `tests/setup.mjs` impede carregamento do `.env`, retira configurações externas herdadas e substitui os transportes de fetch e SMTP por padrões que não fazem chamadas externas. Os testes de integração fornecem respostas fictícias explícitas.
- `securityFixture.cjs` aguarda os callbacks de criação/migração do SQLite, inclusive os callbacks aninhados, em vez de dormir um intervalo fixo. Confere `PRAGMA database_list` antes de inserir fixtures e reinicializa os dados entre os cenários.
- Todas as regressões HTTP usam `src/app.js`. Não existe app alternativo com rotas remontadas para fazer o teste passar. O navegador usa o frontend real, servido localmente pelo Vite, e encaminha API/uploads para o mesmo `app.js`.
- Negações com HTTP 404 conferem a resposta JSON esperada e têm controles positivos na mesma rota. Por exemplo, cancelamento de outra arena falha, enquanto o cancelamento autorizado na mesma URL funciona e altera o banco.

## Matriz de atores

| Ator | Arena A | Arena B | Conta ativa | Bloqueada | Excluída |
| --- | --- | --- | --- | --- | --- |
| Anônimo | Sem acesso administrativo | Sem acesso administrativo | Não aplicável | Não aplicável | Não aplicável |
| Cliente proprietário | Fixture e login real | Fixture e login real | Operações próprias permitidas | Sessão rejeitada | Sessão rejeitada |
| Cliente terceiro | Fixture distinta do proprietário | Testes de acesso entre arenas | Objetos de terceiro negados | Sessão rejeitada | Sessão rejeitada |
| Recepcionista | Fixture e login real | Fixture e login real | Lista limitada à arena | Sessão rejeitada | Sessão rejeitada |
| Gerente | Fixture e login real | Fixture e login real | Lista limitada à arena | Sessão rejeitada | Sessão rejeitada |
| Administrador | Fixture e login real | Fixture e login real | Lista limitada à arena | Sessão rejeitada | Sessão rejeitada |
| SuperAdmin | Sem bypass nas rotas de tenant | Sem bypass nas rotas de tenant | Rota master com login e TOTP reais | Sessão rejeitada | Sessão rejeitada |

Também há casos de arena suspensa/removida e reutilização da mesma sessão após logout, mudança de perfil e redefinição de senha. As credenciais são fictícias e criadas exclusivamente no banco em memória.

## Correspondência com a auditoria

| Achado original | Regressão e evidência segura |
| --- | --- |
| 1. Escalada e segredos master | `security_remediation`: criação/promoção negadas, usuário e perfil preservados, novo login sem acesso master. `security_concurrency`: master legítimo consulta indicadores sem os segredos das fixtures. |
| 2. Identidade Google falsificada | `security_audit_regression`: assinatura RSA falsa, emissor/audiência incorretos, expiração e e-mail não verificado rejeitados; nenhuma sessão/identidade criada e perfil protegido. Controle positivo com assinatura válida e prova de senha. Apenas o transporte das chaves é simulado, não o verificador. |
| 3. Cliente lê administração/lança pagamento | `security_remediation` e matriz: 403, nenhum lançamento nem mudança de saldo, nenhum provedor chamado e nenhum dado de outro cliente retornado. |
| 4. Reserva gratuita para cliente de outra arena | `security_audit_regression`: 403 e comparação integral das reservas antes/depois. `security_remediation`: cliente estrangeiro rejeitado na criação administrativa. |
| 5. CPF/histórico por telefone | `security_audit_regression`: anônimo e credencial inválida recebem 401 sem PII; proprietário autenticado lê o próprio histórico pela mesma rota. |
| 6. Checkout sobrescreve cadastro de outra arena | `security_audit_regression`: checkout legítimo retorna 201, cobra a tarifa do servidor e preserva todos os campos do cadastro estrangeiro. |
| 7. Cancelamento/status/Pix sem propriedade | `security_audit_regression` e `security_remediation`: negações JSON, banco inalterado, controles positivos de proprietário/visitante e rejeição de slug de outra arena. |
| 8. Webhooks concorrentes duplicam pagamento | `gateway`: cinco chamadas HTTP simultâneas, assinadas, nos ramos de produção, geram exatamente um crédito de R$ 100. |
| 9. Parcial quita todo o grupo | `gateway`: cobrança HTTP de R$ 1 e webhook deixam a primeira reserva Parcial e a segunda Pendente; soma e quantidade dos lançamentos conferidas. |
| 10. Sessão permanece após revogação | `security_concurrency`, `security_remediation` e `security_audit_regression`: mesma credencial falha após logout, bloqueio, exclusão, alteração de perfil e reset. |
| 11. Reset expirado | `security_audit_regression`: token expirado há duas horas falha por HTTP sem mudar senha; token válido consumido por duas chamadas simultâneas tem apenas um sucesso e revoga a sessão anterior. |
| Upload ativo e XSS | `security_browser`: nome malicioso persistido pela API aparece como texto no frontend real; script não executa. Upload HTML rejeitado e arquivo HTML de teste realmente existente em `/uploads` bloqueado ao navegar. Cookie de sessão não é acessível por JavaScript; escrita sem CSRF falha. |

A suíte de gateway também conserva cobertura de OAuth/state/code e replay, credenciais por arena, Pix estático, cartão, maquineta, estorno confirmado, idempotência e falha transitória do provedor. Casos antigos que esperavam JWT legado ou bypass genérico de SuperAdmin foram substituídos por expectativas do contrato seguro. Testes de SQL e exclusão direta de linhas não são apresentados como prova de XSS ou logout.

## Evidências originais preservadas

Os três artefatos abaixo não foram modificados nem regenerados. `security_database.test.js` verifica seus hashes SHA-256, normalizando apenas CRLF/LF para compatibilidade de checkout:

| Arquivo | SHA-256 |
| --- | --- |
| `docs/security-audit-evidence.json` | `bf9f742c002515177d55c6efcb89050ddc231054d4f11c4b8f61cff138f6d430` |
| `docs/security-review-2026-09-13.md` | `2d952de8544aeb84f06cf57cdcab30699967b87d25bb817f3db44d2d3d401e19` |
| `backend/tests/security_audit_review.cjs` | `654393c6c1c769923b9f74672f1bc9f6acaa36b78ab8d4c33d484771990454d0` |

O script antigo é histórico e grava no JSON da auditoria. Não executar esse script para validar a remediação; usar `npm run test:security`.

## Limites e pendências fora deste bloco

A execução geral do backend, antes da última adição dos três testes de integridade dos artefatos e com navegador executado separadamente, foi registrada em `artifacts/homologacao/security-block0-full.json`: **212 testes, 123 aprovados, 79 falhos e 10 pendentes/não executados**. A suíte geral não está aprovada. Há contratos antigos de JWT/ativação/recuperação e identidade por e-mail a atualizar; essas falhas não foram escondidas com skips nem removidas do comando `npm test`.

Continuam abertos os blocos de correção funcional, a atualização das demais suítes, migração/associação por e-mail, testes completos das interfaces, limites em produção, eventos financeiros adversariais adicionais, dependências e homologação real dos provedores/deploy. O teste de XSS cobre os caminhos descritos acima, não todas as telas e destinos de HTML. O bloco 0 fornece regressões verificáveis; não certifica a segurança de todo o sistema.
