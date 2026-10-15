"""Passive CP020 browser config builder; Root owns all private I/O and custody.

This module validates the cross-file bindings already read through Root's 0400
readers. It neither opens files nor invents results, IDs, passwords or end proofs.
The reduced bundle cannot reproduce its full hash: that hash remains an external
binding, checked against the original target-written receipt. Validation here is
not physical acceptance of the cluster, TLS, paths or GUI.
"""
import copy
import hashlib
import json
import re

PROJECT = 'mecanet-qa-p1l3-r03-target'
SOURCE = 'mecanet-qa-p1l3-r03'
BASE_URL = 'https://app.mecanet.test:18443'
UUID = re.compile(r'[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\Z')
HASH = re.compile(r'[0-9a-f]{64}\Z')
SHA = re.compile(r'[0-9a-f]{40}\Z')
MAX_BIGINT = 9223372036854775807
CONFIG_KEYS = set('schema project mode sourceSha artifactDigest custodyHash configBundleHash manifestHash sourceEndProofHash acceptanceSourceHash invocationId generation runId baseUrl spkiSha256 caCertificatePath playwrightModule browserExecutable outputDirectory identity operationIds historicalResults knownResults assets'.split())
RESULT_KEYS = set('operationId state productId movementId onHand balanceVersion dataEpoch'.split())
WRITTEN_KEYS = set('schema project sourceSha artifactDigest generation runId custodyHash configBundleHash acceptanceHash operationIds knownResults payloadHashes'.split())


def require(ok, code):
    if not ok:
        raise ValueError(code)


def match(regex, value):
    return isinstance(value, str) and regex.fullmatch(value) is not None


def exact(value, keys, code):
    require(type(value) is dict and set(value) == set(keys), code)


def canonical(value):
    """The protocol's JSON canonical form for fixture JSON, with lossless strings.

    Reject floats and unsafe numeric values rather than silently hashing Python
    and JavaScript representations differently. Versions/counters remain strings.
    Keys use JavaScript's UTF-16 ordering; dictionary values are never logged.
    """
    def normalize(x):
        if x is None or type(x) is bool or type(x) is str:
            return x
        if type(x) is int and abs(x) <= 9007199254740991:
            return x
        if type(x) is list or type(x) is tuple:
            return [normalize(item) for item in x]
        if type(x) is dict and all(type(k) is str for k in x):
            return {k: normalize(x[k]) for k in sorted(x, key=lambda key: key.encode('utf-16-be'))}
        raise ValueError('BROWSER_CANONICAL_VALUE')
    try:
        text = json.dumps(normalize(value), ensure_ascii=False, separators=(',', ':'), allow_nan=False)
        text.encode('utf-8')
        return text
    except (TypeError, UnicodeError, OverflowError):
        raise ValueError('BROWSER_CANONICAL_VALUE') from None


def sha256(value):
    return hashlib.sha256(canonical(value).encode('utf-8')).hexdigest()


def same(a, b):
    return canonical(a) == canonical(b)


def decimal(value, positive=False):
    return (isinstance(value, str) and re.fullmatch(r'(0|[1-9][0-9]{0,18})', value) is not None
            and int(value) <= MAX_BIGINT and (not positive or value != '0'))


def confirmed(result, operation, epoch):
    exact(result, RESULT_KEYS, 'BROWSER_RESULT_PROVENANCE')
    require(result['operationId'] == operation and result['state'] == 'CONFIRMED'
            and match(UUID, result['productId'])
            and (result['movementId'] is None or match(UUID, result['movementId']))
            and decimal(result['onHand']) and decimal(result['balanceVersion'], positive=True)
            and result['dataEpoch'] == epoch, 'BROWSER_RESULT_PROVENANCE')


def private_path(value, suffix):
    require(isinstance(value, str) and 0 < len(value) <= 512 and not re.search(r'[\r\n\x00]', value),
            'BROWSER_PRIVATE_PATH')
    # This is lexical validation only. The browser performs realpath/symlink and
    # own-worktree containment checks before loading these three actual files.
    p = value.replace('\\', '/')
    require('//' not in p and all(part not in ['.', '..'] for part in p.split('/')),
            'BROWSER_PRIVATE_PATH')
    require(p == suffix or p.endswith('/' + suffix), 'BROWSER_PRIVATE_PATH')
    prefix = p[:-len(suffix)]
    require(not prefix or prefix.startswith('/') or re.match(r'^[A-Za-z]:/', prefix) is not None,
            'BROWSER_PRIVATE_PATH')
    return value


