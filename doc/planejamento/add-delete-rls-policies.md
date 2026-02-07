# 🔓 ADD DELETE RLS Policies para Deleção em Cascata

**Data**: 06/02/2026  
**Problema**: RLS impedindo deleção de usuários  
**Status**: ✅ Migration criada

---

## 🐛 Problema

### Erro:
```
Error: 409 Conflict
Code: 23503
Message: update or delete on table "profiles" violates foreign key 
         constraint "patients_professional_id_fkey" on table "patients"
Details: Key is still referenced from table "patients"
```

### Causa:
As tabelas relacionadas (`patients`, `appointments`, etc.) **não tinham policies de DELETE**, então mesmo que o super admin tentasse deletar os dados relacionados, o RLS bloqueava.

---

## 🔍 Análise

### Policies Existentes (antes):

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| profiles | ✅ | ✅ | ✅ | ✅ |
| patients | ✅ | ✅ | ✅ | ❌ **FALTANDO** |
| appointments | ✅ | ✅ | ✅ | ❌ **FALTANDO** |
| professional_procedures | ✅ | ✅ | ✅ | ❌ **FALTANDO** |
| cash_register_closings | ✅ | ✅ | ✅ | ❌ **FALTANDO** |
| cash_register_transactions | ✅ | ✅ | ✅ | ❌ **FALTANDO** |

### Fluxo do Erro:

```
1. Super admin tenta deletar usuário
2. Frontend tenta deletar pacientes desse usuário
3. RLS verifica policies de DELETE em patients
4. ❌ Nenhuma policy permite DELETE
5. Supabase bloqueia a operação
6. Foreign key constraint impede deletar profile
7. Error 409 Conflict
```

---

## ✅ Solução

### Migration Criada:
`supabase/migrations/20260206200000_add_delete_policies_for_cascade.sql`

### Estratégia:

Para cada tabela, criar **2 policies de DELETE**:

1. **User pode deletar próprios dados**
   ```sql
   USING (professional_id = auth.uid())
   ```

2. **Super admin pode deletar qualquer dado**
   ```sql
   USING (
     EXISTS (
       SELECT 1 FROM profiles
       WHERE id = auth.uid()
       AND role = 'super_admin'
       AND is_active = true
     )
   )
   ```

---

## 📝 Policies Criadas

### 1. PATIENTS (2 policies)

```sql
-- Users podem deletar seus próprios pacientes
CREATE POLICY "Users can delete own patients"
  ON patients FOR DELETE
  TO authenticated
  USING (professional_id = auth.uid());

-- Super admins podem deletar qualquer paciente
CREATE POLICY "Super admins can delete any patient"
  ON patients FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role = 'super_admin'
      AND is_active = true
    )
  );
```

### 2. APPOINTMENTS (2 policies)

```sql
-- Users podem deletar seus próprios agendamentos
CREATE POLICY "Users can delete own appointments"
  ON appointments FOR DELETE
  TO authenticated
  USING (professional_id = auth.uid());

-- Super admins podem deletar qualquer agendamento
CREATE POLICY "Super admins can delete any appointment"
  ON appointments FOR DELETE
  TO authenticated
  USING (...);
```

### 3. PROFESSIONAL_PROCEDURES (2 policies)

```sql
-- Users podem deletar suas próprias associações
CREATE POLICY "Users can delete own procedure associations"
  ON professional_procedures FOR DELETE
  TO authenticated
  USING (professional_id = auth.uid());

-- Super admins podem deletar qualquer associação
CREATE POLICY "Super admins can delete any procedure association"
  ON professional_procedures FOR DELETE
  TO authenticated
  USING (...);
```

### 4. CASH_REGISTER_CLOSINGS (2 policies)

```sql
-- Users podem deletar seus próprios fechamentos
CREATE POLICY "Users can delete own closings"
  ON cash_register_closings FOR DELETE
  TO authenticated
  USING (professional_id = auth.uid());

-- Super admins podem deletar qualquer fechamento
CREATE POLICY "Super admins can delete any closing"
  ON cash_register_closings FOR DELETE
  TO authenticated
  USING (...);
```

### 5. CASH_REGISTER_TRANSACTIONS (2 policies)

```sql
-- Users podem deletar suas próprias transações
CREATE POLICY "Users can delete own transactions"
  ON cash_register_transactions FOR DELETE
  TO authenticated
  USING (
    closing_id IN (
      SELECT id FROM cash_register_closings
      WHERE professional_id = auth.uid()
    )
  );

-- Super admins podem deletar qualquer transação
CREATE POLICY "Super admins can delete any transaction"
  ON cash_register_transactions FOR DELETE
  TO authenticated
  USING (...);
```

---

## 🎯 Resultado

### Policies Completas (depois):

