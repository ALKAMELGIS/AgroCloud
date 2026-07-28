import{J as y}from"./GisUploadCloudSources-dZOwoU-7.js";import"./index-Bc25Iq7O.js";import"./vendor-charts-D6N5B1lb.js";import"./vendor-react-CSwq0y0b.js";/* empty css                     */import"./gisContentPortalStore-Df4YDijQ.js";import"./arcgisAttributeDisplay-BRGARB84.js";function g(a){return String(a).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function w(a){return a.nameRef?`<c:tx><c:strRef><c:f>${g(a.nameRef)}</c:f></c:strRef></c:tx>`:`<c:tx><c:v>${g(a.name||"Series")}</c:v></c:tx>`}function C(a,t){const e=10+t*2,r=100+t*2,l=200+t*2,n=a.varyColors!==!1?"1":"0",v=a.legendPos??(a.series.length===1&&n==="1"?"r":"b"),o=a.kind,i=a.barDir??"col",f=a.grouping??"clustered",s=a.series.map((c,h)=>{var d;const u=o==="scatter"||o==="line"||o==="combo"&&((d=a.lineSeriesIndexes)!=null&&d.includes(h))?'<c:marker><c:symbol val="circle"/><c:size val="5"/></c:marker>':"";return{ser:c,i:h,marker:u}}),m=(c,h,u)=>{var d;return o==="scatter"&&c.xValuesRef?`<c:ser>
  <c:idx val="${h}"/>
  <c:order val="${h}"/>
  ${w(c)}
  ${u}
  <c:xVal><c:numRef><c:f>${g(c.xValuesRef)}</c:f></c:numRef></c:xVal>
  <c:yVal><c:numRef><c:f>${g(c.valuesRef)}</c:f></c:numRef></c:yVal>
</c:ser>`:`<c:ser>
  <c:idx val="${h}"/>
  <c:order val="${h}"/>
  ${w(c)}
  ${u}
  <c:cat><c:strRef><c:f>${g(c.catsRef)}</c:f></c:strRef></c:cat>
  <c:val><c:numRef><c:f>${g(c.valuesRef)}</c:f></c:numRef></c:val>
  ${o==="line"||o==="area"||o==="combo"&&((d=a.lineSeriesIndexes)!=null&&d.includes(h))?'<c:smooth val="0"/>':""}
</c:ser>`};let x="";if(o==="scatter")x=`<c:scatterChart>
  <c:scatterStyle val="marker"/>
  <c:varyColors val="0"/>
  ${s.map(c=>m(c.ser,c.i,c.marker)).join("")}
  <c:axId val="${e}"/>
  <c:axId val="${r}"/>
</c:scatterChart>`;else if(o==="combo"){const c=new Set(a.lineSeriesIndexes??[a.series.length-1]),h=s.filter(d=>!c.has(d.i)),u=s.filter(d=>c.has(d.i));x=`<c:barChart>
  <c:barDir val="col"/>
  <c:grouping val="clustered"/>
  <c:varyColors val="${n}"/>
  ${h.map(d=>m(d.ser,d.i,"")).join("")}
  <c:axId val="${e}"/>
  <c:axId val="${r}"/>
</c:barChart>
<c:lineChart>
  <c:grouping val="standard"/>
  <c:varyColors val="0"/>
  ${u.map(d=>m(d.ser,d.i,d.marker)).join("")}
  <c:marker val="1"/>
  <c:axId val="${e}"/>
  <c:axId val="${l}"/>
</c:lineChart>`}else o==="bar"?x=`<c:barChart>
  <c:barDir val="${i}"/>
  <c:grouping val="${f}"/>
  <c:varyColors val="${n}"/>
  ${s.map(c=>m(c.ser,c.i,"")).join("")}
  <c:axId val="${e}"/>
  <c:axId val="${r}"/>
</c:barChart>`:o==="area"?x=`<c:areaChart>
  <c:grouping val="standard"/>
  <c:varyColors val="${n}"/>
  ${s.map(c=>m(c.ser,c.i,"")).join("")}
  <c:axId val="${e}"/>
  <c:axId val="${r}"/>
</c:areaChart>`:x=`<c:lineChart>
  <c:grouping val="standard"/>
  <c:varyColors val="${n}"/>
  ${s.map(c=>m(c.ser,c.i,c.marker)).join("")}
  <c:marker val="1"/>
  <c:axId val="${e}"/>
  <c:axId val="${r}"/>
</c:lineChart>`;const p=o==="combo"?`<c:valAx>
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
      </c:valAx>`,$=o==="scatter"?`<c:valAx>
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
        <c:axPos val="${i==="bar"?"l":"b"}"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        <c:crossAx val="${r}"/>
        <c:crosses val="autoZero"/>
        <c:auto val="1"/>
      </c:catAx>
      ${p}`;return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
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
      ${x}
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
${a.map((e,r)=>{const{spec:l}=e,n=r+2,v=r+1;return`<xdr:oneCellAnchor>
  <xdr:from><xdr:col>${l.anchorCol??0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${l.anchorRow+1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from>
  <xdr:ext cx="9144000" cy="3429000"/>
  <xdr:graphicFrame macro="">
    <xdr:nvGraphicFramePr>
      <xdr:cNvPr id="${n}" name="Chart ${e.chartNumber}"/>
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
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${a.map((e,r)=>`<Relationship Id="rId${r+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${e.chartNumber}.xml"/>`).join("")}</Relationships>`}async function P(a,t="Charts"){var m,x,p;const e=await((m=a.file("xl/workbook.xml"))==null?void 0:m.async("string"));if(!e)return null;const r=await((x=a.file("xl/_rels/workbook.xml.rels"))==null?void 0:x.async("string"));if(!r)return null;const n=[...e.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)].find($=>$[1]===t);if(!n)return null;const v=n[2],o=(p=r.match(new RegExp(`Id="${v}"[^>]*Target="([^"]+)"`)))==null?void 0:p[1];if(!o)return null;const i=o.startsWith("/")?o.slice(1):`xl/${o.replace(/^\.\//,"")}`,s=`xl/worksheets/_rels/${i.split("/").pop()}.rels`;return{sheetPath:i,relsPath:s}}function R(a,t){return a.includes("drawing")?a.replace(/<drawing[^/]*\/>/,`<drawing r:id="${t}"/>`):a.includes("</worksheet>")?a.replace("</worksheet>",`<drawing r:id="${t}"/></worksheet>`):a}function A(a,t,e){const r=`../drawings/${e}`;return a?a.includes('/drawing"')?a.replace(/Target="[^"]*drawings\/[^"]*"/,`Target="${r}"`):a.replace("</Relationships>",`<Relationship Id="${t}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="${r}"/>
</Relationships>`):`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="${t}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="${r}"/>
</Relationships>`}function T(a,t,e){let r=a;for(let l=1;l<=e;l++){const n=`/xl/drawings/drawing${l}.xml`;r.includes(`PartName="${n}"`)||(r=r.replace("</Types>",`<Override PartName="${n}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>
</Types>`))}for(let l=1;l<=t;l++){const n=`/xl/charts/chart${l}.xml`;r.includes(`PartName="${n}"`)||(r=r.replace("</Types>",`<Override PartName="${n}" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>
</Types>`))}return r}async function N(a,t,e="Charts"){if(!t.length)return a instanceof Uint8Array?a:new Uint8Array(a);const r=await y.loadAsync(a);for(let i=0;i<t.length;i++)r.file(`xl/charts/chart${i+1}.xml`,C(t[i],i));const l=new Map;t.forEach((i,f)=>{const s=i.targetSheet||e,m=l.get(s)??[];m.push({spec:i,chartNumber:f+1}),l.set(s,m)});let n=0;for(const[i,f]of l){const s=await P(r,i);if(!s)throw new Error(`Charts sheet "${i}" not found in workbook package`);n+=1;const m=`drawing${n}.xml`;r.file(`xl/drawings/${m}`,k(f)),r.file(`xl/drawings/_rels/${m}.rels`,b(f));const x=`rIdDrawing${n}`,p=await r.file(s.sheetPath).async("string");r.file(s.sheetPath,R(p,x));const $=r.file(s.relsPath)?await r.file(s.relsPath).async("string"):null;r.file(s.relsPath,A($,x,m))}const v=await r.file("[Content_Types].xml").async("string");return r.file("[Content_Types].xml",T(v,t.length,n)),await r.generateAsync({type:"uint8array",compression:"DEFLATE",compressionOptions:{level:6}})}export{N as injectNativeMeteoCharts};
