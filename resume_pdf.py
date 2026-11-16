"""Render a private resume as a searchable PDF with embedded Cyrillic fonts."""
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

FONT_PAIRS = (
    ("/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"),
    ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
    ("/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf", "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf"),
)


@lru_cache(maxsize=1)
def prepare_fonts():
    pair = next((pair for pair in FONT_PAIRS if all(Path(font).is_file() for font in pair)), None)
    if not pair:
        raise FileNotFoundError("Cyrillic PDF font unavailable")
    regular, bold = pair
    pdfmetrics.registerFont(TTFont("RybkaSans", regular))
    pdfmetrics.registerFont(TTFont("RybkaSansBold", bold))


def render_resume(resume, contact, role_label):
    prepare_fonts()
    ink = colors.HexColor("#1a3035")
    muted = colors.HexColor("#4c6266")
    title = ParagraphStyle("Name", fontName="RybkaSansBold", fontSize=22, leading=27, textColor=ink)
    subtitle = ParagraphStyle("Role", fontName="RybkaSans", fontSize=13, leading=18, spaceBefore=3, textColor=ink)
    meta = ParagraphStyle("Meta", fontName="RybkaSans", fontSize=10, leading=14, spaceBefore=7, textColor=muted)
    heading = ParagraphStyle("Section", fontName="RybkaSansBold", fontSize=12, leading=16, spaceBefore=11, spaceAfter=4, keepWithNext=True, textColor=ink)
    body = ParagraphStyle("Body", fontName="RybkaSans", fontSize=11, leading=16, spaceAfter=4, textColor=ink)
    def paragraph(text, style):
        return Paragraph(escape(text), style)

    pages = [paragraph(resume["name"] or resume["title"], title)]
    if resume["name"]:
        pages.append(paragraph(resume["title"], subtitle))
    if role_label:
        pages.append(paragraph(role_label, meta))
    pages.append(paragraph(contact, meta))
    pages.append(Spacer(1, 6))
    for label, key in (("Опыт работы", "experience"), ("Навыки", "skills")):
        if not resume[key].strip():
            continue
        pages.append(paragraph(label, heading))
        for line in resume[key].splitlines():
            pages.append(paragraph(line, body) if line.strip() else Spacer(1, 5))
    output = BytesIO()
    doc = SimpleDocTemplate(output, pagesize=A4, title=resume["title"], leftMargin=48,
                            rightMargin=48, topMargin=45, bottomMargin=45)
    doc.build(pages)
    return output.getvalue()
