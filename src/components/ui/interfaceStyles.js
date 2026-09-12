import { buildPublicUrl } from '../../utils/url';

// All screens share this material; live text and card geometry stay in React.
export const INTERFACE_STYLES = `
:root {
  --toe-ui-surface-image: url('${buildPublicUrl('/img/ui/interface/panel-surface.webp')}');
  --toe-ui-frame-image: url('${buildPublicUrl('/img/ui/interface/panel-frame.webp')}');
  --toe-ui-text: #d7ccb2;
  --toe-ui-muted: #a99b81;
  --toe-ui-accent: #c3a374;
  --toe-ui-line: #65563d;
  --toe-ui-font: var(--font-serif-sc, 'Noto Serif SC', 'SimSun', serif);
}
.toe-dialog, .toe-panel, .toe-option {
  color: var(--toe-ui-text);
  background-color: #090f10;
  background-image: var(--toe-ui-surface-image);
  background-size: 320px 320px;
  border: 1px solid var(--toe-ui-line);
  border-image: var(--toe-ui-frame-image) 48 / 20px stretch;
  border-radius: 3px;
  font-family: var(--toe-ui-font);
  box-shadow: 0 18px 60px #0009, inset 0 0 32px #0003;
}
.toe-dialog { max-width: calc(100vw - 28px); }
.toe-panel { border-image-width: 12px; box-shadow: inset 0 0 24px #0004; }
.toe-dialog-backdrop { background: rgba(2,6,7,.8); }
.toe-dialog-header { text-align: center; padding: 4px 24px 14px; }
.toe-title { color: #e4d1aa; font-family: var(--toe-ui-font); font-weight: 700; letter-spacing: .12em; line-height: 1.4; }
.toe-subtitle { color: var(--toe-ui-muted); font-family: var(--toe-ui-font); line-height: 1.75; }
.toe-dialog-header::after { content: ''; display: block; width: min(80%,240px); height: 14px; margin: 12px auto 0; background: url('${buildPublicUrl('/img/line/line_split-no-bg.webp')}') center / contain no-repeat; opacity: .7; }
.toe-button {
  color: #ded0b1; font-family: var(--toe-ui-font); font-weight: 600; line-height: 1.4;
  background: linear-gradient(#17202066,#07101188), var(--toe-ui-surface-image) center / 320px;
  border: 1px solid #85734f; border-radius: 3px; letter-spacing: .08em;
  box-shadow: inset 0 0 0 2px #0005, 0 2px 8px #0004;
  transition: border-color .16s ease, background-color .16s ease, box-shadow .16s ease;
  cursor: pointer;
}
.toe-button:hover:not(:disabled) { border-color: #d4b77c; box-shadow: inset 0 0 12px #bc9f5622, 0 2px 10px #0005; }
.toe-button-primary { color: #b8e0d7; background: linear-gradient(#18473e99,#092a2499), var(--toe-ui-surface-image) center / 320px; border-color: #76958a; }
.toe-button-danger { color: #e0aba0; background: linear-gradient(#48221d99,#24100eaa), var(--toe-ui-surface-image) center / 320px; border-color: #9b6351; }
.toe-button:disabled { opacity: .48; cursor: not-allowed; box-shadow: none; }
.toe-button[aria-pressed='true'], .toe-option[aria-pressed='true'] { outline: 2px solid var(--toe-ui-accent); outline-offset: 2px; }
.toe-button:focus-visible, .toe-option:focus-visible, .toe-dialog-close:focus-visible, .toe-field:focus-visible { outline: 2px solid #e2cc95; outline-offset: 3px; }
.toe-dialog-close { width: 44px; height: 44px; padding: 0; display: grid; place-items: center; color: #c6b899; background: transparent; border: 1px solid transparent; border-radius: 3px; font-size: 22px; cursor: pointer; }
.toe-dialog-close:hover { color: #f1e5c9; border-color: #766346; background: #ffffff08; }
.toe-field { color: #e5d8bb; background: #050b0c; border: 1px solid #726348; border-radius: 3px; font-family: var(--toe-ui-font); min-width: 0; }
.toe-field::placeholder { color: #928975; }
.toe-option { box-shadow: inset 0 0 20px #0005; cursor: pointer; }
.toe-option:hover { border-color: #c8a96e; }
.toe-actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
.toe-actions > .toe-button { min-height: 44px; padding: 10px 24px; }
.toe-online-dialog { width: 460px; padding: 24px 28px; max-height: calc(100dvh - 28px); overflow-y: auto; position: relative; }
.toe-online-dialog .toe-field { min-height: 44px; padding: 10px 12px; width: 100%; }
.toe-online-dialog .toe-panel { padding: 14px; margin-top: 14px; }
.toe-online-paths { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.toe-online-paths button { min-height: 66px; padding: 14px; }
.toe-settings { position: fixed; top: 0; left: 50%; transform: translateX(-50%); z-index: 1800; display: flex; flex-direction: column; align-items: center; }
.toe-settings-toggle { min-height: 28px; padding: 3px 16px; font-size: 12px; border-top: 0; }
.toe-settings-panel { width: min(340px,calc(100vw - 24px)); max-height: calc(100dvh - 40px); overflow-y: auto; padding: 20px; margin-top: 5px; }
.toe-setting-row { display: grid; grid-template-columns: 44px minmax(80px,1fr) 44px; align-items: center; gap: 12px; font-size: 13px; margin-top: 14px; }
.toe-setting-row input { width: 100%; accent-color: #b39a67; cursor: pointer; }
.toe-setting-row output { font: 12px 'Cinzel',serif; text-align: right; }
.toe-result { width: 100vw; min-height: 100dvh; padding: 48px 24px; display: grid; place-items: center; background: linear-gradient(#050909aa,#020404ee), url('${buildPublicUrl('/img/bg/bg_main.webp')}') center / cover fixed; color: var(--toe-ui-text); font-family: var(--toe-ui-font); }
.toe-result-content { width: min(940px,100%); padding: 36px; text-align: center; }
.toe-result-emblem { width: 68px; height: 68px; object-fit: contain; }
.toe-result-players { display: grid; grid-template-columns: repeat(auto-fit,minmax(130px,1fr)); gap: 12px; margin: 26px 0; }
.toe-result-player { padding: 20px 10px; border-color: var(--role-color,#827257); }
.toe-result-player img { width: 32px; height: 32px; object-fit: contain; margin: 10px auto; }
.toe-result-player p { margin: 6px 0; }
.toe-result-player[data-winner='true'] { box-shadow: inset 0 0 28px #c8a96e12; outline: 1px solid var(--role-color,#c8a96e); }
.toe-result-player[data-dead='true'] { opacity: .65; }
@media(max-width:600px) {
  .toe-online-dialog { padding: 22px 18px; }
  .toe-online-paths { grid-template-columns: 1fr; }
  .toe-result { padding: 36px 14px; }
  .toe-result-content { padding: 24px 16px; }
  .toe-result-players { grid-template-columns: repeat(2,minmax(0,1fr)); }
}
@media(prefers-reduced-motion:reduce) {
  .toe-button { transition: none; }
  .toe-dialog { animation: none !important; }
}
`;
