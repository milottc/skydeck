/* Uses the MIT-licensed WebHID Wiimote protocol library, pinned to a jsDelivr commit. */
(function(){
  const VENDOR=0x057e;
  const PRODUCTS=new Set([0x0306,0x0330]);
  const KEYS={
    DPAD_UP:'KeyW',DPAD_DOWN:'KeyS',DPAD_LEFT:'KeyA',DPAD_RIGHT:'KeyD',
    A:'KeyG',B:'KeyF',ONE:'KeyL',TWO:'KeyP',PLUS:'KeyX',MINUS:'KeyC',HOME:'Escape'
  };
  const LIBRARY_URL='https://cdn.jsdelivr.net/gh/PicchiKevin/wiimote-webhid@dd72f846159020d1dac665b29913b5bb34dd3e0c/src/wiimote.js';
  const libraryPromise=import(LIBRARY_URL).then(module=>module.default).catch(error=>{
    console.error('Wii Remote protocol library failed to load:',error);
    return null;
  });

  const btn=document.getElementById('wii-sync-btn');
  const status=document.getElementById('wii-status');
  let device=null,remote=null,connecting=false;
  const held=new Set();
  const say=text=>{if(status)status.textContent=text;};
  const dispatch=(code,down)=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code}));
  const releaseAll=()=>{for(const code of held)dispatch(code,false);held.clear();};

  function updateButtons(buttons){
    const next=new Set(Object.entries(KEYS).filter(([name])=>buttons[name]).map(([,code])=>code));
    for(const code of new Set([...held,...next])){
      if(held.has(code)!==next.has(code))dispatch(code,next.has(code));
    }
    held.clear();
    next.forEach(code=>held.add(code));
  }

  async function connect(){
    if(connecting)return;
    if(!navigator.hid){
      say('WebHID is unavailable in this browser. Try desktop Chrome or Edge over HTTPS.');
      return;
    }
    if(device?.opened){say('Wii Remote is already connected.');return;}

    connecting=true;
    if(btn){btn.disabled=true;btn.textContent='Connecting…';}
    let selected=null,reportHandler=null,timer;
    try{
      // Start the chooser during the click gesture; loading the CDN module can take longer.
      const chooser=navigator.hid.requestDevice({
        filters:[{vendorId:VENDOR}]
      });
      const [WiiRemote,devices]=await Promise.all([libraryPromise,chooser]);
      if(!WiiRemote)throw new Error('Could not load the Wii Remote support module from jsDelivr.');
      selected=devices.find(candidate=>
        PRODUCTS.has(candidate.productId)||/wii.?remote|wiimote|rvl-cnt/i.test(candidate.productName||'')
      );
      if(!selected){
        say(devices.length
          ?'That Nintendo HID device is not a recognized Wii Remote.'
          :'The chooser found no Nintendo HID device. Pair the remote in your computer Bluetooth settings and press 1+2. On Windows, the default Bluetooth driver may not expose it to WebHID; a compatible Wii Remote HID driver may be required.');
        return;
      }

      await selected.open();
      device=selected;
      remote=new WiiRemote(selected);
      remote.BtnListener=updateButtons;
      say('Wii Remote opened. Press a button to confirm input…');

      await new Promise((resolve,reject)=>{
        reportHandler=event=>{
          if(event.reportId===0x30||event.reportId===0x31)resolve();
        };
        selected.addEventListener('inputreport',reportHandler);
        timer=setTimeout(()=>reject(new Error('No button reports received.')),6000);
      });
      say('Wii Remote connected: '+(selected.productName||'Nintendo Wii Remote'));
    }catch(error){
      releaseAll();
      if(selected){
        if(reportHandler)selected.removeEventListener('inputreport',reportHandler);
        selected.oninputreport=null;
        if(selected.opened)await selected.close().catch(()=>{});
      }
      if(device===selected)device=null;
      remote=null;
      console.error('Wii Remote connection failed:',error);
      if(error.name==='NotFoundError'){
        say('No Wii Remote appeared in the picker. On Windows, the default Bluetooth driver may not expose it to WebHID; pair it in Bluetooth settings, then install/configure a compatible Wii Remote HID driver and retry.');
      }else if(error.message==='No button reports received.'){
        say('The device opened, but sent no button reports. Check the Wii Remote HID driver, reconnect the remote, then try again.');
      }else{
        say('Could not connect to the Wii Remote: '+(error.message||error));
      }
    }finally{
      clearTimeout(timer);
      if(reportHandler&&selected)selected.removeEventListener('inputreport',reportHandler);
      connecting=false;
      if(btn){btn.disabled=false;btn.textContent='Connect Wii Remote';}
    }
  }

  if(btn)btn.addEventListener('click',connect);
  if(navigator.hid&&navigator.hid.addEventListener){
    navigator.hid.addEventListener('disconnect',event=>{
      if(event.device===device){
        releaseAll();
        device=null;
        remote=null;
        say('Wii Remote disconnected.');
      }
    });
  }
})();
