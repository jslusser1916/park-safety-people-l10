const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');

// Exercise the actual component handlers with isolated records and hook state.
// This does not access, create, or modify production records.
const state = new Map();
const deps = new Map();
let frame, tree, root, props, effects = [], scrolls = [];
global.window = { scrollTo: options => scrolls.push(options) };
const hooks = {
  ...React,
  useState(initial) {
    const key = `${frame.path}:${frame.index++}`;
    if (!state.has(key)) state.set(key, typeof initial === 'function' ? initial() : initial);
    return [state.get(key), next => state.set(key, typeof next === 'function' ? next(state.get(key)) : next)];
  },
  useRef(initial) { return hooks.useState(() => ({ current: initial }))[0]; },
  useMemo(fn) { frame.index++; return fn(); },
  useEffect(fn, values) {
    const key = `${frame.path}:${frame.index++}`;
    const previous = deps.get(key);
    if (!previous || !values || values.some((value, index) => !Object.is(value, previous[index]))) {
      deps.set(key, values);
      effects.push(() => { const cleanup = fn(); if (typeof cleanup === 'function') cleanup(); });
    }
  },
};
const filename = path.join(__dirname, '../app/page.tsx');
const source = fs.readFileSync(filename, 'utf8') + '\nexport { Meetings, Todos, MeetingTodoComposer };';
const output = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
const compiled = new Module(filename, module);
compiled.filename = filename;
compiled.paths = module.paths;
compiled.require = name => name === 'react' ? hooks : require(name);
compiled._compile(output, filename);
const { Meetings, Todos, MeetingTodoComposer } = compiled.exports;

function expand(element, location = 'root') {
  if (element == null || typeof element === 'boolean') return null;
  if (Array.isArray(element)) return element.map((child, i) => expand(child, `${location}/${child?.key ?? i}`));
  if (typeof element !== 'object') return element;
  if (typeof element.type === 'function') {
    const old = frame;
    frame = { path: `${location}/${element.type.name}`, index: 0 };
    const result = element.type(element.props);
    frame = old;
    return expand(result, `${location}/render`);
  }
  if (typeof element.type === 'object') return null; // Decorative icon.
  return { type: element.type, props: element.props, children: expand(element.props?.children, `${location}/children`) };
}
function render() {
  effects = [];
  tree = expand(React.createElement(root, props));
  const pending = effects;
  effects = [];
  pending.forEach(run => run());
  return tree;
}
function mount(component, nextProps) { state.clear(); deps.clear(); root = component; props = nextProps; return render(); }
function nodes(node = tree) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(child => nodes(child));
  return [node, ...nodes(node.children)];
}
function text(node) {
  if (node == null) return '';
  if (Array.isArray(node)) return node.map(text).join('');
  if (typeof node !== 'object') return String(node);
  return text(node.children);
}
function find(predicate) { const value = nodes().find(predicate); assert.ok(value, 'Expected element was not rendered'); return value; }
function button(label) { return find(n => n.type === 'button' && text(n).trim() === label); }
async function click(label) { await button(label).props.onClick(); render(); }
function changeWithin(form, element, value) {
  const node = nodes(form).find(element);
  assert.ok(node, 'Expected form field');
  node.props.onChange({ target: { value } });
  render();
}
const now = Date.now();
const make = (id, kind, payload) => ({ id, kind, payload, sortKey: '', isSample: false, createdAt: now, updatedAt: now });
const today = new Date().toISOString().slice(0, 10);
let records = [
  make('owner-a', 'owner', { name: 'Alex Adams' }),
  make('owner-b', 'owner', { name: 'Blair Brooks' }),
  make('metric', 'metric', { name: 'Training attendance', ownerId: 'owner-a', target: 95, direction: 'gte', unit: '%' }),
  make('rock', 'rock', { title: 'Supervisor training', ownerId: 'owner-a', status: 'on-track', dueDate: today }),
  make('headline', 'headline', { title: 'New crew onboarding', ownerId: 'owner-b', tone: 'good' }),
  make('old-open', 'todo', { title: 'Previously archived but incomplete', ownerId: 'owner-a', dueDate: today, status: 'open', archivedAt: '2026-10-13T12:00:00Z' }),
  make('old-done', 'todo', { title: 'Previously archived and completed', ownerId: 'owner-b', dueDate: today, status: 'done', archivedAt: '2026-10-13T12:00:00Z' }),
  make('issue', 'issue', { title: 'A discussion topic, not a commitment', ownerId: 'owner-a', status: 'open', priority: '1', resolution: '' }),
];
const upsert = async record => {
  const value = { ...record, createdAt: record.createdAt || now, updatedAt: Date.now() };
  records = records.some(r => r.id === value.id) ? records.map(r => r.id === value.id ? value : r) : [...records, value];
  props.records = records;
  return value;
};
const trackStatus = (record, status, patch = {}) => upsert({ ...record, payload: { ...record.payload, ...patch, status } });
const common = { records, ownerName: id => id === 'owner-a' ? 'Alex Adams' : 'Blair Brooks', upsert, trackStatus, open() {}, openIssue() {}, remove: async record => { records = records.filter(r => r.id !== record.id); props.records = records; } };

