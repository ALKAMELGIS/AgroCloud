import{j as a}from"./vendor-charts-CB1ZGkUA.js";import{r as u}from"./vendor-react-iv3eydZB.js";import{C as b,a as C}from"./CardContent-BYhEugaW.js";import{P as M,Q as E,T as U,V as $,X as F,Y as P,$ as B,a2 as I,ai as A,aj as R,a5 as c,a6 as v,ak as N,a7 as O}from"./index-BNOrK7bv.js";import{S as T,u as W,P as X}from"./useAuthorization-BtbtZeui.js";import{T as S,M as D}from"./TextField-B14pYUCH.js";import{B as K}from"./Button-GoXIByVG.js";import"./vendor-pdf-DpbEvOPt.js";/* empty css                     */import"./isHostComponent-DKiidJGN.js";function L(t){return String(t).match(/[\d.\-+]*\s*(.*)/)[1]||""}function V(t){return parseFloat(t)}function Q(t){return M("MuiSkeleton",t)}E("MuiSkeleton",["root","text","rectangular","rounded","circular","pulse","wave","withChildren","fitContent","heightAuto"]);const q=t=>{const{classes:n,variant:o,animation:e,hasChildren:s,width:l,height:d}=t;return F({root:["root",o,e,s&&"withChildren",s&&!l&&"fitContent",s&&!d&&"heightAuto"]},Q,n)},w=R`
  0% {
    opacity: 1;
  }

  50% {
    opacity: 0.4;
  }

  100% {
    opacity: 1;
  }
`,j=R`
  0% {
    transform: translateX(-100%);
  }

  50% {
    /* +0.5s of delay between each loop */
    transform: translateX(100%);
  }

  100% {
    transform: translateX(100%);
  }
`,z=typeof w!="string"?A`
        animation: ${w} 2s ease-in-out 0.5s infinite;
      `:null,G=typeof j!="string"?A`
        &::after {
          animation: ${j} 2s linear 0.5s infinite;
        }
      `:null,H=P("span",{name:"MuiSkeleton",slot:"Root",overridesResolver:(t,n)=>{const{ownerState:o}=t;return[n.root,n[o.variant],o.animation!==!1&&n[o.animation],o.hasChildren&&n.withChildren,o.hasChildren&&!o.width&&n.fitContent,o.hasChildren&&!o.height&&n.heightAuto]}})(B(({theme:t})=>{const n=L(t.shape.borderRadius)||"px",o=V(t.shape.borderRadius);return{display:"block",backgroundColor:t.vars?t.vars.palette.Skeleton.bg:I(t.palette.text.primary,t.palette.mode==="light"?.11:.13),height:"1.2em",variants:[{props:{variant:"text"},style:{marginTop:0,marginBottom:0,height:"auto",transformOrigin:"0 55%",transform:"scale(1, 0.60)",borderRadius:`${o}${n}/${Math.round(o/.6*10)/10}${n}`,"&:empty:before":{content:'"\\00a0"'}}},{props:{variant:"circular"},style:{borderRadius:"50%"}},{props:{variant:"rounded"},style:{borderRadius:(t.vars||t).shape.borderRadius}},{props:({ownerState:e})=>e.hasChildren,style:{"& > *":{visibility:"hidden"}}},{props:({ownerState:e})=>e.hasChildren&&!e.width,style:{maxWidth:"fit-content"}},{props:({ownerState:e})=>e.hasChildren&&!e.height,style:{height:"auto"}},{props:{animation:"pulse"},style:z||{animation:`${w} 2s ease-in-out 0.5s infinite`}},{props:{animation:"wave"},style:{position:"relative",overflow:"hidden",WebkitMaskImage:"-webkit-radial-gradient(white, black)","&::after":{background:`linear-gradient(
                90deg,
                transparent,
                ${(t.vars||t).palette.action.hover},
                transparent
              )`,content:'""',position:"absolute",transform:"translateX(-100%)",bottom:0,left:0,right:0,top:0}}},{props:{animation:"wave"},style:G||{"&::after":{animation:`${j} 2s linear 0.5s infinite`}}}]}})),k=u.forwardRef(function(n,o){const e=U({props:n,name:"MuiSkeleton"}),{animation:s="pulse",className:l,component:d="span",height:r,style:y,variant:m="text",width:f,...p}=e,h={...e,animation:s,component:d,variant:m,hasChildren:!!p.children},x=q(h);return a.jsx(H,{as:d,ref:o,className:$(x.root,l),ownerState:h,...p,style:{width:f,height:r,...y}})});function g({title:t,value:n,unit:o,subtitle:e,icon:s,trend:l,loading:d,error:r}){return d?a.jsx(b,{variant:"outlined",children:a.jsxs(C,{children:[a.jsx(k,{width:"60%"}),a.jsx(k,{width:"40%",height:36,sx:{mt:1}})]})}):a.jsx(b,{variant:"outlined",sx:{height:"100%"},children:a.jsxs(C,{children:[a.jsx(c,{variant:"overline",color:"text.secondary",display:"block",gutterBottom:!0,children:t}),a.jsxs(T,{direction:"row",alignItems:"center",justifyContent:"center",spacing:1.5,sx:{py:.5},children:[s?a.jsx(v,{sx:{color:"primary.main",display:"flex"},children:s}):null,a.jsxs(c,{variant:"h4",component:"p",fontWeight:700,children:[r?"—":n,o&&!r?a.jsx(c,{component:"span",variant:"body2",color:"text.secondary",sx:{ml:.5},children:o}):null]})]}),l?a.jsx(c,{variant:"caption",color:"success.main",display:"block",textAlign:"center",children:l}):null,e?a.jsx(c,{variant:"caption",color:"text.secondary",display:"block",textAlign:"center",sx:{mt:.5},children:e}):null,r?a.jsx(c,{variant:"caption",color:"error",display:"block",textAlign:"center",children:r}):null]})})}async function J(){const t=await fetch("/api/v1/manpower",{credentials:"include"}),n=await t.json();if(!t.ok)throw new Error("Failed to load manpower");return n}async function Y(t){const n=await fetch("/api/v1/manpower/allocate",{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)});if(!n.ok){const o=await n.json().catch(()=>({}));throw new Error(o.error||"Allocate failed")}}function lt(){const{can:t,identityAvailable:n}=W(),{showSnack:o}=N(),[e,s]=u.useState(null),[l,d]=u.useState("STAFF"),[r,y]=u.useState(10),[m,f]=u.useState(null),[p,h]=u.useState(!0),x=()=>{h(!0),J().then(s).catch(i=>f(i instanceof Error?i.message:"Load failed")).finally(()=>h(!1))};return u.useEffect(()=>{n&&t("manpower.view")&&x()},[n,t]),n?t("manpower.view")?a.jsxs(v,{sx:{maxWidth:1200,mx:"auto"},children:[a.jsx(X,{title:"Manpower"}),m?a.jsx(O,{severity:"error",sx:{mb:2},children:m}):null,a.jsxs(v,{sx:{display:"grid",gridTemplateColumns:{xs:"1fr 1fr",sm:"repeat(4, 1fr)"},gap:2,mb:3},children:[a.jsx(g,{title:"Total",value:(e==null?void 0:e.total)??"—",loading:p&&!e}),a.jsx(g,{title:"Used",value:(e==null?void 0:e.used)??"—",loading:p&&!e}),a.jsx(g,{title:"Reserved",value:(e==null?void 0:e.reserved)??"—",loading:p&&!e}),a.jsx(g,{title:"Available",value:(e==null?void 0:e.available)??"—",loading:p&&!e})]}),t("manpower.allocate")?a.jsxs(v,{component:"section",children:[a.jsx(c,{variant:"h6",gutterBottom:!0,children:"Set allocation"}),a.jsxs(T,{direction:{xs:"column",sm:"row"},spacing:2,alignItems:{sm:"flex-end"},children:[a.jsx(S,{select:!0,label:"Role",value:l,onChange:i=>d(i.target.value),sx:{minWidth:160},children:["STAFF","SUPERVISOR","MANAGER","DIRECTOR"].map(i=>a.jsx(D,{value:i,children:i},i))}),a.jsx(S,{type:"number",label:"Total seats",inputProps:{min:0},value:r,onChange:i=>y(Number(i.target.value))}),a.jsx(K,{variant:"contained",onClick:()=>Y({roleCode:l,total:r,reason:"admin UI"}).then(()=>{o("success","Allocation saved"),x()}).catch(i=>f(i instanceof Error?i.message:"Failed")),children:"Save allocation"})]})]}):null]}):a.jsx(c,{children:"Forbidden."}):a.jsx(c,{children:"Manpower requires PostgreSQL identity."})}export{lt as default};
