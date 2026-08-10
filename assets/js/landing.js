(function () {
  const cards = Array.from(document.querySelectorAll("[data-profile-card]"));
  const panelLabel = document.getElementById("profile-preview-label");
  const title = document.getElementById("profile-preview-title");
  const context = document.getElementById("profile-preview-context");
  const panels = Array.from(document.querySelectorAll("[data-timeline-panel]"));
  const timeline = Array.from(document.querySelectorAll("[data-timeline-id]"));

  if (!cards.length || !panelLabel || !title || !context || !panels.length || !timeline.length) {
    return;
  }

  function selectProfile(card) {
    cards.forEach((item) => {
      const selected = item === card;
      item.classList.toggle("profile-card--active", selected);
      if (selected) {
        item.setAttribute("aria-current", "true");
      } else {
        item.removeAttribute("aria-current");
      }
    });

    panelLabel.textContent = card.dataset.panelLabel;
    title.textContent = card.dataset.panelTitle;
    context.textContent = card.dataset.context;
    const selectedPanel = card.dataset.timeline || "career";
    const activeTimeline = card.dataset.track.split(",");
    panels.forEach((panel) => {
      panel.hidden = panel.dataset.timelinePanel !== selectedPanel;
    });
    timeline.forEach((item) => {
      const panel = item.closest("[data-timeline-panel]");
      const inSelectedPanel = panel && panel.dataset.timelinePanel === selectedPanel;
      item.classList.toggle(
        "timeline-item--active",
        inSelectedPanel &&
          (selectedPanel === "projects" || activeTimeline.includes(item.dataset.timelineId))
      );
    });
  }

  cards.forEach((card) => {
    card.addEventListener("pointerenter", () => selectProfile(card));
    card.addEventListener("focus", () => selectProfile(card));
  });

  selectProfile(cards.find((card) => card.getAttribute("aria-current") === "true") || cards[0]);
})();
