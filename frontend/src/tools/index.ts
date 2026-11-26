import type { Tool } from "./tools";

// Every tool lives in ./<name>/tool.ts and exports a Tool; they are discovered automatically.
const modules = import.meta.glob<Record<string, unknown>>("./*/tool.ts", { eager: true });

export const allTools: Tool[] = Object.values(modules).flatMap((mod) =>
  Object.values(mod).filter(
    (v): v is Tool => typeof v === "object" && v !== null && "path" in v && "component" in v,
  ),
);

const byCategory: Record<string, Tool[]> = {};
allTools.forEach((tool) => {
  if (!byCategory[tool.category]) {
    byCategory[tool.category] = [];
  }
  byCategory[tool.category].push(tool);
});
for (const category in byCategory) {
  byCategory[category].sort((a, b) => a.name.localeCompare(b.name));
}

export const toolsByCategory = byCategory;
