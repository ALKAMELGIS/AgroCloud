import{J as k}from"./GisUploadCloudSources-C4-5tCUB.js";import"./vendor-pdf-CO_5C3Vv.js";import"./vendor-react-CLPUsiAW.js";import"./vendor-excel-CM_DmiI4.js";import"./vendor-xlsx-D_0l8YDs.js";import"./vendor-charts-B29DT2d9.js";import"./gisContentPortalStore-A6K2O3UH.js";import"./arcgisAttributeDisplay-BRGARB84.js";import"./index-DIrsKyAC.js";/* empty css                     */function f(a){return String(a).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function F(a,l=!1){if(!a)return"";const e=a.replace(/^FF/i,"").toUpperCase();return l?`<c:spPr><a:solidFill><a:srgbClr val="${e}"/></a:solidFill><a:ln w="9360"><a:solidFill><a:srgbClr val="F9F9F9"/></a:solidFill><a:round/></a:ln></c:spPr>`:`<c:spPr><a:solidFill><a:srgbClr val="${e}"/></a:solidFill><a:ln w="0"><a:noFill/></a:ln></c:spPr>`}function A(a){return a!=null&&a.length?a.map((l,e)=>`<c:dPt><c:idx val="${e}"/><c:spPr><a:solidFill><a:srgbClr val="${l.replace(/^FF/i,"").toUpperCase()}"/></a:solidFill><a:ln w="0"><a:noFill/></a:ln></c:spPr></c:dPt>`).join(""):""}function C(a){return a.nameRef?`<c:tx><c:strRef><c:f>${f(a.nameRef)}</c:f></c:strRef></c:tx>`:`<c:tx><c:v>${f(a.name||"Series")}</c:v></c:tx>`}function R(a,l){const e=10+l*2,r=100+l*2,i=200+l*2,o=a.varyColors!==!1?"1":"0",p=a.legendPos??(a.series.length===1&&o==="1"?"r":"b"),t=a.kind,g=a.barDir??"col",d=a.grouping??"clustered",h=a.series.map((c,x)=>{var m;const u=t==="scatter"||t==="line"||t==="combo"&&((m=a.lineSeriesIndexes)!=null&&m.includes(x))?'<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>':"";return{ser:c,i:x,marker:u}}),n=(c,x,u)=>{var y;const m=t==="bar"||t==="combo",P=t==="pie"||t==="doughnut",w=F(c.color,m),b=P&&x===0?A(a.sliceColors):"";return t==="scatter"&&c.xValuesRef?`<c:ser>
  <c:idx val="${x}"/>
  <c:order val="${x}"/>
  ${C(c)}
  ${w}
  ${u}
  <c:xVal><c:numRef><c:f>${f(c.xValuesRef)}</c:f></c:numRef></c:xVal>
  <c:yVal><c:numRef><c:f>${f(c.valuesRef)}</c:f></c:numRef></c:yVal>
</c:ser>`:`<c:ser>
  <c:idx val="${x}"/>
  <c:order val="${x}"/>
  ${C(c)}
  ${w}
  ${b}
  ${u}
  <c:cat><c:strRef><c:f>${f(c.catsRef)}</c:f></c:strRef></c:cat>
  <c:val><c:numRef><c:f>${f(c.valuesRef)}</c:f></c:numRef></c:val>
  ${t==="line"||t==="area"||t==="combo"&&((y=a.lineSeriesIndexes)!=null&&y.includes(x))?`<c:smooth val="${a.smooth?"1":"0"}"/>`:""}
</c:ser>`};let s="";if(t==="scatter")s=`<c:scatterChart>
  <c:scatterStyle val="marker"/>
  <c:varyColors val="0"/>
  ${h.map(c=>n(c.ser,c.i,c.marker)).join("")}
  <c:axId val="${e}"/>
  <c:axId val="${r}"/>
</c:scatterChart>`;else if(t==="combo"){const c=new Set(a.lineSeriesIndexes??[a.series.length-1]),x=h.filter(m=>!c.has(m.i)),u=h.filter(m=>c.has(m.i));s=`<c:barChart>
  <c:barDir val="col"/>
  <c:grouping val="clustered"/>
  <c:varyColors val="${o}"/>
  ${x.map(m=>n(m.ser,m.i,"")).join("")}
  <c:axId val="${e}"/>
  <c:axId val="${r}"/>
</c:barChart>
<c:lineChart>
  <c:grouping val="standard"/>
  <c:varyColors val="0"/>
  ${u.map(m=>n(m.ser,m.i,m.marker)).join("")}
  <c:marker val="1"/>
  <c:axId val="${e}"/>
  <c:axId val="${i}"/>
</c:lineChart>`}else if(t==="pie"||t==="doughnut"){const c=t==="doughnut"?`<c:holeSize val="${Math.max(1,Math.min(90,a.holeSize??50))}"/>`:"";s=`<c:${t}Chart>
  <c:varyColors val="1"/>
  ${h.map(x=>n(x.ser,x.i,"")).join("")}
  <c:firstSliceAng val="0"/>
  ${c}
</c:${t}Chart>`}else t==="bar"?s=`<c:barChart>
  <c:barDir val="${g}"/>
  <c:grouping val="${d}"/>
  <c:varyColors val="${o}"/>
  ${h.map(c=>n(c.ser,c.i,"")).join("")}
  <c:axId val="${e}"/>
  <c:axId val="${r}"/>
</c:barChart>`:t==="area"?s=`<c:areaChart>
  <c:grouping val="standard"/>
  <c:varyColors val="${o}"/>
  ${h.map(c=>n(c.ser,c.i,"")).join("")}
  <c:axId val="${e}"/>
  <c:axId val="${r}"/>
</c:areaChart>`:s=`<c:lineChart>
  <c:grouping val="standard"/>
  <c:varyColors val="${o}"/>
  ${h.map(c=>n(c.ser,c.i,c.marker)).join("")}
  <c:marker val="1"/>
  <c:axId val="${e}"/>
  <c:axId val="${r}"/>
</c:lineChart>`;const v=t==="combo"?`<c:valAx>
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
        <c:axId val="${i}"/>
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
      </c:valAx>`,$=t==="pie"||t==="doughnut"?"":t==="scatter"?`<c:valAx>
        <c:axId val="${e}"/>
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
        <c:crossAx val="${e}"/>
        <c:crosses val="autoZero"/>
      </c:valAx>`:`<c:catAx>
        <c:axId val="${e}"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="${g==="bar"?"l":"b"}"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="${r}"/>
        <c:crosses val="autoZero"/>
        <c:auto val="1"/>
      </c:catAx>
      ${v}`;return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
      ${$}
    </c:plotArea>
    <c:legend>
      <c:legendPos val="${p}"/>
      <c:overlay val="0"/>
    </c:legend>
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
</c:chartSpace>`}function T(a){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
${a.map((e,r)=>{const{spec:i}=e,o=r+2,p=r+1;return`<xdr:oneCellAnchor>
  <xdr:from><xdr:col>${i.anchorCol??0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${i.anchorRow+1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
  <xdr:ext cx="9144000" cy="3429000"/>
  <xdr:graphicFrame macro="">
    <xdr:nvGraphicFramePr>
      <xdr:cNvPr id="${o}" name="Chart ${e.chartNumber}"/>
      <xdr:cNvGraphicFramePr/>
    </xdr:nvGraphicFramePr>
    <xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>
    <a:graphic>
      <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart">
        <c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId${p}"/>
      </a:graphicData>
    </a:graphic>
  </xdr:graphicFrame>
  <xdr:clientData/>
</xdr:oneCellAnchor>`}).join("")}
</xdr:wsDr>`}function I(a){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${a.map((e,r)=>`<Relationship Id="rId${r+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${e.chartNumber}.xml"/>`).join("")}</Relationships>`}function S(a){return String(a).replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'")}async function D(a,l="Charts"){var n,s,v;const e=await((n=a.file("xl/workbook.xml"))==null?void 0:n.async("string"));if(!e)return null;const r=await((s=a.file("xl/_rels/workbook.xml.rels"))==null?void 0:s.async("string"));if(!r)return null;const o=[...e.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].find($=>S($[1])===l);if(!o)return null;const p=o[2],t=(v=r.match(new RegExp(`Id="${p}"[^>]*Target="([^"]+)"`)))==null?void 0:v[1];if(!t)return null;const g=t.startsWith("/")?t.slice(1):`xl/${t.replace(/^\.\//,"")}`,h=`xl/worksheets/_rels/${g.split("/").pop()}.rels`;return{sheetPath:g,relsPath:h}}function j(a,l){return/<drawing\b/.test(a)?a:a.includes("</worksheet>")?a.replace("</worksheet>",`<drawing r:id="${l}"/></worksheet>`):a}function M(a,l,e){const r=`../drawings/${e}`;return a?a.includes(`Id="${l}"`)?a.replace(new RegExp(`(<Relationship[^>]*Id="${l}"[^>]*Target=")[^"]*(")`),`$1${r}$2`):a.replace("</Relationships>",`<Relationship Id="${l}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="${r}"/>
</Relationships>`):`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="${l}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="${r}"/>
</Relationships>`}function G(a,l,e){let r=a;for(const i of e){const o=`/xl/drawings/${i}`;r.includes(`PartName="${o}"`)||(r=r.replace("</Types>",`<Override PartName="${o}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
</Types>`))}for(let i=1;i<=l;i++){const o=`/xl/charts/chart${i}.xml`;r.includes(`PartName="${o}"`)||(r=r.replace("</Types>",`<Override PartName="${o}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
</Types>`))}return r}function N(a){let l=1;for(;a.file(`xl/drawings/drawing${l}.xml`);)l+=1;return`drawing${l}.xml`}async function J(a,l,e="Charts"){if(!l.length)return a instanceof Uint8Array?a:new Uint8Array(a);const r=await k.loadAsync(a);for(let d=0;d<l.length;d++)r.file(`xl/charts/chart${d+1}.xml`,R(l[d],d));const i=new Map;l.forEach((d,h)=>{const n=d.targetSheet||e,s=i.get(n)??[];s.push({spec:d,chartNumber:h+1}),i.set(n,s)});const o=[];let p=0;for(const[d,h]of i){const n=await D(r,d);if(!n)throw new Error(`Charts sheet "${d}" not found in workbook package`);p+=1;const s=N(r);o.push(s),r.file(`xl/drawings/${s}`,T(h)),r.file(`xl/drawings/_rels/${s}.rels`,I(h));const v=`rIdDrawing${p}`,$=await r.file(n.sheetPath).async("string");r.file(n.sheetPath,j($,v));const c=r.file(n.relsPath)?await r.file(n.relsPath).async("string"):null;r.file(n.relsPath,M(c,v,s))}const t=await r.file("[Content_Types].xml").async("string");return r.file("[Content_Types].xml",G(t,l.length,o)),await r.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:6}})}export{J as injectNativeMeteoCharts};
