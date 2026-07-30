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

  /* ---------- 스크롤 시 상단 내비 활성 링크 하이라이트 ---------- */
  var headerH = header.offsetHeight;

  function setActiveLink(id) {
    navLinks.forEach(function (link) {
      var match = link.getAttribute("href") === "#" + id;
      link.classList.toggle("is-active", match);
    });
  }

  if ("IntersectionObserver" in window) {
    var navObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            setActiveLink(entry.target.id);
          }
        });
      },
      { rootMargin: "-" + headerH + "px 0px -70% 0px", threshold: 0 }
    );
    sections.forEach(function (section) { navObserver.observe(section); });
  }

  /* ---------- 통계 막대 그래프 애니메이션 (시장 성장성) ---------- */
  var bars = Array.prototype.slice.call(document.querySelectorAll(".bar-chart__bar"));

  function animateCount(el, target, suffix) {
    var duration = 1100;
    var start = null;
    function step(ts) {
      if (start === null) start = ts;
      var progress = Math.min((ts - start) / duration, 1);
      var value = Math.floor(target * progress);
      el.textContent = value.toLocaleString("ko-KR") + (suffix || "");
      if (progress < 1) requestAnimationFrame(step);
      else el.textContent = target.toLocaleString("ko-KR") + (suffix || "");
    }
    requestAnimationFrame(step);
  }

  if ("IntersectionObserver" in window && bars.length) {
    var barObserver = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var bar = entry.target;
          bar.classList.add("in-view");
          var target = parseInt(bar.getAttribute("data-target"), 10);
          var suffix = bar.getAttribute("data-suffix") || "";
          var valueEl = bar.querySelector(".bar-chart__value");
          if (valueEl && !isNaN(target)) animateCount(valueEl, target, suffix);
          observer.unobserve(bar);
        });
      },
      { threshold: 0.4 }
    );
    bars.forEach(function (bar) { barObserver.observe(bar); });
  } else {
    bars.forEach(function (bar) { bar.classList.add("in-view"); });
  }

  /* ---------- 섹션 등장 애니메이션 ---------- */
  var revealTargets = document.querySelectorAll(
    ".feature-card, .point-item, .process-item, .benefit-card, .testimonial-card, .stat-card"
  );
  revealTargets.forEach(function (el) { el.classList.add("reveal"); });

  if ("IntersectionObserver" in window) {
    var revealObserver = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    revealTargets.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealTargets.forEach(function (el) { el.classList.add("is-visible"); });
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
      var agree = form.agree.checked;

      if (!name || !phone || !agree) {
        formNote.textContent = "성함, 연락처를 입력하고 개인정보 수집·이용에 동의해 주세요.";
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
      var region = form.region.value.trim() || "미입력";
      var message = form.message.value.trim() || "(내용 없음)";
      var bodyLines = [
        "성함: " + name,
        "연락처: " + phone,
        "희망 지역: " + region,
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

  /* ---------- 푸터 연도 ---------- */
  var footerYear = document.getElementById("footerYear");
  if (footerYear) footerYear.textContent = new Date().getFullYear();
})();
