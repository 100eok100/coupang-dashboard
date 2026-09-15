import pymupdf
SRC = "/root/.claude/uploads/6233c167-f7c9-59a0-a957-d00fe5d6e2c1/49b21a9e-_______________.pdf"
SEAL_PT = 14.0 * 72 / 25.4
CX, CY = 473.0, 758.0
doc = pymupdf.open(SRC)
page = doc[0]
sh = page.new_shape()
sh.draw_circle(pymupdf.Point(CX, CY), SEAL_PT / 2)
sh.finish(color=(0.85, 0.1, 0.1), width=1.2, dashes="[3 2] 0")
sh.commit()
clip = pymupdf.Rect(280, 735, 595, 800)
page.get_pixmap(dpi=300, clip=clip).save("직인위치_미리보기.png")
print("preview saved")
