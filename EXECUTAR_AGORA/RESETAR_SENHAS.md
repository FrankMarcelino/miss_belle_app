# 🔐 Resetar Senhas dos Usuários

Se você criou os usuários via SQL mas não consegue fazer login, as senhas precisam ser resetadas.

---

## 🎯 SOLUÇÃO RÁPIDA: Resetar no Dashboard

### Opção 1: Resetar senha manualmente (MAIS FÁCIL)

1. Vá em: **Supabase Dashboard** → **Authentication** → **Users**
2. Encontre cada usuário
3. Clique nos **3 pontinhos** (⋯) ao lado do usuário
4. Clique em **"Send Password Reset"** ou **"Reset Password"**
5. Defina nova senha: `Amin123`

Faça isso para os 3 usuários:
- ✉️ anapaulaalmeida@missabelle.com
- ✉️ sefora@missabelle.com
- ✉️ thais@missabelle.com

---

## 🔧 Opção 2: Via SQL (Requer senha já hasheada)

Se quiser atualizar via SQL, você precisa de um hash válido.

### Gerar hash da senha

Execute este script para gerar o hash correto:

```sql
-- Ativar extensão pgcrypto se não estiver ativa
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Gerar hash bcrypt da senha "Amin123"
SELECT crypt('Amin123', gen_salt('bf', 10));
```

**Resultado será algo como:**
```
$2a$10$K8xJZv4bDEZPWH8nqZYv8eXvZ...
```

### Atualizar senhas com o hash

Copie o hash gerado acima e use no script:

```sql
UPDATE auth.users 
SET encrypted_password = '$2a$10$SEU_HASH_AQUI'
WHERE email IN (
  'anapaulaalmeida@missabelle.com',
  'sefora@missabelle.com',
  'thais@missabelle.com'
);
```

---

## 🚨 Opção 3: Deletar e recriar via Dashboard

Se as opções acima não funcionarem:

### Passo 1: Deletar usuários via SQL

```sql
-- Deletar profiles primeiro
DELETE FROM profiles 
WHERE email IN (
  'anapaulaalmeida@missabelle.com',
  'sefora@missabelle.com',
  'thais@missabelle.com'
);

-- Deletar usuários do auth (requer permissões especiais)
-- Melhor fazer via Dashboard: Authentication → Users → Delete
```

### Passo 2: Criar usuários via Dashboard

Vá em: **Dashboard** → **Authentication** → **Users** → **Add User**

Para cada usuário:

**Ana Paula:**
```
Email: anapaulaalmeida@missabelle.com
Password: Amin123
Confirm Password: Amin123
✅ Auto Confirm User
```

**Sefora:**
```
Email: sefora@missabelle.com
Password: Amin123
Confirm Password: Amin123
✅ Auto Confirm User
```

**Thais:**
```
Email: thais@missabelle.com
Password: Amin123
Confirm Password: Amin123
✅ Auto Confirm User
```

### Passo 3: Criar profiles

Execute no SQL Editor:

```sql
DO $$
DECLARE
  ana_id uuid;
  sefora_id uuid;
  thais_id uuid;
BEGIN
  -- Buscar IDs dos usuários criados
  SELECT id INTO ana_id FROM auth.users WHERE email = 'anapaulaalmeida@missabelle.com';
  SELECT id INTO sefora_id FROM auth.users WHERE email = 'sefora@missabelle.com';
  SELECT id INTO thais_id FROM auth.users WHERE email = 'thais@missabelle.com';
  
  -- Criar profiles
  INSERT INTO profiles (id, email, full_name, role, is_active) VALUES
    (ana_id, 'anapaulaalmeida@missabelle.com', 'Ana Paula Almeida Santana', 'user', true),
    (sefora_id, 'sefora@missabelle.com', 'Sefora', 'user', true),
    (thais_id, 'thais@missabelle.com', 'Thais', 'user', true)
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name, is_active = true;
  
  RAISE NOTICE 'Profiles criados!';
END $$;
```

### Passo 4: Associar procedimentos

Execute:

```sql
📁 03_associar_procedimentos.sql
```

---

## ✅ Verificar se funcionou

Depois de resetar as senhas, teste o login:

1. Vá para a aplicação
2. Faça login com:
   - Email: `anapaulaalmeida@missabelle.com`
   - Senha: `Amin123`
3. Deve funcionar! ✨

---

## 💡 Por que isso aconteceu?

A criação de usuários diretamente no `auth.users` via SQL é um **hack** para desenvolvimento. O Supabase Auth tem um processo específico de hashing de senhas que é difícil replicar manualmente via SQL.

**Recomendação para produção:**
- Use o Dashboard para criar usuários
- Ou use a API de signup da aplicação
- Ou use a Admin API do Supabase

---

## 🔍 Debug: Verificar usuários

Para ver se os usuários foram criados:

```sql
-- Ver usuários no auth
SELECT id, email, created_at, email_confirmed_at 
FROM auth.users 
WHERE email LIKE '%missabelle.com';

-- Ver profiles
SELECT id, email, full_name, role, is_active 
FROM profiles 
WHERE email LIKE '%missabelle.com';
```

---

**Qual opção você quer tentar primeiro?** 🤔

Recomendo a **Opção 1** (resetar no Dashboard) por ser mais rápida e confiável!
