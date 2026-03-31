#变更日志

本项目的所有重要变更都会记录在此文件中。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
并遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)（语义化版本）。

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
