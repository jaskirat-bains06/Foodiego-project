import 'dotenv/config';
import mongoose from 'mongoose';
import {Restaurant,Food,Category} from './models.js';

const image=id=>`https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&q=85`;
const restaurants=[
  {name:'TuBu',cuisine:'Cafe · Contemporary',address:'Opposite Government Museum, Sector 10, Chandigarh',description:'A Chandigarh café inspired by contemporary design and relaxed dining.',photo:'photo-1554118811-1e0d58224f24',dishes:[['Crispy Paneer Burger','Burgers',285,'photo-1568901346375-23c9450c58cd'],['Garden Pesto Pasta','Italian',320,'photo-1473093295043-cdd812d0e601']]},
  {name:'Laska Kitchen & Bar',cuisine:'Global · Cafe',address:'Near Sukhna Enclave, Kaimbwala, Chandigarh',description:'A countryside-style dining spot near Kaimbwala in this project demo.',photo:'photo-1517248135467-4c7edcad34c4',dishes:[['Smoky Cottage Cheese Tikka','Indian',320,'photo-1631452180519-c014fe946bc7'],['Creamy Mushroom Pasta','Italian',340,'photo-1473093295043-cdd812d0e601']]},
  {name:'Tulum Rooftop Bar & Kitchen',cuisine:'Global · Rooftop',address:'The Toy Hotel, SCO 165–167, Sector 34B, Chandigarh',description:'Rooftop dining inspiration, listed here as a university project demo.',photo:'photo-1514933651103-005eec06c04b',dishes:[['Tulum Mezze Platter','Mediterranean',390,'photo-1547592180-85f173990554'],['Wood-fired Margherita','Pizza',360,'photo-1579751626657-72bc17010498']]},
  {name:'Olive Cafe & Bar',cuisine:'Mediterranean · Italian',address:'Sector 26, Chandigarh',description:'A Mediterranean-inspired café listing with sample menu items for this demo.',photo:'photo-1517248135467-4c7edcad34c4',dishes:[['Truffle Mushroom Risotto','Italian',420,'photo-1473093295043-cdd812d0e601'],['Classic Greek Salad','Healthy',290,'photo-1512621776951-a57141f2eefd']]},
  {name:'Dastaan',cuisine:'North Indian',address:'SCO 43, Sector 7C, Madhya Marg, Chandigarh',description:'A North Indian dining listing with a sample menu for this university demo.',photo:'photo-1555396273-367ea4eb4db5',dishes:[['Dastaan Dal Makhani','Punjabi',330,'photo-1631452180519-c014fe946bc7'],['Paneer Lababdar','North Indian',340,'photo-1631452180519-c014fe946bc7']]},
  {name:'Sector 7 SOCIAL',cuisine:'Cafe · Indian Fusion',address:'SCO 37, Madhya Marg, Sector 7, Chandigarh',description:'A café-style sample menu entry for the Chandigarh project demo.',photo:'photo-1517248135467-4c7edcad34c4',dishes:[['Masala Fried Chicken Burger','Burgers',310,'photo-1568901346375-23c9450c58cd'],['Butter Chicken Biryani','Indian',350,'photo-1565557623262-b51c2513a641']]}
];

try{
  await mongoose.connect(process.env.MONGO_URI||'mongodb://127.0.0.1:27017/foodiego');
  let addedRestaurants=0,addedFoods=0;
  for(const entry of restaurants){
    const {name,cuisine,address,description,photo,dishes}=entry;
    const exists=await Restaurant.exists({name,city:'Chandigarh'});
    const restaurant=await Restaurant.findOneAndUpdate({name,city:'Chandigarh'},{$set:{address,demoListing:true},$setOnInsert:{name,cuisine,description,image:image(photo),city:'Chandigarh',deliveryTime:'25–40 min',rating:4.6,minimumOrder:249}},{new:true,upsert:true,setDefaultsOnInsert:true});
    if(!exists)addedRestaurants++;
    for(const [dish,category,price,pic] of dishes){
      const cat=await Category.findOneAndUpdate({name:category},{$setOnInsert:{name:category,image:image(pic)}},{new:true,upsert:true,setDefaultsOnInsert:true});
      const foodExists=await Food.exists({restaurantId:restaurant._id,name:dish});
      await Food.findOneAndUpdate({restaurantId:restaurant._id,name:dish},{$setOnInsert:{restaurantId:restaurant._id,name:dish,category:cat._id,price,description:`Sample menu item for the FoodieGo university project demo.`,image:image(pic)}},{new:true,upsert:true,setDefaultsOnInsert:true});
      if(!foodExists)addedFoods++;
    }
  }
  console.log(`Chandigarh demo listings ready: ${addedRestaurants} new restaurants, ${addedFoods} new sample dishes.`);
}catch(error){console.error(error);process.exitCode=1}
finally{await mongoose.disconnect()}
