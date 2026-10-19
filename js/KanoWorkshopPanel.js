import { KanoWorkshopRecoveryDirector } from './KanoWorkshopRecoveryDirector.js';

const money = value => `₦${Math.max(0, Number(value) || 0).toLocaleString('en-NG')}`;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Mobile-friendly workshop UI. Wallet operations are delegated to the host callback. */
export class KanoWorkshopPanel {
  constructor({ game, container = document.body, wallet = null, onWalletChange = () => {} } = {}) {
    this.game = game;
    this.container = container;
    this.wallet = wallet;
    this.onWalletChange = onWalletChange;
    this.director = new KanoWorkshopRecoveryDirector();
    this.vehicleId = 'player-keke';
    this.quotes = new Map();
    this.jobs = new Map();
    this.opened = false;
    this.mount();
  }
  mount() {
    if (document.getElementById('kano-workshop-launch')) return;
    const style = document.createElement('style');
    style.id = 'kano-workshop-style';
    style.textContent = `
      #kano-workshop-launch{position:fixed;z-index:1200;right:14px;bottom:calc(18px + env(safe-area-inset-bottom));border:0;border-radius:999px;background:#fbbf24;color:#0b1e3a;font:800 14px system-ui;padding:13px 17px;box-shadow:0 5px 22px #0005;touch-action:manipulation}
      #kano-workshop-panel{position:fixed;z-index:1201;inset:auto 0 0;max-height:88dvh;overflow:auto;background:#0b1e3a;color:#f8fafc;border:1px solid #35506d;border-radius:22px 22px 0 0;padding:18px 16px calc(22px + env(safe-area-inset-bottom));font:14px/1.45 system-ui;box-shadow:0 -10px 40px #0007}
      #kano-workshop-panel[hidden]{display:none} .kw-head{display:flex;justify-content:space-between;align-items:center;gap:12px}.kw-head h2{font-size:20px;margin:0}.kw-close,.kw-action{border:0;border-radius:10px;padding:11px 13px;font-weight:750;touch-action:manipulation}.kw-close{background:#243b56;color:white}.kw-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:14px 0}.kw-card{background:#142d4b;border:1px solid #35506d;border-radius:14px;padding:12px;min-width:0}.kw-card h3{font-size:14px;margin:0 0 5px}.kw-muted{color:#b8c7d9;font-size:12px}.kw-action{background:#00b4d8;color:#06253a;width:100%;margin-top:10px}.kw-action:disabled{opacity:.45}.kw-select{width:100%;background:#102743;color:white;border:1px solid #42617f;border-radius:10px;padding:11px;margin-top:12px}.kw-progress{height:7px;background:#314861;border-radius:8px;overflow:hidden;margin-top:8px}.kw-progress span{display:block;height:100%;background:#00b4d8}.kw-section{margin-top:18px}.kw-section h3{margin-bottom:8px}@media(min-width:700px){#kano-workshop-panel{left:auto;right:20px;bottom:20px;width:min(520px,calc(100vw - 40px));border-radius:22px;max-height:85dvh}.kw-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    `;
    document.head.append(style);
    const launch = document.createElement('button'); launch.id = 'kano-workshop-launch'; launch.type = 'button'; launch.textContent = '🔧 Workshop'; launch.setAttribute('aria-controls','kano-workshop-panel');
    const panel = document.createElement('section'); panel.id = 'kano-workshop-panel'; panel.hidden = true; panel.setAttribute('aria-label','Kano Life workshop'); panel.innerHTML = '<div class="kw-head"><div><h2>KEKE WORKSHOP</h2><div class="kw-muted">Repair & roadside recovery</div></div><button class="kw-close" type="button" data-close>Close</button></div><div id="kw-content"></div>';
    this.container.append(launch, panel); this.panel = panel; this.content = panel.querySelector('#kw-content');
    launch.addEventListener('click', () => this.show()); panel.querySelector('[data-close]').addEventListener('click', () => this.hide());
    panel.addEventListener('click', e => { const b=e.target.closest('[data-action]'); if(b) this.act(b.dataset.action,b.dataset.id); });
    this.render();
  }
  show() { this.opened = true; this.panel.hidden = false; this.render(); }
  hide() { this.opened = false; this.panel.hidden = true; }
  vehicleSnapshot() {
    const s = this.game?.s || {};
    return { condition: Number(s.condition ?? 100), engine: Number(s.engine ?? 100), tyres: Number(s.tyres ?? 100), fuel: Number(s.fuel ?? 100) };
  }
  render() {
    if (!this.content) return;
    const v = this.vehicleSnapshot();
    const parts = [ ['body','Bodywork',v.condition], ['engine','Engine',v.engine], ['tyres','Tyres',v.tyres], ['suspension','Suspension',v.condition], ['brakes','Brakes',v.condition], ['cooling','Cooling system',v.engine] ];
    const workshops = this.director.listWorkshops();
    this.content.innerHTML = `<div class="kw-grid">${parts.slice(0,3).map(([key,label,h])=>`<div class="kw-card"><h3>${label}</h3><strong>${Math.round(h)}%</strong><div class="kw-progress"><span style="width:${Math.max(0,Math.min(100,h))}%"></span></div><div class="kw-muted">${h<25?'Critical condition':h<60?'Service recommended':'Operational'}</div></div>`).join('')}</div>
      <div class="kw-section"><h3>Choose a Kano workshop</h3><select class="kw-select" id="kw-workshop">${workshops.map(w=>`<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)} · ${escapeHtml(w.district)}</option>`).join('')}</select>
      <div class="kw-grid">${[['body','Bodywork',v.condition],['engine','Engine',v.engine],['tyre','Tyre / tube',v.tyres],['suspension','Suspension',v.condition],['brakes','Brakes',v.condition],['cooling','Cooling system',v.engine]].map(([key,label,h])=>`<div class="kw-card"><h3>${label}</h3><div class="kw-muted">Current condition: ${Math.round(h)}%</div><button class="kw-action" data-action="quote" data-id="${key}">Get repair quote</button></div>`).join('')}</div></div>
      <div class="kw-section"><h3>Repair quotes</h3><div id="kw-quotes">${this.renderQuotes()}</div></div>
      <div class="kw-section"><h3>Repair jobs</h3><div id="kw-jobs">${this.renderJobs()}</div></div>
      <div class="kw-section"><h3>Roadside recovery</h3><p class="kw-muted">Requesting recovery creates a quote only. No money is charged until your game's wallet confirms payment.</p><button class="kw-action" data-action="recovery">Request recovery quote</button><div id="kw-recovery"></div></div>`;
  }
  renderQuotes() { if (!this.quotes.size) return '<p class="kw-muted">No quotes yet. Choose a component above.</p>'; return [...this.quotes.values()].map(q=>`<div class="kw-card"><h3>${escapeHtml(q.componentLabel)} · ${money(q.totalCost)}</h3><div class="kw-muted">Parts ${money(q.partsCost)} · labour ${money(q.labourCost)} · about ${q.durationMinutes} min</div><button class="kw-action" data-action="book" data-id="${q.quoteId}">Book repair (payment confirmation required)</button></div>`).join(''); }
  renderJobs() { const jobs=this.director.listJobs({vehicleId:this.vehicleId}); if(!jobs.length) return '<p class="kw-muted">No repair jobs booked.</p>'; return jobs.map(j=>`<div class="kw-card"><h3>${escapeHtml(j.componentLabel)} · ${escapeHtml(j.status.replaceAll('_',' '))}</h3><div class="kw-muted">${money(j.cost)} · ${Math.ceil(j.remainingMinutes)} minutes remaining</div>${j.status==='awaiting_payment'?'<div class="kw-muted">Payment has not been processed.</div>':''}${j.status==='in_progress'?`<button class="kw-action" data-action="advance" data-id="${j.id}">Advance service time 15 min</button>`:''}${j.status==='ready_for_pickup'?`<button class="kw-action" data-action="complete" data-id="${j.id}">Complete repair</button>`:''}</div>`).join(''); }
  async act(action, id) {
    try {
      if (action === 'quote') {
        const workshopId=this.panel.querySelector('#kw-workshop')?.value;
        const v=this.vehicleSnapshot(); const map={body:['body',v.condition],engine:['engine',v.engine],tyre:['tyre',v.tyres],suspension:['suspension',v.condition],brakes:['brakes',v.condition],cooling:['cooling',v.engine]};
        const [component,health]=map[id]; const q=this.director.quoteRepair({workshopId,vehicleId:this.vehicleId,component,severity:Math.max(.05,Math.min(1,(100-health)/100))});
        if (!q.ok) throw new Error(`Could not quote repair: ${q.reason}`); this.quotes.set(q.quoteId,q); this.render();
      } else if (action === 'book') {
        const q=this.quotes.get(id); if(!q) throw new Error('Quote expired or unavailable. Request a new quote.');
        const booking=this.director.bookRepair(q); if(!booking.ok) throw new Error(booking.reason);
        const accepted=window.confirm(`Repair quote: ${money(q.totalCost)}.\n${q.componentLabel} at ${q.workshopName}.\n\nContinue to payment? No charge will be made by this panel.`);
        if(!accepted){this.render();return;}
        if(typeof this.wallet !== 'function') { alert('Wallet connection is not configured. No money was deducted and the repair has not started. Connect the game wallet callback before enabling payment.'); this.render(); return; }
        const payment=await this.wallet(q.totalCost,{reason:'workshop_repair',quote:q});
        if(!payment?.success || !payment.reference) { alert('Payment was not confirmed. Repair remains unpaid.'); this.render(); return; }
        const confirmed=this.director.confirmRepairPayment(booking.job.id,payment.reference); if(!confirmed.ok) throw new Error(confirmed.reason);
        this.onWalletChange(payment); this.render();
      } else if (action === 'advance') {
        this.director.advanceWorkshopTime(15); this.render();
      } else if (action === 'complete') {
        const result=this.director.completeRepair(id); if(!result.ok) throw new Error(result.reason);
        this.applyRepair(result); this.render();
      } else if (action === 'recovery') {
        const call=this.director.requestRecovery({vehicleId:this.vehicleId,location:'Kano roadside',severity:'breakdown',distanceKm:3,timeOfDay:12});
        const target=this.panel.querySelector('#kw-recovery');
        target.innerHTML=call.ok?`<div class="kw-card"><h3>${escapeHtml(call.call.workshopName)} · ${money(call.call.fee)}</h3><div class="kw-muted">Estimated arrival ${call.call.etaMinutes} min · quote only, no charge</div><button class="kw-action" data-action="pay-recovery" data-id="${call.call.id}">Confirm and pay recovery</button></div>`:`<p class="kw-muted">Recovery unavailable: ${escapeHtml(call.reason)}</p>`;
      } else if (action === 'pay-recovery') {
        if(typeof this.wallet!=='function'){alert('Wallet connection is not configured. No money was deducted.');return;}
        const call=this.director.listRecoveryCalls({vehicleId:this.vehicleId}).find(c=>c.id===id); if(!call) throw new Error('Recovery quote not found.');
        if(!confirm(`Confirm roadside recovery for ${money(call.fee)}?`)) return;
        const payment=await this.wallet(call.fee,{reason:'roadside_recovery',call}); if(!payment?.success||!payment.reference){alert('Payment not confirmed. Recovery was not dispatched.');return;}
        const result=this.director.confirmRecoveryPayment(id,payment.reference); if(!result.ok) throw new Error(result.reason); this.onWalletChange(payment); this.panel.querySelector('#kw-recovery').innerHTML=`<div class="kw-card">Recovery dispatched · ETA ${result.call.etaMinutes} min</div>`;
      }
    } catch(error) { console.warn('[Kano Workshop]',error); alert(error?.message || 'Workshop action could not be completed.'); }
  }
  applyRepair(result) {
    const s=this.game?.s; if(!s) return;
    const gain=Math.max(0,Number(result.qualityGain)||0);
    if(result.component==='body') s.condition=Math.min(100,s.condition+gain);
    if(result.component==='engine'||result.component==='cooling') s.engine=Math.min(100,s.engine+gain);
    if(result.component==='tyre') s.tyres=Math.min(100,s.tyres+gain);
    if(result.component==='suspension'||result.component==='brakes') s.condition=Math.min(100,s.condition+Math.round(gain*.6));
    this.game.ui?.toast?.(`${result.job.componentLabel} repair completed.`);
  }
}
