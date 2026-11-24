import { describe, expect, test as it } from 'claude-code/testing';
import {
  compactionBackend,
  compactSession,
  decisionLog,
  decisionLogLines,
  resolveHookConfig,
  resolveKeys,
  summarize,
  toDecisionRequest,
  toSessionMessages,
} from '../hooks/fast-jev.ts';
import { applyDecisions, collectToolCalls, decideCall, type Message } from '../src/index.ts';

type SessionMessage = Message & { handle?: string };

function message(role: Message['role'], text: string, extra: Partial<SessionMessage> = {}): SessionMessage {
  return { role, text, toolUses: [], ...extra };
}

function call(id: string, tool: string, input: Record<string, unknown>, text: string): SessionMessage {
  return message('assistant', '', {
    toolUses: [{ tool_use_id: id, tool, input, text }],
    handle: `h-${id}`,
  });
}

function result(id: string, text: string, isError = false): SessionMessage {
  return message('user', '', { toolResults: [{ tool_use_id: id, text, isError }], handle: `r-${id}` });
}

const fileA = 'export const a = 1;\n'.repeat(50);

function transcript(): SessionMessage[] {
  return [
    message('user', 'Fix the failing test.', { handle: 'h-0' }),
    call('tool-1', 'Read', { file_path: 'src/a.ts' }, fileA),
    result('tool-1', fileA),
    call('tool-2', 'Bash', { command: 'npm test' }, 'FAIL'),
    result('tool-2', 'FAIL b.test.ts: expected 2 to be 3', true),
    message('assistant', 'Fixing now.', { handle: 'h-5' }),
    message('user', 'go ahead', { handle: 'h-6' }),
  ];
}

function jevFetch(answer: (name: string) => number, bodies: string[] = []) {
  return async (_url: string, init?: { body?: string }) => {
    bodies.push(init?.body ?? '');
    const { questions } = JSON.parse(init?.body ?? '{}') as { questions: Record<string, unknown> };
    const answers = Object.fromEntries(
      Object.keys(questions).map((key) => [key, { type: 'noul', noul: answer(key) }]),
    );
    return { status: 200, ok: true, text: JSON.stringify({ answers }) };
  };
}

describe('hook config', () => {
  it('reads userConfig values and falls back to defaults', () => {
    expect(resolveHookConfig({})).toEqual({ compactAtPercent: 60, minReductionRatio: 0.25, model: 'jev-latest', backend: 'auto' });
    expect(
      resolveHookConfig({
        apiKey: 'k',
        geminiApiKey: 'g-k',
        backend: 'gemini',
        keepThreshold: 0.3,
        maxStateTokens: 1000,
        model: 'jev-x',
        goal: 'g',
        compactAtPercent: 'no',
      }),
    ).toEqual({
      apiKey: 'k',
      geminiApiKey: 'g-k',
      backend: 'gemini',
      keepThreshold: 0.3,
      maxStateTokens: 1000,
      model: 'jev-x',
      goal: 'g',
      compactAtPercent: 60,
      minReductionRatio: 0.25,
    });
    expect(resolveHookConfig({ backend: 'openai' }).backend).toBe('auto');
  });
});

describe('backend choice', () => {
  it('prefers TypeSafe under auto and honours a forced backend only when its key is set', () => {
    expect(compactionBackend({ backend: 'auto', apiKey: 't', geminiApiKey: 'g' })).toBe('typesafe');
    expect(compactionBackend({ backend: 'auto', geminiApiKey: 'g' })).toBe('gemini');
    expect(compactionBackend({ backend: 'gemini', apiKey: 't', geminiApiKey: 'g' })).toBe('gemini');
    expect(() => compactionBackend({ backend: 'auto' })).toThrow(/neither TYPESAFE_API_KEY nor GEMINI_DECISIONS_API_KEY/);
    expect(() => compactionBackend({ backend: 'gemini', apiKey: 't' })).toThrow(/GEMINI_DECISIONS_API_KEY/);
    expect(() => compactionBackend({ backend: 'typesafe', geminiApiKey: 'g' })).toThrow(/TYPESAFE_API_KEY/);
  });
});

