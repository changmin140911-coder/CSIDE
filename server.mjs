import { createServer } from 'node:http';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { aggregateTab, parseCsv } from './lib/aggregate.mjs';
import { configured, readSheets } from './lib/sheets.mjs';

const port = Number(process.env.PORT || 4173);
const folder = new URL('./.data/', import.meta.url);
const snapshotFile = new URL('dashboard.json', folder);
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/dashboard.js', ['dashboard.js', 'text/javascript; charset=utf-8']],
  ['/model.js', ['model.js', 'text/javascript; charset=utf-8']],
]);

let snapshot = await readFile(snapshotFile, 'utf8').then(JSON.parse).catch(error => {
  if (error.code === 'ENOENT') return { updatedAt: null, sources: [] };
  throw error;
});
let connection = configured ? 'pending' : 'local';
let checkedAt = 0;
let refresh;
let writes = Promise.resolve();

function updateSnapshot(update) {
  const write = writes.then(async () => {
    const next = { updatedAt: new Date().toISOString(), sources: update(snapshot.sources) };
    await mkdir(folder, { recursive: true });
    const tempFile = new URL(`dashboard-${randomUUID()}.tmp`, folder);
    try {
      await writeFile(tempFile, JSON.stringify(next), { mode: 0o600 });
      await rename(tempFile, snapshotFile);
      snapshot = next;
    } finally {
      await rm(tempFile, { force: true });
    }
  });
  writes = write.catch(() => {});
  return write;
}

function syncSheets() {
  if (!refresh) {
    refresh = readSheets()
      .then(sources => updateSnapshot(() => sources))
      .then(() => { connection = 'live'; })
      .catch(() => { connection = 'stale'; })
      .finally(() => {
        checkedAt = Date.now();
        refresh = undefined;
      });
  }
  return refresh;
}

function json(response, status, value) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(value));
}

function view() {
  return { ...snapshot, connection, canRefresh: configured };
}

async function importCsv(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size <= 10_000_000) chunks.push(chunk);
  }
  if (size > 10_000_000) throw new Error('한 번에 10MB까지 가져올 수 있습니다.');
  let files;
  try {
    ({ files } = JSON.parse(Buffer.concat(chunks).toString('utf8')));
  } catch {
    throw new Error('CSV 요청을 읽지 못했습니다.');
  }
  if (!Array.isArray(files) || !files.length || files.some(file =>
    typeof file?.name !== 'string' || typeof file.text !== 'string' || !/\.csv$/iu.test(file.name))) {
    throw new Error('가져올 CSV 파일을 선택해 주세요.');
  }

  return files.map(file => {
    const name = file.name.replace(/\.csv$/iu, '').trim();
    const title = /타찾\s*\d+\s*월.+$/u.exec(name)?.[0] ?? name;
    return aggregateTab(title, parseCsv(file.text));
  });
}

const server = createServer(async (request, response) => {
  const host = request.headers.host;
  const allowedHost = host === `127.0.0.1:${port}` || host === `localhost:${port}`;
  const origin = request.headers.origin;
  if (!allowedHost || (origin && origin !== `http://${host}`)) {
    json(response, 403, { error: '이 대시보드는 현재 컴퓨터에서 열 수 있습니다.' });
    return;
  }
  const path = request.url.split('?')[0];
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'");

  try {
    if (path === '/api/dashboard' && request.method === 'GET') {
      if (configured && Date.now() - checkedAt >= 60_000) await syncSheets();
      json(response, 200, view());
    } else if (path === '/api/refresh' && request.method === 'POST' && configured) {
      await syncSheets();
      json(response, 200, view());
    } else if (path === '/api/import' && request.method === 'POST') {
      if (configured) {
        json(response, 409, { error: 'Google Sheets 연결을 사용하는 중입니다.' });
        return;
      }
      if (!request.headers['content-type']?.startsWith('application/json')) {
        json(response, 415, { error: 'CSV 가져오기 요청 형식을 확인해 주세요.' });
        return;
      }
      const sources = await importCsv(request).catch(error => {
        json(response, 400, { error: error.message });
        return null;
      });
      if (!sources) return;
      await updateSnapshot(current => [...new Map([...current, ...sources].map(source => [source.title, source])).values()]);
      json(response, 200, view());
    } else if (request.method === 'GET' && assets.has(path)) {
      const [name, type] = assets.get(path);
      const content = await readFile(new URL(`./public/${name}`, import.meta.url));
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
      response.end(content);
    } else json(response, 404, { error: '페이지를 찾을 수 없습니다.' });
  } catch {
    json(response, 500, { error: '대시보드 데이터를 처리하지 못했습니다.' });
  }
});

server.listen(port, '127.0.0.1', () => console.log(`CSIDE 대시보드 · http://127.0.0.1:${port}`));
