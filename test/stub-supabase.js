// In-memory Supabase stand-in: a chainable query builder over fixture tables.
const iso = (d) => new Date(d).toISOString();
const today = new Date(); today.setHours(0,0,0,0);
const dk = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const shift = (n) => { const d = new Date(today); d.setDate(d.getDate()+n); return d; };

export const DB = {
  families: [{ id:"fam1", name:"Badawy Family", tz:"America/Los_Angeles", auth_user_id:"u1" }],
  family_members: [
    { id:"m-dad",  family_id:"fam1", name:"Daddy 🥸", color:"teal",  avatar_url:null, is_child:false, star_balance:0,  sort_order:1 },
    { id:"m-suzy", family_id:"fam1", name:"Suzy 👩",  color:"red",   avatar_url:null, is_child:false, star_balance:0,  sort_order:2 },
    { id:"m-nono", family_id:"fam1", name:"Nono ⛹️",  color:"blue",  avatar_url:null, is_child:true,  star_balance:42, sort_order:3 },
    { id:"m-doma", family_id:"fam1", name:"Doma ⛹️",  color:"green", avatar_url:null, is_child:true,  star_balance:18, sort_order:4 },
  ],
  tasks: [
    { id:"t-bed",   family_id:"fam1", assigned_to:"m-doma", title:"clean up bed", star_reward:5, due_date:dk(shift(-3)), due_time:"08:00", kind:"chore", rrule:"FREQ=DAILY", exdates:[], is_active:true, created_at:iso(shift(-9)) },
    { id:"t-teeth", family_id:"fam1", assigned_to:"m-doma", title:"brush teeth",  star_reward:5, due_date:dk(shift(-3)), due_time:"07:30", kind:"chore", rrule:"FREQ=DAILY", exdates:[], is_active:true, created_at:iso(shift(-9)) },
    { id:"t-hw",    family_id:"fam1", assigned_to:"m-nono", title:"homework",     star_reward:10, due_date:dk(today), due_time:"16:00", kind:"chore", rrule:null, exdates:[], is_active:true, created_at:iso(shift(-1)) },
    { id:"t-toys",  family_id:"fam1", assigned_to:"m-nono", title:"tidy toys",    star_reward:5, due_date:dk(today), due_time:"19:00", kind:"chore", rrule:null, exdates:[], is_active:true, created_at:iso(shift(-1)) },
    { id:"t-laun",  family_id:"fam1", assigned_to:"m-suzy", title:"laundry",      star_reward:0, due_date:dk(today), due_time:null, kind:"chore", rrule:null, exdates:[], is_active:true, created_at:iso(shift(-1)) },
    { id:"t-bins",  family_id:"fam1", assigned_to:null,     title:"take bins out",star_reward:5, due_date:dk(today), due_time:null, kind:"chore", rrule:null, exdates:[], is_active:true, created_at:iso(shift(-1)) },
    { id:"t-perm",  family_id:"fam1", assigned_to:"m-suzy", title:"sign slip",    star_reward:0, due_date:dk(today), due_time:"09:00", kind:"task",  rrule:null, exdates:[], is_active:true, created_at:iso(shift(-1)) },
  ],
  task_completions: [
    { id:"c1", family_id:"fam1", task_id:"t-teeth", member_id:"m-doma", occurrence_date:dk(today), star_awarded:5, completed_at:iso(today) },
    { id:"c2", family_id:"fam1", task_id:"t-hw",    member_id:"m-nono", occurrence_date:null,      star_awarded:10, completed_at:iso(today) },
  ],
  events: [
    { id:"e1", family_id:"fam1", member_id:"m-suzy", title:"Pilates", location:null, starts_at:iso(new Date(today.getTime()+9*3600e3)),  ends_at:iso(new Date(today.getTime()+10*3600e3)), all_day:false, rrule:null, exdates:[], reminder_minutes:null },
    { id:"e2", family_id:"fam1", member_id:"m-nono", title:"Pep rally", location:null, starts_at:iso(new Date(today.getTime()+12*3600e3)), ends_at:iso(new Date(today.getTime()+13*3600e3)), all_day:false, rrule:null, exdates:[], reminder_minutes:null },
    { id:"e3", family_id:"fam1", member_id:null, title:"Zoo trip", location:null, starts_at:iso(shift(1)), ends_at:null, all_day:true, rrule:null, exdates:[], reminder_minutes:null },
  ],
  event_overrides: [], event_notes: [],
  meals: [{ id:"ml1", family_id:"fam1", title:"Sheet-pan chicken", meal_type:"Dinner", day:dk(today) }],
  rewards: [
    { id:"r-game", family_id:"fam1", title:"Game hour", emoji:"🎮", star_cost:50, is_active:true },
    { id:"r-ice",  family_id:"fam1", title:"Ice cream", emoji:"🍦", star_cost:15, is_active:true },
  ],
  redemptions: [{ id:"rd1", family_id:"fam1", reward_id:"r-ice", member_id:"m-doma", star_cost:15, status:"pending", created_at:iso(today) }],
  star_ledger: [], recurring_expenses: [], pantry_items: [], stores: [], shopping_items: [], push_subscriptions: [],
};
export const CALLS = { rpc: [] };

