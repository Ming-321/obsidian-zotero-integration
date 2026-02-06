import {App, debounce, FileSystemAdapter, Notice, Vault} from "obsidian";
import * as fs from "fs";
import * as path from "path";
import type {SyncResult, ZoteroItemMeta} from "../types";
import {parseExport} from "./parser";
import {computeDiff} from "./differ";
import {applyDiff, showSyncNotice} from "./generator";

/** Debounce delay for file change events (ms). */
const DEBOUNCE_MS = 500;

/**
 * Watches a BBT export JSON file and triggers sync when it changes.
 */
export class ExportWatcher {
	private app: App;
	private vault: Vault;
	private exportPath: string;
	private stubFolder: string;
	private fsWatcher: fs.FSWatcher | null = null;
	private debouncedSync: ReturnType<typeof debounce>;
	private isSyncing = false;

	constructor(app: App, exportPath: string, stubFolder: string) {
		this.app = app;
		this.vault = app.vault;
		this.exportPath = exportPath;
		this.stubFolder = stubFolder;
		this.debouncedSync = debounce(
			() => this.performSync(),
			DEBOUNCE_MS,
			true,
		);
	}

	/**
	 * Start watching the export file.
	 * Determines whether the file is inside or outside the vault
	 * and uses the appropriate watching mechanism.
	 */
	start(): void {
		this.startFsWatch();
	}

	/** Stop watching and clean up. */
	stop(): void {
		if (this.fsWatcher) {
			this.fsWatcher.close();
			this.fsWatcher = null;
		}
	}

	/** Update the export file path and restart watching. */
	updatePath(newPath: string): void {
		this.stop();
		this.exportPath = newPath;
		this.start();
	}

	/** Update the stub folder name. */
	updateStubFolder(newFolder: string): void {
		this.stubFolder = newFolder;
	}

	/**
	 * Perform a manual sync (can be called from command or settings).
	 * Returns the sync result.
	 */
	async manualSync(): Promise<SyncResult> {
		return this.performSync();
	}

	/**
	 * Core sync logic: read export file, compute diff, apply changes.
	 */
	private async performSync(): Promise<SyncResult> {
		if (this.isSyncing) {
			return {created: 0, updated: 0, deleted: 0, errors: ["Sync already in progress"]};
		}

		this.isSyncing = true;

		try {
			// Read the export file
			const jsonString = await this.readExportFile();
			if (!jsonString) {
				return {created: 0, updated: 0, deleted: 0, errors: ["Could not read export file"]};
			}

			// Parse the export
			let newData: Map<string, ZoteroItemMeta>;
			try {
				newData = parseExport(jsonString);
			} catch (err) {
				const msg = `Failed to parse BBT export: ${String(err)}`;
				new Notice(msg);
				return {created: 0, updated: 0, deleted: 0, errors: [msg]};
			}

			// Get existing stub files
			const existingKeys = this.getExistingStubKeys();

			// Compute diff (without deep metadata comparison for simplicity in v1,
			// we always update existing files to ensure they reflect latest data)
			const ops = computeDiff(newData, existingKeys);

			// Apply changes
			const result = await applyDiff(this.app, this.stubFolder, ops);
			showSyncNotice(result);
			return result;

		} catch (err) {
			const msg = `Sync failed: ${String(err)}`;
			console.error(`[ZoteroBases] ${msg}`);
			new Notice(msg);
			return {created: 0, updated: 0, deleted: 0, errors: [msg]};
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * Read the export file contents.
	 * Handles both vault-internal and external file paths.
	 */
	private async readExportFile(): Promise<string | null> {
		try {
			const resolvedPath = this.resolveExportPath();

			if (fs.existsSync(resolvedPath)) {
				return fs.readFileSync(resolvedPath, "utf-8");
			}

			// Try as vault-relative path
			const file = this.vault.getFileByPath(this.exportPath);
			if (file) {
				return await this.vault.read(file);
			}

			new Notice(`BBT export file not found: ${this.exportPath}`);
			return null;
		} catch (err) {
			console.error(`[ZoteroBases] Error reading export file: ${String(err)}`);
			return null;
		}
	}

	/**
	 * Resolve the export path to an absolute filesystem path.
	 */
	private resolveExportPath(): string {
		// If already absolute, return as-is
		if (path.isAbsolute(this.exportPath)) {
			return this.exportPath;
		}

		// Resolve relative to vault root
		const adapter = this.vault.adapter;
		if (adapter instanceof FileSystemAdapter) {
			return path.join(adapter.getBasePath(), this.exportPath);
		}

		return this.exportPath;
	}

	/**
	 * Get the set of citation keys from existing stub files.
	 */
	private getExistingStubKeys(): Set<string> {
		const keys = new Set<string>();
		const folder = this.vault.getFolderByPath(this.stubFolder);

		if (!folder) {
			return keys;
		}

		for (const child of folder.children) {
			if (child.name.endsWith(".md")) {
				// Remove .md extension to get the citekey
				keys.add(child.name.slice(0, -3));
			}
		}

		return keys;
	}

	/**
	 * Watch using Node.js fs.watch (works for any file path).
	 */
	private startFsWatch(): void {
		const resolvedPath = this.resolveExportPath();

		try {
			if (!fs.existsSync(resolvedPath)) {
				console.warn(`[ZoteroBases] Export file does not exist yet: ${resolvedPath}`);
				// Watch the parent directory for the file to appear
				const dir = path.dirname(resolvedPath);
				const fileName = path.basename(resolvedPath);

				if (fs.existsSync(dir)) {
					this.fsWatcher = fs.watch(dir, (eventType, changedFile) => {
						if (changedFile === fileName) {
							// File appeared, switch to watching the file directly
							this.stop();
							this.startFsWatch();
							this.debouncedSync();
						}
					});
				}
				return;
			}

			this.fsWatcher = fs.watch(resolvedPath, (eventType) => {
				if (eventType === "change") {
					this.debouncedSync();
				}
			});

			this.fsWatcher.on("error", (err) => {
				console.error(`[ZoteroBases] File watcher error: ${err}`);
				// Attempt to restart after a delay
				setTimeout(() => {
					this.stop();
					this.startFsWatch();
				}, 5000);
			});

		} catch (err) {
			console.error(`[ZoteroBases] Failed to start file watcher: ${String(err)}`);
		}
	}
}
