function o(r){let e=r.trim();return e=e.replace(/\{zoom\}/gi,"{z}"),e=e.replace(/\{[-]?y\}/gi,t=>t.toLowerCase().includes("-")?"{-y}":"{y}"),e}export{o as normalizeXyzTemplate};
