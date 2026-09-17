(function () {
  "use strict";

  // 경량(iOS 전용) 빌드에서는 스크립트가 이 줄을 true로 치환해 스크롤 모션 감시
  // 전체(rAF 스케줄러, scroll/resize/touchmove 리스너, 350ms 폴링, 각 watchVisibility
  // 호출)를 아예 실행하지 않는다 — 저사양 기기에서 메인 스레드 부담을 줄이기 위함.
  // 시각적으로는 CSS 쪽 별도 오버라이드가 모든 모션 요소를 처음부터 최종 상태로 보여준다.
  var LIGHT_MODE = false;

  var header = document.getElementById("siteHeader");
  var nav = document.getElementById("mainNav");
  var navToggle = document.getElementById("navToggle");
  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".nav__link"));
  var sections = navLinks
    .map(function (link) {
      var id = link.getAttribute("href").slice(1);
      return document.getElementById(id);
    })
    .filter(Boolean);

  /* ---------- 모바일 메뉴 토글 ---------- */
  function closeNav() {
    nav.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "메뉴 열기");
  }
  function openNav() {
    nav.classList.add("is-open");
    navToggle.setAttribute("aria-expanded", "true");
    navToggle.setAttribute("aria-label", "메뉴 닫기");
  }
  navToggle.addEventListener("click", function () {
    var isOpen = navToggle.getAttribute("aria-expanded") === "true";
    isOpen ? closeNav() : openNav();
  });
  navLinks.forEach(function (link) {
    link.addEventListener("click", closeNav);
  });

  /* ---------- 스크롤 가시성 감지 (IntersectionObserver 대체) ----------
     일부 모바일 브라우저는 file:// 로 연 로컬 페이지에서 IntersectionObserver가
     제대로 동작하지 않는 경우가 있어(서버 배포본에서는 정상), getBoundingClientRect
     기반 자체 스크롤 감시로 대체해 어떤 환경에서 열어도 모션이 재생되도록 한다.
     LIGHT_MODE에서는 이 블록 전체(리스너 등록, 폴링, watchVisibility 호출)를
     건너뛴다 — 시각적으로는 별도 CSS 오버라이드가 모든 요소를 처음부터 최종
     상태로 보여주므로 동작에는 문제가 없고, 메인 스레드 부담만 사라진다. */
  if (!LIGHT_MODE) {
  var visibilityCheckers = [];
  var visibilityRaf = null;
  function scheduleVisibilityCheck() {
    if (visibilityRaf) return;
    visibilityRaf = requestAnimationFrame(function () {
      visibilityRaf = null;
      visibilityCheckers.forEach(function (fn) { fn(); });
    });
  }
  window.addEventListener("scroll", scheduleVisibilityCheck, { passive: true });
  window.addEventListener("resize", scheduleVisibilityCheck);
  window.addEventListener("orientationchange", scheduleVisibilityCheck);
  window.addEventListener("touchmove", scheduleVisibilityCheck, { passive: true });
  // 일부 모바일 브라우저에서 스크롤 이벤트가 누락되는 경우를 대비한 보조 폴링
  setInterval(function () {
    visibilityCheckers.forEach(function (fn) { fn(); });
  }, 350);

  function defaultBounds() {
    var vh = window.innerHeight || document.documentElement.clientHeight;
    return { top: 0, bottom: vh };
  }

  function watchVisibility(elements, threshold, boundsFn, onChange) {
    var list = Array.prototype.slice.call(elements);
    var lastState = list.map(function () { return false; });
    function runCheck() {
      var bounds = boundsFn();
      list.forEach(function (el, i) {
        var rect = el.getBoundingClientRect();
        var isVisible;
        if (rect.height <= 0) {
          // 애니메이션 시작 전 height:0인 요소(예: 막대그래프)는 면적이 없어 비율을
          // 계산할 수 없으므로, 위치(점)가 관찰 범위 안에 있는지로 판단한다.
          isVisible = rect.top >= bounds.top && rect.top <= bounds.bottom;
        } else {
          var visibleTop = Math.max(rect.top, bounds.top);
          var visibleBottom = Math.min(rect.bottom, bounds.bottom);
          var visibleHeight = Math.max(0, visibleBottom - visibleTop);
          var ratio = visibleHeight / rect.height;
          isVisible = threshold <= 0 ? ratio > 0 : ratio >= threshold;
        }
        if (isVisible !== lastState[i]) {
          lastState[i] = isVisible;
          onChange(el, isVisible);
        }
      });
    }
    visibilityCheckers.push(runCheck);
    runCheck();
  }

  /* ---------- 스크롤 시 상단 내비 활성 링크 하이라이트 ---------- */
  var headerH = header.offsetHeight;

  function setActiveLink(id) {
    navLinks.forEach(function (link) {
      var match = link.getAttribute("href") === "#" + id;
      link.classList.toggle("is-active", match);
    });
  }

  watchVisibility(
    sections,
    0,
    function () {
      var vh = window.innerHeight || document.documentElement.clientHeight;
      return { top: headerH, bottom: vh * 0.3 };
    },
    function (section, isVisible) {
      if (isVisible) setActiveLink(section.id);
    }
  );

  /* ---------- 통계 막대 그래프 애니메이션 (시장 성장성) ---------- */
  var bars = Array.prototype.slice.call(document.querySelectorAll(".bar-chart__bar"));

  function animateCount(el, target, suffix) {
    var duration = 1500;
    var start = null;
    var token = (el._countToken = (el._countToken || 0) + 1);
    function step(ts) {
      if (el._countToken !== token) return;
      if (start === null) start = ts;
      var progress = Math.min((ts - start) / duration, 1);
      var value = Math.floor(target * progress);
      el.textContent = value.toLocaleString("ko-KR") + (suffix || "");
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target.toLocaleString("ko-KR") + (suffix || "");
    }
    requestAnimationFrame(step);
  }

  function resetCount(el, suffix) {
    el._countToken = (el._countToken || 0) + 1;
    el.textContent = "0" + (suffix || "");
  }

  watchVisibility(bars, 0.4, defaultBounds, function (bar, isVisible) {
    var target = parseInt(bar.getAttribute("data-target"), 10);
    var suffix = bar.getAttribute("data-suffix") || "";
    var valueEl = bar.querySelector(".bar-chart__value");
    if (isVisible) {
      bar.classList.add("in-view");
      if (valueEl && !isNaN(target)) animateCount(valueEl, target, suffix);
    } else {
      bar.classList.remove("in-view");
      if (valueEl) resetCount(valueEl, suffix);
    }
  });

  /* ---------- 시장 성장성 트렌드 화살표 좌→우 드로잉 모션 ---------- */
  var trendArrows = Array.prototype.slice.call(document.querySelectorAll(".bar-chart__trend"));
  watchVisibility(trendArrows, 0.4, defaultBounds, function (svg, isVisible) {
    svg.classList.toggle("in-view", isVisible);
  });

  /* ---------- "상담 후 선발 방식" 밑줄 좌→우 드로잉 모션 ---------- */
  var underlineReveals = Array.prototype.slice.call(document.querySelectorAll(".underline-reveal"));
  watchVisibility(underlineReveals, 0.6, defaultBounds, function (el, isVisible) {
    el.classList.toggle("in-view", isVisible);
  });

  /* ---------- 하이라이트 숫자 카운트업 (마일레 소개 120개국·24,000종) ---------- */
  var countTargets = Array.prototype.slice.call(document.querySelectorAll(".hl-count"));
  watchVisibility(countTargets, 0.6, defaultBounds, function (el, isVisible) {
    var target = parseInt(el.getAttribute("data-count-target"), 10);
    var suffix = el.getAttribute("data-count-suffix") || "";
    if (isVisible) {
      if (!isNaN(target)) animateCount(el, target, suffix);
    } else {
      resetCount(el, suffix);
    }
  });

  /* ---------- 섹션 등장 애니메이션 ---------- */
  var revealTargets = document.querySelectorAll(
    ".benefit-card, .stat-card, .statement-band, .split-panel, .showcase-photo"
  );
  revealTargets.forEach(function (el) { el.classList.add("reveal"); });

  var revealImgTargets = document.querySelectorAll(".reveal-img");
  var allReveal = Array.prototype.slice.call(revealTargets).concat(Array.prototype.slice.call(revealImgTargets));

  watchVisibility(allReveal, 0.15, defaultBounds, function (el, isVisible) {
    el.classList.toggle("is-visible", isVisible);
  });

  /* ---------- 그룹 순차 등장(카드가 순서대로 하나씩 노출) ---------- */
  var revealGroups = document.querySelectorAll(".reveal-group");
  watchVisibility(revealGroups, 0.15, defaultBounds, function (el, isVisible) {
    el.classList.toggle("is-visible", isVisible);
  });

  /* ---------- 텍스트 라인 순차 등장(스태거) + 하이라이트 박스 bounce-in ---------- */
  function activateHlPop(container) {
    var boxes = container.querySelectorAll(".hl");
    boxes.forEach(function (box) {
      box.classList.add("hl-pop");
      if (box.classList.contains("hl--shine")) {
        box.addEventListener("animationend", function handler(e) {
          if (e.animationName === "hl-bounce-in") {
            box.classList.add("hl-pulsing");
            box.removeEventListener("animationend", handler);
          }
        });
      }
    });
  }

  function deactivateHlPop(container) {
    var boxes = container.querySelectorAll(".hl");
    boxes.forEach(function (box) {
      box.classList.remove("hl-pop", "hl-pulsing");
    });
  }

  var lineGroups = Array.prototype.slice.call(document.querySelectorAll(".reveal-lines"));
  var loadLineGroups = lineGroups.filter(function (el) { return el.hasAttribute("data-reveal-load"); });
  var scrollLineGroups = lineGroups.filter(function (el) { return !el.hasAttribute("data-reveal-load"); });

  window.requestAnimationFrame(function () {
    loadLineGroups.forEach(function (el) {
      el.classList.add("is-visible");
      activateHlPop(el);
    });
  });

  watchVisibility(scrollLineGroups, 0.4, defaultBounds, function (el, isVisible) {
    if (isVisible) {
      el.classList.add("is-visible");
      activateHlPop(el);
    } else {
      el.classList.remove("is-visible");
      deactivateHlPop(el);
    }
  });
  } // !LIGHT_MODE

  /* ---------- Netlify Forms 제출 헬퍼 ---------- */
  function encodeFormData(data) {
    return Object.keys(data)
      .map(function (key) {
        return encodeURIComponent(key) + "=" + encodeURIComponent(data[key]);
      })
      .join("&");
  }

  function submitNetlifyForm(formName, fields) {
    return fetch("/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: encodeFormData(Object.assign({ "form-name": formName }, fields))
    });
  }

  /* ---------- 창업 문의 폼 ---------- */
  var form = document.getElementById("contactForm");
  var formNote = document.getElementById("formNote");

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      formNote.classList.remove("is-error", "is-success");

      var name = form.name.value.trim();
      var phone = form.phone.value.trim();
      var email = form.email.value.trim();
      var agree = form.agree.checked;

      if (!name || !phone || !email || !agree) {
        formNote.textContent = "성함, 연락처, 이메일주소를 입력하고 개인정보 수집·이용에 동의해 주세요.";
        formNote.classList.add("is-error");
        return;
      }

      var phonePattern = /^[0-9\-+ ]{9,14}$/;
      if (!phonePattern.test(phone)) {
        formNote.textContent = "연락처 형식을 확인해 주세요. (예: 010-0000-0000)";
        formNote.classList.add("is-error");
        return;
      }

      var message = form.message.value.trim() || "(내용 없음)";

      submitNetlifyForm("franchise-contact", {
        name: name,
        age: form.age.value || "미입력",
        phone: phone,
        email: email,
        region: form.region.value.trim() || "미입력",
        timing: form.timing.value || "미입력",
        operating: form.operating.value || "미입력",
        experience: form.experience.value || "미입력",
        message: message
      }).then(function (response) {
        if (!response.ok) throw new Error("submit failed: " + response.status);
        formNote.textContent = "문의가 정상적으로 접수되었습니다. 상담원이 확인 후 연락드립니다.";
        formNote.classList.add("is-success");
        form.reset();
      }).catch(function () {
        formNote.textContent = "전송 중 오류가 발생했습니다. 잠시 후 다시 시도하거나 031-8017-9521로 전화 주세요.";
        formNote.classList.add("is-error");
      });
    });
  }

  /* ---------- 빠른 창업 문의 (하단 고정 바) ---------- */
  var quickInquiry = document.getElementById("quickInquiry");
  var quickToggle = document.getElementById("quickInquiryToggle");
  var quickForm = document.getElementById("quickInquiryForm");
  var quickNote = document.getElementById("quickInquiryNote");
  var quickSubmitBtn = document.getElementById("quickInquirySubmit");
  var quickLabel = quickToggle ? quickToggle.querySelector(".quick-inquiry__toggle-label") : null;

  function setQuickOpen(isOpen) {
    quickInquiry.setAttribute("data-open", isOpen ? "true" : "false");
    quickToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    if (quickLabel) quickLabel.textContent = isOpen ? "닫기" : "상담 폼 열기";
  }

  if (quickInquiry && quickToggle) {
    quickInquiry.setAttribute("data-open", "false");
    quickToggle.addEventListener("click", function () {
      var isOpen = quickToggle.getAttribute("aria-expanded") === "true";
      setQuickOpen(!isOpen);
    });
  }

  if (quickInquiry && quickSubmitBtn) {
    quickSubmitBtn.addEventListener("click", function (e) {
      var isOpen = quickInquiry.getAttribute("data-open") === "true";
      if (!isOpen) {
        e.preventDefault();
        setQuickOpen(true);
      }
    });
  }

  if (quickForm) {
    quickForm.addEventListener("submit", function (e) {
      e.preventDefault();
      quickNote.classList.remove("is-error", "is-success");

      var name = quickForm.name.value.trim();
      var phone = quickForm.phone.value.trim();
      var email = quickForm.email.value.trim();
      var agree = quickForm.agree.checked;

      if (!name || !phone || !email || !agree) {
        quickNote.textContent = "성함, 연락처, 이메일주소를 입력하고 개인정보 수집·이용에 동의해 주세요.";
        quickNote.classList.add("is-error");
        return;
      }

      var phonePattern = /^[0-9\-+ ]{9,14}$/;
      if (!phonePattern.test(phone)) {
        quickNote.textContent = "연락처 형식을 확인해 주세요. (예: 010-0000-0000)";
        quickNote.classList.add("is-error");
        return;
      }

      submitNetlifyForm("franchise-quick-inquiry", {
        name: name,
        age: quickForm.age.value || "미입력",
        phone: phone,
        email: email,
        region: quickForm.region.value.trim() || "미입력",
        timing: quickForm.timing.value || "미입력",
        operating: quickForm.operating.value || "미입력",
        experience: quickForm.experience.value || "미입력"
      }).then(function (response) {
        if (!response.ok) throw new Error("submit failed: " + response.status);
        quickNote.textContent = "문의가 정상적으로 접수되었습니다. 상담원이 확인 후 연락드립니다.";
        quickNote.classList.add("is-success");
        quickForm.reset();
      }).catch(function () {
        quickNote.textContent = "전송 중 오류가 발생했습니다. 잠시 후 다시 시도하거나 031-8017-9521로 전화 주세요.";
        quickNote.classList.add("is-error");
      });
    });
  }

  /* ---------- 푸터 연도 ---------- */
  var footerYear = document.getElementById("footerYear");
  if (footerYear) footerYear.textContent = new Date().getFullYear();
})();
