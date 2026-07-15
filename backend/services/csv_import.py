import csv
import html
import io


def parse_name_column(raw: bytes, header_keys: list[str]) -> list[str]:
    """Extract a column of names from an uploaded CSV.

    Looks for a header row matching one of header_keys (case-insensitive);
    if none matches, treats every row (including the first) as data, reading
    column 0.
    """
    text = raw.decode("utf-8-sig", errors="ignore")
    rows = [r for r in csv.reader(io.StringIO(text)) if r]
    if not rows:
        return []

    header = [c.strip().lower() for c in rows[0]]
    name_col = 0
    data_rows = rows[1:]
    for key in header_keys:
        if key in header:
            name_col = header.index(key)
            break
    else:
        data_rows = rows

    names = []
    for row in data_rows:
        if name_col < len(row):
            name = html.unescape(row[name_col]).strip()
            if name:
                names.append(name)
    return names
