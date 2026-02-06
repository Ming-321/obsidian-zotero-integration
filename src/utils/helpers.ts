import {normalizePath} from "obsidian";
import type {CslNameVariable} from "../types";

/**
 * Format a CSL name variable object into a readable string.
 * Handles both structured names ({family, given}) and literal names.
 */
export function formatCslName(name: CslNameVariable): string {
	if (name.literal) {
		return name.literal;
	}

	const parts: string[] = [];

	if (name.given) {
		parts.push(name.given);
	}
	if (name["non-dropping-particle"]) {
		parts.push(name["non-dropping-particle"]);
	}
	if (name.family) {
		parts.push(name.family);
	}
	if (name.suffix) {
		parts.push(name.suffix);
	}

	return parts.join(" ").trim();
}

/**
 * Extract year from a CSL date-parts structure.
 * date-parts format: [[year, month, day]] or [[year, month]] or [[year]]
 */
export function extractYear(dateParts?: (string | number)[][]): number | null {
	if (!dateParts || dateParts.length === 0) {
		return null;
	}
	const firstPart = dateParts[0];
	if (!firstPart || firstPart.length === 0) {
		return null;
	}
	const year = Number(firstPart[0]);
	return isNaN(year) ? null : year;
}

/**
 * Split a keyword string into individual tags.
 * Zotero typically uses semicolons, but commas are also supported.
 */
export function splitKeywords(keyword: string | undefined): string[] {
	if (!keyword || keyword.trim() === "") {
		return [];
	}
	return keyword
		.split(/[;,]/)
		.map(s => s.trim())
		.filter(s => s.length > 0);
}

/**
 * Sanitize a string for use as a file name.
 * Removes or replaces characters not allowed in file paths.
 */
export function sanitizeFileName(name: string): string {
	return name
		.replace(/[\\/:*?"<>|]/g, "-")
		.replace(/\s+/g, " ")
		.replace(/^\.+/, "")
		.trim();
}

/**
 * Construct the full vault path for a stub file.
 */
export function stubFilePath(folderName: string, citekey: string): string {
	const safeName = sanitizeFileName(citekey);
	return normalizePath(`${folderName}/${safeName}.md`);
}

/**
 * Escape a YAML string value (add quotes if needed).
 */
export function yamlString(value: string): string {
	if (
		value.includes(":") ||
		value.includes("#") ||
		value.includes("'") ||
		value.includes('"') ||
		value.includes("\n") ||
		value.startsWith(" ") ||
		value.endsWith(" ") ||
		value.startsWith("{") ||
		value.startsWith("[") ||
		value === "true" ||
		value === "false" ||
		value === "null" ||
		value === ""
	) {
		const escaped = value.replace(/"/g, '\\"');
		return `"${escaped}"`;
	}
	return value;
}

/**
 * Generate YAML frontmatter string from key-value pairs.
 */
export function generateFrontmatter(meta: Record<string, unknown>): string {
	const lines: string[] = ["---"];

	for (const [key, value] of Object.entries(meta)) {
		if (value === null || value === undefined) {
			continue;
		}

		if (Array.isArray(value)) {
			if (value.length === 0) continue;
			lines.push(`${key}:`);
			for (const item of value) {
				const str = typeof item === "string" ? item : JSON.stringify(item);
				lines.push(`  - ${yamlString(str)}`);
			}
		} else if (typeof value === "number") {
			lines.push(`${key}: ${String(value)}`);
		} else if (typeof value === "string") {
			lines.push(`${key}: ${yamlString(value)}`);
		} else {
			lines.push(`${key}: ${yamlString(JSON.stringify(value))}`);
		}
	}

	lines.push("---");
	return lines.join("\n");
}

/**
 * Build full stub file content from metadata.
 */
export function buildStubContent(meta: {
	title: string;
	authors: string[];
	year: number | null;
	type: string;
	journal: string;
	tags: string[];
	citekey: string;
	zoteroUri: string;
}): string {
	const frontmatter = generateFrontmatter({
		title: meta.title,
		authors: meta.authors,
		year: meta.year,
		type: meta.type,
		journal: meta.journal || null,
		tags: meta.tags,
		citekey: meta.citekey,
		"zotero-uri": meta.zoteroUri,
	});

	const body = `[Open in Zotero](${meta.zoteroUri})`;
	return `${frontmatter}\n${body}\n`;
}

/**
 * Extract the frontmatter portion from a markdown string.
 * Returns the content between the first --- and second ---.
 */
export function extractFrontmatterString(content: string): string | null {
	const match = content.match(/^---\n([\s\S]*?)\n---/);
	return match?.[1] ?? null;
}

/**
 * Extract the body content (after frontmatter) from a markdown string.
 * Preserves user-added notes below the Zotero link.
 */
export function extractBodyContent(content: string): string {
	const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
	return match?.[1] ?? "";
}
