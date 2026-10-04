# 쿠팡 로켓그로스 셀러 대시보드 — 백억상사

## 배포 순서

### 1단계. GitHub 업로드
1. github.com 접속 → 로그인
2. 우측 상단 [+] → [New repository]
3. Repository name: `coupang-dashboard`
4. Public 선택 → [Create repository]
5. 이 폴더 전체 파일을 GitHub에 업로드

### 2단계. Netlify 배포
1. netlify.com 접속 → 로그인
2. [Add new site] → [Import an existing project]
3. [GitHub] 선택 → `coupang-dashboard` 저장소 선택
4. Build settings는 그대로 → [Deploy site]

### 3단계. API 키 설정 (중요)
1. Netlify 대시보드 → [Site configuration] → [Environment variables]
2. [Add a variable] 클릭
3. Key: `ANTHROPIC_API_KEY`
4. Value: Anthropic API 키 입력 (console.anthropic.com에서 발급)
5. [Save] → [Trigger deploy] → [Deploy site]

### 4단계. 경쟁사 광고 추적 설정 (선택 · 권장)
같은 [Environment variables] 화면에서 아래 키를 추가 → [Trigger deploy]

| Key | 없으면 | 발급 |
|---|---|---|
| `YOUTUBE_API_KEY` | 영상 조회수 · 주력/상승세/급등 배지 안 나옴 | Google Cloud Console → YouTube Data API v3 사용 설정 → API 키 (무료, 일 10,000 유닛) |
| `PROXY_URL` | 구글이 Netlify 서버 IP를 차단하면 수집 실패 | 한국 가정용 프록시 (예: `http://user:pass_country-kr@geo.iproyal.com:12321`) |
| `META_ACCESS_TOKEN` | 메타 광고는 [메타 광고 라이브러리] 링크로만 확인 | Meta for Developers → `ads_read` 권한 토큰 (신원 인증 1~3일) |

**동작 방식**
- 구글 광고 투명성 센터 공개 데이터를 수집합니다 (브랜드명 → 광고주 상위 5곳, 도메인 → 해당 도메인 광고)
- 1회 호출에 약 40~120개 수집, [더 불러오기]로 이어서 수집
- `PROXY_URL` 설정 시 구글이 차단하면 프록시 IP를 바꿔 최대 3회 자동 재시도 (10초 안에서)
- 오류 문구: `프록시 인증 실패(407)` → 아이디·비밀번호 확인 / `프록시를 통한 연결이 ... 실패` → 주소·포트·잔여 용량 확인
- 30일 이상 집행 = 검증 소재. [AI 분석 → 쿠팡 적용]이 후킹 문구 · 검색어 · 오늘 할 일로 변환
- 조회수 추이 배지는 같은 브랜드를 매일 1회 불러와야 쌓입니다 (브라우저에 저장)
- 수집 로직 출처: [chonamgyu/mav-ai](https://github.com/chonamgyu/mav-ai) (MIT License)

### 5단계. 울산 창고 날씨 카카오톡 알림 (선택)
매일 07:00(한국시간) 카카오톡 "나와의 채팅"으로 오늘·내일 날씨 + 7일 비 예보가 옵니다.

1. developers.kakao.com → [내 애플리케이션] → 앱 생성
2. [앱 설정 → 플랫폼 → Web] 사이트 도메인에 Netlify 주소 등록
3. [카카오 로그인] 활성화 ON → Redirect URI에 `https://<Netlify주소>/.netlify/functions/kakao-auth` 등록
4. [카카오 로그인 → 동의항목] "카카오톡 메시지 전송" → 선택 동의
5. Netlify 환경변수 등록 → [Trigger deploy]

| Key | 값 |
|---|---|
| `KAKAO_REST_API_KEY` | [앱 키]의 REST API 키 |
| `ALERT_SECRET` | 아무 비밀번호 (예: baekeok2026) |
| `KAKAO_CLIENT_SECRET` | 카카오 앱에서 Client Secret을 켠 경우만 |
| `WAREHOUSE_LAT` / `WAREHOUSE_LON` | 창고 위도/경도 (없으면 울산 시내 기준) |

6. 휴대폰에서 `https://<Netlify주소>/.netlify/functions/kakao-auth?key=<ALERT_SECRET>` 접속 → 동의 → [테스트 발송]
7. 미리보기만: `/.netlify/functions/weather-test?key=<ALERT_SECRET>`

판정 기준: 강수확률 60% 이상 또는 강수량 5mm 이상 = 비, 최대풍속 10m/s 이상 = 강풍.

### 수정 방법
- `index.html` 파일 수정 후 GitHub에 업로드하면 자동 배포
- 30초 안에 수강생 화면에 반영

## 파일 구조
```
coupang-dashboard/
├── index.html              ← 대시보드 메인 파일 (여기만 수정)
├── netlify.toml            ← Netlify 설정 (수정 불필요)
├── netlify/
│   └── functions/
│       ├── chat.js         ← AI 분석 함수 (수정 불필요)
│       ├── ads.js          ← 경쟁사 광고 수집 함수 (수정 불필요)
│       ├── weather-alert.js ← 창고 날씨 알림 (매일 07:00 자동)
│       ├── weather-test.js ← 날씨 알림 미리보기/즉시발송
│       └── kakao-auth.js   ← 카카오톡 최초 연결
│   └── lib/weather-alert.js ← 날씨 판정·메시지 문구
├── package.json            ← 프록시용 라이브러리 (수정 불필요)
└── README.md
```
