document.addEventListener('DOMContentLoaded', () => {
    // DOM 엘리먼트
    const fileInput = document.getElementById('file-input');
    const textContent = document.getElementById('text-content');
    const visualContent = document.getElementById('visual-content');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const pageNumSpan = document.getElementById('page-num');
    const pageCountSpan = document.getElementById('page-count');
    const loadingDiv = document.getElementById('loading');
    
    // 상태 관리
    let pdfDoc = null;
    let pageNum = 1;
    let pageRendering = false;
    let pageNumPending = null;
    
    // PDF 로드 함수
    async function loadPDF(file) {
        try {
            // 로딩 표시
            showLoading(true);
            
            const arrayBuffer = await file.arrayBuffer();
            
            // PDF 문서 로드
            pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            pageCountSpan.textContent = pdfDoc.numPages;
            
            // 첫 페이지 렌더링
            renderPage(pageNum);
        } catch (error) {
            console.error('PDF 로딩 에러:', error);
            alert('PDF 파일을 로드하는 중 오류가 발생했습니다.');
            showLoading(false);
        }
    }
    
    // 페이지 렌더링 함수
    async function renderPage(num) {
        pageRendering = true;
        
        // 이전 콘텐츠 초기화
        textContent.innerHTML = '';
        visualContent.innerHTML = '';
        
        try {
            // 페이지 가져오기
            const page = await pdfDoc.getPage(num);
            const viewport = page.getViewport({ scale: 1.5 });
            
            // 텍스트 콘텐츠 추출
            const textExtraction = await page.getTextContent();
            
            // 연산자 목록 추출 (이미지와 그래픽 요소 식별용)
            const operatorList = await page.getOperatorList();
            
            // 캔버스 준비 (전체 페이지 렌더링용)
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            
            // 페이지 렌더링
            const renderContext = {
                canvasContext: ctx,
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
            
            // 텍스트 분석 및 표시
            processTextContent(textExtraction, viewport);
            
            // 이미지 및 표 감지 및 표시
            await processVisualElements(page, operatorList, canvas, viewport);
            
            // 페이지 번호 업데이트
            pageNumSpan.textContent = num;
            
            // 버튼 상태 업데이트
            updateButtonStates();
            
            // 대기 중인 페이지가 있으면 렌더링
            if (pageNumPending !== null) {
                renderPage(pageNumPending);
                pageNumPending = null;
            } else {
                pageRendering = false;
                showLoading(false);
            }
        } catch (error) {
            console.error('페이지 렌더링 에러:', error);
            pageRendering = false;
            showLoading(false);
        }
    }
    
    // 텍스트 콘텐츠 처리
    function processTextContent(textContent, viewport) {
        const textItems = textContent.items;
        
        // 텍스트 항목들을 위치에 따라 정렬
        textItems.sort((a, b) => {
            // 세로 위치로 우선 정렬 (위에서 아래로)
            const yDiff = b.transform[5] - a.transform[5];
            if (Math.abs(yDiff) > 5) {
                return yDiff;
            }
            // 같은 행에서는 가로 위치로 정렬 (왼쪽에서 오른쪽으로)
            return a.transform[4] - b.transform[4];
        });
        
        // 텍스트를 행으로 그룹화
        const lines = [];
        let currentLine = [];
        let lastY = null;
        
        for (const item of textItems) {
            const y = Math.round(item.transform[5]);
            
            if (lastY !== null && Math.abs(y - lastY) > 5) {
                // 새 행 시작
                if (currentLine.length > 0) {
                    lines.push(currentLine);
                    currentLine = [];
                }
            }
            
            currentLine.push(item);
            lastY = y;
        }
        
        // 마지막 행 추가
        if (currentLine.length > 0) {
            lines.push(currentLine);
        }
        
        // 행들을 단락으로 그룹화
        const paragraphs = [];
        let currentParagraph = [];
        
        for (const line of lines) {
            // 행의 텍스트 구성
            const lineText = line.map(item => item.str).join(' ');
            
            // 빈 행 건너뛰기
            if (!lineText.trim()) {
                if (currentParagraph.length > 0) {
                    paragraphs.push(currentParagraph);
                    currentParagraph = [];
                }
                continue;
            }
            
            currentParagraph.push(lineText);
            
            // 구두점으로 끝나면 단락 완성
            if (/[.!?:]$/.test(lineText)) {
                paragraphs.push(currentParagraph);
                currentParagraph = [];
            }
        }
        
        // 마지막 단락 추가
        if (currentParagraph.length > 0) {
            paragraphs.push(currentParagraph);
        }
        
        // 텍스트 내용 표시
        paragraphs.forEach(paragraph => {
            const p = document.createElement('p');
            p.textContent = paragraph.join(' ');
            p.className = 'text-paragraph';
            textContent.appendChild(p);
        });
    }
    
    // 시각적 요소 처리 (이미지 및 표)
    async function processVisualElements(page, operatorList, canvas, viewport) {
        // 이미지 감지
        const hasImages = detectImages(operatorList);
        
        // 표 감지
        const hasTables = detectTables(operatorList, page);
        
        // 이미지나 표가 감지된 경우
        if (hasImages || hasTables) {
            // 이미지 처리
            if (hasImages) {
                const imageSection = createVisualSection('이미지');
                
                // 마킹된 이미지 영역 추출
                await extractImageRegions(page, canvas, viewport, imageSection);
                
                if (imageSection.childElementCount > 1) {  // 제목만 있는 경우 무시
                    visualContent.appendChild(imageSection);
                }
            }
            
            // 표 처리
            if (hasTables) {
                const tableSection = createVisualSection('표');
                
                // 마킹된 표 영역 추출
                await extractTableRegions(page, canvas, viewport, tableSection);
                
                if (tableSection.childElementCount > 1) {  // 제목만 있는 경우 무시
                    visualContent.appendChild(tableSection);
                }
            }
        } else {
            // 시각적 요소가 없는 경우
            const noVisuals = document.createElement('p');
            noVisuals.textContent = '이 페이지에서 표나 이미지를 찾을 수 없습니다.';
            noVisuals.className = 'no-visuals-message';
            visualContent.appendChild(noVisuals);
        }
    }
    
    // 이미지 감지
    function detectImages(operatorList) {
        // PDF 연산자 목록에서 이미지 연산 확인
        return operatorList.fnArray.includes(pdfjsLib.OPS.paintImageXObject) ||
               operatorList.fnArray.includes(pdfjsLib.OPS.paintInlineImageXObject);
    }
    
    // 표 감지
    function detectTables(operatorList, page) {
        // 직선 연산 확인 (표의 가능성)
        const hasLines = operatorList.fnArray.some(op => 
            op === pdfjsLib.OPS.stroke || 
            op === pdfjsLib.OPS.eoFill
        );
        
        // 선 연산이 일정 횟수 이상인지 확인
        const lineCount = operatorList.fnArray.filter(op => 
            op === pdfjsLib.OPS.stroke
        ).length;
        
        return hasLines && lineCount > 5;
    }
    
    // 이미지 영역 추출
    async function extractImageRegions(page, canvas, viewport, container) {
        // 이 예제에서는 간단하게 전체 캔버스 이미지에서 이미지를 찾는 휴리스틱 접근 방식 사용
        // 실제 구현에서는 더 정교한 이미지 감지 알고리즘 필요
        
        // 이미지 항목 생성
        const imageItem = document.createElement('div');
        imageItem.className = 'visual-item';
        
        const imageTitle = document.createElement('h4');
        imageTitle.textContent = '감지된 이미지';
        
        // 캔버스 이미지 복제
        const imageCanvas = document.createElement('canvas');
        imageCanvas.width = canvas.width;
        imageCanvas.height = canvas.height;
        const imageCtx = imageCanvas.getContext('2d');
        imageCtx.drawImage(canvas, 0, 0);
        
        // 캔버스를 이미지로 변환
        const image = document.createElement('img');
        image.src = imageCanvas.toDataURL('image/png');
        
        imageItem.appendChild(imageTitle);
        imageItem.appendChild(image);
        container.appendChild(imageItem);
    }
    
    // 표 영역 추출
    async function extractTableRegions(page, canvas, viewport, container) {
        // 이 예제에서는 간단하게 전체 캔버스 이미지에서 표를 찾는 휴리스틱 접근 방식 사용
        // 실제 구현에서는 더 정교한 표 감지 알고리즘 필요
        
        // 표 항목 생성
        const tableItem = document.createElement('div');
        tableItem.className = 'visual-item';
        
        const tableTitle = document.createElement('h4');
        tableTitle.textContent = '감지된 표';
        
        // 캔버스 이미지 복제
        const tableCanvas = document.createElement('canvas');
        tableCanvas.width = canvas.width;
        tableCanvas.height = canvas.height;
        const tableCtx = tableCanvas.getContext('2d');
        tableCtx.drawImage(canvas, 0, 0);
        
        // 캔버스를 이미지로 변환
        const tableImage = document.createElement('img');
        tableImage.src = tableCanvas.toDataURL('image/png');
        
        tableItem.appendChild(tableTitle);
        tableItem.appendChild(tableImage);
        container.appendChild(tableItem);
    }
    
    // 시각적 요소 섹션 생성
    function createVisualSection(title) {
        const section = document.createElement('div');
        section.className = 'visual-section';
        
        const sectionTitle = document.createElement('h3');
        sectionTitle.textContent = title;
        section.appendChild(sectionTitle);
        
        return section;
    }
    
    // 로딩 표시 함수
    function showLoading(isLoading) {
        const loadingElement = document.getElementById('loading');
        if (loadingElement) {
            loadingElement.style.display = isLoading ? 'flex' : 'none';
        }
    }
    
    // 버튼 상태 업데이트
    function updateButtonStates() {
        if (!pdfDoc) return;
        
        prevPageBtn.disabled = pageNum <= 1;
        nextPageBtn.disabled = pageNum >= pdfDoc.numPages;
    }
    
    // 페이지 변경 대기열 함수
    function queueRenderPage(num) {
        if (pageRendering) {
            pageNumPending = num;
        } else {
            renderPage(num);
        }
    }
    
    // 이전 페이지 보기
    function showPrevPage() {
        if (pageNum <= 1) return;
        pageNum--;
        queueRenderPage(pageNum);
    }
    
    // 다음 페이지 보기
    function showNextPage() {
        if (!pdfDoc || pageNum >= pdfDoc.numPages) return;
        pageNum++;
        queueRenderPage(pageNum);
    }
    
    // 이벤트 리스너
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file && file.type === 'application/pdf') {
            loadPDF(file);
        }
    });
    
    prevPageBtn.addEventListener('click', showPrevPage);
    nextPageBtn.addEventListener('click', showNextPage);
    
    // 키보드 단축키
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            showPrevPage();
        } else if (e.key === 'ArrowRight') {
            showNextPage();
        }
    });
    
    // 로딩 요소 생성
    createLoadingElement();
    
    // 로딩 요소 생성 함수
    function createLoadingElement() {
        // 이미 존재하는지 확인
        if (document.getElementById('loading')) return;
        
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'loading';
        loadingDiv.style.display = 'none';
        loadingDiv.style.position = 'fixed';
        loadingDiv.style.top = '0';
        loadingDiv.style.left = '0';
        loadingDiv.style.width = '100%';
        loadingDiv.style.height = '100%';
        loadingDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        loadingDiv.style.display = 'none';
        loadingDiv.style.justifyContent = 'center';
        loadingDiv.style.alignItems = 'center';
        loadingDiv.style.zIndex = '1000';
        
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        spinner.style.border = '5px solid #f3f3f3';
        spinner.style.borderTop = '5px solid #3498db';
        spinner.style.borderRadius = '50%';
        spinner.style.width = '50px';
        spinner.style.height = '50px';
        spinner.style.animation = 'spin 1s linear infinite';
        
        const loadingText = document.createElement('p');
        loadingText.textContent = 'PDF 처리 중...';
        loadingText.style.color = 'white';
        loadingText.style.marginTop = '10px';
        
        loadingDiv.appendChild(spinner);
        loadingDiv.appendChild(loadingText);
        
        // 스타일시트에 애니메이션 추가
        const style = document.createElement('style');
        style.textContent = `
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        `;
        
        document.head.appendChild(style);
        document.body.appendChild(loadingDiv);
    }
});