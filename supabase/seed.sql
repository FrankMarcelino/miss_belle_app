/*
  # Seed Data for Miss Belle App
  
  Popula o banco com dados de teste para validar funcionalidades.
  
  IMPORTANTE: 
  - Este seed assume que você já tem usuários criados no Supabase Auth
  - Os UUIDs de profiles devem corresponder a usuários reais do auth.users
  - Execute este seed DEPOIS de criar pelo menos 3 usuários via signup
  
  Para usar:
  1. Crie 3 usuários via interface de signup:
     - admin@missabelle.com (primeiro usuário = super_admin automático)
     - maria@missabelle.com
     - joao@missabelle.com
  2. Anote os UUIDs dos usuários criados
  3. Substitua os UUIDs abaixo pelos reais
  4. Execute este arquivo no SQL Editor do Supabase
*/

-- ============================================================================
-- CONFIGURAÇÃO: Substitua estes UUIDs pelos IDs reais dos seus usuários
-- ============================================================================
-- Você pode obter os UUIDs executando:
-- SELECT id, email FROM auth.users;

-- IMPORTANTE: Comente/descomente a seção apropriada abaixo

-- OPÇÃO 1: Se você já tem usuários e quer usar IDs reais
-- Substitua pelos UUIDs reais:
/*
DO $$
DECLARE
  admin_id uuid := 'SEU-UUID-DO-ADMIN-AQUI';
  maria_id uuid := 'SEU-UUID-DA-MARIA-AQUI';
  joao_id uuid := 'SEU-UUID-DO-JOAO-AQUI';
BEGIN
  -- O resto do seed usará estas variáveis
END $$;
*/

-- OPÇÃO 2: Para desenvolvimento/teste - IDs fictícios (use se não tiver usuários reais)
-- Este modo NÃO funcionará com autenticação real, apenas para visualizar estrutura de dados

-- ============================================================================
-- LIMPEZA (CUIDADO: Remove todos os dados!)
-- ============================================================================
-- Descomente apenas se quiser limpar tudo antes de popular

-- TRUNCATE TABLE cash_register_transactions CASCADE;
-- TRUNCATE TABLE cash_register_closings CASCADE;
-- TRUNCATE TABLE appointments CASCADE;
-- TRUNCATE TABLE patients CASCADE;
-- TRUNCATE TABLE procedures CASCADE;
-- DELETE FROM profiles WHERE role != 'super_admin'; -- Mantém apenas super_admin

-- ============================================================================
-- SEED DATA
-- ============================================================================

-- Nota: Como os IDs de profiles devem corresponder a auth.users,
-- vamos criar procedures, patients e appointments que funcionam com qualquer usuário

-- ----------------------------------------------------------------------------
-- 1. PROCEDURES (Procedimentos Estéticos)
-- ----------------------------------------------------------------------------
INSERT INTO procedures (id, name, duration_minutes, default_price, is_active, created_at) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'Limpeza de Pele', 60, 150.00, true, NOW()),
  ('a2222222-2222-2222-2222-222222222222', 'Hidratação Facial', 45, 120.00, true, NOW()),
  ('a3333333-3333-3333-3333-333333333333', 'Peeling Químico', 90, 300.00, true, NOW()),
  ('a4444444-4444-4444-4444-444444444444', 'Massagem Relaxante', 50, 180.00, true, NOW()),
  ('a5555555-5555-5555-5555-555555555555', 'Drenagem Linfática', 60, 160.00, true, NOW()),
  ('a6666666-6666-6666-6666-666666666666', 'Design de Sobrancelhas', 30, 80.00, true, NOW()),
  ('a7777777-7777-7777-7777-777777777777', 'Depilação Facial', 20, 60.00, true, NOW()),
  ('a8888888-8888-8888-8888-888888888888', 'Tratamento para Acne', 75, 250.00, true, NOW());

-- ----------------------------------------------------------------------------
-- 2. HELPER FUNCTION: Criar patients para um professional
-- ----------------------------------------------------------------------------
-- Esta função será útil para você adicionar pacientes para seus usuários reais

