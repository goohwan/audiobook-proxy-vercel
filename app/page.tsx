'use client'; // 클라이언트 컴포넌트로 지정 (useState, useEffect 등 브라우저 API 사용 가능)
import Script from 'next/script'; // 외부 스크립트 로드를 위한 Next.js 컴포넌트

// 필요한 CSS 파일 임포트 (Next.js는 CSS를 모듈 방식으로 처리하는 것이 일반적이지만, 
// 여기서는 style.css가 전역 CSS 파일이라고 가정하고 app/globals.css에 내용을 통합하거나 별도로 처리해야 함)
// import './style.css'; 

export default function Home() {
    return (
        <>
            {/* 기존 index.html의 <head> 태그 내부 스크립트들을 Next.js의 Script 컴포넌트를 사용하여 처리
              Next.js에서는 <head> 태그를 사용하는 대신 layout.tsx의 <head> 또는 next/head를 사용하며, 
              외부 스크립트는 next/script를 사용합니다.
            */}
            
            {/* nosleep.js 로드 */}
            <Script 
                src="https://cdn.jsdelivr.net/npm/nosleep.js@1/dist/NoSleep.min.js" 
                strategy="beforeInteractive" // 페이지 상호작용 전에 로드
            />
            
            {/* sortablejs 로드 */}
            <Script 
                src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.0/Sortable.min.js" 
                strategy="beforeInteractive"
            />
            
            {/* Google Adsense 로드 */}
            <Script 
                async 
                src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3474389046240414" 
                crossOrigin="anonymous" 
                strategy="afterInteractive" // 페이지 로드 후 로드
            />
            
            {/* tesseract.js 로드 */}
            <Script 
                src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js" 
                strategy="afterInteractive"
            />

            {/* 주의: 기존 <script> (function(){...}) 리디렉션 로직은 Next.js에서는 보통 Middleware나
              next.config.js 설정으로 처리하는 것이 일반적이지만, 현재는 클라이언트에서만 동작하는 JS 코드로 둡니다.
              그러나 Next.js 환경에서는 'audiobook.goohwan.net'가 아닌 Vercel 도메인으로 배포되므로
              이 로직은 작동하지 않을 수 있으며, 추후 도메인 설정 후 조정이 필요합니다.
            */}

            <div id="full-screen-drop-area">파일을 여기에 드롭하세요</div>

            <header>
                <h1>책 읽어주는 가을이</h1>
            </header>
            <div className="container">
                <div id="left_panel">
                    <div className="file-list-section">
                        <h2>List</h2>
                        <input type="file" id="file-input" accept="text/plain,image/*" multiple style={{ display: 'none' }} />
                        <ul id="file-list"></ul>
                    </div>

                    <div className="control-section">
                        <div id="controler_wrap">
                            <div id="voice-control-wrap">
                                <label htmlFor="voice-select">목소리 선택:</label>
                                <select id="voice-select"></select>
                            </div>

                            <div id="rate-control-wrap">
                                <label htmlFor="rate-slider">재생 속도 :</label>
                                <span id="rate-display">1.2</span>
                                <input type="range" id="rate-slider" min="0.5" max="2" step="0.1" defaultValue="1.2" />
                            </div>

                            <div className="playback-controls">
                                <button id="play-pause-btn">▶️</button>
                                <button id="stop-btn">⏹️</button>
                                <button id="prev-file-btn">⏮️</button>
                                <button id="next-file-btn">⏭️</button>
                                <button>
                                    <label>
                                        <input type="checkbox" id="sequential-read-checkbox" defaultChecked />
                                        <br />정주행
                                    </label>
                                </button>
                                <button id="clear-all-files-btn">
                                    전체
                                    <br />삭제
                                </button>
                            </div>
                        </div>
                        <div id="sponser">
                            <a href="" id="sponser-Link">
                                <img src="https://tistory1.daumcdn.net/tistory/2714570/skin/images/mywalletqr.png" title="카메라 앱으로 QR코드를 비춰보세요" alt="제작자 후원 QR 코드" />
                                <span>제작자 후원(커피한잔 사주세요~*)</span>
                            </a>
                        </div>
                    </div>
                    <div id="url_iframe_panel_mobile" className="url-iframe-panel mobile-only">
                        <h3>Browsing</h3>
                        <div className="url-input-container">
                            <input type="text" id="url-input-mobile" placeholder="URL을 입력하세요 ex.booktoki469.com" />
                            <button id="load-url-btn-mobile">Load</button>
                        </div>
                        <iframe id="content-frame-mobile" name="content-frame-mobile" src="about:blank" title="로드된 웹페이지"></iframe>
                    </div>

                    <div className="text-viewer-section">
                        <h2>텍스트 뷰어</h2>
                        <div className="mobile-only mobile-buttons">
                            <button id="mobile-file-upload-btn">파일첨부</button>
                            <button id="mobile-load-voice-btn">음성로드</button>
                        </div>
                        <div id="text-viewer" contentEditable="true">
                            <p>
                                텍스트, 이미지 파일을 드래그하여 첨부하거나 텍스트/URL을 붙여넣어 오디오북으로 변환하세요! 모바일에선 파일첨부, 음성로드 버튼을 활용해주세요
                            </p>
                        </div>
                    </div>
                </div>
                <div id="right_button">▶ ◀</div>
                <div id="right_panel" className="url-iframe-panel desktop-only">
                    <h3>Browsing</h3>
                    <div className="url-input-container">
                        <input type="text" id="url-input-desktop" placeholder="URL을 입력하세요 ex. https://booktoki469.com" />
                        <button id="load-url-btn-desktop">Load</button>
                    </div>
                    <iframe id="content-frame-desktop" name="content-frame-desktop" src="about:blank" title="로드된 웹페이지"></iframe>
                </div>
            </div>

            {/* 메인 로직 스크립트 로드: public 폴더의 script.js를 로드 */}
            <Script src="/script.js" strategy="lazyOnload" />
        </>
    );
}