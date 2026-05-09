// ==============================
// Circuit Breakers Global System
// ==============================


// ------------------------------
// SERVICE WORKER
// ------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js")
      .then(() => {
        console.log("SW Registered");
      })
      .catch((err) => {
        console.log("SW Error:", err);
      });
  });
}


// ------------------------------
// INTERNAL LINK FIXER
// Keeps navigation inside PWA
// ------------------------------
document.addEventListener("click", (e) => {

  const link = e.target.closest("a");

  if (!link) return;

  const href = link.getAttribute("href");

  if (!href) return;

  // Ignore external links
  if (
    href.startsWith("http") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("#")
  ) {
    return;
  }

  // Force same-window navigation
  e.preventDefault();

  window.location.href = href;

});


// ------------------------------
// BETTER BACK BUTTON HANDLING
// ------------------------------
window.addEventListener("load", () => {

  history.pushState({ page: 1 }, "", "");

  window.addEventListener("popstate", () => {

    if (document.referrer.includes(location.origin)) {
      history.back();
    } else {
      history.pushState({ page: 1 }, "", "");
    }

  });

});


// ------------------------------
// PWA MODE DETECTION
// ------------------------------
if (window.matchMedia('(display-mode: standalone)').matches) {
  console.log("Running as installed PWA");
}