CREATE OR REPLACE FUNCTION seed_patients_for_professional(prof_id uuid)
RETURNS void AS $$
BEGIN
  INSERT INTO patients (id, full_name, phone, email, notes, professional_id, created_at) VALUES
    (gen_random_uuid(), 'Ana Paula Silva', '(11) 98765-4321', 'ana.silva@email.com', 'Cliente VIP - Prefere manhãs', prof_id, NOW()),
    (gen_random_uuid(), 'Beatriz Costa', '(11) 97654-3210', 'bia.costa@email.com', NULL, prof_id, NOW()),
    (gen_random_uuid(), 'Carla Mendes', '(11) 96543-2109', 'carla.mendes@email.com', 'Pele sensível', prof_id, NOW()),
    (gen_random_uuid(), 'Daniela Oliveira', '(11) 95432-1098', 'dani.oliveira@email.com', NULL, prof_id, NOW()),
    (gen_random_uuid(), 'Elaine Santos', '(11) 94321-0987', 'elaine.santos@email.com', 'Agendamentos apenas após 14h', prof_id, NOW()),
    (gen_random_uuid(), 'Fernanda Lima', '(11) 93210-9876', 'fer.lima@email.com', NULL, prof_id, NOW()),
    (gen_random_uuid(), 'Gabriela Rocha', '(11) 92109-8765', 'gabi.rocha@email.com', 'Cliente desde 2023', prof_id, NOW()),
    (gen_random_uuid(), 'Helena Martins', '(11) 91098-7654', 'helena.martins@email.com', NULL, prof_id, NOW());
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 3. EXEMPLO: Populando para o primeiro usuário da tabela profiles
-- ----------------------------------------------------------------------------
-- Este bloco pega automaticamente o primeiro usuário ativo e cria dados para ele

DO $$
DECLARE
  first_user_id uuid;
  patient1_id uuid;
  patient2_id uuid;
  patient3_id uuid;
  patient4_id uuid;
  closing_today uuid;
  closing_yesterday uuid;
