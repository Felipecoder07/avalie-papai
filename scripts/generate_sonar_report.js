const fs = require('fs');

const summary = JSON.parse(fs.readFileSync('sonar_summary.json', 'utf8'));
const raw = JSON.parse(fs.readFileSync('sonar_issues_raw.json', 'utf8'));

let md = `# 📊 Relatório Completo de Análise SonarCloud - Arenix

**Data da Coleta:** ${new Date().toLocaleString('pt-BR')}
**Projeto no SonarCloud:** \`Felipecoder07_avalie-papai\`
**Total de Problemas Encontrados:** **${summary.total}**

---

## 📈 1. Resumo Geral por Categoria e Severidade

| Tipo de Problema | Quantidade | Descrição / Impacto |
| :--- | :---: | :--- |
| 🛡️ **Vulnerabilidades (Security)** | **${summary.byType.VULNERABILITY || 0}** | Riscos de segurança, injeção de log, sanitização e sanitização de storage |
| 🐛 **Bugs (Reliability / A11y)** | **${summary.byType.BUG || 0}** | Acessibilidade (click sem teclado), duplicidades em CSS, formulários sem label |
| 🧹 **Code Smells (Maintainability)** | **${summary.byType.CODE_SMELL || 0}** | Complexidade cognitiva alta, ternários aninhados, padrões modernos de JS/TS |

### 🚦 Distribuição por Severidade

| Severidade | Quantidade | Percentual |
| :--- | :---: | :---: |
| 🔴 **CRITICAL** | **${summary.bySeverity.CRITICAL || 0}** | ${((summary.bySeverity.CRITICAL / summary.total) * 100).toFixed(1)}% |
| 🟠 **MAJOR** | **${summary.bySeverity.MAJOR || 0}** | ${((summary.bySeverity.MAJOR / summary.total) * 100).toFixed(1)}% |
| 🟡 **MINOR** | **${summary.bySeverity.MINOR || 0}** | ${((summary.bySeverity.MINOR / summary.total) * 100).toFixed(1)}% |
| ⚪ **INFO** | **${summary.bySeverity.INFO || 0}** | ${((summary.bySeverity.INFO / summary.total) * 100).toFixed(1)}% |

---

## 🛡️ 2. Detalhamento de Vulnerabilidades (${summary.vulnerabilities.length} encontradas)

As vulnerabilidades afetam diretamente a segurança da aplicação:

| # | Severidade | Arquivo | Linha | Regra | Descrição do SonarCloud |
| :- | :- | :- | :-: | :- | :-- |
${summary.vulnerabilities.map((v, i) => `| ${i+1} | \`${v.severity}\` | \`${v.cleanComponent}\` | ${v.line} | \`${v.rule}\` | ${v.message.replace(/\|/g, '/')} |`).join('\n')}

### 🔍 Principais Causas das Vulnerabilidades:
1. **Log Injection / Sensitive Data Logging (CWE-117)**: Uso de \`console.log\` passando parâmetros da requisição (\`req.body\`, \`paymentId\`, \`email\`, etc.) sem sanitização.
2. **Armazenamento de Dados Não Sanitizados (CWE-79 / Storage Tainting)**: Gravando tokens/dados recebidos direto em \`localStorage\` sem validação de tipo/schema.
3. **Geração de Valores Pseudoaleatórios Inseguros (CWE-330)**: Uso de \`Math.random()\` em código que gera tokens/códigos (deve usar \`crypto.randomBytes\` ou \`crypto.randomInt\`).
4. **Construção Insegura de URLs (CWE-918 / SSRF)**: Interpolação de inputs de usuários diretamente no path da requisição sem validação.
5. **Configuração de CORS e Cabeçalhos Express**: Falta de desativação do \`x-powered-by\` (\`app.disable('x-powered-by')\`) e CORS excessivamente permissivo.

---

## 🐛 3. Detalhamento de Bugs (${summary.bugs.length} encontrados)

| # | Severidade | Arquivo | Linha | Regra | Descrição |
| :- | :- | :- | :-: | :- | :-- |
${summary.bugs.map((b, i) => `| ${i+1} | \`${b.severity}\` | \`${b.cleanComponent}\` | ${b.line} | \`${b.rule}\` | ${b.message.replace(/\|/g, '/')} |`).join('\n')}

