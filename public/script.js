// --- index.html에서 이동된 XLSX 처리 유틸리티 ---
var gk_isXlsx = false;
var gk_xlsxFileLookup = {};
var gk_fileData = {};
function filledCell(cell) {
  return cell !== '' && cell != null;
}
function loadFileData(filename) {
if (gk_isXlsx && gk_xlsxFileLookup[filename]) {
    try {
        var workbook = XLSX.read(gk_fileData[filename], { type: 'base64' });
        var firstSheetName = workbook.SheetNames[0];
        var worksheet = workbook.Sheets[firstSheetName];

        // Convert sheet to JSON to filter blank rows
        var jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, blankrows: false, defval: '' });
        // Filter out blank rows (rows where all cells are empty, null, or undefined)
        var filteredData = jsonData.filter(row => row.some(filledCell));

        // Heuristic to find the header row by ignoring rows with fewer filled cells than the next row
        var headerRowIndex = filteredData.findIndex((row, index) =>
          row.filter(filledCell).length >= filteredData[index + 1]?.filter(filledCell).length
        );
        // Fallback
        if (headerRowIndex === -1 || headerRowIndex > 25) {
          headerRowIndex = 0;
        }

        // Convert filtered JSON back to CSV
        var csv = XLSX.utils.aoa_to_sheet(filteredData.slice(headerRowIndex)); // Create a new sheet from filtered array of arrays
        csv = XLSX.utils.utils.sheet_to_csv(csv, { header: 1 });
        return csv;
    } catch (e) {
        console.error(e);
        return "";
    }
}
return gk_fileData[filename] || "";
}
// --------------------------------------------------


// --- 전역 변수 설정 ---
const MAX_FILES = 50; // 파일 첨부 최대 개수 50개
const CHUNK_SIZE_LIMIT = 500; // 한 번에 발화할 텍스트의 최대 글자 수
const VISIBLE_CHUNKS = 10; // 가상화: 한 번에 렌더링할 청크 수
const URL_PATTERN = /^(http|https):\/\/[^\s$.?#].[^\s]*$/i; // URL 인식 패턴

// --- 파일 관련 상수 추가 ---
const TEXT_EXTENSIONS = ['.txt', 'pdf'];
const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.tiff', '.tif'];
const ALLOWED_EXTENSIONS = [...TEXT_EXTENSIONS, ...IMAGE_EXTENSIONS];

// filesData 구조: { id, name, fullText(텍스트파일 또는 OCR 결과), fileObject(이미지파일 객체), isImage, chunks, isProcessed(청크까지 완료), isOcrProcessing }
let filesData = []; 
let currentFileIndex = -1;
let currentChunkIndex = 0;
let currentCharIndex = 0; // 청크 내 현재 문자 위치
let isSequential = true; // 정주행 기능 상태 (기본값: true)
let wakeLock = null; // Wake Lock 객체
let noSleep = null; // NoSleep.js 객체

// Web Speech API 객체
const synth = window.speechSynthesis;
let currentUtterance = null; // 현재 발화 중인 SpeechSynthesisUtterance 객체
let isPaused = false;
let isSpeaking = false;
let isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent); // 모바일 감지

// DOM 요소 선택 헬퍼
const $ = (selector) => document.querySelector(selector); 
let $fileInput, $fullScreenDropArea, $fileList, $textViewer, $voiceSelect, $rateSlider, $rateDisplay, $playPauseBtn;
let $sequentialReadCheckbox, $clearAllFilesBtn;

// URL/IFRAME 관련 DOM 변수 추가
let $urlInputMobile, $loadUrlBtnMobile, $contentFrameMobile;
let $urlInputDesktop, $loadUrlBtnDesktop, $contentFrameDesktop;

const INITIAL_TEXT_VIEWER_TEXT = '텍스트, 이미지 파일을 드래그하여 첨부하거나 텍스트/URL을 붙여넣어 오디오북으로 변환하세요! 모바일에선 파일첨부, 음성로드 버튼을 활용해주세요';
const INITIAL_TEXT_VIEWER_CONTENT = `<p>${INITIAL_TEXT_VIEWER_TEXT}</p>`;