async function run() {
  mount(Todos, { ...common, records });
  assert.match(text(tree), /Previously archived but incomplete/);
  assert.doesNotMatch(text(tree), /All active|Archived|Previously archived and completed/);
  await find(n => n.type === 'button' && n.props['aria-label'] === 'Mark To-Do done').props.onClick(); render();
  assert.doesNotMatch(text(tree), /Previously archived but incomplete/);
  await click('Done (2)');
  assert.match(text(tree), /Previously archived but incomplete/);
  assert.match(text(tree), /Previously archived and completed/);
  await find(n => n.type === 'button' && n.props['aria-label'] === 'Mark To-Do not done').props.onClick(); render();
  assert.equal(records.find(r => r.id === 'old-open').payload.status, 'open');
  console.log('PASS: Legacy archived records are classified by Open/Done and checkboxes move them immediately.');

  mount(Meetings, { ...common, records });
  await click("Start today's meeting");
  assert.equal(nodes().filter(n => n.type === 'textarea').length, 0);
  assert.equal(nodes().filter(n => n.type === 'button' && text(n).trim() === 'Add To-Do').length, 0);
  await click('Next: Scorecard');
  assert.equal(scrolls.at(-1).top, 0);
  await click('Off Track');
  let metricValue = records.find(r => r.kind === 'metric_value');
  assert.equal(metricValue.payload.status, 'off-track');
  await click('On Track');
  metricValue = records.find(r => r.id === metricValue.id);
  const beforeDrop = JSON.stringify(metricValue);
  await click('Drop Down');
  assert.equal(JSON.stringify(records.find(r => r.id === metricValue.id)), beforeDrop);
  assert.equal(records.find(r => r.kind === 'issue' && r.payload.sourceId === 'metric').payload.title, 'Training attendance');
  assert.equal(find(n => n.type === 'h2' && n.props.tabIndex === -1).children, 'Scorecard');
  assert.equal(button('On Track').props['aria-pressed'], true);
  console.log('PASS: Scorecard review choices persist; Drop Down keeps the section, status, and neutral source title.');

  const assignedIds = [];
  const stages = ['Scorecard', 'Rock Review', 'Headlines', 'To-Do Review', 'IDS'];
  for (let index = 0; index < stages.length; index++) {
    const stage = stages[index];
    if (index) await click(`Next: ${stage}`);
    assert.equal(scrolls.at(-1).top, 0);
    assert.equal(nodes().filter(n => n.type === 'textarea').length, 0, `No note boxes in ${stage}`);
    if (stage === 'Rock Review') {
      const rockBefore = JSON.stringify(records.find(r => r.id === 'rock'));
      await click('Drop Down');
      assert.equal(JSON.stringify(records.find(r => r.id === 'rock')), rockBefore);
      assert.equal(records.find(r => r.kind === 'issue' && r.payload.sourceId === 'rock').payload.title, 'Supervisor training');
    }
    if (stage === 'To-Do Review') {
      assert.match(text(tree), /Previously archived but incomplete/);
      assert.doesNotMatch(text(tree), /All active|Archived/);
      const todoBefore = JSON.stringify(records.find(r => r.id === 'old-open'));
      await click('Drop Down');
      assert.equal(JSON.stringify(records.find(r => r.id === 'old-open')), todoBefore);
      assert.equal(records.find(r => r.kind === 'issue' && r.payload.sourceId === 'old-open').payload.title, 'Previously archived but incomplete');
      await click('Done');
      assert.equal(records.find(r => r.id === 'old-open').payload.status, 'done');
      await click('Done (2)');
      assert.match(text(tree), /Previously archived but incomplete/);
      await click('Open (3)');
    }
    const addButtons = nodes().filter(n => n.type === 'button' && text(n).trim() === 'Add To-Do');
    await addButtons.at(-1).props.onClick(); render();
    const getForm = () => find(n => n.type === 'form' && n.props['aria-label'] === `Add To-Do during ${stage}`);
    let form = getForm();
    assert.equal(nodes(form).find(n => n.type === 'input' && n.props.placeholder === 'Enter the commitment').props.value, '');
    assert.equal(nodes(form).find(n => n.type === 'select').props.value, '');
    changeWithin(form, n => n.type === 'input' && n.props.placeholder === 'Enter the commitment', `Action assigned during ${stage}`);
    changeWithin(getForm(), n => n.type === 'select', 'owner-b');
    await getForm().props.onSubmit({ preventDefault() {} }); render();
    const saved = records.find(r => r.kind === 'todo' && r.payload.title === `Action assigned during ${stage}`);
    assert.ok(saved?.payload.createdMeetingId);
    assignedIds.push(saved.id);
  }
  console.log('PASS: Each of the five review/IDS sections creates a blank, editable, saved To-Do with the same meeting link.');

  let card = find(n => n.type === 'article' && text(n).includes('A discussion topic, not a commitment'));
  await nodes(card).find(n => n.type === 'button' && text(n).trim() === 'Add To-Do').props.onClick(); render();
  const getLinkedForm = () => find(n => n.type === 'form' && n.props['aria-label'] === 'To-Do for A discussion topic, not a commitment');
  assert.equal(nodes(getLinkedForm()).find(n => n.type === 'input' && n.props.placeholder === 'Enter the commitment').props.value, '');
  changeWithin(getLinkedForm(), n => n.type === 'input' && n.props.placeholder === 'Enter the commitment', 'A separately worded accountable action');
  changeWithin(getLinkedForm(), n => n.type === 'select', 'owner-a');
  await getLinkedForm().props.onSubmit({ preventDefault() {} }); render();
  assignedIds.push(records.find(r => r.payload.title === 'A separately worded accountable action').id);
  card = find(n => n.type === 'article' && text(n).includes('A discussion topic, not a commitment'));
  const solve = nodes(card).find(n => n.type === 'button' && text(n).trim() === 'Mark solved');
  assert.equal(solve.props.disabled, false);
  await solve.props.onClick(); render();
  assert.equal(records.find(r => r.id === 'issue').payload.status, 'solved');
  assert.equal(records.find(r => r.id === 'issue').payload.priority, '');
  assert.doesNotMatch(text(tree), /Record the decision or solution|Optional section notes/);
  console.log('PASS: IDS To-Do titles start blank, accept distinct wording, and Mark solved works without a resolution input.');

  // Returning from another page must recover the saved pending assignment link.
  mount(Meetings, { ...common, records });
  await click("Start today's meeting");
  for (const next of [...stages, 'Conclude']) await click(`Next: ${next}`);
  const recap = find(n => n.props.className === 'meeting-todo-recap');
  for (const id of assignedIds) assert.match(text(recap), new RegExp(records.find(r => r.id === id).payload.title));
  assert.doesNotMatch(text(recap), /Previously archived/);
  assert.equal(nodes().filter(n => n.type === 'button' && text(n).trim() === 'Add To-Do').length, 0);
  assert.equal(button('Save & conclude').props.disabled, true);
  for (const name of ['Alex Adams', 'Blair Brooks']) {
    const group = find(n => n.props['aria-label'] === `${name}'s meeting rating`);
    await nodes(group).find(n => n.type === 'button' && text(n) === '9').props.onClick(); render();
  }
  assert.equal(button('Save & conclude').props.disabled, false);
  await click('Save & conclude');
  const meeting = records.find(r => r.kind === 'meeting');
  assert.deepEqual([...meeting.payload.assignedTodoIds].sort(), assignedIds.sort());
  assert.equal(meeting.payload.assignedTodos.length, 6);
  for (const id of assignedIds) {
    const todo = records.find(r => r.id === id);
    assert.equal(todo.payload.status, 'open');
    assert.equal(todo.payload.archivedAt, undefined);
  }
  assert.equal(records.find(r => r.id === 'old-open').payload.status, 'done');
  assert.match(text(tree), /View assigned To-Dos/);
  console.log('PASS: Conclude recaps every newly assigned action, requires all ratings, saves a historical snapshot, and never archives Open items.');

  mount(Meetings, { ...common, records });
  await click("Start today's meeting");
  for (const next of [...stages, 'Conclude']) await click(`Next: ${next}`);
  assert.match(text(find(n => n.props.className === 'meeting-todo-recap')), /No To-Dos assigned this meeting/);
  console.log('PASS: Returning to a pending meeting recovers its recap; starting the next meeting does not inherit completed meeting assignments.');

  mount(MeetingTodoComposer, { owners: records.filter(r => r.kind === 'owner'), todos: [], upsert: async () => null, nextMeetingWeek: today, meetingId: 'failure-test', sectionName: 'IDS' });
  await click('Add To-Do');
  const getFailureForm = () => find(n => n.type === 'form');
  changeWithin(getFailureForm(), n => n.type === 'input' && n.props.placeholder === 'Enter the commitment', 'Preserve this entry');
  changeWithin(getFailureForm(), n => n.type === 'select', 'owner-a');
  await getFailureForm().props.onSubmit({ preventDefault() {} }); render();
  assert.equal(nodes(getFailureForm()).find(n => n.type === 'input' && n.props.placeholder === 'Enter the commitment').props.value, 'Preserve this entry');
  assert.match(text(tree), /could not be saved/);
  console.log('PASS: A failed save leaves the blank-form entry available for retry and reports the failure.');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

