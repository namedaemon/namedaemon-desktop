// NameDaemon desktop: the window's behaviour. Pure logic lives in names.js, api.js, csv.js, watch.js and i18n.js (tested with node --test).
import { parseNames } from './names.js';
import { createApi } from './api.js';
import { toCsv } from './csv.js';
import { changes, snapshot, intervalMs } from './watch.js';
import { LANGS, pickLang, makeT } from './i18n.js';

const VERSION = '0.1.0';
const TAURI = window.__TAURI__ || null; // present in the app (withGlobalTauri), absent when the page is opened in a browser for development
const $ = (id) => document.getElementById(id);
const KEY_WATCH = 'nd.watch';
const KEY_SETTINGS = 'nd.settings';

let t = (k) => k;
let apiKey = '';
let lastResults = [];
let lastAsOf = '';
let watchTimer = null;

// ---- storage -------------------------------------------------------------
function load(key, fallback) {
	try {
		const v = JSON.parse(localStorage.getItem(key));
		return v && typeof v === 'object' ? { ...fallback, ...v } : fallback;
	} catch {
		return fallback;
	}
}
const save = (key, value) => {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* storage full or blocked: the app still works for this session */
	}
};
const getWatch = () => load(KEY_WATCH, { names: [], status: {}, estDrop: {}, checked: '' });
const getSettings = () => load(KEY_SETTINGS, { hours: 6, lang: '', tray: true });

// ---- translation ---------------------------------------------------------
async function loadLang(lang) {
	const read = async (l) => (await fetch(`locales/${l}.json`)).json();
	const en = await read('en');
	const cat = lang === 'en' ? en : await read(lang);
	t = makeT(cat, en);
	document.documentElement.lang = lang;
	for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
	$('names').placeholder = t('check.placeholder');
	$('version').textContent = t('settings.version', { version: VERSION });
	renderWatch();
	if (lastResults.length) renderResults();
	if (TAURI) TAURI.core.invoke('set_tray_labels', { open: t('tray.open'), clipboard: t('tray.clipboard'), tools: t('tray.tools'), quit: t('tray.quit') }).catch(() => {});
}

// ---- API -----------------------------------------------------------------
function api() {
	const f = TAURI && TAURI.http ? TAURI.http.fetch : window.fetch.bind(window);
	return createApi({ fetch: f, apiKey, userAgent: `namedaemon-desktop/${VERSION}`, retries: 1 });
}

function errorText(e) {
	if (e && e.status === 429) return t('err.rate', { seconds: e.retryAfter || 60 });
	if (e && e.code === 'network') return t('err.network');
	return t('err.generic', { message: (e && e.message) || String(e) });
}

function setText(id, text, isError = false) {
	const el = $(id);
	el.textContent = text;
	el.classList.toggle('err', isError);
}

