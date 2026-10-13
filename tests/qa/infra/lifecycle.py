"""Small independent-worker restart trial, only in exclusive synthetic QA."""
import json,pathlib,subprocess,time
p=pathlib.Path('/opt/mecanet-qa-p1l1')
assert json.loads((p/'owner.json').read_text())['project']=='mecanet-qa-p1l1'
c=['docker','compose','-f',str(p/'compose.yaml')]
command='export PGPASSWORD; PGPASSWORD=$(cat /run/secrets/bootstrap); exec psql -h /var/run/postgresql -U qa_bootstrap -d mecanet_control -At -v ON_ERROR_STOP=1'
def sql(q):return json.loads(subprocess.check_output(['docker','exec','-i','mecanet-qa-p1l1-postgres-1','sh','-c',command],input=q,text=True))
def state():return sql("SELECT row_to_json(t) FROM (SELECT owner,generation,tick,clock_version FROM saas.time_authority WHERE id=1)t;")
def ready(service):
 script="require('node:http').get({hostname:'127.0.0.1',port:3000,path:'/api/health/ready',headers:{host:'app.mecanet.test:18443'}},r=>{r.resume();console.log(r.statusCode)})"
 return int(subprocess.check_output(c+['exec','-T',service,'node','-e',script],text=True).strip())
owners=[]
for service in ['api1','api2']:
 container=json.loads(subprocess.check_output(['docker','inspect',subprocess.check_output(c+['ps','-q',service],text=True).strip()]))[0]
 owner=json.loads(subprocess.check_output(c+['exec','-T',service,'cat','/tmp/qa-owner.json']))['owner']
 assert len(owner)==36
 count=sql("SELECT json_build_object('backends',count(*)) FROM pg_stat_activity WHERE application_name='mecanet-qa-api:"+owner+"';")['backends'];assert count>0
 tickets=sql("SELECT json_build_object('http',count(*)) FROM saas.tickets WHERE owner='"+owner+"' AND operation_kind='HTTP';")['http'];assert tickets>0
 owners.append({'service':service,'owner':owner,'container':container['Id'],'backends':count,'admittedHttpTickets':tickets})
before=state();assert [ready(s) for s in ['api1','api2']]==[200,200]
subprocess.run(c+['stop','worker'],check=True)
stopped=state();time.sleep(1.3)
assert state()==stopped
assert [ready(s) for s in ['api1','api2']]==[503,503]
subprocess.run(['python3',str(p/'release/tests/qa/infra/transfer-worker.py'),'full'],check=True)
for attempt in range(20):
 time.sleep(.3)
 if [ready(s) for s in ['api1','api2']]==[200,200]:break
else:raise RuntimeError('QA_READINESS_NOT_RECOVERED')
after=state();assert after['generation']==before['generation'] and after['owner']!=before['owner'] and int(after['tick'])>=int(stopped['tick'])
result={'result':'PASS','time':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'twoRealApiProcesses':owners,'bothReadyBefore':True,'bothUnavailableAfterClockStop':True,'tickFrozenWhileStopped':True,'bothReadyAfterProvenTransfer':True,'generationPreserved':True,'counterNotReset':True,'limits':'Readiness/restart and real process provenance; not a complete fault/concurrency matrix'}
(p/'evidence/lifecycle.json').write_text(json.dumps(result));print(json.dumps(result))
