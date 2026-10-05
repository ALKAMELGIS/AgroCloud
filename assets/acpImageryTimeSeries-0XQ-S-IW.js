import"./agroStructuresPrimaryAoi-BdjF6JIK.js";import{k as An,l as yn,bA as Ln,S as gi}from"./index-lbKPDCBX.js";import{g as Si,b as Bn}from"./geoAiGeoJsonSpatial-B2yyUwQr.js";const rt=.35,st=.2,lt=.25,ot=.2,pi=`${rt} * ndvi + ${st} * ndwi + ${lt} * ndmi + ${ot} * savi`,_n=pi,hi=`${rt}·NDVI + ${st}·NDWI + ${lt}·NDMI + ${ot}·SAVI`,uc=`CDSI = ${hi}`,Ci=.4,bi=.35,Ni=.25;function vi(e){if(!Number.isFinite(e))return NaN;const t=1+e;return Math.abs(t)<1e-6?NaN:-2*e/t}function Ei(e){const t=Number.isFinite(e)?e:0;return Number((.76+t*.44-1).toFixed(4))}function ct(e){const t=Number.isFinite(e)?e:0;return Math.max(-.2,Math.min(1,t*.96+.015))}function Mi(e){if(e.ciRe!=null&&Number.isFinite(e.ciRe))return e.ciRe;if(e.ndre!=null&&Number.isFinite(e.ndre)){const t=vi(e.ndre);return Number.isFinite(t)?t:null}return Number.isFinite(e.ndvi)?Ei(e.ndvi):null}function Ai(e){const{ndvi:t,ndwi:n,ndmi:a,savi:i}=e;if(![t,n,a,i].every(s=>Number.isFinite(s)))return NaN;const r=rt*t+st*n+lt*a+ot*i;return Number(r.toFixed(4))}function yi(e){const t=e.ndvi,n=e.ndmi,a=e.ndwi,i=e.savi!=null&&Number.isFinite(e.savi)?e.savi:Number.isFinite(t)?ct(t):NaN;if(Number.isFinite(t)&&Number.isFinite(n)&&a!=null&&Number.isFinite(a)&&Number.isFinite(i))return Ai({ndvi:t,ndwi:a,ndmi:n,savi:i});const r=Mi(e);if(r==null||!Number.isFinite(t)||!Number.isFinite(n))return NaN;const s=Ci*t+bi*n+Ni*r;return Number(s.toFixed(4))}function Li(e,t){var s,l;const n=e.ndvi??(t==null?void 0:t.ndvi),a=e.ndmi??(t==null?void 0:t.ndmi);if(n==null||a==null||!Number.isFinite(n)||!Number.isFinite(a))return null;const i=e.ndwi??(t==null?void 0:t.ndwi),r=e.savi??(t==null?void 0:t.savi)??(Number.isFinite(n)?ct(n):null);return{ndvi:n,ndmi:a,ndwi:i,savi:r,ciRe:e.ciRe??((l=(s=e.zonal)==null?void 0:s.ciRe)==null?void 0:l.mean)??(t==null?void 0:t.ciRe),ndre:t==null?void 0:t.ndre}}const dc=["healthy","mild","moderate","severe","bare"],mc={healthy:"Healthy Vegetation",mild:"Mild Stress",moderate:"Moderate Stress",severe:"Severe Stress",bare:"Bare Soil"},fc={healthy:"#22c55e",mild:"#facc15",moderate:"#f97316",severe:"#ef4444",bare:"#94a3b8"},Bi=[[.580392,.639216,.721569],[.133333,.772549,.368627],[.980392,.8,.082353],[.976471,.45098,.086275],[.937255,.266667,.266667]];function Ic(e){const t=Math.max(0,Math.min(4,Math.round(e)));return t===0?"bare":t===1?"healthy":t===2?"mild":t===3?"moderate":"severe"}const K={ndvi:.4,ndmi:.25,savi:.2,ndwi:.15},ut=`${K.ndvi} * ndvi + ${K.ndmi} * ndmi + ${K.savi} * savi + ${K.ndwi} * ndwi`;function _i(e){const{ndvi:t,ndmi:n,savi:a,ndwi:i}=e;if(![t,n,a,i].every(s=>Number.isFinite(s)))return NaN;const r=K.ndvi*t+K.ndmi*n+K.savi*a+K.ndwi*i;return Number(r.toFixed(4))}function Ri(e){return Number.isFinite(e)?Number(Math.max(0,Math.min(1,1-e)).toFixed(4)):NaN}function Di(e,t){return!Number.isFinite(e)||e<.15?"bare":Number.isFinite(t)?t>=.6?"severe":t>=.4?"moderate":t>=.2?"mild":"healthy":"moderate"}function xi(e,t){const{ndvi:n,ndmi:a,ndwi:i}=e;return t==="bare"?"Low vegetation cover — exposed soil or fallow surface.":a<.12&&i<.1?"Canopy water limitation — moisture stress limiting vigor.":n<.35&&a>=.15?"Vegetation stress with adequate moisture — possible nutrient or biotic pressure.":n>=.55&&a<.15?"High vigor but declining canopy moisture — early water stress signal.":t==="severe"?"Combined vegetation and moisture deficit across the AOI.":t==="moderate"?"Moderate canopy stress — monitor irrigation and field scouting.":t==="mild"?"Early stress signal — within normal seasonal variability.":"Stable vegetation condition — continue routine monitoring."}function Ti(e,t){return e==="bare"?"Confirm land use (harvest, tillage, or bare fallow). Reschedule analysis after emergence or planting.":e==="severe"?"Priority field visit within 48h. Verify irrigation, drainage, and pest pressure in red zones.":e==="moderate"?"Targeted scouting in orange zones; compare NDMI trend over the next two scenes for recovery.":e==="mild"?"Watch yellow zones on the next acquisition; no immediate intervention unless trend worsens.":"Maintain current management. Use time-series comparison to track seasonal trajectory."}function gc(e){const t=_i(e),n=Ri(t),a=Di(e.ndvi,n),i=xi(e,a),r=Ti(a);return{chas:t,stressScore:n,tier:a,riskCause:i,recommendation:r}}const Ie="ADI",dt="Anomaly Detection Index — (Current − Historical Mean) / Historical Std · 10-class",mt=.5,ft=.3,It=.2,Rn=`${mt} * ndvi + ${ft} * ndmi + ${It} * ndre`,Sc=`(${mt}·NDVI + ${ft}·NDMI + ${It}·NDRE − μ_hist) / σ_hist`,Dn=90,wi=[-2,-1.5,-1,-.5,.5,1,1.5,2,3],Pi=[-2.5,-1.75,-1.25,-.75,0,.75,1.25,1.75,2.5,3.5],zt=["Extreme Negative Anomaly · ADI < −2.0","High Stress · −2.0 to −1.5","Moderate Stress · −1.5 to −1.0","Slight Negative Change · −1.0 to −0.5","Normal Condition · −0.5 to 0.5","Slight Positive Change · 0.5 to 1.0","Moderate Positive Change · 1.0 to 1.5","High Anomaly · 1.5 to 2.0","Very High Anomaly · 2.0 to 3.0","Extreme Positive Anomaly · ADI > 3.0"],jt=[8323072,11674146,14102567,16018755,16703627,14282635,10934634,6732650,1742928,26679];function F(e){return String(e||"").trim().toUpperCase()===Ie}function Vi(e,t,n){return mt*e+ft*t+It*n}function Fi(e,t,n){if(!Number.isFinite(e)||!Number.isFinite(t))return NaN;const a=Number.isFinite(n)&&n>1e-6?n:1e-6;return(e-t)/a}const ge="NCADI",gt="Newly Cultivated / Abandoned Detection Index — 0.7·ΔNDVI + 0.3·ΔNDMI · 10-class",St=.7,pt=.3,Oi=`${St} * dNdvi + ${pt} * dNdmi`,ki=`${St} * ndvi + ${pt} * ndmi`,pc=`${St}·ΔNDVI + ${pt}·ΔNDMI`,Wi=60,Hi=[-.35,-.2,-.1,-.03,.03,.1,.2,.35,.5],$i=[-.42,-.275,-.15,-.065,0,.065,.15,.275,.425,.58],Zt=["Extreme Abandonment · NCADI < −0.35","High Abandonment Risk · −0.35 to −0.20","Moderate Decline · −0.20 to −0.10","Slight Vegetation Decline · −0.10 to −0.03","Stable Condition · −0.03 to 0.03","Slight Cultivation Gain · 0.03 to 0.10","Moderate Cultivation Gain · 0.10 to 0.20","High Cultivation Gain · 0.20 to 0.35","Very High Cultivation Gain · 0.35 to 0.50","Extreme Cultivation Gain · NCADI > 0.50"],qt=[5517317,9195786,12550445,14664317,16181443,13101797,8441281,3512207,91742,15408];function k(e){return String(e||"").trim().toUpperCase()===ge}const he=7,hc=5;function Ui(e){return e.filter(t=>t.ndvi!=null||t.ndwi!=null||t.ndmi!=null).map(t=>t.date).sort((t,n)=>n.localeCompare(t))}function Jt(e,t){const n=e.find(a=>a.date===t.trim());return n?n.ndvi!=null||n.ndwi!=null||n.ndmi!=null:!1}function Ke(e,t){const n=ee(e.trim()).getTime(),a=ee(t.trim()).getTime();return!Number.isFinite(n)||!Number.isFinite(a)?0:Math.round((n-a)/864e5)}function J(e,t){return Math.abs(Ke(e,t))}function ye(e,t,n=he){const a=e.trim(),i=[...new Set(t.map(c=>c.trim()).filter(Boolean))].sort((c,u)=>u.localeCompare(c));if(!i.length)return null;if(i.includes(a))return a;const r=i.filter(c=>J(a,c)<=n),s=r.length?r:i;let l=s[0],o=J(a,l);for(const c of s){const u=J(a,c);(u<o||u===o&&c<=a)&&(o=u,l=c)}return l}function Qt(e,t,n=he){const a=e.trim(),i=[...new Set(t.map(o=>o.trim()).filter(Boolean))];if(!i.length)return{requestedDate:a,resolvedDate:null,fallbackUsed:!1,fallbackDays:0,direction:"nearest"};if(i.includes(a))return{requestedDate:a,resolvedDate:a,fallbackUsed:!1,fallbackDays:0,direction:"exact"};const r=i.filter(o=>J(a,o)<=n);if(r.length){const o=ye(a,r,n),c=Ke(a,o);return{requestedDate:a,resolvedDate:o,fallbackUsed:!0,fallbackDays:J(a,o),direction:c>0?"backward":c<0?"forward":"nearest"}}const s=ye(a,i,n);if(!s)return{requestedDate:a,resolvedDate:null,fallbackUsed:!1,fallbackDays:0,direction:"nearest"};const l=Ke(a,s);return{requestedDate:a,resolvedDate:s,fallbackUsed:s!==a,fallbackDays:J(a,s),direction:l>0?"backward":l<0?"forward":"nearest"}}function xn(e,t=new Date,n=45){const a=se(t),i=new Set(e.map(s=>s.trim().slice(0,10)).filter(Boolean));if(!i.size)return a;for(let s=0;s<=n;s++){const l=B(a,s);if(i.has(l))return l}const r=[...i].sort((s,l)=>l.localeCompare(s));return ye(a,r,he)??a}function Tn(e,t){const n=e.trim().slice(0,10),a=[...new Set(t.map(r=>r.trim().slice(0,10)).filter(Boolean))].sort((r,s)=>s.localeCompare(r));if(!a.length||!n)return null;const i=a.indexOf(n);return i>=0&&i+1<a.length?a[i+1]:a.find(r=>r<n)??null}function Cc(e,t=new Date){const n=xn(e,t),a=Tn(n,e);return{currentSceneDate:n,previousSceneDate:a}}function bc(e,t,n,a=he){const i=Ui(e),r=(n??[]).map(o=>o.trim().slice(0,10)).filter(Boolean),s=i.length?i:[...new Set(r)].sort((o,c)=>c.localeCompare(o)),l=Qt(t,s,a);if(!l.resolvedDate||!Jt(e,l.resolvedDate)){const o=Qt(t,i,a);return o.resolvedDate&&Jt(e,o.resolvedDate)?o:{...l,resolvedDate:null}}return l}const Gi=90,Nc=2,wn="si_sentinel_imagery_date_by_aoi_v1";function se(e=new Date){const t=e.getFullYear(),n=String(e.getMonth()+1).padStart(2,"0"),a=String(e.getDate()).padStart(2,"0");return`${t}-${n}-${a}`}function ee(e){const t=/^(\d{4})-(\d{2})-(\d{2})$/.exec(e.trim());return t?new Date(Number(t[1]),Number(t[2])-1,Number(t[3]),12,0,0,0):new Date}function B(e,t){const n=ee(e);return n.setDate(n.getDate()-t),se(n)}function ht(e,t){const n=ee(e);return n.setDate(n.getDate()+t),se(n)}function Pn(e,t=new Date){return se(t)}function vc(e=new Date){return ee(Pn(null,e))}function Ec(e=new Date,t){const n=(t==null?void 0:t.trim())||Pn(null,e),a=ee(n);return a.setDate(a.getDate()-Gi),{start:se(a),end:n}}function Mc(e,t,n){const a=e.trim();if(!a)return xn(t);const i=[...new Set(t.map(r=>r.trim().slice(0,10)).filter(Boolean))].sort((r,s)=>s.localeCompare(r));return!i.length||i.includes(a)?a:ye(a,i,he)??a}function Vn(){if(typeof window>"u")return{};try{const e=window.localStorage.getItem(wn);if(!e)return{};const t=JSON.parse(e);return t&&typeof t=="object"?t:{}}catch{return{}}}function Ac(e){const t=e.trim()||"global";return Vn()[t]??{autoFollow:!0}}function yc(e,t){if(typeof window>"u"||!window.localStorage)return;const n=e.trim()||"global";try{const a=Vn();a[n]=t,window.localStorage.setItem(wn,JSON.stringify(a))}catch{}}const Le="LULC",Lc=10,Bc=3,Ki=1024,en={name:Le,title:"LULC"},Fn="Land Use / Land Cover — Sentinel-2 10m · 3m display (AgroCloud · IO schema)",Ct=[{id:1,key:"water",name:"Water",color:"#419BDF"},{id:2,key:"trees",name:"Trees",color:"#397D49"},{id:4,key:"flooded",name:"Flooded Vegetation",color:"#7EC8A3",agricultural:!0},{id:5,key:"crops",name:"Crops",color:"#F5C518",agricultural:!0},{id:7,key:"built",name:"Built Area",color:"#E53935"},{id:8,key:"bare",name:"Bare Ground",color:"#E8DCC8"},{id:9,key:"snow",name:"Snow/Ice",color:"#E8F4FC"},{id:10,key:"clouds",name:"Clouds",color:"#9E9E9E"},{id:11,key:"rangeland",name:"Rangeland",color:"#C4A574"},{id:0,key:"nodata",name:"No Data",color:"#FFFFFF"}],bt=Ct.filter(e=>e.id!==0);new Set(Ct.filter(e=>e.agricultural).map(e=>e.id));const _c=4,Rc=120,Dc=512;function le(e){return String(e||"").trim().toUpperCase()===Le}function Yi(e){const t=e.replace("#","").trim(),n=t.length===3?t.split("").map(i=>i+i).join(""):t,a=Number.parseInt(n,16);return Number.isFinite(a)?[(a>>16&255)/255,(a>>8&255)/255,(a&255)/255]:[0,0,0]}function xc(e,t=120){const n=String(e||"").trim().slice(0,10);return n?{timeStart:B(n,t),timeEnd:n}:{timeStart:"",timeEnd:""}}const Xi="DSI",Tc="Drought Severity Index (0.50·(1−VCI) + 0.30·(1−SMCI) + 0.20·(1−NDMI_norm)) · 10-class",zi="Math.max(0, Math.min(1, (ndvi - 0.05) / 0.80))",ji="Math.max(0, Math.min(1, (0.7 * ndmi + 0.3 * ndwi + 0.3) / 0.8))",Zi="Math.max(0, Math.min(1, (ndmi + 0.8) / 1.6))",qi=`0.50 * (1 - (${zi})) + 0.30 * (1 - (${ji})) + 0.20 * (1 - (${Zi}))`,On=0,kn=1,Wn=[.1,.2,.3,.4,.5,.6,.7,.8,.9],Ji=[.05,.15,.25,.35,.45,.55,.65,.75,.85,.95],tn=["No Drought","Very Low","Low","Mild","Moderate","Moderate-High","High","Severe","Very Severe","Extreme Drought"],nn=[26679,3253076,7915129,11394446,14282915,16703627,16625249,16018755,14102567,8323072],wc=["0.00–0.10","0.10–0.20","0.20–0.30","0.30–0.40","0.40–0.50","0.50–0.60","0.60–0.70","0.70–0.80","0.80–0.90","0.90–1.00"],an=.3;function Pc(e,t=an){const n=Number.isFinite(t)?t:an,a=[On,...Wn,kn];let i=0,r=0,s=0;for(const l of e){const o=a[l.classIndex];o==null||o<n||(i+=l.areaM2,r+=l.count,s+=l.pctOfAoi)}return{threshold:n,areaM2:i,areaHa:i/1e4,areaKm2:i/1e6,pctOfAoi:s,sampleCount:r}}const Qi="WAPI",Hn="0.40 * ndmi + 0.35 * ndwi + 0.15 * ndvi + 0.10 * savi",$n="Math.max(0, Math.min(1, 1 - (0.6 * ndmi + 0.4 * ndwi)))",er=`0.40 * (${Hn}) + 0.20 * (1 - ndmi) + 0.10 * (${$n}) + 0.10`,tr=45,nr=0,ar=1,ir=[.1,.2,.3,.4,.5,.6,.7,.8,.9],rr=[.05,.15,.25,.35,.45,.55,.65,.75,.85,.95],rn=["Class 1 · Normal · 0.00–0.09","Class 2 · Healthy · 0.10–0.19","Class 3 · Low Stress · 0.20–0.29","Class 4 · Low Moderate · 0.30–0.39","Class 5 · Moderate · 0.40–0.49","Class 6 · Moderate High · 0.50–0.59","Class 7 · High Stress · 0.60–0.69","Class 8 · Very High Stress · 0.70–0.79","Class 9 · Critical · 0.80–0.89","Class 10 · Extreme Critical · 0.90–1.00"],sn=[6056896,4431943,2533018,16773494,16635957,16757504,15690752,15483002,15277667,11342935];function Un(e){return String(e||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"")==="WAPI"}function Vc(e){const t=1-(.6*e.ndmi+.4*e.ndwi);return Math.max(0,Math.min(1,t))}const sr=["#2563eb","#0d9488","#16a34a","#86efac","#eab308","#f59e0b","#f97316","#ea580c","#dc2626","#7f1d1d"],lr=["No / Weak Indication","Very Low","Low","Low–Moderate","Medium","Moderate","High–Moderate","High","Very High","Very High / Extreme"],ln=[{id:"S3_NDVI",label:"NDVI",scientificName:"NDVI = (NIR − Red) / (NIR + Red)"},{id:"S3_EVI",label:"EVI",scientificName:"EVI = 2.5 × (NIR − Red) / (NIR + 6×Red − 7.5×Blue + 1)"},{id:"S3_FAPAR",label:"FAPAR",scientificName:"Fraction of Absorbed Photosynthetically Active Radiation"},{id:"S3_LAI",label:"LAI",scientificName:"Leaf Area Index"},{id:"S3_FCOVER",label:"FCOVER",scientificName:"Fraction of Vegetation Cover"},{id:"S3_CI",label:"Chlorophyll Index (CI)",scientificName:"CI = (NIR / Green) − 1"},{id:"S3_LST",label:"LST",scientificName:"Land Surface Temperature"},{id:"S3_WQI",label:"Water Quality Index",scientificName:"Chlorophyll-a + Turbidity + Algae Indicators"}],or=[{id:"S5P_NO2",label:"NO₂ Index",scientificName:"Atmospheric Nitrogen Dioxide Concentration"},{id:"S5P_SO2",label:"SO₂ Index",scientificName:"Atmospheric Sulfur Dioxide Concentration"},{id:"S5P_CO",label:"CO Index",scientificName:"Carbon Monoxide Concentration"},{id:"S5P_O3",label:"O₃ Index",scientificName:"Ozone Concentration"},{id:"S5P_CH4",label:"CH₄ Index",scientificName:"Methane Concentration"},{id:"S5P_AI",label:"Aerosol Index (AI)",scientificName:"UV Aerosol Index"},{id:"S5P_AQI",label:"Air Quality Index (AQI)",scientificName:"Combined Pollutant Index"}],cr=[{id:"S6_SLA",label:"Sea Level Anomaly (SLA)",scientificName:"Sea Surface Height − Mean Sea Level"},{id:"S6_SSH",label:"Sea Surface Height (SSH)",scientificName:"Altimeter Measurement"},{id:"S6_OST",label:"Ocean Surface Topography",scientificName:"Sea Surface Height + Corrections"},{id:"S6_SWH",label:"Significant Wave Height (SWH)",scientificName:"Wave Height Measurement"},{id:"S6_SLT",label:"Sea Level Trend Index",scientificName:"Temporal Sea Level Change"}],ur=[{id:"CCM_NDVI",label:"NDVI",scientificName:"NDVI = (NIR − Red) / (NIR + Red)"},{id:"CCM_NDWI",label:"NDWI",scientificName:"NDWI = (Green − NIR) / (Green + NIR)"},{id:"CCM_NDMI",label:"NDMI",scientificName:"NDMI = (NIR − SWIR) / (NIR + SWIR)"},{id:"CCM_SAVI",label:"SAVI",scientificName:"SAVI = ((NIR − Red) / (NIR + Red + L)) × (1 + L)"},{id:"CCM_EVI",label:"EVI",scientificName:"EVI = 2.5 × (NIR − Red) / (NIR + 6×Red − 7.5×Blue + 1)"},{id:"CCM_NBR",label:"NBR",scientificName:"NBR = (NIR − SWIR2) / (NIR + SWIR2)"},{id:"CCM_BSI",label:"BSI",scientificName:"BSI = ((SWIR + Red) − (NIR + Blue)) / ((SWIR + Red) + (NIR + Blue))"}],dr=[{id:"CCM_SAR_BACKSCATTER",label:"SAR Backscatter Index",scientificName:"σ° (dB)"},{id:"CCM_SAR_VV_VH",label:"VV/VH Ratio",scientificName:"VV ÷ VH"},{id:"CCM_SAR_RVI",label:"Radar Vegetation Index (RVI)",scientificName:"RVI = 4×VH / (VV + VH)"},{id:"CCM_SAR_SM",label:"SAR Soil Moisture Index",scientificName:"Backscatter-based Soil Moisture"},{id:"CCM_SAR_FLOOD",label:"Flood Detection Index",scientificName:"σ°(t2) − σ°(t1)"},{id:"CCM_SAR_CHANGE",label:"SAR Change Detection Index",scientificName:"Multi-temporal Backscatter Difference"}],mr=[{id:"DEM_SLOPE",label:"Slope",scientificName:"Elevation Gradient"},{id:"DEM_ASPECT",label:"Aspect",scientificName:"Terrain Orientation"},{id:"DEM_HILLSHADE",label:"Hillshade",scientificName:"Terrain Illumination Model"},{id:"DEM_TPI",label:"TPI (Topographic Position Index)",scientificName:"Elevation − Mean Neighborhood Elevation"},{id:"DEM_TRI",label:"TRI (Terrain Ruggedness Index)",scientificName:"Elevation Variability"},{id:"DEM_TWI",label:"TWI (Topographic Wetness Index)",scientificName:"ln(Flow Accumulation / tan(Slope))"},{id:"DEM_WATERSHED",label:"Watershed Index",scientificName:"Hydrological Catchment Analysis"}],fr=[{id:"MOSAIC_NDVI_TS",label:"NDVI Time Series",scientificName:"NDVI(t) Over Time"},{id:"MOSAIC_VAI",label:"Vegetation Anomaly Index (VAI)",scientificName:"Current NDVI − Historical NDVI"},{id:"MOSAIC_CHANGE",label:"Change Detection Index",scientificName:"Image(t2) − Image(t1)"},{id:"MOSAIC_CROP",label:"Crop Monitoring Index",scientificName:"NDVI + NDMI + Weather Data"}],Ir=[{id:"CLMS_LAI",label:"LAI",scientificName:"Leaf Area Index"},{id:"CLMS_FAPAR",label:"FAPAR",scientificName:"Fraction of Absorbed Photosynthetically Active Radiation"},{id:"CLMS_FCOVER",label:"FCOVER",scientificName:"Vegetation Cover Fraction"},{id:"CLMS_GPP",label:"GPP",scientificName:"Gross Primary Productivity"},{id:"CLMS_DMP",label:"DMP",scientificName:"Dry Matter Productivity"},{id:"CLMS_SM",label:"Soil Moisture Index",scientificName:"Surface Soil Moisture"}],gr=[{id:"CLMS_LC_CHANGE",label:"Land Cover Change Index",scientificName:"LC(t2) − LC(t1)"},{id:"CLMS_URBAN",label:"Urban Expansion Index",scientificName:"Built-up Area Change"},{id:"CLMS_AGRI_EXP",label:"Agricultural Expansion Index",scientificName:"Cropland Change"},{id:"CLMS_FOREST_LOSS",label:"Forest Loss Index",scientificName:"Forest(t1) − Forest(t2)"},{id:"CLMS_FRAGMENT",label:"Landscape Fragmentation Index",scientificName:"Landscape Structure Change"}],Sr=[{id:"CLMS_LC_CLASS",label:"Land Cover Classification Index",scientificName:"Land Cover Classes"},{id:"CLMS_LU_CHANGE",label:"Land Use Change Index",scientificName:"Land Use(t2) − Land Use(t1)"},{id:"CLMS_BUILTUP",label:"Built-up Index",scientificName:"Urban Area Detection"},{id:"CLMS_VEG_COVER",label:"Vegetation Cover Index",scientificName:"Vegetation Fraction"},{id:"CLMS_AGRI_LAND",label:"Agricultural Land Index",scientificName:"Cropland Detection"}],pr=[{id:"COMP_RAINFALL_ANOM",label:"Rainfall Anomaly Index",scientificName:"Current Rainfall − Historical Average Rainfall"},{id:"COMP_SPI",label:"Drought Index (SPI)",scientificName:"Standardized Precipitation Index"},{id:"COMP_TEMP_ANOM",label:"Temperature Anomaly Index",scientificName:"Current Temperature − Historical Temperature"},{id:"COMP_CLIMATE_STRESS",label:"Climate Stress Index",scientificName:"Temperature + Rainfall + Vegetation Response"},{id:"COMP_ENV_RISK",label:"Environmental Risk Index",scientificName:"Vegetation + Climate + Land Cover + Terrain Factors"}],Ce={"sentinel-3":{label:"SENTINEL-3 indices",indices:ln},"sentinel-3-olci":{label:"SENTINEL-3 indices",indices:ln},"sentinel-5p":{label:"SENTINEL-5P indices",indices:or},"sentinel-6":{label:"SENTINEL-6 indices",indices:cr},"ccm-optical":{label:"CCM Optical indices",indices:ur},"ccm-sar":{label:"CCM SAR indices",indices:dr},"copernicus-dem":{label:"Copernicus DEM indices",indices:mr},"sentinel-mosaics":{label:"Sentinel Mosaics indices",indices:fr},"clms-biogeophysical":{label:"CLMS Bio-geophysical",indices:Ir},"clms-lulc-priority":{label:"CLMS LULC Priority Areas",indices:gr},"clms-lulc-mapping":{label:"CLMS LULC Mapping",indices:Sr},"complementary-data":{label:"Complementary Data indices",indices:pr}},hr=new Set(Object.values(Ce).flatMap(e=>e.indices.map(t=>t.id.toUpperCase())));function Nt(e){return String(e||"").trim().toLowerCase()}function Fc(e){return!!Ce[Nt(e)]}function Oc(e){var t;return((t=Ce[Nt(e)])==null?void 0:t.indices)??[]}function kc(e){return hr.has(String(e||"").trim().toUpperCase())}function Cr(e){const t=String(e||"").trim().toUpperCase();if(!t)return null;for(const n of Object.values(Ce)){const a=n.indices.find(i=>i.id.toUpperCase()===t);if(a)return a}return null}function Wc(e){const t=Nt(e),n=Ce[t];if(!n)return null;const a=(n.indices??[]).map(i=>({id:i.id,label:i.label,scientificName:i.scientificName}));return[{id:`collection-indices-${t}`,label:n.label,options:a}]}function Hc(){return lr.map((e,t)=>({label:e,rangeLabel:`Class ${t+1}`,color:sr[t]}))}const Gn="MVI",Kn="REMI",Yn="MI",Xn="MFI",zn="NDRE-B5",jn="NDRE-B6",Zn="NDRE-B7",qn="CI-RE",Jn="GCI-CHL",Qn="MTCI",ea="REIP",ta=[Gn,Kn,Yn,Xn,zn,jn,Zn,qn,Jn,Qn,ea],br="Mangrove Vegetation Index — (B08−B03)/(B11−B03) · mangrove detection",Nr="Red-Edge Mangrove Index — ((B06−B05)/(B06+B05))·((B03−B11)/(B03+B11)) · mangrove discrimination",vr="Mangrove Index — (B08−B04)/(B11+B04) · mangrove extraction",Er="Mangrove Forest Index — ((B05+B06+B07)/3−B8A)/((B05+B06+B07)/3+B8A) · mangrove forest discrimination",Mr="Normalized Difference Red Edge (B5) — (B8A−B05)/(B8A+B05) · 10-class · mangrove / chlorophyll sensitivity",Ar="Normalized Difference Red Edge (B6) — (B8A−B06)/(B8A+B06) · 10-class · mangrove / chlorophyll sensitivity",yr="Normalized Difference Red Edge (B7) — (B8A−B07)/(B8A+B07) · 10-class · mangrove / chlorophyll sensitivity",Lr="Chlorophyll Index Red Edge — (B8A/B05)−1 · sensitive to chlorophyll content",Br="Green Chlorophyll Index — (B08/B03)−1 · relative chlorophyll / vegetation vigor",_r="MERIS Terrestrial Chlorophyll Index — (B06−B05)/(B05−B04) · highly sensitive to chlorophyll variation",Rr="Red Edge Inflection Point — 705+35×(((B04+B07)/2−B05)/(B06−B05)) · Guyot & Baret · chlorophyll / condition",Dr="mvi",xr="remi",Tr="mi",wr="mfi",Pr="ndre_b5",Vr="ndre_b6",Fr="ndre_b7",Or="cire",kr="gci_chl",Wr="mtci",Hr="reip",na=[{id:Gn,label:"MVI",scientificName:br,deltaId:"DMVI",deltaLabel:"ΔMVI",expr:Dr},{id:Kn,label:"REMI",scientificName:Nr,deltaId:"DREMI",deltaLabel:"ΔREMI",expr:xr},{id:Yn,label:"MI",scientificName:vr,deltaId:"DMI",deltaLabel:"ΔMI",expr:Tr},{id:Xn,label:"MFI",scientificName:Er,deltaId:"DMFI",deltaLabel:"ΔMFI",expr:wr},{id:zn,label:"NDRE-B5",scientificName:Mr,deltaId:"DNDRE-B5",deltaLabel:"ΔNDRE-B5",expr:Pr},{id:jn,label:"NDRE-B6",scientificName:Ar,deltaId:"DNDRE-B6",deltaLabel:"ΔNDRE-B6",expr:Vr},{id:Zn,label:"NDRE-B7",scientificName:yr,deltaId:"DNDRE-B7",deltaLabel:"ΔNDRE-B7",expr:Fr},{id:qn,label:"CI-RE",scientificName:Lr,deltaId:"DCI-RE",deltaLabel:"ΔCI-RE",expr:Or},{id:Jn,label:"GCI-CHL",scientificName:Br,deltaId:"DGCI-CHL",deltaLabel:"ΔGCI-CHL",expr:kr},{id:Qn,label:"MTCI",scientificName:_r,deltaId:"DMTCI",deltaLabel:"ΔMTCI",expr:Wr},{id:ea,label:"REIP",scientificName:Rr,deltaId:"DREIP",deltaLabel:"ΔREIP",expr:Hr}];function $c(e){const t=String(e||"").trim().toUpperCase();return ta.some(n=>n.toUpperCase()===t)}const aa=`let mviDen = samples.B11 - samples.B03;
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
    : NaN;`,Ye=[{id:"CHAS_ALERT",label:"CHAS Alert",scientificName:"CHAS Alert Layer (derived 4-level rule engine)",deltaId:"CHAS_ALERT",deltaLabel:"CHAS Alert",expr:_n},{id:"STRESS_ZONES",label:"Stress Zones",scientificName:"AI Stress Zones (CHAS fusion + 5-class stress map)",deltaId:"STRESS_ZONES",deltaLabel:"Stress Zones",expr:ut},{id:Ie,label:"ADI",scientificName:dt,deltaId:Ie,deltaLabel:"ADI",expr:Rn},{id:ge,label:"NCADI",scientificName:gt,deltaId:ge,deltaLabel:"NCADI",expr:ki}],on=["NDVI","NDMI","NDII","NDWI","MNDWI","AWEI","NBR","SAVI","ET","LST"],Xe={NDVI:"NDVI = (B8 − B4) / (B8 + B4)",NDMI:"NDMI = (B8 − B11) / (B8 + B11)",NDII:"NDII = (NIR − SWIR) / (NIR + SWIR)",NDWI:"NDWI = (B3 − B8) / (B3 + B8)",MNDWI:"MNDWI = (B3 − B11) / (B3 + B11)",AWEI:"AWEI = 4 × (B3 − B11) − (0.25 × B8 + 2.75 × B12)",NBR:"NBR = (B8 − B12) / (B8 + B12)",SAVI:"Soil-Adjusted Vegetation Index",ET:"Evapotranspiration (moisture-proxy mm/day)",LST:"Land Surface Temperature (°C, NDVI·NDMI seasonal proxy)"},$r="PRECIP",Ur="UCSB CHIRPS Daily Rainfall — Precipitation / Rainfall Analysis (mm)";function vt(e){const t=String(e||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");return t==="PRECIP"||t==="CHIRPS"||t==="RAINFALL"||t==="PRECIPITATION"}const xe=[{id:"vegetation-health",groupLabel:"🌱 Vegetation Health Layer",indices:[{id:"CVHI",label:"CVHI",scientificName:"Composite Vegetation Health Index (NDVI·NDMI·NDWI·SAVI mean)",deltaId:"DCVHI",deltaLabel:"ΔCVHI",expr:"(ndvi + ndmi + ndwi + savi) / 4"},{id:"VHS",label:"VHS",scientificName:"Vegetation Health Score",deltaId:"DVHS",deltaLabel:"ΔVHS",expr:"(ndvi + savi) / 2"},{id:"VDI",label:"VDI",scientificName:"Vegetation Dryness Index",deltaId:"DVDI",deltaLabel:"ΔVDI",expr:"0.7 * ndvi + 0.3 * savi"},{id:"CVI",label:"CVI",scientificName:"Crop Vigor Index (0.50·NDVI + 0.30·EVI + 0.20·NDRE)",deltaId:"DCVI",deltaLabel:"ΔCVI",expr:"0.50 * ndvi + 0.30 * evi + 0.20 * ndre"},{id:"CSI",label:"CSI",scientificName:"Crop Stress Index",deltaId:"DCSI",deltaLabel:"ΔCSI",expr:"1 - ((ndvi + ndmi) / 2)"},{id:"WST",label:"WST",scientificName:"Water Stress Index",deltaId:"DWST",deltaLabel:"ΔWST",expr:"ndvi - ndmi"}]},{id:"water-moisture",groupLabel:"💧 Water & Moisture Layer",indices:[{id:"DRI",label:"DRI",scientificName:"Drought Risk Index",deltaId:"DDRI",deltaLabel:"ΔDRI",expr:"1 - ((ndmi + ndwi) / 2)"},{id:"VMI",label:"VMI",scientificName:"Vegetation Moisture Index",deltaId:"DVMI",deltaLabel:"ΔVMI",expr:"(ndmi + ndwi) / 2"},{id:"SMI",label:"SMI",scientificName:"Soil Moisture Index",deltaId:"DSMI",deltaLabel:"ΔSMI",expr:"0.7 * ndmi + 0.3 * ndwi"},{id:"OIR",label:"OIR",scientificName:"Over-Irrigation Risk",deltaId:"DOIR",deltaLabel:"ΔOIR",expr:"ndwi - ndvi"},{id:"WDSI",label:"WDSI",scientificName:"Water Drought Situation Index (0.40·NDMI + 0.35·NDWI + 0.15·NDVI + 0.10·SAVI)",deltaId:"DWDSI",deltaLabel:"ΔWDSI",expr:"0.40 * ndmi + 0.35 * ndwi + 0.15 * ndvi + 0.10 * savi"},{id:"DSI",label:"DSI",scientificName:"Drought Severity Index (0.50·(1−VCI) + 0.30·(1−SMCI) + 0.20·(1−NDMI_norm)) · 10-class",deltaId:"DDSI",deltaLabel:"ΔDSI",expr:qi}]},{id:"irrigation-field",groupLabel:"🚜 Irrigation & Field Management",indices:[{id:"IEI",label:"IEI",scientificName:"Irrigation Efficiency Index",deltaId:"DIEI",deltaLabel:"ΔIEI",expr:"savi === 0 ? 0 : ndmi / savi"},{id:"UII",label:"UII",scientificName:"Under-Irrigation Index",deltaId:"DUII",deltaLabel:"ΔUII",expr:"savi - ndmi"},{id:"FPR",label:"FPR",scientificName:"Field Performance Ratio",deltaId:"DFPR",deltaLabel:"ΔFPR",expr:"(1 - ndvi) + (1 - ndmi)"},{id:"CPI",label:"CPI",scientificName:"Crop Production Index",deltaId:"DCPI",deltaLabel:"ΔCPI",expr:"0.4 * ndvi + 0.3 * ndmi + 0.2 * savi + 0.1 * ndwi"},{id:"ISS",label:"ISS",scientificName:"Irrigation Stress Score (0.40·NDMI + 0.30·NDWI + 0.20·NDVI + 0.10·SAVI)",deltaId:"DISS",deltaLabel:"ΔISS",expr:"0.40 * ndmi + 0.30 * ndwi + 0.20 * ndvi + 0.10 * savi"},{id:"WAPI",label:"WAPI",scientificName:"Water Allocation Priority Index (0.40·WDSI + 0.20·ΔWDSI + 0.20·(1−NDMI) + 0.10·ETstress + 0.10) · 10-class",deltaId:"DWAPI",deltaLabel:"ΔWAPI",expr:er}]},{id:"growth-stability",groupLabel:"🌾 Growth & Stability",indices:[{id:"GPI",label:"GPI",scientificName:"Growth Performance Index",deltaId:"DGPI",deltaLabel:"ΔGPI",expr:"(ndvi + savi + ndmi) / 3"},{id:"CSI2",label:"CSI2",scientificName:"Canopy Stability Index II",deltaId:"DCSI2",deltaLabel:"ΔCSI2",expr:"1 - Math.abs(ndvi - savi)"},{id:"CRI",label:"CRI",scientificName:"Crop Resilience Index",deltaId:"DCRI",deltaLabel:"ΔCRI",expr:"ndvi + ndmi"},{id:"VDG",label:"VDG",scientificName:"Vegetation Decline Gradient",deltaId:"DVDG",deltaLabel:"ΔVDG",expr:"1 - ((ndvi + savi) / 2)"}]},{id:"risk-composite",groupLabel:"⚠️ Risk & Composite",indices:[{id:"ARI",label:"ARI",scientificName:"Agro Risk Index",deltaId:"DARI",deltaLabel:"ΔARI",expr:"1 - ((ndvi + ndmi + ndwi + savi) / 4)"},{id:"CHS",label:"CHS",scientificName:"Crop Health Score (0.30·NDVI + 0.25·NDRE + 0.20·EVI + 0.15·NDMI + 0.10·SAVI)",deltaId:"DCHS",deltaLabel:"ΔCHS",expr:"0.30 * ndvi + 0.25 * ndre + 0.20 * evi + 0.15 * ndmi + 0.10 * savi"},{id:"CPS",label:"CPS",scientificName:"Crop Pressure Score",deltaId:"DCPS",deltaLabel:"ΔCPS",expr:"(1 - ndvi) + (1 - ndmi)"}]},{id:"crop-phenology",groupLabel:"📅 Crop Phenology & Calendar",indices:[{id:"PRI",label:"PRI",scientificName:"Planting Readiness Index (0.35·NDVI + 0.25·NDMI + 0.20·NDWI + 0.10·SAVI + 0.10·EVI)",deltaId:"DPRI",deltaLabel:"ΔPRI",expr:"0.35 * ndvi + 0.25 * ndmi + 0.20 * ndwi + 0.10 * savi + 0.10 * evi"},{id:"CGI",label:"CGI",scientificName:"Crop Growth Index (0.40·NDVI + 0.30·EVI + 0.20·NDRE + 0.10·NDMI)",deltaId:"DCGI",deltaLabel:"ΔCGI",expr:"0.40 * ndvi + 0.30 * evi + 0.20 * ndre + 0.10 * ndmi"},{id:"CMI",label:"CMI",scientificName:"Crop Maturity Index (0.50·NDRE + 0.30·NDVI + 0.20·EVI)",deltaId:"DCMI",deltaLabel:"ΔCMI",expr:"0.50 * ndre + 0.30 * ndvi + 0.20 * evi"},{id:"HRI",label:"HRI",scientificName:"Harvest Readiness Index (0.40·(1−NDVI) + 0.25·(1−NDRE) + 0.20·(1−NDMI) + 0.15·(1−SAVI))",deltaId:"DHRI",deltaLabel:"ΔHRI",expr:"0.40 * (1 - ndvi) + 0.25 * (1 - ndre) + 0.20 * (1 - ndmi) + 0.15 * (1 - savi)"},{id:"VRI",label:"VRI",scientificName:"Vegetation Recovery Index ((NDVI − MinNDVI) / (MaxNDVI − MinNDVI))",deltaId:"DVRI",deltaLabel:"ΔVRI",expr:"(ndvi + 1) / 2"},{id:"CCI",label:"CCI",scientificName:"Crop Calendar Confidence Index (NDVI/NDRE/EVI stability · observation density)",deltaId:"DCCI",deltaLabel:"ΔCCI",expr:"0.40 * ndvi + 0.30 * ndre + 0.20 * evi + 0.10 * savi"},{id:"EPD",label:"EPD",scientificName:"Estimated Planting Date (first PRI≥0.45 with rising NDVI)",deltaId:"DEPD",deltaLabel:"ΔEPD",expr:"0.35 * ndvi + 0.25 * ndmi + 0.20 * ndwi + 0.10 * savi + 0.10 * evi"},{id:"EHD",label:"EHD",scientificName:"Estimated Harvest Date (first HRI≥0.70 with falling NDVI)",deltaId:"DEHD",deltaLabel:"ΔEHD",expr:"0.40 * (1 - ndvi) + 0.25 * (1 - ndre) + 0.20 * (1 - ndmi) + 0.15 * (1 - savi)"}]},{id:"soil-salinity",groupLabel:"🧂 Soil & Salinity Layer",indices:[{id:"NDSI",label:"NDSI",scientificName:"Normalized Difference Salinity Index ((B11−B8)/(B11+B8))",deltaId:"DNDSI",deltaLabel:"ΔNDSI",expr:"ndsi"},{id:"SI",label:"SI",scientificName:"Salinity Index (√(B3·B4))",deltaId:"DSAL",deltaLabel:"ΔSI",expr:"si"},{id:"SSI",label:"SSI",scientificName:"Soil Salinity Index (NDSI + SI)",deltaId:"DSSI",deltaLabel:"ΔSSI",expr:"ssi"}]},{id:"gold-exploration",groupLabel:"🪙 Gold Exploration Indices",indices:[{id:"IOI",label:"IOI",scientificName:"Iron Oxide Index · B04 / B02",deltaId:"DIOI",deltaLabel:"ΔIOI",expr:"ioi"},{id:"CLAY_MI",label:"CMI",scientificName:"Clay Mineral Index (CMI) · B11 / B12",deltaId:"DCLAY_MI",deltaLabel:"ΔCMI",expr:"clay_mi"},{id:"FMI",label:"FMI",scientificName:"Ferrous Mineral Index · B11 / B08",deltaId:"DFMI",deltaLabel:"ΔFMI",expr:"fmi"},{id:"NDAI",label:"NDAI",scientificName:"Normalized Difference Alteration Index · (B11 − B12) / (B11 + B12)",deltaId:"DNDAI",deltaLabel:"ΔNDAI",expr:"ndai"},{id:"BSI",label:"BSI",scientificName:"Bare Soil Index · ((B11 + B04) − (B08 + B02)) / ((B11 + B04) + (B08 + B02))",deltaId:"DBSI",deltaLabel:"ΔBSI",expr:"bsi"},{id:"REAI",label:"REAI",scientificName:"Red Edge Alteration Index · B06 / B05",deltaId:"DREAI",deltaLabel:"ΔREAI",expr:"reai"},{id:"GEI",label:"GEI",scientificName:"Composite Gold Exploration Index · 0.35(IOI) + 0.30(CMI) + 0.20(FMI) + 0.15(BSI)",deltaId:"DGEI",deltaLabel:"ΔGEI",expr:"gei"},{id:"GCI",label:"GCI",scientificName:"Gold Composite Index · 0.30(IOI) + 0.25(CMI) + 0.20(FMI) + 0.15(NDAI) + 0.10(BSI)",deltaId:"DGCI",deltaLabel:"ΔGCI",expr:"gci"},{id:"EGCI",label:"EGCI",scientificName:"Estimated Gold Concentration Index · 0.30(IOIN) + 0.25(CMIN) + 0.20(FMIN) + 0.15(NDAIN) + 0.10(BSIN)",deltaId:"DEGCI",deltaLabel:"ΔEGCI",expr:"egci"}]},{id:"crop",groupLabel:"🌾 Crop",indices:[{id:"CHAS",label:"CHAS",scientificName:"Crop Health Analysis Score (NDVI·NDWI·NDMI·SAVI fusion)",deltaId:"DCHAS",deltaLabel:"ΔCHAS",expr:_n}]},{id:"mangrove",groupLabel:"Live Analysis · Mangrove",indices:na.map(e=>({id:e.id,label:e.label,scientificName:e.scientificName,deltaId:e.deltaId,deltaLabel:e.deltaLabel,expr:e.expr}))}],be=new Map,te=new Map,ne=new Set,Et=new Set(["gold-exploration","mangrove"]);for(const e of xe){const t=!Et.has(e.id);for(const n of e.indices)be.set(n.id.toUpperCase(),n),ne.add(n.id.toUpperCase()),t&&(te.set(n.deltaId.toUpperCase(),n),ne.add(n.deltaId.toUpperCase()))}for(const e of Ye)be.set(e.id.toUpperCase(),e),ne.add(e.id.toUpperCase());const Gr=xe.filter(e=>!Et.has(e.id)).map(e=>({id:`${e.id}-delta`,groupLabel:`${e.groupLabel} (Delta)`,indices:e.indices.map(t=>({id:t.deltaId,label:t.deltaLabel,scientificName:`Change · ${t.scientificName}`,deltaId:t.deltaId,deltaLabel:t.deltaLabel,expr:t.expr}))}));function Kr(e){return be.has(String(e||"").trim().toUpperCase())}function _(e){return te.has(String(e||"").trim().toUpperCase())}function ia(e){const t=String(e||"").trim().toUpperCase();return ne.has(t)}function Mt(e){const t=String(e||"").trim().toUpperCase();return be.get(t)??te.get(t)??null}function At(e){const t=String(e||"").trim().toUpperCase();if(!te.has(t))return null;for(const n of xe)if(!Et.has(n.id)){for(const a of n.indices)if(a.deltaId.toUpperCase()===t)return a.id}return null}function yt(e,t=""){const n=Mt(e);return n?t?n.expr.replace(/\bndvi\b/g,`${t}ndvi`).replace(/\bndmi\b/g,`${t}ndmi`).replace(/\bndwi\b/g,`${t}ndwi`).replace(/\bsavi\b/g,`${t}savi`):n.expr:null}function Yr(){const e=[{name:"SAVI",title:"SAVI"},{name:"ET",title:"Evapotranspiration"},{name:"LST",title:"Land Surface Temperature"},{name:"DATAMASK",title:"DataMask"}],t=new Set(e.map(n=>n.name.toUpperCase()));for(const n of ne??[]){if(t.has(n))continue;t.add(n);const a=be.get(n)??te.get(n);if(!a)continue;const i=te.has(n)?a.deltaLabel:a.label;e.push({name:n,title:i})}return e}function Uc(e){const t=String(e||"").trim().toUpperCase();if(!t)return;if(t in Xe)return Xe[t];const n=Cr(t);if(n)return n.scientificName;if(le(t))return Fn;if(F(t))return dt;if(k(t))return gt;if(vt(t))return Ur;const a=Mt(t);if(a)return _(t)?`Change · ${a.scientificName}`:a.scientificName}function Xr(e){const t=new Map;for(const r of e){const s=String(r.name||"").trim();s&&t.set(s.toUpperCase(),String(r.title||s).trim()||s)}const n=[];n.push({id:"core",label:"Core Interpretation",options:on.map(r=>({id:r,label:r,scientificName:Xe[r]}))}),n.push({id:"live-analysis-lulc",label:"Live Analysis · Land Cover",options:[{id:Le,label:"LULC",scientificName:Fn}]}),n.push({id:"live-analysis-anomaly",label:"Live Analysis · Anomaly",options:[{id:Ie,label:"ADI",scientificName:dt}]}),n.push({id:"live-analysis-cultivation",label:"Live Analysis · Cultivation",options:[{id:ge,label:"NCADI",scientificName:gt}]}),n.push({id:"live-analysis-mangrove",label:"Live Analysis · Mangrove",options:na.map(r=>({id:r.id,label:r.label,scientificName:r.scientificName}))});for(const r of xe)r.id!=="mangrove"&&n.push({id:r.id,label:r.groupLabel,options:r.indices.map(s=>({id:s.id,label:s.label,scientificName:s.scientificName}))});Ye.length&&n.push({id:"derived-alert",label:"🚨 Derived Alert Layers",options:Ye.filter(r=>!F(r.id)&&!k(r.id)).map(r=>({id:r.id,label:r.label,scientificName:r.scientificName}))});for(const r of Gr)n.push({id:r.id,label:r.groupLabel,options:r.indices.map(s=>({id:s.id,label:s.label,scientificName:s.scientificName}))});const a=new Set([...on.map(r=>r.toUpperCase()),...ne,Le,$r,"DATAMASK",...ta.map(r=>r.toUpperCase())]),i=e.map(r=>{const s=String(r.name||"").trim();return!s||a.has(s.toUpperCase())?null:{id:s,label:String(r.title||s).trim()||s,scientificName:void 0}}).filter(r=>r!=null).sort((r,s)=>r.label.localeCompare(s.label,void 0,{sensitivity:"base"}));return i.length&&n.push({id:"sentinel-presets",label:"Sentinel Hub layers",options:i}),n.filter(r=>r.options.length>0)}function zr(e){const t=[],n=new Set;for(const a of e)for(const i of a.options){const r=i.id.toUpperCase();n.has(r)||(n.add(r),t.push(i))}return t}const Te=10,jr=[1,2,3,4,5,6,7,8,9],Gc=["Extremely Low ET","Very Low ET","Low ET","Slightly Low ET","Moderate ET","Moderately High ET","High ET","Very High ET","Extremely High ET","Exceptional ET"],ra=[.5,1.5,2.5,3.5,4.5,5.5,6.5,7.5,8.5,9.5],Zr=[1981066,1920728,165063,959977,2278750,10741301,16638023,16498468,16347926,14427686],ze=ra.map((e,t)=>[e,Zr[t]]);function Lt(e){return Number.isFinite(e)?Math.max(0,Math.min(1,e)):0}function P(e,t,n){return Number.isFinite(e)?Math.max(t,Math.min(n,e)):t}function qr(e){const t=String(e||"").trim().slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(t))return 180;const n=new Date(`${t}T12:00:00Z`);if(Number.isNaN(n.getTime()))return 180;const a=Date.UTC(n.getUTCFullYear(),0,0);return Math.round((n.getTime()-a)/864e5)}function Ne(e){const t=typeof e=="number"&&Number.isFinite(e)?Math.max(1,Math.min(366,Math.round(e))):qr(typeof e=="string"?e:null),n=Math.sin(2*Math.PI*(t-80)/365);return Number((.45+.55*(.5+.5*n)).toFixed(4))}function sa(e){return e==null||!Number.isFinite(e)?.85:Number(P(.15+1.25*e,.15,1.25).toFixed(4))}function la(e,t){return .6*e+.4*t}function Jr(e,t){return Lt(1-la(e,t))}function Qr(e,t,n){const a=Jr(e,t),i=(n==null?void 0:n.seasonFactor)!=null&&Number.isFinite(n.seasonFactor)?P(n.seasonFactor,.35,1.15):Ne(n==null?void 0:n.sceneDate),r=(n==null?void 0:n.kc)!=null&&Number.isFinite(n.kc)?P(n.kc,.15,1.35):sa(n==null?void 0:n.ndvi);return Number((a*i*r*Te).toFixed(3))}function es(e){const t=(e==null?void 0:e.seasonFactor)!=null&&Number.isFinite(e.seasonFactor)?P(e.seasonFactor,.35,1.15):Ne(e==null?void 0:e.sceneDate),n=(e==null?void 0:e.kc)!=null&&Number.isFinite(e.kc)?P(e.kc,.15,1.35):sa(e==null?void 0:e.ndvi);return Number((t*n*Te).toFixed(3))}function ts(e,t){const n=la(e,t),a=-.2,r=Lt((n-a)/(.35-a));return Number(P(.5+.5*r,.5,1).toFixed(4))}function ns(e,t,n){return!Number.isFinite(e)||e<=0?0:Number((e*ts(t,n)).toFixed(3))}function Kc(e,t,n){const a=es(n);return{etaMmDay:ns(a,e,t),etcMmDay:a}}function as(e=.85){return`Math.max(0, Math.min(15, Math.max(0, Math.min(1, 1 - (0.6 * ndmi + 0.4 * ndwi))) * ${Number(e.toFixed(4))} * Math.max(0.15, Math.min(1.25, 0.15 + 1.25 * ndvi)) * ${Te}))`}as(.85);function oa(e=.85){return`let ndmi = index(samples.B08, samples.B11);
  let ndwi = index(samples.B03, samples.B08);
  let ndvi = index(samples.B08, samples.B04);
  let demand = Math.max(0, Math.min(1, 1 - (0.6 * ndmi + 0.4 * ndwi)));
  let kc = Math.max(0.15, Math.min(1.25, 0.15 + 1.25 * ndvi));
  let et = Math.max(0, Math.min(15, demand * ${Number(e.toFixed(4))} * kc * ${Te}));`}const is=oa(.85);function Yc(e=15,t=.25){const n=[];for(let a=0;a<=e+1e-9;a+=t)n.push(Number(a.toFixed(4)));return n}function Xc(e,t=10){if(!e.length||t<2)return null;const n=[...e].sort((o,c)=>o.lowEdge-c.lowEdge),a=n.reduce((o,c)=>o+Math.max(0,c.count||0),0);if(a<t)return null;const i=[n[0].lowEdge];let r=0,s=1;for(const o of n)for(r+=Math.max(0,o.count||0);s<t&&r/a>=s/t;){const c=Number(o.highEdge.toFixed(4));c>i[i.length-1]&&i.push(c),s+=1}const l=n[n.length-1].highEdge;for(;i.length<t;)i.push(Number(l.toFixed(4)));i.push(Number(Math.max(l,i[i.length-1]).toFixed(4)));for(let o=1;o<i.length;o+=1)i[o]<=i[o-1]&&(i[o]=Number((i[o-1]+.001).toFixed(4)));return i.length===t+1?i:null}function zc(e,t){const n=Math.max(0,t.length-1),a=new Array(n).fill(0);if(n<1)return a;for(const i of e){const r=Math.max(0,i.count||0);if(!r)continue;const s=(i.lowEdge+i.highEdge)/2;let l=n-1;for(let o=0;o<n;o+=1){if(s>=t[o]&&s<t[o+1]){l=o;break}if(s<t[0]){l=0;break}}a[l]+=r}return a}function rs(e){const t=[];for(let n=0;n<e.length-1;n+=1)t.push(Number(((e[n]+e[n+1])/2).toFixed(4)));return t}const ss=[12,16,20,24,28,32,36,40,44],jc=["Very cold surface","Cold","Cool","Mild cool","Mild","Warm","Hot","Very hot","Extreme heat","Critical heat"],ca=[10,14,18,22,26,30,34,38,42,48],ls=[1981066,1920728,959977,2278750,10741301,16638023,16498468,16347926,15680580,10033947],je=ca.map((e,t)=>[e,ls[t]]);function os(e){return Number.isFinite(e)?Lt(.5-.5*P(e,-1,1)):.5}function cs(e,t,n){const i=18+24*((n==null?void 0:n.seasonFactor)!=null&&Number.isFinite(n.seasonFactor)?P(n.seasonFactor,.35,1.15):Ne(n==null?void 0:n.sceneDate)),r=Number.isFinite(e)?P(e,-.2,1):.3,s=os(t),l=i-12*r+8*s;return Number(P(l,5,55).toFixed(2))}function us(e=.85){return`Math.max(5, Math.min(55, (18 + 24 * ${Number(e.toFixed(4))}) - 12 * Math.max(-0.2, Math.min(1, ndvi)) + 8 * Math.max(0, Math.min(1, 0.5 - 0.5 * Math.max(-1, Math.min(1, ndmi))))))`}us(.85);function ua(e=.85){return`let ndvi = index(samples.B08, samples.B04);
  let ndmi = index(samples.B08, samples.B11);
  let dryness = Math.max(0, Math.min(1, 0.5 - 0.5 * Math.max(-1, Math.min(1, ndmi))));
  let lst = Math.max(5, Math.min(55, (18 + 24 * ${Number(e.toFixed(4))}) - 12 * Math.max(-0.2, Math.min(1, ndvi)) + 8 * dryness));`}const ds=ua(.85);function ms(e){const t=[];for(let n=0;n<e.length-1;n+=1)t.push(Number(((e[n]+e[n+1])/2).toFixed(2)));return t}const fs=.005,da=100,ma=[2,3,4,5,6,7,11],fa=.65,Ia=.45,ga=.55,Is=.18;function Sa(e){return e.map(t=>`scl == ${t}`).join(" || ")}const We="(s.CLP > 1.5 ? s.CLP / 255.0 : s.CLP)",gs=`!(${Sa(ma)}) && ((scl == 9 && ${We} >= ${Ia}) || (scl == 10 && ${We} >= ${ga}) || (scl == 8 && ${We} >= ${fa}))`;function pa(e="s"){return`var scl = Math.round(${e}.SCL);
  var cloud = ${gs.replace(/s\./g,`${e}.`)};`}function ha(e="s"){return`${pa(e)}
  if (!${e}.dataMask || cloud) return [0, 0, 0, 0];`}const Ss=`//VERSION=3
function setup() {
  return {
    input: [{ bands: ["SCL", "CLP", "dataMask"] }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  ${pa("s")}
  if (!s.dataMask) return [0, 0, 0, 0];
  return cloud ? [255, 0, 0, 255] : [0, 255, 0, 255];
}`;function ps(e){let t=0,n=0;for(let s=0;s<e.length;s+=4){const l=e[s],o=e[s+1];e[s+3]<128||(o>200&&l<80?t+=1:l>200&&o<80&&(n+=1))}const a=t+n;if(a===0)return{clearCount:0,cloudCount:0,maskedCount:0,validCount:0,aoiCloudCoverPct:null,aoiClearCoverPct:null};const i=Math.round(n/a*1e3)/10,r=Math.round(t/a*1e3)/10;return{clearCount:t,cloudCount:n,maskedCount:n,validCount:t,aoiCloudCoverPct:i,aoiClearCoverPct:r}}function Ca(e,t,n){const i=(t.validCount+t.maskedCount>0?t.validCount/(t.validCount+t.maskedCount):0)>=fs;return{sceneId:(n==null?void 0:n.sceneId)??e,acquisitionDate:e,originalCloudCoverage:(n==null?void 0:n.originalCloudCoverage)!=null&&Number.isFinite(n.originalCloudCoverage)?n.originalCloudCoverage:null,aoiCloudPercentage:t.aoiCloudCoverPct,aoiClearPercentage:t.aoiClearCoverPct,maskedPixelCount:t.maskedCount,validPixelCount:t.validCount,usable:i,status:i?t.aoiClearCoverPct!=null&&t.aoiClearCoverPct>=80?"clear":"partial_cloud_masked":"no_clear_pixels"}}function ba(e){console.info("[sentinel-s2-cloud]",{sceneId:e.sceneId,acquisitionDate:e.acquisitionDate,originalCloudCoverage:e.originalCloudCoverage,aoiCloudPct:e.aoiCloudPercentage,aoiClearPct:e.aoiClearPercentage,maskedPixels:e.maskedPixelCount,validPixels:e.validPixelCount,status:e.status,usable:e.usable})}const hs=["SCL","CLP"],Ee=2.5,Cs=["B02","B03","B04",...hs];function Na(e){return`function cloudProb(s) {
  return s.CLP > 1.5 ? s.CLP / 255.0 : s.CLP;
}
function cloudMasked(s) {
  var scl = Math.round(s.SCL);
  if (${Sa(ma)}) return false;
  var clp = cloudProb(s);
  var vis = (s.B02 + s.B03 + s.B04) / 3;
  if (vis < ${Is}) return false;
  if (scl == 9 && clp >= ${Ia}) return true;
  if (scl == 10 && clp >= ${ga}) return true;
  if (scl == 8 && clp >= ${fa}) return true;
  return false;
}
function tc(v) { return Math.max(0, Math.min(1, v * ${Ee})); }
function trueColor(s) { return [tc(s.B04), tc(s.B03), tc(s.B02), 1]; }`}function bs(e="samples",t="inlineRgb"){return t==="transparent"?`if (!${e}.dataMask) return [0, 0, 0, 0];
  if (cloudMasked(${e})) return [0, 0, 0, 0];`:`if (!${e}.dataMask) return [0, 0, 0, 0];
  if (cloudMasked(${e})) return trueColor(${e});`}const Bt=[[-1,4000266],[-.12,6029312],[-.04,9109504],[.04,12986408],[.12,15022389],[.17,16733986],[.22,16750592],[.28,16758605],[.34,16764032],[.4,16774557]],_t=[[.42,10275941],[.47,8172354],[.52,4431943],[.57,3706428],[.62,3046706],[.72,1793568],[.85,994842],[1,339478]];[...Bt,..._t.filter(([e])=>e>.4)];function Ns(e){return ya(e,Bt)}function vs(e){return e<.42?Ns(e):ya(e,_t)}const Es=[...Bt,..._t],Zc=[-.08,.02,.1,.18,.26,.34,.42,.52,.62],va=[-.14,-.03,.06,.14,.22,.3,.38,.47,.57,.72],Ea=va.map(e=>vs(e)),Ms=va.map((e,t)=>[e,Ea[t]]);function Ma(e,t,n){const a=Math.max(0,Math.min(1,n)),i=e>>16&255,r=e>>8&255,s=e&255,l=t>>16&255,o=t>>8&255,c=t&255,u=Math.round(i+(l-i)*a),d=Math.round(r+(o-r)*a),f=Math.round(s+(c-s)*a);return(u<<16|d<<8|f)>>>0}const Aa=[[-.8,32768],[0,16777215],[.8,204]],qc=[-.64,-.48,-.32,-.16,0,.16,.32,.48,.64],D=[25600,32768,6732650,13166281,16777215,11789820,5227511,236517,161725,128],Jc=[[-.72,D[0]],[-.56,D[1]],[-.4,D[2]],[-.24,D[3]],[-.08,D[4]],[.08,D[5]],[.24,D[6]],[.4,D[7]],[.56,D[8]],[.72,D[9]]],M=[[-.5,8323072],[-.1,13840175],[.1,16011550],[.25,16771899],[.4,11457921],[.55,6732650],[.7,3706428],[.85,3046706],[1,1793568]],Qc=[-.35,-.2,-.05,.1,.25,.4,.55,.7,.85];function x(e){if(e<=M[0][0])return M[0][1];if(e>=M[M.length-1][0])return M[M.length-1][1];for(let t=0;t<M.length-1;t++){const[n,a]=M[t],[i,r]=M[t+1];if(e>=n&&e<=i){const s=i-n,l=s>0?(e-n)/s:0;return Ma(a,r,l)}}return M[M.length-1][1]}const T=[x(-.425),x(-.275),x(-.125),x(.025),x(.175),x(.325),x(.475),x(.625),x(.775),x(.925)],eu=[[-.425,T[0]],[-.275,T[1]],[-.125,T[2]],[.025,T[3]],[.175,T[4]],[.325,T[5]],[.475,T[6]],[.625,T[7]],[.775,T[8]],[.925,T[9]]],As=[-2,-1,-.5,0,.2,.5,1,2,4],y=[15260872,13943976,12888194,12096874,11789820,5227511,2733814,166097,1402304,340065],tu=340065,ys=[[-2.5,y[0]],[-1.5,y[1]],[-.75,y[2]],[-.25,y[3]],[.1,y[4]],[.35,y[5]],[.75,y[6]],[1.5,y[7]],[3,y[8]],[5,y[9]]],Ls=[-.6,-.45,-.3,-.15,0,.1,.2,.35,.5],L=[15260872,13943976,12888194,12096874,10506797,10935200,4306628,2915254,2188972,340065],Bs=[[-.675,L[0]],[-.525,L[1]],[-.375,L[2]],[-.225,L[3]],[-.075,L[4]],[.05,L[5]],[.15,L[6]],[.275,L[7]],[.425,L[8]],[.65,L[9]]],Rt=[[-.8,8388608],[-.24,16711680],[-.032,16776960],[.032,65535],[.24,255],[.8,128]],nu=[-.64,-.48,-.32,-.16,0,.16,.32,.48,.64];function ya(e,t){if(!t.length)return 0;if(e<=t[0][0])return t[0][1];if(e>=t[t.length-1][0])return t[t.length-1][1];for(let n=0;n<t.length-1;n++){const[a,i]=t[n],[r,s]=t[n+1];if(e>=a&&e<=r){const l=r-a,o=l>0?(e-a)/l:0;return Ma(i,s,o)}}return t[t.length-1][1]}const w=[8388608,16711680,16737792,16776960,16777113,11789820,5227511,2733814,166097,128],au=[[-.72,w[0]],[-.56,w[1]],[-.4,w[2]],[-.24,w[3]],[-.08,w[4]],[.08,w[5]],[.24,w[6]],[.4,w[7]],[.56,w[8]],[.72,w[9]]],_s=Rt,La=Rt,Rs=[[-.2,1710618],[0,14142664],[.1,16774557],[.2,14477173],[.3,11457921],[.4,8172354],[.5,5606191],[.65,3369246],[.8,1793568],[1,19712]],Ds=[[-.5,2171169],[-.2,12434877],[0,16119260],[.1,15134364],[.2,13491257],[.3,11457921],[.4,6732650],[.5,4431943],[.6,3046706],[.75,1793568],[1,17408]],xs=[[-.2,3622735],[0,15723497],[.1,14478792],[.2,10868391],[.35,6732650],[.5,3706428],[.65,3046706],[.8,1793568],[1,17408]],Ts=[[-1,1776411],[-.2,6381921],[0,10395294],[.1,12434877],[.25,14737632],[.4,16119285],[.6,16777215],[1,16777215]],ws=[[-.2,4073251],[0,16764092],[.1,16755601],[.2,10868391],[.35,6732650],[.5,3706428],[.65,3046706],[.8,1793568],[1,17408]],Ba={ndvi:{inputs:["B04","B08","dataMask"],indexVar:"ndvi",indexExpr:"let ndvi = index(samples.B08, samples.B04);",ramp:Ms},ndwi:{inputs:["B03","B08","dataMask"],indexVar:"ndwi",indexExpr:"let ndwi = index(samples.B03, samples.B08);",ramp:Aa},mndwi:{inputs:["B03","B11","dataMask"],indexVar:"mndwi",indexExpr:"let mndwi = index(samples.B03, samples.B11);",ramp:Bs},awei:{inputs:["B03","B08","B11","B12","dataMask"],indexVar:"awei",indexExpr:"let awei = 4.0 * (samples.B03 - samples.B11) - (0.25 * samples.B08 + 2.75 * samples.B12);",ramp:ys},nbr:{inputs:["B08","B12","dataMask"],indexVar:"nbr",indexExpr:"let nbr = index(samples.B08, samples.B12);",ramp:M},ndmi:{inputs:["B8A","B11","dataMask"],indexVar:"ndmi",indexExpr:"let ndmi = index(samples.B8A, samples.B11);",ramp:_s},ndii:{inputs:["B08","B11","dataMask"],indexVar:"ndii",indexExpr:"let ndii = index(samples.B08, samples.B11);",ramp:La},evi:{inputs:["B02","B04","B08","dataMask"],indexVar:"evi",indexExpr:"let evi = 2.5 * ((samples.B08 - samples.B04) / (samples.B08 + 6.0 * samples.B04 - 7.5 * samples.B02 + 1.0));",ramp:Rs},savi:{inputs:["B04","B08","dataMask"],indexVar:"savi",indexExpr:"let savi = ((samples.B08 - samples.B04) * 1.5) / (samples.B08 + samples.B04 + 0.5);",ramp:Ds},gndvi:{inputs:["B03","B08","dataMask"],indexVar:"gndvi",indexExpr:"let gndvi = index(samples.B08, samples.B03);",ramp:xs},ndsi:{inputs:["B03","B11","dataMask"],indexVar:"ndsi",indexExpr:"let ndsi = index(samples.B03, samples.B11);",ramp:Ts},ndre:{inputs:["B05","B08","dataMask"],indexVar:"ndre",indexExpr:"let ndre = index(samples.B08, samples.B05);",ramp:ws},et:{inputs:["B03","B04","B08","B11","dataMask"],indexVar:"et",indexExpr:is,ramp:ze},lst:{inputs:["B04","B08","B11","dataMask"],indexVar:"lst",indexExpr:ds,ramp:je}};function Ps(e){return`0x${(e>>>0).toString(16).padStart(6,"0")}`}function W(e){return e.map(([t,n])=>`[${t}, ${Ps(n)}]`).join(`,
   `)}function ae(e){return e.map(t=>String(t)).join(", ")}function H(e){const t=e.filter(n=>n!=="dataMask");for(const n of Cs)t.includes(n)||t.push(n);return[...t,"dataMask"]}const $=Na();function U(e){return bs("samples",e?"transparent":"inlineRgb")}function G(e=null){return e?`var a = samples.dataMask * (${e} ? 1.0 : 0.0);
  return imgVals.concat(a);`:"return imgVals.concat(samples.dataMask);"}function Vs(e=null,t){const n=e!=null&&Number.isFinite(e)?Math.max(-1,Math.min(1,e)):null,a=U(t==null?void 0:t.terrain3dCloudExtrusion),i=G(n==null?null:`val >= ${n}`);return`//VERSION=3
// NDWI — green (dry) → white (neutral) → blue (water)
function setup() {
  return {
    input: ${JSON.stringify(H(["B03","B08","dataMask"]))},
    output: { bands: 4 }
  };
}

const ramp = [
   ${W(Aa)}
];

const visualizer = new ColorRampVisualizer(ramp);

${$}

function evaluatePixel(samples) {
  ${a}
  let val = index(samples.B03, samples.B08);
  let imgVals = visualizer.process(val);
  ${i}
}`}function Fs(e=null,t){const n=e!=null&&Number.isFinite(e)?Math.max(-1,Math.min(1,e)):null,a=U(t==null?void 0:t.terrain3dCloudExtrusion),i=G(n==null?null:`val >= ${n}`);return`//VERSION=3
// AWEI — 10 classes · non-water warm → open / deep water blue
function setup() {
  return {
    input: ${JSON.stringify(H(["B03","B08","B11","B12","dataMask"]))},
    output: { bands: 4 }
  };
}

const classRamp = [
   ${W(y.map((r,s)=>[s,r]))}
];
const viz = new ColorRampVisualizer(classRamp);

${$}

const BREAKS = [${ae(As)}];

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
  ${i}
}`}function Os(e=null,t){const n=e!=null&&Number.isFinite(e)?Math.max(-1,Math.min(1,e)):null,a=U(t==null?void 0:t.terrain3dCloudExtrusion),i=G(n==null?null:`val >= ${n}`);return`//VERSION=3
// MNDWI — 10 classes · light dry gradient → open / deep water blue
function setup() {
  return {
    input: ${JSON.stringify(H(["B03","B11","dataMask"]))},
    output: { bands: 4 }
  };
}

const classRamp = [
   ${W(L.map((r,s)=>[s,r]))}
];
const viz = new ColorRampVisualizer(classRamp);

${$}

const BREAKS = [${ae(Ls)}];

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
  ${i}
}`}function ks(e=null,t){const n=e!=null&&Number.isFinite(e)?Math.max(-1,Math.min(1,e)):null,a=U(t==null?void 0:t.terrain3dCloudExtrusion),i=G(n==null?null:`val >= ${n}`);return`//VERSION=3
// NDII — continuous moisture ramp (B08 / B11)
function setup() {
  return {
    input: ${JSON.stringify(H(["B08","B11","dataMask"]))},
    output: { bands: 4 }
  };
}

const moistureRamps = [
   ${W(La)}
];

const viz = new ColorRampVisualizer(moistureRamps);

${$}

function evaluatePixel(samples) {
  ${a}
  let val = index(samples.B08, samples.B11);
  let imgVals = viz.process(val);
  ${i}
}`}function Ws(e=null,t){const n=e!=null&&Number.isFinite(e)?Math.max(-1,Math.min(1,e)):null,a=U(t==null?void 0:t.terrain3dCloudExtrusion),i=G(n==null?null:`val >= ${n}`);return`//VERSION=3
// NDMI — continuous moisture ramp (B8A / B11)
function setup() {
  return {
    input: ${JSON.stringify(H(["B8A","B11","dataMask"]))},
    output: { bands: 4 }
  };
}

const moistureRamps = [
   ${W(Rt)}
];

const viz = new ColorRampVisualizer(moistureRamps);

${$}

function evaluatePixel(samples) {
  ${a}
  let val = index(samples.B8A, samples.B11);
  let imgVals = viz.process(val);
  ${i}
}`}function Hs(e=null,t){var d;const n=Ne(t==null?void 0:t.sceneDate),a=oa(n);let i=jr,r=ra;const s=t==null?void 0:t.classBreaks;if(s&&s.length>=9){const f=s.length===11?s.slice(1,-1):s.length===9?s:s.slice(1,10);if(f.length===9){i=f;const m=s.length===11?s:[0,...f,Math.max(10,f[f.length-1]+1)];r=((d=t==null?void 0:t.classCenters)==null?void 0:d.length)===10?t.classCenters:rs(m)}}const l=e!=null&&Number.isFinite(e)?Math.max(0,Math.min(15,e)):null,o=U(t==null?void 0:t.terrain3dCloudExtrusion),c=G(l==null?null:`et >= ${l}`),u=r.map((f,m)=>[f,ze[Math.min(m,ze.length-1)][1]]);return`//VERSION=3
// ET — seasonal × Kc × moisture demand (mm/day), 10 classes
function setup() {
  return {
    input: ${JSON.stringify(H(["B03","B04","B08","B11","dataMask"]))},
    output: { bands: 4 }
  };
}

const etRamp = [
   ${W(u)}
];

const viz = new ColorRampVisualizer(etRamp);

${$}

const BREAKS = [${ae(i)}];
const CLASS_VAL = [${ae(r)}];

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
}`}function $s(e=null,t){var d;const n=Ne(t==null?void 0:t.sceneDate),a=ua(n);let i=ss,r=ca;const s=t==null?void 0:t.classBreaks;if(s&&s.length>=9){const f=s.length===11?s.slice(1,-1):s.length===9?s:s.slice(1,10);if(f.length===9){i=f;const m=s.length===11?s:[5,...f,Math.max(55,f[f.length-1]+1)];r=((d=t==null?void 0:t.classCenters)==null?void 0:d.length)===10?t.classCenters:ms(m)}}const l=e!=null&&Number.isFinite(e)?Math.max(5,Math.min(55,e)):null,o=U(t==null?void 0:t.terrain3dCloudExtrusion),c=G(l==null?null:`lst >= ${l}`),u=r.map((f,m)=>[f,je[Math.min(m,je.length-1)][1]]);return`//VERSION=3
// LST — seasonal NDVI/NDMI land-surface temperature proxy (°C), 10 classes
function setup() {
  return {
    input: ${JSON.stringify(H(["B04","B08","B11","dataMask"]))},
    output: { bands: 4 }
  };
}

const lstRamp = [
   ${W(u)}
];

const viz = new ColorRampVisualizer(lstRamp);

${$}

const BREAKS = [${ae(i)}];
const CLASS_VAL = [${ae(r)}];

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
}`}function Us(e=null,t){const n=e!=null&&Number.isFinite(e)?Math.max(-1,Math.min(1,e)):null,a=U(t==null?void 0:t.terrain3dCloudExtrusion),i=G(n==null?null:`ndvi >= ${n}`);return`//VERSION=3
// NDVI — agricultural color ramp on cloud-free pixels; clouds show true color
function setup() {
  return {
    input: ${JSON.stringify(H(["B04","B08","dataMask"]))},
    output: { bands: 4 }
  };
}

