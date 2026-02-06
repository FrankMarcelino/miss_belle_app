# 🚀 Guia: Executar Migrations no Supabase

**Data**: 06/02/2026  
**Versão**: SAFE (pode executar múltiplas vezes sem erro)

---

## ⚠️ IMPORTANTE: Use as Versões SAFE!

Criamos versões **SAFE** das migrations que podem ser executadas múltiplas vezes sem erro. Use sempre os arquivos com sufixo `_SAFE.sql`.

---

## 📋 Ordem de Execução

Execute **um por vez**, na ordem abaixo, no **SQL Editor do Supabase**:

### 1️⃣ Schema Inicial (Se ainda não executou)
```
📁 supabase/migrations/20251122115011_create_initial_schema.sql
```
**Executa apenas 1 vez** - Cria todas as tabelas base

---

### 2️⃣ Fix RLS Recursion (Se ainda não executou)  
```
📁 supabase/migrations/20251122134702_fix_rls_recursion.sql
```
**Executa apenas 1 vez** - Corrige RLS de profiles

---

### 3️⃣ Integridade do Caixa ⭐ NOVO
```
📁 supabase/migrations/20260206131236_improve_cash_register_integrity_SAFE.sql
```
✅ **Pode executar múltiplas vezes**

**O que faz**:
- Triggers para recalcular total automaticamente
- RLS para proteger fechamentos finalizados
- Correção de dados existentes

---

### 4️⃣ Validação de Conflitos ⭐ NOVO
```
📁 supabase/migrations/20260206131306_add_appointment_conflict_check_SAFE.sql
```
✅ **Pode executar múltiplas vezes**

**O que faz**:
- Função `check_appointment_conflict()`
- Verifica sobreposição de horários

---

### 5️⃣ Fix RLS Patients ⭐ NOVO
```
📁 supabase/migrations/20260206140000_fix_patients_rls_for_joins_SAFE.sql
```
✅ **Pode executar múltiplas vezes**

**O que faz**:
- Simplifica RLS de patients
- Permite JOINs funcionarem

---

### 6️⃣ Associação Profissional-Procedimento ⭐ NOVO
```
📁 supabase/migrations/20260206150000_add_professional_procedures_SAFE.sql
```
✅ **Pode executar múltiplas vezes**

**O que faz**:
- Tabela `professional_procedures` (N:N)
- RLS policies
- Função helper

---

### 7️⃣ Popular com Dados (ÚLTIMO!)
```
📁 supabase/seed.sql
```
⚠️ **Cuidado**: Pode criar dados duplicados se executar múltiplas vezes!

**Antes de executar**, limpe os dados antigos:
```sql
TRUNCATE TABLE cash_register_transactions CASCADE;
TRUNCATE TABLE cash_register_closings CASCADE;
TRUNCATE TABLE appointments CASCADE;
TRUNCATE TABLE patients CASCADE;
TRUNCATE TABLE procedures CASCADE;
TRUNCATE TABLE professional_procedures CASCADE;
```

---

## 🎯 Passo a Passo Detalhado

### 1. Acesse o Supabase
1. Vá para https://supabase.com/dashboard
2. Selecione seu projeto
3. Clique em **SQL Editor** (menu lateral)
4. Clique em **New Query**

### 2. Execute Cada Migration

**Para cada arquivo listado acima**:

1. ✅ Abra o arquivo `_SAFE.sql` no seu editor
2. ✅ Copie **TODO** o conteúdo (Ctrl+A, Ctrl+C)
3. ✅ Cole no SQL Editor do Supabase
4. ✅ Clique em **RUN** ▶️ (ou Ctrl+Enter)
5. ✅ Aguarde a mensagem: `✅ Migration executada com sucesso!`
6. ✅ **Só então** passe para o próximo arquivo

### 3. Execute o Seed (Por Último!)

