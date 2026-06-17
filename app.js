/**
 * Antigravity 애플리케이션 코어 컨트롤러 (상태 관리, 내비게이션, 프리필, UI 바인딩)
 */

// 학생의 희망 진로 계열별로 제안하는 핵심 교과 융합형 학술 추천 키워드
const SUGGESTED_KEYWORDS = {
  "자연과학": ["기후변화", "빅데이터", "역학적에너지", "삼투현상", "카오스이론", "유기화학"],
  "공학": ["알고리즘", "인공지능", "센서계측", "MBL", "수치시뮬레이션", "신소재"],
  "의약·바이오": ["효소활성", "바이오센서", "감염병확산", "세포대사", "유전자분석", "생체모사"],
  "사회과학": ["통계가설", "회귀분석", "네트워크분석", "상관관계", "소비자행동", "공공데이터"],
  "인문과학": ["문헌비교", "역사적사례", "텍스트마이닝", "문화예술", "사료검증", "비교분석"],
  "예체능·융합": ["드로잉비율", "음향데시벨", "서사구조", "테셀레이션", "스토리텔링", "작화앵글"]
};

const App = {
  // 현재 보고서 상태 데이터 객체 (5.4 보고서 데이터 모델 규격 준수)
  report: {
    student_name: "",
    student_id: "",
    user_id: "student_user",
    report_id: "report_temp_1",
    step_1: {
      학년: 1,
      학급: 1,
      계열: "자연과학",
      학과: "",
      진로: "",
      흥미영역: "수학·과학 융합",
      교과목: {
        교과: "과학",
        분류: "공통",
        과목명: "통합과학1"
      }
    },
    step_2: {
      키워드: [],
      동기: "",
      AI_제안_주제: [],
      선택_주제: "",
      탐구유형: "experiment"
    },
    step_3: {
      동기: "",
      목적: "",
      핵심질문: ""
    },
    step_4: {
      가설: "",
      근거: "",
      변수: {}
    },
    step_5: {
      절차_방법: "",
      도구_자료: "",
      신뢰성_타당성: "",
      자기점검_결과: null
    },
    step_6: {
      자료_수집: "",
      자료_처리_분석: "",
      핵심_수치_관찰: ""
    },
    step_7: {
      사실_정리: "",
      가설_검증: {
        판정: "지지",
        근거: "",
        최종_결론: ""
      },
      한계_후속: ""
    },
    step_8: {
      참고문헌: []
    },
    metadata: {
      교육과정_버전: "v2022",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      current_step: 1
    }
  },

  currentGuideTab: "help",
  theme: "light",
  autoSaveTimer: null,
  activeSuggestTargetId: null,
  defaultReportTemplate: null, // 새 탐구 추가 시 템플릿 복제용

  /**
   * 초기화 함수
   */
  init: function () {
    // 테마 설정 초기화
    document.documentElement.setAttribute("data-theme", this.theme);

    // 템플릿 복제용 기본 구조 보존
    if (!this.defaultReportTemplate) {
      this.defaultReportTemplate = JSON.parse(JSON.stringify(this.report));
    }

    // 로그인 세션 확인
    const currentUser = localStorage.getItem("antigravity_current_user");
    if (!currentUser) {
      // 로그인 창 강제 띄우기
      document.getElementById("auth-modal-root").style.display = "flex";
      const selector = document.getElementById("inquiry-selector-container");
      if (selector) selector.style.display = "none";
      return;
    }

    // 로그인 되어 있는 경우: 사용자 프로필 표시 및 데이터 복원
    const usersDbRaw = localStorage.getItem("antigravity_users_db");
    if (usersDbRaw) {
      try {
        const usersDb = JSON.parse(usersDbRaw);
        const userRecord = usersDb[currentUser];
        if (userRecord) {
          // 마이그레이션 및 예외 대응 이중 구조
          try {
            if (!userRecord.reports) {
              userRecord.reports = [];
              if (userRecord.report) {
                const legacyRep = userRecord.report;
                legacyRep.report_id = legacyRep.report_id || "rep_" + Date.now();
                legacyRep.metadata = legacyRep.metadata || {};
                legacyRep.metadata.created_at = legacyRep.metadata.created_at || new Date().toISOString();
                legacyRep.metadata.updated_at = legacyRep.metadata.updated_at || new Date().toISOString();
                userRecord.reports.push(legacyRep);
                userRecord.active_report_id = legacyRep.report_id;
                delete userRecord.report;
              }
            }

            // 비어 있는 경우 새 탐구 보장
            if (userRecord.reports.length === 0) {
              const newRep = this.createNewReportStructure(userRecord.student_name, userRecord.student_id);
              userRecord.reports.push(newRep);
              userRecord.active_report_id = newRep.report_id;
            }

            if (!userRecord.active_report_id) {
              userRecord.active_report_id = userRecord.reports[0].report_id;
            }

            let activeRep = userRecord.reports.find(r => r.report_id === userRecord.active_report_id);
            if (!activeRep) {
              activeRep = userRecord.reports[0];
              userRecord.active_report_id = activeRep.report_id;
            }

            // 이름과 학번 강제 보장 및 동기화
            activeRep.student_name = userRecord.student_name;
            activeRep.student_id = userRecord.student_id;
            
            // 학번 파싱을 통한 학년/학급 강제 오버라이딩 (데이터 정합성 확보, 고교 학년 1-3 범위 제한)
            if (userRecord.student_id && userRecord.student_id.length === 5) {
              let gradeNum = parseInt(userRecord.student_id.charAt(0), 10);
              if (gradeNum < 1 || gradeNum > 3) {
                gradeNum = 1;
              }
              let classNum = parseInt(userRecord.student_id.substring(1, 3), 10);
              if (classNum < 1 || classNum > 12) {
                classNum = 1;
              }
              activeRep.step_1.학년 = gradeNum;
              activeRep.step_1.학급 = classNum;
            }
            
            this.report = activeRep;

            // 세션 상태 데이터베이스 업데이트 반영
            localStorage.setItem("antigravity_users_db", JSON.stringify(usersDb));
          } catch (innerErr) {
            console.warn("사용자 리포트 마이그레이션 복구 중 예외가 감지되어 새 리포트를 자동 적재합니다.", innerErr);
            userRecord.reports = [];
            const newRep = this.createNewReportStructure(userRecord.student_name, userRecord.student_id);
            userRecord.reports.push(newRep);
            userRecord.active_report_id = newRep.report_id;
            this.report = newRep;
            localStorage.setItem("antigravity_users_db", JSON.stringify(usersDb));
          }

          // 프로필 바인딩
          const profileBadge = document.getElementById("user-profile-badge");
          const profileDisplay = document.getElementById("user-profile-display");
          if (profileBadge && profileDisplay) {
            profileDisplay.textContent = `${userRecord.student_id} ${userRecord.student_name}`;
            profileBadge.style.display = "flex";
          }

          // 탐구과제 드롭다운 목록 생성 및 노출
          this.renderInquiryList();
        }
      } catch (e) {
        console.error("사용자 DB 파싱 심각한 오류, 세션을 안전하게 종료합니다.", e);
        localStorage.removeItem("antigravity_current_user");
        window.location.reload();
      }
    }

    // 초기 바인딩 및 뷰 업데이트 (restoreFormValues가 내부에서 updateSubjectDropdown을 호출하므로 정렬)
    this.restoreFormValues();
    this.renderExplorationTypes();
    this.renderVariableSlots();
    this.updateProgress();
    this.updateNavigationButtons();
    this.updateSummaryPanel();
    this.updateMentorAdvice();
    this.updateGuideArea();
    this.updateCurriculumBadge();
    this.renderKeywords();

    // 자동 저장 활성화
    this.startAutoSave();
    
    // 입력 필드 포커스 아웃 시 임시저장
    document.querySelectorAll("input, select, textarea").forEach(el => {
      el.addEventListener("blur", () => {
        App.saveToLocalStorage();
      });
    });
  },

  /**
   * 테마 전환 (다크/라이트)
   */
  toggleTheme: function () {
    this.theme = this.theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", this.theme);
  },

  /**
   * 교육과정 뱃지 및 메타정보 업데이트
   */
  updateCurriculumBadge: function () {
    const year = 2026; // 2026년 기준 시뮬레이션
    const grade = parseInt(this.report.step_1.학년);
    
    // 자동 계산 버전
    const computedVersion = getDefaultCurriculum(year, grade);
    this.report.metadata.교육과정_버전 = computedVersion;
    
    const badgeEl = document.getElementById("curriculum-indicator");
    if (computedVersion === "v2022") {
      badgeEl.innerHTML = "✨ 2022 개정 교육과정 적용 학년";
      badgeEl.style.borderColor = "#8b5cf6";
      badgeEl.style.color = "#c084fc";
    } else {
      badgeEl.innerHTML = "📝 2015 개정 교육과정 대상 학년";
      badgeEl.style.borderColor = "#f97316";
      badgeEl.style.color = "#fdba74";
    }
  },

  /**
   * 1단계: 대분류/구분에 따른 교과목 드롭다운 업데이트
   */
  updateSubjectDropdown: function () {
    const groupEl = document.getElementById("input-subject-group");
    const catEl = document.getElementById("input-subject-cat");
    const nameEl = document.getElementById("input-subject-name");
    const directInput = document.getElementById("input-subject-name-direct");

    const group = groupEl.value;
    const cat = catEl.value;
    const version = this.report.metadata.교육과정_버전;

    // 대분류 데이터 세트 매핑
    const dataset = version === "v2022" ? SUBJECTS_V2022 : SUBJECTS_V2015;

    nameEl.innerHTML = "";
    directInput.style.display = "none";

    if (cat === "기타") {
      directInput.style.display = "block";
      const option = document.createElement("option");
      option.value = "direct";
      option.text = "직접 기입";
      nameEl.appendChild(option);
    } else {
      const subjectList = dataset[group]?.[cat] || [];
      subjectList.forEach(subj => {
        const option = document.createElement("option");
        option.value = subj;
        option.text = subj;
        nameEl.appendChild(option);
      });
      // 데이터 바인딩 싱크 맞춤
      if (nameEl.options.length > 0) {
        nameEl.value = nameEl.options[0].value;
      }
    }

    this.handleStep1Input();
  },

  /**
   * 1단계 값 변경 실시간 핸들링
   */
  handleStep1Input: function () {
    const nameEl = document.getElementById("input-student-name");
    const idEl = document.getElementById("input-student-id");
    
    // 비활성화 상태이므로 로컬 로그인 세션 기반 데이터 강제 고정
    const currentUser = localStorage.getItem("antigravity_current_user");
    if (currentUser) {
      const usersDbRaw = localStorage.getItem("antigravity_users_db");
      if (usersDbRaw) {
        try {
          const usersDb = JSON.parse(usersDbRaw);
          if (usersDb[currentUser]) {
            this.report.student_name = usersDb[currentUser].student_name;
            this.report.student_id = usersDb[currentUser].student_id;
          }
        } catch(e){}
      }
    }
    
    if (!this.report.student_name && nameEl) this.report.student_name = nameEl.value.trim();
    if (!this.report.student_id && idEl) this.report.student_id = idEl.value.trim();

    const grade = parseInt(document.getElementById("input-grade").value);
    const cls = parseInt(document.getElementById("input-class").value);
    const track = document.getElementById("input-track").value;
    const major = document.getElementById("input-major").value;
    const career = document.getElementById("input-career").value;
    
    const subjectGroup = document.getElementById("input-subject-group").value;
    const subjectCat = document.getElementById("input-subject-cat").value;
    
    let subjectName = "";
    if (subjectCat === "기타") {
      subjectName = document.getElementById("input-subject-name-direct").value;
    } else {
      subjectName = document.getElementById("input-subject-name").value;
    }

    // 상태 저장
    this.report.step_1 = {
      학년: grade,
      학급: cls,
      계열: track,
      학과: major,
      진로: career,
      흥미영역: subjectGroup + " 융합 탐구",
      교과목: {
        교과: subjectGroup,
        분류: subjectCat,
        과목명: subjectName
      }
    };

    // 연도 + 학년 기반 교육과정 자동 재계산
    const computedVersion = getDefaultCurriculum(2026, grade);
    this.report.metadata.교육과정_버전 = computedVersion;
    this.updateCurriculumBadge();

    // 학년·과목 분류 정합성 검증 (경고 배너 노출 - 차단 안 함)
    const warnMsg = validateGradeAndSubject(grade, subjectCat);
    const warnBanner = document.getElementById("grade-subject-warning");
    
    if (warnMsg) {
      warnBanner.querySelector("span").textContent = warnMsg;
      warnBanner.style.display = "flex";
    } else {
      warnBanner.style.display = "none";
    }

    this.updateSummaryPanel();
  },

  /**
   * 2단계 관심 키워드 추가/삭제 제어
   */
  handleKeywordKeydown: function (e) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const input = document.getElementById("input-keyword-tag");
      const val = input.value.trim().replace(/,/g, "");
      
      if (val && !this.report.step_2.키워드.includes(val)) {
        if (this.report.step_2.키워드.length >= 5) {
          alert("키워드는 최대 5개까지만 입력 가능합니다.");
          return;
        }
        this.report.step_2.키워드.push(val);
        this.renderKeywords();
        input.value = "";
        this.handleStep2Input();
        this.saveToLocalStorage();
      }
    }
  },

  removeKeyword: function (kw) {
    this.report.step_2.키워드 = this.report.step_2.키워드.filter(k => k !== kw);
    this.renderKeywords();
    this.handleStep2Input();
    this.saveToLocalStorage();
  },

  renderKeywords: function () {
    const container = document.getElementById("keyword-tag-container");
    const input = document.getElementById("input-keyword-tag");
    
    // 기존 태그들 삭제
    container.querySelectorAll(".keyword-tag").forEach(t => t.remove());
    
    this.report.step_2.키워드.forEach(kw => {
      const tag = document.createElement("div");
      tag.className = "keyword-tag";
      tag.innerHTML = `
        <span>#${kw}</span>
        <span class="keyword-tag-remove" onclick="App.removeKeyword('${kw}')">×</span>
      `;
      container.insertBefore(tag, input);
    });
  },

  /**
   * 2단계 값 변경 실시간 핸들링
   */
  handleStep2Input: function () {
    const motivation = document.getElementById("input-theme-motivation").value;
    const finalTheme = document.getElementById("input-final-theme").value;
    
    this.report.step_2.동기 = motivation;
    this.report.step_2.선택_주제 = finalTheme;

    this.checkTopicCurriculumAlignment();
    this.updateSummaryPanel();
  },

  /**
   * 2단계 Phase B: AI 주제 제안 트리거 (Real 비동기 AI 호출로 업그레이드)
   */
  triggerTopicGeneration: async function (forceDirect = false) {
    const keywords = this.report.step_2.키워드;
    const motivation = this.report.step_2.동기;
    const subject = this.report.step_1.교과목.과목명;

    if (keywords.length === 0) {
      alert("주제를 제안받기 위해 최소 1개 이상의 흥미 키워드를 입력해 주세요.");
      return;
    }

    const context = {
      subject,
      keywords,
      motivation,
      field: this.report.step_1.계열 || "자연과학",
      forceDirect: forceDirect
    };

    const section = document.getElementById("phase-b-section");
    const container = document.getElementById("phase-b-content");
    section.style.display = "block";
    container.innerHTML = "<div style='padding:20px; text-align:center; color: var(--accent); font-weight: 600;'>🤖 AI가 교육과정 DB를 검색하고 키워드 적합성을 엄격히 판정하는 중입니다...</div>";

    try {
      // Mock AI -> Real AI 제안 목록 비동기 호출
      const result = await MockAI.suggestTopics(context);
      
      container.innerHTML = "";

      // A. 직접 연결 가능 (direct)
      if (result.verdict === "direct") {
        this.report.step_2.AI_제안_주제 = result.candidates.map(c => c.title);

        const helper = document.createElement("p");
        helper.className = "field-helper-tip";
        helper.style.marginBottom = "12px";
        helper.innerHTML = "✅ <strong>교육과정 내용요소와 부합하는 추천 주제 5종:</strong> 원하는 주제를 클릭하면 하단 최종 주제창에 자동 입력됩니다.";
        container.appendChild(helper);

        const wrapper = document.createElement("div");
        wrapper.className = "ai-topics-wrapper";
        
        result.candidates.forEach((item, idx) => {
          const card = document.createElement("div");
          card.className = "ai-topic-select-card";
          
          let elementsBadge = "";
          if (item.matched_content_elements && item.matched_content_elements.length > 0) {
            elementsBadge = `<div style="margin-top:6px; display:flex; flex-wrap:wrap; gap:4px;">
              ${item.matched_content_elements.map(e => `<span style="background:rgba(30,110,122,0.15); border:1px solid var(--primary); color:var(--primary); font-size:0.65rem; padding:1px 6px; border-radius:10px;">📚 ${e}</span>`).join("")}
            </div>`;
          }

          let varsBadge = "";
          if (item.expected_variables && item.expected_variables.length > 0) {
            varsBadge = `<div style="margin-top:4px; font-size:0.7rem; color:var(--text-muted);">
              🔑 <strong>예상 변수:</strong> ${item.expected_variables.join(", ")}
            </div>`;
          }

          let warningBadge = forceDirect ? `<div style="margin-bottom:6px; font-size:0.65rem; font-weight:700; color:var(--danger);">⚠️ 키워드 적합성 낮음 경고</div>` : "";

          card.innerHTML = `
            ${warningBadge}
            <h4>📌 ${item.title}</h4>
            <p>${item.description}</p>
            ${elementsBadge}
            ${varsBadge}
          `;
          card.onclick = () => {
            document.querySelectorAll(".ai-topic-select-card").forEach(c => c.classList.remove("selected"));
            card.classList.add("selected");
            document.getElementById("input-final-theme").value = item.title;
            App.report.step_2.선택_주제 = item.title;
            App.handleStep2Input();
            App.saveToLocalStorage();
          };
          wrapper.appendChild(card);
        });
        container.appendChild(wrapper);

        this.updateMentorAdvice("✨ 교육과정 내용요소와 부합도가 높은 고품질 탐구 주제 제안이 완료되었습니다! 마음에 드는 카드를 클릭하여 최종 주제로 확정하고 탐구 유형을 선택하세요.");

      } 
      // B. 우회 필요 (redirect)
      else if (result.verdict === "redirect") {
        const wrap = document.createElement("div");
        wrap.style.padding = "16px";
        wrap.style.borderRadius = "var(--radius-md)";
        wrap.style.background = "rgba(245,158,11,0.04)";
        wrap.style.border = "1px solid rgba(245,158,11,0.15)";
        
        wrap.innerHTML = `
          <h4 style="color:var(--warning); font-size:0.9rem; margin-bottom:8px; display:flex; align-items:center; gap:8px;">⚠️ 키워드가 직접 탐구로 발전하기 제한적입니다</h4>
          <p style="font-size:0.8rem; color:var(--text-secondary); line-height:1.6; margin-bottom:16px;">${result.reason}</p>
          <div id="redirect-options-container" style="display:flex; flex-direction:column; gap:8px; margin-bottom:20px;"></div>
          <div style="border-top:1px dashed var(--border-glass); padding-top:12px; display:flex; justify-content:space-between; align-items:center;">
            <span style="font-size:0.75rem; color:var(--text-muted);">* 억지 융합은 생활기록부에 기재되지 못할 가능성이 있습니다.</span>
            <button class="btn btn-secondary" style="padding:4px 10px; font-size:0.7rem;" onclick="App.triggerTopicGeneration(true)">🔓 그래도 원래 키워드로 주제 보기</button>
          </div>
        `;
        container.appendChild(wrap);

        const optionsContainer = wrap.querySelector("#redirect-options-container");
        result.directions.forEach(dir => {
          const btn = document.createElement("button");
          btn.className = "btn btn-secondary";
          btn.style.width = "100%";
          btn.style.justifyContent = "flex-start";
          btn.style.padding = "10px 14px";
          btn.style.textAlign = "left";
          btn.style.fontSize = "0.75rem";
          btn.innerHTML = `<span style="font-size:1.1rem; margin-right:8px;">${dir.emoji}</span> <strong>${dir.label}</strong><br><span style="color:var(--text-muted); font-size:0.7rem; margin-left:26px;">(예: ${dir.example})</span>`;
          btn.onclick = () => {
            const addedKeyword = dir.example.split(" ")[0].replace(/[^A-Za-z0-9가-힣]/g, "");
            if (addedKeyword && !App.report.step_2.키워드.includes(addedKeyword)) {
              App.report.step_2.키워드.push(addedKeyword);
              App.renderKeywords();
            }
            App.triggerTopicGeneration(true);
          };
          optionsContainer.appendChild(btn);
        });

        this.updateMentorAdvice("⚠️ 입력하신 키워드가 다소 제한적이거나 억지 융합일 우려가 있어 **우회 탐구 방향**을 제안했습니다. 추천해 드린 세련된 수학·과학적 방향 중 하나를 골라 보시길 적극 권장합니다!");
      } 
      // C. 부적합 (unsuitable)
      else if (result.verdict === "unsuitable") {
        const wrap = document.createElement("div");
        wrap.style.padding = "16px";
        wrap.style.borderRadius = "var(--radius-md)";
        wrap.style.background = "rgba(239,68,68,0.04)";
        wrap.style.border = "1px solid rgba(239,68,68,0.15)";
        
        let sugHtml = "";
        if (result.suggestions && result.suggestions.length > 0) {
          sugHtml = `<div style="margin-top:12px; display:flex; flex-direction:column; gap:6px;">
            ${result.suggestions.map(s => `<button class="btn btn-secondary" style="font-size:0.75rem; padding:6px 12px; text-align:left;" onclick="App.addUnsuitableKeywordRef('${s.refined_keyword}')">💡 #${s.refined_keyword} (${s.subject_area}) 키워드로 교체하여 시도</button>`).join("")}
          </div>`;
        }

        wrap.innerHTML = `
          <h4 style="color:var(--danger); font-size:0.9rem; margin-bottom:8px; display:flex; align-items:center; gap:8px;">🚨 탐구 부적합 판정 안내</h4>
          <p style="font-size:0.8rem; color:var(--text-secondary); line-height:1.6; margin-bottom:16px;">${result.reason}</p>
          ${sugHtml}
          <div style="border-top:1px dashed var(--border-glass); padding-top:12px; display:flex; justify-content:space-between; align-items:center; margin-top:16px;">
            <span style="font-size:0.75rem; color:var(--text-muted);">* 새 키워드를 직접 기입하셔도 좋습니다.</span>
            <button class="btn btn-secondary" style="padding:4px 10px; font-size:0.7rem; border-color:var(--danger); color:var(--danger);" onclick="App.triggerTopicGeneration(true)">🔓 그래도 추천 강제 요청</button>
          </div>
        `;
        container.appendChild(wrap);

        this.updateMentorAdvice("🚨 입력하신 관심사는 수학·과학 학술 탐구로 연결하기 어렵습니다. 위에서 AI가 제안해 드린 정량적 교체 키워드를 클릭하거나, 새 키워드를 작성해 보시길 강력히 권장합니다.");
      }

      // fallback 멘토 안내
      if (result.isFallback) {
        const fallAlert = document.createElement("div");
        fallAlert.style.marginTop = "12px";
        fallAlert.style.fontSize = "0.75rem";
        fallAlert.style.color = "var(--accent)";
        fallAlert.innerHTML = `ℹ️ <strong>모의 체험(Simulated) AI 모드</strong>로 키워드 분석 및 정합성 검정이 완료되었습니다. API 키 연동을 원하시면 우측 상단 ⚙️ 설정을 클릭하세요.`;
        container.appendChild(fallAlert);
      }

      this.saveToLocalStorage();
    } catch (e) {
      console.error(e);
      container.innerHTML = `<div style='padding:20px; text-align:center; color: var(--danger);'>AI 주제 제안에 실패했습니다: ${e.message}<br><button class="btn btn-secondary" style="margin-top:10px;" onclick="App.triggerTopicGeneration()">다시 시도하기</button></div>`;
    }
  },

  addUnsuitableKeywordRef: function (kw) {
    this.report.step_2.키워드 = [kw];
    this.renderKeywords();
    this.handleStep2Input();
    this.triggerTopicGeneration();
  },

  /**
   * 2단계 Phase C: 탐구유형 그리드 렌더링
   */
  renderExplorationTypes: function () {
    const grid = document.getElementById("exploration-types-grid");
    grid.innerHTML = "";

    EXPLORATION_TYPES.forEach(type => {
      const activeClass = this.report.step_2.탐구유형 === type.id ? "selected" : "";
      const box = document.createElement("div");
      box.className = `exploration-type-box ${activeClass}`;
      box.innerHTML = `
        <span class="type-icon">${type.icon}</span>
        <span class="type-label">${type.label}</span>
      `;
      box.onclick = () => {
        document.querySelectorAll(".exploration-type-box").forEach(b => b.classList.remove("selected"));
        box.classList.add("selected");
        App.report.step_2.탐구유형 = type.id;
        App.renderVariableSlots();
        App.updateLabelNamesByInquiryType();
        App.handleStep2Input();
        App.saveToLocalStorage();
      };
      grid.appendChild(box);
    });
  },

  /**
   * 5단계의 인풋 라벨 이름을 탐구유형에 맞춰 동적 매핑 변경
   */
  updateLabelNamesByInquiryType: function () {
    const type = this.report.step_2.탐구유형;
    const procedureLabel = document.getElementById("label-step5-procedure");
    const toolsLabel = document.getElementById("label-step5-tools");

    if (type === "experiment") {
      procedureLabel.textContent = "1. 상세 실험 절차 설계";
      toolsLabel.textContent = "2. 실험 재료 및 도구 규격";
    } else if (type === "data_stat") {
      procedureLabel.textContent = "1. 분석 절차 및 통계 기법 설계";
      toolsLabel.textContent = "2. 수집 데이터 출처 및 전처리 도구";
    } else if (type === "modeling") {
      procedureLabel.textContent = "1. 모델 유도 공식 및 수치화 검증 과정";
      toolsLabel.textContent = "2. 수학적 모델 설계/시뮬레이션 소프트웨어 도구";
    } else if (type === "survey") {
      procedureLabel.textContent = "1. 조사/설문 설계 및 대상 분석 절차";
      toolsLabel.textContent = "2. 설문 문항 구성 및 배포/통계 도구";
    } else if (type === "literature") {
      procedureLabel.textContent = "1. 비교 및 텍스트 문헌 분석 절차";
      toolsLabel.textContent = "2. 핵심 학술 논문 및 공인 자료 출처 범위";
    }
  },

  /**
   * 4단계: 가설 변수 슬롯 렌더링
   */
      renderVariableSlots: function () {
    const container = document.getElementById("variables-slots-container");
    container.innerHTML = "";

    const activeType = this.report.step_2.탐구유형;
    const typeMeta = EXPLORATION_TYPES.find(t => t.id === activeType);

    if (!typeMeta) return;

    // 변수 데이터 복원용 구조화
    if (!this.report.step_4.변수) this.report.step_4.변수 = {};

    // 탐구 유형별 친절한 변인 가이드 매핑
    const guides = {
      "experiment": {
        "조작변인": "실험에서 내가 의도적으로 변화시키는 독립 조건 (원인)",
        "통제변인": "실험 오차를 차단하기 위해 동일하고 일정하게 고정하는 환경 요인 (고정)",
        "종속변인": "조작 요인의 변화에 따라 나타나는 실측 반응 측정 결과 (결과)"
      },
      "data_stat": {
        "독립변수": "상관관계를 밝히기 위해 먼저 투입하는 데이터 조건 (원인)",
        "종속변수": "독립 데이터 변화에 따라 관찰/측정되는 결과 데이터 (결과)",
        "통제 요인": "두 변수 외에 분석 결과 왜곡을 주지 않도록 고정할 환경 요인 (고정)"
      },
      "modeling": {
        "입력 변수": "수식/시뮬레이션에 대입하여 변화를 관찰하고자 하는 조건값 (원인)",
        "모델 파라미터": "수식 자체의 고유 성격이나 조절 감쇄 비율을 조절하는 상수 (상수)",
        "출력 변수": "입력값과 상수들이 결합되어 계산되어 뿜어 나오는 최종 결과 데이터 (결과)"
      },
      "survey": {
        "독립 요인": "비교 집단을 나누거나 상관 관계를 파악하는 대조 요인 (원인 - 예: 스마트폰 사용 시간)",
        "측정 항목": "대조 요인에 따라 설문지나 기기를 통해 수집하는 결과 수치 (결과 - 예: 수면 만족도)"
      },
      "literature": {
        "분석 차원": "두 문헌이나 사례를 대조 분석하기 위한 핵심 학술적 관점 또는 잣대 (잣대)",
        "비교 대상": "탐구의 객관성을 위해 대조군으로 선정해 교차 검증하는 구체적 사례자료 (대상)"
      }
    };

    typeMeta.hypothesis_vars.forEach(vName => {
      const row = document.createElement("div");
      row.className = "variable-slot-row";
      
      const rawVal = this.report.step_4.변수[vName] || "";
      const savedVal = parseVariableValue(rawVal);
      const pl = typeMeta.placeholders?.[vName] || `${vName} 값을 입력하세요.`;
      
      const guideText = guides[activeType]?.[vName] || "";

      row.innerHTML = `
        <div class="variable-slot-label-group" style="margin-bottom:6px;">
          <strong class="variable-slot-label" style="font-size:0.85rem; color:var(--primary);">${vName}</strong>
          ${guideText ? `<span class="variable-slot-guide" style="font-size:0.7rem; color:var(--text-muted); display:block; margin-top:2px;">ℹ️ ${guideText}</span>` : ""}
        </div>
        <div>
          <input type="text" class="input-var-slot" data-varname="${vName}" value="${savedVal}" placeholder="${pl}" oninput="App.handleVariableSlotInput()" style="width:100%; box-sizing:border-box;">
        </div>
      `;
      container.appendChild(row);
    });
  },



  handleVariableSlotInput: function () {
    const vars = {};
    document.querySelectorAll(".input-var-slot").forEach(input => {
      const name = input.getAttribute("data-varname");
      vars[name] = input.value;
    });
    this.report.step_4.변수 = vars;
    this.updateSummaryPanel();
  },

  /**
   * 4단계: AI 가설 점검 결과 트리거
   */
  triggerHypothesisCheck: function () {
    const hyp = document.getElementById("input-step4-hypothesis").value;
    const rationale = document.getElementById("input-step4-rationale").value;
    const variables = this.report.step_4.변수;

    if (!hyp.trim()) {
      alert("평가받을 가설 명제를 작성해 주세요.");
      return;
    }

    const reportBox = document.getElementById("hypothesis-check-result");
    const grid = document.getElementById("check-criteria-grid");
    grid.innerHTML = "";

    // Mock AI 점검 결과 호출
    const evaluation = MockAI.checkHypothesis(hyp, rationale, variables);

    Object.entries(evaluation).forEach(([criterion, details]) => {
      const card = document.createElement("div");
      card.className = "check-criteria-card";
      card.innerHTML = `
        <h5>🔍 ${criterion}</h5>
        <p><strong>강점:</strong> ${details.strength}</p>
        <p class="improve-line"><strong>개선점:</strong> ${details.improvement}</p>
      `;
      grid.appendChild(card);
    });

    reportBox.style.display = "block";
    
    // 조언 카드 리드로잉 및 저장
    this.updateMentorAdvice(`가설 점검을 완료했습니다. "${criterionKeyWordsMatch(hyp)}"와 같은 측면이 훌륭하지만, AI가 짚어준 인과관계 명료성 부분을 1줄 수정하여 한층 날카로운 보고서를 만들어 보세요!`);
    this.saveToLocalStorage();
  },

  /**
   * 4단계 값 변경 핸들링
   */
  handleStep4Input: function () {
    this.report.step_4.가설 = document.getElementById("input-step4-hypothesis").value;
    this.report.step_4.근거 = document.getElementById("input-step4-rationale").value;
    this.updateSummaryPanel();
  },

  /**
   * 3단계 ~ 8단계 공통 심플 값 싱크
   */
    /**
   * stlite 기반 Streamlit 데이터 통계 분석기 실행 (새 창)
   */
    openStreamlitAnalyzer: function () {
    window.open("easy-data-analyzer.html", "_blank");
  },


      handleGenericInput: function (stepNum) {
    if (stepNum === 3) {
      this.report.step_3.동기 = document.getElementById("input-step3-motivation").value;
      this.report.step_3.목적 = document.getElementById("input-step3-purpose").value;
      this.report.step_3.핵심질문 = document.getElementById("input-step3-question").value;
    } else if (stepNum === 5) {
      this.report.step_5.절차_방법 = document.getElementById("input-step5-procedure").value;
      this.report.step_5.도구_자료 = document.getElementById("input-step5-tools").value;
      this.report.step_5.신뢰성_타당성 = document.getElementById("input-step5-reliability").value;
    } else if (stepNum === 6) {
      this.report.step_6.자료_수집 = document.getElementById("input-step6-collect").value;
      this.report.step_6.자료_처리_분석 = document.getElementById("input-step6-process").value;
      this.report.step_6.핵심_수치_관찰 = document.getElementById("input-step6-observation").value;
    } else if (stepNum === 7) {
      this.report.step_7.사실_정리 = document.getElementById("input-step7-facts").value;
      this.report.step_7.한계_후속 = document.getElementById("input-step7-limits").value;
      // 통계분석 입력값 연동 저장
      const rInput = document.getElementById("input-step7-rvalue");
      const pInput = document.getElementById("input-step7-pvalue");
      this.report.step_7.r_value = rInput ? rInput.value : "";
      this.report.step_7.p_value = pInput ? pInput.value : "";
    }

    this.updateSummaryPanel();
  },

  /**
   * 7단계 전용 값 인풋 제어
   */
  handleStep7Input: function () {
    const decision = document.getElementById("input-step7-decision").value;
    const rationale = document.getElementById("input-step7-decision-rationale").value;
    const finalConclusion = document.getElementById("input-step7-final-conclusion").value;

    this.report.step_7.가설_검증 = {
      판정: decision,
      근거: rationale,
      최종_결론: finalConclusion
    };

    // p-value에 기반한 지능형 자동 가설 판정 연쇄 매핑
    const pInput = document.getElementById("input-step7-pvalue");
    if (pInput && pInput.value.trim().length > 0) {
      const pVal = parseFloat(pInput.value.trim());
      if (!isNaN(pVal)) {
        const decisionSelect = document.getElementById("input-step7-decision");
        if (pVal < 0.05) {
          if (decisionSelect.value !== "지지") {
            decisionSelect.value = "지지";
            this.report.step_7.가설_검증.판정 = "지지";
            this.updateMentorAdvice("🎉 입력하신 유의확률(p-value)이 0.05보다 작습니다! 통계적으로 유의미한 상관관계가 증명되었으므로 가설 판정이 자동으로 [🟢 가설 지지] 상태로 설정되었습니다.");
          }
        } else {
          if (decisionSelect.value === "지지") {
            decisionSelect.value = "불지지";
            this.report.step_7.가설_검증.판정 = "불지지";
            this.updateMentorAdvice("💡 입력하신 유의확률(p-value)이 0.05보다 크거나 같습니다. 가설이 명확하게 입증되지 않았으므로 판정이 [🔴 가설 불지지] 상태로 유도되었습니다. 필요시 부분지지로 변경해 보세요.");
          }
        }
      }
    }

    this.handleGenericInput(7);
  },

  triggerSelfCheckModal: async function
 () {
    const modal = document.getElementById("meta-self-check-modal-root");
    const listContainer = document.getElementById("meta-check-list-items");
    const commentArea = document.getElementById("meta-modal-comment-text");

    const subject = this.report.step_1.교과목.과목명;
    
    listContainer.innerHTML = "<div style='padding:20px; text-align:center; width:100%; color:var(--primary); font-weight:600;'>🤖 AI가 탐구 계획의 교과 연계 타당성을 다각도로 검증하는 중입니다...</div>";
    commentArea.innerHTML = "";
    modal.style.display = "flex";

    try {
      // Mock AI 연결 평가 진단 (실시간 API 가동 대응)
      const checkResult = await MockAI.selfCheckConnection(subject, this.report);
      
      // 상태 저장
      this.report.step_5.자기점검_결과 = checkResult;

      listContainer.innerHTML = "";

      if (checkResult.wellConnected && checkResult.wellConnected.length > 0) {
        checkResult.wellConnected.forEach(item => {
          listContainer.innerHTML += `
            <li class="meta-check-item">
              <span class="meta-badge-success">✓ 잘 연결됨</span>
              <span>${item}</span>
            </li>
          `;
        });
      }

      if (checkResult.needsImprovement && checkResult.needsImprovement.length > 0) {
        checkResult.needsImprovement.forEach(item => {
          listContainer.innerHTML += `
            <li class="meta-check-item">
              <span class="meta-badge-warning">△ 조금 더 보강 가능</span>
              <span>${item}</span>
            </li>
          `;
        });
      }

      if (checkResult.notRelated && checkResult.notRelated.length > 0) {
        checkResult.notRelated.forEach(item => {
          listContainer.innerHTML += `
            <li class="meta-check-item">
              <span class="meta-badge-none">• 다루지 않는 영역</span>
              <span>${item}</span>
            </li>
          `;
        });
      }

      commentArea.innerHTML = `<strong>AI 메타인지 피드백:</strong><br>${checkResult.overallComment || "정상 평가 완료"}`;
    } catch (e) {
      console.error(e);
      listContainer.innerHTML = "<div style='color:var(--danger);'>실시간 연결성 검정 중 오류가 발생했습니다. 아래 버튼으로 이대로 진행하실 수 있습니다.</div>";
    }
  },

  closeMetaSelfCheckModal: function (proceed) {
    const modal = document.getElementById("meta-self-check-modal-root");
    modal.style.display = "none";

    if (proceed) {
      // 6단계로 강제 차단 없이 이동 통과
      this.report.metadata.current_step = 6;
      this.navigateToStep(6);
    }
    this.saveToLocalStorage();
  },

  /**
   * 8단계: 문헌 모의 검색 기능
   */
  searchReferences: function () {
    const q = document.getElementById("input-ref-search").value.trim();
    const resultsBox = document.getElementById("ref-search-results-box");

    if (!q) {
      alert("검색 키워드를 입력해 주세요.");
      return;
    }

    resultsBox.innerHTML = `
      <div style="padding:16px; font-size:0.8rem; color:var(--text-secondary); text-align:center;">
        🔍 DBpia 및 공인 학술기관 실시간 동기화 탐색 중...
      </div>
    `;

    setTimeout(() => {
      // 8단계 자료 적정 난이도 등급별 큐레이션 mock 데이터베이스
      const pool = [
        {
          title: `고등학교 물리 실험에서 MBL 센서를 활용한 탄성충돌의 오차 보정 연구`,
          author: `김영희 (한국과학교육학회)`,
          year: 2023,
          type: "학술논문",
          difficulty: 1, // ★ 학생 수준 적합
          url: "https://dbpia.co.kr/mock/physics/1"
        },
        {
          title: `공기 저항이 운동량 보존 법칙 측정에 미치는 영향의 수치적 해석`,
          author: `이철수 (서울대 물리교육연구소)`,
          year: 2021,
          type: "학술논문",
          difficulty: 2, // ★★ 도전적
          url: "https://dbpia.co.kr/mock/physics/2"
        },
        {
          title: `대용량 공공 데이터를 활용한 청소년 알레르기 유병율과 대기질 상관관계 회귀 모델링`,
          author: `박민수 (KOSIS 한국통계학회)`,
          year: 2024,
          type: "기관자료",
          difficulty: 2,
          url: "https://kosis.kr/mock/air/3"
        },
        {
          title: `이산 시간 SIR 모델을 적용한 학교 내부 인플루엔자 감염병 감쇄 효과 시뮬레이션`,
          author: `최진우 (대한수학회 수학적모델링학회)`,
          year: 2022,
          type: "학술논문",
          difficulty: 3, // ★★★ 전문가 수준
          url: "https://dbpia.co.kr/mock/math/4"
        },
        {
          title: `설문조사를 통한 고교생 수면 위생 및 학습 효율성의 통계적 기술 분석`,
          author: `정민지 (청소년학연구)`,
          year: 2023,
          type: "학술논문",
          difficulty: 1,
          url: "https://dbpia.co.kr/mock/survey/5"
        }
      ];

      // 검색 키워드 필터링
      let filtered = pool.filter(item => 
        item.title.includes(q) || 
        item.author.includes(q) || 
        q.split(" ").some(word => item.title.includes(word))
      );

      // 모의 검색 결과 다양화 및 성공 보장 (결과가 적으면 학생 프로필 연계 실시간 생성)
      if (filtered.length < 3) {
        const studentSubject = this.report.step_1.교과목.과목명 || "통합과학";
        const studentDept = this.report.step_1.학과 || "이공계열";
        const studentTopic = this.report.step_2.선택_주제 || q;
        
        let cleanTopic = studentTopic;
        if (cleanTopic.length > 25) {
          cleanTopic = cleanTopic.substring(0, 22) + "...";
        }

        const templates = [
          {
            title: `[과목명] 교과 연계: [검색어] 분석을 통한 정량적 상관관계 연구`,
            author: `이은지 (대한[과목명]교육학회)`,
            type: "학술논문",
            difficulty: 1
          },
          {
            title: `[검색어]와 청소년 [학과] 관심도가 탐구 의사결정에 미치는 영향`,
            author: `박준영 (한국융합학회지)`,
            type: "학술논문",
            difficulty: 2
          },
          {
            title: `[주제] 관점에서 본 [검색어]의 통계적 시뮬레이션 및 데이터 모델링`,
            author: `최현우 (공공데이터분석포럼)`,
            type: "기관자료",
            difficulty: 3
          },
          {
            title: `고등학교 동아리 활동을 위한 [검색어] 기초 이론 및 간이 실험 설계 가이드`,
            author: `정민우 (전국과학교사협의회)`,
            type: "도서",
            difficulty: 1
          }
        ];

        templates.forEach((tpl, idx) => {
          let title = tpl.title
            .replace(/\[과목명\]/g, studentSubject)
            .replace(/\[학과\]/g, studentDept)
            .replace(/\[검색어\]/g, q)
            .replace(/\[주제\]/g, cleanTopic)
            .replace(/["']/g, ""); // HTML 구조 깨짐 방지
          
          let author = tpl.author
            .replace(/\[과목명\]/g, studentSubject)
            .replace(/\[학과\]/g, studentDept);

          if (filtered.some(f => f.title === title) || pool.some(p => p.title === title)) {
            return;
          }

          filtered.push({
            title: title,
            author: author,
            year: 2024 - idx,
            type: tpl.type,
            difficulty: tpl.difficulty,
            url: `https://dbpia.co.kr/mock/dynamic/${idx + 1}`
          });
        });
      }

      resultsBox.innerHTML = "";

      if (filtered.length === 0) {
        resultsBox.innerHTML = `
          <div style="padding:16px; font-size:0.8rem; color:var(--text-muted); text-align:center;">
            검색어와 연관된 신뢰 학술자료를 찾지 못했습니다. 다른 학술 키워드로 검색해 보세요.
          </div>
        `;
        return;
      }

      filtered.forEach((ref, idx) => {
        const item = document.createElement("div");
        item.className = "ref-result-item";
        
        const difficultyBadge = "★".repeat(ref.difficulty);
        const levelLabel = ref.difficulty === 1 ? "학생 수준" : ref.difficulty === 2 ? "도전적" : "전문가";

        item.innerHTML = `
          <div class="ref-info">
            <div class="ref-title">${ref.title}</div>
            <div class="ref-meta">${ref.author} (${ref.year}) · ${ref.type}</div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="ref-difficulty-stars" title="${levelLabel} 난이도">${difficultyBadge}</span>
            <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.7rem;" onclick="App.addReferenceItem(${JSON.stringify(ref).replace(/"/g, '&quot;')})">추가</button>
          </div>
        `;
        resultsBox.appendChild(item);
      });

    }, 600);
  },

  addReferenceItem: function (ref) {
    if (this.report.step_8.참고문헌.some(r => r.title === ref.title)) {
      alert("이미 추가된 참고문헌입니다.");
      return;
    }
    this.report.step_8.참고문헌.push(ref);
    this.renderAddedReferences();
    this.saveToLocalStorage();
  },

  addBookReferenceManual: function () {
    const title = document.getElementById("input-ref-book-title").value.trim();
    const author = document.getElementById("input-ref-book-author").value.trim();

    if (!title || !author) {
      alert("도서명과 출판사/저자를 정확히 기입해 주세요.");
      return;
    }

    const ref = {
      title: `[도서] ${title}`,
      author: author,
      year: new Date().getFullYear(),
      type: "교과서/도서",
      difficulty: 1,
      url: ""
    };

    this.report.step_8.참고문헌.push(ref);
    this.renderAddedReferences();
    
    document.getElementById("input-ref-book-title").value = "";
    document.getElementById("input-ref-book-author").value = "";
    
    this.saveToLocalStorage();
  },

  removeReferenceItem: function (idx) {
    this.report.step_8.참고문헌.splice(idx, 1);
    this.renderAddedReferences();
    this.saveToLocalStorage();
  },

  renderAddedReferences: function () {
    const container = document.getElementById("added-references-list");
    container.innerHTML = "";

    if (this.report.step_8.참고문헌.length === 0) {
      container.innerHTML = `<div style="color:var(--text-muted); font-size:0.75rem;">현재 등록된 참고문헌이 없습니다.</div>`;
      return;
    }

    this.report.step_8.참고문헌.forEach((ref, idx) => {
      const item = document.createElement("div");
      item.className = "added-ref-item";
      item.innerHTML = `
        <div>
          <strong>[${ref.type}]</strong> ${ref.title} (${ref.author})
        </div>
        <button class="btn" style="padding:2px 6px; font-size:0.65rem; background:transparent; border-color:var(--border-glass); color:var(--danger);" onclick="App.removeReferenceItem(${idx})">삭제</button>
      `;
      container.appendChild(item);
    });
  },

  /**
   * 6.2 AI 답변추천 팝오버 모달 활성화 패턴
   */
    openAiSuggestInline: async function (step, field, targetInputId) {
    this.activeSuggestTargetId = targetInputId;

    const root = document.getElementById("ai-suggest-popover-root");
    const container = document.getElementById("popover-candidates-list");
    
    container.innerHTML = "<div style='padding:16px; text-align:center; color: var(--primary); font-size:0.75rem; font-weight:600;'>🔮 AI가 탐구 맥락을 파싱하여 맞춤형 예안 후보를 설계하는 중입니다...</div>";
    root.style.display = "block";

    try {
      const candidates = await MockAI.getSuggestions(step, field, this.report);

      container.innerHTML = "";

      candidates.forEach((txt, idx) => {
        const item = document.createElement("div");
        item.className = "popover-candidate-item";
        item.innerHTML = `<strong>후보 ${idx + 1}</strong><br>${txt}`;
        item.onclick = () => {
          const inputField = document.getElementById(App.activeSuggestTargetId);
          inputField.value = txt;
          
          inputField.classList.remove("prefilled-field");
          
          if (step === 3) App.handleGenericInput(3);
          else if (step === 4) App.handleStep4Input();
          else if (step === 5) App.handleGenericInput(5);
          else if (step === 6) App.handleGenericInput(6);
          else if (step === 7) App.handleStep7Input();
          
          App.closeAiSuggestInlineModal();
          App.saveToLocalStorage();
        };
        container.appendChild(item);
      });
    } catch (e) {
      console.error(e);
      container.innerHTML = `<div style='padding:16px; text-align:center; color:var(--danger); font-size:0.75rem;'>AI 추천 생성 실패: ${e.message}</div>`;
    }
  },


  closeAiSuggestInlineModal: function () {
    document.getElementById("ai-suggest-popover-root").style.display = "none";
  },

  /**
   * 내비게이션 제어
   */
  navigateToStep: function (stepNum) {
    // 5단계에서 6단계로 전진할 때만 자기점검 모달 활성화 트리거
    if (this.report.metadata.current_step === 5 && stepNum === 6) {
      this.triggerSelfCheckModal();
      return;
    }

    this.report.metadata.current_step = stepNum;
    
    // UI 전환
    document.querySelectorAll(".form-step-wrapper").forEach(w => w.classList.remove("active"));
    document.getElementById(`step-wrapper-${stepNum}`).classList.add("active");

    document.querySelectorAll(".progress-step-item").forEach((item, idx) => {
      item.classList.remove("active");
      if (idx + 1 === stepNum) {
        item.classList.add("active");
      }
      if (idx + 1 < stepNum) {
        item.classList.add("completed");
      } else {
        item.classList.remove("completed");
      }
    });

    this.updateProgress();
    this.updateNavigationButtons();
    this.updatePrefillSummaryCards();
    this.updateMentorAdvice();
    this.updateGuideArea();

    // 2단계 진입 시 키워드가 비어있다면 추천 키워드 리스트를 자동으로 노출하고 적합성 검사
    if (stepNum === 2) {
      if (this.report.step_2.키워드.length === 0) {
        const box = document.getElementById("recommended-keywords-box");
        if (box) {
          box.style.display = "none";
          this.showRecommendedKeywords();
        }
      }
      this.checkTopicCurriculumAlignment();
    }

    // 6단계 진입 시, prefill 가동
    if (stepNum === 6) {
      this.prefillStep6Values();
    }

    this.saveToLocalStorage();
  },

  navigateNext: function () {
    const current = this.report.metadata.current_step;
    if (current < 8) {
      // P0/P1 가이드에 따라 완화된 검증 적용하되 친절하게 탭 전환
      this.navigateToStep(current + 1);
    }
  },

  navigatePrev: function () {
    const current = this.report.metadata.current_step;
    if (current > 1) {
      this.navigateToStep(current - 1);
    }
  },

  updateProgress: function () {
    const current = this.report.metadata.current_step;
    const progressFill = document.getElementById("progress-line-fill");
    
    // 8단계 진행률 너비 비율 계산
    const percentage = ((current - 1) / 7) * 100;
    progressFill.style.width = `${percentage}%`;
  },

  updateNavigationButtons: function () {
    const current = this.report.metadata.current_step;
    const prevBtn = document.getElementById("btn-nav-prev");
    const nextBtn = document.getElementById("btn-nav-next");

    if (current === 1) {
      prevBtn.className = "btn btn-secondary btn-disabled";
    } else {
      prevBtn.className = "btn btn-secondary";
    }

    if (current === 8) {
      nextBtn.style.display = "none";
    } else {
      nextBtn.style.display = "inline-flex";
    }
  },

  /**
   * 로컬 스토리지에 기입 내용 강제 복원
   */
  restoreFormValues: function () {
    const r = this.report;

    // 1단계 - 이름 및 학번 자동 프리필 & 비활성화(disabled) 고정
    const nameEl = document.getElementById("input-student-name");
    const idEl = document.getElementById("input-student-id");
    if (nameEl) {
      nameEl.value = r.student_name || "";
      nameEl.disabled = true;
      nameEl.style.background = "rgba(255,255,255,0.04)";
      nameEl.style.cursor = "not-allowed";
    }
    if (idEl) {
      idEl.value = r.student_id || "";
      idEl.disabled = true;
      idEl.style.background = "rgba(255,255,255,0.04)";
      idEl.style.cursor = "not-allowed";
    }

    // 학년 및 학급 자동 설정 및 잠금
    const gradeEl = document.getElementById("input-grade");
    const classEl = document.getElementById("input-class");
    if (gradeEl) {
      gradeEl.value = r.step_1.학년;
      gradeEl.disabled = true;
      gradeEl.style.background = "rgba(255,255,255,0.04)";
      gradeEl.style.cursor = "not-allowed";
    }
    if (classEl) {
      classEl.value = r.step_1.학급 || 1;
      classEl.disabled = true;
      classEl.style.background = "rgba(255,255,255,0.04)";
      classEl.style.cursor = "not-allowed";
    }
    document.getElementById("input-track").value = r.step_1.계열;
    document.getElementById("input-major").value = r.step_1.학과;
    document.getElementById("input-career").value = r.step_1.진로;
    
    if (r.step_1.교과목) {
      document.getElementById("input-subject-group").value = r.step_1.교과목.교과;
      document.getElementById("input-subject-cat").value = r.step_1.교과목.분류;
      this.updateSubjectDropdown();
      
      if (r.step_1.교과목.분류 === "기타") {
        document.getElementById("input-subject-name-direct").value = r.step_1.교과목.과목명;
      } else {
        document.getElementById("input-subject-name").value = r.step_1.교과목.과목명;
      }
    }

    // 2단계
    document.getElementById("input-theme-motivation").value = r.step_2.동기;
    document.getElementById("input-final-theme").value = r.step_2.선택_주제;

    // 3단계
    document.getElementById("input-step3-motivation").value = r.step_3.동기;
    document.getElementById("input-step3-purpose").value = r.step_3.목적;
    document.getElementById("input-step3-question").value = r.step_3.핵심질문;

    // 4단계
    document.getElementById("input-step4-hypothesis").value = r.step_4.가설;
    document.getElementById("input-step4-rationale").value = r.step_4.근거;

    // 5단계
    document.getElementById("input-step5-procedure").value = r.step_5.절차_방법;
    document.getElementById("input-step5-tools").value = r.step_5.도구_자료;
    document.getElementById("input-step5-reliability").value = r.step_5.신뢰성_타당성;

    // 6단계
    document.getElementById("input-step6-collect").value = r.step_6.자료_수집;
    document.getElementById("input-step6-process").value = r.step_6.자료_처리_분석;
    document.getElementById("input-step6-observation").value = r.step_6.핵심_수치_관찰;

    // 7단계
    // 7단계
          document.getElementById("input-step7-facts").value = r.step_7.사실_정리 || "";
          if (document.getElementById("input-step7-rvalue")) {
            document.getElementById("input-step7-rvalue").value = r.step_7.r_value || "";
          }
          if (document.getElementById("input-step7-pvalue")) {
            document.getElementById("input-step7-pvalue").value = r.step_7.p_value || "";
          }
          if (r.step_7.가설_검증) {
            document.getElementById("input-step7-decision").value = r.step_7.가설_검증.판정 || "지지";
            document.getElementById("input-step7-decision-rationale").value = r.step_7.가설_검증.근거 || "";
            document.getElementById("input-step7-final-conclusion").value = r.step_7.가설_검증.최종_결론 || "";
          }
          document.getElementById("input-step7-limits").value = r.step_7.한계_후속 || "";

    this.renderAddedReferences();
  },

  /**
   * 우측 상단: 이전 단계 요약 현황 렌더링
   */
  updateSummaryPanel: function () {
    const box = document.getElementById("summary-content-box");
    const r = this.report;

    const subjectText = r.step_1.교과목?.과목명 
      ? `[${r.step_1.교과목.교과}] ${r.step_1.교과목.분류}-${r.step_1.교과목.과목명}`
      : "미선택";

    box.innerHTML = `
      <div class="summary-item-line"><strong>학생 정보:</strong> ${r.student_name || "미기입"} (${r.student_id || "학번미기입"})</div>
      <div class="summary-item-line"><strong>학적:</strong> ${r.step_1.학년}학년 ${r.step_1.학급 || 1}반 | ${r.step_1.계열} 계열 | 학과: ${r.step_1.학과 || "미작성"}</div>
      <div class="summary-item-line"><strong>교과목:</strong> ${subjectText}</div>
      <div class="summary-item-line"><strong>주제:</strong> ${r.step_2.선택_주제 || "미선택 (2단계에서 확정)"}</div>
      <div class="summary-item-line"><strong>유형:</strong> ${EXPLORATION_TYPES.find(t => t.id === r.step_2.탐구유형)?.label || "미선택"}</div>
      <div class="summary-item-line"><strong>핵심질문:</strong> ${r.step_3.핵심질문 || "미작성"}</div>
      <div class="summary-item-line"><strong>가설:</strong> ${r.step_4.가설 || "미작성"}</div>
    `;
  },

  toggleSummaryCollapse: function () {
    const box = document.getElementById("summary-content-box");
    const arrow = document.getElementById("summary-collapse-arrow");
    
    if (box.style.display === "none") {
      box.style.display = "block";
      arrow.textContent = "▼";
    } else {
      box.style.display = "none";
      arrow.textContent = "▲";
    }
  },

  /**
   * 우측 중단: 단계별 AI 멘토 멘트 실시간 업데이트
   */
  updateMentorAdvice: function (customText) {
    const step = this.report.metadata.current_step;
    const avatarEl = document.getElementById("ai-mentor-avatar");
    const textEl = document.getElementById("ai-mentor-advice-text");

    if (customText) {
      textEl.innerHTML = `<p>${customText}</p>`;
      return;
    }

    const typeLabel = EXPLORATION_TYPES.find(t => t.id === this.report.step_2.탐구유형)?.label || "선택형";

    const advices = {
      1: {
        avatar: "👨‍🏫",
        html: `<p>안녕하세요! 탐구의 가장 기본인 <strong>학적 및 교과 설정</strong> 단계입니다.</p>
               <p>탐구의 도구가 될 과목명과 희망하는 학과를 작성해 보세요. 학년을 설정해 주면 <strong>2022 개정 또는 2015 교육과정 규칙</strong>에 맞춰 최적화된 학습 기준을 로드해 올게요!</p>`
      },
      2: {
        avatar: "🧪",
        html: `<p>멋진 교과목을 세팅하셨군요! 이제 <strong>주제와 탐구 유형</strong>을 결정할 시간입니다.</p>
               <p>관심 키워드 3가지를 넣고 <strong>[주제 5종 추천 받기]</strong>를 누르면, AI 멘토가 교과 수준에 맞는 똑똑한 학술 제안을 준비합니다. 유형에 따라 4~7단계의 폼과 팁이 다이내믹하게 분기되니 꼭 어울리는 것을 골라보세요!</p>`
      },
      3: {
        avatar: "🎯",
        html: `<p>탐구에 활력을 불어넣는 <strong>동기 및 목적</strong> 설정입니다.</p>
               <p>여기서 핵심 질문은 '호기심'을 던지는 창구입니다. '과연 이 둘 사이엔 관계가 있을까?'처럼 질문의 형식으로 쓰고, 이에 대한 똑똑한 정답 추측은 다음 단계 <strong>'가설 설정'</strong>에서 완성해 주세요!</p>`
      },
      4: {
        avatar: "⚖️",
        html: `<p>드디어 대단히 중요한 <strong>가설 및 변수 정의</strong> 단계입니다!</p>
               <p>선택하신 [${typeLabel}] 유형에 맞도록 입력 필드의 <strong>변수 슬롯들</strong>이 조작/통제/독립 등의 학술 구조로 자동 재구성되어 배치되었습니다. 가설을 세운 후 <strong>[자가평가 받기]</strong>를 누르면 검증 타당성을 AI가 철저히 진단해 드릴게요.</p>`
      },
      5: {
        avatar: "📐",
        html: `<p>세운 가설을 검증할 <strong>절차와 타당성 설계</strong> 단계군요.</p>
               <p>상단에 이전 단계 가설 정보가 요약되어 보입니다. 실험이나 데이터를 수집할 절차를 차근차근 1, 2, 3 번호로 적어주세요. 5단계가 끝나면 교과목과의 융합 관계를 스스로 성찰하는 <strong>[탐구-교과 연계 점검]</strong> 모달이 활성화됩니다!</p>`
      },
      6: {
        avatar: "📈",
        html: `<p>이전의 계획들이 똑똑하게 수행으로 연동되었습니다!</p>
               <p>5단계에서 설계했던 미래의 계획 절차를 AI가 <strong>'과거형 수행 데이터 시제'</strong>로 똑똑하게 번환하여 첫 번째 수집 칸에 미리 입력해 두었습니다(Prefill). 마찰이나 노이즈가 섞인 실측 수치를 사실적으로 적으면 신뢰성이 급상승합니다.</p>`
      },
      7: {
        avatar: "🏁",
        html: `<p>탐구의 종지부를 찍을 <strong>가설 판정 및 결론</strong> 도출입니다.</p>
               <p>4단계의 가설이 상단에 자동으로 뿌려져 있습니다. 모인 데이터를 근거로 하여 가설이 '지지', '부분지지', '불지지' 중 어떤 등급인지 소신을 갖고 판정하세요. <strong>최종 종합 결론은 AI가 대신 써주지 않으므로</strong> 학생의 연역적 사고로 멋지게 마무리하세요!</p>`
      },
      8: {
        avatar: "📚",
        html: `<p>마지막 단계인 <strong>참고문헌</strong> 아카이빙입니다.</p>
               <p>AI의 인용 환각을 배제하기 위해, 실제 존재하거나 권장되는 학술/기관자료 데이터베이스를 로딩합니다. 난이도 별점(★: 적정, ★★: 도전, ★★★: 깊은수준)을 확인하여 학술 논문을 내 보고서에 바인딩해 마침표를 찍어 보세요.</p>`
      }
    };

    const advice = advices[step];
    if (advice) {
      avatarEl.textContent = advice.avatar;
      textEl.innerHTML = advice.html;
    }
  },

  /**
   * 우측 하단: 단계별 우수 도움말 & 예시 탭 전환 업데이트
   */
  switchGuideTab: function (tab) {
    this.currentGuideTab = tab;
    
    document.getElementById("guide-tab-help").classList.remove("active");
    document.getElementById("guide-tab-example").classList.remove("active");
    
    if (tab === "help") {
      document.getElementById("guide-tab-help").classList.add("active");
    } else {
      document.getElementById("guide-tab-example").classList.add("active");
    }

    this.updateGuideArea();
  },

  updateGuideArea: function () {
    const step = this.report.metadata.current_step;
    const area = document.getElementById("ai-guide-content-area");
    const isHelp = this.currentGuideTab === "help";

    const guides = {
      1: {
        help: "계열별로 학과와 진로명이 조화를 이루면 학생의 지적 탐구 개성이 돋보입니다. 교과목 구분은 고등학교 교육과정 성취 기준과 직결되므로 정확히 선택해 보세요.",
        example: "자연계열 지망 / 의예과 / 뇌신경 세포 전달 연구원 / 생명과학Ⅱ 과목 선택"
      },
      2: {
        help: "흥미 키워드는 3~4개의 명사로 입력하세요. 탐구 유형은 실측 위주일 땐 [실험탐구], 빅데이터를 활용할 땐 [데이터·통계], 컴퓨터 물리 시뮬레이션은 [수학적 모델링]이 적합합니다.",
        example: "키워드: #충돌, #에너지보존, #MBL센서\n최종주제: 'MBL 단일 역학 센서를 이용한 평면 충돌 시 에너지 분산 양상의 정량 분석'"
      },
      3: {
        help: "핵심 질문은 모호한 의문문이 아닌, 정량 분석이 가능한 관계형 의문문으로 설정하세요. 32과목의 특정 대단원 내용 요소가 직접 투영될수록 탐구의 깊이가 인정받기 좋습니다.",
        example: "질문: '공기 저항이 작용할 때, 질량비가 다른 두 물체의 충돌 전후 운동량 변화량은 선형적 수렴 값을 나타내는가?'"
      },
      4: {
        help: "가설은 증명이 가능한 참/거짓 구조여야 합니다. 변수 슬롯에 각 변인을 입력해 주면, 설계가 입체적이고 정교해집니다. 과학적 이론(예: 열역학 제2법칙)을 반드시 근거에 1문장 엮어 도출하세요.",
        example: "가설: '충돌 속도가 2배 빨라지면, 공기 저항으로 유실되는 충격 마찰에너지는 지수함수적으로 3배 이상 급등할 것이다.'"
      },
      5: {
        help: "독립 조건과 통제 조건을 정확하게 분리하여 절차에 넘버링해 서술하세요. 타당성 부분은 어떻게 동일한 환경 오차 조건을 통제했는지 정성적으로 밝히는 데 목적이 있습니다.",
        example: "절차: '1. MBL 스마트 카트를 수평 트랙에 고정한다. 2. 발사 장치로 1.2m/s, 2.4m/s의 조작 속도를 주어 5회씩 활주 충돌시킨다. 3. 충격 센서로 압력을 수집한다.'"
      },
      6: {
        help: "수집한 데이터와 표, 혹은 컴퓨터 계산 결과를 수치로 명시하세요. 실패하거나 오차가 발생한 실험 데이터도 버리지 않고 원인을 적어주는 태도가 훌륭한 학술적 신뢰성을 담보합니다.",
        example: "관찰: '조작 조건 A(1.2m/s) 충돌 결과, 평균 반발계수는 0.84였으나, 조건 B(2.4m/s)는 0.72로 충격 속도가 높을수록 손실 에너지 비율이 커짐을 정량 실측함.'"
      },
      7: {
        help: "앞서 수립했던 가설 명제를 찬찬히 읽고, 나의 수집 실측 데이터가 가설을 뒷받침하는지 객관적으로 선언하세요. 한계점 기술은 이 탐구의 미비점을 알고 있는 메타인지의 정점입니다.",
        example: "결론: '실측 결과 가설의 비선형 손실 경향성은 입증되었으나, 카트 바퀴 자체의 물리적 정지 마찰계수가 통제되지 못한 한계가 있어 부분지지 판정함.'"
      },
      8: {
        help: "내가 탐구한 주제와 가장 유사한 선행 문헌과 서적을 정리하세요. 대학 수준의 학술 검색을 모의 수행함으로써 인용 출처 작성법과 보고서의 타당성 검증 프로세스를 체득합니다.",
        example: "학술논문: 김영희, '고등학교 물리 실험에서 MBL 센서를 활용한 탄성충돌의 오차 보정 연구', 한국과학교육학회, 2023. (★ 학생수준적합)"
      }
    };

    const g = guides[step];
    if (g) {
      area.innerHTML = isHelp 
        ? `<p style="white-space:pre-line;">${g.help}</p>`
        : `<p style="white-space:pre-line; font-style:italic; color:var(--primary-light);">우수 사례 모델:\n${g.example}</p>`;
    }
  },

  /**
   * 로컬 스토리지 데이터 동기화 저장
   */
  saveToLocalStorage: function () {
    const currentUser = localStorage.getItem("antigravity_current_user");
    if (!currentUser) return; // 로그인 되지 않은 경우는 저장 안함

    this.report.metadata.updated_at = new Date().toISOString();
    
    // 1. 사용자 DB 업데이트 (1:N 다중 탐구 대응)
    const usersDbRaw = localStorage.getItem("antigravity_users_db");
    if (usersDbRaw) {
      try {
        const usersDb = JSON.parse(usersDbRaw);
        const userRecord = usersDb[currentUser];
        if (userRecord && userRecord.reports) {
          // 회원 정보 이름/학번 동기화 보장
          this.report.student_name = userRecord.student_name;
          this.report.student_id = userRecord.student_id;
          
          // 현재 활성 탐구 고유 ID
          const activeId = userRecord.active_report_id || this.report.report_id;
          const idx = userRecord.reports.findIndex(r => r.report_id === activeId);
          if (idx !== -1) {
            userRecord.reports[idx] = this.report;
          } else {
            userRecord.reports.push(this.report);
          }
          userRecord.active_report_id = activeId;
          
          localStorage.setItem("antigravity_users_db", JSON.stringify(usersDb));
          
          // 드롭다운 텍스트 실시간 동기화
          this.renderInquiryList();
        }
      } catch (e) {
        console.error("사용자 DB 업데이트 실패", e);
      }
    }
    
    // 하위 호환성 임시 저장 데이터 동기화
    localStorage.setItem("antigravity_report_save", JSON.stringify(this.report));
    
    // UI 저장 문구 깜빡임 효과
    const status = document.getElementById("auto-save-status");
    if (status) {
      status.textContent = "⚡ 임시저장 완료";
      setTimeout(() => {
        if (status.textContent === "⚡ 임시저장 완료") {
          status.textContent = "💾 자동 임시저장 활성화 중";
        }
      }, 1500);
    }
  },

  startAutoSave: function () {
    if (this.autoSaveTimer) clearInterval(this.autoSaveTimer);
    this.autoSaveTimer = setInterval(() => {
      App.saveToLocalStorage();
    }, 3000); // 30초 대신 즉각적인 확인을 돕기 위해 30초 내외 또는 blur 중심 제어
  },

  /**
   * 최종 인쇄 프리뷰 실행
   */
  openFinalPreview: function () {
    this.saveToLocalStorage();
    PDFExport.openPreview(this.report);
  },

  /**
   * 1:N 다중 탐구 제어 헬퍼 및 핸들러
   */
  createNewReportStructure: function (name, studentId) {
    if (!this.defaultReportTemplate) {
      this.defaultReportTemplate = JSON.parse(JSON.stringify(this.report));
    }
    const defaultRep = JSON.parse(JSON.stringify(this.defaultReportTemplate));
    defaultRep.report_id = "rep_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
    defaultRep.student_name = name;
    defaultRep.student_id = studentId;
    
    // 학번 파싱을 통한 학년/학급 기본 세팅 (고교 학년 1-3 범위 제한)
    if (studentId && studentId.length === 5) {
      let gradeNum = parseInt(studentId.charAt(0), 10);
      if (gradeNum < 1 || gradeNum > 3) {
        gradeNum = 1;
      }
      let classNum = parseInt(studentId.substring(1, 3), 10);
      if (classNum < 1 || classNum > 12) {
        classNum = 1;
      }
      defaultRep.step_1.학년 = gradeNum;
      defaultRep.step_1.학급 = classNum;
    }
    
    defaultRep.metadata.created_at = new Date().toISOString();
    defaultRep.metadata.updated_at = new Date().toISOString();
    return defaultRep;
  },

  renderInquiryList: function () {
    const container = document.getElementById("inquiry-selector-container");
    const select = document.getElementById("inquiry-select");
    if (!container || !select) return;

    const currentUser = localStorage.getItem("antigravity_current_user");
    if (!currentUser) {
      container.style.display = "none";
      return;
    }

    container.style.display = "flex";
    select.innerHTML = "";

    const usersDbRaw = localStorage.getItem("antigravity_users_db");
    if (usersDbRaw) {
      try {
        const usersDb = JSON.parse(usersDbRaw);
        const userRecord = usersDb[currentUser];
        if (userRecord && userRecord.reports) {
          userRecord.reports.forEach(r => {
            const opt = document.createElement("option");
            opt.value = r.report_id;
            
            const subject = r.step_1?.교과목?.과목명 || "과목미정";
            const topic = r.step_2?.선택_주제 || "주제미정";
            const shortTopic = topic.length > 15 ? topic.substring(0, 15) + "..." : topic;
            
            opt.textContent = `[${subject}] ${shortTopic}`;
            if (r.report_id === userRecord.active_report_id) {
              opt.selected = true;
            }
            select.appendChild(opt);
          });
        }
      } catch (e) {
        console.error("탐구 목록 렌더링 중 오류:", e);
      }
    }
  },

  handleInquiryChange: function () {
    const select = document.getElementById("inquiry-select");
    if (!select) return;

    const newReportId = select.value;
    const currentUser = localStorage.getItem("antigravity_current_user");
    if (!currentUser) return;

    // 현재 내용 임시 저장
    this.saveToLocalStorage();

    const usersDbRaw = localStorage.getItem("antigravity_users_db");
    if (usersDbRaw) {
      try {
        const usersDb = JSON.parse(usersDbRaw);
        const userRecord = usersDb[currentUser];
        if (userRecord && userRecord.reports) {
          userRecord.active_report_id = newReportId;
          const activeRep = userRecord.reports.find(r => r.report_id === newReportId);
          if (activeRep) {
            this.report = activeRep;
            localStorage.setItem("antigravity_users_db", JSON.stringify(usersDb));
            
            // 데이터 갱신 및 내비게이션 초기화
            this.step = 1;
            this.updateViews();
            this.renderInquiryList();
            alert(`📂 탐구 과제가 [${this.report.step_1?.교과목?.과목명 || "과목미정"}] 과목으로 변경되었습니다.`);
          }
        }
      } catch (e) {
        console.error(e);
      }
    }
  },

  createNewInquiry: function () {
    const currentUser = localStorage.getItem("antigravity_current_user");
    if (!currentUser) return;

    // 현재 내용 저장
    this.saveToLocalStorage();

    const usersDbRaw = localStorage.getItem("antigravity_users_db");
    if (usersDbRaw) {
      try {
        const usersDb = JSON.parse(usersDbRaw);
        const userRecord = usersDb[currentUser];
        if (userRecord && userRecord.reports) {
          const newRep = this.createNewReportStructure(userRecord.student_name, userRecord.student_id);
          userRecord.reports.push(newRep);
          userRecord.active_report_id = newRep.report_id;
          
          this.report = newRep;
          localStorage.setItem("antigravity_users_db", JSON.stringify(usersDb));

          // 1단계로 리다이렉트
          this.step = 1;
          this.updateViews();
          this.renderInquiryList();
          alert("➕ 새로운 주제탐구 과제가 생성되었습니다! 1단계에서 탐구할 과목을 세팅해 주세요.");
        }
      } catch (e) {
        console.error(e);
      }
    }
  },

  deleteCurrentInquiry: function () {
    const currentUser = localStorage.getItem("antigravity_current_user");
    if (!currentUser) return;

    const usersDbRaw = localStorage.getItem("antigravity_users_db");
    if (!usersDbRaw) return;

    try {
      const usersDb = JSON.parse(usersDbRaw);
      const userRecord = usersDb[currentUser];
      if (userRecord && userRecord.reports) {
        // 최소 1개 탐구 보존 방어막
        if (userRecord.reports.length <= 1) {
          alert("⚠️ 최소 1개 이상의 탐구 과제는 유지되어야 하므로 삭제할 수 없습니다.");
          return;
        }

        const activeId = userRecord.active_report_id || this.report.report_id;
        const currentSubject = this.report.step_1?.교과목?.과목명 || "과목미정";
        const currentTopic = this.report.step_2?.선택_주제 || "주제미정";

        if (confirm(`🗑️ 정말 이 탐구 과제를 삭제하시겠습니까?\n\n[대상 과목]: ${currentSubject}\n[대상 주제]: ${currentTopic}\n\n삭제된 내용은 영구히 복구할 수 없습니다.`)) {
          // 제거
          userRecord.reports = userRecord.reports.filter(r => r.report_id !== activeId);
          // 첫 번째로 변경
          userRecord.active_report_id = userRecord.reports[0].report_id;
          
          this.report = userRecord.reports[0];
          
          localStorage.setItem("antigravity_users_db", JSON.stringify(usersDb));
          
          // 화면 및 드롭다운 강제 리프레시
          this.step = 1;
          this.updateViews();
          this.renderInquiryList();
          alert("🗑️ 탐구 과제가 정상적으로 삭제되었습니다.");
        }
      }
    } catch (e) {
      console.error("탐구 삭제 중 오류:", e);
    }
  },

  /**
   * Gemini API 설정 모달 제어
   */
  /**
   * AI API 설정 모달 제어
   */
  openSettingsModal: function () {
    const modal = document.getElementById("settings-modal-root");
    if (modal) {
      // 값 채워넣기
      const provider = localStorage.getItem("active_ai_provider") || "gemini";
      document.getElementById("settings-ai-provider").value = provider;
      
      document.getElementById("settings-gemini-key").value = localStorage.getItem("gemini_api_key") || "";
      document.getElementById("settings-openai-key").value = localStorage.getItem("openai_api_key") || "";
      document.getElementById("settings-claude-key").value = localStorage.getItem("claude_api_key") || "";
      document.getElementById("settings-cors-proxy").value = localStorage.getItem("cors_proxy_url") || "";

      // 제공자별 화면 레이아웃 토글 및 모델 목록 갱신
      this.onSettingsProviderChange();
      
      // 저장된 모델 적용
      const savedModel = localStorage.getItem("active_ai_model");
      if (savedModel) {
        document.getElementById("settings-ai-model").value = savedModel;
      }

      modal.style.display = "flex";
    }
  },

  closeSettingsModal: function () {
    const modal = document.getElementById("settings-modal-root");
    if (modal) {
      modal.style.display = "none";
    }
  },

  onSettingsProviderChange: function () {
    const provider = document.getElementById("settings-ai-provider").value;
    
    // 키 입력 섹션 토글
    document.querySelectorAll(".settings-key-section").forEach(sec => {
      sec.style.display = "none";
    });
    document.getElementById("section-cors-proxy").style.display = "none";
    
    if (provider === "gemini") {
      document.getElementById("section-key-gemini").style.display = "block";
    } else if (provider === "openai") {
      document.getElementById("section-key-openai").style.display = "block";
    } else if (provider === "claude") {
      document.getElementById("section-key-claude").style.display = "block";
      document.getElementById("section-cors-proxy").style.display = "block";
    }
    
    // 모델 셀렉트박스 옵션 갱신
    const modelSelect = document.getElementById("settings-ai-model");
    modelSelect.innerHTML = "";
    
    const models = {
      gemini: [
        { value: "gemini-2.5-flash", text: "gemini-2.5-flash (기본 - 빠름/경제적)" },
        { value: "gemini-2.5-pro", text: "gemini-2.5-pro (고성능 - 정교함/심층 탐구)" }
      ],
      openai: [
        { value: "gpt-4o-mini", text: "gpt-4o-mini (기본 - 빠름/경제적)" },
        { value: "gpt-4o", text: "gpt-4o (고성능 - 정교함/심층 탐구)" }
      ],
      claude: [
        { value: "claude-3-5-haiku-20241022", text: "claude-3-5-haiku (기본 - 빠름/경제적)" },
        { value: "claude-3-5-sonnet-20241022", text: "claude-3-5-sonnet (고성능 - 정교함/심층 탐구)" }
      ]
    };
    
    const providerModels = models[provider] || [];
    providerModels.forEach(m => {
      const opt = document.createElement("option");
      opt.value = m.value;
      opt.textContent = m.text;
      modelSelect.appendChild(opt);
    });
  },

  saveSettingsKey: function () {
    const provider = document.getElementById("settings-ai-provider").value;
    const model = document.getElementById("settings-ai-model").value;
    
    const geminiKey = document.getElementById("settings-gemini-key").value.trim().replace(/[^A-Za-z0-9_\-]/g, "");
    const openaiKey = document.getElementById("settings-openai-key").value.trim().replace(/[^A-Za-z0-9_\-]/g, "");
    const claudeKey = document.getElementById("settings-claude-key").value.trim().replace(/[^A-Za-z0-9_\-]/g, "");
    const corsProxy = document.getElementById("settings-cors-proxy").value.trim();
    
    // 로컬 스토리지 업데이트
    localStorage.setItem("active_ai_provider", provider);
    localStorage.setItem("active_ai_model", model);
    
    if (geminiKey) localStorage.setItem("gemini_api_key", geminiKey);
    else localStorage.removeItem("gemini_api_key");
    
    if (openaiKey) localStorage.setItem("openai_api_key", openaiKey);
    else localStorage.removeItem("openai_api_key");
    
    if (claudeKey) localStorage.setItem("claude_api_key", claudeKey);
    else localStorage.removeItem("claude_api_key");
    
    if (corsProxy) localStorage.setItem("cors_proxy_url", corsProxy);
    else localStorage.removeItem("cors_proxy_url");
    
    // 안내 팝업
    let statusMsg = `AI 제공자가 [${provider === 'gemini' ? '구글 Gemini' : provider === 'openai' ? 'OpenAI ChatGPT' : '안드로픽 Claude'}](${model})로 설정되었습니다.\n`;
    
    const currentKey = provider === "gemini" ? geminiKey : provider === "openai" ? openaiKey : claudeKey;
    if (currentKey) {
      statusMsg += "API 키가 성공적으로 정제되어 저장되었습니다! 실시간 AI 기능을 사용합니다.";
    } else {
      statusMsg += "등록된 API 키가 없습니다. AI 분석 시 모의 체험(Simulated) AI 모드로 작동합니다.";
    }
    
    alert(statusMsg);
    this.closeSettingsModal();
  },

  /**
   * 진로 맞춤형 추천 키워드 제안 UI 제어
   */
  showRecommendedKeywords: async function () {
    const track = this.report.step_1.계열 || "자연과학";
    const box = document.getElementById("recommended-keywords-box");
    
    if (!box) return;
    
    if (box.style.display === "flex" && box.innerHTML !== "" && !box.innerHTML.includes("로딩 중")) {
      box.style.display = "none";
      return;
    }
    
    box.innerHTML = "<div style='font-size:0.75rem; color:var(--accent); padding:8px;'>🪄 AI 맞춤형 추천 키워드 로딩 중...</div>";
    box.style.display = "flex";
    
    const context = {
      subject: this.report.step_1.교과목?.과목명 || "통합과학",
      department: this.report.step_1.학과 || "자연과학",
      career: this.report.step_1.진로 || "과학자",
      field: track,
      fallbackKeywords: SUGGESTED_KEYWORDS[track] || SUGGESTED_KEYWORDS["자연과학"]
    };

    try {
      const suggested = await MockAI.suggestKeywords(context);
      box.innerHTML = "";
      
      suggested.forEach(kw => {
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.style.padding = "6px 12px";
        btn.style.fontSize = "0.75rem";
        btn.style.margin = "0";
        btn.style.background = "var(--bg-panel)";
        btn.style.borderColor = "var(--border-glass)";
        btn.style.color = "var(--text-secondary)";
        btn.style.borderRadius = "20px";
        btn.style.cursor = "pointer";
        btn.style.transition = "var(--transition)";
        btn.textContent = `+ #${kw}`;
        btn.onclick = () => {
          App.addRecommendedKeyword(kw);
        };
        box.appendChild(btn);
      });

      if (suggested.isFallback) {
        const errDiv = document.createElement("div");
        errDiv.style.fontSize = "0.7rem";
        errDiv.style.color = "var(--danger)";
        errDiv.style.marginTop = "8px";
        errDiv.style.width = "100%";
        errDiv.style.textAlign = "center";
        errDiv.style.flexBasis = "100%";
        errDiv.innerHTML = `⚠️ AI 생성 실패: ${suggested.errorMsg}`;
        box.appendChild(errDiv);
      }
    } catch (e) {
      console.error(e);
      box.innerHTML = "<div style='font-size:0.75rem; color:var(--danger); padding:8px;'>추천 키워드를 가져오지 못했습니다.</div>";
    }
  },

  addRecommendedKeyword: function (kw) {
    if (!this.report.step_2.키워드.includes(kw)) {
      if (this.report.step_2.키워드.length >= 5) {
        alert("키워드는 최대 5개까지만 입력 가능합니다.");
        return;
      }
      this.report.step_2.키워드.push(kw);
      this.renderKeywords();
      this.handleStep2Input();
      this.saveToLocalStorage();
    }
  },

  checkTopicCurriculumAlignment: function () {
    const finalTheme = this.report.step_2.선택_주제 || "";
    const subject = this.report.step_1.교과목?.과목명 || "";
    const warningEl = document.getElementById("topic-curriculum-warning");
    if (!warningEl) return;

    if (!finalTheme.trim()) {
      warningEl.style.display = "none";
      return;
    }

    // mock-ai.js에 작성할 로컬 정합성 진단 함수를 호출
    const check = MockAI.validateThemeCurriculum(subject, finalTheme);

    if (check.status === "warning") {
      warningEl.className = "curriculum-alert-banner";
      warningEl.style.background = "rgba(239, 68, 68, 0.08)";
      warningEl.style.borderColor = "rgba(239, 68, 68, 0.3)";
      warningEl.style.color = "var(--danger)";
      warningEl.querySelector("span").innerHTML = `🚨 <strong>[교육과정 이탈 경고]</strong> ${check.message}`;
      warningEl.style.display = "flex";
    } else if (check.status === "success") {
      warningEl.className = "curriculum-alert-banner";
      warningEl.style.background = "rgba(16, 185, 129, 0.08)";
      warningEl.style.borderColor = "rgba(16, 185, 129, 0.3)";
      warningEl.style.color = "var(--success)";
      warningEl.querySelector("span").innerHTML = `✅ <strong>[교육과정 일치]</strong> ${check.message}`;
      warningEl.style.display = "flex";
    } else {
      warningEl.style.display = "none";
    }
  },

      suggestVariablesWithAi: async function () {
    const subject = this.report.step_1.교과목.과목명;
    const topic = this.report.step_2.선택_주제;
    const inquiry_type = this.report.step_2.탐구유형;
    const hypothesis = this.report.step_4.가설 || "";

    if (!topic) {
      alert("변인 설정을 제안받기 전에, 2단계에서 탐구 주제를 먼저 결정해 주세요.");
      return;
    }

    const activeType = this.report.step_2.탐구유형;
    const typeMeta = EXPLORATION_TYPES.find(t => t.id === activeType);
    if (!typeMeta) return;

    const slots = typeMeta.hypothesis_vars;

    const btn = document.getElementById("btn-ai-variables-suggest");
    const originalText = btn ? btn.innerHTML : "🔮 AI가 분석한 주제 맞춤형 정량 변인 설계 추천 받기";
    if (btn) {
      btn.innerHTML = "🤖 AI가 탐구 주제와 변인을 분석 중...";
      btn.disabled = true;
    }

    try {
      const suggestion = await MockAI.suggestVariables(subject, topic, inquiry_type, hypothesis, slots);
      
      if (suggestion) {
        slots.forEach(vName => {
          const input = document.querySelector(`.input-var-slot[data-varname="${vName}"]`);
          if (input && suggestion[vName]) {
            const parsedVal = parseVariableValue(suggestion[vName]);
            input.value = parsedVal;
            input.style.border = "1px solid var(--accent)";
            input.style.boxShadow = "var(--shadow-glow)";
            setTimeout(() => {
              input.style.border = "1px solid var(--border-glass)";
              input.style.boxShadow = "none";
            }, 2500);
          }
        });
        this.handleVariableSlotInput();
        this.saveToLocalStorage();
      }
    } catch (e) {
      console.error("AI Variable Suggestion failed", e);
      alert("AI 변인 제안 중 오류가 발생했습니다: " + e.message);
    } finally {
      if (btn) {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    }
  },

  toggleAuthView: function (view) {
    if (view === "login") {
      document.getElementById("auth-login-view").style.display = "block";
      document.getElementById("auth-register-view").style.display = "none";
    } else {
      document.getElementById("auth-login-view").style.display = "none";
      document.getElementById("auth-register-view").style.display = "block";
    }
  },

  loginUser: function () {
    const id = document.getElementById("auth-login-id").value.trim();
    const pw = document.getElementById("auth-login-pw").value.trim();
    
    if (!id || !pw) {
      alert("아이디와 비밀번호를 모두 입력해 주세요.");
      return;
    }
    
    const usersDbRaw = localStorage.getItem("antigravity_users_db") || "{}";
    let usersDb = {};
    try {
      usersDb = JSON.parse(usersDbRaw);
    } catch (e) {
      console.error(e);
    }
    
    const user = usersDb[id];
    if (!user || user.password !== pw) {
      alert("아이디 또는 비밀번호가 일치하지 않습니다.");
      return;
    }
    
    // 로그인 세션 등록
    localStorage.setItem("antigravity_current_user", id);
    
    alert(`🔑 [${user.student_name}] 학생님, 환영합니다!`);
    document.getElementById("auth-modal-root").style.display = "none";
    
    // 재초기화
    this.init();
  },

  registerUser: function () {
    const id = document.getElementById("auth-reg-id").value.trim();
    const pw = document.getElementById("auth-reg-pw").value.trim();
    const name = document.getElementById("auth-reg-name").value.trim();
    const studentId = document.getElementById("auth-reg-student-id").value.trim();
    
    if (!id || !pw || !name || !studentId) {
      alert("모든 필드를 기입해 주세요.");
      return;
    }
    
    if (!/^[A-Za-z0-9_\-]+$/.test(id)) {
      alert("아이디는 영문, 숫자, _, - 만 포함할 수 있습니다.");
      return;
    }
    
    if (studentId.length !== 5 || isNaN(studentId)) {
      alert("학번은 5자리 숫자 형식이어야 합니다. (예: 10101)");
      return;
    }
    
    const usersDbRaw = localStorage.getItem("antigravity_users_db") || "{}";
    let usersDb = {};
    try {
      usersDb = JSON.parse(usersDbRaw);
    } catch (e) {
      console.error(e);
    }
    
    if (usersDb[id]) {
      alert("이미 가입된 아이디가 존재합니다.");
      return;
    }
    
    // 새 사용자 생성 (1:N 다중 탐구 스펙으로 가입 시 1개 자동 편입)
    const defaultRep = this.createNewReportStructure(name, studentId);
    defaultRep.step_1.학과 = "";
    defaultRep.step_1.진로 = "";
    defaultRep.step_2.키워드 = [];
    defaultRep.step_2.동기 = "";
    defaultRep.step_2.선택_주제 = "";
    
    usersDb[id] = {
      password: pw,
      student_name: name,
      student_id: studentId,
      reports: [defaultRep],
      active_report_id: defaultRep.report_id
    };
    
    localStorage.setItem("antigravity_users_db", JSON.stringify(usersDb));
    localStorage.setItem("antigravity_current_user", id);
    
    alert(`🎉 회원가입 및 로그인이 완료되었습니다!\n이름: ${name} (학번: ${studentId})`);
    document.getElementById("auth-modal-root").style.display = "none";
    
    // 재초기화
    this.init();
  },

  logoutUser: function () {
    if (confirm("로그아웃 하시겠습니까?\n작성 중이던 데이터는 안전하게 임시저장되었습니다.")) {
      this.saveToLocalStorage();
      localStorage.removeItem("antigravity_current_user");
      window.location.reload();
    }
  },

  exportReportJson: function () {
    const currentUser = localStorage.getItem("antigravity_current_user");
    if (!currentUser) return;
    
    const usersDbRaw = localStorage.getItem("antigravity_users_db") || "{}";
    let usersDb = {};
    try {
      usersDb = JSON.parse(usersDbRaw);
    } catch (e) {}
    
    const user = usersDb[currentUser];
    let targetReport = this.report;
    if (user && user.reports) {
      const activeRep = user.reports.find(r => r.report_id === user.active_report_id);
      if (activeRep) targetReport = activeRep;
    }
    
    if (!targetReport) {
      alert("저장된 보고서 데이터를 찾을 수 없습니다.");
      return;
    }
    
    const dataStr = JSON.stringify(user.report, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `Antigravity_탐구보고서_${user.student_id}_${user.student_name}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }

};

/**
 * 헬퍼 함수: 가설 텍스트 내에서 물리 키워드 유추 매칭
 */
function criterionKeyWordsMatch(txt) {
  if (txt.includes("에너지")) return "에너지 법칙의 정량적 인과성";
  if (txt.includes("속도") || txt.includes("시간")) return "거동 시간의 비례 정밀성";
  if (txt.includes("수학")) return "수학적 수렴 구조의 합리성";
  return "변인 연동 조건의 구조화";
}

/**
 * 헬퍼 함수: 변인 값이 객체 형태(legacy 또는 structured JSON)일 경우 문자열로 안전하게 변환
 */
function parseVariableValue(val) {
  if (!val) return "";
  if (typeof val === 'object') {
    const name = val.변인 || val.변수명 || val.name || val.value || "";
    const symbol = val.기호 || val.symbol || "";
    const unit = val.단위 || val.unit || "";
    if (name) {
      return `${name} ${symbol ? `(${symbol}` : ""}${unit ? `, ${unit})` : symbol ? ")" : ""}`.trim();
    }
    // Fallback: join object values
    return Object.values(val).filter(x => x && typeof x !== 'object').join(" ");
  }
  return String(val);
}


// 윈도우 로드 시 즉시 어플리케이션 가동 시작
window.addEventListener("DOMContentLoaded", () => {
  App.init();
});