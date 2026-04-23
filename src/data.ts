import Papa from 'papaparse';

export interface SiteInfo {
  siteId: string;
  siteName: string;
  address: string;
}

export interface RiskFactor {
  id: string;
  subTask: string;
  riskFactor: string;
  frequency: number;
  severity: number;
  riskLevel: string;
  controlMeasure: string;
}

// Function to fetch and parse Google Sheet (must be set to "Anyone with the link can view")
export async function syncGoogleSheetData(sheetUrlOrId: string, sitesSheetName: string = '사업장 현황', risksSheetName: string = '위험성평가'): Promise<{ sites: SiteInfo[], risksDB: Record<string, Record<string, RiskFactor[]>> }> {
  // Extract ID from URL if full URL is pasted
  let spreadsheetId = sheetUrlOrId;
  
  if (sheetUrlOrId.includes('script.google.com/macros')) {
    throw new Error('Apps Script 웹 앱 URL이 입력되었습니다. VITE_GOOGLE_SHEET_URL에는 데이터 시트의 주소를, VITE_HISTORY_WEBHOOK_URL에 웹 앱 URL을 입력해주세요.');
  }
  
  if (sheetUrlOrId.includes('/d/')) {
    spreadsheetId = sheetUrlOrId.split('/d/')[1].split('/')[0];
  }

  if (!spreadsheetId || spreadsheetId.length < 10 || spreadsheetId.includes('http')) {
    throw new Error(`유효한 구글 시트 URL이나 ID가 아닙니다. 입력값: ${sheetUrlOrId.substring(0, 30)}...`);
  }

  const fetchCSV = (sheetName: string) => {
    return new Promise<any[]>((resolve, reject) => {
      const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
      Papa.parse(url, {
        download: true,
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          // Check if Google returned an HTML page (e.g. Sign-in page) instead of CSV
          if (results.data && results.data.length > 0) {
            const firstKey = Object.keys(results.data[0])[0] || '';
            if (firstKey.toLowerCase().includes('<!doctype html>') || firstKey.toLowerCase().includes('<html')) {
              reject(new Error(`시트 '${sheetName}'에 접근할 수 없습니다. 시트의 공유 권한이 '링크가 있는 모든 사용자 표'로 설정되어 있는지 확인해주세요.`));
              return;
            }
          }
          resolve(results.data);
        },
        error: (error: any) => reject(new Error(`시트 '${sheetName}' 동기화 실패. (네트워크 오류이거나 존재하지 않는 시트입니다) ${error.message || ''}`))
      });
    });
  };

  try {
    const sitesData = await fetchCSV(sitesSheetName);
    const risksData = await fetchCSV(risksSheetName);

    const normalizeRow = (row: any) => {
      const normalized: any = {};
      for (const key in row) {
        normalized[key.trim().replace(/\\s+/g, '')] = row[key];
      }
      return normalized;
    };

    const rawParsedSites: SiteInfo[] = sitesData.map((rawRow: any) => {
      const row = normalizeRow(rawRow);
      // Fallback: If there's no dedicated site info, try to use risk sheet info if fetched by mistake
      const siteId = row['siteId'] || row['사업장ID'] || row['사업장코드'] || row['현장ID'] || '';
      return {
        siteId,
        siteName: row['siteName'] || row['사업장명'] || row['현장명'] || siteId,
        address: row['address'] || row['주소'] || row['사업장주소'] || row['현장주소'] || ''
      };
    }).filter(s => s.siteId);

    // Deduplicate sites
    const parsedSites: SiteInfo[] = [];
    const siteIds = new Set();
    rawParsedSites.forEach(site => {
      if (!siteIds.has(site.siteId)) {
        siteIds.add(site.siteId);
        parsedSites.push(site);
      }
    });

    if (parsedSites.length === 0) {
       const keys = sitesData.length > 0 ? Object.keys(sitesData[0]).join(', ') : 'no data';
       throw new Error(`사업장 데이터가 비어있습니다. 현재 시트의 컬럼명: [${keys}]. 컬럼명(사업장ID, 사업장명, 주소)을 확인해주세요.`);
    }

    const parsedRisksDB: Record<string, Record<string, RiskFactor[]>> = {};

    const extract = (row: any, keywords: string[], defaultValue: string = '') => {
      // 1. Exact match
      for (const kw of keywords) {
         if (row[kw] !== undefined && row[kw] !== '') return row[kw];
      }
      // 2. Partial match
      const keys = Object.keys(row);
      for (const kw of keywords) {
         const match = keys.find(k => k.includes(kw));
         if (match && row[match] !== undefined && row[match] !== '') return row[match];
      }
      return defaultValue;
    };

    risksData.forEach((rawRow: any, index: number) => {
      const row = normalizeRow(rawRow);
      
      const siteId = extract(row, ['siteId', '사업장ID', '사업장코드', '현장ID']);
      const taskName = extract(row, ['taskName', '작업명', '공정명']);
      const subTask = extract(row, ['subTask', '세부작업']);
      const riskFactor = extract(row, ['riskFactor', '위험요인']);
      
      const freqStr = extract(row, ['frequency', '빈도(L)', '빈도', 'L'], '1');
      const sevStr = extract(row, ['severity', '강도(S)', '강도', 'S'], '1');
      
      const frequency = parseInt(freqStr, 10);
      const severity = parseInt(sevStr, 10);
      
      const defaultRiskLevel = isNaN(frequency) || isNaN(severity) ? '1' : `${frequency * severity}`;
      const riskLevel = extract(row, ['riskLevel', '위험도(R)', '위험도', '위험성(R)', '위험성', 'R'], defaultRiskLevel);
      const controlMeasure = extract(row, ['controlMeasure', '관리대책', '대책', '안전대책']);

      if (!siteId || !taskName) return;

      if (!parsedRisksDB[siteId]) parsedRisksDB[siteId] = {};
      if (!parsedRisksDB[siteId][taskName]) parsedRisksDB[siteId][taskName] = [];

      parsedRisksDB[siteId][taskName].push({
        id: `r_${index}`,
        subTask,
        riskFactor,
        frequency: isNaN(frequency) ? 1 : frequency,
        severity: isNaN(severity) ? 1 : severity,
        riskLevel,
        controlMeasure
      });
    });

    if (Object.keys(parsedRisksDB).length === 0) {
       const riskKeys = risksData.length > 0 ? Object.keys(risksData[0]).join(', ') : 'no data';
       throw new Error(`위험성평가 데이터가 비어있습니다. 현재 시트의 컬럼명: [${riskKeys}]. 컬럼명(사업장ID, 작업명, 세부작업, 위험요인, 관리대책 등)을 확인해주세요.`);
    }

    return { sites: parsedSites, risksDB: parsedRisksDB };

  } catch (error) {
    console.error(error);
    throw error;
  }
}

