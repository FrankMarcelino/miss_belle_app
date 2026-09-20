# Vínculo entre o tenant da LIVIA e a clínica no Miss Belle

> Design fechado em 2026-09-20. Fatia 1 de 3.
> Contrato público: `doc/api/agendamento-v1.md`.

## O problema

Hoje o vínculo entre "tenant X da LIVIA" e "clínica Y no Miss Belle" existe **só
dentro do Agent Builder**: eles guardam a chave da API na configuração do tenant
deles. Funciona, e é invisível para os dois lados. Quando algo quebrar, a
pergunta "esta chave atende qual clínica?" só tem resposta no sistema de um
terceiro.

## A tensão

Os usos pedidos puxam para lados opostos:

| Uso | Exige o vínculo em |
|---|---|
| a LIVIA mostrar que o tenant tem agenda integrada | **LIVIA** — ela não tem a chave para perguntar |
| diagnóstico e suporte | **Miss Belle** — é lá que a pergunta nasce |
| onboarding de clínica nova | os dois |
| o AB conferir a própria configuração | Miss Belle, exposto por API |

Ou seja: **os dois lados vão guardar um ponteiro para o outro.** Dois ponteiros
divergem — alguém troca um tenant, refaz uma chave, e ninguém percebe.

## A decisão

Aceitar os dois ponteiros e **tornar a divergência detectável**, em vez de tentar
evitá-la com uma fonte única que não serve aos dois usos.

O instrumento é um endpoint de identidade: o Miss Belle sabe responder "esta
chave é da clínica X, vinculada ao tenant Y da LIVIA". Com isso:

- o AB confere na configuração e falha alto quando a chave errada é colada, em
  vez de atender a clínica errada em silêncio;
- o suporte compara os dois lados a qualquer momento, sem abrir o banco.

## Fatia 1 (esta)

**Banco.** `api_keys.livia_tenant_id uuid`. A chave já é "uma por integração": é
o lugar natural do vínculo, e ele nasce junto com a emissão. `api_issue_key`
passa a aceitar o id da LIVIA.

**Contrato.** `GET /v1/clinic`, aditivo:

```json
{ "id": "...", "name": "Miss Belle", "liviaTenantId": "...", "timezone": "America/Sao_Paulo" }
```

`timezone` é fixo (`America/Sao_Paulo`) e está ali para o AB não precisar
adivinhar o fuso dos horários que a API devolve.

**O que NÃO entra:** a chave nunca é devolvida, nem em hash. O endpoint responde
sobre a chave que autenticou a chamada, e só sobre ela.

## Fatias seguintes

2. **LIVIA** registra que o tenant tem agenda integrada (provedor + id externo),
   no mesmo espírito do `tenants.agent_builder_integration_id` que já existe.
   **Sem a chave**: ela continua só no AB. Se um dia a LIVIA for consultar a
   agenda direto, aí se discute segredo, e o lugar é o Vault.
3. **Roteiro de onboarding**: criar a clínica, emitir a chave já com o vínculo,
   registrar na LIVIA, configurar no AB — com o `/v1/clinic` fechando o ciclo.
