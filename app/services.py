import logging
import re
from typing import Any, Dict, List, Optional
import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.models import SQLTemplate, TrendPlot, TrendParameter

logger = logging.getLogger(__name__)

REQUIRED_COLUMNS = {"cycleno", "value", "series"}


def list_trends(db: Session) -> List[Dict[str, Any]]:
    """List all SQL templates (trends) with basic info."""
    # Assuming all templates are active since column is missing
    rows = db.query(SQLTemplate).all()
    return [
        {
            "template_id": r.template_id,
            "trend_code": r.trend_id,
            "trend_name": r.trend_name or r.trend_id,
            "is_active": True,
            "last_updated_on": r.last_updated_on.isoformat() if hasattr(r.last_updated_on, 'isoformat') else str(r.last_updated_on) if r.last_updated_on else None,
        }
        for r in rows
    ]


def get_trend_by_id(db: Session, template_id: str) -> Optional[Dict[str, Any]]:
    """Get single trend template by ID."""
    t = db.query(SQLTemplate).filter(SQLTemplate.template_id == template_id).first()
    if not t:
        return None
    return _template_to_dict(t, db)


def get_trend_by_code(db: Session, trend_code: str) -> Optional[Dict[str, Any]]:
    """Get trend template by trend_code."""
    t = db.query(SQLTemplate).filter(SQLTemplate.trend_id == trend_code).first()
    if not t:
        return None
    return _template_to_dict(t, db)


def _template_to_dict(t: SQLTemplate, db: Session) -> Dict[str, Any]:
    """Convert template + plot config + params to full dict."""
    # Fetch all plot configs (for dual axis)
    plots = db.query(TrendPlot).filter(TrendPlot.trend_id == t.trend_id).all()
    
    # Try fetching parameters with exact trend_id
    params = db.query(TrendParameter).filter(TrendParameter.trendid == t.trend_id).all()
    
    # Fallback: if no params, try normalized ID (T001 -> T1)
    if not params and t.trend_id and t.trend_id.startswith('T') and t.trend_id[1:].isdigit():
        short_id = f"T{int(t.trend_id[1:])}"
        params = db.query(TrendParameter).filter(TrendParameter.trendid == short_id).all()

    # Construct plot config
    plot_config = {}
    series_map = {}
    
    if plots:
        # Sort so Primary is first (usually)
        plots.sort(key=lambda p: 0 if getattr(p, 'axis_side', 'Primary') == 'Primary' else 1)
        
        main_plot = plots[0]
        plot_config = {
            "x_col": main_plot.x_col,
            "y_col": main_plot.y_col,
            "series_col": main_plot.series_col,
            "plot_type": main_plot.plot_type or "line",
            "title": main_plot.title or "",
            "x_label": main_plot.x_label or "Cycle",
            "y_label": main_plot.y_label or "Value",
        }
        
        # Check for secondary axis
        secondary_plot = next((p for p in plots if getattr(p, 'axis_side', '') == 'Secondary'), None)
        if secondary_plot:
             plot_config["y2_label"] = secondary_plot.y_label
        
        # Build series mapping (series_val -> axis)
        # Using y_axis column from DB as the series key (e.g. 'tankvol')
        for p in plots:
             if hasattr(p, 'y_axis') and p.y_axis:
                 axis = 'y1' if getattr(p, 'axis_side', 'Primary') == 'Secondary' else 'y'
                 series_map[p.y_axis] = {'axis': axis}
        
        plot_config["series_map"] = series_map

    # Construct parameters list, de-duplicating by name just in case DB has garbage
    unique_p_dict = {}
    for p in params:
        if p.parameter not in unique_p_dict:
            unique_p_dict[p.parameter] = {
                "param_name": p.parameter,
                "param_type": p.type or "string",
                "is_required": (p.required == 'Y'),
                "default_value": p.default,
                "ui_label": p.parameter, 
                "display_order": 0, 
            }

    return {
        "template_id": t.template_id,
        "trend_code": t.trend_id,
        "trend_name": t.trend_name or t.trend_id,
        "sql_template": t.sql_template or "",
        "is_active": True,
        "last_updated_on": t.last_updated_on.isoformat() if hasattr(t.last_updated_on, 'isoformat') else str(t.last_updated_on) if t.last_updated_on else None,
        "plot_config": plot_config,
        "parameters": list(unique_p_dict.values()),
    }


