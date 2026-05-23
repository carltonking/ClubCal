import { isSupabaseConfigured, supabase } from "./services/supabaseClient.js";
import { restoreSession } from "./services/authService.js";
import { store } from "./state/store.js";
import { UI, configureUI } from "./ui/ui.js";
import { Actions, configureActions } from "./actions/actions.js";
import { showView, syncHashRoute, configureRouter } from "./router/router.js";

const Dom = {
  views: [...document.querySelectorAll("[data-view]")],
  routeTriggers: [...document.querySelectorAll("[data-route]")],
  tabButtons: [...document.querySelectorAll(".tab-btn")],
  tabPanels: [...document.querySelectorAll(".tab-panel")],
  navToggle: document.getElementById("nav-toggle"),
  themeToggle: document.getElementById("theme-toggle"),
  navLinks: document.getElementById("nav-links"),
  navDashboardLink: document.getElementById("nav-dashboard-link"),
  navSignupLinks: [...document.querySelectorAll('#nav-links [data-route="signup"]')],
  navSigninLink: document.querySelector('#nav-links [data-route="signin"]'),
  navLogoutBtn: document.getElementById("nav-logout"),
  toastRegion: document.getElementById("toast-region"),
  landingSchoolInput: document.getElementById("landing-school-search"),
  landingSuggestions: document.getElementById("landing-suggestions"),
  schoolSearchInput: document.getElementById("school-search"),
  suggestionsEl: document.getElementById("suggestions"),
  signupSchoolInput: document.getElementById("signup-school"),
  signupSchoolSuggestions: document.getElementById("signup-school-suggestions"),
  discoveryResults: document.getElementById("discovery-results"),
  selectedSchoolTitle: document.getElementById("selected-school-title"),
  clubGrid: document.getElementById("club-grid"),
  filterBar: document.getElementById("filter-bar"),
  signupForm: document.getElementById("signup-form"),
  signinForm: document.getElementById("signin-form"),
  calendarCreateForm: document.getElementById("calendar-create-form"),
  calendarNameInput: document.getElementById("calendar-name-input"),
  calendarsList: document.getElementById("calendars-list"),
  eventCalendarSelect: document.getElementById("event-calendar"),
  eventForm: document.getElementById("event-form"),
  eventSubmitBtn: document.getElementById("create-event-submit"),
  cancelEditBtn: document.getElementById("cancel-edit-btn"),
  settingsForm: document.getElementById("settings-form"),
  settingsReadView: document.getElementById("settings-read-view"),
  settingsEditBtn: document.getElementById("settings-edit-btn"),
  settingsCancelBtn: document.getElementById("settings-cancel-btn"),
  signoutBtn: document.getElementById("signout-btn"),
  signupSuccess: document.getElementById("signup-success"),
  signupSuccessText: document.getElementById("signup-success-text"),
  supabaseConfigSignup: document.getElementById("supabase-config-signup"),
  supabaseConfigSignin: document.getElementById("supabase-config-signin"),
  eventsList: document.getElementById("events-list"),
  insightsChart: document.getElementById("insights-chart"),
  insightsTotalDownloads: document.getElementById("insights-total-downloads"),
  insightsEventCount: document.getElementById("insights-event-count"),
  insightsTopDownloads: document.getElementById("insights-top-downloads"),
  insightsTopEventLabel: document.getElementById("insights-top-event-label"),
  adminList: document.getElementById("admin-list"),
  dashboardTitle: document.getElementById("dashboard-title"),
  accountBadge: document.getElementById("account-badge"),
  settingsClubName: document.getElementById("settings-club-name"),
  settingsSchool: document.getElementById("settings-school"),
  settingsEmail: document.getElementById("settings-email"),

  settingsClubNameInput: document.getElementById("settings-club-name-input"),
  settingsSchoolInput: document.getElementById("settings-school-input"),
  settingsEmailInput: document.getElementById("settings-email-input"),
  preview: {
    title: document.getElementById("preview-title"),
    description: document.getElementById("preview-description"),
    datetime: document.getElementById("preview-datetime"),
    location: document.getElementById("preview-location"),
    attire: document.getElementById("preview-attire"),
    category: document.getElementById("preview-category"),
    rsvp: document.getElementById("preview-rsvp")
  }
};