// --- 초기화 ---
// document.addEventListener('DOMContentLoaded', () => { // ✅ 수정: 이 줄을 제거하고 즉시 실행되도록 변경
    // DOM 요소 할당
    $fileInput = $('#file-input');
    $fullScreenDropArea = $('#full-screen-drop-area');
    $fileList = $('#file-list');
    $textViewer = $('#text-viewer');
    $voiceSelect = $('#voice-select');
    $rateSlider = $('#rate-slider');
    $rateDisplay = $('#rate-display');
    $playPauseBtn = $('#play-pause-btn');
    $sequentialReadCheckbox = $('#sequential-read-checkbox');
    $clearAllFilesBtn = $('#clear-all-files-btn');
    
    // URL/IFRAME DOM 요소 할당 (데스크톱 및 모바일)
    $urlInputMobile = $('#url-input-mobile');
    $loadUrlBtnMobile = $('#load-url-btn-mobile');
    $contentFrameMobile = $('#content-frame-mobile');
    $urlInputDesktop = $('#url-input-desktop');
    $loadUrlBtnDesktop = $('#load-url-btn-desktop');
    $contentFrameDesktop = $('#content-frame-desktop');

    if (!('speechSynthesis' in window)) {
        alert('Web Speech API를 지원하지 않는 브라우저입니다.');
        // return; // Next.js 환경에서는 return 대신 초기화 중단
    }

    // VoiceList 로드 및 기본 설정 로드
    // window.speechSynthesis가 로드되었을 때만 실행
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        if (synth.getVoices().length > 0) {
            populateVoiceList();
        }
        synth.onvoiceschanged = populateVoiceList;
    }


    // 북마크 로드 (이어듣기 프롬프트 포함)
    loadBookmark();

    if ($fileInput) {
        $fileInput.addEventListener('change', handleFiles);
    }
    setupFullScreenDragAndDrop();

    if ($playPauseBtn) {
        $('#play-pause-btn').addEventListener('click', togglePlayPause);
    }
    
    $('#stop-btn').addEventListener('click', stopReading);
    $('#next-file-btn').addEventListener('click', () => changeFile(currentFileIndex + 1));
    $('#prev-file-btn').addEventListener('click', () => changeFile(currentFileIndex - 1));

    $rateSlider.addEventListener('input', updateRateDisplay);
    $rateSlider.addEventListener('change', () => saveBookmark());

    $voiceSelect.addEventListener('change', () => {
        saveBookmark();
        if (isSpeaking) {
            synth.cancel();
            speakNextChunk();
        }
    });

    setupTextViewerClickEvent();
    $textViewer.addEventListener('paste', handlePasteInTextViewer);
    $textViewer.addEventListener('focus', clearInitialTextViewerContent);
    $textViewer.addEventListener('focusout', restoreInitialTextViewerContent);

    $sequentialReadCheckbox.addEventListener('change', (e) => {
        isSequential = e.target.checked;
        saveBookmark();
    });

    $clearAllFilesBtn.addEventListener('click', clearAllFiles);
    $fileList.addEventListener('click', handleFileListItemClick);

    setupFileListSortable();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // --- URL/IFRAME 이벤트 설정 시작 ---
    if ($loadUrlBtnMobile) {
        $loadUrlBtnMobile.addEventListener('click', () => loadUrl($urlInputMobile.value, $contentFrameMobile));
        $urlInputMobile.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') loadUrl($urlInputMobile.value, $contentFrameMobile);
        });
        
        // [수정] 모바일 iframe 주소 변경 감지 리스너 추가
        if ($contentFrameMobile) {
            $contentFrameMobile.addEventListener('load', () => {
                updateUrlInputOnIframeLoad($contentFrameMobile, $urlInputMobile);
            });
        }
    }

    if ($loadUrlBtnDesktop) {
        $loadUrlBtnDesktop.addEventListener('click', () => loadUrl($urlInputDesktop.value, $contentFrameDesktop));
        $urlInputDesktop.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') loadUrl($urlInputDesktop.value, $contentFrameDesktop);
        });
        
        // [수정] 데스크톱 iframe 주소 변경 감지 리스너 추가
        if ($contentFrameDesktop) {
            $contentFrameDesktop.addEventListener('load', () => {
                updateUrlInputOnIframeLoad($contentFrameDesktop, $urlInputDesktop);
            });
        }
    }
    // --- URL/IFRAME 이벤트 설정 끝 ---

    // 모바일 전용 버튼 설정
    if (isMobile) {
        const $mobileFileUploadBtn = $('#mobile-file-upload-btn');
        const $mobileLoadVoiceBtn = $('#mobile-load-voice-btn');

        if ($mobileFileUploadBtn) {
            $mobileFileUploadBtn.addEventListener('click', () => {
                console.log('모바일 파일첨부 버튼 클릭'); // 디버깅용
                $fileInput.click();
            });
        }

        if ($mobileLoadVoiceBtn) {
            $mobileLoadVoiceBtn.addEventListener('click', () => {
                console.log('모바일 음성로드 버튼 클릭'); // 디버깅용
                const extractedText = $textViewer.textContent.trim().replace(/(\n\s*){3,}/g, '\n\n');
                $textViewer.innerHTML = '';
                if (extractedText && extractedText.replace(/\s+/g, ' ') !== INITIAL_TEXT_VIEWER_TEXT.replace(/\s+/g, ' ')) {
                    console.log('처리된 텍스트:', extractedText); // 디버깅용
                    if (URL_PATTERN.test(extractedText)) {
                        fetchAndProcessUrlContent(extractedText);
                    } else {
                        processPastedText(extractedText);
                    }
                } else {
                    $textViewer.innerHTML = INITIAL_TEXT_VIEWER_CONTENT;
                }
            });
        }
    }
// }); // ✅ 수정: 이 줄을 제거하고 즉시 실행되도록 변경

// --- URL 로드 함수 추가 ---
function loadUrl(url, iframeElement) {
    let finalUrl = url.trim();

    if (finalUrl === "") {
        alert("URL을 입력해 주세요.");
        return;
    }

    // URL에 'http://' 또는 'https://'가 포함되어 있지 않다면 추가
    if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
        finalUrl = 'https://' + finalUrl;
    }

    // iframe의 src 속성을 입력된 URL로 변경
    iframeElement.src = finalUrl;
    
    console.log("Iframe 주소 변경됨:", finalUrl);
}

// --- iframe 주소 변경 시 URL 입력창 업데이트 함수 추가 ---
function updateUrlInputOnIframeLoad(iframeElement, urlInputElement) {
    try {
        // Same-Origin Policy 때문에 다른 도메인의 iframe URL 접근은 오류를 발생시킵니다.
        // 접근이 가능한 경우(동일 도메인 또는 정책 허용)에만 URL을 업데이트합니다.
        const iframeUrl = iframeElement.contentWindow.location.href;
        
        // about:blank는 건너뜁니다.
        if (iframeUrl && iframeUrl !== 'about:blank') {
            urlInputElement.value = iframeUrl;
            console.log(`URL 입력창 업데이트됨 (동일 출처): ${iframeUrl}`);
        }
    } catch (e) {
        // Cross-Origin (다른 도메인) 접근 시 발생하는 오류를 무시합니다.
        console.warn("Iframe URL 접근 불가 (Same-Origin Policy 위반). URL 입력창은 업데이트되지 않았습니다.");
        // 사용자에게 현재 iframe이 다른 도메인을 로드 중임을 알릴 수 있습니다.
        // urlInputElement.value = "외부 페이지 (URL 접근 제한됨)"; 
    }
}
// --- URL 로드 함수 끝 ---

// --- 유틸리티 함수 ---
function clearInitialTextViewerContent() {
    const currentText = $textViewer.textContent.trim().replace(/\s+/g, ' ');
    const initialText = INITIAL_TEXT_VIEWER_TEXT.trim().replace(/\s+/g, ' ');
    if (currentText === initialText || currentText === '') {
        $textViewer.innerHTML = '';
        $textViewer.setAttribute('data-placeholder', ''); // 포커싱 상태 표시
    }
}

