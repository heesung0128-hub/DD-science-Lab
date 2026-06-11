/**
 * Antigravity 스마트 Mock AI 엔진
 * 학생이 입력한 교과목, 주제, 가설 등의 데이터 맥락을 파싱하여,
 * 실시간으로 고도의 교육적 조언과 맞춤 추천을 생성합니다.
 */

// 2022 개정 및 2015 개정 고등학교 수학·과학 성취 기준 및 핵심 단원 가이드라인
const CURRICULUM_GUIDELINES = {
  "대수": "지수와 로그(거듭제곱근, 로그의 성질), 지수함수와 로그함수(뜻과 그래프, 방정식/부등식), 삼각함수(호도법, 일반각, 삼각함수의 뜻과 그래프, 사인법칙과 코사인법칙), 수열(등차수열, 등비수열, 수열의 합 시그마, 수학적 귀납법)",
  "미적분Ⅰ": "함수의 극한과 연속(함수의 극한값, 연속함수), 다항함수의 미분법(미분계수, 도함수, 극대/극소, 속도와 가속도, 도함수 활용), 다항함수의 적분법(부정적분, 정적분, 정적분 활용 넓이 및 속도와 거리)",
  "확률과 통계": "순열과 조합(원순열, 중복순열, 이항정리), 확률(확률의 뜻, 조건부확률, 독립사건), 통계(확률분포, 이산/연속확률변수, 정규분포, 통계적 추정, 모평균의 추정)",
  "수학Ⅰ": "지수함수와 로그함수(거듭제곱근, 로그, 그래프와 관계), 삼각함수(일반각, 호도법, 삼각함수 그래프 및 사인/코사인법칙), 수열(등차/등비수열, 수열의 합, 귀납적 정의)",
  "수학Ⅱ": "함수의 극한과 연속, 다항함수의 미분법, 다항함수의 적분법",
  "물리학": "힘과 운동(뉴턴 운동 법칙, 운동량과 충격량, 역학적 에너지 보존), 전자기와 양자(전동기, 전자기 유도, 파동의 성질, 빛과 물질의 이중성)",
  "물리학Ⅰ": "힘과 운동, 전자기와 양자, 열역학 법칙",
  "화학": "물질의 세 가지 상태와 용액, 반응 속도와 화학 평형(반응 속도식, 평형 이동), 역동적인 화학 반응(산 염기 중화반응, 산화 환원)",
  "화학Ⅰ": "화학의 첫걸음(몰, 화학식량, 화학반응식), 개성 있는 원소, 화학 결합과 분자의 세계, 역동적인 화학 반응",
  "생명과학": "생명활동과 세포(물질대사, 세포호흡), 항상성과 몸의 조절(신경계, 호르몬), 생물의 유전(유전자, 염색체, 가계도 분석), 생태계와 상호작용",
  "생명과학Ⅰ": "생명과학의 이해, 세포와 생명의 연속성(세포 분열, 유전 법칙), 항상성과 몸의 조절, 생태계와 상호작용",
  "지구과학": "지구 시스템 과학(판구조론, 대기와 해양의 순환), 행성우주과학(별의 물리량, 우주 팽창, 외계 행성 탐사)",
  "지구과학Ⅰ": "지하의 변화, 대기와 해양의 변화, 우주 탐사",
  "통합과학": "물질의 규칙성과 결합, 시스템과 상호작용(역학적 시스템, 지구 시스템, 생명 시스템), 변화와 다양성(산화 환원, 중화 반응, 생물 다양성), 환경과 에너지",
  "통합과학1": "물질의 규칙성과 결합, 역학적 시스템, 지구 시스템, 생명 시스템",
  "통합과학2": "변화와 다양성, 환경과 에너지"
};

