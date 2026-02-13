## IT Toolbox

IT Toolbox is a modern web application built with Vue 3, TypeScript, Vite, and DaisyUI that provides a collection of useful IT tools in a single, easy-to-use interface.

## How To Add New Tools

This guide explains how to add a new tool to the IT Toolbox application.

### Directory Structure

Each tool follows a specific directory structure under `src/tools/`:

```
src/tools/
├── index.ts              # Registers all tools in allTools array
├── tools.ts              # Tool interface definition
└── {tool-path}/
    ├── tool.ts           # Tool metadata (name, description, icon, path, component)
    └── {component}.vue   # Tool component (Vue SFC)
```

### Step 1: Create Tool Directory

Create a new directory under `src/tools/` with your tool's path name (kebab-case):

```bash
mkdir src/tools/my-new-tool
```

### Step 2: Create Tool Metadata

Create a `tool.ts` file in your tool directory using the `Tool` interface:

```typescript
// src/tools/my-new-tool/tool.ts
import type { Tool } from '../tools';

export const myNewTool: Tool = {
  path: 'my-new-tool', // Used in URL for routing
  name: 'My New Tool', // Display name
  category: 'Category', // For grouping in sidebar
  description: 'Description of what the tool does',
  icon: 'iconify-icon-name', // Icon from Iconify (e.g., 'tabler:tool')
  component: './my-new-tool.vue', // Relative path to Vue component
};
```

### Step 3: Create Tool Component

Create a Vue component file (the filename should match what you specified in the `component` field):

```vue
<!-- src/tools/my-new-tool/my-new-tool.vue -->
<script setup lang="ts">
// Your tool's logic here
</script>

<template>
  <div class="tool-container">
    <!-- Tool UI -->
  </div>
</template>
```

### Step 4: Register the Tool

Open `src/tools/index.ts` and add your tool:

```typescript
import { myNewTool } from './my-new-tool/tool';
import type { Tool } from './tools';

export const allTools: Tool[] = [
  hashText,
  myNewTool, // Add your tool here
];
```
