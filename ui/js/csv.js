// CSV export of check results. Cells that start with = + - @ get a leading apostrophe so a spreadsheet never runs them as formulas.

function cell(value) {
	let s = value === null || value === undefined ? '' : String(value);
	if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
	return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows) {
	const head = ['name', 'status', 'in_zone', 'registrar', 'estimated_drop', 'checked'];
	const lines = [head.join(',')];
	for (const r of rows) {
		lines.push([`${r.domain}.com`, r.status, r.in_zone ? 'yes' : 'no', r.provider || '', r.est_drop || '', r.checked || ''].map(cell).join(','));
	}
	return lines.join('\r\n') + '\r\n';
}
