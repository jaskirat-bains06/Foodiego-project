import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import App from'./App';import{StoreProvider}from'./store';import'./styles.css';import'./location.css';
createRoot(document.getElementById('root')).render(<React.StrictMode><BrowserRouter><StoreProvider><App/></StoreProvider></BrowserRouter></React.StrictMode>);
