"""Exclusive QA controller: prove old worker exited before transferring clock ownership."""
import json, pathlib, os, subprocess, sys, time
root=pathlib.Path('/opt/mecanet-qa-p1l1')
assert os.geteuid()==0 and root.resolve()==root
assert json.loads((root/'owner.json').read_text())['project']=='mecanet-qa-p1l1'
mode=sys.argv[1] if len(sys.argv)>1 else 'clock-only'
assert mode in ('clock-only','full')
c=['docker','compose','-f',str(root/'compose.yaml')]
old_id=subprocess.check_output(c+['ps','-aq','worker'],text=True).strip()
assert old_id
subprocess.run(c+['stop','worker'],check=True)
old=json.loads(subprocess.check_output(['docker','inspect',old_id]))[0]
assert old['State']['Status']=='exited' and not old['State']['Running']
pg_id=subprocess.check_output(c+['ps','-q','postgres'],text=True).strip()
command='export PGPASSWORD; PGPASSWORD=$(cat /run/secrets/bootstrap); exec psql -h /var/run/postgresql -U qa_bootstrap -d mecanet_control -At -v ON_ERROR_STOP=1'
row=json.loads(subprocess.check_output(['docker','exec','-i',pg_id,'sh','-c',command],input='SELECT row_to_json(t) FROM (SELECT owner,generation FROM saas.time_authority WHERE id=1)t;',text=True))
qa=json.loads((root/'secrets/connections.json').read_text())
assert row['generation']==qa['generation']
proof={'kind':'stopped-process','previousOwner':row['owner'],'generation':row['generation'],'confirmed':True,'reference':'qa:worker-transfer-'+str(time.time_ns()),'containerId':old['Id'],'observedState':'exited','stoppedAt':old['State']['FinishedAt']}
config={'connection':qa['connections']['saas_clock'],'generation':qa['generation'],'clockTransfer':proof}
if mode=='full':
 config.update(measurementConnection=qa['connections']['saas_measure'],reconcilerConnection=qa['connections']['saas_reconciler'],policyConnection=qa['connections']['saas_policy'])
temporary=root/'secrets/worker.json.new'
with open(temporary,'x') as f:
 os.chmod(temporary,0o600);os.chown(temporary,999,999);json.dump(config,f);f.flush();os.fsync(f.fileno())
os.replace(temporary,root/'secrets/worker.json')
subprocess.run(c+['up','-d','--no-deps','--force-recreate','worker'],check=True)
(root/'evidence/worker-transfer.json').write_text(json.dumps({'mode':mode,'proof':proof,'reusedProof':False}))
print(json.dumps({'workerTransferRequested':True,'mode':mode,'previousProcessProvenExited':True,'newOwnerRequiresCAS':True}))
