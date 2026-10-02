-- Nome de procedimento é único POR CLÍNICA, não no banco inteiro.
--
-- A baseline herdou `procedures_name_key UNIQUE (name)` do tempo em que só existia
-- a Miss Belle. Com o banco multi-tenant, isso faz uma clínica "dona" de um nome:
-- se a Miss Belle tem "Corte", nenhuma outra clínica consegue cadastrar "Corte"
-- (23505 na tela de Procedimentos). Apareceu ao montar a LA Belle, clínica de
-- demonstração que espelha o catálogo da Miss Belle (LIVIA-AVOCADO/app#1237).
--
-- Ninguém depende da unicidade global: API, confirmação e retoque referenciam
-- procedimento por id, sempre filtrando tenant_id. A unicidade dentro da clínica
-- continua valendo, que é o que a tela espera.
--
-- Volta: o inverso só funciona enquanto não houver o mesmo nome em duas clínicas.

alter table public.procedures drop constraint procedures_name_key;

alter table public.procedures
  add constraint procedures_tenant_id_name_key unique (tenant_id, name);