describe('key lookup', () => {
  const host = (env: Record<string, string>, settingsEnv: Record<string, string> = {}) => ({
    env: { get: async (name: string) => env[name] },
    settings: { read: async () => ({ env: settingsEnv }) },
  });
  const config = resolveHookConfig({});

  it('reads the plugin options first, then the environment, then settings.json for TypeSafe', async () => {
    const env = { TYPESAFE_API_KEY: 'env-t', GEMINI_DECISIONS_API_KEY: 'env-gd', GEMINI_API_KEY: 'env-g' };
    expect(await resolveKeys(host(env), { ...config, apiKey: 'opt-t', geminiApiKey: 'opt-g' })).toEqual({
      apiKey: 'opt-t',
      geminiApiKey: 'opt-g',
    });
    expect(await resolveKeys(host(env), config)).toEqual({ apiKey: 'env-t', geminiApiKey: 'env-gd' });
    expect(await resolveKeys(host({ GEMINI_API_KEY: 'env-g' }, { TYPESAFE_API_KEY: 'set-t' }), config)).toEqual({
      apiKey: 'set-t',
      geminiApiKey: 'env-g',
    });
    expect(await resolveKeys(host({}), config)).toEqual({ apiKey: undefined, geminiApiKey: undefined });
  });
});

describe('session message mapping', () => {
  it('returns the engine objects for untouched messages and handle-less copies for rebuilt ones', () => {
    const messages = transcript();
    const calls = collectToolCalls(messages, 0);
    const decisions = [
      decideCall(calls[0]!, { keepCall: 0.9, keepResult: 0.1 }, { keepThreshold: 0.5 }),
      decideCall(calls[1]!, { keepCall: 0.9, keepResult: 0.9 }, { keepThreshold: 0.5 }),
    ];
    messages[1]!.toolUses[0]!.text = 'x'.repeat(2000);
    messages[2]!.toolResults![0]!.text = 'x'.repeat(2000);
    const out = toSessionMessages(messages, applyDecisions(messages, decisions, calls, 300));
    expect(out).toHaveLength(messages.length);
    expect(out[0]).toBe(messages[0]);
    expect(out[1]?.handle).toBeUndefined();
    expect(out[1]?.toolUses[0]?.text).toMatch(
      new RegExp(`^${'x'.repeat(300)}\\n\\[fast-jev-compaction truncated 1700 chars`),
    );
    expect(out[2]?.handle).toBeUndefined();
    expect(out[2]?.toolResults?.[0]?.text).toMatch(
      new RegExp(`^${'x'.repeat(300)}\\n\\[fast-jev-compaction truncated 1700 chars`),
    );
    expect(out[2]?.toolResults?.[0]).toMatchObject({ tool_use_id: 'tool-1', isError: false });
    expect(out[3]).toBe(messages[3]);
    expect(out[4]).toBe(messages[4]);
  });

  it('preserves short dropped-result messages and their handles', () => {
    const messages = transcript();
    messages[1]!.toolUses[0]!.text = 'y'.repeat(100);
    messages[2]!.toolResults![0]!.text = 'y'.repeat(100);
    const calls = collectToolCalls(messages, 0);
    const decisions = [
      decideCall(calls[0]!, { keepCall: 0.9, keepResult: 0.1 }, { keepThreshold: 0.5 }),
      decideCall(calls[1]!, { keepCall: 0.9, keepResult: 0.9 }, { keepThreshold: 0.5 }),
    ];
    const out = toSessionMessages(messages, applyDecisions(messages, decisions, calls, 300));
    expect(out[1]).toBe(messages[1]);
    expect(out[2]).toBe(messages[2]);
  });
});

