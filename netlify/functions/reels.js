// 릴스 다운로더 API
// 대시보드에서 버튼 3번 호출로 나눠 처리한다 (Netlify 함수 10초 제한 때문)
//   step=fetch      릴스 URL → 영상 주소 · 계정 · 캡션 · 조회수 · 좋아요
//   step=transcribe 영상 주소 → 대본 (ElevenLabs Scribe 또는 OpenAI Whisper)
//   step=analyze    대본 → 한글 번역(kind=translate) / 후킹 분석 + 변형 대본(kind=hook)
//
// 환경변수
//   ANTHROPIC_API_KEY   번역 · 분석 (필수, 대시보드 공용)
//   ELEVENLABS_API_KEY  대본 추출 (둘 중 하나 필수)
//   OPENAI_API_KEY      대본 추출 (ElevenLabs 없을 때)
//   PROXY_URL           인스타가 Netlify 서버 IP 를 막으면 필요 (경쟁사 광고 추적과 공용)

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const IG_APP_ID = '936619743392459';
const LSD = 'AVqbxe3J_YA';
const POST_DOC_ID = '8845758582119845';
const FUNCTION_DEADLINE_MS = 8500;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function reply(statusCode, body) {
  return { statusCode, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

class UserError extends Error {}

// ads.js 와 같은 방식: PROXY_URL 이 있으면 세션을 붙여 한국 가정용 IP 로 우회
let proxied = null;
function getFetch() {
  if (!process.env.PROXY_URL) return (url, opts) => fetch(url, opts);
  if (!proxied) {
    const { fetch: ufetch, ProxyAgent } = require('undici');
    const session = Math.random().toString(36).slice(2, 10);
    const url = process.env.PROXY_URL.replace(
      /^(https?:\/\/[^:]+:)([^@]+)(@.+)$/,
      (_, a, pw, b) => `${a}${pw}_session-${session}${b}`
    );
    const dispatcher = new ProxyAgent(url);
    proxied = { dispatcher, fetch: (u, opts) => ufetch(u, { ...opts, dispatcher }) };
  }
  return proxied.fetch;
}

function rotateProxy() {
  if (proxied) proxied.dispatcher.close().catch(() => {});
  proxied = null;
}

function parseShortcode(url) {
  const m = String(url || '').match(/instagram\.com\/(?:[^/?#]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]{5,})/);
  return m ? m[1] : null;
}

// 1차: 인스타 웹이 게시물 열 때 쓰는 GraphQL (로그인 없이 공개 게시물 조회)
async function fetchGraphql(shortcode, timeoutMs) {
  const body = new URLSearchParams({
    av: '0', __d: 'www', __user: '0', __a: '1', __req: '3', dpr: '2', lsd: LSD,
    fb_api_caller_class: 'RelayModern',
    fb_api_req_friendly_name: 'PolarisPostActionLoadPostQueryQuery',
    variables: JSON.stringify({ shortcode, fetch_tagged_user_count: null, hoisted_comment_id: null, hoisted_reply_id: null }),
    server_timestamps: 'true',
    doc_id: POST_DOC_ID
  });
  const res = await getFetch()('https://www.instagram.com/graphql/query', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': UA,
      'x-ig-app-id': IG_APP_ID,
      'x-fb-lsd': LSD,
      'x-asbd-id': '129477',
      'x-fb-friendly-name': 'PolarisPostActionLoadPostQueryQuery',
      origin: 'https://www.instagram.com',
      referer: `https://www.instagram.com/reel/${shortcode}/`
    },
    body: body.toString(),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  const m = json && json.data && json.data.xdt_shortcode_media;
  if (!m) return null;
  return {
    videoUrl: m.video_url || null,
    thumb: m.display_url || null,
    username: (m.owner && m.owner.username) || '',
    caption: ((((m.edge_media_to_caption || {}).edges || [])[0] || {}).node || {}).text || '',
    views: m.video_play_count || m.video_view_count || null,
    likes: (m.edge_media_preview_like || {}).count ?? null,
    comments: (m.edge_media_to_parent_comment || m.edge_media_to_comment || {}).count ?? null,
    duration: m.video_duration ? Math.round(m.video_duration) : null
  };
}

// 2차: 임베드 페이지 HTML 안의 JSON 에서 영상 주소만이라도 꺼낸다
async function fetchEmbed(shortcode, timeoutMs) {
  const res = await getFetch()(`https://www.instagram.com/p/${shortcode}/embed/captioned/`, {
    headers: { 'user-agent': UA, 'accept-language': 'ko-KR,ko;q=0.9' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!res.ok) return null;
  let html = await res.text();
  for (let i = 0; i < 3; i++) html = html.replace(/\\\//g, '/').replace(/\\"/g, '"');
  const pick = re => { const m = html.match(re); return m ? m[1].replace(/\\u0026/g, '&').replace(/&amp;/g, '&') : null; };
  const videoUrl = pick(/"video_url":"([^"]+)"/);
  if (!videoUrl) return null;
  return {
    videoUrl,
    thumb: pick(/"display_url":"([^"]+)"/),
    username: pick(/"username":"([^"]+)"/) || '',
    caption: '',
    views: Number(pick(/"video_view_count":(\d+)/)) || null,
    likes: null,
    comments: null,
    duration: null
  };
}

async function stepFetch({ url }) {
  const shortcode = parseShortcode(url);
  if (!shortcode) throw new UserError('인스타그램 릴스 주소가 아닙니다. 예: https://www.instagram.com/reel/ABC123/');
  const deadline = Date.now() + FUNCTION_DEADLINE_MS;
  const left = () => deadline - Date.now();

  for (let attempt = 0; left() > 1500; attempt++) {
    try {
      const data = await fetchGraphql(shortcode, Math.min(4000, left() - 500));
      if (data && data.videoUrl) return { shortcode, ...data };
      if (data && !data.videoUrl) throw new UserError('영상이 아닌 게시물입니다 (사진/카드뉴스). 릴스 주소를 넣으세요.');
    } catch (e) {
      if (e instanceof UserError) throw e;
    }
    if (left() > 1500) {
      try {
        const data = await fetchEmbed(shortcode, Math.min(3500, left() - 500));
        if (data) return { shortcode, ...data };
      } catch (e) { /* 다음 시도 */ }
    }
    if (!process.env.PROXY_URL || attempt >= 1) break;
    rotateProxy();
  }
  throw new UserError(process.env.PROXY_URL
    ? '인스타가 요청을 막았습니다. 1~2분 뒤 다시 시도하세요. 계속 실패하면 비공개 계정 · 삭제된 릴스인지 확인하세요.'
    : '인스타가 Netlify 서버 IP를 막았습니다. 비공개 · 삭제 릴스가 아니라면 Netlify 환경변수에 PROXY_URL(한국 가정용 프록시)을 설정하세요.');
}

function isInstagramCdn(u) {
  try {
    const h = new URL(u).hostname;
    return /(^|\.)cdninstagram\.com$/.test(h) || /(^|\.)fbcdn\.net$/.test(h);
  } catch (e) { return false; }
}

async function stepTranscribe({ videoUrl }) {
  if (!isInstagramCdn(videoUrl)) throw new UserError('영상 주소가 올바르지 않습니다. [처리 시작]부터 다시 누르세요.');
  const el = process.env.ELEVENLABS_API_KEY;
  const oa = process.env.OPENAI_API_KEY;
  if (!el && !oa) throw new UserError('대본 추출 키가 없습니다. Netlify 환경변수에 ELEVENLABS_API_KEY 또는 OPENAI_API_KEY를 추가하세요.');

  const vres = await fetch(videoUrl, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(3500) });
  if (!vres.ok) throw new UserError(`영상 다운로드 실패 (HTTP ${vres.status}). 영상 주소가 만료됐을 수 있습니다. [처리 시작]부터 다시 누르세요.`);
  const blob = new Blob([await vres.arrayBuffer()], { type: 'video/mp4' });
  if (blob.size > 24 * 1024 * 1024) throw new UserError('영상이 너무 깁니다 (24MB 초과). 90초 이하 릴스만 처리됩니다.');

  const form = new FormData();
  form.append('file', blob, 'reel.mp4');
  let res;
  if (el) {
    form.append('model_id', 'scribe_v1');
    form.append('tag_audio_events', 'false');
    res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST', headers: { 'xi-api-key': el }, body: form, signal: AbortSignal.timeout(5500)
    });
  } else {
    form.append('model', 'whisper-1');
    res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${oa}` }, body: form, signal: AbortSignal.timeout(5500)
    });
  }
  const d = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (d.detail && (d.detail.message || d.detail)) || (d.error && d.error.message) || `HTTP ${res.status}`;
    throw new UserError(`대본 추출 실패: ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`);
  }
  // 문장 끝마다 줄바꿈해 화면에서 읽기 쉽게
  const text = String(d.text || '').trim().replace(/([.!?。])\s+/g, '$1\n');
  return { text, language: d.language_code || d.language || '' };
}

const PROMPTS = {
  translate: ({ script }) => `아래 인스타그램 릴스 대본을 자연스러운 한국어로 번역하라.
- 줄 단위를 그대로 유지
- 번역문만 출력, 설명 금지
- 원문이 이미 한국어면 맞춤법만 다듬어 그대로 출력

대본:
${script}`,
  hook: ({ script, caption, product }) => `너는 쇼핑몰 인스타그램 릴스 기획자다. 아래 릴스는 벤치마킹 대상이다.
아래 형식 그대로, 한국어로, 군더더기 없이 작성하라. 이모티콘 금지.

[첫 3초 후킹]
(실제 후킹 문장 + 왜 멈추게 하는지 1줄)

[구조]
(예: 문제제기 → 비교 → 반전 → CTA, 구간별 초 단위 포함)

[저장 · 공유 포인트]
(2줄 이내)

[변형 대본 3개]
${product ? `우리 상품: ${product}` : '우리 쇼핑몰 상품에 바로 쓸 수 있게'} — 같은 구조, 각 15초, 장면/자막/멘트 구분

캡션: ${caption || '(없음)'}

대본:
${script || '(음성 없음 — 캡션과 일반적인 릴스 구조로 판단)'}`
};

async function stepAnalyze({ kind, script, caption, product }) {
  if (!PROMPTS[kind]) throw new UserError('잘못된 분석 종류입니다.');
  if (!process.env.ANTHROPIC_API_KEY) throw new UserError('ANTHROPIC_API_KEY가 설정되지 않았습니다.');
  const clip = s => String(s || '').slice(0, 4000);
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      // 10초 제한 안에 끝내려고 가장 빠른 모델 사용
      model: 'claude-haiku-4-5-20251001',
      max_tokens: kind === 'hook' ? 1400 : 1000,
      messages: [{ role: 'user', content: PROMPTS[kind]({ script: clip(script), caption: clip(caption), product: clip(product) }) }]
    }),
    signal: AbortSignal.timeout(FUNCTION_DEADLINE_MS)
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new UserError(`AI 분석 실패: ${(d.error && d.error.message) || 'HTTP ' + res.status}`);
  return { text: (d.content || []).map(b => b.text || '').join('').trim() };
}

const STEPS = { fetch: stepFetch, transcribe: stepTranscribe, analyze: stepAnalyze };

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return reply(405, { message: 'Method Not Allowed' });
  let body;
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { message: '잘못된 요청입니다.' }); }
  const step = STEPS[body.step];
  if (!step) return reply(400, { message: '잘못된 단계입니다.' });
  try {
    return reply(200, await step(body));
  } catch (e) {
    if (e instanceof UserError) return reply(400, { message: e.message });
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return reply(504, { message: '처리 시간이 10초를 넘었습니다. 다시 누르세요. 90초 넘는 긴 릴스는 실패할 수 있습니다.' });
    }
    return reply(500, { message: e.message });
  }
};
