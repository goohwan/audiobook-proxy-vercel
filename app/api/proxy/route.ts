// app/api/proxy/route.ts

// Next.js에서 API Route의 GET 요청을 처리하는 함수입니다.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('targetUrl');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'targetUrl parameter is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // 2. 외부 URL로 요청을 보냄 (Cloudflare 우회를 위해 모든 브라우저 헤더 추가)
    const response = await fetch(targetUrl, {
        headers: {
            // 🚨 수정: 브라우저처럼 보이게 User-Agent 및 기타 헤더를 추가합니다.
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
            'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
            'Cache-Control': 'max-age=0',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        }
    });

    if (!response.ok) {
      // Cloudflare 차단 시 403 등 상태 코드가 반환됩니다.
      return new Response(JSON.stringify({ 
          error: `Failed to fetch target URL: ${response.status} (Cloudflare block suspected)`,
          status: response.status,
          statusText: response.statusText
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. 외부 응답의 텍스트 콘텐츠(HTML)를 가져옴
    const data = await response.text();
    
    // 4. 클라이언트에게 HTML 콘텐츠를 반환
    const headers = new Headers();
    headers.set('Content-Type', response.headers.get('Content-Type') || 'text/html; charset=utf-8'); 
    headers.set('Access-Control-Allow-Origin', '*'); 

    return new Response(data, {
      status: 200,
      headers: headers,
    });

  } catch (error) {
    console.error('Proxy Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}