# 📊 Relatório Completo de Análise SonarCloud - Arenix

**Data da Coleta:** 20/09/2026, 16:01:52
**Projeto no SonarCloud:** `Felipecoder07_avalie-papai`
**Total de Problemas Encontrados:** **457**

---

## 📈 1. Resumo Geral por Categoria e Severidade

| Tipo de Problema | Quantidade | Descrição / Impacto |
| :--- | :---: | :--- |
| 🛡️ **Vulnerabilidades (Security)** | **1** | Riscos de segurança, injeção de log, sanitização e sanitização de storage |
| 🐛 **Bugs (Reliability / A11y)** | **8** | Acessibilidade (click sem teclado), duplicidades em CSS, formulários sem label |
| 🧹 **Code Smells (Maintainability)** | **448** | Complexidade cognitiva alta, ternários aninhados, padrões modernos de JS/TS |

### 🚦 Distribuição por Severidade

| Severidade | Quantidade | Percentual |
| :--- | :---: | :---: |
| 🔴 **CRITICAL** | **19** | 4.2% |
| 🟠 **MAJOR** | **251** | 54.9% |
| 🟡 **MINOR** | **178** | 38.9% |
| ⚪ **INFO** | **1** | 0.2% |

---

## 🛡️ 2. Detalhamento de Vulnerabilidades (1 encontradas)

As vulnerabilidades afetam diretamente a segurança da aplicação:

| # | Severidade | Arquivo | Linha | Regra | Descrição do SonarCloud |
| :- | :- | :- | :-: | :- | :-- |
| 1 | `BLOCKER` | `Felipecoder07_avalie-papai:backend/tests/security_audit_review.cjs` | 59 | `javascript:S6437` | Revoke and change this password, as it is compromised. |

### 🔍 Principais Causas das Vulnerabilidades:
1. **Log Injection / Sensitive Data Logging (CWE-117)**: Uso de `console.log` passando parâmetros da requisição (`req.body`, `paymentId`, `email`, etc.) sem sanitização.
2. **Armazenamento de Dados Não Sanitizados (CWE-79 / Storage Tainting)**: Gravando tokens/dados recebidos direto em `localStorage` sem validação de tipo/schema.
3. **Geração de Valores Pseudoaleatórios Inseguros (CWE-330)**: Uso de `Math.random()` em código que gera tokens/códigos (deve usar `crypto.randomBytes` ou `crypto.randomInt`).
4. **Construção Insegura de URLs (CWE-918 / SSRF)**: Interpolação de inputs de usuários diretamente no path da requisição sem validação.
5. **Configuração de CORS e Cabeçalhos Express**: Falta de desativação do `x-powered-by` (`app.disable('x-powered-by')`) e CORS excessivamente permissivo.

---

## 🐛 3. Detalhamento de Bugs (8 encontrados)

| # | Severidade | Arquivo | Linha | Regra | Descrição |
| :- | :- | :- | :-: | :- | :-- |
| 1 | `BLOCKER` | `Felipecoder07_avalie-papai:backend/src/config/migrations/002_finance_cents.sql` | 5 | `plsql:DeleteOrUpdateWithoutWhereCheck` | Ensure that the WHERE clause is not missing in this UPDATE query. |
| 2 | `BLOCKER` | `Felipecoder07_avalie-papai:backend/src/config/migrations/002_finance_cents.sql` | 16 | `plsql:DeleteOrUpdateWithoutWhereCheck` | Ensure that the WHERE clause is not missing in this UPDATE query. |
| 3 | `BLOCKER` | `Felipecoder07_avalie-papai:backend/src/config/migrations/002_finance_cents.sql` | 19 | `plsql:DeleteOrUpdateWithoutWhereCheck` | Ensure that the WHERE clause is not missing in this UPDATE query. |
| 4 | `BLOCKER` | `Felipecoder07_avalie-papai:backend/src/config/migrations/002_finance_cents.sql` | 22 | `plsql:DeleteOrUpdateWithoutWhereCheck` | Ensure that the WHERE clause is not missing in this UPDATE query. |
| 5 | `BLOCKER` | `Felipecoder07_avalie-papai:backend/src/config/migrations/002_finance_cents.sql` | 25 | `plsql:DeleteOrUpdateWithoutWhereCheck` | Ensure that the WHERE clause is not missing in this UPDATE query. |
| 6 | `BLOCKER` | `Felipecoder07_avalie-papai:backend/src/config/migrations/002_finance_cents.sql` | 26 | `plsql:DeleteOrUpdateWithoutWhereCheck` | Ensure that the WHERE clause is not missing in this UPDATE query. |
| 7 | `BLOCKER` | `Felipecoder07_avalie-papai:backend/src/config/migrations/002_finance_cents.sql` | 29 | `plsql:DeleteOrUpdateWithoutWhereCheck` | Ensure that the WHERE clause is not missing in this UPDATE query. |
| 8 | `MINOR` | `Felipecoder07_avalie-papai:frontend/src/screens/admin/AdminClientes.tsx` | 617 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |

---

## 🔴 4. Detalhamento dos Problemas Críticos (19 itens)

