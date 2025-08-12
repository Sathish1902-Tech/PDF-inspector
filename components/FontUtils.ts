
// @ts-nocheck
import { state } from './state.js';
import { showStatusUpdate, parseFontNameDetails } from './utils.js';

declare const pdfjsLib: any;

export const extractAllFontsFromDoc = async () => {
    if (state.allDocumentFonts.length > 0) return;
    if (!state.pdfDoc) return;

    showStatusUpdate(`Scanning all ${state.totalPages} pages for fonts...`);
    const fontMap = new Map();

    try {
        for (let i = 1; i <= state.totalPages; i++) {
            const page = await state.pdfDoc.getPage(i);
            const operatorList = await page.getOperatorList();
            
            const dependencyOps = operatorList.fnArray
                .map((fn, index) => fn === pdfjsLib.OPS.dependency ? operatorList.argsArray[index] : null)
                .filter(op => op !== null)
                .flat();

            for (const dep of dependencyOps) {
                try {
                    if (page.commonObjs.has(dep)) {
                        const fontObj = page.commonObjs.get(dep);
                        if (fontObj && (fontObj.name || fontObj.fallbackName) && !fontMap.has(dep)) {
                            const name = fontObj.name || '';
                            const fallback = fontObj.fallbackName || '';
                            let chosenName = name;

                            // If a fallback name exists and is different, check if the original name is cryptic.
                            if (fallback && name !== fallback) {
                                // A name is likely cryptic if it doesn't contain at least 3 consecutive letters.
                                // This avoids flagging real but short font names like "Symbol" or "ZapfDingbats"
                                // but catches tags like "F1", "C2_0", "g_d0_f5".
                                // We also check if it's not a standard subset format, which parseFontNameDetails handles well.
                                const isStandardSubset = /^[A-Z]{6}\+/.test(name);
                                if (!isStandardSubset && !/[a-zA-Z]{3}/.test(name)) {
                                    chosenName = fallback;
                                }
                            }
                            
                            // If after all that, we have no name, but we have a fallback, use it.
                            if (!chosenName && fallback) {
                                chosenName = fallback;
                            }

                            fontMap.set(dep, { id: dep, name: chosenName });
                        }
                    }
                } catch(e) {
                     if (!(e instanceof Error && e.message.includes("Requesting object that isn't resolved yet"))) {
                         console.warn(`Could not process font dependency '${dep}':`, e);
                     }
                }
            }
        }
        
        state.allDocumentFonts = Array.from(fontMap.values()).sort((a, b) => {
            const detailsA = parseFontNameDetails(a.name || '');
            const detailsB = parseFontNameDetails(b.name || '');
            return detailsA.family.localeCompare(detailsB.family) || detailsA.style.localeCompare(detailsB.style);
        });
        showStatusUpdate(`Found ${state.allDocumentFonts.length} unique fonts.`);
    } catch (e) {
        console.error("Advanced font extraction failed:", e);
        showStatusUpdate("Could not analyze document for fonts.");
    }
};