// ---- tabs ----------------------------------------------------------------
function showTab(name) {
	for (const b of document.querySelectorAll('.tab')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
	for (const id of ['check', 'watch', 'settings']) $(`tab-${id}`).hidden = id !== name;
}

// ---- results -------------------------------------------------------------
function statusCell(status) {
	const td = document.createElement('td');
	const span = document.createElement('span');
	span.className = `st st--${status}`;
	span.textContent = t(`status.${status}`) === `status.${status}` ? status : t(`status.${status}`);
	td.append(span);
	return td;
}

function cell(text) {
	const td = document.createElement('td');
	td.textContent = text || '';
	return td;
}

function renderResults() {
	const body = $('results').tBodies[0];
	body.replaceChildren();
	for (const r of lastResults) {
		const tr = document.createElement('tr');
		tr.append(cell(`${r.domain}.com`), statusCell(r.status), cell(r.provider), cell(r.est_drop));
		body.append(tr);
	}
	$('results-wrap').hidden = lastResults.length === 0;
	$('as-of').textContent = lastAsOf ? t('check.asOf', { date: lastAsOf }) : '';
}

async function runCheck() {
	const { labels, rejected } = parseNames($('names').value);
	if (!labels.length) {
		setText('check-status', t('check.none'), true);
		return;
	}
	$('check-btn').disabled = true;
	setText('check-status', t('check.progress', { done: 0, total: labels.length }));
	try {
		const { results, dataAsOf } = await api().checkAll(labels, { onProgress: (d, n) => setText('check-status', t('check.progress', { done: d, total: n })) });
		const stamp = new Date().toISOString().slice(0, 10);
		lastResults = results.map((r) => ({ ...r, checked: stamp }));
		lastAsOf = dataAsOf;
		renderResults();
		setText('check-status', rejected.length ? t('check.rejected', { list: rejected.join(', ') }) : '');
	} catch (e) {
		setText('check-status', errorText(e), true);
	} finally {
		$('check-btn').disabled = false;
	}
}

async function pasteClipboard() {
	try {
		const text = TAURI && TAURI.clipboardManager ? await TAURI.clipboardManager.readText() : await navigator.clipboard.readText();
		if (text) $('names').value = text.slice(0, 5000);
	} catch {
		/* clipboard not readable: leave the box as it is */
	}
}

async function exportCsv() {
	if (!lastResults.length) return;
	const csv = toCsv(lastResults);
	const name = `namedaemon-${new Date().toISOString().slice(0, 10)}.csv`;
	if (TAURI) {
		const path = await TAURI.dialog.save({ defaultPath: name, filters: [{ name: 'CSV', extensions: ['csv'] }] });
		if (path) await TAURI.core.invoke('save_text_file', { path, content: csv });
	} else {
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
		a.download = name;
		a.click();
	}
}

// ---- watchlist -----------------------------------------------------------
function addToWatch(labels) {
	const w = getWatch();
	let added = 0;
	for (const l of labels) {
		if (!w.names.includes(l)) {
			w.names.push(l);
			added++;
		}
	}
	save(KEY_WATCH, w);
	renderWatch();
	return added;
}

function renderWatch() {
	const w = getWatch();
	const body = $('watch-table').tBodies[0];
	body.replaceChildren();
	for (const l of w.names) {
		const tr = document.createElement('tr');
		const status = w.status[l];
		tr.append(cell(`${l}.com`), status ? statusCell(status) : cell('—'), cell(w.estDrop[l] || ''));
		const td = document.createElement('td');
		const b = document.createElement('button');
		b.className = 'linklike';
		b.textContent = t('watch.remove');
		b.addEventListener('click', () => removeFromWatch(l));
		td.append(b);
		tr.append(td);
		body.append(tr);
	}
	$('watch-table').hidden = w.names.length === 0;
	$('watch-empty').hidden = w.names.length > 0;
	$('watch-last').textContent = w.checked ? t('watch.lastChecked', { time: new Date(w.checked).toLocaleString() }) : t('watch.never');
}

function removeFromWatch(label) {
	const w = getWatch();
	w.names = w.names.filter((n) => n !== label);
	delete w.status[label];
	delete w.estDrop[label];
	save(KEY_WATCH, w);
	renderWatch();
}

async function notify(title, body) {
	if (!TAURI || !TAURI.notification) return;
	try {
		let ok = await TAURI.notification.isPermissionGranted();
		if (!ok) ok = (await TAURI.notification.requestPermission()) === 'granted';
		if (ok) TAURI.notification.sendNotification({ title, body });
	} catch {
		/* notifications unavailable on this system */
	}
}

let watching = false;
async function checkWatchlist({ quiet = false } = {}) {
	if (watching) return;
	const w = getWatch();
	if (!w.names.length) return;
	watching = true;
	$('watch-now').disabled = true;
	if (!quiet) setText('watch-status', t('watch.checking'));
	try {
		const { results } = await api().checkAll(w.names);
		const found = changes(w.status, results);
		w.status = { ...w.status, ...snapshot(results) };
		for (const r of results) w.estDrop[r.domain] = r.est_drop || '';
		w.checked = new Date().toISOString();
		save(KEY_WATCH, w);
		renderWatch();
		setText('watch-status', '');
		for (const c of found) {
			const st = (s) => t(`status.${s}`);
			notify(t('watch.notifyTitle', { name: c.label }), t('watch.notifyBody', { status: st(c.to), before: st(c.from) }) + (c.estDrop ? t('watch.notifyDrop', { date: c.estDrop }) : ''));
		}
	} catch (e) {
		if (!quiet) setText('watch-status', errorText(e), true);
	} finally {
		watching = false;
		$('watch-now').disabled = false;
	}
}

function scheduleWatch() {
	if (watchTimer) clearInterval(watchTimer);
	watchTimer = setInterval(() => checkWatchlist({ quiet: true }), intervalMs(getSettings().hours));
}

// ---- settings ------------------------------------------------------------
async function readKey() {
	if (!TAURI) return '';
	try {
		return (await TAURI.core.invoke('get_api_key')) || '';
	} catch {
		return '';
	}
}

async function saveSettings() {
	const s = { hours: Number($('set-hours').value) || 6, lang: $('set-lang').value, tray: $('set-tray').checked };
	save(KEY_SETTINGS, s);
	apiKey = $('set-key').value.trim();
	let keyringOk = true;
	if (TAURI) {
		try {
			await TAURI.core.invoke('set_api_key', { key: apiKey });
		} catch {
			keyringOk = false;
		}
		TAURI.core.invoke('set_hide_on_close', { hide: s.tray }).catch(() => {});
	}
	$('keyring-warn').hidden = keyringOk || !apiKey;
	scheduleWatch();
	try {
		await loadLang(s.lang);
	} catch {
		/* keep the current language */
	}
	setText('set-status', t('settings.saved'));
	setTimeout(() => setText('set-status', ''), 2500);
}

// ---- start ---------------------------------------------------------------
async function start() {
	const s = getSettings();
	const lang = LANGS.includes(s.lang) ? s.lang : pickLang(navigator.languages || [navigator.language]);
	$('set-lang').value = lang;
	$('set-hours').value = s.hours;
	$('set-tray').checked = s.tray !== false;
	apiKey = await readKey();
	$('set-key').value = apiKey;
	try {
		await loadLang(lang);
	} catch {
		/* translations could not be read: the English text in the page stays, and the buttons below still work */
	}

	for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => showTab(b.dataset.tab));
	$('check-btn').addEventListener('click', runCheck);
	$('paste-btn').addEventListener('click', pasteClipboard);
	$('export-btn').addEventListener('click', exportCsv);
	$('addwatch-btn').addEventListener('click', () => setText('check-status', t('check.addedWatch', { n: addToWatch(lastResults.map((r) => r.domain)) })));
	$('watch-add').addEventListener('click', () => {
		addToWatch(parseNames($('watch-names').value).labels);
		$('watch-names').value = '';
	});
	$('watch-now').addEventListener('click', () => checkWatchlist());
	$('set-save').addEventListener('click', saveSettings);
	$('open-tools').addEventListener('click', () => TAURI && TAURI.core.invoke('open_tools'));
	$('names').addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runCheck();
	});

	if (TAURI) {
		TAURI.core.invoke('set_hide_on_close', { hide: s.tray !== false }).catch(() => {});
		TAURI.event.listen('clipboard-name', (ev) => {
			showTab('check');
			$('names').value = String(ev.payload || '').slice(0, 5000);
			runCheck();
		});
		TAURI.event.listen('show-tab', (ev) => showTab(String(ev.payload || 'check')));
	}
	scheduleWatch();
	setTimeout(() => checkWatchlist({ quiet: true }), 5000);
}

start();
