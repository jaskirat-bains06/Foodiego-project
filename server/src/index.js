import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import {randomBytes} from 'node:crypto';
import {User,Restaurant,Food,Category,Order,GroupOrder} from './models.js';
import {protect,adminOnly} from './middleware.js';
import {buildOrderDetails} from './order-pricing.js';
import {ORDER_STATUSES,statusChangeEvents} from './order-status.js';
const app=express();const configuredOrigins=(process.env.CLIENT_URL||'http://localhost:5173').split(',').map(x=>x.trim()).filter(Boolean);const vercelOrigins=[process.env.VERCEL_URL,process.env.VERCEL_PROJECT_PRODUCTION_URL].filter(Boolean).map(host=>/^https?:\/\//.test(host)?host:`https://${host}`);const allowedOrigins=new Set([...configuredOrigins,...vercelOrigins]);app.use(cors({origin:(origin,done)=>{const localDev=process.env.NODE_ENV!=='production'&&origin&&/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);done(null,!origin||allowedOrigins.has(origin)||localDev)}}));app.use(express.json({limit:'1mb'}));
let mongoConnectionPromise;
async function connectDatabase(){
  const uri=process.env.MONGO_URI;if(!uri)throw new Error('MONGO_URI is not configured.');
  if(mongoose.connection.readyState===1)return mongoose.connection;
  if(!mongoConnectionPromise){mongoConnectionPromise=mongoose.connect(uri,{maxPoolSize:5,serverSelectionTimeoutMS:7000}).catch(error=>{mongoConnectionPromise=null;throw error})}
  return mongoConnectionPromise;
}
mongoose.connection.on('disconnected',()=>{mongoConnectionPromise=null});
app.use((req,res,next)=>{connectDatabase().then(()=>next()).catch(error=>{console.error('MongoDB connection failed:',error.message);res.status(503).json({message:'Database is unavailable. Check the production MongoDB connection settings.'})})});
const wrap=(fn)=>async(req,res)=>{try{await fn(req,res)}catch(e){const status=e.status||(e.name==='ValidationError'||e.name==='CastError'?400:e.code===11000?409:500);res.status(status).json({message:e.code===11000?'That email or name is already in use.':status===500?'Server error.':e.message||'Request failed.'})}};
const jwtSecret=process.env.JWT_SECRET;
if(!jwtSecret||jwtSecret.length<32||jwtSecret==='replace-with-a-long-random-secret'){
  console.error('JWT_SECRET is missing or too short. Configure server/.env with a unique secret of at least 32 characters.');
  process.exit(1);
}
const tokenFor=u=>jwt.sign({id:u._id},jwtSecret,{expiresIn:process.env.JWT_EXPIRES_IN||'7d'});
const escapeRegex=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const safeUser=u=>({_id:u._id,name:u.name,email:u.email,phone:u.phone,address:u.address,role:u.role,createdAt:u.createdAt});
const geocoderBase=(process.env.GEOCODER_URL||'https://nominatim.openstreetmap.org').replace(/\/$/,'');
let lastGeocoderRequest=0;
let geocoderQueue=Promise.resolve();
function paceGeocoder(){
  const request=geocoderQueue.then(async()=>{const delay=Math.max(0,1100-(Date.now()-lastGeocoderRequest));if(delay)await new Promise(resolve=>setTimeout(resolve,delay));lastGeocoderRequest=Date.now()});
  geocoderQueue=request.catch(()=>{});
  return request;
}
async function fetchGeocoder(url){
  await paceGeocoder();
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),10000);
  try{return await fetch(url,{signal:controller.signal,headers:{'User-Agent':process.env.GEOCODER_USER_AGENT||'Foodiego/1.0 (local food delivery demo)','Accept-Language':'en-IN,en'}})}
  finally{clearTimeout(timeout)}
}
function locationFromGeocoder(item){
  const address=item.address||{};
  const city=address.city||address.town||address.municipality||address.village||address.county||address.state_district||address.district||'';
  const area=address.suburb||address.neighbourhood||address.residential||address.quarter||address.city_district||address.hamlet||'';
  return{id:String(item.place_id||''),label:item.display_name||'',address:item.display_name||'',city,area,district:address.state_district||address.district||address.county||'',house:address.house_number||address.building||'',street:address.road||address.pedestrian||address.footway||'',landmark:address.amenity||address.shop||'',postalCode:address.postcode||'',latitude:Number(item.lat),longitude:Number(item.lon)};
}
app.get('/api/locations/reverse',async(req,res)=>{
  const latitude=Number(req.query.lat),longitude=Number(req.query.lon);
  if(!Number.isFinite(latitude)||latitude < -90||latitude > 90||!Number.isFinite(longitude)||longitude < -180||longitude > 180)return res.status(400).json({message:'Valid map coordinates are required.'});
  try{
    const response=await fetchGeocoder(`${geocoderBase}/reverse?format=jsonv2&addressdetails=1&lat=${latitude}&lon=${longitude}`);
    if(!response.ok)return res.status(502).json({message:'Location lookup is temporarily unavailable.'});
    const item=await response.json();
    res.json(locationFromGeocoder(item));
  }catch(error){res.status(502).json({message:error.name==='AbortError'?'Location lookup timed out. Please try again.':'Location lookup is temporarily unavailable.'})}
});
app.get('/api/locations/search',async(req,res)=>{
  const query=String(req.query.q||'').trim();
  if(query.length<3||query.length>120)return res.status(400).json({message:'Enter between 3 and 120 characters to search for a location.'});
  try{
    const response=await fetchGeocoder(`${geocoderBase}/search?format=jsonv2&addressdetails=1&limit=8&countrycodes=in&q=${encodeURIComponent(query)}`);
    if(!response.ok)return res.status(502).json({message:'Address search is temporarily unavailable. Please try again.'});
    const items=await response.json();
    res.json(Array.isArray(items)?items.map(locationFromGeocoder):[]);
  }catch(error){res.status(502).json({message:error.name==='AbortError'?'Address search took too long. Please try again.':'Address search is temporarily unavailable. Please try again.'})}
});app.get('/api/health',(req,res)=>{const connected=mongoose.connection.readyState===1;res.status(connected?200:503).json({ok:connected,database:connected?'connected':'disconnected'})});
app.post('/api/auth/register',wrap(async(req,res)=>{const {name,email,password}=req.body;if(!name?.trim()||!email||!/^\S+@\S+\.\S+$/.test(email)||!password||password.length<8)return res.status(400).json({message:'Enter a name, valid email, and password with at least 8 characters.'});const u=await User.create({name,email,password:await bcrypt.hash(password,12)});res.status(201).json({token:tokenFor(u),user:safeUser(u)});}));
app.post('/api/auth/login',wrap(async(req,res)=>{const u=await User.findOne({email:req.body.email?.toLowerCase()}).select('+password');if(!u||!await bcrypt.compare(req.body.password||'',u.password))return res.status(401).json({message:'Email or password is incorrect.'});res.json({token:tokenFor(u),user:safeUser(u)});}));
app.get('/api/auth/profile',protect,(req,res)=>res.json({user:safeUser(req.user)}));function addressPayload(body={}){
  const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
  const latitude=body.latitude==null||body.latitude===''?undefined:Number(body.latitude),longitude=body.longitude==null||body.longitude===''?undefined:Number(body.longitude);
  if(!text(body.address,500)||!text(body.city,100)||((latitude===undefined)!==(longitude===undefined))||(latitude!==undefined&&(!Number.isFinite(latitude)||latitude < -90||latitude > 90||!Number.isFinite(longitude)||longitude < -180||longitude > 180)))return null;
  return{label:['Home','Work','Other'].includes(body.label)?body.label:'Other',recipient:text(body.recipient,80),phone:text(body.phone,30),house:text(body.house,150),street:text(body.street,200),landmark:text(body.landmark,150),address:text(body.address,500),city:text(body.city,100),area:text(body.area,100),postalCode:text(body.postalCode,20),latitude,longitude};
}
app.get('/api/addresses',protect,wrap(async(req,res)=>res.json(req.user.savedAddresses||[])));
app.post('/api/addresses',protect,wrap(async(req,res)=>{const address=addressPayload(req.body||{});if(!address)return res.status(400).json({message:'Enter a valid address and city; coordinates must be a valid pair.'});req.user.savedAddresses.push(address);await req.user.save();res.status(201).json(req.user.savedAddresses.at(-1))}));
app.put('/api/addresses/:id',protect,wrap(async(req,res)=>{const entry=req.user.savedAddresses.id(req.params.id);if(!entry)return res.status(404).json({message:'Saved address not found.'});const address=addressPayload(req.body||{});if(!address)return res.status(400).json({message:'Enter a valid address and city; coordinates must be a valid pair.'});Object.assign(entry,address);await req.user.save();res.json(entry)}));
app.delete('/api/addresses/:id',protect,wrap(async(req,res)=>{const entry=req.user.savedAddresses.id(req.params.id);if(!entry)return res.status(404).json({message:'Saved address not found.'});entry.deleteOne();await req.user.save();res.json({message:'Address removed.'})}));
function assistantRules(message,foods){
  const budgetMatch=message.match(/(?:under|below|less than|at most|maximum|max|within|budget(?: of)?)\s*(?:₹|rs\.?\s*)?(\d{2,5})/i)||message.match(/[₹]\s*(\d{2,5})/i);
  const budget=budgetMatch?Number(budgetMatch[1]):null;
  const vegetarian=/\b(vegetarian|veg|plant[- ]based)\b/i.test(message)&&!/\b(non[- ]?veg|non[- ]?vegetarian)\b/i.test(message);
  const protein=/\b(high[- ]?protein|protein[- ]rich|more protein|protein)\b/i.test(message);
  const queryWords=message.toLowerCase().split(/[^a-z0-9]+/).filter(word=>word.length>2&&!['suggest','something','under','below','with','what','should','today','please','food','dish','meal','want','high','protein','vegetarian'].includes(word));
  const vegGood=/\b(veg(?:etarian)?|paneer|tofu|dal|lentil|chana|chickpea|rajma|bean|mushroom|aloo|potato|spinach|palak|salad|plant based)\b/i;
  const meat=/\b(chicken|mutton|lamb|beef|pork|fish|prawn|shrimp|seafood|bacon|ham|turkey|egg|omelette)\b/i;
  const proteinGood=/\b(chicken|paneer|tofu|lentil|dal|chana|chickpea|rajma|bean|egg|fish|prawn|peanut|soy)\b/i;
  const filtered=foods.filter(food=>Number.isFinite(Number(food.price))&&(!budget||Number(food.price)<=budget)&&(!vegetarian||(vegGood.test(`${food.name} ${food.description||''} ${food.category?.name||''}`)&&!meat.test(`${food.name} ${food.description||''}`)))&&(!protein||proteinGood.test(`${food.name} ${food.description||''} ${food.category?.name||''}`)));
  const score=food=>{const text=`${food.name} ${food.description||''} ${food.category?.name||''} ${food.restaurantId?.cuisine||''}`.toLowerCase();return queryWords.reduce((sum,word)=>sum+(text.includes(word)?3:0),0)+(vegetarian&&vegGood.test(text)?3:0)+(protein&&proteinGood.test(text)?3:0)};
  const ranked=[...filtered].sort((a,b)=>score(b)-score(a)||(budget?Number(b.price)-Number(a.price):0)||new Date(b.createdAt||0)-new Date(a.createdAt||0));
  const chosen=[];const used=new Set();for(const item of ranked){const key=`${item.restaurantId?._id||''}:${item.category?._id||''}`;if(!used.has(key)){chosen.push(item);used.add(key)}if(chosen.length===4)break}for(const item of ranked){if(chosen.length===4)break;if(!chosen.includes(item))chosen.push(item)}
  let reply;if(!foods.length)reply='I can’t find available dishes in the current menu for this location yet.';else if(!filtered.length&&budget)reply=`I couldn’t find an available dish under ₹${budget} in the current menu${vegetarian?' that is marked vegetarian':''}${protein?' with protein-rich ingredients':''}. Try a higher budget or another request.`;else if(!filtered.length&&vegetarian)reply='I couldn’t identify a vegetarian dish from the current menu details. The menu data does not have complete dietary labels yet.';else if(!filtered.length&&protein)reply='I couldn’t identify dishes with protein-rich ingredients in the current menu details. Nutrition information is not available yet.';else if(vegetarian&&protein)reply='These available dishes appear vegetarian and include protein-rich ingredients in their names or descriptions. The menu does not provide verified nutrition data.';else if(vegetarian)reply='These available dishes appear vegetarian based on their names and descriptions. The menu does not provide verified dietary labels.';else if(protein)reply='These dishes mention protein-rich ingredients. Foodiego does not have verified nutrition data for the menu.';else if(budget)reply=`Here are available dishes priced at ₹${budget} or less${queryWords.length?` that may fit “${message.trim()}”`:''}.` ;else reply='Here are a few available dishes from your current delivery area.';
  return{reply,foods:chosen};
}
async function aiPick(message,candidates){
  const apiKey=process.env.OPENAI_API_KEY;if(!apiKey||!candidates.length)return null;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),9000);
  try{
    const response=await fetch('https://api.openai.com/v1/chat/completions',{method:'POST',signal:controller.signal,headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4o-mini',temperature:.3,max_tokens:220,response_format:{type:'json_object'},messages:[{role:'system',content:'You are Foodiego food discovery assistant. Recommend only dishes from the provided JSON candidates. Never invent menu items, dietary certifications, nutrition values, delivery times, or availability. Use concise friendly language. Return JSON with keys reply (string) and foodIds (array of candidate ids). For dietary or nutrition requests, state that recommendations are based only on names/descriptions and are not verified if the dataset lacks labels.'},{role:'user',content:JSON.stringify({request:message,candidates:candidates.map(food=>({_id:String(food._id),name:food.name,description:food.description||'',category:food.category?.name||'',price:food.price,restaurant:food.restaurantId?.name||''}))})}]})});
    if(!response.ok)return null;const data=await response.json(),content=data.choices?.[0]?.message?.content;if(!content)return null;const parsed=JSON.parse(content),allowed=new Map(candidates.map(food=>[String(food._id),food])),foods=(Array.isArray(parsed.foodIds)?parsed.foodIds:[]).map(id=>allowed.get(String(id))).filter(Boolean).slice(0,4);if(!foods.length)return null;return{reply:typeof parsed.reply==='string'?parsed.reply.slice(0,450):'Here are a few dishes from the available menu.',foods};
  }catch{return null}finally{clearTimeout(timer)}
}
app.post('/api/assistant/recommendations',wrap(async(req,res)=>{
  const body=req.body&&typeof req.body==='object'?req.body:{},message=typeof body.message==='string'?body.message.trim().slice(0,300):'',city=typeof body.city==='string'?body.city.trim().slice(0,100):'',area=typeof body.area==='string'?body.area.trim().slice(0,100):'';
  if(!message)return res.status(400).json({message:'Ask for a dish, budget, or food preference.'});
  const restaurantQuery={};if(city)restaurantQuery.city={$regex:`^${escapeRegex(city)}$`,$options:'i'};if(area&&area!=='All areas')restaurantQuery.address={$regex:escapeRegex(area),$options:'i'};
  const restaurantIds=await Restaurant.find(restaurantQuery).distinct('_id');const foods=restaurantIds.length?await Food.find({available:{$ne:false},restaurantId:{$in:restaurantIds}}).populate('category restaurantId').sort('-createdAt').limit(120):[];
  const rules=assistantRules(message,foods);if(!rules.foods.length)return res.json({...rules,source:'rules'});
  const ai=await aiPick(message,rules.foods);res.json(ai?{...ai,source:'ai'}:{...rules,source:'rules'});
}));
async function loadGroup(code){return GroupOrder.findOne({inviteCode:String(code||'').trim().toUpperCase()}).populate('restaurantId','name image cuisine city').populate('members.userId','name').populate('placedOrderId','status statusHistory createdAt')}
async function groupSnapshot(group){
  const ids=[...new Set(group.members.flatMap(member=>member.items.map(line=>String(line.foodId))))];
  const docs=ids.length?await Food.find({_id:{$in:ids}}).populate('category','name').populate('restaurantId','name'):[];
  const byId=new Map(docs.map(food=>[String(food._id),food]));
  const members=group.members.map(member=>{let subtotalPaise=0;const items=member.items.map(line=>{const food=byId.get(String(line.foodId));if(!food)return{foodId:String(line.foodId),name:line.name||'Unavailable dish',image:line.image||'',price:Number(line.price||0),quantity:line.quantity,available:false};const historical=group.status==='Placed'&&Number.isFinite(Number(line.price)),price=historical?Number(line.price):Number(food.price),name=historical&&line.name?line.name:food.name,image=historical&&line.image?line.image:(food.image||'');const pricePaise=Math.round(price*100);subtotalPaise+=pricePaise*line.quantity;return{_id:String(food._id),foodId:String(food._id),name,image,description:food.description||'',price,quantity:line.quantity,available:food.available!==false,category:food.category||null,restaurantId:food.restaurantId||null}});return{member,items,subtotalPaise}});
  const subtotalPaise=members.reduce((sum,item)=>sum+item.subtotalPaise,0),deliveryFeePaise=subtotalPaise===0||subtotalPaise>=59900?0:3900;
  let allocated=0;const shares=members.map(item=>{const exact=subtotalPaise?deliveryFeePaise*item.subtotalPaise/subtotalPaise:0,base=Math.floor(exact);allocated+=base;return{base,remainder:exact-base}});let cents=deliveryFeePaise-allocated;const order=[...shares.keys()].sort((a,b)=>shares[b].remainder-shares[a].remainder);for(let i=0;i<cents;i++)if(order[i]!==undefined)shares[order[i]].base++;
  const memberViews=members.map((item,index)=>{const subtotal=group.status==='Placed'?Number(item.member.subtotal||0):item.subtotalPaise/100,deliveryFeeShare=group.status==='Placed'?Number(item.member.deliveryFeeShare||0):shares[index].base/100,totalShare=group.status==='Placed'?Number(item.member.totalShare||0):Math.round((subtotal+deliveryFeeShare)*100)/100;return{userId:String(item.member.userId?._id||item.member.userId),name:item.member.name,joinedAt:item.member.joinedAt,items:item.items,subtotal,deliveryFeeShare,totalShare}});
  const placedOrder=group.placedOrderId&&typeof group.placedOrderId==='object'?{_id:String(group.placedOrderId._id),status:group.placedOrderId.status,statusHistory:group.placedOrderId.statusHistory||[],createdAt:group.placedOrderId.createdAt}:null;
  const finalSubtotal=group.status==='Placed'?Number(group.subtotal||0):subtotalPaise/100,finalFee=group.status==='Placed'?Number(group.deliveryFee||0):deliveryFeePaise/100,finalTotal=group.status==='Placed'?Number(group.totalAmount||0):(subtotalPaise+deliveryFeePaise)/100;
  const groupView={_id:String(group._id),inviteCode:group.inviteCode,status:group.status,organizerId:String(group.organizerId),restaurant:group.restaurantId,city:group.city,deliveryAddress:group.deliveryAddress,phone:group.phone,members:memberViews,memberCount:memberViews.length,subtotal:finalSubtotal,deliveryFee:finalFee,totalAmount:finalTotal,placedOrder,createdAt:group.createdAt,placedAt:group.placedAt};
  return{group:groupView,isMember:true};
}
app.post('/api/groups',protect,wrap(async(req,res)=>{
  const body=req.body||{},restaurantId=String(body.restaurantId||''),city=typeof body.city==='string'?body.city.trim():'',deliveryAddress=typeof body.deliveryAddress==='string'?body.deliveryAddress.trim():'',phone=typeof body.phone==='string'?body.phone.trim():'';
  if(!mongoose.isValidObjectId(restaurantId)||!city||!deliveryAddress||deliveryAddress.length>500||!phone||!/^[+]?[0-9][0-9()\s-]{6,19}$/.test(phone))return res.status(400).json({message:'Choose a restaurant, city, delivery address, and valid phone number.'});
  const restaurant=await Restaurant.findById(restaurantId);if(!restaurant)return res.status(404).json({message:'Restaurant not found.'});if(restaurant.city!==city)return res.status(400).json({message:'The restaurant must be in your selected delivery city.'});
  const user=await User.findById(req.user._id).select('name');let group;
  for(let attempt=0;attempt<3;attempt++){try{group=await GroupOrder.create({inviteCode:randomBytes(5).toString('hex').toUpperCase(),organizerId:req.user._id,restaurantId:restaurant._id,city:restaurant.city,deliveryAddress,phone,members:[{userId:req.user._id,name:user?.name||'Organizer'}]});break}catch(error){if(error.code!==11000||attempt===2)throw error}}
  res.status(201).json(await groupSnapshot(await loadGroup(group.inviteCode)));
}));
app.get('/api/groups/:code',protect,wrap(async(req,res)=>{
  let group=await loadGroup(req.params.code);if(!group)return res.status(404).json({message:'Group invitation not found.'});const isMember=group.members.some(member=>String(member.userId?._id||member.userId)===String(req.user._id));
  if(isMember){if(group.status==='Placing'){const prior=await Order.findOne({userId:group.organizerId,idempotencyKey:`group-order-${group._id}`});if(prior){const shareView=(await groupSnapshot(group)).group,orderLines=new Map(prior.items.map(item=>[String(item.foodId),item]));group.status='Placed';group.placedOrderId=prior._id;group.placedAt=prior.createdAt;group.subtotal=prior.subtotal;group.deliveryFee=prior.deliveryFee;group.totalAmount=prior.totalAmount;for(const member of group.members){const share=shareView.members.find(item=>item.userId===String(member.userId?._id||member.userId));if(share){member.subtotal=share.subtotal;member.deliveryFeeShare=share.deliveryFeeShare;member.totalShare=share.totalShare}for(const line of member.items){const snapshot=orderLines.get(String(line.foodId));if(snapshot){line.name=snapshot.name;line.image=snapshot.image;line.price=snapshot.price}}}await group.save();group=await loadGroup(group.inviteCode)}}return res.json(await groupSnapshot(group))}
  res.json({isMember:false,group:{inviteCode:group.inviteCode,status:group.status,city:group.city,restaurant:group.restaurantId?{name:group.restaurantId.name,image:group.restaurantId.image,cuisine:group.restaurantId.cuisine}:null,organizerName:group.members.find(member=>String(member.userId?._id||member.userId)===String(group.organizerId))?.name||'Organizer',memberCount:group.members.length,members:group.members.map(member=>({name:member.name}))}});
}));
app.post('/api/groups/:code/join',protect,wrap(async(req,res)=>{
  const group=await GroupOrder.findOne({inviteCode:String(req.params.code||'').trim().toUpperCase()});if(!group)return res.status(404).json({message:'Group invitation not found.'});if(group.status!=='Open')return res.status(409).json({message:'This group is no longer accepting members.'});
  if(!group.members.some(member=>String(member.userId)===String(req.user._id))){if(group.members.length>=25)return res.status(409).json({message:'This group has reached its 25-member limit.'});group.members.push({userId:req.user._id,name:req.user.name||'Foodiego member'});await group.save()}
  res.json(await groupSnapshot(await loadGroup(group.inviteCode)));
}));
app.put('/api/groups/:id/items/:foodId',protect,wrap(async(req,res)=>{
  if(!mongoose.isValidObjectId(req.params.id)||!mongoose.isValidObjectId(req.params.foodId))return res.status(400).json({message:'Invalid group or menu item.'});const group=await GroupOrder.findById(req.params.id);if(!group)return res.status(404).json({message:'Group order not found.'});if(group.status!=='Open')return res.status(409).json({message:'The group cart is locked.'});const member=group.members.find(item=>String(item.userId)===String(req.user._id));if(!member)return res.status(403).json({message:'Join this group before changing its cart.'});
  const quantity=Number(req.body?.quantity);if(!Number.isInteger(quantity)||quantity<0||quantity>50)return res.status(400).json({message:'Choose a whole-number quantity from 0 to 50.'});const food=await Food.findById(req.params.foodId);if(!food||food.available===false)return res.status(409).json({message:'This dish is currently unavailable.'});if(String(food.restaurantId)!==String(group.restaurantId))return res.status(400).json({message:'This group is ordering from one restaurant. Choose a dish from the selected restaurant.'});
  let line=member.items.find(item=>String(item.foodId)===String(food._id));if(quantity===0){if(line)member.items.pull(line._id)}else if(line)line.quantity=quantity;else{const lineCount=group.members.reduce((sum,item)=>sum+item.items.length,0);if(lineCount>=50)return res.status(400).json({message:'A group order can contain up to 50 distinct dishes.'});member.items.push({foodId:food._id,quantity})}await group.save();res.json(await groupSnapshot(await loadGroup(group.inviteCode)));
}));
app.post('/api/groups/:id/place',protect,wrap(async(req,res)=>{
  if(!mongoose.isValidObjectId(req.params.id))return res.status(400).json({message:'Invalid group order.'});const existingGroup=await GroupOrder.findById(req.params.id);if(!existingGroup)return res.status(404).json({message:'Group order not found.'});if(String(existingGroup.organizerId)!==String(req.user._id))return res.status(403).json({message:'Only the group organizer can place this order.'});
  if(existingGroup.status==='Placed')return res.json(await groupSnapshot(await loadGroup(existingGroup.inviteCode)));
  if(existingGroup.status==='Placing'){const prior=await Order.findOne({userId:existingGroup.organizerId,idempotencyKey:`group-order-${existingGroup._id}`});if(prior){await GroupOrder.updateOne({_id:existingGroup._id,status:'Placing'},{$set:{status:'Placed',placedOrderId:prior._id,placedAt:prior.createdAt,subtotal:prior.subtotal,deliveryFee:prior.deliveryFee,totalAmount:prior.totalAmount}});return res.json(await groupSnapshot(await loadGroup(existingGroup.inviteCode)))}return res.status(409).json({message:'The group order is already being submitted. Refresh in a moment.'})}
  if(existingGroup.status!=='Open')return res.status(409).json({message:'This group order is no longer open.'});const locked=await GroupOrder.findOneAndUpdate({_id:existingGroup._id,status:'Open',organizerId:req.user._id},{$set:{status:'Placing'}},{new:true});if(!locked)return res.status(409).json({message:'This group order is already being submitted.'});
  try{
    const allLines=locked.members.flatMap(member=>member.items.map(line=>({foodId:line.foodId,quantity:line.quantity})));const foods=allLines.length?await Food.find({_id:{$in:[...new Set(allLines.map(line=>String(line.foodId)))]}}):[];const details=buildOrderDetails(allLines,foods);if(String(details.restaurantId)!==String(locked.restaurantId))throw Object.assign(new Error('The group cart contains items from another restaurant.'),{status:400});const restaurant=await Restaurant.findById(details.restaurantId);if(!restaurant||restaurant.city!==locked.city)throw Object.assign(new Error('The selected restaurant is no longer available in this city.'),{status:409});
    const shareView=(await groupSnapshot(await loadGroup(locked.inviteCode))).group;const record={userId:locked.organizerId,idempotencyKey:`group-order-${locked._id}`,...details,city:restaurant.city,deliveryAddress:locked.deliveryAddress,phone:locked.phone,paymentMethod:'Cash on Delivery',status:'Pending',statusHistory:[{status:'Pending',changedAt:new Date()}]};let order;try{order=await Order.create(record)}catch(error){if(error.code===11000)order=await Order.findOne({userId:locked.organizerId,idempotencyKey:record.idempotencyKey});if(!order)throw error}
    locked.status='Placed';locked.placedOrderId=order._id;locked.placedAt=order.createdAt;locked.subtotal=order.subtotal;locked.deliveryFee=order.deliveryFee;locked.totalAmount=order.totalAmount;const orderLines=new Map(order.items.map(item=>[String(item.foodId),item]));for(const member of locked.members){const share=shareView.members.find(item=>item.userId===String(member.userId));if(share){member.subtotal=share.subtotal;member.deliveryFeeShare=share.deliveryFeeShare;member.totalShare=share.totalShare}for(const line of member.items){const snapshot=orderLines.get(String(line.foodId));if(snapshot){line.name=snapshot.name;line.image=snapshot.image;line.price=snapshot.price}}}await locked.save();return res.status(201).json(await groupSnapshot(await loadGroup(locked.inviteCode)));
  }catch(error){await GroupOrder.updateOne({_id:locked._id,status:'Placing'},{$set:{status:'Open'}});throw error}
}));
app.get('/api/restaurants',wrap(async(req,res)=>{const q={};if(req.query.city)q.city={$regex:`^${escapeRegex(req.query.city)}$`,$options:'i'};if(req.query.area)q.address={$regex:escapeRegex(req.query.area),$options:'i'};if(req.query.search)q.name={$regex:escapeRegex(req.query.search),$options:'i'};res.json(await Restaurant.find(q).sort({rating:-1}))}));app.get('/api/restaurants/:id',wrap(async(req,res)=>{const r=await Restaurant.findById(req.params.id);if(!r)return res.status(404).json({message:'Restaurant not found.'});res.json(r)}));
app.post('/api/restaurants',protect,adminOnly,wrap(async(req,res)=>res.status(201).json(await Restaurant.create(req.body))));app.put('/api/restaurants/:id',protect,adminOnly,wrap(async(req,res)=>res.json(await Restaurant.findByIdAndUpdate(req.params.id,req.body,{new:true,runValidators:true}))));app.delete('/api/restaurants/:id',protect,adminOnly,wrap(async(req,res)=>{await Restaurant.findByIdAndDelete(req.params.id);res.json({message:'Restaurant deleted.'})}));
app.get('/api/foods',wrap(async(req,res)=>{const q={};if(req.query.includeUnavailable!=='true')q.available={$ne:false};if(req.query.category)q.category=req.query.category;if(req.query.restaurantId)q.restaurantId=req.query.restaurantId;if(req.query.search)q.name={$regex:escapeRegex(req.query.search),$options:'i'};if(req.query.city||req.query.area){const restaurantQuery={};if(req.query.city)restaurantQuery.city={$regex:`^${escapeRegex(req.query.city)}$`,$options:'i'};if(req.query.area)restaurantQuery.address={$regex:escapeRegex(req.query.area),$options:'i'};const localRestaurants=await Restaurant.find(restaurantQuery).distinct('_id');q.restaurantId={$in:localRestaurants}}const sort=req.query.sort==='price'?'price':req.query.sort==='price-desc'?'-price':'-createdAt';res.json(await Food.find(q).populate('category restaurantId').sort(sort))}));app.get('/api/foods/:id',wrap(async(req,res)=>{const f=await Food.findById(req.params.id).populate('category restaurantId');if(!f)return res.status(404).json({message:'Food not found.'});res.json(f)}));
app.post('/api/foods',protect,adminOnly,wrap(async(req,res)=>res.status(201).json(await Food.create(req.body))));app.put('/api/foods/:id',protect,adminOnly,wrap(async(req,res)=>res.json(await Food.findByIdAndUpdate(req.params.id,req.body,{new:true,runValidators:true}))));app.delete('/api/foods/:id',protect,adminOnly,wrap(async(req,res)=>{await Food.findByIdAndDelete(req.params.id);res.json({message:'Food item deleted.'})}));
app.get('/api/categories',wrap(async(req,res)=>res.json(await Category.find().sort('name'))));app.post('/api/categories',protect,adminOnly,wrap(async(req,res)=>res.status(201).json(await Category.create(req.body))));app.delete('/api/categories/:id',protect,adminOnly,wrap(async(req,res)=>{await Category.findByIdAndDelete(req.params.id);res.json({message:'Category deleted.'})}));
app.get('/api/orders',protect,wrap(async(req,res)=>res.json(await Order.find(req.user.role==='admin'?{}:{userId:req.user._id}).populate('restaurantId','name').populate('userId','name email').sort('-createdAt'))));app.get('/api/orders/:id',protect,wrap(async(req,res)=>{const o=await Order.findById(req.params.id);if(!o)return res.status(404).json({message:'Order not found.'});if(req.user.role!=='admin'&&!o.userId.equals(req.user._id))return res.status(403).json({message:'Access denied.'});res.json(o)}));
app.post('/api/orders',protect,wrap(async(req,res)=>{
  const {items,deliveryAddress,phone}=req.body;
  const rawKey=req.get('Idempotency-Key')||req.body.idempotencyKey;
  const idempotencyKey=typeof rawKey==='string'?rawKey.trim():'';
  if(idempotencyKey&&!/^[A-Za-z0-9-]{16,128}$/.test(idempotencyKey))return res.status(400).json({message:'Invalid order submission key.'});
  if(idempotencyKey){
    const existing=await Order.findOne({userId:req.user._id,idempotencyKey});
    if(existing)return res.status(200).json(existing);
  }
  if(!Array.isArray(items)||!items.length||items.length>50||typeof deliveryAddress!=='string'||!deliveryAddress.trim()||deliveryAddress.length>500||typeof phone!=='string'||!/^[+]?\d[0-9()\s-]{6,19}$/.test(phone.trim()))return res.status(400).json({message:'Choose items and enter a valid delivery address and phone number.'});
  if(items.some(line=>!line||!mongoose.isValidObjectId(line.foodId)))return res.status(400).json({message:'One or more menu item IDs are invalid.'});
  const ids=[...new Set(items.map(line=>String(line.foodId)))];
  const foods=await Food.find({_id:{$in:ids}});
  const order=buildOrderDetails(items,foods);
  const restaurant=await Restaurant.findById(order.restaurantId);
  if(!restaurant)return res.status(400).json({message:'The selected restaurant is unavailable.'});
  if(req.body.city&&req.body.city!==restaurant.city)return res.status(400).json({message:'Your bag is from a different delivery city. Refresh your bag and try again.'});
  const record={userId:req.user._id,...order,city:restaurant.city,deliveryAddress:deliveryAddress.trim(),phone:phone.trim(),paymentMethod:'Cash on Delivery',status:'Pending',statusHistory:[{status:'Pending',changedAt:new Date()}]};
  if(idempotencyKey)record.idempotencyKey=idempotencyKey;
  let created;
  try{created=await Order.create(record)}catch(error){
    if(error.code===11000&&idempotencyKey){
      const existing=await Order.findOne({userId:req.user._id,idempotencyKey});
      if(existing)return res.status(200).json(existing);
    }
    throw error;
  }
  res.status(201).json(created);
}));
app.put('/api/orders/:id/status',protect,adminOnly,wrap(async(req,res)=>{
  const {status}=req.body;
  if(!ORDER_STATUSES.includes(status))return res.status(400).json({message:'Invalid order status.'});
  const order=await Order.findById(req.params.id);
  if(!order)return res.status(404).json({message:'Order not found.'});
  const changedAt=new Date();
  const events=statusChangeEvents(order.status,order.statusHistory, status,order.updatedAt||order.createdAt,changedAt);
  if(!events.length)return res.json(order);
  order.status=status;
  order.statusHistory.push(...events);
  await order.save();
  res.json(order);
}));
app.put('/api/users/profile',protect,wrap(async(req,res)=>{const {name,phone,address}=req.body;if(!name?.trim())return res.status(400).json({message:'Name is required.'});const u=await User.findByIdAndUpdate(req.user._id,{name:name.trim(),phone,address},{new:true,runValidators:true});res.json({user:safeUser(u)});}));app.get('/api/users',protect,adminOnly,wrap(async(req,res)=>res.json(await User.find().select('name email phone role createdAt').sort('-createdAt'))));
app.get('/api/admin/stats',protect,adminOnly,wrap(async(req,res)=>{const [users,restaurants,foods,orders,revenue,popularItems]=await Promise.all([User.countDocuments(),Restaurant.countDocuments(),Food.countDocuments(),Order.countDocuments(),Order.aggregate([{$match:{status:{$ne:'Cancelled'}}},{$group:{_id:null,total:{$sum:'$totalAmount'}}}]),Order.aggregate([{$match:{status:{$ne:'Cancelled'}}},{$unwind:'$items'},{$group:{_id:'$items.foodId',name:{$first:'$items.name'},quantity:{$sum:'$items.quantity'},revenue:{$sum:{$multiply:['$items.price','$items.quantity']}}}},{$sort:{quantity:-1,revenue:-1}},{$limit:5}])]);res.json({users,restaurants,foods,orders,revenue:revenue[0]?.total||0,popularItems})}));
app.use((req,res)=>res.status(404).json({message:'Route not found.'}));app.use((err,req,res,next)=>{console.error(err);res.status(err.name==='ValidationError'?400:500).json({message:err.name==='ValidationError'?err.message:'Server error.'})});
const port=process.env.PORT||5001;
if(process.env.VERCEL!=='1')connectDatabase().then(()=>app.listen(port,'127.0.0.1',()=>console.log(`FoodieGo API listening on 127.0.0.1:${port}`))).catch(error=>{console.error('MongoDB connection failed:',error.message);process.exit(1)});
export default app;
