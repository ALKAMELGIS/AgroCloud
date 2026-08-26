import re, zipfile, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r"c:\Users\mohamed.abass.WUSOOM\OneDrive - WUSOOM\Desktop\Serbia\Copy of Serbia_Field_Report__2026-08-05.xlsx"
with zipfile.ZipFile(p) as z:
    for n in ["xl/charts/chart1.xml", "xl/charts/chart2.xml"]:
        xml = z.read(n).decode("utf-8")
        print("===", n, "snippet ===")
        # show ser blocks
        for m in re.finditer(r"<c:ser>.*?</c:ser>", xml, re.S):
            block = m.group(0)
            if len(block) > 800:
                block = block[:800] + "..."
            print(block)
            print("---")
        pts = re.findall(r"<c:dPt>.*?srgbClr val=\"([0-9A-Fa-f]{6})\"", xml, re.S)
        if pts:
            print("pie slices:", pts)
