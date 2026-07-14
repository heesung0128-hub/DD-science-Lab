/**
 * 교사용 AI 매핑 및 세특 문장 생성 엔진
 * Google Gemini API 실시간 연동 지원 + 미입력 시 지능형 지역 시뮬레이션 탑재
 */

const AIEngine = {
  /**
   * 다중 LLM API 호출 래퍼 (Gemini, OpenAI, Claude)
   */
  callLLM: async function (prompt) {
    const provider = localStorage.getItem("active_ai_provider") || "gemini";
    const model = localStorage.getItem("active_ai_model") || (provider === "gemini" ? "gemini-3.5-flash" : provider === "openai" ? "gpt-4o-mini" : "claude-3-5-haiku-20241022");
    
    if (provider === "gemini") {
      const apiKey = localStorage.getItem("gemini_api_key");
      if (!apiKey) {
        throw new Error("Gemini API 키가 등록되지 않았습니다.");
      }
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (!response.ok) {
        throw new Error(`Gemini API 호출 오류: HTTP ${response.status}`);
      }

      const data = await response.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) {
        throw new Error("Gemini API에서 빈 응답이 반환되었습니다.");
      }
      return textResponse.replace(/```json/g, "").replace(/```/g, "").trim();
    }
    
    if (provider === "openai") {
      const apiKey = localStorage.getItem("openai_api_key");
      if (!apiKey) {
        throw new Error("OpenAI API 키가 등록되지 않았습니다.");
      }
      
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API 호출 오류: HTTP ${response.status}`);
      }

      const data = await response.json();
      const textResponse = data.choices?.[0]?.message?.content;
      if (!textResponse) {
        throw new Error("OpenAI API에서 빈 응답이 반환되었습니다.");
      }
      return textResponse.replace(/```json/g, "").replace(/```/g, "").trim();
    }
    
    if (provider === "claude") {
      const apiKey = localStorage.getItem("claude_api_key");
      if (!apiKey) {
        throw new Error("Claude API 키가 등록되지 않았습니다.");
      }
      
      const corsProxy = localStorage.getItem("cors_proxy_url") || "";
      let url = "https://api.anthropic.com/v1/messages";
      if (corsProxy) {
        const cleanProxy = corsProxy.endsWith("/") ? corsProxy : corsProxy + "/";
        url = cleanProxy + url;
      }
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "dangerouslyAllowBrowser": "true"
        },
        body: JSON.stringify({
          model: model,
          max_tokens: 4000,
          messages: [{ role: "user", content: prompt }]
        })
      });

      if (!response.ok) {
        throw new Error(`Claude API 호출 오류: HTTP ${response.status}`);
      }

      const data = await response.json();
      const textResponse = data.content?.[0]?.text;
      if (!textResponse) {
        throw new Error("Claude API에서 빈 응답이 반환되었습니다.");
      }
      return textResponse.replace(/```json/g, "").replace(/```/g, "").trim();
    }
    
    throw new Error("알 수 없는 AI API 공급자 설정입니다.");
  },

  /**
   * Stage 2: RAG 후보내용요소들을 바탕으로 학생 보고서 1차 매핑 (인용문 추출 포함)
   */
  generateMapping: async function (report, candidateElements) {
    const provider = localStorage.getItem("active_ai_provider") || "gemini";
    let apiKey = "";
    if (provider === "gemini") apiKey = localStorage.getItem("gemini_api_key");
    else if (provider === "openai") apiKey = localStorage.getItem("openai_api_key");
    else if (provider === "claude") apiKey = localStorage.getItem("claude_api_key");

    if (!apiKey) {
      // API Key가 없을 시, 지능형 시뮬레이션 모드로 매핑 즉시 생성
      return this.simulateMapping(report, candidateElements);
    }

    const promptText = `당신은 한국 고등학교 학생의 주제탐구 보고서를 2022 개정 교육과정 내용요소와 완벽하게 대조 매핑하는 최상위 학술 분석 AI입니다.

[역할 및 규칙]
1. 학생 보고서를 분석하여, 주어진 후보 내용요소 DB 중 어떤 항목이 이 탐구와 정확하게 결합하는지 검증합니다.
2. 각 매핑 후보에 대해 반드시 학생 보고서에서 '2개 이상의 직접 인용구(citations)'를 원문 그대로 추출하여 근거로 제시해야 합니다. 
3. 인용구는 보고서 본문에 존재해야 하며, 절대로 마음대로 요약(Paraphrase)하거나 창작해서는 안 됩니다. 
4. 각 인용구의 출처 단계(step)와 인용구 텍스트가 추출된 필드명(field)을 명시해야 합니다.
5. 학생이 스스로 "제 역량이 뛰어남을 증명했습니다" 같은 메타적 주장을 쓴 문장은 인용 근거로 채택할 수 없습니다. 실제 분석 사실, 공식, 수치, 방법론만을 근거로 하십시오.
6. 만약 매핑 조건에 충족하는 내용요소가 없다면 빈 배열을 반환하십시오. 억지로 끼워 맞춰 매핑을 남발하면 안 됩니다.

[입력 데이터]
{
  "student_report": ${JSON.stringify(report, null, 2)},
  "candidate_content_elements": ${JSON.stringify(candidateElements.map(c => c.element), null, 2)}
}

[출력 형식]
반드시 추가 서론이나 후론, 마크다운 코드블록(\`\`\`json) 표식 없이 아래의 순수 JSON 구조만 출력하세요.
{
  "mappings": [
    {
      "content_element_id": "매핑된 내용요소 ID",
      "citations": [
        {
          "step": 3,
          "text": "실제 보고서 원문의 텍스트 (그대로 발췌)",
          "field": "필드명(예: 목적, 절차_방법, 사실_정리 등)"
        },
        {
          "step": 5,
          "text": "실제 보고서 원문의 텍스트 (그대로 발췌)",
          "field": "필드명"
        }
      ],
      "evaluation_dimensions": ["지식·이해", "과정·기능", "가치·태도" 중 1~3개 선택],
      "reasoning": "왜 이 교육과정 내용요소가 학생 탐구 내용과 학술적으로 매핑되는지에 대한 교사용 논리적 근거 설명 (1~2줄)"
    }
  ]
}`;

    try {
      const textOutput = await this.callLLM(promptText);
      const parsed = JSON.parse(textOutput);
      return parsed.mappings || [];

    } catch (e) {
      if (apiKey) {
        alert("실시간 AI 매핑 생성 중 오류가 발생했습니다:\n" + e.message + "\n\n로컬 시뮬레이션 데이터로 대체합니다.");
      }
      console.warn("실시간 AI 매핑 오류, 지능형 시뮬레이션 모드로 전환합니다.", e);
      return this.simulateMapping(report, candidateElements);
    }
  },

  /**
   * Stage 4: 교사용 세특 문장 초안 3대 대안 생성 (짧은/표준/풍부)
   */
  generateSetuk: async function (report, mapping) {
    const provider = localStorage.getItem("active_ai_provider") || "gemini";
    let apiKey = "";
    if (provider === "gemini") apiKey = localStorage.getItem("gemini_api_key");
    else if (provider === "openai") apiKey = localStorage.getItem("openai_api_key");
    else if (provider === "claude") apiKey = localStorage.getItem("claude_api_key");

    const element = CURRICULUM_DB.find(c => c.id === mapping.content_element_id);
    
    if (!apiKey || !element) {
      return this.simulateSetuk(report, mapping);
    }

    const promptText = `당신은 20년 이상의 경력을 가진 현직 고등학교 교사이자, 대학 입학사정관의 시선으로 학생의 잠재력을 정확히 포착하는 '교과세특 자동 생성 및 데이터 정제 전문가'입니다.
학부모나 학생이 작성한 '정제되지 않은 탐구 기록(원시 데이터)'을 고등학교 교육과정 및 생활기록부 기재요령에 맞게 실시간으로 문맥을 교정하고 격상시키는 임무를 수행합니다.

[작성 대상 정보]
- 학생 이름: ${report.student_name}
- 희망 진로/계열: ${report.step_1.계열 || "일반 계열"} (${report.step_1.흥미영역 || "일반 영역"})
- 매핑된 교육과정 내용요소: ${element.내용요소} (${element.과목})
- 내용요소 설명: ${element.성취기준.map(s => s.내용).join(" ")}
- 학생 탐구 주제: ${report.step_2.선택_주제}
- 학생 인용 근거 (원시 활동 기록): ${JSON.stringify(mapping.citations, null, 2)}
- 매핑 판정 영역: ${mapping.evaluation_dimensions.join(", ")}

[핵심 미션 - 4대 감점 요인 자동 정제]
원시 데이터의 핵심 소재와 탐구 흐름은 그대로 유지하되, 다음 요인을 실시간으로 수정·보완하십시오.
1. 비문 및 어색한 문장 구조 자동 교정:
   - 인용구 결합 시 비문이 발생하지 않도록 하십시오. (예: '~증대시킨다. 결론을 도출함.' -> '~증대시킨다는 결론을 도출함.')
   - 중복 단어와 부자연스러운 연결 어미를 자연스럽게 정리하십시오.
2. 대학원 수준의 과도한 전문 용어 하향 조정 (신뢰도 확보):
   - 고등학교 수준에서 소화 가능한 학술적 표현으로 담백하게 변경하십시오.
   - 예: '지배 방정식 유도 및 정립' -> '수학적 모델 수립 및 공식 유도'
   - 예: '파라미터 추정 효율성 증대' -> '모델의 파라미터 값 추정 및 데이터 분석의 정확도 향상'
3. 템플릿 흔적 및 불필요한 기호 제거:
   - '1단계', '2단계'와 같은 목차형 표현이나 절차용 특수 기호를 완전히 배제하십시오.
   - 하나의 유기적인 줄글 문맥으로 이어지도록 흐름을 재구성하십시오.

[🚫 기재요령 기반 필수 제약 사항 (Strict Rules)]
0. 결과물 본문 내용에 굵은 글씨(**...**)는 절대 적용하지 마십시오.
1. 가운데 점(·), 특수문자, 괄호( )는 절대 사용하지 마십시오. (예: '수업(프로젝트) 참여도' -> '수업 프로젝트 참여도'로 대체)
2. 모든 인용부호는 작은따옴표(' ')로 통일합니다.
3. 학생의 실제 성명(예: 홍길동)은 생활기록부에 기재할 수 없으며, '학생은', '학생이' 같은 주어 대명사 역시 문장마다 반복해 기입할 필요가 전혀 없습니다. 주어를 철저히 생략한 서술 형식으로 작성해 주십시오.
4. 성적 석차 및 등급 관련 단어 절대 금지 ("최우수", "수석", "1등", "전교", "Top ", "최상위", "만점자").
5. 외부 사교육 명칭 및 교외 활동 언급 절대 금지 ("학원", "과외", "사교육", "인강", "선행학습", "교외대회").
6. 미래 잠재력의 과도한 주관적 예측 절대 금지 ("미래에는 ~할 것임", "노벨상을 받을", "훌륭한 과학자가 될 잠재력").
7. 학생의 사적인 가정환경, 부모 직업 언급 절대 금지.
8. 구체적 행위 근거가 없는 추상적 미사여구 및 인성 칭찬 절대 금지 ("성실하고 열정적인 학생임", "훌륭한 인성을 가짐").
9. 나이스(NEIS) 입력 오류 방지를 위해, 콜론(:), 등호(=), 단위/물리 기호(%, dB, ℃), 첨자(R²) 등 모든 수학/단위 기호 및 특수문자 사용을 금지하고 '퍼센트', '데시벨', '도', '결정계수' 등으로 소리 나는 한글로 풀어 서술하십시오.

[작성 가이드]
- 서술 시점 및 어미: 현재 시점의 교사 관찰 중심으로 서술하며, 종결형 어미와 매력적 서술어를 조합하여 작성합니다. (예: ~하여 제안함, ~을 통해 진단함, ~으로 재구성함)
- 구체성 확보: 단순한 칭찬이나 추상적인 표현은 배제하고, 반드시 [언제, 어떤 상황에서, 어떤 구체적 행동을 통해, 무엇을 배웠는지]가 드러나도록 인과관계 기반으로 작성하십시오.
- 자연스러움: 동일한 서술어나 표현이 반복되지 않도록 다양성을 확보하고, AI가 작성한 티가 나지 않도록 인간적이고 자연스러운 문체를 구사하십시오.
- 매력적 서술어 활용 가이드 (상황에 맞춰 자연스럽게 분산 배치하고, 중복/남용하지 마십시오):
  * 탐구 활동: 질문함, 진단함, 분석함, 탐색함, 발견함, 도출함
  * 창의적 사고: 재구성함, 변환함, 설정함, 기획함, 개선함, 구현함
  * 소통·협업: 공감을 끌어냄, 제안함, 섭외함, 연락함, 연결함
  * 문제해결: 정의함, 적용함, 해결함, 개선함, 구현함

[출력 형식]
반드시 마크다운 코드블록 표식 없이 아래의 순수 JSON 구조만 출력하십시오.
{
  "variants": [
    {
      "length": "short",
      "text": "50~80자 내외의 핵심적이고 콤팩트한 세특 요약 문장 (괄호, 가운데점, 특수문자, 굵은글씨 절대 없음)",
      "characters": 0
    },
    {
      "length": "standard",
      "text": "100~130자 내외의 보편적인 분량의 성취 기준 연계형 세특 문장 (괄호, 가운데점, 특수문자, 굵은글씨 절대 없음)",
      "characters": 0
    },
    {
      "length": "rich",
      "text": "170~220자 내외의 탐구 역량과 자료 해석, 가치 태도가 풍성하게 서술된 세특 문장 (괄호, 가운데점, 특수문자, 굵은글씨 절대 없음)",
      "characters": 0
    }
  ],
  "metadata": {
    "evaluation_dimensions_covered": ${JSON.stringify(mapping.evaluation_dimensions)}
  }
}`;

    try {
      const textOutput = await this.callLLM(promptText);
      const parsed = JSON.parse(textOutput);
      
      // 글자 수 세팅 후 반환
      parsed.variants.forEach(v => {
        if (report.student_name && report.student_name.length > 1) {
          const nameRegex = new RegExp(report.student_name, 'g');
          v.text = v.text.replace(nameRegex, "학생");
        }
        // 금지 기호 및 수학 기호 강제 한글화 클리닝 적용
        v.text = ComplianceEngine.cleanSentenceStructures(v.text);
        v.text = ComplianceEngine.cleanForbiddenSymbols(v.text);
        v.characters = v.text.length;
      });
      return parsed;

    } catch (e) {
      if (apiKey) {
        alert("실시간 AI 세특 초안 생성 중 오류가 발생했습니다:\n" + e.message + "\n\n로컬 모의 시뮬레이션 데이터로 대체합니다.");
      }
      console.warn("세특 AI 실시간 생성 실패, 시뮬레이션 모드로 전환합니다.", e);
      return this.simulateSetuk(report, mapping);
    }
  },

  /**
   * API Key가 없는 상태이거나 API 호출이 실패할 때 동작하는 정밀 지역 시뮬레이션 매핑 알고리즘
   */
  simulateMapping: function (report, candidateElements) {
    const reportText = JSON.stringify(report);
    const mappings = [];

    // RAG 후보 레코드들을 순회하며 각 과목 유형에 최적화된 모의 추출 수행
    candidateElements.forEach(cand => {
      const el = cand.element;
      let citations = [];
      let reasoning = "";
      let dimensions = ["지식·이해"];

      if (el.id === "sci-physics-momentum-01-v2022" && reportText.includes("마찰이 통제된 일차원 에어트랙")) {
        citations = [
          {
            step: 3,
            text: "마찰이 통제된 일차원 에어트랙 위에서 서로 다른 질량을 가진 수레들의 탄성/비탄성 충돌 실험을 세팅하고 포토게이트 센서로 속도를 실측함으로써 실제 운동량이 물리적으로 상호 보존됨을 정량적으로 증명하는 것을 목적으로 합니다.",
            field: "목적"
          },
          {
            step: 5,
            text: "튕겨 나간 수레들이 광센서를 지날 때의 시간을 정밀 측정하여 속도를 역산 기록한다.",
            field: "절차_방법"
          }
        ];
        dimensions.push("과정·기능");
        reasoning = "에어트랙의 준-무마찰 상태에서 수레 충돌 전후 속도를 포토게이트로 관찰하고 정량적으로 계산하여 운동량 보존 공식을 검증함.";
      } else if (el.id === "sci-chemistry-rate-01-v2022" && reportText.includes("과산화수소(H2O2) 용액에 무기 촉매")) {
        citations = [
          {
            step: 3,
            text: "과산화수소(H2O2) 용액에 무기 촉매인 MnO2와 감자 즙 속 생체 효소인 카탈레이스를 각각 농도별로 투입한 후, 발생하는 산소 기체의 부피를 시간에 따라 측정하여 초기 반응 속도 상수 k값을 유도함으로써 반응 매커니즘을 구체화하는 데 목적이 있습니다.",
            field: "목적"
          },
          {
            step: 6,
            text: "이산화망가니즈는 60도에서 반응 속도가 가장 빨랐으나(R = 4.2 mL/s), 감자즙 효소는 40도에서 최대치(R = 3.5 mL/s)를 보인 후 60도 조건에서는 R = 0.2 mL/s 수준으로 거의 분해 작용이 중단되는 뚜렷한 실측 오차 극단 반응 관찰함.",
            field: "핵심_수치_관찰"
          }
        ];
        dimensions.push("과정·기능");
        reasoning = "과산화수소의 촉매 분해 조건(온도, 촉매 유형)에 따른 기체 발생률을 측정하고 반응 속도 상수를 정밀 연산함.";
      } else if (el.id === "math-algebra-log-01-v2022" && reportText.includes("소음 데시벨(dB) 데이터를 수집하고")) {
        citations = [
          {
            step: 3,
            text: "소음 데시벨(dB) 데이터를 수집하고, 수집된 자료를 로그 함수 모델인 dB = a - 20*log10(R) 수식에 대입하여 실제 소음 감소 계수 R과의 기하학적 매칭 일치도를 증명하는 것입니다.",
            field: "목적"
          },
          {
            step: 6,
            text: "실제 이격 거리가 2배씩 커지는 등비수열 구간에서 데시벨 감소 폭이 각각 6.4dB, 5.8dB, 6.2dB, 6.2dB를 보이며 평균 6.15dB 감쇄를 기록함. 이론값인 6.02dB와 단 2.15%의 편차로 매우 일치함을 관찰함.",
            field: "핵심_수치_관찰"
          }
        ];
        dimensions.push("과정·기능");
        reasoning = "거리 증가에 따른 음압 감소 폭을 실측하여 상용로그를 바탕으로 하는 소음 데시벨 스케일과 구면파 감쇠 모델을 대조 검증함.";
      } else {
        // 기본 텍스트 추출 매칭
        citations = this.extractDynamicCitations(report, el);
        dimensions.push("과정·기능");
        reasoning = `교과 성취기준에 명시된 ${el.내용요소} 개념과 학생이 수집한 로우 데이터 간의 교차적 인과 분석 및 탐구 절차 매칭을 확인함.`;
      }

      mappings.push({
        content_element_id: el.id,
        citations,
        evaluation_dimensions: dimensions,
        reasoning
      });
    });

    return mappings;
  },

  /**
   * 로컬 모의 세특 문장 초안 3대 대안 템플릿 생성기
   */
  simulateDynamicSetuk: function (report, mapping) {
    const element = CURRICULUM_DB.find(c => c.id === mapping.content_element_id) || { 내용요소: "교과 성취기준", 과목: report.step_1?.교과목?.과목명 || "교과" };
    const topic = report.step_2?.선택_주제 || "자유 탐구";
    const course = report.step_1?.교과목?.과목명 || element.과목 || "교과";
    
    // Extract key sentences from student report fields
    const procedure = report.step_5?.절차_방법 || "";
    const observation = report.step_6?.핵심_수치_관찰 || "";
    const conclusion = report.step_7?.가설_검증?.최종_결론 || report.step_7?.사실_정리 || "";
    
    const cleanSentence = (text) => {
      if (!text) return "";
      const sentences = String(text).trim().split(/[.?!]\s+/);
      return (sentences[0] || text).trim();
    };

    const shortProc = cleanSentence(procedure) || "스스로 설계한 탐구 계획";
    const shortObs = cleanSentence(observation) || "탐구 수행 과정 중 유의미한 관찰 수치";
    const shortConclusion = cleanSentence(conclusion) || "탐구를 통해 유도한 유효한 과학적 사실";

    // Clean student name just in case it is in extracted sentences
    const studentName = report.student_name || "";
    const cleanText = (txt) => {
      if (!txt) return "";
      if (studentName) {
        return txt.replace(new RegExp(studentName, 'g'), "학생");
      }
      return txt;
    };

    const cleanObs = cleanText(shortObs);
    const cleanProc = cleanText(shortProc);
    const cleanConclusion = cleanText(shortConclusion);

    const ensureDot = (txt) => {
      if (!txt) return "";
      const trimmed = txt.trim();
      return trimmed.endsWith('.') ? trimmed : trimmed + '.';
    };

    const safeObs = ensureDot(cleanObs);
    const safeProc = ensureDot(cleanProc);
    const safeConclusion = ensureDot(cleanConclusion);

    const short = `학생은 '${topic}' 탐구에서 ${element.내용요소} 원리를 분석함. 탐구 과정에서 ${safeObs} 이를 토대로 유의미한 결론을 도출함.`;
    
    const standard = `학생은 ${course} 수업과 연계하여 '${topic}' 탐구를 자율 설계함. ${element.내용요소} 개념을 토대로 ${safeProc} 이후 ${safeObs} 이 분석 결과를 바탕으로 결론을 도출하여 우수한 학술적 탐구 능력을 입증함.`;
    
    const rich = `학생은 평소 관심이 깊던 ${course} 단원의 핵심 이론을 실생활 문제와 결합하여 '${topic}'이라는 주제로 탐구를 수행함. ${element.내용요소}의 이론적 배경을 토대로 ${safeProc} 이와 같은 체계적인 설계를 바탕으로 데이터를 획득한 후, 분석을 거쳐 ${safeObs} 탐구 결과를 종합하여 ${safeConclusion} 결론을 도출함. 탐구 한계를 성찰하고 후속 방향까지 스스로 모색하는 등 자기주도적 탐구 태도가 매우 돋보임.`;

    return { short, standard, rich };
  },

  extractDynamicCitations: function (report, element) {
    const citations = [];
    const possibleFields = [
      { step: 2, field: "동기", text: report.step_2?.동기 },
      { step: 2, field: "선택_주제", text: report.step_2?.선택_주제 },
      { step: 3, field: "동기", text: report.step_3?.동기 },
      { step: 3, field: "목적", text: report.step_3?.목적 },
      { step: 3, field: "핵심질문", text: report.step_3?.핵심질문 },
      { step: 4, field: "가설", text: report.step_4?.가설 },
      { step: 4, field: "근거", text: report.step_4?.근거 },
      { step: 5, field: "절차_방법", text: report.step_5?.절차_방법 },
      { step: 5, field: "도구_자료", text: report.step_5?.도구_자료 },
      { step: 5, field: "신뢰성_타당성", text: report.step_5?.신뢰성_타당성 },
      { step: 6, field: "자료_수집", text: report.step_6?.자료_수집 },
      { step: 6, field: "자료_처리_분석", text: report.step_6?.자료_처리_분석 },
      { step: 6, field: "핵심_수치_관찰", text: report.step_6?.핵심_수치_관찰 },
      { step: 7, field: "사실_정리", text: report.step_7?.사실_정리 },
      { step: 7, field: "최종_결론", text: report.step_7?.가설_검증?.최종_결론 },
      { step: 7, field: "한계_후속", text: report.step_7?.한계_후속 }
    ];

    // Filter fields that are actually present and have reasonable length
    const validFields = possibleFields.filter(f => f.text && String(f.text).trim().length > 5);

    if (validFields.length >= 2) {
      for (let i = 0; i < Math.min(3, validFields.length); i++) {
        const vf = validFields[i];
        const textVal = String(vf.text).trim();
        const sentences = textVal.split(/[.?!]\s+/);
        let citationText = (sentences[0] || textVal).trim();
        if (citationText.length > 5) {
          citations.push({
            step: vf.step,
            text: citationText,
            field: vf.field
          });
        }
      }
    } else if (validFields.length === 1) {
      const vf = validFields[0];
      const textVal = String(vf.text).trim();
      const sentences = textVal.split(/[.?!]\s+/);
      sentences.forEach(s => {
        const cleanS = s.trim();
        if (cleanS.length > 5 && citations.length < 2) {
          citations.push({
            step: vf.step,
            text: cleanS,
            field: vf.field
          });
        }
      });
    }

    if (citations.length < 2) {
      citations.push({
        step: 2,
        text: report.step_2?.선택_주제 || "자유 탐구",
        field: "선택_주제"
      });
      citations.push({
        step: 1,
        text: report.step_1?.교과목?.과목명 || "통합과학",
        field: "과목명"
      });
    }

    return citations.slice(0, 2);
  },

  simulateSetuk: function (report, mapping) {
    const element = CURRICULUM_DB.find(c => c.id === mapping.content_element_id);
    const reportText = JSON.stringify(report);
    const topic = report.step_2.선택_주제 || "자유 탐구";
    const courseName = report.step_1?.교과목?.과목명 || element.과목 || "대수";
    
    let short = "";
    let standard = "";
    let rich = "";

    const hasPhysics = element.id === "sci-physics-momentum-01-v2022" && reportText.includes("에어트랙");
    const hasChemistry = element.id === "sci-chemistry-rate-01-v2022" && reportText.includes("카탈레이스");
    const hasMath = element.id === "math-algebra-log-01-v2022" && (reportText.includes("소음") || reportText.includes("데시벨"));

    if (hasPhysics) {
      short = `에어트랙 수레 충돌 실험에서 질량 조합 및 충돌 종류별 속도 변화를 포토게이트 센서로 실측하고 운동량 보존 법칙을 정량 규명함.`;
      standard = `${courseName} 과목에 흥미가 깊은 학생으로, '${topic}'을 주제로 일차원 에어트랙 수레 충돌 실험을 자율 설계함. 포토게이트 센서로 획득한 충돌 전후 시간 데이터를 활용해 수레들의 최종 속도를 역산하고, 총 운동량 보존을 평균 이점육오 퍼센트 오차 범위 내에서 입증하며 수리 역학적 분석력이 우수함을 보여줌.`;
      rich = `물리학에 대한 학구열이 매우 뚜렷한 학생으로, '${topic}'을 탐구 과제로 삼아 에어트랙 장비를 활용하여 정밀 구동함. 포토게이트의 시간 해상도 한계를 버니어캘리퍼스로 직접 물리적 교정 세팅하고, 수레 질량비 조건별 일 대 일 혹은 일 대 이 및 탄성 여부에 따른 총 열 번의 로우 데이터를 엑셀 수식에 대입하여 일차원 역학계 내 운동량 보존 상태를 완벽히 정량화함. 송풍기 공기 불균일에 따른 오차를 스스로 관찰하고 후속으로 이차원 카메라 트래킹 분석까지 모색하는 등 메타인지적 문제해결력과 실험 설계 역량이 탁월함.`;
    } else if (hasChemistry) {
      short = `이산화망가니즈와 카탈레이스 효소 촉매가 과산화수소 분해 반응 속도에 미치는 영향을 산소 포집 실측을 통해 정량적으로 대조 입증함.`;
      standard = `${courseName} 교과 및 화학적 변화와 생체 대사에 관심이 많아 '${topic}'을 탐구함. 과산화수소에 무기 촉매 이산화망가니즈와 감자즙 생체 효소를 온도별로 차등 투여하여 기체 발생 부피를 가스 주사기로 십 초 단위 정밀 기록함. 온도가 상승할 때 무기 촉매와 생체 효소의 활성 격차 변화율을 분자 구조 변성 원리로 규명하며 탐구 역량이 뛰어남.`;
      rich = `'${topic}'에 관한 체계적인 실험 연구를 주도적으로 실시함. 화학 실험대 위에서 기체 누출 에러를 방지하고자 접합부에 실리콘 그리스 코팅을 보강하는 등 세심함을 발휘함. 이십 도, 사십 도, 육십 도 환경에서 무기 촉매와 카탈레이스의 활성을 교차 분석하여, 생체 단백질 촉매가 육십 도에서 기질 결합 구조 변성으로 작용 중단됨을 초당 영점이 밀리리터의 수치로 도출함. 아레니우스 충돌 이론과 미카엘리스-멘텐 모델 연구를 후속 대안으로 제시하는 등 화학 지식 이해 깊이와 분석 집요함이 탁월함.`;
    } else if (hasMath) {
      short = `거리 이격에 따른 소음 감쇄를 스마트 측정하여 데시벨 값의 상용로그 함수 비례 모델을 정확하게 수학적으로 규명함.`;
      standard = `${courseName} 시간에 배운 상용로그의 실생활 쓰임에 매료되어 '${topic}' 탐구를 설계함. 학교 운동장에 팔십 데시벨 지향성 음원을 설정하고 이의 거듭제곱 수열 거리에 따른 데시벨 수치를 스마트 미터기로 실측함. 음압 소실 비율과 인간 인지 데시벨 척도 간의 상용로그 함수적 규칙성을 평균 육점일오 데시벨 감소로 증명하여 학술적 수학 모델링 능력이 탁월함.`;
      rich = `교과서에서 배운 지수 및 로그 이론을 현실의 물리 현상과 접목시키는 융합적 수학 탐구 능력이 돋보임. '${topic}'을 위해 조용한 일요일 새벽을 택해 운동장 외벽 소리 반사 한계 요인을 자체 배제하고, 일 미터에서 십육 미터까지의 등비 거리별 데시벨 데이터를 수집함. 실측된 수치들을 로그 회귀 수식 모델에 대입하여 이론값인 육점영이 데시벨과 이점일오 퍼센트 오차율로 정확히 일치함을 수학적으로 증명함. 수학적 개념이 어떻게 현실 데이터를 해석하는 기틀이 되는지 체득하여 자료 해석과 융합 추론 역량이 극히 탁월함.`;
    } else {
      const dynamicSetuk = this.simulateDynamicSetuk(report, mapping);
      short = dynamicSetuk.short;
      standard = dynamicSetuk.standard;
      rich = dynamicSetuk.rich;
    }

    // Defensive replacement of student name in all simulated variants
    const studentName = report.student_name || "";
    if (studentName && studentName.length > 1) {
      const nameRegex = new RegExp(studentName, 'g');
      short = short.replace(nameRegex, "학생");
      standard = standard.replace(nameRegex, "학생");
      rich = rich.replace(nameRegex, "학생");
    }

    // 금지 기호 및 단위 기호 클리닝 필터 전격 가동
    short = ComplianceEngine.cleanSentenceStructures(short);
    short = ComplianceEngine.cleanForbiddenSymbols(short);
    standard = ComplianceEngine.cleanSentenceStructures(standard);
    standard = ComplianceEngine.cleanForbiddenSymbols(standard);
    rich = ComplianceEngine.cleanSentenceStructures(rich);
    rich = ComplianceEngine.cleanForbiddenSymbols(rich);

    return {
      variants: [
        { length: "short", text: short, characters: short.length },
        { length: "standard", text: standard, characters: standard.length },
        { length: "rich", text: rich, characters: rich.length }
      ],
      metadata: {
        evaluation_dimensions_covered: mapping.evaluation_dimensions
      }
    };
  },

  /**
   * 요약 데이터 정제 및 세특 변환 기능 (AI 전용 API 호출)
   */
  refineSetuk: async function (rawText) {
    const provider = localStorage.getItem("active_ai_provider") || "gemini";
    let apiKey = "";
    if (provider === "gemini") apiKey = localStorage.getItem("gemini_api_key");
    else if (provider === "openai") apiKey = localStorage.getItem("openai_api_key");
    else if (provider === "claude") apiKey = localStorage.getItem("claude_api_key");

    if (!apiKey) {
      return this.simulateRefineSetuk(rawText);
    }

    const promptText = `당신은 학부모나 학생이 작성한 '활동 요약본' 또는 '정제되지 않은 탐구 기록'을 입력받아, 고등학교 교육과정(교과세특 기재요령)에 맞게 실시간으로 문맥을 교정하고 격상시키는 세특 데이터 가공 전문가입니다.

사용자가 제공한 원시 데이터의 핵심 소재와 탐구 흐름은 그대로 유지하되, 다음 [4대 감점 요인]을 실시간으로 탐지하여 자동으로 수정·보완한 뒤 최종 완성형 세특 문장만 출력하십시오.

[4대 감점 요인 및 수정 방향]
1. 비문 및 어색한 문장 구조 자동 교정:
   - 오류 예시: ~증대시킨다. 결론을 도출함. / ~분석하여 도출된 결정 계수 결정계수 값을
   - 수정 방향: 연결 어미를 자연스럽게 잇고, 중복 단어를 제거합니다.
   - 교정 결과: ~증대시킨다는 결론을 도출함 / ~분석하여 도출된 결정계수 값을
2. 대학원 수준의 과도한 전문 용어 하향 조정 (신뢰도 확보):
   - 오류 예시: 지배 방정식 유도 및 정립, 파라미터 추정 효율성 증대 등
   - 수정 방향: 고등학교 교육과정(수학I, 수학II, 고급수학 등) 수준에서 소화 가능한 학술적 표현으로 담백하게 변경합니다.
   - 교정 결과: 수학적 모델 수립 및 공식 유도, 모델의 파라미터 값 추정 및 데이터 분석의 정확도 향상 등
3. 템플릿 흔적 및 불필요한 기호 제거:
   - 오류 예시: '1단계', '2단계'와 같은 목차형 표현 제거
   - 수정 방향: 하나의 유기적인 줄글 문맥으로 이어지도록 흐름을 재구성합니다.

[🚫 기재요령 기반 필수 제약 사항 (Strict Rules)]
- 결과물 본문 내용에 굵은 글씨(**...**)는 절대 사용하지 마십시오.
- 가운데 점(·), 특수문자, 괄호( )는 절대 사용 금지하며, 문장 내 모든 인용구는 작은따옴표(' ')로 통일합니다.
- 어미 처리: 문장의 끝은 항상 매력적인 명사형 종결 어미로 마칩니다. (~ 분석함, ~ 도출함, ~ 제안함, ~ 해결함)

[원시 데이터]
${rawText}

[출력 형식]
인사말, 안내 문구, 프롬프트의 지시사항, 혹은 마크다운 코드블록 표식 등을 모두 제외하고, 오직 나이스(NEIS) 시스템에 즉시 복사·붙여넣기 할 수 있는 최종 세특 본문 텍스트(한 줄글 덩어리)만 출력하십시오.`;

    try {
      const textOutput = await this.callLLM(promptText);
      let cleaned = textOutput.replace(/\`\`\`markdown/gi, "").replace(/\`\`\`html/gi, "").replace(/\`\`\`/g, "").trim();
      cleaned = ComplianceEngine.cleanSentenceStructures(cleaned);
      cleaned = ComplianceEngine.cleanForbiddenSymbols(cleaned);
      return cleaned;
    } catch (e) {
      console.error("세특 정제 API 호출 오류:", e);
      throw e;
    }
  },

  simulateRefineSetuk: function (rawText) {
    if (!rawText) return "";
    let cleaned = rawText;
    
    // 1단계, 2단계 등의 템플릿 목차형 표현 제거
    cleaned = cleaned.replace(/\b[1-8]\s*(단계|Step)\s*:?\s*/g, "");
    
    // 중복어구 제거 (결정 계수 결정계수 -> 결정계수)
    cleaned = cleaned.replace(/결정\s*계수\s*결정계수/g, "결정계수");
    cleaned = cleaned.replace(/결정계수\s*결정계수/g, "결정계수");
    
    // 지배 방정식 -> 수학적 모델식 (전문 용어 하향 조정)
    cleaned = cleaned.replace(/지배\s*방정식/g, "수학적 모델식");
    
    // 슬래시(/) 등의 제한 기호 제거
    cleaned = cleaned.replace(/물리\/수학적\s*공식/g, "물리 수학적 공식");
    cleaned = cleaned.replace(/\//g, " 및 ");
    
    // 비문 교정 (~증대시킨다. 결론을 도출함. -> ~증대시킨다는 결론을 도출함.)
    cleaned = cleaned.replace(/증대시킨다\.\s*결론을\s*도출함/g, "증대시킨다는 결론을 도출함");
    cleaned = cleaned.replace(/시킨다\.\s*결론을\s*도출함/g, "시킨다는 결론을 도출함");
    
    // 기본적인 치환 및 문장구조 필터 적용
    cleaned = ComplianceEngine.cleanSentenceStructures(cleaned);
    cleaned = ComplianceEngine.cleanForbiddenSymbols(cleaned);
    return cleaned;
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { AIEngine };
}
