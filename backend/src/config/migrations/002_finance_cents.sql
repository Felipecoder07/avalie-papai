-- Migracao 002: conversao unica de valores monetarios legados para centavos.
-- Bancos legados declaram as colunas monetarias como REAL. Bancos novos ja
-- usam INTEGER e ja armazenam centavos. O marcador tambem protege uma
-- execucao direta e repetida deste arquivo, fora do runner de migracoes.

CREATE TABLE IF NOT EXISTS _Migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS FinanceUnitMetadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 1. Quadras (preco base e precos por modalidade)
UPDATE Quadras
SET preco_base = CAST(ROUND(preco_base * 100) AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM FinanceUnitMetadata WHERE key = 'money_unit')
  AND NOT EXISTS (SELECT 1 FROM _Migrations WHERE name = '002_finance_cents.sql')
  AND UPPER(COALESCE((SELECT type FROM pragma_table_info('Quadras') WHERE name = 'preco_base'), '')) = 'REAL';

UPDATE Quadras
SET modalidades = (
  SELECT json_group_array(
    json(
      CASE
        WHEN type = 'object' AND json_type(value, '$.preco') IN ('integer', 'real')
          THEN json_set(value, '$.preco', CAST(ROUND(json_extract(value, '$.preco') * 100) AS INTEGER))
        WHEN type IN ('object', 'array') THEN value
        ELSE json_quote(value)
      END
    )
  )
  FROM json_each(Quadras.modalidades)
)
WHERE modalidades IS NOT NULL
  AND modalidades != '[]'
  AND modalidades != ''
  AND NOT EXISTS (SELECT 1 FROM FinanceUnitMetadata WHERE key = 'money_unit')
  AND NOT EXISTS (SELECT 1 FROM _Migrations WHERE name = '002_finance_cents.sql')
  AND UPPER(COALESCE((SELECT type FROM pragma_table_info('Quadras') WHERE name = 'preco_base'), '')) = 'REAL';

-- 2. Reservas
UPDATE Reservas
SET valor_total = CAST(ROUND(valor_total * 100) AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM FinanceUnitMetadata WHERE key = 'money_unit')
  AND NOT EXISTS (SELECT 1 FROM _Migrations WHERE name = '002_finance_cents.sql')
  AND UPPER(COALESCE((SELECT type FROM pragma_table_info('Reservas') WHERE name = 'valor_total'), '')) = 'REAL';

-- 3. Pagamentos
UPDATE Pagamentos
SET valor = CAST(ROUND(valor * 100) AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM FinanceUnitMetadata WHERE key = 'money_unit')
  AND NOT EXISTS (SELECT 1 FROM _Migrations WHERE name = '002_finance_cents.sql')
  AND UPPER(COALESCE((SELECT type FROM pragma_table_info('Pagamentos') WHERE name = 'valor'), '')) = 'REAL';

-- 4. Transacoes do gateway
UPDATE TransacoesGateway
SET valor = CAST(ROUND(valor * 100) AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM FinanceUnitMetadata WHERE key = 'money_unit')
  AND NOT EXISTS (SELECT 1 FROM _Migrations WHERE name = '002_finance_cents.sql')
  AND UPPER(COALESCE((SELECT type FROM pragma_table_info('TransacoesGateway') WHERE name = 'valor'), '')) = 'REAL';

-- 5. Planos SaaS
UPDATE PlanosSaaS
SET valor_mensal = CAST(ROUND(valor_mensal * 100) AS INTEGER),
    valor_anual = CAST(ROUND(valor_anual * 100) AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM FinanceUnitMetadata WHERE key = 'money_unit')
  AND NOT EXISTS (SELECT 1 FROM _Migrations WHERE name = '002_finance_cents.sql')
  AND UPPER(COALESCE((SELECT type FROM pragma_table_info('PlanosSaaS') WHERE name = 'valor_mensal'), '')) = 'REAL';

-- 6. Faturas SaaS
UPDATE FaturasSaaS
SET valor = CAST(ROUND(valor * 100) AS INTEGER)
WHERE NOT EXISTS (SELECT 1 FROM FinanceUnitMetadata WHERE key = 'money_unit')
  AND NOT EXISTS (SELECT 1 FROM _Migrations WHERE name = '002_finance_cents.sql')
  AND UPPER(COALESCE((SELECT type FROM pragma_table_info('FaturasSaaS') WHERE name = 'valor'), '')) = 'REAL';

INSERT INTO FinanceUnitMetadata(key, value)
VALUES ('money_unit', 'cents')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
