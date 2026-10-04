// 카카오톡 연결 (최초 1회)
//   /.netlify/functions/kakao-auth?key=ALERT_SECRET 접속 → 카카오 로그인·동의 → 연결 완료
// 카카오 앱의 Redirect URI 에 https://<사이트주소>/.netlify/functions/kakao-auth 를 등록해야 한다.

const { connectLambda } = require('@netlify/blobs');
const { requestToken, saveRefreshToken } = require('../lib/weather-alert');

function page(statusCode, message) {
  return {
    statusCode,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<body style="font-family:sans-serif;padding:24px;line-height:1.6">${message}</body>`
  };
}

exports.handler = async function(event) {
  const q = event.queryStringParameters || {};
  const secret = process.env.ALERT_SECRET;
  const redirectUri = `${process.env.URL}/.netlify/functions/kakao-auth`;

  if (!secret || !process.env.KAKAO_REST_API_KEY) {
    return page(500, 'Netlify 환경변수 KAKAO_REST_API_KEY, ALERT_SECRET 를 먼저 등록하세요.');
  }

  // 1단계: 카카오 로그인으로 보낸다. 비밀번호는 state 로 넘겨 돌아올 때 다시 확인한다.
  if (!q.code) {
    if (q.key !== secret) return page(403, '주소 끝의 key 값이 ALERT_SECRET 과 다릅니다.');
    const url = 'https://kauth.kakao.com/oauth/authorize?' + new URLSearchParams({
      client_id: process.env.KAKAO_REST_API_KEY,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'talk_message',
      state: secret
    });
    return { statusCode: 302, headers: { Location: url }, body: '' };
  }

  // 2단계: 카카오가 돌려준 code 로 토큰을 받아 저장한다.
  if (q.state !== secret) return page(403, '잘못된 요청입니다. 처음부터 다시 연결하세요.');
  connectLambda(event);
  try {
    const data = await requestToken({ grant_type: 'authorization_code', redirect_uri: redirectUri, code: q.code });
    await saveRefreshToken(data.refresh_token);
    return page(200, '<b>카카오톡 연결 완료.</b><br>내일 아침 7시부터 "나와의 채팅"으로 창고 날씨가 옵니다.<br>' +
      `지금 바로 받아보기: <a href="/.netlify/functions/weather-test?key=${encodeURIComponent(secret)}&send=1">테스트 발송</a>`);
  } catch (err) {
    return page(500, err.message);
  }
};
