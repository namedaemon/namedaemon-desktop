import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNames, cleanLabel, chunk } from '../js/names.js';
import { toCsv } from '../js/csv.js';
import { changes, snapshot, intervalMs } from '../js/watch.js';
import { pickLang, makeT } from '../js/i18n.js';
import { createApi, ApiError } from '../js/api.js';
import { readFileSync } from 'node:fs';

test('cleanLabel strips scheme, www, path and .com', () => {
	assert.equal(cleanLabel(' Nova.com '), 'nova');
	assert.equal(cleanLabel('https://www.nova.com/pricing?x=1'), 'nova');
	assert.equal(cleanLabel('NOVA'), 'nova');
});

test('parseNames splits on lines, commas and spaces, dedupes and rejects bad pieces', () => {
	const { labels, rejected } = parseNames('nova, novax\nNova.com;my brand  -bad- x_y');
	assert.deepEqual(labels, ['nova', 'novax', 'my', 'brand']);
	assert.deepEqual(rejected, ['-bad-', 'x_y']);
});

test('parseNames keeps hyphens inside and rejects names over 63 characters', () => {
	assert.deepEqual(parseNames('my-brand').labels, ['my-brand']);
	assert.equal(parseNames('a'.repeat(64)).rejected.length, 1);
	assert.equal(parseNames('a'.repeat(63)).labels.length, 1);
});

test('chunk splits in 50s', () => {
	const sizes = chunk(Array.from({ length: 120 }, (_, i) => `n${i}`)).map((c) => c.length);
	assert.deepEqual(sizes, [50, 50, 20]);
});

test('toCsv quotes, escapes and neutralises formulas', () => {
	const csv = toCsv([{ domain: 'nova', status: 'taken', in_zone: true, provider: 'Go,Daddy', est_drop: '', checked: '2026-10-20' }, { domain: '=cmd', status: 'taken', in_zone: false, provider: '"x"' }]);
	const lines = csv.trim().split('\r\n');
	assert.equal(lines[0], 'name,status,in_zone,registrar,estimated_drop,checked');
	assert.equal(lines[1], 'nova.com,taken,yes,"Go,Daddy",,2026-10-20');
	assert.equal(lines[2], "'=cmd.com,taken,no,\"\"\"x\"\"\",,");
});

test('changes: first check records only, real changes notify, unknown is noise', () => {
	const prev = { a: 'taken', b: 'taken', c: '', d: 'unknown', e: 'dropping' };
	const res = [
		{ domain: 'a', status: 'dropping', est_drop: '2026-11-01' },
		{ domain: 'b', status: 'taken' },
		{ domain: 'c', status: 'taken' },
		{ domain: 'd', status: 'available' },
		{ domain: 'e', status: 'taken' },
		{ domain: 'f', status: 'available' },
	];
	assert.deepEqual(changes(prev, res), [
		{ label: 'a', from: 'taken', to: 'dropping', estDrop: '2026-11-01' },
		{ label: 'e', from: 'dropping', to: 'taken', estDrop: '' },
	]);
	assert.deepEqual(snapshot(res).a, 'dropping');
});

test('intervalMs defaults to 6 hours and clamps', () => {
	assert.equal(intervalMs(undefined), 6 * 3600e3);
	assert.equal(intervalMs(0.5), 6 * 3600e3);
	assert.equal(intervalMs(1), 3600e3);
	assert.equal(intervalMs(1000), 168 * 3600e3);
});

test('pickLang and makeT', () => {
	assert.equal(pickLang(['de-AT', 'en']), 'de');
	assert.equal(pickLang(['ja']), 'en');
	const t = makeT({ hi: 'Hi {name}, {n} left' }, { only: 'English' });
	assert.equal(t('hi', { name: 'Ana', n: 3 }), 'Hi Ana, 3 left');
	assert.equal(t('only'), 'English');
	assert.equal(t('missing'), 'missing');
});