const ramp = [
   ${W(Es)}
];

const visualizer = new ColorRampVisualizer(ramp);

${$}

function evaluatePixel(samples) {
  ${a}
  let ndvi = index(samples.B08, samples.B04);
  let imgVals = visualizer.process(ndvi);
  ${i}
}`}function Gs(e,t=null,n){if(e==="ndvi")return Us(t,n);if(e==="ndwi")return Vs(t,n);if(e==="awei")return Fs(t,n);if(e==="mndwi")return Os(t,n);if(e==="ndmi")return Ws(t,n);if(e==="ndii")return ks(t,n);if(e==="et")return Hs(t,n);if(e==="lst")return $s(t,n);const a=Ba[e],i=U(n==null?void 0:n.terrain3dCloudExtrusion),r=t!=null&&Number.isFinite(t)?Math.max(-1,Math.min(1,t)):null,s=G(r==null?null:`${a.indexVar} >= ${r}`),l=e==="ndsi"?Na():$;return`//VERSION=3
function setup() {
  return {
    input: ${JSON.stringify(H(a.inputs))},
    output: { bands: 4 }
  };
}

const ramp = [
   ${W(a.ramp)}
];

const visualizer = new ColorRampVisualizer(ramp);

${l}

function evaluatePixel(samples) {
  ${i}
  ${a.indexExpr}
  let imgVals = visualizer.process(${a.indexVar});
  ${s}
}`}function Ks(e){return e in Ba}function Me(e){return parseInt(e.replace("#",""),16)}function S(...e){return e.map(([t,n,a])=>({t,hex:Me(n),label:a}))}function ve(e,t,n){const a=Math.max(0,Math.min(1,n)),i=e>>16&255,r=e>>8&255,s=e&255,l=t>>16&255,o=t>>8&255,c=t&255,u=Math.round(i+(l-i)*a),d=Math.round(r+(o-r)*a),f=Math.round(s+(c-s)*a);return(u<<16|d<<8|f)>>>0}function Ys(e){return[`Strong ${e} decline`,`Major ${e} decline`,`Moderate ${e} decline`,`Slight ${e} decline`,"Stable · low","Stable · neutral",`Slight ${e} gain`,`Moderate ${e} gain`,`Major ${e} gain`,`Strong ${e} gain`]}function C(e,t,n,a,i){const r=Me(t),s=Me(n),l=Me(a),o=ve(r,s,.78),c=ve(l,s,.78),u=ve(r,o,.45),d=ve(l,c,.45);return{valueMin:-.4,valueMax:.4,anchors:[{t:0,hex:r,label:"Strong decline"},{t:.22,hex:u,label:"Moderate decline"},{t:.44,hex:o,label:"Slight decline"},{t:.5,hex:s,label:"Stable"},{t:.56,hex:c,label:"Slight gain"},{t:.78,hex:d,label:"Moderate gain"},{t:1,hex:l,label:"Strong gain"}],classLabels:Ys(e),subtitle:i}}const _a={CVHI:{valueMin:-1,valueMax:1,anchors:S([0,"#b71c1c","Extreme stress"],[.11,"#c62828","Severe"],[.22,"#e53935","Very poor"],[.33,"#ef5350","Poor"],[.44,"#ff7043","Low health"],[.55,"#ffb300","Moderate stress"],[.66,"#9ccc65","Moderate health"],[.77,"#66bb6a","Good"],[.88,"#2e7d32","Very good"],[1,"#1b5e20","Excellent"]),classLabels:["Extreme Vegetation Stress","Severe Degradation","Very Poor Condition","Poor Vegetation","Low Vegetation Health","Moderate Stress","Moderate Vegetation Health","Good Vegetation Condition","Very Good Vegetation Health","Excellent Vegetation Health"],subtitle:"4-index composite mean · 🔴 critical stress → 🟢 excellent canopy health"},VHS:{valueMin:0,valueMax:1,anchors:S([0,"#7f0000","Critical"],[.33,"#d4a017","Weak"],[.66,"#7cb342","Good"],[1,"#1b5e20","Excellent"]),classLabels:["Critical health","Very poor","Poor","Below average","Fair","Moderate","Good","Very good","Excellent","Peak vigor"],subtitle:"Vegetation Health · crimson = poor · forest green = excellent"},VDI:{valueMin:0,valueMax:1,anchors:S([0,"#2e7d32","Moist canopy"],[.33,"#aed581","Hydrated"],[.66,"#bcaaa4","Drying"],[1,"#4e342e","Very dry"]),classLabels:["Fully hydrated","Well hydrated","Moist","Slightly dry","Moderate dryness","Dry canopy","Very dry","Severe dryness","Critical dryness","Desiccated"],subtitle:"Vegetation dryness · green = moist · brown = dry canopy"},CVI:{valueMin:0,valueMax:1,anchors:S([0,"#4a148c","Low vigor"],[.33,"#7e57c2","Sparse vigor"],[.66,"#43a047","Moderate vigor"],[1,"#1b4332","Peak crop vigor"]),classLabels:["No vigor","Very low","Low","Fair","Moderate","Good","Strong","Very strong","Excellent","Peak Crop Vigor"],subtitle:"Crop Vigor Index · purple = weak · deep green = vigorous canopy"},CSI:{valueMin:0,valueMax:1,anchors:S([0,"#1b5e20","Low stress"],[.33,"#fdd835","Watch"],[.66,"#ef6c00","Stressed"],[1,"#b71c1c","Critical stress"]),classLabels:["Minimal stress","Low stress","Mild stress","Moderate stress","Elevated","High stress","Very high","Severe","Critical","Collapse risk"],subtitle:"Crop stress · green = healthy · red = severe stress"},WST:{valueMin:-1,valueMax:1,anchors:S([0,"#0d47a1","Well watered"],[.33,"#4fc3f7","Adequate"],[.66,"#ffb74d","Water limited"],[1,"#e65100","Severe water stress"]),classLabels:["No water stress","Very low stress","Low stress","Mild stress","Moderate","Elevated stress","High stress","Very high","Severe","Extreme water stress"],subtitle:"Water stress · blue = adequate moisture · orange = stressed"},DRI:{valueMin:0,valueMax:1,anchors:S([0,"#0277bd","Low drought risk"],[.33,"#81d4fa","Mild risk"],[.66,"#ffcc80","Moderate drought"],[1,"#bf360c","Extreme drought"]),classLabels:["Minimal drought","Low risk","Mild risk","Moderate risk","Elevated","High drought","Very high","Severe","Extreme","Catastrophic drought"],subtitle:"Drought risk · sky blue = wet · rust = extreme drought"},VMI:{valueMin:-.5,valueMax:.5,anchors:S([0,"#004d40","Very dry canopy"],[.33,"#00897b","Dry"],[.66,"#4db6ac","Moist"],[1,"#b2dfdb","Saturated canopy"]),classLabels:["Extremely dry","Very dry","Dry","Slightly dry","Neutral","Slightly moist","Moist","Wet canopy","Very wet","Saturated"],subtitle:"Canopy moisture · deep teal = dry · pale aqua = wet foliage"},SMI:{valueMin:-.5,valueMax:.5,anchors:S([0,"#5d4037","Dry soil"],[.33,"#a1887f","Low moisture"],[.66,"#26c6da","Moist soil"],[1,"#006064","Saturated soil"]),classLabels:["Bone dry soil","Very dry","Dry","Slightly dry","Neutral","Slightly moist","Moist soil","Wet soil","Very wet","Waterlogged soil"],subtitle:"Soil moisture · clay brown = dry · cyan = wet soil profile"},OIR:{valueMin:-1,valueMax:1,anchors:S([0,"#33691e","Balanced"],[.33,"#fff176","Watch"],[.66,"#29b6f6","Over-wet"],[1,"#0d47a1","Flood / excess irrigation"]),classLabels:["Optimal balance","Normal","Slight excess watch","Moderate excess","Elevated water","High excess","Over-irrigation","Severe excess","Very severe","Critical over-irrigation"],subtitle:"Over-irrigation · green = balanced · navy = excess water"},WDSI:{valueMin:-.5,valueMax:.65,anchors:S([0,"#4e342e","Severe drought"],[.25,"#bf360c","High drought"],[.5,"#ffb300","Moderate drought"],[.75,"#81c784","Near normal"],[1,"#0277bd","Wet / no drought"]),classLabels:["Extreme drought situation","Severe drought","High drought","Elevated drought","Moderate drought","Mild drought / watch","Near normal","Adequate moisture","Wet conditions","No drought / surplus water"],subtitle:"WDSI · 0.40·NDMI + 0.35·NDWI + 0.15·NDVI + 0.10·SAVI · brown = drought · blue = wet"},IEI:{valueMin:-1,valueMax:2,anchors:S([0,"#c62828","Inefficient"],[.33,"#ffa726","Sub-optimal"],[.66,"#66bb6a","Efficient"],[1,"#1565c0","Highly efficient"]),classLabels:["Critical inefficiency","Poor efficiency","Below target","Fair","Moderate","Good efficiency","Very good","Excellent","Optimal","Peak efficiency"],subtitle:"Irrigation efficiency · red = waste · blue = optimal delivery"},UII:{valueMin:-1,valueMax:1,anchors:S([0,"#1b5e20","Well irrigated"],[.33,"#689f38","Adequate"],[.66,"#fdd835","Under-irrigated"],[1,"#f57f17","Severe deficit"]),classLabels:["No deficit","Minimal deficit","Low deficit","Mild deficit","Moderate","Elevated deficit","High deficit","Very high","Severe under-irrigation","Critical deficit"],subtitle:"Under-irrigation · dark green = sufficient · amber = deficit"},FPR:{valueMin:0,valueMax:2,anchors:S([0,"#2e7d32","High performance"],[.33,"#ffeb3b","Average"],[.66,"#ff7043","Below target"],[1,"#d84315","Poor performance"]),classLabels:["Peak performance","Excellent","Good","Fair","Moderate","Below average","Poor","Very poor","Critical","Field failure"],subtitle:"Field performance · green = high yield potential · red = poor"},CPI:{valueMin:0,valueMax:1,anchors:S([0,"#fff8e1","Low production"],[.33,"#c5e1a5","Moderate"],[.66,"#558b2f","Good"],[1,"#1b5e20","High production"]),classLabels:["Minimal production","Very low","Low","Below average","Moderate","Fair production","Good","Very good","High","Peak production"],subtitle:"Crop production · straw = weak · deep green = high output"},ISS:{valueMin:-.5,valueMax:.65,anchors:S([0,"#b71c1c","Severe irrigation stress"],[.28,"#ef6c00","High stress"],[.52,"#fdd835","Moderate / watch"],[.76,"#26a69a","Adequate moisture"],[1,"#006064","Well supplied"]),classLabels:["Critical irrigation stress","Severe stress","High stress","Elevated stress","Moderate stress","Watch / borderline","Adequately supplied","Good moisture","Well irrigated","Optimal water status"],subtitle:"ISS · 0.40·NDMI + 0.30·NDWI + 0.20·NDVI + 0.10·SAVI · red = stress · teal = well watered"},WAPI:{valueMin:0,valueMax:1,anchors:S([0,"#5c6bc0","Class 1 · Normal"],[.22,"#26a69a","Class 3 · Low Stress"],[.44,"#fdd835","Class 5 · Moderate"],[.66,"#ef6c00","Class 7 · High Stress"],[.88,"#e91e63","Class 9 · Critical"],[1,"#ad1457","Class 10 · Extreme Critical"]),classLabels:["Class 1 · Normal · 0.00–0.09","Class 2 · Healthy · 0.10–0.19","Class 3 · Low Stress · 0.20–0.29","Class 4 · Low Moderate · 0.30–0.39","Class 5 · Moderate · 0.40–0.49","Class 6 · Moderate High · 0.50–0.59","Class 7 · High Stress · 0.60–0.69","Class 8 · Very High Stress · 0.70–0.79","Class 9 · Critical · 0.80–0.89","Class 10 · Extreme Critical · 0.90–1.00"],subtitle:"WAPI 10-class · 0.40·WDSI + 0.20·ΔWDSI + 0.20·(1−NDMI) + 0.10·ETstress + 0.10 · blue = Normal · magenta = Extreme Critical"},GPI:{valueMin:0,valueMax:1,anchors:S([0,"#e65100","Stagnant"],[.33,"#ffb300","Slow growth"],[.66,"#7cb342","Active growth"],[1,"#33691e","Peak growth"]),classLabels:["No growth","Very slow","Slow","Below average","Moderate growth","Fair growth","Good growth","Strong growth","Very strong","Peak growth rate"],subtitle:"Growth performance · orange = lag · lime green = active growth"},CSI2:{valueMin:0,valueMax:1,anchors:S([0,"#37474f","Unstable canopy"],[.33,"#78909c","Variable"],[.66,"#aed581","Stable"],[1,"#33691e","Highly stable"]),classLabels:["Highly unstable","Unstable","Variable","Moderately variable","Fair stability","Stable","Good stability","Very stable","Excellent stability","Locked stable canopy"],subtitle:"Canopy stability · slate gray = unstable · green = stable cover"},CRI:{valueMin:0,valueMax:1.5,anchors:S([0,"#311b92","Low resilience"],[.33,"#5c6bc0","Fragile"],[.66,"#81c784","Resilient"],[1,"#2e7d32","Highly resilient"]),classLabels:["Critical fragility","Very low resilience","Low","Below average","Moderate","Fair resilience","Good","Strong","Very resilient","Maximum resilience"],subtitle:"Crop resilience · indigo = fragile · green = stress-tolerant"},VDG:{valueMin:0,valueMax:1,anchors:S([0,"#1b5e20","Stable / no decline"],[.33,"#ffca28","Early decline"],[.66,"#ff5722","Active decline"],[1,"#3e2723","Severe decline gradient"]),classLabels:["No decline","Minimal decline","Slight decline","Moderate decline","Elevated decline","High decline","Very high","Severe","Critical decline","Collapse gradient"],subtitle:"Vegetation decline · green = stable · charcoal = steep loss"},ARI:{valueMin:0,valueMax:1,anchors:S([0,"#00c853","Low agro risk"],[.33,"#ffeb3b","Watch"],[.66,"#ff5722","High risk"],[1,"#d50000","Critical agro risk"]),classLabels:["Minimal risk","Low risk","Mild risk","Moderate","Elevated","High risk","Very high","Severe","Critical","Extreme agro risk"],subtitle:"Agro risk · bright green = safe · red = critical composite risk"},CHS:{valueMin:0,valueMax:1,anchors:S([0,"#880e4f","Poor crop health"],[.33,"#f06292","Fair"],[.66,"#81c784","Good"],[1,"#004d40","Excellent crop health"]),classLabels:["Critical health","Very poor","Poor","Below average","Moderate","Fair","Good","Very good","Excellent","Peak Crop Health"],subtitle:"Crop Health Score · magenta = poor · teal = excellent"},CPS:{valueMin:0,valueMax:2,anchors:S([0,"#e8f5e9","Low pressure"],[.33,"#fff59d","Moderate pressure"],[.66,"#ff7043","High pressure"],[1,"#4a148c","Extreme crop pressure"]),classLabels:["Minimal pressure","Low","Mild","Moderate","Elevated","High pressure","Very high","Severe","Critical pressure","Extreme pressure"],subtitle:"Crop pressure · mint = low stress load · violet = extreme pressure"},PRI:{valueMin:0,valueMax:1,anchors:S([0,"#efebe9","Not ready"],[.35,"#ffb74d","Approaching"],[.45,"#66bb6a","Planting ready"],[1,"#1b5e20","Peak readiness"]),classLabels:["Not ready","Very early","Early","Approaching","Near ready","Planting ready","Good window","Strong window","Excellent","Peak planting readiness"],subtitle:"Planting Readiness Index · beige = wait · green = plant"},CGI:{valueMin:0,valueMax:1,anchors:S([0,"#4a148c","No growth"],[.33,"#7e57c2","Establishing"],[.66,"#43a047","Active growth"],[1,"#1b5e20","Peak growth"]),classLabels:["No growth","Very slow","Slow","Establishing","Moderate","Good growth","Strong growth","Very strong","Excellent","Peak Crop Growth"],subtitle:"Crop Growth Index · purple = stagnant · green = vigorous growth"},CMI:{valueMin:0,valueMax:1,anchors:S([0,"#e3f2fd","Immature"],[.33,"#81d4fa","Developing"],[.66,"#ffb300","Maturing"],[1,"#e65100","Mature"]),classLabels:["Immature","Very early","Early","Developing","Mid season","Late vegetative","Early maturity","Maturing","Near mature","Fully mature"],subtitle:"Crop Maturity Index · blue = young · orange = mature"},HRI:{valueMin:0,valueMax:1,anchors:S([0,"#1b5e20","Not harvest-ready"],[.5,"#fff59d","Approaching harvest"],[.7,"#fb8c00","Harvest ready"],[1,"#bf360c","Peak harvest readiness"]),classLabels:["Not ready","Very early","Early","Approaching","Near ready","Almost ready","Harvest ready","Good window","Strong window","Peak harvest readiness"],subtitle:"Harvest Readiness Index · green = wait · orange = harvest"},VRI:{valueMin:0,valueMax:1,anchors:S([0,"#b71c1c","Season low"],[.33,"#ffcc80","Recovering"],[.66,"#81c784","Strong recovery"],[1,"#1b5e20","Season peak"]),classLabels:["Season minimum","Very low recovery","Low","Fair","Moderate","Recovering","Good recovery","Strong","Near peak","Season peak NDVI"],subtitle:"Vegetation Recovery Index · red = low · green = recovered vs season range"},CCI:{valueMin:0,valueMax:1,anchors:S([0,"#37474f","Low confidence"],[.33,"#90a4ae","Uncertain"],[.66,"#42a5f5","Reliable"],[1,"#0d47a1","High confidence"]),classLabels:["Very low confidence","Low","Limited","Uncertain","Moderate","Fair","Reliable","High","Very high","Peak calendar confidence"],subtitle:"Crop Calendar Confidence · gray = sparse/noisy · blue = stable dense observations"},EPD:{valueMin:0,valueMax:1,anchors:S([0,"#efebe9","Before planting window"],[.45,"#66bb6a","Planting signal"],[1,"#1b5e20","Post planting-ready"]),classLabels:["Before window","Very early","Early","Approaching","Near signal","Planting signal","Confirmed","Strong","Very strong","Peak planting signal"],subtitle:"Estimated Planting Date readiness (PRI surface on map)"},EHD:{valueMin:0,valueMax:1,anchors:S([0,"#1b5e20","Before harvest window"],[.7,"#fb8c00","Harvest signal"],[1,"#bf360c","Post harvest-ready"]),classLabels:["Before window","Very early","Early","Approaching","Near signal","Near ready","Harvest signal","Confirmed","Strong","Peak harvest signal"],subtitle:"Estimated Harvest Date readiness (HRI surface on map)"},SAL_NDSI:{valueMin:-.6,valueMax:.4,anchors:S([0,"#1b5e20","Non-saline"],[.33,"#fdd835","Slight salinity"],[.66,"#ef6c00","High salinity"],[1,"#7f0000","Extreme salinity"]),classLabels:["Non-saline","Very low salinity","Low salinity","Slight salinity","Moderate salinity","Moderately high","High salinity","Very high salinity","Severe salinity","Extreme salinity"],subtitle:"Salinity NDSI (B11−B8)/(B11+B8) · Low → High · 🟢 non-saline → 🔴 extreme salinity"},SI:{valueMin:0,valueMax:.4,anchors:S([0,"#00695c","Non-saline"],[.33,"#cddc39","Slight salinity"],[.66,"#f4511e","High salinity"],[1,"#880e4f","Extreme salinity"]),classLabels:["Non-saline","Very low salinity","Low salinity","Slight salinity","Moderate salinity","Moderately high","High salinity","Very high salinity","Severe salinity","Extreme salinity"],subtitle:"SI √(B3·B4) · Low → High · 🟢 dark soil → 🔴 bright saline crust"},SSI:{valueMin:-.4,valueMax:.8,anchors:S([0,"#0d47a1","Non-saline"],[.33,"#4dd0e1","Slight salinity"],[.66,"#ffa726","High salinity"],[1,"#3e2723","Extreme salinity"]),classLabels:["Non-saline","Very low salinity","Low salinity","Slight salinity","Moderate salinity","Moderately high","High salinity","Very high salinity","Severe salinity","Extreme salinity"],subtitle:"SSI (Salinity NDSI + SI) · Low → High · combined normalized + brightness salinity"},IOI:{valueMin:.5,valueMax:2.5,anchors:S([0,"#0d1b2a","Background"],[.22,"#415a77","Weak iron oxide"],[.44,"#9a031e","Moderate iron oxide"],[.66,"#e36414","Strong iron oxide"],[1,"#ffba08","Extreme iron oxide"]),classLabels:["Background / negligible Fe-oxide","Very weak iron oxide","Weak iron oxide","Low–moderate iron oxide","Moderate iron oxide","Elevated iron oxide","Strong iron oxide","Very strong iron oxide","Intense Fe-oxide alteration","Extreme Fe-oxide signature"],subtitle:"Iron Oxide Index (B04/B02) · 10-class · navy → crimson → gold Fe-oxide enrichment"},CLAY_MI:{valueMin:.7,valueMax:1.5,anchors:S([0,"#134e4a","Background clay"],[.25,"#5eead4","Weak clay"],[.5,"#fef3c7","Moderate clay"],[.75,"#c026d3","Strong clay"],[1,"#4a044e","Extreme clay"]),classLabels:["Background / negligible clay","Very weak clay minerals","Weak clay minerals","Low–moderate clay","Moderate clay alteration","Elevated clay minerals","Strong clay alteration","Very strong clay","Intense clay alteration","Extreme clay mineral signature"],subtitle:"Clay Mineral Index (B11/B12) · 10-class · teal → cream → magenta clay alteration"},FMI:{valueMin:.4,valueMax:2,anchors:S([0,"#14532d","Background ferrous"],[.25,"#84cc16","Weak ferrous"],[.5,"#facc15","Moderate ferrous"],[.75,"#b45309","Strong ferrous"],[1,"#7c2d12","Extreme ferrous"]),classLabels:["Background / negligible ferrous","Very weak ferrous minerals","Weak ferrous minerals","Low–moderate ferrous","Moderate ferrous minerals","Elevated ferrous minerals","Strong ferrous minerals","Very strong ferrous","Intense ferrous signature","Extreme ferrous mineral enrichment"],subtitle:"Ferrous Mineral Index (B11/B08) · 10-class · green → yellow → rust ferrous enrichment"},NDAI:{valueMin:-.3,valueMax:.5,anchors:S([0,"#1e3a8a","Low alteration"],[.25,"#93c5fd","Weak alteration"],[.5,"#f8fafc","Neutral"],[.75,"#f87171","Strong alteration"],[1,"#7f1d1d","Extreme alteration"]),classLabels:["Very low alteration","Low alteration","Weak alteration","Slight alteration","Neutral / background","Moderate alteration","Elevated alteration","Strong alteration","Very strong alteration","Extreme hydrothermal alteration"],subtitle:"NDAI (B11−B12)/(B11+B12) · 10-class · blue → white → red alteration contrast"},BSI:{valueMin:-.5,valueMax:.5,anchors:S([0,"#166534","Vegetated / low bare"],[.25,"#a3e635","Sparse cover"],[.5,"#fde047","Mixed bare soil"],[.75,"#d97706","Exposed soil"],[1,"#78350f","Extreme bare soil"]),classLabels:["Dense vegetation / minimal bare soil","Mostly vegetated","Low bare soil","Sparse cover","Mixed soil–vegetation","Moderate bare soil","Elevated bare soil","Strongly exposed soil","Very high bare soil","Extreme bare soil / rock exposure"],subtitle:"Bare Soil Index · 10-class · green canopy → yellow mix → brown bare earth"},REAI:{valueMin:.7,valueMax:1.4,anchors:S([0,"#312e81","Background red-edge"],[.25,"#6366f1","Weak red-edge"],[.5,"#22d3ee","Moderate red-edge"],[.75,"#fbbf24","Strong red-edge"],[1,"#b45309","Extreme red-edge"]),classLabels:["Background red-edge response","Very weak red-edge alteration","Weak red-edge alteration","Low–moderate red-edge","Moderate red-edge alteration","Elevated red-edge response","Strong red-edge alteration","Very strong red-edge","Intense red-edge alteration","Extreme red-edge alteration"],subtitle:"Red Edge Alteration Index (B06/B05) · 10-class · indigo → cyan → amber alteration"},GEI:{valueMin:.4,valueMax:2,anchors:S([0,"#0f172a","Low prospectivity"],[.22,"#0e7490","Weak composite"],[.44,"#ca8a04","Moderate prospectivity"],[.66,"#ea580c","High prospectivity"],[1,"#9f1239","Extreme prospectivity"]),classLabels:["Negligible gold-prospectivity composite","Very low prospectivity","Low prospectivity","Low–moderate prospectivity","Moderate prospectivity","Elevated prospectivity","High prospectivity","Very high prospectivity","Intense composite signature","Extreme gold-exploration composite"],subtitle:"GEI 0.35·IOI + 0.30·CMI + 0.20·FMI + 0.15·BSI · 10-class · navy → gold → crimson prospectivity"},GCI:{valueMin:.3,valueMax:1.8,anchors:S([0,"#FFFFFF","No Potential"],[.11,"#FFF9C4","Very Low Potential"],[.22,"#FFEB3B","Low Potential"],[.33,"#FFC107","Weak Potential"],[.44,"#FF9800","Moderate Potential"],[.55,"#F57C00","Moderate-High Potential"],[.66,"#E65100","High Potential"],[.77,"#D84315","Very High Potential"],[.88,"#B71C1C","Excellent Potential"],[1,"#FFD700","Priority Gold Target"]),classLabels:["No Potential","Very Low Potential","Low Potential","Weak Potential","Moderate Potential","Moderate-High Potential","High Potential","Very High Potential","Excellent Potential","Priority Gold Target"],classColors:[16777215,16775620,16771899,16761095,16750592,16088064,15094016,14172949,12000284,16766720],classAlpha:[0,.15,.25,.35,.5,.6,.75,.85,.95,1],subtitle:"GPI · 0.35×Normalize(IOI) + 0.30×Normalize(CAI) + 0.20×Normalize(QI) + 0.15×Normalize(BSI) · Class 1 transparent → Class 10 Priority Gold Target"},EGCI:{valueMin:0,valueMax:1,anchors:S([0,"#000000","No Potential"],[.11,"#F2F2F2","Very Low"],[.22,"#D9D9D9","Low"],[.33,"#A6A6A6","Weak"],[.44,"#737373","Moderate"],[.55,"#4D4D4D","Moderate-High"],[.66,"#B8860B","High"],[.77,"#DAA520","Very High"],[.88,"#F4C430","Excellent"],[1,"#FFF8DC","Priority Target"]),classLabels:["No Potential","Very Low","Low","Weak","Moderate","Moderate-High","High","Very High","Excellent","Priority Target"],classColors:[0,15921906,14277081,10921638,7566195,5066061,12092939,14329120,16041008,16775388],classAlpha:[0,1,1,1,1,1,1,1,1,1],subtitle:"Gold Prospectivity · 0.30×Iron Oxide + 0.25×Clay + 0.20×Silica + 0.15×Lineament Density + 0.10×Distance to Fault · vegetation excluded (NDVI≥0.30) · Class 1 transparent → Class 10 Priority Target"},DCVHI:C("CVHI","#b71c1c","#fff176","#1b5e20","ΔCVHI · composite health decline → recovery"),DVHS:C("VHS","#8b0000","#fffde7","#1b4332","ΔVHS · unique crimson→cream→forest change ramp"),DVDI:C("VDI","#4e342e","#eceff1","#2e7d32","ΔVDI · brown dry decline · gray stable · green rehydration"),DCVI:C("CVI","#4a148c","#e1bee7","#1b4332","ΔCVI · purple loss · lilac stable · green gain"),DCSI:C("CSI","#b71c1c","#fff9c4","#1b5e20","ΔCSI · stress easing vs intensification"),DWST:C("WST","#e65100","#cfd8dc","#0d47a1","ΔWST · orange stress rise · blue relief"),DDRI:C("DRI","#bf360c","#ffe0b2","#0277bd","ΔDRI · drought worsening · wetting recovery"),DVMI:C("VMI","#004d40","#b2dfdb","#80cbc4","ΔVMI · canopy moisture loss · teal recovery"),DSMI:C("SMI","#5d4037","#d7ccc8","#006064","ΔSMI · soil drying · cyan rewetting"),DOIR:C("OIR","#0d47a1","#fff59d","#33691e","ΔOIR · excess water rise · green normalization"),DWDSI:C("WDSI","#4e342e","#fff3e0","#0277bd","ΔWDSI · drought worsening · wetting recovery"),DIEI:C("IEI","#c62828","#e3f2fd","#1565c0","ΔIEI · efficiency drop · blue improvement"),DUII:C("UII","#f57f17","#f0f4c3","#1b5e20","ΔUII · deficit increase · irrigation recovery"),DFPR:C("FPR","#d84315","#fff9c4","#2e7d32","ΔFPR · performance drop · yield recovery"),DCPI:C("CPI","#fff8e1","#c5e1a5","#1b5e20","ΔCPI · production decline · output gain"),DISS:C("ISS","#b71c1c","#fff8e1","#006064","ΔISS · irrigation stress rise · moisture recovery"),DWAPI:C("WAPI","#1565c0","#fffde7","#c62828","ΔWAPI · priority easing · priority surge"),DGPI:C("GPI","#e65100","#fff3e0","#33691e","ΔGPI · growth slowdown · acceleration"),DCSI2:C("CSI2","#37474f","#cfd8dc","#33691e","ΔCSI2 · canopy destabilization · restabilization"),DCRI:C("CRI","#311b92","#c5cae9","#2e7d32","ΔCRI · resilience loss · recovery"),DVDG:C("VDG","#3e2723","#ffecb3","#1b5e20","ΔVDG · decline acceleration · vegetation recovery"),DARI:C("ARI","#d50000","#fffde7","#00c853","ΔARI · rising composite risk · risk reduction"),DCHS:C("CHS","#880e4f","#f8bbd0","#004d40","ΔCHS · crop health drop · recovery"),DCPS:C("CPS","#4a148c","#e1bee7","#e8f5e9","ΔCPS · pressure increase · relief"),DPRI:C("PRI","#e65100","#fff3e0","#1b5e20","ΔPRI · planting readiness drop · rise"),DCGI:C("CGI","#4a148c","#e1bee7","#2e7d32","ΔCGI · growth slowdown · acceleration"),DCMI:C("CMI","#1a237e","#c5cae9","#f9a825","ΔCMI · maturity retreat · advance"),DHRI:C("HRI","#1b5e20","#fff9c4","#e65100","ΔHRI · harvest readiness drop · rise"),DVRI:C("VRI","#b71c1c","#eceff1","#1b5e20","ΔVRI · recovery loss · canopy recovery"),DCCI:C("CCI","#37474f","#cfd8dc","#1565c0","ΔCCI · calendar confidence drop · rise"),DEPD:C("EPD","#e65100","#fff3e0","#2e7d32","ΔEPD · planting readiness change"),DEHD:C("EHD","#1b5e20","#fffde7","#ef6c00","ΔEHD · harvest readiness change"),DSAL_NDSI:C("SAL_NDSI","#1b5e20","#fff9c4","#7f0000","ΔSalinity NDSI · salinity easing · salinity build-up"),DSAL:C("SI","#00695c","#e0f2f1","#6a1b9a","ΔSI · brightness/salinity decline · increase"),DDSI:C("DSI","#006837","#fff9c4","#7f0000","ΔDSI · drought easing · severity intensification"),DSSI:C("SSI","#0d47a1","#eceff1","#3e2723","ΔSSI · combined salinity decline · increase"),MVI:{valueMin:0,valueMax:8,anchors:S([0,"#5d4037","Non-mangrove / background"],[.25,"#a1887f","Low MVI"],[.5,"#26a69a","Moderate mangrove signal"],[.75,"#00897b","Likely mangrove"],[1,"#004d40","Strong mangrove / dense canopy"]),classLabels:["Background / non-mangrove","Very low MVI","Low mangrove likelihood","Weak mangrove signal","Transitional canopy","Moderate mangrove","Elevated mangrove signal","Likely mangrove stand","Dense mangrove","Very dense mangrove canopy"],subtitle:"MVI (B08−B03)/(B11−B03) · brown background → teal mangrove detection"},REMI:{valueMin:-.5,valueMax:.5,anchors:S([0,"#4e342e","Low REMI / background"],[.35,"#ffb74d","Weak red-edge contrast"],[.65,"#26c6da","Mangrove discrimination"],[1,"#006064","Strong REMI mangrove"]),classLabels:["Background red-edge moisture","Very low REMI","Low red-edge contrast","Weak mangrove discrimination","Transitional REMI","Moderate mangrove signal","Elevated REMI","Strong mangrove discrimination","Very strong REMI","Peak red-edge mangrove contrast"],subtitle:"REMI red-edge×green–SWIR · brown → cyan mangrove discrimination"},MI:{valueMin:-.4,valueMax:1.2,anchors:S([0,"#3e2723","Low MI / other cover"],[.35,"#8d6e63","Sparse extraction"],[.65,"#66bb6a","Mangrove extraction"],[1,"#1b5e20","Strong MI mangrove"]),classLabels:["Non-mangrove / low MI","Very low MI","Low mangrove extraction","Weak canopy contrast","Transitional MI","Moderate mangrove","Elevated MI","Likely mangrove stand","Strong mangrove extraction","Peak MI mangrove canopy"],subtitle:"MI (B08−B04)/(B11+B04) · brown other cover → green mangrove extraction"},MFI:{valueMin:-.6,valueMax:.6,anchors:S([0,"#a50026","Low forest response"],[.22,"#f46d43","Weak red-edge forest"],[.45,"#fee08b","Transitional MFI"],[.7,"#7cb342","Mangrove forest"],[1,"#1b5e20","Strong MFI mangrove forest"]),classLabels:["Background forest response","Very low MFI","Low red-edge forest","Weak mangrove forest","Transitional MFI","Moderate mangrove forest","Elevated MFI","Likely mangrove forest","Dense mangrove forest","Peak MFI mangrove forest"],classColors:Ea,subtitle:"MFI red-edge mean vs B8A · NDVI colormap · red sparse → green mangrove forest"},"NDRE-B5":{valueMin:-.2,valueMax:.7,anchors:S([0,"#a50026","Very low NDRE-B5"],[.22,"#f46d43","Low chlorophyll"],[.45,"#fee08b","Transitional canopy"],[.7,"#66bd63","Healthy mangrove"],[1,"#006837","Dense mangrove / high NDRE-B5"]),classLabels:["Very low red-edge (B5)","Low chlorophyll / sparse","Stressed / sparse canopy","Low–moderate canopy","Transitional canopy","Moderate mangrove vigor","Healthy mangrove","Strong canopy / channels","Dense mangrove fringe","Peak NDRE-B5 vigor"],classColors:[10813478,14102567,16018755,16625249,16703627,14282635,10934634,6733155,1742928,26679],subtitle:"NDRE-B5 (B8A−B05)/(B8A+B05) · red sparse → yellow transition → deep green mangrove"},"NDRE-B6":{valueMin:-.2,valueMax:.7,anchors:S([0,"#b2182b","Very low NDRE-B6"],[.22,"#ef6548","Low chlorophyll"],[.45,"#ffffbf","Transitional canopy"],[.7,"#4daf4a","Healthy mangrove"],[1,"#00441b","Dense mangrove / high NDRE-B6"]),classLabels:["Very low red-edge (B6)","Low chlorophyll / sparse","Stressed / sparse canopy","Low–moderate canopy","Transitional canopy","Moderate mangrove vigor","Healthy mangrove","Strong canopy / channels","Dense mangrove fringe","Peak NDRE-B6 vigor"],classColors:[11671595,14102559,15689032,16551257,16703627,14282915,11394446,7915129,3253076,17435],subtitle:"NDRE-B6 (B8A−B06)/(B8A+B06) · red sparse → yellow transition → deep green mangrove"},"NDRE-B7":{valueMin:-.2,valueMax:.7,anchors:S([0,"#990000","Very low NDRE-B7"],[.22,"#e34a33","Low chlorophyll"],[.45,"#f7fcb9","Transitional canopy"],[.7,"#41ab5d","Healthy mangrove"],[1,"#005a32","Dense mangrove / high NDRE-B7"]),classLabels:["Very low red-edge (B7)","Low chlorophyll / sparse","Stressed / sparse canopy","Low–moderate canopy","Transitional canopy","Moderate mangrove vigor","Healthy mangrove","Strong canopy / channels","Dense mangrove fringe","Peak NDRE-B7 vigor"],classColors:[10027008,14102559,14895667,16551257,16628612,16252089,12773017,7915129,3253076,23090],subtitle:"NDRE-B7 (B8A−B07)/(B8A+B07) · red sparse → yellow transition → deep green mangrove"},"CI-RE":{valueMin:0,valueMax:4,anchors:S([0,"#a50026","Very low CI-RE"],[.25,"#fdae61","Low chlorophyll"],[.5,"#ffffbf","Moderate chlorophyll"],[.75,"#66bd63","High chlorophyll"],[1,"#1a9850","Peak CI-RE"]),classLabels:["Very low chlorophyll (CI-RE)","Low red-edge chlorophyll","Stressed canopy","Low–moderate chlorophyll","Moderate chlorophyll","Elevated chlorophyll","Healthy canopy chlorophyll","Strong CI-RE response","Dense chlorophyll fringe","Peak CI-RE chlorophyll"],classColors:[10813478,14102567,16018755,16625249,16703627,16777151,14282635,10934634,6733155,1742928],subtitle:"CI-RE (B8A/B05)−1 · red low chlorophyll → green high chlorophyll"},"GCI-CHL":{valueMin:0,valueMax:6,anchors:S([0,"#b2182b","Very low GCI"],[.25,"#ef8a62","Low green chlorophyll"],[.5,"#f7f7f7","Moderate"],[.75,"#67a9cf","Elevated green vigor"],[1,"#2166ac","Peak GCI-CHL"]),classLabels:["Very low green chlorophyll","Low green response","Weak vigor","Low–moderate GCI","Moderate green chlorophyll","Elevated green vigor","Healthy green canopy","Strong GCI-CHL","Dense green chlorophyll","Peak GCI-CHL vigor"],classColors:[11671595,14049357,16033154,16636871,16250871,13755888,9618910,4428739,2188972,340065],subtitle:"GCI-CHL (B08/B03)−1 · green chlorophyll / vegetation vigor"},MTCI:{valueMin:0,valueMax:4.5,anchors:S([0,"#7f0000","Very low MTCI"],[.25,"#e34a33","Low chlorophyll"],[.5,"#fdcc8a","Transitional"],[.75,"#31a354","High chlorophyll"],[1,"#00441b","Peak MTCI"]),classLabels:["Very low MTCI","Low chlorophyll variation","Weak MTCI","Low–moderate MTCI","Moderate chlorophyll","Elevated MTCI","High chlorophyll sensitivity","Strong MTCI response","Dense chlorophyll canopy","Peak MTCI"],classColors:[8323072,11730944,14102559,15689032,16551257,16628612,11394446,7915129,3253076,17435],subtitle:"MTCI (B06−B05)/(B05−B04) · red low → deep green high chlorophyll"},REIP:{valueMin:700,valueMax:740,anchors:S([0,"#762a83","Blue-shifted REIP"],[.3,"#af8dc3","Low REIP"],[.5,"#f7f7f7","Mid REIP"],[.7,"#7fbf7b","Elevated REIP"],[1,"#1b7837","Red-shifted REIP"]),classLabels:["Strong blue shift (low Chl)","Blue-shifted REIP","Low REIP","Below-mid REIP","Mid red-edge position","Above-mid REIP","Elevated REIP","Red-shifted REIP","Strong red shift","Peak REIP (high Chl)"],classColors:[7744131,10055851,12756431,15193320,16250871,14282963,10935200,5942881,1800247,17435],subtitle:"REIP Guyot & Baret · 705+35×(((B04+B07)/2−B05)/(B06−B05)) nm · purple blue-shift → green red-shift"}},Xs=[{t:0,hex:8323072,label:"Class 1 · Extreme stress"},{t:.11,hex:11674146,label:"Class 2 · Severe stress"},{t:.22,hex:14102567,label:"Class 3 · High stress"},{t:.33,hex:16018755,label:"Class 4 · Moderate stress"},{t:.44,hex:16625249,label:"Class 5 · Early stress"},{t:.55,hex:16703627,label:"Class 6 · Watch"},{t:.66,hex:14282635,label:"Class 7 · Fair"},{t:.77,hex:10934634,label:"Class 8 · Good"},{t:.88,hex:6732650,label:"Class 9 · Healthy"},{t:1,hex:1742928,label:"Class 10 · Optimal"}],zs=["Class 1 · Extreme stress","Class 2 · Severe stress","Class 3 · High stress","Class 4 · Moderate stress","Class 5 · Early stress","Class 6 · Watch","Class 7 · Fair","Class 8 · Good","Class 9 · Healthy","Class 10 · Optimal"],js=[{t:0,hex:14102567,label:"Critical"},{t:.2,hex:14895667,label:"Critical"},{t:.25,hex:16018755,label:"Critical edge"},{t:.33,hex:16625249,label:"Stress"},{t:.4,hex:16627811,label:"Watch"},{t:.5,hex:16703627,label:"Watch"},{t:.6,hex:14282635,label:"Fair"},{t:.75,hex:6732650,label:"Healthy"},{t:1,hex:1742928,label:"Healthy"}],Zs=[{t:0,hex:14102567,label:"Critical decline"},{t:.25,hex:16018755,label:"Major decline"},{t:.375,hex:16625249,label:"Stress decline"},{t:.4375,hex:16703627,label:"Watch"},{t:.5,hex:16775620,label:"Stable"},{t:.625,hex:12968357,label:"Slight gain"},{t:.75,hex:6732650,label:"Gain"},{t:1,hex:1742928,label:"Strong gain"}],qs=["Critical decline · Δ ≤ −0.15","Major decline","Moderate decline","Stress · Δ ≤ −0.05","Stable low","Stable · watch","Slight gain","Moderate gain","Major gain","Strong gain · green"],Ze={CHAS:{kind:"scientific",valueMin:-.2,valueMax:.85,anchors:Xs,labels:zs,subtitle:"CHAS 10-class raster · NDVI+NDWI+NDMI+SAVI fusion · pixel mosaic"},CHAS_ALERT:{kind:"alert_derived",valueMin:-.2,valueMax:.85,anchors:js,labels:["Critical","Critical","Active","Active","Warning","Warning","Safe","Safe","Safe","Safe"],subtitle:"CHAS Alert · derived 4-level (Critical / Active / Warning / Safe)"},DCHAS:{kind:"alert_delta",valueMin:-.4,valueMax:.4,anchors:Zs,labels:qs,subtitle:"ΔCHAS change detection · sudden crop decline"},[Ie]:{kind:"scientific",valueMin:-3,valueMax:4,anchors:jt.map((e,t)=>({t:t/9,hex:e,label:zt[t]})),labels:zt,subtitle:"ADI 10-class anomaly · (Current − μ_hist) / σ_hist",breaks:wi,classValues:Pi,classColors:jt},[ge]:{kind:"scientific",valueMin:-.5,valueMax:.65,anchors:qt.map((e,t)=>({t:t/9,hex:e,label:Zt[t]})),labels:Zt,subtitle:"NCADI 10-class · 0.7·ΔNDVI + 0.3·ΔNDMI",breaks:Hi,classValues:$i,classColors:qt},[Qi]:{kind:"scientific",valueMin:nr,valueMax:ar,anchors:sn.map((e,t)=>({t:t/9,hex:e,label:rn[t]})),labels:rn,subtitle:"WAPI 10-class · Class 1 Normal (0.00) → Class 10 Extreme Critical (1.00) · blue = low priority · magenta = irrigate first",breaks:ir,classValues:rr,classColors:sn},[Xi]:{kind:"scientific",valueMin:On,valueMax:kn,anchors:nn.map((e,t)=>({t:t/9,hex:e,label:tn[t]})),labels:tn,subtitle:"DSI 10-class · Drought Area = DSI ≥ 0.30 · green = no drought · dark red = extreme drought",breaks:Wn,classValues:Ji,classColors:nn}};function qe(e){return[(e>>16&255)/255,(e>>8&255)/255,(e&255)/255]}function Js(e,t,n){const a=Math.max(0,Math.min(1,n)),[i,r,s]=qe(e),[l,o,c]=qe(t),u=Math.round((i+(l-i)*a)*255),d=Math.round((r+(o-r)*a)*255),f=Math.round((s+(c-s)*a)*255);return(u<<16|d<<8|f)>>>0}function Qs(e,t){if(!e.length)return 8947848;if(t<=e[0].t)return e[0].hex;if(t>=e[e.length-1].t)return e[e.length-1].hex;for(let n=0;n<e.length-1;n++){const a=e[n],i=e[n+1];if(t>=a.t&&t<=i.t){const r=i.t-a.t;return Js(a.hex,i.hex,r>0?(t-a.t)/r:0)}}return e[e.length-1].hex}function Ra(e){const t=String(e||"").trim().toUpperCase();if(!t)return null;const n=t==="NDSI"?"SAL_NDSI":t==="DNDSI"?"DSAL_NDSI":t,a=Ze[t]??Ze[n];if(a)return a;const i=_a[n];return i?{kind:`unique:${n}`,valueMin:i.valueMin,valueMax:i.valueMax,anchors:i.anchors,labels:i.classLabels,subtitle:i.subtitle,...i.classColors&&i.classColors.length===10?{classColors:i.classColors}:{}}:null}function el(e,t="UNKNOWN"){const{valueMin:n,valueMax:a}=e,i=[],r=[],s=[],l=[],o=e.breaks&&e.breaks.length===9?[...e.breaks]:null,c=e.classValues&&e.classValues.length===10?[...e.classValues]:null,u=e.classColors&&e.classColors.length===10?[...e.classColors]:null,d=o??[],f=a-n||1;for(let I=0;I<10;I++){const p=o?I===0?n:o[I-1]:n+f*I/10,g=o?I===9?a:o[I]:n+f*(I+1)/10,R=c?c[I]:(p+g)/2,b=I/9,ke=u?u[I]:Qs(e.anchors,b);i.push(R),r.push(ke),l.push(qe(ke)),s.push(e.labels[I]??`Class ${I+1}`),!o&&I<9&&d.push(Number(g.toFixed(2)))}const m=i.map((I,p)=>[I,r[p]]);return{layerId:t,kind:e.kind,subtitle:e.subtitle,valueMin:n,valueMax:a,breaks:d,classValues:i,classColors:r,classLabels:s,classRgb01:l,gradientStops:m}}function j(e){const t=Ra(e);return t?el(t,String(e||"").trim().toUpperCase()):null}function iu(e){return`#${(e>>>0).toString(16).padStart(6,"0")}`}function tl(){return[...new Set([...Object.keys(_a),...Object.keys(Ze)])].sort()}Object.fromEntries(tl().filter(e=>!_(e)||e==="DCHAS").map(e=>{const t=Ra(e);return[e,{kind:t.kind,valueMin:t.valueMin,valueMax:t.valueMax}]}));const ru=["CRITICAL","ACTIVE","WARNING","SAFE"],su={CRITICAL:"#d32f2f",ACTIVE:"#ff9800",WARNING:"#ffeb3b",SAFE:"#1a9850"},nl=[[.827451,.184314,.184314],[1,.596078,0],[1,.921569,.231373],[.101961,.596078,.313725]];function al(e){const t=Math.max(1,Math.min(10,Math.round(e)));return t<=2?"CRITICAL":t<=4?"ACTIVE":t<=6?"WARNING":"SAFE"}function il(e){return al(e+1)}function rl(e){if(!Number.isFinite(e))return 4;const t=j("CHAS");if(!(t!=null&&t.breaks.length))return e<.1?0:e<.25?2:e<.4?4:e<.55?6:8;const n=t.breaks;if(e<n[0])return 0;for(let a=1;a<n.length;a++)if(e<n[a])return a;return 9}function lu(e){return il(rl(e))}function sl(){return Bi.map(([e,t,n])=>`[${e.toFixed(6)}, ${t.toFixed(6)}, ${n.toFixed(6)}]`).join(`,
   `)}function ll(e=null){const t=e!=null&&Number.isFinite(e)?Math.max(-1,Math.min(1,e)):null,n=t==null?"return c.concat(1);":`var a = (isFinite(ndvi) && ndvi >= ${t} ? 1.0 : 0.0);
  return c.concat(a);`;return`//VERSION=3
