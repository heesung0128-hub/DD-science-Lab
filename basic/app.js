/**
 * Antigravity 애플리케이션 코어 컨트롤러 (기초형 - 4단계 구성)
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
  // 현재 보고서 상태 데이터 객체 (기초형 데이터 매핑 - 교사용 연계를 위해 기존 스펙 유지)
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
    // 0. URL 동기화 파라미터 감지 및 자동 로드 (선생님이 학생용 공유 링크 배포 시 적용)
    const urlParams = new URLSearchParams(window.location.search);
    const syncConfig = urlParams.get("sync");
    if (syncConfig) {
      try {
        const decoded = JSON.parse(atob(syncConfig));
        if (decoded.dbUrl) {
          localStorage.setItem("firebase_db_url", decoded.dbUrl);
          localStorage.setItem("firebase_api_key", decoded.apiKey || "");
          localStorage.setItem("firebase_project_id", decoded.projectId || "");
          console.log("🔗 공유 링크를 통해 실시간 클라우드 DB 설정이 자동으로 세팅되었습니다.");
        }
      } catch (err) {
        console.error("동기화 공유 파라미터 해석 중 오류:", err);
      }
      // 주소창에서 동기화 파라미터 제거
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }

    // Firebase 초기화 호출
    this.initFirebase();

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

    // Firebase 실시간 클라우드 동기화 풀(Pull) 시도
    if (this.isCloudEnabled && this.db) {
      this.db.ref("users/" + currentUser).once("value").then(snapshot => {
        const val = snapshot.val();
        if (val) {
          const usersDbRaw = localStorage.getItem("antigravity_users_db") || "{}";
          let usersDb = {};
          try { usersDb = JSON.parse(usersDbRaw); } catch(e) {}
          usersDb[currentUser] = val;
          localStorage.setItem("antigravity_users_db", JSON.stringify(usersDb));
          
          const activeId = val.active_report_id || (val.reports && val.reports[0]?.report_id);
          const activeRep = val.reports?.find(r => r.report_id === activeId) || val.reports?.[0];
          if (activeRep) {
            this.report = this.ensureReportSchema(activeRep);
            this.restoreFormValues();
            this.renderInquiryList();
            console.log("☁️ Firebase 클라우드 DB로부터 최신 학생 데이터를 동기화 로드했습니다.");
          }
        }
      }).catch(err => {
        console.warn("Firebase 실시간 동기화 Pulling 실패 (로컬 모드 진행):", err);
      });
    }

    // 로그인 되어 있는 경우: 사용자 프로필 표시 및 데이터 복원
    const usersDbRaw = localStorage.getItem("antigravity_users_db");
    if (usersDbRaw) {
      try {
        const usersDb = JSON.parse(usersDbRaw);
        const userRecord = usersDb[currentUser];
        if (userRecord) {
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
            
            // 학번 파싱을 통한 학년/학급 강제 고정
            if (userRecord.student_id && userRecord.student_id.length === 5) {
              let gradeNum = parseInt(userRecord.student_id.charAt(0), 10);
              if (gradeNum < 1 || gradeNum > 3) gradeNum = 1;
              let classNum = parseInt(userRecord.student_id.substring(1, 3), 10);
              if (classNum < 1 || classNum > 12) classNum = 1;
              activeRep.step_1.학년 = gradeNum;
              activeRep.step_1.학급 = classNum;
            }
            
            this.report = this.ensureReportSchema(activeRep);
            localStorage.setItem("antigravity_users_db", JSON.stringify(usersDb));
          } catch (innerErr) {
            console.warn("사용자 리포트 복구 중 예외가 감지되어 새 리포트를 적재합니다.", innerErr);
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

    // 초기 바인딩 및 뷰 업데이트
    this.restoreFormValues();
    this.renderExplorationTypes();
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

  initFirebase: function () {
    const dbUrl = localStorage.getItem("firebase_db_url");
    const apiKey = localStorage.getItem("firebase_api_key");
    const projectId = localStorage.getItem("firebase_project_id");

    if (dbUrl && window.firebase) {
      try {
        if (firebase.apps.length === 0) {
          firebase.initializeApp({
            apiKey: apiKey || "",
            projectId: projectId || "",
            databaseURL: dbUrl
          });
        }
        this.db = firebase.database();
        this.isCloudEnabled = true;
        console.log("📡 Firebase Realtime Database가 성공적으로 연동되었습니다.");
      } catch (err) {
        console.error("Firebase 초기화 중 예외 발생:", err);
        this.isCloudEnabled = false;
      }
    } else {
      this.isCloudEnabled = false;
    }
  },

  /**
   * 교육과정 뱃지 및 메타정보 업데이트
   */
  updateCurriculumBadge: function () {
    const year = 2026;
    const grade = parseInt(this.report.step_1.학년);
    
    const computedVersion = getDefaultCurriculum(year, grade);
    this.report.metadata.교육과정_버전 = computedVersion;
    
    const badgeEl = document.getElementById("curriculum-indicator");
    if (computedVersion === "v2022") {
      badgeEl.innerHTML = "✨ 2022 개정 교육과정 적용 학년";
      badgeEl.style.borderColor = "#10b981";
      badgeEl.style.color = "#10b981";
    } else {
      badgeEl.innerHTML = "📝 2015 개정 교육과정 대상 학년";
      badgeEl.style.borderColor = "#f59e0b";
      badgeEl.style.color = "#f59e0b";
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

    const computedVersion = getDefaultCurriculum(2026, grade);
    this.report.metadata.교육과정_버전 = computedVersion;
    this.updateCurriculumBadge();

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
   * 키워드 태그 핸들링
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

  handleStep2Input: function () {
    const motivation = document.getElementById("input-theme-motivation").value;
    const finalTheme = document.getElementById("input-final-theme").value;
    
    this.report.step_2.동기 = motivation;
    this.report.step_2.선택_주제 = finalTheme;

    // 기초형은 가설(step_4.가설)이 없으므로, 교사용 대시보드 호환성을 위해 확정된 주제를 가설 필드에도 가볍게 복제해 둠
    this.report.step_4.가설 = finalTheme;

    this.checkTopicCurriculumAlignment();
    this.updateSummaryPanel();
  },

  /**
   * AI 주제 제안 트리거 (웹 브릿지 대응)
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
    container.innerHTML = "<div style='padding:20px; text-align:center; color: var(--accent); font-weight: 600;'>🤖 AI가 교육과정 DB를 분석하여 탐구 주제 후보를 생성 중입니다...</div>";

    try {
      const result = await MockAI.suggestTopics(context);
      container.innerHTML = "";

      if (result.verdict === "direct" || forceDirect || !result.verdict) {
        this.report.step_2.AI_제안_주제 = result.candidates.map(c => c.title);

        const helper = document.createElement("p");
        helper.className = "field-helper-tip";
        helper.style.marginBottom = "12px";
        helper.innerHTML = "✅ <strong>추천 탐구 주제 목록:</strong> 원하는 주제 카드를 클릭하면 주제 칸에 자동 입력됩니다.";
        container.appendChild(helper);

        const wrapper = document.createElement("div");
        wrapper.className = "ai-topics-wrapper";
        
        result.candidates.forEach((item, idx) => {
          const card = document.createElement("div");
          card.className = "ai-topic-select-card";
          
          card.innerHTML = `
            <h4>📌 ${item.title}</h4>
            <p>${item.description}</p>
          `;
          card.onclick = () => {
            document.querySelectorAll(".ai-topic-select-card").forEach(c => c.classList.remove("selected"));
            card.classList.add("selected");
            document.getElementById("input-final-theme").value = item.title;
            App.report.step_2.선택_주제 = item.title;
            App.report.step_4.가설 = item.title;
            App.handleStep2Input();
            App.saveToLocalStorage();
          };
          wrapper.appendChild(card);
        });
        container.appendChild(wrapper);
        this.updateMentorAdvice("✨ 맞춤 탐구 주제 제안이 완료되었습니다! 마음에 드는 카드를 골라 탐구를 계속하세요.");
      } else {
        // 우회 분석 조언 간소화 노출
        const wrap = document.createElement("div");
        wrap.style.padding = "16px";
        wrap.style.borderRadius = "var(--radius-md)";
        wrap.style.background = "rgba(245,158,11,0.04)";
        wrap.style.border = "1px solid rgba(245,158,11,0.15)";
        
        wrap.innerHTML = `
          <h4 style="color:var(--warning); font-size:0.9rem; margin-bottom:8px;">⚠️ 키워드가 학술 탐구 방향과 어울리도록 조율을 제안합니다</h4>
          <p style="font-size:0.8rem; color:var(--text-secondary); line-height:1.6; margin-bottom:12px;">${result.reason}</p>
          <button class="btn btn-secondary" onclick="App.triggerTopicGeneration(true)">🔓 그래도 원래 키워드로 주제 추천 받기</button>
        `;
        container.appendChild(wrap);
      }

      if (result.isFallback) {
        const fallAlert = document.createElement("div");
        fallAlert.style.marginTop = "12px";
        fallAlert.style.fontSize = "0.75rem";
        fallAlert.style.color = "var(--accent)";
        fallAlert.innerHTML = `ℹ️ <strong>모의 체험(Simulated) AI 모드</strong>로 주제가 제안되었습니다. API 설정을 하려면 우측 상단 ⚙️을 클릭하세요.`;
        container.appendChild(fallAlert);
      }
      this.saveToLocalStorage();
    } catch (e) {
      console.error(e);
      container.innerHTML = `<div style='padding:20px; text-align:center; color: var(--danger);'>주제 제안 중 오류가 발생했습니다: ${e.message}<br><button class="btn btn-secondary" style="margin-top:10px;" onclick="App.triggerTopicGeneration()">다시 시도</button></div>`;
    }
  },

  /**
   * 1단계: 탐구 유형 그리드 렌더링
   */
  renderExplorationTypes: function () {
    const grid = document.getElementById("exploration-types-grid");
    if (!grid) return;
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
        App.updateLabelNamesByInquiryType();
        App.handleStep2Input();
        App.saveToLocalStorage();
      };
      grid.appendChild(box);
    });
  },

  updateLabelNamesByInquiryType: function () {
    const type = this.report.step_2.탐구유형;
    const procedureLabel = document.getElementById("label-step5-procedure");
    const toolsLabel = document.getElementById("label-step5-tools");

    if (!procedureLabel || !toolsLabel) return;

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
   * 공통 인풋 싱크
   */
  handleGenericInput: function (stepNum) {
    if (stepNum === 5) {
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
    }
    this.updateSummaryPanel();
  },

  handleStep7Input: function () {
    const finalConclusion = document.getElementById("input-step7-final-conclusion").value;
    this.report.step_7.가설_검증 = {
      판정: "지지", // 기초형은 가설 검증이 없으므로 기본 '지지'로 통일 세팅
      근거: "관찰 결과에 따른 결론 도출",
      최종_결론: finalConclusion
    };
    this.handleGenericInput(7);
  },

  /**
   * 인라인 AI 답변 추천 트리거
   */
  openAiSuggestInline: async function (step, field, targetInputId) {
    this.activeSuggestTargetId = targetInputId;

    const root = document.getElementById("ai-suggest-popover-root");
    const container = document.getElementById("popover-candidates-list");
    
    container.innerHTML = "<div style='padding:16px; text-align:center; color: var(--primary); font-size:0.75rem; font-weight:600;'>🔮 AI가 탐구 맥락을 기반으로 추천 예안 후보를 구성 중입니다...</div>";
    root.style.display = "block";

    try {
      const candidates = await MockAI.getSuggestions(step, field, this.report);
      container.innerHTML = "";

      candidates.forEach((txt, idx) => {
        const item = document.createElement("div");
        item.className = "popover-candidate-item";
        item.innerHTML = `<strong>추천 ${idx + 1}</strong><br>${txt}`;
        item.onclick = () => {
          const inputField = document.getElementById(App.activeSuggestTargetId);
          inputField.value = txt;
          
          inputField.classList.remove("prefilled-field");
          
          if (step === 5) App.handleGenericInput(5);
          else if (step === 6) App.handleGenericInput(6);
          else if (step === 7) {
            if (targetInputId === "input-step7-final-conclusion") {
              App.handleStep7Input();
            } else {
              App.handleGenericInput(7);
            }
          }
          
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
   * 내비게이션 제어 (4단계로 축소)
   */
  navigateToStep: function (stepNum) {
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
    this.updateSummaryPanel();
    this.updateMentorAdvice();
    this.updateGuideArea();

    if (stepNum === 2 && this.report.step_2.키워드.length === 0) {
      this.showRecommendedKeywords();
      this.checkTopicCurriculumAlignment();
    }

    // 4단계(수행) 진입 시 prefill 가동
    if (stepNum === 4) {
      this.prefillStep6Values();
    }

    this.saveToLocalStorage();
  },

  navigateNext: function () {
    const current = this.report.metadata.current_step;
    if (current < 5) {
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
    const percentage = ((current - 1) / 4) * 100;
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

    if (current === 5) {
      nextBtn.style.display = "none";
    } else {
      nextBtn.style.display = "inline-flex";
    }
  },

  /**
   * 데이터 강제 복원
   */
  restoreFormValues: function () {
    const r = this.report;

    const nameEl = document.getElementById("input-student-name");
    const idEl = document.getElementById("input-student-id");
    if (nameEl) {
      nameEl.value = r.student_name || "";
      nameEl.disabled = true;
    }
    if (idEl) {
      idEl.value = r.student_id || "";
      idEl.disabled = true;
    }

    const gradeEl = document.getElementById("input-grade");
    const classEl = document.getElementById("input-class");
    if (gradeEl) gradeEl.value = r.step_1.학년;
    if (classEl) classEl.value = r.step_1.학급 || 1;
    
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

    document.getElementById("input-theme-motivation").value = r.step_2.동기 || "";
    document.getElementById("input-final-theme").value = r.step_2.선택_주제 || "";

    // 2단계 (계획)
    document.getElementById("input-step5-procedure").value = r.step_5.절차_방법 || "";
    document.getElementById("input-step5-tools").value = r.step_5.도구_자료 || "";
    document.getElementById("input-step5-reliability").value = r.step_5.신뢰성_타당성 || "";

    // 3단계 (수행)
    document.getElementById("input-step6-collect").value = r.step_6.자료_수집 || "";
    document.getElementById("input-step6-process").value = r.step_6.자료_처리_분석 || "";
    document.getElementById("input-step6-observation").value = r.step_6.핵심_수치_관찰 || "";

    // 4단계 (결론)
    document.getElementById("input-step7-facts").value = r.step_7.사실_정리 || "";
    if (r.step_7.가설_검증) {
      document.getElementById("input-step7-final-conclusion").value = r.step_7.가설_검증.최종_결론 || "";
    }
    document.getElementById("input-step7-limits").value = r.step_7.한계_후속 || "";

    // 4단계 진입 상태일 때 자동 prefill 가동 검사
    if (r.metadata.current_step === 4) {
      this.prefillStep6Values();
    }
  },

  /**
   * 우측 상단: 입력 현황 요약
   */
  updateSummaryPanel: function () {
    const box = document.getElementById("summary-content-box");
    const r = this.report;

    const subjectText = r.step_1.교과목?.과목명 
      ? `[${r.step_1.교과목.교과}] ${r.step_1.교과목.과목명}`
      : "미선택";

    box.innerHTML = `
      <div class="summary-item-line"><strong>학생 정보:</strong> ${r.student_name || "미기입"} (${r.student_id || "학번미기입"})</div>
      <div class="summary-item-line"><strong>교과목:</strong> ${subjectText}</div>
      <div class="summary-item-line"><strong>선택 주제:</strong> ${r.step_2.선택_주제 || "미선택"}</div>
      <div class="summary-item-line"><strong>탐구 유형:</strong> ${EXPLORATION_TYPES.find(t => t.id === r.step_2.탐구유형)?.label || "미선택"}</div>
      <div class="summary-item-line"><strong>핵심 관찰:</strong> ${r.step_6.핵심_수치_관찰 || "미작성"}</div>
      <div class="summary-item-line"><strong>최종 결론:</strong> ${r.step_7.가설_검증?.최종_결론 || "미작성"}</div>
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
   * AI 멘토 멘트 실시간 업데이트 (4단계 매핑)
   */
  updateMentorAdvice: function (customText) {
    const step = this.report.metadata.current_step;
    const avatarEl = document.getElementById("ai-mentor-avatar");
    const textEl = document.getElementById("ai-mentor-advice-text");

    if (customText) {
      textEl.innerHTML = `<p>${customText}</p>`;
      return;
    }

    const advices = {
      1: {
        avatar: "👨‍🏫",
        html: `<p>반갑습니다! 탐구의 시작점인 <strong>기본 정보 설정</strong> 단계입니다.</p>
               <p>본인의 학적과 관심 진로에 맞는 탐구 연계 과목을 확인하고 설정해 주세요.</p>`
      },
      2: {
        avatar: "🔮",
        html: `<p>나만의 멋진 **탐구 주제를 탐색하고 확정**할 시간입니다.</p>
               <p>희망 진로와 관련된 관심 키워드를 입력해 보세요. <strong>[AI 주제 추천 받기]</strong>를 누르면 교육과정에 맞춤화된 훌륭한 탐구 제안을 제공해 드립니다.</p>`
      },
      3: {
        avatar: "📐",
        html: `<p>확정한 주제를 어떻게 증명할지 **구체적인 실행 계획**을 세울 시간입니다.</p>
               <p>실험 방법이나 조사 방법을 1, 2, 3 단계별로 나누어 적어보세요. 오차를 방지하고 더 신뢰성 높은 데이터를 모으기 위한 안전 장치를 함께 설계하면 아주 우수한 보고서가 됩니다.</p>`
      },
      4: {
        avatar: "📈",
        html: `<p>설계했던 계획이 드디어 **수행 내역**으로 연결되는 핵심 단계입니다!</p>
               <p>3단계 계획의 문장을 AI가 과거형의 **수행 완료 내역**으로 자동 변환해 두었습니다(Prefill). 실제 실행 과정에서 관찰된 핵심적인 수치와 특이 반응들을 상세하게 적어 주시면 신뢰도가 급증합니다.</p>`
      },
      5: {
        avatar: "🏁",
        html: `<p>탐구의 여정을 멋지게 끝맺는 **종합 결론** 도출 단계입니다.</p>
               <p>모은 관찰 데이터로부터 밝혀낸 사실을 가다듬고, 최종 결론 한 문장을 학생 스스로 정성스레 작성해 주세요. 탐구 중 한계점과 후속 질문을 적으며 한 층 더 성장해 보세요!</p>`
      }
    };

    const advice = advices[step];
    if (advice) {
      avatarEl.textContent = advice.avatar;
      textEl.innerHTML = advice.html;
    }
  },

  /**
   * 도움말 & 예시 탭
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

    // 4단계 도움말 예시 구성
    const guides = {
      1: {
        help: "계열별로 학과와 진로명이 조화를 이루면 학생의 탐구 개성이 돋보입니다. 관심 과목을 정확히 정해야 관련 성취기준을 불러옵니다.",
        example: "희망 진로: 로봇 공학자 / 과목: 물리학Ⅰ\n계열: 공학 계열"
      },
      2: {
        help: "관심 키워드는 3~4개의 명사로 입력해 보며, AI 추천 카드를 클릭하면 하단 최종 주제에 바로 세팅됩니다. 유형 선택은 필수 단계입니다.",
        example: "키워드: #충돌, #에너지보존, #MBL센서\n최종주제: MBL 스마트 트랙을 이용한 두 물체의 평면 충돌 시 탄성 에너지 변화 분석"
      },
      3: {
        help: "실행할 행동 절차를 시간 순서대로 1, 2, 3 번호를 매겨 상세히 나열합니다. 측정할 주요 수치(예: 온도, 기압 등)와 도구의 규격을 구체적으로 표기하는 것이 설계의 핵심입니다.",
        example: "방법:\n1. MBL 스마트 카트를 수평 트랙에 고정한다.\n2. 발사 장치로 일정한 속도를 주어 5회 충돌시킨다.\n3. 충격 센서로 압력을 수집한다.\n준비자료: MBL 스마트 카트, 충격 압력 센서, 전용 분석 툴"
      },
      4: {
        help: "수집한 데이터와 표, 혹은 관찰 수치 결과를 적습니다. 계획을 그대로 옮기기 위해 상단의 [계획에서 가져오기] 버튼을 적극 활용하시고, 변동된 오차나 관찰 수치를 명확히 쓰세요.",
        example: "관찰 결과:\n조작 속도 1.2m/s 충돌 결과, 평균 반발계수는 0.84였으나, 속도가 2.4m/s로 증가했을 때는 0.72로 에너지가 비선형적으로 유실되는 양상을 관찰함."
      },
      5: {
        help: "수집한 관찰 데이터를 정돈하여 알게 된 탐구 결론을 내립니다. 가설을 세우지 않았더라도, 수치의 증감 관계나 경향성이 뚜렷이 밝혀졌는지 본인만의 문장으로 종합 요약하여 제출합니다.",
        example: "결과 요약: 기체 온도 상승 시 분자 확산율은 지수함수적으로 빨라짐.\n최종 결론: 샤를의 법칙에 의거하여 온도가 기체 운동 속도에 선형적 상승 효과를 유도함을 정량적으로 규명함."
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
   * 로컬 스토리지 및 Firebase 클라우드 저장
   */
  saveToLocalStorage: function () {
    const currentUser = localStorage.getItem("antigravity_current_user");
    if (!currentUser) return;

    this.report.metadata.updated_at = new Date().toISOString();
    
    const usersDbRaw = localStorage.getItem("antigravity_users_db");
    if (usersDbRaw) {
      try {
        const usersDb = JSON.parse(usersDbRaw);
        const userRecord = usersDb[currentUser];
        if (userRecord && userRecord.reports) {
          this.report.student_name = userRecord.student_name;
          this.report.student_id = userRecord.student_id;
          
          const activeId = userRecord.active_report_id || this.report.report_id;
          const idx = userRecord.reports.findIndex(r => r.report_id === activeId);
          if (idx !== -1) {
            userRecord.reports[idx] = this.report;
          } else {
            userRecord.reports.push(this.report);
          }
          userRecord.active_report_id = activeId;
          
          localStorage.setItem("antigravity_users_db", JSON.stringify(usersDb));

          if (this.isCloudEnabled && this.db) {
            this.db.ref("users/" + currentUser).set(userRecord)
              .catch(err => console.warn("Firebase 실시간 동기화 업로드 실패:", err));
          }
          this.renderInquiryList();
        }
      } catch (e) {
        console.error("사용자 DB 업데이트 실패", e);
      }
    }
    
    localStorage.setItem("antigravity_report_save", JSON.stringify(this.report));
    
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
    }, 3000);
  },

  openFinalPreview: function () {
    this.saveToLocalStorage();
    PDFExport.openPreview(this.report);
  },

  ensureReportSchema: function (rep) {
    if (!rep) return JSON.parse(JSON.stringify(this.defaultReportTemplate));
    const defaultTemplate = JSON.parse(JSON.stringify(this.defaultReportTemplate));
    
    const merge = (target, source) => {
      for (const key in source) {
        if (source.hasOwnProperty(key)) {
          if (target[key] === undefined || target[key] === null) {
            target[key] = source[key];
          } else if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
            if (typeof target[key] !== 'object' || target[key] === null) {
              target[key] = {};
            }
            merge(target[key], source[key]);
          }
        }
      }
    };
    
    merge(rep, defaultTemplate);
    return rep;
  },

  createNewReportStructure: function (name, studentId) {
    if (!this.defaultReportTemplate) {
      this.defaultReportTemplate = JSON.parse(JSON.stringify(this.report));
    }
    const defaultRep = JSON.parse(JSON.stringify(this.defaultReportTemplate));
    defaultRep.report_id = "rep_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
    defaultRep.student_name = name;
    defaultRep.student_id = studentId;
    
    if (studentId && studentId.length === 5) {
      let gradeNum = parseInt(studentId.charAt(0), 10);
      if (gradeNum < 1 || gradeNum > 3) gradeNum = 1;
      let classNum = parseInt(studentId.substring(1, 3), 10);
      if (classNum < 1 || classNum > 12) classNum = 1;
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
            
            this.restoreFormValues();
            this.navigateToStep(1);
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

          this.restoreFormValues();
          this.navigateToStep(1);
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
        if (userRecord.reports.length <= 1) {
          alert("⚠️ 최소 1개 이상의 탐구 과제는 유지되어야 하므로 삭제할 수 없습니다.");
          return;
        }

        const activeId = userRecord.active_report_id || this.report.report_id;
        const currentSubject = this.report.step_1?.교과목?.과목명 || "과목미정";
        const currentTopic = this.report.step_2?.선택_주제 || "주제미정";

        if (confirm(`🗑️ 정말 이 탐구 과제를 삭제하시겠습니까?\n\n[대상 과목]: ${currentSubject}\n[대상 주제]: ${currentTopic}\n\n삭제된 내용은 영구히 복구할 수 없습니다.`)) {
          userRecord.reports = userRecord.reports.filter(r => r.report_id !== activeId);
          userRecord.active_report_id = userRecord.reports[0].report_id;
          
          this.report = userRecord.reports[0];
          localStorage.setItem("antigravity_users_db", JSON.stringify(usersDb));
          
          this.restoreFormValues();
          this.navigateToStep(1);
          this.renderInquiryList();
          alert("🗑️ 탐구 과제가 정상적으로 삭제되었습니다.");
        }
      }
    } catch (e) {
      console.error("탐구 삭제 중 오류:", e);
    }
  },

  /**
   * AI API 설정 모달 제어
   */
  openSettingsModal: function () {
    const modal = document.getElementById("settings-modal-root");
    if (modal) {
      const provider = localStorage.getItem("active_ai_provider") || "gemini";
      document.getElementById("settings-ai-provider").value = provider;
      
      document.getElementById("settings-gemini-key").value = localStorage.getItem("gemini_api_key") || "";
      document.getElementById("settings-openai-key").value = localStorage.getItem("openai_api_key") || "";
      document.getElementById("settings-claude-key").value = localStorage.getItem("claude_api_key") || "";
      document.getElementById("settings-cors-proxy").value = localStorage.getItem("cors_proxy_url") || "";
      
      if (document.getElementById("settings-firebase-url")) {
        document.getElementById("settings-firebase-url").value = localStorage.getItem("firebase_db_url") || "";
      }
      if (document.getElementById("settings-firebase-key")) {
        document.getElementById("settings-firebase-key").value = localStorage.getItem("firebase_api_key") || "";
      }
      if (document.getElementById("settings-firebase-project")) {
        document.getElementById("settings-firebase-project").value = localStorage.getItem("firebase_project_id") || "";
      }

      this.onSettingsProviderChange();
      
      const savedModel = localStorage.getItem("active_ai_model");
      if (savedModel) {
        document.getElementById("settings-ai-model").value = savedModel;
      }
      modal.style.display = "flex";
    }
  },

  closeSettingsModal: function () {
    const modal = document.getElementById("settings-modal-root");
    if (modal) modal.style.display = "none";
  },

  closeWebBridgeModal: function () {
    const modal = document.getElementById("web-bridge-modal-root");
    if (modal) modal.style.display = "none";
    if (window.webBridgeReject) {
      window.webBridgeReject(new Error("사용자가 모달을 닫았습니다."));
      window.webBridgeReject = null;
      window.webBridgeResolve = null;
    }
  },

  copyWebBridgePrompt: function () {
    const promptText = document.getElementById("web-bridge-prompt-textarea").value;
    navigator.clipboard.writeText(promptText).then(() => {
      const copyBtn = document.getElementById("btn-web-bridge-copy");
      const originalHtml = copyBtn.innerHTML;
      copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> 복사 완료! 제미나이 웹으로 이동 중...';
      copyBtn.style.background = 'var(--success)';
      
      setTimeout(() => {
        copyBtn.innerHTML = originalHtml;
        copyBtn.style.background = '';
      }, 3000);
      
      window.open("https://gemini.google.com/", "_blank");
    }).catch(err => {
      console.error("클립보드 복사 실패:", err);
      alert("프롬프트를 복사하지 못했습니다. 직접 복사하여 사용해 주세요.");
      window.open("https://gemini.google.com/", "_blank");
    });
  },

  submitWebBridge: function () {
    const responseText = document.getElementById("web-bridge-response-textarea").value.trim();
    if (!responseText) {
      alert("제미나이의 답변을 입력해 주세요.");
      return;
    }

    if (window.webBridgeResolve) {
      window.webBridgeResolve(responseText);
      window.webBridgeResolve = null;
      window.webBridgeReject = null;
    }
    
    const modal = document.getElementById("web-bridge-modal-root");
    if (modal) modal.style.display = "none";
  },

  askApiFallback: function () {
    return new Promise((resolve, reject) => {
      const modal = document.getElementById("api-fallback-modal-root");
      if (!modal) {
        resolve("simulated");
        return;
      }
      modal.style.display = "flex";
      window.apiFallbackResolve = (choice) => {
        modal.style.display = "none";
        resolve(choice);
      };
      window.apiFallbackReject = reject;
    });
  },

  selectApiFallback: function (choice) {
    if (window.apiFallbackResolve) {
      window.apiFallbackResolve(choice);
      window.apiFallbackResolve = null;
      window.apiFallbackReject = null;
    }
    const modal = document.getElementById("api-fallback-modal-root");
    if (modal) modal.style.display = "none";
  },

  closeApiFallbackModal: function () {
    if (window.apiFallbackReject) {
      window.apiFallbackReject(new Error("사용자가 모달을 닫았습니다."));
      window.apiFallbackResolve = null;
      window.apiFallbackReject = null;
    }
    const modal = document.getElementById("api-fallback-modal-root");
    if (modal) modal.style.display = "none";
  },

  onSettingsProviderChange: function () {
    const provider = document.getElementById("settings-ai-provider").value;
    
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
    
    const modelSelect = document.getElementById("settings-ai-model");
    modelSelect.innerHTML = "";
    
    const models = {
      gemini: [
        { value: "gemini-3.5-flash", text: "gemini-3.5-flash (기본 - 최신 표준 모델)" },
        { value: "gemini-3.1-pro-preview", text: "gemini-3.1-pro-preview (최신 고성능 추론 모델)" },
        { value: "gemini-3.1-flash-lite", text: "gemini-3.1-flash-lite (최신 고속/경량화 모델)" },
        { value: "gemini-2.5-flash", text: "gemini-2.5-flash (기존 표준 모델)" },
        { value: "gemini-2.5-pro", text: "gemini-2.5-pro (기존 고성능 모델)" }
      ],
      "gemini-web-bridge": [
        { value: "gemini-web-bridge", text: "gemini-free-web (웹 클립보드)" }
      ],
      openai: [
        { value: "gpt-4o-mini", text: "gpt-4o-mini (기본 - 빠름/경제적)" },
        { value: "gpt-4o", text: "gpt-4o (고성능 - 정교함)" }
      ],
      claude: [
        { value: "claude-3-5-haiku-20241022", text: "claude-3-5-haiku (기본)" },
        { value: "claude-3-5-sonnet-20241022", text: "claude-3-5-sonnet (고성능)" }
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

    if (document.getElementById("settings-firebase-url")) {
      const firebaseDbUrl = document.getElementById("settings-firebase-url").value.trim();
      const firebaseApiKey = document.getElementById("settings-firebase-key").value.trim();
      const firebaseProjectId = document.getElementById("settings-firebase-project").value.trim();

      if (firebaseDbUrl) localStorage.setItem("firebase_db_url", firebaseDbUrl);
      else localStorage.removeItem("firebase_db_url");

      if (firebaseApiKey) localStorage.setItem("firebase_api_key", firebaseApiKey);
      else localStorage.removeItem("firebase_api_key");

      if (firebaseProjectId) localStorage.setItem("firebase_project_id", firebaseProjectId);
      else localStorage.removeItem("firebase_project_id");

      this.initFirebase();
    }
    
    let providerName = "알 수 없음";
    if (provider === "gemini") providerName = "구글 Gemini API";
    else if (provider === "gemini-web-bridge") providerName = "구글 Gemini 웹 (무료)";
    else if (provider === "openai") providerName = "OpenAI ChatGPT";
    else if (provider === "claude") providerName = "안드로픽 Claude";

    let statusMsg = `AI 제공자가 [${providerName}](${model})로 설정되었습니다.\n`;
    
    if (provider === "gemini-web-bridge") {
      statusMsg += "제미나이 웹 브릿지 모드가 활성화되었습니다! 개인 교육용 제미나이 웹에서 복사/붙여넣기를 통해 실시간 AI 기능을 무료로 사용합니다.";
    } else {
      const currentKey = provider === "gemini" ? geminiKey : provider === "openai" ? openaiKey : claudeKey;
      if (currentKey) {
        statusMsg += "API 키가 저장되었습니다! 실시간 AI 기능을 사용합니다.";
      } else {
        statusMsg += "등록된 API 키가 없습니다. AI 분석 시 모의 체험(Simulated) AI 모드로 작동합니다.";
      }
    }
    
    alert(statusMsg);
    this.closeSettingsModal();
  },

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
    } catch (e) {
      console.error(e);
      alert("키워드 추천 중 오류가 발생했습니다: " + e.message);
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

  loginUser: function () {
    const id = document.getElementById("auth-login-id").value.trim();
    const pw = document.getElementById("auth-login-pw").value.trim();
    
    if (!id || !pw) {
      alert("아이디와 비밀번호를 모두 입력해 주세요.");
      return;
    }
    
    const proceedLogin = (user, db) => {
      localStorage.setItem("antigravity_current_user", id);
      alert(`🔑 [${user.student_name}] 학생님, 환영합니다!`);
      document.getElementById("auth-modal-root").style.display = "none";
      this.init();
    };

    const usersDbRaw = localStorage.getItem("antigravity_users_db") || "{}";
    let usersDb = {};
    try { usersDb = JSON.parse(usersDbRaw); } catch (e) {}
    
    const localUser = usersDb[id];
    
    if (!localUser && this.isCloudEnabled && this.db) {
      const loginBtn = document.querySelector("#auth-login-view button");
      const originalText = loginBtn ? loginBtn.innerHTML : "로그인";
      if (loginBtn) {
        loginBtn.innerHTML = "⚡ 클라우드 계정 확인 중...";
        loginBtn.disabled = true;
      }

      this.db.ref("users/" + id).once("value").then(snapshot => {
        if (loginBtn) {
          loginBtn.innerHTML = originalText;
          loginBtn.disabled = false;
        }
        const remoteUser = snapshot.val();
        if (remoteUser && remoteUser.password === pw) {
          usersDb[id] = remoteUser;
          localStorage.setItem("antigravity_users_db", JSON.stringify(usersDb));
          proceedLogin(remoteUser, usersDb);
        } else {
          alert("아이디 또는 비밀번호가 일치하지 않습니다.");
        }
      }).catch(err => {
        if (loginBtn) {
          loginBtn.innerHTML = originalText;
          loginBtn.disabled = false;
        }
        console.error("Firebase 로그인 조회 실패:", err);
        alert("네트워크 연결을 확인해 주세요.");
      });
    } else {
      if (!localUser || localUser.password !== pw) {
        alert("아이디 또는 비밀번호가 일치하지 않습니다.");
        return;
      }
      proceedLogin(localUser, usersDb);
    }
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

    const executeRegistration = () => {
      const usersDbRaw = localStorage.getItem("antigravity_users_db") || "{}";
      let usersDb = {};
      try { usersDb = JSON.parse(usersDbRaw); } catch (e) {}
      
      if (usersDb[id]) {
        alert("이미 가입된 아이디가 존재합니다.");
        return;
      }
      
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
  
      if (this.isCloudEnabled && this.db) {
        this.db.ref("users/" + id).set(usersDb[id])
          .catch(err => console.warn("Firebase 회원가입 동기화 실패:", err));
      }
      
      alert(`🎉 회원가입 및 로그인이 완료되었습니다!\n이름: ${name} (학번: ${studentId})`);
      document.getElementById("auth-modal-root").style.display = "none";
      this.init();
    };

    if (this.isCloudEnabled && this.db) {
      const regBtn = document.querySelector("#auth-register-view button");
      const originalText = regBtn ? regBtn.innerHTML : "회원가입 완료";
      if (regBtn) {
        regBtn.innerHTML = "⚡ 아이디 중복 확인 중...";
        regBtn.disabled = true;
      }

      this.db.ref("users/" + id).once("value").then(snapshot => {
        if (regBtn) {
          regBtn.innerHTML = originalText;
          regBtn.disabled = false;
        }
        if (snapshot.exists()) {
          alert("이미 가입된 아이디가 존재합니다. 다른 아이디를 입력해 주세요.");
        } else {
          executeRegistration();
        }
      }).catch(err => {
        if (regBtn) {
          regBtn.innerHTML = originalText;
          regBtn.disabled = false;
        }
        console.error("Firebase 아이디 중복 체크 실패 (오프라인 모드 가입 진행):", err);
        executeRegistration();
      });
    } else {
      executeRegistration();
    }
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
    try { usersDb = JSON.parse(usersDbRaw); } catch (e) {}
    
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
    
    const dataStr = JSON.stringify(targetReport, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `Antigravity_기초형_탐구보고서_${user.student_id}_${user.student_name}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  },

  prefillStep6Values: function () {
    const collectInput = document.getElementById("input-step6-collect");
    if (!collectInput) return;
    
    if (this.report.step_6.자료_수집 && this.report.step_6.자료_수집.trim().length > 0) {
      if (collectInput.value !== this.report.step_6.자료_수집) {
        collectInput.value = this.report.step_6.자료_수집;
      }
      return;
    }
    
    const procedure = this.report.step_5.절차_방법 || "";
    if (!procedure.trim()) {
      collectInput.value = "";
      return;
    }
    
    const converted = this.convertProcedureToPastTense(procedure);
    this.report.step_6.자료_수집 = converted;
    collectInput.value = converted;
  },

  forcePrefillStep6: function () {
    const procedure = this.report.step_5.절차_방법 || "";
    if (!procedure.trim()) {
      alert("3단계 탐구 절차 및 방법이 입력되지 않았습니다. 3단계 절차를 먼저 작성해 주세요.");
      return;
    }
    
    const collectInput = document.getElementById("input-step6-collect");
    if (collectInput && collectInput.value.trim().length > 0) {
      if (!confirm("이미 입력된 자료 수집 내역이 있습니다. 3단계 계획 절차를 과거형 시제로 변환하여 덮어쓰시겠습니까?")) {
        return;
      }
    }
    
    const converted = this.convertProcedureToPastTense(procedure);
    this.report.step_6.자료_수집 = converted;
    if (collectInput) {
      collectInput.value = converted;
    }
    this.saveToLocalStorage();
    alert("✅ 3단계 계획 절차가 과거형 시제로 변환되어 수행 내역에 반영되었습니다.");
  },

  convertProcedureToPastTense: function (text) {
    if (!text) return "";
    
    let lines = text.split("\n");
    let convertedLines = lines.map(line => {
      let replaced = line;
      const rules = [
        { pattern: /설정한다/g, replace: "설정하였다" },
        { pattern: /기록한다/g, replace: "기록하였다" },
        { pattern: /실시한다/g, replace: "실시하였다" },
        { pattern: /측정한다/g, replace: "측정하였다" },
        { pattern: /분석한다/g, replace: "분석하였다" },
        { pattern: /구현한다/g, replace: "구현하였다" },
        { pattern: /수집한다/g, replace: "수집하였다" },
        { pattern: /고정한다/g, replace: "고정하였다" },
        { pattern: /세팅한다/g, replace: "세팅하였다" },
        { pattern: /비교한다/g, replace: "비교하였다" },
        { pattern: /검증한다/g, replace: "검증하였다" },
        { pattern: /도출한다/g, replace: "도출하였다" },
        { pattern: /준비한다/g, replace: "준비하였다" },
        { pattern: /설계한다/g, replace: "설계하였다" },
        { pattern: /연산한다/g, replace: "연산하였다" },
        { pattern: /연계한다/g, replace: "연계하였다" },
        { pattern: /정제한다/g, replace: "정제하였다" },
        { pattern: /수행한다/g, replace: "수행하였다" },
        { pattern: /참고한다/g, replace: "참고하였다" },
        { pattern: /작성한다/g, replace: "작성하였다" },
        { pattern: /배포한다/g, replace: "배포하였다" },
        { pattern: /회수한다/g, replace: "회수하였다" },
        { pattern: /유도한다/g, replace: "유도하였다" },
        { pattern: /확인한다/g, replace: "확인하였다" },
        { pattern: /제작한다/g, replace: "제작하였다" },
        { pattern: /관측한다/g, replace: "관측하였다" },
        { pattern: /분류한다/g, replace: "분류하였다" },
        { pattern: /대조한다/g, replace: "대조하였다" },
        { pattern: /한다/g, replace: "하였다" },
        { pattern: /이다/g, replace: "이었다" }
      ];
      
      rules.forEach(rule => {
        replaced = replaced.replace(rule.pattern, rule.replace);
      });
      return replaced;
    });
    
    return convertedLines.join("\n");
  }

};

function toggleAuthView(view) {
  App.toggleAuthView(view);
}

// 윈도우 로드 시 즉시 어플리케이션 가동 시작
window.addEventListener("DOMContentLoaded", () => {
  App.init();
});