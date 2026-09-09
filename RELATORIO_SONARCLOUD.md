# 📊 Relatório Completo de Análise SonarCloud - Arenix

**Data da Coleta:** 09/09/2026, 14:26:10  
**Projeto no SonarCloud:** `Felipecoder07_Arenix`  
**Total de Problemas Encontrados:** **757**

---

## 📈 1. Resumo Geral por Categoria e Severidade

| Tipo de Problema | Quantidade | Descrição / Impacto |
| :--- | :---: | :--- |
| 🛡️ **Vulnerabilidades (Security)** | **34** | Riscos de segurança, injeção de log, sanitização e sanitização de storage |
| 🐛 **Bugs (Reliability / A11y)** | **43** | Acessibilidade (click sem teclado), duplicidades em CSS, formulários sem label |
| 🧹 **Code Smells (Maintainability)** | **680** | Complexidade cognitiva alta, ternários aninhados, padrões modernos de JS/TS |

### 🚦 Distribuição por Severidade

| Severidade | Quantidade | Percentual |
| :--- | :---: | :---: |
| 🔴 **CRITICAL** | **47** | 6.2% |
| 🟠 **MAJOR** | **272** | 35.9% |
| 🟡 **MINOR** | **437** | 57.7% |
| ⚪ **INFO** | **1** | 0.1% |

---

## 🛡️ 2. Detalhamento de Vulnerabilidades (34 encontradas)

As vulnerabilidades afetam diretamente a segurança da aplicação:

