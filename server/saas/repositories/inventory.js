import {failure} from '../auth/validation.js';

/** Read-only, bounded, and explicitly compatible with the additive L2 schema. */
export async function readInventory(client,{cursor,limit},{deadline,now=()=>performance.now()}={}){
 return read(client,`SELECT p.id,p.sku,p.name,b.on_hand::text AS "onHand",b.version::text AS version FROM catalog.products p JOIN inventory.balances b ON b.product_id=p.id WHERE ($1::uuid IS NULL OR p.id>$1::uuid) ORDER BY p.id LIMIT $2`,[cursor,limit+1],{deadline,now});
}
export async function readMovements(client,productId,{cursor,limit},{deadline,now=()=>performance.now()}={}){
 return read(client,`SELECT id,product_id AS "productId",operation_id AS "operationId",quantity::text, on_hand_after::text AS "onHandAfter",balance_version::text AS "balanceVersion",recorded_at AS "recordedAt" FROM inventory.movements WHERE product_id=$1::uuid AND ($2::uuid IS NULL OR id>$2::uuid) ORDER BY id LIMIT $3`,[productId,cursor,limit+1],{deadline,now});
}
export async function readOperation(client,{operationId,actorId,action,dataEpoch},{deadline,now=()=>performance.now()}={}){
 const rows=await read(client,'SELECT * FROM inventory.operation_result($1::uuid,$2::uuid,$3::text,$4::bigint)',[operationId,actorId,action,dataEpoch],{deadline,now});return rows[0]??null;
}
async function read(client,text,values,{deadline=performance.now()+2000,now}){
 const end=Math.min(deadline,now()+2000);const budget=()=>{const n=Math.floor(end-now());if(n<=0)throw failure('DB_DEADLINE');return n};
 const command=(sql,args)=>client.query({text:sql,values:args,query_timeout:budget()});
 let committing=false;
 try{
  await command('BEGIN READ ONLY');const ms=budget();await command("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true),set_config('idle_in_transaction_session_timeout',$1,true)",[`${ms}ms`,`${Math.min(ms,500)}ms`]);
  const result=await command(text,values);committing=true;await command('COMMIT');budget();return result.rows;
 }catch(error){if(!committing){try{await command('ROLLBACK')}catch{}}throw error}
}
