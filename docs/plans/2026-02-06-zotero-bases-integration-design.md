# Zotero Bases Integration - 设计文档

**日期**: 2026-02-06
**状态**: 已确认（经官方文档验证）

## 概述

开发一个 Obsidian 插件，通过 Better BibTeX (BBT) 的自动导出功能将 Zotero 文献库数据同步到 Obsidian vault 中，以轻量 Markdown stub 文件的形式存储元数据，供 Obsidian Bases 核心插件进行数据库式浏览和查询。

## 核心目标

- 通过 Bases 视图（表格/卡片/分组）浏览 Zotero 文献库
- 避免重复存储：不复制文献内容（PDF 等），仅存储极轻量的元数据 stub
- 自动同步：Zotero 中的变更自动反映到 Obsidian
- 每个 stub 文件包含 `zotero://` 链接，可一键跳回 Zotero

## 约束

- 同步方向：Zotero → Obsidian（单向）
- 依赖：用户需安装 Better BibTeX Zotero 插件
- 平台：仅桌面端（`isDesktopOnly: true`），因为 Zotero 是桌面应用，且需要 Node.js 文件监听
- 目标文献库规模：500-2000 条目

## 数据流

```
用户操作 Zotero（添加/修改/删除文献）
        ↓
BBT 检测变化，自动重新导出 Better CSL JSON 文件
        ↓
插件监听 JSON 文件变化（debounce 500ms）
  - vault 内文件：通过 Obsidian vault.on('modify') 事件监听
  - vault 外文件：通过 Node.js fs.watch 监听
        ↓
插件解析 JSON，与 vault 内现有 stub 文件做差异比对
        ↓
插件创建/更新/删除 .md stub 文件（通过 Obsidian Vault API）
  - vault.create(path, data) → 新增 stub
  - vault.modify(file, data) → 更新 stub
  - vault.delete(file)       → 删除 stub
        ↓
Bases 自动刷新视图（vault 内文件变化触发）
```

### Obsidian API 验证结果

经 Obsidian 官方 TypeScript API 文档验证：
- `Vault.create(path: string, data: string)` → 创建文件 ✅
- `Vault.modify(file: TFile, data: string)` → 修改文件 ✅
- `Vault.delete(file: TFile, force?: boolean)` → 删除文件 ✅
- `Vault.getFileByPath(path: string)` → 按路径获取文件 ✅
- `Vault.createFolder(path: string)` → 创建文件夹 ✅
- `FileSystemAdapter.getBasePath()` → 获取 vault 根目录绝对路径（桌面端）✅
- `FileSystemAdapter.readLocalFile(path)` → 读取 vault 外部文件（static 方法）✅
- Obsidian 提供全局 `debounce()` 工具函数 ✅

## Stub 文件格式

每个 Zotero 条目对应一个 `.md` 文件，仅含 frontmatter 元数据和一个返回链接。

文件名默认使用 BBT citation key（如 `smith2023deep.md`）。

```yaml
---
title: "Deep Learning for NLP"
authors:
  - "John Smith"
  - "Jane Doe"
year: 2023
type: article-journal
journal: "Nature"
tags:
  - "NLP"
  - "deep-learning"
citekey: "smith2023deep"
zotero-uri: "zotero://select/library/items/ABC123"
---
[Open in Zotero](zotero://select/library/items/ABC123)
```

### 元数据字段（初始版本）

| 字段 | CSL JSON 来源 | 转换逻辑 | Obsidian 属性类型 |
|------|---------------|----------|------------------|
| `title` | `title` (string) | 直接映射 | Text |
| `authors` | `author` (array of `{family, given}`) | 格式化为 `"Given Family"` 字符串列表 | List |
| `year` | `issued.date-parts[0][0]` (nested array) | 提取第一个 date-part 的年份 | Number |
| `type` | `type` (string enum) | 直接映射，使用 CSL 类型名（如 `article-journal`, `book`, `paper-conference`, `thesis`） | Text |
| `journal` | `container-title` (string) | 直接映射 | Text |
| `tags` | `keyword` (string) | **需拆分**：CSL JSON 中 `keyword` 是单个字符串，多个标签以分号/逗号分隔，需 split 为数组 | List |
| `citekey` | `citation-key` (string, BBT 扩展) | 直接映射 | Text |
| `zotero-uri` | 从 `id` 字段构造 | 格式：`zotero://select/library/items/{ITEM_KEY}` | Text |