function restoreInitialTextViewerContent() {
    const currentText = $textViewer.textContent.trim().replace(/\s+/g, ' ');
    if (currentText === '') {
        $textViewer.innerHTML = INITIAL_TEXT_VIEWER_CONTENT;
        $textViewer.removeAttribute('data-placeholder'); // 포커스 아웃 상태 표시
    }
}

async function handleVisibilityChange() {
    if (document.visibilityState === 'hidden') {
        if (isSpeaking && !isPaused) {
            if (isMobile) {
                synth.cancel();
            } else {
                synth.pause();
            }
            isPaused = true;
        }
    } else if (document.visibilityState === 'visible' && isSpeaking && isPaused) {
        if (isMobile) {
            speakNextChunk();
        } else {
            synth.resume();
        }
        isPaused = false;
        if (isSpeaking) {
            await requestWakeLock();
        }
    }
}

window.addEventListener('beforeunload', () => {
    saveBookmark(); // 파일 목록과 현재 위치를 포함하여 북마크 저장
    if (synth.speaking) {
        synth.cancel();
    }
    releaseWakeLock();
});

// --- Wake Lock ---
async function requestWakeLock() {
    if ('wakeLock' in navigator) {
        try {
            wakeLock = await navigator.wakeLock.request('screen');
        } catch (err) {
            if (typeof NoSleep !== 'undefined') {
                noSleep = new NoSleep();
                noSleep.enable();
            }
        }
    } else if (typeof NoSleep !== 'undefined') {
        noSleep = new NoSleep();
        noSleep.enable();
    }
}

function releaseWakeLock() {
    if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
    }
    if (noSleep) {
        noSleep.disable();
        noSleep = null;
    }
}

// --- 목소리 설정 ---
function populateVoiceList() {
    const voices = synth.getVoices();
    $voiceSelect.innerHTML = '';

    let koreanVoices = [];
    let preferredVoiceName = null;

    voices.forEach((voice) => {
        const option = new Option(`${voice.name} (${voice.lang})`, voice.name);
        if (voice.lang.includes('ko')) {
            koreanVoices.push(option);
            if (voice.name.includes('Google') || voice.name.includes('Standard') || voice.name.includes('Wavenet')) {
                preferredVoiceName = voice.name;
            }
        }
    });

    koreanVoices.forEach(option => $voiceSelect.appendChild(option));

    // loadBookmark에서 북마크 설정을 처리하고, 여기서는 Voice 선택만 처리합니다.
    const savedBookmark = JSON.parse(localStorage.getItem('autumnReaderBookmark'));
    let selectedVoice = savedBookmark?.settings?.voice || preferredVoiceName || (koreanVoices.length > 0 ? koreanVoices[0].value : null);

    if (selectedVoice && $voiceSelect.querySelector(`option[value="${selectedVoice}"]`)) {
         $voiceSelect.value = selectedVoice;
    } else if (koreanVoices.length > 0) {
        $voiceSelect.value = koreanVoices[0].value;
    }
    
    // rate display 초기화는 loadBookmark에서 처리되거나, 처음 로드시 기본값으로 설정
    updateRateDisplay();
}

function updateRateDisplay() {
    $rateDisplay.textContent = $rateSlider.value;
}

// --- 파일 처리 및 인코딩 변환 ---
function readTextFile(file, encoding) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const decoder = new TextDecoder(encoding);
                const content = decoder.decode(e.target.result);
                resolve(content);
            } catch (error) {
                reject(new Error(`디코딩 오류 (${encoding}): ${error.message}`));
            }
        };
        reader.onerror = (e) => reject(new Error(`파일 읽기 오류: ${e.target.error.name}`));
        reader.readAsArrayBuffer(file);
    });
}

// --- OCR 처리 ---
async function processImageOCR(fileOrUrl) {
    const worker = await Tesseract.createWorker('kor');
    try {
        let imageSource;
        if (typeof fileOrUrl === 'string') {
            imageSource = fileOrUrl;
        } else {
            imageSource = URL.createObjectURL(fileOrUrl);
        }
        const { data: { text } } = await worker.recognize(imageSource);
        return text.trim();
    } catch (error) {
        console.error('OCR 오류:', error);
        return '';
    } finally {
        await worker.terminate();
    }
}

