import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function getWebSocketUrl(processHandle) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Chrome did not start: ${output}`)), 15_000);
    processHandle.stderr.on('data', (chunk) => {
      output += chunk.toString();
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    processHandle.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chrome exited before startup with code ${code}: ${output}`));
    });
  });
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener('open', resolve, { once: true });
      this.socket.addEventListener('error', reject, { once: true });
    });
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }
      for (const listener of this.listeners.get(message.method) ?? []) listener(message);
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  once(method, timeoutMs = 10_000) {
    return new Promise((resolve, reject) => {
      const listeners = this.listeners.get(method) ?? [];
      const handler = (message) => {
        clearTimeout(timeout);
        this.listeners.set(method, listeners.filter((item) => item !== handler));
        resolve(message.params);
      };
      const timeout = setTimeout(() => {
        this.listeners.set(method, listeners.filter((item) => item !== handler));
        reject(new Error(`Timed out waiting for ${method}`));
      }, timeoutMs);
      this.listeners.set(method, [...listeners, handler]);
    });
  }

  on(method, handler) {
    const listeners = this.listeners.get(method) ?? [];
    this.listeners.set(method, [...listeners, handler]);
    return () => {
      this.listeners.set(method, (this.listeners.get(method) ?? []).filter((item) => item !== handler));
    };
  }

  close() {
    this.socket.close();
  }
}

export async function launchBrowser(chromeBinary = 'google-chrome') {
  const profileDirectory = await mkdtemp(path.join(os.tmpdir(), 'svt-chrome-'));
  const chrome = spawn(
    chromeBinary,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--remote-debugging-port=0',
      `--user-data-dir=${profileDirectory}`,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );

  const client = new CdpClient(await getWebSocketUrl(chrome));
  await client.connect();
  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await client.send('Target.attachToTarget', { targetId, flatten: true });
  await client.send('Page.enable', {}, sessionId);
  await client.send('Runtime.enable', {}, sessionId);
  await client.send('Network.enable', {}, sessionId);

  return {
    client,
    sessionId,
    async close() {
      client.close();
      const exited = new Promise((resolve) => chrome.once('exit', resolve));
      chrome.kill('SIGTERM');
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2_000))]);
      await rm(profileDirectory, { recursive: true, force: true });
    },
  };
}

export async function evaluate(browser, expression) {
  const result = await browser.client.send(
    'Runtime.evaluate',
    { expression, awaitPromise: true, returnByValue: true },
    browser.sessionId,
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? 'Browser evaluation failed');
  }
  return result.result.value;
}

export async function navigate(browser, url) {
  const loaded = browser.client.once('Page.loadEventFired');
  await browser.client.send('Page.navigate', { url }, browser.sessionId);
  await loaded;
}

export async function waitFor(browser, expression, description, timeoutMs = 12_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(browser, expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${description}`);
}

export async function setFormValues(browser, values) {
  await evaluate(
    browser,
    `(() => {
      const values = ${JSON.stringify(values)};
      for (const [id, value] of Object.entries(values)) {
        const element = document.getElementById(id);
        if (!element) throw new Error('Missing form control: ' + id);
        const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return true;
    })()`,
  );
}

export async function submitForm(browser) {
  await evaluate(browser, "document.querySelector('form').requestSubmit(); true");
}

export async function attachFile(browser, selector, filePath) {
  const { root } = await browser.client.send('DOM.getDocument', {}, browser.sessionId);
  const { nodeId } = await browser.client.send('DOM.querySelector', { nodeId: root.nodeId, selector }, browser.sessionId);
  if (!nodeId) throw new Error(`Missing file input: ${selector}`);
  await browser.client.send('DOM.setFileInputFiles', { files: [filePath], nodeId }, browser.sessionId);
}

export function fillAndSubmitExpression(values) {
  return `(() => {
    const values = ${JSON.stringify(values)};
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    for (const [id, value] of Object.entries(values)) {
      const input = document.getElementById(id);
      if (!input) throw new Error('Missing input: ' + id);
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    document.querySelector('form').requestSubmit();
    return true;
  })()`;
}
