#!/usr/bin/env python3
"""원천징수영수증 징수의무자 서명란에 직인 이미지를 합성한다.

사용법:
  python3 stamp_pdf.py <직인이미지.png> [출력.pdf]

직인 이미지 요건: 배경 투명 PNG, 정사각형, 300dpi 이상 권장.
"""
import sys
import pymupdf

SRC = "/root/.claude/uploads/6233c167-f7c9-59a0-a957-d00fe5d6e2c1/49b21a9e-_______________.pdf"

# 직인 크기(pt) 및 중심 좌표 — 징수의무자 회사명 우측, "(서명또는인)" 앞
SEAL_MM = 14.0                 # 지름 14mm (법인 사용인감 표준)
SEAL_PT = SEAL_MM * 72 / 25.4  # ≈ 39.7pt
CENTER = (473.0, 758.0)        # 페이지 기준 중심 좌표


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    seal = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "퇴직소득원천징수영수증_직인.pdf"

    doc = pymupdf.open(SRC)
    page = doc[0]
    cx, cy = CENTER
    half = SEAL_PT / 2
    rect = pymupdf.Rect(cx - half, cy - half, cx + half, cy + half)
    # overlay=True: 본문 텍스트 위에 찍힘(실제 도장처럼 글자와 겹침)
    page.insert_image(rect, filename=seal, overlay=True, keep_proportion=True)
    doc.save(out, garbage=4, deflate=True)
    print(f"저장 완료: {out}  (직인 {SEAL_MM}mm, 중심 {CENTER})")


if __name__ == "__main__":
    main()
