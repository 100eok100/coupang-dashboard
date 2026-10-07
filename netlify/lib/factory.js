// 콘텐츠 공장 공용 로직
// 매일 주제별 릴스·쇼츠 대본을 만들어 승인함(Netlify Blobs)에 쌓는다.
// 상태 흐름: pending(승인 대기) → approved(승인) → rendering(PC 작업 중) → rendered(영상 완성)
//                              ↘ rejected(반려)
// 승인된 대본은 PC 작업기가 action=queue 로 가져가 영상으로 만든다.

const { getStore } = require('@netlify/blobs');

const MODEL = 'claude-haiku-4-5-20251001';

const TOPICS = {
  피부관리: {
    who: '피지·모공·각질·자외선이 고민인 20~30대',
    angle: '집에서 바로 따라 하는 피부 관리 습관과 도구 사용법',
    rules: '화장품법: 치료·완치·재생·여드름 개선 보장·염증 완화 등 의약품 효능 표현 금지. "피부 개선 100%" 같은 단정 금지. 효과는 "덜 들떠 보임", "정돈돼 보임"처럼 사용감으로만 표현.'
  },
  살림꿀팁: {
    who: '자취생·신혼부부·주부',
    angle: '청소·정리·주방·세탁을 시간과 돈을 아끼며 해결하는 방법',
    rules: '락스·세제 혼합처럼 위험한 방법 금지. 검증 안 된 민간요법 금지.'
  },
  쿠팡꿀템: {
    who: '쿠팡에서 생활용품을 자주 사는 2040',
    angle: '로켓배송으로 바로 받는 생활 꿀템의 사용 전후·비교',
    rules: '표시광고법: 근거 없는 "최저가", "1위", "최고" 금지. 실제 상품명·가격은 지어내지 말고 메모에 있는 상품만 쓰고, 없으면 [상품명] 자리표시로 남김. 마지막에 "쿠팡에서 [검색어] 검색" CTA.'
  }
};

// 같은 틀만 반복하면 "찍어낸 콘텐츠"로 분류돼 노출이 막힌다. 날짜·주제별로 돌려 쓴다.
const STRUCTURES = [
  '비교 반전: 평범한 상태 → "근데 이거 하나 더하면" → 확 달라진 결과',
  '실수 TOP3: "이거 하면 망합니다" 흔한 실수 3가지와 바른 방법',
  '전후 비교: 사용 전 문제 장면 → 과정 → 사용 후 결과',
  '오해 vs 진실: 다들 믿는 상식 1개를 뒤집고 이유 설명',
  '30초 루틴: 순서대로 따라 하는 3단계',
  '대체템: 비싼 방법 대신 만원대로 해결하는 방법',
  'POV 공감: "이럴 때 있죠?" 상황 공감 → 해결'
];

function kstDate(offsetDays = 0) {
  return new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
}

function structureFor(date, topicIndex) {
  const day = Math.floor(Date.parse(date + 'T00:00:00Z') / 86400e3);
  return STRUCTURES[(day + topicIndex * 3) % STRUCTURES.length];
}

function store() {
  return getStore('factory');
}

async function getDay(date) {
  return (await store().get(`day/${date}`, { type: 'json' })) || { date, items: [] };
}

async function saveDay(day) {
  await store().setJSON(`day/${day.date}`, day);
  return day;
}

async function getMemo() {
  return (await store().get('memo', { type: 'json' })) || {};
}

async function saveMemo(memo) {
  const clean = {};
  for (const t of Object.keys(TOPICS)) clean[t] = String(memo[t] || '').slice(0, 500);
  await store().setJSON('memo', clean);
  return clean;
}

// 최근 14일 제목을 주제별로 모아 같은 소재 반복을 막는다
async function recentTitles() {
  const days = await Promise.all(Array.from({ length: 14 }, (_, i) => getDay(kstDate(-(i + 1)))));
  const byTopic = {};
  for (const day of days) {
    for (const it of day.items) {
      if (it.script && it.status !== 'rejected') (byTopic[it.topic] = byTopic[it.topic] || []).push(it.script.title);
    }
  }
  return byTopic;
}

