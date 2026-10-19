/** Conservative runtime quality scaling for Three.js. Pass renderer/composer explicitly. */
export class AdaptivePerformanceScaler {
 constructor({ renderer, composer=null, shadows=true, targetFps=48, sampleMs=1800, onChange=()=>{} }={}) { this.renderer=renderer; this.composer=composer; this.shadows=shadows; this.targetFps=targetFps; this.sampleMs=sampleMs; this.onChange=onChange; this.frames=0; this.last=performance.now(); this.level=this.detectInitialLevel(); this.apply(this.level); }
 detectInitialLevel() { const mem=navigator.deviceMemory||4, cores=navigator.hardwareConcurrency||4, mobile=/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent); return mem<=2||cores<=4&&mobile?0:mem<=4||mobile?1:2; }
 update(now=performance.now()) { this.frames++; const elapsed=now-this.last; if (elapsed<this.sampleMs) return; const fps=this.frames*1000/elapsed; this.frames=0; this.last=now; if (fps<this.targetFps-10 && this.level>0) this.apply(this.level-1); else if (fps>this.targetFps+15 && this.level<2) this.apply(this.level+1); }
 apply(level) { this.level=Math.max(0,Math.min(2,level)); const dpr=[0.75,1,Math.min(1.5,devicePixelRatio||1)][this.level]; this.renderer?.setPixelRatio(dpr); if (this.renderer) { this.renderer.shadowMap.enabled=this.shadows&&this.level>=1; this.renderer.shadowMap.type=this.level===2?2:1; } if (this.composer?.setPixelRatio) this.composer.setPixelRatio(dpr); if (this.composer?.setSize && this.renderer?.domElement) this.composer.setSize(this.renderer.domElement.clientWidth,this.renderer.domElement.clientHeight); this.onChange({level:this.level,pixelRatio:dpr,shadows:!!this.renderer?.shadowMap.enabled,postProcessing:this.level===2}); }
 getQuality() { return ['low','medium','high'][this.level]; }
}
export default AdaptivePerformanceScaler;