const MockAI = {
  /**
   * 2단계 Phase B: AI 주제 제안 (Real LLM API 통합)
   */
  suggestTopics: async function (context) {
    const { subject, keywords, motivation, field, forceDirect } = context;
    const kwList = keywords || [];
    
    // API 키 확인
    let apiKey = localStorage.getItem("gemini_api_key");
    if (!apiKey) {
      // API Key가 없으면 모의(Simulated) AI 제안 모드로 폴백하여 오류 없이 실행
      return this.generateSimulatedTopics(subject, kwList, motivation, forceDirect);
    }

    // 과목명에 따른 교과 단원 및 성취기준 가이드라인 자동 매핑
    let curriculumGuide = "고등학교 성취 기준과 핵심 학습목표에 부합해야 하며, 생활기록부에 기재할 수 있도록 대학 과정의 난해한 이론이나 범위 외 개념은 배제하고 고교 수준의 범위 내에서 탐구해야 합니다.";
    
    const matchedKey = Object.keys(CURRICULUM_GUIDELINES).find(k => subject.includes(k) || k.includes(subject));
    if (matchedKey) {
      curriculumGuide = `[반드시 연계해야 할 고등학교 교육과정 핵심 학습목표 및 단원 범위]\n- 과목명: ${subject}\n- 학습 단원 및 내용요소 범위: ${CURRICULUM_GUIDELINES[matchedKey]}`;
    }

    // 1. RAG 기반 관련 교과 내용요소 검색 (Jaccard Hybrid Retrieval)
    let ragContextStr = "";
    try {
      if (typeof RAGEngine !== "undefined" && typeof CURRICULUM_DB !== "undefined") {
        const tempReport = {
          step_1: {
            학년: parseInt(localStorage.getItem("antigravity_report_save") ? JSON.parse(localStorage.getItem("antigravity_report_save")).step_1.학년 : 1) || 1,
            교과목: {
              교과: (subject.includes("수학") || subject.includes("미적분") || subject.includes("대수") || subject.includes("확률") || subject.includes("통계")) ? "수학" : "과학",
              과목명: subject
            }
          },
          metadata: {
            교육과정_버전: (localStorage.getItem("antigravity_report_save") ? JSON.parse(localStorage.getItem("antigravity_report_save")).metadata.교육과정_버전 : "v2022") || "v2022"
          },
          step_2: {
            키워드: kwList,
            동기: motivation
          },
          step_3: {
            동기: motivation
          }
        };
        const retrieved = RAGEngine.retrieveContext(tempReport, 5);
        if (retrieved && retrieved.length > 0) {
          ragContextStr = "\n\n[RAG 검색결과 - 관련 교육과정 성취기준 내용요소]\n" + retrieved.map(item => {
            const el = item.element;
            return `- 영역: ${el.영역}\n  내용요소: ${el.내용요소}\n  성취기준: ${el.성취기준.map(s => s.content || s.내용).join("; ")}\n  추천 탐구활동: ${el.관련_탐구활동_예시.join(", ")}\n  관련 키워드: ${el.관련_키워드.join(", ")}`;
          }).join("\n\n");
        }
      }
    } catch (e) {
      console.warn("RAG Context retrieval failed in suggestTopics", e);
    }

    const promptText = `당신은 한국 고등학교 1~3학년 학생들의 수학·과학 주제탐구를 지도하는 최고 수준의 진로 진학 학술 멘토 AI입니다.
학생이 입력한 진로 희망 및 과목 정보:
- 지망 학과/진로 계열: ${field || "일반 계열"}
- 관심 교과목: ${subject}
- 관심 키워드: ${kwList.join(", ")}
- 탐구 동기 및 의도: ${motivation || "없음"}

${curriculumGuide}
${ragContextStr}

[판정 규칙 (Verdict Rules)]
관심 키워드와 관심 교과목(${subject})의 교육과정 간 정합성을 판단하여 아래의 세가지 판정 중 하나를 내리고 그에 맞춘 형식으로만 JSON을 출력해야 합니다.
단, 강제 제안 옵션(forceDirect = ${forceDirect ? "true" : "false"})이 true인 경우, 키워드와 교과의 정합성이 낮더라도 무조건 "direct" 판정을 내리고 주제를 설계해야 합니다.

1. "direct" (직접 연결 가능):
   - 키워드가 해당 교과 단원 성취기준과 논리적으로 잘 연계되어 바로 탐구 주제로 발전시킬 수 있을 때.
   - 또는 forceDirect가 true일 때.
   - 이 경우, 고교 수준 범위 내에서 탐구할 수 있는 독창적이고 구체적인 탐구 주제 5종을 제안하십시오.
   - 각 주제는 "title", "description", "matched_content_elements" (매핑된 고교 내용요소 배열), "expected_variables" (예상 변인 배열)을 포함해야 합니다.

2. "redirect" (우회 탐구 방향 제시):
   - 키워드가 고교 수준의 해당 과목 범위에서 직접 탐구하기에는 범위가 다소 어긋나거나 대학 과정 개념(예: 군론, 디오판토스 등)으로 억지 연결될 가능성이 클 때.
   - 학생에게 친절하게 이유("reason")를 설명하고, 3~4가지 어울리는 우회 융합 방향("directions")을 제안하십시오.
   - 각 방향은 "emoji", "label" (방향 명칭), "example" (추천키워드 및 예시주제)을 포함해야 합니다.

3. "unsuitable" (탐구 부적합):
   - 키워드가 해당 수학·과학 교과목과 전혀 연관이 없는 비학술적인 일상어이거나 탐구로 발전에 무리가 있을 때.
   - 부적합 사유("reason")를 친절히 안내하고, 해당 과목과 연계 가능한 3가지 고품질 대체 정량 키워드("suggestions")를 추천하십시오.
   - 각 추천은 "refined_keyword" (대체 키워드명), "subject_area" (연계교과단원명)를 포함해야 합니다.

[⚠️ 절대 규칙 - 필수 준수 사항]
- 대학 과정의 어려운 개념(군론, 대칭군, 환론, 디오판토스, 복소평면 등)은 절대 배제하여 순수 고교 범위 내의 주제로만 candidates를 설계하십시오.
- 응답은 마크다운 코드블록(\`\`\`json) 기호 없이 반드시 아래 JSON 형식으로만 완벽하게 반환하세요.

응답 예시 JSON 형식:
{
  "verdict": "direct" | "redirect" | "unsuitable",
  "candidates": [ // verdict가 "direct"일 때만 포함
    {
      "title": "주제명",
      "description": "상세설명",
      "matched_content_elements": ["내용요소1"],
      "expected_variables": ["변인1", "변인2"]
    },
    ... (5개)
  ],
  "reason": "우회/부적합 판정 사유", // verdict가 "redirect" 또는 "unsuitable"일 때 포함
  "directions": [ // verdict가 "redirect"일 때만 포함 (3~4개)
    { "emoji": "🎯", "label": "융합 방향 1", "example": "상용로그 (#키워드)" }
  ],
  "suggestions": [ // verdict가 "unsuitable"일 때만 포함 (3개)
    { "refined_keyword": "빛의굴절", "subject_area": "물리학Ⅰ 파동" }
  ]
}`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }]
        })
      });

      if (!response.ok) {
        if (response.status === 400 || response.status === 403) {
          localStorage.removeItem("gemini_api_key");
          throw new Error(`잘못된 API 키이거나 요청이 거부되었습니다. (HTTP ${response.status})`);
        }
        throw new Error(`API 호출 오류: HTTP ${response.status}`);
      }

      const data = await response.json();
      const textOutput = data.candidates[0].content.parts[0].text.trim();
      
      // JSON 파싱 (마크다운 백틱 제거 등 안정화)
      let cleanJson = textOutput.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      return parsed;

    } catch (e) {
      console.warn("실시간 AI 제안 API 호출 실패. 모의 AI 모드로 안전하게 전환합니다.", e);
      const fallbackTopics = this.generateSimulatedTopics(subject, kwList, motivation, forceDirect);
      fallbackTopics.isFallback = true;
      fallbackTopics.errorMsg = e.message;
      return fallbackTopics;
    }
  },

  /**
   * 6.2 AI 답변 추천 패턴 (각 텍스트 필드별 3개 추천 제공)
   */
    getSuggestions: async function (step, field, report) {
    const apiKey = localStorage.getItem("gemini_api_key");
    if (!apiKey) {
      return this.simulateGetSuggestions(step, field, report);
    }

    const subject = report.step_1?.교과목?.과목명 || "물리학Ⅰ";
    const topic = report.step_2?.선택_주제 || "자유 탐구";
    const type = report.step_2?.탐구유형 || "experiment";
    const keywords = (report.step_2?.키워드 || []).join(", ");
    
    const promptText = `당신은 한국 고등학교 1~3학년 학생들의 수학·과학 주제탐구 보고서 작성을 지도하는 최상위 학술 멘토 AI입니다.
현재 학생은 [${step}단계]의 [${field}] 입력 영역을 작성 중입니다.

[학생의 이전 단계 기입 정보]
- 과목명: ${subject}
- 탐구 주제: ${topic}
- 탐구 유형: ${type}
- 관련 키워드: ${keywords}
- 탐구 동기(Step 3): ${report.step_3?.동기 || ""}
- 탐구 목적(Step 3): ${report.step_3?.목적 || ""}
- 핵심 질문(Step 3): ${report.step_3?.핵심질문 || ""}
- 가설 명제(Step 4): ${report.step_4?.가설 || ""}
- 변수 설계(Step 4): ${JSON.stringify(report.step_4?.변수 || {})}
- 절차 설계(Step 5): ${report.step_5?.절차_방법 || ""}

[가이드 및 답변 규칙 - 필수 사항]
1. 현재 작성하려는 영역([${step}단계] - [${field}])에 기입하기에 가장 어울리고 학술적이며 문장력이 뛰어난 완성형 추천 예문 '3가지'를 리스트 형식으로 생성해 주십시오.
2. 예문은 절대로 고정된 템플릿이어선 안 되며, 학생이 앞서 입력한 구체적인 주제(${topic}), 관심사, 유형, 가설을 유기적이고 명확하게 반영한 구체적인 맞춤 문장이어야 합니다.
3. 고교 교육과정 범위 내의 정확한 학술 용어를 사용하되, 고등학생 수준에 맞고 즉시 수정해서 활용할 수 있는 현실적이고 매력적인 문장으로 작성하십시오.
4. 응답은 마크다운 코드블록(\`\`\`json) 표식 없이 반드시 아래 구조를 만족하는 순수 JSON 형식으로만 완벽하게 출력하십시오.

응답 예시 JSON 형식:
[
  "구체적이고 매력적인 추천 문장 후보 1",
  "구체적이고 매력적인 추천 문장 후보 2",
  "구체적이고 매력적인 추천 문장 후보 3"
]`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }]
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API 통신 오류: HTTP ${response.status}`);
      }

      const data = await response.json();
      const textOutput = data.candidates[0].content.parts[0].text.trim();
      const cleanJson = textOutput.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      return parsed;

    } catch (e) {
      console.warn("실시간 AI 예문 추천 생성 실패. 모의 모드로 전환합니다.", e);
      return this.simulateGetSuggestions(step, field, report);
    }
  },


    simulateGetSuggestions: function (step, field, report) {
    const subject = report.step_1?.교과목?.과목명 || "물리학Ⅰ";
    const topic = report.step_2?.선택_주제 || "자유 탐구";
    const type = report.step_2?.탐구유형 || "experiment";
    const keywords = report.step_2?.키워드 || [];
    const mainKw = keywords[0] || "실생활 현상";
    const secKw = keywords[1] || "기본 데이터";

    const typeLabel = typeof EXPLORATION_TYPES !== 'undefined' ? (EXPLORATION_TYPES.find(t => t.id === type)?.label || "탐구") : "탐구";

    if (step === 3) {
      if (field === "동기") {
        return [
          `평소 수업 시간에 배우던 ${subject}의 핵심 개념들이 실생활이나 학과 연구 분야에서 어떻게 나타나는지 깊은 호기심이 생겼습니다. 특히 최근 학습한 ${subject} 개념을 구체적인 사례인 '${topic}' 현상에 대입하여 심화 관찰하고자 탐구를 기획했습니다.`,
          `최근 다양한 공학 및 자연과학 매체에서 화제가 되고 있는 '${mainKw}' 현상에 대한 학술적 보고서를 접하게 되었습니다. 이를 평소 관심 있던 ${subject} 교과 내용과 융합하여 정량적으로 규명해 보고자 강한 동기를 가지게 되었습니다.`,
          `진로로 희망하는 연구 계열의 기초 지식을 다지고, 단순한 이론 암기를 넘어 실증 분석 능력을 기르고자 했습니다. 이에 따라 ${subject}의 원리를 직접적으로 응용하여 수집 분석할 수 있는 '${topic}'을 탐구 주제로 선정하였습니다.`
        ];
      } else if (field === "목적") {
        return [
          `본 탐구의 주된 목적은 '${topic}' 과정에서 발생할 수 있는 주요 정량적 변인들 간의 상관관계를 통계적으로 정밀 검증하고, 이를 통해 교과 단원에서 배운 이론적 공식과의 오차 및 일치율을 정량화하는 것입니다.`,
          `${subject} 교과서의 핵심 공식과 이론을 실제 실험 환경 또는 수치 분석을 통해 작동시키고, '${mainKw}' 요인의 조작 변화에 따른 종속 반응 데이터를 수집하여 그 변동 법칙을 물리/수학적으로 규명하는 데 목적이 있습니다.`,
          `단순히 정성적으로 현상을 묘사하는 것에서 나아가, '${secKw}' 등을 통제 조건으로 삼고 여러 수집 데이터를 체계적으로 전처리하여 학술적으로 신뢰할 수 있는 수학적 최적 모델을 유도하는 것을 최종 목표로 삼습니다.`
        ];
      } else if (field === "핵심질문") {
        return [
          `과연 조작 조건인 '${mainKw}'의 크기나 강도를 선형적으로 변화시킬 때, 종속 결과로 나타나는 반응 측정값은 비선형적 임계 수렴 경향을 보일 것인가?`,
          `${subject} 교과에 나타나는 핵심 인과 법칙이 현실의 복잡한 마찰 및 오차 요인을 적용한 '${topic}' 모델에서도 90% 이상의 유의미한 일치성을 유지하는가?`,
          `탐구 환경의 통제 조건들이 설정되어 있을 때, '${topic}'에서 가장 우수한 물리적/화학적 효율을 달성할 수 있는 최적의 한계 파라미터 영역은 어디인가?`
        ];
      }
    }

    if (step === 4) {
      if (field === "가설") {
        return [
          `만약 독립 변수 역할을 하는 '${mainKw}' 조건의 크기를 2배 이상 점진적으로 증가시킨다면, 종속 반응인 측정값은 교과 이론에 따라 비선형 지수함수적 수렴 곡선을 나타낼 것이다.`,
          `설정한 '${topic}' 모델에서 외부 마찰 저항 요인들이 철저하게 통제되는 실험실 환경이라면, 조작 조건의 변화량과 최종 관찰 데이터는 통계적으로 유의미한 양의 상관계수(R² ≥ 0.85)를 가지며 비례할 것이다.`,
          `이전 연구와 ${subject}의 지식을 종합해 볼 때, '${secKw}'이 증가할수록 화학 반응/역학 충돌 거동 시간은 지연될 것이며, 이는 특정한 포화 곡선 형태로 수렴할 것이다.`
        ];
      } else if (field === "근거") {
        return [
          `${subject} 교과서의 대단원 성취기준 및 관련 이론적 공식에 의하면, 이 현상은 이론상 특정한 물리적/수학적 상수 상호작용에 지배를 받으므로 해당 방향으로 수렴할 수밖에 없는 명확한 논리적 근거가 성립합니다.`,
          `선행 학술 논문 및 문헌 자료 조사에 따르면, 유사 계열의 시스템에서 '${mainKw}'의 변동은 물리적 마찰 손실 및 에너지 변동을 기하급수적으로 유도하는 성향을 가진다고 입증되었기 때문입니다.`,
          `수행하고자 하는 '${typeLabel}' 탐구의 조작 요인들은 교과 내의 상호 유기적인 에너지 보존 법칙 또는 반응 속도론 이론에 비추어 볼 때 인과적 타당성이 완벽히 대조되는 합리적인 추측입니다.`
        ];
      }
    }

    if (step === 5) {
      if (field === "절차_방법") {
        return [
          `1단계: 통제 변인인 환경 온도와 물리적 트랙 수평도를 일정하게 보존 및 고정한다.\n2단계: 조작 변인인 '${mainKw}'을 3개 이상의 측정 조건 구간으로 등간격 설정하여 세팅한다.\n3단계: 5회 이상 반복 실행하여 정량화된 수치 데이터를 소수점 둘째 자리까지 기록한다.\n4단계: Excel 통계 기법을 적용해 오차 분산을 규명하고 최종 그래프로 가공한다.`,
          `1단계: 공공 데이터 포털 또는 학술 데이터셋에서 '${topic}'과 연관된 최근 5개년 로우 데이터를 다운로드한다.\n2단계: 수치 누락 및 결측치를 클렌징하는 정제 알고리즘 처리를 구현한다.\n3단계: 가설에서 설정한 독립 변인과 종속 결과 간의 선형 회귀 상관계수 및 p-value를 연산한다.`,
          `1단계: 선행 문헌 3편을 기준으로 삼고, '${mainKw}'에 대한 대조 분석 프레임워크를 수립한다.\n2단계: 도출된 정성 자료들을 교과 성취기준에 명시된 이론 모델과 1대1 비교 분석한다.\n3단계: 한계점과 오차 범위의 공통 분모를 찾아내어 최종 결론을 연역적으로 아카이빙한다.`
        ];
      } else if (field === "도구_자료") {
        return [
          `실시간 MBL 센서 장치 및 데이터 수집 분석 전용 소프트웨어 프로그램, 수평 활주 트랙, '${mainKw}' 정밀 가공 도구`,
          `KOSIS 국가통계포털 및 기상청 기후정보 분석 자료, Excel 스프레드시트 분석 도구 및 통계 패키지 R`,
          `DBpia 학술 논문 데이터베이스 검색 연동망, 국립중앙도서관 아카이브 문헌, 고등학교 ${subject} 성취기준 안내서`
        ];
      } else if (field === "신뢰성_타당성") {
        return [
          `수행 시 모든 무작위 환경 잡음을 차단하기 위해 동일 조건에서 총 5회 이상 정성 반복 계측을 수행하고, 최댓값과 최솟값을 배제한 절단평균을 도출하여 데이터 오차를 극복합니다.`,
          `기기의 계통 오차를 잡기 위해 탐구 시작 전 센서 0점 조정을 완벽히 선행하며, 측정자가 바뀔 때 생길 수 있는 주관적 판독 오차를 완전히 배제하여 타당성을 확보합니다.`,
          `공신력 있는 국가 기관의 공인된 원시 로우 데이터셋을 사용하고, 정제 과정에서 중복값과 이상치를 수학적 사분위수(IQR) 기준선으로 제거함으로써 통계적 신뢰 수준을 보증합니다.`
        ];
      }
    }

    if (step === 6) {
      const designProc = report.step_5?.절차_방법 || "절차 진행";
      const designTools = report.step_5?.도구_자료 || "기자재 수용";
      return [
        `[계획 기반 실측 기록]\n설계했던 '${designTools}'을 완벽히 준비한 뒤 가이드에 따라 총 5회 측정을 실시하였음. 그 결과 독립 요인의 변화량에 비례하여 데이터가 등간격으로 이동하는 수치 표를 안정적으로 획득함.`,
        `[자료 정제 및 변환]\n다운로드한 원시 데이터 속 결측치를 평균값 대체법으로 깔끔히 정제하고, 단위 변환을 거쳐 상관관계 연산이 용이한 3가지 분석 테이블로 가공 및 시계열 그룹화를 완료하였음.`,
        `[특이 관찰 사실]\n실측 수행 과정에서 '${mainKw}' 변수가 특정 조건 이상으로 증가할 때, 교과 이론 예측치보다 오차가 다소 증가하는 구간이 포착되었으며, 이는 바닥면의 미세한 마찰 마모에 기인한 물리적 오차 요인으로 유추 기록함.`
      ];
    }

    if (step === 7) {
      const hyp = report.step_4?.가설 || "인과 상관관계";
      if (field === "사실_정리") {
        return [
          `측정 결과, 조작 변수가 수치적으로 2배, 3배 상승할 때 종속 결과 데이터 역시 1.5배, 2.9배로 거의 유사하게 곡선 비례하여 급등하는 사실을 통계적으로 포착함 (결정계수 R² = 0.94 확인).`,
          `수치 시뮬레이션 모델 검증 결과, 교과 이론에 기반한 지수함수적 하강 경향성과 실제 수집한 측정 로그 데이터의 꺾임 형태가 전체 구간에서 약 3.8% 수준의 극소 오차만을 남긴 채 일치함을 확인함.`,
          `표본 집단 대조 분석 결과, A 조건은 평균 4.2점의 높은 피드백 반응을 나타낸 반면, B 조건은 2.1점에 그쳐 두 독립 그룹 간에 매우 뚜렷한 통계적 유의성(p < 0.05)이 존재함을 규명함.`
        ];
      } else if (field === "가설_검증_근거") {
        return [
          `초기에 수립했던 가설 [${hyp}] 명제에서 예측한 비선형적 증가 추이가 실제 실측 데이터 그래프 상에서도 높은 통계적 결정계수(R² = 0.94)를 나타내며 입증되었으므로 가설을 완벽히 '지지'합니다.`,
          `저온 및 중온 영역 조건에서는 가설의 선형적 인과 관계가 명료하게 입증되었으나, 고온 구간에서는 마찰 손실 및 공기 저항 오차로 인해 일부 예측 편차가 관찰되었으므로 부분적으로 타당함을 고려하여 '부분지지'합니다.`,
          `로우 데이터 분석 결과, 조작 조건의 증감 방향과 종속 반응의 상관계수는 무의미한 제로 수준에 가까웠으며, p-value가 유의수준 0.05보다 훨씬 컸기 때문에 과학적 인과를 증명하지 못하여 가설을 '기각(불지지)'합니다.`
        ];
      } else if (field === "한계_후속") {
        return [
          `실험실의 물리적 기압 환경과 센서 부착 패널의 정밀 마찰 제어가 완벽히 통제되지 못해 미세 오차가 누적된 한계가 있습니다. 향후에는 미적분Ⅰ 단원의 극한 보정 수식을 추가하여 이를 통계적 정밀 모델로 고도화하는 2차 탐구를 수행하고 싶습니다.`,
          `시간적 제약으로 인해 교내 표본 50명만을 조사 대상으로 삼았기 때문에 데이터의 일반성 보완 측면에서 표본 오차가 있을 수 있습니다. 다음 학기 기회가 된다면 학년 전체로 모집단을 확대하고 t-검정 통계 기법을 적용하여 신뢰도를 공고히 다지고자 합니다.`,
          `단순한 고교 범위 내의 1차원 선형 모델을 대입하다 보니 현실의 다변수 복합 요인들을 반영하기 어려웠습니다. 후속 연구로 다변수 미분 방정식을 컴퓨터 언어로 수치 시뮬레이션 코딩하여 정밀성을 비약적으로 높이는 공학적 탐구로 발전시키고 싶습니다.`
        ];
      }
    }

    return [
      "AI 추천 예문 후보 1: 입력 정보를 교과와 융합한 구체적인 내용으로 나만의 보고서를 구성해 보세요.",
      "AI 추천 예문 후보 2: 탐구 동기와 주제를 연결하여 생활기록부에 기재 가능한 깊이 있는 문장으로 가공해 보세요.",
      "AI 추천 예문 후보 3: 측정 과정의 한계점이나 오차 발생 요인을 솔직하게 수치와 함께 기록하면 신뢰성이 상승합니다."
    ];
  },


  checkHypothesis: function (hyp, rationale, variables) {
    const hasIfThen = hyp.includes("한다면") || hyp.includes("할 것이다") || hyp.includes("되면");
    const hasVars = Object.values(variables || {}).every(v => v && v.trim().length > 0);
    const hasRationale = rationale && rationale.length > 20;

    let verifiability = {
      strength: "가설이 정량화가 가능하거나 명확한 결과 예측을 담고 있어 긍정적입니다.",
      improvement: "결과 측정이 수치나 뚜렷한 예/아니오의 형태로 계량될 수 있는지 한 번 더 다듬어 보세요."
    };

    if (hasIfThen) {
      verifiability.strength = "조건절('~한다면')과 결과절('~할 것이다')의 인과적 구조를 훌륭하게 갖추고 있어, 실험이나 데이터를 통한 참/거짓 판단이 매우 용이한 훌륭한 가설입니다.";
    } else {
      verifiability.improvement = "'만약 [조작/독립 조건]을 ~하게 변화시킨다면, [종속 결과]는 ~하게 변할 것이다' 형태로 문장을 재구성하면 검증가능성이 비약적으로 상승합니다.";
    }

    let variableClarity = {
      strength: "탐구 유형에 걸맞은 핵심 변수들이 올바르게 추출되어 각 슬롯에 잘 배정되었습니다.",
      improvement: "변수 이름이 추상적일 수 있습니다. 좀 더 명확한 물리량(예: 속도가 아니라 '주행 속도 m/s')이나 통계 데이터 수치 명칭으로 지정해 주세요."
    };

    if (!hasVars) {
      variableClarity.improvement = "현재 작성 중인 변수 슬롯에 공란이 있습니다. 탐구를 통제하고 데이터를 측정하기 위해서는 모든 핵심 변수와 조건을 명확하게 기입해 주세요.";
    } else {
      variableClarity.strength = "조작/독립 변수와 측정하고자 하는 종속 결과 변수가 1:1로 대응되고 있으며 상호 섞이지 않고 잘 정돈되어 있습니다.";
    }

    let causality = {
      strength: "두 요인 간의 원인과 결과를 유추할 수 있도록 흐름이 잡혀 있습니다.",
      improvement: "변수들이 그저 단순히 '동시에 존재하는 사실'인지, 아니면 하나가 '원인'이 되어 다른 '결과'를 일으키는 관계인지 명확히 구별해야 합니다."
    };

    let scopeSuitability = {
      strength: "고등학생 수준에서 1~2주 내에 학교 실험실이나 데이터 포털로 충분히 수집 가능한 현실적 탐구 범위입니다.",
      improvement: "탐구하고자 하는 물리적 조건이나 모집단 데이터의 범위가 너무 광범위하지 않은지 점검하고, 실험실에서 핸들링할 수 있는 변수 영역으로 범위를 좁히는 것이 좋습니다."
    };

    if (hasRationale) {
      scopeSuitability.strength = "가설을 제안한 타당한 과학적/논리적 근거가 풍부하게 제시되어 있어, 단순한 추측이 아닌 합리적 가설의 기틀을 완성하고 있습니다.";
    } else {
      scopeSuitability.improvement = "왜 이 가설이 도출되었는지 교과서 지식이나 선행 지식을 1~2줄 더 서술하여 논리적 근거를 탄탄히 채워주세요.";
    }

    return {
      "검증가능성": verifiability,
      "변수_명확성": variableClarity,
      "인과_상관_구분": causality,
      "범위_적절성": scopeSuitability
    };
  },

  /**
   * 5단계 끝: 교과 연결 자기점검 모달용 AI 평가
   * 절대 규정: 별점 금지, 점수 금지, '세특' 단어 사용 절대 금지
   */
  selfCheckConnection: async function (subject, report) {
    const apiKey = localStorage.getItem("gemini_api_key");
    if (!apiKey) {
      return this.simulateSelfCheckConnection(subject, report);
    }

    const promptText = `당신은 고등학교 수학·과학 탐구-교과 연결성 검정용 AI입니다.
