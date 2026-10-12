// -----------------------------------------------------------------------------
// Minimal in-memory stand-in for the Gladys SDK object, for unit tests.
//
// It reproduces the surface the integration relies on and records every call
// so the tests can assert them:
//   - externalIds(type, platformId) -> { device, feature(key) }
//   - devices                        -> the devices the user created
//   - publishDiscoveredDevices / publishStates / publishTransports
//   - setConnectionStatus / publishSceneEvent / requestWidgetRefresh
// No running Gladys server, no WebSocket.
// -----------------------------------------------------------------------------

export function createFakeGladys() {
  const discovered = [];
  const published = [];
  const transports = [];
  const connectionStatuses = [];
  const sceneEvents = [];
  const widgetRefreshes = [];

  return {
    devices: [],
    discovered,
    published,
    transports,
    connectionStatuses,
    sceneEvents,
    widgetRefreshes,

    externalIds(type, platformId) {
      const device = `ext:test:${type}:${platformId}`;
      return {
        device,
        feature: (key) => `${device}:${key}`,
      };
    },

    /** Pretend the user created every discovered device. */
    createAll() {
      this.devices = (discovered.at(-1) ?? []).map((device) => ({ ...device }));
    },

    async publishDiscoveredDevices(devices) {
      discovered.push(devices);
    },

    async publishStates(states) {
      for (const s of states) {
        published.push({
          featureExternalId: s.device_feature_external_id,
          state: s.state ?? s.text,
        });
      }
    },

    async publishTransports(entries) {
      transports.push(...entries);
    },

    async setConnectionStatus(connected, message) {
      connectionStatuses.push({ connected, message });
    },

    async publishSceneEvent(key, data = {}) {
      sceneEvents.push({ key, data });
      return { success: true };
    },

    // Fire-and-forget in the SDK too: synchronous, resolves nothing.
    requestWidgetRefresh(key) {
      widgetRefreshes.push(key);
    },
  };
}
