import { flatten, summarize, TYPES } from './model.js';

const byId = id => document.getElementById(id);
const mounts = {
  month: byId('month'), week: byId('week'), team: byId('team'),
  months: byId('month-plot'), types: byId('type-chart'), weeks: byId('week-list'), table: byId('team-table'),
  dialog: byId('source-dialog'), files: byId('csv-files'), form: byId('import-form'), refresh: byId('refresh'),
};
const formatter = new Intl.NumberFormat('ko-KR');
const dateFormatter = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul' });
const percent = (part, total) => `${total ? (Math.round(part * 1000 / total) / 10).toLocaleString('ko-KR') : 0}%`;
const countText = count => `${formatter.format(count)}건`;
const numberOrder = (a, b) => a - b;
const getTotal = records => records.reduce((total, record) => total + record.count, 0);
const months = Array.from({ length: 12 }, (_, index) => index + 1);
let dataset = { sources: [], connection: 'local', canRefresh: false };
let selection = { month: 0, week: 0, team: 0 };

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}

function message(node, content) {
  node.textContent = content;
  node.hidden = !content;
}

function choice(select, options, value) {
  select.replaceChildren(...options.map(([key, label]) => new Option(label, key)));
  select.value = value;
}

function empty(text) {
  return element('p', 'empty', text);
}

function renderMonths(counts) {
  const size = Math.max(...counts.values(), 4) / 4;
  const step = 10 ** Math.floor(Math.log10(size));
  const interval = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 10].find(value => value * step >= size) * step;
  const ceiling = interval * 4;
  const ticks = element('div', 'month-ticks');
  ticks.setAttribute('aria-hidden', 'true');
  for (let tick = 4; tick >= 0; tick--) ticks.append(element('span', '', formatter.format(tick * ceiling / 4)));
  const plot = element('div', 'month-bars');

  for (const month of months) {
    const hasData = counts.has(month);
    const value = counts.get(month) ?? 0;
    const selected = month === selection.month;
    const button = element('button', `month-column${selected ? ' selected' : ''}`);
    button.type = 'button';
    button.dataset.month = month;
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute('aria-label', `${month}월 ${hasData ? countText(value) : '자료 없음'}`);
    button.title = button.getAttribute('aria-label');
    const column = element('span', 'month-column-inner');
    const bar = element('span', `month-bar${hasData ? '' : ' missing'}`);
    bar.style.setProperty('--height', `${value * 100 / ceiling}%`);
    if (hasData) bar.append(element('span', 'bar-value', formatter.format(value)));
    column.append(bar);
    button.append(column, element('span', 'month-label', `${month}월`));
    plot.append(button);
  }
  mounts.months.replaceChildren(ticks, plot);
}

function renderTypes(counts, total) {
  if (!total) {
    mounts.types.replaceChildren(empty('선택 범위에 집계된 섭외유형이 없어요.'));
    return;
  }
  const sorted = [...TYPES].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
  mounts.types.replaceChildren(...sorted.map(type => {
    const count = counts.get(type) ?? 0;
    const row = element('div', 'type-row');
    const track = element('span', 'type-track');
    const bar = element('i');
    bar.style.width = `${count * 100 / total}%`;
    bar.style.setProperty('--type-index', TYPES.indexOf(type));
    track.setAttribute('aria-hidden', 'true');
    track.append(bar);
    row.append(element('span', '', type), track, element('strong', '', formatter.format(count)), element('span', 'type-percent', percent(count, total)));
    return row;
  }));
}

function renderWeeks(weeks, counts) {
  if (!weeks.length) {
    mounts.weeks.replaceChildren(empty('이 개강월에 등록된 주차가 없어요.'));
    return;
  }
  const max = Math.max(...counts.values(), 1);
  mounts.weeks.replaceChildren(...weeks.map(week => {
    const count = counts.get(week) ?? 0;
    const item = element('button', 'week-item');
    item.type = 'button';
    item.dataset.week = week;
    item.setAttribute('aria-pressed', String(week === selection.week));
    const track = element('span', 'week-track');
    track.setAttribute('aria-hidden', 'true');
    const bar = element('i');
    bar.style.width = `${count * 100 / max}%`;
    track.append(bar);
    item.append(element('span', '', `${week}주차`), track, element('strong', '', countText(count)));
    return item;
  }));
}

