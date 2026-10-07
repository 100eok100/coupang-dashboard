# 릴스 다운로더 — 백억상사

릴스 URL만 넣으면 아래 4가지를 자동으로 처리합니다.
1. 영상 저장 (`output/<ID>/video.mp4`)
2. 대본 추출 (`script.txt`, 영어·한국어 모두 됨)
3. 한글 번역 + 후킹 분석 + 우리 상품에 쓸 변형 대본 3개 (`korean.txt`)
4. 결과표 누적 (`output/reels.csv` → 구글 시트 [파일 → 가져오기]로 업로드)

## 설치 (최초 1회, 10분)
1. python.org에서 Python 3.11 이상 설치 (Windows는 설치할 때 "Add to PATH" 체크)
2. 이 폴더에서 터미널 열기
3. `pip install -r requirements.txt`
4. 번역·분석 기능을 쓰려면 API 키를 설정합니다 (대시보드에서 쓰는 키와 같은 키)
   - Mac: `export ANTHROPIC_API_KEY=sk-ant-...`
   - Windows: `set ANTHROPIC_API_KEY=sk-ant-...`

## 사용
```
python reels.py https://www.instagram.com/reel/XXXX/
python reels.py --file urls.txt              # 한 줄에 URL 1개씩, 한 번에 처리
python reels.py --file urls.txt --cookies chrome   # 실패하면 크롬 로그인 정보로 재시도
```
- 처음 1회는 음성 인식 모델(약 500MB)을 내려받느라 1~2분 걸립니다
- 30초 릴스 1개를 처리하는 데 약 30~60초 걸립니다

## 사용 규칙
- 다운받은 영상은 **분석용**입니다. 남의 영상을 그대로 다시 올리면 저작권 신고가 들어오고 계정이 정지될 수 있습니다
- 가져가는 것은 **구조(후킹 → 전개 → CTA)** 뿐이고, 촬영은 우리 상품으로 새로 합니다
