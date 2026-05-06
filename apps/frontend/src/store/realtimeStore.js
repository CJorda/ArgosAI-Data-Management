import { create } from "zustand";

export const useRealtimeStore = create((set) => ({
  latestBySensor: {},
  openAlerts: [],
  pushReading: (reading) =>
    set((state) => ({
      latestBySensor: {
        ...state.latestBySensor,
        [reading.sensor_id]: reading
      }
    })),
  setOpenAlerts: (alerts) => set({ openAlerts: alerts }),
  addAlert: (alert) =>
    set((state) => ({
      openAlerts: [alert, ...state.openAlerts.filter((item) => item.id !== alert.id)]
    })),
  updateAlert: (alert) =>
    set((state) => {
      if (alert.status !== "open") {
        return {
          openAlerts: state.openAlerts.filter((item) => item.id !== alert.id)
        };
      }

      return {
        openAlerts: [alert, ...state.openAlerts.filter((item) => item.id !== alert.id)]
      };
    }),
  resolveAlert: (alertId) =>
    set((state) => ({
      openAlerts: state.openAlerts.filter((item) => item.id !== alertId)
    }))
}));
