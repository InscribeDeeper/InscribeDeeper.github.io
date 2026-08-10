(function () {
  const cards = Array.from(document.querySelectorAll("[data-profile-card]"));
  const title = document.getElementById("profile-preview-title");
  const summary = document.getElementById("profile-preview-summary");
  const scope = document.getElementById("profile-preview-scope");
  const facts = document.getElementById("profile-preview-facts");
  const link = document.getElementById("profile-preview-link");

  if (!cards.length || !title || !summary || !scope || !facts || !link) {
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

    title.textContent = card.dataset.title;
    summary.textContent = card.dataset.summary;
    scope.textContent = card.dataset.scope;
    facts.innerHTML = "";
    card.dataset.facts.split("|").forEach((fact) => {
      const item = document.createElement("li");
      item.textContent = fact;
      facts.appendChild(item);
    });
    link.href = card.href;
  }

  cards.forEach((card) => {
    card.addEventListener("pointerenter", () => selectProfile(card));
    card.addEventListener("focus", () => selectProfile(card));
  });
})();
