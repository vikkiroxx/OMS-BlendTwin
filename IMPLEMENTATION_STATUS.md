# BlendTwin Implementation Status

## Implementation Plan vs Current State

Based on `BlendTwin_Implementation_Plan.md`, here is what is **currently implemented** vs **not yet implemented**:

---

### ✅ Currently Implemented

| Feature | Status | Notes |
|---------|--------|-------|
| **FastAPI project structure** | ✅ Done | venv, requirements.txt, app structure |
| **DB connection (SQLAlchemy + PyMySQL)** | ✅ Done | `config/database.py`, `app/database.py` |
| **CRUD for bts_cfg_sql_templates** | ✅ Done | Create, Read, Update, Delete |
| **Read for bts_cfg_trend_plots** | ✅ Done | Loaded with trend in `_template_to_dict` |
| **Read for bts_Trend_Parameters** | ✅ Done | Loaded with trend |
| **Basic frontend shell** | ✅ Done | Trend Selector, SQL Editor |
| **CodeMirror for SQL** | ✅ Done | Integrated in frontend |
| **Dynamic parameter panel** | ✅ Done | From `bts_Trend_Parameters` |
| **SQL parameter substitution** | ✅ Done | `substitute_parameters()` in services |
| **Execute API endpoint** | ✅ Done | `POST /api/execute` |
| **Data grid display** | ✅ Done | Table view of results |
| **Create new trend flow** | ✅ Done | POST `/api/trends` |
| **Update existing trend flow** | ✅ Done | PUT `/api/trends/{id}` |
| **Plot panel** | ✅ Done | Single line plot (Chart.js) |
| **Auto-sync parameters from SQL** | ✅ Done | `_sync_parameters` extracts `:param` placeholders |
| **Visual Query Builder** | ✅ Done | Table/column selection, joins, SQL preview |
| **Delete trend** | ✅ Done | DELETE endpoint |

---

### ❌ Not Yet Implemented / Needs Enhancement

| Feature | Status | Notes |
|---------|--------|-------|
| **All fields when creating trend** | ❌ Partial | Only trend_code, trend_name, sql_template. Missing: refid, etc. |
| **Trend parameters in create popup** | ❌ Missing | No UI to add parameters when creating. BlendID should be default & locked |
| **Create bts_cfg_trend_plots on new trend** | ❌ Missing | Plot config not created on trend creation |
| **Multi-plot canvas** | ❌ Missing | Only 1 plot shown. Need: add multiple plots, select type (line/bar/pie), define legends/data |
| **Flexible query results** | ❌ Strict | Requires cycleno/value/series. Sample plots use different structures |
| **Docker deployment** | ⬜ Planned | Phase 4 |
| **Monaco Editor** | ⬜ Optional | Currently using CodeMirror |
| **react-querybuilder** | ⬜ Optional | Visual WHERE builder |

---

## Database Tables Reference

### bts_cfg_sql_templates
| Column | Purpose |
|--------|---------|
| template_id | PK, unique identifier |
| refid | Optional reference |
| trend_id | Trend reference |
| trend_name | Display name |
| sql_template | SQL text |
| last_updated_on | Timestamp |

### bts_Trend_Parameters
| Column | Purpose |
|--------|---------|
| id | PK |
| refid | Optional |
| trendid | Trend reference |
| parameter | Param name (e.g. blendid, tankno) |
| type | string, number, list |
| required | Y/N |
| multi | Y/N |
| default | Default value |

### bts_cfg_trend_plots
| Column | Purpose |
|--------|---------|
| id | PK |
| trend_id | Trend reference |
| x_col | e.g. cycleno |
| y_col | e.g. value |
| series_col | e.g. series |
| plot_type | line, bar, pie, etc. |
| title, x_label, y_label | Labels |

---

## Sample Plot Queries (from provided images)

### Image 1: Backcasted Tank Qualities (BlendID: 20200617-005, TankID: TK-3052)

**Plot 1: Tank Volume and alkylate Flow**
- X: Blend Cycle (5 min)
- Y: Tank Volume (bbl), Stream Flow
- Query structure: `SELECT cycleno, value, series FROM ... WHERE blendid = '20200617-005' AND tankid = 'TK-3052'`

**Plot 2: Tank vs Stream Quality (ron)**
- X: 5 min Blend Cycle
- Y: ron (Stream Quality, Tank Quality - CSTR, Lagged, Hybrid)
- Multiple series on same chart

### Image 2: Blend/Grade Analytics

**Duration vs Blend No** (Line): `SELECT blend_no AS x, duration AS value, 'Duration' AS series FROM ...`

**Batch Size vs Blend No** (Line): `SELECT blend_no AS x, batch_size AS value, 'BatchSize' AS series FROM ...`

**% Grade Distribution** (Pie): `SELECT grade AS label, COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() AS value FROM ... GROUP BY grade`

**No of Blends per Grade** (Bar): `SELECT product_grade AS x, COUNT(*) AS value FROM ... GROUP BY product_grade`

**Blends per Destination Tank** (Bar): `SELECT product_tank AS x, COUNT(*) AS value FROM ... GROUP BY product_tank`

**No of Blends by Component Count** (Bar): `SELECT no_of_components AS x, COUNT(*) AS value FROM ... GROUP BY no_of_components`

---

## Sample Queries to Test

Use these query structures in the SQL Editor. Adjust table/column names to match your database schema.

### Standard trend format (cycleno, value, series)
```sql
SELECT cycleno, value, series
FROM your_trend_table
WHERE blendid = :blendid AND tankno = :tankno
ORDER BY cycleno
```

### Line: Duration vs Blend No
```sql
SELECT blend_no AS cycleno, duration AS value, 'Duration' AS series
FROM blends
ORDER BY blend_no
```
Then add a Line plot: X=cycleno, Y=value, Series=series.

### Line: Batch Size vs Blend No
```sql
SELECT blend_no AS cycleno, batch_size AS value, 'BatchSize' AS series
FROM blends
ORDER BY blend_no
```

### Pie: % Grade Distribution
Query returns label + value. Add Pie plot: Label=grade, Value=count or percentage.
```sql
SELECT grade AS label, COUNT(*) AS value
FROM blends
GROUP BY grade
```

### Bar: No of Blends per Grade
```sql
SELECT product_grade AS x, COUNT(*) AS y
FROM blends
GROUP BY product_grade
```
Add Bar plot: X=x, Y=y.

### Bar: Blends per Destination Tank
```sql
SELECT product_tank AS x, COUNT(*) AS y
FROM blends
GROUP BY product_tank
```
