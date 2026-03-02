#!/usr/bin/env python3
from __future__ import annotations

import json
import pathlib
import sys
from datetime import datetime, timezone

from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def load_checklist(repo_root: pathlib.Path, market: str) -> dict:
    template_path = repo_root / "templates" / f"ci_checklist_{market}_polyiso.json"
    if not template_path.exists():
        raise FileNotFoundError(f"Checklist template not found: {template_path}")
    return json.loads(template_path.read_text(encoding="utf-8"))


def build_story(payload: dict) -> list:
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "ChecklistTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=22,
        textColor=colors.HexColor("#0f172a"),
        spaceAfter=10,
    )
    subtitle_style = ParagraphStyle(
        "ChecklistSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#334155"),
    )
    h2_style = ParagraphStyle(
        "SectionHeader",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12,
        leading=16,
        textColor=colors.HexColor("#1e293b"),
        spaceBefore=8,
        spaceAfter=6,
    )
    body_style = ParagraphStyle(
        "Body",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
    )

    story = []
    timestamp = datetime.now(timezone.utc).isoformat()
    story.append(Paragraph(payload["title"], title_style))
    story.append(
        Paragraph(
            f"Market: <b>{payload['market'].title()}</b> &nbsp;&nbsp;&nbsp; Lens: {payload['lens']}<br/>Generated (UTC): {timestamp}",
            subtitle_style,
        )
    )
    story.append(Spacer(1, 0.2 * inch))

    story.append(Paragraph("Decision Gates", h2_style))
    gates_data = [["Gate", "Question", "Pass Condition", "Fail Action"]]
    for gate in payload.get("decision_gates", []):
        gates_data.append([
            gate["gate_id"],
            gate["question"],
            gate["pass_condition"],
            gate["fail_action"],
        ])
    gate_table = Table(gates_data, colWidths=[0.8 * inch, 2.2 * inch, 2.1 * inch, 2.4 * inch])
    gate_table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1d4ed8")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#94a3b8")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    story.append(gate_table)
    story.append(Spacer(1, 0.2 * inch))

    story.append(Paragraph("NFPA 285 Matrix", h2_style))
    for row in payload.get("nfpa_285_matrix", []):
        text = (
            f"<b>{row['assembly_family']}</b><br/>"
            f"Test reference: {row['test_reference']}<br/>"
            f"Accepted substitutions: {', '.join(row['accepted_substitutions'])}<br/>"
            f"Trigger: {row['trigger']}"
        )
        story.append(Paragraph(text, body_style))
        story.append(Spacer(1, 0.08 * inch))

    story.append(Spacer(1, 0.1 * inch))
    story.append(Paragraph("Section Checks", h2_style))
    for section in payload.get("sections", []):
        story.append(Paragraph(f"<b>{section['section_id']}: {section['title']}</b>", body_style))
        story.append(Paragraph(f"Objective: {section['objective']}", body_style))
        story.append(Spacer(1, 0.03 * inch))
        for check in section.get("checks", []):
            evidence = "; ".join(check.get("required_evidence", []))
            detail = (
                f"• <b>{check['check_id']}</b> ({check.get('severity', 'n/a').upper()}) — {check['prompt']}<br/>"
                f"Evidence: {evidence}<br/>"
                f"Decision logic: {check['decision_logic']}<br/>"
                f"Owner: {check.get('owner', 'Unassigned')}"
            )
            story.append(Paragraph(detail, body_style))
            story.append(Spacer(1, 0.04 * inch))

    return story


def main() -> int:
    market = sys.argv[1] if len(sys.argv) > 1 else "denver"
    repo_root = pathlib.Path(__file__).resolve().parents[1]
    payload = load_checklist(repo_root, market)

    output_dir = repo_root / "dist" / "artifacts" / market
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "ci_checklist_latest.pdf"

    doc = SimpleDocTemplate(
        str(output_path),
        pagesize=LETTER,
        leftMargin=0.6 * inch,
        rightMargin=0.6 * inch,
        topMargin=0.6 * inch,
        bottomMargin=0.6 * inch,
        title=payload["title"],
    )
    doc.build(build_story(payload))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