// AgroCloud Stress Zones — CHAS fusion + stress score classification
function setup() {
  return {
    input: ["B03", "B04", "B05", "B08", "B8A", "B11", "dataMask"],
    output: { bands: 4 }
  };
}

const ZONE_RGB = [
   ${sl()}
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
  let chas = ${ut};
  let stress = 1.0 - chas;
  let cls = classifyStress(ndvi, stress);
  let c = ZONE_RGB[cls];
  ${n}
}`}function ou(e=!1){return`//VERSION=3
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
  let chas = ${ut};
  let stress = 1.0 - chas;
  var cls = 1;
  if (!isFinite(ndvi) || ndvi < 0.15) cls = 0;
  else if (!isFinite(stress) || stress >= 0.6) cls = 4;
  else if (stress >= 0.4) cls = 3;
  else if (stress >= 0.2) cls = 2;
  var valid = samples.dataMask && !cloud;
  return { idx: [cls], dataMask: [valid ? 1 : 0] };
}`}function ol(e){return e.map(t=>String(t)).join(", ")}function Da(e){return e.map(([t,n,a])=>`[${t.toFixed(6)}, ${n.toFixed(6)}, ${a.toFixed(6)}]`).join(`,
   `)}const xa=`let ndvi = index(samples.B08, samples.B04);
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
  ${aa}`,we=`function coreAt(samples) {
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
  ${aa}
  return {
    ndvi: ndvi, savi: savi, ndmi: ndmi, ndwi: ndwi, ndre: ndre, evi: evi, ci_re: ci_re,
    ndsi: ndsi, si: si, ssi: ssi,
    ioi: ioi, clay_mi: clay_mi, fmi: fmi, ndai: ndai, bsi: bsi, reai: reai, gei: gei, gci: gci, egci: egci,
    mvi: mvi, remi: remi, mi: mi, mfi: mfi,
    ndre_b5: ndre_b5, ndre_b6: ndre_b6, ndre_b7: ndre_b7,
    cire: cire, gci_chl: gci_chl, mtci: mtci, reip: reip
  };
}`;function oe(e,t,n="samples.dataMask"){const a=t!=null&&Number.isFinite(t)?Math.max(-1,Math.min(1,t)):null;return a==null?`return c.concat(${n});`:`var a = ${n} * (${e} >= ${a} ? 1.0 : 0.0);
  return c.concat(a);`}function ce(e){const t=`function classifyVal(val) {
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
}`,n=`const BREAKS = [${ol(e.breaks)}];
const CLASS_RGB = [
   ${Da(e.classRgb01)}
];`;return{classifyFn:t,rgbConst:n}}function cl(e=null){const t=j("CHAS");if(!t)return null;const n=yt("CHAS");if(!n)return null;const{classifyFn:a,rgbConst:i}=ce(t),r=Da(nl),s=`function mapClassToAlert(cls) {
  if (cls <= 1) return 0;
  if (cls <= 3) return 1;
  if (cls <= 5) return 2;
  return 3;
}`,l=`const ALERT_RGB = [
   ${r}
];`;return`//VERSION=3
// CHAS Alert — derived 4-level overlay from CHAS 10-class raster logic
function setup() {
  return {
    input: ["B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B11", "B12", "dataMask"],
    output: { bands: 4 }
  };
}

