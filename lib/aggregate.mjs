import { TYPES } from '../public/model.js';

export function periodFromTitle(title) {
  const clean = title.normalize('NFKC').trim();
  const match = /(?:^|\s)타찾\s*(1[0-2]|[1-9])\s*월\s*([1-9]\d?)\s*(?:주차|주)?\s*(?:\([^()]*\))?$/u.exec(clean);
  return match ? { month: Number(match[1]), week: Number(match[2]) } : null;
}

export function aggregateTab(title, rows) {
  const period = periodFromTitle(title);
  if (!period) throw new Error('CSV 이름에 타찾 개강월과 주차를 넣어 주세요. 예: 타찾 2월3.csv');
  const headers = rows[0] ?? [];
  const indexOf = name => headers.findIndex(cell => String(cell ?? '').trim().replace(/\s/g, '') === name);
  const teamIndex = indexOf('팀-구');
  const typeIndex = indexOf('섭외유형');
  const noteIndex = indexOf('특이사항');
  if (Math.min(teamIndex, typeIndex, noteIndex) < 0) {
    throw new Error('첫 행에 팀-구, 섭외유형, 특이사항 열이 있는 타찾 탭을 선택해 주세요.');
  }

  const counts = new Map();
  for (const row of rows.slice(1)) {
    const teamArea = /^(\d+)\s*[-–]\s*(\d+)$/u.exec(String(row[teamIndex] ?? '').trim());
    const typeText = String(row[typeIndex] ?? '').trim();
    if (!teamArea || !typeText || String(row[noteIndex] ?? '').includes('정파만남')) continue;
    const team = Number(teamArea[1]);
    const area = Number(teamArea[2]);
    if (!Number.isSafeInteger(team) || team < 1 || !Number.isSafeInteger(area) || area < 1) continue;
    const type = TYPES.find(type => typeText.includes(type === '개척지인' ? '개척' : type)) ?? '기타';
    const key = `${team}-${area}-${type}`;
    const record = counts.get(key) ?? { team, area, type, count: 0 };
    record.count += 1;
    counts.set(key, record);
  }
  return { title, ...period, records: [...counts.values()] };
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let afterQuote = false;
  const finishField = () => {
    row.push(field);
    field = '';
    afterQuote = false;
  };
  const finishRow = () => {
    finishField();
    rows.push(row);
    row = [];
  };

  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') field += char;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
        afterQuote = true;
      }
    } else if (char === ',') finishField();
    else if (char === '\r' || char === '\n') {
      finishRow();
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else if (afterQuote || (char === '"' && field !== '')) {
      throw new Error('CSV의 따옴표 형식을 확인해 주세요.');
    } else if (char === '"') quoted = true;
    else field += char;
  }
  if (quoted) throw new Error('CSV에서 닫히지 않은 따옴표를 찾았습니다.');
  if (field || row.length || afterQuote) finishRow();
  return rows;
}
