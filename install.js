let deferredPrompt;

window.addEventListener("beforeinstallprompt", (e) => {

  // Prevent default mini popup
  e.preventDefault();

  deferredPrompt = e;

  // Show custom install button
  const installBtn = document.getElementById("installBtn");

  if (installBtn) {
    installBtn.style.display = "block";
  }

});


// Install button click
async function installApp() {

  if (!deferredPrompt) return;

  // Show fake installer
  const installer = document.getElementById("installOverlay");

  if (installer) {
    installer.style.display = "flex";
  }

  // Animate fake progress
  const progress = document.getElementById("installProgress");

  let width = 0;

  const interval = setInterval(() => {

    width += 10;

    if (progress) {
      progress.style.width = width + "%";
    }

    if (width >= 90) {
      clearInterval(interval);
    }

  }, 200);


  // Trigger actual install
  deferredPrompt.prompt();

  const choiceResult = await deferredPrompt.userChoice;

  if (choiceResult.outcome === "accepted") {

    if (progress) {
      progress.style.width = "100%";
    }

    setTimeout(() => {

      const text = document.getElementById("installText");

      if (text) {
        text.innerText = "Installed Successfully!";
      }

    }, 500);

  } else {

    if (installer) {
      installer.style.display = "none";
    }

  }

  deferredPrompt = null;

}
