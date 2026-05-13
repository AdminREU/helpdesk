'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

type Theme='light'|'dark'
type View='home'|'new'|'tickets'|'kb'|'detail'

interface CatPeticion { label: string }
interface CatSubcategoria { label: string; peticiones: string[] }
interface CatCategoria { label: string; subcategorias: CatSubcategoria[] }
interface Ticket{id:string;asunto:string;descripcion:string;estado:string;prioridad:string;area:string;categoria:string;subcategoria:string;servicio:string;almacen:string;tecnico_asignado:string;fecha_creacion:string;fecha_actualizacion:string;respuesta_tecnico:string;rating:number;updated_by_user:boolean;evidencias_json:any[];motivo_cierre:string}
interface KbItem{id:string;titulo:string;categoria:string;contenido:string;activo:boolean}
interface Agent{email:string;nombre:string;agent_status:string;agent_status_detail?:string;agent_status_updated_at?:string}

const STATE_LABELS:Record<string,string>={abierto:'Abierto',asignado:'En proceso',en_proceso:'En proceso',en_espera_recurso:'En proceso',en_espera_confirmacion:'En proceso',resuelto:'Resuelto',cerrado:'Cerrado'}
const STATE_COLORS:Record<string,string>={abierto:'#3b82f6',asignado:'#8b5cf6',en_proceso:'#8b5cf6',en_espera_recurso:'#f59e0b',en_espera_confirmacion:'#f97316',resuelto:'#10b981',cerrado:'#6b7280'}
const PRI_COLORS:Record<string,string>={CRITICA:'#ef4444',ALTA:'#f97316',MEDIA:'#3b82f6',BAJA:'#6b7280'}
const STATUS_STEPS=[{key:'abierto',label:'Recibido'},{key:'asignado',label:'En proceso'},{key:'resuelto',label:'Resuelto'},{key:'cerrado',label:'Cerrado'}]
function fmtDate(iso:string){if(!iso)return'—';try{return new Date(iso).toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'})}catch{return iso}}

export default function PortalPage(){
  const router=useRouter()
  const [theme,setTheme]=useState<Theme>('light')
  const [view,setView]=useState<View>('home')
  const [token,setToken]=useState('')
  const [userEmail,setUserEmail]=useState('')
  const [myTickets,setMyTickets]=useState<Ticket[]>([])
  const [recentTickets,setRecentTickets]=useState<Ticket[]>([])
  const [selectedTicket,setSelectedTicket]=useState<Ticket|null>(null)
  const [agents,setAgents]=useState<Agent[]>([])
  const [selectedAgent,setSelectedAgent]=useState<Agent|null>(null)
  const [agentMeta,setAgentMeta]=useState<Record<string,{color:string;label:string;level?:string}>>({disponible:{color:'#10b981',label:'Disponible'},ocupado:{color:'#f59e0b',label:'Ocupado'},ausente:{color:'#6b7280',label:'Ausente'}})
  const [catalogs,setCatalogs]=useState<Record<string,any>>({})
  const [kbItems,setKbItems]=useState<KbItem[]>([])
  const [kbEnabled,setKbEnabled]=useState(true)
  const [kbSelected,setKbSelected]=useState<KbItem|null>(null)
  const [filterQ,setFilterQ]=useState('')
  const [filterEstado,setFilterEstado]=useState('')
  const [loading,setLoading]=useState(false)
  const [msg,setMsg]=useState({text:'',kind:''})
  const [uploadingFile,setUploadingFile]=useState(false)
  const [pendingFiles,setPendingFiles]=useState<File[]>([])

  // Form cascada
  const [form,setForm]=useState({area:'',almacen:'',servicio:'',categoria:'',subcategoria:'',peticion:'',asunto:'',descripcion:'',ip:'',equipoNum:''})

  const d=theme==='dark'
  const bg=d?'#191919':'#f7f6f3'
  const surface=d?'#202020':'#ffffff'
  const border=d?'#2f2f2f':'#e5e4e0'
  const text=d?'#e5e4e0':'#191919'
  const muted=d?'#787774':'#9b9a97'

  // Catálogo cascada
  const catCascada: CatCategoria[] = catalogs.categorias_cascada ?? []
  const selectedCat = catCascada.find(c=>c.label===form.categoria)
  const selectedSub = selectedCat?.subcategorias.find(s=>s.label===form.subcategoria)
  const servicios: string[] = catalogs.servicios ?? []

  useEffect(()=>{
    const stored=localStorage.getItem('theme') as Theme|null
    setTheme(stored??(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'))
    const params=new URLSearchParams(window.location.search)
    const ssoToken=params.get('_sso')
    if(ssoToken){localStorage.setItem('auth_token',ssoToken);window.history.replaceState({},'','/portal')}
    const t=ssoToken||localStorage.getItem('auth_token')
    if(!t){router.push('/login');return}
    fetch('/api/auth/resume',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:t})})
      .then(r=>r.json()).then(res=>{
        if(!res.ok){localStorage.removeItem('auth_token');router.push('/login');return}
        setToken(res.token??t);setUserEmail(res.email)
        localStorage.setItem('auth_token',res.token??t)
      }).catch(()=>router.push('/login'))
  },[])

  useEffect(()=>{if(!token)return;loadHome();loadCatalogs();loadAgents();loadKb()},[token])

  // Pegar capturas
  useEffect(()=>{
    const handler=(e:ClipboardEvent)=>{
      if(view!=='new'&&view!=='detail')return
      const items=e.clipboardData?.items
      if(!items)return
      for(const item of Array.from(items)){
        if(item.type.startsWith('image/')){
          const file=item.getAsFile()
          if(file){
            const named=new File([file],`captura-${Date.now()}.png`,{type:file.type})
            if(view==='new')setPendingFiles(prev=>[...prev,named])
            else if(view==='detail'&&selectedTicket)uploadFileToTicket(named)
          }
        }
      }
    }
    document.addEventListener('paste',handler)
    return()=>document.removeEventListener('paste',handler)
  },[view,selectedTicket])

  const api=async(path:string,method='GET',body?:any)=>{
    const res=await fetch(path,{method,headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined})
    return res.json()
  }

  async function loadHome(){const res=await api('/api/tickets');if(res.ok){setRecentTickets((res.tickets??[]).slice(0,6));setMyTickets(res.tickets??[])}}
  async function loadMyTickets(){setLoading(true);const p=new URLSearchParams();if(filterQ)p.set('q',filterQ);if(filterEstado)p.set('estado',filterEstado);const res=await api(`/api/tickets?${p}`);if(res.ok)setMyTickets(res.tickets??[]);setLoading(false)}
  async function loadCatalogs(){
    const res=await api('/api/catalogs')
    if(res.ok){
      setCatalogs(res.catalogs??{})
      if(res.catalogs?.agent_statuses){
        const meta:Record<string,{color:string;label:string;level?:string}>={};
        const fallback:Record<string,string>={disponible:'#10b981',ocupado:'#f59e0b',ausente:'#6b7280'}
        for(const s of res.catalogs.agent_statuses) meta[s.key]={color:s.color??fallback[s.key]??'#6b7280',label:(s.label??s.key).replace(/^[\p{Emoji}\u200d\s]+/u,'').trim(),level:s.level}
        setAgentMeta(meta)
      }
    }
  }
  async function loadAgents(){const res=await api('/api/users/agent-status');if(res.ok)setAgents(res.agents??[])}
  async function loadKb(){
    const[kbRes,flagRes]=await Promise.all([api('/api/kb'),api('/api/settings')])
    if(flagRes.ok)setKbEnabled(flagRes.flags?.['FEATURE_ENABLE_KB']!=='false')
    if(kbRes.ok)setKbItems((kbRes.items??[]).filter((k:KbItem)=>k.activo))
  }
  async function uploadFilesToTicket(ticketId:string,files:File[]){
    for(const file of files){const fd=new FormData();fd.append('file',file);fd.append('ticketId',ticketId);await fetch('/api/files',{method:'POST',headers:{'Authorization':`Bearer ${token}`},body:fd}).catch(()=>{})}
  }
  async function createTicket(){
    if(!form.asunto||!form.descripcion){setMsg({text:'Asunto y descripción son requeridos',kind:'err'});return}
    setLoading(true);setMsg({text:'',kind:''})
    const payload={...form,categoria:form.categoria||'',subcategoria:form.subcategoria||'',servicio:form.servicio||''}
    const res=await api('/api/tickets','POST',payload)
    if(res.ok){
      if(pendingFiles.length>0)await uploadFilesToTicket(res.ticket.id,pendingFiles)
      setMsg({text:`✓ Ticket ${res.ticket.id} creado`,kind:'ok'})
      setForm({area:'',almacen:'',servicio:'',categoria:'',subcategoria:'',peticion:'',asunto:'',descripcion:'',ip:'',equipoNum:''})
      setPendingFiles([]);loadHome()
      setTimeout(()=>{setMsg({text:'',kind:''});setView('home')},2000)
    }else setMsg({text:res.error??'Error al crear el ticket',kind:'err'})
    setLoading(false)
  }
  async function openTicket(id:string){const res=await api(`/api/tickets/${id}`);if(res.ok){setSelectedTicket(res.ticket);setView('detail')}}
  async function uploadFileToTicket(file:File){
    if(!selectedTicket)return;setUploadingFile(true)
    const fd=new FormData();fd.append('file',file);fd.append('ticketId',selectedTicket.id)
    const res=await fetch('/api/files',{method:'POST',headers:{'Authorization':`Bearer ${token}`},body:fd}).then(r=>r.json())
    if(res.ok){setSelectedTicket(prev=>prev?({...prev,evidencias_json:[...(prev.evidencias_json??[]),res.file]}):prev)}
    setUploadingFile(false)
  }
  function toggleTheme(){const n=d?'light':'dark';setTheme(n as Theme);localStorage.setItem('theme',n)}

  const inp:React.CSSProperties={width:'100%',padding:'8px 10px',borderRadius:'6px',fontSize:'13px',border:`1px solid ${border}`,background:d?'#2f2f2f':'#f7f6f3',color:text,outline:'none',boxSizing:'border-box'}
  const btnP:React.CSSProperties={padding:'10px 20px',borderRadius:'8px',border:'none',fontSize:'13px',fontWeight:500,cursor:'pointer',background:d?'#fff':'#191919',color:d?'#191919':'#fff'}
  const btnS:React.CSSProperties={padding:'8px 16px',borderRadius:'8px',fontSize:'12px',fontWeight:500,cursor:'pointer',background:'transparent',color:muted,border:`1px solid ${border}`}
  function Badge({label,color}:{label:string;color:string}){return<span style={{fontSize:'11px',fontWeight:500,padding:'3px 8px',borderRadius:'20px',background:color+'22',color}}>{label}</span>}
  function MsgBox(){if(!msg.text)return null;const ok=msg.kind==='ok';return<div style={{padding:'10px 14px',borderRadius:'8px',fontSize:'13px',background:ok?(d?'#1a2d1a':'#f0fdf4'):(d?'#2d1a1a':'#fef2f2'),color:ok?'#10b981':'#ef4444',border:`1px solid ${ok?'#10b981':'#ef4444'}`,marginBottom:'16px'}}>{msg.text}</div>}

  function TicketCard({t}:{t:Ticket}){
    const color=STATE_COLORS[t.estado]??'#6b7280'
    return<div onClick={()=>openTicket(t.id)} style={{background:surface,border:`1px solid ${border}`,borderRadius:'10px',padding:'14px 16px',cursor:'pointer',borderLeft:`3px solid ${color}`,marginBottom:'10px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'6px'}}>
        <div style={{fontSize:'13px',fontWeight:500,flex:1,marginRight:'12px'}}>{t.asunto}</div>
        <Badge label={STATE_LABELS[t.estado]??t.estado} color={color}/>
      </div>
      <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
        <span style={{fontSize:'11px',color:muted}}>{t.id}</span>
        <Badge label={t.prioridad} color={PRI_COLORS[t.prioridad]??'#6b7280'}/>
        {t.area&&<span style={{fontSize:'11px',color:muted}}>{t.area}</span>}
        <span style={{fontSize:'11px',color:muted,marginLeft:'auto'}}>{fmtDate(t.fecha_creacion)}</span>
      </div>
      {t.respuesta_tecnico&&t.estado!=='cerrado'&&<div style={{marginTop:'6px',fontSize:'12px',color:'#10b981'}}>💬 Nueva respuesta del equipo</div>}
      {t.estado==='cerrado'&&t.motivo_cierre&&<div style={{marginTop:'6px',fontSize:'11px',color:muted}}>Cerrado: {t.motivo_cierre}</div>}
    </div>
  }

  function SelectField({label,value,options,onChange,disabled=false}:{label:string;value:string;options:string[];onChange:(v:string)=>void;disabled?:boolean}){
    return<div><div style={{fontSize:'11px',color:muted,marginBottom:'4px'}}>{label}</div>
      <select style={{...inp,opacity:disabled?0.5:1}} value={value} onChange={e=>onChange(e.target.value)} disabled={disabled}>
        <option value="">Selecciona…</option>
        {options.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  }

  return(
    <div style={{minHeight:'100vh',background:bg,fontFamily:'-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',color:text}}>
      <div style={{background:surface,borderBottom:`1px solid ${border}`,padding:'0 24px',display:'flex',alignItems:'center',height:'52px',position:'sticky',top:0,zIndex:10}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px',marginRight:'32px'}}>
          <div style={{width:'22px',height:'22px',borderRadius:'6px',background:d?'#fff':'#191919',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:700,color:d?'#191919':'#fff'}}>H</div>
          <span style={{fontSize:'13px',fontWeight:600}}>Mi Portal</span>
        </div>
        {(['home','new','tickets'] as View[]).concat(kbEnabled?['kb' as View]:[]).map(v=>{
          const labels:Record<string,string>={home:'Inicio',new:'Nuevo ticket',tickets:'Mis tickets',kb:'Ayuda'}
          return<div key={v} onClick={()=>{setView(v);if(v==='tickets')loadMyTickets()}} style={{padding:'0 14px',height:'52px',display:'flex',alignItems:'center',fontSize:'13px',cursor:'pointer',borderBottom:view===v?`2px solid ${d?'#fff':'#191919'}`:'2px solid transparent',fontWeight:view===v?500:400,color:view===v?text:muted}}>{labels[v]}</div>
        })}
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:'12px'}}>
          <span style={{fontSize:'12px',color:muted,maxWidth:'180px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{userEmail}</span>
          <button onClick={toggleTheme} style={{background:'none',border:'none',cursor:'pointer',fontSize:'14px',opacity:0.6}}>{d?'☀️':'🌙'}</button>
        </div>
      </div>

      <div style={{maxWidth:'860px',margin:'0 auto',padding:'28px 24px'}}>
        {/* HOME */}
        {view==='home'&&<div>
          {agents.length>0&&<div style={{background:surface,border:`1px solid ${border}`,borderRadius:'10px',padding:'12px 20px',marginBottom:'20px',display:'flex',gap:'16px',alignItems:'center',flexWrap:'wrap'}}>
            <span style={{fontSize:'12px',color:muted,fontWeight:500}}>Equipo de soporte:</span>
            {agents.map(a=>{const meta=agentMeta[a.agent_status]??{color:'#6b7280',label:a.agent_status};const hasDetail=!!a.agent_status_detail;return(
              <div key={a.email} onClick={()=>hasDetail&&setSelectedAgent(a)} title={hasDetail?'Ver detalle':''} style={{display:'flex',alignItems:'center',gap:'6px',cursor:hasDetail?'pointer':'default',padding:'4px 8px',borderRadius:'6px',transition:'background 0.15s'}} onMouseEnter={e=>hasDetail&&(e.currentTarget.style.background=d?'#2f2f2f':'#f0efec')} onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                <div style={{width:'8px',height:'8px',borderRadius:'50%',background:meta.color,boxShadow:`0 0 0 2px ${meta.color}33`}}/>
                <span style={{fontSize:'12px',fontWeight:500}}>{a.nombre||a.email.split('@')[0]}</span>
                <span style={{fontSize:'11px',color:muted}}>({meta.label})</span>
                {hasDetail&&<span style={{fontSize:'10px',color:meta.color,marginLeft:'2px'}}>›</span>}
              </div>
            )})}
          </div>}

          {selectedAgent&&<div onClick={()=>setSelectedAgent(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200,backdropFilter:'blur(4px)'}}>
            <div onClick={e=>e.stopPropagation()} style={{background:surface,borderRadius:'14px',padding:'24px',width:'380px',maxWidth:'90vw',border:`1px solid ${border}`,boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
              {(() => {
                const meta=agentMeta[selectedAgent.agent_status]??{color:'#6b7280',label:selectedAgent.agent_status,level:undefined}
                return<>
                  <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'14px'}}>
                    <div style={{width:'40px',height:'40px',borderRadius:'50%',background:meta.color+'22',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',fontWeight:600,color:meta.color}}>{(selectedAgent.nombre||selectedAgent.email)[0].toUpperCase()}</div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'14px',fontWeight:600,color:text}}>{selectedAgent.nombre||selectedAgent.email.split('@')[0]}</div>
                      <div style={{fontSize:'11px',color:muted}}>{selectedAgent.email}</div>
                    </div>
                    <button onClick={()=>setSelectedAgent(null)} style={{background:'none',border:'none',cursor:'pointer',fontSize:'20px',color:muted,lineHeight:1}}>×</button>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'10px 12px',borderRadius:'8px',background:meta.color+'15',marginBottom:'12px'}}>
                    <div style={{width:'10px',height:'10px',borderRadius:'50%',background:meta.color}}/>
                    <span style={{fontSize:'13px',fontWeight:500,color:meta.color}}>{meta.label}</span>
                    {meta.level&&<span style={{fontSize:'10px',padding:'2px 6px',borderRadius:'4px',background:meta.color+'30',color:meta.color,marginLeft:'auto'}}>{meta.level}</span>}
                  </div>
                  <div style={{padding:'14px',borderRadius:'8px',background:d?'#2f2f2f':'#f7f6f3',fontSize:'13px',lineHeight:1.5,whiteSpace:'pre-wrap',color:text}}>{selectedAgent.agent_status_detail}</div>
                  {selectedAgent.agent_status_updated_at&&<div style={{fontSize:'10px',color:muted,marginTop:'10px',textAlign:'right'}}>Actualizado {fmtDate(selectedAgent.agent_status_updated_at)}</div>}
                </>
              })()}
            </div>
          </div>}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
            <div style={{fontSize:'18px',fontWeight:600}}>Mis tickets recientes</div>
            <button style={btnP} onClick={()=>setView('new')}>+ Nuevo ticket</button>
          </div>
          {recentTickets.length===0
            ?<div style={{background:surface,border:`1px solid ${border}`,borderRadius:'10px',padding:'40px',textAlign:'center',color:muted,fontSize:'13px'}}>No tienes tickets aún. <button onClick={()=>setView('new')} style={{background:'none',border:'none',cursor:'pointer',color:text,fontWeight:500,textDecoration:'underline'}}>Crea uno</button></div>
            :<div>{recentTickets.map(t=><TicketCard key={t.id} t={t}/>)}</div>
          }
        </div>}

        {/* NEW TICKET */}
        {view==='new'&&<div>
          <div style={{fontSize:'18px',fontWeight:600,marginBottom:'20px'}}>Nuevo ticket</div>
          <MsgBox/>
          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:'10px',padding:'24px'}}>
            {/* Fila 1: Área y Almacén */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'14px'}}>
              <SelectField label="Área" value={form.area} options={catalogs.areas??[]} onChange={v=>setForm({...form,area:v})}/>
              <SelectField label="Almacén / Ubicación" value={form.almacen} options={catalogs.almacenes??[]} onChange={v=>setForm({...form,almacen:v})}/>
            </div>

            {/* Servicio — independiente */}
            <div style={{marginBottom:'14px'}}>
              <SelectField label="Tipo de servicio" value={form.servicio} options={servicios} onChange={v=>setForm({...form,servicio:v})}/>
            </div>

            {/* Cascada: Categoría → Subcategoría → Petición */}
            <div style={{background:d?'#2a2a2a':'#f9f8f6',border:`1px solid ${border}`,borderRadius:'8px',padding:'14px',marginBottom:'14px'}}>
              <div style={{fontSize:'11px',color:muted,marginBottom:'10px',fontWeight:500}}>CATEGORIZACIÓN (cascada)</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'12px'}}>
                <SelectField label="Categoría" value={form.categoria} options={catCascada.map(c=>c.label)} onChange={v=>setForm({...form,categoria:v,subcategoria:'',peticion:''})}/>
                <SelectField label="Subcategoría" value={form.subcategoria} options={selectedCat?.subcategorias.map(s=>s.label)??[]} onChange={v=>setForm({...form,subcategoria:v,peticion:''})} disabled={!form.categoria}/>
                <SelectField label="Petición específica" value={form.peticion} options={selectedSub?.peticiones??[]} onChange={v=>setForm({...form,peticion:v})} disabled={!form.subcategoria}/>
              </div>
              <div style={{fontSize:'11px',color:muted,marginTop:'8px'}}>Solo categoría es suficiente — subcategoría y petición son opcionales</div>
            </div>

            {/* IP y Equipo */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'14px',marginBottom:'14px'}}>
              <div><div style={{fontSize:'11px',color:muted,marginBottom:'4px'}}>IP del equipo</div><input style={inp} placeholder="192.168.0.1" value={form.ip} onChange={e=>setForm({...form,ip:e.target.value})}/></div>
              <div><div style={{fontSize:'11px',color:muted,marginBottom:'4px'}}>No. de equipo</div><input style={inp} placeholder="EQ-001" value={form.equipoNum} onChange={e=>setForm({...form,equipoNum:e.target.value})}/></div>
            </div>

            {/* Asunto y descripción */}
            <div style={{marginBottom:'14px'}}><div style={{fontSize:'11px',color:muted,marginBottom:'4px'}}>Asunto *</div><input style={inp} placeholder="Describe brevemente el problema" value={form.asunto} onChange={e=>setForm({...form,asunto:e.target.value})}/></div>
            <div style={{marginBottom:'14px'}}><div style={{fontSize:'11px',color:muted,marginBottom:'4px'}}>Descripción detallada *</div><textarea style={{...inp,minHeight:'100px',resize:'vertical'}} placeholder="¿Qué pasó? ¿Cuándo empezó? ¿Qué intentaste?" value={form.descripcion} onChange={e=>setForm({...form,descripcion:e.target.value})}/></div>

            {/* Adjuntos */}
            <div style={{marginBottom:'20px'}}>
              <div style={{fontSize:'11px',color:muted,marginBottom:'8px'}}>Adjuntos — arrastra, selecciona o pega con Ctrl+V</div>
              <label style={{display:'block',padding:'14px',borderRadius:'8px',border:`2px dashed ${border}`,textAlign:'center',cursor:'pointer',fontSize:'13px',color:muted}}>
                + Agregar archivo o captura de pantalla
                <input type="file" style={{display:'none'}} accept="image/*,application/pdf,.doc,.docx" multiple onChange={e=>{if(e.target.files)setPendingFiles(prev=>[...prev,...Array.from(e.target.files!)])}}/>
              </label>
              {pendingFiles.length>0&&<div style={{marginTop:'8px'}}>
                {pendingFiles.map((f,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:'8px',padding:'6px 10px',background:d?'#2f2f2f':'#f0efec',borderRadius:'6px',marginBottom:'4px'}}>
                    <span style={{fontSize:'14px'}}>{f.type.startsWith('image/')?'🖼':'📎'}</span>
                    <span style={{fontSize:'12px',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.name}</span>
                    <span style={{fontSize:'11px',color:muted}}>{(f.size/1024).toFixed(0)}KB</span>
                    <button onClick={()=>setPendingFiles(prev=>prev.filter((_,idx)=>idx!==i))} style={{background:'none',border:'none',cursor:'pointer',color:'#ef4444',fontSize:'16px',padding:'0 4px'}}>×</button>
                  </div>
                ))}
              </div>}
            </div>

            <div style={{display:'flex',gap:'8px'}}>
              <button style={btnP} onClick={createTicket} disabled={loading}>{loading?'Enviando…':'Enviar ticket'}</button>
              <button style={btnS} onClick={()=>setView('home')}>Cancelar</button>
            </div>
          </div>
        </div>}

        {/* MY TICKETS */}
        {view==='tickets'&&<div>
          <div style={{fontSize:'18px',fontWeight:600,marginBottom:'16px'}}>Mis tickets</div>
          <div style={{display:'flex',gap:'8px',marginBottom:'16px',flexWrap:'wrap'}}>
            <input style={{...inp,maxWidth:'240px'}} placeholder="Buscar…" value={filterQ} onChange={e=>setFilterQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&loadMyTickets()}/>
            <select style={{...inp,maxWidth:'180px'}} value={filterEstado} onChange={e=>setFilterEstado(e.target.value)}>
              <option value="">Todos</option>
              <option value="abierto">Abierto</option>
              <option value="asignado">En proceso</option>
              <option value="resuelto">Resuelto</option>
              <option value="cerrado">Cerrado</option>
            </select>
            <button style={btnP} onClick={loadMyTickets}>Buscar</button>
          </div>
          {loading?<div style={{textAlign:'center',color:muted,padding:'40px'}}>Cargando…</div>
            :<div>{myTickets.map(t=><TicketCard key={t.id} t={t}/>)}
              {myTickets.length===0&&<div style={{textAlign:'center',color:muted,padding:'40px',background:surface,borderRadius:'10px',border:`1px solid ${border}`}}>Sin tickets</div>}
            </div>}
        </div>}

        {/* DETAIL */}
        {view==='detail'&&selectedTicket&&<div>
          <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'20px',flexWrap:'wrap'}}>
            <button style={btnS} onClick={()=>setView('home')}>← Volver</button>
            <div style={{fontSize:'18px',fontWeight:600}}>{selectedTicket.id}</div>
            <Badge label={STATE_LABELS[selectedTicket.estado]??selectedTicket.estado} color={STATE_COLORS[selectedTicket.estado]??'#6b7280'}/>
            {selectedTicket.estado==='cerrado'&&selectedTicket.motivo_cierre&&<Badge label={selectedTicket.motivo_cierre} color="#6b7280"/>}
          </div>

          {/* Progress */}
          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:'10px',padding:'20px',marginBottom:'16px'}}>
            <div style={{display:'flex',alignItems:'center'}}>
              {STATUS_STEPS.map((step,i)=>{
                const map:Record<string,string>={abierto:'abierto',asignado:'asignado',en_proceso:'asignado',en_espera_recurso:'asignado',en_espera_confirmacion:'asignado',resuelto:'resuelto',cerrado:'cerrado'}
                const cur=STATUS_STEPS.findIndex(s=>s.key===(map[selectedTicket.estado]??selectedTicket.estado))
                const done=i<cur;const current=i===cur
                const fill=(done||current)?(d?'#fff':'#191919'):'transparent'
                const tc=(done||current)?(d?'#191919':'#fff'):(d?'#555':'#c4c2bc')
                const brd=(done||current)?(d?'#fff':'#191919'):(d?'#3f3f3f':'#e5e4e0')
                return<div key={step.key} style={{display:'flex',alignItems:'center',flex:i<STATUS_STEPS.length-1?1:'none'}}>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'4px'}}>
                    <div style={{width:'24px',height:'24px',borderRadius:'50%',background:fill,border:`2px solid ${brd}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',color:tc}}>{done?'✓':i+1}</div>
                    <span style={{fontSize:'10px',color:(done||current)?text:muted,whiteSpace:'nowrap'}}>{step.label}</span>
                  </div>
                  {i<STATUS_STEPS.length-1&&<div style={{flex:1,height:'2px',background:done?(d?'#fff':'#191919'):(d?'#3f3f3f':'#e5e4e0'),margin:'0 4px',marginBottom:'16px'}}/>}
                </div>
              })}
            </div>
          </div>

          {/* Info */}
          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:'10px',padding:'20px',marginBottom:'16px'}}>
            <div style={{fontSize:'14px',fontWeight:600,marginBottom:'10px'}}>{selectedTicket.asunto}</div>
            <div style={{fontSize:'13px',color:muted,whiteSpace:'pre-wrap',marginBottom:'14px',lineHeight:1.6}}>{selectedTicket.descripcion}</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'12px',borderTop:`1px solid ${border}`,paddingTop:'14px'}}>
              {[['Área',selectedTicket.area],['Categoría',[selectedTicket.categoria,selectedTicket.subcategoria].filter(Boolean).join(' → ')],['Servicio',selectedTicket.servicio],['Técnico','En proceso'],['Creado',fmtDate(selectedTicket.fecha_creacion)],['Actualizado',fmtDate(selectedTicket.fecha_actualizacion)]].map(([k,v])=>(
                <div key={k}><div style={{fontSize:'11px',color:muted}}>{k}</div><div style={{fontSize:'13px',marginTop:'2px'}}>{v||'—'}</div></div>
              ))}
            </div>
          </div>

          {/* Respuesta */}
          {selectedTicket.respuesta_tecnico&&<div style={{background:surface,border:`1px solid ${border}`,borderLeft:`3px solid #10b981`,borderRadius:'10px',padding:'20px',marginBottom:'16px'}}>
            <div style={{fontSize:'12px',color:'#10b981',fontWeight:500,marginBottom:'8px'}}>💬 Respuesta del equipo de soporte</div>
            <div style={{fontSize:'13px',whiteSpace:'pre-wrap',lineHeight:1.6}}>{selectedTicket.respuesta_tecnico}</div>
          </div>}

          {/* Evidencias */}
          <div style={{background:surface,border:`1px solid ${border}`,borderRadius:'10px',padding:'20px'}}>
            <div style={{fontSize:'13px',fontWeight:500,marginBottom:'12px'}}>Evidencias adjuntas</div>
            <label style={{display:'block',padding:'12px',borderRadius:'8px',border:`2px dashed ${border}`,textAlign:'center',cursor:'pointer',fontSize:'12px',color:muted,marginBottom:'10px'}}>
              {uploadingFile?'Subiendo…':'+ Agregar archivo (o pega con Ctrl+V)'}
              <input type="file" style={{display:'none'}} accept="image/*,application/pdf,.doc,.docx" onChange={e=>{const f=e.target.files?.[0];if(f)uploadFileToTicket(f)}} disabled={uploadingFile}/>
            </label>
            {(selectedTicket.evidencias_json??[]).map((ev:any,i:number)=>(
              <div key={i} style={{padding:'8px 12px',background:d?'#2f2f2f':'#f7f6f3',borderRadius:'6px',marginBottom:'6px',display:'flex',alignItems:'center',gap:'8px'}}>
                <span>{ev.name?.match(/\.(png|jpg|jpeg|gif|webp)$/i)?'🖼️':'📎'}</span>
                <a href={ev.url} target="_blank" rel="noreferrer" style={{color:'#3b82f6',fontSize:'12px',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{ev.name??`Archivo ${i+1}`}</a>
                <span style={{fontSize:'11px',color:muted,flexShrink:0}}>{fmtDate(ev.uploadedAt)}</span>
              </div>
            ))}
            {(selectedTicket.evidencias_json??[]).length===0&&<div style={{fontSize:'12px',color:muted,textAlign:'center'}}>Sin evidencias adjuntas</div>}
          </div>
        </div>}

        {/* KB */}
        {view==='kb'&&kbEnabled&&<div>
          <div style={{fontSize:'18px',fontWeight:600,marginBottom:'20px'}}>Base de conocimiento</div>
          {kbSelected?<div>
            <button style={{...btnS,marginBottom:'16px'}} onClick={()=>setKbSelected(null)}>← Volver</button>
            <div style={{background:surface,border:`1px solid ${border}`,borderRadius:'10px',padding:'24px'}}>
              <div style={{fontSize:'16px',fontWeight:600,marginBottom:'6px'}}>{kbSelected.titulo}</div>
              <div style={{fontSize:'12px',color:muted,marginBottom:'20px',padding:'4px 10px',background:d?'#2f2f2f':'#f7f6f3',borderRadius:'6px',display:'inline-block'}}>{kbSelected.categoria}</div>
              <div style={{fontSize:'14px',whiteSpace:'pre-wrap',lineHeight:1.8}}>{kbSelected.contenido}</div>
            </div>
          </div>:<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:'12px'}}>
            {kbItems.map(item=>(
              <div key={item.id} onClick={()=>setKbSelected(item)} style={{background:surface,border:`1px solid ${border}`,borderRadius:'10px',padding:'16px 20px',cursor:'pointer'}}>
                <div style={{fontSize:'13px',fontWeight:500,marginBottom:'6px'}}>{item.titulo}</div>
                <div style={{fontSize:'12px',color:muted}}>{item.categoria}</div>
              </div>
            ))}
            {kbItems.length===0&&<div style={{fontSize:'13px',color:muted}}>Sin artículos disponibles</div>}
          </div>}
        </div>}
      </div>
    </div>
  )
}
