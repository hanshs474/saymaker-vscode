'use strict';
const vscode = require('vscode');
const path = require('path');
const { run, uploadImage, SayMakerError, BASE } = require('./client');

const RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4'];
const SECRET = 'saymaker.apiKey';
const UTM = 'utm_source=vscode&utm_medium=extension';

async function apiKey(context) {
  return (await context.secrets.get(SECRET)) || process.env.SAYMAKER_API_KEY || '';
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'file';
}

function setting(name) {
  return vscode.workspace.getConfiguration('saymaker').get(name) || '';
}

async function saveInto(folderUri, name, url) {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  const ext = (new URL(url).pathname.match(/\.(webp|png|jpe?g|mp4|webm|mov)$/i) || [, 'bin'])[1];
  const target = vscode.Uri.joinPath(folderUri, `${name}.${ext}`);
  await vscode.workspace.fs.writeFile(target, bytes);
  return target;
}

function outputFolder() {
  const ws = vscode.workspace.workspaceFolders?.[0];
  if (!ws) return undefined;
  return vscode.Uri.joinPath(ws.uri, setting('outputFolder') || 'assets');
}

async function withProgress(task) {
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'SayMaker', cancellable: true },
    async (progress, token) => {
      const ctrl = new AbortController();
      token.onCancellationRequested(() => ctrl.abort());
      progress.report({ message: 'submitting…' });
      return task(ctrl.signal, (m) => progress.report({ message: m }));
    }
  );
}

function reportError(err) {
  const msg = err instanceof SayMakerError ? err.message : `SayMaker: ${err.message || err}`;
  const actions = /API key/i.test(msg) ? ['Set API Key', 'Get a Key'] : /credits|plan/i.test(msg) ? ['See Pricing'] : [];
  vscode.window.showErrorMessage(msg, ...actions).then((a) => {
    if (a === 'Set API Key') vscode.commands.executeCommand('saymaker.setApiKey');
    if (a === 'Get a Key') vscode.env.openExternal(vscode.Uri.parse(`${BASE}/settings/apikeys?${UTM}`));
    if (a === 'See Pricing') vscode.env.openExternal(vscode.Uri.parse(`${BASE}/pricing?${UTM}`));
  });
}

async function insertIfMarkdown(editor, file, alt, video) {
  if (!editor || !['markdown', 'mdx'].includes(editor.document.languageId)) return;
  const rel = path.relative(path.dirname(editor.document.uri.fsPath), file.fsPath).split(path.sep).join('/');
  const clean = alt.replace(/[\]\\$}]/g, '');
  await editor.insertSnippet(new vscode.SnippetString(video ? `<video src="${rel}" controls></video>` : `![${clean}](${rel})`));
}

async function generate(context, media) {
  const video = media === 'video';
  const prompt = await vscode.window.showInputBox({
    title: video ? 'SayMaker: Generate Video' : 'SayMaker: Generate Image',
    prompt: video
      ? 'Describe the shot: what happens, where, how the camera moves'
      : 'Describe the picture: name the light, the material and the composition',
    placeHolder: video
      ? 'a paper boat drifting down a rain gutter, low angle, slow push-in'
      : 'flat illustration of a rocket leaving a laptop screen, purple and orange',
  });
  if (!prompt) return;
  const ratio = await vscode.window.showQuickPick(video ? ['16:9', '9:16', '1:1'] : RATIOS, { title: 'Aspect ratio' });
  if (!ratio) return;
  const folder = outputFolder();
  if (!folder) return vscode.window.showErrorMessage('Open a folder first: SayMaker saves the file into your workspace.');
  const editor = vscode.window.activeTextEditor;
  try {
    const key = await apiKey(context);
    const file = await withProgress(async (signal, say) => {
      const url = await run(prompt, {
        media, aspectRatio: ratio, apiKey: key, model: setting(video ? 'videoModel' : 'imageModel'), signal,
        onQueued: () => say(video ? 'rendering, this takes a few minutes…' : 'generating…'),
      });
      say('saving…');
      return saveInto(folder, `saymaker-${slug(prompt)}-${Date.now().toString(36)}`, url);
    });
    await insertIfMarkdown(editor, file, prompt, video);
    const open = await vscode.window.showInformationMessage(`Saved ${vscode.workspace.asRelativePath(file)}`, 'Open');
    if (open) vscode.commands.executeCommand('vscode.open', file);
  } catch (err) {
    reportError(err);
  }
}

async function fromImage(context, uri, media) {
  const video = media === 'video';
  const source = uri || (await vscode.window.showOpenDialog({ canSelectMany: false, filters: { Images: ['png', 'jpg', 'jpeg', 'webp'] } }))?.[0];
  if (!source) return;
  const instruction = await vscode.window.showInputBox({
    title: `SayMaker: ${video ? 'Animate' : 'Edit'} ${path.basename(source.fsPath)}`,
    prompt: video ? 'Say what happens in the clip and how the camera moves' : 'Say what to change, and what must stay the same',
    placeHolder: video
      ? 'the camera slowly orbits the product while light sweeps across it'
      : 'put the product on white marble; keep the label unchanged',
  });
  if (!instruction) return;
  try {
    const key = await apiKey(context);
    const file = await withProgress(async (signal, say) => {
      say('uploading…');
      const bytes = await vscode.workspace.fs.readFile(source);
      const imageUrl = await uploadImage(bytes, path.basename(source.fsPath));
      const url = await run(instruction, {
        media, imageUrl, apiKey: key, model: setting(video ? 'videoModel' : 'imageModel'), signal,
        onQueued: () => say(video ? 'rendering, this takes a few minutes…' : 'editing…'),
      });
      say('saving…');
      const base = path.basename(source.fsPath).replace(/\.[^.]+$/, '');
      return saveInto(vscode.Uri.file(path.dirname(source.fsPath)), `${base}-saymaker-${Date.now().toString(36)}`, url);
    });
    vscode.commands.executeCommand('vscode.open', file);
  } catch (err) {
    reportError(err);
  }
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('saymaker.generateImage', () => generate(context, 'image')),
    vscode.commands.registerCommand('saymaker.generateVideo', () => generate(context, 'video')),
    vscode.commands.registerCommand('saymaker.editImage', (uri) => fromImage(context, uri, 'image')),
    vscode.commands.registerCommand('saymaker.animateImage', (uri) => fromImage(context, uri, 'video')),
    vscode.commands.registerCommand('saymaker.setApiKey', async () => {
      const value = await vscode.window.showInputBox({
        title: 'SayMaker API key',
        prompt: 'From saymaker.ai/settings/apikeys. Stored in VS Code secret storage. Leave empty to remove.',
        password: true,
        ignoreFocusOut: true,
      });
      if (value === undefined) return;
      if (value.trim()) await context.secrets.store(SECRET, value.trim());
      else await context.secrets.delete(SECRET);
      vscode.window.showInformationMessage(value.trim() ? 'SayMaker API key saved.' : 'SayMaker API key removed.');
    })
  );
}

module.exports = { activate, deactivate() {} };
