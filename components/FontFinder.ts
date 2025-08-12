// @ts-nocheck
import { GoogleGenAI, Type } from "@google/genai";
import * as dom from './dom.js';
import { setActiveTool } from './tools.js';

let selectedFile = null;

export function initFontFinder() {
    dom.fontFinderForm?.addEventListener('submit', handleFormSubmit);
    dom.finderImageDropArea?.addEventListener('dragover', handleDragOver);
    dom.finderImageDropArea?.addEventListener('dragleave', handleDragLeave);
    dom.finderImageDropArea?.addEventListener('drop', handleDrop);
    dom.finderFontSampleInput?.addEventListener('change', handleFileSelect);
    dom.backToMeasurementFromFinderBtn?.addEventListener('click', () => setActiveTool('selection'));
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    dom.finderImageDropArea.classList.add('border-indigo-500', 'bg-indigo-50');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    dom.finderImageDropArea.classList.remove('border-indigo-500', 'bg-indigo-50');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    dom.finderImageDropArea.classList.remove('border-indigo-500', 'bg-indigo-50');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

function processFile(file) {
    if (!file.type.startsWith('image/')) {
        alert('Please upload an image file (PNG or JPG).');
        return;
    }

    selectedFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        dom.finderImagePreview.src = e.target.result;
        dom.finderImagePreview.classList.remove('hidden');
        dom.finderImageUploadIcon.classList.add('hidden');
        dom.finderFontSampleName.textContent = file.name;
        dom.finderSubmitButton.disabled = false;
    };
    reader.readAsDataURL(file);
}

function fileToGenerativePart(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Data = reader.result.split(',')[1];
            resolve({
                inlineData: {
                    mimeType: file.type,
                    data: base64Data,
                },
            });
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(file);
    });
}

async function handleFormSubmit(e) {
    e.preventDefault();
    if (!selectedFile) {
        alert('Please select an image file first.');
        return;
    }

    const fontName = dom.finderFontNameInput.value.trim();
    setLoadingState(true);
    dom.finderResultArea.classList.remove('hidden');
    dom.finderResultContent.innerHTML = '<div class="flex items-center justify-center"><div class="spinner mr-3"></div><p>AI is analyzing the font...</p></div>';

    try {
        if (!process.env.API_KEY) {
            throw new Error("API_KEY environment variable not set.");
        }
        
        const ai = new GoogleGenAI({apiKey: process.env.API_KEY});
        
        const imagePart = await fileToGenerativePart(selectedFile);
        const textPart = {
            text: `Please identify the font in the provided image. The font name from the 3B2 system is: "${fontName || 'Not Provided'}".`
        };

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ parts: [imagePart, textPart] }],
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        identifiedFont: {
                            type: Type.OBJECT,
                            description: "The primary font identified.",
                            properties: {
                                name: { type: Type.STRING, description: "The most likely real name of the font (e.g., 'Helvetica Neue Bold')." },
                                confidence: { type: Type.STRING, description: "Your confidence level (e.g., 'High', 'Medium', 'Low')." },
                                reasoning: { type: Type.STRING, description: "A brief explanation of why you identified this font, noting key characteristics from the image." }
                            }
                        },
                        alternatives: {
                            type: Type.ARRAY,
                            description: "A list of alternative fonts that are close matches.",
                            items: {
                                type: Type.OBJECT,
                                properties: {
                                   name: { type: Type.STRING, description: "An alternative font name that is a close match." },
                                   reason: { type: Type.STRING, description: "Why this is a possible alternative." }
                                }
                            }
                        },
                        analysisOf3B2Name: { 
                            type: Type.STRING, 
                            description: "If the 3B2 name was provided, explain how it might relate to the identified font (e.g., a subset, a system-specific identifier). If not provided, state that." 
                        }
                    }
                },
                systemInstruction: "You are an expert typographer specializing in identifying fonts. Your task is to analyze an image of a font and an optional font name from a 3B2 publishing system (a legacy system that often uses cryptic font names). You must identify the real, common name of the font. Provide your analysis in the specified JSON format."
            }
        });
        
        const jsonString = response.text;
        const resultData = JSON.parse(jsonString);
        displayResult(resultData);

    } catch (error) {
        console.error("Error identifying font:", error);
        displayError(error.message || "An unknown error occurred.");
    } finally {
        setLoadingState(false);
    }
}

function setLoadingState(isLoading) {
    dom.finderSubmitButton.disabled = isLoading;
    if (isLoading) {
        dom.finderSubmitButton.innerHTML = `
            <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Analyzing...
        `;
    } else {
        dom.finderSubmitButton.innerHTML = 'Identify Font';
    }
}

function displayResult(data) {
    let html = '';

    if (data.identifiedFont) {
        html += `
            <h3 class="text-lg font-semibold text-gray-800 mb-2">Primary Identification</h3>
            <div class="bg-white p-4 rounded-lg border border-gray-200 mb-6">
                <p class="text-2xl font-bold text-indigo-600">${data.identifiedFont.name || 'N/A'}</p>
                <p class="text-sm mt-1"><span class="font-semibold">Confidence:</span> ${data.identifiedFont.confidence || 'N/A'}</p>
                <p class="text-sm mt-2 text-gray-600">${data.identifiedFont.reasoning || 'No reasoning provided.'}</p>
            </div>
        `;
    }

    if (data.analysisOf3B2Name) {
        html += `
            <h3 class="text-lg font-semibold text-gray-800 mb-2">3B2 Name Analysis</h3>
            <div class="bg-white p-4 rounded-lg border border-gray-200 mb-6">
                <p class="text-sm text-gray-600">${data.analysisOf3B2Name}</p>
            </div>
        `;
    }

    if (data.alternatives && data.alternatives.length > 0) {
        html += `
            <h3 class="text-lg font-semibold text-gray-800 mb-2">Close Alternatives</h3>
            <ul class="space-y-3">
        `;
        data.alternatives.forEach(alt => {
            html += `
                <li class="bg-white p-4 rounded-lg border border-gray-200">
                    <p class="font-semibold text-gray-700">${alt.name || 'N/A'}</p>
                    <p class="text-sm mt-1 text-gray-600">${alt.reason || 'No reason provided.'}</p>
                </li>
            `;
        });
        html += `</ul>`;
    }
    
    if (!html) {
        displayError("The AI returned an empty or invalid response. Please try again.");
        return;
    }
    dom.finderResultContent.innerHTML = html;
}

function displayError(message) {
    dom.finderResultContent.innerHTML = `
        <div class="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 rounded-md" role="alert">
            <p class="font-bold">Error</p>
            <p>${message}</p>
        </div>
    `;
}