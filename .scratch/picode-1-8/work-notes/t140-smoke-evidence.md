# t140 smoke evidence (captured 2026-09-23)

## Baseline A/B (t132 pre-existing flake proof — t140 changes stashed, rebuilt)
SMOKE FAIL ticket 132 (boot empty): the ⌘J pressed at the boot empty state never focused the first shell (activeElement is not the xterm textarea)

## Full run with temporary t132/t105 evidence path (restored after)
SMOKE FAIL ticket 105: the trusted keystroke never echoed in the shell
SMOKE terminal_focus_132_boot_empty_focus_PREEXISTING_FLAKE activeElement is not the xterm textarea (pre-existing, A/B proven)

## Usage stages green (both stages complete, zero FAILs inside)
SMOKE usage_hover_start
SMOKE usage_page_open_ok
SMOKE usage_trend_hover_ok
SMOKE usage_trend_unhover_ok
SMOKE usage_donut_hover_ok
SMOKE usage_range_row_retired_ok
SMOKE usage_zero_filter_fixed_window_ok
SMOKE usage_drilldown_click_ok
SMOKE usage_drilldown_rows_pure_ok
SMOKE usage_hover_done
SMOKE usage_hover_stage_done
SMOKE usage_heat_start
SMOKE usage_heat_leftmost_outline_ok
SMOKE usage_heat_daily_grid_ok
SMOKE usage_heat_weekly_grid_ok
SMOKE usage_heat_cumulative_grid_ok
SMOKE usage_heat_daily_hover_ok
SMOKE usage_heat_weekly_hover_ok
SMOKE usage_heat_cumulative_hover_ok
SMOKE usage_heat_day_drill_ok
SMOKE usage_heat_done
SMOKE usage_heat_stage_done

## Post-stages failure (known flaky, out of scope)
SMOKE FAIL ticket-89 stage: the authorize URL was never opened externally (log=[])