const cmp = (a, b) => (a == null ? -1 : b == null ? 1 : a < b ? -1 : a > b ? 1 : 0);
class Q {
  constructor(t){ this.t=t; this.f=[]; this.ord=[]; this._lim=null; this._single=null; this._mode="select"; this._payload=null; }
  select(){ return this; }
  eq(c,v){ this.f.push(r=>r[c]===v); return this; }
  neq(c,v){ this.f.push(r=>r[c]!==v); return this; }
  is(c,v){ this.f.push(r=> v===null ? (r[c]===null||r[c]===undefined) : r[c]===v); return this; }
  not(c,_op,v){ this.f.push(r=> v===null ? (r[c]!==null&&r[c]!==undefined) : r[c]!==v); return this; }
  in(c,vs){ this.f.push(r=>vs.includes(r[c])); return this; }
  gte(c,v){ this.f.push(r=>r[c]>=v); return this; }
  lte(c,v){ this.f.push(r=>r[c]<=v); return this; }
  gt(c,v){ this.f.push(r=>r[c]>v); return this; }
  lt(c,v){ this.f.push(r=>r[c]<v); return this; }
  or(){ return this; }
  order(c,o={}){ this.ord.push([c, o.ascending!==false]); return this; }
  limit(n){ this._lim=n; return this; }
  single(){ this._single="one"; return this; }
  maybeSingle(){ this._single="maybe"; return this; }
  insert(p){ this._mode="insert"; this._payload=p; return this; }
  update(p){ this._mode="update"; this._payload=p; return this; }
  delete(){ this._mode="delete"; return this; }
  upsert(p){ this._mode="insert"; this._payload=p; return this; }
  _rows(){ let rs=(DB[this.t]||[]).slice(); for(const f of this.f) rs=rs.filter(f);
    for(const [c,asc] of this.ord.slice().reverse()) rs.sort((a,b)=>(asc?1:-1)*cmp(a[c],b[c]));
    if(this._lim!=null) rs=rs.slice(0,this._lim); return rs; }
  then(res){
    let data, error=null;
    try {
      if(this._mode==="insert"){ const arr=Array.isArray(this._payload)?this._payload:[this._payload];
        const made=arr.map((p,i)=>({ id:`new-${this.t}-${(DB[this.t]||[]).length+i}`, ...p }));
        DB[this.t]=(DB[this.t]||[]).concat(made); data=made; }
      else if(this._mode==="update"){ const hit=this._rows(); hit.forEach(r=>Object.assign(r,this._payload)); data=hit; }
      else if(this._mode==="delete"){ const hit=this._rows(); DB[this.t]=(DB[this.t]||[]).filter(r=>!hit.includes(r)); data=hit; }
      else data=this._rows();
      if(this._single) data = data[0] ?? (this._single==="maybe" ? null : null);
    } catch(e){ error={message:String(e)}; data=null; }
    return Promise.resolve({ data, error }).then(res);
  }
}
export function createClient(){
  return {
    auth: {
      getSession: async () => ({ data:{ session:{ access_token:"tok", user:{ id:"u1" } } } }),
      onAuthStateChange: () => ({ data:{ subscription:{ unsubscribe(){} } } }),
      signInWithPassword: async () => ({ error:null }),
      signOut: async () => ({ error:null }),
    },
    from: (t) => new Q(t),
    rpc: async (name, args) => { CALLS.rpc.push({ name, args }); return { data:null, error:null }; },
    channel: () => { const ch={ on:()=>ch, subscribe:()=>ch }; return ch; },
    removeChannel: () => {},
    realtime: { setAuth(){} },
  };
}