def validate_config(c):
    exact(c, CONFIG_KEYS, 'BROWSER_CONFIG_BINDING')
    require(c['schema'] == 'cp020-browser-config-v1' and c['project'] == PROJECT
            and c['mode'] == 'replay-known' and c['baseUrl'] == BASE_URL
            and match(SHA, c['sourceSha']), 'BROWSER_CONFIG_BINDING')
    require(all(match(HASH, c[k]) for k in ['artifactDigest', 'custodyHash', 'configBundleHash',
                'manifestHash', 'sourceEndProofHash', 'acceptanceSourceHash'])
            and all(match(UUID, c[k]) for k in ['invocationId', 'generation', 'runId'])
            and isinstance(c['spkiSha256'], str)
            and re.fullmatch(r'[A-Za-z0-9+/]{43}=', c['spkiSha256']) is not None, 'BROWSER_CONFIG_BINDING')
    exact(c['identity'], ['email', 'password'], 'BROWSER_IDENTITY')
    require(c['identity']['email'] == 'a@qa.invalid' and isinstance(c['identity']['password'], str)
            and len(c['identity']['password']) >= 20 and not re.search(r'[\r\n\x00]', c['identity']['password']),
            'BROWSER_IDENTITY')
    ids = c['operationIds']
    exact(ids, ['historical', 'postProduct', 'postReceipt'], 'BROWSER_OPERATION_IDS')
    require(type(ids['historical']) is list and len(ids['historical']) == 6, 'BROWSER_OPERATION_IDS')
    all_ids = ids['historical'] + [ids['postProduct'], ids['postReceipt']]
    require(all(match(UUID, i) for i in all_ids) and len(set(all_ids)) == 8, 'BROWSER_OPERATION_IDS')
    require(type(c['historicalResults']) is list and len(c['historicalResults']) == 6, 'BROWSER_RESULT_PROVENANCE')
    for result, operation in zip(c['historicalResults'], ids['historical']):
        confirmed(result, operation, '2')
    known = c['knownResults']
    exact(known, ['product', 'receipt'], 'BROWSER_RESULT_PROVENANCE')
    confirmed(known['product'], ids['postProduct'], '3')
    confirmed(known['receipt'], ids['postReceipt'], '3')
    require(known['product']['productId'] == known['receipt']['productId']
            and known['product']['movementId'] is None and known['receipt']['movementId'] is not None
            and known['product']['onHand'] == '0' and known['product']['balanceVersion'] == '1'
            and known['receipt']['onHand'] == '7' and known['receipt']['balanceVersion'] == '2',
            'BROWSER_RESULT_PROVENANCE')
    assets = c['assets']
    require(type(assets) is list and 2 <= len(assets) <= 8, 'BROWSER_ASSET_MANIFEST')
    for asset in assets:
        exact(asset, ['path', 'sha256'], 'BROWSER_ASSET_MANIFEST')
        require(isinstance(asset['path'], str) and re.fullmatch(r'/assets/[A-Za-z0-9._-]+\.(js|css)', asset['path'])
                and match(HASH, asset['sha256']), 'BROWSER_ASSET_MANIFEST')
    require(len({a['path'] for a in assets}) == len(assets), 'BROWSER_ASSET_MANIFEST')
    for key, suffix in [('caCertificatePath', '.qa-private/cp022-browser-ca.crt'),
                        ('playwrightModule', '.qa-private/browser/node_modules/playwright/index.mjs'),
                        ('browserExecutable', '.qa-private/browsers/chromium-1248/chrome-win64/chrome.exe')]:
        private_path(c[key], suffix)
    require(c['outputDirectory'] == '.qa-private/cp022-browser', 'BROWSER_PRIVATE_OUTPUT')
    require(len(canonical(c).encode('utf-8')) <= 262144, 'BROWSER_CONFIG_SIZE')
    return c


def make_config(material, base, bindings, values, options, acceptance_source_hash):
    """Derive the 24-key GUI config from original private contexts and receipts.

    Root must authenticate custody, private files and the reduced bundle's header
    before calling. The external full hash is compared, never synthesized from
    `base`; cookies and observer credentials remain outside the returned config.
    """
    try:
        return _make_config(material, base, bindings, values, options, acceptance_source_hash)
    except (KeyError, TypeError, AttributeError, IndexError):
        raise ValueError('BROWSER_INPUT_BINDING') from None


