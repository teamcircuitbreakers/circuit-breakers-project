// ==============================
// Circuit Breakers Global System
// ==============================

// ------------------------------
// SERVICE WORKER
// ------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then(() => console.log("SW Registered"))
      .catch((err) => console.log("SW Error:", err));
  });
}

// ------------------------------
// APP-LIKE INTERNAL NAVIGATION
// ------------------------------
async function loadPage(url, addToHistory = true) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const newApp = doc.querySelector("#app");

    // Fallback if wrapper missing
    if (!newApp) {
      window.location.href = url;
      return;
    }

    // Replace ONLY app contents
    const currentApp = document.querySelector("#app");
    if (currentApp) {
        currentApp.innerHTML = newApp.innerHTML;
        
        // --- THE FIX: MANUALLY RE-EXECUTE SCRIPTS ---
        // Browsers block scripts injected via innerHTML. 
        // We must recreate them as new elements to force the browser to run them.
        const scripts = currentApp.querySelectorAll("script");
        scripts.forEach(oldScript => {
            const newScript = document.createElement("script");
            
            // Copy all attributes (like src, type, defer)
            Array.from(oldScript.attributes).forEach(attr => {
                newScript.setAttribute(attr.name, attr.value);
            });
            
            // Copy the inline code
            newScript.textContent = oldScript.textContent;
            
            // Replace the dead script with the live, executable one
            oldScript.parentNode.replaceChild(newScript, oldScript);
        });
        // --------------------------------------------
        
    } else {
        window.location.href = url;
        return;
    }

    // Update page title
    document.title = doc.title;

    // Update browser history
    if (addToHistory) {
      history.pushState({ page: url }, "", url);
    }

    // Scroll to top
    window.scrollTo({
      top: 0,
      behavior: "instant"
    });

  } catch (err) {
    console.log("Navigation Error:", err);
    // Safe fallback
    window.location.href = url;
  }
}

// ------------------------------
// INTERCEPT INTERNAL LINKS
// ------------------------------
document.addEventListener("click", (e) => {
  const link = e.target.closest("a");
  if (!link) return;
  const href = link.getAttribute("href");
  if (!href) return;

  // 1. Ignore hash links on the same page
  if (href.startsWith("#")) return;

  // 2. Ignore explicitly marked external links (like social media)
  if (link.target === "_blank") return;

  try {
    // 3. Properly parse the URL to compare origins
    const url = new URL(link.href, window.location.href);

    // 4. Ignore external domains, emails, and tel links so they open natively
    if (
      url.origin !== window.location.origin || 
      url.protocol === "mailto:" || 
      url.protocol === "tel:"
    ) {
      return; 
    }

    // At this point, we KNOW it's an internal link on the same domain.
    e.preventDefault();
    loadPage(url.pathname + url.search + url.hash);

  } catch (err) {
    // If URL parse fails, fallback to default browser behavior
  }
});

// ------------------------------
// BACK/FORWARD BUTTON HANDLING
// ------------------------------
window.addEventListener("popstate", () => {
  loadPage(location.pathname + location.search + location.hash, false);
});

// ------------------------------
// PWA MODE DETECTION
// ------------------------------
if (window.matchMedia("(display-mode: standalone)").matches) {
  console.log("Running as installed PWA");
  document.documentElement.classList.add("pwa-mode");
}
