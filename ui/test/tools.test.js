import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TOOLS, toolById, cleanName, runAudit } from '../js/tools.js';

const flat = (view) => JSON.stringify(view);

test('there are nine tools, in the website app order', () => {
	assert.deepEqual(TOOLS.map((t) => t.id), ['generator', 'checker', 'report', 'score', 'appraisal', 'audit', 'health', 'short', 'calendar']);
});

test('cleanName accepts labels and rejects junk', () => {
	assert.equal(cleanName('Nova.com'), 'nova');
	assert.equal(cleanName('a b'), '');
	assert.equal(cleanName(''), '');
});

test('name tools return null without a valid name and build the route otherwise', () => {
	for (const id of ['report', 'score', 'appraisal', 'audit', 'health']) {
		assert.equal(toolById(id).request({ name: '  ' }), null, id);
		const r = toolById(id).request({ name: 'Nova.com' });
		assert.equal(r.params.name, 'nova', id);
	}
	assert.equal(toolById('score').request({ name: 'nova' }).route, 'rate');
	assert.equal(toolById('appraisal').request({ name: 'nova' }).route, 'appraise');
	assert.equal(toolById('health').request({ name: 'nova' }).route, 'domain-health');
});

test('generator: up to three clean seed words', () => {
	const g = toolById('generator');
	assert.equal(g.request({ seeds: '  ' }), null);
	assert.deepEqual(g.request({ seeds: 'Nova, red! blue sky', count: '20' }).params, { seeds: 'nova,red,blue', count: '20' });
	const v = g.view({ considered: 184, names: [{ name: 'zippynova', score: 97, how: 'zippy + nova', com: 'free' }] });
	assert.deepEqual(v.tables[0].rows, [['zippynova', 97, 'zippy + nova', 'free']]);
	assert.deepEqual(v.facts, [['r.considered', 184]]);
});

test('score view from a real answer', () => {
	const d = { name: 'nova', length: 4, kind: 'word', score: 84.2, verdict: 'Strong', in_zone: true, breakdown: [{ label: 'Length', points: 30, max: 30, note: '4 characters' }], tips: [], alternatives: [] };
	const v = toolById('score').view(d);
	assert.deepEqual(v.facts[0], ['r.score', 84.2]);
	assert.deepEqual(v.facts[4], ['r.inZone', { key: 'r.yes' }]);
	assert.deepEqual(v.tables[0].rows, [['Length', 30, 30, '4 characters']]);
	assert.equal(toolById('score').view({ score: null }).facts[0][1], '—');
});

test('appraisal view lists components and strengths', () => {
	const d = { score: 94.4, tier: 'Premium', kind: 'word', length: 4, components: [{ label: 'Length', score: 100, note: '4 characters' }], strengths: ['Length: 4 characters'], weaknesses: [], best_uses: [], buyers: ['Startups'], facts: ['Registered now: yes'], pitch: { headline: 'nova.com: a 4-letter .com' } };
	const v = toolById('appraisal').view(d);
	assert.equal(v.facts[1][1], 'Premium');
	assert.equal(v.facts.at(-1)[0], 'r.pitch');
	assert.deepEqual(v.lists[0].items, ['Length: 4 characters']);
});

test('health view: grade, registration, email, blocklists and findings', () => {
	const d = { grade: 'C', score: 76, registration: { registrar: 'GoDaddy.com, LLC', created: '1991-05-02', expires: '2028-05-03', days_to_expiry: 560, age_days: 12955, locked: true }, dns: { ns: ['ns1', 'ns2'], dnssec: false }, email: { mx: ['a', 'b', 'c'], spf: { found: true, policy: 'softfail' }, dmarc: { found: false } }, blocklists: [{ list: 'Spamhaus DBL', listed: false, note: 'not listed' }], findings: [{ severity: 'medium', title: 'No DMARC record', detail: 'DMARC tells receivers.' }], limits: ['We read public data only.'] };
	const v = toolById('health').view(d);
	const f = Object.fromEntries(v.facts);
	assert.equal(f['r.grade'], 'C');
	assert.equal(f['r.nameservers'], 'ns1, ns2');
	assert.equal(f['r.mail'], 3);
	assert.equal(f['r.spf'], 'softfail');
	assert.deepEqual(f['r.dmarc'], { key: 'r.notFound' });
	assert.deepEqual(v.tables[0].rows[0], ['Spamhaus DBL', { key: 'r.no' }, 'not listed']);
	assert.equal(v.lists[0].items[0], 'medium: No DMARC record. DMARC tells receivers.');
});

