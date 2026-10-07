// 울산 창고 날씨 알림 공용 로직
// 날씨: Open-Meteo (키 불필요) · 발송: 카카오톡 "나에게 보내기" (talk_message 권한)
//
// 설정은 /weather.html 화면에서 입력하면 Netlify Blobs 에 저장된다 (Netlify 환경변수 입력 불필요).
// 같은 이름의 환경변수가 있으면 키·비밀번호는 환경변수가 우선한다.
//   ALERT_SECRET           연결·테스트 화면 보호용 비밀번호
//   KAKAO_REST_API_KEY     카카오 디벨로퍼스 앱의 REST API 키
//   KAKAO_CLIENT_SECRET    앱에서 Client Secret 을 "사용함"으로 켰을 때만
//   WAREHOUSE_LAT/LON      창고 좌표 (화면에서 "현재 위치 저장"한 값이 우선, 둘 다 없으면 울산 시내)
//   WAREHOUSE_NAME         메시지 제목에 쓸 이름 (기본 "울산 창고")

const { getStore } = require('@netlify/blobs');

const DEFAULT_LAT = 35.5384;
const DEFAULT_LON = 129.3114;

// 판정 기준 (창고 입출고 기준)
const RAIN_PROB = 60;  // 강수확률 60% 이상이면 비
const RAIN_MM = 5;     // 또는 하루 강수량 5mm 이상이면 비
const WIND_MS = 10;    // 최대풍속 10m/s 이상이면 강풍

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

const WEATHER = [
  [[0], '맑음'], [[1, 2], '구름조금'], [[3], '흐림'], [[45, 48], '안개'],
  [[51, 53, 55, 56, 57], '이슬비'], [[61, 63, 65, 66, 67, 80, 81, 82], '비'],
  [[71, 73, 75, 77, 85, 86], '눈'], [[95, 96, 99], '뇌우']
];

function weatherLabel(code) {
  const hit = WEATHER.find(([codes]) => codes.includes(code));
  return hit ? hit[1] : '흐림';
}

function dayLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}/${d}(${DAYS[dow]})`;
}

async function fetchForecast(cfg) {
  const params = new URLSearchParams({
    latitude: cfg.lat,
    longitude: cfg.lon,
    daily: 'weather_code,precipitation_probability_max,precipitation_sum,temperature_2m_max,temperature_2m_min,wind_speed_10m_max',
    wind_speed_unit: 'ms',
    timezone: 'Asia/Seoul',
    forecast_days: '8'
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`날씨 조회 실패 (${res.status})`);
  const { daily } = await res.json();
  return daily.time.map((date, i) => {
    const prob = daily.precipitation_probability_max[i] ?? 0;
    const mm = Math.round((daily.precipitation_sum[i] ?? 0) * 10) / 10;
    const wind = Math.round(daily.wind_speed_10m_max[i] ?? 0);
    return {
      date,
      label: dayLabel(date),
      sky: weatherLabel(daily.weather_code[i]),
      prob,
      mm,
      min: Math.round(daily.temperature_2m_min[i]),
      max: Math.round(daily.temperature_2m_max[i]),
      wind,
      rain: prob >= RAIN_PROB || mm >= RAIN_MM,
      windy: wind >= WIND_MS
    };
  });
}

function action(day) {
  if (day.rain && day.windy) return '박스 실내 보관 · 방수비닐 이중포장 · 상차 시간 조정';
  if (day.rain) return '박스 실내 보관 · 상차 전 방수비닐 포장';
  if (day.windy) return '야외 적재 금지 · 파렛트 랩핑 고정';
  return '정상 입출고';
}

function dayLine(day) {
  return `${day.label} ${day.sky} 강수${day.prob}%·${day.mm}mm ${day.min}~${day.max}도 바람${day.wind}m/s\n→ ${action(day)}`;
}

// 카카오 텍스트 메시지는 200자 제한이라 [오늘·내일] / [주간] 2건으로 나눠 보낸다.
function buildMessages(days, name = '울산 창고') {
  const [today, tomorrow] = days;
  const daily = `[${name} 날씨]\n오늘 ${dayLine(today)}\n\n내일 ${dayLine(tomorrow)}`;

  const week = days.slice(1, 8).map(d =>
    `${d.label} ${d.rain ? '[비]' : d.windy ? '[강풍]' : d.sky} ${d.prob}% ${d.mm}mm`
  );
  const rainy = days.slice(1, 8).filter(d => d.rain).map(d => d.label);
  const summary = rainy.length ? `비 예상 ${rainy.length}일: 해당일 전날 발송 마감` : '7일간 비 없음: 정상 운영';
  const weekly = `[${name} 주간]\n${week.join('\n')}\n${summary}`;

  return [daily, weekly].map(t => t.slice(0, 200));
}

// ---- 설정 ----

function store() {
  return getStore('kakao');
}

async function savedConfig() {
  return (await store().get('config', { type: 'json' })) || {};
}

async function saveConfig(patch) {
  const next = { ...(await savedConfig()), ...patch };
  await store().setJSON('config', next);
  return next;
}

async function loadConfig() {
  const saved = await savedConfig();
  const env = process.env;
  return {
    secret: env.ALERT_SECRET || saved.secret || '',
    kakaoKey: env.KAKAO_REST_API_KEY || saved.kakaoKey || '',
    clientSecret: env.KAKAO_CLIENT_SECRET || saved.clientSecret || '',
    lat: saved.lat ?? (env.WAREHOUSE_LAT ? parseFloat(env.WAREHOUSE_LAT) : DEFAULT_LAT),
    lon: saved.lon ?? (env.WAREHOUSE_LON ? parseFloat(env.WAREHOUSE_LON) : DEFAULT_LON),
    locationSaved: saved.lat != null || !!env.WAREHOUSE_LAT,
    name: env.WAREHOUSE_NAME || '울산 창고',
    connected: !!(await store().get('refresh_token'))
  };
}

// ---- 카카오 토큰 ----

async function requestToken(cfg, body) {
  const form = new URLSearchParams({ client_id: cfg.kakaoKey, ...body });
  if (cfg.clientSecret) form.set('client_secret', cfg.clientSecret);
  const res = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: form
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`카카오 토큰 오류: ${data.error_description || data.error || res.status}`);
  return data;
}

async function saveRefreshToken(refreshToken) {
  await store().set('refresh_token', refreshToken);
}

async function accessToken(cfg) {
  const refresh = await store().get('refresh_token');
  if (!refresh) throw new Error('카카오 연결 안 됨: /weather.html 에서 [카카오톡 연결]을 먼저 누르세요');
  const data = await requestToken(cfg, { grant_type: 'refresh_token', refresh_token: refresh });
  // 만료 1개월 전부터 새 refresh_token 이 내려온다. 받으면 바로 교체해야 2개월 뒤에도 끊기지 않는다.
  if (data.refresh_token) await saveRefreshToken(data.refresh_token);
  return data.access_token;
}

async function sendKakao(cfg, texts) {
  const token = await accessToken(cfg);
  const link = process.env.URL || 'https://www.weather.go.kr';
  for (const text of texts) {
    const res = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
      },
      body: new URLSearchParams({
        template_object: JSON.stringify({
          object_type: 'text',
          text,
          link: { web_url: link, mobile_web_url: link }
        })
      })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(`카카오 발송 실패: ${data.msg || res.status}`);
    }
  }
}

async function runAlert({ send = true } = {}) {
  const cfg = await loadConfig();
  const days = await fetchForecast(cfg);
  const messages = buildMessages(days, cfg.name);
  if (send) await sendKakao(cfg, messages);
  return { messages, days };
}

module.exports = { runAlert, buildMessages, loadConfig, saveConfig, requestToken, saveRefreshToken, sendKakao };
