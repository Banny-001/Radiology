import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import * as cornerstone from "cornerstone-core";
import * as cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
import * as dicomParser from "dicom-parser";

// Register WADO image loader
cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

// Configure the WADO loader to handle our /dicom/ URLs
// By default it only handles wadouri: and wado: protocols
// We need to add http/https support for relative URLs
cornerstoneWADOImageLoader.configure({
  useWebWorkers: true,
  decodeConfig: {
    convertFloatPixelDataToInt: false,
  },
});

// Register the loader for http/https URLs (our relative /dicom/ paths become absolute http URLs)
const webImageLoader = cornerstoneWADOImageLoader.wadouri.loadImage;
cornerstone.registerImageLoader('http', webImageLoader);
cornerstone.registerImageLoader('https', webImageLoader);
// Also register for relative URLs
cornerstone.registerImageLoader('/', webImageLoader);

// Make cornerstone globally available
(window as any).cornerstone = cornerstone;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)