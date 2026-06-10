import { isSupabaseConfigured } from "../services/supabaseClient.js";
import { store } from "../state/store.js";

let Dom;
let UI;

export function configureRouter(context) {
  Dom = context.Dom;
  UI = context.UI;
}

// Views that can be addressed directly via the URL hash (deep-linking).
const ROUTE_VIEWS = ["landing", "signup", "signin", "reset-password", "dashboard", "discovery", "admin"];

export function showView(name) {
  if (name === "admin" && !UI.ensureAdminAccess()) return;

  store.setView(name);
  Dom.views.forEach((view) => {
    const isTarget = view.dataset.view === name;
    view.classList.remove("visible");
    if (isTarget) {
      view.classList.add("active");
      requestAnimationFrame(() => view.classList.add("visible"));
    } else {
      view.classList.remove("active");
    }
  });

  if (name === "dashboard") {
    UI.hydrateDashboard();
  }
  if (name === "discovery") {
    Dom.schoolSearchInput.focus();
    if (store.state.currentSchool && !store.state.currentDiscoveryData.length && isSupabaseConfigured()) {
      UI.loadSchoolDiscovery(store.state.currentSchool, false);
    }
  }
  if (name === "admin") {
    UI.renderAdminList();
  }

  UI.closeMobileNav();
  window.scrollTo({ top: 0, behavior: "smooth" });

  // Reflect the current view in the URL so links are shareable and a refresh
  // returns to the same place. replaceState avoids firing a hashchange (no
  // routing loop) and avoids piling up a history entry on every navigation.
  const targetHash = name === "landing" ? "" : `#${name}`;
  if (window.location.hash !== targetHash) {
    const nextUrl = targetHash || window.location.pathname + window.location.search;
    window.history.replaceState(null, "", nextUrl);
  }
}

export function syncHashRoute() {
  const rawHash = window.location.hash.replace(/^#/, "");

  // Supabase appends auth tokens to the hash (e.g. access_token=...&type=recovery);
  // those are handled by onAuthStateChange, not by routing.
  if (rawHash.includes("access_token") || rawHash.includes("type=")) return;

  if (!rawHash) {
    // Empty hash: only force landing if we were on the gated admin view.
    if (store.state.currentView === "admin") showView("landing");
    return;
  }

  if (!ROUTE_VIEWS.includes(rawHash)) return;

  // The dashboard requires an authenticated club; fall back to sign-in.
  if (rawHash === "dashboard" && !store.state.activeClub) {
    showView("signin");
    return;
  }

  showView(rawHash);
}