// --- URL 처리 ---
async function fetchAndProcessUrlContent(url) {
    if (!url) return;
    
    // ✅ 수정: Vercel 배포 도메인의 API Route를 사용합니다.
    const VERCEL_PROXY_URL = '/api/proxy?targetUrl=';
    const targetUrl = VERCEL_PROXY_URL + encodeURIComponent(url);
    
    try {
        $textViewer.innerHTML = '웹페이지 콘텐츠를 불러오는 중입니다...';
        stopReading();
        
        const response = await fetch(targetUrl);
        
        // 🚨 수정: 프록시 서버에서 보낸 JSON 에러 응답을 더 강력하게 처리합니다.
        if (!response.ok) {
            let errorMessage = `HTTP 오류: ${response.status}. 콘텐츠 로드에 실패했습니다.`;
            
            try {
                // 프록시 서버(route.ts)에서 JSON 에러를 보냈는지 확인합니다.
                const errorData = await response.json();
                if (errorData.error) {
                    errorMessage = `프록시 오류: ${errorData.error}. 원인: 대상 서버(예: Cloudflare)에서 차단되었습니다.`;
                } else {
                    errorMessage = `HTTP 오류: ${response.status}. 원본 서버 오류.`;
                }
            } catch (e) {
                // JSON 파싱 실패 시, 일반 HTTP 오류로 처리합니다.
                // Cloudflare 차단 시, 응답이 HTML 캡차 페이지일 수 있습니다.
                if (response.status === 403 || response.status === 404) {
                     errorMessage = `HTTP 오류: ${response.status}. 대상 서버(Cloudflare)에서 요청을 거부했습니다. (봇 감지 가능성)`;
                }
            }
            
            throw new Error(errorMessage);
        }
        
        const htmlText = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        
        // --- 요청에 따라 'option'과 '#viewcomment'를 추가하여 제거합니다. ---
        const selectorsToRemove = 'script, style, link, header, footer, nav, aside, iframe, noscript, .ad, .advertisement, #comments, .sidebar, option, #viewcomment, .toon-nav, .modal, .widget-side-line, .novelticon-modal, .ad-agree-pop, #user_donation_coin';
        doc.querySelectorAll(selectorsToRemove).forEach(el => el.remove());
        // ------------------------------------------------------------------
        
        const contentCandidates = Array.from(doc.querySelectorAll('article, main, .post, .entry, .content, #viewer_no_drag, #content, #novel_box, #novel_text, #novel_drawing'));
        let bestText = '';
        let maxTextLength = 0;
        
        const cleanText = (element) => {
            if (!element) return '';
            let text = element.textContent.trim();
            text = text.replace(/(\n\s*){3,}/g, '\n\n').replace(/\t/g, ' ').replace(/\s{2,}/g, ' ');
            return text;
        };
        
        for (const candidate of contentCandidates) {
            const candidateText = cleanText(candidate);
            if (candidateText.length > maxTextLength) {
                maxTextLength = candidateText.length;
                bestText = candidateText;
            }
        }
        
        let text = bestText.trim();
        
        if (text.length < 50) {
            const pTags = Array.from(doc.querySelectorAll('p'));
            text = pTags.map(p => p.textContent.trim()).join('\n\n');
            text = text.replace(/(\n\s*){3,}/g, '\n\n').replace(/\s{2,}/g, ' ').trim();
        }
        
        if (text.length < 50) {
            throw new Error("콘텐츠를 찾을 수 없습니다.");
        }

        const fileId = Date.now() + Math.floor(Math.random() * 1000000);
        const fileName = `[URL] ${url.substring(0, 50).replace(/(\/|\?)/g, ' ')}...`;
        const newFileData = {
            id: fileId,
            name: fileName,
            fullText: text,
            chunks: [],
            isProcessed: false,
            isImage: false,
            isOcrProcessing: false
        };
        
        filesData.unshift(newFileData);
        if (filesData.length > MAX_FILES) filesData.pop();

        renderFileList();
        currentFileIndex = 0;
        processFileChunks(0, true);
        $textViewer.innerHTML = '';
        
    } catch (error) {
        alert(`URL 로드 실패: ${error.message}`);
        $textViewer.innerHTML = `<p style="color:red;">오류: ${error.message}</p>`;
    }
}

// --- 붙여넣기 처리 ---
function processPastedText(text) {
    if (!text) return;

    const fileId = Date.now() + Math.floor(Math.random() * 1000000);
    const fileName = `[클립보드] ${new Date().toLocaleTimeString()} - ${text.substring(0, 20)}...`;

    const newFileData = {
        id: fileId,
        name: fileName,
        fullText: text,
        chunks: [],
        isProcessed: false,
        isImage: false,
        isOcrProcessing: false
    };

    filesData.unshift(newFileData);
    if (filesData.length > MAX_FILES) filesData.pop();

    renderFileList();
    currentFileIndex = 0;
    processFileChunks(0, true);
    $textViewer.innerHTML = '';
}

function handlePasteInTextViewer(e) {
    clearInitialTextViewerContent();
    
    if (!isMobile) {
        e.preventDefault();
        const pasteData = (e.clipboardData || window.clipboardData).getData('text');
        const trimmedText = pasteData.trim();
        
        if (trimmedText) {
            if (URL_PATTERN.test(trimmedText)) {
                fetchAndProcessUrlContent(trimmedText);
            } else {
                processPastedText(trimmedText);
            }
        }
        return;
    } 
    // 모바일 paste 시 버튼으로 처리
}

// --- 파일 업로드 처리 ---
async function handleFiles(event) {
    clearInitialTextViewerContent();
    
    const newFiles = Array.from(event.target.files).filter(file => {
        const lowerName = file.name.toLowerCase();
        return ALLOWED_EXTENSIONS.some(ext => lowerName.endsWith(ext));
    });
    
    if (filesData.length + newFiles.length > MAX_FILES) {
        alert(`최대 ${MAX_FILES}개 파일만 첨부 가능합니다.`);
        newFiles.splice(MAX_FILES - filesData.length);
    }
    
    if (newFiles.length === 0) {
        event.target.value = '';
        return;
    }

    const filePromises = newFiles.map(async (file) => {
        const lowerName = file.name.toLowerCase();
        const isImageFile = IMAGE_EXTENSIONS.some(ext => lowerName.endsWith(ext));
        let content = '';
        let fileObject = isImageFile ? file : null;

        if (!isImageFile) {
            try {
                content = await readTextFile(file, 'utf-8');
                if (!content || content.includes('\ufffd')) {
                    console.log(`파일 "${file.name}" UTF-8 읽기 실패. Windows-949로 재시도.`);
                    try {
                        content = await readTextFile(file, 'windows-949');
                        if (content.includes('\ufffd')) {
                            console.warn(`파일 "${file.name}"은(는) windows-949로도 완벽히 읽을 수 없습니다.`);
                        } else {
                            console.log(`파일 "${file.name}"을(를) windows-949로 성공적으로 읽었습니다.`);
                        }
                    } catch (error) {
                        console.error(`파일 "${file.name}" 인코딩 처리 최종 실패:`, error);
                        alert(`파일 "${file.name}"을(를) 읽는 데 실패했습니다. 파일 인코딩을 확인해 주세요.`);
                        return null;
                    }
                }
            } catch (error) {
                console.error(`파일 "${file.name}" 읽기 오류:`, error);
                alert(`파일 "${file.name}"을(를) 읽는 데 실패했습니다. 파일 형식을 확인해 주세요.`);
                return null;
            }
        }
        
        const fileId = Date.now() + Math.floor(Math.random() * 1000000);
        return {
            id: fileId,
            name: file.name,
            fullText: content || '',
            fileObject: fileObject,
            isImage: isImageFile,
            chunks: [],
            isProcessed: !isImageFile,
            isOcrProcessing: false
        };
    });

    const results = await Promise.all(filePromises);
    const newlyReadFiles = results.filter(file => file !== null);
    
    if (newlyReadFiles.length === 0) {
        event.target.value = '';
        return;
    }

    newlyReadFiles.sort((a, b) => a.name.localeCompare(b.name, 'ko', { numeric: true }));
    
    const initialFilesCount = filesData.length;
    filesData.push(...newlyReadFiles);

    if (currentFileIndex === -1) {
        currentFileIndex = initialFilesCount;
    }
    
    renderFileList();
    
    let firstUnprocessedIndex = filesData.findIndex(f => !f.isProcessed && !f.isImage);
    if (firstUnprocessedIndex === -1) {
        firstUnprocessedIndex = filesData.findIndex(f => !f.isProcessed && f.isImage);
    }
    
    if (firstUnprocessedIndex !== -1) {
        processFile(firstUnprocessedIndex, false);
    }

    // 파일 입력 초기화 (동일 파일 재업로드 가능하게)
    event.target.value = '';
}

