# swagger-ts-mcp

中文 | [English](./README.en.md)

从 Swagger/OpenAPI 文档自动为前端接口文件生成 TypeScript 类型定义。

支持两种调用方式：**命令行（CLI）** 和 **MCP Server（AI IDE 集成）**。

---

## 目录

- [安装](#安装)
- [快速开始](#快速开始)
- [配置文件](#配置文件)
- [命令行使用](#命令行使用)
- [MCP Server 使用](#mcp-server-使用)
- [针对不同 API 工具的使用方式](#针对不同-api-工具的使用方式)
- [工作原理](#工作原理)
- [常见问题](#常见问题)

---

## 安装

### 方式一：全局安装（推荐）

```bash
npm install -g swagger-ts-mcp
```

安装后可在任意项目中直接使用：

```bash
swagger-ts-mcp --file src/api/user.ts --swagger https://your-api/doc.html
```

注意：`--file` 路径是相对于当前命令行所在目录的，需要在项目根目录下执行，或使用绝对路径。

### 方式二：npx 临时使用

```bash
npx swagger-ts-mcp --file src/api/user.ts --swagger https://your-api/doc.html
```

---

## 快速开始

**第一步**：在项目根目录创建配置文件 `swagger-ts-gen.config.json`：

```json
{
  "swaggerUrl": "https://your-api/doc.html",
  "defaultFiles": ["src/api/user.ts"]
}
```

**第二步**：运行命令：

```bash
swagger-ts-mcp
```

工具会自动：

1. 解析接口文件，找出参数类型为 `any` 或未定义的函数
2. 从 Swagger 文档获取对应接口的 Schema
3. 生成 TypeScript interface，插入到函数定义上方
4. 将函数参数的 `any` 替换为生成的具体类型名

**示例**：

处理前：

```typescript
// 取消发布
export async function cancelPublishApi(params?: any) {
  return requestClient.get("/model/publish/cancel", { params });
}
```

处理后：

```typescript
/** 取消发布请求参数 */
export interface CancelPublishParams {
  /** 模型ID */
  modelId?: number;
}

// 取消发布
export async function cancelPublishApi(params?: CancelPublishParams) {
  return requestClient.get("/model/publish/cancel", { params });
}
```

---

## 配置文件

在项目根目录创建 `swagger-ts-gen.config.json`：

```json
{
  "swaggerUrl": "https://your-api/doc.html",
  "defaultFiles": ["src/api/user.ts", "src/api/order.ts"],
  "endpointPrefix": "/algo",
  "clientName": "requestClient",
  "outputStyle": "interface"
}
```

### 配置项说明

| 配置项           | 类型                      | 默认值            | 说明                                                                                       |
| ---------------- | ------------------------- | ----------------- | ------------------------------------------------------------------------------------------ |
| `swaggerUrl`     | `string`                  | —                 | Swagger 文档地址，支持 `doc.html`、`/v3/api-docs`、`/v2/api-docs`                          |
| `defaultFiles`   | `string[]`                | —                 | 默认处理的接口文件路径列表                                                                 |
| `endpointPrefix` | `string`                  | `""`              | 接口路径前缀。代码里路径是 `/algo/user/list`，但 Swagger 里是 `/user/list`，则设为 `/algo` |
| `clientName`     | `string`                  | `"requestClient"` | HTTP 客户端对象名称，如 `axios`、`http`、`request`                                         |
| `outputStyle`    | `"interface"` \| `"type"` | `"interface"`     | 生成类型的风格                                                                             |

---

## 命令行使用

```bash
# 使用配置文件（推荐）
swagger-ts-mcp

# 指定文件和文档地址
swagger-ts-mcp --file src/api/user.ts --swagger https://your-api/doc.html

# 预览模式，不修改文件
swagger-ts-mcp --file src/api/user.ts --swagger https://your-api/doc.html --dry-run
```

### 所有参数

| 参数                | 说明                            | 示例                                         |
| ------------------- | ------------------------------- | -------------------------------------------- |
| `--file`            | 目标接口文件路径                | `--file src/api/user.ts`                     |
| `--swagger`         | Swagger 文档地址                | `--swagger https://api.example.com/doc.html` |
| `--dry-run`         | 预览模式，不修改文件            | `--dry-run`                                  |
| `--mcp`             | 以 MCP Server 模式启动          | `--mcp`                                      |
| `--endpoint-prefix` | 接口路径前缀（覆盖配置文件）    | `--endpoint-prefix /algo`                    |
| `--client-name`     | HTTP 客户端名称（覆盖配置文件） | `--client-name axios`                        |

---

## MCP Server 使用

MCP（Model Context Protocol）模式允许 Kiro、Cursor 等 AI IDE 直接调用本工具生成类型，无需手动运行命令。

### 配置 MCP Server — Kiro

在项目的 `.kiro/settings/mcp.json` 中添加：

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

### 配置 MCP Server — Cursor

在 `.cursor/mcp.json` 中添加：

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

配置完成后，在 Cursor 中按 `Cmd+Shift+P` 搜索 `MCP`，点击 **Reload MCP Servers** 使配置生效。

> 因为版本或配置不同，如果提示 MCP 文件无法读取，按照提示创建文件并输入上面的 JSON 即可。

### 在 AI IDE 中使用

**Kiro**：直接在聊天框中说：

> 帮我给 `cancelPublishApi` 生成 TypeScript 类型（调用 generate_types 工具）

**Cursor**：在 Composer（`Cmd+I`）或 Chat 中说：

> 使用 swagger-ts-mcp 工具，帮我给 `cancelPublishApi` 生成 TypeScript 类型，文件路径是 src/api/user.ts

### MCP 工具参数

工具名：`generate_types`

| 参数            | 类型       | 必填 | 说明                                          |
| --------------- | ---------- | ---- | --------------------------------------------- |
| `filePath`      | `string`   | ✅   | 目标接口文件路径                              |
| `swaggerUrl`    | `string`   | —    | Swagger 文档地址（优先于配置文件）            |
| `functionNames` | `string[]` | —    | 只处理指定函数，不传则处理所有 `any` 类型函数 |
| `dryRun`        | `boolean`  | —    | 预览模式，不修改文件                          |

---

## 针对不同 API 工具的使用方式

### Swagger / SpringDoc（默认支持）

直接传 `doc.html` 地址，工具自动转换为 `/v3/api-docs` 或 `/v2/api-docs`：

```bash
swagger-ts-mcp --file src/api/user.ts --swagger https://your-api/doc.html
```

### Knife4j

Knife4j 是 Swagger 的增强版，完全兼容，直接使用。

### YApi

使用 YApi 导出接口：

```
https://your-yapi.com/api/plugin/export?type=swagger&pid=<项目ID>&token=<项目token>
```

```bash
swagger-ts-mcp --file src/api/user.ts --swagger "https://your-yapi.com/api/plugin/export?type=swagger&pid=123&token=abc123"
```

### Apifox

在 Apifox 中：「项目设置」→「导出数据」→ 选择 `OpenAPI 3.0`，使用导出的在线 URL。

---

## 工作原理

```
接口文件 (*.ts)
    ↓ 解析 AST，找出 requestClient.xxx() 调用
    ↓ 过滤参数类型为 any 或未定义的函数
    ↓
Swagger 文档
    ↓ 根据 endpoint + method 查找接口定义
    ↓ 提取 request schema 和 response schema
    ↓
TypeScript 类型生成
    ↓ Schema → interface/type 定义
    ↓ 处理 $ref 递归引用、oneOf/anyOf/allOf
    ↓
写入文件
    ↓ 插入类型定义到函数上方
    ↓ 将 any 替换为具体类型名
```

### 命名规范

| 类型               | 命名规则           | 示例                |
| ------------------ | ------------------ | ------------------- |
| 请求参数类型       | `{BaseName}Params` | `GetUserListParams` |
| 响应体类型         | `{BaseName}Result` | `GetUserListResult` |
| 响应 data 字段类型 | `{BaseName}Data`   | `GetUserListData`   |

函数名转换规则：`getUserListApi` → 去掉 `Api` 后缀 → 首字母大写 → `GetUserList`

---

## 常见问题

**Q：接口路径在代码里有前缀，但 Swagger 里没有，怎么处理？**

使用 `endpointPrefix` 配置。例如代码里是 `/algo/user/list`，Swagger 里是 `/user/list`：

```json
{ "endpointPrefix": "/algo" }
```

**Q：项目用的是 axios 而不是 requestClient，怎么办？**

```json
{ "clientName": "axios" }
```

**Q：想先预览生成结果，不修改文件怎么做？**

加上 `--dry-run` 参数。

**Q：只想处理某几个函数？**

MCP 模式下传 `functionNames` 参数。

**Q：Swagger 文档需要登录认证怎么办？**

目前不支持带认证头的请求。可以在浏览器中打开 `/v3/api-docs`，将 JSON 内容保存为本地文件后使用。

**Q：报错 `sh: tsx: command not found` 怎么办？**

`tsx` 没有全局安装。推荐直接全局装一下：

```bash
npm install -g tsx
```

或者从本地 `node_modules` 调用：

```bash
npx --prefix packages/swagger-ts-gen tsx packages/swagger-ts-gen/bin/index.ts \
  --file <路径> \
  --swagger <地址>
```
