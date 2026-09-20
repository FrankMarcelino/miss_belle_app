/**
 * Sinônimos do procedimento: a profissional digita separado por vírgula, o
 * banco guarda text[]. São eles que fazem o bot entender "quero fazer uma
 * escova" quando o serviço se chama "Corte + Escova".
 */

export function parseSynonyms(input: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const raw of input.split(/[,\n]/)) {
    const term = raw.trim();
    if (!term) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(term);
  }

  return out;
}

export function formatSynonyms(synonyms: string[] | null | undefined): string {
  return (synonyms ?? []).join(', ');
}
