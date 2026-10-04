// 울산 창고 날씨 알림 (구글 앱스 스크립트용)
// 매일 아침 7시대에 Gmail 로 오늘·내일·7일 비 예보를 보낸다. 카카오 연결 시 카카오톡 "나와의 채팅"으로도 보낸다.
//
// 처음 1회
//   1. script.google.com → 새 프로젝트 → 이 파일 전체 붙여넣기 → 저장
//   2. 위쪽 함수 선택에서 setup → [실행] → 권한 허용  (매일 발송 예약 + 테스트 메일 1통)
// 카카오톡도 받으려면 README 의 "카카오톡 추가" 순서대로 KAKAO_REST_API_KEY 를 넣고 웹 앱으로 배포한다.

// ===== 설정 (여기만 수정) =====
var NAME = '울산 창고';
var LAT = 35.5384;   // 창고 위도 (구글 지도에서 창고를 길게 누르면 나오는 첫 번째 숫자)
var LON = 129.3114;  // 창고 경도 (두 번째 숫자)
var SEND_HOUR = 7;   // 발송 시각 (7 = 오전 7시~8시 사이)
var KAKAO_REST_API_KEY = '';    // 카카오 앱 REST API 키 (카톡 안 쓰면 비워둠)
var KAKAO_CLIENT_SECRET = '';   // 카카오 앱에서 Client Secret 을 켰을 때만
// =============================

// 판정 기준 (창고 입출고 기준)
var RAIN_PROB = 60;  // 강수확률 60% 이상이면 비
var RAIN_MM = 5;     // 또는 하루 강수량 5mm 이상이면 비
var WIND_MS = 10;    // 최대풍속 10m/s 이상이면 강풍

var DAYS = ['일', '월', '화', '수', '목', '금', '토'];
var WEATHER = [
  [[0], '맑음'], [[1, 2], '구름조금'], [[3], '흐림'], [[45, 48], '안개'],
  [[51, 53, 55, 56, 57], '이슬비'], [[61, 63, 65, 66, 67, 80, 81, 82], '비'],
  [[71, 73, 75, 77, 85, 86], '눈'], [[95, 96, 99], '뇌우']
];

// ---- 처음 1회 실행 ----
function setup() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'dailyAlert') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailyAlert').timeBased().everyDays(1).atHour(SEND_HOUR).inTimezone('Asia/Seoul').create();
  dailyAlert();
  Logger.log('설정 완료: 매일 ' + SEND_HOUR + '시대 발송 예약, 테스트 메일 발송함');
}

// ---- 매일 실행 ----
function dailyAlert() {
  var days = fetchForecast();
  var messages = buildMessages(days);
  var subject = '[' + NAME + '] ' + headline(days);
  MailApp.sendEmail(Session.getEffectiveUser().getEmail(), subject, messages.join('\n\n'));
  if (kakaoConnected()) sendKakao(messages);
}

// ---- 날씨 ----
function weatherLabel(code) {
  for (var i = 0; i < WEATHER.length; i++) if (WEATHER[i][0].indexOf(code) >= 0) return WEATHER[i][1];
  return '흐림';
}

function dayLabel(iso) {
  var p = iso.split('-').map(Number);
  var dow = new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
  return p[1] + '/' + p[2] + '(' + DAYS[dow] + ')';
}

