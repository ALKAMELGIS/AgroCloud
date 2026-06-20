import{r as g}from"./vendor-react-1RAKTFQ4.js";import{Y as f,Z as d}from"./index-B65Rbo_o.js";import{g as w}from"./geoExplorerGemini-Dg-J9xfJ.js";function x(){return g.useSyncExternalStore(f,d,d)}const A=`You are AgriCloud AI Agro-Chat — a professional assistant for agriculture, GIS-backed farm data, and clear explanations.

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
- **Reply language:** Follow the "UI locale — reply language" line appended immediately after this system block (English or Arabic per user app settings).`;function b(s,r){const e=s.map(t=>({role:t.role==="assistant"?"model":"user",parts:[{text:t.text}]}));return e.push({role:"user",parts:[{text:r}]}),e}async function E(s){const{apiKey:r,systemInstruction:e,turns:t,userMessage:n}=s;return w({apiKey:r,systemInstruction:e,contents:b(t,n)})}const I="deepseek-chat";async function v(s){var u,c,h,p,y;const{apiKey:r,system:e,turns:t,userMessage:n}=s,i=[{role:"system",content:e}];for(const m of t)i.push({role:m.role==="user"?"user":"assistant",content:m.text});i.push({role:"user",content:n});const a=await fetch("https://api.deepseek.com/v1/chat/completions",{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${r}`},body:JSON.stringify({model:I,messages:i,max_tokens:4096})}),o=await a.json().catch(()=>({}));if(!a.ok)throw new Error(((u=o==null?void 0:o.error)==null?void 0:u.message)||a.statusText||`HTTP ${a.status}`);const l=(y=(p=(h=(c=o.choices)==null?void 0:c[0])==null?void 0:h.message)==null?void 0:p.content)==null?void 0:y.trim();if(!l)throw new Error("Empty DeepSeek response");return l}export{A,v as a,E as b,x as u};
