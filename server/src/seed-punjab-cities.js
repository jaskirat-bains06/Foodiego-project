import 'dotenv/config';
import mongoose from 'mongoose';
import {Restaurant,Food,Category} from './models.js';

const image=id=>`https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=85`;
const localKitchens=[
  {city:'Ludhiana',areas:['Sarabha Nagar','Model Town','Ghumar Mandi'],restaurants:[
    ['Punjab Plate Ludhiana','Punjabi','A neighborhood kitchen for homestyle Punjabi meals and fresh breads.','photo-1565557623262-b51c2513a641',[['Amritsari Chole Kulche','Punjabi',220,'photo-1601050690597-df0568f70950'],['Paneer Tikka Thali','Thali',310,'photo-1631452180519-c014fe946bc7']]],
    ['Sarabha Street Kitchen','North Indian','Comforting North Indian classics, prepared fresh to order.','photo-1596797038530-2c107229654b',[['Dal Makhani & Naan','North Indian',260,'photo-1546833999-b9f581a1996d'],['Tandoori Paneer Wrap','Wraps',190,'photo-1565299624946-b28f40a0ae38']]],
    ['Green Bowl Ludhiana','Healthy','Bright salads, grain bowls, and lighter everyday meals.','photo-1512621776951-a57141f2eefd',[['Garden Grain Bowl','Healthy',240,'photo-1546069901-ba9599a7e63c'],['Mint Lemon Cooler','Drinks',120,'photo-1513558161293-cdadcf081966']]]
  ]},
  {city:'Jalandhar',areas:['Model Town','Urban Estate Phase I','Civil Lines'],restaurants:[
    ['Doaba Tandoor House','Punjabi','Tandoor-fresh breads and hearty Doaba-inspired favorites.','photo-1565557623262-b51c2513a641',[['Tandoori Chicken Meal','Punjabi',340,'photo-1532550907401-a500c9a57435'],['Butter Naan','Sides',55,'photo-1601050690597-df0568f70950']]],
    ['Model Town Pizza Co.','Italian','Hand-stretched pizzas and oven-baked sides.','photo-1513104890138-7c749659a591',[['Classic Margherita','Pizza',280,'photo-1579751626657-72bc17010498'],['Roasted Veg Pizza','Pizza',330,'photo-1579751626657-72bc17010498']]],
    ['Jalandhar Chaat Corner','Street Food','A lively stop for crisp chaat and Indian street-food favorites.','photo-1601050690597-df0568f70950',[['Papdi Chaat','Street Food',150,'photo-1601050690597-df0568f70950'],['Paneer Kathi Roll','Wraps',190,'photo-1565299624946-b28f40a0ae38']]]
  ]},
  {city:'Patiala',areas:['Leela Bhawan','Tripuri','Model Town'],restaurants:[
    ['Patiala Shahi Rasoi','Punjabi','Classic Punjabi comfort food inspired by Patiala kitchens.','photo-1596797038530-2c107229654b',[['Shahi Paneer Combo','Punjabi',290,'photo-1631452180519-c014fe946bc7'],['Rajma Chawal','Punjabi',210,'photo-1631452180519-c014fe946bc7']]],
    ['Leela Bhawan Bakehouse','Cafe','Fresh bakes, sandwiches, and coffee for an easy café break.','photo-1546173159-315724a31696',[['Grilled Veg Sandwich','Cafe',180,'photo-1528735602780-2552fd46c7af'],['Chocolate Brownie','Desserts',130,'photo-1533134242443-d4fd215305ad']]],
    ['Garden Greens Patiala','Healthy','Seasonal salads and fresh bowls made for lighter meals.','photo-1512621776951-a57141f2eefd',[['Paneer Power Bowl','Healthy',260,'photo-1546069901-ba9599a7e63c'],['Fresh Fruit Bowl','Healthy',190,'photo-1512621776951-a57141f2eefd']]]
  ]},
  {city:'Bathinda',areas:['Model Town','Mall Road','Power House Road'],restaurants:[
    ['Malwa Meal House','Punjabi','Malwa-style home cooking with generous portions and warm breads.','photo-1565557623262-b51c2513a641',[['Malwa Kadhi Chawal','Punjabi',210,'photo-1631452180519-c014fe946bc7'],['Chole Kulche','Punjabi',190,'photo-1601050690597-df0568f70950']]],
    ['Bathinda Burger Works','American','Juicy burgers, golden fries, and house-made sauces.','photo-1568901346375-23c9450c58cd',[['Classic Smash Burger','Burgers',260,'photo-1568901346375-23c9450c58cd'],['Loaded Masala Fries','Sides',160,'photo-1573080496219-bb080dd4f877']]],
    ['Lakeview Tandoor','North Indian','A local kitchen serving tandoor favorites and rich curries.','photo-1596797038530-2c107229654b',[['Chicken Tikka Masala','North Indian',320,'photo-1565557623262-b51c2513a641'],['Garlic Naan','Sides',60,'photo-1601050690597-df0568f70950']]]
  ]},
  {city:'Mohali',areas:['Phase 3B2','Sector 70','Airport Road'],restaurants:[
    ['Mohali Tandoor & Table','North Indian','Freshly grilled tandoor favorites and North Indian classics.','photo-1565557623262-b51c2513a641',[['Paneer Tikka','North Indian',280,'photo-1631452180519-c014fe946bc7'],['Tandoori Roti','Sides',35,'photo-1601050690597-df0568f70950']]],
    ['Phase Three Pizza Kitchen','Italian','Stone-baked pizzas with crisp crusts and fresh toppings.','photo-1513104890138-7c749659a591',[['Farmhouse Pizza','Pizza',340,'photo-1579751626657-72bc17010498'],['Garlic Bread','Sides',150,'photo-1601050690597-df0568f70950']]],
    ['Fresh Fork Mohali','Healthy','Everyday salads, nourishing bowls, and cold-pressed drinks.','photo-1512621776951-a57141f2eefd',[['Avocado Chickpea Bowl','Healthy',290,'photo-1546069901-ba9599a7e63c'],['Seasonal Fruit Smoothie','Drinks',180,'photo-1513558161293-cdadcf081966']]]
  ]}
];

