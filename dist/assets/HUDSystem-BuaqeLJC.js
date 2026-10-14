import{G as d}from"./index-DvbXMjFi.js";import"./three-core-qId0HGBl.js";const l={updateInterval:.1,fadeDuration:2};class p{constructor({eventBus:t=null,gameState:e=null,garageSystem:i=null,audio:o=null,config:a={}}={}){this.eventBus=t,this.gameState=e,this.garageSystem=i,this.audio=o,this.config={...l,...d?.hud??{},...a},this.elements={},this.timers={},this._disposers=[],this.radioIndex=0,this.radioPlaying=!1,this.radioMuted=!!this.audio?.isMuted,this.radioStations=Array.isArray(this.audio?.radioStations)?this.audio.radioStations:[],this._radioKeyHandler=null,this._bindEvents(),this._bindRadioKeyboardShortcuts()}initialize(){this._createUI(),this._updateGarageUI(),this._updateRadioUI()}_bindEvents(){this._subscribe("passenger:spotted",t=>{this._showNotification(`"${t.text}"`,2)}),this._subscribe("passenger:boarded",t=>{this._showNotification(`Destination: ${t.destination}`,3),this._updateTripUI(t.destination)}),this._subscribe("passenger:shout",()=>{this._showNotification("AKWAI! (Stop here!)",2,"urgent")}),this._subscribe("passenger:dropped",t=>{this._showNotification(`Fare: &#8358;${t.fare}`,3,"success"),this._clearTripUI()}),this._subscribe("negotiation:started",t=>{this._showNegotiation(t)}),this._subscribe("negotiation:finished",()=>{this._hideNegotiation()}),this._subscribe("checkpoint:approaching",()=>{this._showNotification("KAROTA Checkpoint Ahead",3,"warning")}),this._subscribe("checkpoint:fined",t=>{this._showNotification(`KAROTA Fine: &#8358;${t.amount}`,3,"urgent")}),this._subscribe("checkpoint:cleared",()=>{this._showNotification("Checkpoint Cleared",2,"success")}),this._subscribe("radio:changed",t=>{this._showNotification(`Radio: ${t.station}`,2)}),this._subscribe("game:started",()=>{this._toggleUI(!0)}),this._subscribe("game:over",()=>{this._toggleUI(!1)})}_createUI(){document.getElementById("kano-hud")?.remove();const t=document.createElement("div");t.id="kano-hud",Object.assign(t.style,{position:"fixed",inset:"0",width:"100%",height:"100%",pointerEvents:"none",fontFamily:"Arial, sans-serif",zIndex:"1000",color:"#fff"});const e=this._createElement("div",{position:"absolute",top:"20px",left:"20px",display:"flex",gap:"20px",background:"rgba(7, 18, 32, 0.88)",padding:"12px 20px",border:"1px solid rgba(0, 180, 216, 0.45)",borderRadius:"10px",color:"#fff",backdropFilter:"blur(8px)"});e.innerHTML=`
      <div>
        <span style="color:#00b4d8;font-size:11px">SPEED</span>
        <br>
        <b id="hud-speed">0</b> km/h
      </div>

      <div>
        <span style="color:#00b4d8;font-size:11px">WALLET</span>
        <br>
        <b id="hud-money">&#8358;0</b>
      </div>

      <div>
        <span style="color:#00b4d8;font-size:11px">LEVEL</span>
        <br>
        <b id="hud-level">1</b>
      </div>
    `,t.appendChild(e);const i=this._createElement("div",{position:"absolute",top:"20px",left:"50%",transform:"translateX(-50%)",background:"rgba(0, 120, 150, 0.94)",padding:"10px 30px",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.2)",color:"#fff",textAlign:"center",display:"none"});i.innerHTML=`
      <div style="font-size:11px;letter-spacing:2px">
        CURRENT TRIP
      </div>
      <b id="hud-destination" style="font-size:18px">---</b>
    `,t.appendChild(i);const o=this._createElement("div",{position:"absolute",top:"40%",left:"50%",transform:"translate(-50%, -50%)",background:"rgba(7, 18, 32, 0.94)",padding:"15px 30px",border:"1px solid rgba(0, 180, 216, 0.5)",borderRadius:"12px",color:"#fff",fontSize:"22px",fontWeight:"bold",textAlign:"center",opacity:"0",transition:"opacity 0.3s ease"});t.appendChild(o);const a=this._createElement("div",{position:"absolute",bottom:"100px",left:"50%",transform:"translateX(-50%)",background:"rgba(255,255,255,0.96)",padding:"20px",borderRadius:"12px",color:"#111",textAlign:"center",display:"none",pointerEvents:"auto",minWidth:"260px"});a.innerHTML=`
      <div
        id="neg-dialogue"
        style="font-size:18px;margin-bottom:12px"
      >...</div>

      <div style="display:flex;gap:10px;justify-content:center">
        <button
          id="btn-accept"
          style="padding:10px 20px;background:#16803d;color:#fff;border:0;border-radius:6px;cursor:pointer"
        >Accept (E)</button>

        <button
          id="btn-counter"
          style="padding:10px 20px;background:#fbbf24;color:#111;border:0;border-radius:6px;cursor:pointer"
        >Counter (Q)</button>
      </div>
    `,t.appendChild(a);const s=this._createElement("div",{position:"absolute",right:"20px",bottom:"20px",width:"min(300px, calc(100vw - 40px))",boxSizing:"border-box",padding:"14px",background:"rgba(7, 18, 32, 0.94)",border:"1px solid rgba(0, 180, 216, 0.6)",borderRadius:"12px",boxShadow:"0 8px 28px rgba(0,0,0,0.35)",pointerEvents:"auto",backdropFilter:"blur(10px)"});s.innerHTML=`
      <div style="
        display:flex;
        align-items:center;
        justify-content:space-between;
        margin-bottom:10px
      ">
        <span style="
          color:#00b4d8;
          font-size:11px;
          font-weight:bold;
          letter-spacing:2px
        ">KANO RADIO</span>

        <span id="hud-radio-status" style="
          color:#9ca3af;
          font-size:10px
        ">READY</span>
      </div>

      <div id="hud-radio-station" style="
        font-size:17px;
        font-weight:bold;
        overflow:hidden;
        text-overflow:ellipsis;
        white-space:nowrap;
        margin-bottom:12px
      ">Radio Kano</div>

      <div style="
        display:flex;
        gap:8px;
        align-items:center;
        justify-content:center;
        margin-bottom:12px
      ">
        <button id="hud-radio-prev" aria-label="Previous station"
          style="flex:1">< PREV</button>

        <button id="hud-radio-toggle" aria-label="Play or pause radio"
          style="flex:1.3;background:#00b4d8;color:#071220">PLAY PLAY</button>

        <button id="hud-radio-next" aria-label="Next station"
          style="flex:1">NEXT ></button>
      </div>

      <div style="
        display:flex;
        gap:10px;
        align-items:center;
        font-size:11px;
        color:#cbd5e1
      ">
        <label for="hud-radio-volume">VOL</label>

        <input
          id="hud-radio-volume"
          type="range"
          min="0"
          max="100"
          value="40"
          aria-label="Radio volume"
          style="flex:1;min-width:0;accent-color:#00b4d8;cursor:pointer"
        >

        <span id="hud-radio-volume-value">40%</span>
      </div>

      <div style="
        margin-top:9px;
        color:#94a3b8;
        font-size:10px;
        text-align:center;
        letter-spacing:0.5px
      ">R PLAY/PAUSE | N NEXT | B PREVIOUS | M MUTE</div>
    `;const r={padding:"9px 5px",background:"#172b42",color:"#fff",border:"1px solid #31506c",borderRadius:"6px",fontSize:"10px",fontWeight:"bold",cursor:"pointer"};s.querySelectorAll("button").forEach(n=>{Object.assign(n.style,r),n.addEventListener("mouseenter",()=>{n.style.filter="brightness(1.2)"}),n.addEventListener("mouseleave",()=>{n.style.filter="none"})}),t.appendChild(s),document.body.appendChild(t),this.elements={container:t,speed:t.querySelector("#hud-speed"),money:t.querySelector("#hud-money"),level:t.querySelector("#hud-level"),trip:i,destination:t.querySelector("#hud-destination"),notification:o,negotiation:a,radio:s,radioStation:t.querySelector("#hud-radio-station"),radioStatus:t.querySelector("#hud-radio-status"),radioToggle:t.querySelector("#hud-radio-toggle"),radioPrev:t.querySelector("#hud-radio-prev"),radioNext:t.querySelector("#hud-radio-next"),radioVolume:t.querySelector("#hud-radio-volume"),radioVolumeValue:t.querySelector("#hud-radio-volume-value")},this._bindRadioControls(),this._bindNegotiationControls()}_bindRadioControls(){const{radioToggle:t,radioPrev:e,radioNext:i,radioVolume:o,radioVolumeValue:a}=this.elements;e&&e.addEventListener("click",()=>{this._changeRadioStation(-1)}),i&&i.addEventListener("click",()=>{this._changeRadioStation(1)}),t&&t.addEventListener("click",()=>{this._toggleRadioPlayback()}),o&&o.addEventListener("input",()=>{const s=Number(o.value)/100;this.audio?.setRadioVolume?.(s),a&&(a.textContent=`${Math.round(s*100)}%`)})}_bindRadioKeyboardShortcuts(){this._radioKeyHandler=t=>{if(t.repeat||t.ctrlKey||t.altKey||t.metaKey)return;const e=t.target;if(!(e instanceof HTMLElement&&(e.isContentEditable||["INPUT","TEXTAREA","SELECT"].includes(e.tagName))))switch(t.key.toLowerCase()){case"r":t.preventDefault(),this._toggleRadioPlayback();break;case"n":t.preventDefault(),this._changeRadioStation(1);break;case"b":t.preventDefault(),this._changeRadioStation(-1);break;case"m":t.preventDefault(),this._toggleRadioMute();break}},window.addEventListener("keydown",this._radioKeyHandler)}_toggleRadioPlayback(){if(!this.audio){this._showNotification("Radio audio is unavailable",2.5,"urgent");return}if(this.radioPlaying){this.audio.stopRadio?.(),this.radioPlaying=!1,this._updateRadioUI();return}const t=this.radioStations[this.radioIndex];if(!t){this._showNotification("No radio stations configured",2.5,"urgent");return}try{const e=this.audio.startRadio?.(t.id);this.radioPlaying=e!==!1,this.radioPlaying||this._showNotification("Radio unavailable. Check audio initialization.",3,"urgent")}catch(e){this.radioPlaying=!1,console.warn("[Kano Run] Radio playback failed:",e),this._showNotification("Unable to start radio",2.5,"urgent")}this._updateRadioUI()}_toggleRadioMute(){if(!this.audio?.toggleMute){this._showNotification("Radio mute is unavailable",2,"urgent");return}try{this.audio.toggleMute(),this.radioMuted=!!this.audio.isMuted,this._updateRadioUI(),this._showNotification(this.radioMuted?"Radio muted":"Radio unmuted",1.5)}catch(t){console.warn("[Kano Run] Radio mute failed:",t),this._showNotification("Unable to toggle radio mute",2,"urgent")}}_changeRadioStation(t){if(!this.radioStations.length){this._showNotification("No radio stations configured",2.5,"urgent");return}const e=this.radioStations.length;this.radioIndex=(this.radioIndex+t+e)%e;const i=this.radioStations[this.radioIndex];if(this.radioPlaying&&this.audio)try{const o=this.audio.startRadio?.(i.id);this.radioPlaying=o!==!1}catch(o){this.radioPlaying=!1,console.warn("[Kano Run] Station change failed:",o)}this._updateRadioUI(),this._showNotification(`Radio: ${i.name}`,1.8)}_updateRadioUI(){const t=this.radioStations[this.radioIndex];if(this.elements.radioStation&&(this.elements.radioStation.textContent=t?.name??"Radio unavailable"),this.elements.radioStatus&&(this.radioMuted?(this.elements.radioStatus.textContent="â— MUTED",this.elements.radioStatus.style.color="#fbbf24"):(this.elements.radioStatus.textContent=this.radioPlaying?"â— ON AIR":"â— STANDBY",this.elements.radioStatus.style.color=this.radioPlaying?"#4ade80":"#9ca3af")),this.elements.radioToggle){this.elements.radioToggle.textContent=this.radioPlaying?"PAUSE":"PLAY PLAY";const e=!this.audio||this.radioStations.length===0;this.elements.radioToggle.disabled=e,this.elements.radioToggle.style.opacity=e?"0.5":"1"}}_bindNegotiationControls(){const t=this.elements.container?.querySelector("#btn-accept"),e=this.elements.container?.querySelector("#btn-counter");t?.addEventListener("click",()=>{this.eventBus?.emit?.("negotiation:accept")}),e?.addEventListener("click",()=>{this.eventBus?.emit?.("negotiation:counter")})}update(t){if(!this.gameState)return;const e=this.gameState.getRunState?.();e&&this.elements.speed&&(this.elements.speed.textContent=Math.floor(Number(e.speed)||0)),this.elements.money&&(this.elements.money.textContent=`&#8358;${this.gameState.profile?.money??0}`),this.elements.level&&(this.elements.level.textContent=this.gameState.profile?.level??1)}_showNotification(t,e=2,i="normal"){const o=this.elements.notification;if(!o)return;o.textContent=t;const a={urgent:"#ff6464",success:"#4ade80",warning:"#fbbf24",normal:"#ffffff"};o.style.color=a[i]??a.normal,o.style.opacity="1",clearTimeout(this.timers.notification),this.timers.notification=setTimeout(()=>{o.style.opacity="0"},Math.max(.1,e)*1e3)}_updateTripUI(t){this.elements.trip&&(this.elements.trip.style.display="block"),this.elements.destination&&(this.elements.destination.textContent=t??"---")}_clearTripUI(){this.elements.trip&&(this.elements.trip.style.display="none")}_showNegotiation(t={}){if(!this.elements.negotiation)return;this.elements.negotiation.style.display="block";const e=this.elements.container?.querySelector("#neg-dialogue");e&&(e.textContent=t.dialogue??"Negotiate the fare")}_hideNegotiation(){this.elements.negotiation&&(this.elements.negotiation.style.display="none")}_toggleUI(t){this.elements.container&&(this.elements.container.style.display=t?"block":"none")}_updateGarageUI(){}_createElement(t,e){const i=document.createElement(t);return Object.assign(i.style,e),i}_subscribe(t,e){if(!this.eventBus?.on)return;const i=this.eventBus.on(t,e);typeof i=="function"?this._disposers.push(i):typeof this.eventBus.off=="function"&&this._disposers.push(()=>this.eventBus.off(t,e))}dispose(){clearTimeout(this.timers.notification),this._radioKeyHandler&&(window.removeEventListener("keydown",this._radioKeyHandler),this._radioKeyHandler=null),this.elements.container?.remove();for(const t of this._disposers)try{t()}catch{}this._disposers=[],this.elements={}}}export{p as default};
