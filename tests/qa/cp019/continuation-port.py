"""Reuse the existing 135-case HostPort after one admitted v2 publication.

No new recovery implementation, SQL program or retry loop. The owning Root
runner must still supply its validated Environment Gate, monitor, stdin relay,
browser bridge and emergency finally/cleanup before calling execute(port).
"""
import hashlib,json,pathlib,re
ROOT=pathlib.Path('/opt/mecanet-qa-p1l3-r03');BASE=ROOT/'master/continuations/v2'
def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
def digest(value):return hashlib.sha256(value if isinstance(value,bytes) else canonical(value)).hexdigest()
def check(ok,label):
 if not ok:raise AssertionError(label)

def make_port(controller,session,step,browser,browser_postcheck,environment,publication):
 h=session['host'];claim=session['claim'];check(session.get('postgresStarted') is False and session.get('sql')==session.get('http')==0 and h.CONTINUATION_EFFECT_RECEIPT is claim and h.CONTINUATION_BROKER is session['broker'],'CONTINUATION_PORT_SESSION')
 check(isinstance(environment,dict) and environment.get('schema')=='cp024-environment-gate-v1' and environment.get('status')=='PASS' and environment.get('project')==h.ROOT.name and environment.get('sourceContainerId')==claim.context['admission']['sourceContainerId'] and digest(environment)==claim.body['gateEvidencePins']['environment'],'CONTINUATION_PORT_ENVIRONMENT')
 actions=[]
 class Trace:
  def __getattr__(self,name):return lambda *args:actions.append((name,args))
 controller.execute(Trace());check(actions and actions[0][0]=='preflight','CONTINUATION_PROGRAM_REQUIRED');method_names={row[0] for row in actions}
 class ContinuationPort(controller.HostPort):
  def __init__(self):super().__init__(h,step,browser,browser_postcheck);self.session=session;self.action_cursor=0
  def __getattribute__(self,name):
   value=super().__getattribute__(name)
   if name not in method_names:return value
   def action(*args,**kwargs):
    try:
     cursor=self.action_cursor;check(not kwargs and cursor<len(actions) and actions[cursor]==(name,args),'CONTINUATION_PROGRAM_ORDER');claim.check_live();result=value(*args);self.action_cursor=cursor+1;return result
    except BaseException:
     claim.fail('CONTINUATION_PROGRAM_UNCERTAIN');h.CONTINUATION_BROKER.fail('CONTINUATION_PROGRAM_UNCERTAIN');raise
   return action
  def frontier(self,label,result):
   name=label.lower().replace('_','-')+'-'+str(self.action_cursor+1).zfill(3);check(re.fullmatch('[a-z][a-z0-9-]{0,63}',name),'CONTINUATION_FRONTIER_LABEL')
   return claim.boundary(h,name,result,'PASS',lambda selected,raw:publication.exclusive_file(BASE/'frontiers'/(selected+'.json'),raw,0o400))
  def perform(self,name,fn):
   def effect():
    claim.check_live();check(claim.effect_ready,'CONTINUATION_PORT_TRANSPORT');result=fn();self.frontier(name,result);return result
   return self.step(name,effect)
  def preflight(self):
   def verify():
    h.own();h.own(h.TARGET);h.preserve();check(claim.effect_ready,'CONTINUATION_PORT_TRANSPORT');current=h.facts();own=[c for c in current if c.get('project') in [h.ROOT.name,h.TARGET.name]];check(len(own)==1,'CONTINUATION_PORT_OLD_WRITERS');c=own[0];a=claim.context['admission'];check(all(c[k]==v for k,v in {'id':a['sourceContainerId'],'ownerId':a['sourceOwnerId'],'running':False,'pid':0,'status':'exited','exitCode':0,'finishedAt':a['sourceFinishedAt']}.items()),'CONTINUATION_PORT_SOURCE_FIN');h.read_source_service_reference(c);h.set_host_case('host-bootstrap');return {'environmentHash':digest(environment),'currentResourcePrerequisites':h.resources(),'acceptance':'NOT VERIFIED'}
   return self.perform('continuation-preflight',verify)
  def bootstrap(self):
   return self.perform('continuation-bootstrap',lambda:{'exclusiveClaimHash':digest(claim.body),'originalRootsReused':True,'secretsRegenerated':False})
  def stage(self):
   def verify():
    h.set_host_case('host-stage');plan,ph=h.target_bridge().read400(BASE/'publication-plan.json',0);check(plan==session['plan'] and ph==claim.body['publicationPlanHash'],'CONTINUATION_PORT_PUBLICATION_PLAN');manifest=json.loads((h.runtime_directory()/'artifact.json').read_bytes());h.validate_runtime_artifact(manifest,h.material_owned());return {'effectiveArtifact':manifest['digest'],'sourceSha':manifest['sourceSha'],'publicationPlanHash':ph,'stagedAgain':False}
   return self.perform('continuation-stage',verify)
  def material(self):
   def verify():
    h.set_host_case('host-material');check(digest((h.ROOT/'master/material.json').read_bytes())==publication.MATERIAL,'CONTINUATION_PORT_MATERIAL');h.material_owned();return {'originalMaterialHash':publication.MATERIAL,'materialSelectedAgain':False}
   return self.perform('continuation-material',verify)
  def configs(self):
   def verify():
    rows=[]
    for root,name,key in [(h.ROOT,'source-compose.json','sourceComposeHash'),(h.TARGET,'target-compose.json','targetComposeHash')]:
     h.set_host_case('host-config-source' if root==h.ROOT else 'host-config-target');raw=publication.private_raw(root/'compose.json');check(digest(raw)==session['plan'][key],'CONTINUATION_PORT_ORIGINAL_COMPOSE');new,_=h.target_bridge().read_private(BASE/name,0,262144,0o600);expected=h.derive_continuation_compose(json.loads(raw));check(new==expected and new['services']['postgres']==json.loads(raw)['services']['postgres'],'CONTINUATION_PORT_DERIVED_COMPOSE');rows.append({'project':root.name,'hash':digest(new)})
    return {'bindings':rows,'originalsModified':False,'tlsRegenerated':False}
   return self.perform('continuation-configs',verify)
  def source_pg_start(self):
   def restart():
    h.set_host_case('host-pg-start');h.own();h.preserve();a=claim.context['admission'];c=h.inspect_container(a['sourceContainerId']);check(all(c[k]==v for k,v in {'ownerId':a['sourceOwnerId'],'status':'exited','running':False,'pid':0,'exitCode':0,'finishedAt':a['sourceFinishedAt']}.items()),'CONTINUATION_PORT_SOURCE_CHANGED');check(not any(x['running'] and x.get('project') in [h.ROOT.name,h.TARGET.name] for x in h.facts()),'CONTINUATION_PORT_PRIOR_ACTIVE');self.frontier('source-pg-reentry-before',{'source':c,'systemIdentifier':a['sourceSystemIdentifier']});h.start_source_service(c,h.expected_owners(),restart=True);h.wait_pg_ready(c['id']);raw=h.run('docker','exec',c['id'],'pg_controldata','/var/lib/postgresql/18/docker');sid=next(row.split(':',1)[1].strip() for row in raw.splitlines() if row.startswith('Database system identifier:'));check(sid==a['sourceSystemIdentifier']==(h.ROOT/'evidence/system-id').read_text().strip(),'CONTINUATION_PORT_SYSTEM_IDENTIFIER');after=h.inspect_container(c['id']);check(after['running'] is True and after['pid']>0 and after['status']=='running','CONTINUATION_PORT_PG_START_UNKNOWN');return {'postgresContainer':c['id'],'systemIdentifier':sid,'after':after,'oldSystemIdRewritten':False,'newPgCluster':False,**h.preserve()}
   return self.perform('source-pg-reentry',restart)
  def empty_stop(self,kind):
   # The legacy alias calls self.empty_runtime. Dispatch its existing method
   # directly so one approved outer action does not become a second action.
   return controller.HostPort.empty_runtime(self,kind,'stop')
 return ContinuationPort()
