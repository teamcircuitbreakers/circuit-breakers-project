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
// INTERNAL LINK HANDLER
// Keeps navigation inside PWA
// Supports / and ../ links
// ------------------------------
document.addEventListener("click", (e) => {

  const link = e.target.closest("a");

  if (!link) return;

  const href = link.getAttribute("href");

  if (!href) return;


  // Ignore external/system links
  if (
    href.startsWith("http") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:") ||
    href.startsWith("#") ||
    link.target === "_blank"
  ) {
    return;
  }


  // Force same-window navigation
  e.preventDefault();

  window.location.assign(href);

});




// ------------------------------
// SMART APP-LIKE BACK HANDLING
// ------------------------------
window.addEventListener("load", () => {

  // Ensure app history exists
  if (!history.state) {
    history.replaceState({ app: true }, "");
  }


  window.addEventListener("popstate", () => {

    // If navigated internally
    if (
      document.referrer &&
      document.referrer.includes(location.origin)
    ) {

      window.history.back();

    } else {

      // Prevent instant app exit
      history.pushState({ app: true }, "");

    }

  });

});




// ------------------------------
// PWA MODE DETECTION
// ------------------------------
if (window.matchMedia("(display-mode: standalone)").matches) {

  console.log("Running as installed PWA");

  document.documentElement.classList.add("pwa-mode");

}
