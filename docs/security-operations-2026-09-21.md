# Operação após as correções locais — 21/09/2026

Este documento prepara a implantação; não registra publicação, rotação de tokens
reais ou aprovação de integração externa. O usuário confirmou que ainda não tem
domínio/hospedagem definidos. Os `.env` reais não foram alterados.

## Ambiente atual

SMTP e credenciais Google/Mercado Pago estão presentes no `.env` do backend.
Os client IDs Google das duas interfaces correspondem ao backend. Isso não
comprova que as origens e callbacks estejam liberados nos consoles dos provedores.
O callback MP aponta para `https://arenix.com.br`; precisa ser revisto quando houver
domínio real. O token MP configurado não tem prefixo `TEST-`: não foi usado em
requisições de teste nem considerado evidência de conta sandbox.

O `.env` local não define modo de produção, segredo de sessão/JWT, origens CORS,
URL pública, proxies nem chaves de cifragem. Não copiar o exemplo por cima dele:
adicionar as configurações de produção no ambiente de hospedagem, preservando as
credenciais existentes e usando valores próprios desse ambiente.

Não foi encontrada integração Supabase no código executável/dependências das três
aplicações. RLS não se aplica ao armazenamento SQLite atual; revisar novamente se
Supabase for incorporado ou se existir recurso externo fora deste repositório.

## Chaves e migração dos segredos existentes

As novas escritas com chave configurada usam AES-256-GCM em envelope
`enc:v2:<keyId>:<iv>:<tag>:<ciphertext>`. O ID da chave participa da autenticação.
Leitura de `enc:v1` continua disponível com a chave antiga; produção rejeita
segredos de banco em texto claro. Sem configuração de chaves, desenvolvimento
mantém compatibilidade, mas não deve ser considerado armazenamento protegido.

1. Provisionar arquivo de chaves fora do diretório da aplicação e do banco, por
   exemplo `/etc/arenix/secret-keys.json`, com dono do serviço e modo `0600` no Linux.
   JSON esperado: objeto com IDs e valores aleatórios de 32 bytes em hexadecimal.
   Gerar cada valor com `crypto.randomBytes(32)`, nunca usar os valores das fixtures.
2. Definir `SECRETS_KEYRING_FILE` e `SECRETS_ACTIVE_KEY_ID`. Um secret manager pode
   fornecer `SECRETS_KEYRING` diretamente como JSON; não definir as duas fontes juntas.
3. Se existir envelope v1, preservar sua chave em `legacy` no keyring ou em
   `SECRETS_ENCRYPTION_KEY`. Não gerar outra chave com o mesmo ID.
4. Pausar as escritas, criar backup SQLite consistente e testar sua abertura/restauração
   em cópia isolada. Fazer uma simulação sobre a cópia antes de aplicar no banco ativo.
5. Com as chaves injetadas pelo ambiente, executar a partir de `backend`:

   ```sh
   node scripts/rotate_secrets.js --db /caminho/absoluto/copia.sqlite
   node scripts/rotate_secrets.js --db /caminho/absoluto/copia.sqlite --apply
   ```

   Sem `--apply`, o banco é aberto somente para leitura. O relatório contém apenas
   contagens e ID da chave ativa. A aplicação inclui tokens de arena, credenciais MP
   master/webhook/OAuth, TOTP e cadastros pendentes de MFA; uma falha reverte o lote.
6. Repetir no banco ativo somente depois do ensaio. Executar novamente em simulação:
   `changed` deve ser zero. Verificar acesso MFA e leitura de credenciais antes de
   reabrir o serviço. Não misturar processos antigos que não leem v2 com o código novo.
7. A atualização de colunas não higieniza backups antigos ou todas as páginas livres
   de snapshots anteriores. Manter esses arquivos sob acesso restrito/armazenamento
   cifrado; em manutenção, checkpoint/truncamento do WAL e VACUUM eliminam cópias
   lógicas residuais no banco atual. Não prometer apagamento físico seguro de SSD.

Para a próxima rotação, adicionar outro ID e chave ao keyring, manter os anteriores,
trocar `SECRETS_ACTIVE_KEY_ID` e repetir a simulação/aplicação. Só retirar chaves antigas
depois que nenhum dado ativo depender delas e que a retenção de backups tenha sido
tratada. A recuperação de um backup antigo depende das chaves correspondentes,
guardadas separadamente e com acesso auditado.

