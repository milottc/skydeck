try{const _gp=navigator.getGamepads;navigator.getGamepads=function(){try{return _gp.call(navigator)||[];}catch(e){return [];}};}catch(e){}
const errEl=document.getElementById('errorBanner'),bootEl=document.getElementById('bootBadge'),loadEl=document.getElementById('loadStatus');
const camBadge=document.getElementById('camBadge');
function fatal(m){console.error('[FATAL]',m);errEl.style.display='block';errEl.textContent='⚠ '+m;}
function status(m){bootEl.textContent='BOOT · '+m;}
window.addEventListener('error',e=>fatal(e.message+' @'+e.lineno));
window.addEventListener('unhandledrejection',e=>fatal('Promise: '+((e.reason&&e.reason.message)||e.reason)));
function loadJS(u){return new Promise(r=>{const t=document.createElement('script');t.src=u;t.onload=()=>r(true);t.onerror=()=>r(false);document.head.appendChild(t);});}
/* ===== OFFLINE CACHE (IndexedDB): map tiles, elevation tiles and the 3D engine libraries ===== */
const OFF=(()=>{
  const DB='bf737-offline',STORE='blobs';
  const keys=new Set();let dbP=null,initP=null;
  const LIBS=[
    ['lib/babylon.js',['https://cdn.jsdelivr.net/npm/babylonjs@7/babylon.js','https://unpkg.com/babylonjs@7/babylon.js','https://cdnjs.cloudflare.com/ajax/libs/babylonjs/7.31.0/babylon.js']],
    ['lib/babylonjs.materials.min.js',['https://cdn.jsdelivr.net/npm/babylonjs-materials@7/babylonjs.materials.min.js','https://unpkg.com/babylonjs-materials@7/babylonjs.materials.min.js','https://cdnjs.cloudflare.com/ajax/libs/babylonjs/7.31.0/babylonjs.materials.min.js']]
  ];
  const openDB=()=>dbP||(dbP=new Promise((res,rej)=>{
    if(!self.indexedDB){rej(new Error('no IndexedDB'));return;}
    const r=indexedDB.open(DB,1);
    r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE);};
    r.onsuccess=()=>res(r.result);r.onerror=()=>{dbP=null;rej(r.error);};
  }));
  const req=(mode,fn)=>openDB().then(db=>new Promise((res,rej)=>{
    const t=db.transaction(STORE,mode);const q=fn(t.objectStore(STORE));
    t.oncomplete=()=>res(q.result);t.onerror=()=>rej(t.error);t.onabort=()=>rej(t.error);
  }));
  const init=()=>initP||(initP=req('readonly',s=>s.getAllKeys()).then(ks=>{ks.forEach(k=>keys.add(k));return keys.size;}).catch(()=>0));
  const getBlob=k=>req('readonly',s=>s.get(k)).then(b=>b||null).catch(()=>null);
  const put=(k,b)=>req('readwrite',s=>s.put(b,k)).then(()=>{keys.add(k);});
  const fetchBlob=async u=>{const c=new AbortController(),t=setTimeout(()=>c.abort(),20000);
    try{const r=await fetch(u,{signal:c.signal});if(!r.ok)throw new Error('HTTP '+r.status);return await r.blob();}
    finally{clearTimeout(t);}};
  return {
    init,put,fetchBlob,
    has:k=>keys.has(k),
    count:()=>keys.size,
    /* offline copy if one is stored, otherwise the network URL */
    async srcFor(offKey,url){
      if(offKey&&keys.has(offKey)){const b=await getBlob(offKey);if(b)return URL.createObjectURL(b);}
      return url;
    },
    async downloadLibs(){
      let n=0;await init();
      for(const [k,urls] of LIBS){
        if(keys.has(k))continue;
        for(const u of urls){try{await put(k,await fetchBlob(u));n++;break;}catch(e){}}
      }
      return n;
    },
    async loadLibs(){
      await init();
      for(const [k] of LIBS){const b=await getBlob(k);if(!b)return false;if(!(await loadJS(URL.createObjectURL(b))))return false;}
      return typeof BABYLON!=='undefined';
    }
  };
})();

(async()=>{
  if(typeof BABYLON==='undefined'){
    const mirrors=[
      ['https://cdn.jsdelivr.net/npm/babylonjs@7/babylon.js','https://cdn.jsdelivr.net/npm/babylonjs-materials@7/babylonjs.materials.min.js'],
      ['https://unpkg.com/babylonjs@7/babylon.js','https://unpkg.com/babylonjs-materials@7/babylonjs.materials.min.js'],
      ['https://cdnjs.cloudflare.com/ajax/libs/babylonjs/7.31.0/babylon.js','https://cdnjs.cloudflare.com/ajax/libs/babylonjs/7.31.0/babylonjs.materials.min.js']];
    for(const [a,b] of mirrors){bootEl.textContent='BOOT · loading engine…';if(await loadJS(a)&&typeof BABYLON!=='undefined'){await loadJS(b);break;}}
  }
  if(typeof BABYLON==='undefined'){await OFF.loadLibs();}
  if(typeof BABYLON==='undefined'){fatal('Babylon.js failed to load from every CDN. Check your internet connection.');return;}
  await OFF.init();
  try{main();}catch(e){fatal('Startup: '+e.message);console.error(e);}
})();

function main(){
let _sfxCur=null;

/* ===== SETTINGS (persisted in localStorage) ===== */
const SET_DEF={rudder:'simple',purple:false};
const SET=(()=>{try{return Object.assign({},SET_DEF,JSON.parse(localStorage.getItem('bf737_settings')||'{}'));}catch(e){return Object.assign({},SET_DEF);}})();
const saveSet=()=>{try{localStorage.setItem('bf737_settings',JSON.stringify(SET));}catch(e){}};

/* ===== KSFO: real FAA threshold coordinates for all four runways (source: AirNav/FAA). World origin = centre of 28L/10R so the
   satellite imagery's real runways line up exactly with the simulated ones. True headings (magnetic variation 14E). ===== */
const KS_REF={lat:37.619002,lon:-122.375727};
const ksXZ=(la,lo)=>[(lo-KS_REF.lon)*111320*Math.cos(KS_REF.lat*Math.PI/180),-(la-KS_REF.lat)*111132];
const KS_RWY=[
  {des:['28L','10R'],a:[37.611712,-122.358349],b:[37.626291,-122.393105],appr:[1,0]},
  {des:['28R','10L'],a:[37.613534,-122.357141],b:[37.628739,-122.393392],appr:[1,0]},
  {des:['1R','19L'],a:[37.606330,-122.381041],b:[37.627342,-122.367111],appr:[0,0]},
  {des:['1L','19R'],a:[37.607898,-122.382929],b:[37.626481,-122.370609],appr:[1,0]}
].map(r=>{const A=ksXZ(...r.a),B=ksXZ(...r.b),dx=B[0]-A[0],dz=B[1]-A[1],len=Math.hypot(dx,dz);
  return Object.assign(r,{A,B,len,wid:61,cx:(A[0]+B[0])/2,cz:(A[1]+B[1])/2,hdg:(Math.atan2(dx,-dz)*180/Math.PI+360)%360,ux:dx/len,uz:dz/len});});
/* runway-local helper: world [x,z] of the point s metres along the runway from its first threshold and o metres to the LEFT of its heading
   (x is east, z is south, so "left" = (uz,-ux)) */
const ksAt=(r,s,o)=>[r.A[0]+r.ux*s+r.uz*o, r.A[1]+r.uz*s-r.ux*o];
const KS_TERM=ksXZ(37.6160,-122.3892);   /* centre of the terminal horseshoe / central garage */
const KS_FIELD=ksXZ(37.6165,-122.3790);  /* middle of the airfield, between the terminals and the 1L/1R runways */

const LOCS={
  // North America — Canada — Ontario
  CYYZ:{lat:43.6772,lon:-79.6306,elev:173},  // Toronto Pearson
  CYTZ:{lat:43.6275,lon:-79.3962,elev:77},   // Toronto Billy Bishop (Island)
  CYKF:{lat:43.4608,lon:-80.3786,elev:321},  // Waterloo
  CYOO:{lat:43.9228,lon:-78.8950,elev:137},  // Oshawa
  CYHM:{lat:43.1736,lon:-79.9350,elev:238},  // Hamilton
  CYKZ:{lat:43.8608,lon:-79.3703,elev:190},  // Buttonville (Toronto north)
  CYXU:{lat:43.0356,lon:-81.1531,elev:278},  // London ON
  CYWG:{lat:49.9100,lon:-97.2398,elev:239},  // Winnipeg
  // Canada — Quebec
  CYUL:{lat:45.4706,lon:-73.7408,elev:36},   // Montréal Trudeau
  CYMX:{lat:45.6795,lon:-74.0056,elev:57},   // Montréal Mirabel
  CYHU:{lat:45.5175,lon:-73.4197,elev:27},   // St-Hubert (Longueuil)
  CYQB:{lat:46.7911,lon:-71.3933,elev:74},   // Quebec City
  CYSB:{lat:46.6253,lon:-80.7989,elev:348},  // Sudbury
  // Canada — BC / West
  CYVR:{lat:49.1947,lon:-123.1792,elev:4},   // Vancouver Intl
  CYYJ:{lat:48.6469,lon:-123.4258,elev:19},  // Victoria
  CZBB:{lat:49.0942,lon:-122.3597,elev:2},   // Boundary Bay (Delta BC)
  CYCD:{lat:49.0547,lon:-123.8697,elev:6},   // Nanaimo
  CYXS:{lat:53.8894,lon:-122.6792,elev:691}, // Prince George
  CYXX:{lat:49.0253,lon:-122.3606,elev:58},  // Abbotsford
  // Canada — Alberta / Prairies
  CYYC:{lat:51.1139,lon:-114.0203,elev:1084},// Calgary Intl
  CYBW:{lat:51.1131,lon:-114.3744,elev:1118},// Springbank (Calgary area)
  CYEG:{lat:53.3097,lon:-113.5800,elev:723}, // Edmonton Intl
  CYXD:{lat:53.5728,lon:-113.5214,elev:671}, // Edmonton City Centre (Blatchford)
  CYXE:{lat:52.1333,lon:-106.6667,elev:480}, // Saskatoon
  CYQR:{lat:50.4319,lon:-104.6177,elev:577}, // Regina
  CYBR:{lat:49.9108,lon:-99.9519,elev:357},  // Brandon
  // Canada — East / Maritimes
  CYOW:{lat:45.3225,lon:-75.6692,elev:114},  // Ottawa
  CYYG:{lat:46.2900,lon:-63.1211,elev:55},   // Charlottetown
  CYHZ:{lat:44.8808,lon:-63.5086,elev:145},  // Halifax
  CYQM:{lat:46.1122,lon:-64.6786,elev:71},   // Moncton
  CYFC:{lat:45.8719,lon:-66.5372,elev:34},   // Fredericton
  CYSJ:{lat:45.3161,lon:-65.8900,elev:38},   // Saint John NB
  CYYT:{lat:47.6186,lon:-52.7519,elev:140},  // St. John's NL
  CYGV:{lat:51.3994,lon:-56.0819,elev:48},   // Havre-Saint-Pierre / La Grande Rivière area
  // USA — Northeast / Mid-Atlantic regional
  KBUF:{lat:42.9405,lon:-78.7322,elev:215},  // Buffalo
  KSYR:{lat:43.1112,lon:-76.1063,elev:128},  // Syracuse
  KALB:{lat:42.7483,lon:-73.8017,elev:89},   // Albany
  KPVD:{lat:41.7265,lon:-71.4282,elev:15},   // Providence
  KMHT:{lat:42.9326,lon:-71.4357,elev:81},   // Manchester NH
  KBGR:{lat:44.8074,lon:-68.8282,elev:59},   // Bangor
  KPWM:{lat:43.6462,lon:-70.3093,elev:76},   // Portland ME
  KHPN:{lat:41.0670,lon:-73.7076,elev:122},  // Westchester (White Plains)
  KTEB:{lat:40.8501,lon:-74.0608,elev:3},    // Teterboro NJ (small jets)
  KABE:{lat:40.6521,lon:-75.4408,elev:124},  // Allentown PA
  KAVP:{lat:41.3385,lon:-75.7234,elev:289},  // Scranton/Wilkes-Barre
  KISP:{lat:40.7952,lon:-73.1002,elev:28},   // Long Island MacArthur
  KHVN:{lat:41.2638,lon:-72.8868,elev:4},    // New Haven
  // USA — Midwest regional
  KMDW:{lat:41.7860,lon:-87.7524,elev:188},  // Chicago Midway
  KGRR:{lat:42.8808,lon:-85.5228,elev:245},  // Grand Rapids
  KLAN:{lat:42.7787,lon:-84.5874,elev:282},  // Lansing
  KFTW:{lat:32.8199,lon:-97.3622,elev:218},  // Ft. Worth Meacham
  KHOU:{lat:29.6454,lon:-95.2789,elev:14},   // Houston Hobby
  KSAT:{lat:29.5337,lon:-98.4698,elev:242},  // San Antonio
  // El Paso is already in LOCS as KELP below — no duplicate needed
  KCOS:{lat:38.8058,lon:-104.7008,elev:1881},// Colorado Springs
  KDSM:{lat:41.5340,lon:-93.6631,elev:294},  // Des Moines
  KOMA:{lat:41.3032,lon:-95.8941,elev:299},  // Omaha Eppley
  KICT:{lat:37.6499,lon:-97.4331,elev:408},  // Wichita
  KMCI:{lat:39.2976,lon:-94.7139,elev:313},  // Kansas City
  KLIT:{lat:34.7294,lon:-92.2243,elev:75},   // Little Rock
  // USA — South regional
  KBHM:{lat:33.5629,lon:-86.7535,elev:193},  // Birmingham AL
  KMOB:{lat:30.6912,lon:-88.2428,elev:67},   // Mobile
  KJAN:{lat:32.3112,lon:-90.0759,elev:97},   // Jackson MS
  KCHA:{lat:35.0353,lon:-85.2038,elev:218},  // Chattanooga
  KTYS:{lat:35.8118,lon:-83.9940,elev:293},  // Knoxville
  KAVL:{lat:35.4362,lon:-82.5419,elev:661},  // Asheville NC
  KMYR:{lat:33.6797,lon:-78.9283,elev:9},    // Myrtle Beach
  KCHS:{lat:32.8986,lon:-80.0405,elev:14},   // Charleston SC
  KSAV:{lat:32.1276,lon:-81.2021,elev:15},   // Savannah
  KJAX:{lat:30.4941,lon:-81.6879,elev:9},    // Jacksonville
  KPNS:{lat:30.4734,lon:-87.1866,elev:36},   // Pensacola
  // USA — West regional
  KBUR:{lat:34.2007,lon:-118.3585,elev:238}, // Burbank / Hollywood
  KLGB:{lat:33.8177,lon:-118.1517,elev:18},  // Long Beach
  KONT:{lat:34.0560,lon:-117.6012,elev:288}, // Ontario CA
  KOAK:{lat:37.7213,lon:-122.2208,elev:2},   // Oakland
  KSJC:{lat:37.3626,lon:-121.9290,elev:18},  // San Jose
  KSMF:{lat:38.6954,lon:-121.5908,elev:8},   // Sacramento
  KFAT:{lat:36.7762,lon:-119.7181,elev:102}, // Fresno
  KRNO:{lat:39.4991,lon:-119.7681,elev:1341},// Reno
  KBOI:{lat:43.5644,lon:-116.2228,elev:874}, // Boise
  KBZN:{lat:45.7775,lon:-111.1531,elev:1369},// Bozeman
  KMSN:{lat:43.1399,lon:-89.3375,elev:265},  // Madison WI
  KFSD:{lat:43.5820,lon:-96.7419,elev:437},  // Sioux Falls
  // USA — Hawaii / Alaska
  PHKO:{lat:19.7386,lon:-156.0456,elev:14},  // Kona
  PHOG:{lat:20.8986,lon:-156.4305,elev:49},  // Maui Kahului
  PANC:{lat:61.1744,lon:-149.9964,elev:46},  // Anchorage
  PAFA:{lat:64.8151,lon:-147.8561,elev:135}, // Fairbanks
  PAJN:{lat:58.3550,lon:-134.5763,elev:6},   // Juneau
  // North America — USA
  KJFK:{lat:40.6413,lon:-73.7781,elev:4},KLAX:{lat:33.9425,lon:-118.4081,elev:38},
  KORD:{lat:41.9742,lon:-87.9073,elev:202},KATL:{lat:33.6367,lon:-84.4281,elev:313},
  KDFW:{lat:32.8968,lon:-97.0380,elev:182},KDEN:{lat:39.8561,lon:-104.6737,elev:1655},
  KSFO:{lat:KS_REF.lat,lon:KS_REF.lon,elev:4},KLAS:{lat:36.0840,lon:-115.1537,elev:664},
  KMIA:{lat:25.7959,lon:-80.2870,elev:3},KSEA:{lat:47.4502,lon:-122.3088,elev:132},
  KPHX:{lat:33.4373,lon:-112.0078,elev:337},KIAH:{lat:29.9902,lon:-95.3368,elev:30},
  KEWR:{lat:40.6895,lon:-74.1745,elev:9},KMSP:{lat:44.8848,lon:-93.2223,elev:256},
  KDTW:{lat:42.2124,lon:-83.3534,elev:195},KBOS:{lat:42.3656,lon:-71.0096,elev:9},
  KPHL:{lat:39.8721,lon:-75.2411,elev:11},KLGA:{lat:40.7773,lon:-73.8726,elev:7},
  KBWI:{lat:39.1754,lon:-76.6683,elev:46},KDCA:{lat:38.8521,lon:-77.0377,elev:15},
  KSLC:{lat:40.7884,lon:-111.9778,elev:1288},KFLL:{lat:26.0726,lon:-80.1527,elev:3},
  KMCO:{lat:28.4294,lon:-81.3089,elev:29},KIAH2:{lat:29.9844,lon:-95.3414,elev:30},
  KSTL:{lat:38.7487,lon:-90.3700,elev:189},KCLT:{lat:35.2140,lon:-80.9431,elev:237},
  KSAN:{lat:32.7336,lon:-117.1897,elev:5},KTPA:{lat:27.9755,lon:-82.5332,elev:9},
  KPDX:{lat:45.5888,lon:-122.5975,elev:9},KMEM:{lat:35.0424,lon:-89.9767,elev:103},
  KBNA:{lat:36.1245,lon:-86.6782,elev:183},KAUS:{lat:30.1945,lon:-97.6699,elev:160},
  KMSY:{lat:29.9934,lon:-90.2580,elev:2},KRDU:{lat:35.8776,lon:-78.7875,elev:132},
  KRIC:{lat:37.5052,lon:-77.3197,elev:52},KCMH:{lat:39.9998,lon:-82.8919,elev:248},
  KPIT:{lat:40.4915,lon:-80.2329,elev:365},KIND:{lat:39.7173,lon:-86.2944,elev:246},
  KSNA:{lat:33.6757,lon:-117.8682,elev:17},KSDF:{lat:38.1744,lon:-85.7360,elev:149},
  KELP:{lat:31.8072,lon:-106.3779,elev:1194},KABQ:{lat:35.0402,lon:-106.6090,elev:1640},
  KTUS:{lat:32.1161,lon:-110.9410,elev:779},KOKC:{lat:35.3931,lon:-97.6007,elev:398},
  KTUL:{lat:36.1984,lon:-95.8881,elev:202},KOMAHA:{lat:41.3032,lon:-95.8941,elev:299},
  // USA scenic
  ALPS:{lat:46.5,lon:7.9,elev:3600},
  EVEREST:{lat:27.9881,lon:86.925,elev:5300},GRANDCANYON:{lat:35.9524,lon:-112.147,elev:2000},
  // Mexico / Caribbean
  MMMX:{lat:19.4363,lon:-99.0721,elev:2237},MMGL:{lat:20.5218,lon:-103.3111,elev:1521},
  MMUN:{lat:21.0365,lon:-86.8771,elev:7},MMTY:{lat:25.7785,lon:-100.1066,elev:366},
  MYNN:{lat:25.0390,lon:-77.4662,elev:5},MBPV:{lat:21.7737,lon:-72.1887,elev:6},
  TJSJ:{lat:18.4394,lon:-66.0018,elev:9},MDSD:{lat:18.4297,lon:-69.6689,elev:17},
  // South America
  SBGR:{lat:-23.4356,lon:-46.4731,elev:750},SCEL:{lat:-33.3930,lon:-70.7858,elev:474},
  SKBO:{lat:4.7016,lon:-74.1469,elev:2549},SEQM:{lat:-0.1292,lon:-78.3576,elev:2400},
  SPJC:{lat:-12.0219,lon:-77.1143,elev:13},SAEZ:{lat:-34.8222,lon:-58.5358,elev:20},
  SBSP:{lat:-23.6261,lon:-46.6564,elev:802},SBPA:{lat:-29.9944,lon:-51.1714,elev:3},
  SBRJ:{lat:-22.9100,lon:-43.1631,elev:9},SBCF:{lat:-19.6244,lon:-43.9719,elev:827},
  // Europe — UK/Ireland
  EGLL:{lat:51.47,lon:-0.4543,elev:25},EGKK:{lat:51.1481,lon:-0.1903,elev:62},
  EGCC:{lat:53.3537,lon:-2.2750,elev:76},EGNX:{lat:52.8311,lon:-1.3281,elev:99},
  EGBB:{lat:52.4539,lon:-1.7480,elev:99},EGGD:{lat:51.3827,lon:-2.7191,elev:189},
  EGSS:{lat:51.8850,lon:0.2350,elev:103},EIDW:{lat:53.4213,lon:-6.2701,elev:74},
  // Europe — Western
  LFPG:{lat:48.9969,lon:2.5483,elev:119},LFPO:{lat:48.7233,lon:2.3794,elev:96},
  LSZH:{lat:47.4647,lon:8.5492,elev:432},LSGG:{lat:46.2381,lon:6.1089,elev:430},
  EHAM:{lat:52.3105,lon:4.7683,elev:-3},EBBR:{lat:50.9014,lon:4.4844,elev:56},
  EDDF:{lat:50.0264,lon:8.5431,elev:111},EDDM:{lat:48.3537,lon:11.7860,elev:448},
  EDDL:{lat:51.2895,lon:6.7668,elev:45},EDDB:{lat:52.3667,lon:13.5033,elev:37},
  LEMD:{lat:40.4936,lon:-3.5668,elev:610},LEBL:{lat:41.2971,lon:2.0785,elev:4},
  LIRF:{lat:41.8003,lon:12.2389,elev:14},LIML:{lat:45.4454,lon:9.2763,elev:107},
  LPPT:{lat:38.7756,lon:-9.1359,elev:113},LHBP:{lat:47.4369,lon:19.2556,elev:151},
  LOWW:{lat:48.1103,lon:16.5697,elev:183},LSZA:{lat:46.0044,lon:8.9109,elev:276},
  ESSA:{lat:59.6519,lon:17.9186,elev:42},ENGM:{lat:60.1939,lon:11.1004,elev:208},
  EKCH:{lat:55.6180,lon:12.6561,elev:17},EFHK:{lat:60.3172,lon:24.9633,elev:55},
  EPWA:{lat:52.1657,lon:20.9671,elev:110},LKPR:{lat:50.1008,lon:14.2600,elev:381},
  LYBE:{lat:44.8184,lon:20.3091,elev:99},LGAV:{lat:37.9364,lon:23.9445,elev:94},
  LTBA:{lat:40.9762,lon:28.8146,elev:157},LTFM:{lat:41.2753,lon:28.7519,elev:99},
  // Europe — Eastern / Russia
  UUEE:{lat:55.9736,lon:37.4125,elev:190},UUDD:{lat:55.4088,lon:37.9063,elev:178},
  UKBB:{lat:50.3450,lon:30.8947,elev:120},EVRA:{lat:56.9236,lon:23.9711,elev:10},
  EYVI:{lat:54.6341,lon:25.2858,elev:197},UMMS:{lat:53.8825,lon:28.0322,elev:204},
  LROP:{lat:44.5722,lon:26.1022,elev:95},LBSF:{lat:42.6967,lon:23.4114,elev:531},
  // Middle East / Africa
  OMDB:{lat:25.2532,lon:55.3657,elev:19},OMAA:{lat:24.4330,lon:54.6511,elev:27},
  OERK:{lat:24.9576,lon:46.6988,elev:620},OEJN:{lat:21.6796,lon:39.1565,elev:17},
  OTHH:{lat:25.2731,lon:51.6081,elev:13},OKBK:{lat:29.2267,lon:47.9689,elev:55},
  HECA:{lat:30.1219,lon:31.4056,elev:74},HAAB:{lat:8.9779,lon:38.7993,elev:2334},
  DNMM:{lat:6.5774,lon:3.3213,elev:38},FAOR:{lat:-26.1392,lon:28.2460,elev:1694},
  FACT:{lat:-33.9648,lon:18.6017,elev:46},FMMI:{lat:-18.7969,lon:47.4788,elev:1276},
  FCBB:{lat:-4.2517,lon:15.2531,elev:315},GOOG:{lat:14.7447,lon:-17.4902,elev:24},
  DTTA:{lat:36.8510,lon:10.2272,elev:6},GMME:{lat:34.0510,lon:-6.7517,elev:276},
  HKJK:{lat:-1.3192,lon:36.9275,elev:1624},HTDA:{lat:-6.8781,lon:39.2026,elev:55},
  // Asia — East
  RJTT:{lat:35.5494,lon:139.7798,elev:6},RJAA:{lat:35.7647,lon:140.3864,elev:41},
  RKSI:{lat:37.4602,lon:126.4407,elev:23},RKSS:{lat:37.5583,lon:126.7906,elev:18},
  ZSPD:{lat:31.1434,lon:121.8052,elev:4},ZBAA:{lat:40.0799,lon:116.5845,elev:35},
  ZGGG:{lat:23.3924,lon:113.2990,elev:15},VHHH:{lat:22.3080,lon:113.9185,elev:9},
  RCTP:{lat:25.0777,lon:121.2328,elev:33},WMKK:{lat:2.7456,lon:101.7099,elev:21},
  WSSS:{lat:1.3644,lon:103.9915,elev:7},VTBS:{lat:13.9132,lon:100.6070,elev:8},
  WIII:{lat:-6.1256,lon:106.6558,elev:8},RPLL:{lat:14.5086,lon:121.0197,elev:21},
  VOMM:{lat:12.9900,lon:80.1693,elev:16},VIDP:{lat:28.5665,lon:77.1031,elev:237},
  VABB:{lat:19.0896,lon:72.8656,elev:11},OMAB:{lat:24.2528,lon:54.6511,elev:27},
  // Asia — Central / South
  OAKB:{lat:34.5659,lon:69.2123,elev:1791},OPKC:{lat:24.9065,lon:67.1608,elev:22},
  VCBI:{lat:7.1808,lon:79.8841,elev:7},UAAA:{lat:43.3528,lon:77.0405,elev:647},
  UTDD:{lat:38.5433,lon:68.8247,elev:864},
  // Oceania / Pacific
  YSSY:{lat:-33.9399,lon:151.1753,elev:6},YMML:{lat:-37.6733,lon:144.8430,elev:131},
  YBBN:{lat:-27.3842,lon:153.1175,elev:5},YPPH:{lat:-31.9403,lon:115.9669,elev:15},
  NZAA:{lat:-37.0082,lon:174.7917,elev:7},NZWN:{lat:-41.3272,lon:174.8051,elev:12},
  NFFN:{lat:-17.7554,lon:177.4432,elev:5},NTAA:{lat:-17.5534,lon:-149.6062,elev:2},
  PGUM:{lat:13.4834,lon:144.7960,elev:91},PHNL:{lat:21.3245,lon:-157.9251,elev:4},
  // Scenic
  MATTERHORN:{lat:45.9763,lon:7.6586,elev:4300},FUJI:{lat:35.3606,lon:138.7274,elev:3700},
  YOSEMITE:{lat:37.7456,lon:-119.5936,elev:1200},ZION:{lat:37.2982,lon:-113.0263,elev:1300},
  MONUMENT:{lat:36.9980,lon:-110.0985,elev:1700},GEIRANGER:{lat:62.1049,lon:7.2058,elev:0},
  IGUAZU:{lat:-25.6958,lon:-54.4353,elev:185},VICTORIA:{lat:-17.9314,lon:25.8564,elev:1000},
  ANTARCTICAPEN:{lat:-63.4,lon:-57.0,elev:0},GREENLAND:{lat:72.0,lon:-40.0,elev:2000}
};
const RUNWAYS={
  // Canada — Ontario
  CYYZ:{hdg:60,len:3389,wid:61},CYTZ:{hdg:80,len:1216,wid:30},
  CYKF:{hdg:140,len:1524,wid:46},CYOO:{hdg:120,len:1768,wid:46},
  CYHM:{hdg:120,len:1798,wid:46},CYKZ:{hdg:150,len:914,wid:23},
  CYXU:{hdg:150,len:2744,wid:61},CYWG:{hdg:130,len:2743,wid:61},
  // Canada — Quebec
  CYUL:{hdg:64,len:3353,wid:61},CYMX:{hdg:60,len:3658,wid:61},
  CYHU:{hdg:150,len:1829,wid:46},CYQB:{hdg:240,len:2743,wid:61},
  CYSB:{hdg:40,len:2134,wid:46},
  // Canada — BC/West
  CYVR:{hdg:80,len:3600,wid:61},CYYJ:{hdg:88,len:1757,wid:45},
  CZBB:{hdg:120,len:1067,wid:23},CYCD:{hdg:160,len:1524,wid:30},
  CYXS:{hdg:150,len:2438,wid:46},CYXX:{hdg:70,len:2134,wid:46},
  // Canada — Alberta / Prairies
  CYYC:{hdg:170,len:3963,wid:61},CYBW:{hdg:160,len:1524,wid:30},
  CYEG:{hdg:20,len:3109,wid:61},CYXD:{hdg:160,len:1524,wid:30},
  CYXE:{hdg:90,len:2800,wid:60},CYQR:{hdg:80,len:2600,wid:60},
  CYBR:{hdg:80,len:2438,wid:61},
  // Canada — East / Maritimes
  CYOW:{hdg:79,len:2438,wid:61},CYYG:{hdg:30,len:1829,wid:46},
  CYHZ:{hdg:150,len:2347,wid:61},CYQM:{hdg:60,len:2438,wid:46},
  CYFC:{hdg:90,len:1980,wid:45},CYSJ:{hdg:140,len:1829,wid:46},
  CYYT:{hdg:110,len:2590,wid:61},CYGV:{hdg:90,len:1524,wid:30},
  // USA
  KJFK:{hdg:44,len:3400,wid:60},KLAX:{hdg:69,len:3685,wid:61},
  KORD:{hdg:100,len:3657,wid:61},KATL:{hdg:98,len:3624,wid:61},
  KDFW:{hdg:180,len:4085,wid:61},KDEN:{hdg:170,len:4877,wid:61},
  KSFO:{hdg:KS_RWY[0].hdg,len:KS_RWY[0].len,wid:61,des:KS_RWY[0].des,extras:KS_RWY.slice(1),custom:true},
  KLAS:{hdg:190,len:4423,wid:61},KMIA:{hdg:90,len:3962,wid:61},
  KSEA:{hdg:163,len:3627,wid:61},KPHX:{hdg:260,len:3459,wid:61},
  KIAH:{hdg:150,len:3963,wid:61},KEWR:{hdg:40,len:3353,wid:46},
  KMSP:{hdg:120,len:3353,wid:61},KDTW:{hdg:40,len:3524,wid:61},
  KBOS:{hdg:150,len:3048,wid:61},KPHL:{hdg:90,len:2896,wid:46},
  KLGA:{hdg:40,len:2134,wid:46},KDCA:{hdg:10,len:1587,wid:46},
  KSLC:{hdg:160,len:3657,wid:61},KFLL:{hdg:100,len:2743,wid:46},
  KMCO:{hdg:180,len:3659,wid:61},KSTL:{hdg:120,len:3353,wid:46},
  KCLT:{hdg:180,len:2743,wid:61},KSAN:{hdg:90,len:2865,wid:61},
  KTPA:{hdg:190,len:2987,wid:46},KPDX:{hdg:100,len:2835,wid:61},
  KMEM:{hdg:180,len:3048,wid:61},KBNA:{hdg:200,len:2286,wid:46},
  KAUS:{hdg:180,len:2743,wid:61},KMSY:{hdg:100,len:2743,wid:46},
  KRDU:{hdg:50,len:2743,wid:46},KRIC:{hdg:160,len:2133,wid:46},
  KCMH:{hdg:100,len:3049,wid:61},KIND:{hdg:50,len:2835,wid:46},
  KPIT:{hdg:280,len:3353,wid:61},KSDF:{hdg:170,len:3048,wid:61},
  KSNA:{hdg:200,len:1737,wid:46},KELP:{hdg:220,len:4267,wid:61},
  KABQ:{hdg:30,len:4207,wid:61},KTUS:{hdg:110,len:3292,wid:46},
  KOKC:{hdg:170,len:2743,wid:61},KTUL:{hdg:180,len:2896,wid:46},
  // USA — regional airports
  KBUF:{hdg:230,len:2134,wid:46},KSYR:{hdg:100,len:2286,wid:46},
  KALB:{hdg:190,len:2134,wid:46},KPVD:{hdg:50,len:2134,wid:46},
  KMHT:{hdg:170,len:2134,wid:46},KBGR:{hdg:150,len:3048,wid:61},
  KPWM:{hdg:180,len:1829,wid:46},KHPN:{hdg:160,len:1649,wid:46},
  KTEB:{hdg:190,len:1524,wid:30},KABE:{hdg:240,len:1798,wid:46},
  KAVP:{hdg:220,len:2134,wid:46},KISP:{hdg:100,len:2286,wid:46},
  KHVN:{hdg:20,len:1433,wid:46},
  KMDW:{hdg:130,len:1966,wid:46},KGRR:{hdg:260,len:2286,wid:46},
  KLAN:{hdg:100,len:1981,wid:46},KFTW:{hdg:170,len:1981,wid:46},
  KHOU:{hdg:130,len:2130,wid:46},KSAT:{hdg:120,len:2743,wid:46},
  KCOS:{hdg:170,len:2896,wid:46},KDSM:{hdg:130,len:2682,wid:46},
  KOMA:{hdg:140,len:2682,wid:46},KICT:{hdg:190,len:3048,wid:46},
  KMCI:{hdg:190,len:2987,wid:61},KLIT:{hdg:40,len:2134,wid:46},
  KBHM:{hdg:60,len:2590,wid:46},KMOB:{hdg:150,len:2591,wid:46},
  KJAN:{hdg:160,len:2590,wid:46},KCHA:{hdg:200,len:2134,wid:46},
  KTYS:{hdg:50,len:2560,wid:46},KAVL:{hdg:350,len:2159,wid:46},
  KMYR:{hdg:10,len:2286,wid:46},KCHS:{hdg:150,len:2134,wid:46},
  KSAV:{hdg:100,len:2896,wid:46},KJAX:{hdg:70,len:3048,wid:46},
  KPNS:{hdg:80,len:2316,wid:46},
  KBUR:{hdg:150,len:1887,wid:46},KLGB:{hdg:120,len:1830,wid:46},
  KONT:{hdg:80,len:3658,wid:46},KOAK:{hdg:270,len:3048,wid:61},
  KSJC:{hdg:300,len:3292,wid:61},KSMF:{hdg:200,len:2744,wid:46},
  KFAT:{hdg:290,len:2896,wid:46},KRNO:{hdg:160,len:3353,wid:61},
  KBOI:{hdg:280,len:3048,wid:46},KBZN:{hdg:120,len:2743,wid:46},
  KMSN:{hdg:180,len:2286,wid:46},KFSD:{hdg:210,len:2743,wid:46},
  PHKO:{hdg:170,len:2134,wid:46},PHOG:{hdg:20,len:2896,wid:46},
  PANC:{hdg:150,len:3353,wid:61},PAFA:{hdg:200,len:3204,wid:46},
  PAJN:{hdg:80,len:2134,wid:46},
  // Mexico / Caribbean
  MMMX:{hdg:230,len:4000,wid:61},MMGL:{hdg:280,len:4000,wid:61},
  MMUN:{hdg:120,len:3500,wid:61},MMTY:{hdg:160,len:3000,wid:45},
  MYNN:{hdg:150,len:2113,wid:46},TJSJ:{hdg:100,len:2887,wid:61},
  MDSD:{hdg:170,len:3220,wid:61},
  // South America
  SBGR:{hdg:97,len:3700,wid:61},SCEL:{hdg:170,len:3800,wid:61},
  SKBO:{hdg:140,len:3800,wid:61},SEQM:{hdg:360,len:3120,wid:61},
  SPJC:{hdg:150,len:3507,wid:61},SAEZ:{hdg:110,len:3300,wid:61},
  SBPA:{hdg:290,len:3200,wid:61},SBRJ:{hdg:20,len:1323,wid:46},
  SBSP:{hdg:180,len:1940,wid:45},SBCF:{hdg:160,len:3000,wid:61},
  // Europe
  EGLL:{hdg:270,len:3900,wid:60},EGKK:{hdg:260,len:3316,wid:46},
  EGCC:{hdg:230,len:3048,wid:61},EGNX:{hdg:270,len:2893,wid:46},
  EGBB:{hdg:150,len:2605,wid:46},EGGD:{hdg:270,len:2011,wid:46},
  EGSS:{hdg:220,len:3048,wid:46},EIDW:{hdg:100,len:2637,wid:61},
  LFPG:{hdg:270,len:3600,wid:60},LFPO:{hdg:260,len:2400,wid:46},
  LSZH:{hdg:156,len:3400,wid:60},LSGG:{hdg:230,len:3900,wid:61},
  EHAM:{hdg:183,len:3400,wid:60},EBBR:{hdg:70,len:3638,wid:61},
  EDDF:{hdg:250,len:4000,wid:61},EDDM:{hdg:260,len:4000,wid:61},
  EDDL:{hdg:230,len:3000,wid:61},EDDB:{hdg:70,len:3600,wid:61},
  LEMD:{hdg:180,len:4349,wid:61},LEBL:{hdg:200,len:3743,wid:61},
  LIRF:{hdg:160,len:3900,wid:61},LIML:{hdg:350,len:3000,wid:61},
  LPPT:{hdg:30,len:3805,wid:61},LHBP:{hdg:315,len:3707,wid:61},
  LOWW:{hdg:160,len:3600,wid:61},ESSA:{hdg:80,len:3301,wid:61},
  ENGM:{hdg:190,len:3600,wid:61},EKCH:{hdg:40,len:3300,wid:61},
  EFHK:{hdg:150,len:3200,wid:61},EPWA:{hdg:150,len:3690,wid:61},
  LKPR:{hdg:240,len:3715,wid:61},LYBE:{hdg:120,len:3400,wid:61},
  LGAV:{hdg:30,len:4000,wid:61},LTBA:{hdg:60,len:3000,wid:61},
  LTFM:{hdg:35,len:4100,wid:61},LSZA:{hdg:10,len:1240,wid:46},
  // Eastern Europe / Russia
  UUEE:{hdg:240,len:3700,wid:61},UUDD:{hdg:143,len:3793,wid:61},
  UKBB:{hdg:180,len:4000,wid:61},EVRA:{hdg:180,len:3200,wid:61},
  EYVI:{hdg:10,len:2516,wid:46},UMMS:{hdg:240,len:3650,wid:61},
  LROP:{hdg:80,len:3500,wid:61},LBSF:{hdg:270,len:3600,wid:61},
  // Middle East / Africa
  OMDB:{hdg:121,len:4000,wid:60},OMAA:{hdg:130,len:4100,wid:61},
  OERK:{hdg:155,len:4205,wid:61},OEJN:{hdg:160,len:3800,wid:61},
  OTHH:{hdg:160,len:4850,wid:61},OKBK:{hdg:150,len:3400,wid:61},
  HECA:{hdg:160,len:4000,wid:61},HAAB:{hdg:70,len:3800,wid:61},
  DNMM:{hdg:190,len:3900,wid:61},FAOR:{hdg:30,len:4418,wid:61},
  FACT:{hdg:20,len:3201,wid:61},FMMI:{hdg:120,len:3100,wid:61},
  FCBB:{hdg:60,len:4200,wid:61},HKJK:{hdg:60,len:4207,wid:61},
  HTDA:{hdg:30,len:3700,wid:61},DTTA:{hdg:280,len:3200,wid:61},
  GMME:{hdg:170,len:3700,wid:61},GOOG:{hdg:210,len:2700,wid:46},
  // Asia
  RJTT:{hdg:156,len:3000,wid:60},RJAA:{hdg:340,len:4000,wid:61},
  RKSI:{hdg:150,len:4000,wid:61},RKSS:{hdg:140,len:3200,wid:61},
  ZSPD:{hdg:170,len:4000,wid:61},ZBAA:{hdg:10,len:3800,wid:61},
  ZGGG:{hdg:20,len:3600,wid:61},VHHH:{hdg:70,len:3800,wid:61},
  RCTP:{hdg:60,len:3660,wid:61},WMKK:{hdg:150,len:4124,wid:61},
  WSSS:{hdg:20,len:4000,wid:61},VTBS:{hdg:200,len:4000,wid:61},
  WIII:{hdg:260,len:3600,wid:61},RPLL:{hdg:60,len:3737,wid:61},
  VOMM:{hdg:70,len:3658,wid:61},VIDP:{hdg:270,len:4430,wid:61},
  VABB:{hdg:90,len:3660,wid:61},OPKC:{hdg:70,len:3400,wid:61},
  VCBI:{hdg:40,len:3350,wid:61},OAKB:{hdg:290,len:3600,wid:61},
  UAAA:{hdg:50,len:4000,wid:61},
  // Oceania
  YSSY:{hdg:155,len:3960,wid:60},YMML:{hdg:160,len:3657,wid:61},
  YBBN:{hdg:10,len:3560,wid:61},YPPH:{hdg:210,len:3444,wid:61},
  NZAA:{hdg:50,len:3635,wid:61},NZWN:{hdg:160,len:1935,wid:46},
  NFFN:{hdg:20,len:3000,wid:46},PHNL:{hdg:80,len:3750,wid:61},
  PGUM:{hdg:60,len:3197,wid:61},
};
let runwayMesh=null, runwayY=0, runwayHdgDeg=0, runwayLenM=0, runwayWidM=0;

const WEATHER={
   clear:    {name:'CLEAR',      fogD:0.00008,fogC:[.18,.48,.88],sun:1.2,hemi:1.1,cloudB:1.0, cloudCount:0.6, rain:0, snow:0, wind:2,  gust:0.5,turb:0.15},
  cloudy:   {name:'CLOUDY',     fogD:0.00030,fogC:[.68,.72,.78],sun:0.45,hemi:0.85,cloudB:0.75,cloudCount:1.8, rain:0, snow:0, wind:6,  gust:1.5,turb:0.4},
  rain:     {name:'RAIN',       fogD:0.00070,fogC:[.55,.58,.62],sun:0.25,hemi:0.65,cloudB:0.55,cloudCount:2.2, rain:1, snow:0, wind:9,  gust:2.5,turb:0.6},
  storm:    {name:'STORM',      fogD:0.00120,fogC:[.32,.34,.40],sun:0.08,hemi:0.45,cloudB:0.35,cloudCount:2.6, rain:2, snow:0, wind:18, gust:5.5,turb:1.4},
  fog:      {name:'FOG',        fogD:0.00350,fogC:[.75,.78,.82],sun:0.20,hemi:0.55,cloudB:0.6, cloudCount:0.4, rain:0, snow:0, wind:3,  gust:0.8,turb:0.2},
  snow:     {name:'SNOW',       fogD:0.00090,fogC:[.82,.86,.92],sun:0.35,hemi:0.80,cloudB:0.7, cloudCount:1.6, rain:0, snow:1, wind:8,  gust:2.0,turb:0.5},
  windy:    {name:'CROSSWIND',  fogD:0.00018,fogC:[.88,.89,.91],sun:0.85,hemi:0.95,cloudB:0.9, cloudCount:1.0, rain:0, snow:0, wind:22, gust:6.0,turb:0.8},
  turbulent:{name:'TURBULENT',  fogD:0.00035,fogC:[.60,.68,.78],sun:0.55,hemi:0.80,cloudB:0.7, cloudCount:1.4, rain:0, snow:0, wind:14, gust:9.0,turb:2.2}
};
let currentWeather=WEATHER.clear;

let M_PER_DEG_LAT=111132,M_PER_DEG_LON=111320*Math.cos(47.4647*Math.PI/180);

const worldToLL=(x,z)=>({lat:CFG.origin.lat-z/M_PER_DEG_LAT,lon:CFG.origin.lon+x/M_PER_DEG_LON});
const llToWorld=(lat,lon)=>({x:(lon-CFG.origin.lon)*M_PER_DEG_LON,z:-(lat-CFG.origin.lat)*M_PER_DEG_LAT});
const CFG={origin:{lat:47.4647,lon:8.5492},terrainExtent:18000,terrainGrid:385,texSize:4096,
  maxImageryTiles:144,maxHeightTiles:16,heightZoom:13,rebuildDist:3000,tileTimeout:12000};
const lon2tx=(lon,z)=>(lon+180)/360*Math.pow(2,z);
const lat2ty=(lat,z)=>{const r=lat*Math.PI/180;return(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*Math.pow(2,z);};
const tx2lon=(x,z)=>x/Math.pow(2,z)*360-180;
const ty2lat=(y,z)=>{const n=Math.PI-2*Math.PI*y/Math.pow(2,z);return 180/Math.PI*Math.atan(.5*(Math.exp(n)-Math.exp(-n)));};
const tileRange=(nw,se,z)=>({x0:Math.floor(lon2tx(nw.lon,z)),x1:Math.floor(lon2tx(se.lon,z)),y0:Math.floor(lat2ty(nw.lat,z)),y1:Math.floor(lat2ty(se.lat,z))});

/* Regional imagery (Canada) */
let useCanadaImagery=false;
const CANADA_REGIONS=[{
  name:'SASKATCHEWAN',
  bounds:{minLat:49.0,maxLat:60.0,minLon:-110.0,maxLon:-101.0},
  layer:'Saskatchewan_Imagery',
  tileMatrixSet:'smerc',
  endpoint:'https://www.flysask2.ca/cubewerx/cubeserv',
  buildUrl(z,x,y){
    const p=new URLSearchParams({SERVICE:'WMTS',REQUEST:'GetTile',VERSION:'1.0.0',LAYER:this.layer,STYLE:'default',TILEMATRIXSET:this.tileMatrixSet,TILEMATRIX:z,TILEROW:y,TILECOL:x,FORMAT:'image/jpeg'});
    return this.endpoint+'?'+p.toString();
  }
}];
function getCanadaRegionForTile(z,x,y){
  if(!useCanadaImagery)return null;
  const lat=ty2lat(y+0.5,z),lon=tx2lon(x+0.5,z);
  for(const r of CANADA_REGIONS){
    const b=r.bounds;
    if(lat>=b.minLat&&lat<=b.maxLat&&lon>=b.minLon&&lon<=b.maxLon)return r;
  }
  return null;
}

const Imagery={mode:'esri',googleSession:null,googleKey:'',maxZoom:19,
  async init(key){
    this.mode='esri';this.maxZoom=19;this.googleSession=null;
    if(!key)return{ok:true,name:'ESRI'};
    try{
      const r=await fetchT(`https://tile.googleapis.com/v1/createSession?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mapType:'satellite',language:'en-US',region:'US'})},8000);
      const j=await r.json();
      if(j&&j.session){this.googleSession=j.session;this.googleKey=key;this.mode='google';this.maxZoom=Math.min(j.maxZoom||21,21);return{ok:true,name:'GOOGLE'};}
      throw new Error('no session');
    }catch(e){return{ok:false,name:'ESRI'};}
  },
  url(z,x,y){
    if(this.mode==='google')return `https://tile.googleapis.com/v1/2dtiles/${z}/${x}/${y}?session=${this.googleSession}&key=${this.googleKey}`;
    const ca=getCanadaRegionForTile(z,x,y);
    if(ca){ try{return ca.buildUrl(z,x,y);}catch(e){} }
    return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
  }
};
function fetchT(url,opts,ms){return Promise.race([fetch(url,opts),new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),ms))]);}
function withTimeout(p,ms,l){return Promise.race([p,new Promise((_,r)=>setTimeout(()=>r(new Error(l+' timeout')),ms))]);}

const imgCache=new Map(),imgPending=new Map();
const TILE_CONC=8;let tileActive=0;const tileQ=[];
function runTileQueue(){while(tileActive<TILE_CONC&&tileQ.length){const job=tileQ.shift();tileActive++;job(()=>{tileActive--;runTileQueue();});}}
function loadImage(key,url,offKey){
  if(imgCache.has(key))return Promise.resolve(imgCache.get(key));
  if(imgPending.has(key))return imgPending.get(key);
  const p=new Promise(resolve=>{
    tileQ.push(release=>{
      const img=new Image();img.crossOrigin='anonymous';let done=false;
      const fin=ok=>{if(done)return;done=true;imgPending.delete(key);release();
        if(ok){imgCache.set(key,img);if(imgCache.size>1000)imgCache.delete(imgCache.keys().next().value);resolve(img);}else resolve(null);};
      img.onload=()=>fin(true);img.onerror=()=>fin(false);
      setTimeout(()=>fin(false),CFG.tileTimeout);
      OFF.srcFor(offKey,url).then(s=>{img.addEventListener('loadend',()=>{if(s.startsWith('blob:'))URL.revokeObjectURL(s);},{once:true});img.src=s;});
    });
    runTileQueue();
  });
  imgPending.set(key,p);return p;
}
const hCache=new Map(),hPending=new Map();let heightZoom=CFG.heightZoom,heightBackupZoom=CFG.heightZoom;
let lastGoodH=0; // last elevation we actually resolved anywhere - never snap collision ground to sea level (0m) just because a tile hasn't streamed in yet
function loadHeightTile(z,x,y){
  const k=`${z}/${x}/${y}`;
  if(hCache.has(k))return Promise.resolve(hCache.get(k));
  if(hPending.has(k))return hPending.get(k);
  const p=new Promise(resolve=>{
    const img=new Image();img.crossOrigin='anonymous';let done=false;
    const fin=d=>{if(done)return;done=true;hCache.set(k,d);hPending.delete(k);resolve(d);};
    img.onload=()=>{try{const cv=document.createElement('canvas');cv.width=256;cv.height=256;
      const c=cv.getContext('2d');c.drawImage(img,0,0,256,256);fin(c.getImageData(0,0,256,256).data);}catch(e){fin(null);}};
    img.onerror=()=>fin(null);setTimeout(()=>fin(null),CFG.tileTimeout);
    OFF.srcFor(OFFMAP.elevKey(z,x,y),`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`).then(s=>{img.addEventListener('loadend',()=>{if(s.startsWith('blob:'))URL.revokeObjectURL(s);},{once:true});img.src=s;});
  });
  hPending.set(k,p);return p;
}
/* ===== OFFLINE MAP PRELOAD: saves the tiles the sim streams around the aircraft ===== */
const OFFMAP={
  IMG_ZOOMS:[12,13,14,15,16],ELEV_ZOOMS:[9,10,11,12,13],
  imgKey:(ca,z,x,y)=>`img/${ca?'ca':'ww'}/${z}/${x}/${y}`,
  elevKey:(z,x,y)=>`elev/${z}/${x}/${y}`,
  plan(center,radiusM){
    const nw=worldToLL(center.x-radiusM,center.z-radiusM),se=worldToLL(center.x+radiusM,center.z+radiusM);
    const out=[];
    for(const z of this.IMG_ZOOMS){
      const r=tileRange(nw,se,z);
      for(let x=r.x0;x<=r.x1;x++)for(let y=r.y0;y<=r.y1;y++){
        const ca=getCanadaRegionForTile(z,x,y);
        out.push({kind:'img',key:this.imgKey(!!ca,z,x,y),
          url:ca?ca.buildUrl(z,x,y):`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`});
      }
    }
    for(const z of this.ELEV_ZOOMS){
      const r=tileRange(nw,se,z);
      for(let x=r.x0;x<=r.x1;x++)for(let y=r.y0;y<=r.y1;y++)
        out.push({kind:'elev',key:this.elevKey(z,x,y),url:`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`});
    }
    return out;
  },
  estimateMB(plan){return Math.round((plan.filter(t=>t.kind==='img').length*22+plan.filter(t=>t.kind==='elev').length*10)/1024);}
};
async function offlineDownload(center,radiusM,onP){
  const libsNew=await OFF.downloadLibs();
  const plan=OFFMAP.plan(center,radiusM);
  const seen=new Set(),todo=[];
  for(const t of plan){if(seen.has(t.key))continue;seen.add(t.key);if(!OFF.has(t.key))todo.push(t);}
  let done=0,ok=0,fail=0,i=0;
  const worker=async()=>{
    while(i<todo.length){
      const t=todo[i++];
      try{const b=await OFF.fetchBlob(t.url);await OFF.put(t.key,b);ok++;}catch(e){fail++;}
      done++;if(onP&&(done%25===0||done===todo.length))onP(done,todo.length,fail);
    }
  };
  await Promise.all(Array.from({length:6},worker));
  return {total:seen.size,cached:seen.size-todo.length,stored:ok,failed:fail,libs:libsNew};
}
(function(){
  const b=document.createElement('button');
  b.textContent='⬇ OFFLINE MAPS';
  b.style.cssText='position:fixed;bottom:132px;left:14px;z-index:400;background:#08111f;color:#9cf;border:1px solid #1e4a7a;border-radius:8px;padding:5px 11px;font-size:11px;font-weight:700;cursor:pointer;';
  b.onclick=async()=>{
    const c={x:plane.pos.x,z:plane.pos.z},R=CFG.terrainExtent/2+2000;
    const plan=OFFMAP.plan(c,R);
    const fresh=plan.filter(t=>!OFF.has(t.key)).length;
    if(!confirm(`Save ${plan.length} map tiles (about ${OFFMAP.estimateMB(plan)} MB, ${fresh} not yet stored) around your position for offline use?`))return;
    b.disabled=true;
    const res=await offlineDownload(c,R,(d,n,f)=>{b.textContent=`⬇ ${d}/${n}${f?' ('+f+' failed)':''}`;});
    b.disabled=false;b.textContent='⬇ OFFLINE MAPS';
    showMsg(`Offline maps: ${res.stored} saved, ${res.cached} already stored${res.failed?', '+res.failed+' failed (no connection?)':''}`,4500);
  };
  document.body.appendChild(b);
  window.OfflineMaps={plan:OFFMAP.plan.bind(OFFMAP),download:offlineDownload,count:()=>OFF.count()};
})();
async function ensureHeightTiles(cx,cz){
  const E=CFG.terrainExtent,nw=worldToLL(cx-E/2,cz-E/2),se=worldToLL(cx+E/2,cz+E/2);
  let z=CFG.heightZoom,r;
  while(z>5){r=tileRange(nw,se,z);if((r.x1-r.x0+1)*(r.y1-r.y0+1)<=CFG.maxHeightTiles)break;z--;}
  heightZoom=z;const jobs=[];
  const hTotal=(r.x1-r.x0+1)*(r.y1-r.y0+1);let hDone=0;
  for(let tx=r.x0;tx<=r.x1;tx++)for(let ty=r.y0;ty<=r.y1;ty++)jobs.push(loadHeightTile(z,tx,ty).then(v=>{hDone++;lsProgress(0.3*hDone/hTotal,'Loading elevation '+hDone+' / '+hTotal);return v;}));
  /* Backup coverage: a much wider ring of coarser tiles so sampleH always has
     *something* real to fall back on. Without this, flying fast (or the terrain
     rebuild lagging behind) could push the plane outside the fine-detail tiles
     above before they've streamed in, sampleH would silently return sea level
     (0m), and the aircraft would appear to sink straight into the ground/imagery
     even though the visible terrain mesh was built from good data. */
  const bz=Math.max(5,z-4);heightBackupZoom=bz;
  const bE=E*3,bnw=worldToLL(cx-bE/2,cz-bE/2),bse=worldToLL(cx+bE/2,cz+bE/2),br=tileRange(bnw,bse,bz);
  for(let tx=br.x0;tx<=br.x1;tx++)for(let ty=br.y0;ty<=br.y1;ty++)jobs.push(loadHeightTile(bz,tx,ty).catch(()=>null));
  await Promise.all(jobs);
}
function decodeHTile(d,fx,fy,tx,ty){
  const px=(fx-tx)*256-.5,py=(fy-ty)*256-.5;
  const x0=Math.max(0,Math.min(255,Math.floor(px))),y0=Math.max(0,Math.min(255,Math.floor(py)));
  const x1=Math.min(255,x0+1),y1=Math.min(255,y0+1);
  const ax=Math.max(0,Math.min(1,px-x0)),ay=Math.max(0,Math.min(1,py-y0));
  const dec=i=>{const o=i*4;return(d[o]*256+d[o+1]+d[o+2]/256)-32768;};
  return(dec(y0*256+x0)*(1-ax)+dec(y0*256+x1)*ax)*(1-ay)+(dec(y1*256+x0)*(1-ax)+dec(y1*256+x1)*ax)*ay;
}
function sampleH(lat,lon){
  const z=heightZoom,fx=lon2tx(lon,z),fy=lat2ty(lat,z);
  const tx=Math.floor(fx),ty=Math.floor(fy),d=hCache.get(`${z}/${tx}/${ty}`);
  if(d){const h=decodeHTile(d,fx,fy,tx,ty);lastGoodH=h;return h;}
  // Primary tile not ready yet - fall back to the wider backup layer instead of
  // snapping straight to sea level (this is what used to look like "sinking into
  // the imagery": the visual mesh still showed real terrain while the collision
  // height briefly read 0).
  const bz=heightBackupZoom,bfx=lon2tx(lon,bz),bfy=lat2ty(lat,bz);
  const btx=Math.floor(bfx),bty=Math.floor(bfy),bd=hCache.get(`${bz}/${btx}/${bty}`);
  if(bd){const h=decodeHTile(bd,bfx,bfy,btx,bty);lastGoodH=h;return h;}
  return lastGoodH;
}
const sampleTerrain=(x,z)=>{const ll=worldToLL(x,z);return sampleH(ll.lat,ll.lon);};
/* airport plateau: shared by terrain mesh + collision so the ground you touch is the ground you see.
   local frame: lz along runway, lx toward terminal side (terminal/apron live on +lx). */
function airportBlend(x,z){
  if(!(runwayLenM>0))return null;
  const h=runwayHdgDeg*Math.PI/180;
  const lz=x*Math.sin(h)-z*Math.cos(h), lx=-(x*Math.cos(h)+z*Math.sin(h));
  const ex=Math.max(0,-(runwayWidM/2+200)-lx, lx-(runwayWidM/2+640));
  const ez=Math.max(0,Math.abs(lz)-(runwayLenM/2+130));
  let e=Math.hypot(ex,ez);
  /* multi-runway airports (KSFO): extra runway rectangles + circular apron/terminal zones also count as airport ground */
  const zs=window._rwZones;
  if(zs){for(let i=0;i<zs.length;i++){const q=zs[i];let d;
    if(q.r!==undefined)d=Math.max(0,Math.hypot(x-q.x,z-q.z)-q.r);
    else{const dx=x-q.x,dz=z-q.z,a=dx*q.ux+dz*q.uz,b=dx*q.uz-dz*q.ux;d=Math.hypot(Math.max(0,Math.abs(b)-q.hw),Math.max(0,Math.abs(a)-q.hl));}
    if(d<e)e=d;}}
  if(e>=500)return null;
  return {e,w:Math.max(0,Math.min(1,1-Math.max(0,e-60)/440))};
}
function sampleSurface(x,z){
  const ab=airportBlend(x,z);
  const th=sampleTerrain(x,z);
  if(ab){
    if(ab.e<=0)return runwayY;                       /* runway, taxiways, apron, terminal footprint */
    const flat=runwayY-.3*Math.min(1,ab.e/60);       /* ramps down to the mesh plateau level */
    return th*(1-ab.w)+flat*ab.w;
  }
  /* treat the global ocean plane as the floor wherever terrain dips below it (open water) so water landings can be detected */
  try{if(waterMesh && th<waterMesh.position.y)return waterMesh.position.y;}catch(e){}
  return th;
}

status('engine');
const canvas=document.getElementById('renderCanvas');
let engine=null;
const isTouchDev=('ontouchstart' in window||navigator.maxTouchPoints>0)&&Math.min(screen.width,screen.height)<900;
if(isTouchDev){CFG.texSize=2048;CFG.terrainGrid=161;}
const engOpts=[{stencil:true,antialias:true,powerPreference:'high-performance',failIfMajorPerformanceCaveat:false},{stencil:true,antialias:false,failIfMajorPerformanceCaveat:false},{stencil:false,antialias:false,failIfMajorPerformanceCaveat:false,preserveDrawingBuffer:false}];
for(const o of engOpts){try{engine=new BABYLON.Engine(canvas,o.antialias,o,true);if(engine)break;}catch(e){engine=null;}}
if(!engine){fatal('WebGL could not start. Fixes: enable hardware acceleration in your browser settings (Chrome: Settings > System), update your browser/GPU drivers, close other heavy tabs, or try another browser (Chrome/Edge/Safari). Test at get.webgl.org');return;}
engine.setHardwareScalingLevel(1/Math.min(window.devicePixelRatio||1,1.5));
const scene=new BABYLON.Scene(engine);
scene.clearColor=new BABYLON.Color4(.55,.72,.92,1);
scene.ambientColor=new BABYLON.Color3(.4,.46,.55);
scene.imageProcessingConfiguration.toneMappingEnabled=true;
scene.imageProcessingConfiguration.toneMappingType=BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
scene.imageProcessingConfiguration.exposure=1.18;
scene.imageProcessingConfiguration.contrast=1.08;
scene.fogMode=BABYLON.Scene.FOGMODE_EXP2;
scene.fogDensity=0.00013;
scene.fogColor=new BABYLON.Color3(.72,.82,.94);

const camera=new BABYLON.FreeCamera('cam',new BABYLON.Vector3(0,240,90),scene);
camera.minZ=.4;camera.maxZ=600000;camera.fov=.78;
camera.rotationQuaternion=BABYLON.Quaternion.Identity();
scene.activeCamera=camera;

try{
  const env=BABYLON.CubeTexture.CreateFromPrefilteredData('https://assets.babylonjs.com/environments/environmentSpecular.env',scene);
  env.onError=()=>{scene.environmentTexture=null;};
  scene.environmentTexture=env;scene.environmentIntensity=1.0;
}catch(e){}

status('sky');
let skybox=null,skyMat=null;
const sunIncl=.68,sunAzim=.32;
try{
  skybox=BABYLON.MeshBuilder.CreateBox('sky',{size:800000},scene);
  const sm=new BABYLON.SkyMaterial('skyM',scene);
  sm.backFaceCulling=false;sm.turbidity=18;sm.rayleigh=.18;sm.mieCoefficient=.03;sm.mieDirectionalG=.92;
  sm.mieDirectionalG=.85;sm.inclination=sunIncl;sm.azimuth=sunAzim;sm.luminance=1.0;
  skybox.material=sm;skyMat=sm;skybox.infiniteDistance=true;skybox.applyFog=false;skybox.isPickable=false;
}catch(e){}

const sunPos=new BABYLON.Vector3(Math.cos(sunIncl)*Math.sin(sunAzim),Math.sin(sunIncl),Math.cos(sunIncl)*Math.cos(sunAzim));
const sun=new BABYLON.DirectionalLight('sun',sunPos.scale(-1).normalize(),scene);
sun.intensity=3.6;sun.diffuse=new BABYLON.Color3(1,.96,.88);
sun.specular=new BABYLON.Color3(1,1,1);
sun.position=new BABYLON.Vector3(4000,8000,4000);
const hemi=new BABYLON.HemisphericLight('hemi',new BABYLON.Vector3(0,1,0),scene);
hemi.intensity=.75;hemi.diffuse=new BABYLON.Color3(.78,.86,1);
hemi.groundColor=new BABYLON.Color3(.38,.4,.34);

const fallback=BABYLON.MeshBuilder.CreateGround('fb',{width:120000,height:120000,subdivisions:8},scene);
const fbMat=new BABYLON.StandardMaterial('fbM',scene);
fbMat.diffuseColor=new BABYLON.Color3(.3,.4,.28);fbMat.specularColor=new BABYLON.Color3(0,0,0);
fallback.material=fbMat;fallback.position.y=-.5;

const TOD={noon:{el:1.05,sun:3.6,hemi:.75,fog:[.93,.94,.95],exp:1.18},morning:{el:.45,sun:3.0,hemi:.6,fog:[.8,.78,.78],exp:1.15},
  golden:{el:.14,sun:2.6,hemi:.45,fog:[.92,.7,.5],exp:1.2},dusk:{el:-.04,sun:.5,hemi:.25,fog:[.28,.22,.3],exp:1.3},night:{el:-.5,sun:0,hemi:.1,fog:[.02,.03,.06],exp:1.6}};
let currentTOD='noon';
function setTOD(name){currentTOD=name;applyEnvironment();}
function applyEnvironment(){
  const t=TOD[currentTOD]||TOD.noon,az=sunAzim;
  const wx=currentWeather;
  const dir=new BABYLON.Vector3(Math.cos(t.el)*Math.sin(az),Math.sin(t.el),Math.cos(t.el)*Math.cos(az));
  sun.direction=dir.scale(-1).normalize();
  sun.intensity=Math.max(0,t.sun)*wx.sun;
  hemi.intensity=t.hemi*wx.hemi;
  if(skyMat){skyMat.inclination=Math.max(-.5,.5-t.el/Math.PI);skyMat.luminance=currentTOD==='night'?.05:1;}
  scene.fogDensity=wx.fogD;
  scene.fogColor=new BABYLON.Color3(...wx.fogC);
  scene.clearColor=new BABYLON.Color4(wx.fogC[0],wx.fogC[1],wx.fogC[2],1);
  scene.imageProcessingConfiguration.exposure=t.exp;
  scene.environmentIntensity=currentTOD==='night'?.08:(currentTOD==='dusk'?.3:1);
  nightMode=(currentTOD==='night'||currentTOD==='dusk');
}
let nightMode=false;

const M={};
M.body=new BABYLON.PBRMaterial('bodyM',scene);
M.body.albedoColor=new BABYLON.Color3(.96,.97,.99);
M.body.metallic=.08;M.body.roughness=.3;
M.body.clearCoat.isEnabled=true;M.body.clearCoat.intensity=.72;M.body.clearCoat.roughness=.09;
M.accent=new BABYLON.PBRMaterial('accentM',scene);
M.accent.albedoColor=new BABYLON.Color3(.04,.14,.4);
M.accent.metallic=.08;M.accent.roughness=.32;
M.accent.clearCoat.isEnabled=true;M.accent.clearCoat.intensity=.65;M.accent.clearCoat.roughness=.12;
M.wing=M.body.clone('wingM');
M.wing.albedoColor=new BABYLON.Color3(.72,.74,.77);
M.wing.metallic=.1;M.wing.roughness=.42;
M.wing.clearCoat.intensity=.35;M.wing.clearCoat.roughness=.2;
M.dark=new BABYLON.PBRMaterial('darkM',scene);
M.dark.albedoColor=new BABYLON.Color3(.04,.045,.055);
M.dark.metallic=.5;M.dark.roughness=.5;
M.glass=new BABYLON.PBRMaterial('glassM',scene);
M.glass.albedoColor=new BABYLON.Color3(.07,.12,.15);
M.glass.metallic=.2;M.glass.roughness=.06;M.glass.alpha=.05;M.glass.environmentIntensity=.1;
M.glass.transparencyMode=BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
M.glass.backFaceCulling=false;
M.glass.clearCoat.isEnabled=true;M.glass.clearCoat.intensity=1;M.glass.clearCoat.roughness=.03;
M.metal=new BABYLON.PBRMaterial('metalM',scene);
M.metal.albedoColor=new BABYLON.Color3(.72,.74,.78);
M.metal.metallic=.95;M.metal.roughness=.24;
M.tire=new BABYLON.PBRMaterial('tireM',scene);
M.tire.albedoColor=new BABYLON.Color3(.05,.05,.06);
M.tire.metallic=0;M.tire.roughness=.92;
M.red=new BABYLON.PBRMaterial('redM',scene);
M.red.albedoColor=new BABYLON.Color3(.85,.08,.08);
M.red.emissiveColor=new BABYLON.Color3(.9,.1,.05);M.red.metallic=.2;
M.green=new BABYLON.PBRMaterial('greenM',scene);
M.green.albedoColor=new BABYLON.Color3(.1,.85,.2);
M.green.emissiveColor=new BABYLON.Color3(.1,.9,.2);
M.white=new BABYLON.PBRMaterial('whiteM',scene);
M.white.albedoColor=new BABYLON.Color3(1,1,1);
M.white.emissiveColor=new BABYLON.Color3(1,1,1);
M.intake=new BABYLON.PBRMaterial('intakeM',scene);
M.intake.albedoColor=new BABYLON.Color3(.42,.42,.44);
M.intake.metallic=.9;M.intake.roughness=.14;
M.cockpitBody=new BABYLON.PBRMaterial('cockpitBodyM',scene);
M.cockpitBody.albedoColor=new BABYLON.Color3(.5,.52,.56);M.cockpitBody.emissiveColor=new BABYLON.Color3(.03,.032,.036);
M.cockpitBody.metallic=.15;M.cockpitBody.roughness=.75;
M.cockpitPanel=new BABYLON.PBRMaterial('cockpitPanelM',scene);
M.cockpitPanel.albedoColor=new BABYLON.Color3(.14,.15,.17);
M.cockpitPanel.metallic=.2;M.cockpitPanel.roughness=.55;
M.cockpitPanel.clearCoat.isEnabled=true;M.cockpitPanel.clearCoat.intensity=.4;M.cockpitPanel.clearCoat.roughness=.25;
M.bezel=new BABYLON.PBRMaterial('bezelM',scene);
M.bezel.albedoColor=new BABYLON.Color3(.02,.02,.02);
M.bezel.metallic=.1;M.bezel.roughness=.9;
M.seat=new BABYLON.PBRMaterial('seatM',scene);
M.seat.albedoColor=new BABYLON.Color3(.13,.13,.15);
M.seat.metallic=.05;M.seat.roughness=.95;
M.fireHandle=new BABYLON.PBRMaterial('fireHandleM',scene);
M.fireHandle.albedoColor=new BABYLON.Color3(.75,.1,.08);
M.fireHandle.metallic=.3;M.fireHandle.roughness=.5;
M.fireHandle.emissiveColor=new BABYLON.Color3(.15,0,0);
M.throttleKnob=new BABYLON.PBRMaterial('thrKnobM',scene);
M.throttleKnob.albedoColor=new BABYLON.Color3(.85,.1,.1);
M.throttleKnob.metallic=.3;M.throttleKnob.roughness=.45;
M.rubber=new BABYLON.PBRMaterial('rubberM',scene);
M.rubber.albedoColor=new BABYLON.Color3(.06,.06,.07);
M.rubber.metallic=0;M.rubber.roughness=1;
M.reverser=new BABYLON.PBRMaterial('revM',scene);
M.reverser.albedoColor=new BABYLON.Color3(.55,.55,.58);
M.reverser.metallic=.85;M.reverser.roughness=.35;
try{M.body.clearCoat.isEnabled=true;M.body.clearCoat.intensity=.72;M.body.clearCoat.roughness=.09;}catch(e){}

const aircraftRoot=new BABYLON.TransformNode('acRoot',scene);
aircraftRoot.rotationQuaternion=BABYLON.Quaternion.Identity();
const exteriorRoot=new BABYLON.TransformNode('extRoot',scene);
exteriorRoot.parent=aircraftRoot;
const interiorRoot=new BABYLON.TransformNode('intRoot',scene);
interiorRoot.parent=aircraftRoot;

status('aircraft');
function airfoil(n,t,c,ch){
  const up=[],lo=[];
  for(let i=0;i<=n;i++){
    const tt=i/n,x=.5*(1-Math.cos(Math.PI*tt));
    const yt=5*t*(.2969*Math.sqrt(x)-.126*x-.3516*x*x+.2843*x*x*x-.1036*x*x*x*x);
    const yc=c*Math.sin(Math.PI*Math.pow(x,.85));
    up.push([x*ch,(yc+yt)*ch]);lo.push([x*ch,(yc-yt)*ch]);
  }
  const loop=[];for(let i=0;i<=n;i++)loop.push(up[i]);
  for(let i=n-1;i>=1;i--)loop.push(lo[i]);return loop;
}
function horiz(name,st,mat,par){
  const secs=st.map(s=>{const p=airfoil(14,s.t,.02,s.c);return p.map(([cx,cy])=>new BABYLON.Vector3(s.s,s.y+cy,s.zLE-cx));});
  const m=BABYLON.MeshBuilder.CreateRibbon(name,{pathArray:secs,closePath:true,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
  m.material=mat;m.isPickable=false;m.parent=par||exteriorRoot;return m;
}
function vert(name,st,mat,par){
  const secs=st.map(s=>{const p=airfoil(14,s.t,0,s.c);return p.map(([cx,cy])=>new BABYLON.Vector3(cy,s.s,s.zLE-cx));});
  const m=BABYLON.MeshBuilder.CreateRibbon(name,{pathArray:secs,closePath:true,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
  m.material=mat;m.isPickable=false;m.parent=par||exteriorRoot;return m;
}
function tubeSmooth(name,st,mat,par){
  const P=48,secs=st.map(s=>{
    const r=[];for(let i=0;i<P;i++){const a=(i/P)*Math.PI*2;
      let yy=Math.sin(a)*s.r*s.h;const cosv=Math.cos(a);let xx=cosv*s.r*s.w;
      if(yy<0)yy*=1-s.flat*Math.abs(cosv);
      r.push(new BABYLON.Vector3(xx,yy+s.yo,s.z));}
    return r;});
  const m=BABYLON.MeshBuilder.CreateRibbon(name,{pathArray:secs,closePath:true,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
  m.material=mat;m.isPickable=false;m.parent=par||exteriorRoot;return m;
}

const fuselage=tubeSmooth('fuselage',[
  {z:18.0,r:.15,w:1,h:1.0,yo:.02,flat:.2},{z:17.0,r:.75,w:1,h:1.05,yo:-.02,flat:.15},
  {z:16.0,r:1.15,w:1,h:1.08,yo:-.05,flat:.15},{z:14.5,r:1.60,w:1,h:1.10,yo:-.10,flat:.15},
  {z:12.0,r:1.85,w:1,h:1.10,yo:-.10,flat:.15},{z:9.0,r:1.95,w:1,h:1.08,yo:-.05,flat:.12},
  {z:5.0,r:1.98,w:1,h:1.06,yo:0,flat:.1},{z:0,r:1.98,w:1,h:1.05,yo:0,flat:.1},
  {z:-5.0,r:1.95,w:1,h:1.05,yo:0,flat:.12},{z:-10.0,r:1.80,w:1,h:1.08,yo:.05,flat:.15},
  {z:-13.0,r:1.45,w:1,h:1.12,yo:.10,flat:.15},{z:-15.0,r:1.05,w:1,h:1.20,yo:.20,flat:.15},
  {z:-16.5,r:.65,w:1,h:1.35,yo:.35,flat:.1},{z:-17.5,r:.30,w:1,h:1.55,yo:.45,flat:.1},
  {z:-18.2,r:.08,w:1,h:1.7,yo:.5,flat:.1}
],M.body);

const cpGlass=BABYLON.MeshBuilder.CreateBox('cpGlass',{width:1.65,height:.55,depth:1.3},scene);
cpGlass.material=M.dark;cpGlass.position.set(0,.55,16.6);cpGlass.parent=exteriorRoot;

for(let zi=-11;zi<=11;zi+=1.4){
  for(const sgn of [1,-1]){
    const w=BABYLON.MeshBuilder.CreateBox('cw'+zi+sgn,{width:.04,height:.32,depth:.5},scene);
    w.material=M.dark;w.position.set(sgn*1.97,.45,zi);w.parent=exteriorRoot;
  }
}
for(const sgn of [1,-1]){
  const s=BABYLON.MeshBuilder.CreateBox('stripe'+sgn,{width:.06,height:.26,depth:22},scene);
  s.material=M.accent;s.position.set(sgn*1.99,.28,3);s.parent=exteriorRoot;
}
const wingStations=[
  {s:2.0,c:5.4,t:.15,zLE:1.6,y:-.05},{s:3.6,c:4.8,t:.14,zLE:1.2,y:.18},
  {s:6.6,c:3.6,t:.13,zLE:.3,y:.68},{s:9.6,c:2.4,t:.11,zLE:-.65,y:1.15},
  {s:12.6,c:1.55,t:.10,zLE:-1.65,y:1.55},{s:15.2,c:.95,t:.09,zLE:-2.5,y:1.85},
  {s:16.5,c:.22,t:.08,zLE:-3.0,y:2.0}
];
horiz('wingR',wingStations,M.wing);
horiz('wingL',wingStations.map(s=>({...s,s:-s.s})),M.wing);
for(const sgn of [1,-1]){
  const wl=vert('wl'+sgn,[{s:0,c:.9,t:.10,zLE:-3.0},{s:.55,c:.7,t:.09,zLE:-3.2},{s:1.05,c:.3,t:.08,zLE:-3.5}],M.accent);
  wl.position.set(sgn*16.5,2.0,0);
}
const hsSt=[
  {s:.55,c:2.5,t:.12,zLE:-14.6,y:.62},{s:2.1,c:2.1,t:.11,zLE:-15.1,y:.95},
  {s:3.7,c:1.55,t:.10,zLE:-15.6,y:1.2},{s:4.9,c:.9,t:.09,zLE:-16.1,y:1.42},
  {s:5.6,c:.22,t:.08,zLE:-16.5,y:1.55}
];
horiz('hsR',hsSt,M.wing);
horiz('hsL',hsSt.map(s=>({...s,s:-s.s})),M.wing);
const fin=vert('fin',[
  {s:1.1,c:5.2,t:.14,zLE:-14.0},{s:2.6,c:4.5,t:.13,zLE:-14.4},
  {s:4.3,c:3.5,t:.11,zLE:-15.0},{s:5.8,c:2.5,t:.10,zLE:-15.8},
  {s:6.9,c:1.5,t:.09,zLE:-16.7},{s:7.6,c:.4,t:.08,zLE:-17.5}
],M.accent);

const fanBlades=[];
const reverserDoors=[];
const engineEmitNodes={};
for(const sgn of [1,-1]){
  const nacStations=[];
  for(let z=0;z<=4;z+=.25){
    const t=z/4;const r=1.05-0.05*t;const w=r*1.15;const h=r;
    nacStations.push({z:t*5.2-2.6,y:-.05*t,w:w,h:h,flat:.25});
  }
  const stations=nacStations.map(s=>({z:s.z,r:s.h,w:s.w/s.h,h:1,yo:s.y,flat:s.flat}));
  const nac=tubeSmooth('nac'+sgn,stations.map(s=>({...s,r:1.1*(1+.05*Math.abs(s.z))})),M.body);
  nac.position.set(sgn*6.3,-.85,0);
  nac.scaling.set(1.1,.95,.85);

  const lip=BABYLON.MeshBuilder.CreateTorus('lip'+sgn,{diameter:2.4,thickness:.14,tessellation:32},scene);
  lip.rotation.x=Math.PI/2;lip.position.set(sgn*6.3,-.85,2.75);
  lip.material=M.metal;lip.parent=exteriorRoot;
  for(const z of [-1.65,1.55]){
    const band=BABYLON.MeshBuilder.CreateTorus('nacBand'+sgn+'_'+z,{diameter:2.43,thickness:.035,tessellation:32},scene);
    band.position.set(sgn*6.3,-.85,z);band.material=M.accent;band.parent=exteriorRoot;band.isPickable=false;
  }

  const blades=BABYLON.MeshBuilder.CreateCylinder('fan'+sgn,{height:.08,diameter:2.1,tessellation:32},scene);
  blades.rotation.x=Math.PI/2;blades.position.set(sgn*6.3,-.85,2.6);
  blades.material=M.intake;blades.parent=exteriorRoot;
  fanBlades.push({mesh:blades,sgn});

  const spinner=BABYLON.MeshBuilder.CreateCylinder('spin'+sgn,{height:.35,diameterBottom:.5,diameterTop:.1,tessellation:16},scene);
  spinner.rotation.x=-Math.PI/2;spinner.position.set(sgn*6.3,-.85,2.85);
  spinner.material=M.metal;spinner.parent=exteriorRoot;

  const exh=BABYLON.MeshBuilder.CreateCylinder('exh'+sgn,{height:1.3,diameterTop:1.35,diameterBottom:1.5,tessellation:24},scene);
  exh.rotation.x=Math.PI/2;exh.position.set(sgn*6.3,-.85,-2.0);
  exh.material=M.dark;exh.parent=exteriorRoot;
  const exhCone=BABYLON.MeshBuilder.CreateCylinder('exhC'+sgn,{height:.5,diameterTop:.9,diameterBottom:1.1,tessellation:24},scene);
  exhCone.rotation.x=Math.PI/2;exhCone.position.set(sgn*6.3,-.85,-2.6);
  exhCone.material=M.metal;exhCone.parent=exteriorRoot;

  const revPivot=new BABYLON.TransformNode('revPv'+sgn,scene);
  revPivot.parent=exteriorRoot;
  revPivot.position.set(sgn*6.3,-.85,-.3);
  const revDoor=BABYLON.MeshBuilder.CreateCylinder('revD'+sgn,{height:1.6,diameter:2.15,tessellation:24},scene);
  revDoor.rotation.x=Math.PI/2;revDoor.material=M.reverser;revDoor.parent=revPivot;
  revDoor.position.set(0,0,0);
  reverserDoors.push({pivot:revPivot,sgn,mesh:revDoor});

  const pylon=BABYLON.MeshBuilder.CreateBox('pyl'+sgn,{width:.55,height:.9,depth:2.6},scene);
  pylon.position.set(sgn*6.3,.05,.4);pylon.material=M.body;pylon.parent=exteriorRoot;

  /* Fire + smoke emitter node (per engine) */
  const emNode=new BABYLON.TransformNode('fireEm'+sgn,scene);
  emNode.parent=exteriorRoot;
  emNode.position.set(sgn*6.3, -0.4, -0.5);
  engineEmitNodes[sgn>0?'R':'L']=emNode;
}

const SURF={flapPivots:{},ailPivots:{},elevPivots:{},spoilerPivots:{},rudPivot:null};
for(const sgn of [1,-1]){
  const key=sgn>0?'R':'L';
  const pivot=new BABYLON.TransformNode('flapPv'+key,scene);
  pivot.parent=exteriorRoot;pivot.position.set(sgn*10.5,.4,-.4);
  horiz('flap'+key,[{s:0,c:1.7,t:.11,zLE:0,y:0},{s:2,c:1.6,t:.10,zLE:0,y:0},
    {s:3.5,c:1.4,t:.09,zLE:0,y:0},{s:4.5,c:.4,t:.08,zLE:0,y:0}],M.wing,pivot);
  SURF.flapPivots[key]=pivot;
}
for(const sgn of [1,-1]){
  const key=sgn>0?'R':'L';
  const pivot=new BABYLON.TransformNode('ailPv'+key,scene);
  pivot.parent=exteriorRoot;pivot.position.set(sgn*13.8,1.5,-1.6);
  horiz('ail'+key,[{s:0,c:1.4,t:.10,zLE:0,y:0},{s:1,c:1.1,t:.09,zLE:0,y:0},
    {s:2.2,c:.65,t:.08,zLE:0,y:0},{s:2.7,c:.2,t:.08,zLE:0,y:0}],M.wing,pivot);
  SURF.ailPivots[key]=pivot;
}
for(const sgn of [1,-1]){
  const key=sgn>0?'R':'L';
  const pivot=new BABYLON.TransformNode('elevPv'+key,scene);
  pivot.parent=exteriorRoot;pivot.position.set(sgn*3.0,1.35,-16.6);
  horiz('elev'+key,[{s:0,c:1.1,t:.10,zLE:0,y:0},{s:1,c:1.0,t:.09,zLE:0,y:0},
    {s:2.4,c:.65,t:.08,zLE:0,y:0},{s:3.0,c:.25,t:.08,zLE:0,y:0}],M.wing,pivot);
  SURF.elevPivots[key]=pivot;
}
{
  const pivot=new BABYLON.TransformNode('rudPv',scene);
  pivot.parent=exteriorRoot;pivot.position.set(0,3.6,-17.0);
  vert('rud',[{s:0,c:2.0,t:.11,zLE:0},{s:1.5,c:1.75,t:.10,zLE:0},
    {s:3.0,c:1.2,t:.09,zLE:0},{s:4.0,c:.32,t:.08,zLE:0}],M.accent,pivot);
  SURF.rudPivot=pivot;
}
for(const sgn of [1,-1]){
  for(let i=0;i<3;i++){
    const key=(sgn>0?'R':'L')+i;
    const pivot=new BABYLON.TransformNode('splPv'+key,scene);
    pivot.parent=exteriorRoot;pivot.position.set(sgn*(7+i*2.6),.6+i*.15,-.5);
    const sp=BABYLON.MeshBuilder.CreateBox('spl'+key,{width:2.2,height:.06,depth:1.3},scene);
    sp.material=M.dark;sp.parent=pivot;sp.position.set(0,0,-.65);
    SURF.spoilerPivots[key]=pivot;
  }
}

const gearPivots={};
const gearInitialY={};
function mk_wheel(n,par,x,y,z,r){
  const w=BABYLON.MeshBuilder.CreateCylinder(n,{height:.35,diameter:r*2,tessellation:16},scene);
  w.rotation.z=Math.PI/2;w.position.set(x,y,z);w.material=M.tire;w.parent=par;return w;
}
{
  const p=new BABYLON.TransformNode('nosePv',scene);p.parent=exteriorRoot;p.position.set(0,-1.2,14.0);
  const strut=BABYLON.MeshBuilder.CreateCylinder('nStrut',{height:2.0,diameter:.28,tessellation:12},scene);
  strut.material=M.metal;strut.position.y=-1.0;strut.parent=p;
  mk_wheel('nW1',p,-.4,-1.9,0,.52);mk_wheel('nW2',p,.4,-1.9,0,.52);
  gearPivots.nose=p;gearInitialY.nose=p.position.y;
}
for(const sgn of [1,-1]){
  const key=sgn>0?'R':'L';
  const p=new BABYLON.TransformNode('mPv'+key,scene);p.parent=exteriorRoot;p.position.set(sgn*3.5,-1.25,-1.5);
  const strut=BABYLON.MeshBuilder.CreateCylinder('mStrut'+key,{height:2.2,diameter:.35,tessellation:12},scene);
  strut.material=M.metal;strut.position.y=-1.1;strut.parent=p;
  mk_wheel('mW'+key+'1',p,-.55,-2.1,0,.58);mk_wheel('mW'+key+'2',p,.55,-2.1,0,.58);
  gearPivots[key]=p;gearInitialY[key]=p.position.y;
}

const beacon=BABYLON.MeshBuilder.CreateSphere('bc',{diameter:.22},scene);
beacon.material=M.red;beacon.position.set(0,1.15,-5);beacon.parent=exteriorRoot;
const strobeL=BABYLON.MeshBuilder.CreateSphere('stL',{diameter:.18},scene);
strobeL.material=M.white;strobeL.position.set(-16.5,2.0,-2.8);strobeL.parent=exteriorRoot;
const strobeR=strobeL.clone('stR');strobeR.position.x=16.5;strobeR.parent=exteriorRoot;
const navL=BABYLON.MeshBuilder.CreateSphere('nvL',{diameter:.16},scene);
navL.material=M.red;navL.position.set(-16.7,1.9,-2.95);navL.parent=exteriorRoot;
const navR=navL.clone('nvR');navR.material=M.green;navR.position.x=16.7;navR.parent=exteriorRoot;

/* ========== FIRE + SMOKE + SPARKS PARTICLE SYSTEMS ========== */
const firePS={}, smokePS={}, emberPS={};let cockpitSmokePS=null;
let sparksPS=null;
let splashPS=null,splashMistPS=null;

function setupFireAndSmoke(){
  const mkTex=(nm,draw)=>{const t=new BABYLON.DynamicTexture(nm,{width:128,height:128},scene,true);draw(t.getContext());t.hasAlpha=true;t.update(false);return t;};
  const fireTex=mkTex('fireT',c=>{c.clearRect(0,0,128,128);const g=c.createRadialGradient(64,70,2,64,64,62);g.addColorStop(0,'rgba(255,255,230,1)');g.addColorStop(.25,'rgba(255,210,90,.95)');g.addColorStop(.55,'rgba(255,100,20,.55)');g.addColorStop(1,'rgba(200,30,0,0)');c.fillStyle=g;c.fillRect(0,0,128,128);});
  const smokeTex=mkTex('smokeT',c=>{c.clearRect(0,0,128,128);for(let i=0;i<9;i++){const x=64+(Math.random()-.5)*44,y=64+(Math.random()-.5)*44,r=26+Math.random()*22,g=c.createRadialGradient(x,y,2,x,y,r);g.addColorStop(0,'rgba(255,255,255,.5)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,128,128);}});
  const emberTex=mkTex('emberT',c=>{c.clearRect(0,0,128,128);const g=c.createRadialGradient(64,64,0,64,64,60);g.addColorStop(0,'rgba(255,255,200,1)');g.addColorStop(.3,'rgba(255,160,40,.9)');g.addColorStop(1,'rgba(255,80,0,0)');c.fillStyle=g;c.fillRect(0,0,128,128);});
  window._smokeTex=smokeTex;
  window._fireTex=fireTex;
  const flareURL='https://assets.babylonjs.com/textures/flare.png';
  for(const key of ['L','R']){
    const emNode=engineEmitNodes[key];

    /* Fire */
    const f=new BABYLON.ParticleSystem('fire_'+key,600,scene);
    f.particleTexture=fireTex;
    f.emitter=emNode;
    f.minEmitBox=new BABYLON.Vector3(-.7,-.3,-1.2);
    f.maxEmitBox=new BABYLON.Vector3(.7,.3,1.2);
    f.color1=new BABYLON.Color4(1,.85,.3,1);
    f.color2=new BABYLON.Color4(1,.35,.05,1);
    f.colorDead=new BABYLON.Color4(.4,.05,0,0);
    f.minSize=.5;f.maxSize=1.8;
    f.minLifeTime=.12;f.maxLifeTime=.45;
    f.emitRate=350;
    f.blendMode=BABYLON.ParticleSystem.BLENDMODE_ADD;
    f.gravity=new BABYLON.Vector3(0,10,0);
    f.direction1=new BABYLON.Vector3(-2,4,-2);
    f.direction2=new BABYLON.Vector3(2,10,2);
    f.minEmitPower=1.5;f.maxEmitPower=4;
    f.updateSpeed=.015;f.minInitialRotation=0;f.maxInitialRotation=6.28;f.minAngularSpeed=-2;f.maxAngularSpeed=2;
    f.addColorGradient(0,new BABYLON.Color4(1,.95,.6,0));f.addColorGradient(.12,new BABYLON.Color4(1,.85,.35,.95));f.addColorGradient(.5,new BABYLON.Color4(1,.4,.06,.7));f.addColorGradient(1,new BABYLON.Color4(.35,.05,0,0));
    f.addSizeGradient(0,.5);f.addSizeGradient(.3,1.4);f.addSizeGradient(1,.25);
    f.start();f.stop();
    const em=new BABYLON.ParticleSystem('ember_'+key,200,scene);em.particleTexture=emberTex;em.emitter=emNode;
    em.minEmitBox=new BABYLON.Vector3(-.6,-.2,-1);em.maxEmitBox=new BABYLON.Vector3(.6,.2,1);
    em.color1=new BABYLON.Color4(1,.8,.3,1);em.color2=new BABYLON.Color4(1,.4,.05,1);em.colorDead=new BABYLON.Color4(.3,.05,0,0);
    em.minSize=.08;em.maxSize=.28;em.minLifeTime=.8;em.maxLifeTime=1.8;em.emitRate=60;em.blendMode=BABYLON.ParticleSystem.BLENDMODE_ADD;
    em.gravity=new BABYLON.Vector3(0,-3,0);em.direction1=new BABYLON.Vector3(-6,2,-6);em.direction2=new BABYLON.Vector3(6,8,6);em.minEmitPower=2;em.maxEmitPower=6;
    em.start();em.stop();emberPS[key]=em;
    firePS[key]=f;

    /* Smoke */
    const s=new BABYLON.ParticleSystem('smoke_'+key,700,scene);
    s.particleTexture=smokeTex;
    s.emitter=emNode;
    s.minEmitBox=new BABYLON.Vector3(-.6,-.3,-1);
    s.maxEmitBox=new BABYLON.Vector3(.6,.3,1);
    s.color1=new BABYLON.Color4(.12,.12,.12,.85);
    s.color2=new BABYLON.Color4(.25,.22,.2,.65);
    s.colorDead=new BABYLON.Color4(.35,.35,.35,0);
    s.minSize=1.8;s.maxSize=4.5;
    s.minLifeTime=1.8;s.maxLifeTime=3.8;
    s.emitRate=180;
    s.blendMode=BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    s.gravity=new BABYLON.Vector3(0,3.5,0);
    s.direction1=new BABYLON.Vector3(-1,2,-1);
    s.direction2=new BABYLON.Vector3(1,5,1);
    s.minEmitPower=1;s.maxEmitPower=2.5;s.minInitialRotation=0;s.maxInitialRotation=6.28;s.minAngularSpeed=-.6;s.maxAngularSpeed=.6;
    s.addColorGradient(0,new BABYLON.Color4(.08,.08,.08,0));s.addColorGradient(.1,new BABYLON.Color4(.12,.11,.1,.75));s.addColorGradient(.5,new BABYLON.Color4(.28,.27,.27,.5));s.addColorGradient(1,new BABYLON.Color4(.5,.5,.52,0));
    s.addSizeGradient(0,.6);s.addSizeGradient(1,2.8);
    s.start();s.stop();
    smokePS[key]=s;
  }

  /* Cockpit smoke */
  const cn=new BABYLON.TransformNode('cpSmokeEm',scene);cn.parent=aircraftRoot;cn.position.set(0,-.35,14.7);
  const cs=new BABYLON.ParticleSystem('cpSmoke',500,scene);cs.particleTexture=smokeTex;cs.emitter=cn;cs.isLocal=true;
  cs.minEmitBox=new BABYLON.Vector3(-.7,0,-.2);cs.maxEmitBox=new BABYLON.Vector3(.7,0,.2);
  cs.minSize=.5;cs.maxSize=1.3;cs.minLifeTime=3;cs.maxLifeTime=5.5;cs.emitRate=70;
  cs.blendMode=BABYLON.ParticleSystem.BLENDMODE_STANDARD;cs.gravity=new BABYLON.Vector3(0,.25,0);
  cs.direction1=new BABYLON.Vector3(-.3,.4,-.6);cs.direction2=new BABYLON.Vector3(.3,.9,.2);cs.minEmitPower=.2;cs.maxEmitPower=.6;
  cs.minInitialRotation=0;cs.maxInitialRotation=6.28;cs.minAngularSpeed=-.4;cs.maxAngularSpeed=.4;
  cs.addColorGradient(0,new BABYLON.Color4(.3,.3,.3,0));cs.addColorGradient(.25,new BABYLON.Color4(.35,.35,.36,.55));cs.addColorGradient(1,new BABYLON.Color4(.45,.45,.47,0));
  cs.addSizeGradient(0,.5);cs.addSizeGradient(1,2.4);cs.start();cs.stop();cockpitSmokePS=cs;
  /* Belly-landing sparks */
  sparksPS=new BABYLON.ParticleSystem('sparks',500,scene);
  sparksPS.particleTexture=new BABYLON.Texture(flareURL,scene);
  const sn=new BABYLON.TransformNode('sparkEm',scene);
  sn.parent=aircraftRoot;sn.position.set(0,-1.5,5);
  sparksPS.emitter=sn;
  sparksPS.minEmitBox=new BABYLON.Vector3(-1.5,0,-9);
  sparksPS.maxEmitBox=new BABYLON.Vector3(1.5,0,9);
  sparksPS.color1=new BABYLON.Color4(1,.9,.4,1);
  sparksPS.color2=new BABYLON.Color4(1,.55,.1,1);
  sparksPS.colorDead=new BABYLON.Color4(.5,.2,0,0);
  sparksPS.minSize=.08;sparksPS.maxSize=.28;
  sparksPS.minLifeTime=.12;sparksPS.maxLifeTime=.4;
  sparksPS.emitRate=400;
  sparksPS.blendMode=BABYLON.ParticleSystem.BLENDMODE_ADD;
  sparksPS.gravity=new BABYLON.Vector3(0,-12,0);
  sparksPS.direction1=new BABYLON.Vector3(-4,1,-4);
  sparksPS.direction2=new BABYLON.Vector3(4,4,4);
  sparksPS.minEmitPower=3;sparksPS.maxEmitPower=6;
  sparksPS.start();sparksPS.stop();

  /* Water ditching splash: white/foam burst + lingering mist, emitted from belly on first water contact */
  try{
    const splashTex=mkTex('splashT',c=>{c.clearRect(0,0,128,128);const g=c.createRadialGradient(64,64,2,64,64,60);g.addColorStop(0,'rgba(255,255,255,.95)');g.addColorStop(.4,'rgba(225,240,245,.75)');g.addColorStop(1,'rgba(200,230,240,0)');c.fillStyle=g;c.fillRect(0,0,128,128);});
    const spn=new BABYLON.TransformNode('splashEm',scene);spn.parent=aircraftRoot;spn.position.set(0,-1.6,0);
    splashPS=new BABYLON.ParticleSystem('splash',400,scene);
    splashPS.particleTexture=splashTex;splashPS.emitter=spn;splashPS.isLocal=false;
    splashPS.minEmitBox=new BABYLON.Vector3(-2,0,-10);splashPS.maxEmitBox=new BABYLON.Vector3(2,0,10);
    splashPS.color1=new BABYLON.Color4(.9,.97,1,1);splashPS.color2=new BABYLON.Color4(.7,.85,.95,.9);splashPS.colorDead=new BABYLON.Color4(.8,.9,.95,0);
    splashPS.minSize=1.2;splashPS.maxSize=4.5;splashPS.minLifeTime=.5;splashPS.maxLifeTime=1.3;
    splashPS.emitRate=0;splashPS.manualEmitCount=0;
    splashPS.blendMode=BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    splashPS.gravity=new BABYLON.Vector3(0,-18,0);
    splashPS.direction1=new BABYLON.Vector3(-6,6,-6);splashPS.direction2=new BABYLON.Vector3(6,14,6);
    splashPS.minEmitPower=4;splashPS.maxEmitPower=12;
    splashPS.start();splashPS.stop();
    /* lingering mist/foam trail while decelerating in water */
    splashMistPS=new BABYLON.ParticleSystem('splashMist',300,scene);
    splashMistPS.particleTexture=smokeTex;splashMistPS.emitter=spn;
    splashMistPS.minEmitBox=new BABYLON.Vector3(-2.5,0,-8);splashMistPS.maxEmitBox=new BABYLON.Vector3(2.5,0,8);
    splashMistPS.color1=new BABYLON.Color4(.85,.92,.96,.6);splashMistPS.color2=new BABYLON.Color4(.7,.8,.88,.4);splashMistPS.colorDead=new BABYLON.Color4(.8,.88,.95,0);
    splashMistPS.minSize=1.5;splashMistPS.maxSize=3.2;splashMistPS.minLifeTime=1;splashMistPS.maxLifeTime=2;
    splashMistPS.emitRate=90;splashMistPS.blendMode=BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    splashMistPS.gravity=new BABYLON.Vector3(0,1.5,0);
    splashMistPS.direction1=new BABYLON.Vector3(-1,.5,-1);splashMistPS.direction2=new BABYLON.Vector3(1,2,1);
    splashMistPS.minEmitPower=.5;splashMistPS.maxEmitPower=2;
    splashMistPS.start();splashMistPS.stop();
  }catch(e){}
}
/* One-shot water splash burst (ditching touchdown or any high-speed water impact). Defensive: never throws into the render loop. */
function waterSplash(intensity){
  try{
    intensity=Math.max(.2,Math.min(1,intensity||.6));
    if(splashPS){splashPS.manualEmitCount=Math.round(120+intensity*260);splashPS.start();}
  }catch(e){}
}

function updateFireAndSmoke(dt){
  {const on=faults.has('COCKPIT_SMOKE');const inCk=(camMode===1);
   if(cockpitSmokePS){if(on&&inCk){if(!cockpitSmokePS.isStarted())cockpitSmokePS.start();}else if(cockpitSmokePS.isStarted())cockpitSmokePS.stop();}
   const hz=document.getElementById('smokeHaze');if(hz)hz.style.opacity=(on&&inCk)?'.6':'0';}
  for(const key of ['L','R']){
    const active=faults.has('ENG_FIRE_'+key)||ENG.fireWarning[key];
    const f=firePS[key],s=smokePS[key];
    if(!f||!s)continue;
    if(active){
      if(!f.isStarted())f.start();
      if(!s.isStarted())s.start();
      if(emberPS[key]&&!emberPS[key].isStarted())emberPS[key].start();
      const intensity=Math.min(1,0.4+fireTimers[key]*0.2);
      f.emitRate=250+intensity*500;
      s.emitRate=120+intensity*380;
      /* Smoke trails behind aircraft */
      const v=plane.vel;
      s.gravity=new BABYLON.Vector3(-v.x*0.35,3.5,-v.z*0.35);
    } else {
      if(f.isStarted())f.stop();
      if(s.isStarted())s.stop();
      if(emberPS[key]&&emberPS[key].isStarted())emberPS[key].stop();
    }
  }
  /* Belly landing sparks */
  if(sparksPS){
    const hs=Math.hypot(plane.vel.x,plane.vel.z);
    const shouldSpark=plane.bellyLanding && plane.onGround && hs>3 && !plane.inWater;
    if(shouldSpark){
      if(!sparksPS.isStarted())sparksPS.start();
      sparksPS.emitRate=Math.min(600, 200+hs*8);
    } else {
      if(sparksPS.isStarted())sparksPS.stop();
    }
  }
  /* Wake/mist trail while decelerating in water during a ditching */
  if(splashMistPS){
    try{
      const hs=Math.hypot(plane.vel.x,plane.vel.z);
      const shouldMist=plane.inWater && plane.onGround && hs>0.5;
      if(shouldMist){if(!splashMistPS.isStarted())splashMistPS.start();splashMistPS.emitRate=60+Math.min(240,hs*10);}
      else if(splashMistPS.isStarted())splashMistPS.stop();
    }catch(e){}
  }
}
/* ========== END PARTICLE SYSTEMS ========== */
let ksExtraMeshes=[];
/* one painted runway slab (asphalt + markings + designators + shoulder). idx>0 = extra runway at world (px,pz) */
function makeRunwaySlab(rw,px,pz,idx){
  idx=idx||0;
  const h=rw.hdg*Math.PI/180;
  const dirX=Math.sin(h), dirZ=-Math.cos(h);
  const sfx=idx?('X'+idx):'';
  const sh=BABYLON.MeshBuilder.CreateGround('rwShoulder'+sfx,{width:rw.wid+18,height:rw.len+60,subdivisions:1},scene);
  sh.position.set(px,runwayY-0.18,pz);sh.rotation.y=Math.atan2(dirX,dirZ);sh.isPickable=false;
  const shM=new BABYLON.StandardMaterial('shM'+sfx,scene);
  shM.diffuseColor=new BABYLON.Color3(.11,.12,.10);shM.specularColor=new BABYLON.Color3(0,0,0);
  sh.material=shM;

  const g=BABYLON.MeshBuilder.CreateGround('runway'+sfx,{width:rw.wid,height:rw.len,subdivisions:2},scene);
  g.position.set(px,runwayY,pz);g.rotation.y=Math.atan2(dirX,dirZ);g.isPickable=false;

  const TW=idx?768:1024,TH=idx?3072:4096,mx=TW/rw.wid,mz=TH/rw.len;
  const tex=new BABYLON.DynamicTexture('rwTex'+sfx,{width:TW,height:TH},scene,true);
  const c=tex.getContext();
  c.fillStyle='#2b2b2f';c.fillRect(0,0,TW,TH);
  for(let i=0;i<120;i++){const v=(30+Math.random()*18)|0;c.fillStyle=`rgba(${v},${v},${v+2},.22)`;c.fillRect(0,Math.random()*TH,TW,8+Math.random()*90);}
  for(let i=0;i<16000;i++){const v=(30+Math.random()*34)|0,s=1+Math.random()*2.5;c.fillStyle=`rgba(${v},${v},${v+3},.32)`;c.fillRect(Math.random()*TW,Math.random()*TH,s,s);}
  c.fillStyle='rgba(18,18,20,.4)';for(let x=TW/6;x<TW-1;x+=TW/6)c.fillRect(x,0,2,TH);
  for(let i=0;i<60;i++){c.fillStyle='rgba(15,15,16,.25)';c.fillRect(Math.random()*TW,Math.random()*TH,1+Math.random()*2,30+Math.random()*200);}
  const rub=(y0,y1)=>{for(let i=0;i<1400;i++){const y=y0+Math.random()*(y1-y0),sp=Math.random()<.6?.16:.32,x=TW/2+(Math.random()-.5)*TW*sp+(Math.random()<.5?-1:1)*TW*.07;
    c.fillStyle=`rgba(6,6,7,${.05+Math.random()*.12})`;c.fillRect(x,y,2+Math.random()*7,6+Math.random()*50);}};
  rub(250*mz,950*mz);rub(TH-950*mz,TH-250*mz);
  c.fillStyle='#eeeeec';
  const R=(xm,ym,wm,hm)=>c.fillRect(TW/2+xm*mx,ym*mz,wm*mx,hm*mz),Rb=(xm,ym,wm,hm)=>c.fillRect(TW/2+xm*mx,TH-(ym+hm)*mz,wm*mx,hm*mz);
  R(-rw.wid/2+1,0,.9,rw.len);R(rw.wid/2-1.9,0,.9,rw.len);
  for(let y=90;y<rw.len-90;y+=50)R(-.45,y,.9,30);
  const nk=rw.wid>=45?16:rw.wid>=30?12:8,kw=1.8,span=rw.wid-6;
  for(let k=0;k<nk;k++){const xm=-span/2+(k+.5)*span/nk-kw/2;if(Math.abs(xm+kw/2)<2.5)continue;R(xm,6,kw,30);Rb(xm,6,kw,30);}
  for(const sd of[-1,1]){const x0=sd>0?4.5:-14.5;R(x0,400,10,45);Rb(x0,400,10,45);}
  [[150,3],[300,3],[600,2],[750,2],[900,1]].forEach(([d,bars])=>{for(const sd of[-1,1])for(let b=0;b<bars;b++){const x0=sd>0?4.5+b*2.7:-4.5-1.8-b*2.7;R(x0,d,1.8,22.5);Rb(x0,d,1.8,22.5);}});
  const num=Math.round(((rw.hdg%360)+360)%360/10)||36;
  const d0=rw.des?rw.des[0]:String(num).padStart(2,'0');
  const d1=rw.des?rw.des[1]:String(((num+18-1)%36)+1).padStart(2,'0');
  const dsg=(txt,yTop,flip)=>{c.save();c.translate(TW/2,flip?TH-yTop*mz:yTop*mz);if(flip)c.rotate(Math.PI);c.scale(mx,mz);c.fillStyle='#f6f6f4';c.font='bold 11px Arial,sans-serif';c.textAlign='center';c.textBaseline='top';
    const m=/^(\d+)([LRC]?)$/.exec(txt);if(m){c.fillText(m[1],0,0);if(m[2])c.fillText(m[2],0,12.5);}else c.fillText(txt,0,0);c.restore();};
  dsg(d0,46,false);dsg(d1,46,true);
  tex.update(true);tex.anisotropicFilteringLevel=16;

  const m=new BABYLON.StandardMaterial('rwM'+sfx,scene);
  m.diffuseTexture=tex;m.specularColor=new BABYLON.Color3(.1,.1,.1);
  m.emissiveColor=new BABYLON.Color3(.18,.18,.19);m.backFaceCulling=false;
  if(idx){try{m.zOffset=-idx*2;m.zOffsetUnits=-idx*2;shM.zOffset=-idx;}catch(e){}}
  g.material=m;
  return{ground:g,shoulder:sh};
}
function createRunway_BASE_(code){
  if(runwayMesh){runwayMesh.dispose();runwayMesh=null;}
  const oldSh=scene.getMeshByName('rwShoulder'); if(oldSh)oldSh.dispose();
  ksExtraMeshes.forEach(m=>{try{m.dispose();}catch(e){}});ksExtraMeshes=[];
  const rw=RUNWAYS[code];
  if(!rw){runwayLenM=0;window._rwExtras=null;return;}
  runwayHdgDeg=rw.hdg; runwayLenM=rw.len; runwayWidM=rw.wid;
  runwayY=Math.max(sampleTerrain(0,0),0)+0.15;
  window._rwExtras=rw.extras||null;
  window._rwZones=rw.extras?rw.extras.map(r=>({x:r.cx,z:r.cz,ux:r.ux,uz:r.uz,hl:r.len/2+130,hw:r.wid/2+150}))
    .concat([{x:KS_TERM[0],z:KS_TERM[1],r:560},{x:KS_FIELD[0],z:KS_FIELD[1],r:1000}]):null;
  window._noGen=window._rwZones?((x,z)=>{for(const q of window._rwZones){let d;
    if(q.r!==undefined)d=Math.hypot(x-q.x,z-q.z)-q.r;
    else{const dx=x-q.x,dz=z-q.z,a=dx*q.ux+dz*q.uz,b=dx*q.uz-dz*q.ux;d=Math.max(Math.abs(b)-q.hw-120,Math.abs(a)-q.hl-120);}
    if(d<0)return true;}return false;}):null;
  const prim=makeRunwaySlab(rw,0,0,0);
  runwayMesh=prim.ground;
  (rw.extras||[]).forEach((r,i)=>{const e=makeRunwaySlab({hdg:r.hdg,len:r.len,wid:r.wid,des:r.des},r.cx,r.cz,i+1);ksExtraMeshes.push(e.ground,e.shoulder);});
}
status('cockpit');
function intBox(name,w,h,d,x,y,z,rx,mat,par){
  const m=BABYLON.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);
  m.position.set(x,y,z);m.parent=par||interiorRoot;
  if(rx)m.rotation.x=rx;
  m.material=mat;m.isPickable=false;m.backFaceCulling=false;
  return m;
}
intBox('cf',3.2,.08,4.5,0,-.95,14.5,0,M.bezel);
intBox('ck',3.2,1.1,.12,0,-.35,15.55,0,M.cockpitBody);
intBox('cb',3.2,2.3,.1,0,.25,12.3,0,M.cockpitBody);
intBox('cwl',.1,2.3,4.5,-1.6,.25,14.5,0,M.cockpitBody);
intBox('cwr',.1,2.3,4.5,1.6,.25,14.5,0,M.cockpitBody);
intBox('cc',3.2,.08,4.5,0,1.4,14.5,0,M.cockpitPanel);
const frameMat=M.cockpitPanel;
intBox('wsb',3.0,.08,.2,0,.1,15.7,0,frameMat);
intBox('wst',3.0,.10,.15,0,.95,15.55,-.35,frameMat);
intBox('wsc',.05,.95,.15,0,.55,15.7,-.15,frameMat);
intBox('wsl',.06,.95,.15,-1.5,.55,15.7,-.15,frameMat);
intBox('wsr',.06,.95,.15,1.5,.55,15.7,-.15,frameMat);
intBox('wsc_l',.04,.85,.13,-.55,.55,15.72,-.15,frameMat);
intBox('wsc_r',.04,.85,.13,.55,.55,15.72,-.15,frameMat);
intBox('swf',3.2,.08,.15,0,.95,15.4,-.35,frameMat);
/* Better windshield glass – tinted, slightly reflective, visible */
M.windshieldGlass=new BABYLON.PBRMaterial('wsGlassM',scene);
M.windshieldGlass.albedoColor=new BABYLON.Color3(.04,.1,.1);
M.windshieldGlass.metallic=.0;M.windshieldGlass.roughness=.02;
M.windshieldGlass.alpha=.085;
M.windshieldGlass.transparencyMode=BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
M.windshieldGlass.backFaceCulling=false;
M.windshieldGlass.clearCoat.isEnabled=true;M.windshieldGlass.clearCoat.intensity=1;M.windshieldGlass.clearCoat.roughness=.015;
M.windshieldGlass.environmentIntensity=.42;
M.sideGlass=new BABYLON.PBRMaterial('sgM',scene);
M.sideGlass.albedoColor=new BABYLON.Color3(.03,.08,.08);
M.sideGlass.metallic=0;M.sideGlass.roughness=.03;M.sideGlass.alpha=.13;
M.sideGlass.transparencyMode=BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
M.sideGlass.backFaceCulling=false;M.sideGlass.environmentIntensity=.3;
M.sideGlass.clearCoat.isEnabled=true;M.sideGlass.clearCoat.intensity=1;M.sideGlass.clearCoat.roughness=.02;
function glassPane(name,w,h,x,y,z,rx,ry,mat){
  const p=BABYLON.MeshBuilder.CreatePlane(name,{width:w,height:h,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
  p.position.set(x,y,z);p.rotation.x=rx;if(ry)p.rotation.y=ry;
  p.material=mat||M.windshieldGlass;p.parent=interiorRoot;p.isPickable=false;p.isVisible=true;
  return p;
}
/* 4 main windshield panes */
glassPane('gl1',.54,.82,-.75,.56,15.70,-.15,0);
glassPane('gl2',.54,.82,-.20,.56,15.70,-.15,0);
glassPane('gl3',.54,.82,.20,.56,15.70,-.15,0);
glassPane('gl4',.54,.82,.75,.56,15.70,-.15,0);

/* Side quarter-windows */
glassPane('gsl',.38,.58,-1.52,.52,15.18,-.10,-Math.PI/2.2,M.sideGlass);
glassPane('gsr',.38,.58,1.52,.52,15.18,-.10,Math.PI/2.2,M.sideGlass);
/* Window frame depth strips – give the windshield frames visible thickness */
(function(){
  const fm=M.bezel;
  // top frame bar above all 4 panes
  intBox('wsFrameTop',2.42,.06,.06,0,.97,15.67,-.15,fm);
  // bottom frame bar
  intBox('wsFrameBot',2.42,.06,.06,0,.12,15.72,-.15,fm);
  // center divider post
  intBox('wsFrameMid',.06,.85,.06,0,.54,15.70,-.15,fm);
  // outer left/right posts
  intBox('wsFrameL',.06,.85,.06,-.75,.54,15.70,-.15,fm);
  intBox('wsFrameR',.06,.85,.06,.75,.54,15.70,-.15,fm);
  // glareshield top lip – gives cockpit that Boeing visor look
  intBox('wsVisorL',.04,.025,.34,-1.05,.99,15.54,-.3,fm);
  intBox('wsVisorR',.04,.025,.34,1.05,.99,15.54,-.3,fm);
  intBox('wsVisorC',2.0,.025,.34,0,.99,15.54,-.3,fm);
})();

const panelW=1.55,panelH=.45;
const panelTex=new BABYLON.DynamicTexture('panelTex',{width:1024,height:297},scene,true);
const panelCanvas=panelTex.getContext();
function drawMainPanel(){
  const W=1024,H=297;
  const grd=panelCanvas.createLinearGradient(0,0,0,H);
  grd.addColorStop(0,'#25282c');grd.addColorStop(.5,'#1a1d21');grd.addColorStop(1,'#0f1114');
  panelCanvas.fillStyle=grd;panelCanvas.fillRect(0,0,W,H);
  panelCanvas.globalAlpha=.04;
  for(let i=0;i<400;i++){panelCanvas.strokeStyle='#fff';panelCanvas.lineWidth=.5;
    panelCanvas.beginPath();const y=Math.random()*H;panelCanvas.moveTo(0,y);panelCanvas.lineTo(W,y+Math.random()*2-1);panelCanvas.stroke();}
  panelCanvas.globalAlpha=.06;for(let i=0;i<2500;i++){panelCanvas.fillStyle=Math.random()>.5?'#fff':'#000';panelCanvas.fillRect(Math.random()*W,Math.random()*H,1,1);}
  panelCanvas.globalAlpha=1;
  const screens=[{x:.0194,y:.222,w:.161,h:.556},{x:.2194,y:.222,w:.161,h:.556},{x:.3926,y:.222,w:.2148,h:.556},{x:.6194,y:.222,w:.161,h:.556},{x:.8194,y:.222,w:.161,h:.556}];
  screens.forEach(s=>{const x=s.x*W,y=s.y*H,w=s.w*W,h=s.h*H;
    panelCanvas.fillStyle='#050505';panelCanvas.fillRect(x-6,y-6,w+12,h+12);
    panelCanvas.fillStyle='#000';panelCanvas.fillRect(x,y,w,h);
    panelCanvas.strokeStyle='rgba(255,255,255,.14)';panelCanvas.lineWidth=1.5;panelCanvas.strokeRect(x-6,y-6,w+12,h+12);
    const sh=panelCanvas.createLinearGradient(x,y,x+w,y+h);sh.addColorStop(0,'rgba(255,255,255,.09)');sh.addColorStop(.45,'rgba(255,255,255,0)');panelCanvas.fillStyle=sh;panelCanvas.fillRect(x,y,w,h);});
  panelCanvas.font='bold 9px monospace';panelCanvas.fillStyle='#9fb5c9';panelCanvas.textAlign='center';
  panelCanvas.fillText('CAPT',W*.12,H*.12);panelCanvas.fillText('F/O',W*.88,H*.12);
  panelCanvas.fillText('EICAS',W*.5,H*.12);panelCanvas.fillText('FMC',W*.5,H*.94);
  for(let i=0;i<12;i++){const x=W*.5-60+i*10;panelCanvas.fillStyle=i%2===0?'#333':'#555';panelCanvas.fillRect(x,H*.06,5,8);}
  const annColors=['#7a2020','#204a20','#7a6020','#7a2020','#204a20'];
  for(let i=0;i<5;i++){panelCanvas.fillStyle=annColors[i];panelCanvas.fillRect(W*.44+i*30,H*.02,26,10);}
  panelCanvas.font='7px monospace';panelCanvas.fillStyle='#888';
  ['MASTER','AP','AT','YD','WARN'].forEach((l,i)=>panelCanvas.fillText(l,W*.44+i*30+13,H*.055));
  panelTex.update(true);
}
drawMainPanel();
panelTex.anisotropicFilteringLevel=16;panelTex.updateSamplingMode(BABYLON.Texture.TRILINEAR_SAMPLINGMODE);

const panelMesh=BABYLON.MeshBuilder.CreatePlane('panel',{width:panelW,height:panelH,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
panelMesh.position.set(0,-.12,15.15);panelMesh.rotation.x=-.28;
panelMesh.parent=interiorRoot;
panelMesh.material=M.cockpitPanel.clone('panelM');
panelMesh.material.albedoTexture=panelTex;panelMesh.material.emissiveTexture=panelTex;
panelMesh.material.emissiveColor=new BABYLON.Color3(.75,.75,.8);
panelMesh.material.metallic=.4;panelMesh.material.roughness=.55;panelMesh.isPickable=false;

const displays={};
function makeDisplayTex(name,w,h){return new BABYLON.DynamicTexture(name,{width:w,height:h},scene,true);}
displays.pfdL=makeDisplayTex('pfdL',640,640);
displays.ndL=makeDisplayTex('ndL',640,640);
displays.eicas=makeDisplayTex('eicas',840,640);
displays.ndR=makeDisplayTex('ndR',640,640);
displays.pfdR=makeDisplayTex('pfdR',640,640);
Object.values(displays).forEach(t=>{try{t.anisotropicFilteringLevel=16;t.updateSamplingMode(BABYLON.Texture.TRILINEAR_SAMPLINGMODE);}catch(e){}});
function placeDisplay(name,tex,panelX,panelY,w,h){
  const localX=panelX*panelW,localY=panelY*panelH;
  const cosA=Math.cos(-.28),sinA=Math.sin(-.28);
  const worldY=-.12+localY*cosA,worldZ=15.15+localY*sinA-0.012;
  const m=BABYLON.MeshBuilder.CreatePlane(name,{width:w,height:h,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
  m.position.set(localX,worldY,worldZ);m.rotation.x=-.28;m.parent=interiorRoot;m.isPickable=false;
  const mat=new BABYLON.StandardMaterial(name+'M',scene);
  mat.emissiveTexture=tex;mat.diffuseTexture=tex;
  mat.emissiveColor=new BABYLON.Color3(1,1,1);
  mat.diffuseColor=new BABYLON.Color3(.15,.15,.15);
  mat.specularColor=new BABYLON.Color3(.05,.05,.05);
  mat.backFaceCulling=false;tex.anisotropicFilteringLevel=16;m.material=mat;return m;
}
const glassMeshes=[
  placeDisplay('dPfdL',displays.pfdL,-.40,0,.25,.25),
  placeDisplay('dNdL', displays.ndL, -.20,0,.25,.25),
  placeDisplay('dEic', displays.eicas, 0,0,.333,.25),
  placeDisplay('dNdR', displays.ndR, .20,0,.25,.25),
  placeDisplay('dPfdR',displays.pfdR,.40,0,.25,.25)
];
const classicTex=makeDisplayTex('classicPanel',1536,420);
classicTex.anisotropicFilteringLevel=16;classicTex.updateSamplingMode(BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
const classicMesh=placeDisplay('dClassic',classicTex,0,0,panelW*.94,panelH*.6);
classicMesh.isVisible=false;
function drawRoundGauge(ctx,cx,cy,r,label){
  ctx.save();ctx.translate(cx,cy);
  const g=ctx.createRadialGradient(-r*.3,-r*.3,r*.1,0,0,r);g.addColorStop(0,'#3a3d42');g.addColorStop(1,'#15171a');
  ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,r,0,6.2832);ctx.fill();
  ctx.lineWidth=r*.08;ctx.strokeStyle='#060708';ctx.beginPath();ctx.arc(0,0,r*.97,0,6.2832);ctx.stroke();
  ctx.fillStyle='#dce6ef';ctx.font='bold '+Math.round(r*.16)+'px monospace';ctx.textAlign='center';
  ctx.fillText(label,0,-r*.42);
  ctx.restore();
}
function gaugeTicks(ctx,cx,cy,r,count,span,start,majorEvery){
  ctx.save();ctx.translate(cx,cy);
  for(let i=0;i<=count;i++){
    const a=start+span*(i/count)-Math.PI/2,maj=(i%majorEvery===0);
    ctx.save();ctx.rotate(a);ctx.strokeStyle=maj?'#eef3f8':'#9fb0c0';ctx.lineWidth=maj?2:1;
    ctx.beginPath();ctx.moveTo(0,-r*.86);ctx.lineTo(0,-r*(maj?.74:.80));ctx.stroke();ctx.restore();
  }
  ctx.restore();
}
function gaugeNeedle(ctx,cx,cy,r,angRad,len,col,w){
  ctx.save();ctx.translate(cx,cy);ctx.rotate(angRad-Math.PI/2);
  ctx.strokeStyle=col||'#fff';ctx.lineWidth=w||3;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(0,r*.14);ctx.lineTo(0,-r*len);ctx.stroke();
  ctx.restore();
  ctx.save();ctx.translate(cx,cy);ctx.fillStyle='#ccc';ctx.beginPath();ctx.arc(0,0,r*.07,0,6.2832);ctx.fill();ctx.restore();
}
function drawClassicPanel(ctx,W,H,hdg,pitch,bank,spd,alt,vs,n1L,n1R,flapsName,gearTxt){
  ctx.fillStyle='#1c1e21';ctx.fillRect(0,0,W,H);
  const r=H*.42,y=H*.52;
  const slots=[
    {x:W*.09,label:'AIRSPEED',draw:()=>{
      drawRoundGauge(ctx,W*.09,y,r,'AIRSPEED KT');gaugeTicks(ctx,W*.09,y,r,12,Math.PI*1.5,0,3);
      const kt=Math.max(0,Math.min(400,spd)),ang=(kt/400)*Math.PI*1.5;
      gaugeNeedle(ctx,W*.09,y,r,ang,.72,'#ffd400',3);
      ctx.fillStyle='#8fe0ff';ctx.font='bold '+Math.round(r*.22)+'px monospace';ctx.textAlign='center';ctx.fillText(Math.round(kt),W*.09,y+r*.5);
    }},
    {x:W*.27,label:'ATTITUDE',draw:()=>{
      drawRoundGauge(ctx,W*.27,y,r,'ATTITUDE');
      ctx.save();ctx.beginPath();ctx.arc(W*.27,y,r*.86,0,6.2832);ctx.clip();
      ctx.translate(W*.27,y);ctx.rotate(-bank*Math.PI/180);ctx.translate(0,pitch*r*.012);
      ctx.fillStyle='#2a6fb0';ctx.fillRect(-r*2,-r*2,r*4,r*2);
      ctx.fillStyle='#8a5a2a';ctx.fillRect(-r*2,0,r*4,r*2);
      ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-r*2,0);ctx.lineTo(r*2,0);ctx.stroke();
      ctx.restore();
      ctx.strokeStyle='#ffd400';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(W*.27-r*.4,y);ctx.lineTo(W*.27-r*.12,y);ctx.moveTo(W*.27+r*.12,y);ctx.lineTo(W*.27+r*.4,y);ctx.stroke();
      ctx.beginPath();ctx.moveTo(W*.27,y-r*.1);ctx.lineTo(W*.27,y);ctx.stroke();
    }},
    {x:W*.45,label:'ALTITUDE',draw:()=>{
      drawRoundGauge(ctx,W*.45,y,r,'ALTITUDE FT');gaugeTicks(ctx,W*.45,y,r,10,Math.PI*2,0,1);
      const ft=Math.max(0,alt),hund=(ft%1000)/1000*Math.PI*2,thou=((ft/1000)%10)/10*Math.PI*2;
      gaugeNeedle(ctx,W*.45,y,r,thou,.5,'#9fd4ff',4);
      gaugeNeedle(ctx,W*.45,y,r,hund,.78,'#ffd400',2.5);
      ctx.fillStyle='#8fe0ff';ctx.font='bold '+Math.round(r*.18)+'px monospace';ctx.textAlign='center';ctx.fillText(Math.round(ft).toLocaleString(),W*.45,y+r*.55);
    }},
    {x:W*.63,label:'VERT SPEED',draw:()=>{
      drawRoundGauge(ctx,W*.63,y,r,'VSI ×100FPM');gaugeTicks(ctx,W*.63,y,r,10,Math.PI*1.6,-Math.PI*.8,5);
      const v=Math.max(-2000,Math.min(2000,vs)),ang=(v/2000)*Math.PI*.8;
      gaugeNeedle(ctx,W*.63,y,r,ang,.7,'#7fffb0',3);
    }},
    {x:W*.81,label:'ENGINES',draw:()=>{
      drawRoundGauge(ctx,W*.81-r*.52,y,r*.62,'N1 L');drawRoundGauge(ctx,W*.81+r*.52,y,r*.62,'N1 R');
      [[W*.81-r*.52,n1L],[W*.81+r*.52,n1R]].forEach(([gx,n1])=>{
        gaugeTicks(ctx,gx,y,r*.62,10,Math.PI*1.5,0,5);
        gaugeNeedle(ctx,gx,y,r*.62,(Math.max(0,Math.min(100,n1))/100)*Math.PI*1.5,.7,'#ff8060',2.5);
      });
    }}
  ];
  slots.forEach(s=>s.draw());
  ctx.fillStyle='#8fe0ff';ctx.font='bold '+Math.round(H*.05)+'px monospace';ctx.textAlign='left';
  ctx.fillText('HDG '+String(Math.round(((hdg%360)+360)%360)).padStart(3,'0')+'°',W*.02,H*.1);
  ctx.textAlign='right';ctx.fillText('FLAPS '+flapsName+'   GEAR '+gearTxt,W*.98,H*.1);
}
function setPanelCategory(analog){
  if(classicMesh.isVisible===analog)return;
  classicMesh.isVisible=analog;
  glassMeshes.forEach(m=>{if(m)m.isVisible=!analog;});
}

intBox('glare',panelW+.2,.05,.35,0,.1,15.15,-.2,M.bezel);
intBox('ped',.55,.5,2.0,0,-.55,14.3,0,M.cockpitPanel);
intBox('pedTop',.55,.05,2.0,0,-.32,14.3,0,M.cockpitPanel);
/* Throttle quadrant – wider, more realistic Boeing-style */
intBox('thrQ',.52,.14,.72,0,-.275,14.75,0,M.dark);
intBox('thrQSide1',.03,.22,.72,-.265,-.22,14.75,0,M.cockpitPanel);
intBox('thrQSide2',.03,.22,.72,.265,-.22,14.75,0,M.cockpitPanel);
/* TOGA detent marks on the quadrant */
(function(){
  const togaTex=new BABYLON.DynamicTexture('togaTex',{width:128,height:32},scene,true);
  const tc=togaTex.getContext();tc.fillStyle='#111';tc.fillRect(0,0,128,32);
  tc.fillStyle='#ff6020';tc.fillRect(0,14,128,4);
  tc.fillStyle='#999';tc.font='bold 10px sans-serif';tc.textAlign='center';tc.fillText('TOGA',64,11);
  togaTex.update(true);
  const tm=new BABYLON.StandardMaterial('togaM',scene);tm.emissiveTexture=togaTex;tm.diffuseTexture=togaTex;
  tm.emissiveColor=new BABYLON.Color3(1,1,1);tm.backFaceCulling=false;
  const tp=BABYLON.MeshBuilder.CreatePlane('togaP',{width:.5,height:.08,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
  tp.position.set(0,-.19,14.42);tp.rotation.x=Math.PI/2;tp.parent=interiorRoot;tp.material=tm;tp.isPickable=false;
})();
const throttleLevers=[];
for(let i=0;i<2;i++){
  const xOff=-.13+i*.13;
  /* lever body – flat rectangular bar like Boeing 737 throttle */
  const t=BABYLON.MeshBuilder.CreateBox('thrLv'+i,{width:.055,height:.22,depth:.038},scene);
  t.position.set(xOff,-.08,14.78);t.rotation.x=-.3;t.material=M.metal;t.parent=interiorRoot;
  /* Boeing-style flat rectangular handle at top */
  const knob=BABYLON.MeshBuilder.CreateBox('thrK'+i,{width:.085,height:.06,depth:.055},scene);
  knob.position.set(xOff,.12,14.60);knob.material=M.throttleKnob;knob.parent=interiorRoot;
  /* Grip texture on handle */
  const gripTex=new BABYLON.DynamicTexture('thrGrip'+i,{width:64,height:64},scene,true);
  const gc=gripTex.getContext();gc.fillStyle='#8a0a0a';gc.fillRect(0,0,64,64);
  for(let g=0;g<5;g++){gc.fillStyle='rgba(0,0,0,.3)';gc.fillRect(0,8+g*12,64,6);}
  gc.fillStyle='#fff';gc.font='bold 9px monospace';gc.textAlign='center';gc.fillText(i===0?'1':'2',32,36);
  gripTex.update(true);
  const gm=new BABYLON.StandardMaterial('thrGM'+i,scene);gm.diffuseTexture=gripTex;gm.emissiveTexture=gripTex;gm.emissiveColor=new BABYLON.Color3(.8,.8,.8);gm.backFaceCulling=false;
  knob.material=gm;
  throttleLevers.push({lever:t,knob:knob});
}
const sbLever=BABYLON.MeshBuilder.CreateCylinder('sbLv',{height:.2,diameter:.05,tessellation:12},scene);
sbLever.position.set(.2,-.26,14.6);sbLever.rotation.x=-.3;sbLever.material=M.metal;sbLever.parent=interiorRoot;
const sbKnob=BABYLON.MeshBuilder.CreateSphere('sbK',{diameter:.1},scene);
sbKnob.position.set(.2,-.15,14.57);sbKnob.material=M.dark;sbKnob.parent=interiorRoot;
const flapLever=BABYLON.MeshBuilder.CreateCylinder('flLv',{height:.2,diameter:.05,tessellation:12},scene);
flapLever.position.set(.2,-.26,14.3);flapLever.rotation.x=-.3;flapLever.material=M.metal;flapLever.parent=interiorRoot;
const flapKnob=BABYLON.MeshBuilder.CreateBox('flK',{width:.1,height:.06,depth:.1},scene);
flapKnob.position.set(.2,-.15,14.27);flapKnob.material=M.white;flapKnob.parent=interiorRoot;

const cduTex=new BABYLON.DynamicTexture('cdu',{width:256,height:256},scene,true);
(function(){
  const c=cduTex.getContext();
  c.fillStyle='#000';c.fillRect(0,0,256,256);
  c.fillStyle='#00ff88';c.font='bold 14px monospace';c.fillText('FMC',8,20);
  c.font='11px monospace';c.fillStyle='#00cc66';
  c.fillText('IDENT   LSZH',8,50);c.fillText('RTE     0000',8,70);
  c.fillText('LEGS    0000',8,90);c.fillText('DEP/ARR  ---',8,110);c.fillText('PERF     ---',8,130);
  c.strokeStyle='#00ff88';c.strokeRect(4,4,248,248);
  cduTex.update(true);
})();
const cduMat=new BABYLON.StandardMaterial('cduM',scene);
cduMat.emissiveTexture=cduTex;cduMat.diffuseTexture=cduTex;
cduMat.emissiveColor=new BABYLON.Color3(1,1,1);
const cduMesh=BABYLON.MeshBuilder.CreatePlane('cdu',{width:.22,height:.22,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
cduMesh.position.set(-.15,-.25,14.2);cduMesh.rotation.x=-.5;
cduMesh.parent=interiorRoot;cduMesh.material=cduMat;cduMesh.isPickable=false;

const fireHandles={};
for(const sgn of [1,-1]){
  const key=sgn>0?'R':'L';
  intBox('fhb'+key,.14,.02,.14,sgn*.15,-.27,14.3,0,M.cockpitPanel);
  const pivot=new BABYLON.TransformNode('fhPv'+key,scene);
  pivot.parent=interiorRoot;pivot.position.set(sgn*.15,-.27,14.25);
  const stem=BABYLON.MeshBuilder.CreateCylinder('fhS'+key,{height:.08,diameter:.035,tessellation:12},scene);
  stem.position.y=.04;stem.material=M.fireHandle;stem.parent=pivot;
  const top=BABYLON.MeshBuilder.CreateCylinder('fhT'+key,{height:.12,diameter:.045,tessellation:12},scene);
  top.rotation.z=Math.PI/2;top.position.y=.08;top.material=M.fireHandle;top.parent=pivot;
  const lbl=BABYLON.MeshBuilder.CreatePlane('fhL'+key,{width:.1,height:.03,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
  lbl.position.set(sgn*.15,-.26,14.19);lbl.rotation.x=-Math.PI/2.2;lbl.parent=interiorRoot;
  const lm=new BABYLON.StandardMaterial('fhLm'+key,scene);
  lm.emissiveColor=new BABYLON.Color3(.9,.9,.9);lm.albedoColor=new BABYLON.Color3(.1,.1,.1);
  const lt=new BABYLON.DynamicTexture('fhLt'+key,{width:128,height:40},scene,true);
  const lc=lt.getContext();
  lc.fillStyle='#000';lc.fillRect(0,0,128,40);
  lc.font='bold 14px monospace';lc.fillStyle='#fff';lc.textAlign='center';
  lc.fillText('ENG '+(key==='L'?'1':'2'),64,18);
  lc.font='10px monospace';lc.fillStyle='#ff8080';lc.fillText('FIRE',64,34);
  lt.update(true);
  lm.emissiveTexture=lt;lm.diffuseTexture=lt;lbl.material=lm;lbl.isPickable=false;
  fireHandles[key]={pivot:pivot,pulled:false};
  top.isPickable=true;
  top.actionManager=new BABYLON.ActionManager(scene);
  top.actionManager.registerAction(new BABYLON.ExecuteCodeAction(BABYLON.ActionManager.OnPickTrigger,()=>{toggleFireHandle(key);}));
}

/* --- Improved Yokes --- */
const yokes={};
(function(){
  /* Grip rubber material with ridged texture */
  const yokeGripTex=new BABYLON.DynamicTexture('yokeGripTex',{width:64,height:128},scene,true);
  const ygt=yokeGripTex.getContext();ygt.fillStyle='#0d0e0f';ygt.fillRect(0,0,64,128);
  for(let g=0;g<8;g++){ygt.fillStyle='rgba(255,255,255,.07)';ygt.fillRect(0,8+g*15,64,7);}
  yokeGripTex.update(true);
  const yokeGripMat=new BABYLON.PBRMaterial('yokeGripM',scene);
  yokeGripMat.albedoTexture=yokeGripTex;yokeGripMat.metallic=0;yokeGripMat.roughness=1;
  yokeGripMat.albedoColor=new BABYLON.Color3(.07,.07,.08);

  /* Yoke button material */
  const yokeBtnMat=new BABYLON.PBRMaterial('yokeBtnM',scene);
  yokeBtnMat.albedoColor=new BABYLON.Color3(.8,.82,.85);yokeBtnMat.metallic=.3;yokeBtnMat.roughness=.5;

  for(const sgn of [-1,1]){
    const key=sgn<0?'L':'R';
    const grp=new BABYLON.TransformNode('yoke'+key,scene);
    grp.parent=interiorRoot;grp.position.set(sgn*.62,-.28,14.58);

    /* Column – thicker, tapered look */
    const col=BABYLON.MeshBuilder.CreateCylinder('col'+key,{height:.38,diameter:.09,diameterTop:.07,tessellation:14},scene);
    col.position.y=-.19;col.material=M.dark;col.parent=grp;

    /* Column boot/base where it goes into instrument panel */
    const boot=BABYLON.MeshBuilder.CreateCylinder('boot'+key,{height:.055,diameter:.13,tessellation:14},scene);
    boot.position.y=-.38;boot.material=M.cockpitPanel;boot.parent=grp;

    /* Center hub */
    const hub=BABYLON.MeshBuilder.CreateCylinder('hub'+key,{height:.07,diameter:.12,tessellation:14},scene);
    hub.position.y=.035;hub.rotation.x=Math.PI/2;hub.material=M.dark;hub.parent=grp;

    /* Left horn arm */
    const hornL=BABYLON.MeshBuilder.CreateCylinder('hL'+key,{height:.28,diameter:.045,tessellation:10},scene);
    hornL.position.set(-.14,.13,.01);hornL.rotation.z=.32;hornL.material=M.dark;hornL.parent=grp;

    /* Right horn arm */
    const hornR=BABYLON.MeshBuilder.CreateCylinder('hR'+key,{height:.28,diameter:.045,tessellation:10},scene);
    hornR.position.set(.14,.13,.01);hornR.rotation.z=-.32;hornR.material=M.dark;hornR.parent=grp;

    /* Left grip (cylindrical, textured) */
    const gripL=BABYLON.MeshBuilder.CreateCylinder('gL'+key,{height:.16,diameter:.055,tessellation:12},scene);
    gripL.position.set(-.235,.24,.01);gripL.material=yokeGripMat;gripL.parent=grp;

    /* Right grip */
    const gripR=BABYLON.MeshBuilder.CreateCylinder('gR'+key,{height:.16,diameter:.055,tessellation:12},scene);
    gripR.position.set(.235,.24,.01);gripR.material=yokeGripMat;gripR.parent=grp;

    /* AP disconnect button on each grip (red) */
    const apBtn=BABYLON.MeshBuilder.CreateCylinder('apBtn'+key,{height:.015,diameter:.025,tessellation:8},scene);
    apBtn.position.set(sgn<0?-.235:.235,.29,-0.03);apBtn.rotation.x=-Math.PI/4;
    apBtn.material=M.fireHandle;apBtn.parent=grp;

    /* Crossbar (horizontal tube connecting both horn tips) */
    const xbar=BABYLON.MeshBuilder.CreateCylinder('xbar'+key,{height:.5,diameter:.04,tessellation:10},scene);
    xbar.position.set(0,.24,.01);xbar.rotation.z=Math.PI/2;xbar.material=M.dark;xbar.parent=grp;

    yokes[key]=grp;
  }
})();

/* --- Improved Seats with headrests, lumbar, armrests --- */
(function(){
  const seatCushionMat=new BABYLON.PBRMaterial('seatCushM',scene);
  seatCushionMat.albedoColor=new BABYLON.Color3(.12,.12,.14);seatCushionMat.metallic=0;seatCushionMat.roughness=.95;
  const seatFabricMat=new BABYLON.PBRMaterial('seatFabM',scene);
  seatFabricMat.albedoColor=new BABYLON.Color3(.18,.20,.24);seatFabricMat.metallic=0;seatFabricMat.roughness=1;
  const metalFrameMat=M.metal;

  for(const sgn of [-1,1]){
    /* Seat cushion */
    intBox('seat'+sgn,.55,.10,.62,sgn*.62,-.76,13.22,0,seatCushionMat);
    /* Seat cushion edge bolsters */
    intBox('seatBolL'+sgn,.08,.12,.62,sgn*.62-sgn*.235,-.73,13.22,0,seatFabricMat);
    intBox('seatBolR'+sgn,.08,.12,.62,sgn*.62+sgn*.235,-.73,13.22,0,seatFabricMat);
    /* Seat back */
    intBox('seatB'+sgn,.55,.95,.14,sgn*.62,-.27,12.89,-.06,seatCushionMat);
    /* Lumbar support roll */
    const lumb=BABYLON.MeshBuilder.CreateCylinder('lumb'+sgn,{height:.46,diameter:.095,tessellation:12},scene);
    lumb.position.set(sgn*.62,-.52,12.87);lumb.rotation.x=Math.PI/2;lumb.rotation.z=-.06;lumb.material=seatFabricMat;lumb.parent=interiorRoot;lumb.isPickable=false;
    /* Headrest */
    intBox('seatH'+sgn,.42,.22,.14,sgn*.62,.30,12.84,-.05,seatCushionMat);
    /* Headrest side wings */
    intBox('seatHwL'+sgn,.10,.22,.10,sgn*.62-.20,.30,12.87,-.05,seatFabricMat);
    intBox('seatHwR'+sgn,.10,.22,.10,sgn*.62+.20,.30,12.87,-.05,seatFabricMat);
    /* Seat back shoulder bolsters */
    intBox('seatSBL'+sgn,.08,.8,.09,sgn*.62-.235,-.27,12.87,-.04,seatFabricMat);
    intBox('seatSBR'+sgn,.08,.8,.09,sgn*.62+.235,-.27,12.87,-.04,seatFabricMat);
    /* Armrests – left and right */
    intBox('seatA'+sgn,.075,.055,.38,sgn*.62-sgn*.35,-.55,13.14,0,M.dark);
    intBox('seatAR'+sgn,.075,.055,.38,sgn*.62+sgn*.35,-.55,13.14,0,M.dark);
    /* Seat post / rail */
    intBox('seatPost'+sgn,.06,.28,.06,sgn*.62,-.9,13.22,0,metalFrameMat);
    intBox('seatRail'+sgn,.50,.04,.22,sgn*.62,-1.04,13.22,0,metalFrameMat);
  }

  /* Rudder pedals */
  (function(){
    const pedalMat=new BABYLON.PBRMaterial('pedalM',scene);
    pedalMat.albedoColor=new BABYLON.Color3(.38,.40,.42);pedalMat.metallic=.7;pedalMat.roughness=.55;
    /* Tread texture on pedal face */
    const pedTex=new BABYLON.DynamicTexture('pedTex',{width:64,height:64},scene,true);
    const ptc=pedTex.getContext();ptc.fillStyle='#444';ptc.fillRect(0,0,64,64);
    for(let r=0;r<5;r++)for(let c=0;c<5;c++){ptc.fillStyle='#333';ptc.fillRect(2+c*13,2+r*13,9,9);}
    pedTex.update(true);
    const pedFaceMat=new BABYLON.StandardMaterial('pedFaceM',scene);pedFaceMat.diffuseTexture=pedTex;pedFaceMat.emissiveTexture=pedTex;pedFaceMat.emissiveColor=new BABYLON.Color3(.4,.4,.4);pedFaceMat.backFaceCulling=false;

    for(const sgn of [-1,1]){  /* captain(L) / F/O(R) */
      const px=sgn*.62;
      for(const fp of [-1,1]){  /* left/right pedal of each set */
        const pz=15.2+fp*.09;
        /* pedal arm */
        const arm=BABYLON.MeshBuilder.CreateBox('pedArm'+sgn+fp,{width:.035,height:.28,depth:.035},scene);
        arm.position.set(px+fp*.12,-.82,pz-.05);arm.rotation.x=-.18;arm.material=pedalMat;arm.parent=interiorRoot;arm.isPickable=false;
        /* pedal face */
        const face=BABYLON.MeshBuilder.CreateBox('pedFace'+sgn+fp,{width:.12,height:.055,depth:.16},scene);
        face.position.set(px+fp*.12,-.68,pz);face.rotation.x=-.22;face.material=pedFaceMat;face.parent=interiorRoot;face.isPickable=false;
      }
      /* cross bar between pedals */
      const xbar=BABYLON.MeshBuilder.CreateBox('pedXbar'+sgn,{width:.28,height:.03,depth:.03},scene);
      xbar.position.set(px,-.84,15.18);xbar.material=pedalMat;xbar.parent=interiorRoot;xbar.isPickable=false;
    }
  })();
})();

const ohpTex=new BABYLON.DynamicTexture('ohpTex',{width:2048,height:512},scene,true);
(function drawOHP(){
  const c=ohpTex.getContext(),W=2048,H=512;
  const rr=(x,y,w,h,r)=>{c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();};
  const grd=c.createLinearGradient(0,0,0,H);
  grd.addColorStop(0,'#2e3238');grd.addColorStop(.5,'#232629');grd.addColorStop(1,'#16181b');
  c.fillStyle=grd;c.fillRect(0,0,W,H);
  c.globalAlpha=.05;for(let i=0;i<900;i++){c.fillStyle=Math.random()>.5?'#fff':'#000';c.fillRect(Math.random()*W,Math.random()*H,2,2);}c.globalAlpha=1;
  const SECTIONS=[['ELECTRICAL',8],['FUEL',6],['HYDRAULIC',6],['AIR COND',7],['ANTI-ICE',6],['LIGHTS',8],['CABIN PRESS',5]];
  const bw=56,bh=108,gap=8,pad=10,perRow=4;
  let colX=12;
  SECTIONS.forEach(([label,n],si)=>{
    const rows=Math.ceil(n/perRow),colW=perRow*(bw+gap)-gap+pad*2;
    c.strokeStyle='rgba(255,255,255,.08)';c.lineWidth=1;c.strokeRect(colX,14,colW,H-28);
    c.font='bold 15px Arial,sans-serif';c.fillStyle='#bcd2e4';c.textAlign='left';c.fillText(label,colX+pad,32);
    for(let i=0;i<n;i++){
      const x=colX+pad+(i%perRow)*(bw+gap),y=48+Math.floor(i/perRow)*(bh+14);
      const w=bw,h=bh;
      const seed=si*31+i;const t=Math.abs(Math.sin(seed*12.9898)*43758.5453%1);
      const guarded=t<.22,on=t>.78;
      c.fillStyle='#060607';rr(x-3,y-3,w+6,h+6,6);c.fill();
      const bg=c.createLinearGradient(x,y,x,y+h);bg.addColorStop(0,'#3d4248');bg.addColorStop(1,'#272a2e');
      c.fillStyle=bg;rr(x,y,w,h,5);c.fill();
      // toggle lever
      c.save();c.translate(x+w/2,y+h*.32);c.rotate(on?-.32:.32);
      const lg=c.createLinearGradient(-w*.17,0,w*.17,0);lg.addColorStop(0,'#111');lg.addColorStop(.5,'#555');lg.addColorStop(1,'#111');
      c.fillStyle=lg;rr(-w*.17,-4,w*.34,h*.5,4);c.fill();
      c.restore();
      // lit status window below the lever
      const lampOn=on||(!guarded&&t>.55);
      c.fillStyle=lampOn?(guarded?'#7a3a28':'#2f7a34'):'#111';
      rr(x+w*.18,y+h*.68,w*.64,h*.2,2);c.fill();
      if(lampOn){c.save();c.shadowColor=guarded?'#f84':'#6f6';c.shadowBlur=9;c.fillStyle=guarded?'#f95':'#8f8';rr(x+w*.18,y+h*.68,w*.64,h*.2,2);c.fill();c.restore();}
      c.strokeStyle='rgba(0,0,0,.6)';c.lineWidth=1;rr(x+w*.18,y+h*.68,w*.64,h*.2,2);c.stroke();
      c.fillStyle='rgba(255,255,255,.1)';c.fillRect(x,y,w,2);
      if(guarded){ // red-striped safety guard flipped up over the switch
        c.save();c.translate(x+w/2,y-2);c.rotate(-.5);
        const gw=w*.92,gh=h*.5;
        c.fillStyle='#8a1414';rr(-gw/2,-gh,gw,gh,3);c.fill();
        c.strokeStyle='rgba(255,255,255,.5)';c.lineWidth=1;
        for(let s=-gw/2;s<gw/2;s+=8){c.beginPath();c.moveTo(s,0);c.lineTo(s+gh*.6,-gh);c.stroke();}
        c.restore();
      }
    }
    colX+=colW+14;
  });
  ohpTex.update(true);
  ohpTex.anisotropicFilteringLevel=16;ohpTex.updateSamplingMode(BABYLON.Texture.TRILINEAR_SAMPLINGMODE);
})();
const ohpMesh=BABYLON.MeshBuilder.CreatePlane('ohp',{width:2.4,height:.6,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
ohpMesh.position.set(0,1.28,15.0);ohpMesh.rotation.x=Math.PI/2-.15;
ohpMesh.parent=interiorRoot;
ohpMesh.material=M.cockpitPanel.clone('ohpM');
ohpMesh.material.albedoTexture=ohpTex;ohpMesh.material.emissiveTexture=ohpTex;
ohpMesh.material.emissiveColor=new BABYLON.Color3(.4,.4,.42);ohpMesh.isPickable=false;

for(const sgn of [1,-1]){
  const visor=BABYLON.MeshBuilder.CreateBox('visor'+sgn,{width:.55,height:.02,depth:.35},scene);
  visor.position.set(sgn*.55,1.0,15.3);visor.rotation.x=-.5;
  visor.material=M.cockpitPanel;visor.parent=interiorRoot;
}

const cockpitLight=new BABYLON.PointLight('cpL',new BABYLON.Vector3(0,.7,14),scene);
cockpitLight.parent=interiorRoot;cockpitLight.intensity=1.8;cockpitLight.range=7;
cockpitLight.diffuse=new BABYLON.Color3(1,.95,.85);cockpitLight.setEnabled(false);
const cockpitLight2=new BABYLON.PointLight('cpL2',new BABYLON.Vector3(0,-.6,14.2),scene);
cockpitLight2.parent=interiorRoot;cockpitLight2.intensity=1.2;cockpitLight2.range=5;
cockpitLight2.diffuse=new BABYLON.Color3(.75,.9,1);cockpitLight2.setEnabled(false);

(function(){
const DS=BABYLON.Mesh.DOUBLESIDE;
function cvs(w,h,draw){const t=new BABYLON.DynamicTexture('ut'+Math.random(),{width:w,height:h},scene,true);draw(t.getContext(),w,h);t.update(true);return t;}
function tmat(t,e){const m=new BABYLON.StandardMaterial('um'+Math.random(),scene);m.diffuseTexture=t;m.emissiveTexture=t;m.emissiveColor=new BABYLON.Color3(e,e,e);m.specularColor=new BABYLON.Color3(.12,.12,.12);m.backFaceCulling=false;return m;}
function tpl(n,w,h,x,y,z,rx,ry,m){const p=BABYLON.MeshBuilder.CreatePlane(n,{width:w,height:h,sideOrientation:DS},scene);p.position.set(x,y,z);p.rotation.set(rx,ry||0,0);p.material=m;p.parent=interiorRoot;p.isPickable=false;return p;}
function cyl(n,d,h,x,y,z,rx,rz,m){const c=BABYLON.MeshBuilder.CreateCylinder(n,{diameter:d,height:h,tessellation:24},scene);c.position.set(x,y,z);c.rotation.x=rx||0;c.rotation.z=rz||0;c.material=m;c.parent=interiorRoot;c.isPickable=false;return c;}
const rect=(c,x,y,w,h,f)=>{c.fillStyle=f;c.fillRect(x,y,w,h);};
const dot=(c,x,y,r,f)=>{c.fillStyle=f;c.beginPath();c.arc(x,y,r,0,6.2832);c.fill();};
const knob=(c,x,y,r)=>{dot(c,x,y,r+2,'#08090a');const g=c.createRadialGradient(x-r/3,y-r/3,1,x,y,r);g.addColorStop(0,'#8a9096');g.addColorStop(1,'#2a2d31');c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,6.2832);c.fill();c.strokeStyle='#eee';c.lineWidth=Math.max(1.5,r/5);c.beginPath();c.moveTo(x,y);c.lineTo(x,y-r);c.stroke();};
const lamp=(c,x,y,w,h,col,txt,tc)=>{rect(c,x,y,w,h,'#050505');rect(c,x+2,y+2,w-4,h-4,col);if(txt){c.fillStyle=tc||'#111';c.font='bold '+Math.floor(h*.3)+'px sans-serif';c.textAlign='center';c.fillText(txt,x+w/2,y+h*.62);}};
const tog=(c,x,y)=>{dot(c,x,y,11,'#0a0a0a');c.strokeStyle='#c8ccd0';c.lineWidth=6;c.beginPath();c.moveTo(x,y);c.lineTo(x,y-17);c.stroke();dot(c,x,y-18,5,'#e8ecef');};

const _mcpDraw=(c,W,H)=>{
 const st=window._mcpSt||{},on=st.on||{SPEED:1,VNAV:1,'HDG SEL':1,'ALT HLD':1,LNAV:1},hov=st.hov;
 rect(c,0,0,W,H,'#202327');rect(c,0,0,W,5,'#33383e');
 const win=(x,t,l)=>{c.fillStyle='#050505';c.fillRect(x,30,120,44);c.fillStyle='#ffb020';c.font='bold 38px monospace';c.textAlign='center';c.fillText(t,x+60,66);c.fillStyle='#b8c0c8';c.font='bold 13px sans-serif';c.fillText(l,x+60,22);};
 win(110,st.crs||'260','COURSE');win(460,st.spd||'250',st.speedLabel||'IAS');win(700,st.hdg||'090','HEADING');win(1010,st.alt||'05000','ALTITUDE');win(1340,st.crs||'260','COURSE');
 const b=(x,t)=>{rect(c,x,38,52,34,'#3a3f46');rect(c,x+6,42,40,6,on[t]?'#4dff7a':'#1b3a24');c.fillStyle='#e8e8e8';c.font='bold 11px sans-serif';c.textAlign='center';c.fillText(t,x+26,64);};
 b(250,'N1');b(310,'SPEED');b(370,'LVL CHG');b(590,'VNAV');b(850,'HDG SEL');b(910,'APP');b(1160,'ALT HLD');b(1220,'V/S');b(1280,'LNAV');
 [40,330,540,660,850,970,1180,1480].forEach((x,i)=>{if(i<2||i===7)knob(c,x+(i===7?-20:0),55,16);});
 lamp(c,1160,80,60,22,st.cmdA?'#1f6f34':'#333','CMD A',st.cmdA?'#cfc':'#aaa');lamp(c,1230,80,60,22,st.cmdB?'#1f6f34':'#333','CMD B',st.cmdB?'#cfc':'#aaa');
 const small=(x,w,label,on,color)=>{rect(c,x,80,w,28,on?(color||'#155638'):'#30343a');c.strokeStyle=on?'#92e8b4':'#68717a';c.lineWidth=1;c.strokeRect(x+.5,80.5,w-1,27);c.fillStyle='#e6edf2';c.font='bold 10px sans-serif';c.textAlign='center';c.fillText(label,x+w/2,98);};
 small(10,65,'F/D L',st.fdL,'#155638');small(80,65,'F/D R',st.fdR,'#155638');
 small(450,80,'A/T ARM',st.athrArmed);small(540,75,st.thrustMode==='CON'?'CON':'CLB',true);
 small(615,80,'AP DISC',st.apInhibit,'#8e2020');
 small(700,80,'A/T ENG',st.athr);
 small(805,70,st.trackMode?'TRK':'HDG',st.trackMode);
 small(880,60,'LOC',st.locMode);small(945,60,'BANK '+(st.bankMode||st.bankLimit),st.bankLimit!==25);
 small(1010,50,'FPA',st.fpaMode);small(1065,40,'ALT INT',false);
 small(1108,40,'STEP '+(st.altIncrement||'AUTO'),st.altIncrement==='1000');
 small(400,45,'SEL',st.speedUnit==='MACH');
 if(hov){c.strokeStyle='#5fe3ff';c.lineWidth=3;c.strokeRect(hov[0]-2,hov[1]-2,hov[2]+4,hov[3]+4);}
};
window._mcpDraw=_mcpDraw;const mcp=cvs(1536,110,_mcpDraw);
tpl('mcpP',1.5,.107,0,.115,14.97,.35,0,tmat(mcp,.85));

(function(){const c=panelCanvas,W=1024,H=297;
 for(let i=0;i<40;i++){dot(c,12+i*25.6,5,1.6,'#55595e');dot(c,12+i*25.6,H-5,1.6,'#55595e');}
 rect(c,0,0,W,60,'#1d2024');
 lamp(c,20,10,52,40,'#d01818','FIRE WARN','#fff');lamp(c,80,10,60,40,'#e8a010','MASTER CAUTION');
 lamp(c,884,10,60,40,'#e8a010','MASTER CAUTION');lamp(c,952,10,52,40,'#d01818','FIRE WARN','#fff');
 [470,505,540].forEach(x=>lamp(c,x,14,28,22,'#16d04a'));c.fillStyle='#9fb5c9';c.font='bold 10px sans-serif';c.textAlign='center';c.fillText('GEAR',522,50);
 [[20,165],[225,165],[402,220],[634,165],[839,165]].forEach(([x,w])=>{
  for(let i=0;i<6;i++)rect(c,x+8+i*(w-50)/5,246,18,12,'#3c4046');knob(c,x+w-14,270,9);knob(c,x+14,270,9);});
 panelTex.update(true);})();

const ohp=cvs(2048,512,(c,W,H)=>{
 rect(c,0,0,W,H,'#2d3238');
 const names=['FLT CONTROL','NAV / DISPLAYS','ELECTRICAL','FUEL / HYD','ANTI-ICE','AIR COND','LIGHTS','ENG / APU'];
 const lit=['#5a3d10','#103a5a','#14502a','#5a1414'],on=['#ffb020','#2aa0ff','#2fe070','#ff3030'];
 names.forEach((n,g)=>{const gx=g*256+10;
  c.strokeStyle='#d8dde2';c.lineWidth=2;c.strokeRect(gx,12,236,H-24);
  c.fillStyle='#d8dde2';c.font='bold 16px sans-serif';c.textAlign='center';c.fillText(n,gx+118,34);
  for(let r=0;r<2;r++)for(let i=0;i<4;i++){const k=(i+r*2+g)%4;lamp(c,gx+10+i*57,46+r*40,52,34,(i*7+r*3+g)%5===0?on[k]:lit[k]);}
  for(let i=0;i<4;i++)tog(c,gx+34+i*56,160);
  for(let i=0;i<4;i++)tog(c,gx+34+i*56,230);
  knob(c,gx+60,330,26);knob(c,gx+176,330,26);
  for(let i=0;i<4;i++)lamp(c,gx+10+i*57,400,52,34,lit[(i+g)%4]);
  c.fillStyle='#9aa4ad';c.font='11px sans-serif';for(let i=0;i<4;i++){c.fillText('SW'+(i+1),gx+34+i*56,180);c.fillText('SW'+(i+5),gx+34+i*56,250);}
 });});
ohpMesh.material.albedoTexture=ohp;ohpMesh.material.emissiveTexture=ohp;

function cduTex2(){return cvs(300,360,(c,W,H)=>{
 rect(c,0,0,W,H,'#1b1d20');rect(c,18,14,264,150,'#020a05');
 c.fillStyle='#35ff8a';c.font='bold 16px monospace';c.textAlign='left';
 ['     TAKEOFF REF 1/2','RWY 25C    FLAPS 5','CG 23.1%    TRIM 4.5','V1 138  VR 140  V2 146','ACTIVE ROUTE   LSZH','<INDEX      THRUST LIM>'].forEach((s,i)=>c.fillText(s,24,38+i*22));
 for(let i=0;i<6;i++){rect(c,2,28+i*22,12,14,'#585c62');rect(c,286,28+i*22,12,14,'#585c62');}
 ['INIT','RTE','CLB','CRZ','DES','DIR','LEGS','HOLD','PROG','EXEC'].forEach((k,i)=>{const x=18+(i%5)*54,y=176+Math.floor(i/5)*22;rect(c,x,y,48,17,'#3b3f45');c.fillStyle='#ddd';c.font='9px sans-serif';c.textAlign='center';c.fillText(k,x+24,y+12);});
 for(let r=0;r<5;r++)for(let i=0;i<6;i++){const x=18+i*44,y=228+r*25;rect(c,x,y,38,20,'#2c3035');c.fillStyle='#e4e4e4';c.font='bold 12px sans-serif';c.textAlign='center';c.fillText(String.fromCharCode(65+(r*6+i)%26),x+19,y+14);}
});}
const cm=tmat(cduTex2(),.8);
[-1,1].forEach(s=>{intBox('cduB'+s,.25,.1,.34,s*.4,-.41,14.8,0,M.cockpitPanel);tpl('cduN'+s,.23,.28,s*.4,-.29,14.8,1.0,0,cm);});
cduMesh.setEnabled(false);
const rad=cvs(400,640,(c,W,H)=>{
 rect(c,0,0,W,H,'#202327');
 for(let p=0;p<2;p++){const y=14+p*150;rect(c,10,y,380,136,'#2b2f34');
  c.fillStyle='#050505';c.fillRect(24,y+14,160,38);c.fillRect(204,y+14,160,38);
  c.fillStyle='#ffb020';c.font='bold 28px monospace';c.textAlign='center';c.fillText(p?'123.450':'118.300',104,y+44);c.fillText(p?'121.500':'131.925',284,y+44);
  knob(c,70,y+98,22);knob(c,330,y+98,22);for(let i=0;i<6;i++)rect(c,130+i*22,y+84,16,14,'#444');}
 rect(c,10,320,380,120,'#2b2f34');c.fillStyle='#050505';c.fillRect(30,334,110,36);c.fillStyle='#ffb020';c.font='bold 26px monospace';c.textAlign='center';c.fillText('2000',85,362);
 for(let r=0;r<2;r++)for(let i=0;i<4;i++){rect(c,170+i*52,334+r*42,44,34,'#444');}
 [0,1,2].forEach(i=>lamp(c,30+i*60,396,52,30,['#2fe070','#ffb020','#2aa0ff'][i]));
 rect(c,10,452,380,176,'#2b2f34');c.fillStyle='#9fb5c9';c.font='bold 13px sans-serif';c.fillText('AILERON TRIM    RUDDER TRIM',200,474);
 knob(c,100,550,34);knob(c,300,550,34);lamp(c,150,600,100,22,'#16d04a','FUEL');
});
tpl('radP',.5,.8,0,-.287,13.8,Math.PI/2,0,tmat(rad,.7));
[-1,1].forEach(s=>{cyl('trimW'+s,.26,.04,s*.3,-.42,14.0,0,Math.PI/2,M.dark);cyl('trimS'+s,.03,.042,s*.3,-.42,14.0,0,Math.PI/2,M.white);cyl('trimH'+s,.03,.05,s*.31,-.42,14.0,0,Math.PI/2,M.metal);});
intBox('gearPlate',.19,.25,.035,.22,-.34,14.99,0,M.bezel);
intBox('gearSlot',.045,.17,.012,.22,-.34,14.966,0,M.dark);
const gearLeverPivot=new BABYLON.TransformNode('gearLeverPivot',scene);
gearLeverPivot.parent=interiorRoot;gearLeverPivot.position.set(.22,-.34,14.95);
const gearS=BABYLON.MeshBuilder.CreateCylinder('gearS',{height:.15,diameter:.022,tessellation:12},scene);
gearS.position.set(0,.075,0);gearS.material=M.metal;gearS.parent=gearLeverPivot;
const gearK=BABYLON.MeshBuilder.CreateBox('gearK',{width:.085,height:.065,depth:.06},scene);
gearK.position.set(0,.15,0);gearK.material=M.white;gearK.parent=gearLeverPivot;

const cb=cvs(1024,600,(c,W,H)=>{rect(c,0,0,W,H,'#1d2024');
 for(let r=0;r<12;r++){c.fillStyle='#9aa4ad';c.font='11px sans-serif';c.fillText('C'+(r+1),6,40+r*46);for(let i=0;i<40;i++)dot(c,50+i*23.5,34+r*46,7,(i*13+r*7)%11===0?'#c0392b':'#dfe3e6');}});
const cbm=tmat(cb,.5);
[-1,1].forEach(s=>tpl('cbP'+s,1.4,.8,s*1.535,.35,13.5,0,-s*Math.PI/2,cbm));

try{M.seat.albedoColor=new BABYLON.Color3(.74,.72,.66);M.seat.roughness=1;M.seat.metallic=0;}catch(e){}
})();

/* ===== INTERACTIVE COCKPIT (hover highlight + tooltip, click switches / buttons / levers, scroll knobs) ===== */
const DSP={page:'ENG',cancelled:[],warnAck:false,cautionAck:false};
(function(){
  const CKI=window.CKI={tex:{},meshSpecs:[],hover:null,drag:null,hinted:false};
  const $=id=>document.getElementById(id);
  const dispatchKey=code=>{window.dispatchEvent(new KeyboardEvent('keydown',{code}));window.dispatchEvent(new KeyboardEvent('keyup',{code}));};
  const say=(t,ms)=>{try{showMsg(t,ms||1500);}catch(e){}};
  /* ---- tiny synthesized click / chime so every control gives feedback ---- */
  let _ac=null;
  function snd(kind){
    try{
      _ac=_ac||new (window.AudioContext||window.webkitAudioContext)();if(_ac.state==='suspended')_ac.resume();
      const t=_ac.currentTime,g=_ac.createGain(),o=_ac.createOscillator();o.connect(g);g.connect(_ac.destination);
      const tone=(f0,f1,dur,v,type)=>{o.type=type||'square';o.frequency.setValueAtTime(f0,t);o.frequency.exponentialRampToValueAtTime(f1,t+dur);g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.start(t);o.stop(t+dur+.02);};
      if(kind==='sw')tone(420,120,.06,.09);else if(kind==='knob')tone(900,500,.03,.05,'triangle');else if(kind==='lever')tone(180,70,.12,.12,'sawtooth');
      else if(kind==='chime'){tone(1046,1046,.35,.1,'sine');const o2=_ac.createOscillator(),g2=_ac.createGain();o2.connect(g2);g2.connect(_ac.destination);o2.type='sine';o2.frequency.setValueAtTime(784,t+.18);g2.gain.setValueAtTime(.0001,t);g2.gain.setValueAtTime(.1,t+.18);g2.gain.exponentialRampToValueAtTime(.0001,t+.7);o2.start(t+.18);o2.stop(t+.75);}
      else tone(1500,700,.04,.07);
    }catch(e){}
  }
  CKI.snd=snd;
  /* ---- registry helpers ---- */
  CKI.addTex=(meshName,w,h,painter)=>{CKI.tex[meshName]={w,h,specs:[],paint:painter};const m=scene.getMeshByName(meshName);if(m){m.isPickable=true;m.metadata=Object.assign(m.metadata||{},{hot:true});}return CKI.tex[meshName];};
  CKI.rect=(meshName,rect,spec)=>{spec.rect=rect;spec.mesh=meshName;CKI.tex[meshName].specs.push(spec);return spec;};
  CKI.addMesh=(names,spec)=>{const list=[];names.forEach(n=>{const m=scene.getMeshByName(n);if(m){m.isPickable=true;m.metadata=Object.assign(m.metadata||{},{hot:true});list.push(m);}});spec.meshes=list;spec.names=names;CKI.meshSpecs.push(spec);return spec;};

  const setDSPPage=page=>{
    DSP.page=page;say('EICAS '+page+' PAGE');
    const overlay=page==='CDU'?'fms':page==='COMM'?'atc':null,el=overlay&&document.getElementById(overlay);
    if(el&&!el.classList.contains('show'))dispatchKey(page==='CDU'?'KeyJ':'KeyK');
  };
  window._setDSPPage=setDSPPage;
  const panelBase=panelCanvas.getImageData(0,0,1024,297);
  const paintPanelControls=()=>{
    panelCanvas.putImageData(panelBase,0,0);
    const btn=(x,y,w,h,label,color,on)=>{
      panelCanvas.fillStyle='#050607';panelCanvas.fillRect(x,y,w,h);
      panelCanvas.fillStyle=on?color:'#24282d';panelCanvas.fillRect(x+2,y+2,w-4,h-4);
      panelCanvas.strokeStyle=on?'#fff':'#59616a';panelCanvas.lineWidth=1;panelCanvas.strokeRect(x+2.5,y+2.5,w-5,h-5);
      panelCanvas.fillStyle='#f0f3f5';panelCanvas.font='bold 6px sans-serif';panelCanvas.textAlign='center';panelCanvas.textBaseline='middle';
      panelCanvas.fillText(label,x+w/2,y+h/2);
    };
    const alerts=window._cockpitAlerts||{warning:false,caution:false};
    btn(20,10,52,40,'MASTER WARN','#c31f1f',alerts.warning&&!DSP.warnAck);
    btn(80,10,60,40,'MASTER CAUT','#a76d0d',alerts.caution&&!DSP.cautionAck);
    btn(952,10,52,40,'MASTER WARN','#c31f1f',alerts.warning&&!DSP.warnAck);
    btn(884,10,60,40,'MASTER CAUT','#a76d0d',alerts.caution&&!DSP.cautionAck);
    btn(610,10,58,40,'CANC','#303a45',false);btn(680,10,58,40,'RCL','#303a45',false);
    const labels=['SYS','CDU','INFO','CHKL','COMM','ND'];
    labels.forEach((label,i)=>{
      const x=410+i*34;
      btn(x,238,24,21,label,DSP.page===label?'#156343':'#303a45',DSP.page===label);
    });
    panelCanvas.textBaseline='alphabetic';panelTex.update(true);
  };
  CKI.addTex('panel',1024,297,paintPanelControls);
  const panelRect=(x,y,w,h,label,act)=>CKI.rect('panel',[x,y,w,h],{label,state:()=>label,act});
  const acknowledgeWarning=()=>{DSP.warnAck=true;stopAllCallouts();};
  const acknowledgeCaution=()=>{DSP.cautionAck=true;};
  [20,952].forEach(x=>panelRect(x,10,52,40,'MASTER WARNING · silence current aural alert',acknowledgeWarning));
  [80,884].forEach(x=>panelRect(x,10,60,40,'MASTER CAUTION · acknowledge caution',acknowledgeCaution));
  panelRect(610,10,58,40,'CANC · cancel cautions on current EICAS page',()=>{
    DSP.cancelled=[...new Set(DSP.cancelled.concat(faults.list().filter(name=>(FAULTS[name]?.sev||1)<3)))];
    say('EICAS CAUTIONS CANCELLED');
  });
  panelRect(680,10,58,40,'RCL · recall cancelled active messages',()=>{DSP.cancelled=[];say('EICAS MESSAGES RECALLED');});
  ['SYS','CDU','INFO','CHKL','COMM','ND'].forEach((page,i)=>panelRect(410+i*34,238,24,21,'DISPLAY SELECT · '+page,()=>setDSPPage(page)));
  let panelHash='';
  setInterval(()=>{
    const h=JSON.stringify([DSP.page,DSP.cancelled,DSP.warnAck,DSP.cautionAck,window._cockpitAlerts]);
    if(h!==panelHash){panelHash=h;paintPanelControls();}
  },250);

  const setMinimum=value=>{MINS.dh=Math.max(0,Math.min(5000,Math.round(value/10)*10));MINS.last=9999;
  const input=document.getElementById('minsIn');if(input)input.value=String(MINS.dh);};
  const setBaro=delta=>{EFIS.baroHpa=Math.max(870,Math.min(1085,EFIS.baroHpa+delta*(EFIS.baroUnit==='HPA'?1:.338639)));};
  const resetMinimums=()=>{MINS.last=9999;MINS.hit=false;MINS.appr=false;};
  ['dPfdL','dPfdR'].forEach(mesh=>{
    CKI.addTex(mesh,640,640,()=>{});
    const add=(i,label,act,wheel)=>CKI.rect(mesh,[i*640/6+1,43,640/6-2,15],{label,state:label,act,wheel});
    add(0,'MINS SOURCE · RADIO / BARO',()=>{EFIS.minsSource=EFIS.minsSource==='RADIO'?'BARO':'RADIO';resetMinimums();},d=>setMinimum(MINS.dh+d*10));
    add(1,'MINIMUMS RESET',resetMinimums);
    add(2,'BARO SETTING · SELECT IN / HPA',()=>{EFIS.baroUnit=EFIS.baroUnit==='HPA'?'IN':'HPA';},d=>setBaro(d));
    add(3,'STD · 1013.25 HPA / 29.92 IN',()=>{EFIS.baroHpa=1013.25;});
    add(4,'FLIGHT PATH VECTOR',()=>{EFIS.fpv=!EFIS.fpv;});
    add(5,'ALTITUDE IN METERS',()=>{EFIS.meters=!EFIS.meters;});
  });
  const bearingCycle=side=>{const k=side==='L'?'bearingL':'bearingR';ND[k]=ND[k]==='VOR'?'ADF':ND[k]==='ADF'?'OFF':'VOR';};
  ['dNdL','dNdR'].forEach(mesh=>{
    CKI.addTex(mesh,640,640,()=>{});
    ['APP','VOR','MAP','PLN'].forEach((mode,i)=>CKI.rect(mesh,[i*80,2,80,22],{label:'ND MODE · '+mode,state:()=>ND.mode===mode?'ON':'OFF',act:()=>{ND.mode=mode;}}));
    CKI.rect(mesh,[320,2,80,22],{label:'ND CENTER · ARC / 360',state:()=>ND.center?'360':'ARC',act:()=>{ND.center=!ND.center;}});
    CKI.rect(mesh,[400,2,80,22],{label:'TCAS TRAFFIC',state:()=>ND.tfc?'ON':'OFF',act:()=>{ND.tfc=!ND.tfc;}});
    CKI.rect(mesh,[480,2,80,22],{label:'LEFT BEARING POINTER · VOR / ADF / OFF',state:()=>ND.bearingL,act:()=>bearingCycle('L')});
    CKI.rect(mesh,[560,2,80,22],{label:'RIGHT BEARING POINTER · VOR / ADF / OFF',state:()=>ND.bearingR,act:()=>bearingCycle('R')});
    Object.keys(ND.overlays).forEach((name,i)=>CKI.rect(mesh,[i*640/7,26,640/7,22],{
      label:'ND OVERLAY · '+name,state:()=>ND.overlays[name]?'ON':'OFF',act:()=>{ND.overlays[name]=!ND.overlays[name];}
    }));
  });

  /* ============ OVERHEAD PANEL (8 groups x 8 toggles + 2 knobs) ============ */
  const ohpM=scene.getMeshByName('ohp');
  if(ohpM&&ohpM.material&&ohpM.material.emissiveTexture){
    const T=ohpM.material.emissiveTexture,c=T.getContext(),W=2048,H=512,base=c.getImageData(0,0,W,H);
    const BG='#2d3238',litC=['#5a3d10','#103a5a','#14502a','#5a1414'],onC=['#ffb020','#2aa0ff','#2fe070','#ff3030'];
    const pad=(n,l)=>String(Math.round(n)).padStart(l,'0');
    const D={}; // key g_r_i -> {label,get,act,cos}
    const def=(g,r,i,label,get,act,tip,display)=>{D[g+'_'+r+'_'+i]={label,get,act,tip,display,cos:!get,on:true};};
    // FLT CONTROL
    def(0,0,0,'A/P',()=>!!AP.master,()=>dispatchKey('KeyP'),'AUTOPILOT');def(0,0,1,'A/THR',()=>!!AP.athr,()=>dispatchKey('KeyT'),'AUTOTHROTTLE');
    def(0,0,2,'F/D',()=>AP.fd!==false,()=>{AP.fd=!(AP.fd!==false);EFIS.fdL=AP.fd;EFIS.fdR=AP.fd;},'FLIGHT DIRECTOR');def(0,0,3,'YAW D',()=>AP.yd!==false,()=>{AP.yd=!(AP.yd!==false);},'YAW DAMPER');
    def(0,1,0,'FLAP',()=>plane.flaps>0,()=>dispatchKey('KeyF'),'FLAPS (cycle)');def(0,1,1,'SPLR',()=>plane.spoilerDeploy>.5,()=>dispatchKey('KeyB'),'SPOILERS');
    def(0,1,2,'GEAR',()=>!!plane.gearDown,()=>dispatchKey('KeyG'),'LANDING GEAR');
    const gpwsModes=[['TERR','terrainOverride'],['GEAR','gearOverride'],['FLAP','flapOverride'],['G/S','glideslopeInhibit']];
    let gpwsSelected=0;
    def(0,1,3,'GPWS',()=>!!AIRSYS.gpws[gpwsModes[gpwsSelected][1]],()=>{
      const key=gpwsModes[gpwsSelected][1];AIRSYS.gpws[key]=!AIRSYS.gpws[key];
      say(gpwsModes[gpwsSelected][0]+' '+(AIRSYS.gpws[key]?'OVERRIDE':'NORMAL'));
    },'GPWS OVERRIDE · rotate FLT CONTROL selector to choose TERR / GEAR / FLAP / G/S',
      ()=>gpwsModes[gpwsSelected][0]+' '+(AIRSYS.gpws[gpwsModes[gpwsSelected][1]]?'OVRD':'NORM'));
    // NAV / DISPLAYS
    def(1,0,0,'PFD',()=>!document.body.classList.contains('pfd-hidden'),()=>dispatchKey('KeyX'),'HUD PFD overlay');
    def(1,0,1,'MAP',()=>{const f=$('fms');return !!f&&f.classList.contains('show');},()=>dispatchKey('KeyJ'),'FMS / MAP (J)');
    def(1,0,2,'ATC',()=>{const f=$('atc');return !!f&&f.classList.contains('show');},()=>dispatchKey('KeyK'),'ATC (K)');
    def(1,0,3,'FPV',()=>EFIS.fpv,()=>{EFIS.fpv=!EFIS.fpv;},'FLIGHT PATH VECTOR');
    def(1,1,0,'APPR',()=>!!AP.appr,()=>{if(!AP.master){say('ENGAGE A/P FIRST');return;}AP.appr=!AP.appr;AP.locMode=AP.appr;AP.lnav=false;say('APPROACH '+(AP.appr?'ARMED · LOC/GS':'OFF'));},'ILS APPROACH MODE');
    def(1,1,1,'ILS',()=>ILSP.on,()=>{ILSP.on=!ILSP.on;say('ILS PATH '+(ILSP.on?'ON':'OFF'));},'PURPLE ILS PATH');
    def(1,1,2,'MTRS',()=>EFIS.meters,()=>{EFIS.meters=!EFIS.meters;},'PFD ALTITUDE IN METERS');
    def(1,1,3,'TFC',()=>ND.tfc,()=>{ND.tfc=!ND.tfc;},'ND TCAS TRAFFIC');
    // ELECTRICAL
    def(2,0,0,'BAT',()=>ENG.battery,()=>{ENG.battery=!ENG.battery;say('BATTERY '+(ENG.battery?'ON':'OFF'));},'BATTERY BUS');
    def(2,0,1,'GEN L',()=>window._genL!==false,()=>{window._genL=!(window._genL!==false);say('LEFT GENERATOR '+(window._genL?'ON':'OFF'));},'LEFT ENGINE GENERATOR');
    def(2,0,2,'GEN R',()=>window._genR!==false,()=>{window._genR=!(window._genR!==false);say('RIGHT GENERATOR '+(window._genR?'ON':'OFF'));},'RIGHT ENGINE GENERATOR');
    def(2,0,3,'APU GEN',()=>window._apuGen!==false,()=>{window._apuGen=!(window._apuGen!==false);say('APU GENERATOR '+(window._apuGen?'ON':'OFF'));},'APU GENERATOR');
    def(2,1,0,'EXT PWR',()=>AIRSYS.electrical.extPower,()=>{AIRSYS.electrical.extPower=!AIRSYS.electrical.extPower;say('EXTERNAL POWER '+(AIRSYS.electrical.extPower?'CONNECTED':'DISCONNECTED'));},'EXTERNAL POWER');
    def(2,1,1,'BUS TIE',()=>AIRSYS.electrical.busTie,()=>{AIRSYS.electrical.busTie=!AIRSYS.electrical.busTie;say('BUS TIE '+(AIRSYS.electrical.busTie?'AUTO':'ISOLATED'));},'BUS TIE');
    def(2,1,2,'TOW PWR',()=>AIRSYS.electrical.towingPower,()=>{AIRSYS.electrical.towingPower=!AIRSYS.electrical.towingPower;say('TOWING POWER '+(AIRSYS.electrical.towingPower?'ON':'OFF'));},'GROUND TOWING POWER');
    def(2,1,3,'UTIL',()=>AIRSYS.electrical.utility,()=>{AIRSYS.electrical.utility=!AIRSYS.electrical.utility;say('UTILITY BUS '+(AIRSYS.electrical.utility?'ON':'OFF'));},'UTILITY BUS');
    // FUEL / HYDRAULICS
    def(3,0,0,'L PUMP',()=>AIRSYS.fuel.leftPump,()=>{AIRSYS.fuel.leftPump=!AIRSYS.fuel.leftPump;syncFuelPumps();say('LEFT MAIN FUEL PUMP '+(AIRSYS.fuel.leftPump?'ON':'OFF'));},'LEFT MAIN FUEL PUMP');
    def(3,0,1,'R PUMP',()=>AIRSYS.fuel.rightPump,()=>{AIRSYS.fuel.rightPump=!AIRSYS.fuel.rightPump;syncFuelPumps();say('RIGHT MAIN FUEL PUMP '+(AIRSYS.fuel.rightPump?'ON':'OFF'));},'RIGHT MAIN FUEL PUMP');
    def(3,0,2,'CTR L',()=>AIRSYS.fuel.centerLeft,()=>{AIRSYS.fuel.centerLeft=!AIRSYS.fuel.centerLeft;syncFuelPumps();say('LEFT CENTER FUEL PUMP '+(AIRSYS.fuel.centerLeft?'ON':'OFF'));},'LEFT CENTER TANK FUEL PUMP');
    def(3,0,3,'CTR R',()=>AIRSYS.fuel.centerRight,()=>{AIRSYS.fuel.centerRight=!AIRSYS.fuel.centerRight;syncFuelPumps();say('RIGHT CENTER FUEL PUMP '+(AIRSYS.fuel.centerRight?'ON':'OFF'));},'RIGHT CENTER TANK FUEL PUMP');
    def(3,1,0,'L ENG HYD',()=>AIRSYS.hydraulic.leftEngine,()=>{AIRSYS.hydraulic.leftEngine=!AIRSYS.hydraulic.leftEngine;say('LEFT ENGINE HYD PUMP '+(AIRSYS.hydraulic.leftEngine?'ON':'OFF'));},'LEFT ENGINE HYDRAULIC PUMP');
    def(3,1,1,'ELEC A',()=>AIRSYS.hydraulic.systemAElectric,()=>{AIRSYS.hydraulic.systemAElectric=!AIRSYS.hydraulic.systemAElectric;say('HYDRAULIC SYSTEM A ELECTRIC PUMP '+(AIRSYS.hydraulic.systemAElectric?'ON':'OFF'));},'HYDRAULIC SYSTEM A ELECTRIC PUMP');
    def(3,1,2,'ELEC B',()=>AIRSYS.hydraulic.systemBElectric,()=>{AIRSYS.hydraulic.systemBElectric=!AIRSYS.hydraulic.systemBElectric;say('HYDRAULIC SYSTEM B ELECTRIC PUMP '+(AIRSYS.hydraulic.systemBElectric?'ON':'OFF'));},'HYDRAULIC SYSTEM B ELECTRIC PUMP');
    def(3,1,3,'R ENG HYD',()=>AIRSYS.hydraulic.rightEngine,()=>{AIRSYS.hydraulic.rightEngine=!AIRSYS.hydraulic.rightEngine;say('RIGHT ENGINE HYD PUMP '+(AIRSYS.hydraulic.rightEngine?'ON':'OFF'));},'RIGHT ENGINE HYDRAULIC PUMP');
    // ANTI-ICE
    def(4,0,0,'WING',()=>!!window._antiIceOn,()=>{if(window._toggleAntiIce)window._toggleAntiIce();else say('ANTI-ICE NOT READY');AIRSYS.antiIce.wing=!!window._antiIceOn;},'WING ANTI-ICE');
    def(4,0,1,'ENG L',()=>AIRSYS.antiIce.engineLeft,()=>{AIRSYS.antiIce.engineLeft=!AIRSYS.antiIce.engineLeft;say('LEFT ENGINE ANTI-ICE '+(AIRSYS.antiIce.engineLeft?'ON':'OFF'));},'LEFT ENGINE ANTI-ICE');
    def(4,0,2,'ENG R',()=>AIRSYS.antiIce.engineRight,()=>{AIRSYS.antiIce.engineRight=!AIRSYS.antiIce.engineRight;say('RIGHT ENGINE ANTI-ICE '+(AIRSYS.antiIce.engineRight?'ON':'OFF'));},'RIGHT ENGINE ANTI-ICE');
    def(4,0,3,'WIN L',()=>AIRSYS.antiIce.windowLeft,()=>{AIRSYS.antiIce.windowLeft=!AIRSYS.antiIce.windowLeft;say('LEFT WINDOW HEAT '+(AIRSYS.antiIce.windowLeft?'ON':'OFF'));},'LEFT WINDOW HEAT');
    def(4,1,0,'WIN R',()=>AIRSYS.antiIce.windowRight,()=>{AIRSYS.antiIce.windowRight=!AIRSYS.antiIce.windowRight;say('RIGHT WINDOW HEAT '+(AIRSYS.antiIce.windowRight?'ON':'OFF'));},'RIGHT WINDOW HEAT');
    def(4,1,1,'WIP L',()=>AIRSYS.antiIce.wiperLeft!=='OFF',()=>{AIRSYS.antiIce.wiperLeft=AIRSYS.antiIce.wiperLeft==='OFF'?'INT':'OFF';say('LEFT WIPER '+AIRSYS.antiIce.wiperLeft);},'LEFT WINDSHIELD WIPER');
    def(4,1,2,'WIP R',()=>AIRSYS.antiIce.wiperRight!=='OFF',()=>{AIRSYS.antiIce.wiperRight=AIRSYS.antiIce.wiperRight==='OFF'?'INT':'OFF';say('RIGHT WIPER '+AIRSYS.antiIce.wiperRight);},'RIGHT WINDSHIELD WIPER');
    def(4,1,3,'RAIN',()=>AIRSYS.antiIce.rainRepellent,()=>{AIRSYS.antiIce.rainRepellent=!AIRSYS.antiIce.rainRepellent;say('RAIN REPELLENT '+(AIRSYS.antiIce.rainRepellent?'ON':'OFF'));},'WINDSHIELD RAIN REPELLENT');
    // AIR CONDITIONING / PRESSURIZATION
    def(5,0,0,'PACK L',()=>AIRSYS.air.packLeft,()=>{AIRSYS.air.packLeft=!AIRSYS.air.packLeft;say('LEFT PACK '+(AIRSYS.air.packLeft?'ON':'OFF'));},'LEFT AIR CONDITIONING PACK');
    def(5,0,1,'PACK R',()=>AIRSYS.air.packRight,()=>{AIRSYS.air.packRight=!AIRSYS.air.packRight;say('RIGHT PACK '+(AIRSYS.air.packRight?'ON':'OFF'));},'RIGHT AIR CONDITIONING PACK');
    def(5,0,2,'TRIM L',()=>AIRSYS.air.trimLeft,()=>{AIRSYS.air.trimLeft=!AIRSYS.air.trimLeft;say('LEFT TRIM AIR '+(AIRSYS.air.trimLeft?'ON':'OFF'));},'LEFT TRIM AIR');
    def(5,0,3,'TRIM R',()=>AIRSYS.air.trimRight,()=>{AIRSYS.air.trimRight=!AIRSYS.air.trimRight;say('RIGHT TRIM AIR '+(AIRSYS.air.trimRight?'ON':'OFF'));},'RIGHT TRIM AIR');
    def(5,1,0,'RECIRC U',()=>AIRSYS.air.recircUpper,()=>{AIRSYS.air.recircUpper=!AIRSYS.air.recircUpper;say('UPPER RECIRC FAN '+(AIRSYS.air.recircUpper?'ON':'OFF'));},'UPPER RECIRCULATION FAN');
    def(5,1,1,'RECIRC L',()=>AIRSYS.air.recircLower,()=>{AIRSYS.air.recircLower=!AIRSYS.air.recircLower;say('LOWER RECIRC FAN '+(AIRSYS.air.recircLower?'ON':'OFF'));},'LOWER RECIRCULATION FAN');
    def(5,1,2,'EQ COOL',()=>AIRSYS.air.equipCooling!=='OFF',()=>{AIRSYS.air.equipCooling=AIRSYS.air.equipCooling==='OFF'?'AUTO':'OFF';say('EQUIPMENT COOLING '+AIRSYS.air.equipCooling);},'EQUIPMENT COOLING');
    def(5,1,3,'OUTFLOW',()=>AIRSYS.air.outflow==='AUTO',()=>{AIRSYS.air.outflow=AIRSYS.air.outflow==='AUTO'?'MAN':'AUTO';say('OUTFLOW VALVE '+AIRSYS.air.outflow);},'CABIN PRESSURIZATION OUTFLOW VALVE');
    // LIGHTS
    def(6,0,0,'LAND',()=>landingOn,()=>dispatchKey('KeyL'),'LANDING LIGHTS');
    def(6,0,1,'NOSE',()=>window._taxiOn!==false,()=>{window._taxiOn=!(window._taxiOn!==false);say('TAXI LIGHT '+(window._taxiOn?'ON':'OFF'));},'TAXI / NOSE LIGHT');
    def(6,0,2,'STRBE',()=>window._strobeOn!==false,()=>{window._strobeOn=!(window._strobeOn!==false);say('STROBES '+(window._strobeOn?'ON':'OFF'));},'STROBE LIGHTS');
    def(6,0,3,'NAV',()=>window._navOn!==false,()=>{window._navOn=!(window._navOn!==false);say('NAV LIGHTS '+(window._navOn?'ON':'OFF'));},'NAV LIGHTS');
    def(6,1,0,'BELTS',()=>!!window._belts,()=>{const modes=['AUTO','ON','OFF'];AIRSYS.cabin.beltMode=modes[(modes.indexOf(AIRSYS.cabin.beltMode)+1)%modes.length];snd('chime');say('SEAT BELT SIGN '+AIRSYS.cabin.beltMode);},'SEAT BELT SIGN · AUTO / ON / OFF',()=>AIRSYS.cabin.beltMode);
    def(6,1,1,'NOSMK',()=>AIRSYS.cabin.noSmoke,()=>{AIRSYS.cabin.noSmoke=!AIRSYS.cabin.noSmoke;window._noSmoke=AIRSYS.cabin.noSmoke;say('NO SMOKING SIGN '+(AIRSYS.cabin.noSmoke?'ON':'OFF'));},'NO SMOKING SIGN');
    def(6,1,2,'DOME',()=>!!window._dome,()=>{window._dome=!window._dome;try{scene.getLightByName('cpL').setEnabled(window._dome);scene.getLightByName('cpL2').setEnabled(window._dome);}catch(e){}},'COCKPIT DOME LIGHT');
    def(6,1,3,'BEACON',()=>AIRSYS.lights.beacon,()=>{AIRSYS.lights.beacon=!AIRSYS.lights.beacon;say('BEACON LIGHT '+(AIRSYS.lights.beacon?'ON':'OFF'));},'BEACON LIGHT');
    // ENG / APU
    def(7,0,0,'START',()=>ENG.starting||ENG.L.state==='RUNNING'||ENG.R.state==='RUNNING',()=>dispatchKey('KeyI'),'ENGINE START');
    def(7,0,1,'REV',()=>!!plane.reverserOn,()=>dispatchKey('KeyN'),'THRUST REVERSERS');
    def(7,0,2,'ABRK',()=>!!plane._ab,()=>{plane._ab=!plane._ab;say('AUTOBRAKE '+(plane._ab?'ARMED':'OFF'));},'AUTOBRAKE');
    def(7,0,3,'FIRE TEST',()=>false,()=>{showMsg('FIRE TEST · AUDIO CHECK',1800);speak('fire warning',1);},'FIRE / OVERHEAT AUDIO TEST');
    def(7,1,0,'OXY',()=>AIRSYS.cabin.oxygen,()=>{AIRSYS.cabin.oxygen=!AIRSYS.cabin.oxygen;say('PASSENGER OXYGEN '+(AIRSYS.cabin.oxygen?'DEPLOYED':'NORMAL'));},'PASSENGER OXYGEN');
    def(7,1,1,'APU',()=>ENG.apu.running||ENG.apu.spooling,()=>{toggleAPU();say('APU '+(ENG.apu.spooling?'STARTING':ENG.apu.running?'RUNNING':'OFF'));},'APU START / STOP');
    def(7,1,2,'FUEL L',()=>AIRSYS.engine.fuelCutoffLeft,()=>setFuelCutoff('L'),'LEFT ENGINE FUEL CUTOFF');
    def(7,1,3,'FUEL R',()=>AIRSYS.engine.fuelCutoffRight,()=>setFuelCutoff('R'),'RIGHT ENGINE FUEL CUTOFF');
    const KN={};const knobState=k=>KN[k]||(KN[k]=3);
    const tgX=(g,i)=>g*256+10+34+i*56,tgY=r=>r?230:160;
    const tog=(x,y,up)=>{c.fillStyle='#0a0a0a';c.beginPath();c.arc(x,y,11,0,6.2832);c.fill();c.strokeStyle='#c8ccd0';c.lineWidth=6;c.lineCap='round';c.beginPath();c.moveTo(x,y);c.lineTo(x,y+(up?-17:17));c.stroke();c.lineCap='butt';c.fillStyle=up?'#e8ecef':'#9aa0a6';c.beginPath();c.arc(x,y+(up?-18:18),5,0,6.2832);c.fill();};
    const knobDraw=(x,y,st)=>{c.fillStyle=BG;c.fillRect(x-36,y-36,72,72);c.fillStyle='#08090a';c.beginPath();c.arc(x,y,28,0,6.2832);c.fill();const gr=c.createRadialGradient(x-9,y-9,1,x,y,26);gr.addColorStop(0,'#8a9096');gr.addColorStop(1,'#2a2d31');c.fillStyle=gr;c.beginPath();c.arc(x,y,26,0,6.2832);c.fill();
      const a=(-135+st*38.6)*Math.PI/180;c.strokeStyle='#eee';c.lineWidth=5;c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.sin(a)*26,y-Math.cos(a)*26);c.stroke();
      c.fillStyle='#8a939b';for(let q=0;q<8;q++){const aa=(-135+q*38.6)*Math.PI/180;c.fillRect(x+Math.sin(aa)*33-1.5,y-Math.cos(aa)*33-1.5,3,3);}};
    let hoverRect=null,lastHash='';
    function stateOf(key){const d=D[key];return d?(d.get?!!d.get():d.on):false;}
    function paint(){
      c.putImageData(base,0,0);
      for(let g=0;g<8;g++){
        for(let r=0;r<2;r++)for(let i=0;i<4;i++){const x=tgX(g,i),y=tgY(r),d=D[g+'_'+r+'_'+i],on=stateOf(g+'_'+r+'_'+i);
          c.fillStyle=BG;c.fillRect(x-24,y-32,48,68);tog(x,y,on);
          c.fillStyle=(d&&d.get)?(on?'#7be3ff':'#8a949c'):'#9aa4ad';c.font='11px sans-serif';c.textAlign='center';c.fillText((d&&d.label)||('SW'+(i+1+r*4)),x,y+(on?34:-24));}
        // bottom indicator lamps follow the toggles above them
        for(let i=0;i<4;i++){const lx=g*256+10+10+i*57,k=(i+g)%4,on=stateOf(g+'_0_'+i)||stateOf(g+'_1_'+i);
          c.fillStyle='#050505';c.fillRect(lx,400,52,34);c.fillStyle=on?onC[k]:litC[k];c.fillRect(lx+2,402,48,30);}
        knobDraw(g*256+10+60,330,g===0?gpwsSelected:knobState(g+'_0'));knobDraw(g*256+10+176,330,knobState(g+'_1'));
      }
      if(hoverRect){c.strokeStyle='#5fe3ff';c.lineWidth=4;c.strokeRect(hoverRect[0],hoverRect[1],hoverRect[2],hoverRect[3]);}
      T.update(true);
    }
    const spec=CKI.addTex('ohp',W,H,paint);CKI.tex.ohp.setHover=r=>{hoverRect=r;paint();};
    for(let g=0;g<8;g++){
      for(let r=0;r<2;r++)for(let i=0;i<4;i++){const key=g+'_'+r+'_'+i,d=D[key]||{label:'SW'+(i+1+r*4),cos:true,on:true,tip:'SWITCH'};D[key]=d;
        CKI.rect('ohp',[tgX(g,i)-22,tgY(r)-34,44,70],{label:d.tip||d.label,state:()=>d.display?d.display():(d.get?(d.get()?'ON':'OFF'):(d.on?'ON':'OFF')),act:()=>{snd('sw');if(d.act)d.act();else d.on=!d.on;paint();}});}
      for(const ki of [0,1]){const key=g+'_'+ki,kx=g*256+10+(ki?176:60);
        CKI.rect('ohp',[kx-30,330-30,60,60],{label:g===1?(ki===0?'ND MODE SELECTOR':'ND RANGE SELECTOR'):
          g===0&&ki===0?'GPWS OVERRIDE SELECTOR':
          g===3&&ki===0?'FUEL CROSSFEED VALVE':
          g===4?(ki===0?'LEFT WIPER SPEED':'RIGHT WIPER SPEED'):
          g===5?(ki===0?'LANDING ALTITUDE':'CABIN ZONE TEMPERATURE'):
          g===6?(ki===0?'MASTER LIGHT BRIGHTNESS':'EMERGENCY LIGHTS'):
          g===7?(ki===0?'LEFT EEC MODE':'RIGHT EEC MODE'):['FLT CONTROL','NAV / DISPLAYS','ELECTRICAL','FUEL / HYD','ANTI-ICE','AIR COND','LIGHTS','ENG / APU'][g]+' selector',
          state:()=>g===1?(ki===0?ND.mode:ND.range+' NM'):
            g===0&&ki===0?gpwsModes[gpwsSelected][0]:
            g===3&&ki===0?'CROSSFEED '+(AIRSYS.fuel.crossfeed?'OPEN':'CLOSED'):
            g===4?(ki===0?AIRSYS.antiIce.wiperLeft:AIRSYS.antiIce.wiperRight):
            g===5?(ki===0?AIRSYS.air.landingAltitude+' FT':AIRSYS.air.zoneTemp+' C'):
            g===6?(ki===0?Math.round(AIRSYS.lights.masterBrightness*100)+'%':AIRSYS.cabin.emergencyLights):
            g===7?(ki===0?AIRSYS.engine.eecLeft:AIRSYS.engine.eecRight):'pos '+(knobState(key)+1),
          act:(e,dir)=>{
            snd('knob');const d2=dir||((e&&e.local&&e.local[0]<kx)?-1:1);
            if(g===1&&ki===0){const modes=['APP','VOR','MAP','PLN'];ND.mode=modes[(modes.indexOf(ND.mode)+d2+modes.length)%modes.length];}
            else if(g===1&&ki===1){const ranges=[5,10,20,40,80,160,320,640],i=ranges.indexOf(ND.range);ND.range=ranges[Math.max(0,Math.min(ranges.length-1,i+d2))];}
            else if(g===0&&ki===0)gpwsSelected=(gpwsSelected+d2+gpwsModes.length)%gpwsModes.length;
            else if(g===3&&ki===0){AIRSYS.fuel.crossfeed=!AIRSYS.fuel.crossfeed;}
            else if(g===4){const wiper=ki===0?'wiperLeft':'wiperRight',speeds=['OFF','INT','LOW','HIGH'],i=speeds.indexOf(AIRSYS.antiIce[wiper]);AIRSYS.antiIce[wiper]=speeds[(Math.max(0,i)+d2+speeds.length)%speeds.length];}
            else if(g===5&&ki===0)AIRSYS.air.landingAltitude=Math.max(-1000,Math.min(14000,AIRSYS.air.landingAltitude+d2*500));
            else if(g===5&&ki===1)AIRSYS.air.zoneTemp=Math.max(18,Math.min(30,AIRSYS.air.zoneTemp+d2));
            else if(g===6&&ki===0){AIRSYS.lights.masterBrightness=Math.max(0,Math.min(1,AIRSYS.lights.masterBrightness+d2*.1));setCockpitBrightness();}
            else if(g===6&&ki===1){const modes=['OFF','ARMED','ON'],i=modes.indexOf(AIRSYS.cabin.emergencyLights);AIRSYS.cabin.emergencyLights=modes[(Math.max(0,i)+d2+modes.length)%modes.length];}
            else if(g===7){const side=ki===0?'eecLeft':'eecRight';AIRSYS.engine[side]=AIRSYS.engine[side]==='NORM'?'ALTN':'NORM';}
            else KN[key]=Math.max(0,Math.min(7,knobState(key)+d2));
            paint();
          },wheel:d2=>{
            snd('knob');
            if(g===1&&ki===0){const modes=['APP','VOR','MAP','PLN'];ND.mode=modes[(modes.indexOf(ND.mode)+d2+modes.length)%modes.length];}
            else if(g===1&&ki===1){const ranges=[5,10,20,40,80,160,320,640],i=ranges.indexOf(ND.range);ND.range=ranges[Math.max(0,Math.min(ranges.length-1,i+d2))];}
            else if(g===0&&ki===0)gpwsSelected=(gpwsSelected+d2+gpwsModes.length)%gpwsModes.length;
            else if(g===3&&ki===0){AIRSYS.fuel.crossfeed=!AIRSYS.fuel.crossfeed;}
            else if(g===4){const wiper=ki===0?'wiperLeft':'wiperRight',speeds=['OFF','INT','LOW','HIGH'],i=speeds.indexOf(AIRSYS.antiIce[wiper]);AIRSYS.antiIce[wiper]=speeds[(Math.max(0,i)+d2+speeds.length)%speeds.length];}
            else if(g===5&&ki===0)AIRSYS.air.landingAltitude=Math.max(-1000,Math.min(14000,AIRSYS.air.landingAltitude+d2*500));
            else if(g===5&&ki===1)AIRSYS.air.zoneTemp=Math.max(18,Math.min(30,AIRSYS.air.zoneTemp+d2));
            else if(g===6&&ki===0){AIRSYS.lights.masterBrightness=Math.max(0,Math.min(1,AIRSYS.lights.masterBrightness+d2*.1));setCockpitBrightness();}
            else if(g===6&&ki===1){const modes=['OFF','ARMED','ON'],i=modes.indexOf(AIRSYS.cabin.emergencyLights);AIRSYS.cabin.emergencyLights=modes[(Math.max(0,i)+d2+modes.length)%modes.length];}
            else if(g===7){const side=ki===0?'eecLeft':'eecRight';AIRSYS.engine[side]=AIRSYS.engine[side]==='NORM'?'ALTN':'NORM';}
            else KN[key]=Math.max(0,Math.min(7,knobState(key)+d2));
            paint();
          }});
      }
    }
    const systemSections=['FLT CONTROL','NAV / DISPLAYS','ELECTRICAL','FUEL / HYD','ANTI-ICE','AIR COND','LIGHTS','ENG / APU'];
    const systemToggle=document.createElement('button');
    systemToggle.type='button';systemToggle.textContent='SYSTEMS';
    systemToggle.setAttribute('aria-label','Open aircraft systems controls');
    systemToggle.style.cssText='display:none;position:fixed;right:14px;bottom:14px;z-index:610;padding:8px 12px;border:1px solid #56b8dd;border-radius:8px;background:#102234;color:#d9f5ff;font:700 12px system-ui;cursor:pointer;';
    const systemPanel=document.createElement('div');
    systemPanel.style.cssText='display:none;position:fixed;right:14px;bottom:58px;z-index:611;width:min(620px,calc(100vw - 28px));max-height:72vh;overflow:auto;padding:12px;border:1px solid #39718b;border-radius:10px;background:rgba(7,15,24,.97);color:#e4f5ff;font:12px system-ui;box-shadow:0 10px 32px #000b;';
    const systemHeader=document.createElement('div');
    systemHeader.style.cssText='display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;font-weight:800;letter-spacing:.08em;';
    const systemTitle=document.createElement('span');systemTitle.textContent='AIRCRAFT SYSTEMS';
    const systemClose=document.createElement('button');systemClose.type='button';systemClose.textContent='CLOSE';
    systemClose.style.cssText='padding:5px 8px;border:1px solid #426176;border-radius:6px;background:#152838;color:#d9f5ff;cursor:pointer;';
    systemHeader.append(systemTitle,systemClose);
    const systemGrid=document.createElement('div');
    systemGrid.style.cssText='display:grid;grid-template-columns:repeat(auto-fit,minmax(255px,1fr));gap:8px;';
    systemPanel.append(systemHeader,systemGrid);
    document.body.append(systemToggle,systemPanel);
    const systemButtons=[],systemKnobs=[];
    systemSections.forEach((name,g)=>{
      const section=document.createElement('section');
      section.style.cssText='padding:8px;border:1px solid #273c4d;border-radius:7px;background:#0d1924;';
      const heading=document.createElement('div');heading.textContent=name;
      heading.style.cssText='margin-bottom:6px;color:#7fc8e7;font-weight:800;font-size:10px;letter-spacing:.1em;';
      const grid=document.createElement('div');
      grid.style.cssText='display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px;';
      for(let r=0;r<2;r++)for(let i=0;i<4;i++){
        const key=g+'_'+r+'_'+i,d=D[key];
        if(!d)continue;
        const button=document.createElement('button');button.type='button';button.title=d.tip||d.label;
        button.style.cssText='display:flex;justify-content:space-between;gap:6px;padding:6px;border:1px solid #31495b;border-radius:5px;background:#142330;color:#dbeaf2;text-align:left;cursor:pointer;';
        const label=document.createElement('span');label.textContent=d.label;
        const value=document.createElement('small');value.style.cssText='color:#91d9f5;text-align:right;';
        button.append(label,value);
        button.addEventListener('click',()=>{
          snd('sw');if(d.act)d.act();else d.on=!d.on;
          paint();refreshSystemControls();
        });
        systemButtons.push({button,value,d,key});grid.appendChild(button);
      }
      const knobSpecs=CKI.tex.ohp.specs.filter(s=>s.rect&&s.rect[1]===300&&Math.floor(s.rect[0]/256)===g);
      knobSpecs.forEach(spec=>{
        const row=document.createElement('div');row.style.cssText='display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:5px;margin-top:5px;padding-top:5px;border-top:1px solid #263a49;';
        const label=document.createElement('span');label.textContent=spec.label;
        const value=document.createElement('small');value.style.cssText='color:#91d9f5;';
        const minus=document.createElement('button'),plus=document.createElement('button');
        minus.type=plus.type='button';minus.textContent='−';plus.textContent='+';
        [minus,plus].forEach(b=>b.style.cssText='width:26px;height:24px;border:1px solid #426176;border-radius:4px;background:#152838;color:#d9f5ff;cursor:pointer;');
        minus.addEventListener('click',()=>{spec.act(null,-1);paint();refreshSystemControls();});
        plus.addEventListener('click',()=>{spec.act(null,1);paint();refreshSystemControls();});
        row.append(label,value,minus,plus);grid.appendChild(row);systemKnobs.push({spec,value});
      });
      section.append(heading,grid);systemGrid.appendChild(section);
    });
    function refreshSystemControls(){
      systemButtons.forEach(({button,value,d,key})=>{
        button.classList.toggle('on',stateOf(key));
        button.style.background=stateOf(key)?'#1b3c4d':'#142330';
        value.textContent=d.display?d.display():(d.get?(d.get()?'ON':'OFF'):(d.on?'ON':'OFF'));
      });
      systemKnobs.forEach(({spec,value})=>{value.textContent=spec.state?spec.state():'';});
    }
    systemToggle.addEventListener('click',()=>{
      const open=systemPanel.style.display!=='block';
      systemPanel.style.display=open?'block':'none';systemToggle.setAttribute('aria-expanded',String(open));
      if(open)refreshSystemControls();
    });
    systemClose.addEventListener('click',()=>{systemPanel.style.display='none';systemToggle.setAttribute('aria-expanded','false');});
    scene.registerBeforeRender(()=>{systemToggle.style.display=camMode===1?'block':'none';if(camMode!==1)systemPanel.style.display='none';});
    setInterval(()=>{let h='';try{for(const k in D)h+=stateOf(k)?1:0;}catch(e){return;}if(h!==lastHash){lastHash=h;try{paint();}catch(e){}}if(systemPanel.style.display==='block')refreshSystemControls();},250);
  }

  /* ============ MCP (autopilot panel) – live values + clickable ============ */
  const mcpM=scene.getMeshByName('mcpP');
  if(mcpM&&mcpM.material&&mcpM.material.emissiveTexture&&window._mcpDraw){
    const T=mcpM.material.emissiveTexture,c=T.getContext(),W=1536,H=110;let last='',hov=null;const sp3=n=>String(((Math.round(n)%360)+360)%360).padStart(3,'0');
    const st=window._mcpSt={crs:'260'};
    function sync(force){
      st.crs=sp3(AP.courseTarget);
      st.spd=AP.speedUnit==='MACH'?AP.machTarget.toFixed(2):String(Math.round(AP.spdTarget));
      st.speedLabel=AP.speedUnit;st.hdg=sp3(AP.hdgTarget);st.alt=String(Math.round(AP.altTarget)).padStart(5,'0');
      st.on={SPEED:AP.athr&&AP.spdMode,VNAV:AP.vnav,'HDG SEL':AP.hdgMode&&!AP.lnav&&!AP.appr,'ALT HLD':AP.altMode,'V/S':AP.vsMode,LNAV:AP.lnav,APP:AP.appr,N1:AP.athr&&!!AP.n1Mode,'LVL CHG':!!AP.lvlChg};
      st.cmdA=!!AP.master&&(AP.cmdChannel==='A'||AP.cmdChannel==='AB');
      st.cmdB=!!AP.master&&(AP.cmdChannel==='B'||AP.cmdChannel==='AB');st.athr=!!AP.athr;st.appr=!!AP.appr;
      st.cmdChannel=AP.cmdChannel||'A';st.fdL=EFIS.fdL;st.fdR=EFIS.fdR;st.locMode=AP.locMode;st.trackMode=AP.trackMode;st.athrArmed=AP.athrArmed;
      st.bankLimit=AP.bankLimit;st.bankMode=AP.bankMode;st.fpaMode=AP.vsModeType==='FPA';
      st.thrustMode=AP.thrustMode;st.altIncrement=AP.altIncrement;st.apInhibit=AP.apInhibit;st.hov=hov;
      const h=JSON.stringify([st.spd,st.speedLabel,st.hdg,st.alt,st.on,st.cmdA,st.cmdB,st.fdL,st.fdR,st.athr,st.athrArmed,st.crs,st.locMode,st.trackMode,st.bankLimit,st.bankMode,st.fpaMode,st.thrustMode,st.altIncrement,st.apInhibit,hov]);if(h===last&&!force)return;last=h;
      window._mcpDraw(c,W,H);T.update(true);
    }
    CKI.addTex('mcpP',W,H,()=>{try{sync(true);}catch(e){}});CKI.tex.mcpP.setHover=r=>{hov=r;sync(true);};
    const R=(x,y,w,h,spec)=>CKI.rect('mcpP',[x,y,w,h],spec);
    const engageAP=()=>{
      if(AP.apInhibit){say('RAISE DISENGAGE BAR');return false;}
      if(AP.master)return true;
      const m=BABYLON.Matrix.Identity();plane.quat.toRotationMatrix(m);
      const f=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,0,1),m);
      AP.hdgTarget=Math.round((Math.atan2(f.x,-f.z)*180/Math.PI+360)%360);
      AP.altTarget=Math.round(plane.pos.y*3.28084/100)*100;AP.master=true;AP.cmdChannel='A';
      if(!AP.hdgMode&&!AP.lnav&&!AP.appr)AP.hdgMode=true;
      if(!AP.altMode&&!AP.vsMode&&!AP.appr)AP.altMode=true;
      return true;
    };
    const selectSpeed=()=>{
      if(!AP.athrArmed){say('ARM AUTOTHROTTLE FIRST');return false;}
      AP.athr=true;AP.spdMode=true;AP.n1Mode=false;AP.lvlChg=false;return true;
    };
    const selectHeading=()=>{
      if(!engageAP())return;
      if(AP.hdgMode){
        const m=BABYLON.Matrix.Identity();plane.quat.toRotationMatrix(m);
        const f=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,0,1),m);
        const heading=(Math.atan2(f.x,-f.z)*180/Math.PI+360)%360;
        const track=(Math.atan2(plane.vel.x,-plane.vel.z)*180/Math.PI+360)%360;
        AP.hdgTarget=Math.round(AP.trackMode?track:heading);
      }
      AP.hdgMode=true;AP.lnav=false;AP.appr=false;AP.locMode=false;AP.lvlChg=false;
    };
    const selectLocalizer=()=>{
      if(!AP.master){say('ENGAGE A/P FIRST');return;}
      if(runwayLenM<=0){say('NO RUNWAY AT THIS LOCATION');return;}
      AP.locMode=!AP.locMode;AP.appr=false;AP.lnav=false;AP.hdgMode=false;
      if(!AP.altMode&&!AP.vsMode){AP.altMode=true;AP.altTarget=Math.round(plane.pos.y*3.28084/100)*100;}
      say('LOC '+(AP.locMode?'ARMED':'OFF'));
    };
    const selectApproach=()=>{
      if(!AP.master){say('ENGAGE A/P FIRST');return;}
      if(runwayLenM<=0){say('NO RUNWAY AT THIS LOCATION');return;}
      AP.appr=!AP.appr;AP.lnav=false;AP.locMode=AP.appr;
      if(AP.appr){AP.hdgMode=false;AP.altMode=false;AP.vsMode=false;AP.athrArmed=true;AP.athr=true;AP.spdMode=true;AP.n1Mode=false;AP.spdTarget=plane.flaps>=3?145:165;AP.cmdChannel='AB';}
      else AP.cmdChannel='A';
      say('APPROACH '+(AP.appr?'ARMED · LOC/GS':'OFF'));
    };
    const btn=(x,tip,fn,wheel)=>R(x,36,52,38,{label:tip,state:()=>st.on[tip]?'ON':'OFF',act:()=>{snd('btn');fn();sync(true);},wheel});
    btn(310,'SPEED',selectSpeed);
    btn(250,'N1',()=>{if(!AP.athrArmed){say('ARM AUTOTHROTTLE FIRST');return;}AP.athr=true;AP.n1Mode=true;AP.spdMode=false;AP.lvlChg=false;});
    btn(370,'LVL CHG',()=>{if(!AP.athrArmed){say('ARM AUTOTHROTTLE FIRST');return;}if(!engageAP())return;AP.hdgMode=false;AP.lnav=false;AP.appr=false;AP.altMode=true;AP.vsMode=false;AP.lvlChg=true;selectSpeed();AP.lvlChg=true;});
    btn(590,'VNAV',()=>{AP.vnav=!AP.vnav;say('VNAV '+(AP.vnav?'ON':'OFF'));});
    btn(850,'HDG SEL',()=>{selectHeading();say('HDG HOLD '+sp3(AP.hdgTarget));});
    btn(910,'APP',selectApproach);
    btn(1160,'ALT HLD',()=>{if(!engageAP())return;AP.altTarget=Math.round(plane.pos.y*3.28084/100)*100;AP.altMode=true;AP.vsMode=false;AP.lvlChg=false;AP.appr=false;AP.locMode=false;AP.lnav=false;say('ALT HLD '+Math.round(AP.altTarget));});
    btn(1220,'V/S',()=>{if(!engageAP())return;AP.vsMode=true;AP.vsModeType='VS';AP.altMode=false;AP.lvlChg=false;AP.appr=false;AP.locMode=false;AP.lnav=false;AP.vsTarget=Math.round(plane.vel.y*196.85/100)*100;say('V/S '+AP.vsTarget);},d=>{
      if(AP.vsModeType==='FPA')AP.fpaTarget=Math.max(-9,Math.min(9,AP.fpaTarget+d*.1));
      else AP.vsTarget=Math.max(-6000,Math.min(6000,AP.vsTarget+d*100));
      say(AP.vsModeType==='FPA'?'FPA '+AP.fpaTarget.toFixed(1)+'°':'V/S '+AP.vsTarget);sync(true);
    });
    btn(1280,'LNAV',()=>{if(!FP.wps.length){say('NO FLIGHT PLAN · OPEN FMS (J)');return;}if(!engageAP())return;AP.lnav=!AP.lnav;AP.hdgMode=!AP.lnav;AP.appr=false;AP.locMode=false;});
    const commandChannel=channel=>{
      snd('btn');
      if(AP.master&&AP.cmdChannel===channel){AP.master=false;AP.appr=false;AP.locMode=false;}
      else if(engageAP())AP.cmdChannel=channel;
      sync(true);
    };
    R(1160,80,60,22,{label:'A/P CMD A',state:()=>AP.master&&(AP.cmdChannel==='A'||AP.cmdChannel==='AB')?'ENGAGED':'OFF',act:()=>commandChannel('A')});
    R(1230,80,60,22,{label:'A/P CMD B',state:()=>AP.master&&(AP.cmdChannel==='B'||AP.cmdChannel==='AB')?'ENGAGED':'OFF',act:()=>commandChannel('B')});
    R(450,80,80,28,{label:'AUTOTHROTTLE ARM',state:()=>AP.athrArmed?'ARMED':'OFF',act:()=>{
      snd('sw');AP.athrArmed=!AP.athrArmed;
      if(!AP.athrArmed){AP.athr=false;AP.spdMode=false;AP.n1Mode=false;}
      sync(true);
    }});
    R(10,84,65,22,{label:'FLIGHT DIRECTOR LEFT',state:()=>EFIS.fdL?'ON':'OFF',act:()=>{snd('sw');EFIS.fdL=!EFIS.fdL;AP.fd=EFIS.fdL||EFIS.fdR;sync(true);}});
    R(80,84,65,22,{label:'FLIGHT DIRECTOR RIGHT',state:()=>EFIS.fdR?'ON':'OFF',act:()=>{snd('sw');EFIS.fdR=!EFIS.fdR;AP.fd=EFIS.fdL||EFIS.fdR;sync(true);}});
    R(540,80,75,28,{label:'CLIMB / CONTINUOUS THRUST',state:()=>AP.thrustMode,act:()=>{snd('sw');AP.thrustMode=AP.thrustMode==='CLB'?'CON':'CLB';say('THRUST '+AP.thrustMode);sync(true);}});
    R(615,80,80,28,{label:'AUTOPILOT DISENGAGE BAR',state:()=>AP.apInhibit?'DOWN · INHIBITED':'UP',act:()=>{
      snd('lever');
      if(!AP.apInhibit){AP.apInhibit=true;AP.master=false;AP.appr=false;AP.locMode=false;AP.lnav=false;AP.hdgMode=false;AP.altMode=false;AP.vsMode=false;AP.lvlChg=false;AP.vnav=false;}
      else AP.apInhibit=false;
      sync(true);
    }});
    R(700,80,80,28,{label:'AUTOTHROTTLE ENGAGE',state:()=>AP.athr&&(AP.spdMode||AP.n1Mode)?'ENGAGED':'OFF',act:()=>{snd('btn');selectSpeed();sync(true);}});
    R(805,80,70,22,{label:'HEADING / TRACK SELECT',state:()=>AP.trackMode?'TRACK':'HEADING',act:()=>{snd('sw');AP.trackMode=!AP.trackMode;sync(true);}});
    R(880,80,60,22,{label:'LOCALIZER ONLY',state:()=>AP.locMode?'ARMED':'OFF',act:()=>{snd('sw');selectLocalizer();sync(true);}});
    R(945,80,60,22,{label:'BANK ANGLE LIMIT',state:()=>AP.bankMode==='AUTO'?'AUTO':AP.bankLimit+'°',act:(e,dir)=>{
      const modes=['AUTO',5,10,15,20,25],i=modes.indexOf(AP.bankMode),d=dir||1;
      AP.bankMode=modes[(i+d+modes.length)%modes.length];AP.bankLimit=AP.bankMode==='AUTO'?25:AP.bankMode;sync(true);
    },wheel:d=>{const modes=['AUTO',5,10,15,20,25],i=modes.indexOf(AP.bankMode);AP.bankMode=modes[(i+d+modes.length)%modes.length];AP.bankLimit=AP.bankMode==='AUTO'?25:AP.bankMode;sync(true);}});
    R(1010,80,50,22,{label:'V/S - FPA SELECT',state:()=>AP.vsModeType==='FPA'?'FPA':'V/S',act:()=>{
      if(!engageAP())return;
      AP.vsModeType=AP.vsModeType==='FPA'?'VS':'FPA';
      if(AP.vsModeType==='FPA')AP.fpaTarget=Math.atan2(AP.vsTarget,Math.max(1,Math.hypot(plane.vel.x,plane.vel.z)*196.85))*180/Math.PI;
      AP.vsMode=true;AP.altMode=false;AP.appr=false;AP.locMode=false;AP.lnav=false;sync(true);
    }});
    R(1065,80,40,28,{label:'ALTITUDE INTERVENTION',state:()=>AP.vnav?'VNAV':'OFF',act:()=>{
      if(!engageAP())return;
      AP.vnav=false;if(FP.wps[FP.active])FP.wps[FP.active].alt=null;
      AP.altMode=true;AP.vsMode=false;AP.appr=false;AP.locMode=false;AP.lnav=false;
      say('ALTITUDE INTERVENTION');sync(true);
    }});
    R(1108,80,40,28,{label:'ALTITUDE INCREMENT · AUTO / 1000 FT',state:()=>AP.altIncrement,act:()=>{
      AP.altIncrement=AP.altIncrement==='AUTO'?'1000':'AUTO';say('ALTITUDE STEP '+AP.altIncrement);sync(true);
    }});
    R(400,80,45,28,{label:'IAS / MACH SELECT',state:()=>AP.speedUnit,act:()=>{
      const rho=1.225*Math.exp(-Math.max(plane.pos.y,0)/8500);
      if(AP.speedUnit==='IAS'){AP.speedUnit='MACH';AP.machTarget=AP.spdTarget/(340*Math.sqrt(rho/1.225)*1.94384);}
      else{AP.speedUnit='IAS';AP.spdTarget=Math.round(AP.machTarget*340*Math.sqrt(rho/1.225)*1.94384);}
      say(AP.speedUnit+' SELECTED');sync(true);
    }});
    const win=(x,label,step,unit,get,set)=>R(x,28,120,48,{label,state:()=>unit(),act:(e,dir)=>{snd('knob');const d=dir||((e&&e.local&&e.local[0]<x+60)?-1:1);set(d*step);sync(true);},wheel:d=>{snd('knob');set(d*step);sync(true);}});
    win(460,'AUTOTHROTTLE SPEED · click − / + · scroll',5,()=>st.spd+' '+(AP.speedUnit==='MACH'?'MACH':'KT'),null,d=>{
      if(AP.speedUnit==='MACH')AP.machTarget=Math.max(.4,Math.min(.95,AP.machTarget+d*.002));
      else AP.spdTarget=Math.max(80,Math.min(400,Math.round(AP.spdTarget+d)));
    });
    win(700,'HEADING / TRACK · click − / + · scroll',5,()=>sp3(AP.hdgTarget)+'°',null,d=>{AP.hdgTarget=((Math.round(AP.hdgTarget+d)%360)+360)%360;});
    win(1010,'ALTITUDE · click − / + · scroll',1,()=>st.alt+' ft',null,d=>{
      const step=AP.altIncrement==='1000'?1000:(AP.altTarget>=10000?1000:100);
      AP.altTarget=Math.max(0,Math.min(45000,Math.round((AP.altTarget+d*step)/step)*step));
    });
    win(110,'COURSE · ND BEARING',1,()=>st.crs+'°',null,d=>{AP.courseTarget=((Math.round(AP.courseTarget+d)%360)+360)%360;});
    win(1340,'COURSE · ND BEARING',1,()=>st.crs+'°',null,d=>{AP.courseTarget=((Math.round(AP.courseTarget+d)%360)+360)%360;});
    setInterval(()=>{try{sync(false);}catch(e){}},250);
  }

  /* ============ 3D LEVERS (gear / flaps / speedbrake / throttles) ============ */
  CKI.addMesh(['gearK','gearS','gearPlate'],{label:'LANDING GEAR LEVER · click',state:()=>plane.gearDown?'DOWN':'UP',act:()=>{snd('lever');dispatchKey('KeyG');}});
  CKI.addMesh(['flK','flLv'],{label:'FLAP LEVER · click or scroll',state:()=>FLAPS[plane.flaps].name,act:()=>{snd('lever');dispatchKey('KeyF');},wheel:d=>{if(faults.has('FLAP_JAM')){say('FLAPS JAMMED');return;}const n=Math.max(0,Math.min(FLAPS.length-1,plane.flaps+d));if(n!==plane.flaps){plane.flaps=n;snd('lever');say('FLAPS '+FLAPS[n].name);try{updateChips();}catch(e){}}}});
  CKI.addMesh(['sbK','sbLv'],{label:'SPEEDBRAKE LEVER',state:()=>plane.spoilerDeploy>.5?'DEPLOYED':'RETRACTED',act:()=>{snd('lever');dispatchKey('KeyB');}});
  CKI.addMesh(['thrK0','thrLv0','thrK1','thrLv1'],{label:'THROTTLE · drag up / down',state:()=>Math.round(plane.throttle*100)+'%',drag:true,act:()=>{},wheel:d=>{plane.throttle=Math.max(0,Math.min(1,plane.throttle+d*.05));}});
  scene.registerBeforeRender(()=>{
    if(!gearLeverPivot)return;
    const dt=Math.min(.1,scene.getEngine().getDeltaTime()/1000);
    const target=plane.gearDown ? .18 : -.18;
    gearLeverPivot.rotation.z+=(target-gearLeverPivot.rotation.z)*Math.min(1,dt*12);
  });

  /* ============ picking / hover / click engine ============ */
  let tip=null;
  const ensureTip=()=>{if(tip)return tip;tip=document.createElement('div');tip.id='ckTip';tip.style.cssText='position:fixed;z-index:60;pointer-events:none;display:none;padding:6px 10px;border-radius:8px;background:rgba(8,16,26,.92);border:1px solid #38d6ff;color:#dff6ff;font:600 12px/1.3 system-ui,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,.5);white-space:nowrap';document.body.appendChild(tip);return tip;};
  const outline=(spec,on)=>{(spec.meshes||[]).forEach(m=>{try{m.renderOutline=on;m.outlineColor=new BABYLON.Color3(.25,.9,1);m.outlineWidth=on?.012:0;}catch(e){}});};
  function setHover(h,e){
    const old=CKI.hover;
    if(old&&(!h||old.spec!==h.spec)){if(old.spec.meshes)outline(old.spec,false);if(old.tex&&CKI.tex[old.spec.mesh].setHover)CKI.tex[old.spec.mesh].setHover(null);}
    if(h&&(!old||old.spec!==h.spec)){if(h.spec.meshes)outline(h.spec,true);if(h.tex&&CKI.tex[h.spec.mesh].setHover)CKI.tex[h.spec.mesh].setHover(h.spec.rect);}
    CKI.hover=h;
    const t=ensureTip();
    if(h&&e){t.style.display='block';t.style.left=Math.min(window.innerWidth-240,e.clientX+16)+'px';t.style.top=(e.clientY+18)+'px';
      let st='';try{st=h.spec.state?h.spec.state():'';}catch(_){}t.innerHTML='<span style="color:#7be3ff">'+h.spec.label+'</span>'+(st?' &nbsp;<b style="color:#fff">'+st+'</b>':'');canvas.style.cursor='pointer';}
    else{t.style.display='none';canvas.style.cursor='';}
  }
  function hit(e){
    if(typeof camMode==='undefined'||camMode!==1)return null;
    const r=canvas.getBoundingClientRect(),px=(e.clientX-r.left)*canvas.width/r.width,py=(e.clientY-r.top)*canvas.height/r.height;
    const pk=scene.pick(px,py,m=>!!(m.metadata&&m.metadata.hot)&&m.isEnabled());
    if(!pk||!pk.hit||!pk.pickedMesh)return null;
    const nm=pk.pickedMesh.name;
    const T=CKI.tex[nm];
    if(T){const uv=pk.getTextureCoordinates();if(!uv)return null;const x=uv.x*T.w,y=(1-uv.y)*T.h;
      const s=T.specs.find(s=>x>=s.rect[0]&&x<=s.rect[0]+s.rect[2]&&y>=s.rect[1]&&y<=s.rect[1]+s.rect[3]);if(!s)return null;
      if(s.active&&!s.active())return null;
      return{spec:s,tex:true,local:[x,y]};}
    const s=CKI.meshSpecs.find(s=>s.names.includes(nm));return s?{spec:s,local:null}:null;
  }
  CKI.hitAt=hit;
  let lastMove=0;
  canvas.addEventListener('pointermove',e=>{
    if(CKI.drag){const d=CKI.drag;plane.throttle=Math.max(0,Math.min(1,d.t0+(d.y0-e.clientY)/170));return;}
    const now=performance.now();if(now-lastMove<45)return;lastMove=now;
    if(e.buttons&2){setHover(null);return;}
    let h=null;try{h=hit(e);}catch(_){}setHover(h,e);
  },true);
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0)return;let h=null;try{h=hit(e);}catch(_){}
    if(!h)return;
    e.stopImmediatePropagation();
    if(h.spec.drag){CKI.drag={y0:e.clientY,t0:plane.throttle};try{canvas.setPointerCapture(e.pointerId);}catch(_){}snd('lever');return;}
    try{h.spec.act(h.tex?{local:h.local}:null);}catch(err){console.warn('cockpit act',err);}
    setHover(h,e);
  },true);
  window.addEventListener('pointerup',()=>{CKI.drag=null;},true);
  canvas.addEventListener('wheel',e=>{
    let h=null;try{h=hit(e);}catch(_){}
    if(!h||!h.spec.wheel)return;
    e.preventDefault();e.stopImmediatePropagation();
    h.spec.wheel(e.deltaY<0?1:-1,e);setHover(h,e);
  },{capture:true,passive:false});
  canvas.addEventListener('pointerleave',()=>setHover(null));
  scene.registerBeforeRender(()=>{
    if(!CKI.hinted&&typeof camMode!=='undefined'&&camMode===1){CKI.hinted=true;setTimeout(()=>say('COCKPIT · hover & click switches · scroll knobs · look up for overhead',4200),600);}
  });
})();

(function(){
['cwl','cwr'].forEach(n=>{const m=scene.getMeshByName(n);if(m)m.setEnabled(false);});
const sx=(n,k)=>{const m=scene.getMeshByName(n);if(m)m.scaling.x=k;};
sx('ck',2/3.2);sx('wsb',2/3);sx('wst',2/3);sx('swf',2/3.2);
const wl=scene.getMeshByName('wsl'),wr=scene.getMeshByName('wsr');if(wl)wl.position.x=-1.0;if(wr)wr.position.x=1.0;
function wall(name,cx,cz,rotY,len,w0,w1){
  const g=new BABYLON.TransformNode(name,scene);g.parent=interiorRoot;g.position.set(cx,0,cz);g.rotation.y=rotY;
  const a=-len/2,b=len/2,B=(n,x,y,z,w,h,d,m)=>intBox(name+n,w,h,d,x,y,z,0,m||M.cockpitBody,g);
  if(w0-a>.01)B('pre',0,.25,(a+w0)/2,.1,2.3,w0-a);
  if(b-w1>.01)B('post',0,.25,(w1+b)/2,.1,2.3,b-w1);
  const mid=(w0+w1)/2,wd=w1-w0;
  B('low',0,-.45,mid,.1,.9,wd);B('up',0,1.175,mid,.1,.45,wd);
  B('tl',0,.475,w0,.14,.95,.05,M.cockpitPanel);B('tr',0,.475,w1,.14,.95,.05,M.cockpitPanel);
  B('tt',0,.95,mid,.14,.05,wd,M.cockpitPanel);B('tb',0,0,mid,.14,.05,wd,M.cockpitPanel);
}
const A=.432;
for(const s of [-1,1]){
  const k=s<0?'L':'R';
  wall('hexS'+k,s*1.6,13.35,0,2.1,-.15,.85);
  wall('hexA'+k,s*1.3,15.05,-s*A,1.43,-.55,.55);
}
['cbP-1','cbP1'].forEach(n=>{const m=scene.getMeshByName(n);if(m){m.position.z=12.75;m.scaling.x=.55;}});
})();
(function(){
  interiorRoot.getChildMeshes().forEach(m=>{if(/^(ck|wsb|wst|wsc|wsl|wsr|wsc_l|wsc_r|swf|hexS|hexA)/.test(m.name))m.setEnabled(false);});
  const n=7,a=2.0,z0=13.6,len=2*a*Math.tan(Math.PI/n),ph=2*Math.PI/n;
  for(let i=-2;i<=2;i++){
    const phi=i*ph,g=new BABYLON.TransformNode('hp'+i,scene);g.parent=interiorRoot;
    g.position.set(a*Math.sin(phi),0,z0+a*Math.cos(phi));g.rotation.y=phi-Math.PI/2;
    const W=512,H=512,tx=new BABYLON.DynamicTexture('hpT'+i,{width:W,height:H},scene,true),c=tx.getContext();
    c.clearRect(0,0,W,H);c.fillStyle='#4a4f57';c.fillRect(0,0,W,H);
    c.fillStyle='#3a3e45';for(let k=0;k<18;k++)c.fillRect(0,k*30+8,W,2);
    const ai=Math.abs(i);let polys;
    if(ai===0)polys=[[[.03,.70],[.07,.09],[.48,.07],[.48,.70]],[[.52,.70],[.52,.07],[.93,.09],[.97,.70]]];
    else if(ai===1)polys=[[[.05,.63],[.17,.19],[.93,.19],[.93,.63]]];
    else polys=[[[.18,.6],[.32,.28],[.82,.28],[.82,.6]]];
    const mir=i<0;
    const pts=P=>P.map(([u,v])=>[(mir?1-u:u)*W,v*H]);
    c.globalCompositeOperation='destination-out';
    for(const P of polys){const q=pts(P);c.beginPath();c.moveTo(q[0][0],q[0][1]);for(let k=1;k<q.length;k++)c.lineTo(q[k][0],q[k][1]);c.closePath();c.fill();}
    c.globalCompositeOperation='source-over';c.strokeStyle='#15171a';c.lineWidth=9;c.lineJoin='round';
    for(const P of polys){const q=pts(P);c.beginPath();c.moveTo(q[0][0],q[0][1]);for(let k=1;k<q.length;k++)c.lineTo(q[k][0],q[k][1]);c.closePath();c.stroke();}
    tx.hasAlpha=true;tx.update(false);
    const mt=new BABYLON.StandardMaterial('hpM'+i,scene);mt.diffuseTexture=tx;mt.emissiveTexture=tx;mt.emissiveColor=new BABYLON.Color3(.55,.55,.58);mt.useAlphaFromDiffuseTexture=true;
    mt.disableLighting=true;mt.backFaceCulling=false;mt.specularColor=BABYLON.Color3.Black();
    const pl=BABYLON.MeshBuilder.CreatePlane('hpP'+i,{width:len,height:2.3,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
    pl.parent=g;pl.rotation.y=Math.PI/2;pl.position.y=.25;pl.material=mt;pl.isPickable=false;
  }
})();
interiorRoot.getChildMeshes().forEach(m=>{
  sun.excludedMeshes.push(m);
  if(m.material&&m.material.environmentIntensity!==undefined&&m.material!==M.glass)m.material.environmentIntensity=.85;
});
interiorRoot.setEnabled(false);

/* ============ FLIGHT MODEL ============ */
const ACFG={
  mass:65000,wingArea:124.6,CL0:.22,CLa:4.6,CLmax:1.85,stallAlpha:.34,
  CD0:.020,k:.044,Cy:.95,maxThrust:245000,
  maxElevRate:.30,maxAilRate:1.05,maxRudRate:.32,
  groundEffectAlt:12,gearHeight:4.05
};
const START_QUAT=BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(),Math.PI);

const plane={
  pos:new BABYLON.Vector3(0,900,0),vel:new BABYLON.Vector3(0,0,-135),
  quat:START_QUAT.clone(),angVel:new BABYLON.Vector3(0,0,0),
  throttle:.65,reverserOn:false,flaps:0,gearDown:true,spoilerDeploy:0,
  elevator:0,aileron:0,rudder:0,elevTrim:0,ailTrim:0,rudTrim:0,
  assist:true,alpha:0,gForce:1,speed:135,
  fuel:18000,crashed:false,brakeHold:false,parkingBrake:false,stall:false,onGround:false,
  gearCompress:0,gearSpringVel:0,justTouched:false,
  turbTimer:0,turbPhase:0,hold:false,
  gearPos:1.0,gearTarget:1.0,flapVisual:0,spoilerVisual:0,
  bellyLanding:false,inWater:false
};

const FLAPS=[
  {name:'0',cl:0,cd:0,stall:0,angle:0},
  {name:'1',cl:.15,cd:.008,stall:.02,angle:.09},
  {name:'5',cl:.32,cd:.020,stall:.04,angle:.18},
  {name:'15',cl:.52,cd:.042,stall:.06,angle:.32},
  {name:'30',cl:.72,cd:.075,stall:.08,angle:.55}
];

const ENG={
  battery:false,fuelPumps:false,apuBleed:false,ignition:false,
  apu:{running:false,n2:0,egt:15,spooling:false},
  L:{n1:0,n2:0,egt:15,ff:0,state:'OFF',starterTimer:0,shutdownTimer:0},
  R:{n1:0,n2:0,egt:15,ff:0,state:'OFF',starterTimer:0,shutdownTimer:0},
  starting:false,startTimer:0,
  fireWarning:{L:false,R:false},
  fireHandlesPulled:{L:false,R:false}
};
const electricalPower=()=>ENG.battery||AIRSYS.electrical.extPower||(ENG.apu.running&&window._apuGen!==false)||
  (ENG.L.state==='RUNNING'&&window._genL!==false)||(ENG.R.state==='RUNNING'&&window._genR!==false);
function syncFuelPumps(){
  ENG.fuelPumps=AIRSYS.fuel.leftPump||AIRSYS.fuel.rightPump||AIRSYS.fuel.centerLeft||AIRSYS.fuel.centerRight;
}
function toggleAPU(){
  if(ENG.apu.running||ENG.apu.spooling){
    ENG.apu.running=false;ENG.apu.spooling=false;ENG.apu.n2=0;ENG.apu.egt=15;
  }else{
    ENG.apu.n2=0;ENG.apu.egt=15;ENG.apu.spooling=true;
  }
}
function setCockpitBrightness(){
  for(const name of ['cpL','cpL2']){
    const light=scene.getLightByName(name);
    if(light)light.intensity=AIRSYS.lights.masterBrightness;
  }
}
function setFuelCutoff(side){
  const key=side==='L'?'fuelCutoffLeft':'fuelCutoffRight';
  AIRSYS.engine[key]=!AIRSYS.engine[key];
  if(AIRSYS.engine[key]){
    if(ENG.starting){
      ENG.starting=false;ENG.startTimer=0;
      for(const name of ['L','R']){
        if(ENG[name].state==='PENDING')ENG[name].state='OFF';
        else if(ENG[name].state==='STARTING')ENG[name].state='SHUTDOWN';
      }
    }
    if(ENG[side].state!=='OFF')ENG[side].state='SHUTDOWN';
  }
  showMsg((side==='L'?'LEFT':'RIGHT')+' ENGINE FUEL '+(AIRSYS.engine[key]?'CUTOFF':'ON · STARTER REQUIRED'));
}

const AP={master:false,fd:true,athr:false,athrArmed:false,yd:true,n1Mode:false,lvlChg:false,cmdChannel:'A',locMode:false,apInhibit:false,
  hdgMode:false,hdgTarget:0,courseTarget:260,altMode:false,altTarget:10000,altIncrement:'AUTO',
  vsMode:false,vsTarget:0,vsModeType:'VS',fpaTarget:0,spdMode:false,spdTarget:250,
  speedUnit:'IAS',machTarget:.78,bankLimit:25,bankMode:'AUTO',thrustMode:'CLB',trackMode:false};
const AIRSYS={
  electrical:{extPower:false,busTie:true,towingPower:false,utility:true},
  hydraulic:{leftEngine:true,rightEngine:true,systemAElectric:false,systemBElectric:false},
  fuel:{crossfeed:false,leftPump:false,rightPump:false,centerLeft:false,centerRight:false},
  antiIce:{wing:false,engineLeft:false,engineRight:false,windowLeft:true,windowRight:true,wiperLeft:'OFF',wiperRight:'OFF',rainRepellent:false},
  air:{packLeft:true,packRight:true,trimLeft:true,trimRight:true,recircUpper:true,recircLower:true,
    equipCooling:'AUTO',outflow:'AUTO',landingAltitude:0,zoneTemp:22},
  cabin:{beltMode:'AUTO',oxygen:false,noSmoke:true,emergencyLights:'ARMED'},
  gpws:{terrainOverride:false,gearOverride:false,flapOverride:false,glideslopeInhibit:false},
  lights:{beacon:true,masterBrightness:1},
  engine:{eecLeft:'NORM',eecRight:'NORM',fuelCutoffLeft:false,fuelCutoffRight:false}
};
scene.registerBeforeRender(()=>{
  const altFt=plane.pos.y*3.28084;
  window._belts=AIRSYS.cabin.beltMode==='ON'||(AIRSYS.cabin.beltMode==='AUTO'&&(altFt<10000||plane.flaps>0||plane.gearDown));
  window._noSmoke=AIRSYS.cabin.noSmoke;
});
const EFIS={fpv:false,meters:false,baroHpa:1013.25,baroUnit:'HPA',minsSource:'RADIO',fdL:true,fdR:true};
const ND={mode:'MAP',center:false,range:40,tfc:true,bearingL:'VOR',bearingR:'OFF',
  overlays:{WXR:false,TERR:false,WPT:true,STA:false,ARPT:false,DATA:false,POS:false}};

const windVec=new BABYLON.Vector3(0,0,0);

/* ================= FAULT CONTROL SYSTEM ================= */
const FAULTS={
  ENG_FIRE_L:{sev:3,label:'ENG 1 FIRE',    reset:'EXTINGUISH'},
  ENG_FIRE_R:{sev:3,label:'ENG 2 FIRE',    reset:'EXTINGUISH'},
  HYD_LOSS:  {sev:2,label:'HYD PRESS LO',  reset:'LATCHED'},
  ELEC_BUS:  {sev:2,label:'ELEC BUS OFF',  reset:'LATCHED'},
  ADC_FAULT: {sev:1,label:'AIR DATA FAULT',reset:'LATCHED'},
  FUEL_LEAK: {sev:2,label:'FUEL LEAK',     reset:'LATCHED'},
  OVERSPEED: {sev:1,label:'OVERSPEED',     reset:'AUTO'},
  STALL:     {sev:2,label:'STALL',         reset:'AUTO'},
  GEAR_FAULT:{sev:2,label:'GEAR DISAGREE', reset:'LATCHED'},
  BIRD_STRIKE:{sev:3,label:'BIRD STRIKE ENG 2',reset:'LATCHED'},
  FLAMEOUT:  {sev:3,label:'ENG 1 FLAMEOUT', reset:'LATCHED'},
  TRIM_RUNAWAY:{sev:2,label:'PITCH TRIM RUNAWAY',reset:'LATCHED'},
  RUDDER_JAM:{sev:2,label:'RUDDER JAM',    reset:'LATCHED'},
  AIL_JAM:   {sev:2,label:'AILERON JAM',   reset:'LATCHED'},
  TIRE_BURST:{sev:2,label:'TIRE BURST',    reset:'LATCHED'},
  FLAP_JAM:{sev:2,label:'FLAPS JAMMED',reset:'LATCHED'},
  SPOILER_JAM:{sev:2,label:'SPOILERS STUCK',reset:'LATCHED'},
  ELEV_JAM:{sev:3,label:'ELEVATOR JAM',reset:'LATCHED'},
  ICING:{sev:2,label:'WING ICING',reset:'LATCHED'},
  OIL_PRESS:{sev:2,label:'ENG 2 OIL PRESS LO',reset:'LATCHED'},
  ENG_SURGE:{sev:2,label:'ENG 1 SURGE',reset:'LATCHED'},
  BRAKE_FAIL:{sev:2,label:'BRAKES INOP',reset:'LATCHED'},
  CABIN_ALT:{sev:3,label:'CABIN ALTITUDE',reset:'LATCHED'},
  GEN_FAIL:{sev:2,label:'GEN 1 FAIL · L DISPLAYS',reset:'LATCHED'},
  PITOT_BLOCK:{sev:1,label:'PITOT BLOCKED · IAS',reset:'LATCHED'},
  STATIC_BLOCK:{sev:1,label:'STATIC BLOCKED · ALT/VS',reset:'LATCHED'},
  AOA_FAIL:{sev:1,label:'AOA SENSOR FAIL',reset:'LATCHED'},
  ATT_FAIL:{sev:2,label:'ATTITUDE GYRO FAIL',reset:'LATCHED'},
  HDG_FAIL:{sev:1,label:'COMPASS FAIL',reset:'LATCHED'},
  FUEL_QTY:{sev:1,label:'FUEL QTY SENSOR',reset:'LATCHED'},
  ENG_SENSOR:{sev:1,label:'ENG 1 SENSOR FAIL',reset:'LATCHED'},
  RADALT_FAIL:{sev:1,label:'RADIO ALT FAIL',reset:'LATCHED'},
  COCKPIT_SMOKE:{sev:3,label:'SMOKE IN COCKPIT',reset:'LATCHED'},
  MICROBURST:{sev:3,label:'MICROBURST · WIND SHEAR',reset:'LATCHED'},LIGHTNING:{sev:2,label:'LIGHTNING STRIKE',reset:'LATCHED'},ASH:{sev:2,label:'VOLCANIC ASH',reset:'LATCHED'},FUEL_IMBAL:{sev:2,label:'FUEL IMBALANCE',reset:'LATCHED'},DUAL_ENG:{sev:3,label:'DUAL ENGINE FAILURE',reset:'LATCHED'},THR_STUCK:{sev:2,label:'THROTTLE STUCK',reset:'LATCHED'},DECOMP:{sev:3,label:'RAPID DECOMPRESSION',reset:'LATCHED'},CHAOS:{sev:1,label:'CHAOS MODE',reset:'LATCHED'},
  COLLISION:{sev:3,label:'TRAFFIC COLLISION COURSE',reset:'LATCHED'}
};

class FaultController{
  constructor(){ this.pending={}; this.latched={}; this.debounce=0.30; }
  update(name, active, t){
    if(active){
      if(this.latched[name]) return;
      if(this.pending[name]===undefined) this.pending[name]=t;
      if(t-this.pending[name]>=this.debounce){ this.latched[name]=t; this.onLatch(name); }
    } else {
      if(this.latched[name] && FAULTS[name] && FAULTS[name].reset==='AUTO') this.clear(name);
      delete this.pending[name];
    }
  }
  inject(name){
    if(this.latched[name]) return;
    this.latched[name]=performance.now()*0.001;
    this.onLatch(name);
    if(name==='GEAR_FAULT') plane.gearTarget=plane.gearPos;
  }
  onLatch(name){
    const f=FAULTS[name]; console.warn('[FAULT LATCHED]',name,f?f.label:name);
    if(f&&(f.sev>=3||name==='OVERSPEED'))DSP.warnAck=false;
    else if(f&&f.sev===2)DSP.cautionAck=false;
    if(typeof showMsg==='function') showMsg('⚠ '+((f&&f.label)||name),3500);
    if(f&&f.sev>=3&&typeof camState!=='undefined') camState.shake=Math.max(camState.shake,1.8);
    try{sensorLatch(name);}catch(e){}
  }
  clear(name){ delete this.latched[name]; delete this.pending[name]; }
  clearAll(){ this.latched={}; this.pending={}; }
  has(name){ return !!this.latched[name]; }
  list(){ return Object.keys(this.latched); }
  worst(){ let w=0; for(const n in this.latched){ const s=FAULTS[n]?FAULTS[n].sev:1; if(s>w)w=s; } return w; }
}
const faults=new FaultController();
const fireTimers={L:0,R:0};
const faultT={oil:0,cab:0};
const engFactor={L:1,R:1};

function triggerFire(key){
  if(faults.has('ENG_FIRE_'+key)) return;
  faults.inject('ENG_FIRE_'+key);
  fireTimers[key]=0;
  ENG.fireWarning[key]=true;
  try{masterWarn();setTimeout(()=>speak(key==='L'?'engine 1 fire':'engine 2 fire'),450);}catch(e){}
}
function extinguishFire(key){
  faults.clear('ENG_FIRE_'+key);
  ENG.fireWarning[key]=false;
  fireTimers[key]=0;
}

function updateFaults(dt){
  const t=performance.now()*0.001;
  if(typeof computeAirspeed==='function'){
    const air=computeAirspeed();
    faults.update('OVERSPEED', air.mach>0.82, t);
  }
  faults.update('STALL', plane.stall && !plane.onGround, t);
  engFactor.L=1;engFactor.R=1;
  if(faults.has('OIL_PRESS')){
    faultT.oil+=dt;engFactor.R=Math.max(0,1-faultT.oil/45);
    if(faultT.oil>45&&ENG.R.state==='RUNNING'){ENG.R.state='SHUTDOWN';showMsg('ENG 2 SEIZED · OIL PRESSURE',3000);}
  } else faultT.oil=0;
  if(faults.has('ENG_SURGE')&&ENG.L.state==='RUNNING'){
    engFactor.L=Math.max(0,Math.min(1,0.78+0.22*Math.sin(t*6.5)*Math.sin(t*2.3)+(Math.random()-.5)*.1));
    camState.shake=Math.max(camState.shake,0.5);
  }
  if(faults.has('SPOILER_JAM'))plane.spoilerDeploy=0.55;
  if(faults.has('CABIN_ALT')){
    faultT.cab+=dt;
    if(faultT.cab>6&&plane.pos.y*3.28084>10000){faultT.cab=0;showMsg('⚠ CABIN ALTITUDE · DESCEND TO 10,000 FT',3500);}
  } else faultT.cab=0;

  if(faults.has('FLAMEOUT')&&ENG.L.state==='RUNNING')ENG.L.state='SHUTDOWN';
  if(faults.has('BIRD_STRIKE')&&ENG.R.state==='RUNNING'){ENG.R.state='SHUTDOWN';plane.angVel.z+=.3;showMsg('BIRD STRIKE · ENG 2 FAILURE',3000);window._birdStrikeFired=true;setTimeout(()=>{window._birdStrikeFired=false;},800);}
  if(faults.has('TRIM_RUNAWAY'))plane.elevTrim=Math.min(.9,plane.elevTrim+dt*.05);
  { const rt=(faults.has('RUDDER_JAM')?.55:0)+(faults.has('TIRE_BURST')&&plane.onGround?.3:0);
    if(rt||updateFaults._rt)plane.rudTrim=rt;updateFaults._rt=rt;
    const at=faults.has('AIL_JAM')?.5:0;if(at||updateFaults._at)plane.ailTrim=at;updateFaults._at=at; }
  if(faults.has('FUEL_LEAK')) plane.fuel=Math.max(0,plane.fuel-dt*80);
  if(plane.fuel<=0){
    for(const k of ['L','R']) if(ENG[k].state==='RUNNING'){ENG[k].state='SHUTDOWN';}
  }

  for(const k of ['L','R']){
    if(faults.has('ENG_FIRE_'+k)){
      fireTimers[k]=(fireTimers[k]||0)+dt;
      if(fireTimers[k]>30 && ENG[k].state!=='SHUTDOWN'){
        ENG[k].state='SHUTDOWN';
        showMsg('ENG '+k+' FAILED · FIRE',3000);
      }
    }
  }

  if(!plane.onGround && Math.random()<dt*0.00008){
    const pool=['HYD_LOSS','ELEC_BUS','ADC_FAULT','FUEL_LEAK'];
    faults.inject(pool[(Math.random()*pool.length)|0]);
  }
  // Random bird strike during takeoff/approach phase (agl 50–1500 ft)
  const _agl=(plane.pos.y-(typeof ghPreview!=='undefined'?ghPreview:0))*3.28084;
  if(!plane.onGround&&!faults.has('BIRD_STRIKE')&&_agl>50&&_agl<1500&&Math.random()<dt*0.000012){
    faults.inject('BIRD_STRIKE');
  }
}

function updateFaultHUD(){
  const panel=document.getElementById('faultPanel');
  const list=document.getElementById('faultList');
  const mw=document.getElementById('masterWarn');
  const mwWarn=document.getElementById('mwWarn');
  const mwCaution=document.getElementById('mwCaution');
  const items=faults.list(),worst=faults.worst();
  const masterWarning=worst>=3||faults.has('OVERSPEED');
  window._cockpitAlerts={warning:masterWarning,caution:worst===2};
  if(items.length===0){
    panel.classList.remove('show'); mw.classList.remove('on');
    mwWarn.classList.remove('show'); mwCaution.classList.remove('show');
  } else {
    panel.classList.add('show');
    let html='';
    for(const n of items){
      const f=FAULTS[n]||{sev:1,label:n,reset:'LATCHED'};
      const cls=f.sev>=3?'sev3':(f.sev===2?'':'sev1');
      html+=`<div class="faultRow ${cls}"><span>${f.label}</span><span class="rst">${f.reset}</span></div>`;
    }
    list.innerHTML=html;
    mw.classList.add('on');
    mwWarn.classList.toggle('show', masterWarning&&!DSP.warnAck);
    mwCaution.classList.toggle('show', worst===2&&!DSP.cautionAck);
  }
  try{
    const cduMeshRef=scene.getMeshByName('cdu');
    if(cduMeshRef&&cduMeshRef.material){
      cduMeshRef.material.emissiveColor=faults.has('ELEC_BUS')?new BABYLON.Color3(0,0,0):new BABYLON.Color3(1,1,1);
    }
  }catch(e){}
  document.querySelectorAll('.faultBtn[data-inject]').forEach(btn=>{
    const f=btn.dataset.inject;
    let active=false;
    if(f==='ENG_FIRE_L')active=faults.has('ENG_FIRE_L');
    else if(f==='ENG_FIRE_R')active=faults.has('ENG_FIRE_R');
    else active=faults.has(f);
    btn.classList.toggle('active',active);
  });
}
/* ================= END FAULT CONTROL ================= */

function resetAircraft(lat,lon,elev){
  try{window._recReset&&window._recReset();}catch(e){}
  CFG.origin.lat=lat;CFG.origin.lon=lon;
  M_PER_DEG_LAT=111132;M_PER_DEG_LON=111320*Math.cos(lat*Math.PI/180);
  plane.pos.set(0,Math.max(elev+1500,2000),0);
  plane.vel.set(0,0,-135);plane.quat=START_QUAT.clone();
  plane.angVel.set(0,0,0);plane.throttle=0;
  plane.reverserOn=false;
  plane.flaps=1;plane.gearDown=true;plane.spoilerDeploy=0;
  plane.elevator=0;plane.aileron=0;plane.rudder=0;
  plane.elevTrim=0;plane.ailTrim=0;plane.rudTrim=0;
  plane.alpha=0;plane.gForce=1;plane.speed=0;
  plane.fuel=18000;plane.crashed=false;plane.brakeHold=false;plane.parkingBrake=false;plane.stall=false;
  plane.gearCompress=0;plane.gearSpringVel=0;plane.justTouched=false;
  plane.turbTimer=0;plane.turbPhase=Math.random()*100;
  plane.gearPos=1.0;plane.gearTarget=1.0;
  plane.flapVisual=FLAPS[plane.flaps].angle;
  plane.spoilerVisual=0;plane.bellyLanding=false;
  faults.clearAll();
  fireTimers.L=0;fireTimers.R=0;
  faultT.oil=0;faultT.cab=0;plane._ej=undefined;engFactor.L=1;engFactor.R=1;
  const code=currentLocation.code;
  const start=currentLocation.start;
  if(RUNWAYS[code] && start!=='cruise'){
    const rw=RUNWAYS[code];
    const h=rw.hdg*Math.PI/180;
    const dirX=Math.sin(h), dirZ=-Math.cos(h);
    const surfY=(runwayLenM>0)?runwayY:(sampleTerrain(0,0)||elev);
    const gh=ACFG.gearHeight;
    if(start==='takeoff'){
      const startOffset=-(rw.len/2 - 120);
      const px=dirX*startOffset, pz=dirZ*startOffset;
      plane.pos.set(px,surfY+gh,pz);
      plane.vel.set(0,0,0);
      plane.quat=BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(),Math.PI-h);
      plane.throttle=0;plane.flaps=2;plane.gearDown=true;plane.speed=0;
    } else if(start==='final'){
      const d=rw.len/2 + 5000;
      const alt=surfY + d*Math.tan(3*Math.PI/180) + 40;
      plane.pos.set(-dirX*d, alt, -dirZ*d);
      const spd=77;
      plane.vel.set(dirX*spd, -spd*Math.tan(3*Math.PI/180), dirZ*spd);
      const yawQ=BABYLON.Quaternion.RotationAxis(BABYLON.Vector3.Up(),Math.PI-h);
      const pitchQ=BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(1,0,0),-6*Math.PI/180);
      plane.quat=yawQ.multiply(pitchQ);
      plane.throttle=.55;plane.flaps=4;plane.gearDown=true;plane.speed=spd;
      plane.elevTrim=-0.25;
    }
  }
  if(!(RUNWAYS[code]&&start!=='cruise')){plane.throttle=.38;plane.flaps=0;plane.gearDown=false;plane.vel.set(0,0,-135);plane.speed=135;}
  plane.gearPos=plane.gearDown?1.0:0.0;
  plane.gearTarget=plane.gearPos;
  plane.flapVisual=FLAPS[plane.flaps].angle;

  AP.master=false;AP.apInhibit=false;AP.athr=false;AP.athrArmed=false;AP.hdgMode=false;AP.altMode=false;AP.vsMode=false;AP.spdMode=false;
  ENG.battery=true;ENG.fuelPumps=true;ENG.apuBleed=true;ENG.ignition=false;
  AIRSYS.fuel.leftPump=true;AIRSYS.fuel.rightPump=true;AIRSYS.fuel.centerLeft=false;AIRSYS.fuel.centerRight=false;
  AIRSYS.engine.fuelCutoffLeft=false;AIRSYS.engine.fuelCutoffRight=false;
  window._genL=true;window._genR=true;window._apuGen=true;
  ENG.apu.running=true;ENG.apu.n2=100;ENG.apu.egt=380;ENG.apu.spooling=false;
  ENG.L.n1=22;ENG.L.n2=58;ENG.L.egt=380;ENG.L.ff=600;ENG.L.state='RUNNING';
  ENG.R.n1=22;ENG.R.n2=58;ENG.R.egt=380;ENG.R.ff=600;ENG.R.state='RUNNING';
  ENG.starting=false;ENG.startTimer=0;ENG.L.n1=ENG.R.n1=22+plane.throttle*78;
  ENG.fireWarning.L=false;ENG.fireWarning.R=false;
  ENG.fireHandlesPulled.L=false;ENG.fireHandlesPulled.R=false;
  fireHandles.L.pulled=false;fireHandles.R.pulled=false;
  fireHandles.L.pivot.position.y=-.27;fireHandles.R.pivot.position.y=-.27;
  try{
    for(const k of ['L','R']){
      if(firePS[k]&&firePS[k].isStarted())firePS[k].stop();
      if(smokePS[k]&&smokePS[k].isStarted())smokePS[k].stop();
    }
    if(sparksPS&&sparksPS.isStarted())sparksPS.stop();
  }catch(e){}
  updateSurfaceVisuals(1/60);updateChips();
  aircraftRoot.position.copyFrom(plane.pos);
  aircraftRoot.rotationQuaternion=plane.quat;
  camState.initialized=false;camState.towerPos=null;camState.flybyVantage=null;
  camState.transitionTimer=0;camState.shake=0;
}

function toggleFireHandle(key){
  if(ENG.fireHandlesPulled[key]){
    ENG.fireHandlesPulled[key]=false;
    fireHandles[key].pulled=false;
    fireHandles[key].pivot.position.y=-.27;
    showMsg('ENG '+key+' FIRE HANDLE RESET');
  }else{
    ENG.fireHandlesPulled[key]=true;
    fireHandles[key].pulled=true;
    fireHandles[key].pivot.position.y=-.24;
    showMsg('ENG '+key+' FIRE BOTTLE DISCHARGED');
    extinguishFire(key);
    ENG.fireWarning[key]=false;
    setTimeout(()=>{
      ENG[key].state='SHUTDOWN';
      ENG[key].n1=0;ENG[key].n2=0;ENG[key].egt=15;ENG[key].ff=0;
    },2000);
  }
}

function startEngines(){
  if(ENG.starting)return;
  if(ENG.L.state==='RUNNING'&&ENG.R.state==='RUNNING'){showMsg('ENGINES ALREADY RUNNING');return;}
  if(!electricalPower()){showMsg('ENGINE START INHIBITED · NO ELECTRICAL POWER',2500);return;}
  if(!ENG.fuelPumps){showMsg('ENGINE START INHIBITED · FUEL PUMPS OFF',2500);return;}
  if(AIRSYS.engine.fuelCutoffLeft||AIRSYS.engine.fuelCutoffRight){showMsg('ENGINE START INHIBITED · FUEL CUTOFF',2500);return;}
  ENG.starting=true;ENG.startTimer=0;
  showMsg('ENGINE START SEQUENCE');
  ENG.L.state='STARTING';ENG.L.starterTimer=0;
  ENG.R.state='PENDING';
}

function updateEngines(dt){
  if(ENG.starting){
    ENG.startTimer+=dt;
    if(ENG.startTimer>12&&ENG.R.state==='PENDING'){ENG.R.state='STARTING';ENG.R.starterTimer=0;}
    if(ENG.L.state==='RUNNING'&&ENG.R.state==='RUNNING'){ENG.starting=false;showMsg('STARTUP COMPLETE');}
  }
  for(const key of ['L','R']){
    const e=ENG[key];
    if(e.state==='STARTING'){
      e.starterTimer+=dt;const t=e.starterTimer;
      if(t<2){e.n2=25*(t/2);e.egt=15+20*(t/2);e.n1=0;e.ff=0;}
      else if(t<4){e.n2=25+10*((t-2)/2);e.egt=15+400*((t-2)/2);e.n1=5*((t-2)/2);e.ff=200*((t-2)/2);}
      else if(t<9){const p=(t-4)/5;e.n2=35+23*p;e.egt=415-30*p;e.n1=5+17*p;e.ff=200+400*p;}
      else if(t<12){const p=(t-9)/3;e.n2=58;e.egt=385-5*p;e.n1=22;e.ff=600;}
      else{e.state='RUNNING';e.n2=58;e.egt=380;e.n1=22;e.ff=600;}
    }
    if(e.state==='RUNNING'){
      const tn=22+plane.throttle*78;
      e.n1+=(tn-e.n1)*Math.min(1,dt*.8);
      e.n2=58+(e.n1-22)*.5;
      e.egt=380+(e.n1-22)*4;
      e.ff=600+(e.n1-22)*45;
    }
    if(e.state==='SHUTDOWN'){
      e.n1=Math.max(0,e.n1-dt*8);e.n2=Math.max(0,e.n2-dt*20);
      e.egt=Math.max(15,e.egt-dt*30);e.ff=Math.max(0,e.ff-dt*500);
      if(e.n1<1&&e.n2<1)e.state='OFF';
    }
  }
  if(ENG.apu.spooling){
    ENG.apu.n2+=dt*12;
    ENG.apu.egt=Math.min(500,ENG.apu.egt+dt*80);
    if(ENG.apu.n2>=100){ENG.apu.n2=100;ENG.apu.running=true;ENG.apu.spooling=false;ENG.apu.egt=380;}
  }
}

function updateControlAnimation(dt){
  if(!faults.has('GEAR_FAULT')){
    plane.gearTarget = plane.gearDown ? 1.0 : 0.0;
  }
  const gearRate = 1/2.5;
  if(plane.gearPos < plane.gearTarget) plane.gearPos = Math.min(plane.gearTarget, plane.gearPos + dt*gearRate);
  else if(plane.gearPos > plane.gearTarget) plane.gearPos = Math.max(plane.gearTarget, plane.gearPos - dt*gearRate);
  const flapTarget = FLAPS[plane.flaps].angle;
  const flapDelta = flapTarget - plane.flapVisual;
  if(Math.abs(flapDelta) < 0.002) plane.flapVisual = flapTarget;
  else plane.flapVisual += flapDelta * Math.min(1, dt*1.8);
  const spTarget = plane.spoilerDeploy;
  const spDelta = spTarget - plane.spoilerVisual;
  if(Math.abs(spDelta) < 0.01) plane.spoilerVisual = spTarget;
  else plane.spoilerVisual += spDelta * Math.min(1, dt*6);
}

function updateSurfaceVisuals(dt=1/60){
  for(const k in SURF.flapPivots) SURF.flapPivots[k].rotation.x = -plane.flapVisual;
  if(SURF.ailPivots.R)SURF.ailPivots.R.rotation.x=-plane.aileron*.35;
  if(SURF.ailPivots.L)SURF.ailPivots.L.rotation.x=plane.aileron*.35;
  const elA=-plane.elevator*.4-plane.elevTrim*.15;
  if(SURF.elevPivots.R)SURF.elevPivots.R.rotation.x=elA;
  if(SURF.elevPivots.L)SURF.elevPivots.L.rotation.x=elA;
  if(SURF.rudPivot)SURF.rudPivot.rotation.y=plane.rudder*.5+plane.rudTrim*.2;
  const gAngle = (1 - plane.gearPos) * -Math.PI/2 * 0.92;
  for(const k in gearPivots) gearPivots[k].rotation.x = gAngle;
  for(const k in SURF.spoilerPivots) SURF.spoilerPivots[k].rotation.x = -plane.spoilerVisual*Math.PI/3.2;
  for(const rd of reverserDoors){
    /* nose is +z, so the translating sleeve must travel toward -z (aft) when deployed */
    const target=-0.3+(plane.reverserOn?-1.1:0);
    rd.pivot.position.z += (target-rd.pivot.position.z)*Math.min(1,dt*5);
    rd.mesh.scaling.z = plane.reverserOn ? 1.04 : 1.0;
  }
  const compressOffset = (plane.gearCompress||0) * 0.65;
  for(const k in gearPivots){
    if(gearInitialY[k]!==undefined){
      gearPivots[k].position.y = gearInitialY[k] + compressOffset;
    }
  }
  if(yokes.L){yokes.L.rotation.z=-plane.aileron*.5;yokes.L.rotation.x=plane.elevator*.15;}
  if(yokes.R){yokes.R.rotation.z=-plane.aileron*.5;yokes.R.rotation.x=plane.elevator*.15;}
  if(throttleLevers){
    for(let i=0;i<2;i++){
      const y=-.13+plane.throttle*.05;
      throttleLevers[i].lever.position.y=y;
      throttleLevers[i].knob.position.y=y+.09;
    }
  }
  if(sbLever&&sbKnob){
    const sy=-.26+(plane.spoilerVisual||0)*.14;
    sbLever.position.y=sy;sbKnob.position.y=sy+.08;
  }
  if(flapLever&&flapKnob){
    const ft=(FLAPS.length>1)?plane.flaps/(FLAPS.length-1):0;
    const fy=-.26+ft*.14;
    flapLever.position.y=fy;flapKnob.position.y=fy+.08;
  }
  if(cockpitLight.isEnabled()){
    const nt=(typeof nightMode!=='undefined')&&nightMode;
    /* N1-reactive instrument glow – panel gets slightly brighter at high thrust */
    const n1avg=((ENG.L.n1||0)+(ENG.R.n1||0))*0.5;
    const thrustGlow=n1avg>20?Math.min(.35,(n1avg-20)/250):0;
    if(nt){
      /* Night: warm amber for main, soft red for instruments */
      cockpitLight.diffuse=new BABYLON.Color3(1,.72,.35);
      cockpitLight.intensity=2.4+thrustGlow;cockpitLight.range=13;
      cockpitLight2.diffuse=new BABYLON.Color3(.9,.22,.05);
      cockpitLight2.intensity=1.0+thrustGlow*.5;cockpitLight2.range=7;
    }else{
      /* Day: neutral white-cool */
      cockpitLight.diffuse=new BABYLON.Color3(1,.97,.92);
      cockpitLight.intensity=1.9+thrustGlow;cockpitLight.range=13;
      cockpitLight2.diffuse=new BABYLON.Color3(.8,.92,1);
      cockpitLight2.intensity=1.2+thrustGlow*.4;cockpitLight2.range=9;
    }
  }
}

const keys=Object.create(null);
const input={pitch:0,roll:0,yaw:0};
let camMode=0;
const CAM_NAMES=['CHASE','COCKPIT','ORBIT','TOWER','FLYBY','WING','CINEMA'];

function setCamMode(m){
  camMode=m;
  window._simCamMode=m; // expose for external features
  updateChips();
  camBadge.textContent='CAM · '+CAM_NAMES[camMode];
  const isCockpit=(camMode===1);
  interiorRoot.setEnabled(isCockpit);
  exteriorRoot.setEnabled(true);
  for(const mm of exteriorRoot.getChildMeshes())if(/^(fuselage|cpGlass|cw|stripe|bc|nac|lip|fan|spin|exh|pyl|revD)/.test(mm.name))mm.setEnabled(!isCockpit);
  cockpitLight.setEnabled(isCockpit);
  cockpitLight2.setEnabled(isCockpit);
  document.body.classList.toggle('cockpit',isCockpit);
  if(camMode===3)camState.towerPos=null;
  if(camMode===4)camState.flybyVantage=null;
  if(camMode===6)camState.cinemaTimer=6;
  startCamTransition();
  showMsg('CAM · '+CAM_NAMES[camMode]);
}

window.addEventListener('keydown',e=>{
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','PageUp','PageDown'].includes(e.code))e.preventDefault();
  if(e.code==='F1'){e.preventDefault();triggerFire('L');return;}
  if(e.code==='F2'){e.preventDefault();triggerFire('R');return;}
  if(e.code==='F3'){e.preventDefault();faults.inject('HYD_LOSS');return;}
  if(e.code==='F4'){e.preventDefault();faults.inject('ELEC_BUS');return;}
  if(e.code==='F5'){e.preventDefault();faults.inject('ADC_FAULT');return;}
  if(e.code==='F6'){e.preventDefault();faults.inject('FUEL_LEAK');return;}
  if(e.code==='F7'){e.preventDefault();faults.inject('GEAR_FAULT');return;}
  if(e.code==='F8'){e.preventDefault();faults.clearAll();
    ENG.fireWarning.L=false;ENG.fireWarning.R=false;
    fireTimers.L=0;fireTimers.R=0;
    showMsg('ALL FAULTS CLEARED',2000);return;}
  if(keys[e.code])return;keys[e.code]=true;
  if(e.code==='KeyC'||e.code==='KeyV')setCamMode((camMode+1)%CAM_NAMES.length);
  if(e.code==='KeyX'){const h=document.body.classList.toggle('pfd-hidden');showMsg('PFD '+(h?'HIDDEN':'SHOWN'),1200);}
  if(e.code==='KeyR')respawn();
  if(e.code==='KeyI')startEngines();
  if(e.code==='KeyN'&&!e.shiftKey){
    if(plane.onGround && Math.hypot(plane.vel.x,plane.vel.z) > 1){
      plane.reverserOn=!plane.reverserOn;
      showMsg('REVERSERS '+(plane.reverserOn?'DEPLOYED':'STOWED'));
      updateChips();
    } else if(!plane.onGround){showMsg('REVERSERS · ON GROUND ONLY');}
  }
  if(e.code==='KeyP'){
    if(!AP.master&&AP.apInhibit){showMsg('RAISE DISENGAGE BAR');return;}
    AP.master=!AP.master;
    if(AP.master){
      const mm=BABYLON.Matrix.Identity();plane.quat.toRotationMatrix(mm);
      const f=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,0,1),mm);
      AP.hdgTarget=Math.round((Math.atan2(f.x,-f.z)*180/Math.PI+360)%360);
      AP.hdgMode=true;AP.altMode=true;AP.vsMode=false;
      AP.altTarget=Math.round(plane.pos.y*3.28084/100)*100;
    }
    if(!AP.master)AP.appr=false;showMsg('AUTOPILOT '+(AP.master?'ENGAGED · HDG '+AP.hdgTarget+' · ALT '+AP.altTarget:'OFF'));
  }
  if(e.code==='BracketLeft')AP.hdgTarget=(AP.hdgTarget+355)%360;
  if(e.code==='BracketRight')AP.hdgTarget=(AP.hdgTarget+5)%360;
  if(e.code==='PageUp')AP.altTarget+=500;
  if(e.code==='PageDown')AP.altTarget=Math.max(0,AP.altTarget-500);
  if(e.code==='KeyT'){
    AP.athr=!AP.athr;
    if(AP.athr){AP.athrArmed=true;AP.spdMode=true;AP.spdTarget=Math.round(plane.speed*1.94384);}
    else AP.spdMode=false;
    showMsg('AUTOTHROTTLE '+(AP.athr?'SPD '+AP.spdTarget:'OFF'));
  }
  if(e.code==='KeyF'){if(faults.has('FLAP_JAM'))showMsg('FLAPS JAMMED · STUCK AT '+FLAPS[plane.flaps].name);else{plane.flaps=(plane.flaps+1)%FLAPS.length;showMsg('FLAPS '+FLAPS[plane.flaps].name);updateChips();}}
  if(e.code==='KeyG'){
    if(faults.has('GEAR_FAULT')){showMsg('GEAR DISAGREE · CANNOT MOVE');}
    else{
      plane.gearDown=!plane.gearDown;
      showMsg('GEAR '+(plane.gearDown?'DOWN':'UP'));
      // Gear UP on takeoff: retract any deployed spoilers (lift is needed)
      if(!plane.gearDown && plane.spoilerDeploy>0 && !plane.onGround){
        plane.spoilerDeploy=0;showMsg('SPOILERS RETRACTED · GEAR UP',1600);
      }
      updateChips();
    }
  }
  if(e.code==='KeyB'){if(faults.has('SPOILER_JAM'))showMsg('SPOILERS STUCK');else{plane.spoilerDeploy=plane.spoilerDeploy>.5?0:1;showMsg('SPOILERS '+(plane.spoilerDeploy>.5?'DEPLOYED · ARMED FOR LANDING':'RETRACTED'));updateChips();}}
  if(e.code>='Digit1'&&e.code<='Digit5'){if(faults.has('FLAP_JAM'))showMsg('FLAPS JAMMED · STUCK AT '+FLAPS[plane.flaps].name);else{const n=parseInt(e.code.slice(5));plane.flaps=n-1;showMsg('FLAPS '+FLAPS[plane.flaps].name);updateChips();}}
});
window.addEventListener('keyup',e=>{keys[e.code]=false;});
window.addEventListener('blur',()=>{for(const k in keys)keys[k]=false;});

let mouseDown=false,mX=0,mY=0,mPitch=0,mRoll=0;
let mouseInvert=false;try{mouseInvert=localStorage.getItem('bf737_mouse_inv')==='1';}catch(e){}
{const ms=document.getElementById('mouseSel');if(ms){ms.value=mouseInvert?'inv':'std';ms.addEventListener('change',()=>{mouseInvert=ms.value==='inv';try{localStorage.setItem('bf737_mouse_inv',mouseInvert?'1':'0');}catch(e){}});}}
canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('mousedown',e=>{if(e.button===2){mouseDown=true;mX=e.clientX;mY=e.clientY;}});
window.addEventListener('mouseup',e=>{if(e.button===2){mouseDown=false;mPitch=0;mRoll=0;}});
window.addEventListener('mousemove',e=>{
  if(!mouseDown)return;
  mRoll=BABYLON.Scalar.Clamp((e.clientX-mX)/420,-1,1);
  mPitch=BABYLON.Scalar.Clamp((e.clientY-mY)/420*(mouseInvert?-1:1),-1,1);
});

function readInput(dt){
  if(AP.master){input.pitch=0;input.roll=0;input.yaw=0;}
  else{
    let p=0,r=0,y=0;
    if(keys['KeyW'])p+=1;
    if(keys['KeyS'])p-=1;
    if(keys['KeyA'])r+=1;
    if(keys['KeyD'])r-=1;
    if(keys['KeyQ'])y+=1;
    if(keys['KeyE'])y-=1;
    if(mouseDown){p+=mPitch;r+=mRoll;}
    {const ex=v=>Math.sign(v)*Math.pow(Math.abs(v),1.7);p+=ex(tPitch);r+=ex(tRoll);}
    input.pitch=BABYLON.Scalar.Clamp(p,-1,1);
    input.roll=BABYLON.Scalar.Clamp(r,-1,1);
    input.yaw=BABYLON.Scalar.Clamp(y,-1,1);
  }
  if(keys['ArrowUp'])plane.elevTrim=BABYLON.Scalar.Clamp(plane.elevTrim+dt*.4,-1,1);
  if(keys['ArrowDown'])plane.elevTrim=BABYLON.Scalar.Clamp(plane.elevTrim-dt*.4,-1,1);
  if(keys['ArrowLeft'])plane.ailTrim=BABYLON.Scalar.Clamp(plane.ailTrim-dt*.4,-1,1);
  if(keys['ArrowRight'])plane.ailTrim=BABYLON.Scalar.Clamp(plane.ailTrim+dt*.4,-1,1);
  if(keys['KeyZ'])plane.rudTrim=BABYLON.Scalar.Clamp(plane.rudTrim+(keys['ShiftLeft']||keys['ShiftRight']?1:-1)*dt*.4,-1,1);
  const engRun=(ENG.L.state==='RUNNING'||ENG.R.state==='RUNNING');
  if(engRun){
    const rate=plane.onGround?.75:.55;
    if(keys['ShiftLeft']||keys['ShiftRight'])plane.throttle=BABYLON.Scalar.Clamp(plane.throttle+dt*rate,0,1);
    if(keys['ControlLeft']||keys['ControlRight'])plane.throttle=BABYLON.Scalar.Clamp(plane.throttle-dt*rate,0,1);
  }
  plane.brakeHold=(!!keys['Space']||plane.parkingBrake)&&!faults.has('BRAKE_FAIL');
}

const tmpM=BABYLON.Matrix.Identity();
const _nm=BABYLON.Matrix.Identity();
function nudgeRot(axis,amt,errFn){
  if(amt<=1e-6)return;const q0=plane.quat.clone();let best=null,be=1e9;
  for(const sg of [1,-1]){const r=BABYLON.Quaternion.RotationAxis(axis,amt*sg);
    for(const c of [q0.multiply(r),r.multiply(q0)]){c.normalize();plane.quat=c;const e=Math.abs(errFn());if(e<be){be=e;best=c;}}}
  plane.quat=best;
}
const _bankErr=()=>{plane.quat.toRotationMatrix(_nm);return BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1,0,0),_nm).y;};
let _pitchTgt=0;
const _pitchErr=()=>{plane.quat.toRotationMatrix(_nm);return BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,0,1),_nm).y-Math.sin(_pitchTgt);};
function physicsStep(dt){
  if(plane.crashed||plane.hold)return;
  if(dt>.05)dt=.05;
  updateEngines(dt);
  updateAutopilot(dt);
  updateControlAnimation(dt);

  const wx=currentWeather;
  plane.turbPhase += dt*(0.7+wx.turb*0.5);
  const windDir = sunAzim + Math.sin(plane.turbPhase*0.05)*0.4;
  const windSpeed = wx.wind + Math.sin(plane.turbPhase*0.3)*wx.gust;
  windVec.set(Math.sin(windDir)*windSpeed, 0, Math.cos(windDir)*windSpeed);

  const n1L=ENG.L.state==='RUNNING'?ENG.L.n1*engFactor.L:0;
  const n1R=ENG.R.state==='RUNNING'?ENG.R.n1*engFactor.R:0;
  let thrustFwd=0, thrustRev=0;
  if(plane.reverserOn && plane.onGround){
    const hsRev=Math.hypot(plane.vel.x,plane.vel.z);
    const revRamp=Math.min(1,Math.max(0,(hsRev-2)/6));
    const revPower=Math.max(plane.throttle,0.35);
    thrustRev = ACFG.maxThrust * 0.5 * ((n1L+n1R)/100) * revPower * 0.42 * revRamp;
  } else {
    thrustFwd = ACFG.maxThrust * 0.5 * ((n1L+n1R)/100) * plane.throttle * Math.exp(-Math.max(plane.pos.y,0)/12000);
  }

  const k=1-Math.exp(-3.2*dt);
  plane.elevator+=(input.pitch-plane.elevator)*k;
  plane.aileron+=(input.roll-plane.aileron)*k;
  plane.rudder+=(input.yaw-plane.rudder)*(SET.rudder==='realistic'?1-Math.exp(-1.5*dt):k);
  if(faults.has('ELEV_JAM')){if(plane._ej===undefined)plane._ej=plane.elevator;plane.elevator=plane._ej;}else plane._ej=undefined;
  const effElev=BABYLON.Scalar.Clamp(plane.elevator+plane.elevTrim*.6,-1.5,1.5);
  const effAil=BABYLON.Scalar.Clamp(plane.aileron+plane.ailTrim*.6,-1.5,1.5);
  const effRud=BABYLON.Scalar.Clamp(plane.rudder+plane.rudTrim*.6,-1.5,1.5);

  plane.quat.toRotationMatrix(tmpM);
  const invM=tmpM.clone().invert();
  const airVel = plane.vel.clone().subtract(windVec);
  const vB=BABYLON.Vector3.TransformNormal(airVel,invM);
  const u=vB.z,v=vB.x,w=vB.y;
  const Va=Math.sqrt(u*u+v*v+w*w);plane.speed=Va;
  const alpha=Va>.8?Math.atan2(-w,Math.max(u,.001)):0;
  const beta=Va>.8?Math.asin(BABYLON.Scalar.Clamp(v/Va,-1,1)):0;
  plane.alpha=alpha;
  const alt=Math.max(plane.pos.y,0);
  const rho=1.225*Math.exp(-alt/8500);
  const fl=FLAPS[plane.flaps];

  const ghPreview=sampleSurface(plane.pos.x,plane.pos.z);
  const clearanceNow=plane.pos.y-ghPreview-(plane.gearPos>0.9?ACFG.gearHeight:0.6);
  const inGroundEffect=clearanceNow>0 && clearanceNow<ACFG.groundEffectAlt;
  const geStrength=inGroundEffect ? (1 - clearanceNow/ACFG.groundEffectAlt) : 0;

  let CL=ACFG.CL0+ACFG.CLa*alpha+fl.cl;
  const iceK=faults.has('ICING')?1:0;const aAbs=Math.abs(alpha),stallA=ACFG.stallAlpha+fl.stall-.05*iceK;
  if(aAbs>stallA){const over=(aAbs-stallA);CL*=BABYLON.Scalar.Clamp(1-over*1.3,.35,1);}
  CL=BABYLON.Scalar.Clamp(CL,-1.8,ACFG.CLmax+fl.cl);
  CL*=(1-.08*iceK);
  CL*=1+.10*geStrength;
  // Spoilers: kill lift aggressively (especially on ground where lift dump matters most)
  if(plane.spoilerDeploy>0){
    const spLiftKill = plane.onGround ? plane.spoilerDeploy*0.92 : plane.spoilerDeploy*0.70;
    CL*=(1-spLiftKill);
    // Ice penalty (Feature 20)
    if(plane._iceLiftPenalty>0)CL*=(1-plane._iceLiftPenalty);
  }
  plane.stall=aAbs>stallA&&Va>15;

  const gearDrag=plane.gearPos*0.020;
  // Spoilers: much higher drag than before (0.10 → 0.28 airborne, 0.18 on ground — weight does the work)
  const spDrag=plane.spoilerVisual*(plane.onGround?0.18:0.28);
  const brakeDrag=(plane.brakeHold&&Va<80)?.05:0;
  let CD=ACFG.CD0+ACFG.k*CL*CL+fl.cd+gearDrag+spDrag+brakeDrag+.014*iceK;
  { const mach=Va/(340.3-.0065*alt*.6); if(mach>.78)CD+=Math.pow(mach-.78,2)*9; }
  CD -= ACFG.k*CL*CL*geStrength*0.55;
  const q=.5*rho*Va*Va;
  const L=q*ACFG.wingArea*CL;
  const D=q*ACFG.wingArea*Math.max(CD,.005);
  const Yf=q*ACFG.wingArea*ACFG.Cy*beta;

  const F=new BABYLON.Vector3(0,0,0);
  if(Va>.5){
    const vdir=vB.scale(1/Va);
    const d=BABYLON.Vector3.Dot(new BABYLON.Vector3(0,1,0),vdir);
    const liftDir=new BABYLON.Vector3(0,1,0).subtract(vdir.scale(d));
    if(liftDir.lengthSquared()>1e-6){liftDir.normalize();F.addInPlace(liftDir.scale(L));}
    F.addInPlace(vdir.scale(-D));F.x-=Yf;
  }
  F.z += thrustFwd;
  F.z -= thrustRev;
  const Fw=BABYLON.Vector3.TransformNormal(F,tmpM);
  Fw.y-=ACFG.mass*9.81;

  const upW=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,1,0),tmpM);
  plane.gForce=1+(L*Math.max(0,BABYLON.Vector3.Dot(upW,plane.vel.clone().normalize())))/(ACFG.mass*9.81);
  if(!isFinite(plane.gForce))plane.gForce=1;
  plane.gForce=BABYLON.Scalar.Clamp(plane.gForce,-3,7);

  plane.vel.addInPlace(Fw.scale(dt/ACFG.mass));
  plane.pos.addInPlace(plane.vel.scale(dt));

  if(plane.stall&&!plane.onGround){const sb=Math.min(1,plane.speed/60);plane.angVel.z+=(Math.random()-.5)*1.4*sb*dt*8;plane.angVel.x+=(Math.random()-.5)*.5*sb*dt*8;}
  if(!plane.onGround){
    const turb=wx.turb;
    if(turb>0.01){
      const t=plane.turbPhase;
      const turbPitch=(Math.sin(t*2.1)+Math.sin(t*3.7)*.6+Math.sin(t*5.3)*.3)*turb*0.35;
      const turbRoll =(Math.sin(t*1.7+1.4)+Math.sin(t*4.1)*.5+Math.sin(t*7.3)*.3)*turb*0.55;
      const turbYaw  =(Math.sin(t*2.9+0.7)+Math.sin(t*4.9)*.5)*turb*0.20;
      plane.angVel.x += turbPitch*dt;
      plane.angVel.z += turbRoll*dt;
      plane.angVel.y += turbYaw*dt;
    }
  }

  const auth=BABYLON.Scalar.Clamp(Math.pow(Va/95,1.3),.12,1.1);
  const kk=1-Math.exp(-6*dt);
  const hydFactor = faults.has('HYD_LOSS') ? 0.40 : 1.0;
  let targetPitchRate = effElev*ACFG.maxElevRate*auth*hydFactor;
  const alphaNow=Math.abs(plane.alpha);
  const margin=ACFG.stallAlpha-alphaNow;
  if(margin<0.15 && targetPitchRate<0){
    const scale=Math.max(0,margin/0.15);targetPitchRate*=scale;
  }
  if(alphaNow>ACFG.stallAlpha){
    const urgency=Math.min(1,(alphaNow-ACFG.stallAlpha)/0.08);
    targetPitchRate=Math.max(targetPitchRate,urgency*1.4);
  }
  plane.angVel.x+=(targetPitchRate-plane.angVel.x)*kk;
  const advYaw=SET.rudder==='realistic'?input.roll*ACFG.maxRudRate*0.22*Math.min(1,Va/60):0;
  plane.angVel.y+=(effRud*ACFG.maxRudRate*auth*hydFactor+advYaw-beta*.9*Math.min(1,Va/100)-plane.angVel.y)*kk;
  plane.angVel.z+=(-effAil*ACFG.maxAilRate*auth*hydFactor-plane.angVel.z)*kk;
  if(AP.yd)plane.angVel.y*=(1-2.5*dt);
  if(!plane.onGround){plane.angVel.x*=(1-.9*dt);plane.angVel.z*=(1-.6*dt);}

  if(!plane.onGround&&!AP.master&&!faults.has('ELEV_JAM')&&Math.abs(input.pitch)<.02&&Va>45){
    const CLneed=(ACFG.mass*9.81)/Math.max(q*ACFG.wingArea,1);
    let alphaTrim=(CLneed-ACFG.CL0-fl.cl)/ACFG.CLa;
    alphaTrim=BABYLON.Scalar.Clamp(alphaTrim,-0.02,ACFG.stallAlpha-0.06);
    const agl=plane.pos.y-ghPreview;
    const landingPhase=agl<120 && plane.vel.y<0;
    const gain=landingPhase?0.8:2.5;
    const alphaErr=alpha-alphaTrim;
    plane.angVel.x += alphaErr*gain*dt;
  }
  if(plane.assist&&!AP.master&&Math.abs(input.roll)<.02){
    const rW=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1,0,0),tmpM);
    const bank=Math.atan2(rW.y,Math.sqrt(Math.max(0,1-rW.y*rW.y)));
    plane.angVel.z+=-bank*.9*dt*BABYLON.Scalar.Clamp(Va/100,0,1);
  }
  if(!plane.onGround&&!AP.master&&plane.gearPos>.5&&(plane.pos.y-ghPreview)<60&&Math.abs(input.roll)<.35){
    const rW=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1,0,0),tmpM);
    const bank=Math.atan2(rW.y,Math.sqrt(Math.max(0,1-rW.y*rW.y)));
    plane.angVel.z+=(-bank*6.0-plane.angVel.z*2.5)*dt*BABYLON.Scalar.Clamp(Va/80,0,1);
  }

  const hsAir=Math.hypot(plane.vel.x,plane.vel.z);
  if(!plane.onGround&&plane.assist&&!AP.master&&plane.gearPos>.8&&Va>40&&!faults.has('ELEV_JAM')){
    const a2=plane.pos.y-ghPreview-ACFG.gearHeight;
    if(a2<16&&a2>0&&plane.vel.y<0.3){
      const f=Math.min(1,(16-a2)/16),tgt=-(.35+a2*.2);
      plane.vel.y+=(tgt-plane.vel.y)*Math.min(1,(1.2+2.2*f)*dt)*(Math.abs(input.pitch)>.5?.3:1);
      if(Math.abs(input.pitch)<.4){_pitchTgt=.035+.045*f;plane.quat.toRotationMatrix(_nm);const fy=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,0,1),_nm).y;
        nudgeRot(new BABYLON.Vector3(1,0,0),Math.min(Math.abs(Math.asin(BABYLON.Scalar.Clamp(fy,-1,1))-_pitchTgt),.10*dt*(.5+f)),_pitchErr);}
      if(Math.abs(input.roll)<.5){const be=_bankErr();nudgeRot(new BABYLON.Vector3(0,0,1),Math.min(Math.abs(Math.asin(BABYLON.Scalar.Clamp(be,-1,1))),1.6*dt*(.5+f)),_bankErr);}
      if(Math.abs(input.yaw)<.1&&hsAir>20){const sl=BABYLON.Scalar.Clamp(beta,-.2,.2);plane.angVel.y+=-sl*1.2*dt*f;}
    }
  }
  const gh=sampleSurface(plane.pos.x,plane.pos.z);
  const gearReallyDown = plane.gearPos > 0.9;
  const gearHeight = gearReallyDown ? ACFG.gearHeight : 0.6;
  const clearance = plane.pos.y - gh - gearHeight;

  plane.quat.toRotationMatrix(tmpM);
  const fW2=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,0,1),tmpM);
  const rW2=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1,0,0),tmpM);
  const pitchDeg=Math.asin(BABYLON.Scalar.Clamp(fW2.y,-1,1))*180/Math.PI;
  const bankDeg=Math.atan2(rW2.y,Math.sqrt(Math.max(.001,1-rW2.y*rW2.y)))*180/Math.PI;

  const wasOnGround=plane.onGround;
  plane.onGround=false;
  plane.justTouched=false;

  // Use a slightly larger clearance band when we were already on ground to
  // prevent jitter from uneven terrain sampling (hysteresis).
  const gndThresh = wasOnGround ? 1.2 : 0.55;

  if(clearance<gndThresh&&(wasOnGround||plane.vel.y<=0.08||clearance<0)){
    plane.onGround=true;
    const sink=Math.max(0,-plane.vel.y);
    const pitchRate=Math.abs(plane.angVel.x);
    const rollRate=Math.abs(plane.angVel.z);
    const hs=Math.hypot(plane.vel.x,plane.vel.z);

    const noGear = !gearReallyDown;
    let isWaterContact=false;
    try{isWaterContact = !!waterMesh && Math.abs(gh-waterMesh.position.y)<0.01;}catch(e){}
    const hardNoGear = noGear && sink > 6.0 && !isWaterContact;
    const reallyHard = sink > 24.0;
    const inverted = Math.abs(bankDeg) > 90; // upside-down
    const badBank = Math.abs(bankDeg) > 55;  // wingtip digs in sooner
    const badPitch = pitchDeg < -30 || pitchDeg > 42;
    const tailStrike = pitchDeg > 14 && sink > 2.5 && hs > 30 && gearReallyDown; // nose too high on touchdown
    const badRates = rollRate > 5.0 || pitchRate > 5.5;
    // Gear collapse: too fast with gear down = structural failure
    const gearCollapse = gearReallyDown && !isWaterContact && hs > 95 && sink > 3.5;
    // Speed-induced gear collapse on hard side-load (crosswind slam)
    const sideSlamCollapse = gearReallyDown && !isWaterContact && Math.abs(bankDeg) > 20 && hs > 70 && sink > 4;

    if(reallyHard || hardNoGear || inverted || badBank || badPitch || tailStrike || badRates || gearCollapse || sideSlamCollapse){
      let reason='IMPACT';
      if(inverted) reason='INVERTED TOUCHDOWN · '+Math.round(Math.abs(bankDeg))+'° bank';
      else if(reallyHard) reason=(isWaterContact?'HARD WATER IMPACT · ':'STRUCTURAL FAILURE · ')+Math.round(sink*196.85)+' fpm';
      else if(gearCollapse||sideSlamCollapse) reason='GEAR COLLAPSE · '+Math.round(hs*1.944)+' kt · '+Math.round(sink*196.85)+' fpm';
      else if(hardNoGear) reason='BELLY IMPACT · '+Math.round(sink*196.85)+' fpm · NO GEAR';
      else if(badBank) reason='WING STRIKE · '+Math.round(Math.abs(bankDeg))+'° bank';
      else if(tailStrike) reason='TAIL STRIKE · '+Math.round(pitchDeg)+'° nose-up';
      else if(badPitch) reason='NOSE STRIKE · '+Math.round(pitchDeg)+'°';
      else reason='LOSS OF CONTROL ON GROUND';
      crash(reason,isWaterContact);
      return;
    }

    if(!wasOnGround){
      plane.justTouched=true;
      const fpm=Math.round(sink*196.85);

      // Auto-spoilers: deploy immediately on touchdown (like real 737 armed spoilers)
      if(!noGear && !isWaterContact && plane.spoilerDeploy<0.5){
        plane.spoilerDeploy=1.0;plane.spoilerVisual=Math.max(plane.spoilerVisual,0.3);
        showMsg('AUTO SPOILERS · DEPLOYED',1400);updateChips();
      }

      if(isWaterContact){
        try{waterSplash(Math.min(1,.3+hs/60));}catch(e){}
        showMsg('🌊 DITCHING · '+fpm+' fpm',2600);
      } else if(noGear){
        if(fpm<1180){
          showMsg('⚠ BELLY LANDING · '+fpm+' fpm · SCRAPING',2500);
          // Trigger belly fire if fast enough to ignite fuel
          if(hs>18){try{window._startBellyFire&&window._startBellyFire(plane.pos);}catch(e){}}
        }
      } else {
        if(fpm<220){let off='';if(runwayLenM>0){const h2=runwayHdgDeg*Math.PI/180;off=' · '+Math.round(Math.abs(plane.pos.x*Math.cos(h2)+plane.pos.z*Math.sin(h2)))+' m off CL';}
          showMsg((fpm<110?'🧈 GREASER · ':'SMOOTH TOUCHDOWN · ')+fpm+' fpm'+off,2600);}
        else if(fpm<550) showMsg('TOUCHDOWN · '+fpm+' fpm',1800);
        else showMsg('FIRM LANDING · '+fpm+' fpm',1800);
      }
      plane._tdSink=sink;
      plane.gearCompress = Math.min(1.2, sink / 4);
      plane.gearSpringVel = sink * 0.9;

      // Bounce physics: only bounce if sink rate is high enough to actually bounce.
      // Minimum hop removed — a grease doesn't bounce. Energy coefficient tuned down.
      const spo=plane.spoilerVisual>0.5;
      if(!noGear && !isWaterContact && sink > 1.8 && sink < 14){
        const lastTD=Date.now()-(plane._lastTD||0);
        const rebound=lastTD<5500;
        plane._bounces=(plane._bounces||0)+(rebound?1:0);
        const bounceN=plane._bounces;
        const isFirstBounce=!rebound;
        // Lower energy coefficient: 0.45+sink*0.015 (was 0.8+0.025), spoilers kill 70%
        let e = isFirstBounce ? Math.min(0.65, 0.45 + sink*0.015) : Math.max(0.08, 0.28 - (bounceN-1)*0.10);
        e *= (spo ? 0.28 : 1); // spoilers nearly eliminate bounce
        const hop = sink * e; // NO minimum hop – gentle landings don't bounce at all
        if(hop > 0.4){
          plane.vel.y = hop;
          const bounceAmp = isFirstBounce ? 0.8 : Math.max(0.2, 0.7 - (bounceN-2)*0.25);
          plane.angVel.x += (pitchDeg>1.5?1:-1.4)*Math.min(.4, Math.max(0,sink-.2)*.10)*bounceAmp;
          plane.angVel.z += BABYLON.Scalar.Clamp(-bankDeg*.04,-.45,.45)*Math.min(1.0,sink/2.2)*bounceAmp + (Math.random()-.5)*Math.min(.3,sink*.05)*bounceAmp;
          if(bounceN>1&&hop>1.0){
            const bounceMsg=bounceN===2?'🏀 BOUNCE ×'+bounceN+' · '+fpm+' fpm':(bounceN>3?'🏀 BOUNCE ×'+bounceN+' (STILL BOUNCING)':'🏀 BOUNCE ×'+bounceN);
            setTimeout(()=>showMsg(bounceMsg,1200),10);
          }
        } else { plane.vel.y = 0; plane.angVel.z*=0.5; plane._bounces=0; }
      } else { plane.vel.y = 0; plane.angVel.z=0; plane._bounces=0; }
      plane._lastTD=Date.now();
      try{camState.shake=Math.max(camState.shake,Math.min(1.6,.15+sink*.28));}catch(e){}
      try{window._onTouchdown&&window._onTouchdown(sink,hs,noGear,isWaterContact);}catch(e){}
    }

    plane.bellyLanding = noGear && hs > 3;
    plane.inWater = isWaterContact;

    const springK = 75;
    const damping = 6.5;
    const suspAccel = -springK * plane.gearCompress - damping * plane.gearSpringVel;
    plane.gearSpringVel += suspAccel * dt;
    plane.gearCompress += plane.gearSpringVel * dt;
    plane.gearCompress = Math.max(-0.25, Math.min(1.4, plane.gearCompress));
    // Reduce runway roughness jitter (was hs>15, now only kicks in above 40 kts)
    if(hs>20&&!noGear&&!isWaterContact)plane.gearSpringVel+=(Math.random()-.5)*Math.min(0.6,hs/100)*dt*(gh>2?2:5);

    // Firmly plant plane on ground once it's stable (clearance well inside threshold)
    if(plane.vel.y > 0.3 && clearance > 0.3) plane.onGround = false;

    if(plane.onGround){
      plane.pos.y = gh + gearHeight;
      if(plane.vel.y < 0) plane.vel.y = 0;

      if(hs>0.1){
        const lat=plane.vel.x*rW2.x+plane.vel.z*rW2.z;
        const grip=Math.min(1,15*dt);
        plane.vel.x-=rW2.x*lat*grip;
        plane.vel.z-=rW2.z*lat*grip;
      }

      const spoilerActive=plane.spoilerVisual>0.3;
      if(hs>0.02){
        let decel=0.55;
        if(plane.brakeHold) decel+=4.2; else if(plane._ab&&!faults.has('BRAKE_FAIL')&&hs>8) decel+=2.6;
        // Spoilers on ground: much more effective (lift dump = more weight on wheels = better braking)
        if(spoilerActive) decel+=3.2+plane.spoilerVisual*1.8;
        if(plane.reverserOn) decel+=1.2;
        if(noGear) decel+=3.5;
        if(isWaterContact) decel+=14;
        const k2=Math.max(0,1-decel*dt/hs);
        plane.vel.x*=k2;plane.vel.z*=k2;
      } else {
        plane.vel.x*=0.85;plane.vel.z*=0.85;
        if(Math.abs(plane.vel.x)<0.04)plane.vel.x=0;
        if(Math.abs(plane.vel.z)<0.04)plane.vel.z=0;
      }

      if(hs>0.5){
        const authority=Math.min(1,hs/45);
        plane.angVel.y=effRud*0.8*authority;
      } else {
        plane.angVel.y*=Math.max(0,1-6*dt);
      }

      const pitchRad=pitchDeg*Math.PI/180;
      const bankRad=bankDeg*Math.PI/180;
      // Ground pitch: nose settles more firmly on runway after touchdown
      if(hs<70 && Math.abs(input.pitch)<0.05){
        const pitchSettle = hs>30 ? 3.8 : 2.6; // nosewheel touches down as speed drops
        plane.angVel.x+=(-pitchRad*pitchSettle - plane.angVel.x*4.5)*dt;
      }
      // Ground roll: strong damping — wheels resist roll
      plane.angVel.z=Math.abs(input.roll)>.4?plane.angVel.z*.2:0;
      nudgeRot(new BABYLON.Vector3(0,0,1),Math.abs(bankRad)*Math.min(1,55*dt),_bankErr);

      // Strong angular damping on the ground (like real undercarriage friction)
      const damp=Math.max(0,1-9*dt);
      plane.angVel.x*=damp;plane.angVel.z*=damp;

      if(plane.reverserOn && hs<2.0){
        plane.reverserOn=false;showMsg('REVERSERS STOWED');updateChips();
      }
    }
  } else {
    plane.bellyLanding=false;
    plane.inWater=false;
    if(plane.reverserOn){plane.reverserOn=false;updateChips();}
    const springK = 50;
    const damping = 5;
    const suspAccel = -springK * plane.gearCompress - damping * plane.gearSpringVel;
    plane.gearSpringVel += suspAccel * dt;
    plane.gearCompress += plane.gearSpringVel * dt;
    plane.gearCompress = Math.max(-0.15, Math.min(1.4, plane.gearCompress));
  }

  const dq=BABYLON.Quaternion.RotationYawPitchRoll(-plane.angVel.y*dt,plane.angVel.x*dt,-plane.angVel.z*dt);
  plane.quat.multiplyInPlace(dq);plane.quat.normalize();

  // Only trigger over-G crash when airborne and not in takeoff rotation phase
  if(plane.gForce>6.5 && !plane.onGround && plane.pos.y-(typeof ghPreview!=='undefined'?ghPreview:0)>15){crash('OVER-G · '+plane.gForce.toFixed(1)+'g');return;}

  // Stall close to ground = CFIT / controlled flight into terrain
  if(plane.stall && !plane.onGround){
    const agl=(plane.pos.y-(typeof ghPreview!=='undefined'?ghPreview:0));
    if(agl<18 && plane.vel.y < -2.5){
      crash('STALL LOW ALTITUDE · CFIT');return;
    }
  }

  // Slow / no-flap stall on approach crash (drop below 50 ft with critical AOA)
  if(!plane.onGround && !plane.crashed){
    const agl=(plane.pos.y-(typeof ghPreview!=='undefined'?ghPreview:0));
    const Va=Math.hypot(plane.vel.x,plane.vel.y,plane.vel.z)*1.944;
    if(agl<15 && Va < 90 && plane.vel.y < -6){
      crash('HARD IMPACT · '+Math.round(-plane.vel.y*196.85)+' fpm · LOW ENERGY');return;
    }
  }

  aircraftRoot.position.copyFrom(plane.pos);
  aircraftRoot.rotationQuaternion=plane.quat;
  updateSurfaceVisuals(dt);

  const fanRate=(ENG.L.n1+ENG.R.n1)*.0003;
  for(const fb of fanBlades)fb.mesh.rotation.y+=dt*fanRate*40;

  const t=performance.now()*.001;
  const bl=(Math.sin(t*6)>.6)?.9:.05;
  M.red.emissiveColor=new BABYLON.Color3(.9*bl+.05,.08*bl,.05*bl);
  const st=t%2;
  const strobeOn=window._strobeOn!==false&&((st<.05)||(st>.15&&st<.2));
  M.white.emissiveColor=new BABYLON.Color3(strobeOn?1:0,strobeOn?1:0,strobeOn?1:0);
  navL.setEnabled(window._navOn!==false);navR.setEnabled(window._navOn!==false);

  if(currentWeather===WEATHER.storm){
    if(Math.random() < dt*0.35){
      wxFlash.style.opacity='0.55';
      setTimeout(()=>{wxFlash.style.opacity='0';},90);
    }
  }
}

function crash(reason,isWater,opts){
  if(plane.crashed)return;
  plane.crashed=true;
  // Big camera shake — scale with impact speed
  const impactSpeed=Math.hypot(plane.vel.x,plane.vel.y,plane.vel.z);
  camState.shake=Math.min(4.0, 1.8 + impactSpeed*0.04);
  plane._crashAt=performance.now();
  document.getElementById('crashReason').textContent=reason;
  // Set crash title based on type
  try{
    const ct=document.getElementById('crashTitle');
    if(ct){
      if(reason.indexOf('INVERTED')>=0)ct.textContent='☠ INVERTED';
      else if(reason.indexOf('STALL')>=0||reason.indexOf('CFIT')>=0)ct.textContent='⚠ STALL / CFIT';
      else if(reason.indexOf('FIRE')>=0||reason.indexOf('ENG')>=0)ct.textContent='🔥 ENGINE FAILURE';
      else if(reason.indexOf('WATER')>=0||reason.indexOf('DITCH')>=0)ct.textContent='🌊 DITCHING';
      else if(reason.indexOf('GEAR COLLAPSE')>=0)ct.textContent='💥 GEAR COLLAPSE';
      else if(reason.indexOf('WING')>=0)ct.textContent='✈ WING STRIKE';
      else if(reason.indexOf('OVER-G')>=0)ct.textContent='⚡ STRUCTURAL FAILURE';
      else ct.textContent='💥 CRASHED';
    }
  }catch(e){}
  // Pass crash type context to effects
  const crashOpts=Object.assign({
    inverted:reason.indexOf('INVERTED')>=0,
    gearCollapse:reason.indexOf('GEAR COLLAPSE')>=0,
    stall:reason.indexOf('STALL')>=0||reason.indexOf('CFIT')>=0
  },opts||{});
  try{
    window._recPush&&window._recPush();
    // Bookmark the crash time for replay scrubber
    if(typeof rec!=='undefined')window._crashRecTime=rec.clock;
    window._crashFx&&window._crashFx(plane.pos,plane.vel,crashOpts);
  }catch(e){}
  setTimeout(()=>{if(plane.crashed&&!(window._replayOn&&window._replayOn()))document.getElementById('crashOverlay').classList.add('show');},2600);
  if(isWater){try{waterSplash(1);}catch(e){}}
}
function _respawnBase(){try{clearTraffic();}catch(e){}
  try{window._crashReset&&window._crashReset();}catch(e){}
  document.getElementById('crashOverlay').classList.remove('show');
  const loc=currentLocation;
  createRunway(loc.code);
  resetAircraft(loc.lat,loc.lon,loc.elev);
  terrainCenter={x:0,z:0};rebuildTerrainAsync(0,0);
}

const camState={
  pos:new BABYLON.Vector3(0,950,80),quat:BABYLON.Quaternion.Identity(),
  orbitAngle:0,towerPos:null,flybyVantage:null,flybyTimer:0,cinemaTimer:6,
  transitionTimer:0,transitionDur:.7,fromPos:new BABYLON.Vector3(),fromQuat:BABYLON.Quaternion.Identity(),
  shake:0,headYaw:0,headPitch:0,targetHeadYaw:0,targetHeadPitch:0,
  rightMouseDown:false,rmx:0,rmy:0,initialized:false
};
const _cv1=new BABYLON.Vector3(),_cv2=new BABYLON.Vector3(),_cv3=new BABYLON.Vector3();
const _cq1=BABYLON.Quaternion.Identity(),_cm=BABYLON.Matrix.Identity();

function quatFromLookAt(pos,target,worldUp){
  _cv1.set(target.x-pos.x,target.y-pos.y,target.z-pos.z);
  const L2=_cv1.x*_cv1.x+_cv1.y*_cv1.y+_cv1.z*_cv1.z;
  if(L2<1e-6)return BABYLON.Quaternion.Identity();
  const L=1/Math.sqrt(L2);_cv1.x*=L;_cv1.y*=L;_cv1.z*=L;
  _cv2.x=worldUp.y*_cv1.z-worldUp.z*_cv1.y;
  _cv2.y=worldUp.z*_cv1.x-worldUp.x*_cv1.z;
  _cv2.z=worldUp.x*_cv1.y-worldUp.y*_cv1.x;
  const R=1/Math.sqrt(Math.max(1e-12,_cv2.x*_cv2.x+_cv2.y*_cv2.y+_cv2.z*_cv2.z));
  _cv2.x*=R;_cv2.y*=R;_cv2.z*=R;
  _cv3.x=_cv1.y*_cv2.z-_cv1.z*_cv2.y;
  _cv3.y=_cv1.z*_cv2.x-_cv1.x*_cv2.z;
  _cv3.z=_cv1.x*_cv2.y-_cv1.y*_cv2.x;
  _cm.setRowFromFloats(0,_cv2.x,_cv2.y,_cv2.z,0);
  _cm.setRowFromFloats(1,_cv3.x,_cv3.y,_cv3.z,0);
  _cm.setRowFromFloats(2,_cv1.x,_cv1.y,_cv1.z,0);
  _cm.setRowFromFloats(3,0,0,0,1);
  return BABYLON.Quaternion.FromRotationMatrix(_cm);
}
function slerpShort(a,b,t){
  const dot=a.x*b.x+a.y*b.y+a.z*b.z+a.w*b.w;
  if(dot<0)_cq1.set(-b.x,-b.y,-b.z,-b.w);else _cq1.copyFrom(b);
  return BABYLON.Quaternion.Slerp(a,_cq1,t);
}
function easeInOutCubic(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;}
function startCamTransition(){
  camState.fromPos.copyFrom(camera.position);
  camState.fromQuat.copyFrom(camState.baseQ||camera.rotationQuaternion||BABYLON.Quaternion.Identity());
  camState.transitionTimer=camState.transitionDur;
}

canvas.addEventListener('contextmenu',e=>e.preventDefault());
canvas.addEventListener('mousedown',e=>{
  if(e.button===2){camState.rightMouseDown=true;camState.rmx=e.clientX;camState.rmy=e.clientY;}
});
window.addEventListener('mouseup',e=>{if(e.button===2)camState.rightMouseDown=false;});
window.addEventListener('mousemove',e=>{
  if(!camState.rightMouseDown)return;
  const dx=e.clientX-camState.rmx,dy=e.clientY-camState.rmy;
  camState.rmx=e.clientX;camState.rmy=e.clientY;
  camState.targetHeadYaw=BABYLON.Scalar.Clamp(camState.targetHeadYaw-dx*.0035,-1.6,1.6);
  camState.targetHeadPitch=BABYLON.Scalar.Clamp(camState.targetHeadPitch+dy*.0035*(mouseInvert?-1:1),-1.2,1.2);
});

const _camTarget={pos:new BABYLON.Vector3(),quat:BABYLON.Quaternion.Identity(),fov:.78,lerpRate:12};
function computeCamTarget(dt,out){
  plane.quat.toRotationMatrix(_cm);
  const fwd=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,0,1),_cm);
  const up=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,1,0),_cm);
  const wUp=BABYLON.Vector3.Up();
  const speed=plane.speed;
  switch(camMode){
    case 0:{
      const dist=48+BABYLON.Scalar.Clamp(speed*.05,0,22);
      const height=15+BABYLON.Scalar.Clamp(speed*.012,0,5);
      out.pos.copyFrom(plane.pos).subtractInPlace(fwd.scale(dist)).addInPlace(up.scale(height))
        .addInPlace(_cv2.set(0,4,0)).addInPlace(plane.vel.scale(.12));
      const look=_cv3.copyFrom(plane.pos).addInPlace(fwd.scale(28)).addInPlace(plane.vel.scale(.3));
      out.quat=quatFromLookAt(out.pos,look,wUp);
      out.fov=.72;out.lerpRate=9;break;
    }
    case 1:{
      const _e=window._ckEye||[-.6,.30,14.0];const eyeOff=new BABYLON.Vector3(_e[0],_e[1],_e[2]);
      out.pos.copyFrom(plane.pos).addInPlace(BABYLON.Vector3.TransformNormal(eyeOff,_cm));
      const headLerp=1-Math.exp(-9*dt);
      camState.headYaw+=(camState.targetHeadYaw-camState.headYaw)*headLerp;
      camState.headPitch+=(camState.targetHeadPitch-camState.headPitch)*headLerp;
      if(!camState.rightMouseDown){const d=Math.exp(-1.5*dt);camState.targetHeadYaw*=d;camState.targetHeadPitch*=d;}
      _cq1.copyFrom(plane.quat);
      const hq=BABYLON.Quaternion.RotationYawPitchRoll(-camState.headYaw,camState.headPitch,0);
      out.quat=_cq1.multiply(hq);out.fov=1.15;out.lerpRate=25;break;
    }
    case 2:{
      camState.orbitAngle+=dt*.35;
      const heading=Math.atan2(fwd.x,fwd.z);
      const baseAngle=heading+camState.orbitAngle;
      const radius=65;
      out.pos.set(plane.pos.x+Math.sin(baseAngle)*radius,plane.pos.y+22,plane.pos.z+Math.cos(baseAngle)*radius);
      out.quat=quatFromLookAt(out.pos,plane.pos,wUp);out.fov=.72;out.lerpRate=6;break;
    }
    case 3:{
      if(!camState.towerPos||camState.towerPos.y<-1000||plane.crashed){
        const vd=plane.vel.lengthSquared()>1?plane.vel.normalizeToNew():fwd;
        const side=BABYLON.Vector3.Cross(vd,wUp).normalize();
        const t=plane.pos.add(vd.scale(340)).add(side.scale((Math.random()-.5)*280));
        t.y=sampleSurface(t.x,t.z)+12;camState.towerPos=t;
      }
      out.pos.copyFrom(camState.towerPos);
      out.quat=quatFromLookAt(out.pos,plane.pos,wUp);
      const d=BABYLON.Vector3.Distance(camState.towerPos,plane.pos);
      out.fov=BABYLON.Scalar.Clamp(900/Math.max(d,80),.09,.95);out.lerpRate=14;break;
    }
    case 4:{
      camState.flybyTimer-=dt;
      const needNew=!camState.flybyVantage||camState.flybyTimer<=0;
      const tooFar=camState.flybyVantage&&BABYLON.Vector3.Distance(camState.flybyVantage,plane.pos)>1400;
      if(needNew||tooFar){
        const vd=plane.vel.lengthSquared()>1?plane.vel.normalizeToNew():fwd;
        const side=BABYLON.Vector3.Cross(vd,wUp).normalize();
        const t=plane.pos.add(vd.scale(440+Math.random()*380))
          .add(side.scale((Math.random()<.5?-1:1)*(140+Math.random()*220)));
        t.y=Math.max(sampleSurface(t.x,t.z)+10,plane.pos.y+30+Math.random()*90);
        camState.flybyVantage=t;camState.flybyTimer=3+Math.random()*2;
      }
      out.pos.copyFrom(camState.flybyVantage);
      out.quat=quatFromLookAt(out.pos,plane.pos,wUp);
      const dd=BABYLON.Vector3.Distance(out.pos,plane.pos);
      out.fov=BABYLON.Scalar.Clamp(780/Math.max(dd,60),.14,.85);out.lerpRate=22;break;
    }
    case 5:{
      const wingOff=new BABYLON.Vector3(-16.5,2,-2.5);
      out.pos.copyFrom(plane.pos).addInPlace(BABYLON.Vector3.TransformNormal(wingOff,_cm));
      const look=plane.pos.clone().addInPlace(fwd.scale(20));
      out.quat=quatFromLookAt(out.pos,look,up);out.fov=1.0;out.lerpRate=32;break;
    }
    case 6:{
      camState.cinemaTimer-=dt;
      if(camState.cinemaTimer<=0){
        const pool=[0,2,3,4,5];camMode=pool[Math.floor(Math.random()*pool.length)];
        camState.cinemaTimer=6+Math.random()*4;startCamTransition();
        return computeCamTarget(dt,out);
      }
      camState.cinemaTimer=camState.cinemaTimer||6;
      {const prevMode=camMode;camMode=4;try{computeCamTarget(dt,out);}finally{camMode=prevMode;}}break;
    }
  }
}
let lookYaw=0,lookPitch=0,_drag=null;
canvas.addEventListener('pointerdown',e=>{_drag={x:e.clientX,y:e.clientY};try{canvas.setPointerCapture(e.pointerId);}catch(_){}});
canvas.addEventListener('pointermove',e=>{if(!_drag)return;lookYaw-=(e.clientX-_drag.x)*.005;lookPitch-=(e.clientY-_drag.y)*.005;
  lookYaw=((lookYaw+Math.PI)%(2*Math.PI)+2*Math.PI)%(2*Math.PI)-Math.PI;lookPitch=Math.max(-1.3,Math.min(1.3,lookPitch));_drag={x:e.clientX,y:e.clientY};});
['pointerup','pointercancel'].forEach(t=>canvas.addEventListener(t,()=>{_drag=null;}));
canvas.addEventListener('dblclick',()=>{lookYaw=0;lookPitch=0;});
/* Camera zoom: scroll to narrow/widen FOV in any view (cockpit included). Kept as a
   multiplier on top of whatever FOV the active camera mode wants, so it never fights
   the per-mode cinematic lerping above/below — _fovBase always holds the *unzoomed*
   value so the zoom never compounds frame over frame. */
let camZoom=1,_fovBase=camera.fov,_zoomMsgT=0;
const _zoomMsg=()=>{const now=performance.now();if(now-_zoomMsgT<120)return;_zoomMsgT=now;try{showMsg('ZOOM · '+(1/camZoom).toFixed(1)+'×',700);}catch(e){}};
canvas.addEventListener('wheel',e=>{
  if(e.target&&/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
  e.preventDefault();
  camZoom=BABYLON.Scalar.Clamp(camZoom*(e.deltaY>0?1.12:1/1.12),.28,3.2);_zoomMsg();
},{passive:false});
window.addEventListener('keydown',e=>{
  if(/INPUT|SELECT|TEXTAREA/.test((e.target||{}).tagName||''))return;
  if(e.code==='Equal'||e.code==='NumpadAdd'){camZoom=BABYLON.Scalar.Clamp(camZoom/1.15,.28,3.2);_zoomMsg();}
  else if(e.code==='Minus'||e.code==='NumpadSubtract'){camZoom=BABYLON.Scalar.Clamp(camZoom*1.15,.28,3.2);_zoomMsg();}
});
function updateCamera(dt){
  camera.fov=_fovBase; // restore the pre-zoom base before this frame's mode logic touches camera.fov
  if(!camState.initialized){
    camera.position.set(plane.pos.x,plane.pos.y+6,plane.pos.z+44);
    camera.rotationQuaternion=BABYLON.Quaternion.Identity();camState.initialized=true;
  }
  // During replay, use the replay camera system instead
  if(typeof rp!=='undefined'&&rp.on){
    try{
      const rc=computeReplayCam(dt,plane.pos,plane.quat,plane.vel);
      const gH=sampleSurface(rc.pos.x,rc.pos.z);
      if(rc.pos.y<gH+3)rc.pos.y=gH+3;
      const k=1-Math.exp(-rc.lerpRate*dt);
      BABYLON.Vector3.LerpToRef(camera.position,rc.pos,k,camera.position);
      camState.baseQ=slerpShort(camState.baseQ||camera.rotationQuaternion,rc.quat,k);
      camera.fov=BABYLON.Scalar.Lerp(camera.fov,rc.fov,k);
      camera.rotationQuaternion=(camState.baseQ||camera.rotationQuaternion).clone();
      if(skybox)skybox.position.copyFrom(camera.position);
    }catch(e){}
    _fovBase=camera.fov;camera.fov=BABYLON.Scalar.Clamp(_fovBase*camZoom,.08,2.5);
    return;
  }
  computeCamTarget(dt,_camTarget);
  if(camMode!==1){
    const gH=sampleSurface(_camTarget.pos.x,_camTarget.pos.z);
    if(_camTarget.pos.y<gH+5)_camTarget.pos.y=gH+5;
  } else {
    const gH=sampleSurface(_camTarget.pos.x,_camTarget.pos.z);
    if(_camTarget.pos.y<gH+1.2)_camTarget.pos.y=gH+1.2;
  }
  const k=1-Math.exp(-_camTarget.lerpRate*dt);
  if(camState.transitionTimer>0){
    camState.transitionTimer-=dt;
    const raw=1-Math.max(0,camState.transitionTimer)/camState.transitionDur;
    const t=easeInOutCubic(BABYLON.Scalar.Clamp(raw,0,1));
    BABYLON.Vector3.LerpToRef(camState.fromPos,_camTarget.pos,t,camera.position);
    camState.baseQ=slerpShort(camState.fromQuat,_camTarget.quat,t);
    camera.fov=BABYLON.Scalar.Lerp(camera.fov,_camTarget.fov,t);
  }else{
    if(camMode===0)camera.position.copyFrom(_camTarget.pos);else BABYLON.Vector3.LerpToRef(camera.position,_camTarget.pos,k,camera.position);
    camState.baseQ=slerpShort(camState.baseQ||camera.rotationQuaternion,_camTarget.quat,camMode===0?1-Math.exp(-4*dt):k);
    camera.fov=BABYLON.Scalar.Lerp(camera.fov,_camTarget.fov,k);
  }
  if(camMode===1&&camState.transitionTimer<=0){camera.position.copyFrom(_camTarget.pos);camState.baseQ=_camTarget.quat.clone();camera.fov=_camTarget.fov;}
  camera.rotationQuaternion=(camState.baseQ||camera.rotationQuaternion).clone();
  if(lookYaw||lookPitch){camera.rotationQuaternion=camera.rotationQuaternion.multiply(BABYLON.Quaternion.RotationYawPitchRoll(lookYaw,lookPitch,0));}
  const gDev=Math.abs(plane.gForce-1);
  const speedTurb=BABYLON.Scalar.Clamp((plane.speed-250)/250,0,.3);
  const wxTurb=currentWeather.turb*0.35;
  const targetShake=(camMode===1)?(gDev*.12+speedTurb*.15+wxTurb)*.5:0;
  camState.shake=Math.max(camState.shake,targetShake);
  camState.shake*=Math.exp(-3*dt);
  if(camState.shake>.0015){
    const t=performance.now()*.001,s=camState.shake;
    const sq=BABYLON.Quaternion.RotationYawPitchRoll(
      (Math.sin(t*37.3)+Math.sin(t*23.7))*.0004*s,
      (Math.sin(t*41.1)+Math.sin(t*19.3))*.0004*s,
      (Math.sin(t*33.7)+Math.sin(t*29.1))*.0006*s);
    camera.rotationQuaternion=camera.rotationQuaternion.multiply(sq);
  }
  if(skybox)skybox.position.copyFrom(camera.position);
  _fovBase=camera.fov;camera.fov=BABYLON.Scalar.Clamp(_fovBase*camZoom,.08,2.5);
}

/* ===== HUD + SENSORS ===== */
const el={
  spd:document.getElementById('spdVal'),mach:document.getElementById('machVal'),
  spdState:document.getElementById('spdState'),spdBar:document.getElementById('spdBar'),spdMark:document.getElementById('spdMark'),
  alt:document.getElementById('altVal'),altState:document.getElementById('altState'),altBar:document.getElementById('altBar'),
  vs:document.getElementById('vsVal'),g:document.getElementById('gVal'),vsState:document.getElementById('vsState'),
  hdg:document.getElementById('hdgTxt'),
  pos:document.getElementById('posTxt'),fps:document.getElementById('fpsTxt'),
  src:document.getElementById('srcTxt'),msg:document.getElementById('msgBox'),
  chipFlaps:document.getElementById('chipFlaps'),chipGear:document.getElementById('chipGear'),
  chipSpoiler:document.getElementById('chipSpoiler'),chipRev:document.getElementById('chipRev'),
  chipBrake:document.getElementById('chipBrake'),chipWx:document.getElementById('chipWx'),
  chipCam:document.getElementById('chipCam'),chipEng:document.getElementById('chipEng'),
  apTxt:document.getElementById('apTxt'),engTxt:document.getElementById('engTxt'),
  aoaTxt:document.getElementById('aoaTxt'),wxTxt:document.getElementById('wxTxt'),
  stallWarn:document.getElementById('stallWarn'),windWarn:document.getElementById('windWarn')
};
const wxFlash=document.getElementById('wxFlash');
const attCtx=document.getElementById('attitudeCanvas').getContext('2d');
const cmpCtx=document.getElementById('compassCanvas').getContext('2d');
let DV={spd:0,alt:0,vs:0,agl:0,aoa:0,fuel:0,hdg:0,pitch:0,bank:0,flags:{}};
const ANALOG_SET=new Set(['dc3','dc8','dc9','dc10','l1011','concorde','b727']);
const SENS={t0:{},kias0:0,altM0:0,alt0:0,fuel0:0};
function sensorLatch(name){
  const now=performance.now()*.001;SENS.t0[name]=now;if(name==='COLLISION')try{spawnIntruder();}catch(e){}
  if(name==='PITOT_BLOCK'){SENS.kias0=smoothedSpd;SENS.altM0=plane.pos.y;}
  if(name==='STATIC_BLOCK'){SENS.alt0=smoothedAlt;}
  if(name==='FUEL_QTY'){SENS.fuel0=plane.fuel;}
  if(['PITOT_BLOCK','STATIC_BLOCK','ATT_FAIL','ADC_FAULT'].includes(name)&&AP.master){
    AP.master=false;AP.athr=false;showMsg('AUTOPILOT DISCONNECT · SENSOR FAIL',3500);
  }
}
function applySensors(r){
  const t=performance.now()*.001,d=Object.assign({},r),F={};d.flags=F;
  if(faults.has('PITOT_BLOCK')){d.spd=Math.max(0,SENS.kias0+(plane.pos.y-SENS.altM0)*0.02);F.spd=1;}
  if(faults.has('ADC_FAULT'))F.spd=1;
  if(faults.has('STATIC_BLOCK')){d.alt=SENS.alt0;d.vs=0;F.alt=1;F.vs=1;}
  if(faults.has('ATT_FAIL')){
    const k=Math.min(1,(t-(SENS.t0.ATT_FAIL||t))/15);
    d.pitch=r.pitch+k*(22*Math.sin(t*.21)+8);
    d.bank=r.bank+k*(38*Math.sin(t*.13+1));F.att=1;
  }
  if(faults.has('HDG_FAIL')){
    const e=(t-(SENS.t0.HDG_FAIL||t))*2;
    d.hdg=(((r.hdg+e)%360)+360)%360;F.hdg=1;
  }
  if(faults.has('AOA_FAIL')){d.aoa=24+3*Math.sin(t*2.3);F.aoa=1;}
  if(faults.has('FUEL_QTY')){d.fuel=SENS.fuel0;F.fuel=1;}
  if(faults.has('RADALT_FAIL')){d.agl=null;F.agl=1;}
  if(faults.has('ENG_SENSOR'))F.eng=1;
  return d;
}
function blankScr(d){
  const c=d.getContext(),cv=c.canvas;c.fillStyle='#000';c.fillRect(0,0,cv.width,cv.height);
  c.fillStyle='#a33';c.font='bold '+Math.round(cv.height*.06)+'px monospace';c.textAlign='center';
  c.fillText('NO POWER',cv.width/2,cv.height/2);
}
let lastVS=0,hudTick=0,msgTimer=0;
let smoothedSpd=0, smoothedAlt=0, smoothedVS=0, smoothedAGL=0;
function showMsg(t,ms=2000){el.msg.textContent=t;el.msg.style.opacity=1;msgTimer=ms/1000;}
function updateChips(){
  el.chipFlaps.textContent='FLAPS '+FLAPS[plane.flaps].name;
  el.chipFlaps.classList.toggle('on',plane.flaps>0);
  const gearState = faults.has('GEAR_FAULT')&&plane.gearPos>0.1&&plane.gearPos<0.9
    ? 'STUCK '+Math.round(plane.gearPos*100)+'%'
    : (plane.gearPos>0.9?'DOWN':(plane.gearPos<0.1?'UP':'TRANSIT'));
  el.chipGear.textContent='GEAR '+gearState;
  el.chipGear.classList.toggle('on',plane.gearPos>0.9);
  el.chipGear.classList.toggle('warn',plane.gearPos>0.1&&plane.gearPos<0.9);
  el.chipSpoiler.textContent='SPLR '+(plane.spoilerDeploy>.5?'ON':'OFF');
  el.chipSpoiler.classList.toggle('warn',plane.spoilerDeploy>.5);
  el.chipRev.textContent='REV '+(plane.reverserOn?'ON':'OFF');
  el.chipRev.classList.toggle('rev',plane.reverserOn);
  el.chipBrake.textContent='BRK '+(plane.brakeHold?'ON':'OFF');
  el.chipBrake.classList.toggle('warn',plane.brakeHold);
  el.chipCam.textContent=CAM_NAMES[camMode];
  el.chipWx.textContent='WX '+currentWeather.name;
  el.chipWx.classList.toggle('wx',currentWeather!==WEATHER.clear);
  const running=(ENG.L.state==='RUNNING'&&ENG.R.state==='RUNNING');
  el.chipEng.textContent=ENG.starting?'STARTING…':(running?'ENG RUN':'ENG OFF');
  el.chipEng.classList.toggle('on',running);
  el.chipEng.classList.toggle('warn',ENG.starting);
}
function drawAttitudeIndicator(ctx){
  const W=ctx.canvas.width,H=ctx.canvas.height;
  const R=Math.min(W,H)/2;
  const m=BABYLON.Matrix.Identity();plane.quat.toRotationMatrix(m);
  const fwd=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,0,1),m);
  const right=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1,0,0),m);
  const pitchDeg=DV.pitch;
  const bankDeg=DV.bank;
  const pxPerDeg=R/40;
  ctx.clearRect(0,0,W,H);
  ctx.save();ctx.beginPath();ctx.arc(R,R,R-2,0,Math.PI*2);ctx.clip();
  ctx.save();ctx.translate(R,R);ctx.rotate(-bankDeg*Math.PI/180);ctx.translate(0,pitchDeg*pxPerDeg);
  ctx.fillStyle='#2e6fc4';ctx.fillRect(-W*2,-H*2,W*4,H*2);
  ctx.fillStyle='#6b4a2b';ctx.fillRect(-W*2,0,W*4,H*2);
  ctx.strokeStyle='#ffffff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-W*2,0);ctx.lineTo(W*2,0);ctx.stroke();
  ctx.fillStyle='#fff';ctx.font='10px monospace';ctx.textAlign='center';
  ctx.strokeStyle='#fff';ctx.lineWidth=1.5;
  for(let d=-30;d<=30;d+=5){if(d===0)continue;const y=-d*pxPerDeg;if(Math.abs(y)>R*1.1)continue;
    const long=d%10===0;const w=long?R*0.35:R*0.2;
    ctx.beginPath();ctx.moveTo(-w,y);ctx.lineTo(w,y);ctx.stroke();
    if(long){ctx.fillText(Math.abs(d),-w-12,y+3);ctx.fillText(Math.abs(d),w+12,y+3);}}
  ctx.restore();
  ctx.save();ctx.translate(R,R);ctx.strokeStyle='rgba(255,255,255,0.85)';ctx.lineWidth=1.5;
  const r=R-10;ctx.beginPath();ctx.arc(0,0,r,-Math.PI/2-1.0,-Math.PI/2+1.0);ctx.stroke();
  for(const t of [-45,-30,-20,-10,0,10,20,30,45]){const a=t*Math.PI/180-Math.PI/2;const l=(t%30===0||t===0)?9:5;
    ctx.beginPath();ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);ctx.lineTo(Math.cos(a)*(r-l),Math.sin(a)*(r-l));ctx.stroke();}
  ctx.rotate(-bankDeg*Math.PI/180);ctx.fillStyle='#ffd400';
  ctx.beginPath();ctx.moveTo(0,-r+2);ctx.lineTo(-5,-r+12);ctx.lineTo(5,-r+12);ctx.closePath();ctx.fill();
  ctx.restore();
  ctx.save();ctx.translate(R,R);ctx.strokeStyle='#ffd400';ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(-R*0.42,0);ctx.lineTo(-R*0.14,0);ctx.lineTo(-R*0.14,R*0.06);
  ctx.moveTo(R*0.42,0);ctx.lineTo(R*0.14,0);ctx.lineTo(R*0.14,R*0.06);ctx.stroke();
  ctx.fillStyle='#ffd400';ctx.fillRect(-2,-2,4,4);ctx.restore();
  ctx.restore();
  ctx.beginPath();ctx.arc(R,R,R-2,0,Math.PI*2);ctx.strokeStyle='rgba(140,210,255,0.75)';ctx.lineWidth=3;ctx.stroke();
}
function drawCompass(h){
  const c=cmpCtx,W=680,H=104;
  c.clearRect(0,0,W,H);c.save();c.translate(W/2,0);c.textAlign='center';
  const start=Math.floor((h-95)/10)*10;
  for(let a=start;a<=h+95;a+=5){
    const x=(a-h)*(W/180),norm=((a%360)+360)%360,major=norm%30===0;
    c.strokeStyle=major?'rgba(190,235,255,0.95)':'rgba(140,200,235,0.55)';
    c.lineWidth=major?3:2;c.beginPath();c.moveTo(x,H-4-(major?22:12));c.lineTo(x,H-4);c.stroke();
    if(norm%90===0){c.fillStyle='#ffe27a';c.font='bold 28px monospace';c.fillText({0:'N',90:'E',180:'S',270:'W'}[norm],x,H-32);}
    else if(norm%30===0){c.fillStyle='#cfe9ff';c.font='18px monospace';c.fillText(String(Math.round(norm/10)),x,H-30);}
  }
  c.restore();c.fillStyle='#ffd400';
  c.beginPath();c.moveTo(W/2,H-2);c.lineTo(W/2-11,H-20);c.lineTo(W/2+11,H-20);c.closePath();c.fill();
  c.fillStyle='rgba(6,16,26,0.85)';c.fillRect(W/2-46,2,92,34);
  c.strokeStyle='rgba(140,210,255,0.6)';c.lineWidth=2;c.strokeRect(W/2-46,2,92,34);
  c.fillStyle='#eaf6ff';c.font='bold 24px monospace';c.textAlign='center';
  c.fillText(String(Math.round(h)).padStart(3,'0'),W/2,29);
}
function computeAirspeed(){
  const m=BABYLON.Matrix.Identity();plane.quat.toRotationMatrix(m);
  const invM=m.clone().invert();
  const airVel=plane.vel.clone().subtract(windVec);
  const vB=BABYLON.Vector3.TransformNormal(airVel,invM);
  const Va=Math.sqrt(vB.x*vB.x+vB.y*vB.y+vB.z*vB.z);
  const alt=Math.max(plane.pos.y,0);
  const rho=1.225*Math.exp(-alt/8500);
  let kias=Va*Math.sqrt(rho/1.225)*1.94384;
  let mach=Va/340;
  if(faults.has('ADC_FAULT')){
    const t=performance.now()*0.001;
    kias += Math.sin(t*3.1)*12 + Math.sin(t*7.7)*6;
    mach += Math.sin(t*5.2)*0.02;
  }
  return {tas:Va*1.94384,kias, mach};
}
function computeAGL(){
  const gh=sampleSurface(plane.pos.x,plane.pos.z);
  return Math.max(0,(plane.pos.y-gh)*3.28084);
}

function updateHUD(){
  const m=BABYLON.Matrix.Identity();plane.quat.toRotationMatrix(m);
  const fwd=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,0,1),m);
  const right=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1,0,0),m);
  const hdg=(Math.atan2(fwd.x,-fwd.z)*180/Math.PI+360)%360;
  const pitch=Math.asin(BABYLON.Scalar.Clamp(fwd.y,-1,1))*180/Math.PI;
  const bank=Math.atan2(right.y,Math.sqrt(Math.max(0,1-right.y*right.y)))*180/Math.PI;

  const air=computeAirspeed();
  const aglFt=computeAGL();
  const altFt=plane.pos.y*3.28084;
  const vsFpm=plane.vel.y*196.85;

  smoothedSpd=smoothedSpd+(air.kias-smoothedSpd)*0.25;
  smoothedAlt=smoothedAlt+(altFt-smoothedAlt)*0.35;
  smoothedVS=smoothedVS+(vsFpm-smoothedVS)*0.20;
  smoothedAGL=smoothedAGL+(aglFt-smoothedAGL)*0.30;
  DV=applySensors({hdg:hdg,pitch:pitch,bank:bank,spd:smoothedSpd,alt:smoothedAlt,vs:smoothedVS,agl:smoothedAGL,aoa:plane.alpha*180/Math.PI,fuel:plane.fuel});

  el.spd.textContent=Math.round(DV.spd);
  el.mach.textContent=air.mach.toFixed(2);
  const gsKt=Math.round(Math.hypot(plane.vel.x,plane.vel.z)*1.94384);
  el.spdState.textContent=DV.flags.spd?'IAS UNREL':'GS '+gsKt+' kt';
  if(plane.stall||DV.spd<130){el.spd.style.color='#ff6060';}
  else if(DV.spd<170){el.spd.style.color='#ffd060';}
  else {el.spd.style.color='#eaf6ff';}
  if(DV.flags.spd)el.spd.style.color='#ffb020';
  const spdPct=Math.max(0,Math.min(100,DV.spd/4));
  el.spdBar.style.width=spdPct+'%';
  el.spdMark.style.left=(145/4)+'%';

  el.alt.textContent=Math.round(DV.alt).toLocaleString();el.alt.style.color=DV.flags.alt?'#ffb020':'#eaf6ff';
  el.altState.textContent='AGL '+(DV.agl==null?'---':Math.round(DV.agl).toLocaleString());
  const altPct=Math.max(0,Math.min(100,DV.alt/450));
  el.altBar.style.width=altPct+'%';

  const vsRounded=Math.round(DV.vs/50)*50;
  el.vs.textContent=(vsRounded>=0?'+':'')+vsRounded;
  el.g.textContent=plane.gForce.toFixed(1);
  const absVs=Math.abs(vsRounded);
  if(absVs<200){el.vsState.textContent='LVL';el.vs.style.color='#9fd4ff';}
  else if(vsRounded>0){el.vsState.textContent=absVs>1500?'CLIMB':'CLB';el.vs.style.color=absVs>1500?'#2dff7a':'#a0ffd0';}
  else {el.vsState.textContent=absVs>1500?'DESCENT':'DES';el.vs.style.color=absVs>1500?'#ff8080':'#ffd0a0';}

  el.hdg.textContent='HDG '+String(Math.round(DV.hdg)).padStart(3,'0')+'°'+(DV.flags.hdg?' · COMPASS FAIL':'');
  const ll=worldToLL(plane.pos.x,plane.pos.z);
  el.pos.textContent=ll.lat.toFixed(4)+'°N '+ll.lon.toFixed(4)+'°E';
  el.fps.textContent=Math.round(engine.getFps())+' FPS';
  el.src.textContent=useCanadaImagery?'ESRI + SGIC':'ESRI';
  el.apTxt.textContent='AP '+(AP.master?'ON':'OFF')+(AP.appr?' · APPR':(AP.lnav?' · LNAV':(AP.hdgMode?' · HDG':'')))+(AP.vsMode?' · VS':(AP.altMode?' · ALT':''))+(AP.athr?' · SPD':'');
  const N1avg=(ENG.L.n1+ENG.R.n1)/2;
  el.engTxt.textContent='ENG '+(ENG.L.state==='RUNNING'?'RUN':'OFF')+' N1 '+Math.round(N1avg)+'%';
  if(el.aoaTxt){
    const aoaDeg=DV.aoa;
    el.aoaTxt.textContent='AOA '+aoaDeg.toFixed(1)+'°'+(DV.flags.aoa?' FAIL':(plane.stall?' STALL':''));
    el.aoaTxt.style.color=plane.stall?'#ff6060':(aoaDeg>15?'#ffd060':'#9fd4ff');
  }
  if(el.wxTxt){
    el.wxTxt.textContent='WX '+currentWeather.name+' · WIND '+Math.round(windVec.length()*1.94384)+' kt';
    el.wxTxt.style.color=currentWeather.turb>1.5?'#ff8080':(currentWeather.turb>0.5?'#ffd060':'#9fd4ff');
  }
  drawAttitudeIndicator(attCtx);
  if(DV.flags.att){attCtx.fillStyle='rgba(180,0,0,.9)';attCtx.fillRect(65,90,90,24);attCtx.fillStyle='#fff';attCtx.font='bold 14px monospace';attCtx.textAlign='center';attCtx.fillText('ATT FAIL',110,107);}
  {const f=DV.flags,n=[];if(f.spd)n.push('IAS');if(f.alt)n.push('ALT');if(f.vs)n.push('VS');if(f.att)n.push('ATT');if(f.hdg)n.push('HDG');if(f.aoa)n.push('AOA');if(f.fuel)n.push('FUEL');if(f.agl)n.push('RALT');if(f.eng)n.push('ENG1');
   const se=document.getElementById('senTxt');if(se)se.textContent=n.length?'SENSOR FAIL · '+n.join(' '):'';}
  drawCompass(DV.hdg);
  {const sa=ACFG.stallAlpha+FLAPS[plane.flaps].stall-(faults.has('ICING')?.05:0);
    const near=!plane.onGround&&plane.speed>15&&Math.abs(plane.alpha)>sa*0.85;
    let txt='⚠ STALL',on=false;
    if(faults.has('AOA_FAIL')){txt='⚠ AOA DISAGREE';on=true;}
    else if(plane.stall){on=true;}
    else if(near){txt='⚠ APPROACHING STALL';on=true;}
    el.stallWarn.textContent=txt;el.stallWarn.classList.toggle('on',on);}
  if(currentWeather.turb>0.8&&!plane.onGround)el.windWarn.classList.add('on');else el.windWarn.classList.remove('on');
  drawScreens(DV.hdg,DV.pitch,DV.bank);
}

function drawPFD(ctx,W,H,hdg,pitch,bank,side){
  const S=Math.min(W,H),u=S/100,cx=W/2;
  const spd=DV.spd,alt=DV.alt+(EFIS.baroHpa-1013.25)*27,vs=DV.vs;
  const WT='#fff',YL='#ffd400';
  /* PFD background – dark blue-grey instead of pure black */
  ctx.fillStyle='#070a10';ctx.fillRect(0,0,W,H);
  /* subtle scan-line pattern for realism */
  ctx.globalAlpha=.025;for(let sl=0;sl<H;sl+=2){ctx.fillStyle='#000';ctx.fillRect(0,sl,W,1);}ctx.globalAlpha=1;
  /* AP status bar at top */
  ctx.fillStyle='#0c1018';ctx.fillRect(0,0,W,u*8);
  const apColor=AP&&AP.master?'#00e860':'#888';
  const athrColor=AP&&AP.athr?'#00e860':'#888';
  ctx.font='bold '+(u*3.8)+'px monospace';ctx.textAlign='center';
  ctx.fillStyle=apColor;ctx.fillText(AP&&AP.master?'A/P ON':'A/P',W*.25,u*6);
  ctx.fillStyle=athrColor;ctx.fillText(AP&&AP.athr?'A/THR ON':'A/THR',W*.5,u*6);
  ctx.fillStyle=plane.stall?'#ff2020':'#666';ctx.fillText(plane.stall?'!STALL!':'STAB',W*.75,u*6);
  const efisLabels=[
    'MINS '+(EFIS.minsSource==='RADIO'?'RA':'BARO'),
    'MIN RST',
    'BARO '+(EFIS.baroUnit==='HPA'?Math.round(EFIS.baroHpa):((EFIS.baroHpa/33.8639).toFixed(2))),
    'STD',
    'FPV '+(EFIS.fpv?'ON':'OFF'),
    'MTRS '+(EFIS.meters?'ON':'OFF')
  ];
  ctx.font='bold '+(u*1.8)+'px monospace';ctx.textAlign='center';
  efisLabels.forEach((label,i)=>{
    const bw=W/efisLabels.length-2,x=i*W/efisLabels.length+1,y=u*6.8,h=u*2.15;
    ctx.fillStyle='#18212b';ctx.fillRect(x,y,bw,h);
    ctx.strokeStyle='#506174';ctx.lineWidth=u*.18;ctx.strokeRect(x,y,bw,h);
    ctx.fillStyle=(i===4&&EFIS.fpv)||(i===5&&EFIS.meters)?'#69e5a0':'#c6d9e8';
    ctx.fillText(label,x+bw/2,y+h*.72);
  });
  const ay=H*.5,aw=u*27,ah=u*35,ppd=u*1.3;
  ctx.save();ctx.beginPath();ctx.rect(cx-aw,ay-ah,aw*2,ah*2);ctx.clip();
  ctx.translate(cx,ay);ctx.rotate(-bank*Math.PI/180);ctx.translate(0,pitch*ppd);
  let g=ctx.createLinearGradient(0,-60*ppd,0,0);g.addColorStop(0,'#1d5db0');g.addColorStop(1,'#52b0f2');
  ctx.fillStyle=g;ctx.fillRect(-S*2,-S*3,S*4,S*3);
  g=ctx.createLinearGradient(0,0,0,60*ppd);g.addColorStop(0,'#a07038');g.addColorStop(1,'#4a2e14');
  ctx.fillStyle=g;ctx.fillRect(-S*2,0,S*4,S*3);
  ctx.strokeStyle=WT;ctx.fillStyle=WT;ctx.lineWidth=u*.5;
  ctx.beginPath();ctx.moveTo(-S*2,0);ctx.lineTo(S*2,0);ctx.stroke();
  ctx.font=(u*3.4)+'px monospace';ctx.textAlign='center';ctx.lineWidth=u*.4;
  for(let d=-40;d<=40;d+=2.5){if(d===0)continue;const y=-d*ppd,big=d%10===0,mid=d%5===0,w=big?u*11:(mid?u*5.5:u*2.8);
    ctx.beginPath();ctx.moveTo(-w,y);ctx.lineTo(w,y);ctx.stroke();
    if(big){ctx.fillText(Math.abs(d),-w-u*4,y+u*1.2);ctx.fillText(Math.abs(d),w+u*4,y+u*1.2);}}
  ctx.restore();
  ctx.save();ctx.translate(cx,ay);ctx.strokeStyle=WT;ctx.lineWidth=u*.5;
  const R=ah-u*1.5;ctx.beginPath();ctx.arc(0,0,R,-Math.PI/2-.9,-Math.PI/2+.9);ctx.stroke();
  for(const t of [-45,-30,-20,-10,0,10,20,30,45]){const a=t*Math.PI/180-Math.PI/2,l=(t%30===0)?u*3.5:u*2;
    ctx.beginPath();ctx.moveTo(Math.cos(a)*R,Math.sin(a)*R);ctx.lineTo(Math.cos(a)*(R-l),Math.sin(a)*(R-l));ctx.stroke();}
  ctx.fillStyle=YL;ctx.beginPath();ctx.moveTo(0,-R);ctx.lineTo(-u*1.8,-R-u*3.2);ctx.lineTo(u*1.8,-R-u*3.2);ctx.closePath();ctx.fill();
  ctx.rotate(-bank*Math.PI/180);ctx.fillStyle=WT;ctx.beginPath();ctx.moveTo(0,-R+u*.3);ctx.lineTo(-u*2.2,-R+u*4);ctx.lineTo(u*2.2,-R+u*4);ctx.closePath();ctx.fill();
  ctx.restore();
  ctx.strokeStyle=YL;ctx.lineWidth=u*1.1;ctx.beginPath();
  ctx.moveTo(cx-u*17,ay);ctx.lineTo(cx-u*6,ay);ctx.lineTo(cx-u*6,ay+u*2.5);
  ctx.moveTo(cx+u*17,ay);ctx.lineTo(cx+u*6,ay);ctx.lineTo(cx+u*6,ay+u*2.5);ctx.stroke();
  ctx.fillStyle=YL;ctx.fillRect(cx-u*.7,ay-u*.7,u*1.4,u*1.4);
  ctx.strokeStyle='#777';ctx.lineWidth=u*.5;ctx.strokeRect(cx-aw,ay-ah,aw*2,ah*2);
  const sx=u*2,sw=u*16;
  ctx.fillStyle='#23272c';ctx.fillRect(sx,ay-ah,sw,ah*2);
  ctx.save();ctx.beginPath();ctx.rect(sx,ay-ah,sw,ah*2);ctx.clip();
  const fl=FLAPS[plane.flaps];
  const vs1=Math.sqrt(2*ACFG.mass*9.81/(1.225*ACFG.wingArea*(ACFG.CLmax+fl.cl)))*1.94384;
  const Vr=Math.max(135,vs1*1.15);
  const ky=k=>ay+(spd-k)*u*.95;
  ctx.fillStyle='#e02020';ctx.fillRect(sx+sw-u*2,ky(vs1),u*2,ay+ah-ky(vs1)+u*50);
  ctx.fillStyle='#ffb000';ctx.fillRect(sx+sw-u*2,ky(vs1*1.2),u*2,ky(vs1)-ky(vs1*1.2));
  ctx.fillStyle='#ff3080';ctx.fillRect(sx+sw-u*1.5,ky(Vr)-u*.3,u*1.5,u*.6);
  ctx.fillStyle=WT;ctx.strokeStyle=WT;ctx.lineWidth=u*.4;ctx.font=(u*4)+'px monospace';ctx.textAlign='right';
  for(let k=Math.max(0,Math.floor((spd-45)/10)*10);k<=spd+45;k+=10){const y=ky(k);
    ctx.beginPath();ctx.moveTo(sx+sw-u*3.5,y);ctx.lineTo(sx+sw-u*1.5,y);ctx.stroke();
    if(k%20===0)ctx.fillText(k,sx+sw-u*5,y+u*1.4);}
  if(AP.athr&&AP.spdMode){
    const rho=1.225*Math.exp(-Math.max(plane.pos.y,0)/8500);
    const selectedKts=AP.speedUnit==='MACH'?AP.machTarget*340*Math.sqrt(rho/1.225)*1.94384:AP.spdTarget;
    const bugY=ky(selectedKts);
    if(bugY>ay-ah&&bugY<ay+ah){ctx.fillStyle='#ff4dff';ctx.beginPath();ctx.moveTo(sx+sw-u*1,bugY);ctx.lineTo(sx+sw-u*4,bugY-u*2);ctx.lineTo(sx+sw-u*4,bugY+u*2);ctx.closePath();ctx.fill();}
  }
  ctx.restore();
  ctx.fillStyle='#000';ctx.fillRect(sx,ay-u*3.4,sw+u*1,u*6.8);ctx.strokeStyle=WT;ctx.strokeRect(sx,ay-u*3.4,sw+u*1,u*6.8);
  ctx.fillStyle=WT;ctx.font='bold '+(u*6)+'px monospace';ctx.textAlign='right';ctx.fillText(Math.round(spd),sx+sw-u*.5,ay+u*2.2);
  const ax0=u*77,aw2=u*14,ppf=u*.036;
  ctx.fillStyle='#23272c';ctx.fillRect(ax0,ay-ah,aw2,ah*2);
  ctx.save();ctx.beginPath();ctx.rect(ax0,ay-ah,aw2,ah*2);ctx.clip();
  ctx.fillStyle=WT;ctx.strokeStyle=WT;ctx.lineWidth=u*.4;ctx.font=(u*3.8)+'px monospace';ctx.textAlign='left';
  const lo=Math.floor((alt-1100)/100)*100;
  for(let a=lo;a<=alt+1100;a+=100){const y=ay+(alt-a)*ppf;ctx.beginPath();ctx.moveTo(ax0,y);ctx.lineTo(ax0+u*2,y);ctx.stroke();if(a%200===0)ctx.fillText(a,ax0+u*3,y+u*1.3);}
  if(AP.altMode||AP.vsMode){
    const bugY=ay+(alt-AP.altTarget)*ppf;
    if(bugY>ay-ah&&bugY<ay+ah){ctx.fillStyle='#ff4dff';ctx.beginPath();ctx.moveTo(ax0+u*1,bugY);ctx.lineTo(ax0+u*4,bugY-u*2);ctx.lineTo(ax0+u*4,bugY+u*2);ctx.closePath();ctx.fill();}
  }
  ctx.restore();
  ctx.fillStyle='#000';ctx.fillRect(ax0-u*1,ay-u*3.6,aw2+u*1,u*7.2);ctx.strokeStyle=WT;ctx.lineWidth=u*.4;ctx.strokeRect(ax0-u*1,ay-u*3.6,aw2+u*1,u*7.2);
  ctx.fillStyle=WT;ctx.font='bold '+(u*5.6)+'px monospace';ctx.textAlign='left';ctx.fillText(String(Math.round(alt/20)*20),ax0,ay+u*2);
  if(EFIS.meters){ctx.fillStyle='#8fe8c0';ctx.font='bold '+(u*2.6)+'px monospace';ctx.textAlign='center';ctx.fillText('M '+Math.round(alt*.3048).toLocaleString(),ax0+aw2/2,ay+u*9);}
  const vx=u*92;ctx.fillStyle='#1b1e22';ctx.fillRect(vx,ay-ah,u*7,ah*2);
  const vy=ay-Math.max(-2500,Math.min(2500,vs))/1000*ah*.42;
  ctx.strokeStyle=WT;ctx.lineWidth=u*.9;ctx.beginPath();ctx.moveTo(vx+u*7,ay);ctx.lineTo(vx+u*1,vy);ctx.stroke();
  const hy=ay+ah+u*8,hh=H-hy-u*1;
  ctx.fillStyle='#23272c';ctx.fillRect(u*20,hy,u*60,hh);
  ctx.save();ctx.beginPath();ctx.rect(u*20,hy,u*60,hh);ctx.clip();ctx.strokeStyle=WT;ctx.fillStyle=WT;ctx.lineWidth=u*.4;ctx.font=(u*3.6)+'px monospace';ctx.textAlign='center';
  for(let h=Math.floor((hdg-32)/5)*5;h<=hdg+32;h+=5){const x=cx+(h-hdg)*u*.9,n=((h%360)+360)%360;ctx.beginPath();ctx.moveTo(x,hy);ctx.lineTo(x,hy+(n%10===0?u*2.5:u*1.3));ctx.stroke();if(n%10===0)ctx.fillText(String(n/10).padStart(2,'0'),x,hy+u*6.6);}
  if(AP.hdgMode||AP.lnav||AP.appr){
    const hdgBugX=cx+wrap180(AP.hdgTarget-hdg)*u*.9;
    if(hdgBugX>u*20&&hdgBugX<u*80){ctx.strokeStyle='#ff4dff';ctx.lineWidth=u*.8;ctx.beginPath();ctx.moveTo(hdgBugX,hy);ctx.lineTo(hdgBugX,hy+u*4);ctx.stroke();}
  }
  ctx.restore();
  ctx.fillStyle='#000';ctx.fillRect(cx-u*5.5,hy-u*8,u*11,u*5.6);ctx.strokeStyle=WT;ctx.strokeRect(cx-u*5.5,hy-u*8,u*11,u*5.6);
  ctx.fillStyle=WT;ctx.font='bold '+(u*4.6)+'px monospace';ctx.textAlign='center';ctx.fillText(String(Math.round(hdg)%360).padStart(3,'0')+'°',cx,hy-u*3.8);
  if(EFIS.fpv){
    const track=(Math.atan2(plane.vel.x,-plane.vel.z)*180/Math.PI+360)%360;
    const fpvX=cx+wrap180(track-hdg)*u*.9;
    const fpvY=ay-Math.atan2(plane.vel.y,Math.max(.1,Math.hypot(plane.vel.x,plane.vel.z)))*180/Math.PI*ppd;
    ctx.save();ctx.strokeStyle='#7dffb2';ctx.lineWidth=u*.65;
    ctx.beginPath();ctx.arc(fpvX,fpvY,u*1.8,0,Math.PI*2);ctx.moveTo(fpvX-u*6,fpvY);ctx.lineTo(fpvX-u*2.4,fpvY);ctx.moveTo(fpvX+u*2.4,fpvY);ctx.lineTo(fpvX+u*6,fpvY);ctx.moveTo(fpvX,fpvY+u*1.8);ctx.lineTo(fpvX,fpvY+u*4);ctx.stroke();ctx.restore();
  }
  ctx.font='bold '+(u*2.8)+'px monospace';ctx.textAlign='left';ctx.fillStyle=DV.flags.agl?'#ff3030':'#b8d7e8';
  ctx.fillText('RA '+(DV.agl==null?'---':Math.round(DV.agl)+' FT'),u*2,H-u*1.5);
  ctx.textAlign='right';ctx.fillStyle=plane.gearPos>.9?'#00ff90':'#d7e6f0';
  ctx.fillText('FL '+FLAPS[plane.flaps].name+'  GEAR '+(plane.gearPos>.9?'DN':'UP'),W-u*2,H-u*1.5);
  {const F=DV.flags,flag=(t,x,y)=>{ctx.fillStyle='#000';ctx.fillRect(x-u*7,y-u*5,u*14,u*6.6);ctx.fillStyle='#ff3030';ctx.font='bold '+(u*4.6)+'px monospace';ctx.textAlign='center';ctx.fillText(t,x,y);};
   if(F.spd)flag('SPD',sx+sw/2,ay-ah+u*8);if(F.alt)flag('ALT',ax0+aw2/2,ay-ah+u*8);
   if(F.att)flag('ATT',cx,ay-u*14);if(F.hdg)flag('HDG',cx+u*17,hy-u*3.8);}
  /* ---- MSFS-style guidance: FMA, flight director, LOC/GS diamonds ---- */
  try{
    const PUR='#e070ff',il=window._ilsDev;
    const m1=AP.spdMode&&AP.athr?'SPD':(AP.athr?'A/THR':''),
      m2=(AP.appr||AP.locMode)?'LOC':(AP.lnav?'LNAV':(AP.hdgMode?'HDG '+Math.round(AP.hdgTarget):'ROLL')),
      m3=AP.appr?(il&&il.valid?'G/S':'APPR'):(AP.vsMode?(AP.vsModeType==='FPA'?'FPA '+AP.fpaTarget.toFixed(1)+'°':'VS '+Math.round(AP.vsTarget)):(AP.altMode?'ALT '+Math.round(AP.altTarget):'PIT'));
    ctx.fillStyle='#0a0d14';ctx.fillRect(sx,u*9.2,u*96,u*5);
    ctx.font='bold '+(u*3.3)+'px monospace';ctx.textAlign='center';
    ctx.fillStyle=AP.master?'#00ff90':'#5a6068';ctx.fillText(m1||'—',u*20,u*12.9);ctx.fillText(m2,u*50,u*12.9);ctx.fillText(m3,u*80,u*12.9);
    ctx.strokeStyle='#333c46';ctx.lineWidth=u*.25;ctx.beginPath();ctx.moveTo(u*35,u*9.5);ctx.lineTo(u*35,u*14);ctx.moveTo(u*65,u*9.5);ctx.lineTo(u*65,u*14);ctx.stroke();
    const fdOn=(side==='L'?EFIS.fdL:side==='R'?EFIS.fdR:AP.fd)&&(AP.master||AP.hdgMode||AP.altMode||AP.vsMode||AP.appr||AP.locMode);
    if(fdOn){
      let vsT=0;if(AP.appr&&il&&il.valid)vsT=-il.gs*600+(-DV.spd*5*Math.tan(3*Math.PI/180)*1.0);else if(AP.vsMode)vsT=AP.vsModeType==='FPA'?Math.hypot(plane.vel.x,plane.vel.z)*Math.tan(AP.fpaTarget*Math.PI/180)*196.85:AP.vsTarget;else if(AP.altMode)vsT=Math.max(-1800,Math.min(1800,(AP.altTarget-alt)*.4));
      const pCmd=Math.max(-8,Math.min(8,(vsT-vs)/220));
      let bCmd=0;if((AP.appr||AP.locMode)&&il&&il.valid)bCmd=Math.max(-20,Math.min(20,il.loc*12));else if(AP.lnav||AP.hdgMode)bCmd=Math.max(-22,Math.min(22,wrap180(AP.hdgTarget-hdg)));
      const fy=ay-pCmd*ppd*.8,fx=cx+(bCmd-bank)*u*.9;
      ctx.save();ctx.beginPath();ctx.rect(cx-aw,ay-ah,aw*2,ah*2);ctx.clip();
      ctx.strokeStyle=PUR;ctx.lineWidth=u*1.2;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(cx-u*20,fy);ctx.lineTo(cx+u*20,fy);ctx.stroke();
      ctx.beginPath();ctx.moveTo(fx,ay-u*20);ctx.lineTo(fx,ay+u*20);ctx.stroke();ctx.restore();ctx.lineCap='butt';
    }
    if(il&&il.valid){
      /* ── ILS LOC scale (bottom of attitude area) ── */
      const ly=ay+ah-u*5,gx=cx+aw-u*4.5;
      /* scale background */
      ctx.fillStyle='rgba(0,0,0,.5)';ctx.fillRect(cx-u*18,ly-u*3,u*36,u*6);ctx.fillRect(gx-u*3,ay-u*18,u*6,u*36);
      /* scale dots at ±1 and ±2 dots */
      ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=u*.4;
      for(let k=-2;k<=2;k++){if(!k)continue;
        ctx.beginPath();ctx.arc(cx+k*u*7,ly,u*1.1,0,6.3);ctx.stroke();
        ctx.beginPath();ctx.arc(gx,ay+k*u*7,u*1.1,0,6.3);ctx.stroke();}
      /* fixed centre cross-marks (yellow) */
      ctx.strokeStyle='#ffd400';ctx.lineWidth=u*.65;
      ctx.beginPath();ctx.moveTo(cx,ly-u*2.8);ctx.lineTo(cx,ly+u*2.8);ctx.stroke();
      ctx.beginPath();ctx.moveTo(gx-u*2.8,ay);ctx.lineTo(gx+u*2.8,ay);ctx.stroke();
      /* LOC bar (vertical magenta bar on LOC scale) */
      const locOff=Math.max(-2.1,Math.min(2.1,il.loc))*u*7;
      ctx.strokeStyle=PUR;ctx.lineWidth=u*2;ctx.lineCap='round';
      ctx.beginPath();ctx.moveTo(cx+locOff,ly-u*4.5);ctx.lineTo(cx+locOff,ly+u*4.5);ctx.stroke();
      /* GS bar (horizontal magenta bar on GS scale) */
      const gsOff=Math.max(-2.1,Math.min(2.1,il.gs))*u*7;
      ctx.beginPath();ctx.moveTo(gx-u*4.5,ay+gsOff);ctx.lineTo(gx+u*4.5,ay+gsOff);ctx.stroke();
      ctx.lineCap='butt';
      /* ILS distance label */
      ctx.fillStyle=PUR;ctx.font='bold '+(u*3.4)+'px monospace';ctx.textAlign='left';ctx.fillText('ILS '+(il.d/1852).toFixed(1)+'NM',cx-aw+u*1,ay-ah+u*4);
    }
  }catch(e){}
}
function drawND(ctx,W,H,hdg){
  ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);
  const modes=['APP','VOR','MAP','PLN'],overlays=Object.keys(ND.overlays);
  const button=(x,y,w,h,label,active)=>{
    ctx.fillStyle=active?'#123e30':'#131a20';ctx.fillRect(x,y,w,h);
    ctx.strokeStyle=active?'#2fe070':'#475563';ctx.lineWidth=1;ctx.strokeRect(x+.5,y+.5,w-1,h-1);
    ctx.fillStyle=active?'#aaffc8':'#a9bac8';ctx.font='bold '+Math.max(9,Math.round(H*.018))+'px monospace';
    ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,x+w/2,y+h/2);
  };
  const topLabels=[...modes,ND.center?'ARC':'CTR',ND.tfc?'TFC ON':'TFC OFF',ND.bearingL+' L',ND.bearingR+' R'];
  topLabels.forEach((label,i)=>button(i*W/8,2,W/8,22,label,i<4?ND.mode===modes[i]:(i===4?ND.center:i===5?ND.tfc:i===6?ND.bearingL!=='OFF':ND.bearingR!=='OFF')));
  overlays.forEach((name,i)=>button(i*W/overlays.length,26,W/overlays.length,22,name,ND.overlays[name]));
  ctx.textBaseline='alphabetic';
  const cx=W/2,cy=ND.center?H*.54:H*.79,r=ND.center?W*.37:Math.min(W*.58,H*.58);
  const viewHeading=ND.mode==='PLN'?0:hdg,rangeM=ND.range*1852;
  const project=(x,z)=>{
    const dx=x-plane.pos.x,dz=z-plane.pos.z,dist=Math.hypot(dx,dz),bearing=Math.atan2(dx,-dz)*180/Math.PI;
    const a=(bearing-viewHeading)*Math.PI/180,d=Math.min(r*.96,dist/rangeM*r*.92);
    return{x:cx+Math.sin(a)*d,y:cy-Math.cos(a)*d,dist,bearing};
  };
  const crs=AP.courseTarget||0;
  ctx.save();
  if(!ND.center){ctx.beginPath();ctx.rect(0,H*.2,W,H*.8);ctx.clip();}
  ctx.strokeStyle='#00c878';ctx.lineWidth=1.3;
  [1,.66,.33].forEach(q=>{ctx.beginPath();ctx.arc(cx,cy,r*q,ND.center?0:Math.PI,Math.PI*2);ctx.stroke();});
  if(ND.center)for(let d=0;d<360;d+=30){
    const a=(d-viewHeading-90)*Math.PI/180,x=cx+Math.cos(a)*r*.93,y=cy+Math.sin(a)*r*.93;
    ctx.fillStyle=d===0?'#ff8080':'#00ff88';ctx.font=Math.round(H*.022)+'px monospace';ctx.textAlign='center';
    ctx.fillText(d===0?'N':d===90?'E':d===180?'S':d===270?'W':String(d),x,y+H*.01);
  }
  if(ND.overlays.WXR&&currentWeather&&currentWeather.name!=='CLEAR'){
    const severe=currentWeather.turb>1.5;
    ctx.fillStyle=severe?'rgba(255,55,35,.30)':'rgba(255,210,35,.24)';
    ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r*.82,-Math.PI*.64,-Math.PI*.36);ctx.closePath();ctx.fill();
    ctx.strokeStyle=severe?'#ff5638':'#ffd34d';ctx.lineWidth=2;ctx.stroke();
  }
  if(ND.overlays.TERR){
    const v=Math.max(50,plane.speed*3),h=Math.atan2(plane.vel.x,-plane.vel.z);
    for(let i=1;i<=5;i++){
      const d=v*i*4,x=plane.pos.x+Math.sin(h)*d,z=plane.pos.z-Math.cos(h)*d,p=project(x,z);
      if(p.dist>rangeM)continue;
      const clearance=(plane.pos.y-sampleTerrain(x,z))*3.28084;
      ctx.fillStyle=clearance<1000?'#ff4545':clearance<2500?'#ffae32':'#68d979';
      ctx.beginPath();ctx.arc(p.x,p.y,W*.012,0,Math.PI*2);ctx.fill();
    }
  }
  if(ND.overlays.ARPT){
    ctx.font='bold '+Math.max(9,Math.round(H*.017))+'px monospace';ctx.textAlign='left';
    for(const [code,loc] of Object.entries(LOCS)){
      if(!loc||!isFinite(loc.lat)||!isFinite(loc.lon))continue;
      const w=llToWorld(loc.lat,loc.lon),p=project(w.x,w.z);if(p.dist>rangeM)continue;
      ctx.fillStyle='#ffe16a';ctx.beginPath();ctx.arc(p.x,p.y,W*.006,0,Math.PI*2);ctx.fill();ctx.fillText(code,p.x+W*.008,p.y+H*.012);
    }
  }
  if(ND.overlays.WPT&&FP.wps.length){
    ctx.strokeStyle='#f04bff';ctx.lineWidth=2;ctx.beginPath();
    FP.wps.forEach((wp,i)=>{const w=llToWorld(wp.lat,wp.lon),p=project(w.x,w.z);if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);});
    ctx.stroke();
    FP.wps.forEach((wp,i)=>{
      const w=llToWorld(wp.lat,wp.lon),p=project(w.x,w.z);if(p.dist>rangeM)return;
      ctx.fillStyle=i===FP.active?'#ff68ff':'#e4b7ed';ctx.beginPath();ctx.moveTo(p.x,p.y-W*.012);ctx.lineTo(p.x+W*.01,p.y);ctx.lineTo(p.x,p.y+W*.012);ctx.lineTo(p.x-W*.01,p.y);ctx.closePath();ctx.fill();
      if(ND.overlays.DATA){
        const nm=p.dist/1852,gs=Math.max(1,Math.hypot(plane.vel.x,plane.vel.z)*1.94384);
        ctx.fillStyle='#e7d4ee';ctx.font=Math.max(9,Math.round(H*.016))+'px monospace';ctx.textAlign='left';
        ctx.fillText((wp.alt==null?'':Math.round(wp.alt)+'FT ')+nm.toFixed(1)+'NM '+Math.round(nm/gs*60)+'M',p.x+W*.014,p.y+H*.015);
      }
    });
  }
  if(ND.overlays.STA){
    const a=(crs-viewHeading)*Math.PI/180;
    ctx.strokeStyle='#ff54df';ctx.lineWidth=2;ctx.setLineDash([8,5]);ctx.beginPath();
    ctx.moveTo(cx-Math.sin(a)*r*.8,cy+Math.cos(a)*r*.8);ctx.lineTo(cx+Math.sin(a)*r*.8,cy-Math.cos(a)*r*.8);ctx.stroke();ctx.setLineDash([]);
  }
  if(ND.overlays.POS){
    const track=(Math.atan2(plane.vel.x,-plane.vel.z)*180/Math.PI-viewHeading)*Math.PI/180;
    ctx.strokeStyle='#69ddff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.sin(track)*r*.24,cy-Math.cos(track)*r*.24);ctx.stroke();
  }
  if(ND.tfc)traffic.forEach(t=>{
    if(!t.pos)return;const p=project(t.pos.x,t.pos.z);if(p.dist>rangeM)return;
    const relAlt=Math.round((t.pos.y-plane.pos.y)*3.28084/100)*100;
    ctx.fillStyle=t.threat>1?'#ff4c4c':'#56d9ff';ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=2;ctx.beginPath();
    if(t.threat>1){ctx.moveTo(p.x,p.y-W*.012);ctx.lineTo(p.x+W*.012,p.y);ctx.lineTo(p.x,p.y+W*.012);ctx.lineTo(p.x-W*.012,p.y);ctx.closePath();ctx.fill();}
    else ctx.arc(p.x,p.y,W*.009,0,Math.PI*2),ctx.stroke();
    ctx.font=Math.max(9,Math.round(H*.016))+'px monospace';ctx.textAlign='left';ctx.fillText((relAlt>0?'+':'')+relAlt,p.x+W*.014,p.y);
  });
  [['L',ND.bearingL,crs],['R',ND.bearingR,runwayHdgDeg]].forEach(([side,mode,bearing],i)=>{
    if(mode==='OFF')return;const a=(bearing-viewHeading)*Math.PI/180,len=r*(i===0?.45:.60);
    ctx.strokeStyle=i===0?'#4edbff':'#ffb347';ctx.lineWidth=2;ctx.beginPath();
    ctx.moveTo(cx-Math.sin(a)*len,cy+Math.cos(a)*len);ctx.lineTo(cx+Math.sin(a)*len,cy-Math.cos(a)*len);ctx.stroke();
    ctx.fillStyle=ctx.strokeStyle;ctx.font='bold '+Math.max(9,Math.round(H*.018))+'px monospace';ctx.textAlign='left';
    ctx.fillText(mode+' '+side,cx+W*(i===0?-.46:.25),H*.14);
  });
  if(['APP','VOR','MAP'].includes(ND.mode)){
    const a=(crs-viewHeading)*Math.PI/180;ctx.save();ctx.strokeStyle='#ff4dff';ctx.fillStyle='#ff4dff';ctx.lineWidth=Math.max(2,W*.003);
    ctx.setLineDash([W*.012,W*.008]);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx+Math.sin(a)*r*.78,cy-Math.cos(a)*r*.78);ctx.stroke();ctx.setLineDash([]);
    ctx.beginPath();ctx.arc(cx+Math.sin(a)*r*.78,cy-Math.cos(a)*r*.78,W*.012,0,Math.PI*2);ctx.fill();ctx.restore();
  }
  ctx.fillStyle='#ffd400';ctx.beginPath();
  ctx.moveTo(cx,cy-H*.025);ctx.lineTo(cx-W*.022,cy+H*.014);ctx.lineTo(cx-W*.007,cy+H*.014);
  ctx.lineTo(cx-W*.007,cy+H*.024);ctx.lineTo(cx+W*.007,cy+H*.024);ctx.lineTo(cx+W*.007,cy+H*.014);
  ctx.lineTo(cx+W*.022,cy+H*.014);ctx.closePath();ctx.fill();
  ctx.restore();
  ctx.fillStyle='#00ff88';ctx.font=Math.round(H*.022)+'px monospace';ctx.textAlign='left';
  ctx.fillText(ND.mode+' · '+ND.range+' NM',W*.04,H*.965);
  ctx.textAlign='center';ctx.fillText('HDG '+String(Math.round(hdg)%360).padStart(3,'0')+'°',W*.5,H*.965);
  ctx.fillStyle='#ff4dff';ctx.textAlign='right';ctx.fillText('CRS '+String(Math.round(crs)%360).padStart(3,'0')+'°',W*.96,H*.965);
}
function drawEICAS(ctx,W,H){
  const G='#48ed91',C='#72c9ff',R='#ff5353',A='#ffb547',D='#667482';
  const font=Math.round(H*.022),big=Math.round(H*.034);
  ctx.fillStyle='#020508';ctx.fillRect(0,0,W,H);
  const page=DSP.page||'ENG';
  if(page!=='ENG'){
    const titles={SYS:'SYSTEMS SYNOPTIC',CDU:'FLIGHT MANAGEMENT',INFO:'FLIGHT INFORMATION',CHKL:'ELECTRONIC CHECKLIST',COMM:'COMMUNICATIONS',ND:'NAVIGATION DISPLAY'};
    ctx.fillStyle='#111923';ctx.fillRect(0,0,W,H*.105);
    ctx.fillStyle=C;ctx.font='bold '+big+'px monospace';ctx.textAlign='left';ctx.fillText(titles[page]||page,W*.045,H*.065);
    ctx.textAlign='right';ctx.fillStyle=AP.master?G:D;ctx.fillText(AP.master?'A/P CMD '+(AP.cmdChannel||'A'):'A/P OFF',W*.955,H*.065);
    const rows=[];
    const status=(ok)=>ok?G:A;
    if(page==='SYS')rows.push(
      ['HYDRAULICS',faults.has('HYD_LOSS')?'LOW PRESSURE':`SYS A ${AIRSYS.hydraulic.leftEngine?'ENG':'—'}/${AIRSYS.hydraulic.systemAElectric?'ELEC':'—'} · SYS B ${AIRSYS.hydraulic.rightEngine?'ENG':'—'}/${AIRSYS.hydraulic.systemBElectric?'ELEC':'—'}`,faults.has('HYD_LOSS')?R:G],
      ['ELECTRICAL',faults.has('ELEC_BUS')?'BUS FAULT':electricalPower()?'POWERED':'NO POWER',faults.has('ELEC_BUS')?R:electricalPower()?G:R],
      ['BATTERY / EXT PWR',(ENG.battery?'BAT ON':'BAT OFF')+' · '+(AIRSYS.electrical.extPower?'EXT ON':'EXT OFF'),electricalPower()?G:A],
      ['FUEL',DV.flags.fuel?'SENSOR FAULT':Math.round(DV.fuel).toLocaleString()+' KG',DV.flags.fuel?R:G],
      ['FUEL PUMPS',`L ${AIRSYS.fuel.leftPump?'ON':'OFF'} · R ${AIRSYS.fuel.rightPump?'ON':'OFF'} · C ${AIRSYS.fuel.centerLeft||AIRSYS.fuel.centerRight?'ON':'OFF'}`,ENG.fuelPumps?G:A],
      ['FUEL CROSSFEED',AIRSYS.fuel.crossfeed?'OPEN':'CLOSED',C],
      ['ENGINE GENERATORS',(ENG.L.state==='RUNNING'&&window._genL!==false?'L ':'')+(ENG.R.state==='RUNNING'&&window._genR!==false?'R':'')||'OFF',status((ENG.L.state==='RUNNING'&&window._genL!==false)||(ENG.R.state==='RUNNING'&&window._genR!==false))],
      ['ANTI-ICE',`WING ${AIRSYS.antiIce.wing?'ON':'OFF'} · ENG ${AIRSYS.antiIce.engineLeft||AIRSYS.antiIce.engineRight?'ON':'OFF'} · WIN ${AIRSYS.antiIce.windowLeft&&AIRSYS.antiIce.windowRight?'ON':'CHECK'}`,AIRSYS.antiIce.wing||AIRSYS.antiIce.engineLeft||AIRSYS.antiIce.engineRight?G:C],
      ['AIR CONDITIONING',`PACKS ${AIRSYS.air.packLeft&&AIRSYS.air.packRight?'ON':'CHECK'} · TRIM ${AIRSYS.air.trimLeft&&AIRSYS.air.trimRight?'ON':'CHECK'}`,AIRSYS.air.packLeft&&AIRSYS.air.packRight?G:A],
      ['PRESSURIZATION',`${AIRSYS.air.outflow} · LANDING ALT ${AIRSYS.air.landingAltitude} FT`,C],
      ['CABIN',`BELT ${window._belts?'ON':'OFF'} · NS ${window._noSmoke?'ON':'OFF'} · OXY ${AIRSYS.cabin.oxygen?'ON':'OFF'} · EM ${AIRSYS.cabin.emergencyLights}`,window._belts||window._noSmoke?G:D],
      ['GPWS OVERRIDES',[AIRSYS.gpws.terrainOverride&&'TERR',AIRSYS.gpws.gearOverride&&'GEAR',AIRSYS.gpws.flapOverride&&'FLAP',AIRSYS.gpws.glideslopeInhibit&&'G/S'].filter(Boolean).join(' · ')||'NONE',Object.values(AIRSYS.gpws).some(Boolean)?A:G],
      ['FLIGHT CONTROLS','NORMAL',G],['GEAR',plane.gearPos>.9?'DOWN':plane.gearPos<.1?'UP':'TRANSIT',plane.gearPos>.9||plane.gearPos<.1?G:A],
      ['FLAPS',FLAPS[plane.flaps].name,C],['CABIN / DOORS','NOT SIMULATED',D]
    );
    if(page==='CDU'){
      rows.push(['ACTIVE ROUTE',FP.wps.length?FP.wps.length+' WAYPOINTS':'NO ROUTE',FP.wps.length?G:A],
        ['ACTIVE LEG',FP.wps.length?String(FP.active+1)+' / '+FP.wps.length:'—',C],
        ['LNAV',AP.lnav?'ENGAGED':'OFF',AP.lnav?G:D],['VNAV',AP.vnav?'ARMED':'OFF',AP.vnav?G:D],
        ['SELECTED SPEED',AP.spdTarget+' KT',C],['SELECTED ALTITUDE',Math.round(AP.altTarget)+' FT',C]);
      FP.wps.slice(0,7).forEach((wp,i)=>rows.push([String(i+1).padStart(2,'0')+' '+wp.name,wp.alt==null?'—':Math.round(wp.alt)+' FT',i===FP.active?G:C]));
    }
    if(page==='INFO')rows.push(
      ['LOCATION',currentLocation.code||'—',C],['FLIGHT STATE',plane.onGround?'GROUND':'AIRBORNE',plane.onGround?G:C],
      ['POSITION',worldToLL(plane.pos.x,plane.pos.z).lat.toFixed(3)+' / '+worldToLL(plane.pos.x,plane.pos.z).lon.toFixed(3),C],
      ['HEADING / TRACK',Math.round(DV.hdg)+'° / '+Math.round((Math.atan2(plane.vel.x,-plane.vel.z)*180/Math.PI+360)%360)+'°',C],
      ['BARO',EFIS.baroUnit==='HPA'?Math.round(EFIS.baroHpa)+' HPA':(EFIS.baroHpa/33.8639).toFixed(2)+' IN',C],
      ['MINIMUMS',EFIS.minsSource+' · '+MINS.dh+' FT',C],
      ['WIND',Math.round(windVec.length()*1.94384)+' KT · '+currentWeather.name,C],
      ['TRAFFIC',traffic.length+' TARGETS · '+(ND.tfc?'DISPLAYED':'FILTERED'),ND.tfc?G:D]
    );
    if(page==='CHKL'){
      const checklist=[
        ['PARKING BRAKE',plane.onGround?'SET':'CHECK'],
        ['BATTERY',ENG.battery?'ON':'OFF'],
        ['FUEL PUMPS',ENG.fuelPumps?'ON':'OFF'],
        ['ENGINE START',ENG.L.state==='RUNNING'&&ENG.R.state==='RUNNING'?'COMPLETE':'CHECK'],
        ['FLAPS',plane.flaps>0?'SET':'CHECK'],
        ['LANDING GEAR',plane.gearDown?'DOWN':'CHECK']
      ];
      rows.push(['BEFORE TAKEOFF',plane.onGround?'IN PROGRESS':'COMPLETE',plane.onGround?A:G]);
      checklist.forEach(([label,value])=>rows.push([label,value,value==='ON'||value==='SET'||value==='DOWN'||value==='COMPLETE'?G:A]));
    }
    if(page==='COMM'){
      rows.push(['ATC PHASE',atc.phase.toUpperCase(),C],['CALLSIGN',atc.cs,C],['SQUAWK',atc.sq,C],
        ['VOICE READBACK',atc.voice?'ENABLED':'MUTED',atc.voice?G:A],
        ['FREQUENCIES','ATC PANEL · PRESS K',C],
        ['ATC PANEL','CLEARANCE / RADIO ACTIONS',C]);
    }
    if(page==='ND')rows.push(
      ['MODE',ND.mode,C],['RANGE',ND.range+' NM',C],['CENTER',ND.center?'360°':'ARC',C],
      ['TRAFFIC',ND.tfc?'ON':'OFF',ND.tfc?G:D],
      ...Object.entries(ND.overlays).map(([name,on])=>[name,on?'ON':'OFF',on?G:D]),
      ['BEARING POINTERS',ND.bearingL+' / '+ND.bearingR,C]
    );
    const left=W*.065,top=H*.16,rowH=Math.min(H*.075,H*.72/Math.max(1,rows.length));
    rows.forEach(([label,value,color],i)=>{
      const y=top+i*rowH;
      ctx.fillStyle=i%2?'#0c131c':'#101923';ctx.fillRect(left,y,W*.87,rowH*.88);
      ctx.textAlign='left';ctx.fillStyle=C;ctx.font='bold '+font+'px monospace';ctx.fillText(label,left+W*.02,y+rowH*.58);
      ctx.textAlign='right';ctx.fillStyle=color;ctx.fillText(value,left+W*.85,y+rowH*.58);
    });
    const alerts=faults.list().filter(name=>!DSP.cancelled.includes(name));
    ctx.fillStyle=alerts.length?'#4a1111':'#10261a';ctx.fillRect(W*.045,H*.92,W*.91,H*.065);
    ctx.font='bold '+font+'px monospace';ctx.textAlign='center';ctx.fillStyle=alerts.length?R:G;
    ctx.fillText(alerts.length?alerts.map(name=>FAULTS[name]?.label||name).slice(0,3).join(' · '):'NO ACTIVE ALERTS',W/2,H*.963);
    return;
  }
  ctx.fillStyle='#111923';ctx.fillRect(0,0,W,H*.105);
  ctx.fillStyle=C;ctx.font='bold '+big+'px monospace';ctx.textAlign='left';ctx.fillText('ENGINE / SYSTEMS',W*.045,H*.065);
  ctx.textAlign='right';ctx.fillStyle=AP.master?G:D;ctx.fillText(AP.master?'A/P CMD '+(AP.cmdChannel||'A'):'A/P OFF',W*.955,H*.065);
  const engines=[ENG.L,ENG.R],cols=[W*.055,W*.525],cw=W*.42;
  const bar=(x,y,w,pct,col)=>{
    ctx.fillStyle='#18212b';ctx.fillRect(x,y,w,H*.027);
    ctx.fillStyle=col;ctx.fillRect(x,y,w*Math.max(0,Math.min(1,pct)),H*.027);
    ctx.strokeStyle='#526171';ctx.lineWidth=1;ctx.strokeRect(x,y,w,H*.027);
  };
  engines.forEach((e,i)=>{
    const x=cols[i],valX=x+cw*.86,barX=x+cw*.25,bw=cw*.58;
    const sensorFailed=i===0&&DV.flags.eng;
    ctx.fillStyle='#0c131c';ctx.fillRect(x,H*.12,cw,H*.49);
    ctx.strokeStyle='#344252';ctx.lineWidth=2;ctx.strokeRect(x,H*.12,cw,H*.49);
    ctx.fillStyle=C;ctx.font='bold '+font+'px monospace';ctx.textAlign='left';
    ctx.fillText('ENGINE '+(i+1),x+W*.018,H*.16);
    ctx.textAlign='right';ctx.fillStyle=e.state==='RUNNING'?G:(e.state==='OFF'?D:A);
    ctx.fillText(e.state,valX,H*.16);
    const metrics=[
      {label:'N1 %',v:e.n1,max:110,limit:90,fmt:n=>n.toFixed(1)},
      {label:'N2 %',v:e.n2,max:100,limit:95,fmt:n=>n.toFixed(1)},
      {label:'EGT °C',v:e.egt,max:900,limit:750,fmt:n=>Math.round(n)}
    ];
    metrics.forEach((m,j)=>{
      const y=H*(.225+j*.105),col=m.v>=m.limit?A:G;
      ctx.textAlign='left';ctx.fillStyle=C;ctx.font='bold '+font+'px monospace';ctx.fillText(m.label,x+W*.018,y);
      bar(barX,y-H*.022,bw,m.v/m.max,col);
      ctx.textAlign='right';ctx.fillStyle=sensorFailed?'#ff5353':col;
      ctx.fillText(sensorFailed?'---':m.fmt(m.v),valX,y);
    });
    ctx.textAlign='left';ctx.fillStyle=C;ctx.fillText('FUEL FLOW',x+W*.018,H*.565);
    ctx.textAlign='right';ctx.fillStyle=e.ff>0?G:D;ctx.fillText(Math.round(e.ff)+' KG/H',valX,H*.565);
  });
  const fuelTotal=Math.max(0,DV.fuel),fuelPct=Math.max(0,Math.min(1,fuelTotal/18000));
  ctx.fillStyle='#0c131c';ctx.fillRect(W*.055,H*.635,W*.89,H*.17);
  ctx.strokeStyle='#344252';ctx.strokeRect(W*.055,H*.635,W*.89,H*.17);
  ctx.fillStyle=C;ctx.font='bold '+font+'px monospace';ctx.textAlign='left';ctx.fillText('FUEL',W*.075,H*.675);
  ctx.fillStyle=DV.flags.fuel?R:(fuelPct<.15?R:(fuelPct<.3?A:G));
  ctx.textAlign='right';ctx.font='bold '+big+'px monospace';ctx.fillText(DV.flags.fuel?'---':Math.round(fuelTotal).toLocaleString()+' KG',W*.925,H*.675);
  const tankW=W*.36;
  [['LEFT TANK',W*.075],['RIGHT TANK',W*.545]].forEach(([label,x],i)=>{
    const yy=H*.735;ctx.textAlign='left';ctx.fillStyle=C;ctx.font='bold '+font+'px monospace';ctx.fillText(label,x,yy);
    bar(x,yy+H*.018,tankW,Math.min(1,fuelPct),fuelPct<.15?R:(fuelPct<.3?A:G));
    ctx.textAlign='right';ctx.fillStyle=G;ctx.fillText(DV.flags.fuel?'---':Math.round(fuelTotal/2).toLocaleString()+' KG',x+tankW,yy);
  });
  const gear=plane.gearPos>.9?'DOWN':plane.gearPos<.1?'UP':'TRANSIT';
  const statusItems=[
    ['HYD',faults.has('HYD_LOSS')?'LOW':'NORMAL',faults.has('HYD_LOSS')?R:G],
    ['ELEC',faults.has('ELEC_BUS')?'BUS FAULT':electricalPower()?'POWERED':'NO POWER',faults.has('ELEC_BUS')?R:electricalPower()?G:A],
    ['FUEL PUMPS',ENG.fuelPumps?'ON':'OFF',ENG.fuelPumps?G:A],
    ['APU',ENG.apu.running?'RUN':'OFF',ENG.apu.running?G:D],
    ['WING A/I',window._antiIceOn?'ON':'OFF',window._antiIceOn?G:D],
    ['EXT LIGHTS',window._navOn!==false?(window._strobeOn!==false?'NAV/STB ON':'NAV ON'):(window._strobeOn!==false?'STB ON':'OFF'),window._navOn!==false||window._strobeOn!==false?G:D],
    ['CABIN SIGNS',(window._belts?'BELT ':'')+(window._noSmoke===false?'':'NO SMK')||'OFF',window._belts?A:G],
    ['GEAR / FLAPS',gear+' / '+FLAPS[plane.flaps].name,gear==='TRANSIT'?A:C]
  ];
  const sx=W*.06,sy=H*.835,sw=W*.22,sh=H*.04;
  statusItems.forEach((it,i)=>{
    const x=sx+(i%4)*sw,y=sy+Math.floor(i/4)*sh;
    ctx.textAlign='left';ctx.fillStyle=C;ctx.font='bold '+font+'px monospace';ctx.fillText(it[0],x,y);
    ctx.textAlign='right';ctx.fillStyle=it[2];ctx.fillText(it[1],x+sw*.83,y);
  });
  const activeFaults=faults.list().filter(f=>!DSP.cancelled.includes(f)),alert=activeFaults.length?activeFaults.map(f=>FAULTS[f]?.label||f):[];
  const alertY=H*.963;
  ctx.fillStyle=alert.length?'#4a1111':'#10261a';ctx.fillRect(W*.045,H*.92,W*.91,H*.065);
  ctx.font='bold '+font+'px monospace';ctx.textAlign='center';
  ctx.fillStyle=alert.length?R:G;
  ctx.fillText(alert.length?alert.slice(0,2).join('  ·  ')+(alert.length>2?'  +'+(alert.length-2):''):'NO ACTIVE ALERTS',W/2,alertY);
}
let _screenAccum=0;
function drawScreens(hdg,pitch,bank){
  if(camMode!==1)return;
  const isAnalog=ANALOG_SET.has(window._activeModelId);
  try{setPanelCategory(isAnalog);}catch(e){}
  if(isAnalog){
    try{
      const n1L=ENG.L.n1||0,n1R=ENG.R.n1||0;
      drawClassicPanel(classicTex.getContext(),1536,420,hdg,pitch,bank,DV.spd,DV.alt,DV.vs,n1L,n1R,FLAPS[plane.flaps].name,plane.gearPos>0.9?'DN':(plane.gearPos<0.1?'UP':'TRANSIT'));
      classicTex.update(true);
    }catch(e){}
    return;
  }
  _screenAccum++;
  if(_screenAccum%3!==0)return;
  if(!electricalPower()){
    try{
      for(const d of Object.values(displays)){
        const c=d.getContext(),cv=c.canvas;c.fillStyle='#000';c.fillRect(0,0,cv.width,cv.height);
        c.fillStyle='#555';c.font='bold '+Math.round(cv.height*.045)+'px monospace';c.textAlign='center';
        c.fillText('DISPLAY POWER OFF',cv.width/2,cv.height/2);d.update(true);
      }
    }catch(e){}
    return;
  }
  if(faults.has('ELEC_BUS')){
    const t=performance.now()*0.001;
    if(Math.sin(t*9)>0.7){
      try{
        const keys=['pfdL','ndL','eicas','ndR','pfdR'];
        for(const k of keys){
          const d=displays[k];const c=d.getContext();const cv=c.canvas;
          c.fillStyle='#000';c.fillRect(0,0,cv.width,cv.height);
          c.fillStyle='#611';c.font='bold '+Math.round(cv.height*0.06)+'px monospace';c.textAlign='center';
          c.fillText('ELEC BUS OFF',cv.width/2,cv.height/2);d.update(true);
        }
      }catch(e){}
    }
    return;
  }
  try{
    const pfdL=displays.pfdL.getContext(),ndL=displays.ndL.getContext();
    const eicas=displays.eicas.getContext(),ndR=displays.ndR.getContext(),pfdR=displays.pfdR.getContext();
    if(faults.has('GEN_FAIL')){blankScr(displays.pfdL);blankScr(displays.ndL);}
    else{drawPFD(pfdL,pfdL.canvas.width,pfdL.canvas.height,hdg,pitch,bank,'L');drawND(ndL,ndL.canvas.width,ndL.canvas.height,hdg);}
    drawEICAS(eicas,eicas.canvas.width,eicas.canvas.height);
    drawND(ndR,ndR.canvas.width,ndR.canvas.height,hdg);
    drawPFD(pfdR,pfdR.canvas.width,pfdR.canvas.height,hdg,pitch,bank,'R');
    displays.pfdL.update(true);displays.ndL.update(true);displays.eicas.update(true);
    displays.ndR.update(true);displays.pfdR.update(true);
  }catch(e){}
}

/* ===== LIVERIES ===== */
const LIVS=[
 {n:'CLASSIC BLUE',nm:'SKYDECK',f:'bold 104px Arial',tc:[.04,.14,.4],b:[.97,.98,1],a:[.04,.14,.4],t:[.04,.14,.4],e:[.95,.95,1]},
 {n:'CRIMSON',nm:'CRIMSON',f:'bold 104px Arial',tc:[.55,.04,.08],b:[.98,.98,.98],a:[.75,.05,.1],t:[.75,.05,.1],e:[1,1,1],belly:[.76,.78,.8],rear:1},
 {n:'SUNSET',nm:'SUNSET AIR',f:'bold 96px Arial',tc:[.65,.22,.02],b:[.99,.97,.92],a:[.95,.45,.05],t:[.95,.45,.05],e:[.35,.1,.5],belly:[.95,.45,.05],rear:1},
 {n:'EMERALD',nm:'EMERALD',f:'bold 104px Arial',tc:[.02,.35,.2],b:[.97,.99,.97],a:[.02,.45,.25],t:[.02,.45,.25],e:[.95,.85,.25],rear:1},
 {n:'MIDNIGHT',nm:'MIDNIGHT',f:'bold 96px Arial',tc:[.9,.72,.28],b:[.12,.13,.16],a:[.85,.68,.2],t:[.05,.05,.07],e:[.85,.68,.2],belly:[.07,.08,.09],band:[.85,.68,.2]},
 {n:'MAPLE',nm:'MAPLE AIR',f:'bold 96px Arial',tc:[.68,.04,.08],b:[.99,.99,.99],a:[.8,.05,.1],t:[.8,.05,.1],e:[1,1,1],rear:1,band:[.8,.05,.1]},
 {n:'RETRO 70s',nm:'SKYDECK',f:'bold 104px Arial',tc:[.35,.2,.08],b:[.94,.91,.82],a:[.85,.45,.1],t:[.55,.3,.1],e:[.95,.8,.2],band:[.85,.45,.1]},
 {n:'LUFTHANSA',nm:'Lufthansa',f:'bold 104px Arial',tc:[.04,.07,.3],b:[.98,.99,1],a:[.04,.07,.3],t:[.04,.07,.3],e:[.98,.8,.1]},
 {n:'EMIRATES',nm:'Emirates',f:'italic 112px "Brush Script MT","Segoe Script",cursive',tc:[.72,.04,.08],b:[.99,.99,.98],a:[.78,.05,.08],t:[.78,.05,.08],e:[.85,.7,.3],band:[.85,.7,.3]},
 {n:'QANTAS',nm:'QANTAS',f:'italic bold 104px "Trebuchet MS"',tc:[.8,.04,.08],b:[.99,.99,.99],a:[.85,.05,.1],t:[.85,.05,.1],e:[1,1,1],belly:[.84,.85,.87]},
 {n:'AIR CANADA',nm:'AIR CANADA',f:'bold 96px Arial',tc:[.72,.04,.08],b:[.99,.99,.99],a:[.8,.05,.1],t:[.8,.05,.1],e:[1,1,1],belly:[.74,.76,.79],band:[.8,.05,.1]},
 {n:'DELTA',nm:'DELTA',f:'italic 900 104px "Arial Black",Impact',tc:[.0,.1,.35],b:[.98,.99,1],a:[.0,.1,.35],t:[.0,.1,.35],e:[.8,.1,.15],belly:[.72,.75,.79]},
 {n:'RYANAIR',nm:'RYANAIR',f:'bold 104px Arial',tc:[1,.85,.1],b:[.08,.2,.46],a:[1,.85,.1],t:[.05,.2,.55],e:[1,.85,.1],band:[1,.85,.1]},
 {n:'WESTJET',nm:'WESTJET',f:'bold 104px Arial',tc:[.0,.35,.43],b:[.98,.99,.99],a:[.0,.5,.55],t:[.0,.5,.55],e:[1,1,1]},
 {n:'SOUTHWEST',nm:'SOUTHWEST',f:'900 96px "Arial Black",Arial',tc:[.08,.18,.48],b:[.98,.99,1],a:[.9,.1,.1],t:[.08,.2,.55],e:[.98,.78,.1],band:[.98,.78,.1]},
 {n:'BRITISH AIRWAYS',nm:'BRITISH AIRWAYS',f:'italic bold 88px "Times New Roman",serif',tc:[.04,.1,.35],b:[.98,.99,1],a:[.04,.1,.35],t:[.04,.1,.35],e:[.8,.1,.15],belly:[.72,.75,.79]},
 {n:'SWISS',nm:'SWISS',f:'bold 104px Helvetica,Arial',tc:[.8,.04,.08],b:[.99,.99,.99],a:[.85,.05,.08],t:[.85,.05,.08],e:[1,1,1],rear:1}];
LIVS.push(
 {n:'ARCTIC',nm:'ARCTIC AIR',f:'bold 96px Arial',tc:[.02,.34,.43],b:[.98,.99,1],a:[.05,.5,.58],t:[.05,.5,.58],e:[.6,.9,.95],rear:1,belly:[.84,.89,.92]},
 {n:'DESERT',nm:'DESERT AIR',f:'bold 92px Arial',tc:[.48,.2,.07],b:[.98,.95,.87],a:[.72,.32,.12],t:[.72,.32,.12],e:[.95,.78,.4],rear:1,belly:[.8,.76,.67]},
 {n:'CARBON',nm:'CARBON',f:'bold 104px Arial',tc:[.08,.72,.48],b:[.17,.18,.2],a:[.1,.9,.6],t:[.06,.07,.08],e:[.1,.9,.6],belly:[.08,.09,.1]},
 {n:'CATHAY PACIFIC',nm:'CATHAY',nm2:'PACIFIC',f:'bold 82px Arial',tc:[.02,.26,.23],tc2:[.02,.26,.23],b:[.99,.99,.97],a:[.0,.27,.22],t:[.0,.24,.2],e:[.98,.99,.97],belly:[.78,.82,.8]},
 {n:'KLM ROYAL DUTCH AIRLINES',nm:'KLM',sub:'ROYAL DUTCH AIRLINES',f:'bold 128px Arial',tc:[.0,.2,.49],b:[.99,.99,1],a:[.0,.2,.52],t:[.0,.22,.56],e:[1,1,1],belly:[.84,.9,.96]});
const EXTRA={
 'CLASSIC BLUE':{cheat:[.04,.14,.4],pin:[.5,.65,.95],finst:'chev',nac:[.04,.14,.4]},
 'CRIMSON':{cheat:[.75,.05,.1],pin:[.5,.5,.52],finst:'tip',nac:[.75,.05,.1]},
 'SUNSET':{cheat:[.95,.45,.05],pin:[.35,.1,.5],finst:'chev',nac:[.95,.45,.05]},
 'EMERALD':{cheat:[.02,.45,.25],pin:[.95,.85,.25],finst:'tip',nac:[.02,.45,.25]},
 'MIDNIGHT':{cheat:[.85,.68,.2],pin:[.85,.68,.2],finst:'tip',nac:[.04,.04,.05]},
 'MAPLE':{cheat:[.8,.05,.1],pin:[.55,.55,.55],finst:'chev',nac:[.8,.05,.1]},
 'RETRO 70s':{cheat:[.85,.45,.1],pin:[.55,.3,.1],finst:'chev',nac:[.93,.9,.8]},
 'LUFTHANSA':{cheat:[.04,.07,.3],pin:[.98,.8,.1],finst:'tip',nac:[.97,.97,.98]},
 'EMIRATES':{cheat:[.78,.05,.08],pin:[.85,.7,.3],finst:'tip',nac:[.85,.7,.3]},
 'QANTAS':{cheat:[.85,.05,.1],pin:[.7,.7,.72],finst:'chev',nac:[.85,.05,.1]},
 'AIR CANADA':{cheat:[.8,.05,.1],pin:[.55,.55,.57],finst:'tip',nac:[.8,.05,.1]},
 'DELTA':{cheat:[.0,.1,.35],pin:[.8,.1,.15],finst:'chev',nac:[.0,.1,.35]},
 'RYANAIR':{cheat:[1,.85,.1],pin:[1,1,1],finst:'tip',nac:[.05,.2,.55]},
 'WESTJET':{cheat:[.0,.5,.55],pin:[.6,.85,.88],finst:'chev',nac:[.0,.5,.55]},
 'SOUTHWEST':{cheat:[.9,.1,.1],pin:[.98,.78,.1],finst:'chev',nac:[.1,.2,.6]},
 'BRITISH AIRWAYS':{cheat:[.04,.1,.35],pin:[.8,.1,.15],finst:'chev',nac:[.04,.1,.35]},
 'SWISS':{cheat:[.85,.05,.08],pin:[.7,.7,.7],finst:'tip',nac:[.85,.05,.08]},
 'ARCTIC':{cheat:[.05,.5,.58],pin:[.6,.9,.95],finst:'chev',nac:[.05,.5,.58]},
 'DESERT':{cheat:[.72,.32,.12],pin:[.95,.78,.4],finst:'chev',nac:[.72,.32,.12]},
 'CARBON':{cheat:[.1,.9,.6],pin:[.1,.9,.6],finst:'tip',nac:[.06,.07,.08]},
 'CATHAY PACIFIC':{cheat:[.0,.27,.22],pin:[.12,.62,.56],finst:'tip',nac:[.0,.27,.22],
   finfn:(f,S)=>{f.save();f.fillStyle='#f8fbf8';for(let i=0;i<4;i++){const y=.34+i*.075;f.beginPath();f.moveTo(S*.3,S*(y+.28));f.quadraticCurveTo(S*.46,S*(y+.12),S*.7,S*(y-.12));f.quadraticCurveTo(S*.51,S*(y+.16),S*.3,S*(y+.28));f.closePath();f.fill();}f.restore();}},
 'KLM ROYAL DUTCH AIRLINES':{cheat:[.0,.2,.52],pin:[.0,.62,.86],finst:'tip',nac:[.0,.2,.52],
   finfn:(f,S)=>{f.save();f.fillStyle='#fff';f.beginPath();f.moveTo(S*.25,S*.35);f.lineTo(S*.34,S*.35);f.lineTo(S*.37,S*.23);f.lineTo(S*.43,S*.32);f.lineTo(S*.5,S*.19);f.lineTo(S*.57,S*.32);f.lineTo(S*.63,S*.23);f.lineTo(S*.66,S*.35);f.lineTo(S*.75,S*.35);f.lineTo(S*.75,S*.39);f.lineTo(S*.25,S*.39);f.closePath();f.fill();f.font='bold 76px Arial';f.textAlign='center';f.textBaseline='middle';f.fillText('KLM',S*.5,S*.62);f.restore();}}
};
LIVS.forEach(L=>Object.assign(L,EXTRA[L.n]||{}));
const c3=a=>new BABYLON.Color3(a[0],a[1],a[2]),css=a=>'rgb('+a.map(v=>Math.round(v*255)).join(',')+')';
M.fus=M.body.clone('fusM');M.tail=M.accent.clone('tailM');
fuselage.material=M.fus;fin.material=M.tail;
const fusTex=new BABYLON.DynamicTexture('fusTex',{width:512,height:2048},scene,true);
const embs=[1,-1].map(sg=>{const d=BABYLON.MeshBuilder.CreateDisc('emb'+sg,{radius:.95,tessellation:32,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
  d.rotation.y=Math.PI/2;d.position.set(sg*.2,4.4,-16.4);d.parent=exteriorRoot;
  const m=new BABYLON.StandardMaterial('embM'+sg,scene);m.disableLighting=true;d.material=m;return m;});
const nameTex=new BABYLON.DynamicTexture('nameTex',{width:1536,height:192},scene,true);nameTex.hasAlpha=true;
const nameMat=new BABYLON.StandardMaterial('nameM',scene);nameMat.diffuseTexture=nameTex;nameMat.useAlphaFromDiffuseTexture=true;
nameMat.emissiveTexture=nameTex;nameMat.disableLighting=true;nameMat.specularColor=BABYLON.Color3.Black();nameMat.backFaceCulling=false;nameMat.zOffset=-4;
const namePlanes=[1,-1].map(sg=>{const q=BABYLON.MeshBuilder.CreatePlane('name'+sg,{width:9.6,height:.95},scene);
  q.rotation.x=.43;q.rotation.y=sg>0?-Math.PI/2:Math.PI/2;q.position.set(sg*1.803,.913,3);q.parent=exteriorRoot;q.material=nameMat;q.isPickable=false;return q;});

const FUS_P=[[18,.15,.02],[17,.75,-.02],[16,1.15,-.05],[14.5,1.6,-.1],[12,1.85,-.1],[9,1.95,-.05],[5,1.98,0],[0,1.98,0],[-5,1.95,0],[-10,1.8,.05],[-13,1.45,.1],[-15,1.05,.2],[-16.5,.65,.35],[-17.5,.3,.45],[-18.2,.08,.5]];
const FUS_V=(()=>{const v=[0];for(let i=1;i<FUS_P.length;i++){const a=FUS_P[i-1],b=FUS_P[i];v.push(v[i-1]+Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]));}const T=v[v.length-1];return v.map(x=>x/T);})();
function fusV(z){for(let i=0;i<FUS_P.length-1;i++){const a=FUS_P[i][0],b=FUS_P[i+1][0];if(z<=a&&z>=b){const t=(a-z)/(a-b);return FUS_V[i]+t*(FUS_V[i+1]-FUS_V[i]);}}return z>18?0:1;}
function paintWindows(g,W,H){
  const rr=(x,y,w,h,rad)=>{w=Math.abs(w);h=Math.abs(h);const r=Math.max(0,Math.min(rad,w/2,h/2));g.beginPath();g.moveTo(x+r,y);g.lineTo(x+w-r,y);g.arcTo(x+w,y,x+w,y+r,r);g.lineTo(x+w,y+h-r);g.arcTo(x+w,y+h,x+w-r,y+h,r);g.lineTo(x+r,y+h);g.arcTo(x,y+h,x,y+h-r,r);g.lineTo(x,y+r);g.arcTo(x,y,x+r,y,r);g.closePath();};
  const win=(z,xc,wpx,hz)=>{const y1=H*(1-fusV(z+hz)),y2=H*(1-fusV(z-hz)),yb=Math.min(y1,y2),ya=Math.max(y1,y2),h=ya-yb,x=xc-wpx/2,rad=Math.max(0,Math.min(4,wpx*.3,h*.3));
    g.fillStyle='rgba(30,34,40,.6)';rr(x-2.5,yb-2.5,wpx+5,h+5,rad+2);g.fill();
    g.fillStyle='#0a131d';rr(x,yb,wpx,h,rad);g.fill();
    const grd=g.createLinearGradient(0,yb,0,ya);
    grd.addColorStop(0,'rgba(150,190,225,.55)');grd.addColorStop(.35,'rgba(90,120,150,.22)');grd.addColorStop(1,'rgba(10,14,20,.05)');
    g.fillStyle=grd;rr(x,yb,wpx,h,rad);g.fill();
    g.fillStyle='rgba(255,255,255,.16)';rr(x+1,yb+1,wpx*.3,h-2,rad*.6);g.fill();
    g.strokeStyle='rgba(15,17,20,.5)';g.lineWidth=1;rr(x,yb,wpx,h,rad);g.stroke();};
  for(let z=12.6;z>-10.4;z-=.53){for(const xc of [W*.032,W*.468])win(z,xc,15,.125);}
  for(const xc of [W*.05,W*.45]){win(15.55,xc,17,.42);win(14.75,xc,15,.3);}
}
let curLiv=0;
const rgba=(a,al)=>'rgba('+a.map(v=>Math.round(v*255)).join(',')+','+al+')';
const finTex=new BABYLON.DynamicTexture('finTex',{width:512,height:512},scene,true);
function paintStripe(g,xc,w,H,col){
  g.fillStyle=col;g.beginPath();
  g.moveTo(xc-w*.12,H*.04);g.quadraticCurveTo(xc-w*.55,H*.4,xc-w*.8,H*.9);
  g.quadraticCurveTo(xc-w*.42,H*.96,xc-w*.1,H*.94);
  g.quadraticCurveTo(xc+w*.55,H*.4,xc+w*.8,H*.1);
  g.quadraticCurveTo(xc+w*.42,H*.04,xc+w*.12,H*.04);
  g.closePath();g.fill();
}
function applyLivery(i){
  curLiv=((i%LIVS.length)+LIVS.length)%LIVS.length;const L=LIVS[curLiv];
  M.body.albedoColor=c3(L.b);M.accent.albedoColor=c3(L.a);
  if(!M.nac){M.nac=M.body.clone('nacM');['nac1','nac-1'].forEach(n=>{const m=scene.getMeshByName(n);if(m)m.material=M.nac;});}
  M.nac.albedoColor=c3(L.nac||L.b);
  const g=fusTex.getContext(),W=512,H=2048;
  g.clearRect(0,0,W,H);
  g.fillStyle=css(L.b);g.fillRect(0,0,W,H);
  let gr=g.createLinearGradient(W*.5,0,W,0);
  gr.addColorStop(0,'rgba(70,80,95,0)');gr.addColorStop(.5,'rgba(70,80,95,.30)');gr.addColorStop(1,'rgba(70,80,95,0)');
  g.fillStyle=gr;g.fillRect(W*.5,0,W*.5,H);
  if(L.belly){
    gr=g.createLinearGradient(W*.5,0,W,0);
    gr.addColorStop(0,rgba(L.belly,0));gr.addColorStop(.16,rgba(L.belly,1));gr.addColorStop(.84,rgba(L.belly,1));gr.addColorStop(1,rgba(L.belly,0));
    g.fillStyle=gr;g.fillRect(W*.5,H*.07,W*.5,H*.88);
  }
  if(L.rear){
    const edge=u=>H*(.2+.1*(1+Math.cos(4*Math.PI*u))/2);
    g.fillStyle=css(L.t);g.beginPath();g.moveTo(0,0);
    for(let k=0;k<=96;k++){const u=k/96;g.lineTo(u*W,edge(u));}
    g.lineTo(W,0);g.closePath();g.fill();
    g.strokeStyle=css(L.e);g.lineWidth=5;g.beginPath();
    for(let k=0;k<=96;k++){const u=k/96;if(k===0)g.moveTo(0,edge(0)+12);else g.lineTo(u*W,edge(u)+12);}
    g.stroke();
  }
  if(L.cheat){
    for(const xc of [0,W*.5,W])paintStripe(g,xc,W*.016,H,css(L.cheat));
    if(L.pin){
      for(const xc of [0,W*.5,W]){const off=(xc===W*.5?1:-1)*W*.042;paintStripe(g,xc+off,W*.004,H,css(L.pin));}
    }
  }
  if(L.band){g.fillStyle=css(L.band);for(const u of [0,.5,1])g.fillRect((u-.012)*W,0,W*.024,H);}
  g.strokeStyle='rgba(0,0,0,.075)';g.lineWidth=1.3;
  for(let k=1;k<46;k++){const y=H*k/46;g.beginPath();g.moveTo(0,y);g.lineTo(W,y);g.stroke();}
  g.strokeStyle='rgba(0,0,0,.045)';
  for(const x of [.1,.18,.32,.4,.6,.68,.82,.9]){g.beginPath();g.moveTo(W*x,0);g.lineTo(W*x,H);g.stroke();}
  g.strokeStyle='rgba(0,0,0,.28)';g.lineWidth=2;
  for(const xc of [W*.025,W*.475]){for(const yy of [H*.83,H*.2]){g.strokeRect(xc-W*.012,yy,W*.024,H*.032);}}
  try{paintWindows(g,W,H);}catch(e){console.error('windows',e);}
  fusTex.update();M.fus.albedoTexture=fusTex;M.fus.albedoColor=BABYLON.Color3.White();
  M.fus.environmentIntensity=M.body.environmentIntensity;

  const f=finTex.getContext(),FS=512;
  f.fillStyle=css(L.t);f.fillRect(0,0,FS,FS);
  const fg=f.createLinearGradient(0,FS,0,0);fg.addColorStop(0,'rgba(0,0,0,.16)');fg.addColorStop(1,'rgba(255,255,255,.10)');
  f.fillStyle=fg;f.fillRect(0,0,FS,FS);
  const motif=(mx)=>{
    f.save();if(mx){f.translate(FS,0);f.scale(-1,1);}
    f.fillStyle=css(L.e);
    if(L.finst==='tip'){f.beginPath();f.moveTo(0,0);f.lineTo(FS*.5,0);f.lineTo(FS*.5,FS*.1);f.lineTo(0,FS*.26);f.closePath();f.fill();}
    else if(L.finst==='chev'){f.beginPath();f.moveTo(FS*.02,FS*.9);f.lineTo(FS*.14,FS*.9);f.lineTo(FS*.5,FS*.08);f.lineTo(FS*.5,FS*.0);f.lineTo(FS*.36,FS*.0);f.closePath();f.fill();}
    if(L.finfn)L.finfn(f,FS);
    f.restore();
  };
  motif(false);motif(true);
  finTex.update();M.tail.albedoTexture=finTex;M.tail.albedoColor=BABYLON.Color3.White();

  embs.forEach(m=>m.emissiveColor=c3(L.e));
  const g2=nameTex.getContext();g2.clearRect(0,0,1536,192);
  if(L.nm){g2.save();g2.font=L.f||'bold 104px Arial';const w=g2.measureText(L.nm+(L.nm2||'')).width,k=Math.min(1.4,1450/w);
    g2.translate(768,61);g2.scale(k,1);g2.textAlign='center';g2.textBaseline='middle';
    g2.shadowColor='rgba(0,0,0,.25)';g2.shadowBlur=6;g2.shadowOffsetY=2;
    if(L.nm2){g2.textAlign='left';const w1=g2.measureText(L.nm).width,w2=g2.measureText(L.nm2).width;let x0=-(w1+w2)/2;
      g2.fillStyle=css(L.tc||L.a);g2.fillText(L.nm,x0,0);g2.fillStyle=css(L.tc2||L.tc||L.a);g2.fillText(L.nm2,x0+w1,0);}
    else{g2.fillStyle=css(L.tc||L.a);g2.fillText(L.nm,0,0);}g2.restore();
    if(L.sub){g2.save();g2.font='bold 22px Arial';const sw=g2.measureText(L.sub).width,sk=Math.min(1,1400/sw);
      g2.translate(768,151);g2.scale(sk,1);g2.textAlign='center';g2.textBaseline='middle';g2.fillStyle=css(L.tc||L.a);g2.fillText(L.sub,0,0);g2.restore();}}
  nameTex.update();namePlanes.forEach(q=>q.setEnabled(!!L.nm));
  try{if(window.liveryOthers)window.liveryOthers();}catch(e){console.error('liveryOthers',e);}
}
const liverySel=document.getElementById('liverySel');
LIVS.forEach((L,i)=>{const o=document.createElement('option');o.value=i;o.textContent=L.n;liverySel.appendChild(o);});
liverySel.addEventListener('change',()=>applyLivery(+liverySel.value));
window.addEventListener('keydown',e=>{if(e.code==='KeyL'&&e.shiftKey&&overlay.classList.contains('hidden')){applyLivery(curLiv+1);liverySel.value=curLiv;showMsg('LIVERY · '+LIVS[curLiv].n,2000);}});
applyLivery(0);
  status('terrain');
const N=CFG.terrainGrid,E=CFG.terrainExtent,step=E/(N-1);
const positions=new Float32Array(N*N*3);
const normals=new Float32Array(N*N*3);
const uvs=new Float32Array(N*N*2);
const heights=new Float32Array(N*N);
for(let j=0;j<N;j++)for(let i=0;i<N;i++){const k=(j*N+i)*2;uvs[k]=i/(N-1);uvs[k+1]=j/(N-1);}
const idxArr=(()=>{const a=new Uint32Array((N-1)*(N-1)*6);let p=0;
  for(let j=0;j<N-1;j++)for(let i=0;i<N-1;i++){const k=j*N+i,k1=k+1,k2=k+N,k3=k2+1;
    a[p++]=k;a[p++]=k2;a[p++]=k1;a[p++]=k1;a[p++]=k2;a[p++]=k3;}return a;})();

let terrainTex=new BABYLON.DynamicTexture('terrainTex',{width:CFG.texSize,height:CFG.texSize},scene,true);
terrainTex.wrapU=BABYLON.Texture.CLAMP_ADDRESSMODE;terrainTex.wrapV=BABYLON.Texture.CLAMP_ADDRESSMODE;
terrainTex.anisotropicFilteringLevel=16;
const terrainMat=new BABYLON.PBRMaterial('terrainMat',scene);
terrainMat.albedoTexture=terrainTex;terrainMat.metallic=0;terrainMat.roughness=1;
terrainMat.specularIntensity=.06;terrainMat.backFaceCulling=false;
const terrainMesh=new BABYLON.Mesh('terrain',scene);
terrainMesh.material=terrainMat;terrainMesh.isPickable=false;terrainMesh.alwaysSelectAsActiveMesh=true;
const terrainVD=new BABYLON.VertexData();
const colors=new Float32Array(N*N*4).fill(1);terrainVD.colors=colors;terrainVD.positions=positions;terrainVD.normals=normals;terrainVD.uvs=uvs;terrainVD.indices=idxArr;
terrainVD.applyToMesh(terrainMesh,true);
let terrainCenter={x:0,z:0};

/* ===== LOADING SCREEN ===== */
const LS={el:null,bar:null,txt:null,pct:null,tip:null,tipIv:null};
const LS_TIPS=['Keep airspeed above V2 until you have a positive climb.','Use the ATC panel (K) to request taxi and takeoff clearance.','Check the FMS / MAP (J) for your route and waypoints.','Set flaps and gear from the buttons above the attitude indicator.','Short fields need early flaps and firm braking.'];
function lsCreate(){
  lsHide(true);
  if(!document.getElementById('lsStyle')){const st=document.createElement('style');st.id='lsStyle';st.textContent=
    '#loadScreen{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at center,#14233d 0%,#070b14 75%);transition:opacity .5s;font-family:Inter,Segoe UI,system-ui,sans-serif;color:#e6edf6}'+
    '#loadScreen.ls-out{opacity:0;pointer-events:none}'+
    '.ls-card{width:min(440px,86vw);text-align:center}'+
    '.ls-plane{font-size:46px;animation:ls-fly 2.4s ease-in-out infinite;display:inline-block;color:#22d3ee}'+
    '@keyframes ls-fly{0%,100%{transform:translateY(0) rotate(-6deg)}50%{transform:translateY(-8px) rotate(6deg)}}'+
    '.ls-title{margin-top:10px;font-size:13px;letter-spacing:4px;font-weight:700;color:#a5f3fc}'+
    '.ls-txt{margin:14px 0 16px;font-size:14px;color:#94a3b8;min-height:18px}'+
    '.ls-track{height:8px;border-radius:6px;background:rgba(100,130,170,.18);overflow:hidden;border:1px solid rgba(100,130,170,.3)}'+
    '.ls-bar{height:100%;width:0%;background:linear-gradient(90deg,#0891b2,#22d3ee);box-shadow:0 0 12px rgba(34,211,238,.6);transition:width .25s ease-out}'+
    '.ls-row{display:flex;justify-content:space-between;gap:12px;margin-top:10px;font-size:12px;color:#64748b}'+
    '.ls-pct{font-weight:700;color:#a5f3fc;min-width:40px;text-align:left}'+
    '.ls-tip{text-align:right;font-style:italic}';
    document.head.appendChild(st);}
  const el=document.createElement('div');el.id='loadScreen';
  el.innerHTML='<div class="ls-card"><div class="ls-plane">✈</div><div class="ls-title">BABYLON FLIGHT 737</div><div class="ls-txt">Preparing…</div><div class="ls-track"><div class="ls-bar"></div></div><div class="ls-row"><span class="ls-pct">0%</span><span class="ls-tip"></span></div></div>';
  document.body.appendChild(el);
  LS.el=el;LS.bar=el.querySelector('.ls-bar');LS.txt=el.querySelector('.ls-txt');LS.pct=el.querySelector('.ls-pct');LS.tip=el.querySelector('.ls-tip');
  let i=0;LS.tip.textContent='Tip: '+LS_TIPS[0];
  LS.tipIv=setInterval(()=>{i=(i+1)%LS_TIPS.length;LS.tip.textContent='Tip: '+LS_TIPS[i];},3000);
  lsProgress(0,'Starting engines…');
}
function lsProgress(frac,label){
  if(!LS.el)return;
  const f=Math.max(0,Math.min(1,frac));
  LS.bar.style.width=(f*100).toFixed(1)+'%';
  LS.pct.textContent=Math.round(f*100)+'%';
  if(label)LS.txt.textContent=label;
}
function lsHide(instant){
  if(LS.tipIv){clearInterval(LS.tipIv);LS.tipIv=null;}
  const el=LS.el;if(!el)return;LS.el=null;
  if(instant){el.remove();return;}
  el.classList.add('ls-out');setTimeout(()=>el.remove(),600);
}
/* imagery progress, read by the start-up gate */
const imgProg={f:0,t:0};
function imgGate(frac,capMs){return new Promise(res=>{const t0=performance.now();const iv=setInterval(()=>{if((imgProg.t&&imgProg.f/imgProg.t>=frac)||performance.now()-t0>capMs){clearInterval(iv);res();}},150);});}

/* Tiles are drawn into an offscreen canvas as they arrive. When live (start-up), the
   DynamicTexture is refreshed every ~400ms so the terrain fills in progressively. */
async function buildTerrainTexture(cx,cz,live){
  const nw=worldToLL(cx-E/2,cz-E/2),se=worldToLL(cx+E/2,cz+E/2);
  let z=Math.min(Imagery.maxZoom,19),r;
  while(z>5){r=tileRange(nw,se,z);if((r.x1-r.x0+1)*(r.y1-r.y0+1)<=CFG.maxImageryTiles)break;z--;}
  const C=CFG.texSize;
  const off=document.createElement('canvas');off.width=C;off.height=C;
  const oc=off.getContext('2d');
  oc.fillStyle='#2c4a55';oc.fillRect(0,0,C,C);
  try{oc.filter='saturate(1.22) contrast(1.07) brightness(1.03)';}catch(e){}
  const coords=[];
  for(let tx=r.x0;tx<=r.x1;tx++)for(let ty=r.y0;ty<=r.y1;ty++)coords.push({tx,ty});
  const total=coords.length;imgProg.f=0;imgProg.t=total;
  let drawn=0,lastPush=0;
  const push=(force)=>{
    const t=performance.now();
    if(!force&&(!live||t-lastPush<400))return;
    lastPush=t;
    terrainTex.getContext().drawImage(off,0,0,C,C);
    terrainTex.update(false);
  };
  const jobs=coords.map(({tx,ty})=>loadImage(`${Imagery.mode}/${useCanadaImagery?'ca':'ww'}/${z}/${tx}/${ty}`,Imagery.url(z,tx,ty),OFFMAP.imgKey(!!getCanadaRegionForTile(z,tx,ty),z,tx,ty)).then(img=>{
    imgProg.f++;
    if(img){
      drawn++;
      const p0=llToWorld(ty2lat(ty,z),tx2lon(tx,z)),p1=llToWorld(ty2lat(ty+1,z),tx2lon(tx+1,z));
      const px=(p0.x-(cx-E/2))/E*C,py=(p0.z-(cz-E/2))/E*C;
      const pw=(p1.x-p0.x)/E*C,ph=(p1.z-p0.z)/E*C;
      try{oc.drawImage(img,px,py,pw+.5,ph+.5);}catch(e){}
    }
    if(live){push(false);lsProgress(0.3+0.7*imgProg.f/total,'Streaming imagery '+imgProg.f+' / '+total);}
  }));
  await Promise.all(jobs);
  try{oc.filter='none';}catch(e){}
  push(true);
  return drawn;
}
/* ===== REAL-WORLD LANDMARKS =====
   Positioned from real lat/lon relative to the current departure airport (the world origin).
   Only shown when within 40 km. Heights are approximate (metres). */
const LANDMARKS=[
  {name:'CN Tower · Toronto',lat:43.6426,lon:-79.3871,parts:[
    {t:'cyl',db:22,dt:9,h:350,y0:0,c:[.86,.86,.86],n:16},
    {t:'sph',d:30,y:350,c:[.82,.82,.84]},
    {t:'cyl',db:9,dt:1.5,h:203,y0:350,c:[.8,.8,.82],n:12,glow:[.9,.2,.2]}]},
  {name:'Bank of China Tower · Hong Kong',lat:22.2793,lon:114.1622,parts:[
    {t:'box',w:44,d:44,h:367,y0:0,c:[.5,.56,.6],tex:true},
    {t:'cyl',db:1.6,dt:.4,h:40,y0:367,c:[.7,.72,.74],n:6}]},
  {name:'ICC · Hong Kong',lat:22.3033,lon:114.1602,parts:[
    {t:'box',w:50,d:50,h:484,y0:0,c:[.55,.6,.66],tex:true}]},
  {name:'Tokyo Skytree',lat:35.7101,lon:139.8107,parts:[
    {t:'cyl',db:62,dt:12,h:530,y0:0,c:[.92,.93,.95],n:3},
    {t:'cyl',db:8,dt:2,h:104,y0:530,c:[.85,.86,.9],n:8,glow:[.9,.95,1]}]},
  {name:'Tokyo Tower',lat:35.6586,lon:139.7454,parts:[
    {t:'cyl',db:14,dt:3,h:333,y0:0,c:[.9,.45,.2],n:4}]},
  {name:'Burj Khalifa · Dubai',lat:25.1972,lon:55.2744,parts:[
    {t:'cyl',db:40,dt:4,h:828,y0:0,c:[.78,.84,.88],n:3,tex:true},
    {t:'cyl',db:3,dt:.5,h:40,y0:828,c:[.8,.84,.88],n:6,glow:[1,.95,.8]}]},
  {name:'Taipei 101',lat:25.0330,lon:121.5645,parts:[
    {t:'box',w:40,d:40,h:440,y0:0,c:[.2,.6,.45],tex:true},
    {t:'cyl',db:6,dt:1,h:68,y0:440,c:[.6,.7,.7],n:8}]},
  {name:'Empire State Building',lat:40.7484,lon:-73.9857,parts:[
    {t:'box',w:40,d:60,h:381,y0:0,c:[.8,.8,.78],tex:true},
    {t:'cyl',db:6,dt:1,h:62,y0:381,c:[.8,.8,.8],n:8,glow:[.95,.75,.2]}]},
  {name:'Eiffel Tower',lat:48.8584,lon:2.2945,parts:[
    {t:'cyl',db:90,dt:10,h:330,y0:0,c:[.35,.28,.2],n:4,glow:[1,.78,.35]}]},
  {name:'Petronas Towers',lat:3.1579,lon:101.7116,parts:[
    {t:'box',w:42,d:42,h:452,y0:0,c:[.85,.87,.88],tex:true},
    {t:'cyl',db:4,dt:.6,h:40,y0:452,c:[.85,.87,.88],n:6}]},
  {name:'Statue of Liberty · New York',lat:40.6892,lon:-74.0445,parts:[
    {t:'box',w:30,d:30,h:47,y0:0,c:[.58,.55,.48]},                          // granite pedestal
    {t:'cyl',db:21,dt:15,h:21,y0:47,c:[.4,.6,.54],n:12},                    // robe / base
    {t:'cyl',db:15,dt:8,h:17,y0:68,c:[.42,.62,.56],n:10},                   // torso
    {t:'sph',d:7.5,y:89,c:[.44,.63,.57]},                                  // head
    {t:'cyl',db:1.6,dt:1.2,h:13,y0:76,x:6,z:2,c:[.4,.6,.54],n:6},          // raised arm
    {t:'sph',d:4.2,y:93,x:6,z:2,c:[1,.86,.4],glow:[1,.82,.3]}]},           // torch flame
  {name:'Leaning Tower of Pisa',lat:43.7230,lon:10.3966,tilt:0.068,parts:[
    {t:'cyl',db:15.5,dt:15.5,h:48,y0:0,c:[.92,.88,.78],n:16},
    {t:'cyl',db:17,dt:17,h:7,y0:48,c:[.9,.86,.76],n:16},
    {t:'cyl',db:9,dt:2,h:4,y0:55,c:[.55,.5,.4],n:12}]}
];
let lmMeshes=null,lmTexSeed=0;
function lmBuild(){
  if(lmMeshes)return;
  lmMeshes=LANDMARKS.map(L=>{
    const root=new BABYLON.TransformNode('lm_'+L.name,scene);
    if(L.tilt){root.rotationQuaternion=null;root.rotation.z=L.tilt;}
    L.parts.forEach((p,k)=>{
      const mat=new BABYLON.StandardMaterial('lmM_'+L.name+'_'+k,scene);
      mat.diffuseColor=new BABYLON.Color3(p.c[0],p.c[1],p.c[2]);
      mat.specularColor=new BABYLON.Color3(.18,.18,.2);mat.specularPower=32;
      if(p.tex){const ny=Math.max(3,Math.round((p.h||40)/11)),tx=winTex(ny,++lmTexSeed+100);tx.uScale=Math.max(1,Math.round((p.w||p.db||30)/11));tx.vScale=ny;
        mat.diffuseTexture=tx;mat.emissiveTexture=tx;mat.emissiveColor=new BABYLON.Color3(.22,.22,.22);}
      if(p.glow){mat.emissiveColor=new BABYLON.Color3(p.glow[0],p.glow[1],p.glow[2]).scale(.8);}
      let m;
      if(p.t==='cyl'){m=BABYLON.MeshBuilder.CreateCylinder('lp',{height:p.h,diameterTop:p.dt,diameterBottom:p.db,tessellation:p.n||12},scene);m.position.set(p.x||0,p.y0+p.h/2,p.z||0);}
      else if(p.t==='box'){m=BABYLON.MeshBuilder.CreateBox('lp',{width:p.w,height:p.h,depth:p.d},scene);m.position.set(p.x||0,p.y0+p.h/2,p.z||0);}
      else{m=BABYLON.MeshBuilder.CreateSphere('lp',{diameter:p.d,segments:12},scene);m.position.set(p.x||0,p.y,p.z||0);}
      m.material=mat;m.parent=root;m.isPickable=false;m.alwaysSelectAsActiveMesh=true;
    });
    root.setEnabled(false);
    return {L,root};
  });
}
function placeLandmarks(){
  lmBuild();
  for(const {L,root} of lmMeshes){
    const w=llToWorld(L.lat,L.lon);
    if(Math.hypot(w.x,w.z)>40000){root.setEnabled(false);continue;}
    const y=sampleTerrain(w.x,w.z)||0;
    root.position.set(w.x,y,w.z);root.setEnabled(true);
  }
}
function rebuildGeom(cx,cz){
  for(let j=0;j<N;j++){const wz=cz-E/2+j*step;
    for(let i=0;i<N;i++){const wx=cx-E/2+i*step;let hv=Math.max(sampleTerrain(wx,wz),-80);
      {const ab=airportBlend(wx,wz);if(ab){const tgt=runwayY-.3*Math.min(1,ab.e/60)-.15;hv=hv*(1-ab.w)+tgt*ab.w;}}
      heights[j*N+i]=hv;}}
  for(let j=0;j<N;j++)for(let i=0;i<N;i++){
    const k=(j*N+i)*3;
    positions[k]=-E/2+i*step;positions[k+1]=heights[j*N+i];positions[k+2]=-E/2+j*step;
    const i0=Math.max(i-1,0),i1=Math.min(i+1,N-1),j0=Math.max(j-1,0),j1=Math.min(j+1,N-1);
    const dx=(heights[j*N+i1]-heights[j*N+i0])/((i1-i0)*step);
    const dz=(heights[j1*N+i]-heights[j0*N+i])/((j1-j0)*step);
    let nx=-dx,ny=1,nz=-dz;const len=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;
    normals[k]=nx/len;normals[k+1]=ny/len;normals[k+2]=nz/len;
    {const sl=Math.min(1,Math.max(0,(1-normals[k+1])*3.2)),ao=1-.4*sl,k4=(j*N+i)*4;
     colors[k4]=ao*(1+.07*sl);colors[k4+1]=ao*(1-.01*sl);colors[k4+2]=ao*(1-.12*sl);colors[k4+3]=1;}
  }
  terrainMesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind,positions);
  terrainMesh.updateVerticesData(BABYLON.VertexBuffer.NormalKind,normals);
  terrainMesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind,colors);
  try{buildCity(cx,cz);}catch(e){console.error(e);}
  try{placeLandmarks();}catch(e){console.error(e);}
}
let rebuildBusy=false;
async function rebuildTerrainAsync(cx,cz){
  if(rebuildBusy)return;rebuildBusy=true;
  try{await ensureHeightTiles(cx,cz);await buildTerrainTexture(cx,cz);rebuildGeom(cx,cz);terrainMesh.position.set(cx,0,cz);terrainCenter={x:cx,z:cz};}
  catch(e){}finally{rebuildBusy=false;}
}

let waterMesh=null;
function makeWaterBumpTex(){
  const S=256;
  const dt=new BABYLON.DynamicTexture('waterBump',{width:S,height:S},scene,false);
  const ctx=dt.getContext(),id=ctx.createImageData(S,S);
  const h=(x,y)=>Math.sin(x*.25)+Math.sin(y*.19+1.3)+.5*Math.sin((x+y)*.11+2.1)+.3*Math.sin((x-y)*.33);
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    const dx=(h(x+1,y)-h(x-1,y))*.5,dy=(h(x,y+1)-h(x,y-1))*.5;
    let nx=-dx,ny=-dy,nz=1;const len=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;nx/=len;ny/=len;nz/=len;
    const idx=(y*S+x)*4;
    id.data[idx]=((nx*.5+.5)*255)|0;id.data[idx+1]=((ny*.5+.5)*255)|0;id.data[idx+2]=((nz*.5+.5)*255)|0;id.data[idx+3]=255;
  }
  ctx.putImageData(id,0,0);dt.update(false);
  dt.wrapU=dt.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;
  return dt;
}
function createWater(){
  if(waterMesh)return;
  waterMesh=BABYLON.MeshBuilder.CreateGround('water',{width:260000,height:260000,subdivisions:2},scene);
  waterMesh.isPickable=false;waterMesh.position.y=-2.5;
  const m=new BABYLON.PBRMaterial('waterFB',scene);
  m.albedoColor=new BABYLON.Color3(.025,.14,.17);m.metallic=.85;m.roughness=.16;m.environmentIntensity=1.35;
  try{
    const bump=makeWaterBumpTex();bump.uScale=bump.vScale=520;m.bumpTexture=bump;m.bumpTexture.level=.55;
    scene.registerBeforeRender(()=>{const t=performance.now()*.000018;bump.uOffset=t;bump.vOffset=t*.63;});
  }catch(e){}
  waterMesh.material=m;
}
function makeCloudTex(seed,softness){
  const S=256;
  const dt=new BABYLON.DynamicTexture('clT'+seed,{width:S,height:S},scene,true);
  const ctx=dt.getContext();
  const id=ctx.createImageData(S,S);
  const hash=(x,y)=>{let h=(x*374761393+y*668265263+seed*1274126177)|0;h=(h^(h>>13))|0;h=Math.imul(h,1274126177);return((h^(h>>16))>>>0)/4294967295;};
  const sm=t=>t*t*(3-2*t);
  const vn=(x,y)=>{const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
    const u=sm(xf),v=sm(yf);const a=hash(xi,yi),b=hash(xi+1,yi),c2=hash(xi,yi+1),d=hash(xi+1,yi+1);
    return(a*(1-u)+b*u)*(1-v)+(c2*(1-u)+d*u)*v;};
  const fbm=(x,y)=>{let v=0,a=.5,f=1;for(let o=0;o<6;o++){v+=a*vn(x*f,y*f);f*=2.03;a*=.5;}return v;};
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    const n=fbm(x/(38*softness),y/(38*softness));
    const dx=(x/S-.5)*2,dy=(y/S-.5)*2,rad=Math.sqrt(dx*dx+dy*dy);
    const fall=Math.max(0,1-rad*rad*1.05);
    let a=(n-.42)*3.1;a=Math.max(0,Math.min(1,a))*fall;a=a*a*(3-2*a);
    const warm=Math.min(1,Math.max(0,(n-.55)*3));
    const sh=225+30*n;
    const r=Math.min(255,sh+warm*25);const g=Math.min(255,sh+warm*15);const b=Math.min(255,sh+5+warm*8);
    const o=(y*S+x)*4;
    id.data[o]=r;id.data[o+1]=g;id.data[o+2]=b;id.data[o+3]=Math.floor(a*255);
  }
  ctx.putImageData(id,0,0);dt.update(false);dt.hasAlpha=true;return dt;
}
const cloudRoot=new BABYLON.TransformNode('cloudRoot',scene);
const cloudMaterials=[];
function createClouds(){
  const texA=makeCloudTex(7,1.0);
  const texB=makeCloudTex(13,1.4);
  const texC=makeCloudTex(23,1.8);
  const layers=[
    {count:16,minY:2400,maxY:3400,minSize:2200,maxSize:4800,tex:texA},
    {count:14,minY:3600,maxY:5000,minSize:2800,maxSize:6000,tex:texB},
    {count:10,minY:5600,maxY:7600,minSize:3500,maxSize:7500,tex:texC}
  ];
  for(let L=0;L<layers.length;L++){
    const cfg=layers[L];
    const mat=new BABYLON.StandardMaterial('cM'+L,scene);
    mat.diffuseTexture=cfg.tex;mat.diffuseTexture.hasAlpha=true;
    mat.useAlphaFromDiffuseTexture=true;
    mat.emissiveColor=new BABYLON.Color3(1,1,1);
    mat.diffuseColor=new BABYLON.Color3(.7,.7,.75);
    mat.specularColor=new BABYLON.Color3(0,0,0);
    mat.backFaceCulling=false;mat.disableLighting=true;
    mat.alphaMode=BABYLON.Engine.ALPHA_COMBINE;
    cloudMaterials.push({mat,base:.7+L*.05});
    for(let i=0;i<cfg.count;i++){
      const size=cfg.minSize+Math.random()*(cfg.maxSize-cfg.minSize);
      const grp=new BABYLON.TransformNode('cG'+L+'_'+i,scene);
      const p=BABYLON.MeshBuilder.CreatePlane('c'+L+'_'+i,{size},scene);
      p.material=mat;p.billboardMode=BABYLON.Mesh.BILLBOARDMODE_ALL;
      p.parent=grp;p.isPickable=false;p.alphaIndex=i*3;
      const ang=Math.random()*Math.PI*2,dist=1200+Math.random()*22000;
      grp.position.set(Math.cos(ang)*dist,cfg.minY+Math.random()*(cfg.maxY-cfg.minY),Math.sin(ang)*dist);
      grp.parent=cloudRoot;
    }
  }
}
function applyCloudTint(){
  const b=currentWeather.cloudB;
  for(const c of cloudMaterials){
    c.mat.diffuseColor=new BABYLON.Color3(.7*b,.7*b,.75*b);
    c.mat.emissiveColor=new BABYLON.Color3(b,b,b);
  }
}

let rainPS=null, snowPS=null;
function setupPrecipitation(){
  if(!rainPS){
    rainPS=new BABYLON.ParticleSystem('rain',4000,scene);
    rainPS.particleTexture=new BABYLON.Texture('https://assets.babylonjs.com/textures/flare.png',scene);
    rainPS.emitter=new BABYLON.Vector3(0,0,0);
    rainPS.minEmitBox=new BABYLON.Vector3(-60,-5,-60);
    rainPS.maxEmitBox=new BABYLON.Vector3(60,15,60);
    rainPS.color1=new BABYLON.Color4(.7,.75,.85,.6);
    rainPS.color2=new BABYLON.Color4(.6,.65,.8,.5);
    rainPS.colorDead=new BABYLON.Color4(.5,.55,.7,0);
    rainPS.minSize=.08;rainPS.maxSize=.18;
    rainPS.minLifeTime=.6;rainPS.maxLifeTime=1.0;
    rainPS.emitRate=2000;
    rainPS.gravity=new BABYLON.Vector3(-2,-55,-2);
    rainPS.direction1=new BABYLON.Vector3(-1,-25,-1);
    rainPS.direction2=new BABYLON.Vector3(1,-20,1);
    rainPS.minEmitPower=1;rainPS.maxEmitPower=2;
    rainPS.blendMode=BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    rainPS.start();rainPS.stop();
  }
  if(!snowPS){
    snowPS=new BABYLON.ParticleSystem('snow',2500,scene);
    snowPS.particleTexture=new BABYLON.Texture('https://assets.babylonjs.com/textures/flare.png',scene);
    snowPS.emitter=new BABYLON.Vector3(0,0,0);
    snowPS.minEmitBox=new BABYLON.Vector3(-60,0,-60);
    snowPS.maxEmitBox=new BABYLON.Vector3(60,20,60);
    snowPS.color1=new BABYLON.Color4(1,1,1,.9);
    snowPS.color2=new BABYLON.Color4(.9,.95,1,.8);
    snowPS.colorDead=new BABYLON.Color4(.9,.9,1,0);
    snowPS.minSize=.15;snowPS.maxSize=.45;
    snowPS.minLifeTime=2.5;snowPS.maxLifeTime=5;
    snowPS.emitRate=500;
    snowPS.gravity=new BABYLON.Vector3(0,-2.5,0);
    snowPS.direction1=new BABYLON.Vector3(-.5,-1,-.5);
    snowPS.direction2=new BABYLON.Vector3(.5,-1.5,.5);
    snowPS.minEmitPower=.3;snowPS.maxEmitPower=.8;
    snowPS.start();snowPS.stop();
  }
}
function applyWeatherVisuals(){
  applyCloudTint();
  setupPrecipitation();
  if(!rainPS||!snowPS)return;
  if(currentWeather.rain>=1){
    rainPS.emitRate=currentWeather.rain>=2?3500:1200;
    if(!rainPS.isStarted())rainPS.start();
  } else { if(rainPS.isStarted())rainPS.stop(); }
  if(currentWeather.snow>=1){
    if(!snowPS.isStarted())snowPS.start();
  } else { if(snowPS.isStarted())snowPS.stop(); }
}

try{
  const pipeline=new BABYLON.DefaultRenderingPipeline('dp',true,scene,[camera]);
  pipeline.fxaaEnabled=true;pipeline.samples=1;pipeline.sharpenEnabled=true;pipeline.sharpen.edgeAmount=.3;pipeline.sharpen.colorAmount=1;
  pipeline.bloomEnabled=true;pipeline.bloomThreshold=.82;
  pipeline.bloomWeight=.28;pipeline.bloomKernel=56;
  pipeline.imageProcessingEnabled=true;
  pipeline.imageProcessing.vignetteEnabled=true;
  pipeline.imageProcessing.vignetteWeight=1.5;
  pipeline.imageProcessing.vignetteStretch=.5;
  pipeline.imageProcessing.vignetteColor=new BABYLON.Color4(0,0,0,0);
  pipeline.imageProcessing.vignetteBlendMode=BABYLON.ImageProcessingConfiguration.VIGNETTEMODE_MULTIPLY;
  pipeline.imageProcessing.contrast=1.14;
  pipeline.imageProcessing.exposure=1.18;
  pipeline.imageProcessing.toneMappingEnabled=true;
  pipeline.imageProcessing.toneMappingType=BABYLON.ImageProcessingConfiguration.TONEMAPPING_ACES;
  if(pipeline.imageProcessing.colorCurvesEnabled!==undefined){
    pipeline.imageProcessing.colorCurvesEnabled=true;
    const cc=new BABYLON.ColorCurves();cc.globalSaturation=22;cc.globalContrast=6;cc.highlightsSaturation=10;cc.shadowsDensity=8;
    pipeline.imageProcessing.colorCurves=cc;
  }
}catch(e){}
/* SSAO2: cheap ambient-occlusion pass so buildings/terrain/aircraft actually look
   grounded and 3D instead of flat-shaded blocks. Skipped on touch/low-power devices
   and folded into the FPS-based quality scaler below (disabled at _gq 0). */
try{
  if(!isTouchDev && BABYLON.SSAO2RenderingPipeline && BABYLON.SSAO2RenderingPipeline.IsSupported){
    const ssao=window._ssao=new BABYLON.SSAO2RenderingPipeline('ssao',scene,{ssaoRatio:.5,blurRatio:.5},[camera]);
    ssao.radius=3.2;ssao.totalStrength=.9;ssao.base=.15;ssao.expensiveBlur=false;ssao.samples=10;ssao.maxZ=600;
  }
}catch(e){}

try{
  const gl=window._glow=new BABYLON.GlowLayer('glow',scene,{blurKernelSize:16});gl.intensity=.45;
  scene.meshes.forEach(m=>{if(m.name&&/^(stars|sky)/i.test(m.name))gl.addExcludedMesh(m);});
}catch(e){}
try{const p=scene.postProcessRenderPipelineManager.supportedPipelines[0];if(p){p.bloomWeight=.3;p.bloomThreshold=.8;p.imageProcessing.contrast=1.15;p.imageProcessing.exposure=1.1;p.chromaticAberrationEnabled=true;p.chromaticAberration.aberrationAmount=6;p.grainEnabled=true;p.grain.intensity=3;p.grain.animated=true;}}catch(e){}
try{M.body.environmentIntensity=1.3;M.glass.alpha=.08;cockpitLight.intensity=2.4;cockpitLight2.intensity=1.6;}catch(e){}
/* ===== 3D BUILDINGS ===== */
function h2(i,j,k){let n=(Math.imul(i,374761393)+Math.imul(j,668265263)+Math.imul(k,1013904223))|0;n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967296;}
function winTex(ny,seed){const t=new BABYLON.DynamicTexture('wt'+seed,{width:128,height:256},scene,true),g=t.getContext(),nx=4;
  g.fillStyle='#c9c3b8';g.fillRect(0,0,128,256);
  for(let y=0;y<ny;y++)for(let x=0;x<nx;x++){g.fillStyle=((x*7+y*13+seed)%5===0)?'#ffe6a0':'#5d7288';g.fillRect(x*128/nx+4,y*256/ny+4,128/nx-8,256/ny-8);}
  t.update();return t;}
const bMeshes=[];
let cityOn=true;

const traffic=[];let trafficSpawnT=2,tcasMsgT=0,tcasLevel=0,tcasDrawT=0;
let TCAS_V={lvl:0,dir:0,t0:0,tier:0};
const tcasCtx=document.getElementById('tcasCanvas').getContext('2d');
function makeAirliner(col){
  const r=new BABYLON.TransformNode('ai',scene);const mats=[];
  const mb=new BABYLON.StandardMaterial('aiM'+Math.random(),scene);mb.diffuseColor=new BABYLON.Color3(.95,.95,.97);mb.emissiveColor=new BABYLON.Color3(.3,.3,.32);mb.specularColor=new BABYLON.Color3(.3,.3,.3);
  const ma=new BABYLON.StandardMaterial('aiA'+Math.random(),scene);ma.diffuseColor=col;ma.emissiveColor=col.scale(.45);ma.specularColor=new BABYLON.Color3(0,0,0);
  mats.push(mb,ma);
  const add=(m,mat,x,y,z)=>{m.material=mat;m.parent=r;m.position.set(x,y,z);m.isPickable=false;return m;};
  const f=BABYLON.MeshBuilder.CreateCylinder('aif',{height:34,diameter:3.8,tessellation:12},scene);f.rotation.x=Math.PI/2;add(f,mb,0,0,0);
  const nose=BABYLON.MeshBuilder.CreateSphere('ain',{diameter:3.8,segments:6},scene);nose.scaling.z=1.5;add(nose,mb,0,0,17);
  add(BABYLON.MeshBuilder.CreateBox('aiw',{width:34,height:.4,depth:5},scene),mb,0,-.8,-1);
  add(BABYLON.MeshBuilder.CreateBox('aih',{width:12,height:.3,depth:2.6},scene),mb,0,.6,-15);
  add(BABYLON.MeshBuilder.CreateBox('aifn',{width:.4,height:6,depth:4},scene),ma,0,3.4,-15);
  add(BABYLON.MeshBuilder.CreateBox('aist',{width:3.9,height:.5,depth:24},scene),ma,0,.2,0);
  for(const sg of [-1,1]){
    const e=BABYLON.MeshBuilder.CreateCylinder('aie',{height:4.2,diameter:2,tessellation:10},scene);e.rotation.x=Math.PI/2;add(e,mb,sg*6.5,-1.9,1.5);
    add(BABYLON.MeshBuilder.CreateSphere('ail',{diameter:.9},scene),M.white,sg*17,-.7,-2.5);
  }
  add(BABYLON.MeshBuilder.CreateSphere('aib',{diameter:.8},scene),M.red,0,2,-3);
  r.scaling.setAll(2.2);
  const gm=new BABYLON.StandardMaterial('aiG'+Math.random(),scene);gm.emissiveColor=new BABYLON.Color3(1,.25,.15);gm.disableLighting=true;gm.alpha=.85;
  const mk=BABYLON.MeshBuilder.CreateSphere('aimk',{diameter:6,segments:8},scene);mk.material=gm;mk.parent=null;mk.applyFog=false;mk.isPickable=false;
  mats.push(gm);
  return {root:r,mats,marker:mk};
}
function spawnTraffic(threat){
  const cols=[[.8,.1,.1],[.1,.3,.8],[.1,.6,.3],[.9,.6,.1],[.5,.2,.7]],c=cols[(Math.random()*cols.length)|0];
  const ac=makeAirliner(new BABYLON.Color3(c[0],c[1],c[2]));
  let pos,vel,homing=0;
  if(threat){
    const T=28,spd=210,hv=Math.hypot(plane.vel.x,plane.vel.z)>5?new BABYLON.Vector3(plane.vel.x,0,plane.vel.z).normalize():new BABYLON.Vector3(0,0,-1);
    const ip=plane.pos.add(plane.vel.scale(T));ip.y=plane.pos.y+BABYLON.Scalar.Clamp(plane.vel.y*T,-400,400);
    const a=Math.PI+(Math.random()-.5)*1.0,ca=Math.cos(a),sa=Math.sin(a);
    const dir=new BABYLON.Vector3(hv.x*ca+hv.z*sa,0,-hv.x*sa+hv.z*ca);
    vel=dir.scale(spd);pos=ip.subtract(vel.scale(T));
  } else if(Math.random()<.7){
    const T=20+Math.random()*25,spd=170+Math.random()*100,miss=Math.random()*180;
    const ip=plane.pos.add(plane.vel.scale(T));ip.y+=(Math.random()-.5)*2*miss*.6;
    const a=Math.random()*Math.PI*2,dir=new BABYLON.Vector3(Math.sin(a),0,Math.cos(a));
    ip.x+=-dir.z*miss;ip.z+=dir.x*miss;
    vel=dir.scale(-spd);pos=ip.subtract(vel.scale(T));
    pos.y=Math.max(pos.y,sampleTerrain(pos.x,pos.z)+300);homing=.05;
  } else {
    const a=Math.random()*Math.PI*2,d=7000+Math.random()*7000,h=Math.random()*Math.PI*2,spd=130+Math.random()*110;
    const dy=(Math.random()<.5?-1:1)*(300+Math.random()*600);
    pos=new BABYLON.Vector3(plane.pos.x+Math.sin(a)*d,plane.pos.y+dy,plane.pos.z+Math.cos(a)*d);
    pos.y=Math.max(pos.y,sampleTerrain(pos.x,pos.z)+400);
    vel=new BABYLON.Vector3(Math.sin(h)*spd,0,Math.cos(h)*spd);
  }
  ac.root.position.copyFrom(pos);
  if(threat)homing=.13;
  traffic.push({homing:homing,root:ac.root,marker:ac.marker,mats:ac.mats,pos:pos,vel:vel,threat:!!threat,lvl:0,dz:0,range:0});
}
function spawnIntruder(){
  if(plane.onGround||plane.crashed){showMsg('COLLISION FAULT · AIRBORNE ONLY',2500);faults.clear('COLLISION');return;}
  if(!traffic.some(t=>t.threat)){spawnTraffic(true);showMsg('⚠ TRAFFIC ON COLLISION COURSE',3000);}
}
function removeTraffic(i){const t=traffic[i];try{t.marker.dispose();t.root.dispose();t.mats.forEach(m=>m.dispose());}catch(e){}traffic.splice(i,1);}
function clearTraffic(){while(traffic.length)removeTraffic(traffic.length-1);trafficSpawnT=10;tcasLevel=0;}
function drawTCAS(){
  const g=tcasCtx,S=170,c=S/2,R=c-8,RANGE=15000;
  g.clearRect(0,0,S,S);g.fillStyle='rgba(0,10,5,.55)';g.beginPath();g.arc(c,c,R+4,0,6.2832);g.fill();
  g.strokeStyle='rgba(120,220,255,.45)';g.lineWidth=1;
  for(const k of [1/3,2/3,1]){g.beginPath();g.arc(c,c,R*k,0,6.2832);g.stroke();}
  g.fillStyle='#7fc7ff';g.font='9px monospace';g.textAlign='center';g.fillText('5',c+R/3-6,c-2);g.fillText('10',c+R*2/3-8,c-2);
  const m=BABYLON.Matrix.Identity();plane.quat.toRotationMatrix(m);
  const fw=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,0,1),m);let fx=fw.x,fz=fw.z;const fl=Math.hypot(fx,fz)||1;fx/=fl;fz/=fl;
  for(const t of traffic){
    const rx=t.pos.x-plane.pos.x,rz=t.pos.z-plane.pos.z;if(Math.hypot(rx,rz)>RANGE)continue;
    const px=(rx*fz-rz*fx)/RANGE*R,py=(rx*fx+rz*fz)/RANGE*R,x=c+px,y=c-py;
    const near=t.range<10000&&Math.abs(t.dz)<600;
    g.lineWidth=2;
    if(t.lvl===2){g.fillStyle='#ff2020';g.fillRect(x-6,y-6,12,12);}
    else if(t.lvl===1){g.fillStyle='#ffb000';g.beginPath();g.arc(x,y,6,0,6.2832);g.fill();}
    else{g.beginPath();g.moveTo(x,y-6);g.lineTo(x+5,y);g.lineTo(x,y+6);g.lineTo(x-5,y);g.closePath();
      if(near){g.fillStyle='#40e0ff';g.fill();}else{g.strokeStyle='#fff';g.stroke();}}
    const dz=Math.round(t.dz*3.28084/100),lab=(dz>=0?'+':'-')+String(Math.abs(dz)).padStart(2,'0')+(t.vel.y>2.5?'↑':(t.vel.y<-2.5?'↓':''));
    g.fillStyle=t.lvl===2?'#ff8080':(t.lvl===1?'#ffd060':'#bfefff');g.font='bold 10px monospace';g.textAlign='center';g.fillText(lab,x,dz>=0?y-9:y+17);
  }
  g.fillStyle='#ffd400';g.beginPath();g.moveTo(c,c-7);g.lineTo(c-5,c+6);g.lineTo(c+5,c+6);g.closePath();g.fill();
  g.font='bold 11px monospace';g.textAlign='left';
  g.fillStyle=tcasLevel===2?'#ff4040':(tcasLevel===1?'#ffc030':'#60ff90');
  g.fillText(tcasLevel===2?'TCAS RA':(tcasLevel===1?'TCAS TA':'TCAS'),4,12);
}
function updateTraffic(dt){
  if(plane.hold)return;
  const flying=!plane.crashed&&!plane.onGround;
  const wantThreat=faults.has('COLLISION');
  trafficSpawnT-=dt;
  if(flying&&trafficSpawnT<=0){
    trafficSpawnT=3+Math.random()*4;
    if(traffic.filter(t=>!t.threat).length<12&&plane.pos.y-sampleSurface(plane.pos.x,plane.pos.z)>500)spawnTraffic(false);
  }
  let lvl=0,ra=null;
  for(let i=traffic.length-1;i>=0;i--){
    const t=traffic[i];
    if(t.homing&&t.range>350){const sp=t.vel.length(),dn=plane.pos.subtract(t.pos).normalize(),cn=t.vel.scale(1/sp);
      t.vel=cn.add(dn.subtract(cn).scale(Math.min(1,t.homing*dt))).normalize().scale(sp);}
    t.pos.addInPlace(t.vel.scale(dt));t.root.position.copyFrom(t.pos);t.marker.position.set(t.pos.x,t.pos.y+8,t.pos.z);{const dd=BABYLON.Vector3.Distance(t.pos,camera.position);t.marker.scaling.setAll(Math.max(1,dd/160));t.marker.isVisible=false;}t.root.rotation.y=Math.atan2(t.vel.x,t.vel.z);
    const rel=t.pos.subtract(plane.pos),rv=t.vel.subtract(plane.vel),r=rel.length();
    if(r>24000||(t.threat&&!wantThreat)){removeTraffic(i);continue;}
    const v2=rv.lengthSquared(),tc=v2>1?-BABYLON.Vector3.Dot(rel,rv)/v2:0;
    const cpa=tc>0?rel.add(rv.scale(tc)).length():r;
    t.range=r;t.dz=rel.y;t.lvl=0;
    if(tc>0&&tc<45&&cpa<1800)t.lvl=1;
    if(tc>0&&tc<28&&cpa<600)t.lvl=2;
    if(r<1200&&Math.abs(rel.y)<250)t.lvl=Math.max(t.lvl,1);
    if(r<600&&Math.abs(rel.y)<150)t.lvl=2;
    if(t.lvl>lvl){lvl=t.lvl;ra=t;}
    if(!plane.crashed&&r<65){crash('MIDAIR COLLISION · TRAFFIC');faults.clear('COLLISION');setTimeout(()=>{if(plane.crashed)respawn();},3000);}
  }
  tcasLevel=lvl;tcasMsgT-=dt;
  if(lvl&&tcasMsgT<=0&&!plane.crashed){
    if(lvl===2){showMsg(ra.dz>0?'⚠ TCAS RA · DESCEND, DESCEND':'⚠ TCAS RA · CLIMB, CLIMB',2200);tcasMsgT=2.5;}
    else{showMsg('TCAS TA · TRAFFIC, TRAFFIC',2200);tcasMsgT=5;}
  }
  if(!plane.crashed&&lvl!==TCAS_V.lvl){
    try{
      if(lvl===1&&TCAS_V.lvl===0)speak('traffic, traffic');
      else if(lvl===2){TCAS_V.dir=ra.dz>0?1:-1;TCAS_V.t0=performance.now()/1000;TCAS_V.tier=0;speak(TCAS_V.dir>0?'descend, descend':'climb, climb');}
      else if(lvl===0&&TCAS_V.lvl>0)speak('clear of conflict');
    }catch(e){}
    TCAS_V.lvl=lvl;
  }
  if(!plane.crashed&&lvl===2){
    const el=performance.now()/1000-TCAS_V.t0;
    try{
      if(TCAS_V.dir>0){
        if(el>12&&TCAS_V.tier<2){TCAS_V.tier=2;speak('increase descent');}
        else if(el>6&&TCAS_V.tier<1){TCAS_V.tier=1;speak('descend, descend now');}
      }else if(el>7&&TCAS_V.tier<1){TCAS_V.tier=1;speak('increase climb');}
    }catch(e){}
  }
  tcasDrawT-=dt;if(tcasDrawT<=0){tcasDrawT=.1;drawTCAS();}
}

const cityMeshes=[];
let roofMesh=null,treeMesh=null,trunkMesh=null,osmBuildRequest=0,lastOsmErrorAt=0;
const osmCache=new Map();
window.BKF=[];window.bkMeshes=[];
window._rtMesh=null;
const osmBuildingMaterial=new BABYLON.StandardMaterial('osmBuildingM',scene);
osmBuildingMaterial.diffuseColor=new BABYLON.Color3(1,1,1);
osmBuildingMaterial.emissiveColor=new BABYLON.Color3(.025,.025,.025);
osmBuildingMaterial.specularColor=new BABYLON.Color3(.16,.17,.18);
osmBuildingMaterial.specularPower=32;
osmBuildingMaterial.backFaceCulling=false;

function osmBounds(cx,cz){
  const half=CFG.terrainExtent/2,nw=worldToLL(cx-half,cz-half),se=worldToLL(cx+half,cz+half);
  return {south:Math.max(-85,se.lat),west:nw.lon,north:Math.min(85,nw.lat),east:se.lon};
}
async function fetchOsmBuildings(bounds){
  const key=Object.values(bounds).map(v=>v.toFixed(5)).join(',');
  if(osmCache.has(key))return osmCache.get(key);
  const bbox=[bounds.south,bounds.west,bounds.north,bounds.east].join(',');
  const query=`[out:json][timeout:20];way["building"](${bbox});out geom;`;
  let lastError=null;
  for(const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter']){
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),22000);
    try{
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
        body:new URLSearchParams({data:query}),signal:controller.signal});
      if(!response.ok)throw new Error('Overpass HTTP '+response.status);
      const data=await response.json();
      if(!Array.isArray(data.elements))throw new Error('Overpass returned no building data');
      osmCache.set(key,data.elements);
      if(osmCache.size>2)osmCache.delete(osmCache.keys().next().value);
      return data.elements;
    }catch(error){lastError=error;}
    finally{clearTimeout(timer);}
  }
  throw lastError||new Error('OpenStreetMap building request failed');
}
function osmHeight(tags){
  const metres=value=>{
    if(value===undefined)return null;
    const text=String(value).trim(),number=parseFloat(text);
    if(!Number.isFinite(number))return null;
    return /ft|feet|'/i.test(text)?number*.3048:number;
  };
  const tagged=metres(tags.height);
  if(tagged!==null)return BABYLON.Scalar.Clamp(tagged,3,450);
  const levels=parseFloat(tags['building:levels']);
  if(Number.isFinite(levels)&&levels>0)return BABYLON.Scalar.Clamp(levels*3.2,3,240);
  const type=String(tags.building||'').toLowerCase();
  if(type==='house'||type==='detached'||type==='semidetached_house'||type==='bungalow')return 7;
  if(type==='industrial'||type==='warehouse'||type==='hangar')return 10;
  if(type==='church'||type==='cathedral')return 22;
  return 12;
}
function osmTriangles(points){
  const area=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.z-q.x*p.z;},0);
  const winding=area>=0?1:-1,remaining=points.map((_,i)=>i),triangles=[];
  const addTriangle=(a,b,c)=>winding>0?triangles.push(a,c,b):triangles.push(a,b,c);
  const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
  const inside=(p,a,b,c)=>{
    const ab=cross(a,b,p)*winding,bc=cross(b,c,p)*winding,ca=cross(c,a,p)*winding;
    return ab>=-1e-5&&bc>=-1e-5&&ca>=-1e-5;
  };
  let guard=remaining.length*remaining.length;
  while(remaining.length>3&&guard-->0){
    let clipped=false;
    for(let i=0;i<remaining.length;i++){
      const ia=remaining[(i+remaining.length-1)%remaining.length],ib=remaining[i],ic=remaining[(i+1)%remaining.length];
      if(cross(points[ia],points[ib],points[ic])*winding<=1e-5)continue;
      if(remaining.some(ix=>ix!==ia&&ix!==ib&&ix!==ic&&inside(points[ix],points[ia],points[ib],points[ic])))continue;
      addTriangle(ia,ib,ic);remaining.splice(i,1);clipped=true;break;
    }
    if(!clipped)return [];
  }
  if(remaining.length===3)addTriangle(remaining[0],remaining[1],remaining[2]);
  return triangles;
}
function createOsmBuildingMeshes(elements,cx,cz){
  const meshes=[],batchLimit=350;
  let positions=[],colors=[],indices=[],buildings=0;
  const flush=()=>{
    if(!indices.length)return;
    const mesh=new BABYLON.Mesh('osmBuildings'+meshes.length,scene),data=new BABYLON.VertexData();
    data.positions=new Float32Array(positions);data.colors=new Float32Array(colors);
    data.indices=positions.length/3>65535?new Uint32Array(indices):new Uint16Array(indices);
    const normals=new Float32Array(positions.length);
    BABYLON.VertexData.ComputeNormals(data.positions,data.indices,normals);data.normals=normals;
    data.applyToMesh(mesh,true);mesh.material=osmBuildingMaterial;mesh.position.set(cx,0,cz);
    mesh._has=true;mesh.useVertexColors=true;mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;mesh.receiveShadows=true;mesh.setEnabled(cityOn);
    const shadow=window._csm;
    if(shadow)shadow.getShadowMap().renderList.push(mesh);
    meshes.push(mesh);positions=[];colors=[];indices=[];buildings=0;
  };
  const vertex=(x,y,z,color)=>{
    const index=positions.length/3;positions.push(x-cx,y,z-cz);
    colors.push(color[0],color[1],color[2],1);return index;
  };
  let accepted=0;
  for(const element of elements){
    if(element.type!=='way'||!element.tags||!element.geometry||element.geometry.length<3)continue;
    const tags=element.tags;
    if(tags.building==='no'||tags.building==='construction'||element.geometry.length>120)continue;
    const points=[];
    for(const node of element.geometry){
      if(!Number.isFinite(node.lat)||!Number.isFinite(node.lon))continue;
      const w=llToWorld(node.lat,node.lon),last=points[points.length-1];
      if(!last||Math.hypot(w.x-last.x,w.z-last.z)>.1)points.push(w);
    }
    if(points.length>2&&Math.hypot(points[0].x-points[points.length-1].x,points[0].z-points[points.length-1].z)<.1)points.pop();
    if(points.length<3||points.length>120)continue;
    const centre=points.reduce((a,p)=>({x:a.x+p.x/points.length,z:a.z+p.z/points.length}),{x:0,z:0});
    if(Math.hypot(centre.x-cx,centre.z-cz)>CFG.terrainExtent*.72)continue;
    const base=sampleTerrain(centre.x,centre.z);
    if(!Number.isFinite(base))continue;
    const height=osmHeight(tags),minLevel=parseFloat(tags.min_height);
    const minHeight=Number.isFinite(minLevel)?BABYLON.Scalar.Clamp(minLevel,0,height-1):0;
    const type=String(tags.building||'').toLowerCase();
    let color=type==='industrial'||type==='warehouse'||type==='hangar'?[.55,.57,.58]:
      type==='commercial'||type==='office'?[.52,.62,.69]:
      type==='house'||type==='detached'||type==='residential'?[.78,.72,.63]:[.68,.7,.71];
    const variation=.92+((Math.imul((Number(element.id)||accepted+1)|0,1664525)+1013904223)>>>0)/4294967295*.16;
    color=color.map(v=>Math.min(1,v*variation));
    const roof=color.map(v=>Math.min(1,v*1.08));
    const area=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.z-q.x*p.z;},0);
    const reverseWalls=area>0,bottom=base+minHeight,top=base+height,baseIndex=positions.length/3;
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length];
      const i0=vertex(a.x,bottom,a.z,color),i1=vertex(b.x,bottom,b.z,color);
      const i2=vertex(b.x,top,b.z,color),i3=vertex(a.x,top,a.z,color);
      if(reverseWalls)indices.push(i0,i2,i1,i0,i3,i2);
      else indices.push(i0,i1,i2,i0,i2,i3);
    }
    const roofIndices=[];
    points.forEach(p=>roofIndices.push(vertex(p.x,top,p.z,roof)));
    const triangles=osmTriangles(points);
    for(let i=0;i<triangles.length;i+=3)indices.push(roofIndices[triangles[i]],roofIndices[triangles[i+1]],roofIndices[triangles[i+2]]);
    if(positions.length/3-baseIndex>0){accepted++;buildings++;}
    if(buildings>=batchLimit)flush();
  }
  flush();
  return {meshes,count:accepted};
}
function clearCityMeshes(){
  const old=cityMeshes.splice(0),shadow=window._csm;
  if(shadow){
    const renderList=shadow.getShadowMap().renderList;
    for(const mesh of old){const index=renderList.indexOf(mesh);if(index>=0)renderList.splice(index,1);}
  }
  old.forEach(mesh=>mesh.dispose());
}
function buildCity(cx,cz){
  const request=++osmBuildRequest,bounds=osmBounds(cx,cz);
  clearCityMeshes();
  fetchOsmBuildings(bounds).then(elements=>{
    if(request!==osmBuildRequest)return;
    const result=createOsmBuildingMeshes(elements,cx,cz);
    cityMeshes.push(...result.meshes);
    if(!result.count)console.info('[OpenStreetMap] No mapped buildings in this area.');
  }).catch(error=>{
    if(request!==osmBuildRequest)return;
    console.warn('[OpenStreetMap buildings]',error);
    const now=Date.now();
    if(now-lastOsmErrorAt>60000){lastOsmErrorAt=now;showMsg('OPENSTREETMAP BUILDINGS UNAVAILABLE',3500);}
  });
}
{
  const credit=document.createElement('a');
  credit.href='https://www.openstreetmap.org/copyright';credit.target='_blank';credit.rel='noopener noreferrer';
  credit.textContent='© OpenStreetMap contributors';
  credit.style.cssText='position:fixed;right:12px;bottom:8px;z-index:45;padding:3px 6px;border-radius:4px;background:rgba(5,12,20,.72);color:#d7e8f5;font:10px system-ui,sans-serif;text-decoration:none';
  document.body.appendChild(credit);
}

/* ===== MOBILE / TOUCH CONTROLS (self-contained: builds its own pad and styles, so it works with any page markup) ===== */
let tPitch=0,tRoll=0;
(function mobileTouch(){
  const $=id=>document.getElementById(id);
  const hasTouch=('ontouchstart' in window)||navigator.maxTouchPoints>0;
  const auto=hasTouch&&Math.min(screen.width,screen.height)<900;

  /* --- settings checkbox (reuses the page's #mobChk if it exists) --- */
  let chk=$('mobChk');
  if(!chk){chk=document.createElement('input');chk.type='checkbox';chk.id='mobChk';chk.hidden=true;document.body.appendChild(chk);}
  const stored=localStorage.getItem('mobMode');
  chk.checked=stored!==null?stored==='1':auto;

  /* --- viewport: no pinch-zoom on touch devices --- */
  if(hasTouch){
    let m=document.querySelector('meta[name=viewport]');
    if(!m){m=document.createElement('meta');m.name='viewport';document.head.appendChild(m);}
    m.content='width=device-width,initial-scale=1,viewport-fit=cover,maximum-scale=1';
  }

  /* --- styles --- */
  const css=document.createElement('style');css.id='mobCss';
  css.textContent=`
  #mobPad{position:fixed;inset:0;z-index:320;display:none;pointer-events:none;touch-action:none;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
  body.mobile #mobPad{display:block}
  body.mobile{touch-action:none;overscroll-behavior:none}
  body.mobile #touchUI,body.mobile #joy,body.mobile #thr,body.mobile #thrF{display:none !important}
  #mobPad .mp{position:absolute;pointer-events:auto;touch-action:none}
  #mobStick{left:calc(env(safe-area-inset-left,0px) + 14px);bottom:calc(env(safe-area-inset-bottom,0px) + 14px);width:clamp(120px,30vmin,172px);height:clamp(120px,30vmin,172px);border-radius:50%;box-sizing:border-box;background:radial-gradient(circle,rgba(20,40,64,.55),rgba(8,14,24,.5));border:2px solid rgba(120,200,255,.42)}
  #mobStick::after{content:'';position:absolute;left:50%;top:50%;width:34%;height:34%;transform:translate(-50%,-50%);border:1px dashed rgba(120,200,255,.28);border-radius:50%}
  #mobStickK{position:absolute;left:50%;top:50%;width:44%;height:44%;border-radius:50%;transform:translate(-50%,-50%);background:radial-gradient(circle at 35% 30%,#a8e4ff,#2c7fc0 70%);box-shadow:0 3px 10px rgba(0,0,0,.55);pointer-events:none}
  #mobRud{left:calc(env(safe-area-inset-left,0px) + clamp(120px,30vmin,172px) + 24px);bottom:calc(env(safe-area-inset-bottom,0px) + 14px);display:flex;gap:8px}
  #mobThr{right:calc(env(safe-area-inset-right,0px) + 12px);bottom:calc(env(safe-area-inset-bottom,0px) + 12px);width:66px;height:min(58vh,300px);box-sizing:border-box;border-radius:14px;overflow:hidden;background:rgba(8,14,24,.6);border:1px solid rgba(120,200,255,.42)}
  #mobThrF{position:absolute;left:0;right:0;bottom:0;height:0;background:linear-gradient(0deg,#1f6fb0,#7fd4ff)}
  #mobThrK{position:absolute;left:4px;right:4px;height:14px;border-radius:6px;background:#e8f6ff;bottom:0;box-shadow:0 0 0 2px #0a1420;pointer-events:none}
  #mobThrL{position:absolute;top:6px;left:0;right:0;text-align:center;font-size:11px;font-weight:800;color:#bfe9ff;pointer-events:none}
  #mobBtns{right:calc(env(safe-area-inset-right,0px) + 90px);bottom:calc(env(safe-area-inset-bottom,0px) + 12px);display:grid;grid-template-columns:repeat(4,auto);gap:6px}
  #mobTop{top:calc(env(safe-area-inset-top,0px) + 8px);right:calc(env(safe-area-inset-right,0px) + 8px);display:flex;gap:6px}
  .mb{min-width:50px;height:40px;padding:0 8px;box-sizing:border-box;border-radius:10px;background:rgba(8,14,24,.72);color:#cfeeff;border:1px solid rgba(120,200,255,.42);font:800 11px/1 system-ui,sans-serif;letter-spacing:.3px;touch-action:none;-webkit-user-select:none;user-select:none}
  .mb.dn{background:rgba(60,150,230,.8);color:#fff;transform:scale(.96)}
  #mobRot{position:fixed;inset:0;z-index:400;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;background:rgba(5,10,18,.96);color:#cfeeff;font-size:16px;pointer-events:auto}`;
  document.head.appendChild(css);

  /* --- DOM --- */
  const ACT=[
    {l:'GEAR',tap:'KeyG'},{l:'FLAP',tap:'KeyF'},{l:'SPLR',tap:'KeyB'},{l:'REV',tap:'KeyN'},
    {l:'LAND',tap:'KeyL'},{l:'A/P',tap:'KeyP'},{l:'A/THR',tap:'KeyT'},{l:'CAM',tap:'KeyC'},
    {l:'PFD',tap:'KeyX'},{l:'BRAKE',hold:'Space'}
  ];
  const pad=document.createElement('div');pad.id='mobPad';
  pad.innerHTML=
    '<div id="mobStick" class="mp"><div id="mobStickK"></div></div>'+
    '<div id="mobRud" class="mp"><button class="mb" id="mobRudL">&#9664; RUD</button><button class="mb" id="mobRudR">RUD &#9654;</button></div>'+
    '<div id="mobBtns" class="mp">'+ACT.map((a,i)=>'<button class="mb" id="mobA'+i+'">'+a.l+'</button>').join('')+'</div>'+
    '<div id="mobThr" class="mp"><div id="mobThrF"></div><div id="mobThrK"></div><div id="mobThrL">THR</div></div>'+
    '<div id="mobTop" class="mp"><button class="mb" id="mobRes">RESET</button><button class="mb" id="mobTog">MOBILE</button></div>';
  document.body.appendChild(pad);
  const rot=document.createElement('div');rot.id='mobRot';
  rot.innerHTML='<div style="font-size:46px;line-height:1">&#8635;</div><div>Rotate your phone to landscape for the cockpit view.</div><button class="mb" id="mobRotGo" style="height:44px;padding:0 16px;font-size:13px">Play in portrait</button>';
  document.body.appendChild(rot);

  /* --- helpers --- */
  const tapKey=code=>{window.dispatchEvent(new KeyboardEvent('keydown',{code}));window.dispatchEvent(new KeyboardEvent('keyup',{code}));};
  const buzz=()=>{try{if(navigator.vibrate)navigator.vibrate(12);}catch(e){}};
  const bindBtn=(el,o)=>{
    let pid=null,lp=null;
    el.addEventListener('pointerdown',e=>{
      e.preventDefault();e.stopPropagation();pid=e.pointerId;
      try{el.setPointerCapture(e.pointerId);}catch(_){}
      el.classList.add('dn');buzz();
      if(o.hold)keys[o.hold]=true;
      if(o.tap)tapKey(o.tap);
      if(o.onLong)lp=setTimeout(()=>{lp=null;o.onLong();},700);
    });
    const up=()=>{
      if(pid===null)return;pid=null;el.classList.remove('dn');
      if(o.hold)keys[o.hold]=false;
      if(lp){clearTimeout(lp);lp=null;if(o.onShort)o.onShort();}
    };
    el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);el.addEventListener('lostpointercapture',up);
  };

  /* --- rudder + action buttons --- */
  bindBtn($('mobRudL'),{hold:'KeyQ'});
  bindBtn($('mobRudR'),{hold:'KeyE'});
  ACT.forEach((a,i)=>bindBtn($('mobA'+i),{tap:a.tap,hold:a.hold}));
  bindBtn($('mobRes'),{onLong:()=>{tapKey('KeyR');buzz();},onShort:()=>showMsg('Hold RESET to respawn',1600)});

  /* --- stick (roll + pitch) --- */
  const stick=$('mobStick'),knob=$('mobStickK');
  let sid=null;const SCALE=.92,DZ=.08;
  const setKnob=(dx,dy)=>{knob.style.transform='translate(calc(-50% + '+dx+'px), calc(-50% + '+dy+'px))';};
  const stickMove=e=>{
    const r=stick.getBoundingClientRect(),R=r.width/2*SCALE;
    let dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2);
    const l=Math.hypot(dx,dy);if(l>R){dx*=R/l;dy*=R/l;}
    setKnob(dx,dy);
    const dz=v=>Math.abs(v)<DZ?0:(v-Math.sign(v)*DZ)/(1-DZ);
    tRoll=-dz(dx/R);tPitch=-dz(dy/R);
  };
  const stickEnd=()=>{sid=null;tRoll=0;tPitch=0;setKnob(0,0);};
  stick.addEventListener('pointerdown',e=>{sid=e.pointerId;try{stick.setPointerCapture(e.pointerId);}catch(_){}stickMove(e);e.preventDefault();});
  stick.addEventListener('pointermove',e=>{if(e.pointerId===sid)stickMove(e);});
  stick.addEventListener('pointerup',e=>{if(e.pointerId===sid)stickEnd();});
  stick.addEventListener('pointercancel',stickEnd);
  stick.addEventListener('lostpointercapture',stickEnd);

  /* --- throttle --- */
  const thr=$('mobThr'),thrF=$('mobThrF'),thrK=$('mobThrK'),thrL=$('mobThrL');
  let tid=null;
  const thrSet=e=>{const r=thr.getBoundingClientRect();plane.throttle=Math.max(0,Math.min(1,1-(e.clientY-r.top)/r.height));};
  thr.addEventListener('pointerdown',e=>{tid=e.pointerId;try{thr.setPointerCapture(e.pointerId);}catch(_){}thrSet(e);e.preventDefault();});
  thr.addEventListener('pointermove',e=>{if(e.pointerId===tid)thrSet(e);});
  const thrEnd=()=>{tid=null;};thr.addEventListener('pointerup',thrEnd);thr.addEventListener('pointercancel',thrEnd);
  setInterval(()=>{
    const p=Math.round((plane.throttle||0)*100);
    thrF.style.height=p+'%';thrK.style.bottom='calc('+p+'% - 7px)';thrL.textContent=p+'%';
  },80);

  /* --- rotate prompt (portrait) --- */
  let rotDismiss=false;
  const refreshRot=()=>{
    const portrait=window.innerHeight>window.innerWidth;
    rot.style.display=(document.body.classList.contains('mobile')&&portrait&&!rotDismiss)?'flex':'none';
  };
  $('mobRotGo').addEventListener('click',()=>{rotDismiss=true;refreshRot();});

  /* --- mobile on/off --- */
  const apply=()=>{
    const on=chk.checked;
    document.body.classList.toggle('mobile',on);
    localStorage.setItem('mobMode',on?'1':'0');
    refreshRot();
    setTimeout(()=>{try{engine.resize();}catch(e){}},50);
  };
  chk.addEventListener('change',apply);
  $('mobTog').addEventListener('click',()=>{chk.checked=!chk.checked;apply();});
  apply();

  /* --- resize / orientation --- */
  let rsT=0;
  const onResize=()=>{refreshRot();clearTimeout(rsT);rsT=setTimeout(()=>{try{engine.resize();}catch(e){}},60);};
  window.addEventListener('resize',onResize);
  window.addEventListener('orientationchange',onResize);
  try{if(screen.orientation&&screen.orientation.addEventListener)screen.orientation.addEventListener('change',onResize);}catch(e){}

  /* --- start: fullscreen + landscape lock (both optional; failures are ignored) --- */
  const sb=$('startBtn');
  if(sb)sb.addEventListener('click',()=>{
    if(!chk.checked)return;
    try{
      const d=document.documentElement;
      const p=(d.requestFullscreen||d.webkitRequestFullscreen||function(){}).call(d);
      if(p&&p.catch)p.catch(()=>{});
    }catch(e){}
    try{
      const p=screen.orientation&&screen.orientation.lock&&screen.orientation.lock('landscape');
      if(p&&p.catch)p.catch(()=>{});
    }catch(e){}
  });

  /* --- gestures: no page scroll or pinch under the game; panels that scroll still work --- */
  const inMobile=()=>document.body.classList.contains('mobile');
  document.addEventListener('gesturestart',e=>{if(inMobile())e.preventDefault();});
  document.addEventListener('contextmenu',e=>{if(inMobile())e.preventDefault();});
  document.addEventListener('touchmove',e=>{
    if(!inMobile())return;
    for(let n=e.target;n&&n!==document.body;n=n.parentElement){
      if(n.scrollHeight>n.clientHeight+2){const oy=getComputedStyle(n).overflowY;if(oy==='auto'||oy==='scroll')return;}
    }
    e.preventDefault();
  },{passive:false});

  /* --- release everything if the app loses focus, so nothing sticks on --- */
  const releaseAll=()=>{
    tPitch=0;tRoll=0;setKnob(0,0);sid=null;tid=null;
    ['KeyQ','KeyE','Space'].forEach(k=>{keys[k]=false;});
  };
  window.addEventListener('blur',releaseAll);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)releaseAll();});
})();

/* ===== FLIGHT PLAN + MAP + ADVANCED AUTOPILOT ===== */
const FP={wps:[],active:0,n:0};
Object.assign(AP,{lnav:false,appr:false,vnav:true});
function wrap180(e){while(e>180)e-=360;while(e<-180)e+=360;return e;}
function updateAutopilot(dt){
  const air=computeAirspeed(),kts=air.kias;
  if(AP.athr&&AP.athrArmed){
    if(AP.spdMode){
      const rho=1.225*Math.exp(-Math.max(plane.pos.y,0)/8500);
      const targetKts=AP.speedUnit==='MACH'?AP.machTarget*340*Math.sqrt(rho/1.225)*1.94384:AP.spdTarget;
      const err=targetKts-kts;
      plane.throttle=BABYLON.Scalar.Clamp(plane.throttle+(err*.012)*dt*(Math.abs(err)>10?1.6:1),0,1);
    }else if(AP.n1Mode){
      const targetN1=AP.thrustMode==='CON'?88:95;
      const targetThrottle=BABYLON.Scalar.Clamp((targetN1-22)/78,0,1);
      if(ENG.L.state==='RUNNING'||ENG.R.state==='RUNNING'){
        plane.throttle=BABYLON.Scalar.Clamp(plane.throttle+(targetThrottle-plane.throttle)*Math.min(1,dt*.8),0,1);
      }
    }
  }
  if(!AP.master)return;
  const m=BABYLON.Matrix.Identity();plane.quat.toRotationMatrix(m);
  const fwd=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,0,1),m);
  const right=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1,0,0),m);
  const heading=(Math.atan2(fwd.x,-fwd.z)*180/Math.PI+360)%360;
  const rollDeg=Math.atan2(right.y,Math.sqrt(Math.max(0,1-right.y*right.y)))*180/Math.PI;
  const altFt=plane.pos.y*3.28084,vsFpm=plane.vel.y*196.85,gs=Math.hypot(plane.vel.x,plane.vel.z);
  let hdgCmd=null,vsT=null,maxBank=AP.bankLimit;
  if((AP.appr||AP.locMode)&&runwayLenM>0){
    const h=runwayHdgDeg*Math.PI/180,dX=Math.sin(h),dZ=-Math.cos(h),pX=Math.cos(h),pZ=Math.sin(h);
    const along=plane.pos.x*dX+plane.pos.z*dZ,across=plane.pos.x*pX+plane.pos.z*pZ;
    const d=(-runwayLenM/2+350)-along;
    if(AP.appr)maxBank=18;
    const lim=BABYLON.Scalar.Clamp(d/200,2,maxBank);
    hdgCmd=(runwayHdgDeg-BABYLON.Scalar.Clamp(across/40,-lim,lim)+360)%360;
    if(AP.appr){
      const agl=computeAGL();
      if(d>0){
        const gsAlt=runwayY+ACFG.gearHeight+d*Math.tan(3*Math.PI/180);
        vsT=-gs*Math.tan(3*Math.PI/180)*196.85+(gsAlt-plane.pos.y)*3.28084*0.5;
        vsT=BABYLON.Scalar.Clamp(vsT,-1100,600);
      } else vsT=-250;
      if(agl<50)vsT=Math.max(vsT,-300);
      if(agl<22){vsT=-130;plane.throttle=Math.max(0,plane.throttle-dt*.25);}
    }
    if(plane.onGround){AP.master=false;AP.appr=false;AP.locMode=false;AP.athr=false;AP.athrArmed=false;AP.spdMode=false;showMsg('LANDED · AP DISCONNECT',3000);return;}
  } else if(AP.lnav&&FP.wps.length&&FP.active<FP.wps.length){
    const wp=FP.wps[FP.active],w=llToWorld(wp.lat,wp.lon),dx=w.x-plane.pos.x,dz=w.z-plane.pos.z,dist=Math.hypot(dx,dz);
    hdgCmd=(Math.atan2(dx,-dz)*180/Math.PI+360)%360;AP.hdgTarget=Math.round(hdgCmd);
    const turnR=gs*gs/(9.81*Math.tan(25*Math.PI/180)),seq=Math.max(1200,Math.min(turnR*.9,6000)),last=FP.active>=FP.wps.length-1;
    if(!last&&dist<seq){FP.active++;showMsg('NEXT · '+FP.wps[FP.active].name,2000);}
    else if(last&&dist<600){AP.lnav=false;AP.hdgMode=true;AP.hdgTarget=Math.round(heading);FP.active=FP.wps.length;showMsg('FLIGHT PLAN COMPLETE · HDG HOLD',3000);}
    if(wp.alt!=null&&AP.vnav){AP.altTarget=wp.alt;AP.altMode=true;AP.vsMode=false;}
  } else if(AP.hdgMode)hdgCmd=AP.hdgTarget;
  if(hdgCmd!==null){
    const track=(Math.atan2(plane.vel.x,-plane.vel.z)*180/Math.PI+360)%360;
    const err=wrap180(hdgCmd-(AP.trackMode?track:heading));
    const desRoll=BABYLON.Scalar.Clamp(err*1.0,-maxBank,maxBank);
    input.roll=BABYLON.Scalar.Clamp((desRoll-rollDeg)/17,-1,1);
  } else input.roll=BABYLON.Scalar.Clamp(-rollDeg/20,-1,1)*.6;
  if(vsT===null){
    if(AP.vsMode)vsT=AP.vsModeType==='FPA'?gs*Math.tan(AP.fpaTarget*Math.PI/180)*196.85:AP.vsTarget;
    else if(AP.altMode){const e=AP.altTarget-altFt;vsT=BABYLON.Scalar.Clamp(e*.4,-1800,1800);if(Math.abs(e)<60)vsT=e*3;}
  }
  if(vsT!==null){
    if(vsT>0&&kts<150&&!AP.appr)vsT=Math.min(vsT,300);
    AP._vsFilt=(AP._vsFilt||0)*0.88+vsFpm*0.12;
    input.pitch=BABYLON.Scalar.Clamp(-(vsT-AP._vsFilt)/2000-plane.angVel.x*1.2,-.45,.45);
  }
}
/* ===== ILS GUIDANCE: LOC/GS deviation + MSFS-style purple approach path ===== */
function ilsCalc(){
  const o={valid:false,loc:0,gs:0,d:0};
  if(!(runwayLenM>0))return o;
  const h=runwayHdgDeg*Math.PI/180,dX=Math.sin(h),dZ=-Math.cos(h),pX=Math.cos(h),pZ=Math.sin(h);
  const along=plane.pos.x*dX+plane.pos.z*dZ,across=plane.pos.x*pX+plane.pos.z*pZ;
  const d=(-runwayLenM/2+350)-along;
  if(d<150||d>40000)return o;
  const ang=Math.atan2(across,d)*180/Math.PI;
  if(Math.abs(ang)>25)return o;
  const gsAng=Math.atan2(plane.pos.y-(runwayY+ACFG.gearHeight),d)*180/Math.PI;
  o.valid=true;o.loc=-ang/2.5;o.gs=(gsAng-3)/0.7;o.d=d;o.angDeg=ang;
  return o;
}
/* Purple checkpoints: single source of truth is SET.purple (default off). Any toggle path (\ key, cockpit button, settings) saves it. */
const ILSP={get on(){return !!SET.purple;},set on(v){SET.purple=!!v;saveSet();}};

/* ===== SETTINGS PANEL (gear button bottom-left) ===== */
(function settingsPanel(){
  const css='#setBtn{position:fixed;left:14px;bottom:14px;z-index:70;font:600 12px system-ui,sans-serif;letter-spacing:.06em;padding:7px 11px;border-radius:9px;border:1px solid rgba(120,220,255,.45);background:rgba(10,20,34,.8);color:#bfefff;cursor:pointer}'+
  '#setPanel{position:fixed;left:14px;bottom:56px;z-index:71;width:290px;max-height:70vh;overflow:auto;display:none;padding:14px;border-radius:12px;background:rgba(8,14,24,.97);border:1px solid rgba(120,220,255,.35);color:#dff6ff;font:500 13px/1.35 system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.6)}'+
  '#setPanel.show{display:block}'+
  '#setPanel h3{margin:14px 0 6px;font:700 11px system-ui,sans-serif;letter-spacing:.12em;color:#7fc7ff;text-transform:uppercase}'+
  '#setPanel h3:first-child{margin-top:4px}'+
  '#setPanel .sr{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0}'+
  '#setPanel .sd{font-size:11px;color:#8aa4bb;margin:2px 0 4px}'+
  '#setPanel button.sb{font:600 12px system-ui,sans-serif;padding:6px 10px;border-radius:8px;border:1px solid #2a4a66;background:#10203a;color:#bfefff;cursor:pointer}'+
  '#setPanel button.sb.on{background:#1c5a7a;border-color:#38d6ff;color:#fff}'+
  '#setPanel .seg{display:flex;gap:6px}#setPanel .seg button{flex:1}'+
  '#setPanel .x{float:right;background:none;border:none;color:#8aa4bb;font-size:16px;cursor:pointer}';
  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);
  const btn=document.createElement('button');btn.id='setBtn';btn.textContent='⚙ SETTINGS';
  const pnl=document.createElement('div');pnl.id='setPanel';
  document.body.appendChild(btn);document.body.appendChild(pnl);
  const onOff=v=>`<button class="sb${v?' on':''}" data-t>${v?'ON':'OFF'}</button>`;
  function render(){
    const simple=SET.rudder==='simple';
    pnl.innerHTML=`<button class="x" data-x title="Close">✕</button>
      <h3>Flight controls</h3>
      <div class="sr"><span>Rudder control</span></div>
      <div class="seg">
        <button class="sb${simple?' on':''}" data-r="simple">SIMPLE</button>
        <button class="sb${!simple?' on':''}" data-r="realistic">REALISTIC</button>
      </div>
      <div class="sd">${simple?'Ailerons roll the aircraft cleanly. No pedal input needed (auto-coordinated).':'Q/E pedals are needed. Ailerons cause adverse yaw and the rudder responds more slowly.'}</div>
      <h3>Approach</h3>
      <div class="sr"><span>Purple ILS checkpoints</span>${onOff(SET.purple).replace('data-t','data-p')}</div>
      <div class="sd">Purple approach path on the map (during APPR) and the 3D ILS path. Shortcut: \\ key.</div>
      <h3>System</h3>
      <div class="sr"><span>Invert mouse pitch</span>${onOff(mouseInvert).replace('data-t','data-m')}</div>
      <div class="sr"><span>Restore defaults</span><button class="sb" data-reset>RESET</button></div>`;
  }
  btn.addEventListener('click',()=>{pnl.classList.toggle('show');if(pnl.classList.contains('show'))render();});
  pnl.addEventListener('click',e=>{
    const t=e.target.closest('button');if(!t)return;
    if(t.hasAttribute('data-x')){pnl.classList.remove('show');return;}
    if(t.dataset.r){SET.rudder=t.dataset.r;saveSet();showMsg('RUDDER · '+SET.rudder.toUpperCase(),1500);}
    else if(t.hasAttribute('data-p')){ILSP.on=!ILSP.on;showMsg('PURPLE ILS CHECKPOINTS '+(SET.purple?'ON':'OFF'),1500);}
    else if(t.hasAttribute('data-m')){mouseInvert=!mouseInvert;try{localStorage.setItem('bf737_mouse_inv',mouseInvert?'1':'0');}catch(e){}const ms=document.getElementById('mouseSel');if(ms)ms.value=mouseInvert?'inv':'std';}
    else if(t.hasAttribute('data-reset')){Object.assign(SET,SET_DEF);saveSet();mouseInvert=false;try{localStorage.setItem('bf737_mouse_inv','0');}catch(e){}const ms=document.getElementById('mouseSel');if(ms)ms.value='std';showMsg('SETTINGS RESTORED TO DEFAULTS',1500);}
    render();
  });
})();
(function(){
  const root=new BABYLON.TransformNode('ilsRoot',scene);
  const mk=(n,a)=>{const m=new BABYLON.StandardMaterial(n,scene);m.emissiveColor=new BABYLON.Color3(.80,.34,1);m.diffuseColor=new BABYLON.Color3(0,0,0);m.disableLighting=true;m.alpha=a;m.fogEnabled=false;return m;};
  const matF=mk('ilsFrameM',.9),matL=mk('ilsLineM',.5),matC=mk('ilsDashM',.95);
  const HW=95,HH=42,T3=Math.tan(3*Math.PI/180),NM=1852,NF=16,DMAX=NF*NM;
  const unit=()=>{const b=BABYLON.MeshBuilder.CreateBox('ilsB',{size:1},scene);b.isPickable=false;b.parent=root;b.alwaysSelectAsActiveMesh=true;b.applyFog=false;return b;};
  const frames=unit(),lines=unit(),dash=unit();frames.material=matF;lines.material=matL;dash.material=matC;
  const I=(m,sx,sy,sz,x,y,z,q)=>m.thinInstanceAdd(BABYLON.Matrix.Compose(new BABYLON.Vector3(sx,sy,sz),q||BABYLON.Quaternion.Identity(),new BABYLON.Vector3(x,y,z)),false);
  for(let i=1;i<=NF;i++){const D=i*NM,cy=D*T3,t=1.4+D*.0016;
    I(frames,2*HW+t,t,t,0,cy+HH,D);I(frames,2*HW+t,t,t,0,cy-HH,D);I(frames,t,2*HH+t,t,-HW,cy,D);I(frames,t,2*HH+t,t,HW,cy,D);}
  let ang=Math.atan(T3);if(BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,0,1),BABYLON.Matrix.RotationX(ang)).y<0)ang=-ang;
  const q=BABYLON.Quaternion.RotationAxis(new BABYLON.Vector3(1,0,0),ang),L=Math.hypot(DMAX,DMAX*T3);
  for(const [sx,sy] of [[-1,-1],[1,-1],[-1,1],[1,1]])I(lines,1.5,1.5,L,sx*HW,sy*HH+DMAX*T3/2,DMAX/2,q);
  for(let D=300;D<DMAX;D+=260)I(dash,2.4+D*.0014,2.4+D*.0014,110,0,D*T3,D,q);
  [frames,lines,dash].forEach(m=>m.thinInstanceBufferUpdated('matrix'));
  window.addEventListener('keydown',e=>{if(e.code==='Backslash'&&!/INPUT|SELECT|TEXTAREA/.test((e.target||{}).tagName||'')){ILSP.on=!ILSP.on;showMsg('ILS APPROACH PATH '+(ILSP.on?'ON':'OFF'),1400);}});
  const phase=()=>performance.now()/1000;
  scene.registerBeforeRender(()=>{
    let il;try{il=ilsCalc();}catch(e){il={valid:false};}window._ilsDev=il;
    const show=ILSP.on&&runwayLenM>0&&il.d>0&&il.d<40000&&!plane.onGround&&Math.abs(il.angDeg||99)<40;
    root.setEnabled(!!show);if(!show)return;
    const h=runwayHdgDeg*Math.PI/180,al=-runwayLenM/2+350;
    root.position.set(Math.sin(h)*al,runwayY+ACFG.gearHeight,-Math.cos(h)*al);root.rotation.y=-h;
    const p=.8+.2*Math.sin(phase()*3);matC.alpha=.55+.4*p;matF.alpha=(AP.appr?.95:.7);
  });
})();
function fpDist(i){const wp=FP.wps[i],w=llToWorld(wp.lat,wp.lon);return Math.hypot(w.x-plane.pos.x,w.z-plane.pos.z);}
/* Rough top-of-descent point on the active leg, using the standard 3:1 rule
   (3 nm of track per 1000ft to lose). Returns null if there's nothing to
   descend for, or the leg is too short to show a meaningful marker. */
function todInfo(){
  if(!FP.wps.length||FP.active>=FP.wps.length)return null;
  const wp=FP.wps[FP.active];
  if(wp.alt==null)return null;
  const curFt=plane.pos.y*3.28084,deltaFt=curFt-wp.alt;
  if(deltaFt<=80)return null;
  const legNm=fpDist(FP.active)/1852;
  const todNm=deltaFt/1000*3;
  if(todNm>=legNm)return null;
  const f=BABYLON.Scalar.Clamp((legNm-todNm)/legNm,0,1);
  const w=llToWorld(wp.lat,wp.lon);
  return {x:plane.pos.x+(w.x-plane.pos.x)*f,z:plane.pos.z+(w.z-plane.pos.z)*f,todNm};
}
function addWaypoint(lat,lon,name,alt){FP.n++;FP.wps.push({name:name||('WPT'+String(FP.n).padStart(2,'0')),lat,lon,alt:(alt&&isFinite(alt))?alt:null});if(FP.active>=FP.wps.length-1&&FP.active>FP.wps.length-1)FP.active=FP.wps.length-1;renderFMS();}
const MAPV={mpp:70,follow:true,cx:0,cz:0,tap:true,hdgUp:false};
(function(){
  const fms=document.createElement('div');fms.id='fms';
  fms.innerHTML=`<div class="fh"><span>FMS · MAP · AUTOPILOT</span><button id="fmsX">✕</button></div>
  <canvas id="mapC" width="480" height="400"></canvas>
  <div class="row"><button id="mZi">＋</button><button id="mZo">－</button><button id="mCtr" class="on">⌖ FOLLOW</button><button id="mHup">HDG UP</button><button id="mTap" class="on">TAP = ADD WPT</button><span class="lbl">WPT ALT</span><input id="wpAlt" type="number" placeholder="ft"></div>
  <div class="st" id="navSt"></div>
  <div class="lbl">AUTOPILOT</div>
  <div class="row"><button id="aAP">AP</button><button id="aHDG">HDG</button><button id="aLNAV">LNAV</button><button id="aALT">ALT</button><button id="aVS">V/S</button><button id="aSPD">A/THR</button><button id="aVNAV">VNAV</button><button id="aAPPR">APPR</button></div>
  <div class="row"><span class="lbl">HDG</span><input id="iHDG" type="number" min="0" max="360"><span class="lbl">ALT</span><input id="iALT" type="number" step="100"><span class="lbl">V/S</span><input id="iVS" type="number" step="100"><span class="lbl">SPD</span><input id="iSPD" type="number" step="5"></div>
  <div class="lbl">FLIGHT PLAN</div><div class="st" id="fpSt"></div>
  <div id="wpList"></div>
  <div class="row"><select id="apSel"></select><button id="apAdd">+ ADD AIRPORT</button><button id="fpClr">CLEAR</button><button id="fpRtn">RTN HOME</button></div>
  <div class="lbl" style="margin-top:4px">APPR flies the ILS-style approach to the runway at your start airport (set gear &amp; flaps yourself).</div>`;
  document.body.appendChild(fms);
  const fb=document.createElement('button');fb.id='fmsBtn';fb.textContent='🗺 FMS / MAP (J)';document.body.appendChild(fb);
  const $=id=>document.getElementById(id);
  const toggle=()=>{fms.classList.toggle('show');if(fms.classList.contains('show'))renderFMS();};
  fb.addEventListener('click',toggle);$('fmsX').addEventListener('click',toggle);
  window.addEventListener('keydown',e=>{if(e.code==='KeyJ'&&!e.shiftKey&&!/INPUT|SELECT/.test((e.target||{}).tagName||''))toggle();});
  fms.addEventListener('keydown',e=>e.stopPropagation());fms.addEventListener('keyup',e=>e.stopPropagation());
  const sel=$('apSel');for(const k in LOCS){const o=document.createElement('option');o.value=k;o.textContent=k;sel.appendChild(o);}
  $('apAdd').addEventListener('click',()=>{const L=LOCS[sel.value];if(L)addWaypoint(L.lat,L.lon,sel.value,null);});
  $('fpClr').addEventListener('click',()=>{FP.wps=[];FP.active=0;AP.lnav=false;renderFMS();});
  $('fpRtn').addEventListener('click',()=>{const c=currentLocation;addWaypoint(c.lat,c.lon,(c.code||'HOME'),null);});
  $('mZi').addEventListener('click',()=>{MAPV.mpp=Math.max(10,MAPV.mpp/1.6);});
  $('mZo').addEventListener('click',()=>{MAPV.mpp=Math.min(6000,MAPV.mpp*1.6);});
  $('mCtr').addEventListener('click',()=>{MAPV.follow=!MAPV.follow;if(!MAPV.follow){MAPV.cx=plane.pos.x;MAPV.cz=plane.pos.z;}$('mCtr').classList.toggle('on',MAPV.follow);});
  $('mTap').addEventListener('click',()=>{MAPV.tap=!MAPV.tap;$('mTap').classList.toggle('on',MAPV.tap);});
  $('mHup').addEventListener('click',()=>{MAPV.hdgUp=!MAPV.hdgUp;$('mHup').classList.toggle('on',MAPV.hdgUp);$('mHup').textContent=MAPV.hdgUp?'HDG UP':'NORTH UP';});
  const aEn=()=>{if(AP.apInhibit){showMsg('RAISE DISENGAGE BAR');return false;}if(!AP.master){AP.master=true;if(!AP.hdgMode&&!AP.lnav&&!AP.appr){const m=BABYLON.Matrix.Identity();plane.quat.toRotationMatrix(m);const f=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,0,1),m);AP.hdgTarget=Math.round((Math.atan2(f.x,-f.z)*180/Math.PI+360)%360);AP.hdgMode=true;}
    if(!AP.altMode&&!AP.vsMode&&!AP.appr){AP.altMode=true;AP.altTarget=Math.round(plane.pos.y*3.28084/100)*100;}}return true;};
  $('aAP').addEventListener('click',()=>{if(AP.master){AP.master=false;AP.appr=false;showMsg('AUTOPILOT OFF');}else if(aEn())showMsg('AUTOPILOT ENGAGED');});
  $('aHDG').addEventListener('click',()=>{AP.hdgMode=!AP.hdgMode;if(AP.hdgMode){AP.lnav=false;AP.appr=false;aEn();}});
  $('aLNAV').addEventListener('click',()=>{if(!FP.wps.length){showMsg('NO FLIGHT PLAN · ADD WAYPOINTS');return;}AP.lnav=!AP.lnav;if(AP.lnav){AP.hdgMode=false;AP.appr=false;if(FP.active>=FP.wps.length)FP.active=0;aEn();}});
  $('aALT').addEventListener('click',()=>{AP.altMode=!AP.altMode;if(AP.altMode){AP.vsMode=false;AP.appr=false;aEn();}});
  $('aVS').addEventListener('click',()=>{AP.vsMode=!AP.vsMode;if(AP.vsMode){AP.altMode=false;AP.appr=false;AP.vsTarget=Math.round(plane.vel.y*196.85/100)*100;aEn();}});
  $('aSPD').addEventListener('click',()=>{AP.athr=!AP.athr;if(AP.athr){AP.athrArmed=true;AP.spdMode=true;AP.spdTarget=Math.round(plane.speed*1.94384/5)*5;}else AP.spdMode=false;});
  $('aVNAV').addEventListener('click',()=>{AP.vnav=!AP.vnav;});
  $('aAPPR').addEventListener('click',()=>{
    if(AP.appr){AP.appr=false;showMsg('APPROACH MODE OFF');return;}
    if(runwayLenM<=0){showMsg('NO RUNWAY AT THIS LOCATION');return;}
    const h=runwayHdgDeg*Math.PI/180,al=plane.pos.x*Math.sin(h)-plane.pos.z*Math.cos(h),ac=plane.pos.x*Math.cos(h)+plane.pos.z*Math.sin(h);
    if(al>-runwayLenM/2||Math.abs(ac)>5000||al<-25000){showMsg('APPR · FLY TO ≤13 NM FINAL FIRST (BEHIND THRESHOLD)',3500);return;}
    AP.appr=true;AP.lnav=false;AP.hdgMode=false;AP.altMode=false;AP.vsMode=false;AP.athrArmed=true;AP.athr=true;AP.spdMode=true;AP.spdTarget=plane.flaps>=3?145:165;aEn();showMsg('APPROACH ARMED · SET GEAR & FLAPS',3500);});
  const bind=(id,fn)=>$(id).addEventListener('change',()=>{const v=parseFloat($(id).value);if(isFinite(v))fn(v);});
  bind('iHDG',v=>{AP.hdgTarget=((Math.round(v)%360)+360)%360;});bind('iALT',v=>{AP.altTarget=Math.max(0,v);});bind('iVS',v=>{AP.vsTarget=v;});bind('iSPD',v=>{AP.spdTarget=v;});
  $('wpList').addEventListener('click',e=>{const t=e.target.closest('button');if(!t)return;const i=+t.dataset.i;
    if(t.dataset.a==='x'){FP.wps.splice(i,1);if(FP.active>i)FP.active--;}
    else if(t.dataset.a==='d'){FP.active=i;AP.lnav=true;AP.hdgMode=false;AP.appr=false;aEn();}
    renderFMS();});
  const mc=$('mapC');let pd=null,moved=0;
  const scr=(e)=>{const r=mc.getBoundingClientRect();return[(e.clientX-r.left)*mc.width/r.width,(e.clientY-r.top)*mc.height/r.height];};
  mc.addEventListener('pointerdown',e=>{pd=scr(e);moved=0;mc.setPointerCapture(e.pointerId);});
  mc.addEventListener('pointermove',e=>{if(!pd)return;const q=scr(e);let dx=q[0]-pd[0],dy=q[1]-pd[1];moved+=Math.abs(dx)+Math.abs(dy);
    if(moved>6){if(MAPV.follow){MAPV.follow=false;$('mCtr').classList.remove('on');MAPV.cx=plane.pos.x;MAPV.cz=plane.pos.z;}
      if(_mapRot){const s=Math.sin(-_mapRot),c=Math.cos(-_mapRot),rx=dx*c-dy*s,ry=dx*s+dy*c;dx=rx;dy=ry;}
      MAPV.cx-=dx*MAPV.mpp;MAPV.cz-=dy*MAPV.mpp;pd=q;}});
  mc.addEventListener('pointerup',e=>{if(pd&&moved<=6&&MAPV.tap){const q=scr(e),cx=MAPV.follow?plane.pos.x:MAPV.cx,cz=MAPV.follow?plane.pos.z:MAPV.cz;
      let dx=q[0]-mc.width/2,dz=q[1]-mc.height/2;
      if(_mapRot){const s=Math.sin(-_mapRot),c=Math.cos(-_mapRot),rx=dx*c-dz*s,rz=dx*s+dz*c;dx=rx;dz=rz;}
      const wx=cx+dx*MAPV.mpp,wz=cz+dz*MAPV.mpp,ll=worldToLL(wx,wz);addWaypoint(ll.lat,ll.lon,null,parseFloat($('wpAlt').value));}
    pd=null;});
  mc.addEventListener('wheel',e=>{e.preventDefault();MAPV.mpp=Math.max(10,Math.min(6000,MAPV.mpp*(e.deltaY>0?1.2:1/1.2)));},{passive:false});
  window.renderFMS=function(){
    const L=$('wpList');let h='';
    FP.wps.forEach((w,i)=>{const d=fpDist(i)/1852;h+=`<div class="wp ${i===FP.active&&AP.lnav?'act':''}"><span>${i+1}. ${w.name}${w.alt?' @'+w.alt:''} · ${d.toFixed(1)}nm</span><span><button data-a="d" data-i="${i}">DIR</button> <button data-a="x" data-i="${i}">✕</button></span></div>`;});
    L.innerHTML=h||'<div class="lbl">No waypoints. Tap the map or add an airport.</div>';
  };
  const mctx=mc.getContext('2d');
  // world -> screen transform the pointer handlers also need, kept in sync with drawMap's own
  let _mapRot=0; // current heading-up rotation (0 in north-up mode), refreshed every drawMap()
  function mapToScreen(x,z,cx,cz,mpp,W,H,rot){
    let dx=(x-cx)/mpp,dz=(z-cz)/mpp;
    if(rot){const s=Math.sin(rot),c=Math.cos(rot);const rx=dx*c-dz*s,rz=dx*s+dz*c;dx=rx;dz=rz;}
    return[W/2+dx,H/2+dz];
  }
  function drawMap(){
    const W=mc.width,H=mc.height,cx=MAPV.follow?plane.pos.x:MAPV.cx,cz=MAPV.follow?plane.pos.z:MAPV.cz,mpp=MAPV.mpp;
    const mm=BABYLON.Matrix.Identity();plane.quat.toRotationMatrix(mm);const f=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,0,1),mm),hd=Math.atan2(f.x,-f.z);
    const rot=MAPV.hdgUp?-hd:0;_mapRot=rot;
    const px=(x,z)=>mapToScreen(x,z,cx,cz,mpp,W,H,rot);
    mctx.fillStyle='#10202a';mctx.fillRect(0,0,W,H);
    try{
      const c0=worldToLL(cx,cz);let z=Math.round(Math.log2(156543.03*Math.cos(c0.lat*Math.PI/180)/mpp));z=Math.max(3,Math.min(16,z));
      const nw=worldToLL(cx-W/2*mpp,cz-H/2*mpp),se=worldToLL(cx+W/2*mpp,cz+H/2*mpp);let r=tileRange(nw,se,z);
      while(z>3&&(r.x1-r.x0+1)*(r.y1-r.y0+1)>30){z--;r=tileRange(nw,se,z);}
      let loads=0;
      mctx.save();mctx.translate(W/2,H/2);mctx.rotate(rot);mctx.translate(-W/2,-H/2);
      for(let tx=r.x0;tx<=r.x1;tx++)for(let ty=r.y0;ty<=r.y1;ty++){
        const key=`${Imagery.mode}/${useCanadaImagery?'ca':'ww'}/${z}/${tx}/${ty}`,img=imgCache.get(key);
        if(!img){if(loads<6&&!imgPending.has(key)){loads++;loadImage(key,Imagery.url(z,tx,ty),OFFMAP.imgKey(!!getCanadaRegionForTile(z,tx,ty),z,tx,ty));}continue;}
        const p0=llToWorld(ty2lat(ty,z),tx2lon(tx,z)),p1=llToWorld(ty2lat(ty+1,z),tx2lon(tx+1,z));
        const a=mapToScreen(p0.x,p0.z,cx,cz,mpp,W,H,0),b=mapToScreen(p1.x,p1.z,cx,cz,mpp,W,H,0);
        mctx.drawImage(img,a[0],a[1],b[0]-a[0]+.6,b[1]-a[1]+.6);
      }
      mctx.restore();
    }catch(e){}
    mctx.fillStyle='rgba(0,8,16,.32)';mctx.fillRect(0,0,W,H);
    const pp=px(plane.pos.x,plane.pos.z);mctx.strokeStyle='rgba(120,220,255,.4)';mctx.lineWidth=1;mctx.font='11px monospace';mctx.fillStyle='#9fe0ff';mctx.textAlign='left';
    let ring=[1,2,5,10,20,50,100,200].find(n=>n*1852/mpp>60)||200;
    for(let k=1;k<=3;k++){const rr=ring*k*1852/mpp;mctx.beginPath();mctx.arc(pp[0],pp[1],rr,0,6.2832);mctx.stroke();mctx.fillText(ring*k+'nm',pp[0]+rr*.71+2,pp[1]-rr*.71);}
    if(runwayLenM>0){const h=runwayHdgDeg*Math.PI/180,a=px(-Math.sin(h)*runwayLenM/2,Math.cos(h)*runwayLenM/2),b=px(Math.sin(h)*runwayLenM/2,-Math.cos(h)*runwayLenM/2);
      mctx.strokeStyle='#fff';mctx.lineWidth=Math.max(2,runwayWidM/mpp);mctx.beginPath();mctx.moveTo(a[0],a[1]);mctx.lineTo(b[0],b[1]);mctx.stroke();
      if(ILSP.on&&AP.appr){const ext=px(-Math.sin(h)*(runwayLenM/2+22000),Math.cos(h)*(runwayLenM/2+22000));mctx.strokeStyle='rgba(205,110,255,.95)';mctx.lineWidth=2.2;mctx.setLineDash([10,6]);mctx.beginPath();mctx.moveTo(a[0],a[1]);mctx.lineTo(ext[0],ext[1]);mctx.stroke();mctx.setLineDash([]);
        mctx.fillStyle='#d58bff';mctx.font='bold 10px monospace';
        for(let nm=2;nm<=11;nm+=(nm<4?2:(nm<10?3:1))){const d2=runwayLenM/2+nm*1852;if(d2>runwayLenM/2+22000)break;const q=px(-Math.sin(h)*d2,Math.cos(h)*d2);mctx.beginPath();mctx.arc(q[0],q[1],3.2,0,6.2832);mctx.fill();mctx.fillText(nm+' nm',q[0]+6,q[1]+3);}
        mctx.fillText('ILS '+(RUNWAYS&&currentLocation&&RUNWAYS[currentLocation.code]&&RUNWAYS[currentLocation.code].des?RUNWAYS[currentLocation.code].des[0]:''),ext[0]+6,ext[1]);}}
    mctx.fillStyle='#fff';for(const k in LOCS){const w=llToWorld(LOCS[k].lat,LOCS[k].lon),q=px(w.x,w.z);if(q[0]<-20||q[0]>W+20||q[1]<-20||q[1]>H+20)continue;mctx.beginPath();mctx.arc(q[0],q[1],3,0,6.2832);mctx.fill();mctx.font='bold 11px monospace';mctx.fillText(k,q[0]+5,q[1]-4);}
    if(FP.wps.length){
      mctx.strokeStyle='#ff5cff';mctx.lineWidth=2.5;mctx.beginPath();
      const st=Math.min(FP.active,FP.wps.length-1);mctx.moveTo(pp[0],pp[1]);
      for(let i=st;i<FP.wps.length;i++){const w=llToWorld(FP.wps[i].lat,FP.wps[i].lon),q=px(w.x,w.z);mctx.lineTo(q[0],q[1]);}mctx.stroke();
      FP.wps.forEach((wp,i)=>{const w=llToWorld(wp.lat,wp.lon),q=px(w.x,w.z),act=AP.lnav&&i===FP.active;
        mctx.fillStyle=act?'#ff5cff':'#ffd0ff';mctx.beginPath();mctx.moveTo(q[0],q[1]-7);mctx.lineTo(q[0]+6,q[1]);mctx.lineTo(q[0],q[1]+7);mctx.lineTo(q[0]-6,q[1]);mctx.closePath();mctx.fill();
        mctx.font='bold 11px monospace';mctx.fillText(wp.name,q[0]+8,q[1]+4);});
      if(AP.lnav){try{const tod=todInfo();if(tod){const q=px(tod.x,tod.z);
        mctx.save();mctx.translate(q[0],q[1]);mctx.strokeStyle='#ffd400';mctx.fillStyle='#ffd400';mctx.lineWidth=2;
        mctx.beginPath();mctx.moveTo(-7,-7);mctx.lineTo(7,7);mctx.moveTo(7,-7);mctx.lineTo(-7,7);mctx.stroke();
        mctx.font='bold 10px monospace';mctx.textAlign='center';mctx.fillText('TOD',0,16);mctx.restore();mctx.textAlign='left';}}catch(e){}}}
    // ground track vector: where the aircraft is actually tracking over the next ~60s, not just where the nose points
    {const gsp=Math.hypot(plane.vel.x,plane.vel.z);
      if(gsp>3){const trkHd=Math.atan2(plane.vel.x,-plane.vel.z);const ahead=mapToScreen(plane.pos.x+Math.sin(trkHd)*gsp*60,plane.pos.z-Math.cos(trkHd)*gsp*60,cx,cz,mpp,W,H,rot);
        mctx.strokeStyle='rgba(255,212,0,.65)';mctx.lineWidth=1.5;mctx.setLineDash([4,4]);mctx.beginPath();mctx.moveTo(pp[0],pp[1]);mctx.lineTo(ahead[0],ahead[1]);mctx.stroke();mctx.setLineDash([]);}}
    mctx.save();mctx.translate(pp[0],pp[1]);mctx.rotate(hd+rot);mctx.fillStyle='#ffd400';mctx.strokeStyle='#000';mctx.lineWidth=1.5;
    mctx.beginPath();mctx.moveTo(0,-13);mctx.lineTo(8,8);mctx.lineTo(0,4);mctx.lineTo(-8,8);mctx.closePath();mctx.fill();mctx.stroke();mctx.restore();
    for(const t of traffic){const q=px(t.pos.x,t.pos.z);mctx.fillStyle=t.lvl===2?'#ff3030':(t.lvl===1?'#ffb000':'#40e0ff');mctx.beginPath();mctx.arc(q[0],q[1],4,0,6.2832);mctx.fill();}
    // compass rose: a small N marker that actually swings around in heading-up mode
    mctx.save();mctx.translate(28,28);mctx.rotate(rot);mctx.strokeStyle='rgba(255,255,255,.55)';mctx.lineWidth=1;mctx.beginPath();mctx.arc(0,0,16,0,6.2832);mctx.stroke();
    mctx.fillStyle='#fff';mctx.font='bold 12px monospace';mctx.textAlign='center';mctx.fillText('N',0,-18);
    mctx.beginPath();mctx.moveTo(0,-16);mctx.lineTo(3,-9);mctx.lineTo(-3,-9);mctx.closePath();mctx.fillStyle='#ff5050';mctx.fill();
    mctx.restore();mctx.textAlign='left';
    mctx.fillStyle='#fff';mctx.font='bold 11px monospace';mctx.fillText(MAPV.hdgUp?'HDG '+Math.round(((hd*180/Math.PI)+360)%360)+'°':'NORTH UP',44,24);
  }
  setInterval(()=>{
    if(!fms.classList.contains('show'))return;
    drawMap();
    const act=(id,on)=>$(id).classList.toggle('on',!!on);
    act('aAP',AP.master);act('aHDG',AP.hdgMode&&AP.master);act('aLNAV',AP.lnav&&AP.master);act('aALT',AP.altMode&&AP.master);act('aVS',AP.vsMode&&AP.master);act('aSPD',AP.athr);act('aVNAV',AP.vnav);act('aAPPR',AP.appr);
    const fv=(id,v)=>{const e=$(id);if(document.activeElement!==e)e.value=Math.round(v);};
    fv('iHDG',AP.hdgTarget);fv('iALT',AP.altTarget);fv('iVS',AP.vsTarget);fv('iSPD',AP.spdTarget);
    let st='';if(AP.appr)st='APPROACH · LOC/GS TRACKING';else if(AP.lnav&&FP.active<FP.wps.length){const d=fpDist(FP.active),g=Math.max(30,Math.hypot(plane.vel.x,plane.vel.z));st='LNAV → '+FP.wps[FP.active].name+' · '+(d/1852).toFixed(1)+' nm · ETA '+Math.round(d/g/60*10)/10+' min';}
    else if(FP.wps.length)st='LNAV OFF · '+FP.wps.length+' waypoints';$('fpSt').textContent=st;
    {
      const gs=Math.hypot(plane.vel.x,plane.vel.z),gsKt=gs*1.94384;
      const mm2=BABYLON.Matrix.Identity();plane.quat.toRotationMatrix(mm2);
      const trk=gs>3?((Math.atan2(plane.vel.x,-plane.vel.z)*180/Math.PI)+360)%360:null;
      let navTxt='GS '+Math.round(gsKt)+'kt'+(trk!=null?' · TRK '+Math.round(trk)+'°':'');
      if(FP.wps.length&&FP.active<FP.wps.length){
        const wp=FP.wps[FP.active],w=llToWorld(wp.lat,wp.lon),dx=w.x-plane.pos.x,dz=w.z-plane.pos.z,distNm=Math.hypot(dx,dz)/1852;
        const brg=((Math.atan2(dx,-dz)*180/Math.PI)+360)%360,ete=gs>3?distNm*1852/gs/60:null;
        navTxt+=' · '+wp.name+' BRG '+Math.round(brg)+'° DTG '+distNm.toFixed(1)+'nm'+(ete!=null?' ETE '+ete.toFixed(1)+'m':'');
        const tod=todInfo();if(tod)navTxt+=' · TOD IN '+Math.max(0,(distNm-tod.todNm)).toFixed(1)+'nm';
      }
      $('navSt').textContent=navTxt;
    }
    renderFMS();
  },300);
})();
  let apNodes=[];
/* clone a dressed sim model as a static parked aircraft; merge its parts into a few draw calls */
function parkJet(src,id,parent){
  try{
    const c=src.clone('park_'+id,null);if(!c)return null;
    c.position.set(0,0,0);c.rotation.set(0,0,0);c.rotationQuaternion=null;c.scaling.set(1,1,1);c.setEnabled(true);
    c.getChildTransformNodes(false).forEach(t=>{try{t.setEnabled(true);}catch(e){}});
    const sm=src.getChildMeshes(false),cm=c.getChildMeshes(false),merge=[];
    cm.forEach((m,k)=>{m.isPickable=false;const sr=sm[k];
      if(/_nav|_beacon|llg|llcone/.test(m.name)){m.dispose();return;}
      if(sr&&sr.thinInstanceCount>0&&sr._thinInstanceDataStorage&&sr._thinInstanceDataStorage.matrixData){
        m.thinInstanceSetBuffer('matrix',new Float32Array(sr._thinInstanceDataStorage.matrixData.subarray(0,sr.thinInstanceCount*16)),16,true);m.alwaysSelectAsActiveMesh=true;m.setEnabled(true);return;}
      if(!m.isEnabled()||!m.getTotalVertices()){m.dispose();return;}
      merge.push(m);});
    let merged=null;
    try{if(merge.length>1){merged=BABYLON.Mesh.MergeMeshes(merge,true,true,undefined,false,true);if(merged){merged.parent=c;merged.isPickable=false;merged.name='park_'+id+'_body';}}}catch(e){merged=null;}
    c.parent=parent;
    try{const cs=window._csm;if(cs){const rl=cs.getShadowMap().renderList;c.getChildMeshes(false).forEach(m=>{if(m.getTotalVertices&&m.getTotalVertices()&&!(m.material&&m.material.alpha<.5)){rl.push(m);m.receiveShadows=true;}});}}catch(e){}
    return c;
  }catch(e){console.warn('parkJet',id,e);return null;}
}
function createRunway(code){
  createRunway_BASE_(code);
  apNodes.forEach(n=>{try{n.dispose();}catch(e){}});apNodes=[];
  const rw=RUNWAYS[code];if(!rw)return;
  const h=rw.hdg*Math.PI/180;
  const root=new BABYLON.TransformNode('apRoot',scene);root.position.set(0,runwayY,0);root.rotation.y=Math.atan2(Math.sin(h),-Math.cos(h));apNodes.push(root);
  const CUST=!!rw.custom;
  const L=rw.len,W=rw.wid,mat=(c,e,sp)=>{const m=new BABYLON.StandardMaterial('apm'+Math.random(),scene);m.diffuseColor=new BABYLON.Color3(c[0],c[1],c[2]);if(e)m.emissiveColor=new BABYLON.Color3(e[0],e[1],e[2]);m.specularColor=sp?new BABYLON.Color3(.3,.3,.3):BABYLON.Color3.Black();return m;};
  const box=(w,hh,d,x,y,z,m,par)=>{const b=BABYLON.MeshBuilder.CreateBox('apb',{width:w,height:hh,depth:d},scene);b.position.set(x,y+hh/2,z);b.material=m;b.parent=par||root;b.isPickable=false;return b;};
  const asph=mat([.14,.145,.15]),conc=mat([.55,.55,.53]),wall=mat([.82,.83,.85],null,1),glass=mat([.1,.25,.35],[.03,.08,.12],1),roofM=mat([.3,.32,.35]),hang=mat([.6,.62,.65],null,1);
  const tx=W/2+85;
  const yl=mat([.95,.8,.1],[.4,.32,0]);
  if(!CUST){
  box(24,.12,L*.9,tx,-.05,0,asph);
  for(const z of [-L*.4,-L*.15,L*.15,L*.4]){box(tx-W/2,.12,24,W/2+(tx-W/2)/2,-.05,z,asph);box(.5,.14,24,W/2+30,-.03,z,yl);}
  box(.5,.14,L*.9,tx,-.03,0,yl);
  }
  const tz=-L*.12,tX=tx+300;
  window.apGeo={L,W,tx,root};
  const facade=()=>{const t=new BABYLON.DynamicTexture('facadeT'+Math.random(),{width:512,height:256},scene,true),g=t.getContext();
    const gr=g.createLinearGradient(0,0,0,256);gr.addColorStop(0,'#5f87a3');gr.addColorStop(.55,'#2d4a63');gr.addColorStop(1,'#1d3245');g.fillStyle=gr;g.fillRect(0,0,512,256);
    for(let i=0;i<9;i++){g.fillStyle='rgba(200,230,255,'+(0.04+Math.random()*.06)+')';g.fillRect(Math.random()*512,0,40+Math.random()*80,256);}
    g.fillStyle='#c9ced3';for(let x=0;x<=512;x+=32)g.fillRect(x-2,0,4,256);g.fillRect(0,0,512,10);g.fillRect(0,124,512,8);g.fillRect(0,246,512,10);
    t.update();t.wrapU=t.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;t.anisotropicFilteringLevel=16;return t;};
  const glassF=(us,vs)=>{const m=new BABYLON.StandardMaterial('apGlass'+Math.random(),scene),t=facade();t.uScale=us;t.vScale=vs;m.diffuseTexture=t;
    m.specularColor=new BABYLON.Color3(.7,.75,.8);m.specularPower=90;m.emissiveColor=new BABYLON.Color3(.06,.07,.08);
    if(scene.environmentTexture){m.reflectionTexture=scene.environmentTexture;m.reflectionFresnelParameters=new BABYLON.FresnelParameters();m.reflectionFresnelParameters.bias=.2;m.reflectionFresnelParameters.power=2;}return m;};
  const metal=mat([.6,.62,.65],null,1),dark=mat([.16,.17,.19]),white=mat([.93,.94,.95],null,1),concLt=mat([.68,.68,.66]);
  const cylM=(o,x,y,z,m,par)=>{const c=BABYLON.MeshBuilder.CreateCylinder('apc',o,scene);c.position.set(x,y,z);c.material=m;c.parent=par||root;c.isPickable=false;return c;};
  if(!CUST){
  box(260,.12,520,tx+150,-.06,tz,mat([.25,.25,.245]));box(14,.14,520,tX+52,-.05,tz,asph);
  const tb=box(60,18,320,tX+10,0,tz,glassF(10,1));
  box(74,1.2,340,tX+10,18,tz,metal);
  for(let k=-6;k<=6;k++){const r=cylM({height:74,diameter:3.2,tessellation:10,arc:.5},tX+10,18.4,tz+k*26,metal);r.rotation.z=Math.PI/2;r.rotation.y=0;}
  box(10,.6,300,tX+47,9,tz,metal);for(let k=-7;k<=7;k++)box(.6,9,.6,tX+51,0,tz+k*20,metal);
  const piers=[tz-115,tz+115],pierLen=170,px0=tX-20;
  const gates=[];
  for(const pz of piers){
    box(pierLen,13,24,px0-pierLen/2,0,pz,glassF(6,1));box(pierLen+6,1,28,px0-pierLen/2,13,pz,metal);
    cylM({height:13,diameter:30,tessellation:16},px0-pierLen,6.5,pz,glassF(4,1));cylM({height:1,diameter:33,tessellation:16},px0-pierLen,13.5,pz,metal);
    for(const side of [-1,1])for(let gI=0;gI<2;gI++){gates.push({x:px0-45-gI*72,z:pz+side*12,side});}
  }
  const ylw=mat([.95,.78,.1],[.35,.28,0]);
  gates.forEach((g,n)=>{
    const len=16,bz=g.z+g.side*(len/2);
    box(3.4,3.2,len,g.x+6,4.2,bz,metal);
    cylM({height:3.6,diameter:4.4,tessellation:12},g.x+6,6,g.z+g.side*(len+1),white);
    cylM({height:4.2,diameter:.6,tessellation:6},g.x+6,2.1,g.z+g.side*(len-1),dark);
    box(.35,.08,90,g.x,0,g.z+g.side*48,ylw);
    g.n=n;
  });
  const parkSet=['a350','a320','e190','b777','md83','crj9','b747','dc10','b727','b767'];
  const veh=[];
  const doPark=()=>{
    const MR=window._modelRoots,DR=window._DRESS,FL=window._FLEET;if(!MR||!DR||!DR.a350)return false;
    gates.forEach((g,n)=>{
      const id=parkSet[(n+((L*7)|0))%parkSet.length],src=MR[id];if(!src)return;
      const D=DR[id],nose=D&&D.fus?D.fus[0].z:20,span=D&&D.wing?D.wing[D.wing.length-1].s:20;
      if(span>40&&n%2)return;
      const fd=FL.find(f=>f.model===id),gh=fd&&fd.physics?fd.physics.gearHeight:3;
      const node=parkJet(src,id,root);if(!node)return;
      node.position.set(g.x,gh-.15,g.z+g.side*(nose+18));node.rotation.y=g.side>0?Math.PI:0;apNodes.push(node);
      veh.push([g.x+7,g.z+g.side*(nose+12),3.2,1.6,2.2,[.95,.8,.1]],[g.x-8,g.z+g.side*(nose+4),5,2,2.2,[.9,.9,.9]],[g.x-9,g.z+g.side*(nose+12),3,1.4,1.8,[.3,.4,.6]]);
    });
    [['b747',tx+62,tz-205],['a320',tx+62,tz+200],['dhc8',tx+62,tz+20],['crj9',tx+62,tz-75]].forEach(([id,x,z],k)=>{
      const src=MR[id];if(!src)return;const fd=FL.find(f=>f.model===id),gh=fd&&fd.physics?fd.physics.gearHeight:3;
      const node=parkJet(src,id,root);if(!node)return;node.position.set(x,gh-.15,z);node.rotation.y=-Math.PI/2+(k%2?.08:-.08);apNodes.push(node);
      veh.push([x-4,z+10,7,2.6,3,[.85,.85,.85]],[x+9,z+12,8,3,3.2,[.92,.92,.95]]);});
    buildVeh();return true;};
  const buildVeh=()=>{
    for(let k=0;k<10;k++)veh.push([tx+60+(k%5)*16,tz+228+((k/5)|0)*12,8,3,3.2,[[.95,.95,.95],[.95,.8,.1],[.85,.2,.15]][k%3]]);
    for(let r=0;r<10;r++)for(let k=0;k<26;k++)if(h2(r,k,(L|0))>.25)veh.push([tX+70+r*6,tz-130+k*10,2,1.5,4.4,[[.85,.85,.87],[.2,.2,.22],[.6,.1,.1],[.25,.35,.55],[.55,.56,.58],[.92,.92,.9]][(h2(k,r,3)*6)|0]]);
    const vm=BABYLON.MeshBuilder.CreateBox('apVeh',{size:1},scene);vm.bakeTransformIntoVertices(BABYLON.Matrix.Translation(0,.5,0));
    const vmat=new BABYLON.StandardMaterial('apVehM',scene);vmat.diffuseColor=new BABYLON.Color3(1,1,1);vmat.specularColor=new BABYLON.Color3(.3,.3,.3);vm.material=vmat;vm.parent=root;vm.isPickable=false;
    const mb=[],cb=[];veh.forEach(([x,z,w,h,d,c])=>{mb.push(w,0,0,0, 0,h,0,0, 0,0,d,0, x,0,z,1);cb.push(c[0],c[1],c[2],1);});
    vm.thinInstanceSetBuffer('matrix',new Float32Array(mb),16,true);vm.thinInstanceSetBuffer('color',new Float32Array(cb),4,true);vm.alwaysSelectAsActiveMesh=true;apNodes.push(vm);
  };
  if(!doPark()){let tries=0;const iv=setInterval(()=>{if(doPark()||++tries>240)clearInterval(iv);},250);}
  const lmB=[],lhB=[];for(let k=-3;k<=3;k++){const x=tx+40,z=tz+k*75;lmB.push([x,0,z]);lhB.push([x,30,z]);}
  {const mast=cylM({height:30,diameterTop:.5,diameterBottom:.9,tessellation:6},0,15,0,dark);mast.thinInstanceSetBuffer('matrix',new Float32Array(lmB.flatMap(([x,y,z])=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y+15,z,1])),16,true);mast.position.set(0,0,0);
   const hd=box(4,1,2,0,0,0,mat([1,.95,.8],[1,.92,.75]));hd.thinInstanceSetBuffer('matrix',new Float32Array(lhB.flatMap(([x,y,z])=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1])),16,true);hd.position.set(0,0,0);}
  const twX=tX+30,twZ=tz-230;
  cylM({height:58,diameterTop:7,diameterBottom:11,tessellation:16},twX,29,twZ,white);
  cylM({height:3,diameterTop:15,diameterBottom:8,tessellation:16},twX,59.5,twZ,white);
  cylM({height:7,diameterTop:16.5,diameterBottom:14,tessellation:16},twX,64.5,twZ,glassF(4,1));
  cylM({height:1.4,diameterTop:12,diameterBottom:17.5,tessellation:16},twX,68.7,twZ,dark);
  cylM({height:12,diameterTop:.15,diameterBottom:.5,tessellation:6},twX,75.4,twZ,dark);
  const beacon=BABYLON.MeshBuilder.CreateSphere('apbc',{diameter:1.6},scene);beacon.parent=root;beacon.position.set(twX,81.6,twZ);beacon.material=mat([1,1,1],[1,.3,.2]);
  for(let i=0;i<3;i++){const hz=L*.2+i*95,hx=tx+300;
    box(80,12,70,hx,0,hz,hang);
    const rf=cylM({height:80,diameter:70,tessellation:24,arc:.5},hx,12,hz,metal);rf.rotation.z=Math.PI/2;rf.rotation.x=Math.PI/2;rf.scaling.set(1,1,.32);
    box(.5,11,56,hx-40.2,0,hz,mat([.38,.42,.46],null,1));}
  {
    const litMats=[];
    const tex=(w,h,draw)=>{const t=new BABYLON.DynamicTexture('apT'+Math.random(),{width:w,height:h},scene,true),c=t.getContext();draw(c,w,h);t.update();return t;};
    const signMat=(txt,bg,fg,w,h)=>{const m=new BABYLON.StandardMaterial('apS'+Math.random(),scene);
      m.diffuseTexture=tex(w||512,h||128,(c,W2,H2)=>{c.fillStyle=bg;c.fillRect(0,0,W2,H2);c.fillStyle=fg;c.font='bold '+Math.floor(H2*.62)+'px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(txt,W2/2,H2/2+3);});
      m.emissiveColor=new BABYLON.Color3(.35,.35,.35);m.specularColor=BABYLON.Color3.Black();return m;};
    const plane2=(w,h,x,y,z,rx,ry,m)=>{const p2=BABYLON.MeshBuilder.CreatePlane('apSign',{width:w,height:h},scene);p2.material=m;p2.parent=root;p2.position.set(x,y,z);p2.rotation.x=rx;p2.rotation.y=ry;p2.isPickable=false;return p2;};
    plane2(70,9,tX-20.4,24,tz,0,Math.PI/2,signMat('TERMINAL 1  ·  '+code,'#0d2236','#ffffff',1024,128));
    plane2(70,9,tX+40.4,24,tz,0,-Math.PI/2,signMat('DEPARTURES  ·  ARRIVALS','#0d2236','#ffd400',1024,128));
    gates.forEach((g,n)=>plane2(7,4,g.x,.12,g.z+g.side*28,Math.PI/2,0,signMat(String(n+1),'#3b3b3b','#ffd400',128,64)));
    scene.meshes.forEach(m=>{if(m.name==='apb'&&m.material&&m.material.name.indexOf('apGlass')===0)litMats.push(m.material);});
    {const gx=tX+175,gz=tz-20,gm=mat([.62,.62,.6]);
     const fl=tex(256,256,(c,W2,H2)=>{c.fillStyle='#8c8d8a';c.fillRect(0,0,W2,H2);for(let k=0;k<4;k++){c.fillStyle='#1b2733';c.fillRect(0,k*64+10,W2,40);c.fillStyle='rgba(255,230,160,.9)';c.fillRect(0,k*64+44,W2,3);}});
     const gmat=new BABYLON.StandardMaterial('apGarage',scene);gmat.diffuseTexture=fl;gmat.specularColor=BABYLON.Color3.Black();gmat.diffuseTexture.uScale=4;gmat.diffuseTexture.vScale=1;litMats.push(gmat);
     box(60,20,140,gx,0,gz,gmat);box(62,.8,142,gx,20,gz,gm);
     plane2(14,6,gx-30.3,23,gz,0,Math.PI/2,signMat('P  PARKING','#0b3d91','#fff',512,192));}
    {const fx=tx+330,fz=L*.2+300,fm=mat([.85,.86,.88],null,1);
     for(let a=0;a<2;a++)for(let b=0;b<3;b++){cylM({height:11,diameter:15,tessellation:20},fx+a*22,5.5,fz+b*22,fm);cylM({height:.8,diameter:15.6,tessellation:20},fx+a*22,11.3,fz+b*22,dark);}
     box(60,.5,72,fx+11,0,fz+22,mat([.4,.4,.38]));}
    {const fx=tx+70,fz=tz-345;box(50,8,24,fx,0,fz,wall);box(50,.6,26,fx,8,fz,roofM);
     for(let k=0;k<3;k++)box(12,6,.4,fx-15+k*15,0,fz+12.1,mat([.8,.1,.08],[.12,0,0]));
     veh.push([fx-15,fz+24,9,3.4,3,[.85,.1,.08]],[fx,fz+24,9,3.4,3,[.85,.1,.08]]);}
    {const cx=tx+260,cz=tz+330;box(110,10,50,cx,0,cz,mat([.7,.72,.74],null,1));box(112,.8,52,cx,10,cz,roofM);
     for(let k=0;k<6;k++)box(8,6,.4,cx-45+k*18,0,cz-25.1,dark);}
    const ob=scene.onBeforeRenderObservable.add(()=>{if(root.isDisposed()){scene.onBeforeRenderObservable.remove(ob);return;}
      const nt=(typeof nightMode!=='undefined')&&nightMode;
      for(const m of litMats){try{if(m.emissiveColor)m.emissiveColor.set(nt?.9:.06,nt?.78:.07,nt?.5:.08);}catch(e){}}});
  }
  }
  const lm=(c)=>mat(c,c);
  const mk=(m,d)=>{const b=BABYLON.MeshBuilder.CreateSphere('apl',{diameter:d,segments:4},scene);b.material=m;b.parent=root;b.isPickable=false;return b;};
  const place=(base,pts)=>{base.thinInstanceSetBuffer('matrix',new Float32Array(pts.flatMap(([x,y,z])=>[1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1])),16,true);base.alwaysSelectAsActiveMesh=true;};
  window.apPapi=[];
  const wl=[],amb=[],cwh=[],crd=[],tdz=[],thG=[],thR=[],wingG=[],tl=[],tcl=[],al=[],alR=[],bar=[];
  const EL=Math.min(600,L*.2);
  for(let z=-L/2;z<=L/2+.1;z+=30){const nearEnd=(L/2-Math.abs(z))<EL;for(const sx of [-1,1]){(nearEnd?amb:wl).push([sx*(W/2+2.5),.45,z]);}}
  for(let z=-L/2+15;z<=L/2;z+=15){const d=Math.min(z+L/2,L/2-z);if(d<300)crd.push([0,.2,z]);else if(d<900)((Math.floor(d/15)%2)?crd:cwh).push([0,.2,z]);else cwh.push([0,.2,z]);}
  for(const e of [1,-1])for(let d=60;d<=900&&d<L/2;d+=30)for(const sx of [-1,1])for(const o of [4,6,8])tdz.push([sx*o,.18,e*(-L/2+d)]);
  for(let x=-W/2;x<=W/2;x+=3){thG.push([x,.25,-L/2-.8]);thR.push([x,.25,L/2+.8]);}
  for(const sx of [-1,1])for(let k=0;k<5;k++){wingG.push([sx*(W/2+4+k*2.4),.3,-L/2-1.5]);}
  if(!CUST)for(let z=-L*.45;z<=L*.45;z+=45){tl.push([tx-13,.35,z],[tx+13,.35,z]);tcl.push([tx,.1,z]);}
  for(const side of [1,-1])for(let d=30;d<=900;d+=30){al.push([0,.9,side*(L/2+d)]);if(d%150===0)for(let k=-6;k<=6;k++)if(k)bar.push([k*2.6,.9,side*(L/2+d)]);if(d<=300){for(const sx of [-1,1])alR.push([sx*4.5,.9,side*(L/2+d)]);}}
  const LM=(c,d)=>{const m=lm(c);m.disableLighting=true;m.applyFog=false;return mk(m,d);};
  place(LM([1,1,.92],.8),wl);place(LM([1,.62,.05],.8),amb);place(LM([1,1,.92],.5),cwh);place(LM([1,.1,.08],.5),crd);place(LM([1,1,.92],.45),tdz);
  place(LM([.05,1,.3],.9),thG.concat(wingG));place(LM([1,.08,.06],.9),thR);
  place(LM([.1,.3,1],.7),tl);place(LM([.1,1,.3],.45),tcl);place(LM([1,1,.92],1.3),al.concat(bar));place(LM([1,.1,.08],1.0),alR);
  {const rm=lm([1.4,1.4,1.4]);rm.disableLighting=true;rm.applyFog=false;
   const rab=[1,-1].map(side=>{const s2=BABYLON.MeshBuilder.CreateSphere('apRab',{diameter:2.6,segments:6},scene);s2.material=rm;s2.parent=root;s2.isPickable=false;return s2;});
   const reil=[];for(const sx of [-1,1])for(const e of [1,-1]){const r2=BABYLON.MeshBuilder.CreateSphere('apReil',{diameter:1.8,segments:6},scene);r2.material=rm;r2.parent=root;r2.isPickable=false;r2.position.set(sx*(W/2+14),.9,e*(-L/2-1));reil.push(r2);}
   let tAcc=0;const obs=scene.onBeforeRenderObservable.add(()=>{
     if(!root||root.isDisposed()){scene.onBeforeRenderObservable.remove(obs);return;}
     tAcc+=engine.getDeltaTime()/1000;const step=Math.floor((tAcc%1)*30);
     rab.forEach((m,i)=>{const side=i?-1:1,d=900-step*30;m.position.set(0,1.1,side*(L/2+Math.max(30,d)));m.setEnabled((tAcc*30%1)<.55);});
     const on=(tAcc*2%1)<.12;reil.forEach(m=>m.setEnabled(on));});
  }
  const hoodM=mat([.05,.05,.06],null,1),legM=mat([.9,.9,.9],[.15,.15,.15]);
  for(const e of [1,-1])for(const sideSign of [1,-1])for(let i=0;i<4;i++){
    const px=-e*sideSign*(W/2+16+i*9),pz=e*(-L/2+300);
    cylM({height:.9,diameter:.25,tessellation:6},px,.45,pz,legM);
    box(2.2,1.5,1.8,px,.9,pz,hoodM);
    box(2.6,.15,1.2,px,2.4,pz+e*1.3,hoodM);
    const pm=mat([1,.15,.1],[1.1,.15,.1]);pm.disableLighting=true;pm.specularColor=BABYLON.Color3.Black();
    const pb=BABYLON.MeshBuilder.CreateDisc('papiLens',{radius:.75,tessellation:20},scene);
    pb.material=pm;pb.parent=root;pb.isPickable=false;pb.position.set(px,1.65,pz+e*1.0);
    pb.rotation.y=e>0?0:Math.PI;
    const gl2=BABYLON.MeshBuilder.CreatePlane('papiGlow',{size:5},scene);
    const gm=new BABYLON.StandardMaterial('papiGlowM'+Math.random(),scene);gm.disableLighting=true;gm.emissiveColor=new BABYLON.Color3(1,.2,.1);gm.opacityTexture=window._apGlowTex||(window._apGlowTex=(()=>{const t=new BABYLON.DynamicTexture('apGlowT',{width:64,height:64},scene,false),c=t.getContext(),g=c.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(255,255,255,.45)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,64,64);t.update();t.hasAlpha=true;return t;})());
    gm.backFaceCulling=false;gm.disableDepthWrite=true;gl2.material=gm;gl2.parent=root;gl2.position.set(px,1.65,pz+e*1.2);gl2.billboardMode=BABYLON.Mesh.BILLBOARDMODE_ALL;gl2.isPickable=false;gl2.applyFog=false;gl2.visibility=.0;
    (window.apPapi=window.apPapi||[]).push({e,i,pm,pb,gm,gl:gl2,side:sideSign});
  }
  box(W+30,.1,60,0,-.12,L/2+40,asph);box(W+30,.1,60,0,-.12,-L/2-40,asph);
  if(CUST&&typeof buildKSFO==='function'){try{buildKSFO(rw,code);}catch(e){console.error('KSFO build',e);}}
}
  function buildKSFO(rw,code){
  const root=new BABYLON.TransformNode('ksRoot',scene);root.position.set(0,runwayY,0);apNodes.push(root);
  const RW=KS_RWY,R0=RW[0],R1=RW[1],R2=RW[2],R3=RW[3];
  let _mn=0;
  const sm=(c,e,sp)=>{const m=new BABYLON.StandardMaterial('ksm'+(++_mn),scene);m.diffuseColor=new BABYLON.Color3(c[0],c[1],c[2]);
    if(e)m.emissiveColor=new BABYLON.Color3(e[0],e[1],e[2]);m.specularColor=sp?new BABYLON.Color3(sp,sp,sp):BABYLON.Color3.Black();return m;};
  const dtex=(w,h,draw)=>{const t=new BABYLON.DynamicTexture('ksT'+(++_mn),{width:w,height:h},scene,true),c=t.getContext();draw(c,w,h);t.update();t.anisotropicFilteringLevel=16;return t;};
  const MT={
    asph:sm([.135,.138,.145]),asph2:sm([.17,.172,.178]),conc:sm([.52,.52,.5]),concLt:sm([.7,.7,.68]),
    yellow:sm([.95,.8,.1],[.38,.3,0]),white:sm([.93,.94,.95],null,.35),metal:sm([.6,.62,.65],null,.4),dark:sm([.16,.17,.19]),
    roof:sm([.92,.93,.95],null,.25),hang:sm([.62,.64,.67],null,.3),pier:sm([.28,.3,.32]),bridge:sm([.72,.74,.76],null,.3),
    water:sm([.05,.09,.12]),red:sm([.8,.1,.08],[.12,0,0])
  };
  const litMats=[];
  const glassMat=(us,vs,lit)=>{const m=new BABYLON.StandardMaterial('ksG'+(++_mn),scene);
    const t=dtex(512,256,(g,W,H)=>{const gr=g.createLinearGradient(0,0,0,H);gr.addColorStop(0,'#6d93ae');gr.addColorStop(.55,'#34536b');gr.addColorStop(1,'#213648');g.fillStyle=gr;g.fillRect(0,0,W,H);
      for(let i=0;i<10;i++){g.fillStyle='rgba(210,235,255,'+(0.04+Math.random()*.06)+')';g.fillRect(Math.random()*W,0,40+Math.random()*90,H);}
      g.fillStyle='#d3d8dd';for(let x=0;x<=W;x+=32)g.fillRect(x-2,0,4,H);g.fillRect(0,0,W,9);g.fillRect(0,H/2-4,W,8);g.fillRect(0,H-10,W,10);});
    t.wrapU=t.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;t.uScale=us;t.vScale=vs;m.diffuseTexture=t;
    m.specularColor=new BABYLON.Color3(.7,.75,.8);m.specularPower=90;m.emissiveColor=new BABYLON.Color3(.05,.06,.07);
    if(scene.environmentTexture){m.reflectionTexture=scene.environmentTexture;m.reflectionFresnelParameters=new BABYLON.FresnelParameters();m.reflectionFresnelParameters.bias=.2;m.reflectionFresnelParameters.power=2;}
    if(lit!==false)litMats.push(m);return m;};
  const keep=(m,par)=>{m.parent=par||root;m.isPickable=false;return m;};
  const box=(w,h,d,x,y,z,mat,rotY,par)=>{const b=BABYLON.MeshBuilder.CreateBox('ksb',{width:w,height:h,depth:d},scene);b.position.set(x,y+h/2,z);if(rotY)b.rotation.y=rotY;b.material=mat;return keep(b,par);};
  const cyl=(o,x,y,z,mat,par)=>{const c=BABYLON.MeshBuilder.CreateCylinder('ksc',o,scene);c.position.set(x,y,z);c.material=mat;return keep(c,par);};
  const merged=(list,mat,name)=>{if(!list.length)return null;let m;try{m=list.length>1?BABYLON.Mesh.MergeMeshes(list,true,true,undefined,false,false):list[0];}catch(e){console.warn('ks merge',name,e);m=list[0];}
    m.name=name;m.material=mat;return keep(m);};
  const stripMesh=(p,q,w,y,h)=>{const dx=q[0]-p[0],dz=q[1]-p[1],L=Math.hypot(dx,dz);if(L<.05)return null;
    const b=BABYLON.MeshBuilder.CreateBox('ksS',{width:w,height:h,depth:L},scene);b.position.set((p[0]+q[0])/2,y+h/2,(p[1]+q[1])/2);b.rotation.y=Math.atan2(dx,dz);return b;};
  const tiLights=(pts,col,dia,name)=>{if(!pts.length)return null;const s=BABYLON.MeshBuilder.CreateSphere(name||'ksL',{diameter:dia,segments:4},scene);
    const m=sm(col,col);m.disableLighting=true;s.material=m;keep(s);s.applyFog=false;
    const buf=new Float32Array(pts.length*16);for(let i=0;i<pts.length;i++){const o=i*16,p=pts[i];buf[o]=1;buf[o+5]=1;buf[o+10]=1;buf[o+12]=p[0];buf[o+13]=p[1];buf[o+14]=p[2];buf[o+15]=1;}
    s.thinInstanceSetBuffer('matrix',buf,16,true);s.alwaysSelectAsActiveMesh=true;return s;};
  const signTex=(txt,bg,fg,w,h,border)=>{const m=new BABYLON.StandardMaterial('ksSg'+(++_mn),scene);
    m.diffuseTexture=dtex(w||256,h||96,(c,W,H)=>{c.fillStyle=bg;c.fillRect(0,0,W,H);if(border){c.strokeStyle=border;c.lineWidth=6;c.strokeRect(4,4,W-8,H-8);}
      c.fillStyle=fg;c.font='bold '+Math.floor(H*.62)+'px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(txt,W/2,H/2+3);});
    m.emissiveColor=new BABYLON.Color3(.4,.4,.4);m.specularColor=BABYLON.Color3.Black();m.backFaceCulling=false;return m;};
  const sign=(txt,bg,fg,x,z,rotY,w,h,y,border)=>{const p=BABYLON.MeshBuilder.CreatePlane('ksSign',{width:w||4.2,height:h||1.6},scene);p.material=signTex(txt,bg,fg,256,Math.round(256*(h||1.6)/(w||4.2)),border);
    p.position.set(x,(y||1.5)+.8,z);p.rotation.y=rotY||0;keep(p);
    box(.25,y||1.5,.25,x,0,z,MT.dark);return p;};
  const inRwy=(x,z,m)=>{m=m||0;for(const r of RW){const dx=x-r.A[0],dz=z-r.A[1],a=dx*r.ux+dz*r.uz,b=dx*r.uz-dz*r.ux;if(a>-2&&a<r.len+2&&Math.abs(b)<r.wid/2+m)return true;}return false;};
  const asphList=[],yelList=[],tl=[],tcl=[],holdList=[];
  const smooth=(pts,it)=>{for(let k=0;k<it;k++){const o=[pts[0]];for(let i=0;i<pts.length-1;i++){const a=pts[i],b=pts[i+1];
      o.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75]);}o.push(pts[pts.length-1]);pts=o;}return pts;};
  const twy=(pts,wd,opt)=>{opt=opt||{};pts=smooth(pts,opt.smooth===undefined?2:opt.smooth);
    let acc=0,accE=0;
    for(let i=0;i<pts.length-1;i++){
      const p=pts[i],q=pts[i+1],dx=q[0]-p[0],dz=q[1]-p[1],L=Math.hypot(dx,dz);if(L<.1)continue;
      const ux=dx/L,uz=dz/L,st=4,n=Math.max(1,Math.ceil(L/st));
      let runStart=null;
      for(let k=0;k<=n;k++){const t=Math.min(L,k*st),x=p[0]+ux*t,z=p[1]+uz*t,out=!inRwy(x,z,2.5);
        if(out&&runStart===null){runStart=t;if(k>0&&!opt.noHold)holdList.push([x,z,ux,uz,wd]);}
        if((!out||k===n)&&runStart!==null){const e=out?t:Math.max(runStart,t-st);
          const a=[p[0]+ux*runStart,p[1]+uz*runStart],b=[p[0]+ux*e,p[1]+uz*e];
          const s1=stripMesh(a,b,wd,0,.1);if(s1)asphList.push(s1);
          if(!opt.noLine){const s2=stripMesh(a,b,.5,.1,.02);if(s2)yelList.push(s2);}
          if(!out&&!opt.noHold)holdList.push([p[0]+ux*e,p[1]+uz*e,-ux,-uz,wd]);
          runStart=null;}
      }
      if(i>0){const j=BABYLON.MeshBuilder.CreateCylinder('ksJ',{height:.1,diameter:wd,tessellation:18},scene);j.position.set(p[0],.05,p[1]);if(!inRwy(p[0],p[1],3))asphList.push(j);else j.dispose();}
      if(!opt.noLight){
        for(let t=(acc%18===0?0:18-(acc%18));t<L;t+=18){const x=p[0]+ux*t,z=p[1]+uz*t;if(!inRwy(x,z,3))tcl.push([x,.1,z]);}
        for(let t=(accE%30===0?0:30-(accE%30));t<L;t+=30){for(const sd of[-1,1]){const x=p[0]+ux*t-uz*sd*(wd/2+1.6),z=p[1]+uz*t+ux*sd*(wd/2+1.6);if(!inRwy(x,z,3))tl.push([x,.35,z]);}}
        acc=(acc+L)%18;accE=(accE+L)%30;
      }
    }
  };
  const P=ksAt;
  const lineB=[P(R0,120,190),P(R0,R0.len-120,190)];
  const lineA=[P(R0,700,395),P(R0,R0.len-250,395)];
  const lineN=[P(R1,200,-190),P(R1,R1.len-300,-190)];
  const lineF=[P(R3,40,190),P(R3,R3.len-60,190)];
  twy(lineB,23);twy(lineA,23);twy(lineN,23);twy(lineF,23);
  for(const s of [450,950,2450,3000])twy([P(R0,s,190),P(R0,s+35,40)],23,{smooth:1});
  for(const s of [1100,1950,2650,3150])twy([P(R0,s,190),P(R0,s+25,395)],23,{smooth:1});
  for(const s of [500,1500,2500,3300])twy([P(R1,s,-190),P(R1,s-35,-40)],23,{smooth:1});
  for(const s of [750,2900])twy([P(R0,s,190),P(R0,s,-229-190)],23,{smooth:0});
  for(const s of [400,1050,1700])twy([P(R3,s,190),P(R3,s+20,40)],23,{smooth:1});
  twy([P(R2,100,-130),P(R2,R2.len-100,-130)],23);
  for(const s of [500,1300,2100])twy([P(R2,s,-130),P(R2,s+20,-40)],23,{smooth:1});
  const C=KS_TERM,nAir=[-R0.uz,R0.ux],phi0=Math.atan2(nAir[1],nAir[0]);
  const polar=(r,a,off)=>[C[0]+Math.cos(a)*r,C[1]+Math.sin(a)*r];
  const radialBox=(w,h,d,rad,ang,y,mat,par)=>{const pm=polar(rad,ang);return box(w,h,d,pm[0],y,pm[1],mat,-ang,par);};
  {const wedges=[];
   for(let k=0;k<18;k++){const a0=phi0+(-112+k*224/18)*Math.PI/180,a1=phi0+(-112+(k+1)*224/18)*Math.PI/180,am=(a0+a1)/2,ro=445,ri=185;
     const pm=polar((ro+ri)/2,am),ch=2*ro*Math.sin((a1-a0)/2)+3;
     const b=BABYLON.MeshBuilder.CreateBox('ksAp',{width:ro-ri,height:.1,depth:ch},scene);b.position.set(pm[0],.05,pm[1]);b.rotation.y=-am;wedges.push(b);}
   asphList.push(...wedges);}
  merged(asphList,MT.asph,'ksTaxiways');
  merged(yelList,MT.yellow,'ksTaxiLines');
  {const hl=[];const seen=new Set();
   for(const [x,z,ux,uz,wd] of holdList){const key=Math.round(x/12)+','+Math.round(z/12);if(seen.has(key))continue;seen.add(key);
     const rot=Math.atan2(ux,uz);
     for(let k=0;k<4;k++){const off=2.2+(k*1.1);const cx=x+ux*off,cz=z+uz*off;
       const b=BABYLON.MeshBuilder.CreateBox('ksH',{width:wd-1,height:.02,depth:.32},scene);b.position.set(cx,.115,cz);b.rotation.y=rot;hl.push(b);}
   }
   merged(hl,MT.yellow,'ksHoldBars');}
  tiLights(tl,[.1,.3,1.3],.7,'ksTwyEdge');tiLights(tcl,[.1,1.2,.3],.45,'ksTwyCL');
  {const wl=[],amb=[],cwh=[],crd=[],tdz=[],thG=[],thR=[],apW=[],apR=[];
   RW.slice(1).forEach(r=>{
     const L=r.len,W=r.wid,EL=Math.min(600,L*.2);
     const onOther=p=>{for(const q of RW){if(q===r)continue;const dx=p[0]-q.A[0],dz=p[1]-q.A[1],a=dx*q.ux+dz*q.uz,b=dx*q.uz-dz*q.ux;if(a>-3&&a<q.len+3&&Math.abs(b)<q.wid/2+4)return true;}return false;};
     for(let s=0;s<=L+.1;s+=30){const near=Math.min(s,L-s)<EL;for(const sd of[-1,1]){const p=P(r,s,sd*(W/2+2.5));if(onOther(p))continue;(near?amb:wl).push([p[0],.45,p[1]]);}}
     for(let s=15;s<L;s+=15){const d=Math.min(s,L-s),p=P(r,s,0);if(onOther(p))continue;
       const t=[p[0],.2,p[1]];if(d<300)crd.push(t);else if(d<900)((Math.floor(d/15)%2)?crd:cwh).push(t);else cwh.push(t);}
     for(const e of[0,1])for(let d=60;d<=900&&d<L/2;d+=30)for(const sd of[-1,1])for(const o of[4,6,8]){const p=P(r,e?L-d:d,sd*o);if(onOther(p))continue;tdz.push([p[0],.18,p[1]]);}
     for(let o=-W/2;o<=W/2;o+=3){const a=P(r,-.8,o),b=P(r,L+.8,o);thG.push([a[0],.25,a[1]]);thR.push([b[0],.25,b[1]]);}
   });
   RW.slice(1).forEach(r=>{[0,1].forEach(e=>{if(!r.appr[e])return;
     for(let d=30;d<=900;d+=30){const s=e?r.len+d:-d,p=P(r,s,0);apW.push([p[0],.9,p[1]]);
       if(d%150===0)for(let k=-6;k<=6;k++)if(k){const q=P(r,s,k*2.6);apW.push([q[0],.9,q[1]]);}
       if(d<=300)for(const sd of[-1,1]){const q=P(r,s,sd*4.5);apR.push([q[0],.9,q[1]]);}}
     const a=P(r,e?r.len+450:-450,0);const pier=BABYLON.MeshBuilder.CreateBox('ksAppPier',{width:9,height:.5,depth:900},scene);pier.position.set(a[0],-.35,a[1]);pier.rotation.y=Math.atan2(r.ux,r.uz);
     pier.material=MT.pier;keep(pier);});});
   tiLights(wl,[1.4,1.4,1.3],.8,'ksEdge');tiLights(amb,[1.4,.85,.1],.8,'ksEdgeAmb');tiLights(cwh,[1.3,1.3,1.2],.5,'ksCLw');tiLights(crd,[1.4,.12,.1],.5,'ksCLr');
   tiLights(tdz,[1.3,1.3,1.2],.45,'ksTDZ');tiLights(thG,[.1,1.5,.4],.9,'ksThrG');tiLights(thR,[1.5,.1,.08],.9,'ksThrR');
   tiLights(apW,[1.5,1.5,1.4],1.3,'ksAppW');tiLights(apR,[1.5,.12,.1],1.0,'ksAppR');
  }
  {const rm=sm([1.6,1.6,1.6],[1.6,1.6,1.6]);rm.disableLighting=true;
   const rabs=[];[R1,R3].forEach(r=>{const s2=BABYLON.MeshBuilder.CreateSphere('ksRab',{diameter:2.6,segments:6},scene);s2.material=rm;keep(s2);s2.applyFog=false;rabs.push({m:s2,r});});
   let tAcc=0;const ob=scene.onBeforeRenderObservable.add(()=>{if(root.isDisposed()){scene.onBeforeRenderObservable.remove(ob);return;}
     tAcc+=engine.getDeltaTime()/1000;const step=Math.floor((tAcc%1)*30);
     rabs.forEach(({m,r})=>{const d=900-step*30,p=P(r,-Math.max(30,d),0);m.position.set(p[0],1.1,p[1]);m.setEnabled((tAcc*30%1)<.55);});});}
  {const hoodM=sm([.05,.05,.06],null,.2),legM=sm([.9,.9,.9],[.15,.15,.15]);
   const glowTex=window._apGlowTex||(window._apGlowTex=(()=>{const t=new BABYLON.DynamicTexture('apGlowT',{width:64,height:64},scene,false),c=t.getContext(),g=c.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(255,255,255,.45)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,64,64);t.update();t.hasAlpha=true;return t;})());
   window.apPapi=window.apPapi||[];
   RW.slice(1).forEach(r=>{[0,1].forEach(e=>{
     const L=r.len,sgn=e?-1:1,s0=e?L-300:300;
     const lux=r.ux*sgn,luz=r.uz*sgn;
     for(let i=0;i<4;i++){
       const o=(e?-1:1)*(r.wid/2+16+i*9),pos=P(r,s0,o);
       cyl({height:.9,diameter:.25,tessellation:6},pos[0],.45,pos[1],legM);
       box(2.2,1.5,1.8,pos[0],.9,pos[1],hoodM,Math.atan2(lux,luz));
       const pm=sm([1,.15,.1],[1.1,.15,.1]);pm.disableLighting=true;
       const pb=BABYLON.MeshBuilder.CreateDisc('papiLens',{radius:.75,tessellation:20},scene);pb.material=pm;keep(pb);
       pb.position.set(pos[0]-lux*1.0,1.65,pos[1]-luz*1.0);pb.rotation.y=Math.atan2(lux,luz);
       const gl2=BABYLON.MeshBuilder.CreatePlane('papiGlow',{size:5},scene);const gm=new BABYLON.StandardMaterial('papiGlowM'+(++_mn),scene);
       gm.disableLighting=true;gm.emissiveColor=new BABYLON.Color3(1,.2,.1);gm.opacityTexture=glowTex;gm.backFaceCulling=false;gm.disableDepthWrite=true;
       gl2.material=gm;keep(gl2);gl2.position.set(pos[0]-lux*1.2,1.65,pos[1]-luz*1.2);gl2.billboardMode=BABYLON.Mesh.BILLBOARDMODE_ALL;gl2.applyFog=false;gl2.visibility=0;
       window.apPapi.push({e:0,i,pm,pb,gm,gl:gl2,side:1,w:[pos[0],pos[1],1.65],dir:[-lux,-luz]});
     }});});
  }
  {[[R0,'28L'],[R1,'28R']].forEach(([r,t],k)=>{for(const s of[450,1100,2450,3000]){const p=P(r,s+(k?0:35),k?-52:52);sign(t+' · '+(k?'10L':'10R'),'#c21b1b','#fff',p[0],p[1],Math.atan2(r.ux,r.uz)+Math.PI/2,5.4,1.6,1.4);}});
   [['B',R0,190,1500],['B',R0,190,2700],['A',R0,395,1500],['A',R0,395,2800],['N',R1,-190,1400],['F',R3,190,900],['F',R3,190,1700]].forEach(([n,r,o,s])=>{
     const p=P(r,s,o+(o>0?16:-16));sign(n,'#f2c800','#000',p[0],p[1],Math.atan2(r.ux,r.uz)+(o>0?-1:1)*Math.PI/2,2.6,1.6,1.4);});}
  const glass1=glassMat(5,1),glass2=glassMat(4,1),litGlass=glass1;
  const RT=215,TH=21,TD=48;
  const dirVec=a=>[Math.cos(a),Math.sin(a)];
  const bodyList=[],roofList=[],glassList=[];
  {const N=14,span=210*Math.PI/180;
   for(let k=0;k<N;k++){const a=phi0-span/2+(k+.5)*span/N,pm=polar(RT,a),tx=-Math.sin(a),tz=Math.cos(a),chord=2*RT*Math.sin(span/N/2)+2.5;
     radialBox(TD,TH,chord,RT,a,0,glass1);
     radialBox(TD+8,1.3,chord+.5,RT,a,TH,MT.roof);
     radialBox(TD-14,2.6,chord-6,RT,a,TH+1.3,MT.white);
     radialBox(8,.7,chord,RT+TD/2+7,a,10,MT.roof);
   }
   [['TERMINAL 1',-80],['TERMINAL 2',-25],['TERMINAL 3',28],['INTERNATIONAL',80]].forEach(([n,dg])=>{const a=phi0+dg*Math.PI/180,pm=polar(RT+TD/2+.3,a);
     const p=BABYLON.MeshBuilder.CreatePlane('ksTermName',{width:46,height:5},scene);p.material=signTex(n,'#0d2236','#ffffff',1024,112);p.position.set(pm[0],TH-5,pm[1]);
     p.rotation.y=Math.atan2(-Math.cos(a),-Math.sin(a));keep(p);});}
  {const g1=radialBox(70,26,150,0,phi0,0,sm([.58,.58,.56]));
   const gmat=new BABYLON.StandardMaterial('ksGar',scene);gmat.diffuseTexture=dtex(256,256,(c,W,H)=>{c.fillStyle='#8f908c';c.fillRect(0,0,W,H);for(let k=0;k<5;k++){c.fillStyle='#1c2733';c.fillRect(0,k*51+9,W,34);c.fillStyle='rgba(255,230,160,.85)';c.fillRect(0,k*51+39,W,3);}});
   gmat.diffuseTexture.uScale=3;gmat.specularColor=BABYLON.Color3.Black();gmat.emissiveColor=new BABYLON.Color3(.04,.04,.04);litMats.push(gmat);g1.material=gmat;
   radialBox(72,1,152,0,phi0,26,sm([.64,.64,.62]));
   const ring=(r0,r1,y,mat)=>{const A=[],B=[],n=72;for(let i=0;i<=n;i++){const a=phi0-Math.PI*1.15+(i/n)*Math.PI*2.3;A.push(new BABYLON.Vector3(C[0]+Math.cos(a)*r0,y,C[1]+Math.sin(a)*r0));B.push(new BABYLON.Vector3(C[0]+Math.cos(a)*r1,y,C[1]+Math.sin(a)*r1));}
     const rb=BABYLON.MeshBuilder.CreateRibbon('ksRing',{pathArray:[A,B],sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);rb.material=mat;return keep(rb);};
   ring(158,188,.12,MT.asph2);ring(172,173,.14,MT.concLt);
   const cars=[];const carCols=[[.85,.85,.87],[.2,.2,.22],[.6,.1,.1],[.25,.35,.55],[.55,.56,.58],[.92,.92,.9],[.13,.3,.2]];
   for(let r=0;r<12;r++)for(let k=0;k<32;k++){const q=h2(r,k,77);if(q<.22)continue;const a=phi0+Math.PI+(k-16)*.0215,rad=212+r*7.6;
     const p=polar(rad,a);cars.push([p[0],p[1],a,carCols[(h2(k,r,3)*carCols.length)|0]]);}
   {const vm=BABYLON.MeshBuilder.CreateBox('ksCar',{width:1.8,height:1.45,depth:4.4},scene);vm.bakeTransformIntoVertices(BABYLON.Matrix.Translation(0,.72,0));
    const vmat=new BABYLON.StandardMaterial('ksCarM',scene);vmat.diffuseColor=new BABYLON.Color3(1,1,1);vmat.specularColor=new BABYLON.Color3(.3,.3,.3);vm.material=vmat;keep(vm);
    const mb=new Float32Array(cars.length*16),cb=new Float32Array(cars.length*4);cars.forEach(([x,z,a,c],i)=>{const o=i*16,cs=Math.cos(a),sn=Math.sin(a);
      mb[o]=cs;mb[o+2]=-sn;mb[o+5]=1;mb[o+8]=sn;mb[o+10]=cs;mb[o+12]=x;mb[o+13]=.1;mb[o+14]=z;mb[o+15]=1;cb[i*4]=c[0];cb[i*4+1]=c[1];cb[i*4+2]=c[2];cb[i*4+3]=1;});
    vm.thinInstanceSetBuffer('matrix',mb,16,true);vm.thinInstanceSetBuffer('color',cb,4,true);vm.alwaysSelectAsActiveMesh=true;}
   radialBox(110,.1,180,258,phi0+Math.PI,0,MT.asph2);
  }
  const gates=[];
  {const PN=7;
   for(let k=0;k<PN;k++){const a=phi0+(-90+k*30)*Math.PI/180,d=dirVec(a),base=polar(RT+TD/2+10,a),pl=150,pw=22;
     const th=Math.atan2(d[0],d[1]);
     const mid=[base[0]+d[0]*pl/2,base[1]+d[1]*pl/2];
     box(pw,12,pl,mid[0],0,mid[1],glass2,th);box(pw+4,1,pl+4,mid[0],12,mid[1],MT.roof,th);
     const tip=[base[0]+d[0]*pl,base[1]+d[1]*pl];
     cyl({height:12,diameter:pw+8,tessellation:20},tip[0],6,tip[1],glass2);cyl({height:1,diameter:pw+12,tessellation:20},tip[0],12.5,tip[1],MT.roof);
     sign('ABCDEFG'[k],'#0d2236','#ffd400',tip[0]+d[0]*8,tip[1]+d[1]*8,th+Math.PI,9,3.2,13);
     const nx=-d[1],nz=d[0];
     for(const side of[-1,1])for(let gI=0;gI<3;gI++){const dd=34+gI*46,bx=base[0]+d[0]*dd,bz=base[1]+d[1]*dd;
       const wallx=bx+nx*side*(pw/2),wallz=bz+nz*side*(pw/2),end=[wallx+nx*side*14,wallz+nz*side*14];
       box(3.4,3.2,14,(wallx+end[0])/2,4.4,(wallz+end[1])/2,MT.bridge,Math.atan2(nx*side,nz*side));
       cyl({height:3.8,diameter:4.4,tessellation:12},end[0],6.3,end[1],MT.white);
       gates.push({x:bx+nx*side*(pw/2+14),z:bz+nz*side*(pw/2+14),nx:nx*side,nz:nz*side,pier:k,side,dd,fx:bx,fz:bz});}
   }}
  {const yl=[];gates.forEach((g,n)=>{const b=BABYLON.MeshBuilder.CreateBox('ksLine',{width:.35,height:.02,depth:50},scene);b.position.set(g.x+g.nx*27,.115,g.z+g.nz*27);b.rotation.y=Math.atan2(g.nx,g.nz);yl.push(b);});
   merged(yl,MT.yellow,'ksLeadIn');}
  const veh=[];
  const parkSet=['b777','a350','b787','a320','b737','b747','a380','b767','e190','crj9','b777','a320','b737','b787','a350','b737'];
  const doPark=()=>{
    const MR=window._modelRoots,DR=window._DRESS,FL=window._FLEET;if(!MR||!DR||!DR.a350)return false;
    const lastEnd={};
    gates.forEach((g,n)=>{
      const id=parkSet[(n*5+3)%parkSet.length],src=MR[id];if(!src)return;
      const D=DR[id],nose=D&&D.fus?D.fus[0].z:20,span=D&&D.wing?D.wing[D.wing.length-1].s*2:36;
      const key=g.pier+'_'+g.side,half=span/2+3;
      if(lastEnd[key]!==undefined&&g.dd-half<lastEnd[key])return;
      if(h2(n,7,5)<.14)return;
      const fd=FL.find(f=>f.model===id),gh=fd&&fd.physics?fd.physics.gearHeight:3;
      const node=parkJet(src,id,root);if(!node)return;
      lastEnd[key]=g.dd+half;
      node.position.set(g.x+g.nx*(nose+2.5),gh-.15,g.z+g.nz*(nose+2.5));node.rotation.y=Math.atan2(-g.nx,-g.nz);apNodes.push(node);
      veh.push([g.x+g.nx*8+g.nz*9,g.z+g.nz*8-g.nx*9,3.2,1.6,2.2,[.95,.8,.1]],[g.x+g.nx*14-g.nz*9,g.z+g.nz*14+g.nx*9,5,2,2.2,[.9,.9,.9]],[g.x+g.nx*22+g.nz*10,g.z+g.nz*22-g.nx*10,3,1.4,1.8,[.3,.4,.6]]);
    });
    [['b747',0.30,330],['b777',0.00,335],['a380',-0.34,335],['b787',0.62,340],['a350',-0.68,345]].forEach(([id,da,rad],k)=>{
      const src=MR[id];if(!src)return;const p=polar(rad+130,phi0+da),fd=FL.find(f=>f.model===id),gh=fd&&fd.physics?fd.physics.gearHeight:3;
      const node=parkJet(src,id,root);if(!node)return;node.position.set(p[0],gh-.15,p[1]);node.rotation.y=Math.atan2(R0.ux,R0.uz)+(k%2?.0:Math.PI);apNodes.push(node);});
    buildVeh();return true;};
  const buildVeh=()=>{
    const vm=BABYLON.MeshBuilder.CreateBox('ksVeh',{size:1},scene);vm.bakeTransformIntoVertices(BABYLON.Matrix.Translation(0,.5,0));
    const vmat=new BABYLON.StandardMaterial('ksVehM',scene);vmat.diffuseColor=new BABYLON.Color3(1,1,1);vmat.specularColor=new BABYLON.Color3(.3,.3,.3);vm.material=vmat;keep(vm);
    const mb=[],cb=[];veh.forEach(([x,z,w,h,d,c])=>{mb.push(w,0,0,0, 0,h,0,0, 0,0,d,0, x,0,z,1);cb.push(c[0],c[1],c[2],1);});
    vm.thinInstanceSetBuffer('matrix',new Float32Array(mb),16,true);vm.thinInstanceSetBuffer('color',new Float32Array(cb),4,true);vm.alwaysSelectAsActiveMesh=true;apNodes.push(vm);};
  if(!doPark()){let tries=0;const iv=setInterval(()=>{if(doPark()||++tries>240)clearInterval(iv);},250);}
  {const lm=[],lh=[];for(let a=-100;a<=100;a+=25)for(const rad of[330,400]){const p=polar(rad+60,phi0+a*Math.PI/180);lm.push(p);lh.push(p);}
   const mast=cyl({height:30,diameterTop:.5,diameterBottom:.9,tessellation:6},0,0,0,MT.dark);mast.thinInstanceSetBuffer('matrix',new Float32Array(lm.flatMap(p=>[1,0,0,0,0,1,0,0,0,0,1,0,p[0],15,p[1],1])),16,true);mast.alwaysSelectAsActiveMesh=true;
   const hd=box(4,1,2,0,0,0,sm([1,.95,.8],[1,.92,.75]));hd.thinInstanceSetBuffer('matrix',new Float32Array(lh.flatMap(p=>[1,0,0,0,0,1,0,0,0,0,1,0,p[0],30,p[1],1])),16,true);hd.alwaysSelectAsActiveMesh=true;}
  {const tp=polar(262,phi0+112*Math.PI/180);const tx=tp[0],tz=tp[1];
   cyl({height:58,diameterTop:6,diameterBottom:10,tessellation:18},tx,29,tz,MT.white);
   cyl({height:3,diameterTop:15,diameterBottom:7,tessellation:18},tx,59.5,tz,MT.white);
   cyl({height:7,diameterTop:16.5,diameterBottom:14,tessellation:18},tx,64.5,tz,glassMat(4,1));
   cyl({height:1.4,diameterTop:12,diameterBottom:17.5,tessellation:18},tx,68.7,tz,MT.dark);
   cyl({height:12,diameterTop:.15,diameterBottom:.5,tessellation:6},tx,75.4,tz,MT.dark);
   const bc=BABYLON.MeshBuilder.CreateSphere('ksBeacon',{diameter:1.6},scene);keep(bc);bc.position.set(tx,81.6,tz);bc.material=sm([1,1,1],[1,.3,.2]);
   window._ksBeacon=bc;}
  {const hp=P(R3,900,400),hr=Math.atan2(R3.ux,R3.uz);
   const hg=new BABYLON.TransformNode('ksHangar',scene);hg.parent=root;hg.position.set(hp[0],0,hp[1]);hg.rotation.y=hr;
   for(let i=0;i<2;i++){const z=i*105-52;box(110,14,90,0,0,z,MT.hang,0,hg);
     const rf=cyl({height:110,diameter:90,tessellation:28,arc:.5},0,14,z,MT.metal,hg);rf.rotation.z=Math.PI/2;rf.rotation.x=Math.PI/2;rf.scaling.set(1,1,.3);
     box(.6,12,70,-55.3,0,z,sm([.35,.4,.45],null,.2),0,hg);}
   box(40,8,160,-85,0,0,MT.concLt,0,hg);box(42,.8,162,-85,8,0,sm([.3,.32,.35]),0,hg);
   const fp=P(R3,300,520);const fg=new BABYLON.TransformNode('ksFuel',scene);fg.parent=root;fg.position.set(fp[0],0,fp[1]);fg.rotation.y=hr;
   for(let a=0;a<2;a++)for(let b=0;b<4;b++){cyl({height:11,diameter:15,tessellation:20},a*22,5.5,b*22,MT.white,fg);cyl({height:.8,diameter:15.6,tessellation:20},a*22,11.3,b*22,MT.dark,fg);}
   const cp=P(R1,600,-460);const cg=new BABYLON.TransformNode('ksCargo',scene);cg.parent=root;cg.position.set(cp[0],0,cp[1]);cg.rotation.y=Math.atan2(R1.ux,R1.uz);
   for(let i=0;i<3;i++){box(120,11,50,i*135,0,0,sm([.7,.72,.74],null,.3),0,cg);box(122,.8,52,i*135,11,0,sm([.3,.32,.35]),0,cg);for(let k=0;k<6;k++)box(8,6,.4,i*135-50+k*20,0,-25.1,MT.dark,0,cg);}
   const fs=polar(300,phi0+150*Math.PI/180);box(50,8,24,fs[0],0,fs[1],sm([.82,.83,.85],null,.3),Math.atan2(R0.ux,R0.uz));
  }
  {const ob=scene.onBeforeRenderObservable.add(()=>{if(root.isDisposed()){scene.onBeforeRenderObservable.remove(ob);return;}
     const nt=(typeof nightMode!=='undefined')&&nightMode;
     for(const m of litMats){try{if(m.emissiveColor)m.emissiveColor.set(nt?.9:.06,nt?.78:.07,nt?.5:.08);}catch(e){}}
     if(window._ksBeacon){const bc=window._ksBeacon;if(!bc.isDisposed())bc.setEnabled(((performance.now()/1000)%2)<.2);}});}
  {const cols=[[.85,.1,.1],[.1,.4,.85],[.9,.6,.1]];ksTaxi.length=0;
   for(let i=0;i<3;i++){try{const a=makeAirliner(new BABYLON.Color3(...cols[i]));a.marker.dispose();a.root.parent=root;a.root.scaling.setAll(1.3);
     a.root.getChildMeshes().forEach(m=>m.isPickable=false);
     ksTaxi.push({r:a.root,s:300+i*900,dir:i%2?-1:1,wait:0,line:lineB,L:R0.len-300});apNodes.push(a.root);}catch(e){}}}
}
const ksTaxi=[];
scene.registerBeforeRender(()=>{const dt=Math.min(.05,engine.getDeltaTime()/1000);
  for(const t of ksTaxi){if(t.r.isDisposed())continue;if(t.wait>0){t.wait-=dt;continue;}
    t.s+=t.dir*13*dt;if(t.s>t.L){t.s=t.L;t.dir=-1;t.wait=8+Math.random()*10;}if(t.s<120){t.s=120;t.dir=1;t.wait=8+Math.random()*10;}
    const a=t.line[0],b=t.line[1],dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz),ux=dx/L,uz=dz/L,s=t.s;
    t.r.position.set(a[0]+ux*(s-120),2.4,a[1]+uz*(s-120));t.r.rotation.y=Math.atan2(ux*t.dir,uz*t.dir);}});

let landingOn=true;const llights=[];
(function(){
  for(const sx of [-1,1]){
    const sp=new BABYLON.SpotLight('ll'+sx,new BABYLON.Vector3(sx*5.5,-1.3,5),new BABYLON.Vector3(sx*.02,-.14,1),.75,2.0,scene);
    sp.parent=aircraftRoot;sp.intensity=14;sp.range=2800;sp.diffuse=new BABYLON.Color3(1,.95,.82);sp.specular=new BABYLON.Color3(1,.95,.82);llights.push(sp);
    const g=BABYLON.MeshBuilder.CreateSphere('llg'+sx,{diameter:1.1},scene);
    const gm=new BABYLON.StandardMaterial('llgm'+sx,scene);
    gm.emissiveColor=new BABYLON.Color3(1,.98,.85);gm.disableLighting=true;g.material=gm;g.parent=aircraftRoot;g.position.set(sx*5.5,-1.3,5.2);g.isPickable=false;sp._glare=g;
    const bm=new BABYLON.StandardMaterial('llbm'+sx,scene);
    bm.emissiveColor=new BABYLON.Color3(1,.95,.80);bm.disableLighting=true;bm.alpha=.02;bm.backFaceCulling=false;
    const cone=BABYLON.MeshBuilder.CreateCylinder('llcone'+sx,{height:350,diameterTop:110,diameterBottom:.6,tessellation:24,cap:BABYLON.Mesh.NO_CAP},scene);
    cone.material=bm;cone.parent=aircraftRoot;cone.rotation.x=Math.PI/2+.16;cone.position.set(sx*5.5,-1.3-18,5+175);cone.isPickable=false;cone.applyFog=false;sp._cone=cone;
    const bm2=new BABYLON.StandardMaterial('llbm2'+sx,scene);
    bm2.emissiveColor=new BABYLON.Color3(1,.97,.88);bm2.disableLighting=true;bm2.alpha=.015;bm2.backFaceCulling=false;
    const cone2=BABYLON.MeshBuilder.CreateCylinder('llcone2'+sx,{height:280,diameterTop:35,diameterBottom:.3,tessellation:20,cap:BABYLON.Mesh.NO_CAP},scene);
    cone2.material=bm2;cone2.parent=aircraftRoot;cone2.rotation.x=Math.PI/2+.16;cone2.position.set(sx*5.5,-1.3-14,5+140);cone2.isPickable=false;cone2.applyFog=false;sp._coneInner=cone2;
  }
  const setLL=on=>{landingOn=on;llights.forEach(l=>{l.setEnabled(on);l._glare.setEnabled(on);l._cone.setEnabled(on&&nightMode!==false);l._coneInner.setEnabled(on&&nightMode!==false);});};
  scene.materials.forEach(m=>m.maxSimultaneousLights=8);scene.onNewMaterialAddedObservable.add(m=>m.maxSimultaneousLights=8);
  scene.textures.forEach(t=>{try{t.anisotropicFilteringLevel=16;}catch(e){}});scene.onNewTextureAddedObservable.add(t=>{try{t.anisotropicFilteringLevel=16;}catch(e){}});
  window.addEventListener('keydown',e=>{if(e.code==='KeyL'&&!e.shiftKey&&!/INPUT|SELECT/.test((e.target||{}).tagName||'')){setLL(!landingOn);showMsg('LANDING LIGHTS '+(landingOn?'ON':'OFF'));}});
  scene.registerBeforeRender(()=>{const agl=plane.pos.y-sampleSurface(plane.pos.x,plane.pos.z);const night=(typeof nightMode!=='undefined')?nightMode:false;
    const kS=Math.max(.3,(()=>{try{const f=(window._FLEET||[]).find(x=>x.model===window._activeModelId);return f&&f.camScale?Math.max(.45,f.camScale):1;}catch(e){return 1;}})());
    llights.forEach((l,li)=>{
      const sx=li?1:-1;
      l._cone.setEnabled(landingOn&&night);l._coneInner.setEnabled(landingOn&&night);l._glare.setEnabled(landingOn&&night);
      const altRamp=Math.max(.5,Math.min(1,(agl-150)/600));
      l.position.set(sx*5.5*kS,-1.3*kS,5*kS);l._glare.position.set(sx*5.5*kS,-1.3*kS,5.2*kS);l._glare.scaling.setAll(kS<.5?.5:1);
      l._cone.position.set(sx*5.5*kS,(-1.3-18)*kS,(5+175)*kS);l._cone.scaling.setAll(kS);
      l._coneInner.position.set(sx*5.5*kS,(-1.3-14)*kS,(5+140)*kS);l._coneInner.scaling.setAll(kS);
      l.intensity=night?42*altRamp:7;l.range=night?3200:1600;l.angle=night?.95:.75;l.exponent=night?1.6:2.0;
      l._cone.material.alpha=night?.07:.025;l._coneInner.material.alpha=night?.06:.02;
    });});
  /* soft pool of light where the landing lights hit the ground */
  (function(){
    const T=new BABYLON.DynamicTexture('llPoolT',{width:128,height:128},scene,false),c=T.getContext(),gr=c.createRadialGradient(64,64,2,64,64,62);
    gr.addColorStop(0,'rgba(255,248,220,1)');gr.addColorStop(.45,'rgba(255,240,200,.45)');gr.addColorStop(1,'rgba(255,235,190,0)');c.fillStyle=gr;c.fillRect(0,0,128,128);T.update();T.hasAlpha=true;
    const pm=new BABYLON.StandardMaterial('llPoolM',scene);pm.emissiveTexture=T;pm.opacityTexture=T;pm.disableLighting=true;pm.diffuseColor=new BABYLON.Color3(0,0,0);pm.alphaMode=BABYLON.Engine.ALPHA_ADD;pm.backFaceCulling=false;pm.zOffset=-4;pm.fogEnabled=false;
    const pool=BABYLON.MeshBuilder.CreateGround('llPool',{width:1,height:1},scene);pool.material=pm;pool.isPickable=false;pool.setEnabled(false);
    const v=new BABYLON.Vector3(),fw=new BABYLON.Vector3(),qm=BABYLON.Matrix.Identity();
    scene.registerBeforeRender(()=>{
      const night=(typeof nightMode!=='undefined')?nightMode:false;
      if(!(landingOn&&night)){pool.setEnabled(false);return;}
      plane.quat.toRotationMatrix(qm);BABYLON.Vector3.TransformNormalToRef(new BABYLON.Vector3(0,0,1),qm,fw);
      const dy=Math.tan(.16);let lo=0,hi=3000,hitOK=false;
      const gy=t=>{const px=plane.pos.x+fw.x*t,pz=plane.pos.z+fw.z*t;return plane.pos.y+fw.y*t-dy*t-sampleSurface(px,pz);};
      if(gy(hi)>0){pool.setEnabled(false);return;}
      if(gy(0)<0){pool.setEnabled(false);return;}
      for(let i=0;i<16;i++){const mid=(lo+hi)/2;if(gy(mid)>0)lo=mid;else hi=mid;}
      const t=(lo+hi)/2,px=plane.pos.x+fw.x*t,pz=plane.pos.z+fw.z*t;
      pool.position.set(px,sampleSurface(px,pz)+.25,pz);pool.rotation.y=Math.atan2(fw.x,fw.z);
      const sz=Math.max(26,t*.6);pool.scaling.set(sz*.9,1,sz*1.5);pool.setEnabled(true);pm.alpha=Math.max(.4,Math.min(1,1.3-t/2200));
    });
  })();
  try{const dp=scene.postProcessRenderPipelineManager.supportedPipelines[0];if(dp){dp.samples=isTouchDev?1:4;dp.sharpen.edgeAmount=.45;dp.bloomWeight=.38;dp.imageProcessing.contrast=1.22;}}catch(e){}
  if(!isTouchDev){try{engine.setHardwareScalingLevel(1/Math.min(window.devicePixelRatio||1,1.75));}catch(e){}}
})();

(function(){
  try{const dp=scene.postProcessRenderPipelineManager.supportedPipelines[0];
    if(dp){const cc=new BABYLON.ColorCurves();cc.globalSaturation=14;cc.shadowsHue=215;cc.shadowsDensity=22;cc.highlightsHue=42;cc.highlightsDensity=14;dp.imageProcessing.colorCurves=cc;dp.imageProcessing.colorCurvesEnabled=true;}}catch(e){console.warn('grade',e);}
  if(isTouchDev||!BABYLON.CascadedShadowGenerator)return;
  try{
    const csm=window._csm=new BABYLON.CascadedShadowGenerator(2048,sun);
    csm.numCascades=3;csm.lambda=.85;csm.shadowMaxZ=900;csm.stabilizeCascades=true;
    csm.bias=.005;csm.normalBias=.04;csm.setDarkness(.3);
    csm.filter=BABYLON.ShadowGenerator.FILTER_PCF;csm.filteringQuality=BABYLON.ShadowGenerator.QUALITY_MEDIUM;
    terrainMesh.receiveShadows=true;
    const rl=csm.getShadowMap().renderList;
    const refresh=()=>{
      aircraftRoot.getChildMeshes().forEach(m=>{
        if(m._shc||m.isDescendantOf(interiorRoot)||!m.getTotalVertices||!m.getTotalVertices())return;
        const a=m.material&&m.material.alpha;if(a!==undefined&&a<.5)return;
        if(/^(llg|llcone|emb|name)/.test(m.name))return;
        m._shc=true;rl.push(m);});
      (window.bkMeshes||[]).concat(roofMesh?[roofMesh]:[],treeMesh?[treeMesh]:[],trunkMesh?[trunkMesh]:[]).forEach(m=>{m.receiveShadows=true;if(!m._shc){m._shc=true;rl.push(m);}});
      scene.meshes.forEach(m=>{if(m.name==='apb')m.receiveShadows=true;});
    };
    refresh();setInterval(refresh,2000);
    window.addEventListener('keydown',e=>{if(e.code==='KeyH'&&!/INPUT|SELECT|TEXTAREA/.test((e.target||{}).tagName||'')){sun.shadowEnabled=!sun.shadowEnabled;showMsg('SHADOWS '+(sun.shadowEnabled?'ON':'OFF'),1500);}});
  }catch(e){console.warn('shadows',e);}
})();

(function(){
  try{const dp=scene.postProcessRenderPipelineManager.supportedPipelines[0];
    if(dp){dp.chromaticAberration.aberrationAmount=1.5;dp.grain.intensity=1.2;dp.bloomKernel=64;dp.bloomScale=.6;
      dp.imageProcessing.vignetteWeight=1.1;}}catch(e){}
  if(isTouchDev)return;
  try{
    scene.lights.forEach(l=>{const sg=l.getShadowGenerator&&l.getShadowGenerator();if(sg&&sg.filteringQuality!==undefined){sg.filteringQuality=BABYLON.ShadowGenerator.QUALITY_HIGH;if(sg.shadowMaxZ!==undefined)sg.shadowMaxZ=1400;if(sg.setDarkness)sg.setDarkness(.22);}});
  }catch(e){console.warn('shq',e);}
  try{
    if(BABYLON.SSAO2RenderingPipeline&&BABYLON.SSAO2RenderingPipeline.IsSupported){
      window._mkSSAO=()=>{const ss=new BABYLON.SSAO2RenderingPipeline('ssao',scene,{ssaoRatio:.5,blurRatio:.5},[camera]);
        ss.radius=1.6;ss.totalStrength=1.1;ss.base=.12;ss.samples=12;ss.maxZ=220;ss.minZDistance=.05;ss.expensiveBlur=true;return ss;};
      window.addEventListener('keydown',e=>{if(e.code==='KeyJ'&&e.shiftKey&&!/INPUT|SELECT|TEXTAREA/.test((e.target||{}).tagName||'')){
        const on=!window._ssaoOff;window._ssaoOff=on;
        if(on)scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline('ssao',[camera]);
        else scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline('ssao',[camera]);
        showMsg('AMBIENT OCCLUSION '+(on?'OFF':'ON'),1500);}});
    }
  }catch(e){console.warn('ssao',e);}
})();
  /* ===== ATC + AIRPORT TRAFFIC ===== */
const taxiers=[];
{const _cr=createRunway;createRunway=function(code){_cr(code);taxiers.length=0;const g=window.apGeo;if(!g||!RUNWAYS[code]||RUNWAYS[code].custom)return;
  const cols=[[.85,.1,.1],[.1,.4,.85],[.9,.6,.1]];
  for(let i=0;i<3;i++){const a=makeAirliner(new BABYLON.Color3(...cols[i]));a.marker.dispose();a.root.parent=g.root;a.root.scaling.setAll(1.3);
    a.root.getChildMeshes().forEach(m=>m.isPickable=false);const dir=i%2?-1:1;
    taxiers.push({r:a.root,z:(i-1)*g.L*.28,dir,x:g.tx,L:g.L,wait:0});a.root.position.set(g.tx,2.4,(i-1)*g.L*.28);a.root.rotation.y=dir>0?0:Math.PI;apNodes.push(a.root);}
};}
scene.registerBeforeRender(()=>{const dt=Math.min(.05,engine.getDeltaTime()/1000);
  for(const t of taxiers){if(t.wait>0){t.wait-=dt;continue;}t.z+=t.dir*13*dt;
    if(Math.abs(t.z)>t.L*.42){t.z=Math.sign(t.z)*t.L*.42;t.dir*=-1;t.wait=8+Math.random()*10;t.r.rotation.y=t.dir>0?0:Math.PI;}
    t.r.position.z=t.z;}});
let currentLocation={...LOCS.LSZH,code:'LSZH',start:'cruise'};
const atc=(function(){
  const st={phase:'ramp',voice:true,sq:String(2000+((Math.random()*5000)|0)),cs:'Babylon 737 Heavy',freq:'',ready:false};
  const box=document.createElement('div');box.id='atc';
  box.innerHTML='<div class="fh"><span>ATC · CLEARANCES</span><span><button id="atcV">🔊</button> <button id="atcX">✕</button></span></div><div id="atcFq" style="font:700 10.5px monospace;color:#7dd3fc;margin:-2px 0 6px;letter-spacing:.5px"></div><div id="atcLog"></div><div class="bt" id="atcB"></div>';
  document.body.appendChild(box);const ab=document.createElement('button');ab.id='atcBtn';ab.textContent='📻 ATC (K)';document.body.appendChild(ab);
  const log=document.getElementById('atcLog');
  const say=(who,txt)=>{const d=document.createElement('div');d.className=who==='p'?'p':'a';d.textContent=(who==='p'?'▶ '+st.cs+': ':'◀ ')+txt;log.appendChild(d);log.scrollTop=log.scrollHeight;
    if(who==='a'&&st.voice&&window.speechSynthesis&&!(_sfxCur&&!_sfxCur.paused&&!_sfxCur.ended)){try{const u=new SpeechSynthesisUtterance(txt.replace(/Babylon/,'Babylon'));u.rate=1.1;speechSynthesis.cancel();speechSynthesis.speak(u);}catch(e){}}};
  const code=()=>(currentLocation.code||'UNKN');
  const rwy=()=>{const R=RUNWAYS[(currentLocation&&currentLocation.code)||''];if(R&&R.des)return R.des[0];let h=Math.round(runwayHdgDeg/10)%36;if(h===0)h=36;return String(h).padStart(2,'0');};
  const wind=()=>{const w=currentWeather||{wind:5};return String(((Math.round(runwayHdgDeg/10)*10+((w.wind*7)%40)-20+360)%360)||360).padStart(3,'0')+' at '+Math.max(2,Math.round(w.wind*1.94));};
  const agl=()=>(plane.pos.y-sampleSurface(plane.pos.x,plane.pos.z))*3.28084;
  const along=()=>{const h=runwayHdgDeg*Math.PI/180;return plane.pos.x*Math.sin(h)-plane.pos.z*Math.cos(h);};
  const across=()=>{const h=runwayHdgDeg*Math.PI/180;return plane.pos.x*Math.cos(h)+plane.pos.z*Math.sin(h);};
  const hash=()=>{let h=7;for(const ch of code())h=(h*31+ch.charCodeAt(0))%997;return h;};
  const fq=(o)=>(118+((hash()+o*37)%18)+((((hash()*3+o*11)%20)*5)/100)+.0).toFixed(2);
  const F=()=>({atis:fq(1),del:fq(2),gnd:fq(3),twr:fq(4),app:fq(5),dep:fq(6)});
  const atisL=()=>String.fromCharCode(65+(Math.floor(Date.now()/900000)+hash())%26);
  const NATO={A:'Alpha',B:'Bravo',C:'Charlie',D:'Delta',E:'Echo',F:'Foxtrot',G:'Golf',H:'Hotel',I:'India',J:'Juliet',K:'Kilo',L:'Lima',M:'Mike',N:'November',O:'Oscar',P:'Papa',Q:'Quebec',R:'Romeo',S:'Sierra',T:'Tango',U:'Uniform',V:'Victor',W:'Whiskey',X:'X-ray',Y:'Yankee',Z:'Zulu'};
  const sky=()=>{const n=(currentWeather&&currentWeather.name)||'CLEAR';return({CLEAR:'sky clear',CLOUDY:'broken clouds at 2500',RAIN:'overcast at 1200, moderate rain',STORM:'overcast at 800, thunderstorm',FOG:'vertical visibility 200, fog',SNOW:'overcast at 1500, light snow',CROSSWIND:'few clouds at 4000',TURBULENT:'scattered clouds at 3000'})[n]||'sky clear';};
  const vis=()=>{const d=(currentWeather&&currentWeather.fogD)||0;return d>.003?'400 meters':d>.001?'3 kilometers':d>.0006?'6 kilometers':'10 kilometers or more';};
  const heading=()=>{const mm=BABYLON.Matrix.Identity();plane.quat.toRotationMatrix(mm);const f=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(0,0,1),mm);return(Math.atan2(f.x,-f.z)*180/Math.PI+360)%360;};
  const stand=()=>st.stand||(st.stand=1+((Math.random()*8)|0));
  const pad=n=>String(Math.round(n)).padStart(3,'0');
  const readback=(txt,d)=>setTimeout(()=>say('p',txt),d||1800);
  const refreshFq=()=>{const f=F(),e=document.getElementById('atcFq');if(e)e.textContent=code()+' · ATIS '+f.atis+' · DEL '+f.del+' · GND '+f.gnd+' · TWR '+f.twr+' · APP '+f.app;};
  const atisText=()=>code()+' information '+NATO[atisL()]+', wind '+wind()+' knots, visibility '+vis()+', '+sky()+', QNH 1013, runway '+rwy()+' in use. Advise on first contact you have information '+NATO[atisL()]+'.';
  const acts={
    atis:()=>{say('p','Request ATIS, '+code()+'.');setTimeout(()=>{say('a',code()+' ATIS on '+F().atis+': '+atisText());st.atis=atisL();},900);},
    ifr:()=>{say('p','Delivery, '+st.cs+', request IFR clearance, stand '+stand()+', information '+(st.atis||'Alpha')+'.');setTimeout(()=>{if(!plane.onGround){say('a','Unable, you are airborne.');return;}
      const nf=(!st.atis||st.atis!==atisL())?' Advise you have information '+NATO[atisL()]+'.':'';
      say('a',st.cs+', '+code()+' Delivery, cleared to destination as filed, runway '+rwy()+', standard departure, climb and maintain 5000, departure frequency '+F().dep+', squawk '+st.sq+'.'+nf);
      readback('Cleared as filed, runway '+rwy()+', climb 5000, departure '+F().dep+', squawk '+st.sq+', '+st.cs+'.',2600);st.phase='cleared';},900);},
    push:()=>{say('p','Ground, '+st.cs+', stand '+stand()+', request pushback and start-up.');setTimeout(()=>{if(st.phase==='ramp'||st.phase==='cleared'){say('a',st.cs+', '+code()+' Ground '+F().gnd+', pushback approved, tail '+(Math.random()<.5?'north':'south')+', start-up at your discretion. Call ready to taxi.');readback('Pushback approved, start-up at our discretion, '+st.cs+'.',2200);st.phase='pushed';}else say('a','Negative, '+st.cs+', already moving or clearance required.');},900);},
    taxi:()=>{const arriving=st.arrived;say('p',arriving?'Ground, '+st.cs+', runway vacated, request taxi to the gate.':'Ground, '+st.cs+', ready to taxi.');
      setTimeout(()=>{if(!plane.onGround){say('a','Negative, you are airborne.');return;}
        if(arriving){const n=stand();say('a',st.cs+', '+code()+' Ground '+F().gnd+', taxi to stand '+n+' via taxiway Alpha, Alpha '+(1+((Math.random()*4)|0))+', give way to the company jet on your left.');readback('Taxi to stand '+n+' via Alpha, '+st.cs+'.',2300);st.phase='ramp';}
        else{const c=1+((Math.random()*4)|0);say('a',st.cs+', '+code()+' Ground '+F().gnd+', taxi to holding point runway '+rwy()+' via taxiway Alpha, Alpha '+c+', hold short runway '+rwy()+'. Wind '+wind()+', QNH 1013.');readback('Taxi to holding point runway '+rwy()+' via Alpha, Alpha '+c+', hold short, '+st.cs+'.',2600);st.phase='taxi';}},900);},
    lineup:()=>{say('p','Tower, '+st.cs+', holding short runway '+rwy()+', ready.');setTimeout(()=>{if(!plane.onGround){say('a','Negative, you are airborne.');return;}
      if(Math.abs(across())>runwayWidM*2.5||Math.abs(along())>runwayLenM/2+350){say('a',st.cs+', '+code()+' Tower, not at the holding point. Continue taxi to runway '+rwy()+'.');return;}
      say('a',st.cs+', '+code()+' Tower '+F().twr+', runway '+rwy()+', line up and wait.');readback('Line up and wait runway '+rwy()+', '+st.cs+'.',1800);st.phase='lineup';},900);},
    tkoff:()=>{say('p','Tower, '+st.cs+', runway '+rwy()+', ready for departure.');setTimeout(()=>{if(!plane.onGround){say('a','Negative, you are airborne.');return;}
      if(Math.abs(across())>runwayWidM*1.5||Math.abs(along())>runwayLenM/2+300){say('a',st.cs+', '+code()+' Tower, hold position, you are not at the holding point. Taxi to runway '+rwy()+'.');return;}
      say('a',st.cs+', '+code()+' Tower, wind '+wind()+' knots, runway '+rwy()+', cleared for takeoff. Contact Departure '+F().dep+' after airborne.');
      readback('Cleared for takeoff runway '+rwy()+', '+st.cs+'.',2400);st.phase='takeoff';},900);},
    land:()=>{say('p','Approach, '+st.cs+', inbound, request landing, runway '+rwy()+'.');setTimeout(()=>{if(plane.onGround){say('a','Negative, you are on the ground.');return;}
      const d=-along()/1852;if(d<-1||d>30){say('a',st.cs+', '+code()+' Approach '+F().app+', radar contact. Fly heading '+pad(runwayHdgDeg)+' and expect vectors for runway '+rwy()+'. Descend and maintain 3000.');readback('Heading '+pad(runwayHdgDeg)+', descend 3000, '+st.cs+'.',2200);st.phase='appr';}
      else{say('a',st.cs+', '+code()+' Tower '+F().twr+', wind '+wind()+' knots, runway '+rwy()+', number one, cleared to land.');readback('Cleared to land runway '+rwy()+', '+st.cs+'.',2200);st.phase='land';}},900);},
    vec:()=>{say('p','Approach, '+st.cs+', request vectors to final.');setTimeout(()=>{const a=along(),c=across();if(plane.onGround){say('a','Negative, you are on the ground.');return;}
      if(a>-runwayLenM/2){say('a',st.cs+', turn left heading '+pad((runwayHdgDeg+180)%360)+', climb and maintain 3000, vectors for runway '+rwy()+'.');readback('Left heading '+pad((runwayHdgDeg+180)%360)+', climb 3000, '+st.cs+'.',2000);}
      else{const d=Math.abs(a+runwayLenM/2)/1852;const h2=Math.round(runwayHdgDeg+Math.max(-30,Math.min(30,-c/150)));say('a',st.cs+', '+d.toFixed(0)+' miles from the threshold, '+(c>200?'turn left':c<-200?'turn right':'continue')+' heading '+pad(h2)+', descend and maintain '+Math.max(2000,Math.round(d*320/100)*100)+', cleared ILS runway '+rwy()+' approach.');readback('Heading '+pad(h2)+', cleared ILS runway '+rwy()+', '+st.cs+'.',2600);st.phase='appr';}},900);},
    go:()=>{say('p','Going around, '+st.cs+'.');setTimeout(()=>{say('a',st.cs+', roger, fly runway heading, climb to 3000, contact Approach '+F().app+'.');},700);st.phase='appr';},
    tfc:()=>{say('p','Request traffic information.');setTimeout(()=>say('a',trafficCall(true)),900);},
    emg:()=>{say('p','MAYDAY MAYDAY MAYDAY, '+st.cs+', declaring an emergency.');setTimeout(()=>say('a',st.cs+', roger MAYDAY, '+code()+' Approach, all traffic cleared, runway '+rwy()+' is yours, emergency services alerted. Say souls on board and fuel.'),900);}
  };
  const trafficCall=(force)=>{let best=null,bd=1e9;for(const t of traffic){if(!t.pos)continue;const dx=t.pos.x-plane.pos.x,dz=t.pos.z-plane.pos.z,d=Math.hypot(dx,dz);if(d<bd){bd=d;best={t,dx,dz,d};}}
    if(!best||best.d>(force?40000:11000))return force?st.cs+', no traffic observed.':null;
    const brg=(Math.atan2(best.dx,-best.dz)*180/Math.PI+360)%360,rel=(brg-heading()+360)%360;let clk=Math.round(rel/30);if(clk===0)clk=12;
    const dy=(best.t.pos.y-plane.pos.y)*3.28084,alt=Math.abs(dy)<400?'same altitude':(dy>0?Math.round(dy/100)*100+' feet above':Math.round(-dy/100)*100+' feet below');
    return st.cs+', traffic, '+clk+' o\'clock, '+(best.d/1852).toFixed(1)+' miles, '+alt+'.';};
  const btns=[['atis','ATIS',acts.atis],['ifr','Clearance delivery',acts.ifr],['push','Pushback / startup',acts.push],['taxi','Taxi',acts.taxi],['lu','Line up & wait',acts.lineup],['tk','Takeoff',acts.tkoff],['v','Vectors / approach',acts.vec],['l','Landing',acts.land],['g','Go around',acts.go],['t','Traffic',acts.tfc],['e','MAYDAY',acts.emg]];
  const bb=document.getElementById('atcB');btns.forEach(b=>{const e=document.createElement('button');e.textContent=b[1];e.addEventListener('click',b[2]);bb.appendChild(e);});
  const tog=()=>{box.classList.toggle('show');};
  ab.addEventListener('click',tog);document.getElementById('atcX').addEventListener('click',tog);
  document.getElementById('atcV').addEventListener('click',e=>{st.voice=!st.voice;e.target.textContent=st.voice?'🔊':'🔇';if(!st.voice&&window.speechSynthesis)speechSynthesis.cancel();});
  window.addEventListener('keydown',e=>{if(e.code==='KeyK'&&!/INPUT|SELECT/.test((e.target||{}).tagName||''))tog();});
  box.addEventListener('keydown',e=>e.stopPropagation());
  let lastAir=false,handed=false;
  setInterval(()=>{
    const air=!plane.onGround&&!plane.crashed;
    if(air&&!lastAir&&st.phase==='takeoff'){setTimeout(()=>say('a',st.cs+', airborne, contact Departure '+F().dep+', good day.'),1500);st.phase='climb';st.arrived=false;st.stand=0;}
    if(!air&&lastAir&&(st.phase==='land'||st.phase==='appr')){setTimeout(()=>say('a',st.cs+', welcome to '+code()+', vacate runway when able, contact Ground '+F().gnd+'.'),2500);st.phase='ramp';st.arrived=true;}
    if(air&&st.phase==='cleared'){st.phase='climb';}
    if(air&&agl()>1500&&!handed&&st.phase==='climb'){handed=true;say('a',st.cs+', radar contact, climb at pilot\'s discretion.');}
    if(!air)handed=false;
    if(st.phase==='appr'&&air&&agl()<2500&&agl()>200){const d=-along()/1852,ac=Math.abs(across());if(d>0&&d<6&&ac<600&&!st._cl){st._cl=1;say('a',st.cs+', '+code()+' Tower '+F().twr+', wind '+wind()+' knots, runway '+rwy()+', cleared to land.');readback('Cleared to land runway '+rwy()+', '+st.cs+'.',2200);st.phase='land';}}
    if(!air||st.phase!=='appr')st._cl=0;
    if(air&&agl()>800&&performance.now()-(st._tfcT||0)>75000){const tc=trafficCall(false);if(tc){st._tfcT=performance.now();say('a',tc);}}
    refreshFq();
    if(st.phase==='land'&&air&&agl()<400&&agl()>50&&!st._tw){st._tw=1;say('a',st.cs+', wind '+wind()+', runway '+rwy()+' cleared to land.');}
    if(!air)st._tw=0;
    lastAir=air;
  },1000);
  say('a','Welcome. Use the buttons below to talk to ATC: ATIS → Clearance → Pushback → Taxi → Line up → Takeoff. Press K to open or close.');refreshFq();
  return st;
})();

/* ===== EXTRA FAULTS, GPWS CALLOUTS, DYNAMIC PAPI ===== */
const XF={t:{},fog0:null,thr:0,chaosT:20,lastCall:9999,said:{},lastAgl:0};
const MD_SET=new Set(['dc9','md83','dc10']);
const AIRBUS_SET=new Set(['a320','a350','a380']);
/* Each entry is [airbus file, MD file, Boeing/default file] — the repo uses three
   different naming schemes per aircraft family: Airbus = "airbus-gpws-callout-v2-*-ft.mp3",
   MD = "*-ft-over-the-ground.mp3", Boeing (and everything else) = plain "*.wav"/"*.mp3"
   with no suffix (e.g. "10.wav"). This used to default everyone who wasn't MD to the
   Airbus file, so Boeing callouts were playing with Airbus wording. */
const ALT_FILES={
  '2500':['airbus-gpws-callout-v2-2500-ft.mp3','2500-ft-over-the-ground.mp3','2500.wav'],
  '1000':['airbus-gpws-callout-v2-1000-ft.mp3','1000-ft-over-the-ground.mp3','1000.wav'],
  '500': ['airbus-gpws-callout-v2-500-ft.mp3','500-ft-over-the-ground.mp3','500.wav'],
  '400': ['airbus-gpws-callout-v2-400-ft.mp3','400-ft-over-the-ground.mp3','400.wav'],
  '300': ['airbus-gpws-callout-v2-300-ft.mp3','300-ft-over-the-ground.mp3','300.wav'],
  '200': ['airbus-gpws-callout-v2-200-ft.mp3','200-ft-over-the-ground.mp3','200.wav'],
  '100': ['airbus-gpws-callout-v2-100-ft.mp3','100-ft-over-the-ground.mp3','100.wav'],
  '50':  ['airbus-gpws-callout-v2-50-ft.mp3','50-ft-over-the-ground.mp3','50.wav'],
  '40':  ['airbus-gpws-callout-v2-40-ft.mp3','40-ft-over-the-ground.mp3','40.wav'],
  '30':  ['airbus-gpws-callout-v2-30-ft.mp3','30-ft-over-the-ground.mp3','30.wav'],
  '20':  ['airbus-gpws-callout-v2-20-ft.mp3','20-ft-over-the-ground.mp3','20.wav'],
  '10':  ['10.wav','10-ft-over-the-ground.mp3','10.wav'] // no dedicated Airbus "10 ft" sample exists
};
const MINIM_FILES=['airbus-gpws-callout-v2-minimum.mp3','minimums.mp3','MINIM.wav'];
const APRMIN_FILES=['approaching-minimums.mp3','approaching-minimums.mp3','APRMIN.wav']; // no dedicated Airbus sample
const pickMD=triple=>triple[AIRBUS_SET.has(window._activeModelId)?0:MD_SET.has(window._activeModelId)?1:2];
const SFX_MAP=[
  [/approaching minimums/,'APRMIN','aprmin'],[/^minimums/,'MINIM','minim'],
  [/twenty five hundred/,'2500','alt'],[/one thousand/,'1000','alt'],[/five hundred/,'500','alt'],
  [/four hundred/,'400','alt'],[/three hundred/,'300','alt'],[/two hundred/,'200','alt'],
  [/one hundred/,'100','alt'],[/^fifty/,'50','alt'],[/^forty/,'40','alt'],[/^thirty/,'30','alt'],
  [/^twenty$/,'20','alt'],[/^ten$/,'10','alt'],
  [/terrain pull/,'TERPUL.wav'],[/too low terrain/,'LOWTRN.wav'],[/terrain/,'TERAIN.wav'],
  [/sink rate/,'SNKRAT.wav'],[/pull up/,'PULLUP.wav'],[/too low gear/,'LOWGEA.wav'],
  [/too low flaps/,'LOWFLP.wav'],[/bank angle/,'BNKANG.wav'],[/don't sink/,'DONSNK.wav'],
  [/overspeed/,'OVRSPD.mp3'],[/windshear ahead/,'windshear-ahead','wsahead'],
  [/windshear|wind shear/,'windshear.mp3'],
  [/altitude alert/,'ALTAL1.wav'],[/altitude deviation/,'ALTAL2.wav'],
  [/altitude entering|altitude capture/,'ALTENT.wav'],
  [/autopilot disconnect/,'autopilot-disconnect.mp3'],
  [/engine 1 fire|engine one fire/,'1','fire'],
  [/engine 2 fire|engine two fire/,'2','fire'],
  [/glideslope/,'glideslope.mp3'],[/clear of conflict/,'clear-of-conflict','coc'],
  [/traffic,? traffic/,'traffic-traffic-traffic.mp3'],
  [/descend,? descend now/,'descend-descend-now.mp3'],
  [/descend,? descend/,'descend-descend.mp3'],
  [/increase climb/,'increase-climb.mp3'],
  [/increase descen/,'increase-descend.mp3'],
  [/adjust vertical speed|^adjust$/,'adjust.mp3'],[/startup/,'STRTUP.wav']
];
const SFX_BASES=['','https://milottc.github.io/Flight-sim/'];window._minsT=0;
let _sfxSeq=0;
/* Only one callout (WAV or speech) may play at a time. Starting a new one cuts the old one off,
   so a repeating warning never stacks on top of itself or on top of text-to-speech. */
function stopAllCallouts(){
  _sfxSeq++;
  try{if(_sfxCur){_sfxCur.onerror=null;_sfxCur.pause();_sfxCur=null;}}catch(e){}
  try{if(window.speechSynthesis)speechSynthesis.cancel();}catch(e){}
}
function playSfx(file,onFail){
  stopAllCallouts();const myId=_sfxSeq;
  const combos=SFX_BASES.map(b=>b+file);
  let i=0;
  const tryNext=()=>{
    if(myId!==_sfxSeq)return;
    if(i>=combos.length){onFail&&onFail();return;}
    const a=new Audio(combos[i++]);a.volume=masterVol!==undefined?masterVol:1;
    a.onerror=()=>{if(myId===_sfxSeq)tryNext();};
    _sfxCur=a;
    a.play().catch(()=>{if(myId!==_sfxSeq)return;if(a.error)tryNext();else onFail&&onFail();});
  };
  tryNext();
}
const _ttsFallback=(t,rate)=>{try{if(window.speechSynthesis&&atc.voice){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.rate=rate||1.15;u.pitch=.8;speechSynthesis.speak(u);}}catch(e){}};
const speak=(t,rate)=>{const l=t.toLowerCase();for(const [re,f,kind] of SFX_MAP){if(re.test(l)){
    if(kind==='alt'&&performance.now()/1000-window._minsT<1.3)return;
    let file;
    if(kind==='alt')file=pickMD(ALT_FILES[f]);
    else if(kind==='minim'){file=pickMD(MINIM_FILES);window._minsT=performance.now()/1000;}
    else if(kind==='aprmin')file=pickMD(APRMIN_FILES);
    else if(kind==='fire'){if(MD_SET.has(window._activeModelId))file='md-engine-'+f+'-fire.mp3';else{_ttsFallback(t,rate);return;}}
    else if(kind==='coc'){if(AIRBUS_SET.has(window._activeModelId))file='airbus-clear-of-conflict-warning.mp3';else{_ttsFallback(t,rate);return;}}
    else if(kind==='wsahead'){if(AIRBUS_SET.has(window._activeModelId))file='airbus-2x-windshear-ahead-warning.mp3';else file='windshear.mp3';}
    else file=f;
    if(atc.voice)playSfx(file,()=>_ttsFallback(t,rate));
    return;
  }}
  _ttsFallback(t,rate);};
function masterWarn(){if(atc.voice&&AIRBUS_SET.has(window._activeModelId))playSfx('airbus-master-warn.mp3');}

let masterVol=.6,_prevVol=.6;
const AMB=(function(){
  let ctx=null,master=null,started=false,noiseBuf=null;
  const mkNoise=()=>{const sr=ctx.sampleRate,len=sr*2,b=ctx.createBuffer(1,len,sr),d=b.getChannelData(0);
    let last=0;for(let i=0;i<len;i++){const w=Math.random()*2-1;last=(last+w*.18)/1.18;d[i]=last;}return b;};
  const mkEngine=()=>{
    const whine=ctx.createOscillator();whine.type='triangle';whine.frequency.value=90;
    const whine2=ctx.createOscillator();whine2.type='triangle';whine2.frequency.value=90.6;
    const whineF=ctx.createBiquadFilter();whineF.type='lowpass';whineF.frequency.value=950;whineF.Q.value=.4;
    const whineHP=ctx.createBiquadFilter();whineHP.type='highpass';whineHP.frequency.value=160;
    const whineG=ctx.createGain();whineG.gain.value=0;
    const drift=ctx.createOscillator();drift.type='sine';drift.frequency.value=.13+Math.random()*.08;
    const driftG=ctx.createGain();driftG.gain.value=3;drift.connect(driftG);driftG.connect(whine.frequency);driftG.connect(whine2.frequency);drift.start();
    whine.connect(whineF);whine2.connect(whineF);whineF.connect(whineHP);whineHP.connect(whineG);whineG.connect(master);whine.start();whine2.start();
    const noiseSrc=ctx.createBufferSource();noiseSrc.buffer=noiseBuf;noiseSrc.loop=true;
    const noiseF=ctx.createBiquadFilter();noiseF.type='bandpass';noiseF.frequency.value=250;noiseF.Q.value=.6;
    const noiseG=ctx.createGain();noiseG.gain.value=0;
    noiseSrc.connect(noiseF);noiseF.connect(noiseG);noiseG.connect(master);noiseSrc.start();
    return {whine,whine2,whineF,whineG,noiseF,noiseG};
  };
  let engL=null,engR=null,windSrc=null,windF=null,windG=null,rumbleSrc=null,rumbleF=null,rumbleG=null;
  const ensure=()=>{
    if(started)return true;
    try{
      ctx=new(window.AudioContext||window.webkitAudioContext)();
      master=ctx.createGain();master.gain.value=masterVol;master.connect(ctx.destination);
      noiseBuf=mkNoise();
      engL=mkEngine();engR=mkEngine();
      windSrc=ctx.createBufferSource();windSrc.buffer=noiseBuf;windSrc.loop=true;
      windF=ctx.createBiquadFilter();windF.type='highpass';windF.frequency.value=900;windF.Q.value=.5;
      windG=ctx.createGain();windG.gain.value=0;
      windSrc.connect(windF);windF.connect(windG);windG.connect(master);windSrc.start();
      rumbleSrc=ctx.createBufferSource();rumbleSrc.buffer=noiseBuf;rumbleSrc.loop=true;
      rumbleF=ctx.createBiquadFilter();rumbleF.type='lowpass';rumbleF.frequency.value=140;rumbleF.Q.value=.5;
      rumbleG=ctx.createGain();rumbleG.gain.value=0;
      rumbleSrc.connect(rumbleF);rumbleF.connect(rumbleG);rumbleG.connect(master);rumbleSrc.start();
      started=true;
    }catch(e){console.warn('ambient audio',e);}
    return started;
  };
  const rampG=(g,v,t)=>{try{g.gain.setTargetAtTime(v,ctx.currentTime,t||.15);}catch(e){}};
  const rampF=(f,v,t)=>{try{f.frequency.setTargetAtTime(v,ctx.currentTime,t||.2);}catch(e){}};
  let prevGear=null,prevRev=false;let gearSfxT=0;
  const thump=(amount)=>{if(!ensure())return;const g=ctx.createGain(),src=ctx.createBufferSource();src.buffer=noiseBuf;
    const f=ctx.createBiquadFilter();f.type='lowpass';f.frequency.value=160;
    g.gain.value=0;src.connect(f);f.connect(g);g.connect(master);src.start();
    g.gain.setTargetAtTime(Math.min(1.4,.4+amount),ctx.currentTime,.01);
    g.gain.setTargetAtTime(0,ctx.currentTime+.04,.09);
    src.stop(ctx.currentTime+.6);};
  window._ambThump=thump;
  const update=(dt)=>{
    if(!ctx){if(ENG.L.state!=='OFF'||ENG.R.state!=='OFF')ensure();else return;}
    if(ctx.state==='suspended')ctx.resume().catch(()=>{});
    const n1L=ENG.L.n1||0,n1R=ENG.R.n1||0;
    const setEng=(e,n1,running)=>{
      const on=running&&n1>3;
      const whineAmt=on?Math.max(0,(n1-35)/65):0;
      rampG(e.whineG,Math.min(.16,whineAmt*.16),.3);
      const wf=120+n1*3.6;rampF(e.whine,wf,.25);rampF(e.whine2,wf*1.007,.25);
      rampG(e.noiseG,on?Math.min(.6,.1+n1/100*.5):0,.3);
      rampF(e.noiseF,80+n1*3.0,.25);
    };
    setEng(engL,n1L,ENG.L.state==='RUNNING'||ENG.L.state==='STARTING');
    setEng(engR,n1R,ENG.R.state==='RUNNING'||ENG.R.state==='STARTING');
    const kts=(plane.speed||0)*1.94384;
    rampG(windG,Math.min(.5,Math.pow(Math.min(1,kts/420),1.3)*.45),.3);
    rampF(windF,800+kts*2.2,.25);
    const rev=!!plane.reverserOn&&plane.onGround;
    rampG(rumbleG,rev?Math.min(.6,.25+(n1L+n1R)/200*.4):(plane.onGround&&(n1L+n1R)>50?.05:0),.2);
    rampF(rumbleF,rev?90:140,.2);
    if(rev&&!prevRev)thump(.15);
    prevRev=rev;
    if(prevGear!==null&&plane.gearDown!==prevGear&&performance.now()/1000-gearSfxT>1){
      gearSfxT=performance.now()/1000;
      try{const g=ctx.createGain(),src=ctx.createBufferSource();src.buffer=noiseBuf;
        const f=ctx.createBiquadFilter();f.type='bandpass';f.frequency.value=500;f.Q.value=1.2;
        g.gain.value=0;src.connect(f);f.connect(g);g.connect(master);src.start();
        g.gain.setTargetAtTime(.22,ctx.currentTime,.05);f.frequency.linearRampToValueAtTime(900,ctx.currentTime+1.6);
        g.gain.setTargetAtTime(0,ctx.currentTime+1.6,.2);src.stop(ctx.currentTime+2);}catch(e){}
    }
    prevGear=plane.gearDown;
    master.gain.value=masterVol;
  };
  return {update,setVol:v=>{masterVol=v;try{if(master)master.gain.value=v;}catch(e){}},ensure};
})();
window.addEventListener('keydown',e=>{if(e.code==='KeyY'&&!/INPUT|SELECT|TEXTAREA/.test((e.target||{}).tagName||'')){
  if(masterVol>0){_prevVol=masterVol;AMB.setVol(0);showMsg('SOUND MUTED',1200);}
  else{AMB.setVol(_prevVol||.6);showMsg('SOUND ON',1200);}
}});
scene.registerBeforeRender(()=>{try{AMB.update(Math.min(.05,engine.getDeltaTime()/1000));}catch(e){}});

function xfUpdate(dt){
  if(plane.crashed)return;
  const air=!plane.onGround,f=n=>faults.has(n),now=performance.now()/1000;
  if(f('MICROBURST')){XF.t.mb=(XF.t.mb||0)+dt;const k=Math.sin(Math.min(1,XF.t.mb/20)*Math.PI);
    if(air){plane.vel.y-=11*k*dt;plane.vel.x+=Math.sin(XF.t.mb*1.3)*6*k*dt;plane.vel.z+=Math.cos(XF.t.mb*1.1)*6*k*dt;plane.angVel.z+=Math.sin(XF.t.mb*3)*.35*k*dt*10;}
    if(XF.t.mb>20){faults.clear('MICROBURST');XF.t.mb=0;showMsg('MICROBURST CLEARED',2500);}}
  else XF.t.mb=0;
  if(f('LIGHTNING')){XF.t.lg=(XF.t.lg||0)+dt;
    if(Math.random()<dt*5){const w=document.getElementById('wxFlash');if(w){w.style.opacity='.8';setTimeout(()=>w.style.opacity='0',70);}plane.angVel.x+=(Math.random()-.5)*.25;plane.angVel.z+=(Math.random()-.5)*.35;camState.shake=Math.max(camState.shake,1.2);}
    if(XF.t.lg>4){faults.clear('LIGHTNING');XF.t.lg=0;showMsg('LIGHTNING · SYSTEMS NOMINAL',2500);}}
  else XF.t.lg=0;
  if(f('ASH')){if(XF.fog0===null){XF.fog0={d:scene.fogDensity,c:scene.fogColor.clone()};}scene.fogDensity=Math.max(scene.fogDensity,.0011);scene.fogColor=new BABYLON.Color3(.25,.2,.17);
    if(Math.random()<dt*.25){plane.throttle=Math.max(0,plane.throttle-.3);showMsg('⚠ ENGINE SURGE · ASH INGESTION',2500);camState.shake=Math.max(camState.shake,1);}}
  else if(XF.fog0){scene.fogDensity=XF.fog0.d;scene.fogColor=XF.fog0.c;XF.fog0=null;}
  if(f('FUEL_IMBAL')&&air)plane.angVel.z+=-.035*dt*Math.min(1,plane.speed/80)*10;
  if(f('DUAL_ENG')){ENG.L.state='SHUTDOWN';ENG.R.state='SHUTDOWN';plane.throttle=0;}
  if(f('THR_STUCK')){if(!XF.thrOn){XF.thrOn=1;XF.thr=plane.throttle;}plane.throttle=XF.thr;}else XF.thrOn=0;
  if(f('DECOMP')){if(!XF.dc){XF.dc=1;showMsg('⚠ RAPID DECOMPRESSION · MASKS ON · EMERGENCY DESCENT',4000);speak('Rapid decompression. Emergency descent.');}
    if(air&&plane.pos.y>3000*0.3048){plane.vel.y-=Math.min(8,Math.max(0,plane.vel.y+20))*dt*2;}
    camState.shake=Math.max(camState.shake,.35);}
  else XF.dc=0;
  if(f('CHAOS')){XF.chaosT-=dt;if(XF.chaosT<=0){XF.chaosT=25+Math.random()*35;
    const pool=Object.keys(FAULTS).filter(k=>!/^(CHAOS|COLLISION|DUAL_ENG|ENG_FIRE_L|ENG_FIRE_R|STALL|OVERSPEED)$/.test(k)&&FAULTS[k].reset!=='AUTO'&&!faults.has(k));
    const on=Object.keys(faults.latched).filter(k=>faults.latched[k]&&k!=='CHAOS');if(on.length>2)faults.clear(on[0]);
    if(pool.length)faults.inject(pool[(Math.random()*pool.length)|0]);}}
  const gh=ACFG.gearHeight||2.5,agl=Math.max(0,(plane.pos.y-sampleSurface(plane.pos.x,plane.pos.z)-gh)*3.28084),vs=plane.vel.y*196.85,kts=plane.speed*1.94384;
  if(air&&vs<-150&&!f('RADALT_FAIL')){
    const steps=[[2500,'TWENTY FIVE HUNDRED'],[1000,'ONE THOUSAND'],[500,'FIVE HUNDRED'],[400,'FOUR HUNDRED'],[300,'THREE HUNDRED'],[200,'TWO HUNDRED'],[100,'ONE HUNDRED'],[50,'FIFTY'],[40,'FORTY'],[30,'THIRTY'],[20,'TWENTY'],[10,'TEN']];
    for(const [h,t] of steps){if((XF.lastAgl>h&&agl<=h&&plane.gearPos>.8)||(XF.lastAgl>h&&agl<=h&&h>=500)){
      showMsg(t,900);speak(t.toLowerCase(),1.3);if(h===500&&plane.gearPos<.8&&!AIRSYS.gpws.gearOverride)setTimeout(()=>speak('too low gear'),1600);break;}}
    if(agl<2500&&agl>50&&-vs>2200+agl*.6&&now-XF.lastCall>2.5){XF.lastCall=now;showMsg('⚠ SINK RATE',1200);speak('sink rate. pull up',1.2);}
    if(!AIRSYS.gpws.gearOverride&&agl<1000&&agl>100&&plane.gearPos<.5&&kts<200&&now-XF.lastCall>6){XF.lastCall=now;showMsg('⚠ TOO LOW GEAR',1500);speak('too low gear');}
    if(!AIRSYS.gpws.flapOverride&&agl<1000&&agl>200&&plane.flaps<1&&kts<190&&plane.gearPos>.8&&now-XF.lastCall>8){XF.lastCall=now;showMsg('⚠ TOO LOW FLAPS',1500);speak('too low flaps');}
    const ils=window._ilsDev;
    if(!AIRSYS.gpws.glideslopeInhibit&&AP.appr&&ils&&ils.valid&&agl<1000&&agl>100&&ils.gs<-.5&&now-XF.lastCall>8){
      XF.lastCall=now;showMsg('⚠ GLIDESLOPE',1500);speak('glideslope');
    }
  }
  if(air&&!AIRSYS.gpws.terrainOverride&&agl<400&&agl>30&&plane.vel.y<-8&&now-XF.lastCall>2){XF.lastCall=now;showMsg('⚠ PULL UP',1000);speak('pull up. pull up.',1.3);}
  if(air&&agl<400&&agl>30&&faults.has('ICING')===false&&plane.alpha>ACFG.stallAlpha*.92&&now-XF.lastCall>3){XF.lastCall=now;playSfx('mdstall.mp3',()=>_ttsFallback('stall. stall.',1.3));}
  if(air&&plane.stall&&!plane.onGround&&now-(XF.lastStallSnd||0)>4){XF.lastStallSnd=now;playSfx('mdstall.mp3',()=>_ttsFallback('stall. stall.',1.3));}
  XF.lastAgl=agl;
  if(!air)XF.lastAgl=0;
  if(window.apPapi&&window.apGeo){const g=window.apGeo;const inv=g.root.getWorldMatrix().clone().invert();const lp=BABYLON.Vector3.TransformCoordinates(plane.pos,inv);
    const gearH=(typeof ACFG!=='undefined'&&ACFG.gearHeight)?ACFG.gearHeight:3;
    const nt=(typeof nightMode!=='undefined')?nightMode:false;
    for(const q of window.apPapi){let dz,hd,ay;
      if(q.w){const rx=plane.pos.x-q.w[0],rz=plane.pos.z-q.w[1];dz=rx*q.dir[0]+rz*q.dir[1];hd=Math.hypot(rx,rz);ay=plane.pos.y-runwayY-q.w[2];}
      else{const bp=q.pb.position;dz=(lp.z-bp.z)*q.e*-1;hd=Math.hypot(lp.x-bp.x,lp.z-bp.z);ay=lp.y-bp.y;}
      let r=.12,gC=.1,b2=.08,k=.35;
      if(dz>0&&hd<20000){
        const ang=Math.atan2(ay-gearH,hd)*180/Math.PI,th=2.5+q.i*(1/3);
        const t=Math.max(0,Math.min(1,(ang-(th-.08))/.16));
        r=1.3;gC=.12+t*1.18;b2=.08+t*1.12;k=1;
      }
      q.pm.emissiveColor.set(r*k,gC*k,b2*k);q.pm.diffuseColor.set(r*k,gC*k,b2*k);
      if(q.gm){q.gm.emissiveColor.set(Math.min(1,r*k),Math.min(1,gC*k),Math.min(1,b2*k));q.gl.visibility=(dz>0&&hd<12000)?(nt?.9:.5)*Math.min(1,hd/300)*k:0;q.gl.scaling.setAll(1+hd/900);}}}
}
scene.registerBeforeRender(()=>{try{xfUpdate(Math.min(.05,engine.getDeltaTime()/1000));}catch(e){}});
(function(){const nl=new BABYLON.SpotLight('noseL',new BABYLON.Vector3(0,-1.5,16),new BABYLON.Vector3(0,-.18,1),1.3,1.2,scene);nl.parent=aircraftRoot;nl.intensity=16;nl.range=700;nl.diffuse=new BABYLON.Color3(1,.95,.8);
  scene.registerBeforeRender(()=>{nl.setEnabled(landingOn&&window._taxiOn!==false);const a=plane.pos.y-sampleSurface(plane.pos.x,plane.pos.z);llights.forEach(l=>{l.range=Math.min(2200,400+a*1.2);});});})();

/* ===== MINIMUMS + EXTRA GPWS ===== */
const MINS={on:true,dh:200,last:9999,appr:false,hit:false,bank:0,ter:0,os:false,apPrev:false,altAl:false};
(function(){
  const fms=document.getElementById('fms');
  if(fms){const row=document.createElement('div');row.className='row';row.innerHTML='<span class="lbl">MINIMUMS DH (ft)</span><input id="minsIn" type="number" step="10" value="200"><button id="minsOn" class="on">ON</button>';
    const lbl=[...fms.querySelectorAll('.lbl')].find(e=>e.textContent==='FLIGHT PLAN');if(lbl)fms.insertBefore(row,lbl);else fms.appendChild(row);
    row.querySelector('#minsIn').addEventListener('change',e=>{const v=parseFloat(e.target.value);if(isFinite(v))MINS.dh=Math.max(0,v);});
    row.querySelector('#minsOn').addEventListener('click',e=>{MINS.on=!MINS.on;e.target.classList.toggle('on',MINS.on);e.target.textContent=MINS.on?'ON':'OFF';});}
  const mm=document.createElement('div');mm.id='minsHud';mm.style.cssText='position:fixed;left:50%;top:132px;transform:translateX(-50%);z-index:20;padding:4px 14px;border-radius:6px;font:700 15px Consolas,monospace;letter-spacing:3px;color:#ffd400;background:rgba(0,0,0,.55);border:1px solid #ffd400;display:none;pointer-events:none';document.body.appendChild(mm);
  scene.registerBeforeRender(()=>{try{
    const now=performance.now()/1000,air=!plane.onGround&&!plane.crashed;
    const agl=Math.max(0,(plane.pos.y-sampleSurface(plane.pos.x,plane.pos.z)-(ACFG.gearHeight||2.5))*3.28084);
    const indicatedAlt=plane.pos.y*3.28084+(EFIS.baroHpa-1013.25)*27;
    const radioSource=EFIS.minsSource==='RADIO';
    const minimum=radioSource?MINS.dh:((currentLocation.elev||0)*3.28084+MINS.dh);
    const minsValue=radioSource?agl:indicatedAlt,vs=plane.vel.y*196.85,kts=plane.speed*1.94384;
    if(MINS.on&&air&&(!radioSource||!faults.has('RADALT_FAIL'))){
      const dh=minimum;
      if(minsValue>dh+150){MINS.hit=false;MINS.appr=false;}
      if(vs<-100&&plane.gearPos>.5){
        if(!MINS.appr&&MINS.last>dh+100&&minsValue<=dh+100&&minsValue>dh){MINS.appr=true;showMsg('APPROACHING MINIMUMS',2000);speak('approaching minimums');}
        if(!MINS.hit&&MINS.last>dh&&minsValue<=dh){MINS.hit=true;showMsg('MINIMUMS',2500);speak('minimums');}
      }
      mm.style.display=(minsValue<dh+400&&plane.gearPos>.5)?'block':'none';
      mm.textContent=(radioSource?'RA ':'BARO ')+Math.round(dh)+(MINS.hit?' · MINIMUMS':'');
      mm.style.color=MINS.hit?'#ff9a2e':'#ffd400';
      MINS.last=minsValue;
    } else {mm.style.display='none';MINS.last=9999;if(!air){MINS.hit=false;MINS.appr=false;}}
    if(air&&agl>30&&agl<2500){plane.quat.toRotationMatrix(_nm);const bk=Math.abs(Math.asin(BABYLON.Scalar.Clamp(BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1,0,0),_nm).y,-1,1))*180/Math.PI);
      if(bk>40&&now-MINS.bank>3){MINS.bank=now;showMsg('⚠ BANK ANGLE',1200);speak('bank angle');}}
    if(air&&kts>345){if(!MINS.os){MINS.os=true;showMsg('⚠ OVERSPEED',1500);speak('overspeed');}}else if(kts<335)MINS.os=false;
    if(air&&faults.has('MICROBURST')&&now-(MINS.ws||0)>4){MINS.ws=now;showMsg('⚠ WINDSHEAR',1500);speak('windshear');}
    if(air&&!AIRSYS.gpws.terrainOverride&&agl<2500&&agl>80&&plane.speed>50&&now-MINS.ter>3){
      const t1=sampleTerrain(plane.pos.x+plane.vel.x*10,plane.pos.z+plane.vel.z*10),t2=sampleTerrain(plane.pos.x+plane.vel.x*5,plane.pos.z+plane.vel.z*5);
      if(t2>plane.pos.y-60){MINS.ter=now;showMsg('⚠ TERRAIN · PULL UP',1800);speak('terrain pull up');}
      else if(t1>plane.pos.y-60&&plane.gearPos<.5){MINS.ter=now;showMsg('⚠ TERRAIN',1500);speak('terrain');}}
    if(air&&agl<700&&agl>60&&vs<-200&&plane.gearPos<.3&&plane.flaps<=1&&kts>140&&now-(MINS.ds||0)>4){MINS.ds=now;showMsg("⚠ DON'T SINK",1200);speak("don't sink");}
    if(AP.master&&AP.altMode&&air){const d=Math.abs(AP.altTarget-plane.pos.y*3.28084);
      if(d<1000&&d>250&&vs*(AP.altTarget-plane.pos.y*3.28084)>0&&!MINS.altAl){MINS.altAl=true;showMsg('ALTITUDE ALERT',1500);speak('altitude alert');}
      if(d<60&&MINS.altAl){MINS.altAl=false;MINS.cap=true;speak('altitude entering');}
      if(d>250&&MINS.cap){MINS.cap=false;showMsg('ALTITUDE DEVIATION',1500);speak('altitude deviation');}}
    if(MINS.apPrev&&!AP.master){speak('autopilot disconnect');}
    MINS.apPrev=AP.master;
  }catch(e){}});
  const sb=document.getElementById('startBtn');if(sb)sb.addEventListener('click',()=>{speak('startup');});
})();

window.addEventListener('keydown',e=>{if(e.code==='KeyM'&&!/INPUT|SELECT/.test((e.target||{}).tagName||'')){plane._ab=!plane._ab;showMsg('AUTOBRAKE '+(plane._ab?'ON (MED)':'OFF'));}});

/* ===== CRASH PHYSICS + FLIGHT REPLAY ===== */
(function(){
  const REC_HZ=20,REC_N=90*REC_HZ,REC_F=11;
  const rec={buf:new Float64Array(REC_N*REC_F),head:0,count:0,acc:0,clock:0};
  const off=k=>((((rec.head-rec.count+k)%REC_N)+REC_N)%REC_N)*REC_F;
  function recPush(){
    const i=rec.head*REC_F,b=rec.buf;
    b[i]=rec.clock;b[i+1]=plane.pos.x;b[i+2]=plane.pos.y;b[i+3]=plane.pos.z;
    b[i+4]=plane.quat.x;b[i+5]=plane.quat.y;b[i+6]=plane.quat.z;b[i+7]=plane.quat.w;
    b[i+8]=plane.gearPos||0;b[i+9]=plane.flaps||0;b[i+10]=plane.throttle||0;
    rec.head=(rec.head+1)%REC_N;rec.count=Math.min(REC_N,rec.count+1);
  }
  function recStep(dt){
    if(plane.crashed||plane.hold)return;
    rec.clock+=dt;rec.acc+=dt;
    if(rec.acc>=1/REC_HZ){rec.acc=0;recPush();}
  }
  const REPLAY_SPAN=60;
  const SPEEDS=[.1,.25,.5,1,2];
  const rp={on:false,t:0,t0:0,tEnd:0,speedIdx:3,fromCrash:false,live:null,debSaved:null,badgeT:0,
            camAngle:0,camTimer:0,camAutoSwitch:true,paused:false,crashT:-1};

  /* ── Replay UI ─────────────────────────────────────────────────── */
  const replayUI=document.createElement('div');
  replayUI.id='replayUI';
  replayUI.style.cssText='position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:300;display:none;background:rgba(6,14,28,.88);border:1.5px solid #1e4a7a;border-radius:14px;padding:10px 18px 8px;font-family:monospace;color:#9fd4ff;min-width:380px;max-width:90vw;backdrop-filter:blur(6px);box-shadow:0 8px 32px rgba(0,0,0,.7);user-select:none;';
  replayUI.innerHTML=`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
      <span id="rpCamLabel" style="font-size:11px;color:#4a9fdd;flex:1;letter-spacing:.05em">📷 FOLLOW</span>
      <span id="rpSpeedLabel" style="font-size:12px;color:#f0c040;font-weight:700">1.0×</span>
      <button id="rpPauseBtn" onclick="window._rpTogglePause&&window._rpTogglePause()" style="background:#0f2240;color:#7cf;border:1px solid #1e4a7a;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:12px;font-family:monospace">⏸</button>
      <button onclick="window._rpExit&&window._rpExit()" style="background:#0f2240;color:#f66;border:1px solid #4a1a1a;border-radius:6px;padding:3px 10px;cursor:pointer;font-size:12px;font-family:monospace">✕</button>
    </div>
    <div style="position:relative;height:8px;background:#0a1a2e;border-radius:4px;cursor:pointer;margin-bottom:8px" id="rpScrubBar">
      <div id="rpProgress" style="height:100%;background:linear-gradient(90deg,#1e6fff,#4af);border-radius:4px;width:0%;transition:none;pointer-events:none"></div>
      <div id="rpCrashMarker" style="position:absolute;top:-2px;width:3px;height:12px;background:#ff4040;border-radius:2px;display:none;pointer-events:none"></div>
    </div>
    <div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap">
      <button onclick="window._rpCam&&window._rpCam(0)" id="rpBtn0" style="background:#0f2240;color:#7cf;border:1px solid #1e4a7a;border-radius:6px;padding:4px 9px;cursor:pointer;font-size:11px;font-family:monospace">📷 Follow</button>
      <button onclick="window._rpCam&&window._rpCam(1)" id="rpBtn1" style="background:#0f2240;color:#7cf;border:1px solid #1e4a7a;border-radius:6px;padding:4px 9px;cursor:pointer;font-size:11px;font-family:monospace">🔄 Orbit</button>
      <button onclick="window._rpCam&&window._rpCam(2)" id="rpBtn2" style="background:#0f2240;color:#7cf;border:1px solid #1e4a7a;border-radius:6px;padding:4px 9px;cursor:pointer;font-size:11px;font-family:monospace">🏔 Ground</button>
      <button onclick="window._rpCam&&window._rpCam(3)" id="rpBtn3" style="background:#0f2240;color:#7cf;border:1px solid #1e4a7a;border-radius:6px;padding:4px 9px;cursor:pointer;font-size:11px;font-family:monospace">🎬 Dramatic</button>
      <button onclick="window._rpCam&&window._rpCam(4)" id="rpBtn4" style="background:#0f2240;color:#7cf;border:1px solid #1e4a7a;border-radius:6px;padding:4px 9px;cursor:pointer;font-size:11px;font-family:monospace">✈ Nose</button>
      <button onclick="window._rpCam&&window._rpCam(5)" id="rpBtn5" style="background:#0f2240;color:#7cf;border:1px solid #1e4a7a;border-radius:6px;padding:4px 9px;cursor:pointer;font-size:11px;font-family:monospace">🌀 Auto</button>
    </div>`;
  document.body.appendChild(replayUI);

  // Scrub bar click
  document.getElementById('rpScrubBar').addEventListener('click',e=>{
    if(!rp.on)return;
    const rect=e.currentTarget.getBoundingClientRect();
    const f=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
    rp.t=rp.t0+(rp.tEnd-rp.t0)*f;
  });

  const badge=document.createElement('div');
  badge.id='replayBadge';
  badge.style.cssText='position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:55;display:none;padding:6px 14px;border-radius:8px;background:rgba(10,20,35,.82);color:#9fd4ff;font:600 13px/1.2 system-ui,sans-serif;letter-spacing:.06em;pointer-events:none;border:1px solid rgba(159,212,255,.35)';
  document.body.appendChild(badge);
  const fmt=s=>{s=Math.max(0,s);return Math.floor(s/60)+':'+String(Math.floor(s%60)).padStart(2,'0');};

  /* Replay camera modes */
  const RP_CAM_NAMES=['📷 FOLLOW','🔄 ORBIT','🏔 GROUND','🎬 DRAMATIC','✈ NOSE','🌀 AUTO'];
  const _rpCamState={orbitAngle:0,groundPos:null,groundTimer:0,dramAngle:0,dramDist:0};

  function computeReplayCam(dt,pos,quat,vel){
    const wUp=BABYLON.Vector3.Up();
    const fwd=BABYLON.Vector3.TransformNormal(BABYLON.Vector3.Forward(),BABYLON.Matrix.FromQuaternionToRef(quat,BABYLON.Matrix.Identity()));
    const speed=vel?Math.hypot(vel.x,vel.y,vel.z)*1.944:0;

    // Auto-switch camera angles every 4-8s in auto mode
    if(rp.camAngle===5){
      rp.camTimer-=dt;
      if(rp.camTimer<=0){
        rp.camTimer=4+Math.random()*4;
        // Pick dramatic angles near crash
        const opts=[0,1,2,3,4];
        const next=opts[Math.floor(Math.random()*opts.length)];
        rp._autoCam=next;
        _rpCamState.groundPos=null; // reset ground cam
      }
      const ac=rp._autoCam||0;
      return computeReplayCamAngle(dt,ac,pos,quat,vel,fwd,wUp,speed);
    }
    return computeReplayCamAngle(dt,rp.camAngle,pos,quat,vel,fwd,wUp,speed);
  }

  function computeReplayCamAngle(dt,angle,pos,quat,vel,fwd,wUp,speed){
    const out={pos:new BABYLON.Vector3(),quat:BABYLON.Quaternion.Identity(),fov:.72,lerpRate:8};
    switch(angle){
      case 0:{ // Follow — chase behind and above
        const dist=40+speed*.04;
        out.pos.copyFrom(pos).subtractInPlace(fwd.scale(dist)).addInPlace(wUp.scale(14+(speed*.01)));
        out.quat=quatFromLookAt(out.pos,pos,wUp);out.fov=.75;out.lerpRate=7;break;
      }
      case 1:{ // Orbit — circles the plane
        _rpCamState.orbitAngle+=dt*.5;
        const r=55+speed*.06;
        out.pos.set(pos.x+Math.sin(_rpCamState.orbitAngle)*r,pos.y+18,pos.z+Math.cos(_rpCamState.orbitAngle)*r);
        out.quat=quatFromLookAt(out.pos,pos,wUp);out.fov=.7;out.lerpRate=5;break;
      }
      case 2:{ // Ground — static vantage like a bystander
        if(!_rpCamState.groundPos||_rpCamState.groundTimer<=0){
          const ang=Math.random()*Math.PI*2;
          const dist=120+Math.random()*200;
          const gp=new BABYLON.Vector3(pos.x+Math.sin(ang)*dist,0,pos.z+Math.cos(ang)*dist);
          gp.y=sampleSurface(gp.x,gp.z)+4+Math.random()*8;
          _rpCamState.groundPos=gp;_rpCamState.groundTimer=8+Math.random()*6;
        }
        _rpCamState.groundTimer-=dt;
        out.pos.copyFrom(_rpCamState.groundPos);
        out.quat=quatFromLookAt(out.pos,pos,wUp);
        const dd=BABYLON.Vector3.Distance(out.pos,pos);
        out.fov=Math.max(.08,Math.min(.9,600/dd));out.lerpRate=18;break;
      }
      case 3:{ // Dramatic — low angle, slow orbit, wide lens
        _rpCamState.dramAngle+=dt*.22;
        _rpCamState.dramDist=80+Math.sin(_rpCamState.dramAngle*.4)*40;
        const gh=sampleSurface(pos.x,pos.z);
        const camH=gh+5+Math.abs(Math.sin(_rpCamState.dramAngle*.3))*12;
        out.pos.set(
          pos.x+Math.sin(_rpCamState.dramAngle)*_rpCamState.dramDist,
          camH,
          pos.z+Math.cos(_rpCamState.dramAngle)*_rpCamState.dramDist
        );
        out.quat=quatFromLookAt(out.pos,new BABYLON.Vector3(pos.x,pos.y+4,pos.z),wUp);
        out.fov=1.05;out.lerpRate=4;break; // wide dramatic lens
      }
      case 4:{ // Nose — from front looking back at plane
        out.pos.copyFrom(pos).addInPlace(fwd.scale(30)).addInPlace(wUp.scale(3));
        out.quat=quatFromLookAt(out.pos,pos,wUp);out.fov=.85;out.lerpRate=14;break;
      }
    }
    return out;
  }

  function applyPose(t){
    const n=rec.count;if(n<2)return;const b=rec.buf;
    let lo=0,hi=n-1;
    while(hi-lo>1){const mid=(lo+hi)>>1;if(b[off(mid)]<=t)lo=mid;else hi=mid;}
    const a=off(lo),c=off(hi);
    const t0=b[a],t1=b[c];
    const f=t1>t0?Math.min(1,Math.max(0,(t-t0)/(t1-t0))):0;
    plane.pos.set(b[a+1]+(b[c+1]-b[a+1])*f,b[a+2]+(b[c+2]-b[a+2])*f,b[a+3]+(b[c+3]-b[a+3])*f);
    plane.quat.copyFrom(BABYLON.Quaternion.Slerp(new BABYLON.Quaternion(b[a+4],b[a+5],b[a+6],b[a+7]),new BABYLON.Quaternion(b[c+4],b[c+5],b[c+6],b[c+7]),f));
    // Interpolate velocity from position derivative for camera use
    const dx=b[c+1]-b[a+1],dy=b[c+2]-b[a+2],dz=b[c+3]-b[a+3];
    const dt2=Math.max(0.001,t1-t0);
    plane.vel.set(dx/dt2,dy/dt2,dz/dt2);
    plane.gearPos=b[a+8]+(b[c+8]-b[a+8])*f;
    plane.throttle=b[a+10]+(b[c+10]-b[a+10])*f;
    plane.flaps=f<.5?b[a+9]:b[c+9];
    aircraftRoot.position.copyFrom(plane.pos);
    aircraftRoot.rotationQuaternion=plane.quat;
  }
  function startReplay(fromCrash){
    if(rp.on)return;
    if(rec.count<4){showMsg('NO REPLAY DATA YET',1600);return;}
    rp.live={pos:plane.pos.clone(),quat:plane.quat.clone(),vel:plane.vel.clone(),angVel:plane.angVel.clone(),gearPos:plane.gearPos,flaps:plane.flaps,throttle:plane.throttle};
    rp.tEnd=rec.buf[off(rec.count-1)];
    rp.t0=Math.max(rec.buf[off(0)],rp.tEnd-REPLAY_SPAN);
    rp.t=rp.t0;rp.fromCrash=!!fromCrash;rp.on=true;rp.paused=false;
    rp.camAngle=fromCrash?3:0; // dramatic cam for crash replay
    rp.camTimer=5;rp._autoCam=3;
    rp.crashT=fromCrash?(window._crashRecTime||rp.tEnd):-1;
    // Start replay 8 seconds before crash so you see the approach
    if(fromCrash&&rp.crashT>0){rp.t=Math.max(rp.t0,rp.crashT-8);}
    rp.debSaved=debris.map(d=>d.m.isEnabled());
    debris.forEach(d=>d.m.setEnabled(false));
    document.getElementById('crashOverlay').classList.remove('show');
    replayUI.style.display='block';
    // Show crash marker on scrubber at correct position
    if(fromCrash&&rp.crashT>0){
      const cm=document.getElementById('rpCrashMarker');
      if(cm){
        const pct=Math.max(0,Math.min(99,((rp.crashT-rp.t0)/(rp.tEnd-rp.t0)*100)));
        cm.style.display='block';cm.style.left=pct.toFixed(1)+'%';
      }
    }
    updateRpUI();
    showMsg('REPLAY · DRAG SCRUBBER · PICK CAMERA',2200);
  }
  function stopReplay(){
    if(!rp.on)return;
    rp.on=false;rp.paused=false;
    replayUI.style.display='none';badge.style.display='none';
    const L=rp.live;
    plane.pos.copyFrom(L.pos);plane.quat.copyFrom(L.quat);plane.vel.copyFrom(L.vel);plane.angVel.copyFrom(L.angVel);
    plane.gearPos=L.gearPos;plane.flaps=L.flaps;plane.throttle=L.throttle;
    aircraftRoot.position.copyFrom(plane.pos);aircraftRoot.rotationQuaternion=plane.quat;
    debris.forEach((d,i)=>d.m.setEnabled(!!(rp.debSaved&&rp.debSaved[i])));
    if(rp.fromCrash&&plane.crashed)document.getElementById('crashOverlay').classList.add('show');
  }
  function updateRpUI(){
    // Speed label
    const sl=document.getElementById('rpSpeedLabel');
    if(sl)sl.textContent=SPEEDS[rp.speedIdx]+'×';
    // Pause button
    const pb=document.getElementById('rpPauseBtn');
    if(pb)pb.textContent=rp.paused?'▶':'⏸';
    // Cam label
    const cl=document.getElementById('rpCamLabel');
    if(cl)cl.textContent=RP_CAM_NAMES[rp.camAngle]||'📷';
    // Highlight active cam button
    for(let i=0;i<6;i++){
      const b=document.getElementById('rpBtn'+i);
      if(b)b.style.background=i===rp.camAngle?'#1a3a6a':'#0f2240';
    }
  }
  window._rpExit=stopReplay;
  window._rpTogglePause=()=>{rp.paused=!rp.paused;updateRpUI();};
  window._rpCam=(n)=>{rp.camAngle=n;_rpCamState.groundPos=null;updateRpUI();showMsg('CAM · '+RP_CAM_NAMES[n],1000);};

  function replayStep(dt){
    if(rp.paused)return;
    rp.t+=dt*SPEEDS[rp.speedIdx];
    if(rp.t>=rp.tEnd){
      // Auto-loop or stop
      stopReplay();showMsg('REPLAY END · F9 to rewatch',1800);return;
    }
    applyPose(rp.t);
    // Update scrubber
    const prog=document.getElementById('rpProgress');
    if(prog){const pct=((rp.t-rp.t0)/(rp.tEnd-rp.t0)*100).toFixed(1);prog.style.width=pct+'%';}
    // Update speed label occasionally
    rp.badgeT-=dt;
    if(rp.badgeT<=0){
      rp.badgeT=.2;
      const sl=document.getElementById('rpSpeedLabel');
      if(sl)sl.textContent=SPEEDS[rp.speedIdx]+'×';
    }
  }
  const DEB_N=52; // more debris pieces
  const debris=[];
  let debActive=false,debAge=0;
  function debPool(){
    if(debris.length)return;
    const mats=[M.body,M.dark,M.metal,M.accent];
    for(let i=0;i<DEB_N;i++){
      // More variety: wing sections (flat), fuselage tubes, small fragments, engine nacelles
      const kind=i%5;let m,r;
      if(kind===0){  // flat wing panel
        m=BABYLON.MeshBuilder.CreateBox('deb'+i,{width:6+Math.random()*5,height:.25+Math.random()*.3,depth:2+Math.random()*2},scene);r=.4;
      } else if(kind===1){ // fuselage tube
        m=BABYLON.MeshBuilder.CreateCylinder('deb'+i,{height:4+Math.random()*5,diameter:2+Math.random()*1.5,tessellation:10},scene);r=.8;
      } else if(kind===2){ // engine nacelle
        m=BABYLON.MeshBuilder.CreateCylinder('deb'+i,{height:3+Math.random()*2,diameter:2.5+Math.random(),tessellation:12},scene);r=.7;
      } else if(kind===3){ // small fragment
        m=BABYLON.MeshBuilder.CreateBox('deb'+i,{width:.4+Math.random()*1.2,height:.2+Math.random()*.4,depth:.4+Math.random()*1.2},scene);r=.15;
      } else { // door/panel
        m=BABYLON.MeshBuilder.CreateBox('deb'+i,{width:3+Math.random()*2,height:.18,depth:2+Math.random()*1.5},scene);r=.25;
      }
      m.material=mats[i%mats.length];m.isPickable=false;m.setEnabled(false);
      // Some pieces get a darker "burnt" material
      if(i%7===0&&M.dark){m.material=M.dark;}
      debris.push({m,r,v:new BABYLON.Vector3(),w:new BABYLON.Vector3(),rest:true,life:0,bounces:0,onFire:false,firePS:null});
    }
  }
  function debSpawn(p,v){
    debPool();debActive=true;debAge=0;
    const speed=v?Math.hypot(v.x,v.y,v.z):20;
    const scatter=Math.min(3.0, 0.8+speed/30);
    for(let i=0;i<debris.length;i++){
      const d=debris[i];
      d.m.setEnabled(true);
      // Spread pattern: heavy pieces land closer, light ones scatter far
      const heavy=(i%5===1||i%5===2); // tubes and nacelles are heavy
      const spread=heavy?0.5:1.0;
      d.m.position.set(
        p.x+(Math.random()-.5)*12*spread,
        p.y+1.5+Math.random()*(heavy?3:6),
        p.z+(Math.random()-.5)*12*spread
      );
      const a=Math.random()*Math.PI*2;
      const s=scatter*(heavy?(2+Math.random()*8):(5+Math.random()*20));
      // Inherit some of the impact velocity
      d.v.set(
        (v?v.x*.6:0)+Math.cos(a)*s,
        (v?Math.abs(v.y)*.3:5)+Math.random()*(heavy?6:14),
        (v?v.z*.6:0)+Math.sin(a)*s
      );
      d.w.set((Math.random()-.5)*(heavy?4:10),(Math.random()-.5)*(heavy?4:10),(Math.random()-.5)*(heavy?4:10));
      d.m.rotation.set(Math.random()*6.28,Math.random()*6.28,Math.random()*6.28);
      d.rest=false;d.life=0;d.bounces=0;
      // ~30% of pieces catch fire
      d.onFire=(Math.random()<0.30);
      if(d.onFire&&window._fireTex){
        try{
          if(d.firePS){d.firePS.stop();d.firePS=null;}
          const fp=new BABYLON.ParticleSystem('debFire'+i,60,scene);
          fp.particleTexture=window._fireTex;
          fp.emitter=d.m;
          fp.minEmitBox=new BABYLON.Vector3(-.5,0,-.5);fp.maxEmitBox=new BABYLON.Vector3(.5,.3,.5);
          fp.color1=new BABYLON.Color4(1,.8,.1,.9);fp.color2=new BABYLON.Color4(1,.3,.02,.6);fp.colorDead=new BABYLON.Color4(.3,.02,0,0);
          fp.minSize=.4;fp.maxSize=1.5;fp.minLifeTime=.3;fp.maxLifeTime=.8;
          fp.emitRate=30;fp.direction1=new BABYLON.Vector3(-.5,1,-.5);fp.direction2=new BABYLON.Vector3(.5,3,.5);
          fp.minEmitPower=.5;fp.maxEmitPower=1.5;fp.gravity=new BABYLON.Vector3(0,.2,0);
          fp.updateSpeed=.018;fp.start();
          d.firePS=fp;
        }catch(e){d.onFire=false;}
      }
    }
  }
  function debStep(dt){
    if(!debActive)return;
    if(rp.on)return;
    debAge+=dt;
    const drag=Math.exp(-.32*dt),vdrag=Math.exp(-.04*dt);
    let live=false;
    for(const d of debris){
      if(!d.m.isEnabled())continue;
      d.life+=dt;
      if(d.rest){
        if(d.life>60){
          d.m.setEnabled(false);
          if(d.firePS){try{d.firePS.stop();}catch(e){}d.firePS=null;}
        } else live=true;
        continue;
      }
      live=true;
      d.v.y-=9.81*dt;
      d.v.x*=drag;d.v.z*=drag;d.v.y*=vdrag;
      d.m.position.x+=d.v.x*dt;d.m.position.y+=d.v.y*dt;d.m.position.z+=d.v.z*dt;
      d.m.rotation.x+=d.w.x*dt;d.m.rotation.y+=d.w.y*dt;d.m.rotation.z+=d.w.z*dt;
      const ground=sampleSurface(d.m.position.x,d.m.position.z)+d.r;
      if(d.m.position.y<ground){
        d.m.position.y=ground;
        if(d.v.y<-1.8){
          const bounce=Math.max(0.08, 0.30-d.bounces*0.06);
          d.v.y=-d.v.y*bounce;
          d.bounces++;
          d.v.x*=.55;d.v.z*=.55;d.w.scaleInPlace(.50);
          // Spawn small spark puff on impact
          if(d.bounces===1&&window._smokeTex){
            try{
              const sp=new BABYLON.ParticleSystem('debSpark'+Math.random().toString(36).slice(2,5),40,scene);
              sp.particleTexture=window._smokeTex;sp.emitter=d.m.position.clone();
              sp.color1=new BABYLON.Color4(.7,.6,.4,.8);sp.color2=new BABYLON.Color4(.5,.4,.3,.5);sp.colorDead=new BABYLON.Color4(.3,.3,.3,0);
              sp.minSize=1;sp.maxSize=3;sp.minLifeTime=.5;sp.maxLifeTime=1.5;
              sp.emitRate=0;sp.manualEmitCount=20;
              sp.direction1=new BABYLON.Vector3(-3,2,-3);sp.direction2=new BABYLON.Vector3(3,5,3);
              sp.minEmitPower=1;sp.maxEmitPower=4;sp.gravity=new BABYLON.Vector3(0,-2,0);
              sp.updateSpeed=.018;sp.targetStopDuration=.1;sp.disposeOnStop=true;sp.start();
            }catch(e){}
          }
        }else{
          d.v.y=0;
          const fr=Math.exp(-5*dt);d.v.x*=fr;d.v.z*=fr;d.w.scaleInPlace(Math.exp(-4*dt));
          if(Math.hypot(d.v.x,d.v.z)<.3&&d.bounces>0){
            d.rest=true;d.v.set(0,0,0);d.w.set(0,0,0);
            // Extinguish fire after resting (fuel burnt out after 20s)
            if(d.onFire&&d.life>20&&d.firePS){try{d.firePS.stop();}catch(e){}d.firePS=null;d.onFire=false;}
          }
        }
      }
    }
    if(!live)debActive=false;
  }
  function makeCrashPS(name,cap,pos,opts){
    try{
      const ps=new BABYLON.ParticleSystem(name,cap,scene);
      ps.particleTexture=window._smokeTex||window._fireTex||null;
      ps.emitter=pos.clone?pos.clone():new BABYLON.Vector3(pos.x,pos.y,pos.z);
      Object.assign(ps,opts);
      ps.disposeOnStop=true;ps.start();
      return ps;
    }catch(e){return null;}
  }

  function impactFx(p,v,opts){
    const isInv=opts&&opts.inverted;
    const isGearCol=opts&&opts.gearCollapse;
    const speed=v?Math.hypot(v.x,v.y,v.z)*1.944:180;
    const fireScale=Math.min(2.5, 0.8 + speed/120);
    const smokeScale=Math.min(3.0, 1.0 + speed/90);
    try{
      /* ---- Initial fireball burst ---- */
      const fburst=new BABYLON.ParticleSystem('crashFireball',1200,scene);
      fburst.particleTexture=window._fireTex||window._smokeTex||null;
      fburst.emitter=p.clone();
      fburst.minEmitBox=new BABYLON.Vector3(-5,0,-5);fburst.maxEmitBox=new BABYLON.Vector3(5,2,5);
      fburst.color1=new BABYLON.Color4(1,.95,.5,1);fburst.color2=new BABYLON.Color4(1,.4,.05,.9);fburst.colorDead=new BABYLON.Color4(.8,.1,0,0);
      fburst.minSize=6*fireScale;fburst.maxSize=18*fireScale;fburst.minLifeTime=.4;fburst.maxLifeTime=1.2;
      fburst.emitRate=0;fburst.manualEmitCount=Math.round(600*fireScale);
      fburst.direction1=new BABYLON.Vector3(-20,8,-20);fburst.direction2=new BABYLON.Vector3(20,35,20);
      fburst.minEmitPower=4;fburst.maxEmitPower=18;fburst.gravity=new BABYLON.Vector3(0,-1.5,0);
      fburst.updateSpeed=.018;fburst.targetStopDuration=.15;fburst.disposeOnStop=true;fburst.start();

      /* ---- Sustained fuel fire (wings spread) ---- */
      const offsets=isGearCol?[{x:0,z:0}]:[{x:-12,z:-4},{x:12,z:-4},{x:0,z:0},{x:-6,z:8},{x:6,z:8}];
      offsets.forEach((off,i)=>{
        const fpos=new BABYLON.Vector3(p.x+off.x,p.y+0.5,p.z+off.z);
        const ffire=new BABYLON.ParticleSystem('crashFire'+i,500,scene);
        ffire.particleTexture=window._fireTex||window._smokeTex||null;
        ffire.emitter=fpos;
        ffire.minEmitBox=new BABYLON.Vector3(-2,0,-2);ffire.maxEmitBox=new BABYLON.Vector3(2,0.5,2);
        ffire.color1=new BABYLON.Color4(1,.8,.1,.95);ffire.color2=new BABYLON.Color4(1,.3,.02,.8);ffire.colorDead=new BABYLON.Color4(.5,.05,0,0);
        ffire.minSize=(3+i*0.5)*fireScale;ffire.maxSize=(8+i)*fireScale;
        ffire.minLifeTime=.5+i*.1;ffire.maxLifeTime=1.4+i*.15;
        ffire.emitRate=Math.round((120-i*8)*fireScale);
        ffire.direction1=new BABYLON.Vector3(-1,4,-1);ffire.direction2=new BABYLON.Vector3(1,9,1);
        ffire.minEmitPower=1+i*.2;ffire.maxEmitPower=4+i*.3;
        ffire.gravity=new BABYLON.Vector3(0,0.5,0);
        ffire.updateSpeed=.018;ffire.targetStopDuration=isInv?8:22;ffire.disposeOnStop=true;
        setTimeout(()=>{try{ffire.start();}catch(e){}},i*120);
      });

      /* ---- Black smoke column (rises high) ---- */
      const smk=new BABYLON.ParticleSystem('crashSmoke',900,scene);
      smk.particleTexture=window._smokeTex||null;
      smk.emitter=new BABYLON.Vector3(p.x,p.y+2,p.z);
      smk.minEmitBox=new BABYLON.Vector3(-6,0,-6);smk.maxEmitBox=new BABYLON.Vector3(6,1,6);
      smk.color1=new BABYLON.Color4(.06,.05,.04,.9);smk.color2=new BABYLON.Color4(.15,.13,.11,.7);smk.colorDead=new BABYLON.Color4(.35,.33,.3,0);
      smk.minSize=8*smokeScale;smk.maxSize=22*smokeScale;smk.minLifeTime=12;smk.maxLifeTime=22;
      smk.emitRate=Math.round(70*smokeScale);
      smk.direction1=new BABYLON.Vector3(-2,6,-2);smk.direction2=new BABYLON.Vector3(2,10,2);
      smk.minEmitPower=2;smk.maxEmitPower=6;smk.gravity=new BABYLON.Vector3(0,1.2,0);
      smk.updateSpeed=.018;smk.targetStopDuration=40;smk.disposeOnStop=true;smk.start();

      /* ---- White steam / hydraulic fluid ---- */
      const steam=new BABYLON.ParticleSystem('crashSteam',400,scene);
      steam.particleTexture=window._smokeTex||null;
      steam.emitter=p.clone();
      steam.minEmitBox=new BABYLON.Vector3(-3,0,-3);steam.maxEmitBox=new BABYLON.Vector3(3,1,3);
      steam.color1=new BABYLON.Color4(.95,.95,.95,.7);steam.color2=new BABYLON.Color4(.8,.85,.9,.5);steam.colorDead=new BABYLON.Color4(.9,.9,.9,0);
      steam.minSize=3;steam.maxSize=9;steam.minLifeTime=1.5;steam.maxLifeTime=3.5;
      steam.emitRate=0;steam.manualEmitCount=300;
      steam.direction1=new BABYLON.Vector3(-8,3,-8);steam.direction2=new BABYLON.Vector3(8,14,8);
      steam.minEmitPower=2;steam.maxEmitPower=9;steam.gravity=new BABYLON.Vector3(0,.3,0);
      steam.updateSpeed=.018;steam.targetStopDuration=.2;steam.disposeOnStop=true;steam.start();

      /* ---- Ground debris/dust burst ---- */
      const dust=new BABYLON.ParticleSystem('crashDust',1000,scene);
      dust.particleTexture=window._smokeTex||null;
      dust.emitter=new BABYLON.Vector3(p.x,p.y+0.2,p.z);
      dust.minEmitBox=new BABYLON.Vector3(-10,0,-10);dust.maxEmitBox=new BABYLON.Vector3(10,0.5,10);
      dust.color1=new BABYLON.Color4(.6,.52,.4,.95);dust.color2=new BABYLON.Color4(.45,.38,.3,.7);dust.colorDead=new BABYLON.Color4(.35,.3,.25,0);
      dust.minSize=5;dust.maxSize=16;dust.minLifeTime=3;dust.maxLifeTime=7;
      dust.emitRate=0;dust.manualEmitCount=800;
      dust.direction1=new BABYLON.Vector3(-22,2,-22);dust.direction2=new BABYLON.Vector3(22,14,22);
      dust.minEmitPower=3;dust.maxEmitPower=14;dust.gravity=new BABYLON.Vector3(0,-3,0);
      dust.updateSpeed=.018;dust.targetStopDuration=.2;dust.disposeOnStop=true;dust.start();

      /* ---- Bright ember/spark shower ---- */
      const embers=new BABYLON.ParticleSystem('crashEmbers',600,scene);
      embers.particleTexture=window._smokeTex||null;
      embers.emitter=p.clone();
      embers.color1=new BABYLON.Color4(1,.95,.5,1);embers.color2=new BABYLON.Color4(1,.5,.1,.9);embers.colorDead=new BABYLON.Color4(.4,.04,0,0);
      embers.minSize=0.3;embers.maxSize=1.2;embers.minLifeTime=1.2;embers.maxLifeTime=3.5;
      embers.emitRate=0;embers.manualEmitCount=400;
      embers.direction1=new BABYLON.Vector3(-25,10,-25);embers.direction2=new BABYLON.Vector3(25,40,25);
      embers.minEmitPower=6;embers.maxEmitPower=24;embers.gravity=new BABYLON.Vector3(0,-9.8,0);
      embers.updateSpeed=.018;embers.targetStopDuration=.15;embers.disposeOnStop=true;embers.start();

      /* ---- Secondary explosions (fuel ignition, staged) ---- */
      if(!isGearCol){
        [1400,3200,6500].forEach((delay,i)=>{
          setTimeout(()=>{
            if(!plane.crashed)return;
            const ep=new BABYLON.Vector3(p.x+(Math.random()-.5)*20,p.y,p.z+(Math.random()-.5)*20);
            const ef=new BABYLON.ParticleSystem('secExp'+i,400,scene);
            ef.particleTexture=window._fireTex||window._smokeTex||null;
            ef.emitter=ep;
            ef.color1=new BABYLON.Color4(1,.9,.2,1);ef.color2=new BABYLON.Color4(1,.35,.05,.8);ef.colorDead=new BABYLON.Color4(.6,.05,0,0);
            ef.minSize=5+i*2;ef.maxSize=15+i*4;ef.minLifeTime=.3;ef.maxLifeTime=.9;
            ef.emitRate=0;ef.manualEmitCount=200+i*80;
            ef.direction1=new BABYLON.Vector3(-10,6,-10);ef.direction2=new BABYLON.Vector3(10,24,10);
            ef.minEmitPower=3;ef.maxEmitPower=12;ef.gravity=new BABYLON.Vector3(0,-1,0);
            ef.updateSpeed=.018;ef.targetStopDuration=.12;ef.disposeOnStop=true;
            try{ef.start();}catch(e){}
            // screen flash
            if(typeof wxFlash!=='undefined'){wxFlash.style.opacity='.45';setTimeout(()=>{wxFlash.style.opacity='0';},80);}
          },delay);
        });
      }

      /* ---- Point light for fire glow ---- */
      try{
        const fl=new BABYLON.PointLight('crashFireLight',new BABYLON.Vector3(p.x,p.y+3,p.z),scene);
        fl.diffuse=new BABYLON.Color3(1,.45,.1);fl.intensity=180;fl.range=60;
        // Flicker
        let _ft=0;
        const _fi=scene.onBeforeRenderObservable.add(()=>{
          _ft+=scene.getEngine().getDeltaTime()*.001;
          fl.intensity=120+Math.sin(_ft*9)*(30+Math.random()*40);
          if(_ft>25){scene.onBeforeRenderObservable.remove(_fi);fl.dispose();}
        });
      }catch(e){}

    }catch(e){console.error('impact fx',e);}
    debSpawn(p,v);
  }

  // Belly / no-gear landing fire (continuous, not just on crash)
  window._bellyFireActive=false;
  window._bellyFireSystems=[];
  function startBellyFire(p){
    if(window._bellyFireActive)return;
    window._bellyFireActive=true;
    const fpos=new BABYLON.Vector3(p.x,p.y+0.3,p.z);
    const bf=new BABYLON.ParticleSystem('bellyFire',300,scene);
    bf.particleTexture=window._fireTex||window._smokeTex||null;
    bf.emitter=fpos;
    bf.minEmitBox=new BABYLON.Vector3(-8,0,-4);bf.maxEmitBox=new BABYLON.Vector3(8,0.2,4);
    bf.color1=new BABYLON.Color4(1,.8,.1,.9);bf.color2=new BABYLON.Color4(1,.3,.02,.7);bf.colorDead=new BABYLON.Color4(.4,.04,0,0);
    bf.minSize=1.5;bf.maxSize=4;bf.minLifeTime=.3;bf.maxLifeTime=.9;
    bf.emitRate=180;bf.direction1=new BABYLON.Vector3(-1,1,-1);bf.direction2=new BABYLON.Vector3(1,4,1);
    bf.minEmitPower=1;bf.maxEmitPower=3;bf.gravity=new BABYLON.Vector3(0,.2,0);
    bf.updateSpeed=.018;bf.start();
    const bs=new BABYLON.ParticleSystem('bellySmoke',200,scene);
    bs.particleTexture=window._smokeTex||null;
    bs.emitter=fpos;
    bs.minEmitBox=new BABYLON.Vector3(-8,0,-4);bs.maxEmitBox=new BABYLON.Vector3(8,0.5,4);
    bs.color1=new BABYLON.Color4(.1,.09,.08,.7);bs.color2=new BABYLON.Color4(.2,.18,.16,.5);bs.colorDead=new BABYLON.Color4(.3,.3,.3,0);
    bs.minSize=4;bs.maxSize=10;bs.minLifeTime=3;bs.maxLifeTime=6;
    bs.emitRate=30;bs.direction1=new BABYLON.Vector3(-1,3,-1);bs.direction2=new BABYLON.Vector3(1,7,1);
    bs.minEmitPower=1;bs.maxEmitPower=3;bs.gravity=new BABYLON.Vector3(0,.5,0);
    bs.updateSpeed=.018;bs.start();
    window._bellyFireSystems=[bf,bs];
    // Track belly fire position to aircraft
    const _bfObs=scene.onBeforeRenderObservable.add(()=>{
      if(!plane.bellyLanding||plane.crashed){
        bf.stop();bs.stop();
        window._bellyFireActive=false;
        scene.onBeforeRenderObservable.remove(_bfObs);
        return;
      }
      fpos.set(plane.pos.x,plane.pos.y+0.3,plane.pos.z);
    });
  }
  window._startBellyFire=startBellyFire;
  window._crashFx=(p,v,opts)=>impactFx(p,v,opts);
  window._debStep=debStep;
  window._recStep=recStep;
  window._recPush=recPush;
  window._replayOn=()=>rp.on;
  window._replayStep=replayStep;
  window._recReset=()=>{rec.count=0;rec.head=0;rec.acc=0;};
  window._crashReset=()=>{if(rp.on)stopReplay();debris.forEach(d=>d.m.setEnabled(false));debActive=false;rp.fromCrash=false;};
  window._startReplay=startReplay;
  window.addEventListener('keydown',e=>{
    if(/INPUT|SELECT|TEXTAREA/.test((e.target||{}).tagName||''))return;
    if(e.code==='F9'){e.preventDefault();if(rp.on)stopReplay();else startReplay(plane.crashed);}
    if(e.code==='F10'){e.preventDefault();if(rp.on){rp.speedIdx=(rp.speedIdx+1)%SPEEDS.length;updateRpUI();showMsg('REPLAY SPEED '+SPEEDS[rp.speedIdx]+'x',1000);}}
    if(e.code==='Space'&&rp.on){e.preventDefault();rp.paused=!rp.paused;updateRpUI();}
    if(e.code==='ArrowLeft'&&rp.on){e.preventDefault();rp.t=Math.max(rp.t0,rp.t-3);applyPose(rp.t);}
    if(e.code==='ArrowRight'&&rp.on){e.preventDefault();rp.t=Math.min(rp.tEnd,rp.t+3);applyPose(rp.t);}
    if(e.code==='KeyQ'&&rp.on){e.preventDefault();rp.camAngle=(rp.camAngle+1)%6;_rpCamState.groundPos=null;updateRpUI();}
  });
  const rb=document.getElementById('replayBtn');
  if(rb)rb.addEventListener('click',()=>startReplay(true));
})();

status('render loop');
let lastTime=performance.now();
let terrainCheckTimer=0,fpsAcc=0,hwScale=1/Math.min(window.devicePixelRatio||1,1.5);

scene.registerBeforeRender(()=>{
  const now=performance.now();
  let dt=(now-lastTime)/1000;lastTime=now;if(dt>.1)dt=.1;
  // Expose key sim state for external features (rain, logbook, etc.)
  window._simCurrentWeather=currentWeather;
  window._simCamMode=camMode;
  // Allow external code to patch weather
  if(window._pendingWxPatch){currentWeather=Object.assign({},currentWeather,window._pendingWxPatch);window._pendingWxPatch=null;}

  if(window._replayOn&&window._replayOn()){window._replayStep(dt);}
  else{readInput(dt);physicsStep(dt);window._recStep(dt);}
  window._debStep(dt);
  updateFaults(dt);
  updateFireAndSmoke(dt);
  updateTraffic(dt);
  updateCamera(dt);

  if(rainPS&&rainPS.isStarted()){rainPS.emitter.copyFrom(camera.position);}
  if(snowPS&&snowPS.isStarted()){snowPS.emitter.copyFrom(camera.position);}

  terrainCheckTimer-=dt;
  if(terrainCheckTimer<=0&&!plane.crashed){
    terrainCheckTimer=.5;
    {const on=(plane.pos.y-sampleTerrain(plane.pos.x,plane.pos.z))<1100;if(on!==cityOn){cityOn=on;bMeshes.forEach(m=>m.setEnabled(on&&!!m._has));cityMeshes.forEach(m=>m.setEnabled(on&&!!m._has));}}
    const dx=plane.pos.x-terrainCenter.x,dz=plane.pos.z-terrainCenter.z;
    if(dx*dx+dz*dz>CFG.rebuildDist*CFG.rebuildDist)rebuildTerrainAsync(plane.pos.x,plane.pos.z);
  }
  fpsAcc+=dt;if(fpsAcc>2.5){fpsAcc=0;const f=engine.getFps();
    if(f>58&&hwScale>1/Math.min(window.devicePixelRatio||1,1.5)+.01){hwScale=Math.max(1,hwScale-.15);engine.setHardwareScalingLevel(hwScale);}}
  hudTick+=dt;
  if(hudTick>.05){hudTick=0;updateHUD();updateChips();updateFaultHUD();}
  if(msgTimer>0){msgTimer-=dt;if(msgTimer<=0)el.msg.style.opacity=0;}

  cloudRoot.position.x=Math.round(plane.pos.x/20000)*20000;
  cloudRoot.position.z=Math.round(plane.pos.z/20000)*20000;
  if(waterMesh){waterMesh.position.x=Math.round(plane.pos.x/5000)*5000;
    waterMesh.position.z=Math.round(plane.pos.z/5000)*5000;}
  camera.minZ=camMode===1?.3:Math.min(25,Math.max(1.2,plane.pos.y/250));camera.maxZ=camMode===1?250000:300000;
});

engine.runRenderLoop(()=>scene.render());
window.addEventListener('resize',()=>engine.resize());

const overlay=document.getElementById('overlay');
const startBtn=document.getElementById('startBtn');
const keyInput=document.getElementById('keyInput');
const locSel=document.getElementById('locSelect');
const respawnBtn=document.getElementById('respawnBtn');
const wxSel=document.getElementById('wxSelect');
const customRow=document.getElementById('customRow');
const customLat=document.getElementById('customLat');
const customLon=document.getElementById('customLon');
const customCode=document.getElementById('customCode');

keyInput.value=localStorage.getItem('gmapsKey')||'';
locSel.addEventListener('change',()=>{ if(locSel.value==='CUSTOM'){customRow.style.display='block';}else{customRow.style.display='none';} });
wxSel.addEventListener('change',()=>{ currentWeather=WEATHER[wxSel.value]||WEATHER.clear; applyEnvironment(); applyWeatherVisuals(); updateChips(); });

document.getElementById('faultToggleBtn').addEventListener('click',()=>{document.getElementById('faultButtons').classList.toggle('show');});
document.querySelectorAll('.faultBtn[data-inject]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    const f=btn.dataset.inject;
    if(f==='ENG_FIRE_L')triggerFire('L');
    else if(f==='ENG_FIRE_R')triggerFire('R');
    else if(faults.has(f)){faults.clear(f);showMsg('CLEARED · '+((FAULTS[f]&&FAULTS[f].label)||f),1500);}
    else faults.inject(f);
  });
});
document.querySelector('.faultBtn[data-clear="all"]').addEventListener('click',()=>{
  faults.clearAll();
  ENG.fireWarning.L=false;ENG.fireWarning.R=false;
  fireTimers.L=0;fireTimers.R=0;
  showMsg('ALL FAULTS CLEARED',2000);
});
document.getElementById('imgToggle').addEventListener('click',()=>{
  useCanadaImagery=!useCanadaImagery;
  const btn=document.getElementById('imgToggle');
  btn.textContent=useCanadaImagery?'🍁 CANADA · SGIC':'🌍 GLOBAL · ESRI';
  btn.classList.toggle('imgOn',useCanadaImagery);
  showMsg(useCanadaImagery?'IMAGERY · CANADA SGIC (SASK)':'IMAGERY · ESRI GLOBAL',2500);
  if(typeof terrainCenter!=='undefined'&&typeof rebuildTerrainAsync==='function'){
    const cx=terrainCenter.x||0, cz=terrainCenter.z||0;
    terrainCenter={x:-999999,z:-999999};
    rebuildTerrainAsync(cx,cz);
  }
});

try{Object.defineProperty(window,'__sim',{configurable:true,get:()=>({scene,engine,camera,plane,AP,BABYLON,KS_RWY,KS_TERM})});}catch(e){}
setupFireAndSmoke();

createRunway(currentLocation.code);
resetAircraft(currentLocation.lat,currentLocation.lon,currentLocation.elev);
createWater();createClouds();
applyWeatherVisuals();
updateSurfaceVisuals(1/60);updateChips();
setCamMode(0);
status('ready');
startBtn.addEventListener('click',async()=>{
  startBtn.disabled=true;window._userStarted=true;overlay.classList.add('hidden');
  let lat,lon,elev,code;
  if(locSel.value==='CUSTOM'){
    lat=parseFloat(customLat.value);
    lon=parseFloat(customLon.value);
    if(!isFinite(lat)||!isFinite(lon)){
      alert('Please enter valid latitude and longitude.');
      startBtn.disabled=false;overlay.classList.remove('hidden');return;
    }
    code=(customCode.value||'').trim().toUpperCase()||'CUSTOM';
    if(!RUNWAYS[code]){
      let bestKey=null,bestDist=1e12;
      for(const k in LOCS){const L=LOCS[k];const d=(L.lat-lat)**2+(L.lon-lon)**2;if(d<bestDist){bestDist=d;bestKey=k;}}
      if(bestDist<0.25){const h=RUNWAYS[bestKey]?RUNWAYS[bestKey].hdg:0;RUNWAYS[code]={hdg:h||90,len:3000,wid:60};}
      else{RUNWAYS[code]={hdg:90,len:3000,wid:60};}
    }
    elev=0;
  } else {
    const val=locSel.value;
    const [latS,lonS,elevS,codeS]=val.split(',');
    lat=parseFloat(latS);lon=parseFloat(lonS);elev=parseFloat(elevS);code=codeS;
  }
  
  setTOD(document.getElementById('todSelect').value);
  applyLivery(+liverySel.value);
  currentWeather=WEATHER[wxSel.value]||WEATHER.clear;
  /* Apply turbulence intensity override from selector */
  {const ts=document.getElementById('turbSel');
   if(ts){const tv=parseInt(ts.value)||1;
     const turbMap=[0,0.5,1.5,3.5];
     currentWeather=Object.assign({},currentWeather,{turb:turbMap[tv]||0});
   }}
  applyEnvironment();
  applyWeatherVisuals();
  currentLocation={lat,lon,elev,code,start:document.getElementById('startSel').value};
  createRunway(currentLocation.code);
  resetAircraft(currentLocation.lat,currentLocation.lon,currentLocation.elev);
  terrainCenter={x:0,z:0};plane.hold=true;

  // --- RESOLUTION SETTINGS ---
  const RES_SETTINGS = {
    low:   { tex: 1024, tiles: 48,   zoom: 16 },
    med:   { tex: 2048, tiles: 96,   zoom: 17 },
    high:  { tex: 4096, tiles: 600,  zoom: 18 },  // was 144
    ultra: { tex: 4096, tiles: 1000, zoom: 19 }   // was 288
};
  const resSelect = document.getElementById('resSelect');
  const resVal = resSelect ? resSelect.value : 'med';
  const r = RES_SETTINGS[resVal] || RES_SETTINGS.med;
  
  CFG.texSize = r.tex;
  CFG.maxImageryTiles = r.tiles;
  Imagery.maxZoom = r.zoom;

  if(terrainTex.getSize().width !== CFG.texSize) {
      terrainTex.dispose();
      terrainTex = new BABYLON.DynamicTexture('terrainTex', {width: CFG.texSize, height: CFG.texSize}, scene, true);
      terrainTex.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
      terrainTex.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
      terrainTex.anisotropicFilteringLevel = 16;
      terrainMat.albedoTexture = terrainTex;
  }
  // ---------------------------
  
  lsCreate();
  const key=keyInput.value.trim();
  if(key)localStorage.setItem('gmapsKey',key);else localStorage.removeItem('gmapsKey');
  
  try{
    loadEl.textContent='Authenticating imagery…';
    await Imagery.init(key);
    el.src.textContent=Imagery.mode==='google'?'GOOGLE':'ESRI';
  }catch(e){}
  
  try{
    loadEl.textContent='Loading elevation…';
    await withTimeout(ensureHeightTiles(0,0),20000,'h');
    rebuildGeom(0,0);
  }catch(e){
    rebuildGeom(0,0);
  }
  
  loadEl.textContent='Streaming satellite imagery…';
  buildTerrainTexture(0,0,true).then(function(drawn){
    if(drawn===0)showMsg('IMAGERY UNAVAILABLE',5000);else fallback.setEnabled(false);
  }).catch(function(e){console.warn('img',e);});
  // Wait for ~60% of the imagery (or 15s), then let the player fly while the rest streams in
  await imgGate(0.6,15000);
  createRunway(currentLocation.code);
  resetAircraft(currentLocation.lat,currentLocation.lon,currentLocation.elev);
  plane.hold=false;loadEl.textContent='Ready';status('flying');
  lsProgress(1,'Ready');
  lsHide();
  setTimeout(function(){ if(typeof showMsg==='function') showMsg('READY · FLY SAFE',6000); },500);
  // Re-enable start button so player can fly again without reloading
  startBtn.disabled=false;
});
respawnBtn.addEventListener('click',respawn);
// Always keep start button enabled after respawn too
function respawn(){
  _respawnBase();
  try{startBtn.disabled=false;}catch(e){}
}
  /* ================================================================== */
/* ===== TYCOON / CAREER GAMIFICATION LAYER (self-contained) ======== */
/* ================================================================== */
/* ================================================================== */
/* ===== CAREER / MISSIONS / LESSONS (v2) ============================ */
/* ================================================================== */
/* ================================================================== */
/* ===== CAREER v3 · FLEET PROGRESSION + MODELS ===================== */
/* ================================================================== */
/* ================================================================== */
/* ===== CAREER v4 · FLEET + SMOOTH MODELS + VISIBILITY LOCK ======== */
/* ================================================================== */

(function initCareer(){
  const SAVE='bf737_career_v4';

  const DEF={
    money:8000, xp:0, level:1,
    upgrades:{fleet:0, engines:0, comfort:0, safety:0},
    lessonsCompleted:{},
    redeemedCodes:{},
    stats:{flights:0,crashes:0,bestLandingFpm:9999,totalEarned:0,perfectLandings:0,faultsHandled:0,lessonsDone:0}
  };
  let C=(()=>{try{const s=JSON.parse(localStorage.getItem(SAVE)||'null');
    if(s&&typeof s==='object') return Object.assign({},DEF,s,{
      stats:Object.assign({},DEF.stats,s.stats||{}),
      upgrades:Object.assign({},DEF.upgrades,s.upgrades||{}),
      lessonsCompleted:Object.assign({},s.lessonsCompleted||{}),
      redeemedCodes:Object.assign({},s.redeemedCodes||{})});
  }catch(e){} return JSON.parse(JSON.stringify(DEF));})();
  const save=()=>{try{localStorage.setItem(SAVE,JSON.stringify(C));}catch(e){}};
  if(!C.fleetV){const old=['cessna','atr','e190','b737','b787'];const nw=['cessna','atr','e190','dc9','b737','dc10','b787','a350'];
    const k=nw.indexOf(old[C.upgrades.fleet]);C.upgrades.fleet=k>=0?k:0;C.fleetV=2;save();}
  if(C.fleetV===2){const o=['cessna','atr','e190','dc9','b737','dc10','b787','a350'],n=['cessna','dc3','atr','e190','dc9','b737','dc8','f18','dc10','b787','a350','b747'];
    const mp=i=>{const k=n.indexOf(o[i]);return k>=0?k:0;};
    const mf=C.maxFleet==null?C.upgrades.fleet:C.maxFleet;C.upgrades.fleet=mp(C.upgrades.fleet);C.maxFleet=mp(mf);C.fleetV=3;save();}
  if(C.fleetV===3){const o=['cessna','wonderful','dc3','atr','e190','dc9','b737','dc8','f18','dc10','l1011','b787','a350','b747','a380'],
      n=['cessna','wonderful','dc3','atr','dhc8','crj9','e190','dc9','md83','b737','dc8','f18','dc10','l1011','b787','a350','b747','a380'];
    const mp=i=>{const k=n.indexOf(o[i]);return k>=0?k:0;};
    const mf=C.maxFleet==null?C.upgrades.fleet:C.maxFleet;C.upgrades.fleet=mp(C.upgrades.fleet);C.maxFleet=mp(mf);C.fleetV=4;save();}
  if(C.fleetV===4){const o=['cessna','wonderful','dc3','atr','dhc8','crj9','e190','dc9','md83','b737','dc8','f18','dc10','l1011','b787','a350','b747','a380'],
      n=['cessna','wonderful','dc3','atr','dhc8','crj9','e190','dc9','md83','a320','b737','dc8','f18','dc10','l1011','b787','a350','b777','b747','a380','concorde'];
    const mp=i=>{const k=n.indexOf(o[i]);return k>=0?k:0;};
    const mf=C.maxFleet==null?C.upgrades.fleet:C.maxFleet;C.upgrades.fleet=mp(C.upgrades.fleet);C.maxFleet=mp(mf);C.fleetV=5;save();}
  if(C.maxFleet==null||C.maxFleet<C.upgrades.fleet){C.maxFleet=C.upgrades.fleet;save();}

const FLEET = [
  { id:'cessna', name:'Cessna 172', tag:'GA trainer', pax:3, fare:120, cruise:120, cost:0, model:'cessna', camScale:0.35,
    physics:{mass:4000, wingArea:16, thrust:12000, CLmax:1.7, gearHeight:4.25}, fixedGear:true, hasCockpit:true },
  { id:'cirrus', name:'Cirrus SR22', tag:'Glass-cockpit GA · G1000', pax:3, fare:150, cruise:183, cost:900, model:'cirrus', camScale:0.36,
    physics:{mass:4000, wingArea:13.5, thrust:13500, CLmax:1.6, gearHeight:4.25}, fixedGear:true, hasCockpit:true },
  { id:'wonderful', name:'The Wonderful Plane', tag:'It says wonderful', pax:1, fare:999, cruise:200, cost:1, model:'wonderful', camScale:0.5,
    physics:{mass:2000, wingArea:10, thrust:20000, CLmax:1.8, gearHeight:1.4}, fixedGear:true, hasCockpit:true },
  { id:'dc3', name:'Douglas DC-3', tag:'Classic piston twin', pax:28, fare:110, cruise:150, cost:1500, model:'dc3', camScale:0.6,
    physics:{mass:11500, wingArea:91, thrust:36000, CLmax:1.8, gearHeight:2.5}, fixedGear:false, hasCockpit:true },
  { id:'atr', name:'ATR 72', tag:'Regional turboprop', pax:70, fare:80, cruise:270, cost:3000, model:'atr', camScale:0.55,
    physics:{mass:22000, wingArea:61, thrust:55000, CLmax:1.8, gearHeight:2.35}, fixedGear:false, hasCockpit:true },
  { id:'dhc8', name:'De Havilland Dash 8 Q400', tag:'Fast turboprop', pax:78, fare:78, cruise:300, cost:5000, model:'dhc8', camScale:0.6,
    physics:{mass:28000, wingArea:63, thrust:75000, CLmax:1.85, gearHeight:2.7}, fixedGear:false, hasCockpit:true },
  { id:'crj9', name:'Bombardier CRJ-900', tag:'Regional jet', pax:90, fare:65, cruise:450, cost:8500, model:'crj9', camScale:0.75,
    physics:{mass:37000, wingArea:71, thrust:120000, CLmax:1.75, gearHeight:1.9}, fixedGear:false, hasCockpit:true },
  { id:'e190', name:'Embraer E190', tag:'Regional jet', pax:100, fare:60, cruise:450, cost:12000, model:'e190', camScale:0.8,
    physics:{mass:50000, wingArea:92, thrust:130000, CLmax:1.8, gearHeight:2.7}, fixedGear:false, hasCockpit:true },
  { id:'dc9', name:'McDonnell Douglas DC-9', tag:'Classic jet', pax:115, fare:50, cruise:440, cost:24000, model:'dc9', camScale:0.9,
    physics:{mass:48000, wingArea:93, thrust:140000, CLmax:1.8, gearHeight:2.1}, fixedGear:false, hasCockpit:true },
  { id:'md83', name:'McDonnell Douglas MD-83', tag:'Mad Dog', pax:155, fare:48, cruise:445, cost:32000, model:'md83', camScale:1.0,
    physics:{mass:60000, wingArea:112, thrust:180000, CLmax:1.8, gearHeight:2.3}, fixedGear:false, hasCockpit:true },
  { id:'a320', name:'Airbus A320neo', tag:'Best-selling narrowbody', pax:186, fare:46, cruise:450, cost:38000, model:'a320', camScale:1.0,
    physics:{mass:64000, wingArea:122, thrust:240000, CLmax:1.85, gearHeight:2.3}, fixedGear:false, hasCockpit:true },
  { id:'b737', name:'Boeing 737-800', tag:'Narrowbody', pax:180, fare:45, cruise:470, cost:40000, model:'737', camScale:1.0,
    physics:{mass:65000, wingArea:124.6, thrust:245000, CLmax:1.85, gearHeight:4.05}, fixedGear:false, hasCockpit:true },
  { id:'dc8', name:'Douglas DC-8', tag:'Classic quad jet', pax:189, fare:48, cruise:480, cost:55000, model:'dc8', camScale:1.15,
    physics:{mass:140000, wingArea:272, thrust:400000, CLmax:1.85, gearHeight:3.5}, fixedGear:false, hasCockpit:true },
  { id:'f18', name:'F/A-18 Hornet', tag:'Fighter jet', pax:2, fare:5000, cruise:540, cost:62000, model:'f18', camScale:0.55,
    physics:{mass:16000, wingArea:38, thrust:190000, CLmax:1.8, gearHeight:2.2}, fixedGear:false, hasCockpit:true },
  { id:'dc10', name:'McDonnell Douglas DC-10', tag:'Classic trijet', pax:270, fare:50, cruise:480, cost:70000, model:'dc10', camScale:1.3,
    physics:{mass:200000, wingArea:340, thrust:520000, CLmax:1.9, gearHeight:3.6}, fixedGear:false, hasCockpit:true },
  { id:'l1011', name:'Lockheed L-1011 TriStar', tag:'Classic widebody trijet', pax:256, fare:52, cruise:485, cost:85000, model:'l1011', camScale:1.25,
    physics:{mass:200000, wingArea:329, thrust:500000, CLmax:1.9, gearHeight:3.4}, fixedGear:false, hasCockpit:true },
  { id:'b787', name:'Boeing 787-9', tag:'Widebody', pax:290, fare:55, cruise:490, cost:100000, model:'787', camScale:1.2,
    physics:{mass:250000, wingArea:377, thrust:640000, CLmax:1.9, gearHeight:5.47}, fixedGear:false, hasCockpit:true },
  { id:'a350', name:'Airbus A350-900', tag:'Widebody', pax:325, fare:58, cruise:490, cost:150000, model:'a350', camScale:1.25,
    physics:{mass:260000, wingArea:442, thrust:680000, CLmax:1.9, gearHeight:3.8}, fixedGear:false, hasCockpit:true },
  { id:'b777', name:'Boeing 777-300ER', tag:'Long-haul twin', pax:396, fare:60, cruise:490, cost:180000, model:'b777', camScale:1.4,
    physics:{mass:300000, wingArea:436, thrust:760000, CLmax:1.9, gearHeight:4.0}, fixedGear:false, hasCockpit:true },
  { id:'b747', name:'Boeing 747-400', tag:'Jumbo jet', pax:416, fare:62, cruise:490, cost:250000, model:'b747', camScale:1.45,
    physics:{mass:340000, wingArea:511, thrust:900000, CLmax:1.9, gearHeight:5.3}, fixedGear:false, hasCockpit:true },
  { id:'a380', name:'Airbus A380-800', tag:'Superjumbo', pax:555, fare:65, cruise:490, cost:320000, model:'a380', camScale:1.5,
    physics:{mass:560000, wingArea:845, thrust:1200000, CLmax:1.9, gearHeight:4.7}, fixedGear:false, hasCockpit:true },
  { id:'concorde', name:'Aerospatiale/BAC Concorde', tag:'Supersonic legend', pax:100, fare:300, cruise:1170, cost:400000, model:'concorde', camScale:1.2,
    physics:{mass:110000, wingArea:358, thrust:620000, CLmax:1.55, gearHeight:3.4}, fixedGear:false, hasCockpit:true },
  { id:'b727', name:'Boeing 727-200', tag:'Classic trijet · steam gauges', pax:149, fare:49, cruise:460, cost:450000, model:'b727', camScale:1.0,
    physics:{mass:78000, wingArea:157, thrust:200000, CLmax:1.8, gearHeight:2.5}, fixedGear:false, hasCockpit:true },
  { id:'b767', name:'Boeing 767-300ER', tag:'Widebody twin', pax:269, fare:58, cruise:488, cost:480000, model:'b767', camScale:1.25,
    physics:{mass:186000, wingArea:283, thrust:560000, CLmax:1.85, gearHeight:3.3}, fixedGear:false, hasCockpit:true }
];
  /* ===== EXTRA AIRCRAFT (data-driven jets: BAe 146, Avro RJ, 707, 717, 757, A319/321/330/340/300/310/220, MD-11, F100, CRJ-200, E175, Tu-154, Il-62, VC10, SSJ100, C919, BAC 1-11, Caravelle, 747-8, 737 MAX, 787-10, A350-1000, Tu-134 and business jets) ===== */
const NJ_K=.88;
function njGen(r){
  const [id,name,tag,pax,fare,cruise,cost,mass,wingArea,thrust,CLmax,L0,D0,SP0,wg,swd,eng,tail,col,col2,flags,ceil,brand]=r;
  const L=L0*NJ_K,R=D0*NJ_K/2,S=SP0*NJ_K/2,h=L/2,hi=wg==='h',sw=Math.tan(swd*Math.PI/180),T=tail==='T';
  const lerp=(a,b,t)=>a+(b-a)*t,rear=/^r|tri7/.test(eng);
  const up=1;
  const pts=[{z:h,r:.07*R},{z:h-.85*R,r:.52*R},{z:h-2.05*R,r:.87*R},{z:h-4.9*R,r:R},{z:-h+6.2*R,r:R},
    {z:-h+3.0*R,r:.74*R,yo:.23*R*up},{z:-h+.7*R,r:.29*R,yo:.58*R*up},{z:-h,r:.08*R,yo:.71*R*up}];
  const cr=Math.min(S*.55,(hi?.15:.165)*L*(L<30?1.1:1)),ct=cr*.25,z0=h*(rear?.12:hi?.12:.17),s0=R*.97;
  const yR=hi?R*.62:-R*.58,yT=hi?R*.62+S*.02:-R*.03;
  const zl=s=>z0-sw*(s-s0),wy=s=>{const t=(s-s0)/(S-s0);return t<.3?lerp(yR,lerp(yR,yT,.55),t/.3):lerp(lerp(yR,yT,.55),yT,(t-.3)/.7);};
  const wing=[{s:s0,c:cr,t:.13,zLE:z0,y:yR},{s:.38*S,c:cr*.7,t:.11,zLE:zl(.38*S),y:wy(.38*S)},{s:S,c:ct,t:.09,zLE:zl(S),y:yT}];
  const fs=4.85*R*(T?1.05:1);
  const fin=[{s:R,c:.148*L,t:.14,zLE:-.62*h},{s:2.9*R*(T?1.05:1),c:.103*L,t:.12,zLE:-.77*h},{s:fs,c:.061*L,t:.1,zLE:-.92*h}];
  const htail=T?[{s:.3,c:.09*L,t:.12,zLE:-.8*h,y:fs},{s:.14*L,c:.045*L,t:.1,zLE:-.93*h,y:fs}]
               :[{s:.3,c:.097*L,t:.12,zLE:-.76*h,y:.58*R},{s:.18*L,c:.045*L,t:.1,zLE:-.915*h,y:.84*R}];
  const engines=[];const er=(/w4/.test(eng)&&hi)?.42*R:/^r|tri7/.test(eng)?.66*R:.61*R,el=(/^r|tri7/.test(eng)?3.7:2.7)*R;
  const wingEng=(x)=>{engines.push({x,y:wy(x)-(hi?.62:.68)*R,z:zl(x)+el*.15,r:er,len:el,pylon:true});engines.push({x:-x,y:wy(x)-(hi?.62:.68)*R,z:zl(x)+el*.15,r:er,len:el,pylon:true});};
  const rearEng=(x,y)=>{for(const sd of [1,-1])engines.push({x:sd*x,y,z:-.58*h,r:er,len:el,pylon:'fus'});};
  if(eng==='w2')wingEng(.33*S);else if(eng==='w4'){wingEng(.28*S);wingEng(.58*S);}
  else if(eng==='r2')rearEng(1.8*R,.46*R);
  else if(eng==='r4'){rearEng(1.5*R,.4*R);rearEng(2.5*R,.34*R);}
  else if(eng==='tri7'){rearEng(1.8*R,.46*R);engines.push({x:0,y:2.3*R,z:-.87*h,r:er,len:el});}
  else if(eng==='tri'){wingEng(.33*S);engines.push({x:0,y:2.1*R,z:-.74*h,r:.68*R,len:3.4*R});}
  const gh=r.gh||R*(/^w/.test(eng)&&!hi?1.26:1.3);
  const mx=Math.max(1.4*R,.17*S),mz=z0-.65*cr,gear=[[0,.8*h],[-mx,mz],[mx,mz]];
  if(L>46){gear.push([-mx,mz-3.4],[mx,mz-3.4]);}
  const b={fus:pts.map(p=>({w:1,h:1,yo:0,flat:.13,...p})),wing,fin,htail,engines,ws:[.84*R,.52*R,.5*R,.84*h],gear,gh};
  const small=L<26;
  const d={fus:pts.map(p=>({w:1,h:1,yo:0,...p})),
    wing:wing.map(w=>({s:w.s,y:w.y,zLE:w.zLE,c:w.c})),fin:{top:fs,zLE:-.92*h,c:.061*L},
    windows:{z0:.68*h,z1:-.6*h,step:small?.6:.8,y:.34*R,w:Math.max(.2,.09*R),h:Math.max(.26,.115*R)},
    stripes:[[-.26*R,-.07*R,col],[-.05*R,0,col2]],stripeZ:[.76*h,-.7*h],finColor:col,
    engines:engines.map(e=>({x:e.x,y:e.y,zF:e.z+e.len/2,zR:e.z-e.len/2,r:e.r,pylon:e.pylon})),
    panes:{z:.9*h,k:.44*R},lip:col2};
  if(/w/.test(flags||''))d.winglet={h:.87*R,c0:.58*R,c1:.22*R};
  return {id,name,tag,pax,fare,cruise,cost,b,d,camScale:Math.max(.9,Math.sqrt(L/31)),
    physics:{mass,wingArea,thrust,CLmax,gearHeight:gh},ceil,brand,analog:/a/.test(flags||''),
    eye:[-(.42+.12*R),.52*R,.84*h],ck:Math.max(.9,Math.min(1.8,R/1.55)),isc:Math.max(.9,Math.min(1.5,R/1.55))};
}
const NJ_RAW=[
 ['learjet45','Learjet 45','Light business jet',9,400,460,9000,8600,29.4,32000,1.7, 17.7,1.8,14.5,'l',13,'r2','T',[.1,.1,.12],[.8,.1,.1],'',51000,''],
 ['phenom100','Embraer Phenom 100','Entry-level very light jet',6,380,380,6000,4800,18.9,13000,1.7, 12.8,1.6,12.3,'l',8,'r2','T',[.08,.12,.2],[.0,.55,.75],'',41000,''],
 ['citx','Cessna Citation X','Fast business jet',12,380,520,15000,16000,48.9,58000,1.6, 22.0,1.9,19.4,'l',37,'r2','T',[.1,.2,.4],[.75,.75,.8],'',51000,''],
 ['g650','Gulfstream G650','Ultra-long-range bizjet',19,350,500,60000,45000,119,130000,1.65, 30.4,2.5,30.4,'l',36,'r2','T',[.1,.1,.1],[.8,.7,.3],'w',51000,''],
 ['crj2','Bombardier CRJ-200','Regional jet',50,70,430,5000,21000,48.4,82000,1.9, 26.8,2.69,21.2,'l',24,'r2','T',[.1,.3,.5],[.7,.7,.75],'',41000,''],
 ['bae146','BAe 146-200','Whisper jet · 4 engines',82,52,400,14000,36000,77.3,135000,2.1, 26.2,3.56,26.3,'h',15,'w4','T',[.55,.08,.12],[.9,.9,.92],'',30000,''],
 ['rj100','Avro RJ100','Quad regional jet',100,54,420,17000,40000,77.3,140000,2.1, 31.0,3.56,26.3,'h',15,'w4','T',[.1,.25,.5],[.9,.75,.2],'',31000,''],
 ['bac111','BAC One-Eleven','Classic rear-engine jet',89,48,410,18000,36000,93.2,150000,1.8, 28.5,3.2,27.0,'l',20,'r2','T',[.1,.35,.2],[.85,.85,.8],'a',35000,''],
 ['tu134','Tupolev Tu-134','Soviet rear-engine jet',76,44,420,16000,44000,127,130000,1.8, 37.1,2.9,29.0,'l',35,'r2','T',[.8,.1,.1],[.85,.85,.9],'a',39000,''],
 ['caravelle','Sud Aviation Caravelle','Pioneer jetliner',80,46,400,20000,43000,146,100000,1.8, 32.0,3.2,34.3,'l',20,'r2','c',[.1,.3,.6],[.85,.1,.1],'a',38000,''],
 ['f100','Fokker 100','Dutch regional jet',100,52,440,22000,40000,93.5,125000,1.9, 35.5,3.3,28.1,'l',17,'r2','T',[.05,.2,.5],[.9,.5,.1],'',35000,''],
 ['e175','Embraer E175','Regional jet',78,56,450,15000,34000,72.7,125000,1.9, 31.7,3.0,26.0,'l',23,'w2','c',[.0,.35,.55],[.9,.9,.9],'',41000,''],
 ['b717','Boeing 717-200','Quiet twin jet',106,49,440,26000,48000,93,190000,1.85, 37.8,3.34,28.4,'l',24,'r2','T',[.0,.25,.5],[.9,.4,.1],'',37000,'md'],
 ['ssj100','Sukhoi Superjet 100','Russian regional jet',98,52,440,30000,41000,83.8,150000,1.9, 29.9,3.46,27.8,'l',25,'w2','c',[.05,.2,.55],[.8,.1,.15],'',40000,''],
 ['a220','Airbus A220-300','Modern small narrowbody',140,50,450,45000,60000,112,210000,1.9, 38.7,3.7,35.1,'l',26,'w2','c',[.0,.45,.7],[.9,.9,.95],'w',41000,'airbus'],
 ['tu154','Tupolev Tu-154','Soviet trijet',164,46,460,34000,85000,202,315000,1.8, 47.9,3.8,37.6,'l',35,'tri7','T',[.75,.1,.1],[.1,.2,.5],'a',39000,''],
 ['a319','Airbus A319','Short narrowbody',144,46,450,36000,58000,122,240000,1.85, 33.8,3.95,34.1,'l',25,'w2','c',[.05,.2,.5],[.9,.5,.0],'',39000,'airbus'],
 ['b38m','Boeing 737 MAX 8','Modern narrowbody',189,46,470,60000,70000,125,260000,1.85, 39.5,3.76,35.9,'l',25,'w2','c',[.0,.2,.45],[.85,.1,.15],'w',41000,''],
 ['c919','COMAC C919','Chinese narrowbody',168,46,450,52000,65000,121,260000,1.85, 38.9,3.96,35.8,'l',25,'w2','c',[.0,.35,.6],[.9,.75,.2],'',39000,''],
 ['b707','Boeing 707-320','Original jet age',180,47,470,62000,112000,283,320000,1.8, 46.6,3.76,44.4,'l',35,'w4','c',[.1,.3,.6],[.85,.85,.9],'a',42000,''],
 ['vc10','Vickers VC10','British rear-engine quad',150,50,470,70000,120000,272,400000,1.8, 48.4,4.0,44.6,'l',32,'r4','T',[.1,.25,.55],[.85,.85,.9],'a',38000,''],
 ['il62','Ilyushin Il-62','Soviet long-haul quad',186,48,460,68000,130000,279,430000,1.8, 53.1,4.1,43.2,'l',35,'r4','T',[.75,.1,.1],[.9,.9,.9],'a',39000,''],
 ['a321','Airbus A321neo','Stretched narrowbody',220,47,450,55000,78000,128,290000,1.85, 44.5,3.95,34.1,'l',25,'w2','c',[.05,.15,.4],[.0,.65,.8],'w',39000,'airbus'],
 ['b757','Boeing 757-200','Powerful narrowbody',200,50,470,75000,95000,185,380000,1.85, 47.3,3.76,38.0,'l',25,'w2','c',[.1,.25,.5],[.9,.9,.95],'',42000,''],
 ['a300','Airbus A300-600','First Airbus widebody',266,53,470,90000,145000,260,520000,1.85, 54.1,5.64,44.8,'l',28,'w2','c',[.1,.25,.55],[.9,.9,.9],'',40000,'airbus'],
 ['a310','Airbus A310-300','Shorter widebody twin',220,53,470,95000,125000,219,480000,1.85, 46.7,5.64,43.9,'l',28,'w2','c',[.0,.35,.6],[.9,.8,.2],'',41000,'airbus'],
 ['a330','Airbus A330-300','Medium-haul widebody',277,56,480,130000,190000,361,640000,1.85, 63.7,5.64,60.3,'l',30,'w2','c',[.0,.3,.55],[.9,.9,.95],'w',41000,'airbus'],
 ['md11','McDonnell Douglas MD-11','Widebody trijet',293,54,490,140000,210000,339,740000,1.85, 61.6,6.02,51.7,'l',35,'tri','c',[.8,.5,.0],[.1,.2,.4],'w',43000,'md'],
 ['b78x','Boeing 787-10','Long stretched Dreamliner',330,56,490,170000,215000,325,640000,1.85, 68.3,5.8,60.1,'l',32,'w2','c',[.0,.3,.55],[.8,.8,.85],'w',43000,''],
 ['a340','Airbus A340-600','Four-engine ultra-long-haul',380,58,490,190000,320000,437,1000000,1.85, 75.4,5.64,63.5,'l',30,'w4','c',[.05,.2,.4],[.8,.1,.1],'',41000,'airbus'],
 ['a35k','Airbus A350-1000','Flagship widebody',370,60,490,210000,260000,442,750000,1.85, 73.8,5.96,64.8,'l',32,'w2','c',[.05,.1,.3],[.0,.7,.85],'w',42000,'airbus'],
 ['b748','Boeing 747-8','Stretched jumbo',467,63,490,290000,360000,554,1200000,1.85, 76.3,6.5,68.4,'l',37,'w4','c',[.1,.2,.4],[.8,.7,.3],'w',43000,'']
];
const NJ=NJ_RAW.map(njGen);
const NJ_IDS=NJ.map(p=>p.id);
NJ.forEach(p=>FLEET.push({id:p.id,name:p.name,tag:p.tag,pax:p.pax,fare:p.fare,cruise:p.cruise,cost:p.cost,model:p.id,camScale:p.camScale,
  physics:p.physics,fixedGear:false,hasCockpit:true}));
{const _i=FLEET.findIndex(f=>f.id==='phenom100');if(_i>2){const _p=FLEET.splice(_i,1)[0];FLEET.splice(2,0,_p);}}
if(C.fleetV===5){const NEWIDS=['cirrus','phenom100'];const oldIds=FLEET.map(f=>f.id).filter(id=>!NEWIDS.includes(id));
  const mp=i=>{const k=FLEET.findIndex(f=>f.id===oldIds[i]);return k>=0?k:0;};
  const mf=C.maxFleet==null?C.upgrades.fleet:C.maxFleet;C.upgrades.fleet=mp(C.upgrades.fleet);C.maxFleet=mp(mf);C.fleetV=6;save();}
NJ.forEach(p=>{if(p.analog)ANALOG_SET.add(p.id);if(p.brand==='airbus')AIRBUS_SET.add(p.id);if(p.brand==='md')MD_SET.add(p.id);});

  const UPGRADES={
    engines:{name:'Engine Efficiency',max:5,baseCost:4000,per:0.05,effect:'+5% payout per level'},
    comfort:{name:'Passenger Comfort',max:5,baseCost:3000,per:0.10,effect:'+10% tips per level'},
    safety: {name:'Safety Systems',   max:5,baseCost:5000,per:0.08,effect:'−8% crash penalty · +8% payout'},
  };
  const xpForLevel=l=>l*1000;
  const fleet=()=>FLEET[C.upgrades.fleet]||FLEET[0];
  function addXP(a){C.xp+=a;let lv=0;while(C.xp>=xpForLevel(C.level)){C.xp-=xpForLevel(C.level);C.level++;lv++;}return lv;}

  function computeAGL(){
    try{const gh=sampleSurface(plane.pos.x,plane.pos.z);return Math.max(0,(plane.pos.y-gh)*3.28084);}catch(e){return 0;}
  }
  function setSelect(id,v){const el=document.getElementById(id);if(!el)return;
    if(el.value!==v){el.value=v;try{el.dispatchEvent(new Event('change'));}catch(e){}}}
  function findLocValueByCode(code){const sel=document.getElementById('locSelect');if(!sel)return null;
    for(const opt of sel.options) if(opt.value.endsWith(','+code)) return opt.value;
    return null;}
  function pickRandomLoc(){const sel=document.getElementById('locSelect');
    if(!sel) return {code:'LSZH',value:'47.4647,8.5492,432,LSZH'};
    const opts=[...sel.options].filter(o=>o.value!=='CUSTOM'&&RUNWAYS[o.value.split(',').pop()]);
    const pick=opts[Math.floor(Math.random()*opts.length)];
    if(!pick) return {code:'LSZH',value:'47.4647,8.5492,432,LSZH'};
    return {code:pick.value.split(',').pop(),value:pick.value};}

  /* ---------- AIRCRAFT MODELS ---------- */
  const modelRoots={};
  let activeModelId='cessna';
  const MAT={};

  function initMats(){
    const mk=(n,c,m,r,a)=>{
      const mat=new BABYLON.PBRMaterial('ac_'+n,scene);
      mat.albedoColor=new BABYLON.Color3(c[0],c[1],c[2]);
      mat.metallic=m;mat.roughness=r;
      if(a!==undefined){mat.alpha=a;mat.transparencyMode=2;}
      return mat;
    };
    MAT.white = mk('white',[.95,.96,.98],.25,.35);
    MAT.dark  = mk('dark', [.08,.08,.10],.4,.5);
    MAT.red   = mk('red',  [.85,.15,.12],.3,.4);
    MAT.blue  = mk('blue', [.10,.30,.70],.35,.35);
    MAT.cyan  = mk('cyan', [.10,.60,.75],.3,.4);
    MAT.glass = mk('glass',[.15,.25,.35],.7,.1,.55);
    MAT.gear  = mk('gear', [.15,.15,.18],.5,.4);
  }

  function cyl(g,name,dTop,dBot,h,mat,pos,rot){
    const m=BABYLON.MeshBuilder.CreateCylinder(name,{height:h,diameterTop:dTop,diameterBottom:dBot,tessellation:14},scene);
    if(rot)m.rotation.set(rot[0]||0,rot[1]||0,rot[2]||0);
    if(pos)m.position.set(pos[0],pos[1],pos[2]);
    m.material=mat;m.parent=g;m.isPickable=false;return m;
  }
  function box(g,name,w,h,d,mat,pos,rot){
    const m=BABYLON.MeshBuilder.CreateBox(name,{width:w,height:h,depth:d},scene);
    if(rot)m.rotation.set(rot[0]||0,rot[1]||0,rot[2]||0);
    if(pos)m.position.set(pos[0],pos[1],pos[2]);
    m.material=mat;m.parent=g;m.isPickable=false;return m;
  }

  function buildCessnaModel(){
    const g=new BABYLON.TransformNode('ac_cessna',scene);g.parent=aircraftRoot;
    const S=1.5;g.scaling.set(S,S,S);
    tubeSmooth('c172_fus', [
      {z: 4.1, r: 0.05, w: 1, h: 1, yo: 0, flat: 0.1},
      {z: 3.6, r: 0.45, w: 1, h: 1, yo: 0, flat: 0.1},
      {z: 2.8, r: 0.55, w: 1, h: 1.05, yo: 0, flat: 0.1},
      {z: 1.0, r: 0.6, w: 1, h: 1.1, yo: 0, flat: 0.1},
      {z: -1.0, r: 0.55, w: 1, h: 1.0, yo: 0.1, flat: 0.1},
      {z: -3.0, r: 0.3, w: 1, h: 1.0, yo: 0.3, flat: 0.1},
      {z: -4.0, r: 0.1, w: 1, h: 1.0, yo: 0.4, flat: 0.1},
      {z: -4.2, r: 0.02, w: 1, h: 1.0, yo: 0.45, flat: 0.1}
    ], MAT.white, g);
    const wStations = [
      {s: 0.6, c: 1.5, t: .12, zLE: 1.2, y: 0.65},
      {s: 2.0, c: 1.5, t: .12, zLE: 1.2, y: 0.75},
      {s: 4.0, c: 1.5, t: .12, zLE: 1.2, y: 0.75},
      {s: 5.5, c: 1.2, t: .12, zLE: 1.2, y: 0.75}
    ];
    horiz('c172_wR', wStations, MAT.white, g);
    horiz('c172_wL', wStations.map(st => ({...st, s: -st.s})), MAT.white, g);
    cyl(g,'c172_sL',0.05,0.05,0.8,MAT.dark,[-1.4,0.3,0.8],[0,0,0.4]);
    cyl(g,'c172_sR',0.05,0.05,0.8,MAT.dark,[ 1.4,0.3,0.8],[0,0,-0.4]);
    const fStations = [
      {s: 0.4, c: 1.2, t: .12, zLE: -3.5},
      {s: 1.4, c: 1.0, t: .12, zLE: -3.8},
      {s: 1.6, c: 0.5, t: .12, zLE: -4.2}
    ];
    vert('c172_fin', fStations, MAT.white, g);
    const hStations = [
      {s: 0.1, c: 0.9, t: .10, zLE: -4.0, y: 0.3},
      {s: 1.7, c: 0.6, t: .10, zLE: -4.2, y: 0.3}
    ];
    horiz('c172_hR', hStations, MAT.white, g);
    horiz('c172_hL', hStations.map(st => ({...st, s: -st.s})), MAT.white, g);
    cyl(g,'c172_spin',0.05,0.3,0.4,MAT.dark,[0,0,3.3],[Math.PI/2,0,0]);
    const prop=BABYLON.MeshBuilder.CreateDisc('c172_prop',{radius:1.0,tessellation:20},scene);
    prop.position.set(0,0,3.4); prop.material=MAT.dark; prop.parent=g; prop.isPickable=false;
    g._prop=prop;
    box(g,'c172_ws',0.9,0.45,0.1,MAT.glass,[0,0.3,1.4]);
    box(g,'c172_swL',0.05,0.35,1.2,MAT.glass,[-0.55,0.2,0.0]);
    box(g,'c172_swR',0.05,0.35,1.2,MAT.glass,[ 0.55,0.2,0.0]);
    const gear=new BABYLON.TransformNode('c172_gear',scene);gear.parent=g;
    cyl(gear,'c172_ngS',0.04,0.04,0.5,MAT.dark,[0,-0.5,2.8]);
    cyl(gear,'c172_ngW',0.35,0.35,0.1,MAT.dark,[0,-0.75,2.8],[0,0,Math.PI/2]);
    for(const side of [-1,1]){
      cyl(gear,'c172_mgS'+side,0.05,0.05,0.8,MAT.dark,[side*0.7,-0.4,0.5],[0,0,side*0.4]);
      cyl(gear,'c172_mgW'+side,0.4,0.4,0.14,MAT.dark,[side*1.0,-0.8,0.5],[0,0,Math.PI/2]);
    }
    g.metadata={gearGroup:gear,fixed:true};
    return g;
  }

  function buildCirrusModel(){
    const g=new BABYLON.TransformNode('ac_cirrus',scene);g.parent=aircraftRoot;
    const S=1.5;g.scaling.set(S,S,S);
    tubeSmooth('cirrus_fus', [
      {z: 4.0, r: 0.05, w: 1, h: 1, yo: 0, flat: 0.1},
      {z: 3.5, r: 0.40, w: 1, h: 1, yo: 0, flat: 0.1},
      {z: 2.6, r: 0.52, w: 1, h: 1.02, yo: 0, flat: 0.1},
      {z: 0.8, r: 0.58, w: 1, h: 1.1, yo: 0.02, flat: 0.1},
      {z: -1.2, r: 0.5, w: 1, h: 1.0, yo: 0.12, flat: 0.1},
      {z: -3.0, r: 0.27, w: 1, h: 1.0, yo: 0.28, flat: 0.1},
      {z: -4.0, r: 0.1, w: 1, h: 1.0, yo: 0.38, flat: 0.1},
      {z: -4.2, r: 0.02, w: 1, h: 1.0, yo: 0.42, flat: 0.1}
    ], MAT.white, g);
    const wStations = [
      {s: 0.6, c: 1.5, t: .12, zLE: 1.0, y: -0.38},
      {s: 2.2, c: 1.35, t: .11, zLE: 0.95, y: -0.30},
      {s: 4.4, c: 1.1, t: .10, zLE: 0.9, y: -0.20},
      {s: 5.2, c: 0.8, t: .09, zLE: 0.85, y: -0.15}
    ];
    horiz('cirrus_wR', wStations, MAT.white, g);
    horiz('cirrus_wL', wStations.map(st => ({...st, s: -st.s})), MAT.white, g);
    const fStations = [
      {s: 0.4, c: 1.25, t: .11, zLE: -3.3},
      {s: 1.5, c: 0.95, t: .10, zLE: -3.7},
      {s: 1.75, c: 0.5, t: .09, zLE: -4.2}
    ];
    vert('cirrus_fin', fStations, MAT.white, g);
    const hStations = [
      {s: 0.1, c: 0.85, t: .09, zLE: -3.85, y: 0.25},
      {s: 1.9, c: 0.55, t: .08, zLE: -4.15, y: 0.3}
    ];
    horiz('cirrus_hR', hStations, MAT.white, g);
    horiz('cirrus_hL', hStations.map(st => ({...st, s: -st.s})), MAT.white, g);
    cyl(g,'cirrus_spin',0.05,0.32,0.45,MAT.dark,[0,0,3.7],[Math.PI/2,0,0]);
    const prop=BABYLON.MeshBuilder.CreateDisc('cirrus_prop',{radius:.95,tessellation:24},scene);
    prop.position.set(0,0,3.85); prop.material=MAT.dark; prop.parent=g; prop.isPickable=false;
    g._prop=prop;
    // raked canopy
    box(g,'cirrus_ws',0.95,0.42,0.1,MAT.glass,[0,0.32,1.45],[-.55,0,0]);
    box(g,'cirrus_swL',0.05,0.34,1.3,MAT.glass,[-0.52,0.25,0.15]);
    box(g,'cirrus_swR',0.05,0.34,1.3,MAT.glass,[ 0.52,0.25,0.15]);
    box(g,'cirrus_roof',0.8,0.05,1.1,MAT.white,[0,0.52,0.1]);
    const gear=new BABYLON.TransformNode('cirrus_gear',scene);gear.parent=g;
    cyl(gear,'cirrus_ngS',0.05,0.05,0.5,MAT.dark,[0,-0.5,2.6]);
    cyl(gear,'cirrus_ngW',0.35,0.35,0.1,MAT.dark,[0,-0.78,2.6],[0,0,Math.PI/2]);
    for(const side of [-1,1]){
      cyl(gear,'cirrus_mgS'+side,0.06,0.06,0.65,MAT.dark,[side*0.85,-0.55,0.7],[0,0,side*0.3]);
      cyl(gear,'cirrus_mgW'+side,0.4,0.4,0.14,MAT.dark,[side*1.0,-0.8,0.7],[0,0,Math.PI/2]);
      // wheel spat (SR22 style fairing)
      box(gear,'cirrus_mgF'+side,0.2,0.55,0.9,MAT.white,[side*1.0,-0.7,0.65]);
    }
    g.metadata={gearGroup:gear,fixed:true};
    return g;
  }

  function buildATRModel(){
    const g=new BABYLON.TransformNode('ac_atr',scene);g.parent=aircraftRoot;
    tubeSmooth('atr_fus', [
      {z: 13.5, r: 0.1, w: 1, h: 1, yo: 0, flat: 0.1},
      {z: 12.0, r: 0.8, w: 1, h: 1, yo: 0, flat: 0.15},
      {z: 10.0, r: 1.3, w: 1, h: 1, yo: 0, flat: 0.15},
      {z: 5.0, r: 1.4, w: 1, h: 1, yo: 0, flat: 0.15},
      {z: 0.0, r: 1.4, w: 1, h: 1, yo: 0, flat: 0.15},
      {z: -5.0, r: 1.3, w: 1, h: 1, yo: 0, flat: 0.15},
      {z: -10.0, r: 0.9, w: 1, h: 1, yo: 0.3, flat: 0.15},
      {z: -13.0, r: 0.2, w: 1, h: 1, yo: 0.8, flat: 0.15}
    ], MAT.white, g);
    const wStations = [
      {s: 1.5, c: 3.5, t: 0.15, zLE: 2.0, y: 1.5},
      {s: 7.0, c: 3.0, t: 0.14, zLE: 1.5, y: 1.7},
      {s: 13.5, c: 1.5, t: 0.12, zLE: 0.5, y: 1.9}
    ];
    horiz('atr_wR', wStations, MAT.white, g);
    horiz('atr_wL', wStations.map(st => ({...st, s: -st.s})), MAT.white, g);
    const fStations = [
      {s: 1.5, c: 3.0, t: 0.15, zLE: -11.0},
      {s: 3.5, c: 2.0, t: 0.12, zLE: -11.5},
      {s: 4.0, c: 1.0, t: 0.1, zLE: -12.5}
    ];
    vert('atr_fin', fStations, MAT.white, g);
    const hStations = [
      {s: 0.2, c: 2.0, t: 0.12, zLE: -12.0, y: 3.8},
      {s: 3.5, c: 1.5, t: 0.1, zLE: -12.5, y: 3.8}
    ];
    horiz('atr_hR', hStations, MAT.white, g);
    horiz('atr_hL', hStations.map(st => ({...st, s: -st.s})), MAT.white, g);
    g._props = [];
    for (const side of [1, -1]) {
      tubeSmooth('atr_nac'+side, [
        {z: 4.0, r: 0.1, w: 1, h: 1, yo: 0, flat: 0.1},
        {z: 3.5, r: 0.6, w: 1, h: 1, yo: 0, flat: 0.1},
        {z: 0.0, r: 0.6, w: 1, h: 1, yo: 0, flat: 0.1},
        {z: -2.5, r: 0.3, w: 1, h: 1, yo: 0, flat: 0.1}
      ], MAT.white, g).position.set(side*6.5, 1.5, 0);
      const prop = BABYLON.MeshBuilder.CreateDisc('atr_prop'+side, {radius: 1.9, tessellation: 20}, scene);
      prop.position.set(side*6.5, 1.5, 4.2);
      prop.material = MAT.dark; prop.parent = g; prop.isPickable = false;
      g._props.push(prop);
    }
    box(g,'atr_ws',1.8,0.7,0.2,MAT.glass,[0,0.8,11.8]);
    const gear=new BABYLON.TransformNode('atr_gear',scene);gear.parent=g;
    for(const [x,z] of [[0,11.5],[-2.6,-1],[2.6,-1]]){
      cyl(gear,'atr_strut',0.08,0.08,1.6,MAT.gear,[x,-1.3,z]);
      cyl(gear,'atr_wheel',0.7,0.7,0.24,MAT.dark,[x,-2.0,z],[0,0,Math.PI/2]);
    }
    g.metadata={gearGroup:gear,fixed:false};
    return g;
  }

  function buildE190Model(){
    const g=new BABYLON.TransformNode('ac_e190',scene);g.parent=aircraftRoot;
    tubeSmooth('e190_fus', [
      {z: 18.0, r: 0.1, w: 1, h: 1, yo: 0, flat: 0.1},
      {z: 16.5, r: 0.8, w: 1, h: 1, yo: 0, flat: 0.15},
      {z: 14.0, r: 1.1, w: 1, h: 1, yo: 0, flat: 0.15},
      {z: 5.0, r: 1.2, w: 1, h: 1, yo: 0, flat: 0.15},
      {z: -5.0, r: 1.2, w: 1, h: 1, yo: 0, flat: 0.15},
      {z: -12.0, r: 0.9, w: 1, h: 1, yo: 0.3, flat: 0.15},
      {z: -16.0, r: 0.3, w: 1, h: 1, yo: 0.8, flat: 0.15},
      {z: -17.5, r: 0.1, w: 1, h: 1, yo: 1.0, flat: 0.15}
    ], MAT.white, g);
    const wStations = [
      {s: 1.5, c: 4.5, t: 0.14, zLE: 2.0, y: -0.5},
      {s: 7.0, c: 3.5, t: 0.12, zLE: 1.0, y: -0.2},
      {s: 14.0, c: 1.5, t: 0.1, zLE: -1.0, y: 0.2}
    ];
    horiz('e190_wR', wStations, MAT.white, g);
    horiz('e190_wL', wStations.map(st => ({...st, s: -st.s})), MAT.white, g);
    const fStations = [
      {s: 1.5, c: 4.5, t: 0.15, zLE: -14.0},
      {s: 4.5, c: 3.0, t: 0.12, zLE: -15.0},
      {s: 6.0, c: 1.5, t: 0.1, zLE: -16.5}
    ];
    vert('e190_fin', fStations, MAT.white, g);
    const hStations = [
      {s: 0.2, c: 2.5, t: 0.12, zLE: -15.5, y: 5.8},
      {s: 4.5, c: 1.5, t: 0.1, zLE: -16.5, y: 5.8}
    ];
    horiz('e190_hR', hStations, MAT.white, g);
    horiz('e190_hL', hStations.map(st => ({...st, s: -st.s})), MAT.white, g);
    for (const side of [1, -1]) {
      tubeSmooth('e190_eng'+side, [
        {z: 2.5, r: 0.1, w: 1, h: 1, yo: 0, flat: 0.1},
        {z: 1.5, r: 0.8, w: 1, h: 1, yo: 0, flat: 0.1},
        {z: -1.0, r: 0.9, w: 1, h: 1, yo: 0, flat: 0.1},
        {z: -2.0, r: 0.6, w: 1, h: 1, yo: 0, flat: 0.1}
      ], MAT.white, g).position.set(side*5, -1.8, 0.5);
    }
    box(g,'e190_ws',1.2,0.8,0.2,MAT.glass,[0,0.7,15.5]);
    const gear=new BABYLON.TransformNode('e190_gear',scene);gear.parent=g;
    for(const [x,z] of [[0,15],[-2.2,-2],[2.2,-2]]){
      cyl(gear,'e190_strut',0.08,0.08,1.9,MAT.gear,[x,-1.5,z]);
      cyl(gear,'e190_wheel',0.75,0.75,0.26,MAT.dark,[x,-2.3,z],[0,0,Math.PI/2]);
    }
    g.metadata={gearGroup:gear,fixed:false};
    return g;
  }

  /* ================= MODEL DRESSING: windows, liveries, engines, props, lights ================= */
  const DRESS={};
  (function(){
    const F=(arr)=>arr.map(p=>({w:1,h:1,yo:0,...p}));
    DRESS.cessna={
      fus:F([{z:4.1,r:.05},{z:3.6,r:.45},{z:2.8,r:.55,h:1.05},{z:1,r:.6,h:1.1},{z:-1,r:.55,yo:.1},{z:-3,r:.3,yo:.3},{z:-4,r:.1,yo:.4},{z:-4.2,r:.02,yo:.45}]),
      wing:[{s:5.5,y:.75,zLE:1.2,c:1.2}],fin:{top:1.6,zLE:-4.2,c:.5},
      stripes:[[.0,.11,[.10,.30,.75]],[.14,.17,[.85,.15,.12]]],stripeZ:[3.1,-3.6],
      finColor:[.10,.30,.75],spin:[.85,.15,.12],blades:{n:2,len:1.0,w:.11}
    };
    DRESS.cirrus={
      fus:F([{z:4,r:.05},{z:3.5,r:.4},{z:2.6,r:.52,h:1.02},{z:.8,r:.58,h:1.1,yo:.02},{z:-1.2,r:.5,yo:.12},{z:-3,r:.27,yo:.28},{z:-4,r:.1,yo:.38},{z:-4.2,r:.02,yo:.42}]),
      wing:[{s:5.2,y:-.15,zLE:.85,c:.8}],fin:{top:1.75,zLE:-4.2,c:.5},
      stripes:[[.0,.1,[.05,.05,.07]],[.12,.2,[.85,.12,.1]]],stripeZ:[3.0,-3.8],
      finColor:[.05,.05,.07],spin:[.85,.12,.1],blades:{n:3,len:.95,w:.1}
    };
    DRESS.atr={
      fus:F([{z:13.5,r:.1},{z:12,r:.8},{z:10,r:1.3},{z:5,r:1.4},{z:0,r:1.4},{z:-5,r:1.3},{z:-10,r:.9,yo:.3},{z:-13,r:.2,yo:.8}]),
      wing:[{s:13.5,y:1.9,zLE:.5,c:1.5}],fin:{top:4.0,zLE:-12.5,c:1.0},
      windows:{z0:8.6,z1:-8.4,step:.85,y:.4,w:.2,h:.26},
      stripes:[[-.35,-.08,[.05,.55,.7]],[-.05,.0,[.95,.75,.1]]],stripeZ:[9,-9.5],
      finColor:[.05,.55,.7],engines:[{x:6.5,y:1.5,zF:4,zR:-2.5,r:.6,prop:{n:4,len:1.9,w:.2,z:4.2}},{x:-6.5,y:1.5,zF:4,zR:-2.5,r:.6,prop:{n:4,len:1.9,w:.2,z:4.2}}],
      panes:{z:11.6,k:.8},lip:[.95,.75,.1]
    };
    DRESS.e190={
      fus:F([{z:18,r:.1},{z:16.5,r:.8},{z:14,r:1.1},{z:5,r:1.2},{z:-5,r:1.2},{z:-12,r:.9,yo:.3},{z:-16,r:.3,yo:.8},{z:-17.5,r:.1,yo:1}]),
      wing:[{s:1.5,y:-.5,zLE:2,c:4.5},{s:7,y:-.2,zLE:1,c:3.5},{s:14,y:.2,zLE:-1,c:1.5}],fin:{top:6.0,zLE:-16.5,c:1.5},
      windows:{z0:12.5,z1:-10.5,step:.8,y:.45,w:.2,h:.26},
      stripes:[[-.3,-.05,[.95,.45,.05]],[0,.05,[.15,.15,.18]]],stripeZ:[13,-12.5],
      finColor:[.95,.45,.05],engines:[{x:5,y:-1.8,zF:3,zR:-1.5,r:.9,pylon:true},{x:-5,y:-1.8,zF:3,zR:-1.5,r:.9,pylon:true}],
      panes:{z:15.2,k:.8},winglet:{h:1.7,c0:1.3,c1:.5},lip:[.95,.45,.05]
    };
    DRESS.dc9={
      fus:F([{z:17,r:.1},{z:15.5,r:.8},{z:13.5,r:1.15},{z:6,r:1.25},{z:-6,r:1.25},{z:-12,r:.95,yo:.35},{z:-16,r:.4,yo:.9},{z:-17.5,r:.1,yo:1.1}]),
      wing:[{s:1.5,y:-.6,zLE:2,c:4.5},{s:7,y:-.3,zLE:0,c:3.4},{s:14,y:0,zLE:-2.5,c:1.6}],fin:{top:8,zLE:-16,c:1.8},
      windows:{z0:12,z1:-9.5,step:.78,y:.4,w:.2,h:.26},
      stripes:[[-.4,-.1,[.8,.1,.1]],[-.05,.05,[.15,.15,.18]]],stripeZ:[12.5,-11],
      finColor:[.8,.1,.1],engines:[{x:2.2,y:.6,zF:-7.7,zR:-12.3,r:.85,pylon:'fus'},{x:-2.2,y:.6,zF:-7.7,zR:-12.3,r:.85,pylon:'fus'}],
      panes:{z:14.7,k:.8},lip:[.8,.1,.1]
    };
    DRESS.dc10={
      fus:F([{z:24,r:.15},{z:21.5,r:1.3},{z:19,r:2.1},{z:14,r:2.55},{z:-10,r:2.55},{z:-18,r:2,yo:.4},{z:-23,r:.9,yo:1.2},{z:-25,r:.15,yo:1.6}]),
      wing:[{s:2.5,y:-1.2,zLE:4,c:8},{s:13,y:-.4,zLE:-2,c:5},{s:25,y:.9,zLE:-9,c:2}],fin:{top:12.5,zLE:-23,c:2.5},
      windows:{z0:17.5,z1:-15,step:.85,y:.75,w:.24,h:.3},
      stripes:[[-.6,-.15,[.1,.25,.65]],[-.1,.0,[.85,.1,.1]]],stripeZ:[18.5,-16.5],
      finColor:[.1,.25,.65],engines:[{x:8,y:-2.4,zF:2.5,zR:-4.5,r:1.45,pylon:true},{x:-8,y:-2.4,zF:2.5,zR:-4.5,r:1.45,pylon:true},{x:0,y:5.4,zF:-14,zR:-21,r:1.45}],
      panes:{z:21,k:1.2},lip:[.85,.1,.1]
    };
    DRESS.a350={
      fus:F([{z:27,r:.15},{z:24.5,r:1.4},{z:21,r:2.3},{z:15,r:2.75},{z:-12,r:2.75},{z:-22,r:2.1,yo:.5},{z:-27,r:.9,yo:1.2},{z:-29,r:.2,yo:1.6}]).map(p=>({...p,h:1.03})),
      wing:[{s:2.8,y:-1.3,zLE:3,c:9},{s:14,y:-.3,zLE:-4,c:5.2},{s:25,y:1.8,zLE:-11,c:3},{s:32,y:3,zLE:-14,c:1.6}],fin:{top:10.5,zLE:-26.5,c:2.5},
      windows:{z0:20,z1:-18,step:.82,y:.85,w:.24,h:.3},
      stripes:[[-.7,-.2,[.05,.12,.3]],[-.15,-.05,[.0,.7,.85]]],stripeZ:[21,-20],
      finColor:[.05,.12,.3],engines:[{x:9.2,y:-2.6,zF:4.75,zR:-2.75,r:1.5,pylon:true},{x:-9.2,y:-2.6,zF:4.75,zR:-2.75,r:1.5,pylon:true}],
      panes:{z:24.2,k:1.2},winglet:{h:2.4,c0:1.6,c1:.6},lip:[.0,.7,.85]
    };
    DRESS.b727={
      fus:F([{z:19,r:.1},{z:17,r:.85},{z:14,r:1.2},{z:6,r:1.3},{z:-6,r:1.3},{z:-13,r:.95,yo:.35},{z:-17.5,r:.4,yo:.9},{z:-19,r:.1,yo:1.1}]),
      wing:[{s:1.6,y:-.6,zLE:2,c:4.8},{s:7.5,y:-.3,zLE:0,c:3.6},{s:15,y:0,zLE:-2.5,c:1.7}],fin:{top:8.3,zLE:-17,c:1.9},
      windows:{z0:13,z1:-11,step:.78,y:.4,w:.2,h:.26},
      stripes:[[-.4,-.1,[.05,.3,.6]],[-.05,.05,[.15,.15,.18]]],stripeZ:[13.5,-12.5],
      finColor:[.05,.3,.6],engines:[{x:2.4,y:.6,zF:-9.1,zR:-13.3,r:.9,pylon:'fus'},{x:-2.4,y:.6,zF:-9.1,zR:-13.3,r:.9,pylon:'fus'},{x:0,y:3.0,zF:-14.9,zR:-18.5,r:.85}],
      panes:{z:16.4,k:.85},lip:[.05,.3,.6]
    };
    DRESS.b767={
      fus:F([{z:24,r:.15},{z:21.5,r:1.3},{z:18,r:2.0},{z:12,r:2.35},{z:-12,r:2.35},{z:-20,r:1.9,yo:.4},{z:-24,r:.85,yo:1.1},{z:-25.5,r:.15,yo:1.5}]),
      wing:[{s:2.2,y:-1.0,zLE:3.5,c:7.5},{s:11,y:-.2,zLE:-2,c:5},{s:23,y:1.3,zLE:-9,c:2.1}],fin:{top:10.2,zLE:-24,c:2.2},
      windows:{z0:17.5,z1:-15,step:.84,y:.78,w:.24,h:.3},
      stripes:[[-.6,-.15,[.0,.3,.55]],[-.1,0,[.9,.75,.1]]],stripeZ:[18.5,-16.5],
      finColor:[.0,.3,.55],engines:[{x:7.6,y:-2.3,zF:3.25,zR:-3.25,r:1.35,pylon:true},{x:-7.6,y:-2.3,zF:3.25,zR:-3.25,r:1.35,pylon:true}],
      panes:{z:21,k:1.1},lip:[.9,.75,.1]
    };
  })();

  (function(){
    const F=(arr)=>arr.map(p=>({w:1,h:1,yo:0,...p}));
    DRESS.dc3={
      fus:F([{z:10,r:.1},{z:9.2,r:.55},{z:7.5,r:.9},{z:4,r:1.02},{z:-3,r:.95},{z:-7,r:.6,yo:.25},{z:-9.3,r:.3,yo:.45},{z:-9.8,r:.08,yo:.5}]),
      wing:[{s:1.2,y:-.55,zLE:2.2,c:4.2},{s:5.5,y:-.35,zLE:1.7,c:3.4},{s:14.5,y:.15,zLE:.9,c:1.6}],fin:{top:4.6,zLE:-8.2,c:1.5},
      windows:{z0:5.5,z1:-5.5,step:.75,y:.3,w:.2,h:.24},
      stripes:[[-.3,-.05,[.75,.1,.1]]],stripeZ:[8.5,-6],
      finColor:[.75,.1,.1],engines:[{x:5.3,y:-.2,zF:4.0,zR:-2.6,r:.58,prop:{n:3,len:1.85,w:.22,z:4.4}},{x:-5.3,y:-.2,zF:4.0,zR:-2.6,r:.58,prop:{n:3,len:1.85,w:.22,z:4.4}}],
      panes:{z:8.4,k:.6},lip:[.75,.1,.1]
    };
    DRESS.dc8={
      fus:F([{z:28,r:.12},{z:26,r:1.0},{z:23,r:1.65},{z:18,r:1.9},{z:-14,r:1.9},{z:-21,r:1.5,yo:.4},{z:-26,r:.7,yo:1.0},{z:-28.5,r:.12,yo:1.3}]),
      wing:[{s:1.9,y:-1.1,zLE:4,c:8},{s:9,y:-.5,zLE:-1.5,c:5.5},{s:21.5,y:.4,zLE:-10,c:2.2}],fin:{top:8.5,zLE:-25,c:2.2},
      windows:{z0:22,z1:-19,step:.8,y:.55,w:.2,h:.26},
      stripes:[[-.5,-.15,[.75,.1,.1]],[-.1,0,[.1,.1,.15]]],stripeZ:[23,-20],
      finColor:[.75,.1,.1],engines:[{x:5.2,y:-2.1,zF:3.1,zR:-2.5,r:.75,pylon:true},{x:-5.2,y:-2.1,zF:3.1,zR:-2.5,r:.75,pylon:true},{x:11.2,y:-1.7,zF:1.0,zR:-4.6,r:.75,pylon:true},{x:-11.2,y:-1.7,zF:1.0,zR:-4.6,r:.75,pylon:true}],
      panes:{z:25,k:1.0},lip:[.75,.1,.1]
    };
    DRESS.f18={
      fus:F([{z:9.2,r:.06},{z:8.2,r:.28,h:.9},{z:6.2,r:.55,h:.85},{z:4.0,r:.8,h:.8},{z:1.5,r:1.0,h:.72},{z:-3,r:1.05,h:.7},{z:-7,r:.85,h:.65},{z:-9,r:.4,h:.6}]),
      wing:[{s:1,y:-.05,zLE:2,c:5.2},{s:6.15,y:.1,zLE:-2.2,c:1.9}],fin:{top:.5,zLE:-7.2,c:1.5}
    };
    DRESS.b747={
      fus:F([{z:30,r:.2},{z:28,r:1.5},{z:25,r:2.5},{z:19,r:3.0},{z:-18,r:3.0},{z:-25,r:2.2,yo:.6},{z:-29,r:1.0,yo:1.5},{z:-30.5,r:.2,yo:1.9}]),
      wing:[{s:3,y:-1.9,zLE:5,c:11},{s:12,y:-1.1,zLE:-3,c:7.5},{s:22,y:.2,zLE:-12,c:4},{s:30,y:1.6,zLE:-18,c:2}],fin:{top:13.5,zLE:-26,c:3.4},
      windows:{z0:24,z1:-22,step:.85,y:1.0,w:.24,h:.3},
      stripes:[[-.9,-.25,[.12,.2,.55]],[-.2,-.05,[.8,.1,.1]]],stripeZ:[27,-24],
      finColor:[.12,.2,.55],engines:[{x:10.5,y:-3.3,zF:3.25,zR:-4.25,r:1.4,pylon:true},{x:-10.5,y:-3.3,zF:3.25,zR:-4.25,r:1.4,pylon:true},{x:21,y:-2.4,zF:-6.4,zR:-13.4,r:1.4,pylon:true},{x:-21,y:-2.4,zF:-6.4,zR:-13.4,r:1.4,pylon:true}],
      winglet:{h:2.6,c0:1.8,c1:.6},lip:[.12,.2,.55]
    };
    DRESS.l1011={
      fus:F([{z:24,r:.15},{z:22,r:1.2},{z:19.5,r:2.0},{z:15,r:2.4},{z:-10,r:2.4},{z:-18,r:1.9,yo:.4},{z:-23,r:.9,yo:1.2},{z:-25,r:.15,yo:1.6}]),
      wing:[{s:2.5,y:-1.2,zLE:4,c:8},{s:12,y:-.4,zLE:-2,c:5.2},{s:23,y:.9,zLE:-9,c:2}],
      fin:{top:12,zLE:-23,c:2.5},
      windows:{z0:17.5,z1:-15,step:.85,y:.7,w:.24,h:.3},
      stripes:[[-.6,-.15,[.1,.25,.65]],[-.1,0,[.85,.1,.1]]],stripeZ:[18.5,-16.5],
      finColor:[.1,.25,.65],
      engines:[{x:7.8,y:-2.4,zF:2.5,zR:-4.5,r:1.4,pylon:true},{x:-7.8,y:-2.4,zF:2.5,zR:-4.5,r:1.4,pylon:true},{x:0,y:5.6,zF:-16.25,zR:-21.75,r:1.3}],
      panes:{z:21,k:1.1},lip:[.85,.1,.1]
    };
    DRESS.md83={
      fus:F([{z:22,r:.1},{z:20.5,r:.8},{z:18.5,r:1.2},{z:11,r:1.3},{z:-10,r:1.3},{z:-16,r:1.0,yo:.35},{z:-20.5,r:.4,yo:.9},{z:-22,r:.1,yo:1.1}]),
      wing:[{s:1.5,y:-.65,zLE:3,c:5},{s:7.5,y:-.3,zLE:.5,c:3.6},{s:16.3,y:.15,zLE:-3.5,c:1.5}],fin:{top:8.6,zLE:-20.3,c:2},
      windows:{z0:17,z1:-13.5,step:.78,y:.42,w:.2,h:.26},
      stripes:[[-.45,-.12,[.08,.18,.45]],[-.08,.04,[.85,.12,.12]]],stripeZ:[17.5,-15],
      finColor:[.08,.18,.45],engines:[{x:2.3,y:.6,zF:-10.2,zR:-15.8,r:.88,pylon:'fus'},{x:-2.3,y:.6,zF:-10.2,zR:-15.8,r:.88,pylon:'fus'}],
      panes:{z:19.6,k:.8},lip:[.85,.12,.12]
    };
    DRESS.crj9={
      fus:F([{z:18.5,r:.08},{z:17.2,r:.6},{z:15.5,r:.95},{z:10,r:1.05},{z:-9,r:1.05},{z:-14,r:.8,yo:.3},{z:-17.5,r:.3,yo:.75},{z:-18.6,r:.08,yo:.9}]),
      wing:[{s:1.2,y:-.55,zLE:2,c:4},{s:5.5,y:-.3,zLE:-.3,c:2.8},{s:12.2,y:.15,zLE:-3.6,c:1.2}],fin:{top:6.3,zLE:-17.6,c:1.7},
      windows:{z0:13.5,z1:-10.5,step:.72,y:.32,w:.18,h:.24},
      stripes:[[-.35,-.1,[.55,.05,.15]],[-.06,.03,[.2,.2,.24]]],stripeZ:[14.5,-12],
      finColor:[.55,.05,.15],engines:[{x:1.95,y:.55,zF:-8.8,zR:-12.8,r:.68,pylon:'fus'},{x:-1.95,y:.55,zF:-8.8,zR:-12.8,r:.68,pylon:'fus'}],
      panes:{z:16.3,k:.7},winglet:{h:1.3,c0:1.0,c1:.45},lip:[.55,.05,.15]
    };
    DRESS.dhc8={
      fus:F([{z:16.5,r:.08},{z:15.4,r:.7},{z:13.6,r:1.2},{z:9,r:1.35},{z:-6,r:1.35},{z:-11,r:1.05,yo:.35},{z:-15,r:.45,yo:.95},{z:-16.4,r:.1,yo:1.15}]),
      wing:[{s:1.3,y:1.5,zLE:2.3,c:2.9},{s:7,y:1.55,zLE:2.0,c:2.5},{s:14.1,y:1.6,zLE:1.3,c:1.2}],fin:{top:6.4,zLE:-15.2,c:1.9},
      windows:{z0:10.5,z1:-8.5,step:.85,y:.4,w:.2,h:.26},
      stripes:[[-.4,-.1,[.0,.42,.32]],[-.06,.04,[.95,.8,.15]]],stripeZ:[12,-10],
      finColor:[.0,.42,.32],engines:[{x:4.2,y:1.05,zF:3.1,zR:-3.5,r:.62,prop:{n:6,len:2.05,w:.2,z:3.5}},{x:-4.2,y:1.05,zF:3.1,zR:-3.5,r:.62,prop:{n:6,len:2.05,w:.2,z:3.5}}],
      panes:{z:14.4,k:.75},lip:[.0,.42,.32]
    };
    DRESS.a320={
      fus:F([{z:15.5,r:.1},{z:14.2,r:.8},{z:12.3,r:1.35},{z:8,r:1.55},{z:-6,r:1.55},{z:-11,r:1.15,yo:.35},{z:-14.5,r:.45,yo:.9},{z:-15.6,r:.12,yo:1.1}]),
      wing:[{s:1.5,y:-.9,zLE:2.6,c:5.2},{s:5.5,y:-.6,zLE:.6,c:3.6},{s:14.7,y:-.05,zLE:-4,c:1.3}],fin:{top:7.5,zLE:-14.3,c:1.9},
      windows:{z0:10,z1:-9.5,step:.78,y:.5,w:.2,h:.27},
      stripes:[[-.55,-.2,[.12,.2,.5]],[-.12,.0,[.0,.65,.85]]],stripeZ:[11,-11],
      finColor:[.12,.2,.5],engines:[{x:4.8,y:-1.7,zF:3.7,zR:-.5,r:.95,pylon:true},{x:-4.8,y:-1.7,zF:3.7,zR:-.5,r:.95,pylon:true}],
      panes:{z:12.9,k:.85},winglet:{h:1.6,c0:1.2,c1:.4},lip:[.0,.65,.85]
    };
    DRESS.b777={
      fus:F([{z:30,r:.15},{z:27.5,r:1.4},{z:24,r:2.3},{z:18,r:2.55},{z:-14,r:2.55},{z:-23,r:1.95,yo:.5},{z:-28.5,r:.8,yo:1.3},{z:-30.5,r:.2,yo:1.7}]),
      wing:[{s:2.6,y:-1.5,zLE:4.5,c:9.5},{s:13,y:-.6,zLE:-3,c:5.5},{s:26.5,y:1.4,zLE:-13,c:1.6}],fin:{top:11,zLE:-28,c:2.6},
      windows:{z0:22,z1:-20,step:.85,y:.85,w:.24,h:.32},
      stripes:[[-.8,-.25,[.05,.2,.45]],[-.18,-.04,[.75,.75,.78]]],stripeZ:[23,-21],
      finColor:[.05,.2,.45],engines:[{x:8.8,y:-2.9,zF:5.25,zR:-2.25,r:1.75,pylon:true},{x:-8.8,y:-2.9,zF:5.25,zR:-2.25,r:1.75,pylon:true}],
      panes:{z:26.6,k:1.25},lip:[.85,.85,.88]
    };
    DRESS.concorde={
      fus:F([{z:25.5,r:.04},{z:23,r:.42},{z:20,r:.9},{z:16,r:1.2},{z:-12,r:1.2},{z:-19,r:.95,yo:.15},{z:-23.5,r:.45,yo:.4},{z:-25,r:.1,yo:.5}]),
      wing:[{s:1.2,y:-.75,zLE:6,c:22},{s:4,y:-.75,zLE:1,c:16},{s:7.5,y:-.65,zLE:-6,c:8},{s:10.5,y:-.55,zLE:-11.5,c:2.5}],fin:{top:7.2,zLE:-22.5,c:2.2},
      windows:{z0:13,z1:-10,step:.9,y:.25,w:.14,h:.2},
      stripes:[[-.15,-.05,[.08,.12,.35]]],stripeZ:[15,-12],
      finColor:[.92,.92,.94],engines:[{x:2.5,y:-1.55,zF:-4.5,zR:-13.5,r:.6},{x:-2.5,y:-1.55,zF:-4.5,zR:-13.5,r:.6},{x:4.0,y:-1.55,zF:-4.5,zR:-13.5,r:.6},{x:-4.0,y:-1.55,zF:-4.5,zR:-13.5,r:.6}],
      panes:{z:18.4,k:.55},lip:[.3,.3,.32]
    };
    DRESS.a380={
      fus:F([{z:36,r:.2},{z:33,r:1.8},{z:28,r:2.9},{z:20,r:3.4},{z:-18,r:3.4},{z:-28,r:2.8,yo:.6},{z:-34,r:1.4,yo:1.6},{z:-36,r:.3,yo:2.0}]).map(p=>({...p,h:1.05})),
      wing:[{s:3.5,y:-1.8,zLE:5,c:12},{s:18,y:-.6,zLE:-4,c:7},{s:33,y:1.8,zLE:-14,c:4},{s:40,y:3.2,zLE:-19,c:2}],
      fin:{top:13.5,zLE:-34,c:3.2},
      windows:{z0:30,z1:-24,step:.9,y:1.2,w:.26,h:.32},
      stripes:[[-1.1,-.3,[.05,.15,.55]],[-.25,-.05,[.85,.1,.1]]],stripeZ:[32,-28],
      finColor:[.05,.15,.55],
      engines:[{x:14,y:-3.4,zF:3.5,zR:-5.5,r:1.7,pylon:true},{x:-14,y:-3.4,zF:3.5,zR:-5.5,r:1.7,pylon:true},{x:26,y:-2.4,zF:-7,zR:-15,r:1.7,pylon:true},{x:-26,y:-2.4,zF:-7,zR:-15,r:1.7,pylon:true}],
      winglet:{h:2.8,c0:2,c1:.7},
      panes:{z:32,k:1.4},lip:[.85,.1,.1]
    };
  })();
    function surfHW(st,z,y){
    for(let i=0;i<st.length-1;i++){
      const a=st[i],b=st[i+1],hi=Math.max(a.z,b.z),lo=Math.min(a.z,b.z);
      if(z<=hi&&z>=lo&&hi>lo){
        const t=(a.z-z)/(a.z-b.z),L=k=>a[k]*(1-t)+b[k]*t;
        const r=L('r'),w=L('w'),h=L('h'),yo=L('yo');
        const q=(y-yo)/(r*h);
        return {hw:r*w*Math.sqrt(Math.max(0,1-q*q)),r,w,h,yo};
      }
    }
    return null;
  }
  function dressModel(id,g){
    const D=DRESS[id];if(!D||!g)return;
    const sm=(n,c,o)=>{
      if(!(o&&(o.emis||o.alpha!==undefined))&&!/^(fan|dark)$/.test(n)){const p=new BABYLON.PBRMaterial('dr_'+id+'_'+n,scene);p.albedoColor=new BABYLON.Color3(c[0],c[1],c[2]);
        p.metallic=n==='metal'||n==='spin'?.85:.08;p.roughness=n==='glass'?.05:n==='metal'?.3:.32;p.clearCoat.isEnabled=n!=='metal';p.clearCoat.intensity=.7;p.clearCoat.roughness=.08;
        if(o&&o.dbl)p.backFaceCulling=false;return p;}
      const m=new BABYLON.StandardMaterial('dr_'+id+'_'+n,scene);m.diffuseColor=new BABYLON.Color3(c[0],c[1],c[2]);m.specularColor=new BABYLON.Color3(.25,.25,.25);m.specularPower=32;if(o&&o.emis){m.emissiveColor=new BABYLON.Color3(c[0],c[1],c[2]);m.disableLighting=true;}if(o&&o.alpha!==undefined)m.alpha=o.alpha;if(o&&o.dbl)m.backFaceCulling=false;return m;};
    const glassM=sm('glass',[.02,.04,.07]);glassM.specularColor=new BABYLON.Color3(.8,.85,.9);glassM.specularPower=64;
    const dark=sm('dark',[.12,.12,.14]),metal=sm('metal',[.55,.57,.6]);
    const put=(m,parent,x,y,z)=>{m.parent=parent||g;m.position.set(x,y,z);m.isPickable=false;return m;};
    if(D.windows){
      const W=D.windows,base=BABYLON.MeshBuilder.CreateBox(id+'_fusWin',{width:.05,height:W.h,depth:W.w*1.25},scene);
      base.material=glassM;base.parent=g;base.isPickable=false;
      for(let z=W.z0;z>=W.z1;z-=W.step){
        const sf=surfHW(D.fus,z,W.y);if(!sf||sf.hw<.2)continue;
        for(const sd of [-1,1])base.thinInstanceAdd(BABYLON.Matrix.Translation(sd*(sf.hw+.005),W.y,z),false);
      }
      base.thinInstanceBufferUpdated('matrix');base.alwaysSelectAsActiveMesh=true;
    }
    if(D.stripes){
      D.stripes.forEach((st,i)=>{
        const mat=sm('str'+i,st[2]);
        for(const sd of [-1,1]){
          const lo=[],hi=[];
          for(let z=D.stripeZ[0];z>=D.stripeZ[1];z-=.7){
            const a=surfHW(D.fus,z,st[0]),b=surfHW(D.fus,z,st[1]);if(!a||!b||a.hw<.05||b.hw<.05)continue;
            lo.push(new BABYLON.Vector3(sd*(a.hw+.012),st[0],z));hi.push(new BABYLON.Vector3(sd*(b.hw+.012),st[1],z));
          }
          if(lo.length<2)continue;
          const rb=BABYLON.MeshBuilder.CreateRibbon(id+'_fusStripe'+i+sd,{pathArray:[lo,hi],sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
          rb.material=mat;rb.parent=g;rb.isPickable=false;
        }
      });
    }
    if(D.finColor){const fm=g.getChildMeshes().find(m=>m.name===id+'_fin'||m.name==='c172_fin');if(fm)fm.material=sm('fin',D.finColor);}
    if(D.panes){
      const k=D.panes.k;
      for(const phi of [-.95,-.32,.32,.95]){
        const f=surfHW(D.fus,D.panes.z,0);if(!f)continue;
        const pane=BABYLON.MeshBuilder.CreateBox(id+'_fusPane',{width:.42*k,height:.035,depth:.55*k},scene);
        pane.material=glassM;
        put(pane,g,Math.sin(phi)*(f.r*f.w+.012),f.yo+Math.cos(phi)*(f.r*f.h+.012),D.panes.z);
        pane.rotation.z=-phi;
      }
    }
    (D.engines||[]).forEach((e,i)=>{
      const fan=BABYLON.MeshBuilder.CreateDisc(id+'_engFan'+i,{radius:e.r*.92,tessellation:28},scene);
      fan.material=e.prop?dark:sm('fan',[.18,.18,.2]);fan.rotation.y=Math.PI;fan.material.backFaceCulling=false;put(fan,g,e.x,e.y,e.zF+.02);
      if(!e.prop){
        const rot=new BABYLON.TransformNode(id+'_fanRot'+i,scene);rot.parent=g;rot.position.set(e.x,e.y,e.zF+.05);
        const bl=BABYLON.MeshBuilder.CreateBox(id+'_fanBl'+i,{width:e.r*.16,height:e.r*.82,depth:.04},scene);
        bl.material=metal;bl.parent=rot;bl.isPickable=false;
        const NB=18;for(let b=0;b<NB;b++){const a=b*Math.PI*2/NB;bl.thinInstanceAdd(BABYLON.Matrix.Compose(new BABYLON.Vector3(1,1,1),BABYLON.Quaternion.RotationYawPitchRoll(.45,0,a),new BABYLON.Vector3(-Math.sin(a)*e.r*.5,Math.cos(a)*e.r*.5,0)),b===NB-1);}
        (g._fans=g._fans||[]).push(rot);
        const hub=BABYLON.MeshBuilder.CreateCylinder(id+'_engHub'+i,{diameterTop:0,diameterBottom:e.r*.5,height:e.r*.55,tessellation:14},scene);
        hub.material=metal;hub.rotation.x=Math.PI/2;put(hub,g,e.x,e.y,e.zF+e.r*.25);
      }
      const lip=BABYLON.MeshBuilder.CreateTorus(id+'_engLip'+i,{diameter:e.r*1.94,thickness:.07,tessellation:28},scene);
      lip.material=sm('lip',D.lip||[.8,.8,.85]);lip.rotation.x=Math.PI/2;put(lip,g,e.x,e.y,e.zF-.03);
      const ex=BABYLON.MeshBuilder.CreateDisc(id+'_engEx'+i,{radius:e.r*.5,tessellation:20},scene);
      ex.material=dark;ex.material.backFaceCulling=false;put(ex,g,e.x,e.y,e.zR-.02);
      if(e.pylon===true){
        let wy=0;const sg=D.wing;for(let q=0;q<sg.length-1;q++){if(Math.abs(e.x)>=sg[q].s&&Math.abs(e.x)<=sg[q+1].s){const t=(Math.abs(e.x)-sg[q].s)/(sg[q+1].s-sg[q].s);wy=sg[q].y*(1-t)+sg[q+1].y*t;}}
        const top=wy+.1,bot=e.y+e.r*.55,hh=Math.max(.3,top-bot);
        const py=BABYLON.MeshBuilder.CreateBox(id+'_engPyl'+i,{width:.28,height:hh,depth:(e.zF-e.zR)*.55},scene);
        py.material=sm('pyl',[.93,.94,.96]);put(py,g,e.x,bot+hh/2,(e.zF+e.zR)/2+.8);
      } else if(e.pylon==='fus'){
        const py=BABYLON.MeshBuilder.CreateBox(id+'_engPyl'+i,{width:Math.abs(e.x)-1,height:.5,depth:2.6},scene);
        py.material=sm('pyl',[.93,.94,.96]);put(py,g,Math.sign(e.x)*(Math.abs(e.x)+1)/2*.92,e.y,(e.zF+e.zR)/2+.4);
      }
      if(e.prop){
        const P=e.prop,disc=BABYLON.MeshBuilder.CreateDisc(id+'_prop'+i,{radius:P.len,tessellation:28},scene);
        disc.material=sm('blur',[.1,.1,.12],{alpha:.14,dbl:true});put(disc,g,e.x,e.y,P.z);
        const sp=BABYLON.MeshBuilder.CreateCylinder(id+'_propSp'+i,{diameterTop:0,diameterBottom:.45,height:.55,tessellation:14},scene);
        sp.material=sm('spin',D.lip||[.9,.9,.9]);sp.rotation.x=Math.PI/2;sp.parent=disc;sp.position.set(0,0,-.2);sp.isPickable=false;
        for(let b=0;b<P.n;b++){
          const bl=BABYLON.MeshBuilder.CreateBox(id+'_propBl'+i+b,{width:P.w,height:P.len*.92,depth:.03},scene);
          bl.material=dark;bl.parent=disc;bl.isPickable=false;
          const a=b*Math.PI*2/P.n;bl.rotation.z=a;bl.position.set(-Math.sin(a)*P.len*.46,Math.cos(a)*P.len*.46,0);
        }
        (g._spin=g._spin||[]).push(disc);
        const old=g._props&&g._props[i];if(old)old.setEnabled(false);
      }
    });
    if((id==='cessna'||id==='cirrus')&&g._prop){
      const disc=g._prop,B=D.blades,pn=id==='cessna'?'c172':id;disc.material=sm('blur',[.1,.1,.12],{alpha:.14,dbl:true});
      for(let b=0;b<B.n;b++){
        const bl=BABYLON.MeshBuilder.CreateBox(pn+'_prop_bl'+b,{width:B.w,height:B.len*.92,depth:.03},scene);
        bl.material=dark;bl.parent=disc;bl.isPickable=false;
        const a=b*Math.PI*2/B.n;bl.rotation.z=a;bl.position.set(-Math.sin(a)*B.len*.46,Math.cos(a)*B.len*.46,0);
      }
      const sp=g.getChildMeshes().find(m=>m.name===pn+'_spin');if(sp)sp.material=sm('spin',D.spin);
      (g._spin=g._spin||[]).push(disc);
    }
    const tip=D.wing[D.wing.length-1];
    if(D.winglet){
      const W=D.winglet;
      for(const sd of [-1,1]){
        const wl=vert(id+'_wlet'+sd,[{s:0,c:W.c0,t:.08,zLE:tip.zLE},{s:W.h,c:W.c1,t:.05,zLE:tip.zLE-(W.c0-W.c1)-.6}],MAT.white,g);
        wl.position.set(sd*tip.s,tip.y,0);
      }
    }
    const lightMat=(c)=>sm('nav',c,{emis:true});
    const mkL=(n,c,x,y,z)=>{const m=BABYLON.MeshBuilder.CreateSphere(id+'_nav'+n,{diameter:Math.max(.22,tip.s*.012)},scene);m.material=lightMat(c);put(m,g,x,y,z);return m;};
    const ty=tip.y+(D.winglet?D.winglet.h:0)+.05,tz=tip.zLE-tip.c*.5;
    const navLeft=mkL('L',[1,.05,.05],-tip.s,ty,tz),navRight=mkL('R',[.05,1,.1],tip.s,ty,tz);
    (g._navLights=g._navLights||[]).push(navLeft,navRight);
    const strobeA=mkL('SA',[1,1,1],tip.s*.98,ty,tz-.3),strobeB=mkL('SB',[1,1,1],-tip.s*.98,ty,tz-.3);
    const tail=mkL('T',[1,1,1],0,D.fin.top+.1,D.fin.zLE-D.fin.c);
    (g._strobes=g._strobes||[]).push(strobeA,strobeB,tail);
    const mid=D.fus.reduce((a,b)=>b.r>a.r?b:a,D.fus[0]);
    for(const sy of [1,-1]){const b=BABYLON.MeshBuilder.CreateSphere(id+'_beacon'+sy,{diameter:.3,segments:8},scene);b.material=lightMat([1,.08,.03]);
      put(b,g,0,mid.yo+sy*(mid.r*(mid.h||1)+.08),mid.z*.3);(g._beacons=g._beacons||[]).push(b);}
  }
  (function(){
    scene.registerBeforeRender(()=>{
      const g=window._modelRoots[window._activeModelId];if(!g||!g.metadata)return;
      const dt=Math.min(.1,scene.getEngine().getDeltaTime()/1000);
      try{
        const gg=g.metadata.gearGroup;if(gg&&!g.metadata.fixed)gg.setEnabled(plane.gearPos>.5);
        if(g._spin&&ENG.L.state==='RUNNING'){const r=(25+plane.throttle*70)*dt;g._spin.forEach(d=>d.rotation.z+=r);}
        if(g._navLights)g._navLights.forEach(m=>m.setEnabled(window._navOn!==false));
        if(g._strobes){const on=window._strobeOn!==false&&(Math.floor(performance.now()/450)%3)===0;g._strobes.forEach((m,i)=>m.setEnabled(i<2?on:window._strobeOn!==false));}
        if(g._beacons){const on=AIRSYS.lights.beacon&&(performance.now()%1100)<160;g._beacons.forEach(m=>m.setEnabled(on));}
        if(g._fans&&ENG.L.state==='RUNNING'){const r=(18+plane.throttle*60)*dt;g._fans.forEach(f=>f.rotation.z+=r);}
      }catch(e){}
    });
  })();

  function buildJet(id,sp){
    const g=new BABYLON.TransformNode('ac_'+id,scene);g.parent=aircraftRoot;
    tubeSmooth(id+'_fus',sp.fus,MAT.white,g);
    horiz(id+'_wR',sp.wing,MAT.white,g);
    horiz(id+'_wL',sp.wing.map(st=>({...st,s:-st.s})),MAT.white,g);
    vert(id+'_fin',sp.fin,MAT.white,g);
    horiz(id+'_hR',sp.htail,MAT.white,g);
    horiz(id+'_hL',sp.htail.map(st=>({...st,s:-st.s})),MAT.white,g);
    const nac=(name,x,y,z,r,len)=>{
      tubeSmooth(name,[
        {z:len*.5,r:r*.55,w:1,h:1,yo:0,flat:.1},
        {z:len*.4,r:r,w:1,h:1,yo:0,flat:.1},
        {z:-len*.2,r:r,w:1,h:1,yo:0,flat:.1},
        {z:-len*.5,r:r*.6,w:1,h:1,yo:0,flat:.1}
      ],MAT.white,g).position.set(x,y,z);
    };
    (sp.engines||[]).forEach((e,i)=>nac(id+'_eng'+i,e.x,e.y,e.z,e.r,e.len));
    box(g,id+'_ws',sp.ws[0],sp.ws[1],.2,MAT.glass,[0,sp.ws[2],sp.ws[3]]);
    const gear=new BABYLON.TransformNode(id+'_gear',scene);gear.parent=g;
    for(const [x,z] of sp.gear){
      cyl(gear,id+'_strut',.09,.09,sp.gh*.8,MAT.gear,[x,-sp.gh*.4-.2,z]);
      cyl(gear,id+'_wheel',.8,.8,.28,MAT.dark,[x,-sp.gh,z],[0,0,Math.PI/2]);
    }
    g.metadata={gearGroup:gear,fixed:false};
    return g;
  }
  function buildDC9Model(){return buildJet('dc9',{fus:[{z:17,r:.1},{z:15.5,r:.8},{z:13.5,r:1.15},{z:6,r:1.25},{z:-6,r:1.25},{z:-12,r:.95,yo:.35},{z:-16,r:.4,yo:.9},{z:-17.5,r:.1,yo:1.1}].map(p=>({w:1,h:1,yo:0,flat:.15,...p})),wing:[{s:1.5,c:4.5,t:.13,zLE:2,y:-.6},{s:7,c:3.4,t:.11,zLE:0,y:-.3},{s:14,c:1.6,t:.1,zLE:-2.5,y:0}],fin:[{s:1.5,c:5,t:.14,zLE:-11},{s:5,c:3.5,t:.12,zLE:-13.5},{s:8,c:1.8,t:.1,zLE:-16}],htail:[{s:.2,c:2.8,t:.12,zLE:-14.5,y:8},{s:4.5,c:1.6,t:.1,zLE:-16.5,y:8}],engines:[{x:2.2,y:.6,z:-10,r:.85,len:4.6},{x:-2.2,y:.6,z:-10,r:.85,len:4.6}],ws:[1.2,.8,.7,14.8],gear:[[0,14],[-2.3,-1],[2.3,-1]],gh:1.9});}
  function buildDC10Model(){return buildJet('dc10',{fus:[{z:24,r:.15},{z:21.5,r:1.3},{z:19,r:2.1},{z:14,r:2.55},{z:-10,r:2.55},{z:-18,r:2.0,yo:.4},{z:-23,r:.9,yo:1.2},{z:-25,r:.15,yo:1.6}].map(p=>({w:1,h:1,yo:0,flat:.12,...p})),wing:[{s:2.5,c:8,t:.13,zLE:4,y:-1.2},{s:13,c:5,t:.11,zLE:-2,y:-.4},{s:25,c:2,t:.1,zLE:-9,y:.9}],fin:[{s:2.6,c:8,t:.14,zLE:-17},{s:8,c:5,t:.12,zLE:-20.5},{s:12.5,c:2.5,t:.1,zLE:-23}],htail:[{s:.3,c:4.5,t:.12,zLE:-20,y:1.6},{s:7,c:2.6,t:.1,zLE:-24,y:2.2}],engines:[{x:8,y:-2.4,z:-1,r:1.45,len:7},{x:-8,y:-2.4,z:-1,r:1.45,len:7},{x:0,y:5.4,z:-17.5,r:1.45,len:7}],ws:[1.6,1,1.3,21.2],gear:[[0,20.5],[-3.2,-3],[3.2,-3],[-1.1,-7],[1.1,-7]],gh:3.4});}
  function buildA350Model(){return buildJet('a350',{fus:[{z:27,r:.15},{z:24.5,r:1.4},{z:21,r:2.3},{z:15,r:2.75},{z:-12,r:2.75},{z:-22,r:2.1,yo:.5},{z:-27,r:.9,yo:1.2},{z:-29,r:.2,yo:1.6}].map(p=>({w:1,h:1.03,yo:0,flat:.12,...p})),wing:[{s:2.8,c:9,t:.13,zLE:3,y:-1.3},{s:14,c:5.2,t:.11,zLE:-4,y:-.3},{s:25,c:3,t:.1,zLE:-11,y:1.8},{s:32,c:1.6,t:.08,zLE:-14,y:3}],fin:[{s:2.8,c:8,t:.14,zLE:-21},{s:7,c:5,t:.12,zLE:-24},{s:10.5,c:2.5,t:.1,zLE:-26.5}],htail:[{s:.3,c:5,t:.12,zLE:-23,y:1.8},{s:8,c:2.6,t:.1,zLE:-27.5,y:2.6}],engines:[{x:9.2,y:-2.6,z:1,r:1.5,len:7.5},{x:-9.2,y:-2.6,z:1,r:1.5,len:7.5}],ws:[1.7,1,1.4,24],gear:[[0,23],[-3.6,-4],[3.6,-4],[-3.6,-7],[3.6,-7]],gh:3.6});}
  function buildB727Model(){return buildJet('b727',{fus:[{z:19,r:.1},{z:17,r:.85},{z:14,r:1.2},{z:6,r:1.3},{z:-6,r:1.3},{z:-13,r:.95,yo:.35},{z:-17.5,r:.4,yo:.9},{z:-19,r:.1,yo:1.1}].map(p=>({w:1,h:1,yo:0,flat:.15,...p})),wing:[{s:1.6,c:4.8,t:.13,zLE:2,y:-.6},{s:7.5,c:3.6,t:.11,zLE:0,y:-.3},{s:15,c:1.7,t:.1,zLE:-2.5,y:0}],fin:[{s:1.6,c:5.2,t:.14,zLE:-12},{s:5.2,c:3.6,t:.12,zLE:-14.5},{s:8.3,c:1.9,t:.1,zLE:-17}],htail:[{s:.2,c:2.9,t:.12,zLE:-15.8,y:8.3},{s:4.7,c:1.7,t:.1,zLE:-17.8,y:8.3}],engines:[{x:2.4,y:.6,z:-11,r:.9,len:4.8},{x:-2.4,y:.6,z:-11,r:.9,len:4.8},{x:0,y:3.0,z:-16.5,r:.85,len:4.4}],ws:[1.2,.8,.7,16.5],gear:[[0,15.5],[-2.5,-1],[2.5,-1]],gh:2.0});}
  function buildB767Model(){return buildJet('b767',{fus:[{z:24,r:.15},{z:21.5,r:1.3},{z:18,r:2.0},{z:12,r:2.35},{z:-12,r:2.35},{z:-20,r:1.9,yo:.4},{z:-24,r:.85,yo:1.1},{z:-25.5,r:.15,yo:1.5}].map(p=>({w:1,h:1,yo:0,flat:.12,...p})),wing:[{s:2.2,c:7.5,t:.13,zLE:3.5,y:-1.0},{s:11,c:5,t:.11,zLE:-2,y:-.2},{s:23,c:2.1,t:.09,zLE:-9,y:1.3}],fin:[{s:2.2,c:7.5,t:.14,zLE:-18},{s:6.8,c:4.6,t:.12,zLE:-21.5},{s:10.2,c:2.2,t:.1,zLE:-24}],htail:[{s:.3,c:4.2,t:.12,zLE:-21,y:1.5},{s:6.6,c:2.3,t:.1,zLE:-25,y:2.0}],engines:[{x:7.6,y:-2.3,z:0,r:1.35,len:6.5},{x:-7.6,y:-2.3,z:0,r:1.35,len:6.5}],ws:[1.6,1,1.3,19.5],gear:[[0,19],[-3.0,-3],[3.0,-3]],gh:3.3});}
  function buildDC3Model(){const g=new BABYLON.TransformNode('ac_dc3',scene);g.parent=aircraftRoot;const sv=MAT.white.clone('ac_dc3silver');sv.albedoColor=new BABYLON.Color3(.78,.8,.83);sv.metallic=.6;
    tubeSmooth('dc3_fus',[{z:10,r:.1},{z:9.2,r:.55},{z:7.5,r:.9},{z:4,r:1.02},{z:-3,r:.95},{z:-7,r:.6,yo:.25},{z:-9.3,r:.3,yo:.45},{z:-9.8,r:.08,yo:.5}].map(p=>({w:1,h:1,yo:0,flat:.12,...p})),sv,g);
    const wing=[{s:1.2,c:4.2,t:.15,zLE:2.2,y:-.55},{s:5.5,c:3.4,t:.13,zLE:1.7,y:-.35},{s:14.5,c:1.6,t:.1,zLE:.9,y:.15}];
    horiz('dc3_wR',wing,sv,g);horiz('dc3_wL',wing.map(st=>({...st,s:-st.s})),sv,g);
    vert('dc3_fin',[{s:.5,c:3.4,t:.14,zLE:-6.0},{s:3.0,c:2.4,t:.12,zLE:-7.0},{s:4.6,c:1.5,t:.1,zLE:-8.2}],sv,g);
    const ht=[{s:.2,c:2.6,t:.1,zLE:-7.3,y:.6},{s:4.6,c:1.4,t:.08,zLE:-8.7,y:.6}];
    horiz('dc3_hR',ht,sv,g);horiz('dc3_hL',ht.map(st=>({...st,s:-st.s})),sv,g);
    g._props=[];
    for(const side of [1,-1]){tubeSmooth('dc3_nac'+side,[{z:4.2,r:.12},{z:3.9,r:.55},{z:2.5,r:.62},{z:-1.5,r:.5},{z:-3.0,r:.2}].map(p=>({w:1,h:1,yo:0,flat:.1,...p})),sv,g).position.set(side*5.3,-.2,0);
      const prop=BABYLON.MeshBuilder.CreateDisc('dc3_prop'+side,{radius:1.85,tessellation:20},scene);
      prop.position.set(side*5.3,-.2,4.4);prop.material=MAT.dark;prop.parent=g;prop.isPickable=false;g._props.push(prop);}
    box(g,'dc3_ws',1.3,.55,.2,MAT.glass,[0,.5,8.1]);
    const gh=2.2,gear=new BABYLON.TransformNode('dc3_gear',scene);gear.parent=g;
    for(const x of [-4.2,4.2]){cyl(gear,'dc3_strut',.12,.12,gh-.6,MAT.gear,[x,-(gh+.6)/2,1.4]);cyl(gear,'dc3_wheel',1.0,1.0,.32,MAT.dark,[x,-gh,1.4],[0,0,Math.PI/2]);}
    cyl(gear,'dc3_strut',.07,.07,gh-.1,MAT.gear,[0,-(gh+.1)/2,-8.2]);cyl(gear,'dc3_wheel',.4,.4,.14,MAT.dark,[0,-gh,-8.2],[0,0,Math.PI/2]);
    g.metadata={gearGroup:gear,fixed:false};return g;}
  function buildF18Model(){const g=new BABYLON.TransformNode('ac_f18',scene);g.parent=aircraftRoot;const gm=MAT.white.clone('ac_f18grey');gm.albedoColor=new BABYLON.Color3(.42,.45,.5);
    tubeSmooth('f18_fus',[{z:9.2,r:.06},{z:8.2,r:.28,h:.9},{z:6.2,r:.55,h:.85},{z:4.0,r:.8,h:.8},{z:1.5,r:1.0,h:.72},{z:-3,r:1.05,h:.7},{z:-7,r:.85,h:.65},{z:-9,r:.4,h:.6}].map(p=>({w:1,h:1,yo:0,flat:.15,...p})),gm,g);
    const wing=[{s:1.0,c:5.2,t:.08,zLE:2.0,y:-.05},{s:6.15,c:1.9,t:.06,zLE:-2.2,y:.1}];
    horiz('f18_wR',wing,gm,g);horiz('f18_wL',wing.map(st=>({...st,s:-st.s})),gm,g);
    const lex=[{s:.6,c:6.4,t:.05,zLE:6.2,y:.05},{s:1.9,c:3.0,t:.05,zLE:2.4,y:.02}];
    horiz('f18_lexR',lex,gm,g);horiz('f18_lexL',lex.map(st=>({...st,s:-st.s})),gm,g);
    const stab=[{s:.9,c:2.8,t:.05,zLE:-6.0,y:-.25},{s:3.6,c:1.4,t:.04,zLE:-8.0,y:-.2}];
    horiz('f18_hR',stab,gm,g);horiz('f18_hL',stab.map(st=>({...st,s:-st.s})),gm,g);
    for(const side of [1,-1]){const f=vert('f18_fin'+side,[{s:0,c:3.2,t:.07,zLE:-3.0},{s:2.8,c:1.5,t:.05,zLE:-5.8}],gm,g);f.position.set(side*1.0,.4,0);f.rotation.z=-side*.38;
      box(g,'f18_int'+side,.55,.62,1.5,gm,[side*1.0,-.25,2.2]);box(g,'f18_intF'+side,.5,.56,.05,MAT.dark,[side*1.0,-.25,2.97]);
      cyl(g,'f18_ex'+side,.9,.75,1.5,MAT.dark,[side*.55,-.05,-9.4],[Math.PI/2,0,0]);cyl(g,'f18_aam'+side,.18,.18,2.6,MAT.white,[side*6.25,.08,-.8],[Math.PI/2,0,0]);}
    const can=BABYLON.MeshBuilder.CreateSphere('f18_ws',{diameter:1,segments:12},scene);can.scaling.set(.85,.65,2.4);can.position.set(0,.6,5.0);can.material=MAT.glass;can.parent=g;can.isPickable=false;
    const gh=1.9,gear=new BABYLON.TransformNode('f18_gear',scene);gear.parent=g;
    for(const [x,z] of [[0,5.5],[-1.5,-1.2],[1.5,-1.2]]){cyl(gear,'f18_strut',.1,.1,gh-.5,MAT.gear,[x,-(gh+.5)/2,z]);cyl(gear,'f18_wheel',.55,.55,.22,MAT.dark,[x,-gh,z],[0,0,Math.PI/2]);}
    g.metadata={gearGroup:gear,fixed:false};return g;}
  function buildDC8Model(){return buildJet('dc8',{fus:[{z:28,r:.12},{z:26,r:1.0},{z:23,r:1.65},{z:18,r:1.9},{z:-14,r:1.9},{z:-21,r:1.5,yo:.4},{z:-26,r:.7,yo:1.0},{z:-28.5,r:.12,yo:1.3}].map(p=>({w:1,h:1,yo:0,flat:.14,...p})),wing:[{s:1.9,c:8,t:.12,zLE:4,y:-1.1},{s:9,c:5.5,t:.11,zLE:-1.5,y:-.5},{s:21.5,c:2.2,t:.1,zLE:-10,y:.4}],fin:[{s:1.9,c:7,t:.14,zLE:-19},{s:5,c:4.5,t:.12,zLE:-22},{s:8.5,c:2.2,t:.1,zLE:-25}],htail:[{s:.3,c:4,t:.12,zLE:-21.5,y:1.2},{s:7,c:2.2,t:.1,zLE:-26,y:1.6}],engines:[{x:5.2,y:-2.1,z:.3,r:.75,len:5.6},{x:-5.2,y:-2.1,z:.3,r:.75,len:5.6},{x:11.2,y:-1.7,z:-1.8,r:.75,len:5.6},{x:-11.2,y:-1.7,z:-1.8,r:.75,len:5.6}],ws:[1.5,.9,.9,25.2],gear:[[0,24],[-3.0,-2],[3.0,-2],[-1.2,-5],[1.2,-5]],gh:3.2});}
  function buildB747Model(){const g=buildJet('b747',{fus:[{z:30,r:.2},{z:28,r:1.5},{z:25,r:2.5},{z:19,r:3.0},{z:-18,r:3.0},{z:-25,r:2.2,yo:.6},{z:-29,r:1.0,yo:1.5},{z:-30.5,r:.2,yo:1.9}].map(p=>({w:1,h:1,yo:0,flat:.12,...p})),wing:[{s:3,c:11,t:.13,zLE:5,y:-1.9},{s:12,c:7.5,t:.11,zLE:-3,y:-1.1},{s:22,c:4,t:.1,zLE:-12,y:.2},{s:30,c:2,t:.08,zLE:-18,y:1.6}],fin:[{s:3,c:10,t:.14,zLE:-17},{s:8,c:7,t:.12,zLE:-21.5},{s:13.5,c:3.4,t:.1,zLE:-26}],htail:[{s:.3,c:6,t:.12,zLE:-22,y:1.8},{s:10,c:3,t:.1,zLE:-28,y:2.8}],engines:[{x:10.5,y:-3.3,z:-.5,r:1.4,len:7.5},{x:-10.5,y:-3.3,z:-.5,r:1.4,len:7.5},{x:21,y:-2.4,z:-9.9,r:1.4,len:7},{x:-21,y:-2.4,z:-9.9,r:1.4,len:7}],ws:[1.8,.9,3.0,28.2],gear:[[0,26],[-4.2,-2],[4.2,-2],[-5.4,-4.5],[5.4,-4.5],[-1.6,-6],[1.6,-6]],gh:5.0});
    tubeSmooth('b747_fusHump',[{z:29.5,r:.15,yo:2.6},{z:28,r:1.0,yo:2.7},{z:25,r:1.5,yo:2.6},{z:15,r:1.62,yo:2.5},{z:7,r:1.45,yo:2.2},{z:-2,r:.6,yo:2.0}].map(p=>({w:1,h:1,flat:.1,...p})),MAT.white,g);return g;}
  function buildMD83Model(){return buildJet('md83',{fus:[{z:22,r:.1},{z:20.5,r:.8},{z:18.5,r:1.2},{z:11,r:1.3},{z:-10,r:1.3},{z:-16,r:1.0,yo:.35},{z:-20.5,r:.4,yo:.9},{z:-22,r:.1,yo:1.1}].map(p=>({w:1,h:1,yo:0,flat:.15,...p})),wing:[{s:1.5,c:5,t:.13,zLE:3,y:-.65},{s:7.5,c:3.6,t:.11,zLE:.5,y:-.3},{s:16.3,c:1.5,t:.1,zLE:-3.5,y:.15}],fin:[{s:1.5,c:5.5,t:.14,zLE:-15},{s:5.5,c:3.8,t:.12,zLE:-17.8},{s:8.6,c:2,t:.1,zLE:-20.3}],htail:[{s:.2,c:3,t:.12,zLE:-19,y:8.6},{s:5.5,c:1.6,t:.1,zLE:-21.3,y:8.6}],engines:[{x:2.3,y:.6,z:-13,r:.88,len:5.6},{x:-2.3,y:.6,z:-13,r:.88,len:5.6}],ws:[1.25,.8,.7,19.8],gear:[[0,18.5],[-2.5,0],[2.5,0]],gh:1.9});}
  function buildCRJ9Model(){return buildJet('crj9',{fus:[{z:18.5,r:.08},{z:17.2,r:.6},{z:15.5,r:.95},{z:10,r:1.05},{z:-9,r:1.05},{z:-14,r:.8,yo:.3},{z:-17.5,r:.3,yo:.75},{z:-18.6,r:.08,yo:.9}].map(p=>({w:1,h:1,yo:0,flat:.12,...p})),wing:[{s:1.2,c:4,t:.13,zLE:2,y:-.55},{s:5.5,c:2.8,t:.11,zLE:-.3,y:-.3},{s:12.2,c:1.2,t:.09,zLE:-3.6,y:.15}],fin:[{s:1.1,c:4.5,t:.14,zLE:-12.8},{s:4,c:3,t:.12,zLE:-15.3},{s:6.3,c:1.7,t:.1,zLE:-17.6}],htail:[{s:.2,c:2.3,t:.12,zLE:-16.8,y:6.3},{s:3.8,c:1.2,t:.1,zLE:-18.4,y:6.3}],engines:[{x:1.95,y:.55,z:-10.8,r:.68,len:4},{x:-1.95,y:.55,z:-10.8,r:.68,len:4}],ws:[1,.7,.6,16.2],gear:[[0,15.5],[-2,-.5],[2,-.5]],gh:1.5});}
  function buildDHC8Model(){const g=buildJet('dhc8',{fus:[{z:16.5,r:.08},{z:15.4,r:.7},{z:13.6,r:1.2},{z:9,r:1.35},{z:-6,r:1.35},{z:-11,r:1.05,yo:.35},{z:-15,r:.45,yo:.95},{z:-16.4,r:.1,yo:1.15}].map(p=>({w:1,h:1,yo:0,flat:.15,...p})),wing:[{s:1.3,c:2.9,t:.16,zLE:2.3,y:1.5},{s:7,c:2.5,t:.14,zLE:2.0,y:1.55},{s:14.1,c:1.2,t:.11,zLE:1.3,y:1.6}],fin:[{s:1.3,c:4.2,t:.14,zLE:-10.5},{s:4,c:3,t:.12,zLE:-13.3},{s:6.4,c:1.9,t:.1,zLE:-15.2}],htail:[{s:.2,c:2.4,t:.12,zLE:-14.6,y:6.4},{s:4.2,c:1.3,t:.1,zLE:-15.9,y:6.4}],engines:[{x:4.2,y:1.05,z:-.2,r:.62,len:6.6},{x:-4.2,y:1.05,z:-.2,r:.62,len:6.6}],ws:[1.2,.75,.75,14.6],gear:[[0,13.2],[-4.2,-.6],[4.2,-.6]],gh:2.3});
    const gear=g.metadata.gearGroup;for(const sd of [-1,1])cyl(gear,'dhc8_strutLong',.14,.14,1.4,MAT.gear,[sd*4.2,-.25,-.6]);cyl(gear,'dhc8_strutNose',.1,.1,1.0,MAT.gear,[0,-.9,13.2]);return g;}
  function buildA320Model(){return buildJet('a320',{fus:[{z:15.5,r:.1},{z:14.2,r:.8},{z:12.3,r:1.35},{z:8,r:1.55},{z:-6,r:1.55},{z:-11,r:1.15,yo:.35},{z:-14.5,r:.45,yo:.9},{z:-15.6,r:.12,yo:1.1}].map(p=>({w:1,h:1,yo:0,flat:.13,...p})),wing:[{s:1.5,c:5.2,t:.13,zLE:2.6,y:-.9},{s:5.5,c:3.6,t:.11,zLE:.6,y:-.6},{s:14.7,c:1.3,t:.09,zLE:-4,y:-.05}],fin:[{s:1.5,c:4.6,t:.14,zLE:-9.6},{s:4.5,c:3.2,t:.12,zLE:-12},{s:7.5,c:1.9,t:.1,zLE:-14.3}],htail:[{s:.3,c:3,t:.12,zLE:-11.8,y:.9},{s:5.6,c:1.4,t:.1,zLE:-14.2,y:1.3}],engines:[{x:4.8,y:-1.7,z:1.6,r:.95,len:4.2},{x:-4.8,y:-1.7,z:1.6,r:.95,len:4.2}],ws:[1.3,.8,.75,13],gear:[[0,12.3],[-2.6,-.8],[2.6,-.8]],gh:1.9});}
  function buildB777Model(){const g=buildJet('b777',{fus:[{z:30,r:.15},{z:27.5,r:1.4},{z:24,r:2.3},{z:18,r:2.55},{z:-14,r:2.55},{z:-23,r:1.95,yo:.5},{z:-28.5,r:.8,yo:1.3},{z:-30.5,r:.2,yo:1.7}].map(p=>({w:1,h:1.02,yo:0,flat:.12,...p})),wing:[{s:2.6,c:9.5,t:.13,zLE:4.5,y:-1.5},{s:13,c:5.5,t:.11,zLE:-3,y:-.6},{s:26.5,c:1.6,t:.08,zLE:-13,y:1.4}],fin:[{s:2.6,c:8.5,t:.14,zLE:-21},{s:7,c:5.5,t:.12,zLE:-24.5},{s:11,c:2.6,t:.1,zLE:-28}],htail:[{s:.3,c:5,t:.12,zLE:-24,y:1.9},{s:9,c:2.3,t:.1,zLE:-29,y:2.6}],engines:[{x:8.8,y:-2.9,z:1.5,r:1.75,len:7.5},{x:-8.8,y:-2.9,z:1.5,r:1.75,len:7.5}],ws:[1.7,1,1.4,27.3],gear:[[0,25.5],[-3.4,-3],[3.4,-3],[-3.4,-5],[3.4,-5],[-3.4,-7],[3.4,-7]],gh:3.6});return g;}
  function buildConcordeModel(){const g=buildJet('concorde',{fus:[{z:25.5,r:.04},{z:23,r:.42},{z:20,r:.9},{z:16,r:1.2},{z:-12,r:1.2},{z:-19,r:.95,yo:.15},{z:-23.5,r:.45,yo:.4},{z:-25,r:.1,yo:.5}].map(p=>({w:1,h:1.05,yo:0,flat:.1,...p})),wing:[{s:1.2,c:22,t:.035,zLE:6,y:-.75},{s:4,c:16,t:.035,zLE:1,y:-.75},{s:7.5,c:8,t:.04,zLE:-6,y:-.65},{s:10.5,c:2.5,t:.05,zLE:-11.5,y:-.55}],fin:[{s:1,c:8.5,t:.08,zLE:-15},{s:4.5,c:5,t:.07,zLE:-19.5},{s:7.2,c:2.2,t:.06,zLE:-22.5}],htail:[{s:.1,c:.4,t:.05,zLE:-20,y:0},{s:.3,c:.3,t:.05,zLE:-20.1,y:0}],engines:[{x:2.5,y:-1.55,z:-9,r:.6,len:9},{x:-2.5,y:-1.55,z:-9,r:.6,len:9},{x:4.0,y:-1.55,z:-9,r:.6,len:9},{x:-4.0,y:-1.55,z:-9,r:.6,len:9}],ws:[1,.5,.55,18.5],gear:[[0,14],[-2.6,-7],[2.6,-7]],gh:3.0});
    for(const sd of [-1,1]){box(g,'concorde_engBox'+sd,3.1,1.2,9.5,MAT.white,[sd*3.25,-1.3,-9]);}return g;}
  function buildL1011Model(){return buildJet('l1011',{fus:[{z:24,r:.15},{z:22,r:1.2},{z:19.5,r:2.0},{z:15,r:2.4},{z:-10,r:2.4},{z:-18,r:1.9,yo:.4},{z:-23,r:.9,yo:1.2},{z:-25,r:.15,yo:1.6}].map(p=>({w:1,h:1,yo:0,flat:.12,...p})),wing:[{s:2.5,c:8,t:.13,zLE:4,y:-1.2},{s:12,c:5.2,t:.11,zLE:-2,y:-.4},{s:23,c:2,t:.1,zLE:-9,y:.9}],fin:[{s:2.5,c:8,t:.14,zLE:-17},{s:7.5,c:5,t:.12,zLE:-20.5},{s:12,c:2.5,t:.1,zLE:-23}],htail:[{s:.3,c:4.5,t:.12,zLE:-20,y:1.8},{s:7,c:2.6,t:.1,zLE:-24,y:2.4}],engines:[{x:7.8,y:-2.4,z:-1,r:1.4,len:7},{x:-7.8,y:-2.4,z:-1,r:1.4,len:7},{x:0,y:5.6,z:-19,r:1.3,len:5.5}],ws:[1.6,1,1.3,21],gear:[[0,20],[-3.2,-3],[3.2,-3],[-1.1,-7],[1.1,-7]],gh:3.2});}
  function buildA380Model(){return buildJet('a380',{fus:[{z:36,r:.2},{z:33,r:1.8},{z:28,r:2.9},{z:20,r:3.4},{z:-18,r:3.4},{z:-28,r:2.8,yo:.6},{z:-34,r:1.4,yo:1.6},{z:-36,r:.3,yo:2.0}].map(p=>({w:1,h:1.05,yo:0,flat:.12,...p})),wing:[{s:3.5,c:12,t:.13,zLE:5,y:-1.8},{s:18,c:7,t:.11,zLE:-4,y:-.6},{s:33,c:4,t:.1,zLE:-14,y:1.8},{s:40,c:2,t:.08,zLE:-19,y:3.2}],fin:[{s:3.5,c:10,t:.14,zLE:-26},{s:9,c:6.5,t:.12,zLE:-30},{s:13.5,c:3.2,t:.1,zLE:-34}],htail:[{s:.3,c:7,t:.12,zLE:-28,y:2.4},{s:11,c:4,t:.1,zLE:-34,y:3.4}],engines:[{x:14,y:-3.4,z:-1,r:1.7,len:9},{x:-14,y:-3.4,z:-1,r:1.7,len:9},{x:26,y:-2.4,z:-11,r:1.7,len:8},{x:-26,y:-2.4,z:-11,r:1.7,len:8}],ws:[2,1,1.6,30],gear:[[0,30],[-4.5,-3],[4.5,-3],[-5.5,-6],[5.5,-6],[-1.8,-9],[1.8,-9]],gh:4.5});}
  function buildWonderfulModel(){const g=new BABYLON.TransformNode('ac_wonderful',scene);g.parent=aircraftRoot;
    const skinTex=new BABYLON.DynamicTexture('wonderSkin',{width:512,height:256},scene,true);
    (function(){const c=skinTex.getContext();const grd=c.createLinearGradient(0,0,512,0);grd.addColorStop(0,'#ffd4e8');grd.addColorStop(.25,'#ffe9b0');grd.addColorStop(.5,'#c9f7d4');grd.addColorStop(.75,'#c7ecff');grd.addColorStop(1,'#e2d3ff');c.fillStyle=grd;c.fillRect(0,0,512,256);
      c.globalAlpha=.5;for(let i=0;i<40;i++){c.fillStyle=['#fff','#ffe','#eef'][i%3];c.beginPath();c.arc(Math.random()*512,Math.random()*256,3+Math.random()*5,0,6.3);c.fill();}
      c.globalAlpha=1;c.fillStyle='#ff9bbf';c.beginPath();c.arc(256,190,34,0,6.3);c.fill();skinTex.update();})();
    const skinM=new BABYLON.StandardMaterial('wonderSkinM',scene);skinM.diffuseTexture=skinTex;skinM.specularColor=new BABYLON.Color3(.4,.4,.4);skinM.specularPower=48;
    tubeSmooth('wonderful_fus',[{z:5,r:.05,w:1,h:1,yo:0,flat:.1},{z:4.5,r:.7,w:1,h:1,yo:0,flat:.1},{z:3,r:1.2,w:1,h:1.1,yo:0,flat:.1},{z:0,r:1.4,w:1,h:1.15,yo:0,flat:.1},{z:-2.5,r:1.2,w:1,h:1.1,yo:.1,flat:.1},{z:-4.5,r:.7,w:1,h:1,yo:.3,flat:.1},{z:-5.5,r:.15,w:1,h:1,yo:.4,flat:.1}],skinM,g);
    const wing=[{s:1.5,c:2.2,t:.15,zLE:0,y:.2},{s:4.5,c:1.8,t:.14,zLE:-.3,y:.4},{s:6,c:1,t:.1,zLE:-.7,y:.5}];
    horiz('wonderful_wR',wing,MAT.white,g);horiz('wonderful_wL',wing.map(st=>({...st,s:-st.s})),MAT.white,g);
    vert('wonderful_fin',[{s:.6,c:1.4,t:.12,zLE:-4},{s:2,c:1,t:.1,zLE:-4.5},{s:3,c:.5,t:.08,zLE:-5}],MAT.red,g);
    const ht=[{s:.4,c:1,t:.1,zLE:-4.3,y:.1},{s:2.5,c:.6,t:.08,zLE:-5.2,y:.1}];
    horiz('wonderful_hR',ht,MAT.white,g);horiz('wonderful_hL',ht.map(st=>({...st,s:-st.s})),MAT.white,g);
    const eyeW=new BABYLON.StandardMaterial('wonderEyeW',scene);eyeW.emissiveColor=new BABYLON.Color3(1,1,1);eyeW.disableLighting=true;
    const pupilM=new BABYLON.StandardMaterial('wonderPupilM',scene);pupilM.emissiveColor=new BABYLON.Color3(.05,.05,.05);pupilM.disableLighting=true;
    const browM=new BABYLON.StandardMaterial('wonderBrowM',scene);browM.diffuseColor=new BABYLON.Color3(.15,.1,.08);browM.specularColor=BABYLON.Color3.Black();
    for(const sd of [-1,1]){const eye=BABYLON.MeshBuilder.CreateSphere('wonderful_eyeW'+sd,{diameter:.55,segments:12},scene);eye.material=eyeW;eye.position.set(sd*.5,.65,4.15);eye.parent=g;eye.isPickable=false;
      const pupil=BABYLON.MeshBuilder.CreateSphere('wonderful_eyeP'+sd,{diameter:.24,segments:10},scene);pupil.material=pupilM;pupil.position.set(sd*.5,.68,4.4);pupil.parent=g;pupil.isPickable=false;
      const brow=BABYLON.MeshBuilder.CreateBox('wonderful_brow'+sd,{width:.42,height:.07,depth:.07},scene);brow.material=browM;brow.position.set(sd*.5,.98,4.22);brow.rotation.z=sd*-.3;brow.parent=g;brow.isPickable=false;}
    const mouth=BABYLON.MeshBuilder.CreateTorus('wonderful_mouth',{diameter:.9,thickness:.08,tessellation:24},scene);mouth.material=MAT.red;mouth.scaling.set(1,.5,.4);mouth.rotation.x=Math.PI/2;mouth.position.set(0,.18,4.55);mouth.parent=g;mouth.isPickable=false;
    const prop=BABYLON.MeshBuilder.CreateDisc('wonderful_prop',{radius:1.6,tessellation:20},scene);prop.position.set(0,0,5.1);prop.material=MAT.dark;prop.parent=g;prop.isPickable=false;
    const spinner=BABYLON.MeshBuilder.CreateCylinder('wonderful_spin',{diameterTop:0,diameterBottom:.3,height:.4,tessellation:12},scene);spinner.rotation.x=Math.PI/2;spinner.material=MAT.red;spinner.position.set(0,0,5.15);spinner.parent=g;spinner.isPickable=false;
    const gear=new BABYLON.TransformNode('wonderful_gear',scene);gear.parent=g;
    for(const [x,z] of [[0,3.6],[-1.2,-.5],[1.2,-.5]]){cyl(gear,'wonderful_strut',.07,.07,.7,MAT.gear,[x,-.8,z]);cyl(gear,'wonderful_wheel',.5,.5,.15,MAT.dark,[x,-1.3,z],[0,0,Math.PI/2]);}
    try{const sTex=new BABYLON.DynamicTexture('wonderSparkT',{width:32,height:32},scene,true),sc=sTex.getContext();
      const gr=sc.createRadialGradient(16,16,0,16,16,16);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.4,'rgba(255,230,255,.8)');gr.addColorStop(1,'rgba(255,230,255,0)');
      sc.fillStyle=gr;sc.fillRect(0,0,32,32);sTex.update();sTex.hasAlpha=true;
      const sp=new BABYLON.ParticleSystem('wonderSparkle',200,scene);sp.particleTexture=sTex;
      const em=new BABYLON.TransformNode('wonderSparkEm',scene);em.parent=g;em.position.set(0,-.1,-5.6);sp.emitter=em;
      sp.minEmitBox=new BABYLON.Vector3(-1.2,-.3,0);sp.maxEmitBox=new BABYLON.Vector3(1.2,.3,0);
      sp.color1=new BABYLON.Color4(1,.8,1,.9);sp.color2=new BABYLON.Color4(.8,.9,1,.7);sp.colorDead=new BABYLON.Color4(1,1,1,0);
      sp.minSize=.15;sp.maxSize=.5;sp.minLifeTime=.6;sp.maxLifeTime=1.4;sp.emitRate=26;
      sp.minEmitPower=.2;sp.maxEmitPower=.8;sp.direction1=new BABYLON.Vector3(-.3,-.1,-1);sp.direction2=new BABYLON.Vector3(.3,.3,-1);
      sp.gravity=new BABYLON.Vector3(0,-.3,0);sp.blendMode=BABYLON.ParticleSystem.BLENDMODE_ADD;sp.start();
      g.metadata={gearGroup:gear,fixed:true,sparkle:sp};
    }catch(e){g.metadata={gearGroup:gear,fixed:true};}
    return g;}

  const CK_EYE={cessna:[-.4,.5,.4],cirrus:[-.4,.5,.4],atr:[-.6,.8,10.9],e190:[-.6,.7,14.8],dc9:[-.6,.7,14.2],dc10:[-.7,1.2,20.2],a350:[-.7,1.3,23],dc3:[-.55,.55,7.5],dc8:[-.65,.9,24.4],f18:[0,.6,5.2],b747:[-.7,3.1,27.4],l1011:[-.7,1.2,21.5],a380:[-.8,1.8,33.5],wonderful:[0,1.0,2.5],md83:[-.6,.7,19.1],crj9:[-.5,.55,15.8],dhc8:[-.6,.7,13.9],a320:[-.6,.85,12.4],b777:[-.7,1.3,26.1],concorde:[-.45,.45,17.9],b727:[-.6,.75,16.6],b767:[-.7,1.2,21.7]};
  const CK_K={cessna:.8,cirrus:.8,atr:1.0,e190:1.0,dc9:1.0,dc10:1.4,a350:1.4,dc3:.9,dc8:1.1,f18:.7,b747:1.5,md83:1.0,crj9:.9,dhc8:1.0,a320:1.0,b777:1.4,concorde:.8,b727:1.0,b767:1.35};
  const ckFrames={};
  const USE_INT=new Set(['atr','e190','dc9','dc10','a350','dc3','dc8','f18','b747','l1011','a380','md83','crj9','dhc8','a320','b777','concorde','b727','b767']);
  const INT_S={atr:1,e190:1,dc9:1,dc10:1.2,a350:1.2,dc3:.85,dc8:1.0,f18:.8,b747:1.2,l1011:1.2,a380:1.4,md83:1,crj9:.9,dhc8:1,a320:1,b777:1.2,concorde:.8,b727:1.0,b767:1.3};
  NJ.forEach(p=>{CK_EYE[p.id]=p.eye;CK_K[p.id]=p.ck;USE_INT.add(p.id);INT_S[p.id]=p.isc;});
  const CK_HIDE=/_fus|_ws$|_sw[LR]$|_strut|_wheel|_ng[SW]|_mg[SW]|c172_prop|c172_spin|cirrus_prop|cirrus_spin|cirrus_roof|cirrus_mgF/;
  let _cessYoke=null,_cessTick=0;
  function buildCessnaCockpit(K){K=K||'cessna';
    const list=[];
    const mk=(n,c)=>{const m=new BABYLON.StandardMaterial('c172k_'+n,scene);m.diffuseColor=new BABYLON.Color3(c[0],c[1],c[2]);m.specularColor=new BABYLON.Color3(.08,.08,.08);m.specularPower=24;return m;};
    const plastic=mk('plastic',[.10,.10,.11]),trim=mk('trim',[.30,.28,.25]),liner=mk('liner',[.46,.43,.38]),carpet=mk('carpet',[.18,.17,.16]),seat=mk('seat',[.22,.18,.14]),metal=mk('metal',[.5,.5,.52]);
    metal.specularColor=new BABYLON.Color3(.5,.5,.5);
    const add=(n,w,h,d,x,y,z,mat,rot,par)=>{const m=BABYLON.MeshBuilder.CreateBox('ckf_'+K+'_'+n,{width:w,height:h,depth:d},scene);m.position.set(x,y,z);if(rot)m.rotation.set(rot[0]||0,rot[1]||0,rot[2]||0);m.material=mat;m.parent=par||aircraftRoot;m.isPickable=false;m.setEnabled(false);list.push(m);return m;};
    add('floor',1.9,.05,2.6,0,-.38,.2,carpet);add('roof',1.9,.04,2.4,0,.98,.1,liner);
    for(const sx of [-1,1]){add('wall'+sx,.05,.62,2.3,sx*.93,.18,.15,trim);add('sill'+sx,.07,.05,2.3,sx*.92,.5,.15,plastic);add('rail'+sx,.07,.05,2.3,sx*.92,.95,.15,plastic);add('bpil'+sx,.07,.46,.09,sx*.92,.72,-.55,plastic);add('apil'+sx,.07,.5,.09,sx*.86,.75,1.55,plastic,[0,0,sx*-.25]);
      add('seatBase'+sx,.46,.1,.55,sx*.4,-.22,0,seat);add('seatBack'+sx,.46,.62,.12,sx*.4,.1,-.3,seat,[-.12,0,0]);add('headrest'+sx,.3,.2,.1,sx*.4,.5,-.34,seat,[-.12,0,0]);}
    add('dash',1.8,.55,.55,0,-.12,1.45,plastic);add('glare',1.8,.07,.5,0,.40,1.42,plastic);add('hdr',1.8,.07,.4,0,.98,1.35,plastic);add('mid',.05,.5,.07,0,.74,1.58,plastic);
    add('console',.34,.34,.9,0,-.2,.55,trim);add('throttle',.04,.04,.2,.0,.02,.72,metal).material=mk('red',[.75,.12,.1]);add('mixture',.04,.04,.2,.07,.02,.72,metal).material=mk('red2',[.12,.12,.75]);
    const GL=K==='cirrus';
    const pw=GL?1.55:1.5,ph=GL?.56:.38,tex=new BABYLON.DynamicTexture('c172_panelT',{width:1024,height:GL?384:256},scene,false);
    const pm=new BABYLON.StandardMaterial('c172_panelM',scene);pm.emissiveTexture=tex;pm.diffuseColor=new BABYLON.Color3(0,0,0);pm.specularColor=new BABYLON.Color3(0,0,0);pm.disableLighting=true;pm.backFaceCulling=false;
    const panel=BABYLON.MeshBuilder.CreatePlane('ckf_'+K+'_panel',{width:pw,height:ph,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);panel.position.set(0,.2,1.17);panel.material=pm;panel.parent=aircraftRoot;panel.isPickable=false;panel.setEnabled(false);list.push(panel);
    const yoke=new BABYLON.TransformNode('c172_yoke',scene);yoke.parent=aircraftRoot;yoke.position.set(-.4,.24,.85);
    const col=BABYLON.MeshBuilder.CreateCylinder('ckf_'+K+'_col',{diameter:.045,height:.45,tessellation:10},scene);col.rotation.x=Math.PI/2;col.position.set(0,-.05,.2);col.material=metal;col.parent=yoke;col.setEnabled(false);list.push(col);
    const rim=BABYLON.MeshBuilder.CreateTorus('ckf_'+K+'_rim',{diameter:.24,thickness:.028,tessellation:24},scene);rim.rotation.x=Math.PI/2;rim.material=plastic;rim.parent=yoke;rim.setEnabled(false);list.push(rim);
    const hub=BABYLON.MeshBuilder.CreateCylinder('ckf_'+K+'_hub',{diameter:.07,height:.05,tessellation:12},scene);hub.rotation.x=Math.PI/2;hub.material=metal;hub.parent=yoke;hub.setEnabled(false);list.push(hub);
    _cessYoke=yoke;
    if(GL){ // Cirrus uses a side-stick instead of a yoke wheel
      list.splice(list.indexOf(rim),1);rim.dispose();
      col.rotation.set(0,0,0);col.scaling.set(1,.62,1);col.position.set(-.3,-.1,.05);
      hub.rotation.set(0,0,0);hub.scaling.set(1.5,2.6,1.5);hub.position.set(-.3,.05,.05);
    }
    const ctx=tex.getContext(),R=95,cy=128,cx=i=>110+i*201;
    function paintG1000(){
      const d=(typeof DV!=='undefined'&&DV)?DV:{spd:0,alt:0,vs:0,hdg:0,pitch:0,bank:0};
      const W=1024,H=384,TX=(t,x,y,c,f,al)=>{ctx.fillStyle=c;ctx.font=f;ctx.textAlign=al||'center';ctx.textBaseline='middle';ctx.fillText(t,x,y);};
      ctx.fillStyle='#050608';ctx.fillRect(0,0,W,H);
      // ---------- PFD (left) ----------
      const px=0,py=0,pw2=560,ph2=384,hx=px+pw2/2,hy=py+176;
      ctx.save();ctx.beginPath();ctx.rect(px+90,py+26,pw2-180,300);ctx.clip();
      ctx.translate(hx,hy);ctx.rotate(-(d.bank||0)*Math.PI/180);const po=(d.pitch||0)*7;
      const sky=ctx.createLinearGradient(0,-400+po,0,po);sky.addColorStop(0,'#0a4fa8');sky.addColorStop(1,'#4aa8e8');
      ctx.fillStyle=sky;ctx.fillRect(-420,-420+po,840,420);
      const gr=ctx.createLinearGradient(0,po,0,po+400);gr.addColorStop(0,'#8a5a2c');gr.addColorStop(1,'#3d2810');
      ctx.fillStyle=gr;ctx.fillRect(-420,po,840,420);
      ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-420,po);ctx.lineTo(420,po);ctx.stroke();
      ctx.lineWidth=2;ctx.font='bold 14px sans-serif';ctx.fillStyle='#fff';
      for(let p=-30;p<=30;p+=5){if(!p)continue;const yy=po-p*7,w=p%10?22:46;ctx.beginPath();ctx.moveTo(-w,yy);ctx.lineTo(w,yy);ctx.stroke();if(!(p%10)){ctx.textAlign='right';ctx.fillText(String(Math.abs(p)),-w-6,yy);ctx.textAlign='left';ctx.fillText(String(Math.abs(p)),w+6,yy);}}
      ctx.restore();
      // roll scale
      ctx.save();ctx.translate(hx,hy);ctx.strokeStyle='#fff';ctx.lineWidth=2;
      for(const a of [-60,-45,-30,-20,-10,0,10,20,30,45,60]){const r=a*Math.PI/180,l=(a%30===0)?14:9;ctx.beginPath();ctx.moveTo(Math.sin(r)*136,-Math.cos(r)*136);ctx.lineTo(Math.sin(r)*(136+l),-Math.cos(r)*(136+l));ctx.stroke();}
      ctx.rotate(-(d.bank||0)*Math.PI/180);ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(0,-134);ctx.lineTo(-9,-118);ctx.lineTo(9,-118);ctx.closePath();ctx.fill();ctx.restore();
      // aircraft symbol
      ctx.strokeStyle='#ffd400';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(hx-70,hy);ctx.lineTo(hx-24,hy);ctx.lineTo(hx-24,hy+12);ctx.moveTo(hx+70,hy);ctx.lineTo(hx+24,hy);ctx.lineTo(hx+24,hy+12);ctx.stroke();ctx.fillStyle='#ffd400';ctx.fillRect(hx-4,hy-4,8,8);
      // flight director
      let apOn=false;try{apOn=!!AP.master;}catch(e){}
      if(apOn){const fp=Math.max(-12,Math.min(12,((d.pitch||0)-(d.vs||0)/500)))*7;ctx.strokeStyle='#ff2bd6';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(hx-60,hy-fp*0+0);ctx.lineTo(hx,hy-6);ctx.lineTo(hx+60,hy);ctx.stroke();}
      // speed tape
      ctx.fillStyle='rgba(20,22,28,.92)';ctx.fillRect(px+8,py+26,82,300);
      const kt=Math.max(0,d.spd||0);ctx.save();ctx.beginPath();ctx.rect(px+8,py+26,82,300);ctx.clip();
      for(let v=Math.floor(kt/10)*10-70;v<=kt+80;v+=10){if(v<0)continue;const y=hy-(v-kt)*2.2;ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px+90,y);ctx.lineTo(px+(v%20?76:68),y);ctx.stroke();if(!(v%20))TX(String(v),px+40,y,'#fff','bold 15px sans-serif');}
      // V-speed colour band (white flap arc / green normal / yellow caution / red Vne)
      const band=(a,b,c)=>{const y1=hy-(b-kt)*2.2,y2=hy-(a-kt)*2.2;ctx.fillStyle=c;ctx.fillRect(px+86,y1,5,y2-y1);};
      band(60,100,'#fff');band(70,130,'#17c24a');band(130,165,'#ffd400');band(165,170,'#e22');
      ctx.restore();
      ctx.fillStyle='#000';ctx.fillRect(px+8,hy-14,70,28);ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(px+8,hy-14,70,28);TX(String(Math.round(kt)),px+43,hy,'#fff','bold 22px sans-serif');
      TX('KT',px+48,py+338,'#aef','bold 14px sans-serif');
      // altitude tape
      const ax=px+pw2-90;ctx.fillStyle='rgba(20,22,28,.92)';ctx.fillRect(ax,py+26,86,300);
      const al=Math.max(0,d.alt||0);ctx.save();ctx.beginPath();ctx.rect(ax,py+26,86,300);ctx.clip();
      for(let v=Math.floor(al/20)*20-160;v<=al+180;v+=20){const y=hy-(v-al)*.8;ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(ax,y);ctx.lineTo(ax+(v%100?10:20),y);ctx.stroke();if(!(v%100)&&v>=0)TX(String(v),ax+52,y,'#fff','bold 14px sans-serif');}
      ctx.restore();
      ctx.fillStyle='#000';ctx.fillRect(ax,hy-15,86,30);ctx.strokeStyle='#fff';ctx.strokeRect(ax,hy-15,86,30);TX(String(Math.round(al/10)*10),ax+43,hy,'#fff','bold 22px sans-serif');
      try{if(AP.master){const ay=Math.max(py+30,Math.min(py+322,hy-((AP.altTarget||0)-al)*.8));ctx.fillStyle='#19e7ff';ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(ax-12,ay-9);ctx.lineTo(ax-12,ay+9);ctx.closePath();ctx.fill();TX(String(Math.round(AP.altTarget||0)),ax+43,py+18,'#19e7ff','bold 15px sans-serif');}}catch(e){}
      // VSI
      const vs=Math.max(-2000,Math.min(2000,d.vs||0));ctx.fillStyle='rgba(20,22,28,.92)';ctx.fillRect(ax+90,py+66,30,220);
      for(const t of [-2,-1,0,1,2]){const y=py+176-t*50;ctx.strokeStyle='#fff';ctx.beginPath();ctx.moveTo(ax+90,y);ctx.lineTo(ax+100,y);ctx.stroke();}
      ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(ax+118,py+176);ctx.lineTo(ax+100,py+176-vs/2000*100*1);ctx.stroke();
      TX(String(Math.round(vs/10)*10),ax+104,py+300,'#fff','bold 12px sans-serif');
      // heading strip
      ctx.fillStyle='rgba(20,22,28,.95)';ctx.fillRect(px+110,py+334,pw2-220,44);
      ctx.save();ctx.beginPath();ctx.rect(px+110,py+334,pw2-220,44);ctx.clip();const hd=((d.hdg||0)%360+360)%360;
      for(let a=-60;a<=60;a+=5){const h=((Math.round(hd/5)*5+a)%360+360)%360,x=hx+(Math.round(hd/5)*5+a-hd)*3;ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,py+336);ctx.lineTo(x,py+(h%10?344:352));ctx.stroke();if(!(h%10))TX(h%30?String(h/10|0):(['N','E','S','W'][(h/90)|0]||String(h/10|0)),x,py+366,'#fff','bold 15px sans-serif');}
      try{if(AP.master){const bx=hx+((((AP.hdgTarget||0)-hd+540)%360)-180)*3;ctx.fillStyle='#19e7ff';ctx.fillRect(bx-5,py+334,10,10);}}catch(e){}
      ctx.restore();ctx.fillStyle='#000';ctx.fillRect(hx-26,py+312,52,22);ctx.strokeStyle='#fff';ctx.strokeRect(hx-26,py+312,52,22);TX(String(Math.round(hd)).padStart(3,'0')+'°',hx,py+323,'#fff','bold 17px sans-serif');
      // ILS deviation (shows when LOC/GS valid)
      const il=window._ilsDev;
      if(il&&il.valid){ctx.fillStyle='#0a0';ctx.font='bold 14px sans-serif';TX('ILS',px+30,py+14,'#0f0','bold 14px sans-serif');
        const lx=hx+Math.max(-1,Math.min(1,il.loc))*80;ctx.fillStyle='#ff2bd6';ctx.beginPath();ctx.moveTo(lx,py+300);ctx.lineTo(lx+10,py+310);ctx.lineTo(lx,py+320);ctx.lineTo(lx-10,py+310);ctx.closePath();ctx.fill();
        const gy=hy+Math.max(-1,Math.min(1,il.gs))*80;ctx.beginPath();ctx.moveTo(px+98,gy-10);ctx.lineTo(px+108,gy);ctx.lineTo(px+98,gy+10);ctx.lineTo(px+88,gy);ctx.closePath();ctx.fill();}
      TX(apOn?'AP':'',hx-70,py+14,'#0f0','bold 16px sans-serif');
      // ---------- MFD (right) ----------
      const mx=580,mw=430;ctx.fillStyle='#0b1018';ctx.fillRect(mx,8,mw,368);ctx.strokeStyle='#445';ctx.lineWidth=2;ctx.strokeRect(mx,8,mw,368);
      const mcx=mx+mw*.56,mcy=190;ctx.save();ctx.beginPath();ctx.rect(mx+2,10,mw-4,364);ctx.clip();ctx.translate(mcx,mcy);ctx.rotate(-(d.hdg||0)*Math.PI/180);
      ctx.strokeStyle='#2a5a6a';ctx.lineWidth=1;for(const r of [60,110,160]){ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.stroke();}
      ctx.strokeStyle='#355';for(let k=-4;k<=4;k++){ctx.beginPath();ctx.moveTo(k*55,-200);ctx.lineTo(k*55,200);ctx.moveTo(-250,k*55);ctx.lineTo(250,k*55);ctx.stroke();}
      ctx.fillStyle='#8cf';ctx.font='bold 15px sans-serif';ctx.textAlign='center';for(let k=0;k<12;k++){ctx.save();ctx.rotate(k*Math.PI/6);ctx.fillText(k%3?String(k*3):['N','E','S','W'][k/3],0,-148);ctx.restore();}
      ctx.restore();
      ctx.fillStyle='#fff';ctx.beginPath();ctx.moveTo(mcx,mcy-14);ctx.lineTo(mcx-10,mcy+10);ctx.lineTo(mcx,mcy+4);ctx.lineTo(mcx+10,mcy+10);ctx.closePath();ctx.fill();
      TX('MAP · TRK UP',mx+60,22,'#9cf','bold 13px sans-serif');TX('GS '+Math.round(kt)+' KT',mx+mw-62,22,'#9cf','bold 13px sans-serif');
      // engine strip
      const thr=(typeof plane!=='undefined'&&plane.throttle)||0;
      const bar=(lab,v,x,c)=>{ctx.fillStyle='#223';ctx.fillRect(x,300,22,66);ctx.fillStyle=c;ctx.fillRect(x,366-66*v,22,66*v);TX(lab,x+11,290,'#cde','bold 11px sans-serif');};
      bar('RPM',.3+.7*thr,mx+14,'#17c24a');bar('MAP',.25+.6*thr,mx+54,'#17c24a');bar('FF',.15+.7*thr,mx+94,'#17c24a');bar('OIL',.55,mx+134,'#17c24a');
      TX('ENGINE',mx+80,376,'#9ab','bold 11px sans-serif');
      tex.update();
    }

    const face=(x)=>{ctx.beginPath();ctx.arc(x,cy,R,0,Math.PI*2);ctx.fillStyle='#050608';ctx.fill();ctx.lineWidth=5;ctx.strokeStyle='#8a8f98';ctx.stroke();};
    const ang=(a)=>(a-90)*Math.PI/180;
    const needle=(x,a,len,w,col)=>{ctx.save();ctx.translate(x,cy);ctx.rotate(ang(a));ctx.strokeStyle=col;ctx.lineWidth=w;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(-len*.18,0);ctx.lineTo(len,0);ctx.stroke();ctx.restore();ctx.beginPath();ctx.arc(x,cy,6,0,Math.PI*2);ctx.fillStyle='#ddd';ctx.fill();};
    const ticks=(x,n,a0,a1,len,lab)=>{ctx.strokeStyle='#e8e8e8';ctx.fillStyle='#e8e8e8';ctx.lineWidth=2;ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      for(let i=0;i<=n;i++){const a=a0+(a1-a0)*i/n,r=ang(a);ctx.beginPath();ctx.moveTo(x+Math.cos(r)*(R-4),cy+Math.sin(r)*(R-4));ctx.lineTo(x+Math.cos(r)*(R-4-len),cy+Math.sin(r)*(R-4-len));ctx.stroke();if(lab&&lab[i]!==undefined)ctx.fillText(lab[i],x+Math.cos(r)*(R-26),cy+Math.sin(r)*(R-26));}};
    function paint(){
      if(GL){paintG1000();return;}
      const d=(typeof DV!=='undefined'&&DV)?DV:{spd:0,alt:0,vs:0,hdg:0,pitch:0,bank:0};
      ctx.fillStyle='#14151a';ctx.fillRect(0,0,1024,256);
      let x=cx(0);face(x);ticks(x,8,225,495,9,['0','20','40','60','80','100','120','140','160']);ctx.fillStyle='#e8e8e8';ctx.font='bold 13px sans-serif';ctx.fillText('KNOTS',x,cy+40);needle(x,225+Math.max(0,Math.min(d.spd,160))/160*270,R-18,4,'#fff');
      x=cx(1);ctx.save();ctx.beginPath();ctx.arc(x,cy,R-3,0,Math.PI*2);ctx.clip();ctx.translate(x,cy);ctx.rotate(-(d.bank||0)*Math.PI/180);const po=(d.pitch||0)*3.2;
      ctx.fillStyle='#3b7fc4';ctx.fillRect(-150,-300+po,300,300);ctx.fillStyle='#7a5230';ctx.fillRect(-150,po,300,300);
      ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-150,po);ctx.lineTo(150,po);ctx.stroke();
      for(const p of [-20,-10,10,20]){const yy=po-p*3.2;ctx.beginPath();ctx.moveTo(-18,yy);ctx.lineTo(18,yy);ctx.lineWidth=2;ctx.stroke();}
      ctx.restore();ctx.beginPath();ctx.arc(x,cy,R,0,Math.PI*2);ctx.lineWidth=5;ctx.strokeStyle='#8a8f98';ctx.stroke();
      ctx.strokeStyle='#ffc400';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(x-55,cy);ctx.lineTo(x-16,cy);ctx.lineTo(x-16,cy+8);ctx.moveTo(x+55,cy);ctx.lineTo(x+16,cy);ctx.lineTo(x+16,cy+8);ctx.stroke();ctx.fillStyle='#ffc400';ctx.fillRect(x-3,cy-3,6,6);
      x=cx(2);face(x);ticks(x,10,0,360,9,['0','1','2','3','4','5','6','7','8','9','0']);ctx.fillStyle='#e8e8e8';ctx.font='bold 13px sans-serif';ctx.fillText('ALT',x,cy+40);
      const alt=Math.max(0,d.alt||0);needle(x,(alt%1000)/1000*360,R-14,3,'#fff');needle(x,(alt%10000)/10000*360,R-44,6,'#ddd');
      x=cx(3);face(x);ctx.save();ctx.translate(x,cy);ctx.rotate(-(d.hdg||0)*Math.PI/180);ctx.fillStyle='#e8e8e8';ctx.strokeStyle='#e8e8e8';ctx.font='bold 20px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
      for(let k=0;k<36;k++){const a=k*10*Math.PI/180;ctx.save();ctx.rotate(a);ctx.lineWidth=k%3===0?3:1.5;ctx.beginPath();ctx.moveTo(0,-R+6);ctx.lineTo(0,-R+(k%3===0?20:14));ctx.stroke();if(k%9===0){ctx.fillText(['N','E','S','W'][k/9],0,-R+36);}else if(k%3===0){ctx.font='bold 13px sans-serif';ctx.fillText(String(k),0,-R+34);ctx.font='bold 20px sans-serif';}ctx.restore();}
      ctx.restore();ctx.fillStyle='#ffc400';ctx.beginPath();ctx.moveTo(x,cy-8);ctx.lineTo(x-14,cy+18);ctx.lineTo(x,cy+10);ctx.lineTo(x+14,cy+18);ctx.closePath();ctx.fill();ctx.fillRect(x-3,cy-R+2,6,12);
      x=cx(4);face(x);ticks(x,8,180,360,9,['','','','','','','','','']);ctx.fillStyle='#e8e8e8';ctx.font='bold 15px sans-serif';ctx.textAlign='center';ctx.fillText('UP',x,cy-48);ctx.fillText('DN',x,cy+52);ctx.font='bold 12px sans-serif';ctx.fillText('x100 FPM',x,cy+26);
      const vs=Math.max(-2000,Math.min(2000,d.vs||0));needle(x,270-(-vs/2000)*90*-1,R-16,4,'#fff');tex.update();
    }
    paint();
    scene.registerBeforeRender(()=>{if(camMode!==1||activeModelId!==K)return;if((++_cessTick)%3===0)try{paint();}catch(e){}try{_cessYoke.rotation.z=-(plane.aileron||0)*.9;_cessYoke.position.z=.85-(plane.elevator||0)*.07;}catch(e){}});
    return list;
  }
  function buildCockpitFrame(id){
    if(ckFrames[id])return ckFrames[id];
    if(id==='cessna'||id==='cirrus'){ckFrames[id]=buildCessnaCockpit(id);return ckFrames[id];}
    const e=CK_EYE[id],k=CK_K[id]||1,list=[];
    const add=(n,w,h,d,x,y,z,rot)=>{const m=box(aircraftRoot,'ckf_'+id+'_'+n,w*k,h*k,d*k,MAT.dark,[e[0]+x*k,e[1]+y*k,e[2]+z*k],rot);m.setEnabled(false);list.push(m);return m;};
    add('dash',2.4,.32,.5, .5,-.42,.65);add('glare',2.4,.06,.5, .5,-.22,.75);add('roof',2.4,.05,1.3, .5,.6,.3);
    add('pL',.08,.9,.12,-.7,.2,.8,[0,0,.12]);add('pR',.08,.9,.12,1.7,.2,.8,[0,0,-.12]);add('sillL',.05,.5,1.4,-.7,-.1,.2);add('sillR',.05,.5,1.4,1.7,-.1,.2);
    ckFrames[id]=list;return list;
  }
  function applyCockpitView(id,on){
    const root=modelRoots[id];if(!root)return;
    for(const m of root.getChildMeshes()){if(CK_HIDE.test(m.name))m.setEnabled(!on);}
    const fr=(on&&(id==='cessna'||id==='cirrus'))?buildCockpitFrame(id):ckFrames[id];
    if(fr)fr.forEach(m=>m.setEnabled(on));
  }
  function setActiveAircraft(modelId){
    if(modelId!=='737'&&modelId!=='787'&&window._ensureModel){try{window._ensureModel(modelId);}catch(e){console.warn('lazy setActive',e);}}
    activeModelId=modelId;window._activeModelId=modelId;window._ckEye=CK_EYE[modelId]||null;
    try{exteriorRoot.setEnabled(false);}catch(e){}
    try{interiorRoot.setEnabled(false);}catch(e){}
    Object.values(modelRoots).forEach(m=>{if(m)try{m.setEnabled(false);}catch(e){}});
    if(modelId==='737'){try{exteriorRoot.setEnabled(true);exteriorRoot.scaling.set(1,1,1);}catch(e){}}
    else if(modelId==='787'){try{exteriorRoot.setEnabled(true);exteriorRoot.scaling.set(1.35,1.15,1.35);}catch(e){}}
    else if(modelRoots[modelId]){try{modelRoots[modelId].setEnabled(true);}catch(e){}}
    const fd=fleet();
    if(fd&&fd.physics){ACFG.mass=fd.physics.mass;ACFG.wingArea=fd.physics.wingArea;ACFG.maxThrust=fd.physics.thrust;ACFG.CLmax=fd.physics.CLmax||1.85;if(fd.physics.gearHeight!=null)ACFG.gearHeight=fd.physics.gearHeight;}
    if(camMode===1){try{setCamMode(1);}catch(e){}}
  }
  function filterObjectives(objs){const fd=fleet();return objs.filter(o=>!(fd.fixedGear&&o.id==='gear'));}

  const LESSONS=[
    {id:'L1',type:'lesson',title:'Takeoff Basics',desc:'Throttle up, accelerate past 135 kts, rotate, and climb.',startState:'takeoff',wx:'clear',pax:0,pay:600,xp:80,
     objectives:[{id:'thr',label:'Advance throttle above 60%',check:()=>plane.throttle>0.6},{id:'roll',label:'Accelerate past 100 kts',check:()=>plane.speed*1.94384>100},{id:'rotate',label:'Lift off above 135 kts',check:()=>!plane.onGround&&plane.speed*1.94384>135},{id:'gear',label:'Retract landing gear',check:()=>plane.gearPos<0.1},{id:'climb',label:'Climb above 3,000 ft AGL',check:()=>computeAGL()>3000}]},
    {id:'L2',type:'lesson',title:'Autopilot',desc:'Engage autopilot (P) and hold a stable altitude for 5 seconds.',startState:'cruise',wx:'clear',pax:0,pay:900,xp:120,
     objectives:[{id:'ap',label:'Engage autopilot (P)',check:()=>AP.master},{id:'stbl',label:'Fly with autopilot for 5 seconds',check:(f)=>{const now=performance.now(),dt=(now-(f._vsT||now))/1000;f._vsT=now;f._holdT=AP.master?(f._holdT||0)+Math.min(0.2,dt):0;return f._holdT>=5;}}]},
    {id:'L3',type:'lesson',title:'Approach & Landing',desc:'On final. Lower gear, flaps 30, reduce throttle, touch down under 550 fpm.',startState:'final',wx:'clear',pax:0,pay:1100,xp:150,
     objectives:[{id:'gear',label:'Lower landing gear (G)',check:()=>plane.gearPos>0.9},{id:'flaps',label:'Extend flaps to 30',check:()=>plane.flaps>=4},{id:'thr',label:'Throttle below 50%',check:()=>plane.throttle<0.5},{id:'touch',label:'Touch down on the runway',check:(f)=>{if(!plane.onGround)f.everAirborne=true;return f.everAirborne&&plane.onGround&&plane.gearPos>0.9;}},{id:'soft',label:'Soft touchdown (< 550 fpm)',check:(f)=>f.touchdownFpm&&f.touchdownFpm<550}]},
    {id:'L4',type:'lesson',title:'Emergency Response',desc:'Engine 2 catches fire on approach. Land the aircraft safely.',startState:'final',wx:'clear',pax:0,pay:1600,xp:200,
     tick:(f)=>{if(!f._fireInjected&&f.elapsed>3){f._fireInjected=true;try{faults.inject('ENG_FIRE_R');}catch(e){}showMsg('⚠ ENGINE 2 FIRE · LAND IMMEDIATELY',4000);}},
     objectives:[{id:'ack',label:'Acknowledge fire warning',check:(f)=>!!f._fireInjected},{id:'land',label:'Land the aircraft safely',check:(f)=>{if(!plane.onGround)f.everAirborne=true;return f.everAirborne&&plane.onGround&&plane.gearPos>0.9;}}]},
    {id:'L5',type:'lesson',title:'Full Flight',desc:'Complete mission: takeoff, climb, cruise, descend, land.',startState:'takeoff',wx:'cloudy',pax:0,pay:2200,xp:280,
     objectives:[{id:'rotate',label:'Take off',check:()=>!plane.onGround&&plane.speed*1.94384>135},{id:'gear',label:'Retract landing gear',check:()=>plane.gearPos<0.1},{id:'climb',label:'Climb above 10,000 ft AGL',check:()=>computeAGL()>10000},{id:'desc',label:'Descend below 3,000 ft AGL',check:()=>computeAGL()<3000&&plane.vel.y<-2},{id:'land',label:'Land safely on the runway',check:(f)=>{if(!plane.onGround)f.everAirborne=true;return f.everAirborne&&plane.onGround&&plane.gearPos>0.9;}}]}
  ];
  function canAccessLesson(i){if(i===0)return true;for(let k=0;k<i;k++)if(!C.lessonsCompleted[LESSONS[k].id])return false;return true;}
  const WX_BONUS={clear:1,cloudy:1.05,rain:1.2,storm:1.55,fog:1.4,snow:1.3,windy:1.35,turbulent:1.45};
  const WX_LIST=Object.keys(WX_BONUS);
  const pickWx=()=>WX_LIST[Math.floor(Math.random()*WX_LIST.length)];
  const diffFor=b=>b>1.4?'HARD':b>1.15?'MED':'EASY';
  const altCeiling=()=>({cessna:6000,cirrus:17500,atr:20000,e190:32000,dc9:33000,b737:35000,dc10:40000,b787:41000,a350:42000,dc3:14000,dc8:42000,f18:50000,b747:45000,l1011:40000,a380:43000,wonderful:8000,md83:37000,crj9:41000,dhc8:25000,a320:39000,b777:43000,concorde:60000,b727:33000,b767:43000}[fleet().id])||(NJ.find(p=>p.id===fleet().id)||{}).ceil||30000;
  const rndPax=()=>{const cap=fleet().pax;if(cap<=6)return 1+Math.floor(Math.random()*cap);const min=Math.max(1,Math.floor(cap*0.5));return min+Math.floor(Math.random()*(cap-min+1));};
  const payFor=(pax,wx)=>Math.round(pax*fleet().fare*WX_BONUS[wx]);
  function makeTakeoff(id){const wx=pickWx(),loc=pickRandomLoc(),pax=rndPax();const targetAlt=[Math.round(altCeiling()*0.5),Math.round(altCeiling()*0.7)][Math.floor(Math.random()*2)];
    return{id,type:'takeoff',title:'Takeoff · '+loc.code,desc:'Lift off from '+loc.code+' and climb to '+targetAlt.toLocaleString()+' ft AGL. Short mission.',destCode:loc.code,destValue:loc.value,wx,startState:'takeoff',pax,pay:Math.round(payFor(pax,wx)*0.7),xp:Math.round(pax*0.3),difficulty:diffFor(WX_BONUS[wx]),
      objectives:filterObjectives([{id:'rotate',label:'Lift off above 135 kts',check:()=>!plane.onGround&&plane.speed*1.94384>135},{id:'gear',label:'Retract landing gear',check:()=>plane.gearPos<0.1},{id:'climb',label:'Climb to '+targetAlt.toLocaleString()+' ft AGL',check:()=>computeAGL()>=targetAlt}])};}
  function makeLanding(id){const wx=pickWx(),loc=pickRandomLoc(),pax=rndPax();
    return{id,type:'landing',title:'Landing · '+loc.code,desc:'On final approach to '+loc.code+'. Land under 550 fpm.',destCode:loc.code,destValue:loc.value,wx,startState:'final',pax,pay:payFor(pax,wx),xp:Math.round(pax*0.4),difficulty:diffFor(WX_BONUS[wx]),
      objectives:filterObjectives([{id:'gear',label:'Lower landing gear',check:()=>plane.gearPos>0.9},{id:'flaps',label:'Flaps 30',check:()=>plane.flaps>=4},{id:'touch',label:'Touch down on the runway',check:(f)=>{if(!plane.onGround)f.everAirborne=true;return f.everAirborne&&plane.onGround&&plane.gearPos>0.9;}},{id:'stop',label:'Come to a full stop (< 10 kts)',check:()=>plane.onGround&&plane.speed*1.94384<10}])};}
  function makeCircuit(id){const wx=pickWx(),loc=pickRandomLoc(),pax=rndPax();const targetAlt=Math.round(altCeiling()*0.25);
    return{id,type:'circuit',title:'Circuit · '+loc.code,desc:'Touch-and-go pattern. Take off, climb to '+targetAlt.toLocaleString()+' ft, land back.',destCode:loc.code,destValue:loc.value,wx,startState:'takeoff',pax,pay:Math.round(payFor(pax,wx)*0.9),xp:Math.round(pax*0.45),difficulty:diffFor(WX_BONUS[wx]),
      objectives:filterObjectives([{id:'rotate',label:'Take off',check:()=>!plane.onGround&&plane.speed*1.94384>135},{id:'climb',label:'Climb to '+targetAlt.toLocaleString()+' ft AGL',check:()=>computeAGL()>=targetAlt},{id:'desc',label:'Descend below 1,500 ft AGL',check:()=>computeAGL()<1500&&plane.vel.y<-1},{id:'land',label:'Land back on the runway',check:(f)=>{if(!plane.onGround)f.everAirborne=true;return f.everAirborne&&plane.onGround&&plane.gearPos>0.9;}}])};}
  function makeFull(id){const wx=pickWx(),loc=pickRandomLoc(),pax=rndPax();const cruiseAlt=Math.round(altCeiling()*0.85);
    return{id,type:'full',title:'Full Flight · '+loc.code,desc:'Take off, climb to '+cruiseAlt.toLocaleString()+' ft, cruise, descend and land at '+loc.code+'.',destCode:loc.code,destValue:loc.value,wx,startState:'takeoff',pax,pay:Math.round(payFor(pax,wx)*1.3),xp:Math.round(pax*0.65),difficulty:diffFor(WX_BONUS[wx]),
      objectives:filterObjectives([{id:'rotate',label:'Lift off above 135 kts',check:()=>!plane.onGround&&plane.speed*1.94384>135},{id:'gear',label:'Retract landing gear',check:()=>plane.gearPos<0.1},{id:'climb',label:'Climb to '+cruiseAlt.toLocaleString()+' ft',check:()=>plane.pos.y*3.28084>=cruiseAlt},{id:'descend',label:'Descend below 10,000 ft',check:()=>plane.pos.y*3.28084<10000&&plane.vel.y<-2},{id:'land',label:'Land safely on the runway',check:(f)=>{if(!plane.onGround)f.everAirborne=true;return f.everAirborne&&plane.onGround&&plane.gearPos>0.9;}}])};}
  function makeFree(id){return{id,type:'free',title:'Free Flight',desc:'No objectives. Practice flying. Small payout for a safe landing.',wx:'clear',pax:0,startState:'cruise',pay:Math.max(200,fleet().fare*3),xp:25,difficulty:'EASY',
    objectives:[{id:'land',label:'Land safely on the runway',check:(f)=>{if(!plane.onGround)f.everAirborne=true;return f.everAirborne&&plane.onGround&&plane.gearPos>0.9;}}]};}
  function genContractList(){return[makeTakeoff('c0'),makeFull('c1'),(Math.random()<0.5?makeCircuit:makeLanding)('c2')];}

  const hud=document.createElement('div');hud.id='careerHud';
  hud.innerHTML=`
    <div class="chStat"><span class="chIco">💰</span><span id="chMoney">$0</span></div>
    <div class="chStat"><span class="chIco">⭐</span><span id="chLvl">Lv 1</span><span id="chXp" style="opacity:.55;font-size:10px">0 XP</span></div>
    <div class="chStat"><span class="chIco">👥</span><span id="chPax">0 pax</span></div>
    <button class="chBtn" id="chContr">📋 MISSIONS</button>
    <button class="chBtn" id="chShop">🛒 HANGAR</button>`;
  document.getElementById('sidebarStats').appendChild(hud);
  document.getElementById('sidebarInfo').appendChild(document.getElementById('infoBox'));
  const sidebarToggle=document.getElementById('sidebarToggle');
  sidebarToggle.addEventListener('click',()=>{
    const expanded=document.body.classList.toggle('sidebar-open');
    sidebarToggle.setAttribute('aria-expanded',String(expanded));
    sidebarToggle.setAttribute('aria-label',expanded?'Close flight sidebar':'Open flight sidebar');
    sidebarToggle.title=expanded?'Close flight sidebar':'Open flight sidebar';
  });
  function renderHUD(){
    document.getElementById('chMoney').textContent='$'+C.money.toLocaleString();
    document.getElementById('chLvl').textContent='Lv '+C.level;
    document.getElementById('chXp').textContent=C.xp+'/'+xpForLevel(C.level)+' XP';
    const pax=currentFlight?currentFlight.passengers:(pendingContract?pendingContract.pax:fleet().pax);
    const paxEl=document.getElementById('chPax');
    paxEl.textContent=pax+' pax';
    paxEl.setAttribute('data-ac',fleet().name);
  }
  function pulse(id){const el=document.getElementById(id);if(!el)return;el.classList.remove('pulse');void el.offsetWidth;el.classList.add('pulse');}

  const contrEl=document.createElement('div');contrEl.id='contrPanel';
  contrEl.innerHTML=`
    <div class="cpHead"><span>📋 DISPATCH</span><button id="cpX">✕</button></div>
    <div class="cpSub">Choose a lesson or contract. Lessons unlock in order. Contracts scale to your current aircraft: <b id="cpFleetName">${fleet().name}</b></div>
    <div class="cpSection"><div class="cpSectionHead">📚 Training Lessons</div><div id="cpLessonList"></div></div>
    <div class="cpSection"><div class="cpSectionHead">✈ Contracts</div><div id="cpList"></div>
    <button id="cpRefresh" class="cpRefresh">↻ Refresh Contracts</button></div>`;
  document.body.appendChild(contrEl);
  let contractList=genContractList();
  function renderContracts(){
    document.getElementById('cpFleetName').textContent=fleet().name;
    const lessonList=document.getElementById('cpLessonList');
    lessonList.innerHTML=LESSONS.map((L,i)=>{
      const done=!!C.lessonsCompleted[L.id];const unlocked=canAccessLesson(i);const sel=pendingContract&&pendingContract.id===L.id;
      const cls='ctr lesson'+(done?' done':'')+(!unlocked?' locked':'')+(sel?' sel':'');
      const btnLabel=done?'REPLAY ($'+Math.round(L.pay*0.25)+')':unlocked?'$'+L.pay:'LOCKED';
      return `<div class="${cls}" data-cid="${L.id}" ${!unlocked?'data-locked="1"':''}>
        <div><div class="ctr-title">${i+1}. ${L.title}<span class="lessonTag">LESSON</span></div>
        <div class="ctr-desc">${L.desc}</div></div>
        <div class="ctr-reward">${btnLabel}<small>+${done?Math.round(L.xp*0.25):L.xp} XP</small></div>
      </div>`;
    }).join('');
    document.getElementById('cpList').innerHTML=contractList.map(c=>{
      const sel=pendingContract&&pendingContract.id===c.id;
      return `<div class="ctr ${sel?'sel':''}" data-cid="${c.id}">
        <div><div class="ctr-title">${c.title} · <span class="diff-${c.difficulty}">${c.difficulty}</span></div>
        <div class="ctr-desc">${c.desc} · ${c.pax} pax · weather <b>${c.wx}</b></div></div>
        <div class="ctr-reward">$${c.pay.toLocaleString()}<small>+${c.xp} XP</small></div>
      </div>`;
    }).join('');
    document.querySelectorAll('#cpLessonList .ctr, #cpList .ctr').forEach(n=>{
      n.addEventListener('click',()=>{
        if(n.dataset.locked)return;
        const cid=n.dataset.cid;
        const c=[...LESSONS,...contractList].find(x=>x.id===cid);
        if(!c)return;
        if(pendingContract&&pendingContract.id===cid){pendingContract=null;}
        else{
          pendingContract=c;
          if(c.wx)setSelect('wxSelect',c.wx);
          if(c.startState)setSelect('startSel',c.startState);
          if(c.destCode){const v=findLocValueByCode(c.destCode);if(v)setSelect('locSelect',v);}
          showMsg('📋 '+c.title+' · $'+c.pay,2500);
        }
        renderContracts();renderHUD();
      });
    });
  }

  const shopEl=document.getElementById('shopPanel');
  if(!shopEl)throw new Error('Aircraft store markup is missing');
  let shopTab='fleet';
  const REDEEM_CODES={SKYDECK5000:5000,FLYHIGH:2500,FIRSTFLIGHT:1000};
  function redeemCode(){
    const input=document.getElementById('redeemCode');
    const message=document.getElementById('redeemMessage');
    const code=input.value.trim().toUpperCase();
    message.className='';
    if(!code){message.textContent='Enter a code first.';message.classList.add('error');return;}
    if(!Object.prototype.hasOwnProperty.call(REDEEM_CODES,code)){
      message.textContent='That code is not valid.';message.classList.add('error');return;
    }
    if(C.redeemedCodes[code]){
      message.textContent='You have already redeemed that code.';message.classList.add('error');return;
    }
    const reward=REDEEM_CODES[code];
    C.redeemedCodes[code]=true;
    C.money+=reward;
    C.stats.totalEarned+=reward;
    save();renderShop();renderHUD();pulse('chMoney');
    input.value='';
    message.textContent='Code accepted — $'+reward.toLocaleString()+' added to your balance.';
    message.classList.add('success');
  }
  function renderShop(){
    const body=document.getElementById('spBody');
    document.querySelectorAll('.spTab').forEach(t=>t.classList.toggle('on',t.dataset.tab===shopTab));
    if(shopTab==='fleet'){
      body.innerHTML=FLEET.map((f,i)=>{
        const cur=i===C.upgrades.fleet;const owned=i<=C.maxFleet&&!cur;const next=i===C.maxFleet+1;const canBuy=next&&C.money>=f.cost;
        const btn=cur?'<button class="spBuy cur">IN USE</button>':owned?`<button class="spBuy own" data-sel-fleet="${i}">SELECT</button>`:next?`<button class="spBuy" ${canBuy?'':'disabled'} data-buy-fleet="${i}">$${f.cost.toLocaleString()}</button>`:`<button class="spBuy" disabled>LOCKED</button>`;
        return `<div class="spItem ${cur?'current':(owned?'owned':(next?'':'locked'))}">
          <div><div class="spName">${f.name}</div><div class="spDesc">${f.tag} · ${f.pax} pax · cruise ${f.cruise} kts · $${f.fare}/pax${next?' · <b style="color:#22d3ee">NEXT TIER</b>':''}</div></div>
          ${btn}</div>`;
      }).join('');
      body.querySelectorAll('[data-sel-fleet]').forEach(b=>b.addEventListener('click',()=>{
        const i=+b.dataset.selFleet,f=FLEET[i];if(i>C.maxFleet)return;
        C.upgrades.fleet=i;save();setActiveAircraft(f.model);contractList=genContractList();
        renderShop();renderHUD();renderContracts();showMsg('✈ SELECTED · '+f.name,2500);
      }));
      body.querySelectorAll('[data-buy-fleet]').forEach(b=>b.addEventListener('click',()=>{
        const i=+b.dataset.buyFleet,f=FLEET[i];
        if(C.money>=f.cost&&i===C.maxFleet+1){C.money-=f.cost;C.upgrades.fleet=i;C.maxFleet=i;save();
          setActiveAircraft(f.model);contractList=genContractList();
          renderShop();renderHUD();renderContracts();pulse('chMoney');showMsg('✈ NEW AIRCRAFT · '+f.name,3000);}
      }));
    } else if(shopTab==='upg'){
      body.innerHTML=Object.entries(UPGRADES).map(([k,u])=>{
        const lvl=C.upgrades[k]||0,maxed=lvl>=u.max;const cost=Math.round(u.baseCost*Math.pow(1.8,lvl));const canBuy=!maxed&&C.money>=cost;
        return `<div class="spItem ${maxed?'owned':''}">
          <div><div class="spName">${u.name} · Lv ${lvl}/${u.max}</div><div class="spDesc">${u.effect}</div></div>
          ${maxed?'<button class="spBuy own">MAXED</button>':`<button class="spBuy" ${canBuy?'':'disabled'} data-buy-upg="${k}">$${cost.toLocaleString()}</button>`}
        </div>`;
      }).join('');
      body.querySelectorAll('[data-buy-upg]').forEach(b=>b.addEventListener('click',()=>{
        const k=b.dataset.buyUpg,u=UPGRADES[k],lvl=C.upgrades[k]||0,cost=Math.round(u.baseCost*Math.pow(1.8,lvl));
        if(C.money>=cost&&lvl<u.max){C.money-=cost;C.upgrades[k]=lvl+1;save();renderShop();renderHUD();pulse('chMoney');showMsg('⚙ '+u.name+' → Lv '+(lvl+1),2000);}
      }));
    } else {
      const total=Object.keys(C.lessonsCompleted).filter(k=>C.lessonsCompleted[k]).length;
      body.innerHTML=`
        <div class="spItem"><div><div class="spName">Current Aircraft</div></div><div style="font-size:14px;color:#22d3ee;font-weight:700">${fleet().name}</div></div>
        <div class="spItem"><div><div class="spName">Total Flights</div></div><div style="font-size:20px;color:#4ade80;font-weight:800">${C.stats.flights}</div></div>
        <div class="spItem"><div><div class="spName">Lessons Completed</div></div><div style="font-size:20px;color:#a855f7;font-weight:800">${total}/${LESSONS.length}</div></div>
        <div class="spItem"><div><div class="spName">Crashes</div></div><div style="font-size:20px;color:#ef4444;font-weight:800">${C.stats.crashes}</div></div>
        <div class="spItem"><div><div class="spName">Best Landing</div></div><div style="font-size:20px;color:#fbbf24;font-weight:800">${C.stats.bestLandingFpm<9999?C.stats.bestLandingFpm+' fpm':'—'}</div></div>
        <div class="spItem"><div><div class="spName">Perfect Landings (S)</div></div><div style="font-size:20px;color:#fbbf24;font-weight:800">${C.stats.perfectLandings}</div></div>
        <div class="spItem"><div><div class="spName">Faults Handled</div></div><div style="font-size:20px;color:#22d3ee;font-weight:800">${C.stats.faultsHandled}</div></div>
        <div class="spItem"><div><div class="spName">Total Earned</div></div><div style="font-size:20px;color:#4ade80;font-weight:800">$${C.stats.totalEarned.toLocaleString()}</div></div>`;
    }
  }

  const objPanel=document.createElement('div');objPanel.id='objHud';document.body.appendChild(objPanel);
  let lastObjState='';
  function renderObjHud(){
    if(!currentFlight){objPanel.style.display='none';lastObjState='';return;}
    const ov=document.getElementById('overlay');
    if(!ov||!ov.classList.contains('hidden')){objPanel.style.display='none';lastObjState='';return;}
    const state=currentFlight.objectives.map(o=>o.met?'1':'0').join('')+'|'+currentFlight.title;
    if(state===lastObjState&&objPanel.style.display==='block')return;
    lastObjState=state;
    const completed=currentFlight.objectives.filter(o=>o.met).length;
    const total=currentFlight.objectives.length;
    const isLesson=currentFlight.type==='lesson';
    const head=(isLesson?'📚 LESSON':'📋 ')+currentFlight.title;
    const cls=isLesson?' lesson':'';
    const ready=!!currentFlight.readyToEnd;
    objPanel.innerHTML=`
      <div class="objHead"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:160px">${head}</span><span class="objProg">${completed}/${total}</span></div>
      <div class="objList">${currentFlight.objectives.map(o=>`<div class="obj${o.met?' met':''}${cls}"><span class="objCheck">${o.met?'✓':'○'}</span><span>${o.label}</span></div>`).join('')}</div>
      <button class="objEndBtn${ready?' ready':''}" id="objEndBtn" ${ready?'':'disabled'}>${ready?'🏁 END FLIGHT':'Complete objectives to end'}</button>`;
    objPanel.style.display='block';
    const eb=document.getElementById('objEndBtn');
    if(eb)eb.addEventListener('click',()=>{if(currentFlight&&currentFlight.readyToEnd)completeSuccess();});
  }

  const sModal=document.createElement('div');sModal.id='summaryModal';document.body.appendChild(sModal);
  function showSummary(data){
    const{isCrash,grade,title,rows,reward,xp,levelUp,extraBadge}=data;
    sModal.innerHTML=`<div class="sumCard">
      <div class="sumTitle">${isCrash?'MISSION FAILED':'MISSION COMPLETE'}</div>
      <div class="sumGrade ${grade}">${grade}</div>
      <div class="sumSubtitle">${title}</div>
      ${rows.map(r=>`<div class="sumRow"><span class="lbl">${r.l}</span><span style="color:${r.c||'#e6edf6'}">${r.v}</span></div>`).join('')}
      ${levelUp>0?`<div class="sumLevelUp">⭐ LEVEL UP → Lv ${C.level}</div>`:''}
      ${extraBadge||''}
      <div class="sumRow final"><span class="lbl">${isCrash?'PENALTY':'PAYOUT'}</span><span style="color:${isCrash?'#ef4444':'#4ade80'}">${isCrash?'−$'+Math.abs(reward).toLocaleString():'+$'+reward.toLocaleString()}</span></div>
      ${!isCrash?`<div class="sumRow" style="border:none"><span class="lbl">XP</span><span style="color:#fbbf24">+${xp}</span></div>`:''}
      <button class="sumBtn" id="sumClose">CONTINUE</button></div>`;
    sModal.classList.add('show');
    document.getElementById('sumClose').addEventListener('click',()=>{
      sModal.classList.remove('show');
      if(isCrash){try{respawn();}catch(e){}}
      const ov=document.getElementById('overlay');
      if(ov)ov.classList.remove('hidden');
    });
  }

  let pendingContract=null,currentFlight=null,careerBlockAutoStart=false;
  function buildFlight(c){
    return{type:c.type,contract:c,title:c.title,passengers:c.pax||0,startedAt:performance.now(),elapsed:0,faultsSeen:new Set(),everAirborne:false,touchdownFpm:null,
      objectives:c.objectives.map(o=>({id:o.id,label:o.label,check:o.check,met:false}))};
  }
  function startFlightIfNeeded(){
    if(!window._userStarted||currentFlight||careerBlockAutoStart||plane.hold||plane.crashed)return;
    const ov=document.getElementById('overlay');
    if(!ov||!ov.classList.contains('hidden'))return;
    const c=pendingContract;pendingContract=null;
    currentFlight=buildFlight(c||makeFree('free'));
    renderObjHud();renderHUD();
  }
  function completeSuccess(){
    if(!currentFlight)return;
    const c=currentFlight.contract;
    const comfortMult=1+(C.upgrades.comfort||0)*UPGRADES.comfort.per;
    const safetyMult=1+(C.upgrades.safety||0)*UPGRADES.safety.per;
    const engineMult=1+(C.upgrades.engines||0)*UPGRADES.engines.per;
    const fpm=currentFlight.touchdownFpm||9999;
    let q;
    if(currentFlight.type==='takeoff'||!(currentFlight.objectives.some(o=>o.id==='land'||o.id==='touch'))){q={grade:'A',mult:1.2,label:'Takeoff Complete'};}
    else if(fpm<110)q={grade:'S',mult:2.0,label:fpm+' fpm · GREASER'};
    else if(fpm<220)q={grade:'A',mult:1.5,label:fpm+' fpm · SMOOTH'};
    else if(fpm<550)q={grade:'B',mult:1.0,label:fpm+' fpm · FIRM'};
    else q={grade:'C',mult:0.6,label:fpm+' fpm · HARD'};
    const faultBonus=currentFlight.faultsSeen.size>0?1+Math.min(1.5,currentFlight.faultsSeen.size*0.25):1;
    const wxName=(currentWeather&&currentWeather.name?currentWeather.name.toLowerCase():'clear');
    const wxBonus={clear:1,cloudy:1.05,rain:1.15,storm:1.4,fog:1.3,snow:1.2,crosswind:1.25,turbulent:1.35}[wxName]||1;
    let reward,xp,extraBadge='';
    const rows=[];
    if(currentFlight.type==='lesson'){
      const base=c.pay||600;
      const replay=C.lessonsCompleted[c.id]?0.25:1.0;
      reward=Math.round(base*replay);xp=Math.round((c.xp||50)*replay);
      const wasNew=!C.lessonsCompleted[c.id];
      C.lessonsCompleted[c.id]=true;
      C.stats.lessonsDone=Object.keys(C.lessonsCompleted).filter(k=>C.lessonsCompleted[k]).length;
      rows.push({l:'Lesson',v:c.title});
      rows.push({l:'Objectives',v:currentFlight.objectives.length+'/'+currentFlight.objectives.length,c:'#4ade80'});
      if(wasNew){
        const idx=LESSONS.findIndex(l=>l.id===c.id);
        if(idx<LESSONS.length-1){extraBadge=`<div style="margin:14px 0 6px;padding:10px 14px;background:#4c1d95;border:2px solid #a855f7;border-radius:8px;color:#e9d5ff;font-size:12px;font-weight:700">🔓 UNLOCKED · ${LESSONS[idx+1].title}</div>`;}
        else{extraBadge=`<div style="margin:14px 0 6px;padding:10px 14px;background:#14532d;border:2px solid #22c55e;border-radius:8px;color:#bbf7d0;font-size:12px;font-weight:700">🎓 ALL LESSONS COMPLETE!</div>`;}
      }
    } else if(currentFlight.type==='free'){
      reward=Math.round(c.pay*q.mult*comfortMult);xp=25;
      rows.push({l:'Landing Rate',v:q.label});
    } else {
      const base=c.pay||1000;
      reward=Math.round(base*q.mult*comfortMult*engineMult*faultBonus*wxBonus*safetyMult);
      xp=Math.round((c.xp||100)*q.mult*faultBonus);
      rows.push({l:'Aircraft',v:fleet().name});
      rows.push({l:'Landing',v:q.label});
      rows.push({l:'Passengers',v:currentFlight.passengers});
      if(faultBonus>1)rows.push({l:'Fault Bonus',v:'×'+faultBonus.toFixed(2),c:'#22d3ee'});
      if(wxBonus>1)rows.push({l:'Weather Bonus',v:'×'+wxBonus.toFixed(2),c:'#22d3ee'});
    }
    C.money+=reward;C.stats.totalEarned+=reward;C.stats.flights++;
    if(fpm<C.stats.bestLandingFpm)C.stats.bestLandingFpm=fpm;
    if(q.grade==='S')C.stats.perfectLandings++;
    C.stats.faultsHandled+=currentFlight.faultsSeen.size;
    const levelUp=addXP(xp);save();
    currentFlight=null;careerBlockAutoStart=true;
    renderObjHud();renderHUD();pulse('chMoney');
    showSummary({isCrash:false,grade:q.grade,title:(c?c.title:'Mission')+' — COMPLETE',rows,reward,xp,levelUp,extraBadge});
    contractList=genContractList();
  }
  function completeCrash(){
    if(!currentFlight)return;
    const disc=1-(C.upgrades.safety||0)*0.08;
    const penalty=Math.round(2000*disc);
    C.money=Math.max(0,C.money-penalty);C.stats.crashes++;C.stats.flights++;save();
    const reason=document.getElementById('crashReason')?.textContent||'IMPACT';
    const title=currentFlight.contract?currentFlight.contract.title:'Mission';
    currentFlight=null;careerBlockAutoStart=true;
    renderObjHud();renderHUD();
    const co=document.getElementById('crashOverlay');if(co)co.classList.remove('show');
    showSummary({isCrash:true,grade:'F',title,rows:[{l:'Reason',v:reason,c:'#fca5a5'}],reward:-penalty,xp:0,levelUp:0});
    contractList=genContractList();
  }

  document.getElementById('chContr').addEventListener('click',()=>{if(contrEl.classList.contains('show')){contrEl.classList.remove('show');return;}renderContracts();contrEl.classList.add('show');shopEl.classList.remove('show');shopEl.setAttribute('aria-hidden','true');});
  document.getElementById('chShop').addEventListener('click',()=>{
    if(shopEl.classList.contains('show')){shopEl.classList.remove('show');shopEl.setAttribute('aria-hidden','true');return;}
    renderShop();shopEl.classList.add('show');shopEl.setAttribute('aria-hidden','false');contrEl.classList.remove('show');
  });
  document.getElementById('cpX').addEventListener('click',()=>contrEl.classList.remove('show'));
  document.getElementById('spX').addEventListener('click',()=>{shopEl.classList.remove('show');shopEl.setAttribute('aria-hidden','true');});
  document.getElementById('cpRefresh').addEventListener('click',()=>{contractList=genContractList();renderContracts();showMsg('↻ CONTRACTS REFRESHED',1800);});
  document.querySelectorAll('.spTab').forEach(t=>t.addEventListener('click',()=>{shopTab=t.dataset.tab;renderShop();}));
  document.getElementById('redeemBtn').addEventListener('click',redeemCode);
  document.getElementById('redeemCode').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();redeemCode();}});
  const startBtnEl=document.getElementById('startBtn');if(startBtnEl)startBtnEl.addEventListener('click',()=>{careerBlockAutoStart=false;});
  const respawnBtnEl=document.getElementById('respawnBtn');if(respawnBtnEl)respawnBtnEl.addEventListener('click',()=>{currentFlight=null;careerBlockAutoStart=true;renderObjHud();});

  const _origSetCamMode=setCamMode;
  setCamMode=function(m){
    _origSetCamMode(m);
    for(const _id of Object.keys(CK_EYE))applyCockpitView(_id,m===1&&activeModelId===_id);
    if(activeModelId==='cessna'||activeModelId==='cirrus')document.body.classList.remove('cockpit');
    try{if(USE_INT.has(activeModelId)){const e=CK_EYE[activeModelId],sc=INT_S[activeModelId]||1;interiorRoot.scaling.setAll(sc);interiorRoot.position.set(e[0]+.6*sc,e[1]-.30*sc,e[2]-14.0*sc);}else{interiorRoot.scaling.setAll(1);interiorRoot.position.set(0,0,0);}}catch(er){}
    if(activeModelId==='737'){try{exteriorRoot.setEnabled(true);exteriorRoot.scaling.set(1,1,1);}catch(e){}}
    else if(activeModelId==='787'){try{exteriorRoot.setEnabled(true);exteriorRoot.scaling.set(1.35,1.15,1.35);interiorRoot.setEnabled(m===1);}catch(e){}}
    else{try{exteriorRoot.setEnabled(false);interiorRoot.setEnabled(m===1&&USE_INT.has(activeModelId));if(window._modelRoots[window._activeModelId])window._modelRoots[window._activeModelId].setEnabled(true);}catch(e){}}
  };

  scene.registerBeforeRender(()=>{
    if(typeof activeModelId!=='undefined'){
      const isB737=(activeModelId==='737'),isB787=(activeModelId==='787'),shouldShow737=isB737||isB787;
      if(exteriorRoot){
        if(!shouldShow737){exteriorRoot.setEnabled(false);exteriorRoot.getChildMeshes().forEach(m=>m.setEnabled(false));}
        else{exteriorRoot.setEnabled(true);exteriorRoot.getChildMeshes().forEach(m=>m.setEnabled(!(camMode===1&&/^(fuselage|cpGlass|cw|stripe|bc|nac|lip|fan|spin|exh|pyl|revD)/.test(m.name))));}
      }
      if(!shouldShow737&&window._modelRoots[window._activeModelId]){const root=window._modelRoots[window._activeModelId];root.setEnabled(true);root.getChildMeshes().forEach(m=>m.setEnabled(!(camMode===1&&CK_HIDE.test(m.name))));}
    }
    if(fleet().fixedGear){plane.gearPos=1.0;plane.gearTarget=1.0;plane.gearDown=true;}
    if(!currentFlight){startFlightIfNeeded();return;}
    if(plane.crashed){if(performance.now()-(plane._crashAt||0)>2600)completeCrash();return;}
    currentFlight.elapsed=(performance.now()-currentFlight.startedAt)/1000;
    if(plane.justTouched&&!currentFlight.touchdownFpm){currentFlight.touchdownFpm=Math.round(plane._tdSink!=null?plane._tdSink*196.85:Math.max(0,(plane.gearCompress||0)*4*196.85));}
    for(const fid of faults.list())currentFlight.faultsSeen.add(fid);
    if(currentFlight.contract&&typeof currentFlight.contract.tick==='function'){try{currentFlight.contract.tick(currentFlight);}catch(e){}}
    let allMet=true,newlyMet=null;
    for(const obj of currentFlight.objectives){if(obj.met)continue;let r=false;try{r=!!obj.check(currentFlight);}catch(e){}if(r&&!obj.met)newlyMet=obj;obj.met=r;if(!r)allMet=false;}
    if(newlyMet)showMsg('✓ '+newlyMet.label,1400);
    if(allMet&&!currentFlight.readyToEnd){currentFlight.readyToEnd=true;showMsg('✓ ALL OBJECTIVES COMPLETE · press END FLIGHT when ready',2800);}
    renderObjHud();
  });

  initMats();
  try{MAT.white.clearCoat.isEnabled=true;MAT.white.clearCoat.intensity=.8;MAT.white.clearCoat.roughness=.06;MAT.white.roughness=.28;
    MAT.glass.clearCoat.isEnabled=true;MAT.glass.roughness=.04;MAT.glass.metallic=.9;
    if(M.body&&M.body.clearCoat){M.body.clearCoat.isEnabled=true;M.body.clearCoat.intensity=.6;M.body.clearCoat.roughness=.08;}
    if(M.fus&&M.fus.clearCoat){M.fus.clearCoat.isEnabled=true;M.fus.clearCoat.intensity=.6;M.fus.clearCoat.roughness=.08;}}catch(e){console.warn('paint',e);}

  const _BUILDERS={cessna:buildCessnaModel,cirrus:buildCirrusModel,atr:buildATRModel,e190:buildE190Model,dc9:buildDC9Model,dc10:buildDC10Model,a350:buildA350Model,dc3:buildDC3Model,dc8:buildDC8Model,f18:buildF18Model,b747:buildB747Model,l1011:buildL1011Model,md83:buildMD83Model,a320:buildA320Model,b777:buildB777Model,concorde:buildConcordeModel,crj9:buildCRJ9Model,dhc8:buildDHC8Model,a380:buildA380Model,b727:buildB727Model,b767:buildB767Model};
  const _NJ_BUILDERS={};
  NJ.forEach(p=>{DRESS[p.id]=p.d;_NJ_BUILDERS[p.id]=()=>{const g=buildJet(p.id,p.b);dressModel(p.id,g);g.setEnabled(false);return g;};});
  window._ensureModel=function(id){
    if(modelRoots[id])return modelRoots[id];
    let g=null;
    try{
      if(id==='wonderful'){g=buildWonderfulModel();const wsp=g.metadata&&g.metadata.sparkle;if(wsp){wsp.emitRate=0;scene.onBeforeRenderObservable.add(()=>{wsp.emitRate=(activeModelId==='wonderful'&&!plane.crashed)?26:0;});}}
      else if(_NJ_BUILDERS[id]){g=_NJ_BUILDERS[id]();}
      else if(_BUILDERS[id]){g=_BUILDERS[id]();dressModel(id,g);g.setEnabled(false);}
      if(g){modelRoots[id]=g;try{window.liveryOthers&&window.liveryOthers();}catch(e){}}
    }catch(e){console.warn('lazy model',id,e);}
    return g;
  };
  window.liveryOthers=function(){
    const L=LIVS[curLiv];if(!L)return;
    ['cessna','cirrus','atr','e190','dc9','dc10','a350','dc8','b747','l1011','a380','md83','crj9','dhc8','a320','b777','concorde','b727','b767',...NJ_IDS].forEach(id=>{
      const g=modelRoots[id];if(!g)return;
      const meshId=id==='cessna'?'c172':id;
      const D=DRESS[id],engineNacs=new Set((D&&D.engines||[]).map((_,i)=>id+'_eng'+i));
      g.getChildMeshes().forEach(m=>{const n=m.name;
        if(n===meshId+'_fus')m.material=M.fus;
        else if(n===meshId+'_fin')m.material=M.tail;
        else if(n===meshId+'_wR'||n===meshId+'_wL'||n===meshId+'_hR'||n===meshId+'_hL')m.material=M.wing;
        else if(engineNacs.has(n))m.material=M.nac;
        else if(/_fusStripe/.test(n))m.setEnabled(false);
      });
      if(D&&D.windows&&L.nm){
        const W=D.windows,z=W.z0-(W.z0-W.z1)*.16,y=W.y+(W.h||.25)*1.5;
        const sf=surfHW(D.fus,z,y);
        if(sf){
          if(!g._brandDecals)g._brandDecals=[1,-1].map(side=>{
            const p=BABYLON.MeshBuilder.CreatePlane(id+'_brand'+side,{width:1,height:.12,sideOrientation:BABYLON.Mesh.DOUBLESIDE},scene);
            p.parent=g;p.material=nameMat;p.isPickable=false;
            p.rotation.x=.38;p.rotation.y=side>0?-Math.PI/2:Math.PI/2;return p;
          });
          const span=W.z0-W.z1,width=Math.max(.7,Math.min(7.5,span*.24)),height=width*.105;
          g._brandDecals.forEach((p,k)=>{
            const side=k===0?1:-1;
            p.scaling.set(width,height/.12,1);
            p.position.set(side*(sf.hw+.014),y,z);
            p.setEnabled(true);
          });
        }else if(g._brandDecals)g._brandDecals.forEach(p=>p.setEnabled(false));
      }else if(g._brandDecals)g._brandDecals.forEach(p=>p.setEnabled(false));
    });
  };
  try{window.liveryOthers();}catch(e){console.error(e);}
  window._modelRoots=modelRoots;window._DRESS=DRESS;window._FLEET=FLEET;
  setActiveAircraft(fleet().model);
  window.__flyTo=function(id){const i=typeof id==='number'?id:FLEET.findIndex(f=>f.id===id);if(i<0||!FLEET[i])return 'unknown aircraft';
    C.upgrades.fleet=i;C.maxFleet=Math.max(C.maxFleet,i);save();setActiveAircraft(FLEET[i].model);
    try{contractList=genContractList();renderShop();renderHUD();renderContracts();}catch(e){console.warn(e);}
    return FLEET[i].name;};
  renderHUD();
  renderContracts();
})();
    /* ================= GRAPHICS v3 ================= */
  (function(){
    const HQ=!isTouchDev;
    const V3=BABYLON.Vector3;
    const mkT=(n,S,fn)=>{const t=new BABYLON.DynamicTexture(n,{width:S,height:S},scene,true);const c=t.getContext();fn(c,S);t.update();t.hasAlpha=true;return t;};
    try{
      const puffTex=mkT('puffT',128,(c,S)=>{c.clearRect(0,0,S,S);
        for(let i=0;i<14;i++){const x=S/2+(Math.random()-.5)*S*.42,y=S/2+(Math.random()-.5)*S*.42,r=S*(.16+Math.random()*.16);
          const g=c.createRadialGradient(x,y,1,x,y,r);g.addColorStop(0,'rgba(255,255,255,.55)');g.addColorStop(.6,'rgba(255,255,255,.25)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,S,S);}});
      cloudRoot.getChildMeshes().forEach(m=>m.isVisible=false);
      const NCL=HQ?46:22,PER=HQ?26:14,TILE=46000;
      const sps=new BABYLON.SolidParticleSystem('cumulus',scene,{updatable:true,isPickable:false});
      const q=BABYLON.MeshBuilder.CreatePlane('cuq',{size:1},scene);
      sps.billboard=true;sps.addShape(q,NCL*PER);q.dispose();
      const cm=sps.buildMesh();cm.hasVertexAlpha=true;
      const mat=new BABYLON.StandardMaterial('cuM',scene);mat.diffuseTexture=puffTex;mat.useAlphaFromDiffuseTexture=true;mat.disableLighting=true;
      mat.emissiveColor=new BABYLON.Color3(1,1,1);mat.backFaceCulling=false;mat.alphaMode=BABYLON.Engine.ALPHA_COMBINE;mat.fogEnabled=true;
      cm.material=mat;cm.alwaysSelectAsActiveMesh=true;cm.isPickable=false;
      const C=[];for(let i=0;i<NCL;i++)C.push({x:(Math.random()-.5)*TILE,z:(Math.random()-.5)*TILE,y:1500+Math.random()*1800,w:500+Math.random()*900,tall:.5+Math.random()*.9});
      sps.computeParticleTextures=false;sps.depthSortParticles=true;sps.sortParticles=true;
      sps.initParticles=()=>{for(let i=0;i<sps.nbParticles;i++){const p=sps.particles[i],cl=C[(i/PER)|0],k=i%PER;
        const a=Math.random()*Math.PI*2,rr=Math.sqrt(Math.random()),hgt=Math.pow(Math.random(),1.6);
        p._o=new V3(Math.cos(a)*rr*cl.w*(1-hgt*.55),hgt*cl.w*cl.tall,Math.sin(a)*rr*cl.w*.7*(1-hgt*.55));
        const sz=cl.w*(.45+Math.random()*.5)*(1-hgt*.35);p.scaling.set(sz,sz,sz);p._hgt=hgt;p._cl=cl;p._k=k;}};
      sps.initParticles();
      let tint=1;
      sps.updateParticle=p=>{const cl=p._cl,px=plane.pos.x,pz=plane.pos.z;
        const wx=((cl.x-px)%TILE+TILE*1.5)%TILE-TILE/2,wz=((cl.z-pz)%TILE+TILE*1.5)%TILE-TILE/2;
        const show=p._k<PER&&((C.indexOf(cl))/NCL)<Math.min(1,(currentWeather.cloudCount||1)*.45);
        p.isVisible=show;
        p.position.set(px+wx+p._o.x,cl.y+p._o.y,pz+wz+p._o.z);
        const l=(.62+.38*p._hgt)*tint;p.color.r=l;p.color.g=l;p.color.b=Math.min(1,l*1.05+.03);p.color.a=.95;
        return p;};
      if(C.indexOf)C.forEach((c,i)=>c._i=i);
      let fr=0;
      scene.onBeforeRenderObservable.add(()=>{
        fr++;if(fr%(window._gq>=2?2:4))return;
        const t=TOD[currentTOD]||TOD.noon;tint=(currentWeather.cloudB||1)*(currentTOD==='night'?.12:currentTOD==='dusk'?.45:currentTOD==='golden'?.9:1);
        if(currentTOD==='golden'){mat.emissiveColor.set(1,.82,.66);}else mat.emissiveColor.set(1,1,1);
        sps.setParticles();
      });
      setInterval(()=>cloudRoot.getChildMeshes().forEach(m=>m.isVisible=false),3000);
    }catch(e){console.warn('cumulus',e);}
    if(HQ)try{
      const sd=BABYLON.MeshBuilder.CreatePlane('sunDisc',{size:900},scene);
      const sdm=new BABYLON.StandardMaterial('sunDiscM',scene);sdm.emissiveColor=new BABYLON.Color3(1,.93,.78);sdm.disableLighting=true;sdm.fogEnabled=false;sd.material=sdm;
      sd.billboardMode=BABYLON.Mesh.BILLBOARDMODE_ALL;sd.applyFog=false;sd.isPickable=false;
      window._mkGodrays=()=>{const v=new BABYLON.VolumetricLightScatteringPostProcess('godrays',{postProcessRatio:1,passRatio:.4},camera,sd,60,BABYLON.Texture.BILINEAR_SAMPLINGMODE,engine,false);
        v.exposure=.18;v.decay=.965;v.weight=.5;v.density=.9;return v;};
      scene.onBeforeRenderObservable.add(()=>{const d=sun.direction;const cp=scene.activeCamera.globalPosition;const vls=window._vls;
        sd.position.set(cp.x-d.x*40000,cp.y-d.y*40000,cp.z-d.z*40000);
        const up=-d.y;sd.setEnabled(up>-.02&&currentTOD!=='night');if(vls)vls.exposure=.18*Math.max(0,Math.min(1,up*3))*(currentWeather.sun||1);});
    }catch(e){console.warn('godrays',e);}
    let skid=null;
    try{
      const st=window._smokeTex||mkT('tsT',64,(c,S)=>{const g=c.createRadialGradient(S/2,S/2,1,S/2,S/2,S/2);g.addColorStop(0,'rgba(255,255,255,.7)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,S,S);});
      const tps=new BABYLON.ParticleSystem('tyreSmoke',900,scene);tps.particleTexture=st;
      tps.emitter=new V3(0,0,0);tps.minEmitBox=new V3(-.5,0,-.5);tps.maxEmitBox=new V3(.5,.2,.5);
      tps.color1=new BABYLON.Color4(.85,.85,.85,.55);tps.color2=new BABYLON.Color4(.7,.7,.72,.4);tps.colorDead=new BABYLON.Color4(.6,.6,.6,0);
      tps.minSize=1.2;tps.maxSize=3.2;tps.minLifeTime=1.2;tps.maxLifeTime=3.2;tps.emitRate=0;tps.manualEmitCount=0;
      tps.minEmitPower=1;tps.maxEmitPower=4;tps.direction1=new V3(-1,.6,-1);tps.direction2=new V3(1,1.6,1);tps.gravity=new V3(0,.6,0);
      tps.addSizeGradient(0,1);tps.addSizeGradient(1,4.5);tps.blendMode=BABYLON.ParticleSystem.BLENDMODE_STANDARD;tps.start();
      const sk=BABYLON.MeshBuilder.CreateGround('skidM',{width:.55,height:14},scene);
      const skm=new BABYLON.StandardMaterial('skidMat',scene);skm.diffuseColor=new BABYLON.Color3(.04,.04,.04);skm.specularColor=BABYLON.Color3.Black();skm.alpha=.55;skm.zOffset=-4;
      sk.material=skm;sk.isPickable=false;sk.alwaysSelectAsActiveMesh=true;skid=sk;let nSk=0;
      window._onTouchdown=(sink,hs,noGear,water)=>{
        if(noGear||water||hs<20)return;
        const m=new BABYLON.Matrix();plane.quat.toRotationMatrix(m);
        const r=V3.TransformNormal(new V3(1,0,0),m),f=V3.TransformNormal(new V3(0,0,1),m);
        const track=Math.max(1.6,(ACFG.gearHeight||2.5)*.9),gy=sampleSurface(plane.pos.x,plane.pos.z);
        const yaw=Math.atan2(f.x,f.z),n=Math.round(30+Math.min(260,sink*90+hs*.6));
        for(const sd of [-1,1]){
          tps.emitter=new V3(plane.pos.x+r.x*track*sd,gy+.4,plane.pos.z+r.z*track*sd);tps.manualEmitCount=n;tps.start();
          if(nSk<260){sk.thinInstanceAdd(BABYLON.Matrix.Compose(new V3(1,1,.6+Math.min(2,sink*.4)),BABYLON.Quaternion.RotationYawPitchRoll(yaw,0,0),new V3(plane.pos.x+r.x*track*sd,gy+.06,plane.pos.z+r.z*track*sd)));nSk++;}
        }
        setTimeout(()=>{try{tps.emitter=new V3(plane.pos.x-r.x*track,gy+.4,plane.pos.z-r.z*track);tps.manualEmitCount=n;}catch(e){}},60);
      };
    }catch(e){console.warn('tyresmoke',e);}
    try{
      const ct=mkT('ctT',64,(c,S)=>{const g=c.createRadialGradient(S/2,S/2,1,S/2,S/2,S/2);g.addColorStop(0,'rgba(255,255,255,.8)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,S,S);});
      const trails=[];
      for(let i=0;i<4;i++){const ps=new BABYLON.ParticleSystem('contrail'+i,HQ?2500:900,scene);ps.particleTexture=ct;
        const em=new BABYLON.TransformNode('ctEm'+i,scene);em.parent=aircraftRoot;ps.emitter=em;
        ps.minEmitBox=ps.maxEmitBox=new V3(0,0,0);ps.color1=new BABYLON.Color4(1,1,1,.55);ps.color2=new BABYLON.Color4(.95,.97,1,.45);ps.colorDead=new BABYLON.Color4(1,1,1,0);
        ps.minSize=1.5;ps.maxSize=2.5;ps.addSizeGradient(0,.6);ps.addSizeGradient(1,9);ps.minLifeTime=6;ps.maxLifeTime=10;ps.emitRate=0;
        ps.minEmitPower=0;ps.maxEmitPower=.3;ps.direction1=new V3(-.1,-.1,-.1);ps.direction2=new V3(.1,.1,.1);ps.blendMode=BABYLON.ParticleSystem.BLENDMODE_STANDARD;
        ps.isLocal=false;ps.start();trails.push({ps,em});}
      const vort=[];
      for(const sd of [-1,1]){const ps=new BABYLON.ParticleSystem('vortex'+sd,600,scene);ps.particleTexture=ct;const em=new BABYLON.TransformNode('vxEm'+sd,scene);em.parent=aircraftRoot;ps.emitter=em;
        ps.minEmitBox=ps.maxEmitBox=new V3(0,0,0);ps.color1=new BABYLON.Color4(1,1,1,.05);ps.color2=new BABYLON.Color4(1,1,1,.03);ps.addSizeGradient(0,.35);ps.addSizeGradient(1,1.1);ps.colorDead=new BABYLON.Color4(1,1,1,0);
        ps.minSize=.12;ps.maxSize=.25;ps.minLifeTime=.5;ps.maxLifeTime=1.1;ps.emitRate=0;ps.minEmitPower=0;ps.maxEmitPower=.1;ps.start();vort.push({ps,em,sd});}
      scene.onBeforeRenderObservable.add(()=>{
       const D=window._DRESS[window._activeModelId];
        const eng=(D&&D.engines)||[{x:5,y:-1.5,zR:-3},{x:-5,y:-1.5,zR:-3}];
        const altFt=plane.pos.y*3.28084,on=altFt>26000&&ENG.L.state==='RUNNING'&&!plane.crashed;
        const k=on?Math.min(1,(altFt-26000)/3000):0;
        trails.forEach((t,i)=>{const e=eng[i];if(!e||e.prop){t.ps.emitRate=0;return;}t.em.position.set(e.x,e.y,e.zR-8);t.ps.emitRate=k*(HQ?240:90)*(.4+plane.throttle*.6);});
        const tip=D&&D.wing?D.wing[D.wing.length-1]:{s:16,y:0,zLE:-4,c:1.5};
        const g=Math.max(0,(plane.gLoad||plane.gForce||1)-1),aoa=Math.abs(plane.alpha||0);
        const hum=currentWeather.rain||currentWeather.name==='FOG'||currentWeather.name==='CLOUDY'?1:.4;
        const vk=(!plane.onGround&&plane.speed>45&&(aoa>.2||g>.8))?Math.min(1,(aoa-.16)*6+g*.5)*hum:0;
        vort.forEach(v=>{v.em.position.set(v.sd*tip.s,tip.y,tip.zLE-tip.c);v.ps.emitRate=vk*120;});
      });
    }catch(e){console.warn('contrails',e);}
       scene.onBeforeRenderObservable.add(()=>{
      const g = window._modelRoots ? window._modelRoots[window._activeModelId] : null;
      if(!g) return;
      const c = plane.onGround || Math.abs(plane.gearCompress||0) > .01 ? (plane.gearCompress||0) : 0;
      g.position.y = -c * .32;
    });
    try{const dp=scene.postProcessRenderPipelineManager.supportedPipelines[0];
      if(dp&&HQ){dp.samples=4;dp.fxaaEnabled=true;dp.imageProcessing.exposure=Math.max(dp.imageProcessing.exposure,1.12);
        dp.bloomThreshold=.78;dp.bloomWeight=.32;dp.imageProcessing.colorCurves&&(dp.imageProcessing.colorCurves.globalSaturation=18);}}catch(e){}
    try{if(HQ){terrainMat.specularIntensity=.1;terrainMat.environmentIntensity=.55;}}catch(e){}
    try{
      const dp=scene.postProcessRenderPipelineManager.supportedPipelines[0];
      if(dp){dp.grainEnabled=false;dp.chromaticAberrationEnabled=false;dp.sharpenEnabled=true;dp.sharpen.edgeAmount=.55;dp.sharpen.colorAmount=1;
        dp.imageProcessing.vignetteWeight=.8;dp.bloomKernel=48;}
      const nativeScale=1/Math.min(window.devicePixelRatio||1,2);
      const NAMES=['LOW','MEDIUM','HIGH','ULTRA'];
      let q=-1;
      const setQ=(n,quiet)=>{n=Math.max(0,Math.min(3,n));if(n===q)return;q=n;window._gq=n;
        try{localStorage.setItem('fs_gfx',String(n));}catch(e){}
        engine.setHardwareScalingLevel(n===0?Math.max(nativeScale,1):nativeScale);
        if(dp){dp.samples=[1,1,2,4][n];dp.fxaaEnabled=true;dp.bloomEnabled=n>=1;dp.bloomWeight=[0,.25,.32,.35][n];}
        try{if(window._glow)window._glow.isEnabled=n>=1;}catch(e){}
        try{const c=window._csm;if(c){sun.shadowEnabled=n>=1;c.numCascades=[2,2,3,4][n];c.filteringQuality=n>=3?BABYLON.ShadowGenerator.QUALITY_HIGH:BABYLON.ShadowGenerator.QUALITY_MEDIUM;}}catch(e){console.warn('q shadows',e);}
        try{if(n>=2&&!window._vls&&window._mkGodrays)window._vls=window._mkGodrays();
            else if(n<2&&window._vls){window._vls.dispose(camera);window._vls=null;}}catch(e){console.warn('q godrays',e);}
        try{terrainMat.detailMap&&(terrainMat.detailMap.isEnabled=n>=1);}catch(e){}
        try{if(trunkMesh)trunkMesh.isVisible=n>=1;if(window._rtMesh)window._rtMesh.isVisible=n>=1;}catch(e){}
        try{if(window._ssao)window._ssao.isSupported&&(window._ssao.totalStrength=n<1?0:[0,.6,.9,1.1][n]);scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline&&(n>=1?scene.postProcessRenderPipelineManager.attachCamerasToRenderPipeline('ssao',camera):scene.postProcessRenderPipelineManager.detachCamerasFromRenderPipeline('ssao',camera));}catch(e){}
        const chip=document.getElementById('gfxChip');if(chip)chip.textContent='GFX · '+NAMES[n];
        if(!quiet)showMsg('GRAPHICS: '+NAMES[n],1500);};
      window.setGraphicsQuality=n=>{auto=false;setQ(n);};
      const chip=document.createElement('button');chip.id='gfxChip';
      chip.style.cssText='position:fixed;right:14px;bottom:62px;z-index:60;font:600 11px system-ui,sans-serif;letter-spacing:.08em;padding:7px 11px;border-radius:9px;border:1px solid rgba(120,220,255,.45);background:rgba(10,20,34,.78);color:#bfefff;cursor:pointer';
      chip.title='Graphics quality (O)';chip.onclick=()=>{auto=false;setQ((q+1)%4);};document.body.appendChild(chip);
      window.addEventListener('keydown',e=>{if(e.code==='KeyO'&&!/INPUT|SELECT|TEXTAREA/.test((e.target||{}).tagName||'')){auto=false;setQ((q+1)%4);}});
      let saved=null;try{saved=localStorage.getItem('fs_gfx');}catch(e){}
      let auto=saved===null;
      setQ(saved!==null?+saved:(isTouchDev?0:2),true);
      let acc=0,fr=0,low=0,high=0;
      scene.onAfterRenderObservable.add(()=>{acc+=engine.getDeltaTime();fr++;if(acc<2000)return;
        const fps=fr*1000/acc;acc=0;fr=0;if(!auto)return;
        if(fps<32){low++;high=0;if(low>=2&&q>0){setQ(q-1);low=0;}}
        else if(fps>58){high++;low=0;if(high>=6&&q<2){setQ(q+1);high=0;}}else{low=0;high=0;}});
    }catch(e){console.warn('quality',e);}
    try{
      const S=256,dt=new BABYLON.DynamicTexture('terrDetail',{width:S,height:S},scene,true),c=dt.getContext(),id=c.createImageData(S,S);
      const hs=(x,y)=>{let h=Math.imul(x&255,374761393)+Math.imul(y&255,668265263);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296;};
      const vn=(x,y,f)=>{const X=x*f,Y=y*f,xi=Math.floor(X),yi=Math.floor(Y),u=X-xi,v=Y-yi;const w=a=>((a%(f*1))+f)%f;
        const a=hs(w(xi),w(yi)),b=hs(w(xi+1),w(yi)),cc=hs(w(xi),w(yi+1)),d=hs(w(xi+1),w(yi+1)),su=u*u*(3-2*u),sv=v*v*(3-2*v);return(a*(1-su)+b*su)*(1-sv)+(cc*(1-su)+d*su)*sv;};
      const H=new Float32Array(S*S);
      for(let y=0;y<S;y++)for(let x=0;x<S;x++){const X=x/S,Y=y/S;H[y*S+x]=vn(X,Y,8)*.5+vn(X,Y,32)*.3+vn(X,Y,64)*.2;}
      for(let y=0;y<S;y++)for(let x=0;x<S;x++){const i=y*S+x,o=i*4,h=H[i];
        const dx=H[y*S+((x+1)%S)]-H[y*S+((x-1+S)%S)],dy=H[((y+1)%S)*S+x]-H[((y-1+S)%S)*S+x];
        id.data[o]=(.5+(h-.5)*.55)*255;id.data[o+1]=(.5-dy*2.2)*255;id.data[o+2]=128;id.data[o+3]=(.5-dx*2.2)*255;}
      c.putImageData(id,0,0);dt.update(false);dt.wrapU=dt.wrapV=BABYLON.Texture.WRAP_ADDRESSMODE;
      dt.uScale=dt.vScale=CFG.terrainExtent/40;dt.anisotropicFilteringLevel=16;
      terrainMat.detailMap.texture=dt;terrainMat.detailMap.isEnabled=(window._gq||0)>=1;
      terrainMat.detailMap.diffuseBlendLevel=.55;terrainMat.detailMap.normalBlendLevel=.35;terrainMat.detailMap.roughnessBlendLevel=0;
    }catch(e){console.warn('detail',e);}
    try{const st=document.createElement('style');st.textContent='body.photoMode *{visibility:hidden!important}body.photoMode #renderCanvas{visibility:visible!important}';document.head.appendChild(st);
      window.addEventListener('keydown',e=>{if(e.code==='KeyU'&&!/INPUT|SELECT|TEXTAREA/.test((e.target||{}).tagName||''))document.body.classList.toggle('photoMode');});}catch(e){}
    scene.onBeforeRenderObservable.add(()=>{try{const a=Math.min(1,plane.pos.y/9000);scene.fogDensity=currentWeather.fogD*(1-a*.55);}catch(e){}});
  })();

  /* ================= GRAPHICS v5 · MSFS-STYLE ATMOSPHERE ================= */
  (function(){
    const V3=BABYLON.Vector3,SM=BABYLON.ShaderMaterial;
    if(!SM||!skybox)return;
    const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)),lerp=(a,b,t)=>a+(b-a)*t;
    const sstep=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
    const mix3=(a,b,t)=>[lerp(a[0],b[0],t),lerp(a[1],b[1],t),lerp(a[2],b[2],t)];
    const mul3=(a,k)=>[a[0]*k,a[1]*k,a[2]*k],add3=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
    const lum3=a=>a[0]*.2126+a[1]*.7152+a[2]*.0722;
    const S=BABYLON.Effect.ShadersStore;

    const COMMON=`
precision highp float;
uniform vec3 uSunDir,uMoonDir,uZenith,uHorizon,uHorizonSun,uSunCol,uCloudLit,uCloudShade,uCamPos,uAmb;
uniform float uNight,uCloudCov,uCirrus,uSunVis,uTime,uPost,uMoonI,uCloudHi,uOct;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float h31(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}
float fbmL(vec2 p,float fw){float v=0.,a=.5,fr=1.,w=0.;mat2 R=mat2(.8,-.6,.6,.8);
  for(int i=0;i<5;i++){if(float(i)>=uOct)break;float k=1.-smoothstep(.22,.5,fw*fr);v+=a*k*vn(p);w+=a*k;p=R*p*2.03+17.1;a*=.5;fr*=2.03;}
  return v/max(w,.0001);}
vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}
float starLayer(vec3 d,float sc,float prob,float sz){vec3 p=d*sc,id=floor(p),f=fract(p)-.5;
  float r=h31(id);if(r>prob)return 0.;
  vec3 off=(vec3(h31(id+1.7),h31(id+5.3),h31(id+9.1))-.5)*.62;
  float b=smoothstep(sz,0.,length(f-off));
  float tw=.8+.2*sin(uTime*(2.+r*30.)+r*50.);
  return b*b*(.35+.65*h31(id+3.3))*tw;}
vec3 skyBase(vec3 d,bool disc){
  float h=d.y;
  vec2 hz=d.xz;float hl=length(hz);hz=hl>1e-4?hz/hl:vec2(1.,0.);
  vec2 sz=uSunDir.xz;float sl=length(sz);sz=sl>1e-4?sz/sl:vec2(1.,0.);
  float az=pow(max(dot(hz,sz),0.),2.2);
  vec3 hor=mix(uHorizon,uHorizonSun,az);
  float hh=clamp(h,0.,1.);
  float t1=exp(-hh*6.5),t2=exp(-hh*2.1);
  vec3 col=mix(uZenith,mix(uZenith,hor,.5),t2);
  col=mix(col,hor,t1);
  col=mix(col,uHorizon*.85,1.-smoothstep(-.14,0.,h));
  float c=dot(d,uSunDir);
  float g=.80,hg=(1.-g*g)/pow(1.+g*g-2.*g*c,1.5);
  col+=uSunCol*hg*.020*(.3+1.5*t1)*(.2+.8*uSunVis);
  col+=uSunCol*pow(max(c,0.),3.)*.035*(.4+t1*2.)*uSunVis;
  if(disc){float s=length(cross(d,uSunDir));
    float dk=c>0.?1.-smoothstep(.0058,.0086,s):0.;
    col+=uSunCol*dk*55.*uSunVis*smoothstep(-.03,.012,h);}
  return col;}
vec3 clouds(vec3 d,vec3 col,float lodk){
  if(d.y<=.004)return col;
  float fade=smoothstep(.006,.12,d.y);
  vec2 hd=normalize(d.xz+vec2(1e-5));vec3 hz=skyBase(vec3(hd.x,0.,hd.y),false);
  if(uCloudCov>.02&&uCamPos.y<uCloudHi-250.){
    float t=(uCloudHi-uCamPos.y)/d.y;
    vec2 q=(uCamPos.xz+d.xz*t)*.00020+vec2(uTime*.010,uTime*.004);
    float fw=.0009*t/max(d.y,.02)*.00020*lodk;
    float n=fbmL(q,fw),n2=fbmL(q+uSunDir.xz*.10,fw);
    float th=1.-uCloudCov*1.02;
    float dens=smoothstep(th-.02,th+.20,n);
    float lit=clamp(.55+(n-n2)*3.4,0.,1.);
    vec3 cc=mix(uCloudShade,uCloudLit,lit*(1.-.35*dens*dens));
    cc+=uSunCol*.10*pow(max(dot(d,uSunDir),0.),5.)*(1.-dens*.7)*uSunVis;
    cc=mix(cc,hz,(1.-fade)*.7+exp(-d.y*9.)*.35);
    col=mix(col,cc,dens*fade*clamp(.15+uCloudCov*1.6,0.,1.));}
  if(uCirrus>.01&&uCamPos.y<9000.){
    float t=(9800.-uCamPos.y)/d.y;
    vec2 w=uCamPos.xz+d.xz*t;
    vec2 q=vec2(w.x*.00010+w.y*.00005,w.y*.00026-w.x*.00007)+vec2(uTime*.006,0.);
    float fw=.0009*t/max(d.y,.02)*.00026*lodk;
    float n=fbmL(q*1.0+fbmL(q*.6,fw)*1.3,fw);
    float a=smoothstep(.46,.84,n)*uCirrus*fade;
    vec3 cc=uCloudLit*1.08+uSunCol*.14*pow(max(dot(d,uSunDir),0.),4.)*uSunVis;
    cc=mix(cc,hz,exp(-d.y*8.)*.5);
    col=mix(col,cc,a*.62);}
  return col;}
vec3 stars(vec3 d,vec3 col){
  if(uNight<.01||d.y<-.02)return col;
  float s=starLayer(d,150.,.20,.17)*.9+starLayer(d,62.,.14,.20)*1.5+starLayer(d,26.,.08,.16)*2.2;
  vec3 gn=normalize(vec3(.35,.85,.4));float gl=dot(d,gn);
  float band=exp(-gl*gl*26.);
  float dust=fbmL(vec2(atan(d.z,d.x)*5.,d.y*9.),0.);
  vec3 sc=vec3(.85,.9,1.)*s+vec3(.45,.5,.72)*band*(.25+.9*dust)*.07;
  sc*=smoothstep(-.02,.2,d.y);
  return col+sc*uNight*3.;}
vec3 moon(vec3 d,vec3 col){
  if(uMoonI<.01)return col;
  float mc=dot(d,uMoonDir);if(mc<.9)return col;
  float ms=length(cross(d,uMoonDir));
  vec3 mT=normalize(cross(uMoonDir,vec3(0.,1.,0.)));vec3 mB=cross(mT,uMoonDir);
  vec2 mp=vec2(dot(d,mT),dot(d,mB))/.0105;
  float disk=1.-smoothstep(.0098,.0108,ms);
  float rr=dot(mp,mp);
  vec3 nn=vec3(mp,sqrt(max(1.-rr,0.)));
  float ph=clamp(dot(nn,normalize(vec3(.62,.22,.75)))*1.4,0.,1.);
  float maria=.72+.28*smoothstep(.3,.62,fbmL(mp*2.6+4.,0.));
  vec3 mcol=vec3(.86,.9,1.)*ph*maria*3.4;
  col+=mcol*disk*uMoonI;
  col+=vec3(.5,.62,.9)*(pow(max(mc,0.),90.)*.16+pow(max(mc,0.),1400.)*.7)*uMoonI;
  return col;}
vec3 skyFull(vec3 d,bool disc,float lodk){
  vec3 c=skyBase(d,disc);
  if(disc){c=stars(d,c);c=moon(d,c);}
  c=clouds(d,c,lodk);
  return c;}
`;

    S['gfx5skyVertexShader']=`precision highp float;attribute vec3 position;uniform mat4 worldViewProjection;varying vec3 vDir;
void main(){vDir=position;vec4 p=worldViewProjection*vec4(position,1.);gl_Position=p.xyww;}`;
    S['gfx5skyFragmentShader']=COMMON+`varying vec3 vDir;
void main(){vec3 d=normalize(vDir);vec3 c=skyFull(d,true,1.);
  c+=(h21(gl_FragCoord.xy+uTime)-.5)*.004;
  if(uPost<.5){c=aces(c*1.18);c=pow(c,vec3(1./2.2));}
  gl_FragColor=vec4(c,1.);}`;

    S['gfx5waterVertexShader']=`precision highp float;attribute vec3 position;uniform mat4 world,worldViewProjection;varying vec3 vWP;
void main(){vec4 wp=world*vec4(position,1.);vWP=wp.xyz;gl_Position=worldViewProjection*vec4(position,1.);}`;
    S['gfx5waterFragmentShader']=COMMON+`varying vec3 vWP;
uniform vec3 uFogCol,uWaterCol,uShallow;uniform float uFogD,uWind,uChop,uCloudRefl,uWaves;
vec3 waveGrad(vec2 p,float dist,float vy,float wind,out float whitecap){
  vec2 g=vec2(0.);float foam=0.;
  float foot=dist*.0013/max(abs(vy),.07);
  for(int i=0;i<8;i++){
    if(float(i)>=uWaves)break;
    float fi=float(i);
    float lam=190.*pow(.60,fi);
    float ang=.55+(fract(sin(fi*12.9898)*43758.5453)-.5)*1.9;
    vec2 dr=vec2(cos(ang),sin(ang));
    float T=sqrt(6.2832*lam/9.81);
    float ph=dot(dr,p)/lam-uTime/T+fi*.37+(vn(p/(lam*1.3)+fi*3.1)-.5)*(1.6+fi*.7)+(vn(p/(lam*.45)+fi*5.7)-.5)*fi*.35;
    float s=wind*(.022+.0035*fi)*(.55+.9*vn(p*.004/(1.+fi*.3)+fi*7.3));
    float lod=smoothstep(3.*foot,12.*foot,lam);
    float sl=s*lod;
    g+=dr*sl*cos(ph*6.2832);
    foam+=sl*(sin(ph*6.2832)*.5+.5)*step(3.,fi);
  }
  whitecap=foam;
  return vec3(g,0.);}
void main(){
  vec3 Vv=uCamPos-vWP;float dist=length(Vv);vec3 V=Vv/dist;
  float wc;
  vec3 gr=waveGrad(vWP.xz,dist,V.y,uChop,wc);
  vec3 N=normalize(vec3(-gr.x,1.,-gr.y));
  float cosV=clamp(dot(N,V),0.,1.);
  vec3 R=reflect(-V,N);R.y=abs(R.y)+.015;R=normalize(R);
  float F=.02+.98*pow(1.-cosV,5.);
  F=mix(F,min(1.,F*1.35),.5);
  vec3 refl=skyFull(R,false,2.4);
  if(uCloudRefl<.5)refl=skyBase(R,false);
  float rs=max(dot(R,uSunDir),0.);
  vec3 spec=uSunCol*(pow(rs,1800.)*60.+pow(rs,260.)*5.5+pow(rs,36.)*.42)*uSunVis*smoothstep(-.02,.1,uSunDir.y);
  spec+=vec3(.55,.68,1.)*uMoonI*(pow(max(dot(R,uMoonDir),0.),600.)*5.+pow(max(dot(R,uMoonDir),0.),60.)*.25);
  float nl=max(dot(N,uSunDir),0.);
  vec3 body=uWaterCol*(uAmb*2.4+uSunCol*nl*.9*uSunVis)+uShallow*pow(max(dot(N,normalize(uSunDir*.6+V*.4)),0.),3.)*uSunVis*(uAmb+uSunCol*.3);
  vec3 col=mix(body,refl,F)+spec*F;
  float foam=smoothstep(.20,.34,wc*uChop*1.9)*clamp((uChop-.45)*2.4,0.,1.)*(.5+.5*vn(vWP.xz*.45+uTime*.3));
  col=mix(col,(uAmb*1.5+uSunCol*.5*uSunVis)*.95,foam*.8);
  float ff=exp(-pow(dist*uFogD,2.));
  col=mix(uFogCol,col,ff);
  if(uPost<.5){col=aces(col*1.18);col=pow(col,vec3(1./2.2));}
  gl_FragColor=vec4(col,1.);}`;

    const UNI=['worldViewProjection','world','uSunDir','uMoonDir','uZenith','uHorizon','uHorizonSun','uSunCol','uCloudLit','uCloudShade','uCamPos','uAmb','uNight','uCloudCov','uCirrus','uSunVis','uTime','uPost','uMoonI','uCloudHi','uFogCol','uWaterCol','uShallow','uFogD','uWind','uChop','uCloudRefl','uOct','uWaves'];
    const mats=[];
    let skyM=null,waterM=null;
    try{skyM=new SM('gfx5sky',scene,{vertex:'gfx5sky',fragment:'gfx5sky'},{attributes:['position'],uniforms:UNI});skyM.backFaceCulling=false;skyM.disableDepthWrite=true;skyM.fogEnabled=false;skybox.material=skyM;mats.push(skyM);}catch(e){console.warn('[gfx5] sky',e);skyM=null;}
    try{if(waterMesh){waterM=new SM('gfx5water',scene,{vertex:'gfx5water',fragment:'gfx5water'},{attributes:['position'],uniforms:UNI});waterM.backFaceCulling=false;waterMesh.material=waterM;mats.push(waterM);}}catch(e){console.warn('[gfx5] water',e);waterM=null;}
    if(!mats.length)return;

    const KF=[[-24,[.0012,.0025,.008],[.003,.005,.012],[.003,.005,.012]],[-12,[.004,.009,.028],[.014,.02,.05],[.02,.024,.055]],[-6,[.012,.026,.085],[.06,.06,.12],[.16,.10,.15]],[-2,[.025,.055,.17],[.14,.12,.17],[.55,.24,.17]],[1,[.035,.085,.24],[.22,.19,.22],[.85,.36,.16]],[5,[.05,.125,.34],[.34,.3,.3],[.95,.5,.24]],[12,[.06,.165,.45],[.38,.4,.44],[.82,.58,.38]],[25,[.065,.2,.56],[.40,.48,.58],[.62,.58,.52]],[60,[.065,.215,.62],[.42,.53,.66],[.56,.60,.66]]];
    function kf(el){if(el<=KF[0][0])return KF[0].slice(1);for(let i=1;i<KF.length;i++){if(el<=KF[i][0]){const a=KF[i-1],b=KF[i],t=sstep(0,1,(el-a[0])/(b[0]-a[0]));return[mix3(a[1],b[1],t),mix3(a[2],b[2],t),mix3(a[3],b[3],t)];}}return KF[KF.length-1].slice(1);}
    function sunRad(el){const t=sstep(-1,45,el);const c=t<.35?mix3([1,.36,.12],[1,.70,.46],t/.35):mix3([1,.70,.46],[1,.955,.9],(t-.35)/.65);return mul3(c,sstep(-5,1.5,el));}
    const WXM={CLEAR:{oc:0,cov:.30,cir:.65,hi:4300},CLOUDY:{oc:.42,cov:.66,cir:.25,hi:3600},RAIN:{oc:.80,cov:.88,cir:0,hi:2300},STORM:{oc:.93,cov:.97,cir:0,hi:1900},FOG:{oc:.78,cov:.15,cir:0,hi:900},SNOW:{oc:.66,cov:.80,cir:.05,hi:2600},CROSSWIND:{oc:.08,cov:.36,cir:.5,hi:4300},TURBULENT:{oc:.30,cov:.58,cir:.2,hi:3400}};
    const st=window._sky5={el:30,hor:[.4,.5,.6],hs:[.5,.5,.5],zen:[.07,.2,.55],sunCol:[1,.95,.9],sunVis:1,oc:0,fogMix:0,lit:[1,1,1],shade:[.5,.55,.65],amb:[.2,.3,.45],night:0,tick:0};
    const vec={};['uSunDir','uMoonDir','uZenith','uHorizon','uHorizonSun','uSunCol','uCloudLit','uCloudShade','uCamPos','uAmb','uFogCol','uWaterCol','uShallow'].forEach(k=>vec[k]=new V3());
    const setAll=(fn)=>{for(const m of mats)try{fn(m);}catch(e){}};
    const setV=(k,a)=>{vec[k].set(a[0],a[1],a[2]);setAll(m=>m.setVector3(k,vec[k]));};
    const setF=(k,v)=>setAll(m=>m.setFloat(k,v));
    const hg=(c,g)=>(1-g*g)/Math.pow(1+g*g-2*g*c,1.5);
    const tmpF=new V3();
    function recompute(){
      const sd=sun.direction,sx=-sd.x,sy=-sd.y,sz=-sd.z,len=Math.hypot(sx,sy,sz)||1;
      const dx=sx/len,dy=sy/len,dz=sz/len;
      const el=Math.asin(clamp(dy,-1,1))*180/Math.PI;
      const wx=currentWeather||WEATHER.clear,wm=WXM[wx.name]||WXM.CLEAR;
      let [zen,hor,hs]=kf(el);
      const sc=sunRad(el),oc=wm.oc;
      const g=lum3(hor);
      const grayHor=[g*.95,g,g*1.07],grayZen=[g*.72,g*.78,g*.9];
      zen=mix3(zen,add3(grayZen,mul3(zen,.25)),oc*.88);hor=mix3(hor,grayHor,oc*.85);hs=mix3(hs,mix3(hor,hs,.25),oc*.9);
      const fogMix=sstep(.0005,.0032,wx.fogD||0);
      const dayK=clamp(lum3(kf(Math.max(el,-1))[1])/.4,0,1.2);
      const fogTarget=mul3(wx.fogC||[.7,.75,.8],Math.max(.05,Math.min(1,dayK*1.1)));
      zen=mix3(zen,mul3(fogTarget,.92),fogMix*.9);hor=mix3(hor,fogTarget,fogMix);hs=mix3(hs,mul3(fogTarget,1.05),fogMix);
      const sunVis=Math.pow(Math.max(0,1-oc*1.05),1.5)*(1-fogMix*.85);
      const amb=mix3(zen,hor,.5),night=sstep(-5,-15,el);
      let lit=add3(mul3(sc,1.05*sunVis+.12),amb);
      lit=mix3(lit,mul3([1,1.02,1.06],lum3(hor)*1.5+.02),oc*.7);
      let shade=add3(mul3(amb,1.05),[.05,.06,.09]);shade=mul3(shade,1-oc*.45);
      Object.assign(st,{el,hor,hs,zen,sunCol:sc,sunVis,oc,fogMix,lit,shade,amb,night,dir:[dx,dy,dz]});
      vec.uSunDir.set(dx,dy,dz);setAll(m=>m.setVector3('uSunDir',vec.uSunDir));
      let mx=-dx*.8+.25,my=-dy*.75+.34,mz=-dz*.8+.1;const ml=Math.hypot(mx,my,mz);vec.uMoonDir.set(mx/ml,my/ml,mz/ml);setAll(m=>m.setVector3('uMoonDir',vec.uMoonDir));
      setV('uZenith',zen);setV('uHorizon',hor);setV('uHorizonSun',hs);setV('uSunCol',sc);setV('uCloudLit',lit);setV('uCloudShade',shade);setV('uAmb',amb);
      setF('uSunVis',sunVis);setF('uNight',night*(1-oc*.9)*(1-fogMix));setF('uMoonI',night*(1-oc)*(1-fogMix));
      setF('uCloudCov',wm.cov*(1-fogMix*.6));setF('uCirrus',wm.cir*(1-oc)*(1-fogMix));setF('uCloudHi',wm.hi);setF('uPost',st.post?1:0);
      const wd=clamp(lum3(amb)*5,0,1);
      setV('uWaterCol',mix3([.010,.030,.050],[.018,.070,.092],wd));setV('uShallow',mix3([0,.01,.012],[.015,.075,.07],wd));
      setF('uWind',clamp((wx.wind||4)/22,0,1));setF('uChop',clamp(.30+(wx.wind||4)/22*.85+(wx.rain?.12:0),0,1.05));
      setF('uCloudRefl',(window._gq==null||window._gq>=2)?1:0);
      setF('uOct',(window._gq==null||window._gq>=2)?5:(window._gq>=1?3:2));setF('uWaves',(window._gq==null||window._gq>=2)?8:(window._gq>=1?6:4));
      try{const lc=el>30?[1,.965,.9]:mix3(mix3([1,.5,.22],[1,.78,.58],sstep(0,12,el)),[1,.95,.88],sstep(10,32,el));
        sun.diffuse=new BABYLON.Color3(lc[0],lc[1],lc[2]);sun.specular=new BABYLON.Color3(Math.min(1,lc[0]*1.05),lc[1],lc[2]);
        const an=Math.max(amb[0],amb[1],amb[2],.001);const hc=mix3([amb[0]/an,amb[1]/an,amb[2]/an],[1,1,1],.38);
        hemi.diffuse=new BABYLON.Color3(hc[0],hc[1],hc[2]);
        const gb=mix3([.30,.33,.28],mul3(lc,.42),.5);hemi.groundColor=new BABYLON.Color3(gb[0]*(.4+.6*sstep(-4,12,el)),gb[1]*(.4+.6*sstep(-4,12,el)),gb[2]*(.4+.6*sstep(-4,12,el)));}catch(e){}
    }
    function horizonAt(az,out){
      const d=st.dir,hx=Math.cos(az),hz=Math.sin(az),sl=Math.hypot(d[0],d[2])||1,sxn=d[0]/sl,szn=d[2]/sl;
      const a=Math.pow(Math.max(hx*sxn+hz*szn,0),2.2),c=hx*d[0]+hz*d[2];
      const glow=hg(c,.8)*.020*1.8*(.2+.8*st.sunVis)+Math.pow(Math.max(c,0),3)*.035*2.4*st.sunVis;
      for(let i=0;i<3;i++)out[i]=lerp(st.hor[i],st.hs[i],a)+st.sunCol[i]*Math.min(glow,1.4);
      return out;}
    const fc=[0,0,0],fa=[0,0,0];
    function fogUpdate(){
      const cam=scene.activeCamera||camera;cam.getDirectionToRef(BABYLON.Axis.Z,tmpF);
      const az0=Math.atan2(tmpF.z,tmpF.x);fa[0]=fa[1]=fa[2]=0;
      for(let k=-2;k<=2;k++){horizonAt(az0+k*.28,fc);fa[0]+=fc[0]/5;fa[1]+=fc[1]/5;fa[2]+=fc[2]/5;}
      const alt=clamp((cam.globalPosition?cam.globalPosition.y:cam.position.y)/12000,0,1),k=1-alt*.18;
      if(typeof XF!=='undefined'&&XF.fog0)return;
      scene.fogColor.set(fa[0]*k,fa[1]*k,fa[2]*k);scene.clearColor.set(fa[0]*k,fa[1]*k,fa[2]*k,1);
      vec.uFogCol.set(fa[0]*k,fa[1]*k,fa[2]*k);
      if(waterM){waterM.setVector3('uFogCol',vec.uFogCol);waterM.setFloat('uFogD',scene.fogDensity);}
    }
    let fr=0,lastKey='';
      scene.onBeforeRenderObservable.add(()=>{
      try{
        const cam=scene.activeCamera||camera,cp=cam.globalPosition||cam.position;
        const key=sun.direction.x.toFixed(3)+sun.direction.y.toFixed(3)+(currentWeather&&currentWeather.name)+(window._gq|0);
        if(key!==lastKey||(fr%90===0)){lastKey=key;st.post=!!(scene.postProcessRenderPipelineManager.supportedPipelines[0]);recompute();}
        fr++;
        vec.uCamPos.set(cp.x,cp.y,cp.z);
        const t=(performance.now()*.001)%100000;
        setAll(m=>{m.setVector3('uCamPos',vec.uCamPos);m.setFloat('uTime',t);});
        fogUpdate();
      }catch(e){if(!window._g5err){window._g5err=1;console.warn('[gfx5] frame',e);}}
    });
    try{recompute();fogUpdate();}catch(e){console.warn('[gfx5] init',e);}
    window._gfx5={recompute,st,skyM,waterM};
    console.log('[gfx5] atmosphere online');
  })();

  /* ---- WONDERFUL PLANE GIMMICK v4: ONE continuous "wonderful" held forever ---- */
  let _wCtx=null,_wSrc=null,_wGain=null,_wActive=false,_wTrem=null,_wVolTap=null;
  function _wonderPitchHz(){const vsFpm=plane.vel.y*196.85;return Math.max(80,Math.min(600,220+vsFpm*0.06));}
  function _wonderStart(){
    if(_wActive)return;_wActive=true;
    try{
      if(!_wCtx)_wCtx=new(window.AudioContext||window.webkitAudioContext)();
      if(_wCtx.state==='suspended')_wCtx.resume();
      _wGain=_wCtx.createGain();_wGain.gain.setValueAtTime(0,_wCtx.currentTime);_wGain.gain.linearRampToValueAtTime(0.3,_wCtx.currentTime+0.08);
      _wTrem=_wCtx.createGain();_wTrem.gain.value=1;
      _wVolTap=_wCtx.createGain();_wVolTap.gain.value=(typeof masterVol!=='undefined'?masterVol:1);
      _wGain.connect(_wTrem);_wTrem.connect(_wVolTap);_wVolTap.connect(_wCtx.destination);
      const tlfo=_wCtx.createOscillator();tlfo.type='sine';tlfo.frequency.value=2.6;
      const tlfoGain=_wCtx.createGain();tlfoGain.gain.value=.22;tlfo.connect(tlfoGain);tlfoGain.connect(_wTrem.gain);tlfo.start();
      _wSrc=[];
      const ratios=[1,2,3,4,5,6],amps=[1,0.55,0.38,0.2,0.1,0.05],base=_wonderPitchHz();
      ratios.forEach((r,i)=>{const osc=_wCtx.createOscillator();osc.type=i===0?'triangle':'sine';osc.frequency.value=base*r;
        const g=_wCtx.createGain();g.gain.value=amps[i];osc.connect(g);g.connect(_wGain);osc.start();_wSrc.push({osc,g,ratio:r});});
      const lfo=_wCtx.createOscillator();lfo.frequency.value=5.5+Math.random()*2;
      const lfoGain=_wCtx.createGain();lfoGain.gain.value=4;lfo.connect(lfoGain);_wSrc.forEach(s=>lfoGain.connect(s.osc.frequency));lfo.start();
      _wSrc.push({osc:lfo,g:lfoGain,ratio:0});_wSrc.push({osc:tlfo,g:tlfoGain,ratio:0});
    }catch(e){console.warn('wonderful audio fail',e);}
    showMsg('woNDERFULLLLLLLLLLLLLLLLLLLLLLLLLLLL!!!!!!!!1',99999);
  }
  function _wonderStop(){
    if(!_wActive)return;_wActive=false;
    try{if(_wGain){_wGain.gain.setValueAtTime(_wGain.gain.value,_wCtx.currentTime);_wGain.gain.linearRampToValueAtTime(0,_wCtx.currentTime+0.12);}
      setTimeout(()=>{try{(_wSrc||[]).forEach(s=>{try{s.osc.stop();}catch(e){}});}catch(e){}_wSrc=null;_wGain=null;_wTrem=null;_wVolTap=null;},150);
    }catch(e){}
    showMsg('',1);
  }
  setInterval(()=>{
    if(window._activeModelId!=='wonderful'){if(_wActive)_wonderStop();return;}
    if(plane.crashed){_wonderStop();return;}
    const anyWASD=keys['KeyW']||keys['KeyA']||keys['KeyS']||keys['KeyD'];
    if(anyWASD){_wonderStart();
      if(_wSrc&&_wCtx){const base=_wonderPitchHz();_wSrc.forEach(s=>{if(s.ratio>0)s.osc.frequency.setTargetAtTime(base*s.ratio,_wCtx.currentTime,0.1);});
        if(_wVolTap)_wVolTap.gain.setTargetAtTime(typeof masterVol!=='undefined'?masterVol:1,_wCtx.currentTime,0.1);}
    }else _wonderStop();
  },30);

  window.cheat={
    money:(n=1e6)=>{C.money=n;save();renderHUD();renderShop();return '$'+n;},
    list:()=>FLEET.map((f,i)=>i+': '+f.id+' · '+f.name),
    fly:(x)=>{const r=window.__flyTo(x);try{if(camMode===1)setCamMode(1);showMsg('CHEAT · '+r,2500);}catch(e){}return r;},
    next:()=>cheat.fly(Math.min(FLEET.length-1,C.upgrades.fleet+1)),
    prev:()=>cheat.fly(Math.max(0,C.upgrades.fleet-1)),
    xp:(n=1000)=>{try{addXP(n);}catch(e){return 'addXP failed';}return '+'+n+' XP';},
    lessons:()=>{LESSONS.forEach(L=>C.lessonsCompleted[L.id]=true);save();renderContracts();return 'all lessons unlocked';},
    all:()=>{cheat.money(1e7);cheat.lessons();return 'money + lessons unlocked. use cheat.fly("a350")';}
  };
  console.log('[CAREER v4] ready · cheats: cheat.list(), cheat.fly("a350"), cheat.next(), cheat.money()');


/* ===== SCOPE BRIDGE: feature blocks outside main() read these through window (they were silently disabled before:
   their typeof checks always saw undefined). Getters always return the live value. ===== */
(function exposeMainScope(){
  const live={plane:()=>plane,scene:()=>scene,faults:()=>faults,wxFlash:()=>wxFlash,ENG:()=>ENG,
    currentWeather:()=>currentWeather,WEATHER:()=>WEATHER,CFG:()=>CFG,RUNWAYS:()=>RUNWAYS,
    runwayHdgDeg:()=>runwayHdgDeg,currentLocation:()=>currentLocation,camState:()=>camState,traffic:()=>traffic};
  for(const k in live){
    if(Object.prototype.hasOwnProperty.call(window,k))continue;
    try{Object.defineProperty(window,k,{configurable:true,get:live[k]});}catch(e){}
  }
  /* each one in its own try: a name that is not visible at this level must not stop startup */
  const put=(k,f)=>{try{if(!(k in window))window[k]=f;}catch(e){}};
  try{put('showMsg',showMsg);}catch(e){}
  try{put('sampleSurface',sampleSurface);}catch(e){}
  try{put('crash',crash);}catch(e){}
  try{put('airportBlend',airportBlend);}catch(e){}
  try{put('createRunway',createRunway);}catch(e){}
  try{put('computeReplayCam',computeReplayCam);}catch(e){}
  try{put('addXP',addXP);}catch(e){}
  try{put('renderHUD',renderHUD);}catch(e){}
  try{put('renderContracts',renderContracts);}catch(e){}
  try{put('renderShop',renderShop);}catch(e){}
})();
} /* end main */

(function(){const prevTD=window._onTouchdown;window._onTouchdown=(sink,hs,noGear,water)=>{try{prevTD&&prevTD(sink,hs,noGear,water);}catch(e){}try{if(!noGear&&!water)window._ambThump&&window._ambThump(Math.min(1,sink/8));}catch(e){}};})();

/* ═══════════════════════════════════════════════════════════════════
   FEATURE 1 – BIRD STRIKE VISUAL SPLAT
   Shows an animated bird-smear on the windshield HUD layer when
   BIRD_STRIKE fault fires, fades slowly over 25 seconds.
═══════════════════════════════════════════════════════════════════ */
(function(){
  const SPLAT_DUR=25000;
  let splatCanvas=null,splatCtx=null,splatEl=null,splatTimer=null,splatAlpha=0,splatAnimId=null;
  function ensureSplatEl(){
    if(splatEl)return;
    splatEl=document.createElement('canvas');
    splatEl.id='birdSplatCanvas';
    splatEl.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:310;display:none;';
    document.body.appendChild(splatEl);
    splatCanvas=splatEl;
    splatCtx=splatEl.getContext('2d');
  }
  function drawSplat(){
    const W=splatEl.width=window.innerWidth,H=splatEl.height=window.innerHeight;
    splatCtx.clearRect(0,0,W,H);
    const cx=W*.38+Math.random()*W*.24,cy=H*.25+Math.random()*H*.18;
    const r=Math.min(W,H)*.09;
    // main splatter blob
    const g=splatCtx.createRadialGradient(cx,cy,r*.05,cx,cy,r);
    g.addColorStop(0,'rgba(180,30,0,0.92)');
    g.addColorStop(.4,'rgba(120,15,0,0.75)');
    g.addColorStop(1,'rgba(60,0,0,0)');
    splatCtx.beginPath();splatCtx.arc(cx,cy,r,0,Math.PI*2);splatCtx.fillStyle=g;splatCtx.fill();
    // streaks
    for(let i=0;i<18;i++){
      const a=Math.random()*Math.PI*2,len=(0.4+Math.random())*r*(1.2+Math.random()),w=2+Math.random()*5;
      splatCtx.beginPath();splatCtx.moveTo(cx,cy);
      splatCtx.lineTo(cx+Math.cos(a)*len,cy+Math.sin(a)*len*.55);
      splatCtx.strokeStyle='rgba('+(140+Math.floor(Math.random()*40))+',10,0,'+(.5+Math.random()*.4)+')';
      splatCtx.lineWidth=w;splatCtx.lineCap='round';splatCtx.stroke();
    }
    // feathers
    for(let i=0;i<12;i++){
      const a=Math.random()*Math.PI*2,dist=r*(.5+Math.random()*.9);
      const fx=cx+Math.cos(a)*dist,fy=cy+Math.sin(a)*dist*.7;
      splatCtx.beginPath();splatCtx.ellipse(fx,fy,3+Math.random()*5,1+Math.random()*2,a,0,Math.PI*2);
      splatCtx.fillStyle='rgba(200,185,160,0.7)';splatCtx.fill();
    }
  }
  function showSplat(){
    ensureSplatEl();
    clearTimeout(splatTimer);cancelAnimationFrame(splatAnimId||0);
    drawSplat();
    splatAlpha=1;splatEl.style.display='block';splatEl.style.opacity='1';
    const start=performance.now();
    function fade(now){
      const p=Math.min(1,(now-start)/SPLAT_DUR);
      splatAlpha=1-p*p;
      splatEl.style.opacity=splatAlpha;
      if(splatAlpha>0.01){splatAnimId=requestAnimationFrame(fade);}
      else{splatEl.style.display='none';}
    }
    splatAnimId=requestAnimationFrame(fade);
    // red flash
    const fl=document.createElement('div');
    fl.style.cssText='position:fixed;inset:0;background:rgba(200,0,0,0.45);pointer-events:none;z-index:309;animation:bsFlash .35s ease-out forwards;';
    if(!document.getElementById('bsFlashStyle')){
      const s=document.createElement('style');s.id='bsFlashStyle';
      s.textContent='@keyframes bsFlash{0%{opacity:1}100%{opacity:0}}';
      document.head.appendChild(s);
    }
    document.body.appendChild(fl);setTimeout(()=>fl.remove(),400);
  }
  // Hook into the existing fault system by polling for BIRD_STRIKE activation
  let _wasBS=false;
  setInterval(()=>{
    try{
      const active=window._birdStrikeFired;
      if(active&&!_wasBS){showSplat();_wasBS=true;}
      if(!active&&_wasBS)_wasBS=false;
    }catch(e){}
  },500);
})();

/* ═══════════════════════════════════════════════════════════════════
   FEATURE 6 – RAIN ON WINDSHIELD
   Animated water-streak canvas overlay visible only in cockpit view.
   Streaks spawn at top, slide down with slight curve, fade on exit.
═══════════════════════════════════════════════════════════════════ */
(function(){
  let canvas=null,ctx=null,drops=[],animId=null,active=false;
  const MAX_DROPS=110;
  function ensureCanvas(){
    if(canvas)return;
    canvas=document.createElement('canvas');
    canvas.id='rainWsCanvas';
    canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:290;display:none;';
    document.body.appendChild(canvas);
    ctx=canvas.getContext('2d');
  }
  function spawnDrop(){
    const W=canvas.width,H=canvas.height;
    drops.push({
      x:W*(.12+Math.random()*.76),y:-10+Math.random()*H*.05,
      len:H*(0.06+Math.random()*.18),
      speed:H*(0.45+Math.random()*.7),
      curve:(Math.random()-.5)*W*.04,
      w:1+Math.random()*2.2,
      alpha:.18+Math.random()*.45,
      t:0,dur:.6+Math.random()*.9,
    });
  }
  function renderRain(dt){
    const W=canvas.width=window.innerWidth,H=canvas.height=window.innerHeight;
    ctx.clearRect(0,0,W,H);
    const rainInt=window._rainIntensity||0;
    if(rainInt<=0){drops=[];return;}
    // spawn more drops proportional to rain intensity
    const target=Math.round(MAX_DROPS*rainInt);
    while(drops.length<target)spawnDrop();
    // update & draw
    for(let i=drops.length-1;i>=0;i--){
      const d=drops[i];
      d.t+=dt;d.y+=d.speed*dt;d.x+=d.curve*dt;
      const life=d.t/d.dur;
      const a=life<.1?life/.1:life>.8?(1-life)/.2:1;
      ctx.beginPath();
      ctx.moveTo(d.x,d.y);
      ctx.lineTo(d.x+d.curve*.3,d.y+d.len);
      ctx.strokeStyle=`rgba(200,220,255,${d.alpha*a*.85})`;
      ctx.lineWidth=d.w;ctx.lineCap='round';ctx.stroke();
      // blob at bottom of streak
      ctx.beginPath();ctx.arc(d.x+d.curve*.3,d.y+d.len,d.w*1.4,0,Math.PI*2);
      ctx.fillStyle=`rgba(180,210,255,${d.alpha*a*.5})`;ctx.fill();
      if(d.y>H+d.len+10){drops.splice(i,1);}
    }
  }
  let last=0;
  function loop(now){
    animId=requestAnimationFrame(loop);
    const dt=Math.min(.05,(now-(last||now))/1000);last=now;
    if(!active){canvas.style.display='none';drops=[];return;}
    canvas.style.display='block';
    renderRain(dt);
  }
  ensureCanvas();
  requestAnimationFrame(loop);
  // Poll cockpit mode & rain intensity from the sim globals
  setInterval(()=>{
    try{
      const inCockpit=window._simCamMode===1;
      const wx=window._simCurrentWeather;
      const rain=(wx?wx.rain:0)||0;
      window._rainIntensity=inCockpit?rain:0;
      active=inCockpit&&rain>0;
    }catch(e){active=false;}
  },200);
})();

/* ═══════════════════════════════════════════════════════════════════
   FEATURE 4 – LANDING LOGBOOK
   Grades every touchdown (excluding belly/water) and keeps a
   persistent log in localStorage. Logbook button bottom-right.
═══════════════════════════════════════════════════════════════════ */
(function(){
  const KEY='bf737_landingLog_v2';
  const MAX_LOG=60;
  function grade(fpm){
    if(fpm<110)return{g:'GREASER 🧈',c:'#00e860'};
    if(fpm<220)return{g:'SMOOTH ✅',c:'#4adf7c'};
    if(fpm<420)return{g:'GOOD',c:'#cce853'};
    if(fpm<620)return{g:'FIRM',c:'#f0c040'};
    if(fpm<900)return{g:'HARD ⚠',c:'#f07020'};
    return{g:'SLAM 💥',c:'#ff3030'};
  }
  function loadLog(){try{return JSON.parse(localStorage.getItem(KEY)||'[]');}catch(e){return[];}}
  function saveLog(l){try{localStorage.setItem(KEY,JSON.stringify(l));}catch(e){}}

  // Build logbook UI
  const btn=document.createElement('button');
  btn.id='logbookBtn';
  btn.textContent='📋 Logbook';
  btn.style.cssText='position:fixed;bottom:56px;right:14px;z-index:400;background:#0b1a2e;color:#9cf;border:1px solid #1e4a7a;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:.05em;';
  document.body.appendChild(btn);

  const panel=document.createElement('div');
  panel.id='logbookPanel';
  panel.style.cssText='position:fixed;bottom:90px;right:14px;z-index:401;background:#08111f;border:1px solid #1e4a7a;border-radius:12px;padding:14px 16px;min-width:270px;max-height:340px;overflow-y:auto;display:none;font-family:monospace;font-size:12px;color:#acd;box-shadow:0 8px 32px rgba(0,0,0,.6);';
  document.body.appendChild(panel);

  function renderLog(){
    const log=loadLog();
    if(log.length===0){panel.innerHTML='<div style="color:#556;text-align:center;padding:18px 0">No landings yet</div>';return;}
    let html='<div style="font-size:11px;color:#5af;font-weight:700;margin-bottom:8px">LANDING LOGBOOK ('+log.length+')</div>';
    html+='<table style="width:100%;border-collapse:collapse">';
    html+='<tr style="color:#445;font-size:10px"><th style="text-align:left">TIME</th><th>FPM</th><th>GRADE</th><th>AIRPORT</th></tr>';
    for(let i=log.length-1;i>=0;i--){
      const e=log[i],gr=grade(e.fpm);
      html+=`<tr style="border-top:1px solid #111d30"><td style="padding:3px 0;color:#667;font-size:10px">${e.time}</td><td style="text-align:center;color:#adf">${e.fpm}</td><td style="text-align:center;color:${gr.c};font-weight:700">${gr.g}</td><td style="text-align:center;color:#556;font-size:10px">${e.icao||'???'}</td></tr>`;
    }
    html+='</table>';
    html+='<div style="margin-top:10px;text-align:right"><button id="clearLogBtn" style="background:#1a0000;color:#f66;border:1px solid #400;border-radius:6px;padding:3px 10px;font-size:11px;cursor:pointer">Clear</button></div>';
    panel.innerHTML=html;
    const cb=document.getElementById('clearLogBtn');
    if(cb)cb.onclick=()=>{saveLog([]);renderLog();};
  }
  btn.onclick=()=>{
    const vis=panel.style.display==='none';
    panel.style.display=vis?'block':'none';
    if(vis)renderLog();
  };
  document.addEventListener('click',e=>{if(!panel.contains(e.target)&&e.target!==btn)panel.style.display='none';},{capture:true,passive:true});

  // Hook touchdown
  const prevTD=window._onTouchdown;
  window._onTouchdown=(sink,hs,noGear,water)=>{
    try{prevTD&&prevTD(sink,hs,noGear,water);}catch(e){}
    try{
      if(noGear||water)return;
      const fpm=Math.round(sink*196.85);
      const now=new Date();
      const time=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
      const icao=(typeof CFG!=='undefined'&&CFG._icao)||'----';
      const log=loadLog();
      log.push({fpm,time,icao,ts:now.getTime()});
      if(log.length>MAX_LOG)log.splice(0,log.length-MAX_LOG);
      saveLog(log);
      // Show grade toast
      const gr=grade(fpm);
      const toast=document.createElement('div');
      toast.style.cssText=`position:fixed;bottom:110px;left:50%;transform:translateX(-50%);z-index:500;background:#050e1a;border:2px solid ${gr.c};border-radius:10px;padding:10px 22px;font-family:monospace;font-weight:700;font-size:15px;color:${gr.c};text-align:center;pointer-events:none;animation:logToastAnim .3s ease-out;`;
      toast.innerHTML=gr.g+'<br><span style="font-size:11px;color:#7af;font-weight:400">'+fpm+' fpm</span>';
      if(!document.getElementById('logToastStyle')){
        const s=document.createElement('style');s.id='logToastStyle';
        s.textContent='@keyframes logToastAnim{0%{transform:translateX(-50%) scale(.7);opacity:0}100%{transform:translateX(-50%) scale(1);opacity:1}}';
        document.head.appendChild(s);
      }
      document.body.appendChild(toast);
      setTimeout(()=>toast.remove(),3000);
    }catch(e){}
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   FEATURE 2 – CROSSWIND LANDING CHALLENGE
   Preset strong crosswind scenario, measures how close to CL you
   land and gives a score. Activate via start card or C/W button.
═══════════════════════════════════════════════════════════════════ */
(function(){
  let challengeActive=false,challengeScore=null;
  // Button to toggle challenge mode while on start card
  window._crosswindChallenge=function(activate){
    challengeActive=!!activate;
    const btn=document.getElementById('cwChallengeBtn');
    if(btn)btn.textContent=challengeActive?'🌬️ Challenge: ON':'🌬️ Crosswind Challenge';
    if(btn)btn.style.background=challengeActive?'#1a3a0a':'#0b1a2e';
  };
  // Hook into startBtn
  const _hookStart=setInterval(()=>{
    const sb=document.getElementById('startBtn');
    const wx=document.getElementById('wxSel');
    if(!sb)return;
    clearInterval(_hookStart);
    sb.addEventListener('click',()=>{
      if(!challengeActive)return;
      // Override weather to crosswind
      if(wx)wx.value='windy';
      // Defer so flight start sets up first
      setTimeout(()=>{
        try{
          // Max crosswind — patch via the render-loop bridge
          window._pendingWxPatch={wind:28,gust:8,turb:0.9};
          showChallengeHUD();
        }catch(e){}
      },1200);
    },true);
  },200);

  function showChallengeHUD(){
    const hud=document.createElement('div');
    hud.id='cwHUD';
    hud.style.cssText='position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:350;background:rgba(5,15,30,.82);border:1.5px solid #2a6fdd;border-radius:10px;padding:8px 18px;font-family:monospace;font-size:13px;color:#7cf;pointer-events:none;text-align:center;min-width:200px;';
    hud.innerHTML='🌬️ <b style="color:#f0c">CROSSWIND CHALLENGE</b><br><span id="cwWindLine">Wind: 28 kts × hdg</span><br><span id="cwStatusLine" style="color:#adf">Land on the runway centreline!</span>';
    document.body.appendChild(hud);
    // Update wind indicator each frame
    const _cwInt=setInterval(()=>{
      try{
        const wl=document.getElementById('cwWindLine');
        const wx=window._simCurrentWeather;
        if(wl&&wx){
          const wkts=Math.round((wx.wind+(Math.random()-.5)*wx.gust)*1.94384);
          wl.textContent='Wind: '+wkts+' kts (crosswind)';
        }
      }catch(e){}
      if(challengeScore!==null)clearInterval(_cwInt);
    },800);
  }

  // Grade crosswind landing by centreline offset
  const prevTD=window._onTouchdown;
  window._onTouchdown=(sink,hs,noGear,water)=>{
    try{prevTD&&prevTD(sink,hs,noGear,water);}catch(e){}
    try{
      if(!challengeActive||noGear||water)return;
      // Centreline offset in metres: project position onto runway perpendicular
      let offM=99;
      try{
        if(typeof runwayHdgDeg!=='undefined'&&typeof plane!=='undefined'){
          const h2=runwayHdgDeg*Math.PI/180;
          offM=Math.abs(plane.pos.x*Math.sin(h2)+plane.pos.z*Math.cos(h2));
        }
      }catch(e){}
      const fpm=Math.round(sink*196.85);
      let stars,txt,col;
      if(offM<5)      {stars='★★★★★';txt='PERFECT CL';col='#00e860';}
      else if(offM<12){stars='★★★★☆';txt='EXCELLENT';col='#4adf7c';}
      else if(offM<22){stars='★★★☆☆';txt='GOOD';col='#cce853';}
      else if(offM<35){stars='★★☆☆☆';txt='ACCEPTABLE';col='#f0c040';}
      else if(offM<50){stars='★☆☆☆☆';txt='DRIFTED';col='#f07020';}
      else            {stars='☆☆☆☆☆';txt='EXCURSION ⚠';col='#ff3030';}
      challengeScore={stars,txt,col,offM:Math.round(offM),fpm};
      // Show result panel
      const rp=document.createElement('div');
      rp.style.cssText=`position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:600;background:#050e1a;border:2px solid ${col};border-radius:14px;padding:22px 32px;font-family:monospace;text-align:center;color:${col};min-width:220px;box-shadow:0 12px 40px rgba(0,0,0,.8);`;
      rp.innerHTML=`<div style="font-size:20px;font-weight:700;margin-bottom:6px">🌬️ CROSSWIND SCORE</div><div style="font-size:26px;letter-spacing:3px">${stars}</div><div style="font-size:18px;font-weight:700;margin:6px 0">${txt}</div><div style="font-size:12px;color:#7af">CL offset: ${Math.round(offM)} m &nbsp;·&nbsp; ${fpm} fpm</div><button onclick="this.parentNode.remove()" style="margin-top:14px;background:#0b1a2e;color:#7cf;border:1px solid #2a6fdd;border-radius:7px;padding:6px 16px;cursor:pointer;font-size:12px">OK</button>`;
      document.body.appendChild(rp);
      // Dismiss HUD
      setTimeout(()=>{const h=document.getElementById('cwHUD');if(h)h.remove();},200);
    }catch(e){}
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   FEATURE 7 – ENHANCED CRASH OVERLAY with crash type context
   Shows animated crash type icon, sequence, speed/attitude data
═══════════════════════════════════════════════════════════════════ */
(function(){
  // Enrich crash overlay with extra data when crash fires
  const crashOverlay=document.getElementById('crashOverlay');
  if(!crashOverlay)return;
  // Inject sub-panel for crash details if not present
  if(!document.getElementById('crashDetails')){
    const dp=document.createElement('div');
    dp.id='crashDetails';
    dp.style.cssText='font-size:11px;color:#8aabcc;font-family:monospace;margin-top:8px;line-height:1.7;text-align:center;min-height:32px;';
    const cr=crashOverlay.querySelector('#crashReason');
    if(cr)cr.parentNode.insertBefore(dp,cr.nextSibling);
    else crashOverlay.appendChild(dp);
  }
  // Intercept crashes to add details
  const _origCrash=window.crash;
  // We can't easily intercept the internal crash() but we can hook the overlay timing
  // Poll until overlay shows, then fill details
  const _cdObs=new MutationObserver(()=>{
    if(!crashOverlay.classList.contains('show'))return;
    try{
      const dp=document.getElementById('crashDetails');
      if(!dp)return;
      // Read current plane state
      const p=typeof plane!=='undefined'?plane:null;
      if(!p){dp.textContent='';return;}
      const spd=Math.round(Math.hypot((p.vel?.x||0),(p.vel?.y||0),(p.vel?.z||0))*1.944);
      const alt=Math.round((p.pos?.y||0)*3.28084);
      const vsi=Math.round((p.vel?.y||0)*-196.85);
      const eng=typeof ENG!=='undefined'?(ENG.L.state==='RUNNING'&&ENG.R.state==='RUNNING'?'BOTH':'ENG FAIL'):'–';
      const gear=p.gearDown?'DOWN':'UP';
      const fuel=p.fuel?Math.round(p.fuel)+' kg':'–';
      dp.innerHTML=
        `<span style="color:#4a9fdd">IMPACT DATA</span><br>`+
        `SPD ${spd} kt &nbsp; ALT ${alt} ft &nbsp; VSI ${vsi} fpm<br>`+
        `GEAR ${gear} &nbsp; ENGINES ${eng} &nbsp; FUEL ${fuel}`;
    }catch(e){}
  });
  _cdObs.observe(crashOverlay,{attributes:true,attributeFilter:['class']});
})();

/* ═══════════════════════════════════════════════════════════════════
   FEATURE 8 – TIRE BURST at high speed + runway excursion crash
   Tires can blow on high-speed landing or rejected takeoff. 
   Runway excursion (going off the end fast) triggers crash.
═══════════════════════════════════════════════════════════════════ */
(function(){
  let tireBurstFired=false;
  let _excTimer=0;

  // Patch into the render / physics update via RAF
  function tireTick(){
    requestAnimationFrame(tireTick);
    try{
      if(typeof plane==='undefined'||plane.crashed)return;
      const hs=Math.hypot((plane.vel?.x||0),(plane.vel?.z||0));
      const spd=hs*1.944; // kts

      // Tire burst: high speed + heavy landing or brakes held too long
      if(!tireBurstFired&&plane.onGround&&spd>155&&plane.gearDown&&Math.random()<0.0006){
        tireBurstFired=true;
        try{
          if(typeof faults!=='undefined'&&!faults.has('TIRE_BURST'))faults.inject('TIRE_BURST');
          if(typeof showMsg!=='undefined')showMsg('💥 TIRE BURST · DIRECTIONAL CONTROL LOST',3500);
        }catch(e){}
        setTimeout(()=>{tireBurstFired=false;},30000);
      }

      // Runway excursion: off paved surface at speed. Uses the same airport-plateau
      // test the ground physics uses (ab===null, or far outside the paved footprint)
      // rather than guessing from the fractional part of the raw elevation, which
      // triggered false crashes on perfectly normal runways whose elevation just
      // happened to have the "wrong" decimal part.
      if(plane.onGround&&spd>80&&plane.gearDown){
        try{
          if(typeof airportBlend!=='undefined'){
            const ab=airportBlend(plane.pos.x,plane.pos.z);
            const offPaved=!ab||ab.e>35; // well outside the runway/taxiway/apron footprint
            if(offPaved){
              _excTimer+=0.016;
              if(_excTimer>0.8){
                if(typeof crash!=='undefined')crash('RUNWAY EXCURSION · '+Math.round(spd)+' kt');
              }
            } else {_excTimer=0;}
          }
        }catch(e){_excTimer=0;}
      } else {_excTimer=0;}
    }catch(e){}
  }
  tireTick();
})();

/* ═══════════════════════════════════════════════════════════════════
   FEATURE 9 – GPWS / PULL-UP callout with visual alert
   Warns when descending fast below 500ft, < 200ft and still 
   sinking fast → "PULL UP" + red flash overlay
═══════════════════════════════════════════════════════════════════ */
(function(){
  let _puCooldown=0;
  let _pullUpEl=null;

  function getPullUpEl(){
    if(_pullUpEl)return _pullUpEl;
    const d=document.createElement('div');
    d.id='pullUpAlert';
    d.style.cssText='position:fixed;top:20%;left:50%;transform:translateX(-50%);z-index:700;background:rgba(200,0,0,.92);color:#fff;font-family:monospace;font-weight:900;font-size:26px;padding:10px 28px;border-radius:10px;letter-spacing:.08em;pointer-events:none;display:none;text-align:center;border:2px solid #ff6060;box-shadow:0 0 40px rgba(255,0,0,.7);';
    document.body.appendChild(d);
    _pullUpEl=d;
    return d;
  }

  function gpwsTick(){
    requestAnimationFrame(gpwsTick);
    try{
      if(typeof plane==='undefined'||plane.crashed||plane.onGround)return;
      const ghP=typeof ghPreview!=='undefined'?ghPreview:0;
      const agl=(plane.pos.y-ghP)*3.28084;
      const vsi=(plane.vel?.y||0)*196.85; // positive = climbing
      const el=getPullUpEl();
      const now=performance.now();

      // SINK RATE warning 500–200ft
      if(agl<500&&agl>50&&vsi<-1200&&now>_puCooldown){
        el.textContent='⚠ SINK RATE';
        el.style.background='rgba(200,120,0,.92)';
        el.style.display='block';
        _puCooldown=now+3500;
        setTimeout(()=>{el.style.display='none';},2000);
      }
      // PULL UP below 200ft with heavy sink
      if(agl<200&&agl>0&&vsi<-1800&&now>_puCooldown){
        el.textContent='▲ PULL UP  PULL UP ▲';
        el.style.background='rgba(200,0,0,.92)';
        el.style.display='block';
        _puCooldown=now+4000;
        // Screen flash
        try{if(typeof wxFlash!=='undefined'){wxFlash.style.opacity='.35';setTimeout(()=>{wxFlash.style.opacity='0';},200);}}catch(e){}
        setTimeout(()=>{el.style.display='none';},2500);
      }
      // TOO LOW TERRAIN
      if(!AIRSYS.gpws.terrainOverride&&agl<80&&agl>0&&vsi<-600&&now>_puCooldown){
        el.textContent='⚠ TOO LOW TERRAIN';
        el.style.background='rgba(200,0,0,.88)';
        el.style.display='block';
        _puCooldown=now+4000;
        setTimeout(()=>{el.style.display='none';},2200);
      }
    }catch(e){}
  }
  gpwsTick();
})();

/* ═══════════════════════════════════════════════════════════════════
   FEATURE 10 – GEAR COLLAPSE VISUAL + HYDRAULIC FAIL
   When gear collapses (crash), fade cockpit lights, sparks trail
   When hydraulics fail mid-flight (random chance on heavy landing)
═══════════════════════════════════════════════════════════════════ */
(function(){
  // Hydraulic leak: heavy landing can damage hydraulics
  const _prevTD=window._onTouchdown;
  window._onTouchdown=(sink,hs,noGear,water)=>{
    try{_prevTD&&_prevTD(sink,hs,noGear,water);}catch(e){}
    try{
      const fpm=sink*196.85;
      // Very hard landing can damage hydraulics (>700 fpm) — low random chance
      if(!noGear&&!water&&fpm>700&&Math.random()<(fpm-700)/8000){
        setTimeout(()=>{
          try{
            if(typeof faults!=='undefined'){
              if(!faults.has('HYD_LOSS')){
                faults.inject('HYD_LOSS');
                if(typeof showMsg!=='undefined')showMsg('⚠ HYD SYS 1 FAULT · HARD LANDING DAMAGE',4000);
              }
            }
          }catch(e){}
        },3000);
      }
    }catch(e){}
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   FEATURE 11 – G-FORCE GREYOUT / REDOUT OVERLAY
   Positive G above 3g → tunnel-vision grey edges (greyout)
   Negative G below -1g → red wash (redout)
═══════════════════════════════════════════════════════════════════ */
(function(){
  const ov=document.createElement('div');
  ov.id='gForceOverlay';
  ov.style.cssText='position:fixed;inset:0;z-index:350;pointer-events:none;transition:opacity .15s;opacity:0;';
  document.body.appendChild(ov);

  // Radial tunnel for greyout
  const grayOv=document.createElement('div');
  grayOv.style.cssText='position:absolute;inset:0;background:radial-gradient(ellipse 65% 50% at 50% 50%,transparent 30%,rgba(180,180,180,.0) 50%,rgba(150,150,150,.9) 100%);opacity:0;transition:opacity .2s;';
  ov.appendChild(grayOv);

  // Red wash for redout
  const redOv=document.createElement('div');
  redOv.style.cssText='position:absolute;inset:0;background:rgba(180,0,0,.0);opacity:0;transition:opacity .2s;';
  ov.appendChild(redOv);

  function gfxTick(){
    requestAnimationFrame(gfxTick);
    try{
      if(typeof plane==='undefined'||plane.crashed){grayOv.style.opacity=0;redOv.style.opacity=0;return;}
      const g=plane.gForce||1;
      // Greyout: starts at 3g, full at 6g
      const gr=Math.max(0,Math.min(1,(g-3)/3));
      grayOv.style.opacity=gr;
      // Redout: starts at -1g, full at -3g
      const rr=Math.max(0,Math.min(1,(-g-1)/2));
      redOv.style.background=`rgba(180,0,0,${rr*0.55})`;
      redOv.style.opacity=rr>0?1:0;
      ov.style.opacity=(gr>0||rr>0)?1:0;
    }catch(e){}
  }
  gfxTick();
})();

/* ═══════════════════════════════════════════════════════════════════
   FEATURE 12 – TIRE SMOKE ON TOUCHDOWN
   Particle puff at main gear contact when speed > 20 kts
═══════════════════════════════════════════════════════════════════ */
(function(){
  const _prevTD=window._onTouchdown;
  window._onTouchdown=(sink,hs,noGear,water)=>{
    try{_prevTD&&_prevTD(sink,hs,noGear,water);}catch(e){}
    if(noGear||water||hs<20)return;
    try{
      const scene=window._scene||BABYLON.Engine.LastCreatedScene;
      if(!scene)return;
      const pos=plane.pos.clone();
      pos.y+=0.3;
      // Left and right gear smoke burst
      for(let side=-1;side<=1;side+=2){
        const quat=plane.quat;
        const right=new BABYLON.Vector3(1,0,0);
        const rw=BABYLON.Vector3.TransformNormal(right,BABYLON.Matrix.RotationQuaternion(quat));
        const gp=pos.add(rw.scale(side*3.5));
        const ps=new BABYLON.ParticleSystem('tiresmoke'+Date.now()+side,80,scene);
        ps.particleTexture=window._smokeTex||new BABYLON.Texture('data:image/png;base64,iVBORw0KGgo=',scene);
        ps.emitter=BABYLON.MeshBuilder.CreateSphere('tse',{diameter:.1},scene);
        ps.emitter.position.copyFrom(gp);
        ps.emitter.isVisible=false;
        ps.color1=new BABYLON.Color4(.85,.85,.85,.7);
        ps.color2=new BABYLON.Color4(.6,.6,.6,.4);
        ps.colorDead=new BABYLON.Color4(.4,.4,.4,0);
        ps.minSize=0.4;ps.maxSize=2.5;
        ps.minLifeTime=0.5;ps.maxLifeTime=1.4;
        ps.emitRate=0;
        ps.manualEmitCount=40+Math.round(hs*0.5);
        ps.blendMode=BABYLON.ParticleSystem.BLENDMODE_STANDARD;
        ps.minEmitPower=1;ps.maxEmitPower=3.5;
        ps.direction1=new BABYLON.Vector3(-0.5,0.8,-0.5);
        ps.direction2=new BABYLON.Vector3(0.5,2.5,0.5);
        ps.gravity=new BABYLON.Vector3(0,-1,0);
        ps.start();
        setTimeout(()=>{try{ps.emitter.dispose();ps.dispose();}catch(e){}},3000);
      }
    }catch(e){}
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   FEATURE 13 – CONTRAILS AT HIGH ALTITUDE
   Wing-tip contrails above FL250 (7620m) when engines running
═══════════════════════════════════════════════════════════════════ */
(function(){
  let contrailL=null,contrailR=null,contrailActive=false;
  const CONTRAIL_ALT=7620; // meters (FL250)

  function initContrails(){
    const scene=window._scene||BABYLON.Engine.LastCreatedScene;
    if(!scene||contrailL)return;
    function makeContrail(tag){
      const ps=new BABYLON.ParticleSystem('contrail_'+tag,300,scene);
      ps.particleTexture=window._smokeTex||new BABYLON.Texture('data:image/png;base64,iVBORw0KGgo=',scene);
      const em=BABYLON.MeshBuilder.CreateSphere('cte_'+tag,{diameter:.1},scene);
      em.isVisible=false;
      ps.emitter=em;
      ps.color1=new BABYLON.Color4(1,1,1,.6);
      ps.color2=new BABYLON.Color4(.9,.9,.95,.5);
      ps.colorDead=new BABYLON.Color4(.8,.8,.85,0);
      ps.minSize=1.0;ps.maxSize=3.5;
      ps.minLifeTime=4;ps.maxLifeTime=9;
      ps.emitRate=20;
      ps.blendMode=BABYLON.ParticleSystem.BLENDMODE_STANDARD;
      ps.minEmitPower=.5;ps.maxEmitPower=1.5;
      ps.direction1=new BABYLON.Vector3(-.1,.1,-.1);
      ps.direction2=new BABYLON.Vector3(.1,.3,.1);
      ps.gravity=new BABYLON.Vector3(0,-.05,0);
      return {ps,em};
    }
    contrailL=makeContrail('L');
    contrailR=makeContrail('R');
  }

  function contrailTick(){
    requestAnimationFrame(contrailTick);
    try{
      if(typeof plane==='undefined')return;
      initContrails();
      if(!contrailL||!contrailR)return;
      const alt=plane.pos.y;
      const engOn=(typeof ENG!=='undefined')&&(ENG.L.state==='RUNNING'||ENG.R.state==='RUNNING');
      const shouldShow=alt>CONTRAIL_ALT&&engOn&&!plane.crashed;
      if(shouldShow!==contrailActive){
        contrailActive=shouldShow;
        if(shouldShow){contrailL.ps.start();contrailR.ps.start();}
        else{contrailL.ps.stop();contrailR.ps.stop();}
      }
      if(contrailActive){
        const q=plane.quat;
        const rw=BABYLON.Vector3.TransformNormal(new BABYLON.Vector3(1,0,0),BABYLON.Matrix.RotationQuaternion(q));
        contrailL.em.position.copyFrom(plane.pos).addInPlace(rw.scale(-12)).addInPlaceFromFloats(0,-.5,0);
        contrailR.em.position.copyFrom(plane.pos).addInPlace(rw.scale(12)).addInPlaceFromFloats(0,-.5,0);
      }
    }catch(e){}
  }
  contrailTick();
})();

/* ═══════════════════════════════════════════════════════════════════
   FEATURE 14 – BUTTER CHALLENGE PERSONAL BEST TRACKER
   Tracks best (lowest) touchdown FPM, "butter" badge at <100 fpm
═══════════════════════════════════════════════════════════════════ */
(function(){
  const PB_KEY='sim_butterPB';
  function getPB(){try{return parseInt(localStorage.getItem(PB_KEY))||9999;}catch(e){return 9999;}}
  function setPB(v){try{localStorage.setItem(PB_KEY,v);}catch(e){}}

  // PB display badge
  const badge=document.createElement('div');
  badge.id='butterBadge';
  const pb=getPB();
  badge.style.cssText='position:fixed;bottom:56px;left:14px;z-index:400;background:#08111f;border:1px solid #1e4a7a;border-radius:8px;padding:5px 11px;font-family:monospace;font-size:11px;color:#9cf;font-weight:700;cursor:default;opacity:0.85;';
  badge.title='Your personal best landing rate';
  badge.textContent='🧈 PB: '+(pb<9999?pb+' fpm':'—');
  document.body.appendChild(badge);

  const _prevTD=window._onTouchdown;
  window._onTouchdown=(sink,hs,noGear,water)=>{
    try{_prevTD&&_prevTD(sink,hs,noGear,water);}catch(e){}
    if(noGear||water)return;
    try{
      const fpm=Math.round(Math.abs(sink*196.85));
      const cur=getPB();
      if(fpm<cur){
        setPB(fpm);
        badge.textContent='🧈 PB: '+fpm+' fpm';
        // Celebrate!
        const msg=document.createElement('div');
        msg.style.cssText='position:fixed;top:30%;left:50%;transform:translateX(-50%);z-index:600;background:linear-gradient(135deg,#0a2040,#0d3060);border:2px solid #5af;border-radius:14px;padding:18px 32px;font-family:monospace;font-weight:900;font-size:18px;color:#5af;text-align:center;animation:pbPop .4s ease-out;pointer-events:none;';
        msg.innerHTML='🧈 NEW PERSONAL BEST!<br><span style="font-size:13px;color:#9cf;font-weight:400">'+fpm+' fpm '+(fpm<50?'· ABSOLUTELY BUTTERED':fpm<100?'· GREASER!':'· SMOOTH!')+'</span>';
        if(!document.getElementById('pbPopStyle')){
          const s=document.createElement('style');s.id='pbPopStyle';
          s.textContent='@keyframes pbPop{0%{transform:translateX(-50%) scale(.6);opacity:0}80%{transform:translateX(-50%) scale(1.05)}100%{transform:translateX(-50%) scale(1);opacity:1}}';
          document.head.appendChild(s);
        }
        document.body.appendChild(msg);
        setTimeout(()=>msg.remove(),4000);
      } else if(fpm<100){
        // Still show butter badge even if not PB
        badge.textContent='🧈 PB: '+cur+' fpm';
        badge.style.borderColor='#5af';
        setTimeout(()=>{badge.style.borderColor='#1e4a7a';},3000);
      }
    }catch(e){}
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   FEATURE 16 – RANDOM FAILURE ROULETTE
   Spin and get a random failure mid-flight
═══════════════════════════════════════════════════════════════════ */
(function(){
  const FAULTS_POOL=[
    {code:'FLAMEOUT',label:'ENGINE FLAMEOUT'},
    {code:'BIRD_STRIKE',label:'BIRD STRIKE'},
    {code:'OIL_PRESS',label:'OIL PRESSURE FAULT'},
    {code:'FUEL_LEAK',label:'FUEL LEAK'},
    {code:'SPOILER_JAM',label:'SPOILER JAM'},
    {code:'TRIM_RUNAWAY',label:'TRIM RUNAWAY'},
    {code:'RUDDER_JAM',label:'RUDDER JAM'},
    {code:'AIL_JAM',label:'AILERON JAM'},
    {code:'HYD_LOSS',label:'HYDRAULIC LOSS'},
    {code:'ENG_SURGE',label:'ENGINE SURGE'},
    {code:'ELEC_BUS',label:'ELECTRICAL BUS FAULT'},
    {code:'CABIN_ALT',label:'CABIN PRESSURIZATION'},
    {code:'TIRE_BURST',label:'TIRE BURST'},
  ];

  const btn=document.createElement('button');
  btn.id='rouletteBtn';
  btn.textContent='🎰 Roulette';
  btn.title='Spin for a random failure (R)';
  btn.style.cssText='position:fixed;bottom:128px;left:14px;z-index:400;background:#1a0808;color:#f96;border:1px solid #4a1a1a;border-radius:8px;padding:5px 11px;font-size:11px;font-weight:700;cursor:pointer;';
  document.body.appendChild(btn);

  function spinRoulette(){
    try{
      // Spinning animation via repeated fast messages
      let i=0;
      const iv=setInterval(()=>{
        const r=FAULTS_POOL[(Math.random()*FAULTS_POOL.length)|0];
        if(typeof showMsg!=='undefined')showMsg('🎰 '+r.label,300);
        i++;
        if(i>8){
          clearInterval(iv);
          const chosen=FAULTS_POOL[(Math.random()*FAULTS_POOL.length)|0];
          if(typeof faults!=='undefined'){
            faults.inject(chosen.code);
          }
          setTimeout(()=>{
            if(typeof showMsg!=='undefined')showMsg('⚡ FAILURE: '+chosen.label,4000);
          },400);
        }
      },120);
    }catch(e){}
  }

  btn.onclick=spinRoulette;
  document.addEventListener('keydown',e=>{
    if(e.code==='KeyR'&&!e.ctrlKey&&!e.altKey&&document.activeElement.tagName!=='INPUT')spinRoulette();
  });
})();

/* FEATURE 17 – ATC CHATTER TTS: removed. It duplicated the real ATC panel (the
   "📻 ATC (K)" button / KeyK) with a second, lower-quality floating "📻 ATC"
   button bound to KeyT — generic random phrases unrelated to your actual
   clearance/flight phase, and the thing that was overlapping GPWS WAV warnings
   with a robotic TTS voice. The main ATC panel already has its own voice
   toggle (🔊/🔇 next to "ATC · CLEARANCES") with the same overlap protection,
   so that's the one button to use. One fewer button on screen, one fewer
   confusing duplicate keybind. */

/* ═══════════════════════════════════════════════════════════════════
   FEATURE 18 – RAPID DECOMPRESSION ABOVE FL250
   Forget to… well, it auto-pressurizes but a random event can
   blow out a window above FL250, requiring emergency descent.
═══════════════════════════════════════════════════════════════════ */
(function(){
  let decompActive=false,decompTimer=0,decompWarnInterval=null;
  const FL250_M=7620;

  function triggerDecomp(){
    if(decompActive||typeof plane==='undefined'||plane.crashed)return;
    if(plane.pos.y<FL250_M)return;
    decompActive=true;
    try{if(typeof showMsg!=='undefined')showMsg('💨 RAPID DECOMPRESSION · DESCEND IMMEDIATELY',5000);}catch(e){}
    // Flash screen
    try{if(typeof wxFlash!=='undefined'){wxFlash.style.opacity='.8';setTimeout(()=>{wxFlash.style.opacity='0';},300);}}catch(e){}
    // Urgent blinking alert
    const alert=document.createElement('div');
    alert.id='decompAlert';
    alert.style.cssText='position:fixed;top:15%;left:50%;transform:translateX(-50%);z-index:700;background:rgba(150,0,0,.95);color:#fff;font-family:monospace;font-weight:900;font-size:20px;padding:12px 28px;border-radius:10px;letter-spacing:.1em;pointer-events:none;text-align:center;border:2px solid #ff4444;box-shadow:0 0 40px rgba(255,0,0,.8);display:none;';
    alert.innerHTML='💨 RAPID DECOMPRESSION<br><span style="font-size:13px;font-weight:400">DESCEND TO 10,000 FT · OXYGEN MASKS</span>';
    document.body.appendChild(alert);

    let countdown=30;
    alert.style.display='block';
    decompWarnInterval=setInterval(()=>{
      countdown--;
      alert.style.display=(countdown%2===0)?'block':'none';
      if(countdown<=0||!decompActive){
        clearInterval(decompWarnInterval);
        try{alert.remove();}catch(e){}
        if(decompActive&&typeof plane!=='undefined'&&!plane.crashed&&plane.pos.y>FL250_M){
          try{crash('HYPOXIA · DECOMPRESSION AT FL'+Math.round(plane.pos.y*3.28084/100),'',{});}catch(e){}
        }
        decompActive=false;
      }
      // Auto-cancel if they descended
      if(typeof plane!=='undefined'&&plane.pos.y<FL250_M-1000){
        clearInterval(decompWarnInterval);
        decompActive=false;
        try{alert.remove();}catch(e){}
        try{if(typeof showMsg!=='undefined')showMsg('✓ PRESSURIZATION RESTORED',2000);}catch(e){}
      }
    },1000);
  }

  // Random decompression event above FL250
  function decompCheck(){
    try{
      if(!decompActive&&typeof plane!=='undefined'&&!plane.crashed&&!plane.onGround){
        if(plane.pos.y>FL250_M&&Math.random()<0.00003){triggerDecomp();}
      }
    }catch(e){}
    requestAnimationFrame(decompCheck);
  }
  decompCheck();

  // Fault injection via F4
  window._triggerDecomp=triggerDecomp;
  document.addEventListener('keydown',e=>{
    if(e.code==='F4'){e.preventDefault();triggerDecomp();}
  });
})();

/* ═══════════════════════════════════════════════════════════════════
   FEATURE 20 – ICE BUILDUP ON WINGS (ANTI-ICE SYSTEM)
   Above FL150 in clouds/storm, ice reduces lift. Anti-ice toggle.
═══════════════════════════════════════════════════════════════════ */
(function(){
  let iceLevel=0; // 0..1
  let antiIceOn=false;

  // Anti-ice button
  const btn=document.createElement('button');
  btn.id='antiIceBtn';
  btn.textContent='❄ Anti-Ice OFF';
  btn.style.cssText='position:fixed;top:56px;right:14px;z-index:400;background:#08111f;color:#8cf;border:1px solid #1e4a7a;border-radius:8px;padding:5px 11px;font-size:11px;font-weight:700;cursor:pointer;display:none;';
  document.body.appendChild(btn);

  btn.onclick=()=>{
    antiIceOn=!antiIceOn;
    window._antiIceOn=antiIceOn;
    btn.textContent='❄ Anti-Ice '+(antiIceOn?'ON':'OFF');
    btn.style.background=antiIceOn?'#0a1a3a':'#08111f';
    btn.style.borderColor=antiIceOn?'#5af':'#1e4a7a';
    btn.style.color=antiIceOn?'#5af':'#8cf';
    try{if(typeof showMsg!=='undefined')showMsg(antiIceOn?'❄ ANTI-ICE · ON':'❄ ANTI-ICE · OFF',1500);}catch(e){}
  };
  window._toggleAntiIce=()=>btn.onclick();

  // Ice HUD element
  const iceHud=document.createElement('div');
  iceHud.id='iceHud';
  iceHud.style.cssText='position:fixed;top:96px;right:14px;z-index:400;background:rgba(0,20,50,.85);border:1px solid #3af;border-radius:8px;padding:5px 11px;font-family:monospace;font-size:11px;color:#8cf;display:none;letter-spacing:.05em;';
  document.body.appendChild(iceHud);

  function iceTick(){
    requestAnimationFrame(iceTick);
    try{
      if(typeof plane==='undefined'||plane.crashed)return;
      const alt=plane.pos.y*3.28084; // feet
      const icing_conditions=(alt>6000&&alt<35000)&&
        (typeof currentWeather!=='undefined')&&
        (currentWeather===WEATHER.cloudy||currentWeather===WEATHER.storm||currentWeather===WEATHER.rain);

      if(icing_conditions&&!antiIceOn&&!plane.onGround){
        iceLevel=Math.min(1,iceLevel+0.00003);
      } else if(antiIceOn||plane.onGround){
        iceLevel=Math.max(0,iceLevel-0.0001);
      }

      // Show anti-ice button when conditions exist or ice is present
      const show=icing_conditions||iceLevel>0.01;
      btn.style.display=show?'block':'none';
      iceHud.style.display=(iceLevel>0.02)?'block':'none';

      if(iceLevel>0.02){
        const pct=Math.round(iceLevel*100);
        iceHud.textContent='ICE: '+pct+'% · LIFT -'+Math.round(iceLevel*25)+'%';
        iceHud.style.color=iceLevel>0.5?'#f84':iceLevel>0.25?'#fa4':'#8cf';
        if(iceLevel>0.3&&Math.random()<0.01)try{if(typeof showMsg!=='undefined')showMsg('⚠ ICE ACCUMULATION · TURN ON ANTI-ICE',3000);}catch(e){}
      }

      // Apply lift reduction (injected into physics via a patch on plane object)
      plane._iceLiftPenalty=iceLevel*0.25; // up to 25% lift loss
      if(iceLevel>0.8&&Math.random()<0.002){
        try{crash('ICE ACCRETION · LOSS OF LIFT');}catch(e){}
      }
    }catch(e){}
  }
  iceTick();
})();


/* ============================================================
   FEATURE 21 — AI TRAFFIC FIRE & ENGINE SMOKE
   ============================================================ */
(()=>{
  'use strict';

  // Per-traffic-entry fire/smoke systems keyed by root ID
  const trafficFX = new Map();

  function makeTrafficFire(pos, scene) {
    const fx = {};

    // Engine fire — orange/red particles
    const fire = new BABYLON.ParticleSystem('tfire', 220, scene);
    fire.particleTexture = new BABYLON.Texture('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAH0lEQVQIW2NkYGD4z8BAAIxgAkYwgQkYGBj+k8ADAB5LA2ULfuiZAAAAAElFTkSuQmCC', scene);
    fire.emitter = new BABYLON.Vector3(pos.x, pos.y, pos.z);
    fire.minEmitBox = new BABYLON.Vector3(-1, -0.5, -1);
    fire.maxEmitBox = new BABYLON.Vector3(1, 0.5, 1);
    fire.color1 = new BABYLON.Color4(1, 0.5, 0.1, 1);
    fire.color2 = new BABYLON.Color4(1, 0.15, 0.02, 0.8);
    fire.colorDead = new BABYLON.Color4(0.2, 0.2, 0.2, 0);
    fire.minSize = 1.5; fire.maxSize = 4.5;
    fire.minLifeTime = 0.3; fire.maxLifeTime = 0.9;
    fire.emitRate = 120;
    fire.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    fire.gravity = new BABYLON.Vector3(0, 4, 0);
    fire.direction1 = new BABYLON.Vector3(-2, 4, -2);
    fire.direction2 = new BABYLON.Vector3(2, 8, 2);
    fire.minAngularSpeed = 0; fire.maxAngularSpeed = Math.PI;
    fire.minEmitPower = 1.5; fire.maxEmitPower = 3;
    fire.updateSpeed = 0.025;
    fire.start();
    fx.fire = fire;

    // Black smoke trail
    const smoke = new BABYLON.ParticleSystem('tsmoke', 150, scene);
    smoke.particleTexture = fire.particleTexture;
    smoke.emitter = new BABYLON.Vector3(pos.x, pos.y, pos.z);
    smoke.minEmitBox = new BABYLON.Vector3(-0.5, 0, -0.5);
    smoke.maxEmitBox = new BABYLON.Vector3(0.5, 0, 0.5);
    smoke.color1 = new BABYLON.Color4(0.12, 0.10, 0.10, 0.95);
    smoke.color2 = new BABYLON.Color4(0.05, 0.05, 0.05, 0.7);
    smoke.colorDead = new BABYLON.Color4(0.05, 0.05, 0.05, 0);
    smoke.minSize = 4; smoke.maxSize = 12;
    smoke.minLifeTime = 1.2; smoke.maxLifeTime = 3.0;
    smoke.emitRate = 55;
    smoke.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    smoke.gravity = new BABYLON.Vector3(0, 6, 0);
    smoke.direction1 = new BABYLON.Vector3(-1, 5, -1);
    smoke.direction2 = new BABYLON.Vector3(1, 10, 1);
    smoke.minEmitPower = 2; smoke.maxEmitPower = 5;
    smoke.updateSpeed = 0.025;
    smoke.start();
    fx.smoke = smoke;

    // Flicker point light
    const light = new BABYLON.PointLight('tfl', new BABYLON.Vector3(pos.x, pos.y, pos.z), scene);
    light.diffuse = new BABYLON.Color3(1, 0.4, 0.05);
    light.intensity = 0;
    light.range = 80;
    fx.light = light;
    fx.lightPhase = Math.random() * Math.PI * 2;

    return fx;
  }

  function disposeFX(fx) {
    try { fx.fire.dispose(); } catch(e) {}
    try { fx.smoke.dispose(); } catch(e) {}
    try { fx.light.dispose(); } catch(e) {}
  }

  // Chance a traffic plane is on fire (engine trail visible)
  // About 1-in-8 spawn as "distressed" — gives variety
  const fxTick = () => {
    requestAnimationFrame(fxTick);
    try {
      if (typeof traffic === 'undefined' || typeof scene === 'undefined') return;
      const now = performance.now() / 1000;

      // Sync FX entries with current traffic list
      const alive = new Set();
      for (const t of traffic) {
        const id = t.root.uniqueId;
        alive.add(id);
        if (!trafficFX.has(id)) {
          // 25% chance to spawn on fire / smoking
          if (Math.random() < 0.25) {
            trafficFX.set(id, makeTrafficFire(t.pos, scene));
          } else {
            trafficFX.set(id, null); // mark as checked, no FX
          }
        }
        const fx = trafficFX.get(id);
        if (!fx) continue;

        // Track position to traffic root
        const p = t.pos;
        fx.fire.emitter.set(p.x, p.y - 1, p.z);
        fx.smoke.emitter.set(p.x, p.y - 1, p.z);
        fx.light.position.set(p.x, p.y, p.z);

        // Flicker the fire light
        fx.lightPhase += 0.18;
        fx.light.intensity = 1.5 + Math.sin(fx.lightPhase * 7.3) * 0.8 + Math.sin(fx.lightPhase * 13.1) * 0.4;
      }

      // Dispose FX for traffic that no longer exists
      for (const [id, fx] of trafficFX) {
        if (!alive.has(id)) {
          if (fx) disposeFX(fx);
          trafficFX.delete(id);
        }
      }
    } catch(e) {}
  };
  fxTick();
})();

/* ============================================================
   FEATURE 22 — ENHANCED CRASH PHYSICS + FIREBALL DEBRIS
   ============================================================ */
(()=>{
  'use strict';

  let crashDebris = [];
  let crashFireball = null;
  let crashFireballSmoke = null;
  let crashFireLight = null;
  let crashActive = false;
  let crashTime = 0;

  function clearCrashFX() {
    for (const d of crashDebris) {
      try { d.mesh.dispose(); } catch(e) {}
      try { if(d.trail) d.trail.dispose(); } catch(e) {}
    }
    crashDebris = [];
    if (crashFireball) { try { crashFireball.dispose(); } catch(e) {} crashFireball = null; }
    if (crashFireballSmoke) { try { crashFireballSmoke.dispose(); } catch(e) {} crashFireballSmoke = null; }
    if (crashFireLight) { try { crashFireLight.dispose(); } catch(e) {} crashFireLight = null; }
    crashActive = false;
  }

  function spawnCrashFX(pos, vel, opts) {
    clearCrashFX();
    crashActive = true;
    crashTime = 0;

    const impactSpd = Math.hypot(vel.x, vel.y, vel.z);
    const severity = Math.min(1, impactSpd / 120); // 0..1

    // ── Fireball ──────────────────────────────────────────────
    crashFireball = new BABYLON.ParticleSystem('cfb', 600, scene);
    crashFireball.particleTexture = new BABYLON.Texture('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAH0lEQVQIW2NkYGD4z8BAAIxgAkYwgQkYGBj+k8ADAB5LA2ULfuiZAAAAAElFTkSuQmCC', scene);
    crashFireball.emitter = pos.clone();
    crashFireball.minEmitBox = new BABYLON.Vector3(-3,-1,-3);
    crashFireball.maxEmitBox = new BABYLON.Vector3(3,1,3);
    crashFireball.color1 = new BABYLON.Color4(1, 0.7, 0.1, 1);
    crashFireball.color2 = new BABYLON.Color4(1, 0.2, 0.0, 1);
    crashFireball.colorDead = new BABYLON.Color4(0.1, 0.1, 0.1, 0);
    crashFireball.minSize = 4 + severity * 8; crashFireball.maxSize = 10 + severity * 18;
    crashFireball.minLifeTime = 0.5; crashFireball.maxLifeTime = 1.8;
    crashFireball.emitRate = Math.round(280 + severity * 320);
    crashFireball.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
    crashFireball.gravity = new BABYLON.Vector3(0, 5, 0);
    crashFireball.direction1 = new BABYLON.Vector3(-8, 6, -8);
    crashFireball.direction2 = new BABYLON.Vector3(8, 22, 8);
    crashFireball.minEmitPower = 3 + severity * 6; crashFireball.maxEmitPower = 8 + severity * 14;
    crashFireball.updateSpeed = 0.02;
    crashFireball.start();

    // Auto-stop emitting after 1.2s — fire dissipates
    setTimeout(() => { try { crashFireball.emitRate = 0; } catch(e) {} }, 1200);

    // ── Black billowing smoke ──────────────────────────────────
    crashFireballSmoke = new BABYLON.ParticleSystem('cfsm', 300, scene);
    crashFireballSmoke.particleTexture = crashFireball.particleTexture;
    crashFireballSmoke.emitter = pos.clone();
    crashFireballSmoke.minEmitBox = new BABYLON.Vector3(-4,-1,-4);
    crashFireballSmoke.maxEmitBox = new BABYLON.Vector3(4,1,4);
    crashFireballSmoke.color1 = new BABYLON.Color4(0.08, 0.06, 0.06, 1);
    crashFireballSmoke.color2 = new BABYLON.Color4(0.03, 0.03, 0.03, 0.8);
    crashFireballSmoke.colorDead = new BABYLON.Color4(0.02, 0.02, 0.02, 0);
    crashFireballSmoke.minSize = 8 + severity * 12; crashFireballSmoke.maxSize = 22 + severity * 30;
    crashFireballSmoke.minLifeTime = 3; crashFireballSmoke.maxLifeTime = 8;
    crashFireballSmoke.emitRate = 80;
    crashFireballSmoke.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    crashFireballSmoke.gravity = new BABYLON.Vector3(0, 4, 0);
    crashFireballSmoke.direction1 = new BABYLON.Vector3(-2, 8, -2);
    crashFireballSmoke.direction2 = new BABYLON.Vector3(2, 20, 2);
    crashFireballSmoke.minEmitPower = 1; crashFireballSmoke.maxEmitPower = 3;
    crashFireballSmoke.updateSpeed = 0.015;
    crashFireballSmoke.start();
    setTimeout(() => { try { crashFireballSmoke.emitRate = 0; } catch(e) {} }, 6000);

    // ── Dynamic fire light ─────────────────────────────────────
    crashFireLight = new BABYLON.PointLight('cfl', pos.clone(), scene);
    crashFireLight.diffuse = new BABYLON.Color3(1, 0.45, 0.08);
    crashFireLight.intensity = 8 + severity * 12;
    crashFireLight.range = 200 + severity * 200;

    // ── Debris chunks ──────────────────────────────────────────
    const numPieces = Math.round(6 + severity * 12);
    const debrisMat = new BABYLON.StandardMaterial('cdm', scene);
    debrisMat.diffuseColor = new BABYLON.Color3(0.2, 0.18, 0.15);
    debrisMat.emissiveColor = new BABYLON.Color3(0.6, 0.2, 0.02);

    for (let i = 0; i < numPieces; i++) {
      const s = 0.5 + Math.random() * 2.5;
      let mesh;
      const r = Math.random();
      if (r < 0.33) {
        mesh = BABYLON.MeshBuilder.CreateBox('cdeb' + i, { width: s * 2.5, height: s * 0.4, depth: s }, scene);
      } else if (r < 0.66) {
        mesh = BABYLON.MeshBuilder.CreateCylinder('cdeb' + i, { height: s * 1.5, diameter: s * 0.5, tessellation: 6 }, scene);
      } else {
        mesh = BABYLON.MeshBuilder.CreateSphere('cdeb' + i, { diameter: s, segments: 4 }, scene);
      }
      mesh.material = debrisMat;
      mesh.isPickable = false;
      mesh.position.copyFrom(pos);

      // Random outward velocity
      const angle = Math.random() * Math.PI * 2;
      const pitch = (Math.random() - 0.5) * Math.PI;
      const spd = 8 + Math.random() * (25 + severity * 30);
      const dv = new BABYLON.Vector3(
        Math.cos(pitch) * Math.sin(angle) * spd,
        Math.abs(Math.sin(pitch)) * spd + 4,
        Math.cos(pitch) * Math.cos(angle) * spd
      );
      // Bias in impact direction
      dv.addInPlace(vel.scale(0.15));

      const spin = new BABYLON.Vector3(
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8,
        (Math.random() - 0.5) * 8
      );

      // Small fire trail on large pieces
      let trail = null;
      if (s > 1.5 && Math.random() < 0.5) {
        trail = new BABYLON.ParticleSystem('dt' + i, 50, scene);
        trail.particleTexture = crashFireball.particleTexture;
        trail.emitter = mesh;
        trail.color1 = new BABYLON.Color4(1, 0.5, 0.1, 0.9);
        trail.color2 = new BABYLON.Color4(0.4, 0.1, 0.02, 0.5);
        trail.colorDead = new BABYLON.Color4(0.1, 0.1, 0.1, 0);
        trail.minSize = 0.8; trail.maxSize = 2.2;
        trail.minLifeTime = 0.2; trail.maxLifeTime = 0.6;
        trail.emitRate = 35;
        trail.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
        trail.gravity = new BABYLON.Vector3(0, 2, 0);
        trail.direction1 = new BABYLON.Vector3(-1, 0.5, -1);
        trail.direction2 = new BABYLON.Vector3(1, 2, 1);
        trail.minEmitPower = 0.5; trail.maxEmitPower = 1.5;
        trail.updateSpeed = 0.03;
        trail.start();
      }

      crashDebris.push({ mesh, vel: dv, spin, trail, age: 0, landed: false });
    }
  }

  // Physics update for debris
  let _lastCrashT = 0;
  const crashPhysicsTick = () => {
    requestAnimationFrame(crashPhysicsTick);
    try {
      if (!crashActive) return;
      const now = performance.now() / 1000;
      const dt = Math.min(now - _lastCrashT, 0.05);
      _lastCrashT = now;
      crashTime += dt;

      // Fade fire light over 4s
      if (crashFireLight) {
        crashFireLight.intensity = Math.max(0, crashFireLight.intensity * (1 - dt * 0.6));
        // Flicker
        crashFireLight.intensity += Math.sin(crashTime * 23) * 0.5;
      }

      // Simulate debris with gravity + ground bounce
      for (const d of crashDebris) {
        if (d.landed) continue;
        d.age += dt;

        // Gravity
        d.vel.y -= 9.8 * dt;

        // Move
        d.mesh.position.addInPlace(d.vel.scale(dt));

        // Rotate while flying
        d.mesh.rotation.x += d.spin.x * dt;
        d.mesh.rotation.y += d.spin.y * dt;
        d.mesh.rotation.z += d.spin.z * dt;

        // Ground check
        const groundY = typeof sampleSurface === 'function'
          ? sampleSurface(d.mesh.position.x, d.mesh.position.z)
          : 0;

        if (d.mesh.position.y < groundY + 0.5) {
          d.mesh.position.y = groundY + 0.5;
          // Bounce with energy loss
          d.vel.y = Math.abs(d.vel.y) * 0.28;
          d.vel.x *= 0.55;
          d.vel.z *= 0.55;
          d.spin.x *= 0.4;
          d.spin.z *= 0.4;
          if (Math.abs(d.vel.y) < 0.8) {
            d.landed = true;
            d.vel.setAll(0);
            if (d.trail) { d.trail.emitRate = 0; }
          }
        }

        // Fade out old debris
        if (d.age > 12) {
          d.mesh.visibility = Math.max(0, 1 - (d.age - 12) / 4);
          if (d.age > 16) {
            d.landed = true;
            d.mesh.visibility = 0;
            if (d.trail) d.trail.emitRate = 0;
          }
        }
      }
    } catch(e) {}
  };
  _lastCrashT = performance.now() / 1000;
  crashPhysicsTick();

  // Hook into crash system
  window._crashFx = (pos, vel, opts) => {
    spawnCrashFX(pos, vel, opts);
  };

  // Clean up on respawn
  const _origCrashReset = window._crashReset;
  window._crashReset = () => {
    clearCrashFX();
    if (typeof _origCrashReset === 'function') _origCrashReset();
  };
})();

/* ============================================================
   FEATURE 23 — GENERAL IMPROVEMENTS
   Runway approach lights · G-meter HUD · Altitude alerter ·
   Wind shear warning · Better stall buffet camera shake
   ============================================================ */
(()=>{
  'use strict';

  // ── G-meter digital readout ────────────────────────────────
  const gEl = document.createElement('div');
  gEl.id = 'gMeter';
  gEl.style.cssText = 'position:fixed;bottom:110px;left:14px;z-index:400;background:rgba(0,8,20,.82);border:1px solid #1a3a5c;border-radius:8px;padding:4px 10px;font-family:monospace;font-size:13px;color:#7de;display:none;letter-spacing:.05em;min-width:80px;text-align:center;';
  document.body.appendChild(gEl);

  // ── Altitude alerter (approaching target alt) ─────────────
  const altAlertEl = document.createElement('div');
  altAlertEl.id = 'altAlert';
  altAlertEl.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);z-index:600;background:rgba(255,140,0,.12);border:2px solid #f80;border-radius:10px;padding:8px 22px;font-family:monospace;font-size:16px;color:#ffa;text-align:center;display:none;pointer-events:none;text-shadow:0 0 8px #f80;';
  altAlertEl.textContent = '⚠ ALTITUDE';
  document.body.appendChild(altAlertEl);

  let altAlertTimer = 0;
  let lastAltFt = 0;
  let altAlertFired = false;

  // ── Wind shear HUD ─────────────────────────────────────────
  const wsEl = document.createElement('div');
  wsEl.id = 'windShearAlert';
  wsEl.style.cssText = 'position:fixed;top:42%;left:50%;transform:translate(-50%,-50%);z-index:601;background:rgba(255,50,0,.15);border:2px solid #f22;border-radius:10px;padding:10px 26px;font-family:monospace;font-size:17px;color:#f88;display:none;pointer-events:none;text-shadow:0 0 10px #f22;text-align:center;';
  wsEl.innerHTML = '⚠ WIND SHEAR<br><span style="font-size:12px;color:#faa;">INCREASE THRUST · PULL UP</span>';
  document.body.appendChild(wsEl);

  let wsTimer = 0;
  let lastHspd = 0;
  let wsActive = false;

  // ── Approach lights (ALSF-2 style) ────────────────────────
  let alsfLights = [];
  let alsfRunwayCode = null;

  function clearALSF() {
    for (const m of alsfLights) { try { m.dispose(); } catch(e) {} }
    alsfLights = [];
    alsfRunwayCode = null;
  }

  function spawnALSF(loc) {
    clearALSF();
    if (!loc || !loc.code) return;
    const rwy = (typeof RUNWAYS !== 'undefined') ? RUNWAYS[loc.code] : null;
    if (!rwy) return;

    const rwyHdg = (rwy.hdg || 0) * Math.PI / 180;
    // Runway threshold position in world coords (approx — runway was placed at origin)
    const threshX = -Math.cos(rwyHdg) * rwy.len / 2;
    const threshZ = -Math.sin(rwyHdg) * rwy.len / 2;
    const groundY = (typeof sampleSurface === 'function') ? sampleSurface(threshX, threshZ) : (loc.elev || 0);

    // Approach direction (outbound from threshold)
    const apX = -Math.cos(rwyHdg);
    const apZ = -Math.sin(rwyHdg);
    const perpX = -apZ, perpZ = apX;

    const mat = (col) => {
      const m = new BABYLON.StandardMaterial('alsf' + Math.random(), scene);
      m.emissiveColor = col;
      m.disableLighting = true;
      return m;
    };
    const white = mat(new BABYLON.Color3(1, 1, 0.95));
    const red   = mat(new BABYLON.Color3(1, 0.15, 0.1));

    // 5 crossbars at 30m spacing + centerline dots
    for (let i = 1; i <= 5; i++) {
      const dist = i * 30;
      const cx = threshX + apX * dist;
      const cz = threshZ + apZ * dist;
      const cy = groundY + 0.4;

      // Center light
      const c = BABYLON.MeshBuilder.CreateSphere('alsfc', { diameter: 0.9, segments: 4 }, scene);
      c.position.set(cx, cy, cz); c.material = white; c.isPickable = false;
      alsfLights.push(c);

      // Crossbar lights (wider for near bars)
      const half = (i <= 2) ? 5 : 9;
      for (let s = -half; s <= half; s += 3) {
        if (s === 0 && i > 2) continue;
        const lx = cx + perpX * s, lz = cz + perpZ * s;
        const l = BABYLON.MeshBuilder.CreateSphere('alsfl', { diameter: 0.7, segments: 4 }, scene);
        l.position.set(lx, cy, lz);
        l.material = (i <= 2) ? red : white;
        l.isPickable = false;
        alsfLights.push(l);
      }
    }
    alsfRunwayCode = loc.code;
  }

  // Listen for location changes to update approach lights
  const _origCreateRunway = (typeof createRunway !== 'undefined') ? createRunway : null;
  if (typeof window !== 'undefined') {
    window._onLocChange = (loc) => {
      try { spawnALSF(loc); } catch(e) {}
    };
  }

  // ── Per-frame improvements tick ────────────────────────────
  let _lastT = performance.now() / 1000;
  let _stallBuffetPhase = 0;
  let _stalled = false;
  let _stallBuffetIntensity = 0;

  const improveTick = () => {
    requestAnimationFrame(improveTick);
    try {
      if (typeof plane === 'undefined') return;
      const now = performance.now() / 1000;
      const dt = Math.min(now - _lastT, 0.05);
      _lastT = now;

      // ── G-meter ──
      if (!plane.onGround && !plane.crashed && !plane.hold) {
        const g = typeof plane.gForce !== 'undefined' ? plane.gForce : 1;
        gEl.style.display = 'block';
        gEl.textContent = g.toFixed(2) + ' G';
        gEl.style.color = Math.abs(g) > 4 ? '#f84' : Math.abs(g) > 2.5 ? '#fa4' : '#7de';
        gEl.style.borderColor = Math.abs(g) > 4 ? '#c32' : Math.abs(g) > 2.5 ? '#a82' : '#1a3a5c';
      } else {
        gEl.style.display = 'none';
      }

      // ── Altitude alerter (±300 ft within round altitudes) ──
      if (!plane.onGround && !plane.crashed) {
        const altFt = plane.pos.y * 3.28084;
        const roundAlts = [1000,2000,3000,4000,5000,6000,7000,8000,9000,10000,11000,12000,13000,14000,15000,18000,20000,25000,29000,30000,35000,40000];
        const goingUp = altFt > lastAltFt;
        for (const a of roundAlts) {
          const diff = altFt - a;
          if (goingUp && diff > -350 && diff < -50 && !altAlertFired) {
            altAlertEl.textContent = '⚠  APPROACHING FL' + String(Math.round(a/100)).padStart(3,'0');
            altAlertEl.style.display = 'block';
            altAlertTimer = 2.5;
            altAlertFired = true;
          }
          if (!goingUp && diff < 350 && diff > 50 && !altAlertFired) {
            altAlertEl.textContent = '⚠  APPROACHING FL' + String(Math.round(a/100)).padStart(3,'0');
            altAlertEl.style.display = 'block';
            altAlertTimer = 2.5;
            altAlertFired = true;
          }
          if (Math.abs(diff) > 400) altAlertFired = false;
        }
        lastAltFt = altFt;
        if (altAlertTimer > 0) {
          altAlertTimer -= dt;
          if (altAlertTimer <= 0) altAlertEl.style.display = 'none';
        }
      }

      // ── Wind shear detector ────────────────────────────────
      if (!plane.onGround && !plane.crashed) {
        const hspd = Math.hypot(plane.vel.x, plane.vel.z);
        const dspd = hspd - lastHspd;
        // Sudden airspeed drop > 18 kt/s AND low altitude
        const altFt = plane.pos.y * 3.28084;
        if (dspd < -18 && altFt < 4000) {
          wsTimer = 5;
          wsActive = true;
          wsEl.style.display = 'block';
          try { if (typeof showMsg !== 'undefined') showMsg('⚠ WIND SHEAR · WIND SHEAR · WIND SHEAR', 5000); } catch(e) {}
        }
        lastHspd = hspd;
        if (wsTimer > 0) {
          wsTimer -= dt;
          // Blink effect
          wsEl.style.opacity = (Math.floor(now * 4) % 2 === 0) ? '1' : '0.4';
          if (wsTimer <= 0) { wsEl.style.display = 'none'; wsActive = false; }
        }
      }

      // ── Stall buffet camera shake ──────────────────────────
      if (!plane.onGround && !plane.crashed && typeof plane.aoa !== 'undefined') {
        const stalling = plane.aoa > 0.3 || (typeof plane.cl !== 'undefined' && plane.cl < 0.05);
        if (stalling) {
          _stallBuffetIntensity = Math.min(1.2, _stallBuffetIntensity + dt * 3);
        } else {
          _stallBuffetIntensity = Math.max(0, _stallBuffetIntensity - dt * 5);
        }
        if (_stallBuffetIntensity > 0.05 && typeof camState !== 'undefined') {
          _stallBuffetPhase += dt * 28;
          camState.shake = Math.max(camState.shake, _stallBuffetIntensity * 0.6 * (0.7 + Math.sin(_stallBuffetPhase) * 0.3));
        }
      }

      // ── Spawn approach lights when near a runway ───────────
      if (typeof currentLocation !== 'undefined' && currentLocation && currentLocation.code !== alsfRunwayCode) {
        try { spawnALSF(currentLocation); } catch(e) {}
      }

    } catch(e) {}
  };
  improveTick();
})();
        /* ===== UPGRADE PACK 1: gear lever, pedestal buttons, landing lights, realistic windows ===== */
(function upgradePack1(){
  const S=window.__sim; if(!S||!S.scene)return;
  const scene=S.scene, BABYLON=S.BABYLON, plane=S.plane;
  const acRoot=scene.getTransformNodeByName('acRoot');
  const CKI=window.CKI;
  if(!acRoot||!CKI)return;

  const dispatchKey=code=>{window.dispatchEvent(new KeyboardEvent('keydown',{code}));window.dispatchEvent(new KeyboardEvent('keyup',{code}));};
  const toast=t=>{try{const b=document.getElementById('msgBox');if(!b)return;b.textContent=t;b.style.opacity=1;clearTimeout(toast._t);toast._t=setTimeout(()=>{b.style.opacity=0;},1600);}catch(e){}};
  const isJet737=()=>(window._activeModelId==='737'||window._activeModelId==='787')&&window._simCamMode===1;
  const mkStd=(n,r,g,b,spec)=>{const m=new BABYLON.StandardMaterial(n,scene);m.diffuseColor=new BABYLON.Color3(r,g,b);const s=spec==null?.15:spec;m.specularColor=new BABYLON.Color3(s,s,s);return m;};

  /* ---------- cockpit extras root (737/787 cockpit only) ---------- */
  const xc=new BABYLON.TransformNode('xcockpit',scene); xc.parent=acRoot;
  const reg=m=>{m.parent=xc;m.isPickable=false;return m;};
  const bx=(n,w,h,d,x,y,z,mat)=>{const b=BABYLON.MeshBuilder.CreateBox(n,{width:w,height:h,depth:d},scene);b.position.set(x,y,z);b.material=mat;return reg(b);};
  scene.registerBeforeRender(()=>{xc.setEnabled(isJet737());});

  /* ---------- 1. GEAR LEVER (real handle, clickable, animates with gear) ---------- */
  const chrome=mkStd('gl_chrome',.62,.64,.68,.9);
  const blk=mkStd('gl_blk',.03,.03,.035,.1);
  const orange=mkStd('gl_knobM',.85,.34,.08,.35);
  const GX=-.42,GY=-.29,GZ=14.5;
  bx('gl_plate',.16,.012,.22,GX,GY,GZ,chrome);
  bx('gl_slot',.1,.004,.16,GX,GY+.008,GZ,blk);
  const gPv=new BABYLON.TransformNode('gl_pv',scene);gPv.parent=xc;gPv.position.set(GX,GY+.01,GZ);
  const gArm=BABYLON.MeshBuilder.CreateCylinder('gl_arm',{height:.2,diameter:.03,tessellation:10},scene);
  gArm.position.y=.1;gArm.material=chrome;gArm.parent=gPv;gArm.isPickable=false;
  const gKnob=BABYLON.MeshBuilder.CreateBox('gl_knob',{width:.07,height:.06,depth:.05},scene);
  gKnob.position.y=.2;gKnob.material=orange;gKnob.parent=gPv;gKnob.isPickable=false;
  CKI.addMesh(['gl_knob','gl_arm'],{label:'GEAR LEVER · click',
    state:()=>plane.gearDown?'DOWN':'UP',
    act:()=>{CKI.snd&&CKI.snd('lever');dispatchKey('KeyG');}});

  /* ---------- 2. PEDESTAL BUTTON BANK (8 lit pushbuttons) + AUTOBRAKE KNOB ---------- */
  const BTN=[
    {label:'APU',color:[.95,.7,.15],isOn:()=>ENG.apu.running||ENG.apu.spooling,status:()=>ENG.apu.spooling?'STARTING':ENG.apu.running?'RUN':'OFF',act:toggleAPU},
    {label:'ANTI-ICE',color:[.95,.7,.15],isOn:()=>!!window._antiIceOn,status:()=>window._antiIceOn?'ON':'OFF',act:()=>{if(window._toggleAntiIce)window._toggleAntiIce();AIRSYS.antiIce.wing=!!window._antiIceOn;}},
    {label:'PACK L',color:[.1,.9,.3],isOn:()=>AIRSYS.air.packLeft,status:()=>AIRSYS.air.packLeft?'ON':'OFF',act:()=>{AIRSYS.air.packLeft=!AIRSYS.air.packLeft;}},
    {label:'PACK R',color:[.1,.9,.3],isOn:()=>AIRSYS.air.packRight,status:()=>AIRSYS.air.packRight?'ON':'OFF',act:()=>{AIRSYS.air.packRight=!AIRSYS.air.packRight;}},
    {label:'SEAT BELTS',color:[.95,.7,.15],isOn:()=>!!window._belts,status:()=>AIRSYS.cabin.beltMode,act:()=>{const modes=['AUTO','ON','OFF'];AIRSYS.cabin.beltMode=modes[(modes.indexOf(AIRSYS.cabin.beltMode)+1)%modes.length];}},
    {label:'NO SMOKE',color:[.95,.7,.15],isOn:()=>AIRSYS.cabin.noSmoke,status:()=>AIRSYS.cabin.noSmoke?'ON':'OFF',act:()=>{AIRSYS.cabin.noSmoke=!AIRSYS.cabin.noSmoke;window._noSmoke=AIRSYS.cabin.noSmoke;}},
    {label:'GND PWR',color:[.1,.9,.3],isOn:()=>AIRSYS.electrical.extPower,status:()=>AIRSYS.electrical.extPower?'CONNECTED':'OFF',act:()=>{AIRSYS.electrical.extPower=!AIRSYS.electrical.extPower;}},
    {label:'PARK BRK',color:[.95,.2,.15],isOn:()=>plane.parkingBrake,status:()=>plane.parkingBrake?'SET':'OFF',act:()=>{plane.parkingBrake=!plane.parkingBrake;}}
  ];
  const lampMats=[];
  const btnBody=mkStd('pb_body',.1,.1,.11,.25);
  BTN.forEach((b,i)=>{
    const x=-.195+(i%4)*.13, z=13.5+Math.floor(i/4)*.14;
    bx('pb_btn'+i,.085,.018,.08,x,-.283,z,btnBody);
    const lm=mkStd('pb_lampM'+i,.08,.08,.08,0);lm.emissiveColor=new BABYLON.Color3(0,0,0);
    lampMats.push({lm,col:b.color});
    bx('pb_lamp'+i,.05,.004,.03,x,-.272,z,lm);
  });
  CKI.addMesh(BTN.map((b,i)=>'pb_btn'+i).concat(BTN.map((b,i)=>'pb_lamp'+i)),{label:'PEDESTAL SWITCH',
    state:()=>'',act:null});
  // one spec per button so each gets its own label/state
  BTN.forEach((b,i)=>{
    CKI.meshSpecs=CKI.meshSpecs.filter(s=>!(s.names&&s.names.indexOf('pb_btn'+i)>=0));
    CKI.addMesh(['pb_btn'+i,'pb_lamp'+i],{label:b.label,state:b.status,
      act:()=>{b.act();CKI.snd&&CKI.snd('sw');toast(b.label+' '+b.status());}});
  });

  const abkMat=mkStd('abk_m',.12,.12,.13,.3);
  const abk=BABYLON.MeshBuilder.CreateCylinder('abk',{height:.03,diameter:.1,tessellation:20},scene);
  abk.position.set(-.33,-.28,13.55);abk.material=abkMat;reg(abk);
  const abkMark=bx('abk_mark',.01,.005,.045,-.33,-.262,13.55,mkStd('abk_mk',.95,.95,.95,0));
  abkMark.parent=abk;abkMark.position.set(0,.02,.025);
  CKI.addMesh(['abk'],{label:'AUTOBRAKE · click',state:()=>plane._ab?'MED':'OFF',
    act:()=>{plane._ab=!plane._ab;CKI.snd&&CKI.snd('knob');toast('AUTOBRAKE '+(plane._ab?'MED':'OFF'));}});

  /* ---------- per-frame: gear lever, lamps, knob ---------- */
  let lever=0,knobA=0;
  scene.registerBeforeRender(()=>{
    const dt=Math.min(.05,scene.getEngine().getDeltaTime()/1000);
    const tgt=plane.gearDown?.32:-.32;lever+=(tgt-lever)*Math.min(1,dt*10);gPv.rotation.x=-lever;
    const kt=plane._ab?Math.PI*.75:0;knobA+=(kt-knobA)*Math.min(1,dt*8);abk.rotation.y=knobA;
    for(let i=0;i<lampMats.length;i++){const L=lampMats[i],on=BTN[i].isOn();
      L.lm.emissiveColor=on?new BABYLON.Color3(L.col[0],L.col[1],L.col[2]):new BABYLON.Color3(0,0,0);
      L.lm.diffuseColor=on?new BABYLON.Color3(L.col[0],L.col[1],L.col[2]):new BABYLON.Color3(.08,.08,.08);}
  });

  /* ---------- 3. BETTER LANDING LIGHTS (soft gradient beams instead of hard cylinders) ---------- */
  const beamTex=(()=>{
    const T=new BABYLON.DynamicTexture('lbeamT',{width:8,height:256},scene,false);
    const c=T.getContext();const img=c.createImageData(8,256);
    for(let y=0;y<256;y++){
      const v=1-y/255;
      const a=Math.min(1,Math.max(0,v/.06))*(.35+.65*(1-v))*(1-Math.min(1,Math.max(0,(v-.9)/.1)));
      for(let x=0;x<8;x++){const o=(y*8+x)*4;img.data[o]=255;img.data[o+1]=246;img.data[o+2]=225;img.data[o+3]=Math.round(a*255);}
    }
    c.putImageData(img,0,0);T.hasAlpha=true;T.update(false);return T;
  })();
  const beamMat=new BABYLON.StandardMaterial('lbeamM',scene);
  beamMat.emissiveColor=new BABYLON.Color3(1,.96,.85);beamMat.diffuseColor=new BABYLON.Color3(0,0,0);
  beamMat.disableLighting=true;beamMat.opacityTexture=beamTex;beamMat.alphaMode=BABYLON.Engine.ALPHA_ADD;
  beamMat.backFaceCulling=false;beamMat.disableDepthWrite=true;beamMat.fogEnabled=false;
  ['llcone-1','llcone1','llcone2-1','llcone21'].forEach(n=>{const m=scene.getMeshByName(n);if(m)m.material=beamMat;});
  // the base file sets cone alpha each frame; this runs after it and boosts the beam when it is visible (night + lights on)
  scene.registerBeforeRender(()=>{beamMat.alpha=1.15;});

  /* ---------- 4. REALISTIC WINDOW LAYOUT for every airliner model ---------- */
  const surfHW=(st,z,y)=>{
    for(let i=0;i<st.length-1;i++){
      const a=st[i],b=st[i+1],hi=Math.max(a.z,b.z),lo=Math.min(a.z,b.z);
      if(z<=hi&&z>=lo&&hi>lo){
        const t=(a.z-z)/(a.z-b.z),L=k=>a[k]*(1-t)+b[k]*t;
        const r=L('r'),w=L('w'),h=L('h'),yo=L('yo');
        const q=(y-yo)/(r*h);
        return{hw:r*w*Math.sqrt(Math.max(0,1-q*q)),r,w,h,yo};
      }
    }
    return null;
  };
  const winFrameM=mkStd('wf_frame',.09,.095,.11,.05);
  const winGlassM=mkStd('wf_glass',.02,.035,.06,1);winGlassM.specularPower=140;
  winGlassM.emissiveColor=new BABYLON.Color3(.02,.03,.045);
  const rebuildWin=(id,g)=>{
    const D=window._DRESS&&window._DRESS[id];
    if(!D||!D.windows||!D.fus||!g)return;
    // hide the old, rougher window meshes
    g.getChildMeshes().forEach(m=>{if(m.name===id+'_fusWin'){m.setEnabled(false);m.isPickable=false;}});
    const W=D.windows,span=W.z0-W.z1;
    const doorZ=[W.z0-span*.20,W.z0-span*.66],hal=Math.max(.7,span*.04); // two door bays, skipped
    const frame=BABYLON.MeshBuilder.CreateBox(id+'_fusWinP',{width:.03,height:W.h*1.18,depth:W.w*1.5},scene);
    const glass=BABYLON.MeshBuilder.CreateBox(id+'_fusWinG',{width:.03,height:W.h,depth:W.w*1.05},scene);
    frame.material=winFrameM;glass.material=winGlassM;
    frame.parent=g;glass.parent=g;frame.isPickable=false;glass.isPickable=false;
    let n=0;
    for(let z=W.z0;z>=W.z1;z-=W.step){
      if(doorZ.some(d=>Math.abs(z-d)<hal))continue;
      const sf=surfHW(D.fus,z,W.y);if(!sf||sf.hw<.15)continue;
      for(const sd of [-1,1]){
        frame.thinInstanceAdd(BABYLON.Matrix.Translation(sd*(sf.hw+.001),W.y,z),false);
        glass.thinInstanceAdd(BABYLON.Matrix.Translation(sd*(sf.hw+.007),W.y,z),false);
        n++;
      }
    }
    if(n>0){frame.thinInstanceBufferUpdated('matrix');glass.thinInstanceBufferUpdated('matrix');}
    frame.alwaysSelectAsActiveMesh=true;glass.alwaysSelectAsActiveMesh=true;
  };
  // apply to models already built, and to any built later
  Object.keys(window._modelRoots||{}).forEach(id=>{
    const g=window._modelRoots[id];
    if(g&&!g._wFix){g._wFix=1;try{rebuildWin(id,g);}catch(e){console.warn('win',id,e);}}
  });
  const origEns=window._ensureModel;
  window._ensureModel=function(id){
    const g=origEns?origEns(id):null;
    if(g&&!g._wFix){g._wFix=1;try{rebuildWin(id,g);}catch(e){console.warn('win',id,e);}}
    return g;
  };
  console.log('[UPGRADE PACK 1] gear lever, pedestal bank, landing lights, windows online');
})();

/* ===== UPGRADE PACK 2: landing-light lens halos + rims, engine nozzle glow ===== */
(function upgradePack2(){
  const S=window.__sim; if(!S||!S.scene)return;
  const scene=S.scene,BABYLON=S.BABYLON,plane=S.plane;
  const lenses=[scene.getMeshByName('llg-1'),scene.getMeshByName('llg1')].filter(Boolean);
  if(!lenses.length)return;

  /* ---- 1. landing-light lens halos: soft glow that holds a roughly constant size on screen ---- */
  const hT=new BABYLON.DynamicTexture('ldgHaloT',{width:128,height:128},scene,false);
  const hc=hT.getContext(),hg=hc.createRadialGradient(64,64,0,64,64,64);
  hg.addColorStop(0,'rgba(255,250,235,1)');hg.addColorStop(.16,'rgba(255,238,200,.7)');
  hg.addColorStop(.45,'rgba(255,220,160,.16)');hg.addColorStop(1,'rgba(255,215,150,0)');
  hc.fillStyle=hg;hc.fillRect(0,0,128,128);hT.update(false);hT.hasAlpha=true;
  const haloM=new BABYLON.StandardMaterial('ldgHaloM',scene);
  haloM.emissiveTexture=hT;haloM.opacityTexture=hT;haloM.disableLighting=true;
  haloM.diffuseColor=new BABYLON.Color3(0,0,0);haloM.specularColor=new BABYLON.Color3(0,0,0);
  haloM.alphaMode=BABYLON.Engine.ALPHA_ADD;haloM.backFaceCulling=false;haloM.disableDepthWrite=true;haloM.fogEnabled=false;
  const halos=lenses.map((g,i)=>{
    const p=BABYLON.MeshBuilder.CreatePlane('ldgHalo'+i,{size:1},scene);
    p.material=haloM;p.billboardMode=BABYLON.Mesh.BILLBOARDMODE_ALL;p.isPickable=false;p.applyFog=false;
    return {m:p,g};
  });

  /* ---- 2. dark lens housings so the lamps read as physical fittings, not floating spheres ---- */
  const housingM=new BABYLON.StandardMaterial('ldgHousingM',scene);
  housingM.diffuseColor=new BABYLON.Color3(.12,.12,.13);housingM.specularColor=new BABYLON.Color3(.4,.4,.4);
  lenses.forEach((g,i)=>{
    const r=BABYLON.MeshBuilder.CreateTorus('ldgRim'+i,{diameter:1.3,thickness:.14,tessellation:32},scene);
    r.parent=g;r.rotation.x=Math.PI/2;r.material=housingM;r.isPickable=false;
  });

  /* ---- 3. engine nozzle glow (brightens with thrust) and a dark nozzle rim ---- */
  const engines=[];
  for(const sgn of [1,-1]){
    const ex=scene.getMeshByName('exh'+sgn); if(!ex)continue;
    const z=ex.position.z-.86;
    const rim=BABYLON.MeshBuilder.CreateTorus('exhRim'+sgn,{diameter:1.42,thickness:.08,tessellation:32},scene);
    rim.rotation.x=Math.PI/2;rim.position=new BABYLON.Vector3(ex.position.x,ex.position.y,z-.01);
    rim.parent=ex.parent;rim.material=housingM;rim.isPickable=false;
    const m=new BABYLON.StandardMaterial('exhGlowM'+sgn,scene);
    m.diffuseColor=new BABYLON.Color3(0,0,0);m.specularColor=new BABYLON.Color3(0,0,0);m.disableLighting=true;
    m.alphaMode=BABYLON.Engine.ALPHA_ADD;m.backFaceCulling=false;m.disableDepthWrite=true;
    const glow=BABYLON.MeshBuilder.CreateCylinder('exhGlow'+sgn,{height:.02,diameter:1.0,tessellation:24},scene);
    glow.rotation.x=Math.PI/2;glow.position=new BABYLON.Vector3(ex.position.x,ex.position.y,z);
    glow.parent=ex.parent;glow.material=m;glow.isPickable=false;glow.setEnabled(false);
    engines.push({m,glow,k:0});
  }

  /* ---- per-frame update ---- */
  scene.registerBeforeRender(()=>{
    const dt=Math.min(.1,scene.getEngine().getDeltaTime()/1000);
    const cockpitView=window._simCamMode===1;
    const cone=scene.getMeshByName('llcone-1');
    const night=!!(cone&&cone.isEnabled());
    haloM.alpha=night?.9:.45;

    const cp=S.camera?S.camera.position:BABYLON.Vector3.Zero();
    for(const h of halos){
      const on=h.g.isEnabled();           // the lens sphere is only shown while the landing lights are on
      h.m.setEnabled(on&&!cockpitView);
      if(!on)continue;
      const wp=h.g.getAbsolutePosition();
      h.m.position.copyFrom(wp);
      const d=BABYLON.Vector3.Distance(cp,wp);
      h.m.scaling.setAll(Math.max(4,Math.min(160,d*.05))*(night?1:.35));
    }

    const running=plane.engineOn!==false;
    const thr=running?Math.max(0,Math.min(1,plane.throttle||0)):0;
    const target=running?.12+.88*thr:0;
    for(const e of engines){
      e.k+=(target-e.k)*Math.min(1,dt*6);
      e.m.emissiveColor=new BABYLON.Color3(e.k,e.k*.42,e.k*.12);
      e.glow.setEnabled(e.k>.01);
    }
  });
  console.log('[UPGRADE PACK 2] landing-light halos, lens rims, engine nozzle glow online');
})();

/* ===== VISUAL PACK 3: cloud layer controls, clearer sky, glossier paint ===== */
(function visualPack3(){
  let tries=0;
  const iv=setInterval(()=>{
    const S=window.__sim;
    if(S&&S.scene&&S.scene.getMaterialByName&&S.scene.getMaterialByName('cM0')){clearInterval(iv);init(S);}
    else if(++tries>300)clearInterval(iv);
  },200);

  function init(S){
    const scene=S.scene;

    /* paint: a strong clear coat so the fuselage reads as glossy */
    const body=scene.getMaterialByName('bodyM');
    if(body&&body.clearCoat){body.clearCoat.isEnabled=true;body.clearCoat.intensity=.9;body.clearCoat.roughness=.05;}

    /* sky: a clearer, bluer daytime sky (less haze than the original settings) */
    const sky=scene.getMaterialByName('skyM');
    if(sky){sky.turbidity=6;sky.rayleigh=1.6;sky.mieCoefficient=.012;sky.mieDirectionalG=.8;}

    /* cloud layers */
    const layers=[0,1,2].map(L=>{
      const planes=scene.meshes.filter(m=>new RegExp('^c'+L+'_\\d+$').test(m.name))
        .sort((a,b)=>parseInt(a.name.split('_')[1])-parseInt(b.name.split('_')[1]));
      return {mat:scene.getMaterialByName('cM'+L),planes};
    });
    const KEY='cloudPrefs';
    const prefs={cover:100,opacity:100,low:true,mid:true,high:true};
    try{Object.assign(prefs,JSON.parse(localStorage.getItem(KEY)||'{}'));}catch(e){}
    const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
    prefs.cover=clamp(+prefs.cover||0,0,100);prefs.opacity=clamp(+prefs.opacity||0,10,100);

    function apply(){
      const on=[prefs.low,prefs.mid,prefs.high];
      layers.forEach((ly,L)=>{
        const keep=Math.round(ly.planes.length*prefs.cover/100);
        ly.planes.forEach((m,i)=>m.setEnabled(!!on[L]&&i<keep));
        if(ly.mat)ly.mat.alpha=prefs.opacity/100;
      });
      try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch(e){}
    }

    /* panel */
    const css=document.createElement('style');
    css.textContent=`
      #cloudBtn{position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);left:calc(env(safe-area-inset-left,0px) + 8px);z-index:330;background:rgba(8,14,24,.78);color:#cfeeff;border:1px solid rgba(120,200,255,.45);border-radius:9px;padding:6px 10px;font:800 11px/1 system-ui,sans-serif;letter-spacing:.4px;cursor:pointer}
      #cloudPanel{position:fixed;top:calc(env(safe-area-inset-top,0px) + 50px);left:calc(env(safe-area-inset-left,0px) + 8px);z-index:330;width:220px;padding:12px;box-sizing:border-box;background:rgba(8,14,24,.92);color:#cfeeff;border:1px solid rgba(120,200,255,.45);border-radius:12px;font:12px/1.3 system-ui,sans-serif;display:none}
      #cloudPanel.open{display:block}
      #cloudPanel .cp-h{font-weight:800;letter-spacing:1px;margin-bottom:8px;color:#8fd6ff}
      #cloudPanel label{display:block;margin:8px 0 4px}
      #cloudPanel input[type=range]{width:100%}
      #cloudPanel .cp-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;align-items:center}
      #cloudPanel button{flex:1;background:rgba(60,120,180,.5);color:#fff;border:1px solid rgba(120,200,255,.45);border-radius:7px;padding:6px 4px;font:700 11px sans-serif;cursor:pointer}`;
    document.head.appendChild(css);

    const btn=document.createElement('button');btn.id='cloudBtn';btn.textContent='CLOUDS';
    const panel=document.createElement('div');panel.id='cloudPanel';
    panel.innerHTML=
      '<div class="cp-h">CLOUD LAYERS</div>'+
      '<label>Coverage <span id="cpCov"></span></label><input type="range" min="0" max="100" id="cpCovR">'+
      '<label>Opacity <span id="cpOp"></span></label><input type="range" min="10" max="100" id="cpOpR">'+
      '<div class="cp-row"><label><input type="checkbox" id="cpLo"> Low</label><label><input type="checkbox" id="cpMi"> Mid</label><label><input type="checkbox" id="cpHi"> High</label></div>'+
      '<div class="cp-row"><button id="cpClr">Clear</button><button id="cpFull">Overcast</button></div>';
    document.body.appendChild(btn);document.body.appendChild(panel);

    const $=id=>document.getElementById(id);
    function sync(){
      $('cpCovR').value=prefs.cover;$('cpOpR').value=prefs.opacity;
      $('cpCov').textContent=prefs.cover+'%';$('cpOp').textContent=prefs.opacity+'%';
      $('cpLo').checked=!!prefs.low;$('cpMi').checked=!!prefs.mid;$('cpHi').checked=!!prefs.high;
    }
    btn.addEventListener('click',()=>{panel.classList.toggle('open');});
    $('cpCovR').addEventListener('input',e=>{prefs.cover=+e.target.value;sync();apply();});
    $('cpOpR').addEventListener('input',e=>{prefs.opacity=+e.target.value;sync();apply();});
    $('cpLo').addEventListener('change',e=>{prefs.low=e.target.checked;apply();});
    $('cpMi').addEventListener('change',e=>{prefs.mid=e.target.checked;apply();});
    $('cpHi').addEventListener('change',e=>{prefs.high=e.target.checked;apply();});
    $('cpClr').addEventListener('click',()=>{Object.assign(prefs,{cover:0});sync();apply();});
    $('cpFull').addEventListener('click',()=>{Object.assign(prefs,{cover:100,low:true,mid:true,high:true});sync();apply();});

    sync();apply();
    window.CloudControls={set:(o)=>{Object.assign(prefs,o);sync();apply();},get:()=>({...prefs})};
    console.log('[VISUAL PACK 3] cloud controls, clearer sky, glossier paint online');
  }
})();
/* ===== HD PACK 1: sharp satellite ground near the aircraft ===== */
(function hdGround(){
  let tries=0;
  const iv=setInterval(()=>{
    const S=window.__sim;
    if(S&&S.scene&&S.BABYLON&&window.sampleSurface&&window.CFG&&window.CFG.origin){clearInterval(iv);init(S);}
    else if(++tries>300)clearInterval(iv);
  },200);

  function init(S){
    const scene=S.scene,BABYLON=S.BABYLON,plane=S.plane,CFG=window.CFG;
    const SIZE=2800,HALF=SIZE/2,RING=900,GRID=97,STEP=SIZE/(GRID-1),ZOOM=17;
    const TEXN=navigator.maxTouchPoints>0?1024:2048;
    const O=()=>CFG.origin;
    const mPerLon=()=>111320*Math.cos(O().lat*Math.PI/180);
    const w2ll=(x,z)=>({lat:O().lat-z/111132,lon:O().lon+x/mPerLon()});
    const ll2w=(lat,lon)=>({x:(lon-O().lon)*mPerLon(),z:-(lat-O().lat)*111132});
    const tX=(lon,z)=>(lon+180)/360*Math.pow(2,z);
    const tY=(lat,z)=>{const r=lat*Math.PI/180;return(1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*Math.pow(2,z);};
    const tLon=(x,z)=>x/Math.pow(2,z)*360-180;
    const tLat=(y,z)=>{const n=Math.PI-2*Math.PI*y/Math.pow(2,z);return 180/Math.PI*Math.atan(.5*(Math.exp(n)-Math.exp(-n)));};

    /* tile cache (ESRI satellite, same source the sim already uses) */
    const cache=new Map();
    function getTile(z,x,y){
      const k=z+'/'+x+'/'+y;
      if(cache.has(k))return cache.get(k);
      const p=new Promise(res=>{
        const img=new Image();img.crossOrigin='anonymous';
        const t=setTimeout(()=>res(null),12000);
        img.onload=()=>{clearTimeout(t);res(img);};
        img.onerror=()=>{clearTimeout(t);res(null);};
        img.src=`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
      });
      cache.set(k,p);
      if(cache.size>300)cache.delete(cache.keys().next().value);
      return p;
    }

    /* grid mesh: same winding and UV layout as the main terrain */
    const pos=new Float32Array(GRID*GRID*3),uvs=new Float32Array(GRID*GRID*2),idx=[];
    for(let j=0;j<GRID;j++)for(let i=0;i<GRID;i++){const k=j*GRID+i;
      pos[k*3]=-HALF+i*STEP;pos[k*3+2]=-HALF+j*STEP;
      uvs[k*2]=i/(GRID-1);uvs[k*2+1]=j/(GRID-1);}
    for(let j=0;j<GRID-1;j++)for(let i=0;i<GRID-1;i++){const a=j*GRID+i,c=a+GRID;idx.push(a,c,a+1,a+1,c,c+1);}
    const nrm=new Array(pos.length).fill(0);
    BABYLON.VertexData.ComputeNormals(pos,idx,nrm);
    const vd=new BABYLON.VertexData();
    vd.positions=pos;vd.uvs=uvs;vd.indices=idx;vd.normals=nrm;
    const mesh=new BABYLON.Mesh('hdGround',scene);
    vd.applyToMesh(mesh,true);

    const mat=new BABYLON.PBRMaterial('hdGroundM',scene);
    mat.metallic=0;mat.roughness=1;mat.specularIntensity=.06;mat.backFaceCulling=false;
    mat.zOffset=-3;mat.zOffsetUnits=-3;
    const tex=new BABYLON.DynamicTexture('hdGroundT',{width:TEXN,height:TEXN},scene,true);
    tex.wrapU=tex.wrapV=BABYLON.Texture.CLAMP_ADDRESSMODE;
    tex.anisotropicFilteringLevel=16;
    mat.albedoTexture=tex;
    mesh.material=mat;mesh.isPickable=false;mesh.alwaysSelectAsActiveMesh=true;mesh.setEnabled(false);

    const off=document.createElement('canvas');off.width=off.height=TEXN;
    const oc=off.getContext('2d');

    let centre=null,building=false;
    async function build(cx,cz){
      building=true;
      try{
        const nw=w2ll(cx-HALF,cz-HALF),se=w2ll(cx+HALF,cz+HALF);
        const x0=Math.floor(tX(nw.lon,ZOOM)),x1=Math.floor(tX(se.lon,ZOOM));
        const y0=Math.floor(tY(nw.lat,ZOOM)),y1=Math.floor(tY(se.lat,ZOOM));
        oc.filter='none';oc.fillStyle='#2c4a55';oc.fillRect(0,0,TEXN,TEXN);
        oc.filter='saturate(1.22) contrast(1.07) brightness(1.03)';
        const jobs=[];
        for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)jobs.push(getTile(ZOOM,x,y).then(img=>{
          if(!img)return;
          const a=ll2w(tLat(y,ZOOM),tLon(x,ZOOM)),b=ll2w(tLat(y+1,ZOOM),tLon(x+1,ZOOM));
          const px=(a.x-(cx-HALF))/SIZE*TEXN,py=(a.z-(cz-HALF))/SIZE*TEXN;
          const pw=(b.x-a.x)/SIZE*TEXN,ph=(b.z-a.z)/SIZE*TEXN;
          oc.drawImage(img,px,py,pw+.6,ph+.6);
        }));
        await Promise.all(jobs);
        oc.filter='none';

        /* heights follow the same ground the sim uses (airport plateaus included) */
        for(let j=0;j<GRID;j++)for(let i=0;i<GRID;i++){
          const k=j*GRID+i;
          pos[k*3+1]=(window.sampleSurface(cx-HALF+i*STEP,cz-HALF+j*STEP)||0)+.3;
        }
        mesh.updateVerticesData(BABYLON.VertexBuffer.PositionKind,pos);
        const n2=new Array(pos.length).fill(0);
        BABYLON.VertexData.ComputeNormals(pos,idx,n2);
        mesh.updateVerticesData(BABYLON.VertexBuffer.NormalKind,n2);
        tex.getContext().drawImage(off,0,0);tex.update(false);
        mesh.position.set(cx,0,cz);

        /* hide the patch near airports so the sim's painted runways stay visible */
        let airport=false;
        for(let a=0;a<=8&&!airport;a++)for(let b=0;b<=8&&!airport;b++){
          if(window.airportBlend&&window.airportBlend(cx-HALF+a*SIZE/8,cz-HALF+b*SIZE/8))airport=true;}
        mesh.setEnabled(!airport);
        centre={x:cx,z:cz,lat:O().lat,lon:O().lon};
      }finally{building=false;}
    }

    scene.registerBeforeRender(()=>{
      if(building||plane.hold||plane.crashed)return;
      const c=centre;
      if(c){
        const same=c.lat===O().lat&&c.lon===O().lon;
        if(!same)mesh.setEnabled(false);
        if(same&&Math.hypot(plane.pos.x-c.x,plane.pos.z-c.z)<RING)return;
      }
      build(plane.pos.x,plane.pos.z).catch(e=>console.warn('[hdGround]',e));
    });
    console.log('[HD PACK 1] sharp near-field satellite ground online');
  }
})();
