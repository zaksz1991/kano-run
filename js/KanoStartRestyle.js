/** Start card polish: dark premium theme, gold primary action, tidy uppercase fields and a clean button grid. CSS only. */
if (!document.getElementById('kano-start-restyle')) {
  const css = document.createElement('style');
  css.id = 'kano-start-restyle';
  css.textContent = `
#start-screen .start-card{background:linear-gradient(180deg,#0e131a 0%,#0a0d12 100%)!important;border:1px solid #232c38!important;border-radius:20px!important;box-shadow:0 18px 50px #000a!important;color:#f4efe3}
#start-screen .brand-mark{background:transparent!important;border:2px solid #f2c200!important;color:#f2c200!important;border-radius:18px!important;font-weight:900}
#start-screen .eyebrow{color:#f2c200!important;letter-spacing:.22em!important;font-weight:800!important;font-size:10.5px!important}
#start-screen h1{letter-spacing:.06em!important;font-weight:900!important}
#start-screen h1 em{color:#f2c200!important;font-style:italic}
#start-screen .subtitle{opacity:.75;letter-spacing:.04em}
#start-screen .kano-keke-hero{border-radius:16px!important;overflow:hidden;border:1px solid #232c38;box-shadow:0 10px 28px #0009}
#start-screen .start-fields label{color:#9aa6b4!important;font-weight:800!important;letter-spacing:.18em!important;font-size:10px!important;text-transform:uppercase}
#start-screen .start-fields select{background:#141b24!important;color:#f4efe3!important;border:1px solid #2a3544!important;border-radius:10px!important;font-weight:700}
#start-screen .start-actions .primary,#start-screen #start-btn{background:linear-gradient(180deg,#ffd43b,#f2b700)!important;color:#111!important;border:0!important;border-radius:14px!important;min-height:54px;font-weight:900!important;letter-spacing:.16em!important;box-shadow:0 8px 22px #f2c20033!important}
#start-screen .secondary{background:#141b24!important;color:#f4efe3!important;border:1px solid #2a3544!important;border-radius:12px!important;font-weight:800!important;letter-spacing:.1em!important;min-height:44px}
#start-screen #daily-login-btn{border-color:#2fe08d!important;color:#2fe08d!important}
#start-screen .start-meta{color:#9aa6b4!important}
#start-screen .start-meta b{color:#f2c200!important}
#start-screen .kano-economy-guidance,#start-screen .credit,#start-screen .promo a{color:#7d8a99!important}
`;
  document.head.append(css);
}