export const mockSites: SiteInfo[] = [
  { siteId: '토양-양주군부대', siteName: '양주군부대 토양정화', address: '경기도 양주시' },
  { siteId: '토양-충주반입장', siteName: '충주반입장 토양정화', address: '충청북도 충주시' }
];

export const mockRisksDB: Record<string, Record<string, RiskFactor[]>> = {
  '토양-양주군부대': {
    '사무실 운영': [
      { id: 'r1', subTask: '냉난방기 및 전자기기 사용', riskFactor: '누전으로 인한 화재 발생', frequency: 2, severity: 2, riskLevel: '4 (중)', controlMeasure: '누전차단기 설치' }
    ],
    '중장비 작업': [
      { id: 'r2', subTask: '굴삭기 작업(토공사)', riskFactor: '주변 장비 및 작업자 충돌', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '장비 사용 시 작업구역 설정' },
      { id: 'r3', subTask: '굴삭기 작업(토공사)', riskFactor: '장비운전자 불안전한 행동에 의한사고', frequency: 2, severity: 3, riskLevel: '6 (상)', controlMeasure: '부지 내 과속 금지 및 전방주시 태만 금지' },
      { id: 'r4', subTask: '덤프트럭 작업(토공사)', riskFactor: '이동 간 과속 및 운전상태 불량으로 충돌', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '운전자 자격 확인 및 신체상태 확인' },
      { id: 'r5', subTask: '덤프트럭 작업(토공사)', riskFactor: '토공단부 하차 작업 중 후반 단부로 추락', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '단부 작업 시 이격거리 안전교육 철저' },
      { id: 'r6', subTask: '덤프트럭 작업(토공사)', riskFactor: '하역하는 토사로 인한 하부 작업자 사고', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '덤프트럭 덤핑 작업장 하부 접근금지 조치' }
    ],
    '구조물 철거': [
      { id: 'r7', subTask: '인력 철거', riskFactor: '구조물 낙하로 인한 작업자 부상', frequency: 2, severity: 2, riskLevel: '4 (중)', controlMeasure: '작업구역 하부 작업구역 설정 및 출입 통제' },
      { id: 'r8', subTask: '인력 철거', riskFactor: '산소절단기 사용 시 화재/폭발', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '화재감시자 배치 및 소화설비 비치' },
      { id: 'r9', subTask: '인력 철거', riskFactor: '가설 전선 피복 손상으로 인한 감전', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '사용 전 전선 피복 점검 및 누전차단기 사용' },
      { id: 'r10', subTask: '중장비 철거', riskFactor: '중장비와 근로자 충돌', frequency: 2, severity: 3, riskLevel: '6 (상)', controlMeasure: '중장비 작업반경 내 접근 금지' }
    ]
  },
  '토양-충주반입장': {
    '사무실 운영/관리': [
      { id: 'r11', subTask: '개인 전열기 및 냉온풍기 사용', riskFactor: '화재 사고 발생', frequency: 2, severity: 2, riskLevel: '4 (중)', controlMeasure: '퇴근 전 전열기 및 냉온풍기 OFF 확인' },
      { id: 'r12', subTask: '공용 기기 조작 및 비품 관리', riskFactor: '중량물 운반/정리 중 근골격계질환', frequency: 2, severity: 1, riskLevel: '2 (하)', controlMeasure: '중량물 취급 시 2인 1조' }
    ],
    '소방시설 운영/관리': [
      { id: 'r13', subTask: '감지기 및 발신기의 주기적인 작동 테스트', riskFactor: '감전 사고 발생', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '절연 장갑 등 절연용 보호구 착용 점검 전 수신기 및 배전반 전원 확인' }
    ],
    '세륜기 운영': [
      { id: 'r14', subTask: '덤프트럭 등 대형 차량 유도 및 세륜', riskFactor: '덤프트럭 충돌 및 협착 위험', frequency: 2, severity: 3, riskLevel: '6 (상)', controlMeasure: '전담 신호수 배치 및 형광 반사조끼 착용' }
    ],
    '세륜기 유지보수': [
      { id: 'r15', subTask: '침전물(슬러지) 제거 및 청소', riskFactor: '청소 중 미끄러 넘어짐 발생', frequency: 2, severity: 2, riskLevel: '4 (중)', controlMeasure: '작업 전후 이동 통로의 슬러지 및 물기 즉시 제거' },
      { id: 'r16', subTask: '설비(수중 펌프, 배전반, 구동 체인 등) 점검', riskFactor: '감전 사고 발생', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '전검 전 전원 차단 및 추전차단기 정상 작동 여부 확인' }
    ],
    '계근대 운영': [
      { id: 'r17', subTask: '덤프트럭 등 대형 차량 유도 및 중량 계측', riskFactor: '차량 진출입 시 작업자 충돌', frequency: 2, severity: 3, riskLevel: '6 (상)', controlMeasure: '전담 신호수 배치 및 형광 반사조끼 착용, 타근로자 주변 출입 통제' }
    ],
    '계근대 유지보수': [
      { id: 'r18', subTask: '계근대 상판 및 틈새 이물질 제거 및 주변 노면 점검', riskFactor: '토양 분진에 의한 건강 장해', frequency: 3, severity: 1, riskLevel: '3 (중)', controlMeasure: 'KSC 인증 방진마스크 착용 철저' }
    ],
    '비점오염저감시설 관리': [
      { id: 'r19', subTask: '외관 점검 및 판넬 작동 상태 확인', riskFactor: '근골격계 질환 및 감전 사고 발생', frequency: 1, severity: 2, riskLevel: '2 (하)', controlMeasure: '무거운 맨홀 개방시 전용 도구 사용 전기 판넬 점검 시 절연 보호구 착용' },
      { id: 'r20', subTask: '협잡물 및 퇴적물 제거 / 준설', riskFactor: '밀폐공간 작업 시 질식 및 중독 위험', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '진입 전 산소 및 유해가스 농도 측정' }
    ],
    '토양 하차 및 이동': [
      { id: 'r21', subTask: '덤프트럭 오염토 하차 및 휠로더 토사 이동 작업', riskFactor: '차량 후진 시 사각지대로 인한 작업자 부딪힘', frequency: 2, severity: 3, riskLevel: '6 (상)', controlMeasure: '전담 신호수 배치 및 후방 카메라 작동 확인' },
      { id: 'r22', subTask: '덤프트럭 오염토 하차 및 휠로더 토사 이동 작업, 정화토 반출', riskFactor: '차량 후진 시 사각지대로 인한 작업자 부딪힘', frequency: 2, severity: 3, riskLevel: '6 (상)', controlMeasure: '전담 신호수 배치 및 후방 카메라 작동 확인' }
    ],
    '오염토 투입': [
      { id: 'r23', subTask: '굴삭기로 오염토 호퍼 투입', riskFactor: '작업자 투입구 주변 이동 시 낙하물 충돌', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '굴삭기 작업 반경 내 보행자 접급 근지' }
    ],
    '오염토 선별': [
      { id: 'r24', subTask: '전석 및 폐기물(폐콘크리트 등) 선별을 위한 건식 진동선별기 및 진동피더 가동', riskFactor: '설비의 진동 및 마찰음으로 인한 청력 손실', frequency: 3, severity: 1, riskLevel: '3 (중)', controlMeasure: '청력보호구 지급 및 착용' },
      { id: 'r25', subTask: '건식진동선별기 및 진동피더에 걸린 이물질(돌 등) 제거', riskFactor: '무거운 돌이나 이물질 무리하게 인력으로 제거 중 근골격계 질환 발생', frequency: 2, severity: 2, riskLevel: '4 (중)', controlMeasure: '중량물 취급 시 2인 1조 작업 실시' }
    ],
    '오염토 이송': [
      { id: 'r26', subTask: '선별된 토양을 컨베이어로 다음 공정에 이송', riskFactor: '구동 모터나 롤러 주변 청소 중 협착 (끼임)', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '점검/청소 전 반드시 전원 차단' },
      { id: 'r27', subTask: '작업 중인 컨베이어 벨트 쏠림 현상 등 확인/점검', riskFactor: '컨베이어 벨트 위에서 굴러떨어지는 돌이나 토사 작업자 맞음', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '컨베이어 가동 시 컨베이어 하부/측면 이동 통제' }
    ],
    '전석/폐기물 파쇄': [
      { id: 'r28', subTask: '죠크라샤 가동', riskFactor: '파쇄 소음으로 인한 청력 손실', frequency: 2, severity: 1, riskLevel: '2 (하)', controlMeasure: '청력보호구 지급 및 착용' },
      { id: 'r29', subTask: '죠크라샤 가동', riskFactor: '파쇄 작업 중 전석/폐기물 비산으로 작업자 맞음', frequency: 2, severity: 2, riskLevel: '4 (중)', controlMeasure: '죠크라샤 가동 중 근처 출입 통제' }
    ],
    '투입구 주변 청소': [
      { id: 'r30', subTask: '호퍼 및 컨베이어 주변 토사 청소', riskFactor: '오염토양 분진 흡입으로 인한 호흡기 질환', frequency: 2, severity: 2, riskLevel: '4 (중)', controlMeasure: '방진마스크 지급 및 착용' }
    ],
    '습식드럼파쇄기 가동': [
      { id: 'r31', subTask: '습식드럼파쇄기 가동하여 토양 세척 및 분리', riskFactor: '회전하는 드럼 외부 신체 협착(끼임)', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '드럼 회전부 주변 접근금지 방호 펜스 설치' }
    ],
    '습식드럼파쇄기 유지보수': [
      { id: 'r32', subTask: '습식드럼파쇄기 내부 점검', riskFactor: '드럼 상단에 붙어있 돌이나 이물질 작업자 머리 위로 떨어져 맞음', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '내부 진입 전 상부 고착물 사전 확인' }
    ],
    '하이드로싸이클론 가동': [
      { id: 'r33', subTask: '원심력을 이용하여 입도 분리/이동', riskFactor: '이송되는 배관 연결부 파손으로 인해 작업자 맞음', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '정기적인 배관 두께 및 연결부 마모 상태 점검' }
    ],
    '하이드로싸이클론 유지 보수': [
      { id: 'r34', subTask: '점검 및 교체', riskFactor: '고소작업으로 인한 작업자 추락', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '고소작업 시 하네스 착용 및 생명줄 체결' }
    ],
    '선별기 가동': [
      { id: 'r35', subTask: '선별기를 통한 세척자갈, 세척모래, 미세토 분리', riskFactor: '배출 소음으로 인한 작업자 청력 손실', frequency: 3, severity: 1, riskLevel: '3 (중)', controlMeasure: '소음 발생 작업장 내 근로자 순환 배치, 청력 보호구 착용' },
      { id: 'r36', subTask: '배출 컨베이어를 통한 토사 이동', riskFactor: '작업 중 협착(끼암)', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '컨베이어 회전부 방호덮개 설치 및 유지' }
    ],
    '선별기 유지보수': [
      { id: 'r37', subTask: '선별기 우레탄 스크린망 청소 및 교체', riskFactor: '이물질 제거 중 협착(끼임)', frequency: 1, severity: 2, riskLevel: '2 (하)', controlMeasure: '청소 및 교체 작업 전 반드시 전원 차단' },
      { id: 'r38', subTask: '선별기 우레탄 스크린망 청소 및 교체', riskFactor: '스크린 상단에서 작업 중 추락', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '상단 작업 발판의 고정 상태 및 틈새 점검' }
    ],
    '침전조 운영': [
      { id: 'r39', subTask: '회전하는 스키머 정상가동 확인/점검', riskFactor: '점검 중 안전난간 하부로 추락', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '안전난간대 흔들림 및 탈락 여부 수시 점검' }
    ],
    '필터프레스 가동': [
      { id: 'r40', subTask: '압력을 통한 슬러지 탈수', riskFactor: '탈리 시 작업자 신체 협착(끼임)', frequency: 3, severity: 2, riskLevel: '6 (상)', controlMeasure: '필터프레스 주변 접근금지 및 협착주의 표지판 설치' },
      { id: 'r41', subTask: '탈수케이크 하부로 배출', riskFactor: '작업자 배출되는 탈수케이크 맞음', frequency: 3, severity: 1, riskLevel: '3 (중)', controlMeasure: '케이크 배출구 하부 출입 통제 및 하부 작업 최소화' }
    ],
    '필터프레스 유지보수': [
      { id: 'r42', subTask: '여과판 청소', riskFactor: '세척 중 수압으로 인한 물이나 슬러지 파편 맞음', frequency: 1, severity: 2, riskLevel: '2 (하)', controlMeasure: '보안경 또는 안면보호구 착용' },
      { id: 'r43', subTask: '여과판 파손 여부 점검 및 교체', riskFactor: '여과판 교체 작업 시 협착 및 근골격계 질환 발생', frequency: 1, severity: 2, riskLevel: '2 (하)', controlMeasure: '무거운 여과판 이동 시 호이스트 등 사용, 중량물 취급 시 2인 1조 작업' }
    ],
    '탈수케이크 반출': [
      { id: 'r44', subTask: '휠로더를 이용해 탈수케이크 상차 및 반출', riskFactor: '상차 시 슬러지 낙하, 주변 작업자와 충돌', frequency: 2, severity: 2, riskLevel: '4 (중)', controlMeasure: '휠로더 상차 시 신호수 배치' }
    ],
    '공기압축기 가동': [
      { id: 'r45', subTask: '컴프레샤 장비 운영', riskFactor: '컴프레샤 가동 시 발생하는 강한 소음으로 인한 청력 손실', frequency: 3, severity: 1, riskLevel: '3 (중)', controlMeasure: '소음 발생 작업장 내 근로자 순환 배치, 청력 보호구 착용' }
    ],
    '약품(응집제) 반입': [
      { id: 'r46', subTask: '응집제 IBC 탱크 지게차를 사용하여 하차', riskFactor: '하차 시 지게차 전도', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '전담 신호수 배치, 하역 구간 평탄도 확보' }
    ],
    '호이스트 운영': [
      { id: 'r47', subTask: '반입된 응집제 IBC 탱크 이동 설치', riskFactor: '과중량으로 인한 중량물 낙하', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '호이스트 와이어로프 및 슬링벨트 손상 여부 사전 확인' }
    ],
    '약품(응집제) 투입': [
      { id: 'r48', subTask: '응집제 투입펌프를 통해 투입', riskFactor: '중량물 이송 중 근골격계 질환', frequency: 1, severity: 2, riskLevel: '2 (하)', controlMeasure: '인력 운반 최소화 및 중량물 취급 시 2인 1조' }
    ],
    '수질 시료 채취': [
      { id: 'r49', subTask: '공정수 모니터링 분석을 위한 공정수 저장조에서 시료 채취', riskFactor: '시료 채취 중 공정수 저장조 안으로 추락', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '채취 구간 안전난간대 상태 수시 점검 및 필요시 2인 1조 작업' }
    ],
    '활성탄 집진기 운영 및 유지보수': [
      { id: 'r50', subTask: '활성탄 교체 작업', riskFactor: '분진으로 인한 호흡기 질환', frequency: 1, severity: 2, riskLevel: '2 (하)', controlMeasure: '방진마스크 착용 및 작업 시 환기 철저' },
      { id: 'r51', subTask: '하부 분진(먼지) 배출', riskFactor: '분진으로 인한 호흡기 질환', frequency: 1, severity: 2, riskLevel: '2 (하)', controlMeasure: '방진마스크 착용 및 작업 시 환기 철저' },
      { id: 'r52', subTask: '블로워 및 구동부 점검', riskFactor: '점검 시 회전부 협착(끼임)', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '점검/보수 전 반드시 전원 차단 확인' },
      { id: 'r53', subTask: '차압 및 온도 모니터링', riskFactor: '분진으로 인한 호흡기 질환', frequency: 1, severity: 2, riskLevel: '2 (하)', controlMeasure: '게이지 확인 시 방진마스크 착용 및 주변 청결 유지' }
    ],
    '기타 설비 유지보수': [
      { id: 'r54', subTask: '메인 판넬의 전압 및 전류 확인', riskFactor: '감전 및 불꽃으로 인한 화상', frequency: 2, severity: 2, riskLevel: '4 (중)', controlMeasure: '판넬 내 임의 배선 조작 금지 및 젖은 손으로 조작 금지' },
      { id: 'r55', subTask: '모터 및 펌프 교체', riskFactor: '과중량으로 인한 중량물 낙하, 인력 작업 시 근골격계 질환', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '인양물 하부 접근 금지 및 2인 1조 작업 지뤼' },
      { id: 'r56', subTask: '배관 용접 및 절단 작업', riskFactor: '비산되는 불꽃으로 인한 화재', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '작업 구역 내 소화기 비치 및 주변 가연물 사전 제거' },
      { id: 'r57', subTask: '배관 용접 및 절단 작업', riskFactor: '흄가스 흡입으로 호흡기 질환', frequency: 1, severity: 2, riskLevel: '2 (하)', controlMeasure: '방진마스크 착용 및 이동식 배기장치 가동/환기' },
      { id: 'r58', subTask: '배관 용접 및 절단 작업', riskFactor: '고소작업 중 추락', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '고소작업 시 하네스 착용 및 생명줄 체결' },
      { id: 'r59', subTask: '고압호스, 에어호스 및 부품 교체', riskFactor: '호스 내 잔압으로 작업자 상해', frequency: 2, severity: 2, riskLevel: '4 (중)', controlMeasure: '교체 전 메인 벨브 차단 및 잔류 압력 완전 배출 확인, 안면보호구 착용' },
      { id: 'r60', subTask: '세척설비 회전기기류 오일 보충', riskFactor: '중량물 근골격계 질환 및 유류 유출', frequency: 1, severity: 2, riskLevel: '2 (하)', controlMeasure: '작업 구간 하부에 오일받이 및 흡착포 비치 / 중량물 취급 시 2인 1조 작업' }
    ],
    '공통사항': [
      { id: 'r61', subTask: '지게차를 이용한 자재 운반', riskFactor: '과적으로 인한 전도', frequency: 2, severity: 2, riskLevel: '4 (중)', controlMeasure: '지게차 정격 하중 준수 및 운전자 안전벨트 착용' },
      { id: 'r62', subTask: '현장 자체 수리를 위한 수공구 사용', riskFactor: '작업 중 수공구 낙하', frequency: 2, severity: 2, riskLevel: '4 (중)', controlMeasure: '고소작업 시 수공구 추락방지끈 체결. 하부 작업자 출입 통제' },
      { id: 'r63', subTask: '현장 내 작업자 보행', riskFactor: '빙판길으로 인한 넘어짐', frequency: 2, severity: 2, riskLevel: '4 (중)', controlMeasure: '동절기 결빙 예상 구간 염화칼슘 살포 및 모래주머니 비치' },
      { id: 'r64', subTask: '호이스트 운영', riskFactor: '후크해지장치 해체로 인한 중량물 낙하', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '작업 전 후크 해지장치 파손 여부 점검' },
      { id: 'r65', subTask: '호이스트 운영', riskFactor: '와이어로프 손상으로 인한 중량물 낙하', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '폐기 기준 도달 로프 즉시 교채 및 인양물 하부 통행 통제' },
      { id: 'r66', subTask: '출근/퇴근 시 반입장 내 출입문(행거도어) 여닫이', riskFactor: '여닫이 중 협착(끼임) 및 가이드롤러 파손으로 인한 넘어짐', frequency: 2, severity: 2, riskLevel: '4 (중)', controlMeasure: '레일 변형 여부 확인 및 도어 개폐 시 반드시 지정된 손잡이 사용' },
      { id: 'r67', subTask: '현장 내 중장비 및 대형 차량 이동', riskFactor: '비산먼지 발생으로 인한 호흡기 질환', frequency: 3, severity: 2, riskLevel: '6 (상)', controlMeasure: '현장 내 주기적인 살수(스프링쿨러) 및 스키드로더를 통한 바닥 정리' }
    ],
    '굴삭기 일반작업': [
      { id: 'r68', subTask: '선별 및 Tilling 작업', riskFactor: '굴삭기 버켓 탈락 및 낙하', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '작업 전 연결부 안전핀 체결 상태 반드시 확인' },
      { id: 'r69', subTask: '선별 및 Tilling 작업', riskFactor: '회전 반경 내 작업자와 부딪힘', frequency: 1, severity: 3, riskLevel: '3 (중)', controlMeasure: '신호수 배치 및 작업 반경 내 타근로자 접근 통제' }
    ],
    '굴삭기, 로더 연료주입': [
      { id: 'r70', subTask: '굴삭기, 로더 연료주입', riskFactor: '주유 호스에 발걸려 작업자 상해', frequency: 2, severity: 2, riskLevel: '4 (중)', controlMeasure: '주유기 호스 사용 후 즉시 정리정돈' }
    ],
    '굴삭기, 로더 엔진오일 등 소모품 교환': [
      { id: 'r71', subTask: '굴삭기, 로더 엔진오일 등 소모품 교환', riskFactor: '엔진오일 및 그리스 흡입, 섭취에 의한 상해', frequency: 1, severity: 2, riskLevel: '2 (하)', controlMeasure: '오일류 취급 시 관련 보호구 착용 및 개인위생 관리 철저' }
    ]
  }
};
