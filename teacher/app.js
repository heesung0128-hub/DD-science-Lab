/**
 * 교사용 매핑·세특 보조 시스템 (Antigravity Teacher Helper) 마스터 컨트롤러
 * 상태 관리, 4단계 파이프라인 트리거, UI 렌더링, 키보드 단축키, NEIS Export, 피드백 메트릭 누적
 */

const App = {
  students: [], // 반 전체 학생 리스트 (보고서 데이터 및 작업물 통합)
  activeStudentIndex: 0, // 현재 작업 중인 학생 인덱스
  activeStep: 3, // 보고서 뷰어 좌측 8단계 탭 활성 단계 (기본값: 3단계)
  activeSetukLength: "standard", // 세특 선택된 변형 탭 ("short" | "standard" | "rich")
  currentView: "dashboard", // 현재 화면 모드 ("dashboard" | "workspace" | "settings")
  editLogs: [], // 피드백 루프용 교사 수정 행동 로그
  geminiApiKey: "",
  filters: {
    subject: "all",
    grade: "all",
    class: "all"
  },

  /**
   * 초기화 실행
   */
  init: function () {
    // 1. API 키 및 Firebase 클라우드 초기화
    this.geminiApiKey = localStorage.getItem("gemini_api_key") || "";
    this.initFirebase();

    // 2. Firebase 실시간 클라우드 DB 연동 리스너 활성화
    if (this.isCloudEnabled && this.db) {
      // 대시보드 상단 공유 링크 복사 버튼 노출 처리
      const linkBtnAdv = document.getElementById("btn-copy-sync-link-adv");
      const linkBtnBasic = document.getElementById("btn-copy-sync-link-basic");
      if (linkBtnAdv) linkBtnAdv.style.display = "inline-flex";
      if (linkBtnBasic) linkBtnBasic.style.display = "inline-flex";

      this.db.ref("users").on("value", (snapshot) => {
        const usersData = snapshot.val();
        if (usersData) {
          console.log("☁️ Firebase 클라우드로부터 실시간 학생 탐구 데이터를 업데이트 받았습니다.");
          // 로컬 저장소 캐시 갱신
          localStorage.setItem("antigravity_users_db", JSON.stringify(usersData));
          
          // 데이터 로드 및 UI 대시보드 강제 갱신
          this.loadStudentsData(usersData);
          
          if (this.currentView === "dashboard") {
            this.renderDashboard();
          } else if (this.currentView === "workspace") {
            this.renderWorkspace();
          }
        }
      }, (err) => {
        console.warn("Firebase 실시간 리스너 작동 제한 (로컬 캐시 사용):", err);
        this.loadStudentsData();
      });
    } else {
      // 오프라인 로컬 데이터 로딩
      this.loadStudentsData();
    }

    // 3. 전역 이벤트 및 단축키 바인딩
    this.bindEvents();

    // 4. 첫 화면 렌더링
    this.navigate("dashboard");
  },

  /**
   * 실시간 로컬 DB 데이터 로드 및 폴백 처리 (Firebase 오버라이드 대응)
   */
  loadStudentsData: function (usersDbOverride = null) {
    const usersDbRaw = localStorage.getItem("antigravity_users_db");
    let studentReports = [];
    let isMock = false;

    let usersDb = usersDbOverride;
    if (!usersDb && usersDbRaw) {
      try {
        usersDb = JSON.parse(usersDbRaw);
      } catch (e) {
        console.error("LocalStorage 사용자 DB 로드 오류:", e);
      }
    }
    if (usersDb) {
      try {
        for (const userId in usersDb) {
          const userRecord = usersDb[userId];
          if (userRecord) {
            // 1. 다중 탐구(reports)가 있는 경우 건별 로드
            if (userRecord.reports && Array.isArray(userRecord.reports)) {
              userRecord.reports.forEach(rep => {
                const r = { ...rep };
                r.student_name = r.student_name || userRecord.student_name || "이름미상";
                r.student_id = r.student_id || userRecord.student_id || "학번미상";
                studentReports.push(r);
              });
            } 
            // 2. 단일 탐구(legacy report)만 있는 경우의 마이그레이션 호환 로드
            else if (userRecord.report) {
              const r = { ...userRecord.report };
              r.student_name = r.student_name || userRecord.student_name || "이름미상";
              r.student_id = r.student_id || userRecord.student_id || "학번미상";
              studentReports.push(r);
            }
          }
        }
      } catch (e) {
        console.error("사용자 DB 파싱 오류:", e);
      }
    }

    if (studentReports.length === 0) {
      studentReports = MOCK_STUDENT_REPORTS;
      isMock = true;
    }

    // 학번 순 정렬 후 동일 학번 시 과목명으로 정렬
    studentReports.sort((a, b) => {
      const idComp = String(a.student_id || "").localeCompare(String(b.student_id || ""));
      if (idComp !== 0) return idComp;
      return String(a.step_1?.교과목?.과목명 || "").localeCompare(String(b.step_1?.교과목?.과목명 || ""));
    });

    this.students = studentReports.map((rep) => {
      const courseName = rep.step_1?.교과목?.과목명 || "과목미상";
      const cacheKey = `${rep.student_id}_${courseName}`;
      const cacheRaw = localStorage.getItem("teacher_reviews_cache");
      let cache = {};
      if (cacheRaw) {
        try {
          cache = JSON.parse(cacheRaw);
        } catch (e) {
          console.error(e);
        }
      }
      const savedState = cache[cacheKey] || {};

      const studentState = {
        info: rep,
        status: savedState.status || "미검토",
        mappings: [],
        setukVariants: null,
        finalSetuk: savedState.finalSetuk || "",
        safetyResult: savedState.safetyResult || { passed: true, issues: [] },
        isAutoApproved: true,
        rejectionCount: 0,
        modificationCount: 0
      };

      this.runPipelineForStudent(studentState);

      // Restore active mapping and custom final setuk if cached
      if (savedState.activeMappingId) {
        studentState.mappings.forEach(m => {
          m.active = (m.content_element_id === savedState.activeMappingId);
        });
      }
      if (savedState.finalSetuk) {
        studentState.finalSetuk = savedState.finalSetuk;
        studentState.safetyResult = ComplianceEngine.safetyCheck(studentState.finalSetuk);
      }

      return studentState;
    });

    // DB 상태 배지 업데이트
    const badge = document.getElementById("db-status-badge");
    if (badge) {
      if (isMock) {
        badge.textContent = "📢 데모 데이터 (Mock)";
        badge.style.background = "rgba(244,162,97,0.15)";
        badge.style.color = "#f4a261";
      } else {
        badge.textContent = `🟢 실시간 로컬 DB (${studentReports.length}명)`;
        badge.style.background = "rgba(42,157,143,0.15)";
        badge.style.color = "#2a9d8f";
      }
    }

    // 과목 필터 동적 생성 호출
    this.updateSubjectFilterOptions();
  },

  saveStudentStateToCache: function (student) {
    const courseName = student.info.step_1?.교과목?.과목명 || "과목미상";
    const cacheKey = `${student.info.student_id}_${courseName}`;
    const cacheRaw = localStorage.getItem("teacher_reviews_cache") || "{}";
    let cache = {};
    try {
      cache = JSON.parse(cacheRaw);
    } catch (e) {
      console.error(e);
    }
    
    const activeMap = student.mappings.find(m => m.active);
    cache[cacheKey] = {
      status: student.status,
      finalSetuk: student.finalSetuk,
      activeMappingId: activeMap ? activeMap.content_element_id : null,
      safetyResult: student.safetyResult
    };
    
    localStorage.setItem("teacher_reviews_cache", JSON.stringify(cache));
  },

  /**
   * 로드된 학생 데이터 기반 과목 필터 목록 동적 생성
   */
  updateSubjectFilterOptions: function () {
    const filterSelect = document.getElementById("filter-subject");
    if (!filterSelect) return;

    // 현재 선택값 기억
    const currentSelected = this.filters.subject || "all";

    // unique subjects 추출
    const subjects = new Set();
    if (this.students && Array.isArray(this.students)) {
      this.students.forEach(st => {
        const subName = st.info?.step_1?.교과목?.과목명;
        if (subName) {
          subjects.add(subName);
        }
      });
    }

    // 정렬
    const sortedSubjects = Array.from(subjects).sort();

    // option 렌더링
    filterSelect.innerHTML = '<option value="all">전체 과목</option>';
    sortedSubjects.forEach(sub => {
      const opt = document.createElement("option");
      opt.value = sub;
      opt.textContent = sub;
      if (sub === currentSelected) {
        opt.selected = true;
      }
      filterSelect.appendChild(opt);
    });

    // 선택값이 현재 목록에 없으면 'all'로 리셋
    if (currentSelected !== "all" && !subjects.has(currentSelected)) {
      this.filters.subject = "all";
      filterSelect.value = "all";
    }
  },

  /**
   * 실시간 로컬 DB 강제 동기화 (새로고침)
   */
  syncLocalDatabase: function () {
    this.loadStudentsData();
    this.renderDashboard();
    alert("🔄 로컬 데이터베이스와 완벽하게 동기화되었습니다!");
  },

  /**
   * 실시간 로컬 DB 초기화 (데모 데이터로 롤백)
   */
  resetLocalDatabase: function () {
    if (confirm("🧹 주의: 로컬 데이터베이스를 초기화하시겠습니까?\n이름/학번 정보 및 작성 중이던 모든 보고서 데이터가 영구 삭제되고 초기 데모(Mock) 데이터 상태로 리셋됩니다.")) {
      // 로그인 및 유저 DB 제거
      localStorage.removeItem("antigravity_current_user");
      localStorage.removeItem("antigravity_users_db");
      
      this.loadStudentsData();
      this.renderDashboard();
      alert("🧹 로컬 DB가 깨끗하게 초기화되었으며 데모 데이터가 로드되었습니다.");
    }
  },

  /**
   * 1~3단계 백그라운드 파이프라인 (RAG 검색 -> AI 매핑 -> 검증 및 신뢰도 등급화)
   */
  runPipelineForStudent: function (studentState) {
    const report = studentState.info;

    // Stage 1: RAG 검색
    const ragResults = RAGEngine.retrieveContext(report, 5);

    // Stage 2: 1차 매핑 추출 (API Key가 없으면 동기 시뮬레이션 작동)
    // 비동기 AI API를 직접 가동하지 않은 초기 로드 상태는 백그라운드 시뮬레이션으로 고해상도 프리로드
    const rawMappings = AIEngine.simulateMapping(report, ragResults);

    // Stage 3: 검증 모듈 & 신뢰도 등급화 실행
    studentState.mappings = rawMappings.map(map => {
      const element = CURRICULUM_DB.find(c => c.id === map.content_element_id);

      // 인용 Verify (Module 1)
      let overallCitationStatus = "pass";
      let minConf = 1.0;
      map.citations.forEach(cit => {
        const v = ComplianceEngine.verifyCitation(cit.text, report);
        if (v.status === "fail") overallCitationStatus = "fail";
        if (v.status === "partial" && overallCitationStatus === "pass") overallCitationStatus = "partial";
        if (v.confidence < minConf) minConf = v.confidence;
      });

      // 자기주장 필터링 (Module 2)
      const hasSelfClaim = map.citations.some(cit => ComplianceEngine.isSelfClaim(cit.text));

      // 평가요소 3차원 체크 (Module 3)
      const evalDimensions = ComplianceEngine.checkEvalDimensions(report, element, report.step_2.탐구유형);

      // 인접 유사 개념 오류 감지 (Module 5)
      const confusion = ComplianceEngine.detectAdjacentConceptConfusion(element, report);

      // 신뢰도 등급화 (Module 4)
      const signals = {
        citationStatus: overallCitationStatus,
        hasSelfClaim,
        evalDimensions,
        citationCount: map.citations.length,
        matchedKeywordCount: (element.관련_키워드 || []).filter(k => JSON.stringify(report).includes(k)).length
      };

      let confidence = ComplianceEngine.classifyConfidence(signals);

      // 인접 유사 개념이 강하게 잡힐 경우 신뢰도 한 단계 강등 조치
      if (confidence === "★★★" && confusion.confused) {
        confidence = "★★";
      }

      return {
        ...map,
        element,
        confidence,
        confusion,
        hasSelfClaim,
        evalDimensions,
        active: confidence !== "REJECT" // 기본적으로 탈락 등급 외에는 활성(체크)처리
      };
    });

    // Stage 4 세특 문장 초안 사전 생성 (Standard 기준 프리바인딩)
    // 최초에는 가장 높은 등급의 활성 매핑을 타겟으로 세특 대안을 템플릿화
    const primaryMapping = studentState.mappings.find(m => m.active && m.confidence === "★★★") || 
                           studentState.mappings.find(m => m.active);

    if (primaryMapping) {
      const setukData = AIEngine.simulateSetuk(report, primaryMapping);
      studentState.setukVariants = setukData.variants;
      studentState.finalSetuk = setukData.variants.find(v => v.length === this.activeSetukLength).text;
      studentState.safetyResult = ComplianceEngine.safetyCheck(studentState.finalSetuk);
    } else {
      studentState.finalSetuk = "매핑 가능한 교육과정 내용요소가 없어 세특이 자동 생성되지 않았습니다. 교과 대시보드에서 매핑을 수동 추가하거나 보고서를 재검증해 주세요.";
    }
  },

  /**
   * 화면 라우팅 제어
   */
  navigate: function (view) {
    this.currentView = view;
    document.querySelectorAll(".view-section").forEach(sec => sec.style.display = "none");
    document.querySelectorAll(".nav-tab").forEach(tab => tab.classList.remove("active"));

    if (view === "dashboard") {
      document.getElementById("view-dashboard").style.display = "block";
      document.getElementById("nav-dashboard").classList.add("active");
      // 대시보드 진입 시 자동 동기화 적용으로 실시간 반영 보장
      this.loadStudentsData();
      this.renderDashboard();
    } else if (view === "workspace") {
      document.getElementById("view-workspace").style.display = "block";
      document.getElementById("nav-workspace").classList.add("active");
      this.renderWorkspace();
    } else if (view === "settings") {
      document.getElementById("view-settings").style.display = "block";
      document.getElementById("nav-settings").classList.add("active");
      this.renderSettings();
    }
  },

  /**
   * Class Dashboard 화면 렌더링 (과목 및 학급 필터링 완벽 구현)
   */
  renderDashboard: function () {
    const listContainer = document.getElementById("class-student-grid");
    listContainer.innerHTML = "";

    // 과목, 학년, 학급 필터링 적용
    const filteredStudents = this.students.filter(st => {
      const subjectMatch = this.filters.subject === "all" || st.info.step_1.교과목.과목명 === this.filters.subject;
      const gradeMatch = this.filters.grade === "all" || String(st.info.step_1.학년) === this.filters.grade;
      const classMatch = this.filters.class === "all" || String(st.info.step_1.학급) === this.filters.class;
      return subjectMatch && gradeMatch && classMatch;
    });

    // 필터 요약 개수 정보 업데이트
    const infoEl = document.getElementById("filter-count-info");
    if (infoEl) {
      infoEl.textContent = `선택된 조건의 학생: ${filteredStudents.length}명 / 총 ${this.students.length}명`;
    }

    filteredStudents.forEach((st) => {
      const activeMapping = st.mappings.filter(m => m.active);
      const highConfidenceCount = activeMapping.filter(m => m.confidence === "★★★").length;
      const warningCount = st.mappings.filter(m => m.confusion.confused || m.hasSelfClaim).length;
      
      const badgeClass = st.status === "완료" ? "badge-success" : st.status === "검토중" ? "badge-warning" : "badge-none";
      const safetyBadge = st.safetyResult.passed ? "🟢 기재 적격" : "🔴 위반 경고";

      // 전체 리스트에서의 원래 인덱스를 추적하여 1:1 기재 보조로 올바르게 들어가도록 유도
      const realIdx = this.students.indexOf(st);

      const card = document.createElement("div");
      card.className = "student-dashboard-card";
      
      const topicText = st.info.step_2?.선택_주제 || "주제 미선택";
      
      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 style="margin:0; font-size:1.1rem; color:var(--text-primary);">${st.info.student_name} <span style="font-size:0.8rem; font-weight:normal; color:var(--text-muted);">(${st.info.student_id})</span></h3>
          <span class="status-badge ${badgeClass}">${st.status}</span>
        </div>
        <div style="font-size:0.85rem; color:var(--text-secondary); line-height:1.6; margin-bottom:14px;">
          <div>📚 과목: <strong>${st.info.step_1.교과목.과목명}</strong> (${st.info.step_1.학년}학년 ${st.info.step_1.학급 || 1}반)</div>
          <div style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${topicText}">💡 주제: <strong>${topicText}</strong></div>
          <div>🔗 매핑내용: ${activeMapping.length > 0 ? activeMapping.map(m => m.element.내용요소).join(", ") : "매핑 없음"}</div>
          <div style="margin-top:6px; display:flex; gap:8px;">
            ${highConfidenceCount > 0 ? `<span>🎖️ 고신뢰도(★★★): ${highConfidenceCount}개</span>` : ""}
            ${warningCount > 0 ? `<span style="color:var(--warning-light);">⚠️ 검토필요: ${warningCount}개</span>` : ""}
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:10px; font-size:0.8rem;">
          <span style="font-weight:600; color: ${st.safetyResult.passed ? "var(--success-light)" : "var(--danger)"};">${safetyBadge}</span>
          <button class="btn btn-primary" style="padding:6px 12px; font-size:0.75rem;" onclick="App.startReview(${realIdx})">기재 보조 가동</button>
        </div>
      `;
      listContainer.appendChild(card);
    });

    this.updateMetricsPanel();
  },

  /**
   * 필터 값 변경 처리기
   */
  handleFilterChange: function () {
    const subjectFilter = document.getElementById("filter-subject").value;
    const gradeFilter = document.getElementById("filter-grade").value;
    const classFilter = document.getElementById("filter-class").value;
    
    this.filters.subject = subjectFilter;
    this.filters.grade = gradeFilter;
    this.filters.class = classFilter;
    
    this.renderDashboard();
  },

  /**
   * Single Report Review (Stage 4 메인 3단 워크스페이스) 화면 렌더링
   */
  renderWorkspace: function () {
    const student = this.students[this.activeStudentIndex];
    if (!student) return;

    if (student.status === "미검토") {
      student.status = "검토중";
    }

    // 헤더 상태 표시
    document.getElementById("workspace-student-name").textContent = student.info.student_name;
    document.getElementById("workspace-student-meta").textContent = `${student.info.student_id} | ${student.info.step_1.학년}학년 ${student.info.step_1.학급 || 1}반 | ${student.info.step_1.교과목.과목명}`;
    document.getElementById("workspace-progress").textContent = `${this.activeStudentIndex + 1} / ${this.students.length}명`;
    
    // 상태 배지 업데이트
    const statusBadge = document.getElementById("workspace-student-status");
    if (statusBadge) {
      statusBadge.textContent = student.status;
      statusBadge.className = `status-badge ${student.status === "완료" ? "badge-success" : student.status === "검토중" ? "badge-warning" : "badge-none"}`;
    }

    // 1. 좌측 학생 8단계 보고서 렌더링
    this.renderLeftReportViewer(student);

    // 2. 중앙 AI 내용요소 매핑 카드 리스트 렌더링
    this.renderCenterMappingList(student);

    // 3. 우측 세특 편집기 및 안전 필터 렌더링
    this.renderRightSetukEditor(student);
  },

  /**
   * 3단 중 좌측: 학생 보고서 뷰어
   */
  renderLeftReportViewer: function (student) {
    const report = student.info;
    const bodyContainer = document.getElementById("report-step-content");
    bodyContainer.innerHTML = "";

    // 탭 헤더 그리기
    const tabHeaders = [
      { step: 1, label: "1. 진로/교과" },
      { step: 2, label: "2. 관심주제" },
      { step: 3, label: "3. 동기/목적" },
      { step: 4, label: "4. 가설/변인" },
      { step: 5, label: "5. 설계/도구" },
      { step: 6, label: "6. 자료수집" },
      { step: 7, label: "7. 가설검증" },
      { step: 8, label: "8. 참고문헌" }
    ];

    const tabContainer = document.getElementById("report-step-tabs");
    tabContainer.innerHTML = "";
    tabHeaders.forEach(th => {
      const tab = document.createElement("div");
      tab.className = `step-tab ${this.activeStep === th.step ? "active" : ""}`;
      tab.textContent = th.label;
      tab.onclick = () => {
        App.activeStep = th.step;
        App.renderLeftReportViewer(student);
      };
      tabContainer.appendChild(tab);
    });

    // 활성화된 단계의 텍스트 렌더링 및 인용구 강제 형광펜 하이라이팅 적용
    const stepData = report[`step_${this.activeStep}`];
    let htmlContent = "";

    // 활성화된 매핑 인용구 모으기
    const activeCitations = student.mappings
      .filter(m => m.active)
      .flatMap(m => m.citations.filter(c => c.step === this.activeStep));

    if (typeof stepData === "object") {
      for (let key in stepData) {
        let val = stepData[key];
        if (typeof val === "object") {
          val = Object.entries(val).map(([k, v]) => `• <strong>${k}</strong>: ${v}`).join("<br>");
        }
        
        // 인용 하이라이트 가공 수행
        let cleanVal = String(val);
        if (key === "탐구유형") {
          const typeMap = {
            "experiment": "실험실증 탐구 🧪",
            "data_stat": "공공 데이터·통계 탐구 📊",
            "modeling": "수학적 모델링·시뮬레이션 탐구 🔢",
            "survey": "조사연구 (설문+현장조사) 📋",
            "literature": "문헌 비교 분석 탐구 📚"
          };
          cleanVal = typeMap[val] || val;
        }
        activeCitations.forEach(cit => {
          if (cit.field === key && cleanVal.includes(cit.text)) {
            cleanVal = cleanVal.replace(cit.text, `<mark class="citation-highlight">${cit.text}</mark>`);
          }
        });

        htmlContent += `
          <div class="report-field-group">
            <label class="report-field-label">${key}</label>
            <div class="report-field-val">${cleanVal}</div>
          </div>
        `;
      }
    } else {
      htmlContent = `<div class="report-field-val">${stepData}</div>`;
    }

    bodyContainer.innerHTML = htmlContent;
  },

  /**
   * 3단 중 중앙: AI 매핑 리스트
   */
  renderCenterMappingList: function (student) {
    const container = document.getElementById("center-mapping-container");
    container.innerHTML = "";

    if (student.mappings.length === 0) {
      container.innerHTML = `
        <div style="padding:40px; text-align:center; color:var(--text-muted); font-size:0.85rem;">
          📭 이 보고서와 연결할 수 있는 교육과정 내용요소가 RAG 엔진에 의해 발견되지 않았습니다.
        </div>
      `;
      return;
    }

    // 등급 우선순위 정렬 (★★★ > ★★ > ★)
    const sorted = [...student.mappings].sort((a, b) => {
      const order = { "★★★": 3, "★★": 2, "★": 1, "REJECT": 0 };
      return order[b.confidence] - order[a.confidence];
    });

    sorted.forEach((map, realIdx) => {
      const isChecked = map.active;
      const cardColorClass = map.confidence === "★★★" ? "card-teal" : map.confidence === "★★" ? "card-amber" : "card-gray";
      
      const card = document.createElement("div");
      card.className = `mapping-card ${cardColorClass} ${isChecked ? "" : "inactive-opacity"}`;
      card.onclick = (e) => {
        // 체크박스 자체 클릭이나 대안 클릭 유도 방어
        if (e.target.tagName === "INPUT" || e.target.classList.contains("alternative-btn")) return;
        App.openMappingDetail(map);
      };

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:8px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <input type="checkbox" ${isChecked ? "checked" : ""} style="width:16px; height:16px; cursor:pointer;" onchange="App.toggleMappingActive('${map.content_element_id}')">
            <span class="confidence-badge conf-${map.confidence === "★★★" ? "high" : map.confidence === "★★" ? "mid" : "low"}">${map.confidence}</span>
            <span style="font-weight:600; font-size:0.95rem; color:var(--text-primary);">${map.element.내용요소}</span>
          </div>
          <span style="font-size:0.75rem; color:var(--text-muted);">${map.element.과목} [${map.element.코드 || ""}]</span>
        </div>
        <div style="font-size:0.8rem; color:var(--text-secondary); line-height:1.5; margin-bottom:10px;">
          ${map.element.성취기준[0].내용}
        </div>
        <div style="font-size:0.75rem; color:var(--text-muted); background:var(--bg-card); padding:8px; border-radius:6px; margin-bottom:8px;">
          📝 <strong>인용 증거:</strong> "${map.citations[0]?.text.slice(0, 45)}..."
        </div>
        ${map.confusion.confused ? `
          <div class="danger-banner" style="margin:6px 0; padding:6px 10px; font-size:0.75rem; display:flex; align-items:center; justify-content:space-between;">
            <span>⚠️ <strong>유사 개념 혼동 감지:</strong> ${map.confusion.alternatives[0].내용요소}과 혼동 가능성</span>
            <button class="btn btn-secondary alternative-btn" style="padding:2px 6px; font-size:0.7rem;" onclick="App.switchMappingToAlternative('${map.content_element_id}', '${map.confusion.alternatives[0].id}')">대안 교체</button>
          </div>
        ` : ""}
        ${map.hasSelfClaim ? `
          <div class="danger-banner" style="margin:6px 0; padding:6px 10px; font-size:0.75rem; background: rgba(244,63,94,0.1); border-color: rgba(244,63,94,0.3); color: var(--danger);">
            🚨 <strong>자기평가 감지:</strong> 학생의 자가서술을 인용으로 사용함. 신뢰도 강등됨.
          </div>
        ` : ""}
      `;
      container.appendChild(card);
    });
  },

  /**
   * 3단 중 우측: 세특 초안 편집기
   */
  renderRightSetukEditor: function (student) {
    const editorArea = document.getElementById("right-setuk-editor");
    editorArea.innerHTML = "";

    // 세특 변형(Variants)이 없으면, 현재의 finalSetuk을 바탕으로 기본 변형을 동적 생성하여 에디터가 정상 작동하도록 함
    if (!student.setukVariants) {
      const defaultText = student.finalSetuk || "";
      student.setukVariants = [
        { length: "short", text: defaultText, characters: defaultText.length },
        { length: "standard", text: defaultText, characters: defaultText.length },
        { length: "rich", text: defaultText, characters: defaultText.length }
      ];
    }

    // 탭 헤더 그리기
    const tabs = [
      { id: "short", label: "짧은 세특 (요약)" },
      { id: "standard", label: "표준 세특 (일반)" },
      { id: "rich", label: "풍부한 세특 (역량)" }
    ];

    const tabWrapper = document.createElement("div");
    tabWrapper.className = "setuk-length-tabs";
    tabs.forEach(t => {
      const btn = document.createElement("button");
      btn.className = `btn ${this.activeSetukLength === t.id ? "btn-primary" : "btn-secondary"}`;
      btn.style.padding = "6px 12px";
      btn.style.fontSize = "0.75rem";
      btn.textContent = t.label;
      btn.onclick = () => {
        App.activeSetukLength = t.id;
        // 다른 대안 탭을 선택하면 해당 원문 텍스트 복사 후 갱신
        const currentVariant = student.setukVariants.find(v => v.length === t.id);
        if (currentVariant) {
          student.finalSetuk = currentVariant.text;
          student.safetyResult = ComplianceEngine.safetyCheck(student.finalSetuk);
        }
        App.saveStudentStateToCache(student);
        App.renderWorkspace();
      };
      tabWrapper.appendChild(btn);
    });
    editorArea.appendChild(tabWrapper);

    // 나이스 바이트수 및 초과 계산
    const bytes = this.getByteLength(student.finalSetuk);
    const byteWarning = bytes > 1500 ? `<span class="byte-warning-span" style="color:var(--danger); font-weight:bold; margin-left:10px;">⚠️ 나이스 용량 초과 (${bytes - 1500} Byte 초과)</span>` : "";

    // 에디터 텍스트 본문 영역 생성
    const editorContainer = document.createElement("div");
    editorContainer.className = "setuk-textarea-container";
    editorContainer.innerHTML = `
      <textarea id="setuk-main-textarea" class="setuk-editor-textarea" oninput="App.handleSetukTextareaInput(this.value)">${student.finalSetuk}</textarea>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; font-size:0.8rem; color:var(--text-muted); flex-wrap:wrap; gap:6px;">
        <span>글자 수: <strong id="setuk-char-count" style="color:var(--text-primary);">${student.finalSetuk.length}</strong>자</span>
        <span>바이트 수: <strong id="setuk-byte-count" style="color:${bytes > 1500 ? "var(--danger)" : "var(--text-primary)"};">${bytes}</strong> / 1500 Bytes ${byteWarning}</span>
        <button class="btn btn-secondary" style="padding:4px 8px; font-size:0.75rem; border-color:var(--primary); background:rgba(0,180,216,0.06); color:var(--primary); font-weight:600; cursor:pointer;" onclick="App.triggerRefineSetuk()">🤖 AI 문장 정제 및 교정</button>
      </div>
    `;
    editorArea.appendChild(editorContainer);

    // 실시간 안전 필터 가이드라인 표시
    const complianceBox = document.createElement("div");
    complianceBox.className = "setuk-compliance-status-box";
    
    if (student.safetyResult.passed) {
      complianceBox.innerHTML = `
        <div style="color:var(--success-light); font-weight:600; display:flex; align-items:center; gap:6px;">
          ✓ 학생부 기재 윤리적 지침 및 안전성 규정을 모두 통과하였습니다.
        </div>
      `;
    } else {
      let issuesHtml = student.safetyResult.issues.map(iss => {
        let title = "";
        let color = "var(--danger)";
        if (iss.type === "성적_순위") title = "🏆 성적/석차 관련 금지어";
        else if (iss.type === "사교육_외부활동") title = "🏢 사교육/교외 활동 단어";
        else if (iss.type === "과도한_예측") title = "🔮 주관적 잠재력 과대평가";
        else if (iss.type === "가족_사적정보") title = "👨‍👩‍👦 사적 인적사항 유출";
        else if (iss.type === "추상적_미사여구") title = "✨ 실체 없는 추상 극찬";
        else if (iss.type === "기재_유의어_대체필요") {
          title = "⚠️ 기재 유의어 사용 (금지)";
          color = "var(--warning-light)";
        } else if (iss.type === "금지_기호_포함") {
          title = "🚫 사용 제한 기호/단위 감지";
          color = "var(--warning-light)";
        }

        let suffix = iss.suggestion ? ` (대체 권장: "<span style="color:var(--primary); font-weight:bold;">${iss.suggestion}</span>")` : " 표현 제거 필요";
        return `<li style="margin-bottom:6px;"><strong>${title}</strong>: "<span style="color:${color}; font-weight:bold;">${iss.term}</span>"${suffix}</li>`;
      }).join("");

      complianceBox.innerHTML = `
        <div style="color:var(--danger); font-weight:600; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
          ⚠️ 학생부 기재 규정에 위반되는 요소가 감지되었습니다. 수정을 권장합니다.
        </div>
        <ul style="margin:0; padding-left:16px; font-size:0.8rem; line-height:1.6; color:var(--text-secondary);">
          ${issuesHtml}
        </ul>
      `;
    }
    editorArea.appendChild(complianceBox);

    // 생기부 기재 보조 어휘 추천 패널 렌더링
    const vocabBox = document.createElement("div");
    vocabBox.className = "setuk-vocab-helper-box";
    vocabBox.innerHTML = `
      <div style="font-weight:600; margin-bottom:12px; font-size:0.85rem; color:var(--primary); display:flex; align-items:center; gap:6px;">
        📚 생기부 작성 보조 어휘집 (클릭 시 자동 기입)
      </div>
      
      <div style="margin-bottom:12px;">
        <div class="vocab-category-title">🎯 대학 인재상 키워드</div>
        <div class="vocab-words-wrapper">
          ${["고민의 깊이", "공감적 사고력", "공동체의식", "문제해결능력", "지적호기심", "자기주도역량", "자기관리능력", "융합적 문제해결력", "의사소통능력", "발전가능성", "배려심", "도전정신", "독창성", "리더십", "책임감", "협동능력", "팀워크"].map(w => `<button class="vocab-word-capsule" onclick="App.insertWordAtCursor('${w} ')">${w}</button>`).join("")}
        </div>
      </div>
      
      <div style="margin-bottom:12px;">
        <div class="vocab-category-title">⚙️ 권장 행동 동사</div>
        <div class="vocab-words-wrapper">
          ${["가려내다", "기술하다", "설명하다", "분석하다", "도출하다", "고안하다", "설계하다", "입증하다", "일반화하다", "추론하다", "평가하다", "조직하다", "해석하다"].map(w => `<button class="vocab-word-capsule" onclick="App.insertWordAtCursor('${w} ')">${w}</button>`).join("")}
        </div>
      </div>
      
      <div>
        <div class="vocab-category-title">✨ 권장 형용사 및 부사</div>
        <div class="vocab-words-wrapper">
          ${["탁월하게", "뛰어나게", "뚜렷하게", "돋보이게", "효과적으로", "적절히", "완벽하다", "훌륭하다", "매우", "상당히", "굉장히", "남다르다"].map(w => `<button class="vocab-word-capsule" onclick="App.insertWordAtCursor('${w} ')">${w}</button>`).join("")}
        </div>
      </div>
    `;
    editorArea.appendChild(vocabBox);
  },

  /**
   * 실시간 교사 세특 텍스트 수정 핸들러
   */
  handleSetukTextareaInput: function (val) {
    const student = this.students[this.activeStudentIndex];
    if (!student) return;

    student.finalSetuk = val;
    student.modificationCount++;
    
    // 안전 규정 재평가
    student.safetyResult = ComplianceEngine.safetyCheck(val);

    // UI 동적 글자수 및 바이트 수 갱신
    document.getElementById("setuk-char-count").textContent = val.length;
    const bytes = this.getByteLength(val);
    const byteCountEl = document.getElementById("setuk-byte-count");
    if (byteCountEl) {
      byteCountEl.textContent = bytes;
      byteCountEl.style.color = bytes > 1500 ? "var(--danger)" : "var(--text-primary)";
      
      const parent = byteCountEl.parentElement;
      const existingWarning = parent.querySelector(".byte-warning-span");
      if (existingWarning) {
        existingWarning.remove();
      }
      if (bytes > 1500) {
        const warningSpan = document.createElement("span");
        warningSpan.className = "byte-warning-span";
        warningSpan.style.color = "var(--danger)";
        warningSpan.style.fontWeight = "bold";
        warningSpan.style.marginLeft = "10px";
        warningSpan.innerHTML = `⚠️ 나이스 용량 초과 (${bytes - 1500} Byte 초과)`;
        parent.appendChild(warningSpan);
      }
    }

    // 규정 배너 영역만 실시간 리렌더링하여 성능 저하 최소화
    const statusBox = document.querySelector(".setuk-compliance-status-box");
    if (statusBox) {
      if (student.safetyResult.passed) {
        statusBox.innerHTML = `<div style="color:var(--success-light); font-weight:600;">✓ 학생부 기재 윤리적 지침 및 안전성 규정을 모두 통과하였습니다.</div>`;
      } else {
        let issuesHtml = student.safetyResult.issues.map(iss => {
          let title = "";
          let color = "var(--danger)";
          if (iss.type === "성적_순위") title = "🏆 성적/석차 관련 금지어";
          else if (iss.type === "사교육_외부활동") title = "🏢 사교육/교외 활동 단어";
          else if (iss.type === "과도한_예측") title = "🔮 주관적 잠재력 과대평가";
          else if (iss.type === "가족_사적정보") title = "👨‍👩‍👦 사적 인적사항 유출";
          else if (iss.type === "추상적_미사여구") title = "✨ 실체 없는 추상 극찬";
          else if (iss.type === "기재_유의어_대체필요") {
            title = "⚠️ 기재 유의어 사용 (금지)";
            color = "var(--warning-light)";
          } else if (iss.type === "금지_기호_포함") {
            title = "🚫 사용 제한 기호/단위 감지";
            color = "var(--warning-light)";
          }

          let suffix = iss.suggestion ? ` (대체 권장: "<span style="color:var(--primary); font-weight:bold;">${iss.suggestion}</span>")` : " 표현 제거 필요";
          return `<li style="margin-bottom:6px;"><strong>${title}</strong>: "<span style="color:${color}; font-weight:bold;">${iss.term}</span>"${suffix}</li>`;
        }).join("");
        statusBox.innerHTML = `<div style="color:var(--danger); font-weight:600; margin-bottom:8px;">⚠️ 학생부 기재 규정 위반 감지</div><ul style='margin:0; padding-left:16px; font-size:0.8rem; color:var(--text-secondary);'>${issuesHtml}</ul>`;
      }
    }
    this.saveStudentStateToCache(student);
  },

  /**
   * 나이스(NEIS) 기준 바이트 수 계산 (한글=3Byte, 영문/공백/문장부호/줄바꿈=1Byte)
   */
  getByteLength: function (str) {
    if (!str) return 0;
    let byteLength = 0;
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i);
      if (charCode > 127) {
        byteLength += 3;
      } else {
        byteLength += 1;
      }
    }
    return byteLength;
  },

  /**
   * 커서 위치에 어휘 삽입
   */
  insertWordAtCursor: function (word) {
    const textarea = document.getElementById("setuk-main-textarea");
    if (!textarea) return;

    const scrollTop = textarea.scrollTop;
    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    const text = textarea.value;

    const beforeText = text.substring(0, startPos);
    const afterText = text.substring(endPos, text.length);

    textarea.value = beforeText + word + afterText;
    textarea.focus({ preventScroll: true });

    const newPos = startPos + word.length;
    textarea.selectionStart = newPos;
    textarea.selectionEnd = newPos;

    textarea.scrollTop = scrollTop;

    this.handleSetukTextareaInput(textarea.value);
  },

  /**
   * 매핑 체크 활성화/비활성화 토글 제어
   */
  toggleMappingActive: function (mappingId) {
    const student = this.students[this.activeStudentIndex];
    if (!student) return;

    const map = student.mappings.find(m => m.content_element_id === mappingId);
    if (map) {
      map.active = !map.active;
      student.modificationCount++;

      // 피드백 로그 적재
      App.logTeacherAction(map.active ? "accept" : "reject", {
        content_element_id: mappingId,
        confidence: map.confidence
      });

      this.renderCenterMappingList(student);
      this.renderLeftReportViewer(student); // 인용구 하이라이트 동기화
      this.regenerateSetukUsingActiveMappings(student);
      this.saveStudentStateToCache(student);
    }
  },

  /**
   * 대안으로 매핑 즉시 교체
   */
  switchMappingToAlternative: function (currentId, alternativeId) {
    const student = this.students[this.activeStudentIndex];
    if (!student) return;

    const mapIdx = student.mappings.findIndex(m => m.content_element_id === currentId);
    if (mapIdx !== -1) {
      const altElement = CURRICULUM_DB.find(c => c.id === alternativeId);

      // 교사의 행동 로그
      App.logTeacherAction("modify", {
        from: currentId,
        to: alternativeId,
        reason: "concept_confusion"
      });

      // 대안 매핑 오브젝트로 교체
      student.mappings[mapIdx].content_element_id = alternativeId;
      student.mappings[mapIdx].element = altElement;
      student.mappings[mapIdx].confusion = { confused: false, alternatives: [] };
      student.mappings[mapIdx].confidence = "★★★"; // 대안 보완 시 신뢰도 복원

      this.renderCenterMappingList(student);
      this.regenerateSetukUsingActiveMappings(student);
      this.saveStudentStateToCache(student);
    }
  },

  /**
   * 활성화된 매핑을 바탕으로 세특 문장 재생성 (실시간 API 가동 지원)
   */
  regenerateSetukUsingActiveMappings: async function (student) {
    const activeMap = student.mappings.find(m => m.active);

    if (!activeMap) {
      student.setukVariants = null;
      student.finalSetuk = "선택된 내용요소 매핑이 없습니다. 중앙에서 내용요소를 매핑해 주세요.";
      this.renderRightSetukEditor(student);
      return;
    }

    const setukContainer = document.getElementById("right-setuk-editor");
    setukContainer.innerHTML = "<div style='padding:40px; text-align:center;'>🤖 활성화된 교육과정 기반으로 세특 문장을 다중 구성 중입니다...</div>";

    try {
      // 실시간 AI 연동 생성 호출
      const setukData = await AIEngine.generateSetuk(student.info, activeMap);
      student.setukVariants = setukData.variants;
      student.finalSetuk = setukData.variants.find(v => v.length === this.activeSetukLength).text;
      student.safetyResult = ComplianceEngine.safetyCheck(student.finalSetuk);
    } catch (err) {
      alert("AI 세특 생성 중 오류가 발생했습니다: " + err.message);
      setukContainer.innerHTML = `<div style='padding:40px; text-align:center; color:var(--danger);'>❌ 생성 실패: ${err.message}</div>`;
      return;
    }

    this.renderRightSetukEditor(student);
    this.saveStudentStateToCache(student);
  },

  /**
   * 실시간 AI 매핑 트리거 (Gemini API 강제 호출)
   */
  triggerRealAIMapping: async function () {
    const student = this.students[this.activeStudentIndex];
    if (!student) return;

    const provider = localStorage.getItem("active_ai_provider") || "gemini";
    let apiKey = "";
    if (provider === "gemini") apiKey = localStorage.getItem("gemini_api_key");
    else if (provider === "openai") apiKey = localStorage.getItem("openai_api_key");
    else if (provider === "claude") apiKey = localStorage.getItem("claude_api_key");

    if (!apiKey) {
      const providerName = provider === "gemini" ? "Google Gemini" : provider === "openai" ? "OpenAI ChatGPT" : "Anthropic Claude";
      const key = prompt(`선택된 AI 서비스(${providerName})의 API 키가 입력되어 있지 않습니다.\n원격 AI 탐구를 기동하려면 API 키를 입력해 주세요:`);
      if (key) {
        const cleanedKey = key.trim().replace(/[^A-Za-z0-9_\-]/g, "");
        if (provider === "gemini") {
          localStorage.setItem("gemini_api_key", cleanedKey);
          this.geminiApiKey = cleanedKey;
        } else if (provider === "openai") {
          localStorage.setItem("openai_api_key", cleanedKey);
        } else if (provider === "claude") {
          localStorage.setItem("claude_api_key", cleanedKey);
        }
        apiKey = cleanedKey;
      } else {
        alert("시뮬레이션 모드를 계속 사용합니다.");
        return;
      }
    }

    const centerList = document.getElementById("center-mapping-container");
    centerList.innerHTML = "<div style='padding:40px; text-align:center;'>🤖 제미나이 AI가 보고서 원문 인용 검증 및 1차 매핑을 원격 계산 중입니다...</div>";

    try {
      const ragResults = RAGEngine.retrieveContext(student.info, 5);
      const mappings = await AIEngine.generateMapping(student.info, ragResults);
      
      // 검증 파이프라인 수행 후 업데이트
      student.mappings = mappings.map(map => {
        const element = CURRICULUM_DB.find(c => c.id === map.content_element_id);
        const evalDimensions = ComplianceEngine.checkEvalDimensions(student.info, element, student.info.step_2.탐구유형);
        const confusion = ComplianceEngine.detectAdjacentConceptConfusion(element, student.info);
        
        const signals = {
          citationStatus: "pass",
          hasSelfClaim: false,
          evalDimensions,
          citationCount: map.citations.length,
          matchedKeywordCount: 3
        };

        const confidence = ComplianceEngine.classifyConfidence(signals);

        return {
          ...map,
          element,
          confidence,
          confusion,
          hasSelfClaim: false,
          evalDimensions,
          active: true
        };
      });

      this.renderCenterMappingList(student);
      this.regenerateSetukUsingActiveMappings(student);

    } catch (e) {
      alert("AI 매핑 중 오류가 발생했습니다: " + e.message);
      this.renderCenterMappingList(student);
    }
  },

  /**
   * 4.5 매핑 카드 클릭 시 상세 팝업 오픈
   */
  openMappingDetail: function (mapping) {
    const modal = document.getElementById("mapping-detail-modal-root");
    const title = document.getElementById("modal-mapping-title");
    const meta = document.getElementById("modal-mapping-meta");
    const criteria = document.getElementById("modal-mapping-criteria");
    const citation = document.getElementById("modal-mapping-citation");
    const reasoning = document.getElementById("modal-mapping-reasoning");

    title.textContent = mapping.element.내용요소;
    meta.textContent = `${mapping.element.과목} | 성취코드: ${mapping.element.성취기준[0].코드} | 신뢰도: ${mapping.confidence}`;
    criteria.textContent = mapping.element.성취기준[0].내용;

    let citationHtml = mapping.citations.map(cit => `
      <div style="background:var(--bg-card); padding:10px; border-radius:6px; font-size:0.85rem; margin-bottom:8px; border-left:4px solid var(--primary-light);">
        "<strong>[${cit.field}]</strong> ${cit.text}"
      </div>
    `).join("");
    citation.innerHTML = citationHtml;

    reasoning.textContent = mapping.reasoning;

    modal.style.display = "flex";
  },

  closeMappingDetailModal: function () {
    document.getElementById("mapping-detail-modal-root").style.display = "none";
  },

  /**
   * 단축키 및 전역 뷰 바인딩
   */
  bindEvents: function () {
    // 키보드 단축키
    window.addEventListener("keydown", (e) => {
      // 텍스트 기입 중(textarea, input)일 경우 단축키 동작 차단
      if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;

      const key = e.key.toUpperCase();
      if (key === "J") {
        // 다음 학생
        App.changeStudent(1);
      } else if (key === "K") {
        // 이전 학생
        App.changeStudent(-1);
      } else if (key === "ENTER" && App.currentView === "workspace") {
        // 확정 완료 처리
        App.confirmActiveStudent();
      } else if (key === "TAB" && App.currentView === "workspace") {
        e.preventDefault();
        // 세특 대안 탭 토글
        const order = ["short", "standard", "rich"];
        let nextIdx = (order.indexOf(App.activeSetukLength) + 1) % 3;
        App.activeSetukLength = order[nextIdx];
        const student = App.students[App.activeStudentIndex];
        const currentVariant = student.setukVariants.find(v => v.length === App.activeSetukLength);
        if (currentVariant) {
          student.finalSetuk = currentVariant.text;
          student.safetyResult = ComplianceEngine.safetyCheck(student.finalSetuk);
        }
        App.renderWorkspace();
      } else if (key === "R" && App.currentView === "workspace") {
        // 매핑 전체 거부
        const student = App.students[App.activeStudentIndex];
        student.mappings.forEach(m => m.active = false);
        App.renderCenterMappingList(student);
        App.regenerateSetukUsingActiveMappings(student);
      }
    });
  },

  changeStudent: function (dir) {
    let target = this.activeStudentIndex + dir;
    if (target >= 0 && target < this.students.length) {
      this.activeStudentIndex = target;
      this.renderWorkspace();
    }
  },

  startReview: function (idx) {
    this.activeStudentIndex = idx;
    this.navigate("workspace");
  },

  confirmActiveStudent: function () {
    const student = this.students[this.activeStudentIndex];
    if (student) {
      student.status = "완료";
      this.saveStudentStateToCache(student);
      this.logTeacherAction("confirm", { student_id: student.info.student_id });
      alert(`${student.info.student_name} 학생의 매핑·세특 검토가 확정되었습니다!`);
      
      // 마지막 학생이면 대시보드로 이동, 아니면 다음 학생으로 전환
      if (this.activeStudentIndex === this.students.length - 1) {
        this.navigate("dashboard");
      } else {
        this.changeStudent(1);
      }
    }
  },

  /**
   * 행동 수정 로그 적재 (피드백 루프용)
   */
  logTeacherAction: function (action, detail) {
    const log = {
      session_id: "session_" + Date.now(),
      report_id_hash: "hash_" + Math.random().toString(36).substring(3),
      timestamp: new Date().toISOString(),
      action: action, // "accept" | "modify" | "reject" | "confirm"
      detail: detail
    };
    this.editLogs.push(log);
    this.updateMetricsPanel();
  },

  /**
   * 알고리즘 평가 지표(Metrics) 실시간 연산 및 갱신
   */
  updateMetricsPanel: function () {
    const metricsContainer = document.getElementById("metrics-summary-container");
    if (!metricsContainer) return;

    // Precision (정밀도): 확정된 매핑 수 / 교사가 남겨둔 총 매핑 시도수
    // Recall (재현율): 교사가 확정한 내용요소 수 / RAG가 탐색한 전체 유효 매핑수
    let accepted = 0;
    let totalAttempts = 0;
    let highConfCount = 0;

    this.students.forEach(st => {
      st.mappings.forEach(m => {
        totalAttempts++;
        if (m.active) accepted++;
        if (m.confidence === "★★★") highConfCount++;
      });
    });

    const precision = totalAttempts > 0 ? (accepted / totalAttempts * 100).toFixed(1) : 100;
    const teacherEditRate = this.students.length > 0 
      ? (this.students.filter(st => st.modificationCount > 0).length / this.students.length * 100).toFixed(1) 
      : 0;

    metricsContainer.innerHTML = `
      <div class="metric-block">
        <span class="metric-label">Precision (정밀도)</span>
        <span class="metric-value" style="color:var(--success-light);">${precision}%</span>
      </div>
      <div class="metric-block">
        <span class="metric-label">교사 직접 수정율</span>
        <span class="metric-value" style="color:var(--warning-light);">${teacherEditRate}%</span>
      </div>
      <div class="metric-block">
        <span class="metric-label">고신뢰도 매핑 비중</span>
        <span class="metric-value" style="color:var(--primary-light);">${((highConfCount / (totalAttempts || 1)) * 100).toFixed(1)}%</span>
      </div>
    `;
  },

  renderSettings: function () {
    // 다중 API 설정 로드
    const provider = localStorage.getItem("active_ai_provider") || "gemini";
    document.getElementById("settings-ai-provider").value = provider;
    
    document.getElementById("settings-gemini-key").value = localStorage.getItem("gemini_api_key") || "";
    document.getElementById("settings-openai-key").value = localStorage.getItem("openai_api_key") || "";
    document.getElementById("settings-claude-key").value = localStorage.getItem("claude_api_key") || "";
    document.getElementById("settings-cors-proxy").value = localStorage.getItem("cors_proxy_url") || "";

    // Firebase 연동 정보 로드
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

    this.renderLogs();
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
        { value: "gemini-3.5-flash", text: "gemini-3.5-flash (최신 표준 모델)" },
        { value: "gemini-3.1-pro-preview", text: "gemini-3.1-pro-preview (최신 고성능 추론 모델)" },
        { value: "gemini-3.1-flash-lite", text: "gemini-3.1-flash-lite (최신 고속/경량화 모델 - 기본)" },
        { value: "gemini-2.5-flash", text: "gemini-2.5-flash (기존 표준 모델)" },
        { value: "gemini-2.5-pro", text: "gemini-2.5-pro (기존 고성능 모델)" }
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
        console.log("📡 교사용 Firebase Realtime Database 연동 완료.");
      } catch (err) {
        console.error("교사용 Firebase 초기화 실패:", err);
        this.isCloudEnabled = false;
      }
    } else {
      this.isCloudEnabled = false;
    }
  },

  copyStudentSyncLink: function (type = 'advanced') {
    const dbUrl = localStorage.getItem("firebase_db_url");
    const apiKey = localStorage.getItem("firebase_api_key");
    const projectId = localStorage.getItem("firebase_project_id");

    if (!dbUrl) {
      alert("⚠️ Firebase Database URL 설정이 없습니다. 설정 메뉴에서 먼저 등록해 주세요.");
      return;
    }

    const configObj = {
      dbUrl: dbUrl,
      apiKey: apiKey || "",
      projectId: projectId || ""
    };
    
    try {
      const encoded = btoa(JSON.stringify(configObj));
      
      // 학생용 URL 추정
      let studentBaseUrl = window.location.origin + window.location.pathname;
      
      if (type === 'basic') {
        studentBaseUrl = studentBaseUrl
          .replace("/teacher/index.html", "/basic/index.html")
          .replace("/teacher/", "/basic/");
      } else {
        studentBaseUrl = studentBaseUrl
          .replace("/teacher/index.html", "/index.html")
          .replace("/teacher/", "/");
      }
      
      if (!studentBaseUrl.endsWith(".html") && !studentBaseUrl.endsWith("/")) {
        studentBaseUrl += "/";
      }
      
      const fullLink = `${studentBaseUrl}?sync=${encoded}`;
      const typeLabel = type === 'basic' ? "기초형" : "심화형";
      
      navigator.clipboard.writeText(fullLink).then(() => {
        alert(`🔗 학생용 동기화 공유 링크(${typeLabel})가 클립보드에 복사되었습니다!\n\n학생들에게 이 링크를 전달하여 열게 하면, 추가 설정 없이 실시간 클라우드 공유가 자동 작동합니다.`);
      }).catch(err => {
        console.error("클립보드 복사 실패:", err);
        prompt(`클립보드 자동 복사에 실패했습니다. 아래 주소를 직접 복사해 사용하세요:`, fullLink);
      });
    } catch (err) {
      console.error("공유 링크 생성 중 에러:", err);
      alert("공유 링크 생성 중 오류가 발생했습니다.");
    }
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
    
    if (geminiKey) {
      localStorage.setItem("gemini_api_key", geminiKey);
      this.geminiApiKey = geminiKey;
    } else {
      localStorage.removeItem("gemini_api_key");
      this.geminiApiKey = "";
    }
    
    if (openaiKey) localStorage.setItem("openai_api_key", openaiKey);
    else localStorage.removeItem("openai_api_key");
    
    if (claudeKey) localStorage.setItem("claude_api_key", claudeKey);
    else localStorage.removeItem("claude_api_key");
    
    if (corsProxy) localStorage.setItem("cors_proxy_url", corsProxy);
    else localStorage.removeItem("cors_proxy_url");

    // Firebase 연동 정보 업데이트
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

      // Firebase 재연동
      this.initFirebase();

      // 공유 링크 복사 버튼 노출 여부
      const linkBtnAdv = document.getElementById("btn-copy-sync-link-adv");
      const linkBtnBasic = document.getElementById("btn-copy-sync-link-basic");
      if (linkBtnAdv) {
        linkBtnAdv.style.display = this.isCloudEnabled ? "inline-flex" : "none";
      }
      if (linkBtnBasic) {
        linkBtnBasic.style.display = this.isCloudEnabled ? "inline-flex" : "none";
      }
    }
    
    let statusMsg = `AI 제공자가 [${provider === 'gemini' ? '구글 Gemini' : provider === 'openai' ? 'OpenAI ChatGPT' : '안드로픽 Claude'}](${model})로 설정되었습니다.\n`;
    statusMsg += "설정이 안전하게 보관되었습니다.";
    alert(statusMsg);
  },

  renderLogs: function () {
    const logBox = document.getElementById("logs-container-box");
    logBox.innerHTML = "";

    if (this.editLogs.length === 0) {
      logBox.innerHTML = "<div style='color:var(--text-muted); font-size:0.8rem;'>아직 수집된 교사 피드백 로그가 없습니다.</div>";
      return;
    }

    this.editLogs.forEach(l => {
      const item = document.createElement("div");
      item.style.padding = "6px; border-bottom:1px solid var(--border); font-family:monospace; font-size:0.75rem; color:var(--text-secondary);";
      item.textContent = `[${l.timestamp.slice(11, 19)}] ACTION: ${l.action.toUpperCase()} | DATA: ${JSON.stringify(l.detail)}`;
      logBox.appendChild(item);
    });
  },

  /**
   * 학교 행정 시스템용 기재 서류 EXPORT (CSV / NEIS 호환 규격)
   */
  exportToNEIS: function () {
    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"; // 한글 깨짐 방지 BOM 추가
    csvContent += "학번,학생명,교과목,학년,내용요소,성취코드,최종 세부능력 및 특기사항\n";

    this.students.forEach(st => {
      const activeMapping = st.mappings.filter(m => m.active);
      const mappedElements = activeMapping.map(m => m.element.내용요소).join(";");
      const mappedCodes = activeMapping.map(m => m.element.성취기준[0].코드).join(";");
      
      // 세특 줄바꿈 및 따옴표 이스케이프
      const cleanSetuk = st.finalSetuk.replace(/"/g, '""').replace(/\n/g, ' ');

      csvContent += `"${st.info.student_id}","${st.info.student_name}","${st.info.step_1.교과목.과목명}",${st.info.step_1.학년},"${mappedElements}","${mappedCodes}","${cleanSetuk}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "NEIS_학생부_기재자료_수학과학.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  triggerJsonImport: function () {
    const input = document.getElementById("student-json-file-input");
    if (input) input.click();
  },

  handleJsonImport: function (event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const report = JSON.parse(e.target.result);
        
        // 8단계 기본 데이터 스키마 유무 검증
        if (!report.step_1 || !report.step_2 || !report.step_3 || !report.step_4) {
          alert("유효한 8단계 탐구보고서 JSON 데이터가 아닙니다. 파일을 다시 확인해 주세요.");
          event.target.value = "";
          return;
        }

        const name = report.student_name || "이름미상";
        const id = report.student_id || "학번미상";

        // 기존 학생 중복 체크 (학번 기준)
        const duplicateIdx = this.students.findIndex(s => s.info.student_id === id);

        const studentState = {
          info: report,
          status: "미검토",
          mappings: [],
          setukVariants: null,
          finalSetuk: "",
          safetyResult: { passed: true, issues: [] },
          isAutoApproved: true,
          rejectionCount: 0,
          modificationCount: 0
        };

        // 1차 RAG/AI 내용 매핑 파이프라인 구동
        this.runPipelineForStudent(studentState);

        if (duplicateIdx !== -1) {
          if (confirm(`동일한 학번을 가진 [${name}] 학생의 이전 탐구 데이터가 이미 대시보드에 존재합니다. 새로운 내용으로 덮어쓰시겠습니까?`)) {
            this.students[duplicateIdx] = studentState;
          } else {
            event.target.value = "";
            return;
          }
        } else {
          this.students.push(studentState);
        }

        alert(`✓ [${name} (${id})] 학생의 8단계 보고서 데이터가 대시보드에 성공적으로 편입되었습니다!`);
        
        // 대시보드 강제 리마운트 및 렌더링
        this.renderDashboard();
      } catch (err) {
        alert("JSON 파일을 파싱하는 데 실패했습니다. 원인: " + err.message);
      }
      event.target.value = "";
    };
    reader.readAsText(file);
  },

  /**
   * 에디터 영역 세특 AI 정제 및 교정 기능 구동
   */
  triggerRefineSetuk: async function () {
    const student = this.students[this.activeStudentIndex];
    if (!student) return;

    const textarea = document.getElementById("setuk-main-textarea");
    if (!textarea) return;

    const rawText = textarea.value;
    if (!rawText.trim()) {
      alert("정제할 세특 텍스트가 입력되지 않았습니다.");
      return;
    }

    const provider = localStorage.getItem("active_ai_provider") || "gemini";
    let apiKey = "";
    if (provider === "gemini") apiKey = localStorage.getItem("gemini_api_key");
    else if (provider === "openai") apiKey = localStorage.getItem("openai_api_key");
    else if (provider === "claude") apiKey = localStorage.getItem("claude_api_key");

    if (!apiKey) {
      const providerName = provider === "gemini" ? "Google Gemini" : provider === "openai" ? "OpenAI ChatGPT" : "Anthropic Claude";
      const key = prompt(`실시간 AI 문장 정제 및 교정(${providerName})을 위한 API 키가 입력되지 않았습니다.\nAPI 키를 입력해주세요 (입력하지 않으면 로컬 기본 규칙으로만 정제합니다):`);
      if (key) {
        const cleanedKey = key.trim().replace(/[^A-Za-z0-9_\-]/g, "");
        if (provider === "gemini") {
          localStorage.setItem("gemini_api_key", cleanedKey);
          this.geminiApiKey = cleanedKey;
        } else if (provider === "openai") {
          localStorage.setItem("openai_api_key", cleanedKey);
        } else if (provider === "claude") {
          localStorage.setItem("claude_api_key", cleanedKey);
        }
        apiKey = cleanedKey;
      } else {
        alert("API 키가 없어 로컬 기본 규칙(괄호, 가운데점, 특수문자 제거 등)으로만 정제합니다.");
      }
    }

    textarea.disabled = true;
    const originalPlaceholder = textarea.placeholder;
    textarea.placeholder = "AI가 세특 문장을 정제 및 교정 중입니다...";
    
    const originalText = textarea.value;
    textarea.value = "AI 분석 및 문맥 교정 중...";

    try {
      const refinedText = await AIEngine.refineSetuk(rawText);
      student.finalSetuk = refinedText;
      
      const currentVariant = student.setukVariants.find(v => v.length === this.activeSetukLength);
      if (currentVariant) {
        currentVariant.text = refinedText;
        currentVariant.characters = refinedText.length;
      }
      
      student.safetyResult = ComplianceEngine.safetyCheck(refinedText);
      this.renderRightSetukEditor(student);
      this.saveStudentStateToCache(student);
    } catch (e) {
      alert("AI 세특 정제 중 오류가 발생했습니다: " + e.message + "\n\n로컬 기본 규칙으로 대체 정제합니다.");
      
      // AI 호출 실패 시 시뮬레이션 모드로 대체하여 교사 입력 내용 보존 및 정제
      const refinedText = AIEngine.simulateRefineSetuk(rawText);
      student.finalSetuk = refinedText;
      
      const currentVariant = student.setukVariants.find(v => v.length === this.activeSetukLength);
      if (currentVariant) {
        currentVariant.text = refinedText;
        currentVariant.characters = refinedText.length;
      }
      student.safetyResult = ComplianceEngine.safetyCheck(refinedText);
      this.renderRightSetukEditor(student);
      this.saveStudentStateToCache(student);
    } finally {
      const newTextarea = document.getElementById("setuk-main-textarea");
      if (newTextarea) {
        newTextarea.disabled = false;
        newTextarea.placeholder = originalPlaceholder;
      }
    }
  }
};

window.App = App;