---

## 🔴 4. Detalhamento dos Problemas Críticos (${summary.blockerCriticalMajor.filter(x => x.severity === 'CRITICAL').length} itens)

A maioria dos problemas críticos do SonarCloud no projeto está ligada à **Complexidade Cognitiva Excessiva** (funções muito longas com muitos \`if/else\`, \`try/catch\` e loops aninhados) e 1 erro de \`await\` desnecessário:

| # | Arquivo | Linha | Mensagem |
| :- | :-- | :-: | :-- |
${summary.blockerCriticalMajor.filter(x => x.severity === 'CRITICAL').map((c, i) => `| ${i+1} | \`${c.cleanComponent}\` | ${c.line} | ${c.message.replace(/\|/g, '/')} |`).join('\n')}

---

## 🧹 5. Top 15 Regras Mais Frequentes (Code Smells & Padrões)

| Regra Sonar | Ocorrências | Tipo | Severidade | Exemplo de Recomendação |
| :--- | :---: | :---: | :---: | :--- |
${summary.topRules.slice(0, 15).map(r => `| \`${r.rule}\` | **${r.count}** | \`${r.type}\` | \`${r.severity}\` | ${r.messageSample.replace(/\|/g, '/')} |`).join('\n')}

---

## 📁 6. Top 15 Arquivos com Mais Apontamentos

| Arquivo | Total | 🐛 Bugs | 🛡️ Vulns | 🧹 Code Smells |
| :--- | :---: | :---: | :---: | :---: |
${summary.topFiles.slice(0, 15).map(f => `| \`${f.file}\` | **${f.count}** | ${f.types.BUG || 0} | ${f.types.VULNERABILITY || 0} | ${f.types.CODE_SMELL || 0} |`).join('\n')}

---

## 🛠️ 7. Plano de Ação Recomendado para Correção

1. **Fase 1 - Segurança Imediata (32 Vulnerabilidades)**
   - Trocar logs com dados brutos por logs parametrizados/sanitizados.
   - Substituir \`Math.random()\` em \`publicController.js\` por \`crypto.randomBytes\` / \`crypto.randomInt\`.
   - Adicionar \`app.disable('x-powered-by')\` e ajustar política de CORS em \`backend/src/app.js\`.
   - Sanitizar dados antes de salvar no \`localStorage\`.

2. **Fase 2 - Correção de Bugs e Acessibilidade (43 Bugs)**
   - Corrigir \`tela cliente/src/components/CheckoutDrawer.tsx:96\` (remover \`await\` de valor não-Promise).
   - Adicionar \`onKeyDown\` / \`role="button"\` / \`tabIndex={0}\` ou converter \`div\` clicáveis em \`<button>\` nos componentes React.
   - Corrigir CSS duplicado em \`landing.css:667\`.

3. **Fase 3 - Refatoração de Complexidade Crítica (41 Críticos)**
   - Quebrar funções gigantes em controllers (\`publicController.js:355\` com complexidade 84, \`AdminAssinatura.tsx:106\` com 71) em funções auxiliares menores (helpers/services).

4. **Fase 4 - Modernização e Limpeza Automatizável (646 Code Smells)**
   - Trocar \`parseInt\` -> \`Number.parseInt\` e \`isNaN\` -> \`Number.isNaN\`.
   - Aplicar optional chaining (\`a?.b\`).
   - Trocar \`require('fs')\` por \`require('node:fs')\` / \`node:path\`.
   - Extrair ternários aninhados em variáveis ou funções auxiliares.
`;

fs.writeFileSync('RELATORIO_SONARCLOUD.md', md, 'utf8');
console.log('Successfully generated RELATORIO_SONARCLOUD.md');