const App = {
  bindRouteTriggers() {
    Dom.routeTriggers.forEach((trigger) => {
      trigger.addEventListener("click", (event) => {
        event.preventDefault();
        if (trigger.dataset.route) {
          showView(trigger.dataset.route);
        }
      });
    });
  },

  bindTabs() {
    Dom.tabButtons.forEach((button) => {
      button.addEventListener("click", () => UI.setTab(button.dataset.tab));
    });
  },

  initTheme() {
    const saved = localStorage.getItem("clubcal_theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (saved === "dark" || (!saved && prefersDark)) {
      document.documentElement.setAttribute("data-theme", "dark");
    }
  },

  bindThemeToggle() {
    Dom.themeToggle.addEventListener("click", () => {
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      if (isDark) {
        document.documentElement.removeAttribute("data-theme");
        localStorage.setItem("clubcal_theme", "light");
      } else {
        document.documentElement.setAttribute("data-theme", "dark");
        localStorage.setItem("clubcal_theme", "dark");
      }
    });
  },

  bindNavigation() {
    Dom.navToggle.addEventListener("click", () => {
      const next = Dom.navToggle.getAttribute("aria-expanded") !== "true";
      Dom.navToggle.setAttribute("aria-expanded", String(next));
      Dom.navLinks.classList.toggle("open", next);
    });
  },

  bindSearchInputs() {
    const bindSuggestionInput = (input, container, onSelect) => {
      const render = () => UI.renderSchoolSuggestions(input.value, input, container, onSelect);
      input.addEventListener("input", render);
      input.addEventListener("focus", render);
    };

    bindSuggestionInput(Dom.landingSchoolInput, Dom.landingSuggestions, (value) => UI.selectLandingSchool(value));
    bindSuggestionInput(Dom.schoolSearchInput, Dom.suggestionsEl, (value) => UI.selectDiscoverySchool(value));
    bindSuggestionInput(Dom.signupSchoolInput, Dom.signupSchoolSuggestions, (value) => UI.selectSignupSchool(value));
  },

  bindDocumentEvents() {
    document.addEventListener("click", (event) => {
      if (!Dom.landingSuggestions.contains(event.target) && event.target !== Dom.landingSchoolInput) {
        UI.hideSuggestions(Dom.landingSchoolInput, Dom.landingSuggestions);
      }
      if (!Dom.suggestionsEl.contains(event.target) && event.target !== Dom.schoolSearchInput) {
        UI.hideSuggestions(Dom.schoolSearchInput, Dom.suggestionsEl);
      }
      if (!Dom.signupSchoolSuggestions.contains(event.target) && event.target !== Dom.signupSchoolInput) {
        UI.hideSuggestions(Dom.signupSchoolInput, Dom.signupSchoolSuggestions);
      }
    });

    Dom.filterBar.addEventListener("click", (event) => {
      const button = event.target.closest("[data-filter]");
      if (!button) return;
      store.setFilter(button.dataset.filter);
      [...Dom.filterBar.querySelectorAll("[data-filter]")].forEach((chip) =>
        chip.classList.toggle("active", chip === button)
      );
      UI.renderClubGrid();
    });

    window.addEventListener("hashchange", () => syncHashRoute());
  },

  bindForms() {
    Dom.signupForm.addEventListener("submit", (event) => Actions.handleSignupSubmit(event));
    Dom.signinForm.addEventListener("submit", (event) => Actions.handleSigninSubmit(event));
    Dom.eventForm.addEventListener("submit", (event) => Actions.handleEventSubmit(event));
    Dom.settingsForm.addEventListener("submit", (event) => Actions.handleSettingsSubmit(event));
    Dom.calendarCreateForm.addEventListener("submit", (event) => Actions.handleCalendarCreateSubmit(event));
    Dom.eventForm.addEventListener("input", () => UI.updatePreview());
    Dom.eventForm.addEventListener("change", () => UI.updatePreview());
  },

  bindSettingsActions() {
    Dom.settingsEditBtn.addEventListener("click", () => Actions.startSettingsEdit());
    Dom.settingsCancelBtn.addEventListener("click", () => Actions.cancelSettingsEdit());

    Dom.cancelEditBtn.addEventListener("click", () => UI.clearEditMode());

    Dom.signoutBtn.addEventListener("click", () => Actions.handleSignOut());
    Dom.navLogoutBtn.addEventListener("click", () => Actions.handleSignOut());
  },

  bindAuthState() {
    UI.syncNavAuthState();
    if (!isSupabaseConfigured()) return;

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (!session) {
        store.clearAuth();
        UI.syncNavAuthState();
        return;
      }

      await restoreSession();
      UI.syncNavAuthState();
    });
  },

  async restoreSession() {
    if (!isSupabaseConfigured()) return;
    await restoreSession();
    UI.syncNavAuthState();
    if (store.state.activeClub) {
      await UI.hydrateDashboard();
    }
  },

  hydrateInitialInputs() {
    if (!store.state.currentSchool) return;
    Dom.landingSchoolInput.value = store.state.currentSchool;
    Dom.schoolSearchInput.value = store.state.currentSchool;
  },

  async init() {
    this.initTheme();
    configureUI({ Dom });
    configureActions({ Dom });
    configureRouter({ Dom, UI });

    this.bindRouteTriggers();
    this.bindThemeToggle();
    this.bindTabs();
    this.bindNavigation();
    this.bindSearchInputs();
    this.bindDocumentEvents();
    this.bindForms();
    this.bindSettingsActions();
    this.bindAuthState();
    this.hydrateInitialInputs();
    UI.updatePreview();
    UI.setTab("events");
    await this.restoreSession();
    syncHashRoute();
  }
};

App.init();