A maioria dos problemas críticos do SonarCloud no projeto está ligada à **Complexidade Cognitiva Excessiva** (funções muito longas com muitos `if/else`, `try/catch` e loops aninhados) e 1 erro de `await` desnecessário:

| # | Arquivo | Linha | Mensagem |
| :- | :-- | :-: | :-- |
| 1 | `Felipecoder07_avalie-papai:backend/src/services/bookingCancellationService.js` | 12 | Refactor this function to reduce its Cognitive Complexity from 17 to the 15 allowed. |
| 2 | `Felipecoder07_avalie-papai:backend/src/services/bookingService.js` | 41 | Refactor this function to reduce its Cognitive Complexity from 31 to the 15 allowed. |
| 3 | `Felipecoder07_avalie-papai:backend/src/services/gatewayService.js` | 310 | Refactor this function to reduce its Cognitive Complexity from 17 to the 15 allowed. |
| 4 | `Felipecoder07_avalie-papai:backend/src/services/paymentLedgerService.js` | 4 | Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed. |
| 5 | `Felipecoder07_avalie-papai:backend/src/services/paymentLedgerService.js` | 26 | Refactor this function to reduce its Cognitive Complexity from 22 to the 15 allowed. |
| 6 | `Felipecoder07_avalie-papai:frontend/src/screens/MasterLogin.tsx` | 19 | Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed. |
| 7 | `Felipecoder07_avalie-papai:backend/src/routes/gatewayRoutes.js` | 275 | Refactor this function to reduce its Cognitive Complexity from 18 to the 15 allowed. |
| 8 | `Felipecoder07_avalie-papai:backend/src/controllers/publicController.js` | 310 | Refactor this function to reduce its Cognitive Complexity from 18 to the 15 allowed. |
| 9 | `Felipecoder07_avalie-papai:frontend/src/screens/admin/AdminAssinatura.tsx` | 116 | Refactor this function to reduce its Cognitive Complexity from 27 to the 15 allowed. |
| 10 | `Felipecoder07_avalie-papai:frontend/src/screens/admin/AdminAssinatura.tsx` | 326 | Refactor this function to reduce its Cognitive Complexity from 76 to the 15 allowed. |
| 11 | `Felipecoder07_avalie-papai:frontend/src/screens/admin/AdminConfiguracoes.tsx` | 70 | Refactor this function to reduce its Cognitive Complexity from 17 to the 15 allowed. |
| 12 | `Felipecoder07_avalie-papai:tela cliente/src/App.tsx` | 165 | Refactor this function to reduce its Cognitive Complexity from 18 to the 15 allowed. |
| 13 | `Felipecoder07_avalie-papai:tela cliente/src/components/PixModal.tsx` | 122 | Refactor this function to reduce its Cognitive Complexity from 17 to the 15 allowed. |
| 14 | `Felipecoder07_avalie-papai:frontend/src/screens/admin/AdminConfiguracoes.tsx` | 112 | Refactor this function to reduce its Cognitive Complexity from 46 to the 15 allowed. |
| 15 | `Felipecoder07_avalie-papai:frontend/src/screens/admin/AdminPagamentos.tsx` | 150 | Refactor this function to reduce its Cognitive Complexity from 26 to the 15 allowed. |
| 16 | `Felipecoder07_avalie-papai:frontend/src/screens/admin/AdminReservas.tsx` | 224 | Refactor this function to reduce its Cognitive Complexity from 43 to the 15 allowed. |
| 17 | `Felipecoder07_avalie-papai:frontend/src/screens/admin/AdminReservas.tsx` | 781 | Refactor this function to reduce its Cognitive Complexity from 22 to the 15 allowed. |
| 18 | `Felipecoder07_avalie-papai:frontend/src/screens/admin/AdminReservas.tsx` | 974 | Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed. |
| 19 | `Felipecoder07_avalie-papai:frontend/src/screens/admin/AdminReservas.tsx` | 1200 | Refactor this function to reduce its Cognitive Complexity from 28 to the 15 allowed. |

---

## 🧹 5. Top 15 Regras Mais Frequentes (Code Smells & Padrões)

