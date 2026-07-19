#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const BASELINE = '34f96defd6fa82274730fcb22ae8aeca560353f5';
const failures = [];
const warnings = [];

function read(rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) {
    failures.push(`missing_file: ${rel}`);
    return '';
  }
  return fs.readFileSync(p, 'utf8');
}

function splitRow(line) {
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let current = '';
  let escaped = false;
  for (const ch of body) {
    if (escaped) {
      current += ch;
      escaped = false;
    } else if (ch === '\\') {
      escaped = true;
    } else if (ch === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseFirstTable(rel) {
  const text = read(rel);
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (lines[i].startsWith('| ') && /^\|\s*---/.test(lines[i + 1])) {
      const header = splitRow(lines[i]);
      const rows = [];
      for (let j = i + 2; j < lines.length && lines[j].startsWith('|'); j += 1) {
        const cells = splitRow(lines[j]);
        if (cells.length !== header.length) {
          failures.push(`malformed_table: ${rel}:${j + 1} has ${cells.length}/${header.length} cells`);
          continue;
        }
        rows.push(Object.fromEntries(header.map((h, idx) => [h, cells[idx]])));
      }
      return rows;
    }
  }
  failures.push(`missing_table: ${rel}`);
  return [];
}

function tokens(value) {
  const cleaned = String(value ?? '').replaceAll('`', '').trim();
  if (!cleaned || cleaned === '-') return [];
  return cleaned.split(';').map((v) => v.trim()).filter((v) => v && v !== '-');
}

function sameTokens(a, b) {
  const aa = [...new Set(tokens(a))].sort();
  const bb = [...new Set(tokens(b))].sort();
  return JSON.stringify(aa) === JSON.stringify(bb);
}

function duplicateValues(rows, key) {
  const seen = new Set();
  const duplicates = new Set();
  for (const row of rows) {
    const value = row[key];
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function indexBy(rows, key) {
  return new Map(rows.map((row) => [row[key], row]));
}

const rel = {
  decisions: 'docs/product/PRODUCT_DECISION_LOG.md',
  features: 'docs/product/FEATURE_ACCEPTANCE_MATRIX.md',
  audits: 'docs/testing/V3_2_4_AUDIT_CHECKLIST.md',
  procedures: 'docs/product/PROCEDURE_INVENTORY.md',
  routes: 'docs/product/ROUTE_API_TRACEABILITY.md',
  roles: 'docs/product/ROLE_PERMISSION_MATRIX.md',
  states: 'docs/product/DOMAIN_STATE_MACHINES.md',
  baseline: 'docs/releases/V3_2_4_ACCEPTANCE_BASELINE.md',
  master: 'docs/product/SHENGHUOBANG_MASTER_PLAN.md',
  userFlow: 'docs/product/USER_FLOW_MAP.md',
};

const decisions = parseFirstTable(rel.decisions);
const features = parseFirstTable(rel.features);
const audits = parseFirstTable(rel.audits);
const procedures = parseFirstTable(rel.procedures);
const routes = parseFirstTable(rel.routes);
const roles = parseFirstTable(rel.roles);
const states = parseFirstTable(rel.states);

const featureById = indexBy(features, '功能编号');
const auditById = indexBy(audits, '检查编号');
const roleById = indexBy(roles, '权限项编号');
const stateByName = indexBy(states, '领域');
const routeByPath = indexBy(routes, '路由');
const procByName = new Map();
for (const proc of procedures) {
  const full = `${proc.Router}.${proc['Procedure 名']}`;
  procByName.set(full, proc);
}

const duplicate_ids = [];
for (const [name, rows, key] of [
  ['decision', decisions, '决策编号'],
  ['feature', features, '功能编号'],
  ['audit', audits, '检查编号'],
  ['procedure', procedures, 'Procedure 编号'],
  ['role', roles, '权限项编号'],
]) {
  for (const id of duplicateValues(rows, key)) duplicate_ids.push(`${name}:${id}`);
}

const activeDocs = [
  'docs/product/SHENGHUOBANG_MASTER_PLAN.md',
  'docs/product/PRODUCT_DECISION_LOG.md',
  'docs/product/SHENGHUOBANG_PRODUCT_BLUEPRINT.md',
  'docs/product/PRODUCT_ROADMAP.md',
  'docs/product/ROLE_PERMISSION_MATRIX.md',
  'docs/product/DOMAIN_STATE_MACHINES.md',
  'docs/product/FEATURE_ACCEPTANCE_MATRIX.md',
  'docs/product/PROCEDURE_INVENTORY.md',
  'docs/product/USER_FLOW_MAP.md',
  'docs/product/UI_UX_STANDARD.md',
  'docs/product/ROUTE_API_TRACEABILITY.md',
  'docs/releases/V3_2_4_ACCEPTANCE_BASELINE.md',
  'docs/testing/V3_2_4_AUDIT_CHECKLIST.md',
  'docs/testing/V3_2_4_INITIAL_GAP_ANALYSIS.md',
];
const active_documents_missing_metadata = [];
for (const file of activeDocs) {
  const text = read(file).slice(0, 1200);
  const missing = ['Document Status', 'Spec Version', 'Updated At', 'Code Baseline Commit', 'Approved By']
    .filter((key) => !new RegExp(`^${key}:`, 'm').test(text));
  if (missing.length) active_documents_missing_metadata.push(`${file}:${missing.join(',')}`);
  const status = text.match(/^Document Status:\s*(.+)$/m)?.[1]?.trim();
  const approved = text.match(/^Approved By:\s*(.+)$/m)?.[1]?.trim();
  const commit = text.match(/^Code Baseline Commit:\s*(.+)$/m)?.[1]?.trim();
  if (status && status !== 'FROZEN') failures.push(`unexpected_document_status: ${file}=${status}`);
  if (approved && approved !== 'User Approved') failures.push(`unexpected_approval: ${file}=${approved}`);
  if (commit && commit !== BASELINE) failures.push(`baseline_mismatch: ${file}=${commit}`);
}

const validGates = new Set(['MUST_PASS', 'CURRENT_STATE_ONLY', 'NOT_REQUIRED']);
const validDepths = new Set(['FULL_FLOW', 'READ_ONLY_PLUS_AUTOMATION', 'STATIC_AND_CONTRACT', 'EXCLUDED']);
const validBool = new Set(['YES', 'NO']);
for (const f of features) {
  if (!validGates.has(f['V3.2.4 发布门槛'])) failures.push(`invalid_gate:${f['功能编号']}:${f['V3.2.4 发布门槛']}`);
  if (!validDepths.has(f['审查深度'])) failures.push(`invalid_depth:${f['功能编号']}:${f['审查深度']}`);
  if (!validBool.has(f['是否需要写操作验证'])) failures.push(`invalid_write_flag:${f['功能编号']}:${f['是否需要写操作验证']}`);
}

const feature_audit_mismatches = [];
for (const f of features) {
  for (const aid of tokens(f['关联审查编号'])) {
    const a = auditById.get(aid);
    if (!a) {
      feature_audit_mismatches.push(`${f['功能编号']}->${aid}:missing`);
      continue;
    }
    if (!tokens(a['关联功能编号']).includes(f['功能编号'])) feature_audit_mismatches.push(`${f['功能编号']}<->${aid}:feature`);
    for (const [fc, ac] of [
      ['关联路由', '关联路由'],
      ['关联 Procedure', '关联 Procedure'],
      ['关联状态机', '关联状态机'],
      ['关联权限项', '关联角色权限项'],
    ]) {
      if (!sameTokens(f[fc], a[ac])) feature_audit_mismatches.push(`${f['功能编号']}<->${aid}:${fc}`);
    }
    if (f['V3.2.4 发布门槛'] !== a['V3.2.4 发布门槛']) feature_audit_mismatches.push(`${f['功能编号']}<->${aid}:gate`);
    if (f['审查深度'] !== a['审查深度']) feature_audit_mismatches.push(`${f['功能编号']}<->${aid}:depth`);
  }
}

const feature_procedure_reverse_mismatches = [];
for (const f of features) {
  for (const pname of tokens(f['关联 Procedure'])) {
    if (pname.startsWith('/api/')) continue;
    const p = procByName.get(pname);
    if (!p) {
      feature_procedure_reverse_mismatches.push(`${f['功能编号']}->${pname}:missing`);
    } else if (!tokens(p['关联功能编号']).includes(f['功能编号'])) {
      feature_procedure_reverse_mismatches.push(`${f['功能编号']}->${pname}:reverse_missing`);
    }
  }
}
for (const [pname, p] of procByName) {
  for (const fid of tokens(p['关联功能编号'])) {
    const f = featureById.get(fid);
    if (!f || !tokens(f['关联 Procedure']).includes(pname)) feature_procedure_reverse_mismatches.push(`${pname}->${fid}:reverse_invalid`);
  }
}

const procedure_audit_reverse_mismatches = [];
for (const a of audits) {
  for (const pname of tokens(a['关联 Procedure'])) {
    if (pname.startsWith('/api/')) continue;
    const p = procByName.get(pname);
    if (!p) procedure_audit_reverse_mismatches.push(`${a['检查编号']}->${pname}:missing`);
    else if (!tokens(p['关联审查编号']).includes(a['检查编号'])) procedure_audit_reverse_mismatches.push(`${a['检查编号']}->${pname}:reverse_missing`);
  }
}
for (const [pname, p] of procByName) {
  for (const aid of tokens(p['关联审查编号'])) {
    const a = auditById.get(aid);
    if (!a || !tokens(a['关联 Procedure']).includes(pname)) procedure_audit_reverse_mismatches.push(`${pname}->${aid}:reverse_invalid`);
  }
}

const route_audit_mismatches = [];
for (const r of routes) {
  const navigation = r['当前覆盖情况'] === 'NAVIGATION_MAPPING';
  for (const fid of tokens(r['关联功能编号'])) {
    const f = featureById.get(fid);
    if (!f) {
      route_audit_mismatches.push(`${r['路由']}->${fid}:missing_feature`);
      continue;
    }
    if (!navigation && !tokens(f['关联路由']).includes(r['路由'])) route_audit_mismatches.push(`${r['路由']}->${fid}:not_exact`);
    for (const aid of tokens(f['关联审查编号'])) {
      if (!tokens(r['关联审查编号']).includes(aid)) route_audit_mismatches.push(`${r['路由']}->${fid}:missing_${aid}`);
    }
  }
}
for (const f of features) {
  for (const route of tokens(f['关联路由'])) {
    const r = routeByPath.get(route);
    if (!r) route_audit_mismatches.push(`${f['功能编号']}->${route}:missing_route`);
    else if (!tokens(r['关联功能编号']).includes(f['功能编号'])) route_audit_mismatches.push(`${f['功能编号']}->${route}:reverse_missing`);
  }
}

const role_audit_mismatches = [];
for (const role of roles) {
  const rid = role['权限项编号'];
  for (const aid of tokens(role['对应审查编号'])) {
    const a = auditById.get(aid);
    if (!a || !tokens(a['关联角色权限项']).includes(rid)) role_audit_mismatches.push(`${rid}->${aid}:invalid`);
  }
}
for (const a of audits) {
  for (const rid of tokens(a['关联角色权限项']).filter((v) => v.startsWith('ROLE-'))) {
    const role = roleById.get(rid);
    if (!role || !tokens(role['对应审查编号']).includes(a['检查编号'])) role_audit_mismatches.push(`${a['检查编号']}->${rid}:reverse_missing`);
  }
}

for (const f of features) {
  for (const state of tokens(f['关联状态机'])) if (!stateByName.has(state)) failures.push(`missing_state:${f['功能编号']}:${state}`);
  for (const rid of tokens(f['关联权限项'])) if (!roleById.has(rid)) failures.push(`missing_role:${f['功能编号']}:${rid}`);
}

const must_pass_write_classification_mismatches = [];
for (const f of features) {
  if (f['V3.2.4 发布门槛'] === 'MUST_PASS' && f['是否需要写操作验证'] === 'YES' && f['审查深度'] !== 'FULL_FLOW') {
    must_pass_write_classification_mismatches.push(`${f['功能编号']}:write_not_full_flow`);
  }
  if (f['V3.2.4 发布门槛'] === 'CURRENT_STATE_ONLY' && f['审查深度'] === 'STATIC_AND_CONTRACT' && f['是否需要写操作验证'] !== 'NO') {
    must_pass_write_classification_mismatches.push(`${f['功能编号']}:static_requires_write`);
  }
  for (const pname of tokens(f['关联 Procedure'])) {
    const p = procByName.get(pname);
    if (f['V3.2.4 发布门槛'] === 'MUST_PASS' && p?.['是否写操作'] === '是' && (f['审查深度'] !== 'FULL_FLOW' || f['是否需要写操作验证'] !== 'YES')) {
      must_pass_write_classification_mismatches.push(`${f['功能编号']}:${pname}:write_proc_mismatch`);
    }
  }
}

const full_flow_readonly_template_mismatches = [];
for (const f of features) {
  if (f['审查深度'] === 'FULL_FLOW' && f['是否需要写操作验证'] === 'YES') {
    const text = `${f['最终预期']} ${f['验收标准']}`;
    if (/打开 .*无崩溃|数据、空态、失败态/.test(text) || !/重复|幂等/.test(text) || !/越权|无权/.test(text) || !/失败/.test(text)) {
      full_flow_readonly_template_mismatches.push(f['功能编号']);
    }
  }
}

const decisionText = read(rel.decisions);
if ((decisionText.match(/\| DEC-008 \|/g) ?? []).length !== 1) failures.push('DEC-008_not_unique');
if ((decisionText.match(/\| DEC-009 \|/g) ?? []).length !== 1) failures.push('DEC-009_not_unique');
const auditText = read(rel.audits);
if (!auditText.includes('`AUDIT-099` 至 `AUDIT-107`') || !auditText.includes('retired')) failures.push('audit_retired_range_not_documented');
const notice = featureById.get('NOTICE-003');
const audit80 = auditById.get('AUDIT-080');
if (!notice || notice['关联审查编号'] !== 'AUDIT-080' || notice['V3.2.4 发布门槛'] !== 'MUST_PASS' || notice['审查深度'] !== 'FULL_FLOW' || notice['是否需要写操作验证'] !== 'YES') failures.push('NOTICE-003_contract_invalid');
if (!audit80 || !tokens(audit80['关联功能编号']).includes('NOTICE-003') || audit80['审查深度'] !== 'FULL_FLOW') failures.push('AUDIT-080_contract_invalid');

const illegalPatterns = [
  ['private_lan', new RegExp('192' + '\\.168\\.')],
  ['file_url', new RegExp('file:' + '/' + '/' + '/')],
  ['trae_worktree', new RegExp('\\.trae' + '/' + 'worktrees')],
  ['temporary_branch', new RegExp(['feat', 'configure', 'local', 'backend', 'address'].join('-'))],
  ['broken_delimiter', new RegExp(';'.repeat(4))],
];
for (const file of fs.readdirSync(path.join(root, 'docs'), { recursive: true })) {
  if (!String(file).endsWith('.md')) continue;
  const relFile = path.join('docs', String(file));
  const text = read(relFile);
  for (const [name, regex] of illegalPatterns) if (regex.test(text)) failures.push(`${name}:${relFile}`);
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) failures.push(`private_key:${relFile}`);
  if (/gh[pousr]_[A-Za-z0-9]{20,}/.test(text)) failures.push(`github_token:${relFile}`);
  for (const line of text.split(/\r?\n/)) {
    const db = line.match(/DATABASE_URL\s*=\s*(.*)$/i)?.[1]?.trim();
    if (db && !db.startsWith('${{ secrets.')) failures.push(`database_url_value:${relFile}`);
    const jwt = line.match(/JWT_SECRET\s*=\s*(.*)$/i)?.[1]?.trim();
    if (jwt && !jwt.startsWith('${{ secrets.')) failures.push(`jwt_secret_value:${relFile}`);
  }
}

const write_procedures_without_ui = procedures
  .filter((p) => p['是否写操作'] === '是' && ['UNUSED_PENDING_CONFIRMATION', 'LEGACY', 'ADMIN_NO_UI'].includes(p['当前承接分类']))
  .map((p) => `${p.Router}.${p['Procedure 名']}`)
  .sort();
const expectedNoUi = [
  'admin.changeRole',
  'engineers.setAccepting',
  'listings.create',
  'orders.pay',
  'projects.pay',
  'quotes.reject',
  'verifications.submitEngineer',
  'verifications.submitMerchant',
].sort();
if (JSON.stringify(write_procedures_without_ui) !== JSON.stringify(expectedNoUi)) {
  failures.push(`write_procedures_without_ui_changed:${write_procedures_without_ui.join(',')}`);
}

const summaries = {
  duplicate_ids,
  feature_audit_mismatches,
  feature_procedure_reverse_mismatches,
  procedure_audit_reverse_mismatches,
  route_audit_mismatches,
  role_audit_mismatches,
  must_pass_write_classification_mismatches,
  full_flow_readonly_template_mismatches,
  active_documents_missing_metadata,
};
for (const [name, values] of Object.entries(summaries)) {
  if (values.length) failures.push(`${name}:${values.join('|')}`);
}

const countBy = (rows, key) => Object.fromEntries([...rows.reduce((m, r) => m.set(r[key], (m.get(r[key]) ?? 0) + 1), new Map())]);
const output = {
  status: failures.length ? 'FAILED' : 'PASSED',
  baseline: BASELINE,
  counts: {
    features: features.length,
    audits: audits.length,
    routes: routes.length,
    procedures: procedures.length,
    states: states.length,
    roles: roles.length,
    release_gates: countBy(features, 'V3.2.4 发布门槛'),
    audit_depths: countBy(features, '审查深度'),
  },
  summaries: Object.fromEntries(Object.entries(summaries).map(([k, v]) => [k, { count: v.length, values: v }])),
  write_procedures_without_ui,
  warnings,
  failures,
};
console.log(JSON.stringify(output, null, 2));
process.exitCode = failures.length ? 1 : 0;
