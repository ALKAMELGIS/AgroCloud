import{J as $}from"./GisUploadCloudSources-BQ-Ka9aH.js";import"./index-Bkxgr8K9.js";import"./vendor-charts-DuW32Toi.js";import"./vendor-react-1RAKTFQ4.js";/* empty css                     */import"./gisContentPortalStore-BB8W0l3-.js";import"./arcgisAttributeDisplay-BRGARB84.js";function u(a){return String(a).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function w(a){return a.nameRef?`<c:tx><c:strRef><c:f>${u(a.nameRef)}</c:f></c:strRef></c:tx>`:`<c:tx><c:v>${u(a.name||"Series")}</c:v></c:tx>`}function y(a,c){const t=10+c*2,r=100+c*2,o=200+c*2,n=a.varyColors!==!1?"1":"0",v=a.legendPos??(a.series.length===1&&n==="1"?"r":"b"),i=a.kind==="area"?"line":a.kind==="combo"?"combo":a.kind,l=a.series.map((e,d)=>{var p;const g=i==="scatter"||i==="line"||i==="combo"&&((p=a.lineSeriesIndexes)!=null&&p.includes(d))?'<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>':"",m=a.kind==="area"&&d===0?'<c:spPr><a:solidFill><a:srgbClr val="F97316"/></a:solidFill></c:spPr>':"";return{ser:e,i:d,marker:g,fill:m}}),h=(e,d,g,m)=>{var p;return`<c:ser>
  <c:idx val="${d}"/>
  <c:order val="${d}"/>
  ${w(e)}
  ${g}
  ${m}
  <c:cat><c:strRef><c:f>${u(e.catsRef)}</c:f></c:strRef></c:cat>
  <c:val><c:numRef><c:f>${u(e.valuesRef)}</c:f></c:numRef></c:val>
  ${i==="line"||i==="combo"&&((p=a.lineSeriesIndexes)!=null&&p.includes(d))?'<c:smooth val="0"/>':""}
</c:ser>`};let s="";if(i==="scatter")s=`<c:scatterChart>
  <c:scatterStyle val="lineMarker"/>
  <c:varyColors val="0"/>
  ${l.map(e=>h(e.ser,e.i,e.marker,e.fill)).join("")}
  <c:axId val="${t}"/>
  <c:axId val="${r}"/>
</c:scatterChart>`;else if(i==="combo"){const e=new Set(a.lineSeriesIndexes??[a.series.length-1]),d=l.filter(m=>!e.has(m.i)),g=l.filter(m=>e.has(m.i));s=`<c:barChart>
  <c:barDir val="col"/>
  <c:grouping val="clustered"/>
  <c:varyColors val="${n}"/>
  ${d.map(m=>h(m.ser,m.i,"","")).join("")}
  <c:axId val="${t}"/>
  <c:axId val="${r}"/>
</c:barChart>
<c:lineChart>
  <c:grouping val="standard"/>
  <c:varyColors val="0"/>
  ${g.map(m=>h(m.ser,m.i,m.marker,"")).join("")}
  <c:marker val="1"/>
  <c:axId val="${t}"/>
  <c:axId val="${o}"/>
</c:lineChart>`}else i==="bar"?s=`<c:barChart>
  <c:barDir val="col"/>
  <c:grouping val="clustered"/>
  <c:varyColors val="${n}"/>
  ${l.map(e=>h(e.ser,e.i,"","")).join("")}
  <c:axId val="${t}"/>
  <c:axId val="${r}"/>
</c:barChart>`:s=`<c:lineChart>
  <c:grouping val="standard"/>
  <c:varyColors val="${n}"/>
  ${l.map(e=>h(e.ser,e.i,e.marker,e.fill)).join("")}
  <c:marker val="1"/>
  <c:axId val="${t}"/>
  <c:axId val="${r}"/>
</c:lineChart>`;const x=i==="combo"?`<c:valAx>
        <c:axId val="${r}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:majorGridlines/>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:crossAx val="${t}"/>
        <c:crosses val="autoZero"/>
      </c:valAx>
      <c:valAx>
        <c:axId val="${o}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="r"/>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:crossAx val="${t}"/>
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
        <c:crossAx val="${t}"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="between"/>
      </c:valAx>`,f=i==="scatter"?`<c:valAx>
        <c:axId val="${r}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:axPos val="l"/>
        <c:crossAx val="${t}"/>
        <c:crosses val="autoZero"/>
      </c:valAx>`:x;return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:lang val="en-US"/>
  <c:roundedCorners val="0"/>
  <c:style val="2"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1200" b="1"/><a:t>${u(a.title)}</a:t></a:r></a:p></c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      ${s}
      <c:catAx>
        <c:axId val="${t}"/>
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
      ${f}
    </c:plotArea>
    <c:legend>
      <c:legendPos val="${v}"/>
      <c:overlay val="0"/>
    </c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
</c:chartSpace>`}function k(a){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
${a.map((t,r)=>{const{spec:o}=t,n=r+2,v=r+1;return`<xdr:oneCellAnchor>
  <xdr:from><xdr:col>${o.anchorCol??0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${o.anchorRow+1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
  <xdr:ext cx="9144000" cy="3429000"/>
  <xdr:graphicFrame macro="">
    <xdr:nvGraphicFramePr>
      <xdr:cNvPr id="${n}" name="Chart ${t.chartNumber}"/>
      <xdr:cNvGraphicFramePr/>
    </xdr:nvGraphicFramePr>
    <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
    <a:graphic>
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
        <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${v}"/>
      </a:graphicData>
    </a:graphic>
  </xdr:graphicFrame>
  <xdr:clientData/>
</xdr:oneCellAnchor>`}).join("")}
</xdr:wsDr>`}function C(a){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${a.map((t,r)=>`<Relationship Id="rId${r+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${t.chartNumber}.xml"/>`).join("")}</Relationships>`}async function b(a,c="Charts"){var x,f,e;const t=await((x=a.file("xl/workbook.xml"))==null?void 0:x.async("string"));if(!t)return null;const r=await((f=a.file("xl/_rels/workbook.xml.rels"))==null?void 0:f.async("string"));if(!r)return null;const n=[...t.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].find(d=>d[1]===c);if(!n)return null;const v=n[2],i=(e=r.match(new RegExp(`Id="${v}"[^>]*Target="([^"]+)"`)))==null?void 0:e[1];if(!i)return null;const l=i.startsWith("/")?i.slice(1):`xl/${i.replace(/^\.\//,"")}`,s=`xl/worksheets/_rels/${l.split("/").pop()}.rels`;return{sheetPath:l,relsPath:s}}function P(a,c){return a.includes("drawing")?a.replace(/<drawing[^/]*\/>/,`<drawing r:id="${c}"/>`):a.includes("</worksheet>")?a.replace("</worksheet>",`<drawing r:id="${c}"/></worksheet>`):a}function T(a,c,t){const r=`../drawings/${t}`;return a?a.includes('/drawing"')?a.replace(/Target="[^"]*drawings\/[^"]*"/,`Target="${r}"`):a.replace("</Relationships>",`<Relationship Id="${c}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="${r}"/>
</Relationships>`):`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="${c}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="${r}"/>
</Relationships>`}function A(a,c,t){let r=a;for(let o=1;o<=t;o++){const n=`/xl/drawings/drawing${o}.xml`;r.includes(`PartName="${n}"`)||(r=r.replace("</Types>",`<Override PartName="${n}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
</Types>`))}for(let o=1;o<=c;o++){const n=`/xl/charts/chart${o}.xml`;r.includes(`PartName="${n}"`)||(r=r.replace("</Types>",`<Override PartName="${n}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
</Types>`))}return r}async function N(a,c,t="Charts"){if(!c.length)return a instanceof Uint8Array?a:new Uint8Array(a);const r=await $.loadAsync(a);for(let l=0;l<c.length;l++)r.file(`xl/charts/chart${l+1}.xml`,y(c[l],l));const o=new Map;c.forEach((l,h)=>{const s=l.targetSheet||t,x=o.get(s)??[];x.push({spec:l,chartNumber:h+1}),o.set(s,x)});let n=0;for(const[l,h]of o){const s=await b(r,l);if(!s)throw new Error(`Charts sheet "${l}" not found in workbook package`);n+=1;const x=`drawing${n}.xml`;r.file(`xl/drawings/${x}`,k(h)),r.file(`xl/drawings/_rels/${x}.rels`,C(h));const f=`rIdDrawing${n}`,e=await r.file(s.sheetPath).async("string");r.file(s.sheetPath,P(e,f));const d=r.file(s.relsPath)?await r.file(s.relsPath).async("string"):null;r.file(s.relsPath,T(d,f,x))}const v=await r.file("[Content_Types].xml").async("string");return r.file("[Content_Types].xml",A(v,c.length,n)),await r.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:6}})}export{N as injectNativeMeteoCharts};
