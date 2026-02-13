# BlendTwin OMS — Project Time Estimate & Freelance Breakdown

**Project:** BlendTwin Trend Query Workbench  
**Rate:** $15/hour  
**Purpose:** Freelance project time tracking for Notion / invoicing

*Functionality implementation only. Excludes setup, deployment, and documentation.*

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total Estimated Hours (Completed)** | 35 hrs |
| **Remaining Work (To Complete)** | 2.5 hrs |
| **Total Project Hours** | 37.5 hrs |
| **Completed Value @ $15/hr** | $525 |
| **Remaining Value @ $15/hr** | $37.50 |
| **Full Project Value @ $15/hr** | $562.50 |

---

## Notion-Ready Table (Copy & Paste)

### Option 1: Phase-Based Breakdown

| Phase | Task | Status | Est. Hours | Notes |
|-------|------|--------|------------|-------|
| Phase 1 | CRUD for bts_cfg_sql_templates | ✅ Done | 3.5 | Create, Read, Update, Delete |
| Phase 1 | Read bts_cfg_trend_plots and bts_Trend_Parameters | ✅ Done | 1.5 | Loaded with trend |
| Phase 1 | Basic frontend shell (Trend Selector, SQL Editor) | ✅ Done | 3 | HTML/CSS/JS SPA |
| Phase 1 | CodeMirror integration for SQL | ✅ Done | 1 | Syntax highlighting |
| Phase 2 | Dynamic parameter panel | ✅ Done | 2 | From bts_Trend_Parameters |
| Phase 2 | SQL parameter substitution | ✅ Done | 1 | :param placeholders |
| Phase 2 | Execute API endpoint + pandas | ✅ Done | 2 | POST /api/execute |
| Phase 2 | Data grid display | ✅ Done | 1.5 | Table view |
| Phase 2 | Create new trend flow | ✅ Done | 3 | With parameters |
| Phase 2 | Update trend flow | ✅ Done | 1.5 | PUT endpoint |
| Phase 3 | Plot panel (Chart.js) | ✅ Done | 2 | Line charts |
| Phase 3 | Multi-series line plot | ✅ Done | 2 | Cycle-based |
| Phase 3 | Multi-plot canvas (line/bar/pie) | ✅ Done | 4 | Add Plot modal |
| Phase 3 | Flexible query results | ✅ Done | 1 | Column mapping |
| Phase 3 | Visual Query Builder | ✅ Done | 4 | Tables, columns, joins |
| Phase 3 | Auto-sync params from SQL | ✅ Done | 1 | :param extraction |
| Phase 3 | Delete trend | ✅ Done | 1 | DELETE + cascade |
| **Remaining** | Create bts_cfg_trend_plots on new trend | ❌ Pending | 2 | Default plot config |
| Remaining | Polish create-trend UI | ❌ Partial | 0.5 | refid, template_id |

---

### Option 2: Compact Summary for Invoicing

| Category | Tasks | Hours | Amount @ $15/hr |
|----------|-------|-------|-----------------|
| Phase 1: Data & Frontend Base | 4 tasks | 9 | $135 |
| Phase 2: Core Functionality | 6 tasks | 11 | $165 |
| Phase 3: Visualization & Builder | 7 tasks | 15 | $225 |
| **Completed Total** | **17 tasks** | **35** | **$525** |
| Remaining | 2 tasks | 2.5 | $37.50 |
| **Full Project Total** | **19 tasks** | **37.5** | **$562.50** |

---

### Option 3: Detailed Task Log (For Time Tracking)

| # | Task | Phase | Hours | Status |
|---|------|-------|-------|--------|
| 1 | SQL template CRUD | 1 | 3.5 | ✅ |
| 2 | Trend plots & parameters read | 1 | 1.5 | ✅ |
| 3 | Frontend shell (HTML/CSS layout) | 1 | 3 | ✅ |
| 4 | CodeMirror SQL editor | 1 | 1 | ✅ |
| 5 | Dynamic parameter panel | 2 | 2 | ✅ |
| 6 | Parameter substitution logic | 2 | 1 | ✅ |
| 7 | Execute API + pandas | 2 | 2 | ✅ |
| 8 | Data grid display | 2 | 1.5 | ✅ |
| 9 | Create trend flow | 2 | 3 | ✅ |
| 10 | Update trend flow | 2 | 1.5 | ✅ |
| 11 | Chart.js plot panel | 3 | 2 | ✅ |
| 12 | Multi-series line plot | 3 | 2 | ✅ |
| 13 | Multi-plot canvas (line/bar/pie) | 3 | 4 | ✅ |
| 14 | Flexible column mapping | 3 | 1 | ✅ |
| 15 | Visual Query Builder | 3 | 4 | ✅ |
| 16 | Auto-sync params from SQL | 3 | 1 | ✅ |
| 17 | Delete trend | 3 | 1 | ✅ |
| 18 | Create plot config on new trend | — | 2 | ❌ |
| 19 | Create-trend UI polish | — | 0.5 | Partial |

---

## How to Use in Notion

1. **Create a Database** (Table view) in Notion.
2. Add columns: **Phase**, **Task**, **Status**, **Est. Hours**, **Notes** (or **Amount** if you prefer).
3. Copy the table rows from **Option 1** or **Option 3** and paste into Notion. Notion will auto-create rows from pasted tables.
4. Add a **Formula** or **Rollup** for total hours: `sum(Est. Hours)`.
5. Add a **Formula** for amount: `prop("Est. Hours") * 15`.

---

## Notes

- Functionality implementation only. Excludes: setup (venv, FastAPI scaffolding, DB config), deployment (Docker, cloud), documentation.
- Estimates are conservative development hours.
- "Completed" = implemented and working per IMPLEMENTATION_STATUS.md.
