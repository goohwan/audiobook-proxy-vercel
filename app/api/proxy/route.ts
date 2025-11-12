// app/api/proxy/route.ts

// Next.js에서 API Route의 GET 요청을 처리하는 함수입니다.
export async function GET(request: Request) {
  // 1. 요청 URL에서 'targetUrl' 쿼리 파라미터 추출
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('targetUrl');

  if (!targetUrl) {
    // targetUrl이 없으면 400 Bad Request 응답
    return new Response(JSON.stringify({ error: 'targetUrl parameter is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // 2. 외부 URL로 요청을 보냄 (Cloudflare 우회를 위해 User-Agent 추가)
    const response = await fetch(targetUrl, {
        headers: {
            // 🚨 수정: 브라우저처럼 보이게 User-Agent 헤더를 추가합니다.
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        }
    });

    if (!response.ok) {
      // 외부 요청이 실패하면 에러 응답
      // Cloudflare 차단 시 403이 올 수 있으므로, 상태 코드를 포함하여 클라이언트에 JSON 반환
      return new Response(JSON.stringify({ 
          error: `Failed to fetch target URL: ${response.status}`,
          status: response.status,
          statusText: response.statusText
      }), {
        // 🚨 수정: 원본 응답의 상태 코드를 그대로 반환
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. 외부 응답의 텍스트 콘텐츠(HTML)를 가져옴
    const data = await response.text();
    
    // 4. 클라이언트에게 HTML 콘텐츠를 반환
    const headers = new Headers();
    // 원본 응답의 Content-Type 사용, 없으면 기본값 설정
    headers.set('Content-Type', response.headers.get('Content-Type') || 'text/html; charset=utf-8'); 
    // 클라이언트 측 CORS 문제를 해결하기 위해 Access-Control-Allow-Origin 헤더를 추가
    headers.set('Access-Control-Allow-Origin', '*'); 

    return new Response(data, {
      status: 200,
      headers: headers,
    });

  } catch (error) {
    console.error('Proxy Error:', error);
    // 내부 서버 오류는 500으로 응답
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}