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

/* ===== ADDED AIRLINES ===== */
LIVS.push(
 {n:'AIR FRANCE',nm:'AIR FRANCE',f:'bold 96px Arial',tc:[.02,.08,.32],b:[.99,.99,.99],a:[.02,.08,.32],t:[.02,.08,.32],e:[.02,.08,.32],nac:[.02,.08,.32]},
 {n:'AMERICAN',nm:'American',f:'bold 104px Arial',tc:[.0,.2,.5],b:[.82,.84,.86],a:[.93,.94,.95],t:[.93,.94,.95],e:[.0,.2,.5],nac:[.82,.84,.86],belly:[.72,.74,.76]},
 {n:'UNITED',nm:'United',f:'bold 104px Arial',tc:[.0,.2,.5],b:[.99,.99,.99],a:[.0,.2,.5],t:[.0,.2,.5],e:[.9,.7,.2],nac:[.0,.2,.5]},
 {n:'SINGAPORE AIRLINES',nm:'SINGAPORE AIRLINES',f:'bold 80px Arial',tc:[.05,.12,.3],b:[.99,.99,.99],a:[.05,.12,.3],t:[.05,.12,.3],e:[.85,.7,.3],nac:[.05,.12,.3]},
 {n:'ANA',nm:'ANA',f:'bold 128px Arial',tc:[.0,.25,.55],b:[.99,.99,.99],a:[.0,.25,.55],t:[.0,.25,.55],e:[.0,.25,.55],nac:[.0,.25,.55]},
 {n:'JAPAN AIRLINES',nm:'JAL',f:'bold 128px Arial',tc:[.8,.05,.1],b:[.99,.99,.99],a:[.8,.05,.1],t:[.99,.99,.99],e:[.8,.05,.1],nac:[.99,.99,.99]},
 {n:'KOREAN AIR',nm:'KOREAN AIR',f:'bold 96px Arial',tc:[.0,.2,.5],b:[.99,.99,.99],a:[.0,.2,.5],t:[.4,.65,.85],e:[.0,.2,.5],nac:[.4,.65,.85]},
 {n:'ETIHAD',nm:'ETIHAD',f:'bold 104px Arial',tc:[.55,.4,.15],b:[.98,.97,.94],a:[.75,.6,.3],t:[.75,.6,.3],e:[.75,.6,.3],nac:[.75,.6,.3]},
 {n:'QATAR AIRWAYS',nm:'Qatar',f:'bold 112px Georgia,serif',tc:[.45,.05,.15],b:[.86,.87,.88],a:[.45,.05,.15],t:[.45,.05,.15],e:[.45,.05,.15],nac:[.45,.05,.15],belly:[.78,.79,.8]},
 {n:'TURKISH AIRLINES',nm:'TURKISH',f:'bold 104px Arial',tc:[.8,.05,.1],b:[.99,.99,.99],a:[.8,.05,.1],t:[.8,.05,.1],e:[.8,.05,.1],nac:[.8,.05,.1]},
 {n:'IBERIA',nm:'IBERIA',f:'bold 104px Arial',tc:[.8,.05,.1],b:[.99,.99,.99],a:[.8,.05,.1],t:[.8,.05,.1],e:[.95,.7,.1],nac:[.8,.05,.1]},
 {n:'SAS',nm:'SAS',f:'bold 128px Arial',tc:[.0,.15,.45],b:[.99,.99,.99],a:[.0,.15,.45],t:[.0,.15,.45],e:[.0,.15,.45],nac:[.0,.15,.45]},
 {n:'FINNAIR',nm:'FINNAIR',f:'bold 104px Arial',tc:[.0,.2,.5],b:[.99,.99,.99],a:[.0,.2,.5],t:[.0,.2,.5],e:[.0,.2,.5],nac:[.0,.2,.5]},
 {n:'NORWEGIAN',nm:'Norwegian',f:'bold 100px Arial',tc:[.8,.05,.1],b:[.99,.99,.99],a:[.8,.05,.1],t:[.8,.05,.1],e:[.8,.05,.1],nac:[.8,.05,.1]},
 {n:'EASYJET',nm:'easyJet',f:'bold 100px Arial',tc:[1,1,1],b:[.95,.5,.1],a:[.95,.5,.1],t:[.95,.5,.1],e:[.95,.5,.1],nac:[.95,.5,.1]},
 {n:'AIR NEW ZEALAND',nm:'Air New Zealand',f:'bold 84px Arial',tc:[.05,.05,.05],b:[.99,.99,.99],a:[.05,.05,.05],t:[.05,.05,.05],e:[.05,.05,.05],nac:[.05,.05,.05]},
 {n:'LATAM',nm:'LATAM',f:'bold 120px Arial',tc:[.15,.1,.4],b:[.99,.99,.99],a:[.15,.1,.4],t:[.15,.1,.4],e:[.15,.1,.4],nac:[.15,.1,.4]},
 {n:'ALASKA',nm:'Alaska',f:'bold 104px Arial',tc:[.0,.25,.55],b:[.99,.99,.99],a:[.0,.25,.55],t:[.0,.25,.55],e:[.0,.25,.55],nac:[.0,.25,.55]},
 {n:'JETBLUE',nm:'jetBlue',f:'bold 104px Arial',tc:[.0,.2,.55],b:[.99,.99,.99],a:[.0,.2,.55],t:[.0,.2,.55],e:[.0,.2,.55],nac:[.0,.2,.55]},
 {n:'THAI',nm:'THAI',f:'bold 128px Arial',tc:[.4,.1,.4],b:[.99,.99,.99],a:[.4,.1,.4],t:[.4,.1,.4],e:[.9,.6,.2],nac:[.4,.1,.4]},
 {n:'MALAYSIA',nm:'MALAYSIA',f:'bold 96px Arial',tc:[.0,.2,.5],b:[.99,.99,.99],a:[.8,.05,.1],t:[.99,.99,.99],e:[.0,.2,.5],nac:[.0,.2,.5]},
 {n:'CHINA EASTERN',nm:'CHINA EASTERN',f:'bold 84px Arial',tc:[.0,.2,.5],b:[.99,.99,.99],a:[.0,.2,.5],t:[.0,.2,.5],e:[.8,.05,.1],nac:[.0,.2,.5]},
 {n:'AIR CHINA',nm:'AIR CHINA',f:'bold 96px Arial',tc:[.8,.05,.1],b:[.99,.99,.99],a:[.8,.05,.1],t:[.8,.05,.1],e:[.9,.7,.2],nac:[.8,.05,.1]},
 {n:'AEROFLOT',nm:'AEROFLOT',f:'bold 96px Arial',tc:[.0,.2,.55],b:[.9,.91,.92],a:[.0,.2,.55],t:[.0,.2,.55],e:[.9,.7,.2],nac:[.0,.2,.55],belly:[.78,.8,.82]},
 {n:'LOT',nm:'LOT',f:'bold 128px Arial',tc:[.0,.2,.55],b:[.99,.99,.99],a:[.0,.2,.55],t:[.0,.2,.55],e:[.0,.2,.55],nac:[.0,.2,.55]},
 {n:'AER LINGUS',nm:'Aer Lingus',f:'bold 96px Arial',tc:[.0,.45,.25],b:[.99,.99,.99],a:[.0,.45,.25],t:[.0,.45,.25],e:[.0,.45,.25],nac:[.0,.45,.25]},
 {n:'HAWAIIAN',nm:'HAWAIIAN',f:'bold 96px Arial',tc:[.4,.1,.35],b:[.99,.99,.99],a:[.4,.1,.35],t:[.4,.1,.35],e:[.9,.4,.6],nac:[.4,.1,.35]},
 {n:'TUI',nm:'TUI',f:'bold 128px Arial',tc:[.0,.35,.65],b:[.99,.99,.99],a:[.0,.35,.65],t:[.0,.35,.65],e:[.9,.1,.15],nac:[.0,.35,.65]},
 {n:'SPIRIT',nm:'spirit',f:'bold 112px Arial',tc:[.1,.1,.1],b:[.98,.85,.1],a:[.1,.1,.1],t:[.1,.1,.1],e:[.1,.1,.1],nac:[.1,.1,.1]},
 {n:'VIETNAM AIRLINES',nm:'VIETNAM AIRLINES',f:'bold 80px Arial',tc:[.0,.25,.5],b:[.99,.99,.99],a:[.0,.25,.5],t:[.0,.25,.5],e:[.9,.7,.2],nac:[.0,.25,.5]}
);

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
 'KLM ROYAL DUTCH AIRLINES':{top:[.0,.2,.52],cheat:[.0,.12,.38],nac:[.0,.2,.52],
   finfn:(f,S)=>{f.save();f.fillStyle='#fff';f.beginPath();f.moveTo(S*.25,S*.35);f.lineTo(S*.34,S*.35);f.lineTo(S*.37,S*.23);f.lineTo(S*.43,S*.32);f.lineTo(S*.5,S*.19);f.lineTo(S*.57,S*.32);f.lineTo(S*.63,S*.23);f.lineTo(S*.66,S*.35);f.lineTo(S*.75,S*.35);f.lineTo(S*.75,S*.39);f.lineTo(S*.25,S*.39);f.closePath();f.fill();f.font='bold 76px Arial';f.textAlign='center';f.textBaseline='middle';f.fillText('KLM',S*.5,S*.62);f.restore();}},

 /* ---- new airlines ---- */
 'AIR FRANCE':{nac:[.02,.08,.32],finfn:(f,S)=>{
   f.save();
   f.fillStyle='#fff';f.beginPath();f.moveTo(0,S*.1);f.lineTo(S,S*.44);f.lineTo(S,S*.56);f.lineTo(0,S*.22);f.closePath();f.fill();
   f.fillStyle='#e30613';f.beginPath();f.moveTo(0,S*.24);f.lineTo(S,S*.58);f.lineTo(S,S*.66);f.lineTo(0,S*.32);f.closePath();f.fill();
   f.restore();}},
 'AMERICAN':{nac:[.82,.84,.86],finfn:(f,S)=>{
   f.save();
   f.fillStyle='#005a9e';f.beginPath();f.moveTo(S*.1,S);f.lineTo(S*.55,S);f.lineTo(S*.92,S*.12);f.lineTo(S*.5,S*.12);f.closePath();f.fill();
   f.fillStyle='#c8102e';f.beginPath();f.moveTo(S*.58,S);f.lineTo(S*.72,S);f.lineTo(S*.96,S*.5);f.lineTo(S*.96,S*.24);f.closePath();f.fill();
   f.fillStyle='#fff';f.beginPath();f.moveTo(S*.5,S);f.lineTo(S*.58,S);f.lineTo(S*.96,S*.18);f.lineTo(S*.9,S*.12);f.closePath();f.fill();
   f.restore();}},
 'UNITED':{nac:[.0,.2,.5],finfn:(f,S)=>{
   f.save();f.strokeStyle='#f5c542';f.lineWidth=S*.028;
   f.beginPath();f.arc(S*.5,S*.46,S*.26,0,Math.PI*2);f.stroke();
   f.beginPath();f.ellipse(S*.5,S*.46,S*.1,S*.26,0,0,Math.PI*2);f.stroke();
   f.beginPath();f.moveTo(S*.24,S*.46);f.lineTo(S*.76,S*.46);f.stroke();
   f.beginPath();f.ellipse(S*.5,S*.46,S*.26,S*.09,0,0,Math.PI*2);f.stroke();
   f.restore();}},
 'SINGAPORE AIRLINES':{nac:[.05,.12,.3],finfn:(f,S)=>{
   f.save();f.fillStyle='#d4a94a';
   f.beginPath();f.moveTo(S*.28,S*.66);f.quadraticCurveTo(S*.42,S*.34,S*.76,S*.28);
   f.quadraticCurveTo(S*.56,S*.44,S*.56,S*.6);f.quadraticCurveTo(S*.44,S*.72,S*.28,S*.66);f.fill();
   f.beginPath();f.moveTo(S*.46,S*.58);f.quadraticCurveTo(S*.58,S*.4,S*.78,S*.36);
   f.quadraticCurveTo(S*.64,S*.5,S*.62,S*.64);f.quadraticCurveTo(S*.54,S*.64,S*.46,S*.58);f.fill();
   f.restore();}},
 'ANA':{nac:[.0,.25,.55],finfn:(f,S)=>{
   f.save();f.fillStyle='#fff';f.font='bold '+Math.round(S*.36)+'px Arial';f.textAlign='center';f.textBaseline='middle';f.fillText('ANA',S*.5,S*.55);f.restore();}},
 'JAPAN AIRLINES':{nac:[.99,.99,.99],finfn:(f,S)=>{
   f.save();f.strokeStyle='#b01e2f';f.lineWidth=S*.12;f.lineCap='round';
   f.beginPath();f.arc(S*.5,S*.78,S*.42,Math.PI*1.22,Math.PI*1.78);f.stroke();f.restore();}},
 'KOREAN AIR':{nac:[.4,.65,.85],finfn:(f,S)=>{
   f.save();const cx=S*.5,cy=S*.5,r=S*.24;
   f.fillStyle='#c8102e';f.beginPath();f.arc(cx,cy,r,Math.PI,0);f.fill();
   f.fillStyle='#003478';f.beginPath();f.arc(cx,cy,r,0,Math.PI);f.fill();
   f.fillStyle='#c8102e';f.beginPath();f.arc(cx-r/2,cy,r/2,0,Math.PI*2);f.fill();
   f.fillStyle='#003478';f.beginPath();f.arc(cx+r/2,cy,r/2,0,Math.PI*2);f.fill();
   f.restore();}},
 'ETIHAD':{nac:[.75,.6,.3],finfn:(f,S)=>{
   f.save();f.strokeStyle='rgba(255,255,255,.5)';f.lineWidth=S*.01;
   for(let i=0;i<7;i++){f.beginPath();f.moveTo(0,S*(.1+i*.12));f.lineTo(S,S*(.02+i*.12));f.stroke();}
   f.restore();}},
 'QATAR AIRWAYS':{nac:[.45,.05,.15],finfn:(f,S)=>{
   f.save();f.strokeStyle='#fff';f.lineWidth=S*.032;f.lineCap='round';
   f.beginPath();f.moveTo(S*.28,S*.62);f.lineTo(S*.58,S*.58);f.stroke();
   f.beginPath();f.moveTo(S*.34,S*.62);f.lineTo(S*.32,S*.76);f.stroke();
   f.beginPath();f.moveTo(S*.48,S*.6);f.lineTo(S*.48,S*.74);f.stroke();
   f.beginPath();f.moveTo(S*.58,S*.58);f.lineTo(S*.64,S*.44);f.stroke();
   f.beginPath();f.moveTo(S*.62,S*.46);f.lineTo(S*.56,S*.26);f.stroke();
   f.beginPath();f.moveTo(S*.64,S*.45);f.lineTo(S*.72,S*.28);f.stroke();
   f.restore();}},
 'TURKISH AIRLINES':{nac:[.8,.05,.1],finfn:(f,S)=>{
   f.save();f.fillStyle='#fff';
   f.beginPath();f.moveTo(S*.24,S*.62);f.quadraticCurveTo(S*.5,S*.28,S*.78,S*.54);
   f.quadraticCurveTo(S*.56,S*.52,S*.5,S*.7);f.quadraticCurveTo(S*.38,S*.64,S*.24,S*.62);f.fill();
   f.restore();}},
 'IBERIA':{nac:[.8,.05,.1],finfn:(f,S)=>{
   f.save();f.fillStyle='#f7c948';f.font='bold '+Math.round(S*.2)+'px Arial';f.textAlign='center';f.textBaseline='middle';f.fillText('IBERIA',S*.5,S*.55);
   f.strokeStyle='#f7c948';f.lineWidth=S*.02;f.beginPath();f.moveTo(S*.3,S*.38);f.lineTo(S*.7,S*.38);f.stroke();f.restore();}},
 'SAS':{nac:[.0,.15,.45],finfn:(f,S)=>{
   f.save();f.fillStyle='#fff';f.font='bold italic '+Math.round(S*.3)+'px Arial';f.textAlign='center';f.textBaseline='middle';f.fillText('SAS',S*.5,S*.55);f.restore();}},
 'FINNAIR':{nac:[.0,.2,.5],finfn:(f,S)=>{
   f.save();f.fillStyle='#fff';f.font='bold '+Math.round(S*.18)+'px Arial';f.textAlign='center';f.textBaseline='middle';f.fillText('FINNAIR',S*.5,S*.55);f.restore();}},
 'NORWEGIAN':{nac:[.8,.05,.1],finfn:(f,S)=>{
   f.save();f.fillStyle='#fff';f.font='bold '+Math.round(S*.42)+'px Arial';f.textAlign='center';f.textBaseline='middle';f.fillText('n',S*.5,S*.42);
   f.font='bold '+Math.round(S*.1)+'px Arial';f.fillText('NORWEGIAN',S*.5,S*.68);f.restore();}},
 'EASYJET':{nac:[.95,.5,.1],finfn:(f,S)=>{
   f.save();f.fillStyle='#fff';f.font='bold '+Math.round(S*.18)+'px Arial';f.textAlign='center';f.textBaseline='middle';f.fillText('easyJet',S*.5,S*.55);f.restore();}},
 'AIR NEW ZEALAND':{nac:[.05,.05,.05],finfn:(f,S)=>{
   f.save();f.strokeStyle='#fff';f.lineCap='round';
   f.lineWidth=S*.045;f.beginPath();f.moveTo(S*.28,S*.82);f.quadraticCurveTo(S*.42,S*.55,S*.72,S*.18);f.stroke();
   for(let i=0;i<7;i++){const t=i/6;const x=S*(.3+.4*t),y=S*(.8-.6*t);f.lineWidth=S*.016;
     f.beginPath();f.moveTo(x,y);f.lineTo(x-S*.1,y-S*.08);f.stroke();
     f.beginPath();f.moveTo(x,y);f.lineTo(x+S*.1,y-S*.1);f.stroke();}
   f.restore();}},
 'LATAM':{nac:[.15,.1,.4],finfn:(f,S)=>{
   f.save();f.fillStyle='#fff';f.beginPath();
   for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5;const r=i%2?S*.1:S*.24;const x=S*.5+Math.cos(a)*r,y=S*.5+Math.sin(a)*r;i?f.lineTo(x,y):f.moveTo(x,y);}
   f.closePath();f.fill();f.restore();}},
 'ALASKA':{nac:[.0,.25,.55],finfn:(f,S)=>{
   f.save();
   f.fillStyle='#fff';f.beginPath();f.arc(S*.5,S*.5,S*.2,0,Math.PI*2);f.fill();
   f.fillStyle='#003f87';f.beginPath();f.arc(S*.5,S*.42,S*.2,Math.PI*1.05,Math.PI*1.95);f.fill();
   f.beginPath();f.arc(S*.44,S*.52,S*.025,0,Math.PI*2);f.fill();
   f.beginPath();f.arc(S*.56,S*.52,S*.025,0,Math.PI*2);f.fill();
   f.restore();}},
 'JETBLUE':{nac:[.0,.2,.55],finfn:(f,S)=>{
   f.save();f.fillStyle='#fff';f.font='bold italic '+Math.round(S*.19)+'px Arial';f.textAlign='center';f.textBaseline='middle';f.fillText('jetBlue',S*.5,S*.55);f.restore();}},
 'THAI':{nac:[.4,.1,.4],finfn:(f,S)=>{
   f.save();
   for(let i=0;i<6;i++){const a=i*Math.PI/3;const x=S*.5+Math.cos(a)*S*.15,y=S*.5+Math.sin(a)*S*.15;
     f.fillStyle='#f4b6c2';f.beginPath();f.ellipse(x,y,S*.11,S*.055,a,0,Math.PI*2);f.fill();}
   f.fillStyle='#f7c948';f.beginPath();f.arc(S*.5,S*.5,S*.08,0,Math.PI*2);f.fill();f.restore();}},
 'MALAYSIA':{nac:[.0,.2,.5],finfn:(f,S)=>{
   f.save();
   f.fillStyle='#fff';f.beginPath();f.moveTo(S*.5,S*.14);f.lineTo(S*.72,S*.5);f.lineTo(S*.5,S*.86);f.lineTo(S*.28,S*.5);f.closePath();f.fill();
   f.fillStyle='#cc0001';f.beginPath();f.moveTo(S*.5,S*.14);f.lineTo(S*.62,S*.5);f.lineTo(S*.5,S*.5);f.closePath();f.fill();
   f.fillStyle='#003b7a';f.beginPath();f.moveTo(S*.5,S*.14);f.lineTo(S*.38,S*.5);f.lineTo(S*.5,S*.5);f.closePath();f.fill();
   f.fillStyle='#fff';f.beginPath();f.moveTo(S*.5,S*.5);f.lineTo(S*.62,S*.5);f.lineTo(S*.5,S*.86);f.closePath();f.fill();
   f.fillStyle='#003b7a';f.beginPath();f.moveTo(S*.5,S*.5);f.lineTo(S*.38,S*.5);f.lineTo(S*.5,S*.86);f.closePath();f.fill();
   f.restore();}},
 'CHINA EASTERN':{nac:[.0,.2,.5],finfn:(f,S)=>{
   f.save();f.fillStyle='#fff';
   f.beginPath();f.moveTo(S*.28,S*.62);f.quadraticCurveTo(S*.5,S*.32,S*.74,S*.5);
   f.quadraticCurveTo(S*.56,S*.56,S*.5,S*.72);f.quadraticCurveTo(S*.38,S*.66,S*.28,S*.62);f.fill();
   f.fillStyle='#d71920';f.beginPath();f.moveTo(S*.46,S*.56);f.lineTo(S*.58,S*.5);f.lineTo(S*.53,S*.62);f.closePath();f.fill();
   f.restore();}},
 'AIR CHINA':{nac:[.8,.05,.1],finfn:(f,S)=>{
   f.save();f.strokeStyle='#f7c948';f.lineWidth=S*.045;f.lineCap='round';
   f.beginPath();f.moveTo(S*.26,S*.74);f.quadraticCurveTo(S*.5,S*.3,S*.76,S*.28);f.stroke();
   f.beginPath();f.moveTo(S*.44,S*.56);f.quadraticCurveTo(S*.6,S*.42,S*.76,S*.46);f.stroke();
   f.restore();}},
 'AEROFLOT':{nac:[.0,.2,.55],finfn:(f,S)=>{
   f.save();f.fillStyle='#f7c948';
   f.beginPath();f.moveTo(S*.3,S*.72);f.quadraticCurveTo(S*.55,S*.34,S*.76,S*.26);
   f.quadraticCurveTo(S*.56,S*.5,S*.5,S*.72);f.closePath();f.fill();f.restore();}},
 'LOT':{nac:[.0,.2,.55],finfn:(f,S)=>{
   f.save();f.fillStyle='#fff';
   f.beginPath();f.moveTo(S*.34,S*.72);f.quadraticCurveTo(S*.44,S*.4,S*.72,S*.3);
   f.quadraticCurveTo(S*.56,S*.5,S*.6,S*.66);f.quadraticCurveTo(S*.48,S*.7,S*.34,S*.72);f.fill();f.restore();}},
 'AER LINGUS':{nac:[.0,.45,.25],finfn:(f,S)=>{
   f.save();f.fillStyle='#fff';
   for(const [dx,dy] of [[0,-.13],[-.14,.06],[.14,.06]]){f.beginPath();f.arc(S*(.5+dx),S*(.42+dy),S*.1,0,Math.PI*2);f.fill();}
   f.fillRect(S*.48,S*.46,S*.04,S*.26);
   f.restore();}},
 'HAWAIIAN':{nac:[.4,.1,.35],finfn:(f,S)=>{
   f.save();
   for(let i=0;i<6;i++){const a=i*Math.PI/3;const x=S*.5+Math.cos(a)*S*.14,y=S*.5+Math.sin(a)*S*.14;
     f.fillStyle='#f19cbb';f.beginPath();f.ellipse(x,y,S*.12,S*.05,a,0,Math.PI*2);f.fill();}
   f.fillStyle='#fff';f.beginPath();f.arc(S*.5,S*.5,S*.07,0,Math.PI*2);f.fill();f.restore();}},
 'TUI':{nac:[.0,.35,.65],finfn:(f,S)=>{
   f.save();f.strokeStyle='#e30613';f.lineWidth=S*.08;f.lineCap='round';
   f.beginPath();f.arc(S*.5,S*.5,S*.22,Math.PI*.15,Math.PI*.85);f.stroke();f.restore();}},
 'SPIRIT':{nac:[.1,.1,.1],finfn:(f,S)=>{
   f.save();f.fillStyle='#f5d90a';f.beginPath();f.arc(S*.5,S*.5,S*.2,0,Math.PI*2);f.fill();
   f.fillStyle='#111';f.font='bold '+Math.round(S*.12)+'px Arial';f.textAlign='center';f.textBaseline='middle';f.fillText('spirit',S*.5,S*.5);f.restore();}},
 'VIETNAM AIRLINES':{nac:[.0,.25,.5],finfn:(f,S)=>{
   f.save();f.fillStyle='#f7c948';
   f.beginPath();f.moveTo(S*.5,S*.24);f.quadraticCurveTo(S*.62,S*.4,S*.5,S*.56);
   f.quadraticCurveTo(S*.38,S*.4,S*.5,S*.24);f.fill();
   f.beginPath();f.moveTo(S*.5,S*.5);f.quadraticCurveTo(S*.7,S*.56,S*.66,S*.76);
   f.quadraticCurveTo(S*.5,S*.7,S*.5,S*.5);f.fill();
   f.beginPath();f.moveTo(S*.5,S*.5);f.quadraticCurveTo(S*.3,S*.56,S*.34,S*.76);
   f.quadraticCurveTo(S*.5,S*.7,S*.5,S*.5);f.fill();f.restore();}}
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
  g.moveTo(xc,H*.03);
  g.lineTo(xc+w/2,H*.07);
  g.lineTo(xc+w/2,H*.93);
  g.lineTo(xc,H*.97);
  g.lineTo(xc-w/2,H*.93);
  g.lineTo(xc-w/2,H*.07);
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
  if(L.top){g.fillStyle=css(L.top);g.fillRect(0,0,W*.5,H);}
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
  if(L.fusfn){try{L.fusfn(g,W,H);}catch(e){console.error('fusfn',e);}}
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