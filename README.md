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
Netlify 환경변수 입력 없이 휴대폰 화면에서 전부 설정합니다.

1. 휴대폰으로 대시보드 주소 뒤에 `/weather.html` 붙여 접속 (예: `https://○○○.netlify.app/weather.html`)
2. 화면 1~5번을 위에서부터 순서대로 진행
   - 1번 비밀번호: 처음 입력한 값이 등록됨
   - 2번 창고 위치: 창고에 서서 [지금 내 위치를 창고로 저장]
   - 3번 카카오 앱: 화면 안내대로 만들고 REST API 키 붙여넣기 (도메인·Redirect URI는 [복사] 버튼)
   - 4번 [카카오톡 연결] → 동의
   - 5번 [지금 테스트 발송]

판정 기준: 강수확률 60% 이상 또는 강수량 5mm 이상 = 비, 최대풍속 10m/s 이상 = 강풍.
Netlify 환경변수 `ALERT_SECRET`, `KAKAO_REST_API_KEY`, `KAKAO_CLIENT_SECRET`, `WAREHOUSE_LAT`/`WAREHOUSE_LON`, `WAREHOUSE_NAME`을 넣으면 화면 값보다 우선합니다 (좌표는 화면 저장값 우선).

### 수정 방법
- `index.html` 파일 수정 후 GitHub에 업로드하면 자동 배포
- 30초 안에 수강생 화면에 반영


### 5단계. 릴스 다운로더 설정
같은 [Environment variables] 화면에서 아래 키 중 **1개**를 추가 → [Trigger deploy]

| Key | 용도 | 발급 |
|---|---|---|
| `ELEVENLABS_API_KEY` | 릴스 대본 추출 (권장) | elevenlabs.io → 프로필 → API Keys → [Create] (Speech to Text 권한) |
| `OPENAI_API_KEY` | ElevenLabs가 없을 때 대신 사용 | platform.openai.com → API keys |

**사용법**
1. 대시보드 → [릴스 다운로더] → 릴스 URL 붙여넣기 → (선택) 내 상품 입력 → [처리 시작]
2. 약 15~25초 뒤 완료: 원문 대본 · 한글 번역 · 후킹 분석 · 내 상품용 변형 대본 3개
3. [릴스 다운로드] = 영상 열기 (휴대폰은 길게 눌러 저장) / [시트용 복사] = 구글 시트에 그대로 붙여넣기 / [CSV 다운로드] = 최근 50개 한 번에
4. 처리 기록은 이 브라우저에만 저장됩니다 (PC · 휴대폰 기록 따로)

**실패할 때**
- `인스타가 Netlify 서버 IP를 막았습니다` → 4단계의 `PROXY_URL` 설정 (경쟁사 광고 추적과 공용)
- 그래도 안 되면 PC용 `reels-tool/` (로그인 쿠키 사용, 차단에 가장 강함) 사용
- 90초 넘는 릴스는 10초 제한 때문에 실패할 수 있습니다


### 6단계. 콘텐츠 공장 (숏폼 대본 자동 생성 · 승인함)
추가 설정 없음. `ANTHROPIC_API_KEY`와 날씨 알림 비밀번호(/weather.html에서 등록)를 그대로 씁니다.

**동작**
- 매일 06:00(한국시간) 피부관리 · 살림꿀팁 · 쿠팡꿀템 대본을 1개씩 자동 생성 → 승인함에 저장
- 카카오톡이 연결돼 있으면(/weather.html) "대본 3개 승인 대기" 알림
- 대본: 첫 3초 후킹, 장면별 촬영 지시 · 자막 · 멘트, CTA, 캡션, 해시태그 5개, 광고 표현 점검
- 같은 틀 반복을 막기 위해 날짜 · 주제마다 구조 7종(비교 반전, 실수 TOP3, 전후 비교 등)을 돌려 쓰고, 최근 14일 제목과 겹치지 않게 생성

**사용법**
1. 대시보드 → [콘텐츠 공장 · 승인함] → 관리자 비밀번호 입력 → [불러오기]
2. 대본마다 [승인] / [다시 생성] / [반려]
3. 승인한 대본만 PC 작업기가 가져가 영상으로 만듭니다 (작업기는 다음 단계에서 설치)
4. [이번 주 소재 · 상품 메모]에 실제 판매 상품을 적으면 쿠팡꿀템 대본에 우선 반영 (메모가 없으면 상품명은 [상품명]으로 비워둠)

## 파일 구조
```
coupang-dashboard/
├── index.html              ← 대시보드 메인 파일 (여기만 수정)
├── weather.html            ← 창고 날씨 알림 연결·테스트 화면
├── netlify.toml            ← Netlify 설정 (수정 불필요)
├── netlify/
│   └── functions/
│       ├── chat.js         ← AI 분석 함수 (수정 불필요)
│       ├── ads.js          ← 경쟁사 광고 수집 함수 (수정 불필요)
│       ├── weather-alert.js ← 창고 날씨 알림 (매일 07:00 자동)
│       ├── weather-test.js ← 날씨 알림 미리보기/즉시발송
│       ├── weather-setup.js ← 설정 화면 저장
│       └── kakao-auth.js   ← 카카오톡 최초 연결
│   └── lib/weather-alert.js ← 날씨 판정·메시지 문구
├── package.json            ← 프록시용 라이브러리 (수정 불필요)
└── README.md
```
