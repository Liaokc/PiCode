import { describe, expect, it } from "vitest";
import { projectPaneMotion } from "../../src/shared/pane-motion";

/**
 * Pane open/close motion (ticket 40): the dual-variable projection behind
 * the three collapsible panes. Table-driven per the ticket's Seam-1
 * requirement: (open, size) → open/close variable + content variable.
 *
 * The grammar under test:
 *   - the OPEN/CLOSE variable carries the ANIMATED pane size and collapses
 *     to 0px when the pane is closed (the edge slides from its docked edge);
 *   - the CONTENT variable carries the pane's REAL size at all times, so
 *     pane content clips instead of reflowing while the size animates
 *     (sidebar/panel text stays put; xterm never refits per-frame).
 */
describe("projectPaneMotion", () => {
  it.each([
    // open   | size | open/close variable | content variable
    [true, 320, "320px", "320px"],
    [false, 320, "0px", "320px"],
    [true, 420, "420px", "420px"],
    [false, 420, "0px", "420px"],
    [true, 800, "800px", "800px"],
    [false, 800, "0px", "800px"],
  ])("open=%p size=%p → pane %p / content %p", (open, size, pane, content) => {
    expect(projectPaneMotion(open, size as number)).toEqual({ pane, content });
  });

  it("keeps the content variable at the real size while closed — the clip-not-reflow contract", () => {
    const closed = projectPaneMotion(false, 320);
    const open = projectPaneMotion(true, 320);
    // Only the open/close variable moves; the content variable is stable —
    // that difference is exactly what keeps pane text and xterm stationary.
    expect(closed.pane).toBe("0px");
    expect(closed.content).toBe(open.content);
  });

  it("degenerate sizes collapse both variables (nothing to pin content to)", () => {
    expect(projectPaneMotion(true, 0)).toEqual({ pane: "0px", content: "0px" });
    expect(projectPaneMotion(false, 0)).toEqual({
      pane: "0px",
      content: "0px",
    });
    expect(projectPaneMotion(true, -40)).toEqual({
      pane: "0px",
      content: "0px",
    });
  });
});
