-- Migração 002: Conversão de Valores Monetários para Centavos
-- Todas as colunas de valor que antes operavam com decimais (REAL) serão tratadas como inteiros (INTEGER) representando centavos.

-- 1. Tabela Quadras (preco_base e modalidades JSON)
UPDATE Quadras SET preco_base = CAST(ROUND(preco_base * 100) AS INTEGER);
UPDATE Quadras
SET modalidades = (
    SELECT json_group_array(
        json_set(value, '$.preco', CAST(ROUND(json_extract(value, '$.preco') * 100) AS INTEGER))
    )
    FROM json_each(Quadras.modalidades)
)
WHERE modalidades IS NOT NULL AND modalidades != '[]' AND modalidades != '';

-- 2. Tabela Reservas (valor_total)
UPDATE Reservas SET valor_total = CAST(ROUND(valor_total * 100) AS INTEGER);

-- 3. Tabela Pagamentos (valor)
UPDATE Pagamentos SET valor = CAST(ROUND(valor * 100) AS INTEGER);

-- 4. Tabela TransacoesGateway (valor)
UPDATE TransacoesGateway SET valor = CAST(ROUND(valor * 100) AS INTEGER);

-- 5. Tabela PlanosSaaS (valor_mensal, valor_anual)
UPDATE PlanosSaaS SET valor_mensal = CAST(ROUND(valor_mensal * 100) AS INTEGER);
UPDATE PlanosSaaS SET valor_anual = CAST(ROUND(valor_anual * 100) AS INTEGER);

-- 6. Tabela FaturasSaaS (valor)
UPDATE FaturasSaaS SET valor = CAST(ROUND(valor * 100) AS INTEGER);
