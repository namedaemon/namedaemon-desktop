// The part of the NameDaemon public API this app uses (https://namedaemon.com/wp-json/nd/v1).
// Standard fetch only. In the app the fetch is Tauri's HTTP plugin (no browser CORS, and it can set the User-Agent and X-ND-API-Key headers).
import { chunk } from './names.js';

export const DEFAULT_BASE_URL = 'https://namedaemon.com/wp-json/nd/v1';

export class ApiError extends Error {
	constructor(message, { status = 0, code = '', retryAfter = 0 } = {}) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
		this.code = code;
		this.retryAfter = retryAfter;
	}
}

export function createApi({ fetch, baseUrl = DEFAULT_BASE_URL, apiKey = '', userAgent = 'namedaemon-desktop', retries = 1, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), timeoutMs = 25000 } = {}) {
	if (typeof fetch !== 'function') throw new ApiError('No fetch available');
	const root = baseUrl.replace(/\/+$/, '');

	async function request(method, path, { params, body } = {}) {
		const query = Object.entries(params || {})
			.filter(([, v]) => v !== undefined && v !== null && v !== '')
			.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(Array.isArray(v) ? v.join(',') : v)}`)
			.join('&');
		const url = `${root}/${path.replace(/^\/+/, '')}${query ? `?${query}` : ''}`;
		for (let attempt = 0; ; attempt++) {
			const headers = { Accept: 'application/json', 'User-Agent': userAgent };
			if (body !== undefined) headers['Content-Type'] = 'application/json';
			if (apiKey) headers['X-ND-API-Key'] = apiKey;
			const ctl = typeof AbortController === 'function' ? new AbortController() : null;
			const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
			let res;
			try {
				res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctl ? ctl.signal : undefined });
			} catch (e) {
				throw new ApiError(e && e.name === 'AbortError' ? 'timeout' : `network: ${e && e.message ? e.message : e}`, { code: 'network' });
			} finally {
				if (timer) clearTimeout(timer);
			}
			const text = await res.text();
			let json = null;
			try {
				json = text ? JSON.parse(text) : null;
			} catch {
				json = null;
			}
			if (res.ok) {
				if (json === null) throw new ApiError('not json', { status: res.status, code: 'bad_response' });
				return json;
			}
			const code = (json && json.code) || '';
			const message = (json && json.message) || `HTTP ${res.status}`;
			if (res.status === 429) {
				let retryAfter = Number(res.headers && res.headers.get ? res.headers.get('retry-after') : 0);
				if (!Number.isFinite(retryAfter) || retryAfter <= 0) retryAfter = 60;
				if (attempt < retries) {
					await sleep(Math.min(retryAfter, 60) * 1000);
					continue;
				}
				throw new ApiError(message, { status: 429, code: code || 'rate_limited', retryAfter });
			}
			throw new ApiError(message, { status: res.status, code });
		}
	}

	const post = (path, body) => request('POST', path, { body });

	return {
		/** Any public GET route with query parameters; empty values are dropped. */
		get: (path, params) => request('GET', path, { params }),
		/** Status of up to 50 names. */
		check: (labels, verify = 0) => post('check', { domains: labels, verify }),
		/**
		 * Any number of names, 50 per request, in order. onProgress(done, total) after each request.
		 * @returns {Promise<{results: object[], dataAsOf: string}>}
		 */
		async checkAll(labels, { verify = 0, onProgress } = {}) {
			const results = [];
			let dataAsOf = '';
			const parts = chunk(labels);
			let done = 0;
			for (const part of parts) {
				const r = await post('check', { domains: part, verify: Math.min(verify, part.length, 10) });
				results.push(...(r.results || []));
				dataAsOf = r.data_as_of || dataAsOf;
				done += part.length;
				if (onProgress) onProgress(done, labels.length);
			}
			return { results, dataAsOf };
		},
	};
}
