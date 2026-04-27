#!/usr/bin/env node
import { fileURLToPath } from "node:url";

//#region transliterate.mjs
const POLISH_MAP = {
	ą: "a",
	ć: "c",
	ę: "e",
	ł: "l",
	ń: "n",
	ó: "o",
	ś: "s",
	ź: "z",
	ż: "z",
	Ą: "A",
	Ć: "C",
	Ę: "E",
	Ł: "L",
	Ń: "N",
	Ó: "O",
	Ś: "S",
	Ź: "Z",
	Ż: "Z"
};
function polishToAscii(str) {
	return String(str).replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, (ch) => POLISH_MAP[ch] ?? ch);
}
function sanitizeFilename(str) {
	return polishToAscii(str).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._\s-]/g, "").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^[_.-]+|[_.-]+$/g, "");
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
	const input = process.argv.slice(2).join(" ");
	if (!input) {
		console.error("Usage: transliterate.mjs <string>");
		process.exit(1);
	}
	const out = sanitizeFilename(input);
	if (!out) {
		console.error("Input reduced to empty string after sanitization");
		process.exit(1);
	}
	console.log(out);
}

//#endregion
export { polishToAscii, sanitizeFilename };