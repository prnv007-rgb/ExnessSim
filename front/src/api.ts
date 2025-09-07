import axios from "axios";

const api = axios.create({ baseURL: "http://localhost:3000", timeout: 10000 });

// automatically attach token from localStorage
api.interceptors.request.use((cfg) => {
  try {
    const token = typeof localStorage !== "undefined" ? localStorage.getItem("token") : null;
    if (token && cfg.headers) cfg.headers.token = token;
  } catch (e) {
console.log(e)
  }
  return cfg;
});

export default api;