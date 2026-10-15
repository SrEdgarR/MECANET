"""Bounded resource diagnostics shared by the two existing QA guards.
No policy changes, filesystem writes, child processes or network calls. OS
accounting is read only when explicitly supplied by the caller.
"""
import math,re
FIELDS=('user','nice','system','idle','iowait','irq','softirq','steal')
SCOPE='Root controller process; excludes Docker containers and daemon'
FOOTPRINT_BYTES=3*2*1024**3+2*512*1024**2+160*1024**2+2*1024**3

def number(value):return value if type(value) in (int,float) and math.isfinite(value) and value>=0 else None

def process_usage(api,include_thread=False):
 out={'available':False,'reason':'OS_ACCOUNTING_UNAVAILABLE','containerUsage':'NOT MEASURED','scope':SCOPE}
 if api is None:return out
 try:
  own=api.getrusage(api.RUSAGE_SELF);cpu=number(own.ru_utime+own.ru_stime);rss=number(own.ru_maxrss)
  if cpu is None:return out
  out={'available':True,'controllerProcessCpuSeconds':cpu,'controllerProcessPeakRssKiB':rss,'containerUsage':'NOT MEASURED','scope':SCOPE,'cpuMeasurement':'cumulative user+system CPU seconds; not host CPU percent','rssMeasurement':'peak RSS, Linux KiB; not instantaneous RSS'}
  if include_thread and hasattr(api,'RUSAGE_THREAD'):
   thread=api.getrusage(api.RUSAGE_THREAD);out['monitorThreadCpuSeconds']=number(thread.ru_utime+thread.ru_stime)
  return out
 except (AttributeError,OSError,ValueError,TypeError):return out

def safe_usage(value):
 if not isinstance(value,dict) or value.get('available') is not True:return process_usage(None)
 out={'available':True,'containerUsage':'NOT MEASURED','scope':SCOPE,'cpuMeasurement':'cumulative user+system CPU seconds; not host CPU percent','rssMeasurement':'peak RSS, Linux KiB; not instantaneous RSS'}
 for key in ('controllerProcessCpuSeconds','controllerProcessPeakRssKiB','monitorThreadCpuSeconds'):
  if key in value:out[key]=number(value[key])
 if out.get('controllerProcessCpuSeconds') is None:return process_usage(None)
 return out

def counters(value):
 return list(value) if isinstance(value,(list,tuple)) and len(value)==8 and all(type(v) is int and v>=0 for v in value) else None

def describe(mode,*,observed_at,monotonic_seconds,interval_seconds,cpu_busy,available_mib,disk_free_bytes,disk_total_bytes,cpu_before=None,cpu_after=None,own_usage=None):
 assert mode in ('admission','monitor'),'RESOURCE_DIAGNOSTIC_MODE'
 available=available_mib if type(available_mib) is int and available_mib>=0 else None
 free=disk_free_bytes if type(disk_free_bytes) is int and disk_free_bytes>=0 else None
 total=disk_total_bytes if type(disk_total_bytes) is int and disk_total_bytes>0 else None
 cpu=number(cpu_busy);cpu=cpu if cpu is not None and cpu<=100 else None
 before,after=counters(cpu_before),counters(cpu_after);delta=[b-a for a,b in zip(before,after)] if before is not None and after is not None else None
 if delta is not None and any(v<0 for v in delta):delta=None
 at=observed_at if isinstance(observed_at,str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z',observed_at) else None
 minimum=5120 if mode=='admission' else 3072;upper=80 if mode=='admission' else 90;disk_min=max(15*1024**3,total*.1) if total is not None else None
 reasons=[]
 if available is None or available<minimum:reasons.append('ADMISSION_MEMORY_HEADROOM_LIMIT' if mode=='admission' else 'RESOURCE_MEMORY_LIMIT')
 if mode=='admission':
  if cpu is None:reasons.append('ADMISSION_CPU_SAMPLE_UNKNOWN')
  elif cpu>=upper:reasons.append('ADMISSION_CPU_LIMIT')
  if free is None or disk_min is None or free<=disk_min:reasons.append('ADMISSION_DISK_MARGIN_LIMIT')
  if free is None or free<=FOOTPRINT_BYTES:reasons.append('ADMISSION_DISK_FOOTPRINT_LIMIT')
 else:
  if free is None or disk_min is None or free<=disk_min:reasons.append('RESOURCE_DISK_LIMIT')
  if cpu_busy is not None and (cpu is None or cpu>=upper):reasons.append('RESOURCE_CPU_LIMIT')
 return {'schema':'cp023-resource-sample-v1','mode':mode,'observedAt':at,'monotonicSeconds':number(monotonic_seconds),'intervalSeconds':number(interval_seconds),'host':{'cpuBusyPercent':cpu,'cpuObservation':'NO_DELTA_WARMUP' if mode=='monitor' and cpu_busy is None else 'MEASURED' if cpu is not None else 'INVALID','cpuFieldNames':list(FIELDS),'cpuCountersBefore':before,'cpuCountersAfter':after,'cpuCountersDelta':delta,'cpuScope':'aggregate host counters including steal; excludes idle+iowait from busy; no process or container attribution','availableMiB':available,'diskFreeBytes':free,'diskTotalBytes':total},'thresholds':{'cpuBusyUpperExclusive':upper,'availableMiBLowerInclusive':minimum,'reservedMiB':2048 if mode=='admission' else 0,'diskFreeLowerExclusive':disk_min,'footprintBytesLowerExclusive':FOOTPRINT_BYTES if mode=='admission' else None},'firstViolation':reasons[0] if reasons else None,'violations':reasons,'resourceResult':'REJECTED' if reasons else 'ACCEPTED FOR THESE RESOURCE GUARDS ONLY','ownUsage':safe_usage(own_usage)}
