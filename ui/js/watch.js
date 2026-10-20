// Watchlist logic: what changed between two checks, and what is worth a notification.

/** Statuses that are worth telling the person about when a name moves into them. */
const NOTIFY_INTO = new Set(['dropping', 'available', 'taken']);

/**
 * @param {Record<string, string>} previous label -> last known status ('' or missing = never checked)
 * @param {object[]} results check results
 * @returns {{label: string, from: string, to: string, estDrop: string}[]} changes worth a notification
 */
export function changes(previous, results) {
	const out = [];
	for (const r of results) {
		const from = previous[r.domain] || '';
		const to = r.status;
		if (!from || from === to) continue; // first check only records; no change
		if (from === 'unknown' || to === 'unknown') continue; // a failed live check is noise, not news
		if (!NOTIFY_INTO.has(to)) continue;
		out.push({ label: r.domain, from, to, estDrop: r.est_drop || '' });
	}
	return out;
}

export function snapshot(results) {
	const m = {};
	for (const r of results) m[r.domain] = r.status;
	return m;
}

/** Milliseconds until the next check. */
export function intervalMs(hours) {
	const h = Number(hours);
	return (Number.isFinite(h) && h >= 1 ? Math.min(h, 168) : 6) * 3600 * 1000;
}