${i}

${l}

${a}

${s}

function evaluatePixel(samples) {
  ${xa}
  let val = ${n};
  let cls = classifyVal(val);
  let alertIdx = mapClassToAlert(cls);
  let c = ALERT_RGB[alertIdx];
  ${oe("val",e)}
}`}function ul(e,t=null){const n=yt(e);if(!n)return null;const a=j(e);if(!a)return null;const i="val",{classifyFn:r,rgbConst:s}=ce(a);return`//VERSION=3
// AgroCloud composite — 10-class layer-specific ramp
function setup() {
  return {
    input: ["B02", "B03", "B04", "B05", "B06", "B07", "B08", "B8A", "B11", "B12", "dataMask"],
    output: { bands: 4 }
  };
}

${s}

${r}

function evaluatePixel(samples) {
  ${xa}
  let ${i} = ${n};
  if (!isFinite(${i})) {
    return [0, 0, 0, 0];
  }
  let cls = classifyVal(${i});
  if (cls < 0) {
    return [0, 0, 0, 0];
  }
  let c = CLASS_RGB[cls];
  ${oe(i,t)}
}`}function dl(e,t=null){const n=String(e||"").trim().toUpperCase();if(!_(n))return null;const a=Mt(n);if(!a)return null;const i=a.expr,r=j(e);if(!r)return null;const s="delta",{classifyFn:l,rgbConst:o}=ce(r);return`//VERSION=3
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

