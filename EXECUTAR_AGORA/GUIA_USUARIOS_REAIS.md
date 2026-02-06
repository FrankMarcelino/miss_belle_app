# 🚀 Guia: Criar Usuários Reais e Procedimentos

**Data**: 06/02/2026  
**Profissionais**: Ana Paula, Sefora, Thais  
**Senha Padrão**: `Amin123`  

---

## 📋 Resumo Executivo

Este guia cria os **usuários reais** da Miss Belle com seus **procedimentos específicos**.

**Profissionais**:
1. 👩 **Ana Paula Almeida Santana** - Estética Facial (13 procedimentos)
2. 💄 **Sefora** - Maquiagem (6 procedimentos)
3. 💇 **Thais** - Cabelo (10 procedimentos)

---

## 🎯 PASSO A PASSO COMPLETO

### ✅ ETAPA 1: Criar Procedimentos

Execute no **Supabase SQL Editor**:

```
📁 02_criar_procedimentos_reais.sql
```

**O que faz**:
- Remove procedimentos de teste antigos
- Cria 29 procedimentos reais
- Pode executar múltiplas vezes

**Mensagem esperada**:
```
✅ 29 procedimentos criados/atualizados
```

---

### ✅ ETAPA 2: Criar os 3 Usuários no Supabase Auth

#### Opção A: Via Dashboard (RECOMENDADO)

1. Acesse: **Supabase Dashboard** → **Authentication** → **Users**
2. Clique em: **Add User** → **Create new user**
3. Crie cada usuário:

**Usuário 1:**
```
Email: anapaulaalmeida@missabelle.com
Password: Amin123
Confirm Password: Amin123
Auto Confirm User: ✅ (marque)
```
→ Clique **Create User**

**Usuário 2:**
```
Email: sefora@missabelle.com
Password: Amin123
Confirm Password: Amin123
Auto Confirm User: ✅ (marque)
```
→ Clique **Create User**

**Usuário 3:**
```
Email: thais@missabelle.com
Password: Amin123
Confirm Password: Amin123
Auto Confirm User: ✅ (marque)
```
→ Clique **Create User**

#### Opção B: Via Signup na Aplicação (Alternativa)

1. Faça **logout** da aplicação
2. Vá para tela de **signup**
3. Cadastre cada usuário manualmente:
   - Email, Nome, Senha
   - **IMPORTANTE**: O primeiro usuário criado é super_admin automaticamente
   - Os demais são 'user'

---

### ✅ ETAPA 3: Criar Profiles dos Usuários

**Após criar os usuários**, execute no **Supabase SQL Editor**:

```sql
-- Criar profiles para os 3 usuários
DO $$
DECLARE
  ana_id uuid;
  sefora_id uuid;
  thais_id uuid;
BEGIN
  -- Buscar IDs do auth.users
  SELECT id INTO ana_id FROM auth.users WHERE email = 'anapaulaalmeida@missabelle.com';
  SELECT id INTO sefora_id FROM auth.users WHERE email = 'sefora@missabelle.com';
  SELECT id INTO thais_id FROM auth.users WHERE email = 'thais@missabelle.com';
  
  -- Criar profiles
  IF ana_id IS NOT NULL THEN
    INSERT INTO profiles (id, email, full_name, role, is_active)
    VALUES (ana_id, 'anapaulaalmeida@missabelle.com', 'Ana Paula Almeida Santana', 'user', true)
    ON CONFLICT (id) DO UPDATE
    SET full_name = 'Ana Paula Almeida Santana', is_active = true;
    RAISE NOTICE '✅ Profile Ana Paula criado';
  ELSE
    RAISE WARNING '⚠️  Usuário Ana Paula não encontrado no auth.users';
  END IF;
  
  IF sefora_id IS NOT NULL THEN
    INSERT INTO profiles (id, email, full_name, role, is_active)
    VALUES (sefora_id, 'sefora@missabelle.com', 'Sefora', 'user', true)
    ON CONFLICT (id) DO UPDATE
    SET full_name = 'Sefora', is_active = true;
    RAISE NOTICE '✅ Profile Sefora criado';
  ELSE
    RAISE WARNING '⚠️  Usuário Sefora não encontrado no auth.users';
  END IF;
  
  IF thais_id IS NOT NULL THEN
    INSERT INTO profiles (id, email, full_name, role, is_active)
    VALUES (thais_id, 'thais@missabelle.com', 'Thais', 'user', true)
    ON CONFLICT (id) DO UPDATE
    SET full_name = 'Thais', is_active = true;
    RAISE NOTICE '✅ Profile Thais criado';
  ELSE
    RAISE WARNING '⚠️  Usuário Thais não encontrado no auth.users';
  END IF;
END $$;
```

---

### ✅ ETAPA 4: Associar Procedimentos

Execute no **Supabase SQL Editor**:

