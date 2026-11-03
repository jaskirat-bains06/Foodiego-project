import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOrderDetails,calculateTotals} from '../src/order-pricing.js';

const restaurantId='restaurant-1';
const menu=[
  {_id:'food-1',name:'Paneer Bowl',price:220.5,restaurantId,available:true},
  {_id:'food-2',name:'Mango Lassi',price:80,restaurantId,available:true},
  {_id:'food-3',name:'Another Kitchen Dish',price:100,restaurantId:'restaurant-2',available:true}
];

test('delivery is charged below the threshold and free at the threshold',()=>{
  assert.deepEqual(calculateTotals(598),{subtotal:598,deliveryFee:39,totalAmount:637});
  assert.deepEqual(calculateTotals(599),{subtotal:599,deliveryFee:0,totalAmount:599});
});

test('order totals come from database prices and duplicate lines combine',()=>{
  const order=buildOrderDetails([{foodId:'food-1',quantity:1,price:0.01},{foodId:'food-1',quantity:2,price:0}],menu);
  assert.equal(order.subtotal,661.5);
  assert.equal(order.totalAmount,661.5);
  assert.equal(order.items.length,1);
  assert.equal(order.items[0].quantity,3);
  assert.equal(order.items[0].price,220.5);
});

test('rejects fractional, zero, and excessive quantities',()=>{
  for(const quantity of [0,1.5,51]) assert.throws(()=>buildOrderDetails([{foodId:'food-1',quantity}],menu),{status:400});
  assert.throws(()=>buildOrderDetails([{foodId:'food-1',quantity:30},{foodId:'food-1',quantity:25}],menu),{status:400});
});

test('rejects unavailable menu items and mixed-restaurant orders',()=>{
  assert.throws(()=>buildOrderDetails([{foodId:'missing',quantity:1}],menu),{status:400});
  assert.throws(()=>buildOrderDetails([{foodId:'food-1',quantity:1},{foodId:'food-3',quantity:1}],menu),{status:400});
  const unavailable=[{...menu[0],available:false}];
  assert.throws(()=>buildOrderDetails([{foodId:'food-1',quantity:1}],unavailable),{status:400});
});
