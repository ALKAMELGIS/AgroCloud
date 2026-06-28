import{r as f}from"./vendor-react-1RAKTFQ4.js";import{a0 as g,a1 as d}from"./index-Ce6D0da-.js";import{g as w}from"./geoExplorerGemini-koBXBKo1.js";function E(){return f.useSyncExternalStore(g,d,d)}const G=`You are AgriCloud AI Agro-Chat — a professional assistant for agriculture, GIS-backed farm data, and clear explanations.

A block titled "GIS Content" is appended below. It summarizes layers saved from GIS Map in this browser (names, fields, sample attributes, feature counts). Treat it as the authoritative source for anything that must match the user's actual stored layers.

## How to combine GIS Content and general knowledge (every reply)

1) **GIS-first (site / layer–specific)**  
If the question is about the user's layers, fields, attribute values, patterns in their data, or anything that could be answered from the GIS Content snapshot — **consult the GIS block first**. Quote layer names and field names when you rely on it.  
If the answer is **not** in the GIS block (missing layer, missing field, or no values), say so explicitly, then you may use step 2 for the rest of the question only where appropriate.

2) **General AI (not from their files)**  
For questions that are **clearly general** and do not require reading their layer rows — e.g. typical weather or climate for a country or region when they are not asking you to read a weather **layer** they saved, definitions (what is NDVI), generic agronomy, world geography — you **may** use your general knowledge.  
**Label** those parts so the user can tell the source, e.g. a short line: "General:" / "من المعرفة العامة:" before general content.

3) **Hybrid questions**  
If one part needs GIS (their fields, their site) and another part is general — answer the GIS part strictly from the snapshot; answer the general part with a clear label, and keep the two visually separated (bullets or short sections).

## Accuracy rules  
- Never invent attribute values, statistics, or coordinates that are not implied by the GIS Content text.  
- Do not imply that general-knowledge text was extracted from their GIS files.  
- Prefer concise structure: short headings, bullets, brief paragraphs.  
- **Reply language:** Follow the "UI locale — reply language" line appended immediately after this system block (English or Arabic per user app settings).`;function b(o,n){const e=o.map(t=>({role:t.role==="assistant"?"model":"user",parts:[{text:t.text}]}));return e.push({role:"user",parts:[{text:n}]}),e}async function C(o){const{apiKey:n,systemInstruction:e,turns:t,userMessage:c}=o;return w({apiKey:n,systemInstruction:e,contents:b(t,c)})}const S="deepseek-chat";async function T(o){var r,i,u,a,m;const{apiKey:n,system:e,turns:t,userMessage:c}=o,h=[{role:"system",content:e}];for(const y of t)h.push({role:y.role==="user"?"user":"assistant",content:y.text});h.push({role:"user",content:c});const s=await fetch("https://api.deepseek.com/v1/chat/completions",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${n}`},body:JSON.stringify({model:S,messages:h,max_tokens:4096})}),l=await s.json().catch(()=>({}));if(!s.ok)throw new Error(((r=l==null?void 0:l.error)==null?void 0:r.message)||s.statusText||`HTTP ${s.status}`);const p=(m=(a=(u=(i=l.choices)==null?void 0:i[0])==null?void 0:u.message)==null?void 0:a.content)==null?void 0:m.trim();if(!p)throw new Error("Empty DeepSeek response");return p}const I="/api/ollama/chat";async function v(o){const{baseUrl:n,model:e,system:t,turns:c,userMessage:h}=o,s=[{role:"system",content:t}];for(const a of c)s.push({role:a.role==="user"?"user":"assistant",content:a.text});s.push({role:"user",content:h});const l=(n||"http://localhost:11434").trim().replace(/\/+$/,""),p=(e||"llama3.1").trim();let r;try{r=await fetch(I,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({baseUrl:l,model:p,messages:s})})}catch(a){throw new Error(`Could not reach the app server to proxy Ollama. ${a instanceof Error?a.message:""}`.trim())}const i=await r.json().catch(()=>({}));if(!r.ok)throw new Error((i==null?void 0:i.error)||r.statusText||`HTTP ${r.status}`);const u=(i.reply||"").trim();if(!u)throw new Error("Empty Ollama response");return u}export{G as A,T as a,v as b,C as c,E as u};
