export const CITIES=['Chandigarh','Amritsar','Ludhiana','Jalandhar','Patiala','Bathinda','Mohali'];
export const CITY_AREAS={
  Chandigarh:['Sector 7','Sector 8','Sector 9','Sector 10','Sector 17','Sector 26','Sector 34','Sector 35','Kaimbwala'],
  Amritsar:['Cooper Road','Hall Bazaar','Lawrence Road','Ranjit Avenue'],
  Ludhiana:['Sarabha Nagar','Model Town','Ghumar Mandi'],
  Jalandhar:['Model Town','Urban Estate Phase I','Civil Lines'],
  Patiala:['Leela Bhawan','Tripuri','Model Town'],
  Bathinda:['Model Town','Mall Road','Power House Road'],
  Mohali:['Phase 3B2','Sector 70','Airport Road']
};
export const getRestaurantArea=(address='')=>{
  const sector=String(address).match(/Sector\s*\d+[A-Z]?/i);
  if(sector)return sector[0].replace(/\s+/g,' ').trim();
  return String(address).split(',')[0].trim();
};
