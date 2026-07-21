import { loadCodexAiConfig } from './codexConfig.js';

/**
 * OpenAI-compatible Chat Completions
 * 兼容 passion8 / 其他 compat 网关
 */
export async function chatCompletion({ messages, temperature = 0.6, responseFormat, timeoutMs } = {}) {
  const cfg = loadCodexAiConfig();
  if (!cfg.configured) {
    const err = new Error('AI 未配置：请检查 ~/.codex/config.toml 与 auth.json');
    err.code = 'AI_NOT_CONFIGURED';
    err.config = { model: cfg.model, baseUrl: cfg.baseUrl, sources: cfg.sources };
    throw err;
  }

  const url = `${cfg.baseUrl}/chat/completions`;
  const body = {
    model: cfg.model,
    messages,
    temperature,
  };
  if (responseFormat) body.response_format = responseFormat;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(timeoutMs || process.env.AI_TIMEOUT_MS || 8000));
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (cause) {
    const err = new Error(cause?.name === 'AbortError' ? 'AI 请求超时，已切换本地题库' : `AI 请求失败：${cause.message}`);
    err.code = cause?.name === 'AbortError' ? 'AI_TIMEOUT' : 'AI_NETWORK_ERROR';
    throw err;
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(data?.error?.message || `AI 请求失败 HTTP ${res.status}`);
    err.code = 'AI_HTTP_ERROR';
    err.status = res.status;
    err.data = data;
    throw err;
  }

  const content =
    data?.choices?.[0]?.message?.content ??
    data?.output_text ??
    data?.choices?.[0]?.text ??
    '';

  return { content, raw: data, model: cfg.model, baseUrl: cfg.baseUrl };
}

export async function chatJson(system, user, { temperature = 0.5 } = {}) {
  const { content, ...rest } = await chatCompletion({
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature,
    responseFormat: { type: 'json_object' },
  });

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
    else throw new Error('AI 返回非 JSON');
  }
  return { data: parsed, content, ...rest };
}

export function getAiStatus() {
  const cfg = loadCodexAiConfig();
  return {
    configured: cfg.configured,
    model: cfg.model,
    baseUrl: cfg.baseUrl,
    providerName: cfg.providerName,
    sources: cfg.sources,
    hasKey: Boolean(cfg.apiKey),
    keyHint: cfg.apiKey ? `${cfg.apiKey.slice(0, 6)}…${cfg.apiKey.slice(-4)}` : null,
  };
}