def _make_config(m, b, bindings, values, options, source_hash):
    exact(m, ['schema', 'recoveryId', 'controllerOwner', 'artifactDigest', 'stageOperationIds', 'source', 'target'],
          'BROWSER_CUSTODY_BINDING')
    require(m['schema'] == 'recovery-custody-v1' and m['source']['project'] == SOURCE
            and m['target']['project'] == PROJECT and match(UUID, m['recoveryId'])
            and match(UUID, m['controllerOwner']) and match(UUID, m['source']['generation'])
            and match(UUID, m['target']['generation']) and m['source']['generation'] != m['target']['generation']
            and match(HASH, m['artifactDigest'])
            and m['source']['identityPassword'] == m['target']['identityPassword'], 'BROWSER_CUSTODY_BINDING')
    custody_hash = sha256(m)
    require(type(bindings) is dict and bindings.get('custodyHash') == custody_hash
            and match(HASH, bindings.get('configBundleHash')) and match(SHA, bindings.get('sourceSha')),
            'BROWSER_CUSTODY_BINDING')
    if 'parentFullBundleHash' in bindings:
        require(bindings['parentFullBundleHash'] == bindings['configBundleHash'], 'BROWSER_FULL_BUNDLE_BINDING')
    require(b['schema'] == 'target-config-bundle-v1' and b['anchors']['custodyHash'] == custody_hash
            and b['anchors']['manifestHash'] == sha256(b['manifest'])
            and b['anchors']['sourceResourceHash'] == sha256(b['manifest']['source'])
            and b['anchors']['targetResourceHash'] == sha256(b['manifest']['target'])
            and b['proofBundle']['sourceEndProofHash'] == sha256(b['sourceEndProof'])
            and b['planHash'] == sha256(b['plan']), 'BROWSER_BUNDLE_BINDING')
    manifest, plan = b['manifest'], b['plan']
    require(manifest['schema'] == 'recovery-manifest-v1' and manifest['recoveryId'] == m['recoveryId']
            and manifest['source']['project'] == SOURCE
            and manifest['source']['generation'] == m['source']['generation']
            and manifest['target']['project'] == PROJECT
            and manifest['target']['generation'] == m['target']['generation']
            and re.fullmatch(r'[0-9]{10,24}', manifest['target']['systemIdentifier']) is not None
            and manifest['provenance']['verifierSha'] == bindings['sourceSha']
            and manifest['provenance']['artifactDigest'] == m['artifactDigest']
            and manifest['provenance']['controllerOwner'] == m['controllerOwner'], 'BROWSER_MANIFEST_BINDING')
    require(plan['schema'] == 'target-driver-plan-v1' and plan['sourceSha'] == bindings['sourceSha']
            and plan['recoveryId'] == m['recoveryId'] and plan['generation'] == m['target']['generation']
            and plan['custodyHash'] == custody_hash and plan['manifestHash'] == b['anchors']['manifestHash']
            and plan['resourceHash'] == b['anchors']['targetResourceHash']
            and plan['sourceEndProofHash'] == b['proofBundle']['sourceEndProofHash'], 'BROWSER_PLAN_BINDING')
    exact(values, ['acceptance', 'sourceHistory', 'written'], 'BROWSER_ORIGINAL_RECORDS')
    a, h, w = values['acceptance'], values['sourceHistory'], values['written']
    exact(h, ['historicalResults', 'oldSessionCookie', 'sourceEpoch', 'sourceGeneration'], 'BROWSER_HISTORY_BINDING')
    require(h['sourceEpoch'] == '2' and h['sourceGeneration'] == m['source']['generation']
            and isinstance(h['oldSessionCookie'], str) and h['oldSessionCookie'].startswith('__Host-mecanet-session=')
            and not re.search(r'[\r\n\x00]', h['oldSessionCookie']), 'BROWSER_HISTORY_BINDING')
    exact(a, ['project', 'sourceCommit', 'artifactDigest', 'systemIdentifier', 'identityPassword', 'observer',
              'generation', 'recovery', 'operationIds', 'sourceEpoch', 'targetEpoch', 'historicalResults',
              'oldSessionCookie', 'sourceEndProofHash'], 'BROWSER_ACCEPTANCE_BINDING')
    require(a['project'] == PROJECT and a['sourceCommit'] == bindings['sourceSha']
            and a['artifactDigest'] == m['artifactDigest'] and a['generation'] == m['target']['generation']
            and a['systemIdentifier'] == manifest['target']['systemIdentifier']
            and a['identityPassword'] == m['target']['identityPassword']
            and a['sourceEpoch'] == '2' and a['targetEpoch'] == '3'
            and same(a['historicalResults'], h['historicalResults']) and a['oldSessionCookie'] == h['oldSessionCookie']
            and a['sourceEndProofHash'] == b['proofBundle']['sourceEndProofHash'], 'BROWSER_ACCEPTANCE_BINDING')
    exact(a['recovery'], ['mode', 'runId', 'manifestHash'], 'BROWSER_ACCEPTANCE_BINDING')
    require(a['recovery'] == {'mode': 'RECOVERY', 'runId': m['recoveryId'], 'manifestHash': b['anchors']['manifestHash']},
            'BROWSER_ACCEPTANCE_BINDING')
    observer = a['observer']
    require(observer['host'] == 'postgres' and observer['port'] == 5432 and observer['database'] == 'postgres'
            and observer['user'] == 'qa_bootstrap' and observer['ssl']['servername'] == 'postgres'
            and observer['ssl']['rejectUnauthorized'] is True
            and observer['password'] == m['target']['rolePasswords']['qa_bootstrap'], 'BROWSER_OBSERVER_BINDING')
    exact(a['operationIds'], ['products', 'receipts', 'postProduct', 'postReceipt'], 'BROWSER_OPERATION_IDS')
    products, receipts = m['source']['operationIds']['products'], m['source']['operationIds']['receipts']
    require(type(products) is list and len(products) == 4 and type(receipts) is list and len(receipts) == 2
            and same(a['operationIds']['products'], products) and same(a['operationIds']['receipts'], receipts)
            and all(a['operationIds'][k] == m['target']['operationIds'][k] for k in ['postProduct', 'postReceipt']),
            'BROWSER_OPERATION_IDS')
    exact(w, WRITTEN_KEYS, 'BROWSER_WRITTEN_BINDING')
    expected = {'schema': 'target-written-results-v1', 'project': PROJECT, 'sourceSha': bindings['sourceSha'],
                'artifactDigest': m['artifactDigest'], 'generation': m['target']['generation'], 'runId': m['recoveryId'],
                'custodyHash': custody_hash, 'configBundleHash': bindings['configBundleHash'], 'acceptanceHash': sha256(a)}
    require(all(w[k] == value for k, value in expected.items()), 'BROWSER_WRITTEN_BINDING')
    exact(w['operationIds'], ['postProduct', 'postReceipt'], 'BROWSER_WRITTEN_BINDING')
    require(all(w['operationIds'][k] == a['operationIds'][k] for k in w['operationIds']), 'BROWSER_WRITTEN_BINDING')
    exact(w['payloadHashes'], ['product', 'receipt'], 'BROWSER_WRITTEN_BINDING')
    require(all(match(HASH, value) for value in w['payloadHashes'].values()), 'BROWSER_WRITTEN_BINDING')
    # These optional external hashes strengthen Root's authenticated-file inputs.
    # Payload bodies are parsed by the browser from acceptance_source_hash, never
    # maintained as a second literal oracle in this builder.
    for key, value in [('acceptanceHash', a), ('sourceHistoryHash', h), ('targetWrittenHash', w)]:
        if key in bindings:
            require(bindings[key] == sha256(value), 'BROWSER_ORIGINAL_HASH_BINDING')
    required_options = {'invocationId', 'spkiSha256', 'caCertificatePath', 'playwrightModule',
                        'browserExecutable', 'outputDirectory', 'assets'}
    require(type(options) is dict and required_options <= set(options)
            and set(options) <= required_options | {'baseUrl'}
            and options.get('baseUrl', BASE_URL) == BASE_URL, 'BROWSER_OPTIONS_BINDING')
    require(match(HASH, source_hash), 'BROWSER_ACCEPTANCE_SOURCE')
    c = {'schema': 'cp020-browser-config-v1', 'project': PROJECT, 'mode': 'replay-known',
         'sourceSha': bindings['sourceSha'], 'artifactDigest': m['artifactDigest'], 'custodyHash': custody_hash,
         'configBundleHash': bindings['configBundleHash'], 'manifestHash': b['anchors']['manifestHash'],
         'sourceEndProofHash': b['proofBundle']['sourceEndProofHash'], 'acceptanceSourceHash': source_hash,
         'generation': m['target']['generation'], 'runId': m['recoveryId'], 'baseUrl': BASE_URL,
         'identity': {'email': 'a@qa.invalid', 'password': m['target']['identityPassword']},
         'operationIds': {'historical': products + receipts, 'postProduct': w['operationIds']['postProduct'],
                          'postReceipt': w['operationIds']['postReceipt']},
         'historicalResults': h['historicalResults'], 'knownResults': w['knownResults'],
         **{key: options[key] for key in required_options}}
    return copy.deepcopy(validate_config(c))


def make_reference(config):
    """Root-only metadata reference; contains no session, password or SQL config."""
    c = validate_config(config)
    return {'schema': 'cp020-browser-reference-v1', 'project': c['project'], 'sourceSha': c['sourceSha'],
            'artifactDigest': c['artifactDigest'], 'configHash': sha256(c), 'invocationId': c['invocationId'],
            'custodyHash': c['custodyHash'], 'configBundleHash': c['configBundleHash'],
            'generation': c['generation'], 'runId': c['runId']}
