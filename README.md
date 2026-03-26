# swagger-ts-gen

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

### 方式一：发布到 npm 后全局安装（推荐）

```bash
npm install -g swagger-ts-gen
```

安装后可在任意项目中直接使用：

```bash
swagger-ts-gen --file src/api/user.ts --swagger https://your-api/doc.html
```

### 方式二：在 monorepo 中本地使用（当前项目）

无需安装，直接通过 `tsx` 运行源码：

```bash
npx tsx packages/swagger-ts-gen/bin/index.ts --file <文件路径> --swagger <文档地址>
```

### 方式三：npx 临时使用

```bash
npx swagger-ts-gen --file src/api/user.ts --swagger https://your-api/doc.html
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
npx tsx packages/swagger-ts-gen/bin/index.ts
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
  return requestClient.get('/model/publish/cancel', { params });
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
  return requestClient.get('/model/publish/cancel', { params });
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

| 配置项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `swaggerUrl` | `string` | — | Swagger 文档地址，支持 `doc.html`、`/v3/api-docs`、`/v2/api-docs` |
| `defaultFiles` | `string[]` | — | 默认处理的接口文件路径列表 |
| `endpointPrefix` | `string` | `""` | 接口路径前缀。代码里路径是 `/algo/user/list`，但 Swagger 里是 `/user/list`，则设为 `/algo` |
| `clientName` | `string` | `"requestClient"` | HTTP 客户端对象名称，如 `axios`、`http`、`request` |
| `outputStyle` | `"interface"` \| `"type"` | `"interface"` | 生成类型的风格 |

---

## 命令行使用

### 基本用法

```bash
# 使用配置文件（推荐）
npx tsx packages/swagger-ts-gen/bin/index.ts

# 指定文件和文档地址
npx tsx packages/swagger-ts-gen/bin/index.ts \
  --file src/api/user.ts \
  --swagger https://your-api/doc.html
```

### 所有参数

| 参数 | 说明 | 示例 |
| --- | --- | --- |
| `--file` | 目标接口文件路径 | `--file src/api/user.ts` |
| `--swagger` | Swagger 文档地址 | `--swagger https://api.example.com/doc.html` |
| `--dry-run` | 预览模式，不修改文件 | `--dry-run` |
| `--mcp` | 以 MCP Server 模式启动 | `--mcp` |
| `--endpoint-prefix` | 接口路径前缀（覆盖配置文件） | `--endpoint-prefix /algo` |
| `--client-name` | HTTP 客户端名称（覆盖配置文件） | `--client-name axios` |

### 预览模式（推荐先用这个）

不修改任何文件，只输出将要生成的内容：

```bash
npx tsx packages/swagger-ts-gen/bin/index.ts \
  --file src/api/user.ts \
  --swagger https://your-api/doc.html \
  --dry-run
```

### 执行结果示例

```
✅ swagger-ts-gen complete
   Processed endpoints : 8
   Generated param types: 6
   Generated resp types : 4
   Skipped (existing)   : 2
```

---

## MCP Server 使用

MCP（Model Context Protocol）模式允许 Kiro、Cursor 等 AI IDE 直接调用本工具生成类型，无需手动运行命令。

### 配置 MCP Server — Kiro

在项目的 `.kiro/settings/mcp.json` 中添加：

```json
{
  "mcpServers": {
    "swagger-ts-gen": {
      "command": "npx",
      "args": ["tsx", "packages/swagger-ts-gen/bin/index.ts", "--mcp"],
      "disabled": false,
      "autoApprove": ["generate_types"]
    }
  }
}
```

如果已发布到 npm：

```json
{
  "mcpServers": {
    "swagger-ts-gen": {
      "command": "npx",
      "args": ["swagger-ts-gen", "--mcp"],
      "disabled": false,
      "autoApprove": ["generate_types"]
    }
  }
}
```

### 配置 MCP Server — Cursor

Cursor 的 MCP 配置文件位于项目根目录的 `.cursor/mcp.json`（项目级）或 `~/.cursor/mcp.json`（全局）。

在 `.cursor/mcp.json` 中添加：

```json
{
  "mcpServers": {
    "swagger-ts-gen": {
      "command": "npx",
      "args": ["tsx", "packages/swagger-ts-gen/bin/index.ts", "--mcp"]
    }
  }
}
```

如果已发布到 npm：

```json
{
  "mcpServers": {
    "swagger-ts-gen": {
      "command": "npx",
      "args": ["swagger-ts-gen", "--mcp"]
    }
  }
}
```

配置完成后，在 Cursor 中按 `Cmd+Shift+P` 搜索 `MCP`，点击 **Reload MCP Servers** 使配置生效。

### 在 AI IDE 中使用

**Kiro**：直接在聊天框中说：

> 帮我给 `cancelPublishApi` 生成 TypeScript 类型