describe('compactSession', () => {
  it('runs the library over the engine fetch and reports the outcome', async () => {
    const bodies: string[] = [];
    const config = { ...resolveHookConfig({ preserveRecentMessages: 1 }), apiKey: 'k', model: 'jev-x' };
    const { result: output, messages } = await compactSession(
      transcript(),
      config,
      jevFetch((name) => (name === 'call_t2' || name === 'result_t2' ? 0.9 : 0.1), bodies),
    );
    expect(bodies).toHaveLength(1);
    expect(JSON.parse(bodies[0]!).model).toBe('jev-x');
    expect(output.decisions.map((d) => d.action)).toEqual(['drop_call', 'keep']);
    expect(messages.map((m) => m.handle)).toEqual(['h-0', 'h-tool-2', 'r-tool-2', 'h-5', 'h-6']);
    expect(summarize(output)).toMatch(/^\d+% reduction; 1 kept, 1 call_dropped; state ~\d+ tokens \(full\) in 1 request\(s\)$/);
    expect(decisionLog(output)).toBe('t1:Read:drop_call/call=0.10/result=0.10 t2:Bash:keep/call=0.90/result=0.90');
    expect(decisionLogLines(output)).toEqual([`decisions: ${decisionLog(output)}`]);
  });

  it('splits a long decision log into ui.log lines under the host limit', async () => {
    const config = { ...resolveHookConfig({ preserveRecentMessages: 1 }), apiKey: 'k' };
    const { result: output } = await compactSession(transcript(), config, jevFetch(() => 0.1));
    const lines = decisionLogLines(output, 60);
    expect(lines).toEqual([
      'decisions (1/2): t1:Read:drop_call/call=0.10/result=0.10',
      'decisions (2/2): t2:Bash:drop_call/call=0.10/result=0.10',
    ]);
    expect(lines.every((line) => line.length <= 60)).toBe(true);
    expect(decisionLogLines({ ...output, decisions: [] })).toEqual(['decisions: (none)']);
  });

  it('throws on a missing key and on failed requests so the hook falls back', async () => {
    const config = resolveHookConfig({ preserveRecentMessages: 1 });
    await expect(compactSession(transcript(), config, jevFetch(() => 0))).rejects.toThrow(/TYPESAFE_API_KEY/);
    await expect(
      compactSession(transcript(), { ...config, apiKey: 'k' }, async () => ({ status: 500, ok: false, text: 'x' })),
    ).rejects.toThrow(/500/);
  });

  it('asks Gemini Decision the same questions when it is the backend', async () => {
    const requests: { url: string; headers?: Record<string, string>; body: string }[] = [];
    const config = { ...resolveHookConfig({ preserveRecentMessages: 1, backend: 'gemini' }), apiKey: 't', geminiApiKey: 'g' };
    const { result: output } = await compactSession(transcript(), config, async (url, init) => {
      requests.push({ url, headers: init?.headers, body: init?.body ?? '' });
      const { questions } = JSON.parse(init?.body ?? '{}') as { questions: Record<string, unknown> };
      const answers = Object.fromEntries(Object.keys(questions).map((key) => [key, { noul: key.endsWith('t2') ? 0.9 : 0.1 }]));
      return { status: 200, ok: true, text: JSON.stringify({ answers }) };
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]!.url).toBe('https://generativelanguage.googleapis.com/v1beta/decisions');
    expect(requests[0]!.headers?.['x-goog-api-key']).toBe('g');
    const body = JSON.parse(requests[0]!.body);
    expect(body.model).toBe('gemini-decision-1');
    expect(JSON.parse(body.input).history.length).toBeGreaterThan(0);
    expect(body.questions.call_t1).toMatchObject({ type: 'noul' });
    expect(output.decisions.map((d) => d.action)).toEqual(['drop_call', 'keep']);
  });

  it('turns a Gemini error into a thrown message so the hook falls back', async () => {
    const config = { ...resolveHookConfig({ preserveRecentMessages: 1 }), geminiApiKey: 'g' };
    await expect(
      compactSession(transcript(), config, async () => ({ status: 403, ok: false, text: 'denied' })),
    ).rejects.toThrow(/Gemini rejected the API key/);
  });

  it('rejects a question Gemini cannot take in the compaction format', () => {
    expect(() => toDecisionRequest({}, { q: { type: 'score', instructions: 'x', criteria: ['a'] } })).toThrow(/score/);
    expect(toDecisionRequest('s', { q: { type: 'noul', instructions: 'x', criteria: { true: 'y', false: 'n' } } })).toEqual({
      input: { state: 's' },
      questions: { q: { type: 'binary', instructions: 'x', criteria: { yes: 'y', no: 'n' } } },
    });
  });
});
