"""Local Root boundary models; no Docker, SSH or PostgreSQL execution."""
import copy, importlib.util, json, pathlib, re, subprocess, tempfile, types, unittest
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('target_probes_host',pathlib.Path(__file__).with_name('target-probes-host.py'));p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
H='a'*64;SHA='b'*40;INV='00000000-0000-4000-8000-000000000001'
def material():return {'artifactDigest':H,'controllerOwner':'00000000-0000-4000-8000-000000000002','recoveryId':'00000000-0000-4000-8000-000000000003','source':{'project':p.SOURCE,'generation':'00000000-0000-4000-8000-000000000004','rolePasswords':{'qa_bootstrap':'old'*15}},'target':{'project':p.TARGET,'generation':'00000000-0000-4000-8000-000000000005','rolePasswords':{'qa_bootstrap':'new'*15}}}
def resource(side='source'):
 return {'project':p.SOURCE if side=='source' else p.TARGET,'generation':material()[side]['generation'],'containerId':'c'*64,'networkIP':'10.77.64.2' if side=='source' else '10.77.66.2','dataPath':'/opt/'+(p.SOURCE if side=='source' else p.TARGET)+'/data/18/docker','systemIdentifier':'1234567890123456789'}
class Plans(unittest.TestCase):
 def test_schema_config_has_closed_pre_post_cases_and_no_frozen_host_receipt(self):
  for mode,cost in [('pre',75),('post',9)]:
   c=p.make_schema_config(material(),resource(),SHA,{'central':H,'tenant':'d'*64},'synthetic CA',mode,INV)
   self.assertEqual(c['schema'],'cp020-schema-fault-input-v1');self.assertEqual(p.schema_case(mode),'source-schema-probe-'+mode);self.assertEqual(p.SCHEMA_SQL[mode],cost);self.assertNotIn('hostReceipt',c);self.assertEqual(c['adminConnection']['password'],material()['source']['rolePasswords']['qa_bootstrap'])
  for mode in ['retry','POST','pre/../../x']:
   with self.assertRaises(AssertionError):p.schema_case(mode)
 def test_wrong_resource_or_invocation_is_rejected_before_a_config_exists(self):
  for bad in [{**resource(),'project':p.TARGET},{**resource(),'networkIP':'10.77.66.2'},{**resource(),'dataPath':'/opt/foreign'}]:
   with self.assertRaises(AssertionError):p.make_schema_config(material(),bad,SHA,{'central':H,'tenant':H},'CA','pre',INV)
  with self.assertRaises(AssertionError):p.make_schema_config(material(),resource(),SHA,{'central':H,'tenant':H},'CA','pre','retry')
 def test_credential_config_binds_only_the_main_target_and_segmented_bundle(self):
  c=p.make_credential_config(material(),{'configBundleHash':H,'configBundleHeaderHash':'d'*64,'custodyHash':p.digest(material()),'sourceSha':SHA},INV)
  self.assertEqual(set(c),{'schema','project','sourceSha','invocationId','custodyHash','configBundleHash','configBundleHeaderHash'});self.assertEqual(c['project'],p.TARGET);self.assertNotIn('password',json.dumps(c))
 def test_schema_host_packet_identifies_the_current_case_and_invocation(self):
  cfg=p.make_schema_config(material(),resource(),SHA,{'central':H,'tenant':H},'CA','pre',INV);observed={'resource':resource(),'sourcePostgresRunning':True,'targetPostgresRunning':False,'runtimeConsumers':[]};packet=p.schema_packet(cfg,observed,'2026-10-15T00:00:00Z')
  self.assertEqual(packet['receiptHash'],p.digest(packet['receipt']));self.assertEqual(packet['receipt']['caseName'],'source-schema-probe-pre');self.assertEqual(packet['receipt']['invocationId'],INV)
  for changed in [{**observed,'runtimeConsumers':[{'service':'worker'}]},{**observed,'targetPostgresRunning':True}]:
   with self.assertRaises(AssertionError):p.schema_packet(cfg,changed,'2026-10-15T00:00:00Z')
 def test_dispatch_rejects_unclosed_selectors_without_side_effects(self):
  h=types.SimpleNamespace()
  for action,args in [('schema-probe',['retry']),('credential-probe',['extra']),('prefix-prepare',[]),('prefix-prepare',['allclosed']),('arbitrary',[])]:
   with self.assertRaises(AssertionError):p.dispatch(h,action,args)
 def test_import_is_passive(self):
  with patch.object(p.os,'open',side_effect=AssertionError('IMPORT_IO')),patch.object(p.uuid,'uuid4',side_effect=AssertionError('IMPORT_ID')):
   other=importlib.util.module_from_spec(spec);spec.loader.exec_module(other)
 def test_own_end_rejects_unknown_sql_fin_replaced_cid_and_missing_root_end(self):
  root=pathlib.Path('/opt')/p.TARGET;command=['node','fixed-probe.mjs'];created={'schema':'controller-job-created-v1','jobId':INV,'containerId':'c'*64,'project':p.TARGET,'service':'harness','ownerId':material()['controllerOwner'],'commandHash':p.digest(command),'state':'CREATED BEFORE START/SQL','createdAt':'2026-10-15T00:00:00Z'};ch=p.digest(created);end={'schema':'controller-job-end-v1',**{k:created[k] for k in ['jobId','containerId','project','service','ownerId']},'createdReceiptHash':ch,'exitCode':0,'containerStopped':True,'sqlAbsence':'NOT VERIFIED','startedAt':'2026-10-15T00:00:01Z','finishedAt':'2026-10-15T00:00:02Z'};job={'root':root,'jobId':INV,'cid':'c'*64,'ownerId':created['ownerId'],'receiptHash':ch}
  for change in [None,{'containerId':'d'*64},{'sqlAbsence':'PASS'},{'finishedAt':'unknown'},{'exitCode':137}]:
   ended={**end,**(change or {})};eh=p.digest(ended);proof={'containerId':'c'*64,'jobCreatedHash':ch,'jobEndHash':eh,'containerFIN':'PASS','sqlFIN':'NOT VERIFIED'};objects={str(root/'evidence/jobs'/(INV+'-created.json')):(created,ch),str(root/'evidence/jobs'/(INV+'-end.json')):(ended,eh)}
   with patch.object(p,'read',side_effect=lambda h,path,*a,**k:objects[str(path)]):
    if change is None:self.assertEqual(p.own_end(None,job,proof,command,p.TARGET),(ch,eh))
    else:
     with self.assertRaisesRegex(AssertionError,'OWN_END'):p.own_end(None,job,proof,command,p.TARGET)
 def test_job_is_created_then_started_with_the_original_invocation_and_no_default_scope(self):
  calls=[];root=pathlib.Path('/opt')/p.TARGET;job={'jobId':INV};proof={'containerId':'c'*64};bridge=types.SimpleNamespace(watch_job=lambda h,j,u:('{"fixed":true}',proof));h=types.SimpleNamespace(guard_effect=lambda *a:calls.append('preflight'),create_job=lambda *a,**k:(calls.append('create') or job),start_job=lambda j:calls.append('start'),target_bridge=lambda:bridge)
  with patch.object(p,'own_end',side_effect=lambda *a:calls.append('end')):
   result,j,pr=p.run_job(h,root,'harness',['node','fixed'],{'QA_PROJECT':p.TARGET,'QA_INVOCATION_ID':INV},[],lambda:calls.append('observe'))
  self.assertEqual(calls,['preflight','observe','create','observe','start','end']);self.assertEqual(result,{'fixed':True})
  h.create_job=lambda *a,**k:{'jobId':'00000000-0000-4000-8000-000000000099'};calls.clear()
  with self.assertRaisesRegex(AssertionError,'INVOCATION'):p.run_job(h,root,'harness',['node','fixed'],{'QA_PROJECT':p.TARGET,'QA_INVOCATION_ID':INV},[])
  self.assertNotIn('start',calls)
 def test_expired_case_cannot_reset_its_clock_or_create_a_probe(self):
  limits={'sql':8192,'http':80,'journal':1000,'artifactFiles':2000};state={'schema':'cp019-budget-v1','project':p.SOURCE,'startedUptime':1,'total':dict.fromkeys(limits,0),'plannedScopes':{'source-schema-probe-pre':'source-window'},'plannedScenarios':{'source-schema-probe-pre':limits},'scenarios':{'source-schema-probe-pre':{'startedUptime':10,'limits':limits,'total':dict.fromkeys(limits,0)}}};h=types.SimpleNamespace(ROOT=pathlib.Path('/opt')/p.SOURCE,CASE_LIMITS=limits,CEILINGS={**limits,'sql':200000,'http':300},uptime=lambda:56);before=copy.deepcopy(state)
  with patch.object(p,'read',return_value=(state,H)):
   with self.assertRaisesRegex(AssertionError,'EXPIRED'):p.budget(h,'source-schema-probe-pre','source-window',75)
  self.assertEqual(state,before)
 def test_prefix_custody_requires_the_final_root_result_not_just_the_runtime_alias(self):
  root=pathlib.Path('/opt')/p.TARGET/'variants/promote-prefix';m=material();lineage={'additionHash':'e'*64};snapshot={'records':[{'fixed':'original'}],'checkpoint':{'sequence':0,'hash':H}};extension={'parentPlanHash':H,'variantLineageHash':'e'*64,'faultPoint':p.FAULT_POINT};context={'schema':'target-abort-prefix-context-v1','configBundleHash':H,'abortPrefix':{'targetJournalRecords':snapshot['records'],'targetJournalCheckpoint':snapshot['checkpoint'],'extension':extension,'extensionHash':p.digest(extension)}};cfg={'custodyHash':p.digest(m),'sourceSha':SHA,'variantLineageContextHash':'d'*64,'variantLineageHash':'e'*64,'faultPoint':p.FAULT_POINT,'targetJournalSnapshotHash':p.digest(snapshot),'targetJournalCheckpoint':snapshot['checkpoint'],'targetJournalRecordsHash':p.digest(snapshot['records']),'invocationId':INV};record={'schema':'cp021-prefix-host-result-v1','caseName':'target-promote-fault','configHash':p.digest(cfg),'contextHash':p.digest(context),'extensionHash':p.digest(extension),'journalCheckpoint':snapshot['checkpoint'],'jobProof':{'containerId':'c'*64,'jobCreatedHash':H}};objects={'prefix-input.json':cfg,'prefix-journal.json':snapshot,'prefix-host-result.json':record,'abort-prefix-context.json':context,'target-abort-prefix-context.json':context};h=types.SimpleNamespace(TARGET=root,target_bridge=lambda:types.SimpleNamespace(bundle_context=lambda h:(m,{'planHash':H},{'sourceSha':SHA,'configBundleHash':H})),variant_lineage=lambda:(lineage,'d'*64))
  def read(h,path,*a,**k):
   value=objects[path.name];return value,p.digest(value)
  with patch.object(p,'namespace'),patch.object(p,'read',side_effect=read),patch.object(p,'own_end') as end:
   self.assertEqual(p.verify_prefix_custody(h),(context,p.digest(context)));end.assert_called_once();end.reset_mock();objects.pop('prefix-host-result.json')
   with self.assertRaises(KeyError):p.verify_prefix_custody(h)
   end.assert_not_called();objects['prefix-host-result.json']=record;objects['target-abort-prefix-context.json']={**context,'configBundleHash':'f'*64}
   with self.assertRaisesRegex(AssertionError,'CUSTODY_REQUIRED'):p.verify_prefix_custody(h)
   end.assert_not_called()
 def test_predecessor_phase_is_bound_to_its_own_root_job_output_and_receipt(self):
  with tempfile.TemporaryDirectory() as temporary:
   root=pathlib.Path(temporary).resolve();jobs=root/'evidence/jobs';jobs.mkdir(parents=True);path=jobs/(INV+'-created.json');path.write_text('{}');m=material();bindings={'custodyHash':p.digest(m),'configBundleHash':H,'sourceSha':SHA};receipt={'schema':'target-runtime-receipt-v1','phase':'rotate','planHash':H,'generation':m['target']['generation'],'recoveryId':m['recoveryId'],**bindings};rh=p.digest(receipt);created={'commandHash':p.digest(['node','tests/qa/cp019/target-runtime.mjs','run','rotate']),'ownerId':m['controllerOwner'],'project':p.TARGET,'containerId':'c'*64,'jobId':INV};output={'type':'cp019-target-phase','phase':'rotate','planHash':H,'receiptHash':rh,'secretOutput':False};h=types.SimpleNamespace(TARGET=root,material_owned=lambda:m)
   def read(h,path,*a,**k):
    if path.name=='target-rotate.json':return receipt,rh
    if path.name.endswith('-created.json'):return created,p.digest(created)
    if path.name.endswith('-output.log'):return p.canonical(output),p.digest(output)
    return {},H
   with patch.object(p,'read',side_effect=read),patch.object(p,'own_end'):
    self.assertEqual(p.phase_receipt(h,'rotate',{'planHash':H},bindings),(receipt,rh));output['receiptHash']='f'*64
    with self.assertRaisesRegex(AssertionError,'OUTPUT_BINDING'):p.phase_receipt(h,'rotate',{'planHash':H},bindings)
 def test_closed_prefix_script_executes_the_real_pure_builder_without_sql(self):
  test_file=pathlib.Path(__file__).with_name('abort-prefix-plan.test.mjs');text=test_file.read_text(encoding='utf-8');setup=text[:text.index("test('prospective")];start=text.index(' const chosen=',text.index("test('a distinct target variant"));end=text.index(' assert.throws(()=>makeAbortPrefixPlan(f)',start);setup+=text[start:end]
  setup=re.sub(r"(from\s*['\"])(\.[^'\"]+)(['\"])",lambda m:m[1]+(test_file.parent/m[2]).resolve().as_uri()+m[3],setup)
  model=r'''
import vm from'node:vm';import{pathToFileURL}from'node:url';import{sep}from'node:path';
let raw='';for await(const part of process.stdin)raw+=part;const script=JSON.parse(raw),bundle={schema:'target-config-bundle-v1',manifest:f.proofBundle.manifest,anchors:f.anchors,proofBundle:f.proofBundle,plan:f.parentPlan,planHash:f.parentPlanHash,copyIndex:v.copyIndex,sourceEndProof:f.sourceEndProof,observedEnd:f.observedSourceEnd,sourceJournalFinalCheckpoint:v.sourceJournalFinalCheckpoint};
const journal={records:f.targetJournalRecords,checkpoint:f.targetJournalCheckpoint},cfg={schema:'cp021-prefix-input-v1',caseName:'target-promote-fault',faultPoint:'PROMOTION_AFTER_OPEN_A',invocationId:'00000000-0000-4000-8000-000000000001',sourceSha:f.parentPlan.sourceSha,configBundleHash:sha256(bundle),configBundleHeaderHash:H,custodyHash:sha256(effective),variantLineageContextHash:sha256(v),variantLineageHash:v.additionHash,sourceCaptureHash:sha256(v.sourceCapture),targetJournalSnapshotHash:sha256(journal),targetJournalRecordsHash:sha256(journal.records),targetJournalCheckpoint:journal.checkpoint};
const files=new Map([['/run/qa-secrets/target-prefix-input.json',Buffer.from(canonical(cfg))],['/run/qa-secrets/target-prefix-journal.json',Buffer.from(canonical(journal))]]);let opened=0,closed=0,charges=0,enters=0,published,output;
const metadata=file=>({dev:1,ino:file.endsWith('input.json')?1:2,uid:999,nlink:1,mode:0o100400,size:files.get(file).length,mtimeMs:1,ctimeMs:1,isFile:()=>true,isSymbolicLink:()=>false});const io={async lstat(file){assert.ok(files.has(file));return metadata(file)},async open(file){opened++;const bytes=files.get(file);return{async stat(){return metadata(file)},async read(buffer,offset,length,position){const n=Math.max(0,Math.min(length,bytes.length-position));if(n)bytes.copy(buffer,offset,position,position+n);return{bytesRead:n}},async close(){closed++}}}};
const privateFiles={'/run/qa-secrets/material.json':effective,'/run/qa-secrets/target-variant-lineage.json':v,'/run/qa-secrets/source-capture.json':v.sourceCapture};
const replacements={'node:fs/promises':io,'./tests/qa/cp019/target-bundle-io.mjs':{loadTargetConfigBundle:async x=>{assert.equal(x.expectedFullHash,sha256(bundle));return{value:bundle}}},'./tests/qa/cp019/target-runtime.mjs':{readTargetPrivate400:async file=>{assert.ok(privateFiles[file]);return{value:privateFiles[file],sha256:sha256(privateFiles[file])}}},'./tests/qa/cp019/source-driver.mjs':{publishSourceReadonly:async(file,value)=>{assert.equal(file,'/run/qa-results/target-prefix-built.json');published=value;return{sha256:sha256(value)}}},'./tests/qa/cp019/ledger.mjs':{newLedger:async(file,x)=>{assert.equal(file,'/run/qa-budget/ledger.json');assert.equal(x.scenario,'target-window');return{enter:async name=>{assert.equal(name,'target-promote-fault');enters++},charge:async kind=>{assert.equal(kind,'artifactFiles');charges++}}}}};
process.env.QA_CODE_SHA=cfg.sourceSha;process.env.QA_INVOCATION_ID=cfg.invocationId;process.env.QA_PROJECT=effective.target.project;const context=vm.createContext({Buffer,process,console:{log:value=>{output=JSON.parse(value)}}}),module=new vm.SourceTextModule(script,{context});const rootUrl=pathToFileURL(process.cwd()+sep);await module.link(async name=>{const exports=replacements[name]??await import(name.startsWith('.')?new URL(name,rootUrl).href:name),keys=Object.keys(exports);return new vm.SyntheticModule(keys,function(){for(const key of keys)this.setExport(key,exports[key])},{context})});await module.evaluate();assert.equal(opened,closed);assert.equal(charges,1);assert.equal(enters,1);assert.equal(output.sqlCommands,0);assert.equal(output.contextHash,sha256(published));const expected=makeAbortPrefixPlan({...f,variantLineage:v,variantLineageHash:v.additionHash});assert.equal(canonical(published.abortPrefix.extension),canonical(expected));process.stdout.write('PASS');
'''
  result=subprocess.run(['node','--experimental-vm-modules','--input-type=module','-e',setup+model],cwd=pathlib.Path(__file__).resolve().parents[3],input=json.dumps(p.PREFIX_BUILDER),text=True,capture_output=True,timeout=30)
  self.assertEqual(result.returncode,0,result.stderr[-1500:]);self.assertEqual(result.stdout,'PASS')