Kiro 会自动调用 `generate_types` 工具完成处理。

**Cursor**：在 Composer（`Cmd+I`）或 Chat 中说：

> 使用 swagger-ts-gen 工具，帮我给 `cancelPublishApi` 生成 TypeScript 类型，文件路径是 src/api/user.ts

Cursor 会识别到 MCP 工具并调用。也可以更具体地指定参数：

> 调用 generate_types 工具，filePath 为 src/api/user.ts，swaggerUrl 为 https://your-api/doc.html，只处理 cancelPublishApi 这个函数

### MCP 工具参数

工具名：`generate_types`

| 参数 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `filePath` | `string` | ✅ | 目标接口文件路径 |
| `swaggerUrl` | `string` | — | Swagger 文档地址（优先于配置文件） |
| `functionNames` | `string[]` | — | 只处理指定函数，不传则处理所有 `any` 类型函数 |
| `dryRun` | `boolean` | — | 预览模式，不修改文件 |

---

## 针对不同 API 工具的使用方式

### Swagger / SpringDoc（默认支持）

直接传 `doc.html` 地址，工具自动转换为 `/v3/api-docs` 或 `/v2/api-docs`：

```bash
npx tsx packages/swagger-ts-gen/bin/index.ts \
  --file src/api/user.ts \
  --swagger https://your-api/doc.html
```

也可以直接传 api-docs 地址：

```bash
--swagger https://your-api/v3/api-docs
--swagger https://your-api/v2/api-docs
```

### Knife4j

Knife4j 是 Swagger 的增强版，完全兼容，直接使用：

```bash
--swagger https://your-api/doc.html
# 或
--swagger https://your-api/v3/api-docs
```

### YApi

**方式一：通过 YApi 导出接口直接使用（推荐）**

YApi 提供了 OpenAPI 格式的导出接口，格式如下：

```
https://your-yapi.com/api/plugin/export?type=swagger&pid=<项目ID>&token=<项目token>
```

直接传给 `--swagger`：

```bash
npx tsx packages/swagger-ts-gen/bin/index.ts \
  --file src/api/user.ts \
  --swagger "https://your-yapi.com/api/plugin/export?type=swagger&pid=123&token=abc123"
```

在 YApi 项目设置中可以找到项目 token。

**方式二：导出 JSON 文件后使用本地文件**

在 YApi 界面：「项目设置」→「导出数据」→ 选择 `swagger` 格式导出 JSON 文件。

然后用 `--swagger-file` 参数（需要本地文件支持，见下方说明）。

### Apifox

Apifox 支持导出 OpenAPI 3.0 格式：

1. 在 Apifox 中：「项目设置」→「导出数据」→ 选择 `OpenAPI 3.0`
2. 可以导出为在线 URL 或本地文件

在线 URL 方式：

```bash
--swagger https://apifox.com/api/projects/<id>/export-openapi?token=<token>
```

### Postman

1. 在 Postman 中导出 Collection
2. 选择 `OpenAPI 3.0` 格式
3. 保存为本地 JSON 文件，通过本地文件方式使用

### 其他支持 OpenAPI 格式的工具

只要能导出标准 OpenAPI 2.0（Swagger）或 OpenAPI 3.0 格式的 JSON，都可以直接使用。

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

### 跳过处理的情况

- 函数已有明确的 TypeScript 类型（非 `any`）→ 跳过
- 同名类型已存在于文件中 → 跳过插入，不重复生成
- Swagger 文档中该接口没有任何参数 → 跳过，不生成空 interface

---

## 常见问题

**Q：接口路径在代码里有前缀，但 Swagger 里没有，怎么处理？**

A：使用 `endpointPrefix` 配置。例如代码里是 `/algo/user/list`，Swagger 里是 `/user/list`：

```json
{ "endpointPrefix": "/algo" }
```

或命令行：`--endpoint-prefix /algo`

---

**Q：项目用的是 axios 而不是 requestClient，怎么办？**

A：使用 `clientName` 配置：

```json
{ "clientName": "axios" }
```

或命令行：`--client-name axios`

---

**Q：想先预览生成结果，不修改文件怎么做？**

A：加上 `--dry-run` 参数，只输出结果不写文件。

---

**Q：只想处理某几个函数，不想处理整个文件？**

A：MCP 模式下传 `functionNames` 参数。CLI 模式暂不支持单函数过滤，可以先用 `--dry-run` 预览。

---

**Q：Swagger 文档需要登录认证怎么办？**

A：目前不支持带认证头的请求。可以先在浏览器中打开 `/v3/api-docs` 地址，将 JSON 内容保存为本地文件后使用。

---

**Q：生成的类型不准确怎么办？**

A：可以先用 `--dry-run` 预览，确认无误后再执行。如果 Swagger 文档本身描述不准确，生成结果也会有偏差，建议手动调整。
