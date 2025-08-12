// @ts-nocheck
export const fileUpload = document.getElementById('file-upload') as HTMLInputElement;

// View Containers
export const measurementView = document.getElementById('measurement-view');
export const pdfPagesContainer = document.getElementById('pdf-pages-container');
export const fontInspectorPage = document.getElementById('font-inspector-page');
export const fontFinderView = document.getElementById('font-finder-view');
export const fontInspectorPdfContainer = document.getElementById('font-inspector-pdf-container');
export const fontInspectorListContainer = document.getElementById('font-inspector-list-container');
export const pdfLoadingIndicator = document.getElementById('pdf-loading-indicator');
export const backToMeasurementViewBtn = document.getElementById('back-to-measurement-view-btn');
export const backToMeasurementFromFinderBtn = document.getElementById('back-to-measurement-from-finder-btn');


// Page Navigation
export const pageNavigationControls = document.getElementById('page-navigation-controls');
export const prevPageBtn = document.getElementById('prev-page-btn') as HTMLButtonElement;
export const nextPageBtn = document.getElementById('next-page-btn') as HTMLButtonElement;
export const pageNumInput = document.getElementById('page-num-input') as HTMLInputElement;
export const currentPageInfoSpan = document.getElementById('current-page-info');
export const goToPageBtn = document.getElementById('go-to-page-btn');

// Page Dimensions
export const pageDimensionsSection = document.getElementById('page-dimensions-section');
export const pageTrimMmDisplay = document.getElementById('page-trim-mm');
export const pageTrimInDisplay = document.getElementById('page-trim-in');
export const pageSourceBoxDisplay = document.getElementById('page-source-box');

// Zoom
export const zoomControls = document.getElementById('zoom-controls');
export const zoomInBtn = document.getElementById('zoom-in-btn');
export const zoomOutBtn = document.getElementById('zoom-out-btn');
export const zoomLevelSpan = document.getElementById('zoom-level');

// Toolbar & View Menu
export const mainToolbar = document.getElementById('main-toolbar');
export const selectionToolBtn = document.getElementById('selection-tool-btn');
export const panToolBtn = document.getElementById('pan-tool-btn');
export const fontInspectorToolBtn = document.getElementById('font-inspector-tool-btn');
export const fontFinderToolBtn = document.getElementById('font-finder-tool-btn');
export const viewMenuBtn = document.getElementById('view-menu-btn');
export const viewDropdownMenu = document.getElementById('view-dropdown-menu');
export const viewMenuFitWindow = document.getElementById('view-menu-fit-window');
export const viewMenuActualSize = document.getElementById('view-menu-actual-size');
export const viewMenuFitWidth = document.getElementById('view-menu-fit-width');
export const viewMenuFitVisible = document.getElementById('view-menu-fit-visible');
export const viewMenuRotateCW = document.getElementById('view-menu-rotate-cw');
export const viewMenuRotateCCW = document.getElementById('view-menu-rotate-ccw');
export const viewMenuGrid = document.getElementById('view-menu-grid');
export const viewMenuGridCheck = document.getElementById('view-menu-grid-check');
export const viewMenuZoomIn = document.getElementById('view-menu-zoom-in');
export const viewMenuZoomOut = document.getElementById('view-menu-zoom-out');

// Font Inspector Sidebar
export const fontInspectorSummary = document.getElementById('font-inspector-summary');
export const fontInspectorProperties = document.getElementById('font-inspector-properties');
export const propFontFamily = document.getElementById('prop-font-family');
export const propFontSize = document.getElementById('prop-font-size');
export const propHorizScale = document.getElementById('prop-horiz-scale');

// AI Font Finder View
export const fontFinderForm = document.getElementById('font-finder-form');
export const finderFontNameInput = document.getElementById('finder-font-name') as HTMLInputElement;
export const finderFontSampleInput = document.getElementById('finder-font-sample') as HTMLInputElement;
export const finderImageDropArea = document.getElementById('finder-image-drop-area');
export const finderImagePreview = document.getElementById('finder-image-preview') as HTMLImageElement;
export const finderImageUploadIcon = document.getElementById('finder-image-upload-icon');
export const finderFontSampleName = document.getElementById('finder-font-sample-name');
export const finderSubmitButton = document.getElementById('finder-submit-button') as HTMLButtonElement;
export const finderResultArea = document.getElementById('finder-result-area');
export const finderResultContent = document.getElementById('finder-result-content');