학생이 선택한 교과목(${subject})과 2~5단계의 탐구 보고서 내용을 읽고, 성취기준 및 단원과 실제 얼마나 유기적으로 정밀 연계되어 있는지 분석해 주세요.

[학생 탐구 보고서 내용]
- 관심 과목: ${subject}
- 관심 키워드: ${(report.step_2?.키워드 || []).join(", ")}
- 최종 주제: ${report.step_2?.선택_주제 || ""}
- 탐구 유형: ${report.step_2?.탐구유형 || ""}
- 탐구 동기: ${report.step_3?.동기 || ""}
- 탐구 목적: ${report.step_3?.목적 || ""}
- 핵심 질문: ${report.step_3?.핵심질문 || ""}
- 가설: ${report.step_4?.가설 || ""}
- 근거: ${report.step_4?.근거 || ""}
- 변수: ${JSON.stringify(report.step_4?.변수 || {})}
- 절차: ${report.step_5?.절차_방법 || ""}
- 도구: ${report.step_5?.도구_자료 || ""}

[⚠️ 절대 규칙 - 필수 사항]
1. 응답 텍스트에 절대로 별표 문자(★)나 그 외의 별점 기호를 출력하지 마십시오.
2. 응답 텍스트에 '세특', '세부능력', '특기사항', '생활기록부', '생기부' 단어를 절대로 사용하지 마십시오. 학생이 세특을 지나치게 의식하면 학술적 탐구 본질이 왜곡되기 때문입니다.
3. 긍정적이고 지지하는 어조로 메타인지 자가 성찰을 도와주는 학술적 피드백을 제공해 주세요.

