"""Required real Linux AF_UNIX transport test, never replaced by a TCP fallback.
Windows without AF_UNIX cannot execute this suite: NOT VERIFIED, no silent skip.
Identity and persistence in this transport fixture are synthetic; production
SO_PEERCRED/CID and Root fsync remain separate physical acceptance properties.
"""
import hashlib,importlib.util,json,os,pathlib,shutil,socket,subprocess,sys,tempfile,unittest
P=pathlib.Path(__file__).resolve();spec=importlib.util.spec_from_file_location('cp024_broker_fixture',P.with_name('continuation-broker.test.py'));fixture_module=importlib.util.module_from_spec(spec);spec.loader.exec_module(fixture_module)
b=fixture_module.b;fixture=fixture_module.fixture;register=fixture_module.register;request=fixture_module.request
def kernel_fixture():
 store=fixture_module.MemoryStore();identity={'pid':os.getpid(),'procStart':b.proc_start(os.getpid())}
 broker=b.Broker(fixture_module.f.m,fixture_module.context(),store,store.read(),lambda:fixture_module.f.NOW,lambda record,peer:b.proc_start(peer[0]) if peer[1:]==(os.getuid(),os.getgid()) else False,identity)
 return store,broker
class UnixTransport(unittest.TestCase):
 def test_real_local_af_unix_with_two_child_processes(self):
  store,broker=fixture();register(broker,'one');register(broker,'two')
  with tempfile.TemporaryDirectory(prefix='mq-') as d:
   path=pathlib.Path(d)/'b.sock';server=b.UnixServer(broker,path,peer_credentials=lambda connection:(123,999,999));server.start()
   code="import json,socket,sys; s=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM); s.connect(sys.argv[1]); f=s.makefile('rwb',buffering=0); base=json.loads(sys.argv[2]); methods=[('enroll',None,None,None),('enter','source-close-b',None,None)]+[('charge',None,'sql',1)]*10; result=None\nfor n,(method,name,kind,amount) in enumerate(methods,1):\n req={**base,'sequence':n,'method':method,'name':name,'kind':kind,'amount':amount};f.write((json.dumps(req)+'\\n').encode());result=json.loads(f.readline());assert result['sequence']==n\nprint(result['state']['total']['sql']);f.close();s.close()"
   children=[subprocess.Popen([sys.executable,'-c',code,str(path),json.dumps(request(name,1,'enroll'))],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for name in ['one','two']]
   try:
    for child in children:
     stdout,stderr=child.communicate(timeout=10);self.assertEqual(child.returncode,0,stderr);self.assertTrue(stdout.strip().isdigit())
    self.assertEqual(store.read()['total']['sql'],20);self.assertIsNone(broker.failure);self.assertTrue(server.clients_finished())
   finally:
    result=server.stop();self.assertTrue(result['serverThreadEnded'])
 def test_kernel_peer_credentials_and_two_actual_node_clients(self):
  store,broker=kernel_fixture();register(broker,'one');register(broker,'two');node=shutil.which('node');self.assertIsNotNone(node,'Node required for cross-language transport')
  context=fixture_module.context();context['baseLedger']=context['baseLedger'].decode()
  with tempfile.TemporaryDirectory(prefix='mq-node-') as d:
   path=pathlib.Path(d)/'b.sock';server=b.UnixServer(broker,path);server.start()
   code="import {createConnection} from 'node:net';const {newBrokerLedger}=await import(process.argv[1]);const config=JSON.parse(process.argv[3]);const ledger=await newBrokerLedger({scenario:'source-window',continuation:config.context,env:{QA_BUDGET_ATTEMPT:'v2',QA_BUDGET_SOCKET:'/run/qa-budget/counter.sock',QA_BUDGET_CLIENT:config.client,QA_BUDGET_ROOT_PID:config.rootPid},clock:()=>config.now,connect:()=>createConnection({path:process.argv[2]})});await ledger.enter('source-close-b');for(let i=0;i<10;i++)await ledger.charge('sql');console.log((await ledger.snapshot()).total.sql);"
   environment={k:v for k,v in os.environ.items() if k in ['PATH','HOME','TMPDIR','LANG','LC_ALL']}
   children=[subprocess.Popen([node,'--input-type=module','-e',code,P.with_name('continuation-broker.mjs').as_uri(),str(path),json.dumps({'context':context,'client':name,'rootPid':str(os.getpid()),'now':fixture_module.f.NOW})],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=environment) for name in ['one','two']]
   try:
    for child in children:
     stdout,stderr=child.communicate(timeout=10);self.assertEqual(child.returncode,0,stderr);self.assertTrue(stdout.strip().isdigit())
    self.assertEqual(store.read()['total']['sql'],20);self.assertIsNone(broker.failure);self.assertTrue(all(c['peer'][1:]==(os.getuid(),os.getgid()) and c['pidToken'].isdigit() for c in broker.clients.values()));self.assertTrue(server.clients_finished())
   finally:
    result=server.stop();self.assertTrue(result['serverThreadEnded']);self.assertIsNone(result['failure'])
if __name__=='__main__':
 if not hasattr(socket,'AF_UNIX'):raise SystemExit('NOT VERIFIED: AF_UNIX unavailable; run required Linux transport suite in isolated CI')
 unittest.main()
