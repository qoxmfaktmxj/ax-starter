import { themeQuartz } from "ag-grid-community";

export const employeeGridTheme = themeQuartz.withParams({
  backgroundColor: "var(--color-surface)",
  foregroundColor: "var(--color-text)",
  borderColor: "var(--color-border)",
  headerBackgroundColor: "var(--color-surface-subtle)",
  headerTextColor: "var(--color-text-on-subtle)",
  accentColor: "var(--color-action)",
  fontFamily: "var(--font-sans)",
  fontSize: "var(--font-size-base)",
  rowHeight: "var(--grid-row-height)",
  headerHeight: "var(--grid-header-height)",
});