1. ⚠️ **Primeiro**, execute o script de limpeza (acima)
2. ✅ Abra `supabase/seed.sql`
3. ✅ Copie TODO o conteúdo
4. ✅ Cole no SQL Editor
5. ✅ Clique em **RUN** ▶️
6. ✅ Aguarde: `NOTICE: Seed concluído com sucesso!`

---

## ✅ Como Validar que Funcionou

Execute estas queries no SQL Editor:

```sql
-- 1. Ver todas as tabelas criadas
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;

-- Deve mostrar:
-- appointments
-- cash_register_closings
-- cash_register_transactions
-- patients
-- procedures
-- professional_procedures ⭐ NOVO
-- profiles

-- 2. Ver procedimentos
SELECT id, name, duration_minutes, default_price 
FROM procedures;

-- Deve retornar 8 procedimentos

-- 3. Ver associações profissional-procedimento ⭐
SELECT 
  prof.full_name as profissional,
  COUNT(pp.id) as total_procedures
FROM profiles prof
LEFT JOIN professional_procedures pp ON pp.professional_id = prof.id
WHERE prof.is_active = true
GROUP BY prof.id, prof.full_name;

-- Deve mostrar quantos procedimentos cada profissional tem

-- 4. Ver agendamentos
SELECT 
  a.appointment_date,
  a.appointment_time,
  a.status,
  p.full_name as paciente,
  proc.name as procedimento,
  prof.full_name as profissional
FROM appointments a
LEFT JOIN patients p ON p.id = a.patient_id
LEFT JOIN procedures proc ON proc.id = a.procedure_id
LEFT JOIN profiles prof ON prof.id = a.professional_id
ORDER BY a.appointment_date DESC, a.appointment_time DESC
LIMIT 10;

-- Deve mostrar ~10 agendamentos

-- 5. Testar função de conflito
SELECT check_appointment_conflict(
  'UUID-DO-PROFISSIONAL'::uuid,
  CURRENT_DATE,
  '09:00'::time,
  'UUID-DO-PROCEDIMENTO'::uuid
);

-- Deve retornar true ou false
```

---

## 🐛 Solução de Problemas

### Erro: "trigger already exists"
✅ **Solução**: Use os arquivos `_SAFE.sql` em vez dos originais

### Erro: "relation already exists"
✅ **Normal**: A tabela já foi criada. Continue com a próxima migration.

### Erro: "permission denied"
⚠️ **Problema**: Você não é o owner do projeto
✅ **Solução**: Peça ao administrador para executar

### Erro: "violates foreign key constraint"
⚠️ **Problema**: Dados existentes incompatíveis
✅ **Solução**: Execute o script de limpeza antes do seed

### Seed cria dados duplicados
⚠️ **Problema**: Seed foi executado múltiplas vezes
✅ **Solução**: Execute o script de limpeza e rode o seed novamente

---

## 📂 Estrutura de Arquivos

```
supabase/
├── migrations/
│   ├── 20251122115011_create_initial_schema.sql
│   ├── 20251122134702_fix_rls_recursion.sql
│   ├── 20260206131236_improve_cash_register_integrity_SAFE.sql ⭐
│   ├── 20260206131306_add_appointment_conflict_check_SAFE.sql ⭐
│   ├── 20260206140000_fix_patients_rls_for_joins_SAFE.sql ⭐
│   └── 20260206150000_add_professional_procedures_SAFE.sql ⭐
└── seed.sql
```

---

## 🎉 Após Executar Tudo

1. ✅ Recarregue sua aplicação web (Ctrl+R)
2. ✅ Faça login
3. ✅ Navegue para "Agenda"
4. ✅ Clique em "Novo Agendamento"
5. ✅ Veja os procedimentos carregando corretamente!

---

## 📞 Suporte

Se tiver problemas, verifique:
1. Todas as migrations SAFE foram executadas?
2. O seed foi executado por último?
3. Há erros no console do navegador (F12)?
4. As queries de validação retornam dados?

---

**Pronto para usar!** 🚀
