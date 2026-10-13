class u{constructor(t,e={}){this.inputManager=t,this.options={rootId:"game-ui",buttonSize:64,opacity:.72,enableSteering:!0,enablePedals:!0,enableHorn:!0,enablePause:!0,...e},this.root=null,this.container=null,this.buttons=new Map,this.activePointers=new Map,this.enabled=!0,this.visible=!0,this.disposed=!1,this.boundResize=this.handleResize.bind(this),this.boundContextMenu=i=>i.preventDefault(),this.createControls(),window.addEventListener("resize",this.boundResize,{passive:!0}),this.handleResize()}createControls(){typeof document>"u"||(this.root=document.getElementById(this.options.rootId)||document.body,this.injectStyles(),this.container=document.createElement("div"),this.container.className="kano-touch-controls",Object.assign(this.container.style,{position:"absolute",inset:"0",pointerEvents:"none",zIndex:"30",display:"none",touchAction:"none",userSelect:"none",WebkitUserSelect:"none"}),this.root.appendChild(this.container),this.createSteeringControls(),this.createPedalControls(),this.createUtilityControls(),this.container.addEventListener("contextmenu",this.boundContextMenu))}injectStyles(){if(document.getElementById("kano-touch-styles"))return;const t=document.createElement("style");t.id="kano-touch-styles",t.textContent=`
      .kano-touch-button {
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        border: 2px solid rgba(255,255,255,.7);
        border-radius: 50%;
        background: rgba(7,25,45,.76);
        color: #fff;
        font-family: Arial, sans-serif;
        font-weight: 900;
        font-size: 24px;
        box-shadow: 0 4px 12px rgba(0,0,0,.3);
        pointer-events: auto;
        touch-action: none;
        -webkit-tap-highlight-color: transparent;
        transition: background .08s, transform .08s;
      }

      .kano-touch-button.active {
        background: rgba(0,180,216,.95);
        border-color: #fff;
        transform: scale(.94);
      }

      .kano-touch-button:focus-visible {
        outline: 3px solid #fbbf24;
        outline-offset: 3px;
      }

      .kano-touch-button.pedal {
        border-radius: 18px;
        font-size: 13px;
        letter-spacing: .5px;
      }

      .kano-touch-button.gas {
        background: rgba(20,125,83,.82);
      }

      .kano-touch-button.brake {
        background: rgba(160,45,45,.82);
      }

      .kano-touch-button.utility {
        border-radius: 12px;
        font-size: 12px;
      }

      @media (hover: hover) and (pointer: fine) {
        .kano-touch-controls { display: none !important; }
      }
    `,document.head.appendChild(t)}createButton(t,e,i,n={},o=""){const s=document.createElement("button");s.type="button",s.className=`kano-touch-button ${o}`.trim(),s.textContent=e,s.setAttribute("aria-label",i),s.dataset.control=i,Object.assign(s.style,{position:"absolute",width:`${this.options.buttonSize}px`,height:`${this.options.buttonSize}px`,opacity:String(this.options.opacity),pointerEvents:"auto",...n}),this.container.appendChild(s);const r={id:t,action:i,button:s,pointers:new Set};return this.buttons.set(t,r),this.isHoldAction(i)?this.bindHoldButton(r):this.bindTapButton(r),s}createSteeringControls(){this.options.enableSteering&&(this.createButton("steer-left","◀","left",{left:"18px",bottom:"100px"}),this.createButton("steer-right","▶","right",{left:"94px",bottom:"100px"}))}createPedalControls(){this.options.enablePedals&&(this.createButton("brake","BRAKE","brake",{right:"96px",bottom:"24px",width:"74px",height:"60px"},"pedal brake"),this.createButton("accelerate","GAS","accelerate",{right:"18px",bottom:"92px",width:"74px",height:"74px"},"pedal gas"))}createUtilityControls(){this.options.enableHorn&&this.createButton("horn","HORN","horn",{right:"18px",bottom:"174px",width:"58px",height:"46px"},"utility"),this.options.enablePause&&this.createButton("pause","Ⅱ","pause",{right:"18px",top:"90px",width:"48px",height:"48px"},"utility")}isHoldAction(t){return["left","right","accelerate","brake","horn"].includes(t)}bindHoldButton(t){const{button:e,action:i}=t;e.addEventListener("pointerdown",o=>{if(!(!this.enabled||this.disposed)){o.preventDefault();try{e.setPointerCapture(o.pointerId)}catch{}t.pointers.add(o.pointerId),this.activePointers.set(o.pointerId,t),e.classList.add("active"),this.setInput(i,!0)}});const n=o=>{t.pointers.has(o.pointerId)&&(t.pointers.delete(o.pointerId),this.activePointers.delete(o.pointerId),t.pointers.size===0&&(e.classList.remove("active"),this.setInput(i,!1)))};e.addEventListener("pointerup",n),e.addEventListener("pointercancel",n),e.addEventListener("lostpointercapture",n)}bindTapButton(t){const{button:e,action:i}=t;e.addEventListener("pointerdown",n=>{!this.enabled||this.disposed||(n.preventDefault(),e.classList.add("active"))}),e.addEventListener("pointerup",n=>{n.preventDefault(),e.classList.remove("active"),!(!this.enabled||this.disposed)&&this.triggerAction(i)}),e.addEventListener("pointercancel",()=>{e.classList.remove("active")}),e.addEventListener("click",n=>{n.detail===0&&this.enabled&&!this.disposed&&this.triggerAction(i)})}setInput(t,e){if(this.inputManager){if(typeof this.inputManager.setButton=="function"){this.inputManager.setButton(t,e);return}if(typeof this.inputManager.setInput=="function"){this.inputManager.setInput(t,e);return}if(typeof this.inputManager.setAction=="function"){this.inputManager.setAction(t,e);return}typeof this.inputManager.handleInput=="function"&&this.inputManager.handleInput(t,e)}}triggerAction(t){if(this.inputManager){if(typeof this.inputManager.triggerAction=="function"){this.inputManager.triggerAction(t);return}if(typeof this.inputManager.emit=="function"){this.inputManager.emit("action",{action:t});return}typeof this.inputManager.handleAction=="function"&&this.inputManager.handleAction(t)}}releaseAll(){for(const t of this.buttons.values())t.pointers.clear(),t.button.classList.remove("active"),this.isHoldAction(t.action)&&this.setInput(t.action,!1);this.activePointers.clear()}handleResize(){if(!this.container||this.disposed)return;const t=window.matchMedia("(pointer: coarse)").matches||navigator.maxTouchPoints>0;this.container.style.display=this.visible&&t?"block":"none"}setEnabled(t){this.enabled=!!t,this.enabled||this.releaseAll();for(const e of this.buttons.values())e.button.style.pointerEvents=this.enabled?"auto":"none",e.button.style.opacity=this.enabled?String(this.options.opacity):"0.25"}setVisible(t){this.visible=!!t,this.visible||this.releaseAll(),this.handleResize()}setOpacity(t){this.options.opacity=Math.max(.2,Math.min(1,Number(t)||.72));for(const e of this.buttons.values())e.button.style.opacity=String(this.options.opacity)}getButton(t){return this.buttons.get(t)?.button??null}dispose(){this.disposed||(this.releaseAll(),window.removeEventListener("resize",this.boundResize),this.container?.remove(),this.buttons.clear(),this.activePointers.clear(),this.container=null,this.root=null,this.inputManager=null,this.disposed=!0)}}export{u as default};
