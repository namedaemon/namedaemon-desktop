// Turns what a person typed or pasted into clean .com labels.
// Accepts one name per line, or names separated by commas, semicolons or spaces; "Nova.com", "https://nova.com/x" and " NOVA " all become "nova".

export const MAX_PER_REQUEST = 50;
const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function cleanLabel(raw) {
	let s = String(raw || '').trim().toLowerCase();
	s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
	s = s.split(/[/?#]/)[0];
	s = s.replace(/\.com\.?$/, '');
	return s;
}

/** @returns {{labels: string[], rejected: string[]}} unique valid labels in input order, and the pieces that are not valid names. */
export function parseNames(text) {
	const labels = [];
	const rejected = [];
	const seen = new Set();
	for (const piece of String(text || '').split(/[\s,;]+/)) {
		if (!piece) continue;
		const label = cleanLabel(piece);
		if (!LABEL.test(label)) {
			rejected.push(piece);
			continue;
		}
		if (!seen.has(label)) {
			seen.add(label);
			labels.push(label);
		}
	}
	return { labels, rejected };
}

export function chunk(list, size = MAX_PER_REQUEST) {
	const out = [];
	for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
	return out;
}
