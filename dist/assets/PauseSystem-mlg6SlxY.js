class u{constructor(e={}){this.options={rootId:"game-ui",onResume:null,onRestart:null,onQuit:null,...e},this.paused=!1,this.disposed=!1,this.overlay=null,this.menu=null,this.previousFocus=null,this.callbacks={onResume:this.options.onResume,onRestart:this.options.onRestart,onQuit:this.options.onQuit},this.boundKeyDown=this.handleKeyDown.bind(this),this.createOverlay(),window.addEventListener("keydown",this.boundKeyDown)}createOverlay(){if(typeof document>"u")return;this.overlay=document.createElement("div"),this.overlay.className="kano-pause-overlay",this.overlay.setAttribute("role","dialog"),this.overlay.setAttribute("aria-modal","true"),this.overlay.setAttribute("aria-label","Game paused"),this.overlay.hidden=!0,Object.assign(this.overlay.style,{position:"fixed",inset:"0",zIndex:"1000",display:"none",alignItems:"center",justifyContent:"center",padding:"20px",boxSizing:"border-box",background:"rgba(3, 10, 20, .88)",backdropFilter:"blur(8px)",color:"#fff",fontFamily:"Arial, Helvetica, sans-serif",pointerEvents:"auto"}),this.injectStyles(),this.menu=document.createElement("div"),this.menu.className="kano-pause-menu",Object.assign(this.menu.style,{width:"100%",maxWidth:"380px",padding:"28px",boxSizing:"border-box",textAlign:"center",background:"#0b1e3a",border:"1px solid #00b4d8",borderRadius:"18px",boxShadow:"0 20px 60px rgba(0,0,0,.45)"});const e=document.createElement("h1");e.textContent="GAME PAUSED",Object.assign(e.style,{margin:"0 0 6px",fontSize:"28px",fontWeight:"900",letterSpacing:"2px"});const t=document.createElement("p");t.textContent="KANO RUN · ADAIDAITA SAHU",Object.assign(t.style,{margin:"0 0 26px",fontSize:"11px",letterSpacing:"2px",color:"#00d4ff"}),this.menu.append(e,t),this.createMenuButton("RESUME DRIVING",()=>this.resume(),!0),this.createMenuButton("RESTART TRIP",()=>this.confirmRestart()),this.createMenuButton("QUIT TO MENU",()=>this.confirmQuit());const o=document.createElement("p");o.textContent="Press ESC or P to resume",Object.assign(o.style,{margin:"22px 0 0",fontSize:"12px",color:"#aebdca"}),this.menu.appendChild(o),this.overlay.appendChild(this.menu),(document.getElementById(this.options.rootId)||document.body).appendChild(this.overlay)}injectStyles(){if(document.getElementById("kano-pause-styles"))return;const e=document.createElement("style");e.id="kano-pause-styles",e.textContent=`
      .kano-pause-button {
        width: 100%;
        min-height: 48px;
        margin: 6px 0;
        padding: 12px 16px;
        border: 1px solid rgba(255,255,255,.25);
        border-radius: 10px;
        background: #152d4d;
        color: white;
        font-size: 13px;
        font-weight: 800;
        letter-spacing: .5px;
        cursor: pointer;
        transition: background .15s, transform .15s;
      }

      .kano-pause-button:hover {
        background: #17476b;
      }

      .kano-pause-button:active {
        transform: scale(.98);
      }

      .kano-pause-button.primary {
        background: #00b4d8;
        color: #071726;
        border-color: #00d4ff;
      }

      .kano-pause-button.primary:hover {
        background: #4cdef5;
      }

      .kano-pause-button:focus-visible {
        outline: 3px solid #fbbf24;
        outline-offset: 3px;
      }

      .kano-pause-confirmation {
        margin-top: 16px;
        padding-top: 14px;
        border-top: 1px solid rgba(255,255,255,.15);
      }

      .kano-pause-confirmation p {
        font-size: 13px;
        line-height: 1.5;
        color: #d4deea;
      }

      .kano-pause-confirmation button {
        margin: 4px;
        padding: 10px 14px;
        border: 0;
        border-radius: 7px;
        cursor: pointer;
        font-weight: 700;
      }
    `,document.head.appendChild(e)}createMenuButton(e,t,o=!1){const n=document.createElement("button");return n.type="button",n.className=`kano-pause-button${o?" primary":""}`,n.textContent=e,n.addEventListener("click",t),this.menu.appendChild(n),n}handleKeyDown(e){if(e.repeat||this.disposed)return;const t=e.target;t instanceof HTMLElement&&(t.isContentEditable||["INPUT","TEXTAREA","SELECT"].includes(t.tagName))||(e.code==="Escape"||e.code==="KeyP")&&(e.preventDefault(),this.paused?this.resume():this.pause())}pause(){return this.paused||this.disposed?!1:(this.paused=!0,this.previousFocus=document.activeElement,this.overlay&&(this.overlay.hidden=!1,this.overlay.style.display="flex",this.menu.querySelector(".primary")?.focus({preventScroll:!0})),!0)}resume(){return!this.paused||this.disposed?!1:(this.paused=!1,this.overlay&&(this.overlay.style.display="none",this.overlay.hidden=!0),this.clearConfirmation(),this.previousFocus instanceof HTMLElement&&this.previousFocus.focus({preventScroll:!0}),this.previousFocus=null,typeof this.callbacks.onResume=="function"&&this.callbacks.onResume(),!0)}confirmRestart(){this.showConfirmation("Restart this trip? Current trip progress may be lost.","RESTART",()=>{this.clearConfirmation(),typeof this.callbacks.onRestart=="function"&&this.callbacks.onRestart(),this.resume()})}confirmQuit(){this.showConfirmation("Leave the current trip and return to the main menu?","QUIT",()=>{this.clearConfirmation(),typeof this.callbacks.onQuit=="function"&&this.callbacks.onQuit()})}showConfirmation(e,t,o){this.clearConfirmation();const n=document.createElement("div");n.className="kano-pause-confirmation";const a=document.createElement("p");a.textContent=e;const s=document.createElement("button");s.type="button",s.textContent=t,s.style.background="#fbbf24",s.style.color="#111827";const i=document.createElement("button");i.type="button",i.textContent="CANCEL",i.style.background="#243d5b",i.style.color="#fff",s.addEventListener("click",o),i.addEventListener("click",()=>{this.clearConfirmation()}),n.append(a,s,i),this.menu.appendChild(n),s.focus({preventScroll:!0})}clearConfirmation(){this.menu?.querySelector(".kano-pause-confirmation")?.remove()}setCallbacks(e={}){for(const t of["onResume","onRestart","onQuit"])t in e&&(this.callbacks[t]=e[t])}isPaused(){return this.paused}dispose(){this.disposed||(window.removeEventListener("keydown",this.boundKeyDown),this.overlay?.remove(),this.overlay=null,this.menu=null,this.previousFocus=null,this.callbacks={},this.paused=!1,this.disposed=!0)}}export{u as default};
