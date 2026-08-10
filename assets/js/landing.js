(function () {
  const root = document.querySelector("[data-preview-glide]");
  const track = document.querySelector("[data-preview-track]");
  const slides = Array.from(document.querySelectorAll("[data-preview-slide]"));
  const dots = Array.from(document.querySelectorAll("[data-preview-dot]"));
  const prev = document.querySelector("[data-preview-prev]");
  const next = document.querySelector("[data-preview-next]");
  const preview = document.querySelector(".profile-preview");

  if (!root || !track || !slides.length || !preview) {
    return;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const intervalMs = 10000;
  let index = 0;
  let timer = null;

  function setSlide(nextIndex) {
    index = (nextIndex + slides.length) % slides.length;
    track.style.transform = "translateX(-" + index * 100 + "%)";

    slides.forEach(function (slide, i) {
      const active = i === index;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", active ? "false" : "true");
    });

    dots.forEach(function (dot, i) {
      const active = i === index;
      dot.classList.toggle("is-active", active);
      dot.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function stop() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function start() {
    if (reduceMotion || slides.length < 2) {
      return;
    }
    stop();
    timer = window.setInterval(function () {
      setSlide(index + 1);
    }, intervalMs);
  }

  function go(delta) {
    setSlide(index + delta);
    start();
  }

  dots.forEach(function (dot) {
    dot.addEventListener("click", function () {
      const nextIndex = Number(dot.getAttribute("data-preview-dot"));
      if (Number.isNaN(nextIndex)) {
        return;
      }
      setSlide(nextIndex);
      start();
    });
  });

  if (prev) {
    prev.addEventListener("click", function () {
      go(-1);
    });
  }

  if (next) {
    next.addEventListener("click", function () {
      go(1);
    });
  }

  preview.addEventListener("pointerenter", stop);
  preview.addEventListener("pointerleave", start);
  preview.addEventListener("focusin", stop);
  preview.addEventListener("focusout", function (event) {
    if (!preview.contains(event.relatedTarget)) {
      start();
    }
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      stop();
    } else {
      start();
    }
  });

  setSlide(0);
  start();
})();
