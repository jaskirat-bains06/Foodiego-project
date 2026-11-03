import 'dotenv/config';
import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import {User,Restaurant,Food,Category,Order} from './models.js';
import {protect,adminOnly} from './middleware.js';
import {buildOrderDetails} from './order-pricing.js';
import {ORDER_STATUSES,statusChangeEvents} from './order-status.js';
const app=express();const allowedOrigins=(process.env.CLIENT_URL||'http://localhost:5173').split(',').map(x=>x.trim());app.use(cors({origin:(origin,done)=>{const localDev=process.env.NODE_ENV!=='production'&&origin&&/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);done(null,!origin||allowedOrigins.includes(origin)||localDev)}}));app.use(express.json({limit:'1mb'}));
const wrap=(fn)=>async(req,res)=>{try{await fn(req,res)}catch(e){const status=e.status||(e.name==='ValidationError'||e.name==='CastError'?400:e.code===11000?409:500);res.status(status).json({message:e.code===11000?'That email or name is already in use.':status===500?'Server error.':e.message||'Request failed.'})}};
const tokenFor=u=>jwt.sign({id:u._id},process.env.JWT_SECRET,{expiresIn:process.env.JWT_EXPIRES_IN||'7d'});
const escapeRegex=value=>String(value).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const safeUser=u=>({_id:u._id,name:u.name,email:u.email,phone:u.phone,address:u.address,role:u.role,createdAt:u.createdAt});
app.get('/api/health',(req,res)=>{const connected=mongoose.connection.readyState===1;res.status(connected?200:503).json({ok:connected,database:connected?'connected':'disconnected'})});
app.post('/api/auth/register',wrap(async(req,res)=>{const {name,email,password}=req.body;if(!name?.trim()||!email||!/^\S+@\S+\.\S+$/.test(email)||!password||password.length<8)return res.status(400).json({message:'Enter a name, valid email, and password with at least 8 characters.'});const u=await User.create({name,email,password:await bcrypt.hash(password,12)});res.status(201).json({token:tokenFor(u),user:safeUser(u)});}));
app.post('/api/auth/login',wrap(async(req,res)=>{const u=await User.findOne({email:req.body.email?.toLowerCase()}).select('+password');if(!u||!await bcrypt.compare(req.body.password||'',u.password))return res.status(401).json({message:'Email or password is incorrect.'});res.json({token:tokenFor(u),user:safeUser(u)});}));
app.get('/api/auth/profile',protect,(req,res)=>res.json({user:safeUser(req.user)}));
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
const port=process.env.PORT||5001;mongoose.connect(process.env.MONGO_URI||'mongodb://127.0.0.1:27017/foodiego').then(()=>app.listen(port,()=>console.log(`FoodieGo API listening on ${port}`))).catch(err=>{console.error('MongoDB connection failed:',err.message);process.exit(1)});
