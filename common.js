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

    currentApp.innerHTML = newApp.innerHTML;



    // Update page title
    document.title = doc.title;



    // Update browser history
    if (addToHistory) {

      history.pushState(
        { page: url },
        "",
        url
      );

    }



    // Scroll to top
    window.scrollTo({
      top: 0,
      behavior: "instant"
    });



    console.log("Navigated:", url);

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



  // Prevent full reload
  e.preventDefault();



  // Load page dynamically
  loadPage(href);

});





// ------------------------------
// BACK/FORWARD BUTTON HANDLING
// ------------------------------
window.addEventListener("popstate", () => {

  loadPage(location.pathname, false);

});





// ------------------------------
// PWA MODE DETECTION
// ------------------------------
if (window.matchMedia("(display-mode: standalone)").matches) {

  console.log("Running as installed PWA");

  document.documentElement.classList.add("pwa-mode");

}
