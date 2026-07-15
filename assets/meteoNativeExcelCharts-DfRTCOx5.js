import{J as w}from"./GisUploadCloudSources-CZ57lESu.js";import"./index-MHBP7OYZ.js";import"./vendor-charts-DiqJ_ObG.js";import"./vendor-react-1RAKTFQ4.js";/* empty css                     */import"./gisContentPortalStore-BeJT8-iz.js";import"./arcgisAttributeDisplay-BRGARB84.js";function f(a){return String(a).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function $(a){return a.nameRef?`<c:tx><c:strRef><c:f>${f(a.nameRef)}</c:f></c:strRef></c:tx>`:`<c:tx><c:v>${f(a.name||"Series")}</c:v></c:tx>`}function y(a,c){const e=10+c*2,r=100+c*2,l=200+c*2,i=a.varyColors!==!1?"1":"0",h=a.legendPos??(a.series.length===1&&i==="1"?"r":"b"),n=a.kind==="area"?"line":a.kind==="combo"?"combo":a.kind,d=a.series.map((t,m)=>{var g;const v=n==="scatter"||n==="line"||n==="combo"&&((g=a.lineSeriesIndexes)!=null&&g.includes(m))?'<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>':"",o=a.kind==="area"&&m===0?'<c:spPr><a:solidFill><a:srgbClr val="F97316"/></a:solidFill></c:spPr>':"";return{ser:t,i:m,marker:v,fill:o}}),x=(t,m,v,o)=>{var g;return`<c:ser>
  <c:idx val="${m}"/>
  <c:order val="${m}"/>
  ${$(t)}
  ${v}
  ${o}
  <c:cat><c:strRef><c:f>${f(t.catsRef)}</c:f></c:strRef></c:cat>
  <c:val><c:numRef><c:f>${f(t.valuesRef)}</c:f></c:numRef></c:val>
  ${n==="line"||n==="combo"&&((g=a.lineSeriesIndexes)!=null&&g.includes(m))?'<c:smooth val="0"/>':""}
</c:ser>`};let s="";if(n==="scatter")s=`<c:scatterChart>
  <c:scatterStyle val="lineMarker"/>
  <c:varyColors val="0"/>
  ${d.map(t=>x(t.ser,t.i,t.marker,t.fill)).join("")}
  <c:axId val="${e}"/>
  <c:axId val="${r}"/>
</c:scatterChart>`;else if(n==="combo"){const t=new Set(a.lineSeriesIndexes??[a.series.length-1]),m=d.filter(o=>!t.has(o.i)),v=d.filter(o=>t.has(o.i));s=`<c:barChart>
  <c:barDir val="col"/>
  <c:grouping val="clustered"/>
  <c:varyColors val="${i}"/>
  ${m.map(o=>x(o.ser,o.i,"","")).join("")}
  <c:axId val="${e}"/>
  <c:axId val="${r}"/>
</c:barChart>
<c:lineChart>
  <c:grouping val="standard"/>
  <c:varyColors val="0"/>
  ${v.map(o=>x(o.ser,o.i,o.marker,"")).join("")}
  <c:marker val="1"/>
  <c:axId val="${e}"/>
  <c:axId val="${l}"/>
</c:lineChart>`}else n==="bar"?s=`<c:barChart>
  <c:barDir val="col"/>
  <c:grouping val="clustered"/>
  <c:varyColors val="${i}"/>
  ${d.map(t=>x(t.ser,t.i,"","")).join("")}
  <c:axId val="${e}"/>
  <c:axId val="${r}"/>
</c:barChart>`:s=`<c:lineChart>
  <c:grouping val="standard"/>
  <c:varyColors val="${i}"/>
  ${d.map(t=>x(t.ser,t.i,t.marker,t.fill)).join("")}
  <c:marker val="1"/>
  <c:axId val="${e}"/>
  <c:axId val="${r}"/>
</c:lineChart>`;const p=n==="combo"?`<c:valAx>
        <c:axId val="${r}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:majorGridlines/>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:crossAx val="${e}"/>
        <c:crosses val="autoZero"/>
      </c:valAx>
      <c:valAx>
        <c:axId val="${l}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="r"/>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:crossAx val="${e}"/>
        <c:crosses val="max"/>
      </c:valAx>`:`<c:valAx>
        <c:axId val="${r}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:majorGridlines/>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="${e}"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="between"/>
      </c:valAx>`,u=n==="scatter"?`<c:valAx>
        <c:axId val="${r}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:axPos val="l"/>
        <c:crossAx val="${e}"/>
        <c:crosses val="autoZero"/>
      </c:valAx>`:p;return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:lang val="en-US"/>
  <c:roundedCorners val="0"/>
  <c:style val="2"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1200" b="1"/><a:t>${f(a.title)}</a:t></a:r></a:p></c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      ${s}
      <c:catAx>
        <c:axId val="${e}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="${r}"/>
        <c:crosses val="autoZero"/>
        <c:auto val="1"/>
      </c:catAx>
      ${u}
    </c:plotArea>
    <c:legend>
      <c:legendPos val="${h}"/>
      <c:overlay val="0"/>
    </c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
</c:chartSpace>`}function k(a){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
${a.map((e,r)=>{const l=r+2,i=r+1;return`<xdr:oneCellAnchor>
  <xdr:from><xdr:col>${e.anchorCol??0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${e.anchorRow+1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
  <xdr:ext cx="9144000" cy="3429000"/>
  <xdr:graphicFrame macro="">
    <xdr:nvGraphicFramePr>
      <xdr:cNvPr id="${l}" name="Chart ${r+1}"/>
      <xdr:cNvGraphicFramePr/>
    </xdr:nvGraphicFramePr>
    <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
    <a:graphic>
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
        <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${i}"/>
      </a:graphicData>
    </a:graphic>
  </xdr:graphicFrame>
  <xdr:clientData/>
</xdr:oneCellAnchor>`}).join("")}
</xdr:wsDr>`}function C(a){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${Array.from({length:a},(e,r)=>{const l=r+1;return`<Relationship Id="rId${l}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${l}.xml"/>`}).join("")}</Relationships>`}async function P(a,c="Charts"){var p,u,t;const e=await((p=a.file("xl/workbook.xml"))==null?void 0:p.async("string"));if(!e)return null;const r=await((u=a.file("xl/_rels/workbook.xml.rels"))==null?void 0:u.async("string"));if(!r)return null;const i=[...e.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].find(m=>m[1]===c);if(!i)return null;const h=i[2],n=(t=r.match(new RegExp(`Id="${h}"[^>]*Target="([^"]+)"`)))==null?void 0:t[1];if(!n)return null;const d=n.startsWith("/")?n.slice(1):`xl/${n.replace(/^\.\//,"")}`,s=`xl/worksheets/_rels/${d.split("/").pop()}.rels`;return{sheetPath:d,relsPath:s}}function b(a,c){return a.includes("drawing")?a.replace(/<drawing[^/]*\/>/,`<drawing r:id="${c}"/>`):a.includes("</worksheet>")?a.replace("</worksheet>",`<drawing r:id="${c}"/></worksheet>`):a}function T(a,c){return a?a.includes('/drawing"')?a.replace(/Target="[^"]*drawings\/[^"]*"/,'Target="../drawings/drawing1.xml"'):a.replace("</Relationships>",`<Relationship Id="${c}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`):`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="${c}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/>
</Relationships>`}function A(a,c){let e=a;e.includes('/drawing+xml"')||(e=e.replace("</Types>",`<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
</Types>`));for(let r=1;r<=c;r++){const l=`/xl/charts/chart${r}.xml`;e.includes(`PartName="${l}"`)||(e=e.replace("</Types>",`<Override PartName="${l}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
</Types>`))}return e}async function G(a,c,e="Charts"){if(!c.length)return a instanceof Uint8Array?a:new Uint8Array(a);const r=await w.loadAsync(a),l=await P(r,e);if(!l)throw new Error(`Charts sheet "${e}" not found in workbook package`);for(let s=0;s<c.length;s++)r.file(`xl/charts/chart${s+1}.xml`,y(c[s],s));r.file("xl/drawings/drawing1.xml",k(c)),r.file("xl/drawings/_rels/drawing1.xml.rels",C(c.length));const i="rIdDrawing1",h=await r.file(l.sheetPath).async("string");r.file(l.sheetPath,b(h,i));const n=r.file(l.relsPath)?await r.file(l.relsPath).async("string"):null;r.file(l.relsPath,T(n,i));const d=await r.file("[Content_Types].xml").async("string");return r.file("[Content_Types].xml",A(d,c.length)),await r.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:6}})}export{G as injectNativeMeteoCharts};
