/**
 * 스마트 학생/교사용 RAG Hybrid Retrieval 검색 엔진
 * 메타데이터 필터링 + 키워드 매칭 가중치 + 코사인 유사도 시뮬레이션의 하이브리드 통합 검색 수행
 */

const RAGEngine = {
  /**
   * 학생 보고서 기반 RAG 검색 실행
   * @param {Object} report 학생 8단계 보고서 데이터 객체
   * @param {number} topK 상위 반환 후보 수 (기본값: 5)
   */
  retrieveContext: function (report, topK = 5) {
    if (!report || !report.step_1) return [];

    const grade = parseInt(report.step_1.학년) || 1;
    const subjectGroup = report.step_1.교과목?.교과 || "과학";
    const curriculumVersion = report.metadata?.교육과정_버전 || "v2022";

    // 1. 1차 메타데이터 필터링 (교과 계열, 적용 학년, 교육과정 버전)
    const candidates = CURRICULUM_DB.filter(c => {
      // 교과 계열 매핑 (수학/과학)
      const subjectMatch = c.교과 === subjectGroup;
      // 적용 학년 포함 여부
      const gradeMatch = c.학년_적용.includes(grade);
      // 교육과정 버전 일치 여부
      const versionMatch = c.교육과정_버전 === curriculumVersion;

      return subjectMatch && gradeMatch && versionMatch;
    });

    // 만약 필터링된 후보가 없다면, 교과 대분류만 일치하는 전수 후보를 대상으로 탐색
    const searchPool = candidates.length > 0 ? candidates : CURRICULUM_DB.filter(c => c.교과 === subjectGroup);

    // 2. 보고서 핵심 분석 텍스트 결합 (3, 4, 5, 7단계 - 핵심 탐구 내용)
    const reportText = [
      report.step_3?.동기 || "",
      report.step_3?.목적 || "",
      report.step_3?.핵심질문 || "",
      report.step_4?.가설 || "",
      report.step_4?.근거 || "",
      JSON.stringify(report.step_4?.변수 || {}),
      report.step_5?.절차_방법 || "",
      report.step_5?.도구_자료 || "",
      report.step_5?.신뢰성_타당성 || "",
      report.step_7?.사실_정리 || "",
      report.step_7?.가설_검증?.근거 || "",
      report.step_7?.가설_검증?.최종_결론 || ""
    ].join(" ").toLowerCase();

    // 3. 각 후보 레코드별 통합 점수 산출
    const scoredCandidates = searchPool.map(element => {
      // A. 관련 키워드 오버랩 점수 (Keyword Overlap Score - 가중치 0.3)
      let matchedKeywords = [];
      element.관련_키워드.forEach(kw => {
        if (reportText.includes(kw.toLowerCase())) {
          matchedKeywords.push(kw);
        }
      });
      const keywordScore = element.관련_키워드.length > 0 ? matchedKeywords.length / element.관련_키워드.length : 0;

      // B. 유사 코사인 벡터 거리 시뮬레이션 (Semantic Jaccard / Cosine Sim - 가중치 0.7)
      // 내용요소, 성취기준 텍스트, 탐구활동 예시를 병합하여 문서 본문화
      const elementBody = [
        element.영역,
        element.내용요소,
        ...element.성취기준.map(s => s.내용),
        ...element.관련_탐구활동_예시
      ].join(" ").toLowerCase();

      const simScore = this.calculateTextSimilarity(reportText, elementBody);

      // C. 통합 결합 점수 계산
      const combinedScore = (0.7 * simScore) + (0.3 * keywordScore);

      return {
        element,
        score: combinedScore,
        matchedKeywords,
        simScore,
        keywordScore
      };
    });

    // 4. 점수 높은 내림차순 정렬 및 상위 K개 반환 (매핑 품질 보장을 위해 점수 0.05 이상만 추천)
    return scoredCandidates
      .filter(item => item.score > 0.05)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  },

  /**
   * 문자열 간의 유사도를 계산하는 Jaccard 및 토큰 매핑 기반 유틸리티 함수
   */
  calculateTextSimilarity: function (str1, str2) {
    const tokens1 = new Set(str1.split(/[\s,./?!#~@%^&*()_+=\[\]{}|\:;'"<>`\-]+/).filter(t => t.length > 1));
    const tokens2 = new Set(str2.split(/[\s,./?!#~@%^&*()_+=\[\]{}|\:;'"<>`\-]+/).filter(t => t.length > 1));

    if (tokens1.size === 0 || tokens2.size === 0) return 0;

    // 교집합 크기 구하기
    let intersection = 0;
    tokens1.forEach(t => {
      if (tokens2.has(t)) {
        intersection++;
      } else {
        // 고등학교 한국어 음절 유사성 보정을 위해 부분 포함 매칭 지원 (예: '반응속도'와 '속도'의 유효 연결)
        for (let t2 of tokens2) {
          if (t.includes(t2) || t2.includes(t)) {
            intersection += 0.5;
            break;
          }
        }
      }
    });

    // 합집합 크기
    const union = tokens1.size + tokens2.size - intersection;
    return intersection / union;
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { RAGEngine };
}
