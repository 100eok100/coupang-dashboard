// 날씨 알림 수동 실행 (예약 함수는 주소로 직접 호출이 안 돼서 따로 둔다)
//   미리보기: /.netlify/functions/weather-test?key=비밀번호
//   즉시발송: /.netlify/functions/weather-test?key=비밀번호&send=1

const { connectLambda } = require('@netlify/blobs');
const { runAlert, loadConfig } = require('../lib/weather-alert');

function reply(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(body, null, 2) };
}

exports.handler = async function(event) {
  connectLambda(event);
  const q = event.queryStringParameters || {};
  const cfg = await loadConfig();
  if (!cfg.secret || q.key !== cfg.secret) return reply(403, { error: '비밀번호가 틀렸습니다' });
  try {
    const send = q.send === '1';
    const { messages } = await runAlert({ send });
    return reply(200, { sent: send, messages });
  } catch (err) {
    return reply(500, { error: err.message });
  }
};