// --- 파일 처리 흐름 ---
function processFile(fileIndex, startReading) {
    const file = filesData[fileIndex];
    if (!file || file.isProcessed) return;

    if (file.isImage) {
        if (typeof Tesseract === 'undefined') {
            alert('이미지 OCR 기능을 위해 Tesseract.js 스크립트가 로드되지 않았습니다.');
            file.isProcessed = true;
            renderFileList();
            return;
        }

        if (file.isOcrProcessing) return; 

        file.isOcrProcessing = true;
        renderFileList();

        (async () => {
            try {
                const text = await processImageOCR(file.fileObject);
                file.fullText = text;
                file.isImage = false;
                file.isProcessed = true;
                file.isOcrProcessing = false;
                file.fileObject = null;
                
                processFileChunks(fileIndex, startReading);
                
                // OCR 처리 후 다음 미처리 파일 (이미지 또는 텍스트) 자동 처리
                let nextUnprocessedIndex = filesData.findIndex((f, i) => !f.isProcessed && i > fileIndex);
                if (nextUnprocessedIndex === -1) {
                    nextUnprocessedIndex = filesData.findIndex((f, i) => !f.isProcessed && !f.isImage && i > fileIndex);
                }
                if (nextUnprocessedIndex === -1) {
                    nextUnprocessedIndex = filesData.findIndex((f, i) => !f.isProcessed && f.isImage && i > fileIndex);
                }
                
                if (nextUnprocessedIndex !== -1) {
                    processFile(nextUnprocessedIndex, false);
                }

            } catch (error) {
                console.error('파일 처리 중 오류:', error);
                alert(`파일 처리 중 오류 발생: ${file.name}`);
                file.isOcrProcessing = false;
                file.isProcessed = true;
                renderFileList();
            }
        })();
    } else if (!file.isImage) {
        file.isProcessed = true;
        processFileChunks(fileIndex, startReading);
    }
}

// --- 청크 처리 ---
function processFileChunks(fileIndex, startReading) {
    const file = filesData[fileIndex];
    if (!file || !file.isProcessed) return;

    // 북마크 로드 시 이미 chunks가 채워져 있을 수 있습니다.
    if (file.chunks.length > 0 && file.chunks[0] !== '' && !file.fullText) {
        // fullText가 없는데 chunks가 있는 경우, 복원된 청크 사용
        console.log(`[복원] 파일 "${file.name}" 복원된 청크 사용. 총 ${file.chunks.length}개 청크.`);
        if (startReading && currentFileIndex === fileIndex) {
            renderTextViewer(fileIndex);
            startReadingFromCurrentChunk();
        }
        renderFileList();
        return;
    }

    // fullText가 없거나, fullText는 있는데 chunks가 비어있는 경우 (일반적인 처리)
    const text = file.fullText || '';
    if (!text) {
        file.isProcessed = true;
        file.chunks = [''];
        console.warn(`파일 "${file.name}"의 텍스트가 비어 있습니다.`);
        if (startReading && currentFileIndex === fileIndex) {
            renderTextViewer(fileIndex);
            // startReadingFromCurrentChunk(); // 빈 파일은 재생하지 않음
        }
        renderFileList();
        return;
    }

    const sentences = text.match(/[^.!?\n]+[.!?\n]+|[^\s]+/g) || [text];
    let currentChunk = '';
    file.chunks = [];

    sentences.forEach((sentence) => {
        if (!sentence) return;
        const newChunk = currentChunk + sentence;
        if (newChunk.length > CHUNK_SIZE_LIMIT) {
            if (currentChunk) {
                file.chunks.push(currentChunk.trim());
            }
            currentChunk = sentence;
        } else {
            currentChunk = newChunk;
        }
    });

    if (currentChunk.trim()) {
        file.chunks.push(currentChunk.trim());
    }
    
    if (file.chunks.length === 0) {
        file.chunks = [text.trim().substring(0, CHUNK_SIZE_LIMIT)]; // 최소한 500자 이하의 청크라도 생성
    }

    // 재생 시작 요청이 있었으면 시작
    if (startReading && currentFileIndex === fileIndex) {
        renderTextViewer(fileIndex);
        startReadingFromCurrentChunk();
    }
    
    renderFileList();
}


// --- 드래그 앤 드롭 ---
function setupFullScreenDragAndDrop() {
    // 1. 드래그 오버 시 화면 중앙 표시
    document.body.addEventListener('dragover', (e) => {
        e.preventDefault();
        $fullScreenDropArea.style.display = 'flex';
    });

    // 2. 드래그 리브 시 숨기기
    $fullScreenDropArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        // 실제 드롭 영역을 벗어났을 때만 숨김
        if (e.target === $fullScreenDropArea) {
            $fullScreenDropArea.style.display = 'none';
        }
    });

    // 3. 드롭 시 파일 처리
    $fullScreenDropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        $fullScreenDropArea.style.display = 'none';

        const dataTransfer = e.dataTransfer;
        if (dataTransfer.files.length > 0) {
            handleFiles({ target: { files: dataTransfer.files, value: '' } });
        } else if (dataTransfer.getData('text/plain')) {
            // 텍스트 드롭 처리 (URL 또는 일반 텍스트)
            const droppedText = dataTransfer.getData('text/plain').trim();
            if (droppedText) {
                if (URL_PATTERN.test(droppedText)) {
                    fetchAndProcessUrlContent(droppedText);
                } else {
                    processPastedText(droppedText);
                }
            }
        }
    });
    
    // 4. 일반 화면 드롭 방지 (파일 입력으로만 처리되도록)
    document.body.addEventListener('drop', (e) => {
        if (e.target !== $fileInput && e.target.closest('#text-viewer') === null && e.target.closest('#file-list') === null && e.target.closest('#full-screen-drop-area') === null) {
            e.preventDefault();
        }
    }, false);
}