class JournalFiles(unittest.TestCase):
 def test_real_journal_requires_every_external_head_and_plan_and_no_live_lock(self):
  with tempfile.TemporaryDirectory() as temporary:
   root=pathlib.Path(temporary).resolve();journal=root/'journal';(journal/'target-heads').mkdir(parents=True);(journal/'target-plans').mkdir();records=[]
   for kind in ['intent','observed']:
    row={'sequence':len(records),'kind':kind,'previousHash':records[-1]['hash'] if records else '0'*64};row['hash']=p.digest(row);records.append(row)
   (journal/'target.jsonl').write_bytes(b''.join(p.canonical(r)+b'\n' for r in records))
   for i,r in enumerate(records):
    (journal/'target-heads'/('head-'+str(i).zfill(4)+'.json')).write_bytes(p.canonical({'sequence':i,'hash':r['hash']}));(journal/'target-plans'/('record-'+str(i).zfill(4)+'.json')).write_bytes(p.canonical(r))
   def local_read(h,path,uid=0,mode=0o400,limit=262144,json_value=True):
    self.assertFalse(path.is_symlink());self.assertEqual(path.stat().st_nlink,1);raw=path.read_bytes();self.assertLessEqual(len(raw),limit);return(json.loads(raw) if json_value else raw),p.digest(raw)
   h=types.SimpleNamespace(TARGET=root)
   with patch.object(p,'read',side_effect=local_read):
    snapshot,rawhash=p.journal_snapshot(h);self.assertEqual(snapshot['records'],records);self.assertEqual(snapshot['checkpoint'],{'sequence':1,'hash':records[-1]['hash']})
    head=journal/'target-heads/head-0001.json';head.write_bytes(p.canonical({'sequence':1,'hash':'f'*64}))
    with self.assertRaisesRegex(AssertionError,'HEAD'):p.journal_snapshot(h)
    (journal/'target.jsonl.controller.lock').write_text('retained')
    with self.assertRaisesRegex(AssertionError,'BUSY'):p.journal_snapshot(h)
if __name__=='__main__':unittest.main()
