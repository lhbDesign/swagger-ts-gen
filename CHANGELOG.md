#变更日志

本项目的所有重要变更都会记录在此文件中。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
并遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)（语义化版本）。

## [0.2.0] -2026-04-01

### 新增

- CLI 新增 `--functions` 参数，支持逗号分隔和重复传参，按函数名定向生成类型。
- CLI 新增 `--json` 成功结构化输出模式，便于脚本与 CI 集成。
- CLI 新增 `--silent` 静默模式，成功时不输出日志，失败仍输出错误信息。
- `--swagger` 新增本地 JSON 文件输入能力，支持离线/内网场景（如 `./openapi.json`）。
- 新增 `src/__tests__/cli.test.ts`，覆盖 `--functions`、幂等重复执行、`--json`、`--silent`、本地 JSON 输入场景。

### 文档

- README（中/英）补充本地 Swagger/OpenAPI JSON 格式要求与最小示例。
- README（中/英）“所有参数/All Flags”表新增“是否必填/Required”与“默认处理行为”。

## [0.1.4] -2026-03-31

###变更

- CLI 在失败场景下输出结构化 JSON 错误信息。
- CLI退出码规则明确且稳定：
- 用法/配置校验失败返回 `1`。-关键运行时失败返回 `2`（`CONFIG_NOT_FOUND`、`PARSE_ERROR`、`SWAGGER_FETCH_ERROR`、`WRITE_ERROR`）。
- 构建脚本在编译前会先清理 `dist`：`rm -rf dist && tsc`。

### 修复

- 发布包不再包含 `dist/src/__tests__` 下的测试编译产物。
- 包体积 230kb => 106kb

### 重构

- 简化 `src/writer.ts` 中冗余的输出赋值逻辑，行为保持不变。

## [0.1.3] -2026-03-26

### 新增

- 首次公开发布，支持 CLI 与 MCP Server 两种模式。
- 支持从 Swagger/OpenAPI生成 TypeScript 类型的完整流程。
- 支持通过 `swagger-ts-gen.config.json`进行配置化使用。
