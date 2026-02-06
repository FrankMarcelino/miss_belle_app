/*
  # Seed Data for Miss Belle App (SAFE VERSION)
  
  Esta versão pode ser executada múltiplas vezes sem erro.
  Usa ON CONFLICT para fazer UPSERT em vez de INSERT simples.
  
  Popula o banco com dados de teste para validar funcionalidades.
*/

-- ============================================================================
-- LIMPEZA OPCIONAL (Descomente se quiser limpar antes)
-- ============================================================================
-- TRUNCATE TABLE cash_register_transactions CASCADE;
-- TRUNCATE TABLE cash_register_closings CASCADE;
-- TRUNCATE TABLE appointments CASCADE;
-- TRUNCATE TABLE patients CASCADE;
-- TRUNCATE TABLE procedures CASCADE;
-- TRUNCATE TABLE professional_procedures CASCADE;

-- ============================================================================
-- SEED DATA
-- ============================================================================

DO $$
DECLARE
  first_user_id uuid;
  patient_ids uuid[];
  procedure_ids uuid[];
  yesterday_closing_id uuid;
  today_closing_id uuid;
BEGIN

  -- Obter primeiro usuário ativo
  SELECT id INTO first_user_id
  FROM profiles
  WHERE is_active = true
  ORDER BY created_at
  LIMIT 1;
  
  IF first_user_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum usuário ativo encontrado. Crie pelo menos um usuário primeiro.';
  END IF;
  
  RAISE NOTICE 'Usando usuário: %', first_user_id;

  -- ----------------------------------------------------------------------------
  -- 1. PROCEDURES (UPSERT)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Criando/atualizando procedimentos...';
  
  INSERT INTO procedures (id, name, duration_minutes, default_price, is_active, created_at) VALUES
    ('a1111111-1111-1111-1111-111111111111', 'Limpeza de Pele', 60, 150.00, true, NOW()),
    ('a2222222-2222-2222-2222-222222222222', 'Hidratação Facial', 45, 120.00, true, NOW()),
    ('a3333333-3333-3333-3333-333333333333', 'Peeling Químico', 90, 300.00, true, NOW()),
    ('a4444444-4444-4444-4444-444444444444', 'Massagem Relaxante', 50, 180.00, true, NOW()),
    ('a5555555-5555-5555-5555-555555555555', 'Drenagem Linfática', 60, 160.00, true, NOW()),
    ('a6666666-6666-6666-6666-666666666666', 'Design de Sobrancelhas', 30, 80.00, true, NOW()),
    ('a7777777-7777-7777-7777-777777777777', 'Depilação Facial', 20, 60.00, true, NOW()),
    ('a8888888-8888-8888-8888-888888888888', 'Tratamento para Acne', 75, 250.00, true, NOW())
  ON CONFLICT (id) DO UPDATE
  SET 
    name = EXCLUDED.name,
    duration_minutes = EXCLUDED.duration_minutes,
    default_price = EXCLUDED.default_price,
    is_active = EXCLUDED.is_active;

  -- Guardar IDs dos procedimentos
  SELECT ARRAY_AGG(id) INTO procedure_ids FROM procedures WHERE is_active = true;

  -- ----------------------------------------------------------------------------
  -- 2. LIMPAR DADOS ANTIGOS (ORDEM CORRETA!)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Limpando dados antigos...';
  
  -- IMPORTANTE: Deletar na ordem reversa de dependências!
  -- 1º Transações (dependem de closings e appointments)
  DELETE FROM cash_register_transactions 
  WHERE closing_id IN (
    SELECT id FROM cash_register_closings WHERE professional_id = first_user_id
  );
  
  -- 2º Closings (dependem de professional)
  DELETE FROM cash_register_closings WHERE professional_id = first_user_id;
  
  -- 3º Appointments - TODOS que referenciam pacientes deste profissional
  -- (não apenas os appointments do próprio profissional!)
  DELETE FROM appointments 
  WHERE patient_id IN (
    SELECT id FROM patients WHERE professional_id = first_user_id
  );
  
  -- 4º Patients (agora pode deletar, sem appointments referenciando)
  DELETE FROM patients WHERE professional_id = first_user_id;
  
  -- 5º Professional procedures (associações)
  DELETE FROM professional_procedures WHERE professional_id = first_user_id;

  -- ----------------------------------------------------------------------------
  -- 3. PATIENTS (INSERT)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Criando pacientes...';
  
  INSERT INTO patients (full_name, phone, email, notes, professional_id, created_at) VALUES
    ('Ana Paula Silva', '(11) 98765-4321', 'ana.silva@email.com', 'Cliente VIP - Prefere manhãs', first_user_id, NOW()),
    ('Beatriz Costa', '(11) 97654-3210', 'bia.costa@email.com', NULL, first_user_id, NOW()),
    ('Carla Mendes', '(11) 96543-2109', 'carla.mendes@email.com', 'Pele sensível', first_user_id, NOW()),
    ('Daniela Oliveira', '(11) 95432-1098', 'dani.oliveira@email.com', NULL, first_user_id, NOW()),
    ('Elaine Santos', '(11) 94321-0987', 'elaine.santos@email.com', 'Agendamentos apenas após 14h', first_user_id, NOW()),
    ('Fernanda Lima', '(11) 93210-9876', 'fer.lima@email.com', NULL, first_user_id, NOW()),
    ('Gabriela Rocha', '(11) 92109-8765', 'gabi.rocha@email.com', 'Cliente desde 2023', first_user_id, NOW()),
    ('Helena Martins', '(11) 91098-7654', 'helena.martins@email.com', NULL, first_user_id, NOW())
  RETURNING ARRAY_AGG(id) INTO patient_ids;

  -- ----------------------------------------------------------------------------
  -- 4. APPOINTMENTS (INSERT)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Criando agendamentos...';
  
  -- Inserir novos
  INSERT INTO appointments (patient_id, procedure_id, professional_id, appointment_date, appointment_time, status, created_by) VALUES
    -- Ontem (completados)
    (patient_ids[1], procedure_ids[1], first_user_id, CURRENT_DATE - 1, '09:00', 'completed', first_user_id),
    (patient_ids[2], procedure_ids[2], first_user_id, CURRENT_DATE - 1, '10:30', 'completed', first_user_id),
    (patient_ids[3], procedure_ids[3], first_user_id, CURRENT_DATE - 1, '14:00', 'completed', first_user_id),
    (patient_ids[4], procedure_ids[4], first_user_id, CURRENT_DATE - 1, '16:00', 'completed', first_user_id),
    
    -- Hoje (variados)
    (patient_ids[5], procedure_ids[5], first_user_id, CURRENT_DATE, '09:00', 'confirmed', first_user_id),
    (patient_ids[6], procedure_ids[6], first_user_id, CURRENT_DATE, '10:30', 'scheduled', first_user_id),
    (patient_ids[7], procedure_ids[7], first_user_id, CURRENT_DATE, '11:00', 'scheduled', first_user_id),
    (patient_ids[8], procedure_ids[1], first_user_id, CURRENT_DATE, '14:00', 'cancelled', first_user_id),
    
    -- Amanhã (agendados)
    (patient_ids[1], procedure_ids[2], first_user_id, CURRENT_DATE + 1, '09:00', 'scheduled', first_user_id),
    (patient_ids[2], procedure_ids[3], first_user_id, CURRENT_DATE + 1, '11:00', 'scheduled', first_user_id);

  -- ----------------------------------------------------------------------------
  -- 5. CASH REGISTER CLOSINGS (INSERT)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Criando fechamentos de caixa...';
  
  -- Fechamento de ontem (finalizado)
  INSERT INTO cash_register_closings (professional_id, closing_date, total_amount, is_finalized, finalized_at, notes)
  VALUES (first_user_id, CURRENT_DATE - 1, 0, true, NOW(), 'Fechamento automático do dia anterior')
  RETURNING id INTO yesterday_closing_id;
  
  -- Fechamento de hoje (em aberto)
  INSERT INTO cash_register_closings (professional_id, closing_date, total_amount, is_finalized, notes)
  VALUES (first_user_id, CURRENT_DATE, 0, false, 'Caixa do dia atual')
  RETURNING id INTO today_closing_id;

  -- ----------------------------------------------------------------------------
  -- 6. CASH REGISTER TRANSACTIONS
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Criando transações...';
  
  -- Transações de ontem (vinculadas aos agendamentos completados)
  INSERT INTO cash_register_transactions (closing_id, appointment_id, amount, payment_method, notes)
  SELECT 
    yesterday_closing_id,
    a.id,
    pr.default_price,
    CASE (random() * 3)::int
      WHEN 0 THEN 'Dinheiro'
      WHEN 1 THEN 'Cartão Débito'
      WHEN 2 THEN 'Cartão Crédito'
      ELSE 'PIX'
    END,
    'Pagamento do procedimento'
  FROM appointments a
  JOIN procedures pr ON pr.id = a.procedure_id
  WHERE a.professional_id = first_user_id 
    AND a.appointment_date = CURRENT_DATE - 1
    AND a.status = 'completed';
  
  -- Transação avulsa de ontem
  INSERT INTO cash_register_transactions (closing_id, amount, payment_method, notes)
  VALUES (yesterday_closing_id, 50.00, 'Dinheiro', 'Venda de produto');
  
  -- Transação de hoje (agendamento confirmado já pago)
  INSERT INTO cash_register_transactions (closing_id, appointment_id, amount, payment_method, notes)
  SELECT 
    today_closing_id,
    a.id,
    pr.default_price,
    'PIX',
    'Pagamento antecipado'
  FROM appointments a
  JOIN procedures pr ON pr.id = a.procedure_id
  WHERE a.professional_id = first_user_id 
    AND a.appointment_date = CURRENT_DATE
    AND a.status = 'confirmed'
  LIMIT 1;

  -- ----------------------------------------------------------------------------
  -- 7. PROFESSIONAL PROCEDURES (Associações)
  -- ----------------------------------------------------------------------------
  RAISE NOTICE 'Criando associações profissional-procedimento...';
  
  -- Associar TODOS os procedimentos ao primeiro usuário
  INSERT INTO professional_procedures (professional_id, procedure_id)
  SELECT 
    first_user_id,
    id
  FROM procedures
  WHERE is_active = true
  ON CONFLICT (professional_id, procedure_id) DO NOTHING;
  
  -- Se houver outros usuários, distribuir procedimentos
  -- Usuário 2: Especialista em Facial (Limpeza, Hidratação, Peeling, Acne)
  INSERT INTO professional_procedures (professional_id, procedure_id)
  SELECT 
    p.id,
    pr.id
  FROM profiles p
  CROSS JOIN procedures pr
  WHERE p.id != first_user_id 
    AND p.is_active = true
    AND p.role = 'user'
    AND pr.name IN ('Limpeza de Pele', 'Hidratação Facial', 'Peeling Químico', 'Tratamento para Acne')
  LIMIT 16
  ON CONFLICT (professional_id, procedure_id) DO NOTHING;
  
  -- Usuário 3: Especialista em Corpo (Massagem, Drenagem)
  INSERT INTO professional_procedures (professional_id, procedure_id)
  SELECT 
    p.id,
    pr.id
  FROM profiles p
  CROSS JOIN procedures pr
  WHERE p.id NOT IN (first_user_id, (SELECT MIN(id) FROM profiles WHERE id != first_user_id AND is_active = true))
    AND p.is_active = true
    AND p.role = 'user'
    AND pr.name IN ('Massagem Relaxante', 'Drenagem Linfática')
  LIMIT 8
  ON CONFLICT (professional_id, procedure_id) DO NOTHING;
  
  -- Usuário 4+: Especialista em Estética Facial Rápida (Sobrancelha, Depilação)
  INSERT INTO professional_procedures (professional_id, procedure_id)
  SELECT 
    p.id,
    pr.id
  FROM profiles p
  CROSS JOIN procedures pr
  WHERE p.id NOT IN (
    first_user_id,
    (SELECT id FROM profiles WHERE id != first_user_id AND is_active = true ORDER BY id LIMIT 2)
  )
    AND p.is_active = true
    AND p.role = 'user'
    AND pr.name IN ('Design de Sobrancelhas', 'Depilação Facial')
  LIMIT 10
  ON CONFLICT (professional_id, procedure_id) DO NOTHING;

  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '✅ Seed concluído com sucesso!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '- Procedures: 8 cadastrados';
  RAISE NOTICE '- Patients: 8 para o usuário %', first_user_id;
  RAISE NOTICE '- Appointments: ~10 (hoje, ontem, amanhã)';
  RAISE NOTICE '- Cash Closings: 2 (ontem finalizado, hoje em aberto)';
  RAISE NOTICE '- Professional Procedures: Associações criadas';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  
END $$;
