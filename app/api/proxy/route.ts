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
    // 2. 외부 URL로 요청을 보냄 (Vercel 서버에서 실행되므로 CORS에 걸리지 않음)
    const response = await fetch(targetUrl);

    if (!response.ok) {
      // 외부 요청이 실패하면 에러 응답
      return new Response(JSON.stringify({ error: `Failed to fetch target URL: ${response.status}` }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. 외부 응답의 텍스트 콘텐츠(HTML)를 가져옴
    const data = await response.text();

    // 4. 클라이언트에게 HTML 콘텐츠를 반환
    return new Response(data, {
      status: 200,
      headers: { 
        // 중요: 클라이언트 측 CORS 문제를 해결하기 위해 Access-Control-Allow-Origin 헤더를 추가합니다.
        // 현재는 모든 출처를 허용(*)하도록 설정합니다.
        'Access-Control-Allow-Origin': '*', 
        'Content-Type': 'text/html; charset=utf-8', // 반환되는 콘텐츠가 HTML임을 명시
      },
    });

  } catch (error) {
    console.error('Proxy Error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}