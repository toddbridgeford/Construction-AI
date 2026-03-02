from pathlib import Path
from typing import Any

from .io_layer import read_json, write_json


def build_ci_checklist(projects: list[dict[str, Any]], template_path: Path) -> list[dict[str, Any]]:
    template = read_json(template_path) or {"items": []}
    template_items = template.get("items", [])
    rows = []
    for project in projects:
        rows.append(
            {
                "project_id": str(project.get("project_id") or project.get("id") or ""),
                "project_name": project.get("project_name") or project.get("name") or "",
                "checklist_items": template_items,
                "confidence": "Medium" if template_items else "Low",
                "verification_url": project.get("case_url") or project.get("filing_url") or project.get("verification_url"),
            }
        )
    return rows


def write_ci_checklist_json(path: Path, payload: dict[str, Any]) -> None:
    write_json(path, payload)


def _write_plain_pdf(path: Path, lines: list[str]) -> None:
    content = "\n".join(lines).replace("(", "[").replace(")", "]")
    stream = f"BT /F1 10 Tf 50 740 Td ({content[:3000]}) Tj ET"
    pdf = (
        "%PDF-1.4\n"
        "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n"
        "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n"
        "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
        "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>endobj\n"
        "4 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n"
        f"5 0 obj<< /Length {len(stream)} >>stream\n{stream}\nendstream endobj\n"
        "xref\n0 6\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n"
        "0000000117 00000 n \n0000000243 00000 n \n0000000313 00000 n \n"
        "trailer<< /Root 1 0 R /Size 6 >>\nstartxref\n420\n%%EOF\n"
    )
    path.write_text(pdf, encoding="latin-1")


def write_ci_checklist_pdf(path: Path, market: str, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        from reportlab.lib.pagesizes import LETTER
        from reportlab.pdfgen import canvas

        c = canvas.Canvas(str(path), pagesize=LETTER)
        width, height = LETTER
        y = height - 50
        c.setFont("Helvetica-Bold", 12)
        c.drawString(50, y, f"CI Checklist - {market}")
        y -= 24
        c.setFont("Helvetica", 10)
        for row in rows:
            c.drawString(50, y, f"Project: {row.get('project_name') or row.get('project_id')}")
            y -= 14
            for item in row.get("checklist_items", []):
                c.drawString(65, y, f"- {item}")
                y -= 12
                if y < 60:
                    c.showPage()
                    y = height - 50
                    c.setFont("Helvetica", 10)
        c.save()
    except Exception:
        lines = [f"CI Checklist - {market}"]
        for row in rows:
            lines.append(f"Project: {row.get('project_name') or row.get('project_id')}")
            lines.extend([f"- {item}" for item in row.get("checklist_items", [])])
        _write_plain_pdf(path, lines)
