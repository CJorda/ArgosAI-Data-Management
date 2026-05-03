import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL || "http://localhost:3001/api";

export const apiClient = axios.create({
  baseURL,
  timeout: 15000
});

export function authConfig(token) {
  return {
    headers: {
      Authorization: `Bearer ${token}`
    }
  };
}
