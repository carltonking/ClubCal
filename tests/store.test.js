import { describe, it, expect, beforeEach } from "vitest";

const STORAGE_KEY = "clubcal_last_viewed_school";

beforeEach(() => {
  localStorage.clear();
});

const { store } = await import("../src/state/store.js");

describe("store", () => {
  it("has default state", () => {
    expect(store.state.currentView).toBe("landing");
    expect(store.state.currentTab).toBe("events");
    expect(store.state.currentSchool).toBe("");
    expect(store.state.currentFilter).toBe("All");
    expect(store.state.currentClubRows).toEqual([]);
    expect(store.state.currentDiscoveryData).toEqual([]);
    expect(store.state.activeClub).toBeNull();
    expect(store.state.authSession).toBeNull();
    expect(store.state.dashboardEvents).toEqual([]);
    expect(store.state.dashboardCalendars).toEqual([]);
    expect(store.state.dashboardStatus).toBe("");
    expect(store.state.editingEventId).toBeNull();
  });

  describe("setView", () => {
    it("updates currentView", () => {
      store.setView("dashboard");
      expect(store.state.currentView).toBe("dashboard");
    });
  });

  describe("setTab", () => {
    it("updates currentTab", () => {
      store.setTab("insights");
      expect(store.state.currentTab).toBe("insights");
    });
  });

  describe("setCurrentSchool", () => {
    it("updates currentSchool and persists to localStorage", () => {
      store.setCurrentSchool("State University");
      expect(store.state.currentSchool).toBe("State University");
      expect(localStorage.getItem(STORAGE_KEY)).toBe("State University");
    });
  });

  describe("setDiscoveryRows", () => {
    it("stores rows and applies current filter", () => {
      const rows = [
        { clubName: "Chess", category: "Academic" },
        { clubName: "Soccer", category: "Sports" }
      ];
      store.state.currentFilter = "All";
      store.setDiscoveryRows(rows);
      expect(store.state.currentClubRows).toEqual(rows);
      expect(store.state.currentDiscoveryData).toEqual(rows);
    });

    it("filters rows when a specific filter is set", () => {
      const rows = [
        { clubName: "Chess", category: "Academic" },
        { clubName: "Soccer", category: "Sports" },
        { clubName: "Art Club", category: "Arts" }
      ];
      store.state.currentFilter = "Sports";
      store.setDiscoveryRows(rows);
      expect(store.state.currentDiscoveryData).toEqual([{ clubName: "Soccer", category: "Sports" }]);
    });
  });

  describe("setFilter", () => {
    it("updates filter and re-filters discovery data", () => {
      const rows = [
        { clubName: "Chess", category: "Academic" },
        { clubName: "Soccer", category: "Sports" }
      ];
      store.setDiscoveryRows(rows);
      store.setFilter("Academic");
      expect(store.state.currentFilter).toBe("Academic");
      expect(store.state.currentDiscoveryData).toEqual([{ clubName: "Chess", category: "Academic" }]);
    });
  });

  describe("setAuth", () => {
    it("sets auth session, club, and status", () => {
      const session = { user: { id: "u1" } };
      const club = { id: "c1", status: "approved" };
      store.setAuth(session, club);
      expect(store.state.authSession).toBe(session);
      expect(store.state.activeClub).toBe(club);
      expect(store.state.dashboardStatus).toBe("approved");
    });

    it("handles null values", () => {
      store.setAuth(null, null);
      expect(store.state.authSession).toBeNull();
      expect(store.state.activeClub).toBeNull();
      expect(store.state.dashboardStatus).toBe("");
    });
  });

  describe("clearAuth", () => {
    it("clears all auth-related state", () => {
      store.setAuth({ user: "u1" }, { id: "c1", status: "approved" });
      store.setDashboardEvents([{ id: "e1" }]);
      store.setDashboardCalendars([{ id: "cal1" }]);

      store.clearAuth();
      expect(store.state.authSession).toBeNull();
      expect(store.state.activeClub).toBeNull();
      expect(store.state.dashboardEvents).toEqual([]);
      expect(store.state.dashboardCalendars).toEqual([]);
      expect(store.state.dashboardStatus).toBe("");
    });
  });

  describe("setDashboardEvents", () => {
    it("stores dashboard events", () => {
      const events = [{ id: "e1", title: "Event 1" }];
      store.setDashboardEvents(events);
      expect(store.state.dashboardEvents).toEqual(events);
    });
  });

  describe("setDashboardCalendars", () => {
    it("stores dashboard calendars", () => {
      const calendars = [{ id: "cal1", name: "E-Board" }];
      store.setDashboardCalendars(calendars);
      expect(store.state.dashboardCalendars).toEqual(calendars);
    });
  });

  describe("editingEventId", () => {
    it("setEditingEvent updates editingEventId", () => {
      store.setEditingEvent("evt-1");
      expect(store.state.editingEventId).toBe("evt-1");
    });

    it("clearEditingEvent resets editingEventId to null", () => {
      store.setEditingEvent("evt-1");
      store.clearEditingEvent();
      expect(store.state.editingEventId).toBeNull();
    });
  });
});
