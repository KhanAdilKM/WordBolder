(() => {
  const DEFAULTS = {
    boldStarts: false, letters: 3, colourStarts: false, accent: "blue",
    fontSize: "default", lineSpacing: "default", paragraphSpacing: false,
    narrowWidth: false, ruler: false, paragraphFocus: false
  };
  let settings = {...DEFAULTS};
  let ruler = null;
  let activeParagraph = null;
  let speaking = false;

  const SKIP = new Set(["SCRIPT","STYLE","NOSCRIPT","TEXTAREA","INPUT","SELECT","OPTION","BUTTON","CODE","PRE","KBD","SAMP","SVG","MATH","IFRAME"]);
  function eligibleTextNode(node) {
    if (!node.nodeValue || !node.nodeValue.trim()) return false;
    const parent = node.parentElement;
    if (!parent || parent.closest("[data-focusread-generated], .focusread-word")) return false;
    if (parent.isContentEditable) return false;
    if (parent.closest([...SKIP].map(x => x.toLowerCase()).join(","))) return false;
    return true;
  }
  function restorePrefixes() {
    document.querySelectorAll(".focusread-word").forEach(el => {
      const original = el.getAttribute("data-focusread-original");
      if (original !== null) el.replaceWith(document.createTextNode(original));
    });
  }
  function applyPrefixes() {
    restorePrefixes();
    if (!settings.boldStarts && !settings.colourStarts) return;
    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
    const nodes = [];
    let node;
    while ((node = walker.nextNode())) if (eligibleTextNode(node)) nodes.push(node);
    const count = Math.max(1, Math.min(4, Number(settings.letters) || 3));
    for (const textNode of nodes) {
      const text = textNode.nodeValue;
      const fragment = document.createDocumentFragment();
      // Preserve whitespace and punctuation; only wrap word characters.
      const pieces = text.split(/(\s+|[^\p{L}\p{N}_]+)/u);
      for (const piece of pieces) {
        if (!piece) continue;
        if (/^[\p{L}\p{N}_]+$/u.test(piece)) {
          const prefixLength = Math.min(count, piece.length);
          const wrapper = document.createElement("span");
          wrapper.className = "focusread-word";
          wrapper.setAttribute("data-focusread-original", piece);
          const prefix = document.createElement("span");
          prefix.className = "focusread-prefix";
          prefix.textContent = piece.slice(0, prefixLength);
          const rest = document.createTextNode(piece.slice(prefixLength));
          if (settings.boldStarts || settings.colourStarts) wrapper.append(prefix, rest);
          fragment.append(wrapper);
        } else {
          fragment.append(document.createTextNode(piece));
        }
      }
      textNode.replaceWith(fragment);
    }
  }
  function setClass(className, enabled) {
    document.documentElement.classList.toggle(className, !!enabled);
  }
  function applySettings() {
    const root = document.documentElement;
    root.classList.remove("focusread-colour-blue","focusread-colour-purple","focusread-colour-teal","focusread-colour-coral");
    setClass("focusread-paragraph-spacing", settings.paragraphSpacing);
    setClass("focusread-narrow", settings.narrowWidth);
    setClass("focusread-ruler-on", settings.ruler);
    if (settings.colourStarts) root.classList.add("focusread-colour-" + (settings.accent || "blue"));
    if (settings.fontSize !== "default") {
      root.style.setProperty("--focusread-font-size", settings.fontSize + "px");
      setClass("focusread-custom-font", true);
    } else {
      root.style.removeProperty("--focusread-font-size");
      setClass("focusread-custom-font", false);
    }
    if (settings.lineSpacing !== "default") {
      root.style.setProperty("--focusread-line-spacing", settings.lineSpacing);
      setClass("focusread-custom-line", true);
    } else {
      root.style.removeProperty("--focusread-line-spacing");
      setClass("focusread-custom-line", false);
    }
    applyPrefixes();
    updateRuler();
    updateParagraphFocus();
  }
  function ensureRuler() {
    if (!ruler) {
      ruler = document.createElement("div");
      ruler.id = "focusread-ruler";
      ruler.setAttribute("data-focusread-generated","true");
      (document.body || document.documentElement).appendChild(ruler);
    }
  }
  function updateRuler() {
    if (settings.ruler) {
      ensureRuler();
      ruler.style.top = Math.max(0, (window.__focusReadY || 0) - 15) + "px";
    } else if (ruler) {
      ruler.remove(); ruler = null;
    }
  }
  document.addEventListener("mousemove", e => {
    window.__focusReadY = e.clientY;
    if (settings.ruler && ruler) ruler.style.top = Math.max(0, e.clientY - 15) + "px";
    if (settings.paragraphFocus) highlightParagraph(e.target);
  }, {passive:true});
  function highlightParagraph(target) {
    const p = target && target.closest && target.closest("p, li, blockquote, h1, h2, h3, h4, h5, h6");
    if (activeParagraph && activeParagraph !== p) activeParagraph.classList.remove("focusread-paragraph-active");
    activeParagraph = p || null;
    if (activeParagraph) activeParagraph.classList.add("focusread-paragraph-active");
  }
  function updateParagraphFocus() {
    if (!settings.paragraphFocus && activeParagraph) {
      activeParagraph.classList.remove("focusread-paragraph-active");
      activeParagraph = null;
    }
  }
  function getMainText() {
    const main = document.querySelector("article, main, [role='main']") || document.body;
    return (main?.innerText || "").trim();
  }
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "FOCUSREAD_SETTINGS") {
      settings = {...DEFAULTS, ...message.settings};
      applySettings();
      sendResponse({ok:true});
    } else if (message.type === "FOCUSREAD_ESTIMATE") {
      const words = getMainText().split(/\s+/).filter(Boolean).length;
      sendResponse({words, minutes: Math.max(1, Math.ceil(words / 200))});
    } else if (message.type === "FOCUSREAD_SPEAK") {
      const text = getMainText().slice(0, 12000);
      if (!("speechSynthesis" in window)) {
        sendResponse({ok:false, error:"Speech is not supported by this browser."});
      } else if (speaking) {
        window.speechSynthesis.cancel(); speaking = false;
        sendResponse({ok:true, stopped:true});
      } else {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        utterance.onend = () => { speaking = false; };
        utterance.onerror = () => { speaking = false; };
        speaking = true;
        window.speechSynthesis.speak(utterance);
        sendResponse({ok:true, started:true});
      }
      return true;
    }
    return true;
  });
  chrome.storage.sync.get(DEFAULTS, saved => {
    settings = {...DEFAULTS, ...saved};
    applySettings();
  });
  // The initial page content is transformed once. We intentionally avoid a broad
  // MutationObserver here because wrapping text creates mutations of its own.
  // This keeps dynamic websites from triggering repeated reprocessing loops.
})();