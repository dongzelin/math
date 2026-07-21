/**
 * 从本机 Codex 配置读取 AI 接入信息
 * 优先级：环境变量 > config.toml experimental_bearer_token / auth.json > 默认
 */
import fs from 'fs';
import path from 'path';
import os from 'os';

function codexHome() {
  return process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
}

function parseSimpleToml(text) {
  /** 极简 TOML：只解析顶层 key= 与 [section] 下 key= 字符串/标识符 */
  const result = { _root: {} };
  let section = '_root';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const sec = line.match(/^\[([^\]]+)\]$/);
    if (sec) {
      section = sec[1];
      if (!result[section]) result[section] = {};
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    let val = kv[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!result[section]) result[section] = {};
    result[section][kv[1]] = val;
  }
  return result;
}

export function loadCodexAiConfig() {
  const home = codexHome();
  const configPath = path.join(home, 'config.toml');
  const authPath = path.join(home, 'auth.json');

  let model = process.env.OPENAI_MODEL || 'gpt-5.5';
  let baseUrl = process.env.OPENAI_BASE_URL || 'https://passion8.cc/v1';
  let apiKey = process.env.OPENAI_API_KEY || '';
  let providerName = 'OpenAICompat';
  const sources = [];

  if (fs.existsSync(configPath)) {
    try {
      const toml = parseSimpleToml(fs.readFileSync(configPath, 'utf8'));
      const root = toml._root || {};
      if (!process.env.OPENAI_MODEL && root.model) model = root.model;
      if (root.model_provider) providerName = root.model_provider;

      const sectionKey = `model_providers.${providerName}`;
      const provider = toml[sectionKey] || {};
      if (!process.env.OPENAI_BASE_URL && provider.base_url) baseUrl = provider.base_url;
      if (!apiKey && provider.experimental_bearer_token) {
        apiKey = provider.experimental_bearer_token;
        sources.push('config.toml:experimental_bearer_token');
      }
      sources.push(`config.toml:${configPath}`);
    } catch (e) {
      sources.push(`config.toml:parse_error:${e.message}`);
    }
  } else {
    sources.push('config.toml:missing');
  }

  if (!apiKey && fs.existsSync(authPath)) {
    try {
      const auth = JSON.parse(fs.readFileSync(authPath, 'utf8'));
      if (auth.OPENAI_API_KEY) {
        apiKey = auth.OPENAI_API_KEY;
        sources.push('auth.json:OPENAI_API_KEY');
      }
    } catch (e) {
      sources.push(`auth.json:parse_error:${e.message}`);
    }
  }

  if (process.env.OPENAI_API_KEY) sources.push('env:OPENAI_API_KEY');
  if (process.env.OPENAI_BASE_URL) sources.push('env:OPENAI_BASE_URL');
  if (process.env.OPENAI_MODEL) sources.push('env:OPENAI_MODEL');

  baseUrl = (baseUrl || '').replace(/\/$/, '');

  return {
    home,
    model,
    baseUrl,
    apiKey,
    providerName,
    configured: Boolean(apiKey && baseUrl),
    sources,
  };
}
