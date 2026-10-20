// Tiny translation helper: whole sentences with {name} placeholders, one JSON file per language.
export const LANGS = ['en', 'es', 'fr', 'de'];

export function pickLang(preferred) {
	for (const p of [].concat(preferred || [])) {
		const short = String(p).toLowerCase().split('-')[0];
		if (LANGS.includes(short)) return short;
	}
	return 'en';
}

export function makeT(catalog, fallback = {}) {
	return (key, vars = {}) => {
		const s = catalog[key] ?? fallback[key] ?? key;
		return s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
	};
}
