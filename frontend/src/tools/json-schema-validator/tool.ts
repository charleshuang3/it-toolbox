import type { Tool } from '../tools';

export const jsonSchemaValidator: Tool = {
  path: 'json-schema-validator',
  name: 'JSON Schema Validator',
  category: 'Data',
  description: 'Validate JSON, JSON5, YAML, or TOML data against a JSON Schema',
  icon: 'fluent-emoji-high-contrast:check-mark-button',
  component: () => import('./json-schema-validator.vue'),
};
