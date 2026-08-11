(function () {
  var STORAGE_KEY = "site-lang";
  var EN = "en";
  var ZH = "zh";

  function getStoredLang() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored === EN || stored === ZH) {
        return stored;
      }
    } catch (e) {
      /* ignore */
    }
    return null;
  }

  function getPreferredLang() {
    return getStoredLang() || EN;
  }

  function applyLang(lang) {
    var next = lang === ZH ? ZH : EN;
    document.documentElement.setAttribute("lang", next);
    document.documentElement.setAttribute("data-site-lang", next);

    var toggle = document.getElementById("lang-toggle");
    if (toggle) {
      var toZh = toggle.getAttribute("data-label-to-zh") || "切换到中文";
      var toEn = toggle.getAttribute("data-label-to-en") || "Switch to English";
      var label = next === ZH ? toEn : toZh;
      toggle.setAttribute("aria-label", label);
      toggle.setAttribute("title", label);
    }

    document.querySelectorAll("[data-print-action]").forEach(function (el) {
      var printLabel =
        next === ZH
          ? el.getAttribute("data-label-zh")
          : el.getAttribute("data-label-en");
      if (printLabel) {
        el.setAttribute("aria-label", printLabel);
        el.setAttribute("title", printLabel);
      }
    });

    try {
      window.dispatchEvent(
        new CustomEvent("site-lang-change", { detail: { lang: next } })
      );
    } catch (e) {
      /* ignore */
    }
  }

  function setLang(lang) {
    var next = lang === ZH ? ZH : EN;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {
      /* ignore */
    }
    applyLang(next);
  }

  function init() {
    applyLang(getPreferredLang());

    var toggle = document.getElementById("lang-toggle");
    if (toggle) {
      toggle.addEventListener("click", function () {
        var current =
          document.documentElement.getAttribute("data-site-lang") || EN;
        setLang(current === ZH ? EN : ZH);
        toggle.blur();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
