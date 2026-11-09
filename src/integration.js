import {evaluateCircuit,validSchematic} from './schematic.js';
import {simulateSequence} from './sequence.js';

// Training-only coupling layer. Electrical safety is never bypassed by software commands.
export function integratedState(scenario,sequence,repaired=false){
 const logic=simulateSequence(sequence);
 const hasSchematic=validSchematic(scenario.schematic);
 const isRandom=scenario.id==='random-ahu';
 let electricalReady=true, electricalDescription='No authored electrical circuit';
 let faultCount=0;
 if(hasSchematic){
  const circuit=evaluateCircuit(scenario.schematic,repaired);
  const vfd=scenario.schematic.components.find(n=>n.type==='vfd');
  electricalReady=!circuit.error && Boolean(vfd ? circuit.loads[vfd.id] : Object.values(circuit.loads).some(Boolean));
  faultCount=circuit.faults?.length||0;
  electricalDescription=circuit.error||`${electricalReady?'Enable path complete':'Enable path interrupted'} · ${faultCount} injected open fault(s)`;
 } else if(isRandom){
  const fault=repaired?null:scenario.activeFault;
  electricalReady=!fault;
  faultCount=fault?1:0;
  electricalDescription=fault?'Fan enable or VFD unavailable — investigate circuit / drive':'Fan enable and VFD available';
 }
 const fanCommand=logic.request;
 const safetyOK=logic.safety;
 const output=fanCommand&&safetyOK;
 const fan=output&&electricalReady;
 const proof=fan&&logic.proof;
 const valveCommand=proof?logic.command:0;
 const valvePosition=proof?logic.valve:0;
 const airflow=proof?8450:0;
 const alarm=!safetyOK?'SAFETY INTERLOCK OPEN':fanCommand&&!electricalReady?'FAN ENABLE / DRIVE FAULT':fan&&!proof?'FAN PROOF FAILURE':logic.alarm;
 return {logic,fanCommand,safetyOK,electricalReady,electricalDescription,faultCount,output,fan,proof,valveCommand,valvePosition,airflow,alarm,points:{
  'Fan Command':fanCommand?'ON':'OFF','Fan Status':proof?'ON':'OFF','VFD Status':fan?'RUNNING':'STOPPED',
  'Supply Airflow':`${airflow.toLocaleString('en-US')} CFM`,'Cooling Valve Command':`${valveCommand.toFixed(1)} %`,
  'Cooling Valve Position':`${valvePosition.toFixed(1)} %`,'SAT Sensor':`${logic.sensedSAT.toFixed(1)} °F`,
  'SAT Setpoint':`${sequence.setpoint.toFixed(1)} °F`,'Safety Circuit':safetyOK?'CLOSED':'OPEN',
  'AHU Alarm':alarm,'Electrical Enable':electricalReady?'AVAILABLE':'NOT AVAILABLE'
 }};
}
export function advanceIntegrated(scenario,sequence,repaired=false,seconds=30){
 const steps=Math.max(1,Math.round(seconds/30));let next=sequence;
 for(let i=0;i<steps;i++){
  const p=integratedState(scenario,next,repaired);
  const error=p.logic.error;
  const integral=Math.max(-20,Math.min(60,next.integral+(p.proof?error*(next.config?.ki??0.12):0)));
  const target=p.proof?next.returnTemp-(next.returnTemp-next.chw)*p.valvePosition/100:next.returnTemp;
  const sat=+(next.sat+(target-next.sat)*0.24).toFixed(1);
  next={...next,sat,integral,elapsed:next.elapsed+30,history:[`t=${next.elapsed+30}s | Fan ${p.proof?'ON':'OFF'} | SAT ${sat}°F | Valve ${p.valvePosition.toFixed(0)}% | ${p.alarm}`,...next.history].slice(0,20)};
 }
 return next;
}
