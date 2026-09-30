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
- 30일 이상 집행 = 검증 소재. [AI 분석 → 쿠팡 적용]이 후킹 문구 · 검색어 · 오늘 할 일로 변환
- 조회수 추이 배지는 같은 브랜드를 매일 1회 불러와야 쌓입니다 (브라우저에 저장)
- 수집 로직 출처: [chonamgyu/mav-ai](https://github.com/chonamgyu/mav-ai) (MIT License)

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
│       └── ads.js          ← 경쟁사 광고 수집 함수 (수정 불필요)
├── package.json            ← 프록시용 라이브러리 (수정 불필요)
└── README.md
```