Isso troca a chave de cifragem; não troca tokens, senhas ou secrets nos provedores.
Rotação por suspeita de exposição exige emitir credenciais novas no provedor e
coordenar reconexão de arenas/webhooks, sem descartar eventos pendentes.

## Proxy, TLS e publicação

Os arquivos `deploy/nginx.conf.template` e `deploy/arenix.service.example` são
modelos para Nginx + Linux em uma máquina. Não foram instalados nem testados por
`nginx -t` neste Windows (Nginx não está disponível). Ajustar à hospedagem escolhida.

- API escuta em `127.0.0.1` por padrão em produção. `TRUST_PROXY` aceita somente
  IPs/CIDRs explícitos; a aplicação rejeita sockets externos à lista antes dos
  limitadores. Se houver outro proxy/CDN, modelar todos os saltos e redes reais.
- Nginx sobrescreve `X-Forwarded-For` com o IP da conexão. Nunca confiar no cabeçalho
  recebido de qualquer cliente ou habilitar confiança universal por conveniência.
- Publicar somente os builds em `/srv/arenix/www`. Build do atleta precisa de
  `npm run build -- --base=/athlete/` e fica em `www/athlete`; o painel fica na raiz.
- Renderizar apenas `${ARENIX_DOMAIN}` no template (não expandir `$host`, `$scheme`
  ou outras variáveis do Nginx); definir DNS/certificados e executar `nginx -t`.
- Validar HTTPS e redirecionamento antes de habilitar HSTS no proxy ou
  `ENABLE_HSTS=true` no backend. Não habilitar `includeSubDomains`/preload sem avaliar
  todos os hosts afetados. As páginas estáticas também recebem CSP e headers.
- Bloquear externamente a porta Node. Somente o proxy serve tráfego público;
  desenvolvimento/Vite preview não substituem o serviço de produção.
- Validar login/logout/CSRF dos dois portais no host final e ajustar as origens
  Google e o callback MP correspondente. Nunca transportar sessão por query string.

## Banco, backups e arquivos públicos

O modelo systemd usa usuário dedicado, `UMask=0077`, código somente leitura e
escrita limitada a dados/uploads/backups. Criar diretórios antes de iniciar o
serviço; restringir arquivos existentes também (o umask só afeta criações novas).
No Windows, conferir as ACLs da hospedagem em vez de assumir que chmod resolve.

`BACKUP_DIR` permite separar backups do código e das chaves. O script de backup
usa SQLite VACUUM INTO e restringe o arquivo novo. A restauração deve ocorrer em
cópia isolada primeiro, com `PRAGMA integrity_check` e conferência de contagens,
somas e dependências das chaves. Backups não devem ser servidos pelo servidor web.

Backend e template bloqueiam arquivos de banco, dotfiles, backups e sourcemaps.
`npm run check:public` inspeciona os dois builds, rejeita nomes proibidos/symlinks
e procura valores literais de credenciais do `.env` do backend sem imprimi-los.
O teste não prova ausência de todo segredo codificado/ofuscado ou configuração
externa incorreta; conferir também a pasta realmente publicada.

## Homologação externa e operação

Sem domínio/hospedagem e confirmação de contas sandbox, estes passos ficam abertos:

1. Validar Google e pagamentos em contas de teste: OAuth/state, Pix e métodos
   habilitados, valores/moeda/recebedor, parcial, repetição, estorno e SaaS.
2. Exercitar webhooks reais do sandbox com consulta autenticada e falha temporária.
   Preservar notificações para retry; não devolver 200 para eventos perdidos.
3. Verificar filas pendentes de PaymentIntents, RefundIntents e SecurityOutbox;
   alertar sobre crescimento/idade, falhas de autenticação e alterações privilegiadas.
   Logs/alertas não devem incluir tokens, payloads de pagamento ou PII desnecessária.
4. Testar portas, IP forjado, cookies, headers, uploads, restauração e acesso a arquivos
   no ambiente publicado. Conferir usuários privilegiados e revogar sessões legadas.
5. Em incidente, suspender escritas afetadas mantendo persistência/retry do provedor.
   Reconciliar eventos posteriores ao backup antes de qualquer restauração financeira;
   não reativar rotas vulneráveis ou apagar pagamentos novos por rollback.

A divergência pré-existente de 2 centavos na reserva 110 continua dependente de
conciliação do dado real. Nenhum script novo altera saldos nem faz reembolso automático.
