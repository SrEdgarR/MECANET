// Read only the already validated, exact canonical request matrix. This is a
// private test oracle, not a second SKU normalization rule or product function.
export function canonicalSkuForOracle(canonical){
 const matrix=JSON.parse(canonical.preimage);
 if(matrix[0]!=='mecanet-write-v1'||matrix[3]!=='catalog.create'||matrix[5]!==null||!Array.isArray(matrix[6])||matrix[6].length!==2||typeof matrix[6][0]!=='string')throw Error('CATALOG_CANONICAL_ORACLE_REQUIRED');
 return matrix[6][0];
}
