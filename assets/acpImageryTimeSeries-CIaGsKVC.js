import{z as Vi,e as Fi,B as Oi,h as ki,k as Hi,C as $i,q as Wi,r as Ui}from"./agroStructuresPrimaryAoi-D_kooO1N.js";import{l as nt,m as ya,bv as Ma,S as Ut,bP as Gi,bQ as bt,ag as Ki,bN as Aa,bR as Et,bS as Vn}from"./index-DdunzXU1.js";import{x as Yi,H as Da}from"./openMeteoWeather-CSkQyoSu.js";const Gt=.35,Kt=.2,Yt=.25,Xt=.2,Xi=`${Gt} * ndvi + ${Kt} * ndwi + ${Yt} * ndmi + ${Xt} * savi`,La=Xi,zi=`${Gt}·NDVI + ${Kt}·NDWI + ${Yt}·NDMI + ${Xt}·SAVI`,n0=`CDSI = ${zi}`,ji=.4,qi=.35,Zi=.25;function Ji(e){if(!Number.isFinite(e))return NaN;const t=1+e;return Math.abs(t)<1e-6?NaN:-2*e/t}function Qi(e){const t=Number.isFinite(e)?e:0;return Number((.76+t*.44-1).toFixed(4))}function at(e){const t=Number.isFinite(e)?e:0;return Math.max(-.2,Math.min(1,t*.96+.015))}function es(e){if(e.ciRe!=null&&Number.isFinite(e.ciRe))return e.ciRe;if(e.ndre!=null&&Number.isFinite(e.ndre)){const t=Ji(e.ndre);return Number.isFinite(t)?t:null}return Number.isFinite(e.ndvi)?Qi(e.ndvi):null}function ts(e){const{ndvi:t,ndwi:n,ndmi:a,savi:r}=e;if(![t,n,a,r].every(s=>Number.isFinite(s)))return NaN;const i=Gt*t+Kt*n+Yt*a+Xt*r;return Number(i.toFixed(4))}function De(e){const t=e.ndvi,n=e.ndmi,a=e.ndwi,r=e.savi!=null&&Number.isFinite(e.savi)?e.savi:Number.isFinite(t)?at(t):NaN;if(Number.isFinite(t)&&Number.isFinite(n)&&a!=null&&Number.isFinite(a)&&Number.isFinite(r))return ts({ndvi:t,ndwi:a,ndmi:n,savi:r});const i=es(e);if(i==null||!Number.isFinite(t)||!Number.isFinite(n))return NaN;const s=ji*t+qi*n+Zi*i;return Number(s.toFixed(4))}function ns(e,t){var s,l;const n=e.ndvi??(t==null?void 0:t.ndvi),a=e.ndmi??(t==null?void 0:t.ndmi);if(n==null||a==null||!Number.isFinite(n)||!Number.isFinite(a))return null;const r=e.ndwi??(t==null?void 0:t.ndwi),i=e.savi??(t==null?void 0:t.savi)??(Number.isFinite(n)?at(n):null);return{ndvi:n,ndmi:a,ndwi:r,savi:i,ciRe:e.ciRe??((l=(s=e.zonal)==null?void 0:s.ciRe)==null?void 0:l.mean)??(t==null?void 0:t.ciRe),ndre:t==null?void 0:t.ndre}}const a0=["healthy","mild","moderate","severe","bare"],r0={healthy:"Healthy Vegetation",mild:"Mild Stress",moderate:"Moderate Stress",severe:"Severe Stress",bare:"Bare Soil"},i0={healthy:"#22c55e",mild:"#facc15",moderate:"#f97316",severe:"#ef4444",bare:"#94a3b8"},as=[[.580392,.639216,.721569],[.133333,.772549,.368627],[.980392,.8,.082353],[.976471,.45098,.086275],[.937255,.266667,.266667]];function s0(e){const t=Math.max(0,Math.min(4,Math.round(e)));return t===0?"bare":t===1?"healthy":t===2?"mild":t===3?"moderate":"severe"}const Q={ndvi:.4,ndmi:.25,savi:.2,ndwi:.15},zt=`${Q.ndvi} * ndvi + ${Q.ndmi} * ndmi + ${Q.savi} * savi + ${Q.ndwi} * ndwi`;function rs(e){const{ndvi:t,ndmi:n,savi:a,ndwi:r}=e;if(![t,n,a,r].every(s=>Number.isFinite(s)))return NaN;const i=Q.ndvi*t+Q.ndmi*n+Q.savi*a+Q.ndwi*r;return Number(i.toFixed(4))}function is(e){return Number.isFinite(e)?Number(Math.max(0,Math.min(1,1-e)).toFixed(4)):NaN}function ss(e,t){return!Number.isFinite(e)||e<.15?"bare":Number.isFinite(t)?t>=.6?"severe":t>=.4?"moderate":t>=.2?"mild":"healthy":"moderate"}function ls(e,t){const{ndvi:n,ndmi:a,ndwi:r}=e;return t==="bare"?"Low vegetation cover — exposed soil or fallow surface.":a<.12&&r<.1?"Canopy water limitation — moisture stress limiting vigor.":n<.35&&a>=.15?"Vegetation stress with adequate moisture — possible nutrient or biotic pressure.":n>=.55&&a<.15?"High vigor but declining canopy moisture — early water stress signal.":t==="severe"?"Combined vegetation and moisture deficit across the AOI.":t==="moderate"?"Moderate canopy stress — monitor irrigation and field scouting.":t==="mild"?"Early stress signal — within normal seasonal variability.":"Stable vegetation condition — continue routine monitoring."}function os(e,t){return e==="bare"?"Confirm land use (harvest, tillage, or bare fallow). Reschedule analysis after emergence or planting.":e==="severe"?"Priority field visit within 48h. Verify irrigation, drainage, and pest pressure in red zones.":e==="moderate"?"Targeted scouting in orange zones; compare NDMI trend over the next two scenes for recovery.":e==="mild"?"Watch yellow zones on the next acquisition; no immediate intervention unless trend worsens.":"Maintain current management. Use time-series comparison to track seasonal trajectory."}function l0(e){const t=rs(e),n=is(t),a=ss(e.ndvi,n),r=ls(e,a),i=os(a);return{chas:t,stressScore:n,tier:a,riskCause:r,recommendation:i}}const Le="ADI",jt="Anomaly Detection Index — (Current − Historical Mean) / Historical Std · 10-class",qt=.5,Zt=.3,Jt=.2,_a=`${qt} * ndvi + ${Zt} * ndmi + ${Jt} * ndre`,o0=`(${qt}·NDVI + ${Zt}·NDMI + ${Jt}·NDRE − μ_hist) / σ_hist`,Ba=90,cs=[-2,-1.5,-1,-.5,.5,1,1.5,2,3],us=[-2.5,-1.75,-1.25,-.75,0,.75,1.25,1.75,2.5,3.5],Fn=["Extreme Negative Anomaly · ADI < −2.0","High Stress · −2.0 to −1.5","Moderate Stress · −1.5 to −1.0","Slight Negative Change · −1.0 to −0.5","Normal Condition · −0.5 to 0.5","Slight Positive Change · 0.5 to 1.0","Moderate Positive Change · 1.0 to 1.5","High Anomaly · 1.5 to 2.0","Very High Anomaly · 2.0 to 3.0","Extreme Positive Anomaly · ADI > 3.0"],On=[8323072,11674146,14102567,16018755,16703627,14282635,10934634,6732650,1742928,26679];function W(e){return String(e||"").trim().toUpperCase()===Le}function ds(e,t,n){return qt*e+Zt*t+Jt*n}function ms(e,t,n){if(!Number.isFinite(e)||!Number.isFinite(t))return NaN;const a=Number.isFinite(n)&&n>1e-6?n:1e-6;return(e-t)/a}const _e="NCADI",Qt="Newly Cultivated / Abandoned Detection Index — 0.7·ΔNDVI + 0.3·ΔNDMI · 10-class",en=.7,tn=.3,fs=`${en} * dNdvi + ${tn} * dNdmi`,Is=`${en} * ndvi + ${tn} * ndmi`,c0=`${en}·ΔNDVI + ${tn}·ΔNDMI`,gs=60,Ss=[-.35,-.2,-.1,-.03,.03,.1,.2,.35,.5],ps=[-.42,-.275,-.15,-.065,0,.065,.15,.275,.425,.58],kn=["Extreme Abandonment · NCADI < −0.35","High Abandonment Risk · −0.35 to −0.20","Moderate Decline · −0.20 to −0.10","Slight Vegetation Decline · −0.10 to −0.03","Stable Condition · −0.03 to 0.03","Slight Cultivation Gain · 0.03 to 0.10","Moderate Cultivation Gain · 0.10 to 0.20","High Cultivation Gain · 0.20 to 0.35","Very High Cultivation Gain · 0.35 to 0.50","Extreme Cultivation Gain · NCADI > 0.50"],Hn=[5517317,9195786,12550445,14664317,16181443,13101797,8441281,3512207,91742,15408];function X(e){return String(e||"").trim().toUpperCase()===_e}const xe=7,hs=5;function vs(e){return e.filter(t=>t.ndvi!=null||t.ndwi!=null||t.ndmi!=null).map(t=>t.date).sort((t,n)=>n.localeCompare(t))}function $n(e,t){const n=e.find(a=>a.date===t.trim());return n?n.ndvi!=null||n.ndwi!=null||n.ndmi!=null:!1}function yt(e,t){const n=ee(e.trim()).getTime(),a=ee(t.trim()).getTime();return!Number.isFinite(n)||!Number.isFinite(a)?0:Math.round((n-a)/864e5)}function de(e,t){return Math.abs(yt(e,t))}function Ke(e,t,n=xe){const a=e.trim(),r=[...new Set(t.map(c=>c.trim()).filter(Boolean))].sort((c,u)=>u.localeCompare(c));if(!r.length)return null;if(r.includes(a))return a;const i=r.filter(c=>de(a,c)<=n),s=i.length?i:r;let l=s[0],o=de(a,l);for(const c of s){const u=de(a,c);(u<o||u===o&&c<=a)&&(o=u,l=c)}return l}function Mt(e,t,n=xe){const a=e.trim(),r=[...new Set(t.map(o=>o.trim()).filter(Boolean))];if(!r.length)return{requestedDate:a,resolvedDate:null,fallbackUsed:!1,fallbackDays:0,direction:"nearest"};if(r.includes(a))return{requestedDate:a,resolvedDate:a,fallbackUsed:!1,fallbackDays:0,direction:"exact"};const i=r.filter(o=>de(a,o)<=n);if(i.length){const o=Ke(a,i,n),c=yt(a,o);return{requestedDate:a,resolvedDate:o,fallbackUsed:!0,fallbackDays:de(a,o),direction:c>0?"backward":c<0?"forward":"nearest"}}const s=Ke(a,r,n);if(!s)return{requestedDate:a,resolvedDate:null,fallbackUsed:!1,fallbackDays:0,direction:"nearest"};const l=yt(a,s);return{requestedDate:a,resolvedDate:s,fallbackUsed:s!==a,fallbackDays:de(a,s),direction:l>0?"backward":l<0?"forward":"nearest"}}function Ra(e,t=new Date,n=45){const a=ne(t),r=new Set(e.map(s=>s.trim().slice(0,10)).filter(Boolean));if(!r.size)return a;for(let s=0;s<=n;s++){const l=E(a,s);if(r.has(l))return l}const i=[...r].sort((s,l)=>l.localeCompare(s));return Ke(a,i,xe)??a}function xa(e,t){const n=e.trim().slice(0,10),a=[...new Set(t.map(i=>i.trim().slice(0,10)).filter(Boolean))].sort((i,s)=>s.localeCompare(i));if(!a.length||!n)return null;const r=a.indexOf(n);return r>=0&&r+1<a.length?a[r+1]:a.find(i=>i<n)??null}function u0(e,t=new Date){const n=Ra(e,t),a=xa(n,e);return{currentSceneDate:n,previousSceneDate:a}}function wa(e,t,n,a=xe){const r=vs(e),i=(n??[]).map(o=>o.trim().slice(0,10)).filter(Boolean),s=r.length?r:[...new Set(i)].sort((o,c)=>c.localeCompare(o)),l=Mt(t,s,a);if(!l.resolvedDate||!$n(e,l.resolvedDate)){const o=Mt(t,r,a);return o.resolvedDate&&$n(e,o.resolvedDate)?o:{...l,resolvedDate:null}}return l}const Cs=90,d0=2,Ta="si_sentinel_imagery_date_by_aoi_v1";function ne(e=new Date){const t=e.getFullYear(),n=String(e.getMonth()+1).padStart(2,"0"),a=String(e.getDate()).padStart(2,"0");return`${t}-${n}-${a}`}function ee(e){const t=/^(\d{4})-(\d{2})-(\d{2})$/.exec(e.trim());return t?new Date(Number(t[1]),Number(t[2])-1,Number(t[3]),12,0,0,0):new Date}function E(e,t){const n=ee(e);return n.setDate(n.getDate()-t),ne(n)}function ie(e,t){const n=ee(e);return n.setDate(n.getDate()+t),ne(n)}function Pa(e,t=new Date){return ne(t)}function m0(e=new Date){return ee(Pa(null,e))}function f0(e=new Date,t){const n=(t==null?void 0:t.trim())||Pa(null,e),a=ee(n);return a.setDate(a.getDate()-Cs),{start:ne(a),end:n}}function I0(e,t,n){const a=e.trim();if(!a)return Ra(t);const r=[...new Set(t.map(i=>i.trim().slice(0,10)).filter(Boolean))].sort((i,s)=>s.localeCompare(i));return!r.length||r.includes(a)?a:Ke(a,r,xe)??a}function Va(){if(typeof window>"u")return{};try{const e=window.localStorage.getItem(Ta);if(!e)return{};const t=JSON.parse(e);return t&&typeof t=="object"?t:{}}catch{return{}}}function g0(e){const t=e.trim()||"global";return Va()[t]??{autoFollow:!0}}function S0(e,t){if(typeof window>"u"||!window.localStorage)return;const n=e.trim()||"global";try{const a=Va();a[n]=t,window.localStorage.setItem(Ta,JSON.stringify(a))}catch{}}const Ye="LULC",p0=10,h0=3,Ns=1024,Wn={name:Ye,title:"LULC"},Fa="Land Use / Land Cover — Sentinel-2 10m · 3m display (AgroCloud · IO schema)",nn=[{id:1,key:"water",name:"Water",color:"#419BDF"},{id:2,key:"trees",name:"Trees",color:"#397D49"},{id:4,key:"flooded",name:"Flooded Vegetation",color:"#7EC8A3",agricultural:!0},{id:5,key:"crops",name:"Crops",color:"#F5C518",agricultural:!0},{id:7,key:"built",name:"Built Area",color:"#E53935"},{id:8,key:"bare",name:"Bare Ground",color:"#E8DCC8"},{id:9,key:"snow",name:"Snow/Ice",color:"#E8F4FC"},{id:10,key:"clouds",name:"Clouds",color:"#9E9E9E"},{id:11,key:"rangeland",name:"Rangeland",color:"#C4A574"},{id:0,key:"nodata",name:"No Data",color:"#FFFFFF"}],an=nn.filter(e=>e.id!==0);new Set(nn.filter(e=>e.agricultural).map(e=>e.id));const v0=4,C0=120,N0=512;function ve(e){return String(e||"").trim().toUpperCase()===Ye}function bs(e){const t=e.replace("#","").trim(),n=t.length===3?t.split("").map(r=>r+r).join(""):t,a=Number.parseInt(n,16);return Number.isFinite(a)?[(a>>16&255)/255,(a>>8&255)/255,(a&255)/255]:[0,0,0]}function b0(e,t=120){const n=String(e||"").trim().slice(0,10);return n?{timeStart:E(n,t),timeEnd:n}:{timeStart:"",timeEnd:""}}const Es="DSI",E0="Drought Severity Index (0.50·(1−VCI) + 0.30·(1−SMCI) + 0.20·(1−NDMI_norm)) · 10-class",ys="Math.max(0, Math.min(1, (ndvi - 0.05) / 0.80))",Ms="Math.max(0, Math.min(1, (0.7 * ndmi + 0.3 * ndwi + 0.3) / 0.8))",As="Math.max(0, Math.min(1, (ndmi + 0.8) / 1.6))",Ds=`0.50 * (1 - (${ys})) + 0.30 * (1 - (${Ms})) + 0.20 * (1 - (${As}))`,Oa=0,ka=1,Ha=[.1,.2,.3,.4,.5,.6,.7,.8,.9],Ls=[.05,.15,.25,.35,.45,.55,.65,.75,.85,.95],Un=["No Drought","Very Low","Low","Mild","Moderate","Moderate-High","High","Severe","Very Severe","Extreme Drought"],Gn=[26679,3253076,7915129,11394446,14282915,16703627,16625249,16018755,14102567,8323072],y0=["0.00–0.10","0.10–0.20","0.20–0.30","0.30–0.40","0.40–0.50","0.50–0.60","0.60–0.70","0.70–0.80","0.80–0.90","0.90–1.00"],Kn=.3;function M0(e,t=Kn){const n=Number.isFinite(t)?t:Kn,a=[Oa,...Ha,ka];let r=0,i=0,s=0;for(const l of e){const o=a[l.classIndex];o==null||o<n||(r+=l.areaM2,i+=l.count,s+=l.pctOfAoi)}return{threshold:n,areaM2:r,areaHa:r/1e4,areaKm2:r/1e6,pctOfAoi:s,sampleCount:i}}const _s="WAPI",$a="0.40 * ndmi + 0.35 * ndwi + 0.15 * ndvi + 0.10 * savi",Wa="Math.max(0, Math.min(1, 1 - (0.6 * ndmi + 0.4 * ndwi)))",Bs=`0.40 * (${$a}) + 0.20 * (1 - ndmi) + 0.10 * (${Wa}) + 0.10`,Rs=45,xs=0,ws=1,Ts=[.1,.2,.3,.4,.5,.6,.7,.8,.9],Ps=[.05,.15,.25,.35,.45,.55,.65,.75,.85,.95],Yn=["Class 1 · Normal · 0.00–0.09","Class 2 · Healthy · 0.10–0.19","Class 3 · Low Stress · 0.20–0.29","Class 4 · Low Moderate · 0.30–0.39","Class 5 · Moderate · 0.40–0.49","Class 6 · Moderate High · 0.50–0.59","Class 7 · High Stress · 0.60–0.69","Class 8 · Very High Stress · 0.70–0.79","Class 9 · Critical · 0.80–0.89","Class 10 · Extreme Critical · 0.90–1.00"],Xn=[6056896,4431943,2533018,16773494,16635957,16757504,15690752,15483002,15277667,11342935];function Ua(e){return String(e||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"")==="WAPI"}function A0(e){const t=1-(.6*e.ndmi+.4*e.ndwi);return Math.max(0,Math.min(1,t))}const Vs=["#2563eb","#0d9488","#16a34a","#86efac","#eab308","#f59e0b","#f97316","#ea580c","#dc2626","#7f1d1d"],Fs=["No / Weak Indication","Very Low","Low","Low–Moderate","Medium","Moderate","High–Moderate","High","Very High","Very High / Extreme"],zn=[{id:"S3_NDVI",label:"NDVI",scientificName:"NDVI = (NIR − Red) / (NIR + Red)"},{id:"S3_EVI",label:"EVI",scientificName:"EVI = 2.5 × (NIR − Red) / (NIR + 6×Red − 7.5×Blue + 1)"},{id:"S3_FAPAR",label:"FAPAR",scientificName:"Fraction of Absorbed Photosynthetically Active Radiation"},{id:"S3_LAI",label:"LAI",scientificName:"Leaf Area Index"},{id:"S3_FCOVER",label:"FCOVER",scientificName:"Fraction of Vegetation Cover"},{id:"S3_CI",label:"Chlorophyll Index (CI)",scientificName:"CI = (NIR / Green) − 1"},{id:"S3_LST",label:"LST",scientificName:"Land Surface Temperature"},{id:"S3_WQI",label:"Water Quality Index",scientificName:"Chlorophyll-a + Turbidity + Algae Indicators"}],Os=[{id:"S5P_NO2",label:"NO₂ Index",scientificName:"Atmospheric Nitrogen Dioxide Concentration"},{id:"S5P_SO2",label:"SO₂ Index",scientificName:"Atmospheric Sulfur Dioxide Concentration"},{id:"S5P_CO",label:"CO Index",scientificName:"Carbon Monoxide Concentration"},{id:"S5P_O3",label:"O₃ Index",scientificName:"Ozone Concentration"},{id:"S5P_CH4",label:"CH₄ Index",scientificName:"Methane Concentration"},{id:"S5P_AI",label:"Aerosol Index (AI)",scientificName:"UV Aerosol Index"},{id:"S5P_AQI",label:"Air Quality Index (AQI)",scientificName:"Combined Pollutant Index"}],ks=[{id:"S6_SLA",label:"Sea Level Anomaly (SLA)",scientificName:"Sea Surface Height − Mean Sea Level"},{id:"S6_SSH",label:"Sea Surface Height (SSH)",scientificName:"Altimeter Measurement"},{id:"S6_OST",label:"Ocean Surface Topography",scientificName:"Sea Surface Height + Corrections"},{id:"S6_SWH",label:"Significant Wave Height (SWH)",scientificName:"Wave Height Measurement"},{id:"S6_SLT",label:"Sea Level Trend Index",scientificName:"Temporal Sea Level Change"}],Hs=[{id:"CCM_NDVI",label:"NDVI",scientificName:"NDVI = (NIR − Red) / (NIR + Red)"},{id:"CCM_NDWI",label:"NDWI",scientificName:"NDWI = (Green − NIR) / (Green + NIR)"},{id:"CCM_NDMI",label:"NDMI",scientificName:"NDMI = (NIR − SWIR) / (NIR + SWIR)"},{id:"CCM_SAVI",label:"SAVI",scientificName:"SAVI = ((NIR − Red) / (NIR + Red + L)) × (1 + L)"},{id:"CCM_EVI",label:"EVI",scientificName:"EVI = 2.5 × (NIR − Red) / (NIR + 6×Red − 7.5×Blue + 1)"},{id:"CCM_NBR",label:"NBR",scientificName:"NBR = (NIR − SWIR2) / (NIR + SWIR2)"},{id:"CCM_BSI",label:"BSI",scientificName:"BSI = ((SWIR + Red) − (NIR + Blue)) / ((SWIR + Red) + (NIR + Blue))"}],$s=[{id:"CCM_SAR_BACKSCATTER",label:"SAR Backscatter Index",scientificName:"σ° (dB)"},{id:"CCM_SAR_VV_VH",label:"VV/VH Ratio",scientificName:"VV ÷ VH"},{id:"CCM_SAR_RVI",label:"Radar Vegetation Index (RVI)",scientificName:"RVI = 4×VH / (VV + VH)"},{id:"CCM_SAR_SM",label:"SAR Soil Moisture Index",scientificName:"Backscatter-based Soil Moisture"},{id:"CCM_SAR_FLOOD",label:"Flood Detection Index",scientificName:"σ°(t2) − σ°(t1)"},{id:"CCM_SAR_CHANGE",label:"SAR Change Detection Index",scientificName:"Multi-temporal Backscatter Difference"}],Ws=[{id:"DEM_SLOPE",label:"Slope",scientificName:"Elevation Gradient"},{id:"DEM_ASPECT",label:"Aspect",scientificName:"Terrain Orientation"},{id:"DEM_HILLSHADE",label:"Hillshade",scientificName:"Terrain Illumination Model"},{id:"DEM_TPI",label:"TPI (Topographic Position Index)",scientificName:"Elevation − Mean Neighborhood Elevation"},{id:"DEM_TRI",label:"TRI (Terrain Ruggedness Index)",scientificName:"Elevation Variability"},{id:"DEM_TWI",label:"TWI (Topographic Wetness Index)",scientificName:"ln(Flow Accumulation / tan(Slope))"},{id:"DEM_WATERSHED",label:"Watershed Index",scientificName:"Hydrological Catchment Analysis"}],Us=[{id:"MOSAIC_NDVI_TS",label:"NDVI Time Series",scientificName:"NDVI(t) Over Time"},{id:"MOSAIC_VAI",label:"Vegetation Anomaly Index (VAI)",scientificName:"Current NDVI − Historical NDVI"},{id:"MOSAIC_CHANGE",label:"Change Detection Index",scientificName:"Image(t2) − Image(t1)"},{id:"MOSAIC_CROP",label:"Crop Monitoring Index",scientificName:"NDVI + NDMI + Weather Data"}],Gs=[{id:"CLMS_LAI",label:"LAI",scientificName:"Leaf Area Index"},{id:"CLMS_FAPAR",label:"FAPAR",scientificName:"Fraction of Absorbed Photosynthetically Active Radiation"},{id:"CLMS_FCOVER",label:"FCOVER",scientificName:"Vegetation Cover Fraction"},{id:"CLMS_GPP",label:"GPP",scientificName:"Gross Primary Productivity"},{id:"CLMS_DMP",label:"DMP",scientificName:"Dry Matter Productivity"},{id:"CLMS_SM",label:"Soil Moisture Index",scientificName:"Surface Soil Moisture"}],Ks=[{id:"CLMS_LC_CHANGE",label:"Land Cover Change Index",scientificName:"LC(t2) − LC(t1)"},{id:"CLMS_URBAN",label:"Urban Expansion Index",scientificName:"Built-up Area Change"},{id:"CLMS_AGRI_EXP",label:"Agricultural Expansion Index",scientificName:"Cropland Change"},{id:"CLMS_FOREST_LOSS",label:"Forest Loss Index",scientificName:"Forest(t1) − Forest(t2)"},{id:"CLMS_FRAGMENT",label:"Landscape Fragmentation Index",scientificName:"Landscape Structure Change"}],Ys=[{id:"CLMS_LC_CLASS",label:"Land Cover Classification Index",scientificName:"Land Cover Classes"},{id:"CLMS_LU_CHANGE",label:"Land Use Change Index",scientificName:"Land Use(t2) − Land Use(t1)"},{id:"CLMS_BUILTUP",label:"Built-up Index",scientificName:"Urban Area Detection"},{id:"CLMS_VEG_COVER",label:"Vegetation Cover Index",scientificName:"Vegetation Fraction"},{id:"CLMS_AGRI_LAND",label:"Agricultural Land Index",scientificName:"Cropland Detection"}],Xs=[{id:"COMP_RAINFALL_ANOM",label:"Rainfall Anomaly Index",scientificName:"Current Rainfall − Historical Average Rainfall"},{id:"COMP_SPI",label:"Drought Index (SPI)",scientificName:"Standardized Precipitation Index"},{id:"COMP_TEMP_ANOM",label:"Temperature Anomaly Index",scientificName:"Current Temperature − Historical Temperature"},{id:"COMP_CLIMATE_STRESS",label:"Climate Stress Index",scientificName:"Temperature + Rainfall + Vegetation Response"},{id:"COMP_ENV_RISK",label:"Environmental Risk Index",scientificName:"Vegetation + Climate + Land Cover + Terrain Factors"}],we={"sentinel-3":{label:"SENTINEL-3 indices",indices:zn},"sentinel-3-olci":{label:"SENTINEL-3 indices",indices:zn},"sentinel-5p":{label:"SENTINEL-5P indices",indices:Os},"sentinel-6":{label:"SENTINEL-6 indices",indices:ks},"ccm-optical":{label:"CCM Optical indices",indices:Hs},"ccm-sar":{label:"CCM SAR indices",indices:$s},"copernicus-dem":{label:"Copernicus DEM indices",indices:Ws},"sentinel-mosaics":{label:"Sentinel Mosaics indices",indices:Us},"clms-biogeophysical":{label:"CLMS Bio-geophysical",indices:Gs},"clms-lulc-priority":{label:"CLMS LULC Priority Areas",indices:Ks},"clms-lulc-mapping":{label:"CLMS LULC Mapping",indices:Ys},"complementary-data":{label:"Complementary Data indices",indices:Xs}},zs=new Set(Object.values(we).flatMap(e=>e.indices.map(t=>t.id.toUpperCase())));function rn(e){return String(e||"").trim().toLowerCase()}function D0(e){return!!we[rn(e)]}function L0(e){var t;return((t=we[rn(e)])==null?void 0:t.indices)??[]}function _0(e){return zs.has(String(e||"").trim().toUpperCase())}function js(e){const t=String(e||"").trim().toUpperCase();if(!t)return null;for(const n of Object.values(we)){const a=n.indices.find(r=>r.id.toUpperCase()===t);if(a)return a}return null}function B0(e){const t=rn(e),n=we[t];if(!n)return null;const a=(n.indices??[]).map(r=>({id:r.id,label:r.label,scientificName:r.scientificName}));return[{id:`collection-indices-${t}`,label:n.label,options:a}]}function R0(){return Fs.map((e,t)=>({label:e,rangeLabel:`Class ${t+1}`,color:Vs[t]}))}const Ga="MVI",Ka="REMI",Ya="MI",Xa="MFI",za="NDRE-B5",ja="NDRE-B6",qa="NDRE-B7",Za="CI-RE",Ja="GCI-CHL",Qa="MTCI",er="REIP",tr=[Ga,Ka,Ya,Xa,za,ja,qa,Za,Ja,Qa,er],qs="Mangrove Vegetation Index — (B08−B03)/(B11−B03) · mangrove detection",Zs="Red-Edge Mangrove Index — ((B06−B05)/(B06+B05))·((B03−B11)/(B03+B11)) · mangrove discrimination",Js="Mangrove Index — (B08−B04)/(B11+B04) · mangrove extraction",Qs="Mangrove Forest Index — ((B05+B06+B07)/3−B8A)/((B05+B06+B07)/3+B8A) · mangrove forest discrimination",el="Normalized Difference Red Edge (B5) — (B8A−B05)/(B8A+B05) · 10-class · mangrove / chlorophyll sensitivity",tl="Normalized Difference Red Edge (B6) — (B8A−B06)/(B8A+B06) · 10-class · mangrove / chlorophyll sensitivity",nl="Normalized Difference Red Edge (B7) — (B8A−B07)/(B8A+B07) · 10-class · mangrove / chlorophyll sensitivity",al="Chlorophyll Index Red Edge — (B8A/B05)−1 · sensitive to chlorophyll content",rl="Green Chlorophyll Index — (B08/B03)−1 · relative chlorophyll / vegetation vigor",il="MERIS Terrestrial Chlorophyll Index — (B06−B05)/(B05−B04) · highly sensitive to chlorophyll variation",sl="Red Edge Inflection Point — 705+35×(((B04+B07)/2−B05)/(B06−B05)) · Guyot & Baret · chlorophyll / condition",ll="mvi",ol="remi",cl="mi",ul="mfi",dl="ndre_b5",ml="ndre_b6",fl="ndre_b7",Il="cire",gl="gci_chl",Sl="mtci",pl="reip",nr=[{id:Ga,label:"MVI",scientificName:qs,deltaId:"DMVI",deltaLabel:"ΔMVI",expr:ll},{id:Ka,label:"REMI",scientificName:Zs,deltaId:"DREMI",deltaLabel:"ΔREMI",expr:ol},{id:Ya,label:"MI",scientificName:Js,deltaId:"DMI",deltaLabel:"ΔMI",expr:cl},{id:Xa,label:"MFI",scientificName:Qs,deltaId:"DMFI",deltaLabel:"ΔMFI",expr:ul},{id:za,label:"NDRE-B5",scientificName:el,deltaId:"DNDRE-B5",deltaLabel:"ΔNDRE-B5",expr:dl},{id:ja,label:"NDRE-B6",scientificName:tl,deltaId:"DNDRE-B6",deltaLabel:"ΔNDRE-B6",expr:ml},{id:qa,label:"NDRE-B7",scientificName:nl,deltaId:"DNDRE-B7",deltaLabel:"ΔNDRE-B7",expr:fl},{id:Za,label:"CI-RE",scientificName:al,deltaId:"DCI-RE",deltaLabel:"ΔCI-RE",expr:Il},{id:Ja,label:"GCI-CHL",scientificName:rl,deltaId:"DGCI-CHL",deltaLabel:"ΔGCI-CHL",expr:gl},{id:Qa,label:"MTCI",scientificName:il,deltaId:"DMTCI",deltaLabel:"ΔMTCI",expr:Sl},{id:er,label:"REIP",scientificName:sl,deltaId:"DREIP",deltaLabel:"ΔREIP",expr:pl}];function x0(e){const t=String(e||"").trim().toUpperCase();return tr.some(n=>n.toUpperCase()===t)}const ar=`let mviDen = samples.B11 - samples.B03;
  let mvi = Math.abs(mviDen) > 1e-6 ? (samples.B08 - samples.B03) / mviDen : NaN;
  let remiADen = samples.B06 + samples.B05;
  let remiBDen = samples.B03 + samples.B11;
  let remi = remiADen > 1e-6 && remiBDen > 1e-6
    ? ((samples.B06 - samples.B05) / remiADen) * ((samples.B03 - samples.B11) / remiBDen)
    : NaN;
  let miDen = samples.B11 + samples.B04;
  let mi = miDen > 1e-6 ? (samples.B08 - samples.B04) / miDen : NaN;
  let reMean = (samples.B05 + samples.B06 + samples.B07) / 3.0;
  let mfiDen = reMean + samples.B8A;
  let mfi = mfiDen > 1e-6 ? (reMean - samples.B8A) / mfiDen : NaN;
  let ndre_b5 = index(samples.B8A, samples.B05);
  let ndre_b6 = index(samples.B8A, samples.B06);
  let ndre_b7 = index(samples.B8A, samples.B07);
  let cire = samples.B05 > 1e-6 ? samples.B8A / samples.B05 - 1.0 : NaN;
  let gci_chl = samples.B03 > 1e-6 ? samples.B08 / samples.B03 - 1.0 : NaN;
  let mtciDen = samples.B05 - samples.B04;
  let mtci = Math.abs(mtciDen) > 1e-6 ? (samples.B06 - samples.B05) / mtciDen : NaN;
  let reipDen = samples.B06 - samples.B05;
  let reip = Math.abs(reipDen) > 1e-6
    ? 705.0 + 35.0 * (((samples.B04 + samples.B07) * 0.5 - samples.B05) / reipDen)
    : NaN;`,At=[{id:"CHAS_ALERT",label:"CHAS Alert",scientificName:"CHAS Alert Layer (derived 4-level rule engine)",deltaId:"CHAS_ALERT",deltaLabel:"CHAS Alert",expr:La},{id:"STRESS_ZONES",label:"Stress Zones",scientificName:"AI Stress Zones (CHAS fusion + 5-class stress map)",deltaId:"STRESS_ZONES",deltaLabel:"Stress Zones",expr:zt},{id:Le,label:"ADI",scientificName:jt,deltaId:Le,deltaLabel:"ADI",expr:_a},{id:_e,label:"NCADI",scientificName:Qt,deltaId:_e,deltaLabel:"NCADI",expr:Is}],jn=["NDVI","NDMI","NDII","NDWI","MNDWI","AWEI","NBR","SAVI","ET","LST"],Dt={NDVI:"NDVI = (B8 − B4) / (B8 + B4)",NDMI:"NDMI = (B8 − B11) / (B8 + B11)",NDII:"NDII = (NIR − SWIR) / (NIR + SWIR)",NDWI:"NDWI = (B3 − B8) / (B3 + B8)",MNDWI:"MNDWI = (B3 − B11) / (B3 + B11)",AWEI:"AWEI = 4 × (B3 − B11) − (0.25 × B8 + 2.75 × B12)",NBR:"NBR = (B8 − B12) / (B8 + B12)",SAVI:"Soil-Adjusted Vegetation Index",ET:"Evapotranspiration (moisture-proxy mm/day)",LST:"Land Surface Temperature (°C, NDVI·NDMI seasonal proxy)"},hl="PRECIP",vl="UCSB CHIRPS Daily Rainfall — Precipitation / Rainfall Analysis (mm)";function sn(e){const t=String(e||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");return t==="PRECIP"||t==="CHIRPS"||t==="RAINFALL"||t==="PRECIPITATION"}const rt=[{id:"vegetation-health",groupLabel:"🌱 Vegetation Health Layer",indices:[{id:"CVHI",label:"CVHI",scientificName:"Composite Vegetation Health Index (NDVI·NDMI·NDWI·SAVI mean)",deltaId:"DCVHI",deltaLabel:"ΔCVHI",expr:"(ndvi + ndmi + ndwi + savi) / 4"},{id:"VHS",label:"VHS",scientificName:"Vegetation Health Score",deltaId:"DVHS",deltaLabel:"ΔVHS",expr:"(ndvi + savi) / 2"},{id:"VDI",label:"VDI",scientificName:"Vegetation Dryness Index",deltaId:"DVDI",deltaLabel:"ΔVDI",expr:"0.7 * ndvi + 0.3 * savi"},{id:"CVI",label:"CVI",scientificName:"Crop Vigor Index (0.50·NDVI + 0.30·EVI + 0.20·NDRE)",deltaId:"DCVI",deltaLabel:"ΔCVI",expr:"0.50 * ndvi + 0.30 * evi + 0.20 * ndre"},{id:"CSI",label:"CSI",scientificName:"Crop Stress Index",deltaId:"DCSI",deltaLabel:"ΔCSI",expr:"1 - ((ndvi + ndmi) / 2)"},{id:"WST",label:"WST",scientificName:"Water Stress Index",deltaId:"DWST",deltaLabel:"ΔWST",expr:"ndvi - ndmi"}]},{id:"water-moisture",groupLabel:"💧 Water & Moisture Layer",indices:[{id:"DRI",label:"DRI",scientificName:"Drought Risk Index",deltaId:"DDRI",deltaLabel:"ΔDRI",expr:"1 - ((ndmi + ndwi) / 2)"},{id:"VMI",label:"VMI",scientificName:"Vegetation Moisture Index",deltaId:"DVMI",deltaLabel:"ΔVMI",expr:"(ndmi + ndwi) / 2"},{id:"SMI",label:"SMI",scientificName:"Soil Moisture Index",deltaId:"DSMI",deltaLabel:"ΔSMI",expr:"0.7 * ndmi + 0.3 * ndwi"},{id:"OIR",label:"OIR",scientificName:"Over-Irrigation Risk",deltaId:"DOIR",deltaLabel:"ΔOIR",expr:"ndwi - ndvi"},{id:"WDSI",label:"WDSI",scientificName:"Water Drought Situation Index (0.40·NDMI + 0.35·NDWI + 0.15·NDVI + 0.10·SAVI)",deltaId:"DWDSI",deltaLabel:"ΔWDSI",expr:"0.40 * ndmi + 0.35 * ndwi + 0.15 * ndvi + 0.10 * savi"},{id:"DSI",label:"DSI",scientificName:"Drought Severity Index (0.50·(1−VCI) + 0.30·(1−SMCI) + 0.20·(1−NDMI_norm)) · 10-class",deltaId:"DDSI",deltaLabel:"ΔDSI",expr:Ds}]},{id:"irrigation-field",groupLabel:"🚜 Irrigation & Field Management",indices:[{id:"IEI",label:"IEI",scientificName:"Irrigation Efficiency Index",deltaId:"DIEI",deltaLabel:"ΔIEI",expr:"savi === 0 ? 0 : ndmi / savi"},{id:"UII",label:"UII",scientificName:"Under-Irrigation Index",deltaId:"DUII",deltaLabel:"ΔUII",expr:"savi - ndmi"},{id:"FPR",label:"FPR",scientificName:"Field Performance Ratio",deltaId:"DFPR",deltaLabel:"ΔFPR",expr:"(1 - ndvi) + (1 - ndmi)"},{id:"CPI",label:"CPI",scientificName:"Crop Production Index",deltaId:"DCPI",deltaLabel:"ΔCPI",expr:"0.4 * ndvi + 0.3 * ndmi + 0.2 * savi + 0.1 * ndwi"},{id:"ISS",label:"ISS",scientificName:"Irrigation Stress Score (0.40·NDMI + 0.30·NDWI + 0.20·NDVI + 0.10·SAVI)",deltaId:"DISS",deltaLabel:"ΔISS",expr:"0.40 * ndmi + 0.30 * ndwi + 0.20 * ndvi + 0.10 * savi"},{id:"WAPI",label:"WAPI",scientificName:"Water Allocation Priority Index (0.40·WDSI + 0.20·ΔWDSI + 0.20·(1−NDMI) + 0.10·ETstress + 0.10) · 10-class",deltaId:"DWAPI",deltaLabel:"ΔWAPI",expr:Bs}]},{id:"growth-stability",groupLabel:"🌾 Growth & Stability",indices:[{id:"GPI",label:"GPI",scientificName:"Growth Performance Index",deltaId:"DGPI",deltaLabel:"ΔGPI",expr:"(ndvi + savi + ndmi) / 3"},{id:"CSI2",label:"CSI2",scientificName:"Canopy Stability Index II",deltaId:"DCSI2",deltaLabel:"ΔCSI2",expr:"1 - Math.abs(ndvi - savi)"},{id:"CRI",label:"CRI",scientificName:"Crop Resilience Index",deltaId:"DCRI",deltaLabel:"ΔCRI",expr:"ndvi + ndmi"},{id:"VDG",label:"VDG",scientificName:"Vegetation Decline Gradient",deltaId:"DVDG",deltaLabel:"ΔVDG",expr:"1 - ((ndvi + savi) / 2)"}]},{id:"risk-composite",groupLabel:"⚠️ Risk & Composite",indices:[{id:"ARI",label:"ARI",scientificName:"Agro Risk Index",deltaId:"DARI",deltaLabel:"ΔARI",expr:"1 - ((ndvi + ndmi + ndwi + savi) / 4)"},{id:"CHS",label:"CHS",scientificName:"Crop Health Score (0.30·NDVI + 0.25·NDRE + 0.20·EVI + 0.15·NDMI + 0.10·SAVI)",deltaId:"DCHS",deltaLabel:"ΔCHS",expr:"0.30 * ndvi + 0.25 * ndre + 0.20 * evi + 0.15 * ndmi + 0.10 * savi"},{id:"CPS",label:"CPS",scientificName:"Crop Pressure Score",deltaId:"DCPS",deltaLabel:"ΔCPS",expr:"(1 - ndvi) + (1 - ndmi)"}]},{id:"crop-phenology",groupLabel:"📅 Crop Phenology & Calendar",indices:[{id:"PRI",label:"PRI",scientificName:"Planting Readiness Index (0.35·NDVI + 0.25·NDMI + 0.20·NDWI + 0.10·SAVI + 0.10·EVI)",deltaId:"DPRI",deltaLabel:"ΔPRI",expr:"0.35 * ndvi + 0.25 * ndmi + 0.20 * ndwi + 0.10 * savi + 0.10 * evi"},{id:"CGI",label:"CGI",scientificName:"Crop Growth Index (0.40·NDVI + 0.30·EVI + 0.20·NDRE + 0.10·NDMI)",deltaId:"DCGI",deltaLabel:"ΔCGI",expr:"0.40 * ndvi + 0.30 * evi + 0.20 * ndre + 0.10 * ndmi"},{id:"CMI",label:"CMI",scientificName:"Crop Maturity Index (0.50·NDRE + 0.30·NDVI + 0.20·EVI)",deltaId:"DCMI",deltaLabel:"ΔCMI",expr:"0.50 * ndre + 0.30 * ndvi + 0.20 * evi"},{id:"HRI",label:"HRI",scientificName:"Harvest Readiness Index (0.40·(1−NDVI) + 0.25·(1−NDRE) + 0.20·(1−NDMI) + 0.15·(1−SAVI))",deltaId:"DHRI",deltaLabel:"ΔHRI",expr:"0.40 * (1 - ndvi) + 0.25 * (1 - ndre) + 0.20 * (1 - ndmi) + 0.15 * (1 - savi)"},{id:"VRI",label:"VRI",scientificName:"Vegetation Recovery Index ((NDVI − MinNDVI) / (MaxNDVI − MinNDVI))",deltaId:"DVRI",deltaLabel:"ΔVRI",expr:"(ndvi + 1) / 2"},{id:"CCI",label:"CCI",scientificName:"Crop Calendar Confidence Index (NDVI/NDRE/EVI stability · observation density)",deltaId:"DCCI",deltaLabel:"ΔCCI",expr:"0.40 * ndvi + 0.30 * ndre + 0.20 * evi + 0.10 * savi"},{id:"EPD",label:"EPD",scientificName:"Estimated Planting Date (first PRI≥0.45 with rising NDVI)",deltaId:"DEPD",deltaLabel:"ΔEPD",expr:"0.35 * ndvi + 0.25 * ndmi + 0.20 * ndwi + 0.10 * savi + 0.10 * evi"},{id:"EHD",label:"EHD",scientificName:"Estimated Harvest Date (first HRI≥0.70 with falling NDVI)",deltaId:"DEHD",deltaLabel:"ΔEHD",expr:"0.40 * (1 - ndvi) + 0.25 * (1 - ndre) + 0.20 * (1 - ndmi) + 0.15 * (1 - savi)"}]},{id:"soil-salinity",groupLabel:"🧂 Soil & Salinity Layer",indices:[{id:"NDSI",label:"NDSI",scientificName:"Normalized Difference Salinity Index ((B11−B8)/(B11+B8))",deltaId:"DNDSI",deltaLabel:"ΔNDSI",expr:"ndsi"},{id:"SI",label:"SI",scientificName:"Salinity Index (√(B3·B4))",deltaId:"DSAL",deltaLabel:"ΔSI",expr:"si"},{id:"SSI",label:"SSI",scientificName:"Soil Salinity Index (NDSI + SI)",deltaId:"DSSI",deltaLabel:"ΔSSI",expr:"ssi"}]},{id:"gold-exploration",groupLabel:"🪙 Gold Exploration Indices",indices:[{id:"IOI",label:"IOI",scientificName:"Iron Oxide Index · B04 / B02",deltaId:"DIOI",deltaLabel:"ΔIOI",expr:"ioi"},{id:"CLAY_MI",label:"CMI",scientificName:"Clay Mineral Index (CMI) · B11 / B12",deltaId:"DCLAY_MI",deltaLabel:"ΔCMI",expr:"clay_mi"},{id:"FMI",label:"FMI",scientificName:"Ferrous Mineral Index · B11 / B08",deltaId:"DFMI",deltaLabel:"ΔFMI",expr:"fmi"},{id:"NDAI",label:"NDAI",scientificName:"Normalized Difference Alteration Index · (B11 − B12) / (B11 + B12)",deltaId:"DNDAI",deltaLabel:"ΔNDAI",expr:"ndai"},{id:"BSI",label:"BSI",scientificName:"Bare Soil Index · ((B11 + B04) − (B08 + B02)) / ((B11 + B04) + (B08 + B02))",deltaId:"DBSI",deltaLabel:"ΔBSI",expr:"bsi"},{id:"REAI",label:"REAI",scientificName:"Red Edge Alteration Index · B06 / B05",deltaId:"DREAI",deltaLabel:"ΔREAI",expr:"reai"},{id:"GEI",label:"GEI",scientificName:"Composite Gold Exploration Index · 0.35(IOI) + 0.30(CMI) + 0.20(FMI) + 0.15(BSI)",deltaId:"DGEI",deltaLabel:"ΔGEI",expr:"gei"},{id:"GCI",label:"GCI",scientificName:"Gold Composite Index · 0.30(IOI) + 0.25(CMI) + 0.20(FMI) + 0.15(NDAI) + 0.10(BSI)",deltaId:"DGCI",deltaLabel:"ΔGCI",expr:"gci"},{id:"EGCI",label:"EGCI",scientificName:"Estimated Gold Concentration Index · 0.30(IOIN) + 0.25(CMIN) + 0.20(FMIN) + 0.15(NDAIN) + 0.10(BSIN)",deltaId:"DEGCI",deltaLabel:"ΔEGCI",expr:"egci"}]},{id:"crop",groupLabel:"🌾 Crop",indices:[{id:"CHAS",label:"CHAS",scientificName:"Crop Health Analysis Score (NDVI·NDWI·NDMI·SAVI fusion)",deltaId:"DCHAS",deltaLabel:"ΔCHAS",expr:La}]},{id:"mangrove",groupLabel:"Live Analysis · Mangrove",indices:nr.map(e=>({id:e.id,label:e.label,scientificName:e.scientificName,deltaId:e.deltaId,deltaLabel:e.deltaLabel,expr:e.expr}))}],Te=new Map,Ie=new Map,ge=new Set,ln=new Set(["gold-exploration","mangrove"]);for(const e of rt){const t=!ln.has(e.id);for(const n of e.indices)Te.set(n.id.toUpperCase(),n),ge.add(n.id.toUpperCase()),t&&(Ie.set(n.deltaId.toUpperCase(),n),ge.add(n.deltaId.toUpperCase()))}for(const e of At)Te.set(e.id.toUpperCase(),e),ge.add(e.id.toUpperCase());const Cl=rt.filter(e=>!ln.has(e.id)).map(e=>({id:`${e.id}-delta`,groupLabel:`${e.groupLabel} (Delta)`,indices:e.indices.map(t=>({id:t.deltaId,label:t.deltaLabel,scientificName:`Change · ${t.scientificName}`,deltaId:t.deltaId,deltaLabel:t.deltaLabel,expr:t.expr}))}));function Nl(e){return Te.has(String(e||"").trim().toUpperCase())}function x(e){return Ie.has(String(e||"").trim().toUpperCase())}function on(e){const t=String(e||"").trim().toUpperCase();return ge.has(t)}function cn(e){const t=String(e||"").trim().toUpperCase();return Te.get(t)??Ie.get(t)??null}function un(e){const t=String(e||"").trim().toUpperCase();if(!Ie.has(t))return null;for(const n of rt)if(!ln.has(n.id)){for(const a of n.indices)if(a.deltaId.toUpperCase()===t)return a.id}return null}function dn(e,t=""){const n=cn(e);return n?t?n.expr.replace(/\bndvi\b/g,`${t}ndvi`).replace(/\bndmi\b/g,`${t}ndmi`).replace(/\bndwi\b/g,`${t}ndwi`).replace(/\bsavi\b/g,`${t}savi`):n.expr:null}function bl(){const e=[{name:"SAVI",title:"SAVI"},{name:"ET",title:"Evapotranspiration"},{name:"LST",title:"Land Surface Temperature"},{name:"DATAMASK",title:"DataMask"}],t=new Set(e.map(n=>n.name.toUpperCase()));for(const n of ge??[]){if(t.has(n))continue;t.add(n);const a=Te.get(n)??Ie.get(n);if(!a)continue;const r=Ie.has(n)?a.deltaLabel:a.label;e.push({name:n,title:r})}return e}function w0(e){const t=String(e||"").trim().toUpperCase();if(!t)return;if(t in Dt)return Dt[t];const n=js(t);if(n)return n.scientificName;if(ve(t))return Fa;if(W(t))return jt;if(X(t))return Qt;if(sn(t))return vl;const a=cn(t);if(a)return x(t)?`Change · ${a.scientificName}`:a.scientificName}function El(e){const t=new Map;for(const i of e){const s=String(i.name||"").trim();s&&t.set(s.toUpperCase(),String(i.title||s).trim()||s)}const n=[];n.push({id:"core",label:"Core Interpretation",options:jn.map(i=>({id:i,label:i,scientificName:Dt[i]}))}),n.push({id:"live-analysis-lulc",label:"Live Analysis · Land Cover",options:[{id:Ye,label:"LULC",scientificName:Fa}]}),n.push({id:"live-analysis-anomaly",label:"Live Analysis · Anomaly",options:[{id:Le,label:"ADI",scientificName:jt}]}),n.push({id:"live-analysis-cultivation",label:"Live Analysis · Cultivation",options:[{id:_e,label:"NCADI",scientificName:Qt}]}),n.push({id:"live-analysis-mangrove",label:"Live Analysis · Mangrove",options:nr.map(i=>({id:i.id,label:i.label,scientificName:i.scientificName}))});for(const i of rt)i.id!=="mangrove"&&n.push({id:i.id,label:i.groupLabel,options:i.indices.map(s=>({id:s.id,label:s.label,scientificName:s.scientificName}))});At.length&&n.push({id:"derived-alert",label:"🚨 Derived Alert Layers",options:At.filter(i=>!W(i.id)&&!X(i.id)).map(i=>({id:i.id,label:i.label,scientificName:i.scientificName}))});for(const i of Cl)n.push({id:i.id,label:i.groupLabel,options:i.indices.map(s=>({id:s.id,label:s.label,scientificName:s.scientificName}))});const a=new Set([...jn.map(i=>i.toUpperCase()),...ge,Ye,hl,"DATAMASK",...tr.map(i=>i.toUpperCase())]),r=e.map(i=>{const s=String(i.name||"").trim();return!s||a.has(s.toUpperCase())?null:{id:s,label:String(i.title||s).trim()||s,scientificName:void 0}}).filter(i=>i!=null).sort((i,s)=>i.label.localeCompare(s.label,void 0,{sensitivity:"base"}));return r.length&&n.push({id:"sentinel-presets",label:"Sentinel Hub layers",options:r}),n.filter(i=>i.options.length>0)}function yl(e){const t=[],n=new Set;for(const a of e)for(const r of a.options){const i=r.id.toUpperCase();n.has(i)||(n.add(i),t.push(r))}return t}const it=10,Ml=[1,2,3,4,5,6,7,8,9],T0=["Extremely Low ET","Very Low ET","Low ET","Slightly Low ET","Moderate ET","Moderately High ET","High ET","Very High ET","Extremely High ET","Exceptional ET"],rr=[.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5,8.5,9.5],Al=[1981066,1920728,165063,959977,2278750,10741301,16638023,16498468,16347926,14427686],Lt=rr.map((e,t)=>[e,Al[t]]);function mn(e){return Number.isFinite(e)?Math.max(0,Math.min(1,e)):0}function H(e,t,n){return Number.isFinite(e)?Math.max(t,Math.min(n,e)):t}function Dl(e){const t=String(e||"").trim().slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(t))return 180;const n=new Date(`${t}T12:00:00Z`);if(Number.isNaN(n.getTime()))return 180;const a=Date.UTC(n.getUTCFullYear(),0,0);return Math.round((n.getTime()-a)/864e5)}function Pe(e){const t=typeof e=="number"&&Number.isFinite(e)?Math.max(1,Math.min(366,Math.round(e))):Dl(typeof e=="string"?e:null),n=Math.sin(2*Math.PI*(t-80)/365);return Number((.45+.55*(.5+.5*n)).toFixed(4))}function ir(e){return e==null||!Number.isFinite(e)?.85:Number(H(.15+1.25*e,.15,1.25).toFixed(4))}function sr(e,t){return .6*e+.4*t}function Ll(e,t){return mn(1-sr(e,t))}function _l(e,t,n){const a=Ll(e,t),r=(n==null?void 0:n.seasonFactor)!=null&&Number.isFinite(n.seasonFactor)?H(n.seasonFactor,.35,1.15):Pe(n==null?void 0:n.sceneDate),i=(n==null?void 0:n.kc)!=null&&Number.isFinite(n.kc)?H(n.kc,.15,1.35):ir(n==null?void 0:n.ndvi);return Number((a*r*i*it).toFixed(3))}function Bl(e){const t=(e==null?void 0:e.seasonFactor)!=null&&Number.isFinite(e.seasonFactor)?H(e.seasonFactor,.35,1.15):Pe(e==null?void 0:e.sceneDate),n=(e==null?void 0:e.kc)!=null&&Number.isFinite(e.kc)?H(e.kc,.15,1.35):ir(e==null?void 0:e.ndvi);return Number((t*n*it).toFixed(3))}function Rl(e,t){const n=sr(e,t),a=-.2,i=mn((n-a)/(.35-a));return Number(H(.5+.5*i,.5,1).toFixed(4))}function xl(e,t,n){return!Number.isFinite(e)||e<=0?0:Number((e*Rl(t,n)).toFixed(3))}function P0(e,t,n){const a=Bl(n);return{etaMmDay:xl(a,e,t),etcMmDay:a}}function wl(e=.85){return`Math.max(0, Math.min(15, Math.max(0, Math.min(1, 1 - (0.6 * ndmi + 0.4 * ndwi))) * ${Number(e.toFixed(4))} * Math.max(0.15, Math.min(1.25, 0.15 + 1.25 * ndvi)) * ${it}))`}wl(.85);function lr(e=.85){return`let ndmi = index(samples.B08, samples.B11);
  let ndwi = index(samples.B03, samples.B08);
  let ndvi = index(samples.B08, samples.B04);
  let demand = Math.max(0, Math.min(1, 1 - (0.6 * ndmi + 0.4 * ndwi)));
  let kc = Math.max(0.15, Math.min(1.25, 0.15 + 1.25 * ndvi));
  let et = Math.max(0, Math.min(15, demand * ${Number(e.toFixed(4))} * kc * ${it}));`}const Tl=lr(.85);function V0(e=15,t=.25){const n=[];for(let a=0;a<=e+1e-9;a+=t)n.push(Number(a.toFixed(4)));return n}function F0(e,t=10){if(!e.length||t<2)return null;const n=[...e].sort((o,c)=>o.lowEdge-c.lowEdge),a=n.reduce((o,c)=>o+Math.max(0,c.count||0),0);if(a<t)return null;const r=[n[0].lowEdge];let i=0,s=1;for(const o of n)for(i+=Math.max(0,o.count||0);s<t&&i/a>=s/t;){const c=Number(o.highEdge.toFixed(4));c>r[r.length-1]&&r.push(c),s+=1}const l=n[n.length-1].highEdge;for(;r.length<t;)r.push(Number(l.toFixed(4)));r.push(Number(Math.max(l,r[r.length-1]).toFixed(4)));for(let o=1;o<r.length;o+=1)r[o]<=r[o-1]&&(r[o]=Number((r[o-1]+.001).toFixed(4)));return r.length===t+1?r:null}function O0(e,t){const n=Math.max(0,t.length-1),a=new Array(n).fill(0);if(n<1)return a;for(const r of e){const i=Math.max(0,r.count||0);if(!i)continue;const s=(r.lowEdge+r.highEdge)/2;let l=n-1;for(let o=0;o<n;o+=1){if(s>=t[o]&&s<t[o+1]){l=o;break}if(s<t[0]){l=0;break}}a[l]+=i}return a}function Pl(e){const t=[];for(let n=0;n<e.length-1;n+=1)t.push(Number(((e[n]+e[n+1])/2).toFixed(4)));return t}const Vl=[12,16,20,24,28,32,36,40,44],k0=["Very cold surface","Cold","Cool","Mild cool","Mild","Warm","Hot","Very hot","Extreme heat","Critical heat"],or=[10,14,18,22,26,30,34,38,42,48],Fl=[1981066,1920728,959977,2278750,10741301,16638023,16498468,16347926,15680580,10033947],_t=or.map((e,t)=>[e,Fl[t]]);function Ol(e){return Number.isFinite(e)?mn(.5-.5*H(e,-1,1)):.5}function kl(e,t,n){const r=18+24*((n==null?void 0:n.seasonFactor)!=null&&Number.isFinite(n.seasonFactor)?H(n.seasonFactor,.35,1.15):Pe(n==null?void 0:n.sceneDate)),i=Number.isFinite(e)?H(e,-.2,1):.3,s=Ol(t),l=r-12*i+8*s;return Number(H(l,5,55).toFixed(2))}function Hl(e=.85){return`Math.max(5, Math.min(55, (18 + 24 * ${Number(e.toFixed(4))}) - 12 * Math.max(-0.2, Math.min(1, ndvi)) + 8 * Math.max(0, Math.min(1, 0.5 - 0.5 * Math.max(-1, Math.min(1, ndmi))))))`}Hl(.85);function cr(e=.85){return`let ndvi = index(samples.B08, samples.B04);
  let ndmi = index(samples.B08, samples.B11);
  let dryness = Math.max(0, Math.min(1, 0.5 - 0.5 * Math.max(-1, Math.min(1, ndmi))));
  let lst = Math.max(5, Math.min(55, (18 + 24 * ${Number(e.toFixed(4))}) - 12 * Math.max(-0.2, Math.min(1, ndvi)) + 8 * dryness));`}const $l=cr(.85);function Wl(e){const t=[];for(let n=0;n<e.length-1;n+=1)t.push(Number(((e[n]+e[n+1])/2).toFixed(2)));return t}const Ul=.005,ur=100,dr=[2,3,4,5,6,7,11],mr=.65,fr=.45,Ir=.55,Gl=.18;function gr(e){return e.map(t=>`scl == ${t}`).join(" || ")}const mt="(s.CLP > 1.5 ? s.CLP / 255.0 : s.CLP)",Sr=`!(${gr(dr)}) && ((scl == 9 && ${mt} >= ${fr}) || (scl == 10 && ${mt} >= ${Ir}) || (scl == 8 && ${mt} >= ${mr}))`;function pr(e="s"){return`var scl = Math.round(${e}.SCL);
  var cloud = ${Sr.replace(/s\./g,`${e}.`)};`}function hr(e="s"){return`${pr(e)}
  if (!${e}.dataMask || cloud) return [0, 0, 0, 0];`}const Kl=`//VERSION=3
function setup() {
  return {
    input: [{ bands: ["SCL", "CLP", "dataMask"] }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  ${pr("s")}
  if (!s.dataMask) return [0, 0, 0, 0];
  return cloud ? [255, 0, 0, 255] : [0, 255, 0, 255];
}`;function Yl(e){let t=0,n=0;for(let s=0;s<e.length;s+=4){const l=e[s],o=e[s+1];e[s+3]<128||(o>200&&l<80?t+=1:l>200&&o<80&&(n+=1))}const a=t+n;if(a===0)return{clearCount:0,cloudCount:0,maskedCount:0,validCount:0,aoiCloudCoverPct:null,aoiClearCoverPct:null};const r=Math.round(n/a*1e3)/10,i=Math.round(t/a*1e3)/10;return{clearCount:t,cloudCount:n,maskedCount:n,validCount:t,aoiCloudCoverPct:r,aoiClearCoverPct:i}}function vr(e,t,n){const r=(t.validCount+t.maskedCount>0?t.validCount/(t.validCount+t.maskedCount):0)>=Ul;return{sceneId:(n==null?void 0:n.sceneId)??e,acquisitionDate:e,originalCloudCoverage:(n==null?void 0:n.originalCloudCoverage)!=null&&Number.isFinite(n.originalCloudCoverage)?n.originalCloudCoverage:null,aoiCloudPercentage:t.aoiCloudCoverPct,aoiClearPercentage:t.aoiClearCoverPct,maskedPixelCount:t.maskedCount,validPixelCount:t.validCount,usable:r,status:r?t.aoiClearCoverPct!=null&&t.aoiClearCoverPct>=80?"clear":"partial_cloud_masked":"no_clear_pixels"}}function Cr(e){console.info("[sentinel-s2-cloud]",{sceneId:e.sceneId,acquisitionDate:e.acquisitionDate,originalCloudCoverage:e.originalCloudCoverage,aoiCloudPct:e.aoiCloudPercentage,aoiClearPct:e.aoiClearPercentage,maskedPixels:e.maskedPixelCount,validPixels:e.validPixelCount,status:e.status,usable:e.usable})}const Xl=["SCL","CLP"],$e=2.5,zl=["B02","B03","B04",...Xl];function Nr(e){return`function cloudProb(s) {
  return s.CLP > 1.5 ? s.CLP / 255.0 : s.CLP;
}
function cloudMasked(s) {
  var scl = Math.round(s.SCL);
  if (${gr(dr)}) return false;
  var clp = cloudProb(s);
  var vis = (s.B02 + s.B03 + s.B04) / 3;
  if (vis < ${Gl}) return false;
  if (scl == 9 && clp >= ${fr}) return true;
  if (scl == 10 && clp >= ${Ir}) return true;
  if (scl == 8 && clp >= ${mr}) return true;
  return false;
}
function tc(v) { return Math.max(0, Math.min(1, v * ${$e})); }
function trueColor(s) { return [tc(s.B04), tc(s.B03), tc(s.B02), 1]; }`}function jl(e="samples",t="inlineRgb"){return t==="transparent"?`if (!${e}.dataMask) return [0, 0, 0, 0];
  if (cloudMasked(${e})) return [0, 0, 0, 0];`:`if (!${e}.dataMask) return [0, 0, 0, 0];
  if (cloudMasked(${e})) return trueColor(${e});`}const fn=[[-1,4000266],[-.12,6029312],[-.04,9109504],[.04,12986408],[.12,15022389],[.17,16733986],[.22,16750592],[.28,16758605],[.34,16764032],[.4,16774557]],In=[[.42,10275941],[.47,8172354],[.52,4431943],[.57,3706428],[.62,3046706],[.72,1793568],[.85,994842],[1,339478]];[...fn,...In.filter(([e])=>e>.4)];function ql(e){return Ar(e,fn)}function Zl(e){return e<.42?ql(e):Ar(e,In)}const Jl=[...fn,...In],H0=[-.08,.02,.1,.18,.26,.34,.42,.52,.62],br=[-.14,-.03,.06,.14,.22,.3,.38,.47,.57,.72],Er=br.map(e=>Zl(e)),Ql=br.map((e,t)=>[e,Er[t]]);function yr(e,t,n){const a=Math.max(0,Math.min(1,n)),r=e>>16&255,i=e>>8&255,s=e&255,l=t>>16&255,o=t>>8&255,c=t&255,u=Math.round(r+(l-r)*a),d=Math.round(i+(o-i)*a),g=Math.round(s+(c-s)*a);return(u<<16|d<<8|g)>>>0}const Mr=[[-.8,32768],[0,16777215],[.8,204]],$0=[-.64,-.48,-.32,-.16,0,.16,.32,.48,.64],V=[25600,32768,6732650,13166281,16777215,11789820,5227511,236517,161725,128],W0=[[-.72,V[0]],[-.56,V[1]],[-.4,V[2]],[-.24,V[3]],[-.08,V[4]],[.08,V[5]],[.24,V[6]],[.4,V[7]],[.56,V[8]],[.72,V[9]]],R=[[-.5,8323072],[-.1,13840175],[.1,16011550],[.25,16771899],[.4,11457921],[.55,6732650],[.7,3706428],[.85,3046706],[1,1793568]],U0=[-.35,-.2,-.05,.1,.25,.4,.55,.7,.85];function F(e){if(e<=R[0][0])return R[0][1];if(e>=R[R.length-1][0])return R[R.length-1][1];for(let t=0;t<R.length-1;t++){const[n,a]=R[t],[r,i]=R[t+1];if(e>=n&&e<=r){const s=r-n,l=s>0?(e-n)/s:0;return yr(a,i,l)}}return R[R.length-1][1]}const O=[F(-.425),F(-.275),F(-.125),F(.025),F(.175),F(.325),F(.475),F(.625),F(.775),F(.925)],G0=[[-.425,O[0]],[-.275,O[1]],[-.125,O[2]],[.025,O[3]],[.175,O[4]],[.325,O[5]],[.475,O[6]],[.625,O[7]],[.775,O[8]],[.925,O[9]]],eo=[-2,-1,-.5,0,.2,.5,1,2,4],T=[15260872,13943976,12888194,12096874,11789820,5227511,2733814,166097,1402304,340065],K0=340065,to=[[-2.5,T[0]],[-1.5,T[1]],[-.75,T[2]],[-.25,T[3]],[.1,T[4]],[.35,T[5]],[.75,T[6]],[1.5,T[7]],[3,T[8]],[5,T[9]]],no=[-.6,-.45,-.3,-.15,0,.1,.2,.35,.5],P=[15260872,13943976,12888194,12096874,10506797,10935200,4306628,2915254,2188972,340065],ao=[[-.675,P[0]],[-.525,P[1]],[-.375,P[2]],[-.225,P[3]],[-.075,P[4]],[.05,P[5]],[.15,P[6]],[.275,P[7]],[.425,P[8]],[.65,P[9]]],gn=[[-.8,8388608],[-.24,16711680],[-.032,16776960],[.032,65535],[.24,255],[.8,128]],Y0=[-.64,-.48,-.32,-.16,0,.16,.32,.48,.64];function Ar(e,t){if(!t.length)return 0;if(e<=t[0][0])return t[0][1];if(e>=t[t.length-1][0])return t[t.length-1][1];for(let n=0;n<t.length-1;n++){const[a,r]=t[n],[i,s]=t[n+1];if(e>=a&&e<=i){const l=i-a,o=l>0?(e-a)/l:0;return yr(r,s,o)}}return t[t.length-1][1]}const k=[8388608,16711680,16737792,16776960,16777113,11789820,5227511,2733814,166097,128],X0=[[-.72,k[0]],[-.56,k[1]],[-.4,k[2]],[-.24,k[3]],[-.08,k[4]],[.08,k[5]],[.24,k[6]],[.4,k[7]],[.56,k[8]],[.72,k[9]]],ro=gn,Dr=gn,io=[[-.2,1710618],[0,14142664],[.1,16774557],[.2,14477173],[.3,11457921],[.4,8172354],[.5,5606191],[.65,3369246],[.8,1793568],[1,19712]],so=[[-.5,2171169],[-.2,12434877],[0,16119260],[.1,15134364],[.2,13491257],[.3,11457921],[.4,6732650],[.5,4431943],[.6,3046706],[.75,1793568],[1,17408]],lo=[[-.2,3622735],[0,15723497],[.1,14478792],[.2,10868391],[.35,6732650],[.5,3706428],[.65,3046706],[.8,1793568],[1,17408]],oo=[[-1,1776411],[-.2,6381921],[0,10395294],[.1,12434877],[.25,14737632],[.4,16119285],[.6,16777215],[1,16777215]],co=[[-.2,4073251],[0,16764092],[.1,16755601],[.2,10868391],[.35,6732650],[.5,3706428],[.65,3046706],[.8,1793568],[1,17408]],Lr={ndvi:{inputs:["B04","B08","dataMask"],indexVar:"ndvi",indexExpr:"let ndvi = index(samples.B08, samples.B04);",ramp:Ql},ndwi:{inputs:["B03","B08","dataMask"],indexVar:"ndwi",indexExpr:"let ndwi = index(samples.B03, samples.B08);",ramp:Mr},mndwi:{inputs:["B03","B11","dataMask"],indexVar:"mndwi",indexExpr:"let mndwi = index(samples.B03, samples.B11);",ramp:ao},awei:{inputs:["B03","B08","B11","B12","dataMask"],indexVar:"awei",indexExpr:"let awei = 4.0 * (samples.B03 - samples.B11) - (0.25 * samples.B08 + 2.75 * samples.B12);",ramp:to},nbr:{inputs:["B08","B12","dataMask"],indexVar:"nbr",indexExpr:"let nbr = index(samples.B08, samples.B12);",ramp:R},ndmi:{inputs:["B8A","B11","dataMask"],indexVar:"ndmi",indexExpr:"let ndmi = index(samples.B8A, samples.B11);",ramp:ro},ndii:{inputs:["B08","B11","dataMask"],indexVar:"ndii",indexExpr:"let ndii = index(samples.B08, samples.B11);",ramp:Dr},evi:{inputs:["B02","B04","B08","dataMask"],indexVar:"evi",indexExpr:"let evi = 2.5 * ((samples.B08 - samples.B04) / (samples.B08 + 6.0 * samples.B04 - 7.5 * samples.B02 + 1.0));",ramp:io},savi:{inputs:["B04","B08","dataMask"],indexVar:"savi",indexExpr:"let savi = ((samples.B08 - samples.B04) * 1.5) / (samples.B08 + samples.B04 + 0.5);",ramp:so},gndvi:{inputs:["B03","B08","dataMask"],indexVar:"gndvi",indexExpr:"let gndvi = index(samples.B08, samples.B03);",ramp:lo},ndsi:{inputs:["B03","B11","dataMask"],indexVar:"ndsi",indexExpr:"let ndsi = index(samples.B03, samples.B11);",ramp:oo},ndre:{inputs:["B05","B08","dataMask"],indexVar:"ndre",indexExpr:"let ndre = index(samples.B08, samples.B05);",ramp:co},et:{inputs:["B03","B04","B08","B11","dataMask"],indexVar:"et",indexExpr:Tl,ramp:Lt},lst:{inputs:["B04","B08","B11","dataMask"],indexVar:"lst",indexExpr:$l,ramp:_t}};function uo(e){return`0x${(e>>>0).toString(16).padStart(6,"0")}`}function z(e){return e.map(([t,n])=>`[${t}, ${uo(n)}]`).join(`,
   `)}function Se(e){return e.map(t=>String(t)).join(", ")}function j(e){const t=e.filter(n=>n!=="dataMask");for(const n of zl)t.includes(n)||t.push(n);return[...t,"dataMask"]}const q=Nr();function Z(e){return jl("samples",e?"transparent":"inlineRgb")}function J(e=null){return e?`var a = samples.dataMask * (${e} ? 1.0 : 0.0);
  return imgVals.concat(a);`:"return imgVals.concat(samples.dataMask);"}function mo(e=null,t){const n=e!=null&&Number.isFinite(e)?Math.max(-1,Math.min(1,e)):null,a=Z(t==null?void 0:t.terrain3dCloudExtrusion),r=J(n==null?null:`val >= ${n}`);return`//VERSION=3
// NDWI — green (dry) → white (neutral) → blue (water)
function setup() {
  return {
    input: ${JSON.stringify(j(["B03","B08","dataMask"]))},
    output: { bands: 4 }
  };
}

const ramp = [
   ${z(Mr)}
];

const visualizer = new ColorRampVisualizer(ramp);

${q}

function evaluatePixel(samples) {
  ${a}
  let val = index(samples.B03, samples.B08);
  let imgVals = visualizer.process(val);
  ${r}
}`}function fo(e=null,t){const n=e!=null&&Number.isFinite(e)?Math.max(-1,Math.min(1,e)):null,a=Z(t==null?void 0:t.terrain3dCloudExtrusion),r=J(n==null?null:`val >= ${n}`);return`//VERSION=3
// AWEI — 10 classes · non-water warm → open / deep water blue
function setup() {
  return {
    input: ${JSON.stringify(j(["B03","B08","B11","B12","dataMask"]))},
    output: { bands: 4 }
  };
}

const classRamp = [
   ${z(T.map((i,s)=>[s,i]))}
];
const viz = new ColorRampVisualizer(classRamp);

${q}

const BREAKS = [${Se(eo)}];

function aweiClass(val) {
  if (val < BREAKS[0]) return 0;
  if (val < BREAKS[1]) return 1;
  if (val < BREAKS[2]) return 2;
  if (val < BREAKS[3]) return 3;
  if (val < BREAKS[4]) return 4;
  if (val < BREAKS[5]) return 5;
  if (val < BREAKS[6]) return 6;
  if (val < BREAKS[7]) return 7;
  if (val < BREAKS[8]) return 8;
  return 9;
}

function evaluatePixel(samples) {
  ${a}
  let val = 4.0 * (samples.B03 - samples.B11) - (0.25 * samples.B08 + 2.75 * samples.B12);
  let cls = aweiClass(val);
  let imgVals = viz.process(cls);
  ${r}
}`}function Io(e=null,t){const n=e!=null&&Number.isFinite(e)?Math.max(-1,Math.min(1,e)):null,a=Z(t==null?void 0:t.terrain3dCloudExtrusion),r=J(n==null?null:`val >= ${n}`);return`//VERSION=3
// MNDWI — 10 classes · light dry gradient → open / deep water blue
function setup() {
  return {
    input: ${JSON.stringify(j(["B03","B11","dataMask"]))},
    output: { bands: 4 }
  };
}

const classRamp = [
   ${z(P.map((i,s)=>[s,i]))}
];
const viz = new ColorRampVisualizer(classRamp);

${q}

const BREAKS = [${Se(no)}];

function mndwiClass(val) {
  if (val < BREAKS[0]) return 0;
  if (val < BREAKS[1]) return 1;
  if (val < BREAKS[2]) return 2;
  if (val < BREAKS[3]) return 3;
  if (val < BREAKS[4]) return 4;
  if (val < BREAKS[5]) return 5;
  if (val < BREAKS[6]) return 6;
  if (val < BREAKS[7]) return 7;
  if (val < BREAKS[8]) return 8;
  return 9;
}

function evaluatePixel(samples) {
  ${a}
  let val = index(samples.B03, samples.B11);
  let cls = mndwiClass(val);
  let imgVals = viz.process(cls);
  ${r}
}`}function go(e=null,t){const n=e!=null&&Number.isFinite(e)?Math.max(-1,Math.min(1,e)):null,a=Z(t==null?void 0:t.terrain3dCloudExtrusion),r=J(n==null?null:`val >= ${n}`);return`//VERSION=3
// NDII — continuous moisture ramp (B08 / B11)
function setup() {
  return {
    input: ${JSON.stringify(j(["B08","B11","dataMask"]))},
    output: { bands: 4 }
  };
}

const moistureRamps = [
   ${z(Dr)}
];

const viz = new ColorRampVisualizer(moistureRamps);

${q}

function evaluatePixel(samples) {
  ${a}
  let val = index(samples.B08, samples.B11);
  let imgVals = viz.process(val);
  ${r}
}`}function So(e=null,t){const n=e!=null&&Number.isFinite(e)?Math.max(-1,Math.min(1,e)):null,a=Z(t==null?void 0:t.terrain3dCloudExtrusion),r=J(n==null?null:`val >= ${n}`);return`//VERSION=3
// NDMI — continuous moisture ramp (B8A / B11)
function setup() {
  return {
    input: ${JSON.stringify(j(["B8A","B11","dataMask"]))},
    output: { bands: 4 }
  };
}

const moistureRamps = [
   ${z(gn)}
];

const viz = new ColorRampVisualizer(moistureRamps);

${q}

function evaluatePixel(samples) {
  ${a}
  let val = index(samples.B8A, samples.B11);
  let imgVals = viz.process(val);
  ${r}
}`}function po(e=null,t){var d;const n=Pe(t==null?void 0:t.sceneDate),a=lr(n);let r=Ml,i=rr;const s=t==null?void 0:t.classBreaks;if(s&&s.length>=9){const g=s.length===11?s.slice(1,-1):s.length===9?s:s.slice(1,10);if(g.length===9){r=g;const m=s.length===11?s:[0,...g,Math.max(10,g[g.length-1]+1)];i=((d=t==null?void 0:t.classCenters)==null?void 0:d.length)===10?t.classCenters:Pl(m)}}const l=e!=null&&Number.isFinite(e)?Math.max(0,Math.min(15,e)):null,o=Z(t==null?void 0:t.terrain3dCloudExtrusion),c=J(l==null?null:`et >= ${l}`),u=i.map((g,m)=>[g,Lt[Math.min(m,Lt.length-1)][1]]);return`//VERSION=3
// ET — seasonal × Kc × moisture demand (mm/day), 10 classes
function setup() {
  return {
    input: ${JSON.stringify(j(["B03","B04","B08","B11","dataMask"]))},
    output: { bands: 4 }
  };
}

const etRamp = [
   ${z(u)}
];

const viz = new ColorRampVisualizer(etRamp);

${q}

const BREAKS = [${Se(r)}];
const CLASS_VAL = [${Se(i)}];

function etClass(val) {
  if (val < BREAKS[0]) return 0;
  if (val < BREAKS[1]) return 1;
  if (val < BREAKS[2]) return 2;
  if (val < BREAKS[3]) return 3;
  if (val < BREAKS[4]) return 4;
  if (val < BREAKS[5]) return 5;
  if (val < BREAKS[6]) return 6;
  if (val < BREAKS[7]) return 7;
  if (val < BREAKS[8]) return 8;
  return 9;
}

function evaluatePixel(samples) {
  ${o}
  ${a}
  let cls = etClass(et);
  let imgVals = viz.process(CLASS_VAL[cls]);
  ${c}
}`}function ho(e=null,t){var d;const n=Pe(t==null?void 0:t.sceneDate),a=cr(n);let r=Vl,i=or;const s=t==null?void 0:t.classBreaks;if(s&&s.length>=9){const g=s.length===11?s.slice(1,-1):s.length===9?s:s.slice(1,10);if(g.length===9){r=g;const m=s.length===11?s:[5,...g,Math.max(55,g[g.length-1]+1)];i=((d=t==null?void 0:t.classCenters)==null?void 0:d.length)===10?t.classCenters:Wl(m)}}const l=e!=null&&Number.isFinite(e)?Math.max(5,Math.min(55,e)):null,o=Z(t==null?void 0:t.terrain3dCloudExtrusion),c=J(l==null?null:`lst >= ${l}`),u=i.map((g,m)=>[g,_t[Math.min(m,_t.length-1)][1]]);return`//VERSION=3
// LST — seasonal NDVI/NDMI land-surface temperature proxy (°C), 10 classes
function setup() {
  return {
    input: ${JSON.stringify(j(["B04","B08","B11","dataMask"]))},
    output: { bands: 4 }
  };
}

const lstRamp = [
   ${z(u)}
];

const viz = new ColorRampVisualizer(lstRamp);

${q}

const BREAKS = [${Se(r)}];
const CLASS_VAL = [${Se(i)}];

function lstClass(val) {
  if (val < BREAKS[0]) return 0;
  if (val < BREAKS[1]) return 1;
  if (val < BREAKS[2]) return 2;
  if (val < BREAKS[3]) return 3;
  if (val < BREAKS[4]) return 4;
  if (val < BREAKS[5]) return 5;
  if (val < BREAKS[6]) return 6;
  if (val < BREAKS[7]) return 7;
  if (val < BREAKS[8]) return 8;
  return 9;
}

function evaluatePixel(samples) {
  ${o}
  ${a}
  let cls = lstClass(lst);
  let imgVals = viz.process(CLASS_VAL[cls]);
  ${c}
}`}function vo(e=null,t){const n=e!=null&&Number.isFinite(e)?Math.max(-1,Math.min(1,e)):null,a=Z(t==null?void 0:t.terrain3dCloudExtrusion),r=J(n==null?null:`ndvi >= ${n}`);return`//VERSION=3
// NDVI — agricultural color ramp on cloud-free pixels; clouds show true color
function setup() {
  return {
    input: ${JSON.stringify(j(["B04","B08","dataMask"]))},
    output: { bands: 4 }
  };
}

const ramp = [
   ${z(Jl)}
];

const visualizer = new ColorRampVisualizer(ramp);

${q}

function evaluatePixel(samples) {
  ${a}
  let ndvi = index(samples.B08, samples.B04);
  let imgVals = visualizer.process(ndvi);
  ${r}
}`}function Co(e,t=null,n){if(e==="ndvi")return vo(t,n);if(e==="ndwi")return mo(t,n);if(e==="awei")return fo(t,n);if(e==="mndwi")return Io(t,n);if(e==="ndmi")return So(t,n);if(e==="ndii")return go(t,n);if(e==="et")return po(t,n);if(e==="lst")return ho(t,n);const a=Lr[e],r=Z(n==null?void 0:n.terrain3dCloudExtrusion),i=t!=null&&Number.isFinite(t)?Math.max(-1,Math.min(1,t)):null,s=J(i==null?null:`${a.indexVar} >= ${i}`),l=e==="ndsi"?Nr():q;return`//VERSION=3
function setup() {
  return {
    input: ${JSON.stringify(j(a.inputs))},
    output: { bands: 4 }
  };
}

const ramp = [
   ${z(a.ramp)}
];

const visualizer = new ColorRampVisualizer(ramp);

${l}

function evaluatePixel(samples) {
  ${r}
  ${a.indexExpr}
  let imgVals = visualizer.process(${a.indexVar});
  ${s}
}`}function No(e){return e in Lr}function We(e){return parseInt(e.replace("#",""),16)}function p(...e){return e.map(([t,n,a])=>({t,hex:We(n),label:a}))}function Ve(e,t,n){const a=Math.max(0,Math.min(1,n)),r=e>>16&255,i=e>>8&255,s=e&255,l=t>>16&255,o=t>>8&255,c=t&255,u=Math.round(r+(l-r)*a),d=Math.round(i+(o-i)*a),g=Math.round(s+(c-s)*a);return(u<<16|d<<8|g)>>>0}function bo(e){return[`Strong ${e} decline`,`Major ${e} decline`,`Moderate ${e} decline`,`Slight ${e} decline`,"Stable · low","Stable · neutral",`Slight ${e} gain`,`Moderate ${e} gain`,`Major ${e} gain`,`Strong ${e} gain`]}function C(e,t,n,a,r){const i=We(t),s=We(n),l=We(a),o=Ve(i,s,.78),c=Ve(l,s,.78),u=Ve(i,o,.45),d=Ve(l,c,.45);return{valueMin:-.4,valueMax:.4,anchors:[{t:0,hex:i,label:"Strong decline"},{t:.22,hex:u,label:"Moderate decline"},{t:.44,hex:o,label:"Slight decline"},{t:.5,hex:s,label:"Stable"},{t:.56,hex:c,label:"Slight gain"},{t:.78,hex:d,label:"Moderate gain"},{t:1,hex:l,label:"Strong gain"}],classLabels:bo(e),subtitle:r}}const _r={CVHI:{valueMin:-1,valueMax:1,anchors:p([0,"#b71c1c","Extreme stress"],[.11,"#c62828","Severe"],[.22,"#e53935","Very poor"],[.33,"#ef5350","Poor"],[.44,"#ff7043","Low health"],[.55,"#ffb300","Moderate stress"],[.66,"#9ccc65","Moderate health"],[.77,"#66bb6a","Good"],[.88,"#2e7d32","Very good"],[1,"#1b5e20","Excellent"]),classLabels:["Extreme Vegetation Stress","Severe Degradation","Very Poor Condition","Poor Vegetation","Low Vegetation Health","Moderate Stress","Moderate Vegetation Health","Good Vegetation Condition","Very Good Vegetation Health","Excellent Vegetation Health"],subtitle:"4-index composite mean · 🔴 critical stress → 🟢 excellent canopy health"},VHS:{valueMin:0,valueMax:1,anchors:p([0,"#7f0000","Critical"],[.33,"#d4a017","Weak"],[.66,"#7cb342","Good"],[1,"#1b5e20","Excellent"]),classLabels:["Critical health","Very poor","Poor","Below average","Fair","Moderate","Good","Very good","Excellent","Peak vigor"],subtitle:"Vegetation Health · crimson = poor · forest green = excellent"},VDI:{valueMin:0,valueMax:1,anchors:p([0,"#2e7d32","Moist canopy"],[.33,"#aed581","Hydrated"],[.66,"#bcaaa4","Drying"],[1,"#4e342e","Very dry"]),classLabels:["Fully hydrated","Well hydrated","Moist","Slightly dry","Moderate dryness","Dry canopy","Very dry","Severe dryness","Critical dryness","Desiccated"],subtitle:"Vegetation dryness · green = moist · brown = dry canopy"},CVI:{valueMin:0,valueMax:1,anchors:p([0,"#4a148c","Low vigor"],[.33,"#7e57c2","Sparse vigor"],[.66,"#43a047","Moderate vigor"],[1,"#1b4332","Peak crop vigor"]),classLabels:["No vigor","Very low","Low","Fair","Moderate","Good","Strong","Very strong","Excellent","Peak Crop Vigor"],subtitle:"Crop Vigor Index · purple = weak · deep green = vigorous canopy"},CSI:{valueMin:0,valueMax:1,anchors:p([0,"#1b5e20","Low stress"],[.33,"#fdd835","Watch"],[.66,"#ef6c00","Stressed"],[1,"#b71c1c","Critical stress"]),classLabels:["Minimal stress","Low stress","Mild stress","Moderate stress","Elevated","High stress","Very high","Severe","Critical","Collapse risk"],subtitle:"Crop stress · green = healthy · red = severe stress"},WST:{valueMin:-1,valueMax:1,anchors:p([0,"#0d47a1","Well watered"],[.33,"#4fc3f7","Adequate"],[.66,"#ffb74d","Water limited"],[1,"#e65100","Severe water stress"]),classLabels:["No water stress","Very low stress","Low stress","Mild stress","Moderate","Elevated stress","High stress","Very high","Severe","Extreme water stress"],subtitle:"Water stress · blue = adequate moisture · orange = stressed"},DRI:{valueMin:0,valueMax:1,anchors:p([0,"#0277bd","Low drought risk"],[.33,"#81d4fa","Mild risk"],[.66,"#ffcc80","Moderate drought"],[1,"#bf360c","Extreme drought"]),classLabels:["Minimal drought","Low risk","Mild risk","Moderate risk","Elevated","High drought","Very high","Severe","Extreme","Catastrophic drought"],subtitle:"Drought risk · sky blue = wet · rust = extreme drought"},VMI:{valueMin:-.5,valueMax:.5,anchors:p([0,"#004d40","Very dry canopy"],[.33,"#00897b","Dry"],[.66,"#4db6ac","Moist"],[1,"#b2dfdb","Saturated canopy"]),classLabels:["Extremely dry","Very dry","Dry","Slightly dry","Neutral","Slightly moist","Moist","Wet canopy","Very wet","Saturated"],subtitle:"Canopy moisture · deep teal = dry · pale aqua = wet foliage"},SMI:{valueMin:-.5,valueMax:.5,anchors:p([0,"#5d4037","Dry soil"],[.33,"#a1887f","Low moisture"],[.66,"#26c6da","Moist soil"],[1,"#006064","Saturated soil"]),classLabels:["Bone dry soil","Very dry","Dry","Slightly dry","Neutral","Slightly moist","Moist soil","Wet soil","Very wet","Waterlogged soil"],subtitle:"Soil moisture · clay brown = dry · cyan = wet soil profile"},OIR:{valueMin:-1,valueMax:1,anchors:p([0,"#33691e","Balanced"],[.33,"#fff176","Watch"],[.66,"#29b6f6","Over-wet"],[1,"#0d47a1","Flood / excess irrigation"]),classLabels:["Optimal balance","Normal","Slight excess watch","Moderate excess","Elevated water","High excess","Over-irrigation","Severe excess","Very severe","Critical over-irrigation"],subtitle:"Over-irrigation · green = balanced · navy = excess water"},WDSI:{valueMin:-.5,valueMax:.65,anchors:p([0,"#4e342e","Severe drought"],[.25,"#bf360c","High drought"],[.5,"#ffb300","Moderate drought"],[.75,"#81c784","Near normal"],[1,"#0277bd","Wet / no drought"]),classLabels:["Extreme drought situation","Severe drought","High drought","Elevated drought","Moderate drought","Mild drought / watch","Near normal","Adequate moisture","Wet conditions","No drought / surplus water"],subtitle:"WDSI · 0.40·NDMI + 0.35·NDWI + 0.15·NDVI + 0.10·SAVI · brown = drought · blue = wet"},IEI:{valueMin:-1,valueMax:2,anchors:p([0,"#c62828","Inefficient"],[.33,"#ffa726","Sub-optimal"],[.66,"#66bb6a","Efficient"],[1,"#1565c0","Highly efficient"]),classLabels:["Critical inefficiency","Poor efficiency","Below target","Fair","Moderate","Good efficiency","Very good","Excellent","Optimal","Peak efficiency"],subtitle:"Irrigation efficiency · red = waste · blue = optimal delivery"},UII:{valueMin:-1,valueMax:1,anchors:p([0,"#1b5e20","Well irrigated"],[.33,"#689f38","Adequate"],[.66,"#fdd835","Under-irrigated"],[1,"#f57f17","Severe deficit"]),classLabels:["No deficit","Minimal deficit","Low deficit","Mild deficit","Moderate","Elevated deficit","High deficit","Very high","Severe under-irrigation","Critical deficit"],subtitle:"Under-irrigation · dark green = sufficient · amber = deficit"},FPR:{valueMin:0,valueMax:2,anchors:p([0,"#2e7d32","High performance"],[.33,"#ffeb3b","Average"],[.66,"#ff7043","Below target"],[1,"#d84315","Poor performance"]),classLabels:["Peak performance","Excellent","Good","Fair","Moderate","Below average","Poor","Very poor","Critical","Field failure"],subtitle:"Field performance · green = high yield potential · red = poor"},CPI:{valueMin:0,valueMax:1,anchors:p([0,"#fff8e1","Low production"],[.33,"#c5e1a5","Moderate"],[.66,"#558b2f","Good"],[1,"#1b5e20","High production"]),classLabels:["Minimal production","Very low","Low","Below average","Moderate","Fair production","Good","Very good","High","Peak production"],subtitle:"Crop production · straw = weak · deep green = high output"},ISS:{valueMin:-.5,valueMax:.65,anchors:p([0,"#b71c1c","Severe irrigation stress"],[.28,"#ef6c00","High stress"],[.52,"#fdd835","Moderate / watch"],[.76,"#26a69a","Adequate moisture"],[1,"#006064","Well supplied"]),classLabels:["Critical irrigation stress","Severe stress","High stress","Elevated stress","Moderate stress","Watch / borderline","Adequately supplied","Good moisture","Well irrigated","Optimal water status"],subtitle:"ISS · 0.40·NDMI + 0.30·NDWI + 0.20·NDVI + 0.10·SAVI · red = stress · teal = well watered"},WAPI:{valueMin:0,valueMax:1,anchors:p([0,"#5c6bc0","Class 1 · Normal"],[.22,"#26a69a","Class 3 · Low Stress"],[.44,"#fdd835","Class 5 · Moderate"],[.66,"#ef6c00","Class 7 · High Stress"],[.88,"#e91e63","Class 9 · Critical"],[1,"#ad1457","Class 10 · Extreme Critical"]),classLabels:["Class 1 · Normal · 0.00–0.09","Class 2 · Healthy · 0.10–0.19","Class 3 · Low Stress · 0.20–0.29","Class 4 · Low Moderate · 0.30–0.39","Class 5 · Moderate · 0.40–0.49","Class 6 · Moderate High · 0.50–0.59","Class 7 · High Stress · 0.60–0.69","Class 8 · Very High Stress · 0.70–0.79","Class 9 · Critical · 0.80–0.89","Class 10 · Extreme Critical · 0.90–1.00"],subtitle:"WAPI 10-class · 0.40·WDSI + 0.20·ΔWDSI + 0.20·(1−NDMI) + 0.10·ETstress + 0.10 · blue = Normal · magenta = Extreme Critical"},GPI:{valueMin:0,valueMax:1,anchors:p([0,"#e65100","Stagnant"],[.33,"#ffb300","Slow growth"],[.66,"#7cb342","Active growth"],[1,"#33691e","Peak growth"]),classLabels:["No growth","Very slow","Slow","Below average","Moderate growth","Fair growth","Good growth","Strong growth","Very strong","Peak growth rate"],subtitle:"Growth performance · orange = lag · lime green = active growth"},CSI2:{valueMin:0,valueMax:1,anchors:p([0,"#37474f","Unstable canopy"],[.33,"#78909c","Variable"],[.66,"#aed581","Stable"],[1,"#33691e","Highly stable"]),classLabels:["Highly unstable","Unstable","Variable","Moderately variable","Fair stability","Stable","Good stability","Very stable","Excellent stability","Locked stable canopy"],subtitle:"Canopy stability · slate gray = unstable · green = stable cover"},CRI:{valueMin:0,valueMax:1.5,anchors:p([0,"#311b92","Low resilience"],[.33,"#5c6bc0","Fragile"],[.66,"#81c784","Resilient"],[1,"#2e7d32","Highly resilient"]),classLabels:["Critical fragility","Very low resilience","Low","Below average","Moderate","Fair resilience","Good","Strong","Very resilient","Maximum resilience"],subtitle:"Crop resilience · indigo = fragile · green = stress-tolerant"},VDG:{valueMin:0,valueMax:1,anchors:p([0,"#1b5e20","Stable / no decline"],[.33,"#ffca28","Early decline"],[.66,"#ff5722","Active decline"],[1,"#3e2723","Severe decline gradient"]),classLabels:["No decline","Minimal decline","Slight decline","Moderate decline","Elevated decline","High decline","Very high","Severe","Critical decline","Collapse gradient"],subtitle:"Vegetation decline · green = stable · charcoal = steep loss"},ARI:{valueMin:0,valueMax:1,anchors:p([0,"#00c853","Low agro risk"],[.33,"#ffeb3b","Watch"],[.66,"#ff5722","High risk"],[1,"#d50000","Critical agro risk"]),classLabels:["Minimal risk","Low risk","Mild risk","Moderate","Elevated","High risk","Very high","Severe","Critical","Extreme agro risk"],subtitle:"Agro risk · bright green = safe · red = critical composite risk"},CHS:{valueMin:0,valueMax:1,anchors:p([0,"#880e4f","Poor crop health"],[.33,"#f06292","Fair"],[.66,"#81c784","Good"],[1,"#004d40","Excellent crop health"]),classLabels:["Critical health","Very poor","Poor","Below average","Moderate","Fair","Good","Very good","Excellent","Peak Crop Health"],subtitle:"Crop Health Score · magenta = poor · teal = excellent"},CPS:{valueMin:0,valueMax:2,anchors:p([0,"#e8f5e9","Low pressure"],[.33,"#fff59d","Moderate pressure"],[.66,"#ff7043","High pressure"],[1,"#4a148c","Extreme crop pressure"]),classLabels:["Minimal pressure","Low","Mild","Moderate","Elevated","High pressure","Very high","Severe","Critical pressure","Extreme pressure"],subtitle:"Crop pressure · mint = low stress load · violet = extreme pressure"},PRI:{valueMin:0,valueMax:1,anchors:p([0,"#efebe9","Not ready"],[.35,"#ffb74d","Approaching"],[.45,"#66bb6a","Planting ready"],[1,"#1b5e20","Peak readiness"]),classLabels:["Not ready","Very early","Early","Approaching","Near ready","Planting ready","Good window","Strong window","Excellent","Peak planting readiness"],subtitle:"Planting Readiness Index · beige = wait · green = plant"},CGI:{valueMin:0,valueMax:1,anchors:p([0,"#4a148c","No growth"],[.33,"#7e57c2","Establishing"],[.66,"#43a047","Active growth"],[1,"#1b5e20","Peak growth"]),classLabels:["No growth","Very slow","Slow","Establishing","Moderate","Good growth","Strong growth","Very strong","Excellent","Peak Crop Growth"],subtitle:"Crop Growth Index · purple = stagnant · green = vigorous growth"},CMI:{valueMin:0,valueMax:1,anchors:p([0,"#e3f2fd","Immature"],[.33,"#81d4fa","Developing"],[.66,"#ffb300","Maturing"],[1,"#e65100","Mature"]),classLabels:["Immature","Very early","Early","Developing","Mid season","Late vegetative","Early maturity","Maturing","Near mature","Fully mature"],subtitle:"Crop Maturity Index · blue = young · orange = mature"},HRI:{valueMin:0,valueMax:1,anchors:p([0,"#1b5e20","Not harvest-ready"],[.5,"#fff59d","Approaching harvest"],[.7,"#fb8c00","Harvest ready"],[1,"#bf360c","Peak harvest readiness"]),classLabels:["Not ready","Very early","Early","Approaching","Near ready","Almost ready","Harvest ready","Good window","Strong window","Peak harvest readiness"],subtitle:"Harvest Readiness Index · green = wait · orange = harvest"},VRI:{valueMin:0,valueMax:1,anchors:p([0,"#b71c1c","Season low"],[.33,"#ffcc80","Recovering"],[.66,"#81c784","Strong recovery"],[1,"#1b5e20","Season peak"]),classLabels:["Season minimum","Very low recovery","Low","Fair","Moderate","Recovering","Good recovery","Strong","Near peak","Season peak NDVI"],subtitle:"Vegetation Recovery Index · red = low · green = recovered vs season range"},CCI:{valueMin:0,valueMax:1,anchors:p([0,"#37474f","Low confidence"],[.33,"#90a4ae","Uncertain"],[.66,"#42a5f5","Reliable"],[1,"#0d47a1","High confidence"]),classLabels:["Very low confidence","Low","Limited","Uncertain","Moderate","Fair","Reliable","High","Very high","Peak calendar confidence"],subtitle:"Crop Calendar Confidence · gray = sparse/noisy · blue = stable dense observations"},EPD:{valueMin:0,valueMax:1,anchors:p([0,"#efebe9","Before planting window"],[.45,"#66bb6a","Planting signal"],[1,"#1b5e20","Post planting-ready"]),classLabels:["Before window","Very early","Early","Approaching","Near signal","Planting signal","Confirmed","Strong","Very strong","Peak planting signal"],subtitle:"Estimated Planting Date readiness (PRI surface on map)"},EHD:{valueMin:0,valueMax:1,anchors:p([0,"#1b5e20","Before harvest window"],[.7,"#fb8c00","Harvest signal"],[1,"#bf360c","Post harvest-ready"]),classLabels:["Before window","Very early","Early","Approaching","Near signal","Near ready","Harvest signal","Confirmed","Strong","Peak harvest signal"],subtitle:"Estimated Harvest Date readiness (HRI surface on map)"},SAL_NDSI:{valueMin:-.6,valueMax:.4,anchors:p([0,"#1b5e20","Non-saline"],[.33,"#fdd835","Slight salinity"],[.66,"#ef6c00","High salinity"],[1,"#7f0000","Extreme salinity"]),classLabels:["Non-saline","Very low salinity","Low salinity","Slight salinity","Moderate salinity","Moderately high","High salinity","Very high salinity","Severe salinity","Extreme salinity"],subtitle:"Salinity NDSI (B11−B8)/(B11+B8) · Low → High · 🟢 non-saline → 🔴 extreme salinity"},SI:{valueMin:0,valueMax:.4,anchors:p([0,"#00695c","Non-saline"],[.33,"#cddc39","Slight salinity"],[.66,"#f4511e","High salinity"],[1,"#880e4f","Extreme salinity"]),classLabels:["Non-saline","Very low salinity","Low salinity","Slight salinity","Moderate salinity","Moderately high","High salinity","Very high salinity","Severe salinity","Extreme salinity"],subtitle:"SI √(B3·B4) · Low → High · 🟢 dark soil → 🔴 bright saline crust"},SSI:{valueMin:-.4,valueMax:.8,anchors:p([0,"#0d47a1","Non-saline"],[.33,"#4dd0e1","Slight salinity"],[.66,"#ffa726","High salinity"],[1,"#3e2723","Extreme salinity"]),classLabels:["Non-saline","Very low salinity","Low salinity","Slight salinity","Moderate salinity","Moderately high","High salinity","Very high salinity","Severe salinity","Extreme salinity"],subtitle:"SSI (Salinity NDSI + SI) · Low → High · combined normalized + brightness salinity"},IOI:{valueMin:.5,valueMax:2.5,anchors:p([0,"#0d1b2a","Background"],[.22,"#415a77","Weak iron oxide"],[.44,"#9a031e","Moderate iron oxide"],[.66,"#e36414","Strong iron oxide"],[1,"#ffba08","Extreme iron oxide"]),classLabels:["Background / negligible Fe-oxide","Very weak iron oxide","Weak iron oxide","Low–moderate iron oxide","Moderate iron oxide","Elevated iron oxide","Strong iron oxide","Very strong iron oxide","Intense Fe-oxide alteration","Extreme Fe-oxide signature"],subtitle:"Iron Oxide Index (B04/B02) · 10-class · navy → crimson → gold Fe-oxide enrichment"},CLAY_MI:{valueMin:.7,valueMax:1.5,anchors:p([0,"#134e4a","Background clay"],[.25,"#5eead4","Weak clay"],[.5,"#fef3c7","Moderate clay"],[.75,"#c026d3","Strong clay"],[1,"#4a044e","Extreme clay"]),classLabels:["Background / negligible clay","Very weak clay minerals","Weak clay minerals","Low–moderate clay","Moderate clay alteration","Elevated clay minerals","Strong clay alteration","Very strong clay","Intense clay alteration","Extreme clay mineral signature"],subtitle:"Clay Mineral Index (B11/B12) · 10-class · teal → cream → magenta clay alteration"},FMI:{valueMin:.4,valueMax:2,anchors:p([0,"#14532d","Background ferrous"],[.25,"#84cc16","Weak ferrous"],[.5,"#facc15","Moderate ferrous"],[.75,"#b45309","Strong ferrous"],[1,"#7c2d12","Extreme ferrous"]),classLabels:["Background / negligible ferrous","Very weak ferrous minerals","Weak ferrous minerals","Low–moderate ferrous","Moderate ferrous minerals","Elevated ferrous minerals","Strong ferrous minerals","Very strong ferrous","Intense ferrous signature","Extreme ferrous mineral enrichment"],subtitle:"Ferrous Mineral Index (B11/B08) · 10-class · green → yellow → rust ferrous enrichment"},NDAI:{valueMin:-.3,valueMax:.5,anchors:p([0,"#1e3a8a","Low alteration"],[.25,"#93c5fd","Weak alteration"],[.5,"#f8fafc","Neutral"],[.75,"#f87171","Strong alteration"],[1,"#7f1d1d","Extreme alteration"]),classLabels:["Very low alteration","Low alteration","Weak alteration","Slight alteration","Neutral / background","Moderate alteration","Elevated alteration","Strong alteration","Very strong alteration","Extreme hydrothermal alteration"],subtitle:"NDAI (B11−B12)/(B11+B12) · 10-class · blue → white → red alteration contrast"},BSI:{valueMin:-.5,valueMax:.5,anchors:p([0,"#166534","Vegetated / low bare"],[.25,"#a3e635","Sparse cover"],[.5,"#fde047","Mixed bare soil"],[.75,"#d97706","Exposed soil"],[1,"#78350f","Extreme bare soil"]),classLabels:["Dense vegetation / minimal bare soil","Mostly vegetated","Low bare soil","Sparse cover","Mixed soil–vegetation","Moderate bare soil","Elevated bare soil","Strongly exposed soil","Very high bare soil","Extreme bare soil / rock exposure"],subtitle:"Bare Soil Index · 10-class · green canopy → yellow mix → brown bare earth"},REAI:{valueMin:.7,valueMax:1.4,anchors:p([0,"#312e81","Background red-edge"],[.25,"#6366f1","Weak red-edge"],[.5,"#22d3ee","Moderate red-edge"],[.75,"#fbbf24","Strong red-edge"],[1,"#b45309","Extreme red-edge"]),classLabels:["Background red-edge response","Very weak red-edge alteration","Weak red-edge alteration","Low–moderate red-edge","Moderate red-edge alteration","Elevated red-edge response","Strong red-edge alteration","Very strong red-edge","Intense red-edge alteration","Extreme red-edge alteration"],subtitle:"Red Edge Alteration Index (B06/B05) · 10-class · indigo → cyan → amber alteration"},GEI:{valueMin:.4,valueMax:2,anchors:p([0,"#0f172a","Low prospectivity"],[.22,"#0e7490","Weak composite"],[.44,"#ca8a04","Moderate prospectivity"],[.66,"#ea580c","High prospectivity"],[1,"#9f1239","Extreme prospectivity"]),classLabels:["Negligible gold-prospectivity composite","Very low prospectivity","Low prospectivity","Low–moderate prospectivity","Moderate prospectivity","Elevated prospectivity","High prospectivity","Very high prospectivity","Intense composite signature","Extreme gold-exploration composite"],subtitle:"GEI 0.35·IOI + 0.30·CMI + 0.20·FMI + 0.15·BSI · 10-class · navy → gold → crimson prospectivity"},GCI:{valueMin:.3,valueMax:1.8,anchors:p([0,"#FFFFFF","No Potential"],[.11,"#FFF9C4","Very Low Potential"],[.22,"#FFEB3B","Low Potential"],[.33,"#FFC107","Weak Potential"],[.44,"#FF9800","Moderate Potential"],[.55,"#F57C00","Moderate-High Potential"],[.66,"#E65100","High Potential"],[.77,"#D84315","Very High Potential"],[.88,"#B71C1C","Excellent Potential"],[1,"#FFD700","Priority Gold Target"]),classLabels:["No Potential","Very Low Potential","Low Potential","Weak Potential","Moderate Potential","Moderate-High Potential","High Potential","Very High Potential","Excellent Potential","Priority Gold Target"],classColors:[16777215,16775620,16771899,16761095,16750592,16088064,15094016,14172949,12000284,16766720],classAlpha:[0,.15,.25,.35,.5,.6,.75,.85,.95,1],subtitle:"GPI · 0.35×Normalize(IOI) + 0.30×Normalize(CAI) + 0.20×Normalize(QI) + 0.15×Normalize(BSI) · Class 1 transparent → Class 10 Priority Gold Target"},EGCI:{valueMin:0,valueMax:1,anchors:p([0,"#000000","No Potential"],[.11,"#F2F2F2","Very Low"],[.22,"#D9D9D9","Low"],[.33,"#A6A6A6","Weak"],[.44,"#737373","Moderate"],[.55,"#4D4D4D","Moderate-High"],[.66,"#B8860B","High"],[.77,"#DAA520","Very High"],[.88,"#F4C430","Excellent"],[1,"#FFF8DC","Priority Target"]),classLabels:["No Potential","Very Low","Low","Weak","Moderate","Moderate-High","High","Very High","Excellent","Priority Target"],classColors:[0,15921906,14277081,10921638,7566195,5066061,12092939,14329120,16041008,16775388],classAlpha:[0,1,1,1,1,1,1,1,1,1],subtitle:"Gold Prospectivity · 0.30×Iron Oxide + 0.25×Clay + 0.20×Silica + 0.15×Lineament Density + 0.10×Distance to Fault · vegetation excluded (NDVI≥0.30) · Class 1 transparent → Class 10 Priority Target"},DCVHI:C("CVHI","#b71c1c","#fff176","#1b5e20","ΔCVHI · composite health decline → recovery"),DVHS:C("VHS","#8b0000","#fffde7","#1b4332","ΔVHS · unique crimson→cream→forest change ramp"),DVDI:C("VDI","#4e342e","#eceff1","#2e7d32","ΔVDI · brown dry decline · gray stable · green rehydration"),DCVI:C("CVI","#4a148c","#e1bee7","#1b4332","ΔCVI · purple loss · lilac stable · green gain"),DCSI:C("CSI","#b71c1c","#fff9c4","#1b5e20","ΔCSI · stress easing vs intensification"),DWST:C("WST","#e65100","#cfd8dc","#0d47a1","ΔWST · orange stress rise · blue relief"),DDRI:C("DRI","#bf360c","#ffe0b2","#0277bd","ΔDRI · drought worsening · wetting recovery"),DVMI:C("VMI","#004d40","#b2dfdb","#80cbc4","ΔVMI · canopy moisture loss · teal recovery"),DSMI:C("SMI","#5d4037","#d7ccc8","#006064","ΔSMI · soil drying · cyan rewetting"),DOIR:C("OIR","#0d47a1","#fff59d","#33691e","ΔOIR · excess water rise · green normalization"),DWDSI:C("WDSI","#4e342e","#fff3e0","#0277bd","ΔWDSI · drought worsening · wetting recovery"),DIEI:C("IEI","#c62828","#e3f2fd","#1565c0","ΔIEI · efficiency drop · blue improvement"),DUII:C("UII","#f57f17","#f0f4c3","#1b5e20","ΔUII · deficit increase · irrigation recovery"),DFPR:C("FPR","#d84315","#fff9c4","#2e7d32","ΔFPR · performance drop · yield recovery"),DCPI:C("CPI","#fff8e1","#c5e1a5","#1b5e20","ΔCPI · production decline · output gain"),DISS:C("ISS","#b71c1c","#fff8e1","#006064","ΔISS · irrigation stress rise · moisture recovery"),DWAPI:C("WAPI","#1565c0","#fffde7","#c62828","ΔWAPI · priority easing · priority surge"),DGPI:C("GPI","#e65100","#fff3e0","#33691e","ΔGPI · growth slowdown · acceleration"),DCSI2:C("CSI2","#37474f","#cfd8dc","#33691e","ΔCSI2 · canopy destabilization · restabilization"),DCRI:C("CRI","#311b92","#c5cae9","#2e7d32","ΔCRI · resilience loss · recovery"),DVDG:C("VDG","#3e2723","#ffecb3","#1b5e20","ΔVDG · decline acceleration · vegetation recovery"),DARI:C("ARI","#d50000","#fffde7","#00c853","ΔARI · rising composite risk · risk reduction"),DCHS:C("CHS","#880e4f","#f8bbd0","#004d40","ΔCHS · crop health drop · recovery"),DCPS:C("CPS","#4a148c","#e1bee7","#e8f5e9","ΔCPS · pressure increase · relief"),DPRI:C("PRI","#e65100","#fff3e0","#1b5e20","ΔPRI · planting readiness drop · rise"),DCGI:C("CGI","#4a148c","#e1bee7","#2e7d32","ΔCGI · growth slowdown · acceleration"),DCMI:C("CMI","#1a237e","#c5cae9","#f9a825","ΔCMI · maturity retreat · advance"),DHRI:C("HRI","#1b5e20","#fff9c4","#e65100","ΔHRI · harvest readiness drop · rise"),DVRI:C("VRI","#b71c1c","#eceff1","#1b5e20","ΔVRI · recovery loss · canopy recovery"),DCCI:C("CCI","#37474f","#cfd8dc","#1565c0","ΔCCI · calendar confidence drop · rise"),DEPD:C("EPD","#e65100","#fff3e0","#2e7d32","ΔEPD · planting readiness change"),DEHD:C("EHD","#1b5e20","#fffde7","#ef6c00","ΔEHD · harvest readiness change"),DSAL_NDSI:C("SAL_NDSI","#1b5e20","#fff9c4","#7f0000","ΔSalinity NDSI · salinity easing · salinity build-up"),DSAL:C("SI","#00695c","#e0f2f1","#6a1b9a","ΔSI · brightness/salinity decline · increase"),DDSI:C("DSI","#006837","#fff9c4","#7f0000","ΔDSI · drought easing · severity intensification"),DSSI:C("SSI","#0d47a1","#eceff1","#3e2723","ΔSSI · combined salinity decline · increase"),MVI:{valueMin:0,valueMax:8,anchors:p([0,"#5d4037","Non-mangrove / background"],[.25,"#a1887f","Low MVI"],[.5,"#26a69a","Moderate mangrove signal"],[.75,"#00897b","Likely mangrove"],[1,"#004d40","Strong mangrove / dense canopy"]),classLabels:["Background / non-mangrove","Very low MVI","Low mangrove likelihood","Weak mangrove signal","Transitional canopy","Moderate mangrove","Elevated mangrove signal","Likely mangrove stand","Dense mangrove","Very dense mangrove canopy"],subtitle:"MVI (B08−B03)/(B11−B03) · brown background → teal mangrove detection"},REMI:{valueMin:-.5,valueMax:.5,anchors:p([0,"#4e342e","Low REMI / background"],[.35,"#ffb74d","Weak red-edge contrast"],[.65,"#26c6da","Mangrove discrimination"],[1,"#006064","Strong REMI mangrove"]),classLabels:["Background red-edge moisture","Very low REMI","Low red-edge contrast","Weak mangrove discrimination","Transitional REMI","Moderate mangrove signal","Elevated REMI","Strong mangrove discrimination","Very strong REMI","Peak red-edge mangrove contrast"],subtitle:"REMI red-edge×green–SWIR · brown → cyan mangrove discrimination"},MI:{valueMin:-.4,valueMax:1.2,anchors:p([0,"#3e2723","Low MI / other cover"],[.35,"#8d6e63","Sparse extraction"],[.65,"#66bb6a","Mangrove extraction"],[1,"#1b5e20","Strong MI mangrove"]),classLabels:["Non-mangrove / low MI","Very low MI","Low mangrove extraction","Weak canopy contrast","Transitional MI","Moderate mangrove","Elevated MI","Likely mangrove stand","Strong mangrove extraction","Peak MI mangrove canopy"],subtitle:"MI (B08−B04)/(B11+B04) · brown other cover → green mangrove extraction"},MFI:{valueMin:-.6,valueMax:.6,anchors:p([0,"#a50026","Low forest response"],[.22,"#f46d43","Weak red-edge forest"],[.45,"#fee08b","Transitional MFI"],[.7,"#7cb342","Mangrove forest"],[1,"#1b5e20","Strong MFI mangrove forest"]),classLabels:["Background forest response","Very low MFI","Low red-edge forest","Weak mangrove forest","Transitional MFI","Moderate mangrove forest","Elevated MFI","Likely mangrove forest","Dense mangrove forest","Peak MFI mangrove forest"],classColors:Er,subtitle:"MFI red-edge mean vs B8A · NDVI colormap · red sparse → green mangrove forest"},"NDRE-B5":{valueMin:-.2,valueMax:.7,anchors:p([0,"#a50026","Very low NDRE-B5"],[.22,"#f46d43","Low chlorophyll"],[.45,"#fee08b","Transitional canopy"],[.7,"#66bd63","Healthy mangrove"],[1,"#006837","Dense mangrove / high NDRE-B5"]),classLabels:["Very low red-edge (B5)","Low chlorophyll / sparse","Stressed / sparse canopy","Low–moderate canopy","Transitional canopy","Moderate mangrove vigor","Healthy mangrove","Strong canopy / channels","Dense mangrove fringe","Peak NDRE-B5 vigor"],classColors:[10813478,14102567,16018755,16625249,16703627,14282635,10934634,6733155,1742928,26679],subtitle:"NDRE-B5 (B8A−B05)/(B8A+B05) · red sparse → yellow transition → deep green mangrove"},"NDRE-B6":{valueMin:-.2,valueMax:.7,anchors:p([0,"#b2182b","Very low NDRE-B6"],[.22,"#ef6548","Low chlorophyll"],[.45,"#ffffbf","Transitional canopy"],[.7,"#4daf4a","Healthy mangrove"],[1,"#00441b","Dense mangrove / high NDRE-B6"]),classLabels:["Very low red-edge (B6)","Low chlorophyll / sparse","Stressed / sparse canopy","Low–moderate canopy","Transitional canopy","Moderate mangrove vigor","Healthy mangrove","Strong canopy / channels","Dense mangrove fringe","Peak NDRE-B6 vigor"],classColors:[11671595,14102559,15689032,16551257,16703627,14282915,11394446,7915129,3253076,17435],subtitle:"NDRE-B6 (B8A−B06)/(B8A+B06) · red sparse → yellow transition → deep green mangrove"},"NDRE-B7":{valueMin:-.2,valueMax:.7,anchors:p([0,"#990000","Very low NDRE-B7"],[.22,"#e34a33","Low chlorophyll"],[.45,"#f7fcb9","Transitional canopy"],[.7,"#41ab5d","Healthy mangrove"],[1,"#005a32","Dense mangrove / high NDRE-B7"]),classLabels:["Very low red-edge (B7)","Low chlorophyll / sparse","Stressed / sparse canopy","Low–moderate canopy","Transitional canopy","Moderate mangrove vigor","Healthy mangrove","Strong canopy / channels","Dense mangrove fringe","Peak NDRE-B7 vigor"],classColors:[10027008,14102559,14895667,16551257,16628612,16252089,12773017,7915129,3253076,23090],subtitle:"NDRE-B7 (B8A−B07)/(B8A+B07) · red sparse → yellow transition → deep green mangrove"},"CI-RE":{valueMin:0,valueMax:4,anchors:p([0,"#a50026","Very low CI-RE"],[.25,"#fdae61","Low chlorophyll"],[.5,"#ffffbf","Moderate chlorophyll"],[.75,"#66bd63","High chlorophyll"],[1,"#1a9850","Peak CI-RE"]),classLabels:["Very low chlorophyll (CI-RE)","Low red-edge chlorophyll","Stressed canopy","Low–moderate chlorophyll","Moderate chlorophyll","Elevated chlorophyll","Healthy canopy chlorophyll","Strong CI-RE response","Dense chlorophyll fringe","Peak CI-RE chlorophyll"],classColors:[10813478,14102567,16018755,16625249,16703627,16777151,14282635,10934634,6733155,1742928],subtitle:"CI-RE (B8A/B05)−1 · red low chlorophyll → green high chlorophyll"},"GCI-CHL":{valueMin:0,valueMax:6,anchors:p([0,"#b2182b","Very low GCI"],[.25,"#ef8a62","Low green chlorophyll"],[.5,"#f7f7f7","Moderate"],[.75,"#67a9cf","Elevated green vigor"],[1,"#2166ac","Peak GCI-CHL"]),classLabels:["Very low green chlorophyll","Low green response","Weak vigor","Low–moderate GCI","Moderate green chlorophyll","Elevated green vigor","Healthy green canopy","Strong GCI-CHL","Dense green chlorophyll","Peak GCI-CHL vigor"],classColors:[11671595,14049357,16033154,16636871,16250871,13755888,9618910,4428739,2188972,340065],subtitle:"GCI-CHL (B08/B03)−1 · green chlorophyll / vegetation vigor"},MTCI:{valueMin:0,valueMax:4.5,anchors:p([0,"#7f0000","Very low MTCI"],[.25,"#e34a33","Low chlorophyll"],[.5,"#fdcc8a","Transitional"],[.75,"#31a354","High chlorophyll"],[1,"#00441b","Peak MTCI"]),classLabels:["Very low MTCI","Low chlorophyll variation","Weak MTCI","Low–moderate MTCI","Moderate chlorophyll","Elevated MTCI","High chlorophyll sensitivity","Strong MTCI response","Dense chlorophyll canopy","Peak MTCI"],classColors:[8323072,11730944,14102559,15689032,16551257,16628612,11394446,7915129,3253076,17435],subtitle:"MTCI (B06−B05)/(B05−B04) · red low → deep green high chlorophyll"},REIP:{valueMin:700,valueMax:740,anchors:p([0,"#762a83","Blue-shifted REIP"],[.3,"#af8dc3","Low REIP"],[.5,"#f7f7f7","Mid REIP"],[.7,"#7fbf7b","Elevated REIP"],[1,"#1b7837","Red-shifted REIP"]),classLabels:["Strong blue shift (low Chl)","Blue-shifted REIP","Low REIP","Below-mid REIP","Mid red-edge position","Above-mid REIP","Elevated REIP","Red-shifted REIP","Strong red shift","Peak REIP (high Chl)"],classColors:[7744131,10055851,12756431,15193320,16250871,14282963,10935200,5942881,1800247,17435],subtitle:"REIP Guyot & Baret · 705+35×(((B04+B07)/2−B05)/(B06−B05)) nm · purple blue-shift → green red-shift"}},Eo=[{t:0,hex:8323072,label:"Class 1 · Extreme stress"},{t:.11,hex:11674146,label:"Class 2 · Severe stress"},{t:.22,hex:14102567,label:"Class 3 · High stress"},{t:.33,hex:16018755,label:"Class 4 · Moderate stress"},{t:.44,hex:16625249,label:"Class 5 · Early stress"},{t:.55,hex:16703627,label:"Class 6 · Watch"},{t:.66,hex:14282635,label:"Class 7 · Fair"},{t:.77,hex:10934634,label:"Class 8 · Good"},{t:.88,hex:6732650,label:"Class 9 · Healthy"},{t:1,hex:1742928,label:"Class 10 · Optimal"}],yo=["Class 1 · Extreme stress","Class 2 · Severe stress","Class 3 · High stress","Class 4 · Moderate stress","Class 5 · Early stress","Class 6 · Watch","Class 7 · Fair","Class 8 · Good","Class 9 · Healthy","Class 10 · Optimal"],Mo=[{t:0,hex:14102567,label:"Critical"},{t:.2,hex:14895667,label:"Critical"},{t:.25,hex:16018755,label:"Critical edge"},{t:.33,hex:16625249,label:"Stress"},{t:.4,hex:16627811,label:"Watch"},{t:.5,hex:16703627,label:"Watch"},{t:.6,hex:14282635,label:"Fair"},{t:.75,hex:6732650,label:"Healthy"},{t:1,hex:1742928,label:"Healthy"}],Ao=[{t:0,hex:14102567,label:"Critical decline"},{t:.25,hex:16018755,label:"Major decline"},{t:.375,hex:16625249,label:"Stress decline"},{t:.4375,hex:16703627,label:"Watch"},{t:.5,hex:16775620,label:"Stable"},{t:.625,hex:12968357,label:"Slight gain"},{t:.75,hex:6732650,label:"Gain"},{t:1,hex:1742928,label:"Strong gain"}],Do=["Critical decline · Δ ≤ −0.15","Major decline","Moderate decline","Stress · Δ ≤ −0.05","Stable low","Stable · watch","Slight gain","Moderate gain","Major gain","Strong gain · green"],Bt={CHAS:{kind:"scientific",valueMin:-.2,valueMax:.85,anchors:Eo,labels:yo,subtitle:"CHAS 10-class raster · NDVI+NDWI+NDMI+SAVI fusion · pixel mosaic"},CHAS_ALERT:{kind:"alert_derived",valueMin:-.2,valueMax:.85,anchors:Mo,labels:["Critical","Critical","Active","Active","Warning","Warning","Safe","Safe","Safe","Safe"],subtitle:"CHAS Alert · derived 4-level (Critical / Active / Warning / Safe)"},DCHAS:{kind:"alert_delta",valueMin:-.4,valueMax:.4,anchors:Ao,labels:Do,subtitle:"ΔCHAS change detection · sudden crop decline"},[Le]:{kind:"scientific",valueMin:-3,valueMax:4,anchors:On.map((e,t)=>({t:t/9,hex:e,label:Fn[t]})),labels:Fn,subtitle:"ADI 10-class anomaly · (Current − μ_hist) / σ_hist",breaks:cs,classValues:us,classColors:On},[_e]:{kind:"scientific",valueMin:-.5,valueMax:.65,anchors:Hn.map((e,t)=>({t:t/9,hex:e,label:kn[t]})),labels:kn,subtitle:"NCADI 10-class · 0.7·ΔNDVI + 0.3·ΔNDMI",breaks:Ss,classValues:ps,classColors:Hn},[_s]:{kind:"scientific",valueMin:xs,valueMax:ws,anchors:Xn.map((e,t)=>({t:t/9,hex:e,label:Yn[t]})),labels:Yn,subtitle:"WAPI 10-class · Class 1 Normal (0.00) → Class 10 Extreme Critical (1.00) · blue = low priority · magenta = irrigate first",breaks:Ts,classValues:Ps,classColors:Xn},[Es]:{kind:"scientific",valueMin:Oa,valueMax:ka,anchors:Gn.map((e,t)=>({t:t/9,hex:e,label:Un[t]})),labels:Un,subtitle:"DSI 10-class · Drought Area = DSI ≥ 0.30 · green = no drought · dark red = extreme drought",breaks:Ha,classValues:Ls,classColors:Gn}};function Rt(e){return[(e>>16&255)/255,(e>>8&255)/255,(e&255)/255]}function Lo(e,t,n){const a=Math.max(0,Math.min(1,n)),[r,i,s]=Rt(e),[l,o,c]=Rt(t),u=Math.round((r+(l-r)*a)*255),d=Math.round((i+(o-i)*a)*255),g=Math.round((s+(c-s)*a)*255);return(u<<16|d<<8|g)>>>0}function _o(e,t){if(!e.length)return 8947848;if(t<=e[0].t)return e[0].hex;if(t>=e[e.length-1].t)return e[e.length-1].hex;for(let n=0;n<e.length-1;n++){const a=e[n],r=e[n+1];if(t>=a.t&&t<=r.t){const i=r.t-a.t;return Lo(a.hex,r.hex,i>0?(t-a.t)/i:0)}}return e[e.length-1].hex}function Br(e){const t=String(e||"").trim().toUpperCase();if(!t)return null;const n=t==="NDSI"?"SAL_NDSI":t==="DNDSI"?"DSAL_NDSI":t,a=Bt[t]??Bt[n];if(a)return a;const r=_r[n];return r?{kind:`unique:${n}`,valueMin:r.valueMin,valueMax:r.valueMax,anchors:r.anchors,labels:r.classLabels,subtitle:r.subtitle,...r.classColors&&r.classColors.length===10?{classColors:r.classColors}:{}}:null}function Bo(e,t="UNKNOWN"){const{valueMin:n,valueMax:a}=e,r=[],i=[],s=[],l=[],o=e.breaks&&e.breaks.length===9?[...e.breaks]:null,c=e.classValues&&e.classValues.length===10?[...e.classValues]:null,u=e.classColors&&e.classColors.length===10?[...e.classColors]:null,d=o??[],g=a-n||1;for(let f=0;f<10;f++){const S=o?f===0?n:o[f-1]:n+g*f/10,I=o?f===9?a:o[f]:n+g*(f+1)/10,N=c?c[f]:(S+I)/2,h=f/9,L=u?u[f]:_o(e.anchors,h);r.push(N),i.push(L),l.push(Rt(L)),s.push(e.labels[f]??`Class ${f+1}`),!o&&f<9&&d.push(Number(I.toFixed(2)))}const m=r.map((f,S)=>[f,i[S]]);return{layerId:t,kind:e.kind,subtitle:e.subtitle,valueMin:n,valueMax:a,breaks:d,classValues:r,classColors:i,classLabels:s,classRgb01:l,gradientStops:m}}function se(e){const t=Br(e);return t?Bo(t,String(e||"").trim().toUpperCase()):null}function z0(e){return`#${(e>>>0).toString(16).padStart(6,"0")}`}function Ro(){return[...new Set([...Object.keys(_r),...Object.keys(Bt)])].sort()}Object.fromEntries(Ro().filter(e=>!x(e)||e==="DCHAS").map(e=>{const t=Br(e);return[e,{kind:t.kind,valueMin:t.valueMin,valueMax:t.valueMax}]}));const j0=["CRITICAL","ACTIVE","WARNING","SAFE"],q0={CRITICAL:"#d32f2f",ACTIVE:"#ff9800",WARNING:"#ffeb3b",SAFE:"#1a9850"},xo=[[.827451,.184314,.184314],[1,.596078,0],[1,.921569,.231373],[.101961,.596078,.313725]];function wo(e){const t=Math.max(1,Math.min(10,Math.round(e)));return t<=2?"CRITICAL":t<=4?"ACTIVE":t<=6?"WARNING":"SAFE"}function To(e){return wo(e+1)}function Rr(e){if(!Number.isFinite(e))return 4;const t=se("CHAS");if(!(t!=null&&t.breaks.length))return e<.1?0:e<.25?2:e<.4?4:e<.55?6:8;const n=t.breaks;if(e<n[0])return 0;for(let a=1;a<n.length;a++)if(e<n[a])return a;return 9}function xr(e){return To(Rr(e))}function Po(){return as.map(([e,t,n])=>`[${e.toFixed(6)}, ${t.toFixed(6)}, ${n.toFixed(6)}]`).join(`,
   `)}function Vo(e=null){const t=e!=null&&Number.isFinite(e)?Math.max(-1,Math.min(1,e)):null,n=t==null?"return c.concat(1);":`var a = (isFinite(ndvi) && ndvi >= ${t} ? 1.0 : 0.0);
  return c.concat(a);`;return`//VERSION=3
// AgroCloud Stress Zones — CHAS fusion + stress score classification
function setup() {
  return {
    input: ["B03", "B04", "B05", "B08", "B8A", "B11", "dataMask"],
    output: { bands: 4 }
  };
}

const ZONE_RGB = [
   ${Po()}
];

function classifyStress(ndvi, stress) {
  if (!isFinite(ndvi) || ndvi < 0.15) return 0;
  if (!isFinite(stress) || stress >= 0.6) return 4;
  if (stress >= 0.4) return 3;
  if (stress >= 0.2) return 2;
  return 1;
}

function evaluatePixel(samples) {
  let ndvi = index(samples.B08, samples.B04);
  let savi = ((samples.B08 - samples.B04) * 1.5) / (samples.B08 + samples.B04 + 0.5);
  let ndmi = index(samples.B08, samples.B11);
  let ndwi = index(samples.B03, samples.B08);
  let chas = ${zt};
  let stress = 1.0 - chas;
  let cls = classifyStress(ndvi, stress);
  let c = ZONE_RGB[cls];
  ${n}
}`}function Z0(e=!1){return`//VERSION=3
// AGRO_CLASS_HISTOGRAM {"mode":"stress-zones","classes":5}
function setup() {
  return {
    input: [{ bands: ["B03", "B04", "B05", "B08", "B11", "SCL", "dataMask"] }],
    output: [
      { id: "idx", bands: ["idx"], sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(samples) {
  var scl = samples.SCL;
  var cloud = ${e?"false":"(scl == 3 || scl == 8 || scl == 9 || scl == 10 || scl == 11)"};
  let ndvi = index(samples.B08, samples.B04);
  let savi = ((samples.B08 - samples.B04) * 1.5) / (samples.B08 + samples.B04 + 0.5);
  let ndmi = index(samples.B08, samples.B11);
  let ndwi = index(samples.B03, samples.B08);
  let chas = ${zt};
  let stress = 1.0 - chas;
  var cls = 1;
  if (!isFinite(ndvi) || ndvi < 0.15) cls = 0;
  else if (!isFinite(stress) || stress >= 0.6) cls = 4;
  else if (stress >= 0.4) cls = 3;
  else if (stress >= 0.2) cls = 2;
  var valid = samples.dataMask && !cloud;
  return { idx: [cls], dataMask: [valid ? 1 : 0] };
}`}function Fo(e){return e.map(t=>String(t)).join(", ")}function wr(e){return e.map(([t,n,a])=>`[${t.toFixed(6)}, ${n.toFixed(6)}, ${a.toFixed(6)}]`).join(`,
   `)}const Tr=`let ndvi = index(samples.B08, samples.B04);
  let savi = ((samples.B08 - samples.B04) * 1.5) / (samples.B08 + samples.B04 + 0.5);
  let ndmi = index(samples.B08, samples.B11);
  let ndwi = index(samples.B03, samples.B08);
  let ndre = index(samples.B08, samples.B05);
  let eviDen = samples.B08 + 6.0 * samples.B04 - 7.5 * samples.B02 + 1.0;
  let evi = eviDen > 1e-6 ? 2.5 * (samples.B08 - samples.B04) / eviDen : NaN;
  let ci_re = samples.B08 > 1e-6 ? samples.B05 / samples.B08 - 1 : NaN;
  let ndsi = index(samples.B11, samples.B08);
  let si = Math.sqrt(Math.max(0, samples.B03 * samples.B04));
  let ssi = ndsi + si;
  let ioi = samples.B02 > 1e-6 ? samples.B04 / samples.B02 : NaN;
  let clay_mi = samples.B12 > 1e-6 ? samples.B11 / samples.B12 : NaN;
  let fmi = samples.B08 > 1e-6 ? samples.B11 / samples.B08 : NaN;
  let ndai = index(samples.B11, samples.B12);
  let bsiDen = samples.B11 + samples.B04 + samples.B08 + samples.B02;
  let bsi = bsiDen > 1e-6 ? ((samples.B11 + samples.B04) - (samples.B08 + samples.B02)) / bsiDen : NaN;
  let reai = samples.B05 > 1e-6 ? samples.B06 / samples.B05 : NaN;
  let gei = 0.35 * ioi + 0.30 * clay_mi + 0.20 * fmi + 0.15 * bsi;
  let gci = 0.30 * ioi + 0.25 * clay_mi + 0.20 * fmi + 0.15 * ndai + 0.10 * bsi;
  let ioin = Math.max(0, Math.min(1, (ioi - 0.5) / 2.0));
  let cmin = Math.max(0, Math.min(1, (clay_mi - 0.7) / 0.8));
  let fmin = Math.max(0, Math.min(1, (fmi - 0.4) / 1.6));
  let ndain = Math.max(0, Math.min(1, (ndai + 0.3) / 0.8));
  let bsin = Math.max(0, Math.min(1, (bsi + 0.5) / 1.0));
  let egci = 0.30 * ioin + 0.25 * cmin + 0.20 * fmin + 0.15 * ndain + 0.10 * bsin;
  ${ar}`,st=`function coreAt(samples) {
  let ndvi = index(samples.B08, samples.B04);
  let savi = ((samples.B08 - samples.B04) * 1.5) / (samples.B08 + samples.B04 + 0.5);
  let ndmi = index(samples.B08, samples.B11);
  let ndwi = index(samples.B03, samples.B08);
  let ndre = index(samples.B08, samples.B05);
  let eviDen = samples.B08 + 6.0 * samples.B04 - 7.5 * samples.B02 + 1.0;
  let evi = eviDen > 1e-6 ? 2.5 * (samples.B08 - samples.B04) / eviDen : NaN;
  let ci_re = samples.B08 > 1e-6 ? samples.B05 / samples.B08 - 1 : NaN;
  let ndsi = index(samples.B11, samples.B08);
  let si = Math.sqrt(Math.max(0, samples.B03 * samples.B04));
  let ssi = ndsi + si;
  let ioi = samples.B02 > 1e-6 ? samples.B04 / samples.B02 : NaN;
  let clay_mi = samples.B12 > 1e-6 ? samples.B11 / samples.B12 : NaN;
  let fmi = samples.B08 > 1e-6 ? samples.B11 / samples.B08 : NaN;
  let ndai = index(samples.B11, samples.B12);
  let bsiDen = samples.B11 + samples.B04 + samples.B08 + samples.B02;
  let bsi = bsiDen > 1e-6 ? ((samples.B11 + samples.B04) - (samples.B08 + samples.B02)) / bsiDen : NaN;
  let reai = samples.B05 > 1e-6 ? samples.B06 / samples.B05 : NaN;
  let gei = 0.35 * ioi + 0.30 * clay_mi + 0.20 * fmi + 0.15 * bsi;
  let gci = 0.30 * ioi + 0.25 * clay_mi + 0.20 * fmi + 0.15 * ndai + 0.10 * bsi;
  let ioin = Math.max(0, Math.min(1, (ioi - 0.5) / 2.0));
  let cmin = Math.max(0, Math.min(1, (clay_mi - 0.7) / 0.8));
  let fmin = Math.max(0, Math.min(1, (fmi - 0.4) / 1.6));
  let ndain = Math.max(0, Math.min(1, (ndai + 0.3) / 0.8));
  let bsin = Math.max(0, Math.min(1, (bsi + 0.5) / 1.0));
  let egci = 0.30 * ioin + 0.25 * cmin + 0.20 * fmin + 0.15 * ndain + 0.10 * bsin;
  ${ar}
  return {
    ndvi: ndvi, savi: savi, ndmi: ndmi, ndwi: ndwi, ndre: ndre, evi: evi, ci_re: ci_re,
    ndsi: ndsi, si: si, ssi: ssi,
    ioi: ioi, clay_mi: clay_mi, fmi: fmi, ndai: ndai, bsi: bsi, reai: reai, gei: gei, gci: gci, egci: egci,
    mvi: mvi, remi: remi, mi: mi, mfi: mfi,
    ndre_b5: ndre_b5, ndre_b6: ndre_b6, ndre_b7: ndre_b7,
    cire: cire, gci_chl: gci_chl, mtci: mtci, reip: reip
  };
}`;function Ce(e,t,n="samples.dataMask"){const a=t!=null&&Number.isFinite(t)?Math.max(-1,Math.min(1,t)):null;return a==null?`return c.concat(${n});`:`var a = ${n} * (${e} >= ${a} ? 1.0 : 0.0);
  return c.concat(a);`}function Ne(e){const t=`function classifyVal(val) {
  if (!isFinite(val)) return -1;
  if (val < BREAKS[0]) return 0;
  if (val < BREAKS[1]) return 1;
  if (val < BREAKS[2]) return 2;
  if (val < BREAKS[3]) return 3;
  if (val < BREAKS[4]) return 4;
  if (val < BREAKS[5]) return 5;
  if (val < BREAKS[6]) return 6;
  if (val < BREAKS[7]) return 7;
  if (val < BREAKS[8]) return 8;
  return 9;
}`,n=`const BREAKS = [${Fo(e.breaks)}];
const CLASS_RGB = [
   ${wr(e.classRgb01)}
];`;return{classifyFn:t,rgbConst:n}}function Oo(e=null){const t=se("CHAS");if(!t)return null;const n=dn("CHAS");if(!n)return null;const{classifyFn:a,rgbConst:r}=Ne(t),i=wr(xo),s=`function mapClassToAlert(cls) {
  if (cls <= 1) return 0;
  if (cls <= 3) return 1;
  if (cls <= 5) return 2;
  return 3;
}`,l=`const ALERT_RGB = [
   ${i}
];`;return`//VERSION=3
// CHAS Alert — derived 4-level overlay from CHAS 10-class raster logic
function setup() {
  return {
    input: ["B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B11", "B12", "dataMask"],
    output: { bands: 4 }
  };
}

${r}

${l}

${a}

${s}

function evaluatePixel(samples) {
  ${Tr}
  let val = ${n};
  let cls = classifyVal(val);
  let alertIdx = mapClassToAlert(cls);
  let c = ALERT_RGB[alertIdx];
  ${Ce("val",e)}
}`}function ko(e,t=null){const n=dn(e);if(!n)return null;const a=se(e);if(!a)return null;const r="val",{classifyFn:i,rgbConst:s}=Ne(a);return`//VERSION=3
// AgroCloud composite — 10-class layer-specific ramp
function setup() {
  return {
    input: ["B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B11", "B12", "dataMask"],
    output: { bands: 4 }
  };
}

${s}

${i}

function evaluatePixel(samples) {
  ${Tr}
  let ${r} = ${n};
  if (!isFinite(${r})) {
    return [0, 0, 0, 0];
  }
  let cls = classifyVal(${r});
  if (cls < 0) {
    return [0, 0, 0, 0];
  }
  let c = CLASS_RGB[cls];
  ${Ce(r,t)}
}`}function Ho(e,t=null){const n=String(e||"").trim().toUpperCase();if(!x(n))return null;const a=cn(n);if(!a)return null;const r=a.expr,i=se(e);if(!i)return null;const s="delta",{classifyFn:l,rgbConst:o}=Ne(i);return`//VERSION=3
// AgroCloud composite delta — ORBIT samples[] (scene₂ − scene₁)
function setup() {
  return {
    input: [{
      bands: ["B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B11", "B12", "dataMask"]
    }],
    mosaicking: Mosaicking.ORBIT,
    output: { bands: 4, sampleType: "AUTO" }
  };
}

${st}

${o}

${l}

function preProcessScenes(collections) {
  var orbits = collections.scenes.orbits;
  if (!orbits || orbits.length <= 2) return collections;
  collections.scenes.orbits = [orbits[0], orbits[orbits.length - 1]];
  return collections;
}

function compositeValue(c) {
  let ndvi = c.ndvi;
  let ndmi = c.ndmi;
  let ndwi = c.ndwi;
  let savi = c.savi;
  let ndre = c.ndre;
  let evi = c.evi;
  let ci_re = c.ci_re;
  let ndsi = c.ndsi;
  let si = c.si;
  let ssi = c.ssi;
  let ioi = c.ioi;
  let clay_mi = c.clay_mi;
  let fmi = c.fmi;
  let ndai = c.ndai;
  let bsi = c.bsi;
  let reai = c.reai;
  let gei = c.gei;
  let gci = c.gci;
  let egci = c.egci;
  let mvi = c.mvi;
  let remi = c.remi;
  let mi = c.mi;
  let mfi = c.mfi;
  let ndre_b5 = c.ndre_b5;
  let ndre_b6 = c.ndre_b6;
  let ndre_b7 = c.ndre_b7;
  let cire = c.cire;
  let gci_chl = c.gci_chl;
  let mtci = c.mtci;
  let reip = c.reip;
  return ${r};
}

function evaluatePixel(samples) {
  if (!samples || samples.length < 2) {
    var s = samples && samples.length ? samples[samples.length - 1] : null;
    var mask = s ? s.dataMask : 0;
    var c = CLASS_RGB[4];
    return c.concat(mask);
  }
  var c1 = coreAt(samples[0]);
  var c2 = coreAt(samples[samples.length - 1]);
  var ${s} = compositeValue(c2) - compositeValue(c1);
  var mask = samples[samples.length - 1].dataMask * samples[0].dataMask;
  if (!isFinite(${s})) {
    return [0, 0, 0, 0];
  }
  var cls = classifyVal(${s});
  if (cls < 0) {
    return [0, 0, 0, 0];
  }
  var c = CLASS_RGB[cls];
  ${Ce(s,t,"mask")}
}`}function $o(e=null){const t=se("ADI");if(!t)return null;const{classifyFn:n,rgbConst:a}=Ne(t),r="adi";return`//VERSION=3
// AgroCloud ADI — Anomaly Detection Index (Current − μ_hist) / σ_hist
function setup() {
  return {
    input: [{
      bands: ["B02", "B03", "B04", "B05", "B06", "B08", "B11", "B12", "dataMask"],
      units: "REFLECTANCE"
    }],
    mosaicking: Mosaicking.ORBIT,
    output: { bands: 4, sampleType: "AUTO" }
  };
}

${st}

${a}

${n}

function currentIndex(c) {
  let ndvi = c.ndvi;
  let ndmi = c.ndmi;
  let ndre = c.ndre;
  return ${_a};
}

function evaluatePixel(samples) {
  if (!samples || !samples.length) {
    return [0, 0, 0, 0];
  }
  var curSample = samples[samples.length - 1];
  if (!curSample || !curSample.dataMask) {
    return [0, 0, 0, 0];
  }
  var current = currentIndex(coreAt(curSample));
  var n = 0;
  var sum = 0;
  var sumSq = 0;
  for (var i = 0; i < samples.length - 1; i++) {
    var s = samples[i];
    if (!s || !s.dataMask) continue;
    var v = currentIndex(coreAt(s));
    if (!isFinite(v)) continue;
    sum += v;
    sumSq += v * v;
    n++;
  }
  var ${r} = 0;
  if (n >= 2) {
    var mean = sum / n;
    var variance = Math.max(0, sumSq / n - mean * mean);
    var std = Math.sqrt(variance);
    if (std < 1e-6) std = 1e-6;
    ${r} = (current - mean) / std;
  } else if (n === 1) {
    var mean1 = sum;
    ${r} = (current - mean1) / 1e-6;
  } else {
    ${r} = 0;
  }
  if (!isFinite(${r})) ${r} = 0;
  var cls = classifyVal(${r});
  var c = CLASS_RGB[cls];
  ${Ce(r,e,"curSample.dataMask")}
}`}function Wo(e=null){const t=se("NCADI");if(!t)return null;const{classifyFn:n,rgbConst:a}=Ne(t),r="ncadi";return`//VERSION=3
// AgroCloud NCADI — Newly Cultivated / Abandoned Detection Index (0.7·ΔNDVI + 0.3·ΔNDMI)
function setup() {
  return {
    input: [{
      bands: ["B02", "B03", "B04", "B05", "B06", "B08", "B11", "B12", "dataMask"],
      units: "REFLECTANCE"
    }],
    mosaicking: Mosaicking.ORBIT,
    output: { bands: 4, sampleType: "AUTO" }
  };
}

${st}

${a}

${n}

function preProcessScenes(collections) {
  var orbits = collections.scenes.orbits;
  if (!orbits || orbits.length <= 2) return collections;
  collections.scenes.orbits = [orbits[0], orbits[orbits.length - 1]];
  return collections;
}

function evaluatePixel(samples) {
  if (!samples || samples.length < 2) {
    var s = samples && samples.length ? samples[samples.length - 1] : null;
    var mask = s ? s.dataMask : 0;
    var cStable = CLASS_RGB[4];
    return cStable.concat(mask);
  }
  var c1 = coreAt(samples[0]);
  var c2 = coreAt(samples[samples.length - 1]);
  var dNdvi = c2.ndvi - c1.ndvi;
  var dNdmi = c2.ndmi - c1.ndmi;
  var ${r} = ${fs};
  if (!isFinite(${r})) ${r} = 0;
  var mask = samples[samples.length - 1].dataMask * samples[0].dataMask;
  var cls = classifyVal(${r});
  var c = CLASS_RGB[cls];
  ${Ce(r,e,"mask")}
}`}function Uo(e=null){const t=se("WAPI");if(!t)return null;const{classifyFn:n,rgbConst:a}=Ne(t),r="wapi";return`//VERSION=3
// AgroCloud WAPI — 0.40·WDSI + 0.20·ΔWDSI + 0.20·(1−NDMI) + 0.10·ETstress + 0.10
function setup() {
  return {
    input: [{
      bands: ["B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B11", "B12", "dataMask"]
    }],
    mosaicking: Mosaicking.ORBIT,
    output: { bands: 4, sampleType: "AUTO" }
  };
}

${st}

${a}

${n}

function preProcessScenes(collections) {
  var orbits = collections.scenes.orbits;
  if (!orbits || orbits.length <= 2) return collections;
  collections.scenes.orbits = [orbits[0], orbits[orbits.length - 1]];
  return collections;
}

function wdsiOf(c) {
  let ndvi = c.ndvi;
  let ndmi = c.ndmi;
  let ndwi = c.ndwi;
  let savi = c.savi;
  return ${$a};
}

function etStressOf(c) {
  let ndmi = c.ndmi;
  let ndwi = c.ndwi;
  return ${Wa};
}

function evaluatePixel(samples) {
  if (!samples || !samples.length) {
    return [0, 0, 0, 0];
  }
  var cur = samples[samples.length - 1];
  if (!cur || !cur.dataMask) {
    return [0, 0, 0, 0];
  }
  var c2 = coreAt(cur);
  var wdsi2 = wdsiOf(c2);
  var dWdsi = 0;
  var mask = cur.dataMask;
  if (samples.length >= 2) {
    var c1 = coreAt(samples[0]);
    dWdsi = wdsi2 - wdsiOf(c1);
    mask = cur.dataMask * samples[0].dataMask;
  }
  var ${r} = 0.40 * wdsi2 + 0.20 * dWdsi + 0.20 * (1 - c2.ndmi) + 0.10 * etStressOf(c2) + 0.10;
  if (!isFinite(${r})) ${r} = 0;
  var cls = classifyVal(${r});
  var c = CLASS_RGB[cls];
  ${Ce(r,e,"mask")}
}`}function Go(e,t=null){const n=String(e||"").trim().toUpperCase();return n==="CHAS_ALERT"?Oo(t):n==="STRESS_ZONES"?Vo(t):W(n)?$o(t):X(n)?Wo(t):Ua(n)?Uo(t):x(n)?Ho(n,t):ko(n,t)}function Ko(){return`//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["B02", "B03", "B04", "B08", "B11", "B12", "dataMask"],
      units: "REFLECTANCE"
    }],
    output: { bands: 4, sampleType: "AUTO" },
    mosaicking: "ORBIT",
    temporal: true
  };
}

function ndvi(s) {
  return (s.B08 - s.B04) / (s.B08 + s.B04 + 1e-6);
}

function ndwi(s) {
  return (s.B03 - s.B08) / (s.B03 + s.B08 + 1e-6);
}

function temporalStats(samples) {
  var n = 0;
  var ndviSum = 0;
  var ndviMin = 1;
  var ndviMax = -1;
  var ndwiSum = 0;
  var swirSum = 0;
  for (var i = 0; i < samples.length; i++) {
    var s = samples[i];
    if (!s.dataMask) continue;
    var v = ndvi(s);
    var w = ndwi(s);
    ndviSum += v;
    ndwiSum += w;
    swirSum += s.B11;
    if (v < ndviMin) ndviMin = v;
    if (v > ndviMax) ndviMax = v;
    n++;
  }
  if (!n) return null;
  return {
    ndvi: ndviSum / n,
    ndwi: ndwiSum / n,
    swir: swirSum / n,
    ndviMin: ndviMin,
    ndviMax: ndviMax,
    amp: ndviMax - ndviMin
  };
}

function evaluatePixel(samples) {
  if (!samples.length) return [0, 0, 0, 0];
  var cur = samples[samples.length - 1];
  if (!cur.dataMask) return [0, 0, 0, 0];

  var t = temporalStats(samples);
  var v = ndvi(cur);
  var w = ndwi(cur);

  // Water
  if (w > 0.18 || cur.B03 / (cur.B08 + 1e-6) > 1.15) {
    return [0.15, 0.39, 0.92, 1];
  }
  // Urban / barren
  if (v < 0.12 && cur.B11 > 0.14) {
    return [0.47, 0.45, 0.43, 1];
  }
  // Forest — high NDVI, low seasonal amplitude
  if (t && t.ndvi > 0.55 && t.amp < 0.12) {
    return [0.09, 0.40, 0.20, 1];
  }
  // Wetlands
  if (t && t.ndvi > 0.32 && t.ndwi > 0.04 && w > 0.02) {
    return [0.05, 0.58, 0.53, 1];
  }
  // Corn — strong green-up
  if (t && t.amp > 0.28 && v > 0.62) {
    return [0.98, 0.75, 0.14, 1];
  }
  // Soybeans — moderate green-up
  if (t && t.amp > 0.16 && t.amp <= 0.28 && v > 0.52) {
    return [0.52, 0.80, 0.09, 1];
  }
  // Wheat — early peak, senesced at current date
  if (t && t.ndviMax > 0.48 && v < t.ndviMax - 0.12) {
    return [0.92, 0.70, 0.03, 1];
  }
  // Cotton — mid NDVI + SWIR
  if (v > 0.42 && v < 0.58 && cur.B11 > 0.11) {
    return [0.96, 0.96, 0.95, 1];
  }
  // Alfalfa — sustained moderate NDVI
  if (t && v > 0.38 && v < 0.55 && t.amp < 0.10) {
    return [0.13, 0.77, 0.37, 1];
  }
  return [0.47, 0.45, 0.43, 1];
}`}function K(e){const t=nn.find(n=>n.key===e);return bs((t==null?void 0:t.color)??"#000000")}const Yo={water:K("water"),trees:K("trees"),flooded:K("flooded"),crops:K("crops"),built:K("built"),bare:K("bare"),snow:K("snow"),clouds:K("clouds"),rangeland:K("rangeland")};an.map(e=>e.key);const J0=Array.from({length:an.length+1},(e,t)=>t);function Sn(){return`
function ndvi(s) {
  return (s.B08 - s.B04) / (s.B08 + s.B04 + 1e-6);
}
function ndwi(s) {
  return (s.B03 - s.B08) / (s.B03 + s.B08 + 1e-6);
}
function ndsi(s) {
  return (s.B03 - s.B11) / (s.B03 + s.B11 + 1e-6);
}
function brightness(s) {
  return (s.B02 + s.B03 + s.B04) / 3;
}

function temporalStats(samples) {
  var n = 0;
  var ndviSum = 0;
  var ndviMin = 1;
  var ndviMax = -1;
  var ndwiSum = 0;
  for (var i = 0; i < samples.length; i++) {
    var s = samples[i];
    if (!s.dataMask) continue;
    var v = ndvi(s);
    var w = ndwi(s);
    ndviSum += v;
    ndwiSum += w;
    if (v < ndviMin) ndviMin = v;
    if (v > ndviMax) ndviMax = v;
    n++;
  }
  if (!n) return null;
  return {
    ndvi: ndviSum / n,
    ndwi: ndwiSum / n,
    ndviMin: ndviMin,
    ndviMax: ndviMax,
    amp: ndviMax - ndviMin
  };
}

/** Contiguous class index: water=0 … rangeland=8 (No Data → -1). */
function classifyLulc(samples) {
  var list = Array.isArray(samples) ? samples : samples ? [samples] : [];
  if (!list.length) return -1;
  var cur = list[list.length - 1];
  if (!cur || !cur.dataMask) return -1;

  var t = temporalStats(list);
  var v = ndvi(cur);
  var w = ndwi(cur);
  var snow = ndsi(cur);
  var bri = brightness(cur);

  if (bri > 0.32 && v < 0.18 && cur.B11 > 0.16) return 7; // clouds
  if (snow > 0.35 && bri > 0.22 && v < 0.2) return 6; // snow
  // Open water only — avoid swallowing moist soil / vegetation.
  if (w > 0.25 || (cur.B03 / (cur.B08 + 1e-6) > 1.35 && v < 0.08 && w > 0.05)) return 0; // water
  if (v < 0.15 && cur.B11 > 0.16 && bri > 0.08) return 4; // built
  if (v < 0.18 && cur.B11 > 0.12 && w < 0.05) return 5; // bare
  // Trees / crops before flooded — loose NDWI must not swallow vegetation.
  if (t && t.ndvi > 0.55 && t.amp < 0.18) return 1; // trees
  if (!t && v > 0.62) return 1;
  if (t && t.amp > 0.18 && t.ndviMax > 0.42 && v > 0.22) return 3; // crops
  if (v > 0.45 && v < 0.72) return 3;
  // Flooded vegetation: vegetation + clear moisture signal
  if ((t && t.ndvi > 0.35 && t.ndwi > 0.15) || (v > 0.35 && w > 0.18)) return 2; // flooded
  return 8; // rangeland
}
`.trim()}function Xo(){const e=Yo;return`//VERSION=3
// AgroCloud LULC — Sentinel-2 10m land-cover analysis (IO schema · 3m display NEAREST)
function setup() {
  return {
    input: [{
      bands: ["B02", "B03", "B04", "B08", "B11", "B12", "dataMask"],
      units: "REFLECTANCE"
    }],
    output: { bands: 4, sampleType: "AUTO" },
    mosaicking: Mosaicking.ORBIT
  };
}

${Sn()}

const LULC_RGB = [
  [${e.water.join(", ")}],
  [${e.trees.join(", ")}],
  [${e.flooded.join(", ")}],
  [${e.crops.join(", ")}],
  [${e.built.join(", ")}],
  [${e.bare.join(", ")}],
  [${e.snow.join(", ")}],
  [${e.clouds.join(", ")}],
  [${e.rangeland.join(", ")}]
];

function evaluatePixel(samples) {
  var cls = classifyLulc(samples);
  if (cls < 0) return [0, 0, 0, 0];
  var rgb = LULC_RGB[cls];
  return [rgb[0], rgb[1], rgb[2], 1];
}`}function Q0(){const e=Sn();return`//VERSION=3
// AGRO_CLASS_HISTOGRAM {"mode":"lulc","classes":${an.length}}
function setup() {
  return {
    input: [{
      bands: ["B02", "B03", "B04", "B08", "B11", "B12", "dataMask"],
      units: "REFLECTANCE"
    }],
    output: [
      { id: "idx", bands: ["idx"], sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ],
    mosaicking: "ORBIT",
    temporal: true
  };
}

${e}

function evaluatePixel(samples) {
  var cls = classifyLulc(samples);
  var valid = cls >= 0;
  return { idx: [valid ? cls : 0], dataMask: [valid ? 1 : 0] };
}`}function em(){return`//VERSION=3
// AgroCloud LULC class-index (UINT8) for AOI pixel counts
function setup() {
  return {
    input: [{
      bands: ["B02", "B03", "B04", "B08", "B11", "B12", "dataMask"],
      units: "REFLECTANCE"
    }],
    output: { bands: 4, sampleType: "UINT8" },
    mosaicking: "ORBIT",
    temporal: true
  };
}

${Sn()}

function evaluatePixel(samples) {
  var cls = classifyLulc(samples);
  if (cls < 0) return [0, 0, 0, 0];
  return [cls, cls, cls, 255];
}`}const Pr="CROP_CLASS",qn={name:Pr,title:"Crop Classification"},tm={active:!1,seasonStart:"",seasonEnd:"",cloudCoverMax:15,lastRunAt:null,statusMessage:"",analysisStep:1,toolTab:"classify"};function pn(e){return String(e||"").trim().toUpperCase()===Pr}function nm(e,t,n,a=120){const r=String(t||n||"").trim().slice(0,10);return r?{timeStart:String(e||"").trim().slice(0,10)||E(r,a),timeEnd:r}:{timeStart:"",timeEnd:""}}function am(e,t=120){const n=String(e||"").trim().slice(0,10);return{seasonEnd:n,seasonStart:E(n,t)}}function lt(e){const t=String(e||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");return t==="DATAMASK"||t==="DATAMASKBAND"||t==="DATA_MASK"}function Vr(){return`//VERSION=3
function setup() {
  return {
    input: ["B04", "dataMask"],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  var m = s.dataMask;
  // GEOMETRY clips to AOI. Paint both valid and nodata samples so small fields stay visible.
  if (!m) return [180, 40, 40, 255];
  return [40, 220, 90, 255];
}`}let Zn="";function zo(e){if(typeof console>"u"||typeof console.info!="function")return;const n=(Array.isArray(e.capabilityLayers)?e.capabilityLayers:[]).filter(i=>{const s=`${(i==null?void 0:i.name)??""} ${(i==null?void 0:i.title)??""}`.toLowerCase();return/datamask|data.?mask/.test(s)}),a=n.length>0,r=`${a?1:0}:${e.registeredInIndex?1:0}:${n.map(i=>i.name).join(",")}`;r!==Zn&&(Zn=r,console.info("[DataMask] Layer Index status",{sourceBandInEvalscripts:!0,evalscriptInput:["B04","dataMask"],evalscriptOutputAlpha:!0,capabilityNamedWmsLayer:a,capabilityMatches:n.map(i=>({name:i.name,title:i.title})),registeredInIndex:e.registeredInIndex,hideReason:e.registeredInIndex?null:a?"Named WMS layer exists in GetCapabilities but was filtered from Layer Index registration":"dataMask is an evalscript sample band, not a GetCapabilities WMS layer — register client DATAMASK in Core Interpretation"}))}const rm=Object.freeze(Object.defineProperty({__proto__:null,buildDataMaskLayerEvalscript:Vr,isDataMaskLayerId:lt,logDataMaskLayerAvailability:zo},Symbol.toStringTag,{value:"Module"})),jo="DATAMASK";function Fr(e){const t=String(e||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");return t==="DATAMASK"||t==="DATAMASKBAND"||t==="DATA_MASK"}const Or=200,qo=0,kr="&UPSAMPLING=BILINEAR&DOWNSAMPLING=BILINEAR",Hr="&UPSAMPLING=NEAREST&DOWNSAMPLING=NEAREST",pe=512;function Zo(e){return ve(e)?Ns:pe}function Jo(e=pe){const t=e>0?e:pe;return Math.max(0,Math.round(13+Math.log2(512/t)))}const hn="NDVI",Qo="NDVI",ec=[hn,"Vegetation Index","Normalized Difference Vegetation Index","Highlight Optimized Natural Color","Optimized Natural Color","True Color"],tc=4007501668557849e-8,nc=/^(sentinel\s*hub\s*wms|wms|root|default)$/i;function Me(e){return e.trim().toLowerCase().replace(/\s+/g," ").replace(/[^\p{L}\p{N}\s]/gu,"")}function Jn(e){let t=0;return/^[0-9]+[-_.]/.test(e.name)&&(t-=2),e.name.includes("-")&&(t+=1),e.title.length>0&&e.title!==e.name&&(t+=1),t}function Qn(e,t){return Jn(e)>=Jn(t)?e:t}function $r(e,t){var i,s;const n=Array.from(e.children).filter(l=>l.localName==="Layer");if(n.length>0){n.forEach(l=>$r(l,t));return}const a=(((i=e.getElementsByTagName("Name")[0])==null?void 0:i.textContent)||"").trim();if(!a||nc.test(a))return;let r=(((s=e.getElementsByTagName("Title")[0])==null?void 0:s.textContent)||a).trim();a==="NDWI"&&/Moisture Index \(NDWI\)/i.test(r)&&(r="NDWI"),(/^NDMI$/i.test(a)||/moisture\s*index/i.test(r)||/moisture\s*index/i.test(a))&&(r="NDMI"),t.push({name:a,title:r})}function ac(e){const t=[],n=e.querySelector("Capability > Layer")??e.getElementsByTagName("Layer")[0];n&&$r(n,t);const a=new Map;for(const i of t){const s=i.name.trim().toUpperCase();if(!s)continue;const l=a.get(s);a.set(s,l?Qn(l,i):i)}const r=new Map;for(const i of a.values()){const s=Me(i.title||i.name);if(!s)continue;const l=r.get(s);r.set(s,l?Qn(l,i):i)}return Array.from(r.values()).sort((i,s)=>(i.title||i.name).localeCompare(s.title||s.name,void 0,{sensitivity:"base"}))}function rc(e,t=hn){if(!e.length)return"";const n=be("NDVI",e);if(n)return n;const a=e.find(l=>String(l.name||"").trim().toUpperCase()==="NDVI");if(a)return a.name;const r=Me(t),i=e.find(l=>Me(l.title||l.name)===r||l.name===t);if(i)return i.name;for(const l of ec){const o=Me(l),c=e.find(u=>{const d=Me(u.title||u.name);return d===o||d.includes(o)||o.includes(d)});if(c)return c.name}const s=e.find(l=>/highlight/i.test(l.title)&&/natural/i.test(l.title));return s?s.name:e[0].name}function ot(e,t=nt()){const n=t.trim();if(!n)return e;const a=e.includes("?")?"&":"?";return`${e}${a}access_token=${encodeURIComponent(n)}`}function ic(e,t=pe,n=Or){const a=Math.max(.12,Math.cos(e*Math.PI/180)),r=Math.log2(tc*a/(t*n));return Math.max(0,Math.ceil(r))}function sc(e){const t=encodeURIComponent(e.layer),n=e.tilePixels??pe,a=e.categorical?Hr:kr;let r=`${e.baseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${t}&BBOX={bbox-epsg-3857}&CRS=EPSG:3857&FORMAT=image/png&TRANSPARENT=true&WIDTH=${n}&HEIGHT=${n}&TIME=${e.timeStart}/${e.timeEnd}&MAXCC=${e.cloudCoverage}`+a+"&SHOWLOGO=false&WARNINGS=false";return e.geometryWkt3857&&(r+=`&GEOMETRY=${encodeURIComponent(e.geometryWkt3857)}`),e.evalscriptB64&&(r+=`&EVALSCRIPT=${encodeURIComponent(e.evalscriptB64)}`),ot(r)}const vn=bl()??[],lc=new Set((vn??[]).map(e=>String(e.name||"").trim().toUpperCase()));function Cn(e){return lc.has(String(e||"").trim().toUpperCase())}function ae(e,t){var a;const n=t.toUpperCase();return(a=e.find(r=>String(r.name||"").toUpperCase().includes(n)||String(r.title||"").toUpperCase().includes(n)))==null?void 0:a.name}function me(e){var t;return ae(e,"1_TRUE_COLOR")??ae(e,"1-TRUE-COLOR")??ae(e,"TRUE-COLOR")??ae(e,"TRUE_COLOR")??ae(e,"1-0-0")??ae(e,"SENTINEL-2")??ae(e,"NDVI")??((t=e[0])==null?void 0:t.name)??"1_TRUE_COLOR"}const oc={NDVI:/NDVI/i,NDMI:/NDMI|MOISTURE/i,NDII:/NDII/i,NDWI:/NDWI|WATER/i,SAVI:/SAVI/i,CHAS:/CHAS/i};function Wr(e){return/^\d+[_-]/.test(String(e||"").trim())}function be(e,t){var i;const n=String(e||"").trim().toUpperCase();if(!n||n==="NDVI")return null;const a=oc[n];if(!a)return null;const r=t.filter(s=>{const l=String(s.name||"").trim();return!l||Cn(l)||!Wr(l)?!1:a.test(l)||a.test(String(s.title||""))});return r.sort((s,l)=>s.name.localeCompare(l.name)),((i=r[0])==null?void 0:i.name)??null}function Xe(e,t=Ee()){return be(e,t)?!1:ct(e)}const cc=new Set(["NDVI","NDMI","NDII","NDWI","MNDWI","AWEI","NBR","SAVI","ET","LST","DATAMASK"]);function ct(e){const t=String(e||"").trim().toUpperCase();return t?!!(Fr(t)||pn(t)||ve(t)||Cn(t)||cc.has(t)||on(t)||x(t)):!1}function Ur(){return Nn([{name:"1_TRUE_COLOR",title:"True Color"},{name:"3_NDVI",title:"Normalized Difference Vegetation Index"},{name:"2_FALSE_COLOR",title:"False Color"},{name:"TRUE_COLOR",title:"True Color (legacy alias)"},{name:"NDVI",title:"NDVI (legacy alias)"},{name:"NDMI",title:"Normalized Difference Moisture Index"},{name:"NDII",title:"Normalized Difference Infrared Index"},{name:"NDWI",title:"Normalized Difference Water Index"},{name:"MNDWI",title:"Modified Normalized Difference Water Index"},{name:"AWEI",title:"Automated Water Extraction Index"},{name:"NBR",title:"Normalized Burn Ratio"},{name:"SAVI",title:"Soil-Adjusted Vegetation Index"},{name:"ET",title:"Evapotranspiration"},{name:"LST",title:"Land Surface Temperature"},{name:jo,title:"DataMask"}])}function Ee(e){const t=Ur();if(!(e!=null&&e.length))return t;const n=new Map;for(const a of t){const r=String(a.name||"").trim().toUpperCase();r&&n.set(r,a)}for(const a of e){const r=String(a.name||"").trim().toUpperCase();r&&n.set(r,a)}return Nn(Array.from(n.values()))}function Nn(e){const t=new Set(e.map(a=>String(a.name||"").trim().toUpperCase())),n=[...vn.filter(a=>!t.has(String(a.name||"").trim().toUpperCase())),...t.has(qn.name.toUpperCase())?[]:[qn],...t.has(Wn.name.toUpperCase())?[]:[Wn]];return n.length?[...e,...n]:e}function uc(e,t){const n=String(e||"").trim();if(!n)return n;const a=n.toUpperCase();if(Fr(a))return me(t);const r=be(n,t);return r||(ct(a)?me(t):t.some(i=>String(i.name||"").trim().toUpperCase()===a)?n:me(t))}const Gr=30;function dc(e,t,n,a){const r=String(t||"").trim().slice(0,10);if(!r)return{timeStart:"",timeEnd:""};if(pn(e)){const s=(a==null?void 0:a.lookbackDays)??120;return{timeStart:E(r,s),timeEnd:r}}if(ve(e)){const s=(a==null?void 0:a.lookbackDays)??120;return{timeStart:E(r,s),timeEnd:r}}if(W(e)){const s=(a==null?void 0:a.lookbackDays)??Ba;return{timeStart:E(r,s),timeEnd:r}}if(X(e)){if(n&&n.trim()&&n.trim()!==r)return{timeStart:n.trim(),timeEnd:r};const s=(a==null?void 0:a.lookbackDays)??gs;return{timeStart:E(r,s),timeEnd:r}}if(Ua(e)){if(n&&n.trim()&&n.trim()!==r)return{timeStart:n.trim(),timeEnd:r};const s=(a==null?void 0:a.lookbackDays)??Rs;return{timeStart:E(r,s),timeEnd:r}}if(x(e)&&n&&n.trim()&&n.trim()!==r)return{timeStart:n.trim(),timeEnd:r};const i=(a==null?void 0:a.lookbackDays)??Gr;return{timeStart:E(r,i),timeEnd:r}}function mc(e,t={}){const n=String(e||"").trim().slice(0,10);if(!n)return null;const a=String(t.autoPreviousSceneDate||"").trim().slice(0,10);if(a&&a!==n)return a;const r=xa(n,t.catalogSceneIsos??[]);if(r&&r!==n)return r;const i=String(t.timeSeriesStart||"").trim().slice(0,10);if(i&&i!==n&&i<n)return i;const s=t.calendarFallbackDays??7,l=new Date(`${n}T12:00:00Z`);if(Number.isNaN(l.getTime()))return null;l.setUTCDate(l.getUTCDate()-s);const o=l.toISOString().slice(0,10);return o!==n?o:null}const im=Object.freeze(Object.defineProperty({__proto__:null,AGRO_CLOUD_CUSTOM_WMS_LAYERS:vn,SENTINEL_HUB_S2_MAX_METERS_PER_PIXEL:Or,SENTINEL_HUB_WMS_CATEGORICAL_RESAMPLE_PARAMS:Hr,SENTINEL_HUB_WMS_LAYER_LIVE_LOOKBACK_DAYS:Gr,SENTINEL_HUB_WMS_RASTER_RESAMPLE_PARAMS:kr,SENTINEL_HUB_WMS_TILE_PIXELS:pe,SI_DEFAULT_LIVE_WMS_LAYER:Qo,SI_DEFAULT_SENTINEL_WMS_LAYER_TITLE:hn,SI_SENTINEL_WMS_MAP_DISPLAY_MIN_ZOOM:qo,appendSentinelHubWmsAccessToken:ot,buildSentinelHubWmsGetMapUrlParts:sc,getBootstrapSentinelWmsLayers:Ur,getSentinelHubWmsLayerCatalog:Ee,isAgroCloudCustomWmsLayer:Cn,isSentinelHubInstanceNativeWmsLayerName:Wr,mergeAgroCloudCustomWmsLayers:Nn,parseSentinelHubWmsCapabilities:ac,pickDefaultSentinelWmsLayer:rc,resolveSentinelHubWmsDeltaPreviousDate:mc,resolveSentinelHubWmsEvalscriptProxyLayerName:me,resolveSentinelHubWmsGetMapLayerName:uc,resolveSentinelHubWmsNativeIndexLayerName:be,resolveSentinelHubWmsNativeMaxZoom:Jo,resolveSentinelHubWmsTilePixels:Zo,resolveSentinelHubWmsTimeWindow:dc,sentinelHubWmsMinZoomForLatitude:ic,usesSentinelHubWmsClientEvalscript:Xe,usesSentinelHubWmsCustomEvalscript:ct},Symbol.toStringTag,{value:"Module"})),fc=.32,sm=120,bn=.06,lm=80;function ze(e){const[t,n,a,r]=e;return![t,n,a,r].every(Number.isFinite)||a<t||r<n?null:[t,n,a,r]}function om(e,t){const n=ze(e),a=ze(t);return!n||!a?!1:n[0]<=a[0]&&n[1]<=a[1]&&n[2]>=a[2]&&n[3]>=a[3]}function cm(e,t=fc){const[n,a,r,i]=e,s=Math.max((r-n)*t,1e-5),l=Math.max((i-a)*t,1e-5);return[n-s,a-l,r+s,i+l]}function Ic(e,t=bn){const[n,a,r,i]=e;return[Math.floor(n/t)*t,Math.floor(a/t)*t,Math.ceil(r/t)*t,Math.ceil(i/t)*t]}function gc(e,t=bn){return Ic(e,t).map(a=>a.toFixed(4)).join(",")}function um(e,t,n=bn){return!e||t<=0?null:`${gc(e,n)}:n${t}`}function Sc(e,t){const n=Yi(e);return n?Da(n,t):!1}function dm(e,t){return{type:"FeatureCollection",features:(Array.isArray(e==null?void 0:e.features)?e.features:[]).filter(a=>{const r=a==null?void 0:a.geometry;return Sc(r,t)})}}function je(e,t=.04){if(!e.length)return null;let n=1/0,a=1/0,r=-1/0,i=-1/0;for(const o of e)for(const[c,u]of o)!Number.isFinite(c)||!Number.isFinite(u)||(n=Math.min(n,c),r=Math.max(r,c),a=Math.min(a,u),i=Math.max(i,u));if(!Number.isFinite(n))return null;const s=Math.max((r-n)*t,1e-6),l=Math.max((i-a)*t,1e-6);return[n-s,a-l,r+s,i+l]}function pc(e,t){return e.filter(n=>{let a=1/0,r=1/0,i=-1/0,s=-1/0;for(const[l,o]of n)!Number.isFinite(l)||!Number.isFinite(o)||(a=Math.min(a,l),i=Math.max(i,l),r=Math.min(r,o),s=Math.max(s,o));return Number.isFinite(a)?Da([a,r,i,s],t):!1})}function mm(e){const t=e.longitude,n=e.latitude,a=e.zoom;if(!Number.isFinite(t)||!Number.isFinite(n)||!Number.isFinite(a))return null;const r=n*Math.PI/180,i=512*2**a,s=e.width&&e.width>0?e.width:1280,l=e.height&&e.height>0?e.height:720,o=s/i*360*.5,c=l/i*360*Math.cos(r)*.5;return ze([t-o,n-c,t+o,n+c])}function fm(e,t,n){return e>=n[0]&&e<=n[2]&&t>=n[1]&&t<=n[3]}function Im(e){var t;try{const n=(t=e==null?void 0:e.getBounds)==null?void 0:t.call(e);return n?ze([n.getWest(),n.getSouth(),n.getEast(),n.getNorth()]):null}catch{return null}}function xt(e){if(!e||e.length<3)return 0;let t=1/0,n=1/0,a=-1/0,r=-1/0;for(const[i,s]of e)!Number.isFinite(i)||!Number.isFinite(s)||(t=Math.min(t,i),a=Math.max(a,i),n=Math.min(n,s),r=Math.max(r,s));return Number.isFinite(t)?Math.max(0,a-t)*Math.max(0,r-n):0}function Kr(e){return!Array.isArray(e)||!e.length?[]:[...e].sort((t,n)=>xt(n)-xt(t))}function hc(e,t){return(Array.isArray(e)?e.filter(a=>Array.isArray(a)&&a.length>=3):[]).map(a=>({geometryWkt3857:A([a]),evalscriptB64:t,aoiBoundsLngLat:je([a])}))}function Yr(e,t,n){const a=Array.isArray(e)?e.filter(c=>c&&Array.isArray(c.outerRings)&&c.outerRings.length>0):[],r=Math.max(1,Math.floor(t));if(a.length<=r)return a;const i=yn(n);let s=[...a];const l=s.flatMap(c=>c.outerRings),o=A(l);if(o.length<=i&&r>=1)return[{geometryWkt3857:o,outerRings:l}];for(;s.length>r;){let c=!1;for(let m=0;m<s.length-1;m++){const f=[...s[m].outerRings,...s[m+1].outerRings],S=A(f);if(S.length<=i){const I={geometryWkt3857:S,outerRings:f};s=[...s.slice(0,m),I,...s.slice(m+2)],c=!0;break}}if(c)continue;let u=0,d=1,g=1/0;for(let m=0;m<s.length;m++)for(let f=m+1;f<s.length;f++){const S=[...s[m].outerRings,...s[f].outerRings],I=A(S).length;I<=i&&I<g&&(g=I,u=m,d=f)}if(g<1/0){const m=[...s[u].outerRings,...s[d].outerRings],f={geometryWkt3857:A(m),outerRings:m};s=s.filter((S,I)=>I!==u&&I!==d),s.push(f);continue}break}return s}function ea(e,t){const n=t;return n==null||!Number.isFinite(n)||n<=0||e.length<=n,e}const wt=5600,Xr=96;function zr(e,t){const n=e*2003750834e-2/180,a=Math.log(Math.tan((90+t)*Math.PI/360))/(Math.PI/180)*(2003750834e-2/180);return[n,a]}function qe(e){if(e.length<2)return e;const t=e[0],n=e[e.length-1];return t[0]===n[0]&&t[1]===n[1]?e:[...e,t]}function vc(e,t,n){const[a,r]=e,[i,s]=t,[l,o]=n,c=l-i,u=o-s;if(c===0&&u===0)return Math.hypot(a-i,r-s);const d=Math.max(0,Math.min(1,((a-i)*c+(r-s)*u)/(c*c+u*u))),g=i+d*c,m=s+d*u;return Math.hypot(a-g,r-m)}function Be(e,t){if(e.length<=2)return e;let n=0,a=0;for(let r=1;r<e.length-1;r++){const i=vc(e[r],e[0],e[e.length-1]);i>n&&(a=r,n=i)}if(n>t){const r=Be(e.slice(0,a+1),t),i=Be(e.slice(a),t);return[...r.slice(0,-1),...i]}return[e[0],e[e.length-1]]}function he(e,t){if(e.length<=t)return e;const n=Math.ceil(e.length/t),a=[];for(let s=0;s<e.length;s+=n)a.push(e[s]);const r=e[e.length-1],i=a[a.length-1];return(i[0]!==r[0]||i[1]!==r[1])&&a.push(r),a}function Cc(e){return e<=1?Xr:e<=4?64:e<=8?48:e<=16?36:e<=24?28:e<=40?24:e<=80?20:(e<=200,16)}function Tt(e,t=Xr){const n=qe(e);let a=25e-6,r=Be(n,a);for(let i=0;i<8&&r.length>t;i++)a*=1.75,r=Be(n,a);return r=he(r,t),qe(r)}function jr(e){return!Array.isArray(e)||e.length<2?"":e.map(([t,n])=>{const[a,r]=zr(t,n);return`${a.toFixed(2)} ${r.toFixed(2)}`}).join(", ")}function Nc(e){const t=jr(e);return t?`POLYGON((${t}))`:"POLYGON EMPTY"}function A(e){const t=Array.isArray(e)?e.filter(a=>Array.isArray(a)&&a.length>=3):[];return t.length?t.length===1?Nc(t[0]):`MULTIPOLYGON(${t.map(a=>`((${jr(a)}))`).join(", ")})`:"POLYGON EMPTY"}function qr(e){const t=String(e||"").toUpperCase();return lt(t)?"data_mask":pn(t)?"crop_classification":ve(t)?"lulc_classification":on(t)?"agro_composite":ut(e)?"native":t.includes("GNDVI")?"gndvi":t.includes("NDSI")||t.includes("SNOW")?"ndsi":t.includes("NDRE")?"ndre":t.includes("BSI")?"native":t.includes("MNDWI")?"mndwi":t.includes("AWEI")?"awei":t.includes("NBR")?"nbr":t.includes("SAVI")?"savi":t.includes("NDVI")?"ndvi":t.includes("EVI")&&!t.includes("NEVI")?"evi":t.includes("NDII")?"ndii":t.includes("NDMI")||t.includes("MOISTURE")&&!t.includes("EVAPO")?"ndmi":t==="ET"||t.includes("EVAPOTRANSPIRATION")||t.includes("EVAPO")?"et":t==="LST"||t.includes("LAND_SURFACE_TEMP")||t.includes("SURFACE")&&t.includes("TEMP")?"lst":t.includes("NDWI")||t.includes("WATER")?"ndwi":t.includes("FALSE")||t.includes("SWIR")||t.includes("COLOR_INFRARED")?"false_color":t.includes("TRUE")||t.includes("NATURAL")||t.includes("RGB")?"true_color":"native"}function ut(e){const t=String(e||"").toUpperCase();return/HIGHLIGHT|OPTIMIZED|ENHANCED|VIVID|CONTRAST|MOMA|AGRICULTURE|COLOR.?BLIND|ATMOSPHERIC|PERSPECTIVE/i.test(t)}function Zr(e,t,n,a,r){if(e==="agro_composite")return Go(n,t)??"";if(e==="data_mask")return Vr();if(e==="crop_classification")return Ko();if(e==="lulc_classification")return Xo();if(No(e))return Co(e,t,{sceneDate:a,terrain3dCloudExtrusion:r});switch(e){case"native":return"";case"true_color":case"generic_rgb":return`//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
function evaluatePixel(s) {
  return [
    Math.max(0, Math.min(1, s.B04 * ${$e})),
    Math.max(0, Math.min(1, s.B03 * ${$e})),
    Math.max(0, Math.min(1, s.B02 * ${$e})),
    s.dataMask
  ];
}`;case"false_color":return`//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04", "B08", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
function evaluatePixel(s) {
  return [
    Math.max(0, Math.min(1, s.B08 * 2.5)),
    Math.max(0, Math.min(1, s.B04 * 2.5)),
    Math.max(0, Math.min(1, s.B03 * 2.5)),
    s.dataMask
  ];
}`;default:return Zr("generic_rgb",t,n)}}function Jr(e){const t=unescape(encodeURIComponent(e.replace(/\r\n/g,`
`).trim()));return btoa(t)}function bc(e,t,n,a=64){const r=[],i=t*Math.PI/180,s=Math.cos(i),l=111320,o=111320*(Math.abs(s)>1e-6?s:1e-6);for(let c=0;c<=a;c++){const u=c/a*2*Math.PI,d=n*Math.cos(u)/o,g=n*Math.sin(u)/l;r.push([e+d,t+g])}return r}function ta(e){const t=e.geometry;if(!t||typeof t!="object")return null;if(t.type==="Polygon"||t.type==="MultiPolygon")return t;if(t.type==="Point"&&Array.isArray(t.coordinates)&&t.coordinates.length>=2){const n=e.properties,a=Number(n==null?void 0:n.radius);if(!Number.isFinite(a)||a<=0)return null;const r=Number(t.coordinates[0]),i=Number(t.coordinates[1]);return!Number.isFinite(r)||!Number.isFinite(i)?null:{type:"Polygon",coordinates:[bc(r,i,a)]}}return null}function Ec(e){const t=[];for(const n of e)n.type==="Polygon"?t.push(n.coordinates):t.push(...n.coordinates);return t.length?t.length===1?{type:"Polygon",coordinates:t[0]}:{type:"MultiPolygon",coordinates:t}:null}function te(e){if(!e||typeof e!="object")return null;const t=e;if(t.type==="Feature"&&t.geometry){const n=ta(t);return n||te(t.geometry)}if(t.type==="FeatureCollection"&&Array.isArray(t.features)){const n=[];for(const a of t.features){const r=ta(a)??te(a);r&&n.push(r)}return Ec(n)}return t.type==="Polygon"||t.type==="MultiPolygon"?t:null}function En(e){const t=te(e);if(!t)return[];const n=r=>{if(!Array.isArray(r)||r.length<3)return null;const i=[];for(const s of r){if(!Array.isArray(s)||s.length<2)continue;const l=Number(s[0]),o=Number(s[1]);!Number.isFinite(l)||!Number.isFinite(o)||i.push([l,o])}return i.length>=3?i:null},a=[];if(t.type==="Polygon"){const r=n(t.coordinates[0]);r&&a.push(r)}else for(const r of t.coordinates){const i=n(r==null?void 0:r[0]);i&&a.push(i)}return a}function Re(e,t){if(ut(e)||be(e,Ee()))return null;const n=qr(e),a=n==="native"?"true_color":n,r=(t==null?void 0:t.indexVisibilityMin)??null;let i=Zr(a,r,e,t==null?void 0:t.sceneDate,t==null?void 0:t.terrain3dCloudExtrusion);return i?Jr(i):null}function na(e){const t=Cc(e.length);let n=e.map(i=>Tt(i,t)),a=A(n);if(a.length<=wt)return n;const r=Math.max(6,Math.floor(t*.65));return n=e.map(i=>he(Be(qe(i),2e-4),r)),a=A(n),a.length<=wt?n:e.map(i=>he(i,Math.max(16,Math.min(32,t))))}function yn(e){const t=(e==null?void 0:e.length)??0;return Math.max(1200,wt-t-48)}const Pt=64;function yc(e){const t=Math.max(0,Math.floor(Number(e)||0));return t<=0?16:t<=16?Math.min(Pt,Math.max(8,t)):t<=80?24:t<=250?36:t<=600?48:Pt}function Vt(e,t){let n=A([e]);if(n.length<=t)return n;let a=he(e,Math.max(8,Math.floor(e.length*.55)));return n=A([a]),n.length<=t?n:(a=he(e,Math.max(6,Math.floor(e.length*.35))),A([a]))}function Qr(e,t){if(!e.length)return[];const n=yn(t),a=[];let r=[];const i=()=>{r.length&&(a.push({geometryWkt3857:A(r),outerRings:r}),r=[])};for(const s of e){const l=[...r,s];if(A(l).length<=n){r=l;continue}i(),A([s]).length<=n?r=[s]:a.push({geometryWkt3857:Vt(s,n),outerRings:[s]})}return i(),a}function Mc(e,t){const n=Math.max(1,Math.floor(t));let a=0,r=0,i=0;for(const[l,o]of e)!Number.isFinite(l)||!Number.isFinite(o)||(a+=l,r+=o,i+=1);return i?(a/=i,r/=i,Math.abs(Math.floor(a*1e3)*73856093^Math.floor(r*1e3)*19349663)%n):0}function Ft(e,t,n){if(!e.length)return[];const a=Math.max(1,Math.floor(t)),r=yn(n);if(e.length<=a)return e.map(l=>({geometryWkt3857:Vt(l,r),outerRings:[l]}));const i=Array.from({length:a},()=>[]);for(const l of e)i[Mc(l,a)].push(l);const s=[];for(const l of i){if(!l.length)continue;let o=l.length>40?12:l.length>16?16:24,c=l.map(d=>Tt(d,o)),u=A(c);for(;u.length>r&&o>5;)o=Math.max(5,Math.floor(o*.65)),c=l.map(d=>Tt(d,o)),u=A(c);if(u.length>r&&(c=l.map(d=>he(qe(d),5)),u=A(c)),u.length>r){for(const d of c)s.push({geometryWkt3857:Vt(d,r),outerRings:[d]});continue}s.push({geometryWkt3857:u,outerRings:c})}return s.length<=a?s:Yr(s,a,n)}function Ue(e,t,n){let a=En(e);if(n!=null&&n.viewportBBox){const c=pc(a,n.viewportBBox);c.length&&(a=c)}if(!a.length)return[];const r=Re(t,n),i=(n==null?void 0:n.maxTileLayers)??null,s=Kr(a);if(n!=null&&n.preferSingleRingChunks&&(i==null||i<=0||s.length<=i))return hc(na(s),r);if(i!=null&&Number.isFinite(i)&&i>0&&s.length>i)return Ft(s,i,r).map(u=>({geometryWkt3857:u.geometryWkt3857,evalscriptB64:r,aoiBoundsLngLat:je(u.outerRings)}));let l=na(s),o=Qr(l,r);return o.length?(i!=null&&Number.isFinite(i)&&i>0&&o.length>i&&(o=Ft(l,i,r)),o.map(c=>({geometryWkt3857:c.geometryWkt3857,evalscriptB64:r,aoiBoundsLngLat:je(c.outerRings)}))):[]}function ei(e,t,n){const a=String(t||"").trim();if(!a)return[];const r=En(e),i=(n==null?void 0:n.maxTileLayers)??null;if(r.length>0){let o=Ue(e,t,n);if(!o.length&&(n!=null&&n.viewportBBox)&&(o=Ue(e,t,{...n,viewportBBox:null})),o.length)return ea(o,i);const c=Re(a,n);return c&&Xe(a)?[{geometryWkt3857:null,evalscriptB64:c,aoiBoundsLngLat:je(r)}]:[]}const s=Re(a,n);if(s)return[{geometryWkt3857:null,evalscriptB64:s}];const l=Ue(e,t,n);return l.length?ea(l,i):Xe(a)?[]:[{geometryWkt3857:null,evalscriptB64:null}]}function ti(e,t){return!String(e||"").trim()||!t.length?!1:t.every(n=>n.evalscriptB64!=null||!Xe(e))}function Ac(e,t,n){return ti(e,t)?t.some(r=>!!r.geometryWkt3857)?t.every(r=>!!r.geometryWkt3857&&!!(r.aoiBoundsLngLat??(n==null?void 0:n.aoiBoundsLngLat)??r.geometryWkt3857)):!0:!1}function Dc(e,t,n){const a=ei(e,t,n);return a.length?a[0]:{geometryWkt3857:null,evalscriptB64:null}}const gm=Object.freeze(Object.defineProperty({__proto__:null,SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES:Pt,buildEvalscriptB64ForLayer:Re,buildSentinelHubWmsAoiClip:Dc,buildSentinelHubWmsAoiClipChunks:Ue,buildSentinelHubWmsDisplayChunks:ei,canRenderSentinelHubWmsLayerOnMap:ti,evalscriptToBase64Param:Jr,extractOuterRingsWgs84:En,getDrawnGeometry:te,inferWmsEvalProfile:qr,isSentinelHubWmsRenderReady:Ac,lngLatToWebMercator:zr,mergeWktChunkGroupsToCap:Yr,outerRingApproxArea:xt,packOuterRingsIntoFixedBucketGroups:Ft,packOuterRingsIntoWktChunkGroups:Qr,resolveLayersAoiWmsMaxTileLayers:yc,sortOuterRingsByApproxAreaDesc:Kr,usesPresetSentinelHubWmsLayer:ut},Symbol.toStringTag,{value:"Module"}));function ni(e){const t=String(e||"").trim();if(!t)return!1;const n=t.toUpperCase();if(ut(t))return!0;const a=Ee();return!!(be(t,a)||Re(t)!=null||!ct(n)&&a.some(r=>String(r.name||"").trim().toUpperCase()===n))}function ai(e,t){const n=[];for(const a of e){const r=a.options.filter(i=>t(i.id));r.length&&n.push({...a,options:r})}return n}function Sm(e){return ai(e,ni)}function pm(e){return ni(e)}const Lc=128,_c=4,Bc=160;function Rc(e){const t=String(e||"").replace(/\r\n/g,`
`).trim();return typeof btoa=="function"?btoa(unescape(encodeURIComponent(t))):t}const xc=Rc(Kl);function ri(e,t){const n=e*2003750834e-2/180,a=Math.log(Math.tan((90+t)*Math.PI/360))/(Math.PI/180)*(2003750834e-2/180);return[n,a]}function ii(e,t){if(e){if(Array.isArray(e)&&typeof e[0]=="number"&&typeof e[1]=="number"){t.push([e[0],e[1]]);return}Array.isArray(e)&&e.forEach(n=>ii(n,t))}}function wc(e){const t=[];if("coordinates"in e&&ii(e.coordinates,t),!t.length)return null;let n=1/0,a=1/0,r=-1/0,i=-1/0;for(const[o,c]of t){const[u,d]=ri(o,c);u<n&&(n=u),d<a&&(a=d),u>r&&(r=u),d>i&&(i=d)}if(![n,a,r,i].every(Number.isFinite))return null;const s=Math.max(8,(r-n)*.02),l=Math.max(8,(i-a)*.02);return[n-s,a-l,r+s,i+l]}function aa(e){if(e.length<2)return e;const t=e[0],n=e[e.length-1];return t[0]===n[0]&&t[1]===n[1]?e:[...e,t]}function ra(e,t){if(e.length<=t)return e;const n=Math.ceil(e.length/t),a=[];for(let s=0;s<e.length;s+=n)a.push(e[s]);const r=e[e.length-1],i=a[a.length-1];return(i[0]!==r[0]||i[1]!==r[1])&&a.push(r),a}function ft(e){return e.map(([t,n])=>{const[a,r]=ri(t,n);return`${a.toFixed(2)} ${r.toFixed(2)}`}).join(", ")}function Tc(e){var t;if(e.type==="Polygon"){const n=(t=e.coordinates)==null?void 0:t[0];if(!Array.isArray(n)||!n.length)return null;const a=ra(aa(n),36);return`POLYGON((${ft(a)}))`}if(e.type==="MultiPolygon"){const n=(e.coordinates||[]).map(r=>{const i=r==null?void 0:r[0];return!Array.isArray(i)||!i.length?null:ra(aa(i),28)}).filter(r=>!!r);return n.length?n.length===1?`POLYGON((${ft(n[0])}))`:`MULTIPOLYGON(${n.map(r=>`((${ft(r)}))`).join(", ")})`:null}return null}async function Pc(e,t,n,a){var l;const r=await fetch(e,{headers:{Accept:"image/png"},signal:a});if(!r.ok){const o=await r.text().catch(()=>"");throw new Error(`WMS GetMap failed (${r.status}): ${o.slice(0,160)}`)}const i=await r.blob(),s=await createImageBitmap(i);try{const o=document.createElement("canvas");o.width=t,o.height=n;const c=o.getContext("2d");if(!c)throw new Error("Canvas 2D context unavailable.");return c.drawImage(s,0,0,t,n),c.getImageData(0,0,t,n).data}finally{(l=s.close)==null||l.call(s)}}function Vc(){return!!Ma().trim()}async function Fc(e,t,n,a){const r=wc(e),i=Tc(e);if(!r||!i)return null;const s=me(Ee()),[l,o,c,u]=r,d=Lc,g=ie(t,1);let m=`${ya()}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${encodeURIComponent(s)}&BBOX=${l},${o},${c},${u}&CRS=EPSG:3857&FORMAT=image/png&TRANSPARENT=true&WIDTH=${d}&HEIGHT=${d}&TIME=${t}/${g}&MAXCC=${ur}&GEOMETRY=${encodeURIComponent(i)}&SHOWLOGO=false&WARNINGS=false&EVALSCRIPT=${encodeURIComponent(xc)}`;m=ot(m);try{const f=await Pc(m,d,d,n),S=Yl(f),I=vr(t,S,{sceneId:t,originalCloudCoverage:(a==null?void 0:a.originalCloudCoverage)??null});return Cr(I),{stats:S,log:I}}catch{return null}}async function Oc(e,t,n){if(!e.length)return[];const a=new Array(e.length);let r=0;const i=Array.from({length:Math.min(t,e.length)},async()=>{for(;r<e.length;){const s=r++;a[s]=await n(e[s])}});return await Promise.all(i),a}async function kc(e,t,n,a){const r=[...new Set(t.map(m=>m.trim().slice(0,10)).filter(Boolean))].sort((m,f)=>f.localeCompare(m));if(!r.length)return{sceneIsos:[],sceneCloudByDate:{},sceneClearByDate:{},sceneLogs:[]};const i=te(e);if(!i||!Vc())return{sceneIsos:r,sceneCloudByDate:{},sceneClearByDate:{},sceneLogs:[]};const s=r.slice(0,Bc),o=(await Oc(s,_c,async m=>{var N,h;if((N=a==null?void 0:a.signal)!=null&&N.aborted)return null;const f=await Fc(i,m,a==null?void 0:a.signal,{originalCloudCoverage:((h=a==null?void 0:a.originalCloudByDate)==null?void 0:h[m])??null});if(!f)return null;const{stats:S,log:I}=f;return S.aoiCloudCoverPct==null?null:{date:m,aoiCloudCoverPct:S.aoiCloudCoverPct,aoiClearCoverPct:S.aoiClearCoverPct??0,usable:I.usable,log:I}})).filter(m=>!!m).sort((m,f)=>m.usable!==f.usable?m.usable?-1:1:f.aoiClearCoverPct-m.aoiClearCoverPct||m.aoiCloudCoverPct-f.aoiCloudCoverPct),c={},u={},d=[],g=[];for(const m of o)c[m.date]=m.aoiCloudCoverPct,u[m.date]=m.aoiClearCoverPct,d.push(m.log),g.push(m.date);for(const m of r)g.includes(m)||g.push(m);return g.sort((m,f)=>{const S=u[m]??-1,I=u[f]??-1;return S!==I?I-S:f.localeCompare(m)}),{sceneIsos:g,sceneCloudByDate:c,sceneClearByDate:u,sceneLogs:d}}const Hc=.05,ia=.02,sa=.15,Fe=.2,$c=.4,Wc=new Set(["BARE_SOIL_UNPLANTED","NON_CULTIVATED_STABLE"]);function la(e,t=Hc){return Number.isFinite(e)&&Math.abs(e)<=t}function si(e){return Wc.has(e)}function Uc(e){const t=e.current.NDVI-e.prev1.NDVI,n=e.prev1.NDVI-e.prev2.NDVI;return t>0||n>0}function li(e,t){return{current:e,prev1:{NDVI:t[1]??e.NDVI,NDMI:e.NDMI,NDWI:e.NDWI},prev2:{NDVI:t[2]??t[1]??e.NDVI,NDMI:e.NDMI,NDWI:e.NDWI}}}function oi(e){const{current:t,prev1:n,prev2:a}=e;if(t.NDVI<.1||t.NDVI<.12&&la(t.NDMI,.08)&&la(t.NDWI,.08))return"BARE_SOIL_UNPLANTED";const r=t.NDVI-n.NDVI,i=n.NDVI-a.NDVI;if(t.NDVI<.15&&Math.abs(r)<=ia&&Math.abs(i)<=ia)return"NON_CULTIVATED_STABLE";const s=n.NDVI<sa||a.NDVI<sa;return t.NDVI>Fe&&s?"ACTIVE_CROP_ESTABLISHED":t.NDVI>=Fe||n.NDVI>=Fe||a.NDVI>=Fe?"ACTIVE_CROP_ONGOING":"NON_CULTIVATED_STABLE"}function Gc(e,t,n){return si(n)||e<=$c?!1:Uc(t)}function Kc(e){switch(e){case"BARE_SOIL_UNPLANTED":return{label:"UNPLANTED / BARE SOIL",interpretation:"No active crop detected — bare or unplanted land.",color:"#90a4ae",icon:"fa-mound",showCropHealthAlert:!1};case"NON_CULTIVATED_STABLE":return{label:"NON-CULTIVATED / FALLOW",interpretation:"Low stable NDVI with no crop establishment pattern.",color:"#78909c",icon:"fa-ban",showCropHealthAlert:!1};case"ACTIVE_CROP_ESTABLISHED":return{label:"CROP ESTABLISHED",interpretation:"Vegetation emergence detected after low baseline.",color:"",icon:"fa-seedling",showCropHealthAlert:!0};case"ACTIVE_CROP_ONGOING":default:return{label:"ACTIVE CROP",interpretation:"Active vegetation canopy present.",color:"",icon:"fa-leaf",showCropHealthAlert:!0}}}const re=[{id:"bare",label:"FALLOW / FAILURE",rangeLabel:"< 0.05",min:-1,max:.05,color:"#d32f2f",icon:"fa-xmark",interpretation:"Bare soil or crop failure — no viable vegetation cover detected."},{id:"stress",label:"STRESS HIGH",rangeLabel:"0.05 – 0.25",min:.05,max:.25,color:"#ff9800",icon:"fa-droplet-slash",interpretation:"Severe crop stress — water deficit or physiological damage likely."},{id:"watch",label:"WATCH",rangeLabel:"0.25 – 0.40",min:.25,max:.4,color:"#ffeb3b",icon:"fa-eye",interpretation:"Early vigor decline — monitor the field without immediate intervention."},{id:"healthy",label:"MODERATE HEALTH",rangeLabel:"0.40 – 0.60",min:.4,max:.6,color:"#aeea00",icon:"fa-leaf",interpretation:"Moderate canopy health — stable mid-season crop vigor."},{id:"growth",label:"STRONG GROWTH",rangeLabel:"0.60 – 0.75",min:.6,max:.75,color:"#2e7d32",icon:"fa-seedling",interpretation:"Strong biomass accumulation — active crop growth phase."},{id:"harvest-ready",label:"HARVEST READY",rangeLabel:"≥ 0.75",min:.75,max:1.05,color:"#1b5e20",icon:"fa-wheat-awn",interpretation:"Peak crop maturity — optimal harvest readiness window."}];Object.fromEntries(re.map(e=>[e.id,e.icon]));function hm(e){const t=Number.isFinite(e)?e:0;return t<.05?re[0]:t<.25?re[1]:t<.4?re[2]:t<.6?re[3]:t<.75?re[4]:re[5]}function Yc(e){const t=e.replace("#","").trim();if(t.length!==6)return"#f8fafc";const n=Number.parseInt(t.slice(0,2),16),a=Number.parseInt(t.slice(2,4),16),r=Number.parseInt(t.slice(4,6),16);return!Number.isFinite(n)||!Number.isFinite(a)||!Number.isFinite(r)?"#f8fafc":.299*n+.587*a+.114*r>148?"#1e293b":"#f8fafc"}const ci=hs;function Xc(e,t,n=ci){return e.filter(a=>a.date<=t.trim()&&a.ndvi!=null&&Number.isFinite(a.ndvi)).sort((a,r)=>r.date.localeCompare(a.date)).slice(0,n).map(a=>({date:a.date,ndvi:a.ndvi,ndwi:a.ndwi,ndmi:a.ndmi,ciRe:a.ciRe}))}function zc(e){return e.filter(t=>t.ndvi!=null||t.ndwi!=null||t.ndmi!=null).map(t=>t.date).sort((t,n)=>n.localeCompare(t))}function vm(e,t,n){const a=t.trim(),r=zc(e);let i=a,s=!1;if(n!=null&&n.preferLatestAvailable&&r.length)i=r[0],s=i!==a;else{const m=wa(e,a,n==null?void 0:n.catalogSceneIsos);i=m.resolvedDate??r[0]??a,s=m.fallbackUsed||i!==a}const l=Xc(e,i,(n==null?void 0:n.maxScenes)??ci);if(!l.length)return null;const o=l[0],c=l[1],u=l.reduce((m,f)=>m+f.ndvi,0)/l.length,d=c?o.ndvi-c.ndvi:0,g=c?tt(o.ndvi,c.ndvi):0;return{scenes:l,currentDate:o.date,ndviCurrent:o.ndvi,ndviMean3:Number(u.toFixed(4)),ndviDelta2:Number(d.toFixed(4)),ndviChangePct2:g,ndwiCurrent:o.ndwi??0,ndmiCurrent:o.ndmi??0,anchorDate:i,requestedDate:a,fallbackUsed:s}}function jc(e){const t=xn(e.ndvi,e.date,e.date);return{ndvi:e.ndvi,ndwi:e.ndwi??t.ndwi,ndmi:e.ndmi??t.ndmi,evi:t.evi,ciRe:e.ciRe??t.ciRe}}function Cm(e,t){const n=new Map(e.filter(g=>g.ndvi!=null).map(g=>[g.date,g])),a=n.get(t);if(!a||a.ndvi==null)return{trend:"stable",previous7:null,previous30:null};const r=[...n.keys()].sort((g,m)=>m.localeCompare(g)),i=r.indexOf(t),s=g=>{var S;const m=r[i+g];if(!m)return null;const f=(S=n.get(m))==null?void 0:S.ndvi;return typeof f=="number"&&Number.isFinite(f)?f:null},l=a.ndvi,o=s(1)??s(2)??l,c=s(Math.min(4,r.length-i-1))??o,u={ndvi:o,ndwi:0,ndmi:0,evi:0},d={ndvi:c,ndwi:0,ndmi:0,evi:0};return{trend:_i(l,o,c),previous7:u,previous30:d}}const Mn=-.15,ui=-.05,An="#aeea00",qc=An,Zc="#15803d",Jc={critical:"#d32f2f",stress:"#ff9800",watch:"#ffeb3b",stable:An},Qc={critical:"Critical Risk",stress:"High Stress",watch:"Watch",stable:"Stable / Improving"},eu={critical:"fa-triangle-exclamation",stress:"fa-droplet-slash",watch:"fa-eye",stable:"fa-circle-check"},tu={critical:550,stress:1100,watch:2200,stable:null},nu={critical:4,stress:3,watch:2,stable:0};function Nm(e){if(au(e.alertTier)==="stable")return e.severity==="normal"?qc:Zc}function au(e){switch(e){case"critical":return"critical";case"stress":case"warning":return"stress";case"watch":return"watch";default:return"stable"}}function ru(e){switch(e){case"CRITICAL":return"critical";case"ACTIVE":return"stress";case"WARNING":return"watch";default:return"stable"}}function Ze(e){return{ndvi:e.ndvi,ndmi:e.ndmi,ndwi:e.ndwi,savi:e.savi!=null&&Number.isFinite(e.savi)?e.savi:at(e.ndvi),ciRe:e.ciRe,ndre:e.ndre}}const bm=["healthy","stable","warning","critical"],Em={healthy:"Healthy",stable:"Stable",warning:"Warning",critical:"Critical"},ym={healthy:"🌱",stable:"🌿",warning:"⚠️",critical:"🚨"},Mm={healthy:"fa-solid fa-seedling",stable:"fa-solid fa-leaf",warning:"fa-solid fa-triangle-exclamation",critical:"fa-solid fa-bell"},Am={healthy:An,stable:"#65a30d",warning:"#f59e0b",critical:"#dc2626"};function Dm(e){if(!Number.isFinite(e))return"warning";const t=xr(e);return t==="CRITICAL"?"critical":t==="ACTIVE"||t==="WARNING"?"warning":Rr(e)>=8?"healthy":"stable"}function Lm(e,t){return e==="critical"?t!=null&&t<=Mn?"Urgent intervention — sharp CDSI decline vs previous scene.":"Critical crop health — immediate field inspection required.":e==="warning"?"Monitor closely — irrigation or agronomic review may be needed.":e==="stable"?"Stable canopy — continue routine monitoring.":"Healthy vigor — no immediate action required."}function di(e,t){return Number((e-t).toFixed(4))}function _m(e){return e==null||!Number.isFinite(e)?"watch":e<=Mn?"critical":e<=ui?"stress":e<=0?"watch":"stable"}function iu(e){if(e.chasPreviousSnapshot)return e.chasPreviousSnapshot;if(e.ndviSceneDates.length>=2){const t=e.ndviSceneValues;if(t.length>=2)return{ndvi:t[1],ndmi:e.previous7.ndmi,ndwi:e.previous7.ndwi,evi:e.previous7.evi,ciRe:e.previous7.ciRe,ndre:e.previous7.ndre}}return e.previous7}function su(e){if(e.chasCurrent!=null&&e.deltaChas!=null&&Number.isFinite(e.chasCurrent)&&Number.isFinite(e.deltaChas))return{chasCurrent:e.chasCurrent,chasPrevious:e.chasPrevious??null,deltaChas:e.deltaChas};const t=De(Ze(e.current)),n=iu(e),a=n?De(Ze(n)):null,r=a!=null?di(t,a):null;return{chasCurrent:t,chasPrevious:a,deltaChas:r}}function Bm(e){const{chasCurrent:t,chasPrevious:n,deltaChas:a}=su(e);let r=ru(xr(t));a!=null&&a<=Mn&&r!=="critical"?r="critical":a!=null&&a<=ui&&r==="stable"&&(r="stress");const i=Jc[r],s=tu[r];return{tier:r,label:Qc[r],color:i,iconForeground:Yc(i),icon:eu[r],chasCurrent:t,chasPrevious:n,deltaChas:a,pulse:{tier:r,ringCount:nu[r],blinkMs:s}}}function lu(e,t){const n=De(Ze(e)),a=t??null,r=a?De(Ze(a)):null,i=r!=null?di(n,r):null;return{chasCurrent:n,chasPrevious:r,deltaChas:i,previousSnapshot:a}}function ou(e,t,n){const a=n==null?void 0:n.scenes[1];return a?jc(a):t}const Je=10,cu=Je,uu="10m native",du={dataFusion:!0,subPixelAnalysis:!0,objectBasedAnalysis:!0,superpixelSegmentation:!0,temporalDeltaNdvi:!0,temporalDeltaChas:!0};function Rm(){return{nativeGsdM:Je,insightGsdM:cu,insightLabel:uu,disclaimer:"Sentinel-2 L2A native 10 m spatial resolution.",pipeline:du,badgeShort:"10m native",badgeLong:`Sentinel-2 ${Je}m native`}}const mu=/^(NDVI|NDMI|NDWI|SAVI|EVI|GNDVI|NDRE|NDSI|MNDWI|AWEI|NBR|BSI|CHAS|DCHAS)$/i;function fu(e){const t=String(e||"").trim().toUpperCase();return!t||/TRUE|FALSE|RGB|NATURAL|COLOR.?INFRARED|HIGHLIGHT|OPTIMIZED|VIVID|MOMA|CONTRAST|ATMOSPHERIC|PERSPECTIVE|AGRICULTURE|COLOR.?BLIND/i.test(t)?!1:on(t)||x(t)||mu.test(t)||/^D[A-Z0-9]{2,}$/.test(t)?!0:/INDEX|STRESS|MOISTURE|HEALTH|RISK|CROP|ALERT|CHAS|NDVI|NDMI|NDWI|SAVI/i.test(t)}function xm(e){if(!fu(e.id))return e;const t=`Sentinel-2 ${Je}m native resolution.`;return{...e,note:e.note?`${e.note} · ${t}`:t}}function Iu(e,t,n=[]){if(!Number.isFinite(e))return e;const a=Math.max(1,t),r=Math.min(1,a/12);let i=e;if(n.length){const s=n.reduce((l,o)=>l+o,0)/n.length;i=e*(.55+r*.25)+s*(.45-r*.25)}else i=e*(.82+r*.18)+.35*(1-r)*.1;return Number(i.toFixed(4))}const mi="https://planetarycomputer.microsoft.com/api/stac/v1/search",gu=120,Su=20*6e4,oa=new Map,It=new Map;function pu(e,t){return JSON.stringify({body:e,...t})}function hu(e){const t=te(e);if(!t)return"";try{return JSON.stringify(t)}catch{return String(t.type||"")}}function vu(e){var n;const t=(n=e==null?void 0:e.properties)==null?void 0:n.datetime;return typeof t!="string"||t.length<10?null:t.slice(0,10)}function fi(e,t){if(e){if(Array.isArray(e)&&typeof e[0]=="number"&&typeof e[1]=="number"){t.push([e[0],e[1]]);return}Array.isArray(e)&&e.forEach(n=>fi(n,t))}}function Cu(e){const t=te(e);if(!t)return null;const n=[];if(fi(t.coordinates,n),!n.length)return null;let a=1/0,r=1/0,i=-1/0,s=-1/0;for(const[l,o]of n)l<a&&(a=l),o<r&&(r=o),l>i&&(i=l),o>s&&(s=o);return[a,r,i,s].every(Number.isFinite)?[a,r,i,s]:null}function Nu(e,t){var c;const n=te(e),a=Cu(e);if(!n&&!a)return null;const r=(t==null?void 0:t.lookbackDays)??gu,i=ne(),s=E(i,r),l=((c=t==null?void 0:t.collections)==null?void 0:c.map(u=>u.trim()).filter(Boolean))??["sentinel-2-l2a"],o={collections:l.length?l:["sentinel-2-l2a"],datetime:`${s}T00:00:00Z/${i}T23:59:59Z`,limit:Math.min(500,Math.max(1,(t==null?void 0:t.limit)??250)),sortby:[{field:"datetime",direction:"desc"}]};return n?o.intersects=n:a&&(o.bbox=a),o}function bu(e){const t=[...new Set(e.map(vu).filter(n=>typeof n=="string"&&n.length>=10))].sort((n,a)=>a.localeCompare(n));return{latestSceneIso:t[0]??null,sceneIsos:t,fetchedAt:Date.now()}}async function wm(e,t){const n=Nu(e,{collections:t==null?void 0:t.collections,lookbackDays:t==null?void 0:t.lookbackDays});if(!n)return{latestSceneIso:null,sceneIsos:[],fetchedAt:Date.now()};const a=t==null?void 0:t.cloudCoverMax,r=pu(n,{cloudCoverMax:a,geomKey:hu(e)}),i=oa.get(r);if(i&&Date.now()<i.expiresAt)return i.catalog;const s=It.get(r);if(s)return s;const l=(async()=>{try{const o=await fetch(mi,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/geo+json"},body:JSON.stringify(n),signal:t==null?void 0:t.signal});if(!o.ok)return{latestSceneIso:null,sceneIsos:[],fetchedAt:Date.now()};const c=await o.json(),u=bu(Array.isArray(c==null?void 0:c.features)?c.features:[]);let d=u.sceneIsos,g,m;if(u.sceneIsos.length){const S=typeof a=="number"&&Number.isFinite(a)?a:100,I=await kc(e,u.sceneIsos,S,{signal:t==null?void 0:t.signal});d=I.sceneIsos.length?I.sceneIsos:u.sceneIsos,g=Object.keys(I.sceneCloudByDate).length?I.sceneCloudByDate:void 0,m=Object.keys(I.sceneClearByDate).length?I.sceneClearByDate:void 0}const f={latestSceneIso:d[0]??null,sceneIsos:d,sceneCloudByDate:g,sceneClearByDate:m,fetchedAt:Date.now()};return oa.set(r,{catalog:f,expiresAt:Date.now()+Su}),f}catch{return{latestSceneIso:null,sceneIsos:[],fetchedAt:Date.now()}}})();It.set(r,l);try{return await l}finally{It.delete(r)}}const ce=256,Eu=160,yu=4,Mu=`//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02", "B03", "B04", "B08", "B11", "SCL", "CLP", "dataMask"] }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  ${hr("s")}
  var dNdvi = s.B08 + s.B04;
  var ndvi = dNdvi > 1e-6 ? (s.B08 - s.B04) / dNdvi : 0;
  var dNdwi = s.B03 + s.B08;
  var ndwi = dNdwi > 1e-6 ? (s.B03 - s.B08) / dNdwi : 0;
  var dNdmi = s.B08 + s.B11;
  var ndmi = dNdmi > 1e-6 ? (s.B08 - s.B11) / dNdmi : 0;
  function enc(v) {
    if (isNaN(v)) return 0;
    return Math.max(0, Math.min(254, Math.round((v + 1) * 127)));
  }
  return [enc(ndvi), enc(ndwi), enc(ndmi), 255];
}`,Au=`//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B03", "B04", "B05", "B08", "B11", "SCL", "CLP", "dataMask"] }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  ${hr("s")}
  var dNdsi = s.B11 + s.B08;
  var ndsi = dNdsi > 1e-6 ? (s.B11 - s.B08) / dNdsi : 0;
  var dNdre = s.B08 + s.B05;
  var ndre = dNdre > 1e-6 ? (s.B08 - s.B05) / dNdre : 0;
  var si = Math.sqrt(Math.max(0, s.B03 * s.B04));
  function enc(v) {
    if (isNaN(v)) return 0;
    return Math.max(0, Math.min(254, Math.round((v + 1) * 127)));
  }
  function enc01(v) {
    if (isNaN(v)) return 0;
    return Math.max(0, Math.min(254, Math.round(v * 254)));
  }
  return [enc(ndsi), enc(ndre), enc01(si), 255];
}`;function Ii(e){const t=String(e||"").replace(/\r\n/g,`
`).trim();return typeof btoa=="function"?btoa(unescape(encodeURIComponent(t))):t}const Du=Ii(Mu),Lu=Ii(Au);function Dn(){return!!Ma().trim()}function gi(e,t){const n=e*2003750834e-2/180,a=Math.log(Math.tan((90+t)*Math.PI/360))/(Math.PI/180)*(2003750834e-2/180);return[n,a]}function Si(e,t){if(e){if(Array.isArray(e)&&typeof e[0]=="number"&&typeof e[1]=="number"){t.push([e[0],e[1]]);return}Array.isArray(e)&&e.forEach(n=>Si(n,t))}}function _u(e){const t=[];if("coordinates"in e&&Si(e.coordinates,t),!t.length)return null;let n=1/0,a=1/0,r=-1/0,i=-1/0;for(const[o,c]of t){const[u,d]=gi(o,c);u<n&&(n=u),d<a&&(a=d),u>r&&(r=u),d>i&&(i=d)}if(![n,a,r,i].every(Number.isFinite))return null;const s=Math.max(8,(r-n)*.02),l=Math.max(8,(i-a)*.02);return[n-s,a-l,r+s,i+l]}function ca(e){if(e.length<2)return e;const t=e[0],n=e[e.length-1];return t[0]===n[0]&&t[1]===n[1]?e:[...e,t]}function ua(e,t){if(e.length<=t)return e;const n=Math.ceil(e.length/t),a=[];for(let s=0;s<e.length;s+=n)a.push(e[s]);const r=e[e.length-1],i=a[a.length-1];return(i[0]!==r[0]||i[1]!==r[1])&&a.push(r),a}function gt(e){return e.map(([t,n])=>{const[a,r]=gi(t,n);return`${a.toFixed(2)} ${r.toFixed(2)}`}).join(", ")}function Bu(e){var t;if(e.type==="Polygon"){const n=(t=e.coordinates)==null?void 0:t[0];if(!Array.isArray(n)||!n.length)return null;const a=ua(ca(n),36);return`POLYGON((${gt(a)}))`}if(e.type==="MultiPolygon"){const n=(e.coordinates||[]).map(r=>{const i=r==null?void 0:r[0];return!Array.isArray(i)||!i.length?null:ua(ca(i),28)}).filter(r=>!!r);return n.length?n.length===1?`POLYGON((${gt(n[0])}))`:`MULTIPOLYGON(${n.map(r=>`((${gt(r)}))`).join(", ")})`:null}return null}function Ru(e,t){const n=document.createElement("canvas");return n.width=e,n.height=t,n}async function da(e,t,n,a){var l;const r=await fetch(e,{headers:{Accept:"image/png"},signal:a});if(!r.ok){const o=await r.text().catch(()=>"");throw new Error(`WMS GetMap failed (${r.status}): ${o.slice(0,160)}`)}const i=await r.blob(),s=await createImageBitmap(i);try{const c=Ru(t,n).getContext("2d");if(!c)throw new Error("Canvas 2D context unavailable.");return c.drawImage(s,0,0,t,n),c.getImageData(0,0,t,n).data}finally{(l=s.close)==null||l.call(s)}}function xu(e){let t=0,n=0,a=0,r=0;for(let i=0;i<e.length;i+=4){const s=e[i],l=e[i+1],o=e[i+2];e[i+3]<128||s===0&&l===0&&o===0||(t+=s/127-1,n+=l/127-1,a+=o/127-1,r+=1)}return r===0?{ndvi:null,ndwi:null,ndmi:null,sampleCount:0}:{ndvi:Number((t/r).toFixed(4)),ndwi:Number((n/r).toFixed(4)),ndmi:Number((a/r).toFixed(4)),sampleCount:r}}function wu(e){let t=0,n=0,a=0,r=Number.POSITIVE_INFINITY,i=Number.NEGATIVE_INFINITY,s=0;for(let c=0;c<e.length;c+=4){const u=e[c],d=e[c+1],g=e[c+2];if(e[c+3]<128)continue;const f=u/127-1;t+=f,n+=d/127-1,a+=g/254,f<r&&(r=f),f>i&&(i=f),s+=1}if(s===0)return{ndsi:null,ndre:null,si:null,ssi:null,ndsiMin:null,ndsiMax:null};const l=Number((t/s).toFixed(4)),o=Number((a/s).toFixed(4));return{ndsi:l,ndre:Number((n/s).toFixed(4)),si:o,ssi:Number((l+o).toFixed(4)),ndsiMin:Number(r.toFixed(4)),ndsiMax:Number(i.toFixed(4))}}async function Tu(e,t,n,a,r){const i={collections:["sentinel-2-l2a"],intersects:e,datetime:`${t.slice(0,10)}T00:00:00Z/${n.slice(0,10)}T23:59:59Z`,limit:500,sortby:[{field:"datetime",direction:"asc"}]},s=await fetch(mi,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(i),signal:r});if(!s.ok){const u=await s.text().catch(()=>"");throw new Error(`Planetary Computer STAC search failed (${s.status}): ${u.slice(0,180)}`)}const l=await s.json(),o=Array.isArray(l.features)?l.features:[];return[...new Set(o.map(u=>{var g;const d=(g=u==null?void 0:u.properties)==null?void 0:g.datetime;return typeof d=="string"&&d.length>=10?d.slice(0,10):null}).filter(u=>!!u))].sort((u,d)=>u.localeCompare(d)).slice(0,Eu)}async function Pu(e,t,n){if(!e.length)return[];const a=new Array(e.length);let r=0;const i=Array.from({length:Math.min(t,e.length)},async()=>{for(;r<e.length;){const s=r++;a[s]=await n(e[s])}});return await Promise.all(i),a}function ma(e){return{status:"OK",data:e.map(t=>({interval:{from:`${t.date}T00:00:00Z`,to:`${ie(t.date,1)}T00:00:00Z`},outputs:{indices:{bands:{ndvi:{stats:{mean:t.ndvi,sampleCount:t.sampleCount,noDataCount:t.ndvi==null?t.sampleCount:0}},ndwi:{stats:{mean:t.ndwi,sampleCount:t.sampleCount,noDataCount:t.ndwi==null?t.sampleCount:0}},ndmi:{stats:{mean:t.ndmi,sampleCount:t.sampleCount,noDataCount:t.ndmi==null?t.sampleCount:0}},ndsi:{stats:{mean:t.ndsi,min:t.ndsiMin??t.ndsi,max:t.ndsiMax??t.ndsi,sampleCount:t.sampleCount,noDataCount:t.ndsi==null?t.sampleCount:0}},ndre:{stats:{mean:t.ndre,sampleCount:t.sampleCount,noDataCount:t.ndre==null?t.sampleCount:0}},si:{stats:{mean:t.si,sampleCount:t.sampleCount,noDataCount:t.si==null?t.sampleCount:0}},ssi:{stats:{mean:t.ssi,sampleCount:t.sampleCount,noDataCount:t.ssi==null?t.sampleCount:0}},savi:{stats:{mean:t.savi,sampleCount:t.sampleCount,noDataCount:t.savi==null?t.sampleCount:0}},evi:{stats:{mean:null,sampleCount:t.sampleCount,noDataCount:t.sampleCount}}}}}}))}}async function Vu(e,t){var G,b,M,y,le;if(!Dn())throw new Error("Sentinel Hub WMS instance is not configured for client-side statistics.");const n=e.input,a=(G=n==null?void 0:n.bounds)==null?void 0:G.geometry;if(!a||typeof a!="object")throw new Error("Statistics request missing input.bounds.geometry.");const r=e.aggregation,i=String(((b=r==null?void 0:r.timeRange)==null?void 0:b.from)||"").slice(0,10),s=String(((M=r==null?void 0:r.timeRange)==null?void 0:M.to)||"").slice(0,10);if(!i||!s)throw new Error("Statistics request missing aggregation.timeRange.");(le=(y=n==null?void 0:n.data)==null?void 0:y[0])==null||le.dataFilter;const l=ur,o=_u(a),c=Bu(a);if(!o)throw new Error("Could not derive WMS bbox from AOI geometry.");const u=nt()||Ut,d=ya(),g=me(Ee()),m=await Tu(a,i,s,null,t);if(!m.length)return ma([]);const[f,S,I,N]=o,h=(_,oe,D)=>{let w=`${d}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${encodeURIComponent(g)}&CRS=EPSG:3857&BBOX=${f},${S},${I},${N}&WIDTH=${ce}&HEIGHT=${ce}&FORMAT=image/png&TRANSPARENT=true&TIME=${_}/${ie(_,1)}&MAXCC=${l}&SHOWLOGO=false&WARNINGS=false&EVALSCRIPT=${encodeURIComponent(oe)}`;return D&&c&&(w+=`&GEOMETRY=${encodeURIComponent(c)}`),ot(w,u)},U=(await Pu(m,yu,async _=>{if(t!=null&&t.aborted)throw new DOMException("The operation was aborted.","AbortError");const oe=async D=>{const[w,Pn]=await Promise.all([da(h(_,Du,D),ce,ce,t),da(h(_,Lu,D),ce,ce,t).catch(()=>null)]),ye=xu(w),Ti=Pn?wu(Pn):{ndsi:null,ndre:null,si:null,ssi:null,ndsiMin:null,ndsiMax:null},Pi=ye.ndvi!=null&&Number.isFinite(ye.ndvi)?Number(((1+.5)*ye.ndvi/(1+.5*Math.abs(ye.ndvi)+1e-6)).toFixed(4)):null;return{date:_,...ye,...Ti,savi:Pi}};try{const D=await oe(!!c);return Cr(vr(_,{clearCount:D.sampleCount,cloudCount:0,maskedCount:0,validCount:D.sampleCount,aoiCloudCoverPct:null,aoiClearCoverPct:D.sampleCount>0?100:null})),D.sampleCount===0&&D.ndsi==null?null:D}catch(D){if(t!=null&&t.aborted)throw D;if(c)try{const w=await oe(!1);return w.sampleCount===0&&w.ndsi==null?null:w}catch(w){if(t!=null&&t.aborted)throw w;return console.warn("[wms-stats-client] scene failed",_,w),null}return console.warn("[wms-stats-client] scene failed",_,D),null}})).filter(_=>!!_).sort((_,oe)=>_.date.localeCompare(oe.date));return ma(U)}const Fu="https://services.sentinel-hub.com/api/v1/statistics",Ou="https://services.sentinel-hub.com/oauth/token",ku="/api/sentinel-hub/statistics",Hu="/api/sentinel-hub/statistics/status";let Oe=null;const $u=6e4;function Ot(e){if(e==null)return!1;if(typeof DOMException<"u"&&e instanceof DOMException&&e.name==="AbortError")return!0;if(e instanceof Error){if(e.name==="AbortError")return!0;const t=e.message.toLowerCase();if(t.includes("aborted")||t.includes("the operation was aborted"))return!0}return!1}function Qe(e){if(e!=null&&e.aborted)throw new DOMException("The operation was aborted.","AbortError")}async function Tm(e){if(!(e!=null&&e.refresh)&&Oe&&Date.now()-Oe.at<$u)return Oe.status;if(!await _n())return null;try{const t=await fetch(Aa(Hu),{headers:{Accept:"application/json"},signal:e==null?void 0:e.signal});if(!t.ok)return null;const n=t.headers.get("content-type")??"";if(n&&!/\bjson\b/i.test(n))return null;const a=await t.json();return!a||typeof a!="object"||typeof a.configured!="boolean"?null:(Oe={status:a,at:Date.now()},a)}catch{return null}}function Wu(e,t,n){if(e&&typeof e=="object"){const r=e;if(typeof r.error=="string"&&r.error.trim())return r.error.trim();if(r.error&&typeof r.error=="object"){const i=r.error;if(typeof i.message=="string"&&i.message.trim())return i.message.trim()}if(typeof r.message=="string"&&r.message.trim())return r.message.trim()}const a=t.trim();return a&&a!=="{}"?a.slice(0,240):n===404?Vn()||Et()?"Sentinel statistics API is not available on this static host — using browser WMS when possible.":"Sentinel Hub statistics API route not found — start the AgroCloud backend (npm run dev).":n===502||n===503?Vn()||Et()?"Backend API unavailable on this deployment.":"AgroCloud backend unavailable — run npm run dev from the repo root (API port 3011).":n===504?"Statistics request timed out — try a shorter date range or fewer fields.":`Sentinel Hub Statistics proxy HTTP ${n}`}const Uu=30;let ke=null;const kt=12*6e4,fa=new Map,St=new Map,pt=new Map,ht=new Map;function pi(){return"".trim()}function hi(){return"".trim()}function vi(e){return e.split(".").length>=3}async function Gu(){const e=nt(),t=pi(),n=hi();if(t&&n){const a=Date.now();if(ke&&ke.expiresAt>a+6e4)return ke.token;const r=new URLSearchParams({grant_type:"client_credentials",client_id:t,client_secret:n}),i=await fetch(Ou,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:r.toString()});if(!i.ok)throw new Error(`Sentinel Hub OAuth failed (${i.status})`);const s=await i.json(),l=String(s.access_token??"").trim();if(!l)throw new Error("Sentinel Hub OAuth returned no access_token");return ke={token:l,expiresAt:a+Math.max(300,Number(s.expires_in)||3600)*1e3},l}if(e&&e!==Ut&&vi(e))return e;throw new Error("Configure Sentinel Hub OAuth (VITE_SENTINEL_HUB_CLIENT_ID/SECRET) or a private access token for field NDVI alerts.")}function Ln(){if(pi()&&hi())return!0;const e=nt();return!e||e===Ut||Gi(e)?!1:vi(e)}function Ci(){return typeof window<"u"&&/(^|\.)eliteagrocloud\.com$/i.test(window.location.hostname)?!!bt():bt()?!0:!Et()}async function _n(){return Ci()?bt()?!0:Ki():!1}function Pm(){return Ln()||Ci()||Dn()}const Ku=`//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["B02", "B03", "B04", "B05", "B08", "B11", "B12", "SCL", "CLP", "dataMask"]
    }],
    output: [
      {
        id: "indices",
        bands: ["ndvi", "ndwi", "ndmi", "evi", "savi", "ci_re", "ndsi", "si", "ssi", "ndre", "msavi", "nbr"],
        sampleType: "FLOAT32"
      },
      {
        id: "dataMask",
        bands: 1
      }
    ]
  };
}
function evaluatePixel(samples) {
  var scl = Math.round(samples.SCL);
  var cloud = ${Sr.replace(/s\./g,"samples.")};
  var dNdvi = samples.B08 + samples.B04;
  var ndvi = dNdvi > 1e-6 ? (samples.B08 - samples.B04) / dNdvi : NaN;
  var dNdwi = samples.B03 + samples.B08;
  var ndwi = dNdwi > 1e-6 ? (samples.B03 - samples.B08) / dNdwi : NaN;
  var dNdmi = samples.B08 + samples.B11;
  var ndmi = dNdmi > 1e-6 ? (samples.B08 - samples.B11) / dNdmi : NaN;
  var eviDen = samples.B08 + 6.0 * samples.B04 - 7.5 * samples.B02 + 1.0;
  var evi = eviDen > 1e-6 ? 2.5 * (samples.B08 - samples.B04) / eviDen : NaN;
  var L = 0.5;
  var saviDen = samples.B08 + samples.B04 + L;
  var savi = saviDen > 1e-6 ? (samples.B08 - samples.B04) / saviDen * (1.0 + L) : NaN;
  var ci_re = samples.B08 > 1e-6 ? samples.B05 / samples.B08 - 1 : NaN;
  var dNdsi = samples.B11 + samples.B08;
  var ndsi = dNdsi > 1e-6 ? (samples.B11 - samples.B08) / dNdsi : NaN;
  var si = Math.sqrt(Math.max(0, samples.B03 * samples.B04));
  var ssi = (isFinite(ndsi) ? ndsi : 0) + si;
  var dNdre = samples.B08 + samples.B05;
  var ndre = dNdre > 1e-6 ? (samples.B08 - samples.B05) / dNdre : NaN;
  var nir = samples.B08;
  var red = samples.B04;
  var msaviInner = Math.max(0, Math.pow(2.0 * nir + 1.0, 2) - 8.0 * (nir - red));
  var msavi = (2.0 * nir + 1.0 - Math.sqrt(msaviInner)) / 2.0;
  var dNbr = samples.B08 + samples.B12;
  var nbr = dNbr > 1e-6 ? (samples.B08 - samples.B12) / dNbr : NaN;
  var valid = samples.dataMask && !cloud && (dNdvi > 1e-6 || dNdsi > 1e-6 || dNdmi > 1e-6);
  return {
    indices: [ndvi, ndwi, ndmi, evi, savi, ci_re, ndsi, si, ssi, ndre, msavi, nbr],
    dataMask: [valid ? 1 : 0]
  };
}`,Yu=`//VERSION=3
function setup() {
  return {
    input: [{
      bands: ["B02", "B03", "B04", "B05", "B08", "B11", "B12", "dataMask"]
    }],
    output: [
      {
        id: "indices",
        bands: ["ndvi", "ndwi", "ndmi", "evi", "savi", "ci_re", "ndsi", "si", "ssi", "ndre", "msavi", "nbr"],
        sampleType: "FLOAT32"
      },
      {
        id: "dataMask",
        bands: 1
      }
    ]
  };
}
function evaluatePixel(samples) {
  var dNdvi = samples.B08 + samples.B04;
  var ndvi = dNdvi > 1e-6 ? (samples.B08 - samples.B04) / dNdvi : NaN;
  var dNdwi = samples.B03 + samples.B08;
  var ndwi = dNdwi > 1e-6 ? (samples.B03 - samples.B08) / dNdwi : NaN;
  var dNdmi = samples.B08 + samples.B11;
  var ndmi = dNdmi > 1e-6 ? (samples.B08 - samples.B11) / dNdmi : NaN;
  var eviDen = samples.B08 + 6.0 * samples.B04 - 7.5 * samples.B02 + 1.0;
  var evi = eviDen > 1e-6 ? 2.5 * (samples.B08 - samples.B04) / eviDen : NaN;
  var L = 0.5;
  var saviDen = samples.B08 + samples.B04 + L;
  var savi = saviDen > 1e-6 ? (samples.B08 - samples.B04) / saviDen * (1.0 + L) : NaN;
  var ci_re = samples.B08 > 1e-6 ? samples.B05 / samples.B08 - 1 : NaN;
  var dNdsi = samples.B11 + samples.B08;
  var ndsi = dNdsi > 1e-6 ? (samples.B11 - samples.B08) / dNdsi : NaN;
  var si = Math.sqrt(Math.max(0, samples.B03 * samples.B04));
  var ssi = (isFinite(ndsi) ? ndsi : 0) + si;
  var dNdre = samples.B08 + samples.B05;
  var ndre = dNdre > 1e-6 ? (samples.B08 - samples.B05) / dNdre : NaN;
  var nir = samples.B08;
  var red = samples.B04;
  var msaviInner = Math.max(0, Math.pow(2.0 * nir + 1.0, 2) - 8.0 * (nir - red));
  var msavi = (2.0 * nir + 1.0 - Math.sqrt(msaviInner)) / 2.0;
  var dNbr = samples.B08 + samples.B12;
  var nbr = dNbr > 1e-6 ? (samples.B08 - samples.B12) / dNbr : NaN;
  var valid = samples.dataMask && (dNdvi > 1e-6 || dNdsi > 1e-6 || dNdmi > 1e-6);
  return {
    indices: [ndvi, ndwi, ndmi, evi, savi, ci_re, ndsi, si, ssi, ndre, msavi, nbr],
    dataMask: [valid ? 1 : 0]
  };
}`,Xu=`//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B08", "B11", "SCL", "dataMask"] }],
    output: [
      { id: "indices", bands: ["ndsi"], sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(samples) {
  var scl = samples.SCL;
  var cloud = (scl == 3 || scl == 8 || scl == 9 || scl == 10 || scl == 11);
  if (!samples.dataMask || cloud) return { indices: [NaN], dataMask: [0] };
  var d = samples.B11 + samples.B08;
  if (d <= 1e-6) return { indices: [NaN], dataMask: [0] };
  return { indices: [(samples.B11 - samples.B08) / d], dataMask: [1] };
}`,zu=`//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B08", "B11", "dataMask"] }],
    output: [
      { id: "indices", bands: ["ndsi"], sampleType: "FLOAT32" },
      { id: "dataMask", bands: 1 }
    ]
  };
}
function evaluatePixel(samples) {
  if (!samples.dataMask) return { indices: [NaN], dataMask: [0] };
  var d = samples.B11 + samples.B08;
  if (d <= 1e-6) return { indices: [NaN], dataMask: [0] };
  return { indices: [(samples.B11 - samples.B08) / d], dataMask: [1] };
}`;function Ia(e,t){if(e.length<=t)return e;const n=Math.ceil(e.length/t),a=[];for(let s=0;s<e.length;s+=n)a.push(e[s]);const r=e[e.length-1],i=a[a.length-1];return(i[0]!==r[0]||i[1]!==r[1])&&a.push(r),a}function dt(e){if(!e)return null;if(e.type==="Polygon"){const t=e.coordinates[0];return t!=null&&t.length?{type:"Polygon",coordinates:[Ia(t,36)]}:null}if(e.type==="MultiPolygon"){const t=e.coordinates.map(n=>{const a=n==null?void 0:n[0];return a!=null&&a.length?[Ia(a,28)]:null}).filter(Boolean);return t.length?{type:"MultiPolygon",coordinates:t}:null}return e}function Ni(e){const t=e==null?void 0:e.from;return typeof t!="string"||t.length<10?null:t.slice(0,10)}function ju(e,t,n){var g,m,f,S;const a=(S=(f=(m=(g=e==null?void 0:e.outputs)==null?void 0:g[t])==null?void 0:m.bands)==null?void 0:f[n])==null?void 0:S.stats,r=a==null?void 0:a.mean;if(typeof r!="number"||!Number.isFinite(r))return null;const i=(a==null?void 0:a.sampleCount)??0,s=(a==null?void 0:a.noDataCount)??0;if(i>0&&i===s)return null;const l=Number(Iu(r,Math.max(1,i)).toFixed(4)),o=typeof(a==null?void 0:a.min)=="number"&&Number.isFinite(a.min)?a.min:l,c=typeof(a==null?void 0:a.max)=="number"&&Number.isFinite(a.max)?a.max:l,u=Number(Math.min(o,c).toFixed(4)),d=Number(Math.max(o,c).toFixed(4));return{min:u,max:d,mean:l}}function B(e,t){return ju(e,"indices",t)}function qu(){return{indices:{statistics:{ndvi:{},ndwi:{},ndmi:{},evi:{},savi:{},ci_re:{},ndsi:{},si:{},ssi:{},ndre:{}}}}}function Zu(){return{indices:{statistics:{ndsi:{}}}}}function Ju(e){const t=(e!=null&&e.length?e:["NDVI"]).map(n=>n.trim().toUpperCase());return t.length===1&&t[0]==="NDSI"?"snow-ndsi":"multi"}function Vm(e){return(e??[]).some(t=>t.trim().toUpperCase()==="NDSI")}function Qu(e){if(!Array.isArray(e.data))return[];const t=[];for(const n of e.data){const a=Ni(n.interval);if(!a)continue;const r=B(n,"ndvi"),i=B(n,"ndmi"),s=B(n,"ndwi"),l=B(n,"evi"),o=B(n,"savi"),c=B(n,"ci_re"),u=B(n,"ndsi"),d=B(n,"si"),g=B(n,"ssi"),m=B(n,"ndre"),f=B(n,"msavi"),S=B(n,"nbr"),I={};r&&(I.ndvi=r),i&&(I.ndmi=i),s&&(I.ndwi=s),l&&(I.evi=l),o&&(I.savi=o),c&&(I.ciRe=c),u&&(I.ndsi=u),d&&(I.si=d),g&&(I.ssi=g),m&&(I.ndre=m),f&&(I.msavi=f),S&&(I.nbr=S),t.push({date:a,ndvi:(r==null?void 0:r.mean)??null,ndwi:(s==null?void 0:s.mean)??null,ndmi:(i==null?void 0:i.mean)??null,evi:(l==null?void 0:l.mean)??null,savi:(o==null?void 0:o.mean)??null,ciRe:(c==null?void 0:c.mean)??null,ndsi:(u==null?void 0:u.mean)??null,si:(d==null?void 0:d.mean)??null,ssi:(g==null?void 0:g.mean)??null,ndre:(m==null?void 0:m.mean)??null,msavi:(f==null?void 0:f.mean)??null,nbr:(S==null?void 0:S.mean)??null,zonal:Object.keys(I).length?I:void 0})}return t.sort((n,a)=>n.date.localeCompare(a.date)),t}function Fm(e,t){var r;const n=t.trim().slice(0,10),a=e.find(i=>i.date===n);return!((r=a==null?void 0:a.zonal)!=null&&r.ndvi)||!a.zonal.ndmi||!a.zonal.ndwi?null:{sceneDate:a.date,ndvi:a.zonal.ndvi,ndmi:a.zonal.ndmi,ndwi:a.zonal.ndwi,evi:a.zonal.evi??{min:a.zonal.ndvi.min,max:a.zonal.ndvi.max,mean:a.zonal.ndvi.mean},ciRe:a.zonal.ciRe}}function Om(e){return e.some(t=>t.ndvi!=null||t.ndwi!=null||t.ndmi!=null||t.ndsi!=null||t.si!=null||t.ssi!=null||t.ndre!=null||t.evi!=null||t.savi!=null||t.ciRe!=null)}function km(...e){const t=new Map;for(const n of e)for(const a of n){const r=t.get(a.date);if(!r){t.set(a.date,a);continue}t.set(a.date,{date:a.date,ndvi:a.ndvi??r.ndvi,ndwi:a.ndwi??r.ndwi,ndmi:a.ndmi??r.ndmi,evi:a.evi??r.evi,savi:a.savi??r.savi,ciRe:a.ciRe??r.ciRe,ndsi:a.ndsi??r.ndsi,si:a.si??r.si,ssi:a.ssi??r.ssi,ndre:a.ndre??r.ndre,zonal:a.zonal??r.zonal})}return[...t.values()].sort((n,a)=>n.date.localeCompare(a.date))}function ga(e,t,n=8){const a=t.trim();return[...new Set(e.map(r=>r.trim().slice(0,10)).filter(Boolean))].filter(r=>r<=a).sort((r,i)=>i.localeCompare(r)).slice(0,n)}async function bi(e,t){var s;Qe(t);const n=await Gu();Qe(t);const a=await fetch(Fu,{method:"POST",headers:{Authorization:`Bearer ${n}`,"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(e),signal:t}),r=await a.text();let i;try{i=JSON.parse(r)}catch{throw new Error(r.slice(0,240)||`Sentinel Hub Statistics HTTP ${a.status}`)}if(!a.ok)throw new Error(((s=i.error)==null?void 0:s.message)||r.slice(0,240)||`Sentinel Hub Statistics HTTP ${a.status}`);return i}async function Ei(e,t){Qe(t);const n=await fetch(Aa(ku),{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(e),signal:t}),a=await n.text();let r;try{r=JSON.parse(a)}catch{throw new Error(a.slice(0,240)||`Sentinel Hub Statistics proxy HTTP ${n.status}`)}if(!n.ok){const i=Wu(r,a,n.status);throw n.status===404&&i.includes("Route not found")?new Error("Sentinel Hub statistics API route is unavailable — restart the AgroCloud backend (npm run dev:clean)."):new Error(i)}return r}async function Bn(e,t){const n=JSON.stringify(e),a=fa.get(n);if(a&&Date.now()<a.expiresAt)return a.data;const r=St.get(n);if(r)return r;const i=(async()=>{const s=l=>{const o=Qu(l);return fa.set(n,{data:o,expiresAt:Date.now()+kt}),o};if(Ln())try{const l=await bi(e,t);return s(l)}catch(l){if(Ot(l)||t!=null&&t.aborted)throw l}if(await _n())try{const l=await Ei(e,t);return s(l)}catch(l){if(Ot(l)||t!=null&&t.aborted)throw l}if(Dn()){const l=await Vu(e,t);return s(l)}throw new Error("Configure Sentinel Hub OAuth (VITE_SENTINEL_HUB_CLIENT_ID/SECRET) or a private access token for field NDVI alerts.")})();St.set(n,i);try{return await i}finally{St.delete(n)}}async function ed(e,t,n){if(!e.length)return[];const a=new Array(e.length);let r=0;const i=Array.from({length:Math.min(t,e.length)},async()=>{for(;r<e.length;){const s=r++;a[s]=await n(e[s],s)}});return await Promise.all(i),a}function Rn(e,t,n,a){const r=Ju(a==null?void 0:a.layerIds),i=a==null?void 0:a.relaxedCloudMask,s=r==="snow-ndsi"?i?zu:Xu:i?Yu:Ku,l=r==="snow-ndsi"?Zu():qu();return{input:{bounds:{geometry:e,properties:{crs:"http://www.opengis.net/def/crs/EPSG/0/4326"}},data:[{type:"sentinel-2-l2a",dataFilter:{mosaickingOrder:"leastCC",maxCloudCoverage:(a==null?void 0:a.maxCloudCoverage)??65}}]},aggregation:{timeRange:{from:`${t}T00:00:00Z`,to:`${n}T00:00:00Z`},aggregationInterval:{of:"P1D"},evalscript:s,resx:10,resy:10},calculations:l}}async function Sa(e,t,n){const a=dt(e);if(!a)return null;const r=t.trim().slice(0,10),i=ie(r,1),s=await Bn(Rn(a,r,i,n),n==null?void 0:n.signal);return s.find(l=>l.date===r)??s[0]??null}async function Hm(e){const t=e.sceneDates.slice(0,8);return t.length?(await ed(t,4,async a=>{var r;if((r=e==null?void 0:e.signal)!=null&&r.aborted)return null;try{let i=await Sa(e.geometry,a,{maxCloudCoverage:e.maxCloudCoverage??90,relaxedCloudMask:!1,signal:e==null?void 0:e.signal});if((!i||i.ndvi==null)&&(i=await Sa(e.geometry,a,{maxCloudCoverage:95,relaxedCloudMask:!0,signal:e==null?void 0:e.signal})),i&&(i.ndvi!=null||i.ndwi!=null||i.ndmi!=null))return i}catch{}return null})).filter(a=>a!=null).sort((a,r)=>a.date.localeCompare(r.date)):[]}async function $m(e){if(!(e!=null&&e.geometry))return[];const t=dt(e.geometry);if(!t)return[];const n=e.lookbackDays??Uu,a=ne(),r=ie(a,1),i=E(a,n);return Bn(Rn(t,i,r,{maxCloudCoverage:e.maxCloudCoverage,relaxedCloudMask:e.relaxedCloudMask}),e==null?void 0:e.signal)}async function Wm(e){if(!(e!=null&&e.geometry))return[];const t=dt(e.geometry);if(!t)return[];const n=String(e.fromIso||"").trim().slice(0,10),a=String(e.toIso||"").trim().slice(0,10);if(!n||!a||a<n)return[];const r=ie(a,1);return Bn(Rn(t,n,r,{maxCloudCoverage:e.maxCloudCoverage,relaxedCloudMask:e.relaxedCloudMask,layerIds:e.layerIds}),e==null?void 0:e.signal)}function Um(e,t,n){const a=e.find(i=>i.date===t.trim());if(!a)return null;const r=a[n];return typeof r=="number"&&Number.isFinite(r)?r:null}function td(e,t){var a,r,i;return((i=(r=(a=e==null?void 0:e.outputs)==null?void 0:a[t])==null?void 0:r.bands)==null?void 0:i[t])??null}function pa(e,t){var a;if(!Array.isArray(e.data))return[];const n=[];for(const r of e.data){const i=Ni(r.interval);if(!i)continue;const s=td(r,t),l=s==null?void 0:s.histogram,o=((l==null?void 0:l.bins)??[]).map(c=>({lowEdge:Number(c.lowEdge),highEdge:Number(c.highEdge),count:Number(c.count)||0})).filter(c=>Number.isFinite(c.lowEdge)&&Number.isFinite(c.highEdge));n.push({date:i,bins:o,overflow:Number(l==null?void 0:l.overflow)||0,underflow:Number(l==null?void 0:l.underflow)||0,sampleCount:Number((a=s==null?void 0:s.stats)==null?void 0:a.sampleCount)||0})}return n}function nd(e){const t=Math.max(10,e.resolutionMeters??10);return{input:{bounds:{geometry:e.geom,properties:{crs:"http://www.opengis.net/def/crs/EPSG/0/4326"}},data:[{type:"sentinel-2-l2a",dataFilter:{mosaickingOrder:"leastCC",maxCloudCoverage:e.maxCloudCoverage??65}}]},aggregation:{timeRange:{from:`${e.fromIso}T00:00:00Z`,to:`${e.toIso}T00:00:00Z`},aggregationInterval:{of:e.aggregationIntervalOf||"P1D"},evalscript:e.evalscript,resx:t,resy:t},calculations:{[e.outputId]:{histograms:{[e.outputId]:{bins:e.binEdges}},statistics:{[e.outputId]:{}}}}}}async function ad(e,t,n){Qe(n);const a=JSON.stringify(e),r=pt.get(a);if(r&&Date.now()<r.expiresAt)return r.data;if(!n){const s=ht.get(a);if(s)return s}const i=(async()=>{let s;if(Ln())try{const l=await bi(e,n);return s=pa(l,t),pt.set(a,{data:s,expiresAt:Date.now()+kt}),s}catch(l){if(Ot(l)||n!=null&&n.aborted)throw l}if(await _n()){const l=await Ei(e,n);return s=pa(l,t),pt.set(a,{data:s,expiresAt:Date.now()+kt}),s}throw new Error("Configure Sentinel Hub OAuth (VITE_SENTINEL_HUB_CLIENT_ID/SECRET) or a private access token for class-area statistics.")})();n||ht.set(a,i);try{return await i}finally{n||ht.delete(a)}}function Ht(e){return e.bins.reduce((n,a)=>n+(Number(a.count)||0),0)+(Number(e.overflow)||0)+(Number(e.underflow)||0)}function rd(e,t){const n=Date.parse(`${e}T00:00:00Z`),a=Date.parse(`${t}T00:00:00Z`);return!Number.isFinite(n)||!Number.isFinite(a)?0:Math.abs(n-a)/864e5}function id(e,t){if(!e.length)return null;const n=e.find(i=>i.date===t);if(n&&Ht(n)>0)return n;let a=null,r=-1;for(const i of e){const s=Ht(i);if(s<=0)continue;const l=s-rd(i.date,t);l>r&&(r=l,a=i)}return a??n??e[0]??null}async function Gm(e){const t=dt(e.geometry);if(!t||e.binEdges.length<2)return null;const n=e.sceneDate.trim().slice(0,10);if(!n)return null;const a=Math.max(0,Math.round(e.searchWindowDays??0)),r=a>0?E(n,a):n,i=ie(n,1),s=e.mosaicAcrossWindow===!0&&a>0,l=s?`P${a+1}D`:"P1D",o=await ad(nd({geom:t,fromIso:r,toIso:i,evalscript:e.evalscript,outputId:e.outputId,binEdges:e.binEdges,maxCloudCoverage:e.maxCloudCoverage,resolutionMeters:e.resolutionMeters,aggregationIntervalOf:l}),e.outputId,e.signal);return s?o.find(c=>Ht(c)>0)??o[0]??null:a>0?id(o,n):o.find(c=>c.date===n)??o[0]??null}const fe="Sentinel Live",sd=21;function ue(e,t){const n=ee(e.trim()).getTime(),a=ee(t.trim()).getTime();return!Number.isFinite(n)||!Number.isFinite(a)?0:Math.round(Math.abs(n-a)/864e5)}function He(e,t){const n=e.find(a=>a.date===t.trim());return!n||n.ndvi==null&&n.ndwi==null&&n.ndmi==null?null:n}function ld(e){return e.filter(t=>t.ndvi!=null||t.ndwi!=null||t.ndmi!=null).map(t=>t.date).sort((t,n)=>n.localeCompare(t))}function vt(e,t){const n=e.trim(),a=(t==null?void 0:t.trim())||null;return a?a===n?{summary:`Requested Date: ${n} · Used Date: ${a}`,reason:null}:{summary:`Requested Date: ${n} · Used Date: ${a} (Latest Valid Scene)`,reason:"No Sentinel data available for current date"}:{summary:`Requested Date: ${n} · Used Date: —`,reason:"No Sentinel data available for current date"}}function Km(e){var l;const t=e.userRequestedDate.trim(),n=e.fetchDate.trim(),a=((l=e.latestSceneIso)==null?void 0:l.trim())||null,r=ne();let i="verified",s=null;return n!==t&&(i="scene-mismatch",s=`⚠️ Analysis Based on Older Imagery (Image ${n}, selected ${t})`),e.autoFollowImagery!==!1&&a&&n<a&&ue(n,a)>0&&(i="scene-mismatch",s=`⚠️ Analysis Based on Older Imagery (Image ${n}, latest ${a})`),a&&ue(n,a)>sd&&(i="outdated",s=`⚠️ Data Outdated (Image ${n}, latest ${a})`),{userRequestedDate:t,imageDate:n,analysisDate:r,latestSceneDate:a,dataSource:fe,quality:i,warningMessage:s}}function Ym(e,t,n,a,r){var m;if(n.quality==="outdated")return{imageDate:null,sensingDate:null,analysisDate:n.analysisDate,requestedDate:t.trim(),dataSource:"Unavailable",dataQuality:"outdated",liveVerified:!1,warningMessage:n.warningMessage,dataReason:"Sentinel imagery is outdated for this field"};const i=t.trim(),s=(f,S,I)=>{const N=vt(i,f);let h=n.warningMessage;return N.summary&&(h=h?`${h} · ${N.summary}`:N.summary),{imageDate:f,sensingDate:f,analysisDate:n.analysisDate,requestedDate:i,dataSource:fe,dataQuality:S?n.quality:"scene-mismatch",liveVerified:!0,warningMessage:h,dataReason:N.reason,adaptiveResolution:I}},l=ld(e);if(r!=null&&r.preferLatestAvailable&&l.length){const f=l[0];if(He(e,f)){const I=f===i,N=I?{requestedDate:i,resolvedDate:f,fallbackUsed:!1,fallbackDays:0,direction:"exact"}:{requestedDate:i,resolvedDate:f,fallbackUsed:!0,fallbackDays:ue(i,f),direction:f<i?"backward":"forward"};return s(f,I,N)}}const o=wa(e,t,r==null?void 0:r.catalogSceneIsos);let c=o.resolvedDate,u=c?He(e,c):null;if(!u&&!l.length&&((m=r==null?void 0:r.catalogSceneIsos)!=null&&m.length)){const f=r.catalogSceneIsos.map(I=>I.trim().slice(0,10)).filter(Boolean),S=Mt(t,f);S.resolvedDate&&(c=S.resolvedDate)}if(!l.length||!c){const f=ga((r==null?void 0:r.catalogSceneIsos)??[],i,1)[0];if(f){const I={requestedDate:i,resolvedDate:f,fallbackUsed:f!==i,fallbackDays:ue(i,f),direction:f<i?"backward":"forward"};return s(f,f===i,I)}const S=vt(i,null);return{imageDate:null,sensingDate:null,analysisDate:n.analysisDate,requestedDate:i,dataSource:fe,dataQuality:"scene-mismatch",liveVerified:!0,warningMessage:S.summary,dataReason:S.reason,adaptiveResolution:o}}if(u=He(e,c),u||(c=l[0],u=He(e,c)),!u||!c){const f=ga((r==null?void 0:r.catalogSceneIsos)??[],i,1)[0];if(f){const I={requestedDate:i,resolvedDate:f,fallbackUsed:f!==i,fallbackDays:ue(i,f),direction:f<i?"backward":"forward"};return s(f,f===i,I)}const S=vt(i,null);return{imageDate:null,sensingDate:null,analysisDate:n.analysisDate,requestedDate:i,dataSource:fe,dataQuality:"scene-mismatch",liveVerified:!0,warningMessage:S.summary,dataReason:S.reason,adaptiveResolution:o}}const d=c===i,g=d?o:{requestedDate:i,resolvedDate:c,fallbackUsed:!0,fallbackDays:ue(i,c),direction:c<i?"backward":"forward"};return s(c,d,g)}function ha(e){switch(e){case"increasing":return"Increasing (7–30 days)";case"decreasing":return"Slight Decrease (7 days)";default:return"Stable (7–30 days)"}}function yi(e){return{ndviChangePct2:(e==null?void 0:e.ndviChangePct2)??0,ndviMean3:(e==null?void 0:e.ndviMean3)??null,ndviSceneDates:(e==null?void 0:e.scenes.map(t=>t.date))??[],ndviSceneValues:(e==null?void 0:e.scenes.map(t=>t.ndvi))??[]}}function od(e){if(e.scenes.length<2)return!1;for(let t=0;t<e.scenes.length-1;t++)if(e.scenes[t].ndvi>=e.scenes[t+1].ndvi)return!1;return!0}function cd(e){const t=e.scenes.slice(1);return t.length?t.reduce((n,a)=>n+a.ndvi,0)/t.length:null}function Mi(e,t,n){const a=oi(li({NDVI:e,NDMI:t.ndmi,NDWI:t.ndwi},n));return si(a)?{status:"no-crop-activity",explanation:Kc(a).interpretation}:null}function Ai(e,t,n,a){const r=li({NDVI:t,NDMI:n.ndmi,NDWI:n.ndwi},a),i=oi(r);return(e==="healthy"||e==="growing"||e==="harvest-approaching")&&!Gc(t,r,i)?{status:t<.25?"water-stress":"watch",explanation:"NDVI alone is insufficient — no active crop growth pattern in recent scenes."}:{status:e}}function ud(e){const{current:t,series:n,settings:a}=e,r=[],i=yi(n),s=(n==null?void 0:n.ndviCurrent)??t.ndvi,l=t.ndwi,o=t.ndmi,c=i.ndviSceneValues,u=Mi(s,t,c);if(u)return{status:u.status,severity:"normal",alertTypes:[],...i,reasonLines:[`NDVI current = ${s.toFixed(2)}`,`NDWI current = ${l.toFixed(2)}`,`NDMI current = ${o.toFixed(2)}`],explanation:u.explanation,trendLabel:"No crop activity"};const d=l<.1,g=o<.2,m=l<.15,f=o<.25,S=[`NDVI current = ${s.toFixed(2)}`,`NDWI current = ${l.toFixed(2)}`,`NDMI current = ${o.toFixed(2)}`];let I="healthy",N="normal",h="Crop indices stable at latest scene — no intervention needed.";s<.05?(I="no-vegetation",N="critical",h="Bare soil or no viable vegetation at latest scene."):s<.2?(I=d&&g?"bare-soil":"critical",N=d&&g?"warning":"critical",h="Very low vegetation vigor at latest scene.",a.alertTypes["crop-stress"]&&r.push("crop-stress")):s<.35&&(m||f)?(I="water-stress",N="high",h="Low NDVI with dry moisture signature at latest scene.",a.alertTypes["water-stress"]&&r.push("water-stress"),a.alertTypes["irrigation-required"]&&r.push("irrigation-required")):s<.25?(I="water-stress",N="high",h="High crop stress — low NDVI at latest scene.",a.alertTypes["crop-stress"]&&r.push("crop-stress")):s<.4?(I="watch",N="warning",h="Early vigor concern — monitor field (latest scene).",a.alertTypes["crop-stress"]&&r.push("crop-stress")):s<.6?(I="healthy",N="normal",h="Moderate canopy health at latest scene.",s>=.35&&s<.55&&m&&f&&(I="watch",N="warning",h="Moderate NDVI but low moisture — possible irrigation need.",a.alertTypes["irrigation-required"]&&r.push("irrigation-required"))):s<.75?(I="growing",N="normal",h="Strong vegetation vigor at latest scene.",a.alertTypes["vegetation-recovery"]&&r.push("vegetation-recovery")):(I="harvest-approaching",N="normal",h="Peak canopy maturity at latest scene.",a.alertTypes["harvest-readiness"]&&r.push("harvest-readiness"));const L=Ai(I,s,t,c);return I=L.status,L.explanation&&(h=L.explanation),{status:I,severity:N,alertTypes:r,...i,reasonLines:S,explanation:h,trendLabel:"Latest scene only"}}function dd(e){const{current:t,trend:n,seasonalPeakNdvi:a,series:r,settings:i}=e,s=[],l=yi(r),o=(r==null?void 0:r.ndviCurrent)??t.ndvi,c=l.ndviMean3,u=l.ndviChangePct2,d=(r==null?void 0:r.scenes.length)??0,g=l.ndviSceneValues,m=Mi(o,t,g);if(m)return{status:m.status,severity:"normal",alertTypes:[],...l,reasonLines:[`NDVI current = ${o.toFixed(2)}`],explanation:m.explanation,trendLabel:"No crop activity"};const f=t.ndwi<.1,S=t.ndmi<.2,I=Math.max(a,c??0,o),N=I-o,h=c!=null&&c>.05?Number(((o-c)/c*100).toFixed(1)):0,L=r?od(r):!1,U=r?cd(r):null,G=[];c!=null&&G.push(`NDVI mean (3 scenes) = ${c.toFixed(2)}`),G.push(`NDVI current = ${o.toFixed(2)}`),d>=2&&G.push(`NDVI change (latest vs previous) = ${u}%`),c!=null&&h!==0&&G.push(`Current vs mean = ${h>0?"+":""}${h}%`),G.push(`Trend: ${ha(n)}`);let b="healthy",M="normal",y="No significant temporal change detected.";u<=-20?(b="critical",M="critical",i.alertTypes["crop-stress"]&&s.push("crop-stress"),i.alertTypes["drought-risk"]&&s.push("drought-risk"),y="Severe NDVI decline vs previous scene — urgent field action."):u<=-15&&f&&S&&n==="decreasing"?(b="critical",M="critical",i.alertTypes["crop-stress"]&&s.push("crop-stress"),i.alertTypes["drought-risk"]&&s.push("drought-risk"),y="Sharp NDVI drop with moisture stress signature."):I>=.6&&N>=.12&&(u<=-15||L)&&n==="decreasing"&&!(f&&S)?(b="harvest-detected",M="warning",i.alertTypes["harvest-readiness"]&&s.push("harvest-readiness"),y="Sharp NDVI drop after peak — harvest likely started."):o<.15&&n==="decreasing"&&N>=.2?(b="harvest-completed",M="normal",i.alertTypes["harvest-readiness"]&&s.push("harvest-readiness"),y="Post-harvest bare soil signature after seasonal peak."):u<=-10&&u>-20||(f||S)&&u<-5&&n!=="increasing"||L&&u<=-10?(b="water-stress",M="high",i.alertTypes["water-stress"]&&s.push("water-stress"),i.alertTypes["irrigation-required"]&&s.push("irrigation-required"),y="Gradual NDVI decline (10–20%) — possible water or crop stress."):u<=-5&&u>-10||h<=-5&&h>-10||L&&u<0&&u>-10?(b="watch",M="warning",i.alertTypes["crop-stress"]&&s.push("crop-stress"),y="Early gradual NDVI decline — monitor without urgent intervention."):n==="increasing"&&u>=5&&o<.65?(b="growing",M="normal",i.alertTypes["vegetation-recovery"]&&s.push("vegetation-recovery"),y="Active vegetation recovery — NDVI rising vs prior scene."):u>=10&&n==="increasing"?(b="growing",M="normal",i.alertTypes["vegetation-recovery"]&&s.push("vegetation-recovery"),y="Strong NDVI improvement vs previous scene."):o>=.72&&o>=I-.05&&u<=0&&u>=-8&&n!=="increasing"?(b="harvest-approaching",M="normal",i.alertTypes["harvest-readiness"]&&s.push("harvest-readiness"),y="NDVI near seasonal peak with stable temporal pattern."):U!=null&&o>=U-.02&&u>=-5?(b="healthy",M=va(o),y="NDVI stable relative to recent Sentinel scenes."):u<=-5?(b="watch",M="warning",y="Minor NDVI drift vs previous scene — keep monitoring.",i.alertTypes["crop-stress"]&&s.push("crop-stress")):(b="healthy",M=va(o),y="Temporal indices within normal range — no significant change.");const le=Ai(b,o,t,g);return b=le.status,le.explanation&&(y=le.explanation),{status:b,severity:M,alertTypes:s,...l,reasonLines:G,explanation:y,trendLabel:ha(n)}}function md(e){return e.settings.analysisMode==="change-detection"?dd(e):ud(e)}function fd(e,t){const n=t.reasonLines.slice(0,3).join(" · ");return`${e}: ${t.explanation}${n?` (${n})`:""}`}const Di="si_crop_alert_engine_v1",Li="si_crop_alert_results_v6",Id="si-crop-alert-cache-updated",et=2,gd={schemaVersion:et,enabled:!0,indices:{NDVI:!0,NDWI:!0,NDMI:!0,EVI:!1},alertTypes:{"crop-stress":!0,"water-stress":!0,"drought-risk":!0,"disease-risk":!1,"harvest-readiness":!0,"irrigation-required":!0,"vegetation-recovery":!0},refreshMinutes:5},Xm={healthy:"#aeea00",growing:"#2e7d32",watch:"#ffeb3b","water-stress":"#ff9800",critical:"#d32f2f","harvest-approaching":"#1b5e20","harvest-detected":"#1b5e20","harvest-completed":"#9e9e9e","no-vegetation":"#d32f2f","bare-soil":"#d32f2f"},Sd={healthy:"Healthy",growing:"Growing",watch:"Watch","water-stress":"Stress",critical:"Critical","harvest-approaching":"Harvest Ready","harvest-detected":"Harvest Ready","harvest-completed":"Post-Harvest","no-vegetation":"Critical","bare-soil":"Critical"},pd=":si-layer-defaults-v2";function zm(e){const t=(e==null?void 0:e.engineKey)??Di,n=`${t}${pd}`,a=()=>Ge({enabled:!1,showLegend:!1});if(typeof window>"u")return a();try{const r=window.localStorage.getItem(t);if(!r){const s=a();return Ct(s,{engineKey:t}),window.localStorage.setItem(n,"1"),s}let i=Ge(JSON.parse(r));return(i.schemaVersion??1)<et&&(i=Ge({...i,schemaVersion:et})),window.localStorage.getItem(n)||(i={...i,enabled:!1,showLegend:!1},window.localStorage.setItem(n,"1")),Ct(i,{engineKey:t}),i}catch{const r=a();return Ct(r,{engineKey:t}),r}}function Ct(e,t){if(typeof window>"u"||!window.localStorage)return;const n=(t==null?void 0:t.engineKey)??Di;try{window.localStorage.setItem(n,JSON.stringify(e))}catch{}}function Ge(e){const t=gd;return{schemaVersion:e.schemaVersion??t.schemaVersion,enabled:e.enabled!==void 0?!!e.enabled:t.enabled,aoiMode:e.aoiMode==="builder"?"builder":"agro-default",indices:{...t.indices,...e.indices??{}},alertTypes:{...t.alertTypes,...e.alertTypes??{}},notifyInApp:e.notifyInApp!==!1,notifyEmail:!!e.notifyEmail,notifySms:!!e.notifySms,notifyPush:!!e.notifyPush,refreshMinutes:Math.min(60,Math.max(1,Number(e.refreshMinutes)||t.refreshMinutes)),showLegend:e.showLegend!==!1}}function jm(e){return Ge({...e??{},enabled:!0,showLegend:!0,aoiMode:"agro-default",schemaVersion:et})}function qm(e,t,n){var r;const a=(n==null?void 0:n.resultsKey)??Li;if(typeof window>"u")return null;try{const i=window.localStorage.getItem(a);if(!i)return null;const s=JSON.parse(i);if(!s||typeof s!="object"||!Array.isArray(s.results)||!s.results.length)return null;const l=String(s.referenceDate??"").trim();if(!l||e!=null&&e.trim()&&l!==e.trim())return null;const o=String(s.userRequestedDate??((r=s.imageryContext)==null?void 0:r.userRequestedDate)??"").trim();return t!=null&&t.trim()&&o&&o!==t.trim()?null:{referenceDate:l,userRequestedDate:o||l,imageryContext:s.imageryContext??{userRequestedDate:o||l,imageDate:l,analysisDate:l,latestSceneDate:null,dataSource:fe,quality:"verified",warningMessage:null},results:s.results,lastRunAt:Number(s.lastRunAt)||0,liveFieldCount:Number(s.liveFieldCount)||0}}catch{return null}}function Zm(e,t){if(typeof window>"u"||!window.localStorage)return;const n=(t==null?void 0:t.resultsKey)??Li;try{window.localStorage.setItem(n,JSON.stringify(e)),window.dispatchEvent(new CustomEvent(Id,{detail:{resultsKey:n}}))}catch{}}function Jm(e,t,n,a){if(!(e!=null&&e.results.length)||e.referenceDate.trim()!==t.trim()||a!=null&&a.trim()&&e.userRequestedDate.trim()!==a.trim())return!1;const r=Math.max(1,n)*6e4;return Date.now()-e.lastRunAt<r}function $t(e){let t=2166136261;for(let n=0;n<e.length;n++)t^=e.charCodeAt(n),t=Math.imul(t,16777619);return(t>>>0)/4294967295}function Y(e){return Math.max(-.2,Math.min(.95,Number(e.toFixed(3))))}function hd(e,t,n){const a=new Date(`${t}T12:00:00`).getTime(),r=Math.floor((a-new Date(new Date(a).getFullYear(),0,0).getTime())/864e5),i=Math.sin(r/365*Math.PI*2-Math.PI/2),s=$t(`${e}|NDVI|${t}`),l=$t(`${e}|canopy|${n}`),o=/pivot/i.test(n),c=.06+l*.8+(o?.1:0),u=Math.max(0,i*.1),d=(s-.5)*.06;return Y(Math.min(.92,c+u+d))}function xn(e,t,n){const a=$t(`${t}|coh|${n}`),r=Y(e),i=Y(.76+r*.44+(a-.5)*.03),s=Number((i-1).toFixed(4));return r<.12?{ndvi:r,ndmi:Y(r*.25+(a-.5)*.03),ndwi:Y(r*.15+(a-.5)*.02),evi:Y(r*.85),ciRe:s}:{ndvi:r,ndmi:Y(.06+r*.42+(a-.5)*.05),ndwi:Y(.03+r*.25+(a-.5)*.04),evi:Y(r*1.05),ciRe:s}}function vd(e,t,n,a){return Ae(e,n,a).ndvi}function Ae(e,t,n){const a=hd(e,t,n);return xn(a,e,t)}function tt(e,t){const n=Math.max(Math.abs(t),.05);return Number(((e-t)/n*100).toFixed(1))}function va(e){return e>.75||e>=.6?"normal":e>=.4?"warning":e>=.2?"high":"critical"}function _i(e,t,n){const a=e-t,r=e-n;return a>.03&&r>.02?"increasing":a<-.03&&r<-.02?"decreasing":Math.abs(a)<=.02&&Math.abs(r)<=.03?"stable":a>=0?"increasing":"decreasing"}function Cd(e,t){let n=0;for(let a=0;a<30;a++){const r=E(t,a),i=vd(e,"NDVI",r,"");i>n&&(n=i)}return n}function Nd(e,t,n,a){const r=E(t,5),i=Ae(e.fieldKey,r,e.structureType),s=[{date:t,ndvi:n.ndvi,ndwi:n.ndwi,ndmi:n.ndmi},{date:r,ndvi:i.ndvi,ndwi:i.ndwi,ndmi:i.ndmi},{date:E(t,12),ndvi:a.ndvi,ndwi:a.ndwi,ndmi:a.ndmi}],l=s.reduce((o,c)=>o+c.ndvi,0)/s.length;return{scenes:s,currentDate:t,ndviCurrent:n.ndvi,ndviMean3:Number(l.toFixed(4)),ndviDelta2:Number((n.ndvi-i.ndvi).toFixed(4)),ndviChangePct2:tt(n.ndvi,i.ndvi),ndwiCurrent:n.ndwi,ndmiCurrent:n.ndmi,anchorDate:t,requestedDate:t,fallbackUsed:!1}}function Ca(e,t,n,a){return e!=null&&e.scenes.length?e.scenes.map(r=>{const i=n==="ndmi"?r.ndmi:r.ndwi;if(i!=null&&Number.isFinite(i))return i;const s=xn(r.ndvi,t,r.date);return n==="ndmi"?s.ndmi:s.ndwi}):a.map(r=>r[n]).filter(r=>Number.isFinite(r))}function bd(e,t,n,a){const r=a==null?void 0:a.imagery,i=(r==null?void 0:r.analysisDate)??t,s=(a==null?void 0:a.ndviSeries)??null,l=(a==null?void 0:a.current)??Ae(e.fieldKey,t,e.structureType),o=(a==null?void 0:a.previous7)??Ae(e.fieldKey,E(t,7),e.structureType),c=(a==null?void 0:a.previous30)??Ae(e.fieldKey,E(t,30),e.structureType),u=(a==null?void 0:a.trend)??_i(l.ndvi,o.ndvi,c.ndvi),d=(a==null?void 0:a.seasonalPeakNdvi)??Cd(e.fieldKey,t),g=s??Nd(e,t,l,o),m=md({current:l,trend:u,seasonalPeakNdvi:d,series:g,settings:n}),f={ndvi:m.ndviChangePct2,ndwi:tt(l.ndwi,o.ndwi),ndmi:tt(l.ndmi,o.ndmi)},S=Ui({farmName:e.farmName,farmCode:e.farmCode,objectId:e.objectId,structureType:e.structureType}),I=Sd[m.status],N=fd(S,m),h=(r==null?void 0:r.imageDate)??g.currentDate??t,L=ou(l,o,s),U=lu(l,L);return{...e,current:l,previous7:o,previous30:c,deltaPct:f,trend:u,seasonalPeakNdvi:d,status:m.status,severity:m.severity,alertTypes:m.alertTypes,title:I,message:N,evaluatedAt:h,imageDate:h,requestedDate:(r==null?void 0:r.requestedDate)??t,usedDate:h,analysisDate:i,dataSource:(r==null?void 0:r.dataSource)??fe,dataQuality:(r==null?void 0:r.dataQuality)??"verified",dataWarning:(r==null?void 0:r.warningMessage)??null,dataReason:(r==null?void 0:r.dataReason)??null,liveVerified:!0,ndviMean3:m.ndviMean3,ndviSceneDates:m.ndviSceneDates,ndviSceneValues:m.ndviSceneValues,ndmiSceneValues:Ca(g,e.fieldKey,"ndmi",[l,o,c]),ndwiSceneValues:Ca(g,e.fieldKey,"ndwi",[l,o,c]),ndviChangePct2:m.ndviChangePct2,ndviTrendLabel:m.trendLabel,alertReasonLines:m.reasonLines,alertExplanation:m.explanation,chasCurrent:U.chasCurrent,chasPrevious:U.chasPrevious,deltaChas:U.deltaChas,chasPreviousSnapshot:U.previousSnapshot??void 0,layerLiveZonal:a==null?void 0:a.layerLiveZonal}}function Qm(e){var n;if(!((n=e==null?void 0:e.features)!=null&&n.length))return[];const t=[];for(let a=0;a<e.features.length;a++){const r=e.features[a];if((r==null?void 0:r.type)!=="Feature"||!r.geometry)continue;const i=r.properties??{};if(!Vi(i))continue;const s=Fi(r,a),l=Ed(r.geometry);l&&t.push({fieldKey:s,objectId:String(i.OBJECTID??i.objectid??i.FID??a),farmName:Wi(i),farmCode:$i(i),structureType:Hi(i)||String(i.Structure_Type??""),country:ki(i)||"Unknown",city:Oi(i),centroid:l,geometry:r.geometry})}return t}function Ed(e){const t=e;if(!t||typeof t!="object")return null;if(t.type==="Point"&&Array.isArray(t.coordinates)&&t.coordinates.length>=2){const[i,s]=t.coordinates;if(Number.isFinite(i)&&Number.isFinite(s))return[i,s]}if(t.type==="Polygon")return Na(t.coordinates);if(t.type==="MultiPolygon"){const i=t.coordinates;let s=null,l=0;for(const o of i){const c=Na(o),u=Math.abs(yd(o[0]??[]));c&&u>=l&&(l=u,s=c)}return s}const n=[];if(Bi(e==null?void 0:e.coordinates,n),!n.length)return null;let a=0,r=0;for(const[i,s]of n)a+=i,r+=s;return[a/n.length,r/n.length]}function yd(e){if(e.length<3)return 0;let t=0;for(let n=0;n<e.length-1;n++){const[a,r]=e[n],[i,s]=e[n+1];t+=a*s-i*r}return t*.5}function Md(e){if(e.length<3)return null;let t=0,n=0,a=0;for(let r=0;r<e.length-1;r++){const[i,s]=e[r],[l,o]=e[r+1],c=i*o-l*s;t+=c,n+=(i+l)*c,a+=(s+o)*c}return t*=.5,Math.abs(t)<1e-14?null:[n/(6*t),a/(6*t)]}function Na(e){const t=e[0];return t!=null&&t.length?Md(t):null}function Bi(e,t){if(e){if(Array.isArray(e)&&typeof e[0]=="number"&&typeof e[1]=="number"){t.push([e[0],e[1]]);return}Array.isArray(e)&&e.forEach(n=>Bi(n,t))}}function ef(e,t,n,a){return e.map(r=>bd(r,t,n,a==null?void 0:a.get(r.fieldKey)))}function Ad(){return{date:"2026-06-10",ndvi:.6,ndmi:.3,ndwi:.2,evi:.55,ndre:.4,savi:.5,ciRe:.12,ndsi:.1,si:.15,ssi:.25,ndii:.3}}const Dd=new Set(["VRI","CCI","EPD","EHD"]);function Ri(e){const t=e.trim().toUpperCase();if(!t||lt(t))return!1;if(sn(t)||ve(t)||W(t)||X(t)||Dd.has(t))return!0;if(x(t)){const r=un(t);return r!=null&&Ri(r)}const n=Ad(),a=xi(t,n);return a!=null&&Number.isFinite(a)}function tf(e){const t=typeof e=="number"?e:Number(e);if(!Number.isFinite(t))return String(e??"");if(Object.is(t,-0))return"0";const n=Math.abs(t);if(n===0)return"0";if(n>=1e3)return Math.round(t).toLocaleString("en-US");if(n>=100)return String(Math.round(t));if(n>=10){const r=Math.round(t*10)/10;return Number.isInteger(r)?String(r):r.toFixed(1)}const a=Math.round(t*1e3)/1e3;return String(Number(a.toFixed(3)))}function Ld(){return ai(El([]),Ri)}function nf(){return yl(Ld())}const Wt=["#14b8a6","#38bdf8","#a3e635","#f472b6","#fb923c","#c084fc","#facc15","#60a5fa","#4ade80"];function v(e){return e!=null&&Number.isFinite(e)?e:null}function _d(e,t){const n=Date.parse(`${e.slice(0,10)}T12:00:00Z`),a=Date.parse(`${t.slice(0,10)}T12:00:00Z`);return!Number.isFinite(n)||!Number.isFinite(a)?Number.POSITIVE_INFINITY:Math.abs(a-n)/864e5}function Bd(e){const t=v(e.ndvi),n=v(e.ndmi),a=v(e.ndwi),r=v(e.ndsi),i=v(e.si),s=v(e.ndre),l=v(e.evi),o=v(e.ssi)??(r!=null&&i!=null?r+i:null),c=v(e.savi)??(t!=null?at(t):null),u=v(e.ciRe);return t==null&&n==null&&a==null&&r==null&&i==null&&s==null&&l==null&&c==null?null:{ndvi:t??NaN,ndmi:n??NaN,ndwi:a??NaN,savi:c??NaN,ci_re:u??NaN,ndsi:r??NaN,si:i??NaN,ssi:o??NaN,ndre:s??NaN,evi:l??NaN}}function Rd(e,t){try{const a=new Function("ndvi","ndmi","ndwi","savi","ci_re","ndsi","si","ssi","ndre","evi","Math",`"use strict"; return (${e});`)(t.ndvi,t.ndmi,t.ndwi,t.savi,t.ci_re,t.ndsi,t.si,t.ssi,t.ndre,t.evi,Math);return typeof a=="number"&&Number.isFinite(a)?a:null}catch{return null}}function wn(e,t){const n=e.trim().toUpperCase();if(W(n)||X(n)||x(n)||n==="PRECIP"||n==="CHIRPS"||n==="RAINFALL"||n==="PRECIPITATION")return null;if(n==="NDSI")return v(t.ndsi);if(lt(n))return v(t.ndvi)!=null||v(t.ndmi)!=null||v(t.ndwi)!=null||v(t.evi)!=null?1:0;if(n==="SI")return v(t.si);if(n==="SSI"){const i=v(t.ssi);if(i!=null)return i;const s=v(t.ndsi),l=v(t.si);return s!=null&&l!=null?s+l:null}if(n==="NDRE")return v(t.ndre);const a=Bd(t);switch(n){case"NDVI":return v(t.ndvi);case"NDMI":return v(t.ndmi);case"NDII":return v(t.ndii)??v(t.ndmi);case"NDWI":return v(t.ndwi);case"SAVI":return(a==null?void 0:a.savi)!=null&&Number.isFinite(a.savi)?a.savi:null;case"EVI":return v(t.evi);case"ET":{const i=v(t.ndmi);let s=v(t.ndwi);if(i==null||(s==null&&(s=Math.max(-.2,Math.min(.45,i*.85))),!Number.isFinite(s)))return null;const l=v(t.ndvi);return _l(i,s,{sceneDate:t.date,ndvi:l})}case"LST":{const i=v(t.ndvi),s=v(t.ndmi);return i==null||s==null?null:kl(i,s,{sceneDate:t.date})}case"CHAS":case"CHAS_ALERT":{const i=De(ns(t));return Number.isFinite(i)?i:null}}if(!a||!Nl(n))return null;const r=dn(n);return r?Rd(r,a):null}function xi(e,t){const n=e.trim().toUpperCase();return x(n)||W(n)||X(n)?null:wn(n,t)}function xd(e,t){const n=e.trim().toUpperCase();if(W(n))return t.some(r=>{const i=v(r.ndvi),s=v(r.ndmi);return i!=null&&s!=null});if(X(n))return t.some(r=>v(r.ndvi)!=null&&v(r.ndmi)!=null);const a=x(n)?un(n)??n:n;return t.some(r=>{const i=wn(a,r);return i!=null&&Number.isFinite(i)})}function af(e,t){return e.length?(t.length?t:["NDVI"]).every(a=>xd(a,e)):!1}function rf(e,t){if(!e.length)return!1;const n=t.map(l=>l.trim().toUpperCase()).filter(Boolean),a=n.some(l=>l==="NDSI"||l==="SSI"),r=n.some(l=>l==="SI"||l==="SSI"),i=n.some(l=>l==="NDRE"||l==="CGI"||l==="CVI"||l==="CHS"||l==="CMI"||l==="HRI"||l==="CCI"||l==="EHD"||l==="DCGI"||l==="DCVI"||l==="DCHS"||l==="DCMI"||l==="DHRI"),s=n.some(l=>l==="EVI"||l==="PRI"||l==="CGI"||l==="CVI"||l==="CHS"||l==="CMI"||l==="CCI"||l==="EPD"||l==="DPRI"||l==="DCGI"||l==="DCVI"||l==="DCHS"||l==="DCMI");return!!(a&&!e.some(l=>l.ndsi!=null&&Number.isFinite(l.ndsi))||r&&!e.some(l=>l.si!=null&&Number.isFinite(l.si))||i&&!e.some(l=>l.ndre!=null&&Number.isFinite(l.ndre))||s&&!e.some(l=>l.evi!=null&&Number.isFinite(l.evi))||n.some(W)&&!e.some(l=>l.ndre!=null&&Number.isFinite(l.ndre)))}function sf(e,t){var s;const n=new Map(t.map(l=>[l.date.slice(0,10),l])),a=[],r=[],i=[];for(const l of e){const o=l.slice(0,10),c=n.get(o),u=(s=c==null?void 0:c.zonal)==null?void 0:s.ndsi,d=c?xi("NDSI",c):null;a.push(d!=null&&Number.isFinite(d)?d:null),r.push((u==null?void 0:u.min)!=null&&Number.isFinite(u.min)?u.min:d),i.push((u==null?void 0:u.max)!=null&&Number.isFinite(u.max)?u.max:d)}return{mean:a,min:r,max:i}}function $(e,t,n,a){var i;const r=[];for(const s of t){const l=(i=e.get(s))==null?void 0:i.find(c=>c.date===n);if(!l)continue;const o=wn(a,l);o!=null&&Number.isFinite(o)&&r.push(o)}return r.length?r.reduce((s,l)=>s+l,0)/r.length:null}function wd(e,t,n){var r;const a=[];for(const i of t){const s=(r=e.get(i))==null?void 0:r.find(u=>u.date===n);if(!s)continue;const l=v(s.ndvi),o=v(s.ndmi);if(l==null||o==null)continue;const c=v(s.ndre)??l;a.push(ds(l,o,c))}return a.length?a.reduce((i,s)=>i+s,0)/a.length:null}function Td(e,t,n){var r;const a=[];for(const i of t){const s=(r=e.get(i))==null?void 0:r.find(c=>c.date===n);if(!s)continue;const l=v(s.ndvi),o=v(s.ndmi);l==null||o==null||a.push(.7*l+.3*o)}return a.length?a.reduce((i,s)=>i+s,0)/a.length:null}function Nt(e){if(e.length<2)return e.length===1?1:0;const t=e.reduce((r,i)=>r+i,0)/e.length;if(Math.abs(t)<1e-6)return 0;const n=e.reduce((r,i)=>r+(i-t)**2,0)/e.length,a=Math.sqrt(Math.max(0,n));return Math.max(0,Math.min(1,1-a/Math.abs(t)))}function Pd(e,t,n){const a=n.map(o=>$(e,t,o,"NDVI")),r=a.filter(o=>o!=null&&Number.isFinite(o));if(r.length<2)return{labels:n,values:n.map(()=>NaN)};const i=Math.min(...r),l=Math.max(...r)-i;return l<1e-6?{labels:n,values:n.map((o,c)=>a[c]!=null?.5:NaN)}:{labels:n,values:a.map(o=>o==null||!Number.isFinite(o)?NaN:Number(((o-i)/l).toFixed(4)))}}function Vd(e,t,n){const r=n.map(o=>$(e,t,o,"NDVI")),i=n.map(o=>$(e,t,o,"NDRE")),s=n.map(o=>$(e,t,o,"EVI")),l=[];for(let o=0;o<n.length;o++){const c=Math.max(0,o-8+1),u=r.slice(c,o+1).filter(h=>h!=null&&Number.isFinite(h)),d=i.slice(c,o+1).filter(h=>h!=null&&Number.isFinite(h)),g=s.slice(c,o+1).filter(h=>h!=null&&Number.isFinite(h));if(!u.length&&!d.length&&!g.length){l.push(NaN);continue}const m=Nt(u),f=Nt(d.length?d:u),S=Nt(g.length?g:u),I=Math.max(0,Math.min(1,u.length/8)),N=.4*m+.3*f+.2*S+.1*I;l.push(Number(N.toFixed(4)))}return{labels:n,values:l}}function Fd(e,t,n){const a=n.map(l=>$(e,t,l,"PRI")),r=n.map(l=>$(e,t,l,"NDVI"));let i=!1;const s=[];for(let l=0;l<n.length;l++){const o=a[l],c=r[l],u=l>0?r[l-1]:null,d=c!=null&&u!=null&&c>u;if(!i&&o!=null&&o>=.45&&d&&(i=!0),o==null&&c==null){s.push(NaN);continue}s.push(i?1:0)}return{labels:n,values:s}}function Od(e,t,n){const a=n.map(l=>$(e,t,l,"HRI")),r=n.map(l=>$(e,t,l,"NDVI"));let i=!1;const s=[];for(let l=0;l<n.length;l++){const o=a[l],c=r[l],u=l>0?r[l-1]:null,d=c!=null&&u!=null&&c<u;if(!i&&o!=null&&o>=.7&&d&&(i=!0),o==null&&c==null){s.push(NaN);continue}s.push(i?1:0)}return{labels:n,values:s}}function kd(e,t,n){const a=n.trim().toUpperCase(),r=new Set;for(const l of t)for(const o of e.get(l)??[])r.add(o.date);const i=[...r].sort(),s=[];if(W(a)){const l=i.map(o=>wd(e,t,o));for(let o=0;o<i.length;o++){const c=l[o];if(c==null||!Number.isFinite(c)){s.push(NaN);continue}const u=[];for(let S=0;S<o;S++){const I=l[S];I==null||!Number.isFinite(I)||_d(i[S],i[o])>Ba||u.push(I)}if(u.length<1){s.push(NaN);continue}const d=u.reduce((S,I)=>S+I,0)/u.length,g=u.length>=2?u.reduce((S,I)=>S+(I-d)**2,0)/u.length:0,m=Math.sqrt(Math.max(0,g)),f=ms(c,d,m);s.push(Number.isFinite(f)?Number(f.toFixed(4)):NaN)}return{labels:i,values:s}}if(X(a)){let l=null;for(const o of i){const c=Td(e,t,o);if(c==null||!Number.isFinite(c)){s.push(NaN);continue}s.push(l==null?NaN:Number((c-l).toFixed(4))),l=c}return{labels:i,values:s}}if(x(a)){const l=un(a);if(!l)return{labels:i,values:i.map(()=>NaN)};let o=null;for(const c of i){const u=$(e,t,c,l);if(u==null||!Number.isFinite(u)){s.push(NaN);continue}s.push(o==null?NaN:Number((u-o).toFixed(4))),o=u}return{labels:i,values:s}}if(a==="VRI")return Pd(e,t,i);if(a==="CCI")return Vd(e,t,i);if(a==="EPD")return Fd(e,t,i);if(a==="EHD")return Od(e,t,i);for(const l of i){const o=$(e,t,l,a);s.push(o??NaN)}return{labels:i,values:s}}function lf(e,t){const n=new Map;for(let a=0;a<e.length;a++){const r=e[a],i=t[a];if(i==null||!Number.isFinite(i))continue;const s=Number(r.slice(0,4));if(!Number.isFinite(s))continue;const l=r.slice(5);n.has(s)||n.set(s,{labels:[],values:[]});const o=n.get(s);o.labels.push(l),o.values.push(i)}return[...n.entries()].sort(([a],[r])=>a-r).map(([a,r])=>({year:a,...r}))}function of(){return Wt}function cf(e){return Wt[e%Wt.length]}function Hd(e){const t=new Date(`${e.slice(0,10)}T12:00:00Z`);if(Number.isNaN(t.getTime()))return e.slice(0,10);const n=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-n);const a=t.getUTCFullYear(),r=new Date(Date.UTC(a,0,1)),i=Math.ceil(((t.getTime()-r.getTime())/864e5+1)/7);return`${a}-W${String(i).padStart(2,"0")}`}function wi(e,t){const n=e.trim().slice(0,10);return n?t==="day"?n:t==="month"?n.slice(0,7):t==="year"?n.slice(0,4):Hd(n):""}function $d(e,t){return t==="day"||t==="month"||t==="year"?e:e.replace("-W"," W")}function Wd(e,t,n){const a=e.trim().slice(0,10),r=t.trim().slice(0,10);if(!a||!r||a>r)return[];if(n==="year"){const l=[];for(let o=Number(a.slice(0,4));o<=Number(r.slice(0,4));o+=1)l.push(String(o));return l}if(n==="month"){const l=[];let o=Number(a.slice(0,4)),c=Number(a.slice(5,7));const u=Number(r.slice(0,4)),d=Number(r.slice(5,7));for(;o<u||o===u&&c<=d;)l.push(`${o}-${String(c).padStart(2,"0")}`),c+=1,c>12&&(c=1,o+=1);return l}if(n==="week"){const l=new Set,o=[];let c=a;for(;c<=r;){const u=wi(c,"week");u&&!l.has(u)&&(l.add(u),o.push(u));const d=new Date(`${c}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1),c=d.toISOString().slice(0,10)}return o}const i=[];let s=a;for(;s<=r;){i.push(s);const l=new Date(`${s}T12:00:00Z`);l.setUTCDate(l.getUTCDate()+1),s=l.toISOString().slice(0,10)}return i}function uf(e){const t=Wd(e.fromDate,e.toDate,e.aggregation);if(e.aggregation!=="day")return t;const n=new Set([...e.observedPeriodKeys??[]].map(a=>a.trim().slice(0,10)).filter(Boolean));return n.size?t.filter(a=>n.has(a)):t}function df(e,t,n){if(!e.length||!t.length)return{labels:[],displayLabels:[],series:[],periodAnchorDate:new Map};if(n==="day")return{labels:[...e],displayLabels:[...e],series:t.map(l=>({layerId:l.layerId,values:[...l.values],label:l.label,color:l.color,valueUnit:l.valueUnit})),periodAnchorDate:new Map(e.map(l=>[l,l]))};const a=new Map,r=[];for(let l=0;l<e.length;l+=1){const o=e[l],c=wi(o,n);if(!c)continue;a.has(c)||(a.set(c,{dates:[],layerValues:new Map}),r.push(c));const u=a.get(c);u.dates.push(o);for(const d of t){const g=d.values[l];if(g==null||!Number.isFinite(g))continue;const m=u.layerValues.get(d.layerId)??[];m.push(g),u.layerValues.set(d.layerId,m)}}r.sort((l,o)=>{const c=a.get(l).dates.sort()[0]??l,u=a.get(o).dates.sort()[0]??o;return c.localeCompare(u)});const i=new Map;for(const l of r){const o=[...a.get(l).dates].sort();i.set(l,o[o.length-1]??l)}const s=t.map(l=>({layerId:l.layerId,label:l.label,color:l.color,valueUnit:l.valueUnit,values:r.map(o=>{const c=a.get(o).layerValues.get(l.layerId)??[];return sn(l.layerId)?c.length?c.reduce((u,d)=>u+d,0):NaN:Tn(c)??NaN})}));return{labels:r,displayLabels:r.map(l=>$d(l,n)),series:s,periodAnchorDate:i}}function mf(e,t,n){const a=[...new Set(n.map(o=>o.trim().toUpperCase()).filter(Boolean))];if(!a.length)return{labels:[],series:[]};const r=a.map(o=>({layerId:o,...kd(e,t,o)})),i=new Set;for(const o of r)for(const c of o.labels)i.add(c);const s=[...i].sort(),l=r.map(o=>{const c=new Map(o.labels.map((u,d)=>[u,o.values[d]]));return{layerId:o.layerId,values:s.map(u=>{const d=c.get(u);return d!=null&&Number.isFinite(d)?d:NaN})}});return{labels:s,series:l}}function Ud(e,t){if(!e.length||!t.length)return{labels:[],series:[]};const n=[];for(let a=0;a<e.length;a++)t.some(i=>{const s=i.values[a];return s!=null&&Number.isFinite(s)})&&n.push(a);return n.length?{labels:n.map(a=>e[a]),series:t.map(a=>({layerId:a.layerId,values:n.map(r=>a.values[r]),label:a.label,color:a.color,valueUnit:a.valueUnit}))}:{labels:[],series:t.map(a=>({layerId:a.layerId,values:[],label:a.label,color:a.color,valueUnit:a.valueUnit}))}}function ff(e,t){var a;const n=Ud(e,[{layerId:"L",values:t}]);return{labels:n.labels,values:((a=n.series[0])==null?void 0:a.values)??[]}}function If(e,t,n,a){if(!e.length||!t.length)return{labels:[],series:[]};const r=n.trim().slice(0,10),i=a.trim().slice(0,10);if(!r||!i||r>i)return{labels:[],series:t.map(l=>({layerId:l.layerId,values:[],label:l.label,color:l.color,valueUnit:l.valueUnit}))};const s=[];for(let l=0;l<e.length;l++){const o=String(e[l]??"").slice(0,10);o>=r&&o<=i&&s.push(l)}return s.length?{labels:s.map(l=>e[l]),series:t.map(l=>({layerId:l.layerId,values:s.map(o=>l.values[o]??null),label:l.label,color:l.color,valueUnit:l.valueUnit}))}:{labels:[],series:t.map(l=>({layerId:l.layerId,values:[],label:l.label,color:l.color,valueUnit:l.valueUnit}))}}function gf(e,t=90){const n=e.slice(0,10),a=new Date(`${n}T12:00:00Z`);return a.setUTCDate(a.getUTCDate()-t),{from:a.toISOString().slice(0,10),to:n}}function Gd(e){return e.filter(t=>t!=null&&Number.isFinite(t))}function Tn(e){const t=Gd(e);return t.length?t.reduce((n,a)=>n+a,0)/t.length:null}function Kd(e,t){const n=new Map;for(let r=0;r<e.length;r++){const i=t[r];if(i==null||!Number.isFinite(i))continue;const s=String(e[r]??"").slice(0,7);if(!s)continue;const l=n.get(s)??[];l.push(i),n.set(s,l)}const a=[...n.entries()].sort((r,i)=>r[0].localeCompare(i[0]));return{labels:a.map(([r])=>r),values:a.map(([,r])=>Tn(r)??0)}}function Sf(e,t){return t.length?t.length===1?Kd(e,t[0].values):{labels:t.map(n=>n.label||n.layerId),values:t.map(n=>Tn(n.values)??0)}:{labels:[],values:[]}}function pf(e,t){const n=[];for(let a=0;a<e.length;a++){const r=t[a];if(r==null||!Number.isFinite(r))continue;const i=Date.parse(`${e[a]}T12:00:00Z`);Number.isFinite(i)&&n.push({x:i,y:r})}return n}const ba=.015;function Yd(e,t,n){const a=[];for(let r=0;r<e.length;r++){const i=t[r],s=n[r];i==null||s==null||!Number.isFinite(i)||!Number.isFinite(s)||a.push({x:i,y:s,date:e[r]})}return a}function Xd(e){const t=e.filter(S=>Number.isFinite(S.x)&&Number.isFinite(S.y));if(t.length<2)return null;const n=t.length,a=t.reduce((S,I)=>S+I.x,0),r=t.reduce((S,I)=>S+I.y,0),i=t.reduce((S,I)=>S+I.x*I.y,0),s=t.reduce((S,I)=>S+I.x*I.x,0),l=t.reduce((S,I)=>S+I.y*I.y,0),o=n*s-a*a;if(Math.abs(o)<1e-12)return null;const c=(n*i-a*r)/o,u=(r-c*a)/n,d=l-r*r/n,g=t.reduce((S,I)=>{const N=c*I.x+u;return S+(I.y-N)**2},0),m=d>1e-12?Math.max(0,Math.min(1,1-g/d)):0,f=c>=0?Math.sqrt(m):-Math.sqrt(m);return{slope:c,intercept:u,r:f,r2:m,n}}function zd(e,t){if(!t.length)return[];const n=t.map(c=>c.x),a=Math.min(...n),r=Math.max(...n),i=r-a,s=i>0?i*.06:Math.max(Math.abs(a)*.05,.02),l=a-s,o=r+s;return[{x:l,y:e.slope*l+e.intercept},{x:o,y:e.slope*o+e.intercept}]}function jd(e){const t=Math.abs(e.r);if(t<.15)return{strength:"none",direction:"none",label:"No clear relationship"};const n=t>=.7?"strong":t>=.4?"moderate":"weak",a=e.r>=ba?"positive":e.r<=-ba?"negative":"none";return{strength:n,direction:a,label:`${n==="strong"?"Strong":n==="moderate"?"Moderate":"Weak"} ${a==="positive"?"Positive":a==="negative"?"Negative":"Neutral"} Relationship`}}function Ea(e,t){return`${e.trim().toUpperCase()}|${t.trim().toUpperCase()}`}function qd(e,t,n,a){var g,m;const r=Ea(e,t),i=Ea(t,e),s=Math.round(a.r2*100),{strength:l,direction:o}=n,c={"NDVI|NDMI":{positive:l==="strong"?"Canopy vigor and canopy moisture index move together — uniform crop health with limited decoupled water stress across the field.":"Vegetation greenness and moisture index generally rise together — biomass gains align with canopy water status.",negative:"Biomass increases while canopy moisture falls — early water-stress decoupling; review irrigation scheduling before yield loss."},"NDVI|NDWI":{positive:"Surface water / canopy water signal tracks vegetation density — healthy transpiration balance supports productivity.",negative:"Higher NDVI with lower NDWI suggests moisture deficit under active canopy — prioritize targeted irrigation or scouting."},"NDVI|LST":{negative:"Canopy cooling: greener vegetation coincides with lower land-surface temperature — expected when cover shades and transpires.",positive:"Vegetation and surface heat rise together — may indicate sparse cover, senescent canopy, or soil-dominated pixels."},"NDVI|CHAS":{positive:"Integrated crop health score rises with NDVI — Sentinel layers agree on improving agronomic condition.",negative:"Vegetation index improves while composite health score weakens — check nutrient, pest, or moisture constraints not captured by NDVI alone."},"NDMI|NDWI":{positive:"Canopy moisture and water index co-vary — consistent hydrological status across the parcel.",negative:"Moisture indices diverge — possible canopy stress, drainage heterogeneity, or mixed crop stages within the AOI."}},u=((g=c[r])==null?void 0:g[o==="none"?"positive":o])??((m=c[i])==null?void 0:m[o==="none"?"positive":o]);if(u)return u;if(l==="none")return`${t} does not explain a stable share of ${e} variation in this window — treat layers independently for management decisions.`;const d=o==="negative"?"inverse coupling":o==="positive"?"co-movement":"mixed coupling";return`${t} explains ~${s}% of ${e} variance (R²=${a.r2.toFixed(3)}) — ${d} may drive productivity swings in this period.`}function Zd(e,t,n,a){const r=Math.round(n.r2*100);return`GIS · r=${n.r.toFixed(3)} · R²=${n.r2.toFixed(3)} (${r}%) · n=${n.n} scenes · slope ${n.slope.toFixed(4)} Δ${t}/Δ${e} · ${a.label}`}function Jd(e,t,n,a){return`Agro · ${qd(e,t,a,n)}`}function hf(e,t,n,a,r){const i=Yd(e,n,r),s=Xd(i);if(!s)return null;const l=jd(s);return{xLayerId:t,yLayerId:a,points:i,regression:s,relationship:l,gisInsight:Zd(t,a,s,l),agroInsight:Jd(t,a,s,l),regressionLine:zd(s,i)}}export{ui as $,cf as A,hf as B,pf as C,of as D,sn as E,hl as F,Ke as G,km as H,Wm as I,Mm as J,Bm as K,p0 as L,cm as M,Sc as N,fm as O,wi as P,$d as Q,qm as R,Hr as S,Zm as T,gc as U,nu as V,tu as W,Jc as X,au as Y,zi as Z,Mn as _,C0 as a,nn as a$,Qc as a0,Ac as a1,uc as a2,sc as a3,W as a4,X as a5,Zo as a6,ei as a7,te as a8,x as a9,De as aA,Ze as aB,E as aC,bm as aD,xn as aE,kl as aF,_m as aG,Uu as aH,Om as aI,Ym as aJ,vm as aK,jc as aL,Cm as aM,Ae as aN,Fm as aO,Cd as aP,He as aQ,Um as aR,ga as aS,$m as aT,Hm as aU,xi as aV,xm as aW,_0 as aX,js as aY,h0 as aZ,Fa as a_,mc as aa,dc as ab,ic as ac,pe as ad,at as ae,Pe as af,wl as ag,V0 as ah,Ml as ai,on as aj,se as ak,dn as al,H0 as am,$0 as an,Y0 as ao,U0 as ap,F0 as aq,O0 as ar,Tr as as,Dm as at,Lm as au,hm as av,n0 as aw,Am as ax,ym as ay,Em as az,an as b,El as b$,qr as b0,Es as b1,cn as b2,ka as b3,Oa as b4,E0 as b5,Kn as b6,Un as b7,y0 as b8,Gn as b9,Er as bA,Jl as bB,j0 as bC,q0 as bD,K0 as bE,co as bF,lo as bG,so as bH,io as bI,oo as bJ,R0 as bK,ie as bL,ur as bM,hr as bN,No as bO,w0 as bP,fu as bQ,Je as bR,M0 as bS,Rm as bT,Ic as bU,ne as bV,Km as bW,ef as bX,Nm as bY,Zc as bZ,qc as b_,a0 as ba,i0 as bb,r0 as bc,o0 as bd,c0 as be,x0 as bf,z0 as bg,O as bh,G0 as bi,T as bj,eo as bk,to as bl,P as bm,no as bn,ao as bo,k0 as bp,Fl as bq,Vl as br,_t as bs,T0 as bt,Al as bu,Lt as bv,k as bw,X0 as bx,V as by,W0 as bz,J0 as c,Fc as c$,Re as c0,Ua as c1,pn as c2,nm as c3,Jo as c4,A0 as c5,dt as c6,Ju as c7,Tm as c8,Vm as c9,rs as cA,is as cB,s0 as cC,Z0 as cD,Zl as cE,gn as cF,Mr as cG,Vs as cH,f0 as cI,ee as cJ,m0 as cK,u0 as cL,I0 as cM,Ur as cN,zm as cO,Di as cP,tm as cQ,Li as cR,Im as cS,mm as cT,fc as cU,sm as cV,lm as cW,Sm as cX,yl as cY,rc as cZ,um as c_,Pm as ca,Vu as cb,Qu as cc,rf as cd,af as ce,uf as cf,tf as cg,Ye as ch,P0 as ci,Bl as cj,ir as ck,xl as cl,If as cm,df as cn,sf as co,L0 as cp,B0 as cq,D0 as cr,Nr as cs,qo as ct,ze as cu,om as cv,dm as cw,Sd as cx,Xm as cy,l0 as cz,v0 as d,pm as d0,Ct as d1,am as d2,Pr as d3,Jm as d4,S0 as d5,g0 as d6,wm as d7,Nn as d8,ac as d9,yc as da,d0 as db,En as dc,zr as dd,rm as de,im as df,gm as dg,Qm as e,Gm as f,Q0 as g,me as h,ve as i,Ee as j,Jr as k,em as l,ot as m,N0 as n,jm as o,Qo as p,gf as q,b0 as r,Ld as s,nf as t,kd as u,ff as v,mf as w,Ud as x,lf as y,Sf as z};
