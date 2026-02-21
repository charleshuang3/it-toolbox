import { createApp } from 'vue';
import './style.css';
import App from './App.vue';
import router from './router';

const title = import.meta.env.VITE_APP_TITLE;
const app = createApp(App, { title: title });
app.use(router);
app.mount('#app');
