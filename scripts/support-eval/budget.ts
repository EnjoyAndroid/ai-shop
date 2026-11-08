import { Prisma } from '@prisma/client';
import { reservationCost, supportCost, supportRates } from '../../src/lib/support/budget';
import type { SupportConfig } from '../../src/lib/support/config';
import type { SupportCallStart, SupportCallRecord } from '../../src/lib/support/llm';

export interface EvalReservation { id:string; reserved:string; settled:string|null; state:'pending'|'settled'|'uncertain'; }
export interface EvalLedger { ceilingCny:number; calls:EvalReservation[]; }
export function occupiedCny(ledger:EvalLedger){
  return ledger.calls.reduce((total,call)=>total.add(call.settled??call.reserved),new Prisma.Decimal(0));
}
export function reserveEvaluation(ledger:EvalLedger,start:SupportCallStart,config:SupportConfig,id:string){
  const amount=reservationCost(start,config);
  if(occupiedCny(ledger).add(amount).gt(ledger.ceilingCny))return false;
  ledger.calls.push({id,reserved:amount.toString(),settled:null,state:'pending'});
  return {callId:id};
}
export function settleEvaluation(ledger:EvalLedger,record:SupportCallRecord,config:SupportConfig){
  const call=ledger.calls.find(call=>call.id===record.callId);
  if(!call||call.state!=='pending')throw new Error('INVALID_EVALUATION_RESERVATION');
  const cost=record.sent===false?new Prisma.Decimal(0):supportCost(record.usage,supportRates(config));
  call.settled=cost===null?null:cost.mul(config.usdCnyRate).toDecimalPlaces(8,Prisma.Decimal.ROUND_UP).toString();
  call.state=cost===null?'uncertain':'settled';
}