function buildPrompt({ topic, structure, memo, avoid }) {
  const t = TOPICS[topic];
  return `너는 인스타 릴스·유튜브 쇼츠 기획자다. 아래 조건으로 세로형 숏폼 대본 1개를 만든다.

주제: ${topic}
타깃: ${t.who}
방향: ${t.angle}
구조: ${structure}
${memo ? `이번 주 소재·상품 메모(우선 사용): ${memo}` : ''}
${avoid.length ? `최근에 쓴 제목(겹치지 말 것): ${avoid.slice(0, 20).join(' / ')}` : ''}

규칙
- 길이 15~25초, 장면 4~6개, 첫 장면 0~3초 안에 결과나 문제를 바로 보여줌
- 화면 자막은 장면당 15자 이내, 내레이션은 말하듯 짧게
- shot 은 휴대폰으로 실제 촬영할 수 있는 구체적인 지시 (손·제품·클로즈업 위주, 얼굴 불필요)
- ${t.rules}
- 이모티콘 금지

아래 JSON 만 출력하라. 설명·코드블록 금지.
{"title":"관리용 제목","hook":"첫 3초 자막","scenes":[{"t":"0-3","shot":"촬영 지시","text":"화면 자막","voice":"내레이션"}],"caption":"게시물 캡션 2~3줄","hashtags":["태그 5개, # 없이"],"cta":"마지막 행동 유도 문장","check":"광고·표현 위험 문구 점검 결과 1줄"}`;
}

function parseScript(text) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s < 0 || e < s) throw new Error('대본 형식 오류');
  const j = JSON.parse(text.slice(s, e + 1));
  if (!j.title || !Array.isArray(j.scenes) || !j.scenes.length) throw new Error('대본 항목 누락');
  j.hashtags = (j.hashtags || []).map(h => String(h).replace(/^#/, '')).slice(0, 5);
  return j;
}

async function generateScript({ topic, date, memo, avoid = [], timeoutMs = 25000 }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY 미설정');
  const topicIndex = Object.keys(TOPICS).indexOf(topic);
  const structure = structureFor(date, topicIndex);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: buildPrompt({ topic, structure, memo, avoid }) }]
    }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`AI 오류: ${(d.error && d.error.message) || res.status}`);
  const script = parseScript((d.content || []).map(b => b.text || '').join(''));
  return { structure: structure.split(':')[0], script };
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// 하루치 생성: 주제마다 1개씩, 동시에 만든다. 이미 있는 주제는 건너뛴다.
async function generateDay(date = kstDate(), { timeoutMs } = {}) {
  const day = await getDay(date);
  const [memo, recent] = await Promise.all([getMemo(), recentTitles()]);
  const todo = Object.keys(TOPICS).filter(t => !day.items.some(it => it.topic === t && it.status !== 'rejected'));
  const results = await Promise.allSettled(
    todo.map(topic => generateScript({ topic, date, memo: memo[topic], avoid: recent[topic] || [], timeoutMs }))
  );
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      day.items.push({ id: newId(), topic: todo[i], status: 'pending', createdAt: new Date().toISOString(), ...r.value });
    } else {
      errors.push(`${todo[i]}: ${r.reason.message}`);
    }
  });
  await saveDay(day);
  return { day, errors };
}

function summaryText(day) {
  const pending = day.items.filter(it => it.status === 'pending');
  const lines = pending.map(it => `${it.topic}: ${it.script.title}`);
  const [, m, d] = day.date.split('-').map(Number);
  return `[콘텐츠 공장] ${m}/${d} 대본 ${pending.length}개 승인 대기\n${lines.join('\n')}\n대시보드에서 승인하세요`.slice(0, 200);
}

module.exports = {
  TOPICS, STRUCTURES, kstDate, getDay, saveDay, getMemo, saveMemo,
  generateScript, generateDay, recentTitles, summaryText, newId
};