응답은 반드시 마크다운 코드블록(\`\`\`json) 표식 없이 아래의 순수 JSON 구조만 출력하십시오.
{
  "wellConnected": ["✓ 잘 연결됨 요소 1", "✓ 잘 연결됨 요소 2"],
  "needsImprovement": ["△ 조금 더 보강 가능 요소 1", "△ 조금 더 보강 가능 요소 2"],
  "notRelated": ["· 다루지 않는 영역 1", "· 다루지 않는 영역 2"],
  "overallComment": "전체 메타인지 피드백 코멘트 (세특, 생활기록부 단어 절대 금지)"
}`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }]
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API 통신 오류: HTTP ${response.status}`);
      }

      const data = await response.json();
      const textOutput = data.candidates[0].content.parts[0].text.trim();
      const cleanJson = textOutput.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      return parsed;

    } catch (e) {
      console.warn("실시간 AI 자기점검 평가 실패. 모의 AI 모드로 전환합니다.", e);
      return this.simulateSelfCheckConnection(subject, report);
    }
  },

  simulateSelfCheckConnection: function (subject, report) {
    const reportText = JSON.stringify(report);
    let wellConnected = [];
    let needsImprovement = [];
    let notRelated = [];
    let overallComment = "";

    if (subject.includes("물리") || subject.includes("역학") || subject.includes("에너지")) {
      wellConnected = ["힘과 운동 분석", "역학적 에너지 수지 보존 검토"];
      needsImprovement = ["마찰력 및 주변 환경으로 인한 열손실 계산 보강", "MBL 센서의 해상도 한계 보정"];
      notRelated = ["유기 화학 결합 구조 분석", "확률적 소비자 심리 분포 모델링"];
      overallComment = `작성하신 탐구 과정은 물리학 교과의 힘과 운동 단원에서 다루는 주요 핵심 지식을 정밀하게 적용하고 있습니다. 실험 과정에서 발생할 수 있는 마찰 저항이나 에너지 손실 원인을 좀 더 교과서 공식과 연계하여 수식화하면 메타인지적 완성도가 한층 높아질 것입니다.`;
    } else if (subject.includes("화학") || subject.includes("물질")) {
      wellConnected = ["반응 속도 영향 변인 통제", "화학적 변화 측정 설계"];
      needsImprovement = ["반응 촉매 및 활성화 에너지 장벽 개념 매핑", "pH 정밀 보정 및 측정 횟수 확대"];
      notRelated = ["우주 배경 복사 분석", "삼각함수의 기하학적 파형 합성"];
      overallComment = `본 설계는 화학 교과의 물질 대사 및 화학반응 속도 조절 개념을 훌륭히 담아내고 있습니다. 온도나 농도 같은 조작 변인이 분자 충돌 이론과 어떤 분자적 메커니즘으로 교과 내에서 해설되는지 배경 지식에 연결해 보면 훨씬 논리적인 탐구가 완성될 것입니다.`;
    } else if (subject.includes("미적분") || subject.includes("대수") || subject.includes("함수") || subject.includes("수학")) {
      wellConnected = ["함수적 모델링 구축", "도함수를 활용한 변화율 극대값 탐색"];
      needsImprovement = ["실제 물리 환경 제약 요소를 반영한 도메인 범위 설정", "독립 변인의 불연속성 극복을 위한 수치적 이산화 보강"];
      notRelated = ["생명체 삼투압 조절 메커니즘 분석", "지진파 P파 S파 전파 거동 측정"];
      overallComment = `본 주제는 수학적 모델을 구축하고 변화율을 정량화하려는 노력이 돋보입니다. 교과서에서 다루는 미분 계수 또는 수열의 극한 수렴성이 실제 현실 데이터의 복잡성과 만났을 때 생기는 격차를 분석에 명시해 주면, 더욱 입체적인 탐구가 될 것입니다.`;
    } else {
      wellConnected = ["독립 변인과 종속 결과의 인과 모델링", "측정 데이터를 바탕으로 한 추론 전개"];
      needsImprovement = ["선행 지식(교과 성취기준 내용)의 핵심 용어를 가설 근거에 추가 명시", "오차를 줄이기 위한 통제 장치 정밀화"];
      notRelated = ["관련성 없는 인문 사회적 역사 사례의 단순 연대기 나열", "수학/과학적 분석 모델 배제"];
      overallComment = `선택하신 [${subject}] 과목과 핵심 탐구 동기가 유기적으로 잘 엮여 있습니다. 탐구 과정 전반에 걸쳐 교과 이론에서 강조하는 핵심 정의와 법칙을 명시적으로 사용함으로써 탐구의 학술적 연결고리를 단단하게 묶어보세요.`;
    }

    return {
      wellConnected,
      needsImprovement,
      notRelated,
      overallComment
    };
  },

  /**
   * API Key가 없을 경우 작동하는 고품질 모의(Simulated) AI 탐구 주제 생성기
   */
  generateSimulatedTopics: function (subject, keywords, motivation, forceDirect = false) {
    const kwList = keywords || [];
    const mainKw = kwList.length > 0 ? kwList[0] : "실생활 현상";
    
    // 1. 교육과정 정합성 진단 시뮬레이션
    const hasUnsuitable = kwList.some(k => ["영화", "웹툰", "게임", "소설", "음악", "미술"].includes(k));
    const hasRedirect = kwList.some(k => ["신호등", "큐브", "암호"].includes(k));

    if (hasUnsuitable && !forceDirect) {
      return {
        verdict: "unsuitable",
        reason: `입력하신 키워드 [${kwList.join(", ")}]는 선택하신 과목 [${subject}]의 고등학교 교육과정 성취기준 내용요소와 학술적인 연계가 현저히 떨어집니다. 고등학교 보고서는 교과 단원의 구체적 개념(예: 지수함수, 뉴턴 운동 법칙 등)과 연계되어야 생활기록부 기재가 가능합니다.`,
        suggestions: [
          { refined_keyword: "빛의굴절", subject_area: "물리학Ⅰ 파동과 입자" },
          { refined_keyword: "소음데시벨", subject_area: "수학Ⅰ 상용로그의 활용" },
          { refined_keyword: "감염병확산", subject_area: "생명과학 개체군과 생장곡선" }
        ]
      };
    }

    if (hasRedirect && !forceDirect) {
      return {
        verdict: "redirect",
        reason: `입력하신 키워드 [${kwList.join(", ")}]는 고교 수준의 [${subject}] 과목에서 직접적으로 다루기에는 범위가 다소 어긋나거나 대학 과정 개념(예: 군론, 디오판토스 등)으로 억지 연결될 가능성이 큽니다. 대학 과정의 어려운 개념 대신 아래와 같은 정규 교과 단원(지수로그, 삼각함수, 수열, 뉴턴 물리 등)과의 우회 융합 방향을 권장합니다.`,
        directions: [
          { emoji: "🚗", label: "통계적 대기시간 분석 및 신호 주기 모델링", example: "상관계수" },
          { emoji: "📐", label: "수열의 극한 및 프랙탈 눈송이 기하학 분석", example: "수열" },
          { emoji: "💻", label: "최적 경로 탐색 알고리즘과 행렬/벡터 연산", example: "알고리즘" }
        ]
      };
    }

    const mainKwName = mainKw;
    const subKw = kwList.length > 1 ? kwList[1] : "통계 분석";
    const thirdKw = kwList.length > 2 ? kwList[2] : "정량 모델링";
    const subjName = subject || "과학";

    let category = "general";
    const subL = subjName.toLowerCase();
    
    if (subL.includes("대수")) {
      category = "algebra";
    } else if (subL.includes("물리") || subL.includes("역학") || subL.includes("전자기") || subL.includes("에너지") || subL.includes("우주") || subL.includes("기하")) {
      category = "physics";
    } else if (subL.includes("화학") || subL.includes("물질") || subL.includes("반응")) {
      category = "chemistry";
    } else if (subL.includes("생명") || subL.includes("세포") || subL.includes("유전") || subL.includes("대사") || subL.includes("생물")) {
      category = "biology";
    } else if (subL.includes("지구") || subL.includes("기후") || subL.includes("환경") || subL.includes("생태")) {
      category = "earth_science";
    } else if (subL.includes("수학") || subL.includes("미적분") || subL.includes("통계") || subL.includes("확률") || subL.includes("함수")) {
      category = "math";
    }

    const templates = {
      algebra: [
        {
          title: `지수·로그함수를 활용한 ${mainKwName}의 성장 추이 및 최적 수렴 시나리오 모델링`,
          description: `스토리 조회수 유입량, 세포 증식, 음향 데시벨 감쇄 등 급격한 증감 후 포화하는 실제 현상을 **지수/로그함수 모델**로 추적하는 탐구`
        },
        {
          title: `삼각함수의 파동 공식을 적용한 ${mainKwName} 현상의 감정선/갈등 주기 변화 분석`,
          description: `소설/영화 서사 내 갈등의 파고, 소리의 음파 진동 등 주기적 왕복 운동 패턴을 **삼각함수($y=a\\sin(bx)$) 그래프**로 정량 모델링하는 탐구`
        },
        {
          title: `드로잉 비율 최적화를 위한 삼각비와 호도법의 실용적 수학 작화 분석`,
          description: `웹툰 투시 도법이나 원근 앵글 묘사 시 관절 각도와 피사체 크기를 **호도법과 삼각비 공식**을 통해 대수적으로 계산 및 설계하는 탐구`
        },
        {
          title: `등비수열 및 수열의 합 공식을 적용한 ${mainKwName}의 단계별 레이아웃 패턴 연구`,
          description: `컷 배치 간격의 점진적 변화, 다세대 개체수 증식 등 규칙적 컷 연출을 **등차/등비수열의 일반항 및 합($S_n$)**으로 대수 해석하는 탐구`
        },
        {
          title: `수학적 귀납법을 활용한 ${mainKwName} 거동 알고리즘의 무한 루프 안정성 검증`,
          description: `반복적 프레임 렌더링 루프나 순환 수열 패턴이 무한히 거듭되어도 안정을 유지함을 **수학적 귀납법 명제**로 대조 증명하는 탐구`
        }
      ],
      physics: [
        {
          title: `MBL 센서를 활용한 ${mainKwName} 운동 과정의 오차 요인 분석 및 보정 공식 유도`,
          description: `실측 실험 중 발생하는 저항이나 마찰력을 ${mainKwName} 관점에서 계량화하고, 수치적 보정 모델을 수립하여 이론값과의 일치도를 높이는 탐구`
        },
        {
          title: `수학적 모델링을 통한 ${mainKwName} 현상에서의 에너지 전환 효율 분석`,
          description: `에너지 보존 법칙을 바탕으로 ${mainKwName} 시스템 내의 손실률을 계산하고, 외부 변인에 따른 효율 극대화 방안을 제안하는 탐구`
        },
        {
          title: `컴퓨터 시뮬레이션을 활용한 ${mainKwName} 조건에 따른 역학적 거동 예측`,
          description: `수치 해석 프로그램을 이용해 ${mainKwName} 변수 변화에 따른 동역학적 변화를 시뮬레이션하고, 물리적 안정성을 검증하는 탐구`
        },
        {
          title: `실생활 도구에 숨어 있는 ${mainKwName}의 역학적 메커니즘과 효율성 개선 설계`,
          description: `주변의 물리적 장치 속 ${mainKwName} 원리를 분석하고, 조작 변인을 통제하여 효율성을 최적화하는 공학적 탐구`
        },
        {
          title: `전자기적 원리와 ${mainKwName}을 결합한 차세대 친환경 발전 효율성 비교`,
          description: `전자기 유도 현상과 ${mainKwName}의 연동성을 탐색하여, 소형 발전기 작동 시 최적의 전력 생산 조건들을 도출하는 탐구`
        }
      ],
      chemistry: [
        {
          title: `반응 촉매 및 ${mainKwName} 조건이 화학 반응 속도에 미치는 영향의 정량적 연구`,
          description: `다양한 촉매와 ${mainKwName} 농도 변화에 따른 기체 발생률을 측정하고, 반응 속도 상수 k값을 도출하는 실증 탐구`
        },
        {
          title: `화학 평형과 ${mainKwName} 변인 통제를 통한 최적의 수득률 도출 시뮬레이션`,
          description: `르샤틀리에 원리를 기반으로 온도, 농도, ${mainKwName} 조건에 따른 화학 평형 이동을 관찰하고 최적 효율 조건을 분석하는 탐구`
        },
        {
          title: `생활 속 친환경 신소재의 ${mainKwName} 분해 효율성과 환경적 개선 영향 평가`,
          description: `생분해성 물질의 분해 거동을 ${mainKwName} 조건에 따라 실측하고, 환경 오염 저감 효과를 화학 스펙트럼으로 비교하는 탐구`
        },
        {
          title: `${mainKwName} 개념을 활용한 전기화학 셀의 전압 변화 및 내부 저항 오차 규명`,
          description: `전해질 농도와 ${mainKwName}에 따른 전위차를 측정하고, 네른스트 식을 활용해 용액의 화학적 거동을 계량화하는 탐구`
        },
        {
          title: `분자 구조식 분석을 통한 ${mainKwName} 화합물의 열역학적 안정성 비교`,
          description: `다양한 화합물 속 ${mainKwName} 결합력을 이론적으로 비교하고, 연소열 실측을 통해 결합 에너지를 유도하는 탐구`
        }
      ],
      biology: [
        {
          title: `효소 활성 경로 분석을 통한 ${mainKwName} 요인의 생체 대사 영향성 탐색`,
          description: `유기 촉매 활성 반응 속도를 ${mainKwName} 조건별로 실측하고, 온도 및 pH 민감도 한계 곡선을 기술하는 탐구`
        },
        {
          title: `SIR 감염병 확산 모델에 ${mainKwName} 변수를 추가한 수학적 감염 곡선 시뮬레이션`,
          description: `학교 내부 또는 지역 사회의 감염 거동을 ${mainKwName} 변인과 연동하여 해석하고, 방역 차단 효과를 모델링하는 융합 탐구`
        },
        {
          title: `식물의 삼투 현상과 ${mainKwName} 농도가 세포막 물질 이동에 미치는 영향 연구`,
          description: `농도 변화에 따른 세포 수축 및 팽창율을 ${mainKwName} 척도로 계측하여 세포 내외의 유체 역학적 이동 속도를 밝히는 탐구`
        },
        {
          title: `유전 알고리즘과 ${mainKwName} 데이터를 접목한 세대 변화 모델의 최적화 예측`,
          description: `환경 제약 요소를 ${mainKwName} 파라미터로 코딩하여, 다세대 생존율 시뮬레이션을 돌려 생물학적 유전 현상을 모델링하는 탐구`
        },
        {
          title: `친환경 바이오매스의 ${mainKwName} 활용 조건에 따른 미생물 생장 속도 분석`,
          description: `배양 환경 조건과 ${mainKwName} 물질을 통제하며 미생물 개체수 변화 곡선을 추적하고 통계적 성장을 피팅하는 탐구`
        }
      ],
      earth_science: [
        {
          title: `공공 대기질 빅데이터와 ${mainKwName}의 시계열 상관관계 분석`,
          description: `미세먼지, 온실가스 거동을 ${mainKwName} 데이터와 매칭하고, 계절별 흐름을 선형 회귀 분석하는 데이터 통계 탐구`
        },
        {
          title: `기후변화 시나리오 모델링을 활용한 ${mainKwName} 변수의 생태적 위험 진단`,
          description: `지구 온난화 시뮬레이션을 통해 해수면 온도 및 ${mainKwName} 변수의 피드백 고리를 수학적으로 추론하는 탐구`
        },
        {
          title: `천체 관측 데이터 분석을 통한 ${mainKwName} 운동의 궤도 요소 도출`,
          description: `케플러 법칙과 만유인력 공식을 기반으로 행성 및 ${mainKwName} 궤도를 타원 모델링하여 주기 상수를 검증하는 탐구`
        },
        {
          title: `지구 시스템 내 탄소 순환 메커니즘과 ${mainKwName}의 조절 기능 연구`,
          description: `대기-해양-지각 사이의 탄소 평형 이동 속도를 ${mainKwName} 관점에서 분석하고 인위적 탄소 저감 효율을 계산하는 탐구`
        },
        {
          title: `토양 및 수질 환경 센서 데이터 분석을 통한 ${mainKwName}의 정화 효율성 계량화`,
          description: `오염수 흐름에서 ${mainKwName} 투입 조건에 따른 이온 전도도와 유기물 농도의 감소율을 실시간 계측 분석하는 탐구`
        }
      ],
      math: [
        {
          title: `실생활 변화율을 분석하는 ${mainKwName} 기반 미적분 모델링 연구`,
          description: `연속적인 변화량을 ${mainKwName} 함수로 정밀 정의하고, 미분법과 적분 정리를 적용해 최적의 한계치와 면적을 연산하는 탐구`
        },
        {
          title: `등비수열 및 로그 스케일을 적용한 ${mainKwName} 현상의 감쇄 법칙 규명`,
          description: `구면파 감쇠나 충격 파형 등 기하급수적으로 축소되는 ${mainKwName} 거동을 상용로그 스케일 수식으로 정량 모델링하는 탐구`
        },
        {
          title: `공공 오픈 API 데이터셋을 활용한 ${mainKwName} 분포의 통계적 가설 검증`,
          description: `대용량 샘플 데이터를 수집하여 ${mainKwName} 변수에 대한 정규성 검정 및 t-검정을 수행해 유의성을 판단하는 실증 탐구`
        },
        {
          title: `뉴턴의 냉각 법칙 및 ${mainKwName} 함수를 융합한 동적 수치 예측 모델 구축`,
          description: `시간 흐름에 따른 변동 데이터를 미분방정식으로 도출하여, ${mainKwName} 변수 파라미터를 조절하며 수치 시뮬레이션을 구현하는 탐구`
        },
        {
          title: `기하학적 벡터 분석을 활용한 ${mainKwName}의 힘의 합성 및 공간적 경로 최적화`,
          description: `공간 좌표계 상에서 ${mainKwName} 벡터 합과 내적 공식을 활용하여 에너지 소비를 최소화하는 이동 경로를 수학적으로 유도하는 탐구`
        }
      ],
      general: [
        {
          title: `융합적 관점에서 바라본 ${mainKwName}의 과학적 메커니즘과 실생활 적용성 연구`,
          description: `이종 교과목 성취기준을 연결하고 ${mainKwName} 개념의 학술적 위상을 입체적으로 고찰하는 융합 탐구`
        },
        {
          title: `${mainKwName} 변인을 통제한 조건별 실측 데이터 수집 및 오차 유도 모델 수립`,
          description: `독립 조건들을 체계적으로 변화시키면서 수집된 ${mainKwName} 데이터를 바탕으로 분산 분석(ANOVA)을 수행하는 실증 탐구`
        },
        {
          title: `컴퓨터 모델을 활용한 ${mainKwName} 요인 변화에 따른 복잡계 네트워크 안정성 분석`,
          description: `프로그래밍 시뮬레이터를 이용하여 ${mainKwName} 노드 파라미터를 변경하며 안정적인 수렴 조건을 찾는 탐구`
        },
        {
          title: `선행 학술 논문 메타 분석을 통한 ${mainKwName} 연구 동향 및 한계점 극복 대안 제안`,
          description: `최근 5개년간의 핵심 학술 논문들을 비교하여 ${mainKwName} 해결방안에 대한 타당성을 종합 비교하는 문헌 분석 탐구`
        },
        {
          title: `설문조사 및 기술 통계를 결합한 청소년의 ${mainKwName} 인지 수준과 행동 변화 상관관계 분석`,
          description: `교내 표본 집단을 대상으로 문항을 설계 및 통계 분석하여 ${mainKwName} 현상이 미치는 유의미한 영향성을 진단하는 탐구`
        }
      ]
    };

    const selectedPool = templates[category] || templates.general;
    const candidates = selectedPool.map((item, idx) => {
      let matched_content_elements = [];
      let expected_variables = [];

      if (category === "algebra" || category === "math") {
        matched_content_elements = ["지수함수와 로그함수", "삼각함수", "수열"];
        expected_variables = ["독립 변수 X (현상 진행 단계)", "종속 변수 Y (누적 데이터 값)"];
      } else if (category === "physics") {
        matched_content_elements = ["운동량과 충격량", "역학적 에너지 보존"];
        expected_variables = ["독립 변수 (속도 또는 질량)", "종속 변수 (충돌 시간 또는 손실 에너지)"];
      } else if (category === "chemistry") {
        matched_content_elements = ["반응 속도와 촉매", "화학 평형"];
        expected_variables = ["독립 변수 (촉매 유무/농도/온도)", "종속 변수 (가스 발생 속도 또는 평형상수)"];
      } else if (category === "biology") {
        matched_content_elements = ["생태계 상호작용", "개체군 생장 곡선"];
        expected_variables = ["독립 변수 (배양 시간/환경 요인)", "종속 변수 (개체군 밀도/효소 활성도)"];
      } else {
        matched_content_elements = ["교과 성취기준 단원"];
        expected_variables = ["조작 변인 (조건 값)", "통제 변인 (환경 조건)"];
      }

      return {
        id: `suggest-${idx + 1}`,
        title: item.title,
        description: item.description,
        matched_content_elements,
        expected_variables
      };
    });

    let warningBadge = forceDirect ? " (키워드 적합성 낮음)" : "";
    if (forceDirect) {
      candidates.forEach(c => {
        c.title = c.title + warningBadge;
      });
    }

    return {
      verdict: "direct",
      candidates: candidates
    };
  },

  suggestVariables: async function (subject, topic, inquiry_type, hypothesis, slots) {
    const apiKey = localStorage.getItem("gemini_api_key");
    if (!apiKey) {
      return this.simulateSuggestVariables(subject, topic, inquiry_type, hypothesis, slots);
    }

    const promptText = `당신은 한국 고등학교 1~3학년 학생들의 수학·과학 주제탐구 지도를 맡고 있는 진로 진학 학술 멘토 AI입니다.
