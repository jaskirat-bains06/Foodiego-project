import axios from 'axios';
export const api=axios.create({baseURL:import.meta.env.VITE_API_URL||'/api'});
api.interceptors.request.use(config=>{const token=localStorage.getItem('foodiego_token');if(token)config.headers.Authorization=`Bearer ${token}`;return config});
export const errorText=e=>e.response?.data?.message||'Something went wrong. Please try again.';