| Regra Sonar | Ocorrências | Tipo | Severidade | Exemplo de Recomendação |
| :--- | :---: | :---: | :---: | :--- |
| `typescript:S3358` | **79** | `CODE_SMELL` | `MAJOR` | Extract this nested ternary operation into an independent statement. |
| `javascript:S6582` | **41** | `CODE_SMELL` | `MINOR` | Prefer using an optional chain expression instead, as it's more concise and easier to read. |
| `typescript:S6819` | **33** | `CODE_SMELL` | `MAJOR` | Use <dialog> instead of the "dialog" role to ensure accessibility across all devices. |
| `typescript:S6853` | **30** | `CODE_SMELL` | `MAJOR` | A form label must be associated with a control. |
| `javascript:S2486` | **22** | `CODE_SMELL` | `MINOR` | Handle this exception, don't catch it at all, or explain in a comment why it is ignored. |
| `typescript:S1128` | **16** | `CODE_SMELL` | `MINOR` | Remove this unused import of 'logout'. |
| `javascript:S1854` | **15** | `CODE_SMELL` | `MAJOR` | Remove this useless assignment to variable "decoded". |
| `typescript:S6582` | **14** | `CODE_SMELL` | `MINOR` | Prefer using an optional chain expression instead, as it's more concise and easier to read. |
| `typescript:S3776` | **12** | `CODE_SMELL` | `CRITICAL` | Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed. |
| `typescript:S6571` | **12** | `CODE_SMELL` | `MINOR` | 'any' overrides all other types in this union type. |
| `css:S4666` | **12** | `CODE_SMELL` | `MAJOR` | Duplicate selector ".scope-landing-page", first used at line 8 |
| `javascript:S3358` | **11** | `CODE_SMELL` | `MAJOR` | Extract this nested ternary operation into an independent statement. |
| `javascript:S7773` | **11** | `CODE_SMELL` | `MINOR` | Prefer `Number.parseInt` over `parseInt`. |
| `javascript:S1481` | **11** | `CODE_SMELL` | `MINOR` | Remove the declaration of the unused 'decoded' variable. |
| `typescript:S6479` | **11** | `CODE_SMELL` | `MAJOR` | Do not use Array index in keys |

---

## 📁 6. Top 15 Arquivos com Mais Apontamentos

| Arquivo | Total | 🐛 Bugs | 🛡️ Vulns | 🧹 Code Smells |
| :--- | :---: | :---: | :---: | :---: |
| `Felipecoder07_avalie-papai:frontend/src/screens/admin/AdminConfiguracoes.tsx` | **38** | 0 | 0 | 38 |
| `Felipecoder07_avalie-papai:frontend/src/screens/admin/AdminReservas.tsx` | **29** | 0 | 0 | 29 |
| `Felipecoder07_avalie-papai:frontend/src/screens/admin/AdminAssinatura.tsx` | **28** | 0 | 0 | 28 |
| `Felipecoder07_avalie-papai:backend/src/controllers/saasController.js` | **27** | 0 | 0 | 27 |
| `Felipecoder07_avalie-papai:tela cliente/src/App.tsx` | **19** | 0 | 0 | 19 |
| `Felipecoder07_avalie-papai:backend/src/routes/gatewayRoutes.js` | **13** | 0 | 0 | 13 |
| `Felipecoder07_avalie-papai:backend/src/services/gatewayService.js` | **13** | 0 | 0 | 13 |
| `Felipecoder07_avalie-papai:frontend/src/data/mock.ts` | **12** | 0 | 0 | 12 |
| `Felipecoder07_avalie-papai:frontend/src/screens/admin/AdminClientes.tsx` | **11** | 1 | 0 | 10 |
| `Felipecoder07_avalie-papai:backend/src/controllers/publicController.js` | **11** | 0 | 0 | 11 |
| `Felipecoder07_avalie-papai:backend/src/config/init_db.js` | **11** | 0 | 0 | 11 |
| `Felipecoder07_avalie-papai:frontend/src/screens/public/LandingPage.tsx` | **11** | 0 | 0 | 11 |
| `Felipecoder07_avalie-papai:frontend/src/screens/admin/AdminPagamentos.tsx` | **10** | 0 | 0 | 10 |
| `Felipecoder07_avalie-papai:tela cliente/src/components/PixModal.tsx` | **10** | 0 | 0 | 10 |
| `Felipecoder07_avalie-papai:frontend/src/screens/MasterFinanceiro.tsx` | **10** | 0 | 0 | 10 |

---

## 🛠️ 7. Plano de Ação Recomendado para Correção

1. **Fase 1 - Segurança Imediata (32 Vulnerabilidades)**
   - Trocar logs com dados brutos por logs parametrizados/sanitizados.
   - Substituir `Math.random()` em `publicController.js` por `crypto.randomBytes` / `crypto.randomInt`.
   - Adicionar `app.disable('x-powered-by')` e ajustar política de CORS em `backend/src/app.js`.
   - Sanitizar dados antes de salvar no `localStorage`.

2. **Fase 2 - Correção de Bugs e Acessibilidade (43 Bugs)**
   - Corrigir `tela cliente/src/components/CheckoutDrawer.tsx:96` (remover `await` de valor não-Promise).
   - Adicionar `onKeyDown` / `role="button"` / `tabIndex={0}` ou converter `div` clicáveis em `<button>` nos componentes React.
   - Corrigir CSS duplicado em `landing.css:667`.

3. **Fase 3 - Refatoração de Complexidade Crítica (41 Críticos)**
   - Quebrar funções gigantes em controllers (`publicController.js:355` com complexidade 84, `AdminAssinatura.tsx:106` com 71) em funções auxiliares menores (helpers/services).

4. **Fase 4 - Modernização e Limpeza Automatizável (646 Code Smells)**
   - Trocar `parseInt` -> `Number.parseInt` e `isNaN` -> `Number.isNaN`.
   - Aplicar optional chaining (`a?.b`).
   - Trocar `require('fs')` por `require('node:fs')` / `node:path`.
   - Extrair ternários aninhados em variáveis ou funções auxiliares.