학생의 탐구 기본 정보:
- 과목명: ${subject}
- 탐구 주제: ${topic}
- 탐구 유형: ${inquiry_type}
- 가설 명제: ${hypothesis}
- 요구하는 변수 슬롯 목록: ${slots.join(", ")}

[가이드 및 필수 준수 사항]
1. 각 슬롯(${slots.join(", ")})에 들어갈 학술적이고 정량적인 변인 설계를 추천해 주십시오.
2. 학생들이 직관적으로 이해할 수 있도록 영어 물리 기호(예: θ, v, I₀, Sn, ΔE, β, γ 등)나 영문 기호 및 영문 단위(J, m/s, radian 등)는 절대로 사용하지 마십시오. 대신 100% 한글 명칭과 알기 쉬운 한글 범위/단위를 조합하여 작성해 주십시오.
   - 좋은 예시: 단순히 '시간'이 아닌 '앙금 생성 완료 시간 (10초 ~ 60초)'
   - 좋은 예시: 단순히 '속도'가 아닌 '수레의 초기 속도 (초속 1미터 ~ 3미터)'
   - 좋은 예시: 단순히 '초기 유입자'가 아닌 '처음 감염된 환자 수 (1명 ~ 10명)'
3. 대학 과정의 너무 어려운 개념은 배제하고, 고교 수준에서 학교 실험실이나 공공 데이터를 통해 1~2주 내로 직접 통제 및 측정 가능한 실용적인 범위로 제시해 주십시오.