def substitute_parameters(sql: str, params: Dict[str, Any]) -> str:
    """
    Substitute :param_name placeholders in SQL with values.
    Uses safe string replacement for simple params.
    """
    result = sql
    for key, val in params.items():
        placeholder = f":{key}"
        if placeholder in result:
            if val is None:
                s = "NULL"
            elif isinstance(val, (int, float)):
                s = str(val)
            else:
                s = str(val).replace("'", "''")
                s = f"'{s}'"
            result = result.replace(placeholder, s)
    return result


def execute_query(db: Session, sql: str, params: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Execute SQL and return results as list of dicts.
    Validates output has cycleno, value, series (or uses first 3 cols as fallback).
    """
    params = params or {}
    rendered = substitute_parameters(sql, params)
    try:
        result = db.execute(text(rendered))
        rows = result.fetchall()
        columns = list(result.keys())
        df = pd.DataFrame(rows, columns=columns)
    except Exception as e:
        logger.exception("Query execution failed")
        return {"error": str(e), "rows": [], "columns": []}

    if df.empty:
        return {"rows": [], "columns": list(df.columns), "error": None}

    cols = list(df.columns)
    # Flexible: allow any columns for multi-plot canvas; no strict cycleno/value/series requirement
    missing = REQUIRED_COLUMNS - set(c.lower() for c in cols)
    if missing:
        # Still return data - frontend multi-plot builder will let user pick columns
        pass

    # Sort by cycleno if present
    if "cycleno" in [c.lower() for c in cols]:
        cycleno_col = next(c for c in cols if c.lower() == "cycleno")
        df = df.sort_values(cycleno_col)

    rows = df.to_dict(orient="records")
    for r in rows:
        for k, v in list(r.items()):
            if pd.isna(v):
                r[k] = None
            elif hasattr(v, "item"):
                r[k] = v.item() if hasattr(v, "item") else float(v)

    return {"rows": rows, "columns": cols, "error": None}


def _sync_parameters(db: Session, trend_id: str, sql: str):
    """Extract placeholders like :ParamName and sync with bts_Trend_Parameters."""
    # Find all :Word placeholders
    placeholders = re.findall(r":([a-zA-Z0-9_]+)", sql)
    # Remove duplicates
    unique_params = sorted(list(set(placeholders)))
    
    # Get existing params for this trend
    existing = db.query(TrendParameter).filter(TrendParameter.trendid == trend_id).all()
    existing_names = {p.parameter.lower() for p in existing}
    
    # Add missing ones
    for name in unique_params:
        if name.lower() not in existing_names:
            logger.info(f"Adding auto-extracted parameter '{name}' for trend '{trend_id}'")
            new_p = TrendParameter(
                trendid=trend_id,
                parameter=name,
                type="string", # Default
                required="Y",  # Default if in SQL
                multi="N",
                default=None
            )
            db.add(new_p)
            # Add to set so we don't add twice in same loop if re-scan somehow finds it
            existing_names.add(name.lower())
    
    # Optional: Delete ones that are NO LONGER in the SQL?
    # For now, let's just keep them to be safe, or only add.
    # User might have manually added some that aren't in SQL yet.

def create_template(
    db: Session,
    trend_code: str,
    trend_name: str,
    sql_template: str,
    refid: Optional[str] = None,
    template_id: Optional[str] = None,
    parameters: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Create new SQL template with all fields and parameters."""
    tid = template_id or trend_code
    t = SQLTemplate(
        template_id=tid,
        trend_id=trend_code,
        trend_name=trend_name,
        sql_template=sql_template,
        refid=refid,
    )
    db.add(t)
    # Add BlendID as default (non-removable) + user-provided parameters
    blendid_exists = False
    for p in parameters or []:
        pdict = p if isinstance(p, dict) else (p.model_dump() if hasattr(p, "model_dump") else dict(p))
        param_name = (pdict.get("parameter") or "").strip()
        if not param_name:
            continue
        if param_name.lower() == "blendid":
            blendid_exists = True
        _add_trend_parameter(db, trend_code, param_name, pdict)
    if not blendid_exists:
        _add_trend_parameter(db, trend_code, "blendid", {"type": "string", "required": "Y", "default": None})
    # Sync any :param from SQL not already in params
    _sync_parameters(db, trend_code, sql_template)
    db.commit()
    db.refresh(t)
    return _template_to_dict(t, db)


def _add_trend_parameter(db: Session, trend_id: str, param_name: str, p: Dict[str, Any]) -> None:
    """Add or ensure a trend parameter exists."""
    existing = db.query(TrendParameter).filter(
        TrendParameter.trendid == trend_id,
        TrendParameter.parameter == param_name,
    ).first()
    if existing:
        return
    new_p = TrendParameter(
        trendid=trend_id,
        parameter=param_name,
        type=p.get("type") or "string",
        required=p.get("required", "Y"),
        multi=p.get("multi", "N"),
        default=p.get("default"),
    )
    db.add(new_p)


def update_template(db: Session, template_id: str, sql_template: str, trend_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
    """Update existing SQL template."""
    t = db.query(SQLTemplate).filter(SQLTemplate.template_id == template_id).first()
    if not t:
        return None
    t.sql_template = sql_template
    if trend_name is not None:
        t.trend_name = trend_name
    
    _sync_parameters(db, t.trend_id, sql_template)
    
    db.commit()
    db.refresh(t)
    return _template_to_dict(t, db)


_trend_params_cache: Optional[tuple] = None  # (timestamp, list)


def get_trend_params_list(db: Session) -> List[str]:
    """
    Fetch allowed trend parameter names from bts_DropDownList.trend_parms.
    Results cached for 5 minutes.
    """
    import time
    global _trend_params_cache
    now = time.time()
    if _trend_params_cache and (now - _trend_params_cache[0]) < 300:
        return _trend_params_cache[1]

    try:
        result = db.execute(
            text("SELECT DISTINCT trend_parms FROM bts_DropDownList WHERE trend_parms IS NOT NULL AND trend_parms != '' ORDER BY trend_parms")
        ).fetchall()
        params = [str(r[0]).strip() for r in result if r[0]]
        _trend_params_cache = (now, params)
        return params
    except Exception as e:
        logger.warning("Could not fetch trend_parms from bts_DropDownList: %s", e)
        _trend_params_cache = (now, [])
        return []


def get_schema(db: Session) -> Dict[str, List[str]]:
    """Get table names and columns for query builder autocomplete."""
    result = {}
    try:
        rows = db.execute(text("SHOW TABLES")).fetchall()
        tables = [list(r)[0] for r in rows]
        for table in tables:
            cols = db.execute(text(f"SHOW COLUMNS FROM `{table}`")).fetchall()
            result[table] = [c[0] for c in cols]
    except Exception as e:
        logger.exception("Schema fetch failed")
        return {"error": str(e)}
    return result

def delete_template(db: Session, template_id: str) -> bool:
    """Delete SQL template and associated data."""
    t = db.query(SQLTemplate).filter(SQLTemplate.template_id == template_id).first()
    if not t:
        return False
    
    # Delete associated parameters and plots
    db.query(TrendParameter).filter(TrendParameter.trendid == t.trend_id).delete()
    db.query(TrendPlot).filter(TrendPlot.trend_id == t.trend_id).delete()
    
    # Delete the template itself
    db.delete(t)
    db.commit()
    return True
