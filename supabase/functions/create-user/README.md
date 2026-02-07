# 🔧 Edge Function: Create User

**Função**: Criar usuários sem enviar email de confirmação  
**Uso**: Super admin cria novos usuários via frontend  
**Segurança**: Service role apenas no backend

---

## 📝 O que faz

Esta Edge Function permite que super admins criem novos usuários com:
- ✅ Email auto-confirmado (sem enviar email)
- ✅ Senha definida pelo admin
- ✅ Role definido (super_admin ou user)
- ✅ Profile criado automaticamente
- ✅ Seguro (service_role apenas no backend)

---

## 🚀 Deploy da Edge Function

### 1. Login no Supabase CLI

```bash
npx supabase login
```

### 2. Link com seu projeto

```bash
cd /home/frank/miss_belle_app/miss_belle_app/supabase
npx supabase link --project-ref SEU_PROJECT_REF
```

Para encontrar o `PROJECT_REF`:
- Vá no Dashboard do Supabase
- Project Settings → General
- Reference ID

### 3. Deploy da função

```bash
npx supabase functions deploy create-user
```

### 4. Verificar deploy

```bash
npx supabase functions list
```

Deve aparecer:
```
┌─────────────┬────────────┬─────────┬────────────────┐
│ NAME        │ VERSION    │ STATUS  │ CREATED AT     │
├─────────────┼────────────┼─────────┼────────────────┤
│ create-user │ v1         │ ACTIVE  │ 2026-02-06...  │
└─────────────┴────────────┴─────────┴────────────────┘
```

---

## 🔒 Segurança

### Environment Variables

A função usa variáveis que o Supabase fornece automaticamente:
- `SUPABASE_URL` - URL do projeto
- `SUPABASE_SERVICE_ROLE_KEY` - Key admin (secreta)

**Nunca exponha essas keys no frontend!**

### Validações da Função

1. ✅ Verifica se caller está autenticado
2. ✅ Verifica se caller é super admin ativo
3. ✅ Valida todos campos obrigatórios
4. ✅ Valida senha mínima (6 chars)
5. ✅ Valida role (super_admin ou user)
6. ✅ Rollback se criar auth mas falhar profile

---

## 📡 API da Edge Function

### Endpoint

```
POST https://SEU_PROJECT.supabase.co/functions/v1/create-user
```

### Headers

```json
{
  "Authorization": "Bearer USER_ACCESS_TOKEN",
  "Content-Type": "application/json"
}
```

### Body

```json
{
  "email": "novousuario@example.com",
  "password": "senha123",
  "full_name": "Nome Completo",
  "role": "user"
}
```

### Response (Success - 200)

```json
{
  "user": {
    "id": "uuid-do-usuario",
    "email": "novousuario@example.com",
    "full_name": "Nome Completo",
    "role": "user"
  }
}
```

### Response (Error - 400/401/403/500)

```json
{
  "error": "Mensagem de erro"
}
```

---

## 🧪 Testar Localmente

### 1. Rodar função local

```bash
npx supabase functions serve create-user --env-file supabase/.env.local
```

### 2. Criar arquivo .env.local

```bash
# supabase/.env.local
SUPABASE_URL=https://seu-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key
```

⚠️ **Nunca commite o .env.local!**

### 3. Testar com curl

```bash
curl -X POST \
  http://localhost:54321/functions/v1/create-user \
  -H "Authorization: Bearer SEU_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@example.com",
    "password": "senha123",
    "full_name": "Usuario Teste",
    "role": "user"
  }'
```

---

## 🔄 Fluxo Completo

### Frontend → Edge Function → Database

```
1. Super admin preenche form no frontend
2. Frontend chama:
   POST /functions/v1/create-user
   Headers: Bearer token do super admin
   Body: { email, password, full_name, role }

3. Edge Function recebe:
   • Valida token (getUser)
   • Busca profile do caller
   • Verifica se é super_admin ativo
   • Valida dados do body
   
4. Edge Function cria:
   • auth.users (Admin API, email_confirm: true)
   • profiles (com role definido)
   
5. Edge Function retorna:
   • 200 OK + user data
   
6. Frontend recebe:
   • Associa procedimentos
   • Toast de sucesso
   • Recarrega lista
```

---

## ⚠️ Troubleshooting

### Error: Function not found

```bash
# Verificar se deploy funcionou
npx supabase functions list

# Re-deploy
npx supabase functions deploy create-user
```

### Error: 401 Unauthorized

- Verificar se token está sendo enviado
- Verificar se token é válido (não expirou)

### Error: 403 Forbidden

- Caller não é super admin
- Profile do caller está inativo
- Verificar no banco:
  ```sql
  SELECT * FROM profiles WHERE id = 'caller-id';
  ```

### Error: 500 Internal Server Error

- Verificar logs da função:
  ```bash
  npx supabase functions logs create-user
  ```

---

## 📚 Referências

- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Admin API](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
- [Deno Deploy](https://deno.com/deploy/docs)

---

## ✅ Checklist de Deploy

- [ ] Login no Supabase CLI (`npx supabase login`)
- [ ] Link com projeto (`npx supabase link`)
- [ ] Deploy função (`npx supabase functions deploy create-user`)
- [ ] Verificar função ativa (`npx supabase functions list`)
- [ ] Testar no frontend (criar usuário)
- [ ] Verificar logs se houver erro (`npx supabase functions logs`)

---

**Após deploy, a criação de usuários funcionará sem envio de email!** 🎉
