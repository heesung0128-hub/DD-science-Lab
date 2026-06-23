/**
 * Antigravity 보고서 출력 엔진 (PDF 프리뷰 & 다운로드 및 JSON 내보내기) - 기초형 (4단계 대응)
 */

const PDFExport = {
  /**
   * 전체 4단계 보고서 데이터를 받아와 인쇄용 HTML 프리뷰 모달을 생성합니다.
   */
  openPreview: function (report) {
    // 기존 프리뷰 모달이 있으면 제거
    const existing = document.getElementById("pdf-preview-modal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "pdf-preview-modal";
    modal.className = "pdf-modal-overlay";

    const subjectInfo = report.step_1?.교과목 
      ? `[${report.step_1.교과목.교과}] ${report.step_1.교과목.분류} - ${report.step_1.교과목.과목명}`
      : "미선택";

    const typeLabel = EXPLORATION_TYPES.find(t => t.id === report.step_2?.탐구유형)?.label || "미선택";
    const typeIcon = EXPLORATION_TYPES.find(t => t.id === report.step_2?.탐구유형)?.icon || "📝";

    modal.innerHTML = `
      <div class="pdf-modal-container">
        <div class="pdf-modal-header no-print">
          <h2>📄 학술 보고서 인쇄 및 내보내기 프리뷰</h2>
          <div class="pdf-modal-actions">
            <button class="btn btn-primary" onclick="window.print()">
              🖨️ PDF 저장 / 인쇄하기
            </button>
            <button class="btn btn-secondary" onclick="PDFExport.downloadJson()">
              📥 교사용 수동 핸드오프 (JSON)
            </button>
            <button class="btn btn-close-modal" onclick="PDFExport.closePreview()">
              닫기
            </button>
          </div>
        </div>

        <div class="pdf-preview-body printable-area">
          <!-- 학술 표지 페이지 (Page 1) -->
          <div class="academic-page cover-page">
            <div class="academic-badge">주제탐구 보고서 (기초형)</div>
            <h1 class="academic-title">${report.step_2?.선택_주제 || "주제가 설정되지 않은 탐구 보고서"}</h1>
            <div class="academic-sub-title">${typeIcon} ${typeLabel} 유형을 통한 수학·과학 탐구 보고서</div>
            
            <div class="cover-meta-table">
              <div class="meta-row">
                <div class="meta-label">교과목</div>
                <div class="meta-val">${subjectInfo}</div>
              </div>
              <div class="meta-row">
                <div class="meta-label">교육과정</div>
                <div class="meta-val">${report.metadata?.교육과정_버전 === "v2022" ? "2022 개정 교육과정" : "2015 개정 교육과정"}</div>
              </div>
              <div class="meta-row">
                <div class="meta-label">인적 정보</div>
                <div class="meta-val">${report.step_1?.학년 || "-"}학년 | ${report.step_1?.계열 || "-"} 계열 | 진로: ${report.step_1?.진로 || "-"}</div>
              </div>
              <div class="meta-row">
                <div class="meta-label">제출자</div>
                <div class="meta-val">${report.student_name || "미기입"} (${report.student_id || "학번미기입"})</div>
              </div>
              <div class="meta-row">
                <div class="meta-label">작성일</div>
                <div class="meta-val">${new Date().toLocaleDateString("ko-KR")}</div>
              </div>
            </div>
            
            <div class="cover-footer">본 보고서는 학습 보조 AI Antigravity와의 주도적인 협동 탐구를 통해 작성되었습니다.</div>
          </div>

          <!-- 본문 페이지 (Page 2: Flowing Page) -->
          <div class="academic-page body-page">
            <h2 class="academic-section-title">Ⅰ. 탐구 기본 정보 및 주제</h2>
            <div class="academic-box">
              <h3>1. 흥미 영역 및 희망 분야</h3>
              <p><strong>흥미 영역:</strong> ${report.step_1?.흥미영역 || "미작성"}</p>
              <p><strong>희망 진로 및 학과:</strong> ${report.step_1?.진로 || "미작성"} (${report.step_1?.학과 || "미작성"} 지망)</p>
            </div>
            
            <div class="academic-box">
              <h3>2. 주제 선정 및 탐구 유형</h3>
              <p><strong>핵심 키워드:</strong> ${(report.step_2?.키워드 || []).join(", ") || "미작성"}</p>
              <p><strong>선택된 탐구 유형:</strong> ${typeLabel} (${typeIcon})</p>
              <p><strong>최종 탐구 주제:</strong> ${report.step_2?.선택_주제 || "미작성"}</p>
              <p><strong>탐구 선정 배경 동기:</strong> ${report.step_2?.동기 || "미작성"}</p>
            </div>

            <h2 class="academic-section-title">Ⅱ. 탐구 방법 설계</h2>
            <div class="academic-box">
              <h3>1. 탐구 절차 및 설계 방법</h3>
              <p>${(report.step_5?.절차_방법 || "미작성").replace(/\n/g, "<br>")}</p>
            </div>
            <div class="academic-box">
              <h3>2. 탐구 도구 및 준비 자료</h3>
              <p>${(report.step_5?.도구_자료 || "미작성").replace(/\n/g, "<br>")}</p>
            </div>
            ${report.step_5?.신뢰성_타당성 ? `
            <div class="academic-box">
              <h3>3. 신뢰성 및 타당성 확보 방안</h3>
              <p>${report.step_5.신뢰성_타당성.replace(/\n/g, "<br>")}</p>
            </div>
            ` : ""}

            <h2 class="academic-section-title">Ⅲ. 수행 및 결과 관찰</h2>
            <div class="academic-box">
              <h3>1. 자료 수집 내역</h3>
              <p>${(report.step_6?.자료_수집 || "미작성").replace(/\n/g, "<br>")}</p>
            </div>
            <div class="academic-box">
              <h3>2. 자료 처리 및 정량 분석 과정</h3>
              <p>${(report.step_6?.자료_처리_분석 || "미작성").replace(/\n/g, "<br>")}</p>
            </div>
            <div class="academic-box highlight-box">
              <h3>3. 핵심 수치 기록 및 유의 관찰 사항</h3>
              <p>${(report.step_6?.핵심_수치_관찰 || "미작성").replace(/\n/g, "<br>")}</p>
            </div>

            <h2 class="academic-section-title">Ⅳ. 최종 결론 및 고찰</h2>
            <div class="academic-box">
              <h3>1. 사실 정리 (실측 결과 요약)</h3>
              <p>${(report.step_7?.사실_정리 || "미작성").replace(/\n/g, "<br>")}</p>
            </div>
            
            <div class="academic-box highlight-box">
              <h3>2. 최종 종합 결론</h3>
              <p>${(report.step_7?.가설_검증?.최종_결론 || "미작성").replace(/\n/g, "<br>")}</p>
            </div>

            ${report.step_7?.한계_후속 ? `
            <div class="academic-box">
              <h3>3. 한계점 및 향후 후속 탐구 과제</h3>
              <p>${report.step_7.한계_후속.replace(/\n/g, "<br>")}</p>
            </div>
            ` : ""}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    document.body.classList.add("modal-open");
    
    // 다운로드할 JSON 데이터를 윈도우 객체 전역에 바인딩
    window.currentReportJson = report;
  },

  /**
   * 프리뷰 닫기
   */
  closePreview: function () {
    const modal = document.getElementById("pdf-preview-modal");
    if (modal) modal.remove();
    document.body.classList.remove("modal-open");
  },

  /**
   * 보고서 데이터 JSON 내보내기 다운로드
   */
  downloadJson: function () {
    if (!window.currentReportJson) return;
    const r = window.currentReportJson;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(r, null, 2));
    const downloadAnchor = document.createElement("a");
    
    const name = r.student_name ? r.student_name.replace(/\s+/g, "") : "학생";
    const id = r.student_id ? r.student_id.replace(/\s+/g, "") : "학번";
    const filename = `antigravity_handoff_${name}_${id}.json`;
      
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", filename);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }
};