BEGIN
  -- Pega o primeiro usuário ativo
  SELECT id INTO first_user_id FROM profiles WHERE is_active = true LIMIT 1;
  
  IF first_user_id IS NULL THEN
    RAISE NOTICE 'Nenhum usuário encontrado. Crie usuários via signup primeiro.';
    RETURN;
  END IF;
  
  RAISE NOTICE 'Criando dados de teste para usuário: %', first_user_id;
  
  -- Criar pacientes
  PERFORM seed_patients_for_professional(first_user_id);
  
  -- Pegar IDs de alguns pacientes para criar appointments
  SELECT id INTO patient1_id FROM patients WHERE professional_id = first_user_id ORDER BY created_at LIMIT 1 OFFSET 0;
  SELECT id INTO patient2_id FROM patients WHERE professional_id = first_user_id ORDER BY created_at LIMIT 1 OFFSET 1;
  SELECT id INTO patient3_id FROM patients WHERE professional_id = first_user_id ORDER BY created_at LIMIT 1 OFFSET 2;
  SELECT id INTO patient4_id FROM patients WHERE professional_id = first_user_id ORDER BY created_at LIMIT 1 OFFSET 3;
  
  -- ----------------------------------------------------------------------------
  -- APPOINTMENTS - HOJE (para testar conflitos e diferentes status)
  -- ----------------------------------------------------------------------------
  
  -- 09:00 - Limpeza de Pele (60min) - COMPLETED
  INSERT INTO appointments (id, patient_id, procedure_id, professional_id, appointment_date, appointment_time, status, created_by, created_at)
  VALUES (gen_random_uuid(), patient1_id, 'a1111111-1111-1111-1111-111111111111', first_user_id, CURRENT_DATE, '09:00', 'completed', first_user_id, NOW());
  
  -- 10:30 - Design de Sobrancelhas (30min) - CONFIRMED
  INSERT INTO appointments (id, patient_id, procedure_id, professional_id, appointment_date, appointment_time, status, created_by, created_at)
  VALUES (gen_random_uuid(), patient2_id, 'a6666666-6666-6666-6666-666666666666', first_user_id, CURRENT_DATE, '10:30', 'confirmed', first_user_id, NOW());
  
  -- 14:00 - Hidratação Facial (45min) - SCHEDULED
  INSERT INTO appointments (id, patient_id, procedure_id, professional_id, appointment_date, appointment_time, status, created_by, created_at)
  VALUES (gen_random_uuid(), patient3_id, 'a2222222-2222-2222-2222-222222222222', first_user_id, CURRENT_DATE, '14:00', 'scheduled', first_user_id, NOW());
  
  -- 15:00 - Massagem Relaxante (50min) - SCHEDULED
  INSERT INTO appointments (id, patient_id, procedure_id, professional_id, appointment_date, appointment_time, status, created_by, created_at)
  VALUES (gen_random_uuid(), patient4_id, 'a4444444-4444-4444-4444-444444444444', first_user_id, CURRENT_DATE, '15:00', 'scheduled', first_user_id, NOW());
  
  -- 16:30 - Drenagem Linfática (60min) - CANCELLED (com motivo)
  INSERT INTO appointments (id, patient_id, procedure_id, professional_id, appointment_date, appointment_time, status, cancellation_reason, created_by, created_at)
  VALUES (gen_random_uuid(), patient1_id, 'a5555555-5555-5555-5555-555555555555', first_user_id, CURRENT_DATE, '16:30', 'cancelled', 'Cliente precisou remarcar por compromisso urgente', first_user_id, NOW());
  
  -- ----------------------------------------------------------------------------
  -- APPOINTMENTS - AMANHÃ (para visualizar na agenda)
  -- ----------------------------------------------------------------------------
  
  INSERT INTO appointments (id, patient_id, procedure_id, professional_id, appointment_date, appointment_time, status, created_by, created_at)
  VALUES (gen_random_uuid(), patient2_id, 'a1111111-1111-1111-1111-111111111111', first_user_id, CURRENT_DATE + 1, '09:00', 'scheduled', first_user_id, NOW());
  
  INSERT INTO appointments (id, patient_id, procedure_id, professional_id, appointment_date, appointment_time, status, created_by, created_at)
  VALUES (gen_random_uuid(), patient3_id, 'a3333333-3333-3333-3333-333333333333', first_user_id, CURRENT_DATE + 1, '10:30', 'confirmed', first_user_id, NOW());
  
  -- ----------------------------------------------------------------------------
  -- APPOINTMENTS - ONTEM (para histórico)
  -- ----------------------------------------------------------------------------
  
  INSERT INTO appointments (id, patient_id, procedure_id, professional_id, appointment_date, appointment_time, status, created_by, created_at)
  VALUES (gen_random_uuid(), patient1_id, 'a2222222-2222-2222-2222-222222222222', first_user_id, CURRENT_DATE - 1, '10:00', 'completed', first_user_id, NOW() - INTERVAL '1 day');
  
  INSERT INTO appointments (id, patient_id, procedure_id, professional_id, appointment_date, appointment_time, status, created_by, created_at)
  VALUES (gen_random_uuid(), patient4_id, 'a6666666-6666-6666-6666-666666666666', first_user_id, CURRENT_DATE - 1, '14:00', 'completed', first_user_id, NOW() - INTERVAL '1 day');
  
  -- ----------------------------------------------------------------------------
  -- CASH REGISTER - Fechamento de ONTEM (finalizado com transações)
  -- ----------------------------------------------------------------------------
  
  INSERT INTO cash_register_closings (id, professional_id, closing_date, total_amount, is_finalized, finalized_at, created_at)
  VALUES (gen_random_uuid(), first_user_id, CURRENT_DATE - 1, 0, true, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day')
  RETURNING id INTO closing_yesterday;
  
  -- Transações do fechamento de ontem
  INSERT INTO cash_register_transactions (closing_id, appointment_id, amount, payment_method, notes, created_at)
  SELECT 
    closing_yesterday,
    a.id,
    CASE 
      WHEN p.name = 'Hidratação Facial' THEN 120.00
      WHEN p.name = 'Design de Sobrancelhas' THEN 80.00
      ELSE 100.00
    END,
    'PIX',
    'Pagamento do atendimento de ' || pt.full_name,
    NOW() - INTERVAL '1 day'
  FROM appointments a
  JOIN patients pt ON a.patient_id = pt.id
  JOIN procedures p ON a.procedure_id = p.id
  WHERE a.professional_id = first_user_id 
    AND a.appointment_date = CURRENT_DATE - 1
    AND a.status = 'completed';
  
  -- Transação avulsa (sem appointment)
  INSERT INTO cash_register_transactions (closing_id, appointment_id, amount, payment_method, notes, created_at)
  VALUES (closing_yesterday, NULL, 50.00, 'Dinheiro', 'Venda de produto - Sérum Facial', NOW() - INTERVAL '1 day');
  
  -- ----------------------------------------------------------------------------
  -- CASH REGISTER - Fechamento de HOJE (em aberto)
  -- ----------------------------------------------------------------------------
  
  INSERT INTO cash_register_closings (id, professional_id, closing_date, total_amount, is_finalized, created_at)
  VALUES (gen_random_uuid(), first_user_id, CURRENT_DATE, 0, false, NOW())
  RETURNING id INTO closing_today;
  
  -- Transação do agendamento completado de hoje
  INSERT INTO cash_register_transactions (closing_id, appointment_id, amount, payment_method, notes, created_at)
  SELECT 
    closing_today,
    a.id,
    150.00,
    'Cartão de Crédito',
    'Pagamento - Limpeza de Pele',
    NOW()
  FROM appointments a
  WHERE a.professional_id = first_user_id 
    AND a.appointment_date = CURRENT_DATE
    AND a.status = 'completed'
  LIMIT 1;
  
  RAISE NOTICE 'Seed concluído com sucesso!';
  RAISE NOTICE '- Procedures: 8 cadastrados';
  RAISE NOTICE '- Patients: 8 para o usuário %', first_user_id;
  RAISE NOTICE '- Appointments: ~10 (hoje, ontem, amanhã)';
  RAISE NOTICE '- Cash Closings: 2 (ontem finalizado, hoje em aberto)';
  
END $$;

-- ----------------------------------------------------------------------------
-- 4. LIMPEZA: Remove função auxiliar (opcional)
-- ----------------------------------------------------------------------------
-- DROP FUNCTION IF EXISTS seed_patients_for_professional(uuid);

-- ============================================================================
-- INSTRUÇÕES FINAIS
-- ============================================================================
/*
  ✅ SEED EXECUTADO COM SUCESSO!
  
  O que foi criado:
  - 8 procedimentos de estética
  - 8 pacientes para o primeiro usuário ativo
  - ~10 agendamentos (variados por data e status)
  - 2 fechamentos de caixa (1 finalizado, 1 em aberto)
  - Transações vinculadas e avulsas
  
  Para criar dados para outros usuários:
  SELECT seed_patients_for_professional('UUID-DO-USUARIO-AQUI');
  
  Para validar os dados:
  SELECT * FROM procedures;
  SELECT * FROM patients;
  SELECT * FROM appointments WHERE appointment_date >= CURRENT_DATE - 1 ORDER BY appointment_date, appointment_time;
  SELECT * FROM cash_register_closings ORDER BY closing_date DESC;
  SELECT * FROM cash_register_transactions;
  
  Próximos passos:
  1. Acesse o app e faça login
  2. Teste a agenda (deve ver agendamentos de hoje/amanhã)
  3. Teste o caixa (deve ver fechamento de hoje em aberto)
  4. Tente criar agendamento às 09:30 de hoje (deve dar conflito!)
  5. Cancele um agendamento e adicione motivo
  6. Adicione transação no fechamento de hoje e veja total atualizar
*/
