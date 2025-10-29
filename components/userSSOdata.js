"use client";
import { useEffect, useState, useCallback } from "react";

/**
 * userSSOdata
 * Client-side helper that checks for an SSO sessionKey in localStorage,
 * attempts to fetch user details from the SSO endpoint, and exposes
 * { userdata, loading, error, refresh } so callers can react accordingly.
 *
 * Error handling covers:
 * - missing sessionKey (not logged in)
 * - network / fetch failures
 * - API-returned errors (invalid credentials / session expired)
 */
const userSSOdata = () => {
  const [userdata, setUserdata] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchUserData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const storedUser = localStorage.getItem("user");
      const sessionKey = localStorage.getItem("sessionKey");

      // If there's already a cached user, set it immediately (optimistic)
      if (storedUser) {
        try {
          setUserdata(JSON.parse(storedUser));
        } catch (e) {
          // ignore parse errors
          setUserdata(null);
        }
      }

      if (!sessionKey) {
        // No SSO session key: user is not logged in via SSO
        setUserdata(null);
        setError({
          code: "NO_SESSION",
          message: "No SSO session found. Please sign in.",
        });
        setLoading(false);
        return null;
      }

      const resp = await fetch(
        "https://sso.tech-iitb.org/project/getuserdata",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: sessionKey }),
        }
      );

      if (!resp.ok) {
        // HTTP error (e.g., 401/403/500)
        const msg = `SSO server responded with status ${resp.status}`;
        setError({ code: "SSO_HTTP_ERROR", message: msg });
        setUserdata(null);
        setLoading(false);
        return null;
      }

      const data = await resp.json();

      // Defensive checks for API-level errors
      if (!data) {
        setError({
          code: "INVALID_RESPONSE",
          message: "Empty response from SSO server.",
        });
        setUserdata(null);
        setLoading(false);
        return null;
      }

      // If backend includes an explicit error field
      if (data.error || data.status === "error" || data.message === "invalid") {
        // Map common server messages to user-friendly messages
        const serverMsg =
          data.error || data.message || "SSO authentication failed.";
        const lower = String(serverMsg).toLowerCase();
        let friendly = "SSO authentication failed. Please sign in again.";

        if (lower.includes("invalid") || lower.includes("credential")) {
          friendly = "Invalid SSO credentials. Please sign in again.";
        } else if (lower.includes("expire") || lower.includes("session")) {
          friendly = "Your SSO session has expired. Please sign in again.";
        }

        setError({
          code: "SSO_API_ERROR",
          message: friendly,
          detail: serverMsg,
        });
        setUserdata(null);
        // Clear invalid sessionKey so subsequent attempts start clean
        try {
          localStorage.removeItem("sessionKey");
        } catch (e) {}
        setLoading(false);
        return null;
      }

      // Success: store and return the user data
      setUserdata(data);
      try {
        localStorage.setItem("user", JSON.stringify(data));
      } catch (e) {
        // ignore storage errors
      }

      setError(null);
      setLoading(false);
      return data;
    } catch (err) {
      // Network or unexpected error
      const message =
        err?.message || "Network error while contacting SSO server.";
      setError({
        code: "NETWORK_ERROR",
        message: "Network error. Please check your connection and try again.",
        detail: message,
      });
      setUserdata(null);
      setLoading(false);
      return null;
    }
  }, []);

  useEffect(() => {
    // Run on mount
    fetchUserData();
  }, [fetchUserData]);

  // Return a small API: callers can read userdata, loading, error and call refresh()
  return { userdata, loading, error, refresh: fetchUserData };
};

export default userSSOdata;
