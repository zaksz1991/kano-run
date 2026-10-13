class d{constructor(e={}){this.options={rootId:"game-ui",updateInterval:.1,animationDuration:180,...e},this.root=null,this.elements={},this.state={},this.elapsed=0,this.disposed=!1,this.visible=!0,this.previousValues=new Map,this.createHUD()}createHUD(){typeof document>"u"||(this.root=document.getElementById(this.options.rootId)||this.createRoot(),this.root.classList.add("kano-game-ui"),Object.assign(this.root.style,{position:"absolute",inset:"0",pointerEvents:"none",zIndex:"10",color:"#ffffff",fontFamily:"Arial, Helvetica, sans-serif",userSelect:"none"}),this.injectStyles(),this.createTopBar(),this.createDrivingPanel(),this.createMissionPanel(),this.createMessageArea())}createRoot(){const e=document.createElement("div");return e.id=this.options.rootId,Object.assign(e.style,{position:"absolute",inset:"0",pointerEvents:"none",zIndex:"10"}),document.body.appendChild(e),e}injectStyles(){if(document.getElementById("kano-hud-styles"))return;const e=document.createElement("style");e.id="kano-hud-styles",e.textContent=`
      .kano-hud-panel {
        background: rgba(7, 17, 31, .88);
        border: 1px solid rgba(0, 180, 216, .55);
        border-radius: 12px;
        padding: 10px 14px;
        box-shadow: 0 4px 18px rgba(0,0,0,.22);
        backdrop-filter: blur(6px);
      }

      .kano-hud-label {
        font-size: 10px;
        letter-spacing: 1.2px;
        text-transform: uppercase;
        color: #aebdca;
      }

      .kano-hud-value {
        font-size: 20px;
        font-weight: 800;
        line-height: 1.3;
        color: #fff;
      }

      .kano-hud-cyan { color: #00d4ff; }
      .kano-hud-gold { color: #fbbf24; }
      .kano-hud-green { color: #5ce1a0; }
      .kano-hud-red { color: #ff6961; }

      .kano-hud-meter {
        height: 6px;
        margin-top: 5px;
        overflow: hidden;
        border-radius: 5px;
        background: rgba(255,255,255,.15);
      }

      .kano-hud-meter-fill {
        width: 100%;
        height: 100%;
        background: #00b4d8;
        transition: width .15s linear;
      }

      .kano-hud-message {
        padding: 10px 16px;
        border-radius: 8px;
        background: rgba(7,17,31,.92);
        border: 1px solid #00b4d8;
        font-size: 15px;
        font-weight: 700;
        text-align: center;
        opacity: 0;
        transform: translateY(-6px);
        transition: opacity .18s, transform .18s;
      }

      .kano-hud-message.visible {
        opacity: 1;
        transform: translateY(0);
      }

      @media (max-width: 600px) {
        .kano-hud-panel {
          padding: 7px 9px;
          border-radius: 9px;
        }

        .kano-hud-value { font-size: 16px; }
        .kano-hud-label { font-size: 9px; }
      }
    `,document.head.appendChild(e)}createElement(e,t,i,s={}){const n=document.createElement(e);return t&&(n.className=t),Object.assign(n.style,s),i.appendChild(n),n}createTopBar(){const e=this.createElement("div","",this.root,{position:"absolute",top:"14px",left:"14px",right:"210px",display:"flex",flexWrap:"wrap",gap:"8px",alignItems:"flex-start"});this.elements.brand=this.createElement("div","kano-hud-panel",e,{minWidth:"145px"}),this.elements.brand.innerHTML=`
      <div style="font-size:17px;font-weight:900;letter-spacing:.5px">
        KANO <span style="color:#00d4ff">RUN</span>
      </div>
      <div class="kano-hud-label">ADAIDAITA SAHU</div>
    `,this.elements.speedPanel=this.createMetric(e,"SPEED","0","km/h","speed"),this.elements.moneyPanel=this.createMetric(e,"WALLET","₦0","","money"),this.elements.levelPanel=this.createMetric(e,"DRIVER LEVEL","1","","level"),this.elements.scorePanel=this.createMetric(e,"TRIP SCORE","0","","score")}createMetric(e,t,i,s,n){const o=this.createElement("div","kano-hud-panel",e,{minWidth:"76px"}),r=this.createElement("div","kano-hud-label",o);r.textContent=t;const a=this.createElement("div","kano-hud-value",o);if(a.textContent=i,s){const l=this.createElement("span","",a,{marginLeft:"4px",fontSize:"10px",fontWeight:"600",color:"#aebdca"});l.textContent=s}return this.elements[`${n}Value`]=a,o}createDrivingPanel(){const e=this.createElement("div","kano-hud-panel",this.root,{position:"absolute",left:"14px",bottom:"18px",width:"190px",boxSizing:"border-box"});this.elements.drivingPanel=e,this.elements.fuelMeter=this.createMeter(e,"FUEL","fuel"),this.elements.conditionMeter=this.createMeter(e,"VEHICLE CONDITION","condition"),this.elements.passengers=this.createElement("div","",e,{marginTop:"10px",fontSize:"13px",fontWeight:"700"}),this.elements.passengers.textContent="Passengers: 0"}createMeter(e,t,i){const s=this.createElement("div","",e,{marginTop:"5px"}),n=this.createElement("div","",s,{display:"flex",justifyContent:"space-between",fontSize:"10px",color:"#aebdca"}),o=this.createElement("","",n);o.textContent=t;const r=this.createElement("","",n);r.textContent="100%";const a=this.createElement("div","kano-hud-meter",s),l=this.createElement("div","kano-hud-meter-fill",a);return this.elements[`${i}Text`]=r,this.elements[`${i}Fill`]=l,s}createMissionPanel(){const e=this.createElement("div","kano-hud-panel",this.root,{position:"absolute",left:"50%",bottom:"20px",transform:"translateX(-50%)",minWidth:"190px",maxWidth:"min(320px, 55vw)",textAlign:"center"});this.elements.missionPanel=e,this.elements.missionTitle=this.createElement("div","kano-hud-label",e),this.elements.missionTitle.textContent="CURRENT MISSION",this.elements.missionText=this.createElement("div","",e,{marginTop:"5px",fontSize:"14px",fontWeight:"700"}),this.elements.missionText.textContent="Explore Kano",this.elements.missionProgress=this.createElement("div","kano-hud-meter",e),this.elements.missionProgressFill=this.createElement("div","kano-hud-meter-fill",this.elements.missionProgress),this.elements.missionProgressFill.style.width="0%"}createMessageArea(){this.elements.message=this.createElement("div","kano-hud-message",this.root,{position:"absolute",top:"100px",left:"50%",transform:"translateX(-50%)",maxWidth:"80vw"}),this.elements.messageTimer=0}update(e=0,t={}){this.disposed||!this.visible||(this.elapsed+=Math.max(0,e),!(this.elapsed<this.options.updateInterval)&&(this.elapsed=0,this.state=t,this.updateSpeed(t),this.updateMoney(t),this.updateLevel(t),this.updateScore(t),this.updateFuel(t),this.updateCondition(t),this.updatePassengers(t),this.updateMission(t),this.updateMessageTimer(e)))}read(e,t,i=0){for(const s of t){let n=e;for(const o of s.split("."))n=n?.[o];if(n!=null)return n}return i}updateSpeed(e){const t=Math.max(0,Number(this.read(e,["speedKmh","speed","player.speedKmh"],0))||0);this.setText("speedValue",Math.round(t))}updateMoney(e){const t=Number(this.read(e,["money","wallet","profile.money","player.money"],0))||0;this.setText("moneyValue",`₦${Math.floor(t).toLocaleString("en-NG")}`)}updateLevel(e){const t=Number(this.read(e,["level","playerLevel","profile.level"],1))||1;this.setText("levelValue",Math.max(1,t))}updateScore(e){const t=Number(this.read(e,["score","tripScore","run.score"],0))||0;this.setText("scoreValue",Math.floor(t))}updateFuel(e){const t=this.read(e,["fuel","player.fuel","vehicle.fuel","vehicle.fuelPercent"],100);this.setMeter("fuel",t)}updateCondition(e){const t=this.read(e,["condition","health","player.condition","vehicle.condition","vehicle.health"],100);this.setMeter("condition",t)}updatePassengers(e){const t=this.read(e,["passengerCount","passengers.length","passengerSystem.passengers.length"],0);this.setText("passengers",`Passengers: ${Number(t)||0}`)}updateMission(e){const t=this.read(e,["mission","activeMission","missionSystem.activeMission"],null);if(!t)return;const i=t.title||t.name||t.description||"Complete your mission",s=Number(t.progress)||0,n=Number(t.target)||0,o=n>0?Math.min(100,s/n*100):t.completed?100:0;this.setText("missionText",i),this.elements.missionProgressFill&&(this.elements.missionProgressFill.style.width=`${o}%`)}setMeter(e,t){const i=Number(t),s=Math.max(0,Math.min(100,Number.isFinite(i)?i:100));this.elements[`${e}Text`]&&(this.elements[`${e}Text`].textContent=`${Math.round(s)}%`),this.elements[`${e}Fill`]&&(this.elements[`${e}Fill`].style.width=`${s}%`,this.elements[`${e}Fill`].style.background=s<25?"#ff6961":s<50?"#fbbf24":"#00b4d8")}setText(e,t){const i=this.elements[e];if(!i)return;const s=String(t);i.textContent!==s&&(i.textContent=s)}showMessage(e,t=2200){this.elements.message&&(this.elements.message.textContent=String(e),this.elements.message.classList.add("visible"),this.elements.messageTimer=t/1e3)}updateMessageTimer(e){this.elements.message&&this.elements.messageTimer>0&&(this.elements.messageTimer-=Math.max(0,e),this.elements.messageTimer<=0&&this.elements.message.classList.remove("visible"))}setVisible(e){this.visible=!!e,this.root&&(this.root.style.display=this.visible?"block":"none")}setMission(e,t=0){if(this.setText("missionText",e),this.elements.missionProgressFill){const i=Math.max(0,Math.min(100,t));this.elements.missionProgressFill.style.width=`${i}%`}}getElements(){return{...this.elements}}dispose(){this.disposed||(this.root?.remove(),this.root=null,this.elements={},this.state={},this.previousValues.clear(),this.disposed=!0)}}export{d as default};
