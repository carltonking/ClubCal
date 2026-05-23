import { signUpClub, signInClub, signOutClub, updateClubProfile } from "../services/authService.js";
import { createEvent } from "../services/eventService.js";
import { createCalendar } from "../services/calendarService.js";
import { clearErrors, setError, getClubFeedWebcalUrl } from "../utils/helpers.js";
import { store } from "../state/store.js";
import { UI } from "../ui/ui.js";
import { showView } from "../router/router.js";

let Dom;

export function configureActions(context) {
  Dom = context.Dom;
}

export const Actions = {
  async handleSignupSubmit(event) {
    event.preventDefault();
    clearErrors(Dom.signupForm);
    if (!UI.ensureConfigured()) return;

    const formData = new FormData(Dom.signupForm);
    const payload = {
      clubName: String(formData.get("clubName") || "").trim(),
      school: String(formData.get("school") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      password: String(formData.get("password") || "")
    };

    const authData = await signUpClub(payload, Dom.signupForm);
    if (!authData) return;

    Dom.signupSuccessText.textContent = `Thanks! Your application for ${payload.clubName} has been submitted for review.`;
    Dom.signupSuccess.classList.add("visible");
    Dom.signupForm.classList.add("hidden");
  },

  async handleSigninSubmit(event) {
    event.preventDefault();
    clearErrors(Dom.signinForm);
    if (!UI.ensureConfigured()) return;

    const formData = new FormData(Dom.signinForm);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    let valid = true;

    if (!email) {
      setError(Dom.signinForm, "signinEmail", "Please enter your email address.");
      valid = false;
    }
    if (!password) {
      setError(Dom.signinForm, "signinPassword", "Please enter your password.");
      valid = false;
    }
    if (!valid) return;

    try {
      await signInClub(email, password);
      await UI.hydrateDashboard();
      UI.setSettingsMode(false);
      UI.setTab("events");
      showView("dashboard");
    } catch (error) {
      const message =
        error.message === "Invalid email or password." ? error.message : "No approved club found for this email.";
      setError(Dom.signinForm, "signinPassword", message);
    }
  },

  async handleEventSubmit(event) {
    event.preventDefault();
    clearErrors(Dom.eventForm);
    if (!UI.ensureConfigured()) return;
    if (!store.state.activeClub) {
      UI.showToast("Sign in required", "Please sign in with a club account before creating events.");
      return;
    }

    const formData = new FormData(Dom.eventForm);
    const payload = Object.fromEntries(formData.entries());
    const requiredFields = [
      ["title", "Please enter an event title."],
      ["date", "Please select a date."],
      ["startTime", "Please choose a start time."],
      ["endTime", "Please choose an end time."],
      ["address", "Please add a location or address."],
      ["category", "Please choose a category."]
    ];

    let valid = true;
    requiredFields.forEach(([field, message]) => {
      if (!String(payload[field] || "").trim()) {
        setError(Dom.eventForm, field, message);
        valid = false;
      }
    });

    if (payload.rsvp && !/^https?:\/\/.+/i.test(payload.rsvp)) {
      setError(Dom.eventForm, "rsvp", "Please enter a valid URL starting with http:// or https://");
      valid = false;
    }

    if (payload.date && payload.startTime && payload.endTime) {
      const start = new Date(`${payload.date}T${payload.startTime}`);
      const end = new Date(`${payload.date}T${payload.endTime}`);
      if (end <= start) {
        setError(Dom.eventForm, "endTime", "End time must be after the start time.");
        valid = false;
      }
    }

    if (!valid) return;

    try {
      const newEvent = await createEvent(payload);
      UI.showToast("Event published", `${newEvent.title} was saved to your club calendar.`);
      Dom.eventForm.reset();
      UI.updatePreview();
      await UI.renderEvents();
      UI.renderInsights();
      UI.setTab("events");
    } catch (error) {
      UI.showToast("Event creation failed", error.message);
    }
  },

  startSettingsEdit() {
    if (!store.state.activeClub) return;
    Dom.settingsClubNameInput.value = store.state.activeClub.clubName;
    Dom.settingsSchoolInput.value = store.state.activeClub.school || "";
    Dom.settingsEmailInput.value = store.state.activeClub.email;
    UI.setSettingsMode(true);
  },

  cancelSettingsEdit() {
    UI.setSettingsMode(false);
    clearErrors(Dom.settingsForm);
  },

  async handleSettingsSubmit(event) {
    event.preventDefault();
    clearErrors(Dom.settingsForm);
    if (!store.state.activeClub || !UI.ensureConfigured()) return;

    const clubName = Dom.settingsClubNameInput.value.trim();
    const school = Dom.settingsSchoolInput.value.trim();
    let valid = true;

    if (!clubName) {
      setError(Dom.settingsForm, "settingsClubName", "Club name is required.");
      valid = false;
    }
    if (!school) {
      setError(Dom.settingsForm, "settingsSchool", "School is required.");
      valid = false;
    }
    if (!valid) return;

    try {
      store.state.activeClub = await updateClubProfile(store.state.activeClub.id, {
        club_name: clubName,
        school
      });
      UI.setSettingsMode(false);
      await UI.hydrateDashboard();
      UI.showToast("Settings updated", "Your club profile was saved.");
    } catch (error) {
      UI.showToast("Update failed", error.message);
    }
  },

  async copyCalendarLink() {
    if (!Dom.calendarFeedUrlInput.value) return;
    try {
      await navigator.clipboard.writeText(Dom.calendarFeedUrlInput.value);
      const originalLabel = Dom.copyCalendarLinkBtn.textContent;
      Dom.copyCalendarLinkBtn.textContent = "Copied ✓";
      UI.showToast("Calendar link copied", "Your club subscription link is ready to share.");
      setTimeout(() => {
        Dom.copyCalendarLinkBtn.textContent = originalLabel;
      }, 2000);
    } catch (error) {
      UI.showToast("Copy failed", "We couldn't copy the calendar link to your clipboard.");
    }
  },

  openGoogleFeed() {
    if (!store.state.activeClub?.id) return;
    const webcalUrl = getClubFeedWebcalUrl(store.state.activeClub.id);
    window.open(`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`, "_blank", "noopener");
  },

  openAppleFeed() {
    if (!store.state.activeClub?.id) return;
    window.location.href = getClubFeedWebcalUrl(store.state.activeClub.id);
  },

  async handleCalendarCreateSubmit(event) {
    event.preventDefault();
    clearErrors(Dom.calendarCreateForm);
    const name = Dom.calendarNameInput.value.trim();

    if (!name) {
      setError(Dom.calendarCreateForm, "calendarName", "Please enter a calendar name.");
      return;
    }

    try {
      await createCalendar(name);
      Dom.calendarNameInput.value = "";
      await UI.renderCalendars();
      UI.showToast("Calendar created", `"${name}" is ready. Share its feed link with your audience.`);
    } catch (error) {
      setError(Dom.calendarCreateForm, "calendarName", error.message);
    }
  },

  async handleSignOut() {
    try {
      await signOutClub();
    } catch (error) {
      store.clearAuth();
    }
    UI.showToast("Signed out", "You’ve returned to the Club Cal home page.");
    showView("landing");
  }
};
