// The website's nine free tools as native pages. Each tool is a small form plus a function that turns the API's answer into a "view":
//   { facts: [[labelKey, value]], tables: [{ titleKey, head: [keys], rows: [[...]] }], lists: [{ titleKey, items: [] }], notes: [text or {key}] }
// A fact value is a string, a number or {key: 'r.yes'} (a translated word). Text that comes from the API (notes, findings) stays as the API wrote it.
import { cleanLabel } from './names.js';

const NAME = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function cleanName(value) {
	const n = cleanLabel(value);
	return NAME.test(n) ? n : '';
}

const yesNo = (v) => ({ key: v ? 'r.yes' : 'r.no' });
const foundOr = (v) => ({ key: v ? 'r.found' : 'r.notFound' });
const str = (v) => (v === null || v === undefined ? '' : String(v));
const list = (v) => (Array.isArray(v) ? v : []);
const stamp = (ts) => {
	const s = str(ts);
	return /^\d{8}/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : s;
};

const nameField = { id: 'name', label: 'f.name', type: 'text', required: true, maxlength: 80 };

export const TOOLS = [
	{
		id: 'generator',
		fields: [
			{ id: 'seeds', label: 'f.seeds', type: 'text', required: true, maxlength: 60 },
			{ id: 'count', label: 'f.count', type: 'select', value: '20', options: ['10', '20', '30'].map((v) => ({ value: v, text: v })) },
		],
		request: (v) => {
			const seeds = String(v.seeds || '').toLowerCase().split(/[\s,]+/).map((s) => s.replace(/[^a-z]/g, '')).filter(Boolean).slice(0, 3);
			return seeds.length ? { route: 'names', params: { seeds: seeds.join(','), count: v.count } } : null;
		},
		view: (d) => ({
			facts: [['r.considered', d.considered ?? 0]],
			tables: [{ head: ['col.name', 'col.score', 'col.how', 'col.com'], rows: list(d.names).map((n) => [n.name, n.score, str(n.how), str(n.com)]) }],
			notes: [{ key: 'note.checkAvail' }],
		}),
	},
	{ id: 'checker', kind: 'link', tab: 'check' },
	{
		id: 'report',
		kind: 'report',
		fields: [nameField],
		request: (v) => {
			const name = cleanName(v.name);
			return name ? { route: 'report', params: { name }, name } : null;
		},
		view: (d, req) => ({ facts: [], tables: [], lists: [], notes: [], open: { path: `/domain/${req.name}/`, key: 'tools.openReport' }, ready: { key: 'tools.reportReady', name: req.name } }),
	},
	{
		id: 'score',
		fields: [nameField],
		request: (v) => {
			const name = cleanName(v.name);
			return name ? { route: 'rate', params: { name }, name } : null;
		},
		view: (d) => ({
			facts: [['r.score', d.score === null || d.score === undefined ? '—' : d.score], ['r.verdict', str(d.verdict)], ['r.kind', str(d.kind)], ['r.length', d.length ?? ''], ['r.inZone', yesNo(d.in_zone)]],
			tables: [{ titleKey: 'sec.breakdown', head: ['col.name', 'col.points', 'col.max', 'col.note'], rows: list(d.breakdown).map((b) => [b.label, b.points, b.max, str(b.note)]) }],
			lists: [{ titleKey: 'sec.tips', items: list(d.tips).map(str) }, { titleKey: 'sec.alternatives', items: list(d.alternatives).map((a) => (typeof a === 'string' ? a : str(a.name || a.domain))) }],
		}),
	},
	{
		id: 'appraisal',
		fields: [nameField],
		request: (v) => {
			const name = cleanName(v.name);
			return name ? { route: 'appraise', params: { name }, name } : null;
		},
		view: (d) => ({
			facts: [['r.score', d.score ?? ''], ['r.tier', str(d.tier)], ['r.kind', str(d.kind)], ['r.length', d.length ?? ''], ...(d.pitch && d.pitch.headline ? [['r.pitch', str(d.pitch.headline)]] : [])],
			tables: [{ titleKey: 'sec.components', head: ['col.name', 'col.score', 'col.note'], rows: list(d.components).map((c) => [c.label, c.score, str(c.note)]) }],
			lists: [
				{ titleKey: 'sec.strengths', items: list(d.strengths).map(str) },
				{ titleKey: 'sec.weaknesses', items: list(d.weaknesses).map(str) },
				{ titleKey: 'sec.bestUses', items: list(d.best_uses).map(str) },
				{ titleKey: 'sec.buyers', items: list(d.buyers).map(str) },
				{ titleKey: 'sec.facts', items: list(d.facts).map(str) },
			],
		}),
	},
	{
		id: 'audit',
		kind: 'audit',
		fields: [nameField],
		request: (v) => {
			const name = cleanName(v.name);
			return name ? { route: 'audit', params: { name }, name } : null;
		},
		view: (d) => {
			const r = d.result || d;
			const t = r.timeline || {};
			const reg = r.registration || {};
			return {
				facts: [
					['r.verdict', str(r.verdict)],
					['r.score', r.score ?? ''],
					['r.confidence', str(r.confidence)],
					['r.inZone', yesNo(reg.in_zone)],
					['r.parked', yesNo(reg.parked)],
					['r.captures', t.total ?? 0],
					['r.firstCapture', stamp(t.first)],
					['r.lastCapture', stamp(t.last)],
					['r.activeYears', t.active_years ?? ''],
					['r.longestGap', t.longest_gap_months ?? ''],
				],
				tables: [{ titleKey: 'sec.blocklists', head: ['col.list', 'col.listed', 'col.note'], rows: list(r.blocklists).map((b) => [b.list, yesNo(b.listed), str(b.note)]) }],
				lists: [{ titleKey: 'sec.findings', items: list(r.findings).map((f) => `${str(f.severity)}: ${str(f.title)}. ${str(f.detail)}`) }, { titleKey: 'sec.limits', items: list(r.limits).map(str) }],
			};
		},
	},
	{
		id: 'health',
		fields: [nameField],
		request: (v) => {
			const name = cleanName(v.name);
			return name ? { route: 'domain-health', params: { name }, name } : null;
		},
		view: (d) => {
			const reg = d.registration || {};
			const dns = d.dns || {};
			const em = d.email || {};
			return {
				facts: [
					['r.grade', str(d.grade)],
					['r.score', d.score ?? ''],
					['r.registrar', str(reg.registrar)],
					['r.created', str(reg.created)],
					['r.expires', str(reg.expires)],
					['r.daysToExpiry', reg.days_to_expiry ?? ''],
					['r.age', reg.age_days ?? ''],
					['r.locked', yesNo(reg.locked)],
					['r.nameservers', list(dns.ns).join(', ')],
					['r.dnssec', yesNo(dns.dnssec)],
					['r.mail', list(em.mx).length],
					['r.spf', em.spf && em.spf.found ? str(em.spf.policy) || { key: 'r.found' } : { key: 'r.notFound' }],
					['r.dmarc', em.dmarc && em.dmarc.found ? str(em.dmarc.policy) || { key: 'r.found' } : { key: 'r.notFound' }],
				],
				tables: [{ titleKey: 'sec.blocklists', head: ['col.list', 'col.listed', 'col.note'], rows: list(d.blocklists).map((b) => [b.list, yesNo(b.listed), str(b.note)]) }],
				lists: [{ titleKey: 'sec.findings', items: list(d.findings).map((f) => `${str(f.severity)}: ${str(f.title)}. ${str(f.detail)}`) }, { titleKey: 'sec.limits', items: list(d.limits).map(str) }],
			};
		},
	},
	{
		id: 'short',
		fields: [
			{ id: 'length', label: 'f.length', type: 'select', value: '4', options: ['3', '4', '5', '6'].map((v) => ({ value: v, text: v })) },
			{ id: 'pattern', label: 'f.pattern', type: 'text', maxlength: 6, placeholder: 'CVCV' },
			{ id: 'starts', label: 'f.starts', type: 'text', maxlength: 6 },
			{ id: 'contains', label: 'f.contains', type: 'text', maxlength: 6 },
			{ id: 'sort', label: 'f.sort', type: 'select', value: 'score', options: [{ value: 'score', key: 'opt.score' }, { value: 'alpha', key: 'opt.alpha' }] },
		],
		request: (v) => ({
			route: 'short',
			params: { length: v.length, pattern: String(v.pattern || '').replace(/[^CVSEcvse]/g, '').toUpperCase(), starts: String(v.starts || '').toLowerCase().replace(/[^a-z]/g, ''), contains: String(v.contains || '').toLowerCase().replace(/[^a-z]/g, ''), sort: v.sort },
		}),
		view: (d) => ({
			facts: [['r.total', d.total ?? 0]],
			tables: [{ head: ['col.name', 'col.length', 'col.pattern', 'col.score'], rows: list(d.names).map((n) => [`${n.name}.com`, n.length, str(n.pattern), n.score]) }],
			notes: [{ key: 'note.checkAvail' }],
		}),
	},
	{
		id: 'calendar',
		fields: [
			{ id: 'days', label: 'f.days', type: 'select', value: '14', options: ['7', '14', '30', '60'].map((v) => ({ value: v, text: v })) },
			{ id: 'stage', label: 'f.stage', type: 'select', value: 'any', options: [{ value: 'any', key: 'opt.any' }, { value: 'pending_delete', key: 'opt.pending' }, { value: 'redemption', key: 'opt.redemption' }] },
			{ id: 'min_score', label: 'f.minScore', type: 'text', maxlength: 3, placeholder: '0' },
			{ id: 'contains', label: 'f.contains', type: 'text', maxlength: 12 },
		],
		request: (v) => ({ route: 'calendar', params: { days: v.days, stage: v.stage, min_score: String(v.min_score || '').replace(/\D/g, ''), contains: String(v.contains || '').toLowerCase().replace(/[^a-z0-9-]/g, '') } }),
		view: (d) => {
			const rows = [];
			for (const day of list(d.days)) for (const n of list(day.names)) rows.push([day.date, `${n.domain}.com`, str(n.stage), n.score === null || n.score === undefined ? '' : n.score]);
			return { facts: [['r.total', d.total ?? rows.length], ['r.shown', d.shown ?? rows.length]], tables: [{ head: ['col.date', 'col.name', 'col.stage', 'col.score'], rows }], notes: [{ key: 'note.estimates' }] };
		},
	},
];

export const toolById = (id) => TOOLS.find((t) => t.id === id);

/**
 * The audit runs on the server for up to a minute: the first call starts it (and costs more), later calls with poll=1 only read.
 * onProgress({ done, total, seconds }) after each poll. Returns the final answer, or throws {slow: true} when maxMs passes.
 */
export async function runAudit(api, name, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)), onProgress, maxMs = 150000, stepMs = 4000 } = {}) {
	let res = await api.get('audit', { name });
	const started = Date.now();
	while (res.state === 'running') {
		const stages = list(res.stages);
		if (onProgress) onProgress({ done: stages.filter((s) => s.state === 'done').length, total: stages.length, seconds: res.elapsed ?? Math.round((Date.now() - started) / 1000) });
		if (Date.now() - started > maxMs) {
			const e = new Error('slow');
			e.slow = true;
			throw e;
		}
		await sleep(stepMs);
		res = await api.get('audit', { name, poll: 1 });
	}
	return res;
}
