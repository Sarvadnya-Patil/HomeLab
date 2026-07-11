// REST API Client helper wrapper with Bearer token authentication injection

export const api = {
  getHeaders() {
    const token = localStorage.getItem('homelab_token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  },

  async handleResponse(res) {
    try {
      const renewedToken = res.headers.get('X-Renewed-Token');
      if (renewedToken) {
        localStorage.setItem('homelab_token', renewedToken);
      }
    } catch (e) {
      // ignore header reading issues
    }

    const text = await res.text();
    try {
      const parsed = text ? JSON.parse(text) : {};
      if (parsed && typeof parsed === 'object') {
        if (parsed.success === false && parsed.error) {
          return { error: parsed.error.message || parsed.error };
        }
        if (parsed.success === true && 'data' in parsed) {
          return parsed.data;
        }
      }
      return parsed;
    } catch {
      return { error: text || res.statusText };
    }
  },

  async get(url) {
    const res = await fetch(url, {
      headers: this.getHeaders()
    });
    if (!res.ok) {
      const err = await this.handleResponse(res).catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `GET request failed: ${res.status}`);
    }
    return this.handleResponse(res);
  },

  async post(url, data = {}) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.getHeaders()
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await this.handleResponse(res).catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `POST request failed: ${res.status}`);
    }
    return this.handleResponse(res);
  },

  async put(url, data = {}) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...this.getHeaders()
      },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await this.handleResponse(res).catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `PUT request failed: ${res.status}`);
    }
    return this.handleResponse(res);
  },

  async delete(url) {
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders()
    });
    if (!res.ok) {
      const err = await this.handleResponse(res).catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `DELETE request failed: ${res.status}`);
    }
    return this.handleResponse(res);
  }
};

export default api;
