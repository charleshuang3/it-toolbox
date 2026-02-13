import { hashText } from './hash-text/tool';
import { uuidGenerator } from './uuid-generator/tool';
import { Tool } from './tools';

export const allTools: Tool[] = [hashText, uuidGenerator];

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