| # | Severidade | Arquivo | Linha | Regra | Descrição do SonarCloud |
| :- | :- | :- | :-: | :- | :-- |
| 1 | `MINOR` | `frontend/src/App.tsx` | 110 | `tssecurity:S8475` | Ensure that tainted data is sanitized before being written to browser storage. |
| 2 | `MINOR` | `scripts/fetch_sonar_issues.js` | 26 | `jssecurity:S5145` | Change this code to not log user-controlled data. |
| 3 | `MINOR` | `backend/src/controllers/saasController.js` | 550 | `jssecurity:S5145` | Change this code to not log user-controlled data. |
| 4 | `MINOR` | `frontend/src/App.tsx` | undefined | `tssecurity:S5145` | Change this code to not log user-controlled data. |
| 5 | `MINOR` | `frontend/src/screens/public/TenantLogin.tsx` | 58 | `tssecurity:S8475` | Ensure that tainted data is sanitized before being written to browser storage. |
| 6 | `MINOR` | `tela cliente/src/App.tsx` | 216 | `tssecurity:S8475` | Ensure that tainted data is sanitized before being written to browser storage. |
| 7 | `MINOR` | `backend/src/services/gatewayService.js` | 396 | `jssecurity:S5145` | Change this code to not log user-controlled data. |
| 8 | `MINOR` | `backend/src/controllers/publicController.js` | 571 | `jssecurity:S5145` | Change this code to not log user-controlled data. |
| 9 | `MAJOR` | `backend/src/controllers/publicController.js` | undefined | `javascript:S2245` | Make sure that using this pseudorandom number generator is safe here. |
| 10 | `MAJOR` | `backend/src/controllers/publicController.js` | undefined | `javascript:S2245` | Make sure that using this pseudorandom number generator is safe here. |
| 11 | `MINOR` | `backend/src/controllers/publicController.js` | 1512 | `jssecurity:S5145` | Change this code to not log user-controlled data. |
| 12 | `MAJOR` | `tela cliente/src/components/PixModal.tsx` | 168 | `tssecurity:S7044` | Change this code to not construct the URL's path from user-controlled data. |
| 13 | `MINOR` | `tela cliente/src/components/PixModal.tsx` | 168 | `tssecurity:S8476` | Ensure that tainted data is validated before being used to construct a client-side request URL. |
| 14 | `MINOR` | `backend/src/controllers/saasController.js` | 543 | `jssecurity:S5145` | Change this code to not log user-controlled data. |
| 15 | `MAJOR` | `backend/src/controllers/saasController.js` | 569 | `jssecurity:S7044` | Change this code to not construct the URL's path from user-controlled data. |
| 16 | `MAJOR` | `backend/src/routes/gatewayRoutes.js` | 198 | `jssecurity:S7044` | Change this code to not construct the URL's path from user-controlled data. |
| 17 | `MINOR` | `backend/src/routes/gatewayRoutes.js` | 321 | `jssecurity:S5145` | Change this code to not log user-controlled data. |
| 18 | `MINOR` | `backend/src/routes/gatewayRoutes.js` | 380 | `jssecurity:S5145` | Change this code to not log user-controlled data. |
| 19 | `MINOR` | `backend/src/services/emailService.js` | 37 | `jssecurity:S5145` | Change this code to not log user-controlled data. |
| 20 | `MINOR` | `backend/src/services/gatewayService.js` | 231 | `jssecurity:S5145` | Change this code to not log user-controlled data. |
| 21 | `MINOR` | `backend/src/services/gatewayService.js` | 355 | `jssecurity:S5145` | Change this code to not log user-controlled data. |
| 22 | `MINOR` | `backend/src/services/saasBillingService.js` | 210 | `jssecurity:S5145` | Change this code to not log user-controlled data. |
| 23 | `MINOR` | `frontend/src/App.tsx` | undefined | `tssecurity:S8475` | Ensure that tainted data is sanitized before being written to browser storage. |
| 24 | `MINOR` | `frontend/src/App.tsx` | 239 | `tssecurity:S8475` | Ensure that tainted data is sanitized before being written to browser storage. |
| 25 | `MINOR` | `frontend/src/App.tsx` | 292 | `tssecurity:S8475` | Ensure that tainted data is sanitized before being written to browser storage. |
| 26 | `MINOR` | `frontend/src/screens/MasterLogin.tsx` | 47 | `tssecurity:S8475` | Ensure that tainted data is sanitized before being written to browser storage. |
| 27 | `MINOR` | `frontend/src/screens/MasterLogin.tsx` | 48 | `tssecurity:S8475` | Ensure that tainted data is sanitized before being written to browser storage. |
| 28 | `MINOR` | `frontend/src/screens/public/TenantLogin.tsx` | 52 | `tssecurity:S8475` | Ensure that tainted data is sanitized before being written to browser storage. |
| 29 | `MINOR` | `frontend/src/screens/public/TenantLogin.tsx` | 53 | `tssecurity:S8475` | Ensure that tainted data is sanitized before being written to browser storage. |
| 30 | `MINOR` | `frontend/src/screens/public/TenantLogin.tsx` | 55 | `tssecurity:S8475` | Ensure that tainted data is sanitized before being written to browser storage. |
| 31 | `MINOR` | `frontend/src/App.tsx` | 212 | `tssecurity:S8475` | Ensure that tainted data is sanitized before being written to browser storage. |
| 32 | `MINOR` | `frontend/src/App.tsx` | 215 | `tssecurity:S8475` | Ensure that tainted data is sanitized before being written to browser storage. |
| 33 | `MINOR` | `backend/src/app.js` | 6 | `javascript:S5689` | This framework implicitly discloses version information by default. Make sure it is safe here. |
| 34 | `MAJOR` | `backend/src/app.js` | 8 | `javascript:S5122` | Make sure that enabling CORS is safe here. |

### 🔍 Principais Causas das Vulnerabilidades:
1. **Log Injection / Sensitive Data Logging (CWE-117)**: Uso de `console.log` passando parâmetros da requisição (`req.body`, `paymentId`, `email`, etc.) sem sanitização.
2. **Armazenamento de Dados Não Sanitizados (CWE-79 / Storage Tainting)**: Gravando tokens/dados recebidos direto em `localStorage` sem validação de tipo/schema.
3. **Geração de Valores Pseudoaleatórios Inseguros (CWE-330)**: Uso de `Math.random()` em código que gera tokens/códigos (deve usar `crypto.randomBytes` ou `crypto.randomInt`).
4. **Construção Insegura de URLs (CWE-918 / SSRF)**: Interpolação de inputs de usuários diretamente no path da requisição sem validação.
5. **Configuração de CORS e Cabeçalhos Express**: Falta de desativação do `x-powered-by` (`app.disable('x-powered-by')`) e CORS excessivamente permissivo.

---

## 🐛 3. Detalhamento de Bugs (43 encontrados)

