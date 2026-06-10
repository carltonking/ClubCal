import { fetchPendingClubs, approveClub, rejectClub } from "../services/authService.js";
import {
  fetchEventsForClub,
  fetchDiscoverySchools,
  fetchActiveClubsBySchool,
  deleteEvent,
  updateEventDownloadCount
} from "../services/eventService.js";
import { fetchCalendarsForClub } from "../services/calendarService.js";
import { isSupabaseConfigured } from "../services/supabaseClient.js";
import {
  escapeHTML,
  formatTimestamp,
  formatTimeRange,
  categoryClass,
  mapClub,
  mapEvent,
  parseRRule,
  getClubFeedUrl,
  getCalendarFeedUrl,
  getCalendarFeedWebcalUrl,
  toWebcalUrl
} from "../utils/helpers.js";
import { downloadICS } from "../utils/ics.js";
import { store } from "../state/store.js";
import { showView } from "../router/router.js";

// Admin access is verified server-side by the `admin-club-action` edge
// function against its ADMIN_SECRET env var. The client stores whatever
// the admin typed in sessionStorage under `clubcal.adminToken` and sends
// it with each admin action. A wrong token causes the edge function to
// return 401, which we surface as a toast.
const ADMIN_TOKEN_KEY = "clubcal.adminToken";

let Dom;

export function configureUI(context) {
  Dom = context.Dom;
}

