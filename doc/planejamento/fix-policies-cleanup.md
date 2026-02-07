# ⚠️ Fix: Limpeza de Policies Antigas em Profiles

**Data**: 06/02/2026  
**Status**: 🔧 CORREÇÃO NECESSÁRIA  
**Prioridade**: 🟡 MÉDIA (Funciona, mas tem conflitos)

---

## 🔍 Problema Identificado

Ao executar a migration `20260206180000_add_profiles_rls.sql`, as **policies antigas não foram removidas automaticamente**.

### Resultado Atual:

```sql
-- ❌ ANTIGAS (devem ser removidas):
1. "Enable insert during signup"
2. "Enable read access for authenticated users"
3. "Enable update for own profile"

-- ✅ NOVAS (corretas):
4. "Only super admins can delete profiles"
5. "Only super admins can insert profiles"
6. "Super admins can update any profile"
7. "Super admins can view all profiles"
8. "Users can update own profile"
9. "Users can view own profile"
```

**Total**: 9 policies (deveria ter apenas 6)

---

## ⚙️ Por Que Isso Aconteceu?

A migration tentou fazer `DROP POLICY IF EXISTS`, mas as **policies antigas tinham nomes diferentes** dos esperados.

**Migration esperava**:
```sql
DROP POLICY IF EXISTS "Super admins can view all profiles" ON profiles;
```

**Mas as antigas eram**:
```sql
"Enable read access for authenticated users" -- Nome diferente!
```

---

## ✅ Solução

Execute a migration de limpeza:

```sql
📁 20260206180001_cleanup_old_profiles_policies.sql
```

Este script:
1. Remove as 3 policies antigas
2. Mantém as 6 novas policies
3. Valida o resultado

---

## 🧪 Como Verificar

### Antes da Limpeza:

```sql
SELECT policyname FROM pg_policies WHERE tablename = 'profiles';
```

**Resultado**: 9 policies

### Depois da Limpeza:

```sql
SELECT policyname FROM pg_policies WHERE tablename = 'profiles';
```

**Resultado esperado**: 6 policies

```
✅ Super admins can view all profiles
✅ Users can view own profile
✅ Only super admins can insert profiles
✅ Super admins can update any profile
✅ Users can update own profile
✅ Only super admins can delete profiles
```

---

## 🚨 Impacto

### O Sistema Ainda Funciona? ✅ SIM

Mesmo com policies duplicadas, o sistema continua funcionando porque:
- Policies são **permissivas** por padrão
- Se UMA policy permitir, a operação é executada
- As novas policies são mais específicas e têm precedência

### Devemos Corrigir? ✅ SIM

Embora funcione, é melhor limpar porque:
- ⚠️ Dificulta manutenção futura
- ⚠️ Pode causar confusão
- ⚠️ Policies antigas podem ser mais permissivas

---

## 📝 Executar Correção

### Opção 1: Via SQL Editor (RECOMENDADO)

```bash
1. Abra Supabase SQL Editor
2. Cole o conteúdo de: 20260206180001_cleanup_old_profiles_policies.sql
3. Execute
4. Verifique as mensagens:
   ✅ Policies antigas removidas com sucesso!
   ✅ Apenas 6 policies devem estar ativas!
```

### Opção 2: Via CLI (se tiver Supabase CLI)

```bash
supabase db push
```

---

## 🔍 Validação Final

Execute para confirmar:

```sql
-- Contar policies
SELECT COUNT(*) as total_policies 
FROM pg_policies 
WHERE tablename = 'profiles';
```

**Esperado**: `total_policies = 6`

```sql
-- Ver detalhes
SELECT 
  policyname,
  cmd,
  roles
FROM pg_policies 
WHERE tablename = 'profiles'
ORDER BY cmd, policyname;
```

**Esperado**:
```
DELETE | Only super admins can delete profiles      | {authenticated}
INSERT | Only super admins can insert profiles      | {authenticated}
SELECT | Super admins can view all profiles         | {authenticated}
SELECT | Users can view own profile                 | {authenticated}
UPDATE | Super admins can update any profile        | {authenticated}
UPDATE | Users can update own profile               | {authenticated}
```

---

## 💡 Lição Aprendida

Em futuras migrations que limpam policies:

1. **Sempre listar policies existentes primeiro**:
```sql
SELECT policyname FROM pg_policies WHERE tablename = 'profiles';
```

2. **Remover explicitamente pelo nome exato**:
```sql
DROP POLICY IF EXISTS "Nome Exato Da Policy Antiga" ON profiles;
```

3. **Validar após execução**:
```sql
SELECT COUNT(*) FROM pg_policies WHERE tablename = 'profiles';
```

---

## ⚠️ Nota Importante

**NÃO execute a migration principal novamente** (`20260206180000_add_profiles_rls.sql`), pois isso criaria duplicatas das novas policies!

Apenas execute a **limpeza** (`20260206180001_cleanup_old_profiles_policies.sql`).

---

## 🎯 Resumo

| Ação | Status |
|------|--------|
| Identificar problema | ✅ FEITO |
| Criar script de limpeza | ✅ FEITO |
| Executar limpeza | ⏳ PENDENTE (você) |
| Validar resultado | ⏳ PENDENTE (após executar) |

---

**Execute a limpeza quando puder!** 🧹