| # | Severidade | Arquivo | Linha | Regra | Descrição |
| :- | :- | :- | :-: | :- | :-- |
| 1 | `MINOR` | `frontend/src/screens/admin/AdminAssinatura.tsx` | 1689 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 2 | `MINOR` | `frontend/src/screens/admin/AdminAssinatura.tsx` | 1703 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 3 | `MINOR` | `frontend/src/screens/admin/AdminAssinatura.tsx` | 1819 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 4 | `MINOR` | `frontend/src/screens/admin/AdminAssinatura.tsx` | 1833 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 5 | `MINOR` | `frontend/src/screens/admin/AdminAuditoria.tsx` | 383 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 6 | `MINOR` | `frontend/src/screens/admin/AdminAuditoria.tsx` | 425 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 7 | `MINOR` | `frontend/src/screens/admin/AdminAuditoria.tsx` | 574 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 8 | `MINOR` | `frontend/src/screens/admin/AdminAuditoria.tsx` | 575 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 9 | `MINOR` | `frontend/src/screens/admin/AdminConfiguracoes.tsx` | 1440 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 10 | `MINOR` | `frontend/src/screens/admin/AdminConfiguracoes.tsx` | 1930 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 11 | `MINOR` | `tela cliente/src/App.tsx` | 844 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 12 | `MINOR` | `tela cliente/src/App.tsx` | 848 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 13 | `MINOR` | `tela cliente/src/App.tsx` | 892 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 14 | `MINOR` | `tela cliente/src/App.tsx` | 896 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 15 | `MINOR` | `frontend/src/components/AdminTopbar.tsx` | 131 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 16 | `MINOR` | `frontend/src/components/AdminTopbar.tsx` | 205 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 17 | `MINOR` | `frontend/src/screens/public/PortalNovaReserva.tsx` | 345 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 18 | `MINOR` | `tela cliente/src/components/CheckoutDrawer.tsx` | 110 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 19 | `MINOR` | `tela cliente/src/components/MyReservations.tsx` | 297 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 20 | `MINOR` | `tela cliente/src/components/PixModal.tsx` | undefined | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 21 | `MINOR` | `docs/architecture_map.html` | 428 | `Web:MouseEventWithoutKeyboardEquivalentCheck` | Add a 'onKeyDown/onKeyUp' attribute to this <div> tag. |
| 22 | `MINOR` | `docs/architecture_map.html` | 429 | `Web:MouseEventWithoutKeyboardEquivalentCheck` | Add a 'onKeyDown/onKeyUp' attribute to this <div> tag. |
| 23 | `MINOR` | `docs/architecture_map.html` | 430 | `Web:MouseEventWithoutKeyboardEquivalentCheck` | Add a 'onKeyDown/onKeyUp' attribute to this <div> tag. |
| 24 | `MINOR` | `docs/architecture_map.html` | 431 | `Web:MouseEventWithoutKeyboardEquivalentCheck` | Add a 'onKeyDown/onKeyUp' attribute to this <div> tag. |
| 25 | `MINOR` | `docs/architecture_map.html` | 432 | `Web:MouseEventWithoutKeyboardEquivalentCheck` | Add a 'onKeyDown/onKeyUp' attribute to this <div> tag. |
| 26 | `MAJOR` | `docs/architecture_map.html` | 436 | `Web:InputWithoutLabelCheck` | Associate a valid label to this input field. |
| 27 | `MINOR` | `docs/architecture_map.html` | 585 | `Web:MouseEventWithoutKeyboardEquivalentCheck` | Add a 'onKeyDown/onKeyUp' attribute to this <div> tag. |
| 28 | `MINOR` | `docs/architecture_map.html` | 586 | `Web:MouseEventWithoutKeyboardEquivalentCheck` | Add a 'onKeyDown/onKeyUp' attribute to this <div> tag. |
| 29 | `MINOR` | `frontend/src/screens/public/Checkout.tsx` | 344 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 30 | `MAJOR` | `frontend/src/assets/css/landing.css` | 667 | `css:S4656` | Duplicate property "display" |
| 31 | `MINOR` | `frontend/src/components/AdminSidebar.tsx` | 41 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 32 | `MINOR` | `frontend/src/components/Sidebar.tsx` | 49 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 33 | `MINOR` | `frontend/src/screens/admin/AdminConfiguracoes.tsx` | 1439 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 34 | `MINOR` | `frontend/src/screens/admin/AdminConfiguracoes.tsx` | 1718 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 35 | `MINOR` | `frontend/src/screens/admin/AdminConfiguracoes.tsx` | 1719 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 36 | `MINOR` | `frontend/src/screens/admin/AdminConfiguracoes.tsx` | 1929 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 37 | `MINOR` | `frontend/src/screens/admin/AdminConfiguracoes.tsx` | 2075 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 38 | `MINOR` | `frontend/src/screens/admin/AdminConfiguracoes.tsx` | 2076 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 39 | `MINOR` | `frontend/src/screens/admin/AdminPagamentos.tsx` | 963 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 40 | `MINOR` | `frontend/src/screens/admin/AdminReservas.tsx` | 140 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 41 | `MINOR` | `frontend/src/screens/admin/AdminReservas.tsx` | 171 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 42 | `MINOR` | `frontend/src/screens/admin/AdminReservas.tsx` | 203 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| 43 | `MINOR` | `frontend/src/components/ui.tsx` | 30 | `typescript:S1082` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |

---

## 🔴 4. Detalhamento dos Problemas Críticos (47 itens)

A maioria dos problemas críticos do SonarCloud no projeto está ligada à **Complexidade Cognitiva Excessiva** (funções muito longas com muitos `if/else`, `try/catch` e loops aninhados) e 1 erro de `await` desnecessário:

| # | Arquivo | Linha | Mensagem |
| :- | :-- | :-: | :-- |
| 1 | `backend/src/controllers/publicController.js` | 391 | Refactor this function to reduce its Cognitive Complexity from 20 to the 15 allowed. |
| 2 | `backend/src/controllers/publicController.js` | 441 | Refactor this function to reduce its Cognitive Complexity from 21 to the 15 allowed. |
| 3 | `backend/src/controllers/publicController.js` | 1035 | Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed. |
| 4 | `frontend/src/screens/admin/AdminAssinatura.tsx` | 114 | Refactor this function to reduce its Cognitive Complexity from 27 to the 15 allowed. |
| 5 | `frontend/src/screens/admin/AdminConfiguracoes.tsx` | 66 | Refactor this function to reduce its Cognitive Complexity from 17 to the 15 allowed. |
| 6 | `tela cliente/src/components/PixModal.tsx` | 121 | Refactor this function to reduce its Cognitive Complexity from 17 to the 15 allowed. |
| 7 | `backend/src/jobs/cronSaaS.js` | undefined | Refactor this function to reduce its Cognitive Complexity from 17 to the 15 allowed. |
| 8 | `backend/src/controllers/auditoriaController.js` | undefined | Refactor this function to reduce its Cognitive Complexity from 24 to the 15 allowed. |
| 9 | `backend/src/controllers/reservasController.js` | undefined | Refactor this function to reduce its Cognitive Complexity from 29 to the 15 allowed. |
| 10 | `backend/src/routes/tenantAssinaturaRoutes.js` | undefined | Refactor this function to reduce its Cognitive Complexity from 18 to the 15 allowed. |
| 11 | `backend/src/routes/tenantAssinaturaRoutes.js` | undefined | Refactor this function to reduce its Cognitive Complexity from 18 to the 15 allowed. |
| 12 | `frontend/src/App.tsx` | 79 | Refactor this function to reduce its Cognitive Complexity from 17 to the 15 allowed. |
| 13 | `frontend/src/screens/admin/AdminAssinatura.tsx` | 324 | Refactor this function to reduce its Cognitive Complexity from 71 to the 15 allowed. |
| 14 | `frontend/src/screens/admin/AdminAssinatura.tsx` | undefined | Refactor this function to reduce its Cognitive Complexity from 27 to the 15 allowed. |
| 15 | `frontend/src/screens/admin/AdminConfiguracoes.tsx` | 108 | Refactor this function to reduce its Cognitive Complexity from 45 to the 15 allowed. |
| 16 | `frontend/src/screens/admin/AdminPagamentos.tsx` | 149 | Refactor this function to reduce its Cognitive Complexity from 26 to the 15 allowed. |
| 17 | `frontend/src/screens/admin/AdminReservas.tsx` | 214 | Refactor this function to reduce its Cognitive Complexity from 43 to the 15 allowed. |
| 18 | `frontend/src/screens/admin/AdminReservas.tsx` | 775 | Refactor this function to reduce its Cognitive Complexity from 22 to the 15 allowed. |
| 19 | `tela cliente/src/App.tsx` | 164 | Refactor this function to reduce its Cognitive Complexity from 18 to the 15 allowed. |
| 20 | `backend/src/controllers/publicController.js` | 479 | Refactor this function to reduce its Cognitive Complexity from 24 to the 15 allowed. |
| 21 | `backend/src/controllers/publicController.js` | undefined | Refactor this function to reduce its Cognitive Complexity from 19 to the 15 allowed. |
| 22 | `tela cliente/src/App.tsx` | undefined | Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed. |
| 23 | `backend/src/controllers/authController.js` | undefined | Refactor this function to reduce its Cognitive Complexity from 32 to the 15 allowed. |
| 24 | `backend/src/controllers/publicController.js` | 876 | Refactor this function to reduce its Cognitive Complexity from 21 to the 15 allowed. |
| 25 | `frontend/src/screens/public/Checkout.tsx` | undefined | Refactor this function to reduce its Cognitive Complexity from 17 to the 15 allowed. |
| 26 | `tela cliente/src/components/CheckoutDrawer.tsx` | undefined | Unexpected `await` of a non-Promise (non-"Thenable") value. |
| 27 | `backend/src/controllers/publicController.js` | 1672 | Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed. |
| 28 | `backend/src/services/gatewayService.js` | undefined | Refactor this function to reduce its Cognitive Complexity from 18 to the 15 allowed. |
| 29 | `backend/src/controllers/publicController.js` | 686 | Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed. |
| 30 | `backend/src/controllers/publicController.js` | undefined | Refactor this function to reduce its Cognitive Complexity from 33 to the 15 allowed. |
| 31 | `frontend/src/screens/admin/AdminClientes.tsx` | undefined | Refactor this function to reduce its Cognitive Complexity from 25 to the 15 allowed. |
| 32 | `tela cliente/src/components/LoginScreen.tsx` | undefined | Refactor this function to reduce its Cognitive Complexity from 20 to the 15 allowed. |
| 33 | `backend/src/controllers/publicController.js` | undefined | Refactor this function to reduce its Cognitive Complexity from 29 to the 15 allowed. |
| 34 | `backend/src/controllers/publicController.js` | 1223 | Refactor this function to reduce its Cognitive Complexity from 39 to the 15 allowed. |
| 35 | `backend/src/controllers/saasController.js` | undefined | Refactor this function to reduce its Cognitive Complexity from 24 to the 15 allowed. |
| 36 | `backend/src/middlewares/auth.js` | undefined | Refactor this function to reduce its Cognitive Complexity from 18 to the 15 allowed. |
| 37 | `frontend/src/screens/MasterConfiguracoes.tsx` | undefined | Refactor this function to reduce its Cognitive Complexity from 22 to the 15 allowed. |
| 38 | `tela cliente/src/components/PixModal.tsx` | undefined | Refactor this function to reduce its Cognitive Complexity from 17 to the 15 allowed. |
| 39 | `backend/src/controllers/pagamentosController.js` | undefined | Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed. |
| 40 | `backend/src/routes/gatewayRoutes.js` | undefined | Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed. |
| 41 | `backend/src/routes/gatewayRoutes.js` | undefined | Refactor this function to reduce its Cognitive Complexity from 44 to the 15 allowed. |
| 42 | `backend/src/routes/tenantAssinaturaRoutes.js` | undefined | Refactor this function to reduce its Cognitive Complexity from 18 to the 15 allowed. |
| 43 | `frontend/src/screens/MasterArenaDetalhe.tsx` | undefined | Refactor this function to reduce its Cognitive Complexity from 19 to the 15 allowed. |
| 44 | `frontend/src/screens/admin/AdminReservas.tsx` | 972 | Refactor this function to reduce its Cognitive Complexity from 16 to the 15 allowed. |
| 45 | `frontend/src/screens/admin/AdminDashboard.tsx` | undefined | Refactor this function to reduce its Cognitive Complexity from 19 to the 15 allowed. |
| 46 | `frontend/src/screens/admin/AdminReservas.tsx` | undefined | Refactor this function to reduce its Cognitive Complexity from 19 to the 15 allowed. |
| 47 | `frontend/src/screens/admin/AdminReservas.tsx` | 1202 | Refactor this function to reduce its Cognitive Complexity from 28 to the 15 allowed. |

