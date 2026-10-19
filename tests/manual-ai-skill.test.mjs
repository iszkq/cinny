import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

function setup(result) {
  const sent = [];
  const calls = [];
  const alerts = [];
  const skill = { name: '总结', command: 'summarize', model: 'test-model' };
  const settings = { skills: [skill] };
  const room = { roomId: '!manual:test' };
  const mx = { sendMessage: async (...args) => sent.push(args) };
  const api = {};
  const source = readFileSync(new URL('../src/app/hooks/useCommands.ts', import.meta.url), 'utf8');
  vm.runInNewContext(
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    {
      exports: api,
      window: { alert: (message) => alerts.push(message) },
      require: (name) => {
        if (name === 'react') return { useMemo: (callback) => callback() };
        if (name === 'jotai') return { useAtomValue: () => settings };
        if (name.endsWith('/useRoomNavigate'))
          return { useRoomNavigate: () => ({ navigateRoom() {} }) };
        if (name === '../utils/ai')
          return {
            runAISkill: async (...args) => {
              calls.push(args);
              return result;
            },
          };
        return {};
      },
    }
  );
  return { commands: api.useCommands(mx, room), sent, calls, alerts, skill, settings, room };
}

test('manual AI skill stays idle until invoked and sends its configured result', async () => {
  const fixture = setup('  测试总结  ');
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.sent.length, 0);
  await fixture.commands.summarize.exe('请总结');
  assert.deepEqual(fixture.calls[0], [fixture.room, fixture.settings, fixture.skill, '请总结']);
  assert.equal(fixture.sent[0][0], '!manual:test');
  assert.equal(fixture.sent[0][1].body, '测试总结\n\n以上消息由 AI 生成。');
  assert.equal(fixture.sent[0][1]['org.starfire.ai_generated'], true);
  assert.equal(fixture.alerts.length, 0);
});

test('empty AI skill response reports failure without sending a message', async () => {
  const fixture = setup(' ');
  await fixture.commands.summarize.exe('请总结');
  assert.equal(fixture.sent.length, 0);
  assert.equal(fixture.alerts.length, 1);
});
