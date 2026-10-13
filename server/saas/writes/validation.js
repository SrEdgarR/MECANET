import {createHash} from 'node:crypto';
import {failure,uuid} from '../auth/validation.js';

const MAX_BIGINT=9223372036854775807n;
export const WRITE_ACTIONS=Object.freeze(['catalog.create','inventory.receive']);
export const REJECTION_CODES=new Set(['SKU_CONFLICT','PRODUCT_LIMIT','LOGICAL_QUOTA','PRODUCT_NOT_FOUND','STOCK_OVERFLOW','WRITE_CLOSED','EPOCH_CONFLICT','KEY_CONFLICT','AUTHORITY_CHANGED','NO_EFFECT']);
const invalid=()=>failure('INVALID_WRITE',400);
export function canonicalUuid(value){if(typeof value!=='string'||!uuid.test(value))throw invalid();return value.toLowerCase()}
export function decimal(value,{positive=false}={}){
 if(typeof value!=='string'||!(/^(0|[1-9][0-9]{0,18})$/).test(value))throw invalid();
 const n=BigInt(value);if(n>MAX_BIGINT||(positive&&n===0n))throw invalid();return value;
}
function text(value,max){
 if(typeof value!=='string')throw invalid();const chars=Array.from(value);
 if(chars.length<1||chars.length>max||chars.some(c=>c==='\u0000'||(c.codePointAt(0)>=0xd800&&c.codePointAt(0)<=0xdfff)))throw invalid();
 return value;
}
function body(input,keys){
 if(!input||Object.getPrototypeOf(input)!==Object.prototype||Object.keys(input).length!==keys.length||Object.keys(input).some(k=>!keys.includes(k)))throw invalid();
 return input;
}

/** The exact approved request preimage; no JSONB, body hash or Unicode folding. */
export function canonicalWrite({tenantId,actorId,action,dataEpoch,productId=null,input}){
 tenantId=canonicalUuid(tenantId);actorId=canonicalUuid(actorId);dataEpoch=decimal(dataEpoch,{positive:true});let values;
 if(action==='catalog.create'){
  if(productId!==null)throw invalid();body(input,['sku','name']);
  if(typeof input.sku!=='string')throw invalid();const sku=input.sku.trim().replace(/[a-z]/g,c=>c.toUpperCase());
  if(!/^[A-Z0-9][A-Z0-9._-]{0,63}$/.test(sku))throw invalid();values=[sku,text(input.name,200)];
 }else if(action==='inventory.receive'){
  productId=canonicalUuid(productId);body(input,['quantity','reason']);const quantity=decimal(input.quantity,{positive:true});
  if(BigInt(quantity)>1000000n)throw invalid();values=[quantity,text(input.reason,160)];
 }else throw invalid();
 const preimage=JSON.stringify(['mecanet-write-v1',tenantId,actorId,action,dataEpoch,productId,values]);
 if(Buffer.byteLength(preimage,'utf8')>8192)throw invalid();
 return {tenantId,actorId,action,dataEpoch,productId,preimage,requestHash:createHash('sha256').update(preimage,'utf8').digest('hex')};
}

export function parseInventoryQuery(query,{pending=false}={}){
 const allowed=pending?['cursor','limit','state']:['cursor','limit'];
 if(!query||Object.keys(query).some(k=>!allowed.includes(k))||(query.limit!==undefined&&(typeof query.limit!=='string'||!/^(?:[1-9][0-9]?|100)$/.test(query.limit)))||(pending&&query.state!==undefined&&query.state!=='pending'))throw failure('INVALID_QUERY',400);
 let cursor=null;if(query.cursor!==undefined){try{cursor=canonicalUuid(query.cursor)}catch{throw failure('INVALID_QUERY',400)}}
 return {limit:Number(query.limit??100),cursor};
}

/** Return complete rows only, retaining the last included UUID as continuation. */
export function fitPage(rows,envelope={},field='items',{maxRows=100,hasMore=false,cursorKey='id',maxBytes=65536}={}){
 if(!Number.isInteger(maxRows)||maxRows<1||maxRows>100||!Number.isInteger(maxBytes)||maxBytes<512||maxBytes>65536)throw failure('RESPONSE_LIMIT');
 const included=[];let remaining=hasMore||rows.length>maxRows;
 for(const row of rows.slice(0,maxRows)){
  const candidate={...envelope,[field]:[...included,row],nextCursor:row[cursorKey]};
  if(Buffer.byteLength(JSON.stringify(candidate),'utf8')>maxBytes){remaining=true;break}included.push(row);
 }
 if(rows.length&&!included.length)throw failure('RESPONSE_LIMIT');
 return {...envelope,[field]:included,nextCursor:remaining&&included.length?included.at(-1)[cursorKey]:null};
}

export function validateResult(result){
 if(!result||Object.getPrototypeOf(result)!==Object.prototype||Buffer.byteLength(JSON.stringify(result),'utf8')>512)throw failure('WRITE_RESULT_INVALID');
 const keys=result.state==='CONFIRMED'?['operationId','state','productId','movementId','onHand','balanceVersion','dataEpoch']:result.state==='REJECTED'?['operationId','state','code','dataEpoch']:null;
 if(!keys||Object.keys(result).length!==keys.length||Object.keys(result).some(k=>!keys.includes(k)))throw failure('WRITE_RESULT_INVALID');
 try{canonicalUuid(result.operationId);decimal(result.dataEpoch,{positive:true});if(result.state==='CONFIRMED'){canonicalUuid(result.productId);if(result.movementId!==null)canonicalUuid(result.movementId);decimal(result.onHand);decimal(result.balanceVersion,{positive:true})}else if(!REJECTION_CODES.has(result.code))throw invalid()}catch{throw failure('WRITE_RESULT_INVALID')}
 return result;
}
