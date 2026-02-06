import {App, Notice, PluginSettingTab, Setting} from "obsidian";
import type ZoteroBasesPlugin from "./main";

export interface ZoteroBasesSettings {
	/** Path to the BBT auto-exported JSON file (absolute or vault-relative). */
	exportFilePath: string;
	/** Folder name within the vault to store stub files. */
	stubFolder: string;
	/** Whether automatic file watching is enabled. */
	autoSync: boolean;
}

export const DEFAULT_SETTINGS: ZoteroBasesSettings = {
	exportFilePath: "",
	stubFolder: "Zotero Library",
	autoSync: true,
};

export class ZoteroBasesSettingTab extends PluginSettingTab {
	plugin: ZoteroBasesPlugin;

	constructor(app: App, plugin: ZoteroBasesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Sync configuration")
			.setHeading();

		// --- Export file path ---
		new Setting(containerEl)
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setName("BBT export file path")
			.setDesc(
				"Path to the Better BibTeX auto-exported JSON file. " +
				"Can be an absolute path or relative to the vault root. " +
				"Use Better CSL JSON format in BBT."
			)
			.addText(text =>
				text
					.setPlaceholder("/path/to/library.json")
					.setValue(this.plugin.settings.exportFilePath)
					.onChange(async (value) => {
						this.plugin.settings.exportFilePath = value.trim();
						await this.plugin.saveSettings();
						// Restart watcher with new path
						this.plugin.restartWatcher();
					})
			);

		// --- Stub folder ---
		new Setting(containerEl)
			.setName("Stub folder name")
			.setDesc(
				"Folder name within the vault to store Zotero stub files. " +
				"Each Zotero item will have a lightweight .md file here."
			)
			.addText(text =>
				text
					.setPlaceholder("Zotero library")
					.setValue(this.plugin.settings.stubFolder)
					.onChange(async (value) => {
						this.plugin.settings.stubFolder = value.trim() || DEFAULT_SETTINGS.stubFolder;
						await this.plugin.saveSettings();
						// Update watcher with new stub folder
						this.plugin.restartWatcher();
					})
			);

		// --- Auto sync toggle ---
		new Setting(containerEl)
			.setName("Automatic sync")
			.setDesc(
				"Automatically sync when the BBT export file changes. " +
				"Disable to only sync manually via the command palette."
			)
			.addToggle(toggle =>
				toggle
					.setValue(this.plugin.settings.autoSync)
					.onChange(async (value) => {
						this.plugin.settings.autoSync = value;
						await this.plugin.saveSettings();
						this.plugin.restartWatcher();
					})
			);

		// --- Manual sync button ---
		new Setting(containerEl)
			.setName("Sync now")
			// eslint-disable-next-line obsidianmd/ui/sentence-case
			.setDesc("Manually trigger a full sync from the BBT export file.")
			.addButton(button =>
				button
					.setButtonText("Sync now")
					.setCta()
					.onClick(async () => {
						if (!this.plugin.settings.exportFilePath) {
							// eslint-disable-next-line obsidianmd/ui/sentence-case
							new Notice("Please configure the BBT export file path first.");
							return;
						}
						button.setDisabled(true);
						button.setButtonText("Syncing...");
						try {
							await this.plugin.triggerSync();
						} finally {
							button.setDisabled(false);
							button.setButtonText("Sync now");
						}
					})
			);
	}
}
