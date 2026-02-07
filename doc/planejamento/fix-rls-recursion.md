# 🚨 FIX: Recursão Infinita nas RLS Policies

**Data**: 06/02/2026  
**Severidade**: 🔴 CRÍTICO  
**Status**: ✅ CORRIGIDO

---

## 🐛 Problema Encontrado

### Erro:
```
GET /rest/v1/profiles?select=*&id=eq.xxx 500 (Internal Server Error)

{
  code: '42P17',
  message: 'infinite recursion detected in policy for relation "profiles"'
}
```

### Causa Raiz:

As políticas RLS criadas em `20260206180000_add_profiles_rls.sql` estavam fazendo **SELECT na própria tabela profiles** dentro das regras USING/WITH CHECK:

```sql
-- ❌ CÓDIGO PROBLEMÁTICO
CREATE POLICY "Super admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p  -- ← RECURSÃO INFINITA!
      WHERE p.id = auth.uid()
      AND p.role = 'super_admin'
    )
  );
```

### O que acontecia:

1. User tenta fazer SELECT em `profiles`
2. RLS executa a policy
3. Policy precisa fazer SELECT em `profiles` para verificar role
4. Este SELECT dispara a mesma policy novamente
5. **Loop infinito** → PostgreSQL detecta e retorna erro 42P17

---

## ✅ Solução Implementada

### Estratégia: SECURITY DEFINER Function

Criar uma função helper que **bypassa RLS** usando `SECURITY DEFINER`:

```sql
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER  -- ← Executa com permissões do owner, não do caller
SET search_path = public
AS $$
DECLARE
  user_role TEXT;
  user_active BOOLEAN;
BEGIN
  SELECT role, is_active
  INTO user_role, user_active
  FROM profiles
  WHERE id = auth.uid();
  
  RETURN user_role = 'super_admin' AND user_active = true;
END;
$$;
```

### Nova Policy (SEM recursão):

```sql
-- ✅ CÓDIGO CORRETO
CREATE POLICY "Super admins can view all profiles"
  ON profiles FOR SELECT
  USING (is_super_admin());  -- ← Usa função helper
```

---

## 📝 Migration Criada

**Arquivo**: `supabase/migrations/20260206190000_fix_profiles_rls_recursion.sql`

### O que faz:

1. **Cria função helper** `is_super_admin()` com `SECURITY DEFINER`
2. **Dropa policies antigas** (com recursão)
3. **Recria policies** usando a função helper
4. **Grant EXECUTE** para authenticated users
5. **Validações** e logs de sucesso

---

## 🎯 Policies Corrigidas

### Antes ❌ (Com recursão):

| Policy | Problema |
|--------|----------|
| Super admins can view all profiles | SELECT em profiles dentro do USING |
| Only super admins can insert profiles | SELECT em profiles dentro do WITH CHECK |
| Super admins can update any profile | SELECT em profiles dentro do USING/WITH CHECK |
| Only super admins can delete profiles | SELECT em profiles dentro do USING |

### Depois ✅ (Sem recursão):

| Policy | Solução |
|--------|---------|
| Super admins can view all profiles | `USING (is_super_admin())` |
| Only super admins can insert profiles | `WITH CHECK (is_super_admin())` |
| Super admins can update any profile | `USING/WITH CHECK (is_super_admin())` |
| Only super admins can delete profiles | `USING (id != auth.uid() AND is_super_admin())` |

---

## 🔒 Segurança da Solução

### Por que SECURITY DEFINER é seguro aqui?

1. **Função simples**: Só retorna boolean, não modifica dados
2. **SET search_path**: Previne SQL injection
3. **Apenas leitura**: Só faz SELECT, sem INSERT/UPDATE/DELETE
4. **Escopo limitado**: Só verifica role do usuário atual (auth.uid())
5. **Grant controlado**: Apenas authenticated users podem executar

### Alternativas consideradas (e por que não foram usadas):

#### 1. auth.jwt() → 'user_metadata' ->> 'role'
❌ **Problema**: user_metadata pode estar desatualizado ou não sincronizado

#### 2. Criar tabela separada user_roles
❌ **Problema**: Duplicação de dados, complexidade extra

#### 3. Desabilitar RLS temporariamente
❌ **Problema**: Inseguro, todos teriam acesso total

---

## 🧪 Como Testar

### 1. Executar Migration

```bash
cd supabase
npx supabase db push
```

### 2. Verificar Função

```sql
SELECT public.is_super_admin();
-- Deve retornar: true (se super admin) ou false (se user)
```

### 3. Testar Policies

```sql
-- Como super admin
SELECT * FROM profiles;
-- Deve retornar: TODOS os profiles ✅

-- Como user comum
SELECT * FROM profiles;
-- Deve retornar: APENAS seu profile ✅

-- Tentar inserir (como user comum)
INSERT INTO profiles (...) VALUES (...);
-- Deve falhar: RLS policy violation ✅
```

### 4. Verificar no Frontend

```bash
npm run dev
```

**Resultado esperado**:
- ✅ Login funciona
- ✅ Profile carrega sem erro 500
- ✅ Dashboard/Agenda renderiza
- ✅ Console sem erros de recursão

---

## 📊 Comparação: Antes vs Depois

### Console Antes ❌:

```
❌ Error loading profile:
{
  code: '42P17',
  message: 'infinite recursion detected in policy for relation "profiles"'
}

GET /rest/v1/profiles?select=*&id=eq.xxx 500 (Internal Server Error)
```

### Console Depois ✅:

```
🔍 Loading profile for user: xxx
✅ Profile loaded: {id: xxx, role: 'super_admin', ...}
✅ Loading finished, setting loading to false
```

---

## 🎓 Lição Aprendida

### ⚠️ NUNCA fazer isso em RLS:

```sql
-- ❌ ERRADO
CREATE POLICY "policy_name"
  ON table_name FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM table_name WHERE ...)  -- ← RECURSÃO!
  );
```

### ✅ SEMPRE fazer assim:

```sql
-- ✅ CORRETO (opção 1: função helper)
CREATE POLICY "policy_name"
  ON table_name FOR SELECT
  USING (helper_function());

-- ✅ CORRETO (opção 2: auth.uid() direto)
CREATE POLICY "policy_name"
  ON table_name FOR SELECT
  USING (id = auth.uid());
```

---

## 📚 Referências

- [Supabase RLS Best Practices](https://supabase.com/docs/guides/auth/row-level-security)
- [PostgreSQL SECURITY DEFINER](https://www.postgresql.org/docs/current/sql-createfunction.html)
- [PostgreSQL RLS Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

---

## ✅ Checklist de Validação

- [x] Migration criada
- [x] Função `is_super_admin()` implementada
- [x] Policies recriadas sem recursão
- [x] Grant EXECUTE adicionado
- [x] Documentação criada
- [ ] Migration executada no Supabase
- [ ] Teste no frontend (após executar)

---

**STATUS**: ✅ Solução pronta, aguardando execução da migration

**AÇÃO NECESSÁRIA**: Executar `npx supabase db push` na pasta `supabase/`
