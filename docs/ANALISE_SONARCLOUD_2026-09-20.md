# Análise do SonarCloud — 20/09/2026

Consulta correspondente ao painel público do SonarCloud após a execução do plano de segurança e auditoria (commits de 20/09/2026).

## Projeto correspondente ao código atual

O `sonar-project.properties` aponta para **Felipecoder07_avalie-papai**. Sua última análise em **20 de setembro de 2026, 15h24** reflete os commits recentes empurrados para a branch principal.

[Painel atual](https://sonarcloud.io/project/overview?id=Felipecoder07_avalie-papai)

| Indicador | Resultado |
| --- | ---: |
| Vulnerabilidades (Segurança) | 9 |
| Bugs (Confiabilidade) | 91 |
| Security hotspots (Pontos de interesse) | 100% (Revisados/UM) |
| Code smells (Manutenibilidade) | 405 |
| Segurança / confiabilidade / manutenibilidade | E / E / A (UM) |
| Duplicação geral | 0,9% |
| Cobertura | – |
| Quality Gate | Fracassado |
| Linhas de Código | 116 mil |

---

## 🛡️ Detalhamento de Vulnerabilidades Restantes (Segurança: E)

A esteira de segurança aponta um saldo de **9 vulnerabilidades abertas**. Estas não são falhas de arquitetura (já resolvidas), mas sim violações de regras estáticas de código.

### 1. `javascript:S6437` — Hardcoded Credentials (CRÍTICO)
* **Local:** `backend/tests/security_audit_review.cjs` (Linha 59)
* **Descrição do Sonar:** "Revoke and change this password, as it is compromised."
* **Como solucionar:** O Sonar identificou uma senha ou chave chumbada no código de teste (hardcoded). A solução é remover a string estática e injetá-la via variável de ambiente (`process.env.TEST_PASSWORD`) ou usar mocks dinâmicos.

### 2. `jssecurity:S5145` — Sensitive Data Logging (MAJOR/MINOR)
* **Locais (Exemplos):** `backend/src/controllers/saasController.js`, `gatewayRoutes.js`, `emailService.js`
* **Descrição do Sonar:** "Change this code to not log user-controlled data."
* **Como solucionar:** O uso de `console.log(req.body)` ou logs com parâmetros enviados pelo usuário permite injeção de log (Log Forging). Para solucionar, deve-se sanitizar ou mapear explicitamente os campos seguros (ex: `console.log({ id: req.body.id })`) em vez de imprimir o objeto inteiro.

### 3. `tssecurity:S8475` — Browser Storage Tainting (MINOR)
* **Locais (Exemplos):** `frontend/src/App.tsx`, `TenantLogin.tsx`
* **Descrição do Sonar:** "Ensure that tainted data is sanitized before being written to browser storage."
* **Como solucionar:** Inserir tokens JWT e dados diretos da API no `localStorage` sem sanitização é barrado pelo Sonar. A recomendação do SonarCloud é validar a estrutura usando schemas (como o Zod) antes da inserção ou usar cookies `HttpOnly` seguros.

### 4. `jssecurity:S7044` / `S8476` — Insecure Request URL (MAJOR)
* **Locais (Exemplos):** `tela cliente/src/components/PixModal.tsx`, `gatewayRoutes.js`
* **Descrição do Sonar:** "Change this code to not construct the URL's path from user-controlled data."
* **Como solucionar:** Concatenação de URL direta (Ex: `` fetch(`/api/pagamento/${id}`) ``) é acusada como SSRF. A solução recomendada é usar `URLSearchParams` nativo ou validar o `id` com Regex estrito antes da chamada.

---

## 🐛 Detalhamento de Bugs Restantes (Confiabilidade: E)

Os **91 bugs** ativos afetam predominantemente a acessibilidade (A11y) no React.

### 1. `typescript:S1082` — Missing Keyboard Listener
* **Locais (Exemplos):** `AdminAssinatura.tsx`, `AdminAuditoria.tsx`, `App.tsx`
* **Descrição do Sonar:** "Visible, non-interactive elements with click handlers must have at least one keyboard listener."
* **Como solucionar:** Aplicar `onClick` em elementos como `<div>` ou `<span>` sem adicionar um manipulador `onKeyDown` ou `onKeyUp` quebra a acessibilidade. A solução é trocar a tag para `<button>` ou adicionar a prop de teclado (`onKeyDown={(e) => { if (e.key === 'Enter') handle() }}`).

---

## 🧹 Code Smells (Manutenibilidade)

Os **405 code smells** são infrações de manutenibilidade que não afetam a execução. A principal infração recorrente é a `javascript:S3776` (Cognitive Complexity), onde métodos como o `checkout` do `AdminAssinatura.tsx` e `publicController.js` ultrapassam a nota limite 15 de complexidade ciclomática.

* **Solução recomendada pelo Sonar:** Quebrar os métodos gigantes em pequenas funções privadas e remover cadeias longas de `if/else` aninhados.