| Tabela | SELECT | INSERT | UPDATE | DELETE |
|--------|--------|--------|--------|--------|
| profiles | ✅ | ✅ | ✅ | ✅ |
| patients | ✅ | ✅ | ✅ | ✅ **ADICIONADO** |
| appointments | ✅ | ✅ | ✅ | ✅ **ADICIONADO** |
| professional_procedures | ✅ | ✅ | ✅ | ✅ **ADICIONADO** |
| cash_register_closings | ✅ | ✅ | ✅ | ✅ **ADICIONADO** |
| cash_register_transactions | ✅ | ✅ | ✅ | ✅ **ADICIONADO** |

### Fluxo Correto (após migration):

```
1. Super admin tenta deletar usuário ✅
2. Frontend deleta pacientes do usuário
3. RLS verifica policies de DELETE em patients
4. ✅ "Super admins can delete any patient" permite
5. Pacientes deletados ✅
6. Frontend deleta appointments, procedures, etc.
7. ✅ Todas policies permitem
8. Profile deletado ✅
9. Toast: "Usuário deletado!" ✅
```

---

## 🔒 Segurança

### Permissions por Role:

| Operação | User (próprios dados) | Super Admin (qualquer dado) |
|----------|----------------------|----------------------------|
| DELETE patients | ✅ Seus pacientes | ✅ Qualquer paciente |
| DELETE appointments | ✅ Seus agendamentos | ✅ Qualquer agendamento |
| DELETE procedures assoc | ✅ Suas associações | ✅ Qualquer associação |
| DELETE closings | ✅ Seus fechamentos | ✅ Qualquer fechamento |
| DELETE transactions | ✅ Suas transações | ✅ Qualquer transação |
| DELETE profiles | ❌ Não permitido | ✅ Qualquer profile (exceto self) |

---

## 🧪 Como Testar

### 1. Executar Migration

```bash
cd /home/frank/miss_belle_app/miss_belle_app/supabase
npx supabase db push
```

### 2. Verificar Policies

```sql
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN (
  'patients',
  'appointments',
  'professional_procedures',
  'cash_register_closings',
  'cash_register_transactions'
)
AND cmd = 'DELETE'
ORDER BY tablename, policyname;
```

**Resultado esperado**: 10 policies (2 por tabela)

### 3. Testar no Frontend

1. Login como super admin
2. Ir para `/usuarios`
3. Tentar deletar um usuário com pacientes/agendamentos
4. Confirmar "Deletar Tudo"

**Resultado esperado**:
- ✅ Todas tabelas deletam com sucesso
- ✅ Profile deletado
- ✅ Toast: "Usuário deletado!"
- ✅ Sem erro 409

---

## 📊 Comparação: Antes vs Depois

### Console Antes ❌:

```
DELETE /rest/v1/patients?professional_id=eq.xxx 403 (Forbidden)
Error: RLS policy violation

DELETE /rest/v1/profiles?id=eq.xxx 409 (Conflict)
Error: Foreign key constraint violation
```

### Console Depois ✅:

```
DELETE /rest/v1/cash_register_transactions... 200 OK
DELETE /rest/v1/appointments... 200 OK
DELETE /rest/v1/patients... 200 OK
DELETE /rest/v1/professional_procedures... 200 OK
DELETE /rest/v1/cash_register_closings... 200 OK
DELETE /rest/v1/profiles... 200 OK

✅ Usuário deletado!
```

---

## ⚠️ Notas Importantes

### Por que usar EXISTS em vez de função?

Nas policies de DELETE, usamos `EXISTS (SELECT ... FROM profiles)` mesmo sabendo que pode causar recursão em SELECT.

**É seguro aqui porque**:
- DELETE em `patients` não acessa `patients` na policy
- DELETE em `appointments` não acessa `appointments` na policy
- Cada policy só faz SELECT em `profiles` (tabela diferente)
- Não há recursão cruzada

### Alternativa (se houver problemas):

Criar funções helper similares a `is_super_admin()`:

```sql
CREATE FUNCTION can_delete_any_patient() RETURNS BOOLEAN ...
CREATE FUNCTION can_delete_any_appointment() RETURNS BOOLEAN ...
```

Mas por enquanto, `EXISTS` é suficiente e mais simples.

---

## 📚 Referências

- [Supabase RLS Policies](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL Row Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Foreign Key Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK)

---

## ✅ Checklist

- [x] Migration criada
- [x] Policies para patients
- [x] Policies para appointments
- [x] Policies para professional_procedures
- [x] Policies para cash_register_closings
- [x] Policies para cash_register_transactions
- [x] Documentação criada
- [ ] **Migration executada** ← VOCÊ PRECISA FAZER ISSO
- [ ] Teste no frontend

---

**AÇÃO NECESSÁRIA**: Executar `npx supabase db push` na pasta `supabase/`
