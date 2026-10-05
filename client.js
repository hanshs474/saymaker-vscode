// SayMaker HTTP client. No VS Code imports, so it can be tested with plain node.
'use strict';

const BASE = 'https://saymaker.ai';
const KEYS_URL = `${BASE}/settings/apikeys`;
const MODEL_IMAGE = 'saymaker-image-v1';
const MODEL_EDIT = 'nano-banana-2-lite';
const MODEL_VIDEO = 'minimax-h3-fast';
// Model id -> the routing field the API expects next to it. Unlisted ids go as "kie".
const MODELS = {
  'saymaker-image-v1': 'kie', 'nano-banana-2-lite': 'kie', 'nano-banana-2': 'poyo', 'nano-banana-pro': 'poyo',
  'gpt-image-2': 'poyo', 'gpt-image-2-5-flare': 'kie', 'seedream-5-lite': 'poyo', 'seedream-5-pro': 'kie',
  'qwen-image-3-pro': 'kie', 'grok-imagine-image-2-0': 'poyo', 'minimax-h3-fast': 'vgenv', 'minimax-h3': 'poyo',
  'seedance-2': 'kie', 'seedance-2-fast': 'kie', 'seedance-2-5': 'kie', 'veo-3-1': 'kie', 'kling-3-0': 'kie',
  'kling-3-0-turbo': 'kie', 'wan-3-0': 'kie', 'ltx-2-5-fast': 'replicate',
};
const NEEDS_KEY = `SayMaker needs an API key. Create one at ${KEYS_URL}, then run "SayMaker: Set API Key".`;

class SayMakerError extends Error {}

function explain(env) {
  const msg = env.message || 'request refused';
  const low = msg.toLowerCase();
  if (env.data?.busy || low.includes('is rendering') || low.includes('at once')) {
    return new SayMakerError(`SayMaker: another run on this account is still rendering. ${msg}`);
  }
  return new SayMakerError(`SayMaker: ${msg}`);
}

function parseSubmit(env) {
  // Refusals answer HTTP 200 with code -1; the status code alone reads as success.
  if (env.code !== 0) throw explain(env);
  const d = env.data || {};
  // A request without a valid key is a 200 with code 0 and `wall` set.
  if (d.wall) throw new SayMakerError(NEEDS_KEY);
  if (!d.id) throw new SayMakerError('SayMaker returned no task id');
  return String(d.id);
}

async function uploadImage(bytes, filename, { fetch: f = fetch, base = BASE } = {}) {
  // The upload endpoint checks the MIME type, so an untyped Blob is refused as "not an image".
  const ext = (filename.match(/\.([a-z0-9]+)$/i) || [, 'png'])[1].toLowerCase();
  const type = { jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' }[ext] || 'image/png';
  const form = new FormData();
  form.append('files', new Blob([bytes], { type }), filename);
  const env = await (await f(`${base}/api/storage/upload-image`, { method: 'POST', body: form })).json();
  const url = env?.data?.urls?.[0];
  if (env.code !== 0 || !url) throw new SayMakerError(`upload failed: ${env.message || 'no url'}`);
  return url;
}

/** Submit one run and poll it; resolve to the finished file URL. */
async function run(prompt, opts = {}) {
  const { media = 'image', imageUrl, aspectRatio, duration, apiKey, model, fetch: f = fetch, base = BASE,
          signal, onQueued } = opts;
  if (!String(prompt || '').trim()) throw new SayMakerError('prompt is required');
  const key = (apiKey || '').trim();
  if (!key) throw new SayMakerError(NEEDS_KEY);
  const auth = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
  const video = media === 'video';
  const id = model || (video ? MODEL_VIDEO : imageUrl ? MODEL_EDIT : MODEL_IMAGE);
  const input = imageUrl ? { image_input: [imageUrl] } : {};
  const options = video
    ? { aspect_ratio: aspectRatio || '16:9', sound: true, ...input, ...(duration ? { duration } : {}) }
    : { size: aspectRatio || (imageUrl ? 'auto' : '1:1'), resolution: '1K', n: 1, ...input };
  const scene = video ? (imageUrl ? 'image-to-video' : 'text-to-video') : imageUrl ? 'image-to-image' : 'text-to-image';
  const submitted = await (await f(`${base}/api/ai/generate`, {
    method: 'POST', headers: auth, signal,
    body: JSON.stringify({ provider: MODELS[id] || 'kie', mediaType: media, model: id, scene, prompt, options }),
  })).json();
  const task = parseSubmit(submitted);
  onQueued?.(task);

  // Free-account runs wait in a queue and only start on the poll that crosses
  // the end of the wait, so polling is what starts the work.
  const deadline = Date.now() + (opts.timeoutMs ?? (video ? 5_400_000 : 4_500_000));
  const every = opts.pollEveryMs ?? (video ? 10_000 : 5_000);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, every));
    if (signal?.aborted) throw new SayMakerError('cancelled');
    let env;
    try {
      env = await (await f(`${base}/api/ai/query`, { method: 'POST', headers: auth, body: JSON.stringify({ taskId: task }), signal })).json();
    } catch {
      continue; // a dropped poll is not a failed run
    }
    if (env.code !== 0) continue;
    const d = env.data || {};
    const url = d.cleanImages?.[0] || d.images?.[0] || d.videos?.[0];
    if (url) return url;
    if (d.status === 'failed' || d.status === 'error') {
      throw new SayMakerError('SayMaker refused this prompt; reword it rather than retrying the same text');
    }
  }
  throw new SayMakerError('SayMaker did not finish in time; the run may still land in your SayMaker history');
}

module.exports = { run, uploadImage, parseSubmit, SayMakerError, BASE, KEYS_URL, MODELS };
