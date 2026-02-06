# 🚀 Criar Usuários e Procedimentos Reais

## 📍 Você está aqui

Esta pasta contém scripts para criar os **3 profissionais reais** da clínica com seus procedimentos específicos.

---

## 🧹 PRIMEIRO: Limpar dados de teste (OPCIONAL)

Se você já executou o `seed_SAFE.sql` antes e quer começar do zero:

```sql
📁 00_limpar_dados_teste.sql
```

Este script remove todos os dados de teste (agendamentos, pacientes, procedimentos, etc.) mas mantém os usuários.

---

## ⚡ OPÇÃO RÁPIDA: Fazer tudo de uma vez (RECOMENDADO!)

Execute **apenas 1 arquivo** e pronto:

```sql
📁 EXECUTAR_TUDO_DE_UMA_VEZ.sql
```

Este script faz **TUDO automaticamente**:
- ✅ Cria os 3 usuários no auth.users (com senhas hasheadas)
- ✅ Cria os profiles correspondentes
- ✅ Adiciona constraint UNIQUE em procedures
- ✅ Remove dados de teste antigos
- ✅ Cria 29 procedimentos reais
- ✅ Associa procedimentos aos profissionais

**Não precisa fazer NADA manualmente!** 🎉

---

## 📋 OPÇÃO PASSO A PASSO: Executar por etapas (se preferir)

⚠️ **Nota**: Use isso apenas se quiser entender cada etapa separadamente. 
Para produção, use a **Opção Rápida** acima!

### Passo 1: Criar usuários manualmente
**Dashboard → Authentication → Users → Add User**

| Email | Senha | Nome Completo |
|-------|-------|---------------|
| anapaulaalmeida@missabelle.com | Amin123 | Ana Paula Almeida Santana |
| sefora@missabelle.com | Amin123 | Sefora |
| thais@missabelle.com | Amin123 | Thais |

⚠️ **Importante**: Marque "Auto Confirm User" ✅

### Passo 2: Criar procedimentos
```sql
📁 02_criar_procedimentos_reais_SAFE.sql
```

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

### Erro: "violates foreign key constraint"
**Causa**: Tentando deletar dados na ordem errada.

**Ordem CORRETA de deleção** (respeita foreign keys):
```
1. cash_register_transactions  (referencia appointments)
   ↓
2. cash_register_closings       (referencia profiles)
   ↓
3. appointments                 (referencia procedures, patients, profiles)
   ↓
4. patients                     (referencia profiles)
   ↓
5. professional_procedures      (referencia profiles, procedures)
   ↓
6. procedures                   (não tem dependências)
```

**Solução**: Use o script `00_limpar_dados_teste.sql` que deleta na ordem correta.

### Erro: "Usuário não encontrado"
**Solução**: Crie os usuários no Supabase Auth primeiro (Dashboard → Authentication → Users).

### Usuários não aparecem
**Solução**: Verifique se os profiles foram criados:
```sql
SELECT * FROM profiles WHERE email LIKE '%missabelle.com';
```

---

**Boa sorte!** 🚀