// --- 재생 컨트롤 ---
async function startReadingFromCurrentChunk() {
    if (currentFileIndex === -1 || !filesData[currentFileIndex]) return;

    const file = filesData[currentFileIndex];

    if (!file.isProcessed) {
        processFile(currentFileIndex, true);
        return;
    }

    if (file.chunks.length === 0) {
        processFileChunks(currentFileIndex, true);
        return;
    }

    currentChunkIndex = Math.min(currentChunkIndex, file.chunks.length - 1);
    currentCharIndex = 0;
    isSpeaking = true;
    isPaused = false;
    $playPauseBtn.textContent = '⏸️';
    synth.cancel();
    await requestWakeLock();
    renderTextViewer(currentFileIndex);
    speakNextChunk();
}

function speakNextChunk() {
    const file = filesData[currentFileIndex];
    if (!isSpeaking || isPaused || !file || !file.chunks || file.chunks.length === 0) return;

    if (currentChunkIndex >= file.chunks.length) {
        if (isSequential) {
            changeFile(currentFileIndex + 1);
        } else {
            stopReading();
        }
        return;
    }

    let textToSpeak = file.chunks[currentChunkIndex].slice(currentCharIndex);
    
    if (!textToSpeak) {
        currentCharIndex = 0;
        currentChunkIndex++;
        speakNextChunk();
        return;
    }

    currentUtterance = new SpeechSynthesisUtterance(textToSpeak);
    currentUtterance.voice = synth.getVoices().find(v => v.name === $voiceSelect.value) || synth.getVoices()[0];
    currentUtterance.rate = parseFloat($rateSlider.value);
    currentUtterance.pitch = 1;

    currentUtterance.onend = () => {
        currentCharIndex = 0;
        currentChunkIndex++;
        saveBookmark();
        renderTextViewer(currentFileIndex);
        speakNextChunk();
    };

    currentUtterance.onboundary = (event) => {
        if (event.name === 'word') {
            currentCharIndex = event.charIndex;
        }
    };

    try {
        synth.speak(currentUtterance);
    } catch (error) {
        console.error('음성 합성 오류:', error);
        alert('음성 재생 중 오류가 발생했습니다. 브라우저 설정을 확인해 주세요.');
        stopReading();
    }
}

function togglePlayPause() {
    if (currentFileIndex === -1) {
        alert("재생할 파일을 선택해 주세요.");
        return;
    }

    if (isSpeaking && !isPaused) {
        if (isMobile) {
            // 모바일에서는 pause가 잘 안될 수 있어 cancel 후 재시작 로직을 사용합니다.
            synth.cancel(); 
        } else {
            synth.pause();
        }
        isPaused = true;
        $playPauseBtn.textContent = '▶️';
        releaseWakeLock();
    } else if (isSpeaking && isPaused) {
        if (isMobile) {
             // 모바일에서는 resume 대신 cancel 후 speakNextChunk를 호출합니다.
            isPaused = false;
            speakNextChunk();
        } else {
            synth.resume();
        }
        isPaused = false;
        $playPauseBtn.textContent = '⏸️';
        requestWakeLock();
    } else {
        // 재생 시작
        startReadingFromCurrentChunk();
    }
}

function stopReading() {
    synth.cancel();
    isSpeaking = false;
    isPaused = false;
    $playPauseBtn.textContent = '▶️';
    releaseWakeLock();
    // 현재 읽던 위치는 유지합니다. (북마크 저장)
    saveBookmark();
    renderTextViewer(currentFileIndex);
}

function changeFile(newIndex) {
    stopReading();
    
    if (newIndex < 0) {
        // 이전 파일이 없으면 첫 파일로 돌아갑니다.
        newIndex = 0;
    } else if (newIndex >= filesData.length) {
        // 다음 파일이 없으면 재생을 종료합니다.
        stopReading();
        currentFileIndex = filesData.length > 0 ? filesData.length - 1 : -1;
        renderTextViewer(currentFileIndex);
        return;
    }

    currentFileIndex = newIndex;
    currentChunkIndex = 0;
    currentCharIndex = 0;
    
    // 파일이 처리되지 않았으면 처리 후 재생 시작
    if (!filesData[currentFileIndex].isProcessed) {
        processFile(currentFileIndex, true);
    } else {
        startReadingFromCurrentChunk();
    }
    
    renderFileList();
    renderTextViewer(currentFileIndex);
}

// --- 파일 목록 관리 ---
function handleFileListItemClick(e) {
    const listItem = e.target.closest('li');
    if (!listItem) return;
    
    const fileId = parseInt(listItem.dataset.fileId);
    const fileIndex = filesData.findIndex(f => f.id === fileId);
    if (fileIndex === -1) return;

    if (e.target.classList.contains('delete-file-btn')) {
        e.stopPropagation();
        deleteFile(fileIndex);
        return;
    }

    if (e.target.classList.contains('drag-handle')) {
        return;
    }

    if (isSpeaking || isPaused) {
        stopReading();
    }

    currentFileIndex = fileIndex;
    currentChunkIndex = 0;
    currentCharIndex = 0;

    if (!filesData[currentFileIndex].isProcessed) {
        processFile(currentFileIndex, true);
    } else {
        startReadingFromCurrentChunk();
    }

    renderFileList();
    renderTextViewer(currentFileIndex);
}

