import{J as y}from"./GisUploadCloudSources-BW2j1l5N.js";import"./vendor-pdf-u5XwutAF.js";import"./vendor-react-CLPUsiAW.js";import"./vendor-excel-CM_DmiI4.js";import"./vendor-xlsx-D_0l8YDs.js";import"./vendor-charts-B29DT2d9.js";import"./gisContentPortalStore-DswSOyTf.js";import"./arcgisAttributeDisplay-BRGARB84.js";import"./index-MzX5LoUF.js";/* empty css                     */function g(a){return String(a).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function w(a){return a.nameRef?`<c:tx><c:strRef><c:f>${g(a.nameRef)}</c:f></c:strRef></c:tx>`:`<c:tx><c:v>${g(a.name||"Series")}</c:v></c:tx>`}function C(a,c){const n=10+c*2,r=100+c*2,i=200+c*2,o=a.varyColors!==!1?"1":"0",v=a.legendPos??(a.series.length===1&&o==="1"?"r":"b"),t=a.kind,p=a.barDir??"col",d=a.grouping??"clustered",h=a.series.map((e,x)=>{var m;const u=t==="scatter"||t==="line"||t==="combo"&&((m=a.lineSeriesIndexes)!=null&&m.includes(x))?'<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>':"";return{ser:e,i:x,marker:u}}),l=(e,x,u)=>{var m;return t==="scatter"&&e.xValuesRef?`<c:ser>
  <c:idx val="${x}"/>
  <c:order val="${x}"/>
  ${w(e)}
  ${u}
  <c:xVal><c:numRef><c:f>${g(e.xValuesRef)}</c:f></c:numRef></c:xVal>
  <c:yVal><c:numRef><c:f>${g(e.valuesRef)}</c:f></c:numRef></c:yVal>
</c:ser>`:`<c:ser>
  <c:idx val="${x}"/>
  <c:order val="${x}"/>
  ${w(e)}
  ${u}
  <c:cat><c:strRef><c:f>${g(e.catsRef)}</c:f></c:strRef></c:cat>
  <c:val><c:numRef><c:f>${g(e.valuesRef)}</c:f></c:numRef></c:val>
  ${t==="line"||t==="area"||t==="combo"&&((m=a.lineSeriesIndexes)!=null&&m.includes(x))?`<c:smooth val="${a.smooth?"1":"0"}"/>`:""}
</c:ser>`};let s="";if(t==="scatter")s=`<c:scatterChart>
  <c:scatterStyle val="marker"/>
  <c:varyColors val="0"/>
  ${h.map(e=>l(e.ser,e.i,e.marker)).join("")}
  <c:axId val="${n}"/>
  <c:axId val="${r}"/>
</c:scatterChart>`;else if(t==="combo"){const e=new Set(a.lineSeriesIndexes??[a.series.length-1]),x=h.filter(m=>!e.has(m.i)),u=h.filter(m=>e.has(m.i));s=`<c:barChart>
  <c:barDir val="col"/>
  <c:grouping val="clustered"/>
  <c:varyColors val="${o}"/>
  ${x.map(m=>l(m.ser,m.i,"")).join("")}
  <c:axId val="${n}"/>
  <c:axId val="${r}"/>
</c:barChart>
<c:lineChart>
  <c:grouping val="standard"/>
  <c:varyColors val="0"/>
  ${u.map(m=>l(m.ser,m.i,m.marker)).join("")}
  <c:marker val="1"/>
  <c:axId val="${n}"/>
  <c:axId val="${i}"/>
</c:lineChart>`}else if(t==="pie"||t==="doughnut"){const e=t==="doughnut"?`<c:holeSize val="${Math.max(1,Math.min(90,a.holeSize??50))}"/>`:"";s=`<c:${t}Chart>
  <c:varyColors val="1"/>
  ${h.map(x=>l(x.ser,x.i,"")).join("")}
  <c:firstSliceAng val="0"/>
  ${e}
</c:${t}Chart>`}else t==="bar"?s=`<c:barChart>
  <c:barDir val="${p}"/>
  <c:grouping val="${d}"/>
  <c:varyColors val="${o}"/>
  ${h.map(e=>l(e.ser,e.i,"")).join("")}
  <c:axId val="${n}"/>
  <c:axId val="${r}"/>
</c:barChart>`:t==="area"?s=`<c:areaChart>
  <c:grouping val="standard"/>
  <c:varyColors val="${o}"/>
  ${h.map(e=>l(e.ser,e.i,"")).join("")}
  <c:axId val="${n}"/>
  <c:axId val="${r}"/>
</c:areaChart>`:s=`<c:lineChart>
  <c:grouping val="standard"/>
  <c:varyColors val="${o}"/>
  ${h.map(e=>l(e.ser,e.i,e.marker)).join("")}
  <c:marker val="1"/>
  <c:axId val="${n}"/>
  <c:axId val="${r}"/>
</c:lineChart>`;const f=t==="combo"?`<c:valAx>
        <c:axId val="${r}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        <c:majorGridlines/>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:crossAx val="${n}"/>
        <c:crosses val="autoZero"/>
      </c:valAx>
      <c:valAx>
        <c:axId val="${i}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="r"/>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:crossAx val="${n}"/>
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
        <c:crossAx val="${n}"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="between"/>
      </c:valAx>`,$=t==="pie"||t==="doughnut"?"":t==="scatter"?`<c:valAx>
        <c:axId val="${n}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        <c:majorGridlines/>
        <c:numFmt formatCode="General" sourceLinked="1"/>
        <c:crossAx val="${r}"/>
        <c:crosses val="autoZero"/>
      </c:valAx>
      <c:valAx>
        <c:axId val="${r}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:axPos val="l"/>
        <c:majorGridlines/>
        <c:crossAx val="${n}"/>
        <c:crosses val="autoZero"/>
      </c:valAx>`:`<c:catAx>
        <c:axId val="${n}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="${p==="bar"?"l":"b"}"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="${r}"/>
        <c:crosses val="autoZero"/>
        <c:auto val="1"/>
      </c:catAx>
      ${f}`;return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:lang val="en-US"/>
  <c:roundedCorners val="0"/>
  <c:style val="2"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1200" b="1"/><a:t>${g(a.title)}</a:t></a:r></a:p></c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout/>
      ${s}
      ${$}
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
${a.map((n,r)=>{const{spec:i}=n,o=r+2,v=r+1;return`<xdr:oneCellAnchor>
  <xdr:from><xdr:col>${i.anchorCol??0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${i.anchorRow+1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
  <xdr:ext cx="9144000" cy="3429000"/>
  <xdr:graphicFrame macro="">
    <xdr:nvGraphicFramePr>
      <xdr:cNvPr id="${o}" name="Chart ${n.chartNumber}"/>
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
</xdr:wsDr>`}function b(a){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${a.map((n,r)=>`<Relationship Id="rId${r+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${n.chartNumber}.xml"/>`).join("")}</Relationships>`}async function P(a,c="Charts"){var l,s,f;const n=await((l=a.file("xl/workbook.xml"))==null?void 0:l.async("string"));if(!n)return null;const r=await((s=a.file("xl/_rels/workbook.xml.rels"))==null?void 0:s.async("string"));if(!r)return null;const o=[...n.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].find($=>$[1]===c);if(!o)return null;const v=o[2],t=(f=r.match(new RegExp(`Id="${v}"[^>]*Target="([^"]+)"`)))==null?void 0:f[1];if(!t)return null;const p=t.startsWith("/")?t.slice(1):`xl/${t.replace(/^\.\//,"")}`,h=`xl/worksheets/_rels/${p.split("/").pop()}.rels`;return{sheetPath:p,relsPath:h}}function R(a,c){return/<drawing\b/.test(a)?a:a.includes("</worksheet>")?a.replace("</worksheet>",`<drawing r:id="${c}"/></worksheet>`):a}function A(a,c,n){const r=`../drawings/${n}`;return a?a.includes(`Id="${c}"`)?a.replace(new RegExp(`(<Relationship[^>]*Id="${c}"[^>]*Target=")[^"]*(")`),`$1${r}$2`):a.replace("</Relationships>",`<Relationship Id="${c}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="${r}"/>
</Relationships>`):`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="${c}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="${r}"/>
</Relationships>`}function T(a,c,n){let r=a;for(const i of n){const o=`/xl/drawings/${i}`;r.includes(`PartName="${o}"`)||(r=r.replace("</Types>",`<Override PartName="${o}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
</Types>`))}for(let i=1;i<=c;i++){const o=`/xl/charts/chart${i}.xml`;r.includes(`PartName="${o}"`)||(r=r.replace("</Types>",`<Override PartName="${o}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
</Types>`))}return r}function I(a){let c=1;for(;a.file(`xl/drawings/drawing${c}.xml`);)c+=1;return`drawing${c}.xml`}async function L(a,c,n="Charts"){if(!c.length)return a instanceof Uint8Array?a:new Uint8Array(a);const r=await y.loadAsync(a);for(let d=0;d<c.length;d++)r.file(`xl/charts/chart${d+1}.xml`,C(c[d],d));const i=new Map;c.forEach((d,h)=>{const l=d.targetSheet||n,s=i.get(l)??[];s.push({spec:d,chartNumber:h+1}),i.set(l,s)});const o=[];let v=0;for(const[d,h]of i){const l=await P(r,d);if(!l)throw new Error(`Charts sheet "${d}" not found in workbook package`);v+=1;const s=I(r);o.push(s),r.file(`xl/drawings/${s}`,k(h)),r.file(`xl/drawings/_rels/${s}.rels`,b(h));const f=`rIdDrawing${v}`,$=await r.file(l.sheetPath).async("string");r.file(l.sheetPath,R($,f));const e=r.file(l.relsPath)?await r.file(l.relsPath).async("string"):null;r.file(l.relsPath,A(e,f,s))}const t=await r.file("[Content_Types].xml").async("string");return r.file("[Content_Types].xml",T(t,c.length,o)),await r.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:6}})}export{L as injectNativeMeteoCharts};
