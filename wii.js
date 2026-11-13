/* Wii Remotes use Bluetooth Classic HID, which browser WebHID cannot access.
 * A native driver/bridge must expose the remote as a standard Gamepad first. */
(function(){
  const btn=document.getElementById('wii-sync-btn');
  const status=document.getElementById('wii-status');
  const say=text=>{if(status)status.textContent=text;};

  function connectedGamepad(){
    return [...(navigator.getGamepads?.()||[])].find(p=>p&&p.connected);
  }

  if(btn)btn.addEventListener('click',()=>{
    const pad=connectedGamepad();
    if(pad){
      say('Controller available to the simulator: '+pad.id);
      return;
    }
    say('The browser cannot pair with a Wii Remote directly: it uses Bluetooth Classic HID, not browser-accessible WebHID/Bluetooth LE. Use a native driver or bridge that exposes it as a standard gamepad, then reconnect it; the simulator will detect it automatically.');
  });

  window.addEventListener('gamepadconnected',event=>{
    say('Controller available to the simulator: '+event.gamepad.id);
  });
  window.addEventListener('gamepaddisconnected',()=>{
    say('Controller disconnected.');
  });
})();
