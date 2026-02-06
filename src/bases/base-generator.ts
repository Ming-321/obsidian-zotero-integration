import {Vault, normalizePath} from "obsidian";

/**
 * Default .base file name.
 */
const BASE_FILE_NAME = "Zotero Library.base";

/**
 * Generate the YAML content for a pre-configured .base file.
 */
function generateBaseContent(stubFolder: string): string {
	return `filters:
  - file.inFolder("${stubFolder}")
properties:
  title:
    displayName: Title
  authors:
    displayName: Authors
  year:
    displayName: Year
  type:
    displayName: Type
  journal:
    displayName: Journal
  tags:
    displayName: Tags
  citekey:
    displayName: Citation Key
views:
  - type: table
    name: All references
    order:
      - title
      - authors
      - year
      - type
      - journal
      - tags
  - type: table
    name: By type
    groupBy:
      property: type
      direction: ASC
    order:
      - title
      - authors
      - year
      - journal
  - type: cards
    name: By tag
    groupBy:
      property: tags
      direction: ASC
`;
}

/**
 * Create a pre-configured .base file in the vault root (or next to the stub folder).
 * Will NOT overwrite an existing .base file to preserve user customizations.
 *
 * @param vault - The Obsidian vault instance
 * @param stubFolder - The stub folder name
 * @returns true if the file was created, false if it already exists
 */
export async function createBaseFile(
	vault: Vault,
	stubFolder: string,
): Promise<boolean> {
	const basePath = normalizePath(BASE_FILE_NAME);

	// Don't overwrite existing base file
	const existing = vault.getFileByPath(basePath);
	if (existing) {
		return false;
	}

	const content = generateBaseContent(stubFolder);
	await vault.create(basePath, content);
	return true;
}

/**
 * Get the path of the base file.
 */
export function getBaseFilePath(): string {
	return normalizePath(BASE_FILE_NAME);
}
