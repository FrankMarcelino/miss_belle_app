-- Adicionar flag de isenção à tabela de assinaturas
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS is_exempt boolean NOT NULL DEFAULT false;

-- Marcar a clínica da própria dona (Miss Belle) como isenta
UPDATE subscriptions
SET is_exempt = true
WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
