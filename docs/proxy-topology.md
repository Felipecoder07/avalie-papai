# Proxy e publicação dos portais

Status: **modelo local, não publicado**. Em 19/09/2026 foi confirmado que domínio,
hospedagem e proxy serão escolhidos antes da produção. Essa decisão e a validação
em HTTPS continuam pendentes.

Atualização de 21/09/2026: modelos ampliados em `deploy/nginx.conf.template` e
`deploy/arenix.service.example`; preparação, chaves e limites de validação em
[operação de segurança](security-operations-2026-09-21.md). O usuário confirmou
novamente que ainda não existe domínio. Os modelos não foram publicados.

## Contrato implementado

- As duas interfaces chamam `/api/...` na própria origem. `VITE_BACKEND_URL` não
  direciona mais autenticação para outro site. `/uploads/...` também usa o proxy.
- `cm_session`: HttpOnly, Secure em produção, SameSite=Lax, Path=/ e sem Domain.
  `cm_csrf` fica legível pelo cliente HTTP, que envia `x-csrf-token` nas chamadas.
- Cookie, consulta da sessão e permissões atuais são obrigatórios no servidor.
  Bearer e credenciais recebidas pela URL não autenticam.
- Os proxies Vite existentes atendem desenvolvimento. `vite preview` não substitui
  o proxy de produção.

## Modelo de uma origem com duas SPAs

Painel em `/`, portal do atleta em `/arena/<slug>`, API em `/api/`. Para impedir
colisão entre os diretórios `assets` dos dois builds, publicar assim:

1. Build do painel: `npm run build` em `frontend`.
2. Build do atleta: `npm run build -- --base=/athlete/` em `tela cliente`.
3. Copiar `frontend/dist` para `/srv/arenix/www/` e o conteúdo de
   `tela cliente/dist` para `/srv/arenix/www/athlete/`.

Exemplo de rotas Nginx dentro de um servidor HTTPS já configurado, com certificados
e domínio definidos pelo operador:

```nginx
root /srv/arenix/www;

location ^~ /api/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_no_cache 1;
    proxy_cache_bypass 1;
}
location ^~ /uploads/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
}
location ^~ /arena/ {
    try_files $uri /athlete/index.html;
}
location /athlete/ {
    try_files $uri =404;
}
location / {
    try_files $uri /index.html;
}
```

O exemplo não configura TLS, CSP dos arquivos estáticos, cache de HTML, limites de
upload nem isolamento de rede. A configuração final precisa preservar as políticas
do backend e impedir acesso público direto à porta 3000. Não cachear respostas de
autenticação, perfis ou respostas com Set-Cookie.

Definir `NODE_ENV=production`, `FRONTEND_URL=https://<dominio-do-painel>`,
`CORS_ALLOWED_ORIGINS` com as origens HTTPS exatas e `TRUST_PROXY` apenas com os IPs
ou redes reais dos proxies confiáveis. Não usar wildcard, Domain compartilhado ou
SameSite=None como ajuste genérico.

Na mesma origem, os dois portais compartilham a sessão; entrar com outra conta
substitui a conta atual daquele navegador. Se forem escolhidos hosts diferentes,
cada host deve ter seu próprio `/api` e cookie host-only. Isso implica logins
independentes; não transmitir sessão em query string. Atualizar também os links
do painel para o portal quando os domínios forem definidos.

## Ordem de publicação

O backend anterior já introduziu sessões revogáveis. Este pacote termina a
transição: interfaces sem bearer, backend somente cookie e migração 4.

1. Validar cópia de backup e ensaiar a migração com dados de homologação.
2. Publicar os novos clientes e backend em janela coordenada; invalidar HTML antigo
   nos caches. Não manter instâncias antigas de backend atendendo simultaneamente.
3. A migração 4 revoga todas as sessões anteriores, invalida recuperações antigas e
   remove TOTP padrão, inclusive cifrado. Cada usuário precisará entrar novamente;
   masters afetados precisarão cadastrar e confirmar um autenticador individual.
4. Validar cookies, CSRF, logout, recuperação/convite, troca de senha e expiração em
   Chrome, Firefox e Safari sobre os domínios reais. Confirmar que os dois bundles
   carregam em suas rotas e que as respostas privadas não são cacheadas.
5. Configurar `GOOGLE_CLIENT_ID` e `VITE_GOOGLE_CLIENT_ID` correspondentes e testar
   login real, incluindo vinculação a conta existente com senha.

Não marcar a entrega operacional como concluída antes desse ensaio. Reverter uma
publicação não deve reativar sessões revogadas nem restaurar os segredos padrão.
