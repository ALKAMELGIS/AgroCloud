import re, zipfile, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r"c:\Users\mohamed.abass.WUSOOM\OneDrive - WUSOOM\Desktop\Serbia\Copy of Serbia_Field_Report__2026-08-05.xlsx"
with zipfile.ZipFile(p) as z:
    for n in sorted(z.namelist()):
        if n.startswith("xl/charts/"):
            xml = z.read(n).decode("utf-8")
            print("===", n, "===")
            m = re.search(r"<c:title>.*?<c:v>(.*?)</c:v>", xml, re.S)
            print("title:", m.group(1) if m else "?")
            print("colors:", re.findall(r'srgbClr val="([0-9A-Fa-f]{6})"', xml))
            print("vary:", re.findall(r'varyColors val="([01])"', xml))
            print("grouping:", re.findall(r'grouping val="(\w+)"', xml))
            print("barDir:", re.findall(r'barDir val="(\w+)"', xml))
            # series colors
            print("dPt:", len(re.findall(r"<c:dPt>", xml)))
