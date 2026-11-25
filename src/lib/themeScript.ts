// Kept out of useTheme.ts (a "use client" module) so the server-rendered root
// layout can import the script as a plain string.
export const THEME_STORAGE_KEY = "dbexplorer:theme";

// Runs inline in <head> before first paint, so the page never flashes the wrong
// theme: the saved choice first, else the OS preference.
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="dark";}})();`;
