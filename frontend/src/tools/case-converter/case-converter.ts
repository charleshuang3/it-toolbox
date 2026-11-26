/** Splits text into words, handling camelCase, PascalCase, acronyms, digits and separators. */
export function splitWords(input: string): string[] {
  return (
    input
      .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
      .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, "$1 $2")
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

export function camelCase(s: string): string {
  return splitWords(s)
    .map((w, i) => (i === 0 ? w.toLowerCase() : cap(w)))
    .join("");
}
export const pascalCase = (s: string) => splitWords(s).map(cap).join("");
export const snakeCase = (s: string) =>
  splitWords(s)
    .map((w) => w.toLowerCase())
    .join("_");
export const kebabCase = (s: string) =>
  splitWords(s)
    .map((w) => w.toLowerCase())
    .join("-");
export const constantCase = (s: string) =>
  splitWords(s)
    .map((w) => w.toUpperCase())
    .join("_");
export const titleCase = (s: string) => splitWords(s).map(cap).join(" ");
export function sentenceCase(s: string): string {
  const t = splitWords(s)
    .map((w) => w.toLowerCase())
    .join(" ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}
export const lowerCase = (s: string) => s.toLowerCase();
export const upperCase = (s: string) => s.toUpperCase();

/** URL slug: lowercase, diacritics removed, words joined by "-". */
export function slug(s: string): string {
  return kebabCase(s.normalize("NFKD").replace(/\p{M}+/gu, ""));
}

export const caseFormats = [
  { id: "camel", label: "camelCase", fn: camelCase },
  { id: "pascal", label: "PascalCase", fn: pascalCase },
  { id: "snake", label: "snake_case", fn: snakeCase },
  { id: "kebab", label: "kebab-case", fn: kebabCase },
  { id: "constant", label: "CONSTANT_CASE", fn: constantCase },
  { id: "title", label: "Title Case", fn: titleCase },
  { id: "sentence", label: "Sentence case", fn: sentenceCase },
  { id: "lower", label: "lower case", fn: lowerCase },
  { id: "upper", label: "UPPER CASE", fn: upperCase },
  { id: "slug", label: "Slug", fn: slug },
] as const;
