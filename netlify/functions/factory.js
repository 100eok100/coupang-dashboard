// 콘텐츠 공장 승인함 API — 대시보드 [콘텐츠 공장] 과 PC 작업기가 쓴다.
// 비밀번호는 /weather.html 에서 등록한 날씨 알림 비밀번호와 같다 (수강생에게 승인함이 보이지 않게).
//
// POST {key, action, ...}
//   list       {date?}              하루치 대본 + 주제별 메모
//   generate   {date?}              빠진 주제 대본 생성 (아침 6시 자동 실행과 같은 동작)
//   regenerate {date, id}           대본 1개 다시 생성 (기존 것은 반려 처리)
//   status     {date, id, status}   approved / rejected / pending 으로 변경
//   memo       {memo}               주제별 이번 주 소재·상품 메모 저장
//   queue      {}                   PC 작업기용: 최근 3일 승인 대본 목록
//   rendered   {date, id, file?}    PC 작업기용: 영상 완성 표시
//   rendering  {date, id, worker?}  PC 작업기용: 작업 시작 표시 (중복 작업 방지)

const { connectLambda } = require('@netlify/blobs');
const F = require('../lib/factory');
const { loadConfig } = require('../lib/weather-alert');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function reply(statusCode, body) {
  return { statusCode, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function findItem(date, id) {
  if (!DATE_RE.test(date || '')) throw Object.assign(new Error('날짜 형식 오류'), { code: 400 });
  const day = await F.getDay(date);
  const item = day.items.find(it => it.id === id);
  if (!item) throw Object.assign(new Error('대본을 찾을 수 없습니다'), { code: 404 });
  return { day, item };
}

const ACTIONS = {
  async list({ date }) {
    date = DATE_RE.test(date || '') ? date : F.kstDate();
    const [day, memo] = await Promise.all([F.getDay(date), F.getMemo()]);
    return { date, today: F.kstDate(), topics: Object.keys(F.TOPICS), items: day.items, memo };
  },

  async generate({ date }) {
    date = DATE_RE.test(date || '') ? date : F.kstDate();
    // 일반 함수는 10초 제한이라 AI 대기는 9초까지만
    const { day, errors } = await F.generateDay(date, { timeoutMs: 9000 });
    return { date, items: day.items, errors };
  },

  async regenerate({ date, id }) {
    const { day, item } = await findItem(date, id);
    const [memo, recent] = await Promise.all([F.getMemo(), F.recentTitles()]);
    const avoid = [...(recent[item.topic] || []), item.script.title];
    const fresh = await F.generateScript({ topic: item.topic, date, memo: memo[item.topic], avoid, timeoutMs: 9000 });
    item.status = 'rejected';
    day.items.push({ id: F.newId(), topic: item.topic, status: 'pending', createdAt: new Date().toISOString(), ...fresh });
    await F.saveDay(day);
    return { date, items: day.items };
  },

  async status({ date, id, status }) {
    if (!['approved', 'rejected', 'pending'].includes(status)) throw Object.assign(new Error('잘못된 상태'), { code: 400 });
    const { day, item } = await findItem(date, id);
    item.status = status;
    item.updatedAt = new Date().toISOString();
    await F.saveDay(day);
    return { date, items: day.items };
  },

  async memo({ memo }) {
    return { memo: await F.saveMemo(memo || {}) };
  },

  async queue() {
    const days = await Promise.all([0, -1, -2].map(i => F.getDay(F.kstDate(i))));
    const jobs = [];
    for (const day of days) {
      for (const it of day.items) if (it.status === 'approved') jobs.push({ date: day.date, ...it });
    }
    return { jobs };
  },

  async rendering({ date, id, worker }) {
    const { day, item } = await findItem(date, id);
    if (item.status !== 'approved') throw Object.assign(new Error('이미 다른 작업기가 가져갔거나 승인 상태가 아닙니다'), { code: 409 });
    item.status = 'rendering';
    item.worker = String(worker || '').slice(0, 40);
    item.updatedAt = new Date().toISOString();
    await F.saveDay(day);
    return { ok: true };
  },

  async rendered({ date, id, file }) {
    const { day, item } = await findItem(date, id);
    item.status = 'rendered';
    item.file = String(file || '').slice(0, 200);
    item.updatedAt = new Date().toISOString();
    await F.saveDay(day);
    return { ok: true };
  }
};

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { message: 'Method Not Allowed' });
  connectLambda(event);

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return reply(400, { message: '잘못된 요청' }); }
  const cfg = await loadConfig();
  if (!cfg.secret) return reply(403, { message: '비밀번호가 없습니다. /weather.html 에서 비밀번호를 먼저 등록하세요' });
  if (body.key !== cfg.secret) return reply(403, { message: '비밀번호가 틀렸습니다' });

  const fn = ACTIONS[body.action];
  if (!fn) return reply(400, { message: '잘못된 동작' });
  try {
    return reply(200, await fn(body));
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return reply(504, { message: 'AI 응답이 10초를 넘었습니다. 다시 누르세요' });
    }
    return reply(err.code || 500, { message: err.message });
  }
};
