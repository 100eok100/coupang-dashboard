// 경쟁사 광고 추적 API
// 구글 광고 투명성 센터 · 메타 광고 라이브러리 공개 데이터 조회.
// 수집 방식은 chonamgyu/mav-ai (MIT) 의 atc-scraper · yt-extractor-direct · meta-scraper 를
// Netlify 함수(10초 제한)에 맞게 축소 이식한 것.
//
// 환경변수
//   YOUTUBE_API_KEY   영상 광고 조회수 · 성과 배지 (선택, 권장)
//   PROXY_URL         한국 가정용 프록시. 구글이 데이터센터 IP 를 차단하면 필요 (선택)
//                     예: http://user:pass_country-kr@geo.iproyal.com:12321
//   META_ACCESS_TOKEN 메타 Graph API 토큰 (선택, 없으면 광고 라이브러리 링크만 제공)

const ATC_BASE = 'https://adstransparency.google.com';
const REGION_CODES = { KR: 2410, US: 2840, JP: 2392, GB: 2826 };
const PAGE_SIZE = 40;

const UA_POOL = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function reply(statusCode, body) {
  return { statusCode, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

class BotChallengeError extends Error {}
class RetryableError extends Error {}
class ProxyAuthError extends Error {}

// 구글이 막으면(302/429) 또는 네트워크·5xx 오류면 프록시 세션을 바꿔 새 한국 IP 로 다시 보낸다.
// mav-ai 는 5~28초씩 기다리며 4회 돌리지만, Netlify 함수는 10초 제한이라 짧게 3회까지만.
const MAX_ROTATIONS = 3;
const FUNCTION_DEADLINE_MS = 8500;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// PROXY_URL 이 있으면 undici ProxyAgent 로 우회. 비밀번호 뒤에 세션 문자열을 붙여 IP 를 고정하고,
// rotateProxy() 로 세션을 바꾸면 IPRoyal 이 다른 IP 를 준다.
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

async function rpcOnce(method, payload, attempt, timeoutMs) {
  let res;
  try {
    res = await getFetch()(`${ATC_BASE}/anji/_/rpc/SearchService/${method}?authuser=`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'x-same-domain': '1',
        referer: `${ATC_BASE}/?region=KR`,
        'user-agent': UA_POOL[attempt % UA_POOL.length]
      },
      body: `f.req=${encodeURIComponent(JSON.stringify(payload))}`,
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (e) {
    // undici 는 원인을 cause 안쪽에 겹겹이 넣는다 (fetch failed → Request was cancelled → Proxy response (407))
    const chain = [];
    for (let c = e; c && chain.length < 5; c = c.cause) chain.push(c.message || String(c));
    if (chain.some(m => /\b407\b/.test(m))) throw new ProxyAuthError(chain.join(' / '));
    const msg = chain[chain.length - 1] || String(e);
    throw new RetryableError(`ATC ${method} 네트워크 오류: ${msg}`);
  }
  if (res.status === 302 || res.status === 429) throw new BotChallengeError(method);
  const text = await res.text();
  if (res.status >= 500) throw new RetryableError(`ATC ${method} ${res.status}`);
  if (!res.ok) throw new Error(`ATC ${method} ${res.status}: ${text.slice(0, 150)}`);
  return JSON.parse(text);
}

async function postRpc(method, payload, deadline) {
  for (let attempt = 0; ; attempt++) {
    const remaining = deadline - Date.now();
    try {
      return await rpcOnce(method, payload, attempt, Math.max(1000, Math.min(6000, remaining)));
    } catch (e) {
      const retryable = e instanceof BotChallengeError || e instanceof RetryableError;
      // 프록시 없이는 같은 IP 로 다시 보내봐야 또 막히므로 재시도하지 않는다.
      const canRotate = process.env.PROXY_URL && attempt < MAX_ROTATIONS;
      if (!retryable || !canRotate || deadline - Date.now() < 2500) throw e;
      console.warn(`[ATC ${method}] ${e.message || 'bot challenge'} — IP 교체 후 재시도 ${attempt + 1}/${MAX_ROTATIONS}`);
      rotateProxy();
      await sleep(300 + Math.random() * 400);
    }
  }
}

function looksLikeDomain(q) {
  const s = q.trim();
  return !/\s/.test(s) && /\./.test(s) && /^[a-z0-9.-]+\.[a-z]{2,}/i.test(s.replace(/^https?:\/\//, ''));
}

function normalizeDomain(q) {
  return q.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*/, '');
}

async function searchAdvertisers(keyword, code, deadline) {
  const res = await postRpc('SearchSuggestions', { 1: keyword, 2: 10, 3: 10, 4: [code], 5: { 1: 1 } }, deadline);
  const out = [];
  for (const item of res['1'] || []) {
    if (!item['1']) continue;
    const range = (item['1']['4'] && item['1']['4']['2']) || {};
    out.push({
      name: item['1']['1'],
      id: item['1']['2'],
      adCount: Math.round((parseInt(range['1'] || '0', 10) + parseInt(range['2'] || '0', 10)) / 2)
    });
  }
  return out.sort((a, b) => b.adCount - a.adCount).slice(0, 5);
}

function parseAd(a) {
  const previewUrl = (a['3'] && a['3']['1'] && a['3']['1']['4']) || null;
  const imageHtml = (a['3'] && a['3']['3'] && a['3']['3']['2']) || null;
  let type = a['4'] === 1 ? 'image' : a['4'] === 2 ? 'video' : 'other';
  // 투명성 센터는 정적 배너도 video 로 분류하는 경우가 많다. previewUrl 없이 imageHtml 만 있으면 이미지.
  if (type === 'video' && !previewUrl && imageHtml) type = 'image';
  const img = imageHtml && imageHtml.match(/src="([^"]+)"/);
  return {
    advertiserId: a['1'],
    advertiserName: a['12'] || '',
    creativeId: a['2'],
    type,
    firstSeen: a['6'] && a['6']['1'] ? parseInt(a['6']['1'], 10) : null,
    lastSeen: a['7'] && a['7']['1'] ? parseInt(a['7']['1'], 10) : null,
    previewUrl,
    image: img ? img[1] : null
  };
}

async function googleAds({ query, region = 'KR', cursor, advertiserIds }) {
  const deadline = Date.now() + FUNCTION_DEADLINE_MS;
  // 조회마다 새 IP 로 시작 — 같은 IP 에 요청이 쌓이면 구글 차단이 빨리 온다
  rotateProxy();
  const code = REGION_CODES[region] || REGION_CODES.KR;
  const isDomain = looksLikeDomain(query);
  let advertisers = [];
  let filter;

  if (isDomain) {
    filter = { 8: [code], 12: { 1: normalizeDomain(query), 2: true } };
  } else {
    if (!advertiserIds || !advertiserIds.length) {
      advertisers = await searchAdvertisers(query, code, deadline);
      advertiserIds = advertisers.map(a => a.id);
    }
    if (!advertiserIds.length) return { mode: 'advertiser', advertisers: [], advertiserIds: [], ads: [], cursor: null };
    filter = { 8: [code], 12: { 1: '', 2: true }, 13: { 1: advertiserIds } };
  }

  const ads = [];
  const seen = new Set();
  let next = cursor || null;
  let partial = false;
  do {
    const payload = { 2: PAGE_SIZE, 3: filter, 7: { 1: 1, 2: 0, 3: code } };
    if (next) payload['4'] = next;
    let res;
    try {
      res = await postRpc('SearchCreatives', payload, deadline);
    } catch (e) {
      // 이미 받은 페이지가 있으면 버리지 않고 돌려준다.
      if (ads.length) { partial = true; break; }
      throw e;
    }
    for (const raw of res['1'] || []) {
      if (seen.has(raw['2'])) continue;
      seen.add(raw['2']);
      ads.push(parseAd(raw));
    }
    next = res['2'] || null;
  } while (next && deadline - Date.now() > 3500);

  return { mode: isDomain ? 'domain' : 'advertiser', advertisers, advertiserIds: advertiserIds || [], ads, cursor: next, partial };
}

// ---- 영상 광고 → YouTube ID · 광고 문구 추출 ----

const YT_ID_PATTERNS = [
  /videoId\\x27:\s*\\x27([a-zA-Z0-9_-]{11})\\x27/,
  /videoId['"]?\s*[:=]\s*['"]([a-zA-Z0-9_-]{11})['"]/,
  /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/
];

function unescapeJs(s) {
  return s
    .replace(/\\x27/g, "'").replace(/\\x22/g, '"').replace(/\\x3d/gi, '=')
    .replace(/\\x2f/gi, '/').replace(/\\x3a/gi, ':').replace(/\\x26/gi, '&')
    .replace(/\\u003d/gi, '=').replace(/\\\\n/g, '\n').replace(/\\n/g, ' ').trim();
}

function extractField(text, key) {
  const m = text.match(new RegExp(`\\\\x27${key}\\\\x27:\\s*\\\\x27((?:[^\\\\]|\\\\(?!x27))*?)\\\\x27`));
  return m ? unescapeJs(m[1]) || null : null;
}

// SSRF 방지: 투명성 센터가 내려준 구글 광고 호스트만 허용
function isAllowedPreview(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && /(^|\.)(googleusercontent|googlesyndication|doubleclick)\.(com|net)$/.test(u.hostname);
  } catch { return false; }
}

async function extractOne(ad) {
  if (!ad.previewUrl || !isAllowedPreview(ad.previewUrl)) return { creativeId: ad.creativeId };
  try {
    const res = await fetch(ad.previewUrl, {
      headers: {
        'User-Agent': UA_POOL[0],
        Accept: '*/*',
        'Accept-Language': 'ko-KR,ko;q=0.9',
        Referer: `${ATC_BASE}/`,
        'Sec-Fetch-Dest': 'script',
        'Sec-Fetch-Mode': 'no-cors',
        'Sec-Fetch-Site': 'cross-site'
      },
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return { creativeId: ad.creativeId };
    const text = await res.text();
    let youtubeId = null;
    for (const re of YT_ID_PATTERNS) { const m = text.match(re); if (m) { youtubeId = m[1]; break; } }
    return {
      creativeId: ad.creativeId,
      youtubeId,
      headline: extractField(text, 'headline'),
      longHeadline: extractField(text, 'longHeadline'),
      description: extractField(text, 'description')
    };
  } catch {
    return { creativeId: ad.creativeId };
  }
}

async function youtubeStats(ids) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key || !ids.length) return {};
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('part', 'snippet,statistics');
  url.searchParams.set('id', ids.slice(0, 50).join(','));
  url.searchParams.set('key', key);
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) throw new Error(`YouTube API ${res.status}`);
  const data = await res.json();
  const out = {};
  for (const v of data.items || []) {
    out[v.id] = {
      title: v.snippet.title,
      publishedAt: v.snippet.publishedAt.slice(0, 10),
      views: parseInt(v.statistics.viewCount || '0', 10),
      likes: parseInt(v.statistics.likeCount || '0', 10),
      thumbnail: (v.snippet.thumbnails && (v.snippet.thumbnails.medium || v.snippet.thumbnails.default) || {}).url || ''
    };
  }
  return out;
}

async function enrich({ ads }) {
  const list = (ads || []).slice(0, 15);
  const infos = await Promise.all(list.map(extractOne));
  const ids = [...new Set(infos.map(i => i.youtubeId).filter(Boolean))];
  let stats = {};
  let ytError = null;
  try { stats = await youtubeStats(ids); } catch (e) { ytError = e.message; }
  return {
    hasYoutubeKey: !!process.env.YOUTUBE_API_KEY,
    ytError,
    items: infos.map(i => ({ ...i, yt: i.youtubeId ? stats[i.youtubeId] || null : null }))
  };
}

// ---- 메타 광고 라이브러리 ----

function metaLibraryUrl(query, region) {
  const p = new URLSearchParams({ active_status: 'active', ad_type: 'all', country: region, q: query, search_type: 'keyword_unordered', media_type: 'all' });
  return `https://www.facebook.com/ads/library/?${p}`;
}

async function metaAds({ query, region = 'KR' }) {
  const libraryUrl = metaLibraryUrl(query, region);
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return { needToken: true, libraryUrl, ads: [] };
  const url = new URL('https://graph.facebook.com/v23.0/ads_archive');
  url.searchParams.set('search_terms', query);
  url.searchParams.set('ad_reached_countries', JSON.stringify([region]));
  url.searchParams.set('ad_active_status', 'ACTIVE');
  url.searchParams.set('ad_type', 'ALL');
  url.searchParams.set('limit', '50');
  url.searchParams.set('fields', 'id,page_id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_snapshot_url,ad_delivery_start_time,publisher_platforms');
  url.searchParams.set('access_token', token);
  const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
  const data = await res.json();
  if (!res.ok) return { libraryUrl, ads: [], error: (data.error && data.error.message) || `Graph API ${res.status}` };
  return {
    libraryUrl,
    ads: (data.data || []).map(a => ({
      id: a.id,
      pageName: a.page_name || '',
      body: (a.ad_creative_bodies || [])[0] || '',
      title: (a.ad_creative_link_titles || [])[0] || '',
      snapshotUrl: a.ad_snapshot_url || null,
      startTime: a.ad_delivery_start_time || null,
      platforms: a.publisher_platforms || []
    }))
  };
}

exports.handler = async function(event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let input;
  try { input = JSON.parse(event.body || '{}'); } catch { return reply(400, { error: '잘못된 요청' }); }
  const region = REGION_CODES[input.region] ? input.region : 'KR';

  try {
    if (input.action === 'google') {
      const query = String(input.query || '').trim().slice(0, 100);
      if (!query) return reply(400, { error: '브랜드명 또는 도메인을 입력하세요.' });
      return reply(200, await googleAds({ query, region, cursor: input.cursor, advertiserIds: input.advertiserIds }));
    }
    if (input.action === 'enrich') return reply(200, await enrich({ ads: input.ads }));
    if (input.action === 'meta') {
      const query = String(input.query || '').trim().slice(0, 100);
      if (!query) return reply(400, { error: '검색어를 입력하세요.' });
      return reply(200, await metaAds({ query, region }));
    }
    return reply(400, { error: '알 수 없는 action' });
  } catch (e) {
    if (e instanceof BotChallengeError) {
      return reply(429, {
        error: 'bot_challenge',
        message: process.env.PROXY_URL
          ? `구글이 요청을 차단했습니다. 프록시 IP를 ${MAX_ROTATIONS}회 바꿔 다시 시도했지만 모두 막혔습니다. 1시간 후 다시 조회하세요.`
          : '구글이 요청을 차단했습니다. 1~3시간 후 다시 시도하거나 Netlify 환경변수에 PROXY_URL(한국 가정용 프록시)을 설정하세요.'
      });
    }
    if (e instanceof ProxyAuthError) {
      return reply(502, {
        error: 'proxy_auth',
        message: '프록시 인증 실패(407). Netlify 환경변수 PROXY_URL의 아이디 · 비밀번호를 확인하세요.'
      });
    }
    if (e instanceof RetryableError && process.env.PROXY_URL) {
      return reply(502, {
        error: 'proxy_network',
        message: `프록시를 통한 연결이 ${MAX_ROTATIONS + 1}회 모두 실패했습니다. PROXY_URL의 주소 · 포트와 IPRoyal 잔여 용량을 확인하세요. (${e.message})`
      });
    }
    return reply(500, { error: e.message });
  }
};
