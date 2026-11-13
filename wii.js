/* Private build: Wii Remote support via WebHID (desktop Chrome/Edge on Windows, Linux, macOS).
 * The Wii Remote is a classic-Bluetooth HID device, so Web Bluetooth (navigator.bluetooth) cannot see it.
 * Pair it in your OS Bluetooth settings first (press 1+2 to put it in pairing mode), then press the button here.
 *
 * Mapping (edit KEY_BITS below to change it):
 *   D-pad  -> W/S (pitch) and A/D (roll), held
 *   A  -> G (gear)      B -> F (flaps)     1 -> L (landing lights)   2 -> P (autopilot)
 *   +  -> X (PFD)       -  -> C (camera)   Home -> Escape            */
(function(){
  const VENDOR=0x057e, PRODUCTS=new Set([0x0306,0x0330]); // RVL-CNT-01 and RVL-CNT-01-TR
  const FILTERS=[...PRODUCTS].map(productId=>({vendorId:VENDOR,productId}));
  // The two button bytes form a little-endian 16-bit mask in 0x30/0x31 reports.
  const KEY_BITS={
    0x0001:'KeyP',   // 2
    0x0002:'KeyL',   // 1
    0x0004:'KeyF',   // B
    0x0008:'KeyG',   // A
    0x0010:'KeyC',   // -
    0x0080:'Escape', // Home
    0x0100:'KeyA',   // Left
    0x0200:'KeyD',   // Right
    0x0400:'KeyS',   // Down
    0x0800:'KeyW',   // Up
    0x1000:'KeyX'    // +
  };

  const btn=document.getElementById('wii-sync-btn');
  const status=document.getElementById('wii-status');
  let device=null,prevButtons=0,connecting=false;
  const heldKeys=new Set();
  const say=t=>{if(status)status.textContent=t;};
  const tap=(code,down)=>{
    if(down)heldKeys.add(code);else heldKeys.delete(code);
    window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code}));
  };
  const releaseAll=()=>{for(const code of heldKeys)tap(code,false);prevButtons=0;};

  function onReport(ev){
    const d=ev.data;
    // 0x30 = core buttons only (2 bytes); 0x31 adds accelerometer data after them
    if((ev.reportId!==0x30&&ev.reportId!==0x31)||d.byteLength<2)return;
    const buttons=d.getUint8(0)|(d.getUint8(1)<<8);
    for(const [mask,code] of Object.entries(KEY_BITS)){
      const bit=Number(mask),now=(buttons&bit)!==0,was=(prevButtons&bit)!==0;
      if(now!==was)tap(code,now);
    }
    prevButtons=buttons;
  }

  async function connect(){
    if(connecting)return;
    if(!navigator.hid){
      say('WebHID not available. Use desktop Chrome or Edge (Windows, Linux or macOS). Not supported on Android or iPad.');
      return;
    }
    connecting=true;
    if(btn){btn.disabled=true;btn.textContent='Connecting…';}
    try{
      const permitted=await navigator.hid.getDevices();
      const selected=permitted.find(d=>d.vendorId===VENDOR&&PRODUCTS.has(d.productId))
        ||(await navigator.hid.requestDevice({filters:FILTERS}))[0];
      if(!selected){
        say('No Wii Remote selected. Pair it in your computer Bluetooth settings, keep it in sync mode (press 1+2), then try again. If it still does not appear, this browser/OS may not expose Bluetooth HID devices through WebHID.');
        return;
      }
      if(device===selected&&selected.opened){say('Wii Remote already connected.');return;}
      releaseAll();
      device=selected;
      if(!device.opened)await device.open();
      // Report 0x12: flags (0x00), reporting mode 0x30 = core buttons only
      await device.sendReport(0x12,new Uint8Array([0x00,0x30]));
      device.addEventListener('inputreport',onReport);
      say('Wii Remote connected: '+(device.productName||'Nintendo Wii Remote'));
    }catch(err){
      console.error('Wii connect failed:',err);
      if(device){device.removeEventListener('inputreport',onReport);device=null;}
      releaseAll();
      say(err.name==='NotFoundError'
        ?'No compatible Wii Remote found. Pair it in your computer Bluetooth settings, press 1+2 to keep it in sync mode, and reopen the picker.'
        :'Could not connect to Wii Remote. Check Bluetooth pairing and WebHID support, then try again. ('+(err.message||err)+')');
    }finally{
      connecting=false;
      if(btn){btn.disabled=false;btn.textContent='Sync Wii Remote';}
    }
  }

  if(btn)btn.addEventListener('click',connect);
  if(navigator.hid&&navigator.hid.addEventListener){
    navigator.hid.addEventListener('disconnect',e=>{
      if(e.device===device){releaseAll();device=null;say('Wii Remote disconnected.');}
    });
  }
})();
