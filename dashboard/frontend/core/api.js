// REST API Client helper wrapper

export const api = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `GET request failed: ${res.status}`);
    }
    return res.json();
  },

  async post(url, data = {}) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `POST request failed: ${res.status}`);
    }
    return res.json();
  },

  async put(url, data = {}) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `PUT request failed: ${res.status}`);
    }
    return res.json();
  },

  async delete(url) {
    const res = await fetch(url, {
      method: 'DELETE'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `DELETE request failed: ${res.status}`);
    }
    return res.json();
  }
};

export default api;
