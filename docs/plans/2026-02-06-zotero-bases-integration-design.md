# Zotero Bases Integration - 设计文档

**日期**: 2026-02-06
**状态**: 已确认

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
插件通过 Node.js fs.watch 监听 JSON 文件变化（debounce 500ms）
        ↓
插件解析 JSON，与 vault 内现有 stub 文件做差异比对
        ↓
插件创建/更新/删除 .md stub 文件（通过 Obsidian Vault API）
        ↓
Bases 自动刷新视图（vault 内文件变化触发）
```

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
type: journalArticle
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

| 字段 | 来源 | 说明 |
|------|------|------|
| `title` | CSL `title` | 文献标题 |
| `authors` | CSL `author` | 作者列表 |
| `year` | CSL `issued` | 发表年份 |
| `type` | CSL `type` | 文献类型（journalArticle, book 等） |
| `journal` | CSL `container-title` | 期刊/出版物名称 |
| `tags` | BBT `keyword` / CSL `keyword` | Zotero 标签 |
| `citekey` | BBT `citation-key` | BBT 引用键 |
| `zotero-uri` | 构造自 item key | Zotero 内部链接 |

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
- **watcher.ts**：使用 `fs.watch` 监听 BBT 导出文件。内置 debounce（500ms）避免频繁触发。在 `onunload` 时清理 watcher。
- **parser.ts**：解析 Better CSL JSON 格式，将 CSL 字段映射为 frontmatter 属性。可扩展以支持更多字段。
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

## 未来扩展方向（不在 v1 范围内）

- 更多元数据字段（DOI、URL、摘要、添加日期、阅读状态、PDF 注释数量）
- 多个 Zotero 分类集合的独立 Base 视图
- 自定义字段映射配置
- 支持 Zotero 6 和 Zotero 7 的不同导出格式
