-- ============================================================================
-- LIMPAR DADOS DE TESTE
-- Data: 2026-02-06
-- ============================================================================

/*
  Este script remove TODOS os dados de teste (seed) do banco.
  Use apenas se quiser começar do zero com os dados reais.
  
  ATENÇÃO: Isto vai deletar:
  - Agendamentos de teste
  - Transações de caixa de teste
  - Fechamentos de caixa de teste
  - Pacientes de teste
  - Procedimentos de teste
  - Associações profissional-procedimento de teste
*/

DO $$
DECLARE
  del_transactions integer;
  del_closings integer;
  del_appointments integer;
  del_patients integer;
  del_prof_procedures integer;
  del_procedures integer;
BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '🧹 Limpando dados de teste...';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  
  -- 1. Deletar transações de caixa
  DELETE FROM cash_register_transactions 
  WHERE closing_id IN (
    SELECT id FROM cash_register_closings 
    WHERE professional_id IN (
      SELECT id FROM profiles WHERE email LIKE '%@example.com'
    )
  );
  GET DIAGNOSTICS del_transactions = ROW_COUNT;
  IF del_transactions > 0 THEN
    RAISE NOTICE '✅ % transações de caixa removidas', del_transactions;
  END IF;
  
  -- 2. Deletar fechamentos de caixa
  DELETE FROM cash_register_closings 
  WHERE professional_id IN (
    SELECT id FROM profiles WHERE email LIKE '%@example.com'
  );
  GET DIAGNOSTICS del_closings = ROW_COUNT;
  IF del_closings > 0 THEN
    RAISE NOTICE '✅ % fechamentos de caixa removidos', del_closings;
  END IF;
  
  -- 3. Deletar agendamentos de procedimentos de teste
  DELETE FROM appointments 
  WHERE procedure_id IN (
    'a1111111-1111-1111-1111-111111111111',
    'a2222222-2222-2222-2222-222222222222',
    'a3333333-3333-3333-3333-333333333333',
    'a4444444-4444-4444-4444-444444444444',
    'a5555555-5555-5555-5555-555555555555',
    'a6666666-6666-6666-6666-666666666666',
    'a7777777-7777-7777-7777-777777777777',
    'a8888888-8888-8888-8888-888888888888'
  );
  GET DIAGNOSTICS del_appointments = ROW_COUNT;
  IF del_appointments > 0 THEN
    RAISE NOTICE '✅ % agendamentos de teste removidos', del_appointments;
  END IF;
  
  -- 4. Deletar agendamentos de usuários de teste
  DELETE FROM appointments 
  WHERE professional_id IN (
    SELECT id FROM profiles WHERE email LIKE '%@example.com'
  );
  GET DIAGNOSTICS del_appointments = ROW_COUNT;
  IF del_appointments > 0 THEN
    RAISE NOTICE '✅ % agendamentos de usuários teste removidos', del_appointments;
  END IF;
  
  -- 5. Deletar pacientes de teste
  DELETE FROM patients 
  WHERE professional_id IN (
    SELECT id FROM profiles WHERE email LIKE '%@example.com'
  );
  GET DIAGNOSTICS del_patients = ROW_COUNT;
  IF del_patients > 0 THEN
    RAISE NOTICE '✅ % pacientes de teste removidos', del_patients;
  END IF;
  
  -- 6. Deletar associações profissional-procedimento de teste
  DELETE FROM professional_procedures 
  WHERE professional_id IN (
    SELECT id FROM profiles WHERE email LIKE '%@example.com'
  );
  GET DIAGNOSTICS del_prof_procedures = ROW_COUNT;
  IF del_prof_procedures > 0 THEN
    RAISE NOTICE '✅ % associações de teste removidas', del_prof_procedures;
  END IF;
  
  -- 7. Deletar procedimentos de teste
  DELETE FROM procedures WHERE id IN (
    'a1111111-1111-1111-1111-111111111111',
    'a2222222-2222-2222-2222-222222222222',
    'a3333333-3333-3333-3333-333333333333',
    'a4444444-4444-4444-4444-444444444444',
    'a5555555-5555-5555-5555-555555555555',
    'a6666666-6666-6666-6666-666666666666',
    'a7777777-7777-7777-7777-777777777777',
    'a8888888-8888-8888-8888-888888888888'
  );
  GET DIAGNOSTICS del_procedures = ROW_COUNT;
  IF del_procedures > 0 THEN
    RAISE NOTICE '✅ % procedimentos de teste removidos', del_procedures;
  END IF;
  
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '🎉 Limpeza concluída!';
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  NOTA: Este script NÃO remove:';
  RAISE NOTICE '• Usuários/profiles de teste (@example.com)';
  RAISE NOTICE '• Para remover usuários: vá em Authentication → Users';
  RAISE NOTICE '';
  RAISE NOTICE '📊 Dados removidos:';
  RAISE NOTICE '• Transações: %', del_transactions;
  RAISE NOTICE '• Fechamentos: %', del_closings;
  RAISE NOTICE '• Agendamentos: %', del_appointments;
  RAISE NOTICE '• Pacientes: %', del_patients;
  RAISE NOTICE '• Associações: %', del_prof_procedures;
  RAISE NOTICE '• Procedimentos: %', del_procedures;
  RAISE NOTICE '═══════════════════════════════════════════════════════════';
END $$;

-- Verificar o que restou
SELECT 
  'procedures' as tabela,
  COUNT(*) as registros
FROM procedures
WHERE is_active = true
UNION ALL
SELECT 
  'profiles' as tabela,
  COUNT(*) as registros
FROM profiles
WHERE is_active = true
UNION ALL
SELECT 
  'patients' as tabela,
  COUNT(*) as registros
FROM patients
UNION ALL
SELECT 
  'appointments' as tabela,
  COUNT(*) as registros
FROM appointments
UNION ALL
SELECT 
  'professional_procedures' as tabela,
  COUNT(*) as registros
FROM professional_procedures;
