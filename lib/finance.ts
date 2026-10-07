import type {Rec} from './model';

function validDate(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T12:00:00Z');
 return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}

/** Cash movements use their payment date. An old paid invoice without a date is unknown. */
export function paymentDate(record:Rec):string {
 if(record.kind!=='invoice'||record.data.status!=='Pago')return '';
 if(validDate(record.data.paymentDate))return record.data.paymentDate;
 const legacy=String(record.data.paidAt||'').slice(0,10);
 return validDate(legacy)?legacy:'';
}

export function isOverdueIncome(record:Rec,today:string):boolean {
 const due=record.data.dueDate||record.data.date;
 return record.kind==='invoice'&&record.data.type==='Receita'&&record.data.status==='Por pagar'&&validDate(due)&&due<today;
}

/** Called on the server: only a new transition to paid defaults to the current Lisbon date. */
export function normalizeInvoicePayment(record:Rec,previous:Rec|undefined,today:string):void {
 if(record.kind!=='invoice')return;
 if(record.data.status!=='Pago'){
  record.data.paymentDate='';
  delete record.data.paidAt;
  return;
 }
 const supplied=record.data.paymentDate;
 if(supplied!==undefined&&supplied!==null&&supplied!==''&&!validDate(supplied))throw Error('Data de pagamento inválida.');
 const date=supplied||(previous?.data.status==='Pago'?paymentDate(previous):today);
 if(date&&(!validDate(date)||date>today))throw Error('A data de pagamento não pode ser futura.');
 // A receipt can be issued after an advance payment; the two dates are deliberately independent.
 record.data.paymentDate=date||'';
}