export const UI = {
  showToast(title, message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<strong>${escapeHTML(title)}</strong><span>${escapeHTML(message)}</span>`;
    Dom.toastRegion.appendChild(toast);
    setTimeout(() => toast.remove(), 3600);
  },

  closeMobileNav() {
    Dom.navLinks.classList.remove("open");
    Dom.navToggle.setAttribute("aria-expanded", "false");
  },

  syncNavAuthState() {
    const isLoggedIn = Boolean(store.state.authSession);

    if (Dom.navDashboardLink) {
      Dom.navDashboardLink.hidden = !isLoggedIn;
    }

    Dom.navSignupLinks.forEach((link) => {
      link.hidden = isLoggedIn;
    });

    if (Dom.navSigninLink) {
      Dom.navSigninLink.hidden = isLoggedIn;
    }

    if (Dom.navLogoutBtn) {
      Dom.navLogoutBtn.hidden = !isLoggedIn;
    }
  },

  ensureConfigured() {
    if (isSupabaseConfigured()) return true;
    Dom.supabaseConfigSignup.hidden = false;
    Dom.supabaseConfigSignin.hidden = false;
    this.showToast("Supabase not configured", "Add your Supabase URL and anon key in the script config block first.");
    return false;
  },

  setSettingsMode(editing) {
    Dom.settingsReadView.hidden = editing;
    Dom.settingsForm.hidden = !editing;
    Dom.settingsEditBtn.hidden = editing;
  },

  populateEventForm(eventItem) {
    Dom.eventForm.querySelector('[name="title"]').value = eventItem.title;
    Dom.eventForm.querySelector('[name="date"]').value = eventItem.date;
    Dom.eventForm.querySelector('[name="startTime"]').value = (eventItem.start_time || "").replace(":", "");
    Dom.eventForm.querySelector('[name="endTime"]').value = (eventItem.end_time || "").replace(":", "");
    Dom.eventForm.querySelector('[name="address"]').value = eventItem.address || "";
    Dom.eventForm.querySelector('[name="room"]').value = eventItem.room || "";
    Dom.eventForm.querySelector('[name="attire"]').value = eventItem.attire || "";
    Dom.eventForm.querySelector('[name="category"]').value = eventItem.category || "";
    Dom.eventForm.querySelector('[name="calendarId"]').value = eventItem.calendar_id || "";
    Dom.eventForm.querySelector('[name="description"]').value = eventItem.description || "";
    Dom.eventForm.querySelector('[name="rsvp"]').value = eventItem.rsvp_url || "";
    const { repeat, until } = parseRRule(eventItem.recurrence);
    const repeatField = Dom.eventForm.querySelector('[name="repeat"]');
    const repeatUntilField = Dom.eventForm.querySelector('[name="repeatUntil"]');
    if (repeatField) repeatField.value = repeat;
    if (repeatUntilField) repeatUntilField.value = until;
    if (Dom.eventSubmitBtn) Dom.eventSubmitBtn.textContent = "Update Event";
    if (Dom.cancelEditBtn) Dom.cancelEditBtn.hidden = false;
    this.updatePreview();
  },

  clearEditMode() {
    store.clearEditingEvent();
    Dom.eventForm.reset();
    if (Dom.eventSubmitBtn) Dom.eventSubmitBtn.textContent = "Publish Event";
    if (Dom.cancelEditBtn) Dom.cancelEditBtn.hidden = true;
    this.updatePreview();
  },

  updatePreview() {
    const formData = new FormData(Dom.eventForm);
    const title = formData.get("title") || "Your event title";
    const description =
      formData.get("description") || "Add an optional description to give students the context they need.";
    const date = formData.get("date");
    const startTime = formData.get("startTime");
    const endTime = formData.get("endTime");
    const address = formData.get("address");
    const room = formData.get("room");
    const attire = formData.get("attire");
    const category = formData.get("category");
    const rsvp = formData.get("rsvp");

    Dom.preview.title.textContent = title;
    Dom.preview.description.textContent = description;
    Dom.preview.datetime.textContent = formatTimeRange(date, startTime, endTime);
    Dom.preview.location.textContent =
      address || room ? [address, room].filter(Boolean).join(", ") : "Add an address and optional room/building.";
    Dom.preview.attire.textContent = attire || "Optional attire note.";
    Dom.preview.category.textContent = category || "Pick a category for discovery.";
    Dom.preview.rsvp.textContent = rsvp || "Optional RSVP link appears here.";
  },

  async hydrateDashboard() {
    const { activeClub, dashboardStatus } = store.state;
    if (!activeClub) return;

    Dom.dashboardTitle.textContent = `Welcome back, ${activeClub.clubName}`;
    Dom.settingsClubName.textContent = activeClub.clubName;
    Dom.settingsSchool.textContent = activeClub.school || "-";
    Dom.settingsEmail.textContent = activeClub.email;

    Dom.settingsClubNameInput.value = activeClub.clubName;
    Dom.settingsSchoolInput.value = activeClub.school || "";
    Dom.settingsEmailInput.value = activeClub.email;
    const isApproved = dashboardStatus === "approved";
    Dom.accountBadge.className = `badge ${isApproved ? "active" : "pending"}`;
    Dom.accountBadge.textContent = isApproved ? "Active" : "Pending";

    this.syncNavAuthState();
    await this.renderEvents();
    await this.renderCalendars();
    this.renderInsights();
  },

  async renderEvents() {
    if (!store.state.activeClub?.id) {
      Dom.eventsList.innerHTML = `<div class="empty-state">No events yet. Create your first event in the <strong>Create Event</strong> tab and it will appear here.</div>`;
      return;
    }

    Dom.eventsList.innerHTML = `<div class="loading-state">Loading your events...</div>`;

    try {
      const events = await fetchEventsForClub(store.state.activeClub.id, "created_at", false);
      store.setDashboardEvents(events);
    } catch (error) {
      store.setDashboardEvents([]);
      Dom.eventsList.innerHTML = `<div class="empty-state">${escapeHTML(error.message)}</div>`;
      return;
    }

    if (!store.state.dashboardEvents.length) {
      Dom.eventsList.innerHTML = `<div class="empty-state">No events yet. Create your first event in the <strong>Create Event</strong> tab and it will appear here.</div>`;
      return;
    }

    Dom.eventsList.innerHTML = store.state.dashboardEvents
      .map(
        (eventItem) => `
      <article class="event-card">
        <div class="club-top">
          <div>
            <h3 class="event-heading">${escapeHTML(eventItem.title)}</h3>
            <div class="badge ${categoryClass(eventItem.category)}">${escapeHTML(eventItem.category)}</div>
            ${eventItem.recurrence ? `<div class="badge">Repeats ${escapeHTML(parseRRule(eventItem.recurrence).repeat)}</div>` : ""}
            ${eventItem.cancelled ? `<div class="badge stale">Cancelled</div>` : ""}
          </div>
        </div>
        <div class="event-meta">
          <div class="meta-line"><strong>When</strong><span>${escapeHTML(formatTimeRange(eventItem.date, eventItem.start_time, eventItem.end_time))}</span></div>
          <div class="meta-line"><strong>Where</strong><span>${escapeHTML([eventItem.address, eventItem.room].filter(Boolean).join(", "))}</span></div>
          <div class="meta-line"><strong>Downloads</strong><span>${escapeHTML(String(eventItem.download_count || 0))}</span></div>
        </div>
        <div class="event-actions">
          <button class="btn btn-secondary btn-small js-download-event" data-id="${eventItem.id}">Download .ics</button>
          <button class="btn btn-ghost btn-small js-edit-event" data-id="${eventItem.id}" ${eventItem.cancelled ? "disabled" : ""}>Edit</button>
          <button class="btn btn-danger btn-small js-delete-event" data-id="${eventItem.id}">Delete</button>
        </div>
      </article>
    `
      )
      .join("");

    Dom.eventsList.querySelectorAll(".js-download-event").forEach((button) => {
      button.addEventListener("click", async () => {
        const eventItem = store.state.dashboardEvents.find((item) => String(item.id) === button.dataset.id);
        if (!eventItem) return;

        downloadICS(eventItem, store.state.activeClub.clubName, button);
        try {
          await updateEventDownloadCount(eventItem);
          await this.renderEvents();
          this.renderInsights();
        } catch (error) {
          this.showToast("Download tracked locally", "The event downloaded, but analytics could not be updated.");
        }
        this.showToast("Calendar file downloaded", `${eventItem.title} is ready for your calendar.`);
      });
    });

    Dom.eventsList.querySelectorAll(".js-delete-event").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          await deleteEvent(button.dataset.id);
          await this.renderEvents();
          this.renderInsights();
          this.showToast("Event deleted", "The event was removed from your dashboard.");
        } catch (error) {
          this.showToast("Delete failed", error.message);
        }
      });
    });

    Dom.eventsList.querySelectorAll(".js-edit-event").forEach((button) => {
      button.addEventListener("click", async () => {
        try {
          const eventItem = store.state.dashboardEvents.find((item) => String(item.id) === button.dataset.id);
          if (!eventItem) return;
          await this.populateEventForm(eventItem);
          store.setEditingEvent(eventItem.id);
          this.setTab("create");
        } catch (error) {
          this.showToast("Edit failed", error.message);
        }
      });
    });
  },

  async renderCalendars() {
    const clubId = store.state.activeClub?.id;
    if (!clubId) return;

    try {
      const calendars = await fetchCalendarsForClub(clubId);
      store.setDashboardCalendars(calendars);
    } catch (error) {
      Dom.calendarsList.innerHTML = `<div class="empty-state">${escapeHTML(error.message)}</div>`;
      return;
    }

    this.populateCalendarDropdown();

    const calendars = store.state.dashboardCalendars;
    if (!calendars.length) {
      Dom.calendarsList.innerHTML = `<div class="empty-state">No calendars yet. Create one above to get started.</div>`;
      return;
    }

    Dom.calendarsList.innerHTML = calendars
      .map((cal) => {
        const feedUrl = getCalendarFeedWebcalUrl(clubId, cal.id);
        const httpFeedUrl = getCalendarFeedUrl(clubId, cal.id);
        return `
        <div class="calendar-card">
          <div class="calendar-card-head">
            <strong>${escapeHTML(cal.name)}</strong>
            <button class="btn btn-ghost btn-small btn-danger js-delete-calendar" data-id="${escapeHTML(cal.id)}">Delete</button>
          </div>
          <div class="form">
            <div class="field-row settings-calendar-row">
              <div class="field">
                <label>Feed URL</label>
                <input type="text" value="${escapeHTML(feedUrl)}" readonly>
              </div>
              <div class="field">
                <label>&nbsp;</label>
                <button class="btn btn-secondary js-copy-calendar-link" data-url="${escapeHTML(feedUrl)}">Copy Link</button>
              </div>
            </div>
            <div class="settings-actions settings-calendar-actions">
              <button class="btn btn-primary btn-small js-google-calendar" data-url="${escapeHTML(httpFeedUrl)}">Add to Google Calendar</button>
              <button class="btn btn-ghost btn-small js-apple-calendar" data-url="${escapeHTML(feedUrl)}">Add to Apple Calendar</button>
            </div>
          </div>
        </div>
      `;
      })
      .join("");

    Dom.calendarsList.querySelectorAll(".js-delete-calendar").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (
          !confirm(
            `Delete "${calendars.find((c) => c.id === btn.dataset.id)?.name}"? Events assigned to it will become unassigned.`
          )
        )
          return;
        try {
          const { deleteCalendar } = await import("../services/calendarService.js");
          await deleteCalendar(btn.dataset.id);
          await this.renderCalendars();
          this.showToast("Calendar deleted", "The calendar and its feed link have been removed.");
        } catch (error) {
          this.showToast("Delete failed", error.message);
        }
      });
    });

    Dom.calendarsList.querySelectorAll(".js-copy-calendar-link").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(btn.dataset.url);
          const original = btn.textContent;
          btn.textContent = "Copied ✓";
          this.showToast("Calendar link copied", "Share this link so others can subscribe.");
          setTimeout(() => {
            btn.textContent = original;
          }, 2000);
        } catch {
          this.showToast("Copy failed", "Could not copy the link to your clipboard.");
        }
      });
    });

    Dom.calendarsList.querySelectorAll(".js-google-calendar").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.open(
          `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(toWebcalUrl(btn.dataset.url))}`,
          "_blank",
          "noopener"
        );
      });
    });

    Dom.calendarsList.querySelectorAll(".js-apple-calendar").forEach((btn) => {
      btn.addEventListener("click", () => {
        window.location.href = btn.dataset.url;
      });
    });
  },

  populateCalendarDropdown() {
    const calendars = store.state.dashboardCalendars;
    const select = Dom.eventCalendarSelect;
    if (!select) return;
    const current = select.value;
    select.innerHTML =
      `<option value="">— No specific calendar —</option>` +
      calendars.map((cal) => `<option value="${escapeHTML(cal.id)}">${escapeHTML(cal.name)}</option>`).join("");
    if (current) select.value = current;
  },

  renderInsights() {
    const events = store.state.dashboardEvents;
    const totalDownloads = events.reduce((sum, eventItem) => sum + (eventItem.download_count || 0), 0);
    const topEvent = [...events].sort((a, b) => (b.download_count || 0) - (a.download_count || 0))[0];

    Dom.insightsTotalDownloads.textContent = String(totalDownloads);
    Dom.insightsEventCount.textContent = String(events.length);
    Dom.insightsTopDownloads.textContent = String(topEvent?.download_count || 0);
    Dom.insightsTopEventLabel.textContent = topEvent ? topEvent.title : "No event downloads yet.";

    if (!events.length) {
      Dom.insightsChart.innerHTML = `<div class="empty-state">Create your first event to start tracking downloads.</div>`;
      return;
    }

    const maxDownloads = Math.max(...events.map((eventItem) => eventItem.download_count || 0), 1);
    Dom.insightsChart.innerHTML = events
      .map(
        (eventItem) => `
      <div class="bar-group">
        <div class="bar-track">
          <div class="bar-fill" data-height="${Math.max(8, Math.round(((eventItem.download_count || 0) / maxDownloads) * 100))}"></div>
        </div>
        <div class="bar-value">${escapeHTML(String(eventItem.download_count || 0))}</div>
        <div class="bar-label">${escapeHTML(eventItem.title)}</div>
      </div>
    `
      )
      .join("");

    Dom.insightsChart.querySelectorAll(".bar-fill").forEach((bar) => {
      requestAnimationFrame(() => {
        bar.style.height = `${bar.dataset.height}%`;
      });
    });
  },

  async renderAdminList() {
    if (!this.ensureConfigured()) {
      Dom.adminList.innerHTML = `<div class="empty-state">Supabase must be configured before the admin panel can load pending clubs.</div>`;
      return;
    }

    Dom.adminList.innerHTML = `<div class="loading-state">Loading pending clubs...</div>`;

    try {
      const pendingClubs = await fetchPendingClubs();
      if (!pendingClubs.length) {
        Dom.adminList.innerHTML = `<div class="empty-state">No pending club applications right now.</div>`;
        return;
      }

      Dom.adminList.innerHTML = pendingClubs
        .map(
          (club) => `
        <article class="event-card">
          <div class="club-top">
            <div>
              <h3 class="event-heading">${escapeHTML(club.clubName)}</h3>
              <div class="badge pending">Pending Review</div>
            </div>
          </div>
          <div class="event-meta">
            <div class="meta-line"><strong>School</strong><span>${escapeHTML(club.school)}</span></div>
            <div class="meta-line"><strong>Email</strong><span>${escapeHTML(club.email)}</span></div>
            <div class="meta-line"><strong>Submitted</strong><span>${escapeHTML(formatTimestamp(club.createdAt))}</span></div>
          </div>
          <div class="event-actions">
            <button class="btn btn-primary btn-small js-approve-club" data-id="${club.id}">Approve</button>
            <button class="btn btn-danger btn-small js-reject-club" data-id="${club.id}">Reject</button>
          </div>
        </article>
      `
        )
        .join("");

      const handleAdminError = (error, title) => {
        const message = error?.message || "Unknown error.";
        if (/unauthori[sz]ed/i.test(message) || /401/.test(message)) {
          this.clearAdminAccess();
          this.showToast("Admin token rejected", "The admin token was invalid. Please re-enter it.");
          showView("landing");
        } else {
          this.showToast(title, message);
        }
      };

      Dom.adminList.querySelectorAll(".js-approve-club").forEach((button) => {
        button.addEventListener("click", async () => {
          try {
            await approveClub(button.dataset.id);
            this.showToast("Club approved", "The club is now visible in discovery.");
            this.renderAdminList();
          } catch (error) {
            handleAdminError(error, "Approve failed");
          }
        });
      });

      Dom.adminList.querySelectorAll(".js-reject-club").forEach((button) => {
        button.addEventListener("click", async () => {
          const reason = window.prompt("Optional denial reason (shown in the applicant's email):", "") || "";
          try {
            await rejectClub(button.dataset.id, reason);
            this.showToast("Club rejected", "The applicant was marked denied.");
            this.renderAdminList();
          } catch (error) {
            handleAdminError(error, "Reject failed");
          }
        });
      });
    } catch (error) {
      Dom.adminList.innerHTML = `<div class="empty-state">${escapeHTML(error.message)}</div>`;
    }
  },

  async loadSchoolDiscovery(school, navigate = false) {
    if (!this.ensureConfigured()) return;

    store.setCurrentSchool(school);
    Dom.selectedSchoolTitle.textContent = `${school} Clubs`;
    Dom.schoolSearchInput.value = school;
    Dom.landingSchoolInput.value = school;
    Dom.discoveryResults.hidden = false;

    await this.renderClubGrid();
    if (navigate) showView("discovery");
  },

  async renderClubGrid() {
    Dom.clubGrid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1; color:var(--muted);">Loading clubs...</div>
    `;

    let clubs = [];
    try {
      clubs = await fetchActiveClubsBySchool(store.state.currentSchool);
    } catch (error) {
      Dom.clubGrid.innerHTML = `<div class="empty-state">${escapeHTML(error.message)}</div>`;
      return;
    }

    const normalized = clubs.map((club) => {
      const clubEvents = (club.events || [])
        .map(mapEvent)
        .sort((a, b) => new Date(`${a.date}T${a.start_time}`) - new Date(`${b.date}T${b.start_time}`));
      const upcomingEvents = clubEvents.filter(
        (eventItem) => new Date(`${eventItem.date}T${eventItem.start_time}`) >= new Date()
      );
      const nextEvent = upcomingEvents[0] || null;

      return {
        ...mapClub(club),
        events: clubEvents,
        nextEvent,
        category: nextEvent?.category || clubEvents[0]?.category || "Other"
      };
    });

    store.setDiscoveryRows(normalized);
    this.paintClubGrid();
  },

  // Render the discovery grid from already-fetched state. Called after a fetch
  // and directly when the category filter changes, so switching chips does not
  // hit the network again.
  paintClubGrid() {
    if (!store.state.currentClubRows.length) {
      Dom.clubGrid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <p style="font-size:1.1rem; font-weight:700; color:var(--navy); margin:0 0 8px;">No clubs listed yet at ${escapeHTML(store.state.currentSchool)}.</p>
          <p style="margin:0 0 18px;">If you manage a student organization here, you can add it to the directory.</p>
          <button class="btn btn-primary btn-small" data-route="signup">Add your club</button>
        </div>
      `;

      Dom.clubGrid.querySelectorAll("[data-route]").forEach((trigger) => {
        trigger.addEventListener("click", (event) => {
          event.preventDefault();
          showView(trigger.dataset.route);
        });
      });
      return;
    }

    if (!store.state.currentDiscoveryData.length) {
      Dom.clubGrid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">No clubs match the “${escapeHTML(store.state.currentFilter)}” filter at ${escapeHTML(store.state.currentSchool)}.</div>
      `;
      return;
    }

    // Mirrors the 200-club cap in fetchActiveClubsBySchool: if the result hits
    // it, surface that the list is truncated instead of silently dropping clubs.
    const truncatedNote =
      store.state.currentClubRows.length >= 200
        ? `<div class="empty-state" style="grid-column:1/-1; color:var(--muted);">Showing the first 200 clubs — search for your school to narrow the list.</div>`
        : "";

    Dom.clubGrid.innerHTML =
      truncatedNote +
      store.state.currentDiscoveryData
        .map(
          (club) => `
      <article class="club-card" data-club-id="${club.id}">
        <div class="club-top">
          <div>
            <h3 class="event-heading">${escapeHTML(club.clubName)}</h3>
            <div class="badge ${categoryClass(club.category)}">${escapeHTML(club.category)}</div>
          </div>
          <div class="club-count">${escapeHTML(String(club.events.length))} events</div>
        </div>
        <p>Review upcoming events and subscribe to this club's calendar feed.</p>
        ${
          club.nextEvent
            ? `
          <div class="event-preview">
            <div class="event-preview-title">${escapeHTML(club.nextEvent.title)}</div>
            <div class="event-preview-copy">${escapeHTML(formatTimeRange(club.nextEvent.date, club.nextEvent.start_time, club.nextEvent.end_time))}</div>
          </div>
        `
            : `
          <div class="stale-indicator">No upcoming events yet</div>
        `
        }
        <div class="club-actions">
          <button class="btn btn-primary btn-small js-google-subscribe" data-id="${club.id}">Subscribe on Google Calendar</button>
          <button class="btn btn-ghost btn-small js-apple-subscribe" data-id="${club.id}">Subscribe on Apple Calendar</button>
          <button class="btn btn-ghost btn-small js-toggle-events" data-expanded="false" ${club.events.length ? "" : "disabled"}>View All Events</button>
        </div>
        <div class="club-events-expanded" hidden>
          ${
            club.events.length
              ? club.events
                  .map(
                    (eventItem) => `
            <div class="mini-event">
              <strong class="mini-event-title">${escapeHTML(eventItem.title)}</strong>
              <div>${escapeHTML(formatTimeRange(eventItem.date, eventItem.start_time, eventItem.end_time))}</div>
              <div>${escapeHTML([eventItem.address, eventItem.room].filter(Boolean).join(", "))}</div>
            </div>
          `
                  )
                  .join("")
              : `<div class="mini-event">No upcoming events yet</div>`
          }
        </div>
      </article>
    `
        )
        .join("");

    Dom.clubGrid.querySelectorAll(".js-google-subscribe").forEach((button) => {
      button.addEventListener("click", () => {
        const feedUrl = getClubFeedUrl(button.dataset.id);
        const webcalUrl = toWebcalUrl(feedUrl);
        window.open(
          `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`,
          "_blank",
          "noopener"
        );
      });
    });

    Dom.clubGrid.querySelectorAll(".js-apple-subscribe").forEach((button) => {
      button.addEventListener("click", () => {
        const feedUrl = getClubFeedUrl(button.dataset.id);
        window.location.href = toWebcalUrl(feedUrl);
      });
    });

    Dom.clubGrid.querySelectorAll(".js-toggle-events").forEach((button) => {
      button.addEventListener("click", () => {
        const expanded = button.dataset.expanded === "true";
        const target = button.closest(".club-card").querySelector(".club-events-expanded");
        button.dataset.expanded = String(!expanded);
        button.textContent = expanded ? "View All Events" : "Hide Events";
        target.hidden = expanded;
      });
    });
  },

  async renderSchoolSuggestions(query, input, container, onSelect) {
    const value = query.trim().toLowerCase();
    if (!value) {
      this.hideSuggestions(input, container);
      return;
    }

    let matches = [];
    try {
      const schools = await fetchDiscoverySchools();
      matches = schools.filter((school) => school.toLowerCase().includes(value)).slice(0, 10);
    } catch (error) {
      this.hideSuggestions(input, container);
      return;
    }

    if (!matches.length) {
      this.hideSuggestions(input, container);
      return;
    }

    container.innerHTML = matches
      .map(
        (school) => `
      <button class="suggestion" type="button" data-school="${escapeHTML(school)}">${escapeHTML(school)}</button>
    `
      )
      .join("");
    container.classList.add("visible");
    input.setAttribute("aria-expanded", "true");
    container.querySelectorAll(".suggestion").forEach((button) => {
      button.addEventListener("click", () => onSelect(button.dataset.school));
    });
  },

  hideSuggestions(input, container) {
    container.classList.remove("visible");
    container.innerHTML = "";
    input.setAttribute("aria-expanded", "false");
  },

  selectSignupSchool(name) {
    Dom.signupSchoolInput.value = name;
    this.hideSuggestions(Dom.signupSchoolInput, Dom.signupSchoolSuggestions);
  },

  selectLandingSchool(name) {
    Dom.landingSchoolInput.value = name;
    this.hideSuggestions(Dom.landingSchoolInput, Dom.landingSuggestions);
    this.loadSchoolDiscovery(name, true);
  },

  selectDiscoverySchool(name) {
    Dom.schoolSearchInput.value = name;
    this.hideSuggestions(Dom.schoolSearchInput, Dom.suggestionsEl);
    this.loadSchoolDiscovery(name, false);
  },

  ensureAdminAccess() {
    // A token already stored this session is treated as "allowed to try."
    // Real verification happens server-side — if the token is wrong, the
    // approve/reject call returns 401 and we clear it then.
    if (sessionStorage.getItem(ADMIN_TOKEN_KEY)) return true;

    const entry = window.prompt("Enter the admin access token for Club Cal:");
    if (entry && entry.trim()) {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, entry.trim());
      return true;
    }

    if (window.location.hash === "#admin") {
      history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
    this.showToast("Admin access required", "An admin token is required to open the admin panel.");
    showView("landing");
    return false;
  },

  clearAdminAccess() {
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
  },

  setTab(name) {
    store.setTab(name);
    Dom.tabButtons.forEach((button) => button.classList.toggle("active", button.dataset.tab === name));
    Dom.tabPanels.forEach((panel) => panel.classList.toggle("active", panel.dataset.tabPanel === name));
    if (name === "insights") {
      this.renderInsights();
    }
  }
};
