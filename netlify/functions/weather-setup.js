// /weather.html 설정 저장
//   GET  → 현재 상태 (무엇이 저장됐는지만, 값은 숨김)
//   POST {key, kakaoKey?, clientSecret?, lat?, lon?}
//        비밀번호가 아직 없으면 처음 보낸 key 가 비밀번호로 등록된다.

const { connectLambda } = require('@netlify/blobs');
const { loadConfig, saveConfig } = require('../lib/weather-alert');

function reply(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body) };
}

function status(cfg) {
  return {
    hasSecret: !!cfg.secret,
    hasKakaoKey: !!cfg.kakaoKey,
    locationSaved: cfg.locationSaved,
    connected: cfg.connected
  };
}

exports.handler = async function(event) {
  connectLambda(event);
  let cfg = await loadConfig();
  if (event.httpMethod === 'GET') return reply(200, status(cfg));
  if (event.httpMethod !== 'POST') return reply(405, { error: 'Method Not Allowed' });

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return reply(400, { error: '잘못된 요청' }); }
  const key = String(body.key || '').trim();
  if (key.length < 4) return reply(400, { error: '비밀번호는 4자 이상' });

  const patch = {};
  if (!cfg.secret) patch.secret = key;
  else if (key !== cfg.secret) return reply(403, { error: '비밀번호가 틀렸습니다' });

  if (body.kakaoKey) patch.kakaoKey = String(body.kakaoKey).trim();
  if (body.clientSecret) patch.clientSecret = String(body.clientSecret).trim();
  if (body.lat != null && body.lon != null) {
    const lat = Number(body.lat), lon = Number(body.lon);
    // 대한민국 범위 밖 좌표는 거부 (GPS 오작동 방지)
    if (!(lat > 33 && lat < 39 && lon > 124 && lon < 132)) return reply(400, { error: '한국 밖 좌표입니다. 위치를 다시 잡으세요' });
    patch.lat = Math.round(lat * 10000) / 10000;
    patch.lon = Math.round(lon * 10000) / 10000;
  }

  await saveConfig(patch);
  cfg = await loadConfig();
  return reply(200, { ...status(cfg), lat: cfg.lat, lon: cfg.lon });
};
