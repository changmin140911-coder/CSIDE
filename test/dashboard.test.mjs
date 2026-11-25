import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateTab, parseCsv, periodFromTitle } from '../lib/aggregate.mjs';
import { flatten, summarize } from '../public/model.js';

test('타찾 탭 이름에서 1~12월과 주차를 읽는다', () => {
  assert.deepEqual(periodFromTitle('타찾 1월8 (2기)'), { month: 1, week: 8 });
  assert.deepEqual(periodFromTitle('타찾 12월 10주차'), { month: 12, week: 10 });
  assert.equal(periodFromTitle('타찾 13월3'), null);
  assert.equal(periodFromTitle('주차별 섭외유형'), null);
  assert.equal(periodFromTitle('타찾 2월'), null);
});

test('팀-구와 섭외유형을 집계하고 이름과 특이사항은 보내지 않는다', () => {
  const rows = [
    ['', '팀-구', '인도자', '대상자', '만남날짜', '요일', '섭외유형', '특이사항'],
    ['', '2-1', '이름A', '이름B', '', '', '노방(예시)', '메모'],
    ['', '2-1', '이름C', '이름D', '', '', '노방(예시)', ''],
    ['', '2-1', '', '', '', '', '노방', '정파만남 예정'],
    ['', '2-3', '', '', '', '', '개척(예시)', ''],
    ['', '2-3', '', '', '', '', '개척지인(예시)', ''],
    ['', '2-3', '', '', '', '', '지인(예시)', ''],
    ['', '4-2', '', '', '', '', '미확인', ''],
    ['', '4-2', '', '', '', '', '', ''],
    ['', '분류', '', '', '', '', '노방', ''],
  ];
  assert.deepEqual(aggregateTab('타찾 2월8', rows), {
    title: '타찾 2월8', month: 2, week: 8,
    records: [
      { team: 2, area: 1, type: '노방', count: 2 },
      { team: 2, area: 3, type: '개척지인', count: 2 },
      { team: 2, area: 3, type: '지인', count: 1 },
      { team: 4, area: 2, type: '기타', count: 1 },
    ],
  });
  assert.throws(() => aggregateTab('타찾 2월8', [['다른 열']]), /첫 행/);
});

test('CSV의 BOM, 줄바꿈, 쉼표와 따옴표를 읽는다', () => {
  assert.deepEqual(parseCsv('\ufeff팀-구,섭외유형,특이사항\r\n1-2,"노방, 도서","확인\n""메모"""\r\n'), [
    ['팀-구', '섭외유형', '특이사항'], ['1-2', '노방, 도서', '확인\n"메모"'],
  ]);
  assert.throws(() => parseCsv('a,"b'), /따옴표/);
});

test('필터에 사용할 개강월과 주차를 유지하고 다른 개강월을 합치지 않는다', () => {
  const header = ['팀-구', '섭외유형', '특이사항'];
  const sources = [
    aggregateTab('타찾 1월8', [header, ['1-1', '지인'], ['1-2', '노방']]),
    aggregateTab('타찾 2월8', [header, ['1-2', '지인']]),
    aggregateTab('타찾 12월9', [header]),
  ];
  assert.deepEqual([...summarize(flatten(sources), entry => `${entry.month}-${entry.week}`)], [['1-8', 2], ['2-8', 1]]);
  assert.equal(sources[2].records.length, 0);
});