```
📁 03_associar_procedimentos.sql
```

**O que faz**:
- Busca os IDs dos profissionais
- Associa procedimentos específicos de cada um
- Mostra quantos foram associados

**Mensagem esperada**:
```
✅ Ana Paula: 13 procedimentos associados
✅ Sefora: 6 procedimentos associados
✅ Thais: 10 procedimentos associados
```

---

## 🧪 VALIDAR TUDO

Execute no **SQL Editor** para verificar:

```sql
-- Ver profissionais e total de procedimentos
SELECT 
  prof.full_name as profissional,
  prof.email,
  prof.role,
  COUNT(pp.id) as total_procedures
FROM profiles prof
LEFT JOIN professional_procedures pp ON pp.professional_id = prof.id
WHERE prof.is_active = true
GROUP BY prof.id, prof.full_name, prof.email, prof.role
ORDER BY prof.full_name;

-- Ver detalhes de cada profissional com seus procedimentos
SELECT 
  prof.full_name as profissional,
  proc.name as procedimento,
  proc.duration_minutes || ' min' as duracao,
  'R$ ' || proc.default_price as preco
FROM profiles prof
JOIN professional_procedures pp ON pp.professional_id = prof.id
JOIN procedures proc ON proc.id = pp.procedure_id
WHERE prof.is_active = true
ORDER BY prof.full_name, proc.name;
```

**Resultado esperado**:
| profissional | total_procedures |
|--------------|-----------------|
| Ana Paula Almeida Santana | 13 |
| Sefora | 6 |
| Thais | 10 |

---

## 📊 Distribuição de Procedimentos

### 👩 Ana Paula Almeida Santana (13)
**Categoria**: Estética Facial + Cílios
- Avaliação Gratuita (30 min) - R$ 0
- Brow Lamination (40 min) - R$ 80
- Design de Sobrancelha (30 min) - R$ 30
- Despigmentação (30 min) - R$ 100
- Lash Lifting (60 min) - R$ 100
- Manutenção da Micro 6+ meses (30 min) - R$ 200
- Manutenção Geral (60 min) - R$ 70
- Micro-labial (210 min) - R$ 350
- Micropigmentação (90 min) - R$ 350
- Pintura Sobrancelhas - Henna (30 min) - R$ 50
- Retoque da Micro (30 min) - R$ 200
- Retoque da Micro-labial (60 min) - R$ 0
- Extensão de Cílios (120 min) - R$ 130

### 💄 Sefora (6)
**Categoria**: Maquiagem
- Curso Automake (180 min) - R$ 0
- Maquiagem Noiva (240 min) - R$ 0
- Maquiagem Noiva + Acompanhamento (420 min) - R$ 0
- Maquiagem Social (60 min) - R$ 0
- Pré Casamento (60 min) - R$ 0
- Teste de Noiva (60 min) - R$ 0

### 💇 Thais (10)
**Categoria**: Cabelo
- Corte de Cabelo (40 min) - R$ 0
- Escova e Babyliss (60 min) - R$ 0
- Escova Modelada (60 min) - R$ 0
- Escova Progressiva (180 min) - R$ 0
- Escova Simples (60 min) - R$ 0
- Hidratação Capilar (40 min) - R$ 0
- Maquiagem Blindada - Ianne (60 min) - R$ 0
- Penteado Completo (60 min) - R$ 0
- Baby Liss / Cachos (60 min) - R$ 0
- Penteado de Noiva (60 min) - R$ 0

---

## 🔐 Credenciais de Login

Após tudo configurado:

| Profissional | Email | Senha | Role |
|--------------|-------|-------|------|
| Ana Paula | anapaulaalmeida@missabelle.com | Amin123 | user |
| Sefora | sefora@missabelle.com | Amin123 | user |
| Thais | thais@missabelle.com | Amin123 | user |

---

## 🎯 TESTAR NA APLICAÇÃO

1. **Faça login** como Ana Paula
2. Vá em **"Novo Agendamento"**
3. Observe que aparecem **apenas os 13 procedimentos dela**!
4. Repita para Sefora (6 procedimentos) e Thais (10 procedimentos)

---

## ⚠️ ATENÇÃO: Preços R$ 0,00

Notei que muitos procedimentos estão com preço R$ 0,00. Isso é intencional? 

Se quiser atualizar os preços depois:

```sql
UPDATE procedures SET default_price = 150.00 WHERE name = 'Maquiagem Noiva';
UPDATE procedures SET default_price = 80.00 WHERE name = 'Corte de Cabelo';
-- etc...
```

---

## 🎉 PRONTO!

Depois de seguir todos os passos, você terá:
- ✅ 3 profissionais criados
- ✅ 29 procedimentos reais
- ✅ Associações corretas
- ✅ Sistema funcionando!

---

**Boa sorte!** 🚀
