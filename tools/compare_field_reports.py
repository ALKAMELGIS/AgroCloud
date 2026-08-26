"""Deep diff of field report xlsx vs reference."""
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def q(tag: str) -> str:
    return f"{{{NS['m']}}}{tag}"


def read_shared_strings(z):
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    out = []
    for si in root.findall(q("si")):
        parts = []
        for t in si.iter(q("t")):
            parts.append(t.text or "")
        out.append("".join(parts))
    return out


def cell_value(c, shared):
    t = c.get("t")
    v = c.find(q("v"))
    if v is None or v.text is None:
        return ""
    if t == "s":
        return shared[int(v.text)]
    return v.text


def parse_styles(z):
    root = ET.fromstring(z.read("xl/styles.xml"))
    fonts, fills, xfs, numFmts = [], [], [], {}
    for f in root.findall(".//" + q("font")):
        fonts.append({
            "bold": f.find(q("b")) is not None,
            "color": (f.find(q("color")).get("rgb") if f.find(q("color")) is not None else None),
            "sz": (f.find(q("sz")).get("val") if f.find(q("sz")) is not None else None),
        })
    for fill in root.findall(".//" + q("fill")):
        pattern = fill.find(q("patternFill"))
        if pattern is None:
            fills.append({})
        else:
            fg = pattern.find(q("fgColor"))
            fills.append({"pattern": pattern.get("patternType"), "fg": fg.get("rgb") if fg is not None else None})
    for nf in root.findall(".//" + q("numFmt")):
        numFmts[int(nf.get("numFmtId"))] = nf.get("formatCode")
    for xf in root.findall(".//" + q("cellXfs") + "/" + q("xf")):
        xfs.append({
            "fontId": int(xf.get("fontId", 0)),
            "fillId": int(xf.get("fillId", 0)),
            "numFmtId": int(xf.get("numFmtId", 0)),
        })
    return fonts, fills, xfs, numFmts


def sheet_meta(z, target, shared):
    root = ET.fromstring(z.read(target))
    cols = {}
    for col in root.findall(".//" + q("cols") + "/" + q("col")):
        cols[col.get("min")] = {"width": col.get("width"), "bestFit": col.get("bestFit")}
    merges = [mc.get("ref") for mc in root.findall(".//" + q("mergeCell"))]
    rows = {}
    for row in root.findall(".//" + q("row")):
        r_idx = int(row.get("r", 0))
        for c in row.findall(q("c")):
            ref = c.get("r", "")
            m = re.match(r"([A-Z]+)(\d+)", ref)
            if not m:
                continue
            col, rr = m.group(1), int(m.group(2))
            style = int(c.get("s")) if c.get("s") else None
            rows.setdefault(rr, {})[col] = {"v": cell_value(c, shared), "s": style}
    return {"cols": cols, "merges": merges, "rows": rows}


def chart_count(z):
    charts = [n for n in z.namelist() if n.startswith("xl/charts/chart") and n.endswith(".xml")]
    drawings = [n for n in z.namelist() if "drawing" in n and n.endswith(".xml")]
    return len(charts), drawings


def summarize(path):
    print("\n" + "=" * 90)
    print(Path(path).name)
    with zipfile.ZipFile(path) as z:
        shared = read_shared_strings(z)
        fonts, fills, xfs, numFmts = parse_styles(z)
        print(f"strings={len(shared)} fonts={len(fonts)} fills={len(fills)} xfs={len(xfs)} numFmts={len(numFmts)}")
        print("fills:", [f for i, f in enumerate(fills) if f])
        cc, drawings = chart_count(z)
        print(f"charts={cc} drawingFiles={len(drawings)}")
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rel_map = {r.get("Id"): r.get("Target") for r in rels.findall("{http://schemas.openxmlformats.org/package/2006/relationships}Relationship")}
        for sh in wb.findall(".//" + q("sheet")):
            name = sh.get("name")
            rid = sh.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
            target = rel_map.get(rid, "")
            if not target.startswith("xl/"):
                target = "xl/" + target.lstrip("/")
            meta = sheet_meta(z, target, shared)
            print(f"\n[{name}] merges={len(meta['merges'])} colWidths={meta['cols']}")
            if name in ("Executive Summary", "Area & Coverage Analysis", "Production Estimation"):
                for rr in sorted(meta["rows"].keys())[:15]:
                    cells = meta["rows"][rr]
                    line = []
                    for col in sorted(cells.keys()):
                        item = cells[col]
                        line.append(f"{col}{rr}(s{item['s']})={item['v'][:35]!r}")
                    if line:
                        print(" ", " | ".join(line))


def diff_styles(path_a, path_b):
    print("\n" + "=" * 90)
    print("STYLE DIFF")
    with zipfile.ZipFile(path_a) as za, zipfile.ZipFile(path_b) as zb:
        fa, fia, xa, nfa = parse_styles(za)
        fb, fib, xb, nfb = parse_styles(zb)
        print("fills A:", fia)
        print("fills B:", fib)
        print("fonts A:", fa)
        print("fonts B:", fb)
        print("xfs A:", xa)
        print("xfs B:", xb)
        print("numFmts A sample:", list(nfa.items())[:15])
        print("numFmts B sample:", list(nfb.items())[:15])


REF = r"c:\Users\mohamed.abass.WUSOOM\OneDrive - WUSOOM\Desktop\Serbia\Copy of Serbia_Field_Report__2026-08-05.xlsx"
CUR = r"c:\Users\mohamed.abass.WUSOOM\OneDrive - WUSOOM\Desktop\Serbia\Repprt\50_plots_Field_Report_2026-08-25.xlsx"

summarize(CUR)
summarize(REF)
diff_styles(CUR, REF)
