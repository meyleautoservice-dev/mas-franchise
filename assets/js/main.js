(function () {
  "use strict";

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
     기반 자체 스크롤 감시로 대체해 어떤 환경에서 열어도 모션이 재생되도록 한다. */
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
        var visibleTop = Math.max(rect.top, bounds.top);
        var visibleBottom = Math.min(rect.bottom, bounds.bottom);
        var visibleHeight = Math.max(0, visibleBottom - visibleTop);
        var ratio = rect.height > 0 ? visibleHeight / rect.height : 0;
        var isVisible = threshold <= 0 ? ratio > 0 : ratio >= threshold;
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

      // TODO: 임시로 mailto 폴백을 사용 중입니다. 폼 수신 백엔드(서버/폼 전송
      // 서비스)가 마련되면 mailto 대신 fetch()로 전송하도록 바꿀 것.
      var RECEIVER_EMAIL = "cs@allesauto.co.kr";
      var message = form.message.value.trim() || "(내용 없음)";
      var bodyLines = [
        "성함: " + name,
        "연령: " + (form.age.value || "미입력"),
        "연락처: " + phone,
        "이메일주소: " + email,
        "희망 지역: " + (form.region.value.trim() || "미입력"),
        "희망시기: " + (form.timing.value || "미입력"),
        "현재 정비소 운영 여부: " + (form.operating.value || "미입력"),
        "수입차 정비 경력 유무: " + (form.experience.value || "미입력"),
        "문의 내용: " + message
      ];
      var mailto =
        "mailto:" + RECEIVER_EMAIL +
        "?subject=" + encodeURIComponent("[마일레 오토 서비스] 가맹 상담 신청 - " + name) +
        "&body=" + encodeURIComponent(bodyLines.join("\n"));

      window.location.href = mailto;
      formNote.textContent = "메일 앱이 열립니다. 전송 후 상담원이 확인하고 연락드립니다.";
      formNote.classList.add("is-success");
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

      var RECEIVER_EMAIL = "cs@allesauto.co.kr";
      var bodyLines = [
        "성함: " + name,
        "연령: " + (quickForm.age.value || "미입력"),
        "연락처: " + phone,
        "이메일주소: " + email,
        "희망지역: " + (quickForm.region.value.trim() || "미입력"),
        "희망시기: " + (quickForm.timing.value || "미입력"),
        "현재 정비소 운영 여부: " + (quickForm.operating.value || "미입력"),
        "수입차 정비 경력 유무: " + (quickForm.experience.value || "미입력")
      ];
      var mailto =
        "mailto:" + RECEIVER_EMAIL +
        "?subject=" + encodeURIComponent("[마일레 오토 서비스] 빠른 창업 문의 - " + name) +
        "&body=" + encodeURIComponent(bodyLines.join("\n"));

      window.location.href = mailto;
      quickNote.textContent = "메일 앱이 열립니다. 전송 후 상담원이 확인하고 연락드립니다.";
      quickNote.classList.add("is-success");
    });
  }

  /* ---------- 푸터 연도 ---------- */
  var footerYear = document.getElementById("footerYear");
  if (footerYear) footerYear.textContent = new Date().getFullYear();
})();
