-- Migração 001: Schema de Segurança (Módulo 6)

-- 1. Criação de Tabelas Novas
CREATE TABLE IF NOT EXISTS IdentidadesExternas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  subject TEXT NOT NULL,
  evidencia TEXT,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES Usuarios(id),
  UNIQUE (provider, subject)
);

CREATE TABLE IF NOT EXISTS ConvitesRecuperacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER,
  hash TEXT UNIQUE NOT NULL,
  finalidade TEXT NOT NULL, -- 'recuperacao', 'convite', etc
  expira_em DATETIME NOT NULL,
  tentativas INTEGER DEFAULT 0,
  usado INTEGER DEFAULT 0,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES Usuarios(id)
);

CREATE TABLE IF NOT EXISTS Visitantes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  reserva_id INTEGER,
  hash TEXT UNIQUE NOT NULL,
  escopo TEXT NOT NULL,
  expira_em DATETIME NOT NULL,
  revogado INTEGER DEFAULT 0,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES Arenas(id),
  FOREIGN KEY (reserva_id) REFERENCES Reservas(id)
);

-- 2. Modificação da Tabela Usuarios para unicidade por tenant e novos campos de sessão
CREATE TABLE Usuarios_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER,
  cliente_id INTEGER,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  senha_hash TEXT NOT NULL,
  perfil TEXT CHECK(perfil IN ('Administrador', 'Gerente', 'Recepcionista', 'Cliente', 'SuperAdmin')) NOT NULL,
  two_factor_secret TEXT,
  ativo INTEGER DEFAULT 1,
  criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
  reset_password_token TEXT,
  reset_password_expires DATETIME,
  activation_pending INTEGER DEFAULT 0,
  session_version INTEGER DEFAULT 1,
  expiracao_utc DATETIME,
  FOREIGN KEY (tenant_id) REFERENCES Arenas(id),
  FOREIGN KEY (cliente_id) REFERENCES Clientes(id)
);

-- Migração de dados de Usuarios
INSERT INTO Usuarios_new (id, tenant_id, cliente_id, nome, email, senha_hash, perfil, two_factor_secret, ativo, criado_em, reset_password_token, reset_password_expires, activation_pending)
SELECT id, tenant_id, cliente_id, nome, email, senha_hash, perfil, two_factor_secret, ativo, criado_em, reset_password_token, reset_password_expires, activation_pending 
FROM Usuarios;

CREATE UNIQUE INDEX idx_usuarios_email ON Usuarios_new (email);

-- Renomear tabelas (Aviso: SQLite não suporta bem drop com foreign keys apontando, mas com PRAGMA foreign_keys=OFF durante a transação isso funciona. O db.run() usa transação implícita se usarmos BEGIN, mas o pragma deve estar garantido. Aqui apenas renomeamos).
DROP TABLE Usuarios;
ALTER TABLE Usuarios_new RENAME TO Usuarios;

-- 3. Adicionar campos nas Faturas e Integrações
-- Como SQLite não suporta ADD COLUMN se ela já existe facilmente sem erro no script .sql, 
-- usaremos nomes novos ou assumimos que o script falha se a coluna existir, 
-- mas nós não as temos ainda no banco base.
ALTER TABLE FaturasSaaS ADD COLUMN chave_idempotente TEXT;
CREATE UNIQUE INDEX idx_faturas_idemp ON FaturasSaaS(chave_idempotente);

ALTER TABLE TransacoesGateway ADD COLUMN chave_idempotente TEXT;
CREATE UNIQUE INDEX idx_trans_idemp ON TransacoesGateway(chave_idempotente);

-- O Módulo 6 também pediu para criar uma referência única ao crédito online em Pagamentos
ALTER TABLE Pagamentos ADD COLUMN gateway_ref TEXT;
CREATE UNIQUE INDEX idx_pag_gateway_ref ON Pagamentos(gateway_ref);
ALTER TABLE Pagamentos ADD COLUMN estorno_id INTEGER REFERENCES Pagamentos(id);

-- Para Integrações (Segredos cifrados ou referências ao gerenciador de segredos, com versão da chave)
ALTER TABLE ConfiguracoesSaaS ADD COLUMN versao_chave INTEGER DEFAULT 1;
ALTER TABLE Arenas ADD COLUMN versao_chave INTEGER DEFAULT 1;
