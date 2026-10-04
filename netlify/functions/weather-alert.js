// 울산 창고 날씨 알림 — 매일 아침 7시(한국시간) 자동 실행
// 실행 시각은 netlify.toml 의 schedule 에서 바꾼다 (UTC 기준, 한국시간 -9시간).

const { connectLambda } = require('@netlify/blobs');
const { runAlert } = require('../lib/weather-alert');

exports.handler = async function(event) {
  connectLambda(event);
  try {
    await runAlert();
    return { statusCode: 200, body: 'sent' };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: err.message };
  }
};
