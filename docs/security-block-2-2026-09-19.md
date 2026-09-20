# Módulo 2 — identidade e revogação

Implementação local de 19/09/2026. Nenhuma publicação nem migração no banco real foi
executada; os testes usam SQLite em memória e entrega de e-mail simulada.

## Avaliação do plano

O módulo contém 20 itens: 10 estavam marcados e 10 pendentes. A descrição recebida
de “14 itens, 8 concluídos e 10 pendentes” não correspondia à lista.

Os dois proxies Vite e imports de `apiFetch` já existiam. A maior parte da migração
foi retirar headers bearer, condições baseadas em tokens locais e login por URL.
O verificador TOTP já rejeitava o segredo conhecido; a defesa foi preservada,
acompanhada da limpeza dos dados. HTTP 403 mantém a sessão e mostra o erro da
operação; somente 401 de uma chamada autenticada invalida o estado local.

## Entregas

- Supabase: nenhum consumidor ativo nas interfaces; removidos o módulo com
  placeholders e a dependência direta dos dois manifests e lockfiles. Não existe
  fluxo Supabase para justificar um segundo validador.
- Cliente HTTP em cada SPA: cookies da própria origem, CSRF, limpeza dos nomes
  antigos, evento de sessão expirada e logout no servidor. Credenciais em URL e
  bearer não autenticam. O perfil salvo serve apenas à exibição.
- `passwordService`: senha atual, política de 8 caracteres/72 bytes, segundo fator
  master, atualização condicional e revogação de todas as sessões anteriores.
  `/api/auth/alterar-senha` atende todos os perfis; a rota master é um alias e a
  rota de perfil do atleta permanece exclusiva de Cliente. A sessão corrente é
  renovada; as demais permanecem revogadas.
- Formulário de troca de senha da equipe na barra superior; formulário do atleta
  exige senha atual. Recuperação master tem campo para o autenticador.
- Criação de equipe e criação de arena pelo master usam senha aleatória
  inacessível e `activation_pending=1`. Convite com finalidade `activation`,
  uma hora de validade e consumo único libera a conta. Recuperação comum não
  ativa convites nem desbloqueia usuários desabilitados. Editar usuário não
  permite definir diretamente a senha de outra pessoa.
- Links de recuperação opacos, sem ID de usuário. Emissão invalida o desafio
  anterior atomicamente; reset invalida os demais desafios do usuário. Tentativa
  com segundo fator incorreto também consome o limite do desafio master.
- Respostas genéricas de solicitação, entrega desacoplada da resposta e mesmo
  trabalho de bcrypt para reset de atleta desconhecido/inválido. Isso reduz
  diferenças observáveis; não se afirma tempo de rede matematicamente constante.
- Migração 4: remove TOTP padrão em texto ou cifrado, descarta cadastros MFA
  pendentes e provas antigas, revoga sessões e recuperações anteriores. O setup
  individual, confirmação e códigos de recuperação de uso único foram mantidos.
- Reset master fixo retirado. Scripts antigos com fixtures só executam em testes;
  simuladores de pagamento também ficam limitados a `NODE_ENV=test`.

## Validação e limites

Regressões cobrem Google com assinatura/emissor/audiência/validade incorretos e
identidade legítima; revogação, expiração UTC, reset concorrente, convite único,
política de senha e proteção master contra a rota atleta. Testes HTTP usam o banco
real SQLite isolado, não mocks de consultas. As SPAs têm testes do cliente HTTP
para CSRF, 401, preservação de 403, rejeição de outra origem e falha de logout.

Resultados locais:

- Backend: `npm run test:security` — 144 testes passaram, incluindo navegador real.
- Painel: `npm test -- --no-file-parallelism` — 61 testes passaram.
- Atleta: `npm test` — 31 testes passaram.
- TypeScript: `tsc --noEmit -p tsconfig.app.json` passou nas duas interfaces.
- Builds: painel padrão e atleta com `--base=/athlete/` passaram.
- `git diff --check` sem erros; busca estática sem bearer/leitura ou escrita de
  tokens legados no código das interfaces e sem dependência Supabase nos lockfiles.

A execução simultânea de todas as validações causou timeout em um teste do painel;
a suíte completa passou ao executar os arquivos sem paralelismo. Vite exigiu
execução fora do sandbox Windows para algumas leituras do esbuild. Os builds ainda
avisam sobre Browserslist desatualizado e tamanho do bundle administrativo.

O provedor, os domínios e o proxy serão escolhidos antes de produção, por decisão
do responsável. [Modelo de topologia e sequência de rollout](proxy-topology.md).
O teste com conta Google real e os ensaios HTTPS nos navegadores de produção
continuam dependentes dessa configuração. A migração é entregue, mas ainda não
foi aplicada ao ambiente real.
