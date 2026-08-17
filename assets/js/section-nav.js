(function () {
  var nav = document.querySelector(".section-nav");
  if (!nav) {
    return;
  }

  var ACTIVE = "is-active";

  function currentLang() {
    return document.documentElement.getAttribute("data-site-lang") === "zh"
      ? "zh"
      : "en";
  }

  function visibleProfile() {
    return document.querySelector(
      '.profile-lang[data-i18n="' + currentLang() + '"]'
    );
  }

  function visiblePanel() {
    return nav.querySelector('.section-nav-panel[data-i18n="' + currentLang() + '"]');
  }

  function ensureLinkVisible(link) {
    var list = link.closest(".section-nav-list");
    if (list && window.getComputedStyle(list).display === "flex") {
      var left = link.offsetLeft;
      var right = left + link.offsetWidth;
      var viewLeft = list.scrollLeft;
      var viewRight = viewLeft + list.clientWidth;
      if (left < viewLeft) {
        list.scrollLeft = Math.max(0, left - 12);
      } else if (right > viewRight) {
        list.scrollLeft = right - list.clientWidth + 12;
      }
      return;
    }

    var top = link.offsetTop;
    var bottom = top + link.offsetHeight;
    var viewTop = nav.scrollTop;
    var viewBottom = viewTop + nav.clientHeight;
    if (top < viewTop + 8) {
      nav.scrollTop = Math.max(0, top - 12);
    } else if (bottom > viewBottom - 8) {
      nav.scrollTop = bottom - nav.clientHeight + 12;
    }
  }

  function setActive(sectionId) {
    var panel = visiblePanel();
    if (!panel) {
      return;
    }
    panel.querySelectorAll(".section-nav-link").forEach(function (link) {
      var match = link.getAttribute("data-nav-section") === sectionId;
      link.classList.toggle(ACTIVE, match);
      if (match) {
        link.setAttribute("aria-current", "true");
        ensureLinkVisible(link);
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }

  function sectionsInView() {
    var root = visibleProfile();
    if (!root) {
      return [];
    }
    return Array.prototype.slice.call(
      root.querySelectorAll("[data-section-id][id]")
    );
  }

  function updateFromScroll() {
    var sections = sectionsInView();
    if (!sections.length) {
      return;
    }

    var marker = window.scrollY + Math.min(160, window.innerHeight * 0.25);
    var current = sections[0];

    for (var i = 0; i < sections.length; i++) {
      if (sections[i].offsetTop <= marker) {
        current = sections[i];
      } else {
        break;
      }
    }

    setActive(current.getAttribute("data-section-id"));
  }

  function onClick(event) {
    var link = event.target.closest(".section-nav-link");
    if (!link || !nav.contains(link)) {
      return;
    }
    var sectionId = link.getAttribute("data-nav-section");
    if (sectionId) {
      setActive(sectionId);
    }
  }

  function init() {
    nav.addEventListener("click", onClick);
    window.addEventListener("scroll", updateFromScroll, { passive: true });
    window.addEventListener("resize", updateFromScroll);
    window.addEventListener("site-lang-change", updateFromScroll);
    updateFromScroll();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
