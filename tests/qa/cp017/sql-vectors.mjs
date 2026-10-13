// Independent fixed matrix used only by real writer SQL probes.
export const extensionDenialSql='CREATE EXTENSION dblink WITH SCHEMA catalog';
export function sqlCreateVector({tenantId,actorId,operationId,dataEpoch}){
 const input={sku:`PG-${operationId.slice(0,8).toUpperCase()}`,name:'Texto 😀 e\u0301 \u0001'};
 return{input,preimage:JSON.stringify(['mecanet-write-v1',tenantId,actorId,'catalog.create',dataEpoch,null,[input.sku,input.name]])};
}
