/**
 * 교사용 검증 및 안전성 규정(Compliance) 준수 체크 엔진
 * 인용 검증, 자기주장 필터링, 평가요소 진단, 신뢰도 등급화, 인접 개념 의심 검출, 세특 안전체크
 */

const ComplianceEngine = {
  // 자기평가적 주장 및 학생부 기재 금지 자가진술 패턴
  SELF_CLAIM_PATTERNS: [
    /이 (탐구|연구|보고서)는?\s*.*역량을\s*(보여|함양|증명)/,
    /이 (탐구|연구|보고서)는?\s*.*능력을\s*(보여|기름|발휘|향상)/,
    /세특에?\s*(반영|기재)될/,
    /학생부에?\s*(기재|반영)될/,
    /(나|저)는\s*.*을?를?\s*잘\s*(이해|수행|해결)/,
    /본 (탐구|연구)는?\s*.*적합한\s*(주제|활동)/,
    /나의\s*(역량|잠재력|인성)을\s*/,
    /교과\s*세부능력\s*및\s*특기사항/
  ],

  // 학생부 기재 금지 용어 (성적 순위, 외부 사교육, 미래 잠재성 등)
  RANK_TERMS: ["최우수", "수석", "1등", "전교", "Top ", "최상위", "만점자", "수우미양가"],
  EXTERNAL_ACTIVITIES: ["학원", "과외", "사교육", "온라인 강의", "인강", "선행학습", "교외 대회", "올림피아드"],
  SPECULATION_PATTERNS: [
    /미래에는?\s*/,
    /잠재력을?\s*(보여|가지)/,
    /가능성이?\s*매우\s*(높|크)/,
    /노벨상/,
    /세계적\s*(학자|과학자|연구자)/,
    /앞으로의\s*(발전|성장)/
  ],
  FAMILY_PRIVATE: ["부모님", "어머니", "아버지", "부친", "모친", "가정환경", "부모 직업", "사회경제적"],
  ABSTRACT_PRAISE_PATTERNS: [
    /성실하?(고|며|다)\s*열정적/,
    /(매우|아주|굉장히)\s*우수한\s*학생/,
    /훌륭한\s*인성/,
    /(깊은|진정한)\s*학문적\s*열정/,
    /(우수|탁월|뛰어난|훌륭한|성실한|열정적인)\s*학생\s*(임|입니다)/,
    /(우수|탁월|뛰어난|훌륭한)\s*인재\s*(임|입니다)/
  ],

  GUIDELINE_REPLACEMENTS: [
    { regex: /Google\(구글\)|구글|Google/gi, alt: "포털사이트" },
    { regex: /NAVER\(네이버\)|네이버|NAVER/gi, alt: "포털사이트" },
    { regex: /Daum\(다음\)|다음|Daum/gi, alt: "포털사이트" },
    { regex: /Google Classroom\(구글 클래스룸\)|구글\s*클래스룸|Google\s*Classroom/gi, alt: "학습 플랫폼" },
    { regex: /EBS 온라인클래스|EBS\s*온라인\s*클래스/gi, alt: "학습 플랫폼" },
    { regex: /TikTok\(틱톡\)|틱톡|TikTok/gi, alt: "엔터테인먼트 플랫폼" },
    { regex: /Gather Town\(개더타운\)|개더타운|Gather\s*Town/gi, alt: "메타버스 플랫폼" },
    { regex: /ZEPETO\(제페토\)|제페토|ZEPETO/gi, alt: "메타버스 플랫폼" },
    { regex: /miricanvas\(미리캔버스\)|미리캔버스|miricanvas/gi, alt: "디자인 제작 플랫폼" },
    { regex: /mangoboard\(망고보드\)|망고보드|mangoboard/gi, alt: "디자인 제작 플랫폼" },
    { regex: /Canva\(캔바\)|캔바|Canva/gi, alt: "디자인 제작 플랫폼" },
    { regex: /YouTube\(유튜브\)|유튜브|YouTube/gi, alt: "동영상 플랫폼 (또는 동영상 공유 서비스)" },
    { regex: /Vllo\(블로\)|블로|Vllo/gi, alt: "영상 제작 프로그램 (또는 영상 편집 프로그램)" },
    { regex: /Premiere Pro\(프리미어 프로\)|프리미어\s*프로|Premiere\s*Pro/gi, alt: "영상 제작 프로그램 (또는 영상 편집 프로그램)" },
    { regex: /Final Cut Pro\(파이널 컷 프로\)|파이널\s*컷\s*프로|Final\s*Cut\s*Pro/gi, alt: "영상 제작 프로그램 (또는 영상 편집 프로그램)" },
    { regex: /classting\(클래스팅\)|클래스팅|classting/gi, alt: "학습 플랫폼 (또는 클래스관리 도구)" },
    { regex: /YouTuber\(유튜버\)|유튜버|YouTuber/gi, alt: "동영상 크리에이터 (또는 동영상 제공자, 개인 미디어 제작자)" },
    { regex: /KakaoTalk\(카카오톡, 카톡\)|카카오톡|카톡|KakaoTalk|Kakao/gi, alt: "메신저 (또는 메신저 서비스)" },
    { regex: /Instagram\(인스타그램\)|인스타그램|인스타|Instagram/gi, alt: "소셜네트워크서비스" },
    { regex: /Facebook\(페이스북\)|페이스북|페북|Facebook/gi, alt: "소셜네트워크서비스" },
    { regex: /Twitter\(트위터\)|트위터|Twitter/gi, alt: "소셜네트워크서비스" },
    { regex: /LINE\(라인\)|라인|LINE/gi, alt: "소셜네트워크서비스" },
    { regex: /Meta\(메타\)|Meta/gi, alt: "소셜네트워크서비스" },
    { regex: /ifland\(이프랜드\)|이프랜드|ifland/gi, alt: "메타버스 소셜커뮤니케이션서비스" },
    { regex: /Padlet\(패들렛\)|패들렛|Padlet/gi, alt: "온라인 협업 툴 (또는 협업 플랫폼)" },
    { regex: /ThinkerBell\(띵커벨\)|띵커벨|ThinkerBell/gi, alt: "온라인 협업 툴 (또는 협업 플랫폼)" },
    { regex: /Allo\(알로\)|알로|Allo/gi, alt: "온라인 협업 툴 (또는 협업 플랫폼)" },
    { regex: /Google Docs\(구글문서\)|구글문서|구글\s*문서|Google\s*Docs/gi, alt: "온라인 문서 편집기" },
    { regex: /careernet\(커리어넷\)|커리어넷|careernet/gi, alt: "진로정보망 (또는 진로 정보 사이트)" },
    { regex: /majormap\(메이저맵\)|메이저맵|majormap/gi, alt: "진로정보망 (또는 진로 정보 사이트)" },
    { regex: /Holland\(홀랜드\)\s*검사|홀랜드\s*검사|Holland\s*검사/gi, alt: "직업선호도 검사" },
    { regex: /KTX\(케이티엑스\)|케이티엑스|KTX/gi, alt: "초고속 열차" },
    { regex: /SRT\(에스알티\)|에스알티|SRT/gi, alt: "초고속 열차" },
    { regex: /UN\(유엔\)|유엔|UN/gi, alt: "국제기구" },
    { regex: /WHO\(세계 보건 기구\)|세계\s*보건\s*기구|WHO/gi, alt: "국제기구" },
    { regex: /WTO\(세계무역기구\)|세계무역기구|WTO/gi, alt: "국제기구" },
    { regex: /OECD/g, alt: "국제기구" },
    { regex: /IMF/g, alt: "국제기구" },
    { regex: /UNESCO|유네스코/gi, alt: "국제기구" },
    { regex: /IAEA/g, alt: "국제기구" },
    { regex: /NATO/g, alt: "국제기구" },
    { regex: /Zoom\(줌\)|Zoom|줌/gi, alt: "화상 회의" },
    { regex: /MBTI\(엠비티아이\)|엠비티아이|MBTI/gi, alt: "성격유형 검사" },
    { regex: /VR\(브이알\)|브이알|VR/gi, alt: "가상현실" },
    { regex: /AR\(에이알\)|에이알|AR/gi, alt: "증강현실" },
    { regex: /HTML\(에이치티엠엘\)|에이치티엠엘|HTML/gi, alt: "하이퍼텍스트 마크업 언어 (또는 웹 페이지 제작 언어)" },
    { regex: /CSS\(씨에스에스\)|씨에스에스|CSS/gi, alt: "스타일 시트 언어" },
    { regex: /iPad\(아이패드\)|아이패드|iPad/gi, alt: "태블릿PC" },
    { regex: /Galaxy Tab\(갤럭시탭\)|갤럭시탭|갤럭시\s*탭|Galaxy\s*Tab/gi, alt: "태블릿PC" },
    { regex: /chrome book\(크롬북\)|크롬북|chrome\s*book|chromebook/gi, alt: "휴대용 컴퓨터" }
  ],

  /**
   * Module 1: 인용구 존재 여부 검증 (Fuzzy & Exact 교차 분석)
   * @param {string} quote 인용구 텍스트
   * @param {Object} report 학생 보고서
   * @returns {Object} { status: "pass" | "partial" | "fail", confidence: number }
   */
  verifyCitation: function (quote, report) {
    if (!quote || !quote.trim()) return { status: "fail", confidence: 0 };

    // 보고서 모든 텍스트 병합 및 단편화
    const allReportTexts = [];
    for (let stepKey in report) {
      if (stepKey.startsWith("step_")) {
        const step = report[stepKey];
        if (typeof step === "object") {
          for (let fieldKey in step) {
            if (typeof step[fieldKey] === "string") {
              allReportTexts.push(step[fieldKey]);
            }
          }
        }
      }
    }
    const fullText = allReportTexts.join(" ");

    // 1. 정확히 일치하는지 체크
    if (fullText.includes(quote)) {
      return { status: "pass", confidence: 1.0 };
    }

    // 2. Fuzzy 슬라이딩 윈도우 단어 매칭 (철자 미세 불일치 보정)
    const quoteWords = quote.split(/\s+/).filter(w => w.length > 0);
    if (quoteWords.length === 0) return { status: "fail", confidence: 0 };

    let maxMatchRatio = 0;
    const cleanReport = fullText.replace(/[\s,./?!]+/g, " ");

    // 슬라이딩 검색 수행
    const reportWords = cleanReport.split(" ");
    const windowSize = quoteWords.length + 3;

    for (let i = 0; i <= reportWords.length - quoteWords.length; i++) {
      const windowWords = reportWords.slice(i, i + windowSize);
      let matchCount = 0;
      quoteWords.forEach(qw => {
        if (windowWords.some(ww => ww.includes(qw) || qw.includes(ww))) {
          matchCount++;
        }
      });
      const ratio = matchCount / quoteWords.length;
      if (ratio > maxMatchRatio) {
        maxMatchRatio = ratio;
      }
    }

    if (maxMatchRatio > 0.85) {
      return { status: "pass", confidence: maxMatchRatio };
    } else if (maxMatchRatio > 0.50) {
      return { status: "partial", confidence: maxMatchRatio };
    }

    return { status: "fail", confidence: 0 };
  },

  /**
   * Module 2: 학생의 자기평가적 주장 필터링
   * @param {string} text 검증할 텍스트
   */
  isSelfClaim: function (text) {
    if (!text) return false;
    return this.SELF_CLAIM_PATTERNS.some(pattern => pattern.test(text));
  },

  /**
   * Module 3: 성취기준 평가요소 3차원 충족 판정
   */
  checkEvalDimensions: function (report, element, explorationType) {
    const reportText = JSON.stringify(report).toLowerCase();
    
    // 1. 지식·이해: 내용요소 및 키워드가 보고서의 목적/가설 등 상위 설계 부분에 등장하는가
    const knowledgeKeywords = element.관련_키워드 || [];
    const knowledgeDetected = knowledgeKeywords.some(kw => {
      const kwLower = kw.toLowerCase();
      return (report.step_3?.동기 || "").toLowerCase().includes(kwLower) ||
             (report.step_3?.목적 || "").toLowerCase().includes(kwLower) ||
             (report.step_4?.가설 || "").toLowerCase().includes(kwLower);
    });

    // 2. 과정·기능: 탐구설계 분량 및 유형별 데이터 처리 기술 포함
    const procedureLength = (report.step_5?.절차_방법 || "").length;
    const minLength = {
      experiment: 150,
      data_stat: 120,
      modeling: 120,
      survey: 100,
      literature: 100
    }[explorationType] || 100;
    const processDetected = procedureLength >= minLength;

    // 3. 가치·태도: 한계점, 오차 분석, 후속 연구 등 메타 성찰 키워드
    const attitudeIndicators = ["한계", "오차", "보정", "보완", "윤리", "객관성", "신뢰성", "타당성", "협업", "토론"];
    const fullText = (report.step_5?.신뢰성_타당성 || "") + " " + (report.step_7?.한계_후속 || "");
    const matchingIndicators = attitudeIndicators.filter(ind => fullText.includes(ind));
    const valueDetected = matchingIndicators.length >= 2;

    return {
      "지식·이해": knowledgeDetected,
      "과정·기능": processDetected,
      "가치·태도": valueDetected
    };
  },

  /**
   * Module 4: 신뢰도 등급화 (Calibration)
   */
  classifyConfidence: function (signals) {
    if (signals.citationStatus === "fail") {
      return "REJECT";
    }

    // 조건 충족 수 계산
    const evalCount = Object.values(signals.evalDimensions).filter(Boolean).length;

    // 1. ★★★ 등급 (신뢰도 높음)
    if (
      signals.citationStatus === "pass" &&
      !signals.hasSelfClaim &&
      evalCount >= 2 &&
      signals.citationCount >= 2 &&
      signals.matchedKeywordCount >= 3
    ) {
      return "★★★";
    }

    // 2. ★★ 등급 (보통)
    if (
      (signals.citationStatus === "pass" || signals.citationStatus === "partial") &&
      !signals.hasSelfClaim &&
      evalCount >= 1 &&
      signals.citationCount >= 1
    ) {
      return "★★";
    }

    // 3. ★ 등급 (낮음 - 교사 직접 점검 필요)
    if (signals.citationStatus === "pass" || signals.citationStatus === "partial") {
      return "★";
    }

    return "REJECT";
  },

  /**
   * Module 5: 인접 유사 개념과의 혼동/오매핑 방지 감출
   */
  detectAdjacentConceptConfusion: function (candidateElement, report) {
    const subject = candidateElement.과목;
    const sphere = candidateElement.영역;

    // 같은 과목 및 영역의 형제 요소들 추출
    const siblings = CURRICULUM_DB.filter(c => 
      c.과목 === subject && 
      c.영역 === sphere && 
      c.id !== candidateElement.id
    );

    const reportText = JSON.stringify(report).toLowerCase();

    // 현재 후보의 키워드 매칭 개수
    const candidateMatches = (candidateElement.관련_키워드 || []).filter(kw => 
      reportText.includes(kw.toLowerCase())
    ).length;

    // 형제들의 키워드 매칭 검사
    let suspectedSiblings = [];
    siblings.forEach(sib => {
      const sibMatches = (sib.관련_키워드 || []).filter(kw => 
        reportText.includes(kw.toLowerCase())
      ).length;

      // 만약 형제 키워드가 현재 후보보다 1.4배 이상 강하게 매칭될 경우 오매핑 의심
      if (sibMatches > candidateMatches * 1.4 && sibMatches >= 2) {
        suspectedSiblings.push({
          sibling: sib,
          matches: sibMatches
        });
      }
    });

    return {
      confused: suspectedSiblings.length > 0,
      alternatives: suspectedSiblings.map(s => s.sibling)
    };
  },

  /**
   * Module 6: 세특 작성 지침/규정 안전 검증
   * @param {string} text 세특 문장
   * @returns {Object} { passed: boolean, issues: Array<{type, term}> }
   */
  safetyCheck: function (text) {
    const issues = [];
    if (!text) return { passed: true, issues };

    // 1. 성적 및 석차 관련 검증
    this.RANK_TERMS.forEach(term => {
      if (text.includes(term)) {
        issues.push({ type: "성적_순위", term });
      }
    });

    // 2. 외부 사교육 및 교외 활동 검사
    this.EXTERNAL_ACTIVITIES.forEach(term => {
      if (text.includes(term)) {
        issues.push({ type: "사교육_외부활동", term });
      }
    });

    // 3. 과도한 예측 및 미래성 잠재력 평가
    this.SPECULATION_PATTERNS.forEach(pattern => {
      const match = text.match(pattern);
      if (match) {
        issues.push({ type: "과도한_예측", term: match[0] });
      }
    });

    // 4. 가족 사항 및 가정 환경
    this.FAMILY_PRIVATE.forEach(term => {
      if (text.includes(term)) {
        issues.push({ type: "가족_사적정보", term });
      }
    });

    // 5. 알맹이 없는 추상적 극찬 검증
    this.ABSTRACT_PRAISE_PATTERNS.forEach(pattern => {
      const match = text.match(pattern);
      if (match) {
        issues.push({ type: "추상적_미사여구", term: match[0] });
      }
    });

    // 6. 2026학년도 기재 유의어 필터링
    if (this.GUIDELINE_REPLACEMENTS) {
      this.GUIDELINE_REPLACEMENTS.forEach(item => {
        const rx = new RegExp(item.regex.source, "gi");
        const match = text.match(rx);
        if (match) {
          issues.push({ 
            type: "기재_유의어_대체필요", 
            term: match[0], 
            suggestion: item.alt 
          });
        }
      });
    }

    return {
      passed: issues.length === 0,
      issues: issues
    };
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ComplianceEngine };
}
