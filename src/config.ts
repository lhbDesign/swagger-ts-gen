import type { ToolConfig } from './types.js';

import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * 读取 {cwd}/swagger-ts-gen.config.json 配置文件。
 * 若文件不存在或 JSON 解析失败，返回空配置对象（不抛出异常）。
 */
export function loadConfig(cwd: string): ToolConfig {
  const configPath = path.join(cwd, 'swagger-ts-gen.config.json');
  try {
    if (!fs.existsSync(configPath)) {
      return {};
    }
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw) as ToolConfig;
  } catch {
    return {};
  }
}
