import { RINFO, ROLE_TREASURE, ROLE_HUNTER, ROLE_CULTIST } from '../../game';

export function RoleSelectionDialog({ onSelect, onCancel }) {
  return (
<div style={{position:'fixed',inset:0,zIndex:9998,background:'#080503',display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
          <div className="toe-dialog toe-role-selection" style={{textAlign:'center'}}>
            <h2 className="toe-title" style={{fontFamily:"var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",fontSize:20,color:'#e8c87a',margin:'0 0 8px',letterSpacing:2}}>选择本局身份</h2>
            <p className="toe-subtitle" style={{fontFamily:"var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",fontSize:13,color:'#a07838',margin:'0 0 24px',fontStyle:'normal'}}>命运尚未落笔，由你决定扮演何人</p>
            <div className="toe-role-options">
              {[
                {key:ROLE_TREASURE,...RINFO[ROLE_TREASURE]},
                {key:ROLE_HUNTER,...RINFO[ROLE_HUNTER]},
                {key:ROLE_CULTIST,...RINFO[ROLE_CULTIST]},
                {key:'random',icon:'?',col:'#a07838',dim:'#5a4020',goal:'听凭命运安排',skillName:'随机身份'},
              ].map(role=>(
                <button
                  className="toe-option toe-battle-role-choice"
                  key={role.key}
                  type="button"
                  onClick={()=>onSelect(role.key)}
                  style={{
                    '--toe-role-accent':role.col,
                    padding:'18px 12px',cursor:'pointer',
                    fontFamily:"var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",display:'flex',flexDirection:'column',alignItems:'center',gap:6,
                    transition:'all 0.15s ease',
                  }}
                >
                  <span style={{fontSize:30,color:role.col,filter:`drop-shadow(0 0 8px ${role.col}66)`}}>{role.icon}</span>
                  <span style={{fontSize:14,letterSpacing:1,fontWeight:700}}>{role.key==='random'?'随机身份':role.key}</span>
                  <small style={{fontSize:12,lineHeight:1.6,letterSpacing:0.5}}>{role.goal}</small>
                </button>
              ))}
            </div>
            {onCancel && <button className="toe-button" onClick={onCancel}>返回</button>}
          </div>
        </div>
  );
}
