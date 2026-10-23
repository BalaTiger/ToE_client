import { buildPublicUrl } from '../../utils/url';
import { getBattleBackgroundImage, getBattleTheme } from '../../constants/theme';

export function getBattleBackgroundStyle(expansionKey,isMobile){
  const url=buildPublicUrl(getBattleBackgroundImage(expansionKey));
  const theme=getBattleTheme(expansionKey);
  return {
    '--toe-bg':theme.bg,
    '--toe-text':theme.text,
    '--toe-strong':theme.strong,
    '--toe-muted':theme.muted,
    '--toe-panel':theme.panel,
    '--toe-panel-active':theme.panelActive,
    '--toe-line':theme.line,
    '--toe-line-dim':theme.lineDim,
    '--toe-glow':theme.glow,
    '--toe-accent':theme.accent,
    '--toe-battle-bg-image':`linear-gradient(180deg,${theme.tintTop},${theme.tintBottom}), url('${url}')`,
    '--toe-battle-bg-size':'cover, cover',
    '--toe-battle-bg-position':'center center, center center',
    '--toe-battle-bg-repeat':'no-repeat, no-repeat',
    '--toe-battle-bg-attachment':isMobile?'scroll, scroll':'fixed, fixed',
    backgroundColor:theme.bg,
    backgroundSize:'cover, cover',
    backgroundRepeat:'no-repeat, no-repeat',
    backgroundPosition:'center center, center center',
  };
}
