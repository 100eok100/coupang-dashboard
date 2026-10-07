// 콘텐츠 공장 — 매일 아침 6시(한국시간) 주제별 대본 생성 → 승인함 저장 → 카카오톡 알림
// 실행 시각은 netlify.toml 의 schedule 에서 바꾼다 (UTC 기준, 한국시간 -9시간).
// 카카오톡은 /weather.html 에서 연결해 둔 "나에게 보내기"를 같이 쓴다. 연결 전이면 알림만 건너뛴다.

const { connectLambda } = require('@netlify/blobs');
const { generateDay, summaryText } = require('../lib/factory');
const { loadConfig, sendKakao } = require('../lib/weather-alert');

exports.handler = async function(event) {
  connectLambda(event);
  try {
    const { day, errors } = await generateDay();
    if (errors.length) console.error('대본 생성 일부 실패', errors);
    const cfg = await loadConfig();
    if (cfg.connected && day.items.some(it => it.status === 'pending')) {
      await sendKakao(cfg, [summaryText(day)]);
    }
    return { statusCode: 200 };
  } catch (err) {
    console.error('콘텐츠 공장 실패', err);
    return { statusCode: 500 };
  }
};
