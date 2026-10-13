/** One bounded read-only transaction. No retry of SQL or unconfirmed work. */
export async function readCatalog(client,query,{deadline,now=()=>performance.now()}){
 const end=Math.min(deadline,now()+2000);
 const budget=()=>{const ms=Math.floor(end-now());if(ms<=0)throw Object.assign(new Error('DB_DEADLINE'),{code:'DB_DEADLINE'});return ms};
 const command=(text,values)=>client.query({text,values,query_timeout:budget()});
 await command('BEGIN READ ONLY');
 const ms=budget();
 await command("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$2,true),set_config('idle_in_transaction_session_timeout',$1,true)",[`${ms}ms`,`${Math.min(500,ms)}ms`]);
 const result=await command('SELECT id,sku,name FROM catalog.products WHERE ($1::uuid IS NULL OR id>$1::uuid) ORDER BY id LIMIT $2',[query.cursor,query.limit]);
 await command('COMMIT');
 budget();
 return result.rows;
}
