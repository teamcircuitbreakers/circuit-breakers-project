// ==============================
// Circuit Breakers Global System
// ==============================

// ------------------------------
// SERVICE WORKER & AUTO-UPDATE
// ------------------------------
if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("/sw.js")
            .then((registration) => {
                console.log("SW Registered Successfully");
                
                // Aggressively check for updates every time a page loads
                registration.update();
            })
            .catch((err) => console.log("SW Error:", err));
    });

    // Automatically reload the page ONLY IF a brand new Service Worker takes over.
    // This ensures if you push a massive structural update, the app refreshes to show it safely.
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            window.location.reload();
            refreshing = true;
        }
    });
}

// ------------------------------
// PWA MODE DETECTION
// ------------------------------
if (window.matchMedia("(display-mode: standalone)").matches) {
    console.log("Running as installed PWA");
    document.documentElement.classList.add("pwa-mode");
}

/* NOTE: The custom SPA router (loadPage & link interceptor) has been intentionally removed.
   
   Why? Because dynamically replacing innerHTML across different full-page HTML files causes:
   1. JavaScript "const" variables to collide (resulting in blank, crashed pages).
   2. CSS to unexpectedly vanish during the transition.
   3. Timers/Intervals (like the typing effect) to leak memory in the background.
   
   Since target="_blank" has been removed from your HTML buttons, the PWA standalone mode 
   will natively handle standard link navigation safely inside the EXACT SAME app window!
*/