응답은 마크다운 코드블록(\`\`\`json) 표식 없이 반드시 아래 구조를 만족하는 순수 JSON 형식으로만 완벽하게 출력하십시오.
{
  ${slots.map(s => `"${s}": "구체적인 한글 변인명 (한글 단위/범위 포함)"`).join(",\n  ")}
}`;

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }]
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API 통신 오류: HTTP ${response.status}`);
      }

      const data = await response.json();
      const textOutput = data.candidates[0].content.parts[0].text.trim();
      const cleanJson = textOutput.replace(/```json/g, "").replace(/```/g, "").trim();
      const parsed = JSON.parse(cleanJson);
      return parsed;

    } catch (e) {
      console.warn("실시간 AI 변인 설계 제안 실패. 모의 모드로 전환합니다.", e);
      return this.simulateSuggestVariables(subject, topic, inquiry_type, hypothesis, slots);
    }
  },


  simulateSuggestVariables: function (subject, topic, inquiry_type, hypothesis, slots) {
    const result = {};
    const topL = (topic || "").toLowerCase();
    const hypL = (hypothesis || "").toLowerCase();
    
    // 1. 대수/함수/드로잉/예술 계열 융합 탐구 키워드 매칭
    const isDrawingOrArt = topL.includes("드로잉") || topL.includes("비율") || topL.includes("미술") || topL.includes("예술") || topL.includes("대칭") || topL.includes("패턴");
    
    // 2. 생명/질병/감염/바이러스 계열 융합 탐구 키워드 매칭
    const isInfectionOrBio = topL.includes("감염") || topL.includes("바이러스") || topL.includes("질병") || topL.includes("생장") || topL.includes("세포") || topL.includes("면역") || topL.includes("초파리") || topL.includes("수명");
    
    // 3. 수열/금융/소비/수익/가격 계열 융합 탐구 키워드 매칭
    const isFinanceOrSeq = topL.includes("수열") || topL.includes("수익") || topL.includes("가격") || topL.includes("소비") || topL.includes("금융") || topL.includes("할인") || topL.includes("이자");

    // 4. 역학/충돌/에너지/속도 계열 융합 탐구 키워드 매칭
    const isPhysicsOrCol = topL.includes("충돌") || topL.includes("에너지") || topL.includes("속도") || topL.includes("마찰") || topL.includes("센서") || topL.includes("수레");

    // 5. 화학/농도/반응/촉매/앙금 계열 키워드 매칭
    const isChemistryOrReact = topL.includes("화학") || topL.includes("반응") || topL.includes("촉매") || topL.includes("농도") || topL.includes("앙금") || topL.includes("중화") || topL.includes("산성") || topL.includes("산도") || topL.includes("염기");

    // 6. 기후/대기/미세먼지/지구과학 계열 키워드 매칭
    const isEarthOrClimate = topL.includes("기후") || topL.includes("대기") || topL.includes("미세먼지") || topL.includes("지구") || topL.includes("온난화") || topL.includes("탄소") || topL.includes("해수면") || topL.includes("토양") || topL.includes("수질");

    // 7. 통계/설문/만족도/청소년/사용시간 계열 키워드 매칭
    const isSurveyOrStat = topL.includes("설문") || topL.includes("만족도") || topL.includes("청소년") || topL.includes("스마트폰") || topL.includes("게임") || topL.includes("사용량") || topL.includes("사용시간") || topL.includes("sns") || topL.includes("유튜브");

    // 8. 수학/함수/수식/그래프/미적분 계열 키워드 매칭
    const isPureMath = topL.includes("미적분") || topL.includes("미분") || topL.includes("적분") || topL.includes("함수") || topL.includes("그래프") || topL.includes("극한") || topL.includes("수렴") || topL.includes("기하");

    // [지능형 동적 키워드 추출기]
    // 학생의 최종주제(topic)와 가설(hypothesis) 문장에서 실질 명사 후보군을 파싱합니다.
    const words = ((topic || "") + " " + (hypothesis || "")).match(/[가-힣]{2,10}/g) || [];
    // 불필요하게 범용적으로 쓰이는 수식어/조사/동사 제거
    const stopWords = ["활용", "이용", "통한", "분석", "연구", "탐구", "주제", "가설", "비교", "설계", "모델", "수학", "과학", "개념", "기반", "원리", "현상", "효과", "영향", "관계", "상관"];
    const cleanWords = words.filter(w => !stopWords.some(sw => w.includes(sw)));
    
    // 추출된 키워드 중 첫 번째를 핵심 변인 단어로, 두 번째를 결과 변인 단어로 채택
    const mainKw = cleanWords[0] || "조사 대상";
    const subKw = cleanWords[1] || cleanWords[0] || "측정 수치";

    slots.forEach(s => {
      let val = "";
      if (s.includes("조작") || s.includes("독립")) {
        if (isDrawingOrArt) {
          val = "피사체 관찰 각도 (0도 ~ 90도)";
        } else if (isInfectionOrBio) {
          val = "거리두기 단계 (1단계 ~ 4단계)";
        } else if (isFinanceOrSeq) {
          val = "할인 가격 격차 (100원 ~ 1,000원)";
        } else if (isPhysicsOrCol) {
          val = "수레의 초기 발사 속도 (초속 1미터 ~ 5미터)";
        } else if (isChemistryOrReact) {
          val = "반응 물질의 투입 농도 (0.1M ~ 1.0M)";
        } else if (isEarthOrClimate) {
          val = "온실가스 강제 유입 비율 (5% ~ 25%)";
        } else if (isSurveyOrStat) {
          val = "하루 평균 기기 사용 시간 (1시간 ~ 5시간)";
        } else if (isPureMath) {
          val = "함수 그래프 독립 변수 입력값 (0 ~ 10)";
        } else {
          val = `${mainKw} 조건 변화량 (10 ~ 100)`;
        }
      } else if (s.includes("종속")) {
        if (isDrawingOrArt) {
          val = "캐릭터 비율의 시각적 만족도 설문 (1점 ~ 5점)";
        } else if (isInfectionOrBio) {
          val = "최대 감염까지 걸린 시간 (1일 ~ 30일)";
        } else if (isFinanceOrSeq) {
          val = "5개월 뒤 총 예상 수익 (100만 원 ~ 1,000만 원)";
        } else if (isPhysicsOrCol) {
          val = "충돌 후 줄어든 운동 에너지 (1줄 ~ 50줄)";
        } else if (isChemistryOrReact) {
          val = "앙금 생성 완료 시까지 걸린 시간 (10초 ~ 60초)";
        } else if (isEarthOrClimate) {
          val = "지표면 평균 온도 상승 변동량 (0.1도 ~ 1.5도)";
        } else if (isSurveyOrStat) {
          val = "참여자의 일상 수면 만족도 설문 점수 (1점 ~ 5점)";
        } else if (isPureMath) {
          val = "극한 수렴 오차값 계산값 (0.01 이하)";
        } else {
          val = `${subKw}의 정량적 반응 실측치`;
        }
      } else if (s.includes("통제") || s.includes("일정") || s.includes("요인") || s.includes("대상")) {
        if (isDrawingOrArt) {
          val = "도화지 가로세로 비율 (4:3 또는 16:9), 실내 조명 밝기 (일정하게 유지)";
        } else if (isInfectionOrBio) {
          val = "처음 감염된 사람 수 (5명 ~ 20명), 예방 접종률 (70% 고정)";
        } else if (isFinanceOrSeq) {
          val = "제품 한 개당 원래 가격 (1만 원 ~ 10만 원), 최소 생활비";
        } else if (isPhysicsOrCol) {
          val = "수레의 무게 (500그램), 실험대 마찰 정도 (일정하게 유지)";
        } else if (isChemistryOrReact) {
          val = "용액의 전체 부피 (50ml 고정), 외부 온도 및 기압 환경";
        } else if (isEarthOrClimate) {
          val = "태양 복사 에너지 강도, 표면 반사율 상수 (0.3 고정)";
        } else if (isSurveyOrStat) {
          val = "설문 조사 응답자 연령대 분포 (고교 1학년군 고정)";
        } else if (isPureMath) {
          val = "연속 함수 시작 좌표 범위 (0에서 고정)";
        } else {
          val = `${mainKw} 실험 환경 통제 조건 (일정하게 유지)`;
        }
      } 
      // 수학적 모델링 슬롯
      else if (s === "입력 변수") {
        if (isDrawingOrArt) {
          val = "인물 관절이 꺾인 각도 (0도 ~ 90도)";
        } else if (isInfectionOrBio) {
          val = "최초 감염자 수 (1명 ~ 10명)";
        } else if (isFinanceOrSeq) {
          val = "기본 상품 판매 가격 (1,000원 ~ 10,000원)";
        } else if (isPhysicsOrCol) {
          val = "충돌 전 수레의 속도 (초속 1미터 ~ 3미터)";
        } else if (isChemistryOrReact) {
          val = "반응 유도 산성 물질 농도 (10% ~ 50%)";
        } else if (isEarthOrClimate) {
          val = "대기 중 탄소 유입 속도 (연간 상승 배출량)";
        } else if (isSurveyOrStat) {
          val = "주간 모바일 수신 알림 횟수 (10회 ~ 100회)";
        } else if (isPureMath) {
          val = "기하학적 공간 좌표 축 길이 (0 ~ 5)";
        } else {
          val = `${mainKw} 조건 변화 수치 (10 ~ 100)`;
        }
      } else if (s === "모델 파라미터") {
        if (isDrawingOrArt) {
          val = "황금 비율 상수 (약 1.618)";
        } else if (isInfectionOrBio) {
          val = "하루 감염 확률 (0.1 ~ 0.5), 완치 확률 (0.05 ~ 0.2)";
        } else if (isFinanceOrSeq) {
          val = "가격 변화에 따른 구매 민감도 계수 (1.0 ~ 2.0)";
        } else if (isPhysicsOrCol) {
          val = "바퀴의 굴림 마찰 상수 (0.01 ~ 0.10)";
        } else if (isChemistryOrReact) {
          val = "물질 고유 반응 속도 상수 (0.05)";
        } else if (isEarthOrClimate) {
          val = "이산화탄소 대기 보존 수명 기간 계수 (1.2)";
        } else if (isSurveyOrStat) {
          val = "알림 반응 시간 지체 가중 계수 (1.5)";
        } else if (isPureMath) {
          val = "기울기 및 수렴 방향 가중 비율 (0.5)";
        } else {
          val = `${mainKw} 시스템 감쇄 및 조절 비례 상수 (0.1 ~ 0.5)`;
        }
      } else if (s === "출력 변수") {
        if (isDrawingOrArt) {
          val = "화면 왜곡을 조절하는 2차 함수 모델";
        } else if (isInfectionOrBio) {
          val = "시간에 따른 하루 누적 환자 수 (0명 ~ 1,000명)";
        } else if (isFinanceOrSeq) {
          val = "가장 높은 수익을 내기 위한 2차 곡선 모델";
        } else if (isPhysicsOrCol) {
          val = "충돌할 때 잃어버린 에너지량 (10% ~ 50%)";
        } else if (isChemistryOrReact) {
          val = "반응 속도 변화에 따른 수득률 곡선 모델";
        } else if (isEarthOrClimate) {
          val = "대기 온도 연도별 한계 지수 시뮬레이션 곡선";
        } else if (isSurveyOrStat) {
          val = "스트레스 유발율 상관관계 2차 예측 수식";
        } else if (isPureMath) {
          val = "곡선 아래 면적 정적분 연산 도출 곡선";
        } else {
          val = `${subKw}의 수학적 예측 수치 곡선 (결과 그래프)`;
        }
      }
      // 문헌/조사 분석 슬롯
      else if (s === "분석 차원") {
        if (isDrawingOrArt) {
          val = "삼각함수를 응용한 캐릭터 원근 대칭의 정확도";
        } else if (isInfectionOrBio) {
          val = "감염병 재생산지수 공식을 활용한 접촉 예방 효과";
        } else if (isFinanceOrSeq) {
          val = "등비수열 수렴법칙을 적용한 정기 구독 요금의 장기적 이득";
        } else if (isPhysicsOrCol) {
          val = "충격량 공식을 활용한 수레 충돌의 실험 오차 보정율";
        } else if (isChemistryOrReact) {
          val = "중화반응 그래프 공식을 응용한 산염기 혼합액 오차 분석";
        } else if (isEarthOrClimate) {
          val = "이산화탄소 피드백 수식을 적용한 해수면 상승 시뮬레이션";
        } else if (isSurveyOrStat) {
          val = "피어슨 상관계수 공식을 활용한 수면 부족과의 유의성 분석";
        } else if (isPureMath) {
          val = "함수 극한 근사치를 대조한 곡선 접선 기울기 수렴성";
        } else {
          val = `${mainKw}과 ${subKw}의 상관관계 비교 기준`;
        }
      } else if (s === "비교 대상" || s === "비교대상") {
        if (isDrawingOrArt) {
          val = "르네상스 고전 회화의 신체 비례 vs 현대 인기 웹툰 캐릭터의 신체 비례";
        } else if (isInfectionOrBio) {
          val = "인구가 밀집된 대도시 주민 vs 인구가 적은 농어촌 주민";
        } else if (isFinanceOrSeq) {
          val = "매달 자동으로 요금이 나가는 방식 vs 필요할 때마다 충전하는 방식";
        } else if (isPhysicsOrCol) {
          val = "매끄러운 알루미늄 실험대 데이터 vs 거친 나무 실험대 데이터";
        } else if (isChemistryOrReact) {
          val = "정규 반응 촉매 투입 용액군 vs 자연 무촉매 화학 반응 용액군";
        } else if (isEarthOrClimate) {
          val = "유엔 기후 협약 적극 가입 국가들 vs 소극적 기후 기피 국가들";
        } else if (isSurveyOrStat) {
          val = "스마트폰 과의존 학생 표본 vs 하루 1시간 미만 사용 학생 표본";
        } else if (isPureMath) {
          val = "1차 테일러 급수 근사 함수 vs 실제 비선형 삼각함수 그래프";
        } else {
          val = `${mainKw} 대조군과 실험군 비교 집단`;
        }
      } else if (s === "독립 요인") {
        if (isDrawingOrArt) {
          val = "화면을 내려다보거나 올려다보는 각도 (0도 ~ 60도)";
        } else if (isInfectionOrBio) {
          val = "마스크 착용 의무 기간과 자율 착용 기간의 비교";
        } else if (isFinanceOrSeq) {
          val = "할인 쿠폰이나 캐시백을 주는 금액대 (1만 원 ~ 5만 원)";
        } else if (isPhysicsOrCol) {
          val = "고무줄을 뒤로 당긴 거리 (5센티미터 ~ 20센티미터)";
        } else if (isChemistryOrReact) {
          val = "반응 온도의 조작 변동 레벨 (10도 / 30도 / 50도)";
        } else if (isEarthOrClimate) {
          val = "산림 면적의 보존/황폐화 연도별 시점 구분";
        } else if (isSurveyOrStat) {
          val = "스마트폰 전면 금지 규정 적용 학교군 여부";
        } else if (isPureMath) {
          val = "함수 미분 연속성 검증 좌표 축 이동 방향";
        } else {
          val = `${mainKw}의 서로 다른 대조 요인 조건`;
        }
      } else if (s === "측정 항목") {
        if (isDrawingOrArt) {
          val = "그림의 시각적 안정감에 대한 만족도 설문 (1점 ~ 5점)";
        } else if (isInfectionOrBio) {
          val = "하루 동안 열이 난 학생 수 (0명 ~ 10명)";
        } else if (isFinanceOrSeq) {
          val = "특정 기간 동안 새로 방문한 고객 수 (10명 ~ 100명)";
        } else if (isPhysicsOrCol) {
          val = "압력 센서에 기록된 가장 큰 압력 (10뉴턴 ~ 100뉴턴)";
        } else if (isChemistryOrReact) {
          val = "초당 기체 거품 발생량 (분당 5회 ~ 50회)";
        } else if (isEarthOrClimate) {
          val = "대기 정밀 측정 지점 탄소 검출 수치 (ppm)";
        } else if (isSurveyOrStat) {
          val = "하루 평균 숙면 소요 시간 (3시간 ~ 8시간)";
        } else if (isPureMath) {
          val = "도함수 연산값 및 극대 극소 좌표 실수값";
        } else {
          val = `${subKw}에 관한 설문 만족도 리커트 척도 (1점 ~ 5점)`;
        }
      } else {
        val = `${s} (예시 값/범위)`;
      }
      result[s] = val;
    });

    return result;
  },



  validateThemeCurriculum: function (subject, theme) {
    const text = theme.toLowerCase();
    
    // 1. 고등학교 교육과정 이탈 개념 (대학 수학/과학 등) 필터
    const outOfScopeTerms = [
      { term: "대수적 군론", name: "대수적 군론 (Group Theory)" },
      { term: "군론", name: "군론 (Group Theory)" },
      { term: "point group", name: "점군 (Point Group)" },
      { term: "wallpaper group", name: "벽지군 (Wallpaper Group)" },
      { term: "symmetry group", name: "대칭군 (Symmetry Group)" },
      { term: "대칭 그룹", name: "대칭군 (Symmetry Group)" },
      { term: "환론", name: "환론 (Ring Theory)" },
      { term: "추상 대수학", name: "추상 대수학 (Abstract Algebra)" },
      { term: "추상대수학", name: "추상 대수학 (Abstract Algebra)" },
      { term: "복소 평면", name: "복소평면 (Complex Plane)" },
      { term: "복소평면", name: "복소평면 (Complex Plane)" },
      { term: "오일러 공식", name: "오일러 공식 (Euler's Formula - 고급 기하/해석학)" },
      { term: "디오판토스", name: "디오판토스 방정식 (정수론)" },
      { term: "정수론", name: "정수론 (Number Theory - 일반 고교 대수 외 범위)" },
      { term: "힐 암호", name: "힐 암호 (Hill Cipher - 대학 선형대수학 행렬 연산)" },
      { term: "행렬 대수", name: "행렬 대수 (Matrix Algebra - 현재 일반 고교 교육과정 외)" },
      { term: "행렬대수", name: "행렬 대수 (Matrix Algebra - 현재 일반 고교 교육과정 외)" }
    ];

    for (let item of outOfScopeTerms) {
      if (text.includes(item.term.toLowerCase())) {
        return {
          status: "warning",
          message: `해당 주제는 고교 교육과정 범위 외 대학 수준의 개념인 [${item.name}]을 포함하고 있습니다. 생활기록부 기재 시 법적 위반 경고 또는 기재 불인정 대상이 될 수 있으므로 수정을 강력 권장합니다.`
        };
      }
    }

    // 2. 고등학교 교육과정 정규 매핑 검증
    const lowerSub = subject.toLowerCase();
    
    if (lowerSub.includes("대수") || lowerSub.includes("수학1") || lowerSub.includes("수학i")) {
      const mathTerms = ["지수", "로그", "삼각함수", "수열", "사인", "코사인", "등차", "등비", "귀납", "드로잉", "서사", "수열", "비율"];
      const matched = mathTerms.filter(t => text.includes(t));
      
      if (matched.length > 0) {
        return {
          status: "success",
          message: `고등학교 '대수(수학Ⅰ)' 교육과정의 핵심 내용요소인 [${matched[0]}] 단원과 완벽하게 정합하는 훌륭한 탐구 주제입니다.`
        };
      } else {
        return {
          status: "warning",
          message: `이 주제는 고등학교 '대수' 과목의 핵심내용(지수, 로그, 삼각함수, 수열 등) 중 어느 단원과 연계되는지 명확하지 않습니다. 생활기록부 기재를 위해 핵심 단원 개념어가 드러나게 주제명을 보완해 주세요.`
        };
      }
    }

    if (lowerSub.includes("물리")) {
      const physTerms = ["운동량", "충격량", "역학", "에너지", "뉴턴", "가속도", "속도", "힘", "전자기", "파동", "양자", "열역학"];
      const matched = physTerms.filter(t => text.includes(t));
      
      if (matched.length > 0) {
        return {
          status: "success",
          message: `고등학교 '물리학' 교육과정의 핵심 성취기준 내용요소인 [${matched[0]}] 단원과 완벽하게 정합하는 훌륭한 탐구 주제입니다.`
        };
      }
    }

    if (lowerSub.includes("화학")) {
      const chemTerms = ["반응 속도", "반응속도", "촉매", "평형", "몰", "화학식", "원소", "결합", "중화", "산화", "환원", "용액", "상태"];
      const matched = chemTerms.filter(t => text.includes(t));
      
      if (matched.length > 0) {
        return {
          status: "success",
          message: `고등학교 '화학' 교육과정의 핵심 성취기준 내용요소인 [${matched[0]}] 단원과 완벽하게 정합하는 훌륭한 탐구 주제입니다.`
        };
      }
    }

    if (lowerSub.includes("생명과학")) {
      const bioTerms = ["세포", "물질대사", "물질 대사", "항상성", "호르몬", "신경", "유전", "염색체", "생태계", "상호작용"];
      const matched = bioTerms.filter(t => text.includes(t));
      
      if (matched.length > 0) {
        return {
          status: "success",
          message: `고등학교 '생명과학' 교육과정의 핵심 성취기준 내용요소인 [${matched[0]}] 단원과 완벽하게 정합하는 훌륭한 탐구 주제입니다.`
        };
      }
    }

    if (lowerSub.includes("지구과학") || lowerSub.includes("통합과학")) {
      return {
        status: "success",
        message: `선택하신 '${subject}' 교과의 성취기준 및 단원 학습목표에 부합하는 탐구 주제입니다.`
      };
    }

    return {
      status: "success",
      message: `고등학교 교육과정 범위 내의 개념들을 적절히 탐구하는 융합 주제입니다.`
    };
  }
};
