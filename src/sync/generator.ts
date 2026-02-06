import {App, Notice, Vault, normalizePath} from "obsidian";
import type {DiffEntry, SyncResult, ZoteroItemMeta} from "../types";
import {buildStubContent, stubFilePath} from "../utils/helpers";

/** Maximum number of file operations per batch to avoid blocking the UI. */
const BATCH_SIZE = 50;

/** Delay between batches in milliseconds. */
const BATCH_DELAY_MS = 50;

/**
 * Apply a list of diff operations to the vault, creating/updating/deleting stub files.
 *
 * @param vault - The Obsidian vault instance
 * @param folderName - The stub folder name within the vault
 * @param ops - The diff operations to apply
 * @returns Summary of operations performed
 */
export async function applyDiff(
	app: App,
	folderName: string,
	ops: DiffEntry[],
): Promise<SyncResult> {
	const vault = app.vault;
	const result: SyncResult = {created: 0, updated: 0, deleted: 0, errors: []};

	if (ops.length === 0) {
		return result;
	}

	// Ensure the stub folder exists
	await ensureFolder(vault, folderName);

	// Process in batches to avoid blocking UI
	for (let i = 0; i < ops.length; i += BATCH_SIZE) {
		const batch = ops.slice(i, i + BATCH_SIZE);

		for (const op of batch) {
			try {
				switch (op.action) {
					case "create":
						await createStub(vault, folderName, op.meta!);
						result.created++;
						break;
					case "update":
						await updateStub(vault, folderName, op.meta!);
						result.updated++;
						break;
					case "delete":
						await deleteStub(app, folderName, op.citekey);
						result.deleted++;
						break;
				}
			} catch (err) {
				const msg = `Failed to ${op.action} stub for ${op.citekey}: ${String(err)}`;
				result.errors.push(msg);
				console.error(`[ZoteroBases] ${msg}`);
			}
		}

		// Yield to the event loop between batches
		if (i + BATCH_SIZE < ops.length) {
			await sleep(BATCH_DELAY_MS);
		}
	}

	return result;
}

/** Create a new stub file. */
async function createStub(
	vault: Vault,
	folderName: string,
	meta: ZoteroItemMeta,
): Promise<void> {
	const path = stubFilePath(folderName, meta.citekey);
	const content = buildStubContent(meta);
	await vault.create(path, content);
}

/** Update an existing stub file, preserving user notes in the body. */
async function updateStub(
	vault: Vault,
	folderName: string,
	meta: ZoteroItemMeta,
): Promise<void> {
	const path = stubFilePath(folderName, meta.citekey);
	const file = vault.getFileByPath(path);

	if (!file) {
		// File doesn't exist yet, create it instead
		await createStub(vault, folderName, meta);
		return;
	}

	// Read existing content to preserve user notes
	const existingContent = await vault.read(file);
	const userNotes = extractUserNotes(existingContent);

	const content = buildStubContent(meta);
	const finalContent = userNotes
		? content + "\n" + userNotes
		: content;

	await vault.modify(file, finalContent);
}

/** Delete a stub file using FileManager to respect user's deletion preference. */
async function deleteStub(
	app: App,
	folderName: string,
	citekey: string,
): Promise<void> {
	const filePath = stubFilePath(folderName, citekey);
	const file = app.vault.getFileByPath(filePath);
	if (file) {
		await app.fileManager.trashFile(file);
	}
}

/**
 * Extract user-added notes from a stub file.
 * User notes are everything after the first "[Open in Zotero](...)" line.
 */
function extractUserNotes(content: string): string {
	const markerIndex = content.indexOf("[Open in Zotero]");
	if (markerIndex === -1) {
		return "";
	}

	// Find the end of the Zotero link line
	const lineEnd = content.indexOf("\n", markerIndex);
	if (lineEnd === -1) {
		return "";
	}

	const afterMarker = content.substring(lineEnd + 1).trim();
	return afterMarker;
}

/** Ensure a folder exists in the vault, creating it if necessary. */
async function ensureFolder(vault: Vault, folderName: string): Promise<void> {
	const path = normalizePath(folderName);
	const folder = vault.getFolderByPath(path);
	if (!folder) {
		await vault.createFolder(path);
	}
}

/** Display a sync result summary as an Obsidian Notice. */
export function showSyncNotice(result: SyncResult): void {
	const parts: string[] = [];
	if (result.created > 0) parts.push(`${result.created} added`);
	if (result.updated > 0) parts.push(`${result.updated} updated`);
	if (result.deleted > 0) parts.push(`${result.deleted} deleted`);

	if (parts.length === 0 && result.errors.length === 0) {
		new Notice("Zotero library is up to date.");
		return;
	}

	let message = `Zotero sync: ${parts.join(", ") || "no changes"}`;
	if (result.errors.length > 0) {
		message += ` (${result.errors.length} error(s))`;
	}
	new Notice(message);
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}