### CSL JSON 转换注意事项（经官方 schema 验证）

1. **`author` 字段**：CSL JSON 中 author 是对象数组 `[{family: "Smith", given: "John"}, ...]`，不是字符串。Parser 需将每个 name object 格式化为可读字符串。
2. **`issued` 日期字段**：CSL JSON 使用 `date-parts` 嵌套数组格式 `{"date-parts": [[2023, 6, 15]]}`。年份在 `issued.date-parts[0][0]`。
3. **`keyword` 标签字段**：CSL JSON schema 定义 `keyword` 为单个 string（非数组）。Zotero 通常用分号分隔多个关键词。Parser 需要 `keyword.split(/[;,]/).map(s => s.trim())`。
4. **`type` 类型枚举**：CSL 类型使用连字符命名（如 `article-journal`，非 `journalArticle`）。完整枚举见 CSL schema。
5. **Zotero URI**：当前格式为 `zotero://select/library/items/[ITEM_KEY]`（已弃用旧格式 `zotero://select/items/`）。

架构设计为可扩展，后续可添加更多字段（DOI、URL、摘要、添加日期等）。

### 存储开销

- 单个 stub 文件：~200 字节
- 2000 条目：~400KB
- 完全可忽略

## Bases 视图配置

插件自动生成 `Zotero Library.base` 文件，预配置以下内容：

```yaml
filters:
  - file.inFolder("Zotero Library")
formulas:
  author_year: 'authors[0] + " (" + year + ")"'
properties:
  title:
    displayName: "标题"
  authors:
    displayName: "作者"
  year:
    displayName: "年份"
  type:
    displayName: "类型"
  journal:
    displayName: "期刊"
  tags:
    displayName: "标签"
views:
  - type: table
    name: "全部文献"
    order:
      - title
      - authors
      - year
      - type
      - journal
      - tags
  - type: table
    name: "按类型分组"
    groupBy:
      property: type
      direction: ASC
    order:
      - title
      - authors
      - year
      - journal
  - type: cards
    name: "标签浏览"
    groupBy:
      property: tags
      direction: ASC
```

用户可在 Bases UI 中自由修改视图配置，插件不会覆盖用户的自定义修改（`.base` 文件仅在首次同步时生成，或由用户手动触发重新生成）。

### Bases 语法验证结果

经 Obsidian 官方 Bases 文档验证：
- `file.inFolder("path")` 过滤器函数 ✅ — 筛选指定文件夹内的文件
- `file.hasTag("tag")` 过滤器函数 ✅ — 按标签过滤
- `file.hasProperty("prop")` ✅ — 检查属性是否存在
- Note 属性通过 `note.propertyName` 或简写 `propertyName` 访问 ✅
- `groupBy` 支持 `property` + `direction` (ASC/DESC) ✅
- 视图类型支持 `table`, `cards`, `list`, `map` ✅
- List 类型属性支持 `contains()`, `filter()`, `join()` 等操作 ✅

### Obsidian 属性类型验证结果

经 Obsidian 官方 Properties 文档验证，支持以下类型：
- **Text** — 用于 `title`, `type`, `journal`, `citekey`, `zotero-uri` ✅
- **List** — 用于 `authors`, `tags` ✅
- **Number** — 用于 `year` ✅
- **Date** / **Date & time** — 可用于未来扩展的日期字段 ✅
- **Checkbox** — 可用于未来扩展的阅读状态 ✅
- **Tags** — Obsidian 内置标签类型，但我们使用 List 类型存储 tags 更灵活 ✅

## 插件设置

| 设置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| BBT 导出文件路径 | 文件路径 | 空 | 指向 BBT 自动导出的 JSON 文件 |
| Stub 文件夹名称 | 字符串 | `Zotero Library` | vault 内存放 stub 文件的文件夹 |
| 文件命名规则 | 下拉选择 | `citekey` | 可选：`citekey` 或 `{作者}{年份} - {标题}` |
| 自动同步 | 开关 | 开启 | 启用/禁用文件监听自动同步 |

### 首次设置流程

1. 用户安装插件，打开设置面板
2. 配置 BBT 导出文件路径（插件验证文件存在且格式正确）
3. 选择 stub 文件夹名称
4. 点击"立即同步"进行首次全量同步
5. 插件自动创建 stub 文件 + 预配置的 `.base` 文件

## 代码架构

