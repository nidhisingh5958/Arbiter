import { AllCommunityModule, ModuleRegistry, colorSchemeDarkBlue, themeQuartz } from 'ag-grid-community';

/**
 * AG Grid Community (MIT). Row grouping and master/detail are Enterprise features, so the
 * dashboard builds both on Community primitives instead: full-width rows, external filters
 * and postSortRows. No license key or watermark needed.
 */
ModuleRegistry.registerModules([AllCommunityModule]);

export const arbiterGridTheme = themeQuartz.withPart(colorSchemeDarkBlue).withParams({
  backgroundColor: '#0a0e18',
  foregroundColor: '#e7eaf3',
  chromeBackgroundColor: '#0d121e',
  headerBackgroundColor: '#0d121e',
  headerTextColor: '#9aa3ba',
  headerFontWeight: 600,
  headerFontSize: 11.5,
  borderColor: 'rgba(255,255,255,0.06)',
  accentColor: '#8b7bff',
  oddRowBackgroundColor: 'rgba(255,255,255,0.012)',
  rowHoverColor: 'rgba(139,123,255,0.07)',
  selectedRowBackgroundColor: 'rgba(139,123,255,0.12)',
  fontFamily: "'Inter Variable', ui-sans-serif, system-ui, sans-serif",
  fontSize: 13,
  spacing: 7,
  wrapperBorderRadius: 20,
  wrapperBorder: false,
  borderRadius: 8,
  columnBorder: false,
  iconSize: 14,
  browserColorScheme: 'dark',
});

export const defaultColDef = {
  sortable: true,
  resizable: true,
  suppressHeaderMenuButton: true,
  minWidth: 90,
};
