# 🚀 Criar Usuários e Procedimentos Reais

## 📍 Você está aqui

Esta pasta contém scripts para criar os **3 profissionais reais** da clínica com seus procedimentos específicos.

---

## ⚡ OPÇÃO RÁPIDA: Fazer tudo de uma vez

Se você **já criou os 3 usuários** no Supabase Auth, execute:

```sql
📁 EXECUTAR_TUDO_DE_UMA_VEZ.sql
```

Este script faz TUDO:
- ✅ Adiciona constraint UNIQUE
- ✅ Cria 29 procedimentos reais
- ✅ Cria profiles
- ✅ Associa procedimentos

---

## 📋 OPÇÃO PASSO A PASSO: Executar por etapas

### Passo 1: Criar procedimentos
```sql
📁 02_criar_procedimentos_reais_SAFE.sql
```

### Passo 2: Criar usuários no Supabase Auth
**Dashboard → Authentication → Users → Add User**

| Email | Senha | Nome Completo |
|-------|-------|---------------|
| anapaulaalmeida@missabelle.com | Amin123 | Ana Paula Almeida Santana |
| sefora@missabelle.com | Amin123 | Sefora |
| thais@missabelle.com | Amin123 | Thais |

⚠️ **Importante**: Marque "Auto Confirm User" ✅

### Passo 3: Criar profiles
```sql
DO $$
DECLARE
  ana_id uuid; sefora_id uuid; thais_id uuid;
BEGIN
  SELECT id INTO ana_id FROM auth.users WHERE email = 'anapaulaalmeida@missabelle.com';
  SELECT id INTO sefora_id FROM auth.users WHERE email = 'sefora@missabelle.com';
  SELECT id INTO thais_id FROM auth.users WHERE email = 'thais@missabelle.com';
  
  INSERT INTO profiles (id, email, full_name, role, is_active) VALUES
    (ana_id, 'anapaulaalmeida@missabelle.com', 'Ana Paula Almeida Santana', 'user', true),
    (sefora_id, 'sefora@missabelle.com', 'Sefora', 'user', true),
    (thais_id, 'thais@missabelle.com', 'Thais', 'user', true)
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name;
END $$;
```

### Passo 4: Associar procedimentos
```sql
📁 03_associar_procedimentos.sql
```

---

## 🎯 Distribuição de Procedimentos

| Profissional | Especialidade | Total |
|--------------|---------------|-------|
| 👩 Ana Paula | Estética Facial + Cílios | 13 |
| 💄 Sefora | Maquiagem | 6 |
| 💇 Thais | Cabelo | 10 |

---

## ✅ Validar

```sql
SELECT 
  prof.full_name,
  COUNT(pp.id) as total_procedures
FROM profiles prof
LEFT JOIN professional_procedures pp ON pp.professional_id = prof.id
WHERE prof.email IN (
  'anapaulaalmeida@missabelle.com',
  'sefora@missabelle.com',
  'thais@missabelle.com'
)
GROUP BY prof.id, prof.full_name;
```

**Resultado esperado:**
```
Ana Paula Almeida Santana | 13
Sefora                    | 6
Thais                     | 10
```

---

## 🎉 Testar na Aplicação

1. Login: `anapaulaalmeida@missabelle.com` / `Amin123`
2. Vá em "Novo Agendamento"
3. Veja apenas os 13 procedimentos dela!

---

## 📁 Outros Arquivos

- **GUIA_USUARIOS_REAIS.md** - Guia detalhado completo
- **ORDEM_EXECUCAO_FINAL.txt** - Fluxo visual simplificado
- **01_criar_usuarios_e_servicos.sql** - Script com função helper (alternativa)

---

## ⚠️ Troubleshooting

### Erro: "no unique constraint matching ON CONFLICT"
**Solução**: Use os scripts `_SAFE.sql` que adicionam a constraint automaticamente.

### Erro: "Usuário não encontrado"
**Solução**: Crie os usuários no Supabase Auth primeiro (Dashboard → Authentication → Users).

### Usuários não aparecem
**Solução**: Verifique se os profiles foram criados:
```sql
SELECT * FROM profiles WHERE email LIKE '%missabelle.com';
```

---

**Boa sorte!** 🚀
