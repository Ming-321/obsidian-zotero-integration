/**
 * TypeScript type definitions for the Zotero Bases Integration plugin.
 */

// --- CSL JSON Types (Better CSL JSON export format) ---

/** CSL JSON name variable (author, editor, etc.) */
export interface CslNameVariable {
	family?: string;
	given?: string;
	literal?: string;
	"dropping-particle"?: string;
	"non-dropping-particle"?: string;
	suffix?: string;
}

/** CSL JSON date variable */
export interface CslDateVariable {
	"date-parts"?: (string | number)[][];
	literal?: string;
	raw?: string;
}

/** A single item in Better CSL JSON export */
export interface CslJsonItem {
	id: string | number;
	type: string;
	"citation-key"?: string;
	title?: string;
	author?: CslNameVariable[];
	editor?: CslNameVariable[];
	issued?: CslDateVariable;
	"container-title"?: string;
	keyword?: string;
	DOI?: string;
	URL?: string;
	abstract?: string;
	publisher?: string;
	"publisher-place"?: string;
	volume?: string | number;
	issue?: string | number;
	page?: string | number;
	ISBN?: string;
	ISSN?: string;
	language?: string;
	[key: string]: unknown;
}

// --- Internal Plugin Types ---

/** Normalized metadata extracted from a CSL JSON item */
export interface ZoteroItemMeta {
	/** BBT citation key (used as file name and unique identifier) */
	citekey: string;
	/** Item title */
	title: string;
	/** Formatted author names */
	authors: string[];
	/** Publication year */
	year: number | null;
	/** CSL item type (e.g. "article-journal", "book") */
	type: string;
	/** Journal / container title */
	journal: string;
	/** Tags extracted from keyword field */
	tags: string[];
	/** Zotero URI for opening the item in Zotero */
	zoteroUri: string;
}

/** Diff operation types */
export type DiffAction = "create" | "update" | "delete";

/** A single diff operation */
export interface DiffEntry {
	action: DiffAction;
	citekey: string;
	/** New metadata (present for create/update) */
	meta?: ZoteroItemMeta;
}

/** Sync result summary */
export interface SyncResult {
	created: number;
	updated: number;
	deleted: number;
	errors: string[];
}
