document.addEventListener('DOMContentLoaded', () => {
    // DOM 엘리먼트
    const fileInput = document.getElementById('file-input');
    const textContent = document.getElementById('text-content');
    const visualContent = document.getElementById('visual-content');
    const prevPageBtn = document.getElementById('prev-page');
    const nextPageBtn = document.getElementById('next-page');
    const pageNumSpan = document.getElementById('page-num');
    const pageCountSpan = document.getElementById('page-count');
    
    // 상태 관리
    let pdfDoc = null;
    let pageNum = 1;
    let pageRendering = false;
    let pageNumPending = null;
    
    // PDF 로드 함수
    async function loadPDF(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            
            // PDF 문서 로드
            pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            pageCountSpan.textContent = pdfDoc.numPages;
            
            // 첫 페이지 렌더링
            renderPage(pageNum);
        } catch (error) {
            console.error('PDF 로딩 에러:', error);
            alert('PDF 파일을 로드하는 중 오류가 발생했습니다.');
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
            
            // 페이지 텍스트 추출
            const textContent = await page.getTextContent();
            const textItems = textContent.items;
            
            // 텍스트 패널에 텍스트 표시
            const textStr = textItems
                .map(item => item.str)
                .join(' ');
            
            document.getElementById('text-content').textContent = textStr;
            
            // 페이지 이미지 렌더링 (표와 그래픽을 위한 임시 솔루션)
            const scale = 1.5;
            const viewport = page.getViewport({ scale });
            
            // 캔버스 준비
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;
            
            // 페이지 렌더링
            const renderContext = {
                canvasContext: context,
                viewport: viewport
            };
            
            await page.render(renderContext).promise;
            
            // 이미지 패널에 캔버스 추가
            const visualItem = document.createElement('div');
            visualItem.className = 'visual-item';
            
            const visualTitle = document.createElement('h3');
            visualTitle.textContent = `페이지 ${num} 시각 요소`;
            
            visualItem.appendChild(visualTitle);
            visualItem.appendChild(canvas);
            visualContent.appendChild(visualItem);
            
            // 페이지 번호 업데이트
            pageNumSpan.textContent = num;
            
            // 대기 중인 페이지가 있으면 렌더링
            if (pageNumPending !== null) {
                renderPage(pageNumPending);
                pageNumPending = null;
            } else {
                pageRendering = false;
            }
        } catch (error) {
            console.error('페이지 렌더링 에러:', error);
            pageRendering = false;
        }
    }
    
    // 페이지 변경 함수
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
});