import {
  signUpClub,
  signInClub,
  signOutClub,
  updateClubProfile,
  requestPasswordReset,
  updatePassword,
  restoreSession
} from "../services/authService.js";
import { createEvent, updateEvent } from "../services/eventService.js";
import { createCalendar } from "../services/calendarService.js";
import { clearErrors, setError, buildRRule } from "../utils/helpers.js";
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

    // If the project requires email confirmation, signUp returns a user but no
    // session — be honest about the extra step instead of implying it's done.
    const needsEmailConfirm = authData.user && !authData.session;
    Dom.signupSuccessText.textContent = needsEmailConfirm
      ? `Thanks! Check your email to confirm your address. Once confirmed, your application for ${payload.clubName} will be reviewed.`
      : `Thanks! Your application for ${payload.clubName} has been submitted for review.`;
    Dom.signupSuccess.classList.add("visible");
    Dom.signupForm.classList.add("hidden");
  },

  async handleForgotPassword() {
    if (!UI.ensureConfigured()) return;
    clearErrors(Dom.signinForm);
    const email = String(Dom.signinForm.querySelector('[name="email"]').value || "").trim();
    if (!email) {
      setError(Dom.signinForm, "signinEmail", "Enter your email above, then tap “Forgot password”.");
      return;
    }
    try {
      await requestPasswordReset(email);
      UI.showToast("Check your email", "If an account exists for that email, a reset link is on its way.");
    } catch (error) {
      UI.showToast("Reset failed", error.message);
    }
  },

  async handleResetPasswordSubmit(event) {
    event.preventDefault();
    clearErrors(Dom.resetPasswordForm);
    const password = String(Dom.resetPasswordForm.querySelector('[name="password"]').value || "");
    if (password.length < 6) {
      setError(Dom.resetPasswordForm, "resetPassword", "Password must be at least 6 characters.");
      return;
    }
    try {
      await updatePassword(password);
      Dom.resetPasswordForm.reset();
      UI.showToast("Password updated", "Your new password is set.");
      // The recovery session is active; hydrate the club if we can.
      await restoreSession();
      UI.syncNavAuthState();
      if (store.state.activeClub) {
        await UI.hydrateDashboard();
        showView("dashboard");
      } else {
        showView("signin");
      }
    } catch (error) {
      setError(Dom.resetPasswordForm, "resetPassword", error.message);
    }
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
    // Only approved clubs may publish (mirrors the events_insert_own RLS gate);
    // editing an existing event is still allowed.
    if (!store.state.editingEventId && store.state.dashboardStatus !== "approved") {
      UI.showToast("Approval required", "Your club must be approved before you can publish events.");
      return;
    }

    const formData = new FormData(Dom.eventForm);
    const payload = Object.fromEntries(formData.entries());
    const requiredFields = [
      ["title", "Please enter an event title."],
      ["date", "Please select a date."],
      ["startTime", "Please enter a start time."],
      ["endTime", "Please enter an end time."],
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

    const VALID_24H = /^([01]\d|2[0-3])([0-5]\d)$/;

    const validateAndConvertTime = (field) => {
      const raw = String(payload[field] || "").replace(/\s/g, "");
      if (!raw) return null;
      const match = raw.match(VALID_24H);
      if (!match) {
        setError(Dom.eventForm, field, "* Must be in correct 24-hour format.");
        valid = false;
        return null;
      }
      return `${match[1]}:${match[2]}`;
    };

    const convertedStart = payload.startTime ? validateAndConvertTime("startTime") : null;
    const convertedEnd = payload.endTime ? validateAndConvertTime("endTime") : null;

    if (convertedStart && convertedEnd) {
      payload.startTime = convertedStart;
      payload.endTime = convertedEnd;
      const start = new Date(`${payload.date}T${payload.startTime}`);
      const end = new Date(`${payload.date}T${payload.endTime}`);
      if (end <= start) {
        setError(Dom.eventForm, "endTime", "* Must be in correct 24-hour format.");
        valid = false;
      }
    }

    // Recurrence (optional). Build a structured RRULE from the constrained
    // "Repeats" picker; never accept free text.
    if (payload.repeat) {
      if (payload.repeatUntil && payload.date && payload.repeatUntil < payload.date) {
        setError(Dom.eventForm, "repeatUntil", "Repeat-until date must be on or after the event date.");
        valid = false;
      }
      payload.recurrence = buildRRule(payload.repeat, payload.repeatUntil);
    } else {
      payload.recurrence = null;
    }

    if (!valid) return;

    try {
      const editingId = store.state.editingEventId;
      if (editingId) {
        const updatedEvent = await updateEvent(editingId, payload);
        UI.showToast("Event updated", `${updatedEvent.title} was saved.`);
        UI.clearEditMode();
      } else {
        const newEvent = await createEvent(payload);
        UI.showToast("Event published", `${newEvent.title} was saved to your club calendar.`);
        Dom.eventForm.reset();
        UI.updatePreview();
      }
      await UI.renderEvents();
      UI.renderInsights();
      UI.setTab("events");
    } catch (error) {
      UI.showToast(store.state.editingEventId ? "Event update failed" : "Event creation failed", error.message);
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
