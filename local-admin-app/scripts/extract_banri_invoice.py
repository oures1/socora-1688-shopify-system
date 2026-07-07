import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader


def money_to_int(value):
    text = re.sub(r"[^\d.-]", "", value or "")
    try:
        return int(round(float(text)))
    except ValueError:
        return 0


def extract_text(pdf_path):
    reader = PdfReader(str(pdf_path))
    pages = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")
    return "\n".join(pages)


def parse_invoice(text):
    invoice_no = ""
    invoice_match = re.search(r"一括請求書\s*NO[：:]\s*([0-9]+)", text)
    if invoice_match:
        invoice_no = invoice_match.group(1)

    period = ""
    period_match = re.search(r"期間[：:]\s*([^\n]+)", text)
    if period_match:
        period = period_match.group(1).strip()

    charges = []
    seen = set()

    product_pattern = re.compile(
        r"(\d{4}-\d{2}-\d{2})\s+([0-9]{10,})\s+商品代金\s+立替\s+([0-9,]+)"
    )
    for match in product_pattern.finditer(text):
        key = ("product", match.group(1), match.group(2), match.group(3))
        if key in seen:
            continue
        seen.add(key)
        charges.append({
            "type": "product",
            "date": match.group(1),
            "banriOrderNo": match.group(2),
            "logisticsNo": "",
            "amountJpy": money_to_int(match.group(3)),
            "label": "商品代金",
        })

    shipping_pattern = re.compile(
        r"^(\d{4}-\d{2}-\d{2})\s+([0-9]{10,})\s+(.+?)国際送料\s+立替(?:\(JPY\))?\s+([0-9,]+)"
    )
    for line in text.splitlines():
        match = shipping_pattern.search(line.strip())
        if not match:
            continue
        context = re.sub(r"\s+", "", match.group(3) or "")
        order_refs = re.findall(r"[0-9]{10,16}", context)
        key = ("international_shipping", match.group(1), match.group(2), match.group(4))
        if key in seen:
            continue
        seen.add(key)
        charges.append({
            "type": "international_shipping",
            "date": match.group(1),
            "banriOrderNo": "",
            "logisticsNo": match.group(2),
            "amountJpy": money_to_int(match.group(4)),
            "label": "国際送料",
            "orderRefs": order_refs,
        })

    return {
        "invoiceNumber": invoice_no,
        "period": period,
        "charges": charges,
        "textLength": len(text),
    }


def main():
    if len(sys.argv) < 2:
        raise SystemExit("PDF path is required")
    pdf_path = Path(sys.argv[1])
    text = extract_text(pdf_path)
    print(json.dumps(parse_invoice(text), ensure_ascii=False))


if __name__ == "__main__":
    main()
