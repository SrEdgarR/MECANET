export function validatePreflight(s) {
  if(s.project!=='mecanet-qa-p1l1'||s.root!=='/opt/mecanet-qa-p1l1'||s.baseline!=='3b387b38784907b67e2209a35c3d5f400d70742e') throw new Error('QA_TARGET_NOT_APPROVED');
  if(s.architecture!=='aarch64'||!s.portFree||!s.subnetsFree||s.sharesOtherResources) throw new Error('QA_ISOLATION_UNSAFE');
  if(!Number.isFinite(s.availableMiB)||s.availableMiB-s.memoryLimitMiB<3072||s.freeBytes<Math.max(15*1024**3,s.totalBytes*.1)||s.cpuBusyPercent>=80||s.cpuLimit>1||s.memoryLimitMiB>2048) throw new Error('QA_CAPACITY_UNSAFE');
  return Object.freeze({allowed:true,project:s.project,root:s.root});
}