function renderTeams(records, total) {
  byId('team-subtitle').textContent = selection.team
    ? `${selection.team}팀 구역별 집계`
    : '팀을 선택하면 구역별 집계를 볼 수 있어요.';
  if (!total) {
    mounts.table.replaceChildren(empty('선택 범위에 집계된 타찾이 없어요.'));
    return;
  }
  const group = selection.team ? 'area' : 'team';
  const countByGroup = summarize(records, value => value[group]);
  const countByType = summarize(records, value => `${value[group]}-${value.type}`);
  const table = element('table');
  const heading = table.createTHead().insertRow();
  for (const name of [selection.team ? '구역' : '팀', ...TYPES, '합계', '비중']) {
    const cell = element('th', '', name);
    cell.scope = 'col';
    heading.append(cell);
  }
  const body = table.createTBody();
  for (const key of [...countByGroup.keys()].sort(numberOrder)) {
    const row = body.insertRow();
    const label = element('th');
    label.scope = 'row';
    if (selection.team) label.textContent = `${key}구역`;
    else {
      const button = element('button', 'row-team', `${key}팀`);
      button.type = 'button';
      button.dataset.team = key;
      button.setAttribute('aria-label', `${key}팀 구역별 현황 보기`);
      label.append(button);
    }
    row.append(label);
    for (const type of TYPES) row.insertCell().textContent = formatter.format(countByType.get(`${key}-${type}`) ?? 0);
    row.insertCell().append(element('strong', 'table-total', formatter.format(countByGroup.get(key))));
    row.insertCell().textContent = percent(countByGroup.get(key), total);
  }
  mounts.table.replaceChildren(table);
  if (selection.team) {
    const back = element('button', 'row-team back-team', '← 전체 팀 보기');
    back.type = 'button';
    back.dataset.team = 0;
    mounts.table.prepend(back);
  }
}

function render() {
  const allRecords = flatten(dataset.sources);
  const annual = new Map(dataset.sources.map(source => [source.month, 0]));
  for (const [month, count] of summarize(allRecords, value => value.month)) annual.set(month, count);
  if (!selection.month) selection.month = Math.max(...annual.keys(), 1);
  const monthSources = dataset.sources.filter(source => source.month === selection.month);
  const weeks = [...new Set(monthSources.map(source => source.week))].sort(numberOrder);
  const monthRecords = allRecords.filter(record => record.month === selection.month);
  const teams = [...new Set(monthRecords.map(record => record.team))].sort(numberOrder);
  if (!weeks.includes(selection.week)) selection.week = 0;
  if (!teams.includes(selection.team)) selection.team = 0;

  choice(mounts.month, months.map(month => [month, `${month}월${annual.has(month) ? '' : ' · 자료 없음'}`]), selection.month);
  choice(mounts.week, [[0, '전체 주차'], ...weeks.map(week => [week, `${week}주차`])], selection.week);
  choice(mounts.team, [[0, '전체 팀'], ...teams.map(team => [team, `${team}팀`])], selection.team);
  mounts.week.disabled = !weeks.length;
  mounts.team.disabled = !teams.length;

  const byTeam = monthRecords.filter(record => !selection.team || record.team === selection.team);
  const records = byTeam.filter(record => !selection.week || record.week === selection.week);
  const total = getTotal(records);
  const typeCounts = summarize(records, value => value.type);
  const top = [...TYPES].sort((a, b) => (typeCounts.get(b) ?? 0) - (typeCounts.get(a) ?? 0))[0];
  const selectedWeeks = selection.week ? [selection.week] : weeks;
  const scope = [
    `${selection.month}월 개강`,
    selection.week ? `${selection.week}주차` : '전체 주차',
    selection.team ? `${selection.team}팀` : '전체 팀',
  ];

  byId('total').textContent = weeks.length ? countText(total) : '—';
  byId('total-detail').textContent = weeks.length ? scope.join(' · ') : '등록된 자료 없음';
  byId('week-count').textContent = weeks.length ? `${selectedWeeks.length}개` : '—';
  byId('week-detail').textContent = selectedWeeks.length ? selectedWeeks.map(week => `${week}주차`).join(', ') : '등록된 주차 없음';
  byId('team-count').textContent = weeks.length ? `${new Set(records.map(record => record.team)).size}개 팀` : '—';
  byId('team-detail').textContent = '집계 건수가 있는 팀';
  byId('top-type').textContent = total ? top : '—';
  byId('top-detail').textContent = total ? `${countText(typeCounts.get(top))} · ${percent(typeCounts.get(top), total)}` : '집계된 유형 없음';
  byId('type-subtitle').textContent = scope.join(' · ');
  byId('weekly-subtitle').textContent = `${scope[0]} · ${scope[2]}`;

  renderMonths(annual);
  renderTypes(typeCounts, total);
  renderWeeks(weeks, summarize(byTeam, value => value.week));
  renderTeams(records, total);
}

