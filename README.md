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
│       └── chat.js         ← API 서버 함수 (수정 불필요)
└── README.md
```
