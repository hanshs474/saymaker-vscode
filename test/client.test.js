'use strict';
const assert = require('assert');
const { run, parseSubmit, SayMakerError } = require('../client');

function fake(final, calls) {
  return async (url, init) => {
    calls.push(JSON.parse(init.body));
    const data = url.endsWith('/api/ai/generate') ? { id: 'row1' } : final;
    return { json: async () => ({ code: 0, data }) };
  };
}

(async () => {
  let calls = [];
  assert.strictEqual(await run('x', { apiKey: 'sk', pollEveryMs: 0, fetch: fake({ images: ['m'], cleanImages: ['c'] }, calls) }), 'c');
  assert.strictEqual(calls[0].model, 'saymaker-image-v1');
  assert.deepStrictEqual(calls[1], { taskId: 'row1' });
  calls = [];
  assert.strictEqual(await run('x', { media: 'video', duration: 6, apiKey: 'sk', pollEveryMs: 0, fetch: fake({ videos: ['v'] }, calls) }), 'v');
  assert.deepStrictEqual([calls[0].provider, calls[0].scene, calls[0].options.duration], ['vgenv', 'text-to-video', 6]);
  await assert.rejects(run('x', {}), SayMakerError);
  assert.throws(() => parseSubmit({ code: 0, data: { wall: true } }), /API key/);
  assert.throws(() => parseSubmit({ code: -1, message: 'Your current run is rendering.', data: { busy: {} } }), /still rendering/);
  console.log('all tests passed');
})();
