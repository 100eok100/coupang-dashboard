"""릴스 다운로더 — 백억상사

인스타그램 릴스 URL → 영상 저장 → 영어/원문 대본 추출 → 한글 번역 + 후킹 분석 → CSV 기록

사용법:
  python reels.py https://www.instagram.com/reel/XXXX/
  python reels.py --file urls.txt
  python reels.py --file urls.txt --cookies chrome   (로그인 필요 시)

결과: output/<릴스ID>/video.mp4, script.txt, korean.txt
     output/reels.csv  (구글 시트에 [파일 → 가져오기]로 바로 업로드)
"""
import argparse
import csv
import os
import sys
from datetime import datetime
from pathlib import Path

import yt_dlp

OUT = Path(__file__).parent / "output"
CSV_PATH = OUT / "reels.csv"
CSV_HEADER = ["처리일시", "URL", "계정", "조회수", "좋아요", "댓글", "길이(초)", "캡션", "원문 대본", "한글 번역", "후킹 분석"]

ANALYZE_PROMPT = """아래는 인스타그램 릴스 대본이다. 쇼핑몰 계정 운영자가 벤치마킹용으로 본다.
아래 3개 섹션을 한국어로, 섹션 제목 그대로 작성하라. 다른 말은 쓰지 마라.

[한글 번역]
대본 전체를 자연스러운 한국어로 번역 (줄 단위 유지)

[후킹 분석]
- 첫 3초 후킹 문장:
- 구조 (예: 문제제기 → 비교 → 반전 → CTA):
- 저장/공유를 부른 포인트:

[내 쇼핑몰용 변형 대본 3개]
같은 구조로, 우리 상품에 바로 쓸 수 있게 15초 분량 한국어 대본 3개

캡션: {caption}

대본:
{script}"""


def download(url, cookies_browser=None):
    opts = {
        "outtmpl": str(OUT / "%(id)s" / "video.%(ext)s"),
        "format": "best[ext=mp4]/best",
        "quiet": True,
        "no_warnings": True,
    }
    if cookies_browser:
        opts["cookiesfrombrowser"] = (cookies_browser,)
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=True)
        return info, Path(ydl.prepare_filename(info))


_whisper = None


def transcribe(video_path):
    global _whisper
    if _whisper is None:
        from faster_whisper import WhisperModel
        # small = CPU에서 30초 릴스 기준 약 20~40초. 정확도 더 필요하면 "medium"
        _whisper = WhisperModel("small", device="cpu", compute_type="int8")
    segments, _ = _whisper.transcribe(str(video_path), vad_filter=True)
    return "\n".join(s.text.strip() for s in segments if s.text.strip())


def analyze(script, caption):
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return "", "(ANTHROPIC_API_KEY 미설정 — 번역/분석 생략)"
    import anthropic
    client = anthropic.Anthropic()
    msg = client.messages.create(
        model="claude-sonnet-5-5",
        max_tokens=3000,
        messages=[{"role": "user", "content": ANALYZE_PROMPT.format(caption=caption or "(없음)", script=script or "(음성 없음)")}],
    )
    text = "".join(b.text for b in msg.content if b.type == "text")
    korean, _, rest = text.partition("[후킹 분석]")
    return korean.replace("[한글 번역]", "").strip(), ("[후킹 분석]" + rest).strip()


def append_csv(row):
    new = not CSV_PATH.exists()
    with open(CSV_PATH, "a", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        if new:
            w.writerow(CSV_HEADER)
        w.writerow(row)


def process(url, cookies_browser=None):
    print(f"\n[1/3] 다운로드: {url}")
    info, video = download(url, cookies_browser)
    folder = video.parent
    caption = (info.get("description") or "").strip()

    print("[2/3] 대본 추출 중...")
    script = transcribe(video)
    (folder / "script.txt").write_text(script, encoding="utf-8")

    print("[3/3] 번역 + 후킹 분석 중...")
    korean, hook = analyze(script, caption)
    (folder / "korean.txt").write_text(f"{korean}\n\n{hook}", encoding="utf-8")

    append_csv([
        datetime.now().strftime("%Y-%m-%d %H:%M"),
        url,
        info.get("uploader") or info.get("channel") or "",
        info.get("view_count") or "",
        info.get("like_count") or "",
        info.get("comment_count") or "",
        round(info.get("duration") or 0),
        caption,
        script,
        korean,
        hook,
    ])
    print(f"완료 → {folder}")


def main():
    p = argparse.ArgumentParser(description="인스타 릴스 다운로드 + 대본 추출 + 한글 번역")
    p.add_argument("urls", nargs="*", help="릴스 URL (여러 개 가능)")
    p.add_argument("--file", help="URL 목록 txt (한 줄에 1개)")
    p.add_argument("--cookies", help="로그인 쿠키를 가져올 브라우저 (chrome, edge, safari, firefox)")
    a = p.parse_args()

    urls = list(a.urls)
    if a.file:
        urls += [l.strip() for l in Path(a.file).read_text(encoding="utf-8").splitlines() if l.strip()]
    if not urls:
        p.print_help()
        sys.exit(1)

    OUT.mkdir(exist_ok=True)
    ok = fail = 0
    for url in urls:
        try:
            process(url, a.cookies)
            ok += 1
        except Exception as e:
            fail += 1
            print(f"실패: {url}\n  → {e}\n  → 로그인 필요 릴스면 --cookies chrome 추가")
    print(f"\n성공 {ok}개 / 실패 {fail}개 — 결과표: {CSV_PATH}")


if __name__ == "__main__":
    main()
