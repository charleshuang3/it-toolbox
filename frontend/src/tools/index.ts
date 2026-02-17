import { hashText } from './hash-text/tool';
import { uuidGenerator } from './uuid-generator/tool';
import { ulidGenerator } from './ulid-generator/tool';
import { jwtParser } from './jwt-parser/tool';
import { randomStringGenerator } from './random-string-generator/tool';
import { encryption } from './encryption/tool';
import { bcrypt } from './bcrypt/tool';
import { hmacTool } from './hmac/tool';
import { Tool } from './tools';

export const allTools: Tool[] = [
  hashText,
  uuidGenerator,
  ulidGenerator,
  jwtParser,
  randomStringGenerator,
  encryption,
  bcrypt,
  hmacTool,
];

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