${we}

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
  return ${i};
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
  ${oe(s,t,"mask")}
}`}function ml(e=null){const t=j("ADI");if(!t)return null;const{classifyFn:n,rgbConst:a}=ce(t),i="adi";return`//VERSION=3
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

${we}

${a}

${n}

function currentIndex(c) {
  let ndvi = c.ndvi;
  let ndmi = c.ndmi;
  let ndre = c.ndre;
  return ${Rn};
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
  var ${i} = 0;
  if (n >= 2) {
    var mean = sum / n;
    var variance = Math.max(0, sumSq / n - mean * mean);
    var std = Math.sqrt(variance);
    if (std < 1e-6) std = 1e-6;
    ${i} = (current - mean) / std;
  } else if (n === 1) {
    var mean1 = sum;
    ${i} = (current - mean1) / 1e-6;
  } else {
    ${i} = 0;
  }
  if (!isFinite(${i})) ${i} = 0;
  var cls = classifyVal(${i});
  var c = CLASS_RGB[cls];
  ${oe(i,e,"curSample.dataMask")}
}`}function fl(e=null){const t=j("NCADI");if(!t)return null;const{classifyFn:n,rgbConst:a}=ce(t),i="ncadi";return`//VERSION=3
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

${we}

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
  var ${i} = ${Oi};
  if (!isFinite(${i})) ${i} = 0;
  var mask = samples[samples.length - 1].dataMask * samples[0].dataMask;
  var cls = classifyVal(${i});
  var c = CLASS_RGB[cls];
  ${oe(i,e,"mask")}
}`}function Il(e=null){const t=j("WAPI");if(!t)return null;const{classifyFn:n,rgbConst:a}=ce(t),i="wapi";return`//VERSION=3
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

${we}

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
  return ${Hn};
}

function etStressOf(c) {
  let ndmi = c.ndmi;
  let ndwi = c.ndwi;
  return ${$n};
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
  var ${i} = 0.40 * wdsi2 + 0.20 * dWdsi + 0.20 * (1 - c2.ndmi) + 0.10 * etStressOf(c2) + 0.10;
  if (!isFinite(${i})) ${i} = 0;
  var cls = classifyVal(${i});
  var c = CLASS_RGB[cls];
  ${oe(i,e,"mask")}
}`}function gl(e,t=null){const n=String(e||"").trim().toUpperCase();return n==="CHAS_ALERT"?cl(t):n==="STRESS_ZONES"?ll(t):F(n)?ml(t):k(n)?fl(t):Un(n)?Il(t):_(n)?dl(n,t):ul(n,t)}function Sl(){return`//VERSION=3
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
}`}function O(e){const t=Ct.find(n=>n.key===e);return Yi((t==null?void 0:t.color)??"#000000")}const pl={water:O("water"),trees:O("trees"),flooded:O("flooded"),crops:O("crops"),built:O("built"),bare:O("bare"),snow:O("snow"),clouds:O("clouds"),rangeland:O("rangeland")};bt.map(e=>e.key);const cu=Array.from({length:bt.length+1},(e,t)=>t);function Dt(){return`
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
`.trim()}function hl(){const e=pl;return`//VERSION=3
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

${Dt()}

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
}`}function uu(){const e=Dt();return`//VERSION=3
// AGRO_CLASS_HISTOGRAM {"mode":"lulc","classes":${bt.length}}
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
}`}function du(){return`//VERSION=3
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

${Dt()}