try{
  await mongoose.connect(process.env.MONGO_URI||'mongodb://127.0.0.1:27017/foodiego');
  let addedRestaurants=0,addedFoods=0;
  for(const group of localKitchens)for(let i=0;i<group.restaurants.length;i++){
    const [name,cuisine,description,pic,dishes]=group.restaurants[i];
    const address=`${group.areas[i]}, ${group.city}`;
    const restaurantExists=await Restaurant.exists({name,city:group.city});
    const restaurant=await Restaurant.findOneAndUpdate({name,city:group.city},{$set:{address},$setOnInsert:{name,cuisine,description,image:image(pic),city:group.city,deliveryTime:'25–35 min',rating:4.7,minimumOrder:249}},{new:true,upsert:true,setDefaultsOnInsert:true});
    if(!restaurantExists)addedRestaurants++;
    for(const [dish,category,price,picId] of dishes){
      const cat=await Category.findOneAndUpdate({name:category},{$setOnInsert:{name:category,image:image(picId)}},{new:true,upsert:true,setDefaultsOnInsert:true});
      const foodExists=await Food.exists({restaurantId:restaurant._id,name:dish});
      await Food.findOneAndUpdate({restaurantId:restaurant._id,name:dish},{$setOnInsert:{restaurantId:restaurant._id,name:dish,category:cat._id,price,description:`Freshly prepared ${dish.toLowerCase()} from ${name}.`,image:image(picId)}},{new:true,upsert:true,setDefaultsOnInsert:true});
      if(!foodExists)addedFoods++;
    }
  }
  console.log(`Punjab locations ready: ${localKitchens.length} cities, ${addedRestaurants} new restaurants, ${addedFoods} new dishes.`);
}catch(error){console.error(error);process.exitCode=1}
finally{await mongoose.disconnect()}