test('short: cleans the pattern and the letters, and shows .com names', () => {
	const s = toolById('short');
	assert.deepEqual(s.request({ length: '4', pattern: 'cv-cv1', starts: 'Ab1', contains: '', sort: 'score' }).params, { length: '4', pattern: 'CVCV', starts: 'ab', contains: '', sort: 'score' });
	const v = s.view({ total: 81, names: [{ name: 'bace', length: 4, pattern: 'CVCV', score: 93 }] });
	assert.deepEqual(v.tables[0].rows, [['bace.com', 4, 'CVCV', 93]]);
});

test('calendar flattens the days and keeps a missing score empty', () => {
	const c = toolById('calendar');
	assert.deepEqual(c.request({ days: '14', stage: 'any', min_score: 'x5', contains: 'Ab_c' }).params, { days: '14', stage: 'any', min_score: '5', contains: 'abc' });
	const v = c.view({ total: 2, shown: 2, days: [{ date: '2026-10-23', names: [{ domain: 'calculatormind', stage: 'pending delete', score: null }, { domain: 'talkseo', stage: 'redemption', score: 90.2 }] }] });
	assert.deepEqual(v.tables[0].rows, [['2026-10-23', 'calculatormind.com', 'pending delete', ''], ['2026-10-23', 'talkseo.com', 'redemption', 90.2]]);
});

test('audit view reads the finished result', () => {
	const d = { state: 'done', result: { verdict: 'clean', score: 85, confidence: 'some', registration: { in_zone: true, parked: false }, timeline: { total: 770, first: '19991012192313', last: '20260127032415', active_years: 28, longest_gap_months: 8 }, blocklists: [{ list: 'SURBL', listed: false, note: 'not listed' }], findings: [{ severity: 'info', title: 'T', detail: 'D' }], limits: ['L'] } };
	const v = toolById('audit').view(d);
	const f = Object.fromEntries(v.facts);
	assert.equal(f['r.verdict'], 'clean');
	assert.equal(f['r.firstCapture'], '1999-10-12');
	assert.equal(f['r.captures'], 770);
});

test('report view offers the report page of that name', () => {
	const v = toolById('report').view({ state: 'done' }, { name: 'nova' });
	assert.equal(v.open.path, '/domain/nova/');
});

test('runAudit polls until done and reports progress', async () => {
	const answers = [{ state: 'running', stages: [{ state: 'done' }, { state: 'running' }], elapsed: 2 }, { state: 'running', stages: [{ state: 'done' }, { state: 'done' }], elapsed: 6 }, { state: 'done', result: { verdict: 'clean' } }];
	const calls = [];
	const api = { get: async (route, params) => { calls.push([route, params]); return answers.shift(); } };
	const progress = [];
	const res = await runAudit(api, 'nova', { sleep: async () => {}, onProgress: (p) => progress.push(p) });
	assert.equal(res.state, 'done');
	assert.deepEqual(calls[0], ['audit', { name: 'nova' }]);
	assert.deepEqual(calls[1], ['audit', { name: 'nova', poll: 1 }]);
	assert.deepEqual(progress, [{ done: 1, total: 2, seconds: 2 }, { done: 2, total: 2, seconds: 6 }]);
});

test('runAudit gives up with slow=true', async () => {
	const api = { get: async () => ({ state: 'running', stages: [] }) };
	await assert.rejects(() => runAudit(api, 'nova', { sleep: async () => {}, maxMs: -1 }), (e) => e.slow === true);
});

test('every tool has a name and a description in the English locale', () => {
	const en = JSON.parse(readFileSync(new URL('../locales/en.json', import.meta.url), 'utf8'));
	for (const t of TOOLS) {
		assert.ok(en[`tool.${t.id}.name`], `${t.id} name`);
		assert.ok(en[`tool.${t.id}.desc`], `${t.id} desc`);
		for (const f of t.fields || []) assert.ok(en[f.label], `field ${f.label}`);
	}
});

test('every key the views can use exists in the English locale', () => {
	const en = JSON.parse(readFileSync(new URL('../locales/en.json', import.meta.url), 'utf8'));
	const src = readFileSync(new URL('../js/tools.js', import.meta.url), 'utf8');
	const keys = new Set([...src.matchAll(/'((?:r|col|sec|note|opt|tools|f)\.[A-Za-z]+)'/g)].map((m) => m[1]));
	for (const k of keys) assert.ok(en[k], `missing ${k}`);
});
