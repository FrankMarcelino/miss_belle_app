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
