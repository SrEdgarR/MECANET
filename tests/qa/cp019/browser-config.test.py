"""Pure fixtures only: no private files, browser, SQL or host resources."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import unittest


def canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':'), allow_nan=False)


def digest(value):
    return hashlib.sha256(canonical(value).encode('utf-8')).hexdigest()


def uid(n):
    return f'{n:08x}-1111-4111-8111-111111111111'


def fixture():
    password = 'fixture-private-identity-' + 'x' * 25
    source_ids = {'products': [uid(n) for n in range(10, 14)], 'receipts': [uid(14), uid(15)]}
    m = {
        'schema': 'recovery-custody-v1', 'recoveryId': uid(1), 'controllerOwner': uid(2),
        'artifactDigest': 'a' * 64, 'stageOperationIds': {'target-open-a': uid(3)},
        'source': {'project': 'mecanet-qa-p1l3-r03', 'generation': uid(4),
                   'identityPassword': password, 'operationIds': source_ids},
        'target': {'project': 'mecanet-qa-p1l3-r03-target', 'generation': uid(5),
                   'identityPassword': password, 'rolePasswords': {'qa_bootstrap': 'observer-secret'},
                   'operationIds': {'postProduct': uid(16), 'postReceipt': uid(17)}},
    }
    source_end = {'schema': 'source-end-v1', 'recoveryId': uid(6), 'fixtureOnly': True}
    source_resource = {'project': m['source']['project'], 'generation': m['source']['generation']}
    target_resource = {'project': m['target']['project'], 'generation': m['target']['generation'],
                       'systemIdentifier': '1234567890123456789'}
    manifest = {'schema': 'recovery-manifest-v1', 'recoveryId': m['recoveryId'],
                'source': source_resource, 'target': target_resource,
                'provenance': {'verifierSha': 'b' * 40, 'artifactDigest': m['artifactDigest'],
                               'controllerOwner': m['controllerOwner']}}
    anchors = {'custodyHash': digest(m), 'manifestHash': digest(manifest),
               'sourceResourceHash': digest(source_resource), 'targetResourceHash': digest(target_resource)}
    plan = {'schema': 'target-driver-plan-v1', 'sourceSha': 'b' * 40,
            'recoveryId': m['recoveryId'], 'generation': m['target']['generation'],
            'custodyHash': anchors['custodyHash'], 'manifestHash': anchors['manifestHash'],
            'resourceHash': anchors['targetResourceHash'], 'sourceEndProofHash': digest(source_end)}
    base = {'schema': 'target-config-bundle-v1', 'manifest': manifest, 'anchors': anchors,
            'plan': plan, 'planHash': digest(plan), 'sourceEndProof': source_end,
            'proofBundle': {'sourceEndProofHash': digest(source_end)}}
    bindings = {'sourceSha': 'b' * 40, 'custodyHash': digest(m), 'configBundleHash': 'c' * 64,
                'configBundleHeaderHash': 'd' * 64, 'sourceCaptureHash': 'e' * 64}
    historical = []
    for i, operation in enumerate(source_ids['products'] + source_ids['receipts']):
        historical.append({'operationId': operation, 'state': 'CONFIRMED',
                           'productId': uid(100 + (i if i < 4 else 0)),
                           'movementId': None if i < 4 else uid(200 + i),
                           'onHand': '0' if i < 4 else str(i + 1),
                           'balanceVersion': '1' if i < 4 else str(i - 2), 'dataEpoch': '2'})
    h = {'historicalResults': historical, 'oldSessionCookie': '__Host-mecanet-session=fixture-cookie',
         'sourceEpoch': '2', 'sourceGeneration': m['source']['generation']}
    a = {'project': m['target']['project'], 'sourceCommit': bindings['sourceSha'],
         'artifactDigest': m['artifactDigest'], 'systemIdentifier': target_resource['systemIdentifier'],
         'identityPassword': password, 'observer': {'host': 'postgres', 'port': 5432,
             'database': 'postgres', 'user': 'qa_bootstrap', 'password': 'observer-secret',
             'ssl': {'servername': 'postgres', 'rejectUnauthorized': True, 'ca': 'fixture-only'}},
         'generation': m['target']['generation'],
         'recovery': {'mode': 'RECOVERY', 'runId': m['recoveryId'], 'manifestHash': anchors['manifestHash']},
         'operationIds': {**source_ids, **m['target']['operationIds']},
         'sourceEpoch': '2', 'targetEpoch': '3', 'historicalResults': copy.deepcopy(historical),
         'oldSessionCookie': h['oldSessionCookie'], 'sourceEndProofHash': digest(source_end)}
    known = {'product': {'operationId': uid(16), 'state': 'CONFIRMED', 'productId': uid(300),
                        'movementId': None, 'onHand': '0', 'balanceVersion': '1', 'dataEpoch': '3'},
             'receipt': {'operationId': uid(17), 'state': 'CONFIRMED', 'productId': uid(300),
                        'movementId': uid(301), 'onHand': '7', 'balanceVersion': '2', 'dataEpoch': '3'}}
    w = {'schema': 'target-written-results-v1', 'project': a['project'], 'sourceSha': a['sourceCommit'],
         'artifactDigest': a['artifactDigest'], 'generation': a['generation'], 'runId': m['recoveryId'],
         'custodyHash': bindings['custodyHash'], 'configBundleHash': bindings['configBundleHash'],
         'acceptanceHash': digest(a), 'operationIds': m['target']['operationIds'].copy(),
         'knownResults': known, 'payloadHashes': {'product': '1' * 64, 'receipt': '2' * 64}}
    options = {'invocationId': uid(7), 'spkiSha256': 'A' * 43 + '=',
               'caCertificatePath': '.qa-private/cp022-browser-ca.crt',
               'playwrightModule': '.qa-private/browser/node_modules/playwright/index.mjs',
               'browserExecutable': '.qa-private/browsers/chromium-1248/chrome-win64/chrome.exe',
               'outputDirectory': '.qa-private/cp022-browser',
               'assets': [{'path': '/assets/saas-fixture.js', 'sha256': '3' * 64},
                          {'path': '/assets/saas-fixture.css', 'sha256': '4' * 64}]}
    return m, base, bindings, {'acceptance': a, 'sourceHistory': h, 'written': w}, options, 'f' * 64


class BrowserConfigTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location('cp020_browser_config', Path(__file__).with_name('browser-config.py'))
        cls.b = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.b)

    def make(self, args=None):
        return self.b.make_config(*(args or fixture()))

    def reject(self, edit):
        args = list(fixture())
        edit(*args)
        with self.assertRaisesRegex(ValueError, '^BROWSER_[A-Z0-9_]+$'):
            self.make(args)

    def test_exact_config_and_secret_free_reference(self):
        args = fixture()
        snapshot = canonical(args)
        c = self.make(args)
        self.assertEqual(len(c), 24)
        self.assertEqual(c['historicalResults'], args[3]['sourceHistory']['historicalResults'])
        self.assertEqual(c['knownResults'], args[3]['written']['knownResults'])
        self.assertEqual(c['operationIds']['historical'], args[0]['source']['operationIds']['products'] + args[0]['source']['operationIds']['receipts'])
        self.assertEqual(c['identity']['password'], args[0]['target']['identityPassword'])
        r = self.b.make_reference(c)
        self.assertEqual(set(r), {'schema', 'project', 'sourceSha', 'artifactDigest', 'configHash',
                                  'invocationId', 'custodyHash', 'configBundleHash', 'generation', 'runId'})
        self.assertEqual(r['schema'], 'cp020-browser-reference-v1')
        self.assertEqual(r['configHash'], digest(c))
        for secret in ['fixture-cookie', 'observer-secret', c['identity']['password']]:
            self.assertNotIn(secret, canonical(r))
        self.assertNotIn('oldSessionCookie', c)
        self.assertNotIn('observer', c)
        self.assertEqual(canonical(args), snapshot)
        c['historicalResults'][0]['onHand'] = '999'
        self.assertEqual(canonical(args), snapshot)

    def test_manifest_plan_and_custody_hashes_are_checked(self):
        mutations = [lambda m,b,x,v,o,s: x.update(custodyHash='0'*64),
                     lambda m,b,x,v,o,s: b['manifest']['target'].update(systemIdentifier='9876543210123456789'),
                     lambda m,b,x,v,o,s: b['plan'].update(sourceSha='1'*40),
                     lambda m,b,x,v,o,s: b.update(planHash='0'*64),
                     lambda m,b,x,v,o,s: b['sourceEndProof'].update(fixtureOnly=False),
                     lambda m,b,x,v,o,s: x.update(parentFullBundleHash='0'*64)]
        for mutate in mutations:
            with self.subTest(mutation=mutations.index(mutate)):
                self.reject(mutate)

    def test_written_hash_authority_and_context_are_checked(self):
        for key in ['custodyHash','configBundleHash','acceptanceHash','sourceSha','artifactDigest',
                    'generation','runId','project']:
            with self.subTest(key=key):
                self.reject(lambda m,b,x,v,o,s: v['written'].update({key: 'foreign'}))
        self.reject(lambda m,b,x,v,o,s: v['acceptance'].update(identityPassword='foreign-identity-password'))
        self.reject(lambda m,b,x,v,o,s: v['acceptance']['observer'].update(password='foreign-role'))
        self.reject(lambda m,b,x,v,o,s: v['written'].update(payloadHashes={'product':'not-hash','receipt':'2'*64}))

    def test_original_history_and_epochs_cannot_be_substituted(self):
        self.reject(lambda m,b,x,v,o,s: v['sourceHistory'].update(sourceGeneration=uid(99)))
        self.reject(lambda m,b,x,v,o,s: v['acceptance']['historicalResults'][0].update(onHand='3'))
        self.reject(lambda m,b,x,v,o,s: v['sourceHistory'].update(oldSessionCookie='__Host-mecanet-session=foreign'))
        self.reject(lambda m,b,x,v,o,s: v['sourceHistory']['historicalResults'][0].update(dataEpoch='3'))
        self.reject(lambda m,b,x,v,o,s: v['sourceHistory']['historicalResults'][0].update(actor='not-a-dto'))

    def test_result_integer_strings_and_known_stock_shape(self):
        for edit in [lambda v: v['written']['knownResults']['receipt'].update(onHand='8'),
                     lambda v: v['written']['knownResults']['product'].update(movementId=uid(302)),
                     lambda v: v['written']['knownResults']['receipt'].update(productId=uid(303)),
                     lambda v: v['written']['knownResults']['receipt'].update(balanceVersion='9223372036854775808'),
                     lambda v: v['written']['knownResults']['receipt'].update(onHand=7),
                     lambda v: v['written']['knownResults']['product'].update(dataEpoch='2'),
                     lambda v: v['written']['operationIds'].update(postProduct=uid(99))]:
            with self.subTest(index=str(edit)):
                self.reject(lambda m,b,x,v,o,s: edit(v))

    def test_duplicate_or_swapped_operation_ids_rejected(self):
        self.reject(lambda m,b,x,v,o,s: v['acceptance']['operationIds']['products'].__setitem__(0,uid(11)))
        self.reject(lambda m,b,x,v,o,s: v['written']['knownResults']['product'].update(operationId=uid(17)))

    def test_options_are_closed_and_owned_private_paths(self):
        self.reject(lambda m,b,x,v,o,s: o.update(unapproved=True))
        self.reject(lambda m,b,x,v,o,s: o.update(baseUrl='https://foreign.invalid'))
        self.reject(lambda m,b,x,v,o,s: o.update(outputDirectory='.qa-private/another-output'))
        self.reject(lambda m,b,x,v,o,s: o.update(caCertificatePath='../.qa-private/cp022-browser-ca.crt'))
        self.reject(lambda m,b,x,v,o,s: o.update(playwrightModule='C:/foreign/playwright/index.mjs'))
        self.reject(lambda m,b,x,v,o,s: o.update(browserExecutable='.qa-private/browsers/chromium-1248/../foreign.exe'))
        self.reject(lambda m,b,x,v,o,s: o.update(spkiSha256='invalid'))
        args = list(fixture())
        args[4].update(baseUrl='https://app.mecanet.test:18443')
        for name in ['caCertificatePath','playwrightModule','browserExecutable']:
            args[4][name] = 'C:/own-worktree/' + args[4][name]
        self.assertEqual(self.make(args)['baseUrl'], 'https://app.mecanet.test:18443')

    def test_duplicate_assets_paths_and_invalid_hashes_rejected(self):
        self.reject(lambda m,b,x,v,o,s: o['assets'].__setitem__(1,copy.deepcopy(o['assets'][0])))
        self.reject(lambda m,b,x,v,o,s: o['assets'][0].update(path='/assets/../private.js'))
        self.reject(lambda m,b,x,v,o,s: o['assets'][0].update(sha256='invalid'))
        self.reject(lambda m,b,x,v,o,s: o.update(assets=[]))

    def test_reference_revalidates_config_not_arbitrary_dict(self):
        c = self.make()
        c['knownResults']['receipt']['onHand'] = '8'
        with self.assertRaisesRegex(ValueError, '^BROWSER_[A-Z0-9_]+$'):
            self.b.make_reference(c)

    def test_canonical_cross_runtime_values_without_float_or_secret_error(self):
        self.assertEqual(self.b.canonical({'z': True, 'ñ': 'acción', 'a': [None, 7]}),
                         '{"a":[null,7],"z":true,"ñ":"acción"}')
        for value in [float('nan'), 1.0, 9007199254740992, {'secret-token': object()}]:
            with self.assertRaisesRegex(ValueError, '^BROWSER_[A-Z0-9_]+$'):
                self.b.canonical(value)


if __name__ == '__main__':
    unittest.main()
