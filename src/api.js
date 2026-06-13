async function request(path, options = {}) {
  const response = await fetch(path, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(data?.error || `Erro HTTP ${response.status}`);
  }

  return data;
}

export const api = {
  getRequests() {
    return request("/api/requests");
  },

  saveRequests(requests) {
    return request("/api/requests", {
      method: "PUT",
      body: { requests }
    });
  },

  getSettings() {
    return request("/api/settings");
  },

  saveSettings(settings) {
    return request("/api/settings", {
      method: "PUT",
      body: { settings }
    });
  },

  migrate({ requests, settings }) {
    return request("/api/migrate", {
      method: "POST",
      body: { requests, settings }
    });
  },

  resetData() {
    return request("/api/data", {
      method: "DELETE"
    });
  }
};
