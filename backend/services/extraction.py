import base64
import json
import logging

from config import EXTRACTION_MODEL, OPENROUTER_SITE_TITLE, OPENROUTER_SITE_URL
from services.client import get_client

log = logging.getLogger(__name__)

EXTRACTION_TOOL = {
    "type": "function",
    "function": {
        "name": "extract_dc_summary",
        "description": "Extract header summary fields from a pharmacy delivery note / invoice image.",
        "parameters": {
            "type": "object",
            "properties": {
                "dc_number": {
                    "type": "string",
                    "description": "DC / invoice / bill number from the invoice header (e.g. 'INV-1234', 'DC00456'). Empty string if not found.",
                },
                "supplier_name": {
                    "type": "string",
                    "description": "Supplier / distributor / seller name from the invoice header. Empty string if not found.",
                },
                "item_count": {
                    "type": "integer",
                    "description": "Total number of distinct product line items in the invoice's product table. Count every row, excluding the header row. 0 if no product table is visible.",
                },
            },
            "required": ["dc_number", "supplier_name", "item_count"],
        },
    },
}

PROMPT = """\
<role>
You are an expert pharmaceutical invoice OCR parser. Your job is to read delivery \
note / invoice images and extract summary data with exact fidelity. \
Call the extract_dc_summary tool with your findings. \
Return nothing outside the tool call.
</role>

<critical_rules>
1. Extract only what you can clearly read in the image. If a field is blank or \
illegible, use "" for strings and 0 for item_count. Never guess or infer.
2. Ignore all handwritten ink, pen marks, stamps, signatures, and circled \
annotations. Extract printed/typed content only.
3. item_count is the number of product line items in the invoice's product table \
(count the rows, not the total quantity of units).
</critical_rules>

<fields>
- dc_number    : DC / invoice / bill number from the header. "" if not found.
- supplier_name: supplier / distributor / seller name from the header. "" if not found.
- item_count   : number of product rows in the invoice table. 0 if none visible.
</fields>"""


def extract_dc_summary(image_bytes: bytes, mime_type: str, model: str | None = None) -> dict:
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    data_url = f"data:{mime_type};base64,{b64}"

    chosen_model = model or EXTRACTION_MODEL
    log.info("Sending image to %s for Stage 1 extraction", chosen_model)

    response = get_client().chat.completions.create(
        extra_headers={
            "HTTP-Referer": OPENROUTER_SITE_URL,
            "X-OpenRouter-Title": OPENROUTER_SITE_TITLE,
        },
        model=chosen_model,
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": PROMPT},
                {"type": "image_url", "image_url": {"url": data_url}},
            ],
        }],
        tools=[EXTRACTION_TOOL],
        tool_choice={"type": "function", "function": {"name": "extract_dc_summary"}},
    )

    message = response.choices[0].message

    if not message.tool_calls:
        raise ValueError("Model returned no tool call. Could not extract data from the image.")

    tool_call = message.tool_calls[0]

    if tool_call.function.name != "extract_dc_summary":
        raise ValueError(f"Unexpected tool called: {tool_call.function.name}")

    parsed = json.loads(tool_call.function.arguments)
    log.info("Extracted Stage 1 summary: dc_number=%r supplier_name=%r item_count=%r",
              parsed.get("dc_number"), parsed.get("supplier_name"), parsed.get("item_count"))
    return parsed
