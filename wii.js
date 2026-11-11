/* Private build: Wii Remote support via WebHID (desktop Chrome/Edge on Windows, Linux, macOS).
 * The Wii Remote is a classic-Bluetooth HID device, so Web Bluetooth (navigator.bluetooth) cannot see it.
 * Pair it in your OS Bluetooth settings first (press 1+2 to put it in pairing mode), then press the button here.
 *
 * Mapping (edit BTN_KEYS / DPAD_KEYS below to change it):
 *   D-pad  -> W/S (pitch) and A/D (roll), held
 *   A  -> G (gear)      B -> F (flaps)     1 -> L (landing lights)   2 -> P (autopilot)
 *   +  -> X (PFD)       -  -> C (camera)   Home -> Escape            */
(function(){
  const VENDOR=0x057e, PRODUCT=0x0306;               // Nintendo RVL-CNT-01
  const DPAD_KEYS={up:'KeyW',down:'KeyS',left:'KeyA',right:'KeyD'};
  const BTN_KEYS={a:'KeyG',b:'KeyF',one:'KeyL',two:'KeyP',plus:'KeyX',minus:'KeyC',home:'Escape'};
  // Byte 1 (after report id) and byte 2 of a 0x30/0x31 input report
  const DPAD_BITS={left:0x01,right:0x02,down:0x04,up:0x08,plus:0x10};
  const BTN_BITS={two:[0x01,'two'],one:[0x02,'one'],b:[0x04,'b'],a:[0x08,'a'],minus:[0x10,'minus'],home:[0x80,'home']};

  const btn=document.getElementById('wii-sync-btn');
  const status=document.getElementById('wii-status');
  let device=null,prevDpad=0,prevBtn=0;
  const say=t=>{if(status)status.textContent=t;};
  const tap=(code,down)=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code}));

  function onReport(ev){
    const d=ev.data;
    // 0x30 = core buttons only (2 bytes); 0x31 adds accelerometer data after them
    if(ev.reportId!==0x30&&ev.reportId!==0x31)return;
    const b1=d.getUint8(0),b2=d.getUint8(1);
    const dpad=b1;
    for(const k in DPAD_BITS){
      const m=DPAD_BITS[k];
      if(k==='plus'){
        if(((dpad&m)!==0)!==((prevDpad&m)!==0))tap('KeyX',(dpad&m)!==0);
        continue;
      }
      const now=(dpad&m)!==0,was=(prevDpad&m)!==0;
      if(now!==was&&DPAD_KEYS[k])tap(DPAD_KEYS[k],now);
    }
    for(const k in BTN_BITS){
      const [m,name]=BTN_BITS[k];
      const now=(b2&m)!==0,was=(prevBtn&m)!==0;
      if(now!==was&&BTN_KEYS[name])tap(BTN_KEYS[name],now);
    }
    prevDpad=dpad;prevBtn=b2;
  }

  async function connect(){
    if(!navigator.hid){
      say('WebHID not available. Use desktop Chrome or Edge (Windows, Linux or macOS). Not supported on Android or iPad.');
      return;
    }
    try{
      const [found]=await navigator.hid.getDevices().then(l=>l.filter(d=>d.vendorId===VENDOR&&d.productId===PRODUCT));
      device=found||await navigator.hid.requestDevice({filters:[{vendorId:VENDOR,productId:PRODUCT}]});
      if(!device){say('No Wii Remote selected.');return;}
      if(!device.opened)await device.open();
      device.addEventListener('inputreport',onReport);
      // Report 0x12: flags (0x00), reporting mode 0x30 = core buttons only
      await device.sendReport(0x12,new Uint8Array([0x00,0x30]));
      say('Wii Remote connected: '+(device.productName||'Nintendo RVL-CNT-01'));
    }catch(err){
      console.error('Wii connect failed:',err);
      say('Could not connect. Pair the Wii Remote in your OS Bluetooth settings (press 1+2), then try again. ('+(err.message||err)+')');
    }
  }

  if(btn)btn.addEventListener('click',connect);
  // Reconnect automatically for devices already granted to this site
  if(navigator.hid&&navigator.hid.addEventListener){
    navigator.hid.addEventListener('disconnect',e=>{if(e.device===device){say('Wii Remote disconnected.');device=null;}});
  }
})();
