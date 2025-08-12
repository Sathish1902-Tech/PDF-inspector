
// @ts-nocheck
import * as dom from './dom.js';

export const state = {
    pdfDoc: null,
    pdfFilename: '',
    zoomLevel: 1.0,
    pageCanvases: {},
    currentRotation: 0,
    isGridVisible: false,
    allDocumentFonts: [],
    
    // Page state
    currentPageNum: 1,
    totalPages: 0,
    
    // Tool state
    currentTool: 'selection', // 'selection', 'pan', or 'font-inspector'
    isDrawingSelection: false, // For when a new selection is being drawn
    isMovingSelection: false, // For when an existing selection is being moved
    activeHandle: null, // The resize handle being dragged
    selectionStartCanvasPoint: { x: 0, y: 0 },
    selectionEndCanvasPoint: { x: 0, y: 0 },
    currentSelection: null, // The currently active selection on canvas
    activeMeasurementIndex: null, // The index in `measurements` array that is active
    pendingMeasurementActivation: null, // For activating a measurement after a page load
    currentSelectionTextBlockHeightPdfPoints: null,
    currentSelectionAutoLeadingPdfPoints: null,
    
    isPanning: false,
    isSpacebarDown: false,
    panStartMouse: { x: 0, y: 0 },
    panInitialScroll: { x: 0, y: 0 },

    columnAnalysis: {
        leftColumnBox: null,
        rightColumnBox: null,
        gutterBox: null,
    },

    fontInspector: {
        highlightedTextBbox: null,
    },
    
    measurements: [],
    statusTimeout: null,
    activePdfRenderTask: null,
    lastPageScrollTime: 0,

    // A collection of all control elements for easy show/hide
    allControlElements: [
        dom.pageNavigationControls, dom.pageDimensionsSection, dom.zoomControls, dom.mainToolbar, 
        dom.displayUnitControls, dom.pageAnalysisSection, dom.selectionInfo, dom.clearMeasurementsBtn, dom.measurementsListElement.parentElement,
        dom.autoSpecsSection
    ],
    measurementSidebarPanels: [dom.selectionInfo, dom.measurementsListElement.parentElement]
};