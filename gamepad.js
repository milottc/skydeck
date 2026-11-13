/* Standard Gamepad API support for the flight controls. */
(function(){
  const DZ=0.12;
  const dz=v=>Math.abs(v)<DZ?0:(v-Math.sign(v)*DZ)/(1-DZ);
  const TAP={0:'KeyG',1:'KeyF',2:'KeyL',3:'KeyP',4:'KeyN',8:'KeyC',9:'KeyX'};
  const HOLD={5:'Space'};
  const RUDDER_R=0.5;
  const prevBtn={},holding={};
  const key=(code,down)=>window.dispatchEvent(new KeyboardEvent(down?'keydown':'keyup',{code}));
  let last=performance.now(),activePad=null;

  function releaseInputs(){
    window.__gamepadSet&&window.__gamepadSet(0,0);
    window.__gamepadThrottle&&window.__gamepadThrottle(0,0);
    window.__gpActive=false;
    for(const code of Object.keys(holding)){
      if(holding[code])key(code,false);
      holding[code]=false;
    }
    for(const index of Object.keys(prevBtn))prevBtn[index]=false;
  }

  function poll(now){
    requestAnimationFrame(poll);
    const dt=Math.min(0.1,Math.max(0,(now-last)/1000));last=now;
    const pads=(navigator.getGamepads&&navigator.getGamepads())||[];
    const pad=[...pads].find(p=>p&&p.connected);
    if(!pad){if(activePad!==null){activePad=null;releaseInputs();}return;}
    activePad=pad.index;

    const roll=-dz(pad.axes[0]||0),pitch=-dz(pad.axes[1]||0);
    if(window.__gamepadSet&&(roll||pitch||window.__gpActive))window.__gamepadSet(pitch,roll);
    window.__gpActive=!!(roll||pitch);

    const yaw=pad.axes[2]||0;
    const want={KeyQ:yaw<-RUDDER_R,KeyE:yaw>RUDDER_R};
    for(const code in want)if(want[code]!==!!holding[code]){
      holding[code]=want[code];key(code,want[code]);
    }

    const lt=pad.buttons[6]?pad.buttons[6].value:0;
    const rt=pad.buttons[7]?pad.buttons[7].value:0;
    if(window.__gamepadThrottle)window.__gamepadThrottle(rt-lt,dt);

    pad.buttons.forEach((button,index)=>{
      const down=!!button.pressed,was=!!prevBtn[index];
      if(down&&!was){
        if(TAP[index]){key(TAP[index],true);key(TAP[index],false);}
        if(HOLD[index]){holding[HOLD[index]]=true;key(HOLD[index],true);}
      }else if(!down&&was&&HOLD[index]){
        holding[HOLD[index]]=false;key(HOLD[index],false);
      }
      prevBtn[index]=down;
    });
  }

  requestAnimationFrame(poll);
  window.addEventListener('gamepadconnected',event=>{
    activePad=event.gamepad.index;
    console.log('Controller connected:',event.gamepad.id);
  });
  window.addEventListener('gamepaddisconnected',event=>{
    if(activePad===event.gamepad.index){activePad=null;releaseInputs();}
  });
  window.addEventListener('blur',releaseInputs);
})();
