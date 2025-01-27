import axios from "axios";

const API_URL = import.meta.env.VITE_BASE_URL;


// const LIVE_URL = import.meta.env.VITE_LIVE_URL;

const axios_Api = axios.create({
  baseURL: API_URL,
  timeout: 100000,
  headers: {
    Accept: "application/json",
  },
});


console.log(API_URL);

axios_Api.interceptors.request.use((config) => {
  const Token = localStorage.getItem("token");
  if (Token) {
    config.headers.Authorization = `Bearer ${Token}`;
  }
  return config;
});

axios_Api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export async function get(url, data, config = {}) {
  return await axios_Api
    .get(url, data, { ...config })
    .then((response) => response.data);
}

export async function post(url, data, config = {}) {
  return axios_Api
    .post(url, data, { ...config })
    .then((response) => response.data);
}

export async function put(url, data, config = {}) {
  return axios_Api
    .put(url, { ...data }, { ...config })
    .then((response) => response.data);
}

export async function patch(url, data, config = {}) {
  return axios_Api
    .patch(url, { ...data }, { ...config })
    .then((response) => response.data);
}

export async function del(url, config = {}) {
  return await axios_Api
    .delete(url, { ...config })
    .then((response) => response.data);
}
