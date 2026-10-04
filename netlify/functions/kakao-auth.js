// 카카오톡 연결 (최초 1회) — /weather.html 의 [카카오톡 연결] 버튼이 여기로 보낸다.
// 카카오 앱의 Redirect URI 에 https://<사이트주소>/.netlify/functions/kakao-auth 를 등록해야 한다.

const crypto = require('crypto');
const { connectLambda } = require('@netlify/blobs');
const { loadConfig, requestToken, saveRefreshToken } = require('../lib/weather-alert');

function page(statusCode, message) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<body style="font-family:sans-serif;padding:24px 16px;line-height:1.6;font-size:16px">${message}` +
      `<p><a href="/weather.html">설정 화면으로 돌아가기</a></p></body>`
  };
}

// 비밀번호를 카카오로 그대로 넘기지 않도록 해시로 state 를 만든다.
const stateOf = secret => crypto.createHash('sha256').update('kakao-auth:' + secret).digest('hex').slice(0, 24);

exports.handler = async function(event) {
  connectLambda(event);
  const q = event.queryStringParameters || {};
  const cfg = await loadConfig();
  const redirectUri = `${process.env.URL}/.netlify/functions/kakao-auth`;

  if (!cfg.secret || !cfg.kakaoKey) {
    return page(500, '비밀번호와 카카오 REST API 키를 설정 화면에서 먼저 저장하세요.');
  }

  // 1단계: 카카오 로그인으로 보낸다.
  if (!q.code) {
    if (q.error) return page(400, `카카오 동의가 취소됐습니다 (${q.error_description || q.error}).`);
    if (q.key !== cfg.secret) return page(403, '비밀번호가 틀렸습니다.');
    const url = 'https://kauth.kakao.com/oauth/authorize?' + new URLSearchParams({
      client_id: cfg.kakaoKey,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'talk_message',
      state: stateOf(cfg.secret)
    });
    return { statusCode: 302, headers: { Location: url }, body: '' };
  }

  // 2단계: 카카오가 돌려준 code 로 토큰을 받아 저장한다.
  if (q.state !== stateOf(cfg.secret)) return page(403, '잘못된 요청입니다. 설정 화면에서 다시 연결하세요.');
  try {
    const data = await requestToken(cfg, { grant_type: 'authorization_code', redirect_uri: redirectUri, code: q.code });
    await saveRefreshToken(data.refresh_token);
    return page(200, '<b>카카오톡 연결 완료.</b><br>매일 아침 7시 "나와의 채팅"으로 창고 날씨가 옵니다.<br>' +
      '설정 화면에서 [지금 테스트 발송]을 눌러 바로 확인하세요.');
  } catch (err) {
    return page(500, err.message);
  }
};
