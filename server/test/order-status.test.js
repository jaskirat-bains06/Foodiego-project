import test from 'node:test';
import assert from 'node:assert/strict';
import {statusChangeEvents} from '../src/order-status.js';

test('records real status changes in chronological order for older orders',()=>{
  const createdAt=new Date('2026-10-01T10:00:00Z');
  const changedAt=new Date('2026-10-01T10:20:00Z');
  assert.deepEqual(statusChangeEvents('Pending',[],'Preparing',createdAt,changedAt),[
    {status:'Pending',changedAt:createdAt},
    {status:'Preparing',changedAt}
  ]);
});

test('does not create a duplicate tracking event for an unchanged status',()=>{
  assert.deepEqual(statusChangeEvents('Preparing',[{status:'Preparing'}],'Preparing'),[]);
});

test('rejects statuses outside the existing order workflow',()=>{
  assert.throws(()=>statusChangeEvents('Pending',[],'On the way'),{status:400});
});
