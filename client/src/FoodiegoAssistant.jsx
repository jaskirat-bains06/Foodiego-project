import React,{useEffect,useRef,useState}from'react';
import{Bot,ChevronDown,LoaderCircle,Plus,Send,Sparkles,X}from'lucide-react';
import{api,errorText}from'./api';
import{useStore}from'./store';
import'./assistant.css';

const suggestions=['Something under ₹150','High-protein ideas','Vegetarian food','What should I eat today?'];
const fallbackImage='https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=320&q=75';
const price=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(Number(value)||0);

export default function FoodiegoAssistant(){
 const{city,area,add}=useStore();
 const[open,setOpen]=useState(false),[text,setText]=useState(''),[busy,setBusy]=useState(false),[messages,setMessages]=useState([]),[error,setError]=useState('');
 const input=useRef(null),scroll=useRef(null);
 useEffect(()=>{if(open)input.current?.focus()},[open]);
 useEffect(()=>{scroll.current?.scrollTo({top:scroll.current.scrollHeight,behavior:'smooth'})},[messages,busy]);
 useEffect(()=>{if(!open)return;const key=event=>{if(event.key==='Escape')setOpen(false)};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key)},[open]);
 async function ask(question){const query=String(question||'').trim();if(!query||busy)return;setError('');setText('');setMessages(previous=>[...previous,{role:'user',content:query}]);setBusy(true);try{const{data}=await api.post('/assistant/recommendations',{message:query,city,area});setMessages(previous=>[...previous,{role:'assistant',content:data.reply||'Here are a few dishes from the current menu.',foods:Array.isArray(data.foods)?data.foods:[],source:data.source||'rules'}])}catch(requestError){setError(errorText(requestError));setMessages(previous=>[...previous,{role:'assistant',content:'I couldn’t reach the menu right now. Please try again in a moment.',foods:[]}])}finally{setBusy(false)}}
 function submit(event){event.preventDefault();ask(text)}
 return <>
  {open&&<section className="foodAiPanel" id="foodiego-assistant" role="dialog" aria-modal="false" aria-label="Foodiego food assistant">
   <header className="foodAiHeader"><span className="foodAiAvatar"><Sparkles size={18}/></span><span><b>Foodiego AI</b><small>Dish ideas from the live menu{city?` · ${city}`:''}</small></span><button type="button" className="foodAiClose" aria-label="Close assistant" onClick={()=>setOpen(false)}><X size={18}/></button></header>
   <div className="foodAiMessages" ref={scroll} aria-live="polite">
    {!messages.length&&<div className="foodAiWelcome"><span className="foodAiWelcomeIcon"><Bot size={23}/></span><b>What sounds good?</b><p>Tell me your budget or what you’re in the mood for. I’ll find dishes that are actually on the menu.</p><div className="foodAiSuggestions">{suggestions.map(item=><button type="button" key={item} disabled={busy} onClick={()=>ask(item)}>{item}</button>)}</div></div>}
    {messages.map((message,index)=><div className={`foodAiMessage ${message.role}`} key={`${message.role}-${index}`}><p>{message.content}</p>{message.foods?.length>0&&<div className="foodAiFoodList">{message.foods.map(food=><article className="foodAiFood" key={food._id}><img src={food.image||fallbackImage} alt="" onError={event=>{event.currentTarget.onerror=null;event.currentTarget.src=fallbackImage}}/><span className="foodAiFoodInfo"><b>{food.name}</b><small>{food.restaurantId?.name||'Foodiego restaurant'}{food.category?.name?` · ${food.category.name}`:''}</small><strong>{price(food.price)}</strong></span><button type="button" className="foodAiAdd" aria-label={`Add ${food.name} to bag`} disabled={food.available===false} onClick={()=>add(food)}><Plus size={17}/></button></article>)}</div>}</div>)}
    {busy&&<div className="foodAiTyping" role="status"><i/><i/><i/><span>Looking through the menu…</span></div>}
   </div>
   {error&&<p className="foodAiError" role="alert">{error}</p>}
   <form className="foodAiComposer" onSubmit={submit}><input ref={input} value={text} onChange={event=>setText(event.target.value)} disabled={busy} placeholder="Ask for a dish idea…" aria-label="Ask Foodiego AI for food recommendations" maxLength={300}/><button type="submit" disabled={busy||!text.trim()} aria-label="Send message">{busy?<LoaderCircle size={17} className="foodAiSpin"/>:<Send size={17}/>}</button></form>
   <small className="foodAiFootnote">Recommendations use available menu items and your selected city{area&&area!=='All areas'?` · ${area}`:''}.</small>
  </section>}
  <button type="button" className={`foodAiLauncher${open?' active':''}`} aria-expanded={open} aria-controls="foodiego-assistant" aria-label={open?'Minimize Foodiego AI':'Ask Foodiego AI for food ideas'} title="Ask Foodiego AI" onClick={()=>setOpen(value=>!value)}>{open?<ChevronDown size={21}/>:<><Sparkles size={17}/><span>Foodiego AI</span></>}</button>
 </>
}
