document.addEventListener("cao-extract-fiber-prompts", () => {
  try {
    const result = {};

    document.querySelectorAll('[data-turn="user"][data-turn-id]').forEach((element) => {
      try {
        const turnId = element.getAttribute("data-turn-id");
        if (!turnId) {
          return;
        }

        const fiberKey = Object.keys(element).find((key) => key.startsWith("__reactFiber"));
        if (!fiberKey) {
          return;
        }

        const turn = element[fiberKey]?.return?.memoizedProps?.turn;
        const parts = turn?.messages?.[0]?.content?.parts;
        if (!Array.isArray(parts)) {
          return;
        }

        const text = parts.filter((part) => typeof part === "string").join(" ").replace(/\s+/g, " ").trim();
        if (text) {
          result[turnId] = text;
        }
      } catch {}
    });

    document.dispatchEvent(new CustomEvent("cao-fiber-prompts-result", { detail: result }));
  } catch {}
});
