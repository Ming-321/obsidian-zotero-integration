import type {CslJsonItem, ZoteroItemMeta} from "../types";
import {extractYear, formatCslName, splitKeywords} from "../utils/helpers";

/**
 * Parse a Better CSL JSON export string into an array of CSL items.
 * @throws Error if the JSON is invalid or not an array.
 */
export function parseCslJson(jsonString: string): CslJsonItem[] {
	const parsed: unknown = JSON.parse(jsonString);

	if (!Array.isArray(parsed)) {
		throw new Error("Better CSL JSON export must be a JSON array");
	}

	return parsed as CslJsonItem[];
}

/**
 * Extract the Zotero item key from a CSL JSON item id.
 *
 * BBT exports the id in different formats:
 * - Simple key: "ABC123"
 * - Library format: "12047273/KC6WFG78"
 * - URL format: "http://zotero.org/users/.../items/ABC123"
 */
function extractItemKey(id: string | number): string {
	const idStr = String(id);

	// URL format
	const urlMatch = idStr.match(/\/items\/([A-Z0-9]+)$/i);
	if (urlMatch?.[1]) {
		return urlMatch[1];
	}

	// Library/key format (e.g. "12345/ABC123")
	if (idStr.includes("/")) {
		const parts = idStr.split("/");
		const last = parts[parts.length - 1];
		if (last) return last;
	}

	// Simple key
	return idStr;
}

/**
 * Convert a single CSL JSON item to normalized plugin metadata.
 * Returns null if the item lacks a citation key (unusable without it).
 */
export function cslItemToMeta(item: CslJsonItem): ZoteroItemMeta | null {
	const citekey = item["citation-key"];
	if (!citekey) {
		return null;
	}

	const authors = (item.author ?? [])
		.map(formatCslName)
		.filter(name => name.length > 0);

	const year = item.issued
		? extractYear(item.issued["date-parts"])
		: null;

	const tags = splitKeywords(item.keyword);

	const itemKey = extractItemKey(item.id);
	const zoteroUri = `zotero://select/library/items/${itemKey}`;

	return {
		citekey,
		title: item.title ?? "Untitled",
		authors,
		year,
		type: item.type ?? "document",
		journal: item["container-title"] ?? "",
		tags,
		zoteroUri,
	};
}

/**
 * Parse a full Better CSL JSON export into a Map of citekey → metadata.
 * Items without citation keys are skipped.
 */
export function parseExport(jsonString: string): Map<string, ZoteroItemMeta> {
	const items = parseCslJson(jsonString);
	const result = new Map<string, ZoteroItemMeta>();

	for (const item of items) {
		const meta = cslItemToMeta(item);
		if (meta) {
			result.set(meta.citekey, meta);
		}
	}

	return result;
}