// Selection Info Panel
export const selectionInfo = document.getElementById('selection-info');
export const selectionW = document.getElementById('selection-w');
export const selectionH = document.getElementById('selection-h');
export const selectionTextW = document.getElementById('selection-text-w');
export const selectionTextLeading = document.getElementById('selection-text-leading');
export const manualLeadingInput = document.getElementById('manual-leading-input') as HTMLInputElement; 
export const selectionTextHLeadingRatio = document.getElementById('selection-text-h-leading-ratio'); 
export const selectionFontFamily = document.getElementById('selection-font-family');
export const selectionFontStyle = document.getElementById('selection-font-style');
export const selectionFontSize = document.getElementById('selection-font-size');

// Display Units
export const displayUnitSelector = document.getElementById('display-unit') as HTMLSelectElement;
export const displayUnitControls = document.getElementById('display-unit-controls');

// Page Analysis Panel
export const pageAnalysisSection = document.getElementById('page-analysis-section');
export const analyzePageBtn = document.getElementById('analyze-page-btn');
export const pageAnalysisResults = document.getElementById('page-analysis-results');
export const linesCount = document.getElementById('lines-count');
export const wordsCount = document.getElementById('words-count');
export const pageAnalysisLoader = document.getElementById('page-analysis-loader');
export const measureColumnsBtn = document.getElementById('measure-columns-btn');
export const columnAnalysisResults = document.getElementById('column-analysis-results');
export const leftColumnWidth = document.getElementById('left-column-width');
export const rightColumnWidth = document.getElementById('right-column-width');
export const gutterSpace = document.getElementById('gutter-space');
export const clearColumnHighlightsBtn = document.getElementById('clear-column-highlights-btn');

// Auto Specs Panel
export const autoSpecsSection = document.getElementById('auto-specs-section');
export const generateSpecsBtn = document.getElementById('generate-specs-btn');
export const autoSpecsLoader = document.getElementById('auto-specs-loader');
export const autoSpecsResults = document.getElementById('auto-specs-results');
export const specTrimSize = document.getElementById('spec-trim-size');
export const specFontFamily = document.getElementById('spec-font-family');
export const specFontSize = document.getElementById('spec-font-size');
export const specLeading = document.getElementById('spec-leading');
export const specTextWidth = document.getElementById('spec-text-width');
export const specTextDepth = document.getElementById('spec-text-depth');
export const specLinesOnPage = document.getElementById('spec-lines-on-page');
export const specColumnData = document.getElementById('spec-column-data');
export const specLeftColWidth = document.getElementById('spec-left-col-width');
export const specRightColWidth = document.getElementById('spec-right-col-width');
export const specGutterSpace = document.getElementById('spec-gutter-space');

// Measurements Panel
export const measurementsListElement = document.getElementById('measurements-list');
export const clearMeasurementsBtn = document.getElementById('clear-measurements');

// Live Info Box (for selection)
export const liveSelectionInfoBox = document.getElementById('live-selection-info-box');
export const liveInfoXValue = document.getElementById('live-info-x-value');
export const liveInfoYValue = document.getElementById('live-info-y-value');
export const liveInfoWValue = document.getElementById('live-info-w-value');
export const liveInfoHValue = document.getElementById('live-info-h-value');

// Modal & Toast
export const customModal = document.getElementById('custom-modal');
export const modalTitle = document.getElementById('modal-title');
export const modalMessage = document.getElementById('modal-message');
export const modalCancel = document.getElementById('modal-cancel');
export const modalOk = document.getElementById('modal-ok');
export const statusToast = document.getElementById('status-toast');
export const statusMessage = document.getElementById('status-message');

// Magnifier Loupe
export const magnifierLoupe = document.getElementById('magnifier-loupe');
export const magnifierCanvas = document.getElementById('magnifier-canvas') as HTMLCanvasElement;