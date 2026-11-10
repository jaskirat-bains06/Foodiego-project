import React,{createContext,useContext,useEffect,useMemo,useState} from 'react';
import {api} from './api';
const Store=createContext(null);export const useStore=()=>useContext(Store);
export function StoreProvider({children}){
  const [user,setUser]=useState(()=>{try{return JSON.parse(localStorage.getItem('foodiego_user'))}catch{return null}});
  const [cart,setCart]=useState(()=>{try{const saved=JSON.parse(localStorage.getItem('foodiego_cart'))||[];return Array.isArray(saved)?saved.filter(item=>item&&item._id).map(item=>({...item,quantity:Math.max(1,Math.min(50,Math.trunc(Number(item.quantity)||1)))})):[]}catch{return []}});
  const [city,setCityState]=useState(()=>{try{const location=JSON.parse(localStorage.getItem('foodiego_delivery_location')||'null');return location?.city||''}catch{return''}});
  const [area,setAreaState]=useState(()=>{try{const location=JSON.parse(localStorage.getItem('foodiego_delivery_location')||'null');return location?.area||'All areas'}catch{return'All areas'}});
  const [deliveryLocation,setDeliveryLocationState]=useState(()=>{try{return JSON.parse(localStorage.getItem('foodiego_delivery_location')||'null')}catch{return null}});
  const [theme,setThemeState]=useState(()=>{try{const saved=localStorage.getItem('foodiego_theme');if(saved==='dark'||saved==='light')return saved}catch{}return window.matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'light'});
  const [favorites,setFavorites]=useState(()=>{try{return JSON.parse(localStorage.getItem('foodiego_favorites'))||[]}catch{return []}});
  const [toast,setToast]=useState('');
  useEffect(()=>{localStorage.setItem('foodiego_cart',JSON.stringify(cart))},[cart]);
  useEffect(()=>{if(city)localStorage.setItem('foodiego_city',city);else localStorage.removeItem('foodiego_city')},[city]);
  useEffect(()=>{localStorage.setItem('foodiego_area',area)},[area]);
  useEffect(()=>{try{if(deliveryLocation)localStorage.setItem('foodiego_delivery_location',JSON.stringify(deliveryLocation));else localStorage.removeItem('foodiego_delivery_location')}catch{}},[deliveryLocation]);
  useEffect(()=>{document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=theme==='dark'?'#0B1020':'#F6F9FD';try{localStorage.setItem('foodiego_theme',theme)}catch{}},[theme]);
  useEffect(()=>{localStorage.setItem('foodiego_favorites',JSON.stringify(favorites))},[favorites]);
  useEffect(()=>{if(toast){const id=setTimeout(()=>setToast(''),2600);return()=>clearTimeout(id)}},[toast]);
  const notify=msg=>setToast(msg);
  const setCity=next=>{if(next!==city){setCityState(next);setAreaState('All areas');if(cart.length){setCart([]);notify('Your bag was cleared for the new delivery city.')}}};
  const setArea=next=>setAreaState(next);
  const setDeliveryLocation=next=>setDeliveryLocationState(next);
  const setTheme=next=>setThemeState(next);
  const toggleFavorite=id=>setFavorites(old=>old.includes(id)?old.filter(item=>item!==id):[...old,id]);
  const add=(food,quantity=1)=>{quantity=Math.max(1,Math.min(50,Math.trunc(Number(quantity)||1)));const idOf=r=>typeof r==='object'?r?._id:r;const incoming=idOf(food.restaurantId),current=idOf(cart[0]?.restaurantId);if(cart.length&&incoming&&current&&incoming!==current){setCart([{...food,quantity}]);notify(`Bag switched to ${food.restaurantId?.name||'this restaurant'}`);return}const existing=cart.find(item=>item._id===food._id);if(existing&&existing.quantity>=50){notify('You can add up to 50 of one item.');return}setCart(old=>{const ix=old.findIndex(x=>x._id===food._id);if(ix>=0)return old.map((x,i)=>i===ix?{...x,quantity:Math.min(50,x.quantity+quantity)}:x);return [...old,{...food,quantity}]});notify(`${food.name} added to your bag`)};
  const change=(id,delta)=>setCart(old=>old.map(x=>x._id===id?{...x,quantity:Math.max(0,Math.min(50,x.quantity+delta))}:x).filter(x=>x.quantity>0));
  const remove=id=>setCart(old=>old.filter(x=>x._id!==id));
  const logout=()=>{localStorage.removeItem('foodiego_token');localStorage.removeItem('foodiego_user');setUser(null);notify('You are signed out')};
  const value=useMemo(()=>({user,setUser,cart,setCart,city,setCity,area,setArea,deliveryLocation,setDeliveryLocation,theme,setTheme,favorites,toggleFavorite,add,change,remove,logout,notify,cartCount:cart.reduce((n,x)=>n+x.quantity,0),toast}),[user,cart,city,area,deliveryLocation,theme,favorites,toast]);
  return <Store.Provider value={value}>{children}{toast&&<div className="toast">✓ &nbsp;{toast}</div>}</Store.Provider>
}
export async function saveSession(data,setUser){localStorage.setItem('foodiego_token',data.token);localStorage.setItem('foodiego_user',JSON.stringify(data.user));setUser(data.user)}
