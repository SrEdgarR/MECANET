"""Pure controller regressions; no Docker, network, files changed or secrets loaded."""
import ast
import pathlib

workspace = pathlib.Path(__file__).resolve().parents[3]
tree = ast.parse((workspace / 'tests/qa/cp014/host.py').read_text())
normalize = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'normalize_labels')
scope = {}
exec(compile(ast.Module(body=[normalize], type_ignores=[]), 'normalize-labels', 'exec'), scope)
record = {'id': 'one', 'name': 'same', 'running': True, 'image': 'pinned', 'project': '', 'service': ''}
absent = {**record, 'project': None, 'service': None}
assert scope['normalize_labels'](record) == scope['normalize_labels'](absent)
for key, value in [('id', 'two'), ('image', 'other'), ('running', False), ('project', 'other'), ('service', 'other')]:
    assert scope['normalize_labels'](record) != scope['normalize_labels']({**absent, key: value}), key
print('PASS: equivalent absent labels; five identity/state/ownership mutations rejected')

class Source:
    def __init__(self, text):
        self.text = text

    def __truediv__(self, _):
        return self

    def read_text(self):
        return self.text

configure = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'configure')
template = (workspace / 'tests/qa/infra/compose.yaml').read_text()
for order in ('data, front', 'front, data'):
    fixture = template.replace('networks: [data, front]', 'networks: [' + order + ']')
    scope = {'ROOT': pathlib.PurePosixPath('/opt/mecanet-qa-p1l1-cp014'), 'PROJECT': 'mecanet-qa-p1l1-cp014', 'source': Source(fixture)}
    for node in configure.body:
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name) and node.targets[0].id == 'probe':
            break
        selected = (isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name) and node.targets[0].id == 'text') or isinstance(node, ast.For)
        if selected:
            exec(compile(ast.Module(body=[node], type_ignores=[]), 'controller-projection', 'exec'), scope)
    text = scope['text']
    assert all(text.count('ipv4_address: 10.77.42.' + n) == 1 for n in ['2', '3', '4'])
    assert 'networks: [front, data]' not in text and 'networks: [data, front]' not in text
    print('PASS: canonical configure ' + order + ' -> web.2/api1.3/api2.4')
