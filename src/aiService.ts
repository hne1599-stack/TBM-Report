export async function generateSafetyAdvice(
  address: string,
  taskDate: string,
  taskNames: string[],
  workerOpinion: string,
  controlMeasures: string[]
): Promise<{
  weatherAdvice: string;
  accidentCase: string;
  recentTrend: string;
  safetyRules: string[];
  checklist: string[];
}> {
  try {
    const SYSTEM_PROMPT = `
[시스템 지시사항: AI 스마트 안전 분석 보고서 작성 가이드]
당신은 건설 및 산업 현장의 안전 리스크를 분석하는 '전문 안전 분석관'입니다.
제공된 데이터를 분석하여, 사용자가 한눈에 읽기 편한 '보고서 형식'으로 각 항목을 작성하여 JSON으로 출력하세요.

<엄격한 출력 규칙>
1. 마크다운 기호 금지: 별표(**)나 샵(#) 같은 기호를 절대 쓰지 마세요.
2. 줄바꿈 규칙:
   - 각 줄은 반드시 \\n 으로 구분하세요.
   - 빈 줄(\\n\\n)은 절대 사용하지 마세요.
3. 형식:
   - 하위 항목은 "-" 로 시작
   - 세부 내용은 "·" 사용
   - 들여쓰기는 공백 2칸 사용
4. 절대 금지:
   - 문장을 한 줄로 길게 이어쓰기
   - 리스트 구조 없이 텍스트 나열

<출력 형식 (반드시 JSON)>
{
  "weatherAdvice": "...",
  "accidentCase": "...",
  "recentTrend": "...",
  "safetyRules": ["...", "..."],
  "checklist": ["...", "..."]
}
`;

    const USER_PROMPT = `
[입력 정보]
- 현장 주소: ${address}
- 작업 일자: ${taskDate}
- 세부 작업: ${taskNames.join(', ')}
- 근로자 의견: ${workerOpinion || '없음'}
- 위험성평가 관리대책:
${controlMeasures.length > 0 
  ? controlMeasures.map(v => `- ${v}`).join('\n') 
  : '- 없음'}
`;

    const finalPrompt = `${SYSTEM_PROMPT}\n${USER_PROMPT}`;

    const apiUrl = import.meta.env.VITE_APP_URL 
      ? `${import.meta.env.VITE_APP_URL}/api/gemini`
      : '/api/gemini';

    const requestRes = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: finalPrompt })
    });

    if (!requestRes.ok) {
      const errorData = await requestRes.json();
      throw new Error(errorData.error || 'API 요청 실패');
    }

    const response = await requestRes.json();
    if (response.error) {
      throw new Error(response.error);
    }

    const text = response.text || '{}';

    // 🔥 markdown 제거
    let cleanText = text.replace(/```json\n?|\n?```/g, '').trim();

    // 🔥 JSON 영역만 추출
    const startIndex = cleanText.indexOf('{');
    const endIndex = cleanText.lastIndexOf('}');
    if (startIndex !== -1 && endIndex !== -1) {
      cleanText = cleanText.substring(startIndex, endIndex + 1);
    }

    const parsed = JSON.parse(cleanText);

    // 🔥 줄바꿈 강제 보정 (핵심)
    const normalize = (str: string) => {
      if (!str) return '';

      return str
        .replace(/\\n/g, '\n')           // 이스케이프 복원
        .replace(/\n{2,}/g, '\n')       // 빈줄 제거
        .replace(/([^-·\n])\s*-\s/g, '\n- ') // 리스트 강제 줄바꿈
        .replace(/([^-·\n])\s*·\s/g, '\n  · ') // 서브 항목 줄바꿈
        .trim();
    };

    return {
      weatherAdvice: normalize(parsed.weatherAdvice),
      accidentCase: normalize(parsed.accidentCase),
      recentTrend: normalize(parsed.recentTrend),
      safetyRules: parsed.safetyRules || [],
      checklist: parsed.checklist || []
    };

  } catch (error: any) {
    console.error('AI Advice Generation Error:', error);

    return {
      weatherAdvice: `날씨 정보를 불러오는 중 오류가 발생했습니다. (${error.message || '오류'})`,
      accidentCase: "사고 사례 정보를 불러올 수 없습니다.",
      recentTrend: "최근 동향 정보를 불러올 수 없습니다.",
      safetyRules: [
        "작업 전 주변 환경 및 장비 점검",
        "개인 보호구 착용 확인",
        "이상 발견 시 즉시 작업 중지"
      ],
      checklist: [
        "보호구 착용 여부 확인",
        "장비 상태 점검",
        "위험 요소 제거 확인"
      ]
    };
  }
}