---

## 🧹 5. Top 15 Regras Mais Frequentes (Code Smells & Padrões)

| Regra Sonar | Ocorrências | Tipo | Severidade | Exemplo de Recomendação |
| :--- | :---: | :---: | :---: | :--- |
| `typescript:S3358` | **83** | `CODE_SMELL` | `MAJOR` | Extract this nested ternary operation into an independent statement. |
| `javascript:S7773` | **74** | `CODE_SMELL` | `MINOR` | Prefer `Number.parseFloat` over `parseFloat`. |
| `javascript:S6582` | **70** | `CODE_SMELL` | `MINOR` | Prefer using an optional chain expression instead, as it's more concise and easier to read. |
| `typescript:S7773` | **38** | `CODE_SMELL` | `MINOR` | Prefer `Number.isNaN` over `isNaN`. |
| `typescript:S6853` | **36** | `CODE_SMELL` | `MAJOR` | A form label must be associated with a control. |
| `typescript:S6759` | **34** | `CODE_SMELL` | `MINOR` | Mark the props of the component as read-only. |
| `typescript:S1082` | **34** | `BUG` | `MINOR` | Visible, non-interactive elements with click handlers must have at least one keyboard listener. |
| `javascript:S7772` | **27** | `CODE_SMELL` | `MINOR` | Prefer `node:crypto` over `crypto`. |
| `typescript:S6848` | **27** | `CODE_SMELL` | `MAJOR` | Avoid non-native interactive elements. If using native HTML is not possible, add an appropriate role and support for tabbing, mouse, keyboard, and touch inputs to an interactive content element. |
| `javascript:S3776` | **24** | `CODE_SMELL` | `CRITICAL` | Refactor this function to reduce its Cognitive Complexity from 20 to the 15 allowed. |
| `typescript:S3776` | **22** | `CODE_SMELL` | `CRITICAL` | Refactor this function to reduce its Cognitive Complexity from 27 to the 15 allowed. |
| `typescript:S1128` | **19** | `CODE_SMELL` | `MINOR` | Remove this unused import of 'Sparkles'. |
| `javascript:S2486` | **17** | `CODE_SMELL` | `MINOR` | Handle this exception, don't catch it at all, or explain in a comment why it is ignored. |
| `typescript:S6582` | **17** | `CODE_SMELL` | `MINOR` | Prefer using an optional chain expression instead, as it's more concise and easier to read. |
| `tssecurity:S8475` | **13** | `VULNERABILITY` | `MINOR` | Ensure that tainted data is sanitized before being written to browser storage. |

