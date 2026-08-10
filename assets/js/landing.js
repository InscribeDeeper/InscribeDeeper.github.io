(function () {
  const root = document.querySelector("[data-preview-glide]");
  const track = document.querySelector("[data-preview-track]");
  const slides = Array.from(document.querySelectorAll("[data-preview-slide]"));
  const dots = Array.from(document.querySelectorAll("[data-preview-dot]"));
  const prev = document.querySelector("[data-preview-prev]");
  const next = document.querySelector("[data-preview-next]");
  const preview = document.querySelector(".profile-preview");
  const projectTimeline = document.querySelector("[data-project-timeline]");

  if (!root || !track || !slides.length || !preview) {
    return;
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const intervalMs = 10000;
  const projectsSlideIndex = slides.findIndex(function (slide) {
    return Boolean(slide.querySelector("[data-project-timeline]"));
  });

  let index = 0;
  let timer = null;
  let projectRaf = null;
  let projectStartTimer = null;
  let projectHovering = false;
  let projectHoldUntil = 0;
  const projectSpeed = 0.35;
  const projectHoldMs = 1600;

  function projectsSlideActive() {
    return projectsSlideIndex >= 0 && index === projectsSlideIndex;
  }

  function stopProjectAutoScroll() {
    if (projectStartTimer) {
      window.clearTimeout(projectStartTimer);
      projectStartTimer = null;
    }
    if (projectRaf) {
      window.cancelAnimationFrame(projectRaf);
      projectRaf = null;
    }
  }

  function projectTick(now) {
    projectRaf = null;

    // Always auto-scroll project list when visible; ignore prefers-reduced-motion.
    if (projectHovering || !projectsSlideActive() || !projectTimeline) {
      return;
    }

    const maxScroll = projectTimeline.scrollHeight - projectTimeline.clientHeight;
    if (maxScroll <= 2) {
      projectRaf = window.requestAnimationFrame(projectTick);
      return;
    }

    if (now < projectHoldUntil) {
      projectRaf = window.requestAnimationFrame(projectTick);
      return;
    }

    projectTimeline.scrollTop += projectSpeed;

    if (projectTimeline.scrollTop >= maxScroll - 0.5) {
      projectHoldUntil = now + projectHoldMs;
      projectTimeline.scrollTop = 0;
    }

    projectRaf = window.requestAnimationFrame(projectTick);
  }

  function startProjectAutoScroll() {
    if (!projectTimeline || projectHovering || !projectsSlideActive()) {
      return;
    }

    stopProjectAutoScroll();

    projectStartTimer = window.setTimeout(function () {
      projectStartTimer = null;
      if (projectHovering || !projectsSlideActive() || projectRaf) {
        return;
      }
      projectHoldUntil = 0;
      projectRaf = window.requestAnimationFrame(projectTick);
    }, 400);
  }

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

    stopProjectAutoScroll();
    if (projectsSlideActive()) {
      startProjectAutoScroll();
    } else if (projectTimeline) {
      projectTimeline.scrollTop = 0;
    }
  }

  function stopCarousel() {
    if (timer) {
      window.clearInterval(timer);
      timer = null;
    }
  }

  function startCarousel() {
    if (reduceMotion || slides.length < 2) {
      return;
    }
    stopCarousel();
    timer = window.setInterval(function () {
      setSlide(index + 1);
    }, intervalMs);
  }

  function go(delta) {
    setSlide(index + delta);
    startCarousel();
  }

  dots.forEach(function (dot) {
    dot.addEventListener("click", function () {
      const nextIndex = Number(dot.getAttribute("data-preview-dot"));
      if (Number.isNaN(nextIndex)) {
        return;
      }
      setSlide(nextIndex);
      startCarousel();
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

  if (projectTimeline) {
    projectTimeline.addEventListener("pointerenter", function () {
      projectHovering = true;
      stopProjectAutoScroll();
    });

    projectTimeline.addEventListener("pointerleave", function () {
      projectHovering = false;
      startProjectAutoScroll();
    });
  }

  preview.addEventListener("pointerenter", stopCarousel);
  preview.addEventListener("pointerleave", startCarousel);
  preview.addEventListener("focusin", stopCarousel);
  preview.addEventListener("focusout", function (event) {
    if (!preview.contains(event.relatedTarget)) {
      startCarousel();
    }
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) {
      stopCarousel();
      stopProjectAutoScroll();
    } else {
      startCarousel();
      startProjectAutoScroll();
    }
  });

  setSlide(0);
  startCarousel();
})();
