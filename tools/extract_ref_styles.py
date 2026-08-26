"""Extract detailed styling from reference Executive Summary and Area sheet."""
import re
import sys
import zipfile
from xml.etree import ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def q(tag):
    return f"{{{NS['m']}}}{tag}"


def read_shared(z):
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    out = []
    for si in root.findall(q("si")):
        out.append("".join((t.text or "") for t in si.iter(q("t"))))
    return out


def cell_val(c, shared):
    v = c.find(q("v"))
    if v is None or v.text is None:
        return ""
    if c.get("t") == "s":
        return shared[int(v.text)]
    return v.text


def styles_detail(z):
    root = ET.fromstring(z.read("xl/styles.xml"))
    fonts, fills, borders, xfs, numFmts = [], [], [], [], {}
    for f in root.findall(".//" + q("font")):
        fonts.append({k: (el.get("val") if k != "bold" else True) for k, el in [
            ("bold", f.find(q("b"))),
            ("sz", f.find(q("sz"))),
            ("color", f.find(q("color"))),
            ("name", f.find(q("name"))),
        ] if el is not None})
    for fill in root.findall(".//" + q("fill")):
        p = fill.find(q("patternFill"))
        if p is None:
            fills.append({})
        else:
            fg = p.find(q("fgColor"))
            fills.append({"pat": p.get("patternType"), "fg": fg.get("rgb") if fg is not None else None})
    for b in root.findall(".//" + q("border")):
        sides = {}
        for side in ("left", "right", "top", "bottom"):
            el = b.find(q(side))
            if el is not None:
                sides[side] = {"style": el.get("style"), "color": (el.find(q("color")).get("rgb") if el.find(q("color")) is not None else None)}
        borders.append(sides)
    for nf in root.findall(".//" + q("numFmt")):
        numFmts[int(nf.get("numFmtId"))] = nf.get("formatCode")
    for xf in root.findall(".//" + q("cellXfs") + "/" + q("xf")):
        xfs.append({
            "font": int(xf.get("fontId", 0)),
            "fill": int(xf.get("fillId", 0)),
            "border": int(xf.get("borderId", 0)),
            "numFmt": int(xf.get("numFmtId", 0)),
            "align": xf.find(q("alignment")),
        })
    return fonts, fills, borders, xfs, numFmts


def dump_sheet(path, sheet_name, max_row=50):
    with zipfile.ZipFile(path) as z:
        shared = read_shared(z)
        fonts, fills, borders, xfs, numFmts = styles_detail(z)
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rel_map = {r.get("Id"): r.get("Target") for r in rels.findall("{http://schemas.openxmlformats.org/package/2006/relationships}Relationship")}
        target = None
        for sh in wb.findall(".//" + q("sheet")):
            if sh.get("name") == sheet_name:
                rid = sh.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
                target = rel_map[rid]
                if not target.startswith("xl/"):
                    target = "xl/" + target.lstrip("/")
                break
        root = ET.fromstring(z.read(target))
        merges = [mc.get("ref") for mc in root.findall(".//" + q("mergeCell"))]
        print(f"\n=== {sheet_name} merges ({len(merges)}) ===")
        for m in merges:
            print(" ", m)
        print("\nCells:")
        for row in root.findall(".//" + q("row")):
            r = int(row.get("r", 0))
            if r > max_row:
                continue
            for c in row.findall(q("c")):
                ref = c.get("r")
                sid = int(c.get("s")) if c.get("s") else 0
                xf = xfs[sid] if sid < len(xfs) else {}
                font = fonts[xf.get("font", 0)] if xf.get("font", 0) < len(fonts) else {}
                fill = fills[xf.get("fill", 0)] if xf.get("fill", 0) < len(fills) else {}
                border = borders[xf.get("border", 0)] if xf.get("border", 0) < len(borders) else {}
                nf = numFmts.get(xf.get("numFmt", 0), xf.get("numFmt", 0))
                align = xf.get("align")
                al = {}
                if align is not None:
                    al = {k: align.get(k) for k in ("horizontal", "vertical", "wrapText") if align.get(k)}
                print(f"{ref}: {cell_val(c, shared)!r} | font={font} fill={fill} border={border} numFmt={nf} align={al}")


REF = r"c:\Users\mohamed.abass.WUSOOM\OneDrive - WUSOOM\Desktop\Serbia\Copy of Serbia_Field_Report__2026-08-05.xlsx"
dump_sheet(REF, "Executive Summary", 46)
dump_sheet(REF, "Area & Coverage Analysis", 45)

# chart colors
with zipfile.ZipFile(REF) as z:
    for name in sorted(z.namelist()):
        if name.startswith("xl/charts/chart") and name.endswith(".xml"):
            xml = z.read(name).decode("utf-8")
            print(f"\n=== {name} ===")
            colors = re.findall(r'<a:srgbClr val="([0-9A-Fa-f]{6})"', xml)
            print("colors:", colors[:20])
            titles = re.findall(r'<c:v>([^<]+)</c:v>', xml)
            print("text nodes:", titles[:10])
