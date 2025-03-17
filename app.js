document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const fileInput = document.getElementById('file-input');
    const textContent = document.getElementById('text-content');
    const visualContent = document.getElementById('visual-content');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const pageNumSpan = document.getElementById('page-num');
    const pageCountSpan = document.getElementById('page-count');
    
    // State management
    let pdfDoc = null;
    let pageNum = 1;
    let pageRendering = false;
    let pageNumPending = null;
    
    // Load PDF function
    async function loadPDF(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            
            // Load PDF document
            pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            pageCountSpan.textContent = pdfDoc.numPages;
            
            // Render first page
            renderPage(pageNum);
        } catch (error) {
            console.error('PDF loading error:', error);
            alert('Error loading PDF file.');
        }
    }
    
    // Page rendering function with improved content separation
    async function renderPage(num) {
        pageRendering = true;
        
        // Clear previous content
        textContent.innerHTML = '';
        visualContent.innerHTML = '';
        
        try {
            // Get page
            const page = await pdfDoc.getPage(num);
            const viewport = page.getViewport({ scale: 1.5 });
            
            // Extract text content with positioning
            const textContent = await page.getTextContent();
            
            // Create text layer with proper positioning
            const textLayerDiv = document.createElement('div');
            textLayerDiv.className = 'text-layer';
            textLayerDiv.style.width = `${viewport.width}px`;
            textLayerDiv.style.height = `${viewport.height}px`;
            
            // Process text items and maintain original formatting
            const textItems = textContent.items;
            
            // Sort text by vertical position to maintain reading order
            textItems.sort((a, b) => {
                // Group items into lines (items within ~10 px height)
                const yDiff = a.transform[5] - b.transform[5];
                if (Math.abs(yDiff) < 10) {
                    // If on same line, sort by horizontal position
                    return a.transform[4] - b.transform[4];
                }
                // Otherwise sort by vertical position (top to bottom)
                return b.transform[5] - a.transform[5];
            });
            
            // Group text items into paragraphs based on vertical spacing
            let currentLine = [];
            let lines = [];
            let lastY = null;
            
            for (const item of textItems) {
                const y = item.transform[5];
                
                if (lastY !== null && Math.abs(y - lastY) > 10) {
                    // New line
                    if (currentLine.length > 0) {
                        lines.push(currentLine);
                        currentLine = [];
                    }
                }
                
                currentLine.push(item);
                lastY = y;
            }
            
            // Add the last line if not empty
            if (currentLine.length > 0) {
                lines.push(currentLine);
            }
            
            // Create formatted text content
            const textDiv = document.getElementById('text-content');
            
            // Process lines into paragraphs
            let currentParagraph = null;
            
            for (const line of lines) {
                const lineText = line.map(item => item.str).join(' ');
                
                // Skip empty lines
                if (!lineText.trim()) {
                    if (currentParagraph) {
                        textDiv.appendChild(currentParagraph);
                        currentParagraph = null;
                    }
                    continue;
                }
                
                // Start a new paragraph or continue the current one
                if (!currentParagraph) {
                    currentParagraph = document.createElement('p');
                    currentParagraph.className = 'pdf-paragraph';
                } else {
                    // Add a space between lines in the same paragraph
                    currentParagraph.appendChild(document.createTextNode(' '));
                }
                
                // Add the line text
                currentParagraph.appendChild(document.createTextNode(lineText));
                
                // If the line ends with punctuation, end the paragraph
                if (/[.!?:]$/.test(lineText)) {
                    textDiv.appendChild(currentParagraph);
                    currentParagraph = null;
                }
            }
            
            // Add any remaining paragraph
            if (currentParagraph) {
                textDiv.appendChild(currentParagraph);
            }
            
            // ----- Visual content rendering -----
            
            // Analyze page for tables and images (this is a heuristic approach)
            await detectAndExtractVisualElements(page, viewport, visualContent);
            
            // Update page number
            pageNumSpan.textContent = num;
            
            // Queue next rendering if pending
            if (pageNumPending !== null) {
                renderPage(pageNumPending);
                pageNumPending = null;
            } else {
                pageRendering = false;
            }
        } catch (error) {
            console.error('Page rendering error:', error);
            pageRendering = false;
        }
    }
    
    // Function to detect and extract visual elements (tables, images)
    async function detectAndExtractVisualElements(page, viewport, container) {
        // Create a canvas to render the entire page
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        
        // Render page to canvas
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        
        await page.render(renderContext).promise;
        
        // Extract operator list to analyze content
        const operatorList = await page.getOperatorList();
        
        // Check for image operations
        const hasImages = operatorList.fnArray.some(op => op === pdfjsLib.OPS.paintImageXObject);
        
        // Check for potential table markers (horizontal and vertical lines)
        const hasTableMarkers = operatorList.fnArray.some(op => 
            op === pdfjsLib.OPS.stroke || 
            op === pdfjsLib.OPS.fill || 
            op === pdfjsLib.OPS.eoFill
        );
        
        // Get text content again to analyze text layout
        const textContent = await page.getTextContent();
        
        // Analyze text patterns for table-like structures
        const isTableLike = analyzeForTableStructure(textContent.items);
        
        // Extract visual elements based on heuristics
        if (hasImages || hasTableMarkers || isTableLike) {
            // Extract the page area with tables/images
            
            // For this simplified version, we'll just add the rendered page
            // In a more advanced implementation, you'd extract specific regions
            
            const visualItem = document.createElement('div');
            visualItem.className = 'visual-item';
            
            const visualTitle = document.createElement('h3');
            visualTitle.textContent = `Visual Elements (Page ${pageNum})`;
            
            visualItem.appendChild(visualTitle);
            
            // Create a info text about the detection
            const detectionInfo = document.createElement('p');
            detectionInfo.className = 'detection-info';
            
            let detectedElements = [];
            if (hasImages) detectedElements.push('Images');
            if (hasTableMarkers || isTableLike) detectedElements.push('Tables');
            
            if (detectedElements.length > 0) {
                detectionInfo.textContent = `Detected: ${detectedElements.join(', ')}`;
                visualItem.appendChild(detectionInfo);
                visualItem.appendChild(canvas);
                container.appendChild(visualItem);
            } else {
                // Don't show anything if no visual elements detected
                // In advanced version, you could crop to specific areas
            }
        }
    }
    
    // Analyze text layout for table-like structures
    function analyzeForTableStructure(textItems) {
        if (textItems.length < 5) return false;
        
        // Group text items by their vertical position
        const lineMap = {};
        
        textItems.forEach(item => {
            // Round to nearest 5px to group nearby items
            const yPos = Math.round(item.transform[5] / 5) * 5;
            
            if (!lineMap[yPos]) {
                lineMap[yPos] = [];
            }
            
            lineMap[yPos].push(item);
        });
        
        // Check if we have multiple lines with consistent horizontal alignment
        const lines = Object.values(lineMap);
        
        if (lines.length < 3) return false; // Need at least 3 rows for a table
        
        // Count lines with more than 2 text items (potential table rows)
        const potentialTableRows = lines.filter(line => line.length > 2);
        
        // If more than 50% of lines have multiple aligned items, likely a table
        return potentialTableRows.length >= lines.length * 0.3;
    }
    
    // Queue page rendering
    function queueRenderPage(num) {
        if (pageRendering) {
            pageNumPending = num;
        } else {
            renderPage(num);
        }
    }
    
    // Show previous page
    function showPrevPage() {
        if (pageNum <= 1) return;
        pageNum--;
        queueRenderPage(pageNum);
    }
    
    // Show next page
    function showNextPage() {
        if (!pdfDoc || pageNum >= pdfDoc.numPages) return;
        pageNum++;
        queueRenderPage(pageNum);
    }
    
    // Event listeners
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'application/pdf') {
            loadPDF(file);
        }
    });
    
    prevPageBtn.addEventListener('click', showPrevPage);
    nextPageBtn.addEventListener('click', showNextPage);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            showPrevPage();
        } else if (e.key === 'ArrowRight') {
            showNextPage();
        }
    });
});