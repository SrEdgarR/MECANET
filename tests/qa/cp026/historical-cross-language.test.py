"""Identical debt interpretation in Root, Node ACK reader and outer gate."""
import copy,importlib.util,json,os,pathlib,subprocess,unittest
QA=pathlib.Path(__file__).resolve().parents[1]/'cp019';ROOT=QA.parents[2]
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
f=load('cp026_cross_fixtures',QA/'continuation-budget.test.py');outer=load('cp026_cross_outer',QA/'continuation-runner.py')
class CrossLanguage(unittest.TestCase):
 def test_frozen_parent_and_known_case_debt_match_all_consumers(self):
  state=f.fresh();python=f.m.validate_creation_upper(state);self.assertEqual(outer.HISTORICAL_CREATION_CASE,python['knownCaseUpper']);self.assertEqual(outer.HISTORICAL_CREATION_PARENT,python['baseLedgerHash'])
  script="import{validateCreationUpper}from'./tests/qa/cp019/continuation-budget.mjs';let s='';for await(const c of process.stdin)s+=c;process.stdout.write(JSON.stringify(validateCreationUpper(JSON.parse(s))));"
  actual=subprocess.check_output([os.environ.get('QA_NODE_RUNTIME','node'),'--input-type=module','-e',script],input=json.dumps(state).encode(),cwd=ROOT,timeout=10);self.assertEqual(json.loads(actual),python)
if __name__=='__main__':unittest.main()