test('every locale has exactly the keys of en.json and keeps the placeholders', () => {
	const load = (l) => JSON.parse(readFileSync(new URL(`../locales/${l}.json`, import.meta.url), 'utf8'));
	const en = load('en');
	const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join();
	for (const l of ['es', 'fr', 'de']) {
		const c = load(l);
		assert.deepEqual(Object.keys(c).sort(), Object.keys(en).sort(), `${l} keys`);
		for (const k of Object.keys(en)) assert.equal(ph(c[k]), ph(en[k]), `${l}.${k} placeholders`);
	}
});

function fakeFetch(queue, calls = []) {
	return async (url, init) => {
		calls.push({ url, init });
		const r = queue.shift();
		return { ok: r.status >= 200 && r.status < 300, status: r.status, headers: { get: (k) => (r.headers || {})[k.toLowerCase()] ?? null }, text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body ?? null)) };
	};
}

test('api.check posts JSON with the user agent and key', async () => {
	const calls = [];
	const api = createApi({ fetch: fakeFetch([{ status: 200, body: { results: [{ domain: 'nova', status: 'taken' }] } }], calls), apiKey: 'k1', userAgent: 'namedaemon-desktop/0.1.0' });
	const r = await api.check(['nova']);
	assert.equal(r.results[0].status, 'taken');
	assert.equal(calls[0].url, 'https://namedaemon.com/wp-json/nd/v1/check');
	assert.equal(calls[0].init.headers['X-ND-API-Key'], 'k1');
	assert.equal(calls[0].init.headers['User-Agent'], 'namedaemon-desktop/0.1.0');
	assert.deepEqual(JSON.parse(calls[0].init.body), { domains: ['nova'], verify: 0 });
});

test('api.checkAll chunks by 50 and reports progress', async () => {
	const labels = Array.from({ length: 120 }, (_, i) => `n${i}`);
	const queue = [50, 50, 20].map((n) => ({ status: 200, body: { results: Array.from({ length: n }, () => ({ domain: 'x', status: 'taken' })), data_as_of: '2026-10-14' } }));
	const progress = [];
	const api = createApi({ fetch: fakeFetch(queue) });
	const { results, dataAsOf } = await api.checkAll(labels, { onProgress: (d, t) => progress.push([d, t]) });
	assert.equal(results.length, 120);
	assert.equal(dataAsOf, '2026-10-14');
	assert.deepEqual(progress, [[50, 120], [100, 120], [120, 120]]);
});

test('api waits and retries once on 429, then fails with retryAfter', async () => {
	const waits = [];
	const sleep = async (ms) => waits.push(ms);
	const ok = createApi({ fetch: fakeFetch([{ status: 429, headers: { 'retry-after': '7' }, body: { message: 'slow' } }, { status: 200, body: { results: [] } }]), sleep });
	await ok.check(['a']);
	assert.deepEqual(waits, [7000]);
	const bad = createApi({ fetch: fakeFetch([{ status: 429, body: {} }, { status: 429, body: {} }]), sleep });
	await assert.rejects(() => bad.check(['a']), (e) => e instanceof ApiError && e.status === 429 && e.retryAfter === 60);
});

test('api turns other failures and network errors into ApiError', async () => {
	const api = createApi({ fetch: fakeFetch([{ status: 400, body: { code: 'rest_invalid_param', message: 'Bad' } }]) });
	await assert.rejects(() => api.check(['a']), (e) => e.status === 400 && e.code === 'rest_invalid_param' && e.message === 'Bad');
	const down = createApi({ fetch: async () => { throw new Error('offline'); } });
	await assert.rejects(() => down.check(['a']), (e) => e.code === 'network');
});

test('live smoke (NAMEDAEMON_LIVE=1)', { skip: !process.env.NAMEDAEMON_LIVE }, async () => {
	const api = createApi({ fetch: globalThis.fetch, userAgent: 'namedaemon-desktop-test' });
	const { results } = await api.checkAll(['nova', 'example']);
	assert.equal(results.length, 2);
});