---

## 📁 6. Top 15 Arquivos com Mais Apontamentos

| Arquivo | Total | 🐛 Bugs | 🛡️ Vulns | 🧹 Code Smells |
| :--- | :---: | :---: | :---: | :---: |
| `backend/src/controllers/publicController.js` | **62** | 0 | 4 | 58 |
| `frontend/src/screens/admin/AdminConfiguracoes.tsx` | **48** | 8 | 0 | 40 |
| `frontend/src/screens/admin/AdminReservas.tsx` | **47** | 3 | 0 | 44 |
| `backend/src/controllers/saasController.js` | **45** | 0 | 3 | 42 |
| `frontend/src/screens/admin/AdminAssinatura.tsx` | **33** | 4 | 0 | 29 |
| `tela cliente/src/App.tsx` | **29** | 4 | 1 | 24 |
| `backend/src/routes/tenantAssinaturaRoutes.js` | **23** | 0 | 0 | 23 |
| `tela cliente/src/components/PixModal.tsx` | **20** | 1 | 2 | 17 |
| `backend/src/services/gatewayService.js` | **20** | 0 | 3 | 17 |
| `backend/src/routes/gatewayRoutes.js` | **19** | 0 | 3 | 16 |
| `docs/architecture_map.html` | **18** | 8 | 0 | 10 |
| `frontend/src/App.tsx` | **15** | 0 | 7 | 8 |
| `frontend/src/screens/MasterFinanceiro.tsx` | **15** | 0 | 0 | 15 |
| `frontend/src/screens/admin/AdminPagamentos.tsx` | **13** | 1 | 0 | 12 |
| `frontend/src/screens/public/PortalNovaReserva.tsx` | **13** | 1 | 0 | 12 |

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
