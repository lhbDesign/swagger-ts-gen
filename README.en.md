# swagger-ts-mcp

[中文](./README.md) | English

Auto-generate TypeScript type definitions from Swagger/OpenAPI docs for frontend API files.

Supports two modes: **CLI** and **MCP Server (AI IDE integration)**.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [CLI Usage](#cli-usage)
- [MCP Server Usage](#mcp-server-usage)
- [API Tool Compatibility](#api-tool-compatibility)
- [How It Works](#how-it-works)
- [FAQ](#faq)

---

## Installation

### Option 1: Global install from npm (recommended)

```bash
npm install -g swagger-ts-mcp
```

Then use it anywhere:

```bash
swagger-ts-mcp --file src/api/user.ts --swagger https://your-api/doc.html
```

> Note: The `--file` path is relative to your current working directory. Make sure to run the command from your project root, or use an absolute path.

### Option 2: npx (no install)

```bash
npx swagger-ts-mcp --file src/api/user.ts --swagger https://your-api/doc.html
```

---

## Quick Start

**Step 1**: Create `swagger-ts-gen.config.json` in your project root:

```json
{
  "swaggerUrl": "https://your-api/doc.html",
  "defaultFiles": ["src/api/user.ts"]
}
```

**Step 2**: Run:

```bash
swagger-ts-mcp
```

The tool will automatically:

1. Parse the API file and find functions with `any` or untyped parameters
2. Fetch the matching schema from the Swagger doc
3. Generate TypeScript interfaces and insert them above the function
4. Replace `any` with the generated type name

**Example**:

Before:

```typescript
// Cancel publish
export async function cancelPublishApi(params?: any) {
  return requestClient.get("/model/publish/cancel", { params });
}
```

After:

```typescript
/** Cancel publish request params */
export interface CancelPublishParams {
  /** Model ID */
  modelId?: number;
}

// Cancel publish
export async function cancelPublishApi(params?: CancelPublishParams) {
  return requestClient.get("/model/publish/cancel", { params });
}
```

---

## Configuration

Create `swagger-ts-gen.config.json` in your project root:

```json
{
  "swaggerUrl": "https://your-api/doc.html",
  "defaultFiles": ["src/api/user.ts", "src/api/order.ts"],
  "endpointPrefix": "/algo",
  "clientName": "requestClient",
  "outputStyle": "interface"
}
```

| Option           | Type                      | Default           | Description                                                                                       |
| ---------------- | ------------------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| `swaggerUrl`     | `string`                  | —                 | Swagger doc URL. Supports `doc.html`, `/v3/api-docs`, `/v2/api-docs`                              |
| `defaultFiles`   | `string[]`                | —                 | Default API files to process                                                                      |
| `endpointPrefix` | `string`                  | `""`              | Path prefix to strip. If code uses `/algo/user/list` but Swagger has `/user/list`, set to `/algo` |
| `clientName`     | `string`                  | `"requestClient"` | HTTP client object name, e.g. `axios`, `http`                                                     |
| `outputStyle`    | `"interface"` \| `"type"` | `"interface"`     | Output type style                                                                                 |

---

## CLI Usage

```bash
# Use config file (recommended)
swagger-ts-mcp

# Specify file and swagger URL
swagger-ts-mcp --file src/api/user.ts --swagger https://your-api/doc.html

# Dry run (preview only, no file changes)
swagger-ts-mcp --file src/api/user.ts --swagger https://your-api/doc.html --dry-run
```

### All Options

| Flag                | Description                   | Example                                      |
| ------------------- | ----------------------------- | -------------------------------------------- |
| `--file`            | Target API file path          | `--file src/api/user.ts`                     |
| `--swagger`         | Swagger doc URL               | `--swagger https://api.example.com/doc.html` |
| `--dry-run`         | Preview mode, no file changes | `--dry-run`                                  |
| `--mcp`             | Start as MCP Server           | `--mcp`                                      |
| `--endpoint-prefix` | Path prefix override          | `--endpoint-prefix /algo`                    |
| `--client-name`     | HTTP client name override     | `--client-name axios`                        |

---

## MCP Server Usage

MCP (Model Context Protocol) mode lets AI IDEs like Kiro and Cursor call this tool directly.

### Kiro

Add to `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "swagger-ts-mcp": {
      "command": "npx",
      "args": ["swagger-ts-mcp", "--mcp"],
      "disabled": false,
      "autoApprove": ["generate_types"]
    }
  }
}
```

Then just say in chat:

> Generate TypeScript types for `cancelPublishApi` (call the generate_types tool)

### Cursor

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "swagger-ts-mcp": {
      "command": "npx",
      "args": ["swagger-ts-mcp", "--mcp"]
    }
  }
}
```

Press `Cmd+Shift+P` → search `MCP` → click **Reload MCP Servers**.

> If you see an error saying the MCP config file cannot be read, just create the file at `.cursor/mcp.json` and paste the JSON above.

### Tool Parameters

Tool name: `generate_types`

| Parameter       | Type       | Required | Description                    |
| --------------- | ---------- | -------- | ------------------------------ |
| `filePath`      | `string`   | ✅       | Target API file path           |
| `swaggerUrl`    | `string`   | —        | Swagger URL (overrides config) |
| `functionNames` | `string[]` | —        | Only process these functions   |
| `dryRun`        | `boolean`  | —        | Preview mode, no file changes  |

---

## API Tool Compatibility

| Tool                | How to use                                                                                    |
| ------------------- | --------------------------------------------------------------------------------------------- |
| Swagger / SpringDoc | Pass `doc.html` URL directly, auto-converts to `/v3/api-docs` or `/v2/api-docs`               |
| Knife4j             | Same as Swagger, fully compatible                                                             |
| YApi                | Use export URL: `https://your-yapi.com/api/plugin/export?type=swagger&pid=<id>&token=<token>` |
| Apifox              | Export as OpenAPI 3.0 URL from project settings                                               |
| Postman             | Export collection as OpenAPI 3.0 JSON                                                         |

---

## How It Works

```
API file (*.ts)
    ↓ Parse AST, find requestClient.xxx() calls
    ↓ Filter functions with any or untyped params
    ↓
Swagger doc
    ↓ Match endpoint + method
    ↓ Extract request/response schema
    ↓
TypeScript type generation
    ↓ Schema → interface/type
    ↓ Handle $ref, oneOf/anyOf/allOf
    ↓
Write to file
    ↓ Insert type above function
    ↓ Replace any with generated type name
```

### Naming Convention

| Type                | Rule               | Example             |
| ------------------- | ------------------ | ------------------- |
| Request params      | `{BaseName}Params` | `GetUserListParams` |
| Response body       | `{BaseName}Result` | `GetUserListResult` |
| Response data field | `{BaseName}Data`   | `GetUserListData`   |

Function name conversion: `getUserListApi` → strip `Api` suffix → capitalize → `GetUserList`

---

## FAQ

**Q: The path in code has a prefix but Swagger doesn't. How to handle?**

Use `endpointPrefix`. If code has `/algo/user/list` but Swagger has `/user/list`:

```json
{ "endpointPrefix": "/algo" }
```

**Q: My project uses axios instead of requestClient.**

```json
{ "clientName": "axios" }
```

**Q: How to preview without modifying files?**

Add `--dry-run` flag.

**Q: Only want to process specific functions?**

Pass `functionNames` in MCP mode.

**Q: Swagger requires authentication.**

Currently unauthenticated requests only. Open `/v3/api-docs` in your browser, save the JSON locally, and pass it as the URL.

**Q: Getting `sh: tsx: command not found` error?**

`tsx` is not installed globally. Fix it one of these ways:

Run from the local `node_modules`:

```bash
npx --prefix packages/swagger-ts-gen tsx packages/swagger-ts-gen/bin/index.ts \
  --file <path> \
  --swagger <url>
```

Or install `tsx` globally (recommended):

```bash
npm install -g tsx
```
