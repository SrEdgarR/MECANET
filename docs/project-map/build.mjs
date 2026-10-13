// Local documentation only. No connection to Mecanet, MongoDB or providers.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const sourceNames = ['docs/PROJECT_STATE.md', 'docs/ROADMAP.md', 'docs/DECISIONS.md',
  'docs/TECH_DEBT.md', 'docs/CHECKPOINTS.md', '.agentic/PLANNING_STATE.md', '.agentic/METHODOLOGY_FEEDBACK.md'];
const source = Object.fromEntries(await Promise.all(sourceNames.map(async name => [name, await readFile(path.join(root, name), 'utf8')])));
const rows = (name, prefix) => source[name].split(/\r?\n/).filter(line => line.startsWith('| ' + prefix))
  .map(line => line.split('|').slice(1, -1).map(value => value.trim()));
function sectionTable(name, heading) {
  const section = source[name].split('## ' + heading + '\n')[1]?.split('\n## ')[0];
  if (!section) throw new Error('Missing source section: ' + heading);
  return Object.fromEntries(section.split(/\r?\n/).filter(line => /^\| [a-zA-Z_]+ \|/.test(line) && !line.startsWith('| Campo'))
    .map(line => line.split('|').slice(1,-1).map(value=>value.trim())));
}
const phases = rows('docs/ROADMAP.md','P').filter(row => /^P\d+$/.test(row[0]) && row.length === 9)
  .map(([id,name,status,dependencies,summary,closure,blockers,evidence,document]) => ({id,name,status,dependencies,summary,closure,blockers,evidence,document}));
const data = {
  schema_version: 1,
  ...sectionTable('docs/PROJECT_STATE.md', 'Estado global'),
  progress_percent: null,
  trace: sectionTable('docs/PROJECT_STATE.md', 'Trazabilidad'),
  readiness: rows('docs/PROJECT_STATE.md','R-').map(([id,name,status,evidence])=>({id,name,status,evidence})),
  phases,
  subgates: rows('docs/ROADMAP.md','P').filter(row=>row.length===5).map(([phase,id,name,status,criterion])=>({phase,id,name,status,criterion})),
  screens: rows('docs/PROJECT_STATE.md','UI-').map(([id,name,fidelity,verification,preview,evidence])=>({id,name,fidelity,verification,preview,evidence})),
  decisions: source['docs/DECISIONS.md'].split(/(?=^## DEC-)/m).slice(1).map(block=>{
    const [,id,title]=block.match(/^## (DEC-\d+) — (.+)/);
    const status=block.match(/\/ (APPROVED|PROPOSED|SUPERSEDED|REJECTED) \//)?.[1];
    if(!status) throw new Error('Missing decision status: '+id);
    return {id,title,status,detail:block.split('\n').slice(2).join('\n').trim()};
  }),
  pending: rows('.agentic/PLANNING_STATE.md','Q-').map(([id,title,priority,resolve_before])=>({id,title,priority,resolve_before})),
  debts: rows('docs/TECH_DEBT.md','TD-').map(([id,type,severity,description,mitigation,owner,priority,resolve_before,evidence,status])=>({id,type,severity,description,mitigation,owner,priority,resolve_before,evidence,status})),
  criteria: rows('docs/CHECKPOINTS.md','C-').map(([id,name,status,evidence,environment,sha,date,provenance])=>({id,name,status,evidence,environment,sha,date,provenance})),
  feedback: [...source['.agentic/METHODOLOGY_FEEDBACK.md'].matchAll(/^## (AUD-\d+) — (.+)$/gm)].map(([,id,title])=>({id,title,status:'PROPOSED'})),
  source_files: sourceNames.map(name=>({path:name,sha256:createHash('sha256').update(source[name]).digest('hex')}))
};
const phaseStates=new Set(['NO INICIADA','EN CURSO','PARCIAL','BLOQUEADA','COMPLETADA','TERMINAL']);
const criterionStates=new Set(['PASS','FAIL','NOT VERIFIED','NOT APPLICABLE']);
if(phases.filter(p=>p.status==='EN CURSO').length!==1 || !phases.some(p=>p.id===data.active_phase)) throw new Error('Invalid active phase');
if(phases.some(p=>!phaseStates.has(p.status))) throw new Error('Invalid phase state');
if([...data.criteria,...data.subgates,...data.readiness].some(c=>!criterionStates.has(c.status))) throw new Error('Invalid criterion state');
const template=await readFile(new URL('./template.html',import.meta.url),'utf8');
const outputs = [
  [new URL('../PROJECT_MAP_DATA.json',import.meta.url), JSON.stringify(data,null,2)+'\n'],
  [new URL('./index.html',import.meta.url),template.replace('/*__PROJECT_DATA__*/',JSON.stringify(data).replaceAll('<','\\u003c'))]
];
for(const [file,contents] of outputs) {
  if(process.argv.includes('--check')) {
    if(await readFile(file,'utf8')!==contents) throw new Error('Stale generated artifact: '+fileURLToPath(file));
  } else await writeFile(file,contents,'utf8');
}
console.log(`${process.argv.includes('--check')?'Verified':'Generated'} local map: ${phases.length} phases, ${data.decisions.length} decisions, ${data.criteria.length} criteria; progress is qualitative.`);