function fetchForecast() {
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + LAT + '&longitude=' + LON +
    '&daily=weather_code,precipitation_probability_max,precipitation_sum,temperature_2m_max,temperature_2m_min,wind_speed_10m_max' +
    '&wind_speed_unit=ms&timezone=Asia%2FSeoul&forecast_days=8';
  var d = JSON.parse(UrlFetchApp.fetch(url).getContentText()).daily;
  return d.time.map(function(date, i) {
    var prob = d.precipitation_probability_max[i] || 0;
    var mm = Math.round((d.precipitation_sum[i] || 0) * 10) / 10;
    var wind = Math.round(d.wind_speed_10m_max[i] || 0);
    return {
      label: dayLabel(date),
      sky: weatherLabel(d.weather_code[i]),
      prob: prob, mm: mm, wind: wind,
      min: Math.round(d.temperature_2m_min[i]),
      max: Math.round(d.temperature_2m_max[i]),
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
  return day.label + ' ' + day.sky + ' 강수' + day.prob + '%·' + day.mm + 'mm ' + day.min + '~' + day.max +
    '도 바람' + day.wind + 'm/s\n→ ' + action(day);
}

function headline(days) {
  var t = days[1];
  return '내일 ' + (t.rain ? '비 ' + t.prob + '% ' + t.mm + 'mm' : t.windy ? '강풍 ' + t.wind + 'm/s' : t.sky);
}

// 카카오 텍스트 메시지는 200자 제한이라 [오늘·내일] / [주간] 2건으로 나눈다.
function buildMessages(days) {
  var daily = '[' + NAME + ' 날씨]\n오늘 ' + dayLine(days[0]) + '\n\n내일 ' + dayLine(days[1]);
  var next = days.slice(1, 8);
  var week = next.map(function(d) {
    return d.label + ' ' + (d.rain ? '[비]' : d.windy ? '[강풍]' : d.sky) + ' ' + d.prob + '% ' + d.mm + 'mm';
  });
  var rainy = next.filter(function(d) { return d.rain; });
  var summary = rainy.length ? '비 예상 ' + rainy.length + '일: 해당일 전날 발송 마감' : '7일간 비 없음: 정상 운영';
  var weekly = '[' + NAME + ' 주간]\n' + week.join('\n') + '\n' + summary;
  return [daily, weekly].map(function(t) { return t.slice(0, 200); });
}

// ---- 카카오톡 (선택) ----
function props() { return PropertiesService.getScriptProperties(); }
function kakaoConnected() { return !!(KAKAO_REST_API_KEY && props().getProperty('KAKAO_REFRESH_TOKEN')); }
function redirectUri() { return ScriptApp.getService().getUrl(); }

function kakaoToken(params) {
  params.client_id = KAKAO_REST_API_KEY;
  if (KAKAO_CLIENT_SECRET) params.client_secret = KAKAO_CLIENT_SECRET;
  var res = UrlFetchApp.fetch('https://kauth.kakao.com/oauth/token', { method: 'post', payload: params, muteHttpExceptions: true });
  var data = JSON.parse(res.getContentText());
  if (res.getResponseCode() !== 200) throw new Error('카카오 토큰 오류: ' + (data.error_description || data.error));
  // 만료 1개월 전부터 새 refresh_token 이 내려온다. 받으면 바로 교체해야 계속 발송된다.
  if (data.refresh_token) props().setProperty('KAKAO_REFRESH_TOKEN', data.refresh_token);
  return data.access_token;
}

function sendKakao(texts) {
  var token = kakaoToken({ grant_type: 'refresh_token', refresh_token: props().getProperty('KAKAO_REFRESH_TOKEN') });
  texts.forEach(function(text) {
    var res = UrlFetchApp.fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
      method: 'post',
      headers: { Authorization: 'Bearer ' + token },
      payload: { template_object: JSON.stringify({
        object_type: 'text', text: text,
        link: { web_url: 'https://www.weather.go.kr', mobile_web_url: 'https://www.weather.go.kr' }
      }) },
      muteHttpExceptions: true
    });
    if (res.getResponseCode() !== 200) throw new Error('카카오 발송 실패: ' + res.getContentText());
  });
}

// 웹 앱 주소로 접속하면 카카오 연결 화면. 카카오가 code 를 붙여 다시 이 주소로 돌려보낸다.
function doGet(e) {
  var p = (e && e.parameter) || {};
  var html;
  if (!KAKAO_REST_API_KEY) {
    html = '코드 맨 위 KAKAO_REST_API_KEY 에 카카오 REST API 키를 넣고 저장 → [배포 → 배포 관리 → 새 버전]으로 다시 배포하세요.';
  } else if (p.code) {
    try {
      kakaoToken({ grant_type: 'authorization_code', redirect_uri: redirectUri(), code: p.code });
      sendKakao(buildMessages(fetchForecast()));
      html = '<b>카카오톡 연결 완료.</b><br>지금 테스트 메시지를 보냈습니다. 카카오톡 "나와의 채팅"을 확인하세요.<br>내일부터 매일 아침 Gmail과 카카오톡으로 함께 옵니다.';
    } catch (err) {
      html = '오류: ' + err.message;
    }
  } else {
    var url = 'https://kauth.kakao.com/oauth/authorize?client_id=' + encodeURIComponent(KAKAO_REST_API_KEY) +
      '&redirect_uri=' + encodeURIComponent(redirectUri()) + '&response_type=code&scope=talk_message';
    html = '<p>카카오 디벨로퍼스 Redirect URI 에 아래 주소를 등록했는지 확인하세요.</p>' +
      '<p style="word-break:break-all;background:#f2f1ee;padding:8px">' + redirectUri() + '</p>' +
      '<p><a target="_top" href="' + url + '" style="display:block;text-align:center;background:#FEE500;color:#000;padding:14px;border-radius:8px;text-decoration:none;font-weight:bold">카카오톡 연결하기</a></p>';
  }
  return HtmlService.createHtmlOutput('<div style="font-family:sans-serif;font-size:16px;line-height:1.6;padding:16px">' + html + '</div>')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setTitle('창고 날씨 알림');
}