function evaluatePixel(samples) {
  var cls = classifyLulc(samples);
  if (cls < 0) return [0, 0, 0, 0];
  return [cls, cls, cls, 255];
}`}const Ta="CROP_CLASS",cn={name:Ta,title:"Crop Classification"},mu={active:!1,seasonStart:"",seasonEnd:"",cloudCoverMax:15,lastRunAt:null,statusMessage:"",analysisStep:1,toolTab:"classify"};function xt(e){return String(e||"").trim().toUpperCase()===Ta}function fu(e,t,n,a=120){const i=String(t||n||"").trim().slice(0,10);return i?{timeStart:String(e||"").trim().slice(0,10)||B(i,a),timeEnd:i}:{timeStart:"",timeEnd:""}}function Iu(e,t=120){const n=String(e||"").trim().slice(0,10);return{seasonEnd:n,seasonStart:B(n,t)}}function Pe(e){const t=String(e||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");return t==="DATAMASK"||t==="DATAMASKBAND"||t==="DATA_MASK"}function wa(){return`//VERSION=3
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
}`}let un="";function Cl(e){if(typeof console>"u"||typeof console.info!="function")return;const n=(Array.isArray(e.capabilityLayers)?e.capabilityLayers:[]).filter(r=>{const s=`${(r==null?void 0:r.name)??""} ${(r==null?void 0:r.title)??""}`.toLowerCase();return/datamask|data.?mask/.test(s)}),a=n.length>0,i=`${a?1:0}:${e.registeredInIndex?1:0}:${n.map(r=>r.name).join(",")}`;i!==un&&(un=i,console.info("[DataMask] Layer Index status",{sourceBandInEvalscripts:!0,evalscriptInput:["B04","dataMask"],evalscriptOutputAlpha:!0,capabilityNamedWmsLayer:a,capabilityMatches:n.map(r=>({name:r.name,title:r.title})),registeredInIndex:e.registeredInIndex,hideReason:e.registeredInIndex?null:a?"Named WMS layer exists in GetCapabilities but was filtered from Layer Index registration":"dataMask is an evalscript sample band, not a GetCapabilities WMS layer — register client DATAMASK in Core Interpretation"}))}const gu=Object.freeze(Object.defineProperty({__proto__:null,buildDataMaskLayerEvalscript:wa,isDataMaskLayerId:Pe,logDataMaskLayerAvailability:Cl},Symbol.toStringTag,{value:"Module"})),bl="DATAMASK";function Pa(e){const t=String(e||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");return t==="DATAMASK"||t==="DATAMASKBAND"||t==="DATA_MASK"}const Va=200,Nl=0,Fa="&UPSAMPLING=BILINEAR&DOWNSAMPLING=BILINEAR",Oa="&UPSAMPLING=NEAREST&DOWNSAMPLING=NEAREST",ie=512;function vl(e){return le(e)?Ki:ie}function El(e=ie){const t=e>0?e:ie;return Math.max(0,Math.round(13+Math.log2(512/t)))}const Tt="NDVI",Ml="NDVI",Al=[Tt,"Vegetation Index","Normalized Difference Vegetation Index","Highlight Optimized Natural Color","Optimized Natural Color","True Color"],yl=4007501668557849e-8,Ll=/^(sentinel\s*hub\s*wms|wms|root|default)$/i;function fe(e){return e.trim().toLowerCase().replace(/\s+/g," ").replace(/[^\p{L}\p{N}\s]/gu,"")}function dn(e){let t=0;return/^[0-9]+[-_.]/.test(e.name)&&(t-=2),e.name.includes("-")&&(t+=1),e.title.length>0&&e.title!==e.name&&(t+=1),t}function mn(e,t){return dn(e)>=dn(t)?e:t}function ka(e,t){var r,s;const n=Array.from(e.children).filter(l=>l.localName==="Layer");if(n.length>0){n.forEach(l=>ka(l,t));return}const a=(((r=e.getElementsByTagName("Name")[0])==null?void 0:r.textContent)||"").trim();if(!a||Ll.test(a))return;let i=(((s=e.getElementsByTagName("Title")[0])==null?void 0:s.textContent)||a).trim();a==="NDWI"&&/Moisture Index \(NDWI\)/i.test(i)&&(i="NDWI"),(/^NDMI$/i.test(a)||/moisture\s*index/i.test(i)||/moisture\s*index/i.test(a))&&(i="NDMI"),t.push({name:a,title:i})}function Bl(e){const t=[],n=e.querySelector("Capability > Layer")??e.getElementsByTagName("Layer")[0];n&&ka(n,t);const a=new Map;for(const r of t){const s=r.name.trim().toUpperCase();if(!s)continue;const l=a.get(s);a.set(s,l?mn(l,r):r)}const i=new Map;for(const r of a.values()){const s=fe(r.title||r.name);if(!s)continue;const l=i.get(s);i.set(s,l?mn(l,r):r)}return Array.from(i.values()).sort((r,s)=>(r.title||r.name).localeCompare(s.title||s.name,void 0,{sensitivity:"base"}))}function _l(e,t=Tt){if(!e.length)return"";const n=ue("NDVI",e);if(n)return n;const a=e.find(l=>String(l.name||"").trim().toUpperCase()==="NDVI");if(a)return a.name;const i=fe(t),r=e.find(l=>fe(l.title||l.name)===i||l.name===t);if(r)return r.name;for(const l of Al){const o=fe(l),c=e.find(u=>{const d=fe(u.title||u.name);return d===o||d.includes(o)||o.includes(d)});if(c)return c.name}const s=e.find(l=>/highlight/i.test(l.title)&&/natural/i.test(l.title));return s?s.name:e[0].name}function Ve(e,t=An()){const n=t.trim();if(!n)return e;const a=e.includes("?")?"&":"?";return`${e}${a}access_token=${encodeURIComponent(n)}`}function Rl(e,t=ie,n=Va){const a=Math.max(.12,Math.cos(e*Math.PI/180)),i=Math.log2(yl*a/(t*n));return Math.max(0,Math.ceil(i))}function Dl(e){const t=encodeURIComponent(e.layer),n=e.tilePixels??ie,a=e.categorical?Oa:Fa;let i=`${e.baseUrl}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${t}&BBOX={bbox-epsg-3857}&CRS=EPSG:3857&FORMAT=image/png&TRANSPARENT=true&WIDTH=${n}&HEIGHT=${n}&TIME=${e.timeStart}/${e.timeEnd}&MAXCC=${e.cloudCoverage}`+a+"&SHOWLOGO=false&WARNINGS=false";return e.geometryWkt3857&&(i+=`&GEOMETRY=${encodeURIComponent(e.geometryWkt3857)}`),e.evalscriptB64&&(i+=`&EVALSCRIPT=${encodeURIComponent(e.evalscriptB64)}`),Ve(i)}const wt=Yr()??[],xl=new Set((wt??[]).map(e=>String(e.name||"").trim().toUpperCase()));function Pt(e){return xl.has(String(e||"").trim().toUpperCase())}function X(e,t){var a;const n=t.toUpperCase();return(a=e.find(i=>String(i.name||"").toUpperCase().includes(n)||String(i.title||"").toUpperCase().includes(n)))==null?void 0:a.name}function Q(e){var t;return X(e,"1_TRUE_COLOR")??X(e,"1-TRUE-COLOR")??X(e,"TRUE-COLOR")??X(e,"TRUE_COLOR")??X(e,"1-0-0")??X(e,"SENTINEL-2")??X(e,"NDVI")??((t=e[0])==null?void 0:t.name)??"1_TRUE_COLOR"}const Tl={NDVI:/NDVI/i,NDMI:/NDMI|MOISTURE/i,NDII:/NDII/i,NDWI:/NDWI|WATER/i,SAVI:/SAVI/i,CHAS:/CHAS/i};function Wa(e){return/^\d+[_-]/.test(String(e||"").trim())}function ue(e,t){var r;const n=String(e||"").trim().toUpperCase();if(!n||n==="NDVI")return null;const a=Tl[n];if(!a)return null;const i=t.filter(s=>{const l=String(s.name||"").trim();return!l||Pt(l)||!Wa(l)?!1:a.test(l)||a.test(String(s.title||""))});return i.sort((s,l)=>s.name.localeCompare(l.name)),((r=i[0])==null?void 0:r.name)??null}function Be(e,t=de()){return ue(e,t)?!1:Fe(e)}const wl=new Set(["NDVI","NDMI","NDII","NDWI","MNDWI","AWEI","NBR","SAVI","ET","LST","DATAMASK"]);function Fe(e){const t=String(e||"").trim().toUpperCase();return t?!!(Pa(t)||xt(t)||le(t)||Pt(t)||wl.has(t)||ia(t)||_(t)):!1}function Ha(){return Vt([{name:"1_TRUE_COLOR",title:"True Color"},{name:"3_NDVI",title:"Normalized Difference Vegetation Index"},{name:"2_FALSE_COLOR",title:"False Color"},{name:"TRUE_COLOR",title:"True Color (legacy alias)"},{name:"NDVI",title:"NDVI (legacy alias)"},{name:"NDMI",title:"Normalized Difference Moisture Index"},{name:"NDII",title:"Normalized Difference Infrared Index"},{name:"NDWI",title:"Normalized Difference Water Index"},{name:"MNDWI",title:"Modified Normalized Difference Water Index"},{name:"AWEI",title:"Automated Water Extraction Index"},{name:"NBR",title:"Normalized Burn Ratio"},{name:"SAVI",title:"Soil-Adjusted Vegetation Index"},{name:"ET",title:"Evapotranspiration"},{name:"LST",title:"Land Surface Temperature"},{name:bl,title:"DataMask"}])}function de(e){const t=Ha();if(!(e!=null&&e.length))return t;const n=new Map;for(const a of t){const i=String(a.name||"").trim().toUpperCase();i&&n.set(i,a)}for(const a of e){const i=String(a.name||"").trim().toUpperCase();i&&n.set(i,a)}return Vt(Array.from(n.values()))}function Vt(e){const t=new Set(e.map(a=>String(a.name||"").trim().toUpperCase())),n=[...wt.filter(a=>!t.has(String(a.name||"").trim().toUpperCase())),...t.has(cn.name.toUpperCase())?[]:[cn],...t.has(en.name.toUpperCase())?[]:[en]];return n.length?[...e,...n]:e}function Pl(e,t){const n=String(e||"").trim();if(!n)return n;const a=n.toUpperCase();if(Pa(a))return Q(t);const i=ue(n,t);return i||(Fe(a)?Q(t):t.some(r=>String(r.name||"").trim().toUpperCase()===a)?n:Q(t))}const $a=30;function Vl(e,t,n,a){const i=String(t||"").trim().slice(0,10);if(!i)return{timeStart:"",timeEnd:""};if(xt(e)){const s=(a==null?void 0:a.lookbackDays)??120;return{timeStart:B(i,s),timeEnd:i}}if(le(e)){const s=(a==null?void 0:a.lookbackDays)??120;return{timeStart:B(i,s),timeEnd:i}}if(F(e)){const s=(a==null?void 0:a.lookbackDays)??Dn;return{timeStart:B(i,s),timeEnd:i}}if(k(e)){if(n&&n.trim()&&n.trim()!==i)return{timeStart:n.trim(),timeEnd:i};const s=(a==null?void 0:a.lookbackDays)??Wi;return{timeStart:B(i,s),timeEnd:i}}if(Un(e)){if(n&&n.trim()&&n.trim()!==i)return{timeStart:n.trim(),timeEnd:i};const s=(a==null?void 0:a.lookbackDays)??tr;return{timeStart:B(i,s),timeEnd:i}}if(_(e)&&n&&n.trim()&&n.trim()!==i)return{timeStart:n.trim(),timeEnd:i};const r=(a==null?void 0:a.lookbackDays)??$a;return{timeStart:B(i,r),timeEnd:i}}function Fl(e,t={}){const n=String(e||"").trim().slice(0,10);if(!n)return null;const a=String(t.autoPreviousSceneDate||"").trim().slice(0,10);if(a&&a!==n)return a;const i=Tn(n,t.catalogSceneIsos??[]);if(i&&i!==n)return i;const r=String(t.timeSeriesStart||"").trim().slice(0,10);if(r&&r!==n&&r<n)return r;const s=t.calendarFallbackDays??7,l=new Date(`${n}T12:00:00Z`);if(Number.isNaN(l.getTime()))return null;l.setUTCDate(l.getUTCDate()-s);const o=l.toISOString().slice(0,10);return o!==n?o:null}const Su=Object.freeze(Object.defineProperty({__proto__:null,AGRO_CLOUD_CUSTOM_WMS_LAYERS:wt,SENTINEL_HUB_S2_MAX_METERS_PER_PIXEL:Va,SENTINEL_HUB_WMS_CATEGORICAL_RESAMPLE_PARAMS:Oa,SENTINEL_HUB_WMS_LAYER_LIVE_LOOKBACK_DAYS:$a,SENTINEL_HUB_WMS_RASTER_RESAMPLE_PARAMS:Fa,SENTINEL_HUB_WMS_TILE_PIXELS:ie,SI_DEFAULT_LIVE_WMS_LAYER:Ml,SI_DEFAULT_SENTINEL_WMS_LAYER_TITLE:Tt,SI_SENTINEL_WMS_MAP_DISPLAY_MIN_ZOOM:Nl,appendSentinelHubWmsAccessToken:Ve,buildSentinelHubWmsGetMapUrlParts:Dl,getBootstrapSentinelWmsLayers:Ha,getSentinelHubWmsLayerCatalog:de,isAgroCloudCustomWmsLayer:Pt,isSentinelHubInstanceNativeWmsLayerName:Wa,mergeAgroCloudCustomWmsLayers:Vt,parseSentinelHubWmsCapabilities:Bl,pickDefaultSentinelWmsLayer:_l,resolveSentinelHubWmsDeltaPreviousDate:Fl,resolveSentinelHubWmsEvalscriptProxyLayerName:Q,resolveSentinelHubWmsGetMapLayerName:Pl,resolveSentinelHubWmsNativeIndexLayerName:ue,resolveSentinelHubWmsNativeMaxZoom:El,resolveSentinelHubWmsTilePixels:vl,resolveSentinelHubWmsTimeWindow:Vl,sentinelHubWmsMinZoomForLatitude:Rl,usesSentinelHubWmsClientEvalscript:Be,usesSentinelHubWmsCustomEvalscript:Fe},Symbol.toStringTag,{value:"Module"})),Ol=.32,pu=120,Ft=.06,hu=80;function _e(e){const[t,n,a,i]=e;return![t,n,a,i].every(Number.isFinite)||a<t||i<n?null:[t,n,a,i]}function Cu(e,t){const n=_e(e),a=_e(t);return!n||!a?!1:n[0]<=a[0]&&n[1]<=a[1]&&n[2]>=a[2]&&n[3]>=a[3]}function bu(e,t=Ol){const[n,a,i,r]=e,s=Math.max((i-n)*t,1e-5),l=Math.max((r-a)*t,1e-5);return[n-s,a-l,i+s,r+l]}function kl(e,t=Ft){const[n,a,i,r]=e;return[Math.floor(n/t)*t,Math.floor(a/t)*t,Math.ceil(i/t)*t,Math.ceil(r/t)*t]}function Wl(e,t=Ft){return kl(e,t).map(a=>a.toFixed(4)).join(",")}function Nu(e,t,n=Ft){return!e||t<=0?null:`${Wl(e,n)}:n${t}`}function Hl(e,t){const n=Si(e);return n?Bn(n,t):!1}function vu(e,t){return{type:"FeatureCollection",features:(Array.isArray(e==null?void 0:e.features)?e.features:[]).filter(a=>{const i=a==null?void 0:a.geometry;return Hl(i,t)})}}function Re(e,t=.04){if(!e.length)return null;let n=1/0,a=1/0,i=-1/0,r=-1/0;for(const o of e)for(const[c,u]of o)!Number.isFinite(c)||!Number.isFinite(u)||(n=Math.min(n,c),i=Math.max(i,c),a=Math.min(a,u),r=Math.max(r,u));if(!Number.isFinite(n))return null;const s=Math.max((i-n)*t,1e-6),l=Math.max((r-a)*t,1e-6);return[n-s,a-l,i+s,r+l]}function $l(e,t){return e.filter(n=>{let a=1/0,i=1/0,r=-1/0,s=-1/0;for(const[l,o]of n)!Number.isFinite(l)||!Number.isFinite(o)||(a=Math.min(a,l),r=Math.max(r,l),i=Math.min(i,o),s=Math.max(s,o));return Number.isFinite(a)?Bn([a,i,r,s],t):!1})}function Eu(e){const t=e.longitude,n=e.latitude,a=e.zoom;if(!Number.isFinite(t)||!Number.isFinite(n)||!Number.isFinite(a))return null;const i=n*Math.PI/180,r=512*2**a,s=e.width&&e.width>0?e.width:1280,l=e.height&&e.height>0?e.height:720,o=s/r*360*.5,c=l/r*360*Math.cos(i)*.5;return _e([t-o,n-c,t+o,n+c])}function Mu(e,t,n){return e>=n[0]&&e<=n[2]&&t>=n[1]&&t<=n[3]}function Au(e){var t;try{const n=(t=e==null?void 0:e.getBounds)==null?void 0:t.call(e);return n?_e([n.getWest(),n.getSouth(),n.getEast(),n.getNorth()]):null}catch{return null}}function Je(e){if(!e||e.length<3)return 0;let t=1/0,n=1/0,a=-1/0,i=-1/0;for(const[r,s]of e)!Number.isFinite(r)||!Number.isFinite(s)||(t=Math.min(t,r),a=Math.max(a,r),n=Math.min(n,s),i=Math.max(i,s));return Number.isFinite(t)?Math.max(0,a-t)*Math.max(0,i-n):0}function Ua(e){return!Array.isArray(e)||!e.length?[]:[...e].sort((t,n)=>Je(n)-Je(t))}function Ul(e,t){return(Array.isArray(e)?e.filter(a=>Array.isArray(a)&&a.length>=3):[]).map(a=>({geometryWkt3857:N([a]),evalscriptB64:t,aoiBoundsLngLat:Re([a])}))}function Ga(e,t,n){const a=Array.isArray(e)?e.filter(c=>c&&Array.isArray(c.outerRings)&&c.outerRings.length>0):[],i=Math.max(1,Math.floor(t));if(a.length<=i)return a;const r=kt(n);let s=[...a];const l=s.flatMap(c=>c.outerRings),o=N(l);if(o.length<=r&&i>=1)return[{geometryWkt3857:o,outerRings:l}];for(;s.length>i;){let c=!1;for(let m=0;m<s.length-1;m++){const I=[...s[m].outerRings,...s[m+1].outerRings],p=N(I);if(p.length<=r){const g={geometryWkt3857:p,outerRings:I};s=[...s.slice(0,m),g,...s.slice(m+2)],c=!0;break}}if(c)continue;let u=0,d=1,f=1/0;for(let m=0;m<s.length;m++)for(let I=m+1;I<s.length;I++){const p=[...s[m].outerRings,...s[I].outerRings],g=N(p).length;g<=r&&g<f&&(f=g,u=m,d=I)}if(f<1/0){const m=[...s[u].outerRings,...s[d].outerRings],I={geometryWkt3857:N(m),outerRings:m};s=s.filter((p,g)=>g!==u&&g!==d),s.push(I);continue}break}return s}function fn(e,t){const n=t;return n==null||!Number.isFinite(n)||n<=0||e.length<=n,e}const Qe=5600,Ka=96;function Ya(e,t){const n=e*2003750834e-2/180,a=Math.log(Math.tan((90+t)*Math.PI/360))/(Math.PI/180)*(2003750834e-2/180);return[n,a]}function De(e){if(e.length<2)return e;const t=e[0],n=e[e.length-1];return t[0]===n[0]&&t[1]===n[1]?e:[...e,t]}function Gl(e,t,n){const[a,i]=e,[r,s]=t,[l,o]=n,c=l-r,u=o-s;if(c===0&&u===0)return Math.hypot(a-r,i-s);const d=Math.max(0,Math.min(1,((a-r)*c+(i-s)*u)/(c*c+u*u))),f=r+d*c,m=s+d*u;return Math.hypot(a-f,i-m)}function Se(e,t){if(e.length<=2)return e;let n=0,a=0;for(let i=1;i<e.length-1;i++){const r=Gl(e[i],e[0],e[e.length-1]);r>n&&(a=i,n=r)}if(n>t){const i=Se(e.slice(0,a+1),t),r=Se(e.slice(a),t);return[...i.slice(0,-1),...r]}return[e[0],e[e.length-1]]}function re(e,t){if(e.length<=t)return e;const n=Math.ceil(e.length/t),a=[];for(let s=0;s<e.length;s+=n)a.push(e[s]);const i=e[e.length-1],r=a[a.length-1];return(r[0]!==i[0]||r[1]!==i[1])&&a.push(i),a}function Kl(e){return e<=1?Ka:e<=4?64:e<=8?48:e<=16?36:e<=24?28:e<=40?24:e<=80?20:(e<=200,16)}function et(e,t=Ka){const n=De(e);let a=25e-6,i=Se(n,a);for(let r=0;r<8&&i.length>t;r++)a*=1.75,i=Se(n,a);return i=re(i,t),De(i)}function Xa(e){return!Array.isArray(e)||e.length<2?"":e.map(([t,n])=>{const[a,i]=Ya(t,n);return`${a.toFixed(2)} ${i.toFixed(2)}`}).join(", ")}function Yl(e){const t=Xa(e);return t?`POLYGON((${t}))`:"POLYGON EMPTY"}function N(e){const t=Array.isArray(e)?e.filter(a=>Array.isArray(a)&&a.length>=3):[];return t.length?t.length===1?Yl(t[0]):`MULTIPOLYGON(${t.map(a=>`((${Xa(a)}))`).join(", ")})`:"POLYGON EMPTY"}function za(e){const t=String(e||"").toUpperCase();return Pe(t)?"data_mask":xt(t)?"crop_classification":le(t)?"lulc_classification":ia(t)?"agro_composite":Oe(e)?"native":t.includes("GNDVI")?"gndvi":t.includes("NDSI")||t.includes("SNOW")?"ndsi":t.includes("NDRE")?"ndre":t.includes("BSI")?"native":t.includes("MNDWI")?"mndwi":t.includes("AWEI")?"awei":t.includes("NBR")?"nbr":t.includes("SAVI")?"savi":t.includes("NDVI")?"ndvi":t.includes("EVI")&&!t.includes("NEVI")?"evi":t.includes("NDII")?"ndii":t.includes("NDMI")||t.includes("MOISTURE")&&!t.includes("EVAPO")?"ndmi":t==="ET"||t.includes("EVAPOTRANSPIRATION")||t.includes("EVAPO")?"et":t==="LST"||t.includes("LAND_SURFACE_TEMP")||t.includes("SURFACE")&&t.includes("TEMP")?"lst":t.includes("NDWI")||t.includes("WATER")?"ndwi":t.includes("FALSE")||t.includes("SWIR")||t.includes("COLOR_INFRARED")?"false_color":t.includes("TRUE")||t.includes("NATURAL")||t.includes("RGB")?"true_color":"native"}function Oe(e){const t=String(e||"").toUpperCase();return/HIGHLIGHT|OPTIMIZED|ENHANCED|VIVID|CONTRAST|MOMA|AGRICULTURE|COLOR.?BLIND|ATMOSPHERIC|PERSPECTIVE/i.test(t)}function ja(e,t,n,a,i){if(e==="agro_composite")return gl(n,t)??"";if(e==="data_mask")return wa();if(e==="crop_classification")return Sl();if(e==="lulc_classification")return hl();if(Ks(e))return Gs(e,t,{sceneDate:a,terrain3dCloudExtrusion:i});switch(e){case"native":return"";case"true_color":case"generic_rgb":return`//VERSION=3
function setup() {
  return {
    input: ["B02", "B03", "B04", "dataMask"],
    output: { bands: 4, sampleType: "AUTO" }
  };
}
function evaluatePixel(s) {
  return [
    Math.max(0, Math.min(1, s.B04 * ${Ee})),
    Math.max(0, Math.min(1, s.B03 * ${Ee})),
    Math.max(0, Math.min(1, s.B02 * ${Ee})),
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
}`;default:return ja("generic_rgb",t,n)}}function Za(e){const t=unescape(encodeURIComponent(e.replace(/\r\n/g,`
`).trim()));return btoa(t)}function Xl(e,t,n,a=64){const i=[],r=t*Math.PI/180,s=Math.cos(r),l=111320,o=111320*(Math.abs(s)>1e-6?s:1e-6);for(let c=0;c<=a;c++){const u=c/a*2*Math.PI,d=n*Math.cos(u)/o,f=n*Math.sin(u)/l;i.push([e+d,t+f])}return i}function In(e){const t=e.geometry;if(!t||typeof t!="object")return null;if(t.type==="Polygon"||t.type==="MultiPolygon")return t;if(t.type==="Point"&&Array.isArray(t.coordinates)&&t.coordinates.length>=2){const n=e.properties,a=Number(n==null?void 0:n.radius);if(!Number.isFinite(a)||a<=0)return null;const i=Number(t.coordinates[0]),r=Number(t.coordinates[1]);return!Number.isFinite(i)||!Number.isFinite(r)?null:{type:"Polygon",coordinates:[Xl(i,r,a)]}}return null}function zl(e){const t=[];for(const n of e)n.type==="Polygon"?t.push(n.coordinates):t.push(...n.coordinates);return t.length?t.length===1?{type:"Polygon",coordinates:t[0]}:{type:"MultiPolygon",coordinates:t}:null}function Y(e){if(!e||typeof e!="object")return null;const t=e;if(t.type==="Feature"&&t.geometry){const n=In(t);return n||Y(t.geometry)}if(t.type==="FeatureCollection"&&Array.isArray(t.features)){const n=[];for(const a of t.features){const i=In(a)??Y(a);i&&n.push(i)}return zl(n)}return t.type==="Polygon"||t.type==="MultiPolygon"?t:null}function Ot(e){const t=Y(e);if(!t)return[];const n=i=>{if(!Array.isArray(i)||i.length<3)return null;const r=[];for(const s of i){if(!Array.isArray(s)||s.length<2)continue;const l=Number(s[0]),o=Number(s[1]);!Number.isFinite(l)||!Number.isFinite(o)||r.push([l,o])}return r.length>=3?r:null},a=[];if(t.type==="Polygon"){const i=n(t.coordinates[0]);i&&a.push(i)}else for(const i of t.coordinates){const r=n(i==null?void 0:i[0]);r&&a.push(r)}return a}function pe(e,t){if(Oe(e)||ue(e,de()))return null;const n=za(e),a=n==="native"?"true_color":n,i=(t==null?void 0:t.indexVisibilityMin)??null;let r=ja(a,i,e,t==null?void 0:t.sceneDate,t==null?void 0:t.terrain3dCloudExtrusion);return r?Za(r):null}function gn(e){const t=Kl(e.length);let n=e.map(r=>et(r,t)),a=N(n);if(a.length<=Qe)return n;const i=Math.max(6,Math.floor(t*.65));return n=e.map(r=>re(Se(De(r),2e-4),i)),a=N(n),a.length<=Qe?n:e.map(r=>re(r,Math.max(16,Math.min(32,t))))}function kt(e){const t=(e==null?void 0:e.length)??0;return Math.max(1200,Qe-t-48)}const tt=64;function jl(e){const t=Math.max(0,Math.floor(Number(e)||0));return t<=0?16:t<=16?Math.min(tt,Math.max(8,t)):t<=80?24:t<=250?36:t<=600?48:tt}function nt(e,t){let n=N([e]);if(n.length<=t)return n;let a=re(e,Math.max(8,Math.floor(e.length*.55)));return n=N([a]),n.length<=t?n:(a=re(e,Math.max(6,Math.floor(e.length*.35))),N([a]))}function qa(e,t){if(!e.length)return[];const n=kt(t),a=[];let i=[];const r=()=>{i.length&&(a.push({geometryWkt3857:N(i),outerRings:i}),i=[])};for(const s of e){const l=[...i,s];if(N(l).length<=n){i=l;continue}r(),N([s]).length<=n?i=[s]:a.push({geometryWkt3857:nt(s,n),outerRings:[s]})}return r(),a}function Zl(e,t){const n=Math.max(1,Math.floor(t));let a=0,i=0,r=0;for(const[l,o]of e)!Number.isFinite(l)||!Number.isFinite(o)||(a+=l,i+=o,r+=1);return r?(a/=r,i/=r,Math.abs(Math.floor(a*1e3)*73856093^Math.floor(i*1e3)*19349663)%n):0}function at(e,t,n){if(!e.length)return[];const a=Math.max(1,Math.floor(t)),i=kt(n);if(e.length<=a)return e.map(l=>({geometryWkt3857:nt(l,i),outerRings:[l]}));const r=Array.from({length:a},()=>[]);for(const l of e)r[Zl(l,a)].push(l);const s=[];for(const l of r){if(!l.length)continue;let o=l.length>40?12:l.length>16?16:24,c=l.map(d=>et(d,o)),u=N(c);for(;u.length>i&&o>5;)o=Math.max(5,Math.floor(o*.65)),c=l.map(d=>et(d,o)),u=N(c);if(u.length>i&&(c=l.map(d=>re(De(d),5)),u=N(c)),u.length>i){for(const d of c)s.push({geometryWkt3857:nt(d,i),outerRings:[d]});continue}s.push({geometryWkt3857:u,outerRings:c})}return s.length<=a?s:Ga(s,a,n)}function Ae(e,t,n){let a=Ot(e);if(n!=null&&n.viewportBBox){const c=$l(a,n.viewportBBox);c.length&&(a=c)}if(!a.length)return[];const i=pe(t,n),r=(n==null?void 0:n.maxTileLayers)??null,s=Ua(a);if(n!=null&&n.preferSingleRingChunks&&(r==null||r<=0||s.length<=r))return Ul(gn(s),i);if(r!=null&&Number.isFinite(r)&&r>0&&s.length>r)return at(s,r,i).map(u=>({geometryWkt3857:u.geometryWkt3857,evalscriptB64:i,aoiBoundsLngLat:Re(u.outerRings)}));let l=gn(s),o=qa(l,i);return o.length?(r!=null&&Number.isFinite(r)&&r>0&&o.length>r&&(o=at(l,r,i)),o.map(c=>({geometryWkt3857:c.geometryWkt3857,evalscriptB64:i,aoiBoundsLngLat:Re(c.outerRings)}))):[]}function Ja(e,t,n){const a=String(t||"").trim();if(!a)return[];const i=Ot(e),r=(n==null?void 0:n.maxTileLayers)??null;if(i.length>0){let o=Ae(e,t,n);if(!o.length&&(n!=null&&n.viewportBBox)&&(o=Ae(e,t,{...n,viewportBBox:null})),o.length)return fn(o,r);const c=pe(a,n);return c&&Be(a)?[{geometryWkt3857:null,evalscriptB64:c,aoiBoundsLngLat:Re(i)}]:[]}const s=pe(a,n);if(s)return[{geometryWkt3857:null,evalscriptB64:s}];const l=Ae(e,t,n);return l.length?fn(l,r):Be(a)?[]:[{geometryWkt3857:null,evalscriptB64:null}]}function Qa(e,t){return!String(e||"").trim()||!t.length?!1:t.every(n=>n.evalscriptB64!=null||!Be(e))}function ql(e,t,n){return Qa(e,t)?t.some(i=>!!i.geometryWkt3857)?t.every(i=>!!i.geometryWkt3857&&!!(i.aoiBoundsLngLat??(n==null?void 0:n.aoiBoundsLngLat)??i.geometryWkt3857)):!0:!1}function Jl(e,t,n){const a=Ja(e,t,n);return a.length?a[0]:{geometryWkt3857:null,evalscriptB64:null}}const yu=Object.freeze(Object.defineProperty({__proto__:null,SI_SENTINEL_AOI_WMS_HARD_MAX_SOURCES:tt,buildEvalscriptB64ForLayer:pe,buildSentinelHubWmsAoiClip:Jl,buildSentinelHubWmsAoiClipChunks:Ae,buildSentinelHubWmsDisplayChunks:Ja,canRenderSentinelHubWmsLayerOnMap:Qa,evalscriptToBase64Param:Za,extractOuterRingsWgs84:Ot,getDrawnGeometry:Y,inferWmsEvalProfile:za,isSentinelHubWmsRenderReady:ql,lngLatToWebMercator:Ya,mergeWktChunkGroupsToCap:Ga,outerRingApproxArea:Je,packOuterRingsIntoFixedBucketGroups:at,packOuterRingsIntoWktChunkGroups:qa,resolveLayersAoiWmsMaxTileLayers:jl,sortOuterRingsByApproxAreaDesc:Ua,usesPresetSentinelHubWmsLayer:Oe},Symbol.toStringTag,{value:"Module"}));function ei(e){const t=String(e||"").trim();if(!t)return!1;const n=t.toUpperCase();if(Oe(t))return!0;const a=de();return!!(ue(t,a)||pe(t)!=null||!Fe(n)&&a.some(i=>String(i.name||"").trim().toUpperCase()===n))}function ti(e,t){const n=[];for(const a of e){const i=a.options.filter(r=>t(r.id));i.length&&n.push({...a,options:i})}return n}function Lu(e){return ti(e,ei)}function Bu(e){return ei(e)}const Ql=128,eo=4,to=160;function no(e){const t=String(e||"").replace(/\r\n/g,`
`).trim();return typeof btoa=="function"?btoa(unescape(encodeURIComponent(t))):t}const ao=no(Ss);function ni(e,t){const n=e*2003750834e-2/180,a=Math.log(Math.tan((90+t)*Math.PI/360))/(Math.PI/180)*(2003750834e-2/180);return[n,a]}function ai(e,t){if(e){if(Array.isArray(e)&&typeof e[0]=="number"&&typeof e[1]=="number"){t.push([e[0],e[1]]);return}Array.isArray(e)&&e.forEach(n=>ai(n,t))}}function io(e){const t=[];if("coordinates"in e&&ai(e.coordinates,t),!t.length)return null;let n=1/0,a=1/0,i=-1/0,r=-1/0;for(const[o,c]of t){const[u,d]=ni(o,c);u<n&&(n=u),d<a&&(a=d),u>i&&(i=u),d>r&&(r=d)}if(![n,a,i,r].every(Number.isFinite))return null;const s=Math.max(8,(i-n)*.02),l=Math.max(8,(r-a)*.02);return[n-s,a-l,i+s,r+l]}function Sn(e){if(e.length<2)return e;const t=e[0],n=e[e.length-1];return t[0]===n[0]&&t[1]===n[1]?e:[...e,t]}function pn(e,t){if(e.length<=t)return e;const n=Math.ceil(e.length/t),a=[];for(let s=0;s<e.length;s+=n)a.push(e[s]);const i=e[e.length-1],r=a[a.length-1];return(r[0]!==i[0]||r[1]!==i[1])&&a.push(i),a}function He(e){return e.map(([t,n])=>{const[a,i]=ni(t,n);return`${a.toFixed(2)} ${i.toFixed(2)}`}).join(", ")}function ro(e){var t;if(e.type==="Polygon"){const n=(t=e.coordinates)==null?void 0:t[0];if(!Array.isArray(n)||!n.length)return null;const a=pn(Sn(n),36);return`POLYGON((${He(a)}))`}if(e.type==="MultiPolygon"){const n=(e.coordinates||[]).map(i=>{const r=i==null?void 0:i[0];return!Array.isArray(r)||!r.length?null:pn(Sn(r),28)}).filter(i=>!!i);return n.length?n.length===1?`POLYGON((${He(n[0])}))`:`MULTIPOLYGON(${n.map(i=>`((${He(i)}))`).join(", ")})`:null}return null}async function so(e,t,n,a){var l;const i=await fetch(e,{headers:{Accept:"image/png"},signal:a});if(!i.ok){const o=await i.text().catch(()=>"");throw new Error(`WMS GetMap failed (${i.status}): ${o.slice(0,160)}`)}const r=await i.blob(),s=await createImageBitmap(r);try{const o=document.createElement("canvas");o.width=t,o.height=n;const c=o.getContext("2d");if(!c)throw new Error("Canvas 2D context unavailable.");return c.drawImage(s,0,0,t,n),c.getImageData(0,0,t,n).data}finally{(l=s.close)==null||l.call(s)}}function lo(){return!!Ln().trim()}async function oo(e,t,n,a){const i=io(e),r=ro(e);if(!i||!r)return null;const s=Q(de()),[l,o,c,u]=i,d=Ql,f=ht(t,1);let m=`${yn()}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${encodeURIComponent(s)}&BBOX=${l},${o},${c},${u}&CRS=EPSG:3857&FORMAT=image/png&TRANSPARENT=true&WIDTH=${d}&HEIGHT=${d}&TIME=${t}/${f}&MAXCC=${da}&GEOMETRY=${encodeURIComponent(r)}&SHOWLOGO=false&WARNINGS=false&EVALSCRIPT=${encodeURIComponent(ao)}`;m=Ve(m);try{const I=await so(m,d,d,n),p=ps(I),g=Ca(t,p,{sceneId:t,originalCloudCoverage:(a==null?void 0:a.originalCloudCoverage)??null});return ba(g),{stats:p,log:g}}catch{return null}}async function co(e,t,n){if(!e.length)return[];const a=new Array(e.length);let i=0;const r=Array.from({length:Math.min(t,e.length)},async()=>{for(;i<e.length;){const s=i++;a[s]=await n(e[s])}});return await Promise.all(r),a}async function uo(e,t,n,a){const i=[...new Set(t.map(m=>m.trim().slice(0,10)).filter(Boolean))].sort((m,I)=>I.localeCompare(m));if(!i.length)return{sceneIsos:[],sceneCloudByDate:{},sceneClearByDate:{},sceneLogs:[]};const r=Y(e);if(!r||!lo())return{sceneIsos:i,sceneCloudByDate:{},sceneClearByDate:{},sceneLogs:[]};const s=i.slice(0,to),o=(await co(s,eo,async m=>{var R,b;if((R=a==null?void 0:a.signal)!=null&&R.aborted)return null;const I=await oo(r,m,a==null?void 0:a.signal,{originalCloudCoverage:((b=a==null?void 0:a.originalCloudByDate)==null?void 0:b[m])??null});if(!I)return null;const{stats:p,log:g}=I;return p.aoiCloudCoverPct==null?null:{date:m,aoiCloudCoverPct:p.aoiCloudCoverPct,aoiClearCoverPct:p.aoiClearCoverPct??0,usable:g.usable,log:g}})).filter(m=>!!m).sort((m,I)=>m.usable!==I.usable?m.usable?-1:1:I.aoiClearCoverPct-m.aoiClearCoverPct||m.aoiCloudCoverPct-I.aoiCloudCoverPct),c={},u={},d=[],f=[];for(const m of o)c[m.date]=m.aoiCloudCoverPct,u[m.date]=m.aoiClearCoverPct,d.push(m.log),f.push(m.date);for(const m of i)f.includes(m)||f.push(m);return f.sort((m,I)=>{const p=u[m]??-1,g=u[I]??-1;return p!==g?g-p:I.localeCompare(m)}),{sceneIsos:f,sceneCloudByDate:c,sceneClearByDate:u,sceneLogs:d}}const z=[{id:"bare",label:"FALLOW / FAILURE",rangeLabel:"< 0.05",min:-1,max:.05,color:"#d32f2f",icon:"fa-xmark",interpretation:"Bare soil or crop failure — no viable vegetation cover detected."},{id:"stress",label:"STRESS HIGH",rangeLabel:"0.05 – 0.25",min:.05,max:.25,color:"#ff9800",icon:"fa-droplet-slash",interpretation:"Severe crop stress — water deficit or physiological damage likely."},{id:"watch",label:"WATCH",rangeLabel:"0.25 – 0.40",min:.25,max:.4,color:"#ffeb3b",icon:"fa-eye",interpretation:"Early vigor decline — monitor the field without immediate intervention."},{id:"healthy",label:"MODERATE HEALTH",rangeLabel:"0.40 – 0.60",min:.4,max:.6,color:"#aeea00",icon:"fa-leaf",interpretation:"Moderate canopy health — stable mid-season crop vigor."},{id:"growth",label:"STRONG GROWTH",rangeLabel:"0.60 – 0.75",min:.6,max:.75,color:"#2e7d32",icon:"fa-seedling",interpretation:"Strong biomass accumulation — active crop growth phase."},{id:"harvest-ready",label:"HARVEST READY",rangeLabel:"≥ 0.75",min:.75,max:1.05,color:"#1b5e20",icon:"fa-wheat-awn",interpretation:"Peak crop maturity — optimal harvest readiness window."}];Object.fromEntries(z.map(e=>[e.id,e.icon]));function _u(e){const t=Number.isFinite(e)?e:0;return t<.05?z[0]:t<.25?z[1]:t<.4?z[2]:t<.6?z[3]:t<.75?z[4]:z[5]}function Ru(e){const t=e.replace("#","").trim();if(t.length!==6)return"#f8fafc";const n=Number.parseInt(t.slice(0,2),16),a=Number.parseInt(t.slice(2,4),16),i=Number.parseInt(t.slice(4,6),16);return!Number.isFinite(n)||!Number.isFinite(a)||!Number.isFinite(i)?"#f8fafc":.299*n+.587*a+.114*i>148?"#1e293b":"#f8fafc"}const ii="https://planetarycomputer.microsoft.com/api/stac/v1/search",mo=120,fo=20*6e4,hn=new Map,$e=new Map;function Io(e,t){return JSON.stringify({body:e,...t})}function go(e){const t=Y(e);if(!t)return"";try{return JSON.stringify(t)}catch{return String(t.type||"")}}function So(e){var n;const t=(n=e==null?void 0:e.properties)==null?void 0:n.datetime;return typeof t!="string"||t.length<10?null:t.slice(0,10)}function ri(e,t){if(e){if(Array.isArray(e)&&typeof e[0]=="number"&&typeof e[1]=="number"){t.push([e[0],e[1]]);return}Array.isArray(e)&&e.forEach(n=>ri(n,t))}}function po(e){const t=Y(e);if(!t)return null;const n=[];if(ri(t.coordinates,n),!n.length)return null;let a=1/0,i=1/0,r=-1/0,s=-1/0;for(const[l,o]of n)l<a&&(a=l),o<i&&(i=o),l>r&&(r=l),o>s&&(s=o);return[a,i,r,s].every(Number.isFinite)?[a,i,r,s]:null}function ho(e,t){var c;const n=Y(e),a=po(e);if(!n&&!a)return null;const i=(t==null?void 0:t.lookbackDays)??mo,r=se(),s=B(r,i),l=((c=t==null?void 0:t.collections)==null?void 0:c.map(u=>u.trim()).filter(Boolean))??["sentinel-2-l2a"],o={collections:l.length?l:["sentinel-2-l2a"],datetime:`${s}T00:00:00Z/${r}T23:59:59Z`,limit:Math.min(500,Math.max(1,(t==null?void 0:t.limit)??250)),sortby:[{field:"datetime",direction:"desc"}]};return n?o.intersects=n:a&&(o.bbox=a),o}function Co(e){const t=[...new Set(e.map(So).filter(n=>typeof n=="string"&&n.length>=10))].sort((n,a)=>a.localeCompare(n));return{latestSceneIso:t[0]??null,sceneIsos:t,fetchedAt:Date.now()}}async function Du(e,t){const n=ho(e,{collections:t==null?void 0:t.collections,lookbackDays:t==null?void 0:t.lookbackDays});if(!n)return{latestSceneIso:null,sceneIsos:[],fetchedAt:Date.now()};const a=t==null?void 0:t.cloudCoverMax,i=Io(n,{cloudCoverMax:a,geomKey:go(e)}),r=hn.get(i);if(r&&Date.now()<r.expiresAt)return r.catalog;const s=$e.get(i);if(s)return s;const l=(async()=>{try{const o=await fetch(ii,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/geo+json"},body:JSON.stringify(n),signal:t==null?void 0:t.signal});if(!o.ok)return{latestSceneIso:null,sceneIsos:[],fetchedAt:Date.now()};const c=await o.json(),u=Co(Array.isArray(c==null?void 0:c.features)?c.features:[]);let d=u.sceneIsos,f,m;if(u.sceneIsos.length){const p=typeof a=="number"&&Number.isFinite(a)?a:100,g=await uo(e,u.sceneIsos,p,{signal:t==null?void 0:t.signal});d=g.sceneIsos.length?g.sceneIsos:u.sceneIsos,f=Object.keys(g.sceneCloudByDate).length?g.sceneCloudByDate:void 0,m=Object.keys(g.sceneClearByDate).length?g.sceneClearByDate:void 0}const I={latestSceneIso:d[0]??null,sceneIsos:d,sceneCloudByDate:f,sceneClearByDate:m,fetchedAt:Date.now()};return hn.set(i,{catalog:I,expiresAt:Date.now()+fo}),I}catch{return{latestSceneIso:null,sceneIsos:[],fetchedAt:Date.now()}}})();$e.set(i,l);try{return await l}finally{$e.delete(i)}}const q=256,bo=160,No=4,vo=`//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B02", "B03", "B04", "B08", "B11", "SCL", "CLP", "dataMask"] }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  ${ha("s")}
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
}`,Eo=`//VERSION=3
function setup() {
  return {
    input: [{ bands: ["B03", "B04", "B05", "B08", "B11", "SCL", "CLP", "dataMask"] }],
    output: { bands: 4, sampleType: "UINT8" }
  };
}
function evaluatePixel(s) {
  ${ha("s")}
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
}`;function si(e){const t=String(e||"").replace(/\r\n/g,`
`).trim();return typeof btoa=="function"?btoa(unescape(encodeURIComponent(t))):t}const Mo=si(vo),Ao=si(Eo);function yo(){return!!Ln().trim()}function li(e,t){const n=e*2003750834e-2/180,a=Math.log(Math.tan((90+t)*Math.PI/360))/(Math.PI/180)*(2003750834e-2/180);return[n,a]}function oi(e,t){if(e){if(Array.isArray(e)&&typeof e[0]=="number"&&typeof e[1]=="number"){t.push([e[0],e[1]]);return}Array.isArray(e)&&e.forEach(n=>oi(n,t))}}function Lo(e){const t=[];if("coordinates"in e&&oi(e.coordinates,t),!t.length)return null;let n=1/0,a=1/0,i=-1/0,r=-1/0;for(const[o,c]of t){const[u,d]=li(o,c);u<n&&(n=u),d<a&&(a=d),u>i&&(i=u),d>r&&(r=d)}if(![n,a,i,r].every(Number.isFinite))return null;const s=Math.max(8,(i-n)*.02),l=Math.max(8,(r-a)*.02);return[n-s,a-l,i+s,r+l]}function Cn(e){if(e.length<2)return e;const t=e[0],n=e[e.length-1];return t[0]===n[0]&&t[1]===n[1]?e:[...e,t]}function bn(e,t){if(e.length<=t)return e;const n=Math.ceil(e.length/t),a=[];for(let s=0;s<e.length;s+=n)a.push(e[s]);const i=e[e.length-1],r=a[a.length-1];return(r[0]!==i[0]||r[1]!==i[1])&&a.push(i),a}function Ue(e){return e.map(([t,n])=>{const[a,i]=li(t,n);return`${a.toFixed(2)} ${i.toFixed(2)}`}).join(", ")}function Bo(e){var t;if(e.type==="Polygon"){const n=(t=e.coordinates)==null?void 0:t[0];if(!Array.isArray(n)||!n.length)return null;const a=bn(Cn(n),36);return`POLYGON((${Ue(a)}))`}if(e.type==="MultiPolygon"){const n=(e.coordinates||[]).map(i=>{const r=i==null?void 0:i[0];return!Array.isArray(r)||!r.length?null:bn(Cn(r),28)}).filter(i=>!!i);return n.length?n.length===1?`POLYGON((${Ue(n[0])}))`:`MULTIPOLYGON(${n.map(i=>`((${Ue(i)}))`).join(", ")})`:null}return null}function _o(e,t){const n=document.createElement("canvas");return n.width=e,n.height=t,n}async function Nn(e,t,n,a){var l;const i=await fetch(e,{headers:{Accept:"image/png"},signal:a});if(!i.ok){const o=await i.text().catch(()=>"");throw new Error(`WMS GetMap failed (${i.status}): ${o.slice(0,160)}`)}const r=await i.blob(),s=await createImageBitmap(r);try{const c=_o(t,n).getContext("2d");if(!c)throw new Error("Canvas 2D context unavailable.");return c.drawImage(s,0,0,t,n),c.getImageData(0,0,t,n).data}finally{(l=s.close)==null||l.call(s)}}function Ro(e){let t=0,n=0,a=0,i=0;for(let r=0;r<e.length;r+=4){const s=e[r],l=e[r+1],o=e[r+2];e[r+3]<128||s===0&&l===0&&o===0||(t+=s/127-1,n+=l/127-1,a+=o/127-1,i+=1)}return i===0?{ndvi:null,ndwi:null,ndmi:null,sampleCount:0}:{ndvi:Number((t/i).toFixed(4)),ndwi:Number((n/i).toFixed(4)),ndmi:Number((a/i).toFixed(4)),sampleCount:i}}function Do(e){let t=0,n=0,a=0,i=Number.POSITIVE_INFINITY,r=Number.NEGATIVE_INFINITY,s=0;for(let c=0;c<e.length;c+=4){const u=e[c],d=e[c+1],f=e[c+2];if(e[c+3]<128)continue;const I=u/127-1;t+=I,n+=d/127-1,a+=f/254,I<i&&(i=I),I>r&&(r=I),s+=1}if(s===0)return{ndsi:null,ndre:null,si:null,ssi:null,ndsiMin:null,ndsiMax:null};const l=Number((t/s).toFixed(4)),o=Number((a/s).toFixed(4));return{ndsi:l,ndre:Number((n/s).toFixed(4)),si:o,ssi:Number((l+o).toFixed(4)),ndsiMin:Number(i.toFixed(4)),ndsiMax:Number(r.toFixed(4))}}async function xo(e,t,n,a,i){const r={collections:["sentinel-2-l2a"],intersects:e,datetime:`${t.slice(0,10)}T00:00:00Z/${n.slice(0,10)}T23:59:59Z`,limit:500,sortby:[{field:"datetime",direction:"asc"}]},s=await fetch(ii,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},body:JSON.stringify(r),signal:i});if(!s.ok){const u=await s.text().catch(()=>"");throw new Error(`Planetary Computer STAC search failed (${s.status}): ${u.slice(0,180)}`)}const l=await s.json(),o=Array.isArray(l.features)?l.features:[];return[...new Set(o.map(u=>{var f;const d=(f=u==null?void 0:u.properties)==null?void 0:f.datetime;return typeof d=="string"&&d.length>=10?d.slice(0,10):null}).filter(u=>!!u))].sort((u,d)=>u.localeCompare(d)).slice(0,bo)}async function To(e,t,n){if(!e.length)return[];const a=new Array(e.length);let i=0;const r=Array.from({length:Math.min(t,e.length)},async()=>{for(;i<e.length;){const s=i++;a[s]=await n(e[s])}});return await Promise.all(r),a}function vn(e){return{status:"OK",data:e.map(t=>({interval:{from:`${t.date}T00:00:00Z`,to:`${ht(t.date,1)}T00:00:00Z`},outputs:{indices:{bands:{ndvi:{stats:{mean:t.ndvi,sampleCount:t.sampleCount,noDataCount:t.ndvi==null?t.sampleCount:0}},ndwi:{stats:{mean:t.ndwi,sampleCount:t.sampleCount,noDataCount:t.ndwi==null?t.sampleCount:0}},ndmi:{stats:{mean:t.ndmi,sampleCount:t.sampleCount,noDataCount:t.ndmi==null?t.sampleCount:0}},ndsi:{stats:{mean:t.ndsi,min:t.ndsiMin??t.ndsi,max:t.ndsiMax??t.ndsi,sampleCount:t.sampleCount,noDataCount:t.ndsi==null?t.sampleCount:0}},ndre:{stats:{mean:t.ndre,sampleCount:t.sampleCount,noDataCount:t.ndre==null?t.sampleCount:0}},si:{stats:{mean:t.si,sampleCount:t.sampleCount,noDataCount:t.si==null?t.sampleCount:0}},ssi:{stats:{mean:t.ssi,sampleCount:t.sampleCount,noDataCount:t.ssi==null?t.sampleCount:0}},savi:{stats:{mean:t.savi,sampleCount:t.sampleCount,noDataCount:t.savi==null?t.sampleCount:0}},evi:{stats:{mean:null,sampleCount:t.sampleCount,noDataCount:t.sampleCount}}}}}}))}}async function xu(e,t){var $t,Ut,Gt,Kt,Yt;if(!yo())throw new Error("Sentinel Hub WMS instance is not configured for client-side statistics.");const n=e.input,a=($t=n==null?void 0:n.bounds)==null?void 0:$t.geometry;if(!a||typeof a!="object")throw new Error("Statistics request missing input.bounds.geometry.");const i=e.aggregation,r=String(((Ut=i==null?void 0:i.timeRange)==null?void 0:Ut.from)||"").slice(0,10),s=String(((Gt=i==null?void 0:i.timeRange)==null?void 0:Gt.to)||"").slice(0,10);if(!r||!s)throw new Error("Statistics request missing aggregation.timeRange.");(Yt=(Kt=n==null?void 0:n.data)==null?void 0:Kt[0])==null||Yt.dataFilter;const l=da,o=Lo(a),c=Bo(a);if(!o)throw new Error("Could not derive WMS bbox from AOI geometry.");const u=An()||gi,d=yn(),f=Q(de()),m=await xo(a,r,s,null,t);if(!m.length)return vn([]);const[I,p,g,R]=o,b=(E,Z,v)=>{let A=`${d}?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&LAYERS=${encodeURIComponent(f)}&CRS=EPSG:3857&BBOX=${I},${p},${g},${R}&WIDTH=${q}&HEIGHT=${q}&FORMAT=image/png&TRANSPARENT=true&TIME=${E}/${ht(E,1)}&MAXCC=${l}&SHOWLOGO=false&WARNINGS=false&EVALSCRIPT=${encodeURIComponent(Z)}`;return v&&c&&(A+=`&GEOMETRY=${encodeURIComponent(c)}`),Ve(A,u)},mi=(await To(m,No,async E=>{if(t!=null&&t.aborted)throw new DOMException("The operation was aborted.","AbortError");const Z=async v=>{const[A,Xt]=await Promise.all([Nn(b(E,Mo,v),q,q,t),Nn(b(E,Ao,v),q,q,t).catch(()=>null)]),me=Ro(A),fi=Xt?Do(Xt):{ndsi:null,ndre:null,si:null,ssi:null,ndsiMin:null,ndsiMax:null},Ii=me.ndvi!=null&&Number.isFinite(me.ndvi)?Number(((1+.5)*me.ndvi/(1+.5*Math.abs(me.ndvi)+1e-6)).toFixed(4)):null;return{date:E,...me,...fi,savi:Ii}};try{const v=await Z(!!c);return ba(Ca(E,{clearCount:v.sampleCount,cloudCount:0,maskedCount:0,validCount:v.sampleCount,aoiCloudCoverPct:null,aoiClearCoverPct:v.sampleCount>0?100:null})),v.sampleCount===0&&v.ndsi==null?null:v}catch(v){if(t!=null&&t.aborted)throw v;if(c)try{const A=await Z(!1);return A.sampleCount===0&&A.ndsi==null?null:A}catch(A){if(t!=null&&t.aborted)throw A;return console.warn("[wms-stats-client] scene failed",E,A),null}return console.warn("[wms-stats-client] scene failed",E,v),null}})).filter(E=>!!E).sort((E,Z)=>E.date.localeCompare(Z.date));return vn(mi)}function wo(){return{date:"2026-06-10",ndvi:.6,ndmi:.3,ndwi:.2,evi:.55,ndre:.4,savi:.5,ciRe:.12,ndsi:.1,si:.15,ssi:.25,ndii:.3}}const Po=new Set(["VRI","CCI","EPD","EHD"]);function ci(e){const t=e.trim().toUpperCase();if(!t||Pe(t))return!1;if(vt(t)||le(t)||F(t)||k(t)||Po.has(t))return!0;if(_(t)){const i=At(t);return i!=null&&ci(i)}const n=wo(),a=ui(t,n);return a!=null&&Number.isFinite(a)}function Tu(e){const t=typeof e=="number"?e:Number(e);if(!Number.isFinite(t))return String(e??"");if(Object.is(t,-0))return"0";const n=Math.abs(t);if(n===0)return"0";if(n>=1e3)return Math.round(t).toLocaleString("en-US");if(n>=100)return String(Math.round(t));if(n>=10){const i=Math.round(t*10)/10;return Number.isInteger(i)?String(i):i.toFixed(1)}const a=Math.round(t*1e3)/1e3;return String(Number(a.toFixed(3)))}function Vo(){return ti(Xr([]),ci)}function wu(){return zr(Vo())}const it=["#14b8a6","#38bdf8","#a3e635","#f472b6","#fb923c","#c084fc","#facc15","#60a5fa","#4ade80"];function h(e){return e!=null&&Number.isFinite(e)?e:null}function Fo(e,t){const n=Date.parse(`${e.slice(0,10)}T12:00:00Z`),a=Date.parse(`${t.slice(0,10)}T12:00:00Z`);return!Number.isFinite(n)||!Number.isFinite(a)?Number.POSITIVE_INFINITY:Math.abs(a-n)/864e5}function Oo(e){const t=h(e.ndvi),n=h(e.ndmi),a=h(e.ndwi),i=h(e.ndsi),r=h(e.si),s=h(e.ndre),l=h(e.evi),o=h(e.ssi)??(i!=null&&r!=null?i+r:null),c=h(e.savi)??(t!=null?ct(t):null),u=h(e.ciRe);return t==null&&n==null&&a==null&&i==null&&r==null&&s==null&&l==null&&c==null?null:{ndvi:t??NaN,ndmi:n??NaN,ndwi:a??NaN,savi:c??NaN,ci_re:u??NaN,ndsi:i??NaN,si:r??NaN,ssi:o??NaN,ndre:s??NaN,evi:l??NaN}}function ko(e,t){try{const a=new Function("ndvi","ndmi","ndwi","savi","ci_re","ndsi","si","ssi","ndre","evi","Math",`"use strict"; return (${e});`)(t.ndvi,t.ndmi,t.ndwi,t.savi,t.ci_re,t.ndsi,t.si,t.ssi,t.ndre,t.evi,Math);return typeof a=="number"&&Number.isFinite(a)?a:null}catch{return null}}function Wt(e,t){const n=e.trim().toUpperCase();if(F(n)||k(n)||_(n)||n==="PRECIP"||n==="CHIRPS"||n==="RAINFALL"||n==="PRECIPITATION")return null;if(n==="NDSI")return h(t.ndsi);if(Pe(n))return h(t.ndvi)!=null||h(t.ndmi)!=null||h(t.ndwi)!=null||h(t.evi)!=null?1:0;if(n==="SI")return h(t.si);if(n==="SSI"){const r=h(t.ssi);if(r!=null)return r;const s=h(t.ndsi),l=h(t.si);return s!=null&&l!=null?s+l:null}if(n==="NDRE")return h(t.ndre);const a=Oo(t);switch(n){case"NDVI":return h(t.ndvi);case"NDMI":return h(t.ndmi);case"NDII":return h(t.ndii)??h(t.ndmi);case"NDWI":return h(t.ndwi);case"SAVI":return(a==null?void 0:a.savi)!=null&&Number.isFinite(a.savi)?a.savi:null;case"EVI":return h(t.evi);case"ET":{const r=h(t.ndmi);let s=h(t.ndwi);if(r==null||(s==null&&(s=Math.max(-.2,Math.min(.45,r*.85))),!Number.isFinite(s)))return null;const l=h(t.ndvi);return Qr(r,s,{sceneDate:t.date,ndvi:l})}case"LST":{const r=h(t.ndvi),s=h(t.ndmi);return r==null||s==null?null:cs(r,s,{sceneDate:t.date})}case"CHAS":case"CHAS_ALERT":{const r=yi(Li(t));return Number.isFinite(r)?r:null}}if(!a||!Kr(n))return null;const i=yt(n);return i?ko(i,a):null}function ui(e,t){const n=e.trim().toUpperCase();return _(n)||F(n)||k(n)?null:Wt(n,t)}function Wo(e,t){const n=e.trim().toUpperCase();if(F(n))return t.some(i=>{const r=h(i.ndvi),s=h(i.ndmi);return r!=null&&s!=null});if(k(n))return t.some(i=>h(i.ndvi)!=null&&h(i.ndmi)!=null);const a=_(n)?At(n)??n:n;return t.some(i=>{const r=Wt(a,i);return r!=null&&Number.isFinite(r)})}function Pu(e,t){return e.length?(t.length?t:["NDVI"]).every(a=>Wo(a,e)):!1}function Vu(e,t){if(!e.length)return!1;const n=t.map(l=>l.trim().toUpperCase()).filter(Boolean),a=n.some(l=>l==="NDSI"||l==="SSI"),i=n.some(l=>l==="SI"||l==="SSI"),r=n.some(l=>l==="NDRE"||l==="CGI"||l==="CVI"||l==="CHS"||l==="CMI"||l==="HRI"||l==="CCI"||l==="EHD"||l==="DCGI"||l==="DCVI"||l==="DCHS"||l==="DCMI"||l==="DHRI"),s=n.some(l=>l==="EVI"||l==="PRI"||l==="CGI"||l==="CVI"||l==="CHS"||l==="CMI"||l==="CCI"||l==="EPD"||l==="DPRI"||l==="DCGI"||l==="DCVI"||l==="DCHS"||l==="DCMI");return!!(a&&!e.some(l=>l.ndsi!=null&&Number.isFinite(l.ndsi))||i&&!e.some(l=>l.si!=null&&Number.isFinite(l.si))||r&&!e.some(l=>l.ndre!=null&&Number.isFinite(l.ndre))||s&&!e.some(l=>l.evi!=null&&Number.isFinite(l.evi))||n.some(F)&&!e.some(l=>l.ndre!=null&&Number.isFinite(l.ndre)))}function Fu(e,t){var s;const n=new Map(t.map(l=>[l.date.slice(0,10),l])),a=[],i=[],r=[];for(const l of e){const o=l.slice(0,10),c=n.get(o),u=(s=c==null?void 0:c.zonal)==null?void 0:s.ndsi,d=c?ui("NDSI",c):null;a.push(d!=null&&Number.isFinite(d)?d:null),i.push((u==null?void 0:u.min)!=null&&Number.isFinite(u.min)?u.min:d),r.push((u==null?void 0:u.max)!=null&&Number.isFinite(u.max)?u.max:d)}return{mean:a,min:i,max:r}}function V(e,t,n,a){var r;const i=[];for(const s of t){const l=(r=e.get(s))==null?void 0:r.find(c=>c.date===n);if(!l)continue;const o=Wt(a,l);o!=null&&Number.isFinite(o)&&i.push(o)}return i.length?i.reduce((s,l)=>s+l,0)/i.length:null}function Ho(e,t,n){var i;const a=[];for(const r of t){const s=(i=e.get(r))==null?void 0:i.find(u=>u.date===n);if(!s)continue;const l=h(s.ndvi),o=h(s.ndmi);if(l==null||o==null)continue;const c=h(s.ndre)??l;a.push(Vi(l,o,c))}return a.length?a.reduce((r,s)=>r+s,0)/a.length:null}function $o(e,t,n){var i;const a=[];for(const r of t){const s=(i=e.get(r))==null?void 0:i.find(c=>c.date===n);if(!s)continue;const l=h(s.ndvi),o=h(s.ndmi);l==null||o==null||a.push(.7*l+.3*o)}return a.length?a.reduce((r,s)=>r+s,0)/a.length:null}function Ge(e){if(e.length<2)return e.length===1?1:0;const t=e.reduce((i,r)=>i+r,0)/e.length;if(Math.abs(t)<1e-6)return 0;const n=e.reduce((i,r)=>i+(r-t)**2,0)/e.length,a=Math.sqrt(Math.max(0,n));return Math.max(0,Math.min(1,1-a/Math.abs(t)))}function Uo(e,t,n){const a=n.map(o=>V(e,t,o,"NDVI")),i=a.filter(o=>o!=null&&Number.isFinite(o));if(i.length<2)return{labels:n,values:n.map(()=>NaN)};const r=Math.min(...i),l=Math.max(...i)-r;return l<1e-6?{labels:n,values:n.map((o,c)=>a[c]!=null?.5:NaN)}:{labels:n,values:a.map(o=>o==null||!Number.isFinite(o)?NaN:Number(((o-r)/l).toFixed(4)))}}function Go(e,t,n){const i=n.map(o=>V(e,t,o,"NDVI")),r=n.map(o=>V(e,t,o,"NDRE")),s=n.map(o=>V(e,t,o,"EVI")),l=[];for(let o=0;o<n.length;o++){const c=Math.max(0,o-8+1),u=i.slice(c,o+1).filter(b=>b!=null&&Number.isFinite(b)),d=r.slice(c,o+1).filter(b=>b!=null&&Number.isFinite(b)),f=s.slice(c,o+1).filter(b=>b!=null&&Number.isFinite(b));if(!u.length&&!d.length&&!f.length){l.push(NaN);continue}const m=Ge(u),I=Ge(d.length?d:u),p=Ge(f.length?f:u),g=Math.max(0,Math.min(1,u.length/8)),R=.4*m+.3*I+.2*p+.1*g;l.push(Number(R.toFixed(4)))}return{labels:n,values:l}}function Ko(e,t,n){const a=n.map(l=>V(e,t,l,"PRI")),i=n.map(l=>V(e,t,l,"NDVI"));let r=!1;const s=[];for(let l=0;l<n.length;l++){const o=a[l],c=i[l],u=l>0?i[l-1]:null,d=c!=null&&u!=null&&c>u;if(!r&&o!=null&&o>=.45&&d&&(r=!0),o==null&&c==null){s.push(NaN);continue}s.push(r?1:0)}return{labels:n,values:s}}function Yo(e,t,n){const a=n.map(l=>V(e,t,l,"HRI")),i=n.map(l=>V(e,t,l,"NDVI"));let r=!1;const s=[];for(let l=0;l<n.length;l++){const o=a[l],c=i[l],u=l>0?i[l-1]:null,d=c!=null&&u!=null&&c<u;if(!r&&o!=null&&o>=.7&&d&&(r=!0),o==null&&c==null){s.push(NaN);continue}s.push(r?1:0)}return{labels:n,values:s}}function Xo(e,t,n){const a=n.trim().toUpperCase(),i=new Set;for(const l of t)for(const o of e.get(l)??[])i.add(o.date);const r=[...i].sort(),s=[];if(F(a)){const l=r.map(o=>Ho(e,t,o));for(let o=0;o<r.length;o++){const c=l[o];if(c==null||!Number.isFinite(c)){s.push(NaN);continue}const u=[];for(let p=0;p<o;p++){const g=l[p];g==null||!Number.isFinite(g)||Fo(r[p],r[o])>Dn||u.push(g)}if(u.length<1){s.push(NaN);continue}const d=u.reduce((p,g)=>p+g,0)/u.length,f=u.length>=2?u.reduce((p,g)=>p+(g-d)**2,0)/u.length:0,m=Math.sqrt(Math.max(0,f)),I=Fi(c,d,m);s.push(Number.isFinite(I)?Number(I.toFixed(4)):NaN)}return{labels:r,values:s}}if(k(a)){let l=null;for(const o of r){const c=$o(e,t,o);if(c==null||!Number.isFinite(c)){s.push(NaN);continue}s.push(l==null?NaN:Number((c-l).toFixed(4))),l=c}return{labels:r,values:s}}if(_(a)){const l=At(a);if(!l)return{labels:r,values:r.map(()=>NaN)};let o=null;for(const c of r){const u=V(e,t,c,l);if(u==null||!Number.isFinite(u)){s.push(NaN);continue}s.push(o==null?NaN:Number((u-o).toFixed(4))),o=u}return{labels:r,values:s}}if(a==="VRI")return Uo(e,t,r);if(a==="CCI")return Go(e,t,r);if(a==="EPD")return Ko(e,t,r);if(a==="EHD")return Yo(e,t,r);for(const l of r){const o=V(e,t,l,a);s.push(o??NaN)}return{labels:r,values:s}}function Ou(e,t){const n=new Map;for(let a=0;a<e.length;a++){const i=e[a],r=t[a];if(r==null||!Number.isFinite(r))continue;const s=Number(i.slice(0,4));if(!Number.isFinite(s))continue;const l=i.slice(5);n.has(s)||n.set(s,{labels:[],values:[]});const o=n.get(s);o.labels.push(l),o.values.push(r)}return[...n.entries()].sort(([a],[i])=>a-i).map(([a,i])=>({year:a,...i}))}function ku(){return it}function Wu(e){return it[e%it.length]}function zo(e){const t=new Date(`${e.slice(0,10)}T12:00:00Z`);if(Number.isNaN(t.getTime()))return e.slice(0,10);const n=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-n);const a=t.getUTCFullYear(),i=new Date(Date.UTC(a,0,1)),r=Math.ceil(((t.getTime()-i.getTime())/864e5+1)/7);return`${a}-W${String(r).padStart(2,"0")}`}function di(e,t){const n=e.trim().slice(0,10);return n?t==="day"?n:t==="month"?n.slice(0,7):t==="year"?n.slice(0,4):zo(n):""}function jo(e,t){return t==="day"||t==="month"||t==="year"?e:e.replace("-W"," W")}function Zo(e,t,n){const a=e.trim().slice(0,10),i=t.trim().slice(0,10);if(!a||!i||a>i)return[];if(n==="year"){const l=[];for(let o=Number(a.slice(0,4));o<=Number(i.slice(0,4));o+=1)l.push(String(o));return l}if(n==="month"){const l=[];let o=Number(a.slice(0,4)),c=Number(a.slice(5,7));const u=Number(i.slice(0,4)),d=Number(i.slice(5,7));for(;o<u||o===u&&c<=d;)l.push(`${o}-${String(c).padStart(2,"0")}`),c+=1,c>12&&(c=1,o+=1);return l}if(n==="week"){const l=new Set,o=[];let c=a;for(;c<=i;){const u=di(c,"week");u&&!l.has(u)&&(l.add(u),o.push(u));const d=new Date(`${c}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+1),c=d.toISOString().slice(0,10)}return o}const r=[];let s=a;for(;s<=i;){r.push(s);const l=new Date(`${s}T12:00:00Z`);l.setUTCDate(l.getUTCDate()+1),s=l.toISOString().slice(0,10)}return r}function Hu(e){const t=Zo(e.fromDate,e.toDate,e.aggregation);if(e.aggregation!=="day")return t;const n=new Set([...e.observedPeriodKeys??[]].map(a=>a.trim().slice(0,10)).filter(Boolean));return n.size?t.filter(a=>n.has(a)):t}function $u(e,t,n){if(!e.length||!t.length)return{labels:[],displayLabels:[],series:[],periodAnchorDate:new Map};if(n==="day")return{labels:[...e],displayLabels:[...e],series:t.map(l=>({layerId:l.layerId,values:[...l.values],label:l.label,color:l.color,valueUnit:l.valueUnit})),periodAnchorDate:new Map(e.map(l=>[l,l]))};const a=new Map,i=[];for(let l=0;l<e.length;l+=1){const o=e[l],c=di(o,n);if(!c)continue;a.has(c)||(a.set(c,{dates:[],layerValues:new Map}),i.push(c));const u=a.get(c);u.dates.push(o);for(const d of t){const f=d.values[l];if(f==null||!Number.isFinite(f))continue;const m=u.layerValues.get(d.layerId)??[];m.push(f),u.layerValues.set(d.layerId,m)}}i.sort((l,o)=>{const c=a.get(l).dates.sort()[0]??l,u=a.get(o).dates.sort()[0]??o;return c.localeCompare(u)});const r=new Map;for(const l of i){const o=[...a.get(l).dates].sort();r.set(l,o[o.length-1]??l)}const s=t.map(l=>({layerId:l.layerId,label:l.label,color:l.color,valueUnit:l.valueUnit,values:i.map(o=>{const c=a.get(o).layerValues.get(l.layerId)??[];return vt(l.layerId)?c.length?c.reduce((u,d)=>u+d,0):NaN:Ht(c)??NaN})}));return{labels:i,displayLabels:i.map(l=>jo(l,n)),series:s,periodAnchorDate:r}}function Uu(e,t,n){const a=[...new Set(n.map(o=>o.trim().toUpperCase()).filter(Boolean))];if(!a.length)return{labels:[],series:[]};const i=a.map(o=>({layerId:o,...Xo(e,t,o)})),r=new Set;for(const o of i)for(const c of o.labels)r.add(c);const s=[...r].sort(),l=i.map(o=>{const c=new Map(o.labels.map((u,d)=>[u,o.values[d]]));return{layerId:o.layerId,values:s.map(u=>{const d=c.get(u);return d!=null&&Number.isFinite(d)?d:NaN})}});return{labels:s,series:l}}function qo(e,t){if(!e.length||!t.length)return{labels:[],series:[]};const n=[];for(let a=0;a<e.length;a++)t.some(r=>{const s=r.values[a];return s!=null&&Number.isFinite(s)})&&n.push(a);return n.length?{labels:n.map(a=>e[a]),series:t.map(a=>({layerId:a.layerId,values:n.map(i=>a.values[i]),label:a.label,color:a.color,valueUnit:a.valueUnit}))}:{labels:[],series:t.map(a=>({layerId:a.layerId,values:[],label:a.label,color:a.color,valueUnit:a.valueUnit}))}}function Gu(e,t){var a;const n=qo(e,[{layerId:"L",values:t}]);return{labels:n.labels,values:((a=n.series[0])==null?void 0:a.values)??[]}}function Ku(e,t,n,a){if(!e.length||!t.length)return{labels:[],series:[]};const i=n.trim().slice(0,10),r=a.trim().slice(0,10);if(!i||!r||i>r)return{labels:[],series:t.map(l=>({layerId:l.layerId,values:[],label:l.label,color:l.color,valueUnit:l.valueUnit}))};const s=[];for(let l=0;l<e.length;l++){const o=String(e[l]??"").slice(0,10);o>=i&&o<=r&&s.push(l)}return s.length?{labels:s.map(l=>e[l]),series:t.map(l=>({layerId:l.layerId,values:s.map(o=>l.values[o]??null),label:l.label,color:l.color,valueUnit:l.valueUnit}))}:{labels:[],series:t.map(l=>({layerId:l.layerId,values:[],label:l.label,color:l.color,valueUnit:l.valueUnit}))}}function Yu(e,t=90){const n=e.slice(0,10),a=new Date(`${n}T12:00:00Z`);return a.setUTCDate(a.getUTCDate()-t),{from:a.toISOString().slice(0,10),to:n}}function Jo(e){return e.filter(t=>t!=null&&Number.isFinite(t))}function Ht(e){const t=Jo(e);return t.length?t.reduce((n,a)=>n+a,0)/t.length:null}function Qo(e,t){const n=new Map;for(let i=0;i<e.length;i++){const r=t[i];if(r==null||!Number.isFinite(r))continue;const s=String(e[i]??"").slice(0,7);if(!s)continue;const l=n.get(s)??[];l.push(r),n.set(s,l)}const a=[...n.entries()].sort((i,r)=>i[0].localeCompare(r[0]));return{labels:a.map(([i])=>i),values:a.map(([,i])=>Ht(i)??0)}}function Xu(e,t){return t.length?t.length===1?Qo(e,t[0].values):{labels:t.map(n=>n.label||n.layerId),values:t.map(n=>Ht(n.values)??0)}:{labels:[],values:[]}}function zu(e,t){const n=[];for(let a=0;a<e.length;a++){const i=t[a];if(i==null||!Number.isFinite(i))continue;const r=Date.parse(`${e[a]}T12:00:00Z`);Number.isFinite(r)&&n.push({x:r,y:i})}return n}const En=.015;function ec(e,t,n){const a=[];for(let i=0;i<e.length;i++){const r=t[i],s=n[i];r==null||s==null||!Number.isFinite(r)||!Number.isFinite(s)||a.push({x:r,y:s,date:e[i]})}return a}function tc(e){const t=e.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));if(t.length<2)return null;const n=t.length,a=t.reduce((p,g)=>p+g.x,0),i=t.reduce((p,g)=>p+g.y,0),r=t.reduce((p,g)=>p+g.x*g.y,0),s=t.reduce((p,g)=>p+g.x*g.x,0),l=t.reduce((p,g)=>p+g.y*g.y,0),o=n*s-a*a;if(Math.abs(o)<1e-12)return null;const c=(n*r-a*i)/o,u=(i-c*a)/n,d=l-i*i/n,f=t.reduce((p,g)=>{const R=c*g.x+u;return p+(g.y-R)**2},0),m=d>1e-12?Math.max(0,Math.min(1,1-f/d)):0,I=c>=0?Math.sqrt(m):-Math.sqrt(m);return{slope:c,intercept:u,r:I,r2:m,n}}function nc(e,t){if(!t.length)return[];const n=t.map(c=>c.x),a=Math.min(...n),i=Math.max(...n),r=i-a,s=r>0?r*.06:Math.max(Math.abs(a)*.05,.02),l=a-s,o=i+s;return[{x:l,y:e.slope*l+e.intercept},{x:o,y:e.slope*o+e.intercept}]}function ac(e){const t=Math.abs(e.r);if(t<.15)return{strength:"none",direction:"none",label:"No clear relationship"};const n=t>=.7?"strong":t>=.4?"moderate":"weak",a=e.r>=En?"positive":e.r<=-En?"negative":"none";return{strength:n,direction:a,label:`${n==="strong"?"Strong":n==="moderate"?"Moderate":"Weak"} ${a==="positive"?"Positive":a==="negative"?"Negative":"Neutral"} Relationship`}}function Mn(e,t){return`${e.trim().toUpperCase()}|${t.trim().toUpperCase()}`}function ic(e,t,n,a){var f,m;const i=Mn(e,t),r=Mn(t,e),s=Math.round(a.r2*100),{strength:l,direction:o}=n,c={"NDVI|NDMI":{positive:l==="strong"?"Canopy vigor and canopy moisture index move together — uniform crop health with limited decoupled water stress across the field.":"Vegetation greenness and moisture index generally rise together — biomass gains align with canopy water status.",negative:"Biomass increases while canopy moisture falls — early water-stress decoupling; review irrigation scheduling before yield loss."},"NDVI|NDWI":{positive:"Surface water / canopy water signal tracks vegetation density — healthy transpiration balance supports productivity.",negative:"Higher NDVI with lower NDWI suggests moisture deficit under active canopy — prioritize targeted irrigation or scouting."},"NDVI|LST":{negative:"Canopy cooling: greener vegetation coincides with lower land-surface temperature — expected when cover shades and transpires.",positive:"Vegetation and surface heat rise together — may indicate sparse cover, senescent canopy, or soil-dominated pixels."},"NDVI|CHAS":{positive:"Integrated crop health score rises with NDVI — Sentinel layers agree on improving agronomic condition.",negative:"Vegetation index improves while composite health score weakens — check nutrient, pest, or moisture constraints not captured by NDVI alone."},"NDMI|NDWI":{positive:"Canopy moisture and water index co-vary — consistent hydrological status across the parcel.",negative:"Moisture indices diverge — possible canopy stress, drainage heterogeneity, or mixed crop stages within the AOI."}},u=((f=c[i])==null?void 0:f[o==="none"?"positive":o])??((m=c[r])==null?void 0:m[o==="none"?"positive":o]);if(u)return u;if(l==="none")return`${t} does not explain a stable share of ${e} variation in this window — treat layers independently for management decisions.`;const d=o==="negative"?"inverse coupling":o==="positive"?"co-movement":"mixed coupling";return`${t} explains ~${s}% of ${e} variance (R²=${a.r2.toFixed(3)}) — ${d} may drive productivity swings in this period.`}function rc(e,t,n,a){const i=Math.round(n.r2*100);return`GIS · r=${n.r.toFixed(3)} · R²=${n.r2.toFixed(3)} (${i}%) · n=${n.n} scenes · slope ${n.slope.toFixed(4)} Δ${t}/Δ${e} · ${a.label}`}function sc(e,t,n,a){return`Agro · ${ic(e,t,a,n)}`}function ju(e,t,n,a,i){const r=ec(e,n,i),s=tc(r);if(!s)return null;const l=ac(s);return{xLayerId:t,yLayerId:a,points:r,regression:s,relationship:l,gisInsight:rc(t,a,s,l),agroInsight:sc(t,a,s,l),regressionLine:nc(s,r)}}export{gs as $,ku as A,vt as B,$r as C,ye as D,bu as E,Hl as F,Mu as G,di as H,jo as I,Wl as J,hi as K,Lc as L,Rl as M,ie as N,bc as O,hc as P,yi as Q,lu as R,Oa as S,Ru as T,ct as U,rl as V,ia as W,_ as X,ht as Y,yo as Z,xu as _,Rc as a,Jc as a$,B as a0,se as a1,ee as a2,Qt as a3,Ne as a4,as as a5,Yc as a6,jr as a7,j as a8,yt as a9,dc as aA,fc as aB,mc as aC,F as aD,Sc as aE,k as aF,pc as aG,$c as aH,iu as aI,T as aJ,eu as aK,y as aL,As as aM,ys as aN,L as aO,Ls as aP,Bs as aQ,jc as aR,ls as aS,ss as aT,je as aU,Gc as aV,Zr as aW,ze as aX,w as aY,au as aZ,D as a_,Zc as aa,qc as ab,nu as ac,Qc as ad,Xc as ae,zc as af,xa as ag,_u as ah,uc as ai,cs as aj,ui as ak,kc as al,Cr as am,Bc as an,Fn as ao,Ct as ap,za as aq,Xi as ar,Mt as as,kn as at,On as au,Tc as av,an as aw,tn as ax,wc as ay,nn as az,bt as b,Cc as b$,Ea as b0,Es as b1,ru as b2,su as b3,tu as b4,ws as b5,xs as b6,Ds as b7,Rs as b8,Ts as b9,Le as bA,Kc as bB,es as bC,sa as bD,ns as bE,Ku as bF,$u as bG,Fu as bH,Oc as bI,Wc as bJ,Fc as bK,Na as bL,Nl as bM,_e as bN,Cu as bO,vu as bP,gc as bQ,_i as bR,Ri as bS,Ic as bT,ou as bU,vs as bV,Rt as bW,Aa as bX,sr as bY,Ec as bZ,vc as b_,Hc as ba,da as bb,ha as bc,Ks as bd,Uc as be,Pc as bf,ql as bg,Pl as bh,Dl as bi,vl as bj,Ja as bk,Y as bl,Fl as bm,Vl as bn,kl as bo,Xr as bp,pe as bq,Un as br,xt as bs,fu as bt,El as bu,Vc as bv,Vu as bw,Pu as bx,Hu as by,Tu as bz,cu as c,Mc as c0,Ha as c1,mu as c2,Au as c3,Eu as c4,Ol as c5,pu as c6,hu as c7,Lu as c8,zr as c9,_l as ca,Nu as cb,oo as cc,Bu as cd,Iu as ce,Ta as cf,yc as cg,Ac as ch,Du as ci,Vt as cj,Bl as ck,jl as cl,Ya as cm,Nc as cn,Ot as co,gu as cp,Su as cq,yu as cr,_c as d,uu as e,Q as f,de as g,Za as h,le as i,du as j,Ve as k,Dc as l,Ml as m,Yu as n,Vo as o,wu as p,Xo as q,xc as r,Gu as s,Uu as t,qo as u,Ou as v,Xu as w,Wu as x,ju as y,zu as z};
