import {Notice, Plugin} from "obsidian";
import {DEFAULT_SETTINGS, ZoteroBasesSettings, ZoteroBasesSettingTab} from "./settings";
import {ExportWatcher} from "./sync/watcher";
import {createBaseFile, getBaseFilePath} from "./bases/base-generator";

export default class ZoteroBasesPlugin extends Plugin {
	settings: ZoteroBasesSettings;
	private watcher: ExportWatcher | null = null;

	async onload() {
		await this.loadSettings();

		// Register commands
		this.addCommand({
			id: "zotero-bases-sync",
			name: "Sync Zotero library",
			callback: () => this.triggerSync(),
		});

		this.addCommand({
			id: "zotero-bases-open-base",
			name: "Open Zotero library view",
			callback: () => this.openBaseFile(),
		});

		// Register settings tab
		this.addSettingTab(new ZoteroBasesSettingTab(this.app, this));

		// Start watcher after layout is ready (vault fully loaded)
		this.app.workspace.onLayoutReady(() => {
			if (this.settings.exportFilePath && this.settings.autoSync) {
				this.startWatcher();
			}
		});
	}

	onunload() {
		this.stopWatcher();
	}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData() as Partial<ZoteroBasesSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	/**
	 * Trigger a manual sync from the BBT export file.
	 */
	async triggerSync(): Promise<void> {
		if (!this.settings.exportFilePath) {
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			new Notice("Please configure the BBT export file path in settings.");
			return;
		}

		// Ensure watcher exists (even for manual sync)
		if (!this.watcher) {
			this.watcher = new ExportWatcher(
				this.app,
				this.settings.exportFilePath,
				this.settings.stubFolder,
			);
		}

		const result = await this.watcher.manualSync();

		// Create the .base file on first sync if it doesn't exist
		if (result.created > 0 || result.updated > 0) {
			const created = await createBaseFile(
				this.app.vault,
				this.settings.stubFolder,
			);
			if (created) {
				new Notice("Created Zotero library base view file.");
			}
		}
	}

	/**
	 * Open the .base file in the workspace.
	 */
	async openBaseFile(): Promise<void> {
		const basePath = getBaseFilePath();
		const file = this.app.vault.getFileByPath(basePath);

		if (!file) {
			new Notice("Zotero library base not found. Run a sync first.");
			return;
		}

		await this.app.workspace.getLeaf(false).openFile(file);
	}

	/**
	 * Start the file watcher for automatic sync.
	 */
	private startWatcher(): void {
		if (this.watcher) {
			this.watcher.stop();
		}

		this.watcher = new ExportWatcher(
			this.app,
			this.settings.exportFilePath,
			this.settings.stubFolder,
		);

		if (this.settings.autoSync) {
			this.watcher.start();
		}
	}

	/**
	 * Stop the file watcher.
	 */
	private stopWatcher(): void {
		if (this.watcher) {
			this.watcher.stop();
			this.watcher = null;
		}
	}

	/**
	 * Restart the watcher (called when settings change).
	 */
	restartWatcher(): void {
		this.stopWatcher();
		if (this.settings.exportFilePath && this.settings.autoSync) {
			this.startWatcher();
		}
	}
}
