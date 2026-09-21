// REST API Client helper wrapper with Bearer token authentication injection

// Credential endpoints answer 401 for a wrong password, which is not a lapsed session.
const CREDENTIAL_ENDPOINTS = ['/api/v1/auth/login', '/api/v1/auth/2fa-email-confirm', '/api/v1/auth/2fa-verify', '/api/v1/auth/setup'];

export const api = {
  /**
   * A 401 on any other endpoint means the session ended (expired, signed out elsewhere, or the
   * password changed), so drop the stale token and return to the sign-in screen.
   */
  endSessionIfRejected(res, url) {
    if (res.status !== 401 || !localStorage.getItem('homelab_token')) return;
    if (CREDENTIAL_ENDPOINTS.some((p) => url.startsWith(p))) return;
    localStorage.removeItem('homelab_token');
    window.location.reload();
  },

  /**
   * Requests a single-use ticket for opening a WebSocket. Tickets travel in the socket URL in place
   * of the session token, so a logged URL never contains a credential that outlives the connection.
   */
  async wsTicket() {
    const res = await this.post('/api/v1/auth/ws-ticket', {});
    if (!res || !res.ticket) throw new Error('WebSocket ticket unavailable');
    return res.ticket;
  },

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
      this.endSessionIfRejected(res, url);
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
      this.endSessionIfRejected(res, url);
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
      this.endSessionIfRejected(res, url);
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
      this.endSessionIfRejected(res, url);
      const err = await this.handleResponse(res).catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `DELETE request failed: ${res.status}`);
    }
    return this.handleResponse(res);
  }
};

export default api;
