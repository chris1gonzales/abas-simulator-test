// Educational low-voltage circuit authoring. Explicit terminals and user-defined wiring.
export const types={transformer:'24 VAC Transformer',relay:'Relay Contact',relay_nc:'Relay NC Contact',relay_coil:'Relay Coil',freezestat:'Freezestat',smoke:'Smoke Interlock',wire:'Terminal / Conductor',actuator:'Actuator',controller:'DDC Output',sensor:'Sensor',vfd:'VFD Enable'};
export const makeSchematic=()=>({components:[{id:'n1',type:'transformer',x:45,y:130,label:'XFMR'},{id:'n2',type:'relay',x:260,y:130,label:'Fan Relay'},{id:'n3',type:'freezestat',x:475,y:130,label:'Low Limit'},{id:'n4',type:'vfd',x:690,y:130,label:'VFD Enable'}],wires:[['n1:B','n2:A'],['n2:B','n3:A'],['n3:B','n4:A'],['n4:B','n1:A']],fault:'n3',voltage:24.1});
export function validSchematic(s){return !!(s&&Array.isArray(s.components)&&Array.isArray(s.wires)&&s.components.length<=35&&s.wires.length<=100&&s.components.every(n=>typeof n.id==='string'&&types[n.type]&&Number.isFinite(n.x)&&Number.isFinite(n.y)&&typeof n.label==='string')&&s.wires.every(w=>Array.isArray(w)&&w.length===2&&w.every(t=>typeof t==='string')));}
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const term=(id,side)=>`${id}:${side}`;
// Deterministic, idealized low-voltage circuit engine. No connection to live equipment.
function reachable(adj,start){const visited=new Set([start]),queue=[start];for(let i=0;i<queue.length;i++)for(const v of adj.get(queue[i])||[])if(!visited.has(v)){visited.add(v);queue.push(v)}return visited;}
export function evaluateCircuit(s,repair=false){
 if(!validSchematic(s))return {error:'Invalid circuit'};
 const source=s.components.find(n=>n.type==='transformer');if(!source)return {error:'Add a transformer'};
 const faults=repair?[]:Array.isArray(s.faults)?s.faults.filter(id=>s.components.some(n=>n.id===id)):(s.fault?[s.fault]:[]);
 const adj=new Map();const add=(a,b)=>{if(!adj.has(a))adj.set(a,new Set());if(!adj.has(b))adj.set(b,new Set());adj.get(a).add(b);adj.get(b).add(a)};
 for(const [a,b] of s.wires)add(a,b);
 // A coil is a load, not a short. The contact state follows its associated coil.
 const coilStates={};let energized={};
 const coilOn=n=>Boolean(coilStates[n.control||'default']??s.coilEnergized??true);
 for(let pass=0;pass<4;pass++){
  adj.clear();for(const [a,b] of s.wires)add(a,b);
  for(const n of s.components){
   if(n.type==='transformer'||n.type==='relay_coil'||n.type==='actuator'||n.type==='sensor'||n.type==='vfd')continue;
   let closed=n.type==='relay'?coilOn(n):n.type==='relay_nc'?!coilOn(n):n.normallyOpen?false:true;
   if(faults.includes(n.id))closed=false;
   if(closed)add(term(n.id,'A'),term(n.id,'B'));
  }
  const hot=reachable(adj,term(source.id,'B')),common=reachable(adj,term(source.id,'A'));
  energized={};for(const n of s.components.filter(n=>n.type==='relay_coil')){
   const on=(hot.has(term(n.id,'A'))&&common.has(term(n.id,'B')))||(hot.has(term(n.id,'B'))&&common.has(term(n.id,'A')));
   energized[n.id]=on&&!faults.includes(n.id);
  }
  const next={};for(const n of s.components.filter(n=>n.type==='relay_coil'))next[n.control||'default']=energized[n.id];
  if(JSON.stringify(next)===JSON.stringify(coilStates))break;
  Object.assign(coilStates,next);
 }
 const hot=reachable(adj,term(source.id,'B')),common=reachable(adj,term(source.id,'A'));
 const loads={};for(const n of s.components.filter(n=>['vfd','actuator','relay_coil'].includes(n.type)))loads[n.id]=!faults.includes(n.id)&&((hot.has(term(n.id,'A'))&&common.has(term(n.id,'B')))||(hot.has(term(n.id,'B'))&&common.has(term(n.id,'A'))));
 return {adj,hot,common,loads,coilStates,faults,voltage:Number(s.voltage||24.1),source};
}
export function circuitReading(s,a,b,mode='vac',repair=false){
 const r=evaluateCircuit(s,repair);if(r.error)return r.error;if(!a||!b)return 'Select two terminals';if(a===b)return mode==='ohm'?'0.0 Ω':'0.0 VAC';
 if(mode==='vdc')return 'No modeled DC source';
 if(mode==='ohm'){
  // De-energized educational continuity model: this is not an instruction to measure a live circuit.
  const connected=reachable(r.adj,a).has(b);return connected?'0.2 Ω (simulated, isolated)':'OL (simulated open)';
 }
 const voltage=(r.hot.has(a)&&r.common.has(b))||(r.hot.has(b)&&r.common.has(a));
 return voltage?`${r.voltage.toFixed(1)} VAC`:'0.0 VAC';
}
export function simulatedPoints(s,repair=false){
 const r=evaluateCircuit(s,repair);if(r.error)return {'Circuit Status':r.error};
 const loads=Object.entries(r.loads);const vfd=s.components.find(n=>n.type==='vfd');const running=vfd?Boolean(r.loads[vfd.id]):loads.some(([,on])=>on);
 return {'Circuit Status':running?'ENERGIZED':'NOT PROVEN','Fan Status':running?'ON':'OFF','VFD Status':running?'RUNNING':'STOPPED','Supply Airflow':running?'8,450 CFM':'0 CFM','Active Open Faults':String(r.faults.length),...Object.fromEntries(s.components.filter(n=>n.type==='relay_coil').map(n=>[`${n.label} Coil`,r.loads[n.id]?'ENERGIZED':'DE-ENERGIZED']))};
}
export function schematicMarkup(s,{editing=false,selected=null,wireStart=null,probeA=null,probeB=null}={}){if(!validSchematic(s))return '';const coords=new Map();for(const n of s.components){coords.set(term(n.id,'A'),[n.x,n.y+35]);coords.set(term(n.id,'B'),[n.x+150,n.y+35]);}return `<div class="schematic-scroll"><svg class="schematic-canvas" viewBox="0 0 930 460" role="img" aria-label="Interactive electrical schematic"><defs><pattern id="schemgrid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="#263d52" stroke-width="1"/></pattern></defs><rect width="930" height="460" fill="url(#schemgrid)"/>${s.wires.map(([a,b],i)=>{const p=coords.get(a),q=coords.get(b);return p&&q?`<path data-wire="${i}" d="M${p[0]} ${p[1]} L${(p[0]+q[0])/2} ${p[1]} L${(p[0]+q[0])/2} ${q[1]} L${q[0]} ${q[1]}" fill="none" stroke="#52c7da" stroke-width="3" class="schem-wire"/>`:''}).join('')}${s.components.map(n=>`<g class="schem-component ${selected===n.id?'selected':''}" data-node="${escape(n.id)}" transform="translate(${n.x} ${n.y})"><rect x="0" y="0" width="150" height="72" rx="9" fill="#172e43" stroke="${(Array.isArray(s.faults)?s.faults.includes(n.id):s.fault===n.id)?'#e8a068':'#7695ac'}" stroke-width="2"/><text x="75" y="24" text-anchor="middle" fill="#dff4fa" font-size="12" font-weight="bold">${escape(n.label).slice(0,22)}</text><text x="75" y="44" text-anchor="middle" fill="#93b7ce" font-size="10">${escape(types[n.type])}</text>${['A','B'].map((side,i)=>`<circle data-terminal="${escape(term(n.id,side))}" cx="${i?150:0}" cy="35" r="9" fill="${probeA===term(n.id,side)?'#e45b68':probeB===term(n.id,side)?'#f4f4f4':wireStart===term(n.id,side)?'#f4d06e':'#45b8d0'}" stroke="#101c2a" stroke-width="2"/><text x="${i?137:13}" y="62" text-anchor="middle" fill="#b4d1e2" font-size="10">${side}</text>`).join('')}</g>`).join('')}</svg></div>`;}
export function schematicEditor(s,selection,wireStart){return `<div class="schem-tools"><label>Add component <select id="schem-type">${Object.entries(types).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><button class="primary" id="schem-add">+ Place component</button><button class="outline" id="schem-connect">${wireStart?'Connecting: '+escape(wireStart)+' (click destination)':'Connect terminals'}</button><button class="outline" id="schem-delete-wire">Remove last wire</button></div><p class="editor-help">Drag components to position them. Select “Connect terminals,” then click two terminal circles to create a wire. Click a component to edit its label, assign a fault, or delete it. A transformer uses terminal A as common and B as hot.</p>${schematicMarkup(s,{editing:true,selected:selection,wireStart})}<div class="schem-properties">${selection?(()=>{const n=s.components.find(x=>x.id===selection);return n?`<strong>Selected: ${escape(n.label)}</strong><label>Component label <input id="schem-label" value="${escape(n.label)}" maxlength="40"/></label><button class="outline" id="schem-fault">${(s.faults||[s.fault]).includes(n.id)?'✓ Open fault active':'Toggle open fault'}</button><button class="outline" id="schem-remove">Delete component</button>`:''})(): '<span>Select a component to edit its properties.</span>'}<label>Relay control group <input id="schem-control" placeholder="default" value="${escape(s.components.find(n=>n.id===selection)?.control||'default')}" /></label><label>Supply voltage <input id="schem-voltage" type="number" min="1" max="30" step="0.1" value="${Number(s.voltage||24.1)}"/></label></div><p class="wire-warning">Training-only simplified circuit solver. It models ideal conductive paths and multiple open faults and coil-driven contacts, not real loads, shorts, protective-device behavior, or safe field procedures.</p>`;}