function deleteFile(index) {
    const wasCurrentFile = index === currentFileIndex;
    filesData.splice(index, 1);

    if (wasCurrentFile) {
        stopReading();
        currentFileIndex = filesData.length > 0 ? 0 : -1;
        renderTextViewer(currentFileIndex);
    } else if (index < currentFileIndex) {
        currentFileIndex--;
    }

    renderFileList();
    saveBookmark();

    if (filesData.length === 0) {
        $textViewer.innerHTML = INITIAL_TEXT_VIEWER_CONTENT;
        currentFileIndex = -1;
    }
}

function clearAllFiles() {
    if (filesData.length === 0 || !confirm("전체 파일을 삭제하시겠습니까?")) return;
    
    stopReading();
    filesData = [];
    currentFileIndex = -1;
    localStorage.removeItem('autumnReaderBookmark'); // 북마크 전체 삭제
    renderFileList();
    $textViewer.innerHTML = INITIAL_TEXT_VIEWER_CONTENT;
}

function setupFileListSortable() {
    if (typeof Sortable === 'undefined') return;
    
    new Sortable($fileList, {
        handle: '.drag-handle',
        animation: 150,
        onEnd: function (evt) {
            const oldIndex = evt.oldIndex;
            const newIndex = evt.newIndex;
            
            const [movedItem] = filesData.splice(oldIndex, 1);
            filesData.splice(newIndex, 0, movedItem);

            if (currentFileIndex === oldIndex) {
                currentFileIndex = newIndex;
            } else if (oldIndex < currentFileIndex && newIndex >= currentFileIndex) {
                currentFileIndex--;
            } else if (oldIndex > currentFileIndex && newIndex <= currentFileIndex) {
                currentFileIndex++;
            }
            
            renderFileList();
            saveBookmark();
        },
    });
}


