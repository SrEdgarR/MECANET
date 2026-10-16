"""Finite prefix debt guard; models only, never changes the historical ledger."""
import copy,importlib.util,pathlib,unittest
QA=pathlib.Path(__file__).resolve().parents[1]/'cp019'
def load(name,path):
 s=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
f=load('cp026_history_fixtures',QA/'continuation-budget.test.py')
class HistoricalCreations(unittest.TestCase):
 def test_fixed_debt_is_separate_from_all_historical_totals(self):
  state=f.fresh();before=copy.deepcopy(state);proof=f.m.creation_upper(state)
  self.assertEqual(proof['historicalUpper'],302);self.assertEqual(proof['knownHistoricalUpper'],300);self.assertEqual(proof['unknownHistoricalUpper'],2);self.assertEqual(proof['physicalArtifactsUpper'],941);self.assertEqual(state,before);self.assertEqual(sum(proof['knownCaseUpper'].values()),300)
 def test_global_debt_is_reserved_once_without_fictitious_case(self):
  state=f.fresh();state['total']['artifactFiles']=7890
  self.assertEqual(f.m.validate_creation_upper(state)['physicalArtifactsUpper'],8192)
  state['total']['artifactFiles']+=1
  with self.assertRaisesRegex(AssertionError,'HISTORICAL_CREATION_GLOBAL'):f.m.validate_creation_upper(state)
 def test_unknown_two_are_marginal_for_each_case_never_reassigned(self):
  state=f.fresh();state['scenarios']['host-stage']['total']['artifactFiles']=1826;self.assertEqual(f.m.validate_creation_upper(state)['casePhysicalUpper']['host-stage'],2000)
  state['scenarios']['host-stage']['total']['artifactFiles']+=1
  with self.assertRaisesRegex(AssertionError,'HISTORICAL_CREATION_CASE'):f.m.validate_creation_upper(state)
 def test_unaccredited_parent_hash_fails_closed(self):
  state=f.fresh();state['parentLedgerHash']='a'*64
  with self.assertRaisesRegex(AssertionError,'HISTORICAL_CREATION_PARENT'):f.m.creation_upper(state)
if __name__=='__main__':unittest.main()
