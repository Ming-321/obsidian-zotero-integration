import type {DiffEntry, ZoteroItemMeta} from "../types";

/**
 * Compare two sets of Zotero metadata and produce a list of diff operations.
 *
 * @param newData - Freshly parsed data from the BBT export
 * @param existingKeys - Set of citation keys currently present as stub files
 * @param existingMeta - Optional map of existing metadata for change detection
 * @returns Array of create/update/delete operations
 */
export function computeDiff(
	newData: Map<string, ZoteroItemMeta>,
	existingKeys: Set<string>,
	existingMeta?: Map<string, ZoteroItemMeta>,
): DiffEntry[] {
	const ops: DiffEntry[] = [];

	// Items to create or update
	for (const [citekey, meta] of newData) {
		if (!existingKeys.has(citekey)) {
			ops.push({action: "create", citekey, meta});
		} else if (!existingMeta) {
			// Without existing metadata to compare, always update to ensure data is fresh
			ops.push({action: "update", citekey, meta});
		} else if (hasChanged(existingMeta.get(citekey), meta)) {
			ops.push({action: "update", citekey, meta});
		}
	}

	// Items to delete (exist locally but not in new export)
	for (const citekey of existingKeys) {
		if (!newData.has(citekey)) {
			ops.push({action: "delete", citekey});
		}
	}

	return ops;
}

/**
 * Check if metadata has changed between existing and new versions.
 * Uses a shallow comparison of the key fields.
 */
function hasChanged(
	existing: ZoteroItemMeta | undefined,
	updated: ZoteroItemMeta,
): boolean {
	if (!existing) return true;

	if (existing.title !== updated.title) return true;
	if (existing.year !== updated.year) return true;
	if (existing.type !== updated.type) return true;
	if (existing.journal !== updated.journal) return true;
	if (existing.zoteroUri !== updated.zoteroUri) return true;

	if (!arraysEqual(existing.authors, updated.authors)) return true;
	if (!arraysEqual(existing.tags, updated.tags)) return true;

	return false;
}

/** Simple shallow array equality check for string arrays. */
function arraysEqual(a: string[], b: string[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}
