import { createSign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { aggregateTab, periodFromTitle } from './aggregate.mjs';

const oauthEndpoint = 'https://oauth2.googleapis.com/token';
const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const accessToken = process.env.GOOGLE_SHEETS_ACCESS_TOKEN;
export const configured = Boolean(spreadsheetId && (credentialsPath || accessToken));
let cachedToken;

async function token() {
  if (accessToken) return accessToken;
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;
  const credentials = JSON.parse(await readFile(credentialsPath, 'utf8'));
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'RS256', typ: 'JWT' });
  const claims = encode({
    iss: credentials.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud: oauthEndpoint,
    iat: now,
    exp: now + 3600,
  });
  const message = `${header}.${claims}`;
  const signature = createSign('RSA-SHA256').update(message).sign(credentials.private_key, 'base64url');
  const response = await fetch(oauthEndpoint, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${message}.${signature}`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Google 인증 응답 ${response.status}`);
  const result = await response.json();
  cachedToken = { value: result.access_token, expiresAt: Date.now() + result.expires_in * 1000 };
  return cachedToken.value;
}

export async function readSheets() {
  const authorization = `Bearer ${await token()}`;
  const endpoint = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}`;
  async function get(path, query) {
    const response = await fetch(`${endpoint}${path}?${query}`, {
      headers: { authorization },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Google Sheets 응답 ${response.status}`);
    return response.json();
  }

  const metadata = await get('', new URLSearchParams({ fields: 'sheets(properties(title,hidden,sheetType))' }));
  const titles = metadata.sheets.map(sheet => sheet.properties)
    .filter(sheet => !sheet.hidden && sheet.sheetType === 'GRID' && periodFromTitle(sheet.title))
    .map(sheet => sheet.title);
  if (!titles.length) throw new Error('타찾 명단 탭을 찾지 못했습니다.');
  const sources = [];
  for (let start = 0; start < titles.length; start += 20) {
    const group = titles.slice(start, start + 20);
    const query = new URLSearchParams({ valueRenderOption: 'FORMATTED_VALUE' });
    for (const title of group) query.append('ranges', `'${title.replaceAll("'", "''")}'!A1:H`);
    const { valueRanges } = await get('/values:batchGet', query);
    sources.push(...valueRanges.map((tab, index) => aggregateTab(group[index], tab.values ?? [])));
  }
  return sources;
}
