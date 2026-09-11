const db = require('./database');

const initDb = () => {
  db.serialize(() => {
    // Tabela Arenas (Empresas/Locais)
    db.run(`
      CREATE TABLE IF NOT EXISTS Arenas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        endereco TEXT,
        telefone TEXT,
        email TEXT,
        notif_reserva_email INTEGER DEFAULT 1,
        notif_reserva_whatsapp INTEGER DEFAULT 0,
        notif_cancelamento_email INTEGER DEFAULT 1,
        notif_pagamento_email INTEGER DEFAULT 1,
        alerta_pagamento_minutos INTEGER DEFAULT 30,
        horario_abertura TEXT DEFAULT '06:00',
        horario_fechamento TEXT DEFAULT '23:00',
        status INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run("ALTER TABLE Arenas ADD COLUMN horario_abertura TEXT DEFAULT '06:00'", () => {});
    db.run("ALTER TABLE Arenas ADD COLUMN horario_fechamento TEXT DEFAULT '23:00'", () => {});
    db.run("ALTER TABLE Arenas ADD COLUMN chave_pix TEXT", () => {});
    db.run("ALTER TABLE Arenas ADD COLUMN titular_pix TEXT", () => {});
    db.run("ALTER TABLE Arenas ADD COLUMN cidade_pix TEXT DEFAULT 'SAO PAULO'", () => {});
    db.run("ALTER TABLE Arenas ADD COLUMN foto_capa TEXT", () => {});

    // Tabela Usuarios (Admin, Gerente, Recepcionista)
    db.run(`
      CREATE TABLE IF NOT EXISTS Usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER,
        cliente_id INTEGER,
        nome TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        senha_hash TEXT NOT NULL,
        perfil TEXT CHECK(perfil IN ('Administrador', 'Gerente', 'Recepcionista', 'Cliente', 'SuperAdmin')) NOT NULL,
        two_factor_secret TEXT,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES Arenas(id),
        FOREIGN KEY (cliente_id) REFERENCES Clientes(id)
      )
    `);

    // Tabela SessoesAtivas
    db.run(`
      CREATE TABLE IF NOT EXISTS SessoesAtivas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        tenant_id INTEGER,
        token TEXT UNIQUE NOT NULL,
        ip TEXT,
        user_agent TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        ultimo_acesso DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migração automática e atualização de 2FA
    db.run("ALTER TABLE Usuarios ADD COLUMN two_factor_secret TEXT", (err) => {
      db.run("UPDATE Usuarios SET two_factor_secret = 'JBSWY3DPEHPK3PXP' WHERE perfil = 'SuperAdmin' AND two_factor_secret IS NULL");
    });

    // Migrações para recuperação de senha
    db.run("ALTER TABLE Usuarios ADD COLUMN reset_password_token TEXT", (err) => {});
    db.run("ALTER TABLE Usuarios ADD COLUMN reset_password_expires DATETIME", (err) => {});

    // Tabela Clientes (sem restrição UNIQUE global no e-mail/cpf para suporte multiarena)
    db.run(`
      CREATE TABLE IF NOT EXISTS Clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL DEFAULT 1,
        nome TEXT NOT NULL,
        telefone TEXT,
        email TEXT,
        cpf TEXT,
        ativo INTEGER DEFAULT 1,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES Arenas (id)
      )
    `);

    // Migração automática: adiciona colunas em Clientes se não existirem
    db.run("ALTER TABLE Clientes ADD COLUMN ativo INTEGER DEFAULT 1", () => {});
    db.run("ALTER TABLE Clientes ADD COLUMN avatar_url TEXT", () => {});


    // Tabela Quadras
    db.run(`
      CREATE TABLE IF NOT EXISTS Quadras (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        nome TEXT NOT NULL,
        tipo TEXT,
        preco_base REAL NOT NULL,
        hora_abertura TIME DEFAULT '07:00',
        hora_fechamento TIME DEFAULT '22:00',
        status TEXT DEFAULT 'Ativa',
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migração automática: adiciona modalidades em Quadras se não existir
    db.run("ALTER TABLE Quadras ADD COLUMN modalidades TEXT DEFAULT '[\"Beach Tennis\", \"Vôlei de Praia\", \"Futevôlei\"]'", () => {});

    // Tabela Reservas
    db.run(`
      CREATE TABLE IF NOT EXISTS Reservas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER DEFAULT 1,
        cliente_id INTEGER NOT NULL,
        quadra_id INTEGER NOT NULL,
        data_reserva DATE NOT NULL,
        hora_inicio TIME NOT NULL,
        hora_fim TIME NOT NULL,
        valor_total REAL NOT NULL,
        status TEXT DEFAULT 'Confirmada', 
        status_pagamento TEXT DEFAULT 'Pendente',
        motivo_cancelamento_id INTEGER,
        observacoes_cancelamento TEXT,
        criado_por INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cliente_id) REFERENCES Clientes (id),
        FOREIGN KEY (quadra_id) REFERENCES Quadras (id),
        FOREIGN KEY (criado_por) REFERENCES Usuarios (id)
      )
    `);

    db.run("ALTER TABLE Reservas ADD COLUMN codigo_validacao_cancelamento TEXT", () => {});
    db.run("ALTER TABLE Reservas ADD COLUMN grupo_id TEXT", () => {});
    db.run("ALTER TABLE Reservas ADD COLUMN esporte TEXT DEFAULT 'Geral'", () => {});

    // Tabela Pagamentos
    db.run(`
      CREATE TABLE IF NOT EXISTS Pagamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reserva_id INTEGER NOT NULL,
        valor REAL NOT NULL,
        metodo TEXT NOT NULL,
        registrado_por INTEGER,
        registrado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reserva_id) REFERENCES Reservas (id),
        FOREIGN KEY (registrado_por) REFERENCES Usuarios (id)
      )
    `);

    // Tabela TransacoesGateway
    db.run(`
      CREATE TABLE IF NOT EXISTS TransacoesGateway (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        reserva_id INTEGER NOT NULL,
        gateway_ref TEXT NOT NULL UNIQUE,
        valor REAL NOT NULL,
        status TEXT NOT NULL,
        metodo TEXT NOT NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (reserva_id) REFERENCES Reservas (id)
      )
    `);

    // Tabela Bloqueios
    db.run(`
      CREATE TABLE IF NOT EXISTS Bloqueios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        quadra_id INTEGER NOT NULL,
        data_bloqueio DATE NOT NULL,
        hora_inicio TIME NOT NULL,
        hora_fim TIME NOT NULL,
        motivo TEXT NOT NULL,
        criado_por INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quadra_id) REFERENCES Quadras (id),
        FOREIGN KEY (criado_por) REFERENCES Usuarios (id)
      )
    `);

    // Tabela Motivos de Cancelamento
    db.run(`
      CREATE TABLE IF NOT EXISTS MotivosCancelamento (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        motivo TEXT NOT NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES Arenas (id)
      )
    `);

    // Logs Auditoria (Imutáveis)
    db.run(`
      CREATE TABLE IF NOT EXISTS LogsAuditoria (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER,
        usuario_id INTEGER,
        evento TEXT NOT NULL,
        detalhes TEXT,
        ip TEXT,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES Arenas (id)
      )
    `);

    // Tabela de Comunicados/Banners do SaaS
    db.run(`
      CREATE TABLE IF NOT EXISTS ComunicadosSaaS (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        mensagem TEXT NOT NULL,
        destino TEXT NOT NULL,
        canal TEXT NOT NULL,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        expira_em DATETIME NOT NULL,
        ativo INTEGER DEFAULT 1
      )
    `, () => {
      // Seedeando dados padrão para preencher a listagem inicialmente
      db.get('SELECT COUNT(*) as count FROM ComunicadosSaaS', (err, row) => {
        if (row && row.count === 0) {
          db.run("INSERT INTO ComunicadosSaaS (mensagem, destino, canal, expira_em, ativo) VALUES ('Manutenção programada neste sábado das 02h às 04h.', 'all', 'alerta', datetime('now', '+3 days'), 1)");
          // Associa um comunicado real à primeira Arena (ID 1)
          db.run("INSERT INTO ComunicadosSaaS (mensagem, destino, canal, expira_em, ativo) VALUES ('Novo relatório de ocupação disponível no painel.', '1', 'email', datetime('now', '+7 days'), 1)");
        }
      });
    });

    // --- MÓDULO SAAS (BILLING) ---

    // Planos do SaaS
    db.run(`
      CREATE TABLE IF NOT EXISTS PlanosSaaS (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        max_quadras INTEGER NOT NULL,
        max_usuarios INTEGER NOT NULL,
        valor_mensal REAL NOT NULL,
        valor_anual REAL DEFAULT 0,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // População Inicial de Planos Default
    db.get('SELECT COUNT(*) as count FROM PlanosSaaS', (err, row) => {
      if (row && row.count === 0) {
        db.run("INSERT INTO PlanosSaaS (nome, max_quadras, max_usuarios, valor_mensal, valor_anual) VALUES ('Basic', 2, 3, 49.99, 39.99)");
        db.run("INSERT INTO PlanosSaaS (nome, max_quadras, max_usuarios, valor_mensal, valor_anual) VALUES ('Pro', 5, 10, 79.99, 63.99)");
        db.run("INSERT INTO PlanosSaaS (nome, max_quadras, max_usuarios, valor_mensal, valor_anual) VALUES ('Enterprise', 999, 999, 499.90, 399.90)");
      }
    });

    // Faturas Mensais do SaaS
    db.run(`
      CREATE TABLE IF NOT EXISTS FaturasSaaS (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id INTEGER NOT NULL,
        plano_id INTEGER NOT NULL,
        valor REAL NOT NULL,
        data_vencimento DATE NOT NULL,
        data_pagamento DATE,
        status TEXT DEFAULT 'Pendente', -- Pendente, Paga, Atrasada
        gateway_ref TEXT UNIQUE,         -- ID da transação no Mercado Pago
        copia_cola TEXT,                 -- Código Pix copia e cola
        qr_expira_em DATETIME,           -- Expiração do QR Code (24h após geração)
        metodo_pagamento TEXT,           -- Ex: 'Pix Online', 'Manual'
        registrado_por INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES Arenas (id),
        FOREIGN KEY (plano_id) REFERENCES PlanosSaaS (id),
        FOREIGN KEY (registrado_por) REFERENCES Usuarios (id)
      )
    `);

    // Configurações Globais do SaaS
    db.run(`
      CREATE TABLE IF NOT EXISTS ConfiguracoesSaaS (
        chave TEXT PRIMARY KEY,
        valor TEXT NOT NULL,
        atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Configuração Default
    db.get("SELECT COUNT(*) as count FROM ConfiguracoesSaaS WHERE chave = 'dias_tolerancia_bloqueio'", (err, row) => {
      if (row && row.count === 0) {
        db.run("INSERT INTO ConfiguracoesSaaS (chave, valor) VALUES ('dias_tolerancia_bloqueio', '5')");
      }
    });
    db.get("SELECT COUNT(*) as count FROM ConfiguracoesSaaS WHERE chave = 'dias_trial'", (err, row) => {
      if (row && row.count === 0) {
        db.run("INSERT INTO ConfiguracoesSaaS (chave, valor) VALUES ('dias_trial', '14')");
      }
    });
    db.get("SELECT COUNT(*) as count FROM ConfiguracoesSaaS WHERE chave = 'manutencao_ativa'", (err, row) => {
      if (row && row.count === 0) {
        db.run("INSERT INTO ConfiguracoesSaaS (chave, valor) VALUES ('manutencao_ativa', '0')");
      }
    });
    db.get("SELECT COUNT(*) as count FROM ConfiguracoesSaaS WHERE chave = 'manutencao_mensagem'", (err, row) => {
      if (row && row.count === 0) {
        db.run("INSERT INTO ConfiguracoesSaaS (chave, valor) VALUES ('manutencao_mensagem', 'Estamos em manutenção programada. Voltamos em instantes.')");
      }
    });

    // Access Token pessoal do Master para RECEBER pagamentos das mensalidades das arenas
    // DIFERENTE do Client ID/Secret (que são para OAuth dos tenants)
    db.get("SELECT COUNT(*) as count FROM ConfiguracoesSaaS WHERE chave = 'mp_master_access_token'", (err, row) => {
      if (row && row.count === 0) {
        db.run("INSERT INTO ConfiguracoesSaaS (chave, valor) VALUES ('mp_master_access_token', '')");
      }
    });

    // Webhook Secret pessoal do Master para validar assinaturas HMAC de notificações de pagamentos
    db.get("SELECT COUNT(*) as count FROM ConfiguracoesSaaS WHERE chave = 'mp_webhook_secret'", (err, row) => {
      if (row && row.count === 0) {
        db.run("INSERT INTO ConfiguracoesSaaS (chave, valor) VALUES ('mp_webhook_secret', '')");
      }
    });

    // Dias de tolerância antes de limpar cadastros fantasma (nunca pagaram)
    db.get("SELECT COUNT(*) as count FROM ConfiguracoesSaaS WHERE chave = 'dias_abandono_cadastro'", (err, row) => {
      if (row && row.count === 0) {
        db.run("INSERT INTO ConfiguracoesSaaS (chave, valor) VALUES ('dias_abandono_cadastro', '7')");
      }
    });

    // Seed de Motivos de Cancelamento Globais (tenant_id = 0)
    db.get("SELECT COUNT(*) as count FROM MotivosCancelamento WHERE tenant_id = 0", (err, row) => {
      if (row && row.count === 0) {
        db.run("INSERT INTO MotivosCancelamento (tenant_id, motivo) VALUES (0, 'Preço muito alto')");
        db.run("INSERT INTO MotivosCancelamento (tenant_id, motivo) VALUES (0, 'Mudei de sistema')");
        db.run("INSERT INTO MotivosCancelamento (tenant_id, motivo) VALUES (0, 'Arena fechou')");
        db.run("INSERT INTO MotivosCancelamento (tenant_id, motivo) VALUES (0, 'Falta de recursos')");
      }
    });

    // Migrações em Arenas (Tratando erro caso colunas já existam)
    db.run("ALTER TABLE Arenas ADD COLUMN plano_id INTEGER REFERENCES PlanosSaaS(id)", (err) => { /* ignora se já existir */ });
    db.run("ALTER TABLE Arenas ADD COLUMN dia_vencimento INTEGER DEFAULT 10", (err) => {
      // Se não deu erro ao adicionar a coluna (foi adicionada agora), seta o plano 1 para todos
      if (!err) {
        db.run("UPDATE Arenas SET plano_id = 1 WHERE plano_id IS NULL");
      }
    });
    db.run("ALTER TABLE Arenas ADD COLUMN gateway_device_id TEXT", (err) => { /* ignora se já existir */ });
    db.run("ALTER TABLE Arenas ADD COLUMN gateway_access_token TEXT", (err) => { /* ignora se já existir */ });
    db.run("ALTER TABLE Arenas ADD COLUMN gateway_public_key TEXT", (err) => { /* ignora se já existir */ });
    
    // Migração da Coluna Slug Único para Links Públicos
    db.run("ALTER TABLE Arenas ADD COLUMN slug TEXT", () => {
      db.all("SELECT id, nome FROM Arenas WHERE slug IS NULL OR slug = ''", (err, rows) => {
        if (rows && rows.length > 0) {
          rows.forEach(r => {
            const clean = (r.nome || '')
              .toLowerCase()
              .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '');
            const slug = clean || `arena-${r.id}`;
            db.run("UPDATE Arenas SET slug = ? WHERE id = ?", [slug, r.id]);
          });
        }
      });
    });
    db.run("ALTER TABLE Arenas ADD COLUMN fuso_horario TEXT DEFAULT 'America/Sao_Paulo'", (err) => { /* ignora se já existir */ });
    // trial_expira_em: data em que o período de trial da arena encerra.
    // NULL = arena nunca teve trial ou trial foi encerrado manualmente.
    // Enquanto trial_expira_em > date('now'), o cron não gera fatura para esta arena.
    db.run("ALTER TABLE Arenas ADD COLUMN trial_expira_em DATE", (err) => { /* ignora se já existir */ });

    db.run("ALTER TABLE Arenas ADD COLUMN ciclo_cobranca TEXT DEFAULT 'mensal'", (err) => { /* ignora se já existir */ });

    // Migrações de FaturasSaaS — adiciona colunas de Pix para bancos existentes (idempotentes)
    // Nota: SQLite não suporta UNIQUE em ALTER TABLE ADD COLUMN; unicidade garantida pela lógica da aplicação.
    db.run("ALTER TABLE FaturasSaaS ADD COLUMN gateway_ref TEXT", (err) => { /* ignora se já existir */ });
    db.run("ALTER TABLE FaturasSaaS ADD COLUMN copia_cola TEXT", (err) => { /* ignora se já existir */ });
    db.run("ALTER TABLE FaturasSaaS ADD COLUMN qr_expira_em DATETIME", (err) => { /* ignora se já existir */ });
    db.run("ALTER TABLE FaturasSaaS ADD COLUMN metodo_pagamento TEXT", (err) => { /* ignora se já existir */ });
    db.run("ALTER TABLE FaturasSaaS ADD COLUMN ciclo TEXT DEFAULT 'mensal'", (err) => { /* ignora se já existir */ });
    db.run("ALTER TABLE FaturasSaaS ADD COLUMN descricao TEXT", (err) => { /* ignora se já existir */ });
    
    // Tabelas para fluxo OAuth Seguro
    db.run(`
      CREATE TABLE IF NOT EXISTS OAuthStates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        state TEXT UNIQUE NOT NULL,
        tenant_id INTEGER NOT NULL,
        usuario_id INTEGER,
        expira_em DATETIME NOT NULL,
        usado INTEGER DEFAULT 0,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (tenant_id) REFERENCES Arenas(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS OAuthCodesUsados (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code TEXT UNIQUE NOT NULL,
        tenant_id INTEGER,
        criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migração de coerência financeira: atualiza faturas legadas antigas de teste para os valores reais dos planos
    db.run("UPDATE FaturasSaaS SET valor = 49.99 WHERE plano_id = 1 AND valor = 99.9", () => {});
    db.run("UPDATE FaturasSaaS SET valor = 79.99 WHERE plano_id = 2 AND valor = 99.9", () => {});
    
    // Migração de coerência de pagamentos: garante que reservas legadas com status 'Pago' tenham seu registro em Pagamentos com a data correta da reserva
    db.all("SELECT id, valor_total, COALESCE(criado_em, data_reserva || ' 12:00:00') as data_reg FROM Reservas WHERE status_pagamento = 'Pago' AND status != 'Cancelada' AND id NOT IN (SELECT DISTINCT reserva_id FROM Pagamentos)", (err, rows) => {
      if (rows && rows.length > 0) {
        rows.forEach(r => {
          db.run("INSERT INTO Pagamentos (reserva_id, valor, metodo, registrado_por, registrado_em) VALUES (?, ?, 'Pix', 1, ?)", [r.id, r.valor_total, r.data_reg]);
        });
      }
    });

    // Correção de datas para registros de pagamentos migrados retroativamente
    db.run(`
      UPDATE Pagamentos 
      SET registrado_em = (SELECT COALESCE(r.criado_em, r.data_reserva || ' 12:00:00') FROM Reservas r WHERE r.id = Pagamentos.reserva_id)
      WHERE id IN (
        SELECT p.id FROM Pagamentos p 
        JOIN Reservas r ON p.reserva_id = r.id 
        WHERE DATE(p.registrado_em) != r.data_reserva 
          AND r.data_reserva < DATE('now')
          AND p.registrado_em >= DATE('now')
      )
    `, () => {});

    // Alinhamento de coerência para testes legados com Pix de 2 centavos
    db.run("UPDATE Reservas SET valor_total = 0.02 WHERE id IN (79, 85) AND valor_total = 0.01", () => {});
    
    console.log('Tabelas base criadas com sucesso!');
  });
};

module.exports = initDb;
