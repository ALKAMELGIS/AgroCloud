const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/vendor-geotiff-LX1WARUP.js","assets/vendor-react-CARSxlZT.js","assets/vendor-pdf-hBPLbwUL.js"])))=>i.map(i=>d[i]);
import{H as re,I as ne}from"./acpImageryTimeSeries-Crs_cybM.js";import{f as he}from"./openMeteoWeather-BqIqKAD7.js";import{_ as z}from"./vendor-pdf-hBPLbwUL.js";const X=6378137;function j(e){return e*Math.PI/180}function K(e){const t=e.length;if(t<3)return 0;let a=0;for(let r=0;r<t;r+=1){let i,n,l;r===t-2?(i=t-2,n=t-1,l=0):r===t-1?(i=t-1,n=0,l=1):(i=r,n=r+1,l=r+2);const o=e[i],c=e[n],s=e[l];a+=(j(s[0])-j(o[0]))*Math.sin(j(c[1]))}return a*X*X/2}function Y(e){if(!e.length)return 0;let t=Math.abs(K(e[0]));for(let a=1;a<e.length;a+=1)t-=Math.abs(K(e[a]));return Math.max(0,t)}function fe(e){return e?e.type==="Feature"&&e.geometry?e.geometry:e:null}function le(e){const t=fe(e);if(!t||!t.type)return null;let a=0,r=0,i=0,n=0,l=1/0,o=1/0,c=-1/0,s=-1/0;const u=b=>{const v=Number(b[0]),h=Number(b[1]);!Number.isFinite(v)||!Number.isFinite(h)||(r+=v,i+=h,n+=1,v<l&&(l=v),h<o&&(o=h),v>c&&(c=v),h>s&&(s=h))},p=(b,v)=>{if(Array.isArray(b)){if(v===0){u(b);return}for(const h of b)p(h,v-1)}},w=t.coordinates;switch(t.type){case"Polygon":a=Y(w),p(w,2);break;case"MultiPolygon":for(const b of w||[])a+=Y(b);p(w,3);break;case"Point":p(w,0);break;case"LineString":case"MultiPoint":p(w,1);break;case"MultiLineString":p(w,2);break;default:return null}return{type:t.type,areaM2:a,centroid:n>0?[r/n,i/n]:null,bbox:n>0?[l,o,c,s]:null,vertexCount:n}}function q(e){return typeof e=="number"&&Number.isFinite(e)?e.toFixed(5):"—"}function ge(e){if(!Number.isFinite(e)||e<=0)return"0 m²";const t=e/1e4,a=e/1e6,r=t>=100?t.toFixed(0):t>=1?t.toFixed(1):t.toFixed(2),i=Math.round(e).toLocaleString("en-US"),n=a>=.01?` · ${a.toFixed(2)} km²`:"";return`${r} ha (${i} m²${n})`}function Ge(e){var c,s,u,p,w,b,v,h;if(!e)return"";const t=[],a=e.camera;if(a&&(a.longitude!=null||a.latitude!=null||a.zoom!=null)){const d=a.is3D||typeof a.pitch=="number"&&a.pitch>1?`3D (pitch ${Math.round(a.pitch??0)}°, bearing ${Math.round(a.bearing??0)}°)`:"2D",m=typeof a.zoom=="number"?a.zoom.toFixed(1):"—";t.push(`- Camera: center ${q(a.longitude)},${q(a.latitude)} · zoom ${m} · ${d}`)}(c=e.basemapLabel)!=null&&c.trim()&&t.push(`- Basemap: ${e.basemapLabel.trim()}`);const r=le(e.aoiGeometry);if(r&&r.centroid){const d=r.centroid,m=r.bbox,f=r.areaM2>0?` · area ${ge(r.areaM2)}`:"",y=m?` · bbox [${m[0].toFixed(4)}, ${m[1].toFixed(4)}, ${m[2].toFixed(4)}, ${m[3].toFixed(4)}]`:"";t.push(`- AOI: ${r.type.toLowerCase()}${f} · centroid ${d[0].toFixed(5)},${d[1].toFixed(5)}${y}`)}else t.push("- AOI: none drawn (no analysis boundary yet)");const i=e.toolbox;if(i){const d=[];d.push(i.hasAoi?"AOI drawn":"no AOI"),i.drawingActive&&d.push("drawing active"),i.cropAiPanelOpen&&d.push("Crop AI open"),i.imageryTimeSeriesOpen&&d.push("Imagery Time Series open"),i.mapSwipeOpen&&d.push("MapSwipe open"),(s=i.openSection)!=null&&s.trim()&&d.push(`dock=${i.openSection.trim()}`),t.push(`- Toolbox: ${d.join(" · ")}`),(u=i.availableTools)!=null&&u.length&&t.push(`  Available analysis tools: ${i.availableTools.slice(0,12).join(", ")}`)}const n=e.activeAnalysis;if(n!=null&&n.label){const d=[n.label];if(n.acquisitionDate&&d.push(`scene ${n.acquisitionDate}`),typeof n.resolutionMeters=="number"&&d.push(`${n.resolutionMeters} m/px`),typeof n.meanValue=="number"&&Number.isFinite(n.meanValue)&&d.push(`AOI mean ${n.meanValue.toFixed(3)}`),t.push(`- Active analysis: ${d.join(" · ")}`),(p=n.classes)!=null&&p.length){t.push("  Legend classes (live per-class area):");for(const m of n.classes){const f=typeof m.areaHa=="number"&&m.areaHa>0?`${m.areaHa>=100?m.areaHa.toFixed(0):m.areaHa>=1?m.areaHa.toFixed(1):m.areaHa.toFixed(2)} ha`:null,y=typeof m.pct=="number"&&Number.isFinite(m.pct)?`${m.pct.toFixed(1)}%`:null,A=[f,y].filter(Boolean).join(" · ");t.push(`    • ${m.name}${A?` — ${A}`:""}`)}}else(w=n.note)!=null&&w.trim()&&t.push(`  (${n.note.trim()})`)}if((b=e.layers)!=null&&b.length){const d=e.layers.slice(0,30);t.push("- Layers (top → bottom of the map stack):");for(const m of d){const f=m.visible===!1?"off":"on",y=m.kind?`, ${m.kind}`:"",A=typeof m.featureCount=="number"?`, ${m.featureCount} features`:"",E=typeof m.opacity=="number"&&Number.isFinite(m.opacity)&&m.opacity<.999?`, opacity ${Math.round(m.opacity*100)}%`:"",we=m.crs?`, ${m.crs}`:"";t.push(`    • [${f}] ${m.name}${y}${A}${E}${we}`)}}const l=e.selectedFeature;if(l&&(l.lng!=null||(v=l.attributes)!=null&&v.length)){const d=l.lng!=null&&l.lat!=null?` @ ${l.lng.toFixed(5)},${l.lat.toFixed(5)}`:"",m=(h=l.attributes)!=null&&h.length?` — ${l.attributes.slice(0,8).map(f=>`${f.label}: ${f.value}`).join(", ")}`:"";t.push(`- Selected feature: ${l.layerName||"Location"}${d}${m}`)}const o=e.basemapFeatures;if(o!=null&&o.length){t.push("- Basemap places / POIs near the current view (read live from the basemap):");for(const d of o.slice(0,14)){const m=d.category?`, ${d.category}`:"";let f="";typeof d.distanceM=="number"&&Number.isFinite(d.distanceM)&&(f=d.distanceM<950?` · ~${Math.round(d.distanceM/10)*10} m`:` · ~${(d.distanceM/1e3).toFixed(d.distanceM<9500?1:0)} km`);const y=typeof d.lng=="number"&&typeof d.lat=="number"?` @ ${d.lng.toFixed(5)},${d.lat.toFixed(5)}`:"";t.push(`    • ${d.name}${m}${f}${y}`)}}return t.length?["### LIVE MAP STATE","(Authoritative snapshot of exactly what the user currently sees on the map. Treat these as facts; never ask the user to describe the map, AOI, layers, or analysis — read them here. Numbers below are measured/computed from the live map.)",...t].join(`
`):""}const be=1/3.6;function C(e){return e.length?e.reduce((t,a)=>t+a,0)/e.length:null}function W(e){return e.length?e.reduce((t,a)=>t+a,0):null}function ve(e,t){if(e.length!==t.length||e.length<3)return null;const a=e.length,r=e.reduce((s,u)=>s+u,0)/a,i=t.reduce((s,u)=>s+u,0)/a;let n=0,l=0,o=0;for(let s=0;s<a;s++){const u=e[s]-r,p=t[s]-i;n+=u*p,l+=u*u,o+=p*p}const c=Math.sqrt(l*o);return c?n/c:null}function ie(e){return e==null||!Number.isFinite(e)?null:Number((e*be).toFixed(3))}function xe(e){const t=new Map;for(const a of e){const r=a.time.trim().slice(0,10);if(!r)continue;t.has(r)||t.set(r,{temps:[],humids:[],rains:[],winds:[]});const i=t.get(r);a.temperatureC!=null&&Number.isFinite(a.temperatureC)&&i.temps.push(a.temperatureC),a.humidityPct!=null&&Number.isFinite(a.humidityPct)&&i.humids.push(a.humidityPct),a.precipitationMm!=null&&Number.isFinite(a.precipitationMm)&&i.rains.push(a.precipitationMm);const n=ie(a.windSpeedKmh);n!=null&&i.winds.push(n)}return[...t.entries()].sort(([a],[r])=>a.localeCompare(r)).map(([a,r])=>({date:a,temperatureC:C(r.temps),humidityPct:C(r.humids),rainfallMm:W(r.rains),windSpeedMs:C(r.winds)}))}function ye(e,t,a,r){const i=new Map(t.map((l,o)=>[l,a[o]??l])),n=new Map;for(const l of e){const o=re(l.date,r);if(!o||!i.has(o))continue;n.has(o)||n.set(o,{temps:[],humids:[],rains:[],winds:[]});const c=n.get(o);l.temperatureC!=null&&c.temps.push(l.temperatureC),l.humidityPct!=null&&c.humids.push(l.humidityPct),l.rainfallMm!=null&&c.rains.push(l.rainfallMm),l.windSpeedMs!=null&&c.winds.push(l.windSpeedMs)}return t.map(l=>{const o=n.get(l);return{periodKey:l,displayLabel:i.get(l)??ne(l,r),temperatureC:o?C(o.temps):null,humidityPct:o?C(o.humids):null,rainfallMm:o?W(o.rains):null,windSpeedMs:o?C(o.winds):null}})}function $e(e){const t=e.map(n=>n.temperatureC).filter(n=>n!=null&&Number.isFinite(n)),a=e.map(n=>n.humidityPct).filter(n=>n!=null&&Number.isFinite(n)),r=e.map(n=>n.rainfallMm).filter(n=>n!=null&&Number.isFinite(n)),i=e.map(n=>n.windSpeedMs).filter(n=>n!=null&&Number.isFinite(n));return{avgTemperatureC:C(t),totalRainfallMm:W(r),avgHumidityPct:C(a),avgWindSpeedMs:C(i)}}function Me(e,t){const a=[],r=[{layerId:"NDVI",label:"vegetation vigor (NDVI)"},{layerId:"NDMI",label:"canopy moisture (NDMI)"},{layerId:"NDWI",label:"surface water (NDWI)"}];for(const{layerId:n,label:l}of r){const o=t.find(w=>w.layerId.toUpperCase()===n);if(!o)continue;const c=w=>{const b=[],v=[];for(let h=0;h<e.length;h++){const d=o.values[h],m=w(e[h]);d==null||!Number.isFinite(d)||m==null||!Number.isFinite(m)||(b.push(d),v.push(m))}return ve(b,v)},s=c(w=>w.temperatureC),u=c(w=>w.rainfallMm),p=c(w=>w.humidityPct);s!=null&&Math.abs(s)>=.35&&a.push(`${l} shows a ${s>0?"positive":"negative"} association with temperature (r≈${s.toFixed(2)}) — ${s>0?"warmer periods align with higher index values; monitor heat stress if temperatures rise further.":"cooler periods align with higher index values; heat may be limiting canopy performance."}`),u!=null&&Math.abs(u)>=.35&&a.push(`${l} correlates ${u>0?"positively":"negatively"} with rainfall (r≈${u.toFixed(2)}) — ${u>0?"precipitation events support vegetation response in this period.":"index peaks occur during drier periods; verify irrigation or residual soil moisture."}`),p!=null&&Math.abs(p)>=.35&&a.push(`${l} tracks humidity ${p>0?"upward":"downward"} (r≈${p.toFixed(2)}) — atmospheric moisture ${p>0?"supports":"may lag"} canopy condition signals from satellite.`)}const i=t[0];return i&&a.length===0&&a.push(`Weather and ${i.layerId.toUpperCase()} co-varied within normal bounds for the selected period — no strong linear correlation was detected; interpret satellite trends alongside field scouting.`),a.slice(0,5)}async function Ue(e){const t=e.geometry?le(e.geometry):null,a=t==null?void 0:t.centroid;if(!a||a.length<2)return null;const r=a[1],i=a[0],n=e.fromDate.trim().slice(0,10),l=e.toDate.trim().slice(0,10);if(!n||!l||n>=l)return null;let o;try{o=await he(r,i,n,l)}catch{return null}const c=xe(o.points),s=ye(c,e.chartLabels,e.displayLabels,e.timeAggregation);if(!s.some(w=>w.temperatureC!=null||w.rainfallMm!=null))return null;const u=$e(s),p=Me(s,e.layerSeries);return{timezone:o.timezone,lat:r,lng:i,aggregation:e.timeAggregation,points:s,hourlyPoints:o.points,summary:u,correlationNotes:p,dataSource:"Open-Meteo ERA5 archive (AOI centroid)"}}const Pe="http://schemas.openxmlformats.org/wordprocessingml/2006/main",G="http://schemas.openxmlformats.org/officeDocument/2006/relationships",Ce="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",T="http://schemas.openxmlformats.org/drawingml/2006/main",O="http://schemas.openxmlformats.org/drawingml/2006/picture",F="1F4D2C",oe="3F7D4F",P="6B6B6B",I="444444",Z=18,se=20,Fe=5029200,Ae=3200400,Xe=3657600,Ie=2057400,Se=1543050,J=12,S=3,Le=3108960,Ne=2331720,Ke=4572e3,Ye=2286e3,V="http://schemas.openxmlformats.org/drawingml/2006/chart",De='<w:sectPr w:rsidR="003D6795"><w:headerReference w:type="default" r:id="rIdHdr"/><w:footerReference w:type="default" r:id="rIdFtr"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="648" w:right="648" w:bottom="648" w:left="648" w:header="432" w:footer="432" w:gutter="0"/><w:cols w:space="720"/><w:docGrid w:linePitch="320"/></w:sectPr>';function Te(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function x(e,t={}){const a=[];t.bold&&a.push("<w:b/><w:bCs/>"),t.italic&&a.push("<w:i/><w:iCs/>"),t.color&&a.push(`<w:color w:val="${t.color}"/>`),t.size&&a.push(`<w:sz w:val="${t.size}"/><w:szCs w:val="${t.size}"/>`);const r=a.length?`<w:rPr>${a.join("")}</w:rPr>`:"",i=e.startsWith(" ")||e.endsWith(" ")?' xml:space="preserve"':"";return`<w:r>${r}<w:t${i}>${Te(e)}</w:t></w:r>`}function _(e,t=80,a){const r=a!=null&&a.keepNext?"<w:keepNext/>":"",i=(a==null?void 0:a.spacingBefore)!=null?` w:before="${a.spacingBefore}"`:"";return`<w:p><w:pPr>${r}<w:spacing${i} w:after="${t}" w:line="240" w:lineRule="auto"/></w:pPr>${e}</w:p>`}function qe(e){return`<w:p><w:pPr><w:spacing w:after="40"/></w:pPr>${x(e,{bold:!0,color:F,size:36})}</w:p>`}function Ze(e){return`<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="4" w:color="${F}"/></w:pBdr><w:spacing w:after="100"/></w:pPr>${x(e,{color:oe,size:24})}</w:p>`}function Je(e){return`<w:p><w:pPr><w:spacing w:after="20"/></w:pPr>${e.map(a=>x(a.text,{italic:a.italic??!0,color:P,size:17})).join("")}</w:p>`}function Qe(e,t=!0,a=1){const r=a===1?"Heading1":"Heading2",i=a===1?22:20;return`<w:p><w:pPr><w:pStyle w:val="${r}"/>${t?"<w:keepNext/>":""}<w:spacing w:before="${a===1?100:80}" w:after="40" w:line="240" w:lineRule="auto"/><w:outlineLvl w:val="${a-1}"/></w:pPr>${x(e,{bold:!0,color:F,size:i})}</w:p>`}function et(e){return _(x(e,{color:I,size:se}),80)}function tt(e){return _(x(e,{italic:!0,color:P,size:17}),60,{keepNext:!0})}function at(e){const t=l=>`<w:p><w:pPr><w:spacing w:before="0" w:after="${l}"/></w:pPr></w:p>`,a=(l,o)=>`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="80"/></w:pPr>${x(l,o)}</w:p>`,r=(l,o)=>`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="40"/></w:pPr>${x(l+"  ",{bold:!0,color:F,size:20})}${x(o,{color:I,size:20})}</w:p>`,i=e.reportTitle??"Agricultural Satellite Intelligence Report",n=e.reportSubtitle??"Imagery Time Series Analysis";return[t(1200),a("AGROCLOUD",{bold:!0,color:F,size:28}),a("SATELLITE INTELLIGENCE",{bold:!0,color:oe,size:22}),t(200),`<w:p><w:pPr><w:jc w:val="center"/><w:pBdr><w:bottom w:val="single" w:sz="18" w:space="1" w:color="${F}"/></w:pBdr><w:spacing w:after="200"/></w:pPr>${x(" ",{size:2})}</w:p>`,a(i,{bold:!0,color:I,size:36}),a(n,{italic:!0,color:P,size:24}),t(400),r("Project",e.projectName),r("AOI / Field",`${e.fieldName}  ·  ${e.areaHa}`),r("Monitoring period",e.periodLabel),r("Observations",String(e.obsCount)),r("Indices",e.layerIdsLabel||"—"),...e.extraMeta?[r(e.extraMeta.label,e.extraMeta.value)]:[],r("Satellite source",e.satelliteSource),t(600),a(`Prepared by ${e.generatedBy}`,{color:P,size:18}),a(e.generatedStamp,{color:P,size:18}),t(400),a("Confidential · For professional agricultural monitoring use",{italic:!0,color:P,size:16}),U()].join("")}function rt(e){const t=' TOC \\o "1-1" \\h \\z \\u ',a=e.length>0?e.map(r=>`<w:p><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9360"/></w:tabs><w:spacing w:after="80"/></w:pPr>${x(r,{bold:!0,color:I,size:20})}${x("	",{size:20})}${x("—",{color:P,size:20})}</w:p>`).join(""):`<w:p>${x("Updating table of contents…",{italic:!0,color:P,size:18})}</w:p>`;return[`<w:p><w:pPr><w:spacing w:after="120"/></w:pPr>${x("Table of Contents",{bold:!0,color:F,size:32})}</w:p>`,_(x("Main section titles only. Page numbers appear automatically when this document is opened in Microsoft Word.",{italic:!0,color:P,size:17}),160),`<w:p>
  <w:r><w:fldChar w:fldCharType="begin"/></w:r>
  <w:r><w:instrText xml:space="preserve">${t}</w:instrText></w:r>
  <w:r><w:fldChar w:fldCharType="separate"/></w:r>
</w:p>
${a}
<w:p>
  <w:r><w:fldChar w:fldCharType="end"/></w:r>
</w:p>`,U()].join("")}function Q(e,t){const a=t.header?F:"auto",r=t.header?"FFFFFF":I,i=t.align==="center"?'<w:pPr><w:jc w:val="center"/><w:spacing w:before="0" w:after="0" w:line="220" w:lineRule="auto"/></w:pPr>':t.align==="right"?'<w:pPr><w:jc w:val="right"/><w:spacing w:before="0" w:after="0" w:line="220" w:lineRule="auto"/></w:pPr>':'<w:pPr><w:spacing w:before="0" w:after="0" w:line="220" w:lineRule="auto"/></w:pPr>',n=t.header?x(e,{bold:!0,color:r,size:Z}):x(e,{color:r,size:Z});return`<w:tc><w:tcPr><w:tcW w:w="${t.width}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="${a}"/><w:tcMar><w:top w:w="28" w:type="dxa"/><w:left w:w="50" w:type="dxa"/><w:bottom w:w="28" w:type="dxa"/><w:right w:w="50" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/></w:tcPr><w:p>${i}${n}</w:p></w:tc>`}function ee(e,t=!1){return`<w:tr>${t?"<w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>":"<w:trPr><w:cantSplit/></w:trPr>"}${e.join("")}</w:tr>`}function nt(e,t,a){const r=a.map(l=>`<w:gridCol w:w="${l}"/>`).join(""),i=ee(e.map((l,o)=>Q(l,{header:!0,width:a[o],align:"center"})),!0),n=t.map(l=>ee(l.map((o,c)=>Q(o,{width:a[c],align:c===0?"left":"center"})))).join("");return`<w:tbl><w:tblPr><w:tblW w:w="10080" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/><w:insideH w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/><w:insideV w:val="single" w:sz="4" w:space="0" w:color="D9D9D9"/></w:tblBorders><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid>${r}</w:tblGrid>${i}${n}</w:tbl>`}function ce(e,t,a){return`<w:p><w:pPr><w:spacing w:after="0" w:before="0"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${t}" cy="${a}"/><wp:docPr id="1" name="Picture"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="${T}" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="${T}"><a:graphicData uri="${O}"><pic:pic xmlns:pic="${O}"><pic:nvPicPr><pic:cNvPr id="0" name="Image"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${e}" xmlns:r="${G}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${t}" cy="${a}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`}function ue(e){const t=e.map(a=>String(a||"").trim()).filter(Boolean).join(" ");return`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="0" w:before="0" w:line="200" w:lineRule="auto"/></w:pPr>${x(t,{color:I,size:14})}</w:p>`}function Be(e){const t=Math.floor(10080/S),a=e.map(n=>{const l=[n.date,n.label].filter(Boolean).join(" "),o=`${ce(n.rId,Ie,Se)}${ue([l])}`;return`<w:tc><w:tcPr><w:tcW w:w="${t}" w:type="dxa"/><w:vAlign w:val="top"/><w:tcMar><w:top w:w="40" w:type="dxa"/><w:left w:w="40" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tcMar></w:tcPr>${o}</w:tc>`}).join(""),r=S-e.length,i=r>0?Array.from({length:r},()=>`<w:tc><w:tcPr><w:tcW w:w="${t}" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p></w:tc>`).join(""):"";return`<w:tr><w:trPr><w:cantSplit/></w:trPr>${a}${i}</w:tr>`}function lt(e){if(!e.length)return"";const t=[];for(let a=0;a<e.length;a+=J){a>0&&t.push(U());const r=e.slice(a,a+J),i=[];for(let n=0;n<r.length;n+=S)i.push(Be(r.slice(n,n+S)));t.push(`<w:tbl><w:tblPr><w:tblW w:w="10080" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders></w:tblPr><w:tblGrid>${Array.from({length:S},()=>`<w:gridCol w:w="${Math.floor(10080/S)}"/>`).join("")}</w:tblGrid>${i.join("")}</w:tbl>`)}return t.join("")}function it(e){if(!e.length)return"";const t=e.slice(0,2),a=Math.max(t.length,1),r=Math.floor(10080/a),i=t.map(n=>{const l=[n.date,n.label].filter(Boolean).join(" "),o=`${ce(n.rId,Le,Ne)}${ue([l])}`;return`<w:tc><w:tcPr><w:tcW w:w="${r}" w:type="dxa"/><w:vAlign w:val="top"/><w:tcMar><w:top w:w="60" w:type="dxa"/><w:left w:w="60" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tcMar></w:tcPr>${o}</w:tc>`}).join("");return`<w:tbl><w:tblPr><w:tblW w:w="10080" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:jc w:val="center"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders></w:tblPr><w:tblGrid>${Array.from({length:a},()=>`<w:gridCol w:w="${r}"/>`).join("")}</w:tblGrid><w:tr><w:trPr><w:cantSplit/></w:trPr>${i}</w:tr></w:tbl>`}function ot(e,t=Fe,a=Ae,r){return`<w:p><w:pPr>${r!=null&&r.center?'<w:jc w:val="center"/>':""}<w:spacing w:after="40" w:before="0"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${t}" cy="${a}"/><wp:docPr id="1" name="Chart"/><a:graphic xmlns:a="${T}"><a:graphicData uri="${V}"><c:chart xmlns:c="${V}" xmlns:r="${G}" r:id="${e}"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`}function st(e){return e.map(t=>_(x(`• ${t}`,{color:I,size:se}),40)).join("")}function U(){return'<w:p><w:r><w:br w:type="page"/></w:r></w:p>'}function ct(e){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${Pe}" xmlns:r="${G}" xmlns:wp="${Ce}" xmlns:a="${T}" xmlns:pic="${O}" xmlns:c="${V}" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" mc:Ignorable="w14">
<w:body>
${e}
${De.replace("rIdHdr","rIdHdr").replace("rIdFtr","rIdFtr")}
</w:body>
</w:document>`}function $(e){return String(e).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}function N(e){const t=e.map((a,r)=>a==null||!Number.isFinite(a)?`<c:pt idx="${r}"><c:v></c:v></c:pt>`:`<c:pt idx="${r}"><c:v>${a}</c:v></c:pt>`).join("");return`<c:numLit><c:ptCount val="${e.length}"/>${t}</c:numLit>`}function Re(e){const t=e.map((a,r)=>`<c:pt idx="${r}"><c:v>${$(a)}</c:v></c:pt>`).join("");return`<c:strLit><c:ptCount val="${e.length}"/>${t}</c:strLit>`}const B=["047857","2563EB","EA580C","0D9488","7C3AED","DC2626","CA8A04"];function L(e){const t=e.trim().toUpperCase();return t==="NDVI"||t==="SAVI"||t==="EVI"||t==="GNDVI"||t==="NDRE"||t.includes("VEG")?"047857":t==="NDWI"||t==="MNDWI"||t.includes("WATER")||t==="PRECIP"||t.includes("RAIN")?"2563EB":t==="NDMI"||t==="NDII"||t.includes("MOIST")?"0D9488":t==="LST"||t==="LSTI"||t==="ET"||t.includes("TEMP")||t.includes("THERMAL")?"DC2626":t.includes("STRESS")||t==="CHAS"||t.includes("RISK")||t.includes("ALERT")||t==="ADI"||t==="NCADI"?"CA8A04":t.includes("LULC")||t.includes("CLASS")?"334155":B[Math.abs(ke(t))%B.length]}function ke(e){let t=2166136261;for(let a=0;a<e.length;a++)t^=e.charCodeAt(a),t=Math.imul(t,16777619);return t>>>0}function me(e,t){return(e.color??B[t%B.length]).replace("#","").toUpperCase()}function _e(e,t,a,r){const i=me(e,t);return`<c:ser>
  <c:idx val="${t}"/>
  <c:order val="${r}"/>
  <c:tx><c:v>${$(e.name)}</c:v></c:tx>
  <c:spPr><a:ln w="22000"><a:solidFill><a:srgbClr val="${i}"/></a:solidFill><a:prstDash val="solid"/></a:ln></c:spPr>
  <c:marker>
    <c:symbol val="circle"/>
    <c:size val="7"/>
    <c:spPr><a:solidFill><a:srgbClr val="${i}"/></a:solidFill><a:ln w="8000"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr>
  </c:marker>
  <c:cat>${a}</c:cat>
  <c:val>${N(e.values)}</c:val>
  <c:smooth val="0"/>
</c:ser>`}function Ee(e,t,a,r){const i=me(e,t);return`<c:ser>
  <c:idx val="${t}"/>
  <c:order val="${r}"/>
  <c:tx><c:v>${$(e.name)}</c:v></c:tx>
  <c:spPr><a:solidFill><a:srgbClr val="${i}"/></a:solidFill><a:ln w="4000"><a:solidFill><a:srgbClr val="${i}"/></a:solidFill></a:ln></c:spPr>
  <c:cat>${a}</c:cat>
  <c:val>${N(e.values)}</c:val>
</c:ser>`}function R(e,t){const a=e.trim();if(!a)return"";const r=(t==null?void 0:t.size)??800;return`<c:title>
  <c:tx><c:rich>${t!=null&&t.vertical?'<a:bodyPr rot="-5400000" vert="horz" anchor="ctr"/>':'<a:bodyPr anchor="ctr"/>'}<a:lstStyle/><a:p><a:pPr><a:defRPr sz="${r}"/></a:pPr><a:r><a:rPr lang="en-US" sz="${r}" b="1"><a:solidFill><a:srgbClr val="334155"/></a:solidFill></a:rPr><a:t>${$(a)}</a:t></a:r></a:p></c:rich></c:tx>
  <c:overlay val="0"/>
</c:title>`}function k(e){const t=(e==null?void 0:e.size)??700;return`<c:txPr><a:bodyPr${(e==null?void 0:e.rotateDeg)!=null&&Number.isFinite(e.rotateDeg)?` rot="${Math.round(e.rotateDeg*6e4)}"`:""}/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${t}"/></a:pPr><a:defRPr sz="${t}"/></a:p></c:txPr>`}function de(e){const a=e.secondary?.16:.05,r=.02,i=(e.catCount??0)>8,n=(e.legendBottom?.2:.16)+(i?.06:0),l=Math.max(.45,1-.18-a),o=Math.max(.45,1-r-n);return`<c:layout>
  <c:manualLayout>
    <c:layoutTarget val="inner"/>
    <c:xMode val="edge"/>
    <c:yMode val="edge"/>
    <c:x val="${.18.toFixed(3)}"/>
    <c:y val="${r.toFixed(3)}"/>
    <c:w val="${l.toFixed(3)}"/>
    <c:h val="${o.toFixed(3)}"/>
  </c:manualLayout>
</c:layout>`}function te(e){const t=e.pos==="l"||e.pos==="r";return`<c:valAx>
  <c:axId val="${e.axId}"/>
  <c:scaling><c:orientation val="minMax"/></c:scaling>
  <c:delete val="0"/>
  <c:axPos val="${e.pos}"/>
  ${R(e.title,{vertical:t})}
  ${e.pos==="l"?'<c:majorGridlines><c:spPr><a:ln w="4000"><a:solidFill><a:srgbClr val="CBD5E1"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>':""}
  <c:numFmt formatCode="${$(e.numFmt)}" sourceLinked="0"/>
  <c:majorTickMark val="out"/>
  <c:minorTickMark val="none"/>
  <c:tickLblPos val="nextTo"/>
  ${k({size:700})}
  <c:crossAx val="${e.crossAx}"/>
  <c:crosses val="${e.crosses??"autoZero"}"/>
  <c:crossBetween val="between"/>
</c:valAx>`}function ae(e,t=8){const a=e.filter(n=>Number.isFinite(n.value)&&n.value>0).map(n=>({label:n.label,value:Number(n.value)})).sort((n,l)=>l.value-n.value);if(a.length<=t)return{labels:a.map(n=>n.label),values:a.map(n=>n.value)};const r=a.slice(0,t-1),i=a.slice(t-1).reduce((n,l)=>n+l.value,0);return{labels:[...r.map(n=>n.label),"Other"],values:[...r.map(n=>n.value),i]}}function ut(e){const t=e.kind??"line",a=Re(e.categories),r=e.hideLegend?"":`<c:legend>
      <c:legendPos val="${t==="pie"?"r":"b"}"/>
      <c:overlay val="0"/>
    </c:legend>`;if(t==="scatter")return ze(e);if(t==="pie"){const h=e.series[0],d=(h==null?void 0:h.values)??[],m=[...e.sliceColors??[],"047857","2563EB","EA580C","0D9488","7C3AED","DC2626","CA8A04","0891B2","4F46E5","B45309"],f=d.map((y,A)=>{const E=m[A%m.length];return`<c:dPt><c:idx val="${A}"/><c:spPr><a:solidFill><a:srgbClr val="${E}"/></a:solidFill><a:ln w="12000"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln></c:spPr></c:dPt>`}).join("");return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1200" b="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>${$(e.title)}</a:t></a:r></a:p></c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      <c:layout>
        <c:manualLayout>
          <c:layoutTarget val="inner"/>
          <c:xMode val="edge"/>
          <c:yMode val="edge"/>
          <c:x val="0.02"/>
          <c:y val="0.12"/>
          <c:w val="0.62"/>
          <c:h val="0.78"/>
        </c:manualLayout>
      </c:layout>
      <c:pieChart>
        <c:varyColors val="0"/>
        <c:ser>
          <c:idx val="0"/>
          <c:order val="0"/>
          <c:tx><c:v>${$((h==null?void 0:h.name)??"Share")}</c:v></c:tx>
          ${f}
          <c:cat>${a}</c:cat>
          <c:val>${N(d)}</c:val>
          <c:dLbls>
            <c:showLegendKey val="0"/>
            <c:showVal val="0"/>
            <c:showCatName val="0"/>
            <c:showPercent val="1"/>
            <c:showSerName val="0"/>
            <c:showBubbleSize val="0"/>
            <c:showLeaderLines val="0"/>
          </c:dLbls>
        </c:ser>
        <c:firstSliceAng val="0"/>
      </c:pieChart>
    </c:plotArea>
    ${r}
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
  </c:chart>
  <c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="6350"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr>
</c:chartSpace>`}const i=e.series.some(h=>h.secondaryAxis),n=e.barDir??"col",l=[];let o=0;const c=(h,d)=>{if(!h.length)return;const m=h.map(f=>{const y=e.series.indexOf(f);return Ee(f,y,a,o++)}).join("");l.push(`<c:barChart>
  <c:barDir val="${n}"/>
  <c:grouping val="clustered"/>
  <c:varyColors val="0"/>
  <c:gapWidth val="80"/>
  ${m}
  <c:axId val="1"/>
  <c:axId val="${d}"/>
</c:barChart>`)},s=(h,d)=>{if(!h.length)return;const m=h.map(f=>{const y=e.series.indexOf(f);return _e(f,y,a,o++)}).join("");l.push(`<c:lineChart>
  <c:grouping val="standard"/>
  <c:varyColors val="0"/>
  ${m}
  <c:marker val="1"/>
  <c:axId val="1"/>
  <c:axId val="${d}"/>
</c:lineChart>`)};if(t==="bar")c(e.series,2);else if(t==="combo"){const h=e.series.filter(f=>f.asBar),d=e.series.filter(f=>!f.asBar&&!f.secondaryAxis),m=e.series.filter(f=>!f.asBar&&f.secondaryAxis);c(h,2),s(d,2),s(m,3)}else i?(s(e.series.filter(h=>!h.secondaryAxis),2),s(e.series.filter(h=>h.secondaryAxis),3)):s(e.series,2);const u=i||t==="combo"&&e.series.some(h=>h.secondaryAxis&&!h.asBar),p=e.xAxisLabel&&e.xAxisLabel.trim()||(n==="bar"?"Category":"Period"),w=e.categories.length,b=n!=="bar"&&w>6,v=`
      <c:catAx>
        <c:axId val="1"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="${n==="bar"?"l":"b"}"/>
        ${R(p,{vertical:n==="bar"})}
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        ${k({size:700,rotateDeg:b?-35:void 0})}
        <c:crossAx val="2"/>
        <c:crosses val="autoZero"/>
        <c:auto val="1"/>
        <c:lblAlgn val="ctr"/>
        <c:lblOffset val="${b?160:140}"/>
      </c:catAx>
      ${te({axId:2,crossAx:1,pos:n==="bar"?"b":"l",title:e.yAxisLabel,numFmt:e.yNumFmt??"0.00"})}
      ${u?te({axId:3,crossAx:1,pos:"r",title:e.yAxisLabelSecondary??"",numFmt:e.yNumFmtSecondary??"0.0",crosses:"max"}):""}`;return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:date1904 val="0"/>
  <c:lang val="en-US"/>
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1100" b="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>${$(e.title)}</a:t></a:r></a:p></c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      ${de({secondary:u,legendBottom:!e.hideLegend&&t!=="pie",catCount:w})}
      ${l.join(`
`)}
      ${v}
    </c:plotArea>
    ${r}
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
    <c:showDLblsOverMax val="0"/>
  </c:chart>
  <c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="6350"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr>
</c:chartSpace>`}function ze(e){const t=e.scatterSeries??[],a=e.xAxisLabel??"X",r=e.yAxisLabel||"Y",i=e.xNumFmt??"0.00",n=e.yNumFmt??"0.00",l=e.hideLegend?"":`<c:legend>
      <c:legendPos val="b"/>
      <c:overlay val="0"/>
    </c:legend>`,o=t.map((c,s)=>{const u=c.points.map(h=>h.x),p=c.points.map(h=>h.y),w=(c.color??(s===0?"166534":"DC2626")).replace(/^#/,""),b=c.hideMarkers?'<c:marker><c:symbol val="none"/></c:marker>':`<c:marker>
          <c:symbol val="circle"/>
          <c:size val="7"/>
          <c:spPr>
            <a:solidFill><a:srgbClr val="${w}"/></a:solidFill>
            <a:ln w="9525"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></a:ln>
          </c:spPr>
        </c:marker>`,v=c.showLine?`<c:spPr><a:ln w="19050"><a:solidFill><a:srgbClr val="${w}"/></a:solidFill></a:ln></c:spPr>`:'<c:spPr><a:ln w="0"><a:noFill/></a:ln></c:spPr>';return`<c:ser>
        <c:idx val="${s}"/>
        <c:order val="${s}"/>
        <c:tx><c:v>${$(c.name)}</c:v></c:tx>
        ${b}
        ${v}
        <c:xVal>${N(u)}</c:xVal>
        <c:yVal>${N(p)}</c:yVal>
        <c:smooth val="0"/>
      </c:ser>`}).join("");return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <c:date1904 val="0"/>
  <c:lang val="en-US"/>
  <c:roundedCorners val="0"/>
  <c:chart>
    <c:title>
      <c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1100" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1100" b="1"><a:solidFill><a:srgbClr val="0F172A"/></a:solidFill></a:rPr><a:t>${$(e.title)}</a:t></a:r></a:p></c:rich></c:tx>
      <c:overlay val="0"/>
    </c:title>
    <c:autoTitleDeleted val="0"/>
    <c:plotArea>
      ${de({legendBottom:!e.hideLegend})}
      <c:scatterChart>
        <c:scatterStyle val="lineMarker"/>
        <c:varyColors val="0"/>
        ${o}
        <c:axId val="1"/>
        <c:axId val="2"/>
      </c:scatterChart>
      <c:valAx>
        <c:axId val="1"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="b"/>
        ${R(a)}
        <c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>
        <c:numFmt formatCode="${$(i)}" sourceLinked="0"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        ${k({size:700})}
        <c:crossAx val="2"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="midCat"/>
      </c:valAx>
      <c:valAx>
        <c:axId val="2"/>
        <c:scaling><c:orientation val="minMax"/></c:scaling>
        <c:delete val="0"/>
        <c:axPos val="l"/>
        ${R(r,{vertical:!0})}
        <c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr></c:majorGridlines>
        <c:numFmt formatCode="${$(n)}" sourceLinked="0"/>
        <c:majorTickMark val="out"/>
        <c:minorTickMark val="none"/>
        <c:tickLblPos val="nextTo"/>
        ${k({size:700})}
        <c:crossAx val="1"/>
        <c:crosses val="autoZero"/>
        <c:crossBetween val="midCat"/>
      </c:valAx>
    </c:plotArea>
    ${l}
    <c:plotVisOnly val="1"/>
    <c:dispBlanksAs val="gap"/>
    <c:showDLblsOverMax val="0"/>
  </c:chart>
  <c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln w="6350"><a:solidFill><a:srgbClr val="E2E8F0"/></a:solidFill></a:ln></c:spPr>
</c:chartSpace>`}function mt(){return`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`}function dt(e){const t=(e.displayLabels.length?e.displayLabels:e.labels).map(String);if(!t.length)return[];const a=[];let r=e.startIndex??0;for(const i of e.series){if(!i.values.some(o=>o!=null&&Number.isFinite(o)))continue;r+=1;const l=i.layerId.toUpperCase();a.push({rId:`rIdChart${r}`,fileStem:`chart${r}`,title:`${l} Trend`,yAxisLabel:`${l} mean`,xAxisLabel:"Period",yNumFmt:"0.0000",categories:t,kind:"line",series:[{name:l,values:i.values,color:L(l)}]})}return a}function pe(e){return e.v+=1,e.v}function H(e){return[{name:"Temp Max (°C)",values:e.map(t=>t.tempMaxC),color:"DC2626"},{name:"Temp Mean (°C)",values:e.map(t=>t.tempMeanC),color:"EA580C"},{name:"Temp Min (°C)",values:e.map(t=>t.tempMinC),color:"2563EB"}]}function pt(e){const t={v:e.startIndex??0},a=[],r=s=>{const u=pe(t);a.push({xAxisLabel:"Period",...s,rId:`rIdChart${u}`,fileStem:`chart${u}`})},i=e.daily??[],n=e.monthly??[],l=e.yearly??[];if(i.length>0&&n.length===0&&r({title:"Temperature Max · Mean · Min — Daily",yAxisLabel:"Temperature (°C)",xAxisLabel:"Date",yNumFmt:"0.0",categories:i.map(s=>s.date),kind:"line",series:H(i)}),n.length&&r({title:"Temperature Max · Mean · Min — Monthly",yAxisLabel:"Temperature (°C)",xAxisLabel:"Month",yNumFmt:"0.0",categories:n.map(s=>s.label),kind:"line",series:H(n)}),l.length&&r({title:"Temperature Max · Mean · Min — Yearly",yAxisLabel:"Temperature (°C)",xAxisLabel:"Year",yNumFmt:"0.0",categories:l.map(s=>s.label),kind:"line",series:H(l)}),n.length){r({title:"Monthly Rainfall Total",yAxisLabel:"Rainfall (mm)",xAxisLabel:"Month",yNumFmt:"0.0",categories:n.map(u=>u.label),kind:"bar",hideLegend:!0,series:[{name:"Rainfall (mm)",values:n.map(u=>u.rainfallMm),color:"3B82F6",asBar:!0}]});const s=n.filter(u=>(u.rainfallMm??0)>0).map(u=>({label:u.label,value:Number(u.rainfallSharePct??u.rainfallMm??0)}));if(s.length>=2){const u=ae(s,8);r({title:"Top Months — Rainfall Share (%)",yAxisLabel:"Share (%)",xAxisLabel:"Month",yNumFmt:"0.0",categories:u.labels,kind:"bar",barDir:"bar",hideLegend:!0,series:[{name:"Rainfall share (%)",values:u.values,color:"0D9488",asBar:!0}]})}}if(l.length>=2){const s=l.map(u=>({label:u.label,value:Number(u.rainfallMm??0)})).filter(u=>u.value>0);if(s.length>=2){const u=s.reduce((w,b)=>w+b.value,0),p=ae(s.map(w=>({label:w.label,value:u>0?w.value/u*100:0})),6);r({title:"Annual Rainfall Share (%)",yAxisLabel:"Share",categories:p.labels,kind:"pie",series:[{name:"Annual share",values:p.values}]})}}n.length?r({title:"Humidity — Monthly Mean",yAxisLabel:"Humidity (%)",xAxisLabel:"Month",yNumFmt:"0",categories:n.map(s=>s.label),kind:"line",series:[{name:"Humidity (%)",values:n.map(s=>s.humidityPct),color:"0D9488"}]}):i.length&&r({title:"Humidity — Daily Mean",yAxisLabel:"Humidity (%)",xAxisLabel:"Date",yNumFmt:"0",categories:i.map(s=>s.date),kind:"line",series:[{name:"Humidity (%)",values:i.map(s=>s.humidityPct),color:"0D9488"}]});const c=e.indexCompare;if(c&&c.categories.length){const s=[],u=(p,w,b)=>{w.some(v=>v!=null&&Number.isFinite(v))&&s.push({name:p,values:w,color:b,secondaryAxis:!0})};u("NDVI",c.ndvi,L("NDVI")),u("NDMI",c.ndmi,L("NDMI")),u("NDWI",c.ndwi,L("NDWI")),u("SAVI",c.savi,L("SAVI")),(c.tempMean.some(p=>p!=null)||c.tempMin.some(p=>p!=null)||c.tempMax.some(p=>p!=null))&&r({title:"Temperature Max·Mean·Min vs NDVI · NDMI · NDWI · SAVI",yAxisLabel:"Temperature (°C)",yAxisLabelSecondary:"Index value",xAxisLabel:"Period",yNumFmt:"0.0",yNumFmtSecondary:"0.000",categories:c.categories,kind:"line",series:[{name:"Temp Max (°C)",values:c.tempMax,color:"DC2626"},{name:"Temp Mean (°C)",values:c.tempMean,color:"EA580C"},{name:"Temp Min (°C)",values:c.tempMin,color:"2563EB"},...s]}),c.rainfall.some(p=>p!=null)&&s.length&&r({title:"Rainfall vs NDVI · NDMI · NDWI · SAVI",yAxisLabel:"Rainfall (mm)",yAxisLabelSecondary:"Index value",xAxisLabel:"Period",yNumFmt:"0.0",yNumFmtSecondary:"0.000",categories:c.categories,kind:"combo",series:[{name:"Rainfall (mm)",values:c.rainfall,color:"3B82F6",asBar:!0},...s.map(p=>({...p,secondaryAxis:!0}))]}),c.humidity.some(p=>p!=null)&&s.length&&r({title:"Humidity vs NDVI · NDMI · NDWI · SAVI",yAxisLabel:"Humidity (%)",yAxisLabelSecondary:"Index value",xAxisLabel:"Period",yNumFmt:"0",yNumFmtSecondary:"0.000",categories:c.categories,kind:"line",series:[{name:"Humidity (%)",values:c.humidity,color:"0D9488"},...s]})}if(!a.length&&e.points.length){const s=e.points,u=s.map(w=>w.displayLabel),p=e.aggregationLabel||"Period";r({title:`Temperature & Humidity — ${p}`,yAxisLabel:"Temperature (°C)",yAxisLabelSecondary:"Humidity (%)",xAxisLabel:"Period",yNumFmt:"0.0",yNumFmtSecondary:"0",categories:u,kind:"line",series:[{name:"Temperature (°C)",values:s.map(w=>w.temperatureC),color:"EA580C"},{name:"Humidity (%)",values:s.map(w=>w.humidityPct),color:"0D9488",secondaryAxis:!0}]}),r({title:`Rainfall & Wind — ${p}`,yAxisLabel:"Rainfall (mm)",yAxisLabelSecondary:"Wind (m/s)",xAxisLabel:"Period",yNumFmt:"0.0",yNumFmtSecondary:"0.00",categories:u,kind:"combo",series:[{name:"Rainfall (mm)",values:s.map(w=>w.rainfallMm),color:"3B82F6",asBar:!0},{name:"Wind (m/s)",values:s.map(w=>w.windSpeedMs),color:"047857",secondaryAxis:!0}]})}return a}function wt(e){if(e.length<2)return"Single-date coverage snapshot — compare additional acquisitions to quantify canopy expansion or decline.";const t=e[0],a=e[e.length-1],r=a.vegetationCoveragePct-t.vegetationCoveragePct,i=Math.abs(r),n=r>1?"increased":r<-1?"decreased":"stayed broadly stable",l=t.ndviMean!=null&&a.ndviMean!=null?` NDVI mean moved from ${t.ndviMean.toFixed(3)} to ${a.ndviMean.toFixed(3)}.`:"";return`Vegetation coverage ${n} across the period (${t.date} → ${a.date}): ${t.vegetationCoveragePct.toFixed(1)}% → ${a.vegetationCoveragePct.toFixed(1)}% (Δ ${r>=0?"+":""}${r.toFixed(1)} pp).${l}${i>=5?" This shift is material for field planning — verify irrigation, harvest timing, or bare-soil exposure.":" Variation is modest; treat as supporting evidence alongside NDVI vigor and moisture indices."}`}function ht(e){const t=e.timeline.filter(l=>Number.isFinite(l.vegetationCoveragePct));if(t.length<2)return[];const a={v:e.startIndex??0},r=[],i=l=>{const o=pe(a);r.push({...l,rId:`rIdChart${o}`,fileStem:`chart${o}`})},n=t.map(l=>l.periodLabel||l.date);return i({title:"Vegetation Coverage Timeline — Statistical Chart",yAxisLabel:"Coverage (%)",yAxisLabelSecondary:"NDVI mean",xAxisLabel:"Period",yNumFmt:"0.0",yNumFmtSecondary:"0.000",categories:n,kind:"combo",series:[{name:"Vegetation Coverage (%)",values:t.map(l=>l.vegetationCoveragePct),color:"047857",asBar:!0},{name:"Bare / Critical (%)",values:t.map(l=>l.bareCoveragePct),color:"B45309"},{name:"NDVI Mean",values:t.map(l=>l.ndviMean),color:"2563EB",secondaryAxis:!0}]}),r}function M(e){return e.length?e.reduce((t,a)=>t+a,0)/e.length:null}function D(e){return e.length?e.reduce((t,a)=>t+a,0):null}function g(e,t){if(e==null||!Number.isFinite(e))return null;const a=10**t;return Math.round(e*a)/a}function ft(e){const t=new Map;for(const a of e){const r=a.time.trim().slice(0,10);if(!r)continue;t.has(r)||t.set(r,{temps:[],humids:[],rains:[],winds:[]});const i=t.get(r);a.temperatureC!=null&&Number.isFinite(a.temperatureC)&&i.temps.push(a.temperatureC),a.humidityPct!=null&&Number.isFinite(a.humidityPct)&&i.humids.push(a.humidityPct),a.precipitationMm!=null&&Number.isFinite(a.precipitationMm)&&i.rains.push(a.precipitationMm);const n=ie(a.windSpeedKmh);n!=null&&i.winds.push(n)}return[...t.entries()].sort(([a],[r])=>a.localeCompare(r)).map(([a,r])=>({date:a,tempMeanC:g(M(r.temps),2),tempMinC:r.temps.length?g(Math.min(...r.temps),2):null,tempMaxC:r.temps.length?g(Math.max(...r.temps),2):null,humidityPct:g(M(r.humids),1),rainfallMm:g(D(r.rains),2),windSpeedMs:g(M(r.winds),2)}))}function je(e){const[t,a]=e.split("-"),r=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],i=Number(a)-1;return`${r[i]??a} ${t}`}function gt(e){const t=new Map;for(const l of e){const o=l.date.slice(0,7);if(!/^\d{4}-\d{2}$/.test(o))continue;t.has(o)||t.set(o,{means:[],mins:[],maxs:[],humids:[],rains:[],winds:[]});const c=t.get(o);l.tempMeanC!=null&&c.means.push(l.tempMeanC),l.tempMinC!=null&&c.mins.push(l.tempMinC),l.tempMaxC!=null&&c.maxs.push(l.tempMaxC),l.humidityPct!=null&&c.humids.push(l.humidityPct),l.rainfallMm!=null&&c.rains.push(l.rainfallMm),l.windSpeedMs!=null&&c.winds.push(l.windSpeedMs)}const a=[...t.keys()].sort(),i=a.map(l=>D(t.get(l).rains)??0).reduce((l,o)=>l+o,0);let n=0;return a.map((l,o)=>{const c=t.get(l),s=g(D(c.rains),2);n+=s??0;const u=i>0&&s!=null?g(s/i*100,1):i===0?0:null;return{monthKey:l,label:je(l),tempMeanC:g(M(c.means),2),tempMinC:c.mins.length?g(Math.min(...c.mins),2):null,tempMaxC:c.maxs.length?g(Math.max(...c.maxs),2):null,humidityPct:g(M(c.humids),1),rainfallMm:s,rainfallSharePct:u,cumulativeRainfallMm:g(n,2),windSpeedMs:g(M(c.winds),2)}})}function bt(e){const t=new Map;for(const a of e){const r=a.date.slice(0,4);if(!/^\d{4}$/.test(r))continue;t.has(r)||t.set(r,{means:[],mins:[],maxs:[],humids:[],rains:[],winds:[]});const i=t.get(r);a.tempMeanC!=null&&i.means.push(a.tempMeanC),a.tempMinC!=null&&i.mins.push(a.tempMinC),a.tempMaxC!=null&&i.maxs.push(a.tempMaxC),a.humidityPct!=null&&i.humids.push(a.humidityPct),a.rainfallMm!=null&&i.rains.push(a.rainfallMm),a.windSpeedMs!=null&&i.winds.push(a.windSpeedMs)}return[...t.keys()].sort().map(a=>{const r=t.get(a);return{yearKey:a,label:a,tempMeanC:g(M(r.means),2),tempMinC:r.mins.length?g(Math.min(...r.mins),2):null,tempMaxC:r.maxs.length?g(Math.max(...r.maxs),2):null,humidityPct:g(M(r.humids),1),rainfallMm:g(D(r.rains),2),windSpeedMs:g(M(r.winds),2)}})}function vt(e){const t=e.layerSeries.find(r=>r.layerId.toUpperCase()===e.layerId.toUpperCase());if(!t)return e.dates.map(()=>null);const a=new Map;for(let r=0;r<e.chartLabels.length;r+=1){const i=e.chartLabels[r],n=t.values[r];if(n==null||!Number.isFinite(n))continue;const l=(e.periodAnchorDates[i]??i).trim().slice(0,10);/^\d{4}-\d{2}-\d{2}$/.test(l)&&a.set(l,n),a.set(i,n)}return e.dates.map(r=>{if(a.has(r))return a.get(r);const i=r.slice(0,7),n=[];for(const[l,o]of a)l.startsWith(i)&&n.push(o);return n.length?M(n):null})}function xt(e,t=62){if(e.length<=t)return e;const a=[];for(let r=0;r<t;r+=1)a.push(e[Math.round(r*(e.length-1)/(t-1))]);return a}function yt(e,t=1,a=""){return e==null||!Number.isFinite(e)?"—":`${e.toFixed(t)}${a}`}function $t(e,t,a,r){const i=new Map(t.map((l,o)=>[l,a[o]??l])),n=new Map;for(const l of e){const o=re(l.date,r);if(!o||!i.has(o))continue;n.has(o)||n.set(o,{means:[],mins:[],maxs:[],humids:[],rains:[]});const c=n.get(o);l.tempMeanC!=null&&c.means.push(l.tempMeanC),l.tempMinC!=null&&c.mins.push(l.tempMinC),l.tempMaxC!=null&&c.maxs.push(l.tempMaxC),l.humidityPct!=null&&c.humids.push(l.humidityPct),l.rainfallMm!=null&&c.rains.push(l.rainfallMm)}return t.map(l=>{const o=n.get(l);return{periodKey:l,displayLabel:i.get(l)??ne(l,r),tempMeanC:o?g(M(o.means),2):null,tempMinC:o!=null&&o.mins.length?g(Math.min(...o.mins),2):null,tempMaxC:o!=null&&o.maxs.length?g(Math.max(...o.maxs),2):null,humidityPct:o?g(M(o.humids),1):null,rainfallMm:o?g(D(o.rains),2):null}})}const He="/assets/Agricultural_Satellite_Intelligence_Report.template-D0Whd_DY.docx";async function Mt(){var t;if(typeof process<"u"&&((t=process.versions)!=null&&t.node)){const{readFile:a}=await z(async()=>{const{readFile:s}=await import("./vendor-geotiff-LX1WARUP.js").then(u=>u._);return{readFile:s}},__vite__mapDeps([0,1,2])),{fileURLToPath:r}=await z(async()=>{const{fileURLToPath:s}=await import("./vendor-geotiff-LX1WARUP.js").then(u=>u._);return{fileURLToPath:s}},__vite__mapDeps([0,1,2])),{dirname:i,join:n}=await z(async()=>{const{dirname:s,join:u}=await import("./vendor-geotiff-LX1WARUP.js").then(p=>p._);return{dirname:s,join:u}},__vite__mapDeps([0,1,2])),l=i(r(import.meta.url)),o=n(l,"templates","Agricultural_Satellite_Intelligence_Report.template.docx"),c=await a(o);return Uint8Array.from(c).buffer}const e=await fetch(He);if(!e.ok)throw new Error("Failed to load Word report template");return await e.arrayBuffer()}export{F as A,lt as B,Ae as C,Z as D,it as E,Ye as F,Ke as G,dt as H,$t as I,yt as J,ht as K,wt as L,L as M,vt as N,ie as O,Ge as P,Se as Q,Ie as R,Ze as a,Je as b,Qe as c,qe as d,et as e,nt as f,tt as g,U as h,ot as i,Fe as j,st as k,bt as l,ft as m,gt as n,pt as o,Mt as p,ut as q,mt as r,xt as s,le as t,Ue as u,at as v,ct as w,Xe as x,ce as y,rt as z};
