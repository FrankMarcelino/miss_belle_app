# Migrations arquivadas

Estas 27 migrations foram substituídas em 2026-09-18 por
`supabase/migrations/00000000000000_baseline.sql`, gerado por `supabase db dump`
do banco de produção.

**Por que:** o schema-base (`profiles`, `appointments`, `procedures`, `patients`,
`professional_procedures`, `cash_register_*`) nasceu no dashboard e nunca teve
`CREATE TABLE` no git — o banco não subia do zero. Além disso, só 2 destas
migrations estavam registradas no histórico de produção; as outras 25 foram
aplicadas pelo SQL Editor.

**Ficam aqui como história**, não como código executável: o CLI só lê
`supabase/migrations/`. Para saber *por que* algo é como é, leia estas; para
saber *como* o banco está, leia o baseline.

A migration do cron de trial (`20260322000002`) **não** foi arquivada: virou
`00000000000001_trial_expiry_cron.sql`, porque job de `pg_cron` é dado
(`cron.job`), não estrutura, e o dump não o captura.

## 2026-09-20 — `00000000000001_trial_expiry_cron.sql`

Arquivada porque **nunca foi aplicada em produção**. Medido em 20/09: o projeto
não tem `pg_cron` nem `pg_net`, não existe schema `cron`, e a função
`notify_trial_expiring` não existe no banco. O aviso de "7 dias antes do trial
expirar" nunca chegou a funcionar.

Em 19/09 ela foi carimbada como aplicada por um `migration repair`, por inferência
("o arquivo está no repo, logo produção deve ter"). O dump do baseline já dizia o
contrário — zero menções a `pg_cron` — e a pista não foi seguida. O carimbo foi
desfeito (`repair --status reverted`) em 20/09.

Reativar o aviso de trial exige decidir: habilitar `pg_cron` e `pg_net` no projeto
e aplicar isto de novo, ou implementar de outro jeito (Edge Function agendada).
Enquanto isso não for decidido, o arquivo fica aqui como histórico.
