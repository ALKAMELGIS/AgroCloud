import zipfile, sys, re
sys.stdout.reconfigure(encoding='utf-8', errors='replace')
p = r"c:\Users\mohamed.abass.WUSOOM\OneDrive - WUSOOM\Desktop\Serbia\Copy of Serbia_Field_Report__2026-08-05.xlsx"
with zipfile.ZipFile(p) as z:
    for n in sorted(z.namelist()):
        if 'drawing' in n and n.endswith('.xml'):
            print('===', n, '===')
            xml = z.read(n).decode('utf-8')
            for m in re.finditer(r'<xdr:from>.*?</xdr:from>', xml, re.S):
                print(m.group(0))
            for m in re.finditer(r'<c:v>([^<]+)</c:v>', z.read('xl/charts/chart1.xml').decode('utf-8')):
                pass