// --- UI 렌더링 ---
function renderTextViewer(fileIndex) {
    if (fileIndex === -1 || !filesData[fileIndex]) {
        $textViewer.innerHTML = INITIAL_TEXT_VIEWER_CONTENT;
        return;
    }

    const file = filesData[fileIndex];
    if (!file.isProcessed) {
        if (file.isImage) {
            $textViewer.innerHTML = `<p style="color:#FFD700;">이미지 파일 OCR 처리 중... 잠시만 기다려 주세요.</p>`;
        } else {
            $textViewer.innerHTML = `<p style="color:gray;">파일 내용 처리 중...</p>`;
        }
        return;
    }

    const start = Math.max(0, currentChunkIndex - VISIBLE_CHUNKS / 2);
    const end = Math.min(file.chunks.length, start + VISIBLE_CHUNKS);

    let html = '';
    for (let i = start; i < end; i++) {
        const chunk = file.chunks[i];
        let chunkClass = 'text-chunk';
        if (i === currentChunkIndex) {
            chunkClass += ' highlight';
        }
        
        let content = '';
        if (i === currentChunkIndex && currentCharIndex > 0) {
            // 현재 읽는 중인 청크의 텍스트에 하이라이트 추가
            const before = chunk.slice(0, currentCharIndex);
            const after = chunk.slice(currentCharIndex);
            // 읽은 부분은 흰색, 읽을 부분은 밝은 회색으로 구분
            content = `<span style="color:#e2e8f0;">${before}</span>${after}`;
        } else {
            content = chunk;
        }

        html += `<span class="${chunkClass}" data-index="${i}">${content}</span>`;
    }
    
    $textViewer.innerHTML = html;
    
    // 현재 읽는 청크로 자동 스크롤
    if (currentChunkIndex !== -1) {
        const highlightedChunk = $textViewer.querySelector(`.text-chunk[data-index="${currentChunkIndex}"]`);
        if (highlightedChunk) {
            highlightedChunk.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
}

function setupTextViewerClickEvent() {
    $textViewer.addEventListener('click', (e) => {
        if (filesData.length === 0) return;
        
        const chunkElement = e.target.closest('.text-chunk');
        if (!chunkElement || chunkElement.classList.contains('highlight')) return;

        const newChunkIndex = parseInt(chunkElement.dataset.index);
        if (isNaN(newChunkIndex)) return;

        jumpToChunk(newChunkIndex);
    });
}

function jumpToChunk(index) {
    if (currentFileIndex === -1 || index >= filesData[currentFileIndex].chunks.length) return;
    
    synth.cancel();
    currentChunkIndex = index;
    currentCharIndex = 0;
    isSpeaking = true;
    isPaused = false;
    $playPauseBtn.textContent = '⏸️';
    renderTextViewer(currentFileIndex);
    requestWakeLock();
    speakNextChunk();
}

function renderFileList() {
    $fileList.innerHTML = '';
    filesData.forEach((file, index) => {
        const li = document.createElement('li');
        li.dataset.fileId = file.id;

        const fileNameSpan = document.createElement('span');
        fileNameSpan.textContent = file.name;

        const controlsDiv = document.createElement('div');
        controlsDiv.classList.add('file-controls');

        const dragHandle = document.createElement('button');
        dragHandle.innerHTML = '☰';
        dragHandle.classList.add('drag-handle');
        dragHandle.title = '순서 변경';

        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = 'X';
        deleteBtn.classList.add('delete-file-btn');
        deleteBtn.title = '삭제';

        if (!file.isProcessed) {
            let statusText = ' (⏳ 대기)';
            if (file.isImage) {
                if (file.isOcrProcessing) {
                    statusText = ' (OCR 처리 중)';
                } else {
                    statusText = ' (🖼️ 이미지 대기)';
                }
            }
            const statusSpan = document.createElement('span');
            statusSpan.textContent = statusText;
            statusSpan.style.color = '#FFD700';
            fileNameSpan.appendChild(statusSpan);
        }

        controlsDiv.appendChild(dragHandle);
        controlsDiv.appendChild(deleteBtn);

        li.appendChild(fileNameSpan);
        li.appendChild(controlsDiv);

        li.classList.toggle('active', index === currentFileIndex);
        $fileList.appendChild(li);
    });
}

// --- 북마크 ---
function saveBookmark() {
    // filesData가 비어있으면 전체 북마크를 삭제합니다.
    if (filesData.length === 0) {
        localStorage.removeItem('autumnReaderBookmark');
        return;
    }

    // 파일 객체(fileObject)와 OCR 처리 중인 파일은 저장하지 않습니다.
    const savableFilesData = filesData.map(file => ({
        ...file,
        fileObject: null, // File 객체는 저장 불가
        isOcrProcessing: false // 상태 저장 방지
    }));

    const bookmark = {
        currentFileIndex: currentFileIndex,
        chunkIndex: currentChunkIndex,
        isSequential: isSequential,
        files: savableFilesData,
        settings: {
            voice: $voiceSelect.value,
            rate: $rateSlider.value,
        }
    };
    
    localStorage.setItem('autumnReaderBookmark', JSON.stringify(bookmark));
}

function loadBookmark() {
    const bookmarkString = localStorage.getItem('autumnReaderBookmark');
    if (!bookmarkString) return;

    try {
        const bookmark = JSON.parse(bookmarkString);
        
        // 1. 설정 로드
        if (bookmark.settings) {
            if ($voiceSelect.querySelector(`option[value="${bookmark.settings.voice}"]`)) {
                $voiceSelect.value = bookmark.settings.voice;
            }
            $rateSlider.value = bookmark.settings.rate || $rateSlider.defaultValue;
            updateRateDisplay();
        }

        // 2. 파일 목록 로드
        if (bookmark.files && bookmark.files.length > 0) {
            filesData = bookmark.files.map(file => ({ 
                ...file, 
                fileObject: null, 
                isOcrProcessing: false // 복원 시 OCR 상태 초기화 
            })); 
            
            // isSequential 설정 로드
            isSequential = bookmark.isSequential !== undefined ? bookmark.isSequential : true;
            $sequentialReadCheckbox.checked = isSequential;

            renderFileList();

            // 3. 이어듣기 프롬프트 및 재생 시작
            const fileToResume = filesData[bookmark.currentFileIndex];
            if (fileToResume && confirm(`지난번 읽던 파일: "${fileToResume.name}"의 ${bookmark.chunkIndex + 1}번째 부분부터 이어서 들으시겠습니까?`)) {
                currentFileIndex = bookmark.currentFileIndex;
                currentChunkIndex = bookmark.chunkIndex;
                currentCharIndex = 0;
                
                if (!fileToResume.isProcessed) { 
                    // 복원된 파일이 미처리 상태인 경우 (예: OCR이 필요한 이미지) 처리 시작
                    processFile(currentFileIndex, true);
                } else {
                    // 이미 청크까지 처리된 경우 바로 뷰어 렌더링 후 재생 시작
                    renderTextViewer(currentFileIndex);
                    startReadingFromCurrentChunk();
                }
                renderFileList();

            } else {
                // "아니오" 선택 시, 파일 목록은 유지하되, 현재 인덱스는 초기화
                currentFileIndex = 0;
                currentChunkIndex = 0;
                currentCharIndex = 0;
                if (filesData.length > 0) {
                    renderTextViewer(currentFileIndex);
                }
                
            }
        }
    } catch (e) {
        console.error('북마크 로드 중 오류 발생:', e);
        localStorage.removeItem('autumnReaderBookmark');
    }
}


// --- 광고 스크립트 수정 ---
function setupSponserLink() {
    // id가 \"right_panel\"인 요소 가져오기
    const rightPanel = document.getElementById('right_panel');

    // id가 \"right_button\"인 요소 가져오기
    const rightButton = document.getElementById('right_button');

    // 패널 가시성 토글 함수
    function togglePanel() {
        // rightPanel이 display:none 상태이면 display:block으로, 아니면 display:none으로 토글
        const isHidden = rightPanel.style.display === 'none' || rightPanel.style.display === '';
        rightPanel.style.display = isHidden ? 'block' : 'none';
        rightButton.innerHTML = isHidden ? '◀ 닫기' : '▶ ◀';
    }

    // 버튼에 클릭 이벤트 리스너 추가
    if (rightButton) {
        rightButton.addEventListener('click', togglePanel);
    }


// DOMContentLoaded 이벤트는 HTML 구조가 완전히 로드된 후 실행됩니다.
// document.addEventListener('DOMContentLoaded', function() { // ✅ 수정: 이 줄을 제거했습니다.
    // 1. 변경할 <a> 태그 요소를 가져옵니다. (ID가 'sponser-link'로 잘 추가되었는지 확인하세요!)
    const sponserLink = document.getElementById('sponser-Link');
        
    // 만약 요소를 찾지 못하면(sponserLink === null) 코드를 실행하지 않도록 예외 처리
    if (!sponserLink) {
        console.error("ID가 'sponserlink' 요소를 찾을 수 없습니다.");
        return;
    }

    // 2. 미디어 쿼리 조건 (최소 너비 451px)을 설정합니다.
    const mediaQuery = window.matchMedia('(min-width: 451px)');
    
    // 3. 변경할 새로운 href 값입니다.
    const newHref = 'https://buymeacoffee.com/goohwan';
    
    // 4. 기본 href 값 (451px 미만일 때)입니다.
    const defaultHref = 'https://qr.kakaopay.com/Ej7rBokl1';

    // 5. 화면 너비가 변경될 때 실행될 함수를 정의합니다.
    function handleWidthChange(e) {
        if (e.matches) {
            // 조건 충족: 451px 이상 (데스크톱)
            sponserLink.href = newHref;
        } else {
            // 조건 불충족: 451px 미만 (모바일)
            sponserLink.href = defaultHref;
        }
    }

    // 6. 초기 로드 시 한 번 실행
    handleWidthChange(mediaQuery);

    // 7. 미디어 쿼리 변경 이벤트 리스너 추가
    mediaQuery.addListener(handleWidthChange);
// }); // ✅ 수정: 이 줄을 제거했습니다.

    // 초기화 시 토글 버튼 이벤트 리스너도 추가
    if (rightButton && rightPanel) {
        const isHidden = rightPanel.style.display === 'none' || rightPanel.style.display === '';
        rightButton.innerHTML = isHidden ? '▶ ◀' : '◀ 닫기';
    }

}
setupSponserLink();