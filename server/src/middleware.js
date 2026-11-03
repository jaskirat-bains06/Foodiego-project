import jwt from 'jsonwebtoken';
import {User} from './models.js';

export async function protect(req,res,next){
  const token=req.headers.authorization?.startsWith('Bearer ')?req.headers.authorization.slice(7):null;
  if(!token)return res.status(401).json({message:'Please sign in to continue.'});
  let data;
  try{data=jwt.verify(token,process.env.JWT_SECRET)}
  catch{return res.status(401).json({message:'Session expired. Please sign in again.'})}
  try{
    req.user=await User.findById(data.id);
    if(!req.user)return res.status(401).json({message:'Account not found.'});
    return next();
  }catch(error){return next(error)}
}

export function adminOnly(req,res,next){
  if(req.user?.role!=='admin')return res.status(403).json({message:'Administrator access required.'});
  return next();
}
