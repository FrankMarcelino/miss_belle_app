# 🚀 INSTRUÇÕES DE DEPLOY FINAL

## ⚠️ IMPORTANTE: Execute APENAS via Dashboard

O Supabase CLI está tentando aplicar migrations antigas com conflitos. A solução é executar o SQL diretamente no Dashboard.

---

## ✅ PASSO A PASSO (2 minutos)

### **1️⃣ Executar SQL no Dashboard**

1. Acesse: https://supabase.com/dashboard/project/otzaauwiziyoxlvttgsb/sql/new

2. Cole TODO o conteúdo do arquivo **`EXECUTAR_NO_SUPABASE_DASHBOARD.sql`**

3. Clique em **"RUN"** (ou pressione `Ctrl+Enter`)

4. Aguarde a mensagem de sucesso ✅

**O que esse script faz:**
- ✅ Cria função `is_super_admin()` (SECURITY DEFINER)
- ✅ Remove TODAS as policies conflitantes
- ✅ Cria novas policies corretas para:
  - `profiles` (7 policies)
  - `patients` (8 policies)
  - `appointments` (8 policies)
  - `professional_procedures` (8 policies)
  - `cash_register_closings` (8 policies)
  - `cash_register_transactions` (8 policies)

---

### **2️⃣ Edge Function (create-user)**

**✅ JÁ FOI DEPLOYADA!**

```bash
# Confirmação (já executado):
✅ Deployed Functions on project otzaauwiziyoxlvttgsb: create-user
```

Link: https://supabase.com/dashboard/project/otzaauwiziyoxlvttgsb/functions

---

## 🎯 O QUE FUNCIONA AGORA

### ✅ **Criar Usuário (Super Admin)**
- **Sem email de confirmação** ✅
- Associação automática de procedimentos ✅
- Validações completas ✅

### ✅ **Editar Usuário**
- Atualizar informações ✅
- **Resetar senha** (nova feature) ✅
- Mudar role/status ✅

### ✅ **Deletar Usuário**
- Cascade automático (deleta appointments, patients, etc.) ✅
- Aviso de dependências antes de deletar ✅
- Super admin não pode se deletar ✅

### ✅ **Filtros & Estatísticas**
- Filtro por role (Super Admin / Usuário) ✅
- Filtro por status (Ativo / Inativo) ✅
- Estatísticas em tempo real (pacientes, agendamentos, procedimentos) ✅

### ✅ **Responsividade**
- Desktop: tabela completa ✅
- Mobile: cards otimizados ✅

---

## 🧪 TESTAR

1. Execute o SQL no Dashboard (Passo 1️⃣)
2. Faça logout/login no app
3. Teste criar/editar/deletar usuários
4. Verifique filtros e estatísticas

---

## 📝 RESUMO DE COMANDOS (apenas para referência)

### ✅ Edge Function (JÁ DEPLOYADA)
```bash
cd /home/frank/miss_belle_app/miss_belle_app
npx supabase functions deploy create-user
```

### ⚠️ SQL (executar no Dashboard, não via CLI)
- Arquivo: `EXECUTAR_NO_SUPABASE_DASHBOARD.sql`
- URL: https://supabase.com/dashboard/project/otzaauwiziyoxlvttgsb/sql/new

---

## 🔒 SEGURANÇA

- ✅ RLS habilitado em todas as tabelas
- ✅ Super admins: acesso total
- ✅ Users: acesso apenas aos próprios dados
- ✅ Service Role Key protegida (Edge Function)
- ✅ Função `is_super_admin()` com SECURITY DEFINER

---

## 🎉 ESTÁ PRONTO!

Basta executar o SQL no Dashboard e começar a usar! 🚀