```
src/
├── main.ts              # 插件入口，生命周期管理
├── settings.ts          # 设置接口、默认值、设置面板 UI
├── types.ts             # TypeScript 类型定义
├── sync/
│   ├── watcher.ts       # 文件监听器：监听 BBT 导出 JSON 文件变化
│   ├── parser.ts        # JSON 解析器：解析 Better CSL JSON
│   ├── differ.ts        # 差异比对：确定增/改/删操作
│   └── generator.ts     # Stub 生成器：创建/更新/删除 stub 文件
├── bases/
│   └── base-generator.ts # 生成预配置 .base 文件
└── utils/
    └── helpers.ts       # 工具函数（路径处理、文件名清理等）
```

### 模块职责

- **main.ts**：最小化入口，仅处理 `onload`/`onunload` 生命周期和命令注册。
- **watcher.ts**：智能监听 BBT 导出文件。如果文件在 vault 内，使用 Obsidian `vault.on('modify')` 事件；如果在 vault 外，使用 Node.js `fs.watch`。内置 Obsidian `debounce()`（500ms）避免频繁触发。在 `onunload` 时清理 watcher。
- **parser.ts**：解析 Better CSL JSON 格式，处理 CSL JSON 特殊数据结构（name objects → 字符串、date-parts → 年份、keyword string → 标签数组）。可扩展以支持更多字段。
- **differ.ts**：基于 citation key 做差异比对。比较现有 stub 的 frontmatter 与新数据，输出需要创建/更新/删除的操作列表。
- **generator.ts**：使用 Obsidian Vault API（`vault.create`, `vault.modify`, `vault.delete`）操作文件。只更新有变化的文件。批量操作时分批处理避免阻塞 UI。
- **base-generator.ts**：生成预配置 `.base` 文件。仅在首次同步或用户手动触发时执行。

## 性能预估（2000 条目）

| 操作 | 预计耗时 |
|------|----------|
| JSON 解析 | ~50ms |
| 差异比对 | ~10ms |
| 首次全量生成 stub | ~2-5 秒（分批写入） |
| 增量更新（通常改几条） | <100ms |

## 错误处理

- BBT 文件不存在或格式错误 → `Notice` 提示用户检查配置
- Stub 文件夹被误删 → 下次同步时自动重建
- 用户手动编辑了 stub 的 frontmatter → 以 Zotero 数据为准覆盖 frontmatter，但保留正文中用户添加的笔记内容
- 文件监听中断 → 自动重新建立监听，并触发一次增量同步

## 插件命令

| 命令 ID | 名称 | 说明 |
|---------|------|------|
| `zotero-bases-sync` | Sync Zotero library | 手动触发一次完整同步 |
| `zotero-bases-open-base` | Open Zotero library view | 打开 .base 文件 |

## 官方文档验证总结

| 验证项 | 状态 | 来源 | 备注 |
|--------|------|------|------|
| Better CSL JSON 字段结构 | ✅ 已验证（有修正） | CSL JSON Schema (csl-data.json) | `keyword` 是字符串非数组，`author` 是对象数组，`issued` 用 date-parts |
| Obsidian Vault API | ✅ 已验证 | docs.obsidian.md/Reference/TypeScript+API/Vault | create/modify/delete 均可用 |
| Bases 过滤器语法 | ✅ 已验证 | help.obsidian.md/bases/syntax + /functions | file.inFolder()、属性访问均确认 |
| Zotero URI 格式 | ✅ 已验证 | forums.zotero.org | `zotero://select/library/items/{KEY}` 为当前格式 |
| Obsidian frontmatter 类型 | ✅ 已验证 | help.obsidian.md/properties | Text/List/Number/Date/Tags 均支持 |
| BBT 自动导出机制 | ✅ 已验证 | retorque.re/zotero-better-bibtex/exporting/auto | Keep updated 选项 + on change/on idle 触发 |
| FileSystemAdapter | ✅ 已验证 | docs.obsidian.md/Reference/TypeScript+API/FileSystemAdapter | 桌面端可用，提供 getBasePath/readLocalFile |

## 未来扩展方向（不在 v1 范围内）

- 更多元数据字段（`DOI`, `URL`, `abstract`, `accessed` 日期等，CSL schema 均支持）
- 多个 Zotero 分类集合的独立 Base 视图
- 自定义字段映射配置
- 支持 Zotero 6 和 Zotero 7 的不同导出格式
- 利用 Bases View API (Obsidian 1.10+) 创建自定义视图（如日历视图、引用网络图）