function renderSource() {
  const connection = {
    live: ['Google Sheets 연결됨', '원본 시트의 타찾 주차 탭을 읽어 집계하고 있어요.'],
    stale: ['Google Sheets 연결 오류', '시트를 가져오지 못했어요. 시트 보기 권한과 API 설정을 확인한 뒤 다시 시도해 주세요.'],
    local: [dataset.sources.length ? '로컬 데이터' : '데이터 연결 필요', '이 컴퓨터에 저장된 집계를 사용 중이에요. 새 명단은 CSV로 가져올 수 있어요.'],
  }[dataset.connection];
  byId('connection').dataset.status = dataset.connection;
  byId('connection-label').textContent = connection[0];
  byId('source-description').textContent = connection[1];
  byId('source-time').textContent = dataset.updatedAt
    ? `마지막 반영 ${dateFormatter.format(new Date(dataset.updatedAt))}`
    : '아직 반영된 데이터가 없어요.';
  const sources = [...dataset.sources].sort((a, b) => (a.month - b.month) || (a.week - b.week));
  byId('source-list').replaceChildren(...sources.map(source => {
    const item = element('li');
    item.append(element('span', '', source.title), element('strong', '', countText(getTotal(source.records))));
    return item;
  }));
  mounts.form.hidden = dataset.canRefresh;
  mounts.refresh.hidden = !dataset.canRefresh;
}

async function update(path, options) {
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  dataset = result;
  render();
  renderSource();
  const feedback = dataset.connection === 'stale'
    ? (dataset.sources.length ? '시트 갱신에 실패해 마지막으로 저장한 데이터를 표시하고 있어요.' : '시트를 가져오지 못했어요. 데이터 관리에서 연결 상태를 확인해 주세요.')
    : dataset.sources.length ? '' : '데이터 관리에서 타찾 명단 CSV를 가져오면 집계를 볼 수 있어요.';
  message(byId('feedback'), feedback);
}

function changeMonth(month) {
  selection = { month, week: 0, team: 0 };
  render();
}

mounts.month.addEventListener('change', () => changeMonth(Number(mounts.month.value)));
mounts.week.addEventListener('change', () => {
  selection.week = Number(mounts.week.value);
  render();
});
mounts.team.addEventListener('change', () => {
  selection.team = Number(mounts.team.value);
  render();
});
mounts.months.addEventListener('click', event => {
  const button = event.target.closest('button[data-month]');
  if (!button) return;
  changeMonth(Number(button.dataset.month));
  mounts.months.querySelector(`[data-month="${selection.month}"]`).focus({ preventScroll: true });
});
mounts.weeks.addEventListener('click', event => {
  const button = event.target.closest('button[data-week]');
  if (!button) return;
  const week = Number(button.dataset.week);
  selection.week = week === selection.week ? 0 : week;
  render();
  mounts.weeks.querySelector(`[data-week="${week}"]`).focus({ preventScroll: true });
});
mounts.table.addEventListener('click', event => {
  const button = event.target.closest('button[data-team]');
  if (!button) return;
  selection.team = Number(button.dataset.team);
  render();
  mounts.table.focus({ preventScroll: true });
});

for (const button of document.querySelectorAll('[data-open-source]')) {
  button.addEventListener('click', () => mounts.dialog.showModal());
}

mounts.form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter;
  const notice = byId('source-notice');
  button.disabled = true;
  message(notice, '가져오는 중…');
  try {
    const files = [...mounts.files.files];
    if (files.reduce((size, file) => size + file.size, 0) > 8_000_000) throw new Error('한 번에 최대 8MB의 CSV 파일을 선택해 주세요.');
    const contents = await Promise.all(files.map(async file => ({ name: file.name, text: await file.text() })));
    await update('/api/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: contents }),
    });
    mounts.form.reset();
    message(notice, `${files.length}개 파일의 집계를 반영했어요.`);
  } catch (error) {
    message(notice, error.message || 'CSV를 가져오지 못했어요.');
  } finally {
    button.disabled = false;
  }
});

mounts.refresh.addEventListener('click', async () => {
  mounts.refresh.disabled = true;
  const notice = byId('source-notice');
  message(notice, '원본 시트를 불러오는 중…');
  try {
    await update('/api/refresh', { method: 'POST' });
    message(notice, dataset.connection === 'live' ? '최신 시트를 반영했어요.' : '원본 시트를 가져오지 못했어요.');
  } catch {
    message(notice, '대시보드에 연결하지 못했어요.');
  } finally {
    mounts.refresh.disabled = false;
  }
});

function highlightNavigation() {
  const current = window.location.hash || '#overview';
  for (const link of document.querySelectorAll('nav .nav-link')) {
    const active = link.hash === current;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  }
}

window.addEventListener('hashchange', highlightNavigation);
highlightNavigation();
update('/api/dashboard').catch(() => {
  render();
  renderSource();
  message(byId('feedback'), '데이터를 불러오지 못했어요. 페이지를 다시 열어 주세요.');
});
