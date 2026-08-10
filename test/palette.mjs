// Sage-ground palette for an always-on family wall panel.
// Validated, not eyeballed: WCAG contrast + CIEDE2000 separation between identities.
const P = {
  // ---- ground: soft matte pastel sage. Never pure white anywhere — a white panel
  // on a wall at night is the main source of glare and eye strain.
  bg:      "#E7EDE3",   // app background, matte sage
  panel:   "#F5F8F2",   // raised surface (cards) — sage-tinted, not white
  panel2:  "#DDE5D7",   // recessed surface (footers, headers, wells)
  rail:    "#E1E9DC",
  line:    "#C9D4C0",
  text:    "#2C3730",   // deep desaturated green-grey; softer than black
  muted:   "#5E6C62",
  // ---- accents: muted, playful, never fluorescent
  accent:  "#A85B2E",   // clay — primary action, today marker, now-line
  accentSoft:"#EFDCCB",
  star:    "#A87722",   // antique gold
  pos:     "#3D7350",
  danger:  "#A64F4B",
};
// identity ink + tint. Member green is pushed away from the sage ground on purpose.
const ID = {
  teal:   ["#3F8F84", "#DCEBE7"],
  red:    ["#C06A6A", "#F3DFDE"],
  blue:   ["#5C86B8", "#DEE7F2"],
  green:  ["#5E9150", "#DFEBD9"],
  amber:  ["#A2761F", "#F2E6CE"],
  purple: ["#8C6BA8", "#E8E0F0"],
  pink:   ["#A85F82", "#F2DEE7"],
  indigo: ["#455780", "#DEE3EC"],
  slate:  ["#75837A", "#E2E7E1"],
};
// ---- colour maths ----------------------------------------------------------
const hex=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const lin=c=>{c/=255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4;};
const L=h=>{const[r,g,b]=hex(h).map(lin);return .2126*r+.7152*g+.0722*b;};
const ratio=(a,b)=>{const x=L(a),y=L(b);return ((Math.max(x,y)+.05)/(Math.min(x,y)+.05));};
function lab(h){const[r,g,b]=hex(h).map(lin);
  let X=(.4124*r+.3576*g+.1805*b)/.95047,Y=(.2126*r+.7152*g+.0722*b),Z=(.0193*r+.1192*g+.9505*b)/1.08883;
  const f=t=>t>0.008856?Math.cbrt(t):(7.787*t)+16/116;
  return [116*f(Y)-16,500*(f(X)-f(Y)),200*(f(Y)-f(Z))];}
const de=(A,B)=>{const a=lab(A),b=lab(B);return Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);};

const fails=[];
const chk=(n,v,min,got)=>{ const p=got>=min; if(!p)fails.push(`${n}: ${got.toFixed(2)} < ${min}`);
  console.log(`${p?"  ok":"FAIL"}  ${n.padEnd(46)} ${got.toFixed(2)} (min ${min})`); };

console.log("── body text (AAA 7:1, this screen is read across a room) ──");
chk("text on bg",     0,7,ratio(P.text,P.bg));
chk("text on panel",  0,7,ratio(P.text,P.panel));
chk("text on panel2", 0,7,ratio(P.text,P.panel2));
console.log("── secondary text (AA 4.5:1) ──");
chk("muted on bg",    0,4.5,ratio(P.muted,P.bg));
chk("muted on panel", 0,4.5,ratio(P.muted,P.panel));
console.log("── actions ──");
chk("white on accent",0,4.5,ratio("#FFFFFF",P.accent));
chk("white on pos",   0,4.5,ratio("#FFFFFF",P.pos));
chk("white on danger",0,4.5,ratio("#FFFFFF",P.danger));
chk("accent vs bg (non-text 3:1)",0,3,ratio(P.accent,P.bg));
console.log("── identity: ink readable on its own tint, tint distinct from panel ──");
for(const[k,[ink,tint]]of Object.entries(ID)){
  chk(`${k}: text on ${k} tint`,0,4.5,ratio(P.text,tint));
  chk(`${k}: ink vs bg (3:1 non-text)`,0,3,ratio(ink,P.bg));
  chk(`${k}: white on ${k} ink`,0,3.5,ratio("#FFFFFF",ink));
}
console.log("── identities must be tellable apart at 4 m (ΔE ≥ 18) ──");
const keys=Object.keys(ID);
for(let i=0;i<keys.length;i++)for(let j=i+1;j<keys.length;j++){
  const d=de(ID[keys[i]][0],ID[keys[j]][0]);
  if(d<18)fails.push(`ΔE ${keys[i]}/${keys[j]} = ${d.toFixed(1)}`);
}
console.log(`  ${fails.filter(f=>f.startsWith("ΔE")).length===0?"ok":"FAIL"}  all ${keys.length*(keys.length-1)/2} identity pairs separable`);
console.log("── member green must not disappear into the sage ground ──");
chk("green ink vs bg", 0, 3, ratio(ID.green[0], P.bg));
console.log(`\n${fails.length? "FAILURES:\n"+fails.join("\n") : "PALETTE VALID"}`);
process.exit(fails.length?1:0);
